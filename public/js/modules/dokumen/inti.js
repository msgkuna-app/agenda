/**
 * Inti State Modul Dokumen (2026-11-25: pecahan dari state.js)
 *
 * Pemilik tunggal state memori modul dokumen: dua peta dokumen (halaman dan
 * tambahan), kursor paginasi, ketiga bendera muat, daftar pemberitahuan
 * perubahan, dan seluruh mutasi (hapus lunak, pulihkan, hapus permanen).
 * TANPA DOM.
 *
 * Berkas ini adalah lapisan dasar modul: `kueri.js` (pembacaan sekali pakai) dan
 * `langganan.js` (langganan realtime) mengimpor state bersama dari sini.
 * `state.js` hanya menjadi pintu re-export agar index.js dan konsumen lain tetap
 * memakai jalur `./state.js` seperti semula.
 */
import { KOLEKSI } from "../../config/constants.js";
import { perbaruiItem, hapusItem } from "../../services/firestoreRepository.js";
import { buatManajerKategori, KATEGORI_DOKUMEN_BAWAAN } from "../kategori/index.js";
import { resetCacheDrive, pindahkanItemKeSampahDrive } from "../../services/driveService.js";

export const manajerKategoriDokumen = buatManajerKategori({
  namaKoleksiKategori: KOLEKSI.KATEGORI_DOKUMEN,
  namaKoleksiPemakai: KOLEKSI.DOKUMEN,
  labelItemPemakai: "dokumen",
  daftarBawaan: KATEGORI_DOKUMEN_BAWAAN,
  pakaiFolderDrive: true,
});

// Cache memori internal dokumen aktif yang telah dimuat
export const petaDokumenHalaman = new Map();
export const petaDokumenTambahan = new Map();

let lastDocDokumenHalaman = null;
let kursorDokumenTambahan = null;
let adaLebihBanyakDokumenHalaman = false;
let sedangMuatLebihDokumen = false;

let sudahDimuatPertamaKali = false;
const listenersPerubahanDokumen = new Set();

/**
 * Normalisasi satu dokumen Firestore (objek biasa { id, ...data } dari
 * services/firestoreRepository.js) menjadi bentuk yang dipakai seluruh UI.
 * Dipakai oleh listener halaman, paginasi, dan ambil-semua agar bentuknya seragam.
 */
export function petakanDokumen(d) {
  const data = d || {};
  return {
    id: data.id,
    namaTampilan: String(data.namaTampilan || data.namaFile || ""),
    namaFile: String(data.namaFile || ""),
    driveFileId: String(data.driveFileId || ""),
    tautan: String(data.tautan || ""),
    mimeType: String(data.mimeType || "application/octet-stream"),
    ukuran: Number.isFinite(Number(data.ukuran)) ? Number(data.ukuran) : 0,
    kategoriId: String(data.kategoriId || ""),
    kegiatanId: String(data.kegiatanId || ""),
    // Hari tempat dokumen ini disimpan pada kegiatan berturutan (Tahap 8b).
    // Kosong berarti hari pertama kegiatan, sehingga data lama tetap terbaca.
    tanggal: String(data.tanggal || ""),
    catatan: String(data.catatan || ""),
    tanggalUnggah: String(data.tanggalUnggah || data.createdAt || ""),
    createdAt: String(data.createdAt || ""),
    updatedAt: String(data.updatedAt || ""),
    dihapusAt: data.dihapusAt || null,
  };
}

// --- Pembacaan ---------------------------------------------------------------

export function getDaftarDokumen() {
  // Salinan dengan updatedAt terbaru menang; bila sama, data listener realtime (Halaman) menang.
  const gabungan = new Map();
  petaDokumenHalaman.forEach((v, k) => gabungan.set(k, v));
  petaDokumenTambahan.forEach((v, k) => {
    const lama = gabungan.get(k);
    if (!lama || String(v.updatedAt || "") > String(lama.updatedAt || "")) gabungan.set(k, v);
  });
  // Sejak Tahap D seluruh kueri Firestore sudah menyaring where("dihapusAt", "==", null),
  // sehingga peta hanya berisi dokumen aktif. Penyaring lokal ini dipertahankan sebagai
  // jaring pengaman untuk sisa peta dari sesi sebelum pembaruan, dan biayanya dapat diabaikan.
  return Array.from(gabungan.values())
    .filter((d) => !d.dihapusAt)
    .map((d) => ({ ...d }));
}

export function isDokumenSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function tandaiDokumenSudahDimuat(nilai = true) {
  sudahDimuatPertamaKali = Boolean(nilai);
}

export function getPenandaHalamanAkhir() {
  return lastDocDokumenHalaman;
}

export function setPenandaHalamanAkhir(kursor) {
  lastDocDokumenHalaman = kursor || null;
}

export function getKursorTambahan() {
  return kursorDokumenTambahan;
}

export function setKursorTambahan(kursor) {
  kursorDokumenTambahan = kursor;
}

export function adaLebihBanyakDokumen() {
  return adaLebihBanyakDokumenHalaman;
}

export function setAdaLebihBanyakDokumen(nilai) {
  adaLebihBanyakDokumenHalaman = Boolean(nilai);
}

export function sedangMemuatLebihDokumen() {
  return sedangMuatLebihDokumen;
}

export function setSedangMemuatLebihDokumen(nilai) {
  sedangMuatLebihDokumen = Boolean(nilai);
}

export function hapusDokumenDariPeta(id) {
  petaDokumenHalaman.delete(id);
  petaDokumenTambahan.delete(id);
}

/** Dipakai langganan.js & lepasLanggananDokumen untuk mengosongkan cache. */
export function kosongkanPetaDokumen() {
  petaDokumenHalaman.clear();
  petaDokumenTambahan.clear();
}

// --- Pemberitahuan perubahan ------------------------------------------------

export function onPerubahanDokumen(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanDokumen.add(listener);
  return () => listenersPerubahanDokumen.delete(listener);
}

export function beritahuPerubahanDokumen() {
  const salinan = getDaftarDokumen();
  const statusMuat = sudahDimuatPertamaKali;
  listenersPerubahanDokumen.forEach((fn) => {
    try {
      fn(salinan, statusMuat);
    } catch (_e) {}
  });
}

// --- Mutasi (Firestore + cache lokal) ----------------------------------------

/**
 * Hapus lunak satu dokumen: hanya menulis dihapusAt + updatedAt.
 * SENGAJA tidak memanggil Drive sama sekali, sehingga berhasil juga saat luring —
 * berbeda dari catatan yang menolak dihapus saat luring. Berkas Drive baru
 * dipindahkan ke Sampah Drive pada hapus permanen (lihat hapusPermanenDokumen).
 */
export async function hapusLunakDokumen(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const sekarang = new Date().toISOString();
  await perbaruiItem(KOLEKSI.DOKUMEN, targetId, {
    dihapusAt: sekarang,
    updatedAt: sekarang,
  });
  hapusDokumenDariPeta(targetId);
  beritahuPerubahanDokumen();
}

/** Pulihkan dokumen dari Tempat Sampah: kembalikan dihapusAt menjadi null. */
export async function pulihkanDokumen(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  await perbaruiItem(KOLEKSI.DOKUMEN, targetId, {
    dihapusAt: null,
    updatedAt: new Date().toISOString(),
  });
  hapusDokumenDariPeta(targetId);
  beritahuPerubahanDokumen();
}

/**
 * Hapus permanen dokumen: pindahkan berkas ke Sampah Google Drive lalu hapus
 * dokumen Firestore. Berkas yang sudah tidak ada di Drive (isNotFound) tidak
 * menghalangi penghapusan metadata.
 *
 * Saat luring metadata TIDAK dihapus (penghapusan ditolak dengan galat): menghapus
 * metadata tanpa memindahkan berkas akan meninggalkan berkas yatim di Google Drive.
 * @param {{ id: string, driveFileId?: string }} item
 */
export async function hapusPermanenDokumen(item) {
  const targetId = String(item && item.id ? item.id : item || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const driveFileId = String((item && item.driveFileId) || "").trim();

  if (driveFileId) {
    if (!navigator.onLine) {
      throw new Error(
        "Tidak ada koneksi internet. Berkas dokumen harus dipindahkan ke Sampah Google Drive lebih dulu; sambungkan perangkat lalu coba lagi."
      );
    }
    try {
      await pindahkanItemKeSampahDrive(driveFileId);
    } catch (errDrive) {
      if (!errDrive || !errDrive.isNotFound) throw errDrive;
    }
  }

  await hapusItem(KOLEKSI.DOKUMEN, targetId);
  hapusDokumenDariPeta(targetId);
  beritahuPerubahanDokumen();
}

/** Dipakai langganan.js saat melepas langganan (mengosongkan cache Drive). */
export function bersihkanCacheDrive() {
  resetCacheDrive();
}
