import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {Readability} from '@mozilla/readability';
import {openArticle,resumeTranslation} from '../web/core/article.js';
import {defaults} from '../web/core/settings.js';
import * as db from '../web/core/db.js';
import * as net from '../web/core/net.js';
import {original} from '../web/ui/reader.js';

test('Pasted article, translated title, reader markup and resume',async()=>{
  const dom=new JSDOM(''), DOMParser=dom.window.DOMParser;
  const html=await readFile(new URL('fixtures/news.html',import.meta.url),'utf8');
  const calls=[];
  const ctx={DOMParser,Readability,settings:defaults,net:{
    fetchText:async()=>({text:html}),fetchJSON:async(_,opts)=>{
      const text=new URLSearchParams(opts.body).get('q');calls.push(text);
      return {sentences:[{trans:text.split('\n').map(s=>'Dịch '+s).join('\n')}]};
    }
  }};
  const url='https://example.org/article?utm_source=test';
  const id=await openArticle(url,{},ctx);await resumeTranslation(id,ctx);
  const a=await db.get('articles',id);
  assert.match(id,/^[0-9a-f]{16}$/);assert.equal(a.title.i,-1);assert.equal(a.title.text,calls[0]);
  assert.equal(a.progress.translated,a.stats.sentences);assert.equal(a.progress.tr_state,'done');
  assert.equal(a.canon,'https://example.org/article');assert.equal(a.lang,'en');
  const parts=a.blocks.flatMap(b=>b.sentences);
  assert.deepEqual(parts.map(s=>s.i),parts.map((_,i)=>i));
  assert.ok(parts.every(s=>s.tr.startsWith('Dịch ')&&s.text===s.tokens.map(t=>t.s).join('')));
  await db.update('articles',id,current=>{current.progress.last_read=1;return current;});
  assert.equal(await openArticle(a.canon,{},ctx),id);assert.equal((await db.get('articles',id)).progress.last_read,1);
  globalThis.document=dom.window.document;
  try{
    const line=original({tokens:[{s:'食',r:'た',w:0},{s:'べる',w:0},{s:'<img onerror=alert(1)>'}],words:[{pos:'v'}]});
    assert.equal(line.querySelectorAll('.w').length,1);assert.equal(line.querySelector('ruby rt').textContent,'た');
    assert.equal(line.querySelector('img'),null);assert.ok(line.textContent.includes('<img'));
  }finally{delete globalThis.document;dom.window.close();}
});

test('Native HTTP handles Capacitor parsed JSON and base64 bytes',async()=>{
  net.configureNet({mode:'native'});
  const json={sentences:[{trans:'bản dịch'}]};
  let reply={status:200,headers:{'Content-Type':'application/json'},data:json};
  globalThis.Capacitor={Plugins:{CapacitorHttp:{request:async options=>{
    assert.equal(options.responseType,'arraybuffer');return reply;
  }}}};
  try{
    assert.deepEqual(await net.fetchJSON('https://example.org'),json);
    reply={status:200,headers:{'Content-Type':'application/octet-stream'},data:'AAEC/w=='};
    assert.deepEqual((await net.fetchBytes('https://example.org')).bytes,Uint8Array.of(0,1,2,255));
  }finally{delete globalThis.Capacitor;net.configureNet({mode:'node'});}
});
