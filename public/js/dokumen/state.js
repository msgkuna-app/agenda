/**
 * Modul State Dokumen Terpusat
 * Menyatukan variabel keadaan reaktif dokumen dalam satu objek state tunggal (Fase 7C)
 */

export const stateDokumen = {
  petaDokumenHalaman: new Map(),
  petaDokumenTambahan: new Map(),

  lastDocDokumenHalaman: null,
  adaLebihBanyakDokumenHalaman: false,
  sedangMuatLebihDokumen: false,

  sudahDimuatPertamaKali: false,
  antarmukaSudahDiikat: false,
  dialogKelolaKategoriDokCtrl: null,
  listenersPerubahanDokumen: new Set(),

  // Filter, Pencarian, & Urutan
  kataKunciCari: "",
  filterKategoriId: "ALL",
  urutBerdasarkan: "tanggal", // "tanggal" | "nama" | "ukuran"
  arahUrutan: "desc", // "asc" | "desc"
  batasTampil: 40,
  pengendaliFilterDokumen: null,

  // Menu Aksi Kebab
  idMenuTitikTigaTerbuka: null,

  // Elemen fokus sebelum modal dibuka
  fokusSebelumModalDokumen: null,

  // Modal Unggah Dokumen
  unggahModalTerbuka: false,
  pengendaliUnggahAktif: null,
  berkasDriveTersimpanPending: null,
  dataFormUploadPending: null,
  sedangMenyimpanMetadata: false,

  // Modal Ubah Metadata Dokumen
  editModalTerbuka: false,

  // Modal Hapus Dokumen
  hapusModalTerbuka: false,
  dokumenAkanDihapus: null,

  // Modal Rapikan Dokumen ke Folder Kategori
  rapikanModalTerbuka: false,
  sedangMerapikan: false,
  batalkanRapikan: false,

  // Langganan Snapshot Firestore
  unsubscribeSnapshotDokumen: null
};

/**
 * Mengambil seluruh daftar dokumen gabungan halaman dan tambahan.
 * @returns {Array<Object>}
 */
export function getDaftarDokumen() {
  const gabungan = new Map();
  stateDokumen.petaDokumenHalaman.forEach((v, k) => gabungan.set(k, v));
  stateDokumen.petaDokumenTambahan.forEach((v, k) => gabungan.set(k, v));
  return Array.from(gabungan.values()).map((d) => ({ ...d }));
}

/**
 * Memeriksa apakah snapshot dokumen sudah pernah dimuat pertama kali.
 * @returns {boolean}
 */
export function isDokumenSudahDimuat() {
  return stateDokumen.sudahDimuatPertamaKali;
}

/**
 * Mendaftarkan pendengar perubahan data dokumen.
 * @param {Function} listener
 * @returns {Function} Fungsi unsubscribe listener
 */
export function onPerubahanDokumen(listener) {
  if (typeof listener !== "function") return () => {};
  stateDokumen.listenersPerubahanDokumen.add(listener);
  return () => stateDokumen.listenersPerubahanDokumen.delete(listener);
}

/**
 * Memberitahukan semua pendengar saat data dokumen berubah.
 */
export function beritahuPerubahanDokumen() {
  const salinan = getDaftarDokumen();
  const statusMuat = stateDokumen.sudahDimuatPertamaKali;
  stateDokumen.listenersPerubahanDokumen.forEach((fn) => {
    try {
      fn(salinan, statusMuat);
    } catch (_e) {}
  });
}

/**
 * Mengatur ulang state dokumen ke kondisi awal (misal saat logout).
 */
export function resetStateDokumen() {
  stateDokumen.petaDokumenHalaman.clear();
  stateDokumen.petaDokumenTambahan.clear();
  stateDokumen.lastDocDokumenHalaman = null;
  stateDokumen.adaLebihBanyakDokumenHalaman = false;
  stateDokumen.sedangMuatLebihDokumen = false;
  stateDokumen.sudahDimuatPertamaKali = false;
  stateDokumen.idMenuTitikTigaTerbuka = null;
  stateDokumen.fokusSebelumModalDokumen = null;

  // Reset modal states
  stateDokumen.unggahModalTerbuka = false;
  if (stateDokumen.pengendaliUnggahAktif) {
    try {
      stateDokumen.pengendaliUnggahAktif.abort();
    } catch (_e) {}
    stateDokumen.pengendaliUnggahAktif = null;
  }
  stateDokumen.berkasDriveTersimpanPending = null;
  stateDokumen.dataFormUploadPending = null;
  stateDokumen.sedangMenyimpanMetadata = false;

  stateDokumen.editModalTerbuka = false;
  stateDokumen.hapusModalTerbuka = false;
  stateDokumen.dokumenAkanDihapus = null;

  stateDokumen.rapikanModalTerbuka = false;
  stateDokumen.sedangMerapikan = false;
  stateDokumen.batalkanRapikan = false;
}
