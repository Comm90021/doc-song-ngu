import * as db from './db.js';
import {settings} from './settings.js';
import {quickLookup} from './translate.js';
function english(surface){
  const s=surface.toLowerCase().replace(/’/g,"'"),forms=new Set([s,s.replace(/'s$/,'')]);
  for(const [end,variants] of Object.entries({ies:['y'],es:[''],s:[''],ed:['','e'],d:[''],ing:['','e'],er:['','e'],est:['','e']})){
    if(s.endsWith(end)){const stem=s.slice(0,-end.length);for(const tail of variants)forms.add(stem+tail);if(/(.)\1$/.test(stem))forms.add(stem.slice(0,-1));}
  }
  return [...forms];
}
export async function lookupWord({lang,lemma,surface,reading},ctx={}){
  const head=k=>db.index('dict','lang+head',[lang,k],3);
  let found=[];
  async function first(keys,fn){for(const k of new Set(keys.filter(Boolean))){found=await fn(k);if(found.length)return;}}
  await first([lemma,surface],head);
  if(!found.length)await first([lemma,surface],k=>db.index('dict','alts',lang+':'+k,3));
  if(!found.length && lang==='ja' && reading)found=await db.index('dict','lang+reading',[lang,reading],3);
  if(!found.length && lang==='ko')await first([...surface].map((_,i)=>surface.slice(0,surface.length-i)),head);
  if(!found.length && lang==='en')await first(english(surface),head);
  if(!found.length && lang==='zh')for(const c of new Set(surface)){found.push(...await head(c));if(found.length>=3)break;}
  const entries=[];
  for(const e of found.slice(0,3)){
    const m=await db.get('dict_meta',e.pack);
    if(m)entries.push({head:e.head,alts:e.alts.map(a=>a.slice(lang.length+1)),reading:e.reading,pos:e.pos,senses:e.senses.slice(0,5),gloss_lang:m.gloss_lang,source:m.name,license:m.license});
  }
  const s=ctx.settings||await settings();let quick=null;
  if(s.quick_tr==='always'||(s.quick_tr==='auto'&&!entries.length)){
    try{quick=await quickLookup(lemma||surface,lang,s.target_lang,{...ctx,settings:s});}catch{}
  }
  return {entries,quick};
}
