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

function requireRazorpay() {
  if (!window.Razorpay) throw new Error("Razorpay checkout did not load. Please refresh and try again.");
}

function showPaidResult(preview, donation) {
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <div class="qr-box">
      <h3>Payment successful</h3>
      <p><strong>${escapeHtml(rupees(donation.amount))}</strong> received for ${escapeHtml(donation.fundType)}.</p>
      <p class="muted">Payment ID: ${escapeHtml(donation.razorpayPaymentId || "-")}</p>
    </div>
  `;
}

const payForm = document.querySelector("#publicDonationPayForm");
if (payForm) {
  payForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = payForm.querySelector('button[type="submit"]');
    const message = document.querySelector("#publicDonationPayMessage");
    const preview = document.querySelector("#publicDonationPayResult");
    message.textContent = "";
    preview.classList.add("hidden");
    preview.innerHTML = "";
    button.disabled = true;
    try {
      requireRazorpay();
      const data = await request("/api/public-donations/razorpay-order", {
        method: "POST",
        body: JSON.stringify(formObject(payForm))
      });
      const checkout = new window.Razorpay({
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency || "INR",
        name: "KLSWA Donation",
        description: data.donation.fundType,
        order_id: data.order.id,
        prefill: {
          name: data.donor.name,
          contact: data.donor.phoneNumber
        },
        notes: {
          donationId: data.donation.id,
          fundType: data.donation.fundType
        },
        theme: { color: "#0f6f4d" },
        handler: async (response) => {
          try {
            const verified = await request("/api/public-donations/razorpay-verify", {
              method: "POST",
              body: JSON.stringify({ ...response, donationId: data.donation.id })
            });
            showPaidResult(preview, verified.donation);
            payForm.reset();
            message.textContent = "Donation payment completed successfully.";
          } catch (error) {
            message.textContent = error.message;
          }
        },
        modal: {
          ondismiss: () => {
            message.textContent = "Payment window closed. If amount was debited, please contact admin with payment ID.";
          }
        }
      });
      checkout.open();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
