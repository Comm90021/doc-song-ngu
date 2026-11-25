# Environment report — doc-song-ngu

Generated from `node tools/env_check.mjs` on Windows 11, Node v24.22.0, npm 11.19.1.
Nothing was installed globally. Only `package.json`, `package-lock.json`, `node_modules/`, `tools/env_check.mjs`, `docs/env_report.md` were touched.

## 1. Installed versions (`npm ls --depth=0`)

| Package | Version | Kind |
| --- | --- | --- |
| kuromoji | 0.1.2 | dependency (pinned) |
| pinyin-pro | 3.29.5 | dependency |
| jieba-wasm | 2.4.0 | dependency |
| @mozilla/readability | 0.6.0 | dependency |
| opencc-js | 1.4.2 | dependency |
| fflate | 0.8.3 | dependency |
| @capacitor/core | 8.6.2 | dependency |
| @capacitor/android | 8.6.2 | dependency |
| @capacitor/app | 8.1.2 | dependency |
| @capacitor/filesystem | 8.1.5 | dependency |
| @capacitor/share | 8.0.3 | dependency |
| @capacitor/cli | 8.6.2 | devDependency |
| jsdom | 31.0.1 | devDependency |
| fake-indexeddb | 6.2.8 | devDependency |

Capacitor check: all `@capacitor/*` packages are major 8, same as `@capacitor/core`. No reinstall needed.
`npm install` audit: 0 vulnerabilities.

## 2. Check outputs (trimmed)

### a. kuromoji
- dicPath `node_modules/kuromoji/dict/`, build time **776 ms**.
- Tokens for `政治を学んだ。今日は人々が取り組みを3日続けた。` (surface / reading / basic_form / pos / pos_detail_1):
  政治 セイジ 政治 名詞 一般; を ヲ を 助詞 格助詞; 学ん マナン 学ぶ 動詞 自立; だ ダ だ 助動詞; 今日 キョウ 今日 名詞 副詞可能; 人々 ヒトビト 人々 名詞 一般; 取り組み トリクミ 取り組み 名詞 一般; 3 (blank reading) * 名詞 数; 日 ニチ 日 名詞 接尾; 続け ツヅケ 続ける 動詞 自立; た タ た 助動詞.

### b. pinyin-pro
- `pinyin('银行行长重视重要的重复工作', {type:'array'})` → `yín háng háng zhǎng zhòng shì zhòng yào de chóng fù gōng zuò`
- `pinyin('银行', {toneType:'symbol', type:'array'})` → `["yín","háng"]`
- `segment` **is exported**. `segment('我们学习中国历史和政治')` returns per-character objects `{origin, result}` (e.g. `我`→`wǒ`), i.e. it does NOT group words. Use jieba-wasm for word segmentation.

### c. jieba-wasm (Node build)
- `cut('我们学习中国历史和政治', true)` → `["我们","学习","中国","历史","和","政治"]`
- `tag(...)` → `我们/r, 学习/v, 中国/ns, 历史/n, 和/c, 政治/n`
- Package `exports`: `import` and `browser` conditions both point to `pkg/web/` (ESM + manual init). `node`/`require` point to `pkg/nodejs/`.
- Web build (`node_modules/jieba-wasm/pkg/web/`): `jieba_rs_wasm.js` 13,893 B, `jieba_rs_wasm_bg.wasm` 4,015,140 B (3.8 MB), `.d.ts` files.
- Init per README: `import init, { cut } from 'jieba-wasm'; await init();`. The default export `__wbg_init` fetches the `_bg.wasm` relative to the JS module URL, so keep the two files in the same folder.

### d. @mozilla/readability + jsdom
- Parsed title: `"T"`. textContent length: **1767**.

### e. opencc-js
- `Converter({from:'tw', to:'cn'})('歷史與政治')` → `历史与政治`
- `Converter({from:'cn', to:'tw'})('历史与政治')` → `歷史與政治`
- Exports: `Converter, ConverterFactory, CustomConverter, HTMLConverter, Locale, Trie, default`.
- `main` = `dist/umd/full.js` (UMD, global `OpenCC`). ESM = `dist/esm/full.js`.
- Sizes: `umd/full.js` 1,195,473 B; `esm/full.js` 1,195,200 B. Split builds also exist: `umd/cn2t.js` 1,100,656 B, `umd/t2cn.js` 109,333 B (only the `full` build was tested here).

### f. fflate
- `zipSync` / `unzipSync` roundtrip: **OK**.

### g. Google free translate (3 HTTP requests used, the limit)
1. `ja → vi`, body `政治を学ぶ。\n日本の歴史は長い。`
   - HTTP **200**; `access-control-allow-origin: *`
   - Joined: `Tìm hiểu chính trị.` / `Nhật Bản có lịch sử lâu đời.`
   - Split on `\n` → **2 lines**. Newline/line count preserved: **yes**.
2. `ja → vi` with `dt=t&dt=bd`, q=`学ぶ`
   - HTTP 200. The `dict` field was **absent** (`null`) in the response. Dict sample not obtained. Do not rely on `dt=bd` for this word without re-testing (the quota of 3 requests is used up).
3. `zh-CN → vi`, body `我们学习历史。\n政治很复杂。`
   - HTTP **200**. Joined: `Chúng tôi nghiên cứu lịch sử.` / `Chính trị rất phức tạp.`
   - Split on `\n` → **2 lines**. Line count preserved: **yes**.

Conclusion: the endpoint works from Node with CORS `*`, so a browser page can call it directly. It keeps newlines as separate lines in the tested cases.

## 3. Vendor table (drives `web/vendor`)

Paths are relative to the project root. Copy the listed files into `web/vendor/<name>/`. The "Load in browser" column is the expected way to use each file without a bundler. Rows marked *unverified* were not run in a browser in this check.

| library | browser file path(s) to copy | size | how to load / init in a browser (no bundler) |
| --- | --- | --- | --- |
| kuromoji 0.1.2 | `node_modules/kuromoji/build/kuromoji.js` (UMD) + the whole folder `node_modules/kuromoji/dict/` (12 `*.dat.gz` files) | JS ~0.3 MB; dict 17.0 MB | `<script src=".../kuromoji.js">` then global `kuromoji` (*unverified global name, it is a UMD build*). `kuromoji.builder({ dicPath: 'vendor/kuromoji/dict/' }).build((err, tk) => ...)`. Dict is fetched over HTTP, so `dicPath` must be a served URL path, not a file path. |
| pinyin-pro 3.29.5 | `node_modules/pinyin-pro/dist/index.js` | 0.3 MB (325,698 B) | `<script src>` UMD, global `pinyinPro`. Use `pinyinPro.pinyin(text, {type:'array'})`. `pinyinPro.segment` exists. |
| jieba-wasm 2.4.0 | `node_modules/jieba-wasm/pkg/web/jieba_rs_wasm.js` + `node_modules/jieba-wasm/pkg/web/jieba_rs_wasm_bg.wasm` (same folder) | JS 13.9 KB; wasm 3.8 MB | ES module, no global. `<script type="module">import init, { cut, tag } from './vendor/jieba/jieba_rs_wasm.js'; await init();</script>`. Do not use `pkg/nodejs`. |
| @mozilla/readability 0.6.0 | `node_modules/@mozilla/readability/Readability.js` + `node_modules/@mozilla/readability/Readability-readerable.js` | 0.09 MB + 0.004 MB | Classic script (no module wrapper). Plain `<script>` defines globals `Readability` and `isProbablyReaderable`. `new Readability(document).parse()`. Do not load `index.js` (CommonJS). |
| opencc-js 1.4.2 | `node_modules/opencc-js/dist/umd/full.js` (or split `umd/t2cn.js` 0.11 MB, `umd/cn2t.js` 1.1 MB) | full 1.2 MB | UMD, `<script src>` sets global `OpenCC`. `OpenCC.Converter({from:'tw', to:'cn'})`. Split builds: *unverified in browser*. |
| fflate 0.8.3 | `node_modules/fflate/umd/index.js` (UMD) | 33 KB | `<script src>`, global expected `fflate` (*unverified global name*). ESM alternative: `node_modules/fflate/esm/browser.js` (91 KB) via `<script type="module">`. |

Not needed in the web build: `jsdom`, `fake-indexeddb` (test-only). Capacitor packages are used only by the Android build.

## 4. Sizes

| Item | Size |
| --- | --- |
| whole `node_modules` | 107.4 MB |
| `node_modules/kuromoji/dict` | 17.0 MB |
| jieba-wasm web build (`pkg/web`) | 3.8 MB |
| pinyin-pro `dist` | 0.9 MB |
| opencc-js browser build (`dist/umd/full.js`) | 1.1 MB |
| `@mozilla/readability/Readability.js` | 0.1 MB |

10 largest packages (installed size, MB):

| # | Package | MB |
| --- | --- | --- |
| 1 | kuromoji | 39.4 |
| 2 | jieba-wasm | 15.4 |
| 3 | jsdom | 6.6 |
| 4 | opencc-js | 5.8 |
| 5 | zlibjs | 3.6 |
| 6 | xml2js | 3.4 |
| 7 | lru-cache | 3.2 |
| 8 | tldts | 2.9 |
| 9 | @types/node | 2.5 |
| 10 | tar | 2.2 |

## 5. Problems and notes

- `kuromoji` 39.4 MB is mostly its node-side dictionary and build files. Only `build/kuromoji.js` and `dict/` are needed in the browser (~17 MB of dict data to ship).
- `pinyin-pro` `segment` splits into characters, not words. Use `jieba-wasm` `cut` for word grouping.
- Google translate `dt=bd` returned no `dict` field for `学ぶ`. Re-test later if the dictionary output is needed.
- `package.json` `description` is mojibake (UTF-8 read as Windows-1252, e.g. `Äá»c song ngá»¯`). This was already in the file before this task and was NOT changed. Fix it by re-saving the file as UTF-8 text with the correct Vietnamese text.
- `npm install` ran two commands in parallel at first (runtime and Capacitor groups). Both succeeded and `npm ls --depth=0` is clean.
