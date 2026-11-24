/**
 * State Modul Kegiatan — pintu re-export
 * (2026-11-25: isi asli dipecah menjadi inti.js, kueri.js, dan langganan.js)
 *
 * Berkas ini sengaja hanya meneruskan nama-nama lama agar index.js, view.js,
 * controller.js, dan seluruh konsumen luar tetap memakai jalur `./state.js`
 * tanpa perubahan. Jangan menambah logika di sini.
 *
 * Susunan lapisan (impor satu arah, tanpa lingkaran):
 *   state.js -> inti.js -> (kueri.js, langganan.js)
 */
export {
  // state bersama, pembacaan, pemberitahuan, dan mutasi
  manajerKategoriKegiatan,
  setelOpsiPeristiwaKegiatan,
  getDaftarKegiatan,
  getKegiatanJendela,
  getDaftarKegiatanDiSampah,
  isKegiatanSudahDimuat,
  tandaiKegiatanSudahDimuat,
  getAdaLebihBanyakKegiatan,
  getSedangMuatLebihKegiatan,
  onPerubahanKegiatan,
  beritahuPerubahanKegiatan,
  terapkanPerubahanLokalKegiatan,
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hapusPermanenKegiatan,
  ubahStatusKegiatanCepat
} from "./inti.js";

export {
  // pembacaan sekali pakai: agregasi, paginasi, ambil-semua, rentang tanggal
  hitungKegiatanPemakaiServer,
  muatLebihBanyakKegiatan,
  ambilSemuaKegiatanSekaliPakai,
  ambilKegiatanRentangTanggal
} from "./kueri.js";

export {
  // langganan realtime: jendela kalender, halaman, kategori
  hitungRentangJendela,
  sinkronkanJendelaTanggalKegiatan,
  mulaiLanggananJendelaKegiatan,
  mulaiLanggananHalamanKegiatan,
  langgananKategoriKegiatan,
  lepasLanggananKegiatan
} from "./langganan.js";
