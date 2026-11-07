/**
 * Modul Utilitas & Konstanta Kegiatan
 * Berisi konstanta status, paginasi, pemformatan tanggal tampilan,
 * validasi waktu, kelas badge, dan helper ikon SVG.
 */
import { hariIni, parseTanggal, tanggalLokal } from "../util-tanggal.js";

export const DAFTAR_STATUS_KEGIATAN = ["Rencana", "Berjalan", "Selesai"];
export const UKURAN_HALAMAN_KEGIATAN = 50;

const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

export const IKON_KALENDER_META = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
export const IKON_JAM_META = svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 15);
export const IKON_LOKASI_META = svgIkon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 15);
export const IKON_CATATAN_META = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 15);
export const IKON_GDOC_MINI = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/>', 16);
export const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 14);
export const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

export function formatTanggalTampilan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

export function validJamOpsional(jam) {
  if (!jam) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(jam);
}

export function kelasBadgeStatus(status) {
  if (status === "Berjalan") return "status-badge status-berjalan";
  if (status === "Selesai") return "status-badge status-selesai";
  return "status-badge status-rencana";
}

export function hitungRentangJendela(tahun, bulanIndex) {
  // Rentang jendela: 1 bulan sebelum s/d 1 bulan sesudah bulan aktif (+/- 1 bulan)
  const dMulai = new Date(tahun, bulanIndex - 1, 1);
  const dAkhir = new Date(tahun, bulanIndex + 2, 0); // hari terakhir bulan berikutnya
  return {
    tglAwal: tanggalLokal(dMulai),
    tglAkhir: tanggalLokal(dAkhir)
  };
}