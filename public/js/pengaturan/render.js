/**
 * Render & Manipulasi Tampilan DOM untuk Halaman Pengaturan & Cadangan
 */
import { getCurrentUser, isDriveTokenExpired } from "../auth.js";
import { getPreferensiTema, terapkanTema } from "../tema.js";
import { urutkanDaftarKategori } from "../kategori.js";
import { manajerKategoriKegiatan, getDaftarKegiatan } from "../kegiatan.js";
import { manajerKategoriDokumen, getDaftarDokumen } from "../dokumen.js";
import { getDaftarCatatan } from "../catatan.js";
import { getDaftarLaporan } from "../laporan.js";
import { tanggalLokal } from "../util-tanggal.js";
import { formatTanggalLengkapIndonesia } from "../jadwal.js";
import { escapeHtml } from "../sidebar.js";
import {
  getStatusCadangan,
  getStatusUiPengaturan,
  hitungSelisihHariCadangan
} from "./state.js";
import {
  svgIkon,
  IKON_MATAHARI,
  IKON_BULAN,
  IKON_SISTEM,
  IKON_FOLDER_SYNC,
  IKON_UNDUH,
  IKON_UNGGAH,
  IKON_SEGAR,
  IKON_PERINGATAN,
  bacaVersiDariSwJs
} from "./util.js";

export function pastikanKerangkaHalamanPengaturan() {
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

export function segarkanTampilanPengaturan() {
  const panel = document.getElementById("section-pengaturan");
  if (!panel || !panel.querySelector("#pengaturan-grid")) return;

  const user = getCurrentUser();
  const online = navigator.onLine;
  const expired = isDriveTokenExpired();
  const statusCadangan = getStatusCadangan();
  const ui = getStatusUiPengaturan();

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
  if (btnSyncAll instanceof HTMLButtonElement && !ui.sedangSinkronFolder) {
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

export async function perbaruiInfoVersiSwDiDom() {
  const ver = await bacaVersiDariSwJs();
  const verEl = document.getElementById("settings-sw-version");
  if (verEl) verEl.textContent = ver;
}