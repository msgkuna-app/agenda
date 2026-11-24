/**
 * Penyusun Laporan Rekap Status (2026-11-25: pecahan dari penyusun.js)
 *
 * Laporan "Rekap Status Kegiatan": tiga baris rekap per status, lalu satu baris
 * per kategori (sesuai filter kategori yang aktif). Dipisah dari penyusun.js
 * karena bentuk tabelnya berbeda dari daftar biasa dan cukup panjang.
 */
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan
} from "../kegiatan/index.js";
import { urutkanDaftarKategori } from "../kategori/index.js";
import { parseTanggal } from "../../util-tanggal.js";
import {
  getJenisAktif,
  getFilterKategori,
  cocokFilterKategoriTerstruktur,
  beritahuSumberSiap
} from "./inti.js";
import {
  pastikanDataLaporanTersedia,
  getCacheKegiatanLaporan,
  getKunciRentangKegiatan,
  isSedangMemuatDataSekaliPakai
} from "./sumber.js";

/**
 * Susun laporan "Rekap Status Kegiatan".
 * @param {{ infoJenis: any, rentangLabel: string, tanggalDari: string, tanggalSampai: string,
 *           buatPaketSedangMemuat: Function }} konteks
 */
export function susunLaporanRekapStatus(konteks) {
  const { infoJenis, rentangLabel, tanggalDari, tanggalSampai, buatPaketSedangMemuat } = konteks;
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
  const kegiatanPeriode = sumberKegiatan.filter((k) => {
    if (!parseTanggal(k.tanggal)) return false;
    if (k.tanggal < tanggalDari || k.tanggal > tanggalSampai) return false;
    return cocokFilterKategoriTerstruktur(k.kategoriId, manajerKategoriKegiatan);
  });

  const totalKegiatan = kegiatanPeriode.length;
  const perStatus = { Rencana: 0, Berjalan: 0, Selesai: 0 };
  const petaKategori = susunPetaKategoriRekap();

  for (const item of kegiatanPeriode) {
    const st = DAFTAR_STATUS_KEGIATAN.includes(item.status) ? item.status : "Rencana";
    perStatus[st] += 1;
    const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
    const kunci = infoKat.tetap ? "" : infoKat.id;
    if (!petaKategori.has(kunci)) {
      petaKategori.set(kunci, { nama: infoKat.nama, Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
    }
    const entri = petaKategori.get(kunci);
    entri[st] += 1;
    entri.total += 1;
  }

  const barisData = susunBarisRekap(perStatus, petaKategori, totalKegiatan);
  const header = [
    "No",
    "Bagian Rekap",
    "Status / Kategori",
    "Rencana",
    "Berjalan",
    "Selesai",
    "Jumlah Kegiatan",
    "Persentase"
  ];
  const barisTotal = [
    "TOTAL",
    "Keseluruhan Periode",
    rentangLabel,
    perStatus.Rencana,
    perStatus.Berjalan,
    perStatus.Selesai,
    totalKegiatan,
    totalKegiatan > 0 ? "100%" : "0%"
  ];
  return {
    valid: true,
    sedangMemuatSumber: false,
    infoJenis,
    rentangLabel,
    header,
    barisData,
    barisTotal,
    ringkasanTambahan: `Dihitung dari ${totalKegiatan} kegiatan pada periode terpilih`
  };
}

/** Siapkan keranjang kategori sesuai filter aktif. */
function susunPetaKategoriRekap() {
  const filterKategori = getFilterKategori();
  const petaKategori = new Map();

  if (filterKategori === "ALL") {
    const daftarKatUrut = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori());
    for (const k of daftarKatUrut) {
      petaKategori.set(k.id, { nama: k.nama, Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
    }
    petaKategori.set("", { nama: "Tanpa Kategori", Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
  } else if (filterKategori === "NONE") {
    petaKategori.set("", { nama: "Tanpa Kategori", Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
  } else {
    const infoPilih = manajerKategoriKegiatan.cariInfoKategori(filterKategori);
    petaKategori.set(infoPilih.tetap ? "" : infoPilih.id, {
      nama: infoPilih.nama,
      Rencana: 0,
      Berjalan: 0,
      Selesai: 0,
      total: 0
    });
  }
  return petaKategori;
}

/** Baris rekap: tiga baris status lalu satu baris per kategori. */
function susunBarisRekap(perStatus, petaKategori, totalKegiatan) {
  const barisData = [];
  let nomor = 1;

  for (const st of DAFTAR_STATUS_KEGIATAN) {
    const jml = perStatus[st];
    barisData.push([
      nomor++,
      "Rekap per Status",
      st,
      st === "Rencana" ? jml : 0,
      st === "Berjalan" ? jml : 0,
      st === "Selesai" ? jml : 0,
      jml,
      totalKegiatan > 0 ? `${Math.round((jml / totalKegiatan) * 100)}%` : "0%"
    ]);
  }

  for (const entri of petaKategori.values()) {
    barisData.push([
      nomor++,
      "Rekap per Kategori",
      entri.nama,
      entri.Rencana,
      entri.Berjalan,
      entri.Selesai,
      entri.total,
      totalKegiatan > 0 ? `${Math.round((entri.total / totalKegiatan) * 100)}%` : "0%"
    ]);
  }
  return barisData;
}
