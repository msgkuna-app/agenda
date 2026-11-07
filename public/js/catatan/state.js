/**
 * Modul State Catatan (Fase 7C)
 * Mengelola state data Firestore, paginasi, filter lokal, modal, dan notifikasi pendengar.
 */
import { urutkanDaftarCatatan } from "./util.js";

export const petaCatatanHalaman = new Map();
export const petaCatatanTambahan = new Map();
export const listenersPerubahanCatatan = new Set();

export const stateCatatan = {
  unsubscribeSnapshot: null,
  lastDocHalaman: null,
  adaLebihBanyak: false,
  sedangMuatLebih: false,
  sedangMencariSemua: false,
  seluruhCatatanSudahDimuat: false,
  sudahDimuatPertamaKali: false,
  antarmukaSudahDiikat: false,
  kataKunciCari: "",
  filterJenis: "ALL",
  urutanTanggal: "desc",
  pengendaliFilter: null,
  singkatModalTerbuka: false,
  gdocModalTerbuka: false,
  hapusSingkatModalTerbuka: false,
  hapusGdocModalTerbuka: false,
  sedangMembuatGdoc: false,
  idCatatanSingkatHapus: null,
  itemCatatanGdocHapus: null,
  fokusSebelumModal: null,
  judulOtomatisGdocTerakhir: "",
  pembukaDetailKegiatanEksternal: null,
  timerSorotCatatan: null
};

export function isCatatanSudahDimuat() {
  return stateCatatan.sudahDimuatPertamaKali;
}

export function onPerubahanCatatan(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanCatatan.add(listener);
  return () => listenersPerubahanCatatan.delete(listener);
}

export function beritahuPerubahanCatatan() {
  const salinan = getDaftarCatatan();
  listenersPerubahanCatatan.forEach((fn) => {
    try {
      fn(salinan, stateCatatan.sudahDimuatPertamaKali);
    } catch (_err) {}
  });
}

export function daftarkanPembukaDetailKegiatanCatatan(fn) {
  stateCatatan.pembukaDetailKegiatanEksternal = typeof fn === "function" ? fn : null;
}

export function getDaftarCatatan() {
  const gabungan = new Map();
  petaCatatanHalaman.forEach((v, k) => gabungan.set(k, v));
  petaCatatanTambahan.forEach((v, k) => gabungan.set(k, v));

  return Array.from(gabungan.values())
    .filter((c) => !c.dihapusAt)
    .map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

export function getDaftarCatatanDiSampah() {
  const gabungan = new Map();
  petaCatatanHalaman.forEach((v, k) => gabungan.set(k, v));
  petaCatatanTambahan.forEach((v, k) => gabungan.set(k, v));

  return Array.from(gabungan.values())
    .filter((c) => Boolean(c.dihapusAt))
    .map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

export function getCatatanTerkaitKegiatan(kegiatanId) {
  const target = String(kegiatanId || "").trim();
  if (!target) return [];
  return urutkanDaftarCatatan(
    getDaftarCatatan().filter((c) => String(c.kegiatanId || "").trim() === target),
    "desc"
  ).map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}