/**
 * Format Modul Sampah (Tahap 3: dipisah dari sampah.js)
 * Fungsi murni tampilan: format tanggal item sampah dan hitungan usia/sisa hari
 * sebelum penghapusan permanen. Tanpa DOM dan tanpa akses jaringan.
 */
import { SATU_HARI_MS, TIGA_PULUH_HARI_MS } from "../../config/constants.js";
import { parseTanggal, hariIni } from "../../util-tanggal.js";
import { NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "../../util-html.js";

export function formatTanggalTeks(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

export function hitungInformasiHariSampah(dihapusAt) {
  const tDihapus = Date.parse(dihapusAt) || Date.now();
  const sekarang = Date.now();
  const selisihLaluMs = Math.max(0, sekarang - tDihapus);
  const hariLalu = Math.floor(selisihLaluMs / SATU_HARI_MS);

  const tKadaluwarsa = tDihapus + TIGA_PULUH_HARI_MS;
  const sisaMs = tKadaluwarsa - sekarang;
  const hariTersisa = Math.max(0, Math.ceil(sisaMs / SATU_HARI_MS));

  const teksLalu = hariLalu === 0 ? "Dihapus hari ini" : `Dihapus ${hariLalu} hari lalu`;
  const teksSisa = hariTersisa === 0 ? "tersisa kurang dari 1 hari" : `tersisa ${hariTersisa} hari`;

  return {
    hariLalu,
    hariTersisa,
    ringkasan: `${teksLalu} • ${teksSisa}`
  };
}
