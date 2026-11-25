import {wikiAPI} from '../core/extract.js';
import {candidate} from './candidate.js';
export const pageURL=(host,title)=>'https://'+host+'/wiki/'+title.replace(/ /g,'_').split('/').map(encodeURIComponent).join('/');
export async function refresh(s,ctx){
  const host=s.wiki+'.wikipedia.org';
  if(s.kind==='wikipedia_featured'){
    const date=ctx.now.slice(0,10).replace(/-/g,'/');
    let data;
    for(const base of ['https://api.wikimedia.org/feed/v1/wikipedia/'+s.wiki+'/featured/','https://'+host+'/api/rest_v1/feed/featured/']){
      try{data=await ctx.net.fetchJSON(base+date,{direct:true});if(data.tfa)break;}catch(e){if(base.includes(host))throw e;}
    }
    const t=data?.tfa;return t?[candidate(s,ctx,pageURL(host,t.title),t.normalizedtitle||t.title,{published_at:ctx.now.slice(0,10)})]:[];
  }
  const data=await ctx.net.fetchJSON(wikiAPI(host,{action:'query',list:'search',srsearch:s.query,srsort:'random',srlimit:s.per_refresh||10,srnamespace:0,srprop:'size'}),{direct:true});
  return data.query.search.map(t=>candidate(s,ctx,pageURL(host,t.title),t.title));
}
