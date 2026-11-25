# Tiến độ Đọc Song Ngữ

## M1
Đã hoàn thành tách câu, chuẩn hóa URL, phát hiện ngôn ngữ và NLP bốn ngôn ngữ. Chạy `node --test tests/nlp.test.js` được 6/6. Tiếp theo là lưu trữ, nguồn bài, trích xuất và dịch. Chưa kiểm thử tokenizer trên WebView.

## M2
Đã nối IndexedDB, sổ JSONL, các nguồn, trích xuất, chọn bài và dịch nền. `node --test tests/core.test.js` qua 4/4. Tiếp theo là giao diện, worker và máy chủ PC. Các nguồn trực tuyến sẽ được kiểm tra bằng smoke ngoài sandbox.

## M3
Đã tạo giao diện bốn tuyến, worker Nhật/Trung, shell PC và chạy `node tools/vendor.mjs`. Chạy PC bằng `run.bat`. Kuromoji dùng classic worker với global `self.kuromoji`. Pinyin-pro dùng toàn bộ `dist/esm/`, OpenCC dùng `dist/esm/full.js`, jieba dùng web ESM và WASM cùng thư mục. Worker module không cần nạp UMD. Tiếp theo là từ điển và popup. Chưa đo thời gian khởi động Edge hoặc chạy trên Android.

## M4
Đã nối cài/gỡ từ điển, giải nén trong worker, tra chỉ mục và popup vào trình đọc. `node --test tests/dict.test.js` qua 1/1 với ba định dạng. Tiếp theo là smoke, README và kiểm tra cuối. Chưa tải gói thật.

## Bước 3a
Đã chạy npm test: 17/17 (13 cũ + 4 mới trong tests/fixes.test.js). Đã sửa 3 lỗi: (1) series Wikisource lấy thứ tự chương từ HTML trang mục lục (web/sources/wikisource.js); (2) bài gợi ý dưới 800 ký tự (ja/zh/ko) hoặc 1 500 (en) bị đánh dấu bad và chọn bài khác (web/core/jobs.js, recommend.js); (3) Wikimedia được xếp hàng theo host, cách nhau ≥ 1 000 ms (web/core/net.js). Smoke: ja, zh, ko, en đều mở và dịch đạt ngưỡng, tra từ 20/20. Kiểm tra server PC cổng 8798 đạt. Chi tiết và việc còn lại: docs/test_report.md.

## Fix round 1
Giới hạn lượt cập nhật và kho theo ngôn ngữ, thêm tiến độ nguồn và tách kiểm tra độ dài khỏi phân tích câu. Wikipedia lọc theo kích thước nguồn, Wikisource bổ sung chương theo hạn mức, thẻ Hôm nay giữ bài hợp lệ và luân phiên loại bài. Đã thêm bộ lọc loại bài, sửa số đếm Hôm nay và Lịch sử, hiện trạng thái dịch và nút thử lại, và sửa tra thân từ tiếng Hàn. Kiểm thử ngoại tuyến qua 32/32 (15 ca mới).
