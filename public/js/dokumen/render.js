/**
 * Modul Render Antarmuka & Filter Dokumen
 * Menangani kerangka DOM, tabel arsip dokumen, penyaringan, pengurutan, dropdown, dan status jaringan (Fase 7C)
 */
import { escapeHtml, pindahKeBagian } from "../sidebar.js";
import { TANPA_KATEGORI_INFO } from "../kategori.js";
import { getDaftarKegiatan } from "../kegiatan.js";
import { stateDokumen, getDaftarDokumen } from "./state.js";
import { manajerKategoriDokumen } from "./data.js";
import {
  svgIkon,
  IKON_FILTER,
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime,
  cariJudulKegiatanTerkait
} from "./util.js";

/**
 * Menampilkan atau menyembunyikan pesan galat / peringatan di bagian atas halaman dokumen.
 * @param {string} pesan
 * @param {"danger"|"warning"|"success"} [tipe="danger"]
 */
export function tampilkanGalatHalamanDokumen(pesan, tipe = "danger") {
  const box = document.getElementById("dokumen-page-alert");
  const txt = document.getElementById("dokumen-page-alert-text");
  if (!box || !txt) return;
  if (!pesan) {
    txt.textContent = "";
    box.hidden = true;
    box.classList.remove("alert-box-warning", "alert-box-success");
    return;
  }
  txt.textContent = pesan;
  box.classList.toggle("alert-box-warning", tipe === "warning");
  box.classList.toggle("alert-box-success", tipe === "success");
  box.hidden = false;
}

/**
 * Memastikan struktur kerangka HTML halaman dokumen sudah terpasang di section #section-dokumen.
 */
export function pastikanKerangkaHalamanDokumen() {
  const panel = document.getElementById("section-dokumen");
  if (!panel || panel.querySelector("#dokumen-toolbar")) return;

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Arsip Dokumen</h2>
        <p class="section-heading-subtitle">Simpan berkas langsung ke folder kategori di Google Drive, tautkan dengan kegiatan, dan kelola metadata arsip.</p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-rapikan-dokumen-drive" class="btn-secondary">${svgIkon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 12 11 15 14"/>', 17)}<span>Rapikan dokumen ke folder kategori</span></button>
        <button type="button" id="btn-kelola-kategori-dokumen" class="btn-secondary">${svgIkon('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', 17)}<span>Kelola Kategori Dokumen</span></button>
        <button type="button" id="btn-unggah-dokumen" class="btn-primary">${svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18, 2.2)}<span>Unggah Dokumen</span></button>
      </div>
    </div>

    <div id="dokumen-offline-note" class="alert-box alert-box-warning" role="status" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span>Tidak ada koneksi internet. Pengunggahan berkas baru dan perapian folder Google Drive dinonaktifkan sementara, tetapi daftar arsip tersimpan tetap dapat ditelusuri.</span>
    </div>

    <div id="dokumen-page-alert" class="alert-box" role="alert" hidden>
      ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
      <span id="dokumen-page-alert-text"></span>
    </div>

    <div id="dokumen-toolbar" class="filter-card filter-toolbar-shell">
      <div class="compact-toolbar-row">
        <div class="search-field-wrap compact-search-wrap">
          <label for="dokumen-search-input" class="sr-only">Cari dokumen</label>
          ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
          <input type="search" id="dokumen-search-input" class="form-input input-with-icon" placeholder="Cari nama tampilan, nama berkas, atau catatan..." autocomplete="off" />
        </div>
        <button
          type="button"
          id="dokumen-filter-toggle-btn"
          class="btn-secondary btn-filter-toggle"
          data-filter-toggle
          aria-expanded="false"
          aria-controls="dokumen-filter-panel"
        >
          ${IKON_FILTER}
          <span class="btn-filter-label">Filter</span>
          <span id="dokumen-filter-count-badge" class="filter-count-badge" data-filter-badge hidden>0</span>
        </button>
      </div>

      <div id="dokumen-filter-panel" class="filter-collapsible" data-filter-panel role="region" aria-label="Filter dokumen" aria-hidden="true" inert>
        <div class="filter-collapsible-inner">
          <div class="filter-panel-content">
            <div class="filter-controls-grid">
              <div class="filter-control-item">
                <label for="dokumen-filter-kategori" class="filter-label">Kategori Dokumen</label>
                <select id="dokumen-filter-kategori" class="form-select" data-default="ALL"><option value="ALL">Semua Kategori</option></select>
              </div>
              <div class="filter-control-item">
                <label for="dokumen-sort-field" class="filter-label">Urut Berdasarkan</label>
                <select id="dokumen-sort-field" class="form-select compact-sort-select" data-default="tanggal" aria-label="Urutkan dokumen berdasarkan" title="Urut berdasarkan">
                  <option value="tanggal">Tanggal Unggah</option>
                  <option value="nama">Nama Dokumen</option>
                  <option value="ukuran">Ukuran Berkas</option>
                </select>
              </div>
              <div class="filter-control-item">
                <label for="dokumen-sort-dir" class="filter-label">Arah Urutan</label>
                <select id="dokumen-sort-dir" class="form-select compact-sort-dir-select" data-default="desc" aria-label="Arah urutan dokumen" title="Arah urutan">
                  <option value="desc">Menurun (&darr;)</option>
                  <option value="asc">Menaik (&uarr;)</option>
                </select>
              </div>
            </div>
            <div class="filter-panel-actions">
              <button type="button" id="dokumen-filter-reset-desktop-btn" class="btn-secondary btn-sm-touch" data-filter-reset>Atur ulang</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="dokumen-active-filter-bar" class="result-summary-bar" hidden>
      <span id="dokumen-result-summary" class="result-summary-text"></span>
    </div>

    <div id="dokumen-list-region" aria-live="polite"></div>
  </div>`;
}

/**
 * Memperbarui opsi pilihan kategori dokumen di dropdown filter toolbar dan modal formulir.
 */
export function perbaruiDropdownKategoriDokumen() {
  const daftarKat = manajerKategoriDokumen.getDaftarKategori();

  const selectFilter = document.getElementById("dokumen-filter-kategori");
  if (selectFilter instanceof HTMLSelectElement) {
    const nilaiSebelumnya = stateDokumen.filterKategoriId;
    selectFilter.innerHTML = [
      `<option value="ALL">Semua Kategori</option>`,
      ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`),
      `<option value="__TANPA_KATEGORI__">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`
    ].join("");

    const masihValid =
      nilaiSebelumnya === "ALL" ||
      nilaiSebelumnya === "__TANPA_KATEGORI__" ||
      daftarKat.some((k) => k.id === nilaiSebelumnya);
    stateDokumen.filterKategoriId = masihValid ? nilaiSebelumnya : "ALL";
    selectFilter.value = stateDokumen.filterKategoriId;
  }

  for (const idSelect of ["dokumen-upload-kategori", "dokumen-edit-kategori"]) {
    const sel = document.getElementById(idSelect);
    if (sel instanceof HTMLSelectElement) {
      const nilaiLama = sel.value;
      sel.innerHTML = [
        `<option value="">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`,
        ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`)
      ].join("");
      sel.value = daftarKat.some((k) => k.id === nilaiLama) ? nilaiLama : "";
    }
  }
}

/**
 * Memperbarui opsi pilihan kegiatan terkait di modal formulir.
 * @param {string} idSelect
 * @param {string} [nilaiTerpilih=""]
 */
export function perbaruiDropdownKegiatanTerkait(idSelect, nilaiTerpilih = "") {
  const sel = document.getElementById(idSelect);
  if (!(sel instanceof HTMLSelectElement)) return;

  const kegiatanUrut = [...getDaftarKegiatan()].sort((a, b) =>
    String(b.tanggal || "").localeCompare(String(a.tanggal || ""))
  );

  const opsi = [
    `<option value="">— Tidak dikaitkan ke kegiatan —</option>`,
    ...kegiatanUrut.map((k) => {
      const tgl = k.tanggal ? `${k.tanggal} • ` : "";
      return `<option value="${escapeHtml(k.id)}">${escapeHtml(tgl + k.judul)}</option>`;
    })
  ];
  sel.innerHTML = opsi.join("");
  sel.value = kegiatanUrut.some((k) => k.id === nilaiTerpilih) ? nilaiTerpilih : "";
}

/**
 * Mengambil daftar dokumen yang sudah disaring kata kunci & kategori serta diurutkan.
 * @returns {Array<Object>}
 */
export function ambilDokumenTersaringDanTerurut() {
  const q = stateDokumen.kataKunciCari.trim().toLowerCase();
  const semuaDok = getDaftarDokumen();

  const tersaring = semuaDok.filter((item) => {
    if (stateDokumen.filterKategoriId !== "ALL") {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
      if (stateDokumen.filterKategoriId === "__TANPA_KATEGORI__") {
        if (!infoKat.tetap) return false;
      } else if (infoKat.id !== stateDokumen.filterKategoriId) {
        return false;
      }
    }

    if (q) {
      const namaTampil = (item.namaTampilan || item.namaFile || "").toLowerCase();
      const namaAsli = (item.namaFile || "").toLowerCase();
      const catatan = (item.catatan || "").toLowerCase();
      if (!namaTampil.includes(q) && !namaAsli.includes(q) && !catatan.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const pengali = stateDokumen.arahUrutan === "asc" ? 1 : -1;

  tersaring.sort((a, b) => {
    if (stateDokumen.urutBerdasarkan === "nama") {
      const nA = String(a.namaTampilan || a.namaFile || "");
      const nB = String(b.namaTampilan || b.namaFile || "");
      const cmp = nA.localeCompare(nB, "id", { sensitivity: "base" });
      if (cmp !== 0) return cmp * pengali;
    } else if (stateDokumen.urutBerdasarkan === "ukuran") {
      const uA = Number(a.ukuran) || 0;
      const uB = Number(b.ukuran) || 0;
      if (uA !== uB) return (uA - uB) * pengali;
    } else {
      const tA = String(a.tanggalUnggah || a.createdAt || "");
      const tB = String(b.tanggalUnggah || b.createdAt || "");
      if (tA !== tB) return tA.localeCompare(tB) * pengali;
    }

    return String(a.namaTampilan || a.namaFile || "").localeCompare(
      String(b.namaTampilan || b.namaFile || ""),
      "id",
      { sensitivity: "base" }
    );
  });

  return tersaring;
}

/**
 * Menutup menu titik tiga (kebab popover) aktif.
 */
export function tutupMenuTitikTigaDokumen() {
  if (!stateDokumen.idMenuTitikTigaTerbuka) return;
  stateDokumen.idMenuTitikTigaTerbuka = null;
  document.querySelectorAll(".doc-kebab-popover:not([hidden])").forEach((el) => {
    el.setAttribute("hidden", "");
  });
  document.querySelectorAll(".doc-kebab-btn[aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

/**
 * Merender daftar arsip dokumen ke area #dokumen-list-region.
 */
export function renderDaftarDokumen() {
  const region = document.getElementById("dokumen-list-region");
  const barFilter = document.getElementById("dokumen-active-filter-bar");
  const summaryEl = document.getElementById("dokumen-result-summary");
  stateDokumen.pengendaliFilterDokumen?.perbaruiLencana();
  if (!region) return;

  stateDokumen.idMenuTitikTigaTerbuka = null;

  if (!stateDokumen.sudahDimuatPertamaKali) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat arsip dokumen"><div class="skeleton-card"><div class="skeleton-line skeleton-w-60"></div><div class="skeleton-line skeleton-w-40"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-w-70"></div><div class="skeleton-line skeleton-w-50"></div></div></div>`;
    return;
  }

  const adaFilter = stateDokumen.kataKunciCari.trim() !== "" || stateDokumen.filterKategoriId !== "ALL";
  const hasilSemua = ambilDokumenTersaringDanTerurut();
  const potong = hasilSemua.slice(0, stateDokumen.batasTampil);
  const sisaBelumTampil = Math.max(0, hasilSemua.length - potong.length);
  const totalDimuat = getDaftarDokumen().length;

  if (barFilter && summaryEl) {
    if (adaFilter || totalDimuat > 0) {
      barFilter.hidden = false;
      summaryEl.textContent = adaFilter
        ? `Menampilkan ${potong.length} dari ${hasilSemua.length} hasil cocok (total ${totalDimuat} dokumen dimuat)`
        : hasilSemua.length > potong.length
          ? `Menampilkan ${potong.length} dari ${totalDimuat} dokumen dimuat`
          : `Total ${totalDimuat} dokumen tercatat`;
    } else {
      barFilter.hidden = true;
    }
  }

  if (totalDimuat === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>', 24)}</div>
      <h3 class="empty-stage-title">Belum Ada Dokumen</h3>
      <p class="empty-stage-desc">Unggah berkas ke Google Drive dan kelompokkan rapi menurut kategori dengan menekan tombol <strong>Unggah Dokumen</strong> di atas.</p>
    </div>`;
    return;
  }

  if (hasilSemua.length === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <h3 class="empty-stage-title">Tidak Ada Dokumen yang Cocok</h3>
      <p class="empty-stage-desc">Tidak ditemukan dokumen yang sesuai dengan pencarian atau filter kategori yang aktif.</p>
    </div>`;
    return;
  }

  const barisHtml = potong
    .map((item) => {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
      const jenis = infoJenisBerkasMime(item.mimeType, item.namaFile);
      const namaUtama = item.namaTampilan || item.namaFile || "Dokumen Tanpa Nama";
      const tampilkanNamaFileAsli =
        item.namaFile && item.namaTampilan && item.namaFile.trim() !== item.namaTampilan.trim();
      const ukuranTeks = formatUkuranBerkas(item.ukuran);
      const tanggalTeks = formatTanggalDokumenLokal(item.tanggalUnggah || item.createdAt);
      const judulKegiatan = cariJudulKegiatanTerkait(item.kegiatanId);
      const tautanAman =
        item.tautan && /^https?:\/\//i.test(item.tautan)
          ? item.tautan
          : item.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
            : "#";

      return `<div class="doc-list-row" role="listitem" data-id="${escapeHtml(item.id)}">
        <div class="doc-col-name">
          <span class="doc-type-icon ${escapeHtml(jenis.kelasWarna)}" aria-hidden="true">${jenis.svg}</span>
          <div class="doc-title-block">
            <div class="doc-title-line">
              <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="doc-name-link" title="Buka ${escapeHtml(namaUtama)} di Google Drive">${escapeHtml(namaUtama)}</a>
              <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)} doc-badge-mobile-only">
                <span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>
                <span>${escapeHtml(infoKat.nama)}</span>
              </span>
            </div>
            ${tampilkanNamaFileAsli ? `<span class="doc-sub-filename">${escapeHtml(item.namaFile)}</span>` : ""}
            ${item.catatan ? `<p class="doc-sub-note">${escapeHtml(item.catatan)}</p>` : ""}
            <div class="doc-mobile-meta-line">
              <span>${escapeHtml(jenis.label)}</span>
              <span aria-hidden="true">•</span>
              <span>${escapeHtml(ukuranTeks)}</span>
              <span aria-hidden="true">•</span>
              <span>${escapeHtml(tanggalTeks)}</span>
              ${judulKegiatan ? `<span aria-hidden="true">•</span><span class="doc-mobile-kegiatan-ref">${escapeHtml(judulKegiatan)}</span>` : ""}
            </div>
          </div>
        </div>

        <div class="doc-col-cat">
          <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}">
            <span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>
            <span>${escapeHtml(infoKat.nama)}</span>
          </span>
        </div>

        <div class="doc-col-type">${escapeHtml(jenis.label)}</div>
        <div class="doc-col-size">${escapeHtml(ukuranTeks)}</div>
        <div class="doc-col-date">${escapeHtml(tanggalTeks)}</div>
        <div class="doc-col-activity">
          ${
            judulKegiatan
              ? `<span class="doc-activity-pill" title="${escapeHtml(judulKegiatan)}">${escapeHtml(judulKegiatan)}</span>`
              : `<span class="doc-muted-dash">—</span>`
          }
        </div>

        <div class="doc-col-actions">
          <div class="doc-desktop-actions">
            <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Buka di Drive" aria-label="Buka ${escapeHtml(namaUtama)} di Google Drive">
              ${svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 17)}
            </a>
            <button type="button" class="icon-btn" data-doc-action="edit" data-id="${escapeHtml(item.id)}" title="Ubah metadata" aria-label="Ubah metadata ${escapeHtml(namaUtama)}">
              ${svgIkon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 17)}
            </button>
            <button type="button" class="icon-btn doc-action-danger" data-doc-action="delete" data-id="${escapeHtml(item.id)}" title="Hapus dokumen" aria-label="Hapus ${escapeHtml(namaUtama)}">
              ${svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 17)}
            </button>
          </div>

          <div class="doc-mobile-kebab-wrap">
            <button
              type="button"
              class="icon-btn doc-kebab-btn"
              data-doc-action="toggle-menu"
              data-id="${escapeHtml(item.id)}"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Menu aksi untuk ${escapeHtml(namaUtama)}"
              title="Menu aksi"
            >
              ${svgIkon('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', 19)}
            </button>
            <div class="doc-kebab-popover" id="doc-menu-${escapeHtml(item.id)}" role="menu" hidden>
              <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="doc-kebab-item" role="menuitem">
                ${svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 16)}
                <span>Buka di Drive</span>
              </a>
              <button type="button" class="doc-kebab-item" role="menuitem" data-doc-action="edit" data-id="${escapeHtml(item.id)}">
                ${svgIkon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 16)}
                <span>Ubah metadata</span>
              </button>
              <button type="button" class="doc-kebab-item doc-kebab-item-danger" role="menuitem" data-doc-action="delete" data-id="${escapeHtml(item.id)}">
                ${svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16)}
                <span>Hapus</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const tombolMuatLebih =
    sisaBelumTampil > 0 || stateDokumen.adaLebihBanyakDokumenHalaman
      ? `<div class="doc-load-more-bar">
          ${sisaBelumTampil > 0
            ? `<button type="button" id="btn-tampil-lebih-dokumen" class="btn-secondary">Tampilkan ${Math.min(40, sisaBelumTampil)} dokumen berikutnya (${sisaBelumTampil} di memori)</button>`
            : ""
          }
          ${stateDokumen.adaLebihBanyakDokumenHalaman
            ? `<button type="button" id="btn-muat-server-dokumen" class="btn-secondary"${stateDokumen.sedangMuatLebihDokumen ? " disabled" : ""}>${stateDokumen.sedangMuatLebihDokumen ? "Memuat..." : "Muat lebih banyak dari server"}</button>`
            : ""
          }
        </div>`
      : "";

  region.innerHTML = `
    <div class="doc-list-surface">
      <div class="doc-list-header" aria-hidden="true">
        <div>Nama</div>
        <div>Kategori</div>
        <div>Jenis</div>
        <div>Ukuran</div>
        <div>Tanggal Unggah</div>
        <div>Kegiatan</div>
        <div class="doc-col-actions-head">Aksi</div>
      </div>
      <div class="doc-list-body" role="list">${barisHtml}</div>
    </div>
    ${tombolMuatLebih}
  `;
}

/**
 * Menerapkan filter kategori dokumen (misal saat diklik dari ringkasan kategori).
 * @param {string} targetKategoriId
 */
export function terapkanFilterKategoriDokumen(targetKategoriId) {
  stateDokumen.kataKunciCari = "";
  stateDokumen.filterKategoriId = targetKategoriId || "ALL";
  stateDokumen.batasTampil = 40;
  stateDokumen.pengendaliFilterDokumen?.tutup(false);

  const searchInput = document.getElementById("dokumen-search-input");
  const katSelect = document.getElementById("dokumen-filter-kategori");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategoriDokumen();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = stateDokumen.filterKategoriId;

  pindahKeBagian("dokumen");
  renderDaftarDokumen();
}

/**
 * Fase 6 Bagian D: Memperbarui status online/offline pada halaman Dokumen & tombol unggah/rapikan.
 */
export function perbaruiStatusJaringanDokumen() {
  const online = navigator.onLine;
  const btnUnggah = document.getElementById("btn-unggah-dokumen");
  if (btnUnggah instanceof HTMLButtonElement) {
    btnUnggah.disabled = !online;
    btnUnggah.title = online
      ? "Unggah berkas baru ke Google Drive"
      : "Tidak ada koneksi internet. Pengunggahan ke Google Drive memerlukan sambungan aktif.";
  }

  const btnRapikan = document.getElementById("btn-rapikan-dokumen-drive");
  if (btnRapikan instanceof HTMLButtonElement) {
    btnRapikan.disabled = !online;
    btnRapikan.title = online
      ? "Rapikan berkas ke subfolder kategori di Google Drive"
      : "Tidak ada koneksi internet. Merapikan folder memerlukan sambungan aktif.";
  }

  const noteOffline = document.getElementById("dokumen-offline-note");
  if (noteOffline) {
    noteOffline.hidden = online;
  }

  const btnSubmitUnggah = document.getElementById("dokumen-upload-submit-btn");
  if (btnSubmitUnggah instanceof HTMLButtonElement && !stateDokumen.pengendaliUnggahAktif) {
    btnSubmitUnggah.disabled = !online;
  }

  const radioTrashDrive = document.getElementById("dokumen-delete-mode-drive");
  if (radioTrashDrive instanceof HTMLInputElement) {
    radioTrashDrive.disabled = !online;
    if (!online && radioTrashDrive.checked) {
      const radioApp = document.getElementById("dokumen-delete-mode-app");
      if (radioApp instanceof HTMLInputElement) radioApp.checked = true;
    }
  }
}
