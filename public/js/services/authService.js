/**
 * Layanan Autentikasi Firebase & Token Google Drive via Google Identity Services (GIS)
 * (Tahap 2c: dipindah dari js/auth.js tanpa perubahan logika)
 * - Firebase Auth murni untuk identitas pengguna dan keamanan aturan Firestore.
 * - GIS Token Client untuk hak akses Google Drive (scope: drive.file).
 * - Token disimpan HANYA di memori modul, membersihkan sisa sessionStorage lama saat startup.
 * - Memiliki fungsi mintaTokenDrive({ senyap }) dengan lazy refresh (margin 2 menit).
 * - Memvalidasi kepemilikan akun tunggal (AUTHORIZED_EMAIL) dan mencabut token jika tidak cocok.
 */
import { AUTHORIZED_EMAIL, DRIVE_SCOPE, STORAGE_TOKEN_KEY_LAMA, STORAGE_TOKEN_TS_KEY_LAMA, MARGIN_KEDALUWARSA_MS, GOOGLE_USERINFO_URL } from "../config/constants.js";
export { AUTHORIZED_EMAIL, DRIVE_SCOPE };
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirebaseAuth, GOOGLE_CLIENT_ID, PLACEHOLDER_GOOGLE_CLIENT_ID } from "./firestoreService.js";

// Bersihkan sisa kunci lama di sessionStorage saat modul dimuat
try {
  sessionStorage.removeItem(STORAGE_TOKEN_KEY_LAMA);
  sessionStorage.removeItem(STORAGE_TOKEN_TS_KEY_LAMA);
} catch (_err) {}

// Penyimpanan token eksklusif HANYA di memori modul
let driveAccessToken = null;
let driveTokenExpiresAt = 0; // Epoch milliseconds waktu kedaluwarsa nyata
let currentUser = null;
let lastAuthErrorMessage = "";
let authListenerUnsub = null;

let janjiMuatGis = null;
let janjiMintaTokenAktif = null;

/**
 * Mengosongkan token GIS Drive di memori.
 * Dipakai saat keluar sesi atau saat akun tidak sah.
 */
function kosongkanTokenDrive() {
  driveAccessToken = null;
  driveTokenExpiresAt = 0;
}

/**
 * Memuat pustaka Google Identity Services (GIS) secara dinamis & asinkron.
 * @returns {Promise<typeof google>}
 */
export function pastikanGisLoaded() {
  if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }
  if (janjiMuatGis) {
    return janjiMuatGis;
  }

  janjiMuatGis = new Promise((resolve, reject) => {
    // Cek apakah script tag sudah ada di DOM
    const skripAda = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (skripAda) {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }
      skripAda.addEventListener("load", () => resolve(window.google));
      skripAda.addEventListener("error", () =>
        reject(new Error("Gagal memuat Google Identity Services (GIS)."))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
      } else {
        reject(new Error("Pustaka GIS dimuat tetapi objek google.accounts.oauth2 tidak ditemukan."));
      }
    };
    script.onerror = () => {
      janjiMuatGis = null;
      reject(new Error("Gagal memuat Google Identity Services dari Google. Periksa koneksi internet Anda."));
    };
    document.head.appendChild(script);
  });

  return janjiMuatGis;
}

/**
 * Mengambil access token Google Drive dari memori jika masih berlaku.
 * @returns {string | null}
 */
export function getDriveAccessToken() {
  if (isDriveTokenExpired()) {
    return null;
  }
  return driveAccessToken;
}

/**
 * Memeriksa apakah token Google Drive kedaluwarsa atau belum ada,
 * dengan memperhitungkan margin aman 2 menit sebelum batas kedaluwarsa nyata.
 * @returns {boolean}
 */
export function isDriveTokenExpired() {
  if (!driveAccessToken || !driveTokenExpiresAt) {
    return true;
  }
  return Date.now() >= driveTokenExpiresAt - MARGIN_KEDALUWARSA_MS;
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
 * Menerjemahkan galat autentikasi ke Bahasa Indonesia yang jelas.
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
    return "Domain situs ini belum didaftarkan pada Authorized domains di Firebase Console.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Terjadi kendala saat memproses autentikasi Google.";
}

/**
 * Memvalidasi apakah token GIS milik email pemilik sah.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function validasiEmailPemilikToken(token) {
  try {
    const resp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return false;
    const info = await resp.json();
    const emailToken = String(info.email || "").trim().toLowerCase();
    return emailToken === AUTHORIZED_EMAIL.toLowerCase();
  } catch (_e) {
    // Jika panggilan verifikasi gagal karena jaringan, anggap tidak valid demi keamanan
    return false;
  }
}

/**
 * Meminta token akses untuk satu cakupan (scope) lewat GIS Token Client.
 * Dipakai oleh permintaan token Google Drive.
 * - Jika `senyap: true`, memakai prompt: "" (tanpa popup persetujuan bila izin sudah pernah diberikan).
 * - Memvalidasi email pemilik. Jika berbeda, cabut token dan tolak.
 *
 * @param {{ scope: string, senyap?: boolean, labelIzin: string }} opsi
 * @returns {Promise<{ token: string, expires_in: number }>}
 */
async function mintaTokenCakupan({ scope, senyap = false, labelIzin }) {
  if (!navigator.onLine) {
    throw new Error("Tidak ada koneksi internet. Sambungkan ke jaringan terlebih dahulu.");
  }

  const clientId = typeof GOOGLE_CLIENT_ID === "string" ? GOOGLE_CLIENT_ID.trim() : "";
  if (!clientId || clientId === PLACEHOLDER_GOOGLE_CLIENT_ID) {
    throw new Error(
      "OAuth Client ID belum dikonfigurasi pada GOOGLE_CLIENT_ID di js/config/firebase.js. Harap isi OAuth Client ID Web Anda."
    );
  }

  const google = await pastikanGisLoaded();

  return new Promise((resolve, reject) => {
    let resolved = false;

    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      hint: AUTHORIZED_EMAIL,
      callback: async (tokenResponse) => {
        if (resolved) return;
        resolved = true;

        if (tokenResponse.error) {
          const errPesan =
            tokenResponse.error === "access_denied"
              ? `Izin ${labelIzin} ditolak oleh pengguna.`
              : `Gagal mendapatkan izin ${labelIzin}: ${tokenResponse.error_description || tokenResponse.error}`;
          reject(new Error(errPesan));
          return;
        }

        const token = tokenResponse.access_token;
        const expiresInDetik = Number(tokenResponse.expires_in) || 3600;

        if (!token) {
          reject(new Error("Respons Google Identity Services tidak memuat token akses."));
          return;
        }

        // Validasi email token terhadap pemilik sah
        const valid = await validasiEmailPemilikToken(token);
        if (!valid) {
          try {
            google.accounts.oauth2.revoke(token, () => {});
          } catch (_e) {}
          const pesanDitolak = `Akses ${labelIzin} ditolak. Akun Google yang dipilih bukan pemilik resmi aplikasi (${AUTHORIZED_EMAIL}).`;
          lastAuthErrorMessage = pesanDitolak;
          reject(new Error(pesanDitolak));
          return;
        }

        resolve({ token, expires_in: expiresInDetik });
      },
      error_callback: (err) => {
        if (resolved) return;
        resolved = true;
        reject(new Error(err?.message || "Terjadi kesalahan pada Google Identity Services."));
      },
    });

    try {
      client.requestAccessToken({ prompt: senyap ? "" : "consent" });
    } catch (errReq) {
      if (!resolved) {
        resolved = true;
        reject(errReq);
      }
    }
  });
}

/**
 * Meminta token akses Google Drive melalui GIS Token Client:
 * - Jika token di memori masih berlaku, kembalikan langsung.
 * - Jika `senyap: true`, mencoba prompt: "" (tanpa popup persetujuan ulang).
 * - Jika `senyap: false` atau dipicu gestur klik, meminta token dengan dialog.
 * - Memvalidasi email pemilik. Jika berbeda, cabut token dan tolak.
 *
 * @param {{ senyap?: boolean }} opsi
 * @returns {Promise<{ token: string, expires_in: number }>}
 */
export async function mintaTokenDrive(opsi = { senyap: false }) {
  if (!isDriveTokenExpired() && driveAccessToken) {
    const sisaDetik = Math.max(0, Math.floor((driveTokenExpiresAt - Date.now()) / 1000));
    return { token: driveAccessToken, expires_in: sisaDetik };
  }

  if (janjiMintaTokenAktif) {
    return janjiMintaTokenAktif;
  }

  janjiMintaTokenAktif = (async () => {
    try {
      const hasil = await mintaTokenCakupan({
        scope: DRIVE_SCOPE,
        senyap: Boolean(opsi.senyap),
        labelIzin: "Google Drive",
      });
      // Simpan hanya di memori modul dengan batas kedaluwarsa nyata
      driveAccessToken = hasil.token;
      driveTokenExpiresAt = Date.now() + hasil.expires_in * 1000;
      return hasil;
    } catch (err) {
      kosongkanTokenDrive();
      throw err;
    }
  })();

  try {
    return await janjiMintaTokenAktif;
  } finally {
    janjiMintaTokenAktif = null;
  }
}

/**
 * Memulai pemantau status login Firebase.
 * Scope Drive tidak lagi diminta lewat provider Firebase Auth.
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
        kosongkanTokenDrive();
        dipanggilPertamaKali = true;
        callback(null, null);
        return;
      }

      const emailBersih = String(user.email || "").trim().toLowerCase();
      if (emailBersih !== AUTHORIZED_EMAIL.toLowerCase()) {
        currentUser = null;
        lastAuthErrorMessage = `Akses ditolak. Akun "${user.email || "tidak dikenal"}" bukan pemilik aplikasi ini (${AUTHORIZED_EMAIL}).`;
        kosongkanTokenDrive();
        try {
          await logoutUser();
        } catch (_e) {
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
 * Login Firebase menggunakan Google Auth Provider murni (tanpa scope Drive di Firebase).
 */
export async function loginWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const emailBersih = String(user?.email || "").trim().toLowerCase();

  if (emailBersih !== AUTHORIZED_EMAIL.toLowerCase()) {
    lastAuthErrorMessage = `Akses ditolak. Akun "${user?.email || "tidak dikenal"}" tidak diizinkan mengakses Agenda & Arsip.`;
    kosongkanTokenDrive();
    await logoutUser();
    throw new Error(lastAuthErrorMessage);
  }

  currentUser = user;

  // Mencoba meminta izin token Drive secara otomatis
  try {
    const hasilDrive = await mintaTokenDrive({ senyap: true });
    return { user, token: hasilDrive.token };
  } catch (_e) {
    // Jika permintaan senyap belum diizinkan, kembalikan user dan biarkan banner / tombol memandu dialog
    return { user, token: null };
  }
}

/**
 * Keluar dari sesi Firebase, mencabut token GIS Drive dari Google, dan membersihkan memori.
 */
export async function logoutUser() {
  const auth = getFirebaseAuth();
  currentUser = null;

  const tokenLama = driveAccessToken;
  kosongkanTokenDrive();

  if (typeof tokenLama === "string" && tokenLama.length > 0) {
    try {
      if (window.google?.accounts?.oauth2?.revoke) {
        window.google.accounts.oauth2.revoke(tokenLama, () => {});
      }
    } catch (_e) {}
  }

  try {
    sessionStorage.removeItem(STORAGE_TOKEN_KEY_LAMA);
    sessionStorage.removeItem(STORAGE_TOKEN_TS_KEY_LAMA);
  } catch (_e) {}

  await signOut(auth);
}
