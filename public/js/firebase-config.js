/**
 * Jembatan Kompatibilitas firebase-config (Tahap 2a)
 * Seluruh isi kini berada di services/firestoreService.js.
 * Berkas ini hanya meneruskan ekspor agar 11 modul lama tidak perlu diubah sekaligus.
 * Akan dihapus pada Tahap 2b setelah semua konsumen mengimpor langsung dari services/.
 */
export * from "./services/firestoreService.js";
