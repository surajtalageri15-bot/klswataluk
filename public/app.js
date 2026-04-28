const state = {
  user: null,
  tab: "dashboard",
  dashboard: null,
  users: [],
  corrections: { rows: [], page: 1, size: 50, total: 0 },
  pending: { rows: [], page: 1, size: 25, total: 0 },
  members: { rows: [], page: 1, size: 25, total: 0 },
  teamRequests: [],
  auditLogs: [],
  missingData: { rows: [], total: 0 },
  duplicates: { summary: { totalGroups: 0, phoneNumber: 0, lsNumber: 0, loginId: 0, name: 0 }, groups: [] },
  dataCorrectionRequests: [],
  filters: { search: "", district: "", taluk: "" },
  correctionFilters: { search: "", district: "" },
  userFilters: { search: "", role: "", district: "" },
  auditFilters: { search: "", editor: "", action: "", from: "", to: "", memberId: "" },
  duplicateFilters: { search: "", type: "" },
  dataCorrectionFilters: { search: "" }
};

let latestJoinLink = "";

const app = document.querySelector("#app");

const columns = [
  ["name", "Name"],
  ["lsNumber", "LS Number"],
  ["loginId", "Login ID"],
  ["district", "District"],
  ["taluk", "Taluk"],
  ["gender", "Gender"],
  ["dateOfBirth", "DOB"],
  ["age", "Age"],
  ["phoneNumber", "Phone"],
  ["qualification", "Qualification"],
  ["batchYear", "Batch"],
  ["status", "Status"],
  ["remarks", "Remarks"]
];

const roleLabels = {
  admin: "Admin",
  division: "State Division Technical Team",
  district: "District President",
  taluk: "Taluk Technical Team"
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function optionList(items, selected = "", labels = {}) {
  return items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(labels[item] || item)}</option>`).join("");
}

function taluksForDistrict(lists, district) {
  if (district && lists.taluksByDistrict && lists.taluksByDistrict[district]) {
    return lists.taluksByDistrict[district];
  }
  return lists.taluks || [];
}

function exportUrl(path, params = {}) {
  const query = new URLSearchParams(params);
  return `${path}?${query.toString()}`;
}

async function boot() {
  try {
    const data = await request("/api/me");
    state.user = data.user;
    await loadDashboard();
    renderApp();
  } catch {
    renderLogin();
  }
}

function renderLogin(message = "") {
  app.innerHTML = `
    <section class="login-shell">
      <div class="login-visual">
        <div class="brand">Karnataka Licensed Surveyors</div>
        <div>
          <h1>Taluk-level data maintenance login</h1>
          <p>Admin can assign a taluk data team, and each taluk team can manually maintain only its own registered surveyor records.</p>
        </div>
      </div>
      <div class="login-panel">
        <form class="box login-card" id="loginForm">
          <h2>Sign in</h2>
          <p class="muted">Use the username and password assigned by the administrator.</p>
          <div class="form-grid">
            <label>Username <input name="username" autocomplete="username"></label>
            <label>Password <input name="password" type="password" autocomplete="current-password"></label>
            <button class="primary" type="submit">Sign in</button>
            <div class="message">${escapeHtml(message)}</div>
          </div>
        </form>
      </div>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await request("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      state.user = data.user;
      await loadDashboard();
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  });
}

async function loadDashboard() {
  state.dashboard = await request("/api/dashboard");
}

async function loadMembers(page = 1) {
  state.members.page = page;
  const params = new URLSearchParams({
    page: String(page),
    size: String(state.members.size),
    search: state.filters.search,
    district: state.filters.district,
    taluk: state.filters.taluk
  });
  state.members = await request(`/api/members?${params.toString()}`);
}

async function loadPending(page = 1) {
  state.pending.page = page;
  const params = new URLSearchParams({
    page: String(page),
    size: "100",
    search: "",
    district: "",
    taluk: ""
  });
  const data = await request(`/api/members?${params.toString()}`);
  const pendingRows = data.rows.filter((member) => member.status === "Pending verification");
  state.pending = { ...data, size: 100, rows: pendingRows, total: pendingRows.length };
}

async function loadUsers() {
  if (!["admin", "division", "district"].includes(state.user.role)) return;
  const data = await request("/api/users");
  state.users = data.users;
  if (state.user.role === "admin") {
    const requests = await request("/api/taluk-team-requests");
    state.teamRequests = requests.requests;
  }
}

async function loadCorrections(page = 1) {
  if (state.user.role !== "admin") return;
  state.corrections.page = page;
  const params = new URLSearchParams({
    page: String(page),
    size: String(state.corrections.size),
    search: state.correctionFilters.search,
    district: state.correctionFilters.district
  });
  state.corrections = await request(`/api/taluk-corrections?${params.toString()}`);
}

async function loadAuditLogs() {
  if (!["admin", "taluk"].includes(state.user.role)) return;
  const params = new URLSearchParams({
    search: state.auditFilters.search,
    editor: state.auditFilters.editor,
    action: state.auditFilters.action,
    from: state.auditFilters.from,
    to: state.auditFilters.to,
    memberId: state.auditFilters.memberId,
    limit: "300"
  });
  state.auditLogs = await request(`/api/audit-logs?${params.toString()}`);
}

async function loadMissingData() {
  if (state.user.role !== "taluk") return;
  const params = new URLSearchParams({
    search: state.filters.search,
    limit: "300"
  });
  state.missingData = await request(`/api/missing-data?${params.toString()}`);
}

async function loadDuplicates() {
  if (state.user.role !== "admin") return;
  const params = new URLSearchParams({
    search: state.duplicateFilters.search,
    type: state.duplicateFilters.type,
    limit: "250"
  });
  state.duplicates = await request(`/api/duplicates?${params.toString()}`);
}

async function loadDataCorrectionRequests() {
  if (!["admin", "taluk"].includes(state.user.role)) return;
  const params = new URLSearchParams({ search: state.dataCorrectionFilters.search });
  const data = await request(`/api/data-correction-requests?${params.toString()}`);
  state.dataCorrectionRequests = data.requests;
}

function renderApp() {
  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="brand">Surveyor Register</div>
        <div class="user-pill">
          <strong>${escapeHtml(state.user.name)}</strong><br>
          <span>${userScopeLabel()}</span>
        </div>
        <nav class="nav">
          <button data-tab="dashboard" class="${state.tab === "dashboard" ? "active" : ""}">Dashboard</button>
          <button data-tab="members" class="${state.tab === "members" ? "active" : ""}">Members</button>
          ${["admin", "division", "taluk"].includes(state.user.role) ? `<button data-tab="pending" class="${state.tab === "pending" ? "active" : ""}">Pending Queue</button>` : ""}
          ${["admin", "taluk"].includes(state.user.role) ? `<button data-tab="membership" class="${state.tab === "membership" ? "active" : ""}">Membership Form</button>` : ""}
          ${["admin", "taluk"].includes(state.user.role) ? `<button data-tab="dataCorrections" class="${state.tab === "dataCorrections" ? "active" : ""}">Correction Requests</button>` : ""}
          ${state.user.role === "taluk" ? `<button data-tab="missingData" class="${state.tab === "missingData" ? "active" : ""}">Missing Data</button>` : ""}
          ${["admin", "division", "district"].includes(state.user.role) ? `<button data-tab="users" class="${state.tab === "users" ? "active" : ""}">Taluk Team</button>` : ""}
          ${state.user.role === "admin" ? `<button data-tab="duplicates" class="${state.tab === "duplicates" ? "active" : ""}">Duplicates</button>` : ""}
          ${state.user.role === "admin" ? `<button data-tab="corrections" class="${state.tab === "corrections" ? "active" : ""}">Taluk Correction</button>` : ""}
          ${["admin", "taluk"].includes(state.user.role) ? `<button data-tab="audit" class="${state.tab === "audit" ? "active" : ""}">${state.user.role === "taluk" ? "Activity Log" : "Audit History"}</button>` : ""}
        </nav>
        <button class="secondary" id="logoutBtn">Logout</button>
      </aside>
      <section class="content">
        <div class="topbar">
          <h1>${pageTitle()}</h1>
          ${state.tab === "members" && ["admin", "taluk"].includes(state.user.role) ? `<button class="primary" id="addMemberBtn">+ Add member</button>` : ""}
        </div>
        <div id="view"></div>
      </section>
    </section>
  `;

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tab = button.dataset.tab;
      if (state.tab === "dashboard") await loadDashboard();
      if (state.tab === "members") await loadMembers();
      if (state.tab === "pending") await loadPending();
      if (state.tab === "membership") await loadDashboard();
      if (state.tab === "dataCorrections") await loadDataCorrectionRequests();
      if (state.tab === "missingData") await loadMissingData();
      if (state.tab === "users") await loadUsers();
      if (state.tab === "duplicates") await loadDuplicates();
      if (state.tab === "corrections") await loadCorrections();
      if (state.tab === "audit") await loadAuditLogs();
      renderApp();
    });
  });

  document.querySelector("#logoutBtn").addEventListener("click", async () => {
    await request("/api/logout", { method: "POST" });
    state.user = null;
    renderLogin();
  });

  if (state.tab === "dashboard") renderDashboard();
  if (state.tab === "members") renderMembers();
  if (state.tab === "pending") renderPendingQueue();
  if (state.tab === "membership") renderMembershipForm();
  if (state.tab === "dataCorrections") renderDataCorrectionRequests();
  if (state.tab === "missingData") renderMissingData();
  if (state.tab === "users") renderUsers();
  if (state.tab === "duplicates") renderDuplicates();
  if (state.tab === "corrections") renderCorrections();
  if (state.tab === "audit") renderAuditLogs();
}

function pageTitle() {
  if (state.tab === "dashboard") return "Dashboard";
  if (state.tab === "members") return "Member Data";
  if (state.tab === "pending") return "Pending Verification Queue";
  if (state.tab === "membership") return "Membership Form";
  if (state.tab === "dataCorrections") return "Correction Requests";
  if (state.tab === "missingData") return "Missing Data Report";
  if (state.tab === "users") return "Taluk Team Assignment";
  if (state.tab === "duplicates") return "Duplicate Detection";
  if (state.tab === "corrections") return "Taluk Correction";
  if (state.tab === "audit") return state.user.role === "taluk" ? "Taluk Activity Log" : "Audit History";
  return "Dashboard";
}

function userScopeLabel() {
  if (state.user.role === "admin") return "Admin";
  if (state.user.role === "division") return `${escapeHtml(state.user.district)} Division`;
  if (state.user.role === "district") return `${escapeHtml(state.user.district)} District President`;
  return `${escapeHtml(state.user.taluk)} Taluk`;
}

function renderDashboard() {
  const summary = state.dashboard.summary;
  const charts = state.dashboard.charts || {};
  const performance = state.dashboard.performance || { districts: [], missingTalukLogins: [] };
  document.querySelector("#view").innerHTML = `
    <div class="stats">
      <div class="box stat"><span class="muted">Surveyors</span><strong>${summary.total}</strong></div>
      ${state.user.role === "taluk" ? `
        <div class="box stat"><span class="muted">Active</span><strong>${summary.statusCounts?.Active || 0}</strong></div>
        <div class="box stat"><span class="muted">Pending</span><strong>${summary.statusCounts?.["Pending verification"] || 0}</strong></div>
        <div class="box stat"><span class="muted">Needs correction</span><strong>${summary.statusCounts?.["Needs correction"] || 0}</strong></div>
      ` : `
        <div class="box stat"><span class="muted">Districts</span><strong>${summary.districts}</strong></div>
        <div class="box stat"><span class="muted">Taluks</span><strong>${summary.taluks}</strong></div>
        <div class="box stat"><span class="muted">Female</span><strong>${summary.gender.Female || 0}</strong></div>
      `}
    </div>
    <div class="chart-grid">
      <section class="box section">
        <h2>Male / Female</h2>
        ${chartBars(charts.gender)}
      </section>
      <section class="box section">
        <h2>Age groups</h2>
        ${chartBars(charts.ageGroups)}
      </section>
      <section class="box section">
        <h2>Pending corrections</h2>
        ${chartBars(charts.pendingCorrections)}
      </section>
      <section class="box section">
        <h2>Member count by taluk</h2>
        ${chartBars(charts.memberCountByTaluk, { compact: true })}
      </section>
    </div>
    <div class="split">
      <section class="box section">
        <h2>Top districts</h2>
        <div class="actions">
          <a class="secondary" href="/api/exports/members">Export district-wise CSV</a>
          ${["admin", "division", "district"].includes(state.user.role) ? `<a class="secondary" href="/api/exports/corrections">Export pending corrections</a>` : ""}
        </div>
        <div class="list">${summary.topDistricts.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
      <section class="box section">
        <h2>Top taluks</h2>
        <div class="list">${summary.topTaluks.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
    </div>
    ${["admin", "division"].includes(state.user.role) ? renderDistrictPerformance(performance) : ""}
  `;
}

function row(name, count) {
  return `<div class="list-row"><span>${escapeHtml(name)}</span><span class="badge">${count}</span></div>`;
}

function chartBars(items = [], options = {}) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  if (!items.length) return `<p class="muted">No data available</p>`;
  return `
    <div class="chart-bars ${options.compact ? "compact-bars" : ""}">
      ${items.map((item) => {
        const value = Number(item.value) || 0;
        const width = Math.max(3, Math.round((value / max) * 100));
        return `
          <div class="bar-row">
            <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
            <strong>${value}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

const requiredMemberFields = {
  name: "Name",
  phoneNumber: "Phone",
  dateOfBirth: "DOB",
  gender: "Gender",
  lsNumber: "LS",
  loginId: "Login ID",
  batchYear: "Batch",
  qualification: "Education",
  district: "District",
  taluk: "Taluk",
  address: "Address"
};

function missingFields(member) {
  return Object.entries(requiredMemberFields)
    .filter(([key]) => !String(member[key] ?? "").trim())
    .map(([, label]) => label);
}

function verificationChecklist(member) {
  const missing = missingFields(member);
  if (!missing.length) return `<span class="badge">Ready</span>`;
  return `<span class="badge">${missing.length} missing</span><div class="mini-list">${missing.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function followupMessage(member) {
  const missing = member.missingFields || missingFields(member);
  return [
    `Dear ${member.name || "Member"},`,
    "",
    "KLSWA membership data verification is pending.",
    `LS Number: ${member.lsNumber || "-"}`,
    `Taluk: ${member.taluk || "-"}`,
    missing.length ? `Please update/correct: ${missing.join(", ")}` : "Please contact your taluk technical team for verification.",
    "",
    "Status check: https://klswa.in/status.html"
  ].join("\n");
}

function whatsAppLink(member) {
  const phone = String(member.phoneNumber || "").replace(/\D/g, "");
  return `https://wa.me/91${encodeURIComponent(phone)}?text=${encodeURIComponent(followupMessage(member))}`;
}

function renderDistrictPerformance(performance) {
  const missing = performance.missingTalukLogins || [];
  return `
    <section class="box section">
      <div class="section-head">
        <h2>District performance</h2>
        <span class="badge">${missing.length} taluks without login</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Members</th>
              <th>Active</th>
              <th>Pending</th>
              <th>Needs correction</th>
              <th>Rejected</th>
              <th>Taluk logins</th>
              <th>Missing</th>
              <th>President</th>
            </tr>
          </thead>
          <tbody>
            ${(performance.districts || []).map((item) => `
              <tr>
                <td>${escapeHtml(item.district)}</td>
                <td>${item.members}</td>
                <td>${item.active}</td>
                <td>${item.pending}</td>
                <td>${item.needsCorrection}</td>
                <td>${item.rejected}</td>
                <td>${item.talukLogins} / ${item.taluks}</td>
                <td>${item.missingTalukLogins}</td>
                <td><span class="badge">${item.districtPresident ? "Active" : "Missing"}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
    <section class="box section">
      <div class="section-head">
        <h2>Missing taluk team logins</h2>
        <span class="badge">${missing.length} Missing</span>
      </div>
      <div class="missing-grid">
        ${missing.length ? missing.map((item) => `
          <div class="missing-item">
            <strong>${escapeHtml(item.taluk)}</strong>
            <span class="muted">${escapeHtml(item.district)}</span>
          </div>
        `).join("") : `<p class="muted">All taluks have active technical team logins.</p>`}
      </div>
    </section>
  `;
}

function renderMembers() {
  const lists = state.dashboard.lists;
  const talukOptions = taluksForDistrict(lists, state.filters.district);
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="searchInput" value="${escapeHtml(state.filters.search)}" placeholder="Name, LS number, phone"></label>
        <label>District <select id="districtFilter"><option value="">All districts</option>${optionList(lists.districts, state.filters.district)}</select></label>
        <label>Taluk <select id="talukFilter"><option value="">${state.filters.district ? "All taluks in district" : "All taluks"}</option>${optionList(talukOptions, state.filters.taluk)}</select></label>
        <span class="actions">
          <button class="secondary" id="applyFilters">Apply</button>
          <a class="secondary" id="memberExportLink" href="${exportUrl("/api/exports/members", state.filters)}">Export CSV</a>
          ${state.user.role === "taluk" ? `
            <a class="secondary" href="${exportUrl("/api/exports/members", { ...state.filters, status: "Pending verification" })}">Pending CSV</a>
            <a class="secondary" href="${exportUrl("/api/exports/members", { ...state.filters, status: "Needs correction" })}">Needs correction CSV</a>
            <a class="secondary" href="${exportUrl("/api/exports/members", { ...state.filters, missingOnly: "true" })}">Missing data CSV</a>
          ` : ""}
        </span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.slice(0, 10).map(([, label]) => `<th>${label}</th>`).join("")}<th>Actions</th></tr></thead>
          <tbody>
            ${state.members.rows.map((member) => `
              <tr>
                ${columns.slice(0, 10).map(([key]) => `<td>${escapeHtml(member[key])}</td>`).join("")}
                <td class="actions">
                  ${state.user.role === "admin" ? `<button class="icon-btn" title="Edit" data-edit="${member.id}">E</button>` : ""}
                  ${state.user.role === "admin" ? `<button class="secondary" data-login-control="${member.id}">Login</button>` : ""}
                  ${state.user.role === "taluk" ? `<button class="secondary" data-request-correction="${member.id}">Request</button>` : ""}
                  ${state.user.role === "admin" ? `<button class="icon-btn" title="Delete" data-delete="${member.id}">D</button>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Showing ${state.members.rows.length} of ${state.members.total}</span>
        <div class="actions">
          <button class="secondary" id="prevPage" ${state.members.page <= 1 ? "disabled" : ""}>Previous</button>
          <button class="secondary" id="nextPage" ${state.members.page * state.members.size >= state.members.total ? "disabled" : ""}>Next</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#addMemberBtn")?.addEventListener("click", () => openMemberModal());
  document.querySelector("#districtFilter").addEventListener("change", () => {
    const district = document.querySelector("#districtFilter").value;
    const talukSelect = document.querySelector("#talukFilter");
    talukSelect.innerHTML = `<option value="">${district ? "All taluks in district" : "All taluks"}</option>${optionList(taluksForDistrict(lists, district))}`;
  });
  document.querySelector("#applyFilters").addEventListener("click", async () => {
    state.filters.search = document.querySelector("#searchInput").value;
    state.filters.district = document.querySelector("#districtFilter").value;
    state.filters.taluk = document.querySelector("#talukFilter").value;
    await loadMembers(1);
    renderApp();
  });
  document.querySelector("#prevPage").addEventListener("click", async () => {
    await loadMembers(state.members.page - 1);
    renderApp();
  });
  document.querySelector("#nextPage").addEventListener("click", async () => {
    await loadMembers(state.members.page + 1);
    renderApp();
  });
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openMemberModal(state.members.rows.find((member) => member.id === button.dataset.edit)));
  });
  document.querySelectorAll("[data-request-correction]").forEach((button) => {
    button.addEventListener("click", () => openCorrectionRequestModal(state.members.rows.find((member) => member.id === button.dataset.requestCorrection)));
  });
  document.querySelectorAll("[data-login-control]").forEach((button) => {
    button.addEventListener("click", () => openMemberLoginControlModal(state.members.rows.find((member) => member.id === button.dataset.loginControl)));
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this member record?")) return;
      await request(`/api/members/${button.dataset.delete}`, { method: "DELETE" });
      await loadDashboard();
      await loadMembers(state.members.page);
      renderApp();
    });
  });
}

function renderPendingQueue() {
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>LS Number</th>
              <th>District</th>
              <th>Taluk</th>
              <th>Phone</th>
              <th>Checklist</th>
              <th>Qualification</th>
              <th>Remarks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.pending.rows.map((member) => `
              <tr>
                <td>${escapeHtml(member.name)}</td>
                <td>${escapeHtml(member.lsNumber)}</td>
                <td>${escapeHtml(member.district)}</td>
                <td>${escapeHtml(member.taluk)}</td>
                <td>${escapeHtml(member.phoneNumber)}</td>
                <td>${verificationChecklist(member)}</td>
                <td>${escapeHtml(member.qualification)}</td>
                <td>${escapeHtml(member.remarks)}</td>
                <td class="actions">
                  <button class="secondary" data-view-pending="${member.id}">View</button>
                  <button class="primary" data-review-status="Active" data-member="${member.id}">Approve</button>
                  <button class="secondary" data-review-status="Needs correction" data-member="${member.id}">Needs correction</button>
                  <button class="secondary" data-copy-followup="${member.id}">Copy msg</button>
                  ${member.phoneNumber ? `<a class="secondary" href="${whatsAppLink(member)}" target="_blank">WhatsApp</a>` : ""}
                  <button class="danger" data-review-status="Rejected" data-member="${member.id}">Reject</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Pending records on this page: ${state.pending.rows.length}</span>
        <div class="actions">
          <button class="secondary" id="refreshPending">Refresh</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#refreshPending").addEventListener("click", async () => {
    await loadPending();
    renderApp();
  });
  document.querySelectorAll("[data-view-pending]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = state.pending.rows.find((item) => item.id === button.dataset.viewPending);
      openPendingApplicationModal(member);
    });
  });
  document.querySelectorAll("[data-review-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.dataset.reviewStatus;
      const member = state.pending.rows.find((item) => item.id === button.dataset.member);
      openPendingStatusModal(member, status);
    });
  });
  document.querySelectorAll("[data-copy-followup]").forEach((button) => {
    button.addEventListener("click", async () => {
      const member = state.pending.rows.find((item) => item.id === button.dataset.copyFollowup);
      await copyText(followupMessage(member));
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy msg"; }, 1400);
    });
  });
}

function pendingDetailRows(member) {
  const rows = [
    ["Full name", member.name],
    ["Phone number", member.phoneNumber],
    ["Date of birth", member.dateOfBirth],
    ["Age", member.age],
    ["Gender", member.gender],
    ["Marital status", member.maritalStatus],
    ["Kalyana Karnataka", member.kalyanaKarnataka],
    ["Category", member.category],
    ["Caste", member.caste],
    ["Religion", member.religion],
    ["Disability", member.disability],
    ["LS number", member.lsNumber],
    ["Mojini login ID", member.loginId],
    ["Batch year", member.batchYear],
    ["Education", member.qualification],
    ["District", member.district],
    ["Taluk", member.taluk],
    ["Other taluks", member.otherTaluks],
    ["Address", member.address],
    ["Declaration accepted", member.declarationAccepted ? "Yes" : "No"],
    ["Current status", member.status],
    ["Remarks", member.remarks]
  ];
  return rows.map(([label, value]) => `
    <div>
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
}

function openPendingApplicationModal(member) {
  if (!member) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <section class="box modal">
        <div class="modal-head">
          <div>
            <h2>Full application</h2>
            <p class="muted">${escapeHtml(member.name)} - ${escapeHtml(member.lsNumber)} - ${escapeHtml(member.taluk)}</p>
          </div>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="detail-grid">
          ${pendingDetailRows(member)}
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Close</button>
          <button class="primary" type="button" data-modal-status="Active">Approve</button>
          <button class="secondary" type="button" data-modal-status="Needs correction">Needs correction</button>
          <button class="danger" type="button" data-modal-status="Rejected">Reject</button>
        </div>
      </section>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelectorAll("[data-modal-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const status = button.dataset.modalStatus;
      backdrop.remove();
      openPendingStatusModal(member, status);
    });
  });
}

function openPendingStatusModal(member, status) {
  if (!member) return;
  const needsReason = status !== "Active";
  const actionLabels = {
    Active: "Approve application",
    "Needs correction": "Send for correction",
    Rejected: "Reject application"
  };
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="pendingStatusForm">
        <div class="modal-head">
          <div>
            <h2>${escapeHtml(actionLabels[status] || "Review application")}</h2>
            <p class="muted">${escapeHtml(member.name)} - ${escapeHtml(member.lsNumber)} - ${escapeHtml(member.taluk)}</p>
          </div>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="status-review-card">
          <strong>${escapeHtml(status)}</strong>
          <span>${status === "Active" ? "This member will move from pending queue to active members." : "This reason will be saved in remarks and shown to the team/admin."}</span>
        </div>
        <label>Reason ${needsReason ? "*" : ""}
          <textarea name="remarks" rows="4" ${needsReason ? "required" : ""} placeholder="${needsReason ? "Enter clear reason" : "Optional approval note"}">${escapeHtml(member.remarks)}</textarea>
        </label>
        <div class="message" id="pendingStatusMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="${status === "Rejected" ? "danger" : "primary"}" type="submit">${escapeHtml(actionLabels[status] || "Save")}</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#pendingStatusForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const remarks = String(new FormData(event.currentTarget).get("remarks") || "").trim();
    if (needsReason && !remarks) {
      backdrop.querySelector("#pendingStatusMessage").textContent = "Reason is required.";
      return;
    }
    try {
      await request(`/api/members/${member.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, remarks })
      });
      backdrop.remove();
      await loadDashboard();
      await loadPending();
      renderApp();
    } catch (error) {
      backdrop.querySelector("#pendingStatusMessage").textContent = error.message;
    }
  });
}

function openMemberModal(member = {}) {
  const lists = state.dashboard.lists;
  const isEdit = Boolean(member.id);
  const selectedDistrict = member.district || state.user.district || "";
  const selectedTaluk = member.taluk || state.user.taluk || "";
  const talukOptions = taluksForDistrict(lists, selectedDistrict);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="memberForm">
        <div class="modal-head">
          <h2>${isEdit ? "Edit member" : "Add member"}</h2>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="three">
          ${field("name", "Name", member.name)}
          ${field("lsNumber", "LS Number", member.lsNumber)}
          ${field("loginId", "Login ID", member.loginId)}
        </div>
        <div class="three">
          ${selectField("district", "District", lists.districts, selectedDistrict, state.user.role !== "admin")}
          ${selectField("taluk", "Taluk", talukOptions, selectedTaluk, state.user.role !== "admin")}
          ${selectField("gender", "Gender", ["Male", "Female", "Other"], member.gender)}
        </div>
        <div class="three">
          ${field("dateOfBirth", "Date of Birth", member.dateOfBirth, "date")}
          ${field("age", "Age", member.age, "number")}
          ${field("phoneNumber", "Phone Number", member.phoneNumber)}
        </div>
        <div class="two">
          ${field("qualification", "Qualification", member.qualification)}
          ${field("batchYear", "Batch Year", member.batchYear, "number")}
        </div>
        <div class="two">
          ${selectField("status", "Status", ["Active", "Inactive", "Pending verification"], member.status || "Active")}
          <label>Remarks <textarea name="remarks" rows="2">${escapeHtml(member.remarks)}</textarea></label>
        </div>
        <div class="message" id="memberMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">${isEdit ? "Save changes" : "Create member"}</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  const districtSelect = backdrop.querySelector('select[name="district"]');
  const talukSelect = backdrop.querySelector('select[name="taluk"]');
  if (districtSelect && talukSelect && state.user.role === "admin") {
    districtSelect.addEventListener("change", () => {
      talukSelect.innerHTML = `<option value="">Select</option>${optionList(taluksForDistrict(lists, districtSelect.value))}`;
    });
  }
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#memberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request(isEdit ? `/api/members/${member.id}` : "/api/members", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      backdrop.remove();
      await loadDashboard();
      await loadMembers(state.members.page);
      renderApp();
    } catch (error) {
      backdrop.querySelector("#memberMessage").textContent = error.message;
    }
  });
}

function openMemberLoginControlModal(member) {
  if (!member) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="memberLoginControlForm">
        <div class="modal-head">
          <div>
            <h2>Member login control</h2>
            <p class="muted">${escapeHtml(member.name)} - ${escapeHtml(member.lsNumber)} - ${escapeHtml(member.taluk)}</p>
          </div>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="status-review-card">
          <strong>${member.memberLoginActive ? "Login active" : "Login disabled"}</strong>
          <span>Admin can enable/disable member login or reset password.</span>
        </div>
        <label class="check">
          <input type="checkbox" name="active" ${member.memberLoginActive ? "checked" : ""}>
          Login active
        </label>
        <label>Reset password
          <input name="password" type="password" minlength="6" placeholder="Leave blank to keep existing password">
        </label>
        <div class="message" id="memberLoginControlMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">Save login control</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#memberLoginControlForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/members/${member.id}/login-control`, {
        method: "PUT",
        body: JSON.stringify({
          active: form.get("active") === "on",
          password: form.get("password") || ""
        })
      });
      backdrop.remove();
      await loadMembers(state.members.page);
      renderApp();
    } catch (error) {
      backdrop.querySelector("#memberLoginControlMessage").textContent = error.message;
    }
  });
}

function openCorrectionRequestModal(member) {
  if (!member) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="correctionRequestForm">
        <div class="modal-head">
          <h2>Request correction</h2>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <p class="muted">${escapeHtml(member.name)} - ${escapeHtml(member.lsNumber)} - ${escapeHtml(member.taluk)}</p>
        <div class="two">
          ${field("name", "Name", member.name)}
          ${field("phoneNumber", "Phone Number", member.phoneNumber)}
        </div>
        <div class="two">
          ${field("lsNumber", "LS Number", member.lsNumber)}
          ${field("loginId", "Login ID", member.loginId)}
        </div>
        <div class="two">
          ${field("qualification", "Qualification", member.qualification)}
          ${field("batchYear", "Batch Year", member.batchYear, "number")}
        </div>
        <div class="three">
          ${field("dateOfBirth", "Date of Birth", member.dateOfBirth, "date")}
          ${field("age", "Age", member.age, "number")}
          ${selectField("gender", "Gender", ["Male", "Female", "Other"], member.gender)}
        </div>
        <div class="three">
          ${selectField("maritalStatus", "Marital Status", ["Married", "Unmarried", "Widow/Widower", "Divorced"], member.maritalStatus)}
          ${selectField("kalyanaKarnataka", "Kalyana Karnataka", ["Yes", "No"], member.kalyanaKarnataka)}
          ${selectField("category", "Category", ["GM", "SC", "ST", "Cat-1", "2A", "2B", "3A", "3B"], member.category)}
        </div>
        <div class="three">
          ${field("caste", "Caste", member.caste)}
          ${field("religion", "Religion", member.religion)}
          ${selectField("disability", "Disability", ["None", "Yes"], member.disability)}
        </div>
        <div class="two">
          ${field("otherTaluks", "Other Taluks", member.otherTaluks)}
          <label>Address <textarea name="address" rows="2">${escapeHtml(member.address)}</textarea></label>
        </div>
        <label>Reason <textarea name="reason" rows="3" required placeholder="Explain why this correction is needed"></textarea></label>
        <div class="message" id="correctionRequestMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">Send to admin</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#correctionRequestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    const changes = {};
    [
      "name", "phoneNumber", "lsNumber", "loginId", "qualification", "batchYear",
      "dateOfBirth", "age", "gender", "maritalStatus", "kalyanaKarnataka", "category",
      "caste", "religion", "disability", "otherTaluks", "address"
    ].forEach((fieldName) => {
      changes[fieldName] = form.get(fieldName);
    });
    try {
      await request("/api/data-correction-requests", {
        method: "POST",
        body: JSON.stringify({ memberId: member.id, reason, changes })
      });
      backdrop.remove();
      alert("Correction request sent to admin.");
    } catch (error) {
      backdrop.querySelector("#correctionRequestMessage").textContent = error.message;
    }
  });
}

function renderMembershipForm() {
  const lists = state.dashboard.lists;
  const selectedDistrict = state.user.role === "taluk" ? state.user.district : "";
  const selectedTaluk = state.user.role === "taluk" ? state.user.taluk : "";
  const talukOptions = taluksForDistrict(lists, selectedDistrict);

  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <h2>New membership entry</h2>
      <p class="muted">Share public form: <a href="/membership.html" target="_blank">/membership.html</a></p>
      <form class="form-grid" id="membershipForm">
        <div class="three">
          ${field("name", "Name")}
          ${field("lsNumber", "LS Number")}
          ${field("loginId", "Login ID")}
        </div>
        <div class="three">
          ${selectField("district", "District", lists.districts, selectedDistrict, state.user.role !== "admin")}
          ${selectField("taluk", "Taluk", talukOptions, selectedTaluk, state.user.role !== "admin")}
          ${selectField("gender", "Gender", ["Male", "Female", "Other"])}
        </div>
        <div class="three">
          ${field("dateOfBirth", "Date of Birth", "", "date")}
          ${field("age", "Age", "", "number")}
          ${field("phoneNumber", "Phone Number")}
        </div>
        <div class="two">
          ${field("qualification", "Qualification")}
          ${field("batchYear", "Batch Year", "", "number")}
        </div>
        <div class="two">
          ${selectField("status", "Status", ["Active", "Inactive", "Pending verification"], "Active")}
          <label>Remarks <textarea name="remarks" rows="2"></textarea></label>
        </div>
        <div class="message" id="membershipMessage"></div>
        <div class="actions">
          <button class="primary" type="submit">Create membership</button>
          <button class="secondary" type="reset">Clear</button>
        </div>
      </form>
    </section>
  `;

  const form = document.querySelector("#membershipForm");
  const districtSelect = form.querySelector('select[name="district"]');
  const talukSelect = form.querySelector('select[name="taluk"]');
  if (state.user.role === "admin") {
    districtSelect.addEventListener("change", () => {
      talukSelect.innerHTML = `<option value="">Select</option>${optionList(taluksForDistrict(lists, districtSelect.value))}`;
    });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#membershipMessage");
    try {
      await request("/api/members", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      form.reset();
      if (state.user.role === "taluk") {
        form.querySelector('select[name="district"]').value = selectedDistrict;
        form.querySelector('select[name="taluk"]').value = selectedTaluk;
      }
      message.textContent = "Membership created";
      message.classList.add("success");
      await loadDashboard();
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove("success");
    }
  });
}

function field(name, label, value = "", type = "text") {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}"></label>`;
}

function selectField(name, label, items, value = "", disabled = false, labels = {}) {
  return `<label>${label}<select name="${name}" ${disabled ? "disabled" : ""}><option value="">Select</option>${optionList(items, value, labels)}</select>${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ""}</label>`;
}

function renderUsers() {
  const lists = state.dashboard.lists;
  const canManageUsers = state.user.role === "admin";
  const roleOptions = ["admin", "division", "district", "taluk"];
  const filteredUsers = filterUsersForView(state.users);
  const counts = userCounts(state.users);
  document.querySelector("#view").innerHTML = `
    <div class="stats">
      <div class="box stat"><span class="muted">Total logins</span><strong>${state.users.length}</strong></div>
      <div class="box stat"><span class="muted">Division Teams</span><strong>${counts.division}</strong></div>
      <div class="box stat"><span class="muted">District Presidents</span><strong>${counts.district}</strong></div>
      <div class="box stat"><span class="muted">Taluk Teams</span><strong>${counts.taluk}</strong></div>
    </div>
    <div class="split">
      <section class="box section ${canManageUsers ? "" : "hidden"}">
        <h2>Create login</h2>
        <form id="userForm" class="form-grid">
          <div class="two">
            ${field("name", "Team/User Name")}
            ${field("username", "Username")}
          </div>
          <div class="two">
            ${field("password", "Password", "", "password")}
            ${selectField("role", "Role", ["taluk", "district", "division", "admin"], "taluk", false, roleLabels)}
          </div>
          <div class="two">
            ${selectField("district", "District / Division", lists.districts)}
            ${selectField("taluk", "Assigned Taluk", [])}
          </div>
          <button class="primary" type="submit">Create login</button>
          <div class="message" id="userMessage"></div>
        </form>
        <div class="join-link-panel">
          <h2>Create taluk team join link</h2>
          <p class="muted">Share this basic form with interested members. They choose their User ID and password; admin approval activates the login.</p>
          <div class="two">
            ${selectField("joinDistrict", "District", lists.districts)}
            ${selectField("joinTaluk", "Taluk", [])}
          </div>
          <button class="secondary" id="createJoinLink">Create share link</button>
          <div class="message success" id="joinLinkMessage">${latestJoinLink ? `<a href="${latestJoinLink}" target="_blank">${latestJoinLink}</a>` : ""}</div>
        </div>
      </section>
      <section class="box section">
        <div class="section-head">
          <h2>${canManageUsers ? "Existing logins" : "Taluk technical team"}</h2>
        </div>
        <div class="user-toolbar">
          <label>Search <input id="userSearch" value="${escapeHtml(state.userFilters.search)}" placeholder="Username, name, district"></label>
          <label>Role <select id="userRole"><option value="">All roles</option>${optionList(roleOptions, state.userFilters.role, roleLabels)}</select></label>
          <label>District <select id="userDistrict"><option value="">All districts</option>${optionList(lists.districts, state.userFilters.district)}</select></label>
          <button class="secondary" id="applyUserFilters">Apply</button>
        </div>
        <div class="account-grid">
          ${filteredUsers.map((user) => accountCard(user, canManageUsers)).join("")}
        </div>
      </section>
    </div>
    ${canManageUsers ? renderTeamRequests() : ""}
  `;

  document.querySelector("#applyUserFilters").addEventListener("click", () => {
    state.userFilters.search = document.querySelector("#userSearch").value;
    state.userFilters.role = document.querySelector("#userRole").value;
    state.userFilters.district = document.querySelector("#userDistrict").value;
    renderApp();
  });

  if (!canManageUsers) return;

  const districtSelect = document.querySelector('#userForm select[name="district"]');
  const talukSelect = document.querySelector('#userForm select[name="taluk"]');
  const joinDistrict = document.querySelector('select[name="joinDistrict"]');
  const joinTaluk = document.querySelector('select[name="joinTaluk"]');
  const roleSelect = document.querySelector('#userForm select[name="role"]');
  roleSelect.addEventListener("change", () => {
    const needsTaluk = roleSelect.value === "taluk";
    const needsDivision = roleSelect.value === "division";
    districtSelect.innerHTML = `<option value="">Select</option>${optionList(needsDivision ? (lists.divisions || []) : lists.districts)}`;
    talukSelect.disabled = !needsTaluk;
    if (!needsTaluk) talukSelect.value = "";
  });
  districtSelect.addEventListener("change", () => {
    talukSelect.innerHTML = `<option value="">Select</option>${optionList(taluksForDistrict(lists, districtSelect.value))}`;
  });
  joinDistrict.addEventListener("change", () => {
    joinTaluk.innerHTML = `<option value="">Select</option>${optionList(taluksForDistrict(lists, joinDistrict.value))}`;
  });
  document.querySelector("#createJoinLink").addEventListener("click", async () => {
    if (!joinDistrict.value || !joinTaluk.value) {
      document.querySelector("#joinLinkMessage").textContent = "Select district and taluk";
      return;
    }
    const data = await request("/api/join-links", {
      method: "POST",
      body: JSON.stringify({ district: joinDistrict.value, taluk: joinTaluk.value })
    });
    latestJoinLink = `${window.location.origin}${data.link}`;
    document.querySelector("#joinLinkMessage").innerHTML = `<a href="${latestJoinLink}" target="_blank">${latestJoinLink}</a>`;
  });

  document.querySelector("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#userMessage");
    try {
      await request("/api/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
      });
      message.textContent = "Login created";
      message.classList.add("success");
      await loadUsers();
      renderApp();
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove("success");
    }
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this login?")) return;
      await request(`/api/users/${button.dataset.deleteUser}`, { method: "DELETE" });
      await loadUsers();
      renderApp();
    });
  });
  document.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.users.find((user) => user.id === button.dataset.resetUser);
      openPasswordModal(target);
    });
  });
  document.querySelectorAll("[data-team-request]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.dataset.status;
      const item = state.teamRequests.find((request) => request.id === button.dataset.teamRequest);
      let remarks = "";
      if (status === "Rejected") {
        const note = prompt("Reason for rejection:", item.remarks || "");
        if (note === null) return;
        remarks = note;
      }
      await request(`/api/taluk-team-requests/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ status, remarks })
      });
      await loadUsers();
      renderApp();
    });
  });
  document.querySelectorAll("[data-copy-login-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = state.teamRequests.find((request) => request.id === button.dataset.copyLoginMessage);
      if (!item) return;
      await copyText(loginApprovalMessage(item));
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Copy message";
      }, 1400);
    });
  });
}

function renderTeamRequests() {
  return `
    <section class="box section">
      <div class="section-head">
        <h2>Taluk team join requests</h2>
        <span class="badge">${state.teamRequests.filter((item) => item.status === "Pending").length} Pending</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>District</th>
              <th>Taluk</th>
              <th>User ID</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.teamRequests.map((item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.phoneNumber)}</td>
                <td>${escapeHtml(item.district)}</td>
                <td>${escapeHtml(item.taluk)}</td>
                <td>${escapeHtml(item.requestedUsername)}</td>
                <td><span class="badge">${escapeHtml(item.status)}</span></td>
                <td class="actions">
                  ${item.status === "Pending" ? `
                    <button class="primary" data-team-request="${item.id}" data-status="Approved">Approve login</button>
                    <button class="danger" data-team-request="${item.id}" data-status="Rejected">Reject</button>
                  ` : teamRequestFollowup(item)}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function teamRequestFollowup(item) {
  if (item.status !== "Approved") return escapeHtml(item.remarks || "-");
  const whatsapp = `https://wa.me/91${encodeURIComponent(item.phoneNumber)}?text=${encodeURIComponent(loginApprovalMessage(item))}`;
  return `
    <button class="secondary" data-copy-login-message="${item.id}">Copy message</button>
    <a class="secondary" href="${whatsapp}" target="_blank">WhatsApp</a>
  `;
}

function loginApprovalMessage(item) {
  return [
    `Dear ${item.name},`,
    "",
    "Your KLSWA Taluk Technical Team login has been approved.",
    `District: ${item.district}`,
    `Taluk: ${item.taluk}`,
    `User ID: ${item.requestedUsername}`,
    `Password: ${item.requestedPassword}`,
    "",
    "Login: https://klswa.in/",
    "",
    "Please keep your login details confidential."
  ].join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function userCounts(users) {
  return {
    active: users.filter((user) => user.active).length,
    admin: users.filter((user) => user.role === "admin").length,
    division: users.filter((user) => user.role === "division").length,
    district: users.filter((user) => user.role === "district").length,
    taluk: users.filter((user) => user.role === "taluk").length
  };
}

function filterUsersForView(users) {
  const search = state.userFilters.search.trim().toLowerCase();
  return users.filter((user) => {
    if (state.userFilters.role && user.role !== state.userFilters.role) return false;
    if (state.userFilters.district && user.district !== state.userFilters.district) return false;
    if (!search) return true;
    return [user.username, user.name, user.role, user.district, user.taluk]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function accountCard(user, canManageUsers) {
  const scope = user.role === "division"
    ? `${user.district || "State"} Division`
    : `${user.district ? escapeHtml(user.district) : "All districts"}${user.taluk ? ` / ${escapeHtml(user.taluk)}` : ""}`;
  return `
    <article class="account-card">
      <div>
        <strong>${escapeHtml(user.name || user.username)}</strong>
        <span class="muted">${escapeHtml(user.username)}</span>
      </div>
      <div class="account-meta">
        <span class="badge">${escapeHtml(roleLabels[user.role] || user.role)}</span>
        <span class="badge">${user.active ? "Active" : "Inactive"}</span>
      </div>
      <p class="muted">${scope}</p>
      <div class="actions">
        ${canManageUsers && user.username !== "admin" ? `<button class="secondary" data-reset-user="${user.id}">Password</button>` : ""}
        ${canManageUsers && user.username !== "admin" && user.id !== state.user.id ? `<button class="danger" data-delete-user="${user.id}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function openPasswordModal(user) {
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="passwordForm">
        <div class="modal-head">
          <h2>Reset password</h2>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <p class="muted">${escapeHtml(user.username)} - ${escapeHtml(roleLabels[user.role] || user.role)}</p>
        ${field("password", "New Password", "", "password")}
        <div class="message" id="passwordMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">Save password</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (!password) {
      backdrop.querySelector("#passwordMessage").textContent = "Password is required";
      return;
    }
    try {
      await request(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...user, password })
      });
      backdrop.remove();
      await loadUsers();
      renderApp();
    } catch (error) {
      backdrop.querySelector("#passwordMessage").textContent = error.message;
    }
  });
}

function renderCorrections() {
  const lists = state.dashboard.lists;
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="correctionSearch" value="${escapeHtml(state.correctionFilters.search)}" placeholder="Name, LS number, raw taluk"></label>
        <label>District <select id="correctionDistrict"><option value="">All districts</option>${optionList(lists.districts, state.correctionFilters.district)}</select></label>
        <span></span>
        <span class="actions">
          <button class="secondary" id="applyCorrectionFilters">Apply</button>
          <a class="secondary" href="${exportUrl("/api/exports/corrections", state.correctionFilters)}">Export CSV</a>
        </span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>LS Number</th>
              <th>Raw District</th>
              <th>Raw Taluk</th>
              <th>Correct District</th>
              <th>Correct Taluk</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.corrections.rows.map((member) => correctionRow(member, lists)).join("")}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Unmatched records: ${state.corrections.total}. Showing ${state.corrections.rows.length}.</span>
        <div class="actions">
          <button class="secondary" id="prevCorrectionPage" ${state.corrections.page <= 1 ? "disabled" : ""}>Previous</button>
          <button class="secondary" id="nextCorrectionPage" ${state.corrections.page * state.corrections.size >= state.corrections.total ? "disabled" : ""}>Next</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#applyCorrectionFilters").addEventListener("click", async () => {
    state.correctionFilters.search = document.querySelector("#correctionSearch").value;
    state.correctionFilters.district = document.querySelector("#correctionDistrict").value;
    await loadCorrections(1);
    renderApp();
  });
  document.querySelector("#prevCorrectionPage").addEventListener("click", async () => {
    await loadCorrections(state.corrections.page - 1);
    renderApp();
  });
  document.querySelector("#nextCorrectionPage").addEventListener("click", async () => {
    await loadCorrections(state.corrections.page + 1);
    renderApp();
  });
  document.querySelectorAll("[data-correction-district]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.correctionDistrict;
      const talukSelect = document.querySelector(`[data-correction-taluk="${id}"]`);
      talukSelect.innerHTML = optionList(taluksForDistrict(lists, select.value));
    });
  });
  document.querySelectorAll("[data-save-correction]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveCorrection;
      const district = document.querySelector(`[data-correction-district="${id}"]`).value;
      const taluk = document.querySelector(`[data-correction-taluk="${id}"]`).value;
      if (!district || !taluk) {
        alert("Select district and taluk");
        return;
      }
      await request(`/api/taluk-corrections/${id}`, {
        method: "PUT",
        body: JSON.stringify({ district, taluk })
      });
      await loadDashboard();
      await loadCorrections(state.corrections.page);
      renderApp();
    });
  });
}

function renderDuplicates() {
  const summary = state.duplicates.summary || {};
  document.querySelector("#view").innerHTML = `
    <div class="stats">
      <div class="box stat"><span class="muted">Duplicate groups</span><strong>${summary.totalGroups || 0}</strong></div>
      <div class="box stat"><span class="muted">Phone</span><strong>${summary.phoneNumber || 0}</strong></div>
      <div class="box stat"><span class="muted">LS Number</span><strong>${summary.lsNumber || 0}</strong></div>
      <div class="box stat"><span class="muted">Login ID / Name</span><strong>${(summary.loginId || 0) + (summary.name || 0)}</strong></div>
    </div>
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="duplicateSearch" value="${escapeHtml(state.duplicateFilters.search)}" placeholder="Name, phone, LS number, login ID"></label>
        <label>Type <select id="duplicateType">
          <option value="">All duplicate types</option>
          ${optionList(["phoneNumber", "lsNumber", "loginId", "name"], state.duplicateFilters.type, {
            phoneNumber: "Phone Number",
            lsNumber: "LS Number",
            loginId: "Login ID",
            name: "Same Name"
          })}
        </select></label>
        <span></span>
        <button class="secondary" id="applyDuplicateFilters">Apply</button>
      </div>
      <div class="duplicate-list">
        ${state.duplicates.groups.length ? state.duplicates.groups.map(duplicateGroup).join("") : `<p class="muted">No duplicates found.</p>`}
      </div>
    </section>
  `;

  document.querySelector("#applyDuplicateFilters").addEventListener("click", async () => {
    state.duplicateFilters.search = document.querySelector("#duplicateSearch").value;
    state.duplicateFilters.type = document.querySelector("#duplicateType").value;
    await loadDuplicates();
    renderApp();
  });
}

function renderMissingData() {
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <h2>Missing data report</h2>
        <span class="badge">${state.missingData.total || 0} records</span>
      </div>
      <div class="toolbar">
        <label>Search <input id="missingSearch" value="${escapeHtml(state.filters.search)}" placeholder="Name, phone, LS number"></label>
        <span></span>
        <span class="actions">
          <button class="secondary" id="applyMissingSearch">Apply</button>
          <a class="secondary" href="${exportUrl("/api/exports/members", { ...state.filters, missingOnly: "true" })}">Export missing CSV</a>
        </span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>LS Number</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Missing Fields</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            ${state.missingData.rows.map((member) => `
              <tr>
                <td>${escapeHtml(member.name)}</td>
                <td>${escapeHtml(member.lsNumber)}</td>
                <td>${escapeHtml(member.phoneNumber)}</td>
                <td><span class="badge">${escapeHtml(member.status)}</span></td>
                <td><div class="mini-list">${member.missingFields.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></td>
                <td class="actions">
                  <button class="primary" data-missing-request="${member.id}">Fill / Request</button>
                  <button class="secondary" data-copy-missing="${member.id}">Copy msg</button>
                  ${member.phoneNumber ? `<a class="secondary" href="${whatsAppLink(member)}" target="_blank">WhatsApp</a>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector("#applyMissingSearch").addEventListener("click", async () => {
    state.filters.search = document.querySelector("#missingSearch").value;
    await loadMissingData();
    renderApp();
  });
  document.querySelectorAll("[data-copy-missing]").forEach((button) => {
    button.addEventListener("click", async () => {
      const member = state.missingData.rows.find((item) => item.id === button.dataset.copyMissing);
      await copyText(followupMessage(member));
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy msg"; }, 1400);
    });
  });
  document.querySelectorAll("[data-missing-request]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = state.missingData.rows.find((item) => item.id === button.dataset.missingRequest);
      openCorrectionRequestModal(member);
    });
  });
}

function renderDataCorrectionRequests() {
  const pendingCount = state.dataCorrectionRequests.filter((item) => item.status === "Pending").length;
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <h2>${state.user.role === "admin" ? "Pending data corrections" : "My correction requests"}</h2>
        <span class="badge">${pendingCount} Pending</span>
      </div>
      <div class="toolbar">
        <label>Search <input id="dataCorrectionSearch" value="${escapeHtml(state.dataCorrectionFilters.search)}" placeholder="Member, reason, requested by"></label>
        <span></span>
        <span></span>
        <button class="secondary" id="applyDataCorrectionSearch">Apply</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Requested Changes</th>
              <th>Reason</th>
              <th>Requested By</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.dataCorrectionRequests.map((item) => `
              <tr>
                <td>${escapeHtml(item.memberName)}</td>
                <td>${correctionChangesList(item.requestedChanges)}</td>
                <td>${escapeHtml(item.reason)}</td>
                <td>${escapeHtml(item.requestedByName || "-")}</td>
                <td><span class="badge">${escapeHtml(item.status)}</span></td>
                <td class="actions">
                  ${state.user.role === "admin" && item.status === "Pending" ? `
                    <button class="primary" data-review-correction="${item.id}" data-status="Approved">Approve</button>
                    <button class="danger" data-review-correction="${item.id}" data-status="Rejected">Reject</button>
                  ` : escapeHtml(item.adminRemarks || "-")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector("#applyDataCorrectionSearch").addEventListener("click", async () => {
    state.dataCorrectionFilters.search = document.querySelector("#dataCorrectionSearch").value;
    await loadDataCorrectionRequests();
    renderApp();
  });
  document.querySelectorAll("[data-review-correction]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.dataset.status;
      const adminRemarks = status === "Rejected" ? prompt("Reason for rejection:", "") : "";
      if (adminRemarks === null) return;
      await request(`/api/data-correction-requests/${button.dataset.reviewCorrection}`, {
        method: "PUT",
        body: JSON.stringify({ status, adminRemarks })
      });
      await loadDashboard();
      await loadDataCorrectionRequests();
      renderApp();
    });
  });
}

function correctionChangesList(changes = {}) {
  const entries = Object.entries(changes);
  if (!entries.length) return "-";
  return `<div class="mini-list">${entries.map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</span>`).join("")}</div>`;
}

function duplicateGroup(group) {
  return `
    <section class="duplicate-group">
      <div class="section-head">
        <h2>${escapeHtml(group.label)}: ${escapeHtml(group.value)}</h2>
        <span class="badge">${group.count} records</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>LS Number</th>
              <th>Login ID</th>
              <th>District</th>
              <th>Taluk</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${group.members.map((member) => `
              <tr>
                <td>${escapeHtml(member.name)}</td>
                <td>${escapeHtml(member.lsNumber)}</td>
                <td>${escapeHtml(member.loginId)}</td>
                <td>${escapeHtml(member.district)}</td>
                <td>${escapeHtml(member.taluk)}</td>
                <td>${escapeHtml(member.phoneNumber)}</td>
                <td><span class="badge">${escapeHtml(member.status)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAuditLogs() {
  const actions = [...new Set(["Created", "Updated", "Status changed", "Deleted", "Correction approved", ...state.auditLogs.map((log) => log.action).filter(Boolean)])].sort();
  const suspicious = suspiciousAuditItems(state.auditLogs);
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="auditSearch" value="${escapeHtml(state.auditFilters.search)}" placeholder="Member, LS number, phone, value"></label>
        <label>Editor <input id="auditEditor" value="${escapeHtml(state.auditFilters.editor)}" placeholder="Admin, taluk user, role"></label>
        <label>Action
          <select id="auditAction">
            <option value="">All actions</option>
            ${optionList(actions, state.auditFilters.action)}
          </select>
        </label>
        <label>From <input id="auditFrom" type="date" value="${escapeHtml(state.auditFilters.from)}"></label>
        <label>To <input id="auditTo" type="date" value="${escapeHtml(state.auditFilters.to)}"></label>
        <button class="secondary" id="applyAuditSearch">Apply</button>
        <button class="secondary" id="clearAuditSearch">Clear</button>
        <a class="secondary" href="${exportUrl("/api/exports/audit-logs", state.auditFilters)}">Export CSV</a>
      </div>
      ${suspicious.length ? `
        <div class="audit-alerts">
          ${suspicious.map((item) => `
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Member</th>
              <th>Action</th>
              <th>Field</th>
              <th>Old Value</th>
              <th>New Value</th>
              <th>Edited By</th>
              <th>Timeline</th>
            </tr>
          </thead>
          <tbody>
            ${state.auditLogs.map((log) => `
              <tr>
                <td>${escapeHtml(formatDateTime(log.createdAt))}</td>
                <td>${escapeHtml(log.memberName)}</td>
                <td><span class="badge">${escapeHtml(log.action)}</span></td>
                <td>${escapeHtml(log.field)}</td>
                <td><span class="diff-old">${escapeHtml(log.oldValue || "-")}</span></td>
                <td><span class="diff-new">${escapeHtml(log.newValue || "-")}</span></td>
                <td>${escapeHtml(log.actorName)} <span class="muted">(${escapeHtml(log.actorRole)})</span></td>
                <td>${log.memberId ? `<button class="secondary" data-audit-member="${escapeHtml(log.memberId)}">View</button>` : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Showing latest ${state.auditLogs.length} audit entries</span>
      </div>
    </section>
  `;

  document.querySelector("#applyAuditSearch").addEventListener("click", async () => {
    state.auditFilters.search = document.querySelector("#auditSearch").value;
    state.auditFilters.editor = document.querySelector("#auditEditor").value;
    state.auditFilters.action = document.querySelector("#auditAction").value;
    state.auditFilters.from = document.querySelector("#auditFrom").value;
    state.auditFilters.to = document.querySelector("#auditTo").value;
    state.auditFilters.memberId = "";
    await loadAuditLogs();
    renderApp();
  });
  document.querySelector("#clearAuditSearch").addEventListener("click", async () => {
    state.auditFilters = { search: "", editor: "", action: "", from: "", to: "", memberId: "" };
    await loadAuditLogs();
    renderApp();
  });
  document.querySelectorAll("[data-audit-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openAuditTimeline(button.dataset.auditMember);
    });
  });
}

function suspiciousAuditItems(logs) {
  const byActor = {};
  const byRejectActor = {};
  const outsideHours = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  logs.forEach((log) => {
    const time = new Date(log.createdAt);
    const actor = log.actorName || log.actorId || "Unknown";
    if (now - time.getTime() <= dayMs) byActor[actor] = (byActor[actor] || 0) + 1;
    if (log.action === "Status changed" && log.newValue === "Rejected") {
      byRejectActor[actor] = (byRejectActor[actor] || 0) + 1;
    }
    const hour = time.getHours();
    if (!Number.isNaN(hour) && (hour < 6 || hour > 22)) outsideHours.push(log);
  });
  const items = [];
  Object.entries(byActor).filter(([, count]) => count >= 25).slice(0, 3).forEach(([actor, count]) => {
    items.push({ title: "High edit volume", detail: `${actor} made ${count} audit changes in the latest 24 hours.` });
  });
  Object.entries(byRejectActor).filter(([, count]) => count >= 5).slice(0, 3).forEach(([actor, count]) => {
    items.push({ title: "Repeated rejections", detail: `${actor} rejected ${count} records in the current filtered list.` });
  });
  if (outsideHours.length >= 5) {
    items.push({ title: "Outside-hours edits", detail: `${outsideHours.length} changes happened before 6 AM or after 10 PM in the current filtered list.` });
  }
  return items.slice(0, 4);
}

async function openAuditTimeline(memberId) {
  const params = new URLSearchParams({ memberId, limit: "500" });
  const logs = await request(`/api/audit-logs?${params.toString()}`);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <section class="box modal">
        <div class="modal-head">
          <div>
            <h2>Member timeline</h2>
            <p class="muted">${escapeHtml(logs[0]?.memberName || "Member audit history")}</p>
          </div>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="timeline">
          ${logs.map((log) => `
            <div class="timeline-item">
              <span class="muted">${escapeHtml(formatDateTime(log.createdAt))} - ${escapeHtml(log.actorName)} (${escapeHtml(log.actorRole)})</span>
              <strong>${escapeHtml(log.action)} / ${escapeHtml(log.field)}</strong>
              <div class="timeline-diff">
                <span class="diff-old">${escapeHtml(log.oldValue || "-")}</span>
                <span class="diff-new">${escapeHtml(log.newValue || "-")}</span>
              </div>
            </div>
          `).join("") || `<p class="muted">No audit history found.</p>`}
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Close</button>
          <a class="secondary" href="${exportUrl("/api/exports/audit-logs", { memberId })}">Export member CSV</a>
        </div>
      </section>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function correctionRow(member, lists) {
  const district = member.suggestedDistrict && lists.districts.includes(member.suggestedDistrict)
    ? member.suggestedDistrict
    : "";
  const taluks = taluksForDistrict(lists, district);
  const taluk = member.suggestedTaluk && taluks.includes(member.suggestedTaluk) ? member.suggestedTaluk : "";
  return `
    <tr>
      <td>${escapeHtml(member.name)}</td>
      <td>${escapeHtml(member.lsNumber)}</td>
      <td>${escapeHtml(member.rawDistrict)}</td>
      <td>${escapeHtml(member.rawTaluk)}</td>
      <td><select data-correction-district="${member.id}"><option value="">Select</option>${optionList(lists.districts, district)}</select></td>
      <td><select data-correction-taluk="${member.id}"><option value="">Select</option>${optionList(taluks, taluk)}</select></td>
      <td><button class="primary" data-save-correction="${member.id}">Save</button></td>
    </tr>
  `;
}

boot();
