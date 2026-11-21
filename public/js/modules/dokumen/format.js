/**
 * Format & Klasifikasi Dokumen (Tahap 3d: dipisah dari dokumen.js)
 * Fungsi murni: tanggal unggah, ukuran berkas, dan jenis ikon MIME.
 * Tanpa DOM dan tanpa state — aman diimpor modul mana pun.
 */
import { tanggalLokal, hariIni, parseTanggal } from "../../util-tanggal.js";
import { svgIkon, NAMA_BULAN_PENDEK } from "../../util-html.js";

export function formatTanggalDokumenLokal(isoTimestamp) {
  if (!isoTimestamp) return "-";
  const tglWaktu = new Date(isoTimestamp);
  if (Number.isNaN(tglWaktu.getTime())) return "-";

  const tglStrLokal = tanggalLokal(tglWaktu);
  const parsed = parseTanggal(tglStrLokal);
  if (!parsed) return tglStrLokal;

  const teksTanggal = `${parsed.getDate()} ${NAMA_BULAN_PENDEK[parsed.getMonth()]} ${parsed.getFullYear()}`;
  return tglStrLokal === hariIni() ? `Hari ini, ${teksTanggal}` : teksTanggal;
}

export function formatUkuranBerkas(byteVal) {
  const angka = Number(byteVal);
  if (!Number.isFinite(angka) || angka <= 0) {
    return "0 KB";
  }
  const satuMb = 1024 * 1024;
  if (angka >= satuMb) {
    const mb = angka / satuMb;
    return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB`.replace(".", ",");
  }
  const kb = Math.max(1, Math.round(angka / 1024));
  return `${kb} KB`;
}

export function infoJenisBerkasMime(mimeType, namaFile = "") {
  const m = String(mimeType || "").toLowerCase();
  const eks = String(namaFile || "").toLowerCase();

  if (m === "application/pdf" || eks.endsWith(".pdf")) {
    return {
      label: "PDF",
      kelasWarna: "doc-icon-pdf",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h2"/>', 18)
    };
  }
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv" ||
    eks.endsWith(".xlsx") ||
    eks.endsWith(".xls") ||
    eks.endsWith(".csv")
  ) {
    return {
      label: m === "text/csv" || eks.endsWith(".csv") ? "CSV" : "Spreadsheet",
      kelasWarna: "doc-icon-sheet",
      svg: svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>', 18)
    };
  }
  if (
    m.includes("wordprocessingml") ||
    m === "application/msword" ||
    m.includes("vnd.google-apps.document") ||
    eks.endsWith(".docx") ||
    eks.endsWith(".doc")
  ) {
    return {
      label: "Dokumen Kata",
      kelasWarna: "doc-icon-word",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>', 18)
    };
  }
  if (
    m.includes("presentation") ||
    m.includes("powerpoint") ||
    eks.endsWith(".pptx") ||
    eks.endsWith(".ppt")
  ) {
    return {
      label: "Presentasi",
      kelasWarna: "doc-icon-slide",
      svg: svgIkon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 18)
    };
  }
  if (m.startsWith("image/")) {
    const sub = m.replace("image/", "").toUpperCase();
    return {
      label: sub && sub.length <= 5 ? `Gambar ${sub}` : "Gambar",
      kelasWarna: "doc-icon-image",
      svg: svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 18)
    };
  }
  if (m.startsWith("audio/")) {
    return {
      label: "Audio",
      kelasWarna: "doc-icon-media",
      svg: svgIkon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', 18)
    };
  }
  if (m.startsWith("video/")) {
    return {
      label: "Video",
      kelasWarna: "doc-icon-media",
      svg: svgIkon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>', 18)
    };
  }
  if (
    m.includes("zip") ||
    m.includes("rar") ||
    m.includes("tar") ||
    m.includes("7z") ||
    eks.endsWith(".zip") ||
    eks.endsWith(".rar") ||
    eks.endsWith(".7z")
  ) {
    return {
      label: "Arsip Kompresi",
      kelasWarna: "doc-icon-archive",
      svg: svgIkon('<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>', 18)
    };
  }
  if (m.startsWith("text/")) {
    return {
      label: "Teks",
      kelasWarna: "doc-icon-generic",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="14" y1="17" x2="8" y2="17"/>', 18)
    };
  }
  return {
    label: "Berkas",
    kelasWarna: "doc-icon-generic",
    svg: svgIkon('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', 18)
  };
}
