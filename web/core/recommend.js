import * as db from './db.js';
import {articleId,now} from './util.js';
import {settings} from './settings.js';
import {sources} from '../sources/registry.js';
import {appendLedger} from './store.js';
import {emit} from './bus.js';
const pick=items=>items[Math.floor(Math.random()*items.length)];
export const minChars=lang=>lang==='en'?1500:800;
export const fits=(chars,length)=>!chars||length==='any'||(length==='long'?chars>8000:chars<=(length==='short'?2500:8000));
let queue=Promise.resolve(), lastFilter='all';
export function getSuggestion(filter='all',ctx={}){
  lastFilter=filter;
  const task=queue.then(()=>choose(filter,ctx));queue=task.catch(()=>{});return task;
}
async function choose(filter,ctx){
  const [s,list,history,skipped,candidates,current]=await Promise.all([settings(),ctx.sources||sources(),db.all('history'),db.all('skipped'),db.all('candidates'),db.state('current_suggestion')]);
  const enabled=new Set(list.filter(x=>s['source:'+x.id]??x.enabled).map(x=>x.id));
  const excluded=new Set([...history.map(h=>h.canon),...skipped.map(x=>x.key)]);
  const eligible=candidates.filter(c=>c.status==='new'&&enabled.has(c.source_id)&&s.langs.includes(c.lang)&&(filter==='all'||filter===c.lang)&&c.topics.some(t=>s.topics.includes(t))&&!excluded.has(c.canon)&&!excluded.has('series:'+c.source_id));
  const first=new Map();
  for(const c of eligible)if(c.series&&(!first.has(c.series)||c.seq<first.get(c.series).seq))first.set(c.series,c);
  const pool=eligible.filter(c=>(!c.series||first.get(c.series)===c)&&fits(c.est_chars,s.length));
  let chosen=pool.find(c=>c.canon===current);
  if(!chosen && pool.length){
    const latest=lang=>Math.max(0,...history.filter(h=>h.lang===lang).map(h=>Date.parse(h.finished_at)||0));
    const langs=[...new Set(pool.map(c=>c.lang))], oldest=Math.min(...langs.map(latest));
    const lang=pick(langs.filter(l=>latest(l)===oldest)), matching=pool.filter(c=>c.lang===lang);
    const groups=[[.5,matching.filter(c=>c.kind==='rss')],[.3,matching.filter(c=>c.kind.startsWith('wikipedia'))],[.2,matching.filter(c=>['aozora','wikisource_series'].includes(c.kind))]].filter(([,a])=>a.length);
    let r=Math.random()*groups.reduce((n,[w])=>n+w,0);
    for(const [weight,items] of groups){r-=weight;if(r<=0||items===groups[groups.length-1][1]){
      chosen=items[0].kind==='rss'?items.sort((a,b)=>(b.published_at||'').localeCompare(a.published_at||''))[0]:pick(items);break;
    }}
  }
  if((chosen?.canon||null)!==(current||null)){
    await db.setState('current_suggestion',chosen?.canon||null);emit('suggestion-changed',chosen);
  }
  if(chosen && ctx.prefetch!==false)void import('./jobs.js').then(j=>j.prefetchSuggestion(chosen,filter,ctx)).catch(()=>{});
  return chosen||null;
}
async function discard(a,ctx){
  const c=await db.get('candidates',a.canon);
  await db.put('skipped',{key:c?.series?'series:'+c.source_id:a.canon,at:now()});
  await clear(a);
  return getSuggestion(lastFilter,ctx);
}
async function clear(a){
  await db.del('articles',a.id||await articleId(a.canon));
  if(await db.state('current_suggestion')===a.canon)await db.del('state','current_suggestion');
}
export async function skipSuggestion(ctx={}){
  const key=await db.state('current_suggestion');if(key)return discard({canon:key},ctx);
  return getSuggestion(lastFilter,ctx);
}
export async function abandonArticle(id,ctx={}){const a=await db.get('articles',id);if(a)return discard(a,ctx);}
export async function finishArticle(id,ctx={}){
  const a=await db.get('articles',id);
  if(!a||a.progress.last_read<a.progress.total-1)throw Error('NOT_FINISHED');
  const e={url:a.url,canon:a.canon,title:a.title.text,title_tr:a.title.tr||'',lang:a.lang,source_id:a.source_id,finished_at:now()};
  await appendLedger(e);await db.put('history',e);await clear(a);return getSuggestion(lastFilter,ctx);
}
