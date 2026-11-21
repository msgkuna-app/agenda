/**
 * Pengendali (Controller) Modul Pengaturan (Tahap 3b: dipisah dari pengaturan.js)
 * Menangani aksi pengguna: masuk ulang Drive, sinkron folder, cek pembaruan,
 * ekspor JSON, migrasi dihapusAt, impor JSON, serta form hari libur.
 *
 * Aturan: logika tampilan di view.js, data di state.js.
 */
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KOLEKSI,
  DOK_PENGATURAN,
  BATAS_OPERASI_BATCH,
} from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  getDocs,
  writeBatch,
  formatPesanGalatFirestore,
} from "../../services/firestoreService.js";
import {
  loginWithGoogle,
  isDriveTokenExpired,
  formatPesanGalatAuth,
} from "../../services/authService.js";
import { formatPesanGalatDrive } from "../../services/driveService.js";
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { tampilkanToast } from "../../shared/toast.js";
import { periksaPembaruan } from "../../pwa.js";
import { normalisasiWarnaKategori, urutkanDaftarKategori } from "../../kategori.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  onPerubahanKegiatan,
  ambilSemuaKegiatanSekaliPakai,
} from "../../modules/kegiatan/index.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  onPerubahanDokumen,
  sinkronkanSatuFolderKategoriDokumen,
  ambilSemuaDokumenSekaliPakai,
} from "../../modules/dokumen/index.js";
import {
  JENIS_CATATAN_GDOC,
  JENIS_CATATAN_SINGKAT,
  getDaftarCatatan,
  onPerubahanCatatan,
  ambilSemuaCatatanSekaliPakai,
} from "../../modules/catatan/index.js";
import { getDaftarLaporan } from "../../modules/laporan/index.js";
import { ambilKonfigurasiAktif } from "../../hari-libur.js";
import { escapeHtml } from "../../util-html.js";
import {
  statusCadangan,
  beritahuPerubahanCadangan,
  onPerubahanCadangan,
  onPerubahanHariLibur,
  simpanPengaturanHariLibur,
  ambilKonfigurasiHariLiburUntukCadangan,
  KOLEKSI_CADANGAN,
} from "./state.js";
import {
  setUmpanBalikPengaturan,
  setStatusCekPembaruan,
  segarkanTampilanPengaturan,
  pastikanKerangkaHalamanPengaturan,
  perbaruiInfoVersiSwDiDom,
  bacaVersiDariSwJs,
  renderDaftarHariLiburPengaturan,
  setTahunLiburAktif,
  tahunLiburAktif,
  setTombolEkspor,
  setStatusMigrasi,
  setProgresSinkronFolder,
  setProgresImpor,
  tampilkanPratinjauImpor,
  tampilkanRingkasanImpor,
  sembunyikanRingkasanImpor,
} from "./view.js";

// ============================================================================
// Status internal controller
// ============================================================================

let antarmukaSudahDiikat = false;
let sedangSinkronFolder = false;
let sedangMengekspor = false;
let sedangMengimpor = false;
let dataSiapImpor = null;
let namaBerkasImpor = "";

// ============================================================================
// Aksi: masuk ulang Drive
// ============================================================================

async function tanganiMasukUlangDrivePengaturan() {
  if (!navigator.onLine) {
    const pesanOffline = "Perangkat sedang luring. Sambungkan ke internet terlebih dahulu untuk memperbarui izin Google Drive.";
    setUmpanBalikPengaturan(pesanOffline, "warning");
    tampilkanToast(pesanOffline, "warning");
    return;
  }

  const btn = document.getElementById("btn-settings-relogin-drive");
  if (!(btn instanceof HTMLButtonElement)) return;

  btn.disabled = true;
  btn.setAttribute("data-busy", "true");
  const span = btn.querySelector("span");
  const teksAsli = span ? span.textContent : "Masuk ulang untuk memperbarui izin Drive";
  if (span) span.textContent = "Menghubungkan ke Google...";
  setUmpanBalikPengaturan("");

  try {
    await loginWithGoogle();
    const banner = document.getElementById("token-expired-banner");
    if (banner) banner.hidden = !isDriveTokenExpired();
    segarkanTampilanPengaturan();
    tampilkanToast("Izin akses Google Drive berhasil diperbarui.", "success");
  } catch (err) {
    const pesan = formatPesanGalatAuth(err);
    setUmpanBalikPengaturan(`Gagal memperbarui izin Google Drive: ${pesan}`, "danger");
  } finally {
    btn.removeAttribute("data-busy");
    if (span) span.textContent = teksAsli;
    segarkanTampilanPengaturan();
  }
}

// ============================================================================
// Aksi: sinkronkan semua folder kategori dokumen
// ============================================================================

async function tanganiSinkronkanSemuaFolder() {
  if (sedangSinkronFolder) return;
  if (!navigator.onLine) {
    tampilkanToast("Tidak ada koneksi internet. Sinkronisasi folder memerlukan sambungan aktif.", "warning");
    return;
  }

  const daftarBelum = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori()).filter(
    (k) => !k.folderId || !k.folderSinkron
  );
  if (daftarBelum.length === 0) {
    tampilkanToast("Semua folder kategori dokumen sudah sinkron.", "info");
    return;
  }

  const btnSync = document.getElementById("btn-settings-sync-all-folders");

  sedangSinkronFolder = true;
  setUmpanBalikPengaturan("");
  if (btnSync instanceof HTMLButtonElement) btnSync.disabled = true;
  setProgresSinkronFolder(true);

  let sukses = 0;
  let gagal = 0;
  let galatTerakhir = "";

  try {
    for (let i = 0; i < daftarBelum.length; i += 1) {
      const kat = daftarBelum[i];
      const ke = i + 1;
      const pct = Math.round((ke / daftarBelum.length) * 100);
      setProgresSinkronFolder(true, {
        label: `Menyinkronkan "${kat.nama}" (${ke}/${daftarBelum.length})...`,
        pct,
      });

      try {
        await sinkronkanSatuFolderKategoriDokumen(kat.id);
        sukses += 1;
      } catch (err) {
        gagal += 1;
        galatTerakhir = formatPesanGalatDrive(err);
      }
    }

    if (gagal === 0) {
      const msg = `Berhasil menyinkronkan seluruh ${sukses} folder kategori dokumen di Google Drive.`;
      setUmpanBalikPengaturan(msg, "success");
      tampilkanToast(msg, "success");
    } else {
      const msg = `${sukses} folder berhasil disinkronkan, ${gagal} gagal (${galatTerakhir}).`;
      setUmpanBalikPengaturan(msg, "warning");
      tampilkanToast(msg, "warning");
    }
  } finally {
    sedangSinkronFolder = false;
    setProgresSinkronFolder(false);
    segarkanTampilanPengaturan();
  }
}

// ============================================================================
// Aksi: periksa pembaruan Service Worker
// ============================================================================

async function tanganiPeriksaPembaruanSw() {
  setUmpanBalikPengaturan("");

  if (!navigator.onLine) {
    setStatusCekPembaruan("Tidak dapat memeriksa saat offline");
    tampilkanToast("Tidak dapat memeriksa saat offline", "warning");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    setStatusCekPembaruan("Peramban ini tidak mendukung Service Worker.");
    return;
  }

  const btn = document.getElementById("btn-settings-check-update");
  const spanBtn = btn ? btn.querySelector("span") : null;
  const labelAwal = spanBtn ? spanBtn.textContent : "Periksa pembaruan";

  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true;
    btn.setAttribute("data-busy", "true");
  }
  if (spanBtn) spanBtn.textContent = "Memeriksa...";
  setStatusCekPembaruan("Memeriksa...");

  try {
    const reg = await periksaPembaruan();
    if (reg && reg.waiting && navigator.serviceWorker.controller) {
      setStatusCekPembaruan("Versi baru Agenda & Arsip tersedia.");
      return;
    }

    setStatusCekPembaruan("Aplikasi sudah versi terbaru");
    tampilkanToast("Aplikasi sudah versi terbaru", "success");
  } catch (_err) {
    if (!navigator.onLine) {
      setStatusCekPembaruan("Tidak dapat memeriksa saat offline");
      tampilkanToast("Tidak dapat memeriksa saat offline", "warning");
    } else {
      setStatusCekPembaruan("Gagal memeriksa pembaruan. Coba lagi beberapa saat.");
    }
  } finally {
    if (spanBtn) spanBtn.textContent = labelAwal;
    if (btn instanceof HTMLButtonElement) {
      btn.removeAttribute("data-busy");
      btn.disabled = false;
    }
    segarkanTampilanPengaturan();
  }
}

// ============================================================================
// C1. Ekspor JSON seluruh data (dengan namaKategori di samping kategoriId)
// ============================================================================

export async function eksporSeluruhDataJson() {
  if (sedangMengekspor) return;
  sedangMengekspor = true;
  setTombolEkspor(false);
  setUmpanBalikPengaturan("");

  try {
    const kategoriKegiatan = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori()).map((k) => ({
      id: k.id,
      nama: k.nama,
      warna: k.warna,
      urutan: k.urutan,
      createdAt: k.createdAt || "",
      updatedAt: k.updatedAt || ""
    }));

    const [semuaKegiatan, semuaDokumen, semuaCatatan] = await Promise.all([
      ambilSemuaKegiatanSekaliPakai(),
      ambilSemuaDokumenSekaliPakai(),
      ambilSemuaCatatanSekaliPakai()
    ]);

    const kegiatan = semuaKegiatan.map((item) => {
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

    const kategoriDokumen = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori()).map((k) => ({
      id: k.id,
      nama: k.nama,
      warna: k.warna,
      urutan: k.urutan,
      folderId: k.folderId || "",
      folderSinkron: Boolean(k.folderSinkron),
      createdAt: k.createdAt || "",
      updatedAt: k.updatedAt || ""
    }));

    const dokumen = semuaDokumen.map((d) => {
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

    const catatan = semuaCatatan.map((c) => {
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

    const laporan = getDaftarLaporan().map((l) => ({
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
      hariLibur: ambilKonfigurasiHariLiburUntukCadangan(),
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

    statusCadangan.terakhirEksporAt = sekarangIso;

    try {
      const db = getFirestoreDb();
      await setDoc(doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.CADANGAN), {
        terakhirEksporAt: sekarangIso,
        updatedAt: sekarangIso
      }, { merge: true });
    } catch (_err) {
      // Offline: salinan lokal sudah tersimpan di localStorage
    }

    beritahuPerubahanCadangan();
    segarkanTampilanPengaturan();

    tampilkanToast(`Cadangan "${namaBerkas}" berhasil diunduh.`, "success");
  } catch (err) {
    setUmpanBalikPengaturan(
      err instanceof Error ? err.message : "Gagal mengekspor data cadangan JSON.",
      "danger"
    );
  } finally {
    sedangMengekspor = false;
    setTombolEkspor(true);
  }
}

// ============================================================================
// C4. Migrasi soft delete (menambahkan dihapusAt: null pada dokumen legacy)
// ============================================================================

export async function jalankanMigrasiDihapusAt() {
  const btn = document.getElementById("btn-settings-migrate-dihapusat");
  if (btn instanceof HTMLButtonElement) btn.disabled = true;

  setStatusMigrasi(`<span style="color:var(--color-primary);">Memeriksa dokumen tanpa field dihapusAt...</span>`);

  try {
    const db = getFirestoreDb();
    const [snapKegiatan, snapCatatan] = await Promise.all([
      getDocs(collection(db, KOLEKSI.KEGIATAN)),
      getDocs(collection(db, KOLEKSI.CATATAN))
    ]);

    const butuhMigrasiKegiatan = [];
    snapKegiatan.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.dihapusAt === "undefined") {
        butuhMigrasiKegiatan.push(docSnap.ref);
      }
    });

    const butuhMigrasiCatatan = [];
    snapCatatan.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.dihapusAt === "undefined") {
        butuhMigrasiCatatan.push(docSnap.ref);
      }
    });

    const totalPerlu = butuhMigrasiKegiatan.length + butuhMigrasiCatatan.length;
    if (totalPerlu === 0) {
      setStatusMigrasi(`<span style="color:var(--color-success); font-weight:600;">✓ Seluruh dokumen sudah memiliki field dihapusAt (0 dokumen perlu migrasi).</span>`);
      tampilkanToast("Semua dokumen sudah termigrasi", "success");
      return;
    }

    setStatusMigrasi(`<span>Ditemukan ${totalPerlu} dokumen (${butuhMigrasiKegiatan.length} kegiatan, ${butuhMigrasiCatatan.length} catatan) tanpa dihapusAt. Memperbarui...</span>`);

    const semuaRef = [...butuhMigrasiKegiatan, ...butuhMigrasiCatatan];
    for (let i = 0; i < semuaRef.length; i += BATAS_OPERASI_BATCH) {
      const chunk = semuaRef.slice(i, i + BATAS_OPERASI_BATCH);
      const batch = writeBatch(db);
      chunk.forEach((ref) => {
        batch.update(ref, { dihapusAt: null });
      });
      await batch.commit();
    }

    setStatusMigrasi(`<span style="color:var(--color-success); font-weight:600;">✓ Berhasil memigrasi ${totalPerlu} dokumen dengan dihapusAt: null.</span>`);
    tampilkanToast(`Migrasi berhasil: ${totalPerlu} dokumen diperbarui`, "success");
  } catch (err) {
    console.error("Gagal menjalankan migrasi dihapusAt:", err);
    setStatusMigrasi(`<span style="color:var(--color-danger);">Gagal migrasi: ${escapeHtml(formatPesanGalatFirestore(err))}</span>`);
    tampilkanToast(`Gagal migrasi: ${formatPesanGalatFirestore(err)}`, "danger");
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

// ============================================================================
// C2. Impor JSON (pratinjau, pilihan lewati/timpa, writeBatch maks 500 operasi)
// ============================================================================

function buatIdDokumenCadangan(indeks) {
  return `impor-${Date.now().toString(36)}-${indeks}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitasiItemKoleksi(namaKoleksi, mentah, indeks) {
  if (!mentah || typeof mentah !== "object") return null;
  const sekarang = new Date().toISOString();
  const idBersih = String(mentah.id || "").trim().replace(/\//g, "_") || buatIdDokumenCadangan(indeks);

  if (namaKoleksi === "kategoriKegiatan") {
    const nama = String(mentah.nama || "").trim().slice(0, 40);
    if (!nama) return null;
    return {
      id: idBersih,
      data: {
        nama,
        warna: normalisasiWarnaKategori(mentah.warna),
        urutan: Number.isFinite(Number(mentah.urutan)) ? Number(mentah.urutan) : indeks + 1,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "kategoriDokumen") {
    const nama = String(mentah.nama || "").trim().slice(0, 40);
    if (!nama) return null;
    const folderId = String(mentah.folderId || "").trim();
    return {
      id: idBersih,
      data: {
        nama,
        warna: normalisasiWarnaKategori(mentah.warna),
        urutan: Number.isFinite(Number(mentah.urutan)) ? Number(mentah.urutan) : indeks + 1,
        folderId,
        folderSinkron: Boolean(folderId) && mentah.folderSinkron === true,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "kegiatan") {
    const judul = String(mentah.judul || "").trim().slice(0, 160);
    if (!judul) return null;
    const tglMentah = String(mentah.tanggal || "").trim();
    const tanggal = parseTanggal(tglMentah) ? tglMentah : hariIni();
    const status = DAFTAR_STATUS_KEGIATAN.includes(mentah.status) ? mentah.status : "Rencana";
    return {
      id: idBersih,
      data: {
        judul,
        catatan: String(mentah.catatan || ""),
        tanggal,
        waktuMulai: String(mentah.waktuMulai || "").trim(),
        waktuSelesai: String(mentah.waktuSelesai || "").trim(),
        lokasi: String(mentah.lokasi || "").trim().slice(0, 140),
        kategoriId: String(mentah.kategoriId || "").trim(),
        status,
        dihapusAt: null,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "dokumen") {
    const namaFile = String(mentah.namaFile || mentah.namaTampilan || "").trim();
    const namaTampilan = String(mentah.namaTampilan || namaFile || "Dokumen").trim().slice(0, 160);
    return {
      id: idBersih,
      data: {
        namaTampilan,
        namaFile: namaFile || namaTampilan,
        driveFileId: String(mentah.driveFileId || "").trim(),
        tautan: String(mentah.tautan || "").trim(),
        mimeType: String(mentah.mimeType || "application/octet-stream").trim(),
        ukuran: Number.isFinite(Number(mentah.ukuran)) ? Number(mentah.ukuran) : 0,
        kategoriId: String(mentah.kategoriId || "").trim(),
        kegiatanId: String(mentah.kegiatanId || "").trim(),
        catatan: String(mentah.catatan || ""),
        tanggalUnggah: String(mentah.tanggalUnggah || mentah.createdAt || sekarang),
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "catatan") {
    const jenis = mentah.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
    const judul = String(mentah.judul || "").trim().slice(0, 160);
    if (!judul) return null;
    const tglMentah = String(mentah.tanggal || "").trim();
    const tanggal = parseTanggal(tglMentah) ? tglMentah : hariIni();
    const tagArr = Array.isArray(mentah.tag)
      ? mentah.tag.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    const dataCatatan = {
      jenis,
      judul,
      isi: jenis === JENIS_CATATAN_SINGKAT ? String(mentah.isi || "") : "",
      kategori: String(mentah.kategori || "").trim().slice(0, 40),
      tag: tagArr,
      kegiatanId: String(mentah.kegiatanId || "").trim(),
      disematkan: Boolean(mentah.disematkan),
      tanggal,
      dihapusAt: null,
      createdAt: String(mentah.createdAt || sekarang),
      updatedAt: String(mentah.updatedAt || sekarang)
    };
    if (jenis === JENIS_CATATAN_GDOC) {
      dataCatatan.templat = String(mentah.templat || "kosong");
      dataCatatan.docId = String(mentah.docId || "").trim();
      dataCatatan.tautan = String(mentah.tautan || "").trim();
    }
    return { id: idBersih, data: dataCatatan };
  }

  if (namaKoleksi === "laporan") {
    const nama = String(mentah.nama || "Laporan Google Sheets").trim();
    return {
      id: idBersih,
      data: {
        nama,
        jenis: String(mentah.jenis || "kegiatan"),
        jenisLabel: String(mentah.jenisLabel || ""),
        tautan: String(mentah.tautan || "").trim(),
        sheetId: String(mentah.sheetId || "").trim(),
        rentangTanggal: String(mentah.rentangTanggal || ""),
        tanggalDari: String(mentah.tanggalDari || ""),
        tanggalSampai: String(mentah.tanggalSampai || ""),
        jumlahBaris: Number.isFinite(Number(mentah.jumlahBaris)) ? Number(mentah.jumlahBaris) : 0,
        createdAt: String(mentah.createdAt || sekarang)
      }
    };
  }

  return null;
}

function uraiBerkasJsonCadangan(teksJson) {
  let objek;
  try {
    objek = JSON.parse(teksJson);
  } catch (_e) {
    throw new Error("Berkas bukan JSON yang sah. Pilih berkas cadangan .json yang benar.");
  }

  if (!objek || typeof objek !== "object") {
    throw new Error("Struktur berkas JSON tidak dikenali.");
  }

  const sumber =
    objek.koleksi && typeof objek.koleksi === "object"
      ? objek.koleksi
      : objek.data && typeof objek.data === "object"
        ? objek.data
        : objek;

  const hasilPerKoleksi = {};
  let totalValid = 0;

  for (const info of KOLEKSI_CADANGAN) {
    const arrMentah = Array.isArray(sumber[info.key]) ? sumber[info.key] : [];
    const unikId = new Map();
    arrMentah.forEach((item, idx) => {
      const bersih = sanitasiItemKoleksi(info.key, item, idx);
      if (bersih) {
        unikId.set(bersih.id, bersih);
      }
    });
    const daftarBersih = Array.from(unikId.values());
    hasilPerKoleksi[info.key] = daftarBersih;
    totalValid += daftarBersih.length;
  }

  const adaKunciKoleksi = KOLEKSI_CADANGAN.some((k) => Array.isArray(sumber[k.key]));
  if (!adaKunciKoleksi) {
    throw new Error(
      "Berkas JSON tidak memuat koleksi Agenda & Arsip (kegiatan, kategoriKegiatan, dokumen, kategoriDokumen, catatan, laporan)."
    );
  }

  const hariLiburCadangan =
    objek.hariLibur && typeof objek.hariLibur === "object"
      ? objek.hariLibur
      : sumber.hariLibur && typeof sumber.hariLibur === "object"
        ? sumber.hariLibur
        : null;

  return {
    tanggalEkspor: String(objek.tanggalEkspor || ""),
    koleksi: hasilPerKoleksi,
    hariLibur: hariLiburCadangan,
    totalValid
  };
}

function batalkanPratinjauImpor() {
  dataSiapImpor = null;
  namaBerkasImpor = "";
  const inputFile = document.getElementById("settings-import-file");
  if (inputFile instanceof HTMLInputElement) inputFile.value = "";
  const panelPreview = document.getElementById("settings-import-preview-panel");
  if (panelPreview) panelPreview.hidden = true;
  setProgresImpor(false);
}

async function jalankanImporDataBatch() {
  if (sedangMengimpor || !dataSiapImpor) return;

  const radioOverwrite = document.getElementById("settings-import-mode-overwrite");
  const modeTimpa = radioOverwrite instanceof HTMLInputElement && radioOverwrite.checked;

  const btnConfirm = document.getElementById("btn-settings-confirm-import");
  const btnCancel = document.getElementById("btn-settings-cancel-import");

  sedangMengimpor = true;
  setUmpanBalikPengaturan("");
  if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = true;
  if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = true;
  setProgresImpor(true);

  try {
    const db = getFirestoreDb();
    setProgresImpor(true, { label: "Memeriksa data yang sudah ada di aplikasi...", pct: 5 });

    const petaIdSudahAda = new Map();
    for (const info of KOLEKSI_CADANGAN) {
      const snap = await getDocs(collection(db, info.key));
      const setIds = new Set();
      snap.forEach((d) => setIds.add(d.id));
      petaIdSudahAda.set(info.key, setIds);
    }

    const operasiTulis = [];
    let ditambahkan = 0;
    let ditimpa = 0;
    let dilewati = 0;

    for (const info of KOLEKSI_CADANGAN) {
      const daftarImpor = dataSiapImpor.koleksi[info.key] || [];
      const sudahAdaSet = petaIdSudahAda.get(info.key) || new Set();

      for (const entri of daftarImpor) {
        const sudahAda = sudahAdaSet.has(entri.id);
        if (sudahAda && !modeTimpa) {
          dilewati += 1;
          continue;
        }
        operasiTulis.push({
          ref: doc(db, info.key, entri.id),
          data: entri.data
        });
        if (sudahAda) ditimpa += 1;
        else ditambahkan += 1;
      }
    }

    if (operasiTulis.length > 0) {
      const totalBatch = Math.ceil(operasiTulis.length / BATAS_OPERASI_BATCH);
      for (let indeksBatch = 0; indeksBatch < totalBatch; indeksBatch += 1) {
        const mulai = indeksBatch * BATAS_OPERASI_BATCH;
        const potongan = operasiTulis.slice(mulai, mulai + BATAS_OPERASI_BATCH);
        const batch = writeBatch(db);
        potongan.forEach((op) => {
          batch.set(op.ref, op.data);
        });

        const persen = 15 + ((indeksBatch + 1) / totalBatch) * 85;
        setProgresImpor(true, {
          label: `Menyimpan batch ${indeksBatch + 1} dari ${totalBatch} (${Math.min(mulai + potongan.length, operasiTulis.length)}/${operasiTulis.length} data)...`,
          pct: persen,
        });
        await batch.commit();
      }
    } else {
      setProgresImpor(true, { label: "Tidak ada perubahan baru yang perlu ditulis.", pct: 100 });
    }

    if (dataSiapImpor.hariLibur) {
      setProgresImpor(true, { label: "Memperbarui konfigurasi hari libur...", pct: 94 });
      const cfgImpor = dataSiapImpor.hariLibur;
      const cfgSaatIni = ambilKonfigurasiAktif();
      if (modeTimpa) {
        await simpanPengaturanHariLibur({
          entri: Array.isArray(cfgImpor.entri) ? cfgImpor.entri : [],
          disembunyikan: Array.isArray(cfgImpor.disembunyikan) ? cfgImpor.disembunyikan : [],
          tampilkanCutiMerah: typeof cfgImpor.tampilkanCutiMerah === "boolean" ? cfgImpor.tampilkanCutiMerah : true,
          tampilkanHariBesar: typeof cfgImpor.tampilkanHariBesar === "boolean" ? cfgImpor.tampilkanHariBesar : true
        });
      } else {
        if ((!cfgSaatIni.entri || cfgSaatIni.entri.length === 0) && Array.isArray(cfgImpor.entri) && cfgImpor.entri.length > 0) {
          await simpanPengaturanHariLibur({
            ...cfgSaatIni,
            entri: [...cfgImpor.entri]
          });
        }
      }
    }

    batalkanPratinjauImpor();
    tampilkanRingkasanImpor({ ditambahkan, ditimpa, dilewati });

    tampilkanToast(
      `Impor selesai: ${ditambahkan} ditambahkan, ${ditimpa} ditimpa, ${dilewati} dilewati.`,
      "success"
    );
  } catch (err) {
    setUmpanBalikPengaturan(formatPesanGalatFirestore(err), "danger");
  } finally {
    sedangMengimpor = false;
    setProgresImpor(false);
    if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = false;
    if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = false;
    segarkanTampilanPengaturan();
  }
}

// ============================================================================
// Inisialisasi halaman
// ============================================================================

export function initHalamanPengaturan() {
  pastikanKerangkaHalamanPengaturan();
  perbaruiInfoVersiSwDiDom();
  ikatPenyegaranState();
  segarkanTampilanPengaturan();

  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  const panel = document.getElementById("section-pengaturan");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("#btn-settings-relogin-drive")) {
        tanganiMasukUlangDrivePengaturan();
      } else if (target.closest("#btn-settings-sync-all-folders")) {
        tanganiSinkronkanSemuaFolder();
      } else if (target.closest("#btn-settings-check-update")) {
        tanganiPeriksaPembaruanSw();
      } else if (target.closest("#btn-settings-export-json")) {
        eksporSeluruhDataJson();
      } else if (target.closest("#btn-settings-migrate-dihapusat")) {
        jalankanMigrasiDihapusAt();
      } else if (target.closest("#btn-settings-cancel-import")) {
        batalkanPratinjauImpor();
      } else if (target.closest("#btn-settings-confirm-import")) {
        jalankanImporDataBatch();
      }
    });
  }

  const inputImport = document.getElementById("settings-import-file");
  if (inputImport instanceof HTMLInputElement) {
    inputImport.addEventListener("change", async () => {
      setUmpanBalikPengaturan("");
      const berkas = inputImport.files && inputImport.files[0];
      if (!berkas) {
        batalkanPratinjauImpor();
        return;
      }

      try {
        const teks = await berkas.text();
        dataSiapImpor = uraiBerkasJsonCadangan(teks);
        namaBerkasImpor = berkas.name;
        tampilkanPratinjauImpor(dataSiapImpor, namaBerkasImpor, KOLEKSI_CADANGAN);
      } catch (err) {
        batalkanPratinjauImpor();
        setUmpanBalikPengaturan(
          err instanceof Error ? err.message : "Gagal membaca berkas JSON cadangan.",
          "danger"
        );
      }
    });
  }

  manajerKategoriDokumen.onChange(() => segarkanTampilanPengaturan());
  manajerKategoriKegiatan.onChange(() => segarkanTampilanPengaturan());
  onPerubahanKegiatan(() => segarkanTampilanPengaturan());
  onPerubahanDokumen(() => segarkanTampilanPengaturan());
  onPerubahanCatatan(() => segarkanTampilanPengaturan());

  // Event handler untuk kartu Pengaturan Hari Libur & Hari Besar
  const chkCuti = document.getElementById("settings-libur-cuti-merah");
  if (chkCuti) {
    chkCuti.addEventListener("change", async () => {
      const cfg = ambilKonfigurasiAktif();
      cfg.tampilkanCutiMerah = chkCuti.checked;
      await simpanPengaturanHariLibur(cfg);
      tampilkanToast("Pengaturan cuti bersama diperbarui.", "success");
    });
  }

  const chkHariBesar = document.getElementById("settings-libur-hari-besar");
  if (chkHariBesar) {
    chkHariBesar.addEventListener("change", async () => {
      const cfg = ambilKonfigurasiAktif();
      cfg.tampilkanHariBesar = chkHariBesar.checked;
      await simpanPengaturanHariLibur(cfg);
      tampilkanToast("Pengaturan hari besar diperbarui.", "success");
    });
  }

  const selectTahun = document.getElementById("settings-libur-tahun-select");
  if (selectTahun) {
    selectTahun.addEventListener("change", () => {
      const v = Number(selectTahun.value);
      if (Number.isFinite(v) && v > 1900) {
        setTahunLiburAktif(v);
        renderDaftarHariLiburPengaturan();
      }
    });
  }

  const btnTambahTahun = document.getElementById("btn-settings-tambah-tahun");
  const boxTahunBaru = document.getElementById("settings-libur-input-tahun-box");
  const inputTahunBaru = document.getElementById("settings-libur-input-tahun-baru");
  const btnSimpanTahunBaru = document.getElementById("btn-settings-simpan-tahun-baru");
  const btnBatalTahunBaru = document.getElementById("btn-settings-batal-tahun-baru");

  if (btnTambahTahun && boxTahunBaru) {
    btnTambahTahun.addEventListener("click", () => {
      btnTambahTahun.style.display = "none";
      boxTahunBaru.style.display = "inline-flex";
      if (inputTahunBaru instanceof HTMLInputElement) {
        inputTahunBaru.value = String(tahunLiburAktif + 1);
        inputTahunBaru.focus();
      }
    });
  }
  if (btnBatalTahunBaru && boxTahunBaru && btnTambahTahun) {
    btnBatalTahunBaru.addEventListener("click", () => {
      boxTahunBaru.style.display = "none";
      btnTambahTahun.style.display = "inline-block";
    });
  }
  if (btnSimpanTahunBaru && inputTahunBaru && boxTahunBaru && btnTambahTahun) {
    btnSimpanTahunBaru.addEventListener("click", () => {
      const val = Number(inputTahunBaru.value);
      if (Number.isFinite(val) && val >= 1970 && val <= 2100) {
        setTahunLiburAktif(val);
        boxTahunBaru.style.display = "none";
        btnTambahTahun.style.display = "inline-block";
        renderDaftarHariLiburPengaturan();
      } else {
        tampilkanToast("Masukkan tahun antara 1970 dan 2100.", "warning");
      }
    });
  }

  const formLibur = document.getElementById("settings-libur-form");
  const formLiburId = document.getElementById("settings-libur-form-id");
  const formLiburTgl = document.getElementById("settings-libur-input-tanggal");
  const formLiburNama = document.getElementById("settings-libur-input-nama");
  const formLiburJenis = document.getElementById("settings-libur-input-jenis");
  const formLiburTitle = document.getElementById("settings-libur-form-title");
  const btnLiburSubmit = document.getElementById("btn-settings-libur-submit");
  const btnLiburBatal = document.getElementById("btn-settings-libur-batal-edit");

  function resetFormLibur() {
    if (formLiburId instanceof HTMLInputElement) formLiburId.value = "";
    if (formLiburNama instanceof HTMLInputElement) formLiburNama.value = "";
    if (formLiburJenis instanceof HTMLSelectElement) formLiburJenis.value = "libur";
    if (formLiburTitle) formLiburTitle.textContent = "Tambah Hari Libur atau Hari Besar";
    if (btnLiburSubmit) btnLiburSubmit.textContent = "Simpan Entri";
    if (btnLiburBatal) btnLiburBatal.hidden = true;
  }

  if (btnLiburBatal) {
    btnLiburBatal.addEventListener("click", () => resetFormLibur());
  }

  if (formLibur) {
    formLibur.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tgl = formLiburTgl instanceof HTMLInputElement ? formLiburTgl.value.trim() : "";
      const nama = formLiburNama instanceof HTMLInputElement ? formLiburNama.value.trim().slice(0, 80) : "";
      const jenis = formLiburJenis instanceof HTMLSelectElement ? formLiburJenis.value : "libur";
      const editId = formLiburId instanceof HTMLInputElement ? formLiburId.value.trim() : "";

      if (!tgl || !parseTanggal(tgl)) {
        tampilkanToast("Pilih tanggal yang sah.", "warning");
        return;
      }
      if (!nama) {
        tampilkanToast("Nama hari libur / hari besar wajib diisi.", "warning");
        return;
      }

      const cfg = ambilKonfigurasiAktif();
      if (editId) {
        const idx = cfg.entri.findIndex((u) => u.id === editId);
        if (idx >= 0) {
          cfg.entri[idx] = { ...cfg.entri[idx], tanggal: tgl, nama, jenis };
        } else {
          cfg.entri.push({ id: editId, tanggal: tgl, nama, jenis });
        }
        tampilkanToast(`Perubahan "${nama}" berhasil disimpan.`, "success");
      } else {
        const idBaru = `libur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        cfg.entri.push({ id: idBaru, tanggal: tgl, nama, jenis });
        tampilkanToast(`"${nama}" berhasil ditambahkan.`, "success");
      }

      const thnEntri = Number(tgl.slice(0, 4));
      if (Number.isFinite(thnEntri)) {
        setTahunLiburAktif(thnEntri);
      }

      resetFormLibur();
      await simpanPengaturanHariLibur(cfg);
    });
  }

  const tbodyLibur = document.getElementById("settings-libur-tbody");
  if (tbodyLibur) {
    tbodyLibur.addEventListener("click", async (e) => {
      const target = e.target instanceof Element ? e.target.closest("button[data-action]") : null;
      if (!target) return;

      const aksi = target.getAttribute("data-action");
      const cfg = ambilKonfigurasiAktif();

      if (aksi === "toggle-hide-builtin") {
        const key = target.getAttribute("data-key");
        const nama = target.getAttribute("data-nama") || "Entri";
        if (!key) return;
        const setHide = new Set(cfg.disembunyikan || []);
        if (setHide.has(key)) {
          setHide.delete(key);
          tampilkanToast(`"${nama}" ditampilkan kembali.`, "success");
        } else {
          setHide.add(key);
          tampilkanToast(`"${nama}" disembunyikan dari jadwal.`, "info");
        }
        cfg.disembunyikan = Array.from(setHide);
        await simpanPengaturanHariLibur(cfg);
      } else if (aksi === "edit-custom-libur") {
        const id = target.getAttribute("data-id");
        const item = (cfg.entri || []).find((u) => u.id === id);
        if (!item) return;

        if (formLiburId instanceof HTMLInputElement) formLiburId.value = item.id;
        if (formLiburTgl instanceof HTMLInputElement) formLiburTgl.value = item.tanggal;
        if (formLiburNama instanceof HTMLInputElement) formLiburNama.value = item.nama;
        if (formLiburJenis instanceof HTMLSelectElement) formLiburJenis.value = item.jenis || "libur";
        if (formLiburTitle) formLiburTitle.textContent = "Ubah Hari Libur / Hari Besar";
        if (btnLiburSubmit) btnLiburSubmit.textContent = "Simpan Perubahan";
        if (btnLiburBatal) btnLiburBatal.hidden = false;

        formLiburNama?.focus();
        formLibur?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (aksi === "delete-custom-libur") {
        const id = target.getAttribute("data-id");
        const item = (cfg.entri || []).find((u) => u.id === id);
        const nama = item ? item.nama : "Entri";
        cfg.entri = (cfg.entri || []).filter((u) => u.id !== id);
        tampilkanToast(`"${nama}" telah dihapus.`, "info");
        await simpanPengaturanHariLibur(cfg);
        if (formLiburId instanceof HTMLInputElement && formLiburId.value === id) {
          resetFormLibur();
        }
      }
    });
  }

  window.addEventListener("online", segarkanTampilanPengaturan);
  window.addEventListener("offline", segarkanTampilanPengaturan);
}

// ============================================================================
// Reset saat keluar
// ============================================================================

let segarkanTerdaftarKarenaCadangan = false;

/**
 * Memasang penyegaran tampilan saat status cadangan atau hari libur berubah.
 * Menggantikan pemanggilan render langsung yang tadinya ada di dalam
 * simpanIntervalCadangan / simpanPengaturanHariLibur (state kini bebas DOM).
 * Dipanggil sekali dari initHalamanPengaturan agar tidak ada listener ganda.
 */
export function ikatPenyegaranState() {
  if (segarkanTerdaftarKarenaCadangan) return;
  segarkanTerdaftarKarenaCadangan = true;
  onPerubahanCadangan(() => segarkanTampilanPengaturan());
  onPerubahanHariLibur(() => {
    segarkanTampilanPengaturan();
    renderDaftarHariLiburPengaturan();
  });
}

export function resetHalamanPengaturanSaatKeluar() {
  batalkanPratinjauImpor();
  setUmpanBalikPengaturan("");
  setStatusCekPembaruan("");
  sembunyikanRingkasanImpor();
  setStatusMigrasi("", false);
}
