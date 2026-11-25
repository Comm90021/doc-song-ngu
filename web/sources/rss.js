import {candidate} from './candidate.js';
export async function refresh(source,ctx){
  const {text}=await ctx.net.fetchText(source.url);
  const Parser=ctx.DOMParser||globalThis.DOMParser;
  const doc=new Parser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('Nguồn XML không hợp lệ');
  const out=[];
  for(const node of [...doc.querySelectorAll('item,entry')].slice(0,30)){
    const link=node.querySelector('link[rel="alternate"], link:not([rel])');
    const value=link?.getAttribute('href')||link?.textContent;
    if(!value?.trim())continue;
    const url=new URL(value.trim(),source.url);
    if(!['http:','https:'].includes(url.protocol))continue;
    const date=Date.parse(node.querySelector('pubDate,published,updated')?.textContent);
    out.push(candidate(source,ctx,url.href,node.querySelector('title')?.textContent.trim()||url.hostname,{published_at:Number.isFinite(date)?new Date(date).toISOString():null}));
  }
  return out;
}
