const form = document.querySelector("#statusCheckForm");
const message = document.querySelector("#statusMessage");
const result = document.querySelector("#statusResult");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function request(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not check status. Please try again.");
  return data;
}

function statusText(status) {
  return {
    "Pending verification": "Pending verification - Team will review your application.",
    "Pending Taluk Review": "Pending Taluk Review - Taluk Technical Team will review your application.",
    "Pending District Review": "Pending District Review - District Technical Head approval is pending.",
    "Pending Division Final Approval": "Pending Division Final Approval - Division Technical Head final approval is pending.",
    Active: "Approved - Your membership record is active.",
    Rejected: "Rejected - Please contact the association office.",
    "Needs correction": "Needs correction - Please contact your taluk team.",
    Inactive: "Inactive - Please contact admin."
  }[status] || status || "Status not available";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  result.innerHTML = "";
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Checking...";
  try {
    const query = String(new FormData(form).get("query") || "").trim();
    if (!query) throw new Error("Enter phone number or LS number");
    const data = await request(`/api/public-status?query=${encodeURIComponent(query)}`);
    const member = data.member;
    result.innerHTML = `
      <section class="status-card">
        <div class="section-head">
          <h2>${escapeHtml(member.name)}</h2>
          <span class="badge">${escapeHtml(member.status)}</span>
        </div>
        <div class="status-grid">
          <div><span class="muted">Status</span><strong>${escapeHtml(statusText(member.status))}</strong></div>
          <div><span class="muted">LS Number</span><strong>${escapeHtml(member.lsNumber)}</strong></div>
          <div><span class="muted">District</span><strong>${escapeHtml(member.district)}</strong></div>
          <div><span class="muted">Taluk</span><strong>${escapeHtml(member.taluk)}</strong></div>
        </div>
        ${member.remarks ? `<p class="notice">${escapeHtml(member.remarks)}</p>` : ""}
        ${!["Rejected", "Inactive"].includes(member.status) ? `
          <div class="modal-actions">
            <a class="primary" href="/member-login.html">Activate / open member login</a>
          </div>
        ` : `<p class="muted">Member login is not available for this status. Please contact KLSWA admin.</p>`}
      </section>
    `;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Check status";
  }
});
