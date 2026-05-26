const teamContacts = document.querySelector("#teamContacts");
const teamSearch = document.querySelector("#teamSearch");
const teamCount = document.querySelector("#teamCount");
const teamMessage = document.querySelector("#teamMessage");

let contacts = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function phoneLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${encodeURIComponent(number)}`;
}

function renderContacts() {
  const search = teamSearch.value.trim().toLowerCase();
  const filtered = contacts.filter((contact) => [
    contact.name,
    contact.district,
    contact.taluk,
    contact.phoneNumber
  ].some((value) => String(value || "").toLowerCase().includes(search)));
  teamCount.textContent = `${filtered.length} Teams`;
  teamContacts.innerHTML = filtered.map((contact) => `
    <article class="public-team-item">
      <span class="badge">${escapeHtml(contact.district || "District")}</span>
      <h2>${escapeHtml(contact.taluk || "-")}</h2>
      <div class="mini-list">
        <span><strong>Technical Team:</strong> ${escapeHtml(contact.name || "-")}</span>
        <span><strong>Phone:</strong> ${escapeHtml(contact.phoneNumber || "Not available")}</span>
      </div>
      <div class="actions">
        ${contact.phoneNumber ? `<a class="primary" href="tel:${escapeHtml(contact.phoneNumber)}">Call</a>` : ""}
        ${contact.phoneNumber ? `<a class="secondary" href="${phoneLink(contact.phoneNumber)}" target="_blank">WhatsApp</a>` : ""}
      </div>
    </article>
  `).join("") || `<p class="muted">No taluk team contact found.</p>`;
}

async function loadContacts() {
  try {
    const response = await fetch("/api/public-taluk-team-contacts");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load team contacts");
    contacts = data.contacts || [];
    renderContacts();
  } catch (error) {
    teamMessage.textContent = error.message;
    teamCount.textContent = "Unavailable";
  }
}

teamSearch.addEventListener("input", renderContacts);
loadContacts();
