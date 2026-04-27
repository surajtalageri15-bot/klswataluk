let lists = { districts: [], taluksByDistrict: {} };
let scopedJoin = null;

const form = document.querySelector("#talukTeamJoinForm");
const districtSelect = document.querySelector("#district");
const talukSelect = document.querySelector("#taluk");
const message = document.querySelector("#joinMessage");

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
  const params = new URLSearchParams(window.location.search);
  const configParams = new URLSearchParams();
  if (params.get("district")) configParams.set("district", params.get("district"));
  if (params.get("taluk")) configParams.set("taluk", params.get("taluk"));
  const data = await request(`/api/public-config?${configParams.toString()}`);
  lists = data.lists;
  scopedJoin = data.scope;

  districtSelect.innerHTML = `<option value="">Select district</option>${options(lists.districts)}`;
  if (scopedJoin) {
    districtSelect.value = scopedJoin.district;
    talukSelect.innerHTML = `<option value="">Select taluk</option>${options(lists.taluksByDistrict[scopedJoin.district] || [])}`;
    talukSelect.value = scopedJoin.taluk;
    districtSelect.disabled = true;
    talukSelect.disabled = true;
    form.insertAdjacentHTML("afterbegin", `<input type="hidden" name="district" value="${escapeHtml(scopedJoin.district)}"><input type="hidden" name="taluk" value="${escapeHtml(scopedJoin.taluk)}">`);
  }
}

districtSelect.addEventListener("change", () => {
  if (scopedJoin) return;
  talukSelect.innerHTML = `<option value="">Select taluk</option>${options(lists.taluksByDistrict[districtSelect.value] || [])}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.classList.remove("success");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  try {
    await request("/api/public-taluk-team-request", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    if (scopedJoin) {
      districtSelect.value = scopedJoin.district;
      talukSelect.value = scopedJoin.taluk;
    } else {
      talukSelect.innerHTML = `<option value="">Select district first</option>`;
    }
    message.textContent = "Request submitted. Admin will review and activate your login.";
    message.classList.add("success");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit request";
  }
});

boot().catch((error) => {
  message.textContent = error.message;
});
