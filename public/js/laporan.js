/**
 * Modul Halaman Laporan Google Sheets & Unduh CSV Cadangan (Fase 5)
 * Mematuhi seluruh Aturan Kode (#2, #5, #6, #7, #8, #9, #10, #12, #13, #14):
 * - Empat jenis laporan: Daftar Kegiatan per periode, Rekap Status Kegiatan, Daftar Dokumen, Daftar Catatan
 * - Filter tanggal kalender murni lewat util-tanggal.js (awal bulan s/d hari ini) & filter kategori
 * - Pembuatan Google Sheets API v4 (header tebal biru muda, kolom otomatis, baris pertama dibekukan, baris total)
 * - Pemindahan spreadsheet ke folder induk "Agenda-Arsip" lewat ID dari koleksi "pengaturan"
 * - Riwayat Laporan real-time pada koleksi "laporan" (hapus riwayat tidak menghapus file di Drive)
 * - Unduh CSV lokal (UTF-8 dengan BOM) tetap berfungsi tanpa internet
 */
import { SHEETS_API_BASE, KOLEKSI } from "./config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  formatPesanGalatFirestore
} from "./services/firestoreService.js";
import {
  getDriveAccessToken,
  isDriveTokenExpired,
  loginWithGoogle,
  formatPesanGalatAuth
} from "./services/authService.js";
import { tanggalLokal, hariIni, parseTanggal } from "./util-tanggal.js";
import { urutkanDaftarKategori } from "./kategori.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  ambilKegiatanRentangTanggal,
  ambilSemuaKegiatanSekaliPakai
} from "./modules/kegiatan/index.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  onPerubahanDokumen,
  formatUkuranBerkas,
  infoJenisBerkasMime,
  ambilSemuaDokumenSekaliPakai
} from "./modules/dokumen/index.js";
import {
  JENIS_CATATAN_GDOC,
  getDaftarCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  tautanAmanGoogleDocs,
  ambilSemuaCatatanSekaliPakai
} from "./catatan.js";
import {
  pastikanFolderIndukDrive,
  pindahkanBerkasKeFolderDrive,
  formatPesanGalatDrive
} from "./services/driveService.js";
import { escapeHtml, svgIkon, NAMA_BULAN_PENDEK } from "./util-html.js";

// NAMA_BULAN_PENDEK kini diimpor dari util-html.js (Tahap 4a deduplikasi)

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
    judulPendek: "Daftar Catatan"
  }
];
DAFTAR_JENIS_LAPORAN[3].namaTab = "Daftar Catatan";


const IKON_TABEL = svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>', 18);
const IKON_UNDUH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18);
const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 15);
const IKON_HAPUS = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 16);

let unsubscribeSnapshotLaporan = null;
let unsubKategoriKeg = null;
let unsubKategoriDok = null;
let daftarRiwayatLaporan = [];
let riwayatSudahDimuat = false;
let antarmukaSudahDiikat = false;

let jenisAktif = "kegiatan";
let tanggalDari = "";
let tanggalSampai = "";
let filterKategori = "ALL";

let sedangMembuatSpreadsheet = false;
let hapusRiwayatModalTerbuka = false;
let itemRiwayatAkanDihapus = null;
let fokusSebelumModalLaporan = null;

/**
 * Fase 6 Bagian C1: Mengekspor akses metadata riwayat laporan dari memori/langganan tunggal.
 */
export function getDaftarLaporan() {
  return daftarRiwayatLaporan.map((item) => ({ ...item }));
}

export function isLaporanSudahDimuat() {
  return riwayatSudahDimuat;
}

function hitungAwalBulanIni() {
  const skrStr = hariIni();
  const skrObj = parseTanggal(skrStr);
  if (!skrObj) return skrStr;
  return tanggalLokal(new Date(skrObj.getFullYear(), skrObj.getMonth(), 1));
}

function pastikanRentangDefault() {
  if (!tanggalDari || !parseTanggal(tanggalDari)) {
    tanggalDari = hitungAwalBulanIni();
  }
  if (!tanggalSampai || !parseTanggal(tanggalSampai)) {
    tanggalSampai = hariIni();
  }
}

function formatTanggalSetempat(ymdStr) {
  const obj = parseTanggal(ymdStr);
  if (!obj) return ymdStr || "-";
  return `${obj.getDate()} ${NAMA_BULAN_PENDEK[obj.getMonth()]} ${obj.getFullYear()}`;
}

function ekstrakTanggalYmdDariIso(nilaiMentah) {
  if (!nilaiMentah) return "";
  const str = String(nilaiMentah).trim();
  if (parseTanggal(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return tanggalLokal(d);
}

function formatWaktuRiwayatLokal(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "-";
  const ymd = tanggalLokal(d);
  const tgl = formatTanggalSetempat(ymd);
  const jam = String(d.getHours()).padStart(2, "0");
  const menit = String(d.getMinutes()).padStart(2, "0");
  return `${tgl}, ${jam}.${menit}`;
}

function ambilInfoJenisLaporan(idJenis) {
  return DAFTAR_JENIS_LAPORAN.find((j) => j.id === idJenis) || DAFTAR_JENIS_LAPORAN[0];
}

// Cache lokal sekali pakai untuk data laporan yang dimuat berdasarkan permintaan
let cacheKegiatanLaporan = null;
let rentangTerakhirKegiatan = "";
let cacheDokumenLaporan = null;
let cacheCatatanLaporan = null;
let sedangMemuatDataSekaliPakai = false;

export async function pastikanDataLaporanTersedia(jenis, tglDari, tglSampai) {
  if (jenis === "kegiatan" || jenis === "rekap-status") {
    const kunciRentang = `${tglDari}_${tglSampai}`;
    if (cacheKegiatanLaporan && rentangTerakhirKegiatan === kunciRentang) {
      return cacheKegiatanLaporan;
    }
    sedangMemuatDataSekaliPakai = true;
    try {
      const data = await ambilKegiatanRentangTanggal(tglDari, tglSampai);
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

function cariJudulKegiatanTerkait(kegiatanId) {
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

function ambilDaftarOpsiKategoriLaporan(jenis) {
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

function cocokFilterKategoriTerstruktur(kategoriIdItem, manajer) {
  if (filterKategori === "ALL") return true;
  const info = manajer.cariInfoKategori(kategoriIdItem);
  if (filterKategori === "NONE") return Boolean(info.tetap);
  return info.id === filterKategori;
}

function cocokFilterKategoriCatatan(kategoriTeks) {
  if (filterKategori === "ALL") return true;
  const bersih = String(kategoriTeks || "").trim();
  if (filterKategori === "NONE") return bersih === "";
  if (filterKategori.startsWith("CAT:")) {
    const target = filterKategori.slice(4).toLowerCase();
    return bersih.toLowerCase() === target;
  }
  return true;
}

function validasiRentangTanggal() {
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

function susunDataLaporanSaatIni() {
  const cekTgl = validasiRentangTanggal();
  const infoJenis = ambilInfoJenisLaporan(jenisAktif);
  const rentangLabel = cekTgl.valid
    ? `${formatTanggalSetempat(tanggalDari)} – ${formatTanggalSetempat(tanggalSampai)}`
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

  if (jenisAktif === "kegiatan" || jenisAktif === "rekap-status") {
    const kunciRentang = `${tanggalDari}_${tanggalSampai}`;
    if (!cacheKegiatanLaporan || rentangTerakhirKegiatan !== kunciRentang) {
      if (!sedangMemuatDataSekaliPakai) {
        pastikanDataLaporanTersedia(jenisAktif, tanggalDari, tanggalSampai).then(() => {
          renderPratinjauLaporan();
        });
      }
      return { valid: true, sedangMemuatSumber: true, infoJenis, rentangLabel, header: [], barisData: [], barisTotal: [], ringkasanTambahan: "" };
    }
  }

  if (jenisAktif === "kegiatan") {
    const sumberKegiatan = cacheKegiatanLaporan || getDaftarKegiatan();
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

  if (jenisAktif === "rekap-status") {
    const sumberKegiatan = cacheKegiatanLaporan || getDaftarKegiatan();
    const kegiatanPeriode = sumberKegiatan.filter((k) => {
      if (!parseTanggal(k.tanggal)) return false;
      if (k.tanggal < tanggalDari || k.tanggal > tanggalSampai) return false;
      return cocokFilterKategoriTerstruktur(k.kategoriId, manajerKategoriKegiatan);
    });

    const totalKegiatan = kegiatanPeriode.length;
    const perStatus = { Rencana: 0, Berjalan: 0, Selesai: 0 };
    const petaKategori = new Map();

    const daftarKatUrut = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori());
    if (filterKategori === "ALL") {
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

  if (jenisAktif === "dokumen") {
    if (!cacheDokumenLaporan && !sedangMemuatDataSekaliPakai) {
      pastikanDataLaporanTersedia("dokumen").then(() => {
        renderPratinjauLaporan();
      });
    }
    const sumberDokumen = cacheDokumenLaporan || getDaftarDokumen();
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

  // Jenis: "catatan"
  if (!cacheCatatanLaporan && !sedangMemuatDataSekaliPakai) {
    pastikanDataLaporanTersedia("catatan").then(() => {
      renderPratinjauLaporan();
    });
  }
  const sumberCatatan = cacheCatatanLaporan || getDaftarCatatan();
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

function escapeSelCsv(nilai) {
  const str = nilai === null || nilai === undefined ? "" : String(nilai);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function unduhLaporanSebagaiCsv() {
  await pastikanDataLaporanTersedia(jenisAktif, tanggalDari, tanggalSampai);
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    tampilkanNotifikasiLaporan({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    tampilkanNotifikasiLaporan({ pesan: "Data sumber masih dimuat. Tunggu sesaat lalu coba lagi.", tipe: "warning" });
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

  tampilkanNotifikasiLaporan({
    pesan: `Berkas "${namaBerkas}" (${paket.barisData.length} baris) berhasil diunduh ke perangkat Anda.`,
    tipe: "success"
  });
}

function buatErrorSheets(status, pesanAsli, alasanKode = "", detailStatus = "") {
  const rawLower = String(pesanAsli || "").toLowerCase();
  const reasonLower = String(alasanKode || "").toLowerCase();
  const statusStrLower = String(detailStatus || "").toLowerCase();

  let pesan = "Terjadi kesalahan saat membuat laporan di Google Sheets.";
  let butuhRelogin = false;

  if (!navigator.onLine) {
    pesan = "Tidak ada koneksi internet. Pembuatan Google Sheets memerlukan sambungan internet aktif. Anda tetap dapat memakai tombol \"Unduh CSV\".";
  } else if (status === 401) {
    pesan = "Sesi akses Google telah kedaluwarsa atau tidak sah. Silakan klik tombol \"Masuk ulang\" lalu coba buat laporan kembali.";
    butuhRelogin = true;
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("sheets api has not been used") ||
      rawLower.includes("google sheets api has not been used") ||
      (rawLower.includes("sheets.googleapis.com") && rawLower.includes("disabled")) ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("is disabled")
    ) {
      pesan = "Google Sheets API belum diaktifkan pada proyek ini. Buka Google Cloud Console -> APIs & Services -> Library, cari \"Google Sheets API\", klik Enable, lalu coba lagi.";
    } else if (
      reasonLower.includes("insufficientpermissions") ||
      reasonLower.includes("access_token_scope_insufficient") ||
      rawLower.includes("insufficient authentication scopes") ||
      rawLower.includes("insufficient permission") ||
      statusStrLower === "permission_denied"
    ) {
      pesan = "Izin akses Google tidak mencukupi untuk membuat Google Sheets (403). Silakan klik \"Masuk ulang\" dan setujui izin akses Google Drive, atau jika masih ditolak mungkin perlu menambah scope https://www.googleapis.com/auth/spreadsheets pada konfigurasi login.";
      butuhRelogin = true;
    } else {
      pesan = `Permintaan ditolak oleh Google Sheets (403)${pesanAsli ? `: ${pesanAsli}` : "."} Anda dapat mencoba \"Masuk ulang\" atau periksa pengaktifan Google Sheets API di Google Cloud Console.`;
      butuhRelogin = true;
    }
  } else if (status === 404) {
    pesan = "Spreadsheet tujuan tidak ditemukan di Google Sheets (404).";
  } else if (status === 429) {
    pesan = "Terlalu banyak permintaan ke Google Sheets dalam waktu singkat (429). Tunggu beberapa detik lalu coba kembali.";
  } else if (pesanAsli) {
    pesan = `Kendala Google Sheets (${status}): ${pesanAsli}`;
  }

  const err = new Error(pesan);
  err.status = status;
  err.butuhRelogin = butuhRelogin;
  err.isTokenExpired = status === 401;
  return err;
}

async function panggilSheetsApi(url, opsi = {}) {
  if (!navigator.onLine) {
    throw buatErrorSheets(0, "");
  }
  if (isDriveTokenExpired()) {
    const errExp = new Error(
      "Sesi akses Google telah kedaluwarsa (lebih dari 50 menit) atau belum aktif. Klik \"Masuk ulang\" sebelum membuat spreadsheet."
    );
    errExp.butuhRelogin = true;
    errExp.isTokenExpired = true;
    throw errExp;
  }
  const token = getDriveAccessToken();
  if (!token) {
    const errNoToken = new Error(
      "Token akses Google tidak tersedia. Klik \"Masuk ulang\" untuk memperbarui sesi akses."
    );
    errNoToken.butuhRelogin = true;
    errNoToken.isTokenExpired = true;
    throw errNoToken;
  }

  const headers = new Headers(opsi.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opsi.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
  }

  let resp;
  try {
    resp = await fetch(url, { ...opsi, headers });
  } catch (_netErr) {
    throw new Error(
      !navigator.onLine
        ? "Koneksi internet terputus saat menghubungi Google Sheets. Gunakan tombol \"Unduh CSV\" bila sedang luring."
        : "Gagal menghubungi layanan Google Sheets. Periksa sambungan internet Anda."
    );
  }

  if (!resp.ok) {
    let pesanAsli = "";
    let alasanKode = "";
    let statusTeks = "";
    try {
      const data = await resp.json();
      if (data && data.error) {
        pesanAsli = String(data.error.message || "");
        statusTeks = String(data.error.status || "");
        if (Array.isArray(data.error.errors) && data.error.errors.length > 0) {
          alasanKode = String(data.error.errors[0].reason || "");
        }
        if (!alasanKode && Array.isArray(data.error.details)) {
          const infoErr = data.error.details.find((d) => d && d.reason);
          if (infoErr) alasanKode = String(infoErr.reason);
        }
      }
    } catch (_e) {
      try { pesanAsli = await resp.text(); } catch (_e2) {}
    }
    throw buatErrorSheets(resp.status, pesanAsli, alasanKode, statusTeks);
  }

  return resp.json();
}

function kolomKeHurufA1(indeksNol) {
  let n = indeksNol + 1;
  let hasil = "";
  while (n > 0) {
    const sisa = (n - 1) % 26;
    hasil = String.fromCharCode(65 + sisa) + hasil;
    n = Math.floor((n - 1) / 26);
  }
  return hasil || "A";
}

async function buatLaporanKeGoogleSheets() {
  if (sedangMembuatSpreadsheet) return;

  await pastikanDataLaporanTersedia(jenisAktif, tanggalDari, tanggalSampai);
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    tampilkanNotifikasiLaporan({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    tampilkanNotifikasiLaporan({ pesan: "Data sumber masih dimuat. Tunggu beberapa detik lalu coba lagi.", tipe: "warning" });
    return;
  }
  if (!navigator.onLine) {
    tampilkanNotifikasiLaporan({
      pesan: "Tidak ada koneksi internet. Pembuatan Google Sheets dinonaktifkan saat luring, silakan gunakan tombol \"Unduh CSV\".",
      tipe: "warning"
    });
    return;
  }

  sedangMembuatSpreadsheet = true;
  perbaruiStatusTombolLaporan();
  tampilkanNotifikasiLaporan({ pesan: "" });

  const progressBox = document.getElementById("laporan-progress-box");
  const progressLabel = document.getElementById("laporan-progress-label");
  if (progressBox) progressBox.hidden = false;
  const setTahap = (teks) => {
    if (progressLabel) progressLabel.textContent = teks;
  };

  try {
    const tglJudul = formatTanggalSetempat(hariIni());
    const judulSpreadsheet = `Laporan ${paket.infoJenis.judulPendek} - ${tglJudul}`;
    const namaTab = paket.infoJenis.namaTab;
    const semuaBaris = [paket.header, ...paket.barisData, paket.barisTotal];
    const jumlahKolom = paket.header.length;
    const jumlahBarisTotal = semuaBaris.length;

    setTahap("Membuat spreadsheet baru di Google Sheets...");
    const dibuat = await panggilSheetsApi(SHEETS_API_BASE, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          title: judulSpreadsheet
        },
        sheets: [
          {
            properties: {
              title: namaTab,
              gridProperties: {
                rowCount: Math.max(jumlahBarisTotal + 4, 25),
                columnCount: Math.max(jumlahKolom, 4),
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    });

    const spreadsheetId = String(dibuat?.spreadsheetId || "").trim();
    if (!spreadsheetId) {
      throw new Error("Google Sheets tidak mengembalikan ID spreadsheet yang baru dibuat.");
    }
    const sheetNumericId =
      Array.isArray(dibuat?.sheets) &&
      dibuat.sheets[0] &&
      dibuat.sheets[0].properties &&
      typeof dibuat.sheets[0].properties.sheetId === "number"
        ? dibuat.sheets[0].properties.sheetId
        : 0;
    const spreadsheetUrl =
      String(dibuat?.spreadsheetUrl || "").trim() ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;

    setTahap("Menulis data dan baris total ke Google Sheets...");
    const kolomAkhirA1 = kolomKeHurufA1(jumlahKolom - 1);
    const rangeA1 = `'${namaTab.replace(/'/g, "''")}'!A1:${kolomAkhirA1}${jumlahBarisTotal}`;
    await panggilSheetsApi(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({
          range: rangeA1,
          majorDimension: "ROWS",
          values: semuaBaris
        })
      }
    );

    setTahap("Mengatur format tabel, pembekuan header, dan lebar kolom...");
    await panggilSheetsApi(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetNumericId,
                  gridProperties: {
                    frozenRowCount: 1
                  }
                },
                fields: "gridProperties.frozenRowCount"
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: sheetNumericId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: jumlahKolom
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.859, green: 0.918, blue: 0.996 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 0.118, green: 0.251, blue: 0.686 }
                    },
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "WRAP"
                  }
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: sheetNumericId,
                  startRowIndex: jumlahBarisTotal - 1,
                  endRowIndex: jumlahBarisTotal,
                  startColumnIndex: 0,
                  endColumnIndex: jumlahKolom
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.945, green: 0.961, blue: 0.976 },
                    textFormat: { bold: true },
                    borders: {
                      top: {
                        style: "SOLID",
                        color: { red: 0.796, green: 0.835, blue: 0.882 }
                      }
                    }
                  }
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,borders.top)"
              }
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetNumericId,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: jumlahKolom
                }
              }
            }
          ]
        })
      }
    );

    setTahap("Memindahkan spreadsheet ke folder Agenda-Arsip di Google Drive...");
    const rootFolderId = await pastikanFolderIndukDrive();
    await pindahkanBerkasKeFolderDrive(spreadsheetId, rootFolderId);

    setTahap("Menyimpan catatan ke Riwayat Laporan...");
    const db = getFirestoreDb();
    await addDoc(collection(db, KOLEKSI.LAPORAN), {
      nama: judulSpreadsheet,
      jenis: paket.infoJenis.id,
      jenisLabel: paket.infoJenis.judulPendek,
      tautan: spreadsheetUrl,
      sheetId: spreadsheetId,
      rentangTanggal: paket.rentangLabel,
      tanggalDari,
      tanggalSampai,
      jumlahBaris: paket.barisData.length,
      createdAt: new Date().toISOString()
    });

    tampilkanNotifikasiLaporan({
      pesan: `Laporan "${judulSpreadsheet}" (${paket.barisData.length} baris) berhasil dibuat dan disimpan di folder Agenda-Arsip.`,
      tipe: "success",
      tautanSheets: spreadsheetUrl
    });
  } catch (err) {
    const butuhRelogin = Boolean(
      err && typeof err === "object" && (err.butuhRelogin || err.isTokenExpired || err.isUnauthorized || err.status === 401)
    );
    let pesanGalat = "";
    if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
      pesanGalat = formatPesanGalatFirestore(err);
    } else if (err instanceof Error && err.message) {
      pesanGalat = err.message;
    } else {
      pesanGalat = formatPesanGalatDrive(err);
    }
    tampilkanNotifikasiLaporan({
      pesan: pesanGalat,
      tipe: "danger",
      butuhRelogin
    });
  } finally {
    sedangMembuatSpreadsheet = false;
    if (progressBox) progressBox.hidden = true;
    perbaruiStatusTombolLaporan();
  }
}

function tampilkanNotifikasiLaporan({ pesan = "", tipe = "danger", butuhRelogin = false, tautanSheets = "" } = {}) {
  const box = document.getElementById("laporan-page-feedback");
  const txt = document.getElementById("laporan-page-feedback-text");
  const act = document.getElementById("laporan-page-feedback-actions");
  if (!box || !txt || !act) return;

  const bersih = String(pesan || "").trim();
  if (!bersih) {
    box.hidden = true;
    txt.textContent = "";
    act.innerHTML = "";
    return;
  }

  box.className =
    tipe === "success"
      ? "alert-box alert-box-success catatan-feedback-banner"
      : tipe === "warning"
        ? "alert-box alert-box-warning catatan-feedback-banner"
        : "alert-box catatan-feedback-banner";
  txt.textContent = bersih;

  const tombol = [];
  if (tautanSheets && /^https?:\/\//i.test(tautanSheets)) {
    tombol.push(
      `<a href="${escapeHtml(tautanSheets)}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Google Sheets</span></a>`
    );
  }
  if (butuhRelogin) {
    tombol.push(
      `<button type="button" class="btn-primary btn-sm-touch" data-laporan-action="relogin">Masuk ulang</button>`
    );
  }
  tombol.push(
    `<button type="button" class="btn-secondary btn-sm-touch" data-laporan-action="dismiss-feedback">Tutup</button>`
  );
  act.innerHTML = tombol.join("");
  box.hidden = false;
}

function perbaruiStatusTombolLaporan() {
  const online = navigator.onLine;
  const cekTgl = validasiRentangTanggal();

  const btnBuat = document.getElementById("btn-laporan-buat-sheets");
  const btnCsv = document.getElementById("btn-laporan-unduh-csv");
  const offlineNote = document.getElementById("laporan-offline-note");

  if (offlineNote) offlineNote.hidden = online;

  if (btnBuat instanceof HTMLButtonElement) {
    btnBuat.disabled = !online || !cekTgl.valid || sedangMembuatSpreadsheet;
    const labelSpan = btnBuat.querySelector("span");
    if (labelSpan) {
      labelSpan.textContent = sedangMembuatSpreadsheet ? "Membuat Spreadsheet..." : "Buat Laporan";
    }
    btnBuat.title = !online
      ? "Tidak ada koneksi internet. Gunakan tombol Unduh CSV."
      : "Buat laporan baru di Google Sheets";
  }

  if (btnCsv instanceof HTMLButtonElement) {
    btnCsv.disabled = !cekTgl.valid || sedangMembuatSpreadsheet;
  }
}

export function perbaruiStatusJaringanLaporan() {
  perbaruiStatusTombolLaporan();
}

function sinkronkanDropdownKategoriLaporan() {
  const selectEl = document.getElementById("laporan-filter-kategori");
  if (!(selectEl instanceof HTMLSelectElement)) return;

  const opsi = ambilDaftarOpsiKategoriLaporan(jenisAktif);
  const masihValid = opsi.some((o) => o.value === filterKategori);
  if (!masihValid) {
    filterKategori = "ALL";
  }

  selectEl.innerHTML = opsi
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join("");
  selectEl.value = filterKategori;
}

function renderPratinjauLaporan() {
  const countEl = document.getElementById("laporan-preview-count");
  const captionEl = document.getElementById("laporan-preview-caption");
  const bodyEl = document.getElementById("laporan-preview-body");
  const valBox = document.getElementById("laporan-validation-alert");
  const valText = document.getElementById("laporan-validation-text");
  if (!bodyEl) return;

  const paket = susunDataLaporanSaatIni();
  perbaruiStatusTombolLaporan();

  if (valBox && valText) {
    valText.textContent = paket.valid ? "" : paket.pesanValidasi;
    valBox.hidden = paket.valid;
  }

  if (!paket.valid) {
    if (countEl) countEl.textContent = "0";
    if (captionEl) captionEl.textContent = "Perbaiki rentang tanggal terlebih dahulu";
    bodyEl.innerHTML = `<p class="dash-empty-text">Rentang tanggal belum valid. Pastikan tanggal awal tidak melebihi tanggal akhir.</p>`;
    return;
  }

  if (paket.sedangMemuatSumber) {
    if (countEl) countEl.textContent = "…";
    if (captionEl) captionEl.textContent = `${paket.infoJenis.label} • ${paket.rentangLabel}`;
    bodyEl.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat pratinjau laporan"><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div>`;
    return;
  }

  const jumlahBaris = paket.barisData.length;
  if (countEl) countEl.textContent = String(jumlahBaris);
  if (captionEl) {
    captionEl.textContent = `${paket.infoJenis.label} • Periode ${paket.rentangLabel}${
      paket.ringkasanTambahan ? ` • ${paket.ringkasanTambahan}` : ""
    }`;
  }

  if (jumlahBaris === 0) {
    bodyEl.innerHTML = `<p class="dash-empty-text">Tidak ada baris data pada rentang tanggal dan filter kategori ini. Anda tetap dapat mengunduh CSV atau membuat spreadsheet kosong berisi header.</p>`;
    return;
  }

  const maksPratinjau = 8;
  const cuplikan = paket.barisData.slice(0, maksPratinjau);
  const sisa = jumlahBaris - cuplikan.length;

  const thHtml = paket.header.map((kol) => `<th scope="col">${escapeHtml(kol)}</th>`).join("");
  const trDataHtml = cuplikan
    .map(
      (baris) =>
        `<tr>${baris.map((sel) => `<td>${escapeHtml(String(sel ?? ""))}</td>`).join("")}</tr>`
    )
    .join("");
  const trTotalHtml = `<tr class="laporan-total-row">${paket.barisTotal
    .map((sel) => `<td>${escapeHtml(String(sel ?? ""))}</td>`)
    .join("")}</tr>`;

  bodyEl.innerHTML = `
    <div class="laporan-table-scroll">
      <table class="laporan-preview-table">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${trDataHtml}</tbody>
        <tfoot>${trTotalHtml}</tfoot>
      </table>
    </div>
    ${
      sisa > 0
        ? `<p class="dash-more-note">Menampilkan ${cuplikan.length} dari ${jumlahBaris} baris pada pratinjau. Seluruh ${jumlahBaris} baris akan disertakan di Google Sheets maupun CSV.</p>`
        : `<p class="dash-more-note">Menampilkan seluruh ${jumlahBaris} baris yang siap dibuat ke laporan.</p>`
    }
  `;
}

function renderRiwayatLaporan() {
  const region = document.getElementById("laporan-riwayat-region");
  const countBadge = document.getElementById("laporan-riwayat-count");
  if (!region) return;

  if (!riwayatSudahDimuat) {
    region.innerHTML = `<div class="skeleton-card" role="status" aria-label="Memuat riwayat laporan"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div></div>`;
    return;
  }

  if (countBadge) countBadge.textContent = String(daftarRiwayatLaporan.length);

  if (daftarRiwayatLaporan.length === 0) {
    region.innerHTML = `<div class="empty-stage-card empty-stage-compact">
      <div class="empty-stage-icon" aria-hidden="true">${IKON_TABEL}</div>
      <h3 class="empty-stage-title">Belum Ada Riwayat Laporan</h3>
      <p class="empty-stage-desc">Setiap spreadsheet yang dibuat lewat tombol <strong>Buat Laporan</strong> akan tercatat di sini beserta tautan langsung ke Google Sheets.</p>
    </div>`;
    return;
  }

  const urutTerbaru = [...daftarRiwayatLaporan].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  region.innerHTML = `<div class="kegiatan-list-grid">${urutTerbaru
    .map((item) => {
      const infoJenis = ambilInfoJenisLaporan(item.jenis);
      const labelJenis = item.jenisLabel || infoJenis.judulPendek;
      const tautanAman =
        item.tautan && /^https?:\/\//i.test(item.tautan)
          ? item.tautan
          : item.sheetId
            ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(item.sheetId)}/edit`
            : "#";
      const rentangStr =
        item.rentangTanggal ||
        (item.tanggalDari && item.tanggalSampai
          ? `${formatTanggalSetempat(item.tanggalDari)} – ${formatTanggalSetempat(item.tanggalSampai)}`
          : "-");
      const jmlBaris = Number.isFinite(Number(item.jumlahBaris)) ? Number(item.jumlahBaris) : 0;

      return `<article class="kegiatan-card laporan-history-card" data-id="${escapeHtml(item.id)}">
        <div class="kegiatan-card-top">
          <div class="kegiatan-badges-row">
            <span class="cat-badge cat-color-biru">${escapeHtml(labelJenis)}</span>
            <span class="catatan-category-label">${jmlBaris} baris</span>
          </div>
          <span class="field-hint-text">${escapeHtml(formatWaktuRiwayatLokal(item.createdAt))}</span>
        </div>
        <h4 class="kegiatan-card-title">${escapeHtml(item.nama || "Laporan Google Sheets")}</h4>
        <div class="kegiatan-meta-list">
          <span class="kegiatan-meta-item">Periode: <strong>${escapeHtml(rentangStr)}</strong></span>
        </div>
        <div class="catatan-card-footer">
          <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm-touch">
            ${IKON_TAB_BARU}<span>Buka di Google Sheets</span>
          </a>
          <div class="catatan-footer-actions">
            <button type="button" class="btn-danger-outline btn-sm-touch" data-laporan-action="hapus-riwayat" data-id="${escapeHtml(item.id)}">
              ${IKON_HAPUS}<span>Hapus dari Riwayat</span>
            </button>
          </div>
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function bukaModalHapusRiwayat(idRiwayat) {
  const item = daftarRiwayatLaporan.find((r) => r.id === idRiwayat);
  const modal = document.getElementById("laporan-delete-modal");
  const desc = document.getElementById("laporan-delete-desc");
  const alertBox = document.getElementById("laporan-delete-alert");
  const btnBatal = document.getElementById("laporan-delete-cancel-btn");
  if (!item || !modal) return;

  itemRiwayatAkanDihapus = item;
  hapusRiwayatModalTerbuka = true;
  fokusSebelumModalLaporan = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (alertBox) alertBox.hidden = true;
  if (desc) {
    desc.textContent = `Catatan "${item.nama || "Laporan"}" akan dihapus dari daftar Riwayat Laporan di aplikasi ini. Berkas spreadsheet asli di Google Drive Anda TIDAK ikut dihapus.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

function tutupModalHapusRiwayat(kembalikanFokus = true) {
  const modal = document.getElementById("laporan-delete-modal");
  if (!modal || !hapusRiwayatModalTerbuka) return;

  hapusRiwayatModalTerbuka = false;
  itemRiwayatAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalLaporan && document.contains(fokusSebelumModalLaporan)) {
    fokusSebelumModalLaporan.focus();
  }
  fokusSebelumModalLaporan = null;
}

async function konfirmasiHapusRiwayatLaporan() {
  if (!itemRiwayatAkanDihapus) return;
  const btnKonfirmasi = document.getElementById("laporan-delete-confirm-btn");
  const alertBox = document.getElementById("laporan-delete-alert");
  const alertText = document.getElementById("laporan-delete-alert-text");

  if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = true;
  if (alertBox) alertBox.hidden = true;

  try {
    const db = getFirestoreDb();
    await deleteDoc(doc(db, KOLEKSI.LAPORAN, itemRiwayatAkanDihapus.id));
    tutupModalHapusRiwayat(true);
  } catch (err) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatFirestore(err);
      alertBox.hidden = false;
    }
  } finally {
    if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = false;
  }
}

function pastikanKerangkaHalamanLaporan() {
  const panel = document.getElementById("section-laporan");
  if (!panel || panel.querySelector("#laporan-filter-card")) return;

  pastikanRentangDefault();

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Laporan Google Sheets &amp; CSV</h2>
        <p class="section-heading-subtitle">Susun laporan kegiatan, rekap status, arsip dokumen, atau catatan ke folder <strong>Agenda-Arsip</strong> di Google Drive.</p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-laporan-unduh-csv" class="btn-secondary">
          ${IKON_UNDUH}<span>Unduh CSV</span>
        </button>
        <button type="button" id="btn-laporan-buat-sheets" class="btn-primary">
          ${IKON_TABEL}<span>Buat Laporan</span>
        </button>
      </div>
    </div>

    <div id="laporan-offline-note" class="alert-box alert-box-warning" role="status" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span>Tidak ada koneksi internet. Tombol <strong>Buat Laporan</strong> (Google Sheets) dinonaktifkan sementara, namun tombol <strong>Unduh CSV</strong> tetap dapat digunakan dari data tersimpan.</span>
    </div>

    <div id="laporan-page-feedback" class="alert-box catatan-feedback-banner" role="alert" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <div class="catatan-feedback-content">
        <span id="laporan-page-feedback-text"></span>
        <div id="laporan-page-feedback-actions" class="catatan-feedback-actions"></div>
      </div>
    </div>

    <div id="laporan-progress-box" class="upload-progress-card" aria-live="polite" hidden>
      <div class="upload-progress-top">
        <span id="laporan-progress-label" class="upload-progress-label">Menyiapkan pembuatan spreadsheet...</span>
      </div>
    </div>

    <section id="laporan-filter-card" class="filter-card" aria-label="Pengaturan jenis dan filter laporan">
      <div class="laporan-filter-grid">
        <div class="filter-control-item">
          <label for="laporan-jenis-select" class="filter-label">Jenis Laporan</label>
          <select id="laporan-jenis-select" class="form-select">
            ${DAFTAR_JENIS_LAPORAN.map(
              (j) => `<option value="${escapeHtml(j.id)}"${j.id === jenisAktif ? " selected" : ""}>${escapeHtml(j.label)}</option>`
            ).join("")}
          </select>
        </div>

        <div class="filter-control-item">
          <label for="laporan-filter-kategori" class="filter-label">Filter Kategori</label>
          <select id="laporan-filter-kategori" class="form-select"></select>
        </div>

        <div class="filter-control-item">
          <label for="laporan-tanggal-dari" class="filter-label">Dari Tanggal</label>
          <input type="date" id="laporan-tanggal-dari" class="form-input" value="${escapeHtml(tanggalDari)}" />
        </div>

        <div class="filter-control-item">
          <label for="laporan-tanggal-sampai" class="filter-label">Sampai Tanggal</label>
          <input type="date" id="laporan-tanggal-sampai" class="form-input" value="${escapeHtml(tanggalSampai)}" />
        </div>
      </div>

      <div id="laporan-validation-alert" class="alert-box" role="alert" hidden>
        ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
        <span id="laporan-validation-text"></span>
      </div>

      <div class="active-filter-bar">
        <span class="result-summary-text">Rentang bawaan diatur dari awal bulan ini hingga hari ini sesuai zona waktu perangkat.</span>
        <button type="button" id="btn-laporan-reset-filter" class="btn-link-filter">Atur ulang ke bulan ini</button>
      </div>
    </section>

    <section class="dash-card" aria-labelledby="laporan-preview-heading">
      <div class="dash-card-header">
        <div class="dash-card-heading-group">
          <h3 id="laporan-preview-heading" class="dash-card-title">Pratinjau Ringkas Laporan</h3>
          <span id="laporan-preview-caption" class="dash-card-caption"></span>
        </div>
        <div class="laporan-metric-box">
          <span id="laporan-preview-count" class="dash-metric-number">0</span>
          <span class="dash-card-caption">baris</span>
        </div>
      </div>
      <div id="laporan-preview-body" class="dash-card-body" aria-live="polite"></div>
    </section>

    <section class="page-stack" aria-labelledby="laporan-riwayat-heading">
      <div class="laporan-riwayat-header">
        <div class="section-heading-group">
          <h3 id="laporan-riwayat-heading" class="section-heading-title">Riwayat Laporan</h3>
          <p class="section-heading-subtitle">Daftar laporan Google Sheets yang pernah dibuat (menghapus riwayat tidak menghapus berkas di Google Drive).</p>
        </div>
        <span id="laporan-riwayat-count" class="cat-badge cat-color-abu">0</span>
      </div>
      <div id="laporan-riwayat-region" aria-live="polite"></div>
    </section>
  </div>`;

  sinkronkanDropdownKategoriLaporan();
}

export function initHalamanLaporan() {
  pastikanKerangkaHalamanLaporan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  const panel = document.getElementById("section-laporan");
  if (panel) {
    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.id === "laporan-jenis-select" && target instanceof HTMLSelectElement) {
        jenisAktif = target.value;
        filterKategori = "ALL";
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
      } else if (target.id === "laporan-filter-kategori" && target instanceof HTMLSelectElement) {
        filterKategori = target.value || "ALL";
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-dari" && target instanceof HTMLInputElement) {
        tanggalDari = target.value;
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-sampai" && target instanceof HTMLInputElement) {
        tanggalSampai = target.value;
        renderPratinjauLaporan();
      }
    });

    panel.addEventListener("click", async (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      if (targetEl.closest("#btn-laporan-buat-sheets")) {
        await buatLaporanKeGoogleSheets();
        return;
      }
      if (targetEl.closest("#btn-laporan-unduh-csv")) {
        unduhLaporanSebagaiCsv();
        return;
      }
      if (targetEl.closest("#btn-laporan-reset-filter")) {
        tanggalDari = hitungAwalBulanIni();
        tanggalSampai = hariIni();
        filterKategori = "ALL";
        const inpDari = document.getElementById("laporan-tanggal-dari");
        const inpSampai = document.getElementById("laporan-tanggal-sampai");
        if (inpDari instanceof HTMLInputElement) inpDari.value = tanggalDari;
        if (inpSampai instanceof HTMLInputElement) inpSampai.value = tanggalSampai;
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
        return;
      }

      const btnAction = targetEl.closest("[data-laporan-action]");
      if (!btnAction) return;
      const aksi = btnAction.getAttribute("data-laporan-action");

      if (aksi === "dismiss-feedback") {
        tampilkanNotifikasiLaporan({ pesan: "" });
      } else if (aksi === "relogin") {
        if (btnAction instanceof HTMLButtonElement) {
          btnAction.disabled = true;
          btnAction.textContent = "Memuat...";
        }
        try {
          await loginWithGoogle();
          tampilkanNotifikasiLaporan({
            pesan: "Sesi akses Google berhasil diperbarui. Silakan klik \"Buat Laporan\" kembali.",
            tipe: "success"
          });
        } catch (err) {
          tampilkanNotifikasiLaporan({
            pesan: formatPesanGalatAuth(err),
            tipe: "danger",
            butuhRelogin: true
          });
        }
      } else if (aksi === "hapus-riwayat") {
        const id = btnAction.getAttribute("data-id") || "";
        if (id) bukaModalHapusRiwayat(id);
      }
    });
  }

  const modalHapus = document.getElementById("laporan-delete-modal");
  const btnBatalHapus = document.getElementById("laporan-delete-cancel-btn");
  const btnKonfirmasiHapus = document.getElementById("laporan-delete-confirm-btn");

  if (btnBatalHapus) btnBatalHapus.addEventListener("click", () => tutupModalHapusRiwayat(true));
  if (btnKonfirmasiHapus) btnKonfirmasiHapus.addEventListener("click", () => konfirmasiHapusRiwayatLaporan());
  if (modalHapus) {
    modalHapus.addEventListener("click", (e) => {
      if (e.target === modalHapus) tutupModalHapusRiwayat(true);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!hapusRiwayatModalTerbuka) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupModalHapusRiwayat(true);
    }
  });

  onPerubahanKegiatan(() => {
    if (jenisAktif === "kegiatan" || jenisAktif === "rekap-status" || jenisAktif === "dokumen" || jenisAktif === "catatan") {
      renderPratinjauLaporan();
    }
  });
  onPerubahanDokumen(() => {
    if (jenisAktif === "dokumen") renderPratinjauLaporan();
  });
  onPerubahanCatatan(() => {
    if (jenisAktif === "catatan") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  renderPratinjauLaporan();
  renderRiwayatLaporan();
}

export function subscribeLaporan() {
  unsubscribeLaporan();
  pastikanKerangkaHalamanLaporan();

  unsubKategoriKeg = manajerKategoriKegiatan.onChange(() => {
    if (jenisAktif === "kegiatan" || jenisAktif === "rekap-status") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  unsubKategoriDok = manajerKategoriDokumen.onChange(() => {
    if (jenisAktif === "dokumen") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  const db = getFirestoreDb();
  unsubscribeSnapshotLaporan = onSnapshot(
    collection(db, KOLEKSI.LAPORAN),
    (snapshot) => {
      daftarRiwayatLaporan = snapshot.docs.map((dok) => {
        const d = dok.data() || {};
        return {
          id: dok.id,
          nama: String(d.nama || ""),
          jenis: String(d.jenis || "kegiatan"),
          jenisLabel: String(d.jenisLabel || ""),
          tautan: String(d.tautan || ""),
          sheetId: String(d.sheetId || ""),
          rentangTanggal: String(d.rentangTanggal || ""),
          tanggalDari: String(d.tanggalDari || ""),
          tanggalSampai: String(d.tanggalSampai || ""),
          jumlahBaris: Number.isFinite(Number(d.jumlahBaris)) ? Number(d.jumlahBaris) : 0,
          createdAt: String(d.createdAt || "")
        };
      });
      riwayatSudahDimuat = true;
      renderRiwayatLaporan();
    },
    (err) => {
      riwayatSudahDimuat = true;
      tampilkanNotifikasiLaporan({
        pesan: formatPesanGalatFirestore(err),
        tipe: "danger"
      });
      renderRiwayatLaporan();
    }
  );

  renderPratinjauLaporan();
  return () => unsubscribeLaporan();
}

export function unsubscribeLaporan() {
  if (typeof unsubscribeSnapshotLaporan === "function") {
    try { unsubscribeSnapshotLaporan(); } catch (_e) {}
    unsubscribeSnapshotLaporan = null;
  }
  if (typeof unsubKategoriKeg === "function") {
    try { unsubKategoriKeg(); } catch (_e) {}
    unsubKategoriKeg = null;
  }
  if (typeof unsubKategoriDok === "function") {
    try { unsubKategoriDok(); } catch (_e) {}
    unsubKategoriDok = null;
  }
  daftarRiwayatLaporan = [];
  riwayatSudahDimuat = false;
  tutupModalHapusRiwayat(false);
}
