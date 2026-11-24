/**
 * Modul Sampah — titik masuk publik (Tahap 3; Tahap B: berbasis tabel jenis).
 * Halaman "Tempat Sampah" + pembersihan otomatis 30 hari.
 * Konsumen diarahkan mengimpor dari berkas ini.
 *
 * API berbasis kunci koleksi: getDaftarSampah(kunci) / getSemuaItemSampah().
 * Pengambil khusus per jenis (getDaftarKegiatanDiSampah dsb.) sengaja tidak
 * diekspor lagi — modul kegiatan dan catatan masing-masing sudah menyediakannya
 * dari state-nya sendiri.
 */
export {
  getJenisSampah,
  getDaftarSampah,
  getSemuaItemSampah,
  isSampahSudahDimuat,
  jalankanPembersihanSampahOtomatis
} from "./state.js";
export { renderHalamanSampah } from "./view.js";
export {
  initHalamanSampah,
  subscribeSampah,
  unsubscribeSampah,
  resetPembersihanSampah
} from "./controller.js";
