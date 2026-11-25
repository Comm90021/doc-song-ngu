// End-to-end UI check of the PC build through headless Edge (CDP).
// Usage: node tools/e2e_shots.mjs   (needs the app on 127.0.0.1:8799 and Edge on --remote-debugging-port=9333)
// Writes screenshots to docs/shots/ and a JSON result file to E2E_OUT (default: scratchpad).
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs', 'shots');
const LEDGER = path.join(ROOT, 'data', 'da_doc.jsonl');
const OUT = process.env.E2E_OUT || 'C:/Users/duong/AppData/Local/Temp/claude/ab2e2f96aeb18b2d/e57b258a-4ace-4f13-b1e4-74941dc8edec/scratchpad/e2e_results.json';
const APP = 'http://127.0.0.1:8799';
const CDP_HTTP = 'http://127.0.0.1:9333';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = {checks: [], timings: {}, overflow: [], shots: [], console: {}, articles: {}, notes: []};
function check(flow, name, pass, detail = '') {
  R.checks.push({flow, name, pass: !!pass, detail: String(detail).slice(0, 500)});
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${flow} | ${name} | ${String(detail).slice(0, 300)}`);
}
function note(text) { R.notes.push(text); console.log('NOTE: ' + text); }

// ---------- CDP plumbing ----------
const ver = await (await fetch(CDP_HTTP + '/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('websocket error')); });
let nid = 1, SID = null;
const pend = new Map(), evHandlers = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pend.get(m.id); if (!p) return; pend.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else if (SID && m.sessionId === SID) for (const h of evHandlers) h(m.method, m.params);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nid++; pend.set(id, {res, rej});
  ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
});
const call = (method, params = {}) => send(method, params, SID);
function rec(kind, text) { const k = kind + ': ' + String(text).slice(0, 300); R.console[k] = (R.console[k] || 0) + 1; }
evHandlers.push((method, p) => {
  if (method === 'Runtime.consoleAPICalled' && p.type === 'error')
    rec('console.error', p.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  if (method === 'Runtime.exceptionThrown') { const d = p.exceptionDetails; rec('exception', d.exception?.description || d.text); }
  if (method === 'Log.entryAdded' && p.entry.level === 'error')
    rec('log.' + p.entry.source, p.entry.text + (p.entry.url ? ' @' + p.entry.url : ''));
});

const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
SID = sessionId;
await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');

async function ev(expr) {
  const r = await call('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, timeout = 10000, step = 300) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await ev(expr); if (v) return {ok: true, ms: Date.now() - t0, value: v}; } catch {}
    await sleep(step);
  }
  return {ok: false, ms: Date.now() - t0, value: null};
}
async function go(url) { await call('Page.navigate', {url}); await waitFor(`document.readyState==='complete'`, 20000); }
async function hash(h) { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(300); }
async function phone() {
  await call('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
  await call('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  await sleep(400);
}
async function desktop() {
  await call('Emulation.setDeviceMetricsOverride', {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});
  await call('Emulation.setTouchEmulationEnabled', {enabled: false});
  await sleep(400);
}
async function overflow(label) {
  const r = await ev(`({sw:document.documentElement.scrollWidth,iw:innerWidth})`);
  const ok = r.sw <= r.iw;
  R.overflow.push({label, scrollWidth: r.sw, innerWidth: r.iw, ok});
  return ok;
}
async function shot(name) {
  const r = await call('Page.captureScreenshot', {format: 'png'});
  const file = path.join(SHOTS, name + '.png');
  await writeFile(file, Buffer.from(r.data, 'base64'));
  R.shots.push(file);
  return file;
}
// Tap at the centre of the element returned by `expr` (scrolls it into view first).
async function tapEl(expr) {
  const found = await ev(`(()=>{const e=(${expr});if(!e)return false;e.scrollIntoView({block:'center'});return true;})()`);
  if (!found) throw new Error('no element for tap: ' + expr.slice(0, 90));
  await sleep(400);
  const c = await ev(`(()=>{const e=(${expr});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await call('Input.dispatchMouseEvent', {type: 'mouseMoved', x: c.x, y: c.y});
  await call('Input.dispatchMouseEvent', {type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1});
  await call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1});
  return c;
}
async function swipeUp(x, y, dy = -200) {
  await call('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  for (let i = 1; i <= 5; i++) {
    await call('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y + dy * i / 5, id: 1}]});
    await sleep(40);
  }
  await call('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}
const btnExpr = text => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const VISIBLE_WORD = `[...document.querySelectorAll('.paper .w')].find(e=>{const r=e.getBoundingClientRect();return r.top>140&&r.bottom<innerHeight-60;})`;
const POPUP_CLOSE = `[...document.querySelectorAll('.popup button')].find(b=>b.textContent.trim()==='✕')`;
// E2E_MIN_TR=0 lets the reader count as ready before any translation arrives (degraded mode when Google is rate-limiting).
const MIN_TR = Number(process.env.E2E_MIN_TR ?? 5);
const READY = `(()=>{const p=document.querySelector('.paper');if(!p)return false;const sents=[...p.querySelectorAll('.block .sentence')];const tr=sents.filter(s=>(s.querySelector('.translation')?.textContent||'').trim()).length;return sents.length>0&&tr>=${MIN_TR};})()`;
const STATS = `(()=>{const p=document.querySelector('.paper');const sents=[...p.querySelectorAll('.block .sentence')];const han=sents.filter(s=>/\\p{Script=Han}/u.test(s.querySelector('.original')?.textContent||''));return {lang_attr:p.lang,ruby:p.querySelectorAll('ruby').length,sentences:sents.length,translated:sents.filter(s=>(s.querySelector('.translation')?.textContent||'').trim()).length,han:han.length,han_ruby:han.filter(s=>s.querySelector('ruby')).length,hash:location.hash,title:document.querySelector('.short-title')?.textContent||''};})()`;
const IDB_ALL = store => `new Promise((res,rej)=>{const r=indexedDB.open('docsongngu',1);r.onsuccess=()=>{const q=r.result.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(String(q.error));};r.onerror=()=>rej(String(r.error));})`;

// Pick one real article per language from the live candidate pool (title hint from docs/test_report.md smoke rows, else smoke source id).
const TITLE_HINT = {ja: '自民 小野寺', zh: '宏福苑', ko: '북한 급변사태', en: 'Moving to Florida'};
const SRC_HINT = {ja: 'nhk-seiji', zh: 'bbc-zh', ko: 'yna-politics', en: 'npr-politics'};
function pickCandidate(cands, lang) {
  const byTitle = cands.find(c => c.lang === lang && c.status === 'new' && c.title?.includes(TITLE_HINT[lang]));
  if (byTitle) return {c: byTitle, how: 'title hint'};
  const bySrc = cands.filter(c => c.lang === lang && c.status === 'new' && c.source_id === SRC_HINT[lang]);
  if (bySrc.length) return {c: bySrc[0], how: 'source id'};
  const any = cands.filter(c => c.lang === lang && c.status === 'new');
  return {c: any[0], how: 'any new candidate'};
}

async function dictPopup(tag, maxTries) {
  for (let k = 0; k < maxTries; k++) {
    const n = await ev(`document.querySelectorAll('.paper .w').length`);
    if (k >= n) break;
    await tapEl(`document.querySelectorAll('.paper .w')[${k}]`);
    const st = await waitFor(`(()=>{const p=document.querySelector('.popup');if(!p)return false;const t=p.textContent;return t.length>20&&!t.includes('Đang tra…')?t:false;})()`, 15000);
    const text = st.value || '';
    if (text.includes(tag)) return {k, text: text.slice(0, 300)};
    await tapEl(POPUP_CLOSE).catch(() => {});
    await sleep(200);
  }
  return null;
}

// ---------- start ----------
await mkdir(SHOTS, {recursive: true});
await phone();
let CANDS = [];

// a. Home
try {
  let t0 = Date.now();
  await go(APP + '/#/');
  const w = await waitFor(`(document.querySelector('.suggestion .headline')?.textContent||'').trim().length>0`, 180000);
  R.timings.home_first_suggestion_ms = Date.now() - t0;
  check('a home', 'suggestion card with title appears (≤180 s)', w.ok, `after ${Math.round(w.ms / 1000)} s`);
  await sleep(500);
  await shot('home_390'); check('a home', 'no horizontal overflow at 390', await overflow('home_390'));
  await desktop(); await sleep(600);
  await shot('home_1280'); check('a home', 'no horizontal overflow at 1280', await overflow('home_1280'));
  await phone(); await sleep(400);
  CANDS = await ev(IDB_ALL('candidates'));
  const langs = {}; for (const c of CANDS) langs[c.lang] = (langs[c.lang] || 0) + 1;
  note('candidate pool by language: ' + JSON.stringify(langs));
} catch (e) { check('a home', 'flow ran', false, e.message); }

// b. Paste a link per language
for (const lang of ['ja', 'zh', 'ko', 'en']) {
  try {
    const pick = pickCandidate(CANDS, lang);
    if (!pick.c) throw new Error('no candidate in pool for ' + lang);
    note(`${lang}: pasted URL chosen by ${pick.how}: ${pick.c.title} (${pick.c.source_id})`);
    await hash('#/');
    await waitFor(`!!document.querySelector('input[type=url]')`, 15000);
    await ev(`(()=>{const i=document.querySelector('input[type=url]');i.value=${JSON.stringify(pick.c.url)};i.dispatchEvent(new Event('input',{bubbles:true}));return i.value;})()`);
    const t0 = Date.now();
    await tapEl(btnExpr('Mở'));
    const ready = await waitFor(READY, 120000, 500);
    R.timings['reader_' + lang + '_ready_ms'] = Date.now() - t0;
    if (!ready.ok) {
      const txt = await ev(`document.querySelector('#app').innerText.slice(0,300)`).catch(() => '');
      throw new Error('reader not ready in 120 s; page says: ' + txt.replace(/\s+/g, ' '));
    }
    if (!process.env.E2E_NO_TR) await waitFor(`(()=>{const s=[...document.querySelectorAll('.paper .block .sentence')];return s.length>0&&s.every(x=>(x.querySelector('.translation')?.textContent||'').trim());})()`, 60000, 500);
    R.timings['reader_' + lang + '_all_translated_ms'] = Date.now() - t0;
    const st = await ev(STATS);
    const id = st.hash.replace('#/doc/', '');
    R.articles[lang] = {id, url: pick.c.url, title: st.title, sentences: st.sentences, translated: st.translated, ruby: st.ruby, han: st.han, han_ruby: st.han_ruby, lang_attr: st.lang_attr};
    await shot('reader_' + lang);
    const ovf = await overflow('reader_' + lang);
    check('b reader ' + lang, 'article renders with ≥5 translations', st.translated >= 5, `${st.translated}/${st.sentences} translated, lang=${st.lang_attr}, ruby=${st.ruby}, han=${st.han}, han_ruby=${st.han_ruby}`);
    check('b reader ' + lang, 'all sentences translated (SPEC ≥95 %)', st.translated / st.sentences >= 0.95, `${Math.round(100 * st.translated / st.sentences)} %`);
    if (lang === 'ja' || lang === 'zh') check('b reader ' + lang, 'Han sentences have readings (SPEC ≥90 %)', st.han > 0 && st.han_ruby / st.han >= 0.9, `${st.han_ruby}/${st.han}`);
    check('b reader ' + lang, 'no horizontal overflow', ovf);
  } catch (e) { check('b reader ' + lang, 'flow ran', false, e.message); }
}

// c. Lookup popup (ja)
try {
  if (!R.articles.ja) throw new Error('no ja article');
  await hash('#/doc/' + R.articles.ja.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await waitFor(`!!document.querySelector('.paper .w:has(ruby)')`, 15000);
  const t0 = Date.now();
  await tapEl(`document.querySelector('.paper .w:has(ruby)')`);
  const pop = await waitFor(`!!document.querySelector('.popup')`, 10000, 100);
  const loaded = await waitFor(`(()=>{const p=document.querySelector('.popup');return p&&!p.textContent.includes('Đang tra…');})()`, 15000);
  R.timings.popup_ja_ms = Date.now() - t0;
  check('c popup ja', 'tap on ruby word opens .popup', pop.ok && loaded.ok, `${pop.ms} ms to open`);
  const pt = await ev(`document.querySelector('.popup')?.innerText.slice(0,200)||''`);
  await shot('popup_ja');
  check('c popup ja', 'popup has content', pt.length > 10, pt.replace(/\s+/g, ' '));
  await tapEl(POPUP_CLOSE);
  check('c popup ja', '✕ closes popup', (await waitFor(`!document.querySelector('.popup')`, 2000)).ok);

  // swipe starting on a word: must not open popup
  const c1 = await ev(`(()=>{const e=(${VISIBLE_WORD});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await swipeUp(c1.x, c1.y, -200);
  await sleep(1000);
  check('c popup ja', 'vertical swipe on a word: no popup within 1 s', !(await ev(`!!document.querySelector('.popup')`)));

  // lookup OFF
  await tapEl(btnExpr('Tra từ'));
  await sleep(300);
  const pressedOff = await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Tra từ')?.getAttribute('aria-pressed')`);
  await tapEl(VISIBLE_WORD);
  await sleep(1000);
  check('c popup ja', 'Tra từ OFF (aria-pressed=' + pressedOff + '): tap on word gives no popup', !(await ev(`!!document.querySelector('.popup')`)));
  await tapEl(btnExpr('Tra từ'));
  await sleep(300);
  const pressedOn = await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Tra từ')?.getAttribute('aria-pressed')`);
  check('c popup ja', 'Tra từ turned back ON', pressedOn === 'true', 'aria-pressed=' + pressedOn);
} catch (e) { check('c popup ja', 'flow ran', false, e.message); }

// d. Dictionary packs and popup tags
try {
  await hash('#/cai-dat');
  await waitFor(`document.querySelectorAll('.pack').length>=2`, 20000);
  await sleep(300);
  await shot('settings_390');
  check('d dict', 'settings page at 390 has no horizontal overflow', await overflow('settings_390'));
  for (const [name, key] of [['CVDICT', 'CVDICT'], ['JMdict', 'JMdict']]) {
    const t0 = Date.now();
    const packExpr = `[...document.querySelectorAll('.pack')].find(p=>p.textContent.includes(${JSON.stringify(key)}))`;
    const state = await ev(`(()=>{const p=${packExpr};return p?p.innerText.replace(/\\s+/g,' '):null;})()`);
    if (!state) throw new Error(name + ' pack not in settings');
    if (!/mục từ/.test(state)) {
      await tapEl(`${packExpr}.querySelector('button')`);
      const done = await waitFor(`(()=>{const p=${packExpr};return p&&/mục từ/.test(p.textContent);})()`, 180000, 1000);
      R.timings['install_' + name + '_ms'] = Date.now() - t0;
      check('d dict', name + ' installs (≤180 s)', done.ok, `${Math.round((Date.now() - t0) / 1000)} s`);
    } else check('d dict', name + ' already installed', true, state);
  }
  // zh reader: entry tagged Việt
  if (!R.articles.zh) throw new Error('no zh article');
  await hash('#/doc/' + R.articles.zh.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await sleep(500);
  const zh = await dictPopup('· Việt', 25);
  check('d dict', 'zh reader: popup shows an entry tagged Việt', !!zh, zh ? 'word #' + zh.k + ': ' + zh.text.replace(/\s+/g, ' ') : 'none of the first 25 words');
  if (zh) { await shot('popup_zh'); await tapEl(POPUP_CLOSE).catch(() => {}); }
  // ja reader: entry tagged Anh
  await hash('#/doc/' + R.articles.ja.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await sleep(500);
  const ja = await dictPopup('· Anh', 40);
  check('d dict', 'ja reader: popup shows an entry tagged Anh', !!ja, ja ? 'word #' + ja.k + ': ' + ja.text.replace(/\s+/g, ' ') : 'none of the first 40 words');
  if (ja) await shot('popup_ja_dict');
  await tapEl(POPUP_CLOSE).catch(() => {});
} catch (e) { check('d dict', 'flow ran', false, e.message); }

// e. Finish flow with the shortest article
try {
  const [finLang, fin] = Object.entries(R.articles).sort((a, b) => a[1].sentences - b[1].sentences)[0];
  note(`finish flow uses ${finLang} article (${fin.sentences} sentences)`);
  await hash('#/doc/' + fin.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await sleep(500);
  const isEnabled = `(()=>{const b=${btnExpr('✓ Đã đọc xong')};return !!b&&!b.disabled;})()`;
  const t0 = Date.now();
  let enabled = false;
  for (let i = 0; i < 400 && !enabled; i++) {
    await ev(`window.scrollBy(0,300)`);
    await sleep(150);
    enabled = await ev(isEnabled);
  }
  R.timings.finish_scroll_ms = Date.now() - t0;
  check('e finish', 'scrolling to the end enables "✓ Đã đọc xong"', enabled, `${Math.round((Date.now() - t0) / 1000)} s of scrolling`);
  if (!enabled) throw new Error('finish button never enabled');
  await tapEl(btnExpr('✓ Đã đọc xong'));
  const back = await waitFor(`location.hash==='#/'`, 15000);
  check('e finish', 'after finish: back to #/', back.ok);
  await sleep(800);
  await hash('#/lich-su');
  const title10 = fin.title.slice(0, 10);
  const inHist = await waitFor(`document.querySelector('#app').textContent.includes(${JSON.stringify(title10)})`, 10000);
  await sleep(300);
  await shot('history_390');
  check('e finish', 'article title listed in Lịch sử', inHist.ok, title10 + '…');
  check('e finish', 'history page no horizontal overflow', await overflow('history_390'));
  let ledgerOk = false, ledgerDetail = 'data\\da_doc.jsonl missing';
  if (existsSync(LEDGER)) {
    const lines = (await readFile(LEDGER, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
    ledgerOk = lines.some(x => x.url === fin.url);
    ledgerDetail = `${lines.length} lines, url present=${ledgerOk}`;
  }
  check('e finish', 'ledger data\\da_doc.jsonl contains the URL', ledgerOk, ledgerDetail);
  // reload: finished canon must not be the current suggestion
  const finCand = CANDS.find(c => c.url === fin.url);
  await go(APP + '/#/');
  await waitFor(`(document.querySelector('.suggestion .headline')?.textContent||'').trim().length>0`, 60000);
  await sleep(800);
  const cur = await ev(`(async()=>{const rows=${IDB_ALL('state')};const s=await rows;return JSON.stringify((s.find(x=>x.key==='current_suggestion')||{}).value||null);})()`);
  const headline = await ev(`(document.querySelector('.suggestion .headline')?.textContent||'').trim()`);
  const notSame = !finCand || !cur.includes(finCand.canon);
  check('e finish', 'after reload the finished article is not the current suggestion', notSame && headline !== fin.title, `headline="${headline.slice(0, 60)}"`);
} catch (e) { check('e finish', 'flow ran', false, e.message); }

// f. Toggles in a reader (not the finished one)
try {
  const other = R.articles.ja && R.articles.ja.id !== (Object.entries(R.articles).sort((a, b) => a[1].sentences - b[1].sentences)[0][1].id) ? R.articles.ja : R.articles.zh;
  await hash('#/doc/' + other.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await sleep(400);
  const cls = () => ev(`document.body.className`);
  const before = await cls();
  await tapEl(btnExpr('Dịch'));
  const c1 = await waitFor(`document.body.classList.contains('tr-blur')`, 3000);
  await tapEl(btnExpr('Dịch'));
  const c2 = await waitFor(`document.body.classList.contains('tr-hide')`, 3000);
  await tapEl(btnExpr('Dịch'));
  const c3 = await waitFor(`!document.body.classList.contains('tr-hide')&&!document.body.classList.contains('tr-blur')`, 3000);
  check('f toggles', 'Dịch cycles show → blur → hide → show', c1.ok && c2.ok && c3.ok, `before="${before}" blur=${c1.ok} hide=${c2.ok} show=${c3.ok}`);
  await tapEl(btnExpr('Âm'));
  const r1 = await waitFor(`document.body.classList.contains('ruby-off')`, 3000);
  await tapEl(btnExpr('Âm'));
  const r2 = await waitFor(`!document.body.classList.contains('ruby-off')`, 3000);
  check('f toggles', 'Âm toggles ruby-off', r1.ok && r2.ok, `off=${r1.ok} on=${r2.ok}`);
  await tapEl(btnExpr('Dịch'));
  await waitFor(`document.body.classList.contains('tr-blur')`, 3000);
  await sleep(300);
  await shot('reader_toggles');
  check('f toggles', 'reader_toggles at 390 has no horizontal overflow', await overflow('reader_toggles'));
  await tapEl(btnExpr('Dịch')); await tapEl(btnExpr('Dịch'));
  await waitFor(`!document.body.classList.contains('tr-blur')&&!document.body.classList.contains('tr-hide')`, 3000);
} catch (e) { check('f toggles', 'flow ran', false, e.message); }

// Desktop reader check (1280) for the zh article, then done
try {
  await desktop();
  await hash('#/doc/' + R.articles.zh.id);
  await waitFor(`!!document.querySelector('.paper')`, 15000);
  await sleep(600);
  check('f toggles', 'zh reader at 1280: no horizontal overflow', await overflow('reader_1280_zh'));
  await shot('reader_1280_zh');
  await phone();
} catch (e) { check('f toggles', 'desktop reader ran', false, e.message); }

// ---------- finish ----------
R.consoleList = Object.entries(R.console).map(([k, n]) => ({message: k, count: n}));
await writeFile(OUT, JSON.stringify(R, null, 2), 'utf8');
console.log('RESULTS ' + OUT);
try { await send('Browser.close', {}); } catch {}
ws.close();
