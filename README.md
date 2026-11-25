# Đọc Song Ngữ

Đọc từng câu tiếng Trung, Nhật, Hàn và Anh cùng phiên âm và bản dịch. Dán liên kết hoặc chọn bài ở **Hôm nay**. Cuộn tới câu cuối rồi chọn **Đã đọc xong** để lưu liên kết vào lịch sử.

## Chạy trên Windows

Trong thư mục dự án, chạy ` .\run.bat ` để mở Edge. Máy cần Python 3 với lệnh `py -3`. Lần đầu tạo thư viện web cần Node.js và thư mục `node_modules` đã cài. Có thể chạy riêng `py -3 pc/server.py` rồi mở `http://127.0.0.1:8765/`. Đóng cửa sổ máy chủ để dừng.

## Cài trên Android

1. Trên điện thoại, mở trang https://github.com/Comm90021/doc-song-ngu/releases rồi tải file `DocSongNgu-b<số>.apk` của bản mới nhất.
2. Mở file đó. Nếu máy hỏi, cho phép trình duyệt "cài ứng dụng không rõ nguồn". Nếu Play Protect cảnh báo, chọn **Vẫn cài đặt**.
3. Bản mới cài đè lên bản cũ, không cần gỡ, lịch sử đọc vẫn còn. Mỗi lần đẩy mã lên nhánh `main`, GitHub Actions dựng một bản mới. Bản mới được ký bằng khóa trong `.secrets/`; khóa này không nằm trên GitHub.
4. **Sao lưu thư mục `.secrets/`** (USB hoặc ổ cá nhân). Nếu mất khóa, các bản sau không cài đè được và sẽ phải gỡ app, mất lịch sử. Trước khi gỡ, dùng **Lịch sử → Xuất** để giữ danh sách link.

Điện thoại và máy tính là hai app riêng, mỗi máy giữ dữ liệu của mình, không đồng bộ.

## Dịch

Dịch bằng Google miễn phí qua 2 cổng. Cổng chính trả đúng từng câu, cổng phụ dùng khi cổng chính lỗi. Cổng nào bị giới hạn (lỗi 429) thì tạm nghỉ 10 phút. Nếu cả hai cùng bị giới hạn, bài hiện "Dịch tạm dừng — bấm để thử lại". Có thể dùng API kiểu OpenAI (Gemini, DeepSeek…) trong **Cài đặt → Bộ dịch**.

## Kiểm tra

- `npm test` chạy bộ kiểm thử ngoại tuyến.
- `node tools/vendor.mjs` sao chép lại các thư viện trình duyệt.
- `node tools/smoke.mjs` cần mạng để thử nguồn bài, dịch và tra từ thật.

## Bố cục

- `web/core/`, `web/sources/`, `web/nlp/`, `web/ui/` chứa xử lý bài, nguồn, ngôn ngữ và giao diện dùng chung.
- `web/sources.json`, `web/dicts.json` là danh mục nguồn và từ điển. `web/vendor/` được tạo từ thư viện cài sẵn.
- `pc/server.py` phục vụ giao diện và ghi lịch sử vào `data/da_doc.jsonl`. Nội dung bài đang đọc nằm trong IndexedDB của trình duyệt.
- `tests/` chứa bài kiểm thử và dữ liệu mẫu. `docs/PROGRESS.md` ghi kết quả bàn giao.
