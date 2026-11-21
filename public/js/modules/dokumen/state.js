/**
 * State Modul Dokumen (Tahap 3d: dipisah dari dokumen.js)
 * Menyimpan peta dokumen halaman + tambahan, kursor paginasi, dan langganan
 * realtime Firestore. TIDAK boleh menyentuh DOM — perubahan diberitahukan lewat
 * onPerubahanDokumen() dan pembaca memutuskan sendiri kapan me-render.
 */
import { UKURAN_HALAMAN_DOKUMEN, KOLEKSI } from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  formatPesanGalatFirestore,
} from "../../services/firestoreService.js";
import { buatManajerKategori, KATEGORI_DOKUMEN_BAWAAN } from "../../kategori.js";
import { resetCacheDrive } from "../../services/driveService.js";

export const manajerKategoriDokumen = buatManajerKategori({
  namaKoleksiKategori: KOLEKSI.KATEGORI_DOKUMEN,
  namaKoleksiPemakai: KOLEKSI.DOKUMEN,
  labelItemPemakai: "dokumen",
  daftarBawaan: KATEGORI_DOKUMEN_BAWAAN,
  pakaiFolderDrive: true,
});

let unsubscribeSnapshotDokumen = null;
const petaDokumenHalaman = new Map();
const petaDokumenTambahan = new Map();

let lastDocDokumenHalaman = null;
let kursorDokumenTambahan = null;
let adaLebihBanyakDokumenHalaman = false;
let sedangMuatLebihDokumen = false;

let sudahDimuatPertamaKali = false;
const listenersPerubahanDokumen = new Set();

/**
 * Normalisasi satu dokumen Firestore menjadi bentuk yang dipakai seluruh UI.
 * Dipakai oleh listener halaman, paginasi, dan ambil-semua agar bentuknya seragam.
 */
function petakanDokumen(docSnap) {
  const d = docSnap.data() || {};
  return {
    id: docSnap.id,
    namaTampilan: String(d.namaTampilan || d.namaFile || ""),
    namaFile: String(d.namaFile || ""),
    driveFileId: String(d.driveFileId || ""),
    tautan: String(d.tautan || ""),
    mimeType: String(d.mimeType || "application/octet-stream"),
    ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
    kategoriId: String(d.kategoriId || ""),
    kegiatanId: String(d.kegiatanId || ""),
    catatan: String(d.catatan || ""),
    tanggalUnggah: String(d.tanggalUnggah || d.createdAt || ""),
    createdAt: String(d.createdAt || ""),
    updatedAt: String(d.updatedAt || ""),
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
  return Array.from(gabungan.values()).map((d) => ({ ...d }));
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

// --- Pemanggilan Firestore ---------------------------------------------------

/**
 * Fase 5: Menghitung dokumen pemakai kategori secara akurat dari server via getCountFromServer.
 */
export async function hitungDokumenPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    const db = getFirestoreDb();
    if (!target) {
      const q = query(collection(db, KOLEKSI.DOKUMEN), where("kategoriId", "==", ""));
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }
    const q = query(collection(db, KOLEKSI.DOKUMEN), where("kategoriId", "==", target));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (_e) {
    return hitungDokumenPemakaiLokal(target);
  }
}

function hitungDokumenPemakaiLokal(kategoriId) {
  const target = String(kategoriId || "").trim();
  if (!target) {
    return getDaftarDokumen().filter((item) => manajerKategoriDokumen.cariInfoKategori(item.kategoriId).tetap).length;
  }
  return getDaftarDokumen().filter((item) => String(item.kategoriId || "").trim() === target).length;
}

/**
 * Memuat batch dokumen berikutnya (paginasi server).
 * Mengembalikan pesan galat bila gagal; null bila berhasil. Pemanggil yang menampilkan.
 */
export async function muatLebihBanyakDokumen() {
  const kursorAwal = kursorDokumenTambahan || lastDocDokumenHalaman;
  if (sedangMuatLebihDokumen || !kursorAwal) return null;
  sedangMuatLebihDokumen = true;
  beritahuPerubahanDokumen();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, KOLEKSI.DOKUMEN),
      orderBy("tanggalUnggah", "desc"),
      startAfter(kursorAwal),
      limit(UKURAN_HALAMAN_DOKUMEN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      petaDokumenTambahan.set(docSnap.id, petakanDokumen(docSnap));
    });

    if (!snap.empty) {
      kursorDokumenTambahan = snap.docs[snap.docs.length - 1];
    }
    adaLebihBanyakDokumenHalaman = snap.docs.length >= UKURAN_HALAMAN_DOKUMEN;
    return null;
  } catch (err) {
    return formatPesanGalatFirestore(err);
  } finally {
    sedangMuatLebihDokumen = false;
    beritahuPerubahanDokumen();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh dokumen dari server.
 * Digunakan oleh Laporan, Ekspor Cadangan, dan Pencarian Global mendalam.
 */
export async function ambilSemuaDokumenSekaliPakai() {
  const db = getFirestoreDb();
  const q = query(collection(db, KOLEKSI.DOKUMEN), orderBy("tanggalUnggah", "desc"));
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    petaDokumenTambahan.set(docSnap.id, petakanDokumen(docSnap));
  });
  beritahuPerubahanDokumen();
  return getDaftarDokumen();
}

// --- Langganan realtime ------------------------------------------------------

/**
 * Memasang listener realtime 100 dokumen terbaru.
 * @param {{ onGalat?: (pesan: string) => void, onSukses?: () => void }} [opsi]
 */
export function langgananDokumen(opsi = {}) {
  sudahDimuatPertamaKali = false;
  beritahuPerubahanDokumen();

  manajerKategoriDokumen.subscribe(
    () => beritahuPerubahanDokumen(),
    (pesanGalat) => {
      if (typeof opsi.onGalat === "function") opsi.onGalat(pesanGalat);
    }
  );

  const db = getFirestoreDb();
  // Fase 5: Listener dibatasi 100 dokumen terbaru
  const q = query(
    collection(db, KOLEKSI.DOKUMEN),
    orderBy("tanggalUnggah", "desc"),
    limit(UKURAN_HALAMAN_DOKUMEN)
  );

  unsubscribeSnapshotDokumen = onSnapshot(
    q,
    (snapshot) => {
      petaDokumenHalaman.clear();
      snapshot.forEach((docSnap) => {
        petaDokumenHalaman.set(docSnap.id, petakanDokumen(docSnap));
      });

      if (!snapshot.empty) {
        lastDocDokumenHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      if (!kursorDokumenTambahan) {
        adaLebihBanyakDokumenHalaman = snapshot.docs.length >= UKURAN_HALAMAN_DOKUMEN;
      }
      sudahDimuatPertamaKali = true;
      if (typeof opsi.onSukses === "function") opsi.onSukses();
      beritahuPerubahanDokumen();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      if (typeof opsi.onGalat === "function") opsi.onGalat(formatPesanGalatFirestore(err));
      beritahuPerubahanDokumen();
    }
  );
}

/**
 * Melepas listener realtime + langganan kategori dan mengosongkan cache.
 */
export function lepasLanggananDokumen() {
  if (typeof unsubscribeSnapshotDokumen === "function") {
    try {
      unsubscribeSnapshotDokumen();
    } catch (_e) {}
    unsubscribeSnapshotDokumen = null;
  }

  manajerKategoriDokumen.unsubscribe();
  resetCacheDrive();
  petaDokumenHalaman.clear();
  petaDokumenTambahan.clear();
  lastDocDokumenHalaman = null;
  kursorDokumenTambahan = null;
  adaLebihBanyakDokumenHalaman = false;
  sedangMuatLebihDokumen = false;
  sudahDimuatPertamaKali = false;
  beritahuPerubahanDokumen();
}
