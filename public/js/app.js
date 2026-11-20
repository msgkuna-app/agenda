/**
 * Titik Masuk Utama Aplikasi "Agenda & Arsip" (Fase 6: GIS Token Client & Ketahanan PWA + Refaktor Fase 7A)
 * Mengatur sesi masuk, pemantau token GIS Drive, Dashboard, Kegiatan, Jadwal,
 * Dokumen, Catatan, Laporan, Pengaturan, konfirmasi keluar, indikator koneksi, toast, dan Service Worker.
 * Menggunakan util-html.js terpusat untuk escapeHtml, svgIkon, dan nama hari/bulan Indonesia.
 */
import { INTERVAL_CEK_TOKEN_DRIVE_MS } from "./config/constants.js";
import { daftarkanServiceWorker, perbaruiVisibilitasSpandukSw } from "./pwa.js";
import { isFirebaseConfigured } from "./services/firestoreService.js";
import {
  AUTHORIZED_EMAIL,
  initAuth,
  loginWithGoogle,
  logoutUser,
  isDriveTokenExpired,
  mintaTokenDrive,
  consumeLastAuthError,
  formatPesanGalatAuth,
} from "./services/authService.js";
import { initTema } from "./tema.js";
import {
  initSidebar,
  perbaruiInfoAkunSidebar,
  perbaruiStatusKoneksiSidebar,
  tutupDrawerMobile,
  pindahKeBagian,
} from "./sidebar.js";
import { tampilkanToast } from "./shared/toast.js";
import { NAMA_HARI, NAMA_BULAN } from "./util-html.js";
import { hariIni, parseTanggal } from "./util-tanggal.js";
import {
  initHalamanKegiatan,
  subscribeKegiatan,
  unsubscribeKegiatan,
  getDaftarKegiatan,
  bukaModalFormKegiatan,
  daftarkanPembukaDetailKegiatan,
} from "./kegiatan.js";
import {
  initHalamanJadwal,
  renderHalamanJadwal,
  bukaDialogDetailKegiatan,
  resetHalamanJadwalSaatKeluar,
} from "./jadwal.js";
import {
  initHalamanDokumen,
  subscribeDokumen,
  unsubscribeDokumen,
  getDaftarDokumen,
  perbaruiStatusJaringanDokumen,
} from "./dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  initHalamanCatatan,
  subscribeCatatan,
  unsubscribeCatatan,
  getDaftarCatatan,
  tautanAmanGoogleDocs,
  sorotCatatanDiHalaman,
  perbaruiStatusJaringanCatatan,
  daftarkanPembukaDetailKegiatanCatatan,
} from "./catatan.js";
import {
  initHalamanLaporan,
  subscribeLaporan,
  unsubscribeLaporan,
  perbaruiStatusJaringanLaporan,
} from "./laporan.js";
import {
  initHalamanPengaturan,
  segarkanTampilanPengaturan,
  resetHalamanPengaturanSaatKeluar,
  muatPengaturanCadangan,
  muatPengaturanHariLibur,
  bacaPengaturanHariLiburLokal,
  onPerubahanHariLibur,
} from "./pengaturan.js";
import { resetCacheDrive } from "./services/driveService.js";
import {
  initHalamanSampah,
  renderHalamanSampah,
  subscribeSampah,
  unsubscribeSampah,
  resetPembersihanSampah,
} from "./sampah.js";
import {
  initPencarianGlobal,
  bersihkanPencarianGlobal,
} from "./pencarian-global.js";

import {
  initHalamanDashboard,
  renderDashboard,
  renderKartuDokumenDashboard,
} from "./modules/dashboard/index.js";

let dataUnsubscribers = [];
let tokenCheckIntervalId = null;
let logoutDialogOpen = false;
let focusBeforeModal = null;
let statusOnlineTerakhir = navigator.onLine;
const DAFTAR_PUTIH_AKSI_PINTASAN = ["tambah-kegiatan", "catatan-baru"];
let aksiPintasanTertunda = null;
let aksiPintasanSudahDijalankan = false;

function bersihkanParameterAksiUrl() {
  try {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );
  } catch (_err) {}
}

function bacaAksiPintasanDariUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const aksi = params.get("aksi");
    if (aksi && DAFTAR_PUTIH_AKSI_PINTASAN.includes(aksi)) {
      aksiPintasanTertunda = aksi;
    }
    if (params.has("aksi")) {
      bersihkanParameterAksiUrl();
    }
  } catch (_err) {}
}

function jalankanAksiPintasanSetelahLayarTampil() {
  if (aksiPintasanSudahDijalankan || !aksiPintasanTertunda) {
    bersihkanParameterAksiUrl();
    return;
  }
  const aksi = aksiPintasanTertunda;
  aksiPintasanTertunda = null;
  aksiPintasanSudahDijalankan = true;
  bersihkanParameterAksiUrl();

  if (aksi === "tambah-kegiatan") {
    bukaModalFormKegiatan(null, hariIni());
  } else if (aksi === "catatan-baru") {
    pindahKeBagian("catatan");
    requestAnimationFrame(() => {
      const btnTambah = document.getElementById("btn-tambah-catatan-singkat");
      if (btnTambah) {
        btnTambah.click();
      }
    });
  }
}

export function hentikanSemuaLanggananData() {
  unsubscribeKegiatan();
  unsubscribeDokumen();
  unsubscribeCatatan();
  unsubscribeLaporan();
  unsubscribeSampah();
  resetCacheDrive();
  resetHalamanJadwalSaatKeluar();
  resetHalamanPengaturanSaatKeluar();
  resetPembersihanSampah();
  bersihkanPencarianGlobal();
  while (dataUnsubscribers.length > 0) {
    const unsub = dataUnsubscribers.pop();
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (_err) {}
    }
  }
}

function tampilkanLayarUtama(namaLayar) {
  const layarChecking = document.getElementById("screen-checking");
  const layarConfigError = document.getElementById("screen-config-error");
  const layarLogin = document.getElementById("screen-login");
  const layarApp = document.getElementById("app-shell");

  if (layarChecking) {
    layarChecking.hidden = namaLayar !== "checking";
    if (namaLayar === "checking") {
      const cardLoading = document.getElementById("session-loading-card");
      const cardError = document.getElementById("session-error-card");
      if (cardLoading) cardLoading.hidden = false;
      if (cardError) cardError.hidden = true;
    }
  }
  if (layarConfigError) layarConfigError.hidden = namaLayar !== "config-error";
  if (layarLogin) layarLogin.hidden = namaLayar !== "login";
  if (layarApp) layarApp.hidden = namaLayar !== "app";

  if (namaLayar !== "checking" && typeof window.__selesaiPemeriksaanSesi === "function") {
    window.__selesaiPemeriksaanSesi();
  }

  if (namaLayar !== "app") {
    tutupDrawerMobile(false);
    tutupDialogKeluar(false);
  }

  perbaruiVisibilitasSpandukSw();
}

function setPesanGalatLogin(pesan) {
  const kotak = document.getElementById("login-error-box");
  const teks = document.getElementById("login-error-text");
  if (!kotak || !teks) return;
  const bersih = pesan ? pesan.trim() : "";
  teks.textContent = bersih;
  kotak.hidden = !bersih;
}

function perbaruiTanggalHeader() {
  const el = document.getElementById("header-date-text");
  if (!el) return;
  const isoLokal = hariIni();
  const tgl = parseTanggal(isoLokal);
  el.textContent = tgl
    ? `${NAMA_HARI[tgl.getDay()]}, ${tgl.getDate()} ${NAMA_BULAN[tgl.getMonth()]} ${tgl.getFullYear()}`
    : isoLokal;
}

/* Tahap 3a: blok render & inisialisasi dashboard dipindah ke ./modules/dashboard/. */

/**
 * Memeriksa status token Google Drive di memori.
 * Banner "Masuk ulang" hanya muncul jika token kedaluwarsa atau belum aktif.
 */
function periksaStatusTokenDrive() {
  const banner = document.getElementById("token-expired-banner");
  const teksBanner = document.getElementById("token-expired-text");
  const btnRelogin = document.getElementById("relogin-drive-btn");
  const expired = isDriveTokenExpired();
  const online = navigator.onLine;

  if (banner) banner.hidden = !expired;
  if (expired && teksBanner) {
    teksBanner.textContent = online
      ? "Sesi akses Google Drive telah kedaluwarsa atau belum aktif. Masuk ulang diperlukan sebelum mengakses berkas Drive."
      : "Sesi akses Google Drive sedang tidak aktif. Izin Drive dapat diperbarui kembali setelah perangkat terhubung ke internet.";
  }
  if (btnRelogin instanceof HTMLButtonElement && !btnRelogin.hasAttribute("data-busy")) {
    btnRelogin.disabled = !online;
    btnRelogin.title = online
      ? "Perbarui sesi Google Drive"
      : "Sambungkan ke internet untuk memperbarui izin Google Drive";
  }

  segarkanTampilanPengaturan();
}

function mulaiPemantauTokenDrive() {
  hentikanPemantauTokenDrive();

  // Mencoba meminta token secara senyap saat sesi dimulai (tanpa dialog popup jika izin sudah ada)
  if (navigator.onLine && isDriveTokenExpired()) {
    mintaTokenDrive({ senyap: true })
      .then(() => periksaStatusTokenDrive())
      .catch(() => periksaStatusTokenDrive());
  } else {
    periksaStatusTokenDrive();
  }

  tokenCheckIntervalId = window.setInterval(periksaStatusTokenDrive, INTERVAL_CEK_TOKEN_DRIVE_MS);
}

function hentikanPemantauTokenDrive() {
  if (tokenCheckIntervalId !== null) {
    window.clearInterval(tokenCheckIntervalId);
    tokenCheckIntervalId = null;
  }
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = true;
}

function perbaruiIndikatorJaringan(dariEvent = false) {
  const online = navigator.onLine;
  const offlineBanner = document.getElementById("offline-banner");
  if (offlineBanner) offlineBanner.hidden = online;

  perbaruiStatusKoneksiSidebar(online);
  perbaruiStatusJaringanDokumen();
  perbaruiStatusJaringanCatatan();
  perbaruiStatusJaringanLaporan();
  renderKartuDokumenDashboard();
  periksaStatusTokenDrive();

  if (dariEvent && online !== statusOnlineTerakhir && !document.getElementById("app-shell")?.hidden) {
    tampilkanToast(
      online
        ? "Koneksi internet pulih. Fitur Google Drive dan Sheets aktif kembali."
        : "Perangkat sedang luring. Menampilkan data tersimpan di perangkat.",
      online ? "success" : "warning"
    );
  }
  statusOnlineTerakhir = online;
}

function bukaDialogKeluar(pemicuFokus = null) {
  const modal = document.getElementById("logout-confirm-modal");
  const btnBatal = document.getElementById("logout-cancel-btn");
  if (!modal) return;

  focusBeforeModal =
    pemicuFokus instanceof HTMLElement
      ? pemicuFokus
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : document.getElementById("sidebar-logout-btn");
  logoutDialogOpen = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

function tutupDialogKeluar(kembalikanFokus = true) {
  const modal = document.getElementById("logout-confirm-modal");
  if (!modal || !logoutDialogOpen) return;

  logoutDialogOpen = false;
  modal.hidden = true;
  if (kembalikanFokus) {
    const targetFokus =
      focusBeforeModal && document.contains(focusBeforeModal)
        ? focusBeforeModal
        : document.getElementById("sidebar-logout-btn");
    if (targetFokus instanceof HTMLElement) {
      targetFokus.focus();
    }
  }
  focusBeforeModal = null;
}

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
        aksiPintasanTertunda = null;
        const pesanTertunda = consumeLastAuthError();
        setPesanGalatLogin(pesanTertunda || formatPesanGalatAuth(err));
      } finally {
        btnLogin.disabled = false;
        btnLogin.removeAttribute("aria-busy");
        if (labelEl) labelEl.textContent = teksAwal;
      }
    });
  }

  // Tombol banner "Masuk ulang" untuk memperbarui izin Drive via dialog GIS
  const btnRelogin = document.getElementById("relogin-drive-btn");
  if (btnRelogin) {
    btnRelogin.addEventListener("click", async () => {
      if (!navigator.onLine) {
        tampilkanToast(
          "Tidak dapat memperbarui izin Google Drive saat luring. Sambungkan ke internet terlebih dahulu.",
          "warning"
        );
        return;
      }
      btnRelogin.disabled = true;
      btnRelogin.setAttribute("data-busy", "true");
      const teksAwal = btnRelogin.textContent;
      btnRelogin.textContent = "Memuat...";
      try {
        await mintaTokenDrive({ senyap: false });
        periksaStatusTokenDrive();
        tampilkanToast("Izin akses Google Drive berhasil diperbarui.", "success");
      } catch (err) {
        const bannerText = document.getElementById("token-expired-text");
        if (bannerText)
          bannerText.textContent = `Gagal memperbarui sesi Drive: ${formatPesanGalatAuth(err)}`;
      } finally {
        btnRelogin.removeAttribute("data-busy");
        btnRelogin.disabled = !navigator.onLine;
        btnRelogin.textContent = teksAwal;
      }
    });
  }

  const modalLogout = document.getElementById("logout-confirm-modal");
  const btnBatalLogout = document.getElementById("logout-cancel-btn");
  const btnKonfirmasiLogout = document.getElementById("logout-confirm-btn");

  if (btnBatalLogout)
    btnBatalLogout.addEventListener("click", () => tutupDialogKeluar(true));
  if (modalLogout)
    modalLogout.addEventListener("click", (e) => {
      if (e.target === modalLogout) tutupDialogKeluar(true);
    });

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
      const tombol = Array.from(
        modalLogout.querySelectorAll("button:not([disabled])"),
      );
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

  window.addEventListener("online", () => perbaruiIndikatorJaringan(true));
  window.addEventListener("offline", () => perbaruiIndikatorJaringan(true));
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      !document.getElementById("app-shell")?.hidden
    ) {
      periksaStatusTokenDrive();
      perbaruiTanggalHeader();
      renderDashboard();
      renderHalamanJadwal();
      segarkanTampilanPengaturan();
    }
  });
}

let deferredInstallPrompt = null;

function initPwaInstallPrompt() {
  const btnInstall = document.getElementById("pwa-install-btn");
  const iosModal = document.getElementById("ios-install-modal");
  const btnTutupIos = document.getElementById("ios-install-close-btn");
  if (!btnInstall) return;

  const sedangStandalone =
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (sedangStandalone) {
    btnInstall.hidden = true;
    return;
  }

  const perangkatIos = /iphone|ipad|ipod/.test(
    window.navigator.userAgent.toLowerCase(),
  );
  if (perangkatIos) btnInstall.hidden = false;

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
      if (pilihan && pilihan.outcome === "accepted") btnInstall.hidden = true;
      deferredInstallPrompt = null;
    } else if (perangkatIos && iosModal) {
      iosModal.hidden = false;
      if (btnTutupIos instanceof HTMLElement) btnTutupIos.focus();
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

function mulaiAplikasi() {
  bacaAksiPintasanDariUrl();
  initTema();
  daftarkanServiceWorker();
  initPwaInstallPrompt();

  const ownerBadge = document.getElementById("authorized-owner-email");
  if (ownerBadge) ownerBadge.textContent = AUTHORIZED_EMAIL;

  if (!isFirebaseConfigured()) {
    tampilkanLayarUtama("config-error");
    return;
  }

  tampilkanLayarUtama("checking");

  initSidebar({
    initialSection: "dashboard",
    onLogoutRequest: (pemicu) => bukaDialogKeluar(pemicu),
    onSectionChange: (sectionId) => {
      if (sectionId === "pengaturan") {
        segarkanTampilanPengaturan();
      } else if (sectionId === "sampah") {
        renderHalamanSampah();
      }
    },
  });

  daftarkanPembukaDetailKegiatan(bukaDialogDetailKegiatan);
  daftarkanPembukaDetailKegiatanCatatan(bukaDialogDetailKegiatan);

  bacaPengaturanHariLiburLokal();
  onPerubahanHariLibur(() => {
    renderDashboard();
    renderHalamanJadwal();
    segarkanTampilanPengaturan();
  });

  initHalamanKegiatan();
  initHalamanJadwal();
  initHalamanDokumen();
  initHalamanCatatan();
  initHalamanLaporan();
  initHalamanPengaturan();
  initHalamanSampah();
  initHalamanDashboard();
  pasangEventListenerAntarmuka();
  perbaruiTanggalHeader();
  perbaruiIndikatorJaringan(false);

  try {
    initAuth((user, _token) => {
      hentikanSemuaLanggananData();

      if (!user) {
        hentikanPemantauTokenDrive();
        perbaruiInfoAkunSidebar(null);
        const pesanPenolakan = consumeLastAuthError();
        if (pesanPenolakan) {
          aksiPintasanTertunda = null;
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

      const unsubKegiatan = subscribeKegiatan();
      const unsubDokumen = subscribeDokumen();
      const unsubCatatan = subscribeCatatan();
      const unsubLaporan = subscribeLaporan();
      const unsubSampah = subscribeSampah();
      dataUnsubscribers.push(
        unsubKegiatan,
        unsubDokumen,
        unsubCatatan,
        unsubLaporan,
        unsubSampah,
      );
      initPencarianGlobal({
        getDaftarKegiatan,
        getDaftarCatatan,
        getDaftarDokumen,
        onPilihHasil: (item) => {
          if (!item) return;
          if (item.kelompok === "kegiatan") {
            bukaDialogDetailKegiatan(item.id);
          } else if (item.kelompok === "catatan") {
            if (item.jenis === JENIS_CATATAN_GDOC) {
              const urlDocs = tautanAmanGoogleDocs(item);
              if (urlDocs && urlDocs !== "#") {
                window.open(urlDocs, "_blank", "noopener");
              }
            } else {
              pindahKeBagian("catatan");
              sorotCatatanDiHalaman(item.id);
            }
          } else if (item.kelompok === "dokumen") {
            pindahKeBagian("dokumen");
            const tautanAman =
              item.tautan && /^https?:\/\//i.test(dokumenTautan(item))
                ? item.tautan
                : item.driveFileId
                  ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
                  : "";
            if (tautanAman) {
              window.open(tautanAman, "_blank", "noopener");
            }
          }
        },
      });
      muatPengaturanCadangan();
      muatPengaturanHariLibur().then(() => {
        renderDashboard();
        renderHalamanJadwal();
        segarkanTampilanPengaturan();
      });
      segarkanTampilanPengaturan();
      jalankanAksiPintasanSetelahLayarTampil();
    });
  } catch (err) {
    setPesanGalatLogin(formatPesanGalatAuth(err));
    tampilkanLayarUtama("login");
  }
}

function dokumenTautan(item) {
  return item && typeof item.tautan === "string" ? item.tautan : "";
}

mulaiAplikasi();