/**
 * Pintu Publik Modul Dashboard (Tahap 3a)
 * Modul lain cukup mengimpor dari berkas ini. Struktur internal
 * (state.js, view.js, controller.js) tidak perlu diketahui pemanggil.
 */
export { initHalamanDashboard, renderDashboard } from "./controller.js";
export {
  renderKartuDokumenDashboard,
  renderKartuCatatanDashboard,
  perbaruiBannerPengingatCadangan,
} from "./view.js";
