/**
 * Modul Catatan (Tahap 3: dipisah dari catatan.js)
 * Titik masuk tunggal modul catatan: merangkai state/format/view/controller
 * dan mengekspos API publik dengan paritas penuh terhadap catatan.js lama.
 */
export {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN
} from "../../config/constants.js";

export {
  daftarkanSumberKegiatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah,
  hapusLunakCatatan,
  pulihkanCatatan,
  hapusPermanenCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  getCatatanTerkaitKegiatan,
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai
} from "./state.js";

export {
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
  urutkanDaftarCatatan
} from "./format.js";

export {
  sorotCatatanDiHalaman,
  perbaruiStatusJaringanCatatan
} from "./view.js";

export {
  daftarkanPembukaDetailKegiatanCatatan,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc,
  initHalamanCatatan,
  subscribeCatatan,
  unsubscribeCatatan
} from "./controller.js";
