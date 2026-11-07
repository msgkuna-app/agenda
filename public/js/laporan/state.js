/**
 * Modul State Laporan
 * Mengelola objek state tunggal untuk halaman Laporan Google Sheets & Unduh CSV.
 */
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { hitungAwalBulanIni } from "./util.js";

export const stateLaporan = {
  daftarRiwayatLaporan: [],
  riwayatSudahDimuat: false,
  antarmukaSudahDiikat: false,
  jenisAktif: "kegiatan",
  tanggalDari: "",
  tanggalSampai: "",
  filterKategori: "ALL",
  sedangMembuatSpreadsheet: false,
  hapusRiwayatModalTerbuka: false,
  itemRiwayatAkanDihapus: null,
  fokusSebelumModalLaporan: null,
  cacheKegiatanLaporan: null,
  rentangTerakhirKegiatan: "",
  cacheDokumenLaporan: null,
  cacheCatatanLaporan: null,
  sedangMemuatDataSekaliPakai: false,
  unsubscribeSnapshotLaporan: null,
  unsubKategoriKeg: null,
  unsubKategoriDok: null
};

/**
 * Fase 6 Bagian C1: Mengekspor akses metadata riwayat laporan dari memori/langganan tunggal.
 */
export function getDaftarLaporan() {
  return stateLaporan.daftarRiwayatLaporan.map((item) => ({ ...item }));
}

export function isLaporanSudahDimuat() {
  return stateLaporan.riwayatSudahDimuat;
}

export function pastikanRentangDefault() {
  if (!stateLaporan.tanggalDari || !parseTanggal(stateLaporan.tanggalDari)) {
    stateLaporan.tanggalDari = hitungAwalBulanIni();
  }
  if (!stateLaporan.tanggalSampai || !parseTanggal(stateLaporan.tanggalSampai)) {
    stateLaporan.tanggalSampai = hariIni();
  }
}

export function validasiRentangTanggal() {
  const objDari = parseTanggal(stateLaporan.tanggalDari);
  const objSampai = parseTanggal(stateLaporan.tanggalSampai);
  if (!objDari || !objSampai) {
    return { valid: false, pesan: "Tanggal awal dan tanggal akhir wajib diisi dengan benar." };
  }
  if (stateLaporan.tanggalDari > stateLaporan.tanggalSampai) {
    return { valid: false, pesan: "Tanggal awal tidak boleh setelah tanggal akhir." };
  }
  return { valid: true, pesan: "" };
}

export function resetFilterKeBulanIni() {
  stateLaporan.tanggalDari = hitungAwalBulanIni();
  stateLaporan.tanggalSampai = hariIni();
  stateLaporan.filterKategori = "ALL";
}