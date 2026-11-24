/**
 * State Modul Catatan (Tahap 3: dipisah dari catatan.js)
 * Sumber kebenaran data catatan: peta memori, paginasi, CRUD Firestore/Drive,
 * langganan realtime, dan registri sumber kegiatan (pemutus siklus 3e).
 * TIDAK menyentuh DOM (pola pengaturan); view/controller mendengarkan
 * onPerubahanCatatan dan menyegarkan tampilan sendiri.
 */
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN,
  KOLEKSI
} from "../../config/constants.js";
import {
  langgananKoleksi,
  ambilDaftar,
  ambilSatu,
  perbaruiItem,
  hapusItem,
} from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import {
  pulihkanItemDariSampahDrive,
  formatPesanGalatDrive
} from "../../services/driveService.js";
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

let unsubscribeSnapshotCatatan = null;
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

function laporkanGalat(err) {
  if (opsiPeristiwa.onGalatHalaman) {
    opsiPeristiwa.onGalatHalaman({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
  }
}

/** Memetakan dokumen Firestore (objek biasa { id, ...data }) menjadi entri memori catatan. */
function petakanCatatan(d) {
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

export async function hapusLunakCatatan(id, driveDiSampah = false) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  await perbaruiItem(KOLEKSI.CATATAN, targetId, {
    dihapusAt: new Date().toISOString(),
    driveDiSampah: Boolean(driveDiSampah),
    updatedAt: new Date().toISOString()
  });
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
}

export async function pulihkanCatatan(id, itemOpsional = null) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");

  // Catatan di Tempat Sampah tidak ada di peta memori (listener menyaring dihapusAt),
  // sehingga datanya dibaca dari Firestore bila pemanggil tidak menyertakannya.
  let item = itemOpsional && typeof itemOpsional === "object" ? itemOpsional : null;
  let pesanDrive = "";
  if (!item) {
    try {
      item = await ambilSatu(KOLEKSI.CATATAN, targetId);
    } catch (_e) {
      pesanDrive =
        "Status dokumen Google Docs di Sampah Drive tidak dapat diperiksa (koneksi bermasalah). Jika perlu, pulihkan manual dari Sampah Google Drive.";
    }
  }

  if (item && item.jenis === JENIS_CATATAN_GDOC && item.driveDiSampah && item.docId) {
    try {
      await pulihkanItemDariSampahDrive(item.docId);
    } catch (err) {
      pesanDrive =
        err && err.isNotFound
          ? "Dokumen Google Docs tidak ditemukan di Google Drive (mungkin sudah dihapus permanen)."
          : `Dokumen Google Docs masih berada di Sampah Drive: ${formatPesanGalatDrive(err)}`;
    }
  }

  await perbaruiItem(KOLEKSI.CATATAN, targetId, {
    dihapusAt: null,
    driveDiSampah: false,
    updatedAt: new Date().toISOString()
  });
  return { pesanDrive };
}

export async function hapusPermanenCatatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  await hapusItem(KOLEKSI.CATATAN, targetId);
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
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

function simpanKePetaTambahan(items) {
  items.forEach((item) => {
    petaCatatanTambahan.set(item.id, petakanCatatan(item));
  });
}

/**
 * Fase 5: Memuat batch catatan berikutnya (paginasi).
 */
export async function muatLebihBanyakCatatan() {
  const kursorAwal = kursorCatatanTambahan || lastDocCatatanHalaman;
  if (sedangMuatLebihCatatan || !kursorAwal) return;
  sedangMuatLebihCatatan = true;
  beritahuPerubahanCatatan();

  try {
    const { items, meta } = await ambilDaftar(KOLEKSI.CATATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
      mulaiSetelah: kursorAwal,
      batas: UKURAN_HALAMAN_CATATAN,
    });
    simpanKePetaTambahan(items);

    if (meta.dokumenTerakhir) {
      kursorCatatanTambahan = meta.dokumenTerakhir;
    }
    adaLebihBanyakCatatan = meta.jumlah >= UKURAN_HALAMAN_CATATAN;
    beritahuPerubahanCatatan();
  } catch (err) {
    laporkanGalat(err);
  } finally {
    sedangMuatLebihCatatan = false;
    beritahuPerubahanCatatan();
  }
}

/**
 * Fase 5: Jembatan sekali pakai untuk mengambil seluruh catatan dari server.
 * Digunakan oleh Ekspor Cadangan, Laporan, dan Pencarian Global mendalam.
 */
export async function ambilSemuaCatatanSekaliPakai() {
  sedangMencariSemuaCatatan = true;
  beritahuPerubahanCatatan();

  try {
    const { items } = await ambilDaftar(KOLEKSI.CATATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
    });
    simpanKePetaTambahan(items);
    seluruhCatatanSudahDimuat = true;
    beritahuPerubahanCatatan();
    return getDaftarCatatan();
  } finally {
    sedangMencariSemuaCatatan = false;
    beritahuPerubahanCatatan();
  }
}

/**
 * Berlangganan listener 100 catatan terbaru (where dihapusAt == null).
 * Memperbarui peta halaman, kursor, dan flag, lalu memberitahu pendengar.
 */
export function langgananCatatan() {
  unsubscribeSnapshotCatatan = langgananKoleksi(
    KOLEKSI.CATATAN,
    {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
      batas: UKURAN_HALAMAN_CATATAN,
    },
    {
      onData: (items, meta) => {
        petaCatatanHalaman.clear();
        items.forEach((item) => {
          petaCatatanHalaman.set(item.id, petakanCatatan(item));
        });

        if (meta.dokumenTerakhir) {
          lastDocCatatanHalaman = meta.dokumenTerakhir;
        }
        if (!kursorCatatanTambahan) {
          adaLebihBanyakCatatan = meta.jumlah >= UKURAN_HALAMAN_CATATAN;
        }
        sudahDimuatPertamaKali = true;
        beritahuPerubahanCatatan();
      },
      onGalat: (err) => {
        sudahDimuatPertamaKali = true;
        laporkanGalat(err);
        beritahuPerubahanCatatan();
      }
    }
  );
}

/** Menghentikan listener dan mengosongkan seluruh data/flag memori (tanpa DOM). */
export function hentikanLanggananDataCatatan() {
  if (typeof unsubscribeSnapshotCatatan === "function") {
    try { unsubscribeSnapshotCatatan(); } catch (_e) {}
    unsubscribeSnapshotCatatan = null;
  }
  petaCatatanHalaman.clear();
  petaCatatanTambahan.clear();
  lastDocCatatanHalaman = null;
  kursorCatatanTambahan = null;
  adaLebihBanyakCatatan = false;
  sedangMuatLebihCatatan = false;
  sedangMencariSemuaCatatan = false;
  seluruhCatatanSudahDimuat = false;
  sudahDimuatPertamaKali = false;
}

/** Menandai belum dimuat lalu memberitahu (dipakai ulang saat langganan diulang). */
export function setelBelumDimuatPertamaKali() {
  sudahDimuatPertamaKali = false;
}
