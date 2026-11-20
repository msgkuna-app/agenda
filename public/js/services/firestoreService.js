/**
 * Layanan Firestore & Firebase App/Auth (Tahap 2a: dipindah dari firebase-config.js)
 * - Satu-satunya modul yang memuat Firebase Web SDK modular v11 dari CDN gstatic.
 * - Menyimpan instance App/Auth/Firestore (lazy singleton) dan menyediakan pembuat pesan galat.
 * - SDK Firestore (collection, query, onSnapshot, dst.) di-re-export agar pemanggil tetap memakai
 *   satu pintu; Tahap 3 akan mengganti pemanggilan langsung dengan fungsi CRUD bermakna.
 * Catatan: berkas ini TIDAK boleh mengimpor modul halaman (aturan arah dependensi services -> config).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  getFirestore,
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

import { firebaseConfig, GOOGLE_CLIENT_ID, PLACEHOLDER_GOOGLE_CLIENT_ID, isFirebaseConfigured } from "../config/firebase.js";
export { firebaseConfig, GOOGLE_CLIENT_ID, PLACEHOLDER_GOOGLE_CLIENT_ID, isFirebaseConfigured };

let appInstance = null;
let authInstance = null;
let firestoreInstance = null;

export function getFirebaseApp() {
  if (!appInstance) {
    if (!isFirebaseConfigured()) {
      throw new Error("Konfigurasi Firebase belum diisi.");
    }
    appInstance = initializeApp(firebaseConfig);
  }
  return appInstance;
}

export function getFirebaseAuth() {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export function getFirestoreDb() {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getFirebaseApp());
  }
  return firestoreInstance;
}

export function formatPesanGalatFirestore(err) {
  if (!navigator.onLine) {
    return "Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.";
  }
  const kode = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (kode === "permission-denied") {
    return "Akses basis data ditolak. Pastikan Anda masuk menggunakan akun pemilik resmi.";
  }
  if (kode === "unavailable") {
    return "Layanan Firestore sedang tidak dapat dihubungi. Mencoba kembali secara otomatis...";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Terjadi kendala pada basis data Firestore.";
}

export {
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
};
