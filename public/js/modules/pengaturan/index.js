/**
 * Pintu Publik Modul Pengaturan (Tahap 3b)
 * Menjaga API yang sama dengan pengaturan.js lama agar konsumen
 * (app.js, modules/dashboard) tidak perlu diubah pada tahap ini.
 */
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KUNCI_STORAGE_HARI_LIBUR,
} from "../../config/constants.js";
import { eksporSeluruhDataJson } from "./controller.js";

// --- State: hari libur -------------------------------------------------------
export {
  onPerubahanHariLibur,
  bacaPengaturanHariLiburLokal,
  muatPengaturanHariLibur,
  simpanPengaturanHariLibur,
  ambilKonfigurasiHariLiburUntukCadangan,
} from "./state.js";

// --- State: status cadangan --------------------------------------------------
export {
  onPerubahanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  muatPengaturanCadangan,
  simpanIntervalCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  KOLEKSI_CADANGAN,
} from "./state.js";

// --- View --------------------------------------------------------------------
export {
  renderDaftarHariLiburPengaturan,
  segarkanTampilanPengaturan,
  setUmpanBalikPengaturan,
} from "./view.js";

// --- Controller --------------------------------------------------------------
export {
  initHalamanPengaturan,
  resetHalamanPengaturanSaatKeluar,
  jalankanMigrasiDihapusAt,
} from "./controller.js";

export { eksporSeluruhDataJson };

// Kunci localStorage tetap diekspor agar kompatibel dengan impor lama.
export {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KUNCI_STORAGE_HARI_LIBUR,
};
