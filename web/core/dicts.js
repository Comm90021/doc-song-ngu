import * as db from './db.js';
import * as net from './net.js';
import {emit} from './bus.js';
let manifest;
export async function listPacks(){
  if(!manifest){
    const r=await fetch(new URL('../dicts.json',import.meta.url));if(!r.ok)throw Error('Không đọc được danh mục từ điển');manifest=await r.json();
  }
  const installed=await db.all('dict_meta');
  return manifest.map(p=>({...p,installed:installed.find(i=>i.id===p.id)}));
}
export function toneMarks(value){
  return value.replace(/([a-zü:v]+)([1-5])/gi,(_,raw,tone)=>{
    const syllable=raw.replace(/u:|v/gi,'ü');if(tone==='5')return syllable;
    let i=syllable.search(/[ae]/i);
    if(i<0)i=syllable.toLowerCase().indexOf('ou');
    if(i<0)for(let j=0;j<syllable.length;j++)if(/[aeiouü]/i.test(syllable[j]))i=j;
    if(i<0)i=syllable.search(/[mn]/i);
    if(i<0)return syllable;
    return (syllable.slice(0,i+1)+['','\u0304','\u0301','\u030c','\u0300'][tone]+syllable.slice(i+1)).normalize('NFC');
  });
}
function jpos(tag=''){
  if(/^n|^pn/.test(tag))return 'n';if(/^v/.test(tag))return 'v';if(/^adj|^adv/.test(tag))return 'a';if(/^(prt|aux|conj)/.test(tag))return 'p';return 'x';
}
export function* parsePack(p,text){
  function entry(head,alts,reading,pos,senses){
    return {pack:p.id,lang:p.lang,head,alts:[...new Set(alts.filter(a=>a && a!==head))].map(a=>p.lang+':'+a),reading:reading||'',pos:pos||'x',senses:senses.map(s=>s.trim()).filter(Boolean)};
  }
  if(p.format==='jmdict_simplified'){
    for(const word of JSON.parse(text).words){
      const heads=[...(word.kanji||[]),...(word.kana||[])].map(x=>x.text);
      if(heads.length)yield entry(heads[0],heads.slice(1),word.kana?.[0]?.text,jpos(word.sense?.[0]?.partOfSpeech?.[0]),(word.sense||[]).slice(0,8).map(s=>s.gloss.map(g=>g.text).join('; ')));
    }
    return;
  }
  for(const line of text.split(/\r?\n/).slice(p.skip_lines||0)){
    if(!line.trim()||line.startsWith('#'))continue;
    if(p.format==='cedict'){
      const m=/^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/.exec(line);
      if(m)yield entry(m[2],[m[1]],toneMarks(m[3]),'x',m[4].split('/'));
    }else if(p.format==='tsv'){
      const cols=line.split(p.sep||'\t'),at=k=>cols[p.columns[k]]?.trim()||'';
      if(at('head') && at('senses'))yield entry(at('head'),[at('alt')],at('reading'),at('pos'),p.sense_sep?at('senses').split(p.sense_sep):[at('senses')]);
    }else throw Error('Định dạng từ điển không hỗ trợ');
  }
}
export async function replacePack(id,entries,meta,progress=()=>{}){
  await db.transaction(['dict','dict_meta'],'readwrite',tx=>{
    const store=tx.objectStore('dict'),cursor=store.index('pack').openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess=()=>{
      const c=cursor.result;
      if(c){store.delete(c.primaryKey);c.continue();return;}
      if(!meta){tx.objectStore('dict_meta').delete(id);return;}
      let i=0;
      function write(){
        let last;const end=Math.min(i+750,entries.length);
        while(i<end)last=store.add(entries[i++]);
        progress(Math.round(i/entries.length*100));
        if(i<entries.length)last.onsuccess=write;else tx.objectStore('dict_meta').put(meta);
      }
      write();
    };
  });
}
export const removePack=id=>replacePack(id,[],null);
const active=new Map();
export function installPack(p){
  if(!active.has(p.id))active.set(p.id,install(p).finally(()=>active.delete(p.id)));return active.get(p.id);
}
async function install(p){
  const notify=(phase,pct)=>emit('dict-progress',{id:p.id,phase,pct});
  notify('Đang tải',0);let url=p.url;
  if(p.url_resolver){
    try{
      const release=await net.fetchJSON('https://api.github.com/repos/'+p.url_resolver.github_latest+'/releases/latest',{direct:true});
      url=release.assets.find(a=>new RegExp(p.url_resolver.asset_regex).test(a.name))?.browser_download_url||url;
    }catch(e){if(!url)throw e;}
  }
  const r=await net.fetchBytes(url,{direct:p.cors,timeoutMs:120000});
  if(r.status!==200)throw Error('Không tải được từ điển (HTTP '+r.status+')');
  await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../nlp/worker_dict.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.phase){notify(data.phase,data.pct);return;}
      worker.terminate();data.error?reject(Error(data.error)):resolve();
    };
    worker.onerror=e=>{worker.terminate();reject(Error(e.message));};
    worker.postMessage({p,buffer:r.bytes.buffer},[r.bytes.buffer]);
  });
}
