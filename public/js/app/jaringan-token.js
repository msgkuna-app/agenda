/**
 * Modul Jaringan & Token Google Drive (Agenda & Arsip - Fase 7C)
 * Memantau status koneksi online/offline, memvalidasi masa berlaku token Google Drive di memori,
 * dan menampilkan spanduk peringatan/tombol pembaruan sesi GIS saat diperlukan.
 */

import {
  isDriveTokenExpired,
  mintaTokenDrive,
  formatPesanGalatAuth,
} from "../auth.js";
import {
  tampilkanToast,
  perbaruiStatusKoneksiSidebar,
} from "../sidebar.js";
import { segarkanTampilanPengaturan } from "../pengaturan.js";
import { perbaruiStatusJaringanDokumen } from "../dokumen.js";
import { perbaruiStatusJaringanCatatan } from "../catatan.js";
import { perbaruiStatusJaringanLaporan } from "../laporan.js";
import { renderKartuDokumenDashboard } from "./dashboard.js";

let tokenCheckIntervalId = null;
let statusOnlineTerakhir = navigator.onLine;
let tombolDriveSudahDiikat = false;

/**
 * Memeriksa status token Google Drive di memori.
 * Banner "Masuk ulang" hanya muncul jika token kedaluwarsa atau belum aktif.
 */
export function periksaStatusTokenDrive() {
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

export function mulaiPemantauTokenDrive() {
  hentikanPemantauTokenDrive();

  // Mencoba meminta token secara senyap saat sesi dimulai (tanpa dialog popup jika izin sudah ada)
  if (navigator.onLine && isDriveTokenExpired()) {
    mintaTokenDrive({ senyap: true })
      .then(() => periksaStatusTokenDrive())
      .catch(() => periksaStatusTokenDrive());
  } else {
    periksaStatusTokenDrive();
  }

  tokenCheckIntervalId = window.setInterval(periksaStatusTokenDrive, 30 * 1000);
}

export function hentikanPemantauTokenDrive() {
  if (tokenCheckIntervalId !== null) {
    window.clearInterval(tokenCheckIntervalId);
    tokenCheckIntervalId = null;
  }
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = true;
}

export function perbaruiIndikatorJaringan(dariEvent = false) {
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

export function ikatTombolPerbaruiDrive() {
  if (tombolDriveSudahDiikat) return;
  tombolDriveSudahDiikat = true;

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
}