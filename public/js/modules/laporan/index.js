/**
 * Titik masuk Modul Laporan (Tahap 3: dipisah dari laporan.js)
 * Kontrak publik yang dipakai konsumen: app.js dan modules/pengaturan.
 */
export {
  DAFTAR_JENIS_LAPORAN,
  getDaftarLaporan,
  isLaporanSudahDimuat,
  pastikanDataLaporanTersedia
} from "./state.js";

export { perbaruiStatusJaringanLaporan } from "./view.js";

export { initHalamanLaporan, subscribeLaporan, unsubscribeLaporan } from "./controller.js";
