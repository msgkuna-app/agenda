/**
 * Skrip Sinkron Awal (Boot Tema, Sidebar & Jaring Pengaman Layar Awal)
 * Dimuat secara sinkron di <head> sebelum stylesheet untuk mencegah kilasan warna tema
 * dan ukuran sidebar (FOUC). Juga memasang jaring pengaman global untuk layar "Memeriksa sesi masuk...".
 */
(function () {
  "use strict";

  // 1. Inisialisasi Tema & Sidebar Sinkron (mencegah kilasan warna dan pergeseran layout)
  var root = document.documentElement;
  var prefTema = "system";
  try {
    // Kunci harus sama dengan STORAGE_KEY_TEMA di js/config/constants.js (skrip klasik tidak bisa mengimpor)
    var t = localStorage.getItem("agenda_arsip_tema");
    if (t === "light" || t === "dark" || t === "system") prefTema = t;
  } catch (_e) {}

  var gelapSistem =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  var efektif =
    prefTema === "system" ? (gelapSistem ? "dark" : "light") : prefTema;

  if (prefTema === "light" || prefTema === "dark") {
    root.setAttribute("data-theme", prefTema);
  } else {
    root.removeAttribute("data-theme");
  }
  root.style.colorScheme = efektif;

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      efektif === "dark" ? "#0f172a" : "#0B5FA5",
    );
  }

  var statusSidebar = null;
  try {
    // Kunci harus sama dengan STORAGE_SIDEBAR_KEY di js/config/constants.js
    var s = localStorage.getItem("agenda_arsip_sidebar");
    if (s === "expanded" || s === "collapsed") statusSidebar = s;
  } catch (_e2) {}

  if (!statusSidebar) {
    statusSidebar =
      window.matchMedia &&
      window.matchMedia("(min-width: 1024.02px)").matches
        ? "expanded"
        : "collapsed";
  }
  root.setAttribute("data-sidebar", statusSidebar);

  // 2. Jaring Pengaman Layar "Memeriksa Sesi Masuk..."
  var TIMEOUT_SESI_MS = 10000;
  var idTimerSesi = null;
  var sesiSudahSelesai = false;

  function apakahLayarCheckingAktif() {
    var screenChecking = document.getElementById("screen-checking");
    if (!screenChecking || screenChecking.hidden) return false;
    var screenLogin = document.getElementById("screen-login");
    var appShell = document.getElementById("app-shell");
    var screenConfigError = document.getElementById("screen-config-error");
    return Boolean(
      (!screenLogin || screenLogin.hidden) &&
      (!appShell || appShell.hidden) &&
      (!screenConfigError || screenConfigError.hidden)
    );
  }

  function tampilkanKartuGalatSesi(pesanKhusus) {
    if (sesiSudahSelesai || !apakahLayarCheckingAktif()) return;

    var cardLoading = document.getElementById("session-loading-card");
    var cardError = document.getElementById("session-error-card");
    var descError = document.getElementById("session-error-desc");

    if (cardLoading) cardLoading.hidden = true;
    if (cardError) cardError.hidden = false;
    if (descError && pesanKhusus) {
      descError.textContent = pesanKhusus;
    }
  }

  window.__selesaiPemeriksaanSesi = function () {
    sesiSudahSelesai = true;
    if (idTimerSesi !== null) {
      clearTimeout(idTimerSesi);
      idTimerSesi = null;
    }
  };

  // Timeout 10 detik jika onAuthStateChanged belum menjawab atau pemuatan modul macet
  idTimerSesi = setTimeout(function () {
    if (sesiSudahSelesai) return;
    tampilkanKartuGalatSesi(
      "Pemeriksaan sesi masuk membutuhkan waktu lebih dari 10 detik. Sambungan internet Anda mungkin lambat atau layanan Google terhambat."
    );
  }, TIMEOUT_SESI_MS);

  // Penangan global error & unhandledrejection
  window.addEventListener("error", function (event) {
    console.error("[Agenda & Arsip] Galat runtime terdeteksi:", event.error || event.message);
    if (apakahLayarCheckingAktif()) {
      var pesan =
        (event.error && event.error.message) ||
        event.message ||
        "Gagal memuat modul atau skrip aplikasi.";
      tampilkanKartuGalatSesi("Terjadi kendala saat memuat modul aplikasi: " + pesan);
    }
  });

  window.addEventListener("unhandledrejection", function (event) {
    console.error("[Agenda & Arsip] Promise ditolak tanpa penanganan:", event.reason);
    if (apakahLayarCheckingAktif()) {
      var pesan =
        (event.reason && (event.reason.message || event.reason.code)) ||
        String(event.reason || "Galat asinkron tak terduga.");
      tampilkanKartuGalatSesi("Gagal menyelesaikan inisialisasi sesi masuk: " + pesan);
    }
  });

  // Pemasangan aksi tombol "Coba lagi" dan "Bersihkan cache aplikasi"
  function siapkanTombolJaringPengaman() {
    var btnRetry = document.getElementById("session-retry-btn");
    var btnClear = document.getElementById("session-clear-cache-btn");

    if (btnRetry) {
      btnRetry.addEventListener("click", function () {
        btnRetry.disabled = true;
        btnRetry.textContent = "Memuat ulang...";
        window.location.reload();
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", async function () {
        btnClear.disabled = true;
        if (btnRetry) btnRetry.disabled = true;
        btnClear.textContent = "Membersihkan cache...";

        try {
          if ("caches" in window) {
            var keys = await caches.keys();
            await Promise.all(
              keys.map(function (k) {
                return caches.delete(k);
              })
            );
          }
          if ("serviceWorker" in navigator) {
            var regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
              regs.map(function (r) {
                return r.unregister();
              })
            );
          }
          try {
            sessionStorage.clear();
          } catch (_e) {}
        } catch (err) {
          console.warn("[Agenda & Arsip] Kendala saat membersihkan cache:", err);
        }

        window.location.reload();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", siapkanTombolJaringPengaman);
  } else {
    siapkanTombolJaringPengaman();
  }
})();
