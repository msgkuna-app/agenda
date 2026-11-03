/**
 * Titik Masuk Utama Aplikasi "Agenda & Arsip" (Fase 0: Fondasi)
 * Mengatur urutan tampilan sesi masuk, layar galat konfigurasi, layar login,
 * pemantauan kedaluwarsa token Google Drive, konfirmasi keluar, serta pendaftaran PWA Service Worker.
 */
import { isFirebaseConfigured } from "./firebase-config.js";
import {
  AUTHORIZED_EMAIL,
  initAuth,
  loginWithGoogle,
  logoutUser,
  isDriveTokenExpired,
  consumeLastAuthError,
  formatPesanGalatAuth
} from "./auth.js";
import { initTema } from "./tema.js";
import {
  initSidebar,
  perbaruiInfoAkunSidebar,
  tutupDrawerMobile,
  escapeHtml
} from "./sidebar.js";
import { hariIni, parseTanggal } from "./util-tanggal.js";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

let dataUnsubscribers = [];
let tokenCheckIntervalId = null;
let logoutDialogOpen = false;
let focusBeforeModal = null;

/**
 * Menghentikan seluruh langganan Firestore aktif sebelum membuat yang baru atau saat keluar (Aturan #5).
 */
export function hentikanSemuaLanggananData() {
  while (dataUnsubscribers.length > 0) {
    const unsub = dataUnsubscribers.pop();
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (_err) {
        // Abaikan kesalahan saat berhenti berlangganan
      }
    }
  }
}

/**
 * Menampilkan tepat satu layar utama ("checking" | "config-error" | "login" | "app")
 * sehingga saat belum login, sidebar dan header sama sekali tidak tampil (Aturan #5).
 * @param {"checking" | "config-error" | "login" | "app"} namaLayar
 */
function tampilkanLayarUtama(namaLayar) {
  const layarChecking = document.getElementById("screen-checking");
  const layarConfigError = document.getElementById("screen-config-error");
  const layarLogin = document.getElementById("screen-login");
  const layarApp = document.getElementById("app-shell");

  if (layarChecking) layarChecking.hidden = namaLayar !== "checking";
  if (layarConfigError) layarConfigError.hidden = namaLayar !== "config-error";
  if (layarLogin) layarLogin.hidden = namaLayar !== "login";
  if (layarApp) layarApp.hidden = namaLayar !== "app";

  if (namaLayar !== "app") {
    tutupDrawerMobile(false);
    tutupDialogKeluar(false);
  }
}

/**
 * Menampilkan atau menyembunyikan kotak pesan galat di layar login.
 * @param {string} pesan
 */
function setPesanGalatLogin(pesan) {
  const kotak = document.getElementById("login-error-box");
  const teks = document.getElementById("login-error-text");
  if (!kotak || !teks) return;

  if (pesan && pesan.trim()) {
    teks.textContent = pesan.trim();
    kotak.hidden = false;
  } else {
    teks.textContent = "";
    kotak.hidden = true;
  }
}

/**
 * Menampilkan tanggal hari ini secara ramah di header menggunakan util-tanggal.js.
 */
function perbaruiTanggalHeader() {
  const el = document.getElementById("header-date-text");
  if (!el) return;
  const isoLokal = hariIni();
  const tgl = parseTanggal(isoLokal);
  if (!tgl) {
    el.textContent = isoLokal;
    return;
  }
  const hari = NAMA_HARI[tgl.getDay()];
  const tanggal = tgl.getDate();
  const bulan = NAMA_BULAN[tgl.getMonth()];
  const tahun = tgl.getFullYear();
  el.textContent = `${hari}, ${tanggal} ${bulan} ${tahun}`;
}

/**
 * Memeriksa status kedaluwarsa access token Google Drive (50 menit)
 * dan menampilkan pita "Masuk ulang" jika token kedaluwarsa atau belum tersedia.
 */
function periksaStatusTokenDrive() {
  const banner = document.getElementById("token-expired-banner");
  if (!banner) return;
  banner.hidden = !isDriveTokenExpired();
}

function mulaiPemantauTokenDrive() {
  hentikanPemantauTokenDrive();
  periksaStatusTokenDrive();
  tokenCheckIntervalId = window.setInterval(periksaStatusTokenDrive, 30 * 1000);
}

function hentikanPemantauTokenDrive() {
  if (tokenCheckIntervalId !== null) {
    window.clearInterval(tokenCheckIntervalId);
    tokenCheckIntervalId = null;
  }
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = true;
}

/**
 * Menampilkan pemberitahuan status koneksi internet (offline/online).
 */
function perbaruiIndikatorJaringan() {
  const offlineBanner = document.getElementById("offline-banner");
  if (!offlineBanner) return;
  offlineBanner.hidden = navigator.onLine;
}

/**
 * Membuka dialog konfirmasi "Keluar dari aplikasi?" (tanpa window.confirm karena batasan iFrame/PWA).
 */
function bukaDialogKeluar() {
  const modal = document.getElementById("logout-confirm-modal");
  const btnBatal = document.getElementById("logout-cancel-btn");
  if (!modal) return;

  focusBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  logoutDialogOpen = true;
  modal.hidden = false;

  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) {
      btnBatal.focus();
    }
  });
}

/**
 * Menutup dialog konfirmasi keluar.
 * @param {boolean} [kembalikanFokus=true]
 */
function tutupDialogKeluar(kembalikanFokus = true) {
  const modal = document.getElementById("logout-confirm-modal");
  if (!modal || !logoutDialogOpen) return;

  logoutDialogOpen = false;
  modal.hidden = true;

  if (kembalikanFokus && focusBeforeModal && document.contains(focusBeforeModal)) {
    focusBeforeModal.focus();
  }
  focusBeforeModal = null;
}

/**
 * Memasang seluruh event listener untuk login, masuk ulang token, dan konfirmasi keluar.
 */
function pasangEventListenerAntarmuka() {
  const btnLogin = document.getElementById("google-login-btn");
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      setPesanGalatLogin("");
      btnLogin.disabled = true;
      btnLogin.setAttribute("aria-busy", "true");
      const labelEl = btnLogin.querySelector(".btn-google-label");
      const teksAwal = labelEl ? labelEl.textContent : "Masuk dengan Google";
      if (labelEl) labelEl.textContent = "Menghubungkan ke Google...";

      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
      } catch (err) {
        const pesanTertunda = consumeLastAuthError();
        setPesanGalatLogin(pesanTertunda || formatPesanGalatAuth(err));
      } finally {
        btnLogin.disabled = false;
        btnLogin.removeAttribute("aria-busy");
        if (labelEl) labelEl.textContent = teksAwal;
      }
    });
  }

  const btnRelogin = document.getElementById("relogin-drive-btn");
  if (btnRelogin) {
    btnRelogin.addEventListener("click", async () => {
      btnRelogin.disabled = true;
      const teksAwal = btnRelogin.textContent;
      btnRelogin.textContent = "Memuat...";
      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
      } catch (err) {
        const bannerText = document.getElementById("token-expired-text");
        if (bannerText) {
          bannerText.textContent = `Gagal memperbarui sesi Drive: ${escapeHtml(formatPesanGalatAuth(err))}`;
        }
      } finally {
        btnRelogin.disabled = false;
        btnRelogin.textContent = teksAwal;
      }
    });
  }

  const modalLogout = document.getElementById("logout-confirm-modal");
  const btnBatalLogout = document.getElementById("logout-cancel-btn");
  const btnKonfirmasiLogout = document.getElementById("logout-confirm-btn");

  if (btnBatalLogout) {
    btnBatalLogout.addEventListener("click", () => tutupDialogKeluar(true));
  }

  if (modalLogout) {
    modalLogout.addEventListener("click", (e) => {
      if (e.target === modalLogout) {
        tutupDialogKeluar(true);
      }
    });
  }

  if (btnKonfirmasiLogout) {
    btnKonfirmasiLogout.addEventListener("click", async () => {
      btnKonfirmasiLogout.disabled = true;
      try {
        tutupDialogKeluar(false);
        hentikanSemuaLanggananData();
        hentikanPemantauTokenDrive();
        await logoutUser();
      } catch (err) {
        setPesanGalatLogin(formatPesanGalatAuth(err));
      } finally {
        btnKonfirmasiLogout.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!logoutDialogOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupDialogKeluar(true);
      return;
    }
    if (e.key === "Tab" && modalLogout) {
      const tombol = Array.from(modalLogout.querySelectorAll("button:not([disabled])"));
      if (tombol.length === 0) return;
      const pertama = tombol[0];
      const terakhir = tombol[tombol.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    }
  });

  window.addEventListener("online", perbaruiIndikatorJaringan);
  window.addEventListener("offline", perbaruiIndikatorJaringan);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !document.getElementById("app-shell")?.hidden) {
      periksaStatusTokenDrive();
      perbaruiTanggalHeader();
    }
  });
}

let deferredInstallPrompt = null;

/**
 * Mengelola tombol "Pasang Aplikasi" untuk PWA (beforeinstallprompt & panduan iOS Safari).
 */
function initPwaInstallPrompt() {
  const btnInstall = document.getElementById("pwa-install-btn");
  const iosModal = document.getElementById("ios-install-modal");
  const btnTutupIos = document.getElementById("ios-install-close-btn");
  if (!btnInstall) return;

  const sedangStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  if (sedangStandalone) {
    btnInstall.hidden = true;
    return;
  }

  const ua = window.navigator.userAgent.toLowerCase();
  const perangkatIos = /iphone|ipad|ipod/.test(ua);

  if (perangkatIos) {
    btnInstall.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstall.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    btnInstall.hidden = true;
  });

  btnInstall.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const pilihan = await deferredInstallPrompt.userChoice;
      if (pilihan && pilihan.outcome === "accepted") {
        btnInstall.hidden = true;
      }
      deferredInstallPrompt = null;
    } else if (perangkatIos && iosModal) {
      iosModal.hidden = false;
      if (btnTutupIos instanceof HTMLElement) {
        btnTutupIos.focus();
      }
    }
  });

  if (btnTutupIos && iosModal) {
    btnTutupIos.addEventListener("click", () => {
      iosModal.hidden = true;
      btnInstall.focus();
    });
    iosModal.addEventListener("click", (e) => {
      if (e.target === iosModal) {
        iosModal.hidden = true;
        btnInstall.focus();
      }
    });
  }
}

/**
 * Mendaftarkan Service Worker PWA setelah event load dengan penanganan galat (Spesifikasi Bagian 5).
 */
function daftarkanServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (err) {
      console.warn("Pendaftaran Service Worker gagal:", err);
    }
  });
}

/**
 * Inisialisasi Aplikasi Fondasi (Fase 0).
 */
function mulaiAplikasi() {
  initTema();
  daftarkanServiceWorker();
  initPwaInstallPrompt();

  // Tampilkan informasi pemilik terotorisasi pada layar galat konfigurasi jika diperlukan
  const ownerBadge = document.getElementById("authorized-owner-email");
  if (ownerBadge) {
    ownerBadge.textContent = AUTHORIZED_EMAIL;
  }

  // Aturan #1: Jika placeholder di firebase-config.js belum diganti, tampilkan layar galat panduan
  if (!isFirebaseConfigured()) {
    tampilkanLayarUtama("config-error");
    return;
  }

  // Aturan #5: Awalnya tampilkan "Memeriksa sesi masuk..." sampai status diketahui
  tampilkanLayarUtama("checking");

  initSidebar({
    onLogoutRequest: () => bukaDialogKeluar()
  });

  pasangEventListenerAntarmuka();
  perbaruiTanggalHeader();
  perbaruiIndikatorJaringan();

  try {
    initAuth((user, _token) => {
      // Hentikan langganan Firestore lama setiap kali status autentikasi berubah (Aturan #5)
      hentikanSemuaLanggananData();

      if (!user) {
        hentikanPemantauTokenDrive();
        perbaruiInfoAkunSidebar(null);
        const pesanPenolakan = consumeLastAuthError();
        if (pesanPenolakan) {
          setPesanGalatLogin(pesanPenolakan);
        }
        tampilkanLayarUtama("login");
        return;
      }

      setPesanGalatLogin("");
      perbaruiInfoAkunSidebar(user);
      perbaruiTanggalHeader();
      tampilkanLayarUtama("app");
      mulaiPemantauTokenDrive();
    });
  } catch (err) {
    setPesanGalatLogin(formatPesanGalatAuth(err));
    tampilkanLayarUtama("login");
  }
}

mulaiAplikasi();
