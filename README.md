# EMS BIC v3

App theo dõi WIP theo lot/công đoạn cho nhà máy (HTML/CSS/JS thuần + Cloudflare Worker + D1).

## Chạy thử không cần backend
Mở `index.html?mock` trên trình duyệt (dùng `mock.js`, dữ liệu giả).

## Cập nhật Worker (copy/paste trên Cloudflare) - chi tiết

Làm đúng thứ tự: **A (sao lưu) → B (secret) → C (dán code) → D (kiểm tra) → E (front-end)**.

### A. Sao lưu D1 (1 phút, nên làm)
Dashboard → **Storage & Databases → D1 SQL database** → chọn database → tab **Settings** (hoặc nút **Export**) → Export ra file `.sql` và cất ở nơi an toàn (không đưa lên git).

### B. Tạo secret `AUTH_SECRET` (bắt buộc)
1. Tạo chuỗi ngẫu nhiên. Mở PowerShell trên máy, chạy:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})`
   Copy chuỗi 40 ký tự in ra (không chia sẻ cho ai).
2. Dashboard → **Workers & Pages** → bấm tên Worker API.
3. Tab **Settings** → mục **Variables and Secrets** → **Add**.
4. Type = **Secret**, Variable name = `AUTH_SECRET` (đúng chữ hoa), Value = chuỗi vừa tạo → **Deploy** (hoặc Save).
5. (Tùy chọn) Add tiếp: Type = **Text**, name = `ALLOWED_ORIGIN`, value = địa chỉ Pages của bạn, ví dụ `https://ems-bic.pages.dev` (không có dấu `/` ở cuối). Bỏ qua thì ai cũng gọi được API (vẫn cần token).
6. Kiểm tra mục **Bindings**: phải có binding D1 tên **`DB`** trỏ tới database của bạn (code dùng `env.DB`). Chưa có thì Add → D1 database → Variable name `DB`.

### C. Dán code Worker
1. Trong VS Code mở `worker/worker.js` → Ctrl+A → Ctrl+C.
2. Dashboard → Worker API → góc trên phải bấm **Edit code** (hoặc nút `</>`).
3. Bấm vào khung code, Ctrl+A rồi Ctrl+V để dán **đè toàn bộ** file cũ.
4. Bấm **Deploy** (góc trên phải) → xác nhận. Thấy báo "Deployed" là xong.

### D. Kiểm tra Worker
- Mở địa chỉ Worker (dạng `https://ten-worker.ten-ban.workers.dev/api/stages`) trên trình duyệt: phải thấy `{"error": ...}` kiểu **401 chưa đăng nhập**. Như vậy là đúng (API đã bị khóa).
- Thấy lỗi 500 hoặc "chưa cấu hình AUTH_SECRET": quay lại bước B.
- Xem lỗi chi tiết: Worker → tab **Observability / Logs** (hoặc **Real-time Logs** → Begin log stream), rồi thao tác lại trên app.

### E. Đưa front-end lên Pages
Upload `index.html`, `style.css`, `script.js`, `manifest.json`, logo/icon lên Cloudflare Pages (Workers & Pages → project Pages → **Create deployment** → kéo thả thư mục). Chỉ làm bước này **sau** khi Worker đã deploy xong, vì front-end mới gửi token còn Worker cũ thì không hiểu.
Kiểm tra `API_BASE_URL` ở đầu `script.js` đang trỏ đúng địa chỉ Worker.

### Lần đầu đăng nhập sau khi cập nhật
- Mọi tài khoản đang dùng `000` hoặc `0000` bị **ép đổi mật khẩu**. Mật khẩu mới không được là `000`/`0000`.
- Sai mật khẩu 5 lần thì bị khóa 5 phút.
- Phiên cũ trên máy sẽ bị đăng xuất, đăng nhập lại là được.
- Worker tự tạo bảng phụ (`Login_Attempts`) và index lần chạy đầu, không cần chạy SQL tay. Dữ liệu cũ không bị đổi.

### Nếu có sự cố
Dashboard → Worker → tab **Deployments** → chọn bản cũ → **Rollback**.

Quy ước cho `worker/worker.js`:
- Luôn là **một file duy nhất**, không `import`, để dán thẳng vào dashboard được.
- D1 binding và secret (ví dụ `AUTH_SECRET` ở giai đoạn 1) đặt trong dashboard: Settings → Bindings / Variables and Secrets.
- Sửa schema D1: chạy câu SQL trong dashboard → D1 → database → Console. Lưu câu SQL đã chạy vào `worker/migrations/`.

## Front-end
Đưa `index.html`, `style.css`, `script.js` (và các file trong `js/` khi đã tách) lên Cloudflare Pages.

## Thư mục
- `worker/`: mã backend và migrations
- `archive/`: bản cũ, chỉ tham khảo
- `ROADMAP.md`: kế hoạch làm từng bước
