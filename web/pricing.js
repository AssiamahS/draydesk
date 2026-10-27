(() => {
  "use strict";
  const cfg = window.DRAYDESK_CONFIG || {};
  const PAY_URL = String(cfg.PAY_URL || "").trim();
  const CONTACT = String(cfg.CONTACT || "").trim();
  if (cfg.PRICE_PER_TRUCK) document.querySelectorAll("[data-price]").forEach((el) => { el.textContent = cfg.PRICE_PER_TRUCK; });

  const req = document.getElementById("request");
  const form = document.getElementById("reqForm");
  const hint = document.getElementById("reqHint");

  document.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (PAY_URL) { location.href = PAY_URL; return; }
      req.hidden = false;
      form.elements.plan.value = btn.dataset.start;
      req.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => form.elements.name.focus(), 300);
    });
  });

  if (!CONTACT) {
    hint.textContent = "Setup note: CONTACT is empty in config.js, so this form can't send yet.";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const plan = f.plan.value === "pilot" ? "Fleet pilot ($99 first month)" : "Owner-Op Pro ($" + (cfg.PRICE_PER_TRUCK || 15) + "/truck/mo)";
    const body = [
      "DrayDesk access request",
      "Plan: " + plan,
      "Name: " + f.name.value,
      "Company/MC: " + f.company.value,
      "Reach me: " + f.reach.value,
      "Trucks: " + f.trucks.value,
      "Port/ramps: " + f.port.value,
    ].join("\n");
    if (!CONTACT) { hint.textContent = "No CONTACT set in config.js. Copy this instead:\n" + body; hint.style.whiteSpace = "pre-line"; return; }
    const isEmail = CONTACT.includes("@");
    const url = isEmail
      ? `mailto:${CONTACT}?subject=${encodeURIComponent("DrayDesk access: " + f.name.value)}&body=${encodeURIComponent(body)}`
      : `sms:${CONTACT}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(body)}`;
    location.href = url;
    hint.textContent = "Your " + (isEmail ? "email" : "messages") + " app should open with the request filled in. Hit send.";
  });
})();
