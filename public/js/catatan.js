/**
 * Jembatan kompatibilitas (Tahap 3).
 * Seluruh isi catatan.js kini berada di modules/catatan/.
 * Berkas ini hanya me-re-export API lama agar konsumen yang belum diarahkan
 * tetap berfungsi. Akan dihapus setelah seluruh konsumen mengimpor langsung
 * dari modules/catatan/index.js (tahap berikutnya).
 */
export {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN,
  daftarkanSumberKegiatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah,
  hapusLunakCatatan,
  pulihkanCatatan,
  hapusPermanenCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  urutkanDaftarCatatan,
  getCatatanTerkaitKegiatan,
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
  perbaruiStatusJaringanCatatan,
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai,
  sorotCatatanDiHalaman,
  daftarkanPembukaDetailKegiatanCatatan,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc,
  initHalamanCatatan,
  subscribeCatatan,
  unsubscribeCatatan
} from "./modules/catatan/index.js";
