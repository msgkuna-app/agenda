/**
 * Tampilan (View) Modul Dashboard (Tahap 3a: dipisah dari app.js)
 * Berisi seluruh pembentukan HTML dashboard: kerangka 4 kartu, baris kegiatan,
 * kartu dokumen, kartu catatan, banner pengingat cadangan, dan render utama.
 * Tidak memasang event listener (itu tugas controller.js) dan tidak mengubah state.
 */
import {
  escapeHtml,
  svgIkon,
} from "../../util-html.js";
import { hariIni, tambahHari, parseTanggal } from "../../util-tanggal.js";
import { infoHari } from "../../hari-libur.js";
import {
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  kelasBadgeStatus,
} from "../../modules/kegiatan/index.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime,
} from "../../modules/dokumen/index.js";
import {
  JENIS_CATATAN_GDOC,
  getDaftarCatatan,
  isCatatanSudahDimuat,
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
} from "../../catatan.js";
import { formatTanggalLengkapIndonesia, formatTanggalRingkasIndonesia, urutkanKegiatanKronologis } from "../../jadwal.js";
import {
  getStatusCadangan,
  hitungSelisihHariCadangan,
  apakahSedangMenundaCadangan,
} from "../pengaturan/index.js";
import {
  renderTimelineHarian,
  bersihkanTimelineHarian,
} from "../../timeline-harian.js";
import { modeTampilanHariIni } from "./state.js";

/**
 * HTML kotak status kosong seragam untuk kartu dashboard.
 * @param {string} ikonSvg
 * @param {string} pesan
 * @returns {string}
 */
function renderStatusKosongKartuDashboard(ikonSvg, pesan) {
  return `<div class="dash-empty-box">
    <span class="dash-empty-icon" aria-hidden="true">${ikonSvg}</span>
    <p class="dash-empty-text">${escapeHtml(pesan)}</p>
  </div>`;
}

/**
 * Membangun kerangka panel dashboard sekali saja (bila belum ada).
 */
function pastikanKerangkaDashboard() {
  const panel = document.getElementById("section-dashboard");
  if (!panel || panel.querySelector("#dashboard-cards-grid")) return;

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

/**
 * Satu baris kegiatan untuk kartu "hari ini" / "7 hari ke depan".
 * @param {object} item
 * @param {boolean} tampilkanTanggal
 * @returns {string}
 */
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

/**
 * Merender kartu "Dokumen terbaru".
 */
export function renderKartuDokumenDashboard() {
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

/**
 * Menghapus tag HTML dan memotong teks menjadi cuplikan polos.
 * @param {string} isiMentah
 * @param {number} [maksKarakter=80]
 * @returns {string}
 */
function buatCuplikanPolosCatatan(isiMentah, maksKarakter = 80) {
  const tanpaTag = String(isiMentah || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!tanpaTag) return "";
  if (tanpaTag.length <= maksKarakter) return tanpaTag;
  return `${tanpaTag.slice(0, maksKarakter).trimEnd()}…`;
}

/**
 * Merender kartu "Catatan" (tersemat & terbaru).
 */
export function renderKartuCatatanDashboard() {
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

/**
 * Memperbarui banner pengingat cadangan sesuai status cadangan terkini.
 */
export function perbaruiBannerPengingatCadangan() {
  const banner = document.getElementById("dashboard-backup-reminder-banner");
  if (!banner) return;

  const status = getStatusCadangan();

  if (status.intervalHari === 0) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

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

  if (apakahSedangMenundaCadangan()) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

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

/**
 * Merender seluruh isi dashboard (subjudul, 4 kartu, banner cadangan).
 * @param {{ bukaDetailKegiatan?: (id: string) => void }} [opsi]
 */
export function renderDashboard(opsi = {}) {
  pastikanKerangkaDashboard();
  perbaruiBannerPengingatCadangan();

  const strHariIni = hariIni();
  const strBesok = tambahHari(1);
  const strTujuhHari = tambahHari(7);
  const infoHariIni = infoHari(strHariIni);

  const subtitleEl = document.getElementById("dashboard-subtitle-tanggal");
  if (subtitleEl) {
    let teksTgl = formatTanggalLengkapIndonesia(strHariIni);
    if (infoHariIni.libur.length > 0) {
      teksTgl += ` (${infoHariIni.libur.map((l) => l.nama).join(", ")})`;
    } else if (infoHariIni.minggu) {
      teksTgl += ` (Hari Minggu)`;
    } else if (infoHariIni.hariBesar.length > 0) {
      teksTgl += ` (${infoHariIni.hariBesar.map((h) => h.nama).join(", ")})`;
    }
    subtitleEl.textContent = `Ikhtisar jadwal, catatan, dan arsip dokumen Anda pada ${teksTgl}.`;
    subtitleEl.classList.toggle("text-libur", infoHariIni.merah);
  }

  const metaHariIniEl = document.getElementById("dash-meta-hari-ini");
  const meta7HariEl = document.getElementById("dash-meta-7hari");
  if (metaHariIniEl) {
    metaHariIniEl.classList.toggle("text-libur", infoHariIni.merah);
    const teksRingkas = formatTanggalRingkasIndonesia(strHariIni);
    if (infoHariIni.libur.length > 0) {
      const namaLibur = infoHariIni.libur.map((l) => l.nama).join(", ");
      metaHariIniEl.innerHTML = `${escapeHtml(teksRingkas)} • <span class="badge-libur-inline">${escapeHtml(namaLibur)}</span>`;
    } else if (infoHariIni.minggu) {
      metaHariIniEl.innerHTML = `${escapeHtml(teksRingkas)} • <span class="badge-libur-inline">Minggu</span>`;
    } else if (infoHariIni.hariBesar.length > 0) {
      const namaBesar = infoHariIni.hariBesar.map((h) => h.nama).join(", ");
      metaHariIniEl.textContent = `${teksRingkas} • ${namaBesar}`;
    } else {
      metaHariIniEl.textContent = teksRingkas;
    }
  }
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
        if (!idKegiatan) return;
        if (typeof opsi.bukaDetailKegiatan === "function") {
          opsi.bukaDetailKegiatan(idKegiatan);
        }
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
