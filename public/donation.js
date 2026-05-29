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

function rupees(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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

mountRazorpayPaymentButton();

const qrForm = document.querySelector("#publicDonationQrForm");
if (qrForm) {
  qrForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#publicDonationQrMessage");
    const preview = document.querySelector("#publicDonationQrPreview");
    message.textContent = "";
    preview.classList.add("hidden");
    preview.innerHTML = "";
    try {
      const data = await request("/api/public-donations/razorpay-qr", {
        method: "POST",
        body: JSON.stringify(formObject(qrForm))
      });
      preview.classList.remove("hidden");
      preview.innerHTML = `
        <div class="qr-box">
          <h3>Scan and pay ${escapeHtml(rupees(data.donation.amount))}</h3>
          ${data.donation.razorpayQrUrl ? `<img src="${escapeHtml(data.donation.razorpayQrUrl)}" alt="Razorpay QR code">` : ""}
          ${data.donation.razorpayShortUrl ? `<p><a class="primary" href="${escapeHtml(data.donation.razorpayShortUrl)}" target="_blank" rel="noopener">Open payment QR</a></p>` : ""}
          <p class="muted">This QR is single-use and valid for 30 minutes. After successful payment, KLSWA admin can see it in successful donations.</p>
        </div>
      `;
    } catch (error) {
      message.textContent = error.message;
    }
  });
}
