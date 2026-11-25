import * as net from './net.js';
import {settings} from './settings.js';
import {sleep} from './util.js';
let active=0;
const waiters=[];
async function slot(fn){
  if(active>=2)await new Promise(resolve=>waiters.push(resolve));else active++;
  try{return await fn();}finally{if(waiters.length)waiters.shift()();else active--;}
}
function code(lang,s){return lang==='zh'?(s.zh_script==='hant'?'zh-TW':'zh-CN'):lang;}
export const needsTranslation=(source,target,s)=>source!==target&&code(source,s)!==code(target,s);
// Cổng nào trả 429 thì tạm bỏ cổng đó 10 phút và chuyển ngay sang cổng kia (không gọi lại dồn dập).
const blockedUntil={};
export function resetTranslators(){for(const k of Object.keys(blockedUntil))delete blockedUntil[k];}
async function request(provider,fn,ctx){
  if(blockedUntil[provider]>Date.now())throw Object.assign(Error('Bộ dịch đang tạm bị giới hạn — thử lại sau ít phút'),{status:429});
  return slot(async()=>{
    for(let attempt=0;;attempt++){
      try{return await fn();}
      catch(e){
        if(e.status===429){blockedUntil[provider]=Date.now()+10*60*1000;throw e;}
        if(e.status!==503||attempt===2)throw e;
        await (ctx.sleep||sleep)(2000*2**attempt);
      }
    }
  });
}
const form={'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'};
// Cổng chính: clients5 (dict-chrome-ex), mỗi câu một tham số q → trả mảng đúng thứ tự từng câu.
async function multi(texts,src,tgt,ctx){
  const url='https://clients5.google.com/translate_a/t?'+new URLSearchParams({client:'dict-chrome-ex',sl:src,tl:tgt});
  const body=texts.map(t=>'q='+encodeURIComponent(t)).join('&');
  const json=await request('multi',()=>(ctx.net||net).fetchJSON(url,{method:'POST',direct:false,retries:0,headers:form,body}),ctx);
  const out=(Array.isArray(json)?json:[json]).map(x=>Array.isArray(x)?String(x[0]??''):typeof x==='string'?x:null);
  if(out.length!==texts.length||out.some(x=>x===null))throw Error('Số câu dịch không khớp');
  return out;
}
// Cổng dự phòng: gtx, các câu nối bằng \n.
async function google(text,src,tgt,dict,ctx){
  const params=new URLSearchParams({client:'gtx',sl:src,tl:tgt,dt:'t',dj:'1'});
  if(dict)params.append('dt','bd');
  const url='https://translate.googleapis.com/translate_a/single?'+params;
  return request('gtx',()=>(ctx.net||net).fetchJSON(url,{method:'POST',direct:false,retries:0,headers:form,body:new URLSearchParams({q:text}).toString()}),ctx);
}
const joined=json=>(json.sentences||[]).map(s=>s.trans||'').join('');
async function batch(texts,src,tgt,s,ctx){
  if(s.translator==='openai_compat' && s.oa_base_url && s.oa_model){
    try{
      const response=await slot(()=>(ctx.net||net).fetchJSON(s.oa_base_url.replace(/\/+$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+s.oa_key,'Content-Type':'application/json'},body:JSON.stringify({model:s.oa_model,temperature:0.2,messages:[{role:'system',content:'Translate each input sentence from '+src+' to '+tgt+'. Reply with ONLY a JSON array of strings, same length and order as the input.'},{role:'user',content:JSON.stringify(texts)}]})}));
      const arr=JSON.parse(response.choices[0].message.content);
      if(Array.isArray(arr)&&arr.length===texts.length&&arr.every(x=>typeof x==='string'&&x.trim()))return arr;
    }catch{}
  }
  // Câu không có chữ (số, ký hiệu…) mà bộ dịch trả rỗng thì giữ nguyên câu gốc, không coi là lỗi.
  const filled=out=>out.map((x,i)=>x.trim()||/\p{L}/u.test(texts[i])?x:texts[i]);
  try{const out=filled(await multi(texts,src,tgt,ctx));if(out.every(x=>x.trim()))return out;}catch{}
  const lines=filled(joined(await google(texts.join('\n'),src,tgt,false,ctx)).split(/\r?\n/));
  if(lines.length===texts.length&&lines.every(x=>x.trim()))return lines;
  const out=filled(await Promise.all(texts.map(async t=>joined(await google(t,src,tgt,false,ctx)))));
  if(out.some(x=>!x.trim()))throw Error('Bộ dịch không trả về bản dịch');
  return out;
}
export function batches(items,text=x=>x){
  const groups=[];let group=[],length=0;
  for(const item of items){
    const size=text(item).length;
    if(group.length && length+size+1>4500){groups.push(group);group=[];length=0;}
    group.push(item);length+=size+1;
  }
  if(group.length)groups.push(group);
  return groups;
}
export async function translateBatch(texts,source,target,ctx={}){
  const s=ctx.settings||await settings(),src=code(source,s),tgt=code(target,s);
  if(!needsTranslation(source,target,s))return texts.map(()=>'');
  const result=[];
  for(const group of batches(texts)){
    if(group.length===1 && group[0].length>4500){
      const chunks=group[0].match(/[\s\S]{1,2200}/gu)||[];
      result.push((await translateBatch(chunks,source,target,{...ctx,settings:s})).join(' '));
    }else result.push(...await batch(group,src,tgt,s,ctx));
  }
  return result;
}
export async function quickLookup(text,src,tgt,ctx={}){
  const s=ctx.settings||await settings(),a=code(src,s),b=code(tgt,s);
  try{const [tr]=await multi([text],a,b,ctx);if(tr)return {tr,dict:[]};}catch{}
  const json=await google(text,a,b,true,ctx);
  return {tr:joined(json),dict:(json.dict||[]).map(d=>({pos:d.pos,terms:d.terms||[]}))};
}
