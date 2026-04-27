let lists = { districts: [], taluksByDistrict: {} };

const form = document.querySelector("#publicMembershipForm");
const districtSelect = document.querySelector("#district");
const talukSelect = document.querySelector("#taluk");
const message = document.querySelector("#formMessage");

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

async function boot() {
  const data = await request("/api/public-config");
  lists = data.lists;
  districtSelect.innerHTML = `<option value="">Select</option>${options(lists.districts)}`;
}

districtSelect.addEventListener("change", () => {
  const taluks = lists.taluksByDistrict[districtSelect.value] || [];
  talukSelect.innerHTML = `<option value="">Select</option>${options(taluks)}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.classList.remove("success");
  try {
    await request("/api/public-membership", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    talukSelect.innerHTML = `<option value="">Select district first</option>`;
    message.textContent = "Membership submitted for verification.";
    message.classList.add("success");
  } catch (error) {
    message.textContent = error.message;
  }
});

boot().catch((error) => {
  message.textContent = error.message;
});
