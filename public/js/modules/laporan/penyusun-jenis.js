/**
 * Penyusun Laporan per Jenis Data (2026-11-25: pecahan dari state.js)
 *
 * Dua penyusun laporan yang bersumber dari koleksi non-kegiatan: Daftar Dokumen
 * dan Daftar Catatan. Masing-masing mengembalikan paket laporan siap render
 * ({ header, barisData, barisTotal, ringkasanTambahan }) dengan bentuk yang sama
 * seperti penyusun kegiatan, sehingga dispatcher di penyusun.js tinggal memilih.
 *
 * Bila cache sumber belum terisi, penyusun memicu pemuatan di latar belakang dan
 * tetap menyusun laporan dari data yang sudah ada di memori; controller akan
 * merender ulang lewat onSumberSiap setelah data server tiba.
 */
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  formatUkuranBerkas,
  infoJenisBerkasMime
} from "../dokumen/index.js";
import {
  JENIS_CATATAN_GDOC,
  getDaftarCatatan,
  tautanAmanGoogleDocs
} from "../catatan/index.js";
import { parseTanggal } from "../../util-tanggal.js";
import { formatTanggalSetempat, ekstrakTanggalYmdDariIso } from "./format.js";
import { cocokFilterKategoriTerstruktur, cocokFilterKategoriCatatan, beritahuSumberSiap } from "./inti.js";
import {
  pastikanDataLaporanTersedia,
  cariJudulKegiatanTerkait,
  getCacheDokumenLaporan,
  getCacheCatatanLaporan,
  isSedangMemuatDataSekaliPakai
} from "./sumber.js";

/** Susun laporan "Daftar Dokumen". */
export function susunLaporanDokumen(konteks) {
  const { infoJenis, rentangLabel, tanggalDari, tanggalSampai } = konteks;
  if (!getCacheDokumenLaporan() && !isSedangMemuatDataSekaliPakai()) {
    pastikanDataLaporanTersedia("dokumen").then(() => {
      beritahuSumberSiap();
    });
  }
  const sumberDokumen = getCacheDokumenLaporan() || getDaftarDokumen();
  const tersaring = sumberDokumen
    .map((d) => ({
      ...d,
      _ymdLokal: ekstrakTanggalYmdDariIso(d.tanggalUnggah || d.createdAt)
    }))
    .filter((d) => {
      if (!d._ymdLokal) return false;
      if (d._ymdLokal < tanggalDari || d._ymdLokal > tanggalSampai) return false;
      return cocokFilterKategoriTerstruktur(d.kategoriId, manajerKategoriDokumen);
    })
    .sort((a, b) =>
      String(a.tanggalUnggah || a.createdAt || "").localeCompare(String(b.tanggalUnggah || b.createdAt || ""))
    );

  let totalUkuran = 0;
  const barisData = tersaring.map((dok, idx) => {
    const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
    const jenisMime = infoJenisBerkasMime(dok.mimeType, dok.namaFile);
    const ukuranAngka = Number.isFinite(Number(dok.ukuran)) ? Number(dok.ukuran) : 0;
    totalUkuran += ukuranAngka;
    const tautan =
      dok.tautan && /^https?:\/\//i.test(dok.tautan)
        ? dok.tautan
        : dok.driveFileId
          ? `https://drive.google.com/file/d/${encodeURIComponent(dok.driveFileId)}/view`
          : "-";
    return [
      idx + 1,
      formatTanggalSetempat(dok._ymdLokal),
      String(dok.namaTampilan || dok.namaFile || "Dokumen"),
      String(dok.namaFile || "-"),
      infoKat.nama,
      jenisMime.label,
      formatUkuranBerkas(ukuranAngka),
      cariJudulKegiatanTerkait(dok.kegiatanId),
      String(dok.catatan || "-"),
      tautan
    ];
  });

  const header = [
    "No",
    "Tanggal Unggah",
    "Nama Tampilan",
    "Nama Berkas Asli",
    "Kategori",
    "Jenis Berkas",
    "Ukuran",
    "Kegiatan Terkait",
    "Catatan",
    "Tautan Drive"
  ];
  const barisTotal = [
    "TOTAL",
    `${barisData.length} dokumen`,
    "",
    "",
    "",
    "Total Ukuran",
    formatUkuranBerkas(totalUkuran),
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
    ringkasanTambahan: `Total ukuran berkas: ${formatUkuranBerkas(totalUkuran)}`
  };
}

/** Susun laporan "Daftar Catatan". */
export function susunLaporanCatatan(konteks) {
  const { infoJenis, rentangLabel, tanggalDari, tanggalSampai } = konteks;
  if (!getCacheCatatanLaporan() && !isSedangMemuatDataSekaliPakai()) {
    pastikanDataLaporanTersedia("catatan").then(() => {
      beritahuSumberSiap();
    });
  }
  const sumberCatatan = getCacheCatatanLaporan() || getDaftarCatatan();
  const tersaring = sumberCatatan
    .filter((c) => {
      if (!parseTanggal(c.tanggal)) return false;
      if (c.tanggal < tanggalDari || c.tanggal > tanggalSampai) return false;
      return cocokFilterKategoriCatatan(c.kategori);
    })
    .sort((a, b) => {
      if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
      return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
    });

  let jmlSingkat = 0;
  let jmlGdoc = 0;
  let jmlSemat = 0;
  const barisData = tersaring.map((c, idx) => {
    const adalahGdoc = c.jenis === JENIS_CATATAN_GDOC;
    if (adalahGdoc) jmlGdoc += 1;
    else jmlSingkat += 1;
    if (c.disematkan) jmlSemat += 1;

    const katNama = String(c.kategori || "").trim() || "Tanpa Kategori";
    const tagStr = Array.isArray(c.tag) && c.tag.length > 0 ? c.tag.join(", ") : "-";
    const isiAtauTautan = adalahGdoc ? tautanAmanGoogleDocs(c) : String(c.isi || "-");

    return [
      idx + 1,
      formatTanggalSetempat(c.tanggal),
      String(c.judul || ""),
      adalahGdoc ? "Google Docs" : "Catatan Singkat",
      katNama,
      tagStr,
      c.disematkan ? "Ya" : "Tidak",
      cariJudulKegiatanTerkait(c.kegiatanId),
      isiAtauTautan
    ];
  });

  const header = [
    "No",
    "Tanggal",
    "Judul Catatan",
    "Jenis",
    "Kategori",
    "Tag",
    "Disematkan",
    "Kegiatan Terkait",
    "Isi / Tautan"
  ];
  const barisTotal = [
    "TOTAL",
    `${barisData.length} catatan`,
    `Singkat: ${jmlSingkat} | Google Docs: ${jmlGdoc}`,
    "",
    "",
    "",
    `Disematkan: ${jmlSemat}`,
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
    ringkasanTambahan: `Catatan Singkat: ${jmlSingkat} • Google Docs: ${jmlGdoc}`
  };
}
