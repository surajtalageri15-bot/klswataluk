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
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function statusText(status) {
  return {
    "Pending verification": "Pending verification - Admin/Taluk team will review your application.",
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
    const query = new FormData(form).get("query");
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
      </section>
    `;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Check status";
  }
});
