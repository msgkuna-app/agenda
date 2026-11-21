/**
 * Tampilan (View) Modul Pengaturan (Tahap 3b: dipisah dari pengaturan.js)
 * Berisi pembentukan HTML halaman Pengaturan (tema, akun, sinkron folder, info aplikasi,
 * hari libur, cadangan) serta penyegaran nilai-nilainya dari state modul.
 *
 * Aturan: tidak memasang event listener dan tidak menulis state.
 */
import { VERSI_CADANGAN_SW } from "../../config/constants.js";
import { getCurrentUser, isDriveTokenExpired } from "../../services/authService.js";
import { getPreferensiTema, terapkanTema } from "../../tema.js";
import { parseTanggal, tanggalLokal } from "../../util-tanggal.js";
import { formatTanggalLengkapIndonesia } from "../../jadwal.js";
import {
  DATA_HARI_LIBUR_BAWAAN,
  HARI_BESAR_TETAP,
  kunciEntri,
  ambilKonfigurasiAktif
} from "../../hari-libur.js";
import {
  urutkanDaftarKategori
} from "../../kategori.js";
import {
  manajerKategoriKegiatan,
  getDaftarKegiatan
} from "../../modules/kegiatan/index.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen
} from "../../modules/dokumen/index.js";
import { getDaftarCatatan } from "../../catatan.js";
import { getDaftarLaporan } from "../../laporan.js";
import { escapeHtml, svgIkon } from "../../util-html.js";
import {
  statusCadangan,
  hitungSelisihHariCadangan
} from "./state.js";

const IKON_MATAHARI = svgIkon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', 17);
const IKON_BULAN = svgIkon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 17);
const IKON_SISTEM = svgIkon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 17);
const IKON_FOLDER_SYNC = svgIkon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="16 13 12 9 8 13"/><line x1="12" y1="9" x2="12" y2="17"/>', 18);
const IKON_UNDUH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18);
const IKON_UNGGAH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18);
const IKON_SEGAR = svgIkon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 17);
const IKON_PERINGATAN = svgIkon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 18);

const NAMA_HARI_TABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_TABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Tahun yang sedang ditampilkan pada tabel hari libur. */
export let tahunLiburAktif = 2026;

/** Mengubah tahun aktif tabel hari libur. */
export function setTahunLiburAktif(tahun) {
  const v = Number(tahun);
  if (Number.isFinite(v) && v > 1900) tahunLiburAktif = v;
}

/**
 * Memberi umpan balik di kotak pesan halaman Pengaturan.
 * @param {string} pesan
 * @param {"info"|"success"|"warning"|"danger"} tipe
 */
export function setUmpanBalikPengaturan(pesan, tipe = "info") {
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

/** Membaca versi aplikasi dari sw.js (atau CacheStorage saat luring). */
export async function bacaVersiDariSwJs() {
  try {
    const resp = await fetch("/sw.js", { cache: "no-cache" });
    if (resp.ok) {
      const teks = await resp.text();
      const cocok = /const\s+VERSION\s*=\s*["']([^"']+)["']/.exec(teks);
      if (cocok && cocok[1]) {
        return cocok[1].trim();
      }
    }
  } catch (_err) {
    // Saat luring, coba ambil dari daftar nama CacheStorage yang aktif
    try {
      if ("caches" in window) {
        const kunci = await caches.keys();
        const ketemu = kunci.find((k) => k.startsWith("agenda-arsip-"));
        if (ketemu) {
          return ketemu;
        }
      }
    } catch (_e2) {}
  }
  return VERSI_CADANGAN_SW;
}

/** Membangun kerangka HTML halaman Pengaturan bila belum ada. */
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

function formatTanggalTabel(tanggalStr) {
  const d = parseTanggal(tanggalStr);
  if (!d) return tanggalStr || "-";
  return `${NAMA_HARI_TABEL[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN_TABEL[d.getMonth()]} ${d.getFullYear()}`;
}

/** Menggambar ulang tabel hari libur untuk tahun aktif. */
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

/**
 * Menyegarkan seluruh nilai tampilan halaman Pengaturan dari sumber data terkini.
 * @param {{ sedangSinkronFolder?: boolean }} opsi
 */
export function segarkanTampilanPengaturan(opsi = {}) {
  const panel = document.getElementById("section-pengaturan");
  if (!panel || !panel.querySelector("#pengaturan-grid")) return;

  renderDaftarHariLiburPengaturan();

  const user = getCurrentUser();
  const online = navigator.onLine;
  const expired = isDriveTokenExpired();
  const sedangSinkronFolder = Boolean(opsi.sedangSinkronFolder);

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

/** Menampilkan versi Service Worker di kartu Informasi Aplikasi. */
export async function perbaruiInfoVersiSwDiDom() {
  const ver = await bacaVersiDariSwJs();
  const verEl = document.getElementById("settings-sw-version");
  if (verEl) verEl.textContent = ver;
}

/** Menampilkan/menyembunyikan status pemeriksaan pembaruan. */
export function setStatusCekPembaruan(pesan) {
  const statusEl = document.getElementById("settings-update-status");
  if (!statusEl) return;
  const bersih = String(pesan || "").trim();
  statusEl.textContent = bersih;
  statusEl.hidden = !bersih;
}

/** Menampilkan panel pratinjau impor dari data yang sudah diurai. */
export function tampilkanPratinjauImpor(dataSiapImpor, namaBerkasImpor, KOLEKSI_CADANGAN) {
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

/** Menampilkan ringkasan hasil impor. */
export function tampilkanRingkasanImpor(ringkasan) {
  const summaryBox = document.getElementById("settings-import-summary-box");
  if (!summaryBox) return;
  summaryBox.hidden = false;
  summaryBox.innerHTML = `
    <div class="organize-notice-box">
      <strong class="sub-card-title">Ringkasan Hasil Impor Cadangan</strong>
      <div class="organize-summary-grid">
        <div class="organize-stat-item">
          <span class="organize-stat-value">${ringkasan.ditambahkan}</span>
          <span class="organize-stat-label">Data Baru Ditambahkan</span>
        </div>
        <div class="organize-stat-item">
          <span class="organize-stat-value">${ringkasan.ditimpa}</span>
          <span class="organize-stat-label">Data Lama Ditimpa</span>
        </div>
        <div class="organize-stat-item">
          <span class="organize-stat-value">${ringkasan.dilewati}</span>
          <span class="organize-stat-label">Dilewati (Sudah Ada)</span>
        </div>
      </div>
    </div>
  `;
}

/** Menyembunyikan dan membersihkan kotak ringkasan impor. */
export function sembunyikanRingkasanImpor() {
  const summaryBox = document.getElementById("settings-import-summary-box");
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
}

/** Menampilkan status tombol ekspor (aktif/nonaktif). */
export function setTombolEkspor(aktif) {
  const btn = document.getElementById("btn-settings-export-json");
  if (btn instanceof HTMLButtonElement) btn.disabled = !aktif;
}

/** Menampilkan status migrasi soft delete. */
export function setStatusMigrasi(html, tampil = true) {
  const statusEl = document.getElementById("settings-migration-status");
  if (!statusEl) return;
  statusEl.hidden = !tampil;
  if (tampil) statusEl.innerHTML = html;
}

/** Menampilkan/menyembunyikan indikator progres sinkron folder. */
export function setProgresSinkronFolder(tampil, labelPersen = null) {
  const progWrap = document.getElementById("settings-folder-sync-progress");
  if (progWrap) progWrap.hidden = !tampil;
  if (!labelPersen) return;
  const progLabel = document.getElementById("settings-folder-sync-label");
  const progPct = document.getElementById("settings-folder-sync-pct");
  const progFill = document.getElementById("settings-folder-sync-fill");
  if (progLabel) progLabel.textContent = labelPersen.label;
  if (progPct) progPct.textContent = `${labelPersen.pct}%`;
  if (progFill instanceof HTMLElement) progFill.style.width = `${labelPersen.pct}%`;
}

/** Menampilkan/menyembunyikan indikator progres impor. */
export function setProgresImpor(tampil, labelPersen = null) {
  const progWrap = document.getElementById("settings-import-progress-wrap");
  if (progWrap) progWrap.hidden = !tampil;
  if (!labelPersen) return;
  const progLabel = document.getElementById("settings-import-progress-label");
  const progPct = document.getElementById("settings-import-progress-pct");
  const progFill = document.getElementById("settings-import-progress-fill");
  const p = Math.max(0, Math.min(100, Math.round(labelPersen.pct)));
  if (progLabel) progLabel.textContent = labelPersen.label;
  if (progPct) progPct.textContent = `${p}%`;
  if (progFill instanceof HTMLElement) progFill.style.width = `${p}%`;
}
