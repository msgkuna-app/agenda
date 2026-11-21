/**
 * JEMBATAN SEMENTARA — Tahap 3d.
 *
 * Seluruh isi modul Dokumen kini berada di js/modules/dokumen/
 * (state.js, format.js, view.js, controller.js, index.js). Berkas ini hanya
 * meneruskan ekspor agar konsumen lama (app.js, laporan.js, pencarian-global.js,
 * modules/dashboard, modules/pengaturan) tetap berjalan.
 *
 * Langkah berikutnya (3d-2): arahkan konsumen langsung ke modules/dokumen/index.js,
 * lalu hapus berkas ini.
 */
export * from "./modules/dokumen/index.js";
