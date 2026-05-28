const razorpayPaymentButtonId = "pl_Suq8LypT1hctYr";

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
