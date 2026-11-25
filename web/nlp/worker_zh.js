import init,{tag} from '../vendor/jieba/jieba_rs_wasm.js';
import {pinyin} from '../vendor/pinyin/esm/index.mjs';
import {analyzeZh} from './zh.js';
const ready=init();
self.onmessage=async({data:{id,sentences}})=>{
  try{await ready;self.postMessage({id,result:sentences.map(s=>analyzeZh(s,{tag,pinyin}))});}
  catch(e){self.postMessage({id,error:String(e)});}
};
