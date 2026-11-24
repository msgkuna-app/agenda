/**
 * State Modul Catatan (Tahap 3: dipisah dari catatan.js; Tahap 6d: dipecah)
 * Pintu re-export state catatan. Isi sebenarnya dibagi menurut tanggung jawab:
 *   - inti.js      : pemilik state memori, pembacaan sinkron, pemberitahuan
 *   - mutasi.js    : hapus lunak, pulihkan, hapus permanen
 *   - kueri.js     : pembacaan sekali pakai (paginasi & ambil-semua)
 *   - langganan.js : langganan realtime & pelepasan langganan
 * Konsumen (index.js, view.js, controller.js, dan modul lain) tidak berubah.
 */
export {
  daftarkanSumberKegiatan,
  ambilDaftarKegiatanTerkait,
  langgananPerubahanKegiatan,
  cariKegiatanId,
  setelOpsiPeristiwaCatatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah,
  isCatatanSudahDimuat,
  getAdaLebihBanyakCatatan,
  getSedangMuatLebihCatatan,
  getSedangMencariSemuaCatatan,
  getSeluruhCatatanSudahDimuat,
  onPerubahanCatatan,
  beritahuPerubahanCatatan,
  getCatatanTerkaitKegiatan
} from "./inti.js";

export {
  hapusLunakCatatan,
  pulihkanCatatan,
  hapusPermanenCatatan
} from "./mutasi.js";

export {
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai
} from "./kueri.js";

export {
  langgananCatatan,
  hentikanLanggananDataCatatan,
  setelBelumDimuatPertamaKali
} from "./langganan.js";
