/**
 * Penyusun Paket Laporan (2026-11-25: pecahan dari state.js)
 *
 * `susunDataLaporanSaatIni` dipecah menjadi satu dispatcher kecil (±30 baris)
 * ditambah satu penyusun per jenis laporan. Semua penyusun mengembalikan bentuk
 * paket yang sama: { valid, sedangMemuatSumber, infoJenis, rentangLabel,
 * header, barisData, barisTotal, ringkasanTambahan }.
 *
 * Penyusun dokumen & catatan tinggal di penyusun-jenis.js, karena keduanya
 * memuat dan mengurutkan koleksi yang berbeda dari kegiatan.
 */
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan
} from "../kegiatan/index.js";
import { parseTanggal } from "../../util-tanggal.js";
import { formatTanggalSetempat } from "./format.js";
import {
  ambilInfoJenisLaporan,
  getJenisAktif,
  getTanggalDari,
  getTanggalSampai,
  validasiRentangTanggal,
  cocokFilterKategoriTerstruktur,
  beritahuSumberSiap
} from "./inti.js";
import {
  pastikanDataLaporanTersedia,
  getCacheKegiatanLaporan,
  getKunciRentangKegiatan,
  isSedangMemuatDataSekaliPakai
} from "./sumber.js";
import {
  susunLaporanDokumen,
  susunLaporanCatatan
} from "./penyusun-jenis.js";
import { susunLaporanRekapStatus } from "./penyusun-rekap.js";

/** Paket kosong yang dipakai saat data sumber belum siap (dirender sebagai "memuat"). */
function buatPaketSedangMemuat(header, infoJenis, rentangLabel, sedangMemuatSumber = true) {
  return {
    valid: true,
    sedangMemuatSumber,
    infoJenis,
    rentangLabel,
    header: header || [],
    barisData: [],
    barisTotal: [],
    ringkasanTambahan: ""
  };
}

/**
 * Titik masuk tunggal yang dipakai view & controller.
 * Mengembalikan paket laporan untuk filter yang sedang aktif.
 */
export function susunDataLaporanSaatIni() {
  const cekTgl = validasiRentangTanggal();
  const infoJenis = ambilInfoJenisLaporan(getJenisAktif());
  const rentangLabel = cekTgl.valid
    ? `${formatTanggalSetempat(getTanggalDari())} – ${formatTanggalSetempat(getTanggalSampai())}`
    : "-";

  if (!cekTgl.valid) {
    return {
      valid: false,
      pesanValidasi: cekTgl.pesan,
      sedangMemuatSumber: false,
      infoJenis,
      rentangLabel,
      header: [],
      barisData: [],
      barisTotal: [],
      ringkasanTambahan: ""
    };
  }

  const konteks = {
    infoJenis,
    rentangLabel,
    tanggalDari: getTanggalDari(),
    tanggalSampai: getTanggalSampai(),
    buatPaketSedangMemuat
  };

  switch (getJenisAktif()) {
    case "kegiatan":
      return susunLaporanKegiatan(konteks);
    case "rekap-status":
      return susunLaporanRekapStatus(konteks);
    case "dokumen":
      return susunLaporanDokumen(konteks);
    default:
      return susunLaporanCatatan(konteks);
  }
}

/* ---------- Penyusun: Daftar Kegiatan ---------- */

function susunLaporanKegiatan(konteks) {
  const { infoJenis, rentangLabel, tanggalDari, tanggalSampai } = konteks;
  const kunciRentang = `${tanggalDari}_${tanggalSampai}`;
  if (!getCacheKegiatanLaporan() || getKunciRentangKegiatan() !== kunciRentang) {
    if (!isSedangMemuatDataSekaliPakai()) {
      pastikanDataLaporanTersedia(getJenisAktif(), tanggalDari, tanggalSampai).then(() => {
        beritahuSumberSiap();
      });
    }
    return buatPaketSedangMemuat([], infoJenis, rentangLabel);
  }

  const sumberKegiatan = getCacheKegiatanLaporan() || getDaftarKegiatan();
  const tersaring = sumberKegiatan
    .filter((k) => {
      if (!parseTanggal(k.tanggal)) return false;
      if (k.tanggal < tanggalDari || k.tanggal > tanggalSampai) return false;
      return cocokFilterKategoriTerstruktur(k.kategoriId, manajerKategoriKegiatan);
    })
    .sort((a, b) => {
      if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
      return String(a.waktuMulai || "99:99").localeCompare(String(b.waktuMulai || "99:99"));
    });

  const hitung = { Rencana: 0, Berjalan: 0, Selesai: 0 };
  const barisData = tersaring.map((item, idx) => {
    const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
    const st = DAFTAR_STATUS_KEGIATAN.includes(item.status) ? item.status : "Rencana";
    hitung[st] += 1;
    const waktu = item.waktuMulai
      ? item.waktuSelesai ? `${item.waktuMulai}–${item.waktuSelesai}` : item.waktuMulai
      : "Sepanjang hari";
    return [
      idx + 1,
      formatTanggalSetempat(item.tanggal),
      waktu,
      String(item.judul || ""),
      infoKat.nama,
      st,
      String(item.lokasi || "-"),
      String(item.catatan || "-")
    ];
  });

  const header = ["No", "Tanggal", "Waktu", "Judul Kegiatan", "Kategori", "Status", "Lokasi", "Catatan"];
  const barisTotal = [
    "TOTAL",
    `${barisData.length} kegiatan`,
    "",
    `Rencana: ${hitung.Rencana} | Berjalan: ${hitung.Berjalan} | Selesai: ${hitung.Selesai}`,
    "",
    "",
    "",
    ""
  ];
  return {
    valid: true,
    sedangMemuatSumber: false,
    infoJenis,
    rentangLabel,
    header,
    barisData,
    barisTotal,
    ringkasanTambahan: `Rencana: ${hitung.Rencana} • Berjalan: ${hitung.Berjalan} • Selesai: ${hitung.Selesai}`
  };
}
