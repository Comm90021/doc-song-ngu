// Tự kiểm app Android trên máy ảo: điều khiển WebView qua Chrome DevTools Protocol (adb forward tcp:9222).
// Dùng: node tools/android_e2e.mjs <cổng> <thư_mục_kết_quả>. Ghi report.json + ảnh chụp *.png; exit 1 nếu có thứ tiếng hỏng.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
const [, , port = '9222', out = 'e2e'] = process.argv;
mkdirSync(out, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [], say = (...a) => {const l = a.join(' '); console.log(l); lines.push(l);};
if (typeof WebSocket === 'undefined') {say('FAIL: Node không có WebSocket'); process.exit(1);}

let pages = [];
for (let i = 0; i < 90; i++) {
  try {pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.some(p => p.type === 'page')) break;} catch {}
  await sleep(1000);
}
const page = pages.find(p => p.type === 'page' && /localhost/.test(p.url)) || pages.find(p => p.type === 'page');
if (!page) {say('FAIL: không thấy WebView', JSON.stringify(pages)); process.exit(1);}
say('WebView:', page.url);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
let seq = 0;
const waiting = new Map(), problems = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {waiting.get(m.id)(m); waiting.delete(m.id); return;}
  if (m.method === 'Runtime.exceptionThrown') {const d = m.params.exceptionDetails; problems.push('exception: ' + String(d.exception?.description || d.text).slice(0, 300));}
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
    problems.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
};
const send = (method, params = {}) => new Promise(r => {const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({id, method, params}));});
async function js(expression) {
  const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (r.result?.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
function shot(name) {
  try {writeFileSync(`${out}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 << 20}));}
  catch (e) {say('screencap lỗi:', e.message);}
}
async function until(label, expression, seconds) {
  const start = Date.now();
  while (Date.now() - start < seconds * 1000) {
    let value = null;
    try {value = await js(expression);} catch {}
    if (value) {say(`  ok ${label} (${Math.round((Date.now() - start) / 1000)}s)`); return value;}
    await sleep(1500);
  }
  say(`  TIMEOUT ${seconds}s: ${label}`);
  return null;
}
const home = async () => {await js(`location.hash='/'`); await sleep(1500);};
const chip = value => js(`document.querySelector('.chip[data-value="${value}"]')?.click()`);
const cardText = lang => `(()=>{const s=document.querySelector('.suggestion');return s&&s.querySelector('.badge${lang ? '.' + lang : ''}')&&/Đọc ngay/.test(s.innerText)?s.innerText.replace(/\\s+/g,' ').slice(0,220):null})()`;

await send('Runtime.enable');
const report = {started: new Date().toISOString(), langs: {}};

// 1. Trang chủ: cập nhật kho → có bài đề xuất + dòng thống kê.
say('== Trang chủ');
report.home = await until('bài đề xuất đầu tiên', `(()=>{const c=${cardText('')};const st=[...document.querySelectorAll('span.muted')].map(x=>x.textContent).find(t=>/Chưa đọc:/.test(t));return c&&st?{card:c,stats:st}:null})()`, 300);
say('  ', JSON.stringify(report.home));
shot('01_home');

// 2. Từng thứ tiếng: chọn chip → đề xuất → Đọc ngay → phiên âm, bản dịch, ô tra từ.
for (const lang of ['ja', 'zh', 'ko', 'en']) {
  say('== ' + lang);
  const r = report.langs[lang] = {};
  await home(); await chip(lang);
  r.suggestion = await until('đề xuất ' + lang, cardText(lang), 240);
  if (!r.suggestion) {r.home = await js(`document.querySelector('.suggestion')?.innerText`); shot(`${lang}_0_no_suggestion`); continue;}
  await js(`[...document.querySelectorAll('.suggestion button')].find(b=>b.textContent==='Đọc ngay').click()`);
  r.opened = await until('mở bài ' + lang, `location.hash.startsWith('#/doc/')&&document.querySelector('article.paper .block .sentence')?true:null`, 180);
  if (!r.opened) {r.page = await js(`document.body.innerText.slice(0,400)`); shot(`${lang}_1_open_failed`); continue;}
  r.translated = await until('dịch 10 câu đầu ' + lang, `(()=>{const t=[...document.querySelectorAll('article.paper .translation')].slice(0,12);const ok=t.filter(x=>x.textContent.trim()&&!/^(đang dịch…|chưa dịch được)$/.test(x.textContent));return ok.length>=Math.min(10,t.length)?ok.length+'/'+t.length:null})()`, 120);
  r.view = await js(`(()=>{const b=document.querySelector('article.paper');return {sentences:b.querySelectorAll('.sentence').length,ruby:b.querySelectorAll('rt').length,
    first:[...b.querySelectorAll('.block .sentence')].slice(0,2).map(s=>({orig:s.querySelector('.original').textContent.slice(0,70),rt:[...s.querySelectorAll('rt')].slice(0,6).map(x=>x.textContent).join(' '),tr:s.querySelector('.translation').textContent.slice(0,90)})),
    toolbar:document.querySelector('.toolbar').innerText.replace(/\\s+/g,' ')}})()`);
  say('  ', JSON.stringify(r.view));
  shot(`${lang}_2_reader`);
  // Chạm một từ (≥ 2 ký tự, ở thân bài) → ô tra từ.
  const found = await js(`(()=>{const w=[...document.querySelectorAll('article.paper .block .w')].find(x=>x.textContent.replace(/\\s/g,'').length>=2);if(!w)return false;w.id='e2e-word';w.scrollIntoView({block:'center'});return true})()`);
  if (found) {
    await sleep(900);
    const p = await js(`(()=>{const r=document.getElementById('e2e-word').getBoundingClientRect();return {x:r.left+Math.min(r.width/2,24),y:r.bottom-Math.min(r.height*0.3,10),word:document.getElementById('e2e-word').textContent}})()`);
    await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1});
    await sleep(60);
    await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1});
    r.word = p.word;
    r.popup = await until('ô tra từ ' + lang, `(()=>{const p=document.querySelector('aside.popup');return p&&p.innerText.replace(/\\s+/g,' ').length>p.querySelector('.popup-title').textContent.length+12?p.innerText.replace(/\\s+/g,' ').slice(0,300):null})()`, 40);
    shot(`${lang}_3_popup`);
    await js(`document.querySelector('aside.popup button')?.click()`);
  }
}

// 3. Bách khoa (Wikipedia) cho tiếng Trung và tiếng Hàn.
for (const lang of ['zh', 'ko']) {
  say('== wiki ' + lang);
  await home(); await chip(lang); await sleep(300); await chip('encyclopedia');
  report['wiki_' + lang] = await until('Wikipedia ' + lang, cardText(lang), 240);
  shot(`wiki_${lang}`);
}
await js(`[...document.querySelectorAll('.kind-chips .chip')].find(b=>b.dataset.value==='all')?.click()`);
await sleep(500);
await js(`document.querySelector('.chip[data-value="all"]')?.click()`);

report.problems = problems;
report.finished = new Date().toISOString();
const failed = Object.entries(report.langs).filter(([lang, r]) => !r.suggestion || !r.opened || !r.translated || (['ja', 'zh'].includes(lang) && !r.view?.ruby)).map(([lang]) => lang);
report.failed = failed;
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${out}/log.txt`, lines.join('\n') + '\n\nproblems:\n' + problems.join('\n'));
say('problems:', problems.length, '| failed:', failed.join(',') || 'none');
ws.close();
process.exit(failed.length ? 1 : 0);
