/**
 * Re-export tipis untuk modul Pengaturan & Cadangan (Agenda & Arsip).
 * Mempertahankan backward compatibility untuk seluruh modul yang mengimpor dari ./pengaturan.js.
 */
export {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KOLEKSI_CADANGAN,
  onPerubahanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  muatPengaturanCadangan,
  simpanIntervalCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  segarkanTampilanPengaturan,
  eksporSeluruhDataJson,
  jalankanMigrasiDihapusAt,
  initHalamanPengaturan,
  resetHalamanPengaturanSaatKeluar
} from "./pengaturan/index.js";