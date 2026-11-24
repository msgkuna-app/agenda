/**
 * State Modul Pengaturan (Tahap 3b: dipisah dari pengaturan.js; Tahap 6e: dipecah)
 * Pintu re-export state pengaturan. Isi sebenarnya dibagi menurut tanggung jawab:
 *   - libur.js    : pengaturan hari libur & hari besar (Firestore + localStorage)
 *   - cadangan.js : status & interval pengingat cadangan, daftar koleksi ekspor
 * Konsumen (index.js, view.js, controller.js) tidak perlu diubah.
 *
 * Aturan: berkas ini tidak menyentuh DOM dan tidak mengimpor modul tampilan.
 */
export {
  onPerubahanHariLibur,
  bacaPengaturanHariLiburLokal,
  muatPengaturanHariLibur,
  simpanPengaturanHariLibur,
  ambilKonfigurasiHariLiburUntukCadangan
} from "./libur.js";

export {
  statusCadangan,
  onPerubahanCadangan,
  beritahuPerubahanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  muatPengaturanCadangan,
  simpanIntervalCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  getStatusCadanganMentah,
  KOLEKSI_CADANGAN
} from "./cadangan.js";
