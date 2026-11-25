import * as db from './db.js';
import {canon} from './urlnorm.js';
import {articleId,now} from './util.js';
import {extractArticle} from './extract.js';
import {splitSentences} from './segment.js';
import {translateBatch,batches,needsTranslation} from './translate.js';
import {settings} from './settings.js';
import {emit} from './bus.js';
const opening=new Map(), translating=new Map();
const hasMissingTranslation=a=>!a.title.tr||a.blocks.some(b=>b.sentences.some(s=>!s.tr));
export const isOpeningArticle=canon=>opening.has(canon);
export async function translateOnReaderOpen(id,ctx={}){
  const active=translating.get(id);
  const article=await db.get('articles',id);
  if(article?.progress.tr_state==='paused')return resumeTranslation(id,ctx);
  if(active)await active;
  const latest=await db.get('articles',id);
  if(latest?.progress.tr_state==='running'||(latest?.progress.tr_state==='done'&&hasMissingTranslation(latest))){
    return resumeTranslation(id,ctx);
  }
}
export function resumeTranslation(id,ctx={}){
  if(!translating.has(id))translating.set(id,translate(id,ctx).finally(()=>translating.delete(id)));
  return translating.get(id);
}
async function translate(id,ctx){
  const a=await db.get('articles',id);if(!a||a.status!=='ready')return;
  const s=ctx.settings||await settings();
  if(!needsTranslation(a.lang,a.target_lang,s)||(a.progress.tr_state==='done'&&!hasMissingTranslation(a)))return;
  // Tiêu đề dịch riêng trước (cho thẻ đề xuất); thân bài gom nhiều đoạn vào lô ≤ 4 500 ký tự để ít lượt gọi.
  const groups=[[a.title],a.blocks.flatMap(b=>b.sentences)];
  const limit=ctx.translationLimit??Infinity;
  const save=async fn=>{await db.update('articles',id,current=>current.created_at===a.created_at?fn(current):current);emit('article-updated',{id});};
  const complete=a=>!!a.title.tr&&a.progress.translated===a.progress.total;
  try{
    await save(current=>{
      current.progress.translated=groups[1].filter(s=>s.tr).length;
      current.progress.tr_state=complete(current)?'done':'running';
      return current;
    });
    for(const group of groups){
      for(const part of batches(group.filter(s=>!s.tr && s.i<limit),s=>s.text)){
        if((await db.get('articles',id))?.created_at!==a.created_at)return;
        const tr=await translateBatch(part.map(s=>s.text),a.lang,a.target_lang,ctx);
        await save(current=>{
          const byIndex=new Map(part.map((s,i)=>[s.i,tr[i]]));
          for(const s of [current.title,...current.blocks.flatMap(b=>b.sentences)])if(byIndex.has(s.i)){
            if(!s.tr&&s.i>=0)current.progress.translated++;
            s.tr=byIndex.get(s.i);
          }
          if(complete(current))current.progress.tr_state='done';
          return current;
        });
      }
    }
  }catch{await save(current=>{current.progress.tr_state='paused';return current;});}
}
export async function extractContent(url,ctx){
  const data=await extractArticle(url,ctx);
  // Readability can keep a copy of the title at the start of the body.
  const compact=text=>text.replace(/\s+/g,'');
  if(data.blocks.length&&compact(data.blocks[0].text)===compact(data.title))data.blocks=data.blocks.slice(1);
  return data;
}
export async function openArticle(url,meta={},ctx={}){
  const key=canon(url);
  if(!opening.has(key))opening.set(key,articleId(key).then(id=>build(url,key,id,meta,ctx)).finally(()=>opening.delete(key)));
  return opening.get(key);
}
async function build(url,key,id,meta,ctx){
  const s=ctx.settings||await settings(), existing=await db.get('articles',id);
  const scriptKey='zh_script:'+id;
  const sameScript=existing?.lang!=='zh'||(await db.state(scriptKey))===s.zh_script;
  if(existing?.status==='ready' && existing.target_lang===s.target_lang && sameScript){
    if(existing.progress.tr_state==='running')void resumeTranslation(id,ctx);
    return id;
  }
  const a={id,url,canon:key,lang:meta.lang||null,source_id:meta.source_id||null,target_lang:s.target_lang,status:'loading',error:null,created_at:now(),fetched_title:meta.title||''};
  try{
    emit('load-status','Đang lấy bài…');
    const data=ctx.extracted||await extractContent(url,{...ctx,lang:meta.lang});
    a.lang=data.lang;a.fetched_title=data.title;
    let convert=x=>x;
    if(a.lang==='zh' && s.zh_script!=='orig'){
      const cc=ctx.opencc||await import('../vendor/opencc/full.js');
      convert=cc.Converter(s.zh_script==='hant'?{from:'cn',to:'tw'}:{from:'tw',to:'cn'});
    }
    const texts=[convert(data.title)],blocks=[];let chars=0;
    for(const b of data.blocks){
      const full=convert(b.text),text=full.slice(0,60000-chars);
      if(text){const parts=splitSentences(text,a.lang);texts.push(...parts);blocks.push({type:b.type,count:parts.length});chars+=text.length;}
      if(text.length<full.length){texts.push('(Bài quá dài — đã cắt bớt phần cuối.)');blocks.push({type:'p',count:1});break;}
    }
    emit('load-status','Đang phân tích câu…');
    const analyze=ctx.analyze||(await import('../nlp/client.js')).analyze;
    const analyzed=await analyze(a.lang,texts,s);
    const bilingual=needsTranslation(a.lang,a.target_lang,s);
    const sentences=texts.map((text,k)=>({i:k-1,text,...analyzed[k],tr:bilingual?null:''}));
    let offset=1;
    a.title=sentences[0];a.blocks=blocks.map(b=>({type:b.type,sentences:sentences.slice(offset,offset+=b.count)}));
    const total=texts.length-1;
    a.stats={chars,sentences:total};a.progress={translated:bilingual?0:total,total,last_read:-1,tr_state:bilingual?'running':'done'};a.status='ready';
    if(existing?.progress)a.progress.last_read=Math.min(total-1,existing.progress.last_read);
    let discarded=false;
    const stores=['articles','state',...(ctx.suggestion?['candidates','skipped','history']:[])];
    await db.transaction(stores,'readwrite',tx=>{
      const save=()=>{
        tx.objectStore('articles').put(a);
        if(a.lang==='zh')tx.objectStore('state').put({key:scriptKey,value:s.zh_script});
      };
      if(!ctx.suggestion){save();return;}
      const candidate=tx.objectStore('candidates').get(key);
      const skipped=tx.objectStore('skipped'),link=skipped.get(key),series=skipped.get('series:'+a.source_id);
      const read=tx.objectStore('history').get(key);
      read.onsuccess=()=>{
        discarded=candidate.result?.status!=='new'||!!(link.result||series.result||read.result);
        if(!discarded)save();
      };
    });
    if(discarded)return id;
    emit('article-updated',{id});
    if(bilingual){
      if(translating.has(id))void translating.get(id).then(()=>resumeTranslation(id,ctx));
      else void resumeTranslation(id,ctx);
    }
    return id;
  }catch(e){a.status='error';a.error='Không mở được bài: '+e.message;if(!ctx.suggestion&&existing?.status!=='ready')await db.put('articles',a);throw Error(a.error);}
}
