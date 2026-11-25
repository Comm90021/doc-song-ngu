import * as db from './db.js';
import {articleId,now} from './util.js';
import {settings} from './settings.js';
import {sources} from '../sources/registry.js';
import {appendLedger} from './store.js';
import {emit} from './bus.js';
import {prefetchSuggestion,prepareSuggestion} from './jobs.js';

const pick=items=>items[Math.floor(Math.random()*items.length)];
const kinds=['news','encyclopedia','literature'];
const category=c=>c.kind==='rss'?'news':c.kind.startsWith('wikipedia')?'encyclopedia':'literature';
export const minChars=lang=>lang==='en'?1500:800;
export const fits=(chars,length)=>chars==null||length==='any'||(length==='long'?chars>8000:chars<=(length==='short'?2500:8000));

export async function eligibleCandidates(s,list){
  const [history,skipped,candidates]=await Promise.all([db.all('history'),db.all('skipped'),db.all('candidates')]);
  const enabled=new Set(list.filter(x=>s['source:'+x.id]??x.enabled).map(x=>x.id));
  const excluded=new Set([...history.map(h=>h.canon),...skipped.map(x=>x.key)]);
  const eligible=candidates.filter(c=>c.status==='new'&&enabled.has(c.source_id)&&s.langs.includes(c.lang)&&
    c.topics.some(t=>s.topics.includes(t))&&!excluded.has(c.canon)&&!excluded.has('series:'+c.source_id));
  const first=new Map();
  for(const c of eligible)if(c.series&&(!first.has(c.series)||c.seq<first.get(c.series).seq))first.set(c.series,c);
  return {history,pool:eligible.filter(c=>(!c.series||first.get(c.series)===c)&&fits(c.est_chars,s.length))};
}

let queue=Promise.resolve(),lastFilter={lang:'all',kind:'all'};
const requests=new Map();
export function getSuggestion(filter='all',ctx={}){
  const selected=typeof filter==='string'?{lang:filter,kind:'all'}:filter;
  lastFilter=selected;
  const key=selected.lang+':'+selected.kind;
  if(requests.has(key))return requests.get(key);
  const task=queue.then(()=>choose(selected,ctx)).finally(()=>requests.delete(key));
  requests.set(key,task);queue=task.catch(()=>{});
  return task;
}
async function choose(filter,ctx){
  const [s,list,current]=await Promise.all([
    ctx.settings||settings(),ctx.sources||sources(),db.state('current_suggestion')
  ]);
  const attempted=new Set();
  const pins=await db.state('suggestion_pins')||{};
  // Một loại bài toàn bài không vừa độ dài (vd. Aozora quá dài) không được chiếm hết lượt thử:
  // hỏng 3 lần trong một lượt chọn thì chuyển sang loại/thứ tiếng khác.
  const failed=new Map(),slot=c=>c.lang+':'+category(c),fails=c=>failed.get(slot(c))||0;
  for(let i=0;i<8;i++){
    const {history,pool}=await eligibleCandidates(s,list);
    const all=pool.filter(c=>!attempted.has(c.canon)&&
      (filter.lang==='all'||filter.lang===c.lang)&&(filter.kind==='all'||filter.kind===category(c)));
    if(!all.length)break;
    const fresh=all.filter(c=>fails(c)<3),matching=fresh.length?fresh:all;

    const view=filter.lang+':'+filter.kind;
    let c=matching.find(c=>c.canon===pins[view])||matching.find(c=>c.canon===current);
    if(!c){
      const latest=lang=>Math.max(0,...history.filter(h=>h.lang===lang).map(h=>Date.parse(h.finished_at)||0));
      const langs=[...new Set(matching.map(c=>c.lang))],oldest=Math.min(...langs.map(latest));
      const lang=pick(langs.filter(l=>latest(l)===oldest));
      const after=kinds.indexOf(await db.state('suggestion_kind:'+lang));
      for(let j=1;j<=kinds.length;j++){
        const kind=kinds[(after+j)%kinds.length],items=matching.filter(c=>c.lang===lang&&category(c)===kind);
        if(!items.length)continue;
        c=kind==='news'?items.sort((a,b)=>(b.published_at||'').localeCompare(a.published_at||''))[0]:pick(items);
        break;
      }
    }
    attempted.add(c.canon);
    const validated=await prefetchSuggestion(c,s,ctx,()=>emit('suggestion-preparing',{filter,lang:c.lang}));
    if(!validated){failed.set(slot(c),fails(c)+1);continue;}
    const {extracted,...chosen}=validated;
    let published=false;
    await db.transaction(['candidates','history','skipped','state'],'readwrite',tx=>{
      const candidate=tx.objectStore('candidates').get(c.canon);
      const read=tx.objectStore('history').get(c.canon);
      const skipped=tx.objectStore('skipped');
      const skip=skipped.get(c.canon),series=skipped.get('series:'+c.source_id);
      const state=tx.objectStore('state');
      const result=state.get('suggestion_pins');
      result.onsuccess=()=>{
        if(candidate.result?.status!=='new'||read.result||skip.result||series.result)return;
        published=true;
        state.put({key:'current_suggestion',value:c.canon});
        if(c.canon!==current&&c.canon!==pins[view])state.put({key:'suggestion_kind:'+c.lang,value:category(c)});
        state.put({key:'suggestion_pins',value:{...result.result?.value,[view]:c.canon}});
      };
    });
    if(!published)continue;
    if(extracted)void prepareSuggestion(validated,s,ctx).catch(()=>{});
    if(c.canon!==current)emit('suggestion-changed',chosen);
    return chosen;
  }
  return null;
}
async function discard(a,ctx){
  const c=await db.get('candidates',a.canon);
  await db.put('skipped',{key:c?.series?'series:'+c.source_id:a.canon,at:now()});
  await clear(a);
  if(ctx.next!==false)return getSuggestion(lastFilter,ctx);
}
async function clear(a){
  const id=a.id||await articleId(a.canon);
  await db.transaction(['articles','state'],'readwrite',tx=>{
    tx.objectStore('articles').delete(id);
    const store=tx.objectStore('state'),current=store.get('current_suggestion'),pins=store.get('suggestion_pins');
    current.onsuccess=()=>{if(current.result?.value===a.canon)store.delete('current_suggestion');};
    pins.onsuccess=()=>{
      const keep=Object.entries(pins.result?.value||{}).filter(([,canon])=>canon!==a.canon);
      store.put({key:'suggestion_pins',value:Object.fromEntries(keep)});
    };
  });
}
export async function skipSuggestion(ctx={}){
  const key=ctx.suggestion?.canon||await db.state('current_suggestion');if(key)return discard({canon:key},ctx);
  return getSuggestion(lastFilter,ctx);
}
export async function abandonArticle(id,ctx={}){const a=await db.get('articles',id);if(a)return discard(a,ctx);}
export async function finishArticle(id,ctx={}){
  const a=await db.get('articles',id);
  if(!a||a.progress.last_read<a.progress.total-1)throw Error('NOT_FINISHED');
  const e={url:a.url,canon:a.canon,title:a.title.text,title_tr:a.title.tr||'',lang:a.lang,source_id:a.source_id,finished_at:now()};
  await appendLedger(e);await db.put('history',e);await clear(a);
  if(ctx.next!==false)return getSuggestion(lastFilter,ctx);
}
