/**
 * Pintu publik Modul Kegiatan (Tahap 3e)
 * Menjaga API lama kegiatan.js tetap utuh agar konsumen (app, jadwal, laporan,
 * dashboard, dokumen, pengaturan, pencarian-global, sampah) tidak perlu diubah
 * pada tahap ini.
 */
export {
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  getKegiatanJendela,
  getDaftarKegiatanDiSampah,
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hapusPermanenKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  ubahStatusKegiatanCepat,
  hitungKegiatanPemakaiServer,
  muatLebihBanyakKegiatan,
  ambilSemuaKegiatanSekaliPakai,
  ambilKegiatanRentangTanggal,
  sinkronkanJendelaTanggalKegiatan,
} from "./state.js";

export {
  daftarkanPembukaDetailKegiatan,
  bukaModalFormKegiatan,
  bukaDialogHapusKegiatan,
  terapkanFilterKategoriKegiatan,
  terapkanFilterStatusKegiatan,
  initHalamanKegiatan,
  subscribeKegiatan,
  unsubscribeKegiatan,
} from "./controller.js";

export { kelasBadgeStatus } from "./view.js";

// Pembantu format rentang tanggal (Tahap 8a) untuk konsumen di luar modul.
export { formatRentangTanggal, formatRentangTanggalSingkat } from "./format.js";

// Re-export seperti berkas lama (kegiatan.js baris 13) demi kompatibilitas.
export { DAFTAR_STATUS_KEGIATAN, UKURAN_HALAMAN_KEGIATAN } from "../../config/constants.js";
