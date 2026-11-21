/**
 * View Modul Foto (fitur foto kegiatan)
 * Merender daftar foto dan pratinjau berkas terpilih ke dalam elemen yang
 * disediakan index.html. Tidak memanggil API — semua aksi lewat controller.
 */
import { escapeHtml, svgIkon } from "../../util-html.js";

const IKON_GAMBAR = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>';
const IKON_KALENDER = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';
const IKON_TAUTAN = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';
const IKON_TAB_BARU = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';

let elemenDaftar = null;
let elemenKosong = null;
let elemenInputBerkas = null;
let elemenPratinjau = null;

const KERANGKA_HALAMAN_FOTO = `
<div class="page-stack">
  <div class="section-header-bar">
    <div class="section-heading-group">
      <h2 class="section-heading-title">Foto Kegiatan</h2>
      <p class="section-heading-subtitle">Unggah satu atau lebih foto ke Google Drive dan kaitkan dengan kegiatan.</p>
    </div>
  </div>

  <div id="foto-page-alert" class="alert-box" role="alert" hidden>
    <span id="foto-page-alert-text"></span>
  </div>

  <div class="filter-card">
    <div class="form-field">
      <label for="pilih-kegiatan-foto" class="form-label">Kegiatan tujuan</label>
      <select id="pilih-kegiatan-foto" class="form-select"></select>
    </div>
    <div class="form-field">
      <label for="input-berkas-foto" class="form-label">Berkas foto (boleh lebih dari satu)</label>
      <input type="file" id="input-berkas-foto" class="form-input" accept="image/*" multiple />
    </div>
    <div id="pratinjau-foto" class="kisi-pratinjau-foto"></div>
    <div class="form-actions">
      <button type="button" id="tombol-unggah-foto" class="btn-primary">Unggah</button>
    </div>
  </div>

  <div class="form-field">
    <label for="filter-foto-kegiatan" class="form-label">Filter berdasarkan kegiatan</label>
    <select id="filter-foto-kegiatan" class="form-select"><option value="">Semua kegiatan</option></select>
  </div>

  <div id="foto-kosong" class="empty-stage-desc">Belum ada foto. Pilih kegiatan, lalu unggah foto pertama Anda.</div>
  <div id="daftar-foto" class="kegiatan-list-grid"></div>
</div>`;

/**
 * Memastikan panel #section-foto berisi kerangka halaman (sekali pasang).
 */
export function pastikanKerangkaHalamanFoto() {
  const panel = document.getElementById("section-foto");
  if (!panel || panel.querySelector("#daftar-foto")) return;
  panel.innerHTML = KERANGKA_HALAMAN_FOTO;
}

/**
 * Memasang acuan elemen DOM modul foto.
 * @param {{ daftar?: HTMLElement, kosong?: HTMLElement, inputBerkas?: HTMLInputElement, pratinjau?: HTMLElement }} elemen
 */
export function pasangElemenFoto(elemen = {}) {
  elemenDaftar = elemen.daftar || null;
  elemenKosong = elemen.kosong || null;
  elemenInputBerkas = elemen.inputBerkas || null;
  elemenPratinjau = elemen.pratinjau || null;
}

function formatUkuran(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Merender daftar foto bergaya kartu (serupa halaman Catatan).
 * @param {Array} daftarFoto
 * @param {Map} petaKegiatan (id -> kegiatan)
 */
export function renderDaftarFoto(daftarFoto, petaKegiatan, filterKegiatanId = "") {
  if (!elemenDaftar) return;
  const terfilter = filterKegiatanId
    ? daftarFoto.filter((f) => f.kegiatanId === filterKegiatanId)
    : daftarFoto;

  if (elemenKosong) {
    elemenKosong.hidden = terfilter.length > 0;
  }

  if (!terfilter.length) {
    elemenDaftar.innerHTML = "";
    return;
  }

  elemenDaftar.innerHTML = terfilter
    .map((f) => {
      const kegiatan = petaKegiatan.get(f.kegiatanId);
      const thumb = f.driveFileId
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.driveFileId)}&sz=w400`
        : "";
      const tanggalUnggah = String(f.createdAt || "").slice(0, 10);
      return `
        <article class="catatan-card kartu-foto" data-id-foto="${escapeHtml(f.id)}">
          <div class="catatan-card-top">
            <div class="catatan-head-left">
              ${thumb
                ? `<a class="foto-thumb" href="${escapeHtml(f.tautan || thumb)}" target="_blank" rel="noopener" title="Buka foto di Drive"><img src="${thumb}" alt="${escapeHtml(f.namaFile)}" loading="lazy" /></a>`
                : `<a class="foto-thumb foto-thumb-kosong" href="${escapeHtml(f.tautan)}" target="_blank" rel="noopener">${svgIkon(IKON_GAMBAR, 24)}</a>`}
              <div class="catatan-title-group">
                <div class="catatan-badges-row">
                  <span class="catatan-kind-badge kind-gdoc">Foto</span>
                  <span class="catatan-category-label">${formatUkuran(f.ukuran)}</span>
                </div>
                <h3 class="catatan-card-title">${escapeHtml(f.namaFile)}</h3>
              </div>
            </div>
          </div>
          <div class="kegiatan-meta-list">
            <span class="kegiatan-meta-item">${IKON_KALENDER}<span>${escapeHtml(tanggalUnggah || "-")}</span></span>
            <span class="kegiatan-meta-item">${IKON_TAUTAN}<span>${kegiatan ? escapeHtml(kegiatan.judul) : "(kegiatan tidak ditemukan)"}</span></span>
          </div>
          <div class="catatan-card-footer">
            <a href="${escapeHtml(f.tautan || thumb)}" target="_blank" rel="noopener" class="btn-primary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Drive</span></a>
            <div class="catatan-footer-actions">
              <button type="button" class="btn-danger-outline btn-sm-touch tombol-hapus-foto" data-id-foto="${escapeHtml(f.id)}">Hapus</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

/**
 * Merender pratinjau berkas yang dipilih pada form unggah.
 * @param {FileList|File[]} berkas
 */
export function renderPratinjauUnggah(berkas) {
  if (!elemenPratinjau) return;
  const daftar = Array.from(berkas || []);
  if (!daftar.length) {
    elemenPratinjau.innerHTML = "";
    return;
  }
  elemenPratinjau.innerHTML = daftar
    .map((f) => {
      const urlLokal = URL.createObjectURL(f);
      return `
        <div class="item-pratinjau-foto">
          <img src="${urlLokal}" alt="${escapeHtml(f.name)}" />
          <span>${escapeHtml(f.name)} (${formatUkuran(f.size)})</span>
        </div>`;
    })
    .join("");
}

/** Mengosongkan pratinjau dan input berkas setelah unggahan selesai. */
export function bersihkanFormUnggahFoto() {
  if (elemenInputBerkas) elemenInputBerkas.value = "";
  if (elemenPratinjau) elemenPratinjau.innerHTML = "";
}

/** Mengunci/membuka tombol unggah selama proses berjalan. */
export function setelSedangUnggahFoto(sedangBerjalan) {
  const tombol = document.getElementById("tombol-unggah-foto");
  if (tombol) {
    tombol.disabled = Boolean(sedangBerjalan);
    tombol.textContent = sedangBerjalan ? "Mengunggah..." : "Unggah";
  }
}
