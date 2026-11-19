const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

// Tự động đồng bộ bảng Lines, Stages và Stages_Config trong D1 để không bao giờ bị lỗi khóa ngoại (Foreign Key)
async function getOrInitStages(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS Stages_Config (
      id TEXT PRIMARY KEY,
      stage_name TEXT NOT NULL,
      line_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )
  `).run();

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

  // Đảm bảo bảng Lines và bảng Stages gốc trong D1 luôn có đầy đủ Line BARRY và các công đoạn mới
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
  } catch (e) {}

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

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ====================================================
      // 1. API ĐĂNG NHẬP & ĐỔI MẬT KHẨU
      // ====================================================
      if (path === "/api/login" && method === "POST") {
        const { username, password } = await request.json();
        const user = await env.DB.prepare(
          `SELECT id, username, full_name, role, line_id, password_hash
           FROM Users
           WHERE UPPER(username) = UPPER(?) AND password_hash = ?`,
        )
          .bind(String(username || "").trim(), String(password || ""))
          .first();

        if (!user) {
          return jsonResponse({ error: "Sai tài khoản hoặc mật khẩu!" }, 401);
        }
        return jsonResponse({ success: true, user });
      }

      if (path === "/api/change-password" && method === "POST") {
        const { username, new_password } = await request.json();
        if (!new_password || String(new_password).length < 4) {
          return jsonResponse(
            { error: "Mật khẩu mới phải từ 4 ký tự trở lên!" },
            400,
          );
        }
        await env.DB.prepare(
          `UPDATE Users SET password_hash = ? WHERE UPPER(username) = UPPER(?)`,
        )
          .bind(String(new_password), String(username || "").trim())
          .run();
        return jsonResponse({ success: true });
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
        const userId = body.user_id || 0;
        const isOutsource = Boolean(body.is_outsource);

        if (!lot_num || !from_stage || totalMove <= 0) {
          return jsonResponse(
            { error: "Dữ liệu số lượng hoặc LOT không hợp lệ!" },
            400,
          );
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
        } else if (product.routing_map) {
          try {
            const routingMap = JSON.parse(product.routing_map);
            const currentIndex = routingMap.findIndex(
              (s) => String(s.stage_id).toUpperCase() === from_stage,
            );
            if (currentIndex !== -1 && currentIndex < routingMap.length - 1) {
              next_stage = String(
                routingMap[currentIndex + 1].stage_id,
              ).toUpperCase();
            }
          } catch (e) {}
        }

        const stmts = [];

        stmts.push(
          env.DB.prepare(
            `UPDATE Inventory
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE lot_number = ? AND TRIM(UPPER(stage_id)) = ?`,
          ).bind(totalMove, lot_num, from_stage),
        );

        if (qPass > 0) {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(final_p_id, lot_num, next_stage, qPass),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               VALUES (?, ?, ?, ?, ?, 'PASS')`,
            ).bind(userId, lot_num, from_stage, next_stage, qPass),
          );
        }

        if (qNG > 0) {
          const ngStageId = `${from_stage}_NG`;
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(final_p_id, lot_num, ngStageId, qNG),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               VALUES (?, ?, ?, 'KHO_NG', ?, 'NG')`,
            ).bind(userId, lot_num, from_stage, qNG),
          );
        }

        await env.DB.batch(stmts);
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

        let first_stage = "CAT";
        if (product.routing_map) {
          try {
            const r = JSON.parse(product.routing_map);
            if (r.length > 0) {
              first_stage = String(r[0].stage_id).toUpperCase();
            }
          } catch (e) {}
        }

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
        const line_id = (url.searchParams.get("line_id") || "")
          .trim()
          .toUpperCase();
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
        const userId = body.user_id || 0;

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
        const stmts = [];

        stmts.push(
          env.DB.prepare(
            `UPDATE Inventory
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE lot_number = ? AND stage_id = ?`,
          ).bind(resolveQty, lot_num, actualNgStageCol),
        );

        if (action === "REWORK") {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(pId, lot_num, returnStage, resolveQty),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               VALUES (?, ?, ?, ?, ?, 'REWORK')`,
            ).bind(userId, lot_num, actualNgStageCol, returnStage, resolveQty),
          );
        } else {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Inventory (product_id, lot_number, stage_id, quantity, updated_at)
               VALUES (?, ?, 'SCRAP_NG', ?, CURRENT_TIMESTAMP)
               ON CONFLICT(product_id, lot_number, stage_id)
               DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
            ).bind(pId, lot_num, resolveQty),
          );
          stmts.push(
            env.DB.prepare(
              `INSERT INTO Transactions_Log (user_id, po_id, from_stage, to_stage, qty, type)
               VALUES (?, ?, ?, 'SCRAP_NG', ?, 'SCRAP')`,
            ).bind(userId, lot_num, actualNgStageCol, resolveQty),
          );
        }

        await env.DB.batch(stmts);
        return jsonResponse({ success: true, action });
      }

      // ====================================================
      // 9. API LỊCH SỬ GIAO DỊCH (/api/history)
      // ====================================================
      if (path === "/api/history" && method === "GET") {
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
          ORDER BY t.timestamp DESC
          LIMIT 500
        `).all();

        return jsonResponse({ data: results || [] });
      }

      return jsonResponse({ error: "Endpoint not found" }, 404);
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  },
};
