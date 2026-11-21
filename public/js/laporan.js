/**
 * Jembatan kompatibilitas Laporan (Tahap 3).
 * Isi asli laporan.js (1.646 baris) sudah dipindah ke modules/laporan/.
 * Berkas ini hanya re-export; akan dihapus pada Tahap 3-2 setelah
 * app.js dan modules/pengaturan diarahkan langsung ke modules/laporan/index.js.
 */
export {
  DAFTAR_JENIS_LAPORAN,
  getDaftarLaporan,
  isLaporanSudahDimuat,
  pastikanDataLaporanTersedia,
  perbaruiStatusJaringanLaporan,
  initHalamanLaporan,
  subscribeLaporan,
  unsubscribeLaporan
} from "./modules/laporan/index.js";
