/**
 * Format Modul Laporan (Tahap 3: dipisah dari laporan.js)
 * Fungsi murni: format tanggal/waktu lokal, konversi indeks kolom ke notasi A1,
 * escape sel CSV, pembangun objek galat Google Sheets, dan hitung rentang bawaan.
 * Tanpa DOM dan tanpa akses jaringan.
 */
import { hariIni, parseTanggal, tanggalLokal } from "../../util-tanggal.js";
import { NAMA_BULAN_PENDEK } from "../../util-html.js";

export function hitungAwalBulanIni() {
  const skrStr = hariIni();
  const skrObj = parseTanggal(skrStr);
  if (!skrObj) return skrStr;
  return tanggalLokal(new Date(skrObj.getFullYear(), skrObj.getMonth(), 1));
}

export function formatTanggalSetempat(ymdStr) {
  const obj = parseTanggal(ymdStr);
  if (!obj) return ymdStr || "-";
  return `${obj.getDate()} ${NAMA_BULAN_PENDEK[obj.getMonth()]} ${obj.getFullYear()}`;
}

export function ekstrakTanggalYmdDariIso(nilaiMentah) {
  if (!nilaiMentah) return "";
  const str = String(nilaiMentah).trim();
  if (parseTanggal(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return tanggalLokal(d);
}

export function formatWaktuRiwayatLokal(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "-";
  const ymd = tanggalLokal(d);
  const tgl = formatTanggalSetempat(ymd);
  const jam = String(d.getHours()).padStart(2, "0");
  const menit = String(d.getMinutes()).padStart(2, "0");
  return `${tgl}, ${jam}.${menit}`;
}

export function escapeSelCsv(nilai) {
  const str = nilai === null || nilai === undefined ? "" : String(nilai);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function kolomKeHurufA1(indeksNol) {
  let n = indeksNol + 1;
  let hasil = "";
  while (n > 0) {
    const sisa = (n - 1) % 26;
    hasil = String.fromCharCode(65 + sisa) + hasil;
    n = Math.floor((n - 1) / 26);
  }
  return hasil || "A";
}

export function buatErrorSheets(status, pesanAsli, alasanKode = "", detailStatus = "") {
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
