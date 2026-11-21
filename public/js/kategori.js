/**
 * Jembatan kompatibilitas Kategori (Tahap 3).
 * Isi asli kategori.js (1.271 baris) sudah dipindah ke modules/kategori/.
 * Berkas ini hanya re-export; akan dihapus pada Tahap 3-2 setelah
 * modules/kegiatan, modules/dokumen, modules/laporan, dan modules/pengaturan
 * diarahkan langsung ke modules/kategori/index.js.
 */
export {
  PRESET_WARNA_KATEGORI,
  KATEGORI_KEGIATAN_BAWAAN,
  KATEGORI_DOKUMEN_BAWAAN,
  TANPA_KATEGORI_INFO,
  normalisasiWarnaKategori,
  urutkanDaftarKategori,
  buatManajerKategori,
  inisialisasiDialogKelolaKategori
} from "./modules/kategori/index.js";
