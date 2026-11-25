import {analyzeEn} from './en.js';
import {analyzeKo} from './ko.js';
import {emit} from '../core/bus.js';
import * as db from '../core/db.js';
const workers=new Map();let seq=0;
export async function analyze(lang,sentences,opts={}){
  if(lang==='en')return sentences.map(analyzeEn);
  if(lang==='ko'){
    const stems=new Set(sentences.join(' ').match(/[가-힣]/g)||[]),known=new Set();
    if((await db.all('dict_meta')).some(p=>p.lang==='ko'))await Promise.all([...stems].map(async s=>{if((await db.index('dict','lang+head',['ko',s],1)).length)known.add(s)}));
    return sentences.map(s=>analyzeKo(s,{...opts,ko_roman:true,hasWord:s=>known.has(s)}));
  }
  let entry=workers.get(lang);
  if(!entry){
    emit('load-status',lang==='ja'?'Đang nạp bộ tách từ tiếng Nhật (lần đầu vài giây)…':'Đang nạp bộ tách từ tiếng Trung…');
    const worker=new Worker(new URL('./worker_'+lang+'.js',import.meta.url),lang==='ja'?{}:{type:'module'});
    const requests=new Map();entry={worker,requests};workers.set(lang,entry);
    worker.onmessage=({data})=>{const pair=requests.get(data.id);requests.delete(data.id);if(pair)data.error?pair.reject(Error(data.error)):pair.resolve(data.result);};
    worker.onerror=e=>{for(const pair of requests.values())pair.reject(Error(e.message));worker.terminate();workers.delete(lang);};
  }
  return new Promise((resolve,reject)=>{const id=++seq;entry.requests.set(id,{resolve,reject});entry.worker.postMessage({id,sentences});});
}
