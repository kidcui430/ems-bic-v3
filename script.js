const API_BASE_URL = "https://api-ems-bic.quangtriet430.workers.dev";

let currentUser = null;
let globalStages = [];
let currentMatrixData = null;
let filteredMatrixRows = [];
let leaderPOsCache = [];
let productsCache = [];
let historyLogCache = [];
let adminPollingInterval = null;
let leaderPollingInterval = null;
let tempUserForPassChange = null;
let lastPendingDataString = "";

// Xóa toàn bộ bộ nhớ đệm tạm (localStorage cache cũ) để luôn lấy dữ liệu chuẩn 100% từ D1
[
  "ems_edited_products",
  "ems_deleted_products",
  "ems_custom_stages",
  "ems_deleted_stages",
].forEach((k) => localStorage.removeItem(k));

// Danh sách công đoạn mặc định chuẩn của xưởng (chỉ dùng làm fallback khi mất mạng)
const DEFAULT_FACTORY_STAGES = [
  { id: "CAT", stage_name: "Cắt", line_id: "CUTTING" },
  { id: "NHIET_LUYEN", stage_name: "Nhiệt luyện", line_id: "CUTTING" },
  { id: "DO_CUNG", stage_name: "Đo độ cứng", line_id: "CUTTING" },
  { id: "NC1", stage_name: "NC1", line_id: "NC" },
  { id: "NC2", stage_name: "NC2", line_id: "NC" },
  { id: "NC3", stage_name: "NC3", line_id: "NC" },
  { id: "MNC1", stage_name: "MNC1", line_id: "MNC" },
  { id: "MNC2", stage_name: "MNC2", line_id: "MNC" },
  { id: "MNC3", stage_name: "MNC3", line_id: "MNC" },
  { id: "GS", stage_name: "GS", line_id: "GS_GV" },
  { id: "GV", stage_name: "GV", line_id: "GS_GV" },
  { id: "GP", stage_name: "GP", line_id: "GP_GE_GI" },
  { id: "GE", stage_name: "GE", line_id: "GP_GE_GI" },
  { id: "GI", stage_name: "GI", line_id: "GP_GE_GI" },
  { id: "BARRY", stage_name: "Bavia (Barry)", line_id: "BARRY" },
  { id: "XUAT_GCN", stage_name: "Đi GCN", line_id: "ASSY" },
  { id: "NHAN_GCN", stage_name: "Nhận GCN", line_id: "ASSY" },
  { id: "LAP_RAP", stage_name: "Lắp ráp", line_id: "ASSY" },
  { id: "KIEM_TRA", stage_name: "Kiểm tra", line_id: "KENSA" },
  { id: "DONG_THUNG", stage_name: "Đóng thùng", line_id: "ASSY" },
];

const LINE_COLORS = {
  CUTTING: "#ffebee",
  NC: "#e3f2fd",
  MNC: "#e8f5e9",
  GS_GV: "#fff3e0",
  GP_GE_GI: "#f3e5f5",
  BARRY: "#e0f2f1",
  ASSY: "#fffde7",
  KENSA: "#eceff1",
};

// ==========================================
// 1. KHỞI TẠO, ĐĂNG NHẬP & ĐIỀU HƯỚNG
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  setDefaultDates();
  const savedUser = localStorage.getItem("ems_user");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      navigateToRoleScreen();
    } catch (e) {
      localStorage.removeItem("ems_user");
    }
  }
});

document
  .getElementById("login-form")
  .addEventListener("submit", async function (e) {
    e.preventDefault();
    const usernameInput = document
      .getElementById("username")
      .value.toUpperCase()
      .trim();
    const passwordInput = document.getElementById("password").value;
    const errorMsg = document.getElementById("login-error");

    try {
      errorMsg.classList.add("hidden");
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        errorMsg.textContent = data.error || "Sai tài khoản hoặc mật khẩu!";
        errorMsg.classList.remove("hidden");
        return;
      }

      if (data.user.password_hash === "000") {
        tempUserForPassChange = data.user;
        document.getElementById("change-pass-modal").classList.remove("hidden");
        return;
      }

      currentUser = data.user;
      localStorage.setItem("ems_user", JSON.stringify(currentUser));
      navigateToRoleScreen();
    } catch (error) {
      errorMsg.textContent = "Không thể kết nối đến máy chủ API.";
      errorMsg.classList.remove("hidden");
    }
  });

window.submitNewPassword = async function () {
  const newPass = document.getElementById("new-password").value;
  if (newPass.length < 4) return alert("Mật khẩu phải từ 4 ký tự trở lên!");
  try {
    const res = await fetch(`${API_BASE_URL}/api/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: tempUserForPassChange.username,
        new_password: newPass,
      }),
    });
    if (res.ok) {
      alert("Đổi mật khẩu thành công! Chào mừng bạn.");
      document.getElementById("change-pass-modal").classList.add("hidden");
      tempUserForPassChange.password_hash = newPass;
      currentUser = tempUserForPassChange;
      localStorage.setItem("ems_user", JSON.stringify(currentUser));
      navigateToRoleScreen();
    } else {
      alert("Đã xảy ra lỗi khi lưu mật khẩu.");
    }
  } catch (e) {
    alert("Lỗi máy chủ khi đổi mật khẩu.");
  }
};

window.logout = function () {
  currentUser = null;
  localStorage.removeItem("ems_user");
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  if (leaderPollingInterval) clearInterval(leaderPollingInterval);
  document.getElementById("login-form").reset();
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active");
    s.classList.add("hidden");
  });
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("login-screen").classList.add("active");
};

function navigateToRoleScreen() {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active");
    s.classList.add("hidden");
  });
  if (adminPollingInterval) clearInterval(adminPollingInterval);
  if (leaderPollingInterval) clearInterval(leaderPollingInterval);

  const displayName = currentUser.full_name || currentUser.username;

  if (currentUser.role === "ADMIN") {
    document.getElementById("admin-screen").classList.remove("hidden");
    document.getElementById("admin-screen").classList.add("active");
    document.getElementById("admin-name").textContent = displayName;

    loadNGDropdownsThorough().then(() => {
      fetchProductsList();
      fetchMatrixReport();
    });

    switchTab("admin", "tab-matrix");
    adminPollingInterval = setInterval(() => {
      const activeTab = document.querySelector(
        "#admin-screen .tab-content.active",
      );
      if (activeTab && activeTab.id === "tab-matrix") {
        fetchMatrixReport();
      }
    }, 8000);
  } else if (currentUser.role === "LEADER") {
    document.getElementById("leader-screen").classList.remove("hidden");
    document.getElementById("leader-screen").classList.add("active");
    document.getElementById("leader-name").textContent = displayName;

    loadNGDropdownsThorough().then(() => {
      const myStages = globalStages.filter(
        (s) => s.line_id === currentUser.line_id,
      );
      if (myStages.length > 0) {
        document.getElementById("leader-line").textContent = myStages
          .map((s) => s.stage_name)
          .join(", ");
      } else {
        document.getElementById("leader-line").textContent =
          currentUser.line_id;
      }
      switchTab("leader", "tab-wip");
      fetchPendingPOs();
    });

    if (currentUser.line_id === "ASSY") {
      document.getElementById("btn-outsource")?.classList.remove("hidden");
    }

    leaderPollingInterval = setInterval(fetchPendingPOs, 5000);
  }
}

window.switchTab = function (role, tabId, btnElement) {
  const container =
    role === "admin"
      ? document.getElementById("admin-screen")
      : document.getElementById("leader-screen");
  const btnClass =
    role === "admin" ? ".sidebar .tab-btn" : ".tabs-mobile .tab-btn-mobile";
  const tabClass =
    role === "admin"
      ? ".app-body .tab-content"
      : ".content-mobile .tab-content";

  container.querySelectorAll(tabClass).forEach((tab) => {
    tab.classList.remove("active");
    tab.classList.add("hidden");
  });
  container.querySelectorAll(btnClass).forEach((btn) => {
    btn.classList.remove("active");
    if (btn.getAttribute("data-tab") === tabId) {
      btn.classList.add("active");
    }
  });

  if (btnElement) {
    btnElement.classList.add("active");
  }

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.remove("hidden");
    targetTab.classList.add("active");
  }

  if (role === "admin" && tabId === "tab-master") fetchProductsList();
  if (role === "admin" && tabId === "tab-stages") loadNGDropdownsThorough();
  if (role === "admin" && tabId === "tab-matrix") fetchMatrixReport();
  if (role === "admin" && tabId === "tab-po") {
    fetchMatrixReport();
    renderPOManageTable();
  }
  if (role === "admin" && tabId === "tab-ng") {
    loadNGDropdownsThorough();
    renderNGSummaryFromMatrix();
  }
  if (role === "admin" && tabId === "tab-history") fetchHistoryLog();
  if (role === "leader" && tabId === "tab-history-leader") fetchHistoryLog();
};

// ==========================================
// 2. QUẢN LÝ CÔNG ĐOẠN SẢN XUẤT (TRỰC TIẾP D1)
// ==========================================
function getStageNameById(stageId) {
  if (!stageId) return "-";
  const found = globalStages.find(
    (s) => s.id.toUpperCase() === String(stageId).toUpperCase(),
  );
  if (found) return found.stage_name;
  const fallback = DEFAULT_FACTORY_STAGES.find(
    (s) => s.id.toUpperCase() === String(stageId).toUpperCase(),
  );
  return fallback ? fallback.stage_name : stageId;
}

async function loadNGDropdownsThorough() {
  try {
    const stageRes = await fetch(
      `${API_BASE_URL}/api/stages?t=${Date.now()}`,
      { cache: "no-store" },
    );
    const stageData = await stageRes.json();
    globalStages =
      Array.isArray(stageData.data) && stageData.data.length > 0
        ? stageData.data
        : [...DEFAULT_FACTORY_STAGES];
  } catch (e) {
    if (globalStages.length === 0) {
      globalStages = [...DEFAULT_FACTORY_STAGES];
    }
  }

  refreshAllStageSelects();
  renderStagesTable();

  try {
    const ngRes = await fetch(`${API_BASE_URL}/api/ng/list?t=${Date.now()}`, {
      cache: "no-store",
    });
    const ngData = await ngRes.json();
    const poSelect = document.getElementById("ng-po-select");
    if (poSelect) {
      let poOpts = '<option value="">-- Chọn Lô / PO có NG --</option>';
      if (ngData.data && ngData.data.length > 0) {
        ngData.data.forEach((po) => {
          const stName = po.stage_id
            ? ` tại ${getStageNameById(po.stage_id)}`
            : "";
          poOpts += `<option value="${po.lot_number}" data-stage="${po.stage_id || ""}" data-qty="${po.ng_qty || ""}">${po.lot_number} [${po.product_code}] - Lỗi: ${po.ng_qty}${stName}</option>`;
        });
      } else if (currentMatrixData && currentMatrixData.rows) {
        const ngRows = currentMatrixData.rows.filter((r) => r.total_ng > 0);
        if (ngRows.length > 0) {
          ngRows.forEach((r) => {
            poOpts += `<option value="${r.po_number}">${r.po_number} [${r.product_code}] - Tổng NG: ${r.total_ng}</option>`;
          });
        } else {
          poOpts = '<option value="">-- Hiện không có hàng NG nào --</option>';
        }
      } else {
        poOpts = '<option value="">-- Hiện không có hàng NG nào --</option>';
      }
      poSelect.innerHTML = poOpts;
    }
  } catch (e) {
    console.error("Lỗi nạp danh sách NG:", e);
  }
}

function refreshAllStageSelects() {
  let stageOpts = '<option value="">-- Chọn công đoạn --</option>';
  globalStages.forEach((col) => {
    stageOpts += `<option value="${col.id}">${col.stage_name} (${col.id})</option>`;
  });

  if (document.getElementById("ng-current-stage"))
    document.getElementById("ng-current-stage").innerHTML = stageOpts;
  if (document.getElementById("ng-return-stage"))
    document.getElementById("ng-return-stage").innerHTML = stageOpts;

  document.querySelectorAll(".routing-stage-select").forEach((sel) => {
    const currentVal = sel.value;
    sel.innerHTML = stageOpts;
    sel.value = currentVal;
  });

  if (document.getElementById("stage-count")) {
    document.getElementById("stage-count").textContent = globalStages.length;
  }
}

function renderStagesTable() {
  const container = document.getElementById("stage-list-container");
  if (!container) return;

  if (document.getElementById("stage-count")) {
    document.getElementById("stage-count").textContent = globalStages.length;
  }

  if (globalStages.length === 0) {
    container.innerHTML = `<p style="padding:14px; text-align:center;">Chưa có công đoạn nào.</p>`;
    return;
  }

  let html = `<table class="matrix-table">
    <thead>
      <tr>
        <th style="width:50px;">STT</th>
        <th>Mã Công Đoạn</th>
        <th>Tên Hiển Thị</th>
        <th>Line Quản Lý (Leader Điều Phối)</th>
        <th style="width:175px;">Thao Tác</th>
      </tr>
    </thead>
    <tbody>`;

  globalStages.forEach((stg, idx) => {
    const bg = LINE_COLORS[stg.line_id] || "#f8fafc";
    html += `<tr>
      <td>${idx + 1}</td>
      <td style="font-weight:bold; color:var(--navy);">${stg.id}</td>
      <td style="text-align:left; font-weight:600;">${stg.stage_name}</td>
      <td><span style="background:${bg}; padding:3px 10px; border-radius:4px; border:1px solid #cbd5e0; font-weight:600;">Line: ${stg.line_id || "-"}</span></td>
      <td>
        <div class="action-btn-group">
          <button type="button" class="btn-icon" title="Lên" onclick="moveStageOrder(${idx}, -1)" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="btn-icon" title="Xuống" onclick="moveStageOrder(${idx}, 1)" ${idx === globalStages.length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" class="btn-icon btn-icon-edit" onclick="startEditStage('${stg.id}')">Sửa</button>
          <button type="button" class="btn-icon btn-icon-del" onclick="deleteStage('${stg.id}')">Xóa</button>
        </div>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

window.moveStageOrder = async function (index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= globalStages.length) return;
  const temp = globalStages[index];
  globalStages[index] = globalStages[targetIndex];
  globalStages[targetIndex] = temp;
  refreshAllStageSelects();
  renderStagesTable();
  renderMasterTable(productsCache);
  if (currentMatrixData) {
    currentMatrixData.columns = [...globalStages];
    filterMatrix();
  }

  try {
    await fetch(`${API_BASE_URL}/api/stages/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordered_ids: globalStages.map((s) => s.id),
      }),
    });
  } catch (e) {}
};

window.startEditStage = function (stageId) {
  const stg = globalStages.find((s) => s.id === stageId);
  if (!stg) return;
  document.getElementById("stg-edit-mode").value = "edit";
  document.getElementById("stg-original-id").value = stg.id;
  const idInput = document.getElementById("stg-id");
  idInput.value = stg.id;
  idInput.readOnly = true;
  idInput.style.backgroundColor = "#edf2f7";
  document.getElementById("stg-name").value = stg.stage_name;
  document.getElementById("stg-line").value = stg.line_id || "";
  document.getElementById("stage-form-title").textContent =
    `Sửa Công Đoạn: ${stg.id}`;
  document.getElementById("btn-save-stage").textContent = "Cập Nhật Công Đoạn";
  document.getElementById("btn-cancel-stage-edit").classList.remove("hidden");
  document.getElementById("stage-edit-badge").classList.remove("hidden");
};

window.resetStageForm = function () {
  const form = document.getElementById("form-stage-manager");
  if (form) form.reset();
  document.getElementById("stg-edit-mode").value = "create";
  document.getElementById("stg-original-id").value = "";
  const idInput = document.getElementById("stg-id");
  if (idInput) {
    idInput.readOnly = false;
    idInput.style.backgroundColor = "#fff";
  }
  document.getElementById("stage-form-title").textContent =
    "Thêm / Sửa Công Đoạn";
  document.getElementById("btn-save-stage").textContent = "+ Lưu Công Đoạn";
  document.getElementById("btn-cancel-stage-edit").classList.add("hidden");
  document.getElementById("stage-edit-badge").classList.add("hidden");
};

window.deleteStage = async function (stageId) {
  const stg = globalStages.find((s) => s.id === stageId);
  if (!stg) return;

  const usedInProducts = productsCache.filter((p) => {
    try {
      const map = JSON.parse(p.routing_map || "[]");
      return map.some((step) => step.stage_id === stageId);
    } catch (e) {
      return false;
    }
  });

  let warnMsg = `Bạn có chắc chắn muốn XÓA công đoạn "${stg.stage_name} (${stg.id})" không?`;
  if (usedInProducts.length > 0) {
    warnMsg =
      `CẢNH BÁO: Công đoạn "${stg.stage_name} (${stg.id})" đang có trong lộ trình của ${usedInProducts.length} mã hàng (${usedInProducts.map((p) => p.product_code).join(", ")}).\n\n` +
      `Bạn vẫn muốn xóa công đoạn này khỏi danh mục?`;
  }
  if (!confirm(warnMsg)) return;

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/stages/${encodeURIComponent(stageId)}`,
      {
        method: "DELETE",
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return alert("Không thể xóa: " + (data.error || "Lỗi từ máy chủ D1"));
    }
    await loadNGDropdownsThorough();
    if (currentMatrixData) {
      currentMatrixData.columns = [...globalStages];
      filterMatrix();
    }
    alert(`Đã xóa công đoạn ${stg.stage_name} (${stg.id}) trên D1.`);
  } catch (e) {
    alert("Lỗi kết nối API khi xóa công đoạn!");
  }
};

const formStageManager = document.getElementById("form-stage-manager");
if (formStageManager) {
  formStageManager.addEventListener("submit", async function (e) {
    e.preventDefault();
    const mode = document.getElementById("stg-edit-mode").value;
    const stgId = document
      .getElementById("stg-id")
      .value.trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
    const stgName = document.getElementById("stg-name").value.trim();
    const stgLine = document
      .getElementById("stg-line")
      .value.trim()
      .toUpperCase();

    if (!stgId || !stgName || !stgLine) {
      return alert("Vui lòng nhập đầy đủ Mã, Tên công đoạn và Line quản lý!");
    }

    try {
      let res;
      if (mode === "create") {
        if (globalStages.some((s) => s.id.toUpperCase() === stgId)) {
          return alert(
            `Mã công đoạn "${stgId}" đã tồn tại! Hãy bấm nút Sửa ở bảng bên phải nếu muốn đổi tên hoặc đổi Line.`,
          );
        }
        res = await fetch(`${API_BASE_URL}/api/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: stgId,
            stage_name: stgName,
            line_id: stgLine,
          }),
        });
      } else {
        res = await fetch(
          `${API_BASE_URL}/api/stages/${encodeURIComponent(stgId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: stgId,
              stage_name: stgName,
              line_id: stgLine,
            }),
          },
        );
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return alert("Lỗi lưu công đoạn: " + (data.error || "API từ chối"));
      }

      alert(
        mode === "create"
          ? `Đã thêm công đoạn mới: ${stgName} (${stgId}) - Line: ${stgLine}`
          : `Đã cập nhật công đoạn: ${stgName} (${stgId}) ➔ Line: ${stgLine}`,
      );
      resetStageForm();
      await loadNGDropdownsThorough();
      renderMasterTable(productsCache);
      if (currentMatrixData) {
        currentMatrixData.columns = [...globalStages];
        filterMatrix();
      }
    } catch (err) {
      alert("Lỗi kết nối API khi lưu công đoạn!");
    }
  });
}

// ==========================================
// 3. QUẢN LÝ MÃ HÀNG & LỘ TRÌNH (ĐỒNG BỘ TRỰC TIẾP D1)
// ==========================================
window.addRoutingStep = function (selectedStageId = "") {
  const container = document.getElementById("routing-builder");
  if (!container) return;
  const stepDiv = document.createElement("div");
  stepDiv.className = "routing-step-row";
  stepDiv.innerHTML = `
    <span class="step-label">Bước:</span>
    <select class="routing-stage-select" required style="padding: 7px 10px; flex: 1;">
      <option value="">-- Chọn công đoạn --</option>
      ${globalStages.map((s) => `<option value="${s.id}" ${s.id === selectedStageId ? "selected" : ""}>${s.stage_name} (${s.id})</option>`).join("")}
    </select>
    <button type="button" class="btn-icon" title="Chuyển lên" onclick="moveRoutingStep(this, -1)">▲</button>
    <button type="button" class="btn-icon" title="Chuyển xuống" onclick="moveRoutingStep(this, 1)">▼</button>
    <button type="button" class="btn-icon btn-icon-del" title="Xóa bước này" onclick="removeRoutingStep(this)">✕</button>
  `;
  container.appendChild(stepDiv);
  reindexRoutingSteps();
};

window.removeRoutingStep = function (btn) {
  btn.parentElement.remove();
  reindexRoutingSteps();
};

window.moveRoutingStep = function (btn, direction) {
  const row = btn.parentElement;
  const container = document.getElementById("routing-builder");
  if (direction === -1 && row.previousElementSibling) {
    container.insertBefore(row, row.previousElementSibling);
  } else if (direction === 1 && row.nextElementSibling) {
    container.insertBefore(row.nextElementSibling, row);
  }
  reindexRoutingSteps();
};

function reindexRoutingSteps() {
  const rows = document.querySelectorAll("#routing-builder .routing-step-row");
  rows.forEach((row, index) => {
    const label = row.querySelector(".step-label");
    if (label) label.textContent = `Bước ${index + 1}:`;
  });
}

const formCreateProduct = document.getElementById("form-create-product");
if (formCreateProduct) {
  formCreateProduct.addEventListener("submit", async function (e) {
    e.preventDefault();
    const editMode = document.getElementById("md-edit-mode").value;
    const productCode = document
      .getElementById("md-product-code")
      .value.trim()
      .toUpperCase();
    const productName = document.getElementById("md-product-name").value.trim();

    const routingMap = [];
    document.querySelectorAll(".routing-stage-select").forEach((sel, idx) => {
      if (sel.value) routingMap.push({ order: idx + 1, stage_id: sel.value });
    });

    if (routingMap.length === 0) {
      return alert("Vui lòng thêm ít nhất 1 công đoạn vào lộ trình sản xuất!");
    }

    const payload = {
      product_code: productCode,
      product_name: productName,
      routing_map: routingMap,
    };

    try {
      let response;
      if (editMode === "edit") {
        response = await fetch(
          `${API_BASE_URL}/api/products/${encodeURIComponent(productCode)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) {
          response = await fetch(`${API_BASE_URL}/api/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      } else {
        response = await fetch(`${API_BASE_URL}/api/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        return alert(
          "Lỗi khi lưu mã hàng vào D1: " + (resData.error || "Không xác định"),
        );
      }

      alert(
        editMode === "edit"
          ? `Đã cập nhật Mã hàng "${productCode}" trên D1 thành công!`
          : `Khởi tạo Mã hàng "${productCode}" trên D1 thành công!`,
      );

      resetProductForm();
      await fetchProductsList();
    } catch (error) {
      alert("Lỗi kết nối API khi lưu mã hàng!");
    }
  });
}

window.startEditProduct = function (productCode) {
  const p = productsCache.find(
    (item) =>
      String(item.product_code).toUpperCase() ===
      String(productCode).toUpperCase(),
  );
  if (!p) return;

  document.getElementById("md-edit-mode").value = "edit";
  document.getElementById("md-original-code").value = p.product_code;

  const codeInput = document.getElementById("md-product-code");
  codeInput.value = p.product_code;
  codeInput.readOnly = true;
  codeInput.style.backgroundColor = "#edf2f7";

  document.getElementById("md-product-name").value = p.product_name || "";
  document.getElementById("product-form-title").textContent =
    `Sửa Mã Hàng: ${p.product_code}`;
  document.getElementById("product-edit-badge").classList.remove("hidden");
  document.getElementById("btn-save-product").textContent = "Cập Nhật Mã Hàng";
  document
    .getElementById("btn-cancel-product-edit")
    .classList.remove("hidden");

  const builder = document.getElementById("routing-builder");
  builder.innerHTML = "";

  try {
    const steps =
      typeof p.routing_map === "string"
        ? JSON.parse(p.routing_map)
        : p.routing_map || [];
    steps
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .forEach((step) => {
        addRoutingStep(step.stage_id);
      });
  } catch (e) {
    addRoutingStep();
  }

  document
    .getElementById("form-create-product")
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.resetProductForm = function () {
  if (formCreateProduct) formCreateProduct.reset();
  document.getElementById("md-edit-mode").value = "create";
  document.getElementById("md-original-code").value = "";
  const codeInput = document.getElementById("md-product-code");
  if (codeInput) {
    codeInput.readOnly = false;
    codeInput.style.backgroundColor = "#fff";
  }
  document.getElementById("product-form-title").textContent =
    "Tạo Mã Hàng & Lộ Trình";
  document.getElementById("product-edit-badge").classList.add("hidden");
  document.getElementById("btn-save-product").textContent = "Lưu Mã Hàng";
  document.getElementById("btn-cancel-product-edit").classList.add("hidden");
  document.getElementById("routing-builder").innerHTML = "";
};

window.deleteProduct = async function (productCode) {
  const codeUpper = String(productCode).toUpperCase();
  if (
    !confirm(
      `Bạn có chắc chắn muốn XÓA mã hàng "${codeUpper}" khỏi cơ sở dữ liệu D1 không?`,
    )
  ) {
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/products/${encodeURIComponent(codeUpper)}`,
      {
        method: "DELETE",
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return alert(
        "Không thể xóa mã hàng: " +
          (data.error ||
            "Vui lòng kiểm tra xem bạn đã Deploy bản worker.txt mới nhất lên Cloudflare chưa."),
      );
    }

    if (document.getElementById("md-original-code").value === codeUpper) {
      resetProductForm();
    }

    await fetchProductsList();
    alert(`Đã xóa mã hàng "${codeUpper}" khỏi D1 thành công!`);
  } catch (e) {
    alert("Lỗi kết nối API khi xóa mã hàng!");
  }
};

async function fetchProductsList() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/products?t=${Date.now()}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    productsCache = Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    console.error("Lỗi tải danh sách mã hàng:", e);
  }
  updateProductAutocompleteLists();
  filterMasterData();
}

function updateProductAutocompleteLists() {
  const optionsHTML = productsCache
    .map((p) => `<option value="${p.product_code}">${p.product_name}</option>`)
    .join("");
  if (document.getElementById("product-suggestions")) {
    document.getElementById("product-suggestions").innerHTML = optionsHTML;
  }
  if (document.getElementById("matrix-product-suggest")) {
    document.getElementById("matrix-product-suggest").innerHTML = optionsHTML;
  }
  if (document.getElementById("master-count")) {
    document.getElementById("master-count").textContent = productsCache.length;
  }
}

function renderMasterTable(data) {
  const container = document.getElementById("master-list-container");
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `<p style="padding: 16px; text-align:center; color:var(--muted);">Không tìm thấy mã hàng nào trên D1.</p>`;
    return;
  }

  let html = `<table class="matrix-table" style="font-size: 13px;">
    <thead>
      <tr>
        <th>Mã Hàng</th>
        <th>Tên Sản Phẩm</th>
        <th>Lộ Trình Sản Xuất (Các Công Đoạn)</th>
        <th style="width: 115px;">Thao Tác</th>
      </tr>
    </thead>
    <tbody>`;

  data.forEach((p) => {
    let routingText = "";
    try {
      const steps =
        typeof p.routing_map === "string"
          ? JSON.parse(p.routing_map)
          : p.routing_map || [];
      routingText = steps
        .map((step, idx) => {
          const stName = getStageNameById(step.stage_id);
          return `<span class="route-pill">${idx + 1}. ${stName}</span>`;
        })
        .join(` <span style="color:#94a3b8;">➔</span> `);
    } catch (e) {
      routingText = `<span class="text-error">Lỗi lộ trình</span>`;
    }

    html += `<tr>
      <td style="font-weight:bold; color:var(--navy);">${p.product_code}</td>
      <td>${p.product_name || "-"}</td>
      <td>${routingText}</td>
      <td style="text-align:center;">
        <div class="action-btn-group">
          <button type="button" class="btn-icon btn-icon-edit" onclick="startEditProduct('${p.product_code}')">Sửa</button>
          <button type="button" class="btn-icon btn-icon-del" onclick="deleteProduct('${p.product_code}')">Xóa</button>
        </div>
      </td>
    </tr>`;
  });

  container.innerHTML = html + `</tbody></table>`;
}

window.filterMasterData = function () {
  const val = (document.getElementById("search-master")?.value || "")
    .toLowerCase()
    .trim();
  if (!val) {
    renderMasterTable(productsCache);
    return;
  }
  renderMasterTable(
    productsCache.filter((p) => {
      const codeMatch = (p.product_code || "").toLowerCase().includes(val);
      const nameMatch = (p.product_name || "").toLowerCase().includes(val);
      const routeMatch = (p.routing_map || "").toLowerCase().includes(val);
      return codeMatch || nameMatch || routeMatch;
    }),
  );
};

// ==========================================
// 4. QUẢN LÝ LOT / PO & XỬ LÝ HÀNG LỖI (NG)
// ==========================================
window.previewLotSplit = function () {
  const prefix = (document.getElementById("po-prefix")?.value || "")
    .trim()
    .toUpperCase();
  const totalQty = parseInt(document.getElementById("po-total")?.value) || 0;
  const splitQty = parseInt(document.getElementById("po-split")?.value) || 0;
  const previewBox = document.getElementById("po-split-preview");
  if (!previewBox) return;

  if (!prefix || totalQty <= 0 || splitQty <= 0 || splitQty > totalQty) {
    previewBox.classList.add("hidden");
    return;
  }

  const lots = [];
  let remaining = totalQty;
  let counter = 1;
  while (remaining > 0 && counter <= 200) {
    const q = remaining > splitQty ? splitQty : remaining;
    lots.push(`${prefix}-${String(counter).padStart(2, "0")} (${q} cái)`);
    remaining -= q;
    counter++;
  }

  previewBox.classList.remove("hidden");
  previewBox.innerHTML = `<strong>Dự kiến chẻ thành ${lots.length} LOT:</strong> ${lots.slice(0, 8).join(", ")}${lots.length > 8 ? ` ... (+${lots.length - 8} LOT)` : ""}`;
};

const formCreatePO = document.getElementById("form-create-po");
if (formCreatePO) {
  formCreatePO.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!currentUser) return;

    const prefix = document
      .getElementById("po-prefix")
      .value.trim()
      .toUpperCase();
    const productCode = document
      .getElementById("product-code")
      .value.trim()
      .toUpperCase();
    const poDate = document.getElementById("po-date").value;
    const totalQty = parseInt(document.getElementById("po-total").value);
    const splitQty = parseInt(document.getElementById("po-split").value);

    if (splitQty > totalQty) {
      alert("Kích thước 1 LOT không được lớn hơn Tổng sản lượng!");
      return;
    }

    const lots = [];
    let remaining = totalQty;
    let counter = 1;

    while (remaining > 0) {
      const qtyForThisLot = remaining > splitQty ? splitQty : remaining;
      const lotNumber = `${prefix}-${String(counter).padStart(2, "0")}`;
      lots.push({ po_number: lotNumber, qty: qtyForThisLot });
      remaining -= qtyForThisLot;
      counter++;
    }

    const confirmMsg = `Hệ thống sẽ chẻ thành ${lots.length} LOT (${lots.map((l) => l.qty).join(", ")}).\nBạn có chắc chắn muốn cấp phát sản xuất?`;
    if (!confirm(confirmMsg)) return;

    let successCount = 0;
    let errorMessages = [];

    for (const lot of lots) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/po/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            po_number: lot.po_number,
            product_code: productCode,
            production_date: poDate,
            total_qty: lot.qty,
            user_id: currentUser.id,
          }),
        });
        const data = await response.json();

        if (response.ok) {
          successCount++;
        } else {
          errorMessages.push(`Lỗi LOT ${lot.po_number}: ${data.error}`);
        }
      } catch (err) {
        errorMessages.push(`Lỗi kết nối khi tạo LOT ${lot.po_number}`);
      }
    }

    if (errorMessages.length > 0) {
      alert(
        `Đã tạo được ${successCount}/${lots.length} LOT.\nDanh sách lỗi:\n` +
          errorMessages.join("\n"),
      );
    } else {
      alert(
        `Đã cấp phát THÀNH CÔNG ${successCount}/${lots.length} LOT vào dây chuyền!`,
      );
      formCreatePO.reset();
      document.getElementById("po-split-preview")?.classList.add("hidden");
      setDefaultDates();
    }

    await fetchMatrixReport();
    renderPOManageTable();
  });
}

window.renderPOManageTable = function () {
  const container = document.getElementById("po-manage-container");
  if (!container) return;
  if (!currentMatrixData || !currentMatrixData.rows) {
    container.innerHTML = `<p style="padding:12px;">Đang tải danh sách LOT...</p>`;
    return;
  }

  const kw = (document.getElementById("search-po-manage")?.value || "")
    .trim()
    .toUpperCase();
  const rows = currentMatrixData.rows.filter(
    (r) =>
      !kw ||
      (r.po_number || "").toUpperCase().includes(kw) ||
      (r.product_code || "").toUpperCase().includes(kw),
  );

  if (rows.length === 0) {
    container.innerHTML = `<p style="padding:14px; text-align:center;">Không có LOT nào khớp tìm kiếm.</p>`;
    return;
  }

  let html = `<table class="matrix-table">
    <thead>
      <tr>
        <th>Ngày</th>
        <th>Số LOT</th>
        <th>Mã Hàng</th>
        <th>Tổng SL</th>
        <th>Đang Chạy (WIP)</th>
        <th>Tổng NG</th>
        <th>Vào KHO</th>
      </tr>
    </thead>
    <tbody>`;

  rows.forEach((r) => {
    html += `<tr>
      <td>${formatDateVN(r.production_date)}</td>
      <td style="font-weight:bold; color:var(--navy);">${r.po_number}</td>
      <td>${r.product_code}</td>
      <td style="font-weight:bold;">${r.total_qty}</td>
      <td style="color:#0284c7; font-weight:600;">${r.wip_qty}</td>
      <td style="color:var(--maroon); font-weight:bold;">${r.total_ng > 0 ? r.total_ng : "-"}</td>
      <td style="color:var(--green); font-weight:bold;">${r.finished_qty > 0 ? r.finished_qty : "-"}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
};

window.toggleReworkStage = function () {
  const action = document.getElementById("ng-action")?.value;
  const groupReturn = document.getElementById("group-return-stage");
  const returnSelect = document.getElementById("ng-return-stage");
  if (!groupReturn || !returnSelect) return;

  if (action === "REWORK") {
    groupReturn.classList.remove("hidden");
    returnSelect.setAttribute("required", "required");
  } else {
    groupReturn.classList.add("hidden");
    returnSelect.removeAttribute("required");
    returnSelect.value = "";
  }
};

window.onSelectNGLot = function () {
  const select = document.getElementById("ng-po-select");
  if (!select || !select.value) return;
  const lotNo = select.value;

  if (currentMatrixData && currentMatrixData.rows) {
    const row = currentMatrixData.rows.find((r) => r.po_number === lotNo);
    if (row) {
      for (const col of currentMatrixData.columns) {
        const stg = row.stages[col.id];
        if (stg && stg.ng > 0) {
          document.getElementById("ng-current-stage").value = col.id;
          document.getElementById("ng-qty").value = stg.ng;
          document.getElementById("ng-qty").max = stg.ng;
          break;
        }
      }
    }
  }
};

window.prefillNGForm = function (lotNo, stageId, ngQty) {
  const poSelect = document.getElementById("ng-po-select");
  if (poSelect) {
    if (!Array.from(poSelect.options).some((opt) => opt.value === lotNo)) {
      const opt = document.createElement("option");
      opt.value = lotNo;
      opt.textContent = `${lotNo} - Lỗi: ${ngQty}`;
      poSelect.appendChild(opt);
    }
    poSelect.value = lotNo;
  }
  if (document.getElementById("ng-current-stage")) {
    document.getElementById("ng-current-stage").value = stageId;
  }
  if (document.getElementById("ng-qty")) {
    document.getElementById("ng-qty").value = ngQty;
  }
};

function renderNGSummaryFromMatrix() {
  const container = document.getElementById("ng-summary-list-container");
  if (!container) return;
  if (!currentMatrixData || !currentMatrixData.rows) {
    container.innerHTML = `<p style="padding:12px;">Đang tải dữ liệu...</p>`;
    return;
  }

  const ngItems = [];
  currentMatrixData.rows.forEach((r) => {
    currentMatrixData.columns.forEach((col) => {
      const stg = r.stages[col.id];
      if (stg && stg.ng > 0) {
        ngItems.push({
          production_date: r.production_date,
          po_number: r.po_number,
          product_code: r.product_code,
          stage_id: col.id,
          stage_name: col.stage_name,
          ng_qty: stg.ng,
        });
      }
    });
  });

  if (ngItems.length === 0) {
    container.innerHTML = `<p style="padding:20px; text-align:center; color:var(--green); font-weight:600;">Hiện tại không có LOT nào tồn đọng hàng NG chưa xử lý.</p>`;
    return;
  }

  let html = `<table class="matrix-table">
    <thead>
      <tr>
        <th>Ngày</th>
        <th>Số LOT</th>
        <th>Mã Hàng</th>
        <th>Tại Công Đoạn</th>
        <th>SL NG</th>
        <th>Chọn</th>
      </tr>
    </thead>
    <tbody>`;

  ngItems.forEach((item) => {
    html += `<tr style="cursor:pointer;" onclick="prefillNGForm('${item.po_number}', '${item.stage_id}', ${item.ng_qty})">
      <td>${formatDateVN(item.production_date)}</td>
      <td style="font-weight:bold; color:var(--navy);">${item.po_number}</td>
      <td>${item.product_code}</td>
      <td style="font-weight:600;">${item.stage_name}</td>
      <td><span class="badge-ng">${item.ng_qty}</span></td>
      <td><button type="button" class="btn-icon btn-icon-edit">Xử lý</button></td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

const formResolveNG = document.getElementById("form-resolve-ng");
if (formResolveNG) {
  formResolveNG.addEventListener("submit", async function (e) {
    e.preventDefault();
    const lotNumber = document.getElementById("ng-po-select").value;
    const currentStage = document.getElementById("ng-current-stage").value;
    const ngQty = parseInt(document.getElementById("ng-qty").value) || 0;
    const action = document.getElementById("ng-action").value;
    const returnStage = document.getElementById("ng-return-stage").value;

    if (!lotNumber || !currentStage || ngQty <= 0) {
      return alert("Vui lòng chọn đầy đủ LOT, Công đoạn có NG và Số lượng!");
    }
    if (action === "REWORK" && !returnStage) {
      return alert("Vui lòng chọn công đoạn trả về để làm lại (REWORK)!");
    }

    const actionText =
      action === "SCRAP"
        ? `BÁO HỦY (SCRAP) ${ngQty} sản phẩm`
        : `CHUYỂN LÀM LẠI (REWORK) ${ngQty} sản phẩm về công đoạn ${getStageNameById(returnStage)}`;

    if (
      !confirm(
        `Xác nhận xử lý NG cho LOT ${lotNumber} tại ${getStageNameById(currentStage)}:\n➔ ${actionText}?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ng/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_number: lotNumber,
          po_id: lotNumber,
          from_stage: currentStage,
          current_stage: currentStage,
          qty: ngQty,
          ng_qty: ngQty,
          action: action,
          return_stage: action === "REWORK" ? returnStage : null,
          user_id: currentUser?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("Đã cập nhật xử lý hàng NG thành công!");
        formResolveNG.reset();
        toggleReworkStage();
        await fetchMatrixReport();
        await loadNGDropdownsThorough();
        renderNGSummaryFromMatrix();
      } else {
        alert("Lỗi khi xử lý NG: " + (data.error || "API chưa phản hồi"));
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ API khi xử lý hàng NG!");
    }
  });
}

// ==========================================
// 5. BÁO CÁO MATRIX, TỔNG NG & XUẤT EXCEL CHUẨN
// ==========================================
function formatDateVN(dateStr) {
  if (!dateStr) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

async function fetchMatrixReport() {
  if (!currentUser || currentUser.role !== "ADMIN") return;
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/dashboard/matrix?t=${Date.now()}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!data.matrix) return;

    const columns = globalStages;
    const rows = data.matrix.map((row) => {
      const stages = {};
      let totalNgAcrossStages = 0;
      let totalWipAcrossStages = 0;
      const ngBreakdownList = [];

      columns.forEach((c) => {
        const colLower = c.id.toLowerCase();
        const goodQty = Number(row[`qty_${colLower}`]) || 0;
        const ngQty = Number(row[`ng_${colLower}`]) || 0;
        stages[c.id] = {
          good: goodQty,
          ng: ngQty,
          date: row[`date_${colLower}`],
        };
        totalWipAcrossStages += goodQty;
        totalNgAcrossStages += ngQty;
        if (ngQty > 0) {
          ngBreakdownList.push(`${c.stage_name}: ${ngQty}`);
        }
      });

      const scrapQty = Number(row.qty_scrap || 0);
      if (scrapQty > 0) {
        ngBreakdownList.push(`Đã hủy (SCRAP): ${scrapQty}`);
      }
      const apiTotalNg = Number(row.total_ng || row.qty_ng_total || 0);
      const finalTotalNg = Math.max(totalNgAcrossStages + scrapQty, apiTotalNg);

      return {
        production_date: row.production_date || "",
        po_number: row.lot_number || "",
        product_code: row.product_code || "",
        total_qty: Number(row.total_qty) || 0,
        finished_qty: Number(row.qty_done) || 0,
        wip_qty: totalWipAcrossStages,
        total_ng: finalTotalNg,
        ng_breakdown: ngBreakdownList.join(", "),
        stages,
      };
    });

    currentMatrixData = { columns, rows };
    filterMatrix();
    renderPOManageTable();
    renderNGSummaryFromMatrix();
  } catch (error) {
    console.error("Lỗi tải bảng Matrix:", error);
  }
}

window.setQuickDateFilter = function (mode) {
  const fromEl = document.getElementById("search-date-from");
  const toEl = document.getElementById("search-date-to");
  if (!fromEl || !toEl) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (mode === "TODAY") {
    fromEl.value = todayStr;
    toEl.value = todayStr;
  } else if (mode === "7DAYS") {
    const past = new Date(now);
    past.setDate(now.getDate() - 6);
    fromEl.value = past.toISOString().split("T")[0];
    toEl.value = todayStr;
  } else if (mode === "MONTH") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const tzOffset = firstDay.getTimezoneOffset() * 60000;
    fromEl.value = new Date(firstDay - tzOffset).toISOString().split("T")[0];
    toEl.value = todayStr;
  } else {
    fromEl.value = "";
    toEl.value = "";
  }
  filterMatrix();
};

window.clearMatrixFilters = function () {
  if (document.getElementById("search-date-from"))
    document.getElementById("search-date-from").value = "";
  if (document.getElementById("search-date-to"))
    document.getElementById("search-date-to").value = "";
  if (document.getElementById("search-code"))
    document.getElementById("search-code").value = "";
  if (document.getElementById("search-lot"))
    document.getElementById("search-lot").value = "";
  if (document.getElementById("search-status"))
    document.getElementById("search-status").value = "ALL";
  filterMatrix();
};

window.filterMatrix = function () {
  if (!currentMatrixData) return;
  const dateFrom = document.getElementById("search-date-from")?.value || "";
  const dateTo = document.getElementById("search-date-to")?.value || "";
  const lotVal = (document.getElementById("search-lot")?.value || "")
    .trim()
    .toUpperCase();
  const codeVal = (document.getElementById("search-code")?.value || "")
    .trim()
    .toUpperCase();
  const statusVal = document.getElementById("search-status")?.value || "ALL";

  filteredMatrixRows = currentMatrixData.rows.filter((r) => {
    let matchDate = true;
    if (dateFrom && r.production_date && r.production_date < dateFrom) {
      matchDate = false;
    }
    if (dateTo && r.production_date && r.production_date > dateTo) {
      matchDate = false;
    }
    if ((dateFrom || dateTo) && !r.production_date) {
      matchDate = false;
    }

    const matchLot =
      !lotVal || (r.po_number || "").toUpperCase().includes(lotVal);
    const matchCode =
      !codeVal || (r.product_code || "").toUpperCase().includes(codeVal);

    let matchStatus = true;
    if (statusVal === "WIP") {
      matchStatus = r.wip_qty > 0;
    } else if (statusVal === "HAS_NG") {
      matchStatus = r.total_ng > 0;
    } else if (statusVal === "DONE") {
      matchStatus = r.finished_qty > 0 && r.wip_qty === 0;
    }

    return matchDate && matchLot && matchCode && matchStatus;
  });

  renderMatrixKPIs(filteredMatrixRows);
  renderMatrixTable(filteredMatrixRows);
};

function renderMatrixKPIs(rows) {
  const kpiBar = document.getElementById("matrix-kpi-bar");
  const breakdownBar = document.getElementById("stage-ng-breakdown");
  if (!kpiBar || !currentMatrixData) return;

  const totalLots = rows.length;
  let sumTotalQty = 0;
  let sumWipQty = 0;
  let sumDoneQty = 0;
  let sumTotalNG = 0;
  const stageNgTotals = {};

  currentMatrixData.columns.forEach((c) => {
    stageNgTotals[c.id] = { name: c.stage_name, ng: 0 };
  });

  rows.forEach((r) => {
    sumTotalQty += r.total_qty;
    sumWipQty += r.wip_qty;
    sumDoneQty += r.finished_qty;
    sumTotalNG += r.total_ng;
    currentMatrixData.columns.forEach((c) => {
      const ngVal = r.stages[c.id]?.ng || 0;
      stageNgTotals[c.id].ng += ngVal;
    });
  });

  const ngRate =
    sumTotalQty > 0 ? ((sumTotalNG / sumTotalQty) * 100).toFixed(2) : "0.00";

  kpiBar.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Số LOT hiển thị</div>
      <div class="kpi-value">${totalLots.toLocaleString("vi-VN")} <small>LOT</small></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tổng SL Cấp Phát</div>
      <div class="kpi-value">${sumTotalQty.toLocaleString("vi-VN")}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Đang Chạy (Tồn WIP)</div>
      <div class="kpi-value" style="color:#0284c7;">${sumWipQty.toLocaleString("vi-VN")}</div>
    </div>
    <div class="kpi-card kpi-card-ng">
      <div class="kpi-label">Tổng Hàng NG (Toàn Công Đoạn)</div>
      <div class="kpi-value" style="color:var(--maroon);">
        ${sumTotalNG.toLocaleString("vi-VN")}
        <span class="kpi-sub-badge">${ngRate}%</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Đã Nhập KHO (Hoàn Thành)</div>
      <div class="kpi-value" style="color:var(--green);">${sumDoneQty.toLocaleString("vi-VN")}</div>
    </div>
  `;

  if (breakdownBar) {
    const activeNgStages = Object.values(stageNgTotals).filter(
      (item) => item.ng > 0,
    );
    if (activeNgStages.length > 0) {
      breakdownBar.classList.remove("hidden");
      breakdownBar.innerHTML =
        `<strong>Chi tiết Hàng NG theo công đoạn:</strong> ` +
        activeNgStages
          .map(
            (st) =>
              `<span class="ng-stage-chip">${st.name}: <strong>${st.ng}</strong></span>`,
          )
          .join(" ");
    } else {
      breakdownBar.classList.add("hidden");
      breakdownBar.innerHTML = "";
    }
  }
}

function renderMatrixTable(rows) {
  const container = document.getElementById("matrix-table-container");
  if (!currentMatrixData || !container) return;

  let tableHTML = `<table class="matrix-table" id="export-table"><thead><tr>`;
  tableHTML += `<th rowspan="2" style="vertical-align: middle;">Ngày Cấp</th>`;
  tableHTML += `<th rowspan="2" style="vertical-align: middle;">Số LOT</th>`;
  tableHTML += `<th rowspan="2" style="vertical-align: middle;">Mã Hàng</th>`;
  tableHTML += `<th rowspan="2" style="vertical-align: middle;">Tổng SL</th>`;

  currentMatrixData.columns.forEach((col) => {
    const bg = LINE_COLORS[col.line_id] || "#edf2f7";
    tableHTML += `<th colspan="2" style="background-color: ${bg}; border-bottom:1px solid #ccc; text-align:center;">${col.stage_name}</th>`;
  });

  tableHTML += `<th rowspan="2" style="vertical-align: middle; background:#fff1f2; color:var(--maroon);">TỔNG NG</th>`;
  tableHTML += `<th rowspan="2" style="vertical-align: middle; background:#ecfdf5; color:var(--green);">KHO (OK)</th>`;
  tableHTML += `</tr><tr>`;

  currentMatrixData.columns.forEach((col) => {
    const bg = LINE_COLORS[col.line_id] || "#edf2f7";
    tableHTML += `<th style="background-color: ${bg}; color: #22835a; font-size:11px;">OK</th>`;
    tableHTML += `<th style="background-color: ${bg}; color: #a52e3b; font-size:11px; border-right: 2px solid rgba(0,0,0,0.08);">NG</th>`;
  });
  tableHTML += `</tr></thead><tbody>`;

  if (rows.length === 0) {
    tableHTML += `<tr><td colspan="${currentMatrixData.columns.length * 2 + 6}" style="text-align: center; padding: 24px;">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>`;
  }

  let sumTotal = 0;
  let sumAllNG = 0;
  let sumKho = 0;
  const colSums = {};
  currentMatrixData.columns.forEach((c) => {
    colSums[c.id] = { good: 0, ng: 0 };
  });

  rows.forEach((row) => {
    sumTotal += row.total_qty;
    sumAllNG += row.total_ng;
    sumKho += row.finished_qty;

    tableHTML += `<tr>
      <td>${formatDateVN(row.production_date)}</td>
      <td style="font-weight:bold; color:var(--navy);">${row.po_number}</td>
      <td style="font-weight:600;">${row.product_code}</td>
      <td style="font-weight:bold;">${row.total_qty}</td>`;

    currentMatrixData.columns.forEach((col) => {
      const stg = row.stages[col.id];
      const bg = LINE_COLORS[col.line_id] || "transparent";
      let timeStr = "Chưa thao tác";
      if (stg && stg.date) {
        try {
          timeStr = new Date(stg.date.replace(" ", "T") + "Z")
            .toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
              hour12: false,
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
            .replace(",", "");
        } catch (e) {}
      }

      const goodVal = stg ? stg.good : 0;
      const ngVal = stg ? stg.ng : 0;
      colSums[col.id].good += goodVal;
      colSums[col.id].ng += ngVal;

      tableHTML +=
        goodVal > 0
          ? `<td class="has-tooltip" data-time="${timeStr}" style="background-color: ${bg}; text-align:center;"><span class="badge-good">${goodVal}</span></td>`
          : `<td style="background-color: ${bg}; text-align:center;"><span class="cell-empty">-</span></td>`;

      tableHTML +=
        ngVal > 0
          ? `<td class="has-tooltip" data-time="Phát sinh ${ngVal} NG tại ${col.stage_name}" style="background-color: ${bg}; text-align:center; border-right: 2px solid rgba(0,0,0,0.08);"><span class="badge-ng">${ngVal}</span></td>`
          : `<td style="background-color: ${bg}; text-align:center; border-right: 2px solid rgba(0,0,0,0.08);"><span class="cell-empty">-</span></td>`;
    });

    if (row.total_ng > 0) {
      const ngRateLot =
        row.total_qty > 0
          ? ((row.total_ng / row.total_qty) * 100).toFixed(1)
          : 0;
      tableHTML += `<td class="has-tooltip" data-time="${row.ng_breakdown || "Tổng NG"} (${ngRateLot}%)" style="background:#fff1f2; font-weight:bold; color:var(--maroon);">
        <span class="badge-ng" style="font-size:12px;">${row.total_ng}</span>
      </td>`;
    } else {
      tableHTML += `<td style="background:#fff1f2; color:#94a3b8;">0</td>`;
    }

    tableHTML += `<td style="background:#ecfdf5; font-weight:bold; color:var(--green);">${row.finished_qty > 0 ? row.finished_qty : "-"}</td></tr>`;
  });

  tableHTML += `</tbody>`;

  if (rows.length > 0) {
    tableHTML += `<tfoot><tr class="matrix-tfoot-row">
      <td colspan="3" style="text-align:right; font-weight:bold;">TỔNG CỘNG (${rows.length} LOT):</td>
      <td style="font-weight:bold;">${sumTotal}</td>`;

    currentMatrixData.columns.forEach((col) => {
      const s = colSums[col.id];
      tableHTML += `<td style="font-weight:bold; color:#22835a;">${s.good > 0 ? s.good : 0}</td>`;
      tableHTML += `<td style="font-weight:bold; color:#a52e3b; border-right: 2px solid rgba(0,0,0,0.08);">${s.ng > 0 ? s.ng : 0}</td>`;
    });

    tableHTML += `<td style="font-weight:bold; color:var(--maroon); background:#ffe4e6;">${sumAllNG}</td>`;
    tableHTML += `<td style="font-weight:bold; color:var(--green); background:#d1fae5;">${sumKho}</td>`;
    tableHTML += `</tr></tfoot>`;
  }

  tableHTML += `</table>`;
  container.innerHTML = tableHTML;
}

window.exportMatrixExcel = function () {
  if (!currentMatrixData || !filteredMatrixRows) {
    return alert("Chưa có dữ liệu báo cáo để xuất!");
  }

  const dateFrom =
    document.getElementById("search-date-from")?.value || "Tất cả";
  const dateTo = document.getElementById("search-date-to")?.value || "Tất cả";
  const codeFilter = document.getElementById("search-code")?.value || "Tất cả";
  const lotFilter = document.getElementById("search-lot")?.value || "Tất cả";
  const cols = currentMatrixData.columns;
  const totalTableCols = cols.length * 2 + 6;

  let sumTotal = 0;
  let sumAllNG = 0;
  let sumKho = 0;
  const colSums = {};
  cols.forEach((c) => {
    colSums[c.id] = { good: 0, ng: 0 };
  });

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="UTF-8">
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
      th, td { border: 1px solid #333333; padding: 6px 8px; text-align: center; vertical-align: middle; }
      .title { font-size: 14pt; font-weight: bold; color: #193958; border: none; text-align: left; }
      .subtitle { font-size: 10pt; color: #333333; border: none; text-align: left; }
      .th-main { background-color: #193958; color: #ffffff; font-weight: bold; }
      .th-ok { background-color: #e8f5e9; color: #1b5e20; font-weight: bold; }
      .th-ng { background-color: #ffebee; color: #b71c1c; font-weight: bold; }
      .td-ng-active { background-color: #ffebee; color: #b71c1c; font-weight: bold; }
      .td-total-ng { background-color: #fff1f2; color: #a52e3b; font-weight: bold; }
      .td-kho { background-color: #ecfdf5; color: #22835a; font-weight: bold; }
      .tfoot-row td { background-color: #edf2f7; font-weight: bold; }
    </style>
  </head>
  <body>
    <table>
      <tr><td colspan="${totalTableCols}" class="title">BÁO CÁO TIẾN ĐỘ SẢN XUẤT (WIP) &amp; TỔNG HỢP HÀNG LỖI (NG)</td></tr>
      <tr><td colspan="${totalTableCols}" class="subtitle">Thời gian lọc: Từ ${formatDateVN(dateFrom)} đến ${formatDateVN(dateTo)} | Mã hàng: ${codeFilter} | Số LOT: ${lotFilter} | Ngày xuất: ${new Date().toLocaleString("vi-VN")}</td></tr>
      <tr><td colspan="${totalTableCols}" style="border:none;"></td></tr>
      <thead>
        <tr>
          <th rowspan="2" class="th-main">Ngày Cấp</th>
          <th rowspan="2" class="th-main">Số LOT</th>
          <th rowspan="2" class="th-main">Mã Hàng</th>
          <th rowspan="2" class="th-main">Tổng SL</th>`;

  cols.forEach((col) => {
    html += `<th colspan="2" class="th-main">${col.stage_name}</th>`;
  });

  html += `<th rowspan="2" class="th-ng">TỔNG NG</th>
          <th rowspan="2" class="th-ok">KHO (OK)</th>
        </tr>
        <tr>`;

  cols.forEach(() => {
    html += `<th class="th-ok">OK</th><th class="th-ng">NG</th>`;
  });

  html += `</tr></thead><tbody>`;

  filteredMatrixRows.forEach((row) => {
    sumTotal += row.total_qty;
    sumAllNG += row.total_ng;
    sumKho += row.finished_qty;

    html += `<tr>
      <td>${formatDateVN(row.production_date)}</td>
      <td style="font-weight:bold;">${row.po_number}</td>
      <td>${row.product_code}</td>
      <td style="font-weight:bold;">${row.total_qty}</td>`;

    cols.forEach((col) => {
      const stg = row.stages[col.id];
      const goodVal = stg ? stg.good : 0;
      const ngVal = stg ? stg.ng : 0;
      colSums[col.id].good += goodVal;
      colSums[col.id].ng += ngVal;

      html += `<td>${goodVal}</td>`;
      html += `<td class="${ngVal > 0 ? "td-ng-active" : ""}">${ngVal}</td>`;
    });

    html += `<td class="td-total-ng">${row.total_ng}</td>`;
    html += `<td class="td-kho">${row.finished_qty}</td></tr>`;
  });

  html += `</tbody><tfoot>
    <tr class="tfoot-row">
      <td colspan="3" style="text-align:right;">TỔNG CỘNG (${filteredMatrixRows.length} LOT):</td>
      <td>${sumTotal}</td>`;

  cols.forEach((col) => {
    html += `<td>${colSums[col.id].good}</td>`;
    html += `<td class="td-ng-active">${colSums[col.id].ng}</td>`;
  });

  html += `<td class="td-total-ng">${sumAllNG}</td>
      <td class="td-kho">${sumKho}</td>
    </tr>
  </tfoot></table></body></html>`;

  const blob = new Blob(["\uFEFF" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const link = document.createElement("a");
  const fileSuffix = codeFilter !== "Tất cả" ? `_${codeFilter}` : "";
  link.href = URL.createObjectURL(blob);
  link.download = `Bao_Cao_San_Xuat_WIP${fileSuffix}_${new Date().toISOString().split("T")[0]}.xls`;
  link.click();
};

window.exportMatrixCSV = function () {
  if (!currentMatrixData || !filteredMatrixRows) {
    return alert("Chưa có dữ liệu để xuất CSV!");
  }
  const cols = currentMatrixData.columns;
  const headers = ["Ngày Cấp", "Số LOT", "Mã Hàng", "Tổng SL"];
  cols.forEach((c) => {
    headers.push(`${c.stage_name} (OK)`);
    headers.push(`${c.stage_name} (NG)`);
  });
  headers.push("TỔNG NG", "KHO (OK)");

  let csv = "\uFEFF" + headers.map((h) => `"${h}"`).join(",") + "\n";

  filteredMatrixRows.forEach((row) => {
    const line = [
      formatDateVN(row.production_date),
      row.po_number,
      row.product_code,
      row.total_qty,
    ];
    cols.forEach((c) => {
      const stg = row.stages[c.id];
      line.push(stg ? stg.good : 0);
      line.push(stg ? stg.ng : 0);
    });
    line.push(row.total_ng, row.finished_qty);
    csv +=
      line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Bao_Cao_WIP_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
};

window.exportExcel = window.exportMatrixExcel;

// ==========================================
// 6. LỊCH SỬ GIAO DỊCH & XUẤT EXCEL LỊCH SỬ
// ==========================================
let filteredAdminHistory = [];

async function fetchHistoryLog() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/history?t=${Date.now()}`, {
      cache: "no-store",
    });
    const result = await res.json();

    if (result.data) {
      historyLogCache = result.data;
      populateHistoryFilters();
      filterHistoryLog("admin");
      filterHistoryLog("leader");
    }
  } catch (e) {
    console.error("Lỗi tải lịch sử:", e);
  }
}

function populateHistoryFilters() {
  let stageOpts = '<option value="">-- Mọi công đoạn --</option>';
  globalStages.forEach((st) => {
    stageOpts += `<option value="${st.id}">${st.stage_name}</option>`;
  });
  if (document.getElementById("hist-stage"))
    document.getElementById("hist-stage").innerHTML = stageOpts;
  if (document.getElementById("hist-stage-ld"))
    document.getElementById("hist-stage-ld").innerHTML = stageOpts;

  const uniqueKeywords = [
    ...new Set([
      ...historyLogCache.map((h) => h.po_id),
      ...historyLogCache.map((h) => h.product_code),
    ]),
  ].filter(Boolean);

  const suggestHTML = uniqueKeywords
    .map((k) => `<option value="${k}">`)
    .join("");
  if (document.getElementById("hist-suggest"))
    document.getElementById("hist-suggest").innerHTML = suggestHTML;
  if (document.getElementById("hist-suggest-ld"))
    document.getElementById("hist-suggest-ld").innerHTML = suggestHTML;
}

window.filterHistoryLog = function (role) {
  const isLd = role === "leader";
  const dateFrom =
    document.getElementById(isLd ? "hist-date-from-ld" : "hist-date-from")
      ?.value || "";
  const dateTo =
    document.getElementById(isLd ? "hist-date-to-ld" : "hist-date-to")?.value ||
    "";
  const stageVal =
    document.getElementById(isLd ? "hist-stage-ld" : "hist-stage")?.value || "";
  const typeVal = !isLd
    ? document.getElementById("hist-type")?.value || ""
    : "";
  const keyword = (
    document.getElementById(isLd ? "hist-keyword-ld" : "hist-keyword")?.value ||
    ""
  )
    .toUpperCase()
    .trim();

  const filtered = historyLogCache.filter((log) => {
    let matchDate = true;
    if (log.timestamp) {
      const logDate = log.timestamp.split(" ")[0];
      if (dateFrom && logDate < dateFrom) matchDate = false;
      if (dateTo && logDate > dateTo) matchDate = false;
    }

    let matchStage = true;
    if (stageVal) {
      matchStage = log.from_stage === stageVal || log.to_stage === stageVal;
    }

    let matchType = true;
    if (typeVal === "PASS") {
      matchType = log.type === "PASS";
    } else if (typeVal === "NG") {
      matchType = log.type !== "PASS";
    }

    let matchKw = true;
    if (keyword) {
      const po = (log.po_id || "").toUpperCase();
      const prd = (log.product_code || "").toUpperCase();
      matchKw = po.includes(keyword) || prd.includes(keyword);
    }

    return matchDate && matchStage && matchType && matchKw;
  });

  if (!isLd) {
    filteredAdminHistory = filtered;
    const sumPass = filtered
      .filter((l) => l.type === "PASS")
      .reduce((acc, l) => acc + (Number(l.qty) || 0), 0);
    const sumNg = filtered
      .filter((l) => l.type !== "PASS")
      .reduce((acc, l) => acc + (Number(l.qty) || 0), 0);
    const sumEl = document.getElementById("history-summary-admin");
    if (sumEl) {
      sumEl.innerHTML = `Kết quả lọc: <strong>${filtered.length}</strong> giao dịch | Tổng SL Đạt (PASS): <span style="color:var(--green);">${sumPass}</span> | Tổng SL Lỗi (NG): <span style="color:var(--maroon);">${sumNg}</span>`;
    }
  }

  renderHistoryTable(filtered, isLd ? "history-tbody-leader" : "history-tbody");
};

function renderHistoryTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (data.length > 0) {
    tbody.innerHTML = data
      .map((log) => {
        let timeStr = "Chưa rõ";
        if (log.timestamp) {
          try {
            const utcDate = new Date(log.timestamp.replace(" ", "T") + "Z");
            timeStr = utcDate.toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
              hour12: false,
            });
          } catch (e) {}
        }
        const typeStyle =
          log.type === "PASS"
            ? "color:#22835a; font-weight:bold;"
            : "color:#a52e3b; font-weight:bold;";
        const nameStr = log.full_name
          ? `${log.full_name} (${log.username})`
          : log.username || "Hệ thống";

        return `<tr>
          <td>${timeStr}</td>
          <td>${nameStr}</td>
          <td style="color:var(--navy); font-weight:bold;">${log.product_code || "-"}</td>
          <td style="font-weight:bold;">${log.po_id || "-"}</td>
          <td style="${typeStyle}">${log.type || "-"}</td>
          <td style="font-weight:bold;">${log.qty || 0}</td>
          <td>${getStageNameById(log.from_stage)}</td>
          <td>${getStageNameById(log.to_stage)}</td>
        </tr>`;
      })
      .join("");
  } else {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không tìm thấy giao dịch nào!</td></tr>`;
  }
}

window.exportHistoryExcel = function () {
  if (!filteredAdminHistory || filteredAdminHistory.length === 0) {
    return alert("Không có dữ liệu lịch sử để xuất!");
  }
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8"><style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
    th, td { border: 1px solid #333; padding: 6px 8px; text-align: center; }
    th { background: #193958; color: #fff; font-weight: bold; }
  </style></head><body>
  <h3>LỊCH SỬ GIAO DỊCH SẢN XUẤT (Xuất ngày: ${new Date().toLocaleString("vi-VN")})</h3>
  <table>
    <thead>
      <tr>
        <th>Thời Gian</th>
        <th>Người Thao Tác</th>
        <th>Mã Hàng</th>
        <th>Số LOT</th>
        <th>Loại</th>
        <th>Số Lượng</th>
        <th>Từ Công Đoạn</th>
        <th>Đến Công Đoạn</th>
      </tr>
    </thead>
    <tbody>`;

  filteredAdminHistory.forEach((log) => {
    let timeStr = log.timestamp || "-";
    try {
      timeStr = new Date(log.timestamp.replace(" ", "T") + "Z").toLocaleString(
        "vi-VN",
        {
          timeZone: "Asia/Ho_Chi_Minh",
          hour12: false,
        },
      );
    } catch (e) {}
    const nameStr = log.full_name
      ? `${log.full_name} (${log.username})`
      : log.username || "Hệ thống";
    html += `<tr>
      <td>${timeStr}</td>
      <td>${nameStr}</td>
      <td>${log.product_code || "-"}</td>
      <td>${log.po_id || "-"}</td>
      <td>${log.type || "-"}</td>
      <td>${log.qty || 0}</td>
      <td>${getStageNameById(log.from_stage)}</td>
      <td>${getStageNameById(log.to_stage)}</td>
    </tr>`;
  });

  html += `</tbody></table></body></html>`;
  const blob = new Blob(["\uFEFF" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Lich_Su_San_Xuat_${new Date().toISOString().split("T")[0]}.xls`;
  link.click();
};

// ==========================================
// 7. LEADER: TẢI HÀNG CHỜ & KÉO ĐẨY NHANH
// ==========================================
async function fetchPendingPOs() {
  if (!currentUser || currentUser.role !== "LEADER") return;
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/leader/pending?line_id=${currentUser.line_id}&t=${Date.now()}`,
      { cache: "no-store" },
    );
    const result = await response.json();

    const newDataString = JSON.stringify(result.data || []);
    if (newDataString === lastPendingDataString) return;

    lastPendingDataString = newDataString;
    leaderPOsCache = result.data || [];
    populateLeaderSearchDropdowns();
  } catch (error) {}
}

window.populateLeaderSearchDropdowns = function () {
  const productList = document.getElementById("leader-product-list");
  if (!productList) {
    filterLeaderPOs();
    return;
  }

  const uniqueProducts = [
    ...new Set(leaderPOsCache.map((po) => po.product_code)),
  ].filter(Boolean);

  productList.innerHTML = uniqueProducts
    .map((p) => `<option value="${p}">`)
    .join("");

  updateLeaderLotOptions();
};

window.updateLeaderLotOptions = function () {
  const productInput = document.getElementById("search-leader-product");
  const lotList = document.getElementById("leader-lot-list");
  if (!productInput || !lotList) return;

  const selectedProduct = productInput.value.trim().toUpperCase();
  let availableLots = leaderPOsCache;

  if (selectedProduct) {
    availableLots = leaderPOsCache.filter((po) =>
      (po.product_code || "").toUpperCase().includes(selectedProduct),
    );
  }

  const uniqueLots = [
    ...new Set(availableLots.map((po) => po.po_number)),
  ].filter(Boolean);

  lotList.innerHTML = uniqueLots.map((l) => `<option value="${l}">`).join("");

  filterLeaderPOs();
};

window.filterLeaderPOs = function () {
  const prodVal =
    document
      .getElementById("search-leader-product")
      ?.value.trim()
      .toUpperCase() || "";
  const lotVal =
    document.getElementById("search-leader-lot")?.value.trim().toUpperCase() ||
    "";

  const filtered = leaderPOsCache.filter((po) => {
    const matchProd =
      prodVal === "" || (po.product_code || "").toUpperCase().includes(prodVal);
    const matchLot =
      lotVal === "" || (po.po_number || "").toUpperCase().includes(lotVal);
    return matchProd && matchLot;
  });

  renderLeaderPOs(filtered);
};

function renderLeaderPOs(data) {
  const selectEl = document.getElementById("po-select");
  const wipContainer = document.getElementById("tab-wip");
  const wipCountEl = document.getElementById("leader-wip-count");
  if (wipCountEl) wipCountEl.textContent = data.length;
  if (!selectEl || !wipContainer) return;

  let currentSelectedPoKey = null;
  if (selectEl.value) {
    try {
      const parsed = JSON.parse(selectEl.value);
      currentSelectedPoKey = `${parsed.po_id}_${parsed.from_stage}`;
    } catch (e) {}
  }

  selectEl.innerHTML = '<option value="">-- Chọn LOT để xử lý --</option>';
  wipContainer.innerHTML = "";

  if (data.length > 0) {
    data.forEach((po) => {
      const currentStageName = getStageNameById(po.from_stage);
      const toStageName = getStageNameById(po.to_stage_name);

      const optionValue = JSON.stringify({
        po_id: po.po_id,
        po_number: po.po_number,
        product_id: po.product_id,
        product_code: po.product_code,
        from_stage: po.from_stage,
        to_stage_name: po.to_stage_name,
        max_qty: po.qty_available,
      });

      const optionText = `${po.po_number} [${po.product_code}] - Tồn: ${po.qty_available} (${currentStageName} ➔ ${toStageName})`;
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionText;
      selectEl.appendChild(option);

      const card = document.createElement("div");
      card.className = "card leader-wip-card";
      card.style.borderLeft = "4px solid var(--green)";
      card.style.cursor = "pointer";
      card.onclick = () => quickSelectLeaderPO(optionValue);
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h3 style="color: var(--navy); margin:0;">${po.po_number} <span style="font-size: 13px; color: var(--gray-dark);">(${po.product_code})</span></h3>
          <span class="btn-chip" style="background:#eaf1f8; color:var(--navy);">Chạm để giao ➔</span>
        </div>
        <p style="margin-bottom: 4px;">📦 Tồn tại trạm: <strong class="text-primary" style="font-size: 17px;">${po.qty_available}</strong></p>
        <p style="font-size: 13px;">📍 Hiện tại: <strong style="color: var(--maroon);">${currentStageName}</strong> ➔ Tiếp theo: <strong>${toStageName}</strong></p>
      `;
      wipContainer.appendChild(card);
    });

    if (currentSelectedPoKey) {
      const options = Array.from(selectEl.options);
      const targetOpt = options.find((opt) => {
        if (!opt.value) return false;
        try {
          const p = JSON.parse(opt.value);
          return `${p.po_id}_${p.from_stage}` === currentSelectedPoKey;
        } catch (e) {
          return false;
        }
      });
      if (targetOpt) selectEl.value = targetOpt.value;
    }
  } else {
    selectEl.innerHTML = '<option value="">Chưa có dữ liệu</option>';
    wipContainer.innerHTML = `<div class="card" style="text-align: center; color: var(--gray-dark); padding: 30px;">Không có lô hàng nào đang chờ tại công đoạn bạn quản lý.</div>`;
  }
}

window.quickSelectLeaderPO = function (optionValue) {
  switchTab("leader", "tab-action");
  const selectEl = document.getElementById("po-select");
  if (selectEl) {
    selectEl.value = optionValue;
    onLeaderSelectPO();
  }
};

window.onLeaderSelectPO = function () {
  const selectEl = document.getElementById("po-select");
  const infoBox = document.getElementById("leader-selected-info");
  if (!selectEl || !infoBox) return;
  if (!selectEl.value) {
    infoBox.classList.add("hidden");
    return;
  }
  try {
    const data = JSON.parse(selectEl.value);
    infoBox.classList.remove("hidden");
    infoBox.innerHTML = `Lô <strong>${data.po_number || data.po_id}</strong> [${data.product_code || ""}] | Tồn tối đa có thể giao: <strong style="color:var(--maroon); font-size:15px;">${data.max_qty}</strong>`;
    document.getElementById("qty-pass").value = data.max_qty;
    document.getElementById("qty-ng").value = 0;
  } catch (e) {
    infoBox.classList.add("hidden");
  }
};

window.fillMaxPassQty = function () {
  const selectEl = document.getElementById("po-select");
  if (!selectEl || !selectEl.value) return alert("Vui lòng chọn LOT trước!");
  try {
    const data = JSON.parse(selectEl.value);
    const ngVal = parseInt(document.getElementById("qty-ng").value) || 0;
    document.getElementById("qty-pass").value = Math.max(
      0,
      data.max_qty - ngVal,
    );
  } catch (e) {}
};

window.submitMove = async function (isOutsource = false) {
  const selectEl = document.getElementById("po-select");
  if (!selectEl) return;
  const selectedValue = selectEl.value;
  if (!selectedValue) return alert("Vui lòng chọn 1 LOT để thao tác!");

  const routeData = JSON.parse(selectedValue);
  const qtyPass = parseInt(document.getElementById("qty-pass").value) || 0;
  const qtyNg = parseInt(document.getElementById("qty-ng").value) || 0;
  const actionDate = document.getElementById("action-date")?.value || "";

  if (qtyPass + qtyNg <= 0) {
    return alert("Vui lòng nhập số lượng PASS hoặc NG lớn hơn 0!");
  }
  if (qtyPass + qtyNg > routeData.max_qty) {
    return alert(
      `Tổng số lượng thao tác (${qtyPass + qtyNg}) vượt quá số lượng tồn hiện tại (${routeData.max_qty})!`,
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lot_number: routeData.po_id,
        product_id: routeData.product_id,
        from_stage: routeData.from_stage,
        qty_pass: qtyPass,
        qty_ng: qtyNg,
        action_date: actionDate,
        is_outsource: isOutsource,
        user_id: currentUser.id,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alert("Đã cập nhật luân chuyển công đoạn thành công!");
      document.getElementById("qty-pass").value = 0;
      document.getElementById("qty-ng").value = 0;
      document.getElementById("leader-selected-info")?.classList.add("hidden");
      lastPendingDataString = "";
      await fetchPendingPOs();
      switchTab("leader", "tab-wip");
    } else {
      alert(data.error || "Có lỗi xảy ra khi chuyển công đoạn.");
    }
  } catch (error) {
    alert("Lỗi kết nối máy chủ API!");
  }
};

function setDefaultDates() {
  const d = new Date().toISOString().split("T")[0];
  if (document.getElementById("po-date"))
    document.getElementById("po-date").value = d;
  if (document.getElementById("action-date"))
    document.getElementById("action-date").value = d;
}