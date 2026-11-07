/**
 * Modul Utilitas HTML, Ikon SVG, dan Teks Kalender Indonesia (Fase 7A)
 * Menyediakan helper terpusat untuk:
 * - escapeHtml (mengamankan & < > " ' dan `)
 * - escapeAtribut
 * - svgIkon (pembangkit elemen SVG inline standar)
 * - Konstanta nama hari dan bulan Indonesia (lengkap & pendek)
 */

/**
 * Mengamankan teks sebelum disisipkan ke HTML untuk mencegah XSS.
 * Meng-escape: & < > " ' dan tanda backtick (`)
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/**
 * Mengamankan nilai atribut HTML.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeAtribut(str) {
  return escapeHtml(str);
}

/**
 * Menghasilkan string elemen SVG inline dengan atribut standar aplikasi.
 * @param {string} isi - Path atau elemen SVG di dalam tag <svg>
 * @param {number} [uk=18] - Lebar dan tinggi SVG
 * @param {number} [tebal=2] - Nilai stroke-width
 * @param {string} [cls=""] - Nama class tambahan jika ada
 * @returns {string}
 */
export function svgIkon(isi, uk = 18, tebal = 2, cls = "") {
  const classAttr = cls ? ` class="${escapeHtml(cls)}"` : "";
  return `<svg${classAttr} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;
}

export const NAMA_HARI_LENGKAP = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

export const NAMA_HARI = NAMA_HARI_LENGKAP;

export const NAMA_BULAN_LENGKAP = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const NAMA_BULAN = NAMA_BULAN_LENGKAP;

export const NAMA_HARI_PENDEK = [
  "Min",
  "Sen",
  "Sel",
  "Rab",
  "Kam",
  "Jum",
  "Sab",
];

export const NAMA_BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];