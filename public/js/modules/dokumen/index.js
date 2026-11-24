/**
 * Pintu Publik Modul Dokumen (Tahap 3d)
 * Menjaga API yang sama dengan dokumen.js lama agar konsumen
 * (app.js, laporan, pencarian-global, dashboard, pengaturan) tidak perlu diubah.
 */
import { MAKS_UKURAN_BERKAS_MB, UKURAN_HALAMAN_DOKUMEN } from "../../config/constants.js";

// --- State -------------------------------------------------------------------
export {
  manajerKategoriDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  onPerubahanDokumen,
  hitungDokumenPemakaiServer,
  muatLebihBanyakDokumen,
  ambilSemuaDokumenSekaliPakai,
  hapusLunakDokumen,
  pulihkanDokumen,
  hapusPermanenDokumen,
} from "./state.js";

// --- Format ------------------------------------------------------------------
export {
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime,
} from "./format.js";

// --- View --------------------------------------------------------------------
export { perbaruiStatusJaringanDokumen } from "./view.js";

// --- Controller --------------------------------------------------------------
export {
  initHalamanDokumen,
  subscribeDokumen,
  unsubscribeDokumen,
  sinkronkanSatuFolderKategoriDokumen,
  terapkanFilterKategoriDokumen,
  bukaModalUnggahDokumen,
} from "./controller.js";

// Unggahan dokumen dari form kegiatan.
export { unggahBerkasSebagaiDokumenKegiatan } from "./unggah-kegiatan.js";

// Konstanta yang dulu di-re-export dokumen.js — dipertahankan demi kompatibilitas.
export { MAKS_UKURAN_BERKAS_MB, UKURAN_HALAMAN_DOKUMEN };
