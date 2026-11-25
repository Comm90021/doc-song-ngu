import * as db from './db.js';
import {IS_NATIVE,plugin} from './net.js';
import {canon} from './urlnorm.js';
let directory;
export const configureStore=opts=>{directory=opts.dir};
export const ledgerLocation=()=>directory || (IS_NATIVE?'da_doc.jsonl (DATA)':'data/da_doc.jsonl');
const lines=s=>s.split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));
export async function readLedger(){
  if(directory){
    const fs=await import('node:fs/promises');
    try{return lines(await fs.readFile(directory+'/da_doc.jsonl','utf8'))}catch(e){if(e.code==='ENOENT')return [];throw e}
  }
  if(IS_NATIVE){
    try{return lines((await plugin('Filesystem').readFile({path:'da_doc.jsonl',directory:'DATA',encoding:'utf8'})).data)}
    catch(e){if(/not exist|not found|OS-PLUG-FILE-0008/i.test(e.message+' '+e.code))return [];throw e;}
  }
  const r=await fetch('/api/history');if(!r.ok)throw Error('Không đọc được lịch sử');return r.json();
}
function clean(entry){
  const key=canon(entry.url);
  return {url:entry.url,canon:key,title:String(entry.title||entry.url),title_tr:String(entry.title_tr||''),lang:entry.lang||'en',source_id:entry.source_id||null,finished_at:entry.finished_at||new Date().toISOString()};
}
export async function appendLedger(record){
  const entry=clean(record), data=JSON.stringify(entry)+'\n';
  if(directory){
    const fs=await import('node:fs/promises');
    await fs.mkdir(directory,{recursive:true});
    await fs.appendFile(directory+'/da_doc.jsonl',data,{flush:true});
  } else if(IS_NATIVE){
    const fs=plugin('Filesystem');
    await fs.appendFile({data,path:'da_doc.jsonl',directory:'DATA',encoding:'utf8'});
    try{
      await fs.mkdir({path:'DocSongNgu',directory:'DOCUMENTS',recursive:true}).catch(()=>{});
      await fs.appendFile({data,path:'DocSongNgu/da_doc.jsonl',directory:'DOCUMENTS',encoding:'utf8'});
      await db.setState('documents_copy','Đã sao lưu vào Documents');
    }catch{await db.setState('documents_copy','Không ghi được bản sao Documents');}
  } else {
    const r=await fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json','X-DSN':'1'},body:JSON.stringify(entry)});
    if(!r.ok)throw Error('Không lưu được lịch sử');
  }
  return entry;
}
export async function rebuild(){for(const e of await readLedger())if(!await db.get('history',e.canon))await db.put('history',clean(e));}
export async function importHistory(file){
  const text=await file.text();
  const entries=(text.trimStart().startsWith('[')?JSON.parse(text):lines(text)).map(clean);
  for(const e of entries)if(!await db.get('history',e.canon))await db.put('history',await appendLedger(e));
}
export async function exportHistory(){
  const data=JSON.stringify(await db.all('history'),null,2), path='lich-su.json';
  if(IS_NATIVE){
    const {uri}=await plugin('Filesystem').writeFile({path,data,directory:'CACHE',encoding:'utf8'});
    await plugin('Share').share({files:[uri]});
  }else{
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download=path;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
}
