let opening;
const schema={history:['canon','finished_at'],skipped:['key'],candidates:['canon','lang','source_id','series'],articles:['id','canon'],state:['key'],settings:['key'],source_status:['source_id'],dict_meta:['id']};
export function openDB() {
  if (!opening) opening=new Promise((resolve,reject)=>{
    const req=indexedDB.open('docsongngu',1);
    req.onupgradeneeded=()=>{
      for(const [name,[keyPath,...indexes]] of Object.entries(schema)){
        const store=req.result.createObjectStore(name,{keyPath});
        for(const index of indexes) store.createIndex(index,index);
      }
      const dict=req.result.createObjectStore('dict',{autoIncrement:true});
      dict.createIndex('pack','pack');
      dict.createIndex('lang+head',['lang','head']);
      dict.createIndex('lang+reading',['lang','reading']);
      dict.createIndex('alts','alts',{multiEntry:true});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{opening=null;reject(req.error)};
  });
  return opening;
}
export async function transaction(names,mode,callback) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(names,mode);
    let result;
    tx.oncomplete=()=>resolve(result?.result);
    tx.onabort=()=>reject(tx.error || Error('Giao dịch bị hủy'));
    try {result=callback(tx);} catch(e){tx.abort();reject(e);}
  });
}
const run=(name,mode,fn)=>transaction(name,mode,tx=>fn(tx.objectStore(name)));
export const get=(n,k)=>run(n,'readonly',s=>s.get(k));
export const all=n=>run(n,'readonly',s=>s.getAll());
export const index=(n,i,k,limit)=>run(n,'readonly',s=>s.index(i).getAll(k,limit));
export const put=(n,v)=>run(n,'readwrite',s=>s.put(v));
export const del=(n,k)=>run(n,'readwrite',s=>s.delete(k));
export const batch=(n,rows)=>run(n,'readwrite',s=>{for(const row of rows)s.put(row)});
export const update=(n,k,fn)=>run(n,'readwrite',s=>{const req=s.get(k);req.onsuccess=()=>{if(req.result)s.put(fn(req.result))}});
export const state=async k=>(await get('state',k))?.value;
export const setState=(key,value)=>put('state',{key,value});
