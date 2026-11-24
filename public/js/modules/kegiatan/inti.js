/**
 * Inti State Modul Kegiatan (2026-11-25: pecahan dari state.js)
 *
 * Pemilik tunggal seluruh state memori modul kegiatan: tiga peta kegiatan
 * (jendela tanggal, halaman, tambahan), kursor dan bendera paginasi, daftar
 * pemberitahuan perubahan, opsi peristiwa DOM, serta operasi mutasi.
 * TANPA DOM.
 *
 * Berkas ini adalah lapisan dasar modul: `kueri.js` (pembacaan sekali pakai) dan
 * `langganan.js` (langganan realtime) mengimpor state bersama dari sini.
 * `state.js` hanya menjadi pintu re-export agar index.js dan konsumen lain tetap
 * memakai jalur `./state.js` seperti semula.
 */
import { DAFTAR_STATUS_KEGIATAN, KOLEKSI } from "../../config/constants.js";
import { perbaruiItem, hapusItem } from "../../services/firestoreRepository.js";
import { buatManajerKategori, KATEGORI_KEGIATAN_BAWAAN } from "../kategori/index.js";

export const manajerKategoriKegiatan = buatManajerKategori({
  namaKoleksiKategori: KOLEKSI.KATEGORI_KEGIATAN,
  namaKoleksiPemakai: KOLEKSI.KEGIATAN,
  labelItemPemakai: "kegiatan",
  daftarBawaan: KATEGORI_KEGIATAN_BAWAAN
});

// Cache memori internal kegiatan aktif yang telah dimuat
export const petaKegiatanJendela = new Map();
export const petaKegiatanHalaman = new Map();
export const petaKegiatanTambahan = new Map();

let lastDocKegiatanHalaman = null;
let adaLebihBanyakKegiatanHalaman = false;
let sedangMuatLebihBanyakKegiatan = false;

let sudahDimuatPertamaKali = false;
const listenersPerubahanKegiatan = new Set();

// Opsi peristiwa DOM (dipasang controller): onSuksesJendela, onGalatJendela,
// onGalatHalaman, onGalatKategori, onKategoriOk, onMuatLebihGalat.
let opsiPeristiwa = {};

export function setelOpsiPeristiwaKegiatan(opsi = {}) {
  opsiPeristiwa = opsi || {};
}

/** Pembaca opsi peristiwa untuk langganan.js (berkas itu tidak boleh menulisnya). */
export function getOpsiPeristiwaKegiatan() {
  return opsiPeristiwa;
}

/**
 * Normalisasi satu dokumen Firestore (objek biasa { id, ...data } dari
 * services/firestoreRepository.js) menjadi bentuk yang dipakai seluruh UI.
 * Dipakai oleh kueri.js (paginasi & ambil-semua) dan langganan.js (dua listener)
 * agar bentuknya seragam.
 */
export function petakanKegiatan(d) {
  const data = d || {};
  return {
    id: data.id,
    judul: String(data.judul || ""),
    catatan: String(data.catatan || ""),
    tanggal: String(data.tanggal || ""),
    waktuMulai: String(data.waktuMulai || ""),
    waktuSelesai: String(data.waktuSelesai || ""),
    lokasi: String(data.lokasi || ""),
    kategoriId: String(data.kategoriId || ""),
    status: DAFTAR_STATUS_KEGIATAN.includes(data.status) ? data.status : "Rencana",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    dihapusAt: data.dihapusAt || null
  };
}

/**
 * Menggabungkan ketiga sumber data. Untuk id yang sama, salinan dengan updatedAt
 * paling baru yang menang; jika sama, sumber yang lebih "hidup" (listener) menang.
 */
function gabungkanPetaKegiatan() {
  const gabungan = new Map();
  const tambahkan = (peta) => {
    peta.forEach((item, id) => {
      const lama = gabungan.get(id);
      if (!lama || String(item.updatedAt || "") >= String(lama.updatedAt || "")) {
        gabungan.set(id, item);
      }
    });
  };
  // Dari prioritas terendah ke tertinggi
  tambahkan(petaKegiatanTambahan);
  tambahkan(petaKegiatanHalaman);
  tambahkan(petaKegiatanJendela);
  return gabungan;
}

// --- Pembacaan ---------------------------------------------------------------

/**
 * Mengembalikan seluruh kegiatan aktif (tanpa dihapusAt) yang saat ini berada di memori
 * (gabungan listener jendela, listener halaman, dan hasil fetch).
 */
export function getDaftarKegiatan() {
  return Array.from(gabungkanPetaKegiatan().values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Mengembalikan daftar kegiatan khusus pada jendela tanggal aktif (Dashboard & Jadwal).
 */
export function getKegiatanJendela() {
  return Array.from(petaKegiatanJendela.values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Kompatibilitas mundur: tempat sampah kini memiliki listener mandiri di modul sampah,
 * namun fungsi ini tetap dipertahankan agar modul lain tidak patah.
 */
export function getDaftarKegiatanDiSampah() {
  return Array.from(gabungkanPetaKegiatan().values())
    .filter((item) => Boolean(item.dihapusAt))
    .map((item) => ({ ...item }));
}

export function isKegiatanSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function tandaiKegiatanSudahDimuat(nilai = true) {
  sudahDimuatPertamaKali = Boolean(nilai);
}

export function getAdaLebihBanyakKegiatan() {
  return adaLebihBanyakKegiatanHalaman;
}

export function setAdaLebihBanyakKegiatan(nilai) {
  adaLebihBanyakKegiatanHalaman = Boolean(nilai);
}

export function getSedangMuatLebihKegiatan() {
  return sedangMuatLebihBanyakKegiatan;
}

export function setSedangMuatLebihKegiatan(nilai) {
  sedangMuatLebihBanyakKegiatan = Boolean(nilai);
}

/** Kursor paginasi server mentah (DocumentSnapshot); hanya kueri.js & langganan.js memakainya. */
export function getKursorHalamanKegiatan() {
  return lastDocKegiatanHalaman;
}

export function setKursorHalamanKegiatan(kursor) {
  lastDocKegiatanHalaman = kursor || null;
}

// --- Pemberitahuan perubahan ------------------------------------------------

export function onPerubahanKegiatan(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanKegiatan.add(listener);
  return () => listenersPerubahanKegiatan.delete(listener);
}

export function beritahuPerubahanKegiatan() {
  const salinan = getDaftarKegiatan();
  const statusMuat = sudahDimuatPertamaKali;
  listenersPerubahanKegiatan.forEach((fn) => {
    try { fn(salinan, statusMuat); } catch (_err) {}
  });
}

/** Menerapkan perubahan ke semua salinan lokal sebuah kegiatan. */
export function terapkanPerubahanLokalKegiatan(id, perubahan) {
  [petaKegiatanJendela, petaKegiatanHalaman, petaKegiatanTambahan].forEach((peta) => {
    const item = peta.get(id);
    if (item) peta.set(id, { ...item, ...perubahan });
  });
}

// --- Mutasi (Firestore + cache lokal) ----------------------------------------

export async function hapusLunakKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  await perbaruiItem(KOLEKSI.KEGIATAN, targetId, {
    dihapusAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  petaKegiatanJendela.delete(targetId);
  petaKegiatanHalaman.delete(targetId);
  petaKegiatanTambahan.delete(targetId);
  beritahuPerubahanKegiatan();
}

export async function pulihkanKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  await perbaruiItem(KOLEKSI.KEGIATAN, targetId, {
    dihapusAt: null,
    updatedAt: new Date().toISOString()
  });
}

export async function hapusPermanenKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  await hapusItem(KOLEKSI.KEGIATAN, targetId);
  petaKegiatanJendela.delete(targetId);
  petaKegiatanHalaman.delete(targetId);
  petaKegiatanTambahan.delete(targetId);
  beritahuPerubahanKegiatan();
}

export async function ubahStatusKegiatanCepat(id, statusBaru) {
  const targetId = String(id || "").trim();
  if (!targetId || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) {
    throw new Error("Status kegiatan tidak valid.");
  }
  const sebelumnya = getDaftarKegiatan().find((item) => item.id === targetId) || null;
  const sekarang = new Date().toISOString();

  // Perbarui tampilan seketika (optimistis), lalu simpan ke Firestore
  terapkanPerubahanLokalKegiatan(targetId, { status: statusBaru, updatedAt: sekarang });
  beritahuPerubahanKegiatan();

  try {
    await perbaruiItem(KOLEKSI.KEGIATAN, targetId, {
      status: statusBaru,
      updatedAt: sekarang
    });
  } catch (err) {
    if (sebelumnya) {
      terapkanPerubahanLokalKegiatan(targetId, {
        status: sebelumnya.status,
        updatedAt: sebelumnya.updatedAt
      });
    }
    beritahuPerubahanKegiatan();
    throw err;
  }
}
