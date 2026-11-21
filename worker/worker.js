// ====================================================
// CẤU HÌNH TRÊN CLOUDFLARE DASHBOARD (Settings -> Variables and Secrets):
//   AUTH_SECRET     (bắt buộc, kiểu Secret): chuỗi ngẫu nhiên dài >= 32 ký tự, dùng ký token đăng nhập.
//   ALLOWED_ORIGIN  (tùy chọn): ví dụ https://ems-bic.pages.dev. Để trống = cho mọi domain gọi API.
// ====================================================
let corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function applyCors(env) {
  corsHeaders = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    Vary: "Origin",
  };
}

const TOKEN_TTL_SECONDS = 12 * 60 * 60; // token sống 12 giờ
const PBKDF2_ITERATIONS = 100000; // tối đa Workers cho phép
const MAX_LOGIN_FAILS = 5;
const LOCK_SECONDS = 5 * 60;
const DEFAULT_PASSWORDS = ["000", "0000"]; // mật khẩu mặc định -> bắt buộc đổi

// Danh sách công đoạn chuẩn (dùng để khởi tạo và đồng bộ cả Lines, Stages và Stages_Config)
const DEFAULT_STAGES = [
  { id: "CAT", line_id: "CUTTING", stage_name: "Cắt", sort_order: 1 },
  { id: "NHIET_LUYEN", line_id: "CUTTING", stage_name: "Nhiệt luyện", sort_order: 2 },
  { id: "DO_CUNG", line_id: "CUTTING", stage_name: "Độ cứng", sort_order: 3 },
  { id: "NC1", line_id: "NC", stage_name: "NC1", sort_order: 4 },
  { id: "NC2", line_id: "NC", stage_name: "NC2", sort_order: 5 },
  { id: "NC3", line_id: "NC", stage_name: "NC3", sort_order: 6 },
  { id: "MNC1", line_id: "MNC", stage_name: "MNC1", sort_order: 7 },
  { id: "MNC2", line_id: "MNC", stage_name: "MNC2", sort_order: 8 },
  { id: "MNC3", line_id: "MNC", stage_name: "MNC3", sort_order: 9 },
  { id: "GS", line_id: "GS_GV", stage_name: "GS", sort_order: 10 },
  { id: "GV", line_id: "GS_GV", stage_name: "GV", sort_order: 11 },
  { id: "GP", line_id: "GP_GE_GI", stage_name: "GP", sort_order: 12 },
  { id: "GE", line_id: "GP_GE_GI", stage_name: "GE", sort_order: 13 },
  { id: "GI", line_id: "GP_GE_GI", stage_name: "GI", sort_order: 14 },
  { id: "BARRY", line_id: "BARRY", stage_name: "Bavia (Barry)", sort_order: 15 },
  { id: "XUAT_GCN", line_id: "ASSY", stage_name: "Đi GCN", sort_order: 16 },
  { id: "NHAN_GCN", line_id: "ASSY", stage_name: "Nhận GCN", sort_order: 17 },
  { id: "LAP_RAP", line_id: "ASSY", stage_name: "Lắp ráp", sort_order: 18 },
  { id: "KIEM_TRA", line_id: "KENSA", stage_name: "Kiểm tra", sort_order: 19 },
  { id: "DONG_THUNG", line_id: "ASSY", stage_name: "Đóng thùng", sort_order: 20 },
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json;charset=utf-8",
    },
  });
}

// ====================================================
// XÁC THỰC: băm mật khẩu (PBKDF2), token ký HMAC, giới hạn đăng nhập sai
// ====================================================
const encoder = new TextEncoder();

function bytesToB64(bytes) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
function toB64Url(b64) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
}
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

// Định dạng lưu trong cột password_hash: pbkdf2$<số vòng>$<salt b64>$<hash b64>
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

function isHashed(stored) {
  return String(stored || "").startsWith("pbkdf2$");
}

async function verifyPassword(password, stored) {
  stored = String(stored || "");
  if (!isHashed(stored)) {
    // Mật khẩu cũ còn ở dạng chữ thường: so sánh rồi sẽ được băm lại sau khi đăng nhập đúng
    return stored !== "" && safeEqual(password, stored);
  }
  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const hash = await pbkdf2(password, b64ToBytes(saltB64), Number(iterStr));
  return safeEqual(bytesToB64(hash), hashB64);
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toB64Url(bytesToB64(new Uint8Array(sig)));
}

async function signToken(payload, secret) {
  const body = toB64Url(btoa(JSON.stringify(payload)));
  return `${body}.${await hmacSign(body, secret)}`;
}

async function verifyToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = await hmacSign(parts[0], secret);
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const payload = JSON.parse(atob(fromB64Url(parts[0])));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Token chứa: uid, username, role, line, mcp (true = đang phải đổi mật khẩu mặc định), exp
async function issueToken(user, mustChange, env) {
  return signToken(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
      line: String(user.line_id || "").toUpperCase(),
      mcp: Boolean(mustChange),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    },
    env.AUTH_SECRET,
  );
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  return verifyToken(token, env.AUTH_SECRET);
}

// Phân quyền theo vai trò (kiểm ở server, không tin trình duyệt)
function isAllowed(auth, method, path) {
  if (path === "/api/change-password") return true;
  if (auth.mcp) return false; // chưa đổi mật khẩu mặc định thì không dùng được API khác
  if (auth.role === "ADMIN") return true;
  if (auth.role === "LEADER") {
    if (method === "POST" && path === "/api/move") return true;
    return (
      method === "GET" &&
      ["/api/stages", "/api/products", "/api/leader/pending", "/api/history"].includes(path)
    );
  }
  return false;
}

// Chạy đúng 1 lần cho mỗi instance của Worker (không chạy lại ở mỗi request).
// Chỉ THÊM bảng/index nếu chưa có (IF NOT EXISTS), không đổi hay xóa dữ liệu hiện có.
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS Login_Attempts (
       username TEXT PRIMARY KEY,
       fails INTEGER DEFAULT 0,
       locked_until INTEGER DEFAULT 0
     )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS Stages_Config (
       id TEXT PRIMARY KEY,
       stage_name TEXT NOT NULL,
       line_id TEXT NOT NULL,
       sort_order INTEGER DEFAULT 0
     )`,
  ).run();
  // Index giúp tra cứu theo LOT/công đoạn và sắp xếp lịch sử nhanh hơn
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_inventory_lot_stage ON Inventory (lot_number, stage_id)`,
    `CREATE INDEX IF NOT EXISTS idx_txlog_timestamp ON Transactions_Log (timestamp)`,
  ];
  for (const sql of indexes) {
    try {
      await env.DB.prepare(sql).run();
    } catch (e) {
      console.error("Không tạo được index:", sql, e);
    }
  }
  schemaReady = true;
}

// Đọc lộ trình của mã hàng. Trả về mảng stage_id (viết hoa) hoặc null nếu dữ liệu hỏng/rỗng.
function parseRouting(routingMap) {
  try {
    const arr = typeof routingMap === "string" ? JSON.parse(routingMap) : routingMap;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ids = arr.map((s) => String((s && s.stage_id) || "").trim().toUpperCase());
    return ids.every(Boolean) ? ids : null;
  } catch (e) {
    return null;
  }
}

// Kiểm tra lộ trình trước khi lưu mã hàng: phải là mảng hợp lệ và các công đoạn phải tồn tại.
// Lộ trình rỗng vẫn được lưu (khai báo sau), nhưng chưa tạo LOT được cho tới khi có lộ trình.
async function validateRoutingForSave(env, routingStr) {
  let arr;
  try {
    arr = JSON.parse(routingStr);
  } catch (e) {
    return "Lộ trình không hợp lệ (sai định dạng)!";
  }
  if (!Array.isArray(arr)) return "Lộ trình không hợp lệ (phải là danh sách công đoạn)!";
  if (arr.length === 0) return null;
  const route = parseRouting(arr);
  if (!route) return "Lộ trình có bước thiếu mã công đoạn!";
  const known = new Set((await getOrInitStages(env)).map((st) => String(st.id).toUpperCase()));
  const unknown = route.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return `Lộ trình có công đoạn không tồn tại: ${[...new Set(unknown)].join(", ")}`;
  }
  return null;
}

// Các LOT đã cấp với mã PO này (PO1610 hoặc PO1610-xx), dùng để chống cấp trùng mã PO
async function findLotsByPrefix(env, prefix) {
  const like = prefix.replace(/[%_\\]/g, (c) => "\\" + c) + "-%";
  const { results } = await env.DB.prepare(
    `SELECT po.po_number, COALESCE(p.product_code, po.product_id) AS product_code
     FROM Production_Orders po
     LEFT JOIN Products p ON CAST(p.id AS TEXT) = CAST(po.product_id AS TEXT)
     WHERE UPPER(po.po_number) = ? OR UPPER(po.po_number) LIKE ? ESCAPE '\\'
     UNION
     SELECT DISTINCT i.lot_number, COALESCE(p.product_code, i.product_id)
     FROM Inventory i
     LEFT JOIN Products p ON CAST(p.id AS TEXT) = CAST(i.product_id AS TEXT)
     WHERE UPPER(i.lot_number) = ? OR UPPER(i.lot_number) LIKE ? ESCAPE '\\'`,
  )
    .bind(prefix, like, prefix, like)
    .all();
  return results || [];
}

// LOT "chưa đụng tới": toàn bộ hàng còn nguyên ở 1 công đoạn (công đoạn đầu), đúng bằng Tổng SL,
// và chưa có giao dịch chuyển/NG nào (bỏ qua giao dịch ADJUST do sửa LOT).
async function getLotUntouchedState(env, order) {
  const lot = String(order.po_number).toUpperCase();
  const { results: inv } = await env.DB.prepare(
    `SELECT stage_id, quantity FROM Inventory WHERE UPPER(lot_number) = ? AND quantity > 0`,
  ).bind(lot).all();
  const moved = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM Transactions_Log
     WHERE UPPER(po_id) = ? AND COALESCE(type, '') NOT IN ('ADJUST')`,
  ).bind(lot).first();
  const rows = inv || [];
  const untouched =
    rows.length === 1 &&
    Number(rows[0].quantity) === Number(order.total_qty) &&
    !String(rows[0].stage_id).toUpperCase().endsWith("_NG") &&
    Number(moved?.cnt || 0) === 0;
  return { untouched, stage: rows[0]?.stage_id || "" };
}

// Điều kiện "tồn tại trạm nguồn còn đủ số lượng", dùng chung cho các câu lệnh trong 1 batch
const STOCK_OK_SQL = `(SELECT COALESCE(SUM(quantity), 0) FROM Inventory
  WHERE lot_number = ? AND TRIM(UPPER(stage_id)) = ?) >= ?`;

// Tự động đồng bộ bảng Lines, Stages và Stages_Config trong D1 để không bao giờ bị lỗi khóa ngoại (Foreign Key)
let stagesSeeded = false;
async function getOrInitStages(env) {
  await ensureSchema(env);

  // Khởi tạo công đoạn mặc định + đồng bộ Lines/Stages: chỉ làm 1 lần mỗi instance
  if (!stagesSeeded) {
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM Stages_Config`,
    ).first();

    if (!countRow || Number(countRow.cnt) === 0) {
      const insertStmts = DEFAULT_STAGES.map((s) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO Stages_Config (id, stage_name, line_id, sort_order) VALUES (?, ?, ?, ?)`,
        ).bind(s.id, s.stage_name, s.line_id, s.sort_order),
      );
      await env.DB.batch(insertStmts);
    }

    // Đảm bảo bảng Lines và bảng Stages gốc trong D1 có đủ Line BARRY và các công đoạn mới.
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO Lines (line_id, line_name) VALUES ('BARRY', 'Line Barry')`,
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO Stages (stage_id, line_id, stage_name)
           SELECT id, line_id, stage_name FROM Stages_Config`,
        ),
      ]);
    } catch (e) {
      console.error("Đồng bộ Lines/Stages thất bại:", e);
    }
    stagesSeeded = true;
  }

  const { results } = await env.DB.prepare(
    `SELECT id, stage_name, line_id, sort_order FROM Stages_Config ORDER BY sort_order ASC, rowid ASC`,
  ).all();

  return results && results.length > 0 ? results : DEFAULT_STAGES;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    applyCors(env);
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (!env.AUTH_SECRET || String(env.AUTH_SECRET).length < 16) {
        return jsonResponse(
          {
            error:
              "Máy chủ chưa cấu hình AUTH_SECRET (Settings -> Variables and Secrets, tối thiểu 16 ký tự).",
          },
          500,
        );
      }

      await ensureSchema(env);

      // ====================================================
      // 1. API ĐĂNG NHẬP & ĐỔI MẬT KHẨU
      // ====================================================
      if (path === "/api/login" && method === "POST") {
        const body = await request.json();
        const username = String(body.username || "").trim().toUpperCase();
        const password = String(body.password || "");
        const now = Math.floor(Date.now() / 1000);

        const attempt = await env.DB.prepare(
          `SELECT fails, locked_until FROM Login_Attempts WHERE username = ?`,
        )
          .bind(username)
          .first();
        if (attempt && Number(attempt.locked_until) > now) {
          const wait = Math.ceil((Number(attempt.locked_until) - now) / 60);
          return jsonResponse(
            { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${wait} phút.` },
            429,
          );
        }

        const row = username
          ? await env.DB.prepare(
              `SELECT id, username, full_name, role, line_id, password_hash
               FROM Users WHERE UPPER(username) = ?`,
            )
              .bind(username)
              .first()
          : null;

        const ok = row ? await verifyPassword(password, row.password_hash) : false;
        if (!ok) {
          const fails = (attempt ? Number(attempt.fails) : 0) + 1;
          const lockedUntil = fails >= MAX_LOGIN_FAILS ? now + LOCK_SECONDS : 0;
          await env.DB.prepare(
            `INSERT INTO Login_Attempts (username, fails, locked_until) VALUES (?, ?, ?)
             ON CONFLICT(username) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`,
          )
            .bind(username, lockedUntil ? 0 : fails, lockedUntil)
            .run();
          return jsonResponse({ error: "Sai tài khoản hoặc mật khẩu!" }, 401);
        }

        await env.DB.prepare(`DELETE FROM Login_Attempts WHERE username = ?`)
          .bind(username)
          .run();

        // Băm lại mật khẩu cũ (chữ thường) ngay lần đăng nhập đúng đầu tiên
        if (!isHashed(row.password_hash)) {
          await env.DB.prepare(`UPDATE Users SET password_hash = ? WHERE id = ?`)
            .bind(await hashPassword(password), row.id)
            .run();
        }

        const mustChange = DEFAULT_PASSWORDS.includes(password);
        return jsonResponse({
          success: true,
          user: {
            id: row.id,
            username: row.username,
            full_name: row.full_name,
            role: row.role,
            line_id: row.line_id,
            must_change_password: mustChange,
            token: await issueToken(row, mustChange, env),
          },
        });
      }

      // Mọi API còn lại bắt buộc có token hợp lệ + đúng quyền
      const auth = await authenticate(request, env);
      if (!auth) {
        return jsonResponse(
          { error: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại!" },
          401,
        );
      }
      if (!isAllowed(auth, method, path)) {
        return jsonResponse({ error: "Bạn không có quyền thực hiện thao tác này!" }, 403);
      }

      if (path === "/api/change-password" && method === "POST") {
        const body = await request.json();
        const oldPassword = String(body.old_password || "");
        const newPassword = String(body.new_password || "");
        if (newPassword.length < 4 || DEFAULT_PASSWORDS.includes(newPassword)) {
          return jsonResponse(
            { error: "Mật khẩu mới phải từ 4 ký tự và không được là mật khẩu mặc định!" },
            400,
          );
        }
        const me = await env.DB.prepare(
          `SELECT id, username, role, line_id, password_hash FROM Users WHERE id = ?`,
        )
          .bind(auth.uid)
          .first();
        if (!me || !(await verifyPassword(oldPassword, me.password_hash))) {
          return jsonResponse({ error: "Mật khẩu hiện tại không đúng!" }, 400);
        }
        await env.DB.prepare(`UPDATE Users SET password_hash = ? WHERE id = ?`)
          .bind(await hashPassword(newPassword), me.id)
          .run();
        return jsonResponse({ success: true, token: await issueToken(me, false, env) });
      }

      // ====================================================
      // 2. API LUÂN CHUYỂN CÔNG ĐOẠN (/api/move)
      // ====================================================
      if (path === "/api/move" && method === "POST") {
        const body = await request.json();
        const lot_num = String(body.lot_number || body.po_id || "").trim();
        const from_stage = String(body.from_stage || "")
          .trim()
          .toUpperCase();
        const qPass = Math.max(0, parseInt(body.qty_pass) || 0);
        const qNG = Math.max(0, parseInt(body.qty_ng) || 0);
        const totalMove = qPass + qNG;
        const userId = auth.uid; // lấy từ token, không tin dữ liệu client gửi lên
        const isOutsource = Boolean(body.is_outsource);

        if (!lot_num || !from_stage || totalMove <= 0) {
          return jsonResponse(
            { error: "Dữ liệu số lượng hoặc LOT không hợp lệ!" },
            400,
          );
        }

        // LEADER chỉ được thao tác trên công đoạn thuộc line của mình
        if (auth.role === "LEADER") {
          const allStages = await getOrInitStages(env);
          const st = allStages.find(
            (s) => String(s.id).toUpperCase() === from_stage,
          );
          const stageLine = st ? String(st.line_id).toUpperCase() : from_stage;
          if (stageLine !== auth.line) {
            return jsonResponse(
              { error: "Công đoạn này không thuộc line của bạn!" },
              403,
            );
          }
        }

        const currentInv = await env.DB.prepare(
          `SELECT product_id, quantity
           FROM Inventory
           WHERE lot_number = ? AND TRIM(UPPER(stage_id)) = ?
           LIMIT 1`,
        )
          .bind(lot_num, from_stage)
          .first();

        if (!currentInv || Number(currentInv.quantity) < totalMove) {
          const avail = currentInv ? Number(currentInv.quantity) : 0;
          return jsonResponse(
            {
              error: `Số lượng thao tác (${totalMove}) vượt quá tồn thực tế tại trạm (${avail})!`,
            },
            400,
          );
        }

        const final_p_id = currentInv.product_id || body.product_id;

        const product = await env.DB.prepare(
          `SELECT routing_map
           FROM Products
           WHERE CAST(id AS TEXT) = CAST(? AS TEXT) OR UPPER(product_code) = UPPER(?)`,
        )
          .bind(String(final_p_id || ""), String(final_p_id || ""))
          .first();

        if (!product) {
          return jsonResponse({ error: "Không tìm thấy mã sản phẩm!" }, 404);
        }

        let next_stage = "THANH_PHAM";
        if (isOutsource) {
          next_stage = "XUAT_GCN";
        } else {
          const route = parseRouting(product.routing_map);
          if (!route) {
            return jsonResponse(
              { error: "Lộ trình của mã hàng bị trống hoặc hỏng, vui lòng kiểm tra lại ở tab Mã Hàng!" },
              400,
            );
          }
          const currentIndex = route.indexOf(from_stage);
          if (currentIndex !== -1) {
            if (currentIndex < route.length - 1) next_stage = route[currentIndex + 1];
          } else if (!["XUAT_GCN", "NHAN_GCN"].includes(from_stage)) {
            // Công đoạn gia công ngoài được phép nằm ngoài lộ trình (giữ cách chạy cũ).
            // Mọi công đoạn khác mà không có trong lộ trình thì báo lỗi, không tự đẩy vào kho thành phẩm.
            return jsonResponse(
              { error: `Công đoạn ${from_stage} không nằm trong lộ trình của mã hàng này!` },
              400,
            );
          }
        }

        // Toàn bộ batch chạy trong 1 transaction. Mỗi câu lệnh đều kiểm lại "tồn còn đủ"
        // nên nếu 2 người thao tác cùng lúc, người đến sau bị từ chối chứ không làm tồn âm.
        const stockBinds = [lot_num, from_stage, totalMove];
        const stmts = [];

        if (qPass > 0) {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE ${STOCK_OK_SQL}
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(final_p_id, lot_num, next_stage, qPass, ...stockBinds),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               SELECT ?, ?, ?, ?, ?, 'PASS' WHERE ${STOCK_OK_SQL}`,
            ).bind(userId, lot_num, from_stage, next_stage, qPass, ...stockBinds),
          );
        }

        if (qNG > 0) {
          const ngStageId = `${from_stage}_NG`;
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE ${STOCK_OK_SQL}
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(final_p_id, lot_num, ngStageId, qNG, ...stockBinds),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               SELECT ?, ?, ?, 'KHO_NG', ?, 'NG' WHERE ${STOCK_OK_SQL}`,
            ).bind(userId, lot_num, from_stage, qNG, ...stockBinds),
          );
        }

        // Câu cuối: trừ tồn nguồn (chỉ khi còn đủ). Nếu 0 dòng bị đổi thì các câu trên cũng đã bị bỏ qua.
        stmts.push(
          env.DB.prepare(
            `UPDATE Inventory
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE lot_number = ? AND TRIM(UPPER(stage_id)) = ? AND quantity >= ?`,
          ).bind(totalMove, lot_num, from_stage, totalMove),
        );

        const batchRes = await env.DB.batch(stmts);
        const deducted = batchRes[batchRes.length - 1];
        if (!deducted || !deducted.meta || Number(deducted.meta.changes) < 1) {
          return jsonResponse(
            { error: "Tồn tại trạm vừa thay đổi (có người khác đang thao tác). Vui lòng tải lại danh sách và thử lại!" },
            409,
          );
        }
        return jsonResponse({ success: true, routed_to: next_stage });
      }

      // ====================================================
      // 3. API QUẢN LÝ MÃ HÀNG (GET / POST / PUT / DELETE)
      // ====================================================
      if (path === "/api/products" && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT * FROM Products ORDER BY id DESC`,
        ).all();
        return jsonResponse({ products: results || [] });
      }

      if (path === "/api/products" && method === "POST") {
        const body = await request.json();
        const code = String(body.product_code || "")
          .trim()
          .toUpperCase();
        const name = String(body.product_name || "").trim();
        const routingStr =
          typeof body.routing_map === "string"
            ? body.routing_map
            : JSON.stringify(body.routing_map || []);

        if (!code || !name) {
          return jsonResponse(
            { error: "Vui lòng nhập đầy đủ Mã hàng và Tên hàng!" },
            400,
          );
        }

        const routingErr = await validateRoutingForSave(env, routingStr);
        if (routingErr) return jsonResponse({ error: routingErr }, 400);

        const existing = await env.DB.prepare(
          `SELECT id FROM Products WHERE UPPER(product_code) = ?`,
        )
          .bind(code)
          .first();

        if (existing) {
          await env.DB.prepare(
            `UPDATE Products SET product_name = ?, routing_map = ? WHERE id = ?`,
          )
            .bind(name, routingStr, existing.id)
            .run();
          return jsonResponse({ success: true, updated: true });
        }

        await env.DB.prepare(
          `INSERT INTO Products (product_code, product_name, routing_map) VALUES (?, ?, ?)`,
        )
          .bind(code, name, routingStr)
          .run();
        return jsonResponse({ success: true, created: true });
      }

      if (path.startsWith("/api/products/") && method === "PUT") {
        const codeParam = decodeURIComponent(
          path.replace("/api/products/", ""),
        )
          .trim()
          .toUpperCase();
        const body = await request.json();
        const newName = String(body.product_name || "").trim();
        const routingStr =
          typeof body.routing_map === "string"
            ? body.routing_map
            : JSON.stringify(body.routing_map || []);

        const existing = await env.DB.prepare(
          `SELECT id FROM Products WHERE UPPER(product_code) = ?`,
        )
          .bind(codeParam)
          .first();

        if (!existing) {
          return jsonResponse(
            { error: `Không tìm thấy mã hàng ${codeParam} để sửa!` },
            404,
          );
        }

        const routingErr = await validateRoutingForSave(env, routingStr);
        if (routingErr) return jsonResponse({ error: routingErr }, 400);

        await env.DB.prepare(
          `UPDATE Products SET product_name = ?, routing_map = ? WHERE id = ?`,
        )
          .bind(newName, routingStr, existing.id)
          .run();

        return jsonResponse({ success: true });
      }

      if (path.startsWith("/api/products/") && method === "DELETE") {
        const codeParam = decodeURIComponent(
          path.replace("/api/products/", ""),
        )
          .trim()
          .toUpperCase();

        const prod = await env.DB.prepare(
          `SELECT id, product_code FROM Products WHERE UPPER(product_code) = ?`,
        )
          .bind(codeParam)
          .first();

        if (!prod) {
          return jsonResponse({ error: "Mã hàng không tồn tại!" }, 404);
        }

        const activeWip = await env.DB.prepare(
          `SELECT SUM(quantity) as wip_qty
           FROM Inventory
           WHERE (CAST(product_id AS TEXT) = CAST(? AS TEXT) OR UPPER(product_id) = ?)
             AND UPPER(stage_id) NOT IN ('THANH_PHAM', 'THÀNH_PHẨM', 'SCRAP_NG')
             AND quantity > 0`,
        )
          .bind(String(prod.id), codeParam)
          .first();

        if (activeWip && Number(activeWip.wip_qty) > 0) {
          return jsonResponse(
            {
              error: `Không thể xóa! Mã hàng ${codeParam} đang còn ${activeWip.wip_qty} sản phẩm đang chạy trên chuyền.`,
            },
            400,
          );
        }

        await env.DB.prepare(`DELETE FROM Products WHERE id = ?`)
          .bind(prod.id)
          .run();
        return jsonResponse({ success: true });
      }

      // ====================================================
      // 4. API TẠO PO / CHẺ LOT (/api/po/create)
      // ====================================================
      if (path === "/api/po/create" && method === "POST") {
        const body = await request.json();
        const poNumber = String(body.po_number || "")
          .trim()
          .toUpperCase();
        const prodCode = String(body.product_code || "")
          .trim()
          .toUpperCase();
        const totalQty = parseInt(body.total_qty) || 0;
        const prodDate = body.production_date || "";

        if (!poNumber || !prodCode || totalQty <= 0) {
          return jsonResponse(
            { error: "Thông tin tạo LOT không hợp lệ!" },
            400,
          );
        }

        const product = await env.DB.prepare(
          `SELECT * FROM Products WHERE UPPER(product_code) = ?`,
        )
          .bind(prodCode)
          .first();

        if (!product) {
          return jsonResponse(
            { error: `Mã hàng "${prodCode}" chưa được khai báo!` },
            400,
          );
        }

        const existLot = await env.DB.prepare(
          `SELECT lot_number FROM Inventory WHERE UPPER(lot_number) = ? LIMIT 1`,
        )
          .bind(poNumber)
          .first();
        if (existLot) {
          return jsonResponse(
            { error: `Số LOT "${poNumber}" đã tồn tại trên hệ thống!` },
            400,
          );
        }

        // Chống trùng mã PO: lot đầu tiên của 1 lần cấp phát phải dùng mã PO chưa từng cấp
        const prefix = String(body.prefix || "").trim().toUpperCase();
        if (prefix && body.batch_first) {
          const used = await findLotsByPrefix(env, prefix);
          if (used.length > 0) {
            return jsonResponse(
              {
                error: `Mã PO "${prefix}" đã được cấp phát (${used.length} LOT, mã hàng ${[...new Set(used.map((u) => u.product_code))].join(", ")}). Mỗi mã PO chỉ dùng 1 lần!`,
              },
              400,
            );
          }
        }

        const route = parseRouting(product.routing_map);
        if (!route) {
          return jsonResponse(
            { error: `Mã hàng "${prodCode}" chưa có lộ trình hợp lệ, vui lòng khai báo ở tab Mã Hàng trước khi tạo LOT!` },
            400,
          );
        }
        const first_stage = route[0];

        const pId = String(product.id || product.product_code);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO Production_Orders (po_number, product_id, month, total_qty, status)
             VALUES (?, ?, ?, ?, 'OPEN')`,
          ).bind(poNumber, pId, prodDate, totalQty),
          env.DB.prepare(
            `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          ).bind(pId, poNumber, first_stage, totalQty),
        ]);

        return jsonResponse({ success: true });
      }

      // Kiểm tra mã PO đã cấp phát chưa (trước khi chẻ LOT)
      if (path === "/api/po/check" && method === "GET") {
        const prefix = (url.searchParams.get("prefix") || "").trim().toUpperCase();
        if (!prefix) return jsonResponse({ lots: [] });
        return jsonResponse({ lots: await findLotsByPrefix(env, prefix) });
      }

      // Sửa LOT: đổi ngày cấp luôn được; đổi Tổng SL chỉ khi LOT chưa chuyển công đoạn
      if (path.startsWith("/api/po/") && method === "PUT") {
        const lot = decodeURIComponent(path.replace("/api/po/", "")).trim().toUpperCase();
        const body = await request.json();
        const order = await env.DB.prepare(
          `SELECT * FROM Production_Orders WHERE UPPER(po_number) = ?`,
        ).bind(lot).first();
        if (!order) return jsonResponse({ error: `Không tìm thấy LOT ${lot}!` }, 404);

        const newDate = String(body.production_date || order.month || "").trim();
        const newQty = parseInt(body.total_qty);
        const stmts = [
          env.DB.prepare(`UPDATE Production_Orders SET month = ? WHERE id = ?`).bind(newDate, order.id),
        ];

        if (Number.isInteger(newQty) && newQty !== Number(order.total_qty)) {
          if (newQty <= 0) return jsonResponse({ error: "Tổng SL phải lớn hơn 0!" }, 400);
          const state = await getLotUntouchedState(env, order);
          if (!state.untouched) {
            return jsonResponse({ error: `LOT ${lot} đã chuyển công đoạn, không thể đổi Tổng SL. Chỉ sửa được ngày cấp.` }, 400);
          }
          const oldQty = Number(order.total_qty);
          // Mỗi câu tự kiểm tồn còn đúng như lúc đọc, tránh lệch giữa PO và Inventory
          const INV_OLD_OK = `EXISTS (SELECT 1 FROM Inventory WHERE UPPER(lot_number) = ? AND stage_id = ? AND quantity = ?)`;
          stmts.push(
            env.DB.prepare(
              `UPDATE Production_Orders SET total_qty = ? WHERE id = ? AND ${INV_OLD_OK}`,
            ).bind(newQty, order.id, lot, state.stage, oldQty),
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type, note)
               SELECT ?, ?, ?, ?, ?, 'ADJUST', ? WHERE ${INV_OLD_OK}`,
            ).bind(auth.uid, order.po_number, state.stage, state.stage, newQty,
              `Sửa Tổng SL ${oldQty} -> ${newQty}`, lot, state.stage, oldQty),
            env.DB.prepare(
              `UPDATE Inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP
               WHERE UPPER(lot_number) = ? AND stage_id = ? AND quantity = ?`,
            ).bind(newQty, lot, state.stage, oldQty),
          );
        }
        const res = await env.DB.batch(stmts);
        if (stmts.length > 1 && Number(res[res.length - 1]?.meta?.changes) < 1) {
          return jsonResponse({ error: "Tồn của LOT vừa thay đổi, vui lòng tải lại và thử lại!" }, 409);
        }
        return jsonResponse({ success: true });
      }

      // Xóa LOT: chỉ khi LOT chưa chuyển công đoạn (toàn bộ hàng còn ở công đoạn đầu)
      if (path.startsWith("/api/po/") && method === "DELETE") {
        const lot = decodeURIComponent(path.replace("/api/po/", "")).trim().toUpperCase();
        const order = await env.DB.prepare(
          `SELECT * FROM Production_Orders WHERE UPPER(po_number) = ?`,
        ).bind(lot).first();
        if (!order) return jsonResponse({ error: `Không tìm thấy LOT ${lot}!` }, 404);
        const state = await getLotUntouchedState(env, order);
        if (!state.untouched) {
          return jsonResponse({ error: `LOT ${lot} đã chuyển công đoạn hoặc có NG, không thể xóa!` }, 400);
        }
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM Inventory WHERE UPPER(lot_number) = ?`).bind(lot),
          env.DB.prepare(`DELETE FROM Production_Orders WHERE id = ?`).bind(order.id),
          env.DB.prepare(
            `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type, note)
             VALUES (?, ?, ?, 'DELETED', ?, 'DELETE_LOT', 'Xóa LOT chưa sản xuất')`,
          ).bind(auth.uid, order.po_number, state.stage || "", Number(order.total_qty)),
        ]);
        return jsonResponse({ success: true });
      }

      // ====================================================
      // 5. API QUẢN LÝ CÔNG ĐOẠN SẢN XUẤT (Đồng bộ cả Lines, Stages & Stages_Config)
      // ====================================================
      if (path === "/api/stages" && method === "GET") {
        const stages = await getOrInitStages(env);
        return jsonResponse({ data: stages });
      }

      if (path === "/api/stages/reorder" && method === "PUT") {
        await getOrInitStages(env);
        const body = await request.json();
        const orderedIds = Array.isArray(body.ordered_ids)
          ? body.ordered_ids
          : [];
        if (orderedIds.length > 0) {
          const stmts = orderedIds.map((id, idx) =>
            env.DB.prepare(
              `UPDATE Stages_Config SET sort_order = ? WHERE UPPER(id) = UPPER(?)`,
            ).bind(idx + 1, String(id)),
          );
          await env.DB.batch(stmts);
        }
        return jsonResponse({ success: true });
      }

      if (path === "/api/stages" && method === "POST") {
        const stages = await getOrInitStages(env);
        const body = await request.json();
        const stgId = String(body.id || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, "");
        const stgName = String(body.stage_name || "").trim();
        const stgLine = String(body.line_id || "")
          .trim()
          .toUpperCase();

        if (!stgId || !stgName || !stgLine) {
          return jsonResponse(
            { error: "Thiếu Mã công đoạn, Tên công đoạn hoặc Line!" },
            400,
          );
        }

        const maxSort = stages.reduce(
          (max, s) => Math.max(max, Number(s.sort_order) || 0),
          0,
        );

        // 1. Tự động thêm Line mới vào bảng Lines nếu chưa có (tránh lỗi khóa ngoại)
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO Lines (line_id, line_name) VALUES (?, ?)`,
          )
            .bind(stgLine, `Line ${stgLine}`)
            .run();
        } catch (e) {}

        // 2. Lưu vào Stages_Config
        await env.DB.prepare(
          `INSERT INTO Stages_Config (id, stage_name, line_id, sort_order)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET stage_name = excluded.stage_name, line_id = excluded.line_id`,
        )
          .bind(stgId, stgName, stgLine, maxSort + 1)
          .run();

        // 3. Đồng bộ sang bảng Stages gốc trong D1
        try {
          await env.DB.prepare(
            `INSERT INTO Stages (stage_id, line_id, stage_name)
             VALUES (?, ?, ?)
             ON CONFLICT(stage_id) DO UPDATE SET line_id = excluded.line_id, stage_name = excluded.stage_name`,
          )
            .bind(stgId, stgLine, stgName)
            .run();
        } catch (e) {}

        return jsonResponse({ success: true });
      }

      if (path.startsWith("/api/stages/") && method === "PUT") {
        await getOrInitStages(env);
        const stgId = decodeURIComponent(path.replace("/api/stages/", ""))
          .trim()
          .toUpperCase();
        const body = await request.json();
        const stgName = String(body.stage_name || "").trim();
        const stgLine = String(body.line_id || "")
          .trim()
          .toUpperCase();

        // 1. Đảm bảo Line tồn tại trong bảng Lines
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO Lines (line_id, line_name) VALUES (?, ?)`,
          )
            .bind(stgLine, `Line ${stgLine}`)
            .run();
        } catch (e) {}

        // 2. Cập nhật Stages_Config
        await env.DB.prepare(
          `UPDATE Stages_Config SET stage_name = ?, line_id = ? WHERE UPPER(id) = ?`,
        )
          .bind(stgName, stgLine, stgId)
          .run();

        // 3. Đồng bộ bảng Stages gốc
        try {
          await env.DB.prepare(
            `UPDATE Stages SET stage_name = ?, line_id = ? WHERE UPPER(stage_id) = ?`,
          )
            .bind(stgName, stgLine, stgId)
            .run();
        } catch (e) {}

        return jsonResponse({ success: true });
      }

      if (path.startsWith("/api/stages/") && method === "DELETE") {
        await getOrInitStages(env);
        const stgId = decodeURIComponent(path.replace("/api/stages/", ""))
          .trim()
          .toUpperCase();

        const invCheck = await env.DB.prepare(
          `SELECT SUM(quantity) as qty FROM Inventory WHERE UPPER(stage_id) IN (?, ?) AND quantity > 0`,
        )
          .bind(stgId, `${stgId}_NG`)
          .first();

        if (invCheck && Number(invCheck.qty) > 0) {
          return jsonResponse(
            {
              error: `Không thể xóa công đoạn ${stgId} vì đang còn ${invCheck.qty} sản phẩm tại trạm này!`,
            },
            400,
          );
        }

        await env.DB.prepare(`DELETE FROM Stages_Config WHERE UPPER(id) = ?`)
          .bind(stgId)
          .run();

        try {
          await env.DB.prepare(`DELETE FROM Stages WHERE UPPER(stage_id) = ?`)
            .bind(stgId)
            .run();
        } catch (e) {}

        return jsonResponse({ success: true });
      }

      // ====================================================
      // 6. API BẢNG TỔNG KẾT MATRIX & TỔNG NG (/api/dashboard/matrix)
      // ====================================================
      if (path === "/api/dashboard/matrix" && method === "GET") {
        const dynamicStages = await getOrInitStages(env);

        const stagesList = dynamicStages
          .map((s) =>
            String(s.id || "")
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9_]/g, ""),
          )
          .filter(Boolean);

        const queryFields = stagesList
          .map(
            (st) => `
              SUM(CASE WHEN UPPER(i.stage_id) = '${st}' THEN i.quantity ELSE 0 END) AS qty_${st.toLowerCase()},
              SUM(CASE WHEN UPPER(i.stage_id) = '${st}_NG' THEN i.quantity ELSE 0 END) AS ng_${st.toLowerCase()},
              MAX(CASE WHEN UPPER(i.stage_id) = '${st}' THEN i.updated_at ELSE NULL END) AS date_${st.toLowerCase()}
            `,
          )
          .join(",");

        const { results } = await env.DB.prepare(`
          SELECT
            i.lot_number,
            COALESCE(p.product_code, i.product_id) AS product_code,
            po.month AS production_date,
            COALESCE(po.total_qty, SUM(i.quantity)) AS total_qty,
            ${queryFields ? queryFields + "," : ""}
            SUM(CASE WHEN UPPER(i.stage_id) LIKE '%_NG' OR UPPER(i.stage_id) = 'NG' THEN i.quantity ELSE 0 END) AS total_ng,
            SUM(CASE WHEN UPPER(i.stage_id) = 'SCRAP_NG' THEN i.quantity ELSE 0 END) AS qty_scrap,
            SUM(CASE WHEN UPPER(i.stage_id) IN ('THANH_PHAM', 'THÀNH_PHẨM') THEN i.quantity ELSE 0 END) AS qty_done
          FROM Inventory i
          LEFT JOIN Products p
            ON (CAST(p.id AS TEXT) = CAST(i.product_id AS TEXT) OR UPPER(p.product_code) = UPPER(i.product_id))
          LEFT JOIN Production_Orders po
            ON po.po_number = i.lot_number
          WHERE i.quantity > 0
          GROUP BY i.lot_number, p.product_code, po.month
          ORDER BY po.month DESC, i.lot_number DESC
        `).all();

        return jsonResponse({ matrix: results || [] });
      }

      // ====================================================
      // 7. API LEADER PENDING (Tự động theo bảng Stages_Config)
      // ====================================================
      if (path === "/api/leader/pending" && method === "GET") {
        // LEADER chỉ xem được line của mình, bất kể client gửi line_id gì
        const line_id =
          auth.role === "LEADER"
            ? auth.line
            : (url.searchParams.get("line_id") || "").trim().toUpperCase();
        const allStages = await getOrInitStages(env);

        let validStages = allStages
          .filter((s) => String(s.line_id).toUpperCase() === line_id)
          .map((s) => String(s.id).toUpperCase());

        if (validStages.length === 0 && line_id) {
          validStages = [line_id];
        }

        if (validStages.length === 0) {
          return jsonResponse({ data: [] });
        }

        const placeholders = validStages.map(() => "?").join(",");
        const { results } = await env.DB.prepare(`
          SELECT
            i.lot_number AS po_id,
            i.lot_number AS po_number,
            COALESCE(p.product_code, i.product_id, 'UNKNOWN') AS product_id,
            COALESCE(p.product_code, i.product_id, 'UNKNOWN') AS product_code,
            i.stage_id AS from_stage,
            i.quantity AS qty_available,
            p.routing_map
          FROM Inventory i
          LEFT JOIN Products p
            ON (CAST(p.id AS TEXT) = CAST(i.product_id AS TEXT) OR UPPER(p.product_code) = UPPER(i.product_id))
          WHERE UPPER(i.stage_id) IN (${placeholders}) AND i.quantity > 0
          ORDER BY i.updated_at DESC
        `)
          .bind(...validStages)
          .all();

        const formattedResults = (results || []).map((row) => {
          let to_stage_name = "Hoàn thành (Nhập kho)";
          if (row.routing_map) {
            try {
              const rMap = JSON.parse(row.routing_map);
              const cIdx = rMap.findIndex(
                (st) =>
                  String(st.stage_id).toUpperCase() ===
                  String(row.from_stage).toUpperCase(),
              );
              if (cIdx !== -1 && cIdx < rMap.length - 1) {
                to_stage_name = String(rMap[cIdx + 1].stage_id).toUpperCase();
              }
            } catch (e) {}
          }
          return { ...row, to_stage_name };
        });

        return jsonResponse({ data: formattedResults });
      }

      // ====================================================
      // 8. API DANH SÁCH NG & XỬ LÝ HÀNG NG (SCRAP / REWORK)
      // ====================================================
      if (path === "/api/ng/list" && method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT
            i.lot_number,
            COALESCE(p.product_code, i.product_id, 'UNKNOWN') AS product_code,
            REPLACE(UPPER(i.stage_id), '_NG', '') AS stage_id,
            SUM(i.quantity) AS ng_qty
          FROM Inventory i
          LEFT JOIN Products p
            ON (CAST(p.id AS TEXT) = CAST(i.product_id AS TEXT) OR UPPER(p.product_code) = UPPER(i.product_id))
          WHERE UPPER(i.stage_id) LIKE '%_NG'
            AND UPPER(i.stage_id) != 'SCRAP_NG'
            AND i.quantity > 0
          GROUP BY i.lot_number, p.product_code, i.stage_id
          ORDER BY i.lot_number DESC
        `).all();

        return jsonResponse({ data: results || [] });
      }

      if (path === "/api/ng/resolve" && method === "POST") {
        const body = await request.json();
        const lot_num = String(body.lot_number || body.po_id || "").trim();
        const rawStage = String(
          body.current_stage || body.from_stage || "",
        )
          .trim()
          .toUpperCase()
          .replace(/_NG$/, "");
        const ngStageId = `${rawStage}_NG`;
        const resolveQty = Math.max(
          0,
          parseInt(body.qty || body.ng_qty) || 0,
        );
        const action = String(body.action || "SCRAP")
          .trim()
          .toUpperCase();
        const returnStage = String(body.return_stage || "")
          .trim()
          .toUpperCase();
        const userId = auth.uid;

        if (!lot_num || !rawStage || resolveQty <= 0) {
          return jsonResponse(
            { error: "Thiếu thông tin LOT, công đoạn lỗi hoặc số lượng NG!" },
            400,
          );
        }

        if (action === "REWORK" && !returnStage) {
          return jsonResponse(
            { error: "Vui lòng chọn công đoạn trả về để làm lại (REWORK)!" },
            400,
          );
        }

        const ngInv = await env.DB.prepare(
          `SELECT product_id, quantity, stage_id
           FROM Inventory
           WHERE lot_number = ? AND UPPER(stage_id) IN (?, 'NG') AND quantity > 0
           ORDER BY CASE WHEN UPPER(stage_id) = ? THEN 0 ELSE 1 END
           LIMIT 1`,
        )
          .bind(lot_num, ngStageId, ngStageId)
          .first();

        if (!ngInv || Number(ngInv.quantity) < resolveQty) {
          const availNg = ngInv ? Number(ngInv.quantity) : 0;
          return jsonResponse(
            {
              error: `Số lượng xử lý (${resolveQty}) vượt quá số lượng NG hiện có tại công đoạn ${rawStage} (${availNg})!`,
            },
            400,
          );
        }

        const pId = ngInv.product_id;
        const actualNgStageCol = ngInv.stage_id;

        if (action === "REWORK") {
          const known = (await getOrInitStages(env)).some(
            (st) => String(st.id).toUpperCase() === returnStage,
          );
          if (!known) {
            return jsonResponse(
              { error: `Công đoạn trả về "${returnStage}" không tồn tại!` },
              400,
            );
          }
        }

        // Như /api/move: các câu lệnh trong 1 transaction, mỗi câu kiểm lại "tồn NG còn đủ"
        const NG_OK_SQL = `(SELECT COALESCE(SUM(quantity), 0) FROM Inventory
          WHERE lot_number = ? AND stage_id = ?) >= ?`;
        const ngBinds = [lot_num, actualNgStageCol, resolveQty];
        const stmts = [];

        if (action === "REWORK") {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE ${NG_OK_SQL}
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(pId, lot_num, returnStage, resolveQty, ...ngBinds),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               SELECT ?, ?, ?, ?, ?, 'REWORK' WHERE ${NG_OK_SQL}`,
            ).bind(userId, lot_num, actualNgStageCol, returnStage, resolveQty, ...ngBinds),
          );
        } else {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               SELECT ?, ?, 'SCRAP_NG', ?, CURRENT_TIMESTAMP WHERE ${NG_OK_SQL}
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(pId, lot_num, resolveQty, ...ngBinds),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               SELECT ?, ?, ?, 'SCRAP_NG', ?, 'SCRAP' WHERE ${NG_OK_SQL}`,
            ).bind(userId, lot_num, actualNgStageCol, resolveQty, ...ngBinds),
          );
        }

        stmts.push(
          env.DB.prepare(
            `UPDATE Inventory
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE lot_number = ? AND stage_id = ? AND quantity >= ?`,
          ).bind(resolveQty, lot_num, actualNgStageCol, resolveQty),
        );

        const batchRes = await env.DB.batch(stmts);
        const deducted = batchRes[batchRes.length - 1];
        if (!deducted || !deducted.meta || Number(deducted.meta.changes) < 1) {
          return jsonResponse(
            { error: "Tồn NG vừa thay đổi (có người khác đang xử lý). Vui lòng tải lại và thử lại!" },
            409,
          );
        }
        return jsonResponse({ success: true, action });
      }

      // ====================================================
      // 9. API LỊCH SỬ GIAO DỊCH (/api/history)
      // ====================================================
      if (path === "/api/history" && method === "GET") {
        // LEADER chỉ xem giao dịch phát sinh từ các công đoạn thuộc line của mình
        let lineFilter = "";
        let lineBinds = [];
        if (auth.role === "LEADER") {
          const lineStages = (await getOrInitStages(env))
            .filter((s) => String(s.line_id).toUpperCase() === auth.line)
            .map((s) => String(s.id).toUpperCase());
          if (lineStages.length === 0) lineStages.push(auth.line);
          lineFilter = `WHERE REPLACE(UPPER(t.from_stage), '_NG', '') IN (${lineStages.map(() => "?").join(",")})`;
          lineBinds = lineStages;
        }
        const { results } = await env.DB.prepare(`
          SELECT
            t.timestamp,
            u.full_name,
            u.username,
            t.po_id,
            t.type,
            t.qty,
            t.from_stage,
            t.to_stage,
            COALESCE(
              (SELECT p.product_code
               FROM Inventory i
               LEFT JOIN Products p
                 ON (CAST(p.id AS TEXT) = CAST(i.product_id AS TEXT) OR UPPER(p.product_code) = UPPER(i.product_id))
               WHERE i.lot_number = t.po_id
               LIMIT 1),
              'UNKNOWN'
            ) AS product_code
          FROM Transactions_Log t
          LEFT JOIN Users u ON t.user_id = u.id
          ${lineFilter}
          ORDER BY t.timestamp DESC
          LIMIT 500
        `)
          .bind(...lineBinds)
          .all();

        return jsonResponse({ data: results || [] });
      }

      return jsonResponse({ error: "Endpoint not found" }, 404);
    } catch (error) {
      console.error("API error:", path, error && error.stack ? error.stack : error);
      return jsonResponse({ error: "Lỗi máy chủ nội bộ, vui lòng thử lại!" }, 500);
    }
  },
};
