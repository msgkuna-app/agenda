/**
 * Jaring Pengaman Layar Awal ("Memeriksa sesi masuk...")
 * Dimuat secara sinkron di <head> setelah boot-tema.js. Tugasnya: menampilkan kartu galat
 * bila onAuthStateChanged tidak pernah menjawab, bila modul gagal dimuat, atau bila ada
 * promise yang ditolak tanpa penanganan — supaya pengguna tidak terjebak di layar memuat.
 * Skrip ini klasik (bukan modul) karena harus terpasang sebelum js/main.js dievaluasi;
 * itulah satu-satunya sebab ia memakai window.__selesaiPemeriksaanSesi sebagai penanda.
 */
(function () {
  "use strict";

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
