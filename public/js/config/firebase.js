/**
 * Konfigurasi proyek Firebase & OAuth Client ID (data murni, TANPA impor — aturan #4).
 * Hanya berkas ini yang perlu diubah saat mengganti proyek Firebase.
 */

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
export const PLACEHOLDER_GOOGLE_CLIENT_ID = "ISI_DARI_GOOGLE_CLOUD_CONSOLE";

export const GOOGLE_CLIENT_ID = "641787111254-r1d0co4oi0i6padlerb7nsb15uhemacj.apps.googleusercontent.com";

export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig) &&
    firebaseConfig.apiKey !== "ISI_DARI_FIREBASE_CONSOLE" &&
    firebaseConfig.projectId !== "ISI_DARI_FIREBASE_CONSOLE"
  );
}
