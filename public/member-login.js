const activateForm = document.querySelector("#activateMemberForm");
const loginForm = document.querySelector("#memberLoginForm");
const forgotForm = document.querySelector("#forgotPasswordForm");
const activateMessage = document.querySelector("#activateMessage");
const loginMessage = document.querySelector("#loginMessage");
const forgotMessage = document.querySelector("#forgotMessage");
const dashboard = document.querySelector("#memberDashboard");
const memberFormsGrid = document.querySelector(".public-member-grid");
const razorpayPaymentButtonId = "pl_Suq8LypT1hctYr";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
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

function formObject(form) {
  return Object.fromEntries(new FormData(form));
}

function batchYearOptions() {
  const end = Math.max(2026, new Date().getFullYear());
  return Array.from({ length: end - 1998 + 1 }, (_, index) => String(end - index));
}

function options(items, selected = "") {
  return items.map((item) => `<option value="${escapeHtml(item)}" ${String(item) === String(selected) ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
}

function rupees(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function calculateAgeFromDob(value) {
  if (!value) return "";
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return Number.isFinite(age) && age > 0 ? String(age) : "";
}

function bindAgeCalculation(root) {
  const dob = root.querySelector('input[name="dateOfBirth"]');
  const age = root.querySelector('input[name="age"]');
  if (!dob || !age) return;
  const update = () => {
    age.value = calculateAgeFromDob(dob.value);
  };
  dob.addEventListener("input", update);
  dob.addEventListener("change", update);
  update();
}

function bindMemberImageUpload({ inputId, messageId, endpoint, emptyMessage, sizeMessage }) {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return;
  input.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const message = document.querySelector(`#${messageId}`);
    message.textContent = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      message.textContent = emptyMessage;
      event.currentTarget.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      message.textContent = sizeMessage;
      event.currentTarget.value = "";
      return;
    }
    try {
      const imageData = await fileToDataUrl(file);
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ imageData })
      });
      const session = await request("/api/member-me");
      renderDashboard(session.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || [], session.correctionRequests || [], session.donations || []);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      event.currentTarget.value = "";
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setMemberDashboardMode(isLoggedIn) {
  memberFormsGrid.classList.toggle("hidden", Boolean(isLoggedIn));
}

function statusText(status) {
  return {
    "Pending verification": "Pending verification - Team will review your application.",
    "Pending Taluk Review": "Pending Taluk Review - Taluk Technical Team will review your application.",
    "Pending District Review": "Pending District Review - District Technical Head approval is pending.",
    "Pending Division Final Approval": "Pending Division Final Approval - Division Technical Head final approval is pending.",
    Active: "Approved - Your membership record is active.",
    Rejected: "Rejected - Please contact the association office.",
    "Needs correction": "Needs correction - update the requested details below.",
    Inactive: "Inactive - Please contact admin."
  }[status] || status || "Status not available";
}

function memberRows(member) {
  return [
    ["Name", member.name],
    ["Phone", member.phoneNumber],
    ["LS Number", member.lsNumber],
    ["Mojini Login ID", member.loginId],
    ["District", member.district],
    ["Taluk", member.taluk],
    ["Gender", member.gender],
    ["Date of Birth", member.dateOfBirth],
    ["Age", member.age],
    ["Category", member.category],
    ["Caste", member.caste],
    ["Religion", member.religion],
    ["Education", member.qualification],
    ["Batch Year", member.batchYear],
    ["Address", member.address]
  ].map(([label, value]) => `
    <div>
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
}

function applicationFields(member) {
  return [
    ["Full Name", member.name],
    ["Current Mobile Number", member.phoneNumber],
    ["Date of Birth", member.dateOfBirth],
    ["Age", member.age],
    ["Gender", member.gender],
    ["Marital Status", member.maritalStatus],
    ["Kalyana Karnataka", member.kalyanaKarnataka],
    ["Category", member.category],
    ["Caste", member.caste],
    ["Religion", member.religion],
    ["Disability", member.disability],
    ["License Number", member.lsNumber],
    ["Mojini Login ID", member.loginId],
    ["Batch Year", member.batchYear],
    ["Education", member.qualification],
    ["Work District", member.district],
    ["Taluk", member.taluk],
    ["Other Taluks", member.otherTaluks],
    ["Permanent Address", member.address],
    ["Application Status", member.status]
  ];
}

function approvedApplicationHtml(member) {
  const generatedAt = new Date().toLocaleString();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>KLSWA Approved Application - ${escapeHtml(member.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2a24; }
    .header { border-bottom: 3px solid #116047; padding-bottom: 14px; margin-bottom: 18px; }
    h1 { margin: 0 0 6px; color: #116047; font-size: 24px; }
    h2 { margin: 22px 0 10px; color: #116047; font-size: 18px; }
    .muted { color: #607064; }
    .status { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #e8f3ec; color: #116047; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    td { border: 1px solid #d9e2dc; padding: 10px; vertical-align: top; }
    td:first-child { width: 32%; font-weight: 700; background: #f6faf7; }
    .declaration { border: 1px solid #d9e2dc; background: #f8fbf7; padding: 14px; margin-top: 12px; line-height: 1.55; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 42px; }
    .line { border-top: 1px solid #809088; padding-top: 8px; }
    @page { size: A4; margin: 16mm; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>AKSPBS / KLSWA Approved Membership Application</h1>
    <div class="muted">All Karnataka State Government Licensed Surveyors Union</div>
    <p><span class="status">${escapeHtml(member.status)}</span></p>
  </div>
  <h2>Member Details</h2>
  <table>
    ${applicationFields(member).map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value || "-")}</td></tr>`).join("")}
  </table>
  <h2>Declaration</h2>
  <div class="declaration">
    I declare that all information provided in this application is true and correct to the best of my knowledge.
    I shall be fully responsible for any action taken by the organization if any information is found to be incorrect or concealed.
    <br><br>
    Declaration accepted: ${member.declarationAccepted ? "Yes" : "No"}
  </div>
  <div class="sign">
    <div class="line">Member Signature</div>
    <div class="line">Authorized Verification</div>
  </div>
  <p class="muted">Generated on ${escapeHtml(generatedAt)} from member login.</p>
</body>
</html>`;
}

function downloadApprovedApplication(member) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download the PDF application.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(approvedApplicationHtml(member));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

function dayaMaranaPetitionHtml(member) {
  const applicationDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rows = [
    ["ಸದಸ್ಯರ ಹೆಸರು", member.name],
    ["LS ಸಂಖ್ಯೆ", member.lsNumber],
    ["ಮೊಬೈಲ್ ಸಂಖ್ಯೆ", member.phoneNumber],
    ["ಜಿಲ್ಲೆ", member.district],
    ["ತಾಲ್ಲೂಕು", member.taluk],
    ["ಮೊಜಿನಿ Login ID", member.loginId],
    ["Batch Year", member.batchYear],
    ["ವಿಳಾಸ", member.address]
  ];
  const points = [
    ["ರಾಜ್ಯಾದ್ಯಂತ ಬಾಕಿ ಅರ್ಜಿಗಳು", "5,65,391 ಕಡತಗಳು (~6 ಲಕ್ಷ)"],
    ["ಕ್ಷೇತ್ರ LS ಸಂಖ್ಯೆ", "4,300"],
    ["ಪ್ರತಿ LS - ಮಾಸಿಕ ಕಡತಗಳು", "23 (15 ಯಶಸ್ವಿ + 6 ಅಯಶಸ್ವಿ + 2 ತಕರಾರು)"],
    ["ಅರ್ಜಿದಾರ ಶುಲ್ಕ (ಪ್ರತಿ ಕಡತ)", "₹1,600 - ಸರ್ಕಾರಕ್ಕೆ ಪೂರ್ತಿ"],
    ["LS ಗೆ ಯಶಸ್ವಿ ಕಡತಕ್ಕೆ ಸಿಗುವ ಮೊತ್ತ", "₹1,200 ಮಾತ್ರ"],
    ["ತಕರಾರು ಕಡತಕ್ಕೆ LS ಗೆ ಸಂಭಾವನೆ", "ಶೂನ್ಯ (₹0) - ಕೆಲಸ ಉಚಿತ"],
    ["LS ಮಾಸಿಕ ಒಟ್ಟು ಆದಾಯ", "₹20,160"],
    ["LS ನಿವ್ವಳ ಕೈಗೆ ಬರುವ ಮೊತ್ತ", "₹10,000 - ₹12,000"],
    ["ಸರ್ಕಾರದ ವಾರ್ಷಿಕ ನಿವ್ವಳ ಲಾಭ", "₹85.86 ಕೋಟಿ"]
  ];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>KLSWA Daya Marana Petition - ${escapeHtml(member.name)}</title>
  <style>
    body { font-family: Nirmala UI, Arial, sans-serif; margin: 28px; color: #17251d; line-height: 1.55; }
    .letter { max-width: 820px; margin: 0 auto; }
    .head { text-align: center; border-bottom: 3px solid #116047; padding-bottom: 12px; margin-bottom: 18px; }
    .head h1 { margin: 0 0 6px; color: #116047; font-size: 22px; }
    .head h2 { margin: 0; color: #27372e; font-size: 14px; letter-spacing: 0.3px; }
    .address { font-size: 12px; color: #5d6b62; margin-top: 8px; }
    .title { text-align: center; margin: 18px 0; padding: 14px; border: 1px solid #d9e2dc; background: #f7fbf7; }
    .title h3 { margin: 0; color: #9a2222; font-size: 24px; }
    .title p { margin: 6px 0 0; font-weight: 700; }
    .meta { display: flex; justify-content: space-between; gap: 16px; margin: 14px 0; font-weight: 700; }
    .recipient-lines { min-width: 360px; }
    .blank-line { display: block; width: 100%; border-bottom: 1px dotted #7c8c82; height: 22px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
    th, td { border: 1px solid #d9e2dc; padding: 8px 10px; vertical-align: top; }
    th { background: #eaf3ed; color: #116047; text-align: left; }
    .section-title { color: #116047; font-size: 18px; margin: 18px 0 8px; }
    .quote { border-left: 4px solid #b48018; background: #fff8e6; padding: 12px; font-weight: 700; }
    .member-box { background: #f6faf7; border: 1px solid #d9e2dc; padding: 12px; margin: 18px 0; }
    .sign { display: grid; grid-template-columns: minmax(240px, 360px); gap: 24px; margin-top: 34px; }
    .line { border-top: 1px solid #7c8c82; padding-top: 8px; min-height: 48px; }
    .muted { color: #607064; font-size: 12px; }
    p { margin: 9px 0; }
    @page { size: A4; margin: 15mm; }
    @media print { body { margin: 0; } .letter { max-width: none; } }
  </style>
</head>
<body>
  <main class="letter">
    <div class="head">
      <h1>ಅಖಿಲ ಕರ್ನಾಟಕ ಸರ್ಕಾರಿ ಪರವಾನಗಿ ಭೂಮಾಪಕರ ಸಂಘ (ರಿ.), ಬೆಂಗಳೂರು</h1>
      <h2>AKHILA KARNATAKA SARKARI PARAVANAGI BHOOMAPAKARA SANGHA (R.), BENGALURU</h2>
      <div class="address">357, 7ನೇ ಕ್ರಾಸ್, 3ನೇ ಮುಖ್ಯ, 6ನೇ ಹಂತ, W.O.C. ರಸ್ತೆ, ರಾಜಾಜಿನಗರ, ಬೆಂಗಳೂರು - 560 044 | Ph: 98800 92451 | Email: statelsassociation@gmail.com</div>
    </div>

    <div class="title">
      <h3>ದಯಾ ಮರಣ ಮನವಿ</h3>
      <p>- ನ್ಯಾಯ ಕೊಡಿ, ಇಲ್ಲದಿದ್ದರೆ ನಮ್ಮ ವೃತ್ತಿಗೆ ಗೌರವಯುತ ಅಂತ್ಯ ಕೊಡಿ -</p>
    </div>

    <div class="meta">
      <div class="recipient-lines">ಸ್ವೀಕರಿಸುವವರು / To,<br><span class="blank-line"></span><span class="blank-line"></span><span class="blank-line"></span><span class="blank-line"></span></div>
      <div>ಅರ್ಜಿ ದಿನಾಂಕ / Application Date:<br>${escapeHtml(applicationDate)}</div>
    </div>

    <p><strong>ಮಾನ್ಯರೇ,</strong></p>
    <p>ಕರ್ನಾಟಕದ 4,300 ಪರವಾನಗಿ ಭೂಮಾಪಕರು ಇಂದು ನಿಮ್ಮ ಮುಂದೆ ಒಂದು ಕಹಿ ಸತ್ಯ ಇಡುತ್ತಿದ್ದೇವೆ. ನಾವು ವರ್ಷಕ್ಕೆ ₹85 ಕೋಟಿ ಆದಾಯ ಸರ್ಕಾರದ ಬೊಕ್ಕಸಕ್ಕೆ ತಂದುಕೊಡುತ್ತೇವೆ. ಆದರೆ ನಮ್ಮ ನಿವ್ವಳ ಮಾಸಿಕ ಆದಾಯ ₹10,000 - ₹12,000 ಮಾತ್ರ - ಕರ್ನಾಟಕ ಕನಿಷ್ಠ ವೇತನ ಕಾಯಿದೆಯಡಿ ಅಕುಶಲ ದಿನಗೂಲಿ ಕಾರ್ಮಿಕರಿಗಿಂತಲೂ ಕಡಿಮೆ.</p>

    <h3 class="section-title">ಪ್ರಮುಖ ಅಂಕಿ-ಅಂಶಗಳು (ಮೊಜಿನಿ ವರದಿ, ದಿ. 08-05-2026)</h3>
    <table>
      <thead><tr><th>ವಿವರ</th><th>ಮೊತ್ತ / ಸಂಖ್ಯೆ</th></tr></thead>
      <tbody>${points.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
    </table>

    <h3 class="section-title">ಕ್ಷೇತ್ರ ವಾಸ್ತವತೆ - ₹20,160 ರ ನಿಜ ಅರ್ಥ</h3>
    <p>ಪ್ರತಿ ತಿಂಗಳು ₹20,160 ಸಂಪಾದಿಸುವ LS, ಅದೇ ಮೊತ್ತದಿಂದ ಹಳ್ಳಿಗಳಿಗೆ ಪೆಟ್ರೋಲ್, GPS / Total Station ಬಾಡಿಗೆ, ಸಹಾಯಕ ಕೂಲಿ, ನಕ್ಷೆ ಮುದ್ರಣ, ಮೊಬೈಲ್ ಡೇಟಾ, ಪರವಾನಗಿ ನವೀಕರಣ ಶುಲ್ಕ, ವಾಹನ ನಿರ್ವಹಣೆ - ಈ ಎಲ್ಲ ಖರ್ಚು ಭರಿಸಬೇಕಾಗುತ್ತದೆ. ಕೊನೆಗೆ ಕೈಗೆ ಬರುವ ಮೊತ್ತ ₹10,000 - ₹12,000 ಮಾತ್ರ.</p>
    <p>ಇದೇ ಕೆಲಸ ಮಾಡುವ ಸರ್ಕಾರಿ ಭೂಮಾಪಕರಿಗೆ ಮೂಲ ವೇತನ ₹37,500 - ₹76,100 + DA + HRA + GPF + ಪಿಂಚಣಿ + ಬಡ್ತಿ ಕ್ರಮ. ಅದೇ 19 ವಿಧದ ಕೆಲಸ - ಆದರೆ ನಮಗೆ ಅರ್ಧಕ್ಕರ್ಧ ಕೂಡ ಇಲ್ಲ.</p>

    <h3 class="section-title">ಸರ್ಕಾರವೇ ಒಪ್ಪಿಕೊಂಡ ಅಂಶಗಳು</h3>
    <p>ಸರ್ಕಾರದ ಸ್ವಂತ ಕಾನೂನು ಅಭಿಪ್ರಾಯ ಪತ್ರ: "Licensed surveyors have been rendering all services as that of II Grade surveyors."</p>
    <p>ಅದೇ ಪತ್ರ: "As a one time measure, they can be absorbed." - LS ಗಳ ನೇಮಕ ಕಾನೂನುಬಾಹಿರವಲ್ಲ; ಎಲ್ಲರೂ 240+ ದಿನ ಸೇವೆ ಸಲ್ಲಿಸಿದ್ದಾರೆ.</p>
    <p>ಭೂಕಂದಾಯ ಕಾಯಿದೆ ಸೆಕ್ಷನ್ 18-A: "Appointment of Licensed Surveyors" - ಗುತ್ತಿಗೆ ಅಲ್ಲ, ನೇಮಕ.</p>
    <p>ಮಾನ್ಯ ಉಚ್ಚ ನ್ಯಾಯಾಲಯ - 2013 (W.P. 51923-52207/2012) ಮತ್ತು 2023 (W.P. 18763/2022): ಎರಡು ಬಾಧ್ಯಕರ ಆದೇಶಗಳು - ಇಂದಿಗೂ ಜಾರಿಯಾಗಿಲ್ಲ.</p>

    <h3 class="section-title">ನಮ್ಮ ವಿನಮ್ರ ಬೇಡಿಕೆ</h3>
    <p><strong>ಆಯ್ಕೆ (ಎ): "ಒಂದು ಬಾರಿಯ ವಿಶೇಷ ಖಾಯಂಗೊಳಿಸುವಿಕೆ"</strong><br>ಪ್ರಸ್ತುತ ಕ್ಷೇತ್ರ ಕಾರ್ಯ ನಿರ್ವಹಿಸುತ್ತಿರುವ 4,300 (ಒಟ್ಟು 6,000+) ಪರವಾನಗಿ ಭೂಮಾಪಕರನ್ನು - ಭೂಮಾಪನ, ಕಂದಾಯ ವ್ಯವಸ್ಥೆ ಮತ್ತು ಭೂ-ದಾಖಲೆಗಳ ಇಲಾಖೆಯಲ್ಲಿ - KLR Rules 46-A ರಿಂದ 46-K ರ ತಿದ್ದುಪಡಿ ಮೂಲಕ ಸರ್ಕಾರಿ ಭೂಮಾಪಕರಾಗಿ ಖಾಯಂಗೊಳಿಸಬೇಕು.</p>
    <p><strong>ಆಯ್ಕೆ (ಬಿ): "ಸಮಾನ ಕೆಲಸಕ್ಕೆ ಸಮಾನ ವೇತನ"</strong><br>LS ಗಳು ಸರ್ಕಾರಿ ಭೂಮಾಪಕರ ಸಮಾನ ಶಾಸನಬದ್ಧ ಕರ್ತವ್ಯಗಳನ್ನು ನಿರ್ವಹಿಸುವವರೆಗೆ - ಮೂಲ ವೇತನ ₹23,500 - ₹47,650 + DA + HRA + ಆರೋಗ್ಯ ವಿಮೆ + ಜೀವ ವಿಮೆ + ರಜಾ ಸೌಲಭ್ಯ + ಗ್ರಾಚ್ಯುಟಿ + ನಿವೃತ್ತಿ ಭದ್ರತೆ ಒದಗಿಸಬೇಕು.</p>

    <div class="quote">ನ್ಯಾಯ ಕೊಡಿ - ಇಲ್ಲದಿದ್ದರೆ ನಮ್ಮ ವೃತ್ತಿಗೆ ದಯಾ ಮರಣ ಕೊಡಿ.</div>
    <p>ಒಂದು ವೇಳೆ ಈ ಎರಡೂ ಆಯ್ಕೆಗಳನ್ನು ಪರಿಗಣಿಸಲು ಸರ್ಕಾರ ಸಿದ್ಧವಿಲ್ಲ ಎಂದಾದರೆ - ದಯವಿಟ್ಟು ನಮ್ಮ ಪರವಾನಗಿ ರದ್ದು ಮಾಡಿ. ₹10,000 ಸಂಪಾದಿಸಲು ₹8,000 ಖರ್ಚು ಮಾಡಿ, ಸ್ವಾಭಿಮಾನವನ್ನು ಕಳೆದುಕೊಳ್ಳುವ ವ್ಯವಸ್ಥೆಯಲ್ಲಿ ಮುಂದುವರಿಯಲು ಸಾಧ್ಯವಿಲ್ಲ.</p>

    <div class="member-box">
      <h3 class="section-title">ಸದಸ್ಯರ ಸ್ವಯಂ-ತುಂಬಿದ ವಿವರಗಳು</h3>
      <table>
        <tbody>${rows.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value || "-")}</td></tr>`).join("")}</tbody>
      </table>
      <p>ಈ ಮನವಿಯ ವಿಷಯವನ್ನು ನಾನು ಓದಿ ಅರ್ಥ ಮಾಡಿಕೊಂಡಿದ್ದೇನೆ ಮತ್ತು ಸಂಘದ ನ್ಯಾಯಸಮ್ಮತ ಬೇಡಿಕೆಗೆ ಬೆಂಬಲ ಸೂಚಿಸುತ್ತೇನೆ.</p>
    </div>

    <div class="sign">
      <div class="line">ಸದಸ್ಯರ ಸಹಿ<br>${escapeHtml(member.name || "")}</div>
    </div>
  </main>
</body>
</html>`;
}

function downloadDayaMaranaPetition(member) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download the petition PDF.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(dayaMaranaPetitionHtml(member));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 450);
}

const missingMemberFields = {
  name: "Name",
  phoneNumber: "Phone",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  maritalStatus: "Marital Status",
  kalyanaKarnataka: "Kalyana Karnataka",
  category: "Category",
  caste: "Caste",
  religion: "Religion",
  disability: "Disability",
  lsNumber: "LS Number",
  loginId: "Mojini Login ID",
  batchYear: "Batch Year",
  qualification: "Education",
  district: "District",
  taluk: "Taluk",
  address: "Address"
};

function missingFieldKeys(member) {
  return Object.keys(missingMemberFields).filter((field) => !String(member[field] ?? "").trim());
}

function missingInput(field, member) {
  const value = escapeHtml(member[field] || "");
  if (field === "address") {
    return `<label>${missingMemberFields[field]} * <textarea name="${field}" rows="3" required>${value}</textarea></label>`;
  }
  if (field === "gender") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>`;
  }
  if (field === "maritalStatus") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Married</option><option>Unmarried</option><option>Widowed</option></select></label>`;
  }
  if (field === "kalyanaKarnataka") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>Yes</option><option>No</option></select></label>`;
  }
  if (field === "category") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>GM</option><option>SC</option><option>ST</option><option>Cat-1</option><option>2A</option><option>2B</option><option>3A</option><option>3B</option></select></label>`;
  }
  if (field === "disability") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select</option><option>None</option><option>Yes</option></select></label>`;
  }
  if (field === "batchYear") {
    return `<label>${missingMemberFields[field]} * <select name="${field}" required><option value="">Select batch</option>${options(batchYearOptions(), member[field] || "")}</select></label>`;
  }
  if (field === "age") {
    return `<label>${missingMemberFields[field]} * <input name="${field}" type="number" value="${escapeHtml(member.age || calculateAgeFromDob(member.dateOfBirth))}" readonly required></label>`;
  }
  const type = field === "dateOfBirth" ? "date" : "text";
  return `<label>${missingMemberFields[field]} * <input name="${field}" type="${type}" value="${value}" required></label>`;
}

function correctionRequestSummary(request) {
  const fields = Object.keys(request?.requestedChanges || {}).map((field) => missingMemberFields[field] || field);
  return fields.length ? fields.join(", ") : "Profile data";
}

function memberSelfDeclarationHtml() {
  return `
    <div class="declaration">
      I declare that the correction details submitted by me are true and correct to the best of my knowledge. I accept full responsibility for this request.
    </div>
    <label class="check-row">
      <input name="declarationAccepted" type="checkbox" required>
      I have read and agree to the self declaration for this correction request.
    </label>
  `;
}

function missingDataForm(member, correctionRequests = []) {
  const fields = missingFieldKeys(member);
  if (!fields.length) return "";
  const pending = correctionRequests.find((request) => request.status === "Pending");
  if (pending) {
    return `
      <section class="box public-form-card member-dashboard-card correction-card">
        <div class="section-head">
          <div>
            <h2>Missing Data Submitted</h2>
            <p class="muted">Waiting for admin/division approval. You can edit again after approval or rejection.</p>
          </div>
          <span class="badge">Pending approval</span>
        </div>
        <p class="notice">Submitted fields: ${escapeHtml(correctionRequestSummary(pending))}</p>
      </section>
    `;
  }
  const latestRejected = correctionRequests.find((request) => request.status === "Rejected");
  return `
    <form id="memberMissingDataForm" class="box public-form-card member-dashboard-card correction-card">
      <div class="section-head">
        <div>
          <h2>Fill Missing Data</h2>
          <p class="muted">Submit blank fields for admin/division approval. Approved changes will update your member record.</p>
        </div>
        <span class="badge">${fields.length} Missing</span>
      </div>
      ${latestRejected?.adminRemarks ? `<p class="notice">Previous request rejected: ${escapeHtml(latestRejected.adminRemarks)}</p>` : ""}
      <p class="notice">Missing: ${escapeHtml(fields.map((field) => missingMemberFields[field]).join(", "))}</p>
      <div class="two">
        ${fields.map((field) => missingInput(field, member)).join("")}
      </div>
      ${memberSelfDeclarationHtml()}
      <div class="message" id="missingDataMessage"></div>
      <button class="primary" type="submit">Submit missing data</button>
    </form>
  `;
}

function correctionForm(member, correctionRequests = []) {
  const pending = correctionRequests.find((request) => request.status === "Pending");
  if (pending) {
    return `
      <section class="box public-form-card member-dashboard-card correction-card" id="memberCorrectionForm">
        <div class="section-head">
          <div>
            <h2>Profile edit request pending</h2>
            <p class="muted">Your previous profile edit is waiting for approval. You can submit another edit after review.</p>
          </div>
          <span class="badge">Pending approval</span>
        </div>
        <p class="notice">Submitted fields: ${escapeHtml(correctionRequestSummary(pending))}</p>
      </section>
    `;
  }
  return `
    <form id="memberCorrectionForm" class="box public-form-card member-dashboard-card correction-card">
      <h2>Request profile edit</h2>
      <p class="notice">${escapeHtml(member.remarks || "Edit your details and submit. Changes will update only after approval.")}</p>
      <div class="two">
        <label>Name <input name="name" value="${escapeHtml(member.name)}"></label>
        <label>LS Number <input name="lsNumber" value="${escapeHtml(member.lsNumber)}"></label>
      </div>
      <div class="two">
        <label>District <input name="district" value="${escapeHtml(member.district)}"></label>
        <label>Taluk <input name="taluk" value="${escapeHtml(member.taluk)}"></label>
      </div>
      <div class="two">
        <label>Phone <input name="phoneNumber" value="${escapeHtml(member.phoneNumber)}"></label>
        <label>Login ID <input name="loginId" value="${escapeHtml(member.loginId)}"></label>
      </div>
      <div class="two">
        <label>Date of Birth <input name="dateOfBirth" type="date" value="${escapeHtml(member.dateOfBirth)}"></label>
        <label>Age <input name="age" type="number" value="${escapeHtml(member.age || calculateAgeFromDob(member.dateOfBirth))}" readonly></label>
      </div>
      <div class="two">
        <label>Education <input name="qualification" value="${escapeHtml(member.qualification)}"></label>
        <label>Batch Year <select name="batchYear"><option value="">Select batch</option>${options(batchYearOptions(), member.batchYear || "")}</select></label>
      </div>
      <div class="two">
        <label>Category <input name="category" value="${escapeHtml(member.category)}"></label>
        <label>Caste <input name="caste" value="${escapeHtml(member.caste)}"></label>
      </div>
      <div class="three">
        <label>Religion <input name="religion" value="${escapeHtml(member.religion)}"></label>
        <label>Marital Status
          <select name="maritalStatus"><option value="">Select</option>${options(["Married", "Unmarried", "Widow/Widower", "Divorced"], member.maritalStatus || "")}</select>
        </label>
        <label>Kalyana Karnataka
          <select name="kalyanaKarnataka"><option value="">Select</option>${options(["Yes", "No"], member.kalyanaKarnataka || "")}</select>
        </label>
      </div>
      <label>Disability
        <select name="disability"><option value="">Select</option>${options(["None", "Yes"], member.disability || "")}</select>
      </label>
      <label>Address <textarea name="address" rows="3">${escapeHtml(member.address)}</textarea></label>
      <label>Reason * <textarea name="reason" rows="3" required placeholder="Explain what you corrected"></textarea></label>
      ${memberSelfDeclarationHtml()}
      <div class="message" id="correctionMessage"></div>
      <button class="primary" type="submit">Send profile edit request</button>
    </form>
  `;
}

function changePasswordForm() {
  return `
    <form id="changePasswordForm" class="box public-form-card member-dashboard-card password-card">
      <h2>Change password</h2>
      <div class="three">
        <label>Current Password <input name="currentPassword" type="password" required></label>
        <label>New Password <input name="password" type="password" required minlength="6"></label>
        <label>Confirm Password <input name="confirmPassword" type="password" required minlength="6"></label>
      </div>
      <div class="message" id="changePasswordMessage"></div>
      <button class="primary" type="submit">Change password</button>
    </form>
  `;
}

function memberProblemForm() {
  return `
    <form id="memberProblemForm" class="box public-form-card member-dashboard-card problem-card">
      <div class="section-head">
        <div>
          <h2>Submit Problem to Leadership</h2>
          <p class="muted">Your issue will be visible to the association leadership body for review.</p>
        </div>
      </div>
      <div class="two">
        <label>Category
          <select name="category">
            <option>Service issue</option>
            <option>Department issue</option>
            <option>Payment / fee issue</option>
            <option>Member data issue</option>
            <option>Other</option>
          </select>
        </label>
        <label>Subject * <input name="subject" required maxlength="160" placeholder="Short problem title"></label>
      </div>
      <label>Problem details * <textarea name="description" rows="5" required placeholder="Explain the issue clearly"></textarea></label>
      <div class="message" id="memberProblemMessage"></div>
      <button class="primary" type="submit">Submit problem</button>
    </form>
  `;
}

function memberDocumentForm() {
  return `
    <form id="memberDocumentForm" class="box public-form-card member-dashboard-card problem-card">
      <div class="section-head">
        <div>
          <h2>Upload Office Notice / Legal Document</h2>
          <p class="muted">Akarband, Swamitva, office notice, court/legal notice and other work PDFs will go to the legal/team review queue.</p>
        </div>
      </div>
      <div class="two">
        <label>Document Type *
          <select name="documentType" required>
            <option>Office Notice</option>
            <option>Akarband</option>
            <option>Swamitva</option>
            <option>Court / Legal Notice</option>
            <option>Department Order</option>
            <option>Other Work</option>
          </select>
        </label>
        <label>Notice Date <input name="noticeDate" type="date"></label>
      </div>
      <div class="two">
        <label>Office / Department Name <input name="officeName" maxlength="160" placeholder="Tahsildar office, ADLR, etc."></label>
        <label>Village / Hobli <input name="village" maxlength="160"></label>
      </div>
      <label>Subject * <input name="subject" required maxlength="160" placeholder="Short document subject"></label>
      <label>Details / Remarks * <textarea name="description" rows="4" required placeholder="Explain why this notice/document is uploaded"></textarea></label>
      <label>PDF Upload * <input name="pdfFile" type="file" accept="application/pdf" required></label>
      <div class="message" id="memberDocumentMessage"></div>
      <button class="primary" type="submit">Upload document</button>
    </form>
  `;
}

function renderMyProblems(problems = []) {
  return `
    <section class="box public-form-card member-dashboard-card problem-list-card">
      <div class="section-head">
        <h2>My submitted problems</h2>
        <span class="badge">${problems.length} Total</span>
      </div>
      <div class="timeline">
        ${problems.map((problem) => `
          <div class="timeline-item">
            <span class="badge">${escapeHtml(problem.status)}</span>
            <span class="muted">${escapeHtml(problem.category)} / ${escapeHtml(new Date(problem.createdAt).toLocaleString())}</span>
            <strong>${escapeHtml(problem.subject)}</strong>
            <p>${escapeHtml(problem.description).replace(/\n/g, "<br>")}</p>
            ${problem.documentUrl ? `<p><a class="secondary" href="${escapeHtml(problem.documentUrl)}" target="_blank">View uploaded PDF</a></p>` : ""}
            ${problem.response ? `<p class="notice">${escapeHtml(problem.response)}</p>` : ""}
          </div>
        `).join("") || `<p class="muted">No problems submitted yet.</p>`}
      </div>
    </section>
  `;
}

function memberDonationPanel(donations = []) {
  return `
    <section class="box public-form-card member-dashboard-card donation-card">
      <div class="donation-hero">
        <div>
          <p class="eyebrow">KLSWA Secure Donation</p>
          <h2>Horata & Legal Samiti Fund</h2>
          <p>Pay safely using Razorpay. UPI, cards, and netbanking options may be available inside Razorpay checkout.</p>
        </div>
        <span class="donation-secure-badge">Secured by Razorpay</span>
      </div>
      <div class="donation-payment-box">
        <div>
          <strong>Donate online</strong>
          <p class="muted">Click the button below and complete payment on Razorpay's secure page.</p>
        </div>
        <div class="razorpay-button-wrap" id="razorpayPaymentButtonWrap"></div>
      </div>
      <p class="donation-note">After payment, keep the Razorpay payment receipt for your records.</p>
    </section>
    <section class="box public-form-card member-dashboard-card donation-history-card">
      <h2>My Donation Receipts</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Fund</th><th>Amount</th><th>Method</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>
            ${donations.map((item) => `
              <tr>
                <td>${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "-")}</td>
                <td>${escapeHtml(item.fundType)}</td>
                <td>${escapeHtml(rupees(item.amount))}</td>
                <td>${escapeHtml(item.paymentMethod)}</td>
                <td><span class="badge">${escapeHtml(item.status)}</span></td>
                <td>
                  ${escapeHtml(item.razorpayPaymentId || item.manualReference || item.razorpayQrId || item.razorpayOrderId || "-")}
                  ${item.razorpayShortUrl ? `<br><a href="${escapeHtml(item.razorpayShortUrl)}" target="_blank">Open QR</a>` : ""}
                </td>
              </tr>
            `).join("") || `<tr><td colspan="6">No donations submitted yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function mountRazorpayPaymentButton() {
  const target = document.querySelector("#razorpayPaymentButtonWrap");
  if (!target || target.dataset.loaded === "true") return;
  target.dataset.loaded = "true";
  target.innerHTML = `<span class="razorpay-loading">Loading secure Razorpay button...</span>`;
  const form = document.createElement("form");
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/payment-button.js";
  script.async = true;
  script.dataset.payment_button_id = razorpayPaymentButtonId;
  script.onload = () => {
    const loading = target.querySelector(".razorpay-loading");
    if (loading) loading.remove();
  };
  form.appendChild(script);
  target.prepend(form);
}

function monthLabel(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown month";
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function serviceBookEntries(problems = []) {
  return [...problems]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((problem) => ({
      month: monthLabel(problem.createdAt),
      category: problem.documentType || problem.category || "Service entry",
      title: problem.subject || "Member service entry",
      description: problem.description || "",
      place: [problem.village, problem.officeName].filter(Boolean).join(" / "),
      status: problem.status || "Pending",
      date: problem.createdAt ? new Date(problem.createdAt).toLocaleString("en-IN") : "",
      documentUrl: problem.documentUrl || "",
      response: problem.response || ""
    }));
}

function renderServiceBook(member, problems = []) {
  const entries = serviceBookEntries(problems);
  const verified = entries.filter((entry) => ["Verified", "Resolved", "Closed", "Approved"].includes(entry.status)).length;
  const pending = entries.filter((entry) => !["Verified", "Resolved", "Closed", "Approved", "Rejected"].includes(entry.status)).length;
  const thisMonth = entries.filter((entry) => entry.month === monthLabel(new Date())).length;
  const groups = entries.reduce((map, entry) => {
    map.set(entry.month, [...(map.get(entry.month) || []), entry]);
    return map;
  }, new Map());
  return `
    <section class="member-service-book" id="memberServiceBook">
      <div class="service-book-cover">
        <div>
          <p class="eyebrow">KLSWA Official Record</p>
          <h2>Digital Service Book</h2>
          <p>Individual member work history, documents, notices, and verification trail.</p>
        </div>
        <button class="secondary" type="button" id="printServiceBook">Print / Save PDF</button>
      </div>

      <div class="service-book-identity">
        <div class="service-photo-card">
          ${member.profilePhotoUrl ? `<img src="${escapeHtml(member.profilePhotoUrl)}" alt="Passport photo">` : `<span>${escapeHtml((member.name || "M").slice(0, 1).toUpperCase())}</span>`}
          <small>Passport Photo</small>
        </div>
        <div class="service-member-main">
          <span class="badge">${escapeHtml(member.status || "Member")}</span>
          <h3>${escapeHtml(member.name || "-")}</h3>
          <div class="service-meta-grid">
            <span><b>LS No</b>${escapeHtml(member.lsNumber || "-")}</span>
            <span><b>Phone</b>${escapeHtml(member.phoneNumber || "-")}</span>
            <span><b>District</b>${escapeHtml(member.district || "-")}</span>
            <span><b>Taluk</b>${escapeHtml(member.taluk || "-")}</span>
            <span><b>Batch</b>${escapeHtml(member.batchYear || "-")}</span>
            <span><b>Education</b>${escapeHtml(member.qualification || "-")}</span>
          </div>
        </div>
        <div class="service-license-card">
          ${member.licenseCardUrl ? `<img src="${escapeHtml(member.licenseCardUrl)}" alt="License card">` : `<span>License Card</span>`}
        </div>
      </div>

      <div class="service-summary-grid">
        <div><span>Total Entries</span><strong>${entries.length}</strong></div>
        <div><span>Verified / Closed</span><strong>${verified}</strong></div>
        <div><span>Pending</span><strong>${pending}</strong></div>
        <div><span>This Month</span><strong>${thisMonth}</strong></div>
      </div>

      <div class="service-book-timeline">
        ${entries.length ? [...groups.entries()].map(([month, monthEntries]) => `
          <section class="service-month">
            <h3>${escapeHtml(month)}</h3>
            ${monthEntries.map((entry) => `
              <article class="service-entry">
                <div class="service-entry-marker"></div>
                <div>
                  <div class="service-entry-head">
                    <strong>${escapeHtml(entry.category)}</strong>
                    <span class="badge">${escapeHtml(entry.status)}</span>
                  </div>
                  <h4>${escapeHtml(entry.title)}</h4>
                  ${entry.place ? `<p class="muted">${escapeHtml(entry.place)}</p>` : ""}
                  <p>${escapeHtml(entry.description).replace(/\n/g, "<br>")}</p>
                  <div class="service-entry-foot">
                    <span>${escapeHtml(entry.date)}</span>
                    ${entry.documentUrl ? `<a class="secondary" href="${escapeHtml(entry.documentUrl)}" target="_blank">View proof</a>` : ""}
                  </div>
                  ${entry.response ? `<p class="notice">${escapeHtml(entry.response)}</p>` : ""}
                </div>
              </article>
            `).join("")}
          </section>
        `).join("") : `
          <div class="service-empty">
            <strong>No service entries yet</strong>
            <p class="muted">Office/legal documents and submitted work records will appear here month-wise.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function memberSupportMessage(member, talukTeam) {
  return [
    `Dear ${talukTeam?.name || "Taluk Technical Team"},`,
    "",
    "I need support for my KLSWA member record.",
    `Name: ${member.name || "-"}`,
    `LS Number: ${member.lsNumber || "-"}`,
    `District: ${member.district || "-"}`,
    `Taluk: ${member.taluk || "-"}`,
    `Current Status: ${member.status || "-"}`,
    "",
    "Please guide me."
  ].join("\n");
}

function whatsappLink(phoneNumber, text) {
  const phone = String(phoneNumber || "").replace(/\D/g, "");
  if (!phone) return "";
  return `https://wa.me/91${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function renderTalukTeamContact(member, talukTeam) {
  const message = memberSupportMessage(member, talukTeam);
  const whatsapp = whatsappLink(talukTeam?.phoneNumber, message);
  return `
    <section class="box public-form-card member-dashboard-card contact-team-card">
      <div class="section-head">
        <div>
          <h2>Contact Taluk Team</h2>
          <p class="muted">Use this for member record support, correction help, or login help.</p>
        </div>
        <span class="badge">${escapeHtml(member.taluk || "Taluk")}</span>
      </div>
      ${talukTeam ? `
        <div class="status-grid">
          <div><span class="muted">Team Name</span><strong>${escapeHtml(talukTeam.name || "-")}</strong></div>
          <div><span class="muted">User ID</span><strong>${escapeHtml(talukTeam.username || "-")}</strong></div>
          <div><span class="muted">District</span><strong>${escapeHtml(talukTeam.district || member.district || "-")}</strong></div>
          <div><span class="muted">Phone</span><strong>${escapeHtml(talukTeam.phoneNumber || "Not available")}</strong></div>
        </div>
      ` : `
        <p class="notice">Taluk technical team login is not active yet for this taluk. Please contact district/state admin.</p>
      `}
      <label>Support message
        <textarea id="talukSupportMessage" rows="8" readonly>${escapeHtml(message)}</textarea>
      </label>
      <div class="actions">
        <button class="secondary" type="button" id="copyTalukSupport">Copy message</button>
        ${whatsapp ? `<a class="primary" href="${whatsapp}" target="_blank">Open WhatsApp</a>` : ""}
      </div>
      <div class="message success" id="talukSupportStatus"></div>
    </section>
  `;
}

function renderPresidentMessages(messages = []) {
  if (!messages.length) return "";
  return `
    <section class="box public-form-card member-dashboard-card notice-card">
      <div class="section-head">
        <h2>State President Notices</h2>
        <span class="badge">${messages.length} Latest</span>
      </div>
      <div class="timeline">
        ${messages.map((message) => `
          <div class="timeline-item">
            <span class="muted">${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
            <strong>${escapeHtml(message.subject)}</strong>
            <p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function emptyMemberPanel(title, text) {
  return `
    <section class="box public-form-card member-dashboard-card">
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(text)}</p>
    </section>
  `;
}

function memberUploadSlot({
  title,
  description,
  previewUrl,
  fallbackText,
  inputId,
  messageId,
  buttonText,
  square = false
}) {
  return `
    <div class="member-upload-slot">
      <div class="${square ? "member-card-preview" : "member-photo"}">
        ${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(title)}">` : `<span>${escapeHtml(fallbackText)}</span>`}
      </div>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p class="muted">${escapeHtml(description)}</p>
        <label class="secondary member-photo-upload">
          ${escapeHtml(buttonText)}
          <input id="${escapeHtml(inputId)}" type="file" accept="image/jpeg,image/png,image/webp">
        </label>
        <div class="message" id="${escapeHtml(messageId)}"></div>
      </div>
    </div>
  `;
}

function showMemberPanel(panelName) {
  document.querySelectorAll("[data-member-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.memberTab === panelName);
  });
  document.querySelectorAll("[data-member-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.memberPanel === panelName);
  });
}

function renderDashboard(member, auditLogs = [], presidentMessages = [], talukTeam = null, problems = [], correctionRequests = [], donations = []) {
  setMemberDashboardMode(true);
  const noticesPanel = renderPresidentMessages(presidentMessages) || emptyMemberPanel("State President Notices", "No active notices available right now.");
  const missingPanel = missingDataForm(member, correctionRequests) || emptyMemberPanel("Missing Data", "No missing profile fields found.");
  dashboard.innerHTML = `
    <section class="member-portal">
      <aside class="member-portal-menu">
        <div class="member-portal-person">
          <div class="member-photo small">
            ${member.profilePhotoUrl ? `<img src="${escapeHtml(member.profilePhotoUrl)}" alt="Profile photo">` : `<span>${escapeHtml((member.name || "M").trim().slice(0, 1).toUpperCase())}</span>`}
          </div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.lsNumber || "Member")}</span>
          <span class="badge">${escapeHtml(member.status)}</span>
        </div>
        <nav class="member-portal-nav">
          <button class="active" type="button" data-member-tab="profile">My Profile</button>
          <button type="button" data-member-tab="serviceBook">Digital Service Book</button>
          <button type="button" data-member-tab="edit">Edit Profile Request</button>
          <button type="button" data-member-tab="missing">Missing Data</button>
          <button type="button" data-member-tab="documents">Office / Legal Documents</button>
          <button type="button" data-member-tab="problems">Problems / Grievance</button>
          <button type="button" data-member-tab="donations">Donations</button>
          <button type="button" data-member-tab="contact">Contact Taluk Team</button>
          <button type="button" data-member-tab="notices">President Notices</button>
          <button type="button" data-member-tab="password">Change Password</button>
          <button type="button" data-member-tab="audit">Audit Timeline</button>
          <button class="member-logout-tab" type="button" id="memberLogout">Logout</button>
        </nav>
      </aside>
      <div class="member-portal-content">
        <div class="member-panel active" data-member-panel="profile">
          <section class="box status-card member-profile-card">
            <div class="section-head">
              <div class="member-photo-panel member-document-slots">
                ${memberUploadSlot({
                  title: "Official passport photo",
                  description: "Upload only your clear passport size photo.",
                  previewUrl: member.profilePhotoUrl,
                  fallbackText: (member.name || "M").trim().slice(0, 1).toUpperCase(),
                  inputId: "memberPhotoInput",
                  messageId: "memberPhotoMessage",
                  buttonText: "Upload passport photo"
                })}
                ${memberUploadSlot({
                  title: "License card",
                  description: "Upload only your official licence card image.",
                  previewUrl: member.licenseCardUrl,
                  fallbackText: "ID",
                  inputId: "memberLicenseCardInput",
                  messageId: "memberLicenseCardMessage",
                  buttonText: "Upload licence card",
                  square: true
                })}
              </div>
              <div class="member-profile-title">
                <p class="eyebrow">Member Dashboard</p>
                <h2>${escapeHtml(member.name)}</h2>
                <p class="muted"><strong>District:</strong> ${escapeHtml(member.district || "-")} / <strong>Taluk:</strong> ${escapeHtml(member.taluk || "-")}</p>
              </div>
              <span class="badge">${escapeHtml(member.status)}</span>
            </div>
            <div class="status-grid">
              <div><span class="muted">Status</span><strong>${escapeHtml(statusText(member.status))}</strong></div>
              <div><span class="muted">Login Access</span><strong>${member.memberLoginActive ? "Activated" : "Not activated"}</strong></div>
            </div>
            ${member.remarks ? `<p class="notice">${escapeHtml(member.remarks)}</p>` : ""}
            <div class="detail-grid">${memberRows(member)}</div>
            <div class="modal-actions">
              <button class="secondary" id="openProfileEdit" type="button">Edit profile</button>
              <button class="secondary" id="downloadDayaMaranaPetition" type="button">Download petition PDF</button>
              ${member.status === "Active" ? `<button class="primary" id="downloadApprovedApplication" type="button">Download approved application PDF</button>` : ""}
            </div>
          </section>
        </div>
        <div class="member-panel" data-member-panel="serviceBook">${renderServiceBook(member, problems)}</div>
        <div class="member-panel" data-member-panel="edit">${correctionForm(member, correctionRequests)}</div>
        <div class="member-panel" data-member-panel="missing">${missingPanel}</div>
        <div class="member-panel" data-member-panel="documents">${memberDocumentForm()}</div>
        <div class="member-panel" data-member-panel="problems">${memberProblemForm()}${renderMyProblems(problems)}</div>
        <div class="member-panel" data-member-panel="donations">${memberDonationPanel(donations)}</div>
        <div class="member-panel" data-member-panel="contact">${renderTalukTeamContact(member, talukTeam)}</div>
        <div class="member-panel" data-member-panel="notices">${noticesPanel}</div>
        <div class="member-panel" data-member-panel="password">${changePasswordForm()}</div>
        <div class="member-panel" data-member-panel="audit">
          <section class="box public-form-card member-dashboard-card audit-card">
            <h2>My audit timeline</h2>
            <div class="timeline">
              ${auditLogs.map((log) => `
                <div class="timeline-item">
                  <span class="muted">${escapeHtml(new Date(log.createdAt).toLocaleString())}</span>
                  <strong>${escapeHtml(log.action)} / ${escapeHtml(log.field)}</strong>
                  <div class="timeline-diff">
                    <span class="diff-old">${escapeHtml(log.oldValue || "-")}</span>
                    <span class="diff-new">${escapeHtml(log.newValue || "-")}</span>
                  </div>
                </div>
              `).join("") || `<p class="muted">No audit history available yet.</p>`}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#memberLogout").addEventListener("click", async () => {
    await request("/api/member-logout", { method: "POST" });
    dashboard.innerHTML = "";
    setMemberDashboardMode(false);
  });

  const downloadApplication = document.querySelector("#downloadApprovedApplication");
  if (downloadApplication) {
    downloadApplication.addEventListener("click", () => downloadApprovedApplication(member));
  }
  const downloadPetition = document.querySelector("#downloadDayaMaranaPetition");
  if (downloadPetition) {
    downloadPetition.addEventListener("click", () => downloadDayaMaranaPetition(member));
  }
  const openProfileEdit = document.querySelector("#openProfileEdit");
  if (openProfileEdit) {
    openProfileEdit.addEventListener("click", () => {
      showMemberPanel("edit");
    });
  }
  const printServiceBook = document.querySelector("#printServiceBook");
  if (printServiceBook) {
    printServiceBook.addEventListener("click", () => {
      showMemberPanel("serviceBook");
      window.print();
    });
  }

  document.querySelectorAll("[data-member-tab]").forEach((button) => {
    button.addEventListener("click", () => showMemberPanel(button.dataset.memberTab));
  });

  bindMemberImageUpload({
    inputId: "memberPhotoInput",
    messageId: "memberPhotoMessage",
    endpoint: "/api/member-photo",
    emptyMessage: "Upload JPG, PNG, or WEBP passport photo.",
    sizeMessage: "Passport photo must be less than 3 MB."
  });
  bindMemberImageUpload({
    inputId: "memberLicenseCardInput",
    messageId: "memberLicenseCardMessage",
    endpoint: "/api/member-license-card",
    emptyMessage: "Upload JPG, PNG, or WEBP licence card image.",
    sizeMessage: "Licence card image must be less than 3 MB."
  });
  mountRazorpayPaymentButton();

  document.querySelector("#copyTalukSupport").addEventListener("click", async () => {
    await copyText(document.querySelector("#talukSupportMessage").value);
    const status = document.querySelector("#talukSupportStatus");
    status.textContent = "Support message copied. Paste it in WhatsApp/SMS.";
    setTimeout(() => { status.textContent = ""; }, 1800);
  });

  const correction = document.querySelector("#memberCorrectionForm");
  if (correction) {
    correction.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const reason = String(form.get("reason") || "").trim();
      const changes = {};
      [
        "name", "lsNumber", "district", "taluk", "phoneNumber", "loginId", "dateOfBirth", "age", "qualification", "batchYear",
        "category", "caste", "religion", "maritalStatus", "kalyanaKarnataka", "disability", "address"
      ].forEach((field) => {
        changes[field] = form.get(field);
      });
      try {
        await request("/api/member-correction-request", {
          method: "POST",
          body: JSON.stringify({ reason, changes, declarationAccepted: form.get("declarationAccepted") === "on" })
        });
        document.querySelector("#correctionMessage").textContent = "Correction request sent to admin.";
      } catch (error) {
        document.querySelector("#correctionMessage").textContent = error.message;
      }
    });
  }

  const missingData = document.querySelector("#memberMissingDataForm");
  if (missingData) {
    bindAgeCalculation(missingData);
    missingData.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const changes = {};
      for (const field of missingFieldKeys(member)) changes[field] = form.get(field);
      try {
        await request("/api/member-correction-request", {
          method: "POST",
          body: JSON.stringify({
            reason: "Member filled missing profile data",
            changes,
            declarationAccepted: form.get("declarationAccepted") === "on"
          })
        });
        const session = await request("/api/member-me");
        renderDashboard(session.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || [], session.correctionRequests || [], session.donations || []);
      } catch (error) {
        document.querySelector("#missingDataMessage").textContent = error.message;
      }
    });
  }

  const problemForm = document.querySelector("#memberProblemForm");
  const correctionFormEl = document.querySelector("#memberCorrectionForm");
  if (correctionFormEl) bindAgeCalculation(correctionFormEl);
  problemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#memberProblemMessage");
    message.textContent = "";
    try {
      await request("/api/member-problems", {
        method: "POST",
        body: JSON.stringify(formObject(problemForm))
      });
      problemForm.reset();
      message.textContent = "Problem submitted to leadership.";
      const session = await request("/api/member-me");
      renderDashboard(session.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || [], session.correctionRequests || [], session.donations || []);
    } catch (error) {
      message.textContent = error.message;
    }
  });

  const documentForm = document.querySelector("#memberDocumentForm");
  documentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#memberDocumentMessage");
    message.textContent = "";
    const file = documentForm.querySelector('input[name="pdfFile"]').files?.[0];
    if (!file) {
      message.textContent = "Upload PDF document.";
      return;
    }
    if (file.type !== "application/pdf") {
      message.textContent = "Only PDF upload is allowed.";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      message.textContent = "PDF must be less than 8 MB.";
      return;
    }
    try {
      const data = formObject(documentForm);
      delete data.pdfFile;
      data.category = "Legal / Office Notice";
      data.pdfData = await fileToDataUrl(file);
      data.documentName = file.name;
      await request("/api/member-problems", {
        method: "POST",
        body: JSON.stringify(data)
      });
      documentForm.reset();
      message.textContent = "Document uploaded for legal/team review.";
      const session = await request("/api/member-me");
      renderDashboard(session.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || [], session.correctionRequests || [], session.donations || []);
    } catch (error) {
      message.textContent = error.message;
    }
  });

  const changePassword = document.querySelector("#changePasswordForm");
  changePassword.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#changePasswordMessage");
    message.textContent = "";
    try {
      await request("/api/member-change-password", {
        method: "POST",
        body: JSON.stringify(formObject(changePassword))
      });
      changePassword.reset();
      message.textContent = "Password changed successfully.";
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

async function loadMemberSession() {
  try {
    const data = await request("/api/member-me");
    renderDashboard(data.member, data.auditLogs || [], data.presidentMessages || [], data.talukTeam || null, data.problems || [], data.correctionRequests || [], data.donations || []);
  } catch {
    dashboard.innerHTML = "";
    setMemberDashboardMode(false);
  }
}

activateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  activateMessage.textContent = "";
  try {
    await request("/api/member-activate", {
      method: "POST",
      body: JSON.stringify(formObject(activateForm))
    });
    activateMessage.textContent = "Login activated. You can sign in now.";
    activateForm.reset();
  } catch (error) {
    activateMessage.textContent = error.message;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  try {
    const data = await request("/api/member-login", {
      method: "POST",
      body: JSON.stringify(formObject(loginForm))
    });
    loginForm.reset();
    const session = await request("/api/member-me");
    renderDashboard(session.member || data.member, session.auditLogs || [], session.presidentMessages || [], session.talukTeam || null, session.problems || [], session.correctionRequests || [], session.donations || []);
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  forgotMessage.textContent = "";
  try {
    await request("/api/member-forgot-password", {
      method: "POST",
      body: JSON.stringify(formObject(forgotForm))
    });
    forgotForm.reset();
    forgotMessage.textContent = "Password reset. You can sign in now.";
  } catch (error) {
    forgotMessage.textContent = error.message;
  }
});

loadMemberSession();
