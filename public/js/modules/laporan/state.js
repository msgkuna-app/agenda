/**
 * State Modul Laporan (Tahap 3: dipisah dari laporan.js)
 * Data riwayat laporan, state filter (jenis/tanggal/kategori), cache sumber data
 * sekali pakai, penyusun paket laporan (susunDataLaporanSaatIni), dan langganan
 * Firestore riwayat. TIDAK menyentuh DOM: hasil dipakai view, dan pemicu
 * render ulang setelah data sumber termuat disuntikkan controller lewat
 * setelOpsiPeristiwaLaporan (pola yang sama dengan modul catatan).
 */
import { KOLEKSI } from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot
} from "../../services/firestoreService.js";
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { urutkanDaftarKategori } from "../kategori/index.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  ambilKegiatanRentangTanggal,
  ambilSemuaKegiatanSekaliPakai
} from "../kegiatan/index.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  formatUkuranBerkas,
  infoJenisBerkasMime,
  ambilSemuaDokumenSekaliPakai
} from "../dokumen/index.js";
import {
  JENIS_CATATAN_GDOC,
  getDaftarCatatan,
  tautanAmanGoogleDocs,
  ambilSemuaCatatanSekaliPakai
} from "../catatan/index.js";
import {
  hitungAwalBulanIni,
  formatTanggalSetempat,
  ekstrakTanggalYmdDariIso
} from "./format.js";

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

let unsubscribeSnapshotLaporan = null;
let daftarRiwayatLaporan = [];
let riwayatSudahDimuat = false;

let jenisAktif = "kegiatan";
let tanggalDari = "";
let tanggalSampai = "";
let filterKategori = "ALL";

/** Opsi peristiwa yang disuntikkan controller (pemicu render ulang). */
let opsiPeristiwa = {
  onSumberSiap: null
};

// Cache lokal sekali pakai untuk data laporan yang dimuat berdasarkan permintaan
let cacheKegiatanLaporan = null;
let rentangTerakhirKegiatan = "";
let cacheDokumenLaporan = null;
let cacheCatatanLaporan = null;
let sedangMemuatDataSekaliPakai = false;

export function setelOpsiPeristiwaLaporan(opsi = {}) {
  opsiPeristiwa = {
    onSumberSiap: typeof opsi.onSumberSiap === "function" ? opsi.onSumberSiap : null
  };
}

function beritahuSumberSiap() {
  if (opsiPeristiwa.onSumberSiap) {
    opsiPeristiwa.onSumberSiap();
  }
}

/**
 * Fase 6 Bagian C1: Mengekspor akses metadata riwayat laporan dari memori/langganan tunggal.
 */
export function getDaftarLaporan() {
  return daftarRiwayatLaporan.map((item) => ({ ...item }));
}

export function isLaporanSudahDimuat() {
  return riwayatSudahDimuat;
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

/* ---------- Sumber data ---------- */

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

export function susunDataLaporanSaatIni() {
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
          beritahuSumberSiap();
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
        beritahuSumberSiap();
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
      beritahuSumberSiap();
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

/* ---------- Riwayat laporan ---------- */

export async function simpanRiwayatLaporan({
  nama,
  jenis,
  jenisLabel,
  tautan,
  sheetId,
  rentangTanggal,
  tanggalDari: dari,
  tanggalSampai: sampai,
  jumlahBaris
}) {
  const db = getFirestoreDb();
  await addDoc(collection(db, KOLEKSI.LAPORAN), {
    nama,
    jenis,
    jenisLabel,
    tautan,
    sheetId,
    rentangTanggal,
    tanggalDari: dari,
    tanggalSampai: sampai,
    jumlahBaris,
    createdAt: new Date().toISOString()
  });
}

export async function hapusRiwayatLaporan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID riwayat laporan tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.LAPORAN, targetId));
}

/**
 * Berlangganan koleksi riwayat laporan (seluruh dokumen, urutan bebas —
 * pengurutan dilakukan saat render).
 * @param {{ onData?: () => void, onGalat?: (err: unknown) => void }} opsi
 */
export function langgananRiwayatLaporan(opsi = {}) {
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
      if (typeof opsi.onData === "function") opsi.onData();
    },
    (err) => {
      riwayatSudahDimuat = true;
      if (typeof opsi.onGalat === "function") opsi.onGalat(err);
      if (typeof opsi.onData === "function") opsi.onData();
    }
  );
}

export function lepasLanggananRiwayatLaporan() {
  if (typeof unsubscribeSnapshotLaporan === "function") {
    try { unsubscribeSnapshotLaporan(); } catch (_e) {}
    unsubscribeSnapshotLaporan = null;
  }
  daftarRiwayatLaporan = [];
  riwayatSudahDimuat = false;
  // Catatan: cache data sumber TIDAK direset di sini agar paritas perilaku
  // dengan laporan.js asli terjaga (unsubscribeLaporan lama hanya mereset riwayat).
}
