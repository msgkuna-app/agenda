/**
 * State Modul Foto (fitur foto kegiatan)
 * Menyimpan peta foto + langganan realtime Firestore koleksi "foto".
 * TIDAK boleh menyentuh DOM — perubahan diberitahukan lewat onPerubahanFoto().
 */
import { UKURAN_HALAMAN_FOTO, KOLEKSI } from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  formatPesanGalatFirestore,
} from "../../services/firestoreService.js";
import { pindahkanItemKeSampahDrive } from "../../services/driveService.js";

const petaFoto = new Map();
let unsubscribeSnapshotFoto = null;
let sudahDimuatPertamaKali = false;
const listenersPerubahanFoto = new Set();

/** Normalisasi satu dokumen foto Firestore menjadi bentuk yang dipakai UI. */
function petakanFoto(docSnap) {
  const d = docSnap.data() || {};
  return {
    id: docSnap.id,
    kegiatanId: String(d.kegiatanId || ""),
    driveFileId: String(d.driveFileId || ""),
    namaFile: String(d.namaFile || ""),
    tautan: String(d.tautan || ""),
    thumbnailLink: String(d.thumbnailLink || ""),
    mimeType: String(d.mimeType || ""),
    ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
    catatan: String(d.catatan || ""),
    createdAt: String(d.createdAt || ""),
    updatedAt: String(d.updatedAt || ""),
    dihapusAt: d.dihapusAt || null,
  };
}

export function getDaftarFoto() {
  // Sejak Tahap D langgananFoto sudah menyaring where("dihapusAt", "==", null), sehingga
  // peta hanya berisi foto aktif. Penyaring lokal ini dipertahankan sebagai jaring
  // pengaman untuk sisa peta dari sesi sebelum pembaruan.
  return Array.from(petaFoto.values())
    .filter((f) => !f.dihapusAt)
    .map((f) => ({ ...f }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function isFotoSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function onPerubahanFoto(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanFoto.add(listener);
  return () => listenersPerubahanFoto.delete(listener);
}

export function beritahuPerubahanFoto() {
  const salinan = getDaftarFoto();
  const statusMuat = sudahDimuatPertamaKali;
  listenersPerubahanFoto.forEach((fn) => {
    try {
      fn(salinan, statusMuat);
    } catch (_err) {}
  });
}

/**
 * Menyimpan metadata satu foto yang sudah diunggah ke Drive.
 * @param {{ kegiatanId: string, driveFileId: string, namaFile: string, tautan: string, mimeType: string, ukuran: number, catatan?: string }} data
 */
export async function simpanMetadataFoto(data) {
  const kegiatanId = String(data?.kegiatanId || "").trim();
  const driveFileId = String(data?.driveFileId || "").trim();
  if (!kegiatanId) throw new Error("Foto harus dikaitkan dengan kegiatan.");
  if (!driveFileId) throw new Error("ID berkas Drive tidak valid.");

  const db = getFirestoreDb();
  const sekarang = new Date().toISOString();
  const ref = await addDoc(collection(db, KOLEKSI.FOTO), {
    kegiatanId,
    driveFileId,
    namaFile: String(data.namaFile || ""),
    tautan: String(data.tautan || ""),
    thumbnailLink: String(data.thumbnailLink || ""),
    mimeType: String(data.mimeType || ""),
    ukuran: Number(data.ukuran) || 0,
    catatan: String(data.catatan || ""),
    createdAt: sekarang,
    updatedAt: sekarang,
    // Foto baru wajib memuat dihapusAt = null: kueri aktif memakai
    // where("dihapusAt", "==", null), yang TIDAK cocok untuk dokumen tanpa field ini.
    dihapusAt: null,
  });
  return ref.id;
}

/**
 * Menghapus dokumen foto dari Firestore tanpa memindahkan berkas Drive.
 * Dipertahankan sebagai jalur "hapus metadata saja"; alur normal memakai
 * hapusLunakFoto (dari tombol hapus) dan hapusPermanenFoto (dari Tempat Sampah).
 */
export async function hapusDokumenFoto(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID foto tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.FOTO, targetId));
  petaFoto.delete(targetId);
  beritahuPerubahanFoto();
}

/**
 * Hapus lunak satu foto: hanya menulis dihapusAt + updatedAt, tanpa menyentuh Drive,
 * sehingga berhasil juga saat luring. Berkas Drive baru dipindahkan ke Sampah Drive
 * pada hapus permanen (hapusPermanenFoto).
 */
export async function hapusLunakFoto(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID foto tidak valid.");
  const db = getFirestoreDb();
  const sekarang = new Date().toISOString();
  await updateDoc(doc(db, KOLEKSI.FOTO, targetId), {
    dihapusAt: sekarang,
    updatedAt: sekarang,
  });
  petaFoto.delete(targetId);
  beritahuPerubahanFoto();
}

/** Pulihkan foto dari Tempat Sampah: kembalikan dihapusAt menjadi null. */
export async function pulihkanFoto(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID foto tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, KOLEKSI.FOTO, targetId), {
    dihapusAt: null,
    updatedAt: new Date().toISOString(),
  });
  petaFoto.delete(targetId);
  beritahuPerubahanFoto();
}

/**
 * Hapus permanen foto: pindahkan berkas ke Sampah Google Drive lalu hapus dokumen
 * Firestore. Berkas yang sudah tidak ada di Drive tidak menghalangi penghapusan
 * metadata.
 *
 * Saat luring metadata TIDAK dihapus (penghapusan ditolak dengan galat): menghapus
 * metadata tanpa memindahkan berkas akan meninggalkan berkas yatim di Google Drive.
 * @param {{ id: string, driveFileId?: string }} item
 */
export async function hapusPermanenFoto(item) {
  const targetId = String(item && item.id ? item.id : item || "").trim();
  if (!targetId) throw new Error("ID foto tidak valid.");
  const driveFileId = String((item && item.driveFileId) || "").trim();

  if (driveFileId) {
    if (!navigator.onLine) {
      throw new Error(
        "Tidak ada koneksi internet. Berkas foto harus dipindahkan ke Sampah Google Drive lebih dulu; sambungkan perangkat lalu coba lagi."
      );
    }
    try {
      await pindahkanItemKeSampahDrive(driveFileId);
    } catch (errDrive) {
      if (!errDrive || !errDrive.isNotFound) throw errDrive;
    }
  }

  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.FOTO, targetId));
  petaFoto.delete(targetId);
  beritahuPerubahanFoto();
}

/**
 * Memasang listener realtime daftar foto (terbaru lebih dulu).
 * @param {{ onGalat?: (pesan: string) => void }} [opsi]
 */
export function langgananFoto(opsi = {}) {
  sudahDimuatPertamaKali = false;
  beritahuPerubahanFoto();

  const db = getFirestoreDb();
  // Sejak Tahap D kueri menyaring foto di Tempat Sampah, sehingga batas UKURAN_HALAMAN_FOTO
  // terpakai seluruhnya oleh foto aktif.
  const q = query(
    collection(db, KOLEKSI.FOTO),
    where("dihapusAt", "==", null),
    orderBy("createdAt", "desc"),
    limit(UKURAN_HALAMAN_FOTO)
  );

  unsubscribeSnapshotFoto = onSnapshot(
    q,
    (snapshot) => {
      petaFoto.clear();
      snapshot.forEach((docSnap) => {
        petaFoto.set(docSnap.id, petakanFoto(docSnap));
      });
      sudahDimuatPertamaKali = true;
      beritahuPerubahanFoto();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      if (typeof opsi.onGalat === "function") opsi.onGalat(formatPesanGalatFirestore(err));
      beritahuPerubahanFoto();
    }
  );
  return () => lepasLanggananFoto();
}

export function lepasLanggananFoto() {
  if (typeof unsubscribeSnapshotFoto === "function") {
    try {
      unsubscribeSnapshotFoto();
    } catch (_err) {}
    unsubscribeSnapshotFoto = null;
  }
  petaFoto.clear();
  sudahDimuatPertamaKali = false;
  beritahuPerubahanFoto();
}
