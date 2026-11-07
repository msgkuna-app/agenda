/**
 * Modul Utilitas Catatan (Fase 7C)
 * Konstanta, pembantu SVG, format tanggal, manipulasi URL Docs, dan helper murni lainnya.
 */
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { isDriveTokenExpired } from "../auth.js";
import { getDaftarKegiatan } from "../kegiatan.js";

export const JENIS_CATATAN_SINGKAT = "singkat";
export const JENIS_CATATAN_GDOC = "gdoc";
export const UKURAN_HALAMAN_CATATAN = 100;

const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

export const IKON_SINGKAT = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20);
export const IKON_GDOC = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="19" x2="12" y2="19"/>', 20);
export const IKON_SEMAT = svgIkon('<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>', 16);
export const IKON_KALENDER = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
export const IKON_TAUTAN = svgIkon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 15);
export const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 15);
export const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

export function formatTanggalCatatan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

export function tautanAmanGoogleDocs(item) {
  const mentah = String(item?.tautan || "").trim();
  if (mentah && /^https?:\/\//i.test(mentah)) return mentah;
  const docId = String(item?.docId || "").trim();
  return docId ? `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit` : "#";
}

export function bukaTabBaruAman(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function uraiInputTag(teks) {
  const hasil = [];
  const unik = new Set();
  for (const bagian of String(teks || "").split(",")) {
    const bersih = bagian.trim().replace(/^#+/, "").trim().slice(0, 32);
    if (!bersih) continue;
    const kunci = bersih.toLowerCase();
    if (!unik.has(kunci)) {
      unik.add(kunci);
      hasil.push(bersih);
    }
    if (hasil.length >= 12) break;
  }
  return hasil;
}

export function cariKegiatanId(id) {
  const target = String(id || "").trim();
  return target ? getDaftarKegiatan().find((k) => k.id === target) || null : null;
}

export function adalahGalatToken(err) {
  if (!err || typeof err !== "object") return isDriveTokenExpired();
  return Boolean(err.isTokenExpired || err.isUnauthorized || err.status === 401);
}

export function urutkanDaftarCatatan(daftar, arah = "desc") {
  return [...daftar].sort((a, b) => {
    const pinDiff = (b.disematkan ? 1 : 0) - (a.disematkan ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    const tglA = String(a.tanggal || "");
    const tglB = String(b.tanggal || "");
    if (tglA !== tglB) return arah === "asc" ? tglA.localeCompare(tglB) : tglB.localeCompare(tglA);
    const updA = String(a.updatedAt || a.createdAt || "");
    const updB = String(b.updatedAt || b.createdAt || "");
    if (updA !== updB) return arah === "asc" ? updA.localeCompare(updB) : updB.localeCompare(updA);
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
  });
}