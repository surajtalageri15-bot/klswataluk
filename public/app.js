const state = {
  user: null,
  tab: "dashboard",
  dashboard: null,
  users: [],
  corrections: { rows: [], page: 1, size: 50, total: 0 },
  pending: { rows: [], page: 1, size: 25, total: 0 },
  members: { rows: [], page: 1, size: 25, total: 0 },
  teamRequests: [],
  teamChatMessages: [],
  auditLogs: [],
  presidentMessages: [],
  missingData: { rows: [], total: 0 },
  duplicates: { summary: { totalGroups: 0, phoneNumber: 0, lsNumber: 0, loginId: 0, name: 0 }, groups: [] },
  dataCorrectionRequests: [],
  memberProblems: [],
  donations: { donations: [], summary: { totalAmount: 0, pendingAmount: 0, verifiedAmount: 0, count: 0, byFund: {} }, razorpayConfigured: false },
  serviceBookMembers: [],
  problemFilters: { search: "", status: "" },
  donationFilters: { search: "", status: "Paid", fundType: "" },
  sessionAnalytics: { summary: { users: 0, sessionCount: 0, totalSeconds: 0, todaySeconds: 0, activeUsers: 0 }, rows: [] },
  sessionFilters: { search: "", role: "taluk", from: "", to: "" },
  filters: { search: "", district: "", taluk: "" },
  correctionFilters: { search: "", district: "" },
  userFilters: { search: "", role: "", district: "" },
  auditFilters: { search: "", editor: "", action: "", from: "", to: "", memberId: "" },
  duplicateFilters: { search: "", type: "" },
  dataCorrectionFilters: { search: "" },
  memberNotes: { member: null, notes: [] },
  restorePreview: null,
  sliderPhotos: [],
  teamWhatsAppLink: "",
  messageDraft: {
    audience: "all_members",
    subject: "State President Notice",
    body: ""
  }
};

let latestJoinLink = "";
let heartbeatTimer = null;
let teamChatReplyToId = "";

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
  state_president: "State President",
  division: "State Division Technical Team",
  district: "District President",
  district_technical_head: "District Technical Head",
  legal_team_head: "Legal Team Head",
  taluk: "Taluk Technical Team"
};

const talukPermissionLabels = {
  createMembership: "Create membership entries",
  approveMembership: "Approve / reject membership",
  submitCorrection: "Submit correction requests",
  approveCorrection: "Approve / reject corrections",
  teamChat: "Team chat",
  exportReports: "Export reports"
};

const talukPermissionDefaults = Object.fromEntries(Object.keys(talukPermissionLabels).map((key) => [key, true]));

function talukPermissions(user = state.user) {
  return { ...talukPermissionDefaults, ...((user && typeof user.permissions === "object" && user.permissions) || {}) };
}

function canTaluk(permission, user = state.user) {
  if (!user) return false;
  if (user.role !== "taluk") return true;
  return talukPermissions(user)[permission] !== false;
}

function canViewDonations() {
  return ["admin", "state_president", "division", "district", "district_technical_head", "taluk"].includes(state.user?.role);
}

function canVerifyDonations() {
  return ["admin", "state_president", "division", "district_technical_head"].includes(state.user?.role);
}

const workflowPendingStatuses = ["Pending Taluk Review", "Pending District Review", "Pending Division Final Approval", "Pending verification"];
const memberStatusOptions = ["Active", ...workflowPendingStatuses, "Inactive", "Needs correction", "Rejected"];
const editableMemberStatusOptions = ["Active", "Inactive", ...workflowPendingStatuses, "Needs correction", "Rejected"];
const inactiveMemberRemark = "Member submitted application but is currently inactive. Kept in records for admin follow-up.";

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
  return items.map((item) => `<option value="${escapeHtml(item)}" ${String(item) === String(selected) ? "selected" : ""}>${escapeHtml(labels[item] || item)}</option>`).join("");
}

function batchYearOptions() {
  const end = Math.max(2026, new Date().getFullYear());
  return Array.from({ length: end - 1998 + 1 }, (_, index) => String(end - index));
}

function calculateAgeFromDob(value) {
  if (!value) return "";
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return Number.isFinite(age) && age > 0 ? String(age) : "";
}

function bindAgeCalculation(root) {
  const dob = root.querySelector('input[name="dateOfBirth"]');
  const age = root.querySelector('input[name="age"]');
  if (!dob || !age) return;
  const update = () => {
    age.value = calculateAgeFromDob(dob.value);
  };
  dob.addEventListener("input", update);
  dob.addEventListener("change", update);
  update();
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

function rupees(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function sendHeartbeat() {
  if (!state.user) return;
  try {
    await request("/api/session-heartbeat", { method: "POST", body: "{}" });
  } catch {
    // Ignore heartbeat failures so normal work is never interrupted.
  }
}

function startHeartbeat() {
  stopHeartbeat();
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 60000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendHeartbeat();
});

window.addEventListener("beforeunload", () => {
  if (state.user && navigator.sendBeacon) {
    navigator.sendBeacon("/api/session-heartbeat", new Blob(["{}"], { type: "application/json" }));
  }
});

async function boot() {
  try {
    const data = await request("/api/me");
    state.user = data.user;
    await loadDashboard();
    if (state.user.role === "legal_team_head") {
      state.tab = "memberProblems";
      await loadMemberProblems();
    }
    if (state.user.role === "taluk") await loadTalukWork();
    startHeartbeat();
    renderApp();
  } catch {
    stopHeartbeat();
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
        <form class="box login-card" id="forgotLoginForm">
          <h2>Forgot password</h2>
          <p class="muted">Reset using your username and registered mobile number.</p>
          <div class="form-grid">
            <label>Username <input name="username" autocomplete="username"></label>
            <label>Registered phone <input name="phoneNumber" inputmode="numeric" placeholder="10-digit phone"></label>
            <label>New password <input name="password" type="password" minlength="6"></label>
            <label>Confirm password <input name="confirmPassword" type="password" minlength="6"></label>
            <button class="secondary" type="submit">Reset password</button>
            <div class="message" id="forgotLoginMessage"></div>
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
      if (state.user.role === "legal_team_head") {
        state.tab = "memberProblems";
        await loadMemberProblems();
      }
      startHeartbeat();
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  });
  document.querySelector("#forgotLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const messageEl = document.querySelector("#forgotLoginMessage");
    messageEl.textContent = "";
    messageEl.classList.remove("success");
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/forgot-login-password", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      event.currentTarget.reset();
      messageEl.textContent = "Password reset successful. Please sign in with new password.";
      messageEl.classList.add("success");
    } catch (error) {
      messageEl.textContent = error.message;
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
    taluk: state.filters.taluk,
    status: state.filters.status || "",
    gender: state.filters.gender || "",
    batchYear: state.filters.batchYear || "",
    missingOnly: state.filters.missingOnly ? "true" : ""
  });
  state.members = await request(`/api/members?${params.toString()}`);
}

async function loadAllMembersForExport(filters = state.filters) {
  const size = 100;
  let page = 1;
  let rows = [];
  let total = 0;
  do {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
      search: filters.search || "",
      district: filters.district || "",
      taluk: filters.taluk || "",
      status: filters.status || "",
      gender: filters.gender || "",
      batchYear: filters.batchYear || "",
      missingOnly: filters.missingOnly ? "true" : "",
      workflowPending: filters.workflowPending ? "true" : ""
    });
    const data = await request(`/api/members?${params.toString()}`);
    rows = rows.concat(data.rows || []);
    total = data.total || rows.length;
    page += 1;
  } while (rows.length < total);
  return rows;
}

async function loadPending(page = 1) {
  state.pending.page = page;
  const status = reviewQueueStatusForRole();
  const params = new URLSearchParams({
    page: String(page),
    size: "100",
    search: "",
    district: "",
    taluk: "",
    status,
    workflowPending: status ? "" : "true"
  });
  const data = await request(`/api/members?${params.toString()}`);
  state.pending = { ...data, size: 100 };
}

async function loadUsers() {
  if (!["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role)) return;
  const data = await request("/api/users");
  state.users = data.users;
  if (["admin", "division", "district_technical_head"].includes(state.user.role)) {
    const requests = await request("/api/taluk-team-requests");
    state.teamRequests = requests.requests;
  }
}

async function loadCorrections(page = 1) {
  const canViewTalukCorrections = ["admin", "division", "district_technical_head"].includes(state.user.role)
    || (state.user.role === "taluk" && canTaluk("approveCorrection"));
  if (!canViewTalukCorrections) return;
  state.corrections.page = page;
  if (state.user.role === "taluk") state.correctionFilters.district = state.user.district || "";
  const params = new URLSearchParams({
    page: String(page),
    size: String(state.corrections.size),
    search: state.correctionFilters.search,
    district: state.correctionFilters.district
  });
  state.corrections = await request(`/api/taluk-corrections?${params.toString()}`);
}

async function loadAuditLogs() {
  if (!["admin", "state_president", "taluk"].includes(state.user.role)) return;
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

async function loadTalukWork() {
  if (state.user.role !== "taluk") return;
  await Promise.all([
    loadPending(),
    loadMissingData(),
    loadDataCorrectionRequests(),
    loadTeamChat()
  ]);
}

async function loadDuplicates() {
  if (!["admin", "state_president"].includes(state.user.role)) return;
  const params = new URLSearchParams({
    search: state.duplicateFilters.search,
    type: state.duplicateFilters.type,
    limit: "250"
  });
  state.duplicates = await request(`/api/duplicates?${params.toString()}`);
}

async function loadDataCorrectionRequests() {
  if (!["admin", "state_president", "division", "district_technical_head", "taluk"].includes(state.user.role)) return;
  if (state.user.role === "taluk" && !canTaluk("submitCorrection") && !canTaluk("approveCorrection")) return;
  const params = new URLSearchParams({ search: state.dataCorrectionFilters.search });
  const data = await request(`/api/data-correction-requests?${params.toString()}`);
  state.dataCorrectionRequests = data.requests;
}

async function loadPresidentMessages() {
  if (!["admin", "state_president"].includes(state.user.role)) return;
  const data = await request("/api/president-messages");
  state.presidentMessages = data.messages || [];
}

async function loadTeamChat() {
  if (state.user?.role === "taluk" && !canTaluk("teamChat")) return;
  const data = await request("/api/team-chat?limit=100");
  state.teamChatMessages = data.messages || [];
}

async function loadMemberProblems() {
  if (!["admin", "state_president", "division", "district", "district_technical_head", "legal_team_head", "taluk"].includes(state.user.role)) return;
  const params = new URLSearchParams({
    search: state.problemFilters.search,
    status: state.problemFilters.status,
    limit: "300"
  });
  const data = await request(`/api/member-problems?${params.toString()}`);
  state.memberProblems = data.problems || [];
}

async function loadDonations() {
  if (!canViewDonations()) return;
  const params = new URLSearchParams({
    search: state.donationFilters.search,
    status: state.donationFilters.status,
    fundType: state.donationFilters.fundType,
    limit: "500"
  });
  state.donations = await request(`/api/donations?${params.toString()}`);
}

async function loadServiceBooks() {
  await loadMemberProblems();
  const rows = await loadAllMembersForExport({ search: state.problemFilters.search || "" });
  state.serviceBookMembers = rows;
}

async function loadSessionAnalytics() {
  if (!["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role)) return;
  const params = new URLSearchParams({
    search: state.sessionFilters.search,
    role: state.sessionFilters.role,
    from: state.sessionFilters.from,
    to: state.sessionFilters.to
  });
  state.sessionAnalytics = await request(`/api/session-analytics?${params.toString()}`);
}

async function loadSliderPhotos() {
  if (state.user?.role !== "admin") return;
  const data = await request("/api/admin/slider");
  state.sliderPhotos = data.photos || [];
}

function renderApp() {
  const unreadChat = unreadChatCount();
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
          ${["admin", "state_president", "division", "district_technical_head"].includes(state.user.role) || (state.user.role === "taluk" && canTaluk("approveMembership")) ? `<button data-tab="pending" class="${state.tab === "pending" ? "active" : ""}">Pending New Member Approval</button>` : ""}
          ${state.user.role === "admin" || (state.user.role === "taluk" && canTaluk("createMembership")) ? `<button data-tab="membership" class="${state.tab === "membership" ? "active" : ""}">Add Member</button>` : ""}
          ${["admin", "state_president", "division", "district_technical_head"].includes(state.user.role) || (state.user.role === "taluk" && (canTaluk("submitCorrection") || canTaluk("approveCorrection"))) ? `<button data-tab="dataCorrections" class="${state.tab === "dataCorrections" ? "active" : ""}">Pending Data Correction Requests</button>` : ""}
          ${state.user.role === "taluk" ? `<button data-tab="missingData" class="${state.tab === "missingData" ? "active" : ""}">Missing Data</button>` : ""}
          ${["admin", "state_president", "division", "district", "district_technical_head", "taluk"].includes(state.user.role) ? `<button data-tab="serviceBooks" class="${state.tab === "serviceBooks" ? "active" : ""}">Service Books</button>` : ""}
          ${state.user.role === "state_president" ? `<button data-tab="messages" class="${state.tab === "messages" ? "active" : ""}">Messages</button>` : ""}
          ${state.user.role === "admin" ? `<button data-tab="homeSlider" class="${state.tab === "homeSlider" ? "active" : ""}">Home Slider</button>` : ""}
          ${["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role) ? `<button data-tab="users" class="${state.tab === "users" ? "active" : ""}">Taluk Team</button>` : ""}
          ${["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role) ? `<button data-tab="sessionAnalytics" class="${state.tab === "sessionAnalytics" ? "active" : ""}">Team Time</button>` : ""}
          ${["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role) || (state.user.role === "taluk" && canTaluk("teamChat")) ? `<button data-tab="teamChat" class="${state.tab === "teamChat" ? "active" : ""}">Team Chat${unreadChat ? ` <span class="nav-badge">${unreadChat}</span>` : ""}</button>` : ""}
          ${["admin", "state_president", "division", "district", "district_technical_head", "legal_team_head"].includes(state.user.role) ? `<button data-tab="memberProblems" class="${state.tab === "memberProblems" ? "active" : ""}">${state.user.role === "legal_team_head" ? "Legal Notices" : "Member Problems"}</button>` : ""}
          ${canViewDonations() ? `<button data-tab="donations" class="${state.tab === "donations" ? "active" : ""}">Donations</button>` : ""}
          ${["admin", "state_president"].includes(state.user.role) ? `<button data-tab="duplicates" class="${state.tab === "duplicates" ? "active" : ""}">Duplicates</button>` : ""}
          ${["admin", "division", "district_technical_head"].includes(state.user.role) || (state.user.role === "taluk" && canTaluk("approveCorrection")) ? `<button data-tab="corrections" class="${state.tab === "corrections" ? "active" : ""}">Taluk Name Correction</button>` : ""}
          ${["admin", "state_president", "taluk"].includes(state.user.role) ? `<button data-tab="audit" class="${state.tab === "audit" ? "active" : ""}">${state.user.role === "taluk" ? "Activity Log" : "Audit History"}</button>` : ""}
          ${state.user.role === "admin" ? `<button data-tab="backupRestore" class="${state.tab === "backupRestore" ? "active" : ""}">Backup & Restore</button>` : ""}
        </nav>
        <button class="secondary" id="logoutBtn">Logout</button>
      </aside>
      <section class="content">
        <div class="topbar">
          <h1>${pageTitle()}</h1>
          ${state.tab === "members" && (state.user.role === "admin" || (state.user.role === "taluk" && canTaluk("createMembership"))) ? `<button class="primary" id="addMemberBtn">+ Add member</button>` : ""}
        </div>
        <div id="view"></div>
      </section>
    </section>
  `;

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tab = button.dataset.tab;
      if (state.tab === "dashboard") {
        await loadDashboard();
        if (state.user.role === "taluk") await loadTalukWork();
      }
      if (state.tab === "members") await loadMembers();
      if (state.tab === "pending") await loadPending();
      if (state.tab === "membership") await loadDashboard();
      if (state.tab === "dataCorrections") await loadDataCorrectionRequests();
      if (state.tab === "missingData") await loadMissingData();
      if (state.tab === "serviceBooks") await loadServiceBooks();
      if (state.tab === "messages") {
        await loadDashboard();
        await loadUsers();
        await loadPresidentMessages();
      }
      if (state.tab === "users") await loadUsers();
      if (state.tab === "sessionAnalytics") await loadSessionAnalytics();
      if (state.tab === "teamChat") await loadTeamChat();
      if (state.tab === "memberProblems") await loadMemberProblems();
      if (state.tab === "donations") await loadDonations();
      if (state.tab === "duplicates") await loadDuplicates();
      if (state.tab === "corrections") await loadCorrections();
      if (state.tab === "audit") await loadAuditLogs();
      if (state.tab === "backupRestore") await loadSliderPhotos();
      if (state.tab === "homeSlider") await loadSliderPhotos();
      renderApp();
    });
  });

  document.querySelector("#logoutBtn").addEventListener("click", async () => {
    await request("/api/logout", { method: "POST" });
    stopHeartbeat();
    state.user = null;
    renderLogin();
  });

  if (state.tab === "dashboard") renderDashboard();
  if (state.tab === "members") renderMembers();
  if (state.tab === "pending") renderPendingQueue();
  if (state.tab === "membership") renderMembershipForm();
  if (state.tab === "dataCorrections") renderDataCorrectionRequests();
  if (state.tab === "missingData") renderMissingData();
  if (state.tab === "serviceBooks") renderServiceBooksControl();
  if (state.tab === "messages") renderMessages();
  if (state.tab === "homeSlider") renderHomeSlider();
  if (state.tab === "users") renderUsers();
  if (state.tab === "sessionAnalytics") renderSessionAnalytics();
  if (state.tab === "teamChat") renderTeamChat();
  if (state.tab === "memberProblems") renderMemberProblems();
  if (state.tab === "donations") renderDonations();
  if (state.tab === "duplicates") renderDuplicates();
  if (state.tab === "corrections") renderCorrections();
  if (state.tab === "audit") renderAuditLogs();
  if (state.tab === "backupRestore") renderBackupRestore();
}

function pageTitle() {
  if (state.tab === "dashboard") return "Dashboard";
  if (state.tab === "members") return "Member Data";
  if (state.tab === "pending") return "Pending New Member Approval";
  if (state.tab === "membership") return "Add Member";
  if (state.tab === "dataCorrections") return "Pending Data Correction Requests";
  if (state.tab === "missingData") return "Missing Data Report";
  if (state.tab === "serviceBooks") return state.user.role === "taluk" ? "Taluk Member Service Books" : "State Service Book Control";
  if (state.tab === "messages") return "State President Messages";
  if (state.tab === "homeSlider") return "Homepage Slider Photos";
  if (state.tab === "users") return "Taluk Team Assignment";
  if (state.tab === "sessionAnalytics") return "Team Time Analytics";
  if (state.tab === "teamChat") return "Team Chat";
  if (state.tab === "memberProblems") return state.user.role === "legal_team_head" ? "Legal Notices" : "Member Problems";
  if (state.tab === "donations") return "Donation / Fund Reports";
  if (state.tab === "duplicates") return "Duplicate Detection";
  if (state.tab === "corrections") return "Taluk Name Correction";
  if (state.tab === "audit") return state.user.role === "taluk" ? "Taluk Activity Log" : "Audit History";
  if (state.tab === "backupRestore") return "Backup & Restore";
  return "Dashboard";
}

function userScopeLabel() {
  if (state.user.role === "admin") return "Admin";
  if (state.user.role === "state_president") return "State President";
  if (state.user.role === "division") return `${escapeHtml(state.user.district)} Division`;
  if (state.user.role === "district") return `${escapeHtml(state.user.district)} District President`;
  if (state.user.role === "district_technical_head") return `${escapeHtml(state.user.district)} District Technical Head`;
  return `${escapeHtml(state.user.taluk)} Taluk`;
}

const messageAudienceLabels = {
  all_members: "All Members",
  active_members: "Active Members",
  pending_members: "Pending Verification Members",
  correction_members: "Needs Correction Members",
  all_teams: "All Office Teams"
};

const messageTemplateLabels = {
  general: "General Notice",
  meeting: "Meeting Notice",
  correction: "Data Correction Reminder",
  membership: "Membership Update"
};

function audienceCount(audience) {
  const summary = state.dashboard?.summary || {};
  const statusCounts = summary.statusCounts || {};
  if (audience === "active_members") return statusCounts.Active || 0;
  if (audience === "pending_members") return workflowPendingStatuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
  if (audience === "correction_members") return statusCounts["Needs correction"] || 0;
  if (audience === "all_teams") return state.users.length || "office";
  return summary.total || 0;
}

function audienceExportParams(audience) {
  if (audience === "active_members") return { status: "Active" };
  if (audience === "pending_members") return { workflowPending: "true" };
  if (audience === "correction_members") return { status: "Needs correction" };
  return {};
}

function messageTemplate(type, audience) {
  const audienceLabel = messageAudienceLabels[audience] || "Members";
  if (type === "meeting") {
    return [
      "Dear KLSWA member,",
      "",
      "A state-level meeting notice has been issued by the State President.",
      "Audience: " + audienceLabel,
      "Please attend as per the official schedule shared by the association.",
      "",
      "Regards,",
      "State President, KLSWA"
    ].join("\n");
  }
  if (type === "correction") {
    return [
      "Dear KLSWA member,",
      "",
      "Your membership data verification or correction is important.",
      "Please check your submitted details and complete any pending corrections at the earliest.",
      "",
      "Status check: https://klswa.in/status.html",
      "",
      "Regards,",
      "State President, KLSWA"
    ].join("\n");
  }
  if (type === "membership") {
    return [
      "Dear KLSWA member,",
      "",
      "Please complete or verify your official membership information using the KLSWA public links.",
      "",
      "Public links: https://klswa.in/links.html",
      "",
      "Regards,",
      "State President, KLSWA"
    ].join("\n");
  }
  return [
    "Dear KLSWA member,",
    "",
    "This is an official notice from the State President.",
    "Audience: " + audienceLabel,
    "",
    "Regards,",
    "State President, KLSWA"
  ].join("\n");
}

function renderMessages() {
  if (state.user.role !== "state_president") {
    document.querySelector("#view").innerHTML = `<section class="box section"><p>State President access required.</p></section>`;
    return;
  }
  const draft = state.messageDraft;
  const count = audienceCount(draft.audience);
  const exportParams = audienceExportParams(draft.audience);
  const isMemberAudience = draft.audience !== "all_teams";
  document.querySelector("#view").innerHTML = `
    <div class="split message-layout">
      <section class="box section">
        <div class="section-head">
          <h2>Prepare message</h2>
          <span class="badge">${escapeHtml(count)} recipients</span>
        </div>
        <div class="form-grid">
          ${selectField("messageAudience", "Audience", Object.keys(messageAudienceLabels), draft.audience, false, messageAudienceLabels)}
          ${selectField("messageTemplate", "Template", Object.keys(messageTemplateLabels), "general", false, messageTemplateLabels)}
          <label>Subject <input id="messageSubject" value="${escapeHtml(draft.subject)}"></label>
          <label>Message
            <textarea id="messageBody" rows="10">${escapeHtml(draft.body || messageTemplate("general", draft.audience))}</textarea>
          </label>
          <div class="actions">
            <button class="primary" id="copyBroadcastMessage">Copy message</button>
            ${isMemberAudience ? `<button class="secondary" id="publishBroadcastMessage">Publish to member login</button>` : ""}
            ${isMemberAudience ? `<a class="secondary" href="${exportUrl("/api/exports/members", exportParams)}">Download member CSV</a>` : ""}
          </div>
          <div class="message success" id="broadcastMessageStatus"></div>
        </div>
      </section>
      <section class="box section">
        <h2>Message tools</h2>
        <div class="list">
          <div class="list-row"><span>All Members</span><span class="badge">${state.dashboard.summary.total || 0}</span></div>
          <div class="list-row"><span>Active Members</span><span class="badge">${state.dashboard.summary.statusCounts?.Active || 0}</span></div>
          <div class="list-row"><span>Inactive Members</span><span class="badge">${state.dashboard.summary.statusCounts?.Inactive || 0}</span></div>
          <div class="list-row"><span>Pending Workflow</span><span class="badge">${audienceCount("pending_members")}</span></div>
          <div class="list-row"><span>Needs Correction</span><span class="badge">${state.dashboard.summary.statusCounts?.["Needs correction"] || 0}</span></div>
        </div>
        <h2>Recent published notices</h2>
        <div class="timeline">
          ${state.presidentMessages.map((message) => `
            <div class="timeline-item">
              <span class="muted">${escapeHtml(new Date(message.createdAt).toLocaleString())} / ${escapeHtml(messageAudienceLabels[message.audience] || message.audience)}</span>
              <strong>${escapeHtml(message.subject)}</strong>
              <p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>
            </div>
          `).join("") || `<p class="muted">No published notices yet.</p>`}
        </div>
        <p class="muted">Use copy message for WhatsApp groups, publish for member login, or download member CSV for phone/contact list.</p>
      </section>
    </div>
  `;

  const audience = document.querySelector('select[name="messageAudience"]');
  const template = document.querySelector('select[name="messageTemplate"]');
  const subject = document.querySelector("#messageSubject");
  const body = document.querySelector("#messageBody");
  audience.addEventListener("change", () => {
    state.messageDraft.audience = audience.value;
    state.messageDraft.body = messageTemplate(template.value, audience.value);
    renderMessages();
  });
  template.addEventListener("change", () => {
    state.messageDraft.body = messageTemplate(template.value, audience.value);
    renderMessages();
  });
  subject.addEventListener("input", () => {
    state.messageDraft.subject = subject.value;
  });
  body.addEventListener("input", () => {
    state.messageDraft.body = body.value;
  });
  document.querySelector("#copyBroadcastMessage").addEventListener("click", async () => {
    await copyText(`${subject.value}\n\n${body.value}`);
    document.querySelector("#broadcastMessageStatus").textContent = "Message copied. Paste in WhatsApp/SMS group.";
  });
  const publishButton = document.querySelector("#publishBroadcastMessage");
  if (publishButton) {
    publishButton.addEventListener("click", async () => {
      const status = document.querySelector("#broadcastMessageStatus");
      status.textContent = "";
      try {
        await request("/api/president-messages", {
          method: "POST",
          body: JSON.stringify({
            audience: audience.value,
            subject: subject.value,
            body: body.value
          })
        });
        await loadPresidentMessages();
        renderMessages();
        document.querySelector("#broadcastMessageStatus").textContent = "Published. Members will see this notice after login.";
      } catch (error) {
        status.textContent = error.message;
        status.classList.remove("success");
      }
    });
  }
}

function chatScopeLabel(message) {
  if (message.taluk) return `${message.district} / ${message.taluk}`;
  if (message.district) return message.district;
  return "State";
}

function chatWatermark() {
  return `${state.user.name || state.user.username} - ${userScopeLabel()}`;
}

function chatStorageKey() {
  return `klswa:lastChatRead:${state.user?.id || "guest"}`;
}

function unreadChatCount() {
  const lastRead = Number(localStorage.getItem(chatStorageKey()) || 0);
  return state.teamChatMessages.filter((message) => new Date(message.createdAt).getTime() > lastRead).length;
}

function teamChatReplyTarget() {
  return state.teamChatMessages.find((message) => message.id === teamChatReplyToId) || null;
}

function chatAttachment(message) {
  if (!message.attachmentUrl) return "";
  const isImage = String(message.attachmentType || "").startsWith("image/");
  return `
    <a class="chat-attachment ${isImage ? "image-attachment" : ""}" href="${escapeHtml(message.attachmentUrl)}" target="_blank" rel="noopener">
      ${isImage ? `<img src="${escapeHtml(message.attachmentUrl)}" alt="${escapeHtml(message.attachmentName || "Chat attachment")}">` : `<span class="attachment-icon">PDF</span>`}
      <span>
        <strong>${escapeHtml(message.attachmentName || "Open attachment")}</strong>
        <small>${escapeHtml(message.attachmentType || "Attachment")}</small>
      </span>
    </a>
  `;
}

function teamWhatsAppMessage(link) {
  return [
    "KLSWA Taluk Technical Team WhatsApp Group",
    `Join link: ${link}`,
    "",
    "Please join using your registered mobile number.",
    "Do not share member data, screenshots, or screen recordings outside the approved team."
  ].join("\n");
}

function renderTeamWhatsAppCard() {
  if (!["admin", "division", "district_technical_head", "taluk"].includes(state.user.role)) return "";
  const link = state.dashboard?.meta?.teamWhatsAppLink || state.teamWhatsAppLink || "https://chat.whatsapp.com/FiFDrzqoKAU1y1479O9xn9";
  state.teamWhatsAppLink = link;
  return `
    <section class="box section whatsapp-card">
      <div class="section-head">
        <div>
          <h2>Technical Team WhatsApp Group</h2>
          <p class="muted">Visible only for technical/admin logins. Not shown to public members.</p>
        </div>
        <span class="badge">Team only</span>
      </div>
      <p class="notice">Confidential: do not share screenshots, screen recordings, or member data outside the approved team.</p>
      <div class="toolbar">
        <a class="primary" href="${escapeHtml(link)}" target="_blank" rel="noopener">Open WhatsApp Group</a>
        <button class="secondary" id="copyTeamWhatsApp" type="button">Copy invite message</button>
      </div>
      ${state.user.role === "admin" ? `
        <form id="teamWhatsAppForm" class="toolbar">
          <input name="link" value="${escapeHtml(link)}" placeholder="https://chat.whatsapp.com/...">
          <button class="secondary" type="submit">Save group link</button>
        </form>
      ` : ""}
      <div class="message success" id="teamWhatsAppMessage"></div>
    </section>
  `;
}

function bindTeamWhatsAppCard() {
  const copy = document.querySelector("#copyTeamWhatsApp");
  if (copy) {
    copy.addEventListener("click", async () => {
      await copyText(teamWhatsAppMessage(state.teamWhatsAppLink));
      const message = document.querySelector("#teamWhatsAppMessage");
      message.textContent = "WhatsApp invite message copied.";
      setTimeout(() => { message.textContent = ""; }, 1800);
    });
  }
  const form = document.querySelector("#teamWhatsAppForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const link = String(new FormData(form).get("link") || "").trim();
      const message = document.querySelector("#teamWhatsAppMessage");
      try {
        await request("/api/team-whatsapp-link", {
          method: "PUT",
          body: JSON.stringify({ link })
        });
        await loadDashboard();
        state.teamWhatsAppLink = link;
        message.textContent = "WhatsApp group link saved.";
      } catch (error) {
        message.textContent = error.message;
      }
    });
  }
}

function markTeamChatRead() {
  localStorage.setItem(chatStorageKey(), String(Date.now()));
}

function renderTeamChat() {
  markTeamChatRead();
  const replyTarget = teamChatReplyTarget();
  document.querySelector("#view").innerHTML = `
    <section class="box section secure-chat" data-watermark="${escapeHtml(chatWatermark())}">
      <div class="section-head">
        <div>
          <h2>Taluk team group chat</h2>
          <p class="muted">Private team communication. Copy, right-click and print are disabled; screenshots/screen recording cannot be fully blocked by a web browser.</p>
        </div>
        <button class="secondary" id="refreshTeamChat">Refresh</button>
      </div>
      <div class="notice">Confidential chat. Do not screenshot, screen record, forward, or share outside KLSWA authorized team.</div>
      <div class="chat-list">
        ${state.teamChatMessages.map((message) => `
          <article class="chat-message ${message.pinned ? "pinned" : ""}">
            ${message.replyTo ? `
              <div class="reply-preview">
                <span>Replying to ${escapeHtml(message.replyTo.authorName || "Team")}</span>
                <p>${escapeHtml(message.replyTo.body)}</p>
              </div>
            ` : ""}
            <div class="chat-meta">
              <strong>${escapeHtml(message.authorName || "Team")}</strong>
              ${message.pinned ? `<span class="badge">Pinned</span>` : ""}
              <span class="badge">${escapeHtml(roleLabels[message.authorRole] || message.authorRole)}</span>
              <span class="muted">${escapeHtml(chatScopeLabel(message))}</span>
              <span class="muted">${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
            </div>
            <p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>
            ${chatAttachment(message)}
            <div class="chat-actions">
              <button class="secondary" type="button" data-reply-chat="${escapeHtml(message.id)}">Reply</button>
            </div>
          </article>
        `).join("") || `<p class="muted">No chat messages yet.</p>`}
      </div>
      <form id="teamChatForm" class="chat-form">
        <input type="hidden" name="replyToId" value="${escapeHtml(replyTarget?.id || "")}">
        ${replyTarget ? `
          <div class="reply-compose">
            <div>
              <span class="muted">Replying to ${escapeHtml(replyTarget.authorName || "Team")}</span>
              <strong>${escapeHtml(String(replyTarget.body || "").slice(0, 120))}</strong>
            </div>
            <button class="secondary" type="button" id="clearTeamChatReply">Cancel reply</button>
          </div>
        ` : ""}
        <label>Message
          <textarea name="body" rows="3" maxlength="1000" placeholder="Type message for your team group"></textarea>
        </label>
        <label>Attach PDF / image
          <input name="attachmentFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp">
        </label>
        ${["admin", "state_president", "division", "district_technical_head"].includes(state.user.role) ? `
          <label class="check">
            <input type="checkbox" name="pinned">
            Pin as important message
          </label>
        ` : ""}
        <div class="message" id="teamChatMessage"></div>
        <div class="actions">
          <button class="primary" type="submit">Send message</button>
        </div>
      </form>
    </section>
  `;

  const secureChat = document.querySelector(".secure-chat");
  ["copy", "cut", "contextmenu", "dragstart"].forEach((eventName) => {
    secureChat.addEventListener(eventName, (event) => {
      event.preventDefault();
      const message = document.querySelector("#teamChatMessage");
      if (message) message.textContent = "Copying or saving chat content is not allowed.";
    });
  });
  secureChat.addEventListener("selectstart", (event) => {
    if (event.target.closest("textarea, input")) return;
    event.preventDefault();
  });
  document.querySelector("#refreshTeamChat").addEventListener("click", async () => {
    await loadTeamChat();
    renderTeamChat();
  });
  document.querySelectorAll("[data-reply-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      teamChatReplyToId = button.dataset.replyChat;
      renderTeamChat();
      document.querySelector('#teamChatForm textarea[name="body"]')?.focus();
    });
  });
  document.querySelector("#clearTeamChatReply")?.addEventListener("click", () => {
    teamChatReplyToId = "";
    renderTeamChat();
  });
  document.querySelector("#teamChatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const file = form.querySelector('input[name="attachmentFile"]').files?.[0];
    const message = document.querySelector("#teamChatMessage");
    message.textContent = "";
    try {
      delete payload.attachmentFile;
      if (!String(payload.body || "").trim() && !file) {
        throw new Error("Type a message or attach a file.");
      }
      if (file) {
        if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Upload PDF, JPG, PNG, or WEBP file only.");
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error("Attachment must be less than 8 MB.");
        }
        payload.attachmentData = await fileToDataUrl(file);
        payload.attachmentName = file.name;
      }
      await request("/api/team-chat", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      teamChatReplyToId = "";
      await loadTeamChat();
      renderTeamChat();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function renderMemberProblems() {
  const openCount = state.memberProblems.filter((item) => ["Submitted", "In review", "Under Legal Review", "Need More Documents", "Forwarded to President"].includes(item.status)).length;
  const strikeCount = state.memberProblems.filter((item) => item.category === "Strike suggestion").length;
  const canUpdate = ["admin", "state_president", "division", "district", "district_technical_head", "legal_team_head"].includes(state.user.role);
  const isLegalHead = state.user.role === "legal_team_head";
  const statusOptions = isLegalHead
    ? ["Submitted", "Under Legal Review", "Need More Documents", "Forwarded to President", "Resolved", "Rejected"]
    : ["Submitted", "In review", "Resolved", "Rejected"];
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <div>
          <h2>${isLegalHead ? "Legal notices and office documents" : "Member problems to leadership"}</h2>
          <p class="muted">${isLegalHead ? "Legal and office notice PDFs submitted by members. Review status and add legal remarks." : "Problems submitted from member login. Review and reply from here."}</p>
        </div>
        <span class="badge">${openCount} Open</span>
      </div>
      <div class="toolbar">
        <label>Search <input id="problemSearch" value="${escapeHtml(state.problemFilters.search)}" placeholder="Member, LS, subject, taluk"></label>
        <label>Status <select id="problemStatus"><option value="">All status</option>${optionList(statusOptions, state.problemFilters.status)}</select></label>
        <span></span>
        <button class="secondary" id="applyProblemFilters">Apply</button>
        <button class="secondary" id="strikeSuggestionPdf" ${strikeCount ? "" : "disabled"}>Export strike PDF</button>
      </div>
      <div class="problem-grid">
        ${state.memberProblems.map((problem) => `
          <article class="problem-card-ui">
            <div class="section-head">
              <div>
                <span class="badge">${escapeHtml(problem.status)}</span>
                <h2>${escapeHtml(problem.subject)}</h2>
                <p class="muted">${escapeHtml(problem.memberName)} / ${escapeHtml(problem.lsNumber)} / ${escapeHtml(problem.district)} / ${escapeHtml(problem.taluk)}</p>
              </div>
            </div>
            <p>${escapeHtml(problem.description).replace(/\n/g, "<br>")}</p>
            <div class="mini-list">
              <span><strong>Category:</strong> ${escapeHtml(problem.category)}</span>
              ${problem.documentType ? `<span><strong>Document:</strong> ${escapeHtml(problem.documentType)}</span>` : ""}
              ${problem.officeName ? `<span><strong>Office:</strong> ${escapeHtml(problem.officeName)}</span>` : ""}
              ${problem.village ? `<span><strong>Village/Hobli:</strong> ${escapeHtml(problem.village)}</span>` : ""}
              ${problem.noticeDate ? `<span><strong>Notice date:</strong> ${escapeHtml(problem.noticeDate)}</span>` : ""}
              <span><strong>Phone:</strong> ${escapeHtml(problem.phoneNumber || "-")}</span>
              <span><strong>Submitted:</strong> ${escapeHtml(new Date(problem.createdAt).toLocaleString())}</span>
              ${problem.reviewedByName ? `<span><strong>Reviewed by:</strong> ${escapeHtml(problem.reviewedByName)}</span>` : ""}
            </div>
            ${problem.documentUrl ? `<p><a class="secondary" href="${escapeHtml(problem.documentUrl)}" target="_blank">View uploaded PDF${problem.documentName ? ` - ${escapeHtml(problem.documentName)}` : ""}</a></p>` : ""}
            ${problem.response ? `<p class="notice">${escapeHtml(problem.response)}</p>` : ""}
            ${canUpdate ? `
              <div class="problem-review">
                <label>Status
                  <select data-problem-status="${problem.id}">
                    ${optionList(statusOptions, problem.status)}
                  </select>
                </label>
                <label>Leadership response
                  <textarea data-problem-response="${problem.id}" rows="3" placeholder="Reply or action taken">${escapeHtml(problem.response || "")}</textarea>
                </label>
                <button class="primary" data-save-problem="${problem.id}">Save response</button>
              </div>
            ` : ""}
          </article>
        `).join("") || `<p class="muted">No member problems found.</p>`}
      </div>
    </section>
  `;

  document.querySelector("#applyProblemFilters").addEventListener("click", async () => {
    state.problemFilters.search = document.querySelector("#problemSearch").value;
    state.problemFilters.status = document.querySelector("#problemStatus").value;
    await loadMemberProblems();
    renderApp();
  });
  document.querySelector("#strikeSuggestionPdf").addEventListener("click", exportStrikeSuggestionsPdf);
  document.querySelectorAll("[data-save-problem]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveProblem;
      await request(`/api/member-problems/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: document.querySelector(`[data-problem-status="${id}"]`).value,
          response: document.querySelector(`[data-problem-response="${id}"]`).value
        })
      });
      await loadMemberProblems();
      renderApp();
    });
  });
}

function renderDonations() {
  const rows = state.donations.donations || [];
  const summary = state.donations.summary || {};
  const statusOptions = ["Paid", "Verified"];
  const fundOptions = ["Horata Fund", "Legal Samiti Fund", "General Association Fund"];
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <div>
          <h2>Donation / Fund Reports</h2>
          <p class="muted">Only successful donations are shown here. Pending, rejected, and started payments are hidden.</p>
        </div>
        <span class="badge">${state.donations.razorpayConfigured ? "Razorpay active" : "Manual mode"}</span>
      </div>
      <div class="stats">
        <div class="stat"><span>Successful records</span><strong>${escapeHtml(summary.count || 0)}</strong></div>
        <div class="stat"><span>Total amount</span><strong>${escapeHtml(rupees(summary.totalAmount))}</strong></div>
        <div class="stat"><span>Paid / verified</span><strong>${escapeHtml(rupees(summary.verifiedAmount))}</strong></div>
        <div class="stat"><span>Visible status</span><strong>Success only</strong></div>
      </div>
      <div class="toolbar">
        <label>Search <input id="donationSearch" value="${escapeHtml(state.donationFilters.search)}" placeholder="Member, phone, LS, taluk"></label>
        <label>Status <select id="donationStatus"><option value="">Paid + Verified</option>${optionList(statusOptions, state.donationFilters.status)}</select></label>
        <label>Fund <select id="donationFund"><option value="">All funds</option>${optionList(fundOptions, state.donationFilters.fundType)}</select></label>
        <button class="secondary" id="applyDonationFilters">Apply</button>
        <a class="secondary" href="${exportUrl("/api/donations/export.csv", state.donationFilters)}">Export CSV</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Member</th><th>Phone</th><th>District</th><th>Taluk</th>
              <th>Fund</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr>
                <td>${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN") : "-")}</td>
                <td>${escapeHtml(item.memberName)}<br><span class="muted">${escapeHtml(item.lsNumber || "-")}</span></td>
                <td>${escapeHtml(item.phoneNumber || "-")}</td>
                <td>${escapeHtml(item.district || "-")}</td>
                <td>${escapeHtml(item.taluk || "-")}</td>
                <td>${escapeHtml(item.fundType)}</td>
                <td>${escapeHtml(rupees(item.amount))}</td>
                <td>${escapeHtml(item.paymentMethod)}</td>
                <td><span class="badge">${escapeHtml(item.status)}</span></td>
                <td>${escapeHtml(item.razorpayPaymentId || item.manualReference || item.razorpayQrId || item.razorpayOrderId || "-")}</td>
                <td>
                  ${canVerifyDonations() ? `
                    <select data-donation-status="${escapeHtml(item.id)}">${optionList(statusOptions, item.status)}</select>
                    <input data-donation-remarks="${escapeHtml(item.id)}" value="${escapeHtml(item.remarks || "")}" placeholder="Remarks">
                    <button class="primary" data-save-donation="${escapeHtml(item.id)}">Save</button>
                  ` : `<span class="muted">View only</span>`}
                </td>
              </tr>
            `).join("") || `<tr><td colspan="11">No donations found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector("#applyDonationFilters").addEventListener("click", async () => {
    state.donationFilters.search = document.querySelector("#donationSearch").value;
    state.donationFilters.status = document.querySelector("#donationStatus").value;
    state.donationFilters.fundType = document.querySelector("#donationFund").value;
    await loadDonations();
    renderApp();
  });
  document.querySelectorAll("[data-save-donation]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveDonation;
      await request(`/api/donations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: document.querySelector(`[data-donation-status="${id}"]`).value,
          remarks: document.querySelector(`[data-donation-remarks="${id}"]`).value
        })
      });
      await loadDonations();
      renderApp();
    });
  });
}

function problemMonthLabel(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function groupedTalukServiceBooks() {
  const groups = new Map();
  state.serviceBookMembers.forEach((member) => {
    const key = member.id || `${member.name}-${member.lsNumber}`;
    groups.set(key, {
      memberId: member.id,
      memberName: member.name,
      lsNumber: member.lsNumber,
      phoneNumber: member.phoneNumber,
      district: member.district,
      taluk: member.taluk,
      status: member.status,
      batchYear: member.batchYear,
      qualification: member.qualification,
      entries: []
    });
  });
  state.memberProblems.forEach((problem) => {
    const key = problem.memberId || `${problem.memberName}-${problem.lsNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        memberId: problem.memberId,
        memberName: problem.memberName,
        lsNumber: problem.lsNumber,
        phoneNumber: problem.phoneNumber,
        district: problem.district,
        taluk: problem.taluk,
        status: "",
        batchYear: "",
        qualification: "",
        entries: []
      });
    }
    groups.get(key).entries.push(problem);
  });
  return [...groups.values()].sort((a, b) => String(a.memberName || "").localeCompare(String(b.memberName || "")));
}

function serviceStatusCounts(entries = []) {
  const closed = entries.filter((entry) => ["Verified", "Resolved", "Closed", "Approved"].includes(entry.status)).length;
  const rejected = entries.filter((entry) => entry.status === "Rejected").length;
  return {
    total: entries.length,
    closed,
    pending: entries.length - closed - rejected,
    rejected
  };
}

function canReviewServiceBooks() {
  return ["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role);
}

function serviceBookEntryCard(entry) {
  const canReview = canReviewServiceBooks();
  const statusOptions = ["Submitted", "In review", "Under Legal Review", "Need More Documents", "Forwarded to President", "Resolved", "Rejected"];
  return `
    <article class="taluk-service-entry">
      <div class="service-entry-marker"></div>
      <div>
        <div class="service-entry-head">
          <strong>${escapeHtml(entry.documentType || entry.category || "Service entry")}</strong>
          <span class="badge">${escapeHtml(entry.status)}</span>
        </div>
        <h4>${escapeHtml(entry.subject || "-")}</h4>
        <p>${escapeHtml(entry.description || "").replace(/\n/g, "<br>")}</p>
        <div class="mini-list">
          ${entry.officeName ? `<span><strong>Office:</strong> ${escapeHtml(entry.officeName)}</span>` : ""}
          ${entry.village ? `<span><strong>Village/Hobli:</strong> ${escapeHtml(entry.village)}</span>` : ""}
          ${entry.noticeDate ? `<span><strong>Notice date:</strong> ${escapeHtml(entry.noticeDate)}</span>` : ""}
          <span><strong>Submitted:</strong> ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</span>
        </div>
        <div class="service-entry-foot">
          <span>${escapeHtml(problemMonthLabel(entry.createdAt))}</span>
          ${entry.documentUrl ? `<a class="secondary" href="${escapeHtml(entry.documentUrl)}" target="_blank">View proof</a>` : ""}
        </div>
        ${entry.response ? `<p class="notice">${escapeHtml(entry.response)}</p>` : ""}
        ${canReview ? `
          <div class="service-review-panel">
            <label>Status
              <select data-service-status="${entry.id}">
                ${optionList(statusOptions, entry.status)}
              </select>
            </label>
            <label>State/Admin remarks
              <textarea data-service-response="${entry.id}" rows="3" placeholder="Official remarks or action taken">${escapeHtml(entry.response || "")}</textarea>
            </label>
            <button class="primary" data-save-service="${entry.id}">Update entry</button>
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function renderServiceBooksControl() {
  const groups = groupedTalukServiceBooks();
  const totalEntries = state.memberProblems.length;
  const membersWithEntries = groups.length;
  const emptyMembers = groups.filter((group) => !group.entries.length).length;
  const openEntries = state.memberProblems.filter((entry) => !["Verified", "Resolved", "Closed", "Approved", "Rejected"].includes(entry.status)).length;
  const isTaluk = state.user.role === "taluk";
  document.querySelector("#view").innerHTML = `
    <section class="box section taluk-service-books">
      <div class="section-head">
        <div>
          <h2>${isTaluk ? "All Member Digital Service Books" : "State Admin Service Book Control"}</h2>
          <p class="muted">${isTaluk ? `${escapeHtml(state.user.taluk || "Taluk")} taluk member work history, uploaded documents, notices and follow-up entries.` : "View, monitor, and update visible member service book entries across your assigned area."}</p>
        </div>
        <span class="badge">${membersWithEntries} Members</span>
      </div>
      <div class="status-grid">
        <div><span class="muted">Total taluk members</span><strong>${membersWithEntries}</strong></div>
        <div><span class="muted">Total entries</span><strong>${totalEntries}</strong></div>
        <div><span class="muted">Pending / open</span><strong>${openEntries}</strong></div>
        <div><span class="muted">No entries yet</span><strong>${emptyMembers}</strong></div>
      </div>
      <div class="toolbar">
        <label>Search <input id="serviceBookSearch" value="${escapeHtml(state.problemFilters.search)}" placeholder="Member, LS, subject, village"></label>
        <label>Status <select id="serviceBookStatus"><option value="">All status</option>${optionList(["Submitted", "In review", "Under Legal Review", "Need More Documents", "Forwarded to President", "Resolved", "Rejected"], state.problemFilters.status)}</select></label>
        <span></span>
        <button class="secondary" id="applyServiceBookFilters">Apply</button>
      </div>
      <div class="taluk-service-grid">
        ${groups.map((group) => {
          const counts = serviceStatusCounts(group.entries);
          return `
            <article class="taluk-service-card" data-service-card="${escapeHtml(group.memberId || group.lsNumber || "")}">
              <div class="service-book-cover taluk-service-cover">
                <div>
                  <p class="eyebrow">Digital Service Book</p>
                  <h2>${escapeHtml(group.memberName || "-")}</h2>
                  <p>${escapeHtml(group.lsNumber || "-")} / ${escapeHtml(group.phoneNumber || "-")} / ${escapeHtml(group.taluk || "-")}</p>
                  <p>${escapeHtml(group.status || "-")} / Batch ${escapeHtml(group.batchYear || "-")} / ${escapeHtml(group.qualification || "-")}</p>
                </div>
                <button class="secondary" type="button" data-print-service="${escapeHtml(group.memberId || group.lsNumber || "")}">Print</button>
              </div>
              <div class="service-summary-grid taluk-service-summary">
                <div><span>Total</span><strong>${counts.total}</strong></div>
                <div><span>Closed</span><strong>${counts.closed}</strong></div>
                <div><span>Pending</span><strong>${counts.pending}</strong></div>
                <div><span>Rejected</span><strong>${counts.rejected}</strong></div>
              </div>
              <div class="service-book-timeline">
                ${group.entries.length ? group.entries.map(serviceBookEntryCard).join("") : `
                  <div class="service-empty taluk-service-empty">
                    <strong>Service book ready</strong>
                    <p class="muted">No entries yet. Member work, office notice, legal document, or taluk team update will appear here step by step.</p>
                  </div>
                `}
              </div>
            </article>
          `;
        }).join("") || `<p class="muted">No service book entries found for this taluk yet.</p>`}
      </div>
    </section>
  `;

  document.querySelector("#applyServiceBookFilters").addEventListener("click", async () => {
    state.problemFilters.search = document.querySelector("#serviceBookSearch").value;
    state.problemFilters.status = document.querySelector("#serviceBookStatus").value;
    await loadMemberProblems();
    renderApp();
  });
  document.querySelectorAll("[data-print-service]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".taluk-service-card").forEach((card) => {
        card.classList.toggle("print-selected", card.dataset.serviceCard === button.dataset.printService);
      });
      window.print();
    });
  });
  document.querySelectorAll("[data-save-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveService;
      await request(`/api/member-problems/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: document.querySelector(`[data-service-status="${id}"]`).value,
          response: document.querySelector(`[data-service-response="${id}"]`).value
        })
      });
      await loadServiceBooks();
      renderApp();
    });
  });
}

function anonymizedStrikeDescription(problem) {
  let text = String(problem.description || "");
  text = text.replace(/^Name:\s*.*$/gmi, "");
  if (problem.memberName) {
    const escapedName = String(problem.memberName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escapedName, "gi"), "Member");
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function exportStrikeSuggestionsPdf() {
  const suggestions = state.memberProblems.filter((item) => item.category === "Strike suggestion");
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try Export PDF again.");
    return;
  }
  popup.document.open();
  popup.document.write(`<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>KLSWA Strike Suggestions</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1f2933; margin: 28px; }
        h1 { margin: 0 0 6px; color: #104f3a; }
        .muted { color: #607062; margin: 0 0 18px; }
        .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
        .summary div, .suggestion { border: 1px solid #d8ded6; border-radius: 8px; padding: 12px; }
        .summary span { display: block; color: #607062; font-size: 12px; }
        .summary strong { font-size: 22px; color: #104f3a; }
        .suggestion { break-inside: avoid; margin: 12px 0; }
        .suggestion h2 { margin: 0 0 8px; color: #104f3a; font-size: 17px; }
        .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
        .meta span { background: #eef5ee; border-radius: 999px; padding: 5px 9px; font-size: 12px; }
        pre { white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.45; }
        @media print { body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>KLSWA Strike Suggestion Report</h1>
      <p class="muted">Names are hidden in this PDF. Generated by ${escapeHtml(state.user.name)} on ${escapeHtml(new Date().toLocaleString())}</p>
      <div class="summary">
        <div><span>Total suggestions</span><strong>${suggestions.length}</strong></div>
        <div><span>Open</span><strong>${suggestions.filter((item) => ["Submitted", "In review"].includes(item.status)).length}</strong></div>
        <div><span>Resolved/Rejected</span><strong>${suggestions.filter((item) => ["Resolved", "Rejected"].includes(item.status)).length}</strong></div>
      </div>
      ${suggestions.map((problem, index) => `
        <section class="suggestion">
          <h2>Suggestion ${index + 1}</h2>
          <div class="meta">
            <span>Status: ${escapeHtml(problem.status)}</span>
            <span>District: ${escapeHtml(problem.district || "-")}</span>
            <span>Batch: ${escapeHtml(String(problem.lsNumber || "").replace(/^Batch\s*/i, "") || "-")}</span>
            <span>Submitted: ${escapeHtml(new Date(problem.createdAt).toLocaleString())}</span>
          </div>
          <pre>${escapeHtml(anonymizedStrikeDescription(problem))}</pre>
          ${problem.response ? `<p><strong>Leadership response:</strong> ${escapeHtml(problem.response)}</p>` : ""}
        </section>
      `).join("") || `<p>No strike suggestions found.</p>`}
      <script>window.addEventListener("load", () => window.print());</script>
    </body>
    </html>`);
  popup.document.close();
}

function renderSessionAnalytics() {
  const data = state.sessionAnalytics || {};
  const summary = data.summary || {};
  const rows = data.rows || [];
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <div>
          <h2>Taluk Team Work Efficiency</h2>
          <p class="muted">Tracks login sessions and active website time from browser heartbeats.</p>
        </div>
        <div class="actions">
          <button class="secondary" id="workEfficiencyPdf">Export PDF</button>
          <button class="secondary" id="refreshSessionAnalytics">Refresh</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span>Tracked users</span><strong>${summary.users || 0}</strong></div>
        <div class="stat"><span>Total website time</span><strong>${escapeHtml(formatDuration(summary.totalSeconds || 0))}</strong></div>
        <div class="stat"><span>Today time</span><strong>${escapeHtml(formatDuration(summary.todaySeconds || 0))}</strong></div>
        <div class="stat"><span>Active now</span><strong>${summary.activeUsers || 0}</strong></div>
      </div>
      <div class="toolbar">
        <input id="sessionSearch" placeholder="Search name, username, district, taluk" value="${escapeHtml(state.sessionFilters.search)}">
        <select id="sessionRole">
          ${optionList(["taluk", "district_technical_head", "district", "division", "state_president", "admin"], state.sessionFilters.role, roleLabels)}
        </select>
        <input id="sessionFrom" type="date" value="${escapeHtml(state.sessionFilters.from)}">
        <input id="sessionTo" type="date" value="${escapeHtml(state.sessionFilters.to)}">
        <button class="secondary" id="sessionFilterBtn">Apply</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>District</th>
              <th>Taluk</th>
              <th>Sessions</th>
              <th>Total Time</th>
              <th>Today</th>
              <th>Last Seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.name || row.username || "-")}</strong><br>
                  <span class="muted">${escapeHtml(row.username || row.userId || "")}</span>
                </td>
                <td>${escapeHtml(roleLabels[row.role] || row.role || "-")}</td>
                <td>${escapeHtml(row.district || "-")}</td>
                <td>${escapeHtml(row.taluk || "-")}</td>
                <td>${row.sessionCount || 0}</td>
                <td><strong>${escapeHtml(formatDuration(row.totalSeconds || 0))}</strong></td>
                <td>${escapeHtml(formatDuration(row.todaySeconds || 0))}</td>
                <td>${escapeHtml(formatDateTime(row.lastSeenAt))}</td>
                <td><span class="badge ${row.activeSessions ? "badge-active" : ""}">${row.activeSessions ? "Online" : "Offline"}</span></td>
              </tr>
            `).join("") || `<tr><td colspan="9" class="muted">No session data yet. It will appear after team members login and keep the site open.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector("#refreshSessionAnalytics").addEventListener("click", async () => {
    await loadSessionAnalytics();
    renderApp();
  });
  document.querySelector("#workEfficiencyPdf").addEventListener("click", exportWorkEfficiencyPdf);
  document.querySelector("#sessionFilterBtn").addEventListener("click", async () => {
    state.sessionFilters.search = document.querySelector("#sessionSearch").value;
    state.sessionFilters.role = document.querySelector("#sessionRole").value;
    state.sessionFilters.from = document.querySelector("#sessionFrom").value;
    state.sessionFilters.to = document.querySelector("#sessionTo").value;
    await loadSessionAnalytics();
    renderApp();
  });
}

function exportWorkEfficiencyPdf() {
  const data = state.sessionAnalytics || {};
  const summary = data.summary || {};
  const rows = data.rows || [];
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try Export PDF again.");
    return;
  }
  const generatedAt = new Date().toLocaleString();
  const filterText = [
    state.sessionFilters.role ? `Role: ${roleLabels[state.sessionFilters.role] || state.sessionFilters.role}` : "Role: All",
    state.sessionFilters.search ? `Search: ${state.sessionFilters.search}` : "",
    state.sessionFilters.from ? `From: ${state.sessionFilters.from}` : "",
    state.sessionFilters.to ? `To: ${state.sessionFilters.to}` : ""
  ].filter(Boolean).join(" / ");
  popup.document.open();
  popup.document.write(`<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>KLSWA Taluk Team Work Efficiency</title>
      <style>
        body { font-family: Arial, sans-serif; color: #18231c; margin: 24px; }
        h1 { color: #0d4f38; margin: 0 0 6px; }
        h2 { color: #0d4f38; margin: 22px 0 8px; }
        .muted { color: #647064; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .summary div { border: 1px solid #dce5dc; border-radius: 8px; padding: 10px; background: #f8fbf7; }
        .summary span, .summary strong { display: block; }
        .summary strong { margin-top: 4px; font-size: 22px; color: #0d4f38; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
        th, td { border: 1px solid #d8ded6; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #eef5ee; color: #104f3a; }
        .badge { display: inline-block; border-radius: 999px; padding: 3px 7px; background: #e8f3ec; color: #0d4f38; font-size: 11px; font-weight: 700; }
        .offline { background: #f3f4f1; color: #607064; }
        @media print { body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>KLSWA Taluk Team Work Efficiency Report</h1>
      <p class="muted">${escapeHtml(userScopeLabel())} / Generated ${escapeHtml(generatedAt)}</p>
      <p class="muted">${escapeHtml(filterText)}</p>
      <div class="summary">
        <div><span>Tracked users</span><strong>${summary.users || 0}</strong></div>
        <div><span>Total website time</span><strong>${escapeHtml(formatDuration(summary.totalSeconds || 0))}</strong></div>
        <div><span>Today time</span><strong>${escapeHtml(formatDuration(summary.todaySeconds || 0))}</strong></div>
        <div><span>Active now</span><strong>${summary.activeUsers || 0}</strong></div>
      </div>
      <h2>User Efficiency</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name / Username</th>
            <th>Role</th>
            <th>District</th>
            <th>Taluk</th>
            <th>Sessions</th>
            <th>Total Time</th>
            <th>Today</th>
            <th>Last Seen</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(row.name || row.username || "-")}</strong><br><span class="muted">${escapeHtml(row.username || row.userId || "")}</span></td>
              <td>${escapeHtml(roleLabels[row.role] || row.role || "-")}</td>
              <td>${escapeHtml(row.district || "-")}</td>
              <td>${escapeHtml(row.taluk || "-")}</td>
              <td>${row.sessionCount || 0}</td>
              <td><strong>${escapeHtml(formatDuration(row.totalSeconds || 0))}</strong></td>
              <td>${escapeHtml(formatDuration(row.todaySeconds || 0))}</td>
              <td>${escapeHtml(formatDateTime(row.lastSeenAt))}</td>
              <td><span class="badge ${row.activeSessions ? "" : "offline"}">${row.activeSessions ? "Online" : "Offline"}</span></td>
            </tr>
          `).join("") || `<tr><td colspan="10">No session data available for selected filters.</td></tr>`}
        </tbody>
      </table>
      <script>window.addEventListener("load", () => window.print());</script>
    </body>
    </html>`);
  popup.document.close();
}

function renderTalukWorkDashboard() {
  if (state.user.role !== "taluk") return "";
  const pending = state.pending.rows || [];
  const missing = state.missingData.rows || [];
  const corrections = state.dataCorrectionRequests || [];
  const pendingCorrections = corrections.filter((item) => item.status === "Pending");
  return `
    <section class="box section taluk-work">
      <div class="section-head">
        <div>
          <h2>My taluk daily work</h2>
          <p class="muted">Today focus: approve pending applications, fill missing data, and track correction requests.</p>
        </div>
        <button class="secondary" id="talukProgressPdf">Export PDF</button>
      </div>
      <div class="work-grid">
        ${workCard("Pending approval", pending.length, "Open queue", "pending")}
        ${workCard("Missing data", state.missingData.total || missing.length, "Open follow-up", "missingData")}
        ${workCard("Pending corrections", pendingCorrections.length, "Open tracker", "dataCorrections")}
        ${workCard("Unread chat", unreadChatCount(), "Open chat", "teamChat")}
      </div>
      <div class="split">
        <div>
          <h2>Daily follow-up list</h2>
          <div class="table-wrap compact-table">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Missing</th><th>Action</th></tr></thead>
              <tbody>
                ${missing.slice(0, 8).map((member) => `
                  <tr>
                    <td>${escapeHtml(member.name)}</td>
                    <td>${escapeHtml(member.phoneNumber || "-")}</td>
                    <td><div class="mini-list">${member.missingFields.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></td>
                    <td class="actions">
                      <button class="secondary" data-dashboard-copy="${member.id}">Copy</button>
                      ${member.phoneNumber ? `<a class="secondary" href="${whatsAppLink(member)}" target="_blank">WhatsApp</a>` : ""}
                    </td>
                  </tr>
                `).join("") || `<tr><td colspan="4" class="muted">No missing data follow-up pending.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Correction tracker</h2>
          <div class="list">
            ${corrections.slice(0, 8).map((item) => `
              <div class="list-row">
                <span>
                  <strong>${escapeHtml(item.memberName)}</strong><br>
                  <span class="muted">${escapeHtml(item.reason || "-")}</span>
                </span>
                <span class="badge">${escapeHtml(item.status)}</span>
              </div>
            `).join("") || `<p class="muted">No correction requests yet.</p>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function workCard(title, count, label, tab) {
  return `
    <article class="work-card">
      <span class="muted">${escapeHtml(title)}</span>
      <strong>${escapeHtml(count)}</strong>
      <button class="secondary" data-open-work-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>
    </article>
  `;
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
        <div class="box stat"><span class="muted">Pending</span><strong>${workflowPendingStatuses.reduce((sum, status) => sum + (summary.statusCounts?.[status] || 0), 0)}</strong></div>
        <div class="box stat"><span class="muted">Needs correction</span><strong>${summary.statusCounts?.["Needs correction"] || 0}</strong></div>
      ` : `
        <div class="box stat"><span class="muted">Districts</span><strong>${summary.districts}</strong></div>
        <div class="box stat"><span class="muted">Taluks</span><strong>${summary.taluks}</strong></div>
        <div class="box stat"><span class="muted">Female</span><strong>${summary.gender.Female || 0}</strong></div>
      `}
    </div>
    ${renderTeamWhatsAppCard()}
    ${renderTalukWorkDashboard()}
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
          ${["admin", "state_president", "division", "district", "district_technical_head"].includes(state.user.role) ? `<a class="secondary" href="/api/exports/corrections">Export pending corrections</a>` : ""}
        </div>
        <div class="list">${summary.topDistricts.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
      <section class="box section">
        <h2>Top taluks</h2>
        <div class="list">${summary.topTaluks.map(([name, count]) => row(name, count)).join("")}</div>
      </section>
    </div>
    ${["admin", "state_president", "division", "district_technical_head"].includes(state.user.role) ? renderDistrictPerformance(performance) : ""}
  `;
  const pdfButton = document.querySelector("#districtPerformancePdf");
  if (pdfButton) pdfButton.addEventListener("click", () => exportDistrictPerformancePdf(performance));
  bindTeamWhatsAppCard();
  document.querySelectorAll("[data-open-work-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tab = button.dataset.openWorkTab;
      if (state.tab === "pending") await loadPending();
      if (state.tab === "missingData") await loadMissingData();
      if (state.tab === "dataCorrections") await loadDataCorrectionRequests();
      if (state.tab === "teamChat") await loadTeamChat();
      renderApp();
    });
  });
  document.querySelectorAll("[data-dashboard-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const member = state.missingData.rows.find((item) => item.id === button.dataset.dashboardCopy);
      await copyText(followupMessage(member));
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy"; }, 1400);
    });
  });
  const talukPdf = document.querySelector("#talukProgressPdf");
  if (talukPdf) talukPdf.addEventListener("click", exportTalukProgressPdf);
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

function reviewQueueStatusForRole() {
  if (state.user.role === "taluk") return "Pending Taluk Review";
  if (state.user.role === "district_technical_head") return "Pending District Review";
  if (state.user.role === "division") return "Pending Division Final Approval";
  return "";
}

function nextApprovalStatusForRole(member = {}) {
  if (state.user.role === "taluk") return "Pending District Review";
  if (state.user.role === "district_technical_head") return "Pending Division Final Approval";
  if (state.user.role === "division") return "Active";
  if (["admin", "state_president"].includes(state.user.role)) {
    if (member.status === "Pending Taluk Review") return "Pending District Review";
    if (member.status === "Pending District Review") return "Pending Division Final Approval";
    return "Active";
  }
  return "Active";
}

function approvalActionLabel(member = {}) {
  const next = nextApprovalStatusForRole(member);
  if (next === "Pending District Review") return "Approve to District";
  if (next === "Pending Division Final Approval") return "Approve to Division";
  return "Final Approve";
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
    "Open member login and fill missing data: https://klswa.in/member-login.html"
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
        <div class="actions">
          <button class="secondary" id="districtPerformancePdf">Export PDF</button>
          <span class="badge">${missing.length} taluks without login</span>
        </div>
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

function districtPerformanceHtml(performance) {
  const districts = performance.districts || [];
  const missing = performance.missingTalukLogins || [];
  const generatedAt = new Date().toLocaleString();
  return `<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>KLSWA District Performance Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1f2933; margin: 28px; }
        h1 { margin: 0 0 6px; color: #104f3a; }
        .muted { color: #607062; margin: 0 0 18px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .stat { border: 1px solid #d8ded6; border-radius: 8px; padding: 10px; }
        .stat span { display: block; color: #607062; font-size: 12px; }
        .stat strong { font-size: 22px; color: #104f3a; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 11px; }
        th, td { border: 1px solid #d8ded6; padding: 6px; text-align: left; }
        th { background: #eef5ee; color: #104f3a; }
        h2 { margin-top: 24px; color: #104f3a; }
        @media print { button { display: none; } body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>KLSWA District Performance Report</h1>
      <p class="muted">Generated by ${escapeHtml(state.user.name)} (${escapeHtml(userScopeLabel())}) on ${escapeHtml(generatedAt)}</p>
      <div class="stats">
        <div class="stat"><span>Districts</span><strong>${districts.length}</strong></div>
        <div class="stat"><span>Total Members</span><strong>${districts.reduce((sum, item) => sum + Number(item.members || 0), 0)}</strong></div>
        <div class="stat"><span>Taluk Logins</span><strong>${districts.reduce((sum, item) => sum + Number(item.talukLogins || 0), 0)}</strong></div>
        <div class="stat"><span>Missing Taluk Logins</span><strong>${missing.length}</strong></div>
      </div>
      <h2>District Performance</h2>
      <table>
        <thead>
          <tr>
            <th>District</th><th>Members</th><th>Active</th><th>Pending</th><th>Needs Correction</th>
            <th>Rejected</th><th>Taluk Logins</th><th>Missing</th><th>District President</th>
          </tr>
        </thead>
        <tbody>
          ${districts.map((item) => `
            <tr>
              <td>${escapeHtml(item.district)}</td>
              <td>${item.members}</td>
              <td>${item.active}</td>
              <td>${item.pending}</td>
              <td>${item.needsCorrection}</td>
              <td>${item.rejected}</td>
              <td>${item.talukLogins} / ${item.taluks}</td>
              <td>${item.missingTalukLogins}</td>
              <td>${item.districtPresident ? "Active" : "Missing"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <h2>Missing Taluk Team Logins</h2>
      <table>
        <thead><tr><th>District</th><th>Taluk</th></tr></thead>
        <tbody>
          ${missing.map((item) => `<tr><td>${escapeHtml(item.district)}</td><td>${escapeHtml(item.taluk)}</td></tr>`).join("") || `<tr><td colspan="2">No missing taluk team logins.</td></tr>`}
        </tbody>
      </table>
      <script>window.addEventListener("load", () => window.print());</script>
    </body>
    </html>`;
}

function exportDistrictPerformancePdf(performance) {
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try Export PDF again.");
    return;
  }
  popup.document.open();
  popup.document.write(districtPerformanceHtml(performance));
  popup.document.close();
}

function exportTalukProgressPdf() {
  const summary = state.dashboard.summary || {};
  const missing = state.missingData.rows || [];
  const pending = state.pending.rows || [];
  const corrections = state.dataCorrectionRequests || [];
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try Export PDF again.");
    return;
  }
  popup.document.open();
  popup.document.write(`<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>KLSWA Taluk Progress Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1f2933; margin: 28px; }
        h1, h2 { color: #104f3a; }
        .muted { color: #607062; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .stat { border: 1px solid #d8ded6; border-radius: 8px; padding: 10px; }
        .stat span { display: block; color: #607062; font-size: 12px; }
        .stat strong { font-size: 22px; color: #104f3a; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
        th, td { border: 1px solid #d8ded6; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #eef5ee; color: #104f3a; }
        @media print { body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>KLSWA Taluk Progress Report</h1>
      <p class="muted">${escapeHtml(userScopeLabel())} / Generated ${escapeHtml(new Date().toLocaleString())}</p>
      <div class="stats">
        <div class="stat"><span>Total members</span><strong>${summary.total || 0}</strong></div>
        <div class="stat"><span>Active</span><strong>${summary.statusCounts?.Active || 0}</strong></div>
        <div class="stat"><span>Pending</span><strong>${pending.length}</strong></div>
        <div class="stat"><span>Missing data</span><strong>${state.missingData.total || missing.length}</strong></div>
      </div>
      <h2>Pending approval workflow</h2>
      <table><thead><tr><th>Name</th><th>LS Number</th><th>Phone</th><th>Remarks</th></tr></thead><tbody>
        ${pending.slice(0, 50).map((member) => `<tr><td>${escapeHtml(member.name)}</td><td>${escapeHtml(member.lsNumber)}</td><td>${escapeHtml(member.phoneNumber)}</td><td>${escapeHtml(member.remarks)}</td></tr>`).join("") || `<tr><td colspan="4">No pending records.</td></tr>`}
      </tbody></table>
      <h2>Missing data follow-up</h2>
      <table><thead><tr><th>Name</th><th>LS Number</th><th>Phone</th><th>Missing fields</th></tr></thead><tbody>
        ${missing.slice(0, 75).map((member) => `<tr><td>${escapeHtml(member.name)}</td><td>${escapeHtml(member.lsNumber)}</td><td>${escapeHtml(member.phoneNumber)}</td><td>${escapeHtml(member.missingFields.join(", "))}</td></tr>`).join("") || `<tr><td colspan="4">No missing data records.</td></tr>`}
      </tbody></table>
      <h2>Correction requests</h2>
      <table><thead><tr><th>Member</th><th>Status</th><th>Reason</th><th>Admin remarks</th></tr></thead><tbody>
        ${corrections.slice(0, 50).map((item) => `<tr><td>${escapeHtml(item.memberName)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.adminRemarks || "-")}</td></tr>`).join("") || `<tr><td colspan="4">No correction requests.</td></tr>`}
      </tbody></table>
      <script>window.addEventListener("load", () => window.print());</script>
    </body>
    </html>`);
  popup.document.close();
}

function renderMembers() {
  const lists = state.dashboard.lists;
  const talukOptions = taluksForDistrict(lists, state.filters.district);
  const canExport = state.user.role !== "taluk" || canTaluk("exportReports");
  const canRequestCorrection = state.user.role === "taluk" && canTaluk("submitCorrection");
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="searchInput" value="${escapeHtml(state.filters.search)}" placeholder="Name, LS, phone, caste, village"></label>
        <label>District <select id="districtFilter"><option value="">All districts</option>${optionList(lists.districts, state.filters.district)}</select></label>
        <label>Taluk <select id="talukFilter"><option value="">${state.filters.district ? "All taluks in district" : "All taluks"}</option>${optionList(talukOptions, state.filters.taluk)}</select></label>
        <label>Status <select id="statusFilter"><option value="">All status</option>${optionList(memberStatusOptions, state.filters.status || "")}</select></label>
        <label>Gender <select id="genderFilter"><option value="">All gender</option>${optionList(["Male", "Female", "Other"], state.filters.gender || "")}</select></label>
        <label>Batch <select id="batchFilter"><option value="">All batches</option>${optionList(batchYearOptions(), state.filters.batchYear || "")}</select></label>
        <label class="check filter-check"><input id="missingOnlyFilter" type="checkbox" ${state.filters.missingOnly ? "checked" : ""}> Missing only</label>
        <span class="actions">
          <button class="secondary" id="applyFilters">Apply</button>
          ${canExport ? `<a class="secondary" id="memberExportLink" href="${exportUrl("/api/exports/members", state.filters)}">Export CSV</a>` : ""}
          ${canExport ? `<button class="secondary" id="memberDistrictPdf">District-wise PDF</button>` : ""}
          ${state.user.role === "taluk" && canExport ? `
            <a class="secondary" href="${exportUrl("/api/exports/members", { ...state.filters, status: "", workflowPending: "true" })}">Pending CSV</a>
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
                  ${canRequestCorrection ? `<button class="secondary" data-request-correction="${member.id}">Request</button>` : ""}
                  <button class="secondary" data-member-notes="${member.id}">Notes</button>
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
    state.filters.status = document.querySelector("#statusFilter").value;
    state.filters.gender = document.querySelector("#genderFilter").value;
    state.filters.batchYear = document.querySelector("#batchFilter").value;
    state.filters.missingOnly = document.querySelector("#missingOnlyFilter").checked;
    await loadMembers(1);
    renderApp();
  });
  document.querySelector("#memberDistrictPdf")?.addEventListener("click", exportMemberDistrictPdf);
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
  document.querySelectorAll("[data-member-notes]").forEach((button) => {
    button.addEventListener("click", () => openMemberNotesModal(button.dataset.memberNotes));
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

async function exportMemberDistrictPdf() {
  const button = document.querySelector("#memberDistrictPdf");
  const originalText = button?.textContent || "District-wise PDF";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing PDF...";
  }
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try District-wise PDF again.");
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
    return;
  }
  popup.document.open();
  popup.document.write("<p style=\"font-family:Arial,sans-serif;padding:24px;\">Preparing district-wise member PDF...</p>");
  popup.document.close();
  try {
    const members = await loadAllMembersForExport(state.filters);
    const lists = state.dashboard.lists || {};
    const districts = [...new Set([
      ...(state.filters.district ? [state.filters.district] : []),
      ...members.map((member) => member.district).filter(Boolean),
      ...(!state.filters.district && ["admin", "state_president"].includes(state.user.role) ? (lists.districts || []) : [])
    ])].sort();
    const membersByDistrict = Object.groupBy
      ? Object.groupBy(members, (member) => member.district || "Not assigned")
      : members.reduce((groups, member) => {
        const key = member.district || "Not assigned";
        groups[key] ||= [];
        groups[key].push(member);
        return groups;
      }, {});
    const statusCounts = members.reduce((counts, member) => {
      const key = member.status || "Blank";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const genderCounts = members.reduce((counts, member) => {
      const key = member.gender || "Blank";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const missingCount = members.filter((member) => missingFields(member).length).length;
    const generatedAt = new Date().toLocaleString();
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html>
      <head>
        <title>KLSWA Member District-wise Report</title>
        <style>
          body { font-family: Arial, sans-serif; color: #18231c; margin: 24px; }
          h1 { color: #0d4f38; margin: 0 0 6px; }
          h2 { color: #0d4f38; margin: 24px 0 8px; page-break-after: avoid; }
          .muted { color: #647064; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .summary div { border: 1px solid #dce5dc; border-radius: 8px; padding: 10px; background: #f8fbf7; }
          .summary span, .summary strong { display: block; }
          .summary strong { margin-top: 4px; font-size: 22px; color: #0d4f38; }
          .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 16px; }
          .chip { border: 1px solid #d8ded6; border-radius: 999px; padding: 5px 9px; background: #f8fbf7; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 10.5px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid #d8ded6; padding: 5px; text-align: left; vertical-align: top; }
          th { background: #eef5ee; color: #104f3a; }
          .district-summary { font-weight: 700; color: #334139; margin-bottom: 6px; }
          @media print { body { margin: 14px; } .summary { grid-template-columns: repeat(4, 1fr); } }
        </style>
      </head>
      <body>
        <h1>KLSWA Member District-wise Report</h1>
        <p class="muted">Generated by ${escapeHtml(state.user.name)} (${escapeHtml(userScopeLabel())}) on ${escapeHtml(generatedAt)}</p>
        <p class="muted">Filters: District ${escapeHtml(state.filters.district || "All")}, Taluk ${escapeHtml(state.filters.taluk || "All")}, Status ${escapeHtml(state.filters.status || "All")}, Gender ${escapeHtml(state.filters.gender || "All")}, Batch ${escapeHtml(state.filters.batchYear || "All")}</p>
        <div class="summary">
          <div><span>Total members</span><strong>${members.length}</strong></div>
          <div><span>Districts</span><strong>${districts.filter((district) => (membersByDistrict[district] || []).length).length}</strong></div>
          <div><span>Missing data</span><strong>${missingCount}</strong></div>
          <div><span>Pending / correction</span><strong>${workflowPendingStatuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0) + (statusCounts["Needs correction"] || 0)}</strong></div>
        </div>
        <div class="chips">
          ${Object.entries(statusCounts).sort().map(([label, value]) => `<span class="chip">${escapeHtml(label)}: ${value}</span>`).join("")}
        </div>
        <div class="chips">
          ${Object.entries(genderCounts).sort().map(([label, value]) => `<span class="chip">${escapeHtml(label)}: ${value}</span>`).join("")}
        </div>
        ${districts.map((district) => {
          const rows = (membersByDistrict[district] || []).sort((a, b) => `${a.taluk || ""}${a.name || ""}`.localeCompare(`${b.taluk || ""}${b.name || ""}`));
          if (!rows.length) return "";
          const districtStatuses = rows.reduce((counts, member) => {
            const key = member.status || "Blank";
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {});
          return `
            <h2>${escapeHtml(district)}</h2>
            <div class="district-summary">
              Total: ${rows.length}
              ${Object.entries(districtStatuses).sort().map(([label, value]) => ` | ${escapeHtml(label)}: ${value}`).join("")}
            </div>
            <table>
              <thead>
                <tr><th>Taluk</th><th>Name</th><th>LS Number</th><th>Phone</th><th>Gender</th><th>Batch</th><th>Status</th><th>Missing Fields</th></tr>
              </thead>
              <tbody>
                ${rows.map((member) => {
                  const missing = missingFields(member);
                  return `<tr>
                    <td>${escapeHtml(member.taluk || "-")}</td>
                    <td>${escapeHtml(member.name || "-")}</td>
                    <td>${escapeHtml(member.lsNumber || "-")}</td>
                    <td>${escapeHtml(member.phoneNumber || "-")}</td>
                    <td>${escapeHtml(member.gender || "-")}</td>
                    <td>${escapeHtml(member.batchYear || "-")}</td>
                    <td>${escapeHtml(member.status || "-")}</td>
                    <td>${missing.length ? escapeHtml(missing.join(", ")) : "-"}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          `;
        }).join("") || `<p>No member records found for the selected filters.</p>`}
        <script>window.addEventListener("load", () => window.print());</script>
      </body>
      </html>`);
    popup.document.close();
  } catch (error) {
    alert(error.message || "Could not create district-wise PDF");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
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
                <td><span class="badge">${escapeHtml(member.status)}</span><br>${escapeHtml(member.remarks)}</td>
                <td class="actions">
                  <button class="secondary" data-view-pending="${member.id}">View</button>
                  <button class="primary" data-review-status="${escapeHtml(nextApprovalStatusForRole(member))}" data-member="${member.id}">${escapeHtml(approvalActionLabel(member))}</button>
                  <button class="secondary" data-review-status="Inactive" data-member="${member.id}">Mark inactive</button>
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
          <button class="primary" type="button" data-modal-status="${escapeHtml(nextApprovalStatusForRole(member))}">${escapeHtml(approvalActionLabel(member))}</button>
          <button class="secondary" type="button" data-modal-status="Inactive">Mark inactive</button>
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
  const needsReason = ["Rejected", "Needs correction", "Inactive"].includes(status);
  const actionLabels = {
    Active: "Final approve application",
    "Pending District Review": "Approve to District Technical Head",
    "Pending Division Final Approval": "Approve to Division Technical Head",
    Inactive: "Mark member inactive",
    "Needs correction": "Send for correction",
    Rejected: "Reject application"
  };
  const statusHelp = {
    Active: "Final approval will make the member active and open the member login activation slot.",
    "Pending District Review": "Taluk review will be completed and this application will move to the District Technical Head queue.",
    "Pending Division Final Approval": "District review will be completed and this application will move to the Division Technical Head final approval queue.",
    Inactive: "This member will be kept in records as inactive and excluded from active member count.",
    "Needs correction": "This reason will be saved in remarks and shown to the member/team.",
    Rejected: "This rejection reason will be saved in remarks."
  };
  const existingRemarks = status === "Inactive" && !member.remarks ? inactiveMemberRemark : member.remarks;
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
          <span>${escapeHtml(statusHelp[status] || "This status change will be saved in member records.")}</span>
        </div>
        <label>Reason ${needsReason ? "*" : ""}
          <textarea name="remarks" rows="4" ${needsReason ? "required" : ""} placeholder="${needsReason ? "Enter clear reason" : "Optional approval note"}">${escapeHtml(existingRemarks)}</textarea>
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
          <label>Age<input name="age" type="number" value="${escapeHtml(member.age)}" readonly></label>
          ${field("phoneNumber", "Phone Number", member.phoneNumber)}
        </div>
        <div class="two">
          ${field("qualification", "Qualification", member.qualification)}
          ${selectField("batchYear", "Batch Year", batchYearOptions(), member.batchYear)}
        </div>
        <div class="two">
          ${selectField("status", "Status", editableMemberStatusOptions, member.status || "Active")}
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
  bindAgeCalculation(backdrop);
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

async function openMemberNotesModal(memberId) {
  let data;
  try {
    data = await request(`/api/members/${memberId}/notes`);
  } catch (error) {
    alert(error.message);
    return;
  }
  state.memberNotes = data;
  const member = data.member;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="memberNoteForm">
        <div class="modal-head">
          <div>
            <h2>Member notes</h2>
            <p class="muted">${escapeHtml(member.name)} - ${escapeHtml(member.lsNumber)} - ${escapeHtml(member.taluk)}</p>
          </div>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="two">
          ${selectField("noteType", "Note type", ["Call", "Visit", "WhatsApp", "Correction", "General"], "Call")}
          <label>Note
            <textarea name="note" rows="3" required placeholder="Example: Called member, address pending"></textarea>
          </label>
        </div>
        <div class="message" id="memberNoteMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Close</button>
          <button class="primary" type="submit">Add note</button>
        </div>
        <div class="timeline note-timeline">
          ${(data.notes || []).map((note) => `
            <div class="timeline-item">
              <span class="badge">${escapeHtml(note.noteType)}</span>
              <span class="muted">${escapeHtml(note.createdByName || "-")} / ${escapeHtml(new Date(note.createdAt).toLocaleString())}</span>
              <p>${escapeHtml(note.note).replace(/\n/g, "<br>")}</p>
            </div>
          `).join("") || `<p class="muted">No notes yet.</p>`}
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#memberNoteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = backdrop.querySelector("#memberNoteMessage");
    try {
      await request(`/api/members/${memberId}/notes`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
      });
      backdrop.remove();
      await openMemberNotesModal(memberId);
    } catch (error) {
      message.textContent = error.message;
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
          ${selectField("batchYear", "Batch Year", batchYearOptions(), member.batchYear)}
        </div>
        <div class="three">
          ${field("dateOfBirth", "Date of Birth", member.dateOfBirth, "date")}
          <label>Age<input name="age" type="number" value="${escapeHtml(member.age)}" readonly></label>
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
  bindAgeCalculation(backdrop);
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
      alert("Correction request sent for approval.");
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
      <h2>Add member</h2>
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
          <label>Age<input name="age" type="number" readonly placeholder="Auto-calculated"></label>
          ${field("phoneNumber", "Phone Number")}
        </div>
        <div class="two">
          ${field("qualification", "Qualification")}
          ${selectField("batchYear", "Batch Year", batchYearOptions())}
        </div>
        <div class="two">
          ${selectField("status", "Status", editableMemberStatusOptions, "Active")}
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
  bindAgeCalculation(form);
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
  const canReviewTeamRequests = ["admin", "division", "district_technical_head"].includes(state.user.role);
  const roleOptions = ["admin", "state_president", "division", "district", "district_technical_head", "legal_team_head", "taluk"];
  const filteredUsers = filterUsersForView(state.users);
  const counts = userCounts(state.users);
  document.querySelector("#view").innerHTML = `
    <div class="stats">
      <div class="box stat"><span class="muted">Total logins</span><strong>${state.users.length}</strong></div>
      <div class="box stat"><span class="muted">State President</span><strong>${counts.state_president}</strong></div>
      <div class="box stat"><span class="muted">Division Teams</span><strong>${counts.division}</strong></div>
      <div class="box stat"><span class="muted">District Presidents</span><strong>${counts.district}</strong></div>
      <div class="box stat"><span class="muted">District Tech Heads</span><strong>${counts.district_technical_head}</strong></div>
      <div class="box stat"><span class="muted">Legal Heads</span><strong>${counts.legal_team_head}</strong></div>
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
            ${selectField("role", "Role", ["taluk", "district_technical_head", "legal_team_head", "district", "division", "state_president", "admin"], "taluk", false, roleLabels)}
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
          <button class="secondary" id="talukTeamPdf">District-wise PDF</button>
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
    ${canReviewTeamRequests ? renderTeamRequests() : ""}
  `;

  document.querySelector("#applyUserFilters").addEventListener("click", () => {
    state.userFilters.search = document.querySelector("#userSearch").value;
    state.userFilters.role = document.querySelector("#userRole").value;
    state.userFilters.district = document.querySelector("#userDistrict").value;
    renderApp();
  });
  document.querySelector("#talukTeamPdf").addEventListener("click", () => exportTalukTeamDistrictPdf(filteredUsers));

  if (canReviewTeamRequests && !canManageUsers) bindTeamRequestActions();

  if (!canManageUsers) return;

  const districtSelect = document.querySelector('#userForm select[name="district"]');
  const talukSelect = document.querySelector('#userForm select[name="taluk"]');
  const joinDistrict = document.querySelector('select[name="joinDistrict"]');
  const joinTaluk = document.querySelector('select[name="joinTaluk"]');
  const roleSelect = document.querySelector('#userForm select[name="role"]');
  roleSelect.addEventListener("change", () => {
    const needsTaluk = roleSelect.value === "taluk";
    const needsDivision = roleSelect.value === "division";
    const needsDistrict = ["taluk", "district", "district_technical_head"].includes(roleSelect.value);
    const needsState = ["admin", "state_president"].includes(roleSelect.value);
    districtSelect.innerHTML = `<option value="">Select</option>${optionList(needsDivision ? (lists.divisions || []) : lists.districts)}`;
    districtSelect.disabled = needsState || !needsDistrict && !needsDivision;
    talukSelect.disabled = !needsTaluk;
    if (needsState) districtSelect.value = "";
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
  document.querySelectorAll("[data-taluk-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.users.find((user) => user.id === button.dataset.talukProfile);
      openTalukProfileModal(target);
    });
  });
  document.querySelectorAll("[data-toggle-user-active]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.users.find((user) => user.id === button.dataset.toggleUserActive);
      if (!target) return;
      const nextActive = !target.active;
      const action = nextActive ? "activate" : "mark inactive";
      if (!confirm(`${action.charAt(0).toUpperCase()}${action.slice(1)} this taluk login?\n\n${target.name || target.username} - ${target.district} / ${target.taluk}`)) return;
      button.disabled = true;
      try {
        await request(`/api/users/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...target, active: nextActive })
        });
        await loadUsers();
        renderApp();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
  bindTeamRequestActions();
}

function bindTeamRequestActions() {
  document.querySelectorAll("[data-team-request]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = document.querySelector("#teamRequestMessage");
      if (message) {
        message.textContent = "";
        message.classList.remove("success");
      }
      const status = button.dataset.status;
      const item = state.teamRequests.find((request) => request.id === button.dataset.teamRequest);
      if (!item) return;
      let remarks = "";
      if (status === "Rejected") {
        const note = prompt("Reason for rejection:", item.remarks || "");
        if (note === null) return;
        remarks = note;
      }
      button.disabled = true;
      try {
        await request(`/api/taluk-team-requests/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ status, remarks })
        });
        if (message) {
          message.textContent = status === "Approved" ? "Login approved successfully." : "Request rejected.";
          message.classList.add("success");
        }
        await loadUsers();
        renderApp();
      } catch (error) {
        if (message) message.textContent = error.message;
        else alert(error.message);
      } finally {
        button.disabled = false;
      }
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
      <div class="message" id="teamRequestMessage"></div>
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

function exportTalukTeamDistrictPdf(users) {
  const lists = state.dashboard.lists || {};
  const talukUsers = (users || [])
    .filter((user) => user.role === "taluk")
    .sort((a, b) => `${a.district || ""}${a.taluk || ""}`.localeCompare(`${b.district || ""}${b.taluk || ""}`));
  const visibleDistricts = () => {
    if (["district", "district_technical_head"].includes(state.user.role) && state.user.district) return [state.user.district];
    if (state.userFilters.district) return [state.userFilters.district];
    if (state.user.role === "division") {
      return [...new Set(talukUsers.map((user) => user.district).filter(Boolean))].sort();
    }
    return [...new Set([
      ...(lists.districts || []),
      ...talukUsers.map((user) => user.district).filter(Boolean)
    ])].sort();
  };
  const districts = visibleDistricts();
  const usersByDistrict = Object.groupBy
    ? Object.groupBy(talukUsers, (user) => user.district || "Not assigned")
    : talukUsers.reduce((groups, user) => {
      const key = user.district || "Not assigned";
      groups[key] ||= [];
      groups[key].push(user);
      return groups;
    }, {});
  const missingByDistrict = districts.map((district) => {
    const assigned = new Set((usersByDistrict[district] || []).map((user) => String(user.taluk || "").toLowerCase()));
    const missing = taluksForDistrict(lists, district).filter((taluk) => !assigned.has(String(taluk).toLowerCase()));
    return { district, missing };
  }).filter((item) => item.missing.length);
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Allow popups and try District-wise PDF again.");
    return;
  }
  const generatedAt = new Date().toLocaleString();
  popup.document.open();
  popup.document.write(`<!doctype html>
    <html>
    <head>
      <title>KLSWA Taluk Technical Team District-wise Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #18231c; margin: 24px; }
        h1 { color: #0d4f38; margin: 0 0 6px; }
        h2 { color: #0d4f38; margin: 24px 0 8px; }
        .muted { color: #647064; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .summary div { border: 1px solid #dce5dc; border-radius: 8px; padding: 10px; background: #f8fbf7; }
        .summary span, .summary strong { display: block; }
        .summary strong { margin-top: 4px; font-size: 22px; color: #0d4f38; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 12px; }
        th, td { border: 1px solid #d8ded6; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #eef5ee; color: #104f3a; }
        .badge { border-radius: 999px; padding: 3px 7px; background: #e8f3ec; color: #0d4f38; font-size: 11px; font-weight: 700; }
        .inactive { background: #fff1ef; color: #8c2b23; }
        .missing-list { columns: 3; margin: 8px 0 18px; padding-left: 18px; }
        @media print { button { display: none; } body { margin: 16px; } .summary { grid-template-columns: repeat(4, 1fr); } }
      </style>
    </head>
    <body>
      <h1>KLSWA Taluk Technical Team District-wise Report</h1>
      <p class="muted">Generated by ${escapeHtml(state.user.name)} (${escapeHtml(userScopeLabel())}) on ${escapeHtml(generatedAt)}</p>
      <div class="summary">
        <div><span>Total technical logins</span><strong>${talukUsers.length}</strong></div>
        <div><span>Active</span><strong>${talukUsers.filter((user) => user.active).length}</strong></div>
        <div><span>Inactive</span><strong>${talukUsers.filter((user) => !user.active).length}</strong></div>
        <div><span>Missing taluks</span><strong>${missingByDistrict.reduce((sum, item) => sum + item.missing.length, 0)}</strong></div>
      </div>
      ${districts.map((district) => {
        const rows = usersByDistrict[district] || [];
        if (!rows.length && !missingByDistrict.some((item) => item.district === district)) return "";
        return `
          <h2>${escapeHtml(district)}</h2>
          <table>
            <thead><tr><th>Taluk</th><th>Name</th><th>Phone Number</th><th>Status</th><th>Permissions Disabled</th></tr></thead>
            <tbody>
              ${rows.map((user) => {
                const disabled = Object.entries(talukPermissions(user)).filter(([, enabled]) => enabled === false).map(([key]) => talukPermissionLabels[key] || key);
                return `<tr>
                  <td>${escapeHtml(user.taluk || "-")}</td>
                  <td>${escapeHtml(user.name || "-")}</td>
                  <td>${escapeHtml(user.phoneNumber || "-")}</td>
                  <td><span class="badge ${user.active ? "" : "inactive"}">${user.active ? "Active" : "Inactive"}</span></td>
                  <td>${disabled.length ? escapeHtml(disabled.join(", ")) : "None"}</td>
                </tr>`;
              }).join("") || `<tr><td colspan="5">No taluk technical team logins.</td></tr>`}
            </tbody>
          </table>
          ${(() => {
            const missing = missingByDistrict.find((item) => item.district === district)?.missing || [];
            return missing.length ? `<strong>Missing taluk team logins</strong><ul class="missing-list">${missing.map((taluk) => `<li>${escapeHtml(taluk)}</li>`).join("")}</ul>` : "";
          })()}
        `;
      }).join("")}
      <script>window.addEventListener("load", () => window.print());</script>
    </body>
    </html>`);
  popup.document.close();
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
    state_president: users.filter((user) => user.role === "state_president").length,
    division: users.filter((user) => user.role === "division").length,
    district: users.filter((user) => user.role === "district").length,
    district_technical_head: users.filter((user) => user.role === "district_technical_head").length,
    legal_team_head: users.filter((user) => user.role === "legal_team_head").length,
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
  const permissionValues = user.role === "taluk" ? talukPermissions(user) : {};
  const disabledPermissions = Object.entries(permissionValues).filter(([, enabled]) => enabled === false).length;
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
      ${user.role === "taluk" ? `<p class="muted">${disabledPermissions ? `${disabledPermissions} permission${disabledPermissions === 1 ? "" : "s"} disabled` : "All taluk permissions enabled"}</p>` : ""}
      <div class="actions">
        ${canManageUsers && user.role === "taluk" ? `<button class="secondary" data-taluk-profile="${user.id}">Profile</button>` : ""}
        ${canManageUsers && user.username !== "admin" ? `<button class="secondary" data-reset-user="${user.id}">Password</button>` : ""}
        ${canManageUsers && user.role === "taluk" ? `<button class="${user.active ? "danger" : "primary"}" data-toggle-user-active="${user.id}">${user.active ? "Mark inactive" : "Activate"}</button>` : ""}
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

function openTalukProfileModal(user) {
  if (!user) return;
  const permissions = talukPermissions(user);
  const permissionFields = Object.entries(talukPermissionLabels).map(([key, label]) => `
    <label class="check">
      <input type="checkbox" name="${key}" ${permissions[key] !== false ? "checked" : ""}>
      ${escapeHtml(label)}
    </label>
  `).join("");
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop">
      <form class="box modal" id="talukProfileForm">
        <div class="modal-head">
          <h2>Taluk team profile</h2>
          <button class="icon-btn" type="button" data-close title="Close">X</button>
        </div>
        <div class="profile-summary">
          <div><span class="muted">User ID</span><strong>${escapeHtml(user.username)}</strong></div>
          <div><span class="muted">District</span><strong>${escapeHtml(user.district || "-")}</strong></div>
          <div><span class="muted">Taluk</span><strong>${escapeHtml(user.taluk || "-")}</strong></div>
        </div>
        ${field("name", "Profile name", user.name || user.username)}
        <label class="check"><input type="checkbox" name="active" ${user.active ? "checked" : ""}> Login active</label>
        <h3>Permission control</h3>
        <div class="permission-grid">
          ${permissionFields}
        </div>
        <div class="message" id="talukProfileMessage"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" data-close>Cancel</button>
          <button class="primary" type="submit">Save profile</button>
        </div>
      </form>
    </div>
  `);
  const backdrop = document.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => backdrop.remove()));
  backdrop.querySelector("#talukProfileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextPermissions = Object.fromEntries(Object.keys(talukPermissionLabels).map((key) => [key, formData.get(key) === "on"]));
    try {
      await request(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...user,
          name: String(formData.get("name") || user.name || user.username).trim(),
          active: formData.get("active") === "on",
          permissions: nextPermissions
        })
      });
      backdrop.remove();
      await loadUsers();
      renderApp();
    } catch (error) {
      backdrop.querySelector("#talukProfileMessage").textContent = error.message;
    }
  });
}

function renderCorrections() {
  const lists = state.dashboard.lists;
  const isTalukScoped = state.user.role === "taluk";
  const filterDistrict = isTalukScoped ? state.user.district || "" : state.correctionFilters.district;
  if (isTalukScoped) state.correctionFilters.district = filterDistrict;
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="toolbar">
        <label>Search <input id="correctionSearch" value="${escapeHtml(state.correctionFilters.search)}" placeholder="Name, LS number, raw taluk"></label>
        <label>District <select id="correctionDistrict" ${isTalukScoped ? "disabled" : ""}><option value="">All districts</option>${optionList(lists.districts, filterDistrict)}</select></label>
        <span></span>
        <span class="actions">
          <button class="secondary" id="applyCorrectionFilters">Apply</button>
          ${state.user.role !== "taluk" || canTaluk("exportReports") ? `<a class="secondary" href="${exportUrl("/api/exports/corrections", state.correctionFilters)}">Export CSV</a>` : ""}
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
    state.correctionFilters.district = isTalukScoped ? state.user.district || "" : document.querySelector("#correctionDistrict").value;
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

function renderBackupRestore() {
  if (state.user.role !== "admin") {
    document.querySelector("#view").innerHTML = `<section class="box section"><p>Admin access required.</p></section>`;
    return;
  }
  const preview = state.restorePreview;
  document.querySelector("#view").innerHTML = `
    <div class="split">
      <section class="box section">
        <div class="section-head">
          <div>
            <h2>One-click PostgreSQL backup</h2>
            <p class="muted">Download all KLSWA app data: users, members, audit history, correction requests, messages, chat and notes.</p>
          </div>
        </div>
        <div class="backup-card">
          <strong>Backup file format</strong>
          <span class="muted">JSON app-data backup for PostgreSQL restore. Keep this file private because it includes login data.</span>
          <a class="primary" href="/api/admin/backup">Download backup</a>
        </div>
      </section>
      <section class="box section">
        <div class="section-head">
          <div>
            <h2>Homepage slider photos</h2>
            <p class="muted">Upload JPG photos for the public homepage slider. Recommended landscape photo, under 4 MB.</p>
          </div>
        </div>
        <div class="slider-upload-grid">
          ${[1, 2, 3, 4].map((slot) => sliderUploadCard(slot)).join("")}
        </div>
        <div class="message" id="sliderUploadMessage"></div>
      </section>
      <section class="box section">
        <div class="section-head">
          <div>
            <h2>Restore from backup</h2>
            <p class="muted">Restore replaces current database data. Admin password confirmation is required.</p>
          </div>
        </div>
        <form id="restoreForm" class="form-grid">
          <label>Backup JSON file
            <input id="restoreFile" type="file" accept="application/json,.json" ${preview ? "" : "required"}>
          </label>
          ${preview ? restorePreviewCard(preview) : `<div class="notice">Select a backup file to preview table counts before restore.</div>`}
          <label>Type RESTORE to confirm
            <input name="confirmText" placeholder="RESTORE" required>
          </label>
          <label>Current admin password
            <input name="adminPassword" type="password" autocomplete="current-password" required>
          </label>
          <div class="message" id="restoreMessage"></div>
          <div class="actions">
            <button class="danger" type="submit" ${preview ? "" : "disabled"}>Restore backup</button>
            <button class="secondary" type="button" id="clearRestore">Clear</button>
          </div>
        </form>
      </section>
    </div>
  `;

  bindSliderUploadControls(renderBackupRestore);

  document.querySelector("#restoreFile").addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const message = document.querySelector("#restoreMessage");
    message.textContent = "";
    state.restorePreview = null;
    if (!file) {
      renderBackupRestore();
      return;
    }
    try {
      const backup = JSON.parse(await file.text());
      if (backup.type !== "klswa-postgres-app-backup" || !backup.tables) throw new Error("Invalid KLSWA backup file");
      state.restorePreview = backup;
      renderBackupRestore();
    } catch (error) {
      message.textContent = error.message;
    }
  });
  document.querySelector("#clearRestore").addEventListener("click", () => {
    state.restorePreview = null;
    renderBackupRestore();
  });
  document.querySelector("#restoreForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#restoreMessage");
    const form = new FormData(event.currentTarget);
    message.textContent = "";
    message.classList.remove("success");
    if (!state.restorePreview) {
      message.textContent = "Select a valid backup file first.";
      return;
    }
    if (String(form.get("confirmText") || "").trim() !== "RESTORE") {
      message.textContent = "Type RESTORE to confirm.";
      return;
    }
    if (!confirm("Restore will replace current database data. Continue?")) return;
    try {
      const result = await request("/api/admin/restore", {
        method: "POST",
        body: JSON.stringify({
          adminPassword: form.get("adminPassword"),
          backup: state.restorePreview
        })
      });
      state.restorePreview = null;
      alert(`Restore completed at ${new Date(result.result.restoredAt).toLocaleString()}. Please login again if your session was restored from backup.`);
      window.location.reload();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function renderHomeSlider() {
  if (state.user.role !== "admin") {
    document.querySelector("#view").innerHTML = `<section class="box section"><p>Admin access required.</p></section>`;
    return;
  }
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
        <div>
          <h2>Homepage slider photos</h2>
          <p class="muted">Upload JPG photos for the public homepage slider. Recommended landscape photo, under 4 MB.</p>
        </div>
        <a class="secondary" href="/" target="_blank">View homepage</a>
      </div>
      <div class="slider-upload-grid">
        ${[1, 2, 3, 4].map((slot) => sliderUploadCard(slot)).join("")}
      </div>
      <div class="message" id="sliderUploadMessage"></div>
    </section>
  `;
  bindSliderUploadControls(renderHomeSlider);
}

function bindSliderUploadControls(afterUpload) {
  document.querySelectorAll("[data-slider-file]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const slot = Number(event.currentTarget.dataset.sliderFile);
      const file = event.currentTarget.files?.[0];
      const message = document.querySelector("#sliderUploadMessage");
      message.textContent = "";
      message.classList.remove("success");
      if (!file) return;
      if (!/^image\/jpe?g$/.test(file.type)) {
        message.textContent = "Please select a JPG/JPEG image.";
        event.currentTarget.value = "";
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        message.textContent = "Image must be less than 4 MB.";
        event.currentTarget.value = "";
        return;
      }
      try {
        const imageData = await fileToDataUrl(file);
        await request("/api/admin/slider", {
          method: "POST",
          body: JSON.stringify({ slot, imageData })
        });
        message.textContent = `Slider photo ${slot} uploaded successfully.`;
        message.classList.add("success");
        await loadSliderPhotos();
        afterUpload();
      } catch (error) {
        message.textContent = error.message;
      }
    });
  });
}

function sliderUploadCard(slot) {
  const photo = state.sliderPhotos.find((item) => Number(item.slot) === slot);
  return `
    <article class="slider-upload-card">
      <div class="slider-thumb">
        ${photo?.exists ? `<img src="${escapeHtml(photo.url)}" alt="Slider photo ${slot}">` : `<span>Slide ${slot}</span>`}
      </div>
      <strong>Photo ${slot}</strong>
      <span class="muted">${photo?.exists ? `Updated ${formatDateTime(photo.updatedAt)}` : "No photo uploaded"}</span>
      <label class="secondary upload-button">
        Upload JPG
        <input type="file" accept="image/jpeg,.jpg,.jpeg" data-slider-file="${slot}">
      </label>
    </article>
  `;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
  });
}

function restorePreviewCard(backup) {
  const tables = backup.tables || {};
  const counts = Object.entries(tables).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]);
  return `
    <div class="backup-preview">
      <strong>${escapeHtml(backup.type)} v${escapeHtml(backup.version || 1)}</strong>
      <span class="muted">Created: ${escapeHtml(backup.createdAt || "-")} / Source: ${escapeHtml(backup.database || "-")}</span>
      <div class="backup-counts">
        ${counts.map(([name, count]) => `<div><span>${escapeHtml(name)}</span><strong>${count}</strong></div>`).join("")}
      </div>
    </div>
  `;
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
  const canReviewCorrections = ["admin", "division", "district_technical_head"].includes(state.user.role) || (state.user.role === "taluk" && canTaluk("approveCorrection"));
  document.querySelector("#view").innerHTML = `
    <section class="box section">
      <div class="section-head">
          <h2>${canReviewCorrections || state.user.role === "state_president" ? "Pending data correction requests" : "My correction requests"}</h2>
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
                    ${canReviewCorrections && item.status === "Pending" ? `
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
  const entries = Object.entries(changes && typeof changes === "object" ? changes : {});
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
  const canExport = state.user.role !== "taluk" || canTaluk("exportReports");
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
        ${canExport ? `<a class="secondary" href="${exportUrl("/api/exports/audit-logs", state.auditFilters)}">Export CSV</a>` : ""}
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
          ${state.user.role !== "taluk" || canTaluk("exportReports") ? `<a class="secondary" href="${exportUrl("/api/exports/audit-logs", { memberId })}">Export member CSV</a>` : ""}
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

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${Math.floor(total)}s`;
}

function correctionRow(member, lists) {
  const isTalukScoped = state.user?.role === "taluk";
  const ownDistrict = isTalukScoped ? state.user.district || "" : "";
  const ownTaluk = isTalukScoped ? state.user.taluk || "" : "";
  const district = isTalukScoped && lists.districts.includes(ownDistrict)
    ? ownDistrict
    : member.suggestedDistrict && lists.districts.includes(member.suggestedDistrict)
    ? member.suggestedDistrict
    : "";
  const taluks = isTalukScoped && ownTaluk ? [ownTaluk] : taluksForDistrict(lists, district);
  const taluk = isTalukScoped && ownTaluk
    ? ownTaluk
    : member.suggestedTaluk && taluks.includes(member.suggestedTaluk) ? member.suggestedTaluk : "";
  return `
    <tr>
      <td>${escapeHtml(member.name)}</td>
      <td>${escapeHtml(member.lsNumber)}</td>
      <td>${escapeHtml(member.rawDistrict)}</td>
      <td>${escapeHtml(member.rawTaluk)}</td>
      <td><select data-correction-district="${member.id}" ${isTalukScoped ? "disabled" : ""}><option value="">Select</option>${optionList(lists.districts, district)}</select></td>
      <td><select data-correction-taluk="${member.id}" ${isTalukScoped ? "disabled" : ""}><option value="">Select</option>${optionList(taluks, taluk)}</select></td>
      <td><button class="primary" data-save-correction="${member.id}">Save</button></td>
    </tr>
  `;
}

boot();
