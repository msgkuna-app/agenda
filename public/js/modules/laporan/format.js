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
