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
  doc,
  updateDoc,
  deleteDoc,
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
import { buatManajerKategori, KATEGORI_DOKUMEN_BAWAAN } from "../kategori/index.js";
import { resetCacheDrive, pindahkanItemKeSampahDrive } from "../../services/driveService.js";

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
    dihapusAt: d.dihapusAt || null,
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

// --- Hapus lunak -------------------------------------------------------------

/**
 * Hapus lunak satu dokumen: hanya menulis dihapusAt + updatedAt.
 * SENGAJA tidak memanggil Drive sama sekali, sehingga berhasil juga saat luring —
 * berbeda dari catatan yang menolak dihapus saat luring. Berkas Drive baru
 * dipindahkan ke Sampah Drive pada hapus permanen (lihat hapusPermanenDokumen).
 */
export async function hapusLunakDokumen(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const db = getFirestoreDb();
  const sekarang = new Date().toISOString();
  await updateDoc(doc(db, KOLEKSI.DOKUMEN, targetId), {
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
  const db = getFirestoreDb();
  await updateDoc(doc(db, KOLEKSI.DOKUMEN, targetId), {
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

  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.DOKUMEN, targetId));
  hapusDokumenDariPeta(targetId);
  beritahuPerubahanDokumen();
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
    // Hanya dokumen aktif yang dihitung: dokumen di Tempat Sampah tidak lagi "memakai"
    // kategori, sejalan dengan dialog Kelola Kategori yang memperingatkan sebelum hapus.
    const q = target
      ? query(
          collection(db, KOLEKSI.DOKUMEN),
          where("kategoriId", "==", target),
          where("dihapusAt", "==", null)
        )
      : query(
          collection(db, KOLEKSI.DOKUMEN),
          where("kategoriId", "==", ""),
          where("dihapusAt", "==", null)
        );
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
      where("dihapusAt", "==", null),
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
    // Sejak Tahap D kueri sudah menyaring dokumen di Tempat Sampah, sehingga jumlah
    // dokumen yang terbaca sama dengan jumlah dokumen aktif yang akan tampil.
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
 * Jembatan sekali pakai untuk mengambil seluruh dokumen aktif dari server.
 * Digunakan oleh Laporan, Ekspor Cadangan, dan Pencarian Global mendalam.
 * Sejak Tahap D kueri menyaring where("dihapusAt", "==", null), sehingga dokumen di
 * Tempat Sampah tidak ikut terbaca. Ini juga yang menjaga aturan "ekspor JSON hanya
 * memuat item aktif" tanpa penyaringan tambahan di pemanggil.
 */
export async function ambilSemuaDokumenSekaliPakai() {
  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.DOKUMEN),
    where("dihapusAt", "==", null),
    orderBy("tanggalUnggah", "desc")
  );
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
  // Fase 5: Listener dibatasi 100 dokumen terbaru. Sejak Tahap D kueri menyaring
  // dokumen di Tempat Sampah, sehingga 100 baris yang terbaca semuanya tampil.
  const q = query(
    collection(db, KOLEKSI.DOKUMEN),
    where("dihapusAt", "==", null),
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
