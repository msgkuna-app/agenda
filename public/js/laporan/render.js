/**
 * Modul Render & Manipulasi Tampilan Laporan
 * Menangani pembuatan kerangka halaman, sinkronisasi dropdown kategori,
 * perenderan pratinjau tabel & ringkasan, riwayat laporan, banner notifikasi,
 * dan sinkronisasi status tombol berdasarkan jaringan & validasi tanggal.
 */
import { escapeHtml } from "../sidebar.js";
import {
  DAFTAR_JENIS_LAPORAN,
  IKON_TABEL,
  IKON_UNDUH,
  IKON_TAB_BARU,
  IKON_HAPUS,
  svgIkon,
  formatTanggalSetempat,
  formatWaktuRiwayatLokal,
  ambilInfoJenisLaporan
} from "./util.js";
import {
  stateLaporan,
  validasiRentangTanggal,
  pastikanRentangDefault
} from "./state.js";
import {
  ambilDaftarOpsiKategoriLaporan,
  susunDataLaporanSaatIni
} from "./data.js";

export function tampilkanNotifikasiLaporan({
  pesan = "",
  tipe = "danger",
  butuhRelogin = false,
  tautanSheets = ""
} = {}) {
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

export function perbaruiStatusTombolLaporan() {
  const online = navigator.onLine;
  const cekTgl = validasiRentangTanggal();

  const btnBuat = document.getElementById("btn-laporan-buat-sheets");
  const btnCsv = document.getElementById("btn-laporan-unduh-csv");
  const offlineNote = document.getElementById("laporan-offline-note");

  if (offlineNote) offlineNote.hidden = online;

  if (btnBuat instanceof HTMLButtonElement) {
    btnBuat.disabled = !online || !cekTgl.valid || stateLaporan.sedangMembuatSpreadsheet;
    const labelSpan = btnBuat.querySelector("span");
    if (labelSpan) {
      labelSpan.textContent = stateLaporan.sedangMembuatSpreadsheet ? "Membuat Spreadsheet..." : "Buat Laporan";
    }
    btnBuat.title = !online
      ? "Tidak ada koneksi internet. Gunakan tombol Unduh CSV."
      : "Buat laporan baru di Google Sheets";
  }

  if (btnCsv instanceof HTMLButtonElement) {
    btnCsv.disabled = !cekTgl.valid || stateLaporan.sedangMembuatSpreadsheet;
  }
}

export function perbaruiStatusJaringanLaporan() {
  perbaruiStatusTombolLaporan();
}

export function sinkronkanDropdownKategoriLaporan() {
  const selectEl = document.getElementById("laporan-filter-kategori");
  if (!(selectEl instanceof HTMLSelectElement)) return;

  const opsi = ambilDaftarOpsiKategoriLaporan(stateLaporan.jenisAktif);
  const masihValid = opsi.some((o) => o.value === stateLaporan.filterKategori);
  if (!masihValid) {
    stateLaporan.filterKategori = "ALL";
  }

  selectEl.innerHTML = opsi
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join("");
  selectEl.value = stateLaporan.filterKategori;
}

export function renderPratinjauLaporan() {
  const countEl = document.getElementById("laporan-preview-count");
  const captionEl = document.getElementById("laporan-preview-caption");
  const bodyEl = document.getElementById("laporan-preview-body");
  const valBox = document.getElementById("laporan-validation-alert");
  const valText = document.getElementById("laporan-validation-text");
  if (!bodyEl) return;

  const paket = susunDataLaporanSaatIni(renderPratinjauLaporan);
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

export function renderRiwayatLaporan() {
  const region = document.getElementById("laporan-riwayat-region");
  const countBadge = document.getElementById("laporan-riwayat-count");
  if (!region) return;

  if (!stateLaporan.riwayatSudahDimuat) {
    region.innerHTML = `<div class="skeleton-card" role="status" aria-label="Memuat riwayat laporan"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div></div>`;
    return;
  }

  if (countBadge) countBadge.textContent = String(stateLaporan.daftarRiwayatLaporan.length);

  if (stateLaporan.daftarRiwayatLaporan.length === 0) {
    region.innerHTML = `<div class="empty-stage-card empty-stage-compact">
      <div class="empty-stage-icon" aria-hidden="true">${IKON_TABEL}</div>
      <h3 class="empty-stage-title">Belum Ada Riwayat Laporan</h3>
      <p class="empty-stage-desc">Setiap spreadsheet yang dibuat lewat tombol <strong>Buat Laporan</strong> akan tercatat di sini beserta tautan langsung ke Google Sheets.</p>
    </div>`;
    return;
  }

  const urutTerbaru = [...stateLaporan.daftarRiwayatLaporan].sort((a, b) =>
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

export function pastikanKerangkaHalamanLaporan() {
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
              (j) => `<option value="${escapeHtml(j.id)}"${j.id === stateLaporan.jenisAktif ? " selected" : ""}>${escapeHtml(j.label)}</option>`
            ).join("")}
          </select>
        </div>

        <div class="filter-control-item">
          <label for="laporan-filter-kategori" class="filter-label">Filter Kategori</label>
          <select id="laporan-filter-kategori" class="form-select"></select>
        </div>

        <div class="filter-control-item">
          <label for="laporan-tanggal-dari" class="filter-label">Dari Tanggal</label>
          <input type="date" id="laporan-tanggal-dari" class="form-input" value="${escapeHtml(stateLaporan.tanggalDari)}" />
        </div>

        <div class="filter-control-item">
          <label for="laporan-tanggal-sampai" class="filter-label">Sampai Tanggal</label>
          <input type="date" id="laporan-tanggal-sampai" class="form-input" value="${escapeHtml(stateLaporan.tanggalSampai)}" />
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