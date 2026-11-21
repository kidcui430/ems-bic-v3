# ROADMAP: làm từng bước, không cần gấp

Quy ước: mỗi mục `[ ]` là một việc nhỏ, làm xong thì kiểm tra rồi commit riêng. Không sang giai đoạn sau khi giai đoạn trước chưa kiểm xong.
Luôn giữ vanilla HTML/CSS/JS.

---

## Giai đoạn 0: Dọn repo (khoảng 1 buổi, rủi ro thấp)

- [x] 0.1 Tạo `.gitignore` (`.wrangler/`, `.dev.vars`, `backup.sql`, `node_modules/`).
- [x] 0.2 `git rm --cached -r .wrangler backup.sql` (file vẫn còn trên máy, chỉ bỏ khỏi git).
- [x] 0.3 Tạo thư mục `archive/`, chuyển vào: `script (1).js`, `script(2).js`, `script.txt`, `style.txt`, `index.txt`.
- [x] 0.4 Tạo `worker/`, chuyển `worker.txt` thành `worker/worker.js`. Giữ **một file duy nhất, không import** để copy/paste vào Cloudflare Dashboard. Không dùng wrangler.toml.
- [x] 0.5 Tạo `README.md` ngắn: cách chạy `?mock`, cách dán worker vào dashboard.
- [x] 0.6 Cập nhật `CLAUDE.md` cho khớp.

Quy ước deploy từ đây: secret (ví dụ `AUTH_SECRET`) đặt ở Dashboard → Settings → Variables and Secrets. Migration SQL chạy tay trong D1 Console, lưu bản sao vào `worker/migrations/`.

**Kiểm tra:** mở `index.html?mock`, đăng nhập thử, các tab vẫn chạy. `git status` sạch.
**Commit:** `chore: don dep repo, them gitignore, tach worker`

> Lưu ý: `backup.sql` và `.wrangler` đã nằm trong lịch sử git. Nếu repo đã đẩy lên GitHub công khai, cần xóa khỏi lịch sử và đổi mật khẩu (xem 1.8).

---

## Giai đoạn 1: Bảo mật (ưu tiên cao nhất) - ĐÃ CODE XONG, chờ deploy và thử thật

Làm theo thứ tự, mỗi mục một commit.

- [x] 1.1 **Escape XSS phía client.** Thêm hàm `esc()` trong `script.js`, áp dụng cho từng chỗ `innerHTML` có dữ liệu động (làm từng tab: master, stages, po, ng, matrix, history, leader).
- [x] 1.2 **Bỏ `onclick` có chèn dữ liệu.** Thay bằng `data-*` + `addEventListener`.
- [x] 1.3 **Server: hàm băm mật khẩu** PBKDF2 (WebCrypto). Cột mới `password_salt`. Khi login đúng bằng mật khẩu plaintext cũ thì băm lại và xóa bản plaintext (di trú dần).
- [x] 1.4 **Server: `/api/login` không trả mật khẩu.** Chỉ trả `username, role, line_id, full_name, must_change_password` + token.
- [x] 1.5 **Server: token HMAC có hạn** (secret `AUTH_SECRET` đặt trong Dashboard → Settings → Variables and Secrets). Hàm `requireAuth(request, roles)` dùng cho mọi endpoint trừ login. Lấy `user_id`, `line_id` từ token.
- [x] 1.6 **Client:** lưu token, gửi header `Authorization`. Xử lý 401 bằng cách đăng xuất, 403 bằng thông báo.
- [x] 1.7 **`/api/change-password`:** cần token + mật khẩu cũ. Client thêm ô nhập lại mật khẩu mới, bỏ kiểm `password_hash === "000"` ở trình duyệt, dùng cờ `must_change_password`.
- [~] 1.8 **Mật khẩu cũ:** mật khẩu plaintext được băm tự động ở lần đăng nhập đúng đầu tiên; ai dùng `000`/`0000` bị ép đổi. (Bỏ qua việc xóa `backup.sql` khỏi lịch sử git vì repo cá nhân.) Còn lại: tài khoản chưa đăng nhập lần nào vẫn là plaintext trong D1 cho tới lúc họ đăng nhập.
- [x] 1.9 **Giới hạn đăng nhập sai** (đếm theo username + thời gian, khóa tạm 5 phút sau 5 lần sai).
- [x] 1.10 **CORS** chỉ cho domain thật. Lỗi 500 trả thông báo chung, log chi tiết phía server.
- [x] 1.11 Cập nhật `mock.js` theo API mới (token, 401/403) để vẫn test được không cần backend.

**Kiểm tra:** gọi API không token nhận 401. LEADER gọi endpoint admin nhận 403. `/api/login` không còn trả mật khẩu. Nhập `<img src=x onerror=alert(1)>` làm tên lot, không chạy. Đổi mật khẩu sai mật khẩu cũ bị từ chối.

---

## Giai đoạn 2: Toàn vẹn dữ liệu - 2.1, 2.2, 2.3, 2.5 đã code xong; 2.4, 2.6-2.9 còn lại

Luôn **sao lưu D1** (Dashboard → D1 → Export) và chạy SQL migration thử trên bản sao trước. SQL chạy trong D1 Console.

- [x] 2.1 **`/api/move` atomic:** `UPDATE ... SET quantity = quantity - ? WHERE quantity >= ?` trong `batch`, kiểm số dòng bị ảnh hưởng, nếu 0 thì trả lỗi "không đủ tồn".
- [x] 2.2 **Index:** `Transactions_Log(timestamp)`, `Inventory(lot_number, stage_id)`. Worker tự tạo, bản SQL ở `worker/migrations/001_indexes.sql`.
- [x] 2.3 `getOrInitStages` và tạo bảng/index chỉ chạy 1 lần mỗi instance (hàm `ensureSchema`), không chạy ở mỗi request.
- [ ] 2.4 **Một nguồn danh sách stage mặc định** (ở worker), client và `mock.js` đọc từ `/api/stages`.
- [x] 2.5 **Validate `routing_map`** khi lưu và khi dùng. Hỏng thì báo lỗi, không đẩy lot vào `THANH_PHAM`.
- [ ] 2.6 **Chuẩn hóa `Inventory.product_id`** thành id số (migration `002`), bỏ `CAST/UPPER` ở các query.
- [ ] 2.7 **Chuẩn hóa `Production_Orders.month`** (`YYYY-MM`) và cột lot trong `Transactions_Log`.
- [ ] 2.8 **Cờ `is_ng` cho stage** thay cho hậu tố `_NG` (migration `003`), cập nhật query ma trận/NG.
- [ ] 2.9 Gộp `Lines`, `Stages` về `Stages_Config` (hoặc bỏ code đồng bộ), thôi nuốt lỗi.

**Kiểm tra:** gửi 2 lệnh `/api/move` cùng lúc, tồn không âm. Tổng tồn trước và sau migration bằng nhau. Ma trận dashboard cho kết quả giống trước.

---

## Giai đoạn 3: Cấu trúc code (vẫn vanilla) - BỎ QUA theo quyết định của chủ dự án: giữ `script.js` là một file

Tách từng module một. Sau mỗi lần tách, mở app kiểm các tab liên quan rồi mới commit.

- [ ] 3.1 `index.html` đổi sang `<script type="module" src="js/main.js">`. Kiểm tra app vẫn chạy khi `main.js` import `script.js` cũ.
- [ ] 3.2 `js/api.js`: gom `fetch`, gắn token, xử lý lỗi, URL gốc cấu hình được.
- [ ] 3.3 `js/ui.js`: `esc()`, toast, modal xác nhận, hàm định dạng ngày/số.
- [ ] 3.4 `js/auth.js`: login, đổi mật khẩu, logout.
- [ ] 3.5 `js/admin/stages.js`, `master.js`, `po.js`, `ng.js` (mỗi file một tab).
- [ ] 3.6 `js/admin/matrix.js`, `history.js`, `js/export.js`.
- [ ] 3.7 `js/leader.js`.
- [ ] 3.8 Thay các `catch (e) {}` rỗng bằng xử lý lỗi thật (toast + `console.error`).
- [ ] 3.9 Test logic thuần bằng `node --test`: chia lot, tính ma trận, kiểm routing.

**Kiểm tra:** không còn `window.*` ngoài những hàm thật sự cần. `node --test` xanh. Toàn bộ tab chạy như trước.

---

## Giai đoạn 4: UI/UX (làm theo từng khu vực)

- [ ] 4.1 **Biến CSS** trong `:root` (màu, khoảng cách, cỡ chữ, bo góc). Thay giá trị cứng dần.
- [x] 4.2 **Toast + hộp xác nhận:** đã thay toàn bộ `alert()` bằng toast `notify()` và 4 `confirm()` bằng `confirmDialog()`.
- [ ] 4.3 **Trạng thái tải/lỗi/mất mạng:** skeleton, banner "Mất kết nối", nhãn "Cập nhật lúc HH:MM".
- [x] 4.4 **Leader mobile-first:** nút to, `inputmode="numeric"`, nút "Tất cả PASS", màn xác nhận trước khi gửi, hoàn tác vài giây, giữ lot đang chọn khi tự refresh, bỏ khóa portrait.
- [ ] 4.5 **Admin responsive:** menu thu gọn trên màn nhỏ, bảng cuộn ngang có cột đầu dính, bỏ `max-height` cứng.
- [ ] 4.6 **Chuyển `style=""` inline sang class** (làm theo từng tab).
- [ ] 4.7 **Truy cập:** `role="tab"`/`aria-selected`, `role="dialog"` + bẫy focus + Esc, nhãn input, `:focus-visible` toàn cục, `prefers-reduced-motion`. OK/NG có ký hiệu kèm màu.
- [ ] 4.8 **Dark mode** bằng `prefers-color-scheme` (nhờ biến CSS ở 4.1).
- [ ] 4.9 **Hiệu năng:** nén `logo.png` (1 MB), dừng polling khi tab ẩn (`visibilitychange`), phân trang ma trận và lịch sử, cập nhật DOM theo dòng.
- [ ] 4.10 **PWA:** `sw.js` cache app shell, sửa icon `maskable` riêng, cho phép xoay màn hình.
- [ ] 4.11 **Xuất file:** CSV chuẩn UTF-8 BOM, hoặc `.xlsx` bằng thư viện CDN pin phiên bản.

**Kiểm tra:** Lighthouse (Accessibility, PWA, Performance) trên điện thoại giả lập. Thử ngắt mạng. Dùng bàn phím duyệt hết app.

---

## Giai đoạn 5: Mở rộng (chọn theo nhu cầu thật, mỗi mục độc lập)

- [ ] 5.1 Trang quản lý user cho admin (tạo, reset mật khẩu, khóa, gán line).
- [ ] 5.2 Mã lỗi NG có danh mục + biểu đồ Pareto theo công đoạn.
- [ ] 5.3 KPI: yield theo công đoạn/line, cảnh báo lot nằm lại quá lâu.
- [ ] 5.4 Quét QR/barcode lot bằng camera cho leader.
- [ ] 5.5 In tem/phiếu lot.
- [ ] 5.6 Hoàn tác giao dịch (admin, có audit).
- [ ] 5.7 Thông báo lot chờ lâu / NG vượt ngưỡng (Cloudflare Cron + Telegram/email).
- [ ] 5.8 Đa ngôn ngữ vi/ja bằng file chuỗi.
- [ ] 5.9 Gia công ngoài (GCN) theo routing thay vì cứng trong code.

---

## Gợi ý nhịp làm
- Mỗi lần làm 1 đến 3 mục, rồi kiểm và commit.
- Giai đoạn 1 nên làm trước mọi thứ khác vì app đang mở toàn bộ API cho người ngoài.
- Có thể làm 4.1 đến 4.3 xen kẽ giai đoạn 1 và 2 vì ít rủi ro.
