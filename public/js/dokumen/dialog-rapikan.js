/**
 * Modul Dialog Rapikan Dokumen ke Folder Kategori di Google Drive
 * Menangani modal pemeriksaan dan pemindahan berkas massal ke subfolder kategori (Fase 7C)
 */
import { pindahkanBerkasKeFolderDrive, formatPesanGalatDrive } from "../drive.js";
import { stateDokumen, getDaftarDokumen } from "./state.js";
import { manajerKategoriDokumen } from "./data.js";
import { pastikanFolderTujuanKategoriSiap } from "./drive-ops.js";
import { jedaMs, JEDA_RAPIKAN_MS } from "./util.js";

/**
 * Membuka modal pemeriksaan dan perapian dokumen ke subfolder Google Drive.
 */
export function bukaModalRapikanDokumen() {
  const modal = document.getElementById("dokumen-organize-modal");
  const countInfo = document.getElementById("dokumen-organize-total-info");
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const closeBtn = document.getElementById("dokumen-organize-cancel-btn");
  if (!modal) return;

  stateDokumen.fokusSebelumModalDokumen =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stateDokumen.sedangMerapikan = false;
  stateDokumen.batalkanRapikan = false;

  const total = getDaftarDokumen().length;
  if (countInfo) {
    countInfo.textContent = `Terdapat ${total} dokumen tercatat yang akan diperiksa penempatan foldernya.`;
  }
  if (progressBox) progressBox.hidden = true;
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
  if (alertBox) alertBox.hidden = true;
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.hidden = false;
    startBtn.disabled = total === 0 || !navigator.onLine;
    startBtn.textContent = "Mulai Rapikan";
  }
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.textContent = "Tutup";
  }

  stateDokumen.rapikanModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (startBtn && !startBtn.disabled) startBtn.focus();
    else if (closeBtn instanceof HTMLElement) closeBtn.focus();
  });
}

/**
 * Menutup modal rapikan dokumen ke subfolder kategori Google Drive.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupModalRapikanDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-organize-modal");
  if (!modal || !stateDokumen.rapikanModalTerbuka) return;
  if (stateDokumen.sedangMerapikan) {
    stateDokumen.batalkanRapikan = true;
    return;
  }
  stateDokumen.rapikanModalTerbuka = false;
  modal.hidden = true;

  if (
    kembalikanFokus &&
    stateDokumen.fokusSebelumModalDokumen &&
    document.contains(stateDokumen.fokusSebelumModalDokumen)
  ) {
    stateDokumen.fokusSebelumModalDokumen.focus();
  }
  stateDokumen.fokusSebelumModalDokumen = null;
}

/**
 * Menjalankan proses perapian berkas dokumen satu per satu ke folder kategori masing-masing.
 */
export async function jalankanRapikanDokumenKeFolder() {
  if (stateDokumen.sedangMerapikan) return;
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const progressFill = document.getElementById("dokumen-organize-progress-fill");
  const progressText = document.getElementById("dokumen-organize-progress-text");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const alertText = document.getElementById("dokumen-organize-alert-text");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const cancelBtn = document.getElementById("dokumen-organize-cancel-btn");

  const daftar = getDaftarDokumen();
  const total = daftar.length;
  if (total === 0) return;

  stateDokumen.sedangMerapikan = true;
  stateDokumen.batalkanRapikan = false;

  if (alertBox) alertBox.hidden = true;
  if (summaryBox) summaryBox.hidden = true;
  if (progressBox) progressBox.hidden = false;
  if (startBtn instanceof HTMLButtonElement) startBtn.disabled = true;
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.textContent = "Hentikan";

  const cacheFolderTujuan = new Map();
  let berhasilDipindah = 0;
  let dilewatiSudahSesuai = 0;
  let gagalDipindah = 0;
  let pesanGagalTerakhir = "";

  try {
    for (let i = 0; i < total; i += 1) {
      if (stateDokumen.batalkanRapikan) break;

      const ke = i + 1;
      const persen = Math.round((ke / total) * 100);
      if (progressFill instanceof HTMLElement) progressFill.style.width = `${persen}%`;
      if (progressText) progressText.textContent = `${ke} dari ${total}`;

      const dok = daftar[i];
      if (!dok.driveFileId) {
        gagalDipindah += 1;
        continue;
      }

      const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
      const kunciFolder = infoKat.tetap ? "__TANPA_KATEGORI__" : infoKat.id;

      try {
        let folderTujuanId = cacheFolderTujuan.get(kunciFolder);
        if (!folderTujuanId) {
          folderTujuanId = await pastikanFolderTujuanKategoriSiap(infoKat.tetap ? "" : infoKat.id);
          cacheFolderTujuan.set(kunciFolder, folderTujuanId);
        }

        const hasil = await pindahkanBerkasKeFolderDrive(dok.driveFileId, folderTujuanId);
        if (hasil.status === "moved") {
          berhasilDipindah += 1;
        } else {
          dilewatiSudahSesuai += 1;
        }
      } catch (err) {
        gagalDipindah += 1;
        pesanGagalTerakhir = formatPesanGalatDrive(err);
        if (err && (err.isUnauthorized || err.isTokenExpired)) {
          break;
        }
      }

      if (i < total - 1 && !stateDokumen.batalkanRapikan) {
        await jedaMs(JEDA_RAPIKAN_MS);
      }
    }

    if (summaryBox) {
      summaryBox.hidden = false;
      summaryBox.innerHTML = `
        <div class="organize-summary-grid">
          <div class="organize-stat-item">
            <span class="organize-stat-value">${berhasilDipindah}</span>
            <span class="organize-stat-label">Dipindahkan</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${dilewatiSudahSesuai}</span>
            <span class="organize-stat-label">Dilewati (sudah di foldernya)</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${gagalDipindah}</span>
            <span class="organize-stat-label">Gagal</span>
          </div>
        </div>
        ${stateDokumen.batalkanRapikan ? `<p class="organize-note-muted">Proses dihentikan sebelum seluruh dokumen selesai diperiksa.</p>` : ""}
      `;
    }

    if (gagalDipindah > 0 && alertBox && alertText) {
      alertText.textContent = pesanGagalTerakhir || "Sebagian dokumen tidak dapat dipindahkan.";
      alertBox.hidden = false;
    }
  } catch (errFatal) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatDrive(errFatal);
      alertBox.hidden = false;
    }
  } finally {
    stateDokumen.sedangMerapikan = false;
    stateDokumen.batalkanRapikan = false;
    if (startBtn instanceof HTMLButtonElement) {
      startBtn.disabled = !navigator.onLine;
      startBtn.textContent = "Jalankan Lagi";
    }
    if (cancelBtn instanceof HTMLButtonElement) {
      cancelBtn.textContent = "Tutup";
    }
  }
}

/**
 * Menginisialisasi pendengar event untuk modal rapikan dokumen ke Google Drive.
 */
export function inisialisasiDialogRapikan() {
  const organizeModal = document.getElementById("dokumen-organize-modal");
  document.getElementById("dokumen-organize-close-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-cancel-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-start-btn")?.addEventListener("click", () => {
    jalankanRapikanDokumenKeFolder();
  });
  organizeModal?.addEventListener("click", (e) => {
    if (e.target === organizeModal && !stateDokumen.sedangMerapikan) {
      tutupModalRapikanDokumen(true);
    }
  });
}
