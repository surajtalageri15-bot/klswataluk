function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function loadUsefulLinks() {
  const grid = document.querySelector("#usefulLinksGrid");
  if (!grid) return;
  try {
    const response = await fetch("/api/useful-links");
    const data = await response.json();
    const links = data.links || [];
    grid.innerHTML = links.map((link) => `
      <a class="public-link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
        <span class="badge">${escapeHtml(link.category || "Link")}</span>
        <strong>${escapeHtml(link.title)}</strong>
        <p>${escapeHtml(link.description || link.url)}</p>
      </a>
    `).join("") || `<p class="muted">No useful links published yet.</p>`;
  } catch {
    grid.innerHTML = `<p class="muted">Could not load useful links.</p>`;
  }
}

loadUsefulLinks();
