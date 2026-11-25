import {wikiAPI} from '../core/extract.js';
import {candidate} from './candidate.js';
import {pageURL} from './wikipedia.js';
// prop=links returns titles alphabetically, so the chapter order comes from the index page HTML.
export function seriesTitles(html,index,DOMParser=globalThis.DOMParser){
  const doc=new DOMParser().parseFromString(html,'text/html'), prefix=index+'/', seen=new Set(), out=[];
  for(const a of doc.querySelectorAll('a[href]')){
    const m=/^\/wiki\/([^?#]+)/.exec(a.getAttribute('href')||'');
    if(!m)continue;
    let title;
    try{title=decodeURIComponent(m[1]).replace(/_/g,' ');}catch{continue;}
    if(!title.startsWith(prefix)||seen.has(title))continue;
    seen.add(title);out.push(title);
  }
  return out;
}
export async function refresh(s,ctx){
  if((await ctx.db.index('candidates','source_id',s.id)).length)return [];
  const host=s.wiki+'.wikisource.org';
  const data=await ctx.net.fetchJSON(wikiAPI(host,{action:'parse',page:s.index,prop:'text'}),{direct:true});
  return seriesTitles(data.parse.text,s.index,ctx.DOMParser).map((title,i)=>candidate(s,ctx,pageURL(host,title),title,{series:s.id,seq:i+1}));
}
