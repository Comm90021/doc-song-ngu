import 'fake-indexeddb/auto';
import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import * as db from '../web/core/db.js';
import {bus} from '../web/core/bus.js';
import {maybeRefresh,refreshProgress} from '../web/core/jobs.js';
import {eligibleCandidates,getSuggestion,skipSuggestion} from '../web/core/recommend.js';
import {openArticle,translateOnReaderOpen} from '../web/core/article.js';
import {defaults} from '../web/core/settings.js';
import {refresh as wiki} from '../web/sources/wikipedia.js';
import {refresh as aozora} from '../web/sources/aozora.js';
import {analyze} from '../web/nlp/client.js';
import {home} from '../web/ui/home.js';
import {reader} from '../web/ui/reader.js';
import {historyPage} from '../web/ui/history.js';

const {DOMParser}=new JSDOM('').window;
const langs=['zh','ja','ko','en'];
const day=86400000;
const daysAgo=n=>new Date(Date.now()-n*day).toISOString();
const source=(id,lang='ja',kind='rss')=>({id,lang,kind,enabled:true,topics:['history'],url:'https://example.org/'+id});
function candidate(name,src,extra={}){
  const url='https://example.org/'+name;
  return {canon:url,url,title:name,lang:src.lang,kind:src.kind,source_id:src.id,topics:src.topics,
    status:'new',est_chars:null,fetched_at:daysAgo(0),...extra};
}
const feed=(src,count=30)=>'<rss><channel>'+Array.from({length:count},(_,i)=>
  '<item><title>'+src+'/'+i+'</title><link>https://example.org/'+src+'/'+i+'</link><pubDate>'+
  new Date(2026,0,i+1).toUTCString()+'</pubDate></item>').join('')+'</channel></rss>';
const body=n=>'<title>Article</title><p>'+Array.from({length:n},(_,i)=>'Sentence '+i+' describes an important historical event in detail.').join(' ')+'</p>';
const waitFor=async(fn)=>{
  for(let i=0;i<250;i++){
    const result=await fn();
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,8));
  }
  assert.fail('Condition did not become true');
};
beforeEach(async()=>{
  const stores=['candidates','articles','history','skipped','state','source_status','settings','dict','dict_meta'];
  await db.transaction(stores,'readwrite',tx=>{for(const key of stores)tx.objectStore(key).clear();});
});

test('Refresh adds 25 new candidates per language, round-robin and newest RSS first',async()=>{
  const sources=langs.flatMap(l=>[source(l+'-a',l),source(l+'-b',l)]);
  const ctx={sources,DOMParser,net:{fetchText:async url=>({text:feed(new URL(url).pathname.slice(1))})}};
  await maybeRefresh(false,ctx);
  for(const lang of langs){
    const rows=await db.index('candidates','lang',lang);
    assert.equal(rows.length,25);
    assert.equal(rows.filter(c=>c.source_id===lang+'-a').length,13);
    assert.equal(rows.filter(c=>c.source_id===lang+'-b').length,12);
    assert.ok(rows.some(c=>c.title===lang+'-b/29'));
    assert.ok(!rows.some(c=>c.title===lang+'-a/0'));
  }
  const old=(await db.all('candidates'))[0];
  await db.update('candidates',old.canon,c=>({...c,est_chars:4321}));
  await maybeRefresh(true,ctx);
  assert.equal((await db.all('candidates')).length,200);
  assert.equal((await db.get('candidates',old.canon)).est_chars,4321);
  assert.equal((await db.get('candidates',old.canon)).fetched_at,old.fetched_at);
});

test('Pool expiry and cap protect pinned and cached articles and evict old news first',async()=>{
  const news=source('news'),articles=source('wiki','ja','wikipedia');
  const rows=[
    candidate('expired',news,{fetched_at:daysAgo(15)}),
    candidate('current',news,{fetched_at:daysAgo(30)}),
    candidate('cached',news,{fetched_at:daysAgo(30)}),
    candidate('other-view',news,{fetched_at:daysAgo(30)}),
    candidate('older-news',news,{fetched_at:daysAgo(13)}),
    candidate('newer-news',news,{fetched_at:daysAgo(10)}),
    candidate('read',articles),candidate('skipped',articles),candidate('bad',articles,{status:'bad'}),
    ...Array.from({length:73},(_,i)=>candidate('wiki-'+i,articles,{fetched_at:daysAgo(50-i)})),
  ];
  await db.batch('candidates',rows);
  await db.setState('current_suggestion',rows[1].canon);
  await db.setState('suggestion_pins',{'ja:news':rows[3].canon});
  await db.put('articles',{id:'cached',canon:rows[2].canon,status:'ready'});
  await db.put('history',{canon:rows[6].canon});
  await db.put('skipped',{key:rows[7].canon});
  await maybeRefresh(true,{sources:[]});
  const kept=new Set((await db.all('candidates')).map(c=>c.canon));
  for(const i of [0,4,5,9])assert.ok(!kept.has(rows[i].canon),rows[i].title);
  for(const i of [1,2,3,6,7,8,10])assert.ok(kept.has(rows[i].canon),rows[i].title);
  assert.equal(kept.size,78);
});

test('Source deadline records the error, continues, and reports final progress',async()=>{
  const states=[],listener=e=>states.push(e.detail);
  bus.addEventListener('refresh-status',listener);
  let signal;
  try{
    await maybeRefresh(true,{sources:[source('hang'),source('ok')],DOMParser,sourceTimeoutMs:40,net:{
      fetchText:(url,opts)=>{
        if(url.endsWith('/hang')){signal=opts.signal;return new Promise(()=>{});}
        return Promise.resolve({text:feed('ok',1)});
      },
    }});
  }finally{bus.removeEventListener('refresh-status',listener);}
  assert.ok(signal.aborted);
  assert.match((await db.get('source_status','hang')).last_error,/Hết thời gian/);
  assert.equal((await db.get('source_status','ok')).items,1);
  assert.equal((await db.all('candidates')).length,1);
  assert.deepEqual(states.map(s=>[s.running,s.completed,s.total]),[[true,0,2],[true,1,2],[true,2,2],[false,2,2]]);
  assert.equal(refreshProgress().running,false);
});

test('Pool expiry protects a candidate while a reader open is in progress',async()=>{
  const c=candidate('in-progress',source('old','en'),{fetched_at:daysAgo(15)});
  await db.put('candidates',c);
  const request=Promise.withResolvers();
  const opening=openArticle(c.url,c,{DOMParser,settings:{...defaults,target_lang:'en'},
    net:{fetchText:()=>request.promise}});
  try{
    await maybeRefresh(true,{sources:[]});
    assert.ok(await db.get('candidates',c.canon));
  }finally{request.resolve({text:body(31)});await opening;}
});

test('Aozora CSV parsing yields, filters and reuses its cache for 30 days',async()=>{
  const csv='作品名,姓,名,分類番号,XHTML/HTMLファイルURL,文字遣い種別,役割フラグ,作品著作権フラグ\r\n'+
    '"作品,一",田中,太郎,NDC 913,https://example.org/book,新字新仮名,著者,なし\r\n'+
    '除外,田中,太郎,NDC 913,https://example.org/old,旧字旧仮名,著者,なし\n'+
    ('x'.repeat(100)+'\n').repeat(1500);
  let calls=0,yielded=false;
  const s={...source('aozora','ja','aozora'),ndc:['913']};
  const ctx={db:{...db,batch:(...args)=>{assert.equal(yielded,true);return db.batch(...args);}},now:daysAgo(30),
    net:{fetchBytes:async()=>{calls++;return {status:200,bytes:new Uint8Array()};}},
    fflate:{unzipSync:()=>{yielded=false;setTimeout(()=>{yielded=true;},0);return {'data.csv':new TextEncoder().encode(csv)};}}};
  assert.deepEqual((await aozora(s,ctx)).map(c=>[c.title,c.topics]),[['作品,一 — 田中太郎',['literature']]]);
  assert.equal((await db.state('aozora_catalog')).length,1);
  await aozora(s,{...ctx,now:daysAgo(1)});
  assert.equal(calls,1);
  await aozora(s,{...ctx,now:daysAgo(0)});
  assert.equal(calls,2);
});

test('Wikipedia search uses 50 size results and pre-filters byte bounds for Chinese and Korean',async()=>{
  for(const [lang,length,expected] of [['zh','short',['min','max']],['ko','medium',['min','max']],
    ['zh','long',['min','max','above']],['ko','any',['min','max','above']]]){
    const rows=await wiki({...source(lang,lang,'wikipedia'),wiki:lang,query:'articletopic:history'},{
      now:daysAgo(0),settings:{length},net:{fetchJSON:async url=>{
        const params=new URL(url).searchParams;
        assert.equal(params.get('srlimit'),'50');assert.equal(params.get('srprop'),'size');
        assert.equal(params.get('srsearch'),'articletopic:history');
        return {query:{search:[{title:'stub',size:5999},{title:'min',size:6000},{title:'max',size:60000},{title:'above',size:60001}]}};
      }}
    });
    assert.deepEqual(rows.map(r=>r.title),expected);
    assert.ok(rows.every(r=>r.est_chars===null));
  }
});

test('Cheap validation rejects errors and mismatched lengths before NLP, then prefetches just title and 20 sentences',async()=>{
  const src=source('news');
  const rows=['broken','overlong','passing','later'].map((n,i)=>candidate(n,src,{published_at:daysAgo(i)}));
  await db.batch('candidates',rows);
  const fetched=[],analyzed=[],translated=[],published=[];
  const listener=e=>published.push(e.detail?.title);
  bus.addEventListener('suggestion-changed',listener);
  const ctx={sources:[src],DOMParser,settings:defaults,analyze:async(lang,texts)=>{
    analyzed.push([lang,texts]);return texts.map(text=>({tokens:[{s:text}],words:[]}));
  },net:{
    fetchText:async url=>{
      const name=url.split('/').at(-1);
      fetched.push(name);
      assert.equal(await db.state('current_suggestion'),undefined);
      if(name==='broken')throw Error('unavailable');
      return {text:body(name==='overlong'?150:31).replaceAll('detail.','detail。')};
    },
    fetchJSON:async(_,opts)=>{
      const texts=new URLSearchParams(opts.body).getAll('q');translated.push(...texts);
      return texts.map(text=>'Dịch '+text);
    },
  }};
  try{
    assert.equal((await getSuggestion('ja',ctx)).canon,rows[2].canon);
    const article=await waitFor(async()=>(await db.all('articles')).find(a=>a.progress.translated===20));
    assert.equal(article.title.tr,'Dịch Article');
    assert.equal(article.progress.tr_state,'running');
    assert.ok(article.blocks.flatMap(b=>b.sentences).slice(20).every(s=>s.tr===null));
    assert.equal(analyzed.length,1);
    assert.equal(analyzed[0][1].length,32);
    assert.equal(translated.length,21);
    assert.deepEqual(fetched,['broken','overlong','passing']);
    assert.deepEqual(published,['passing']);
    assert.equal((await db.get('candidates',rows[0].canon)).status,'bad');
    const overlong=await db.get('candidates',rows[1].canon);
    assert.equal(overlong.status,'new');assert.ok(overlong.est_chars>8000);
    assert.equal((await getSuggestion('ja',ctx)).canon,rows[2].canon);
    assert.equal(fetched.length,3);
    await translateOnReaderOpen(article.id,ctx);
    const complete=await db.get('articles',article.id);
    assert.equal(complete.progress.tr_state,'done');
    assert.equal(complete.progress.translated,31);
    assert.equal(translated.length,32);
  }finally{bus.removeEventListener('suggestion-changed',listener);}
});

test('Validation spends at most eight cheap attempts and publishes no rejected candidate',async()=>{
  const src=source('news','en');
  await db.batch('candidates',Array.from({length:9},(_,i)=>candidate('bad-'+i,src)));
  let attempts=0;
  assert.equal(await getSuggestion('en',{sources:[src],DOMParser,net:{fetchText:async()=>{
    attempts++;return {text:body(18)};
  }}}),null);
  const rejected=(await db.all('candidates')).filter(c=>c.status==='bad');
  assert.equal(attempts,8);assert.equal(rejected.length,8);
  assert.ok(rejected.every(c=>c.est_chars>=800&&c.est_chars<1500));
  assert.equal(await db.state('current_suggestion'),undefined);
  assert.deepEqual(await db.all('articles'),[]);
});

test('Rotation is per language, skips empty kinds and remembers a suggestion across chip filters',async()=>{
  const sources=[source('zh-news','zh'),source('zh-wiki','zh','wikipedia'),source('zh-lit','zh','wikisource_series'),
    source('ko-news','ko'),source('ko-wiki','ko','wikipedia')];
  const rows=[...sources.map(s=>candidate(s.id,s)),candidate('zh-news-2',sources[0],{published_at:daysAgo(1)})];
  rows[0].published_at=daysAgo(0);
  await db.batch('candidates',rows);
  await db.batch('articles',rows.map(c=>({id:c.title,canon:c.canon,status:'ready',stats:{chars:2000}})));
  const ctx={sources};
  assert.equal((await getSuggestion('zh',ctx)).title,'zh-news');
  assert.equal((await getSuggestion({lang:'ko',kind:'encyclopedia'},ctx)).title,'ko-wiki');
  assert.equal((await getSuggestion('zh',ctx)).title,'zh-news');
  for(const expected of ['zh-wiki','zh-lit','zh-news-2'])assert.equal((await skipSuggestion(ctx)).title,expected);
  assert.equal(await db.state('suggestion_kind:zh'),'news');
  assert.equal(await db.state('suggestion_kind:ko'),'encyclopedia');
  assert.equal((await getSuggestion('ko',ctx)).title,'ko-news');
  assert.equal((await skipSuggestion(ctx)).title,'ko-wiki');
});

function browser(t,fetch){
  const dom=new JSDOM('<main></main>',{url:'https://local.test/'});
  const controller=new dom.window.AbortController();
  const old=Object.getOwnPropertyDescriptors(globalThis);
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
    DOMParser:dom.window.DOMParser,IntersectionObserver:class {observe(){} disconnect(){}},fetch};
  for(const [k,value] of Object.entries(values))Object.defineProperty(globalThis,k,{value,writable:true,configurable:true});
  t.after(()=>{
    controller.abort();dom.window.close();
    for(const k of Object.keys(values))if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];
  });
  return {root:document.querySelector('main'),signal:controller.signal};
}

test('Home persists both filters, keeps titles hidden during validation, and counts the eligible pool',async t=>{
  const news=source('news','ko'),wiki=source('wiki','ko','wikipedia'),lit=source('series','zh','wikisource_series'),
    off={...source('off','ko'),enabled:false},ja=source('ja','ja');
  const sources=[news,wiki,lit,off,ja];
  const rows=[candidate('visible-news',news),candidate('visible-wiki',wiki),candidate('chapter1',lit,{series:'series',seq:1}),
    candidate('chapter2',lit,{series:'series',seq:2}),candidate('disabled',off),candidate('wrong-language',ja),
    candidate('wrong-topic',news,{topics:['society']}),candidate('read',news),candidate('skip',news),
    candidate('long',news,{est_chars:9000}),candidate('bad',news,{status:'bad'})];
  await db.batch('candidates',rows);
  await db.put('history',{canon:rows[7].canon});
  await db.put('skipped',{key:rows[8].canon});
  await db.put('settings',{key:'langs',value:['ko','zh']});
  await db.setState('home_filter',{lang:'ko',kind:'encyclopedia'});
  const started=Promise.withResolvers(),extracted=Promise.withResolvers();
  const {root,signal}=browser(t,async url=>{
    if(String(url).endsWith('/sources.json'))return Response.json(sources);
    if(String(url).startsWith('/proxy?')){
      started.resolve();
      return extracted.promise;
    }
    if(String(url).endsWith('/visible-wiki')){
      started.resolve();
      return extracted.promise;
    }
    throw Error('Unexpected fetch '+url);
  });
  // Korean runs locally, and an equal target keeps the fixture offline.
  await db.put('settings',{key:'target_lang',value:'ko'});
  await home(root,signal);
  await started.promise;
  assert.match(root.querySelector('.suggestion').textContent,/한.*Đang chuẩn bị bài…/);
  assert.equal(root.querySelector('.headline'),null);
  assert.equal(root.querySelector('[data-value=ko]').getAttribute('aria-pressed'),'true');
  assert.equal(root.querySelector('[data-value=encyclopedia]').getAttribute('aria-pressed'),'true');
  await waitFor(()=>root.textContent.includes('Chưa đọc: 中 1 · 日 0 · 한 2 · EN 0'));
  assert.equal((await eligibleCandidates({...defaults,langs:['ko','zh']},sources)).pool.length,3);
  extracted.resolve(new Response(body(31)));
  await waitFor(()=>root.querySelector('.headline')?.textContent==='visible-wiki');
  await waitFor(async()=>(await db.all('articles')).some(a=>a.canon===rows[1].canon));
  await root.querySelector('[data-value=literature]').onclick();
  assert.deepEqual(await db.state('home_filter'),{lang:'ko',kind:'literature'});
  assert.match(root.querySelector('.suggestion').textContent,/Chưa có bài phù hợp — bấm Cập nhật hoặc đổi độ dài trong Cài đặt/);
  const sourceGate=Promise.withResolvers();
  const refreshing=maybeRefresh(true,{sources:[source('first'),source('second')],DOMParser,
    net:{fetchText:async url=>({text:url.endsWith('/first')?feed('first',0):await sourceGate.promise})}});
  try{await waitFor(()=>root.textContent.includes('Đang cập nhật… (1/2 nguồn)'));}
  finally{sourceGate.resolve(feed('second',0));await refreshing;}
  await waitFor(()=>root.textContent.includes('Chưa đọc: 中 1 · 日 0 · 한 2 · EN 0'));
});

test('History counts are computed from the rendered entries',async t=>{
  const {root}=browser(t,()=>{throw Error('offline');});
  const entries=['zh','ko','ko'].map((lang,i)=>({canon:'https://example.org/'+i,url:'https://example.org/'+i,
    lang,title:'Bài '+i,finished_at:daysAgo(i)}));
  await db.batch('history',entries);
  await historyPage(root);
  assert.match(root.textContent,/Đã đọc: 3 bài · 中 1 · 日 0 · 한 2 · EN 0/);
  assert.deepEqual([...root.querySelectorAll('.stack h2')].map(e=>e.textContent),entries.map(e=>e.title));
});

test('Reader retries a paused article once, shows placeholders and progress, and lets the user retry again',async t=>{
  let requests=0;
  const next=Promise.withResolvers();
  const {root,signal}=browser(t,async url=>{
    if(String(url).endsWith('/sources.json'))return Response.json([]);
    requests++;
    if(requests<=2)throw Error('offline');
    return next.promise;
  });
  const s=(i,text,tr)=>({i,text,tr,tokens:[{s:text}],words:[]});
  await db.put('articles',{id:'paused',url:'https://example.org/paused',canon:'https://example.org/paused',lang:'en',target_lang:'vi',
    status:'ready',created_at:daysAgo(0),title:s(-1,'Title','Tiêu đề'),blocks:[{type:'p',sentences:[s(0,'Line',null)]}],
    progress:{translated:0,total:1,last_read:-1,tr_state:'paused'}});
  await db.put('settings',{key:'tr_mode',value:'blur'});
  document.body.classList.add('tr-blur');
  await reader(root,'paused',signal);
  const retry=[...root.querySelectorAll('.toolbar button')].find(b=>b.textContent==='⚠ Dịch tạm dừng ↻');
  const line=root.querySelector('.block .translation');
  await waitFor(()=>requests===2&&!retry.hidden&&line.textContent==='chưa dịch được');
  line.click();
  assert.ok(line.classList.contains('revealed'));
  const manual=retry.onclick();
  await waitFor(()=>requests===3&&retry.hidden&&line.textContent==='đang dịch…');
  assert.ok([...root.querySelectorAll('.toolbar span')].some(x=>!x.hidden&&x.textContent==='Dịch 0/1'));
  assert.equal(requests,3);
  next.resolve(Response.json(['Bản dịch']));
  await manual;
  await waitFor(()=>line.textContent==='Bản dịch');
  assert.ok(line.classList.contains('revealed'));
  assert.ok(retry.hidden&&[...root.querySelectorAll('.toolbar span')].filter(x=>x.textContent.startsWith('Dịch')).every(x=>x.hidden));
});

test('Reader omits translation status and placeholders when both languages are the same',async t=>{
  const {root,signal}=browser(t,async url=>{
    if(String(url).endsWith('/sources.json'))return Response.json([]);
    assert.fail('Same-language article should not request translation');
  });
  await db.put('settings',{key:'target_lang',value:'en'});
  const id=await openArticle('https://example.org/same',{lang:'en'},{DOMParser,net:{fetchText:async()=>({text:body(3)})}});
  assert.equal((await db.get('articles',id)).progress.tr_state,'done');
  await reader(root,id,signal);
  assert.ok([...root.querySelectorAll('.translation')].every(e=>e.hidden&&e.textContent===''));
  assert.ok([...root.querySelectorAll('.toolbar [hidden]')].some(e=>e.textContent==='⚠ Dịch tạm dừng ↻'));
});

test('Reader repairs a legacy empty translation recorded as complete',async t=>{
  const {root,signal}=browser(t,async url=>{
    if(String(url).endsWith('/sources.json'))return Response.json([]);
    return Response.json(['Bản dịch']);
  });
  const s=(i,text,tr)=>({i,text,tr,tokens:[{s:text}],words:[]});
  await db.put('articles',{id:'empty',url:'https://example.org/empty',canon:'https://example.org/empty',lang:'en',target_lang:'vi',
    status:'ready',created_at:daysAgo(0),title:s(-1,'Title','Tiêu đề'),blocks:[{type:'p',sentences:[s(0,'Line','')]}],
    progress:{translated:1,total:1,last_read:-1,tr_state:'done'}});
  await reader(root,'empty',signal);
  await waitFor(()=>root.querySelector('.block .translation').textContent==='Bản dịch');
  assert.equal((await db.get('articles','empty')).progress.translated,1);
});

test('Korean dictionary checks distinct eojeol stems rather than each syllable',async()=>{
  await db.put('dict_meta',{id:'ko-dict',lang:'ko'});
  await db.put('dict',{head:'책',lang:'ko'});
  const original=IDBIndex.prototype.getAll,checked=[];
  IDBIndex.prototype.getAll=function(query,...rest){
    if(this.name==='lang+head')checked.push(query[1]);
    return original.call(this,query,...rest);
  };
  try{
    const [result]=await analyze('ko',['정치는 책이 책이 사이']);
    assert.deepEqual(new Set(checked),new Set(['정치','책','사']));
    assert.deepEqual(result.words.map(w=>w.lemma),['정치','는','책','이','책','이','사이']);
  }finally{IDBIndex.prototype.getAll=original;}
});
