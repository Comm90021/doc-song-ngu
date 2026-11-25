import {canon} from '../core/urlnorm.js';
export function candidate(s,ctx,url,title,extra={}){
  return {canon:canon(url),url,title,lang:s.lang,source_id:s.id,kind:s.kind,topics:s.topics||[],series:null,seq:null,published_at:null,fetched_at:ctx.now,est_chars:null,status:'new',...extra};
}
