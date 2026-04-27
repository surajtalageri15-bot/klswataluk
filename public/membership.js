let lists = { districts: [], taluksByDistrict: {} };

const form = document.querySelector("#publicMembershipForm");
const districtSelect = document.querySelector("#district");
const talukSelect = document.querySelector("#taluk");
const batchYearSelect = document.querySelector("#batchYear");
const dateOfBirthInput = document.querySelector("#dateOfBirth");
const ageInput = document.querySelector("#age");
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
  const years = [];
  for (let year = 2026; year >= 1998; year -= 1) years.push(String(year));
  batchYearSelect.innerHTML = `<option value="">— ಬ್ಯಾಚ್ ಆಯ್ಕೆ ಮಾಡಿ —</option>${options(years)}`;
}

dateOfBirthInput.addEventListener("change", () => {
  if (!dateOfBirthInput.value) {
    ageInput.value = "";
    return;
  }
  const dob = new Date(dateOfBirthInput.value);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  ageInput.value = Number.isFinite(age) && age > 0 ? age : "";
});

districtSelect.addEventListener("change", () => {
  const taluks = lists.taluksByDistrict[districtSelect.value] || [];
  talukSelect.innerHTML = `<option value="">— ತಾಲ್ಲೂಕು ಆಯ್ಕೆ ಮಾಡಿ —</option>${options(taluks)}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.classList.remove("success");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  try {
    await request("/api/public-membership", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    talukSelect.innerHTML = `<option value="">— ಮೊದಲು ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ —</option>`;
    message.textContent = "Membership submitted for verification.";
    message.classList.add("success");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "ಮಾಹಿತಿ ಸಲ್ಲಿಸಿ - Submit details";
  }
});

boot().catch((error) => {
  message.textContent = error.message;
});
