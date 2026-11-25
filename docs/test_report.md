# Test report (Bước 3a)

Date: 2026-11-25. Machine: Windows 11, PowerShell 5.1, Node v24, Python 3.14.

## A. Tests

- `npm test` (node --test): **17 / 17 pass, 0 fail** (13 existing + 4 new in `tests/fixes.test.js`).
- Baseline before the fixes: 13 / 13 pass. No pre-existing failures to fix.

## B. Fixes

1. **Wikisource series order** — `web/sources/wikisource.js`
   - The adapter now calls `action=parse&prop=text` on the index page (URL built by `wikiAPI`, so the index name is URL-encoded by `URLSearchParams`).
   - New exported helper `seriesTitles(html, index, DOMParser)`: `a[href]` in document order → `/wiki/<Title>` (query and fragment stripped, percent-decoded, `_` → space) → keep titles starting with `<index>/` → dedupe keeping first → seq = 1..n.
   - Live check (real network, one-off, not committed): 三國演義 123 chapters (序, 讀《三國志》法, 凡例 first, in page order); 西遊記 101; 水滸傳 (100回本) 102; The Federalist (Dawson) 86.
   - Test: `tests/fixes.test.js` (ordering, decoding, dedupe, parentheses in index names, request URL, candidate seq).

2. **Minimum length for suggested articles** — `web/core/recommend.js` (new `minChars(lang)`: en 1500, others 800) and `web/core/jobs.js` (`prefetch`).
   - When a prefetched suggestion opens with `stats.chars` below the minimum, the candidate is set to `bad`, its cached article is deleted, and the existing retry loop picks another suggestion (max 5 attempts). The same delete happens if the candidate is no longer current.
   - Pasted links never go through `prefetch`, so they are unaffected.
   - Test: `tests/fixes.test.js` (short en article marked bad, article removed, next suggestion becomes current, `est_chars` recorded).

3. **Wikimedia politeness** — `web/core/net.js`
   - New `paceHost(hostname)`: for `*.wikipedia.org`, `*.wikisource.org`, `*.wikimedia.org`, each request reserves the next start slot per host, so starts are ≥ 1 000 ms apart. It runs before every attempt, so 429/5xx retries are also paced. The existing exponential backoff is unchanged. Other hosts are not delayed.
   - Test: `tests/fixes.test.js` (three concurrent requests to en.wikipedia.org start ≥ 1 000 ms apart, three to example.org are not paced; `fetch` is stubbed, no network).

## C. Smoke (`node tools/smoke.mjs`, network)

Run completed with no error lines printed. The process exit code was not captured, but every language passed its threshold.

| lang | source → article | blocks | sentences | first 12 translated | Han sentences with ruby | open ms | translation ms |
|---|---|---|---|---|---|---|---|
| ja | NHK ONE news → 自民 小野寺税調会長 … | 75 | 80 | 100 % | 100 % (≥ 90 required) | 1765 | 10715 |
| zh | BBC 中文 → 宏福苑大火一周年 … | 51 | 124 | 100 % | 100 % (≥ 90 required) | 1988 | 9073 |
| ko | 연합뉴스 → "북한 급변사태 …" | 27 | 27 | 100 % | n/a (no Han) | 658 | 13563 |
| en | NPR → Moving to Florida … | 30 | 58 | 100 % | n/a | 701 | 4551 |

Quick lookup: **20 / 20** words returned a meaning (threshold 16 / 20; §11.3 asks ≥ 80 %).

## D. PC server checks (port 8798, stopped afterwards)

| check | result | expected |
|---|---|---|
| `GET /api/ping` | 200 `{"ok": true, "app": "docsongngu"}` | ok |
| `GET /` | 200, HTML (788 bytes) | 200 HTML |
| `/proxy?url=https://www3.nhk.or.jp/` + `X-DSN: 1` | 200, 1.07 MB HTML | 200 |
| same without `X-DSN` | 403 | rejected |
| `/proxy?url=http://127.0.0.1:8798/` + `X-DSN: 1` | 502 `{"error": "Public upstream addresses required"}` | rejected |
| `Host: evil.example` on `/api/ping` | 403 | rejected |
| `GET /api/history` | 200, `[]` | JSON |

POST to `/api/history` was not called. The ledger was not touched.

## Remaining problems

- `docs/sources_report.md` (not re-run in this pass) still lists these sources as FAIL: `people-zh-politics` (stale feed, last item 2025-06-05), `cna-zh` (HTTP 403), `zaobao-zh` (no RSS found), `wiki-zh-tfa` (TFA under 1 500 characters). The new 800-character minimum may also reject some other short suggestions (for example `rfi-zh`, which had a 911-character sample).
- `web/sources/wikisource.js` `refresh` still returns `[]` once any candidate exists for that source (`db.index('candidates','source_id',…)`). Chapters added to the index later will not appear until the candidates are cleared. Existing behaviour, not changed.
- `web/core/net.js` pacing queue is in-memory per JS context. Two open pages (or two app instances, for example a browser tab plus the Android WebView) each keep their own queue, so their combined rate to Wikimedia is not capped. Acceptable for single-user use.
- Smoke `ko` and `en` report ruby as n/a. This is expected (no Han in the sentences), but it means the reading check only covers ja and zh.
- Smoke's exit code was not captured. Re-run with `node tools/smoke.mjs; $LASTEXITCODE` to confirm if needed.

## Bước 3b — E2E

Date: 2026-11-25. Headless Edge 158 over CDP (`tools/e2e_shots.mjs`), app server on 8799, throw-away profile (deleted). Viewports: 390×844 @2x touch emulation, 1280×800 desktop. Final run: `docs/shots` set comes from run 3 (degraded mode, see Remaining problems). Raw results: `scratchpad/e2e_results_run1.json`, `e2e_results_run2.json`, `e2e_results_run3.json`.

### Checks (final run 3)

| Flow | Check | Result | Detail |
|---|---|---|---|
| a home | suggestion card with title appears | PASS | 2 s (run 3); 15–17 s on the first run that refreshes sources |
| a home | no horizontal overflow 390 / 1280 | PASS | 390/390, 1265/1280 |
| b reader ja | article renders, lang=`ja` | PASS | 80 sentences, 365 ruby, 80/80 Han sentences with readings |
| b reader zh | article renders, lang=`zh-Hans` | PASS | 124 sentences, 3311 ruby, 124/124 Han sentences with readings |
| b reader ko | article renders, lang=`ko` | PASS | 27 sentences, no Han (readings n/a) |
| b reader en | article renders, lang=`en` | PASS | 58 sentences, no Han |
| b reader (all 4) | ≥5 translations / ≥95 % translated | FAIL (blocked) | 0 translated in run 3; Google returns HTTP 429 to this IP, see Remaining problems |
| b reader (all 4) | no horizontal overflow | PASS | 390 px |
| c popup ja | tap ruby word → popup with Anh entry | PASS | opens in 746 ms, JMdict entry, source line shown |
| c popup ja | ✕ closes popup | PASS | |
| c popup ja | vertical swipe on a word: no popup in 1 s | PASS | |
| c popup ja | "Tra từ" OFF: tap word → no popup; ON again | PASS | aria-pressed false → true |
| d dict | CVDICT installs | PASS | 66 s (run 2); 122,596 entries |
| d dict | JMdict installs | PASS | 16 s (run 2); 22,662 entries |
| d dict | zh popup shows entry tagged Việt | PASS | CVDICT entry, `· Việt` |
| d dict | ja popup shows entry tagged Anh | PASS | JMdict entry, `· Anh` |
| d settings | no horizontal overflow 390 | PASS | |
| e finish | scroll to end enables "✓ Đã đọc xong" | PASS | 2 s of scrolling |
| e finish | finish → `#/`, title listed in Lịch sử | PASS | |
| e finish | `data\da_doc.jsonl` contains the URL | PASS | 1 line |
| e finish | after reload the finished article is not the current suggestion | PASS | current_suggestion checked by canon; new headline differs |
| f toggles | Dịch: show → blur → hide → show | PASS | classes `tr-blur`, `tr-hide` |
| f toggles | Âm: `ruby-off` on/off | PASS | |
| f toggles | 390 and 1280 zh reader: no overflow | PASS | |

Degraded run notes: run 3 used `E2E_MIN_TR=0 E2E_NO_TR=1`, i.e. readers count as ready once rendered, so popup, dictionary, finish and toggle flows could run without translations. Run 1 and run 2 used the full gate (≥5 translations, then all translated); they failed at the translation gate for the reasons below.

### Timings

| Step | ms |
|---|---|
| Home first suggestion, first run (refresh) | 16,719 (run 1) |
| Reader ready, zh (run 1, translations running) | 5,462 |
| Reader ready, ko (run 1) | 2,469 |
| Reader ready, ja / en (run 1) | timed out at 120,000 (translation blocked) |
| CVDICT install / JMdict install | 78,567 / 17,630 (run 1); 66 s / 16 s (run 2) |
| Popup open, ja (run 3) | 746 |
| Finish scroll to enabled button | 1,915 (run 3) |

### Console errors (deduplicated)

| Message | Count | Run | Note |
|---|---|---|---|
| CORS block on `translate.googleapis.com` (ja, zh, ko, en) | 4 | run 1 | **Caused by a bug, fixed** (see Fixes) |
| `net::ERR_FAILED` on `translate.googleapis.com` | 4 | run 1 | same cause |
| HTTP 500 from `translate.googleapis.com` (ko) | 1 | run 1 | upstream, same request path |
| `A listener indicated an asynchronous response ... message channel closed` | 1 | runs 1, 2, 3 | browser-side message channel error, not from `web/` code; source not identified |

Run 2 and run 3: no CORS errors, no app errors.

### Overflow

| Screen | scrollWidth / innerWidth | OK |
|---|---|---|
| home_390 | 390 / 390 | yes |
| home_1280 | 1265 / 1280 | yes |
| reader_ja / zh / ko / en (390) | 390 / 390 | yes |
| settings_390 | 390 / 390 | yes |
| history_390 | 390 / 390 | yes |
| reader_toggles (390) | 390 / 390 | yes |
| reader_1280_zh | 1265 / 1280 | yes |

### Screenshots (docs/shots/)

home_390.png, home_1280.png, reader_ja.png, reader_zh.png, reader_ko.png, reader_en.png, popup_ja.png, popup_ja_dict.png, popup_zh.png, settings_390.png, history_390.png, reader_toggles.png, reader_1280_zh.png. The reader shots from run 3 show readings and original text but no translations (degraded run). Reader and popup layout was checked visually: ruby above text, popup bottom sheet on phone, no clipping.

### Fixes

1. `web/core/translate.js`, `google()`: `direct:!net.IS_NATIVE` became `direct:false`. On the PC build `IS_NATIVE` is false, so `direct` was true and the browser called `translate.googleapis.com` directly. Google sends no CORS header, so every translation request failed in the browser (run 1: 4 CORS errors, 4 ERR_FAILED). Now the request goes through `/proxy` as intended. Native behaviour is unchanged (`direct` was already false on native). Verified: runs 2 and 3 show no CORS errors and the proxy returns Google's status in `X-Proxy-Status`.
2. `web/core/net.js`, `paceHost()`: the Wikimedia pacing test failed intermittently with gaps of 992 to 997 ms. The reserved slot was not the actual start time, and `setTimeout` can wake a few ms early. Replaced the slot counter with a per-host chain that waits for the previous release, then 1,000 ms plus a 2 ms clock guard. `npm test`: 17/17 in three consecutive runs (before: 16/17 in one of two runs).
3. Added `tools/e2e_shots.mjs` (the E2E script; env `E2E_OUT`, `E2E_MIN_TR`, `E2E_NO_TR`). No npm packages added.

### Remaining problems

- **Translation not verified end-to-end.** Google `translate_a/single` returns HTTP 429 to this PC's IP (probed through `/proxy` at the end of the session, still 429 after about 12 minutes of waiting). The test runs, especially run 1 and run 2, caused many requests. The app handles this as designed: `translate.js` retries 429 three times with backoff, then pauses (the "Dịch tạm dừng — bấm để thử lại" button). Re-run `node tools/e2e_shots.mjs` (full gate) once the IP recovers. Check the throttling in `web/core/translate.js` (slot limit 2, `google()` retry loop).
- The "Bước 3b" smoke section of the earlier report lists article titles, not URLs. The E2E picked candidates from the live pool by title hint (see run notes), or by source id.
- The Dán-link paste via clipboard button, "Bài khác", reopen-resume, skip flow and Xuất/Nhập were not covered by this run.
- Swipe test checks that no popup opens, but does not assert the page actually scrolled.
- Popup `innerText` includes the ✕ button text (cosmetic in tests only).
