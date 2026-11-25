import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Readability} from '@mozilla/readability';
import * as db from '../web/core/db.js';
import * as net from '../web/core/net.js';
import {articleId} from '../web/core/util.js';
import {getSuggestion} from '../web/core/recommend.js';
import {defaults} from '../web/core/settings.js';
import {prefetchSuggestion} from '../web/core/jobs.js';
import {refresh as seriesRefresh,seriesTitles} from '../web/sources/wikisource.js';

const DOMParser=new JSDOM('').window.DOMParser;

test('Wikisource series keeps index page order, decodes links and dedupes',async()=>{
  const html=`<div class="mw-parser-output">
    <a href="/wiki/三國演義/凡例">凡例</a>
    <a href="/wiki/%E4%B8%89%E5%9C%8B%E6%BC%94%E7%BE%A9/%E5%BA%8F">序</a>
    <a href="/wiki/三國演義/第001回">第001回</a>
    <a href="/wiki/三國演義/第001回#top">dup</a>
    <a href="/wiki/三國演義/第002回">第002回</a>
    <a href="/w/index.php?title=三國演義/第003回&amp;redlink=1">red link</a>
    <a href="/wiki/Other_page">other</a>
    <a href="/wiki/三國演義">index itself</a></div>`;
  assert.deepEqual(seriesTitles(html,'三國演義',DOMParser),['三國演義/凡例','三國演義/序','三國演義/第001回','三國演義/第002回']);

  const shuihu=`<a href="/wiki/水滸傳_(100回本)/第001回">a</a><a href="/wiki/%E6%B0%B4%E6%BB%B8%E5%82%B3_%28100%E5%9B%9E%E6%9C%AC%29/%E7%AC%AC002%E5%9B%9E">b</a>`;
  assert.deepEqual(seriesTitles(shuihu,'水滸傳 (100回本)',DOMParser),['水滸傳 (100回本)/第001回','水滸傳 (100回本)/第002回']);
});

test('Wikisource refresh builds series candidates with seq from the index page',async()=>{
  const html='<a href="/wiki/The_Federalist_(Dawson)/No._1">1</a><a href="/wiki/The_Federalist_(Dawson)/No._2">2</a>';
  const calls=[];
  const ctx={db:{index:async()=>[]},now:new Date().toISOString(),DOMParser,net:{fetchJSON:async url=>{calls.push(url);return {parse:{text:html}};}}};
  const rows=await seriesRefresh({id:'ws-en-federalist',wiki:'en',index:'The Federalist (Dawson)',kind:'wikisource_series',lang:'en',topics:['politics']},ctx);
  const requested=new URL(calls[0]);
  assert.equal(requested.hostname,'en.wikisource.org');
  assert.equal(requested.searchParams.get('page'),'The Federalist (Dawson)');
  assert.equal(requested.searchParams.get('prop'),'text');
  assert.deepEqual(rows.map(r=>[r.title,r.seq,r.series,r.url]),[
    ['The Federalist (Dawson)/No. 1',1,'ws-en-federalist','https://en.wikisource.org/wiki/The_Federalist_(Dawson)/No._1'],
    ['The Federalist (Dawson)/No. 2',2,'ws-en-federalist','https://en.wikisource.org/wiki/The_Federalist_(Dawson)/No._2'],
  ]);
});

test('Wikimedia requests to one host start at least 1 000 ms apart',async()=>{
  const realFetch=globalThis.fetch, starts={wiki:[],other:[]};
  globalThis.fetch=async url=>{
    (new URL(url).hostname.endsWith('wikipedia.org')?starts.wiki:starts.other).push(Date.now());
    return {status:200,url,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(0)};
  };
  net.configureNet({mode:'node'});
  try{
    await Promise.all(['a','b','c'].map(p=>net.fetchBytes('https://en.wikipedia.org/w/'+p,{retries:0})));
    await Promise.all(['a','b','c'].map(p=>net.fetchBytes('https://example.org/'+p,{retries:0})));
    const gaps=starts.wiki.slice(1).map((t,i)=>t-starts.wiki[i]);
    assert.equal(gaps.length,2);
    assert.ok(gaps.every(g=>g>=1000),'gaps '+gaps);
    assert.ok(starts.other[2]-starts.other[0]<500,'other hosts must not be paced');
  }finally{globalThis.fetch=realFetch;}
});

test('Suggested article shorter than the minimum is marked bad and replaced',async()=>{
  const ctx={prefetch:false,sources:[{id:'news',enabled:true}],DOMParser,Readability,settings:defaults,analyze:async(lang,texts)=>texts.map(()=>({tokens:[]})),net:{
    fetchText:async url=>({text:url.includes('/short')
      ?'<html lang="en"><head><title>Short</title></head><body><p>'+'Too short to read as a suggestion. '.repeat(10)+'</p></body></html>'
      :'<html lang="en"><head><title>Long</title></head><body><article>'+Array.from({length:6},(_,i)=>'<p>'+`Paragraph ${i} about the long article body. `.repeat(20)+'</p>').join('')+'</article></body></html>',finalUrl:url}),
    fetchJSON:async()=>{throw Error('offline')}}};
  const row=(name)=>({canon:'https://example.org/'+name,url:'https://example.org/'+name,title:name,lang:'en',source_id:'news',kind:'rss',topics:['history'],series:null,seq:null,published_at:null,est_chars:null,status:'new',fetched_at:new Date().toISOString()});
  const short=row('short'), long=row('long');
  await db.batch('candidates',[short]);
  assert.equal((await getSuggestion('all',ctx)).canon,short.canon);
  await db.put('candidates',long);
  await prefetchSuggestion(short,'all',ctx);
  const marked=await db.get('candidates',short.canon);
  assert.equal(marked.status,'bad');
  assert.ok(marked.est_chars>0&&marked.est_chars<1500,'length check must run on the opened article');
  assert.equal(await db.get('articles',await articleId(short.canon)),undefined);
  assert.equal(await db.state('current_suggestion'),long.canon);
});
