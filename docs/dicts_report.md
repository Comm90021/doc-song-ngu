# Báo cáo kiểm chứng nguồn từ điển offline

Ngày kiểm: 2026-11-25. Môi trường: Windows 11, Node v24. Tải thật một lần cho từng nguồn; file tạm nằm trong thư mục scratchpad (đã xóa các file tải lớn sau khi kiểm). Kích thước MiB = byte / 1048576.

## 1. Bảng tổng hợp

| Cặp | Nguồn đã chọn | Giấy phép | Định dạng | Kích thước tải | Số mục | CORS | URL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| zh → vi | CVDICT (ph0ngp/CVDICT), file `CVDICT.u8` | CC BY-SA 4.0 | `cedict` | 10.30 MiB (không nén) | 122.597 | true (`Access-Control-Allow-Origin: *`) | https://raw.githubusercontent.com/ph0ngp/CVDICT/main/CVDICT.u8 |
| ja → en | JMdict common (scriptin/jmdict-simplified 3.6.2), `jmdict-eng-common-3.6.2.json.zip` | CC BY-SA 4.0 (EDRDG) | `jmdict_simplified` (zip, entry `jmdict-eng-common-3.6.2.json`) | 1.38 MiB (zip) | 22.662 | **false** (CDN của GitHub không trả ACAO) | https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261123231529/jmdict-eng-common-3.6.2%2B20261123231529.json.zip |
| ko → en | Kengdic (garfieldnate/kengdic), `kengdic.tsv` | MPL 2.0 hoặc LGPL 2.0+ (README). datapackage.json ghi CC BY-SA 3.0 / LGPL-2.0 | `tsv` | 11.11 MiB (không nén) | 117.509 có nghĩa (133.764 dòng dữ liệu) | true (`*`) | https://raw.githubusercontent.com/garfieldnate/kengdic/master/kengdic.tsv |
| ko → vi | Không có nguồn đạt yêu cầu | — | — | — | — | — | — |
| en → vi | Không có nguồn đạt yêu cầu (xem mục 4) | — | — | — | — | — | — |

`web/dicts.json` chỉ có 3 đối tượng: zh, ja, ko. Không có mục `en` và không có mục `ko→vi`.

## 2. Mẫu dòng thô và cách ánh xạ

### zh → vi: CVDICT (`cedict`)
Đầu file có các dòng comment bắt đầu bằng `#` (ghi nguồn, giấy phép). Mẫu dòng dữ liệu:
```
% % [pa1] /phần trăm (Đài Loan)/
2019冠狀病毒病 2019冠状病毒病 [er4 ling2 yi1 jiu3 guan1 zhuang4 bing4 du2 bing4] /COVID-19, bệnh coronavirus được xác định năm 2019/
21三體綜合症 21三体综合症 [er4 shi2 yi1 san1 ti3 zong1 he2 zheng4] /bệnh tam nhiễm sắc thể; hội chứng Down/
3C 3C [san1 C] /máy tính, truyền thông và điện tử tiêu dùng/Chứng nhận Bắt buộc của Trung Quốc (CCC)/
AB制 AB制 [A B zhi4] /chia hóa đơn (trong đó nam trả phần lớn hơn)/(sân khấu) hệ thống hai diễn viên luân phiên đóng vai chính, một người thay thế nếu người kia không thể diễn/
```
Ánh xạ: cột 1 = Traditional (`head`), cột 2 = Simplified (`alt`, bỏ qua nếu trùng cột 1 hoặc muốn giữ), `[...]` = `reading` (pinyin có số thanh điệu), `/.../` = senses, tách theo `/`. Không có POS trong CVDICT (`pos` = null). Ví dụ dòng 4 có 2 nghĩa tách bởi `/`, nghĩa 1 là `máy tính, ...` và nghĩa 2 là `Chứng nhận ...`.

### ja → en: JMdict common (`jmdict_simplified`)
Mẫu (đã rút gọn từ JSON, rút ra từ `jmdict-eng-common-3.6.2.json`):
```
{"id":"1000110","kanji":[{"text":"ＣＤプレーヤー"},{"text":"ＣＤプレイヤー"}],"kana":[{"text":"シーディープレーヤー"},{"text":"シーディープレイヤー"}],"sense":[{"partOfSpeech":["n"],"gloss":[{"lang":"eng","text":"CD player"}]}]}
{"id":"1000160","kanji":[{"text":"Ｔシャツ"}],"kana":[{"text":"ティーシャツ"}],"sense":[{"partOfSpeech":["n"],"gloss":[{"lang":"eng","text":"T-shirt"}]}]}
{"id":"1000360","kanji":[],"kana":[{"text":"あっさり"},{"text":"アッサリ"}],"sense":[{"partOfSpeech":["adv","adv-to","vs"],"gloss":[{"lang":"eng","text":"easily"},{"lang":"eng","text":"readily"},{"lang":"eng","text":"quickly"},{"lang":"eng","text":"flatly (refuse)"}]}]}
{"id":"1000320","kanji":[{"text":"彼処"},{"text":"彼所"}],"kana":[{"text":"あそこ"},{"text":"あすこ"},{"text":"かしこ"},{"text":"アソコ"},{"text":"あしこ"}],"sense":[{"partOfSpeech":["pn"],"gloss":[{"lang":"eng","text":"there"},{"lang":"eng","text":"over there"}]},{"partOfSpeech":["n"],"gloss":[{"lang":"eng","text":"genitals"}]}]}
```
Ánh xạ: `head` = `kanji[0].text` nếu có, không thì `kana[0].text`; `alt` = các kanji còn lại (hoặc null); `reading` = `kana[0].text`; `pos` = các `partOfSpeech` (nối bằng `,`, ví dụ `adv,adv-to,vs`); `senses` = mỗi `sense` một nghĩa, gồm các `gloss` có `lang == "eng"` nối bằng `; `. Ví dụ dòng 4 có 2 nghĩa tách nhau.

### ko → en: Kengdic (`tsv`)
Dòng đầu là header (`id surface hanja gloss level created source`). Mẫu (tab là dấu phân cách):
```
1	전원의  행진		promenade		2006-01-16T09:52:46Z	engdic-140261@ezcorean:140261
91	가두다		lock in, shut in		2009-03-08T20:47:26Z	joe-107306@ezcorean:107306
257	견지	見地	a slanting point of view (특수한), point of  view		2009-02-26T02:10:46Z	joe-169741@ezcorean:169741
523	금일	今日	today, the day in question		2009-01-24T10:42:34Z	exchange-211237@ezcorean:211237
182	같은		Mephistophelean, Mephistophelian		2006-01-16T09:52:46Z	engdic-113400@ezcorean:113400
```
Ánh xạ (theo `columns`): `head` = cột 1 (`surface`), `alt` = cột 2 (`hanja`, có thể rỗng → null), `reading` = null, `pos` = null, `senses` = cột 3 (`gloss`). Cột `level`, `created`, `source` bỏ qua.

## 3. Những điều parser phải xử lý đặc biệt

- **CEDICT/CVDICT**: dòng `#` là comment, bỏ qua. Dòng trống bỏ qua. CVDICT dùng LF; bản MDBG (CEDICT) dùng CRLF, cần `trim` ký tự `\r` cuối dòng. Có 1 dòng lỗi trong CVDICT: `澳洲廣播電臺 澳洲广播电台 [[Ao4 zhou1 Guang3 bo1 Dian4 tai2] ] /...` (dấu `[[`). Parser nên dùng regex lỏng, bỏ dòng không khớp thay vì dừng. Số mục đếm theo regex `^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/$` là 122.596 (cộng 1 dòng lỗi = 122.597 dòng dữ liệu).
- **CVDICT senses**: tách theo `/`, bỏ phần rỗng ở đầu/cuối. 46.803 mục có từ 2 nghĩa trở lên. Trong nghĩa có dấu `;` và `,` là dấu câu trong nghĩa, không phải dấu tách nghĩa.
- **Pinyin**: có số thanh điệu (`ling2`, `pa1`). Nếu app cần hiển thị pinyin có dấu thanh, phải tự chuyển. Có mục pinyin dạng chữ cái (`[A B zhi4]`, `[san1 C]`) và một mục hỏng (xem trên).
- **JMdict JSON**: file có khóa trùng khác chữ hoa/thường (`rK` và `rk`). `JSON.parse` của JavaScript chấp nhận (ghi đè), nhưng `ConvertFrom-Json` của PowerShell thì báo lỗi. Chỉ dùng JSON.parse trong app. Có 4.469 mục không có kanji (chỉ kana), parser phải dùng kana làm `head`.
- **JMdict zip**: `zip_entry` là `jmdict-eng-common-3.6.2.json`. Tên này chứa số phiên bản, nên khi `url_resolver` lấy bản mới thì tên entry có thể đổi. Nên tìm entry `.json` duy nhất trong zip thay vì khớp tên cố định.
- **JMdict gloss**: `gloss` có nhiều ngôn ngữ trong bản đầy đủ, nhưng bản `eng-common` chỉ có `lang: "eng"`. Vẫn nên lọc `lang == "eng"` cho an toàn.
- **Kengdic**: có 1 dòng header (`skip_lines: 1`). Cột `surface` có khoảng trắng kép bên trong (`전원의  행진`), nên chuẩn hóa khoảng trắng. 16.255 dòng không có nghĩa (cột 3 rỗng), bỏ qua các dòng đó. Dấu tách nghĩa: `;` và `/` xuất hiện trong 1.278 dòng; dấu `,` là dấu câu bên trong nghĩa nên không dùng để tách. Kengdic không có BOM, dùng LF.
- **Kengdic licence**: README ghi MPL 2.0 hoặc LGPL 2.0+; `datapackage.json` ghi CC BY-SA 3.0 hoặc LGPL-2.0. Cả hai đều cho phép dùng cá nhân và phân phối; ghi cả hai trong giao diện "Giới thiệu" nếu cần.
- **CORS**: JMdict bị CORS = false. Trình duyệt sẽ chặn `fetch` trực tiếp từ `github.com` / `release-assets.githubusercontent.com`. Cần một proxy có CORS, hoặc app phải cung cấp file này qua cùng nguồn (ví dụ host trên chính web app), nếu không mục ja sẽ không tải được trên PC. Với Android app bản native thì không bị chặn.
- **URL GitHub release**: link `releases/download/...` redirect 302 sang `release-assets.githubusercontent.com` có chữ ký hết hạn sau khoảng 1 giờ. Chỉ dùng link gốc `github.com`, không lưu link redirect.

## 4. Nguồn đã thử và loại

- **CVDICT GitHub Release**: `v1.0.0` không có asset nào, nên dùng file `main` (`CVDICT.u8`). Repo chưa có giấy phép trong metadata API; giấy phép CC BY-SA 4.0 ghi trong README và header file.
- **CC-CEDICT (MDBG zip)** `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip`: 3.80 MiB, entry `cedict_ts.u8`, 125.472 mục, CRLF. **CORS = false** (không có ACAO). Dự phòng zh→en nếu cần, nhưng không đưa vào `dicts.json` vì CVDICT đã đạt và CORS của nó sai.
- **Korean → Vietnamese (KRDict, 한국어기초사전)**: không có bulk download không cần đăng nhập/khóa API. Tìm GitHub theo `krdict vietnamese` và `korean vietnamese tsv dictionary` không có kết quả phù hợp. `ngoloc2k4/VietnamKoreanDictionary` là từ điển Việt → Hàn, không có giấy phép, không kiểm tra định dạng. `changwoo/krdict-converted` (XDXF, giấy phép NOASSERTION) chỉ có định nghĩa tiếng Hàn. Không dùng.
- **English → Vietnamese**:
  - `yenthanh132/avdict-database-sqlite-converter` có `anhviet109K.txt` (14.8 MB, khoảng 108.854 mục `@headword`, BOM UTF-8). Đây là dữ liệu của Free Vietnamese Dictionary Project (FVDP). Repo không có giấy phép riêng, `vietanh.txt` ghi GPL. Định dạng **nhiều dòng** (`@từ`, `* từ loại`, `- nghĩa`, `=ví dụ+dịch`) nên **không khớp** cả 3 định dạng app hỗ trợ. Có thể viết bộ chuyển đổi sang TSV, nhưng khi đó file TSV phải được host ở đâu đó (không có chỗ host trong dự án) và giấy phép phải xác nhận lại. Không đưa vào `dicts.json`.
  - `balanced-team/envidict` (MIT): mã nguồn ứng dụng Expo, chưa kiểm tra dữ liệu có nằm trong repo hay không; không dùng.
  - `manhminno/English-Vietnamese-Dictionary`: file `Dictionary` là ELF nhị phân, không có giấy phép. Không dùng.
  - `ntd172/kindle-dict`, `catusf/tudien` (CC0 nhưng là từ điển tiếng Việt đơn ngữ): không phù hợp.

## 5. Kết luận tóm tắt

- zh → vi: CVDICT. Đạt đủ điều kiện (CC BY-SA 4.0, định dạng `cedict`, CORS có, 10.3 MiB).
- ja → en: JMdict common (EDRDG CC BY-SA 4.0). Định dạng và giấy phép đạt, kích thước 1.38 MiB, nhưng **CORS = false**.
- ko → en: Kengdic (MPL 2.0/LGPL). Định dạng TSV, CORS có, 11.1 MiB, 117.509 mục có nghĩa. Không có ko → vi.
- en → vi: không có nguồn đạt, không ghi mục nào.
