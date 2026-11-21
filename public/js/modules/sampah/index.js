/**
 * Modul Sampah — titik masuk publik (Tahap 3).
 * Halaman "Tempat Sampah" + pembersihan otomatis 30 hari.
 * Konsumen diarahkan mengimpor dari berkas ini.
 */
export {
  getDaftarKegiatanDiSampah,
  getDaftarCatatanDiSampah,
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
