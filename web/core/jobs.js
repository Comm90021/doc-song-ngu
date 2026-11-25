import * as db from './db.js';
import * as net from './net.js';
import {now,articleId} from './util.js';
import {emit} from './bus.js';
import {sources,adapters} from '../sources/registry.js';
import {settings} from './settings.js';
import {openArticle} from './article.js';
import {fits,getSuggestion,minChars} from './recommend.js';
import {rebuild} from './store.js';
let refreshing;
export function maybeRefresh(force=false,ctx={}){
  return refreshing ||= refresh(force,ctx).finally(()=>refreshing=null);
}
async function refresh(force,ctx){
  const stamp=now(),last=await db.state('last_refresh');
  if(!force && Date.now()-Date.parse(last)<21600000)return;
  const s=await settings(),todo=(ctx.sources||await sources()).filter(src=>s['source:'+src.id]??src.enabled);
  emit('refresh-status',{running:true});
  async function worker(){
    while(todo.length){
      const src=todo.shift(),status=await db.get('source_status',src.id)||{source_id:src.id,last_ok:null,items:0};
      try{
        const rows=await adapters[src.kind](src,{db,net,settings:s,now:stamp,...ctx});
        for(const row of rows){const old=await db.get('candidates',row.canon);if(old){row.status=old.status;row.est_chars=old.est_chars??row.est_chars;}}
        await db.batch('candidates',rows);Object.assign(status,{last_ok:stamp,last_error:null,items:rows.length});
      }catch(e){status.last_error=e.message;}
      await db.put('source_status',status);
    }
  }
  try{
    await Promise.all([worker(),worker(),worker()]);
    for(const c of await db.all('candidates'))if(c.kind==='rss' && Date.now()-Date.parse(c.fetched_at)>30*86400000 && !await db.get('history',c.canon))await db.del('candidates',c.canon);
    await db.setState('last_refresh',stamp);
  }finally{emit('refresh-status',{running:false});}
}
const pending=new Map();
export function prefetchSuggestion(c,filter='all',ctx={}){
  if(!c)return;
  if(!pending.has(c.canon))pending.set(c.canon,prefetch(c,filter,ctx).finally(()=>pending.delete(c.canon)));
  return pending.get(c.canon);
}
async function prefetch(c,filter,ctx){
  let a;
  try{const id=await openArticle(c.url,c,ctx);a=await db.get('articles',id);}
  catch{await db.update('candidates',c.canon,row=>({...row,status:'bad'}));}
  if(a)await db.update('candidates',c.canon,row=>({...row,est_chars:a.stats.chars}));
  const short=!!a&&a.stats.chars<minChars(a.lang);
  if(short)await db.update('candidates',c.canon,row=>({...row,status:'bad'}));
  if(await db.state('current_suggestion')!==c.canon){
    if(short||await db.get('skipped',c.canon)||await db.get('skipped','series:'+c.source_id)||await db.get('history',c.canon))await db.del('articles',await articleId(c.canon));
    return;
  }
  if(!a||short||!fits(a.stats.chars,(await settings()).length)){
    await db.del('articles',await articleId(c.canon));await db.del('state','current_suggestion');
    const attempt=(ctx.attempt||1)+1;
    if(attempt<=5)await getSuggestion(filter,{...ctx,attempt});else emit('suggestion-changed',null);
  }
}
export async function startup(){await rebuild();await maybeRefresh();}
