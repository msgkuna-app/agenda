/**
 * Repositori Firestore (Tahap 2-1; Tahap 2-6: satu-satunya pemuat SDK Firestore)
 *
 * Tujuan: modul fitur tidak lagi menyusun plambing Firestore sendiri
 * (`query(collection(db, …), where(…), orderBy(…))` dan sejenisnya), melainkan
 * memanggil fungsi bermakna di berkas ini. Sejak Tahap 2-6 firestoreService.js
 * tidak lagi me-re-export SDK, sehingga berkas inilah satu-satunya tempat
 * pengambilan SDK Firestore (selain getFirestore di firestoreService.js).
 *
 * Bentuk data: setiap dokumen dikembalikan sebagai objek biasa `{ id, ...data }`,
 * bukan DocumentSnapshot. Pengecualian yang disengaja: `meta.dokumenTerakhir`
 * berisi DocumentSnapshot mentah karena Firestore mensyaratkan kursor itulah
 * (bukan id) untuk `startAfter` pada paginasi.
 *
 * Arah dependensi tetap services -> config; berkas ini tidak boleh mengimpor modul.
 */
import { BATAS_OPERASI_BATCH } from "../config/constants.js";
import { getFirestoreDb } from "./firestoreService.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

/** Ubah DocumentSnapshot menjadi objek biasa; bentuk inilah yang dipakai fitur. */
function jadikanItem(docSnap) {
  return { id: docSnap.id, ...(docSnap.data() || {}) };
}

/**
 * Menyeragamkan opsi urutan menjadi daftar pasangan [field, arah].
 * Menerima: undefined, "tanggal", ["tanggal","desc"], atau
 * [["dihapusAt","asc"],["tanggal","desc"]].
 */
function normalkanUrutan(urutkan) {
  if (!urutkan) return [];
  const daftar = Array.isArray(urutkan) ? urutkan : [urutkan];
  if (daftar.length === 0) return [];
  if (typeof daftar[0] === "string") {
    return [[String(daftar[0]), daftar[1] === "desc" ? "desc" : "asc"]];
  }
  return daftar
    .filter((pasangan) => Array.isArray(pasangan) && pasangan[0])
    .map((pasangan) => [String(pasangan[0]), pasangan[1] === "desc" ? "desc" : "asc"]);
}

/**
 * Menyusun objek Query dari opsi deklaratif.
 * @param {string} namaKoleksi
 * @param {{ filter?: Array<[string, string, unknown]>, urutkan?: unknown, batas?: number, mulaiSetelah?: unknown }} opsi
 */
function bangunKueri(namaKoleksi, opsi = {}) {
  const db = getFirestoreDb();
  const bagian = [collection(db, namaKoleksi)];

  const daftarFilter = Array.isArray(opsi.filter) ? opsi.filter : [];
  daftarFilter.forEach((filter) => {
    if (Array.isArray(filter) && filter[0]) {
      bagian.push(where(String(filter[0]), filter[1] || "==", filter[2]));
    }
  });

  normalkanUrutan(opsi.urutkan).forEach(([field, arah]) => {
    bagian.push(orderBy(field, arah));
  });

  if (opsi.mulaiSetelah) bagian.push(startAfter(opsi.mulaiSetelah));
  const batas = Number(opsi.batas);
  if (Number.isFinite(batas) && batas > 0) bagian.push(limit(batas));

  return query(...bagian);
}

/** Ringkasan hasil pembacaan: dipakai untuk paginasi dan status kosong. */
function susunMeta(snapshot, items) {
  const dokumen = snapshot.docs || [];
  return {
    kosong: dokumen.length === 0,
    jumlah: items.length,
    // true bila snapshot berasal dari cache lokal (belum tersinkron ke server).
    // Dipakai modul kategori untuk menunda seeding kategori bawaan.
    dariCache: Boolean(snapshot.metadata && snapshot.metadata.fromCache),
    dokumenTerakhir: dokumen.length > 0 ? dokumen[dokumen.length - 1] : null,
  };
}

/**
 * Berlangganan satu koleksi secara realtime.
 * @param {string} namaKoleksi
 * @param {object} opsi lihat bangunKueri()
 * @param {{ onData?: (items: Array<object>, meta: object) => void, onGalat?: (err: unknown) => void }} peristiwa
 * @returns {() => void} fungsi berhenti berlangganan
 */
export function langgananKoleksi(namaKoleksi, opsi = {}, peristiwa = {}) {
  const q = bangunKueri(namaKoleksi, opsi);
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(jadikanItem);
      if (typeof peristiwa.onData === "function") {
        peristiwa.onData(items, susunMeta(snapshot, items));
      }
    },
    (err) => {
      if (typeof peristiwa.onGalat === "function") peristiwa.onGalat(err);
    }
  );
}

/**
 * Membaca koleksi satu kali (tanpa langganan).
 * @returns {Promise<{ items: Array<object>, meta: object }>}
 */
export async function ambilDaftar(namaKoleksi, opsi = {}) {
  const snapshot = await getDocs(bangunKueri(namaKoleksi, opsi));
  const items = snapshot.docs.map(jadikanItem);
  return { items, meta: susunMeta(snapshot, items) };
}

/**
 * Membaca satu dokumen. Mengembalikan objek biasa, atau null bila tidak ada.
 */
export async function ambilSatu(namaKoleksi, id) {
  const targetId = String(id || "").trim();
  if (!targetId) return null;
  const db = getFirestoreDb();
  const docSnap = await getDoc(doc(db, namaKoleksi, targetId));
  return docSnap.exists() ? jadikanItem(docSnap) : null;
}

/** Menambah dokumen baru; mengembalikan id yang dibuat Firestore. */
export async function tambahItem(namaKoleksi, data) {
  const db = getFirestoreDb();
  const ref = await addDoc(collection(db, namaKoleksi), data || {});
  return ref.id;
}

/** Menulis dokumen dengan id tertentu. `merge` bawaan true agar tidak menimpa field lain. */
export async function simpanItem(namaKoleksi, id, data, opsi = {}) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const db = getFirestoreDb();
  const gabung = opsi.merge !== false;
  await setDoc(doc(db, namaKoleksi, targetId), data || {}, { merge: gabung });
  return targetId;
}

/** Memperbarui sebagian field dokumen (updateDoc: dokumen wajib sudah ada). */
export async function perbaruiItem(namaKoleksi, id, patch) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, namaKoleksi, targetId), patch || {});
  return targetId;
}

/** Menghapus satu dokumen secara permanen. */
export async function hapusItem(namaKoleksi, id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID dokumen tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, namaKoleksi, targetId));
  return targetId;
}

/**
 * Menghitung jumlah dokumen di server memakai agregasi (getCountFromServer),
 * sehingga tidak membaca dokumen satu per satu.
 * @param {Array<[string, string, unknown]>} [filter]
 * @returns {Promise<number>}
 */
export async function hitungItem(namaKoleksi, filter = []) {
  const q = bangunKueri(namaKoleksi, { filter });
  const agregat = await getCountFromServer(q);
  return agregat.data().count;
}

/**
 * Menjalankan sekumpulan operasi tulis dalam writeBatch, dipotong menjadi
 * beberapa batch agar tidak melampaui BATAS_OPERASI_BATCH (500).
 * @param {Array<{ jenis: "set"|"update"|"hapus", koleksi: string, id: string, data?: object, merge?: boolean }>} operasi
 * @returns {Promise<number>} jumlah operasi yang berhasil dijalankan
 */
export async function jalankanBatch(operasi) {
  const daftar = Array.isArray(operasi) ? operasi.filter(Boolean) : [];
  if (daftar.length === 0) return 0;

  const db = getFirestoreDb();
  for (let i = 0; i < daftar.length; i += BATAS_OPERASI_BATCH) {
    const potongan = daftar.slice(i, i + BATAS_OPERASI_BATCH);
    const batch = writeBatch(db);
    potongan.forEach((op) => {
      const ref = doc(db, op.koleksi, String(op.id));
      if (op.jenis === "hapus") batch.delete(ref);
      else if (op.jenis === "update") batch.update(ref, op.data || {});
      else batch.set(ref, op.data || {}, { merge: op.merge !== false });
    });
    await batch.commit();
  }
  return daftar.length;
}
