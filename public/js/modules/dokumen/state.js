/**
 * State Modul Dokumen — pintu re-export
 * (2026-11-25: isi asli dipecah menjadi inti.js, kueri.js, dan langganan.js)
 *
 * Berkas ini sengaja hanya meneruskan nama-nama lama agar index.js, view.js,
 * controller.js, folder.js, unggah-kegiatan.js, dan seluruh konsumen luar tetap
 * memakai jalur `./state.js` tanpa perubahan. Jangan menambah logika di sini.
 *
 * Susunan lapisan (impor satu arah, tanpa lingkaran):
 *   state.js -> inti.js <- (kueri.js, langganan.js)
 */
export {
  // state bersama, pembacaan, pemberitahuan, dan mutasi
  manajerKategoriDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  tandaiDokumenSudahDimuat,
  getPenandaHalamanAkhir,
  getKursorTambahan,
  setKursorTambahan,
  adaLebihBanyakDokumen,
  setAdaLebihBanyakDokumen,
  sedangMemuatLebihDokumen,
  setSedangMemuatLebihDokumen,
  hapusDokumenDariPeta,
  onPerubahanDokumen,
  beritahuPerubahanDokumen,
  hapusLunakDokumen,
  pulihkanDokumen,
  hapusPermanenDokumen,
} from "./inti.js";

export {
  // pembacaan sekali pakai: agregasi pemakai, paginasi, ambil-semua
  hitungDokumenPemakaiServer,
  hitungDokumenPemakaiLokal,
  muatLebihBanyakDokumen,
  ambilSemuaDokumenSekaliPakai,
} from "./kueri.js";

export {
  // langganan realtime: kategori + 100 dokumen terbaru
  langgananDokumen,
  lepasLanggananDokumen,
} from "./langganan.js";
