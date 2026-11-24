/**
 * Inti State Modul Sampah (Tahap 6f: dipecah dari state.js)
 * Pemilik tunggal state memori Tempat Sampah: tabel JENIS_SAMPAH, tiga peta
 * per jenis (item, langganan, status muat), dan tanda pembersihan otomatis.
 * Berisi seluruh pembacaan salinan dan penulis terkendali untuk dua berkas
 * pecahan (hapus.js dan langganan.js).
 * TANPA DOM.
 */
import { KOLEKSI } from "../../config/constants.js";
import {
  normalkanKegiatan,
  normalkanCatatan,
  normalkanDokumen,
  normalkanFoto,
  normalkanLaporan
} from "./normalisasi.js";

/**
 * Tabel jenis item Tempat Sampah. `kunci` adalah nama koleksi Firestore sekaligus
 * nilai data-sampah-tipe di antarmuka. Sejak v1.8.44 kelima koleksi hapus lunak
 * terdaftar; seluruhnya sudah termigrasi ke field dihapusAt sehingga kueri
 * where("dihapusAt", "!=", null) aman dijalankan.
 */
const JENIS_SAMPAH = [
  { kunci: KOLEKSI.KEGIATAN, normalkan: normalkanKegiatan },
  { kunci: KOLEKSI.CATATAN, normalkan: normalkanCatatan },
  { kunci: KOLEKSI.DOKUMEN, normalkan: normalkanDokumen },
  { kunci: KOLEKSI.FOTO, normalkan: normalkanFoto },
  { kunci: KOLEKSI.LAPORAN, normalkan: normalkanLaporan }
];

const petaPerJenis = new Map();      // kunci -> Map(id -> item)
const langgananPerJenis = new Map(); // kunci -> unsubscribe
const statusMuatPerJenis = new Map(); // kunci -> boolean

JENIS_SAMPAH.forEach((jenis) => {
  petaPerJenis.set(jenis.kunci, new Map());
  langgananPerJenis.set(jenis.kunci, null);
  statusMuatPerJenis.set(jenis.kunci, false);
});

let sudahPernahBersihkanOtomatisSesiIni = false;

/** Daftar kunci jenis yang aktif di Tempat Sampah (dipakai view untuk opsi filter). */
export function getJenisSampah() {
  return JENIS_SAMPAH.map((jenis) => jenis.kunci);
}

/** Salinan item satu jenis; daftar kosong bila kunci tidak dikenal. */
export function getDaftarSampah(kunci) {
  const peta = petaPerJenis.get(kunci);
  if (!peta) return [];
  return Array.from(peta.values()).map((item) => ({ ...item }));
}

/** Salinan seluruh item dari semua jenis aktif. */
export function getSemuaItemSampah() {
  const hasil = [];
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => hasil.push({ ...item }));
  });
  return hasil;
}

export function isSampahSudahDimuat() {
  return JENIS_SAMPAH.every((jenis) => statusMuatPerJenis.get(jenis.kunci) === true);
}

/**
 * Ambil entri mentah dari peta (bukan salinan) — dipakai controller untuk dialog
 * hapus permanen dan argumen pulihkanCatatan (identitas objek sama seperti aslinya).
 */
export function ambilItemSampahMentah(kunci, id) {
  const peta = petaPerJenis.get(kunci);
  return peta ? peta.get(id) : undefined;
}

/** Hapus satu item dari peta (optimistis, sebelum snapshot berikutnya). */
export function hapusItemSampah(kunci, id) {
  const peta = petaPerJenis.get(kunci);
  if (peta) peta.delete(id);
}

/** Total jumlah item di seluruh jenis (dipakai dialog kosongkan). */
export function hitungTotalItemSampah() {
  let total = 0;
  JENIS_SAMPAH.forEach((jenis) => {
    total += petaPerJenis.get(jenis.kunci).size;
  });
  return total;
}

/** Jumlah item di Tempat Sampah yang masih menunjuk berkas Google Drive. */
export function hitungItemSampahBerberkas() {
  let total = 0;
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => {
      if (punyaBerkasDrive(item)) total += 1;
    });
  });
  return total;
}

/**
 * True bila item ini menunjuk berkas Google Drive (dokumen dan foto).
 * Dipakai internal modul ini dan controller (untuk memperingatkan saat luring).
 */
export function punyaBerkasDrive(item) {
  return String((item && item.driveFileId) || "").trim() !== "";
}

/** Reset tanda pembersihan otomatis (sekali per sesi). */
export function resetFlagPembersihanSampah() {
  sudahPernahBersihkanOtomatisSesiIni = false;
}

/* ── Penulis terkendali untuk hapus.js dan langganan.js ───────────────────── */

/** Tabel jenis (dipakai hapus.js dan langganan.js untuk menelusuri koleksi). */
export function getTabelJenisSampah() {
  return JENIS_SAMPAH;
}

/** Peta item satu jenis (bukan salinan) — pemiliknya tetap inti.js. */
export function ambilPetaSampah(kunci) {
  return petaPerJenis.get(kunci);
}

/** Peta langganan per jenis (bukan salinan). */
export function ambilLanggananSampah(kunci) {
  return langgananPerJenis.get(kunci);
}

export function setLanggananSampah(kunci, unsubscribe) {
  langgananPerJenis.set(kunci, unsubscribe || null);
}

export function setStatusMuatSampah(kunci, nilai) {
  statusMuatPerJenis.set(kunci, Boolean(nilai));
}

export function sudahBersihkanOtomatisSesiIni() {
  return sudahPernahBersihkanOtomatisSesiIni;
}

export function tandaiSudahBersihkanOtomatisSesiIni() {
  sudahPernahBersihkanOtomatisSesiIni = true;
}
