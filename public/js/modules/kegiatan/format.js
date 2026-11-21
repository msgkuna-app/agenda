/**
 * Pembantu format Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Fungsi murni tanpa DOM dan tanpa state.
 */
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "../../util-html.js";

/**
 * Mengubah tanggal ISO (YYYY-MM-DD) menjadi teks ramah baca,
 * dengan awalan "Hari ini • " bila tanggal tersebut hari ini.
 */
export function formatTanggalTampilan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

/**
 * Validasi format jam opsional (HH:MM). Jam kosong dianggap valid.
 */
export function validJamOpsional(jam) {
  if (!jam) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(jam);
}
