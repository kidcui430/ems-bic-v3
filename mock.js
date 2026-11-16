/**
 * BỘ GIẢ LẬP DỮ LIỆU TEST (MOCK SERVER TRÊN TRÌNH DUYỆT)
 * Cách bật: Thêm ?mock hoặc ?=mock vào cuối địa chỉ trang web (VD: index.html?=mock)
 * Mọi thao tác Tạo LOT, Chuyển công đoạn, Xử lý NG, Sửa/Xóa Mã hàng đều chạy như thật
 * nhưng lưu độc lập trong bộ nhớ Mock, KHÔNG đụng chạm tới cơ sở dữ liệu D1 thật.
 */
(function () {
  const searchStr = window.location.search.toLowerCase();
  const isMockUrl =
    searchStr.includes("mock") ||
    sessionStorage.getItem("ems_mock_mode") === "1";

  if (!isMockUrl) return;
  sessionStorage.setItem("ems_mock_mode", "1");

  const MOCK_STORAGE_KEY = "ems_mock_database_v1";

  const INITIAL_MOCK_DB = {
    users: [
      {
        id: 1,
        username: "NPC",
        full_name: "Quản Lý Sản Xuất (Admin)",
        role: "ADMIN",
        line_id: "ALL",
        password_hash: "1234",
      },
      {
        id: 2,
        username: "LD_CUT",
        full_name: "Tổ Trưởng Cắt",
        role: "LEADER",
        line_id: "CUTTING",
        password_hash: "1234",
      },
      {
        id: 3,
        username: "LD_NC",
        full_name: "Tổ Trưởng Tiện NC",
        role: "LEADER",
        line_id: "NC",
        password_hash: "1234",
      },
      {
        id: 4,
        username: "LD_GP",
        full_name: "Tổ Trưởng GP-GE-GI",
        role: "LEADER",
        line_id: "GP_GE_GI",
        password_hash: "1234",
      },
      {
        id: 5,
        username: "LD_BARRY",
        full_name: "Tổ Trưởng Bavia (Barry)",
        role: "LEADER",
        line_id: "BARRY",
        password_hash: "1234",
      },
      {
        id: 6,
        username: "LD_ASSY",
        full_name: "Tổ Trưởng Lắp Ráp",
        role: "LEADER",
        line_id: "ASSY",
        password_hash: "1234",
      },
      {
        id: 7,
        username: "LD_KENSA",
        full_name: "Tổ Trưởng Kiểm Tra",
        role: "LEADER",
        line_id: "KENSA",
        password_hash: "1234",
      },
    ],
    stages: [
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
    ],
    products: [
      {
        id: 1,
        product_code: "ASW-40",
        product_name: "Thanh trục phi 40",
        routing_map: JSON.stringify([
          { order: 1, stage_id: "CAT" },
          { order: 2, stage_id: "DO_CUNG" },
          { order: 3, stage_id: "NC2" },
          { order: 4, stage_id: "BARRY" },
          { order: 5, stage_id: "DONG_THUNG" },
        ]),
      },
      {
        id: 2,
        product_code: "TB-30",
        product_name: "Liner motion bearing",
        routing_map: JSON.stringify([
          { order: 1, stage_id: "CAT" },
          { order: 2, stage_id: "NC1" },
          { order: 3, stage_id: "NHIET_LUYEN" },
          { order: 4, stage_id: "DO_CUNG" },
          { order: 5, stage_id: "GP" },
          { order: 6, stage_id: "GI" },
          { order: 7, stage_id: "LAP_RAP" },
          { order: 8, stage_id: "KIEM_TRA" },
          { order: 9, stage_id: "DONG_THUNG" },
        ]),
      },
    ],
    orders: [
      { po_number: "PO1611-01", product_id: "ASW-40", month: "2026-11-15", total_qty: 100, status: "OPEN" },
      { po_number: "PO1611-02", product_id: "ASW-40", month: "2026-11-15", total_qty: 100, status: "OPEN" },
      { po_number: "PO1611-03", product_id: "TB-30", month: "2026-11-16", total_qty: 150, status: "OPEN" },
      { po_number: "PO1611-04", product_id: "TB-30", month: "2026-11-16", total_qty: 150, status: "OPEN" },
    ],
    inventory: [
      { product_id: "ASW-40", lot_number: "PO1611-01", stage_id: "BARRY", quantity: 40, updated_at: "2026-11-16 01:30:00" },
      { product_id: "ASW-40", lot_number: "PO1611-01", stage_id: "NC2_NG", quantity: 5, updated_at: "2026-11-16 01:15:00" },
      { product_id: "ASW-40", lot_number: "PO1611-01", stage_id: "THANH_PHAM", quantity: 55, updated_at: "2026-11-16 02:00:00" },
      { product_id: "ASW-40", lot_number: "PO1611-02", stage_id: "DO_CUNG", quantity: 30, updated_at: "2026-11-16 01:10:00" },
      { product_id: "ASW-40", lot_number: "PO1611-02", stage_id: "NC2", quantity: 70, updated_at: "2026-11-16 02:10:00" },
      { product_id: "TB-30", lot_number: "PO1611-03", stage_id: "GP", quantity: 120, updated_at: "2026-11-16 02:20:00" },
      { product_id: "TB-30", lot_number: "PO1611-03", stage_id: "NC1_NG", quantity: 8, updated_at: "2026-11-16 01:40:00" },
      { product_id: "TB-30", lot_number: "PO1611-03", stage_id: "KIEM_TRA", quantity: 22, updated_at: "2026-11-16 02:35:00" },
      { product_id: "TB-30", lot_number: "PO1611-04", stage_id: "CAT", quantity: 150, updated_at: "2026-11-16 02:45:00" },
    ],
    history: [
      { timestamp: "2026-11-16 02:35:00", user_id: 6, po_id: "PO1611-03", from_stage: "LAP_RAP", to_stage: "KIEM_TRA", qty: 22, type: "PASS" },
      { timestamp: "2026-11-16 02:00:00", user_id: 6, po_id: "PO1611-01", from_stage: "DONG_THUNG", to_stage: "THANH_PHAM", qty: 55, type: "PASS" },
      { timestamp: "2026-11-16 01:40:00", user_id: 3, po_id: "PO1611-03", from_stage: "NC1", to_stage: "KHO_NG", qty: 8, type: "NG" },
      { timestamp: "2026-11-16 01:30:00", user_id: 3, po_id: "PO1611-01", from_stage: "NC2", to_stage: "BARRY", qty: 40, type: "PASS" },
      { timestamp: "2026-11-16 01:15:00", user_id: 3, po_id: "PO1611-01", from_stage: "NC2", to_stage: "KHO_NG", qty: 5, type: "NG" },
    ],
  };

  function loadDB() {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
      return JSON.parse(JSON.stringify(INITIAL_MOCK_DB));
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return JSON.parse(JSON.stringify(INITIAL_MOCK_DB));
    }
  }

  function saveDB(db) {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
  }

  function nowUTCString() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  }

  function makeJsonRes(obj, status = 200) {
    return Promise.resolve(
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const urlStr = typeof input === "string" ? input : input.url;
    if (!urlStr.includes("/api/")) {
      return originalFetch(input, init);
    }

    const u = new URL(urlStr, window.location.origin);
    const path = u.pathname;
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const db = loadDB();

    if (path === "/api/login" && method === "POST") {
      const uname = String(body.username || "").trim().toUpperCase();
      const pass = String(body.password || "");
      const user = db.users.find(
        (x) => x.username.toUpperCase() === uname && x.password_hash === pass,
      );
      if (!user) return makeJsonRes({ error: "Sai tài khoản hoặc mật khẩu! (Mock)" }, 401);
      return makeJsonRes({ success: true, user });
    }

    if (path === "/api/stages" && method === "GET") {
      return makeJsonRes({ data: db.stages });
    }
    if (path === "/api/stages" && method === "POST") {
      const id = String(body.id || "").trim().toUpperCase();
      const existIdx = db.stages.findIndex((s) => s.id === id);
      if (existIdx >= 0) {
        db.stages[existIdx].stage_name = body.stage_name;
        db.stages[existIdx].line_id = body.line_id;
      } else {
        db.stages.push({
          id,
          stage_name: body.stage_name,
          line_id: body.line_id,
          sort_order: db.stages.length + 1,
        });
      }
      saveDB(db);
      return makeJsonRes({ success: true });
    }
    if (path === "/api/stages/reorder" && method === "PUT") {
      const ids = body.ordered_ids || [];
      db.stages.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      saveDB(db);
      return makeJsonRes({ success: true });
    }
    if (path.startsWith("/api/stages/") && method === "PUT") {
      const stgId = decodeURIComponent(path.replace("/api/stages/", "")).toUpperCase();
      const stg = db.stages.find((s) => s.id === stgId);
      if (stg) {
        stg.stage_name = body.stage_name;
        stg.line_id = body.line_id;
        saveDB(db);
      }
      return makeJsonRes({ success: true });
    }
    if (path.startsWith("/api/stages/") && method === "DELETE") {
      const stgId = decodeURIComponent(path.replace("/api/stages/", "")).toUpperCase();
      db.stages = db.stages.filter((s) => s.id !== stgId);
      saveDB(db);
      return makeJsonRes({ success: true });
    }

    if (path === "/api/products" && method === "GET") {
      return makeJsonRes({ products: db.products });
    }
    if (path === "/api/products" && method === "POST") {
      const code = String(body.product_code || "").trim().toUpperCase();
      const routingStr =
        typeof body.routing_map === "string"
          ? body.routing_map
          : JSON.stringify(body.routing_map || []);
      const existing = db.products.find((p) => p.product_code.toUpperCase() === code);
      if (existing) {
        existing.product_name = body.product_name;
        existing.routing_map = routingStr;
      } else {
        db.products.unshift({
          id: Date.now(),
          product_code: code,
          product_name: body.product_name,
          routing_map: routingStr,
        });
      }
      saveDB(db);
      return makeJsonRes({ success: true });
    }
    if (path.startsWith("/api/products/") && method === "PUT") {
      const code = decodeURIComponent(path.replace("/api/products/", "")).toUpperCase();
      const existing = db.products.find((p) => p.product_code.toUpperCase() === code);
      if (existing) {
        existing.product_name = body.product_name;
        existing.routing_map =
          typeof body.routing_map === "string"
            ? body.routing_map
            : JSON.stringify(body.routing_map || []);
        saveDB(db);
      }
      return makeJsonRes({ success: true });
    }
    if (path.startsWith("/api/products/") && method === "DELETE") {
      const code = decodeURIComponent(path.replace("/api/products/", "")).toUpperCase();
      db.products = db.products.filter((p) => p.product_code.toUpperCase() !== code);
      saveDB(db);
      return makeJsonRes({ success: true });
    }

    if (path === "/api/po/create" && method === "POST") {
      const prod = db.products.find(
        (p) => p.product_code.toUpperCase() === String(body.product_code || "").toUpperCase(),
      );
      if (!prod) return makeJsonRes({ error: "Mã hàng chưa khai báo!" }, 400);
      if (db.orders.some((o) => o.po_number.toUpperCase() === String(body.po_number).toUpperCase())) {
        return makeJsonRes({ error: `LOT ${body.po_number} đã tồn tại!` }, 400);
      }
      const rMap = JSON.parse(prod.routing_map || "[]");
      const firstStage = rMap.length > 0 ? rMap[0].stage_id : "CAT";
      db.orders.unshift({
        po_number: body.po_number,
        product_id: prod.product_code,
        month: body.production_date,
        total_qty: Number(body.total_qty),
        status: "OPEN",
      });
      db.inventory.push({
        product_id: prod.product_code,
        lot_number: body.po_number,
        stage_id: firstStage,
        quantity: Number(body.total_qty),
        updated_at: nowUTCString(),
      });
      saveDB(db);
      return makeJsonRes({ success: true });
    }

    if (path === "/api/dashboard/matrix" && method === "GET") {
      const lotMap = {};
      db.inventory.forEach((inv) => {
        if (inv.quantity <= 0) return;
        if (!lotMap[inv.lot_number]) {
          const ord = db.orders.find((o) => o.po_number === inv.lot_number);
          lotMap[inv.lot_number] = {
            lot_number: inv.lot_number,
            product_code: inv.product_id,
            production_date: ord ? ord.month : "2026-11-16",
            total_qty: ord ? ord.total_qty : 0,
            total_ng: 0,
            qty_scrap: 0,
            qty_done: 0,
          };
        }
        const row = lotMap[inv.lot_number];
        const stgUpper = inv.stage_id.toUpperCase();
        if (stgUpper === "THANH_PHAM" || stgUpper === "THÀNH_PHẨM") {
          row.qty_done += inv.quantity;
        } else if (stgUpper === "SCRAP_NG") {
          row.qty_scrap += inv.quantity;
          row.total_ng += inv.quantity;
        } else if (stgUpper.endsWith("_NG")) {
          const baseStg = stgUpper.replace(/_NG$/, "").toLowerCase();
          row[`ng_${baseStg}`] = (row[`ng_${baseStg}`] || 0) + inv.quantity;
          row.total_ng += inv.quantity;
        } else {
          const baseStg = stgUpper.toLowerCase();
          row[`qty_${baseStg}`] = (row[`qty_${baseStg}`] || 0) + inv.quantity;
          row[`date_${baseStg}`] = inv.updated_at;
        }
      });
      return makeJsonRes({ matrix: Object.values(lotMap) });
    }

    if (path === "/api/leader/pending" && method === "GET") {
      const lineId = (u.searchParams.get("line_id") || "").toUpperCase();
      const myStageIds = db.stages
        .filter((s) => s.line_id.toUpperCase() === lineId)
        .map((s) => s.id.toUpperCase());

      const pending = [];
      db.inventory.forEach((inv) => {
        if (inv.quantity > 0 && myStageIds.includes(inv.stage_id.toUpperCase())) {
          const prod = db.products.find(
            (p) => p.product_code.toUpperCase() === String(inv.product_id).toUpperCase(),
          );
          let nextStage = "Hoàn thành (Nhập kho)";
          if (prod && prod.routing_map) {
            const rMap = JSON.parse(prod.routing_map);
            const idx = rMap.findIndex(
              (s) => s.stage_id.toUpperCase() === inv.stage_id.toUpperCase(),
            );
            if (idx !== -1 && idx < rMap.length - 1) {
              nextStage = rMap[idx + 1].stage_id;
            }
          }
          pending.push({
            po_id: inv.lot_number,
            po_number: inv.lot_number,
            product_id: inv.product_id,
            product_code: inv.product_id,
            from_stage: inv.stage_id,
            qty_available: inv.quantity,
            to_stage_name: nextStage,
          });
        }
      });
      return makeJsonRes({ data: pending });
    }

    if (path === "/api/move" && method === "POST") {
      const lotNo = body.lot_number;
      const fromStg = String(body.from_stage || "").toUpperCase();
      const qPass = Number(body.qty_pass) || 0;
      const qNg = Number(body.qty_ng) || 0;
      const invItem = db.inventory.find(
        (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === fromStg,
      );
      if (!invItem || invItem.quantity < qPass + qNg) {
        return makeJsonRes({ error: "Số lượng vượt quá tồn tại trạm!" }, 400);
      }
      invItem.quantity -= qPass + qNg;
      invItem.updated_at = nowUTCString();

      const prod = db.products.find(
        (p) => p.product_code.toUpperCase() === String(invItem.product_id).toUpperCase(),
      );
      let nextStg = "THANH_PHAM";
      if (body.is_outsource) {
        nextStg = "XUAT_GCN";
      } else if (prod && prod.routing_map) {
        const rMap = JSON.parse(prod.routing_map);
        const idx = rMap.findIndex((s) => s.stage_id.toUpperCase() === fromStg);
        if (idx !== -1 && idx < rMap.length - 1) {
          nextStg = rMap[idx + 1].stage_id.toUpperCase();
        }
      }

      if (qPass > 0) {
        let dest = db.inventory.find(
          (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === nextStg,
        );
        if (dest) {
          dest.quantity += qPass;
          dest.updated_at = nowUTCString();
        } else {
          db.inventory.push({
            product_id: invItem.product_id,
            lot_number: lotNo,
            stage_id: nextStg,
            quantity: qPass,
            updated_at: nowUTCString(),
          });
        }
        db.history.unshift({
          timestamp: nowUTCString(),
          user_id: body.user_id || 1,
          po_id: lotNo,
          from_stage: fromStg,
          to_stage: nextStg,
          qty: qPass,
          type: "PASS",
        });
      }

      if (qNg > 0) {
        const ngStg = `${fromStg}_NG`;
        let destNg = db.inventory.find(
          (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === ngStg,
        );
        if (destNg) {
          destNg.quantity += qNg;
          destNg.updated_at = nowUTCString();
        } else {
          db.inventory.push({
            product_id: invItem.product_id,
            lot_number: lotNo,
            stage_id: ngStg,
            quantity: qNg,
            updated_at: nowUTCString(),
          });
        }
        db.history.unshift({
          timestamp: nowUTCString(),
          user_id: body.user_id || 1,
          po_id: lotNo,
          from_stage: fromStg,
          to_stage: "KHO_NG",
          qty: qNg,
          type: "NG",
        });
      }

      saveDB(db);
      return makeJsonRes({ success: true, routed_to: nextStg });
    }

    if (path === "/api/ng/list" && method === "GET") {
      const list = db.inventory
        .filter(
          (i) =>
            i.stage_id.toUpperCase().endsWith("_NG") &&
            i.stage_id.toUpperCase() !== "SCRAP_NG" &&
            i.quantity > 0,
        )
        .map((i) => ({
          lot_number: i.lot_number,
          product_code: i.product_id,
          stage_id: i.stage_id.toUpperCase().replace(/_NG$/, ""),
          ng_qty: i.quantity,
        }));
      return makeJsonRes({ data: list });
    }

    if (path === "/api/ng/resolve" && method === "POST") {
      const lotNo = body.lot_number;
      const rawStg = String(body.current_stage || "").toUpperCase().replace(/_NG$/, "");
      const ngStg = `${rawStg}_NG`;
      const q = Number(body.qty) || 0;
      const ngItem = db.inventory.find(
        (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === ngStg,
      );
      if (!ngItem || ngItem.quantity < q) {
        return makeJsonRes({ error: "Số lượng xử lý vượt quá số NG tại trạm!" }, 400);
      }
      ngItem.quantity -= q;

      if (body.action === "REWORK") {
        const retStg = String(body.return_stage).toUpperCase();
        let target = db.inventory.find(
          (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === retStg,
        );
        if (target) {
          target.quantity += q;
          target.updated_at = nowUTCString();
        } else {
          db.inventory.push({
            product_id: ngItem.product_id,
            lot_number: lotNo,
            stage_id: retStg,
            quantity: q,
            updated_at: nowUTCString(),
          });
        }
        db.history.unshift({
          timestamp: nowUTCString(),
          user_id: body.user_id || 1,
          po_id: lotNo,
          from_stage: ngStg,
          to_stage: retStg,
          qty: q,
          type: "REWORK",
        });
      } else {
        let scrap = db.inventory.find(
          (i) => i.lot_number === lotNo && i.stage_id.toUpperCase() === "SCRAP_NG",
        );
        if (scrap) {
          scrap.quantity += q;
        } else {
          db.inventory.push({
            product_id: ngItem.product_id,
            lot_number: lotNo,
            stage_id: "SCRAP_NG",
            quantity: q,
            updated_at: nowUTCString(),
          });
        }
        db.history.unshift({
          timestamp: nowUTCString(),
          user_id: body.user_id || 1,
          po_id: lotNo,
          from_stage: ngStg,
          to_stage: "SCRAP_NG",
          qty: q,
          type: "SCRAP",
        });
      }
      saveDB(db);
      return makeJsonRes({ success: true });
    }

    if (path === "/api/history" && method === "GET") {
      const enriched = db.history.map((h) => {
        const uObj = db.users.find((x) => x.id === h.user_id);
        const ord = db.orders.find((o) => o.po_number === h.po_id);
        return {
          ...h,
          username: uObj ? uObj.username : "ADMIN",
          full_name: uObj ? uObj.full_name : "Quản trị viên",
          product_code: ord ? ord.product_id : "ASW-40",
        };
      });
      return makeJsonRes({ data: enriched });
    }

    return originalFetch(input, init);
  };

  window.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("div");
    banner.style.cssText =
      "background:#fef08a; color:#713f12; border-bottom:2px solid #eab308; padding:6px 14px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; z-index:9999; position:relative;";
    banner.innerHTML = `
      <div>
        <strong>🧪 CHẾ ĐỘ TEST (MOCK DATA):</strong> Không ảnh hưởng dữ liệu D1 thật.
        <span style="margin-left:6px;">Chuyển nhanh tài khoản:</span>
        <button type="button" onclick="mockQuickLogin('NPC')" style="padding:2px 7px; border-radius:4px; border:1px solid #ca8a04; background:#fff; cursor:pointer; font-weight:bold;">Admin (NPC)</button>
        <button type="button" onclick="mockQuickLogin('LD_BARRY')" style="padding:2px 7px; border-radius:4px; border:1px solid #ca8a04; background:#fff; cursor:pointer;">Leader BARRY</button>
        <button type="button" onclick="mockQuickLogin('LD_NC')" style="padding:2px 7px; border-radius:4px; border:1px solid #ca8a04; background:#fff; cursor:pointer;">Leader NC</button>
        <button type="button" onclick="mockQuickLogin('LD_ASSY')" style="padding:2px 7px; border-radius:4px; border:1px solid #ca8a04; background:#fff; cursor:pointer;">Leader ASSY</button>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" onclick="mockResetData()" style="padding:3px 8px; border-radius:4px; border:1px solid #b45309; background:#fef3c7; color:#92400e; cursor:pointer; font-weight:600;">🔄 Khôi phục dữ liệu mẫu</button>
        <button type="button" onclick="mockExit()" style="padding:3px 8px; border-radius:4px; border:1px solid #991b1b; background:#fee2e2; color:#991b1b; cursor:pointer; font-weight:600;">✖ Thoát Mock (Về D1 thật)</button>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  });

  window.mockQuickLogin = function (username) {
    const db = loadDB();
    const u = db.users.find((x) => x.username === username);
    if (!u) return;
    localStorage.setItem("ems_user", JSON.stringify(u));
    window.location.reload();
  };

  window.mockResetData = function () {
    if (!confirm("Khôi phục lại toàn bộ dữ liệu mẫu ban đầu của chế độ Mock?")) return;
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
    window.location.reload();
  };

  window.mockExit = function () {
    sessionStorage.removeItem("ems_mock_mode");
    localStorage.removeItem("ems_user");
    window.location.href = window.location.pathname;
  };
})();