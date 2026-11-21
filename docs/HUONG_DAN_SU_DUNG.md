# SX-BIC: Hướng dẫn sử dụng, hiện trạng và hướng phát triển

Cập nhật: 21-11-2026. File này tổng hợp lại toàn bộ những gì đã làm trên app (từ commit `466ae35` "Bảng test ngày 19-11" tới nay), cách dùng từng màn hình và những việc nên làm tiếp.

---

## 1. Hiện trạng: điều quan trọng nhất cần biết trước

### 1.1 Mọi thay đổi đều CHƯA commit
Từ commit cuối (19-11) tới nay đã sửa khoảng **3.000 dòng** ở 13 file. Tất cả còn nằm ở dạng chưa commit. Nếu lỡ tay xóa hay sửa hỏng thì không quay lại được.

**Việc nên làm ngay:** commit một lần làm "mốc an toàn" trước khi sửa thêm bất cứ gì. Sau đó mỗi lần sửa chỉ làm 1 việc, thử xong rồi commit.

### 1.2 Front-end mới và worker mới phải đi cùng nhau
Worker trong commit cũ **chưa có đăng nhập bằng token, chưa băm mật khẩu**. Front-end mới thì gửi token trong mọi lệnh gọi API.

| Ghép | Kết quả |
|---|---|
| Front-end mới + worker mới | Chạy đầy đủ (cách đúng) |
| Front-end mới + worker cũ | Có thể đăng nhập được nhưng nhiều chức năng lỗi: chống trùng PO, Sửa/Xóa LOT, thời gian công đoạn, khóa đăng nhập sai |
| Front-end cũ + worker mới | Không dùng được, vì API mới bắt buộc token |

=> Khi deploy: **dán worker trước, đặt secret `AUTH_SECRET`, rồi mới upload front-end**. Nếu chưa sẵn sàng dán worker thì giữ nguyên bản cũ ở cả hai phía.

### 1.3 Mức độ đã kiểm tra

| Phần | Đã kiểm | Chưa kiểm |
|---|---|---|
| Cú pháp JS (`node --check`) | Có, cả 3 file | |
| Hàm SQL tìm PO trùng, kiểm LOT "chưa sản xuất" | Có, chạy thử với SQLite | |
| Sắp xếp LOT, đổi đơn vị giờ | Có, chạy thử bằng node | |
| Giao diện trên trình duyệt | | Chỉ bạn thử bằng GoLive `?mock` |
| Worker thật trên Cloudflare + D1 thật | | **Chưa ai thử** |
| Điện thoại thật (xoay ngang, menu kéo) | | Chưa |

=> Lần deploy đầu nên làm vào lúc ít người dùng, và **Export D1 ra file backup trước** (Dashboard → D1 → database → Export).

---

## 2. Triển khai (deploy)

### 2.1 Worker (API)
1. **Backup D1 trước** (xem 1.3).
2. Cloudflare Dashboard → Workers & Pages → chọn worker → **Edit code**.
3. Xóa hết code cũ, dán toàn bộ [worker/worker.js](../worker/worker.js) → **Deploy**.
4. Settings → Variables and Secrets → thêm **Secret** tên `AUTH_SECRET`, giá trị là một chuỗi ngẫu nhiên dài (tối thiểu 32 ký tự). Không ghi chuỗi này vào code.
5. Settings → Bindings: kiểm tra D1 đã gắn với tên **`DB`**.
6. Worker tự tạo bảng/cột/index còn thiếu ở lần chạy đầu (`Login_Attempts`, cột `password_salt`, index). Không cần chạy SQL tay. Bản SQL tham khảo: [worker/migrations/001_indexes.sql](../worker/migrations/001_indexes.sql).

Chi tiết từng bước có hình dung: [README.md](../README.md).

### 2.2 Front-end (Cloudflare Pages)
Upload các file: `index.html`, `style.css`, `script.js`, `manifest.json`, `logo.png`, `logo192.png`, `logo512.png`.
**Không upload** `mock.js` cũng được (chỉ dùng khi thử). Không upload `backup.sql`, `.wrangler/`, `.dev.vars`, `archive/`.

### 2.3 Sau khi deploy
- Mỗi người đăng nhập lại 1 lần (token cũ không còn dùng được).
- Tài khoản đang dùng mật khẩu `000`/`0000` sẽ bị bắt đổi mật khẩu.
- Điện thoại đã "cài app" từ trước: **gỡ ra và cài lại** để nhận tên SX-BIC và cho xoay ngang.
- Vào Quản Lý Mã Hàng, **Sửa** từng mã hàng để nhập thời gian công đoạn (nếu muốn có cột Tổng giờ).

### 2.4 Chạy thử không cần backend
Mở `index.html?mock` (GoLive). Dữ liệu giả lưu trong trình duyệt (localStorage, khóa `ems_mock_database_v1`). Muốn làm lại từ đầu: F12 → Application → Local Storage → xóa khóa đó.
Nút đăng nhập nhanh có sẵn trên màn hình login ở chế độ mock.

---

## 3. Vai trò

| Vai trò | Ai | Thấy gì |
|---|---|---|
| **ADMIN** | Văn phòng / quản lý (line `ALL`) | 6 tab quản lý, xem màn hình của mọi line (chỉ xem) |
| **LEADER** | Tổ trưởng từng line | Chỉ line của mình: tồn, giao hàng, lịch sử giao |

Đăng nhập sai 5 lần liên tiếp thì tài khoản bị khóa 5 phút.

---

## 4. Hướng dẫn ADMIN

Trên điện thoại: menu tab nằm ở thanh bên **ẩn**, bấm nút ☰ hoặc vuốt từ mép trái màn hình để mở.

### 4.1 Quản Lý Mã Hàng
- **Tạo mã hàng:** nhập mã, tên, rồi bấm **+ Thêm bước** để dựng lộ trình công đoạn theo thứ tự.
- Mỗi bước có ô **thời gian (phút/pcs)**. Bỏ trống được. App đổi sang giờ để tính, ví dụ nhập 36 phút → 0.6 giờ.
- ▲ ▼ đổi thứ tự bước, ✕ xóa bước.
- Danh sách bên phải: **Sửa**, **Xóa**; dòng "⏱ Tổng … h/pcs" là tổng thời gian chuẩn 1 sản phẩm.
- Lộ trình rỗng vẫn lưu được nhưng chưa tạo LOT cho mã đó được.

### 4.2 Quản Lý Công Đoạn
- Thêm/sửa/xóa công đoạn, gán vào line. Công đoạn mới tự xếp vào cuối nhóm line của nó (cùng màu).
- ▲ ▼ đổi thứ tự hiển thị trên bảng báo cáo.
- Xóa công đoạn đang dùng trong lộ trình sẽ có cảnh báo liệt kê mã hàng bị ảnh hưởng.
- Line `BARRY` hiển thị là **Bari** (chỉ đổi chữ trên màn hình, mã trong D1 vẫn là `BARRY`).

### 4.3 Quản Lý LOT (cấp phát)
- Nhập mã PO (ví dụ `PO261118`), mã hàng, tổng số lượng, cỡ LOT → **xem trước** cách chẻ LOT (`PO261118-01`, `-02`…).
- **Chống trùng:** mỗi mã PO chỉ cấp phát 1 lần. Nhập lại PO đã dùng sẽ bị chặn và báo đã dùng cho mã hàng nào.
- Bảng bên cạnh có **Sửa / Xóa** từng LOT:
  - **Sửa ngày cấp:** luôn được.
  - **Sửa Tổng SL:** chỉ khi LOT chưa sản xuất (toàn bộ hàng còn ở công đoạn đầu, chưa NG, chưa chuyển).
  - **Xóa:** chỉ khi LOT chưa sản xuất. Đã chuyển công đoạn thì nút Xóa bị mờ.
  - Mọi lần sửa/xóa đều ghi vào lịch sử (`ADJUST`, `DELETE_LOT`).

### 4.4 Xử Lý Hàng NG
Hàng NG nằm ở "kho NG" của từng công đoạn. Chọn LOT, công đoạn, số lượng, rồi chọn phương án:
- **SCRAP (Báo hủy):** trừ hẳn khỏi LOT.
- **REWORK (Làm lại):** trả hàng về một công đoạn để làm lại. App tự gợi ý công đoạn liền trước trong lộ trình.

**Trường hợp hay gặp:** công đoạn trước giao 300 cái, công đoạn sau phát hiện lỗi cần trả về:
1. Leader công đoạn sau bấm giao với số lượng đó là **NG** (không phải PASS).
2. Admin vào tab này → chọn LOT → công đoạn sau → **REWORK** → chọn công đoạn trước.
3. Hàng quay về tồn của công đoạn trước, lịch sử ghi lại đầy đủ.

### 4.5 Báo Cáo & Tiến Độ (ma trận)
- Mỗi dòng là 1 LOT, mỗi cột là 1 công đoạn (OK / NG). **Chỉ hiện cột có dữ liệu.**
- Sắp xếp: **ngày mới nhất lên đầu, trong cùng ngày LOT tăng dần** (`-01`, `-02`…).
- Khi chưa lọc, chỉ hiện **100 LOT mới nhất**. Lọc theo Số LOT / Mã hàng / ngày để xem LOT cũ.
- Ô **Mã hàng** có danh sách tìm nhanh, bấm mũi tên để mở.
- Cột **Tổng giờ** = số lượng còn phải làm × thời gian chuẩn. Rê chuột vào ô OK để xem số giờ.
- Xuất **Excel / CSV** (có cột "Tổng giờ (h)"). Trên điện thoại nút xuất được ẩn bớt.
- Trên điện thoại: phần lọc và khung KPI tổng được ẩn, bấm nút để mở ra; tiêu đề và cột LOT dính khi cuộn.

### 4.6 Lịch Sử Luân Chuyển
Toàn bộ giao dịch: giao PASS/NG, SCRAP, REWORK, sửa/xóa LOT. Lọc theo ngày, loại; xuất Excel.

### 4.7 Xem màn hình Line (chỉ xem)
Trên dashboard admin có ô **"Xem màn hình Line"** → chọn line → thấy đúng màn hình leader của line đó, có dải vàng báo đang xem. Không giao hàng được trong chế độ này. Bấm thoát để quay lại.

---

## 5. Hướng dẫn LEADER

### 5.1 Số lượng tồn
Danh sách LOT đang nằm ở công đoạn của mình, sắp theo LOT tăng dần. Bấm vào 1 LOT để chuyển sang tab giao.

### 5.2 Thao Tác Giao
1. Chọn LOT (hoặc bấm từ tab tồn).
2. Nhập số **PASS** và số **NG**. Nút "tối đa" điền nhanh toàn bộ số đang có.
3. Bấm giao → màn hình **xác nhận** hiện tóm tắt → đồng ý.
4. PASS chuyển sang công đoạn kế tiếp theo lộ trình; công đoạn cuối chuyển vào **Thành phẩm**. NG chuyển vào kho NG của công đoạn mình.

App kiểm tra tồn ở server: hai người bấm cùng lúc cũng không làm tồn bị âm.
Danh sách tự làm mới mỗi 5 giây, LOT đang chọn được giữ nguyên.

### 5.3 Lịch Sử Giao
Các lần giao của line mình.

---

## 6. Những gì đã làm (tóm tắt theo nhóm)

| Nhóm | Nội dung |
|---|---|
| Dọn repo | `.gitignore`, chuyển file cũ vào `archive/`, tách `worker/worker.js`, README, ROADMAP, CLAUDE.md |
| Bảo mật | Chống XSS (`esc()`), mật khẩu băm PBKDF2, token HMAC có hạn, phân quyền ADMIN/LEADER ở server, khóa đăng nhập sai, CORS, đổi mật khẩu cần mật khẩu cũ |
| Toàn vẹn dữ liệu | Giao hàng atomic (không âm tồn), index, kiểm lộ trình khi lưu, chống trùng PO, sửa/xóa LOT có điều kiện + ghi log |
| Công đoạn | Thêm MNC, NC (nhóm cùng màu với line), sắp thứ tự, chữ Bari |
| Mã hàng | Thời gian công đoạn (phút/pcs, tính theo giờ) |
| Báo cáo | Ẩn cột trống, sắp LOT đúng, giới hạn 100 dòng, cột Tổng giờ, ô tìm mã hàng mới |
| NG | Gợi ý công đoạn REWORK |
| Admin | Xem màn hình line (chỉ xem) |
| Điện thoại | Menu kéo bên hông, ẩn bớt lọc/KPI, bảng dính tiêu đề, cho xoay ngang, toast thay `alert` |
| Tên app | SX-BIC (tiêu đề, PWA) |
| ERP | Đã có bản thiết kế [docs/ERP_PLAN.md](ERP_PLAN.md), **đang tạm dừng** |

---

## 7. Giới hạn và rủi ro đã biết

1. **Chưa thử trên Cloudflare thật** (xem 1.3).
2. Tài khoản chưa đăng nhập lần nào sau khi deploy vẫn lưu mật khẩu dạng chữ thường trong D1 cho tới lần đăng nhập đầu.
3. `backup.sql` từng nằm trong lịch sử git. Nếu repo từng công khai thì nên đổi mật khẩu các tài khoản.
4. Danh sách công đoạn mặc định đang có ở 3 nơi (worker, script.js, mock.js); sửa một nơi phải nhớ sửa cả ba.
5. Dữ liệu D1 còn vài chỗ chưa chuẩn (`product_id` dạng chữ, NG nhận biết bằng đuôi `_NG`). Chạy được, nhưng nên chuẩn hóa trước khi làm ERP.
6. Leader tự làm mới mỗi 5 giây kể cả khi tab đang ẩn, tốn lượt gọi API.
7. Chưa có chế độ dùng khi mất mạng.
8. `script.js` khoảng 3.000 dòng, một file. Giữ như vậy theo yêu cầu, nhưng mỗi lần sửa cần cẩn thận và thử kỹ.

---

## 8. Hướng phát triển

Đề xuất theo thứ tự ưu tiên. Mỗi mục làm riêng, thử xong mới làm mục sau.

### Bước A: Ổn định (nên làm trước, không thêm tính năng)
1. Commit mốc an toàn.
2. Backup D1 → deploy worker + front-end → thử đủ các việc ở mục 9.
3. Sửa lỗi phát sinh từ lần deploy đó. Commit.

### Bước B: Hoàn thiện nền (ROADMAP giai đoạn 2 và 4 còn lại)
- Một nguồn danh sách công đoạn duy nhất (worker), front-end đọc từ API.
- Ngừng làm mới khi tab ẩn; banner "Mất kết nối"; nhãn "Cập nhật lúc HH:MM".
- Chuẩn hóa dữ liệu D1 (`product_id` số, cờ NG) bằng migration có backup.

### Bước C: Tính năng cho xưởng (ROADMAP giai đoạn 5)
| Tính năng | Lợi ích |
|---|---|
| Trang quản lý tài khoản (tạo, reset mật khẩu, khóa, gán line) | Không phải sửa D1 bằng tay |
| Danh mục mã lỗi NG + biểu đồ Pareto | Biết lỗi nào nhiều nhất ở công đoạn nào |
| KPI yield, cảnh báo LOT nằm lâu | Phát hiện ùn tắc sớm |
| Quét QR mã LOT bằng camera | Leader chọn LOT nhanh, không nhầm |
| In tem/phiếu LOT có QR | Đi kèm quét QR |
| Hoàn tác giao dịch (admin, có ghi log) | Sửa khi leader bấm nhầm |
| Thông báo Telegram/email khi NG vượt ngưỡng | Không cần mở app vẫn biết |
| Kế hoạch theo giờ chuẩn: so giờ cần làm với giờ có sẵn của line | Tận dụng dữ liệu thời gian công đoạn vừa thêm |

### Bước D: ERP (đang tạm dừng)
Máy móc, kho nguyên vật liệu, BOM, kế hoạch sản xuất. Thiết kế đầy đủ ở [docs/ERP_PLAN.md](ERP_PLAN.md). Chỉ nên bắt đầu khi Bước A và B đã xong.

---

## 9. Danh sách thử sau mỗi lần deploy

- [ ] Đăng nhập ADMIN và một LEADER. Đăng nhập sai 5 lần thì bị khóa.
- [ ] Tạo mã hàng có lộ trình + thời gian; Sửa lại thấy đúng số phút.
- [ ] Cấp phát PO mới → ra đúng các LOT. Cấp lại cùng PO → bị chặn.
- [ ] Sửa Tổng SL và Xóa một LOT chưa sản xuất.
- [ ] Leader giao PASS + NG; tồn ở công đoạn sau tăng đúng.
- [ ] Admin REWORK hàng NG về công đoạn trước; SCRAP một ít.
- [ ] Báo cáo: số khớp, cột Tổng giờ có số, xuất Excel mở được.
- [ ] Lịch sử ghi đủ các thao tác trên.
- [ ] Admin "Xem màn hình Line" không giao hàng được.
- [ ] Điện thoại: mở menu kéo, xoay ngang, cuộn bảng báo cáo.

---

## 10. Quy tắc làm việc để không mất kiểm soát

1. **Một yêu cầu = một lần sửa = một commit.** Không gom nhiều thứ.
2. Trước khi sửa: nói rõ sửa file nào, có đụng worker/D1 không.
3. Đụng **worker hoặc D1** thì luôn backup D1 trước và deploy riêng, không đi chung đợt với front-end trừ khi bắt buộc.
4. Thử bằng `?mock` trước, rồi mới thử trên Cloudflare.
5. Cập nhật file này và [ROADMAP.md](../ROADMAP.md) khi xong một mục.
