/**
 * Modul Autentikasi Firebase & Token Google Drive (Aturan #2, #3, #4, #5, #10)
 * Memakai Firebase Web SDK modular v11 dari CDN gstatic.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirebaseAuth } from "./firebase-config.js";

export const AUTHORIZED_EMAIL = "msgkuna.app@gmail.com";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const STORAGE_TOKEN_KEY = "agenda_arsip_drive_token";
const STORAGE_TOKEN_TS_KEY = "agenda_arsip_drive_token_ts";
const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 menit

let currentUser = null;
let lastAuthErrorMessage = "";
let authListenerUnsub = null;

function simpanTokenDrive(accessToken) {
  if (!accessToken) return;
  try {
    sessionStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    sessionStorage.setItem(STORAGE_TOKEN_TS_KEY, String(Date.now()));
  } catch (_err) {
    // Abaikan kendala sessionStorage
  }
}

function hapusTokenDrive() {
  try {
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_TOKEN_TS_KEY);
  } catch (_err) {
    // Abaikan kendala sessionStorage
  }
}

/**
 * Mengambil access token Google Drive jika tersedia dan belum kedaluwarsa (50 menit).
 * @returns {string | null}
 */
export function getDriveAccessToken() {
  if (isDriveTokenExpired()) {
    return null;
  }
  try {
    return sessionStorage.getItem(STORAGE_TOKEN_KEY);
  } catch (_err) {
    return null;
  }
}

/**
 * Memeriksa apakah token Google Drive kedaluwarsa (> 50 menit) atau belum ada.
 * @returns {boolean}
 */
export function isDriveTokenExpired() {
  try {
    const token = sessionStorage.getItem(STORAGE_TOKEN_KEY);
    const tsRaw = sessionStorage.getItem(STORAGE_TOKEN_TS_KEY);
    if (!token || !tsRaw) return true;
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts >= TOKEN_MAX_AGE_MS;
  } catch (_err) {
    return true;
  }
}

/**
 * Mengembalikan objek pengguna Firebase saat ini (jika sah).
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Mengambil dan mengosongkan pesan penolakan autentikasi terakhir.
 * @returns {string}
 */
export function consumeLastAuthError() {
  const msg = lastAuthErrorMessage;
  lastAuthErrorMessage = "";
  return msg;
}

/**
 * Menerjemahkan galat autentikasi ke Bahasa Indonesia yang jelas (Aturan #10).
 * @param {unknown} err
 * @returns {string}
 */
export function formatPesanGalatAuth(err) {
  if (!navigator.onLine) {
    return "Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.";
  }
  const kode = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (kode === "auth/popup-closed-by-user") {
    return "Jendela masuk Google ditutup sebelum proses selesai.";
  }
  if (kode === "auth/popup-blocked") {
    return "Jendela sembul (popup) diblokir oleh peramban. Izinkan popup untuk situs ini lalu coba lagi.";
  }
  if (kode === "auth/cancelled-popup-request") {
    return "Permintaan masuk dibatalkan karena ada jendela masuk lain yang sedang dibuka.";
  }
  if (kode === "auth/network-request-failed") {
    return "Gagal menghubungi layanan Google. Periksa koneksi internet Anda.";
  }
  if (kode === "auth/unauthorized-domain") {
    return "Domain situs ini belum didaftarkan pada Authorized domains di Firebase Console (Authentication -> Settings).";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Terjadi kendala saat memproses sesi masuk Google.";
}

/**
 * Memulai pemantau status login Firebase (Aturan #3 & #4).
 * Callback selalu dipanggil dengan (user, token) tanpa argumen isReady.
 * @param {(user: import("https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js").User | null, token: string | null) => void} callback
 */
export function initAuth(callback) {
  const auth = getFirebaseAuth();
  if (typeof authListenerUnsub === "function") {
    authListenerUnsub();
    authListenerUnsub = null;
  }

  let dipanggilPertamaKali = false;

  authListenerUnsub = onAuthStateChanged(
    auth,
    async (user) => {
      if (!user) {
        currentUser = null;
        hapusTokenDrive();
        dipanggilPertamaKali = true;
        callback(null, null);
        return;
      }

      const emailBersih = String(user.email || "").trim().toLowerCase();
      if (emailBersih !== AUTHORIZED_EMAIL.toLowerCase()) {
        currentUser = null;
        lastAuthErrorMessage = `Akses ditolak. Akun "${user.email || "tidak dikenal"}" bukan pemilik aplikasi ini (${AUTHORIZED_EMAIL}).`;
        hapusTokenDrive();
        try {
          await logoutUser();
        } catch (_e) {
          // Pastikan callback tetap dipanggil ke status keluar
          callback(null, null);
        }
        return;
      }

      currentUser = user;
      dipanggilPertamaKali = true;
      callback(user, getDriveAccessToken());
    },
    (err) => {
      currentUser = null;
      lastAuthErrorMessage = formatPesanGalatAuth(err);
      if (!dipanggilPertamaKali) {
        dipanggilPertamaKali = true;
      }
      callback(null, null);
    }
  );

  return authListenerUnsub;
}

/**
 * Login menggunakan popup Google + scope Google Drive (Aturan #2 & #4).
 */
export async function loginWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const emailBersih = String(user?.email || "").trim().toLowerCase();

  if (emailBersih !== AUTHORIZED_EMAIL.toLowerCase()) {
    lastAuthErrorMessage = `Akses ditolak. Akun "${user?.email || "tidak dikenal"}" tidak diizinkan mengakses Agenda & Arsip.`;
    hapusTokenDrive();
    await logoutUser();
    throw new Error(lastAuthErrorMessage);
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;
  if (accessToken) {
    simpanTokenDrive(accessToken);
  }

  currentUser = user;
  return { user, token: accessToken };
}

/**
 * Keluar dari sesi Firebase dan menghapus token Drive di sessionStorage.
 */
export async function logoutUser() {
  const auth = getFirebaseAuth();
  currentUser = null;
  hapusTokenDrive();
  await signOut(auth);
}
