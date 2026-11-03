/**
 * Autentikasi Firebase (Google Popup + Scope Google Drive API) & Inisialisasi Firestore
 * Mematuhi Aturan Kode #1, #2, #3, #4, #5, #8, #10.
 */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export const AUTHORIZED_EMAIL = "msgkuna.app@gmail.com";

const DRIVE_TOKEN_KEY = "agenda_arsip_drive_token";
const DRIVE_TOKEN_TS_KEY = "agenda_arsip_drive_token_ts";
const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 menit

let appInstance = null;
let authInstance = null;
let dbInstance = null;
let authUnsubscribe = null;
let currentUser = null;
let lastAuthError = "";

/**
 * Menyimpan access token Google Drive ke sessionStorage beserta cap waktu.
 * @param {string | null} token
 */
function simpanDriveToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(DRIVE_TOKEN_KEY, token);
      sessionStorage.setItem(DRIVE_TOKEN_TS_KEY, String(Date.now()));
    } else {
      sessionStorage.removeItem(DRIVE_TOKEN_KEY);
      sessionStorage.removeItem(DRIVE_TOKEN_TS_KEY);
    }
  } catch (_err) {
    // Abaikan jika sessionStorage tidak tersedia
  }
}

/**
 * Memeriksa apakah token Google Drive tidak ada atau sudah berusia >= 50 menit.
 * @returns {boolean}
 */
export function isDriveTokenExpired() {
  try {
    const token = sessionStorage.getItem(DRIVE_TOKEN_KEY);
    const tsRaw = sessionStorage.getItem(DRIVE_TOKEN_TS_KEY);
    if (!token || !tsRaw) {
      return true;
    }
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts) || ts <= 0) {
      return true;
    }
    return Date.now() - ts >= TOKEN_MAX_AGE_MS;
  } catch (_err) {
    return true;
  }
}

/**
 * Mengambil access token Google Drive jika masih berlaku (< 50 menit), atau null jika kedaluwarsa.
 * @returns {string | null}
 */
export function getDriveAccessToken() {
  if (isDriveTokenExpired()) {
    return null;
  }
  try {
    return sessionStorage.getItem(DRIVE_TOKEN_KEY);
  } catch (_err) {
    return null;
  }
}

/**
 * Mengambil objek pengguna yang sedang masuk (jika terotorisasi).
 * @returns {import("https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js").User | null}
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Mengambil instance Cloud Firestore yang telah diaktifkan persistensi offline-nya.
 * Dipakai oleh modul data pada fase berikutnya.
 */
export function getDb() {
  ensureFirebaseInitialized();
  return dbInstance;
}

/**
 * Mengambil pesan penolakan/galat autentikasi terakhir (bila ada) lalu mengosongkannya.
 * @returns {string}
 */
export function consumeLastAuthError() {
  const msg = lastAuthError;
  lastAuthError = "";
  return msg;
}

/**
 * Memastikan Firebase App, Auth, dan Firestore (persistensi offline) siap digunakan.
 */
function ensureFirebaseInitialized() {
  if (!isFirebaseConfigured()) {
    const err = new Error("FIREBASE_NOT_CONFIGURED");
    err.code = "app/firebase-not-configured";
    throw err;
  }
  if (!appInstance) {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    try {
      dbInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager()
        })
      });
    } catch (_err) {
      // Jika sudah diinisialisasi sebelumnya atau tab lain aktif, gunakan konfigurasi memori cadangan aman
      try {
        dbInstance = initializeFirestore(appInstance, {});
      } catch (_innerErr) {
        // Biarkan instance yang sudah melekat
      }
    }
  }
}

/**
 * Memeriksa apakah email pengguna cocok dengan AUTHORIZED_EMAIL.
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
function apakahEmailDiizinkan(email) {
  if (typeof email !== "string") return false;
  return email.trim().toLowerCase() === AUTHORIZED_EMAIL.toLowerCase();
}

/**
 * Menerjemahkan kode galat Firebase Auth / jaringan menjadi pesan bahasa Indonesia yang jelas.
 * @param {any} err
 * @returns {string}
 */
export function formatPesanGalatAuth(err) {
  const kode = err && typeof err.code === "string" ? err.code : "";
  if (!navigator.onLine || kode === "auth/network-request-failed") {
    return "Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.";
  }
  if (kode === "auth/popup-closed-by-user") {
    return "Jendela masuk ditutup sebelum proses selesai.";
  }
  if (kode === "auth/popup-blocked") {
    return "Jendela pop-up diblokir oleh peramban. Izinkan pop-up untuk situs ini lalu coba lagi.";
  }
  if (kode === "auth/cancelled-popup-request") {
    return "Permintaan masuk dibatalkan karena ada jendela masuk lain yang sedang dibuka.";
  }
  if (kode === "auth/unauthorized-domain") {
    return "Domain aplikasi ini belum ditambahkan ke Authorized Domains di Firebase Console (Authentication -> Settings).";
  }
  if (kode === "auth/operation-not-allowed") {
    return "Metode masuk Google belum diaktifkan di Firebase Console (Authentication -> Sign-in method).";
  }
  if (kode === "auth/invalid-api-key" || kode.includes("api-key")) {
    return "API Key Firebase tidak valid. Periksa kembali isi js/firebase-config.js.";
  }
  if (err && typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }
  return "Terjadi kendala saat memproses sesi masuk. Silakan coba lagi.";
}

/**
 * Menginisialisasi pemantau status autentikasi.
 * Callback SELALU dipanggil dengan (user, token) setiap status berubah
 * dan sedikitnya sekali setelah status awal diketahui.
 * @param {(user: any, token: string | null) => void} callback
 * @returns {() => void} Fungsi berhenti berlangganan
 */
export function initAuth(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("initAuth memerlukan fungsi callback(user, token).");
  }

  if (typeof authUnsubscribe === "function") {
    authUnsubscribe();
    authUnsubscribe = null;
  }

  ensureFirebaseInitialized();

  let sudahDipanggilAwal = false;

  authUnsubscribe = onAuthStateChanged(
    authInstance,
    async (user) => {
      if (!user) {
        currentUser = null;
        simpanDriveToken(null);
        sudahDipanggilAwal = true;
        callback(null, null);
        return;
      }

      if (!apakahEmailDiizinkan(user.email)) {
        const emailDitolak = String(user.email || "akun ini").trim();
        lastAuthError = `Akses ditolak untuk ${emailDitolak}. Aplikasi pribadi ini hanya dapat diakses oleh ${AUTHORIZED_EMAIL}.`;
        currentUser = null;
        simpanDriveToken(null);
        try {
          await signOut(authInstance);
        } catch (_err) {
          // Pastikan tetap memanggil callback(null, null) meski signOut terkendala
        }
        if (!sudahDipanggilAwal) {
          sudahDipanggilAwal = true;
          callback(null, null);
        }
        return;
      }

      currentUser = user;
      sudahDipanggilAwal = true;
      callback(user, getDriveAccessToken());
    },
    (err) => {
      currentUser = null;
      simpanDriveToken(null);
      lastAuthError = formatPesanGalatAuth(err);
      sudahDipanggilAwal = true;
      callback(null, null);
    }
  );

  return () => {
    if (typeof authUnsubscribe === "function") {
      authUnsubscribe();
      authUnsubscribe = null;
    }
  };
}

/**
 * Masuk menggunakan Google Popup dengan scope drive.file dan pemilihan akun.
 * Juga dipakai untuk tombol "Masuk ulang" saat access token Drive kedaluwarsa.
 * @returns {Promise<{ user: any, token: string | null }>}
 */
export async function loginWithGoogle() {
  ensureFirebaseInitialized();

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(authInstance, provider);
  const user = result.user;

  if (!apakahEmailDiizinkan(user?.email)) {
    const emailDitolak = String(user?.email || "akun ini").trim();
    const pesanTolak = `Akses ditolak untuk ${emailDitolak}. Aplikasi pribadi ini hanya dapat diakses oleh ${AUTHORIZED_EMAIL}.`;
    lastAuthError = pesanTolak;
    simpanDriveToken(null);
    await logoutUser();
    const err = new Error(pesanTolak);
    err.code = "auth/unauthorized-user";
    throw err;
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;
  simpanDriveToken(accessToken);
  currentUser = user;

  return { user, token: accessToken };
}

/**
 * Keluar dari sesi Firebase dan menghapus token Google Drive dari sessionStorage.
 * @returns {Promise<void>}
 */
export async function logoutUser() {
  simpanDriveToken(null);
  currentUser = null;
  if (authInstance) {
    await signOut(authInstance);
  }
}
