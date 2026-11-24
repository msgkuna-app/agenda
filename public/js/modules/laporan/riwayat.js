/**
 * Riwayat Laporan (2026-11-25: pecahan dari state.js)
 *
 * Riwayat laporan yang tersimpan di Firestore: penyimpanan entri baru, langganan
 * realtime, serta hapus lunak, pulihkan, dan hapus permanen. Laporan tidak
 * memiliki berkas Drive, sehingga seluruh operasi cukup menyentuh Firestore.
 */
import { KOLEKSI } from "../../config/constants.js";
import {
  langgananKoleksi,
  tambahItem,
  perbaruiItem,
  hapusItem
} from "../../services/firestoreRepository.js";

let unsubscribeSnapshotLaporan = null;
let daftarRiwayatLaporan = [];
let riwayatSudahDimuat = false;

/**
 * Fase 6 Bagian C1: Mengekspor akses metadata riwayat laporan dari memori/langganan tunggal.
 */
export function getDaftarLaporan() {
  // Sejak Tahap D langgananRiwayatLaporan sudah menyaring where("dihapusAt", "==", null),
  // sehingga daftar hanya berisi riwayat aktif. Penyaring lokal ini dipertahankan sebagai
  // jaring pengaman untuk sisa data dari sesi sebelum pembaruan.
  return daftarRiwayatLaporan.filter((item) => !item.dihapusAt).map((item) => ({ ...item }));
}

export function isLaporanSudahDimuat() {
  return riwayatSudahDimuat;
}

export async function simpanRiwayatLaporan({
  nama,
  jenis,
  jenisLabel,
  tautan,
  sheetId,
  rentangTanggal,
  tanggalDari: dari,
  tanggalSampai: sampai,
  jumlahBaris
}) {
  await tambahItem(KOLEKSI.LAPORAN, {
    nama,
    jenis,
    jenisLabel,
    tautan,
    sheetId,
    rentangTanggal,
    tanggalDari: dari,
    tanggalSampai: sampai,
    jumlahBaris,
    createdAt: new Date().toISOString(),
    // Riwayat baru wajib memuat dihapusAt = null: kueri aktif memakai
    // where("dihapusAt", "==", null), yang TIDAK cocok untuk dokumen tanpa field ini.
    dihapusAt: null
  });
}

/**
 * Hapus lunak riwayat laporan: menulis dihapusAt + updatedAt saja.
 * Laporan tidak memiliki berkas Drive, sehingga pulihkan dan hapus permanen
 * cukup menyentuh Firestore.
 *
 * Jalur hapus permanen tidak punya pintu langsung (tanpa lewat Tempat Sampah) dan
 * tidak lagi disediakan: seluruh penghapusan harus melewati hapus lunak agar
 * item dapat dipulihkan dalam 30 hari.
 */
export async function hapusLunakRiwayatLaporan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID riwayat laporan tidak valid.");
  const sekarang = new Date().toISOString();
  await perbaruiItem(KOLEKSI.LAPORAN, targetId, {
    dihapusAt: sekarang,
    updatedAt: sekarang,
  });
  daftarRiwayatLaporan = daftarRiwayatLaporan.filter((item) => item.id !== targetId);
}

/** Pulihkan riwayat laporan dari Tempat Sampah. */
export async function pulihkanRiwayatLaporan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID riwayat laporan tidak valid.");
  await perbaruiItem(KOLEKSI.LAPORAN, targetId, {
    dihapusAt: null,
    updatedAt: new Date().toISOString(),
  });
  daftarRiwayatLaporan = daftarRiwayatLaporan.filter((item) => item.id !== targetId);
}

/** Hapus permanen riwayat laporan (tanpa berkas Drive). */
export async function hapusPermanenRiwayatLaporan(item) {
  const targetId = String(item && item.id ? item.id : item || "").trim();
  if (!targetId) throw new Error("ID riwayat laporan tidak valid.");
  await hapusItem(KOLEKSI.LAPORAN, targetId);
  daftarRiwayatLaporan = daftarRiwayatLaporan.filter((laporan) => laporan.id !== targetId);
}

/**
 * Berlangganan koleksi riwayat laporan. Sejak Tahap D kueri menyaring
 * where("dihapusAt", "==", null), sehingga riwayat di Tempat Sampah tidak terbaca;
 * urutan tetap bebas karena pengurutan dilakukan saat render.
 * @param {{ onData?: () => void, onGalat?: (err: unknown) => void }} opsi
 */
export function langgananRiwayatLaporan(opsi = {}) {
  unsubscribeSnapshotLaporan = langgananKoleksi(
    KOLEKSI.LAPORAN,
    { filter: [["dihapusAt", "==", null]] },
    {
      onData: (items) => {
        daftarRiwayatLaporan = items.map((d) => ({
          id: d.id,
          nama: String(d.nama || ""),
          jenis: String(d.jenis || "kegiatan"),
          jenisLabel: String(d.jenisLabel || ""),
          tautan: String(d.tautan || ""),
          sheetId: String(d.sheetId || ""),
          rentangTanggal: String(d.rentangTanggal || ""),
          tanggalDari: String(d.tanggalDari || ""),
          tanggalSampai: String(d.tanggalSampai || ""),
          jumlahBaris: Number.isFinite(Number(d.jumlahBaris)) ? Number(d.jumlahBaris) : 0,
          createdAt: String(d.createdAt || ""),
          dihapusAt: d.dihapusAt || null
        }));
        riwayatSudahDimuat = true;
        if (typeof opsi.onData === "function") opsi.onData();
      },
      onGalat: (err) => {
        riwayatSudahDimuat = true;
        if (typeof opsi.onGalat === "function") opsi.onGalat(err);
        if (typeof opsi.onData === "function") opsi.onData();
      }
    }
  );
}

export function lepasLanggananRiwayatLaporan() {
  if (typeof unsubscribeSnapshotLaporan === "function") {
    try { unsubscribeSnapshotLaporan(); } catch (_e) {}
    unsubscribeSnapshotLaporan = null;
  }
  daftarRiwayatLaporan = [];
  riwayatSudahDimuat = false;
  // Catatan: cache data sumber TIDAK direset di sini agar paritas perilaku
  // dengan laporan.js asli terjaga (unsubscribeLaporan lama hanya mereset riwayat).
}
