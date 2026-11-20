/**
 * Modul Halaman Kegiatan & Langganan Firestore "kegiatan" (Fase 1 + Optimalisasi Pembacaan Fase 5)
 * Optimalisasi Fase 5:
 * 1. Memisahkan listener menjadi:
 *    (a) Jendela tanggal aktif (Dashboard & Jadwal, +/- 1 bulan dari bulan aktif, where tanggal >= dan <=)
 *    (b) Daftar halaman kegiatan terpaginasi (limit 50, orderBy tanggal desc, startAfter)
 * 2. Soft delete: where("dihapusAt", "==", null) agar item sampah tidak dibaca listener utama.
 * 3. Jembatan getDocs sekali pakai (ambilSemuaKegiatanSekaliPakai, ambilKegiatanRentangTanggal)
 *    untuk Laporan, Pencarian, dan Ekspor Cadangan tanpa listener permanen.
 * 4. Penghitung kategori akurat menggunakan getCountFromServer.
 */
import { DAFTAR_STATUS_KEGIATAN, UKURAN_HALAMAN_KEGIATAN, KOLEKSI } from "./config/constants.js";
export { DAFTAR_STATUS_KEGIATAN, UKURAN_HALAMAN_KEGIATAN };
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  formatPesanGalatFirestore
} from "./services/firestoreService.js";
import {
  buatManajerKategori,
  inisialisasiDialogKelolaKategori,
  KATEGORI_KEGIATAN_BAWAAN,
  TANPA_KATEGORI_INFO
} from "./kategori.js";
import { hariIni, parseTanggal, tanggalLokal, tambahHari } from "./util-tanggal.js";
import { pindahKeBagian } from "./sidebar.js";
import { tampilkanToast } from "./shared/toast.js";
import { escapeHtml, svgIkon, NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "./util-html.js";
import { initFilterPanel } from "./filter-panel.js";
import {
  JENIS_CATATAN_GDOC,
  getCatatanTerkaitKegiatan,
  onPerubahanCatatan,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc,
  formatTanggalCatatan,
  tautanAmanGoogleDocs
} from "./catatan.js";
import { infoHari } from "./hari-libur.js";

// svgIkon, NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK kini diimpor dari util-html.js (Tahap 4a deduplikasi)

const IKON_KALENDER_META = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
const IKON_JAM_META = svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 15);
const IKON_LOKASI_META = svgIkon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 15);
const IKON_CATATAN_META = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 15);
const IKON_GDOC_MINI = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/>', 16);
const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 14);
const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

export const manajerKategoriKegiatan = buatManajerKategori({
  namaKoleksiKategori: KOLEKSI.KATEGORI_KEGIATAN,
  namaKoleksiPemakai: KOLEKSI.KEGIATAN,
  labelItemPemakai: "kegiatan",
  daftarBawaan: KATEGORI_KEGIATAN_BAWAAN
});

// Cache memori internal kegiatan aktif yang telah dimuat
const petaKegiatanJendela = new Map();
const petaKegiatanHalaman = new Map();
const petaKegiatanTambahan = new Map();

let unsubscribeSnapshotJendela = null;
let unsubscribeSnapshotHalaman = null;
let jendelaAwalAktif = "";
let jendelaAkhirAktif = "";

let lastDocKegiatanHalaman = null;
let adaLebihBanyakKegiatanHalaman = false;
let sedangMuatLebihBanyakKegiatan = false;

let sudahDimuatPertamaKali = false;
let antarmukaSudahDiikat = false;
let dialogKelolaKategoriCtrl = null;
const listenersPerubahanKegiatan = new Set();

let kataKunciCari = "";
let filterKategoriId = "ALL";
let filterStatus = "ALL";
let urutanTanggal = "asc";
let pengendaliFilterKegiatan = null;

let formModalTerbuka = false;
let hapusModalTerbuka = false;
let idKegiatanAkanDihapus = null;
let fokusSebelumModalKegiatan = null;

let pembukaDetailKegiatanFn = null;
let idKegiatanTerakhirDiklik = "";
let idKegiatanDetailAktif = "";

export function daftarkanPembukaDetailKegiatan(fn) {
  pembukaDetailKegiatanFn = typeof fn === "function" ? fn : null;
}

/**
 * Mengembalikan seluruh kegiatan aktif (tanpa dihapusAt) yang saat ini berada di memori
 * (gabungan listener jendela, listener halaman, dan hasil fetch).
 */
/**
 * Menggabungkan ketiga sumber data. Untuk id yang sama, salinan dengan updatedAt
 * paling baru yang menang; jika sama, sumber yang lebih "hidup" (listener) menang.
 */
function gabungkanPetaKegiatan() {
  const gabungan = new Map();
  const tambahkan = (peta) => {
    peta.forEach((item, id) => {
      const lama = gabungan.get(id);
      if (!lama || String(item.updatedAt || "") >= String(lama.updatedAt || "")) {
        gabungan.set(id, item);
      }
    });
  };
  // Dari prioritas terendah ke tertinggi
  tambahkan(petaKegiatanTambahan);
  tambahkan(petaKegiatanHalaman);
  tambahkan(petaKegiatanJendela);
  return gabungan;
}

export function getDaftarKegiatan() {
  return Array.from(gabungkanPetaKegiatan().values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Mengembalikan daftar kegiatan khusus pada jendela tanggal aktif (Dashboard & Jadwal).
 */
export function getKegiatanJendela() {
  return Array.from(petaKegiatanJendela.values())
    .filter((item) => !item.dihapusAt)
    .map((item) => ({ ...item }));
}

/**
 * Kompatibilitas mundur: tempat sampah kini memiliki listener mandiri di sampah.js,
 * namun fungsi ini tetap dipertahankan agar modul lain tidak patah.
 */
export function getDaftarKegiatanDiSampah() {
  return Array.from(gabungkanPetaKegiatan().values())
    .filter((item) => Boolean(item.dihapusAt))
    .map((item) => ({ ...item }));
}

export async function hapusLunakKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, KOLEKSI.KEGIATAN, targetId), {
    dihapusAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  petaKegiatanJendela.delete(targetId);
  petaKegiatanHalaman.delete(targetId);
  petaKegiatanTambahan.delete(targetId);
  beritahuPerubahanKegiatan();
}

export async function pulihkanKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, KOLEKSI.KEGIATAN, targetId), {
    dihapusAt: null,
    updatedAt: new Date().toISOString()
  });
}

export async function hapusPermanenKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.KEGIATAN, targetId));
  petaKegiatanJendela.delete(targetId);
  petaKegiatanHalaman.delete(targetId);
  petaKegiatanTambahan.delete(targetId);
  beritahuPerubahanKegiatan();
}

export function isKegiatanSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function onPerubahanKegiatan(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanKegiatan.add(listener);
  return () => listenersPerubahanKegiatan.delete(listener);
}

function beritahuPerubahanKegiatan() {
  const salinan = getDaftarKegiatan();
  const statusMuat = sudahDimuatPertamaKali;
  listenersPerubahanKegiatan.forEach((fn) => {
    try { fn(salinan, statusMuat); } catch (_err) {}
  });
}

/** Menerapkan perubahan ke semua salinan lokal sebuah kegiatan. */
function terapkanPerubahanLokalKegiatan(id, perubahan) {
  [petaKegiatanJendela, petaKegiatanHalaman, petaKegiatanTambahan].forEach((peta) => {
    const item = peta.get(id);
    if (item) peta.set(id, { ...item, ...perubahan });
  });
}

export async function ubahStatusKegiatanCepat(id, statusBaru) {
  const targetId = String(id || "").trim();
  if (!targetId || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) {
    throw new Error("Status kegiatan tidak valid.");
  }
  const db = getFirestoreDb();
  const sebelumnya = getDaftarKegiatan().find((item) => item.id === targetId) || null;
  const sekarang = new Date().toISOString();

  // Perbarui tampilan seketika (optimistis), lalu simpan ke Firestore
  terapkanPerubahanLokalKegiatan(targetId, { status: statusBaru, updatedAt: sekarang });
  renderDaftarKegiatan();
  beritahuPerubahanKegiatan();

  try {
    await updateDoc(doc(db, KOLEKSI.KEGIATAN, targetId), {
      status: statusBaru,
      updatedAt: sekarang
    });
  } catch (err) {
    if (sebelumnya) {
      terapkanPerubahanLokalKegiatan(targetId, {
        status: sebelumnya.status,
        updatedAt: sebelumnya.updatedAt
      });
    }
    renderDaftarKegiatan();
    beritahuPerubahanKegiatan();
    throw err;
  }
}

function formatTanggalTampilan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

function validJamOpsional(jam) {
  if (!jam) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(jam);
}

/**
 * Fase 5: Menghitung kegiatan yang menggunakan kategori tertentu secara akurat
 * menggunakan getCountFromServer agar tidak bergantung pada data yang terpotong paginasi.
 */
export async function hitungKegiatanPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    const db = getFirestoreDb();
    if (!target) {
      // Tanpa kategori: kategoriId == ""
      const q = query(
        collection(db, KOLEKSI.KEGIATAN),
        where("kategoriId", "==", ""),
        where("dihapusAt", "==", null)
      );
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }
    const q = query(
      collection(db, KOLEKSI.KEGIATAN),
      where("kategoriId", "==", target),
      where("dihapusAt", "==", null)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (_e) {
    // Fallback luring ke memori yang sudah dimuat
    if (!target) {
      return getDaftarKegiatan().filter((item) => manajerKategoriKegiatan.cariInfoKategori(item.kategoriId).tetap).length;
    }
    return getDaftarKegiatan().filter((item) => String(item.kategoriId || "").trim() === target).length;
  }
}

function tampilkanGalatHalamanKegiatan(pesan) {
  const box = document.getElementById("kegiatan-page-error");
  const txt = document.getElementById("kegiatan-page-error-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function kelasBadgeStatus(status) {
  if (status === "Berjalan") return "status-badge status-berjalan";
  if (status === "Selesai") return "status-badge status-selesai";
  return "status-badge status-rencana";
}

function pastikanKerangkaHalamanKegiatan() {
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

function perbaruiDropdownKategori() {
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

function renderDaftarKegiatan() {
  const region = document.getElementById("kegiatan-list-region");
  const barFilterAktif = document.getElementById("kegiatan-active-filter-bar");
  const ringkasanEl = document.getElementById("kegiatan-result-summary");
  pengendaliFilterKegiatan?.perbaruiLencana();
  if (!region) return;

  if (!sudahDimuatPertamaKali) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar kegiatan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div><div class="skeleton-line skeleton-w-50"></div></div></div>`;
    return;
  }

  const adaFilter = kataKunciCari.trim() !== "" || filterKategoriId !== "ALL" || filterStatus !== "ALL";
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

  const tombolMuatLebih = adaLebihBanyakKegiatanHalaman
    ? `<div class="doc-load-more-bar">
        <button type="button" id="btn-muat-lebih-kegiatan" class="btn-secondary"${sedangMuatLebihBanyakKegiatan ? " disabled" : ""}>
          ${sedangMuatLebihBanyakKegiatan ? "Memuat..." : "Muat lebih banyak kegiatan"}
        </button>
      </div>`
    : "";

  region.innerHTML = `<div class="kegiatan-list-grid">${htmlKartu}</div>${tombolMuatLebih}`;
}

/**
 * Memuat batch kegiatan halaman berikutnya (paginasi).
 */
export async function muatLebihBanyakKegiatan() {
  if (sedangMuatLebihBanyakKegiatan || !lastDocKegiatanHalaman) return;
  sedangMuatLebihBanyakKegiatan = true;
  renderDaftarKegiatan();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, KOLEKSI.KEGIATAN),
      where("dihapusAt", "==", null),
      orderBy("tanggal", "desc"),
      startAfter(lastDocKegiatanHalaman),
      limit(UKURAN_HALAMAN_KEGIATAN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      petaKegiatanTambahan.set(docSnap.id, {
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
        updatedAt: d.updatedAt || "",
        dihapusAt: d.dihapusAt || null
      });
    });

    if (!snap.empty) {
      lastDocKegiatanHalaman = snap.docs[snap.docs.length - 1];
    }
    adaLebihBanyakKegiatanHalaman = snap.docs.length >= UKURAN_HALAMAN_KEGIATAN;
    beritahuPerubahanKegiatan();
  } catch (err) {
    tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
  } finally {
    sedangMuatLebihBanyakKegiatan = false;
    renderDaftarKegiatan();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh kegiatan aktif dari server.
 * Digunakan oleh Ekspor Cadangan dan Pencarian Global mendalam.
 */
export async function ambilSemuaKegiatanSekaliPakai() {
  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.KEGIATAN),
    where("dihapusAt", "==", null),
    orderBy("tanggal", "desc")
  );
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    petaKegiatanTambahan.set(docSnap.id, {
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
      updatedAt: d.updatedAt || "",
      dihapusAt: d.dihapusAt || null
    });
  });
  beritahuPerubahanKegiatan();
  return getDaftarKegiatan();
}

/**
 * Jembatan sekali pakai untuk mengambil kegiatan pada rentang tanggal tertentu.
 * Digunakan oleh modul Laporan.
 */
export async function ambilKegiatanRentangTanggal(tanggalDari, tanggalSampai) {
  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.KEGIATAN),
    where("dihapusAt", "==", null),
    where("tanggal", ">=", tanggalDari),
    where("tanggal", "<=", tanggalSampai),
    orderBy("tanggal", "asc")
  );
  const snap = await getDocs(q);
  const hasil = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const item = {
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
      updatedAt: d.updatedAt || "",
      dihapusAt: d.dihapusAt || null
    };
    petaKegiatanTambahan.set(docSnap.id, item);
    hasil.push(item);
  });
  return hasil;
}

function deteksiKegiatanPadaModalDetail() {
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
  for (const kandidatId of [idKegiatanDetailAktif, idKegiatanTerakhirDiklik]) {
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

function renderCatatanTerkaitDiDetailModal() {
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

  idKegiatanDetailAktif = kegiatan.id;
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

function picuBuatNotulensiUntukKegiatan(kegiatan) {
  if (!kegiatan) return;
  bukaModalBuatCatatanGdoc({
    templat: "notulensi",
    kegiatanId: kegiatan.id,
    tanggal: parseTanggal(kegiatan.tanggal) ? kegiatan.tanggal : hariIni(),
    judul: `Notulensi - ${kegiatan.judul}`
  });
}

function setPesanGalatFormKegiatan(pesan) {
  const box = document.getElementById("kegiatan-form-alert");
  const txt = document.getElementById("kegiatan-form-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function perbaruiPetunjukHariLiburForm(tanggalStr) {
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

export function bukaModalFormKegiatan(kegiatanEdit = null, tanggalAwal = null) {
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

  fokusSebelumModalKegiatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      statusSelect.value = DAFTAR_STATUS_KEGIATAN.includes(kegiatanEdit.status) ? kegiatanEdit.status : "Rencana";
    }
    if (catatanInput) catatanInput.value = kegiatanEdit.catatan || "";
  } else {
    const tanggalTerpilihValid =
      typeof tanggalAwal === "string" && parseTanggal(tanggalAwal) ? tanggalAwal.trim() : hariIni();

    if (titleEl) titleEl.textContent = "Tambah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Kegiatan";
    if (idInput) idInput.value = "";
    if (judulInput) judulInput.value = "";
    if (tanggalInput) tanggalInput.value = tanggalTerpilihValid;
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
    if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "Rencana";
    if (catatanInput) catatanInput.value = "";
  }

  if (tanggalInput) {
    perbaruiPetunjukHariLiburForm(tanggalInput.value);
  }

  formModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (judulInput instanceof HTMLElement) judulInput.focus();
  });
}

function tutupModalFormKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-form-modal");
  if (!modal || !formModalTerbuka) return;
  formModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatFormKegiatan("");

  const hintEl = document.getElementById("kegiatan-tanggal-hint-libur");
  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "";
    hintEl.className = "field-hint-libur";
  }

  if (kembalikanFokus && fokusSebelumModalKegiatan && document.contains(fokusSebelumModalKegiatan)) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

export function bukaDialogHapusKegiatan(item) {
  const modal = document.getElementById("kegiatan-delete-modal");
  const title = document.getElementById("kegiatan-delete-title");
  const desc = document.getElementById("kegiatan-delete-desc");
  const cancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  if (!modal || !item) return;

  fokusSebelumModalKegiatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idKegiatanAkanDihapus = item.id;
  if (title) {
    title.textContent = "Pindahkan ke Tempat Sampah?";
  }
  if (desc) {
    desc.textContent = `Kegiatan "${item.judul}" pada ${formatTanggalTampilan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  }

  hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-delete-modal");
  if (!modal || !hapusModalTerbuka) return;
  hapusModalTerbuka = false;
  idKegiatanAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalKegiatan && document.contains(fokusSebelumModalKegiatan)) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

function ambilDanValidasiDataForm() {
  const judul = String(document.getElementById("kegiatan-judul-input")?.value || "").trim();
  const tanggal = String(document.getElementById("kegiatan-tanggal-input")?.value || "").trim();
  const waktuMulai = String(document.getElementById("kegiatan-mulai-input")?.value || "").trim();
  const waktuSelesai = String(document.getElementById("kegiatan-selesai-input")?.value || "").trim();
  const lokasi = String(document.getElementById("kegiatan-lokasi-input")?.value || "").trim();
  const kategoriId = String(document.getElementById("kegiatan-kategori-select")?.value || "").trim();
  const statusMentah = String(document.getElementById("kegiatan-status-select")?.value || "Rencana").trim();
  const catatan = String(document.getElementById("kegiatan-catatan-input")?.value || "").trim();

  if (!judul) throw new Error("Judul kegiatan wajib diisi.");
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
  return { judul, catatan, tanggal, waktuMulai, waktuSelesai, lokasi, kategoriId, status };
}

export function terapkanFilterKategoriKegiatan(targetKategoriId) {
  kataKunciCari = "";
  filterStatus = "ALL";
  filterKategoriId = targetKategoriId || "ALL";
  pengendaliFilterKegiatan?.tutup(false);

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

export function terapkanFilterStatusKegiatan(targetStatus) {
  kataKunciCari = "";
  filterKategoriId = "ALL";
  filterStatus = DAFTAR_STATUS_KEGIATAN.includes(targetStatus) ? targetStatus : "ALL";
  pengendaliFilterKegiatan?.tutup(false);

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = "ALL";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = filterStatus;

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

export function initHalamanKegiatan() {
  pastikanKerangkaHalamanKegiatan();
  pengendaliFilterKegiatan = initFilterPanel(document.getElementById("kegiatan-toolbar"));
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  dialogKelolaKategoriCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriKegiatan,
    hitungPemakaiLokal: hitungKegiatanPemakaiServer,
    onLihatItemKategori: (katId) => terapkanFilterKategoriKegiatan(katId),
    judulDialog: "Kelola Kategori Kegiatan"
  });

  manajerKategoriKegiatan.onChange(() => {
    perbaruiDropdownKategori();
    renderDaftarKegiatan();
    beritahuPerubahanKegiatan();
  });

  onPerubahanCatatan(() => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest("#kegiatan-detail-modal")) return;
      const pembawaId = target.closest("[data-id], [data-kegiatan-id]");
      if (!pembawaId) return;
      const kandidat = String(
        pembawaId.getAttribute("data-kegiatan-id") || pembawaId.getAttribute("data-id") || ""
      ).trim();
      if (kandidat && getDaftarKegiatan().some((k) => k.id === kandidat)) {
        idKegiatanTerakhirDiklik = kandidat;
      }
    },
    true
  );

  const detailModal = document.getElementById("kegiatan-detail-modal");
  const detailBody = document.getElementById("kegiatan-detail-body");
  const detailCatatanSection = document.getElementById("kegiatan-detail-catatan-section");

  if (detailModal && typeof MutationObserver !== "undefined") {
    const pengamatDetail = new MutationObserver(() => {
      if (detailModal.hidden) {
        idKegiatanDetailAktif = "";
      }
      renderCatatanTerkaitDiDetailModal();
    });
    pengamatDetail.observe(detailModal, { attributes: true, attributeFilter: ["hidden"] });
    if (detailBody) {
      pengamatDetail.observe(detailBody, { childList: true });
    }
  }

  if (detailCatatanSection) {
    detailCatatanSection.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-detail-catatan-action]") : null;
      if (!btn) return;
      const aksi = btn.getAttribute("data-detail-catatan-action");

      if (aksi === "tambah-catatan") {
        const kegId = btn.getAttribute("data-kegiatan-id") || idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        bukaModalCatatanSingkat(null, {
          kegiatanId: keg ? keg.id : "",
          tanggal: keg && parseTanggal(keg.tanggal) ? keg.tanggal : hariIni()
        });
      } else if (aksi === "buat-notulensi") {
        const kegId = btn.getAttribute("data-kegiatan-id") || idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        if (keg) picuBuatNotulensiUntukKegiatan(keg);
      } else if (aksi === "edit-singkat") {
        const catId = btn.getAttribute("data-catatan-id") || "";
        const kegId = idKegiatanDetailAktif;
        const ditemukan = getCatatanTerkaitKegiatan(kegId).find((c) => c.id === catId);
        if (ditemukan) bukaModalCatatanSingkat(ditemukan);
      }
    });
  }

  window.addEventListener("online", () => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });
  window.addEventListener("offline", () => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });

  const btnKelolaKat = document.getElementById("btn-buka-kelola-kategori");
  if (btnKelolaKat) btnKelolaKat.addEventListener("click", () => dialogKelolaKategoriCtrl?.buka());

  const btnTambah = document.getElementById("btn-tambah-kegiatan");
  if (btnTambah) btnTambah.addEventListener("click", () => bukaModalFormKegiatan(null));

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

  const listRegion = document.getElementById("kegiatan-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action], #btn-muat-lebih-kegiatan") : null;
      if (!btn) return;

      if (btn.id === "btn-muat-lebih-kegiatan") {
        muatLebihBanyakKegiatan();
        return;
      }

      const aksi = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const item = getDaftarKegiatan().find((k) => k.id === id);
      if (!item) return;

      if (aksi === "detail-kegiatan") {
        idKegiatanDetailAktif = item.id;
        idKegiatanTerakhirDiklik = item.id;
        if (typeof pembukaDetailKegiatanFn === "function") {
          pembukaDetailKegiatanFn(item.id);
        }
      } else if (aksi === "buat-notulensi") {
        picuBuatNotulensiUntukKegiatan(item);
      } else if (aksi === "edit-kegiatan") {
        bukaModalFormKegiatan(item);
      } else if (aksi === "delete-kegiatan") {
        bukaDialogHapusKegiatan(item);
      }
    });

    listRegion.addEventListener("change", async (e) => {
      const select = e.target instanceof HTMLSelectElement && e.target.getAttribute("data-action") === "quick-status" ? e.target : null;
      if (!select) return;

      const id = select.getAttribute("data-id");
      const statusBaru = select.value;
      if (!id || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) return;

      tampilkanGalatHalamanKegiatan("");
      select.disabled = true;
      try {
        await ubahStatusKegiatanCepat(id, statusBaru);
      } catch (err) {
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
        renderDaftarKegiatan();
      } finally {
        select.disabled = false;
      }
    });
  }

  const formModal = document.getElementById("kegiatan-form-modal");
  const formEl = document.getElementById("kegiatan-form");
  const formCloseBtn = document.getElementById("kegiatan-form-close-btn");
  const formCancelBtn = document.getElementById("kegiatan-form-cancel-btn");
  const formSubmitBtn = document.getElementById("kegiatan-form-submit-btn");

  if (formCloseBtn) formCloseBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  if (formCancelBtn) formCancelBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  if (formModal) {
    formModal.addEventListener("click", (e) => {
      if (e.target === formModal) tutupModalFormKegiatan(true);
    });
  }

  const tanggalInputEl = document.getElementById("kegiatan-tanggal-input");
  if (tanggalInputEl) {
    tanggalInputEl.addEventListener("input", () => {
      perbaruiPetunjukHariLiburForm(tanggalInputEl.value);
    });
    tanggalInputEl.addEventListener("change", () => {
      perbaruiPetunjukHariLiburForm(tanggalInputEl.value);
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
        setPesanGalatFormKegiatan(validErr instanceof Error ? validErr.message : "Data kegiatan belum lengkap.");
        return;
      }

      const idEdit = String(document.getElementById("kegiatan-edit-id")?.value || "").trim();
      const sekarang = new Date().toISOString();

      if (formSubmitBtn) formSubmitBtn.disabled = true;
      try {
        const db = getFirestoreDb();
        if (idEdit) {
          await updateDoc(doc(db, KOLEKSI.KEGIATAN, idEdit), { ...payload, updatedAt: sekarang });
          terapkanPerubahanLokalKegiatan(idEdit, { ...payload, updatedAt: sekarang });
          renderDaftarKegiatan();
          beritahuPerubahanKegiatan();
        } else {
          // Fase 5: Selalu setel dihapusAt: null pada dokumen baru
          await addDoc(collection(db, KOLEKSI.KEGIATAN), {
            ...payload,
            dihapusAt: null,
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

  const deleteModal = document.getElementById("kegiatan-delete-modal");
  const deleteCancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  const deleteConfirmBtn = document.getElementById("kegiatan-delete-confirm-btn");

  if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", () => tutupDialogHapusKegiatan(true));
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
        await hapusLunakKegiatan(targetId);
        tutupDialogHapusKegiatan(false);
        const detailModal = document.getElementById("kegiatan-detail-modal");
        if (detailModal && !detailModal.hidden) {
          detailModal.hidden = true;
        }
        tampilkanToast("Kegiatan dipindahkan ke Tempat Sampah", "info", {
          aksiLabel: "Urungkan",
          aksiOnClick: async () => {
            try {
              await pulihkanKegiatan(targetId);
              tampilkanToast("Kegiatan berhasil dipulihkan", "success");
            } catch (errUrung) {
              tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
            }
          },
          durasiMs: 8000
        });
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

function hitungRentangJendela(tahun, bulanIndex) {
  // Rentang jendela: 1 bulan sebelum s/d 1 bulan sesudah bulan aktif (+/- 1 bulan)
  const dMulai = new Date(tahun, bulanIndex - 1, 1);
  const dAkhir = new Date(tahun, bulanIndex + 2, 0); // hari terakhir bulan berikutnya
  return {
    tglAwal: tanggalLokal(dMulai),
    tglAkhir: tanggalLokal(dAkhir)
  };
}

/**
 * Menyinkronkan listener jendela tanggal aktif saat berpindah bulan pada Kalender Jadwal.
 */
export function sinkronkanJendelaTanggalKegiatan(tahun, bulanIndex) {
  const { tglAwal, tglAkhir } = hitungRentangJendela(tahun, bulanIndex);
  if (tglAwal === jendelaAwalAktif && tglAkhir === jendelaAkhirAktif && unsubscribeSnapshotJendela) {
    return;
  }
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);
}

function mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir) {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }

  jendelaAwalAktif = tglAwal;
  jendelaAkhirAktif = tglAkhir;

  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.KEGIATAN),
    where("dihapusAt", "==", null),
    where("tanggal", ">=", tglAwal),
    where("tanggal", "<=", tglAkhir),
    orderBy("tanggal", "asc")
  );

  unsubscribeSnapshotJendela = onSnapshot(
    q,
    (snapshot) => {
      petaKegiatanJendela.clear();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        petaKegiatanJendela.set(docSnap.id, {
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
          updatedAt: d.updatedAt || "",
          dihapusAt: d.dihapusAt || null
        });
      });
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanKegiatan("");
      renderDaftarKegiatan();
      renderCatatanTerkaitDiDetailModal();
      dialogKelolaKategoriCtrl?.segarkanTampilan();
      beritahuPerubahanKegiatan();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
      renderDaftarKegiatan();
      beritahuPerubahanKegiatan();
    }
  );
}

function mulaiLanggananHalamanKegiatan() {
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.KEGIATAN),
    where("dihapusAt", "==", null),
    orderBy("tanggal", "desc"),
    limit(UKURAN_HALAMAN_KEGIATAN)
  );

  unsubscribeSnapshotHalaman = onSnapshot(
    q,
    (snapshot) => {
      petaKegiatanHalaman.clear();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        petaKegiatanHalaman.set(docSnap.id, {
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
          updatedAt: d.updatedAt || "",
          dihapusAt: d.dihapusAt || null
        });
      });

      if (!snapshot.empty) {
        lastDocKegiatanHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      adaLebihBanyakKegiatanHalaman = snapshot.docs.length >= UKURAN_HALAMAN_KEGIATAN;
      sudahDimuatPertamaKali = true;
      renderDaftarKegiatan();
      beritahuPerubahanKegiatan();
    },
    (err) => {
      tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
    }
  );
}

export function subscribeKegiatan() {
  unsubscribeKegiatan();
  initHalamanKegiatan();
  sudahDimuatPertamaKali = false;
  renderDaftarKegiatan();
  beritahuPerubahanKegiatan();

  manajerKategoriKegiatan.subscribe(
    () => {
      perbaruiDropdownKategori();
      renderDaftarKegiatan();
      beritahuPerubahanKegiatan();
    },
    (pesanGalat) => tampilkanGalatHalamanKegiatan(pesanGalat)
  );

  // Inisialisasi jendela tanggal hari ini (+/- 1 bulan)
  const skr = parseTanggal(hariIni()) || new Date();
  const { tglAwal, tglAkhir } = hitungRentangJendela(skr.getFullYear(), skr.getMonth());
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);

  // Inisialisasi listener daftar halaman kegiatan
  mulaiLanggananHalamanKegiatan();

  return () => unsubscribeKegiatan();
}

export function unsubscribeKegiatan() {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  manajerKategoriKegiatan.unsubscribe();
  petaKegiatanJendela.clear();
  petaKegiatanHalaman.clear();
  petaKegiatanTambahan.clear();
  lastDocKegiatanHalaman = null;
  adaLebihBanyakKegiatanHalaman = false;
  sedangMuatLebihBanyakKegiatan = false;
  jendelaAwalAktif = "";
  jendelaAkhirAktif = "";

  sudahDimuatPertamaKali = false;
  idKegiatanDetailAktif = "";
  idKegiatanTerakhirDiklik = "";

  pengendaliFilterKegiatan?.tutup(false);
  tutupModalFormKegiatan(false);
  tutupDialogHapusKegiatan(false);
  dialogKelolaKategoriCtrl?.tutup(false);
  beritahuPerubahanKegiatan();
}
