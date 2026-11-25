import * as db from './db.js';
import {canon} from './urlnorm.js';
import {articleId,now} from './util.js';
import {extractArticle} from './extract.js';
import {splitSentences} from './segment.js';
import {translateBatch,batches} from './translate.js';
import {settings} from './settings.js';
import {emit} from './bus.js';
const opening=new Map(), translating=new Map();
export function resumeTranslation(id,ctx={}){
  if(!translating.has(id))translating.set(id,translate(id,ctx).finally(()=>translating.delete(id)));
  return translating.get(id);
}
async function translate(id,ctx){
  const a=await db.get('articles',id);if(!a||a.status!=='ready')return;
  const groups=[[a.title],...a.blocks.map(b=>b.sentences)];
  const limit=ctx.translationLimit??Infinity;
  const save=async fn=>{await db.update('articles',id,fn);emit('article-updated',{id});};
  try{
    for(const group of groups){
      for(const part of batches(group.filter(s=>s.tr===null && s.i<limit),s=>s.text)){
        if((await db.get('articles',id))?.created_at!==a.created_at)return;
        const tr=await translateBatch(part.map(s=>s.text),a.lang,a.target_lang,ctx);
        await save(current=>{
          if(current.created_at!==a.created_at)return current;
          const byIndex=new Map(part.map((s,i)=>[s.i,tr[i]]));
          for(const s of [current.title,...current.blocks.flatMap(b=>b.sentences)])if(byIndex.has(s.i)){
            if(s.tr===null && s.i>=0)current.progress.translated++;
            s.tr=byIndex.get(s.i);
          }
          current.progress.tr_state=current.progress.translated===current.progress.total?'done':'running';
          return current;
        });
      }
    }
  }catch{await save(current=>{if(current.created_at===a.created_at)current.progress.tr_state='paused';return current;});}
}
export async function openArticle(url,meta={},ctx={}){
  const key=canon(url),id=await articleId(key);
  if(!opening.has(id))opening.set(id,build(url,key,id,meta,ctx).finally(()=>opening.delete(id)));
  return opening.get(id);
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
    const data=await extractArticle(url,{...ctx,lang:meta.lang});
    a.lang=data.lang;a.fetched_title=data.title;
    // Readability thường giữ lại tiêu đề làm khối đầu tiên của nội dung → bỏ để tiêu đề không hiện hai lần.
    const same=x=>String(x||'').replace(/\s+/g,'');
    if(data.blocks.length&&same(data.blocks[0].text)===same(data.title))data.blocks=data.blocks.slice(1);
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
    const sentences=texts.map((text,k)=>({i:k-1,text,...analyzed[k],tr:null}));
    let offset=1;
    a.title=sentences[0];a.blocks=blocks.map(b=>({type:b.type,sentences:sentences.slice(offset,offset+=b.count)}));
    const total=texts.length-1;
    a.stats={chars,sentences:total};a.progress={translated:0,total,last_read:-1,tr_state:'running'};a.status='ready';
    if(existing?.progress)a.progress.last_read=Math.min(total-1,existing.progress.last_read);
    await db.transaction(['articles','state'],'readwrite',tx=>{
      tx.objectStore('articles').put(a);
      if(a.lang==='zh')tx.objectStore('state').put({key:scriptKey,value:s.zh_script});
    });
    emit('article-updated',{id});
    if(translating.has(id))void translating.get(id).then(()=>resumeTranslation(id,ctx));
    else void resumeTranslation(id,ctx);
    return id;
  }catch(e){a.status='error';a.error='Không mở được bài: '+e.message;if(!existing||existing.status!=='ready')await db.put('articles',a);throw Error(a.error);}
}
