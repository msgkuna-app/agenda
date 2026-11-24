/**
 * View Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Semua pengelolaan DOM halaman Daftar Kegiatan: kerangka halaman, dropdown
 * kategori, penyaringan, render kartu kegiatan, dan kotak galat. State filter
 * (kata kunci, kategori, status, urutan) tinggal di sini karena hanya
 * memengaruhi tampilan.
 */
import { DAFTAR_STATUS_KEGIATAN, MAKS_HARI_RENTANG } from "../../config/constants.js";
import { escapeHtml, svgIkon, NAMA_HARI, NAMA_BULAN } from "../../util-html.js";
import { TANPA_KATEGORI_INFO } from "../kategori/index.js";
import { initFilterPanel } from "../../filter-panel.js";
import { parseTanggal, jumlahHariRentang, akhiriRentang, geserTanggal } from "../../util-tanggal.js";
import { infoHari } from "../../hari-libur.js";
import { getCatatanTerkaitKegiatan } from "../../modules/catatan/index.js";
import { saringLampiranHari, labelTanggalLampiran } from "../../lampiran-hari.js";
import { getDaftarFoto } from "../foto/state.js";
import { htmlFotoKegiatan } from "../foto/view.js";
import { getDaftarDokumen } from "../dokumen/state.js";
import { htmlDokumenKegiatan } from "../dokumen/kegiatan-view.js";
import {
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  getAdaLebihBanyakKegiatan,
  getSedangMuatLebihKegiatan
} from "./state.js";
import { formatRentangTanggal } from "./format.js";

export const IKON_KALENDER_META = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
export const IKON_JAM_META = svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 15);
export const IKON_LOKASI_META = svgIkon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 15);
export const IKON_CATATAN_META = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 15);
export const IKON_GDOC_MINI = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/>', 16);
export const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 14);
const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

// --- State filter (hanya memengaruhi tampilan) -------------------------------

let kataKunciCari = "";
let filterKategoriId = "ALL";
let filterStatus = "ALL";
let urutanTanggal = "desc";
let pengendaliFilterKegiatan = null;

export function getKataKunciCari() {
  return kataKunciCari;
}

export function setKataKunciCari(nilai) {
  kataKunciCari = String(nilai == null ? "" : nilai);
}

export function getFilterKategoriId() {
  return filterKategoriId;
}

export function setFilterKategoriId(nilai) {
  filterKategoriId = String(nilai || "ALL");
}

export function getFilterStatus() {
  return filterStatus;
}

export function setFilterStatus(nilai) {
  filterStatus = String(nilai || "ALL");
}

export function getUrutanTanggal() {
  return urutanTanggal;
}

export function setUrutanTanggal(nilai) {
  urutanTanggal = nilai === "desc" ? "desc" : "asc";
}

/**
 * Memasang panel filter (tombol Filter + lencana) pada toolbar kegiatan.
 * Mengembalikan pengendali panel agar controller dapat menutupnya.
 */
export function pasangFilterKegiatan() {
  pengendaliFilterKegiatan = initFilterPanel(document.getElementById("kegiatan-toolbar"));
  return pengendaliFilterKegiatan;
}

export function tutupPanelFilterKegiatan() {
  pengendaliFilterKegiatan?.tutup(false);
}

// --- Render ------------------------------------------------------------------

export function kelasBadgeStatus(status) {
  if (status === "Berjalan") return "status-badge status-berjalan";
  if (status === "Selesai") return "status-badge status-selesai";
  return "status-badge status-rencana";
}

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
                <select id="kegiatan-sort-tanggal" class="form-select compact-sort-select" data-default="desc" aria-label="Urutan tanggal kegiatan" title="Urutan tanggal">
                  <option value="desc">Terbaru &rarr; Terlama</option>
                  <option value="asc">Terlama &rarr; Terbaru</option>
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
    const nilaiSebelumnya = filterKategoriId;
    selectFilter.innerHTML = [
      `<option value="ALL">Semua Kategori</option>`,
      ...daftarKat.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`),
      `<option value="__TANPA_KATEGORI__">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`
    ].join("");

    const masihValid =
      nilaiSebelumnya === "ALL" ||
      nilaiSebelumnya === "__TANPA_KATEGORI__" ||
      daftarKat.some((k) => k.id === nilaiSebelumnya);
    filterKategoriId = masihValid ? nilaiSebelumnya : "ALL";
    selectFilter.value = filterKategoriId;
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

function ambilKegiatanTersaring() {
  const q = kataKunciCari.trim().toLowerCase();
  const sumberAktif = getDaftarKegiatan();

  const tersaring = sumberAktif.filter((item) => {
    if (filterStatus !== "ALL" && item.status !== filterStatus) return false;

    if (filterKategoriId !== "ALL") {
      const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
      if (filterKategoriId === "__TANPA_KATEGORI__") {
        if (!infoKat.tetap) return false;
      } else if (infoKat.id !== filterKategoriId) {
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
      return urutanTanggal === "asc" ? tglA.localeCompare(tglB) : tglB.localeCompare(tglA);
    }
    const jamA = a.waktuMulai || "99:99";
    const jamB = b.waktuMulai || "99:99";
    if (jamA !== jamB) {
      return urutanTanggal === "asc" ? jamA.localeCompare(jamB) : jamB.localeCompare(jamA);
    }
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
  });

  return tersaring;
}

/**
 * Blok foto + dokumen untuk satu kartu kegiatan.
 * Sejak v1.8.69 kegiatan berturutan dirender sebagai satu kartu PER HARI (sama
 * seperti halaman Jadwal), sehingga blok ini hanya menampilkan lampiran milik hari
 * kartu tersebut. Kegiatan satu hari menampilkan seluruh lampirannya seperti semula.
 */
function htmlBlokLampiranKegiatan(item, tampilkanPerHari, tanggalHari, hariKe) {
  const fotoKegiatan = getDaftarFoto().filter((f) => f.kegiatanId === item.id);
  const dokumenKegiatan = getDaftarDokumen().filter((d) => d.kegiatanId === item.id);
  const totalHari = jumlahHariRentang(item);
  const fotoTampil = tampilkanPerHari
    ? saringLampiranHari(fotoKegiatan, item, tanggalHari, hariKe)
    : fotoKegiatan;
  const dokumenTampil = tampilkanPerHari
    ? saringLampiranHari(dokumenKegiatan, item, tanggalHari, hariKe)
    : dokumenKegiatan;
  const keteranganHari = tampilkanPerHari
    ? `<p class="kegiatan-card-note kegiatan-lampiran-hari">Lampiran ${escapeHtml(labelTanggalLampiran(tanggalHari))} — hari ke-${hariKe} dari ${totalHari}${hariKe === 1 ? " (hari pertama)" : ""}.</p>`
    : "";
  return `${keteranganHari}
      ${htmlFotoKegiatan(item.id, fotoTampil, tanggalHari, item)}
      ${htmlDokumenKegiatan(item.id, dokumenTampil, tanggalHari, item)}`;
}

/**
 * Mengembangkan daftar kegiatan menjadi daftar kartu: kegiatan berturutan
 * menghasilkan satu kartu untuk SETIAP hari rentangnya (pola sama dengan
 * `kelompokkanKegiatanPerTanggal` di jadwal.js), sedangkan kegiatan satu hari
 * menghasilkan satu kartu apa adanya. Nomor hari dihitung dari tanggal mulai,
 * jadi lencana "Hari ke-N dari M" selalu benar.
 * @param {Array} daftarKegiatan hasil penyaringan, sudah terurut
 * @returns {Array}
 */
function kembangkanKartuPerHari(daftarKegiatan) {
  const hasil = [];
  daftarKegiatan.forEach((item) => {
    const mulai = parseTanggal(item.tanggal);
    const totalHari = jumlahHariRentang(item);
    if (!mulai || totalHari <= 1) {
      hasil.push(item);
      return;
    }
    const akhir = akhiriRentang(item.tanggal, item.tanggalSelesai);
    let kursor = item.tanggal;
    let nomorHari = 1;
    while (kursor && kursor <= akhir && nomorHari <= totalHari && nomorHari <= MAKS_HARI_RENTANG) {
      hasil.push({
        ...item,
        tanggalHari: kursor,
        hariKe: nomorHari,
        totalHari,
        adalahHariPertama: nomorHari === 1
      });
      kursor = geserTanggal(kursor, 1);
      nomorHari += 1;
    }
  });
  return hasil;
}

/** Satu kartu kegiatan (satu hari bila kegiatan berturutan). */
function renderKartuKegiatan(item, sedangOnline) {
  const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
  const rentangWaktu = item.waktuMulai
    ? item.waktuSelesai ? `${item.waktuMulai} – ${item.waktuSelesai}` : item.waktuMulai
    : "";
  const opsiStatusCepat = DAFTAR_STATUS_KEGIATAN.map(
    (st) => `<option value="${escapeHtml(st)}" ${item.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`
  ).join("");
  const catatanTerkait = getCatatanTerkaitKegiatan(item.id);

  const totalHari = jumlahHariRentang(item);
  const kegiatanBerturutan = totalHari > 1;
  const tampilkanPerHari = kegiatanBerturutan && Boolean(item.tanggalHari);
  const hariKe = Number.isFinite(Number(item.hariKe)) ? Number(item.hariKe) : 1;
  const tanggalHari = String(item.tanggalHari || item.tanggal || "");
  const labelHariHtml = tampilkanPerHari
    ? `<span class="badge-lanjutan" title="Kartu ini mewakili satu hari dari kegiatan berturutan">Hari ke-${hariKe} dari ${totalHari}</span>`
    : "";
  // Id pemilih status harus unik: satu kegiatan berturutan menghasilkan beberapa kartu.
  const idStatus = `quick-status-${item.id}${tampilkanPerHari ? `-${hariKe}` : ""}`;

  return `<article class="kegiatan-card${item.status === "Selesai" ? " is-completed" : ""}" data-id="${escapeHtml(item.id)}">
    <div class="kegiatan-card-top">
      <div class="kegiatan-badges-row">
        <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
        <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
        ${labelHariHtml}
      </div>
      <div class="kegiatan-quick-status">
        <label for="${escapeHtml(idStatus)}" class="sr-only">Ubah status cepat untuk ${escapeHtml(item.judul)}</label>
        <select id="${escapeHtml(idStatus)}" class="quick-status-select" data-action="quick-status" data-id="${escapeHtml(item.id)}" aria-label="Ubah status cepat untuk ${escapeHtml(item.judul)}">${opsiStatusCepat}</select>
      </div>
    </div>
    <h3 class="kegiatan-card-title">
      <button type="button" class="event-title-trigger" data-action="detail-kegiatan" data-id="${escapeHtml(item.id)}">${escapeHtml(item.judul)}</button>
    </h3>
    <div class="kegiatan-meta-list">
      <span class="kegiatan-meta-item">${IKON_KALENDER_META}<span>${escapeHtml(formatRentangTanggal(item))}</span></span>
      ${rentangWaktu ? `<span class="kegiatan-meta-item">${IKON_JAM_META}<span>${escapeHtml(rentangWaktu)}</span></span>` : ""}
      ${item.lokasi ? `<span class="kegiatan-meta-item">${IKON_LOKASI_META}<span>${escapeHtml(item.lokasi)}</span></span>` : ""}
      ${catatanTerkait.length > 0 ? `<span class="kegiatan-meta-item">${IKON_CATATAN_META}<span>${catatanTerkait.length} catatan terkait</span></span>` : ""}
    </div>
    ${item.catatan ? `<p class="kegiatan-card-note">${escapeHtml(item.catatan)}</p>` : ""}
    ${htmlBlokLampiranKegiatan(item, tampilkanPerHari, tanggalHari, hariKe)}
    <div class="kegiatan-card-footer kegiatan-card-footer-wrap">
      <button type="button" class="btn-secondary btn-sm-touch" data-action="detail-kegiatan" data-id="${escapeHtml(item.id)}">Rincian${catatanTerkait.length > 0 ? ` (${catatanTerkait.length})` : ""}</button>
      <button type="button" class="btn-secondary btn-sm-touch" data-action="buat-notulensi" data-id="${escapeHtml(item.id)}" data-tanggal="${escapeHtml(tampilkanPerHari ? tanggalHari : "")}"${!sedangOnline ? ' disabled title="Tidak ada koneksi internet. Pembuatan notulensi Google Docs memerlukan internet."' : ""}>Buat notulensi</button>
      <button type="button" class="btn-secondary btn-sm-touch" data-action="edit-kegiatan" data-id="${escapeHtml(item.id)}">Ubah</button>
      <button type="button" class="btn-secondary btn-sm-touch" data-action="duplikat-kegiatan" data-id="${escapeHtml(item.id)}" title="Buat kegiatan baru dengan isian yang sama, bertanggal hari ini">Duplikat</button>
      <button type="button" class="btn-danger-outline btn-sm-touch" data-action="delete-kegiatan" data-id="${escapeHtml(item.id)}">Hapus</button>
    </div>
  </article>`;
}

/**
 * Mengelompokkan kartu menurut tanggalnya, menyerupai "Daftar Agenda" pada halaman
 * Jadwal. Kegiatan satu hari memakai `tanggal`; kartu hasil pemecahan memakai
 * `tanggalHari`. Urutan grup mengikuti pilihan Urutan Tanggal pengguna, sedangkan
 * urutan di dalam grup mengikuti urutan kegiatan yang sudah tersaring.
 * @param {Array} daftarKartu
 * @returns {Array<[string, Array]>}
 */
function kelompokkanKartuPerTanggal(daftarKartu) {
  const peta = new Map();
  daftarKartu.forEach((item) => {
    const kunci = String(item.tanggalHari || item.tanggal || "");
    if (!peta.has(kunci)) peta.set(kunci, []);
    peta.get(kunci).push(item);
  });
  const kunciUrut = Array.from(peta.keys()).sort((a, b) => {
    // Kartu tanpa tanggal sah diletakkan paling akhir, bukan di puncak daftar.
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
  if (urutanTanggal === "desc") {
    const tanpaTanggal = kunciUrut.filter((k) => !k);
    const bertanggal = kunciUrut.filter((k) => k).reverse();
    return [...bertanggal, ...tanpaTanggal].map((k) => [k, peta.get(k)]);
  }
  return kunciUrut.map((k) => [k, peta.get(k)]);
}

/** Judul kelompok tanggal: "Senin, 25 November 2026". */
function judulTanggalGrup(tanggalStr) {
  const obj = parseTanggal(tanggalStr);
  if (!obj) return "Tanpa tanggal";
  return `${NAMA_HARI[obj.getDay()]}, ${obj.getDate()} ${NAMA_BULAN[obj.getMonth()]} ${obj.getFullYear()}`;
}

/** Satu kelompok tanggal berisi kartu-kartu kegiatannya. */
function renderGrupTanggal(tanggalStr, daftarItem, sedangOnline) {
  const infoGrup = tanggalStr ? infoHari(tanggalStr) : null;

  let labelLibur = "";
  if (infoGrup) {
    if (infoGrup.libur.length > 0) {
      labelLibur = infoGrup.libur
        .map((l) => (l.jenis === "cuti" ? `Cuti bersama: ${l.nama}` : l.nama))
        .join(", ");
    } else if (infoGrup.minggu) {
      labelLibur = "Hari Minggu";
    }
  }
  const labelHariBesar =
    infoGrup && infoGrup.hariBesar.length > 0
      ? infoGrup.hariBesar.map((h) => h.nama).join(", ")
      : "";

  return `<section class="agenda-day-group" aria-label="${escapeHtml(judulTanggalGrup(tanggalStr))}">
    <div class="agenda-day-header">
      <div class="agenda-day-title-wrap">
        <h3 class="agenda-day-title${infoGrup && infoGrup.merah ? " text-libur" : ""}">
          ${escapeHtml(judulTanggalGrup(tanggalStr))}
          ${labelLibur ? ` • <span class="agenda-holiday-tag">${escapeHtml(labelLibur)}</span>` : ""}
          ${labelHariBesar ? ` • <span class="agenda-haribesar-tag">${escapeHtml(labelHariBesar)}</span>` : ""}
        </h3>
        <span class="agenda-day-count">${daftarItem.length} kegiatan</span>
      </div>
    </div>
    <div class="kegiatan-list-grid">${daftarItem.map((item) => renderKartuKegiatan(item, sedangOnline)).join("")}</div>
  </section>`;
}

export function renderDaftarKegiatan() {
  const region = document.getElementById("kegiatan-list-region");
  const barFilterAktif = document.getElementById("kegiatan-active-filter-bar");
  const ringkasanEl = document.getElementById("kegiatan-result-summary");
  pengendaliFilterKegiatan?.perbaruiLencana();
  if (!region) return;

  if (!isKegiatanSudahDimuat()) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar kegiatan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div><div class="skeleton-line skeleton-w-50"></div></div></div>`;
    return;
  }

  const adaFilter = kataKunciCari.trim() !== "" || filterKategoriId !== "ALL" || filterStatus !== "ALL";
  const hasil = ambilKegiatanTersaring();
  const totalAktif = getDaftarKegiatan().length;
  // Kegiatan berturutan dipecah menjadi satu kartu per hari (v1.8.69); hitungan
  // kegiatan tetap dipakai pada ringkasan, dan jumlah kartu disebutkan bila berbeda
  // agar "+5 kartu" tidak disalahartikan sebagai kegiatan baru.
  const kartuHasil = kembangkanKartuPerHari(hasil);
  const selisihKartu = kartuHasil.length - hasil.length;

  if (barFilterAktif && ringkasanEl) {
    if (adaFilter || totalAktif > 0) {
      barFilterAktif.hidden = false;
      const catatanKartu = selisihKartu > 0 ? ` (${kartuHasil.length} kartu, kegiatan berturutan dipecah per hari)` : "";
      ringkasanEl.textContent = adaFilter
        ? `Menampilkan ${hasil.length} dari ${totalAktif} kegiatan dimuat${catatanKartu}`
        : `Total ${totalAktif} kegiatan dimuat di perangkat${catatanKartu}`;
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
  // Kartu dikelompokkan per tanggal seperti "Daftar Agenda" pada halaman Jadwal,
  // sehingga kegiatan berturutan terbaca sebagai rangkaian hari, bukan tumpukan
  // kartu seragam.
  const htmlGrup = kelompokkanKartuPerTanggal(kartuHasil)
    .map(([tgl, daftarItem]) => renderGrupTanggal(tgl, daftarItem, sedangOnline))
    .join("");

  const tombolMuatLebih = getAdaLebihBanyakKegiatan()
    ? `<div class="doc-load-more-bar">
        <button type="button" id="btn-muat-lebih-kegiatan" class="btn-secondary"${getSedangMuatLebihKegiatan() ? " disabled" : ""}>
          ${getSedangMuatLebihKegiatan() ? "Memuat..." : "Muat lebih banyak kegiatan"}
        </button>
      </div>`
    : "";

  region.innerHTML = `<div class="agenda-groups-stack">${htmlGrup}</div>${tombolMuatLebih}`;
}

// --- Formulir & petunjuk -----------------------------------------------------

export function setPesanGalatFormKegiatan(pesan) {
  const box = document.getElementById("kegiatan-form-alert");
  const txt = document.getElementById("kegiatan-form-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function perbaruiPetunjukHariLiburForm(tanggalStr) {
  let el = document.getElementById("kegiatan-tanggal-hint-libur");
  const tanggalInput = document.getElementById("kegiatan-tanggal-input");
  if (!tanggalInput) return;

  if (!el) {
    el = document.createElement("div");
    el.id = "kegiatan-tanggal-hint-libur";
    el.className = "field-hint-libur";
    el.setAttribute("aria-live", "polite");
    tanggalInput.insertAdjacentElement("afterend", el);
  }

  if (!tanggalStr || !parseTanggal(tanggalStr)) {
    el.hidden = true;
    el.textContent = "";
    el.className = "field-hint-libur";
    return;
  }

  const info = infoHari(tanggalStr);
  if (info.merah) {
    el.hidden = false;
    el.className = "field-hint-libur is-libur";
    const liburNasional = (info.libur || []).filter((item) => item.jenis === "libur" || item.jenis === "tambahan");
    const cutiBersama = (info.libur || []).filter((item) => item.jenis === "cuti");
    if (liburNasional.length > 0) {
      el.textContent = `Tanggal ini libur nasional: ${liburNasional.map((l) => l.nama).join(", ")}`;
    } else if (cutiBersama.length > 0) {
      el.textContent = `Tanggal ini cuti bersama: ${cutiBersama.map((c) => c.nama).join(", ")}`;
    } else if (info.minggu) {
      el.textContent = "Hari Minggu";
    } else {
      el.textContent = info.keterangan || "Hari libur";
    }
  } else if (info.hariBesar && info.hariBesar.length > 0) {
    el.hidden = false;
    el.className = "field-hint-libur is-hari-besar";
    el.textContent = `Hari besar: ${info.hariBesar.map((h) => h.nama).join(", ")}`;
  } else {
    el.hidden = true;
    el.textContent = "";
    el.className = "field-hint-libur";
  }
}
