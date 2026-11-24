/**
 * View Modul Sampah (Tahap 3: dipisah dari sampah.js; Tahap B: berbasis tabel jenis)
 * Membangun kerangka halaman Tempat Sampah (termasuk dua modal), banner galat,
 * dan merender daftar item. Semua penulisan DOM modul ini ada di sini.
 *
 * Opsi filter dan kartu item dibangun dari tabel tampilan TAMPILAN_JENIS yang
 * kuncinya sama dengan kunci koleksi di state.js — bukan dari percabangan
 * `tipe === "kegiatan"`, sehingga jenis baru cukup menambah satu entri.
 */
import { JENIS_CATATAN_GDOC } from "../catatan/index.js";
import { escapeHtml, svgIkon } from "../../util-html.js";
import { KOLEKSI, KOLEKSI_HAPUS_LUNAK } from "../../config/constants.js";
import { getJenisSampah, getDaftarSampah, getSemuaItemSampah } from "./state.js";
import { formatTanggalTeks, hitungInformasiHariSampah } from "./format.js";

const IKON_KEGIATAN = svgIkon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 20);
const IKON_CATATAN_SINGKAT = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20);
const IKON_CATATAN_GDOC = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/>', 20);
const IKON_DOKUMEN = svgIkon('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><line x1="9" y1="14" x2="15" y2="14"/>', 20);
const IKON_FOTO = svgIkon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 20);
const IKON_LAPORAN = svgIkon('<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/>', 20);
const IKON_SAMPAH = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', 22);
const IKON_PULIHKAN = svgIkon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', 16);
const IKON_HAPUS_PERMANEN = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16);

/**
 * Tabel tampilan per jenis: ikon kartu dan cara memberi label pada lencana.
 * Kunci = nama koleksi Firestore (sama dengan kunci di state.js).
 */
const TAMPILAN_JENIS = {
  [KOLEKSI.KEGIATAN]: {
    ikon: () => IKON_KEGIATAN,
    label: () => "Kegiatan"
  },
  [KOLEKSI.CATATAN]: {
    ikon: (item) => (item.jenis === JENIS_CATATAN_GDOC ? IKON_CATATAN_GDOC : IKON_CATATAN_SINGKAT),
    label: (item) => (item.jenis === JENIS_CATATAN_GDOC ? "Google Docs" : "Catatan")
  },
  [KOLEKSI.DOKUMEN]: {
    ikon: () => IKON_DOKUMEN,
    label: () => "Dokumen"
  },
  [KOLEKSI.FOTO]: {
    ikon: () => IKON_FOTO,
    label: () => "Foto"
  },
  [KOLEKSI.LAPORAN]: {
    ikon: () => IKON_LAPORAN,
    label: () => "Laporan"
  }
};

let filterSegmenAktif = "semua"; // "semua" | kunci koleksi salah satu jenis aktif
let kataKunciSampah = "";

export function setFilterSegmenSampah(nilai) {
  filterSegmenAktif = nilai || "semua";
}

export function setKataKunciSampah(nilai) {
  kataKunciSampah = String(nilai == null ? "" : nilai);
}

/** Opsi <select> filter jenis, dibangun dari daftar jenis yang benar-benar aktif. */
function htmlOpsiJenisSampah() {
  const labelPerKunci = new Map(KOLEKSI_HAPUS_LUNAK.map((info) => [info.key, info.label]));
  return getJenisSampah()
    .map((kunci) => {
      const label = labelPerKunci.get(kunci) || kunci;
      return `<option value="${escapeHtml(kunci)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

export function pastikanKerangkaHalamanSampah() {
  const panel = document.getElementById("section-sampah");
  if (!panel || panel.querySelector("#sampah-toolbar")) return;

  panel.innerHTML = `
    <div class="page-stack">
      <div class="section-header-bar">
        <div class="section-heading-group">
          <h2 class="section-heading-title">Tempat Sampah</h2>
          <p class="section-heading-subtitle">Item dihapus permanen setelah 30 hari.</p>
        </div>
        <div class="section-header-actions">
          <button type="button" id="sampah-btn-kosongkan" class="btn-danger">
            ${IKON_SAMPAH}
            <span>Kosongkan Tempat Sampah</span>
          </button>
        </div>
      </div>

      <div id="sampah-page-error" class="alert-box" role="alert" hidden>
        ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
        <span id="sampah-page-error-text"></span>
      </div>

      <div id="sampah-toolbar" class="filter-card filter-toolbar-shell">
        <div class="compact-toolbar-row">
          <div class="search-field-wrap compact-search-wrap">
            <label for="sampah-search-input" class="sr-only">Cari item tempat sampah</label>
            ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
            <input type="search" id="sampah-search-input" class="form-input input-with-icon" placeholder="Cari judul atau isi item..." autocomplete="off" />
          </div>
          <button
            type="button"
            id="sampah-filter-toggle-btn"
            class="btn-secondary btn-filter-toggle"
            data-filter-toggle
            aria-expanded="false"
            aria-controls="sampah-filter-panel"
          >
            ${svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16)}
            <span class="btn-filter-label">Filter</span>
            <span id="sampah-filter-count-badge" class="filter-count-badge" data-filter-badge hidden>0</span>
          </button>
        </div>

        <div id="sampah-filter-panel" class="filter-collapsible" data-filter-panel role="region" aria-label="Filter tempat sampah" aria-hidden="true" inert>
          <div class="filter-collapsible-inner">
            <div class="filter-panel-content">
              <div class="filter-controls-grid">
                <div class="filter-control-item">
                  <label for="sampah-filter-jenis" class="filter-label">Jenis Item</label>
                  <select id="sampah-filter-jenis" class="form-select" data-default="semua">
                    <option value="semua">Semua Jenis</option>
                    ${htmlOpsiJenisSampah()}
                  </select>
                </div>
              </div>
              <div class="filter-panel-actions">
                <button type="button" id="sampah-filter-reset-desktop-btn" class="btn-secondary btn-sm-touch" data-filter-reset>Atur ulang</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="sampah-active-filter-bar" class="result-summary-bar" hidden>
        <span id="sampah-result-summary" class="result-summary-text"></span>
      </div>

      <div id="sampah-list-region" aria-live="polite"></div>
    </div>

    <!-- Modal Konfirmasi Hapus Permanen Item Tunggal -->
    <div
      id="sampah-hapus-permanen-modal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sampah-hapus-permanen-title"
      aria-describedby="sampah-hapus-permanen-desc"
      hidden
    >
      <div class="modal-dialog">
        <h2 id="sampah-hapus-permanen-title" class="modal-title">Hapus permanen item ini?</h2>
        <p id="sampah-hapus-permanen-desc" class="modal-desc"></p>
        <div class="modal-actions">
          <button type="button" id="sampah-hapus-permanen-cancel-btn" class="btn-secondary">Batal</button>
          <button type="button" id="sampah-hapus-permanen-confirm-btn" class="btn-danger">Hapus Permanen</button>
        </div>
      </div>
    </div>

    <!-- Modal Konfirmasi Kosongkan Tempat Sampah -->
    <div
      id="sampah-kosongkan-modal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sampah-kosongkan-title"
      aria-describedby="sampah-kosongkan-desc"
      hidden
    >
      <div class="modal-dialog">
        <h2 id="sampah-kosongkan-title" class="modal-title">Kosongkan Tempat Sampah?</h2>
        <p id="sampah-kosongkan-desc" class="modal-desc"></p>
        <div class="modal-actions">
          <button type="button" id="sampah-kosongkan-cancel-btn" class="btn-secondary">Batal</button>
          <button type="button" id="sampah-kosongkan-confirm-btn" class="btn-danger">Kosongkan Semua</button>
        </div>
      </div>
    </div>
  `;
}

export function tampilkanGalatHalamanSampah(pesan) {
  const box = document.getElementById("sampah-page-error");
  const txt = document.getElementById("sampah-page-error-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

/** Kartu satu item. `item` sudah memuat field `kunci` (nama koleksi). */
function htmlKartuSampah(item) {
  const tampilan = TAMPILAN_JENIS[item.kunci];
  const infoHari = hitungInformasiHariSampah(item.dihapusAt);
  const ikonItem = tampilan ? tampilan.ikon(item) : IKON_CATATAN_SINGKAT;
  const labelTipe = tampilan ? tampilan.label(item) : String(item.kunci || "");
  const tglInfo = item.tanggal ? formatTanggalTeks(item.tanggal) : "-";
  const badgeKelas = infoHari.hariTersisa <= 3 ? "sampah-countdown-urgent" : "sampah-countdown-normal";
  const kunciAman = escapeHtml(item.kunci);
  const idAman = escapeHtml(item.id);
  // Isi ringkas: catatan (kegiatan/dokumen/foto) atau isi (catatan) atau keterangan
  // terhitung (laporan, mis. "1 Agu 2026 - 31 Agu 2026 • 42 baris").
  const excerpt = item.catatan || item.isi || item.keterangan || "";

  return `
    <div class="kegiatan-card sampah-card" data-sampah-tipe="${kunciAman}" data-sampah-id="${idAman}">
      <div class="sampah-card-header">
        <div class="sampah-item-meta">
          <span class="sampah-type-badge">${escapeHtml(labelTipe)}</span>
          <span class="sampah-date-label">${escapeHtml(tglInfo)}</span>
        </div>
        <span class="sampah-countdown-pill ${badgeKelas}">
          ${escapeHtml(infoHari.ringkasan)}
        </span>
      </div>

      <div class="sampah-card-body">
        <div class="sampah-icon-wrap" aria-hidden="true">${ikonItem}</div>
        <div class="sampah-text-wrap">
          <h3 class="kegiatan-card-title sampah-title">${escapeHtml(item.judul || "Tanpa Judul")}</h3>
          ${excerpt ? `<p class="sampah-excerpt">${escapeHtml(excerpt)}</p>` : ""}
        </div>
      </div>

      <div class="sampah-card-actions">
        <button
          type="button"
          class="btn-secondary sampah-action-btn"
          data-sampah-action="pulihkan"
          data-sampah-tipe="${kunciAman}"
          data-sampah-id="${idAman}"
        >
          ${IKON_PULIHKAN}
          <span>Pulihkan</span>
        </button>
        <button
          type="button"
          class="btn-danger sampah-action-btn"
          data-sampah-action="hapus-permanen"
          data-sampah-tipe="${kunciAman}"
          data-sampah-id="${idAman}"
        >
          ${IKON_HAPUS_PERMANEN}
          <span>Hapus Permanen</span>
        </button>
      </div>
    </div>
  `;
}

export function renderHalamanSampah() {
  pastikanKerangkaHalamanSampah();

  const region = document.getElementById("sampah-list-region");
  const btnKosongkan = document.getElementById("sampah-btn-kosongkan");
  const barSummary = document.getElementById("sampah-active-filter-bar");
  const txtSummary = document.getElementById("sampah-result-summary");

  if (!region) return;

  const semuaItem = getSemuaItemSampah();
  const totalSemua = semuaItem.length;
  let daftarTampil = filterSegmenAktif === "semua"
    ? semuaItem
    : getDaftarSampah(filterSegmenAktif);

  if (btnKosongkan instanceof HTMLButtonElement) {
    btnKosongkan.disabled = totalSemua === 0;
  }

  // Saring berdasarkan kata kunci pencarian (judul, catatan, isi, keterangan)
  const kunci = kataKunciSampah.trim().toLowerCase();
  if (kunci) {
    daftarTampil = daftarTampil.filter((item) => {
      const gabungan = `${item.judul || ""} ${item.catatan || ""} ${item.isi || ""} ${item.keterangan || ""}`.toLowerCase();
      return gabungan.includes(kunci);
    });
  }

  // Urutkan item dari yang paling baru dihapus
  daftarTampil.sort((a, b) => {
    const tA = Date.parse(a.dihapusAt) || 0;
    const tB = Date.parse(b.dihapusAt) || 0;
    return tB - tA;
  });

  if (barSummary && txtSummary) {
    const adaFilter = kunci !== "" || filterSegmenAktif !== "semua";
    if (totalSemua > 0) {
      barSummary.hidden = false;
      txtSummary.textContent = adaFilter
        ? `Menampilkan ${daftarTampil.length} dari ${totalSemua} item di Tempat Sampah`
        : `Menampilkan total ${totalSemua} item di Tempat Sampah`;
    } else {
      barSummary.hidden = true;
    }
  }

  if (totalSemua === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <div class="empty-stage-icon" aria-hidden="true">${IKON_SAMPAH}</div>
        <h3 class="empty-stage-title">Tempat Sampah Kosong</h3>
        <p class="empty-stage-desc">Tidak ada item yang dihapus sementara. Item yang Anda hapus akan disimpan di sini selama 30 hari sebelum dihapus permanen.</p>
      </div>
    `;
    return;
  }

  if (daftarTampil.length === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <h3 class="empty-stage-title">Tidak Ada Item yang Cocok</h3>
        <p class="empty-stage-desc">Tidak ditemukan item di Tempat Sampah yang sesuai dengan pencarian atau filter jenis item.</p>
      </div>
    `;
    return;
  }

  region.innerHTML = `<div class="kegiatan-list-grid">${daftarTampil.map(htmlKartuSampah).join("")}</div>`;
}
