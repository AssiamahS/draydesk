// DrayDesk sales config.
// PAY_URL: paste a Stripe Payment Link (or any checkout URL) here, e.g. "https://buy.stripe.com/xxxx".
//          When set, every "Start" button goes straight to it.
// CONTACT: an email address ("you@example.com") or a phone number ("+15551234567").
//          When PAY_URL is empty, "Start" opens a request-access form that composes
//          an email (mailto:) or a text message (sms:) to CONTACT.
// Leave both as "" until you have them. Nothing else needs to change.
window.DRAYDESK_CONFIG = {
  PAY_URL: "",
  CONTACT: "",
  PRICE_PER_TRUCK: 15,
};
