const teamContacts = document.querySelector("#teamContacts");
const teamSearch = document.querySelector("#teamSearch");
const districtFilter = document.querySelector("#districtFilter");
const districtMenu = document.querySelector("#districtMenu");
const teamCount = document.querySelector("#teamCount");
const teamMessage = document.querySelector("#teamMessage");

let contacts = [];
let selectedDistrict = "";

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

function districts() {
  return [...new Set(contacts.map((contact) => contact.district).filter(Boolean))].sort();
}

function renderDistrictMenu() {
  const items = districts();
  districtFilter.innerHTML = `<option value="">All districts</option>${items.map((district) => `
    <option value="${escapeHtml(district)}" ${district === selectedDistrict ? "selected" : ""}>${escapeHtml(district)}</option>
  `).join("")}`;
  districtMenu.innerHTML = `
    <button type="button" class="${selectedDistrict ? "" : "active"}" data-district="">All</button>
    ${items.map((district) => `<button type="button" class="${district === selectedDistrict ? "active" : ""}" data-district="${escapeHtml(district)}">${escapeHtml(district)}</button>`).join("")}
  `;
  districtMenu.querySelectorAll("[data-district]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDistrict = button.dataset.district || "";
      districtFilter.value = selectedDistrict;
      renderContacts();
    });
  });
}

function filteredContacts() {
  const search = teamSearch.value.trim().toLowerCase();
  return contacts.filter((contact) => (!selectedDistrict || contact.district === selectedDistrict) && [
    contact.name,
    contact.district,
    contact.taluk,
    contact.phoneNumber
  ].some((value) => String(value || "").toLowerCase().includes(search)));
}

function groupByDistrict(rows) {
  return rows.reduce((map, contact) => {
    const district = contact.district || "Not assigned";
    map.set(district, [...(map.get(district) || []), contact]);
    return map;
  }, new Map());
}

function renderContacts() {
  renderDistrictMenu();
  const filtered = filteredContacts();
  teamCount.textContent = `${filtered.length} Teams`;
  const groups = [...groupByDistrict(filtered).entries()];
  teamContacts.innerHTML = groups.map(([district, rows]) => `
    <section class="public-team-district">
      <div class="section-head compact">
        <h2>${escapeHtml(district)}</h2>
        <span class="badge">${rows.length} Teams</span>
      </div>
      <div class="public-team-district-grid">
        ${rows.map((contact) => `
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
        `).join("")}
      </div>
    </section>
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
districtFilter.addEventListener("change", () => {
  selectedDistrict = districtFilter.value;
  renderContacts();
});
loadContacts();
