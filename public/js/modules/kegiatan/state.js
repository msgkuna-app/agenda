/**
 * State Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Menyimpan tiga peta kegiatan (jendela tanggal, halaman, tambahan), kursor
 * paginasi, dan langganan realtime Firestore. TIDAK boleh menyentuh DOM —
 * perubahan diberitahukan lewat onPerubahanKegiatan() dan peristiwa DOM
 * (tampilkan galat, segarkan dialog kategori) dilempar lewat opsi peristiwa
 * yang dipasang controller lewat setelOpsiPeristiwaKegiatan().
 */
import { DAFTAR_STATUS_KEGIATAN, UKURAN_HALAMAN_KEGIATAN, KOLEKSI } from "../../config/constants.js";
import {
  langgananKoleksi,
  ambilDaftar,
  perbaruiItem,
  hapusItem,
  hitungItem,
} from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { buatManajerKategori, KATEGORI_KEGIATAN_BAWAAN } from "../kategori/index.js";
import { tanggalLokal } from "../../util-tanggal.js";

export const manajerKategoriKegiatan = buatManajerKategori({
  namaKoleksiKategori: KOLEKSI.KATEGORI_KEGIATAN,
  namaKoleksiPemakai: KOLEKSI.KEGIATAN,
  labelItemPemakai: "kegiatan",
  daftarBawaan: KATEGORI_KEGIATAN_BAWAAN
});

// Cache memori internal kegiatan aktif yang telah dimuat
const petaKegiatanJendela = new Map();
const petaKegiatanHalaman = new Map();
const petaKegiatanTambahan = new Map();

let unsubscribeSnapshotJendela = null;
let unsubscribeSnapshotHalaman = null;
let jendelaAwalAktif = "";
let jendelaAkhirAktif = "";

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

/**
 * Normalisasi satu dokumen Firestore (objek biasa { id, ...data } dari
 * services/firestoreRepository.js) menjadi bentuk yang dipakai seluruh UI.
 * Dipakai oleh listener jendela, listener halaman, paginasi, dan ambil-semua
 * agar bentuknya seragam.
 */
function petakanKegiatan(d) {
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
 * Kompatibilitas mundur: tempat sampah kini memiliki listener mandiri di sampah.js,
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

export function getSedangMuatLebihKegiatan() {
  return sedangMuatLebihBanyakKegiatan;
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

// --- Pemanggilan Firestore ---------------------------------------------------

/**
 * Fase 5: Menghitung kegiatan yang menggunakan kategori tertentu secara akurat
 * lewat agregasi server (hitungItem) agar tidak bergantung pada data yang terpotong paginasi.
 */
export async function hitungKegiatanPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    return await hitungItem(KOLEKSI.KEGIATAN, [
      ["kategoriId", "==", target],
      ["dihapusAt", "==", null]
    ]);
  } catch (_e) {
    // Fallback luring ke memori yang sudah dimuat
    if (!target) {
      return getDaftarKegiatan().filter((item) => manajerKategoriKegiatan.cariInfoKategori(item.kategoriId).tetap).length;
    }
    return getDaftarKegiatan().filter((item) => String(item.kategoriId || "").trim() === target).length;
  }
}

/**
 * Memuat batch kegiatan halaman berikutnya (paginasi).
 * Mengembalikan pesan galat bila gagal; null bila berhasil. Pemanggil yang menampilkan.
 */
export async function muatLebihBanyakKegiatan() {
  if (sedangMuatLebihBanyakKegiatan || !lastDocKegiatanHalaman) return null;
  sedangMuatLebihBanyakKegiatan = true;
  beritahuPerubahanKegiatan();

  try {
    const { items, meta } = await ambilDaftar(KOLEKSI.KEGIATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggal", "desc"],
      mulaiSetelah: lastDocKegiatanHalaman,
      batas: UKURAN_HALAMAN_KEGIATAN,
    });
    items.forEach((item) => {
      petaKegiatanTambahan.set(item.id, petakanKegiatan(item));
    });

    // meta.dokumenTerakhir adalah DocumentSnapshot mentah — satu-satunya bentuk
    // yang diterima startAfter oleh Firestore.
    if (meta.dokumenTerakhir) {
      lastDocKegiatanHalaman = meta.dokumenTerakhir;
    }
    adaLebihBanyakKegiatanHalaman = meta.jumlah >= UKURAN_HALAMAN_KEGIATAN;
    return null;
  } catch (err) {
    return formatPesanGalatFirestore(err);
  } finally {
    sedangMuatLebihBanyakKegiatan = false;
    beritahuPerubahanKegiatan();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh kegiatan aktif dari server.
 * Digunakan oleh Ekspor Cadangan dan Pencarian Global mendalam.
 */
export async function ambilSemuaKegiatanSekaliPakai() {
  const { items } = await ambilDaftar(KOLEKSI.KEGIATAN, {
    filter: [["dihapusAt", "==", null]],
    urutkan: ["tanggal", "desc"],
  });
  items.forEach((item) => {
    petaKegiatanTambahan.set(item.id, petakanKegiatan(item));
  });
  beritahuPerubahanKegiatan();
  return getDaftarKegiatan();
}

/**
 * Jembatan sekali pakai untuk mengambil kegiatan pada rentang tanggal tertentu.
 * Digunakan oleh modul Laporan.
 */
export async function ambilKegiatanRentangTanggal(tanggalDari, tanggalSampai) {
  const { items } = await ambilDaftar(KOLEKSI.KEGIATAN, {
    filter: [
      ["dihapusAt", "==", null],
      ["tanggal", ">=", tanggalDari],
      ["tanggal", "<=", tanggalSampai],
    ],
    urutkan: ["tanggal", "asc"],
  });
  const hasil = [];
  items.forEach((item) => {
    const dipetakan = petakanKegiatan(item);
    petaKegiatanTambahan.set(item.id, dipetakan);
    hasil.push(dipetakan);
  });
  return hasil;
}

// --- Langganan realtime ------------------------------------------------------

export function hitungRentangJendela(tahun, bulanIndex) {
  // Rentang jendela: 1 bulan sebelum s/d 1 bulan sesudah bulan aktif (+/- 1 bulan)
  const dMulai = new Date(tahun, bulanIndex - 1, 1);
  const dAkhir = new Date(tahun, bulanIndex + 2, 0); // hari terakhir bulan berikutnya
  return {
    tglAwal: tanggalLokal(dMulai),
    tglAkhir: tanggalLokal(dAkhir)
  };
}

/**
 * Menyinkronkan listener jendela tanggal aktif saat berpindah bulan pada Kalender Jadwal.
 */
export function sinkronkanJendelaTanggalKegiatan(tahun, bulanIndex) {
  const { tglAwal, tglAkhir } = hitungRentangJendela(tahun, bulanIndex);
  if (tglAwal === jendelaAwalAktif && tglAkhir === jendelaAkhirAktif && unsubscribeSnapshotJendela) {
    return;
  }
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);
}

export function mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir) {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }

  jendelaAwalAktif = tglAwal;
  jendelaAkhirAktif = tglAkhir;

  unsubscribeSnapshotJendela = langgananKoleksi(
    KOLEKSI.KEGIATAN,
    {
      filter: [
        ["dihapusAt", "==", null],
        ["tanggal", ">=", tglAwal],
        ["tanggal", "<=", tglAkhir],
      ],
      urutkan: ["tanggal", "asc"],
    },
    {
      onData: (items) => {
        petaKegiatanJendela.clear();
        items.forEach((item) => {
          petaKegiatanJendela.set(item.id, petakanKegiatan(item));
        });
        sudahDimuatPertamaKali = true;
        if (typeof opsiPeristiwa.onSuksesJendela === "function") opsiPeristiwa.onSuksesJendela();
        beritahuPerubahanKegiatan();
      },
      onGalat: (err) => {
        sudahDimuatPertamaKali = true;
        if (typeof opsiPeristiwa.onGalatJendela === "function") {
          opsiPeristiwa.onGalatJendela(formatPesanGalatFirestore(err));
        }
        beritahuPerubahanKegiatan();
      }
    }
  );
}

export function mulaiLanggananHalamanKegiatan() {
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  unsubscribeSnapshotHalaman = langgananKoleksi(
    KOLEKSI.KEGIATAN,
    {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggal", "desc"],
      batas: UKURAN_HALAMAN_KEGIATAN,
    },
    {
      onData: (items, meta) => {
        petaKegiatanHalaman.clear();
        items.forEach((item) => {
          petaKegiatanHalaman.set(item.id, petakanKegiatan(item));
        });

        if (meta.dokumenTerakhir) {
          lastDocKegiatanHalaman = meta.dokumenTerakhir;
        }
        adaLebihBanyakKegiatanHalaman = meta.jumlah >= UKURAN_HALAMAN_KEGIATAN;
        sudahDimuatPertamaKali = true;
        beritahuPerubahanKegiatan();
      },
      onGalat: (err) => {
        if (typeof opsiPeristiwa.onGalatHalaman === "function") {
          opsiPeristiwa.onGalatHalaman(formatPesanGalatFirestore(err));
        }
      }
    }
  );
}

/**
 * Memasang langganan data kategori (pemuatan awal + realtime).
 * onKategoriOk dipanggil sebelum beritahu agar dropdown kategori terbarui
 * lebih dulu, sama seperti urutan pada berkas lama.
 */
export function langgananKategoriKegiatan() {
  manajerKategoriKegiatan.subscribe(
    () => {
      if (typeof opsiPeristiwa.onKategoriOk === "function") opsiPeristiwa.onKategoriOk();
      beritahuPerubahanKegiatan();
    },
    (pesanGalat) => {
      if (typeof opsiPeristiwa.onGalatKategori === "function") opsiPeristiwa.onGalatKategori(pesanGalat);
    }
  );
}

/**
 * Melepas semua langganan realtime + kategori dan mengosongkan cache.
 * Pembersihan antarmuka (modal, panel filter) dilakukan controller.
 */
export function lepasLanggananKegiatan() {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  manajerKategoriKegiatan.unsubscribe();
  petaKegiatanJendela.clear();
  petaKegiatanHalaman.clear();
  petaKegiatanTambahan.clear();
  lastDocKegiatanHalaman = null;
  adaLebihBanyakKegiatanHalaman = false;
  sedangMuatLebihBanyakKegiatan = false;
  jendelaAwalAktif = "";
  jendelaAkhirAktif = "";

  sudahDimuatPertamaKali = false;
  beritahuPerubahanKegiatan();
}
