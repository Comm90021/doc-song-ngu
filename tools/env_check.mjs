// Environment check for the doc-song-ngu project.
// Run from the project folder:  node tools/env_check.mjs
// Each section is isolated: a failure in one is printed and the rest still run.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

function header(title) {
  console.log('\n==================================================');
  console.log(title);
  console.log('==================================================');
}

async function section(title, fn) {
  header(title);
  try {
    await fn();
  } catch (err) {
    console.log(`[FAIL] ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err}`);
  }
}

function fileSize(p) {
  return statSync(p).size;
}

function listDir(dir, depth = 0, maxDepth = 2) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(`${'  '.repeat(depth)}${name}/`);
      if (depth < maxDepth) out.push(...listDir(full, depth + 1, maxDepth));
    } else {
      out.push(`${'  '.repeat(depth)}${name}  (${st.size} bytes)`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- a. kuromoji
await section('a. kuromoji (Japanese tokenizer)', async () => {
  const kuromoji = require('kuromoji');
  const dicPath = join(ROOT, 'node_modules', 'kuromoji', 'dict') + '/';
  const t0 = Date.now();
  const tokenizer = await new Promise((res, rej) =>
    kuromoji.builder({ dicPath }).build((err, tk) => (err ? rej(err) : res(tk)))
  );
  const ms = Date.now() - t0;
  console.log(`dicPath: ${dicPath}`);
  console.log(`build time: ${ms} ms`);
  const text = '政治を学んだ。今日は人々が取り組みを3日続けた。';
  const tokens = tokenizer.tokenize(text);
  console.log(`input: ${text}`);
  console.log('surface\treading\tbasic_form\tpos\tpos_detail_1');
  for (const t of tokens) {
    console.log([t.surface_form, t.reading, t.basic_form, t.pos, t.pos_detail_1].join('\t'));
  }
});

// ---------------------------------------------------------------- b. pinyin-pro
await section('b. pinyin-pro (Chinese pinyin)', async () => {
  const pp = await import('pinyin-pro');
  const { pinyin } = pp;
  console.log(
    "pinyin('银行行长重视重要的重复工作', {type:'array'}) =",
    JSON.stringify(pinyin('银行行长重视重要的重复工作', { type: 'array' }))
  );
  console.log(
    "pinyin('银行', {toneType:'symbol', type:'array'}) =",
    JSON.stringify(pinyin('银行', { toneType: 'symbol', type: 'array' }))
  );
  const hasSegment = typeof pp.segment === 'function';
  console.log(`segment exported: ${hasSegment}`);
  if (hasSegment) {
    console.log("segment('我们学习中国历史和政治') =", JSON.stringify(pp.segment('我们学习中国历史和政治')));
  }
});

// ---------------------------------------------------------------- c. jieba-wasm
await section('c. jieba-wasm (Chinese segmentation)', async () => {
  const jieba = await import('jieba-wasm');
  const text = '我们学习中国历史和政治';
  console.log(`cut(text, true) = ${JSON.stringify(jieba.cut(text, true))}`);
  console.log(`tag(text, true) = ${JSON.stringify(jieba.tag(text, true))}`);
  console.log(`exports of jieba-wasm (node import): ${Object.keys(jieba).join(', ')}`);

  const pkgDir = join(ROOT, 'node_modules', 'jieba-wasm');
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  console.log(`jieba-wasm package.json "main": ${pkg.main}`);
  console.log(`jieba-wasm package.json "module": ${pkg.module}`);
  console.log(`jieba-wasm package.json "browser": ${JSON.stringify(pkg.browser)}`);
  console.log(`jieba-wasm package.json "exports": ${JSON.stringify(pkg.exports, null, 2)}`);
  console.log(`jieba-wasm package.json "files": ${JSON.stringify(pkg.files)}`);
  console.log('\njieba-wasm file tree (depth 2):');
  for (const line of listDir(pkgDir)) console.log(line);
  const readmePath = join(pkgDir, 'README.md');
  if (existsSync(readmePath)) {
    const lines = readFileSync(readmePath, 'utf8').split(/\r?\n/);
    console.log('\nREADME lines mentioning init/web/browser/wasm (first 40):');
    lines
      .map((l, i) => `${i + 1}: ${l}`)
      .filter((l) => /init|web|browser|wasm|import|require|target/i.test(l))
      .slice(0, 40)
      .forEach((l) => console.log(l));
  }
});

// ---------------------------------------------------------------- d. readability + jsdom
await section('d. @mozilla/readability + jsdom', async () => {
  const { JSDOM } = await import('jsdom');
  const { Readability } = await import('@mozilla/readability');
  const filler = Array.from(
    { length: 30 },
    (_, i) => `Đây là câu đệm số ${i + 1} để kiểm tra độ dài nội dung bài viết.`
  ).join(' ');
  const html =
    '<html><head><title>T</title></head><body><nav>menu</nav><article><h1>Tiêu đề</h1><p>' +
    filler +
    '</p></article></body></html>';
  const dom = new JSDOM(html, { url: 'https://example.invalid/' });
  const article = new Readability(dom.window.document).parse();
  if (!article) {
    console.log('Readability returned null');
  } else {
    console.log(`parsed title: ${JSON.stringify(article.title)}`);
    console.log(`textContent length: ${article.textContent.length}`);
  }
  dom.window.close();
});

// ---------------------------------------------------------------- e. opencc-js
await section('e. opencc-js (Chinese variant conversion)', async () => {
  const mod = await import('opencc-js');
  const OpenCC = mod.Converter ? mod : mod.default;
  const tw2cn = OpenCC.Converter({ from: 'tw', to: 'cn' });
  const cn2tw = OpenCC.Converter({ from: 'cn', to: 'tw' });
  console.log(`tw->cn '歷史與政治' = ${tw2cn('歷史與政治')}`);
  console.log(`cn->tw '历史与政治' = ${cn2tw('历史与政治')}`);
  console.log(`exports: ${Object.keys(mod).join(', ')}`);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'opencc-js', 'package.json'), 'utf8'));
  console.log(`opencc-js "main": ${pkg.main}`);
  console.log(`opencc-js "module": ${pkg.module}`);
  console.log(`opencc-js "browser": ${JSON.stringify(pkg.browser)}`);
  console.log(`opencc-js "exports": ${JSON.stringify(pkg.exports)}`);
  const distDir = join(ROOT, 'node_modules', 'opencc-js', 'dist');
  if (existsSync(distDir)) {
    console.log('opencc-js dist/ files:');
    for (const f of readdirSync(distDir)) {
      console.log(`  ${f}  (${fileSize(join(distDir, f))} bytes)`);
    }
  }
});

// ---------------------------------------------------------------- f. fflate
await section('f. fflate (zip)', async () => {
  const { zipSync, unzipSync } = await import('fflate');
  const input = new TextEncoder().encode('xin chào 你好 こんにちは');
  const zipped = zipSync({ 'a.txt': input });
  const out = unzipSync(zipped);
  const ok =
    out['a.txt'] &&
    out['a.txt'].length === input.length &&
    out['a.txt'].every((b, i) => b === input[i]);
  console.log(ok ? 'OK (zip/unzip roundtrip)' : 'FAIL (roundtrip mismatch)');
});

// ---------------------------------------------------------------- g. Google translate
const GT_URL = 'https://translate.googleapis.com/translate_a/single?client=gtx';

async function gtPost(query, params) {
  const body = 'q=' + encodeURIComponent(query);
  const res = await fetch(`${GT_URL}&${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null */
  }
  return { status: res.status, acao: res.headers.get('access-control-allow-origin'), json, text };
}

await section('g.1 Google translate ja->vi (lines)', async () => {
  const src = '政治を学ぶ。\n日本の歴史は長い。';
  const r = await gtPost(src, 'sl=ja&tl=vi&dt=t&dj=1');
  console.log(`HTTP status: ${r.status}`);
  console.log(`access-control-allow-origin: ${r.acao}`);
  if (!r.json || !r.json.sentences) {
    console.log(`raw body (first 300 chars): ${r.text.slice(0, 300)}`);
    return;
  }
  const joined = r.json.sentences.map((s) => s.trans ?? '').join('');
  console.log(`joined translation: ${joined}`);
  const lines = joined.split('\n');
  console.log(`split on '\\n' -> ${lines.length} lines: ${JSON.stringify(lines)}`);
  console.log(`newline/line count preserved (exactly 2 lines): ${lines.length === 2 ? 'yes' : 'no'}`);
});

await section('g.2 Google translate dict (学ぶ)', async () => {
  const r = await gtPost('学ぶ', 'sl=ja&tl=vi&dt=t&dt=bd&dj=1');
  console.log(`HTTP status: ${r.status}`);
  if (!r.json) {
    console.log(`raw body (first 300 chars): ${r.text.slice(0, 300)}`);
    return;
  }
  console.log(`dict: ${JSON.stringify(r.json.dict ?? null)}`);
});

await section('g.3 Google translate zh-CN->vi (lines)', async () => {
  const src = '我们学习历史。\n政治很复杂。';
  const r = await gtPost(src, 'sl=zh-CN&tl=vi&dt=t&dj=1');
  console.log(`HTTP status: ${r.status}`);
  if (!r.json || !r.json.sentences) {
    console.log(`raw body (first 300 chars): ${r.text.slice(0, 300)}`);
    return;
  }
  const joined = r.json.sentences.map((s) => s.trans ?? '').join('');
  console.log(`joined translation: ${joined}`);
  const lines = joined.split('\n');
  console.log(`split on '\\n' -> ${lines.length} lines: ${JSON.stringify(lines)}`);
});

console.log('\n[done] env_check finished');
