/**
 * JEMBATAN (Tahap 3): isi sampah.js kini di modules/sampah/.
 * Berkas ini hanya re-export demi kompatibilitas; akan dihapus pada Tahap 3-2.
 */
export {
  getDaftarKegiatanDiSampah,
  getDaftarCatatanDiSampah,
  isSampahSudahDimuat,
  renderHalamanSampah,
  initHalamanSampah,
  subscribeSampah,
  unsubscribeSampah,
  jalankanPembersihanSampahOtomatis,
  resetPembersihanSampah
} from "./modules/sampah/index.js";
