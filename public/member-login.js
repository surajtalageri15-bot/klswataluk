const activateForm = document.querySelector("#activateMemberForm");
const loginForm = document.querySelector("#memberLoginForm");
const forgotForm = document.querySelector("#forgotPasswordForm");
const activateMessage = document.querySelector("#activateMessage");
const loginMessage = document.querySelector("#loginMessage");
const forgotMessage = document.querySelector("#forgotMessage");
const dashboard = document.querySelector("#memberDashboard");
const memberFormsGrid = document.querySelector(".public-member-grid");

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

function setMemberDashboardMode(isLoggedIn) {
  memberFormsGrid.classList.toggle("hidden", Boolean(isLoggedIn));
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

const missingMemberFields = {
  phoneNumber: "Phone",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  maritalStatus: "Marital Status",
  kalyanaKarnataka: "Kalyana Karnataka",
  category: "Category",
  caste: "Caste",
  religion: "Religion",
  disability: "Disability",
  loginId: "Mojini Login ID",
  batchYear: "Batch Year",
  qualification: "Education",
  address: "Address"
};

function missingFieldKeys(member) {
  return Object.keys(missingMemberFields).filter((field) => !String(member[field] ?? "").trim());
}

function missingInput(field, member) {
  const value = escapeHtml(member[field] || "");
  if (field === "address") {
    return `<label>${missingMemberFields[field]} * <textarea name="${field}" rows="3" required>${value}</textarea></label>`;
  }
  if (field === "gender") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>`;
  }
  if (field === "maritalStatus") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Married</option><option>Unmarried</option><option>Widowed</option></select></label>`;
  }
  if (field === "kalyanaKarnataka") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Yes</option><option>No</option></select></label>`;
  }
  if (field === "category") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>GM</option><option>SC</option><option>ST</option><option>Cat-1</option><option>2A</option><option>2B</option><option>3A</option><option>3B</option></select></label>`;
  }
  if (field === "disability") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>None</option><option>Yes</option></select></label>`;
  }
  const type = field === "dateOfBirth" ? "date" : ["batchYear"].includes(field) ? "number" : "text";
  return `<label>${missingMemberFields[field]} * <input name="${field}" type="${type}" value="${value}" required></label>`;
}

function missingDataForm(member) {
  const fields = missingFieldKeys(member);
  if (!fields.length) return "";
  return `
    <form id="memberMissingDataForm" class="box public-form-card member-dashboard-card correction-card">
      <div class="section-head">
        <div>
          <h2>Fill Missing Data</h2>
          <p class="muted">Submit blank fields for admin/division approval. Approved changes will update your member record.</p>
        </div>
        <span class="badge">${fields.length} Missing</span>
      </div>
      <p class="notice">Missing: ${escapeHtml(fields.map((field) => missingMemberFields[field]).join(", "))}</p>
      <div class="two">
        ${fields.map((field) => missingInput(field, member)).join("")}
      </div>
      <div class="message" id="missingDataMessage"></div>
      <button class="primary" type="submit">Submit missing data</button>
    </form>
  `;
}

function correctionForm(member) {
  if (member.status !== "Needs correction") return "";
  return `
    <form id="memberCorrectionForm" class="box public-form-card member-dashboard-card correction-card">
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
    <form id="changePasswordForm" class="box public-form-card member-dashboard-card password-card">
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

function memberProblemForm() {
  return `
    <form id="memberProblemForm" class="box public-form-card member-dashboard-card problem-card">
      <div class="section-head">
        <div>
          <h2>Submit Problem to Leadership</h2>
          <p class="muted">Your issue will be visible to the association leadership body for review.</p>
        </div>
      </div>
      <div class="two">
        <label>Category
          <select name="category">
            <option>Service issue</option>
            <option>Department issue</option>
            <option>Payment / fee issue</option>
            <option>Member data issue</option>
            <option>Other</option>
          </select>
        </label>
        <label>Subject * <input name="subject" required maxlength="160" placeholder="Short problem title"></label>
      </div>
      <label>Problem details * <textarea name="description" rows="5" required placeholder="Explain the issue clearly"></textarea></label>
      <div class="message" id="memberProblemMessage"></div>
      <button class="primary" type="submit">Submit problem</button>
    </form>
  `;
}

function renderMyProblems(problems = []) {
  return `
    <section class="box public-form-card member-dashboard-card problem-list-card">
      <div class="section-head">
        <h2>My submitted problems</h2>
        <span class="badge">${problems.length} Total</span>
      </div>
      <div class="timeline">
        ${problems.map((problem) => `
          <div class="timeline-item">
            <span class="badge">${escapeHtml(problem.status)}</span>
            <span class="muted">${escapeHtml(problem.category)} / ${escapeHtml(new Date(problem.createdAt).toLocaleString())}</span>
            <strong>${escapeHtml(problem.subject)}</strong>
            <p>${escapeHtml(problem.description).replace(/\n/g, "<br>")}</p>
            ${problem.response ? `<p class="notice">${escapeHtml(problem.response)}</p>` : ""}
          </div>
        `).join("") || `<p class="muted">No problems submitted yet.</p>`}
      </div>
    </section>
  `;
}

function memberSupportMessage(member, talukTeam) {
  return [
    `Dear ${talukTeam?.name || "Taluk Technical Team"},`,
    "",
    "I need support for my KLSWA member record.",
    `Name: ${member.name || "-"}`,
    `LS Number: ${member.lsNumber || "-"}`,
    `District: ${member.district || "-"}`,
    `Taluk: ${member.taluk || "-"}`,
    `Current Status: ${member.status || "-"}`,
    "",
    "Please guide me."
  ].join("\n");
}

function whatsappLink(phoneNumber, text) {
  const phone = String(phoneNumber || "").replace(/\D/g, "");
  if (!phone) return "";
  return `https://wa.me/91${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;
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

function renderTalukTeamContact(member, talukTeam) {
  const message = memberSupportMessage(member, talukTeam);
  const whatsapp = whatsappLink(talukTeam?.phoneNumber, message);
  return `
    <section class="box public-form-card member-dashboard-card contact-team-card">
      <div class="section-head">
        <div>
          <h2>Contact Taluk Team</h2>
          <p class="muted">Use this for member record support, correction help, or login help.</p>
        </div>
        <span class="badge">${escapeHtml(member.taluk || "Taluk")}</span>
      </div>
      ${talukTeam ? `
        <div class="status-grid">
          <div><span class="muted">Team Name</span><strong>${escapeHtml(talukTeam.name || "-")}</strong></div>
          <div><span class="muted">User ID</span><strong>${escapeHtml(talukTeam.username || "-")}</strong></div>
          <div><span class="muted">District</span><strong>${escapeHtml(talukTeam.district || member.district || "-")}</strong></div>
          <div><span class="muted">Phone</span><strong>${escapeHtml(talukTeam.phoneNumber || "Not available")}</strong></div>
        </div>
      ` : `
        <p class="notice">Taluk technical team login is not active yet for this taluk. Please contact district/state admin.</p>
      `}
      <label>Support message
        <textarea id="talukSupportMessage" rows="8" readonly>${escapeHtml(message)}</textarea>
      </label>
      <div class="actions">
        <button class="secondary" type="button" id="copyTalukSupport">Copy message</button>
        ${whatsapp ? `<a class="primary" href="${whatsapp}" target="_blank">Open WhatsApp</a>` : ""}
      </div>
      <div class="message success" id="talukSupportStatus"></div>
    </section>
  `;
}

function renderPresidentMessages(messages = []) {
  if (!messages.length) return "";
  return `
    <section class="box public-form-card member-dashboard-card notice-card">
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

function renderDashboard(member, auditLogs = [], presidentMessages = [], talukTeam = null, problems = []) {
  setMemberDashboardMode(true);
  dashboard.innerHTML = `
    ${renderPresidentMessages(presidentMessages)}
    <section class="box status-card member-profile-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Member Dashboard</p>
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
    ${renderTalukTeamContact(member, talukTeam)}
    ${memberProblemForm()}
    ${renderMyProblems(problems)}
    ${changePasswordForm()}
    ${missingDataForm(member)}
    ${correctionForm(member)}
    <section class="box public-form-card member-dashboard-card audit-card">
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
    setMemberDashboardMode(false);
  });

  document.querySelector("#copyTalukSupport").addEventListener("click", async () => {
    await copyText(document.querySelector("#talukSupportMessage").value);
    const status = document.querySelector("#talukSupportStatus");
    status.textContent = "Support message copied. Paste it in WhatsApp/SMS.";
    setTimeout(() => { status.textContent = ""; }, 1800);
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

  const missingData = document.querySelector("#memberMissingDataForm");
  if (missingData) {
    missingData.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const changes = {};
      for (const field of missingFieldKeys(member)) changes[field] = form.get(field);
      try {
        await request("/api/member-correction-request", {
          method: "POST",
          body: JSON.stringify({
            reason: "Member filled missing profile data",
            changes
          })
        });
        document.querySelector("#missingDataMessage").textContent = "Missing data sent for admin approval.";
      } catch (error) {
        document.querySelector("#missingDataMessage").textContent = error.message;
      }
    });
  }

  const problemForm = document.querySelector("#memberProblemForm");
  problemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#memberProblemMessage");
    message.textContent = "";
    try {
      await request("/api/member-problems", {
        method: "POST",
        body: JSON.stringify(formObject(problemForm))
      });
      problemForm.reset();
      message.textContent = "Problem submitted to leadership.";
      const session = await request("/api/member-me");
      renderDashboard(session.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || []);
    } catch (error) {
      message.textContent = error.message;
    }
  });

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
    renderDashboard(data.member, data.auditLogs || [], data.presidentMessages || [], data.talukTeam || null, data.problems || []);
  } catch {
    dashboard.innerHTML = "";
    setMemberDashboardMode(false);
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
    renderDashboard(session.member || data.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || []);
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
