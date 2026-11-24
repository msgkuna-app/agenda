/**
 * Inti State Modul Catatan (Tahap 6d: dipecah dari state.js)
 * Pemilik tunggal seluruh state memori modul catatan: registri sumber kegiatan,
 * dua peta catatan (halaman & tambahan), kursor, bendera muat, pendengar
 * perubahan, dan opsi peristiwa. Berisi pembacaan sinkron serta pemberitahuan
 * perubahan. Mutasi hapus/pulihkan ada di mutasi.js; pembacaan sekali pakai di
 * kueri.js; langganan realtime di langganan.js.
 * TIDAK menyentuh DOM (pola pengaturan); view/controller mendengarkan
 * onPerubahanCatatan dan menyegarkan tampilan sendiri.
 */
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC
} from "../../config/constants.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { urutkanDaftarCatatan } from "./format.js";

/**
 * Sumber data kegiatan (Tahap 3e: pemutusan siklus kegiatan <-> catatan).
 *
 * Modul catatan TIDAK mengimpor modul kegiatan. app.js menyuntikkan fungsi
 * pembaca kegiatan lewat daftarkanSumberKegiatan() saat boot. Nilai bawaan
 * sengaja kosong dan aman: bila registrasi terlewat, halaman catatan tetap
 * berfungsi, hanya pilihan "kegiatan terkait" yang kosong.
 */
const sumberKegiatan = {
  getDaftar: () => [],
  onPerubahan: () => () => {}
};

const petaCatatanHalaman = new Map();
const petaCatatanTambahan = new Map();

let lastDocCatatanHalaman = null;
let kursorCatatanTambahan = null;
let adaLebihBanyakCatatan = false;
let sedangMuatLebihCatatan = false;
let sedangMencariSemuaCatatan = false;
let seluruhCatatanSudahDimuat = false;

let sudahDimuatPertamaKali = false;
const listenersPerubahanCatatan = new Set();

/** Opsi peristiwa yang disuntikkan controller (galat tampilan). */
let opsiPeristiwa = {
  onGalatHalaman: null
};

/**
 * Mendaftarkan fungsi pembaca kegiatan dari luar modul (dipanggil app.js).
 * @param {{ getDaftar?: () => object[], onPerubahan?: (listener: Function) => (() => void) }} sumber
 */
export function daftarkanSumberKegiatan(sumber = {}) {
  if (sumber && typeof sumber.getDaftar === "function") {
    sumberKegiatan.getDaftar = sumber.getDaftar;
  }
  if (sumber && typeof sumber.onPerubahan === "function") {
    sumberKegiatan.onPerubahan = sumber.onPerubahan;
  }
}

export function ambilDaftarKegiatanTerkait() {
  try {
    return sumberKegiatan.getDaftar() || [];
  } catch (_e) {
    return [];
  }
}

export function langgananPerubahanKegiatan(listener) {
  return sumberKegiatan.onPerubahan(listener);
}

export function cariKegiatanId(id) {
  const target = String(id || "").trim();
  return target ? ambilDaftarKegiatanTerkait().find((k) => k.id === target) || null : null;
}

export function setelOpsiPeristiwaCatatan(opsi = {}) {
  opsiPeristiwa = {
    onGalatHalaman: typeof opsi.onGalatHalaman === "function" ? opsi.onGalatHalaman : null
  };
}

/** Melaporkan galat halaman lewat opsi yang disuntikkan controller. */
export function laporkanGalatCatatan(err) {
  if (opsiPeristiwa.onGalatHalaman) {
    opsiPeristiwa.onGalatHalaman({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
  }
}

/** Memetakan dokumen Firestore (objek biasa { id, ...data }) menjadi entri memori catatan. */
export function petakanCatatan(d) {
  const data = d || {};
  const jenis = data.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
  const entri = {
    id: data.id,
    jenis,
    judul: String(data.judul || ""),
    isi: jenis === JENIS_CATATAN_SINGKAT ? String(data.isi || "") : "",
    kategori: String(data.kategori || ""),
    tag: Array.isArray(data.tag) ? data.tag.map((t) => String(t || "").trim()).filter(Boolean) : [],
    kegiatanId: String(data.kegiatanId || ""),
    disematkan: Boolean(data.disematkan),
    tanggal: String(data.tanggal || ""),
    createdAt: String(data.createdAt || ""),
    updatedAt: String(data.updatedAt || ""),
    dihapusAt: data.dihapusAt || null,
    driveDiSampah: Boolean(data.driveDiSampah)
  };
  if (jenis === JENIS_CATATAN_GDOC) {
    entri.templat = String(data.templat || "kosong");
    entri.docId = String(data.docId || "");
    entri.tautan = String(data.tautan || "");
  }
  return entri;
}

export function getDaftarCatatan() {
  // Salinan dengan updatedAt terbaru menang; bila sama, data listener realtime (Halaman) menang.
  const gabungan = new Map();
  petaCatatanHalaman.forEach((v, k) => gabungan.set(k, v));
  petaCatatanTambahan.forEach((v, k) => {
    const lama = gabungan.get(k);
    if (!lama || String(v.updatedAt || "") > String(lama.updatedAt || "")) gabungan.set(k, v);
  });

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

export function isCatatanSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function getAdaLebihBanyakCatatan() {
  return adaLebihBanyakCatatan;
}

export function getSedangMuatLebihCatatan() {
  return sedangMuatLebihCatatan;
}

export function getSedangMencariSemuaCatatan() {
  return sedangMencariSemuaCatatan;
}

export function getSeluruhCatatanSudahDimuat() {
  return seluruhCatatanSudahDimuat;
}

export function onPerubahanCatatan(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanCatatan.add(listener);
  return () => listenersPerubahanCatatan.delete(listener);
}

export function beritahuPerubahanCatatan() {
  const salinan = getDaftarCatatan();
  listenersPerubahanCatatan.forEach((fn) => {
    try { fn(salinan, sudahDimuatPertamaKali); } catch (_err) {}
  });
}

export function getCatatanTerkaitKegiatan(kegiatanId) {
  const target = String(kegiatanId || "").trim();
  if (!target) return [];
  return urutkanDaftarCatatan(
    getDaftarCatatan().filter((c) => String(c.kegiatanId || "").trim() === target),
    "desc"
  ).map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

/* ── Penulis terkendali untuk kueri.js, langganan.js, dan mutasi.js ───────── */

export function getPenandaHalamanCatatan() {
  return lastDocCatatanHalaman;
}

export function setPenandaHalamanCatatan(dokumenTerakhir) {
  lastDocCatatanHalaman = dokumenTerakhir || null;
}

export function getKursorCatatanTambahan() {
  return kursorCatatanTambahan;
}

export function setKursorCatatanTambahan(kursor) {
  kursorCatatanTambahan = kursor || null;
}

export function setAdaLebihBanyakCatatan(nilai) {
  adaLebihBanyakCatatan = Boolean(nilai);
}

export function setSedangMuatLebihCatatan(nilai) {
  sedangMuatLebihCatatan = Boolean(nilai);
}

export function setSedangMencariSemuaCatatan(nilai) {
  sedangMencariSemuaCatatan = Boolean(nilai);
}

export function setSeluruhCatatanSudahDimuat(nilai) {
  seluruhCatatanSudahDimuat = Boolean(nilai);
}

export function setSudahDimuatPertamaKali(nilai) {
  sudahDimuatPertamaKali = Boolean(nilai);
}

/** Mengganti seluruh isi peta halaman (dipakai langgananCatatan saat snapshot tiba). */
export function simpanHalamanCatatan(items) {
  petaCatatanHalaman.clear();
  items.forEach((item) => {
    petaCatatanHalaman.set(item.id, petakanCatatan(item));
  });
}

/** Menambahkan hasil pembacaan sekali pakai ke peta tambahan. */
export function simpanKePetaTambahan(items) {
  items.forEach((item) => {
    petaCatatanTambahan.set(item.id, petakanCatatan(item));
  });
}

/** Menghapus satu id dari kedua peta (dipakai mutasi.js setelah perubahan status). */
export function hapusDariPetaCatatan(id) {
  petaCatatanHalaman.delete(id);
  petaCatatanTambahan.delete(id);
}

/** Mengosongkan kedua peta memori (dipakai saat langganan dihentikan). */
export function kosongkanPetaCatatan() {
  petaCatatanHalaman.clear();
  petaCatatanTambahan.clear();
}
