/**
 * Konfigurasi Firebase Web SDK
 * Salin nilai konfigurasi aplikasi web Anda dari Firebase Console:
 * Project Settings -> General -> Your apps -> SDK setup and configuration (Config)
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBtYgsCoZk5F1HpBHKCIuHIl0XIAQgcqqU",
  authDomain: "msgkuna-app-85dfb.firebaseapp.com",
  projectId: "msgkuna-app-85dfb",
  storageBucket: "msgkuna-app-85dfb.firebasestorage.app",
  messagingSenderId: "641787111254",
  appId: "1:641787111254:web:20e40d4bc939bc118298f7",
  measurementId: "G-D0MXGTSEBC",
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
