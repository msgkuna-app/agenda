/**
 * Pembantu format Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Fungsi murni tanpa DOM dan tanpa state.
 */
import { hariIni, parseTanggal, akhiriRentang, jumlahHariRentang } from "../../util-tanggal.js";
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

/**
 * Label ringkas satu tanggal: "Sen, 25 Nov 2026", atau tanpa tahun bila diminta.
 * @param {Date} objek
 * @param {boolean} [denganTahun]
 * @returns {string}
 */
function potonganTanggal(objek, denganTahun = true) {
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]}`;
  return denganTahun ? `${teks} ${objek.getFullYear()}` : teks;
}

/**
 * Teks rentang tanggal kegiatan. Kegiatan satu hari menghasilkan teks yang sama
 * persis dengan formatTanggalTampilan(), sehingga seluruh tampilan lama tidak
 * berubah. Kegiatan berturutan menghasilkan "Sen, 25 – Kam, 28 Nov 2026 • 4 hari".
 * @param {{ tanggal?: string, tanggalSelesai?: string }} item
 * @returns {string}
 */
export function formatRentangTanggal(item) {
  const mulai = parseTanggal(item?.tanggal);
  if (!mulai) return String(item?.tanggal || "-");
  const akhir = parseTanggal(akhiriRentang(item?.tanggal, item?.tanggalSelesai));
  if (!akhir || akhir.getTime() === mulai.getTime()) return formatTanggalTampilan(item?.tanggal);

  const samaBulan = mulai.getFullYear() === akhir.getFullYear() && mulai.getMonth() === akhir.getMonth();
  const samaTahun = mulai.getFullYear() === akhir.getFullYear();
  const teks = samaBulan
    ? `${NAMA_HARI_PENDEK[mulai.getDay()]}, ${mulai.getDate()} – ${potonganTanggal(akhir, true)}`
    : `${potonganTanggal(mulai, !samaTahun)} – ${potonganTanggal(akhir, true)}`;
  return `${teks} • ${jumlahHariRentang(item)} hari`;
}

/**
 * Versi lebih pendek untuk kolom sempit (tabel, Tempat Sampah, dokumen):
 * "25–28 Nov 2026 (4 hari)" atau "28 Nov – 2 Des 2026 (5 hari)".
 * Kegiatan satu hari menghasilkan "Sen, 25 Nov 2026" seperti sebelumnya.
 * @param {{ tanggal?: string, tanggalSelesai?: string }} item
 * @returns {string}
 */
export function formatRentangTanggalSingkat(item) {
  const mulai = parseTanggal(item?.tanggal);
  if (!mulai) return String(item?.tanggal || "-");
  const akhir = parseTanggal(akhiriRentang(item?.tanggal, item?.tanggalSelesai));
  if (!akhir || akhir.getTime() === mulai.getTime()) return potonganTanggal(mulai, true);

  const samaBulan = mulai.getFullYear() === akhir.getFullYear() && mulai.getMonth() === akhir.getMonth();
  const samaTahun = mulai.getFullYear() === akhir.getFullYear();
  const teks = samaBulan
    ? `${mulai.getDate()}–${akhir.getDate()} ${NAMA_BULAN_PENDEK[akhir.getMonth()]} ${akhir.getFullYear()}`
    : samaTahun
      ? `${mulai.getDate()} ${NAMA_BULAN_PENDEK[mulai.getMonth()]} – ${akhir.getDate()} ${NAMA_BULAN_PENDEK[akhir.getMonth()]} ${akhir.getFullYear()}`
      : `${mulai.getDate()} ${NAMA_BULAN_PENDEK[mulai.getMonth()]} ${mulai.getFullYear()} – ${akhir.getDate()} ${NAMA_BULAN_PENDEK[akhir.getMonth()]} ${akhir.getFullYear()}`;
  return `${teks} (${jumlahHariRentang(item)} hari)`;
}
