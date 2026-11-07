/**
 * Modul Render & Antarmuka Halaman Kegiatan
 * Menangani render kerangka kerja, kartu daftar kegiatan, dropdown kategori,
 * filter hasil saring, dan catatan terkait pada modal rincian kegiatan.
 */
import {
  stateKegiatan,
  manajerKategoriKegiatan,
  getDaftarKegiatan
} from "./state.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  svgIkon,
  IKON_KALENDER_META,
  IKON_JAM_META,
  IKON_LOKASI_META,
  IKON_CATATAN_META,
  IKON_GDOC_MINI,
  IKON_TAB_BARU,
  IKON_FILTER,
  formatTanggalTampilan,
  kelasBadgeStatus
} from "./util.js";
import { TANPA_KATEGORI_INFO } from "../kategori.js";
import { escapeHtml } from "../sidebar.js";
import {
  JENIS_CATATAN_GDOC,
  getCatatanTerkaitKegiatan,
  bukaModalBuatCatatanGdoc,
  formatTanggalCatatan,
  tautanAmanGoogleDocs
} from "../catatan.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";

export function tampilkanGalatHalamanKegiatan(pesan) {
  const box = document.getElementById("kegiatan-page-error");
  const txt = document.getElementById("kegiatan-page-error-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function pastikanKerangkaHalamanKegiatan() {
  const panel = document.getElementById("section-kegiatan");
  if (!panel || panel.querySelector("#kegiatan-toolbar")) return;

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Daftar Kegiatan</h2>
        <p class="section-heading-subtitle">Catat agenda kegiatan, atur kategori berwarna, dan perbarui status pelaksanaan secara langsung.</p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-buka-kelola-kategori" class="btn-secondary">${svgIkon('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', 17)}<span>Kelola Kategori</span></button>
        <button type="button" id="btn-tambah-kegiatan" class="btn-primary">${svgIkon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18, 2.2)}<span>Tambah Kegiatan</span></button>
      </div>
    </div>
    <div id="kegiatan-page-error" class="alert-box" role="alert" hidden>${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}<span id="kegiatan-page-error-text"></span></div>
    <div id="kegiatan-toolbar" class="filter-card filter-toolbar-shell">
      <div class="compact-toolbar-row">
        <div class="search-field-wrap compact-search-wrap">
          <label for="kegiatan-search-input" class="sr-only">Cari kegiatan</label>
          ${svgIkon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18, 2, "search-field-icon")}
          <input type="search" id="kegiatan-search-input" class="form-input input-with-icon" placeholder="Cari judul, catatan, atau lokasi..." autocomplete="off" />
        </div>
        <button
          type="button"
          id="kegiatan-filter-toggle-btn"
          class="btn-secondary btn-filter-toggle"
          data-filter-toggle
          aria-expanded="false"
          aria-controls="kegiatan-filter-panel"
        >
          ${IKON_FILTER}
          <span class="btn-filter-label">Filter</span>
          <span id="kegiatan-filter-count-badge" class="filter-count-badge" data-filter-badge hidden>0</span>
        </button>
      </div>

      <div id="kegiatan-filter-panel" class="filter-collapsible" data-filter-panel role="region" aria-label="Filter kegiatan" aria-hidden="true" inert>
        <div class="filter-collapsible-inner">
          <div class="filter-panel-content">
            <div class="filter-controls-grid">
              <div class="filter-control-item">
                <label for="kegiatan-filter-kategori" class="filter-label">Kategori</label>
                <select id="kegiatan-filter-kategori" class="form-select" data-default="ALL"><option value="ALL">Semua Kategori</option></select>
              </div>
              <div class="filter-control-item">
                <label for="kegiatan-filter-status" class="filter-label">Status</label>
                <select id="kegiatan-filter-status" class="form-select" data-default="ALL">
                  <option value="ALL">Semua Status</option>
                  <option value="Rencana">Rencana</option>
                  <option value="Berjalan">Berjalan</option>
                  <option value="Selesai">Selesai</option>
                </select>
              </div>
              <div class="filter-control-item">
                <label for="kegiatan-sort-tanggal" class="filter-label">Urutan Tanggal</label>
                <select id="kegiatan-sort-tanggal" class="form-select compact-sort-select" data-default="asc" aria-label="Urutan tanggal kegiatan" title="Urutan tanggal">
                  <option value="asc">Terlama &rarr; Terbaru</option>
                  <option value="desc">Terbaru &rarr; Terlama</option>
                </select>
              </div>
            </div>
            <div class="filter-panel-actions">
              <button type="button" id="kegiatan-filter-reset-desktop-btn" class="btn-secondary btn-sm-touch" data-filter-reset>Atur ulang</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="kegiatan-active-filter-bar" class="result-summary-bar" hidden>
      <span id="kegiatan-result-summary" class="result-summary-text"></span>
    </div>
    <div id="kegiatan-list-region" aria-live="polite"></div>
  </div>`;
}

export function perbaruiDropdownKategori() {
  const daftarKat = manajerKategoriKegiatan.getDaftarKategori();

  const selectFilter = document.getElementById("kegiatan-filter-kategori");
  if (selectFilter instanceof HTMLSelectElement) {
    const nilaiSebelumnya = stateKegiatan.filterKategoriId;
    selectFilter.innerHTML = [
      `<option value="ALL">Semua Kategori</option>`,
      ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`),
      `<option value="__TANPA_KATEGORI__">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`
    ].join("");

    const masihValid =
      nilaiSebelumnya === "ALL" ||
      nilaiSebelumnya === "__TANPA_KATEGORI__" ||
      daftarKat.some((k) => k.id === nilaiSebelumnya);
    stateKegiatan.filterKategoriId = masihValid ? nilaiSebelumnya : "ALL";
    selectFilter.value = stateKegiatan.filterKategoriId;
  }

  const selectForm = document.getElementById("kegiatan-kategori-select");
  if (selectForm instanceof HTMLSelectElement) {
    const nilaiFormSaatIni = selectForm.value;
    selectForm.innerHTML = [
      `<option value="">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`,
      ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`)
    ].join("");
    selectForm.value = daftarKat.some((k) => k.id === nilaiFormSaatIni) ? nilaiFormSaatIni : "";
  }
}

export function ambilKegiatanTersaring() {
  const q = stateKegiatan.kataKunciCari.trim().toLowerCase();
  const sumberAktif = getDaftarKegiatan();

  const tersaring = sumberAktif.filter((item) => {
    if (stateKegiatan.filterStatus !== "ALL" && item.status !== stateKegiatan.filterStatus) return false;

    if (stateKegiatan.filterKategoriId !== "ALL") {
      const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
      if (stateKegiatan.filterKategoriId === "__TANPA_KATEGORI__") {
        if (!infoKat.tetap) return false;
      } else if (infoKat.id !== stateKegiatan.filterKategoriId) {
        return false;
      }
    }

    if (q) {
      const cocok =
        item.judul.toLowerCase().includes(q) ||
        item.catatan.toLowerCase().includes(q) ||
        item.lokasi.toLowerCase().includes(q);
      if (!cocok) return false;
    }

    return true;
  });

  tersaring.sort((a, b) => {
    const tglA = a.tanggal || "";
    const tglB = b.tanggal || "";
    if (tglA !== tglB) {
      return stateKegiatan.urutanTanggal === "asc" ? tglA.localeCompare(tglB) : tglB.localeCompare(tglA);
    }
    const jamA = a.waktuMulai || "99:99";
    const jamB = b.waktuMulai || "99:99";
    if (jamA !== jamB) {
      return stateKegiatan.urutanTanggal === "asc" ? jamA.localeCompare(jamB) : jamB.localeCompare(jamA);
    }
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
  });

  return tersaring;
}

export function renderDaftarKegiatan() {
  const region = document.getElementById("kegiatan-list-region");
  const barFilterAktif = document.getElementById("kegiatan-active-filter-bar");
  const ringkasanEl = document.getElementById("kegiatan-result-summary");
  stateKegiatan.pengendaliFilter?.perbaruiLencana();
  if (!region) return;

  if (!stateKegiatan.sudahDimuatPertamaKali) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar kegiatan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div><div class="skeleton-line skeleton-w-50"></div></div></div>`;
    return;
  }

  const adaFilter =
    stateKegiatan.kataKunciCari.trim() !== "" ||
    stateKegiatan.filterKategoriId !== "ALL" ||
    stateKegiatan.filterStatus !== "ALL";
  const hasil = ambilKegiatanTersaring();
  const totalAktif = getDaftarKegiatan().length;

  if (barFilterAktif && ringkasanEl) {
    if (adaFilter || totalAktif > 0) {
      barFilterAktif.hidden = false;
      ringkasanEl.textContent = adaFilter
        ? `Menampilkan ${hasil.length} dari ${totalAktif} kegiatan dimuat`
        : `Total ${totalAktif} kegiatan dimuat di perangkat`;
    } else {
      barFilterAktif.hidden = true;
    }
  }

  if (totalAktif === 0) {
    region.innerHTML = `<div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 24)}</div>
      <h3 class="empty-stage-title">Belum Ada Kegiatan</h3>
      <p class="empty-stage-desc">Mulai catat kegiatan atau rencana agenda Anda dengan menekan tombol <strong>Tambah Kegiatan</strong> di atas.</p>
    </div>`;
    return;
  }

  if (hasil.length === 0) {
    region.innerHTML = `<div class="empty-stage-card"><h3 class="empty-stage-title">Tidak Ada Kegiatan yang Cocok</h3><p class="empty-stage-desc">Tidak ditemukan kegiatan yang sesuai dengan kata kunci pencarian atau filter yang dipilih.</p></div>`;
    return;
  }

  const sedangOnline = navigator.onLine;
  const htmlKartu = hasil.map((item) => {
    const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
    const rentangWaktu = item.waktuMulai
      ? item.waktuSelesai ? `${item.waktuMulai} – ${item.waktuSelesai}` : item.waktuMulai
      : "";
    const opsiStatusCepat = DAFTAR_STATUS_KEGIATAN.map(
      (st) => `<option value="${escapeHtml(st)}" ${item.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`
    ).join("");
    const catatanTerkait = getCatatanTerkaitKegiatan(item.id);

    return `<article class="kegiatan-card${item.status === "Selesai" ? " is-completed" : ""}" data-id="${escapeHtml(item.id)}">
      <div class="kegiatan-card-top">
        <div class="kegiatan-badges-row">
          <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
          <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
        </div>
        <div class="kegiatan-quick-status">
          <label for="quick-status-${escapeHtml(item.id)}" class="sr-only">Ubah status cepat untuk ${escapeHtml(item.judul)}</label>
          <select id="quick-status-${escapeHtml(item.id)}" class="quick-status-select" data-action="quick-status" data-id="${escapeHtml(item.id)}" aria-label="Status kegiatan ${escapeHtml(item.judul)}">${opsiStatusCepat}</select>
        </div>
      </div>
      <h3 class="kegiatan-card-title">
        <button type="button" class="event-title-trigger" data-action="detail-kegiatan" data-id="${escapeHtml(item.id)}">${escapeHtml(item.judul)}</button>
      </h3>
      <div class="kegiatan-meta-list">
        <span class="kegiatan-meta-item">${IKON_KALENDER_META}<span>${escapeHtml(formatTanggalTampilan(item.tanggal))}</span></span>
        ${rentangWaktu ? `<span class="kegiatan-meta-item">${IKON_JAM_META}<span>${escapeHtml(rentangWaktu)}</span></span>` : ""}
        ${item.lokasi ? `<span class="kegiatan-meta-item">${IKON_LOKASI_META}<span>${escapeHtml(item.lokasi)}</span></span>` : ""}
        ${catatanTerkait.length > 0 ? `<span class="kegiatan-meta-item">${IKON_CATATAN_META}<span>${catatanTerkait.length} catatan terkait</span></span>` : ""}
      </div>
      ${item.catatan ? `<p class="kegiatan-card-note">${escapeHtml(item.catatan)}</p>` : ""}
      <div class="kegiatan-card-footer kegiatan-card-footer-wrap">
        <button type="button" class="btn-secondary btn-sm-touch" data-action="detail-kegiatan" data-id="${escapeHtml(item.id)}">Rincian${catatanTerkait.length > 0 ? ` (${catatanTerkait.length})` : ""}</button>
        <button type="button" class="btn-secondary btn-sm-touch" data-action="buat-notulensi" data-id="${escapeHtml(item.id)}"${!sedangOnline ? ' disabled title="Tidak ada koneksi internet. Pembuatan notulensi Google Docs memerlukan internet."' : ""}>Buat notulensi</button>
        <button type="button" class="btn-secondary btn-sm-touch" data-action="edit-kegiatan" data-id="${escapeHtml(item.id)}">Ubah</button>
        <button type="button" class="btn-danger-outline btn-sm-touch" data-action="delete-kegiatan" data-id="${escapeHtml(item.id)}">Hapus</button>
      </div>
    </article>`;
  }).join("");

  const tombolMuatLebih = stateKegiatan.adaLebihBanyakHalaman
    ? `<div class="doc-load-more-bar">
        <button type="button" id="btn-muat-lebih-kegiatan" class="btn-secondary"${stateKegiatan.sedangMuatLebihBanyak ? " disabled" : ""}>
          ${stateKegiatan.sedangMuatLebihBanyak ? "Memuat..." : "Muat lebih banyak kegiatan"}
        </button>
      </div>`
    : "";

  region.innerHTML = `<div class="kegiatan-list-grid">${htmlKartu}</div>${tombolMuatLebih}`;
}

export function deteksiKegiatanPadaModalDetail() {
  const modal = document.getElementById("kegiatan-detail-modal");
  const detailBody = document.getElementById("kegiatan-detail-body");
  if (!modal || modal.hidden || !detailBody) return null;

  const semuaKegiatan = getDaftarKegiatan();

  const elDenganId = detailBody.querySelector("[data-id]");
  if (elDenganId) {
    const idDariDom = String(elDenganId.getAttribute("data-id") || "").trim();
    const ditemukan = semuaKegiatan.find((k) => k.id === idDariDom);
    if (ditemukan) return ditemukan;
  }

  const teksBody = String(detailBody.textContent || "");
  for (const kandidatId of [stateKegiatan.idKegiatanDetailAktif, stateKegiatan.idKegiatanTerakhirDiklik]) {
    if (!kandidatId) continue;
    const item = semuaKegiatan.find((k) => k.id === kandidatId);
    if (item && (!item.judul || teksBody.includes(item.judul))) {
      return item;
    }
  }

  const headingEl = detailBody.querySelector("h3, h4, .kegiatan-card-title");
  if (headingEl) {
    const teksJudul = String(headingEl.textContent || "").trim();
    const cocok = semuaKegiatan.find((k) => k.judul.trim() === teksJudul);
    if (cocok) return cocok;
  }

  return null;
}

export function renderCatatanTerkaitDiDetailModal() {
  const modal = document.getElementById("kegiatan-detail-modal");
  const wadah = document.getElementById("kegiatan-detail-catatan-section");
  if (!modal || !wadah) return;

  if (modal.hidden) {
    wadah.innerHTML = "";
    return;
  }

  const kegiatan = deteksiKegiatanPadaModalDetail();
  if (!kegiatan) {
    wadah.innerHTML = "";
    return;
  }

  stateKegiatan.idKegiatanDetailAktif = kegiatan.id;
  const catatanTerkait = getCatatanTerkaitKegiatan(kegiatan.id);
  const sedangOnline = navigator.onLine;

  const daftarHtml = catatanTerkait.length === 0
    ? `<p class="detail-catatan-empty">Belum ada catatan atau notulensi yang dikaitkan dengan kegiatan ini.</p>`
    : `<ul class="detail-catatan-list">${catatanTerkait.map((c) => {
        const gdoc = c.jenis === JENIS_CATATAN_GDOC;
        const urlDocs = gdoc ? tautanAmanGoogleDocs(c) : "";
        return `<li class="detail-catatan-item">
          <div class="detail-catatan-main">
            <div class="detail-catatan-title-row">
              <span class="detail-catatan-icon" aria-hidden="true">${gdoc ? IKON_GDOC_MINI : IKON_CATATAN_META}</span>
              <span class="detail-catatan-title">${escapeHtml(c.judul)}</span>
              <span class="catatan-kind-badge ${gdoc ? "kind-gdoc" : "kind-singkat"}">${gdoc ? "Google Docs" : "Singkat"}</span>
            </div>
            <span class="detail-catatan-meta">${escapeHtml(formatTanggalCatatan(c.tanggal))}</span>
            ${!gdoc && c.isi ? `<p class="detail-catatan-snippet">${escapeHtml(c.isi)}</p>` : ""}
          </div>
          <div class="detail-catatan-item-actions">
            ${
              gdoc
                ? `<a href="${escapeHtml(urlDocs)}" target="_blank" rel="noopener" class="btn-secondary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Google Docs</span></a>`
                : `<button type="button" class="btn-secondary btn-sm-touch" data-detail-catatan-action="edit-singkat" data-catatan-id="${escapeHtml(c.id)}">Lihat / Ubah</button>`
            }
          </div>
        </li>`;
      }).join("")}</ul>`;

  wadah.innerHTML = `<section class="detail-catatan-box" aria-labelledby="detail-catatan-heading">
    <div class="detail-catatan-header">
      <div class="detail-catatan-heading-wrap">
        <h3 id="detail-catatan-heading" class="sub-card-title">Catatan Terkait (${catatanTerkait.length})</h3>
        <span class="field-hint-text">Catatan singkat dan notulensi Google Docs untuk kegiatan ini</span>
      </div>
      <div class="detail-catatan-actions">
        <button type="button" class="btn-secondary btn-sm-touch" data-detail-catatan-action="tambah-catatan" data-kegiatan-id="${escapeHtml(kegiatan.id)}">+ Tambah catatan</button>
        <button type="button" class="btn-primary btn-sm-touch" data-detail-catatan-action="buat-notulensi" data-kegiatan-id="${escapeHtml(kegiatan.id)}"${!sedangOnline ? ' disabled title="Tidak ada koneksi internet. Pembuatan Google Docs memerlukan sambungan aktif."' : ""}>${IKON_GDOC_MINI}<span>Buat notulensi</span></button>
      </div>
    </div>
    ${daftarHtml}
  </section>`;
}

export function picuBuatNotulensiUntukKegiatan(kegiatan) {
  if (!kegiatan) return;
  bukaModalBuatCatatanGdoc({
    templat: "notulensi",
    kegiatanId: kegiatan.id,
    tanggal: parseTanggal(kegiatan.tanggal) ? kegiatan.tanggal : hariIni(),
    judul: `Notulensi - ${kegiatan.judul}`
  });
}