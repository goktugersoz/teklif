const CACHE_NAME = "fiyatladim-pwa-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./vendor.html",
  "./offline.html",
  "./manifest.json",
  "./styles/app.css",
  "./icons/fiyatladim-logo.png?v=3",
  "./src/app.js",
  "./src/vendor.js",
  "./src/db.js",
  "./src/pdf-tools.js",
  "./src/pwa.js",
  "./src/utils.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if(url.pathname.includes("/api/")){
    event.respondWith(fetch(event.request));
    return;
  }

  if(event.request.mode === "navigate"){
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./offline.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if(response.ok && event.request.method === "GET" && url.origin === self.location.origin){
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
