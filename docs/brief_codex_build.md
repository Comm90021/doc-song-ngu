# Task for Codex — build "Đọc Song Ngữ" v1 (web core + PC shell)

Working folder: `d:\app doc van ban` (Windows 11, PowerShell 5.1; NOT a git repo). Read these two files completely before writing code:
1. `docs/SPEC.md` — full specification and data contracts (LOCKED: follow exactly).
2. `docs/env_report.md` — installed library versions and the browser build file / init method of each library.

Environment: Node v24 + npm; `node_modules/` is ALREADY installed. Your sandbox has no network: do NOT run `npm install`, do NOT add packages. Python 3.14 is `py -3` (the PC server uses the standard library only).

## Your file area
`web/` (EXCEPT `web/sources.json` and `web/dicts.json` — other workers are writing them right now; read them at runtime, never edit; tests use `tests/fixtures/`), `pc/server.py`, `run.bat`, `tests/`, `tools/vendor.mjs`, `tools/smoke.mjs`, `README.md` (Vietnamese, short: run on PC, run tests, project layout), `docs/PROGRESS.md`. In `package.json` you may edit only `"scripts"`.
Do NOT touch: `android/`, `.github/`, `.secrets/`, `capacitor.config.json`, `tools/env_check.mjs`, `tools/check_sources.mjs`, `tools/make_keystore.py`, `docs/SPEC.md`, other `docs/*` reports.

## Milestones (in order). After EACH one update `docs/PROGRESS.md` (done / next / how to run / known issues) so that another worker can continue if you stop.
- **M1** — `web/core/segment.js`, `urlnorm.js`, `langdetect.js`, `util.js`; `web/nlp/ja.js`, `zh.js`, `ko.js`, `en.js`, `pos.js` (pure functions, dependencies injected) + tests 1–6 of SPEC §10.
- **M2** — `bus.js`, `db.js`, `net.js`, `store.js`, `extract.js`, `web/sources/*.js`, `translate.js`, `article.js`, `recommend.js`, `jobs.js`, `settings.js` + tests 7, 8, 9, 11.
- **M3** — UI: `web/index.html`, `style.css`, `app.js`, `web/ui/*.js`; workers + `nlp/client.js`; `pc/server.py`; `run.bat`; `tools/vendor.mjs` (run it so `web/vendor/` exists).
- **M4** — `dicts.js`, `nlp/worker_dict.js`, `lookup.js`, popup UI + test 10.
- **M5** — `tools/smoke.mjs` (write it, do NOT run it: it needs network), README, final pass: `npm test` all green; `node tools/vendor.mjs`; start `py -3 pc/server.py` briefly and check `/api/ping` and `/` (stop it afterwards); self-review against SPEC §11.

## Facts from the environment check
- Google `translate_a/single?client=gtx` returns `Access-Control-Allow-Origin: *` and preserves `\n`-separated line counts → on PC call it DIRECTLY with fetch (no proxy); on Android use CapacitorHttp; in Node use fetch.
- `dt=bd` returned no `dict` for a Japanese word → `quickLookup` must work with the translation only (`dict` may be empty).
- Browser builds: kuromoji `build/kuromoji.js` (UMD) + `dict/` (17 MB, `.dat.gz`); jieba-wasm `pkg/web/jieba_rs_wasm.js` (ESM, `await init()`, then `cut`/`tag`) + `jieba_rs_wasm_bg.wasm` (3.8 MB); pinyin-pro `dist/index.js` (UMD, global `pinyinPro`); opencc-js `dist/umd/full.js` (global `OpenCC`); Readability `Readability.js` (classic script, global `Readability`); fflate `esm/browser.js` (ESM) or `umd/index.js`. Verify global names by reading the files. Check whether ESM builds exist for pinyin-pro / opencc-js (useful in the module worker `worker_zh.js`). If a UMD library must run inside a module worker, pick a robust approach that works in Edge and Android WebView ≥ 90 and write the choice in PROGRESS.md.
- Versions: kuromoji 0.1.2, pinyin-pro 3.29.5, jieba-wasm 2.4.0, @mozilla/readability 0.6.0, opencc-js 1.4.2, fflate 0.8.3, Capacitor 8.x, jsdom 31, fake-indexeddb 6.

## Quality bar
- Data contracts exactly as SPEC §4 (Article JSON, IndexedDB stores, ledger, settings keys, sources/dicts schemas).
- `npm test` (`node --test`) passes with no network.
- All external text escaped in the UI; never `innerHTML` with unescaped data.
- Vietnamese UI strings as in SPEC §7. Phone-first layout (360–430 px), also good at 1280 px; no horizontal overflow.
- Light: no new dependencies, no bundler, no framework.

## Your final message
≤ 40 lines: what was built per milestone, test results (pass/fail counts), deviations from SPEC with reasons, known issues / TODO for the reviewer, exact commands to run (PC app, tests, vendor, smoke).
