const VERSION = "agenda-arsip-v1.6.0";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/style.css",
  "/js/boot-tema.js",
  "/js/util-html.js",
  "/js/app.js",
  "/js/app/index.js",
  "/js/app/pwa.js",
  "/js/app/pintasan.js",
  "/js/app/jaringan-token.js",
  "/js/app/sesi.js",
  "/js/app/dashboard.js",
  "/js/firebase-config.js",
  "/js/pencarian-global.js",
  "/js/auth.js",
  "/js/util-tanggal.js",
  "/js/tema.js",
  "/js/sidebar.js",
  "/js/filter-panel.js",
  "/js/kategori.js",
  "/js/kegiatan.js",
  "/js/timeline-harian.js",
  "/js/jadwal.js",
  "/js/drive.js",
  "/js/dokumen.js",
  "/js/templat-dokumen.js",
  "/js/catatan.js",
  "/js/sampah.js",
  "/js/laporan.js",
  "/js/pengaturan.js",
  "/icons/ikon.svg",
  "/icons/favicon.svg",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        cache.addAll(
          APP_SHELL.map((url) => new Request(url, { cache: "reload" })),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== VERSION)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (_err) {
    return;
  }

  // JANGAN mencegat path Firebase Auth/Hosting helper, Google APIs, dan Google Accounts (GIS)
  if (
    url.pathname.startsWith("/__/") ||
    url.hostname === "googleapis.com" ||
    url.hostname.endsWith(".googleapis.com") ||
    url.hostname === "accounts.google.com" ||
    url.hostname.endsWith(".accounts.google.com")
  ) {
    return;
  }

  // Cache dulu (Cache-First) untuk SDK dari www.gstatic.com/firebasejs/
  if (
    url.hostname === "www.gstatic.com" &&
    url.pathname.startsWith("/firebasejs/")
  ) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      }),
    );
    return;
  }

  // Hanya tangani file milik aplikasi sendiri (same-origin) dengan strategi Jaringan Dulu lalu Cadangan Cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const networkResponse = await fetch(request, { cache: "no-cache" });
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (_err) {
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) {
            return cached;
          }
          if (request.mode === "navigate") {
            const fallbackIndex = await cache.match("/index.html");
            if (fallbackIndex) {
              return fallbackIndex;
            }
          }
          throw _err;
        }
      })(),
    );
  }
});