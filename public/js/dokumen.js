/**
 * Modul Halaman Dokumen, Unggah & Pindah Folder Google Drive, serta Rapikan Dokumen (Fase 3 + Ketahanan Offline Fase 6)
 * Mematuhi Aturan #5, #6, #7, #8, #9, #10, #12, #13, #14:
 * - Koleksi Firestore: "dokumen" dan "kategoriDokumen"
 * - Semua tampilan tanggal dokumen memakai tanggal lokal lewat util-tanggal.js
 *   (tanpa toISOString().slice(0,10), split("T"), atau new Date("YYYY-MM-DD"))
 * - Tampilan berbentuk LIST sejajar dengan header di desktop/tablet lanskap dan baris dua tingkat
 *   dengan menu titik tiga di HP/tablet potret
 * - Bilah alat ringkas satu baris dengan panel filter tersembunyi bawaan (melipat di desktop/tablet,
 *   lembar bawah di HP) serta chip filter aktif yang dapat dihapus satu per satu.
 */
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  formatPesanGalatFirestore
} from "./firebase-config.js";
import {
  buatManajerKategori,
  inisialisasiDialogKelolaKategori,
  KATEGORI_DOKUMEN_BAWAAN,
  TANPA_KATEGORI_INFO
} from "./kategori.js";
import {
  buatSubfolderKategoriDrive,
  pastikanFolderTanpaKategoriDrive,
  gantiNamaFolderDrive,
  ambilMetadataItemDrive,
  pindahkanItemKeSampahDrive,
  pindahkanBerkasKeFolderDrive,
  unggahBerkasMultipartKeDrive,
  formatPesanGalatDrive,
  resetCacheDrive
} from "./drive.js";
import { getDaftarKegiatan, onPerubahanKegiatan } from "./kegiatan.js";
import { tanggalLokal, hariIni, parseTanggal } from "./util-tanggal.js";
import { escapeHtml, pindahKeBagian } from "./sidebar.js";

const UKURAN_HALAMAN_DOKUMEN = 40;
const JEDA_RAPIKAN_MS = 280;

const NAMA_BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

const IKON_FILTER = svgIkon('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>', 17);
const IKON_TUTUP = svgIkon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 18);

export const manajerKategoriDokumen = buatManajerKategori({
  namaKoleksiKategori: "kategoriDokumen",
  namaKoleksiPemakai: "dokumen",
  labelItemPemakai: "dokumen",
  daftarBawaan: KATEGORI_DOKUMEN_BAWAAN,
  pakaiFolderDrive: true
});

let unsubscribeSnapshotDokumen = null;
let daftarDokumen = [];
let sudahDimuatPertamaKali = false;
let antarmukaSudahDiikat = false;
let dialogKelolaKategoriDokCtrl = null;
const listenersPerubahanDokumen = new Set();

let kataKunciCari = "";
let filterKategoriId = "ALL";
let urutBerdasarkan = "tanggal"; // "tanggal" | "nama" | "ukuran"
let arahUrutan = "desc"; // "asc" | "desc"
let batasTampil = UKURAN_HALAMAN_DOKUMEN;
let panelFilterTerbuka = false;

let idMenuTitikTigaTerbuka = null;

// State modal Unggah Dokumen
let unggahModalTerbuka = false;
let pengendaliUnggahAktif = null;
let fokusSebelumModalDokumen = null;

// State modal Ubah Metadata Dokumen
let editModalTerbuka = false;

// State modal Hapus Dokumen
let hapusModalTerbuka = false;
let dokumenAkanDihapus = null;

// State modal Rapikan Dokumen ke Folder Kategori
let rapikanModalTerbuka = false;
let sedangMerapikan = false;
let batalkanRapikan = false;

export function getDaftarDokumen() {
  return daftarDokumen.map((d) => ({ ...d }));
}

export function isDokumenSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function onPerubahanDokumen(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanDokumen.add(listener);
  return () => listenersPerubahanDokumen.delete(listener);
}

function beritahuPerubahanDokumen() {
  const salinan = getDaftarDokumen();
  const statusMuat = sudahDimuatPertamaKali;
  listenersPerubahanDokumen.forEach((fn) => {
    try {
      fn(salinan, statusMuat);
    } catch (_e) {
      // Abaikan
    }
  });
}

/**
 * Fase 6 Bagian D: Memperbarui status online/offline pada halaman Dokumen & tombol unggah/rapikan.
 */
export function perbaruiStatusJaringanDokumen() {
  const online = navigator.onLine;
  const btnUnggah = document.getElementById("btn-unggah-dokumen");
  if (btnUnggah instanceof HTMLButtonElement) {
    btnUnggah.disabled = !online;
    btnUnggah.title = online
      ? "Unggah berkas baru ke Google Drive"
      : "Tidak ada koneksi internet. Pengunggahan ke Google Drive memerlukan sambungan aktif.";
  }

  const btnRapikan = document.getElementById("btn-rapikan-dokumen-drive");
  if (btnRapikan instanceof HTMLButtonElement) {
    btnRapikan.disabled = !online;
    btnRapikan.title = online
      ? "Rapikan berkas ke subfolder kategori di Google Drive"
      : "Tidak ada koneksi internet. Merapikan folder memerlukan sambungan aktif.";
  }

  const noteOffline = document.getElementById("dokumen-offline-note");
  if (noteOffline) {
    noteOffline.hidden = online;
  }

  const btnSubmitUnggah = document.getElementById("dokumen-upload-submit-btn");
  if (btnSubmitUnggah instanceof HTMLButtonElement && !pengendaliUnggahAktif) {
    btnSubmitUnggah.disabled = !online;
  }

  const radioTrashDrive = document.getElementById("dokumen-delete-mode-drive");
  if (radioTrashDrive instanceof HTMLInputElement) {
    radioTrashDrive.disabled = !online;
    if (!online && radioTrashDrive.checked) {
      const radioApp = document.getElementById("dokumen-delete-mode-app");
      if (radioApp instanceof HTMLInputElement) radioApp.checked = true;
    }
  }
}

/**
 * Fase 6 Bagian B3: Menyinkronkan satu folder kategori dokumen dari halaman Pengaturan.
 * @param {string} kategoriId
 * @returns {Promise<{ nama: string, pesan: string }>}
 */
export async function sinkronkanSatuFolderKategoriDokumen(kategoriId) {
  const kat = manajerKategoriDokumen.ambilKategoriById(kategoriId);
  if (!kat) {
    throw new Error("Kategori dokumen tidak ditemukan.");
  }

  if (!kat.folderId) {
    const dibuat = await buatSubfolderKategoriDrive(kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: dibuat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Subfolder baru dibuat dan disinkronkan" };
  }

  try {
    await gantiNamaFolderDrive(kat.folderId, kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: kat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Nama folder disinkronkan" };
  } catch (err) {
    if (err && err.isNotFound) {
      const dibuatUlang = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuatUlang.folderId,
        folderSinkron: true
      });
      return { nama: kat.nama, pesan: "Folder lama tidak ditemukan (404), dibuat ulang" };
    }
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderSinkron: false
    });
    throw new Error(formatPesanGalatDrive(err));
  }
}

/**
 * Mengubah timestamp ISO (mis. tanggalUnggah) menjadi teks tanggal lokal Indonesia
 * menggunakan tanggalLokal(d) dan parseTanggal() dari util-tanggal.js (Aturan #6).
 * @param {string} isoTimestamp
 * @returns {string}
 */
export function formatTanggalDokumenLokal(isoTimestamp) {
  if (!isoTimestamp) return "-";
  const tglWaktu = new Date(isoTimestamp);
  if (Number.isNaN(tglWaktu.getTime())) return "-";

  const tglStrLokal = tanggalLokal(tglWaktu);
  const parsed = parseTanggal(tglStrLokal);
  if (!parsed) return tglStrLokal;

  const teksTanggal = `${parsed.getDate()} ${NAMA_BULAN_PENDEK[parsed.getMonth()]} ${parsed.getFullYear()}`;
  return tglStrLokal === hariIni() ? `Hari ini, ${teksTanggal}` : teksTanggal;
}

/**
 * Memformat ukuran byte ke KB atau MB yang rapi.
 * @param {number} byteVal
 * @returns {string}
 */
export function formatUkuranBerkas(byteVal) {
  const angka = Number(byteVal);
  if (!Number.isFinite(angka) || angka <= 0) {
    return "0 KB";
  }
  const satuMb = 1024 * 1024;
  if (angka >= satuMb) {
    const mb = angka / satuMb;
    return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB`.replace(".", ",");
  }
  const kb = Math.max(1, Math.round(angka / 1024));
  return `${kb} KB`;
}

/**
 * Menentukan label jenis file singkat dan ikon SVG berdasarkan mimeType dan ekstensi namaFile.
 * @param {string} mimeType
 * @param {string} namaFile
 * @returns {{ label: string, kelasWarna: string, svg: string }}
 */
export function infoJenisBerkasMime(mimeType, namaFile = "") {
  const m = String(mimeType || "").toLowerCase();
  const eks = String(namaFile || "").toLowerCase();

  if (m === "application/pdf" || eks.endsWith(".pdf")) {
    return {
      label: "PDF",
      kelasWarna: "doc-icon-pdf",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h2"/>', 18)
    };
  }
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv" ||
    eks.endsWith(".xlsx") ||
    eks.endsWith(".xls") ||
    eks.endsWith(".csv")
  ) {
    return {
      label: m === "text/csv" || eks.endsWith(".csv") ? "CSV" : "Spreadsheet",
      kelasWarna: "doc-icon-sheet",
      svg: svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>', 18)
    };
  }
  if (
    m.includes("wordprocessingml") ||
    m === "application/msword" ||
    m.includes("vnd.google-apps.document") ||
    eks.endsWith(".docx") ||
    eks.endsWith(".doc")
  ) {
    return {
      label: "Dokumen Kata",
      kelasWarna: "doc-icon-word",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>', 18)
    };
  }
  if (
    m.includes("presentation") ||
    m.includes("powerpoint") ||
    eks.endsWith(".pptx") ||
    eks.endsWith(".ppt")
  ) {
    return {
      label: "Presentasi",
      kelasWarna: "doc-icon-slide",
      svg: svgIkon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 18)
    };
  }
  if (m.startsWith("image/")) {
    const sub = m.replace("image/", "").toUpperCase();
    return {
      label: sub && sub.length <= 5 ? `Gambar ${sub}` : "Gambar",
      kelasWarna: "doc-icon-image",
      svg: svgIkon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 18)
    };
  }
  if (m.startsWith("audio/")) {
    return {
      label: "Audio",
      kelasWarna: "doc-icon-media",
      svg: svgIkon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', 18)
    };
  }
  if (m.startsWith("video/")) {
    return {
      label: "Video",
      kelasWarna: "doc-icon-media",
      svg: svgIkon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>', 18)
    };
  }
  if (
    m.includes("zip") ||
    m.includes("rar") ||
    m.includes("tar") ||
    m.includes("7z") ||
    eks.endsWith(".zip") ||
    eks.endsWith(".rar") ||
    eks.endsWith(".7z")
  ) {
    return {
      label: "Arsip Kompresi",
      kelasWarna: "doc-icon-archive",
      svg: svgIkon('<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>', 18)
    };
  }
  if (m.startsWith("text/")) {
    return {
      label: "Teks",
      kelasWarna: "doc-icon-generic",
      svg: svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="14" y1="17" x2="8" y2="17"/>', 18)
    };
  }
  return {
    label: "Berkas",
    kelasWarna: "doc-icon-generic",
    svg: svgIkon('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', 18)
  };
}

function cariJudulKegiatanTerkait(kegiatanId) {
  const idBersih = String(kegiatanId || "").trim();
  if (!idBersih) return "";
  const ketemu = getDaftarKegiatan().find((k) => k.id === idBersih);
  return ketemu ? ketemu.judul : "";
}

function hitungDokumenPemakaiLokal(kategoriId) {
  const target = String(kategoriId || "").trim();
  if (!target) {
    return daftarDokumen.filter((item) => manajerKategoriDokumen.cariInfoKategori(item.kategoriId).tetap).length;
  }
  return daftarDokumen.filter((item) => String(item.kategoriId || "").trim() === target).length;
}

/**
 * Memastikan folder Drive untuk suatu kategoriId siap dipakai (membuat otomatis saat pertama
 * dibutuhkan jika sebelumnya gagal/belum dibuat). Untuk "Tanpa Kategori" memakai subfolder "Tanpa Kategori".
 * @param {string} kategoriId
 * @returns {Promise<string>} ID folder Drive tujuan
 */
async function pastikanFolderTujuanKategoriSiap(kategoriId) {
  const idBersih = String(kategoriId || "").trim();
  const kat = idBersih ? manajerKategoriDokumen.ambilKategoriById(idBersih) : null;

  if (!kat) {
    return pastikanFolderTanpaKategoriDrive();
  }

  if (kat.folderId) {
    try {
      const meta = await ambilMetadataItemDrive(kat.folderId);
      if (meta && !meta.trashed) {
        if (!kat.folderSinkron) {
          await gantiNamaFolderDrive(kat.folderId, kat.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
            folderId: kat.folderId,
            folderSinkron: true
          });
        }
        return kat.folderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
    }
  }

  const dibuat = await buatSubfolderKategoriDrive(kat.nama);
  await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
    folderId: dibuat.folderId,
    folderSinkron: true
  });
  return dibuat.folderId;
}

/**
 * Handler Drive untuk Kelola Kategori Dokumen (tambah, ubah nama, sinkronkan, buat ulang 404, sampah folder).
 */
function buatOpsiDriveKategoriDokumen() {
  return {
    onSetelahTambahKategori: async (katBaru) => {
      try {
        const dibuat = await buatSubfolderKategoriDrive(katBaru.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: "",
          folderSinkron: false
        });
        return {
          peringatan: `Kategori "${katBaru.nama}" tersimpan, tetapi folder Google Drive belum dapat dibuat (${formatPesanGalatDrive(err)}). Folder akan dibuat otomatis saat dibutuhkan atau lewat tombol "Sinkronkan folder".`
        };
      }
    },

    onSetelahUbahNamaKategori: async (hasilUbah) => {
      const katTerkini = manajerKategoriDokumen.ambilKategoriById(hasilUbah.id) || hasilUbah.sebelumnya;
      const folderIdLama = String(katTerkini?.folderId || "").trim();

      if (!folderIdLama) {
        try {
          const dibuat = await buatSubfolderKategoriDrive(hasilUbah.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderId: dibuat.folderId,
            folderSinkron: true
          });
          return {};
        } catch (err) {
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderSinkron: false
          });
          return {
            peringatan: `Nama kategori diperbarui di aplikasi, namun pembuatan folder Google Drive gagal: ${formatPesanGalatDrive(err)}`
          };
        }
      }

      try {
        await gantiNamaFolderDrive(folderIdLama, hasilUbah.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderId: folderIdLama,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            peringatan: `Folder Google Drive untuk "${hasilUbah.nama}" tidak ditemukan (404). Gunakan pilihan di bawah untuk membuat ulang folder.`
          };
        }
        return {
          peringatan: `Nama kategori tersimpan, tetapi gagal mengganti nama folder di Google Drive: ${formatPesanGalatDrive(err)}`
        };
      }
    },

    onSinkronkanFolder: async (kat) => {
      const segar = manajerKategoriDokumen.ambilKategoriById(kat.id) || kat;
      if (!segar.folderId) {
        const dibuat = await buatSubfolderKategoriDrive(segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Subfolder Drive untuk kategori "${segar.nama}" berhasil dibuat dan disinkronkan.` };
      }

      try {
        await gantiNamaFolderDrive(segar.folderId, segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: segar.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Nama folder Drive untuk kategori "${segar.nama}" berhasil disinkronkan.` };
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            pesanGalat: `Folder lama tidak ditemukan di Google Drive (404). Anda dapat membuat ulang folder kategori "${segar.nama}".`
          };
        }
        throw new Error(formatPesanGalatDrive(err));
      }
    },

    onBuatUlangFolderDanPindahkan: async (kat) => {
      const dibuat = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuat.folderId,
        folderSinkron: true
      });

      const dokKategoriIni = daftarDokumen.filter(
        (d) => String(d.kategoriId || "").trim() === kat.id && d.driveFileId
      );
      let dipindah = 0;
      let gagal = 0;

      for (const dok of dokKategoriIni) {
        try {
          await pindahkanBerkasKeFolderDrive(dok.driveFileId, dibuat.folderId);
          dipindah += 1;
        } catch (_e) {
          gagal += 1;
        }
      }

      if (dokKategoriIni.length === 0) {
        return { pesanSukses: `Folder baru untuk kategori "${kat.nama}" berhasil dibuat di Google Drive.` };
      }
      return {
        pesanSukses:
          gagal === 0
            ? `Folder kategori "${kat.nama}" dibuat ulang dan ${dipindah} dokumen dipindahkan ke dalamnya.`
            : `Folder "${kat.nama}" dibuat ulang (${dipindah} dokumen dipindahkan, ${gagal} dokumen tidak dapat dipindahkan).`
      };
    },

    onBuangFolderBekasKeSampah: async (infoFolder) => {
      await pindahkanItemKeSampahDrive(infoFolder.folderId);
    }
  };
}

function tampilkanGalatHalamanDokumen(pesan, tipe = "danger") {
  const box = document.getElementById("dokumen-page-alert");
  const txt = document.getElementById("dokumen-page-alert-text");
  if (!box || !txt) return;
  if (!pesan) {
    txt.textContent = "";
    box.hidden = true;
    box.classList.remove("alert-box-warning", "alert-box-success");
    return;
  }
  txt.textContent = pesan;
  box.classList.toggle("alert-box-warning", tipe === "warning");
  box.classList.toggle("alert-box-success", tipe === "success");
  box.hidden = false;
}

function pastikanKerangkaHalamanDokumen() {
  const panel = document.getElementById("section-dokumen");
  if (!panel || panel.querySelector("#dokumen-toolbar")) return;

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Arsip Dokumen</h2>
        <p class="section-heading-subtitle">Simpan berkas langsung ke folder kategori di Google Drive, tautkan dengan kegiatan, dan kelola metadata arsip.</p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-rapikan-dokumen-drive" class="btn-secondary">${svgIkon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 12 11 15 14"/>', 17)}<span>Rapikan dokumen ke folder kategori</span></button>
        <button type="button" id="btn-kelola-kategori-dokumen" class="btn-secondary">${svgIkon('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', 17)}<span>Kelola Kategori Dokumen</span></button>
        <button type="button" id="btn-unggah-dokumen" class="btn-primary">${svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18, 2.2)}<span>Unggah Dokumen</span></button>
      </div>
    </div>

    <div id="dokumen-offline-note" class="alert-box alert-box-warning" role="status" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span>Tidak ada koneksi internet. Pengunggahan berkas baru dan perapian folder Google Drive dinonaktifkan sementara, tetapi daftar arsip tersimpan tetap dapat ditelusuri.</span>
    </div>

    <div id="dokumen-page-alert" class="alert-box" role="alert" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span id="dokumen-page-alert-text"></span>
    </div>

    <div id="dokumen-toolbar" class="filter-card filter-toolbar-shell">
      <div class="compact-toolbar-row">
        <div class="search-field-wrap compact-search-wrap">
          <label for="dokumen-search-input" class="sr-only">Cari dokumen</label>
          ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
          <input type="search" id="dokumen-search-input" class="form-input input-with-icon" placeholder="Cari nama tampilan, nama berkas, atau catatan..." autocomplete="off" />
        </div>
        <button
          type="button"
          id="dokumen-filter-toggle-btn"
          class="btn-secondary btn-filter-toggle"
          aria-expanded="false"
          aria-controls="dokumen-filter-panel"
        >
          ${IKON_FILTER}
          <span class="btn-filter-label">Filter</span>
          <span id="dokumen-filter-count-badge" class="filter-count-badge" hidden>0</span>
        </button>
        <div class="compact-sort-group">
          <label for="dokumen-sort-field" class="sr-only">Urut Berdasarkan</label>
          <select id="dokumen-sort-field" class="form-select compact-sort-select" aria-label="Urutkan dokumen berdasarkan" title="Urut berdasarkan">
            <option value="tanggal">Tanggal Unggah</option>
            <option value="nama">Nama Dokumen</option>
            <option value="ukuran">Ukuran Berkas</option>
          </select>
          <label for="dokumen-sort-dir" class="sr-only">Arah Urutan</label>
          <select id="dokumen-sort-dir" class="form-select compact-sort-dir-select" aria-label="Arah urutan dokumen" title="Arah urutan">
            <option value="desc">Menurun (&darr;)</option>
            <option value="asc">Menaik (&uarr;)</option>
          </select>
        </div>
      </div>

      <div id="dokumen-filter-scrim" class="filter-sheet-scrim" hidden></div>

      <div id="dokumen-filter-panel" class="filter-collapsible" role="region" aria-label="Filter dokumen">
        <div class="filter-collapsible-inner">
          <div class="filter-sheet-header">
            <h3 class="filter-sheet-title">Filter Dokumen</h3>
            <button type="button" id="dokumen-filter-sheet-close-btn" class="icon-btn" aria-label="Tutup panel filter" title="Tutup">
              ${IKON_TUTUP}
            </button>
          </div>
          <div class="filter-controls-grid filter-controls-1col-wide">
            <div class="filter-control-item">
              <label for="dokumen-filter-kategori" class="filter-label">Kategori Dokumen</label>
              <select id="dokumen-filter-kategori" class="form-select"><option value="ALL">Semua Kategori</option></select>
            </div>
          </div>
          <div class="filter-panel-actions-desktop">
            <button type="button" id="dokumen-filter-reset-desktop-btn" class="btn-link-filter">Atur ulang</button>
            <button type="button" id="dokumen-filter-done-btn" class="btn-secondary btn-sm-touch">Selesai</button>
          </div>
          <div class="filter-sheet-actions-mobile">
            <button type="button" id="dokumen-filter-reset-sheet-btn" class="btn-secondary">Atur ulang</button>
            <button type="button" id="dokumen-filter-apply-sheet-btn" class="btn-primary">Terapkan</button>
          </div>
        </div>
      </div>

      <div id="dokumen-filter-chips-row" class="active-chips-row" hidden>
        <div id="dokumen-filter-chips-list" class="filter-chips-list"></div>
        <button type="button" id="btn-reset-filter-dokumen" class="btn-link-filter">Hapus semua</button>
      </div>

      <div id="dokumen-active-filter-bar" class="active-filter-bar" hidden>
        <span id="dokumen-result-summary" class="result-summary-text"></span>
      </div>
    </div>

    <div id="dokumen-list-region" aria-live="polite"></div>
  </div>`;

  sinkronkanPanelFilterDokumen(false);
}

function sinkronkanPanelFilterDokumen(kembalikanFokusKeTombol = false) {
  const btnToggle = document.getElementById("dokumen-filter-toggle-btn");
  const panel = document.getElementById("dokumen-filter-panel");
  const scrim = document.getElementById("dokumen-filter-scrim");
  if (!btnToggle || !panel) return;

  btnToggle.setAttribute("aria-expanded", panelFilterTerbuka ? "true" : "false");
  btnToggle.classList.toggle("is-open", panelFilterTerbuka);
  panel.classList.toggle("is-open", panelFilterTerbuka);
  panel.setAttribute("aria-hidden", panelFilterTerbuka ? "false" : "true");
  if ("inert" in panel) {
    panel.inert = !panelFilterTerbuka;
  }
  if (scrim) {
    scrim.hidden = !panelFilterTerbuka;
  }

  if (!panelFilterTerbuka && kembalikanFokusKeTombol) {
    btnToggle.focus();
  }
}

function aturBukaPanelFilterDokumen(buka, kembalikanFokus = false) {
  panelFilterTerbuka = Boolean(buka);
  sinkronkanPanelFilterDokumen(kembalikanFokus);
}

function aturUlangSemuaFilterDokumen() {
  kataKunciCari = "";
  filterKategoriId = "ALL";
  batasTampil = UKURAN_HALAMAN_DOKUMEN;
  const searchInput = document.getElementById("dokumen-search-input");
  const filterKatSelect = document.getElementById("dokumen-filter-kategori");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (filterKatSelect instanceof HTMLSelectElement) filterKatSelect.value = "ALL";
  renderDaftarDokumen();
}

function cariNamaKategoriFilterDokumen(katId) {
  if (katId === "__TANPA_KATEGORI__") return TANPA_KATEGORI_INFO.nama;
  const info = manajerKategoriDokumen.cariInfoKategori(katId);
  return info ? info.nama : "Kategori";
}

function perbaruiLencanaDanChipFilterDokumen() {
  const badge = document.getElementById("dokumen-filter-count-badge");
  const btnToggle = document.getElementById("dokumen-filter-toggle-btn");
  const chipsRow = document.getElementById("dokumen-filter-chips-row");
  const chipsList = document.getElementById("dokumen-filter-chips-list");
  const btnResetDesktop = document.getElementById("dokumen-filter-reset-desktop-btn");

  let jumlahFilterPanel = 0;
  const daftarChip = [];

  if (filterKategoriId !== "ALL") {
    jumlahFilterPanel += 1;
    daftarChip.push({
      key: "kategori",
      label: `Kategori: ${cariNamaKategoriFilterDokumen(filterKategoriId)}`
    });
  }
  if (kataKunciCari.trim() !== "") {
    daftarChip.push({
      key: "cari",
      label: `Cari: "${kataKunciCari.trim()}"`
    });
  }

  if (badge) {
    badge.textContent = String(jumlahFilterPanel);
    badge.hidden = jumlahFilterPanel === 0;
  }
  if (btnToggle) {
    btnToggle.classList.toggle("has-active-filter", jumlahFilterPanel > 0);
  }
  if (btnResetDesktop) {
    btnResetDesktop.hidden = jumlahFilterPanel === 0 && kataKunciCari.trim() === "";
  }

  if (chipsRow && chipsList) {
    if (daftarChip.length > 0) {
      chipsList.innerHTML = daftarChip
        .map(
          (chip) => `<button type="button" class="active-filter-chip" data-remove-dokumen-filter="${escapeHtml(chip.key)}" aria-label="Hapus filter ${escapeHtml(chip.label)}" title="Hapus filter ${escapeHtml(chip.label)}">
            <span class="active-filter-chip-text">${escapeHtml(chip.label)}</span>
            <span class="active-filter-chip-x" aria-hidden="true">&times;</span>
          </button>`
        )
        .join("");
      chipsRow.hidden = false;
    } else {
      chipsList.innerHTML = "";
      chipsRow.hidden = true;
    }
  }
}

function perbaruiDropdownKategoriDokumen() {
  const daftarKat = manajerKategoriDokumen.getDaftarKategori();

  const selectFilter = document.getElementById("dokumen-filter-kategori");
  if (selectFilter instanceof HTMLSelectElement) {
    const nilaiSebelumnya = filterKategoriId;
    selectFilter.innerHTML = [
      `<option value="ALL">Semua Kategori</option>`,
      ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`),
      `<option value="__TANPA_KATEGORI__">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`
    ].join("");

    const masihValid =
      nilaiSebelumnya === "ALL" ||
      nilaiSebelumnya === "__TANPA_KATEGORI__" ||
      daftarKat.some((k) => k.id === nilaiSebelumnya);
    filterKategoriId = masihValid ? nilaiSebelumnya : "ALL";
    selectFilter.value = filterKategoriId;
  }

  for (const idSelect of ["dokumen-upload-kategori", "dokumen-edit-kategori"]) {
    const sel = document.getElementById(idSelect);
    if (sel instanceof HTMLSelectElement) {
      const nilaiLama = sel.value;
      sel.innerHTML = [
        `<option value="">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`,
        ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`)
      ].join("");
      sel.value = daftarKat.some((k) => k.id === nilaiLama) ? nilaiLama : "";
    }
  }
}

function perbaruiDropdownKegiatanTerkait(idSelect, nilaiTerpilih = "") {
  const sel = document.getElementById(idSelect);
  if (!(sel instanceof HTMLSelectElement)) return;

  const kegiatanUrut = [...getDaftarKegiatan()].sort((a, b) =>
    String(b.tanggal || "").localeCompare(String(a.tanggal || ""))
  );

  const opsi = [
    `<option value="">— Tidak dikaitkan ke kegiatan —</option>`,
    ...kegiatanUrut.map((k) => {
      const tgl = k.tanggal ? `${k.tanggal} • ` : "";
      return `<option value="${escapeHtml(k.id)}">${escapeHtml(tgl + k.judul)}</option>`;
    })
  ];
  sel.innerHTML = opsi.join("");
  sel.value = kegiatanUrut.some((k) => k.id === nilaiTerpilih) ? nilaiTerpilih : "";
}

function ambilDokumenTersaringDanTerurut() {
  const q = kataKunciCari.trim().toLowerCase();

  const tersaring = daftarDokumen.filter((item) => {
    if (filterKategoriId !== "ALL") {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
      if (filterKategoriId === "__TANPA_KATEGORI__") {
        if (!infoKat.tetap) return false;
      } else if (infoKat.id !== filterKategoriId) {
        return false;
      }
    }

    if (q) {
      const namaTampil = (item.namaTampilan || item.namaFile || "").toLowerCase();
      const namaAsli = (item.namaFile || "").toLowerCase();
      const catatan = (item.catatan || "").toLowerCase();
      if (!namaTampil.includes(q) && !namaAsli.includes(q) && !catatan.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const pengali = arahUrutan === "asc" ? 1 : -1;

  tersaring.sort((a, b) => {
    if (urutBerdasarkan === "nama") {
      const nA = String(a.namaTampilan || a.namaFile || "");
      const nB = String(b.namaTampilan || b.namaFile || "");
      const cmp = nA.localeCompare(nB, "id", { sensitivity: "base" });
      if (cmp !== 0) return cmp * pengali;
    } else if (urutBerdasarkan === "ukuran") {
      const uA = Number(a.ukuran) || 0;
      const uB = Number(b.ukuran) || 0;
      if (uA !== uB) return (uA - uB) * pengali;
    } else {
      const tA = String(a.tanggalUnggah || a.createdAt || "");
      const tB = String(b.tanggalUnggah || b.createdAt || "");
      if (tA !== tB) return tA.localeCompare(tB) * pengali;
    }

    return String(a.namaTampilan || a.namaFile || "").localeCompare(
      String(b.namaTampilan || b.namaFile || ""),
      "id",
      { sensitivity: "base" }
    );
  });

  return tersaring;
}

function tutupMenuTitikTigaDokumen() {
  if (!idMenuTitikTigaTerbuka) return;
  idMenuTitikTigaTerbuka = null;
  document.querySelectorAll(".doc-kebab-popover:not([hidden])").forEach((el) => {
    el.setAttribute("hidden", "");
  });
  document.querySelectorAll(".doc-kebab-btn[aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function renderDaftarDokumen() {
  const region = document.getElementById("dokumen-list-region");
  const barFilter = document.getElementById("dokumen-active-filter-bar");
  const summaryEl = document.getElementById("dokumen-result-summary");
  perbaruiLencanaDanChipFilterDokumen();
  if (!region) return;

  idMenuTitikTigaTerbuka = null;

  if (!sudahDimuatPertamaKali) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat arsip dokumen"><div class="skeleton-card"><div class="skeleton-line skeleton-w-60"></div><div class="skeleton-line skeleton-w-40"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-w-70"></div><div class="skeleton-line skeleton-w-50"></div></div></div>`;
    return;
  }

  const adaFilter = kataKunciCari.trim() !== "" || filterKategoriId !== "ALL";
  const hasilSemua = ambilDokumenTersaringDanTerurut();
  const potong = hasilSemua.slice(0, batasTampil);
  const sisaBelumTampil = Math.max(0, hasilSemua.length - potong.length);

  if (barFilter && summaryEl) {
    if (adaFilter || daftarDokumen.length > 0) {
      barFilter.hidden = false;
      summaryEl.textContent = adaFilter
        ? `Menampilkan ${potong.length} dari ${hasilSemua.length} hasil cocok (total ${daftarDokumen.length} dokumen)`
        : hasilSemua.length > potong.length
          ? `Menampilkan ${potong.length} dari ${daftarDokumen.length} dokumen`
          : `Total ${daftarDokumen.length} dokumen tercatat`;
    } else {
      barFilter.hidden = true;
    }
  }

  if (daftarDokumen.length === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>', 24)}</div>
      <h3 class="empty-stage-title">Belum Ada Dokumen</h3>
      <p class="empty-stage-desc">Unggah berkas ke Google Drive dan kelompokkan rapi menurut kategori dengan menekan tombol <strong>Unggah Dokumen</strong> di atas.</p>
    </div>`;
    return;
  }

  if (hasilSemua.length === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <h3 class="empty-stage-title">Tidak Ada Dokumen yang Cocok</h3>
      <p class="empty-stage-desc">Tidak ditemukan dokumen yang sesuai dengan pencarian atau filter kategori yang aktif.</p>
    </div>`;
    return;
  }

  const barisHtml = potong
    .map((item) => {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
      const jenis = infoJenisBerkasMime(item.mimeType, item.namaFile);
      const namaUtama = item.namaTampilan || item.namaFile || "Dokumen Tanpa Nama";
      const tampilkanNamaFileAsli =
        item.namaFile && item.namaTampilan && item.namaFile.trim() !== item.namaTampilan.trim();
      const ukuranTeks = formatUkuranBerkas(item.ukuran);
      const tanggalTeks = formatTanggalDokumenLokal(item.tanggalUnggah || item.createdAt);
      const judulKegiatan = cariJudulKegiatanTerkait(item.kegiatanId);
      const tautanAman =
        item.tautan && /^https?:\/\//i.test(item.tautan)
          ? item.tautan
          : item.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
            : "#";

      return `<div class="doc-list-row" role="listitem" data-id="${escapeHtml(item.id)}">
        <div class="doc-col-name">
          <span class="doc-type-icon ${escapeHtml(jenis.kelasWarna)}" aria-hidden="true">${jenis.svg}</span>
          <div class="doc-title-block">
            <div class="doc-title-line">
              <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="doc-name-link" title="Buka ${escapeHtml(namaUtama)} di Google Drive">${escapeHtml(namaUtama)}</a>
              <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)} doc-badge-mobile-only">
                <span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>
                <span>${escapeHtml(infoKat.nama)}</span>
              </span>
            </div>
            ${tampilkanNamaFileAsli ? `<span class="doc-sub-filename">${escapeHtml(item.namaFile)}</span>` : ""}
            ${item.catatan ? `<p class="doc-sub-note">${escapeHtml(item.catatan)}</p>` : ""}
            <div class="doc-mobile-meta-line">
              <span>${escapeHtml(jenis.label)}</span>
              <span aria-hidden="true">•</span>
              <span>${escapeHtml(ukuranTeks)}</span>
              <span aria-hidden="true">•</span>
              <span>${escapeHtml(tanggalTeks)}</span>
              ${judulKegiatan ? `<span aria-hidden="true">•</span><span class="doc-mobile-kegiatan-ref">${escapeHtml(judulKegiatan)}</span>` : ""}
            </div>
          </div>
        </div>

        <div class="doc-col-cat">
          <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}">
            <span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>
            <span>${escapeHtml(infoKat.nama)}</span>
          </span>
        </div>

        <div class="doc-col-type">${escapeHtml(jenis.label)}</div>
        <div class="doc-col-size">${escapeHtml(ukuranTeks)}</div>
        <div class="doc-col-date">${escapeHtml(tanggalTeks)}</div>
        <div class="doc-col-activity">
          ${
            judulKegiatan
              ? `<span class="doc-activity-pill" title="${escapeHtml(judulKegiatan)}">${escapeHtml(judulKegiatan)}</span>`
              : `<span class="doc-muted-dash">—</span>`
          }
        </div>

        <div class="doc-col-actions">
          <div class="doc-desktop-actions">
            <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Buka di Drive" aria-label="Buka ${escapeHtml(namaUtama)} di Google Drive">
              ${svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 17)}
            </a>
            <button type="button" class="icon-btn" data-doc-action="edit" data-id="${escapeHtml(item.id)}" title="Ubah metadata" aria-label="Ubah metadata ${escapeHtml(namaUtama)}">
              ${svgIkon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 17)}
            </button>
            <button type="button" class="icon-btn doc-action-danger" data-doc-action="delete" data-id="${escapeHtml(item.id)}" title="Hapus dokumen" aria-label="Hapus ${escapeHtml(namaUtama)}">
              ${svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 17)}
            </button>
          </div>

          <div class="doc-mobile-kebab-wrap">
            <button
              type="button"
              class="icon-btn doc-kebab-btn"
              data-doc-action="toggle-menu"
              data-id="${escapeHtml(item.id)}"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Menu aksi untuk ${escapeHtml(namaUtama)}"
              title="Menu aksi"
            >
              ${svgIkon('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', 19)}
            </button>
            <div class="doc-kebab-popover" id="doc-menu-${escapeHtml(item.id)}" role="menu" hidden>
              <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="doc-kebab-item" role="menuitem">
                ${svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 16)}
                <span>Buka di Drive</span>
              </a>
              <button type="button" class="doc-kebab-item" role="menuitem" data-doc-action="edit" data-id="${escapeHtml(item.id)}">
                ${svgIkon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 16)}
                <span>Ubah metadata</span>
              </button>
              <button type="button" class="doc-kebab-item doc-kebab-item-danger" role="menuitem" data-doc-action="delete" data-id="${escapeHtml(item.id)}">
                ${svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16)}
                <span>Hapus</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const tombolMuatLebih =
    sisaBelumTampil > 0
      ? `<div class="doc-load-more-bar">
          <button type="button" id="btn-muat-lebih-dokumen" class="btn-secondary">
            Muat ${Math.min(UKURAN_HALAMAN_DOKUMEN, sisaBelumTampil)} dokumen berikutnya (${sisaBelumTampil} tersisa)
          </button>
        </div>`
      : "";

  region.innerHTML = `
    <div class="doc-list-surface">
      <div class="doc-list-header" aria-hidden="true">
        <div>Nama</div>
        <div>Kategori</div>
        <div>Jenis</div>
        <div>Ukuran</div>
        <div>Tanggal Unggah</div>
        <div>Kegiatan</div>
        <div class="doc-col-actions-head">Aksi</div>
      </div>
      <div class="doc-list-body" role="list">${barisHtml}</div>
    </div>
    ${tombolMuatLebih}
  `;
}

export function terapkanFilterKategoriDokumen(targetKategoriId) {
  kataKunciCari = "";
  filterKategoriId = targetKategoriId || "ALL";
  batasTampil = UKURAN_HALAMAN_DOKUMEN;
  aturBukaPanelFilterDokumen(false, false);

  const searchInput = document.getElementById("dokumen-search-input");
  const katSelect = document.getElementById("dokumen-filter-kategori");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategoriDokumen();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = filterKategoriId;

  pindahKeBagian("dokumen");
  renderDaftarDokumen();
}

// ============================================================================
// Modal 1: Unggah Dokumen Baru ke Google Drive
// ============================================================================

function setPesanGalatModalUnggah(pesan) {
  const box = document.getElementById("dokumen-upload-alert");
  const txt = document.getElementById("dokumen-upload-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function perbaruiTampilanProgresUnggah(sedangBerjalan, persen = 0, labelStatus = "") {
  const wrap = document.getElementById("dokumen-upload-progress-wrap");
  const barFill = document.getElementById("dokumen-upload-progress-fill");
  const pctEl = document.getElementById("dokumen-upload-progress-pct");
  const textEl = document.getElementById("dokumen-upload-progress-label");
  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  const fileInput = document.getElementById("dokumen-upload-file");

  if (wrap) wrap.hidden = !sedangBerjalan;
  if (barFill instanceof HTMLElement) barFill.style.width = `${Math.max(0, Math.min(100, persen))}%`;
  if (pctEl) pctEl.textContent = `${Math.max(0, Math.min(100, persen))}%`;
  if (textEl) textEl.textContent = labelStatus || "Mengunggah ke Google Drive...";
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = sedangBerjalan || !navigator.onLine;
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = sedangBerjalan;
}

export function bukaModalUnggahDokumen() {
  if (!navigator.onLine) {
    tampilkanGalatHalamanDokumen(
      "Tidak ada koneksi internet. Pengunggahan dokumen ke Google Drive memerlukan sambungan internet aktif.",
      "warning"
    );
    return;
  }

  const modal = document.getElementById("dokumen-upload-modal");
  const form = document.getElementById("dokumen-upload-form");
  const katSelect = document.getElementById("dokumen-upload-kategori");
  const fileInput = document.getElementById("dokumen-upload-file");
  const fileInfo = document.getElementById("dokumen-upload-file-info");
  if (!modal) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (form instanceof HTMLFormElement) form.reset();
  if (fileInfo) fileInfo.textContent = "Pilih berkas dari perangkat Anda.";
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  perbaruiDropdownKategoriDokumen();
  perbaruiDropdownKegiatanTerkait("dokumen-upload-kegiatan", "");

  // Bawaan: kategori yang sedang difilter di halaman Dokumen
  if (katSelect instanceof HTMLSelectElement) {
    const daftarKat = manajerKategoriDokumen.getDaftarKategori();
    if (filterKategoriId === "__TANPA_KATEGORI__") {
      katSelect.value = "";
    } else if (filterKategoriId !== "ALL" && daftarKat.some((k) => k.id === filterKategoriId)) {
      katSelect.value = filterKategoriId;
    } else {
      katSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
    }
  }

  unggahModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (fileInput instanceof HTMLElement) fileInput.focus();
  });
}

function tutupModalUnggahDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-upload-modal");
  if (!modal || !unggahModalTerbuka) return;

  if (pengendaliUnggahAktif) {
    pengendaliUnggahAktif.abort();
    pengendaliUnggahAktif = null;
  }

  unggahModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// ============================================================================
// Modal 2: Ubah Metadata Dokumen (+ Pindah Folder Kategori di Drive)
// ============================================================================

function setPesanGalatModalEdit(pesan) {
  const box = document.getElementById("dokumen-edit-alert");
  const txt = document.getElementById("dokumen-edit-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function bukaModalEditDokumen(item) {
  const modal = document.getElementById("dokumen-edit-modal");
  const idInput = document.getElementById("dokumen-edit-id");
  const namaInput = document.getElementById("dokumen-edit-nama");
  const fileAsliEl = document.getElementById("dokumen-edit-namafile-info");
  const katSelect = document.getElementById("dokumen-edit-kategori");
  const catatanInput = document.getElementById("dokumen-edit-catatan");
  if (!modal || !item) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setPesanGalatModalEdit("");
  perbaruiDropdownKategoriDokumen();
  perbaruiDropdownKegiatanTerkait("dokumen-edit-kegiatan", item.kegiatanId || "");

  if (idInput instanceof HTMLInputElement) idInput.value = item.id;
  if (namaInput instanceof HTMLInputElement) namaInput.value = item.namaTampilan || item.namaFile || "";
  if (fileAsliEl) {
    fileAsliEl.textContent = `${item.namaFile || "-"} (${formatUkuranBerkas(item.ukuran)})`;
  }
  if (katSelect instanceof HTMLSelectElement) {
    const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
    katSelect.value = infoKat.tetap ? "" : infoKat.id;
  }
  if (catatanInput instanceof HTMLTextAreaElement) {
    catatanInput.value = item.catatan || "";
  }

  editModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (namaInput instanceof HTMLElement) namaInput.focus();
  });
}

function tutupModalEditDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-edit-modal");
  if (!modal || !editModalTerbuka) return;
  editModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalEdit("");

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// ============================================================================
// Modal 3: Konfirmasi Hapus Dokumen (Aplikasi saja / juga Sampah Drive)
// ============================================================================

function setPesanGalatModalHapus(pesan) {
  const box = document.getElementById("dokumen-delete-alert");
  const txt = document.getElementById("dokumen-delete-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function bukaDialogHapusDokumen(item) {
  const modal = document.getElementById("dokumen-delete-modal");
  const desc = document.getElementById("dokumen-delete-desc");
  const radioAppOnly = document.getElementById("dokumen-delete-mode-app");
  const radioDrive = document.getElementById("dokumen-delete-mode-drive");
  const cancelBtn = document.getElementById("dokumen-delete-cancel-btn");
  if (!modal || !item) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dokumenAkanDihapus = item;
  setPesanGalatModalHapus("");

  const label = item.namaTampilan || item.namaFile || "dokumen ini";
  if (desc) {
    desc.textContent = `Pilih cara menghapus "${label}" (${formatUkuranBerkas(item.ukuran)}):`;
  }
  if (radioAppOnly instanceof HTMLInputElement) {
    radioAppOnly.checked = true;
  }
  if (radioDrive instanceof HTMLInputElement) {
    radioDrive.disabled = !navigator.onLine;
  }

  hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-delete-modal");
  if (!modal || !hapusModalTerbuka) return;
  hapusModalTerbuka = false;
  dokumenAkanDihapus = null;
  modal.hidden = true;
  setPesanGalatModalHapus("");

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// ============================================================================
// Modal 4: Rapikan Dokumen ke Folder Kategori (Idempotent + Rate-Limited)
// ============================================================================

function jedaMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bukaModalRapikanDokumen() {
  const modal = document.getElementById("dokumen-organize-modal");
  const countInfo = document.getElementById("dokumen-organize-total-info");
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const closeBtn = document.getElementById("dokumen-organize-cancel-btn");
  if (!modal) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sedangMerapikan = false;
  batalkanRapikan = false;

  if (countInfo) {
    countInfo.textContent = `Terdapat ${daftarDokumen.length} dokumen tercatat yang akan diperiksa penempatan foldernya.`;
  }
  if (progressBox) progressBox.hidden = true;
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
  if (alertBox) alertBox.hidden = true;
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.hidden = false;
    startBtn.disabled = daftarDokumen.length === 0 || !navigator.onLine;
    startBtn.textContent = "Mulai Rapikan";
  }
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.textContent = "Tutup";
  }

  rapikanModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (startBtn && !startBtn.disabled) startBtn.focus();
    else if (closeBtn instanceof HTMLElement) closeBtn.focus();
  });
}

function tutupModalRapikanDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-organize-modal");
  if (!modal || !rapikanModalTerbuka) return;
  if (sedangMerapikan) {
    batalkanRapikan = true;
    return;
  }
  rapikanModalTerbuka = false;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

async function jalankanRapikanDokumenKeFolder() {
  if (sedangMerapikan) return;
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const progressFill = document.getElementById("dokumen-organize-progress-fill");
  const progressText = document.getElementById("dokumen-organize-progress-text");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const alertText = document.getElementById("dokumen-organize-alert-text");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const cancelBtn = document.getElementById("dokumen-organize-cancel-btn");

  const daftar = getDaftarDokumen();
  const total = daftar.length;
  if (total === 0) return;

  sedangMerapikan = true;
  batalkanRapikan = false;

  if (alertBox) alertBox.hidden = true;
  if (summaryBox) summaryBox.hidden = true;
  if (progressBox) progressBox.hidden = false;
  if (startBtn instanceof HTMLButtonElement) startBtn.disabled = true;
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.textContent = "Hentikan";

  const cacheFolderTujuan = new Map();
  let berhasilDipindah = 0;
  let dilewatiSudahSesuai = 0;
  let gagalDipindah = 0;
  let pesanGagalTerakhir = "";

  try {
    for (let i = 0; i < total; i += 1) {
      if (batalkanRapikan) break;

      const ke = i + 1;
      const persen = Math.round((ke / total) * 100);
      if (progressFill instanceof HTMLElement) progressFill.style.width = `${persen}%`;
      if (progressText) progressText.textContent = `${ke} dari ${total}`;

      const dok = daftar[i];
      if (!dok.driveFileId) {
        gagalDipindah += 1;
        continue;
      }

      const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
      const kunciFolder = infoKat.tetap ? "__TANPA_KATEGORI__" : infoKat.id;

      try {
        let folderTujuanId = cacheFolderTujuan.get(kunciFolder);
        if (!folderTujuanId) {
          folderTujuanId = await pastikanFolderTujuanKategoriSiap(infoKat.tetap ? "" : infoKat.id);
          cacheFolderTujuan.set(kunciFolder, folderTujuanId);
        }

        const hasil = await pindahkanBerkasKeFolderDrive(dok.driveFileId, folderTujuanId);
        if (hasil.status === "moved") {
          berhasilDipindah += 1;
        } else {
          dilewatiSudahSesuai += 1;
        }
      } catch (err) {
        gagalDipindah += 1;
        pesanGagalTerakhir = formatPesanGalatDrive(err);
        if (err && (err.isUnauthorized || err.isTokenExpired)) {
          break;
        }
      }

      if (i < total - 1 && !batalkanRapikan) {
        await jedaMs(JEDA_RAPIKAN_MS);
      }
    }

    if (summaryBox) {
      summaryBox.hidden = false;
      summaryBox.innerHTML = `
        <div class="organize-summary-grid">
          <div class="organize-stat-item">
            <span class="organize-stat-value">${berhasilDipindah}</span>
            <span class="organize-stat-label">Dipindahkan</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${dilewatiSudahSesuai}</span>
            <span class="organize-stat-label">Dilewati (sudah di foldernya)</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${gagalDipindah}</span>
            <span class="organize-stat-label">Gagal</span>
          </div>
        </div>
        ${batalkanRapikan ? `<p class="organize-note-muted">Proses dihentikan sebelum seluruh dokumen selesai diperiksa.</p>` : ""}
      `;
    }

    if (gagalDipindah > 0 && alertBox && alertText) {
      alertText.textContent = pesanGagalTerakhir || "Sebagian dokumen tidak dapat dipindahkan.";
      alertBox.hidden = false;
    }
  } catch (errFatal) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatDrive(errFatal);
      alertBox.hidden = false;
    }
  } finally {
    sedangMerapikan = false;
    batalkanRapikan = false;
    if (startBtn instanceof HTMLButtonElement) {
      startBtn.disabled = !navigator.onLine;
      startBtn.textContent = "Jalankan Lagi";
    }
    if (cancelBtn instanceof HTMLButtonElement) {
      cancelBtn.textContent = "Tutup";
    }
  }
}

// ============================================================================
// Inisialisasi Antarmuka & Langganan Firestore
// ============================================================================

export function initHalamanDokumen() {
  pastikanKerangkaHalamanDokumen();
  perbaruiStatusJaringanDokumen();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  dialogKelolaKategoriDokCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriDokumen,
    hitungPemakaiLokal: hitungDokumenPemakaiLokal,
    onLihatItemKategori: (katId) => terapkanFilterKategoriDokumen(katId),
    judulDialog: "Kelola Kategori Dokumen",
    opsiDrive: buatOpsiDriveKategoriDokumen()
  });

  manajerKategoriDokumen.onChange(() => {
    perbaruiDropdownKategoriDokumen();
    renderDaftarDokumen();
    beritahuPerubahanDokumen();
  });

  onPerubahanKegiatan(() => {
    renderDaftarDokumen();
  });

  document.getElementById("btn-kelola-kategori-dokumen")?.addEventListener("click", () => {
    dialogKelolaKategoriDokCtrl?.buka();
  });

  document.getElementById("btn-unggah-dokumen")?.addEventListener("click", () => {
    bukaModalUnggahDokumen();
  });

  document.getElementById("btn-rapikan-dokumen-drive")?.addEventListener("click", () => {
    bukaModalRapikanDokumen();
  });

  const searchInput = document.getElementById("dokumen-search-input");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener("input", () => {
      kataKunciCari = searchInput.value;
      batasTampil = UKURAN_HALAMAN_DOKUMEN;
      renderDaftarDokumen();
    });
  }

  const filterKatSelect = document.getElementById("dokumen-filter-kategori");
  if (filterKatSelect instanceof HTMLSelectElement) {
    filterKatSelect.addEventListener("change", () => {
      filterKategoriId = filterKatSelect.value;
      batasTampil = UKURAN_HALAMAN_DOKUMEN;
      renderDaftarDokumen();
    });
  }

  const sortFieldSelect = document.getElementById("dokumen-sort-field");
  if (sortFieldSelect instanceof HTMLSelectElement) {
    sortFieldSelect.addEventListener("change", () => {
      const val = sortFieldSelect.value;
      urutBerdasarkan = val === "nama" || val === "ukuran" ? val : "tanggal";
      renderDaftarDokumen();
    });
  }

  const sortDirSelect = document.getElementById("dokumen-sort-dir");
  if (sortDirSelect instanceof HTMLSelectElement) {
    sortDirSelect.addEventListener("change", () => {
      arahUrutan = sortDirSelect.value === "asc" ? "asc" : "desc";
      renderDaftarDokumen();
    });
  }

  // Tombol buka/tutup panel filter & aksi lembar bawah HP
  document.getElementById("dokumen-filter-toggle-btn")?.addEventListener("click", () => {
    aturBukaPanelFilterDokumen(!panelFilterTerbuka, false);
  });
  document.getElementById("dokumen-filter-done-btn")?.addEventListener("click", () => {
    aturBukaPanelFilterDokumen(false, true);
  });
  document.getElementById("dokumen-filter-apply-sheet-btn")?.addEventListener("click", () => {
    aturBukaPanelFilterDokumen(false, true);
  });
  document.getElementById("dokumen-filter-sheet-close-btn")?.addEventListener("click", () => {
    aturBukaPanelFilterDokumen(false, true);
  });
  document.getElementById("dokumen-filter-scrim")?.addEventListener("click", () => {
    aturBukaPanelFilterDokumen(false, true);
  });
  document.getElementById("dokumen-filter-reset-desktop-btn")?.addEventListener("click", () => {
    aturUlangSemuaFilterDokumen();
  });
  document.getElementById("dokumen-filter-reset-sheet-btn")?.addEventListener("click", () => {
    aturUlangSemuaFilterDokumen();
  });
  document.getElementById("btn-reset-filter-dokumen")?.addEventListener("click", () => {
    aturUlangSemuaFilterDokumen();
  });

  // Hapus chip filter satu per satu
  document.getElementById("dokumen-filter-chips-list")?.addEventListener("click", (e) => {
    const chipBtn = e.target instanceof Element ? e.target.closest("button[data-remove-dokumen-filter]") : null;
    if (!chipBtn) return;
    const kunci = chipBtn.getAttribute("data-remove-dokumen-filter");
    if (kunci === "kategori") {
      filterKategoriId = "ALL";
      batasTampil = UKURAN_HALAMAN_DOKUMEN;
      if (filterKatSelect instanceof HTMLSelectElement) filterKatSelect.value = "ALL";
    } else if (kunci === "cari") {
      kataKunciCari = "";
      batasTampil = UKURAN_HALAMAN_DOKUMEN;
      if (searchInput instanceof HTMLInputElement) searchInput.value = "";
    }
    renderDaftarDokumen();
  });

  // Delegasi klik pada daftar dokumen (muat bertahap, menu titik tiga, ubah, hapus)
  const listRegion = document.getElementById("dokumen-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("#btn-muat-lebih-dokumen")) {
        batasTampil += UKURAN_HALAMAN_DOKUMEN;
        renderDaftarDokumen();
        return;
      }

      const btnAksi = target.closest("button[data-doc-action]");
      if (!btnAksi) return;

      const aksi = btnAksi.getAttribute("data-doc-action");
      const id = btnAksi.getAttribute("data-id") || "";

      if (aksi === "toggle-menu") {
        e.stopPropagation();
        const menuEl = document.getElementById(`doc-menu-${id}`);
        if (!menuEl) return;
        const sedangBuka = idMenuTitikTigaTerbuka === id && !menuEl.hidden;
        tutupMenuTitikTigaDokumen();
        if (!sedangBuka) {
          idMenuTitikTigaTerbuka = id;
          menuEl.hidden = false;
          btnAksi.setAttribute("aria-expanded", "true");
        }
        return;
      }

      tutupMenuTitikTigaDokumen();
      const dok = daftarDokumen.find((d) => d.id === id);
      if (!dok) return;

      if (aksi === "edit") {
        bukaModalEditDokumen(dok);
      } else if (aksi === "delete") {
        bukaDialogHapusDokumen(dok);
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!idMenuTitikTigaTerbuka) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(".doc-mobile-kebab-wrap")) return;
    tutupMenuTitikTigaDokumen();
  });

  // Event formulir Unggah Dokumen
  const uploadModal = document.getElementById("dokumen-upload-modal");
  const uploadForm = document.getElementById("dokumen-upload-form");
  const uploadFileInput = document.getElementById("dokumen-upload-file");
  const uploadFileInfo = document.getElementById("dokumen-upload-file-info");

  if (uploadFileInput instanceof HTMLInputElement && uploadFileInfo) {
    uploadFileInput.addEventListener("change", () => {
      const f = uploadFileInput.files && uploadFileInput.files[0];
      uploadFileInfo.textContent = f
        ? `${f.name} • ${formatUkuranBerkas(f.size)}`
        : "Pilih berkas dari perangkat Anda.";
    });
  }

  document.getElementById("dokumen-upload-close-btn")?.addEventListener("click", () => {
    tutupModalUnggahDokumen(true);
  });
  document.getElementById("dokumen-upload-cancel-btn")?.addEventListener("click", () => {
    if (pengendaliUnggahAktif) {
      pengendaliUnggahAktif.abort();
      pengendaliUnggahAktif = null;
      perbaruiTampilanProgresUnggah(false, 0, "");
      setPesanGalatModalUnggah("Pengunggahan dibatalkan.");
      return;
    }
    tutupModalUnggahDokumen(true);
  });
  uploadModal?.addEventListener("click", (e) => {
    if (e.target === uploadModal && !pengendaliUnggahAktif) {
      tutupModalUnggahDokumen(true);
    }
  });

  uploadForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPesanGalatModalUnggah("");

    if (!navigator.onLine) {
      setPesanGalatModalUnggah("Tidak ada koneksi internet. Pengunggahan ke Google Drive memerlukan sambungan aktif.");
      return;
    }

    const file = uploadFileInput instanceof HTMLInputElement && uploadFileInput.files ? uploadFileInput.files[0] : null;
    if (!file) {
      setPesanGalatModalUnggah("Pilih berkas dokumen yang akan diunggah terlebih dahulu.");
      return;
    }

    const kategoriId = String(document.getElementById("dokumen-upload-kategori")?.value || "").trim();
    const namaTampilanInput = String(document.getElementById("dokumen-upload-nama")?.value || "").trim();
    const catatan = String(document.getElementById("dokumen-upload-catatan")?.value || "").trim();
    const kegiatanId = String(document.getElementById("dokumen-upload-kegiatan")?.value || "").trim();
    const cancelBtn = document.getElementById("dokumen-upload-cancel-btn");

    perbaruiTampilanProgresUnggah(true, 0, "Menyiapkan folder kategori di Google Drive...");
    if (cancelBtn) cancelBtn.textContent = "Batalkan Unggah";

    try {
      const folderTujuanId = await pastikanFolderTujuanKategoriSiap(kategoriId);

      perbaruiTampilanProgresUnggah(true, 2, "Mengunggah berkas ke Google Drive...");
      const tugasUnggah = unggahBerkasMultipartKeDrive({
        file,
        folderId: folderTujuanId,
        namaSimpanDrive: file.name,
        onProgress: (persen) => {
          perbaruiTampilanProgresUnggah(true, persen, "Mengunggah berkas ke Google Drive...");
        }
      });
      pengendaliUnggahAktif = tugasUnggah;

      const hasilDrive = await tugasUnggah.promise;
      pengendaliUnggahAktif = null;

      perbaruiTampilanProgresUnggah(true, 100, "Menyimpan catatan dokumen...");
      const sekarangIso = new Date().toISOString();
      const namaTampilanFinal = namaTampilanInput || hasilDrive.name || file.name;

      const db = getFirestoreDb();
      await addDoc(collection(db, "dokumen"), {
        namaTampilan: namaTampilanFinal,
        namaFile: hasilDrive.name || file.name,
        driveFileId: hasilDrive.id,
        tautan: hasilDrive.webViewLink,
        mimeType: hasilDrive.mimeType || file.type || "application/octet-stream",
        ukuran: Number.isFinite(Number(hasilDrive.size)) ? Number(hasilDrive.size) : file.size,
        kategoriId,
        kegiatanId,
        catatan,
        tanggalUnggah: sekarangIso,
        createdAt: sekarangIso,
        updatedAt: sekarangIso
      });

      if (cancelBtn) cancelBtn.textContent = "Batal";
      tutupModalUnggahDokumen(true);
    } catch (err) {
      pengendaliUnggahAktif = null;
      perbaruiTampilanProgresUnggah(false, 0, "");
      if (cancelBtn) cancelBtn.textContent = "Batal";
      if (err && err.isAborted) {
        setPesanGalatModalUnggah("Pengunggahan dokumen telah dibatalkan.");
      } else {
        setPesanGalatModalUnggah(formatPesanGalatDrive(err));
      }
    }
  });

  // Event formulir Ubah Metadata Dokumen
  const editModal = document.getElementById("dokumen-edit-modal");
  const editForm = document.getElementById("dokumen-edit-form");
  const editSubmitBtn = document.getElementById("dokumen-edit-submit-btn");

  document.getElementById("dokumen-edit-close-btn")?.addEventListener("click", () => {
    tutupModalEditDokumen(true);
  });
  document.getElementById("dokumen-edit-cancel-btn")?.addEventListener("click", () => {
    tutupModalEditDokumen(true);
  });
  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) tutupModalEditDokumen(true);
  });

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPesanGalatModalEdit("");

    const idDok = String(document.getElementById("dokumen-edit-id")?.value || "").trim();
    const dokLama = daftarDokumen.find((d) => d.id === idDok);
    if (!dokLama) {
      tutupModalEditDokumen(true);
      return;
    }

    const namaTampilanBaru = String(document.getElementById("dokumen-edit-nama")?.value || "").trim();
    const kategoriIdBaru = String(document.getElementById("dokumen-edit-kategori")?.value || "").trim();
    const catatanBaru = String(document.getElementById("dokumen-edit-catatan")?.value || "").trim();
    const kegiatanIdBaru = String(document.getElementById("dokumen-edit-kegiatan")?.value || "").trim();

    if (!namaTampilanBaru) {
      setPesanGalatModalEdit("Nama tampilan dokumen wajib diisi.");
      return;
    }

    const infoKatLama = manajerKategoriDokumen.cariInfoKategori(dokLama.kategoriId);
    const infoKatBaru = manajerKategoriDokumen.cariInfoKategori(kategoriIdBaru);
    const idEfektifLama = infoKatLama.tetap ? "" : infoKatLama.id;
    const idEfektifBaru = infoKatBaru.tetap ? "" : infoKatBaru.id;
    const pindahKategori = idEfektifLama !== idEfektifBaru;

    if (pindahKategori && !navigator.onLine) {
      setPesanGalatModalEdit(
        "Tidak dapat memindahkan kategori dokumen saat luring karena berkas di Google Drive harus ikut dipindahkan ke folder kategori tujuan."
      );
      return;
    }

    if (editSubmitBtn instanceof HTMLButtonElement) {
      editSubmitBtn.disabled = true;
      editSubmitBtn.textContent = pindahKategori ? "Memindahkan di Drive..." : "Menyimpan...";
    }

    try {
      // Sesuai aturan Fase 3: Pindah kategori memindahkan file di Drive terlebih dahulu.
      // Jika Drive gagal, JANGAN ubah Firestore dan tampilkan pesan jelas.
      if (pindahKategori && dokLama.driveFileId) {
        const folderTujuanId = await pastikanFolderTujuanKategoriSiap(idEfektifBaru);
        await pindahkanBerkasKeFolderDrive(dokLama.driveFileId, folderTujuanId);
      }

      const db = getFirestoreDb();
      await updateDoc(doc(db, "dokumen", dokLama.id), {
        namaTampilan: namaTampilanBaru,
        kategoriId: idEfektifBaru,
        catatan: catatanBaru,
        kegiatanId: kegiatanIdBaru,
        updatedAt: new Date().toISOString()
      });

      tutupModalEditDokumen(true);
    } catch (err) {
      setPesanGalatModalEdit(formatPesanGalatDrive(err));
    } finally {
      if (editSubmitBtn instanceof HTMLButtonElement) {
        editSubmitBtn.disabled = false;
        editSubmitBtn.textContent = "Simpan Perubahan";
      }
    }
  });

  // Event Dialog Hapus Dokumen
  const deleteModal = document.getElementById("dokumen-delete-modal");
  const deleteConfirmBtn = document.getElementById("dokumen-delete-confirm-btn");

  document.getElementById("dokumen-delete-cancel-btn")?.addEventListener("click", () => {
    tutupDialogHapusDokumen(true);
  });
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) tutupDialogHapusDokumen(true);
  });

  deleteConfirmBtn?.addEventListener("click", async () => {
    if (!dokumenAkanDihapus) return;
    const target = dokumenAkanDihapus;
    const radioTrashDrive = document.getElementById("dokumen-delete-mode-drive");
    const buangKeSampahDrive = radioTrashDrive instanceof HTMLInputElement && radioTrashDrive.checked;

    setPesanGalatModalHapus("");
    if (deleteConfirmBtn instanceof HTMLButtonElement) {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = "Menghapus...";
    }

    try {
      if (buangKeSampahDrive && target.driveFileId) {
        if (!navigator.onLine) {
          throw new Error("Tidak ada koneksi internet untuk memindahkan berkas ke Sampah Drive. Pilih \"Hapus dari daftar aplikasi saja\".");
        }
        try {
          await pindahkanItemKeSampahDrive(target.driveFileId);
        } catch (errDrive) {
          // Jika berkas memang sudah tidak ada di Drive (404), tetap izinkan hapus dari aplikasi
          if (!errDrive || !errDrive.isNotFound) {
            throw errDrive;
          }
        }
      }

      const db = getFirestoreDb();
      await deleteDoc(doc(db, "dokumen", target.id));
      tutupDialogHapusDokumen(false);
    } catch (err) {
      setPesanGalatModalHapus(formatPesanGalatDrive(err));
    } finally {
      if (deleteConfirmBtn instanceof HTMLButtonElement) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = "Hapus Dokumen";
      }
    }
  });

  // Event Modal Rapikan Dokumen
  const organizeModal = document.getElementById("dokumen-organize-modal");
  document.getElementById("dokumen-organize-close-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-cancel-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-start-btn")?.addEventListener("click", () => {
    jalankanRapikanDokumenKeFolder();
  });
  organizeModal?.addEventListener("click", (e) => {
    if (e.target === organizeModal && !sedangMerapikan) {
      tutupModalRapikanDokumen(true);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (idMenuTitikTigaTerbuka) {
      e.preventDefault();
      tutupMenuTitikTigaDokumen();
    } else if (hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusDokumen(true);
    } else if (editModalTerbuka) {
      e.preventDefault();
      tutupModalEditDokumen(true);
    } else if (unggahModalTerbuka && !pengendaliUnggahAktif) {
      e.preventDefault();
      tutupModalUnggahDokumen(true);
    } else if (rapikanModalTerbuka && !sedangMerapikan) {
      e.preventDefault();
      tutupModalRapikanDokumen(true);
    } else if (panelFilterTerbuka && !document.getElementById("section-dokumen")?.hidden) {
      const adaDialogTerbuka = document.querySelector(".modal-overlay:not([hidden])");
      if (!adaDialogTerbuka && document.documentElement.getAttribute("data-drawer") !== "open") {
        e.preventDefault();
        aturBukaPanelFilterDokumen(false, true);
      }
    }
  });

  window.addEventListener("online", perbaruiStatusJaringanDokumen);
  window.addEventListener("offline", perbaruiStatusJaringanDokumen);
}

export function subscribeDokumen() {
  unsubscribeDokumen();
  initHalamanDokumen();
  sudahDimuatPertamaKali = false;
  renderDaftarDokumen();
  beritahuPerubahanDokumen();

  manajerKategoriDokumen.subscribe(
    () => {
      perbaruiDropdownKategoriDokumen();
      renderDaftarDokumen();
      beritahuPerubahanDokumen();
    },
    (pesanGalat) => tampilkanGalatHalamanDokumen(pesanGalat)
  );

  const db = getFirestoreDb();
  const kolDokumen = collection(db, "dokumen");

  unsubscribeSnapshotDokumen = onSnapshot(
    kolDokumen,
    (snapshot) => {
      const daftarBaru = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        daftarBaru.push({
          id: docSnap.id,
          namaTampilan: String(d.namaTampilan || d.namaFile || ""),
          namaFile: String(d.namaFile || ""),
          driveFileId: String(d.driveFileId || ""),
          tautan: String(d.tautan || ""),
          mimeType: String(d.mimeType || "application/octet-stream"),
          ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
          kategoriId: String(d.kategoriId || ""),
          kegiatanId: String(d.kegiatanId || ""),
          catatan: String(d.catatan || ""),
          tanggalUnggah: String(d.tanggalUnggah || d.createdAt || ""),
          createdAt: String(d.createdAt || ""),
          updatedAt: String(d.updatedAt || "")
        });
      });

      daftarDokumen = daftarBaru;
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanDokumen("");
      renderDaftarDokumen();
      dialogKelolaKategoriDokCtrl?.segarkanTampilan();
      beritahuPerubahanDokumen();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanDokumen(formatPesanGalatFirestore(err));
      renderDaftarDokumen();
      beritahuPerubahanDokumen();
    }
  );

  return () => unsubscribeDokumen();
}

export function unsubscribeDokumen() {
  if (typeof unsubscribeSnapshotDokumen === "function") {
    try {
      unsubscribeSnapshotDokumen();
    } catch (_e) {
      // Abaikan
    }
    unsubscribeSnapshotDokumen = null;
  }

  manajerKategoriDokumen.unsubscribe();
  resetCacheDrive();
  daftarDokumen = [];
  sudahDimuatPertamaKali = false;

  aturBukaPanelFilterDokumen(false, false);
  tutupMenuTitikTigaDokumen();
  tutupModalUnggahDokumen(false);
  tutupModalEditDokumen(false);
  tutupDialogHapusDokumen(false);
  if (rapikanModalTerbuka) {
    sedangMerapikan = false;
    batalkanRapikan = true;
    tutupModalRapikanDokumen(false);
  }
  dialogKelolaKategoriDokCtrl?.tutup(false);
  beritahuPerubahanDokumen();
}
