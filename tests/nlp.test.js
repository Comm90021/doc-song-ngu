import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import kuromoji from 'kuromoji';
import {pinyin} from 'pinyin-pro';
import {analyzeJa} from '../web/nlp/ja.js';
import {analyzeZh} from '../web/nlp/zh.js';
import {analyzeKo,romanize} from '../web/nlp/ko.js';
import {analyzeEn} from '../web/nlp/en.js';
import {canon} from '../web/core/urlnorm.js';
import {splitSentences} from '../web/core/segment.js';
const {tag}=createRequire(import.meta.url)('jieba-wasm');
const tk=await new Promise((res,rej)=>kuromoji.builder({dicPath:'node_modules/kuromoji/dict'}).build((e,t)=>e?rej(e):res(t)));
test('Sentence boundaries',()=>{
  for(const [lang,parts] of Object.entries({ja:['「はい。」','次です！'],zh:['你好！','真的吗？'],ko:['좋다.','다음이다.'],en:['Dr. J. R. R. Tolkien paid 3.14.','“Really?”','Yes.']}))
    assert.deepEqual(splitSentences(parts.join(['ja','zh'].includes(lang)?'':' '),lang),parts);
});
test('Tokens preserve every character',()=>{
  for(const [fn,s] of [[s=>analyzeJa(s,tk),'政治 3日。'],[s=>analyzeZh(s,{tag,pinyin}),'我们 abc，学习。'],[analyzeKo,'“정치는 나라가!”'],[analyzeEn,"It's 3.14, yes."]]) assert.equal(fn(s).tokens.map(t=>t.s).join(''),s);
});
test('Furigana alignment',()=>{
  for(const [s,r] of Object.entries({'食べる':'食:た','今日':'今日:きょう','取り組み':'取:と 組:く','人々':'人々:ひとびと','学んだ':'学:まな','3日':'日:にち'}))
    assert.equal(analyzeJa(s,tk).tokens.filter(t=>t.r).map(t=>t.s+':'+t.r).join(' '),r);
});
test('Contextual pinyin',()=>{
  for(const [s,r] of Object.entries({'银行':'yín háng','行走':'xíng zǒu','重要':'zhòng yào','重复':'chóng fù'})) assert.equal(analyzeZh(s,{tag,pinyin}).tokens.map(t=>t.r).join(' '),r);
});
test('Korean pronunciation and particles',()=>{
  for(const [s,r] of Object.entries({'독립':'dongnip','신라':'silla','같이':'gachi','정치':'jeongchi','한국어':'hangugeo','합니다':'hamnida','대한민국':'daehanminguk'})) assert.equal(romanize(s),r);
  assert.deepEqual(analyzeKo('정치는 나라가 사이').words.map(w=>w.lemma),['정치','는','나라','가','사이']);
});
test('Canonical URL',()=>assert.equal(canon('http://JA.m.wikipedia.org/wiki/Test/?utm_source=x&gclid=a&x=1#top'),'https://ja.wikipedia.org/wiki/Test?x=1'));
