const activateForm = document.querySelector("#activateMemberForm");
const loginForm = document.querySelector("#memberLoginForm");
const forgotForm = document.querySelector("#forgotPasswordForm");
const activateMessage = document.querySelector("#activateMessage");
const loginMessage = document.querySelector("#loginMessage");
const forgotMessage = document.querySelector("#forgotMessage");
const dashboard = document.querySelector("#memberDashboard");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form));
}

function statusText(status) {
  return {
    "Pending verification": "Pending verification - Admin/Taluk team will review your application.",
    Active: "Approved - Your membership record is active.",
    Rejected: "Rejected - Please contact the association office.",
    "Needs correction": "Needs correction - update the requested details below.",
    Inactive: "Inactive - Please contact admin."
  }[status] || status || "Status not available";
}

function memberRows(member) {
  return [
    ["Name", member.name],
    ["Phone", member.phoneNumber],
    ["LS Number", member.lsNumber],
    ["Mojini Login ID", member.loginId],
    ["District", member.district],
    ["Taluk", member.taluk],
    ["Gender", member.gender],
    ["Date of Birth", member.dateOfBirth],
    ["Age", member.age],
    ["Category", member.category],
    ["Caste", member.caste],
    ["Religion", member.religion],
    ["Education", member.qualification],
    ["Batch Year", member.batchYear],
    ["Address", member.address]
  ].map(([label, value]) => `
    <div>
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
}

function correctionForm(member) {
  if (member.status !== "Needs correction") return "";
  return `
    <form id="memberCorrectionForm" class="box public-form-card">
      <h2>Submit correction request</h2>
      <p class="notice">${escapeHtml(member.remarks || "Please update the required details and submit for admin review.")}</p>
      <div class="two">
        <label>Phone <input name="phoneNumber" value="${escapeHtml(member.phoneNumber)}"></label>
        <label>Login ID <input name="loginId" value="${escapeHtml(member.loginId)}"></label>
      </div>
      <div class="two">
        <label>Education <input name="qualification" value="${escapeHtml(member.qualification)}"></label>
        <label>Batch Year <input name="batchYear" type="number" value="${escapeHtml(member.batchYear)}"></label>
      </div>
      <div class="two">
        <label>Category <input name="category" value="${escapeHtml(member.category)}"></label>
        <label>Caste <input name="caste" value="${escapeHtml(member.caste)}"></label>
      </div>
      <label>Address <textarea name="address" rows="3">${escapeHtml(member.address)}</textarea></label>
      <label>Reason * <textarea name="reason" rows="3" required placeholder="Explain what you corrected"></textarea></label>
      <div class="message" id="correctionMessage"></div>
      <button class="primary" type="submit">Send correction request</button>
    </form>
  `;
}

function changePasswordForm() {
  return `
    <form id="changePasswordForm" class="box public-form-card">
      <h2>Change password</h2>
      <div class="three">
        <label>Current Password <input name="currentPassword" type="password" required></label>
        <label>New Password <input name="password" type="password" required minlength="6"></label>
        <label>Confirm Password <input name="confirmPassword" type="password" required minlength="6"></label>
      </div>
      <div class="message" id="changePasswordMessage"></div>
      <button class="primary" type="submit">Change password</button>
    </form>
  `;
}

function renderPresidentMessages(messages = []) {
  if (!messages.length) return "";
  return `
    <section class="box public-form-card">
      <div class="section-head">
        <h2>State President Notices</h2>
        <span class="badge">${messages.length} Latest</span>
      </div>
      <div class="timeline">
        ${messages.map((message) => `
          <div class="timeline-item">
            <span class="muted">${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
            <strong>${escapeHtml(message.subject)}</strong>
            <p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDashboard(member, auditLogs = [], presidentMessages = []) {
  dashboard.innerHTML = `
    ${renderPresidentMessages(presidentMessages)}
    <section class="box status-card">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(member.name)}</h2>
          <p class="muted">${escapeHtml(member.district)} / ${escapeHtml(member.taluk)}</p>
        </div>
        <span class="badge">${escapeHtml(member.status)}</span>
      </div>
      <div class="status-grid">
        <div><span class="muted">Status</span><strong>${escapeHtml(statusText(member.status))}</strong></div>
        <div><span class="muted">Login Access</span><strong>${member.memberLoginActive ? "Activated" : "Not activated"}</strong></div>
      </div>
      ${member.remarks ? `<p class="notice">${escapeHtml(member.remarks)}</p>` : ""}
      <div class="detail-grid">${memberRows(member)}</div>
      <div class="modal-actions">
        <button class="secondary" id="memberLogout" type="button">Logout</button>
      </div>
    </section>
    ${changePasswordForm()}
    ${correctionForm(member)}
    <section class="box public-form-card">
      <h2>My audit timeline</h2>
      <div class="timeline">
        ${auditLogs.map((log) => `
          <div class="timeline-item">
            <span class="muted">${escapeHtml(new Date(log.createdAt).toLocaleString())}</span>
            <strong>${escapeHtml(log.action)} / ${escapeHtml(log.field)}</strong>
            <div class="timeline-diff">
              <span class="diff-old">${escapeHtml(log.oldValue || "-")}</span>
              <span class="diff-new">${escapeHtml(log.newValue || "-")}</span>
            </div>
          </div>
        `).join("") || `<p class="muted">No audit history available yet.</p>`}
      </div>
    </section>
  `;

  document.querySelector("#memberLogout").addEventListener("click", async () => {
    await request("/api/member-logout", { method: "POST" });
    dashboard.innerHTML = "";
  });

  const correction = document.querySelector("#memberCorrectionForm");
  if (correction) {
    correction.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const reason = String(form.get("reason") || "").trim();
      const changes = {};
      ["phoneNumber", "loginId", "qualification", "batchYear", "category", "caste", "address"].forEach((field) => {
        changes[field] = form.get(field);
      });
      try {
        await request("/api/member-correction-request", {
          method: "POST",
          body: JSON.stringify({ reason, changes })
        });
        document.querySelector("#correctionMessage").textContent = "Correction request sent to admin.";
      } catch (error) {
        document.querySelector("#correctionMessage").textContent = error.message;
      }
    });
  }

  const changePassword = document.querySelector("#changePasswordForm");
  changePassword.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#changePasswordMessage");
    message.textContent = "";
    try {
      await request("/api/member-change-password", {
        method: "POST",
        body: JSON.stringify(formObject(changePassword))
      });
      changePassword.reset();
      message.textContent = "Password changed successfully.";
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

async function loadMemberSession() {
  try {
    const data = await request("/api/member-me");
    renderDashboard(data.member, data.auditLogs || [], data.presidentMessages || []);
  } catch {
    dashboard.innerHTML = "";
  }
}

activateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  activateMessage.textContent = "";
  try {
    await request("/api/member-activate", {
      method: "POST",
      body: JSON.stringify(formObject(activateForm))
    });
    activateMessage.textContent = "Login activated. You can sign in now.";
    activateForm.reset();
  } catch (error) {
    activateMessage.textContent = error.message;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  try {
    const data = await request("/api/member-login", {
      method: "POST",
      body: JSON.stringify(formObject(loginForm))
    });
    loginForm.reset();
    const session = await request("/api/member-me");
    renderDashboard(session.member || data.member, session.auditLogs || [], session.presidentMessages || []);
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  forgotMessage.textContent = "";
  try {
    await request("/api/member-forgot-password", {
      method: "POST",
      body: JSON.stringify(formObject(forgotForm))
    });
    forgotForm.reset();
    forgotMessage.textContent = "Password reset. You can sign in now.";
  } catch (error) {
    forgotMessage.textContent = error.message;
  }
});

loadMemberSession();
