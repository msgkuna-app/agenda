/**
 * Inti State Modul Laporan (2026-11-25: pecahan dari state.js)
 *
 * Pemilik tunggal state modul laporan: jenis laporan yang tersedia, filter aktif
 * (jenis/tanggal/kategori), opsi peristiwa yang disuntikkan controller, nilai
 * default rentang tanggal, validasi rentang, dan penyaring kategori yang dipakai
 * bersama oleh seluruh penyusun laporan. TANPA DOM.
 *
 * Susunan lapisan (impor satu arah, tanpa lingkaran):
 *   state.js -> penyusun.js -> penyusun-jenis.js -> (inti.js, sumber.js)
 */
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { hitungAwalBulanIni } from "./format.js";

export const DAFTAR_JENIS_LAPORAN = [
  {
    id: "kegiatan",
    label: "Daftar Kegiatan per Periode",
    judulPendek: "Daftar Kegiatan",
    namaTab: "Daftar Kegiatan"
  },
  {
    id: "rekap-status",
    label: "Rekap Status Kegiatan (per Status & Kategori)",
    judulPendek: "Rekap Status Kegiatan",
    namaTab: "Rekap Status"
  },
  {
    id: "dokumen",
    label: "Daftar Dokumen",
    judulPendek: "Daftar Dokumen",
    namaTab: "Daftar Dokumen"
  },
  {
    id: "catatan",
    label: "Daftar Catatan",
    judulPendek: "Daftar Catatan",
    namaTab: "Daftar Catatan"
  }
];

let jenisAktif = "kegiatan";
let tanggalDari = "";
let tanggalSampai = "";
let filterKategori = "ALL";

/** Opsi peristiwa yang disuntikkan controller (pemicu render ulang). */
let opsiPeristiwa = {
  onSumberSiap: null
};

export function setelOpsiPeristiwaLaporan(opsi = {}) {
  opsiPeristiwa = {
    onSumberSiap: typeof opsi.onSumberSiap === "function" ? opsi.onSumberSiap : null
  };
}

/** Dipanggil penyusun setelah data sumber sekali pakai selesai dimuat. */
export function beritahuSumberSiap() {
  if (opsiPeristiwa.onSumberSiap) {
    opsiPeristiwa.onSumberSiap();
  }
}

export function ambilInfoJenisLaporan(idJenis) {
  return DAFTAR_JENIS_LAPORAN.find((j) => j.id === idJenis) || DAFTAR_JENIS_LAPORAN[0];
}

/* ---------- State filter ---------- */

export function getJenisAktif() {
  return jenisAktif;
}

export function setJenisAktif(nilai) {
  jenisAktif = String(nilai || "kegiatan");
}

export function getTanggalDari() {
  return tanggalDari;
}

export function setTanggalDari(nilai) {
  tanggalDari = String(nilai || "");
}

export function getTanggalSampai() {
  return tanggalSampai;
}

export function setTanggalSampai(nilai) {
  tanggalSampai = String(nilai || "");
}

export function getFilterKategori() {
  return filterKategori;
}

export function setFilterKategori(nilai) {
  filterKategori = String(nilai || "ALL") || "ALL";
}

export function pastikanRentangDefault() {
  if (!tanggalDari || !parseTanggal(tanggalDari)) {
    tanggalDari = hitungAwalBulanIni();
  }
  if (!tanggalSampai || !parseTanggal(tanggalSampai)) {
    tanggalSampai = hariIni();
  }
}

export function validasiRentangTanggal() {
  const objDari = parseTanggal(tanggalDari);
  const objSampai = parseTanggal(tanggalSampai);
  if (!objDari || !objSampai) {
    return { valid: false, pesan: "Tanggal awal dan tanggal akhir wajib diisi dengan benar." };
  }
  if (tanggalDari > tanggalSampai) {
    return { valid: false, pesan: "Tanggal awal tidak boleh setelah tanggal akhir." };
  }
  return { valid: true, pesan: "" };
}

/* ---------- Penyaring kategori (dipakai bersama penyusun) ---------- */

export function cocokFilterKategoriTerstruktur(kategoriIdItem, manajer) {
  if (filterKategori === "ALL") return true;
  const info = manajer.cariInfoKategori(kategoriIdItem);
  if (filterKategori === "NONE") return Boolean(info.tetap);
  return info.id === filterKategori;
}

export function cocokFilterKategoriCatatan(kategoriTeks) {
  if (filterKategori === "ALL") return true;
  const bersih = String(kategoriTeks || "").trim();
  if (filterKategori === "NONE") return bersih === "";
  if (filterKategori.startsWith("CAT:")) {
    const target = filterKategori.slice(4).toLowerCase();
    return bersih.toLowerCase() === target;
  }
  return true;
}
