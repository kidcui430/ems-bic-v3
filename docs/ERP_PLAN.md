# ERP PLAN: EMS BIC v3 → ERP sản xuất (máy móc, kho NVL, BOM, kế hoạch)

> File này là nguồn sự thật cho phần ERP. Phiên chat mới **đọc file này trước** (sau `CLAUDE.md`),
> làm giai đoạn đầu tiên chưa tick ở mục 7, xong thì tick và ghi vào mục 9.

## 0. Quyết định đã chốt (2026-11-20)
- **Cùng D1, thêm bảng mới.** Không tạo database thứ hai, để việc cấp LOT và tạo phiếu NVL chạy chung một transaction.
- **Máy gán ở cả hai bước:** kế hoạch gán trước, leader được đổi sang máy thực tế khi chuyển lot.
- **Xuất NVL bằng phiếu theo BOM:** phiếu được tạo khi cấp LOT. Kho chỉ bị trừ khi thủ kho xác nhận số thực xuất.
- **Thêm vai trò KHO** (thủ kho NVL).
- **Giữ nguyên** công đoạn, line, luồng chuyển lot, `Inventory`, `Transactions_Log` và các API đang chạy.

## 1. Nguyên tắc
- **Chỉ thêm, không phá cái cũ.** Bảng cũ giữ nguyên. Thay đổi duy nhất trên bảng cũ là thêm cột `Transactions_Log.machine_id`.
- **Worker vẫn là một file** (`worker/worker.js`) để dán được vào Cloudflare Dashboard.
  - Bảng mới tạo bằng `CREATE TABLE IF NOT EXISTS` trong `ensureSchema`, tự chạy, không cần chạy SQL tay.
  - Lưu bản SQL vào `worker/migrations/002_erp.sql` để tham khảo.
  - Cột mới thêm bằng `ALTER TABLE`, chỉ chạy khi `PRAGMA table_info(Transactions_Log)` báo chưa có cột đó.
- **Giao diện ERP nằm ở trang riêng** `erp.html` + `erp.js`, dùng chung `style.css`. Như vậy `script.js` (khoảng 2.700 dòng) không phình thêm.
  - Đăng nhập dùng chung token trong `localStorage["ems_user"]`.
  - `erp.js` mang bản thu gọn của `esc`, `apiFetch`, `notify`, `confirmDialog`, copy từ `script.js`.
  - Admin có nút "ERP" trong menu bên hông để sang trang này.
- **Mọi thay đổi tồn kho (WIP hoặc NVL) đều ghi sổ cái và chạy atomic**, theo mẫu đang dùng ở `/api/move` và `/api/ng/resolve`:
  1. Viết `INSERT ... SELECT ... WHERE tồn >= ?`.
  2. Gom các câu vào `env.DB.batch`.
  3. Kiểm `meta.changes`; nếu bằng 0 thì trả HTTP 409.
- **Kiểu số lượng:** sản phẩm dùng `INTEGER`, NVL dùng `REAL` (kg, m...).
- **Chuỗi hiển thị bằng tiếng Việt.** Dữ liệu động phải qua `esc()` trước khi gán vào `innerHTML`.

## 2. Vai trò
| Vai trò | Quyền |
|---|---|
| ADMIN | Tất cả: danh mục máy, NVL, BOM, kế hoạch, duyệt phiếu |
| LEADER | Như cũ. Thêm: xem máy của công đoạn mình, chọn máy khi chuyển, xem kế hoạch của line mình |
| KHO (mới, `line_id = 'KHO'`) | Nhập kho NVL, xác nhận phiếu xuất, kiểm kê. Không vào WIP và không chuyển lot |

Trong `isAllowed` của worker, thêm nhánh KHO chỉ cho gọi `/api/erp/materials*`, `/api/erp/stock*`, `/api/erp/requests*`.
Thêm user KHO bằng SQL trong D1 Console, cho tới khi có trang quản lý user (ROADMAP 5.1).
Mật khẩu mặc định `000` sẽ bị ép đổi khi đăng nhập lần đầu.

## 3. Database mới (cùng D1)
```sql
-- Máy móc
CREATE TABLE IF NOT EXISTS Machines (
  id TEXT PRIMARY KEY,                     -- VD: NC1-M01
  machine_name TEXT NOT NULL,
  stage_id TEXT NOT NULL,                  -- = Stages_Config.id
  status TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | MAINTENANCE | BROKEN | INACTIVE
  capacity_per_shift INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Machine_Events (      -- lịch sử hỏng / bảo trì
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT NOT NULL,
  event_type TEXT NOT NULL,                -- DOWN | UP | MAINTENANCE
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  user_id INTEGER,
  note TEXT
);

-- Nguyên vật liệu
CREATE TABLE IF NOT EXISTS Materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_code TEXT NOT NULL UNIQUE,
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL,                      -- kg, m, cái...
  spec TEXT,
  min_stock REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS Material_Lots (       -- tồn theo lô NVL (truy vết heat/lô nhà cung cấp)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  lot_code TEXT NOT NULL,
  supplier TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  qty_received REAL NOT NULL,
  qty_on_hand REAL NOT NULL,
  UNIQUE(material_id, lot_code)
);
CREATE TABLE IF NOT EXISTS Material_Transactions ( -- sổ cái NVL
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  material_id INTEGER NOT NULL,
  material_lot_id INTEGER,
  type TEXT NOT NULL,                      -- RECEIPT | ISSUE | RETURN | ADJUST
  qty REAL NOT NULL,                       -- + nhập, - xuất
  ref_type TEXT,                           -- REQUEST | LOT | ...
  ref_id TEXT,                             -- VD: 12 hoặc PO261119-01
  user_id INTEGER,
  note TEXT
);

-- Định mức BOM (theo mã hàng hiện có)
CREATE TABLE IF NOT EXISTS Bom_Items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,             -- = Products.id
  material_id INTEGER NOT NULL,
  qty_per_unit REAL NOT NULL,              -- NVL cho 1 sản phẩm
  scrap_rate REAL DEFAULT 0,               -- hao hụt, VD 0.03 = 3%
  stage_id TEXT,                           -- công đoạn dùng NVL (tùy chọn)
  UNIQUE(product_id, material_id)
);

-- Phiếu xuất NVL cho sản xuất
CREATE TABLE IF NOT EXISTS Material_Requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no TEXT NOT NULL UNIQUE,         -- VD: XK261120-001
  po_number TEXT NOT NULL,                 -- = Production_Orders.po_number
  status TEXT NOT NULL DEFAULT 'REQUESTED',-- REQUESTED | PARTIAL | ISSUED | CANCELLED
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  issued_by INTEGER,
  issued_at DATETIME,
  note TEXT
);
CREATE TABLE IF NOT EXISTS Material_Request_Lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  qty_required REAL NOT NULL,              -- = lot_qty * qty_per_unit * (1 + scrap_rate)
  qty_issued REAL NOT NULL DEFAULT 0
);

-- Kế hoạch sản xuất (LOT x công đoạn x máy x ngày/ca)
CREATE TABLE IF NOT EXISTS Production_Plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_date TEXT NOT NULL,                 -- YYYY-MM-DD
  shift TEXT DEFAULT 'CA1',                -- CA1 | CA2 | CA3
  po_number TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  machine_id TEXT,
  planned_qty INTEGER NOT NULL,
  done_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PLANNED',  -- PLANNED | IN_PROGRESS | DONE | CANCELLED
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

-- Thay đổi duy nhất trên bảng cũ (thêm cột, dữ liệu cũ = NULL).
-- Worker chỉ chạy khi PRAGMA table_info chưa có cột này.
ALTER TABLE Transactions_Log ADD COLUMN machine_id TEXT;

CREATE INDEX IF NOT EXISTS idx_machines_stage ON Machines(stage_id);
CREATE INDEX IF NOT EXISTS idx_matlots_material ON Material_Lots(material_id);
CREATE INDEX IF NOT EXISTS idx_mattx_material_ts ON Material_Transactions(material_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_bom_product ON Bom_Items(product_id);
CREATE INDEX IF NOT EXISTS idx_matreq_po ON Material_Requests(po_number);
CREATE INDEX IF NOT EXISTS idx_plans_date ON Production_Plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_plans_po_stage ON Production_Plans(po_number, stage_id);
```

Bảng cũ để tham khảo (không sửa):
- `Products(id, product_code, product_name, routing_map JSON)`
- `Production_Orders(id, po_number UNIQUE, product_id, month, total_qty, status, created_at)`
- `Inventory(product_id TEXT, lot_number, stage_id, quantity, UNIQUE(product_id, lot_number, stage_id))`
- `Transactions_Log(id, timestamp, user_id, po_id, from_stage, to_stage, qty, type, note)`
- `Stages_Config(id, stage_name, line_id, sort_order)`
- `Users(id, username, password_hash, role, line_id, full_name)`
- `Login_Attempts`

## 4. Luồng nghiệp vụ
1. **Khai báo danh mục.** Admin khai báo:
   - các máy cho từng công đoạn,
   - danh mục NVL,
   - BOM cho từng mã hàng.
2. **Nhập kho.**
   - KHO tạo phiếu nhập gồm mã NVL, số lô NVL, nhà cung cấp, số lượng.
   - Hệ thống tạo `Material_Lots` và ghi `RECEIPT`.
3. **Cấp LOT.** Dùng `/api/po/create` có sẵn, thêm logic:
   - Nếu mã hàng có BOM: tạo `Material_Requests` và các dòng phiếu trong **cùng batch** với lệnh tạo LOT.
   - Nếu tồn NVL không đủ: chỉ **cảnh báo**, không chặn tạo LOT.
   - Nếu mã hàng chưa có BOM: chạy như cũ.
4. **Xuất kho.**
   - KHO mở phiếu, chọn lô NVL (gợi ý FIFO theo `received_at`) và nhập số thực xuất.
   - Hệ thống trừ `qty_on_hand` atomic (`WHERE qty_on_hand >= ?`) và ghi `ISSUE`.
   - Xuất thiếu thì phiếu ở trạng thái PARTIAL. Xuất đủ thì ISSUED.
   - Cho phép xuất lệch định mức; phần lệch được ghi lại.
5. **Lập kế hoạch.**
   - Bảng kế hoạch: hàng là máy (nhóm theo line rồi công đoạn, màu theo `LINE_COLORS`), cột là ngày.
   - Gán LOT vào một ô (máy, ngày, ca, số lượng) thì tạo `Production_Plans`.
   - Cảnh báo khi vượt `capacity_per_shift` hoặc khi máy đang MAINTENANCE/BROKEN.
6. **Leader chuyển lot** qua `/api/move`:
   - Ô chọn **máy** liệt kê các máy của công đoạn hiện tại. Mặc định là máy trong kế hoạch của LOT ở công đoạn đó; leader được đổi.
   - Ghi `machine_id` vào `Transactions_Log`.
   - Cộng `done_qty` vào dòng kế hoạch khớp, rồi đổi trạng thái sang IN_PROGRESS hoặc DONE.
   - Không chọn máy vẫn chuyển được, để công đoạn chưa khai báo máy không bị chặn.
7. **Trả NVL thừa.** KHO ghi `RETURN` (số dương), số này cộng lại vào lô NVL.
8. **Kiểm kê.** KHO ghi `ADJUST`, bắt buộc nhập lý do.

## 5. API mới (tiền tố `/api/erp/`)
| Endpoint | Ai gọi | Việc |
|---|---|---|
| `GET/POST/PUT/DELETE /machines` | ADMIN (LEADER: GET theo `stage_id`) | Danh mục máy |
| `POST /machines/:id/event` | ADMIN, LEADER | Báo hỏng / sửa xong / bảo trì |
| `GET/POST/PUT /materials` | ADMIN, KHO | Danh mục NVL |
| `POST /stock/receipt`, `GET /stock`, `GET /stock/ledger` | KHO, ADMIN | Nhập kho, xem tồn, xem sổ cái |
| `POST /stock/adjust`, `POST /stock/return` | KHO | Kiểm kê, trả NVL |
| `GET/PUT /bom/:product_id` | ADMIN | Xem / lưu BOM của mã hàng (lưu cả danh sách) |
| `GET /bom/:product_id/calc?qty=` | ADMIN | Tính NVL cần và so với tồn |
| `GET /requests`, `GET /requests/:id`, `POST /requests/:id/issue` | KHO, ADMIN | Phiếu xuất, xác nhận xuất |
| `GET/POST/PUT/DELETE /plans` | ADMIN (LEADER: GET line mình) | Kế hoạch theo khoảng ngày |
| Sửa `/api/move` | LEADER | Nhận thêm `machine_id` (tùy chọn) |
| Sửa `/api/po/create` | ADMIN | Tự tạo phiếu NVL theo BOM |

## 6. Giao diện
- **`erp.html`**: menu bên hông (trên điện thoại là ngăn kéo, giống admin) gồm các mục **Máy móc · NVL & Tồn kho · Nhập kho · Phiếu xuất · BOM · Kế hoạch**.
- **KHO** đăng nhập thì vào thẳng `erp.html`, chỉ thấy NVL, Nhập kho, Phiếu xuất.
- **Màn leader** (`script.js`): thêm ô chọn "Máy" trong tab Thao Tác và cột "Máy" trong lịch sử.
- **Báo cáo tiến độ**: tooltip của ô OK hiện thêm tên máy.
- **`mock.js`** phải có dữ liệu giả cho mọi API mới, để chạy được `erp.html?mock`.

## 7. Giai đoạn
Mỗi giai đoạn làm đủ 4 bước: code → kiểm bằng `?mock` → người dùng dán worker và upload Pages → tick.
- [x] **E0** Tạo tài liệu này, thêm trỏ trong `CLAUDE.md` và `ROADMAP.md`.
- [ ] **E1** Tạo bảng `Machines` + `Machine_Events` (trong `ensureSchema` và `002_erp.sql`). Làm API máy. Làm khung `erp.html` + `erp.js` với tab Máy móc. Thêm máy giả vào `mock.js`. Thêm nút "ERP" ở sidebar admin.
- [ ] **E2** Thêm cột `Transactions_Log.machine_id`. Leader chọn máy khi chuyển. Thêm cột "Máy" trong lịch sử.
- [ ] **E3** Thêm vai trò KHO. Tạo `Materials`, `Material_Lots`, `Material_Transactions`. Làm nhập kho, xem tồn, sổ cái, cảnh báo khi dưới `min_stock`.
- [ ] **E4** Tạo `Bom_Items`. Làm màn BOM theo mã hàng. Tính nhu cầu NVL trong phần xem trước khi cấp LOT.
- [ ] **E5** Tạo `Material_Requests` + `Material_Request_Lines`. Tự tạo phiếu khi cấp LOT. KHO xác nhận xuất theo lô NVL (FIFO).
- [ ] **E6** Tạo `Production_Plans`. Làm bảng kế hoạch máy × ngày. Máy mặc định cho leader lấy từ kế hoạch. Thêm so sánh kế hoạch và thực tế.
- [ ] **E7** Báo cáo:
  - NVL thực xuất so với định mức BOM theo LOT,
  - sản lượng theo máy theo ngày,
  - NVL sắp hết,
  - truy vết lô NVL → LOT sản xuất.

## 8. Hướng dẫn cho phiên chat mới
1. Đọc `CLAUDE.md`, rồi đọc file này. **Không đọc lại toàn bộ `script.js` / `worker.js`**: dùng Grep tìm đúng hàm cần sửa rồi chỉ đọc đoạn đó.
2. Mỗi phiên làm **một giai đoạn**: chọn giai đoạn đầu tiên chưa tick. Kết thúc phiên bằng các bước:
   1. Chạy `node --check worker/worker.js script.js erp.js`.
   2. Thử bằng `index.html?mock` / `erp.html?mock`.
   3. Hướng dẫn người dùng dán worker mới và upload file lên Pages.
   4. Tick ở mục 7, ghi 1–3 dòng vào mục 9.
3. Mẫu cần dùng lại trong `worker/worker.js`:
   - `ensureSchema`
   - `isAllowed`
   - `jsonResponse`
   - `getOrInitStages`
   - batch atomic ở `/api/move`
   - `verifyToken` (payload: `uid`, `username`, `role`, `line`)
4. Mẫu cần dùng lại trong `script.js`:
   - `esc`
   - `apiFetch`
   - `notify`
   - `confirmDialog`
   - `setupCombo` (ô gợi ý thay datalist)
   - `openAdminMenu` / `closeAdminMenu` (ngăn kéo)
   - `LINE_COLORS`
   - `compareLotRows`
5. Người dùng chỉ commit git một lần khi xong việc lớn. Không tự commit.
6. Người dùng không dùng wrangler. Mọi SQL chạy tay đều qua D1 Console.

## 9. Nhật ký
- 2026-11-20: Tạo tài liệu (E0). Đã chốt 4 quyết định ở mục 0.
- 2026-11-20: **Tạm dừng ERP** theo yêu cầu người dùng, quay lại nâng cấp EMS. Chỉ làm tiếp khi người dùng yêu cầu.
