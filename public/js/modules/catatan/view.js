/**
 * View Modul Catatan (Tahap 3: dipisah dari catatan.js)
 * Pengelolaan DOM halaman Catatan: ikon, state filter tampilan, kerangka halaman,
 * penyaringan + render kartu, banner notifikasi, sorotan kartu, dan status jaringan.
 * Data dibaca dari state.js; view tidak melakukan tulis Firestore/Drive.
 */
import { JENIS_CATATAN_SINGKAT, JENIS_CATATAN_GDOC } from "../../config/constants.js";
import { escapeHtml, svgIkon } from "../../util-html.js";
import { initFilterPanel } from "../../filter-panel.js";
import { ambilInfoTemplatDokumen } from "../../templat-dokumen.js";
import {
  getDaftarCatatan,
  isCatatanSudahDimuat,
  getAdaLebihBanyakCatatan,
  getSedangMuatLebihCatatan,
  getSedangMencariSemuaCatatan,
  getSeluruhCatatanSudahDimuat,
  cariKegiatanId
} from "./state.js";
import { formatTanggalCatatan, tautanAmanGoogleDocs, urutkanDaftarCatatan } from "./format.js";

const IKON_SINGKAT = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20);
const IKON_GDOC = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="19" x2="12" y2="19"/>', 20);
const IKON_SEMAT = svgIkon('<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>', 16);
const IKON_KALENDER = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
const IKON_TAUTAN = svgIkon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 15);
const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 15);
const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

// State filter tampilan (hanya memengaruhi render).
let kataKunciCari = "";
let filterJenis = "ALL";
let urutanTanggal = "desc";
let pengendaliFilterCatatan = null;

// Flag proses pembuatan gdoc; dipakai untuk menjaga tombol submit/tutup.
let sedangMembuatGdoc = false;

let timerSorotCatatan = null;

export { IKON_SINGKAT, IKON_GDOC, IKON_SEMAT, IKON_KALENDER, IKON_TAUTAN, IKON_TAB_BARU };

export function setKataKunciCari(nilai) {
  kataKunciCari = String(nilai || "");
}

export function setFilterJenis(nilai) {
  filterJenis = nilai === JENIS_CATATAN_GDOC || nilai === JENIS_CATATAN_SINGKAT ? nilai : "ALL";
}

export function setUrutanTanggal(nilai) {
  urutanTanggal = nilai === "asc" ? "asc" : "desc";
}

export function getSedangMembuatGdoc() {
  return sedangMembuatGdoc;
}

export function setSedangMembuatGdoc(nilai) {
  sedangMembuatGdoc = Boolean(nilai);
}

export function lepasAntarmukaCatatan() {
  if (timerSorotCatatan !== null) {
    window.clearTimeout(timerSorotCatatan);
    timerSorotCatatan = null;
  }
  pengendaliFilterCatatan?.tutup(false);
  tampilkanNotifikasiCatatan({ pesan: "" });
}

export function pasangFilterCatatan() {
  pengendaliFilterCatatan = initFilterPanel(document.getElementById("catatan-toolbar"));
  return pengendaliFilterCatatan;
}

export function aturUlangSemuaFilterCatatan() {
  kataKunciCari = "";
  filterJenis = "ALL";
  const searchInput = document.getElementById("catatan-search-input");
  const jenisSelect = document.getElementById("catatan-filter-jenis");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (jenisSelect instanceof HTMLSelectElement) jenisSelect.value = "ALL";
  renderDaftarCatatan();
}

export function perbaruiOpsiKegiatanDiModal(daftarKegiatan) {
  const kegiatanUrut = [...(daftarKegiatan || [])].sort((a, b) =>
    String(b.tanggal || "").localeCompare(String(a.tanggal || ""))
  );
  const opsiHtml = [
    `<option value="">— Tidak dikaitkan ke kegiatan —</option>`,
    ...kegiatanUrut.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.judul)}${k.tanggal ? ` (${escapeHtml(k.tanggal)})` : ""}</option>`)
  ].join("");

  for (const idEl of ["catatan-singkat-kegiatan", "catatan-gdoc-kegiatan"]) {
    const sel = document.getElementById(idEl);
    if (sel instanceof HTMLSelectElement) {
      const lama = sel.value;
      sel.innerHTML = opsiHtml;
      sel.value = kegiatanUrut.some((k) => k.id === lama) ? lama : "";
    }
  }
}

export function pastikanKerangkaHalamanCatatan() {
  const panel = document.getElementById("section-catatan");
  if (!panel || panel.querySelector("#catatan-toolbar")) return;

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Catatan &amp; Notulensi</h2>
        <p class="section-heading-subtitle">Kelola catatan singkat maupun dokumen Google Docs yang terhubung dengan kegiatan Anda.</p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-tambah-catatan-singkat" class="btn-primary">${svgIkon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18, 2.2)}<span>Catatan Singkat</span></button>
        <button type="button" id="btn-tambah-catatan-gdoc" class="btn-secondary">${IKON_GDOC}<span>Catatan Google Docs</span></button>
      </div>
    </div>
    <div id="catatan-offline-docs-note" class="alert-box alert-box-warning" role="status" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span>Tidak ada koneksi internet. Pembuatan <strong>Catatan Google Docs</strong> dinonaktifkan sementara, namun <strong>Catatan Singkat</strong> tetap dapat digunakan.</span>
    </div>
    <div id="catatan-page-feedback" class="alert-box catatan-feedback-banner" role="alert" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <div class="catatan-feedback-content">
        <span id="catatan-page-feedback-text"></span>
        <div id="catatan-page-feedback-actions" class="catatan-feedback-actions"></div>
      </div>
    </div>
    <div id="catatan-toolbar" class="filter-card filter-toolbar-shell">
      <div class="compact-toolbar-row">
        <div class="search-field-wrap compact-search-wrap">
          <label for="catatan-search-input" class="sr-only">Cari catatan</label>
          ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
          <input type="search" id="catatan-search-input" class="form-input input-with-icon" placeholder="Cari judul, isi catatan singkat, atau tag..." autocomplete="off" />
        </div>
        <button
          type="button"
          id="catatan-filter-toggle-btn"
          class="btn-secondary btn-filter-toggle"
          data-filter-toggle
          aria-expanded="false"
          aria-controls="catatan-filter-panel"
        >
          ${IKON_FILTER}
          <span class="btn-filter-label">Filter</span>
          <span id="catatan-filter-count-badge" class="filter-count-badge" data-filter-badge hidden>0</span>
        </button>
      </div>

      <div id="catatan-filter-panel" class="filter-collapsible" data-filter-panel role="region" aria-label="Filter catatan" aria-hidden="true" inert>
        <div class="filter-collapsible-inner">
          <div class="filter-panel-content">
            <div class="filter-controls-grid">
              <div class="filter-control-item">
                <label for="catatan-filter-jenis" class="filter-label">Jenis Catatan</label>
                <select id="catatan-filter-jenis" class="form-select" data-default="ALL">
                  <option value="ALL">Semua Jenis</option>
                  <option value="singkat">Catatan Singkat</option>
                  <option value="gdoc">Catatan Google Docs</option>
                </select>
              </div>
              <div class="filter-control-item">
                <label for="catatan-sort-tanggal" class="filter-label">Urutan Tanggal</label>
                <select id="catatan-sort-tanggal" class="form-select compact-sort-select" data-default="desc" aria-label="Urutan tanggal catatan" title="Urutan tanggal (tersemat selalu di atas)">
                  <option value="desc">Terbaru &rarr; Terlama</option>
                  <option value="asc">Terlama &rarr; Terbaru</option>
                </select>
              </div>
            </div>
            <div class="filter-panel-actions">
              <button type="button" id="catatan-filter-reset-desktop-btn" class="btn-secondary btn-sm-touch" data-filter-reset>Atur ulang</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="catatan-active-filter-bar" class="result-summary-bar" hidden>
      <span id="catatan-result-summary" class="result-summary-text"></span>
    </div>
    <div id="catatan-list-region" aria-live="polite"></div>
  </div>`;
}

export function ambilCatatanTersaring() {
  const q = kataKunciCari.trim().toLowerCase();
  const sumberAktif = getDaftarCatatan();
  const hasil = sumberAktif.filter((item) => {
    if (filterJenis !== "ALL" && item.jenis !== filterJenis) return false;
    if (q) {
      const cocokJudul = String(item.judul || "").toLowerCase().includes(q);
      const cocokIsi = item.jenis === JENIS_CATATAN_SINGKAT && String(item.isi || "").toLowerCase().includes(q);
      const cocokTag = Array.isArray(item.tag) && item.tag.some((t) => String(t || "").toLowerCase().includes(q));
      if (!cocokJudul && !cocokIsi && !cocokTag) return false;
    }
    return true;
  });
  return urutkanDaftarCatatan(hasil, urutanTanggal);
}

function kartuCatatanHtml(item) {
  const gdoc = item.jenis === JENIS_CATATAN_GDOC;
  const keg = item.kegiatanId ? cariKegiatanId(item.kegiatanId) : null;
  const tpl = gdoc ? ambilInfoTemplatDokumen(item.templat) : null;
  const urlDocs = gdoc ? tautanAmanGoogleDocs(item) : "";
  const tags = Array.isArray(item.tag) ? item.tag.filter(Boolean) : [];

  return `<article class="catatan-card${item.disematkan ? " is-pinned" : ""}" data-id="${escapeHtml(item.id)}">
      <div class="catatan-card-top">
        <div class="catatan-head-left">
          <span class="catatan-type-icon ${gdoc ? "catatan-icon-gdoc" : "catatan-icon-singkat"}" aria-hidden="true">${gdoc ? IKON_GDOC : IKON_SINGKAT}</span>
          <div class="catatan-title-group">
            <div class="catatan-badges-row">
              <span class="catatan-kind-badge ${gdoc ? "kind-gdoc" : "kind-singkat"}">${gdoc ? `Google Docs • ${escapeHtml(tpl?.nama || "Dokumen")}` : "Catatan Singkat"}</span>
              ${item.disematkan ? `<span class="catatan-pin-badge">${IKON_SEMAT}<span>Disematkan</span></span>` : ""}
              ${item.kategori ? `<span class="catatan-category-label">${escapeHtml(item.kategori)}</span>` : ""}
            </div>
            <h3 class="catatan-card-title">${escapeHtml(item.judul)}</h3>
          </div>
        </div>
        <button type="button" class="icon-btn icon-btn-bordered catatan-pin-btn${item.disematkan ? " is-active" : ""}" data-catatan-action="toggle-pin" data-id="${escapeHtml(item.id)}" aria-pressed="${item.disematkan ? "true" : "false"}" aria-label="${item.disematkan ? "Lepas sematan" : "Sematkan catatan"}" title="${item.disematkan ? "Lepas sematan" : "Sematkan di atas"}">${IKON_SEMAT}</button>
      </div>
      <div class="kegiatan-meta-list">
        <span class="kegiatan-meta-item">${IKON_KALENDER}<span>${escapeHtml(formatTanggalCatatan(item.tanggal))}</span></span>
        ${item.kegiatanId ? `<span class="kegiatan-meta-item">${IKON_TAUTAN}${keg ? `<button type="button" class="catatan-kegiatan-link" data-catatan-action="lihat-kegiatan" data-kegiatan-id="${escapeHtml(keg.id)}">${escapeHtml(keg.judul)}</button>` : `<span>Kegiatan tidak ditemukan</span>`}</span>` : ""}
      </div>
      ${!gdoc && item.isi ? `<p class="kegiatan-card-note catatan-body-text">${escapeHtml(item.isi)}</p>` : ""}
      ${tags.length > 0 ? `<div class="catatan-tags-row">${tags.map((t) => `<button type="button" class="catatan-tag-chip" data-catatan-action="filter-tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("")}</div>` : ""}
      <div class="catatan-card-footer">
        ${gdoc ? `<a href="${escapeHtml(urlDocs)}" target="_blank" rel="noopener" class="btn-primary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Google Docs</span></a>` : ""}
        <div class="catatan-footer-actions">
          <button type="button" class="btn-secondary btn-sm-touch" data-catatan-action="edit-catatan" data-id="${escapeHtml(item.id)}">${gdoc ? "Ubah Info" : "Ubah"}</button>
          <button type="button" class="btn-danger-outline btn-sm-touch" data-catatan-action="delete-catatan" data-id="${escapeHtml(item.id)}">Hapus</button>
        </div>
      </div>
    </article>`;
}

export function renderDaftarCatatan() {
  const region = document.getElementById("catatan-list-region");
  const bar = document.getElementById("catatan-active-filter-bar");
  const sum = document.getElementById("catatan-result-summary");
  pengendaliFilterCatatan?.perbaruiLencana();
  if (!region) return;

  if (!isCatatanSudahDimuat()) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar catatan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div></div>`;
    return;
  }

  const adaFilter = kataKunciCari.trim() !== "" || filterJenis !== "ALL";
  const hasil = ambilCatatanTersaring();
  const totalAktif = getDaftarCatatan().length;
  const seluruhSudahDimuat = getSeluruhCatatanSudahDimuat();
  const sedangMencariSemua = getSedangMencariSemuaCatatan();

  if (bar && sum) {
    if (adaFilter || totalAktif > 0) {
      bar.hidden = false;
      let teksRingkasan = adaFilter
        ? `Menampilkan ${hasil.length} dari ${totalAktif} catatan dimuat`
        : `Total ${totalAktif} catatan tercatat`;

      if (adaFilter && !seluruhSudahDimuat) {
        teksRingkasan += ` • <button type="button" id="btn-cari-semua-catatan" class="btn-link-action" style="background:none;border:none;padding:0;color:var(--color-primary-text, #2563eb);text-decoration:underline;cursor:pointer;font:inherit;">${sedangMencariSemua ? "Mencari di semua data..." : "Cari di seluruh catatan server"}</button>`;
      }
      sum.innerHTML = teksRingkasan;
    } else {
      bar.hidden = true;
    }
  }

  if (totalAktif === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${IKON_SINGKAT}</div>
      <h3 class="empty-stage-title">Belum Ada Catatan</h3>
      <p class="empty-stage-desc">Gunakan tombol <strong>Catatan Singkat</strong> atau <strong>Catatan Google Docs</strong> di atas untuk mulai mencatat.</p>
    </div>`;
    return;
  }

  if (hasil.length === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <h3 class="empty-stage-title">Tidak Ada Catatan yang Cocok</h3>
      <p class="empty-stage-desc">Tidak ditemukan catatan yang sesuai dengan pencarian atau filter jenis.</p>
      ${!seluruhSudahDimuat ? `<div style="margin-top:12px;"><button type="button" id="btn-cari-semua-catatan-empty" class="btn-secondary btn-sm-touch">${sedangMencariSemua ? "Mencari di semua data..." : "Cari di seluruh catatan server"}</button></div>` : ""}
    </div>`;
    return;
  }

  const kartuHtml = hasil.map(kartuCatatanHtml).join("");
  const sedangMuat = getSedangMuatLebihCatatan();
  const tombolMuatLebih = getAdaLebihBanyakCatatan()
    ? `<div class="doc-load-more-bar">
        <button type="button" id="btn-muat-lebih-catatan" class="btn-secondary"${sedangMuat ? " disabled" : ""}>
          ${sedangMuat ? "Memuat..." : "Muat lebih banyak catatan"}
        </button>
      </div>`
    : "";

  region.innerHTML = `<div class="kegiatan-list-grid">${kartuHtml}</div>${tombolMuatLebih}`;
}

export function tampilkanNotifikasiCatatan({ pesan = "", tipe = "danger", butuhRelogin = false, tautanDocs = "" } = {}) {
  const box = document.getElementById("catatan-page-feedback");
  const txt = document.getElementById("catatan-page-feedback-text");
  const act = document.getElementById("catatan-page-feedback-actions");
  if (!box || !txt || !act) return;
  const bersih = String(pesan || "").trim();
  if (!bersih) {
    box.hidden = true;
    txt.textContent = "";
    act.innerHTML = "";
    return;
  }
  box.className = tipe === "success"
    ? "alert-box alert-box-success catatan-feedback-banner"
    : tipe === "warning"
      ? "alert-box alert-box-warning catatan-feedback-banner"
      : "alert-box catatan-feedback-banner";
  txt.textContent = bersih;
  const btns = [];
  if (tautanDocs && /^https?:\/\//i.test(tautanDocs)) {
    btns.push(`<a href="${escapeHtml(tautanDocs)}" target="_blank" rel="noopener" class="btn-primary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Google Docs</span></a>`);
  }
  if (butuhRelogin) {
    btns.push(`<button type="button" class="btn-primary btn-sm-touch" data-catatan-feedback="relogin">Masuk ulang</button>`);
  }
  btns.push(`<button type="button" class="btn-secondary btn-sm-touch" data-catatan-feedback="dismiss">Tutup</button>`);
  act.innerHTML = btns.join("");
  box.hidden = false;
}

export function perbaruiStatusJaringanCatatan() {
  const online = navigator.onLine;
  const btnGdoc = document.getElementById("btn-tambah-catatan-gdoc");
  if (btnGdoc instanceof HTMLButtonElement) {
    btnGdoc.disabled = !online;
    btnGdoc.title = online
      ? "Buat dokumen Google Docs baru"
      : "Tidak ada koneksi internet. Pembuatan Google Docs dinonaktifkan sementara.";
  }
  const infoLuring = document.getElementById("catatan-offline-docs-note");
  if (infoLuring) infoLuring.hidden = online;

  const submitGdoc = document.getElementById("catatan-gdoc-submit-btn");
  if (submitGdoc instanceof HTMLButtonElement && !sedangMembuatGdoc) {
    submitGdoc.disabled = !online;
  }
}

export function sorotCatatanDiHalaman(catatanId) {
  const targetId = String(catatanId || "").trim();
  if (!targetId) return;

  const tampilDiFilter = ambilCatatanTersaring().some((c) => c.id === targetId);
  if (!tampilDiFilter && getDaftarCatatan().some((c) => c.id === targetId)) {
    aturUlangSemuaFilterCatatan();
  }

  requestAnimationFrame(() => {
    const region = document.getElementById("catatan-list-region");
    if (!region) return;
    region.querySelectorAll(".catatan-card.is-highlighted").forEach((el) => {
      el.classList.remove("is-highlighted");
    });
    const kartu = Array.from(region.querySelectorAll(".catatan-card[data-id]")).find(
      (el) => el.getAttribute("data-id") === targetId
    );
    if (!(kartu instanceof HTMLElement)) return;

    kartu.classList.add("is-highlighted");
    kartu.scrollIntoView({ behavior: "smooth", block: "center" });
    if (timerSorotCatatan !== null) window.clearTimeout(timerSorotCatatan);
    timerSorotCatatan = window.setTimeout(() => {
      kartu.classList.remove("is-highlighted");
      timerSorotCatatan = null;
    }, 2200);
  });
}
