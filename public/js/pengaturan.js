/**
 * Modul Halaman Pengaturan, Cadangan (Ekspor & Impor JSON), Sinkronisasi Folder Drive,
 * Status Akun, dan Pembaruan Aplikasi (Fase 6)
 * Mematuhi seluruh Aturan Kode (#2, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14):
 * - B1. Tema: memakai tombol .theme-choice-btn[data-theme-choice] dan tema.js sebagai satu-satunya
 *   sumber logika tema tanpa duplikasi.
 * - B2. Status akun: email masuk, status izin Drive (berlaku/kedaluwarsa), tombol "Masuk ulang untuk memperbarui izin Drive"
 *   (dengan pesan ramah bila offline).
 * - B3. Sinkronisasi folder: menghitung kategoriDokumen yang belum sinkron dan tombol "Sinkronkan semua folder".
 * - B4. Informasi aplikasi: membaca VERSION dari /sw.js dan tombol "Periksa pembaruan" untuk Service Worker.
 * - C1. Ekspor JSON seluruh 6 koleksi (kegiatan, kategoriKegiatan, dokumen, kategoriDokumen, catatan, laporan metadata)
 *   disertai namaKategori di samping kategoriId, nama berkas memakai hariIni().
 * - C2. Impor JSON dengan pratinjau jumlah data per koleksi, pilihan "Lewati yang sudah ada" atau "Timpa",
 *   konfirmasi eksplisit, writeBatch maksimal 500 operasi per batch, progres, dan ringkasan.
 * - C3. Peringatan jelas bahwa berkas asli di Google Drive tidak ikut diekspor, hanya metadatanya.
 */
import { KUNCI_STORAGE_CADANGAN_TERAKHIR, KUNCI_STORAGE_CADANGAN_INTERVAL, KUNCI_STORAGE_CADANGAN_TUNDA, KUNCI_STORAGE_HARI_LIBUR, VERSI_CADANGAN_SW, BATAS_OPERASI_BATCH, KOLEKSI, DOK_PENGATURAN } from "./config/constants.js";
export { KUNCI_STORAGE_CADANGAN_TERAKHIR, KUNCI_STORAGE_CADANGAN_INTERVAL, KUNCI_STORAGE_CADANGAN_TUNDA, KUNCI_STORAGE_HARI_LIBUR };
import {
  getFirestoreDb,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  formatPesanGalatFirestore
} from "./firebase-config.js";
import {
  getCurrentUser,
  isDriveTokenExpired,
  loginWithGoogle,
  formatPesanGalatAuth
} from "./auth.js";
import { getPreferensiTema, terapkanTema } from "./tema.js";
import { hariIni, parseTanggal, tanggalLokal, tambahHari } from "./util-tanggal.js";
import { formatTanggalLengkapIndonesia } from "./jadwal.js";
import { escapeHtml, tampilkanToast } from "./sidebar.js";
import {
  DATA_HARI_LIBUR_BAWAAN,
  HARI_BESAR_TETAP,
  kunciEntri,
  setelKonfigurasi,
  ambilKonfigurasiAktif
} from "./hari-libur.js";

const pemberitahuHariLibur = new Set();
export function onPerubahanHariLibur(fn) {
  if (typeof fn === "function") {
    pemberitahuHariLibur.add(fn);
    return () => pemberitahuHariLibur.delete(fn);
  }
  return () => {};
}

function beritahuPerubahanHariLibur(cfg) {
  pemberitahuHariLibur.forEach((fn) => {
    try { fn(cfg); } catch (_e) {}
  });
}

export function bacaPengaturanHariLiburLokal() {
  try {
    const raw = localStorage.getItem(KUNCI_STORAGE_HARI_LIBUR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setelKonfigurasi(parsed);
        return ambilKonfigurasiAktif();
      }
    }
  } catch (_e) {}
  return ambilKonfigurasiAktif();
}

export async function muatPengaturanHariLibur() {
  bacaPengaturanHariLiburLokal();
  try {
    const db = getFirestoreDb();
    const docRef = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const cfg = {
        entri: Array.isArray(data.entri) ? data.entri : [],
        disembunyikan: Array.isArray(data.disembunyikan) ? data.disembunyikan : [],
        tampilkanCutiMerah: typeof data.tampilkanCutiMerah === "boolean" ? data.tampilkanCutiMerah : true,
        tampilkanHariBesar: typeof data.tampilkanHariBesar === "boolean" ? data.tampilkanHariBesar : true,
        updatedAt: data.updatedAt || new Date().toISOString()
      };
      setelKonfigurasi(cfg);
      try {
        localStorage.setItem(KUNCI_STORAGE_HARI_LIBUR, JSON.stringify(cfg));
      } catch (_e) {}
      beritahuPerubahanHariLibur(cfg);
      return cfg;
    }
  } catch (_err) {
    // Mode offline: tetap menggunakan data lokal
  }
  return ambilKonfigurasiAktif();
}

export async function simpanPengaturanHariLibur(cfgBaru) {
  const sekarangIso = new Date().toISOString();
  const cfg = {
    entri: Array.isArray(cfgBaru.entri) ? cfgBaru.entri : [],
    disembunyikan: Array.isArray(cfgBaru.disembunyikan) ? cfgBaru.disembunyikan : [],
    tampilkanCutiMerah: typeof cfgBaru.tampilkanCutiMerah === "boolean" ? cfgBaru.tampilkanCutiMerah : true,
    tampilkanHariBesar: typeof cfgBaru.tampilkanHariBesar === "boolean" ? cfgBaru.tampilkanHariBesar : true,
    updatedAt: sekarangIso
  };

  setelKonfigurasi(cfg);
  try {
    localStorage.setItem(KUNCI_STORAGE_HARI_LIBUR, JSON.stringify(cfg));
  } catch (_e) {}

  beritahuPerubahanHariLibur(cfg);
  renderDaftarHariLiburPengaturan();

  try {
    const db = getFirestoreDb();
    await setDoc(doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR), cfg, { merge: true });
  } catch (err) {
    console.warn("Gagal menyimpan ke Firestore pengaturan/hariLibur:", err);
  }
  return cfg;
}

export function ambilKonfigurasiHariLiburUntukCadangan() {
  return ambilKonfigurasiAktif();
}

const statusCadangan = {
  terakhirEksporAt: null,
  intervalHari: 14,
  sudahDimuat: false
};
const pemberitahuCadangan = new Set();

export function onPerubahanCadangan(fn) {
  if (typeof fn === "function") {
    pemberitahuCadangan.add(fn);
    return () => pemberitahuCadangan.delete(fn);
  }
  return () => {};
}

export function getStatusCadangan() {
  if (!statusCadangan.sudahDimuat) {
    try {
      const tersimpan = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
      if (tersimpan) statusCadangan.terakhirEksporAt = tersimpan;
      const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
      if (inv !== null && !Number.isNaN(Number(inv))) {
        statusCadangan.intervalHari = Number(inv);
      }
    } catch (_e) {}
  }
  return { ...statusCadangan };
}

export function hitungSelisihHariCadangan(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const tglTerakhirStr = tanggalLokal(d);
  const tglSekarangStr = hariIni();
  const p1 = parseTanggal(tglTerakhirStr);
  const p2 = parseTanggal(tglSekarangStr);
  if (!p1 || !p2) return null;
  const utc1 = Date.UTC(p1.getFullYear(), p1.getMonth(), p1.getDate());
  const utc2 = Date.UTC(p2.getFullYear(), p2.getMonth(), p2.getDate());
  const msPerHari = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((utc2 - utc1) / msPerHari));
}

export async function muatPengaturanCadangan() {
  let terakhir = null;
  let interval = 14;

  try {
    const t = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
    if (t) terakhir = t;
    const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
    if (inv !== null && !Number.isNaN(Number(inv))) {
      interval = Number(inv);
    }
  } catch (_e) {}

  try {
    const db = getFirestoreDb();
    const docRef = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.CADANGAN);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.terakhirEksporAt) {
        terakhir = String(data.terakhirEksporAt);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_TERAKHIR, terakhir);
        } catch (_e2) {}
      }
      if (data.intervalHari !== undefined && Number.isFinite(Number(data.intervalHari))) {
        interval = Number(data.intervalHari);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(interval));
        } catch (_e3) {}
      }
    }
  } catch (_err) {
    // Offline: tetap gunakan salinan lokal dari localStorage
  }

  statusCadangan.terakhirEksporAt = terakhir;
  statusCadangan.intervalHari = interval;
  statusCadangan.sudahDimuat = true;

  pemberitahuCadangan.forEach((fn) => {
    try { fn(statusCadangan); } catch (_e) {}
  });

  return { ...statusCadangan };
}

export async function simpanIntervalCadangan(intervalBaru) {
  const inv = Number(intervalBaru);
  statusCadangan.intervalHari = inv;

  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(inv));
  } catch (_e) {}

  try {
    const db = getFirestoreDb();
    await setDoc(doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.CADANGAN), {
      intervalHari: inv,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (_err) {
    // Jika gagal (offline), salinan lokal sudah tersimpan
  }

  pemberitahuCadangan.forEach((fn) => {
    try { fn(statusCadangan); } catch (_e) {}
  });
  segarkanTampilanPengaturan();
}

export function tundaPengingatCadangan(hari = 3) {
  const tundaSampai = tambahHari(hari);
  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_TUNDA, tundaSampai);
  } catch (_e) {}

  pemberitahuCadangan.forEach((fn) => {
    try { fn(statusCadangan); } catch (_e) {}
  });
}

export function apakahSedangMenundaCadangan() {
  try {
    const tundaSampai = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TUNDA);
    if (!tundaSampai) return false;
    return hariIni() <= tundaSampai;
  } catch (_e) {
    return false;
  }
}
import { normalisasiWarnaKategori, urutkanDaftarKategori } from "./kategori.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  onPerubahanKegiatan,
  ambilSemuaKegiatanSekaliPakai
} from "./kegiatan.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  onPerubahanDokumen,
  sinkronkanSatuFolderKategoriDokumen,
  ambilSemuaDokumenSekaliPakai
} from "./dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  JENIS_CATATAN_SINGKAT,
  getDaftarCatatan,
  onPerubahanCatatan,
  ambilSemuaCatatanSekaliPakai
} from "./catatan.js";
import { getDaftarLaporan } from "./laporan.js";
import { formatPesanGalatDrive } from "./drive.js";
import { periksaPembaruan } from "./pwa.js";

export const KOLEKSI_CADANGAN = [
  { key: "kategoriKegiatan", label: "Kategori Kegiatan" },
  { key: "kegiatan", label: "Kegiatan" },
  { key: "kategoriDokumen", label: "Kategori Dokumen" },
  { key: "dokumen", label: "Dokumen (Metadata Drive)" },
  { key: "catatan", label: "Catatan & Metadata Google Docs" },
  { key: "laporan", label: "Riwayat Laporan (Metadata Sheets)" }
];

const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

const IKON_MATAHARI = svgIkon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', 17);
const IKON_BULAN = svgIkon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 17);
const IKON_SISTEM = svgIkon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 17);
const IKON_FOLDER_SYNC = svgIkon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="16 13 12 9 8 13"/><line x1="12" y1="9" x2="12" y2="17"/>', 18);
const IKON_UNDUH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18);
const IKON_UNGGAH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18);
const IKON_SEGAR = svgIkon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 17);
const IKON_PERINGATAN = svgIkon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 18);

let antarmukaSudahDiikat = false;
let versiAplikasiTerbaca = "";
let sedangSinkronFolder = false;
let sedangMengekspor = false;
let sedangMengimpor = false;
let dataSiapImpor = null;
let namaBerkasImpor = "";

function setUmpanBalikPengaturan(pesan, tipe = "info") {
  const box = document.getElementById("pengaturan-feedback-box");
  const txt = document.getElementById("pengaturan-feedback-text");
  if (!box || !txt) return;

  const bersih = String(pesan || "").trim();
  if (!bersih) {
    box.hidden = true;
    txt.textContent = "";
    return;
  }

  box.className =
    tipe === "success"
      ? "alert-box alert-box-success"
      : tipe === "warning"
        ? "alert-box alert-box-warning"
        : "alert-box";
  txt.textContent = bersih;
  box.hidden = false;
}

async function bacaVersiDariSwJs() {
  if (versiAplikasiTerbaca) return versiAplikasiTerbaca;
  try {
    const resp = await fetch("/sw.js", { cache: "no-cache" });
    if (resp.ok) {
      const teks = await resp.text();
      const cocok = /const\s+VERSION\s*=\s*["']([^"']+)["']/.exec(teks);
      if (cocok && cocok[1]) {
        versiAplikasiTerbaca = cocok[1].trim();
        return versiAplikasiTerbaca;
      }
    }
  } catch (_err) {
    // Saat luring, coba ambil dari daftar nama CacheStorage yang aktif
    try {
      if ("caches" in window) {
        const kunci = await caches.keys();
        const ketemu = kunci.find((k) => k.startsWith("agenda-arsip-"));
        if (ketemu) {
          versiAplikasiTerbaca = ketemu;
          return versiAplikasiTerbaca;
        }
      }
    } catch (_e2) {}
  }
  versiAplikasiTerbaca = VERSI_CADANGAN_SW;
  return versiAplikasiTerbaca;
}

function pastikanKerangkaHalamanPengaturan() {
  const panel = document.getElementById("section-pengaturan");
  if (!panel || panel.querySelector("#pengaturan-grid")) return;

  const prefAwal = getPreferensiTema();

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Pengaturan &amp; Cadangan</h2>
        <p class="section-heading-subtitle">Kelola preferensi tampilan, izin Google Drive, sinkronisasi subfolder kategori dokumen, serta cadangan data JSON.</p>
      </div>
    </div>

    <div id="pengaturan-feedback-box" class="alert-box" role="status" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span id="pengaturan-feedback-text"></span>
    </div>

    <div id="pengaturan-grid" class="settings-grid">
      <!-- B1. Tema Tampilan -->
      <section class="dash-card" aria-labelledby="settings-tema-heading">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="settings-tema-heading" class="dash-card-title">Tema Tampilan</h3>
            <span class="dash-card-caption">Selaras langsung dengan pemilih tema di bilah sisi</span>
          </div>
        </div>
        <div class="dash-card-body">
          <p class="settings-desc-text">Pilih skema warna antarmuka yang paling nyaman di layar Anda:</p>
          <div class="theme-switcher settings-theme-switcher" role="group" aria-label="Pemilih tema tampilan di halaman Pengaturan">
            <button
              type="button"
              class="theme-choice-btn settings-theme-btn${prefAwal === "light" ? " is-active" : ""}"
              data-theme-choice="light"
              aria-pressed="${prefAwal === "light" ? "true" : "false"}"
            >
              ${IKON_MATAHARI}
              <span>Terang</span>
            </button>
            <button
              type="button"
              class="theme-choice-btn settings-theme-btn${prefAwal === "dark" ? " is-active" : ""}"
              data-theme-choice="dark"
              aria-pressed="${prefAwal === "dark" ? "true" : "false"}"
            >
              ${IKON_BULAN}
              <span>Gelap</span>
            </button>
            <button
              type="button"
              class="theme-choice-btn settings-theme-btn${prefAwal === "system" ? " is-active" : ""}"
              data-theme-choice="system"
              aria-pressed="${prefAwal === "system" ? "true" : "false"}"
            >
              ${IKON_SISTEM}
              <span>Ikuti Sistem</span>
            </button>
          </div>
        </div>
      </section>

      <!-- B2. Status Akun & Izin Google Drive -->
      <section class="dash-card" aria-labelledby="settings-akun-heading">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="settings-akun-heading" class="dash-card-title">Status Akun &amp; Izin Drive</h3>
            <span class="dash-card-caption">Sesi Firebase Authentication &amp; akses Google Drive</span>
          </div>
          <span id="settings-drive-badge" class="status-badge status-rencana">Memeriksa...</span>
        </div>
        <div class="dash-card-body">
          <dl class="detail-meta-grid">
            <div class="detail-meta-row">
              <dt>Email</dt>
              <dd id="settings-account-email">-</dd>
            </div>
            <div class="detail-meta-row">
              <dt>Izin Drive</dt>
              <dd id="settings-drive-status-text">-</dd>
            </div>
            <div class="detail-meta-row">
              <dt>Jaringan</dt>
              <dd id="settings-network-status-text">-</dd>
            </div>
          </dl>
          <p id="settings-drive-offline-hint" class="field-hint-text" hidden>
            Perangkat sedang luring. Izin Google Drive baru dapat diperbarui setelah sambungan internet kembali tersedia.
          </p>
        </div>
        <div class="dash-card-footer">
          <button type="button" id="btn-settings-relogin-drive" class="btn-primary settings-full-btn-mobile">
            ${IKON_SEGAR}
            <span>Masuk ulang untuk memperbarui izin Drive</span>
          </button>
        </div>
      </section>

      <!-- B3. Sinkronisasi Folder Kategori Dokumen -->
      <section class="dash-card" aria-labelledby="settings-folder-heading">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="settings-folder-heading" class="dash-card-title">Sinkronisasi Folder Drive</h3>
            <span class="dash-card-caption">Subfolder kategori dokumen di dalam folder induk Agenda-Arsip</span>
          </div>
          <span id="settings-unsynced-count" class="dash-metric-number">0</span>
        </div>
        <div class="dash-card-body">
          <p id="settings-folder-summary" class="settings-desc-text">Memeriksa status subfolder kategori dokumen...</p>
          <ul id="settings-unsynced-list" class="settings-mini-list" hidden></ul>
          <div id="settings-folder-sync-progress" class="upload-progress-card" aria-live="polite" hidden>
            <div class="upload-progress-top">
              <span id="settings-folder-sync-label" class="upload-progress-label">Menyinkronkan folder...</span>
              <span id="settings-folder-sync-pct" class="upload-progress-pct">0%</span>
            </div>
            <div class="progress-track">
              <div id="settings-folder-sync-fill" class="progress-fill"></div>
            </div>
          </div>
        </div>
        <div class="dash-card-footer">
          <button type="button" id="btn-settings-sync-all-folders" class="btn-secondary settings-full-btn-mobile">
            ${IKON_FOLDER_SYNC}
            <span>Sinkronkan semua folder</span>
          </button>
        </div>
      </section>

      <!-- B4. Informasi Aplikasi & Pembaruan PWA -->
      <section class="dash-card" aria-labelledby="settings-appinfo-heading">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="settings-appinfo-heading" class="dash-card-title">Informasi Aplikasi</h3>
            <span class="dash-card-caption">Versi cache Service Worker &amp; kesiapan PWA</span>
          </div>
        </div>
        <div class="dash-card-body">
          <dl class="detail-meta-grid">
            <div class="detail-meta-row">
              <dt>Aplikasi</dt>
              <dd>Agenda &amp; Arsip</dd>
            </div>
            <div class="detail-meta-row">
              <dt>Versi</dt>
              <dd id="settings-sw-version">Memuat versi...</dd>
            </div>
            <div class="detail-meta-row">
              <dt>Pekerja</dt>
              <dd id="settings-sw-state">Memeriksa Service Worker...</dd>
            </div>
          </dl>
          <p id="settings-update-status" class="field-hint-text" role="status" aria-live="polite" hidden></p>
        </div>
        <div class="dash-card-footer">
          <button type="button" id="btn-settings-check-update" class="btn-secondary settings-full-btn-mobile">
            ${IKON_SEGAR}
            <span>Periksa pembaruan</span>
          </button>
        </div>
      </section>

      <!-- B5. Pengaturan Hari Libur & Hari Besar -->
      <section class="dash-card dash-area-libur" aria-labelledby="settings-libur-heading" style="grid-column: 1 / -1;">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="settings-libur-heading" class="dash-card-title">Hari Libur &amp; Hari Besar</h3>
            <span class="dash-card-caption">Tanggal merah kalender, cuti bersama SKB 3 Menteri, dan hari besar</span>
          </div>
        </div>
        <div class="dash-card-body">
          <div class="libur-manage-container">
            <div class="libur-manage-toggles">
              <label class="form-checkbox-label">
                <input type="checkbox" id="settings-libur-cuti-merah" class="form-checkbox" checked />
                <span>Tampilkan cuti bersama berwarna merah</span>
              </label>
              <label class="form-checkbox-label">
                <input type="checkbox" id="settings-libur-hari-besar" class="form-checkbox" checked />
                <span>Tampilkan hari besar nasional (bukan libur)</span>
              </label>
            </div>

            <div class="libur-year-filter-row">
              <div class="libur-year-select-wrap">
                <label for="settings-libur-tahun-select" class="filter-label">Tahun:</label>
                <select id="settings-libur-tahun-select" class="form-select" style="min-width: 100px;"></select>
              </div>
              <div id="settings-libur-tambah-tahun-wrap" style="display: inline-flex; align-items: center; gap: 6px;">
                <button type="button" id="btn-settings-tambah-tahun" class="btn-secondary btn-sm-touch">+ Tambah tahun...</button>
                <div id="settings-libur-input-tahun-box" style="display: none; align-items: center; gap: 6px;">
                  <input type="number" id="settings-libur-input-tahun-baru" class="form-input" placeholder="2028" min="2000" max="2100" style="width: 80px;" />
                  <button type="button" id="btn-settings-simpan-tahun-baru" class="btn-primary btn-sm-touch">Buka</button>
                  <button type="button" id="btn-settings-batal-tahun-baru" class="btn-secondary btn-sm-touch">&times;</button>
                </div>
              </div>
            </div>

            <div class="libur-list-scroll" id="settings-libur-scroll-container">
              <table class="libur-table" id="settings-libur-table" aria-label="Daftar hari libur dan hari besar">
                <thead>
                  <tr>
                    <th scope="col" style="width: 130px;">Tanggal</th>
                    <th scope="col">Nama Libur / Hari Besar</th>
                    <th scope="col" style="width: 130px;">Jenis</th>
                    <th scope="col" style="width: 90px;">Sumber</th>
                    <th scope="col" style="width: 130px; text-align: right;">Aksi</th>
                  </tr>
                </thead>
                <tbody id="settings-libur-tbody">
                  <!-- Diisi secara dinamis oleh renderDaftarHariLiburPengaturan -->
                </tbody>
              </table>
            </div>

            <p class="libur-source-note">
              * Bila ingin menggeser tanggal libur bawaan (misal penetapan hisab/rukyat berbeda), sembunyikan entri bawaan lama lalu tambahkan entri baru dengan tanggal yang diinginkan.
            </p>

            <div class="settings-subpanel" style="border-top: 1px solid var(--color-border); padding-top: 16px;">
              <h4 class="sub-card-title" id="settings-libur-form-title">Tambah Hari Libur atau Hari Besar</h4>
              <form id="settings-libur-form" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;" autocomplete="off">
                <input type="hidden" id="settings-libur-form-id" value="" />
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                  <div class="form-field">
                    <label for="settings-libur-input-tanggal" class="form-label">Tanggal <span class="required-mark">*</span></label>
                    <input type="date" id="settings-libur-input-tanggal" class="form-input" required />
                  </div>
                  <div class="form-field">
                    <label for="settings-libur-input-nama" class="form-label">Nama Libur / Hari Besar <span class="required-mark">*</span></label>
                    <input type="text" id="settings-libur-input-nama" class="form-input" placeholder="Contoh: Libur Khusus Daerah" maxlength="80" required />
                  </div>
                  <div class="form-field">
                    <label for="settings-libur-input-jenis" class="form-label">Jenis <span class="required-mark">*</span></label>
                    <select id="settings-libur-input-jenis" class="form-select">
                      <option value="libur">Libur nasional</option>
                      <option value="cuti">Cuti bersama</option>
                      <option value="tambahan">Hari libur tambahan</option>
                      <option value="besar">Hari besar (bukan libur)</option>
                    </select>
                  </div>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                  <button type="button" id="btn-settings-libur-batal-edit" class="btn-secondary btn-sm-touch" hidden>Batal</button>
                  <button type="submit" id="btn-settings-libur-submit" class="btn-primary btn-sm-touch">Simpan Entri</button>
                </div>
              </form>
            </div>

            <p class="libur-source-note" style="border-top: 1px solid var(--color-border); padding-top: 8px;">
              Data bawaan: SKB 3 Menteri 2026 dan 2027. Periksa SKB terbaru setiap tahun.
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- C. Ekspor dan Impor Cadangan JSON -->
    <section class="dash-card" aria-labelledby="settings-backup-heading">
      <div class="dash-card-header">
        <div class="dash-card-heading-group">
          <h3 id="settings-backup-heading" class="dash-card-title">Cadangan Data (Ekspor &amp; Impor JSON)</h3>
          <span class="dash-card-caption">Mencakup kegiatan, kategori kegiatan, dokumen, kategori dokumen, catatan, dan riwayat laporan</span>
        </div>
      </div>

      <div class="dash-card-body settings-backup-stack">
        <!-- C3. Peringatan Jelas -->
        <div class="alert-box alert-box-warning" role="note">
          ${IKON_PERINGATAN}
          <div>
            <strong>Peringatan Penting tentang Berkas Google Drive:</strong>
            Berkas asli di Google Drive (dokumen terunggah, Google Docs, dan spreadsheet Google Sheets) <strong>tidak ikut diekspor</strong> ke dalam berkas JSON ini—hanya metadatanya (nama, tautan, ID berkas, kategori, dan catatan) yang disimpan.
          </div>
        </div>

        <div class="settings-backup-columns">
          <!-- C1. Ekspor -->
          <div class="settings-subpanel">
            <h4 class="sub-card-title">Ekspor Cadangan JSON</h4>
            <p class="settings-desc-text">
              Mengunduh seluruh data Firestore ke satu berkas JSON terstruktur lengkap dengan nama kategori di samping <code>kategoriId</code>.
            </p>
            <p id="settings-backup-last-time" class="settings-backup-last-time">Memeriksa riwayat cadangan...</p>
            <div class="form-field settings-backup-interval-field">
              <label for="settings-backup-interval-select" class="form-label">Ingatkan saya setiap</label>
              <select id="settings-backup-interval-select" class="form-select">
                <option value="7">7 hari</option>
                <option value="14">14 hari (bawaan)</option>
                <option value="30">30 hari</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
            <p id="settings-export-counts" class="field-hint-text"></p>
            <div class="settings-subpanel-actions">
              <button type="button" id="btn-settings-export-json" class="btn-primary settings-full-btn-mobile">
                ${IKON_UNDUH}
                <span>Ekspor JSON</span>
              </button>
            </div>
          </div>

          <!-- C2. Impor -->
          <div class="settings-subpanel">
            <h4 class="sub-card-title">Impor Cadangan JSON</h4>
            <p class="settings-desc-text">
              Pilih berkas JSON hasil ekspor untuk melihat pratinjau jumlah data per koleksi sebelum memilih cara penggabungan.
            </p>
            <div class="form-field">
              <label for="settings-import-file" class="form-label">Pilih Berkas Cadangan (.json)</label>
              <input type="file" id="settings-import-file" class="form-input form-file-input" accept=".json,application/json" />
            </div>
          </div>
        </div>

        <!-- Panel Pratinjau & Konfirmasi Impor -->
        <div id="settings-import-preview-panel" class="settings-import-preview" hidden>
          <div class="settings-import-preview-head">
            <div>
              <h4 class="sub-card-title">Pratinjau Berkas Impor</h4>
              <p id="settings-import-file-meta" class="field-hint-text"></p>
            </div>
            <button type="button" id="btn-settings-cancel-import" class="btn-secondary btn-sm-touch">Batalkan Pilihan</button>
          </div>

          <div id="settings-import-counts-grid" class="settings-counts-grid"></div>

          <div class="form-field">
            <span class="form-label" id="settings-import-mode-label">Perlakuan terhadap ID Data yang Sudah Ada</span>
            <div class="delete-choice-group" role="radiogroup" aria-labelledby="settings-import-mode-label">
              <label class="delete-choice-card">
                <input type="radio" name="settings-import-mode" id="settings-import-mode-skip" value="skip" checked />
                <div class="delete-choice-content">
                  <span class="delete-choice-title">Lewati yang sudah ada (Aman)</span>
                  <span class="delete-choice-desc">Hanya menambahkan dokumen dengan ID baru. Data yang ID-nya sudah ada di aplikasi Anda tidak diubah.</span>
                </div>
              </label>
              <label class="delete-choice-card">
                <input type="radio" name="settings-import-mode" id="settings-import-mode-overwrite" value="overwrite" />
                <div class="delete-choice-content">
                  <span class="delete-choice-title">Timpa yang sudah ada</span>
                  <span class="delete-choice-desc">Memperbarui data yang memiliki ID sama dengan isi dari berkas cadangan dan menambahkan sisanya.</span>
                </div>
              </label>
            </div>
          </div>

          <div id="settings-import-progress-wrap" class="upload-progress-card" aria-live="polite" hidden>
            <div class="upload-progress-top">
              <span id="settings-import-progress-label" class="upload-progress-label">Memproses impor...</span>
              <span id="settings-import-progress-pct" class="upload-progress-pct">0%</span>
            </div>
            <div class="progress-track">
              <div id="settings-import-progress-fill" class="progress-fill"></div>
            </div>
          </div>

          <div class="settings-import-actions">
            <button type="button" id="btn-settings-confirm-import" class="btn-primary">
              ${IKON_UNGGAH}
              <span>Konfirmasi &amp; Mulai Impor</span>
            </button>
          </div>
        </div>

        <div id="settings-import-summary-box" hidden></div>

        <!-- C4. Optimalisasi & Pemeliharaan Soft Delete (Fase 5) -->
        <div class="settings-subpanel" style="margin-top: 24px; border-top: 1px solid var(--color-border); padding-top: 20px;">
          <h4 class="sub-card-title">Pemeliharaan Soft Delete Database (Fase 5)</h4>
          <p class="settings-desc-text">
            Kueri Firestore optimal <code>where("dihapusAt", "==", null)</code> memerlukan dokumen memiliki field <code>dihapusAt: null</code>. Dokumen riwayat lama yang dibuat sebelum fitur soft-delete belum memiliki field tersebut, sehingga tidak cocok dengan kueri <code>== null</code>. Tombol di bawah ini memeriksa dan menambahkan field <code>dihapusAt: null</code> secara aman dan idempoten (batch maks 500) tanpa mengubah isi data lain.
          </p>
          <div class="settings-subpanel-actions">
            <button type="button" id="btn-settings-migrate-dihapusat" class="btn-secondary settings-full-btn-mobile">
              ${IKON_SEGAR}
              <span>Periksa &amp; Lengkapi Field "dihapusAt"</span>
            </button>
          </div>
          <div id="settings-migration-status" style="margin-top: 12px; font-size: 13px;" hidden></div>
        </div>
      </div>
    </section>
  </div>`;

  terapkanTema(prefAwal);
}

const NAMA_HARI_TABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_TABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
let tahunLiburAktif = 2026;

function formatTanggalTabel(tanggalStr) {
  const d = parseTanggal(tanggalStr);
  if (!d) return tanggalStr || "-";
  return `${NAMA_HARI_TABEL[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN_TABEL[d.getMonth()]} ${d.getFullYear()}`;
}

export function renderDaftarHariLiburPengaturan() {
  const tbody = document.getElementById("settings-libur-tbody");
  const selectTahun = document.getElementById("settings-libur-tahun-select");
  const chkCuti = document.getElementById("settings-libur-cuti-merah");
  const chkHariBesar = document.getElementById("settings-libur-hari-besar");
  if (!tbody || !selectTahun) return;

  const cfg = ambilKonfigurasiAktif();
  const himpunanDisembunyikan = new Set(cfg.disembunyikan || []);

  if (chkCuti instanceof HTMLInputElement) {
    chkCuti.checked = cfg.tampilkanCutiMerah;
  }
  if (chkHariBesar instanceof HTMLInputElement) {
    chkHariBesar.checked = cfg.tampilkanHariBesar;
  }

  // Bangun daftar tahun tersedia: 2026, 2027, tahun pada entri kustom, dan tahunLiburAktif
  const setTahun = new Set([2026, 2027, tahunLiburAktif]);
  (cfg.entri || []).forEach((u) => {
    if (u.tanggal) {
      const thn = Number(u.tanggal.slice(0, 4));
      if (Number.isFinite(thn) && thn > 1900) setTahun.add(thn);
    }
  });

  const daftarTahun = Array.from(setTahun).sort((a, b) => a - b);
  selectTahun.innerHTML = daftarTahun
    .map((t) => `<option value="${t}" ${t === tahunLiburAktif ? "selected" : ""}>${t}</option>`)
    .join("");

  // Kumpulkan entri pada tahun terpilih
  const thnStr = String(tahunLiburAktif);
  const bawaan = DATA_HARI_LIBUR_BAWAAN.filter((b) => b.tanggal.startsWith(thnStr)).map((b) => ({
    tanggal: b.tanggal,
    nama: b.nama,
    jenis: b.jenis,
    bawaan: true,
    sumber: "bawaan"
  }));

  const hariBesarTetap = cfg.tampilkanHariBesar
    ? HARI_BESAR_TETAP.map((hb) => {
        const bln = String(hb.bulan).padStart(2, "0");
        const tgl = String(hb.tanggal).padStart(2, "0");
        return {
          tanggal: `${thnStr}-${bln}-${tgl}`,
          nama: hb.nama,
          jenis: "besar",
          bawaan: true,
          sumber: "bawaan"
        };
      })
    : [];

  const tambahan = (cfg.entri || []).filter((u) => u.tanggal && u.tanggal.startsWith(thnStr)).map((u) => ({
    id: u.id,
    tanggal: u.tanggal,
    nama: u.nama,
    jenis: u.jenis || "tambahan",
    bawaan: false,
    sumber: "tambahan"
  }));

  const gabungan = [...bawaan, ...hariBesarTetap, ...tambahan];
  gabungan.sort((a, b) => {
    const c = a.tanggal.localeCompare(b.tanggal);
    if (c !== 0) return c;
    return a.nama.localeCompare(b.nama, "id", { sensitivity: "base" });
  });

  if (gabungan.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: var(--space-4);">Tidak ada hari libur atau cuti bersama yang tercatat untuk tahun ${tahunLiburAktif}. Anda dapat menambahkannya melalui formulir di bawah.</td></tr>`;
    return;
  }

  tbody.innerHTML = gabungan
    .map((item) => {
      const key = kunciEntri(item.tanggal, item.nama);
      const disembunyikan = himpunanDisembunyikan.has(key);

      let lencanaJenis = "";
      if (item.jenis === "cuti") {
        lencanaJenis = `<span class="badge-cuti">Cuti bersama</span>`;
      } else if (item.jenis === "besar") {
        lencanaJenis = `<span class="badge-hari-besar">Hari besar</span>`;
      } else if (item.jenis === "tambahan") {
        lencanaJenis = `<span class="badge-libur">Libur tambahan</span>`;
      } else {
        lencanaJenis = `<span class="badge-libur">Libur nasional</span>`;
      }

      const lencanaSumber = item.bawaan
        ? `<span class="badge-hari-besar">Bawaan</span>`
        : `<span class="badge-hari-besar" style="color: var(--color-bps-primary-blue); font-weight: 600;">Tambahan</span>`;

      const statusCoret = disembunyikan ? " is-hidden-entry" : "";
      const lencanaStatus = disembunyikan
        ? `<span class="status-badge status-rencana" style="margin-left: 6px; font-size: 11px;">Disembunyikan</span>`
        : "";

      let tombolAksi = "";
      if (item.bawaan) {
        tombolAksi = `<button type="button" class="btn-secondary btn-sm-touch" data-action="toggle-hide-builtin" data-key="${escapeHtml(key)}" data-tgl="${escapeHtml(item.tanggal)}" data-nama="${escapeHtml(item.nama)}">${disembunyikan ? "Tampilkan lagi" : "Sembunyikan"}</button>`;
      } else {
        tombolAksi = `<div style="display: flex; gap: 4px; justify-content: flex-end;">
          <button type="button" class="btn-secondary btn-sm-touch" data-action="edit-custom-libur" data-id="${escapeHtml(item.id || key)}">Ubah</button>
          <button type="button" class="btn-danger-outline btn-sm-touch" data-action="delete-custom-libur" data-id="${escapeHtml(item.id || key)}">Hapus</button>
        </div>`;
      }

      return `<tr class="${statusCoret}">
        <td style="white-space: nowrap; font-weight: 500;">${escapeHtml(formatTanggalTabel(item.tanggal))}</td>
        <td>
          <span style="${disembunyikan ? "text-decoration: line-through;" : ""}">${escapeHtml(item.nama)}</span>
          ${lencanaStatus}
        </td>
        <td>${lencanaJenis}</td>
        <td>${lencanaSumber}</td>
        <td style="text-align: right;">${tombolAksi}</td>
      </tr>`;
    })
    .join("");
}

export function segarkanTampilanPengaturan() {
  const panel = document.getElementById("section-pengaturan");
  if (!panel || !panel.querySelector("#pengaturan-grid")) return;

  renderDaftarHariLiburPengaturan();

  const user = getCurrentUser();
  const online = navigator.onLine;
  const expired = isDriveTokenExpired();

  // B2. Status Akun & Drive
  const emailEl = document.getElementById("settings-account-email");
  const statusDriveEl = document.getElementById("settings-drive-status-text");
  const badgeDriveEl = document.getElementById("settings-drive-badge");
  const netTextEl = document.getElementById("settings-network-status-text");
  const offlineHintEl = document.getElementById("settings-drive-offline-hint");
  const btnRelogin = document.getElementById("btn-settings-relogin-drive");

  if (emailEl) {
    emailEl.textContent = user?.email || "-";
  }
  if (netTextEl) {
    netTextEl.textContent = online ? "Terhubung ke internet (Online)" : "Mode luring (Offline)";
  }
  if (statusDriveEl && badgeDriveEl) {
    if (expired) {
      statusDriveEl.textContent = online
        ? "Kedaluwarsa atau belum aktif — perlu masuk ulang sebelum mengakses Drive"
        : "Kedaluwarsa (sambungkan ke internet untuk memperbarui izin)";
      badgeDriveEl.className = "status-badge status-rencana";
      badgeDriveEl.textContent = "Kedaluwarsa";
    } else {
      statusDriveEl.textContent = "Token akses Google Drive masih berlaku";
      badgeDriveEl.className = "status-badge status-selesai";
      badgeDriveEl.textContent = "Masih Berlaku";
    }
  }
  if (offlineHintEl) {
    offlineHintEl.hidden = online;
  }
  if (btnRelogin instanceof HTMLButtonElement && !btnRelogin.hasAttribute("data-busy")) {
    btnRelogin.disabled = !online;
    btnRelogin.title = online
      ? "Perbarui token akses Google Drive"
      : "Tidak dapat memperbarui izin Google Drive saat luring";
  }

  // B3. Status Sinkronisasi Folder Kategori Dokumen
  const semuaKatDok = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori());
  const belumSinkron = semuaKatDok.filter((k) => !k.folderId || !k.folderSinkron);

  const countUnsyncedEl = document.getElementById("settings-unsynced-count");
  const summaryFolderEl = document.getElementById("settings-folder-summary");
  const listUnsyncedEl = document.getElementById("settings-unsynced-list");
  const btnSyncAll = document.getElementById("btn-settings-sync-all-folders");

  if (countUnsyncedEl) {
    countUnsyncedEl.textContent = String(belumSinkron.length);
  }
  if (summaryFolderEl) {
    if (semuaKatDok.length === 0) {
      summaryFolderEl.textContent = "Belum ada kategori dokumen yang terdaftar.";
    } else if (belumSinkron.length === 0) {
      summaryFolderEl.textContent = `Seluruh ${semuaKatDok.length} kategori dokumen telah tersinkron dengan subfolder di Google Drive.`;
    } else {
      summaryFolderEl.textContent = `${belumSinkron.length} dari ${semuaKatDok.length} kategori dokumen belum tersinkron dengan subfolder Google Drive.`;
    }
  }
  if (listUnsyncedEl) {
    if (belumSinkron.length === 0) {
      listUnsyncedEl.hidden = true;
      listUnsyncedEl.innerHTML = "";
    } else {
      listUnsyncedEl.hidden = false;
      listUnsyncedEl.innerHTML = belumSinkron
        .map(
          (k) => `<li class="settings-mini-item">
            <span class="cat-badge cat-color-${escapeHtml(k.warna)}">
              <span class="cat-dot cat-dot-${escapeHtml(k.warna)}" aria-hidden="true"></span>
              <span>${escapeHtml(k.nama)}</span>
            </span>
            <span class="sync-warning-badge">${k.folderId ? "Nama belum sinkron" : "Folder belum dibuat"}</span>
          </li>`
        )
        .join("");
    }
  }
  if (btnSyncAll instanceof HTMLButtonElement && !sedangSinkronFolder) {
    btnSyncAll.disabled = !online || belumSinkron.length === 0;
    btnSyncAll.title = !online
      ? "Tidak ada koneksi internet. Sinkronisasi folder memerlukan sambungan aktif."
      : belumSinkron.length === 0
        ? "Semua folder kategori dokumen sudah sinkron"
        : `Sinkronkan ${belumSinkron.length} folder kategori dokumen`;
  }

  // B4. Informasi Aplikasi & Service Worker
  const checkUpdateBtn = document.getElementById("btn-settings-check-update");
  if (checkUpdateBtn instanceof HTMLButtonElement && !checkUpdateBtn.hasAttribute("data-busy")) {
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.title = online
      ? "Periksa versi terbaru Service Worker"
      : "Tidak dapat memeriksa saat offline";
  }

  const swStateEl = document.getElementById("settings-sw-state");
  if (swStateEl) {
    if (!("serviceWorker" in navigator)) {
      swStateEl.textContent = "Tidak didukung peramban ini";
    } else if (navigator.serviceWorker.controller) {
      swStateEl.textContent = "Aktif & siap digunakan luring";
    } else {
      swStateEl.textContent = "Terdaftar";
    }
  }

  // Ringkasan jumlah data saat ini untuk Ekspor
  const exportCountsEl = document.getElementById("settings-export-counts");
  if (exportCountsEl) {
    const jKeg = getDaftarKegiatan().length;
    const jKatKeg = manajerKategoriKegiatan.getDaftarKategori().length;
    const jDok = getDaftarDokumen().length;
    const jKatDok = semuaKatDok.length;
    const jCat = getDaftarCatatan().length;
    const jLap = getDaftarLaporan().length;
    exportCountsEl.textContent = `Tersedia saat ini: ${jKeg} kegiatan, ${jKatKeg} kategori kegiatan, ${jDok} dokumen, ${jKatDok} kategori dokumen, ${jCat} catatan, ${jLap} riwayat laporan.`;
  }

  // Status Cadangan Terakhir & Pilihan Interval
  const lastTimeEl = document.getElementById("settings-backup-last-time");
  if (lastTimeEl) {
    if (statusCadangan.terakhirEksporAt) {
      const selisih = hitungSelisihHariCadangan(statusCadangan.terakhirEksporAt);
      const dLokal = tanggalLokal(new Date(statusCadangan.terakhirEksporAt));
      const tglLengkap = formatTanggalLengkapIndonesia(dLokal);
      lastTimeEl.textContent = `Cadangan terakhir: ${tglLengkap} (${selisih !== null ? selisih : 0} hari lalu)`;
    } else {
      lastTimeEl.textContent = "Belum pernah mengekspor cadangan";
    }
  }

  const intervalSelect = document.getElementById("settings-backup-interval-select");
  if (intervalSelect instanceof HTMLSelectElement) {
    intervalSelect.value = String(statusCadangan.intervalHari);
  }
}

async function perbaruiInfoVersiSwDiDom() {
  const ver = await bacaVersiDariSwJs();
  const verEl = document.getElementById("settings-sw-version");
  if (verEl) verEl.textContent = ver;
}

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

  const progWrap = document.getElementById("settings-folder-sync-progress");
  const progLabel = document.getElementById("settings-folder-sync-label");
  const progPct = document.getElementById("settings-folder-sync-pct");
  const progFill = document.getElementById("settings-folder-sync-fill");
  const btnSync = document.getElementById("btn-settings-sync-all-folders");

  sedangSinkronFolder = true;
  setUmpanBalikPengaturan("");
  if (btnSync instanceof HTMLButtonElement) btnSync.disabled = true;
  if (progWrap) progWrap.hidden = false;

  let sukses = 0;
  let gagal = 0;
  let galatTerakhir = "";

  try {
    for (let i = 0; i < daftarBelum.length; i += 1) {
      const kat = daftarBelum[i];
      const ke = i + 1;
      const pct = Math.round((ke / daftarBelum.length) * 100);
      if (progLabel) progLabel.textContent = `Menyinkronkan "${kat.nama}" (${ke}/${daftarBelum.length})...`;
      if (progPct) progPct.textContent = `${pct}%`;
      if (progFill instanceof HTMLElement) progFill.style.width = `${pct}%`;

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
    if (progWrap) progWrap.hidden = true;
    segarkanTampilanPengaturan();
  }
}

function setStatusCekPembaruan(pesan) {
  const statusEl = document.getElementById("settings-update-status");
  if (!statusEl) return;
  const bersih = String(pesan || "").trim();
  statusEl.textContent = bersih;
  statusEl.hidden = !bersih;
}

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
// C1. Ekspor JSON Seluruh Data (dengan namaKategori di samping kategoriId)
// ============================================================================

export async function eksporSeluruhDataJson() {
  if (sedangMengekspor) return;
  const btn = document.getElementById("btn-settings-export-json");
  sedangMengekspor = true;
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
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

    pemberitahuCadangan.forEach((fn) => {
      try { fn(statusCadangan); } catch (_e) {}
    });
    segarkanTampilanPengaturan();

    tampilkanToast(`Cadangan "${namaBerkas}" berhasil diunduh.`, "success");
  } catch (err) {
    setUmpanBalikPengaturan(
      err instanceof Error ? err.message : "Gagal mengekspor data cadangan JSON.",
      "danger"
    );
  } finally {
    sedangMengekspor = false;
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

// ============================================================================
// C4. Migrasi Soft Delete (menambahkan dihapusAt: null pada dokumen legacy)
// ============================================================================

export async function jalankanMigrasiDihapusAt() {
  const btn = document.getElementById("btn-settings-migrate-dihapusat");
  const statusEl = document.getElementById("settings-migration-status");
  if (btn instanceof HTMLButtonElement) btn.disabled = true;

  if (statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `<span style="color:var(--color-primary);">Memeriksa dokumen tanpa field dihapusAt...</span>`;
  }

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
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Seluruh dokumen sudah memiliki field dihapusAt (0 dokumen perlu migrasi).</span>`;
      }
      tampilkanToast("Semua dokumen sudah termigrasi", "success");
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span>Ditemukan ${totalPerlu} dokumen (${butuhMigrasiKegiatan.length} kegiatan, ${butuhMigrasiCatatan.length} catatan) tanpa dihapusAt. Memperbarui...</span>`;
    }

    const semuaRef = [...butuhMigrasiKegiatan, ...butuhMigrasiCatatan];
    for (let i = 0; i < semuaRef.length; i += BATAS_OPERASI_BATCH) {
      const chunk = semuaRef.slice(i, i + BATAS_OPERASI_BATCH);
      const batch = writeBatch(db);
      chunk.forEach((ref) => {
        batch.update(ref, { dihapusAt: null });
      });
      await batch.commit();
    }

    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Berhasil memigrasi ${totalPerlu} dokumen dengan dihapusAt: null.</span>`;
    }
    tampilkanToast(`Migrasi berhasil: ${totalPerlu} dokumen diperbarui`, "success");
  } catch (err) {
    console.error("Gagal menjalankan migrasi dihapusAt:", err);
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--color-danger);">Gagal migrasi: ${escapeHtml(formatPesanGalatFirestore(err))}</span>`;
    }
    tampilkanToast(`Gagal migrasi: ${formatPesanGalatFirestore(err)}`, "danger");
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

// ============================================================================
// C2. Impor JSON (Pratinjau, Pilihan Lewati/Timpa, writeBatch maks 500 operasi)
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
  const progWrap = document.getElementById("settings-import-progress-wrap");
  if (progWrap) progWrap.hidden = true;
}

function tampilkanPratinjauImpor() {
  const panelPreview = document.getElementById("settings-import-preview-panel");
  const metaEl = document.getElementById("settings-import-file-meta");
  const gridEl = document.getElementById("settings-import-counts-grid");
  const summaryBox = document.getElementById("settings-import-summary-box");
  const btnConfirm = document.getElementById("btn-settings-confirm-import");
  if (!panelPreview || !gridEl || !dataSiapImpor) return;

  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }

  if (metaEl) {
    const infoTgl = dataSiapImpor.tanggalEkspor ? ` • Tanggal ekspor: ${dataSiapImpor.tanggalEkspor}` : "";
    metaEl.textContent = `Berkas: ${namaBerkasImpor} • Total ${dataSiapImpor.totalValid} entri siap diperiksa${infoTgl}`;
  }

  const itemLiburHtml =
    dataSiapImpor.hariLibur && Array.isArray(dataSiapImpor.hariLibur.entri)
      ? `<div class="organize-stat-item">
          <span class="organize-stat-value">${dataSiapImpor.hariLibur.entri.length}</span>
          <span class="organize-stat-label">Hari Libur Tambahan</span>
        </div>`
      : "";

  gridEl.innerHTML =
    KOLEKSI_CADANGAN.map((k) => {
      const jml = dataSiapImpor.koleksi[k.key]?.length || 0;
      return `<div class="organize-stat-item">
        <span class="organize-stat-value">${jml}</span>
        <span class="organize-stat-label">${escapeHtml(k.label)}</span>
      </div>`;
    }).join("") + itemLiburHtml;

  if (btnConfirm instanceof HTMLButtonElement) {
    btnConfirm.disabled = dataSiapImpor.totalValid === 0;
  }

  panelPreview.hidden = false;
}

async function jalankanImporDataBatch() {
  if (sedangMengimpor || !dataSiapImpor) return;

  const radioOverwrite = document.getElementById("settings-import-mode-overwrite");
  const modeTimpa = radioOverwrite instanceof HTMLInputElement && radioOverwrite.checked;

  const btnConfirm = document.getElementById("btn-settings-confirm-import");
  const btnCancel = document.getElementById("btn-settings-cancel-import");
  const progWrap = document.getElementById("settings-import-progress-wrap");
  const progLabel = document.getElementById("settings-import-progress-label");
  const progPct = document.getElementById("settings-import-progress-pct");
  const progFill = document.getElementById("settings-import-progress-fill");
  const summaryBox = document.getElementById("settings-import-summary-box");

  sedangMengimpor = true;
  setUmpanBalikPengaturan("");
  if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = true;
  if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = true;
  if (progWrap) progWrap.hidden = false;

  const perbaruiProgres = (label, persen) => {
    const p = Math.max(0, Math.min(100, Math.round(persen)));
    if (progLabel) progLabel.textContent = label;
    if (progPct) progPct.textContent = `${p}%`;
    if (progFill instanceof HTMLElement) progFill.style.width = `${p}%`;
  };

  try {
    const db = getFirestoreDb();
    perbaruiProgres("Memeriksa data yang sudah ada di aplikasi...", 5);

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
        perbaruiProgres(
          `Menyimpan batch ${indeksBatch + 1} dari ${totalBatch} (${Math.min(mulai + potongan.length, operasiTulis.length)}/${operasiTulis.length} data)...`,
          persen
        );
        await batch.commit();
      }
    } else {
      perbaruiProgres("Tidak ada perubahan baru yang perlu ditulis.", 100);
    }

    if (dataSiapImpor.hariLibur) {
      perbaruiProgres("Memperbarui konfigurasi hari libur...", 94);
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

    if (summaryBox) {
      summaryBox.hidden = false;
      summaryBox.innerHTML = `
        <div class="organize-notice-box">
          <strong class="sub-card-title">Ringkasan Hasil Impor Cadangan</strong>
          <div class="organize-summary-grid">
            <div class="organize-stat-item">
              <span class="organize-stat-value">${ditambahkan}</span>
              <span class="organize-stat-label">Data Baru Ditambahkan</span>
            </div>
            <div class="organize-stat-item">
              <span class="organize-stat-value">${ditimpa}</span>
              <span class="organize-stat-label">Data Lama Ditimpa</span>
            </div>
            <div class="organize-stat-item">
              <span class="organize-stat-value">${dilewati}</span>
              <span class="organize-stat-label">Dilewati (Sudah Ada)</span>
            </div>
          </div>
        </div>
      `;
    }

    tampilkanToast(
      `Impor selesai: ${ditambahkan} ditambahkan, ${ditimpa} ditimpa, ${dilewati} dilewati.`,
      "success"
    );
  } catch (err) {
    setUmpanBalikPengaturan(formatPesanGalatFirestore(err), "danger");
  } finally {
    sedangMengimpor = false;
    if (progWrap) progWrap.hidden = true;
    if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = false;
    if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = false;
    segarkanTampilanPengaturan();
  }
}

export function initHalamanPengaturan() {
  pastikanKerangkaHalamanPengaturan();
  perbaruiInfoVersiSwDiDom();
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
        tampilkanPratinjauImpor();
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
        tahunLiburAktif = v;
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
        tahunLiburAktif = val;
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
        tahunLiburAktif = thnEntri;
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

export function resetHalamanPengaturanSaatKeluar() {
  batalkanPratinjauImpor();
  setUmpanBalikPengaturan("");
  setStatusCekPembaruan("");
  const summaryBox = document.getElementById("settings-import-summary-box");
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
}
