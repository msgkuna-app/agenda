/**
 * Layanan Google Sheets API (Tahap 2d: dipindah dari modules/laporan/sheets.js)
 * Pembungkus panggilan Google Sheets API v4: penyisipan token akses,
 * pemeriksaan sesi, dan penanganan galat berbahasa Indonesia.
 * Sesuai aturan #3: hanya berkas di services/ yang memanggil API Google.
 * Catatan: berkas ini TIDAK boleh mengimpor modul halaman (aturan arah dependensi services -> config).
 */
import { isDriveTokenExpired, getDriveAccessToken } from "./authService.js";

function buatErrorSheets(status, pesanAsli, alasanKode = "", detailStatus = "") {
  const rawLower = String(pesanAsli || "").toLowerCase();
  const reasonLower = String(alasanKode || "").toLowerCase();
  const statusStrLower = String(detailStatus || "").toLowerCase();

  let pesan = "Terjadi kesalahan saat membuat laporan di Google Sheets.";
  let butuhRelogin = false;

  if (!navigator.onLine) {
    pesan = "Tidak ada koneksi internet. Pembuatan Google Sheets memerlukan sambungan internet aktif. Anda tetap dapat memakai tombol \"Unduh CSV\".";
  } else if (status === 401) {
    pesan = "Sesi akses Google telah kedaluwarsa atau tidak sah. Silakan klik tombol \"Masuk ulang\" lalu coba buat laporan kembali.";
    butuhRelogin = true;
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("sheets api has not been used") ||
      rawLower.includes("google sheets api has not been used") ||
      (rawLower.includes("sheets.googleapis.com") && rawLower.includes("disabled")) ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("is disabled")
    ) {
      pesan = "Google Sheets API belum diaktifkan pada proyek ini. Buka Google Cloud Console -> APIs & Services -> Library, cari \"Google Sheets API\", klik Enable, lalu coba lagi.";
    } else if (
      reasonLower.includes("insufficientpermissions") ||
      reasonLower.includes("access_token_scope_insufficient") ||
      rawLower.includes("insufficient authentication scopes") ||
      rawLower.includes("insufficient permission") ||
      statusStrLower === "permission_denied"
    ) {
      pesan = "Izin akses Google tidak mencukupi untuk membuat Google Sheets (403). Silakan klik \"Masuk ulang\" dan setujui izin akses Google Drive, atau jika masih ditolak mungkin perlu menambah scope https://www.googleapis.com/auth/spreadsheets pada konfigurasi login.";
      butuhRelogin = true;
    } else {
      pesan = `Permintaan ditolak oleh Google Sheets (403)${pesanAsli ? `: ${pesanAsli}` : "."} Anda dapat mencoba \"Masuk ulang\" atau periksa pengaktifan Google Sheets API di Google Cloud Console.`;
      butuhRelogin = true;
    }
  } else if (status === 404) {
    pesan = "Spreadsheet tujuan tidak ditemukan di Google Sheets (404).";
  } else if (status === 429) {
    pesan = "Terlalu banyak permintaan ke Google Sheets dalam waktu singkat (429). Tunggu beberapa detik lalu coba kembali.";
  } else if (pesanAsli) {
    pesan = `Kendala Google Sheets (${status}): ${pesanAsli}`;
  }

  const err = new Error(pesan);
  err.status = status;
  err.butuhRelogin = butuhRelogin;
  err.isTokenExpired = status === 401;
  return err;
}

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
