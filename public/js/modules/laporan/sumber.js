/**
 * Sumber Data Modul Laporan (2026-11-25: pecahan dari state.js)
 *
 * Cache sekali pakai untuk data laporan yang dimuat atas permintaan: kegiatan
 * pada rentang tanggal, seluruh dokumen, dan seluruh catatan. Cache inilah yang
 * membuat berpindah tab laporan tidak memuat ulang ke Firestore, dan sengaja
 * TIDAK direset saat langganan dilepas (paritas perilaku dengan laporan.js asli).
 */
import {
  getDaftarKegiatan,
  ambilKegiatanRentangTanggal
} from "../kegiatan/index.js";
import {
  getDaftarDokumen,
  ambilSemuaDokumenSekaliPakai
} from "../dokumen/index.js";
import {
  getDaftarCatatan,
  ambilSemuaCatatanSekaliPakai
} from "../catatan/index.js";
import { geserTanggal } from "../../util-tanggal.js";

let cacheKegiatanLaporan = null;
let rentangTerakhirKegiatan = "";
let cacheDokumenLaporan = null;
let cacheCatatanLaporan = null;
let sedangMemuatDataSekaliPakai = false;

// Seberapa jauh ke belakang jendela pengambilan kegiatan dilebarkan, agar
// kegiatan berturutan yang dimulai sebelum periode laporan tetap ikut terbaca.
const MAKS_HARI_RENTANG_LAPORAN = 120;

export function getCacheKegiatanLaporan() {
  return cacheKegiatanLaporan;
}

export function getKunciRentangKegiatan() {
  return rentangTerakhirKegiatan;
}

export function getCacheDokumenLaporan() {
  return cacheDokumenLaporan;
}

export function getCacheCatatanLaporan() {
  return cacheCatatanLaporan;
}

export function isSedangMemuatDataSekaliPakai() {
  return sedangMemuatDataSekaliPakai;
}

/**
 * Memastikan data sumber untuk jenis laporan tertentu tersedia di cache.
 * Mengembalikan array data; bila server gagal, jatuh ke data yang sudah ada di
 * memori modul asal agar laporan tetap dapat disusun (perilaku luring).
 */
export async function pastikanDataLaporanTersedia(jenis, tglDari, tglSampai) {
  if (jenis === "kegiatan" || jenis === "rekap-status") {
    // Kegiatan berturutan yang MULAI sebelum periode laporan tetapi masih
    // berjalan di dalamnya tidak akan terambil bila saringan memakai tanggal
    // mulai saja. Karena itu jendela pengambilan dilebarkan ke belakang, lalu
    // penyusun laporan tetap menyaring dengan rentangBersinggungan().
    const tglDariAmbil = geserTanggal(tglDari, -MAKS_HARI_RENTANG_LAPORAN) || tglDari;
    const kunciRentang = `${tglDari}_${tglSampai}`;
    if (cacheKegiatanLaporan && rentangTerakhirKegiatan === kunciRentang) {
      return cacheKegiatanLaporan;
    }
    sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilKegiatanRentangTanggal(tglDariAmbil, tglSampai);
      cacheKegiatanLaporan = data;
      rentangTerakhirKegiatan = kunciRentang;
      return data;
    } catch (err) {
      console.warn("Gagal memuat kegiatan rentang tanggal untuk laporan:", err);
      return getDaftarKegiatan();
    } finally {
      sedangMemuatDataSekaliPakai = false;
    }
  } else if (jenis === "dokumen") {
    if (cacheDokumenLaporan) return cacheDokumenLaporan;
    sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilSemuaDokumenSekaliPakai();
      cacheDokumenLaporan = data;
      return data;
    } catch (err) {
      console.warn("Gagal memuat dokumen sekali pakai untuk laporan:", err);
      return getDaftarDokumen();
    } finally {
      sedangMemuatDataSekaliPakai = false;
    }
  } else if (jenis === "catatan") {
    if (cacheCatatanLaporan) return cacheCatatanLaporan;
    sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilSemuaCatatanSekaliPakai();
      cacheCatatanLaporan = data;
      return data;
    } catch (err) {
      console.warn("Gagal memuat catatan sekali pakai untuk laporan:", err);
      return getDaftarCatatan();
    } finally {
      sedangMemuatDataSekaliPakai = false;
    }
  }
  return [];
}

/** Judul kegiatan untuk kolom "Kegiatan Terkait" (memori dulu, lalu cache laporan). */
export function cariJudulKegiatanTerkait(kegiatanId) {
  const idBersih = String(kegiatanId || "").trim();
  if (!idBersih) return "-";
  const ketemu = getDaftarKegiatan().find((k) => k.id === idBersih);
  if (ketemu) return ketemu.judul;
  if (cacheKegiatanLaporan) {
    const ketemuCache = cacheKegiatanLaporan.find((k) => k.id === idBersih);
    if (ketemuCache) return ketemuCache.judul;
  }
  return "Kegiatan tidak ditemukan";
}
