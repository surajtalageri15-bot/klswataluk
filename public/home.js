const summary = document.querySelector("#homeSummary");
const updated = document.querySelector("#summaryUpdated");

function number(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

async function loadSummary() {
  try {
    const response = await fetch("/api/public-summary");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load summary");
    summary.innerHTML = `
      <div><span class="muted">Members</span><strong>${number(data.total)}</strong></div>
      <div><span class="muted">Districts</span><strong>${number(data.districts)}</strong></div>
      <div><span class="muted">Taluks</span><strong>${number(data.taluks)} / ${number(data.masterTaluks)}</strong></div>
      <div><span class="muted">Pending</span><strong>${number(data.pending)}</strong></div>
    `;
    updated.textContent = `Last updated: ${dateText(data.updatedAt) || "Recently"}`;
  } catch (error) {
    updated.textContent = "Live summary is temporarily unavailable.";
  }
}

loadSummary();
