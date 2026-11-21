/**
 * Titik masuk Modul Kategori (Tahap 3: dipisah dari kategori.js)
 * Kontrak publik yang dipakai konsumen: modules/kegiatan, modules/dokumen,
 * modules/laporan, dan modules/pengaturan.
 */
export {
  PRESET_WARNA_KATEGORI,
  KATEGORI_KEGIATAN_BAWAAN,
  KATEGORI_DOKUMEN_BAWAAN,
  TANPA_KATEGORI_INFO,
  normalisasiWarnaKategori,
  urutkanDaftarKategori
} from "./format.js";

export { buatManajerKategori } from "./state.js";

export { inisialisasiDialogKelolaKategori } from "./controller.js";
