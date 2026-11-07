/**
 * Operasi Akun, Sinkronisasi Subfolder Drive, dan Pembaruan Service Worker
 */
import {
  isDriveTokenExpired,
  loginWithGoogle,
  formatPesanGalatAuth
} from "../auth.js";
import { formatPesanGalatDrive } from "../drive.js";
import { urutkanDaftarKategori } from "../kategori.js";
import {
  manajerKategoriDokumen,
  sinkronkanSatuFolderKategoriDokumen
} from "../dokumen.js";
import { periksaPembaruan } from "../app.js";
import { tampilkanToast } from "../sidebar.js";
import { getStatusUiPengaturan, setStatusUiPengaturan } from "./state.js";
import { setUmpanBalikPengaturan, setStatusCekPembaruan } from "./util.js";
import { segarkanTampilanPengaturan } from "./render.js";

export async function tanganiMasukUlangDrivePengaturan() {
  if (!navigator.onLine) {
    const pesanOffline = "Perangkat sedang luring. Sambungkan ke internet terlebih dahulu untuk memperbarui izin Google Drive.";
    setUmpanBalikPengaturan(pesanOffline, "warning");
    tampilkanToast(pesanOffline, "warning");
    return;
  }

  const btn = document.getElementById("btn-settings-relogin-drive");
  if (!(btn instanceof HTMLButtonElement)) return;

  btn.disabled = true;
  btn.setAttribute("data-busy", "true");
  const span = btn.querySelector("span");
  const teksAsli = span ? span.textContent : "Masuk ulang untuk memperbarui izin Drive";
  if (span) span.textContent = "Menghubungkan ke Google...";
  setUmpanBalikPengaturan("");

  try {
    await loginWithGoogle();
    const banner = document.getElementById("token-expired-banner");
    if (banner) banner.hidden = !isDriveTokenExpired();
    segarkanTampilanPengaturan();
    tampilkanToast("Izin akses Google Drive berhasil diperbarui.", "success");
  } catch (err) {
    const pesan = formatPesanGalatAuth(err);
    setUmpanBalikPengaturan(`Gagal memperbarui izin Google Drive: ${pesan}`, "danger");
  } finally {
    btn.removeAttribute("data-busy");
    if (span) span.textContent = teksAsli;
    segarkanTampilanPengaturan();
  }
}

export async function tanganiSinkronkanSemuaFolder() {
  const ui = getStatusUiPengaturan();
  if (ui.sedangSinkronFolder) return;
  if (!navigator.onLine) {
    tampilkanToast("Tidak ada koneksi internet. Sinkronisasi folder memerlukan sambungan aktif.", "warning");
    return;
  }

  const daftarBelum = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori()).filter(
    (k) => !k.folderId || !k.folderSinkron
  );
  if (daftarBelum.length === 0) {
    tampilkanToast("Semua folder kategori dokumen sudah sinkron.", "info");
    return;
  }

  const progWrap = document.getElementById("settings-folder-sync-progress");
  const progLabel = document.getElementById("settings-folder-sync-label");
  const progPct = document.getElementById("settings-folder-sync-pct");
  const progFill = document.getElementById("settings-folder-sync-fill");
  const btnSync = document.getElementById("btn-settings-sync-all-folders");

  setStatusUiPengaturan({ sedangSinkronFolder: true });
  setUmpanBalikPengaturan("");
  if (btnSync instanceof HTMLButtonElement) btnSync.disabled = true;
  if (progWrap) progWrap.hidden = false;

  let sukses = 0;
  let gagal = 0;
  let galatTerakhir = "";

  try {
    for (let i = 0; i < daftarBelum.length; i += 1) {
      const kat = daftarBelum[i];
      const ke = i + 1;
      const pct = Math.round((ke / daftarBelum.length) * 100);
      if (progLabel) progLabel.textContent = `Menyinkronkan "${kat.nama}" (${ke}/${daftarBelum.length})...`;
      if (progPct) progPct.textContent = `${pct}%`;
      if (progFill instanceof HTMLElement) progFill.style.width = `${pct}%`;

      try {
        await sinkronkanSatuFolderKategoriDokumen(kat.id);
        sukses += 1;
      } catch (err) {
        gagal += 1;
        galatTerakhir = formatPesanGalatDrive(err);
      }
    }

    if (gagal === 0) {
      const msg = `Berhasil menyinkronkan seluruh ${sukses} folder kategori dokumen di Google Drive.`;
      setUmpanBalikPengaturan(msg, "success");
      tampilkanToast(msg, "success");
    } else {
      const msg = `${sukses} folder berhasil disinkronkan, ${gagal} gagal (${galatTerakhir}).`;
      setUmpanBalikPengaturan(msg, "warning");
      tampilkanToast(msg, "warning");
    }
  } finally {
    setStatusUiPengaturan({ sedangSinkronFolder: false });
    if (progWrap) progWrap.hidden = true;
    segarkanTampilanPengaturan();
  }
}

export async function tanganiPeriksaPembaruanSw() {
  setUmpanBalikPengaturan("");

  if (!navigator.onLine) {
    setStatusCekPembaruan("Tidak dapat memeriksa saat offline");
    tampilkanToast("Tidak dapat memeriksa saat offline", "warning");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    setStatusCekPembaruan("Peramban ini tidak mendukung Service Worker.");
    return;
  }

  const btn = document.getElementById("btn-settings-check-update");
  const spanBtn = btn ? btn.querySelector("span") : null;
  const labelAwal = spanBtn ? spanBtn.textContent : "Periksa pembaruan";

  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true;
    btn.setAttribute("data-busy", "true");
  }
  if (spanBtn) spanBtn.textContent = "Memeriksa...";
  setStatusCekPembaruan("Memeriksa...");

  try {
    const reg = await periksaPembaruan();
    if (reg && reg.waiting && navigator.serviceWorker.controller) {
      setStatusCekPembaruan("Versi baru Agenda & Arsip tersedia.");
      return;
    }

    setStatusCekPembaruan("Aplikasi sudah versi terbaru");
    tampilkanToast("Aplikasi sudah versi terbaru", "success");
  } catch (_err) {
    if (!navigator.onLine) {
      setStatusCekPembaruan("Tidak dapat memeriksa saat offline");
      tampilkanToast("Tidak dapat memeriksa saat offline", "warning");
    } else {
      setStatusCekPembaruan("Gagal memeriksa pembaruan. Coba lagi beberapa saat.");
    }
  } finally {
    if (spanBtn) spanBtn.textContent = labelAwal;
    if (btn instanceof HTMLButtonElement) {
      btn.removeAttribute("data-busy");
      btn.disabled = false;
    }
    segarkanTampilanPengaturan();
  }
}