# EMS BIC v3

App theo dõi WIP theo lot/công đoạn cho nhà máy. UI tiếng Việt.

## Nguyên tắc
- Vanilla HTML/CSS/JS. Không framework, không bắt buộc build step. ES modules được phép.
- Giữ phong cách hiện tại. Sửa nhỏ, từng bước. Không viết lại cả file.
- Mọi chuỗi hiển thị bằng tiếng Việt.
- Không gán dữ liệu động vào innerHTML nếu chưa qua esc().
- Không commit dữ liệu thật: backup.sql, .wrangler/, .dev.vars.
- Mỗi bước trong ROADMAP.md làm xong, kiểm tra, rồi mới commit.

## Cấu trúc
- index.html, style.css, script.js: front-end (sẽ tách dần sang js/*.js)
- worker/worker.js: Cloudflare Worker (API) + D1. Phải là MỘT file, không import,
  vì người dùng copy/paste thẳng vào Cloudflare Dashboard (không dùng wrangler).
- worker/migrations/: các câu SQL đã/sẽ chạy trong D1 Console
- mock.js: backend giả, bật bằng ?mock
- archive/: bản cũ, chỉ tham khảo, không sửa

## Vai trò
- ADMIN (line_id=ALL): mã hàng, công đoạn, PO/LOT, NG, ma trận, lịch sử
- LEADER: chỉ line của mình, chuyển lot, lịch sử

## Dữ liệu cốt lõi
- Inventory là sổ cái tồn (product, lot, stage, quantity).
- NG nằm ở stage <STAGE>_NG. Công đoạn cuối chuyển vào THANH_PHAM.
- Mọi thay đổi tồn phải ghi Transactions_Log.

## Chạy và kiểm tra
- Mở index.html?mock để chạy không cần backend.
- Deploy worker: copy worker/worker.js dán vào Dashboard → Workers & Pages → Edit code → Deploy.
- Secret/binding đặt trong dashboard, không ghi vào code.
- Test logic thuần: `node --test` (sau khi có test).

## Lộ trình
Xem ROADMAP.md: dọn repo → bảo mật → toàn vẹn dữ liệu → tách module → UI/UX → tính năng mới.
