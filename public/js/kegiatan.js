/**
 * Modul Halaman Kegiatan & Langganan Firestore "kegiatan" (Fase 1)
 * Mencakup daftar kegiatan, pencarian (judul, catatan, lokasi), filter kategori & status,
 * pengurutan tanggal, tambah, ubah, hapus dengan konfirmasi, ubah status cepat,
 * serta integrasi real-time dengan modul kategori.js (Aturan #5, #6, #7, #9, #10, #12).
 */
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  formatPesanGalatFirestore
} from "./firebase-config.js";
import {
  buatManajerKategori,
  inisialisasiDialogKelolaKategori,
  KATEGORI_KEGIATAN_BAWAAN,
  TANPA_KATEGORI_INFO
} from "./kategori.js";
import { hariIni, parseTanggal } from "./util-tanggal.js";
import { escapeHtml, pindahKeBagian } from "./sidebar.js";

export const DAFTAR_STATUS_KEGIATAN = ["Rencana", "Berjalan", "Selesai"];

const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des"
];

/**
 * Instance manajer kategori khusus koleksi "kategoriKegiatan" dengan pemakai "kegiatan".
 */
export const manajerKategoriKegiatan = buatManajerKategori({
  namaKoleksiKategori: "kategoriKegiatan",
  namaKoleksiPemakai: "kegiatan",
  labelItemPemakai: "kegiatan",
  daftarBawaan: KATEGORI_KEGIATAN_BAWAAN
});

let unsubscribeSnapshotKegiatan = null;
let daftarKegiatan = [];
let sudahDimuatPertamaKali = false;
let antarmukaSudahDiikat = false;
let dialogKelolaKategoriCtrl = null;

// State filter & pengurutan halaman Kegiatan
let kataKunciCari = "";
let filterKategoriId = "ALL"; // "ALL" | "__TANPA_KATEGORI__" | <kategoriId>
let filterStatus = "ALL";     // "ALL" | "Rencana" | "Berjalan" | "Selesai"
let urutanTanggal = "asc";    // "asc" (Terdekat/Terlama dulu) | "desc" (Terbaru dulu)

// State modal form & konfirmasi hapus kegiatan
let formModalTerbuka = false;
let hapusModalTerbuka = false;
let idKegiatanAkanDihapus = null;
let fokusSebelumModalKegiatan = null;

/**
 * Memformat tanggal "YYYY-MM-DD" menggunakan parseTanggal dari util-tanggal.js (Aturan #6).
 * @param {string} tanggalStr
 * @returns {string}
 */
function formatTanggalTampilan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) {
    return tanggalStr || "-";
  }
  const hari = NAMA_HARI_PENDEK[objek.getDay()];
  const tgl = objek.getDate();
  const bln = NAMA_BULAN_PENDEK[objek.getMonth()];
  const thn = objek.getFullYear();

  const strHariIni = hariIni();
  if (tanggalStr === strHariIni) {
    return `Hari ini • ${hari}, ${tgl} ${bln} ${thn}`;
  }
  return `${hari}, ${tgl} ${bln} ${thn}`;
}

/**
 * Memvalidasi format jam "HH:MM" (opsional).
 * @param {string} jam
 * @returns {boolean}
 */
function validJamOpsional(jam) {
  if (!jam) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(jam);
}

/**
 * Menghitung jumlah kegiatan lokal di memori yang memakai kategoriId tertentu.
 * Dipakai untuk menampilkan lencana jumlah real-time pada layar Kelola Kategori.
 * @param {string} kategoriId
 * @returns {number}
 */
function hitungKegiatanPemakaiLokal(kategoriId) {
  const target = String(kategoriId || "").trim();
  if (!target) {
    return daftarKegiatan.filter((item) => {
      const info = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
      return info.tetap;
    }).length;
  }
  return daftarKegiatan.filter((item) => String(item.kategoriId || "").trim() === target).length;
}

function tampilkanGalatHalamanKegiatan(pesan) {
  const box = document.getElementById("kegiatan-page-error");
  const txt = document.getElementById("kegiatan-page-error-text");
  if (!box || !txt) return;
  if (pesan) {
    txt.textContent = pesan;
    box.hidden = false;
  } else {
    txt.textContent = "";
    box.hidden = true;
  }
}

function kelasBadgeStatus(status) {
  if (status === "Berjalan") return "status-badge status-berjalan";
  if (status === "Selesai") return "status-badge status-selesai";
  return "status-badge status-rencana";
}

/**
 * Membangun struktur HTML halaman Kegiatan di dalam #section-kegiatan satu kali.
 */
function pastikanKerangkaHalamanKegiatan() {
  const panel = document.getElementById("section-kegiatan");
  if (!panel || panel.querySelector("#kegiatan-toolbar")) {
    return;
  }

  panel.innerHTML = `
    <div class="page-stack">
      <div class="section-header-bar">
        <div class="section-heading-group">
          <h2 class="section-heading-title">Daftar Kegiatan</h2>
          <p class="section-heading-subtitle">
            Catat agenda kegiatan, atur kategori berwarna, dan perbarui status pelaksanaan secara langsung.
          </p>
        </div>
        <div class="section-header-actions">
          <button type="button" id="btn-buka-kelola-kategori" class="btn-secondary">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span>Kelola Kategori</span>
          </button>
          <button type="button" id="btn-tambah-kegiatan" class="btn-primary">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Tambah Kegiatan</span>
          </button>
        </div>
      </div>

      <div id="kegiatan-page-error" class="alert-box" role="alert" hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="kegiatan-page-error-text"></span>
      </div>

      <!-- Bilah Pencarian, Filter, dan Pengurutan -->
      <div id="kegiatan-toolbar" class="filter-card">
        <div class="search-field-wrap">
          <label for="kegiatan-search-input" class="sr-only">Cari kegiatan</label>
          <svg class="search-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            id="kegiatan-search-input"
            class="form-input input-with-icon"
            placeholder="Cari judul, catatan, atau lokasi..."
            autocomplete="off"
          />
        </div>

        <div class="filter-controls-grid">
          <div class="filter-control-item">
            <label for="kegiatan-filter-kategori" class="filter-label">Kategori</label>
            <select id="kegiatan-filter-kategori" class="form-select">
              <option value="ALL">Semua Kategori</option>
            </select>
          </div>

          <div class="filter-control-item">
            <label for="kegiatan-filter-status" class="filter-label">Status</label>
            <select id="kegiatan-filter-status" class="form-select">
              <option value="ALL">Semua Status</option>
              <option value="Rencana">Rencana</option>
              <option value="Berjalan">Berjalan</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>

          <div class="filter-control-item">
            <label for="kegiatan-sort-tanggal" class="filter-label">Urutan Tanggal</label>
            <select id="kegiatan-sort-tanggal" class="form-select">
              <option value="asc">Tanggal Terlama &rarr; Terbaru</option>
              <option value="desc">Tanggal Terbaru &rarr; Terlama</option>
            </select>
          </div>
        </div>

        <div id="kegiatan-active-filter-bar" class="active-filter-bar" hidden>
          <span id="kegiatan-result-summary" class="result-summary-text"></span>
          <button type="button" id="btn-reset-filter-kegiatan" class="btn-link-filter">
            Atur ulang filter
          </button>
        </div>
      </div>

      <!-- Wadah Daftar Kegiatan -->
      <div id="kegiatan-list-region" aria-live="polite"></div>
    </div>
  `;
}

/**
 * Menyegarkan opsi dropdown kategori pada filter halaman & form modal kegiatan.
 */
function perbaruiDropdownKategori() {
  const daftarKat = manajerKategoriKegiatan.getDaftarKategori();

  const selectFilter = document.getElementById("kegiatan-filter-kategori");
  if (selectFilter instanceof HTMLSelectElement) {
    const nilaiSebelumnya = filterKategoriId;
    const opsiHtml = [
      `<option value="ALL">Semua Kategori</option>`,
      ...daftarKat.map(
        (k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`
      ),
      `<option value="__TANPA_KATEGORI__">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`
    ];
    selectFilter.innerHTML = opsiHtml.join("");

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
    const opsiForm = [
      `<option value="">${escapeHtml(TANPA_KATEGORI_INFO.nama)}</option>`,
      ...daftarKat.map(
        (k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`
      )
    ];
    selectForm.innerHTML = opsiForm.join("");
    if (daftarKat.some((k) => k.id === nilaiFormSaatIni)) {
      selectForm.value = nilaiFormSaatIni;
    } else {
      selectForm.value = "";
    }
  }
}

/**
 * Menyaring dan mengurutkan daftar kegiatan sesuai state pencarian, filter, dan urutan.
 */
function ambilKegiatanTersaring() {
  const q = kataKunciCari.trim().toLowerCase();

  const tersaring = daftarKegiatan.filter((item) => {
    if (filterStatus !== "ALL" && item.status !== filterStatus) {
      return false;
    }

    if (filterKategoriId !== "ALL") {
      const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
      if (filterKategoriId === "__TANPA_KATEGORI__") {
        if (!infoKat.tetap) return false;
      } else if (infoKat.id !== filterKategoriId) {
        return false;
      }
    }

    if (q) {
      const cocokJudul = item.judul.toLowerCase().includes(q);
      const cocokCatatan = item.catatan.toLowerCase().includes(q);
      const cocokLokasi = item.lokasi.toLowerCase().includes(q);
      if (!cocokJudul && !cocokCatatan && !cocokLokasi) {
        return false;
      }
    }

    return true;
  });

  tersaring.sort((a, b) => {
    const tglA = a.tanggal || "";
    const tglB = b.tanggal || "";
    if (tglA !== tglB) {
      return urutanTanggal === "asc"
        ? tglA.localeCompare(tglB)
        : tglB.localeCompare(tglA);
    }
    const jamA = a.waktuMulai || "99:99";
    const jamB = b.waktuMulai || "99:99";
    if (jamA !== jamB) {
      return urutanTanggal === "asc"
        ? jamA.localeCompare(jamB)
        : jamB.localeCompare(jamA);
    }
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", {
      sensitivity: "base"
    });
  });

  return tersaring;
}

/**
 * Merender daftar kartu kegiatan ke dalam #kegiatan-list-region (semua teks di-escape sesuai Aturan #9).
 */
function renderDaftarKegiatan() {
  const region = document.getElementById("kegiatan-list-region");
  const barFilterAktif = document.getElementById("kegiatan-active-filter-bar");
  const ringkasanEl = document.getElementById("kegiatan-result-summary");
  if (!region) return;

  if (!sudahDimuatPertamaKali) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <div class="spinner" aria-hidden="true"></div>
        <p class="session-status-text">Memuat daftar kegiatan...</p>
      </div>
    `;
    return;
  }

  const adaFilter =
    kataKunciCari.trim() !== "" || filterKategoriId !== "ALL" || filterStatus !== "ALL";
  const hasil = ambilKegiatanTersaring();

  if (barFilterAktif && ringkasanEl) {
    if (adaFilter || daftarKegiatan.length > 0) {
      barFilterAktif.hidden = false;
      ringkasanEl.textContent = adaFilter
        ? `Menampilkan ${hasil.length} dari ${daftarKegiatan.length} kegiatan`
        : `Total ${daftarKegiatan.length} kegiatan tercatat`;
      const btnReset = document.getElementById("btn-reset-filter-kegiatan");
      if (btnReset) btnReset.hidden = !adaFilter;
    } else {
      barFilterAktif.hidden = true;
    }
  }

  if (daftarKegiatan.length === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <div class="empty-stage-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h3 class="empty-stage-title">Belum Ada Kegiatan</h3>
        <p class="empty-stage-desc">
          Mulai catat kegiatan atau rencana agenda Anda dengan menekan tombol <strong>Tambah Kegiatan</strong> di atas.
        </p>
      </div>
    `;
    return;
  }

  if (hasil.length === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <h3 class="empty-stage-title">Tidak Ada Kegiatan yang Cocok</h3>
        <p class="empty-stage-desc">
          Tidak ditemukan kegiatan yang sesuai dengan kata kunci pencarian atau filter yang dipilih.
        </p>
      </div>
    `;
    return;
  }

  const htmlKartu = hasil
    .map((item) => {
      const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
      const rentangWaktu = item.waktuMulai
        ? item.waktuSelesai
          ? `${item.waktuMulai} – ${item.waktuSelesai}`
          : item.waktuMulai
        : "";

      const opsiStatusCepat = DAFTAR_STATUS_KEGIATAN.map(
        (st) =>
          `<option value="${escapeHtml(st)}" ${item.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`
      ).join("");

      return `
        <article class="kegiatan-card${item.status === "Selesai" ? " is-completed" : ""}" data-id="${escapeHtml(item.id)}">
          <div class="kegiatan-card-top">
            <div class="kegiatan-badges-row">
              <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}">
                <span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>
                <span>${escapeHtml(infoKat.nama)}</span>
              </span>
              <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
            </div>

            <div class="kegiatan-quick-status">
              <label for="quick-status-${escapeHtml(item.id)}" class="sr-only">
                Ubah status cepat untuk ${escapeHtml(item.judul)}
              </label>
              <select
                id="quick-status-${escapeHtml(item.id)}"
                class="quick-status-select"
                data-action="quick-status"
                data-id="${escapeHtml(item.id)}"
                aria-label="Status kegiatan ${escapeHtml(item.judul)}"
              >
                ${opsiStatusCepat}
              </select>
            </div>
          </div>

          <h3 class="kegiatan-card-title">${escapeHtml(item.judul)}</h3>

          <div class="kegiatan-meta-list">
            <span class="kegiatan-meta-item">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>${escapeHtml(formatTanggalTampilan(item.tanggal))}</span>
            </span>

            ${
              rentangWaktu
                ? `<span class="kegiatan-meta-item">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>${escapeHtml(rentangWaktu)}</span>
                  </span>`
                : ""
            }

            ${
              item.lokasi
                ? `<span class="kegiatan-meta-item">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span>${escapeHtml(item.lokasi)}</span>
                  </span>`
                : ""
            }
          </div>

          ${
            item.catatan
              ? `<p class="kegiatan-card-note">${escapeHtml(item.catatan)}</p>`
              : ""
          }

          <div class="kegiatan-card-footer">
            <button
              type="button"
              class="btn-secondary btn-sm-touch"
              data-action="edit-kegiatan"
              data-id="${escapeHtml(item.id)}"
            >
              Ubah
            </button>
            <button
              type="button"
              class="btn-danger-outline btn-sm-touch"
              data-action="delete-kegiatan"
              data-id="${escapeHtml(item.id)}"
            >
              Hapus
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  region.innerHTML = `<div class="kegiatan-list-grid">${htmlKartu}</div>`;
}

function setPesanGalatFormKegiatan(pesan) {
  const box = document.getElementById("kegiatan-form-alert");
  const txt = document.getElementById("kegiatan-form-alert-text");
  if (!box || !txt) return;
  if (pesan) {
    txt.textContent = pesan;
    box.hidden = false;
  } else {
    txt.textContent = "";
    box.hidden = true;
  }
}

/**
 * Membuka modal Tambah / Ubah Kegiatan.
 * @param {object | null} [kegiatanEdit=null]
 */
function bukaModalFormKegiatan(kegiatanEdit = null) {
  const modal = document.getElementById("kegiatan-form-modal");
  const titleEl = document.getElementById("kegiatan-form-title");
  const idInput = document.getElementById("kegiatan-edit-id");
  const judulInput = document.getElementById("kegiatan-judul-input");
  const tanggalInput = document.getElementById("kegiatan-tanggal-input");
  const mulaiInput = document.getElementById("kegiatan-mulai-input");
  const selesaiInput = document.getElementById("kegiatan-selesai-input");
  const lokasiInput = document.getElementById("kegiatan-lokasi-input");
  const kategoriSelect = document.getElementById("kegiatan-kategori-select");
  const statusSelect = document.getElementById("kegiatan-status-select");
  const catatanInput = document.getElementById("kegiatan-catatan-input");
  const submitBtn = document.getElementById("kegiatan-form-submit-btn");

  if (!modal) return;

  fokusSebelumModalKegiatan =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setPesanGalatFormKegiatan("");
  perbaruiDropdownKategori();

  if (kegiatanEdit) {
    if (titleEl) titleEl.textContent = "Ubah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (idInput) idInput.value = kegiatanEdit.id;
    if (judulInput) judulInput.value = kegiatanEdit.judul || "";
    if (tanggalInput) tanggalInput.value = kegiatanEdit.tanggal || hariIni();
    if (mulaiInput) mulaiInput.value = kegiatanEdit.waktuMulai || "";
    if (selesaiInput) selesaiInput.value = kegiatanEdit.waktuSelesai || "";
    if (lokasiInput) lokasiInput.value = kegiatanEdit.lokasi || "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const info = manajerKategoriKegiatan.cariInfoKategori(kegiatanEdit.kategoriId);
      kategoriSelect.value = info.tetap ? "" : info.id;
    }
    if (statusSelect instanceof HTMLSelectElement) {
      statusSelect.value = DAFTAR_STATUS_KEGIATAN.includes(kegiatanEdit.status)
        ? kegiatanEdit.status
        : "Rencana";
    }
    if (catatanInput) catatanInput.value = kegiatanEdit.catatan || "";
  } else {
    if (titleEl) titleEl.textContent = "Tambah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Kegiatan";
    if (idInput) idInput.value = "";
    if (judulInput) judulInput.value = "";
    if (tanggalInput) tanggalInput.value = hariIni();
    if (mulaiInput) mulaiInput.value = "";
    if (selesaiInput) selesaiInput.value = "";
    if (lokasiInput) lokasiInput.value = "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const daftarKat = manajerKategoriKegiatan.getDaftarKategori();
      if (filterKategoriId !== "ALL" && filterKategoriId !== "__TANPA_KATEGORI__") {
        kategoriSelect.value = filterKategoriId;
      } else {
        kategoriSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
      }
    }
    if (statusSelect instanceof HTMLSelectElement) {
      statusSelect.value = "Rencana";
    }
    if (catatanInput) catatanInput.value = "";
  }

  formModalTerbuka = true;
  modal.hidden = false;

  requestAnimationFrame(() => {
    if (judulInput instanceof HTMLElement) {
      judulInput.focus();
    }
  });
}

function tutupModalFormKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-form-modal");
  if (!modal || !formModalTerbuka) return;
  formModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatFormKegiatan("");

  if (
    kembalikanFokus &&
    fokusSebelumModalKegiatan &&
    document.contains(fokusSebelumModalKegiatan)
  ) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

/**
 * Membuka dialog konfirmasi penghapusan kegiatan.
 * @param {object} item
 */
function bukaDialogHapusKegiatan(item) {
  const modal = document.getElementById("kegiatan-delete-modal");
  const desc = document.getElementById("kegiatan-delete-desc");
  const cancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  if (!modal) return;

  fokusSebelumModalKegiatan =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idKegiatanAkanDihapus = item.id;
  if (desc) {
    desc.textContent = `Kegiatan "${item.judul}" pada ${formatTanggalTampilan(item.tanggal)} akan dihapus permanen.`;
  }

  hapusModalTerbuka = true;
  modal.hidden = false;

  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) {
      cancelBtn.focus();
    }
  });
}

function tutupDialogHapusKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-delete-modal");
  if (!modal || !hapusModalTerbuka) return;
  hapusModalTerbuka = false;
  idKegiatanAkanDihapus = null;
  modal.hidden = true;

  if (
    kembalikanFokus &&
    fokusSebelumModalKegiatan &&
    document.contains(fokusSebelumModalKegiatan)
  ) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

/**
 * Validasi masukan form kegiatan (judul & tanggal wajib, waktu selesai >= waktu mulai).
 */
function ambilDanValidasiDataForm() {
  const judulEl = document.getElementById("kegiatan-judul-input");
  const tanggalEl = document.getElementById("kegiatan-tanggal-input");
  const mulaiEl = document.getElementById("kegiatan-mulai-input");
  const selesaiEl = document.getElementById("kegiatan-selesai-input");
  const lokasiEl = document.getElementById("kegiatan-lokasi-input");
  const kategoriEl = document.getElementById("kegiatan-kategori-select");
  const statusEl = document.getElementById("kegiatan-status-select");
  const catatanEl = document.getElementById("kegiatan-catatan-input");

  const judul = String(judulEl?.value || "").trim();
  const tanggal = String(tanggalEl?.value || "").trim();
  const waktuMulai = String(mulaiEl?.value || "").trim();
  const waktuSelesai = String(selesaiEl?.value || "").trim();
  const lokasi = String(lokasiEl?.value || "").trim();
  const kategoriId = String(kategoriEl?.value || "").trim();
  const statusMentah = String(statusEl?.value || "Rencana").trim();
  const catatan = String(catatanEl?.value || "").trim();

  if (!judul) {
    throw new Error("Judul kegiatan wajib diisi.");
  }

  if (!tanggal || !parseTanggal(tanggal)) {
    throw new Error("Tanggal kegiatan wajib diisi dengan format tanggal yang benar.");
  }

  if (!validJamOpsional(waktuMulai) || !validJamOpsional(waktuSelesai)) {
    throw new Error("Format waktu harus berupa jam:menit (HH:MM).");
  }

  if (waktuSelesai && !waktuMulai) {
    throw new Error("Isi waktu mulai terlebih dahulu sebelum mengisi waktu selesai.");
  }

  if (waktuMulai && waktuSelesai && waktuSelesai < waktuMulai) {
    throw new Error("Waktu selesai tidak boleh lebih awal dari waktu mulai.");
  }

  const status = DAFTAR_STATUS_KEGIATAN.includes(statusMentah) ? statusMentah : "Rencana";

  return {
    judul,
    catatan,
    tanggal,
    waktuMulai,
    waktuSelesai,
    lokasi,
    kategoriId,
    status
  };
}

/**
 * Mengatur filter kategori dari layar Kelola Kategori ("Lihat kegiatan kategori ini").
 * @param {string} targetKategoriId
 */
export function terapkanFilterKategoriKegiatan(targetKategoriId) {
  kataKunciCari = "";
  filterStatus = "ALL";
  filterKategoriId = targetKategoriId || "ALL";

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "ALL";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = filterKategoriId;

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

/**
 * Mengikat seluruh event listener Halaman Kegiatan, modal form, konfirmasi hapus, dan Kelola Kategori.
 */
export function initHalamanKegiatan() {
  pastikanKerangkaHalamanKegiatan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  dialogKelolaKategoriCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriKegiatan,
    hitungPemakaiLokal: hitungKegiatanPemakaiLokal,
    onLihatItemKategori: (katId) => terapkanFilterKategoriKegiatan(katId),
    judulDialog: "Kelola Kategori Kegiatan"
  });

  manajerKategoriKegiatan.onChange(() => {
    perbaruiDropdownKategori();
    renderDaftarKegiatan();
  });

  const btnKelolaKat = document.getElementById("btn-buka-kelola-kategori");
  if (btnKelolaKat) {
    btnKelolaKat.addEventListener("click", () => {
      dialogKelolaKategoriCtrl?.buka();
    });
  }

  const btnTambah = document.getElementById("btn-tambah-kegiatan");
  if (btnTambah) {
    btnTambah.addEventListener("click", () => bukaModalFormKegiatan(null));
  }

  const searchInput = document.getElementById("kegiatan-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      kataKunciCari = searchInput.value;
      renderDaftarKegiatan();
    });
  }

  const filterKatSelect = document.getElementById("kegiatan-filter-kategori");
  if (filterKatSelect) {
    filterKatSelect.addEventListener("change", () => {
      filterKategoriId = filterKatSelect.value;
      renderDaftarKegiatan();
    });
  }

  const filterStatusSelect = document.getElementById("kegiatan-filter-status");
  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", () => {
      filterStatus = filterStatusSelect.value;
      renderDaftarKegiatan();
    });
  }

  const sortSelect = document.getElementById("kegiatan-sort-tanggal");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      urutanTanggal = sortSelect.value === "desc" ? "desc" : "asc";
      renderDaftarKegiatan();
    });
  }

  const btnResetFilter = document.getElementById("btn-reset-filter-kegiatan");
  if (btnResetFilter) {
    btnResetFilter.addEventListener("click", () => {
      kataKunciCari = "";
      filterKategoriId = "ALL";
      filterStatus = "ALL";
      if (searchInput instanceof HTMLInputElement) searchInput.value = "";
      if (filterKatSelect instanceof HTMLSelectElement) filterKatSelect.value = "ALL";
      if (filterStatusSelect instanceof HTMLSelectElement) filterStatusSelect.value = "ALL";
      renderDaftarKegiatan();
    });
  }

  const listRegion = document.getElementById("kegiatan-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action]") : null;
      if (!btn) return;
      const aksi = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const item = daftarKegiatan.find((k) => k.id === id);
      if (!item) return;

      if (aksi === "edit-kegiatan") {
        bukaModalFormKegiatan(item);
      } else if (aksi === "delete-kegiatan") {
        bukaDialogHapusKegiatan(item);
      }
    });

    listRegion.addEventListener("change", async (e) => {
      const select =
        e.target instanceof HTMLSelectElement &&
        e.target.getAttribute("data-action") === "quick-status"
          ? e.target
          : null;
      if (!select) return;

      const id = select.getAttribute("data-id");
      const statusBaru = select.value;
      if (!id || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) return;

      tampilkanGalatHalamanKegiatan("");
      select.disabled = true;
      try {
        const db = getFirestoreDb();
        await updateDoc(doc(db, "kegiatan", id), {
          status: statusBaru,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
        renderDaftarKegiatan();
      } finally {
        select.disabled = false;
      }
    });
  }

  // Modal Form Kegiatan
  const formModal = document.getElementById("kegiatan-form-modal");
  const formEl = document.getElementById("kegiatan-form");
  const formCloseBtn = document.getElementById("kegiatan-form-close-btn");
  const formCancelBtn = document.getElementById("kegiatan-form-cancel-btn");
  const formSubmitBtn = document.getElementById("kegiatan-form-submit-btn");

  if (formCloseBtn) {
    formCloseBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  }
  if (formCancelBtn) {
    formCancelBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  }
  if (formModal) {
    formModal.addEventListener("click", (e) => {
      if (e.target === formModal) tutupModalFormKegiatan(true);
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      setPesanGalatFormKegiatan("");

      let payload;
      try {
        payload = ambilDanValidasiDataForm();
      } catch (validErr) {
        setPesanGalatFormKegiatan(
          validErr instanceof Error ? validErr.message : "Data kegiatan belum lengkap."
        );
        return;
      }

      const idEdit = String(document.getElementById("kegiatan-edit-id")?.value || "").trim();
      const sekarang = new Date().toISOString();

      if (formSubmitBtn) formSubmitBtn.disabled = true;
      try {
        const db = getFirestoreDb();
        if (idEdit) {
          await updateDoc(doc(db, "kegiatan", idEdit), {
            ...payload,
            updatedAt: sekarang
          });
        } else {
          await addDoc(collection(db, "kegiatan"), {
            ...payload,
            createdAt: sekarang,
            updatedAt: sekarang
          });
        }
        tutupModalFormKegiatan(true);
      } catch (err) {
        setPesanGalatFormKegiatan(formatPesanGalatFirestore(err));
      } finally {
        if (formSubmitBtn) formSubmitBtn.disabled = false;
      }
    });
  }

  // Modal Konfirmasi Hapus Kegiatan
  const deleteModal = document.getElementById("kegiatan-delete-modal");
  const deleteCancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  const deleteConfirmBtn = document.getElementById("kegiatan-delete-confirm-btn");

  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener("click", () => tutupDialogHapusKegiatan(true));
  }
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) tutupDialogHapusKegiatan(true);
    });
  }
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
      if (!idKegiatanAkanDihapus) return;
      const targetId = idKegiatanAkanDihapus;
      deleteConfirmBtn.disabled = true;
      tampilkanGalatHalamanKegiatan("");
      try {
        const db = getFirestoreDb();
        await deleteDoc(doc(db, "kegiatan", targetId));
        tutupDialogHapusKegiatan(false);
      } catch (err) {
        tutupDialogHapusKegiatan(false);
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
      } finally {
        deleteConfirmBtn.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusKegiatan(true);
    } else if (formModalTerbuka) {
      e.preventDefault();
      tutupModalFormKegiatan(true);
    }
  });
}

/**
 * Memulai langganan real-time koleksi "kategoriKegiatan" dan "kegiatan" setelah pengguna sah masuk.
 * Mematuhi Aturan #5: selalu menghentikan langganan lama terlebih dahulu sebelum membuat yang baru.
 */
export function subscribeKegiatan() {
  unsubscribeKegiatan();
  initHalamanKegiatan();
  sudahDimuatPertamaKali = false;
  renderDaftarKegiatan();

  manajerKategoriKegiatan.subscribe(
    () => {
      perbaruiDropdownKategori();
      renderDaftarKegiatan();
    },
    (pesanGalat) => {
      tampilkanGalatHalamanKegiatan(pesanGalat);
    }
  );

  const db = getFirestoreDb();
  const kolKegiatan = collection(db, "kegiatan");

  unsubscribeSnapshotKegiatan = onSnapshot(
    kolKegiatan,
    (snapshot) => {
      const itemBaru = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        itemBaru.push({
          id: docSnap.id,
          judul: String(d.judul || ""),
          catatan: String(d.catatan || ""),
          tanggal: String(d.tanggal || ""),
          waktuMulai: String(d.waktuMulai || ""),
          waktuSelesai: String(d.waktuSelesai || ""),
          lokasi: String(d.lokasi || ""),
          kategoriId: String(d.kategoriId || ""),
          status: DAFTAR_STATUS_KEGIATAN.includes(d.status) ? d.status : "Rencana",
          createdAt: d.createdAt || "",
          updatedAt: d.updatedAt || ""
        });
      });

      daftarKegiatan = itemBaru;
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanKegiatan("");
      renderDaftarKegiatan();
      dialogKelolaKategoriCtrl?.segarkanTampilan();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
      renderDaftarKegiatan();
    }
  );

  return () => unsubscribeKegiatan();
}

/**
 * Menghentikan langganan Firestore kegiatan & kategori kegiatan saat logout atau pergantian sesi (Aturan #5).
 */
export function unsubscribeKegiatan() {
  if (typeof unsubscribeSnapshotKegiatan === "function") {
    try {
      unsubscribeSnapshotKegiatan();
    } catch (_e) {
      // Abaikan kesalahan berhenti langganan
    }
    unsubscribeSnapshotKegiatan = null;
  }

  manajerKategoriKegiatan.unsubscribe();
  daftarKegiatan = [];
  sudahDimuatPertamaKali = false;

  tutupModalFormKegiatan(false);
  tutupDialogHapusKegiatan(false);
  dialogKelolaKategoriCtrl?.tutup(false);
}
