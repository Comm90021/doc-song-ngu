import {sleep,httpURL} from './util.js';
export const IS_NATIVE=!!globalThis.Capacitor?.isNativePlatform?.();
export const plugin=name=>globalThis.Capacitor?.Plugins?.[name] || globalThis.Capacitor?.registerPlugin?.(name);
let mode=IS_NATIVE?'native':typeof window==='undefined'?'node':'pc';
export function configureNet(options){mode=options.mode;}
const userAgent='Mozilla/5.0 DocSongNgu/0.1';
const wikiHost=/\.(?:wikipedia|wikimedia|wikisource)\.org$/;
const released=new Map(),chain=new Map();
// Per-host queue for Wikimedia: each request waits for the previous one's release, then 1 000 ms (+2 ms guard
// for timer and clock granularity), so measured request starts are >= 1 000 ms apart.
export function paceHost(hostname){
  if(!wikiHost.test(hostname))return Promise.resolve();
  const next=(chain.get(hostname)||Promise.resolve()).then(async()=>{
    const at=Math.max(Date.now(),(released.get(hostname)||0)+1002);
    while(Date.now()<at)await sleep(at-Date.now());
    released.set(hostname,Date.now());
  });
  chain.set(hostname,next.catch(()=>{}));
  return next;
}
export async function fetchBytes(value,{method='GET',headers={},body,timeoutMs=20000,direct=false,retries=3,signal}={}){
  const url=httpURL(value);
  headers={...headers};
  if (wikiHost.test(url.hostname)) headers['Api-User-Agent']='DocSongNgu/0.1 (personal reading app)';
  for(let attempt=0;;attempt++){
    signal?.throwIfAborted();
    let result;
    await paceHost(url.hostname);
    signal?.throwIfAborted();
    if(mode==='native' && !direct){
      const res=await plugin('CapacitorHttp').request({url:url.href,method,headers:{'User-Agent':userAgent,...headers},data:body,responseType:'arraybuffer',connectTimeout:timeoutMs,readTimeout:timeoutMs});
      const h=new Headers(res.headers);
      const contentType=h.get('content-type')||'';
      // Capacitor parses application/json before consulting responseType on Android.
      const bytes=typeof res.data!=='string'||contentType.includes('application/json')
        ? new TextEncoder().encode(JSON.stringify(res.data))
        : res.status>=400 ? new TextEncoder().encode(res.data) : Uint8Array.from(atob(res.data),c=>c.charCodeAt(0));
      result={status:res.status,headers:h,bytes,finalUrl:res.url||url.href,contentType};
    } else {
      const proxy=mode==='pc'&&!direct;
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
      const abort=()=>controller.abort(signal.reason);
      signal?.addEventListener('abort',abort,{once:true});
      try{
        const res=await fetch(proxy?'/proxy?url='+encodeURIComponent(url.href):url.href,{method,body,headers:proxy?{'X-DSN':'1','X-Proxy-Headers':JSON.stringify(headers)}:headers,signal:controller.signal});
        result={status:Number(res.headers.get('X-Proxy-Status')||res.status),headers:res.headers,bytes:new Uint8Array(await res.arrayBuffer()),finalUrl:res.headers.get('X-Proxy-Final-Url')||res.url,contentType:res.headers.get('Content-Type')||''};
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    signal?.throwIfAborted();
    if(attempt>=retries || !(result.status===429 || result.status>=500)) return result;
    await sleep(1000*2**attempt);
  }
}
export function decode(bytes,contentType='',fallback='utf-8'){
  const charset=/charset\s*=\s*["']?([\w.:-]+)/i;
  const sniff=new TextDecoder('latin1').decode(bytes.subarray(0,4096));
  const bom=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':bytes[0]===239&&bytes[1]===187&&bytes[2]===191?'utf-8':null;
  const meta=sniff.match(/<meta\b[^>]*charset\s*=[^>]+>/i)?.[0];
  for(const encoding of [contentType.match(charset)?.[1],bom,meta?.match(charset)?.[1],fallback,'utf-8']){
    if(encoding)try{return new TextDecoder(encoding).decode(bytes)}catch{}
  }
}
export async function fetchText(url,opts){
  const r=await fetchBytes(url,opts);
  if(r.status<200||r.status>=300)throw Object.assign(Error('HTTP '+r.status),{status:r.status});
  return {...r,text:decode(r.bytes,r.contentType,opts?.fallback)};
}
export const fetchJSON=async(url,opts)=>JSON.parse((await fetchText(url,opts)).text);
