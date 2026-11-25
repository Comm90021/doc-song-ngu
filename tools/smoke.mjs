// Online integration check. Uses an in-memory database and the real providers.
import 'fake-indexeddb/auto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {Readability} from '@mozilla/readability';
import kuromoji from 'kuromoji';
import {pinyin} from 'pinyin-pro';
import * as opencc from 'opencc-js';
import * as fflate from 'fflate';
import * as db from '../web/core/db.js';
import * as net from '../web/core/net.js';
import {adapters} from '../web/sources/registry.js';
import {defaults} from '../web/core/settings.js';
import {openArticle,resumeTranslation} from '../web/core/article.js';
import {quickLookup} from '../web/core/translate.js';
import {analyzeJa} from '../web/nlp/ja.js';
import {analyzeZh} from '../web/nlp/zh.js';
import {analyzeKo} from '../web/nlp/ko.js';
import {analyzeEn} from '../web/nlp/en.js';
const require=createRequire(import.meta.url), {tag}=require('jieba-wasm');
const dom=new JSDOM(''),sources=JSON.parse(await readFile(new URL('../web/sources.json',import.meta.url),'utf8'));
let tk;
async function analyze(lang,texts,opts){
  if(lang==='ja')tk ||= await new Promise((resolve,reject)=>kuromoji.builder({dicPath:fileURLToPath(new URL('../node_modules/kuromoji/dict/',import.meta.url))}).build((err,t)=>err?reject(err):resolve(t)));
  const functions={en:analyzeEn,ko:s=>analyzeKo(s,opts),zh:s=>analyzeZh(s,{tag,pinyin}),ja:s=>analyzeJa(s,tk)};
  return texts.map(functions[lang]);
}
net.configureNet({mode:'node'});
const ctx={db,net,DOMParser:dom.window.DOMParser,Readability,opencc,fflate,settings:defaults,analyze,translationLimit:12,now:new Date().toISOString()};
const words={ja:['政治','学ぶ','国','歴史','社会'],zh:['政治','学习','国家','历史','社会'],ko:['정치','공부','나라','역사','사회'],en:['politics','study','country','history','society']};
let meanings=0;
for(const [lang,samples] of Object.entries(words)){
  try{
    const source=sources.find(s=>s.enabled&&s.lang===lang);if(!source)throw Error('Thiếu nguồn');
    const start=performance.now(),candidates=await adapters[source.kind](source,ctx),refreshed=performance.now();
    let success=false;
    for(const c of candidates){
      let id;const begin=performance.now();
      try{id=await openArticle(c.url,c,ctx);}catch(e){console.error(c.url,e.message);continue;}
      const opened=performance.now();await resumeTranslation(id,ctx);
      const a=await db.get('articles',id),sentences=a.blocks.flatMap(b=>b.sentences);
      const first=sentences.slice(0,12),han=sentences.filter(s=>/\p{Script=Han}/u.test(s.text));
      const translated=100*first.filter(s=>s.tr?.trim()).length/Math.max(1,first.length);
      const ruby=han.length?100*han.filter(s=>s.tokens.some(t=>t.r)).length/han.length:null;
      console.log(JSON.stringify({lang,url:a.url,title:a.title.text,blocks:a.blocks.length,sentences:sentences.length,translated_pct:translated,ruby_pct:ruby,ms:{refresh:Math.round(refreshed-start),open:Math.round(opened-begin),translation:Math.round(performance.now()-opened)}}));
      if(translated<95||(['ja','zh'].includes(lang)&&ruby!==null&&ruby<90))throw Error('Chưa đạt ngưỡng dịch hoặc phiên âm');
      success=true;break;
    }
    if(!success)throw Error('Không mở được bài từ '+source.id);
  }catch(e){process.exitCode=1;console.error(lang,e.message);}
  for(const word of samples){
    try{const result=await quickLookup(word,lang,'vi',ctx);if(result.tr||result.dict.length)meanings++;console.log(lang,word,result.tr,result.dict);}
    catch(e){console.error(lang,word,e.message);}
  }
}
console.log('Tra từ:',meanings,'/ 20');if(meanings<16)process.exitCode=1;
dom.window.close();
