/**
 * Modul Utilitas & Konstanta Laporan
 * Berisi definisi konstanta jenis laporan, ikon SVG, dan fungsi pembantu format tanggal/waktu/CSV.
 */
import { tanggalLokal, hariIni, parseTanggal } from "../util-tanggal.js";

export const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export const NAMA_BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

export const DAFTAR_JENIS_LAPORAN = [
  {
    id: "kegiatan",
    label: "Daftar Kegiatan per Periode",
    judulPendek: "Daftar Kegiatan",
    namaTab: "Daftar Kegiatan"
  },
  {
    id: "rekap-status",
    label: "Rekap Status Kegiatan (per Status & Kategori)",
    judulPendek: "Rekap Status Kegiatan",
    namaTab: "Rekap Status"
  },
  {
    id: "dokumen",
    label: "Daftar Dokumen",
    judulPendek: "Daftar Dokumen",
    namaTab: "Daftar Dokumen"
  },
  {
    id: "catatan",
    label: "Daftar Catatan",
    judulPendek: "Daftar Catatan",
    namaTab: "Daftar Catatan"
  }
];

export const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

export const IKON_TABEL = svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>', 18);
export const IKON_UNDUH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18);
export const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 15);
export const IKON_HAPUS = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 16);

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

export function ambilInfoJenisLaporan(idJenis) {
  return DAFTAR_JENIS_LAPORAN.find((j) => j.id === idJenis) || DAFTAR_JENIS_LAPORAN[0];
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