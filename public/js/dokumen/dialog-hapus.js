/**
 * Modul Dialog Hapus Dokumen
 * Menangani modal konfirmasi penghapusan berkas (aplikasi saja vs Google Drive Sampah) (Fase 7C)
 */
import { getFirestoreDb, doc, deleteDoc } from "../firebase-config.js";
import { pindahkanItemKeSampahDrive, formatPesanGalatDrive } from "../drive.js";
import { stateDokumen, beritahuPerubahanDokumen } from "./state.js";
import { formatUkuranBerkas } from "./util.js";

/**
 * Menampilkan pesan galat pada modal konfirmasi hapus dokumen.
 * @param {string} pesan
 */
export function setPesanGalatModalHapus(pesan) {
  const box = document.getElementById("dokumen-delete-alert");
  const txt = document.getElementById("dokumen-delete-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

/**
 * Membuka modal konfirmasi hapus dokumen.
 * @param {Object} item
 */
export function bukaDialogHapusDokumen(item) {
  const modal = document.getElementById("dokumen-delete-modal");
  const desc = document.getElementById("dokumen-delete-desc");
  const radioAppOnly = document.getElementById("dokumen-delete-mode-app");
  const radioDrive = document.getElementById("dokumen-delete-mode-drive");
  const cancelBtn = document.getElementById("dokumen-delete-cancel-btn");
  if (!modal || !item) return;

  stateDokumen.fokusSebelumModalDokumen =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stateDokumen.dokumenAkanDihapus = item;
  setPesanGalatModalHapus("");

  const label = item.namaTampilan || item.namaFile || "dokumen ini";
  if (desc) {
    desc.textContent = `Pilih cara menghapus "${label}" (${formatUkuranBerkas(item.ukuran)}):`;
  }
  if (radioAppOnly instanceof HTMLInputElement) {
    radioAppOnly.checked = true;
  }
  if (radioDrive instanceof HTMLInputElement) {
    radioDrive.disabled = !navigator.onLine;
  }

  stateDokumen.hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

/**
 * Menutup dialog konfirmasi hapus dokumen.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupDialogHapusDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-delete-modal");
  if (!modal || !stateDokumen.hapusModalTerbuka) return;
  stateDokumen.hapusModalTerbuka = false;
  stateDokumen.dokumenAkanDihapus = null;
  modal.hidden = true;
  setPesanGalatModalHapus("");

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
 * Menginisialisasi pendengar event untuk dialog hapus dokumen.
 */
export function inisialisasiDialogHapus() {
  const deleteModal = document.getElementById("dokumen-delete-modal");
  const deleteConfirmBtn = document.getElementById("dokumen-delete-confirm-btn");

  document.getElementById("dokumen-delete-cancel-btn")?.addEventListener("click", () => {
    tutupDialogHapusDokumen(true);
  });
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) tutupDialogHapusDokumen(true);
  });

  deleteConfirmBtn?.addEventListener("click", async () => {
    if (!stateDokumen.dokumenAkanDihapus) return;
    const target = stateDokumen.dokumenAkanDihapus;
    const radioTrashDrive = document.getElementById("dokumen-delete-mode-drive");
    const buangKeSampahDrive =
      radioTrashDrive instanceof HTMLInputElement && radioTrashDrive.checked;

    setPesanGalatModalHapus("");
    if (deleteConfirmBtn instanceof HTMLButtonElement) {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = "Menghapus...";
    }

    try {
      if (buangKeSampahDrive && target.driveFileId) {
        if (!navigator.onLine) {
          throw new Error(
            'Tidak ada koneksi internet untuk memindahkan berkas ke Sampah Drive. Pilih "Hapus dari daftar aplikasi saja".'
          );
        }
        try {
          await pindahkanItemKeSampahDrive(target.driveFileId);
        } catch (errDrive) {
          if (!errDrive || !errDrive.isNotFound) {
            throw errDrive;
          }
        }
      }

      const db = getFirestoreDb();
      await deleteDoc(doc(db, "dokumen", target.id));
      stateDokumen.petaDokumenHalaman.delete(target.id);
      stateDokumen.petaDokumenTambahan.delete(target.id);
      tutupDialogHapusDokumen(false);
      beritahuPerubahanDokumen();
    } catch (err) {
      setPesanGalatModalHapus(formatPesanGalatDrive(err));
    } finally {
      if (deleteConfirmBtn instanceof HTMLButtonElement) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = "Hapus Dokumen";
      }
    }
  });
}
