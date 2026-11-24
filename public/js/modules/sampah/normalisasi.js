/**
 * Normalisasi Modul Sampah (Tahap B)
 * Mengubah satu Firestore DocumentSnapshot menjadi bentuk baku item Tempat Sampah.
 * Bentuk baku ini yang dipakai view (judul, tanggal, isi) dan controller (id, kunci).
 * Tanpa DOM dan tanpa akses jaringan.
 *
 * Field kunci selalu diisi nama koleksi asal, sehingga view dapat memilih ikon dan
 * label tanpa bergantung pada percabangan tipe.
 */
import { KOLEKSI } from "../../config/constants.js";

/** Bentuk baku satu dokumen kegiatan di Tempat Sampah. */
export function normalkanKegiatan(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    kunci: KOLEKSI.KEGIATAN,
    judul: String(d.judul || ""),
    catatan: String(d.catatan || ""),
    tanggal: String(d.tanggal || ""),
    waktuMulai: String(d.waktuMulai || ""),
    waktuSelesai: String(d.waktuSelesai || ""),
    lokasi: String(d.lokasi || ""),
    kategoriId: String(d.kategoriId || ""),
    status: d.status || "Rencana",
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}

/** Bentuk baku satu dokumen catatan di Tempat Sampah. */
export function normalkanCatatan(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    kunci: KOLEKSI.CATATAN,
    jenis: d.jenis || "singkat",
    judul: String(d.judul || ""),
    isi: String(d.isi || ""),
    kategori: String(d.kategori || ""),
    tag: Array.isArray(d.tag) ? d.tag : [],
    kegiatanId: String(d.kegiatanId || ""),
    templat: String(d.templat || ""),
    docId: String(d.docId || ""),
    tautan: String(d.tautan || ""),
    driveDiSampah: Boolean(d.driveDiSampah),
    disematkan: Boolean(d.disematkan),
    tanggal: String(d.tanggal || ""),
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}

/** Bentuk baku satu dokumen arsip di Tempat Sampah. */
export function normalkanDokumen(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    kunci: KOLEKSI.DOKUMEN,
    judul: String(d.namaTampilan || d.namaFile || ""),
    namaFile: String(d.namaFile || ""),
    driveFileId: String(d.driveFileId || ""),
    mimeType: String(d.mimeType || ""),
    ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
    kategoriId: String(d.kategoriId || ""),
    kegiatanId: String(d.kegiatanId || ""),
    catatan: String(d.catatan || ""),
    tanggal: String(d.tanggalUnggah || d.createdAt || ""),
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}

/** Bentuk baku satu foto kegiatan di Tempat Sampah. */
export function normalkanFoto(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    kunci: KOLEKSI.FOTO,
    judul: String(d.namaFile || ""),
    namaFile: String(d.namaFile || ""),
    driveFileId: String(d.driveFileId || ""),
    kegiatanId: String(d.kegiatanId || ""),
    mimeType: String(d.mimeType || ""),
    ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
    catatan: String(d.catatan || ""),
    tanggal: String(d.createdAt || ""),
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}

/** Bentuk baku satu riwayat laporan di Tempat Sampah. */
export function normalkanLaporan(docSnap) {
  const d = docSnap.data();
  const rentang = String(d.rentangTanggal || "");
  const jumlahBaris = Number.isFinite(Number(d.jumlahBaris)) ? Number(d.jumlahBaris) : 0;
  return {
    id: docSnap.id,
    kunci: KOLEKSI.LAPORAN,
    judul: String(d.nama || ""),
    jenis: String(d.jenis || ""),
    jenisLabel: String(d.jenisLabel || ""),
    tautan: String(d.tautan || ""),
    rentangTanggal: rentang,
    jumlahBaris,
    // Baris keterangan siap tampil: kartu Tempat Sampah tidak perlu tahu cara
    // menyusunnya, cukup menampilkan field ini bila tidak kosong.
    keterangan: [rentang, jumlahBaris > 0 ? `${jumlahBaris} baris` : ""].filter(Boolean).join(" • "),
    tanggal: String(d.tanggalDari || d.createdAt || ""),
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}
