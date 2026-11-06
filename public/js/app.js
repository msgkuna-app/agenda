/**
 * Titik Masuk Utama Aplikasi "Agenda & Arsip" (Fase 6: Pengaturan, Cadangan & Penyempurnaan App Shell)
 * Mengatur sesi masuk, layar galat konfigurasi, layar login, Dashboard, Kegiatan, Jadwal,
 * Dokumen, Catatan, Laporan, dan Pengaturan, pemantau kedaluwarsa token Google Drive,
 * konfirmasi keluar dengan pemulihan fokus keyboard, indikator koneksi, toast, dan Service Worker.
 */
import { isFirebaseConfigured } from "./firebase-config.js";
import {
  AUTHORIZED_EMAIL,
  initAuth,
  loginWithGoogle,
  logoutUser,
  isDriveTokenExpired,
  consumeLastAuthError,
  formatPesanGalatAuth,
} from "./auth.js";
import { initTema } from "./tema.js";
import {
  initSidebar,
  perbaruiInfoAkunSidebar,
  perbaruiStatusKoneksiSidebar,
  tutupDrawerMobile,
  pindahKeBagian,
  tampilkanToast,
  escapeHtml,
} from "./sidebar.js";
import { hariIni, tambahHari, parseTanggal } from "./util-tanggal.js";
import {
  manajerKategoriKegiatan,
  initHalamanKegiatan,
  subscribeKegiatan,
  unsubscribeKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  bukaModalFormKegiatan,
  kelasBadgeStatus,
  daftarkanPembukaDetailKegiatan,
} from "./kegiatan.js";
import {
  initHalamanJadwal,
  renderHalamanJadwal,
  bukaJadwalPadaTanggal,
  bukaDialogDetailKegiatan,
  resetHalamanJadwalSaatKeluar,
  formatTanggalLengkapIndonesia,
  formatTanggalRingkasIndonesia,
  urutkanKegiatanKronologis,
} from "./jadwal.js";
import {
  manajerKategoriDokumen,
  initHalamanDokumen,
  subscribeDokumen,
  unsubscribeDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  onPerubahanDokumen,
  perbaruiStatusJaringanDokumen,
  bukaModalUnggahDokumen,
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime,
} from "./dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  initHalamanCatatan,
  subscribeCatatan,
  unsubscribeCatatan,
  getDaftarCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
  sorotCatatanDiHalaman,
  perbaruiStatusJaringanCatatan,
  daftarkanPembukaDetailKegiatanCatatan,
} from "./catatan.js";
import {
  initHalamanLaporan,
  subscribeLaporan,
  unsubscribeLaporan,
  perbaruiStatusJaringanLaporan,
} from "./laporan.js";
import {
  initHalamanPengaturan,
  segarkanTampilanPengaturan,
  resetHalamanPengaturanSaatKeluar,
  muatPengaturanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  onPerubahanCadangan,
  eksporSeluruhDataJson,
} from "./pengaturan.js";
import { resetCacheDrive } from "./drive.js";
import {
  renderTimelineHarian,
  bersihkanTimelineHarian,
} from "./timeline-harian.js";
import {
  initHalamanSampah,
  renderHalamanSampah,
  jalankanPembersihanSampahOtomatis,
  resetPembersihanSampah,
} from "./sampah.js";
import {
  initPencarianGlobal,
  bersihkanPencarianGlobal,
} from "./pencarian-global.js";

const NAMA_HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const svgIkon = (isi, uk = 18, tebal = 2) =>
  `<svg viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

const KUNCI_TUNDA_UPDATE_SW = "agenda_arsip_update_ditunda";
const INTERVAL_CEK_UPDATE_SW_MS = 60 * 60 * 1000;
const KUNCI_STORAGE_TAMPILAN_HARI_INI = "agenda_arsip_dashboard_hari_ini";

function ambilPreferensiTampilanHariIni() {
  try {
    const tersimpan = localStorage.getItem(KUNCI_STORAGE_TAMPILAN_HARI_INI);
    if (tersimpan === "daftar" || tersimpan === "timeline") {
      return tersimpan;
    }
  } catch (_e) {}
  return "timeline"; // Bawaan: "Timeline"
}

function simpanPreferensiTampilanHariIni(mode) {
  try {
    localStorage.setItem(KUNCI_STORAGE_TAMPILAN_HARI_INI, mode);
  } catch (_e) {}
}

let modeTampilanHariIni = ambilPreferensiTampilanHariIni();

let dataUnsubscribers = [];
let tokenCheckIntervalId = null;
let logoutDialogOpen = false;
let focusBeforeModal = null;
let dashboardSudahDiikat = false;
let statusOnlineTerakhir = navigator.onLine;
let swRegistration = null;
let registrasiSwDipantau = null;
let swUpdateMenunggu = false;
let swUpdateIntervalId = null;
let sedangMuatUlangSw = false;
let spandukSwSudahDiikat = false;
const DAFTAR_PUTIH_AKSI_PINTASAN = ["tambah-kegiatan", "catatan-baru"];
let aksiPintasanTertunda = null;
let aksiPintasanSudahDijalankan = false;

function bersihkanParameterAksiUrl() {
  try {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );
  } catch (_err) {}
}

function bacaAksiPintasanDariUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const aksi = params.get("aksi");
    if (aksi && DAFTAR_PUTIH_AKSI_PINTASAN.includes(aksi)) {
      aksiPintasanTertunda = aksi;
    }
    if (params.has("aksi")) {
      bersihkanParameterAksiUrl();
    }
  } catch (_err) {}
}

function jalankanAksiPintasanSetelahLayarTampil() {
  if (aksiPintasanSudahDijalankan || !aksiPintasanTertunda) {
    bersihkanParameterAksiUrl();
    return;
  }
  const aksi = aksiPintasanTertunda;
  aksiPintasanTertunda = null;
  aksiPintasanSudahDijalankan = true;
  bersihkanParameterAksiUrl();

  if (aksi === "tambah-kegiatan") {
    bukaModalFormKegiatan(null, hariIni());
  } else if (aksi === "catatan-baru") {
    pindahKeBagian("catatan");
    requestAnimationFrame(() => {
      const btnTambah = document.getElementById("btn-tambah-catatan-singkat");
      if (btnTambah) {
        btnTambah.click();
      }
    });
  }
}

export function hentikanSemuaLanggananData() {
  unsubscribeKegiatan();
  unsubscribeDokumen();
  unsubscribeCatatan();
  unsubscribeLaporan();
  resetCacheDrive();
  resetHalamanJadwalSaatKeluar();
  resetHalamanPengaturanSaatKeluar();
  resetPembersihanSampah();
  bersihkanPencarianGlobal();
  while (dataUnsubscribers.length > 0) {
    const unsub = dataUnsubscribers.pop();
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (_err) {}
    }
  }
}

function tampilkanLayarUtama(namaLayar) {
  const layarChecking = document.getElementById("screen-checking");
  const layarConfigError = document.getElementById("screen-config-error");
  const layarLogin = document.getElementById("screen-login");
  const layarApp = document.getElementById("app-shell");

  if (layarChecking) layarChecking.hidden = namaLayar !== "checking";
  if (layarConfigError) layarConfigError.hidden = namaLayar !== "config-error";
  if (layarLogin) layarLogin.hidden = namaLayar !== "login";
  if (layarApp) layarApp.hidden = namaLayar !== "app";

  if (namaLayar !== "app") {
    tutupDrawerMobile(false);
    tutupDialogKeluar(false);
  }

  perbaruiVisibilitasSpandukSw();
}

function setPesanGalatLogin(pesan) {
  const kotak = document.getElementById("login-error-box");
  const teks = document.getElementById("login-error-text");
  if (!kotak || !teks) return;
  const bersih = pesan ? pesan.trim() : "";
  teks.textContent = bersih;
  kotak.hidden = !bersih;
}

function perbaruiTanggalHeader() {
  const el = document.getElementById("header-date-text");
  if (!el) return;
  const isoLokal = hariIni();
  const tgl = parseTanggal(isoLokal);
  el.textContent = tgl
    ? `${NAMA_HARI[tgl.getDay()]}, ${tgl.getDate()} ${NAMA_BULAN[tgl.getMonth()]} ${tgl.getFullYear()}`
    : isoLokal;
}

function renderStatusKosongKartuDashboard(ikonSvg, pesan) {
  return `<div class="dash-empty-box">
    <span class="dash-empty-icon" aria-hidden="true">${ikonSvg}</span>
    <p class="dash-empty-text">${escapeHtml(pesan)}</p>
  </div>`;
}

function pastikanKerangkaDashboard() {
  const panel = document.getElementById("section-dashboard");
  if (!panel || panel.querySelector("#dashboard-cards-grid")) return;

  // Urutan DOM mengikuti urutan bacaan alami di HP (<600px):
  // 1. Kegiatan hari ini, 2. 7 hari ke depan, 3. Catatan, 4. Dokumen terbaru.
  // Pada >=600px, CSS Grid dengan grid-template-areas menyusunnya menjadi 2 kolom x 2 baris.
  panel.innerHTML = `<div class="page-stack dashboard-container">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Ringkasan Hari Ini</h2>
        <p id="dashboard-subtitle-tanggal" class="section-heading-subtitle"></p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-dashboard-buka-jadwal" class="btn-secondary">${svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 17)}<span>Buka Jadwal</span></button>
        <button type="button" id="btn-dashboard-tambah-kegiatan" class="btn-primary">${svgIkon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18, 2.2)}<span>Tambah kegiatan</span></button>
      </div>
    </div>
    <div id="dashboard-backup-reminder-banner" class="backup-reminder-banner" role="status" hidden></div>
    <div id="dashboard-cards-grid" class="dashboard-cards-grid">
      <section class="dash-card dash-area-hari-ini" aria-labelledby="dash-title-hari-ini">
        <div class="dash-card-header dash-card-header-hari-ini">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-hari-ini" class="dash-card-title">Kegiatan hari ini</h3>
            <span id="dash-meta-hari-ini" class="dash-card-caption"></span>
          </div>
          <div class="dash-header-controls-hari-ini">
            <div class="segmented-control segmented-control-sm" role="group" aria-label="Tampilan kegiatan hari ini">
              <button
                type="button"
                id="btn-dash-view-timeline"
                class="segmented-btn${modeTampilanHariIni === "timeline" ? " is-active" : ""}"
                data-dash-view="timeline"
                aria-pressed="${modeTampilanHariIni === "timeline" ? "true" : "false"}"
              >
                ${svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 15)}
                <span>Timeline</span>
              </button>
              <button
                type="button"
                id="btn-dash-view-list"
                class="segmented-btn${modeTampilanHariIni === "daftar" ? " is-active" : ""}"
                data-dash-view="daftar"
                aria-pressed="${modeTampilanHariIni === "daftar" ? "true" : "false"}"
              >
                ${svgIkon('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', 15)}
                <span>Daftar</span>
              </button>
            </div>
            <span id="dash-count-hari-ini" class="dash-metric-number">0</span>
          </div>
        </div>
        <div id="dash-body-hari-ini" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="tambah-hari-ini">+ Tambah kegiatan hari ini</button>
          <button type="button" class="btn-link-filter" data-dash-action="jadwal-hari-ini">Lihat di kalender</button>
        </div>
      </section>

      <section class="dash-card dash-area-7hari" aria-labelledby="dash-title-7hari">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-7hari" class="dash-card-title">7 hari ke depan</h3>
            <span id="dash-meta-7hari" class="dash-card-caption"></span>
          </div>
          <span id="dash-count-7hari" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-7hari" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="buka-jadwal">Buka halaman Jadwal</button>
        </div>
      </section>

      <section class="dash-card dash-area-catatan" aria-labelledby="dash-title-catatan">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-catatan" class="dash-card-title">Catatan</h3>
            <span class="dash-card-caption">Tersemat &amp; terbaru diperbarui</span>
          </div>
          <span id="dash-count-catatan" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-catatan" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="buka-catatan">Lihat semua</button>
        </div>
      </section>

      <section class="dash-card dash-area-dokumen" aria-labelledby="dash-title-dokumen">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-dokumen" class="dash-card-title">Dokumen terbaru</h3>
            <span class="dash-card-caption">5 berkas terakhir di Google Drive</span>
          </div>
          <span id="dash-count-dokumen" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-dokumen" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" id="btn-dash-unggah-dokumen" class="btn-link-filter" data-dash-action="unggah-dokumen">+ Unggah dokumen</button>
          <button type="button" class="btn-link-filter" data-dash-action="buka-dokumen">Semua dokumen</button>
        </div>
      </section>
    </div>
  </div>`;
}

function renderBarisKegiatanDashboard(item, tampilkanTanggal) {
  const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
  const labelWaktu = item.waktuMulai
    ? item.waktuSelesai
      ? `${item.waktuMulai}–${item.waktuSelesai}`
      : item.waktuMulai
    : "Sepanjang hari";
  const infoSub = tampilkanTanggal
    ? `${formatTanggalRingkasIndonesia(item.tanggal)} • ${labelWaktu}`
    : labelWaktu;

  return `<li class="dash-activity-item${item.status === "Selesai" ? " is-completed" : ""}">
    <div class="dash-activity-main">
      <button type="button" class="dash-activity-title-btn" data-dash-action="detail-kegiatan" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.judul)}">${escapeHtml(item.judul)}</button>
      <div class="dash-activity-meta">
        <span class="dash-activity-time">${escapeHtml(infoSub)}</span>
        <span class="dash-meta-sep" aria-hidden="true">•</span>
        <span class="dash-cat-inline"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
      </div>
    </div>
    <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
  </li>`;
}

function renderKartuDokumenDashboard() {
  const bodyDokumen = document.getElementById("dash-body-dokumen");
  const countDokumen = document.getElementById("dash-count-dokumen");
  const btnUnggahDash = document.getElementById("btn-dash-unggah-dokumen");
  if (btnUnggahDash instanceof HTMLButtonElement) {
    btnUnggahDash.disabled = !navigator.onLine;
    btnUnggahDash.title = navigator.onLine
      ? "Unggah dokumen ke Google Drive"
      : "Tidak ada koneksi internet. Pengunggahan memerlukan sambungan aktif.";
  }
  if (!bodyDokumen) return;

  if (!isDokumenSudahDimuat()) {
    bodyDokumen.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat arsip dokumen"><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div>`;
    return;
  }

  const semuaDokumen = getDaftarDokumen();
  if (countDokumen) countDokumen.textContent = String(semuaDokumen.length);

  if (semuaDokumen.length === 0) {
    bodyDokumen.innerHTML = renderStatusKosongKartuDashboard(
      svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', 20),
      "Belum ada dokumen yang diunggah ke Google Drive."
    );
    return;
  }

  const limaTerbaru = [...semuaDokumen]
    .sort((a, b) =>
      String(b.tanggalUnggah || b.createdAt || "").localeCompare(
        String(a.tanggalUnggah || a.createdAt || ""),
      ),
    )
    .slice(0, 5);

  const htmlItem = limaTerbaru
    .map((dok) => {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
      const jenis = infoJenisBerkasMime(dok.mimeType, dok.namaFile);
      const nama = dok.namaTampilan || dok.namaFile || "Dokumen";
      const tanggalLokalStr = formatTanggalDokumenLokal(
        dok.tanggalUnggah || dok.createdAt,
      );
      const ukuranStr = formatUkuranBerkas(dok.ukuran);
      const tautanAman =
        dok.tautan && /^https?:\/\//i.test(dok.tautan)
          ? dok.tautan
          : dok.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(dok.driveFileId)}/view`
            : "#";

      return `<li class="dash-doc-item">
        <div class="dash-activity-main">
          <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="dash-doc-link" title="Buka ${escapeHtml(nama)} di Google Drive">
            <span class="dash-doc-link-text">${escapeHtml(nama)}</span>
          </a>
          <div class="dash-activity-meta">
            <span>${escapeHtml(jenis.label)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span>${escapeHtml(ukuranStr)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span>${escapeHtml(tanggalLokalStr)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span class="dash-cat-inline"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
          </div>
        </div>
      </li>`;
    })
    .join("");

  const sisa = semuaDokumen.length - limaTerbaru.length;
  bodyDokumen.innerHTML = `<ul class="dash-doc-list">${htmlItem}</ul>${
    sisa > 0
      ? `<div class="dash-more-row">
          <span class="dash-more-note">+${sisa} dokumen lainnya</span>
          <button type="button" class="btn-link-filter" data-dash-action="buka-dokumen">Lihat semua (${semuaDokumen.length}) &rarr;</button>
        </div>`
      : ""
  }`;
}

function buatCuplikanPolosCatatan(isiMentah, maksKarakter = 80) {
  const tanpaTag = String(isiMentah || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!tanpaTag) return "";
  if (tanpaTag.length <= maksKarakter) return tanpaTag;
  return `${tanpaTag.slice(0, maksKarakter).trimEnd()}…`;
}

function renderKartuCatatanDashboard() {
  const bodyCatatan = document.getElementById("dash-body-catatan");
  const countCatatan = document.getElementById("dash-count-catatan");
  if (!bodyCatatan) return;

  if (!isCatatanSudahDimuat()) {
    if (countCatatan) countCatatan.textContent = "0";
    bodyCatatan.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar catatan"><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div>`;
    return;
  }

  const semuaCatatan = getDaftarCatatan();
  if (countCatatan) countCatatan.textContent = String(semuaCatatan.length);

  const ikonSingkat = svgIkon(
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    16,
  );
  const ikonGdoc = svgIkon(
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="19" x2="12" y2="19"/>',
    16,
  );
  const ikonPinKecil = svgIkon(
    '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
    13,
  );

  if (semuaCatatan.length === 0) {
    bodyCatatan.innerHTML = `<div class="dash-empty-box">
      <span class="dash-empty-icon" aria-hidden="true">${svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20)}</span>
      <p class="dash-empty-text">Belum ada catatan.</p>
      <button type="button" class="btn-link-filter" data-dash-action="buat-catatan">Buat catatan</button>
    </div>`;
    return;
  }

  const petaKegiatan = new Map(
    getDaftarKegiatan().map((k) => [k.id, k.judul || ""]),
  );

  const limaCatatan = [...semuaCatatan]
    .sort((a, b) => {
      const pinDiff = (b.disematkan ? 1 : 0) - (a.disematkan ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      const updA = String(a.updatedAt || a.createdAt || "");
      const updB = String(b.updatedAt || b.createdAt || "");
      if (updA !== updB) return updB.localeCompare(updA);
      const tglA = String(a.tanggal || "");
      const tglB = String(b.tanggal || "");
      if (tglA !== tglB) return tglB.localeCompare(tglA);
      return String(a.judul || "").localeCompare(String(b.judul || ""), "id", {
        sensitivity: "base",
      });
    })
    .slice(0, 5);

  const htmlItem = limaCatatan
    .map((cat) => {
      const adalahGdoc = cat.jenis === JENIS_CATATAN_GDOC;
      const judul = cat.judul || "Tanpa judul";
      const tanggalStr = formatTanggalCatatan(cat.tanggal);
      const namaKegiatan = cat.kegiatanId
        ? petaKegiatan.get(cat.kegiatanId) || ""
        : "";
      const cuplikan = !adalahGdoc ? buatCuplikanPolosCatatan(cat.isi, 80) : "";

      const isiDalam = `<span class="dash-note-type-icon ${adalahGdoc ? "catatan-icon-gdoc" : "catatan-icon-singkat"}" title="${adalahGdoc ? "Google Docs" : "Catatan Singkat"}" aria-hidden="true">${adalahGdoc ? ikonGdoc : ikonSingkat}</span>
        <span class="dash-note-main">
          <span class="dash-note-title-row">
            <span class="dash-note-title">${escapeHtml(judul)}</span>
            ${cat.disematkan ? `<span class="dash-note-pin" title="Catatan disematkan" aria-label="Catatan disematkan">${ikonPinKecil}</span>` : ""}
          </span>
          <span class="dash-activity-meta">
            <span>${escapeHtml(tanggalStr)}</span>
            ${namaKegiatan ? `<span class="dash-meta-sep" aria-hidden="true">•</span><span class="dash-note-kegiatan">${escapeHtml(namaKegiatan)}</span>` : ""}
          </span>
          ${cuplikan ? `<span class="dash-note-snippet">${escapeHtml(cuplikan)}</span>` : ""}
        </span>`;

      if (adalahGdoc) {
        const urlDocs = tautanAmanGoogleDocs(cat);
        if (urlDocs && urlDocs !== "#") {
          return `<li class="dash-note-item">
            <a href="${escapeHtml(urlDocs)}" target="_blank" rel="noopener" class="dash-note-trigger" title="Buka ${escapeHtml(judul)} di Google Docs">${isiDalam}</a>
          </li>`;
        }
      }

      return `<li class="dash-note-item">
        <button type="button" class="dash-note-trigger" data-dash-action="buka-catatan-item" data-id="${escapeHtml(cat.id)}" title="Buka catatan: ${escapeHtml(judul)}">${isiDalam}</button>
      </li>`;
    })
    .join("");

  const sisa = semuaCatatan.length - limaCatatan.length;
  bodyCatatan.innerHTML = `<ul class="dash-note-list">${htmlItem}</ul>${
    sisa > 0
      ? `<div class="dash-more-row"><span class="dash-more-note">+${sisa} catatan lainnya</span></div>`
      : ""
  }`;
}

function perbaruiBannerPengingatCadangan() {
  const banner = document.getElementById("dashboard-backup-reminder-banner");
  if (!banner) return;

  const status = getStatusCadangan();

  // 1. Pengingat tidak nonaktif
  if (status.intervalHari === 0) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  // 2. Data kegiatan, catatan, dan dokumen sudah dimuat dan total item minimal 1
  if (!isKegiatanSudahDimuat() || !isDokumenSudahDimuat() || !isCatatanSudahDimuat()) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  const totalItem =
    getDaftarKegiatan().length +
    getDaftarDokumen().length +
    getDaftarCatatan().length;
  if (totalItem < 1) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  // 4. Pengguna tidak sedang menunda
  if (apakahSedangMenundaCadangan()) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  // 3. Belum pernah ekspor ATAU selisih hari sejak ekspor terakhir >= intervalHari
  let teksBanner = "";
  if (!status.terakhirEksporAt) {
    teksBanner = "Anda belum pernah mengekspor cadangan data.";
  } else {
    const selisihHari = hitungSelisihHariCadangan(status.terakhirEksporAt);
    if (selisihHari === null || selisihHari < status.intervalHari) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }
    teksBanner = `Cadangan terakhir ${selisihHari} hari lalu. Ekspor sekarang untuk mengamankan data Anda.`;
  }

  banner.innerHTML = `
    <div class="backup-reminder-content">
      <span class="backup-reminder-icon" aria-hidden="true">${svgIkon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 20)}</span>
      <p class="backup-reminder-text">${escapeHtml(teksBanner)}</p>
    </div>
    <div class="backup-reminder-actions">
      <button type="button" id="btn-backup-reminder-export" class="btn-primary btn-sm-touch">${svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 16)}<span>Ekspor sekarang</span></button>
      <button type="button" id="btn-backup-reminder-snooze" class="btn-secondary btn-sm-touch">Ingatkan 3 hari lagi</button>
    </div>
  `;
  banner.hidden = false;
}

function renderDashboard() {
  pastikanKerangkaDashboard();
  perbaruiBannerPengingatCadangan();

  const strHariIni = hariIni();
  const strBesok = tambahHari(1);
  const strTujuhHari = tambahHari(7);

  const subtitleEl = document.getElementById("dashboard-subtitle-tanggal");
  if (subtitleEl) {
    subtitleEl.textContent = `Ikhtisar jadwal, catatan, dan arsip dokumen Anda pada ${formatTanggalLengkapIndonesia(strHariIni)}.`;
  }

  const metaHariIniEl = document.getElementById("dash-meta-hari-ini");
  const meta7HariEl = document.getElementById("dash-meta-7hari");
  if (metaHariIniEl)
    metaHariIniEl.textContent = formatTanggalRingkasIndonesia(strHariIni);
  if (meta7HariEl)
    meta7HariEl.textContent = `${formatTanggalRingkasIndonesia(strBesok)} – ${formatTanggalRingkasIndonesia(strTujuhHari)}`;

  renderKartuCatatanDashboard();
  renderKartuDokumenDashboard();

  const bodyHariIni = document.getElementById("dash-body-hari-ini");
  const body7Hari = document.getElementById("dash-body-7hari");
  const countHariIni = document.getElementById("dash-count-hari-ini");
  const count7Hari = document.getElementById("dash-count-7hari");
  if (!bodyHariIni || !body7Hari) return;

  if (!isKegiatanSudahDimuat()) {
    const muatHtml = `<div class="skeleton-stack" role="status" aria-label="Memuat data kegiatan"><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-50"></div></div>`;
    bodyHariIni.innerHTML = muatHtml;
    body7Hari.innerHTML = muatHtml;
    return;
  }

  const semuaKegiatan = getDaftarKegiatan();

  const kegiatanHariIni = urutkanKegiatanKronologis(
    semuaKegiatan.filter(
      (item) =>
        Boolean(parseTanggal(item.tanggal)) && item.tanggal === strHariIni,
    ),
  );

  const kegiatan7Hari = urutkanKegiatanKronologis(
    semuaKegiatan.filter(
      (item) =>
        Boolean(parseTanggal(item.tanggal)) &&
        item.tanggal > strHariIni &&
        item.tanggal <= strTujuhHari,
    ),
  );

  if (countHariIni) countHariIni.textContent = String(kegiatanHariIni.length);
  if (count7Hari) count7Hari.textContent = String(kegiatan7Hari.length);

  const btnViewTimeline = document.getElementById("btn-dash-view-timeline");
  const btnViewList = document.getElementById("btn-dash-view-list");
  if (btnViewTimeline && btnViewList) {
    const isTimeline = modeTampilanHariIni === "timeline";
    btnViewTimeline.classList.toggle("is-active", isTimeline);
    btnViewTimeline.setAttribute("aria-pressed", isTimeline ? "true" : "false");
    btnViewList.classList.toggle("is-active", !isTimeline);
    btnViewList.setAttribute("aria-pressed", !isTimeline ? "true" : "false");
  }

  if (kegiatanHariIni.length === 0) {
    bersihkanTimelineHarian(bodyHariIni);
    bodyHariIni.innerHTML = renderStatusKosongKartuDashboard(
      svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 20),
      "Belum ada kegiatan yang dijadwalkan untuk hari ini."
    );
  } else if (modeTampilanHariIni === "timeline") {
    renderTimelineHarian(bodyHariIni, kegiatanHariIni, {
      tanggal: strHariIni,
      ambilWarna: (katId) => manajerKategoriKegiatan.cariInfoKategori(katId).warna,
      ambilNamaKategori: (katId) => manajerKategoriKegiatan.cariInfoKategori(katId).nama,
      saatKlik: (idKegiatan) => {
        if (idKegiatan) bukaDialogDetailKegiatan(idKegiatan);
      },
    });
  } else {
    bersihkanTimelineHarian(bodyHariIni);
    const maks = 5;
    const sisa = kegiatanHariIni.length - maks;
    bodyHariIni.innerHTML = `<ul class="dash-activity-list">${kegiatanHariIni
      .slice(0, maks)
      .map((item) => renderBarisKegiatanDashboard(item, false))
      .join(
        "",
      )}</ul>${
      sisa > 0
        ? `<div class="dash-more-row">
            <span class="dash-more-note">+${sisa} kegiatan lainnya hari ini</span>
            <button type="button" class="btn-link-filter" data-dash-action="jadwal-hari-ini">Lihat semua (${kegiatanHariIni.length}) &rarr;</button>
          </div>`
        : ""
    }`;
  }

  if (kegiatan7Hari.length === 0) {
    body7Hari.innerHTML = renderStatusKosongKartuDashboard(
      svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 20),
      `Tidak ada kegiatan terjadwal untuk 7 hari ke depan (besok hingga ${formatTanggalRingkasIndonesia(strTujuhHari)}).`
    );
  } else {
    const maks7 = 5;
    const sisa7 = kegiatan7Hari.length - maks7;
    body7Hari.innerHTML = `<ul class="dash-activity-list">${kegiatan7Hari
      .slice(0, maks7)
      .map((item) => renderBarisKegiatanDashboard(item, true))
      .join(
        "",
      )}</ul>${
      sisa7 > 0
        ? `<div class="dash-more-row">
            <span class="dash-more-note">+${sisa7} kegiatan lainnya</span>
            <button type="button" class="btn-link-filter" data-dash-action="buka-jadwal">Lihat semua (${kegiatan7Hari.length}) &rarr;</button>
          </div>`
        : ""
    }`;
  }
}

function initHalamanDashboard() {
  pastikanKerangkaDashboard();
  if (dashboardSudahDiikat) return;
  dashboardSudahDiikat = true;

  const panel = document.getElementById("section-dashboard");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      if (targetEl.closest("#btn-dashboard-buka-jadwal")) {
        pindahKeBagian("jadwal");
        return;
      }
      if (targetEl.closest("#btn-dashboard-tambah-kegiatan")) {
        bukaModalFormKegiatan(null, hariIni());
        return;
      }

      if (targetEl.closest("#btn-backup-reminder-export")) {
        eksporSeluruhDataJson();
        return;
      }

      if (targetEl.closest("#btn-backup-reminder-snooze")) {
        tundaPengingatCadangan(3);
        perbaruiBannerPengingatCadangan();
        tampilkanToast("Pengingat cadangan ditunda selama 3 hari.", "info");
        return;
      }

      const btnViewSwitch = targetEl.closest("button[data-dash-view]");
      if (btnViewSwitch) {
        const viewMode = btnViewSwitch.getAttribute("data-dash-view");
        if (viewMode === "timeline" || viewMode === "daftar") {
          modeTampilanHariIni = viewMode;
          simpanPreferensiTampilanHariIni(viewMode);
          renderDashboard();
        }
        return;
      }

      const btnAksi = targetEl.closest("button[data-dash-action]");
      if (!btnAksi) return;

      const aksi = btnAksi.getAttribute("data-dash-action");
      if (aksi === "tambah-hari-ini") bukaModalFormKegiatan(null, hariIni());
      else if (aksi === "jadwal-hari-ini") bukaJadwalPadaTanggal(hariIni());
      else if (aksi === "buka-jadwal") pindahKeBagian("jadwal");
      else if (aksi === "buka-catatan") pindahKeBagian("catatan");
      else if (aksi === "buat-catatan") {
        pindahKeBagian("catatan");
        requestAnimationFrame(() => {
          document.getElementById("btn-tambah-catatan-singkat")?.focus();
        });
      } else if (aksi === "buka-catatan-item") {
        const id = btnAksi.getAttribute("data-id") || "";
        pindahKeBagian("catatan");
        if (id) sorotCatatanDiHalaman(id);
      } else if (aksi === "detail-kegiatan") {
        const id = btnAksi.getAttribute("data-id") || "";
        if (id) bukaDialogDetailKegiatan(id);
      } else if (aksi === "unggah-dokumen") {
        pindahKeBagian("dokumen");
        bukaModalUnggahDokumen();
      } else if (aksi === "buka-dokumen") {
        pindahKeBagian("dokumen");
      }
    });
  }

  onPerubahanKegiatan(() => {
    renderDashboard();
    renderHalamanSampah();
    jalankanPembersihanSampahOtomatis();
  });
  onPerubahanDokumen(() => {
    renderKartuDokumenDashboard();
    perbaruiBannerPengingatCadangan();
  });
  onPerubahanCatatan(() => {
    renderKartuCatatanDashboard();
    perbaruiBannerPengingatCadangan();
    renderHalamanSampah();
    jalankanPembersihanSampahOtomatis();
  });
  onPerubahanCadangan(() => perbaruiBannerPengingatCadangan());
  renderDashboard();
}

function periksaStatusTokenDrive() {
  const banner = document.getElementById("token-expired-banner");
  const teksBanner = document.getElementById("token-expired-text");
  const btnRelogin = document.getElementById("relogin-drive-btn");
  const expired = isDriveTokenExpired();
  const online = navigator.onLine;

  if (banner) banner.hidden = !expired;
  if (expired && teksBanner) {
    teksBanner.textContent = online
      ? "Sesi akses Google Drive telah kedaluwarsa atau belum aktif. Masuk ulang diperlukan sebelum mengakses berkas Drive."
      : "Sesi akses Google Drive sedang tidak aktif. Izin Drive dapat diperbarui kembali setelah perangkat terhubung ke internet.";
  }
  if (btnRelogin instanceof HTMLButtonElement && !btnRelogin.hasAttribute("data-busy")) {
    btnRelogin.disabled = !online;
    btnRelogin.title = online
      ? "Perbarui sesi Google Drive"
      : "Sambungkan ke internet untuk memperbarui izin Google Drive";
  }

  segarkanTampilanPengaturan();
}

function mulaiPemantauTokenDrive() {
  hentikanPemantauTokenDrive();
  periksaStatusTokenDrive();
  tokenCheckIntervalId = window.setInterval(periksaStatusTokenDrive, 30 * 1000);
}

function hentikanPemantauTokenDrive() {
  if (tokenCheckIntervalId !== null) {
    window.clearInterval(tokenCheckIntervalId);
    tokenCheckIntervalId = null;
  }
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = true;
}

function perbaruiIndikatorJaringan(dariEvent = false) {
  const online = navigator.onLine;
  const offlineBanner = document.getElementById("offline-banner");
  if (offlineBanner) offlineBanner.hidden = online;

  perbaruiStatusKoneksiSidebar(online);
  perbaruiStatusJaringanDokumen();
  perbaruiStatusJaringanCatatan();
  perbaruiStatusJaringanLaporan();
  renderKartuDokumenDashboard();
  periksaStatusTokenDrive();

  if (dariEvent && online !== statusOnlineTerakhir && !document.getElementById("app-shell")?.hidden) {
    tampilkanToast(
      online
        ? "Koneksi internet pulih. Fitur Google Drive dan Sheets aktif kembali."
        : "Perangkat sedang luring. Menampilkan data tersimpan di perangkat.",
      online ? "success" : "warning"
    );
  }
  statusOnlineTerakhir = online;
}

function bukaDialogKeluar(pemicuFokus = null) {
  const modal = document.getElementById("logout-confirm-modal");
  const btnBatal = document.getElementById("logout-cancel-btn");
  if (!modal) return;

  focusBeforeModal =
    pemicuFokus instanceof HTMLElement
      ? pemicuFokus
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : document.getElementById("sidebar-logout-btn");
  logoutDialogOpen = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

function tutupDialogKeluar(kembalikanFokus = true) {
  const modal = document.getElementById("logout-confirm-modal");
  if (!modal || !logoutDialogOpen) return;

  logoutDialogOpen = false;
  modal.hidden = true;
  if (kembalikanFokus) {
    const targetFokus =
      focusBeforeModal && document.contains(focusBeforeModal)
        ? focusBeforeModal
        : document.getElementById("sidebar-logout-btn");
    if (targetFokus instanceof HTMLElement) {
      targetFokus.focus();
    }
  }
  focusBeforeModal = null;
}

function pasangEventListenerAntarmuka() {
  const btnLogin = document.getElementById("google-login-btn");
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      setPesanGalatLogin("");
      btnLogin.disabled = true;
      btnLogin.setAttribute("aria-busy", "true");
      const labelEl = btnLogin.querySelector(".btn-google-label");
      const teksAwal = labelEl ? labelEl.textContent : "Masuk dengan Google";
      if (labelEl) labelEl.textContent = "Menghubungkan ke Google...";

      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
      } catch (err) {
        aksiPintasanTertunda = null;
        const pesanTertunda = consumeLastAuthError();
        setPesanGalatLogin(pesanTertunda || formatPesanGalatAuth(err));
      } finally {
        btnLogin.disabled = false;
        btnLogin.removeAttribute("aria-busy");
        if (labelEl) labelEl.textContent = teksAwal;
      }
    });
  }

  const btnRelogin = document.getElementById("relogin-drive-btn");
  if (btnRelogin) {
    btnRelogin.addEventListener("click", async () => {
      if (!navigator.onLine) {
        tampilkanToast(
          "Tidak dapat memperbarui izin Google Drive saat luring. Sambungkan ke internet terlebih dahulu.",
          "warning"
        );
        return;
      }
      btnRelogin.disabled = true;
      btnRelogin.setAttribute("data-busy", "true");
      const teksAwal = btnRelogin.textContent;
      btnRelogin.textContent = "Memuat...";
      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
        tampilkanToast("Izin akses Google Drive berhasil diperbarui.", "success");
      } catch (err) {
        const bannerText = document.getElementById("token-expired-text");
        if (bannerText)
          bannerText.textContent = `Gagal memperbarui sesi Drive: ${formatPesanGalatAuth(err)}`;
      } finally {
        btnRelogin.removeAttribute("data-busy");
        btnRelogin.disabled = !navigator.onLine;
        btnRelogin.textContent = teksAwal;
      }
    });
  }

  const modalLogout = document.getElementById("logout-confirm-modal");
  const btnBatalLogout = document.getElementById("logout-cancel-btn");
  const btnKonfirmasiLogout = document.getElementById("logout-confirm-btn");

  if (btnBatalLogout)
    btnBatalLogout.addEventListener("click", () => tutupDialogKeluar(true));
  if (modalLogout)
    modalLogout.addEventListener("click", (e) => {
      if (e.target === modalLogout) tutupDialogKeluar(true);
    });

  if (btnKonfirmasiLogout) {
    btnKonfirmasiLogout.addEventListener("click", async () => {
      btnKonfirmasiLogout.disabled = true;
      try {
        tutupDialogKeluar(false);
        hentikanSemuaLanggananData();
        hentikanPemantauTokenDrive();
        await logoutUser();
      } catch (err) {
        setPesanGalatLogin(formatPesanGalatAuth(err));
      } finally {
        btnKonfirmasiLogout.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!logoutDialogOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupDialogKeluar(true);
      return;
    }
    if (e.key === "Tab" && modalLogout) {
      const tombol = Array.from(
        modalLogout.querySelectorAll("button:not([disabled])"),
      );
      if (tombol.length === 0) return;
      const pertama = tombol[0];
      const terakhir = tombol[tombol.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    }
  });

  window.addEventListener("online", () => perbaruiIndikatorJaringan(true));
  window.addEventListener("offline", () => perbaruiIndikatorJaringan(true));
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      !document.getElementById("app-shell")?.hidden
    ) {
      periksaStatusTokenDrive();
      perbaruiTanggalHeader();
      renderDashboard();
      renderHalamanJadwal();
      segarkanTampilanPengaturan();
    }
  });
}

let deferredInstallPrompt = null;

function initPwaInstallPrompt() {
  const btnInstall = document.getElementById("pwa-install-btn");
  const iosModal = document.getElementById("ios-install-modal");
  const btnTutupIos = document.getElementById("ios-install-close-btn");
  if (!btnInstall) return;

  const sedangStandalone =
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (sedangStandalone) {
    btnInstall.hidden = true;
    return;
  }

  const perangkatIos = /iphone|ipad|ipod/.test(
    window.navigator.userAgent.toLowerCase(),
  );
  if (perangkatIos) btnInstall.hidden = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstall.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    btnInstall.hidden = true;
  });

  btnInstall.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const pilihan = await deferredInstallPrompt.userChoice;
      if (pilihan && pilihan.outcome === "accepted") btnInstall.hidden = true;
      deferredInstallPrompt = null;
    } else if (perangkatIos && iosModal) {
      iosModal.hidden = false;
      if (btnTutupIos instanceof HTMLElement) btnTutupIos.focus();
    }
  });

  if (btnTutupIos && iosModal) {
    btnTutupIos.addEventListener("click", () => {
      iosModal.hidden = true;
      btnInstall.focus();
    });
    iosModal.addEventListener("click", (e) => {
      if (e.target === iosModal) {
        iosModal.hidden = true;
        btnInstall.focus();
      }
    });
  }
}

function apakahUpdateSwDitunda() {
  try {
    return sessionStorage.getItem(KUNCI_TUNDA_UPDATE_SW) === "1";
  } catch (_err) {
    return false;
  }
}

function simpanPenandaTundaUpdateSw() {
  try {
    sessionStorage.setItem(KUNCI_TUNDA_UPDATE_SW, "1");
  } catch (_err) {}
}

function hapusPenandaTundaUpdateSw() {
  try {
    sessionStorage.removeItem(KUNCI_TUNDA_UPDATE_SW);
  } catch (_err) {}
}

function apakahLayarAplikasiAktif() {
  const layarApp = document.getElementById("app-shell");
  return Boolean(layarApp && !layarApp.hidden);
}

function perbaruiVisibilitasSpandukSw() {
  const spanduk = document.getElementById("sw-update-banner");
  if (!spanduk) return;

  const tampil =
    swUpdateMenunggu &&
    apakahLayarAplikasiAktif() &&
    !apakahUpdateSwDitunda();

  spanduk.hidden = !tampil;
  if (tampil) {
    document.documentElement.setAttribute("data-sw-banner", "visible");
  } else {
    document.documentElement.removeAttribute("data-sw-banner");
  }
}

function tandaiPembaruanSwMenunggu() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    return;
  }
  swUpdateMenunggu = true;
  perbaruiVisibilitasSpandukSw();
}

function pantauWorkerInstalling(workerBaru) {
  if (!workerBaru) return;
  workerBaru.addEventListener("statechange", () => {
    if (
      workerBaru.state === "installed" &&
      navigator.serviceWorker.controller
    ) {
      hapusPenandaTundaUpdateSw();
      tandaiPembaruanSwMenunggu();
    }
  });
}

function ikatRegistrasiServiceWorker(registration) {
  if (!registration) return;
  swRegistration = registration;

  if (registration.waiting && navigator.serviceWorker.controller) {
    tandaiPembaruanSwMenunggu();
  }

  if (registrasiSwDipantau === registration) return;
  registrasiSwDipantau = registration;

  if (registration.installing) {
    pantauWorkerInstalling(registration.installing);
  }

  registration.addEventListener("updatefound", () => {
    pantauWorkerInstalling(registration.installing);
  });
}

async function periksaPembaruanSwBerkala() {
  if (!swRegistration) return;
  try {
    await swRegistration.update();
    if (swRegistration.waiting && navigator.serviceWorker.controller) {
      tandaiPembaruanSwMenunggu();
    }
  } catch (_err) {
    // Abaikan galat saat offline atau sambungan terputus
  }
}

function ikatTombolSpandukSw() {
  if (spandukSwSudahDiikat) return;
  spandukSwSudahDiikat = true;

  const btnMuatUlang = document.getElementById("sw-update-reload-btn");
  const btnNanti = document.getElementById("sw-update-later-btn");

  if (btnMuatUlang) {
    btnMuatUlang.addEventListener("click", () => {
      if (!("serviceWorker" in navigator) || sedangMuatUlangSw) return;
      const waitingWorker = swRegistration && swRegistration.waiting;
      if (!waitingWorker) {
        swUpdateMenunggu = false;
        perbaruiVisibilitasSpandukSw();
        return;
      }

      sedangMuatUlangSw = true;
      if (btnMuatUlang instanceof HTMLButtonElement) {
        btnMuatUlang.disabled = true;
        btnMuatUlang.textContent = "Memuat ulang...";
      }
      if (btnNanti instanceof HTMLButtonElement) {
        btnNanti.disabled = true;
      }

      let sudahReload = false;
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          if (sudahReload) return;
          sudahReload = true;
          location.reload();
        },
        { once: true },
      );

      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });
  }

  if (btnNanti) {
    btnNanti.addEventListener("click", () => {
      simpanPenandaTundaUpdateSw();
      perbaruiVisibilitasSpandukSw();
    });
  }
}

export async function periksaPembaruan() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  let registration =
    swRegistration || (await navigator.serviceWorker.getRegistration());
  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }
  ikatRegistrasiServiceWorker(registration);

  const hasilUpdate = await registration.update();
  const regAktif = hasilUpdate || registration;
  ikatRegistrasiServiceWorker(regAktif);

  if (regAktif.installing) {
    await new Promise((resolve) => {
      const workerBaru = regAktif.installing;
      if (
        !workerBaru ||
        workerBaru.state === "installed" ||
        workerBaru.state === "redundant"
      ) {
        resolve();
        return;
      }
      const saatStatusBerubah = () => {
        if (
          workerBaru.state === "installed" ||
          workerBaru.state === "redundant"
        ) {
          workerBaru.removeEventListener("statechange", saatStatusBerubah);
          resolve();
        }
      };
      workerBaru.addEventListener("statechange", saatStatusBerubah);
    });
  }

  if (regAktif.waiting && navigator.serviceWorker.controller) {
    hapusPenandaTundaUpdateSw();
    tandaiPembaruanSwMenunggu();
  }

  return regAktif;
}

function daftarkanServiceWorker() {
  ikatTombolSpandukSw();
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      ikatRegistrasiServiceWorker(registration);

      if (swUpdateIntervalId !== null) {
        window.clearInterval(swUpdateIntervalId);
      }
      swUpdateIntervalId = window.setInterval(() => {
        periksaPembaruanSwBerkala();
      }, INTERVAL_CEK_UPDATE_SW_MS);
    } catch (err) {
      console.warn("Pendaftaran Service Worker gagal:", err);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      periksaPembaruanSwBerkala();
    }
  });
}

function mulaiAplikasi() {
  bacaAksiPintasanDariUrl();
  initTema();
  daftarkanServiceWorker();
  initPwaInstallPrompt();

  const ownerBadge = document.getElementById("authorized-owner-email");
  if (ownerBadge) ownerBadge.textContent = AUTHORIZED_EMAIL;

  if (!isFirebaseConfigured()) {
    tampilkanLayarUtama("config-error");
    return;
  }

  tampilkanLayarUtama("checking");

  initSidebar({
    initialSection: "dashboard",
    onLogoutRequest: (pemicu) => bukaDialogKeluar(pemicu),
    onSectionChange: (sectionId) => {
      if (sectionId === "pengaturan") {
        segarkanTampilanPengaturan();
      } else if (sectionId === "sampah") {
        renderHalamanSampah();
      }
    },
  });

  daftarkanPembukaDetailKegiatan(bukaDialogDetailKegiatan);
  daftarkanPembukaDetailKegiatanCatatan(bukaDialogDetailKegiatan);

  initHalamanKegiatan();
  initHalamanJadwal();
  initHalamanDokumen();
  initHalamanCatatan();
  initHalamanLaporan();
  initHalamanPengaturan();
  initHalamanSampah();
  initHalamanDashboard();
  pasangEventListenerAntarmuka();
  perbaruiTanggalHeader();
  perbaruiIndikatorJaringan(false);

  try {
    initAuth((user, _token) => {
      hentikanSemuaLanggananData();

      if (!user) {
        hentikanPemantauTokenDrive();
        perbaruiInfoAkunSidebar(null);
        const pesanPenolakan = consumeLastAuthError();
        if (pesanPenolakan) {
          aksiPintasanTertunda = null;
          setPesanGalatLogin(pesanPenolakan);
        }
        tampilkanLayarUtama("login");
        return;
      }

      setPesanGalatLogin("");
      perbaruiInfoAkunSidebar(user);
      perbaruiTanggalHeader();
      tampilkanLayarUtama("app");
      mulaiPemantauTokenDrive();

      const unsubKegiatan = subscribeKegiatan();
      const unsubDokumen = subscribeDokumen();
      const unsubCatatan = subscribeCatatan();
      const unsubLaporan = subscribeLaporan();
      dataUnsubscribers.push(
        unsubKegiatan,
        unsubDokumen,
        unsubCatatan,
        unsubLaporan,
      );
      initPencarianGlobal({
        getDaftarKegiatan,
        getDaftarCatatan,
        getDaftarDokumen,
        onPilihHasil: (item) => {
          if (!item) return;
          if (item.kelompok === "kegiatan") {
            bukaDialogDetailKegiatan(item.id);
          } else if (item.kelompok === "catatan") {
            if (item.jenis === JENIS_CATATAN_GDOC) {
              const urlDocs = tautanAmanGoogleDocs(item);
              if (urlDocs && urlDocs !== "#") {
                window.open(urlDocs, "_blank", "noopener");
              }
            } else {
              pindahKeBagian("catatan");
              sorotCatatanDiHalaman(item.id);
            }
          } else if (item.kelompok === "dokumen") {
            pindahKeBagian("dokumen");
            const tautanAman =
              item.tautan && /^https?:\/\//i.test(item.tautan)
                ? item.tautan
                : item.driveFileId
                  ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
                  : "";
            if (tautanAman) {
              window.open(tautanAman, "_blank", "noopener");
            }
          }
        },
      });
      muatPengaturanCadangan();
      segarkanTampilanPengaturan();
      jalankanAksiPintasanSetelahLayarTampil();
    });
  } catch (err) {
    setPesanGalatLogin(formatPesanGalatAuth(err));
    tampilkanLayarUtama("login");
  }
}

mulaiAplikasi();
