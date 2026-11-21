/**
 * View Modul Foto (fitur foto kegiatan)
 * Merender daftar foto dan pratinjau berkas terpilih ke dalam elemen yang
 * disediakan index.html. Tidak memanggil API — semua aksi lewat controller.
 */
import { escapeHtml, svgIkon } from "../../util-html.js";

const IKON_GAMBAR = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>';
const IKON_HAPUS = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';

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
  <div id="daftar-foto" class="kisi-foto"></div>
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
 * Merender kisi foto. @param {Array} daftarFoto @param {Map} petaKegiatan (id -> {judul})
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
      const judulKegiatan = kegiatan ? escapeHtml(kegiatan.judul) : "(kegiatan tidak ditemukan)";
      const thumb = f.driveFileId
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.driveFileId)}&sz=w400`
        : "";
      return `
        <figure class="kartu-foto" data-id-foto="${escapeHtml(f.id)}">
          <a href="${escapeHtml(f.tautan || thumb)}" target="_blank" rel="noopener">
            ${thumb ? `<img src="${thumb}" alt="${escapeHtml(f.namaFile)}" loading="lazy" />` : `<div class="foto-ganti-gambar">${svgIkon(IKON_GAMBAR, 40)}</div>`}
          </a>
          <figcaption>
            <span class="nama-foto" title="${escapeHtml(f.namaFile)}">${escapeHtml(f.namaFile)}</span>
            <span class="meta-foto">${formatUkuran(f.ukuran)} · ${judulKegiatan}</span>
          </figcaption>
          <button type="button" class="tombol-hapus-foto" data-id-foto="${escapeHtml(f.id)}" title="Hapus foto">${svgIkon(IKON_HAPUS)}</button>
        </figure>`;
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
