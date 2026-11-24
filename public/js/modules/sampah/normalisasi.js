/**
 * Normalisasi Modul Sampah (Tahap B; Tahap 2-6: menerima objek biasa)
 * Mengubah satu dokumen Firestore (objek biasa `{ id, ...data }` dari
 * services/firestoreRepository.js) menjadi bentuk baku item Tempat Sampah.
 * Bentuk baku ini yang dipakai view (judul, tanggal, isi) dan controller (id, kunci).
 * Tanpa DOM dan tanpa akses jaringan.
 *
 * Field kunci selalu diisi nama koleksi asal, sehingga view dapat memilih ikon dan
 * label tanpa bergantung pada percabangan tipe.
 */
import { KOLEKSI } from "../../config/constants.js";

/** Bentuk baku satu dokumen kegiatan di Tempat Sampah. */
export function normalkanKegiatan(d) {
  const data = d || {};
  return {
    id: data.id,
    kunci: KOLEKSI.KEGIATAN,
    judul: String(data.judul || ""),
    catatan: String(data.catatan || ""),
    tanggal: String(data.tanggal || ""),
    tanggalSelesai: String(data.tanggalSelesai || ""),
    waktuMulai: String(data.waktuMulai || ""),
    waktuSelesai: String(data.waktuSelesai || ""),
    lokasi: String(data.lokasi || ""),
    kategoriId: String(data.kategoriId || ""),
    status: data.status || "Rencana",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}

/** Bentuk baku satu dokumen catatan di Tempat Sampah. */
export function normalkanCatatan(d) {
  const data = d || {};
  return {
    id: data.id,
    kunci: KOLEKSI.CATATAN,
    jenis: data.jenis || "singkat",
    judul: String(data.judul || ""),
    isi: String(data.isi || ""),
    kategori: String(data.kategori || ""),
    tag: Array.isArray(data.tag) ? data.tag : [],
    kegiatanId: String(data.kegiatanId || ""),
    templat: String(data.templat || ""),
    docId: String(data.docId || ""),
    tautan: String(data.tautan || ""),
    driveDiSampah: Boolean(data.driveDiSampah),
    disematkan: Boolean(data.disematkan),
    tanggal: String(data.tanggal || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}

/** Bentuk baku satu dokumen arsip di Tempat Sampah. */
export function normalkanDokumen(d) {
  const data = d || {};
  return {
    id: data.id,
    kunci: KOLEKSI.DOKUMEN,
    judul: String(data.namaTampilan || data.namaFile || ""),
    namaFile: String(data.namaFile || ""),
    driveFileId: String(data.driveFileId || ""),
    mimeType: String(data.mimeType || ""),
    ukuran: Number.isFinite(Number(data.ukuran)) ? Number(data.ukuran) : 0,
    kategoriId: String(data.kategoriId || ""),
    kegiatanId: String(data.kegiatanId || ""),
    // Hari lampiran pada kegiatan berturutan (Tahap 8b); kosong = hari pertama.
    tanggalLampiran: String(data.tanggal || ""),
    catatan: String(data.catatan || ""),
    tanggal: String(data.tanggalUnggah || data.createdAt || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}

/** Bentuk baku satu foto kegiatan di Tempat Sampah. */
export function normalkanFoto(d) {
  const data = d || {};
  return {
    id: data.id,
    kunci: KOLEKSI.FOTO,
    judul: String(data.namaFile || ""),
    namaFile: String(data.namaFile || ""),
    driveFileId: String(data.driveFileId || ""),
    kegiatanId: String(data.kegiatanId || ""),
    mimeType: String(data.mimeType || ""),
    ukuran: Number.isFinite(Number(data.ukuran)) ? Number(data.ukuran) : 0,
    catatan: String(data.catatan || ""),
    tanggal: String(data.createdAt || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}

/** Bentuk baku satu riwayat laporan di Tempat Sampah. */
export function normalkanLaporan(d) {
  const data = d || {};
  const rentang = String(data.rentangTanggal || "");
  const jumlahBaris = Number.isFinite(Number(data.jumlahBaris)) ? Number(data.jumlahBaris) : 0;
  return {
    id: data.id,
    kunci: KOLEKSI.LAPORAN,
    judul: String(data.nama || ""),
    jenis: String(data.jenis || ""),
    jenisLabel: String(data.jenisLabel || ""),
    tautan: String(data.tautan || ""),
    rentangTanggal: rentang,
    jumlahBaris,
    // Baris keterangan siap tampil: kartu Tempat Sampah tidak perlu tahu cara
    // menyusunnya, cukup menampilkan field ini bila tidak kosong.
    keterangan: [rentang, jumlahBaris > 0 ? `${jumlahBaris} baris` : ""].filter(Boolean).join(" • "),
    tanggal: String(data.tanggalDari || data.createdAt || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}
