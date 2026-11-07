/**
 * Modul Dialog Hapus Riwayat Laporan
 * Menangani modal konfirmasi penghapusan catatan riwayat dari Firestore
 * (tanpa menghapus berkas spreadsheet fisik di Google Drive).
 */
import {
  getFirestoreDb,
  doc,
  deleteDoc,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { stateLaporan } from "./state.js";

export function bukaModalHapusRiwayat(idRiwayat) {
  const item = stateLaporan.daftarRiwayatLaporan.find((r) => r.id === idRiwayat);
  const modal = document.getElementById("laporan-delete-modal");
  const desc = document.getElementById("laporan-delete-desc");
  const alertBox = document.getElementById("laporan-delete-alert");
  const btnBatal = document.getElementById("laporan-delete-cancel-btn");
  if (!item || !modal) return;

  stateLaporan.itemRiwayatAkanDihapus = item;
  stateLaporan.hapusRiwayatModalTerbuka = true;
  stateLaporan.fokusSebelumModalLaporan =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (alertBox) alertBox.hidden = true;
  if (desc) {
    desc.textContent = `Catatan "${item.nama || "Laporan"}" akan dihapus dari daftar Riwayat Laporan di aplikasi ini. Berkas spreadsheet asli di Google Drive Anda TIDAK ikut dihapus.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

export function tutupModalHapusRiwayat(kembalikanFokus = true) {
  const modal = document.getElementById("laporan-delete-modal");
  if (!modal || !stateLaporan.hapusRiwayatModalTerbuka) return;

  stateLaporan.hapusRiwayatModalTerbuka = false;
  stateLaporan.itemRiwayatAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && stateLaporan.fokusSebelumModalLaporan && document.contains(stateLaporan.fokusSebelumModalLaporan)) {
    stateLaporan.fokusSebelumModalLaporan.focus();
  }
  stateLaporan.fokusSebelumModalLaporan = null;
}

export async function konfirmasiHapusRiwayatLaporan() {
  if (!stateLaporan.itemRiwayatAkanDihapus) return;
  const btnKonfirmasi = document.getElementById("laporan-delete-confirm-btn");
  const alertBox = document.getElementById("laporan-delete-alert");
  const alertText = document.getElementById("laporan-delete-alert-text");

  if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = true;
  if (alertBox) alertBox.hidden = true;

  try {
    const db = getFirestoreDb();
    await deleteDoc(doc(db, "laporan", stateLaporan.itemRiwayatAkanDihapus.id));
    tutupModalHapusRiwayat(true);
  } catch (err) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatFirestore(err);
      alertBox.hidden = false;
    }
  } finally {
    if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = false;
  }
}