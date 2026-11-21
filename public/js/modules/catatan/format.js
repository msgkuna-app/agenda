/**
 * Format Modul Catatan (Tahap 3: dipisah dari catatan.js)
 * Fungsi murni: format tanggal, tautan aman Google Docs, urutan daftar, urai tag.
 * Tanpa DOM dan tanpa akses Firestore.
 */
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "../../util-html.js";

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
