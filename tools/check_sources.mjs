// Kiểm tra các nguồn bài đọc cho web/sources.json (SPEC §4.4, §6.1, §6.9).
// Chạy: node tools/check_sources.mjs [id1,id2,...]   (không đối số = chạy tất cả)
// Không ghi file nào; in bảng tóm tắt + JSON kết quả ra stdout. Không có mạng thì mọi nguồn FAIL.
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { unzipSync } from 'fflate';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const API_UA = 'DocSongNgu/0.1 (personal reading app)';
const MIN_GAP_MS = 550; // <= 2 request/giây, tuần tự
const WIKI_GAP_MS = 1100; // Wikimedia: ~1 request/giây để không bị 429
let lastReqAt = 0;

async function pace(gap) {
  const wait = lastReqAt + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

// Mọi request đi qua đây. wiki=true → gửi Api-User-Agent (yêu cầu của Wikimedia), chậm hơn, thử lại khi 429/503.
async function get(url, { wiki = false, timeout = 30000 } = {}) {
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Language': 'en,ja;q=0.8,zh;q=0.7,ko;q=0.6',
  };
  if (wiki) headers['Api-User-Agent'] = API_UA;
  for (let attempt = 0; ; attempt++) {
    await pace(wiki ? WIKI_GAP_MS : MIN_GAP_MS);
    try {
      const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
      if ((r.status === 429 || r.status === 503) && attempt < 4) {
        const ra = Number(r.headers.get('retry-after')) || 0;
        await new Promise((res) => setTimeout(res, Math.max(ra * 1000, 4000 * 2 ** attempt)));
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      return { ok: r.ok, status: r.status, buf, ct: r.headers.get('content-type') || '', url: r.url || url, error: '' };
    } catch (e) {
      const code = e.cause?.code || e.cause?.message || e.message;
      return { ok: false, status: 0, buf: new Uint8Array(0), ct: '', url, error: String(code) };
    }
  }
}

function decode(buf, ct) {
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 4096));
  const m1 = /charset\s*=\s*["']?([\w-]+)/i.exec(ct);
  const m2 = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
  const cs = (m1 && m1[1]) || (m2 && m2[1]) || 'utf-8';
  try {
    return new TextDecoder(cs.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

const dec = (buf) => new TextDecoder('utf-8').decode(buf);
const norm = (s) =>
  (s || '')
    .replace(/ /g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

function parseHTML(html, url) {
  return new JSDOM(html, { url, virtualConsole: new VirtualConsole() }).window.document;
}

// Tỉ lệ chữ theo hệ chữ viết
function scriptCounts(t) {
  const c = { han: 0, kana: 0, hangul: 0, latin: 0 };
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) c.han++;
    else if (cp >= 0x3040 && cp <= 0x30ff) c.kana++;
    else if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f)) c.hangul++;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) c.latin++;
  }
  return c;
}
function scriptInfo(t) {
  const c = scriptCounts(t);
  const tot = c.han + c.kana + c.hangul + c.latin || 1;
  return ['han', 'kana', 'hangul', 'latin'].map((k) => `${k} ${Math.round((100 * c[k]) / tot)}%`).join(' ');
}
// Đúng ngôn ngữ theo tỉ lệ hệ chữ. zh/ja không phân biệt giản/phồn bằng script — ghi chú trong báo cáo.
function langOk(lang, t) {
  const c = scriptCounts(t);
  const cjk = c.han + c.kana + c.hangul;
  const letters = cjk + c.latin;
  if (letters === 0) return false;
  if (lang === 'en') return c.latin / letters >= 0.9;
  if (lang === 'ja') return c.kana >= 0.15 * (c.han + c.kana) && c.hangul < 0.02 * letters;
  if (lang === 'zh') return c.han >= 0.5 * letters && c.kana < 0.03 * cjk && c.hangul < 0.03 * cjk;
  if (lang === 'ko') return c.hangul >= 0.6 * cjk && c.kana < 0.03 * cjk;
  return false;
}

// Tường trả phí / cookie: chỉ đáng ngờ khi bài ngắn
const WALL = /subscribe|subscription|sign in|log in|login|paywall|購読|会員登録|ログイン|订阅|訂閱|登录|登錄|구독|로그인|회원가입|유료/i;

function extractMain(html, url) {
  let text = '';
  let method = 'readability';
  try {
    const art = new Readability(parseHTML(html, url)).parse();
    if (art && art.textContent) text = norm(art.textContent);
  } catch {
    text = '';
  }
  if (text.length < 300) {
    const d2 = parseHTML(html, url);
    d2.querySelectorAll('script,style,noscript').forEach((e) => e.remove());
    const fb = Array.from(d2.querySelectorAll('p,h2,h3,li'))
      .map((e) => norm(e.textContent))
      .filter((s) => s.length >= 40)
      .join('\n');
    if (fb.length > text.length) {
      text = fb;
      method = 'fallback';
    }
  }
  return { text, method };
}

async function checkArticle(url, lang, minLen) {
  const r = await get(url);
  if (!r.ok) return { url, pass: false, status: r.status, error: r.error, len: 0 };
  const html = decode(r.buf, r.ct);
  const { text, method } = extractMain(html, r.url);
  const len = text.length;
  const lang_ok = langOk(lang, text);
  const wall = len < 2 * minLen && WALL.test(text);
  return {
    url: r.url,
    status: r.status,
    len,
    method,
    lang_ok,
    script: scriptInfo(text),
    wall,
    sample: text.slice(0, 60),
    pass: len >= minLen && lang_ok && !wall,
  };
}

// ---------- RSS / Atom ----------
function parseFeed(xml) {
  let doc;
  try {
    doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  } catch {
    return [];
  }
  let els = Array.from(doc.getElementsByTagName('item'));
  const atom = els.length === 0;
  if (atom) els = Array.from(doc.getElementsByTagName('entry'));
  return els.map((el) => {
    const kids = Array.from(el.children);
    const txt = (name) => kids.find((k) => k.localName === name)?.textContent.trim() || '';
    let link = '';
    if (atom) {
      const ls = kids.filter((k) => k.localName === 'link');
      const alt = ls.find((k) => !k.getAttribute('rel') || k.getAttribute('rel') === 'alternate') || ls[0];
      link = alt?.getAttribute('href') || '';
    } else {
      link = txt('link');
    }
    const ds = txt('pubDate') || txt('published') || txt('updated') || txt('date');
    const t = Date.parse(ds);
    return { title: txt('title'), link, date: Number.isNaN(t) ? null : t };
  });
}

async function checkRss(c) {
  const notes = [];
  let feed = null;
  let usedUrl = null;
  for (const u of c.urls) {
    const r = await get(u);
    if (!r.ok) {
      notes.push(`${u} -> HTTP ${r.status} ${r.error}`.trim());
      continue;
    }
    const items = parseFeed(decode(r.buf, r.ct));
    if (items.length) {
      feed = items;
      usedUrl = r.url;
      break;
    }
    notes.push(`${u} -> không có item/entry`);
  }
  if (!feed) return { pass: false, notes };
  const dates = feed.filter((x) => x.date).map((x) => x.date);
  const newest = dates.length ? Math.max(...dates) : null;
  const ageDays = newest ? (Date.now() - newest) / 864e5 : null;
  const samples = [];
  for (const i of [...new Set([0, Math.min(2, feed.length - 1)])]) {
    const raw = feed[i].link;
    if (!raw) {
      notes.push(`item ${i} không có link`);
      continue;
    }
    let link;
    try {
      link = new URL(raw, usedUrl).href;
    } catch {
      notes.push(`link lỗi: ${raw}`);
      continue;
    }
    samples.push(await checkArticle(link, c.lang, c.lang === 'en' ? 2500 : 800));
  }
  const pass =
    feed.length >= 5 && ageDays !== null && ageDays <= 7 && samples.length === 2 && samples.every((s) => s.pass);
  return {
    url: usedUrl,
    items: feed.length,
    newest: newest ? new Date(newest).toISOString().slice(0, 10) : null,
    age_days: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    samples,
    notes,
    pass,
  };
}

// ---------- Wikipedia ----------
async function wikiSearch(wiki, q) {
  const u = `https://${wiki}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srsort=random&srlimit=5&srnamespace=0&format=json&formatversion=2&origin=*`;
  const r = await get(u, { wiki: true });
  if (!r.ok) return { titles: [], error: `HTTP ${r.status} ${r.error}`.trim() };
  try {
    const j = JSON.parse(dec(r.buf));
    if (j.error) return { titles: [], error: j.error.info || 'api error' };
    return { titles: (j.query?.search || []).map((x) => x.title), error: '' };
  } catch {
    return { titles: [], error: 'JSON lỗi' };
  }
}

async function wikiExtract(wiki, title) {
  const u = `https://${wiki}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&formatversion=2&origin=*`;
  const r = await get(u, { wiki: true });
  if (!r.ok) return '';
  try {
    return JSON.parse(dec(r.buf)).query?.pages?.[0]?.extract || '';
  } catch {
    return '';
  }
}

async function checkWikipedia(c) {
  const notes = [];
  const tried = [];
  let working = null;
  let titles = [];
  for (const q of c.queries) {
    const s = await wikiSearch(c.wiki, q);
    tried.push({ query: q, count: s.titles.length, error: s.error });
    if (!working && s.titles.length) {
      working = q;
      titles = s.titles;
    }
  }
  if (!working) return { tried, notes, pass: false };
  // Bài ngẫu nhiên (srsort=random, nhiều bài là bài cụt): lấy tối đa 5 bài, PASS khi >= 2 bài có extract >= 1500 và đúng ngôn ngữ.
  const samples = [];
  for (const title of titles.slice(0, 5)) {
    const extract = await wikiExtract(c.wiki, title);
    samples.push({
      title,
      url: `https://${c.wiki}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      len: extract.length,
      lang_ok: langOk(c.lang, extract),
      script: scriptInfo(extract),
      sample: extract.slice(0, 60),
    });
  }
  const good = samples.filter((s) => s.len >= 1500 && s.lang_ok).length;
  return {
    query: working,
    tried,
    results: titles.length,
    samples,
    notes,
    pass: good >= 2,
  };
}

// ---------- Wikipedia featured (TFA) ----------
const pad = (n) => String(n).padStart(2, '0');
async function checkFeatured(c) {
  const notes = [];
  let tfa = null;
  let day = null;
  let src = null;
  const now = new Date();
  for (const off of [0, -1]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + off));
    const p = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
    const urls = [
      `https://api.wikimedia.org/feed/v1/wikipedia/${c.wiki}/featured/${p}`,
      `https://${c.wiki}.wikipedia.org/api/rest_v1/feed/featured/${p}`,
    ];
    for (const u of urls) {
      const r = await get(u, { wiki: true });
      if (!r.ok) {
        notes.push(`${u} -> HTTP ${r.status} ${r.error}`.trim());
        continue;
      }
      try {
        const j = JSON.parse(dec(r.buf));
        if (j.tfa) {
          tfa = j.tfa;
          day = p;
          src = u;
          break;
        }
        notes.push(`${u} -> không có tfa`);
      } catch {
        notes.push(`${u} -> JSON lỗi`);
      }
    }
    if (tfa) break;
  }
  if (!tfa) return { tfa_present: false, notes, pass: false };
  const title = tfa.titles?.normalized || tfa.title;
  const extract = await wikiExtract(c.wiki, title);
  const lang_ok = langOk(c.lang, extract);
  return {
    tfa_present: true,
    feed_day: day,
    feed_url: src,
    tfa_title: title,
    sample: { len: extract.length, lang_ok, script: scriptInfo(extract), sample: extract.slice(0, 60) },
    notes,
    pass: extract.length >= 1500 && lang_ok,
  };
}

// ---------- Wikisource series ----------
async function checkWikisource(c) {
  const notes = [];
  const u = `https://${c.wiki}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(c.index)}&prop=links&format=json&formatversion=2&origin=*`;
  const r = await get(u, { wiki: true });
  if (!r.ok) return { pass: false, notes: [`HTTP ${r.status} ${r.error}`] };
  const j = JSON.parse(dec(r.buf));
  if (j.error) return { pass: false, notes: [j.error.info || 'api error'] };
  const all = (j.parse?.links || []).filter((l) => l.ns === 0 && l.exists !== false).map((l) => l.title);
  const chapters = all.filter((t) => t.startsWith(c.index + '/'));
  const sorted_alpha = JSON.stringify(chapters) === JSON.stringify([...chapters].sort());
  if (chapters.length === 0) return { links_total: all.length, chapters: 0, pass: false, notes: ['không có link chương'] };
  const first = chapters[0];
  const cu = `https://${c.wiki}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(first)}&prop=text&format=json&formatversion=2&origin=*`;
  const cr = await get(cu, { wiki: true });
  let len = 0;
  let lang_ok = false;
  let text = '';
  if (cr.ok) {
    try {
      const html = JSON.parse(dec(cr.buf)).parse?.text || '';
      const d = parseHTML(`<!doctype html><body>${html}</body>`, `https://${c.wiki}.wikisource.org/`);
      d.querySelectorAll('.ws-noexport,#headerContainer,.headertemplate,.mw-editsection,sup.reference,ol.references,table,style,script').forEach((e) => e.remove());
      const root = d.querySelector('.mw-parser-output') || d.body;
      text = norm(root.textContent);
      len = text.length;
      lang_ok = langOk(c.lang, text);
    } catch (e) {
      notes.push('parse chương 1 lỗi: ' + e.message);
    }
  } else {
    notes.push(`chương 1 HTTP ${cr.status}`);
  }
  return {
    url: `https://${c.wiki}.wikisource.org/wiki/${encodeURIComponent(first.replace(/ /g, '_'))}`,
    links_total: all.length,
    chapters: chapters.length,
    first_chapters: chapters.slice(0, 3),
    last_chapter: chapters[chapters.length - 1],
    sorted_alpha,
    sample: { title: first, len, lang_ok, script: scriptInfo(text), sample: text.slice(0, 60) },
    notes,
    pass: chapters.length >= 10 && len >= 800 && lang_ok,
  };
}

// ---------- Aozora ----------
let aozoraMemo = null;
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      /* bỏ */
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function loadAozora() {
  if (aozoraMemo) return aozoraMemo;
  const url = 'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip';
  const r = await get(url, { timeout: 180000 });
  if (!r.ok) return (aozoraMemo = { error: `HTTP ${r.status} ${r.error}` });
  const files = unzipSync(r.buf);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.csv'));
  if (!name) return (aozoraMemo = { error: 'không có CSV trong zip', zipBytes: r.buf.length, zipEntries: Object.keys(files) });
  const text = dec(files[name]).replace(/^﻿/, '');
  const table = parseCSV(text);
  const header = table[0];
  return (aozoraMemo = { zipBytes: r.buf.length, csvName: name, header, rows: table.slice(1) });
}

async function checkAozora(c) {
  const notes = [];
  const cat = await loadAozora();
  if (cat.error) return { zip_bytes: cat.zipBytes, pass: false, notes: [cat.error] };
  const h = cat.header;
  const col = (pred) => h.findIndex(pred);
  const iType = col((x) => x.includes('文字遣い'));
  const iRole = col((x) => x.includes('役割フラグ'));
  const iCopy = col((x) => x.includes('作品著作権フラグ'));
  const iNdc = col((x) => x.includes('分類番号'));
  const iUrl = col((x) => x.includes('XHTML') || x.includes('HTML'));
  const missing = { iType, iRole, iCopy, iNdc, iUrl };
  if (Object.values(missing).some((v) => v < 0)) {
    return { zip_bytes: cat.zipBytes, header: h, pass: false, notes: ['thiếu cột: ' + JSON.stringify(missing)] };
  }
  const prefixes = c.ndc;
  const matches = cat.rows.filter((row) => {
    if (row[iType] !== '新字新仮名') return false;
    if (row[iRole] !== '著者') return false;
    if (row[iCopy] !== 'なし') return false;
    const nums = [...(row[iNdc] || '').matchAll(/NDC\s*([0-9.]+)/g)].map((m) => m[1]);
    if (!nums.some((n) => prefixes.some((p) => n.startsWith(p)))) return false;
    return !!row[iUrl];
  });
  const sampleRow = matches[0];
  let sample = null;
  if (sampleRow) {
    const u = sampleRow[iUrl];
    const r = await get(u);
    if (!r.ok) {
      notes.push(`HTML mẫu ${u} -> HTTP ${r.status}`);
    } else {
      const d = parseHTML(decode(r.buf, r.ct), r.url);
      const main = d.querySelector('div.main_text');
      if (!main) notes.push('không có div.main_text');
      else {
        main.querySelectorAll('rt, rp, .notes').forEach((e) => e.remove());
        main.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
        const text = norm(main.textContent);
        sample = { url: r.url, title: sampleRow[h.indexOf('作品名')] || '', len: text.length, lang_ok: langOk('ja', text), script: scriptInfo(text), sample: text.slice(0, 60) };
      }
    }
  }
  return {
    zip_bytes: cat.zipBytes,
    csv: cat.csvName,
    header: h,
    total_rows: cat.rows.length,
    matching_rows: matches.length,
    sample,
    notes,
    pass: matches.length >= 200 && !!sample && sample.len >= 800,
  };
}

// ---------- Danh sách ứng viên ----------
const CAND = [
  // ja
  { id: 'nhk-seiji', kind: 'rss', lang: 'ja', name: 'NHK NEWS WEB 政治', urls: ['https://news.web.nhk/n-data/conf/na/rss/cat4.xml', 'https://www3.nhk.or.jp/rss/news/cat4.xml'], topics: ['politics'] },
  { id: 'nhk-kokusai', kind: 'rss', lang: 'ja', name: 'NHK NEWS WEB 国際', urls: ['https://news.web.nhk/n-data/conf/na/rss/cat6.xml', 'https://www3.nhk.or.jp/rss/news/cat6.xml'], topics: ['world'] },
  { id: 'nippon-ja', kind: 'rss', lang: 'ja', name: 'nippon.com 日本語', urls: ['https://www.nippon.com/list/feed/rss_ja'], topics: ['society', 'culture'] },
  { id: 'wiki-ja-lichsu', kind: 'wikipedia', lang: 'ja', name: 'Wikipedia 日本語 – 歴史', wiki: 'ja', queries: ['articletopic:history', 'incategory:"日本の歴史"'], topics: ['history'] },
  { id: 'wiki-ja-seiji', kind: 'wikipedia', lang: 'ja', name: 'Wikipedia 日本語 – 政治', wiki: 'ja', queries: ['articletopic:politics-and-government', 'incategory:"日本の政治"'], topics: ['politics'] },
  { id: 'wiki-ja-tfa', kind: 'wikipedia_featured', lang: 'ja', name: 'Wikipedia 日本語 – 今日の秀逸な記事', wiki: 'ja', topics: ['culture', 'history'] },
  { id: 'aozora', kind: 'aozora', lang: 'ja', name: '青空文庫', ndc: ['21', '28', '913', '914'], topics: ['literature', 'history'] },
  // zh
  { id: 'bbc-zh', kind: 'rss', lang: 'zh', name: 'BBC 中文', urls: ['https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'], topics: ['world'] },
  { id: 'dw-zh', kind: 'rss', lang: 'zh', name: 'DW 中文', urls: ['https://rss.dw.com/xml/rss-chi-all'], topics: ['world'] },
  { id: 'rfi-zh', kind: 'rss', lang: 'zh', name: 'RFI 中文', urls: ['https://www.rfi.fr/cn/rss'], topics: ['world'] },
  { id: 'people-zh-politics', kind: 'rss', lang: 'zh', name: '人民网 时政', urls: ['https://www.people.com.cn/rss/politics.xml'], topics: ['politics'] },
  { id: 'cna-zh', kind: 'rss', lang: 'zh', name: '中央社 政治', urls: ['https://www.cna.com.tw/rss/aall.aspx', 'https://feeds.cna.com.tw/rss'], topics: ['politics'] },
  { id: 'zaobao-zh', kind: 'rss', lang: 'zh', name: '联合早报', urls: ['https://www.zaobao.com.sg/rss', 'https://www.zaobao.com.sg/rss/news'], topics: ['world'] },
  { id: 'wiki-zh-lishi', kind: 'wikipedia', lang: 'zh', name: 'Wikipedia 中文 – 历史', wiki: 'zh', queries: ['articletopic:history', 'incategory:"历史"'], topics: ['history'] },
  { id: 'wiki-zh-zhengzhi', kind: 'wikipedia', lang: 'zh', name: 'Wikipedia 中文 – 政治', wiki: 'zh', queries: ['articletopic:politics-and-government', 'incategory:"政治"'], topics: ['politics'] },
  { id: 'wiki-zh-tfa', kind: 'wikipedia_featured', lang: 'zh', name: 'Wikipedia 中文 – 今日特色条目', wiki: 'zh', topics: ['culture', 'history'] },
  { id: 'ws-zh-sanguo', kind: 'wikisource_series', lang: 'zh', name: '三國演義', wiki: 'zh', index: '三國演義', topics: ['literature', 'history'] },
  { id: 'ws-zh-shuihu', kind: 'wikisource_series', lang: 'zh', name: '水滸傳 (100回本)', wiki: 'zh', index: '水滸傳 (100回本)', topics: ['literature'] },
  { id: 'ws-zh-xiyou', kind: 'wikisource_series', lang: 'zh', name: '西遊記', wiki: 'zh', index: '西遊記', topics: ['literature'] },
  { id: 'ws-zh-nahan', kind: 'wikisource_series', lang: 'zh', name: '吶喊', wiki: 'zh', index: '吶喊', topics: ['literature'] },
  // ko
  { id: 'yna-politics', kind: 'rss', lang: 'ko', name: '연합뉴스 정치', urls: ['https://www.yna.co.kr/rss/politics.xml'], topics: ['politics'] },
  { id: 'yna-northkorea', kind: 'rss', lang: 'ko', name: '연합뉴스 북한', urls: ['https://www.yna.co.kr/rss/northkorea.xml'], topics: ['world'] },
  { id: 'yna-international', kind: 'rss', lang: 'ko', name: '연합뉴스 국제', urls: ['https://www.yna.co.kr/rss/international.xml'], topics: ['world'] },
  { id: 'hani-politics', kind: 'rss', lang: 'ko', name: '한겨레 정치', urls: ['https://www.hani.co.kr/rss/politics/', 'https://www.hani.co.kr/rss/politics'], topics: ['politics'] },
  { id: 'khan-politics', kind: 'rss', lang: 'ko', name: '경향신문 정치', urls: ['https://www.khan.co.kr/rss/rssdata/politic_news.xml'], topics: ['politics'] },
  { id: 'bbc-ko', kind: 'rss', lang: 'ko', name: 'BBC 코리아', urls: ['https://feeds.bbci.co.uk/korean/rss.xml'], topics: ['world'] },
  { id: 'wiki-ko-lichsu', kind: 'wikipedia', lang: 'ko', name: 'Wikipedia 한국어 – 역사', wiki: 'ko', queries: ['articletopic:history', 'incategory:"역사"'], topics: ['history'] },
  { id: 'wiki-ko-jeongchi', kind: 'wikipedia', lang: 'ko', name: 'Wikipedia 한국어 – 정치', wiki: 'ko', queries: ['articletopic:politics-and-government', 'incategory:"정치"'], topics: ['politics'] },
  { id: 'wiki-ko-tfa', kind: 'wikipedia_featured', lang: 'ko', name: 'Wikipedia 한국어 – 오늘의 좋은 글', wiki: 'ko', topics: ['culture', 'history'] },
  { id: 'ws-ko-chunhyang', kind: 'wikisource_series', lang: 'ko', name: '춘향전', wiki: 'ko', index: '춘향전', topics: ['literature'] },
  { id: 'ws-ko-hongbu', kind: 'wikisource_series', lang: 'ko', name: '흥부전', wiki: 'ko', index: '흥부전', topics: ['literature'] },
  { id: 'ws-ko-samguk-yusa', kind: 'wikisource_series', lang: 'ko', name: '삼국유사', wiki: 'ko', index: '삼국유사', topics: ['literature', 'history'] },
  // en
  { id: 'npr-politics', kind: 'rss', lang: 'en', name: 'NPR Politics', urls: ['https://feeds.npr.org/1014/rss.xml'], topics: ['politics'] },
  { id: 'pbs-politics', kind: 'rss', lang: 'en', name: 'PBS NewsHour Politics', urls: ['https://www.pbs.org/newshour/feeds/rss/politics'], topics: ['politics'] },
  { id: 'conversation-us-politics', kind: 'rss', lang: 'en', name: 'The Conversation US – Politics', urls: ['https://theconversation.com/us/politics/articles.atom'], topics: ['politics'] },
  { id: 'smithsonian-history', kind: 'rss', lang: 'en', name: 'Smithsonian Magazine – History', urls: ['https://www.smithsonianmag.com/rss/history/'], topics: ['history'] },
  { id: 'wiki-en-history', kind: 'wikipedia', lang: 'en', name: 'Wikipedia EN – History', wiki: 'en', queries: ['articletopic:history'], topics: ['history'] },
  { id: 'wiki-en-politics', kind: 'wikipedia', lang: 'en', name: 'Wikipedia EN – Politics', wiki: 'en', queries: ['articletopic:politics-and-government'], topics: ['politics'] },
  { id: 'wiki-en-tfa', kind: 'wikipedia_featured', lang: 'en', name: 'Wikipedia EN – Featured article today', wiki: 'en', topics: ['history'] },
  { id: 'ws-en-federalist', kind: 'wikisource_series', lang: 'en', name: 'The Federalist (Dawson)', wiki: 'en', index: 'The Federalist (Dawson)', topics: ['politics', 'history'] },
  { id: 'ws-en-federalist-papers', kind: 'wikisource_series', lang: 'en', name: 'The Federalist Papers (index đề xuất trong SPEC)', wiki: 'en', index: 'The Federalist Papers', topics: ['politics', 'history'] },
];

// Chỉ để báo cáo: kết quả tìm theo chủ đề trên từng wiki (articletopic) — cần cho báo cáo.
const TOPIC_PROBE = {
  ja: ['articletopic:history', 'articletopic:politics-and-government'],
  zh: ['articletopic:history', 'articletopic:politics-and-government'],
  ko: ['articletopic:history', 'articletopic:politics-and-government'],
  en: ['articletopic:history', 'articletopic:politics-and-government'],
};

async function run(c) {
  switch (c.kind) {
    case 'rss': return checkRss(c);
    case 'wikipedia': return checkWikipedia(c);
    case 'wikipedia_featured': return checkFeatured(c);
    case 'wikisource_series': return checkWikisource(c);
    case 'aozora': return checkAozora(c);
    default: return { pass: false, notes: ['kind không rõ'] };
  }
}

const only = process.argv[2] ? process.argv[2].split(',') : null;
const results = [];
for (const c of CAND) {
  if (only && !only.includes(c.id)) continue;
  let r;
  try {
    r = await run(c);
  } catch (e) {
    r = { pass: false, notes: ['lỗi: ' + e.message] };
  }
  results.push({ id: c.id, kind: c.kind, lang: c.lang, name: c.name, ...r });
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${c.id}`);
}

const probe = {};
if (!only) {
  for (const [wiki, qs] of Object.entries(TOPIC_PROBE)) {
    probe[wiki] = {};
    for (const q of qs) {
      const s = await wikiSearch(wiki, q);
      probe[wiki][q] = s.error ? `ERR ${s.error}` : s.titles.length;
    }
  }
}

console.log('\n=== JSON ===');
console.log(JSON.stringify({ results, topic_probe: probe }, null, 2));
