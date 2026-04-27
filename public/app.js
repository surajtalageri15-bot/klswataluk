const state = {
  user: null,
  tab: "dashboard",
  dashboard: null,
  users: [],
  members: { rows: [], page: 1, size: 25, total: 0 },
  filters: { search: "", district: "", taluk: "" }
};

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

function optionList(items, selected = "") {
  return items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
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
          <p class="muted">Default admin login is username <strong>admin</strong> and password <strong>admin</strong>.</p>
          <div class="form-grid">
            <label>Username <input name="username" value="admin" autocomplete="username"></label>
            <label>Password <input name="password" value="admin" type="password" autocomplete="current-password"></label>
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

async function loadUsers() {
  if (state.user.role !== "admin") return;
  const data = await request("/api/users");
  state.users = data.users;
}

function renderApp() {
  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="brand">Surveyor Register</div>
        <div class="user-pill">
          <strong>${escapeHtml(state.user.name)}</strong><br>
          <span>${state.user.role === "admin" ? "Admin" : `${escapeHtml(state.user.taluk)} Taluk`}</span>
        </div>
        <nav class="nav">
          <button data-tab="dashboard" class="${state.tab === "dashboard" ? "active" : ""}">Dashboard</button>
          <button data-tab="members" class="${state.tab === "members" ? "active" : ""}">Members</button>
          ${state.user.role === "admin" ? `<button data-tab="users" class="${state.tab === "users" ? "active" : ""}">Taluk Team</button>` : ""}
        </nav>
        <button class="secondary" id="logoutBtn">Logout</button>
      </aside>
      <section class="content">
        <div class="topbar">
          <h1>${state.tab === "dashboard" ? "Dashboard" : state.tab === "members" ? "Member Data" : "Taluk Team Assignment"}</h1>
          ${state.tab === "members" ? `<button class="primary" id="addMemberBtn">+ Add member</button>` : ""}
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
      if (state.tab === "users") await loadUsers();
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
  if (state.tab === "users") renderUsers();
}

function renderDashboard() {
  const summary = state.dashboard.summary;
  document.querySelector("#view").innerHTML = `
    <div class="stats">
      <div class="box stat"><span class="muted">Surveyors</span><strong>${summary.total}</strong></div>
      <div class="box stat"><span class="muted">Districts</span><strong>${summary.districts}</strong></div>
      <div class="box stat"><span class="muted">Taluks</span><strong>${summary.taluks}</strong></div>
      <div class="box stat"><span class="muted">Female</span><strong>${summary.gender.Female || 0}</strong></div>
    </div>
    <div class="split">
      <section class="box section">
        <h2>Top districts</h2>
        <div class="list">${summary.topDistricts.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
      <section class="box section">
        <h2>Top taluks</h2>
        <div class="list">${summary.topTaluks.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
    </div>
  `;
}

function row(name, count) {
  return `<div class="list-row"><span>${escapeHtml(name)}</span><span class="badge">${count}</span></div>`;
}

function renderMembers() {
  const lists = state.dashboard.lists;
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="searchInput" value="${escapeHtml(state.filters.search)}" placeholder="Name, LS number, phone"></label>
        <label>District <select id="districtFilter"><option value="">All districts</option>${optionList(lists.districts, state.filters.district)}</select></label>
        <label>Taluk <select id="talukFilter"><option value="">All taluks</option>${optionList(lists.taluks, state.filters.taluk)}</select></label>
        <button class="secondary" id="applyFilters">Apply</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.slice(0, 10).map(([, label]) => `<th>${label}</th>`).join("")}<th>Actions</th></tr></thead>
          <tbody>
            ${state.members.rows.map((member) => `
              <tr>
                ${columns.slice(0, 10).map(([key]) => `<td>${escapeHtml(member[key])}</td>`).join("")}
                <td class="actions">
                  <button class="icon-btn" title="Edit" data-edit="${member.id}">E</button>
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

function openMemberModal(member = {}) {
  const lists = state.dashboard.lists;
  const isEdit = Boolean(member.id);
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
          ${selectField("district", "District", lists.districts, member.district || state.user.district, state.user.role !== "admin")}
          ${selectField("taluk", "Taluk", lists.taluks, member.taluk || state.user.taluk, state.user.role !== "admin")}
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

function field(name, label, value = "", type = "text") {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}"></label>`;
}

function selectField(name, label, items, value = "", disabled = false) {
  return `<label>${label}<select name="${name}" ${disabled ? "disabled" : ""}><option value="">Select</option>${optionList(items, value)}</select>${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ""}</label>`;
}

function renderUsers() {
  const lists = state.dashboard.lists;
  document.querySelector("#view").innerHTML = `
    <div class="split">
      <section class="box section">
        <h2>Create taluk login</h2>
        <form id="userForm" class="form-grid">
          <div class="two">
            ${field("name", "Team/User Name")}
            ${field("username", "Username")}
          </div>
          <div class="two">
            ${field("password", "Password", "", "password")}
            ${selectField("role", "Role", ["taluk", "admin"], "taluk")}
          </div>
          <div class="two">
            ${selectField("district", "District", lists.districts)}
            ${selectField("taluk", "Assigned Taluk", lists.taluks)}
          </div>
          <button class="primary" type="submit">Create login</button>
          <div class="message" id="userMessage"></div>
        </form>
      </section>
      <section class="box section">
        <h2>Existing logins</h2>
        <div class="list">
          ${state.users.map((user) => `
            <div class="list-row">
              <span><strong>${escapeHtml(user.username)}</strong><br><span class="muted">${escapeHtml(user.role)} ${user.taluk ? `- ${escapeHtml(user.taluk)}` : ""}</span></span>
              <span class="badge">${user.active ? "Active" : "Inactive"}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;

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
      event.currentTarget.reset();
      await loadUsers();
      renderApp();
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove("success");
    }
  });
}

boot();
