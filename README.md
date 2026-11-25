# Đọc Song Ngữ

Đọc từng câu tiếng Trung, Nhật, Hàn và Anh cùng phiên âm và bản dịch. Dán liên kết hoặc chọn bài ở **Hôm nay**. Cuộn tới câu cuối rồi chọn **Đã đọc xong** để lưu liên kết vào lịch sử.

## Chạy trên Windows

Trong thư mục dự án, chạy ` .\run.bat ` để mở Edge. Máy cần Python 3 với lệnh `py -3`. Lần đầu tạo thư viện web cần Node.js và thư mục `node_modules` đã cài. Có thể chạy riêng `py -3 pc/server.py` rồi mở `http://127.0.0.1:8765/`. Đóng cửa sổ máy chủ để dừng.

## Kiểm tra

- `npm test` chạy bộ kiểm thử ngoại tuyến.
- `node tools/vendor.mjs` sao chép lại các thư viện trình duyệt.
- `node tools/smoke.mjs` cần mạng để thử nguồn bài, dịch và tra từ thật.

## Bố cục

- `web/core/`, `web/sources/`, `web/nlp/`, `web/ui/` chứa xử lý bài, nguồn, ngôn ngữ và giao diện dùng chung.
- `web/sources.json`, `web/dicts.json` là danh mục nguồn và từ điển. `web/vendor/` được tạo từ thư viện cài sẵn.
- `pc/server.py` phục vụ giao diện và ghi lịch sử vào `data/da_doc.jsonl`. Nội dung bài đang đọc nằm trong IndexedDB của trình duyệt.
- `tests/` chứa bài kiểm thử và dữ liệu mẫu. `docs/PROGRESS.md` ghi kết quả bàn giao.
