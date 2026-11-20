/**
 * JEMBATAN SEMENTARA — Tahap 3b.
 *
 * Seluruh isi modul Pengaturan kini berada di js/modules/pengaturan/
 * (state.js, view.js, controller.js, index.js). Berkas ini hanya meneruskan
 * ekspor agar konsumen lama (app.js, modules/dashboard) tetap berjalan.
 *
 * Langkah berikutnya (3b-2): arahkan konsumen langsung ke modules/pengaturan/index.js,
 * lalu hapus berkas ini.
 */
export * from "./modules/pengaturan/index.js";
