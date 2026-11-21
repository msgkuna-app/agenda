/**
 * View Modul Foto (fitur foto kegiatan)
 * Merender galeri foto yang dikelompokkan per kegiatan, serta pratinjau berkas
 * pada modal unggah. Tidak memanggil API — semua aksi lewat controller.
 */
import { escapeHtml, svgIkon } from "../../util-html.js";

const IKON_GAMBAR = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>';
const IKON_HAPUS = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
const IKON_KALENDER_KECIL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

let elemenDaftar = null;
let elemenPratinjau = null;

const KERANGKA_HALAMAN_FOTO = `
<div class="page-stack">
  <div class="section-header-bar">
    <div class="section-heading-group">
      <h2 class="section-heading-title">Foto Kegiatan</h2>
      <p class="section-heading-subtitle">Galeri foto kegiatan yang tersimpan di folder "Foto Kegiatan" di Google Drive.</p>
    </div>
    <div class="section-header-actions">
      <button type="button" id="btn-unggah-foto" class="btn-primary">${svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18, 2.2)}<span>Unggah Foto</span></button>
    </div>
  </div>

  <div id="foto-toolbar" class="filter-card filter-toolbar-shell">
    <div class="compact-toolbar-row">
      <div class="search-field-wrap compact-search-wrap">
        <label for="foto-search-input" class="sr-only">Cari foto</label>
        ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
        <input type="search" id="foto-search-input" class="form-input input-with-icon" placeholder="Cari nama berkas foto..." autocomplete="off" />
      </div>
      <div class="filter-control-item">
        <label for="filter-foto-kegiatan" class="sr-only">Filter kegiatan</label>
        <select id="filter-foto-kegiatan" class="form-select compact-sort-select" data-default="ALL">
          <option value="ALL">Semua kegiatan</option>
        </select>
      </div>
    </div>
  </div>

  <div id="foto-list-region" aria-live="polite"></div>
</div>`;

/** Memastikan panel #section-foto berisi kerangka halaman (sekali pasang). */
export function pastikanKerangkaHalamanFoto() {
  const panel = document.getElementById("section-foto");
  if (!panel || panel.querySelector("#foto-list-region")) return;
  panel.innerHTML = KERANGKA_HALAMAN_FOTO;
}

/**
 * Memasang acuan elemen DOM modul foto.
 * @param {{ daftar?: HTMLElement, pratinjau?: HTMLElement }} elemen
 */
export function pasangElemenFoto(elemen = {}) {
  elemenDaftar = elemen.daftar || null;
  elemenPratinjau = elemen.pratinjau || null;
}

function formatUkuran(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kartuFotoHtml(f, judulGrup) {
  const tautan = f.tautan || (f.driveFileId ? `https://drive.google.com/file/d/${encodeURIComponent(f.driveFileId)}/view` : "#");
  const tanggal = String(f.createdAt || "").slice(0, 10);
  return `<figure class="foto-kartu" data-id-foto="${escapeHtml(f.id)}">
      <a class="foto-kartu-gambar" href="${escapeHtml(tautan)}" target="_blank" rel="noopener" title="Buka foto di Drive">
        ${f.driveFileId
          ? `<img alt="${escapeHtml(f.namaFile)}" loading="lazy" data-thumb-drive="${escapeHtml(f.driveFileId)}" />`
          : `<span class="foto-kartu-kosong">${svgIkon(IKON_GAMBAR, 28)}</span>`}
      </a>
      <button type="button" class="tombol-hapus-foto" data-id-foto="${escapeHtml(f.id)}" title="Hapus foto" aria-label="Hapus foto ${escapeHtml(f.namaFile)}">${svgIkon(IKON_HAPUS, 16)}</button>
      <figcaption class="foto-kartu-meta">
        <span class="foto-kartu-nama" title="${escapeHtml(f.namaFile)}">${escapeHtml(f.namaFile)}</span>
        <span class="foto-kartu-keterangan">${formatUkuran(f.ukuran)}${tanggal ? ` · ${escapeHtml(tanggal)}` : ""}</span>
        <span class="sr-only">Kegiatan: ${escapeHtml(judulGrup)}</span>
      </figcaption>
    </figure>`;
}

/**
 * Merender galeri foto yang dikelompokkan per kegiatan.
 * @param {Array} daftarFoto
 * @param {Map} petaKegiatan (id -> kegiatan)
 * @param {{ filterKegiatanId?: string, kataKunci?: string }} [opsi]
 */
export function renderDaftarFoto(daftarFoto, petaKegiatan, opsi = {}) {
  if (!elemenDaftar) return;
  const filterId = String(opsi.filterKegiatanId || "ALL");
  const kunci = String(opsi.kataKunci || "").trim().toLowerCase();

  let terfilter = daftarFoto;
  if (filterId !== "ALL") {
    terfilter = terfilter.filter((f) => f.kegiatanId === filterId);
  }
  if (kunci) {
    terfilter = terfilter.filter((f) => String(f.namaFile || "").toLowerCase().includes(kunci));
  }

  if (!terfilter.length) {
    const adaKegiatan = daftarFoto.length > 0;
    elemenDaftar.innerHTML = `<div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${svgIkon(IKON_GAMBAR, 28)}</div>
      <h3 class="empty-stage-title">${adaKegiatan ? "Tidak Ada Foto yang Cocok" : "Belum Ada Foto"}</h3>
      <p class="empty-stage-desc">${adaKegiatan ? "Tidak ditemukan foto yang sesuai dengan pencarian atau filter kegiatan." : "Gunakan tombol <strong>Unggah Foto</strong> di atas untuk menambahkan foto kegiatan."}</p>
    </div>`;
    return;
  }

  // Kelompokkan per kegiatan; kegiatan dengan foto terbaru tampil lebih dulu.
  const grup = new Map();
  terfilter.forEach((f) => {
    const id = f.kegiatanId || "__TANPA__";
    if (!grup.has(id)) grup.set(id, []);
    grup.get(id).push(f);
  });

  const urutanGrup = Array.from(grup.keys()).sort((a, b) => {
    const ka = petaKegiatan.get(a);
    const kb = petaKegiatan.get(b);
    return String(kb?.tanggal || "").localeCompare(String(ka?.tanggal || ""));
  });

  elemenDaftar.innerHTML = urutanGrup
    .map((id) => {
      const kegiatan = petaKegiatan.get(id);
      const judul = kegiatan ? kegiatan.judul : "(Kegiatan tidak ditemukan)";
      const tanggal = kegiatan?.tanggal ? formatTanggalPanjang(kegiatan.tanggal) : "";
      const waktu = kegiatan?.waktuMulai ? ` · ${escapeHtml(kegiatan.waktuMulai)}${kegiatan?.waktuSelesai ? `–${escapeHtml(kegiatan.waktuSelesai)}` : ""}` : "";
      const daftar = grup.get(id).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return `<section class="foto-grup" data-kegiatan-id="${escapeHtml(id)}">
          <header class="foto-grup-kepala">
            <h3 class="foto-grup-judul">${escapeHtml(judul)}</h3>
            ${tanggal ? `<p class="foto-grup-tanggal">${IKON_KALENDER_KECIL}<span>${escapeHtml(tanggal)}${waktu}</span></p>` : ""}
          </header>
          <div class="foto-grup-kisi">${daftar.map((f) => kartuFotoHtml(f, judul)).join("")}</div>
        </section>`;
    })
    .join("");
}

/** Mengubah "YYYY-MM-DD" menjadi "21 November 2026". */
function formatTanggalPanjang(tgl) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tgl || ""));
  if (!cocok) return String(tgl || "");
  const [, y, m, d] = cocok;
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${Number(d)} ${bulan[Number(m) - 1] || m} ${y}`;
}

/** Merender pratinjau berkas yang dipilih pada modal unggah. */
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
      return `<div class="item-pratinjau-foto">
          <img src="${urlLokal}" alt="${escapeHtml(f.name)}" />
          <span>${escapeHtml(f.name)} (${formatUkuran(f.size)})</span>
        </div>`;
    })
    .join("");
}

/** Mengosongkan pratinjau dan input berkas modal setelah unggahan selesai. */
export function bersihkanFormUnggahFoto() {
  const input = document.getElementById("foto-upload-file");
  const info = document.getElementById("foto-upload-file-info");
  if (input instanceof HTMLInputElement) input.value = "";
  if (info) info.textContent = "Pilih satu atau lebih foto dari perangkat Anda.";
  if (elemenPratinjau) elemenPratinjau.innerHTML = "";
}

/** Mengunci/membuka tombol unggah selama proses berjalan. */
export function setelSedangUnggahFoto(sedangBerjalan) {
  const tombol = document.getElementById("foto-upload-submit-btn");
  if (tombol instanceof HTMLButtonElement) {
    tombol.disabled = Boolean(sedangBerjalan);
    tombol.textContent = sedangBerjalan ? "Mengunggah..." : "Unggah ke Drive";
  }
}
