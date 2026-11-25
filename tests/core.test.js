import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {Readability} from '@mozilla/readability';
import * as db from '../web/core/db.js';
import {finishArticle,skipSuggestion,getSuggestion} from '../web/core/recommend.js';
import {configureStore,readLedger,rebuild} from '../web/core/store.js';
import {extractArticle} from '../web/core/extract.js';
import {decode} from '../web/core/net.js';
import {refresh} from '../web/sources/rss.js';
import {translateBatch,resetTranslators} from '../web/core/translate.js';
import {resumeTranslation} from '../web/core/article.js';
const fixture=f=>readFile(new URL('fixtures/'+f,import.meta.url),'utf8');
const ctx={sources:JSON.parse(await fixture('sources.json'))};
const DOMParser=new JSDOM('').window.DOMParser;
const candidate=(name,lang,seq)=>({url:'https://example.org/'+name,canon:'https://example.org/'+name,lang,seq,series:seq?'series':null,source_id:seq?'series':'news',topics:['history'],kind:seq?'wikisource_series':'rss',status:'new'});
test('Suggestion exclusions, series order, stability and rotation',async()=>{
  const rows=[candidate('a','ja',1),candidate('b','ja',2),candidate('c','en'),candidate('read','en'),candidate('skip','en')];
  await db.batch('candidates',rows);await db.put('history',{canon:rows[3].canon,lang:'en',finished_at:new Date().toISOString()});await db.put('skipped',{key:rows[4].canon});
  await db.batch('articles',rows.slice(0,3).map((c,i)=>({id:'cached-'+i,canon:c.canon,status:'ready',stats:{chars:2000}})));
  assert.equal((await getSuggestion('all',ctx)).canon,rows[0].canon);
  assert.equal((await getSuggestion('all',ctx)).canon,rows[0].canon);
  assert.equal((await skipSuggestion(ctx)).canon,rows[2].canon);
  assert.ok(await db.get('skipped','series:series'));
});
test('Finish gate, durable append and mirror recovery',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dsn-'));configureStore({dir});
  try{
    const a={id:'finish',canon:'https://example.org/end',url:'https://example.org/end',lang:'ko',source_id:null,title:{text:'끝',tr:'Hết'},progress:{total:2,last_read:0}};
    await db.put('articles',a);await assert.rejects(finishArticle(a.id,ctx),/NOT_FINISHED/);
    a.progress.last_read=1;await db.put('articles',a);await finishArticle(a.id,ctx);
    assert.equal(await db.get('articles',a.id),undefined);assert.equal((await readLedger()).length,1);
    assert.equal((await db.get('history',a.canon)).title,'끝');await db.del('history',a.canon);await rebuild();
    assert.equal((await db.get('history',a.canon)).title_tr,'Hết');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Wikipedia, Aozora, RSS, Atom, Readability and fallback',async()=>{
  let text=await fixture('aozora.html');
  const net={fetchJSON:async()=>JSON.parse(await fixture('wiki.json')),fetchText:async()=>({text})};
  const extract=url=>extractArticle(url,{DOMParser,Readability,net});
  assert.equal((await extract('https://en.wikipedia.org/wiki/History')).blocks.length,5);
  assert.deepEqual((await extract('https://www.aozora.gr.jp/cards/1/files/2.html')).blocks.map(x=>x.text),['第一章','山へ。','次の行。']);
  assert.equal(decode(Uint8Array.of(0x8e,0x52),'text/html;charset=Shift_JIS'),'山');
  for(const [file,title] of [['rss.xml','News'],['atom.xml','Atom']]){
    text=await fixture(file);assert.equal((await refresh({url:'https://example.org',topics:[]},{DOMParser,net}))[0].title,title);
  }
  text=await fixture('news.html');let article=await extract('https://example.org/news');assert.equal(article.lang,'en');assert.ok(article.blocks.some(x=>x.text.includes('Historical records')));
  text='<title>Fallback - Daily</title><p>A sufficiently long paragraph for the short article fallback.</p>';article=await extract('https://example.org');assert.equal(article.title,'Fallback');assert.equal(article.blocks.length,1);
});
test('Translation fallback and rate-limit pause',async()=>{
  const settings={translator:'google_free'};
  const net={fetchJSON:async(_,opts)=>({sentences:[{trans:new URLSearchParams(opts.body).get('q').replace('\n',' ')}]})};
  assert.deepEqual(await translateBatch(['one','two'],'en','vi',{net,settings}),['one','two']);
  const times=[];
  await db.put('articles',{id:'rate',status:'ready',lang:'en',target_lang:'vi',title:{text:'Hello',i:-1,tr:null},blocks:[],progress:{translated:0,total:0}});
  await resumeTranslation('rate',{settings,sleep:async ms=>times.push(ms),net:{fetchJSON:async()=>{throw Object.assign(Error(),{status:429})}}});
  // 429: không chờ gọi lại dồn dập — đánh dấu cổng bị giới hạn, chuyển cổng, hết cổng thì tạm dừng.
  assert.deepEqual(times,[]);assert.equal((await db.get('articles','rate')).progress.tr_state,'paused');
  resetTranslators();
});
