/**
 * Konfigurasi Firebase Web SDK & Google Identity Services (GIS)
 * (Fase 6: Pemisahan Token Drive ke GIS)
 * Memuat Firebase App, Auth, dan Firestore modular v11 dari CDN gstatic.
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

/**
 * Konfigurasi Firebase Proyek Anda.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBtYgsCoZk5F1HpBHKCIuHIl0XIAQgcqqU",
  authDomain: "msgkuna-app-85dfb.firebaseapp.com",
  projectId: "msgkuna-app-85dfb",
  storageBucket: "msgkuna-app-85dfb.appspot.com",
  messagingSenderId: "641787111254",
  appId: "1:641787111254:web:20e40d4bc939bc118298f7",
};

/**
 * OAuth 2.0 Web Client ID untuk Google Identity Services (GIS) Token Client.
 * Disarankan menggunakan Client ID yang SAMA dengan yang digunakan Firebase Auth Google Provider
 * agar berkas Google Drive lama (drive.file) tetap dapat diakses.
 */
export const GOOGLE_CLIENT_ID = "641787111254-r1d0co4oi0i6padlerb7nsb15uhemacj.apps.googleusercontent.com";

export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig) &&
    firebaseConfig.apiKey !== "ISI_DARI_FIREBASE_CONSOLE" &&
    firebaseConfig.projectId !== "ISI_DARI_FIREBASE_CONSOLE"
  );
}

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