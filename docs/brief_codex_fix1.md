# Task for Codex — fix round 1 after the user's first real test (Đọc Song Ngữ)

Working folder: `d:\app doc van ban` (Windows 11, git repo; do not commit — the reviewer commits). Read first: `docs/SPEC.md` (contracts), `docs/PROGRESS.md`, then the code in `web/core/recommend.js`, `web/core/jobs.js`, `web/sources/*.js`, `web/ui/home.js`, `web/ui/history.js`, `web/ui/reader.js`, `web/core/article.js`, `web/nlp/client.js`.
No network in your sandbox; `node_modules` is installed; do NOT add packages. Tests: `npm test` (node --test, no network) must stay green — add tests for every behaviour below.
Do NOT touch: `android/`, `.github/`, `.secrets/`, `web/sources.json`, `web/dicts.json`, the kuromoji block at the end of `tools/vendor.mjs`. UI text stays Vietnamese.

## What the user reported (tested on Android)
1. Japanese: "cập nhật mãi", no suggestion ever appears, cannot get to reading. (Root cause on Android — kuromoji dictionary files — is ALREADY fixed; do not redo it.) But the suggestion flow itself is chaotic: suggestions flip from title to title while the app processes long articles (Aozora works, long Wikipedia pages) that then fail the length setting.
2. "Không có giới hạn bao nhiêu bài, hỗn loạn quá" — the pool grew to 800+ candidates. The user wants each refresh to add about 100 articles and a maximum pool size.
3. "Chỗ thống kê sai" — the "Kho: N bài" counter counts everything (read, skipped, bad, filtered-out candidates).
4. "Có Wikipedia sao không cho tiếng Hàn và tiếng Trung, những chủ đề liên quan" — Wikipedia (and Wikisource novels) rarely or never show up for zh/ko: news wins every time and long Wikipedia pages fail the length check.
5. "Bấm vào phần dịch, không thấy hiện tiếng Việt" — when translation is slow/paused/failed the user sees nothing and does not know why.

## Required changes
A. Pool limits (jobs.js + sources):
 - Each refresh adds at most 25 NEW candidates per language (≈100 total), shared round-robin across that language's enabled sources (RSS: newest first; wikipedia: see C; aozora: random rows). The first run follows the same rule.
 - Cap: at most 75 unread candidates (status `new`, not in history/skipped) per language. After a refresh, delete the excess: oldest-fetched news first, then the oldest others. Never delete the current suggestion or a candidate whose article is cached/in progress.
 - Delete news candidates fetched more than 14 days ago (was 30).
 - Refresh must never look stuck: each source has a 30 s timeout (record the error in source_status and continue); emit progress so the UI can show "Đang cập nhật… (x/y nguồn)"; always end with `running:false`. Heavy work (Aozora catalog CSV) must not freeze the UI: keep caching the filtered rows (refresh the catalog at most every 30 days) and yield to the event loop while parsing (e.g. process rows in chunks with `await new Promise(r=>setTimeout(r))`).
B. Stable, validated suggestion (recommend.js + jobs.js + home.js):
 - Two-step prefetch. Step 1 (cheap): fetch + extract only (no NLP, no translation) → character count. Reject when extraction fails, chars < minChars (ja/zh/ko 800, en 1500), or chars do not fit `settings.length` → store `est_chars`, mark `bad` when it is an extraction error or too short, and try the next candidate (up to 8 cheap attempts per request). Step 2 only for a passing candidate: the full `openArticle` (NLP + translation of the title and the first 20 sentences).
 - The home card shows ONLY a validated suggestion. While validating show "Đang chuẩn bị bài…" with the language badge — no flipping titles. When nothing passes: "Chưa có bài phù hợp — bấm Cập nhật hoặc đổi độ dài trong Cài đặt".
 - A validated suggestion stays fixed until read/skipped (existing rule).
C. Wikipedia pre-filter: search with `srlimit=50&srprop=size` and keep results whose wikitext `size` suggests a fitting length before adding them (stubs out: size < 6 000 bytes; for `short`/`medium` keep size ≤ 60 000; for `long`/`any` no upper bound). Step 1 still confirms.
D. Category rotation + filter (recommend.js + home.js): replace the random 50/30/20 weights by a per-language rotation news → encyclopedia → literature → news… (remember the last kind per language in `state`; skip empty categories) so Wikipedia and Wikisource appear regularly in every language. Add a second chip row on Hôm nay: "Mọi loại · Báo · Bách khoa · Văn học" (filter by kind; combines with the language chips; remembered in `state`).
E. Correct statistics:
 - Home footer: "Chưa đọc: 中 N · 日 N · 한 N · EN N · cập nhật hh:mm" counting ONLY candidates that could be suggested now (status new, enabled source, language in settings.langs, topic match, not read/skipped, one per series (next chapter), length fits or unknown). While refreshing: "Đang cập nhật… (x/y nguồn)".
 - Lịch sử: header "Đã đọc: N bài · 中 a · 日 b · 한 c · EN d" computed from the same list that is displayed.
F. Translation visibility (reader.js + article.js):
 - Toolbar shows the state: "Dịch x/y" while running; "⚠ Dịch tạm dừng ↻" when paused (tap = retry); nothing when done or when source == target.
 - A sentence without a translation shows a muted placeholder "đang dịch…" (or "chưa dịch được" when paused) instead of an empty line; in blur mode tapping the line reveals it.
 - When the reader opens an article whose translation is paused, retry automatically once; if it pauses again, keep the button.
G. Small bug: in `web/nlp/client.js` the Korean `hasWord` lookup builds `stems` from single syllables; build them from the eojeol stems (eojeol minus a known particle, see `web/nlp/ko.js`) instead.
H. Update `docs/SPEC.md` §6.8, §6.9, §7 to describe the new rules (pool limits, two-step prefetch, rotation, category chips, statistics, translation status). Append "Fix round 1" to `docs/PROGRESS.md`.

## Final message
≤ 30 lines: changes per item A–H, test counts, files touched, anything not done and why.
