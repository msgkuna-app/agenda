/**
 * Konfigurasi Firebase Web SDK & Inisialisasi Layanan (Fase 1 + Optimalisasi Pembacaan Fase 5)
 * Memakai Firebase Web SDK modular v11.4.0 dari CDN gstatic.
 * Salin nilai konfigurasi aplikasi web Anda dari Firebase Console:
 * Project Settings -> General -> Your apps -> SDK setup and configuration (Config)
 */
import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  endAt,
  endBefore,
  writeBatch,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBtYgsCoZk5F1HpBHKCIuHIl0XIAQgcqqU",
  authDomain: "msgkuna-app-85dfb.firebaseapp.com",
  projectId: "msgkuna-app-85dfb",
  storageBucket: "msgkuna-app-85dfb.firebasestorage.app",
  messagingSenderId: "641787111254",
  appId: "1:641787111254:web:20e40d4bc939bc118298f7",
  measurementId: "G-D0MXGTSEBC"
};

export const PLACEHOLDER_MARKER = "ISI_DARI_FIREBASE_CONSOLE";

/**
 * Memeriksa apakah firebaseConfig sudah diisi dengan nilai asli (bukan placeholder/kosong).
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  if (!firebaseConfig || typeof firebaseConfig !== "object") {
    return false;
  }
  const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
  for (const key of requiredKeys) {
    const val = String(firebaseConfig[key] || "").trim();
    if (!val || val.includes(PLACEHOLDER_MARKER)) {
      return false;
    }
  }
  return true;
}

let cachedApp = null;
let cachedAuth = null;
let cachedDb = null;

/**
 * Menginisialisasi atau mengambil instance FirebaseApp.
 */
export function getFirebaseApp() {
  if (cachedApp) return cachedApp;
  if (!isFirebaseConfigured()) {
    throw new Error("Konfigurasi Firebase belum diisi di public/js/firebase-config.js.");
  }
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return cachedApp;
}

/**
 * Mengambil instance Firebase Authentication.
 */
export function getFirebaseAuth() {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}

/**
 * Mengambil instance Cloud Firestore dengan persistensi luring (offline persistence).
 */
export function getFirestoreDb() {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  try {
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (_err) {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}

/**
 * Menerjemahkan galat Firestore ke pesan Bahasa Indonesia yang jelas (Aturan #10).
 * @param {unknown} err
 * @returns {string}
 */
export function formatPesanGalatFirestore(err) {
  const kode = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (kode === "permission-denied") {
    return "Akses ditolak oleh aturan keamanan Firestore (permission-denied). Pastikan Anda masuk dengan akun pemilik yang sah.";
  }
  if (kode === "unavailable" || !navigator.onLine) {
    return "Layanan tidak terjangkau karena perangkat sedang luring (offline). Periksa koneksi internet Anda.";
  }
  if (kode === "failed-precondition") {
    return "Operasi gagal diproses oleh Firestore (failed-precondition). Pastikan indeks atau koneksi tersedia.";
  }
  if (kode === "not-found") {
    return "Data yang diminta tidak ditemukan atau sudah dihapus.";
  }
  if (kode === "unauthenticated") {
    return "Sesi autentikasi telah berakhir. Silakan masuk kembali.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Terjadi kesalahan saat berkomunikasi dengan penyimpanan data Firestore.";
}

export {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  endAt,
  endBefore,
  writeBatch,
  getCountFromServer
};
