import * as db from './db.js';
import * as net from './net.js';
import {now} from './util.js';
import {emit} from './bus.js';
import {sources,adapters} from '../sources/registry.js';
import {settings} from './settings.js';
import {extractContent,isOpeningArticle,openArticle} from './article.js';
import {fits,minChars} from './recommend.js';
import {rebuild} from './store.js';

const day=86400000;
const pending=new Set(),preparingArticles=new Map();
let refreshing;
let progress={running:false,completed:0,total:0};
export const refreshProgress=()=>progress;
function report(running,completed,total){
  progress={running,completed,total};
  emit('refresh-status',progress);
}
export function maybeRefresh(force=false,ctx={}){
  return refreshing ||= refresh(force,ctx).finally(()=>refreshing=null);
}
async function refresh(force,ctx){
  let completed=0,total=0;
  const stamp=now(),last=await db.state('last_refresh');
  if(!force&&Date.parse(stamp)-Date.parse(last)<6*3600000)return;
  try{
    const s=ctx.settings||await settings();
    const todo=(ctx.sources||await sources()).filter(src=>s['source:'+src.id]??src.enabled);
    const results=todo.map(()=>[]);
    total=todo.length;
    report(true,completed,total);
    let next=0;
    async function worker(){
      while(next<total){
        const i=next++,src=todo[i];
        const status=await db.get('source_status',src.id)||{source_id:src.id,last_ok:null,items:0};
        try{
          results[i]=await refreshSource(src,{...ctx,db,net:ctx.net||net,settings:s,now:stamp});
          Object.assign(status,{last_ok:stamp,last_error:null,items:results[i].length});
        }catch(e){status.last_error=e.message;}
        await db.put('source_status',status);
        report(true,++completed,total);
      }
    }
    const workers=await Promise.allSettled([worker(),worker(),worker()]);
    const failure=workers.find(w=>w.status==='rejected');
    if(failure)throw failure.reason;
    await savePool(results,stamp,s);
  }finally{
    report(false,completed,total);
  }
}
async function refreshSource(src,ctx){
  const controller=new AbortController(),signal=controller.signal;
  const timeout=setTimeout(()=>controller.abort(Error('Hết thời gian cập nhật nguồn')),ctx.sourceTimeoutMs??30000);
  const deadline=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  try{return await Promise.race([deadline,adapters[src.kind](src,{...ctx,signal})]);}
  finally{clearTimeout(timeout);}
}
function savePool(results,stamp,s){
  // Bài đã biết là không vừa độ dài đang chọn thì xóa trước tiên khi kho vượt giới hạn.
  const misfit=c=>c.est_chars!=null&&!fits(c.est_chars,s?.length);
  const stores=['candidates','history','skipped','articles','state'];
  return db.transaction(stores,'readwrite',tx=>{
    const store=tx.objectStore('candidates');
    const [candidates,history,skipped,articles]=stores.slice(0,4).map(name=>tx.objectStore(name).getAll());
    const state=tx.objectStore('state');
    const current=state.get('current_suggestion'),pins=state.get('suggestion_pins');
    pins.onsuccess=()=>{
      const protectedKeys=new Set([current.result?.value,...Object.values(pins.result?.value||{}),
        ...articles.result.filter(a=>a.status!=='error').map(a=>a.canon)]);
      const isProtected=c=>protectedKeys.has(c.canon)||pending.has(c.canon)||
        preparingArticles.has(c.canon)||isOpeningArticle(c.canon);
      // Keep existing keys reserved for this refresh, including entries pruned below.
      const seen=new Set(candidates.result.map(c=>c.canon));
      const read=new Set(history.result.map(h=>h.canon)),skip=new Set(skipped.result.map(s=>s.key));
      const byLang=new Map();
      const unread=c=>c.status==='new'&&!read.has(c.canon)&&!skip.has(c.canon)&&!skip.has('series:'+c.source_id);
      const keep=c=>{
        if(!unread(c))return;
        if(!byLang.has(c.lang))byLang.set(c.lang,[]);
        byLang.get(c.lang).push(c);
      };
      for(const c of candidates.result){
        if(c.kind==='rss'&&Date.parse(stamp)-Date.parse(c.fetched_at)>14*day&&!isProtected(c))store.delete(c.canon);
        else keep(c);
      }
      const added=new Map(),positions=results.map(()=>0);
      let more=true;
      while(more){
        more=false;
        for(const [i,rows] of results.entries()){
          while(positions[i]<rows.length){
            const c=rows[positions[i]++];
            if((added.get(c.lang)||0)>=25)break;
            if(seen.has(c.canon)||!unread(c))continue;
            seen.add(c.canon);
            store.put(c);keep(c);
            added.set(c.lang,(added.get(c.lang)||0)+1);
            more=true;
            break;
          }
        }
      }
      for(const rows of byLang.values()){
        const excess=rows.length-75;
        if(excess<=0)continue;
        const evictable=rows.filter(c=>!isProtected(c)).sort((a,b)=>
          Number(misfit(b))-Number(misfit(a))||
          Number(b.kind==='rss')-Number(a.kind==='rss')||
          (a.fetched_at||'').localeCompare(b.fetched_at||'')||(b.seq||0)-(a.seq||0));
        for(const c of evictable.slice(0,excess))store.delete(c.canon);
      }
      state.put({key:'last_refresh',value:stamp});
    };
  });
}

export async function prefetchSuggestion(c,s,ctx,preparing){
  pending.add(c.canon);
  try{
    const cached=(await db.index('articles','canon',c.canon)).find(a=>a.status==='ready');
    const active=preparingArticles.get(c.canon);
    const estimate=c.est_chars??active?.est_chars??cached?.stats?.chars;
    if((cached||active)&&estimate>=minChars(c.lang)&&fits(estimate,s.length)){
      if(c.est_chars==null)await db.update('candidates',c.canon,row=>({...row,est_chars:estimate}));
      return {...c,est_chars:estimate};
    }
    preparing();
    let extracted;
    try{extracted=await extractContent(c.url,{...ctx,lang:c.lang});}
    catch{
      await db.update('candidates',c.canon,row=>({...row,status:'bad'}));
      return null;
    }
    const chars=extracted.blocks.reduce((n,b)=>n+b.text.length,0);
    const short=chars<minChars(c.lang);
    await db.update('candidates',c.canon,row=>({...row,est_chars:chars,status:short?'bad':row.status}));
    if(short||!fits(chars,s.length))return null;
    // Save the validated candidate before doing NLP in the background.
    return {...c,est_chars:chars,extracted};
  }finally{pending.delete(c.canon);}
}
export async function prepareSuggestion(c,s,ctx={}){
  const {extracted,...candidate}=c;
  preparingArticles.set(c.canon,candidate);
  try{return await openArticle(candidate.url,candidate,{...ctx,settings:s,extracted,translationLimit:20,suggestion:true});}
  finally{preparingArticles.delete(c.canon);}
}
export async function startup(){await rebuild();await maybeRefresh();}
