/**
 * Modul State Terpusat Kegiatan
 * Mengelola cache memori internal, status langganan Firestore, filter,
 * serta pendengar perubahan kegiatan.
 */
import {
  buatManajerKategori,
  KATEGORI_KEGIATAN_BAWAAN
} from "../kategori.js";

export const manajerKategoriKegiatan = buatManajerKategori({
  namaKoleksiKategori: "kategoriKegiatan",
  namaKoleksiPemakai: "kegiatan",
  labelItemPemakai: "kegiatan",
  daftarBawaan: KATEGORI_KEGIATAN_BAWAAN
});

export const stateKegiatan = {
  // Cache memori internal
  petaJendela: new Map(),
  petaHalaman: new Map(),
  petaTambahan: new Map(),

  // Langganan & Jendela Aktif
  unsubscribeJendela: null,
  unsubscribeHalaman: null,
  jendelaAwalAktif: "",
  jendelaAkhirAktif: "",

  // Paginasi Halaman
  lastDocHalaman: null,
  adaLebihBanyakHalaman: false,
  sedangMuatLebihBanyak: false,

  // Status Muat & Inisialisasi
  sudahDimuatPertamaKali: false,
  antarmukaSudahDiikat: false,
  dialogKelolaKategoriCtrl: null,
  listenersPerubahan: new Set(),

  // Filter & Pengurutan
  kataKunciCari: "",
  filterKategoriId: "ALL",
  filterStatus: "ALL",
  urutanTanggal: "asc",
  pengendaliFilter: null,

  // Dialog & Modal
  formModalTerbuka: false,
  hapusModalTerbuka: false,
  idKegiatanAkanDihapus: null,
  fokusSebelumModal: null,

  // Integrasi Detail
  pembukaDetailKegiatanFn: null,
  idKegiatanTerakhirDiklik: "",
  idKegiatanDetailAktif: ""
};

export function daftarkanPembukaDetailKegiatan(fn) {
  stateKegiatan.pembukaDetailKegiatanFn = typeof fn === "function" ? fn : null;
}

/**
 * Mengembalikan seluruh kegiatan aktif (tanpa dihapusAt) yang saat ini berada di memori
 * (gabungan listener jendela, listener halaman, dan hasil fetch).
 */
export function getDaftarKegiatan() {
  const gabungan = new Map();
  stateKegiatan.petaJendela.forEach((v, k) => gabungan.set(k, v));
  stateKegiatan.petaHalaman.forEach((v, k) => gabungan.set(k, v));
  stateKegiatan.petaTambahan.forEach((v, k) => gabungan.set(k, v));

  return Array.from(gabungan.values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Mengembalikan daftar kegiatan khusus pada jendela tanggal aktif (Dashboard & Jadwal).
 */
export function getKegiatanJendela() {
  return Array.from(stateKegiatan.petaJendela.values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Kompatibilitas mundur: tempat sampah kini memiliki listener mandiri di sampah.js,
 * namun fungsi ini tetap dipertahankan agar modul lain tidak patah.
 */
export function getDaftarKegiatanDiSampah() {
  const gabungan = new Map();
  stateKegiatan.petaJendela.forEach((v, k) => gabungan.set(k, v));
  stateKegiatan.petaHalaman.forEach((v, k) => gabungan.set(k, v));
  stateKegiatan.petaTambahan.forEach((v, k) => gabungan.set(k, v));

  return Array.from(gabungan.values())
    .filter((item) => Boolean(item.dihapusAt))
    .map((item) => ({ ...item }));
}

export function isKegiatanSudahDimuat() {
  return stateKegiatan.sudahDimuatPertamaKali;
}

export function onPerubahanKegiatan(listener) {
  if (typeof listener !== "function") return () => {};
  stateKegiatan.listenersPerubahan.add(listener);
  return () => stateKegiatan.listenersPerubahan.delete(listener);
}

export function beritahuPerubahanKegiatan() {
  const salinan = getDaftarKegiatan();
  const statusMuat = stateKegiatan.sudahDimuatPertamaKali;
  stateKegiatan.listenersPerubahan.forEach((fn) => {
    try { fn(salinan, statusMuat); } catch (_err) {}
  });
}

export function hapusCacheItem(id) {
  stateKegiatan.petaJendela.delete(id);
  stateKegiatan.petaHalaman.delete(id);
  stateKegiatan.petaTambahan.delete(id);
}