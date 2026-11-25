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
