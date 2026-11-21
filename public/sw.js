// Versi ini harus sama dengan VERSI_CADANGAN_SW di js/config/constants.js
const VERSION = "agenda-arsip-v1.8.22";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/style.css",
  "/js/boot-tema.js",
  "/js/util-html.js",
  "/js/main.js",
  "/js/services/firestoreService.js",
  "/js/config/constants.js",
  "/js/config/firebase.js",
  "/js/pencarian-global.js",
  "/js/pwa.js",
  "/js/services/authService.js",
  "/js/util-tanggal.js",
  "/js/hari-libur.js",
  "/js/tema.js",
  "/js/sidebar.js",
  "/js/shared/toast.js",
  "/js/filter-panel.js",
  "/js/timeline-harian.js",
  "/js/jadwal.js",
  "/js/services/driveService.js",
  "/js/services/sheetsService.js",
  "/js/templat-dokumen.js",
  "/js/modules/sampah/format.js",
  "/js/modules/sampah/state.js",
  "/js/modules/sampah/view.js",
  "/js/modules/sampah/controller.js",
  "/js/modules/sampah/index.js",
  "/js/modules/dashboard/state.js",
  "/js/modules/dashboard/view.js",
  "/js/modules/dashboard/controller.js",
  "/js/modules/dashboard/index.js",
  "/js/modules/pengaturan/state.js",
  "/js/modules/pengaturan/view.js",
  "/js/modules/pengaturan/controller.js",
  "/js/modules/pengaturan/index.js",
  "/js/modules/dokumen/state.js",
  "/js/modules/dokumen/format.js",
  "/js/modules/dokumen/view.js",
  "/js/modules/dokumen/controller.js",
  "/js/modules/dokumen/index.js",
  "/js/modules/kegiatan/state.js",
  "/js/modules/kegiatan/format.js",
  "/js/modules/kegiatan/view.js",
  "/js/modules/kegiatan/controller.js",
  "/js/modules/kegiatan/index.js",
  "/js/modules/catatan/state.js",
  "/js/modules/catatan/format.js",
  "/js/modules/catatan/view.js",
  "/js/modules/catatan/controller.js",
  "/js/modules/catatan/index.js",
  "/js/modules/laporan/state.js",
  "/js/modules/laporan/format.js",
  "/js/modules/laporan/view.js",
  "/js/modules/laporan/controller.js",
  "/js/modules/laporan/index.js",
  "/js/modules/foto/state.js",
  "/js/modules/foto/view.js",
  "/js/modules/foto/controller.js",
  "/js/modules/foto/index.js",
  "/js/modules/kategori/format.js",
  "/js/modules/kategori/state.js",
  "/js/modules/kategori/view.js",
  "/js/modules/kategori/controller.js",
  "/js/modules/kategori/index.js",
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