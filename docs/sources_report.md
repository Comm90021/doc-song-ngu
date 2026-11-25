# Báo cáo kiểm tra nguồn bài (sources)

Ngày kiểm tra: 2026-11-25. Công cụ: `node tools/check_sources.mjs` (không ghi file; in bảng + JSON ra stdout).
Kết quả đã ghi vào `web/sources.json`: **27 nguồn PASS** (ja 7, zh 8, ko 5, en 7).

Tiêu chí: RSS ≥ 5 item, item mới nhất ≤ 7 ngày, 2 bài mẫu ≥ 800 ký tự (en ≥ 2500), đúng ngôn ngữ theo tỉ lệ hệ chữ, không tường trả phí/cookie.
Wikipedia: ≥ 2 trong 5 bài ngẫu nhiên có extract ≥ 1500 ký tự (xem mục quirk). Wikisource: ≥ 10 chương và chương 1 ≥ 800 ký tự. Aozora: ≥ 200 dòng khớp và mẫu ≥ 800 ký tự.
Mọi request tuần tự, ≥ 550 ms/request (Wikimedia ≥ 1100 ms), gửi `Api-User-Agent: DocSongNgu/0.1 (personal reading app)` cho Wikimedia.

## Bảng kết quả

Cột "Mẫu" là số ký tự của bài mẫu (RSS: 2 bài; Wikipedia: 5 bài ngẫu nhiên; Wikisource/Aozora: chương 1 / bài mẫu).

| id | kind | lang | url / query | PASS/FAIL | items / kết quả | mẫu (ký tự) | ghi chú |
|---|---|---|---|---|---|---|---|
| nhk-seiji | rss | ja | https://news.web.nhk/n-data/conf/na/rss/cat4.xml | PASS | 96; mới nhất 2026-11-25 | 1525 / 1544 | NHK ONE (news.web.nhk); RSS cũ www3.nhk.or.jp vẫn chạy nhưng bỏ |
| nhk-kokusai | rss | ja | https://news.web.nhk/n-data/conf/na/rss/cat6.xml | PASS | 131; 2026-11-25 | 1527 / 1525 | cat6 = 国際 |
| nippon-ja | rss | ja | https://www.nippon.com/list/feed/rss_ja | PASS | 20; 2026-11-24 | 4988 / 1463 | `/ja/rss/` trả 404 |
| wiki-ja-lichsu | wikipedia | ja | articletopic:history | PASS | 5 | 1087 / 943 / 840 / 1788 / 2320 | nhiều bài cụt |
| wiki-ja-seiji | wikipedia | ja | articletopic:politics-and-government | PASS | 5 | 21469 / 613 / 4784 / 4124 / 747 | |
| wiki-ja-tfa | wikipedia_featured | ja | /feed/v1/wikipedia/ja/featured/2026/11/25 | PASS | tfa có | 14942 | |
| aozora | aozora | ja | list_person_all_extended_utf8.zip | PASS | 5610 dòng khớp / 19502 dòng | 77475 (Faraday 「ファラデーの伝」) | zip ~ tải một lần mỗi lần chạy |
| bbc-zh | rss | zh | https://feeds.bbci.co.uk/zhongwen/trad/rss.xml | PASS | 42; 2026-11-25 | 4585 / 2091 | URL `/zhongwen/simp/` redirect sang `/trad/` → nội dung Phồn thể |
| dw-zh | rss | zh | https://rss.dw.com/xml/rss-chi-all | PASS | 58; 2026-11-25 | 1877 / 1842 | |
| rfi-zh | rss | zh | https://www.rfi.fr/cn/rss | PASS | 30; 2026-11-24 | 911 / 1217 | bài 911 ký tự gần ngưỡng |
| people-zh-politics | rss | zh | https://www.people.com.cn/rss/politics.xml | FAIL | 100; mới nhất 2025-06-05 | 990 / 1120 | feed đã cũ (538 ngày) |
| cna-zh | rss | zh | https://www.cna.com.tw/rss/aall.aspx | FAIL | 0 | - | HTTP 403 (chặn bot); feeds.cna.com.tw không phân giải được |
| zaobao-zh | rss | zh | https://www.zaobao.com.sg/rss | FAIL | 0 | - | HTTP 404 cho /rss, /rss/news; không tìm được RSS chính thức |
| wiki-zh-lishi | wikipedia | zh | articletopic:history | PASS | 5 | 4337 / 410 / 213 / 692 / 2103 | |
| wiki-zh-zhengzhi | wikipedia | zh | articletopic:politics-and-government | PASS | 5 | 1113 / 626 / 761 / 2280 / 2942 | |
| wiki-zh-tfa | wikipedia_featured | zh | /feed/v1/wikipedia/zh/featured/2026/11/25 | FAIL | tfa có | 788 | bài TFA ngắn (< 1500) |
| ws-zh-sanguo | wikisource_series | zh | index `三國演義` | PASS | 123 chương | 882 | chương đầu là 凡例, 序 (xem quirk) |
| ws-zh-xiyou | wikisource_series | zh | index `西遊記` | PASS | 101 chương | 6987 | 第001回 … 附錄 |
| ws-zh-shuihu | wikisource_series | zh | index `水滸傳 (100回本)` | PASS | 102 chương | 1351 | index `水滸傳` (chung) không có link chương |
| ws-zh-nahan | wikisource_series | zh | index `吶喊` | FAIL | 0 | - | index không liệt kê chương |
| yna-politics | rss | ko | https://www.yna.co.kr/rss/politics.xml | PASS | 120; 2026-11-25 | 2284 / 2003 | |
| yna-northkorea | rss | ko | https://www.yna.co.kr/rss/northkorea.xml | FAIL | 84; 2026-11-25 | 385 / 1238 | tin ngắn (flash) < 800 |
| yna-international | rss | ko | https://www.yna.co.kr/rss/international.xml | FAIL | 120; 2026-11-25 | 577 / 672 | tin ngắn (flash) < 800 |
| hani-politics | rss | ko | https://www.hani.co.kr/rss/politics | FAIL | 30 | 867 / 1873 | item KHÔNG có pubDate/dc:date → không xác định tuổi |
| khan-politics | rss | ko | https://www.khan.co.kr/rss/rssdata/politic_news.xml | PASS | 50; 2026-11-25 | 1057 / 1258 | |
| bbc-ko | rss | ko | https://feeds.bbci.co.uk/korean/rss.xml | PASS | 14; 2026-11-25 | 3376 / 3302 | ít item (14) |
| wiki-ko-lichsu | wikipedia | ko | articletopic:history | PASS | 5 | 459 / 1615 / 338 / 869 / 12652 | nhiều bài cụt |
| wiki-ko-jeongchi | wikipedia | ko | articletopic:politics-and-government | PASS | 5 | 13580 / 1621 / 287 / 546 / 1141 | |
| wiki-ko-tfa | wikipedia_featured | ko | api.wikimedia.org & rest_v1 ngày 2026/11/25 và 11/24 | FAIL | không có `tfa` | - | feed ko không trả tfa |
| ws-ko-chunhyang | wikisource_series | ko | index `춘향전` | FAIL | - | - | trang không tồn tại |
| ws-ko-hongbu | wikisource_series | ko | index `흥부전` | FAIL | 0 | - | chỉ có link biến thể bản, không có chương |
| ws-ko-samguk-yusa | wikisource_series | ko | index `삼국유사` | FAIL | 0 | - | chương là trang con `삼국유사/…` nhưng index không link tới (prop=links) |
| npr-politics | rss | en | https://feeds.npr.org/1014/rss.xml | PASS | 10; 2026-11-24 | 4789 / 7429 | ít item (10) |
| pbs-politics | rss | en | https://www.pbs.org/newshour/feeds/rss/politics | PASS | 20; 2026-11-24 | 5203 / 7063 | |
| conversation-us-politics | rss | en | https://theconversation.com/us/politics/articles.atom | PASS | 25; 2026-11-24 | 6470 / 6362 | Atom; `/us/history/articles.atom` 404 |
| smithsonian-history | rss | en | https://www.smithsonianmag.com/rss/history/ | FAIL | 21; 2026-11-24 | 0 / 0 | RSS OK nhưng trang bài trả HTTP 403 cho fetch (chặn bot) |
| wiki-en-history | wikipedia | en | articletopic:history | PASS | 5 | 1707 / 2835 / 955 / 1490 / 6892 | |
| wiki-en-politics | wikipedia | en | articletopic:politics-and-government | PASS | 5 | 18243 / 440 / 1666 / 913 / 5790 | |
| wiki-en-tfa | wikipedia_featured | en | /feed/v1/wikipedia/en/featured/2026/11/25 | PASS | tfa có | 49632 | |
| ws-en-federalist | wikisource_series | en | index `The Federalist (Dawson)` | PASS | 86 chương | 9382 | index `The Federalist Papers` không có link chương |

Ghi chú: không có RSS nào trả 429. Wikimedia trả 429 nếu gọi nhanh; checker thử lại (backoff) và giữ ≤ 1 request/giây cho Wikimedia.

## Nguồn FAIL và lý do (tóm tắt)
- people-zh-politics: feed cũ (bài mới nhất 2025-06-05).
- cna-zh: 403 từ cna.com.tw; feeds.cna.com.tw không phân giải.
- zaobao-zh: không tìm được RSS hoạt động.
- wiki-zh-tfa, wiki-ko-tfa: feed ngày hôm nay không có `tfa` (ko) hoặc bài TFA quá ngắn (zh, 788 ký tự).
- ws-zh-nahan, ws-ko-*, ws-en-federalist-papers: index không liệt kê chương (prop=links trả rỗng).
- yna-northkorea, yna-international: đa số tin flash < 800 ký tự (chỉ đạt khi mẫu ngẫu nhiên đủ dài; không dùng).
- hani-politics: không có ngày trong item (không đo được "mới ≤ 7 ngày").
- smithsonian-history: trang bài bị 403.

## Quirk app phải xử lý
1. **Wikisource thứ tự chương (quan trọng)**: `prop=links` trả link **theo thứ tự chữ cái** (đã kiểm tra: ws-zh-sanguo, ws-zh-xiyou, ws-zh-shuihu, ws-en-federalist đều `sorted`), không theo thứ tự trang. Ví dụ Federalist: `/1, /10, /11…`. SPEC §6.9 yêu cầu "page order" → cần sắp lại: lấy link theo thứ tự xuất hiện trong HTML của trang mục lục (`action=parse&prop=text`, duyệt `a[href]` trong `.mw-parser-output`), hoặc sắp theo số chương trong tên. Ngoài ra `三國演義` có chương đầu là `凡例`, `序` (front matter) trước `第001回`; `西遊記/附錄`, `Federalist/front matter` ở cuối.
2. **Wikipedia tìm ngẫu nhiên**: `articletopic:` hoạt động trên ja/zh/ko/en (đã kiểm), nhưng khoảng 40–60% bài là bài cụt (< 800 ký tự). Vì `est_chars` là null, app nên bỏ bài có extract < ~800 ký tự sau khi tải, hoặc hiển thị cảnh báo.
3. **Wikimedia 429**: gửi `Api-User-Agent` và giữ ≤ 1 request/giây; khi 429 thì backoff rồi thử lại.
4. **zh vs Phồn/Giản**: BBC 中文 (`/zhongwen/simp/`) redirect sang `/trad/`; checker không phân biệt giản/phồn (chỉ kiểm tỉ lệ Hán). Wikisource zh (三國演義, 西遊記, 水滸傳) là Phồn thể.
5. **Hani RSS**: item không có `pubDate`/`dc:date` (chỉ có `dc:subject`, `dc:category`); channel có `lastBuildDate`. App phải dùng ngày tải làm fallback hoặc bỏ qua lọc tuổi cho nguồn này. Hiện Hani không được đưa vào sources.json.
6. **RSS redirect**: `feeds.bbci.co.uk/zhongwen/simp/…` → `/trad/…`; NHK cũ `www3.nhk.or.jp/rss/news/catN.xml` vẫn chạy nhưng dùng `news.web.nhk/n-data/conf/na/rss/catN.xml` (cat4 政治, cat6 国際, cat1 社会, cat3 科学・文化, cat5 経済). Item link của NHK là `news.web.nhk/newsweb/na/nd-…`.
7. **Aozora**: zip `list_person_all_extended_utf8.zip` (UTF-8 CSV, có dấu nháy kép bọc trường). Cột dùng: 文字遣い種別, 役割フラグ, 作品著作権フラグ, 分類番号 (dạng `NDC 913`), cột chứa "XHTML"/"HTML" (URL file, tuyệt đối https). Số dòng khớp 5610 (≥ 200). Mẫu: `div.main_text`, Shift_JIS, bỏ `rt/rp/.notes`, đổi `br` thành xuống dòng.
8. **Độ dài RSS**: nhiều tin Yonhap/BBC ngắn; RSS-trước-lọc vẫn cần kiểm độ dài từng bài khi mở (SPEC 6.1 fallback).
9. **Wikipedia TFA ko**: feed `featured` của ko không có `tfa` cho ngày kiểm tra; app nên coi thiếu `tfa` là "không có bài hôm nay" và không báo lỗi.

## Thiếu sót còn lại
- Tiếng Hàn chưa có nguồn văn học (wikisource ko không có index chương phù hợp). Đề xuất: bổ sung sau nếu tìm được bộ truyện có trang mục lục liệt kê chương.
- Tiếng Trung: RFI và DW (Giản) đã PASS; BBC (Phồn) cũng PASS. Nên cân nhắc thêm nguồn Giản thể nếu người dùng muốn; hiện tại cả bốn wiki/tin zh đều đã đúng ngôn ngữ.
- Smithsonian và CNA bị chặn bot; không đưa vào.
