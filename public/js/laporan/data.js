/**
 * Modul Data & Pengolahan Laporan
 * Menangani pengambilan data sekali pakai (kegiatan, dokumen, catatan),
 * penyusunan baris data laporan (Kegiatan, Rekap Status, Dokumen, Catatan),
 * dan ekspor CSV lokal.
 */
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { urutkanDaftarKategori } from "../kategori.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  ambilKegiatanRentangTanggal
} from "../kegiatan.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  formatUkuranBerkas,
  infoJenisBerkasMime,
  ambilSemuaDokumenSekaliPakai
} from "../dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  getDaftarCatatan,
  tautanAmanGoogleDocs,
  ambilSemuaCatatanSekaliPakai
} from "../catatan.js";
import {
  formatTanggalSetempat,
  ekstrakTanggalYmdDariIso,
  ambilInfoJenisLaporan,
  escapeSelCsv
} from "./util.js";
import { stateLaporan, validasiRentangTanggal } from "./state.js";

let notifikasiHandler = null;

export function setNotifikasiLaporanHandler(handler) {
  notifikasiHandler = handler;
}

function panggilNotifikasi(payload) {
  if (typeof notifikasiHandler === "function") {
    notifikasiHandler(payload);
  }
}

export async function pastikanDataLaporanTersedia(jenis, tglDari, tglSampai) {
  if (jenis === "kegiatan" || jenis === "rekap-status") {
    const kunciRentang = `${tglDari}_${tglSampai}`;
    if (stateLaporan.cacheKegiatanLaporan && stateLaporan.rentangTerakhirKegiatan === kunciRentang) {
      return stateLaporan.cacheKegiatanLaporan;
    }
    stateLaporan.sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilKegiatanRentangTanggal(tglDari, tglSampai);
      stateLaporan.cacheKegiatanLaporan = data;
      stateLaporan.rentangTerakhirKegiatan = kunciRentang;
      return data;
    } catch (err) {
      console.warn("Gagal memuat kegiatan rentang tanggal untuk laporan:", err);
      return getDaftarKegiatan();
    } finally {
      stateLaporan.sedangMemuatDataSekaliPakai = false;
    }
  } else if (jenis === "dokumen") {
    if (stateLaporan.cacheDokumenLaporan) return stateLaporan.cacheDokumenLaporan;
    stateLaporan.sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilSemuaDokumenSekaliPakai();
      stateLaporan.cacheDokumenLaporan = data;
      return data;
    } catch (err) {
      console.warn("Gagal memuat dokumen sekali pakai untuk laporan:", err);
      return getDaftarDokumen();
    } finally {
      stateLaporan.sedangMemuatDataSekaliPakai = false;
    }
  } else if (jenis === "catatan") {
    if (stateLaporan.cacheCatatanLaporan) return stateLaporan.cacheCatatanLaporan;
    stateLaporan.sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilSemuaCatatanSekaliPakai();
      stateLaporan.cacheCatatanLaporan = data;
      return data;
    } catch (err) {
      console.warn("Gagal memuat catatan sekali pakai untuk laporan:", err);
      return getDaftarCatatan();
    } finally {
      stateLaporan.sedangMemuatDataSekaliPakai = false;
    }
  }
  return [];
}

export function cariJudulKegiatanTerkait(kegiatanId) {
  const idBersih = String(kegiatanId || "").trim();
  if (!idBersih) return "-";
  const ketemu = getDaftarKegiatan().find((k) => k.id === idBersih);
  if (ketemu) return ketemu.judul;
  if (stateLaporan.cacheKegiatanLaporan) {
    const ketemuCache = stateLaporan.cacheKegiatanLaporan.find((k) => k.id === idBersih);
    if (ketemuCache) return ketemuCache.judul;
  }
  return "Kegiatan tidak ditemukan";
}

export function ambilDaftarOpsiKategoriLaporan(jenis) {
  if (jenis === "kegiatan" || jenis === "rekap-status") {
    const daftar = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori());
    return [
      { value: "ALL", label: "Semua Kategori" },
      { value: "NONE", label: "Tanpa Kategori" },
      ...daftar.map((k) => ({ value: k.id, label: k.nama }))
    ];
  }
  if (jenis === "dokumen") {
    const daftar = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori());
    return [
      { value: "ALL", label: "Semua Kategori" },
      { value: "NONE", label: "Tanpa Kategori" },
      ...daftar.map((k) => ({ value: k.id, label: k.nama }))
    ];
  }
  const unikMap = new Map();
  for (const c of getDaftarCatatan()) {
    const kat = String(c.kategori || "").trim();
    if (kat) {
      const kKecil = kat.toLowerCase();
      if (!unikMap.has(kKecil)) unikMap.set(kKecil, kat);
    }
  }
  const urutNama = Array.from(unikMap.values()).sort((a, b) =>
    a.localeCompare(b, "id", { sensitivity: "base" })
  );
  return [
    { value: "ALL", label: "Semua Kategori" },
    { value: "NONE", label: "Tanpa Kategori" },
    ...urutNama.map((nama) => ({ value: `CAT:${nama}`, label: nama }))
  ];
}

export function cocokFilterKategoriTerstruktur(kategoriIdItem, manajer) {
  if (stateLaporan.filterKategori === "ALL") return true;
  const info = manajer.cariInfoKategori(kategoriIdItem);
  if (stateLaporan.filterKategori === "NONE") return Boolean(info.tetap);
  return info.id === stateLaporan.filterKategori;
}

export function cocokFilterKategoriCatatan(kategoriTeks) {
  if (stateLaporan.filterKategori === "ALL") return true;
  const bersih = String(kategoriTeks || "").trim();
  if (stateLaporan.filterKategori === "NONE") return bersih === "";
  if (stateLaporan.filterKategori.startsWith("CAT:")) {
    const target = stateLaporan.filterKategori.slice(4).toLowerCase();
    return bersih.toLowerCase() === target;
  }
  return true;
}

function susunLaporanKegiatan(infoJenis, rentangLabel) {
  const sumberKegiatan = stateLaporan.cacheKegiatanLaporan || getDaftarKegiatan();
  const tersaring = sumberKegiatan
    .filter((k) => {
      if (!parseTanggal(k.tanggal)) return false;
      if (k.tanggal < stateLaporan.tanggalDari || k.tanggal > stateLaporan.tanggalSampai) return false;
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

function susunLaporanRekapStatus(infoJenis, rentangLabel) {
  const sumberKegiatan = stateLaporan.cacheKegiatanLaporan || getDaftarKegiatan();
  const kegiatanPeriode = sumberKegiatan.filter((k) => {
    if (!parseTanggal(k.tanggal)) return false;
    if (k.tanggal < stateLaporan.tanggalDari || k.tanggal > stateLaporan.tanggalSampai) return false;
    return cocokFilterKategoriTerstruktur(k.kategoriId, manajerKategoriKegiatan);
  });

  const totalKegiatan = kegiatanPeriode.length;
  const perStatus = { Rencana: 0, Berjalan: 0, Selesai: 0 };
  const petaKategori = new Map();

  const daftarKatUrut = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori());
  if (stateLaporan.filterKategori === "ALL") {
    for (const k of daftarKatUrut) {
      petaKategori.set(k.id, { nama: k.nama, Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
    }
    petaKategori.set("", { nama: "Tanpa Kategori", Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
  } else if (stateLaporan.filterKategori === "NONE") {
    petaKategori.set("", { nama: "Tanpa Kategori", Rencana: 0, Berjalan: 0, Selesai: 0, total: 0 });
  } else {
    const infoPilih = manajerKategoriKegiatan.cariInfoKategori(stateLaporan.filterKategori);
    petaKategori.set(infoPilih.tetap ? "" : infoPilih.id, {
      nama: infoPilih.nama,
      Rencana: 0,
      Berjalan: 0,
      Selesai: 0,
      total: 0
    });
  }

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

  const barisData = [];
  let nomor = 1;
  for (const st of DAFTAR_STATUS_KEGIATAN) {
    const jml = perStatus[st];
    const pct = totalKegiatan > 0 ? `${Math.round((jml / totalKegiatan) * 100)}%` : "0%";
    barisData.push([
      nomor++,
      "Rekap per Status",
      st,
      st === "Rencana" ? jml : 0,
      st === "Berjalan" ? jml : 0,
      st === "Selesai" ? jml : 0,
      jml,
      pct
    ]);
  }

  for (const entri of petaKategori.values()) {
    const pct = totalKegiatan > 0 ? `${Math.round((entri.total / totalKegiatan) * 100)}%` : "0%";
    barisData.push([
      nomor++,
      "Rekap per Kategori",
      entri.nama,
      entri.Rencana,
      entri.Berjalan,
      entri.Selesai,
      entri.total,
      pct
    ]);
  }

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

function susunLaporanDokumen(infoJenis, rentangLabel, onDataDimuat) {
  if (!stateLaporan.cacheDokumenLaporan && !stateLaporan.sedangMemuatDataSekaliPakai) {
    pastikanDataLaporanTersedia("dokumen").then(() => {
      if (typeof onDataDimuat === "function") onDataDimuat();
    });
  }
  const sumberDokumen = stateLaporan.cacheDokumenLaporan || getDaftarDokumen();
  const tersaring = sumberDokumen
    .map((d) => ({
      ...d,
      _ymdLokal: ekstrakTanggalYmdDariIso(d.tanggalUnggah || d.createdAt)
    }))
    .filter((d) => {
      if (!d._ymdLokal) return false;
      if (d._ymdLokal < stateLaporan.tanggalDari || d._ymdLokal > stateLaporan.tanggalSampai) return false;
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

function susunLaporanCatatan(infoJenis, rentangLabel, onDataDimuat) {
  if (!stateLaporan.cacheCatatanLaporan && !stateLaporan.sedangMemuatDataSekaliPakai) {
    pastikanDataLaporanTersedia("catatan").then(() => {
      if (typeof onDataDimuat === "function") onDataDimuat();
    });
  }
  const sumberCatatan = stateLaporan.cacheCatatanLaporan || getDaftarCatatan();
  const tersaring = sumberCatatan
    .filter((c) => {
      if (!parseTanggal(c.tanggal)) return false;
      if (c.tanggal < stateLaporan.tanggalDari || c.tanggal > stateLaporan.tanggalSampai) return false;
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

export function susunDataLaporanSaatIni(onDataDimuat) {
  const cekTgl = validasiRentangTanggal();
  const infoJenis = ambilInfoJenisLaporan(stateLaporan.jenisAktif);
  const rentangLabel = cekTgl.valid
    ? `${formatTanggalSetempat(stateLaporan.tanggalDari)} – ${formatTanggalSetempat(stateLaporan.tanggalSampai)}`
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

  if (stateLaporan.jenisAktif === "kegiatan" || stateLaporan.jenisAktif === "rekap-status") {
    const kunciRentang = `${stateLaporan.tanggalDari}_${stateLaporan.tanggalSampai}`;
    if (!stateLaporan.cacheKegiatanLaporan || stateLaporan.rentangTerakhirKegiatan !== kunciRentang) {
      if (!stateLaporan.sedangMemuatDataSekaliPakai) {
        pastikanDataLaporanTersedia(stateLaporan.jenisAktif, stateLaporan.tanggalDari, stateLaporan.tanggalSampai).then(() => {
          if (typeof onDataDimuat === "function") onDataDimuat();
        });
      }
      return {
        valid: true,
        sedangMemuatSumber: true,
        infoJenis,
        rentangLabel,
        header: [],
        barisData: [],
        barisTotal: [],
        ringkasanTambahan: ""
      };
    }
  }

  if (stateLaporan.jenisAktif === "kegiatan") {
    return susunLaporanKegiatan(infoJenis, rentangLabel);
  }

  if (stateLaporan.jenisAktif === "rekap-status") {
    return susunLaporanRekapStatus(infoJenis, rentangLabel);
  }

  if (stateLaporan.jenisAktif === "dokumen") {
    return susunLaporanDokumen(infoJenis, rentangLabel, onDataDimuat);
  }

  return susunLaporanCatatan(infoJenis, rentangLabel, onDataDimuat);
}

export async function unduhLaporanSebagaiCsv() {
  await pastikanDataLaporanTersedia(stateLaporan.jenisAktif, stateLaporan.tanggalDari, stateLaporan.tanggalSampai);
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    panggilNotifikasi({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    panggilNotifikasi({ pesan: "Data sumber masih dimuat. Tunggu sesaat lalu coba lagi.", tipe: "warning" });
    return;
  }

  const semuaBaris = [paket.header, ...paket.barisData, paket.barisTotal];
  const isiCsv = "\uFEFF" + semuaBaris.map((baris) => baris.map(escapeSelCsv).join(",")).join("\r\n");
  const blob = new Blob([isiCsv], { type: "text/csv;charset=utf-8;" });
  const urlObj = URL.createObjectURL(blob);

  const slugJenis = paket.infoJenis.judulPendek.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const namaBerkas = `laporan-${slugJenis}-${hariIni()}.csv`;

  const tautanUnduh = document.createElement("a");
  tautanUnduh.href = urlObj;
  tautanUnduh.download = namaBerkas;
  tautanUnduh.hidden = true;
  document.body.appendChild(tautanUnduh);
  tautanUnduh.click();
  tautanUnduh.remove();
  window.setTimeout(() => URL.revokeObjectURL(urlObj), 1500);

  panggilNotifikasi({
    pesan: `Berkas "${namaBerkas}" (${paket.barisData.length} baris) berhasil diunduh ke perangkat Anda.`,
    tipe: "success"
  });
}