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

async function loadPublicPaymentLink() {
  const box = document.querySelector("#publicPaymentLinkBox");
  const link = document.querySelector("#publicPaymentLink");
  if (!box || !link) return;
  try {
    const data = await request("/api/donation-payment-link");
    if (!data.paymentLink) return;
    link.href = data.paymentLink;
    box.classList.remove("hidden");
  } catch {
    box.classList.add("hidden");
  }
}

loadPublicPaymentLink();

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
          ${data.donation.razorpayShortUrl ? `
            <div class="qr-pay-actions">
              <a class="primary pay-now-mobile" href="${escapeHtml(data.donation.razorpayShortUrl)}" target="_blank" rel="noopener">Pay Now on Mobile</a>
            </div>
            <p class="qr-mobile-tip">Mobile nalli idre button tap madi. Desktop nalli QR scan madi.</p>
          ` : ""}
          <p class="muted">This QR is single-use and valid for 30 minutes. After successful payment, KLSWA admin can see it in successful donations.</p>
        </div>
      `;
    } catch (error) {
      message.textContent = error.message;
    }
  });
}
