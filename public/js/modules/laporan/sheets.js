/**
 * Sheets API Modul Laporan (Tahap 3: dipisah dari laporan.js)
 * Pembungkus panggilan Google Sheets API v4: penyisipan token akses,
 * pemeriksaan sesi, dan penanganan galat berbahasa Indonesia.
 *
 * CATATAN ARSITEKTUR: panggilan jaringan Sheets masih berada di modul fitur
 * (temuan audit: melanggar aturan #3 sementara). Kandidat pemindahan ke
 * services/sheetsService.js pada Tahap 2d.
 */
import { isDriveTokenExpired, getDriveAccessToken } from "../../services/authService.js";
import { buatErrorSheets } from "./format.js";

export async function panggilSheetsApi(url, opsi = {}) {
  if (!navigator.onLine) {
    throw buatErrorSheets(0, "");
  }
  if (isDriveTokenExpired()) {
    const errExp = new Error(
      "Sesi akses Google telah kedaluwarsa (lebih dari 50 menit) atau belum aktif. Klik \"Masuk ulang\" sebelum membuat spreadsheet."
    );
    errExp.butuhRelogin = true;
    errExp.isTokenExpired = true;
    throw errExp;
  }
  const token = getDriveAccessToken();
  if (!token) {
    const errNoToken = new Error(
      "Token akses Google tidak tersedia. Klik \"Masuk ulang\" untuk memperbarui sesi akses."
    );
    errNoToken.butuhRelogin = true;
    errNoToken.isTokenExpired = true;
    throw errNoToken;
  }

  const headers = new Headers(opsi.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opsi.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
  }

  let resp;
  try {
    resp = await fetch(url, { ...opsi, headers });
  } catch (_netErr) {
    throw new Error(
      !navigator.onLine
        ? "Koneksi internet terputus saat menghubungi Google Sheets. Gunakan tombol \"Unduh CSV\" bila sedang luring."
        : "Gagal menghubungi layanan Google Sheets. Periksa sambungan internet Anda."
    );
  }

  if (!resp.ok) {
    let pesanAsli = "";
    let alasanKode = "";
    let statusTeks = "";
    try {
      const data = await resp.json();
      if (data && data.error) {
        pesanAsli = String(data.error.message || "");
        statusTeks = String(data.error.status || "");
        if (Array.isArray(data.error.errors) && data.error.errors.length > 0) {
          alasanKode = String(data.error.errors[0].reason || "");
        }
        if (!alasanKode && Array.isArray(data.error.details)) {
          const infoErr = data.error.details.find((d) => d && d.reason);
          if (infoErr) alasanKode = String(infoErr.reason);
        }
      }
    } catch (_e) {
      try { pesanAsli = await resp.text(); } catch (_e2) {}
    }
    throw buatErrorSheets(resp.status, pesanAsli, alasanKode, statusTeks);
  }

  return resp.json();
}
