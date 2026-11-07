/**
 * Modul Sesi & Otentikasi (Agenda & Arsip - Fase 7C)
 * Mengelola pergantian layar utama (checking, config-error, login, app-shell),
 * penanganan pesan kesalahan login, dialog konfirmasi keluar bersyarat,
 * dan pembatalan seluruh langganan data saat pengguna keluar (logout).
 */

import {
  loginWithGoogle,
  logoutUser,
  consumeLastAuthError,
  formatPesanGalatAuth,
} from "../auth.js";
import { tutupDrawerMobile } from "../sidebar.js";
import { unsubscribeKegiatan } from "../kegiatan.js";
import { unsubscribeDokumen } from "../dokumen.js";
import { unsubscribeCatatan } from "../catatan.js";
import { unsubscribeLaporan } from "../laporan.js";
import { unsubscribeSampah, resetPembersihanSampah } from "../sampah.js";
import { resetCacheDrive } from "../drive.js";
import { resetHalamanJadwalSaatKeluar } from "../jadwal.js";
import { resetHalamanPengaturanSaatKeluar } from "../pengaturan.js";
import { bersihkanPencarianGlobal } from "../pencarian-global.js";
import { perbaruiVisibilitasSpandukSw } from "./pwa.js";
import {
  hentikanPemantauTokenDrive,
  periksaStatusTokenDrive,
} from "./jaringan-token.js";
import { batalkanAksiPintasanTertunda } from "./pintasan.js";

let dataUnsubscribers = [];
let logoutDialogOpen = false;
let focusBeforeModal = null;
let tombolLoginSudahDiikat = false;
let dialogKeluarSudahDiikat = false;

export function tambahUnsubscriberData(...unsubs) {
  for (const unsub of unsubs) {
    if (typeof unsub === "function") {
      dataUnsubscribers.push(unsub);
    }
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

export function tampilkanLayarUtama(namaLayar) {
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

export function setPesanGalatLogin(pesan) {
  const kotak = document.getElementById("login-error-box");
  const teks = document.getElementById("login-error-text");
  if (!kotak || !teks) return;
  const bersih = pesan ? pesan.trim() : "";
  teks.textContent = bersih;
  kotak.hidden = !bersih;
}

export function bukaDialogKeluar(pemicuFokus = null) {
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

export function tutupDialogKeluar(kembalikanFokus = true) {
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

export function apakahDialogKeluarTerbuka() {
  return logoutDialogOpen;
}

export function tanganiNavigasiKeyboardDialogKeluar(e) {
  if (!logoutDialogOpen) return;
  const modalLogout = document.getElementById("logout-confirm-modal");

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
}

export function ikatTombolLogin() {
  if (tombolLoginSudahDiikat) return;
  tombolLoginSudahDiikat = true;

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
        batalkanAksiPintasanTertunda();
        const pesanTertunda = consumeLastAuthError();
        setPesanGalatLogin(pesanTertunda || formatPesanGalatAuth(err));
      } finally {
        btnLogin.disabled = false;
        btnLogin.removeAttribute("aria-busy");
        if (labelEl) labelEl.textContent = teksAwal;
      }
    });
  }
}

export function ikatDialogKeluar() {
  if (dialogKeluarSudahDiikat) return;
  dialogKeluarSudahDiikat = true;

  const modalLogout = document.getElementById("logout-confirm-modal");
  const btnBatalLogout = document.getElementById("logout-cancel-btn");
  const btnKonfirmasiLogout = document.getElementById("logout-confirm-btn");

  if (btnBatalLogout) {
    btnBatalLogout.addEventListener("click", () => tutupDialogKeluar(true));
  }
  if (modalLogout) {
    modalLogout.addEventListener("click", (e) => {
      if (e.target === modalLogout) tutupDialogKeluar(true);
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
}