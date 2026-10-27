// Offline shell: cache-first for app files, network for everything else.
const CACHE = "draydesk-v1";
const FILES = ["./", "index.html", "pricing.html", "styles.css", "app.js", "pricing.js", "config.js", "icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // config.js is network-first so a new PAY_URL shows up immediately.
  if (url.pathname.endsWith("config.js")) {
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
