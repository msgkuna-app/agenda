/**
 * State Modul Laporan — pintu re-export
 * (2026-11-25: isi asli dipecah menjadi inti.js, sumber.js, penyusun.js,
 *  penyusun-jenis.js, dan riwayat.js)
 *
 * Berkas ini sengaja hanya meneruskan nama-nama lama agar index.js, view.js, dan
 * controller.js tetap memakai jalur `./state.js` tanpa perubahan. Jangan menambah
 * logika di sini.
 *
 * Susunan lapisan (impor satu arah, tanpa lingkaran):
 *   state.js -> penyusun.js -> penyusun-jenis.js -> (inti.js, sumber.js)
 *   state.js -> riwayat.js
 */
export {
  // jenis laporan, state filter, validasi, dan penyaring bersama
  DAFTAR_JENIS_LAPORAN,
  setelOpsiPeristiwaLaporan,
  ambilInfoJenisLaporan,
  getJenisAktif,
  setJenisAktif,
  getTanggalDari,
  setTanggalDari,
  getTanggalSampai,
  setTanggalSampai,
  getFilterKategori,
  setFilterKategori,
  pastikanRentangDefault,
  validasiRentangTanggal
} from "./inti.js";

export { pastikanDataLaporanTersedia } from "./sumber.js";

export { susunDataLaporanSaatIni } from "./penyusun.js";

export {
  // riwayat laporan: simpan, hapus lunak, pulihkan, hapus permanen, langganan
  getDaftarLaporan,
  isLaporanSudahDimuat,
  simpanRiwayatLaporan,
  hapusLunakRiwayatLaporan,
  pulihkanRiwayatLaporan,
  hapusPermanenRiwayatLaporan,
  langgananRiwayatLaporan,
  lepasLanggananRiwayatLaporan
} from "./riwayat.js";

export { ambilDaftarOpsiKategoriLaporan } from "./opsi-kategori.js";
