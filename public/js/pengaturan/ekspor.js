/**
 * Ekspor Cadangan Data JSON (6 Koleksi Firestore dengan Nama Kategori)
 */
import { urutkanDaftarKategori } from "../kategori.js";
import {
  manajerKategoriKegiatan,
  ambilSemuaKegiatanSekaliPakai
} from "../kegiatan.js";
import {
  manajerKategoriDokumen,
  ambilSemuaDokumenSekaliPakai
} from "../dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  JENIS_CATATAN_SINGKAT,
  ambilSemuaCatatanSekaliPakai
} from "../catatan.js";
import { getDaftarLaporan } from "../laporan.js";
import { hariIni } from "../util-tanggal.js";
import { tampilkanToast } from "../sidebar.js";
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  getStatusUiPengaturan,
  setStatusUiPengaturan
} from "./state.js";
import { setUmpanBalikPengaturan, bacaVersiDariSwJs } from "./util.js";
import { simpanMetadataEksporCadangan } from "./data.js";
import { segarkanTampilanPengaturan } from "./render.js";

function susunDataKategoriKegiatan() {
  return urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori()).map((k) => ({
    id: k.id,
    nama: k.nama,
    warna: k.warna,
    urutan: k.urutan,
    createdAt: k.createdAt || "",
    updatedAt: k.updatedAt || ""
  }));
}

function susunDataKegiatan(daftarMentah) {
  return daftarMentah.map((item) => {
    const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
    return {
      id: item.id,
      judul: item.judul,
      catatan: item.catatan,
      tanggal: item.tanggal,
      waktuMulai: item.waktuMulai,
      waktuSelesai: item.waktuSelesai,
      lokasi: item.lokasi,
      kategoriId: item.kategoriId || "",
      namaKategori: infoKat.nama,
      status: item.status,
      createdAt: item.createdAt || "",
      updatedAt: item.updatedAt || ""
    };
  });
}

function susunDataKategoriDokumen() {
  return urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori()).map((k) => ({
    id: k.id,
    nama: k.nama,
    warna: k.warna,
    urutan: k.urutan,
    folderId: k.folderId || "",
    folderSinkron: Boolean(k.folderSinkron),
    createdAt: k.createdAt || "",
    updatedAt: k.updatedAt || ""
  }));
}

function susunDataDokumen(daftarMentah) {
  return daftarMentah.map((d) => {
    const infoKat = manajerKategoriDokumen.cariInfoKategori(d.kategoriId);
    return {
      id: d.id,
      namaTampilan: d.namaTampilan,
      namaFile: d.namaFile,
      driveFileId: d.driveFileId,
      tautan: d.tautan,
      mimeType: d.mimeType,
      ukuran: d.ukuran,
      kategoriId: d.kategoriId || "",
      namaKategori: infoKat.nama,
      kegiatanId: d.kegiatanId || "",
      catatan: d.catatan || "",
      tanggalUnggah: d.tanggalUnggah || "",
      createdAt: d.createdAt || "",
      updatedAt: d.updatedAt || ""
    };
  });
}

function susunDataCatatan(daftarMentah) {
  return daftarMentah.map((c) => {
    const entri = {
      id: c.id,
      jenis: c.jenis,
      judul: c.judul,
      isi: c.jenis === JENIS_CATATAN_SINGKAT ? c.isi : "",
      kategori: c.kategori || "",
      tag: Array.isArray(c.tag) ? c.tag : [],
      kegiatanId: c.kegiatanId || "",
      disematkan: Boolean(c.disematkan),
      tanggal: c.tanggal || "",
      createdAt: c.createdAt || "",
      updatedAt: c.updatedAt || ""
    };
    if (c.jenis === JENIS_CATATAN_GDOC) {
      entri.templat = c.templat || "kosong";
      entri.docId = c.docId || "";
      entri.tautan = c.tautan || "";
    }
    return entri;
  });
}

function susunDataLaporan() {
  return getDaftarLaporan().map((l) => ({
    id: l.id,
    nama: l.nama,
    jenis: l.jenis,
    jenisLabel: l.jenisLabel || "",
    tautan: l.tautan || "",
    sheetId: l.sheetId || "",
    rentangTanggal: l.rentangTanggal || "",
    tanggalDari: l.tanggalDari || "",
    tanggalSampai: l.tanggalSampai || "",
    jumlahBaris: Number.isFinite(Number(l.jumlahBaris)) ? Number(l.jumlahBaris) : 0,
    createdAt: l.createdAt || ""
  }));
}

export async function eksporSeluruhDataJson() {
  const ui = getStatusUiPengaturan();
  if (ui.sedangMengekspor) return;

  const btn = document.getElementById("btn-settings-export-json");
  setStatusUiPengaturan({ sedangMengekspor: true });
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  setUmpanBalikPengaturan("");

  try {
    const kategoriKegiatan = susunDataKategoriKegiatan();

    const [semuaKegiatan, semuaDokumen, semuaCatatan] = await Promise.all([
      ambilSemuaKegiatanSekaliPakai(),
      ambilSemuaDokumenSekaliPakai(),
      ambilSemuaCatatanSekaliPakai()
    ]);

    const kegiatan = susunDataKegiatan(semuaKegiatan);
    const kategoriDokumen = susunDataKategoriDokumen();
    const dokumen = susunDataDokumen(semuaDokumen);
    const catatan = susunDataCatatan(semuaCatatan);
    const laporan = susunDataLaporan();

    const tglBerkas = hariIni();
    const versi = await bacaVersiDariSwJs();
    const payload = {
      aplikasi: "Agenda & Arsip",
      versiFormat: 1,
      versiAplikasi: versi,
      tanggalEkspor: tglBerkas,
      dieksporPada: new Date().toISOString(),
      peringatan:
        "Berkas asli di Google Drive (dokumen terunggah, Google Docs, dan Google Sheets) tidak ikut diekspor dalam berkas ini; hanya metadata yang disimpan.",
      koleksi: {
        kegiatan,
        kategoriKegiatan,
        dokumen,
        kategoriDokumen,
        catatan,
        laporan
      }
    };

    const namaBerkas = `cadangan-agenda-arsip-${tglBerkas}.json`;
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const urlObj = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = urlObj;
    a.download = namaBerkas;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(urlObj), 1500);

    // Pencatatan waktu ekspor berhasil
    const sekarangIso = new Date().toISOString();
    try {
      localStorage.setItem(KUNCI_STORAGE_CADANGAN_TERAKHIR, sekarangIso);
      localStorage.removeItem(KUNCI_STORAGE_CADANGAN_TUNDA);
    } catch (_e) {}

    await simpanMetadataEksporCadangan(sekarangIso);
    segarkanTampilanPengaturan();

    tampilkanToast(`Cadangan "${namaBerkas}" berhasil diunduh.`, "success");
  } catch (err) {
    setUmpanBalikPengaturan(
      err instanceof Error ? err.message : "Gagal mengekspor data cadangan JSON.",
      "danger"
    );
  } finally {
    setStatusUiPengaturan({ sedangMengekspor: false });
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}