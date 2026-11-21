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
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  formatPesanGalatFirestore,
} from "../../services/firestoreService.js";

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
    mimeType: String(d.mimeType || ""),
    ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
    catatan: String(d.catatan || ""),
    createdAt: String(d.createdAt || ""),
    updatedAt: String(d.updatedAt || ""),
  };
}

export function getDaftarFoto() {
  return Array.from(petaFoto.values())
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
    mimeType: String(data.mimeType || ""),
    ukuran: Number(data.ukuran) || 0,
    catatan: String(data.catatan || ""),
    createdAt: sekarang,
    updatedAt: sekarang,
  });
  return ref.id;
}

/**
 * Menghapus dokumen foto dari Firestore. Berkas di Drive TIDAK dihapus di sini —
 * controller yang memindahkan berkas ke tempat sampah Drive.
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
 * Memasang listener realtime daftar foto (terbaru lebih dulu).
 * @param {{ onGalat?: (pesan: string) => void }} [opsi]
 */
export function langgananFoto(opsi = {}) {
  sudahDimuatPertamaKali = false;
  beritahuPerubahanFoto();

  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.FOTO),
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
