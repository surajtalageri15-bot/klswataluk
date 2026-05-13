const form = document.querySelector("#strikeSuggestionForm");
const districtSelect = document.querySelector("#district");
const batchYearSelect = document.querySelector("#batchYear");
const message = document.querySelector("#suggestionMessage");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function options(items) {
  return items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
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

function suggestionPayload() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    batchYear: String(data.get("batchYear") || "").trim(),
    district: String(data.get("district") || "").trim(),
    suggestion: String(data.get("suggestion") || "").trim()
  };
}

async function boot() {
  const data = await request("/api/public-config");
  districtSelect.innerHTML = `<option value="">Select district</option>${options(data.lists.districts || [])}`;
  const years = [];
  for (let year = 2026; year >= 1998; year -= 1) years.push(String(year));
  batchYearSelect.innerHTML = `<option value="">Select batch</option>${options(years)}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.classList.remove("success");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  try {
    await request("/api/public-strike-suggestion", {
      method: "POST",
      body: JSON.stringify(suggestionPayload())
    });
    form.reset();
    message.textContent = "Suggestion submitted successfully.";
    message.classList.add("success");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit suggestion";
  }
});

boot().catch((error) => {
  message.textContent = error.message;
});
