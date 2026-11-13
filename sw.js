const CACHE_NAME = "air-logistic-pwa-v35";
const APP_SHELL = ["./", "./index.html", "./confirm.html", "./manifest.webmanifest", "./icon.svg", "./auth.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("air-logistic-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match("./index.html"))));
  }
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "Air Logistic");
  const brandLogo = new URL("./icon.svg", self.registration.scope).href;
  const options = {
    body: String(data.body || "لديك تحديث جديد في نظام الشحن."),
    icon: brandLogo,
    image: brandLogo,
    badge: brandLogo,
    tag: String(data.tag || "air-logistic-update"),
    renotify: false,
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if (new URL(client.url).origin === self.location.origin) {
        if ("focus" in client) return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});