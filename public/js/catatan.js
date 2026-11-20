/**
 * Modul Halaman Catatan Singkat & Catatan Google Docs (Fase 4 + Optimalisasi Pembacaan Fase 5)
 * Koleksi Firestore: "catatan" (jenis "singkat" atau "gdoc", judul, isi [untuk singkat],
 * kategori [teks bebas pendek], tag [array], kegiatanId [opsional], disematkan [boolean],
 * tanggal [YYYY-MM-DD], createdAt, updatedAt; serta templat, docId, tautan untuk "gdoc"
 * tanpa menyimpan isi dokumen Google Docs).
 *
 * Optimalisasi Fase 5:
 * 1. Listener dibatasi 100 catatan terbaru (where dihapusAt == null, orderBy updatedAt desc, limit 100)
 * 2. Paginasi dengan tombol "Muat lebih banyak catatan" (startAfter)
 * 3. Soft delete: query where("dihapusAt", "==", null) agar item sampah tidak membebani listener utama
 * 4. Jembatan ambilSemuaCatatanSekaliPakai() untuk Laporan, Pencarian Global, dan Ekspor Cadangan
 * 5. Indikator dan tombol "Cari di seluruh catatan server" saat mencari kata kunci
 */
import { JENIS_CATATAN_SINGKAT, JENIS_CATATAN_GDOC, UKURAN_HALAMAN_CATATAN, KOLEKSI } from "./config/constants.js";
export { JENIS_CATATAN_SINGKAT, JENIS_CATATAN_GDOC, UKURAN_HALAMAN_CATATAN };
import {
  getFirestoreDb,
  collection,
  doc,
  getDoc,
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
  formatPesanGalatFirestore
} from "./services/firestoreService.js";
import { loginWithGoogle, isDriveTokenExpired, formatPesanGalatAuth } from "./auth.js";
import { hariIni, parseTanggal } from "./util-tanggal.js";
import { tampilkanToast } from "./shared/toast.js";
import { getDaftarKegiatan, onPerubahanKegiatan } from "./kegiatan.js";
import {
  buatDokumenGoogleDocsDrive,
  pindahkanItemKeSampahDrive,
  pulihkanItemDariSampahDrive,
  formatPesanGalatDrive
} from "./drive.js";
import {
  DAFTAR_TEMPLAT_DOKUMEN,
  ambilInfoTemplatDokumen,
  bangunHtmlTemplatDokumen
} from "./templat-dokumen.js";
import { initFilterPanel } from "./filter-panel.js";
import { escapeHtml, svgIkon, NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "./util-html.js";

// svgIkon, NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK kini diimpor dari util-html.js (Tahap 4a deduplikasi)

const IKON_SINGKAT = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20);
const IKON_GDOC = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="19" x2="12" y2="19"/>', 20);
const IKON_SEMAT = svgIkon('<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>', 16);
const IKON_KALENDER = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 15);
const IKON_TAUTAN = svgIkon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 15);
const IKON_TAB_BARU = svgIkon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 15);
const IKON_FILTER = svgIkon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', 16);

let unsubscribeSnapshotCatatan = null;
const petaCatatanHalaman = new Map();
const petaCatatanTambahan = new Map();

let lastDocCatatanHalaman = null;
let kursorCatatanTambahan = null;
let adaLebihBanyakCatatan = false;
let sedangMuatLebihCatatan = false;
let sedangMencariSemuaCatatan = false;
let seluruhCatatanSudahDimuat = false;

let sudahDimuatPertamaKali = false;
let antarmukaSudahDiikat = false;
const listenersPerubahanCatatan = new Set();

let kataKunciCari = "";
let filterJenis = "ALL";
let urutanTanggal = "desc";
let pengendaliFilterCatatan = null;

let singkatModalTerbuka = false;
let gdocModalTerbuka = false;
let hapusSingkatModalTerbuka = false;
let hapusGdocModalTerbuka = false;
let sedangMembuatGdoc = false;

let idCatatanSingkatHapus = null;
let itemCatatanGdocHapus = null;
let fokusSebelumModalCatatan = null;
let judulOtomatisGdocTerakhir = "";
let pembukaDetailKegiatanEksternal = null;
let timerSorotCatatan = null;

export function daftarkanPembukaDetailKegiatanCatatan(fn) {
  pembukaDetailKegiatanEksternal = typeof fn === "function" ? fn : null;
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

export function getDaftarCatatan() {
  // Salinan dengan updatedAt terbaru menang; bila sama, data listener realtime (Halaman) menang.
  const gabungan = new Map();
  petaCatatanHalaman.forEach((v, k) => gabungan.set(k, v));
  petaCatatanTambahan.forEach((v, k) => {
    const lama = gabungan.get(k);
    if (!lama || String(v.updatedAt || "") > String(lama.updatedAt || "")) gabungan.set(k, v);
  });

  return Array.from(gabungan.values())
    .filter((c) => !c.dihapusAt)
    .map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

export function getDaftarCatatanDiSampah() {
  const gabungan = new Map();
  petaCatatanHalaman.forEach((v, k) => gabungan.set(k, v));
  petaCatatanTambahan.forEach((v, k) => gabungan.set(k, v));

  return Array.from(gabungan.values())
    .filter((c) => Boolean(c.dihapusAt))
    .map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

export async function hapusLunakCatatan(id, driveDiSampah = false) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, KOLEKSI.CATATAN, targetId), {
    dihapusAt: new Date().toISOString(),
    driveDiSampah: Boolean(driveDiSampah),
    updatedAt: new Date().toISOString()
  });
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
}

export async function pulihkanCatatan(id, itemOpsional = null) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const db = getFirestoreDb();

  // Catatan di Tempat Sampah tidak ada di peta memori (listener menyaring dihapusAt),
  // sehingga datanya dibaca dari Firestore bila pemanggil tidak menyertakannya.
  let item = itemOpsional && typeof itemOpsional === "object" ? itemOpsional : null;
  let pesanDrive = "";
  if (!item) {
    try {
      const snap = await getDoc(doc(db, KOLEKSI.CATATAN, targetId));
      item = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (_e) {
      pesanDrive =
        "Status dokumen Google Docs di Sampah Drive tidak dapat diperiksa (koneksi bermasalah). Jika perlu, pulihkan manual dari Sampah Google Drive.";
    }
  }

  if (item && item.jenis === JENIS_CATATAN_GDOC && item.driveDiSampah && item.docId) {
    try {
      await pulihkanItemDariSampahDrive(item.docId);
    } catch (err) {
      pesanDrive =
        err && err.isNotFound
          ? "Dokumen Google Docs tidak ditemukan di Google Drive (mungkin sudah dihapus permanen)."
          : `Dokumen Google Docs masih berada di Sampah Drive: ${formatPesanGalatDrive(err)}`;
    }
  }

  await updateDoc(doc(db, KOLEKSI.CATATAN, targetId), {
    dihapusAt: null,
    driveDiSampah: false,
    updatedAt: new Date().toISOString()
  });
  return { pesanDrive };
}

export async function hapusPermanenCatatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, KOLEKSI.CATATAN, targetId));
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
}

export function isCatatanSudahDimuat() {
  return sudahDimuatPertamaKali;
}

export function onPerubahanCatatan(listener) {
  if (typeof listener !== "function") return () => {};
  listenersPerubahanCatatan.add(listener);
  return () => listenersPerubahanCatatan.delete(listener);
}

function beritahuPerubahanCatatan() {
  const salinan = getDaftarCatatan();
  listenersPerubahanCatatan.forEach((fn) => {
    try { fn(salinan, sudahDimuatPertamaKali); } catch (_err) {}
  });
}

export function urutkanDaftarCatatan(daftar, arah = "desc") {
  return [...daftar].sort((a, b) => {
    const pinDiff = (b.disematkan ? 1 : 0) - (a.disematkan ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    const tglA = String(a.tanggal || "");
    const tglB = String(b.tanggal || "");
    if (tglA !== tglB) return arah === "asc" ? tglA.localeCompare(tglB) : tglB.localeCompare(tglA);
    const updA = String(a.updatedAt || a.createdAt || "");
    const updB = String(b.updatedAt || b.createdAt || "");
    if (updA !== updB) return arah === "asc" ? updA.localeCompare(updB) : updB.localeCompare(updA);
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
  });
}

export function getCatatanTerkaitKegiatan(kegiatanId) {
  const target = String(kegiatanId || "").trim();
  if (!target) return [];
  return urutkanDaftarCatatan(
    getDaftarCatatan().filter((c) => String(c.kegiatanId || "").trim() === target),
    "desc"
  ).map((c) => ({ ...c, tag: Array.isArray(c.tag) ? [...c.tag] : [] }));
}

export function formatTanggalCatatan(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

export function tautanAmanGoogleDocs(item) {
  const mentah = String(item?.tautan || "").trim();
  if (mentah && /^https?:\/\//i.test(mentah)) return mentah;
  const docId = String(item?.docId || "").trim();
  return docId ? `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit` : "#";
}

function bukaTabBaruAman(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function uraiInputTag(teks) {
  const hasil = [];
  const unik = new Set();
  for (const bagian of String(teks || "").split(",")) {
    const bersih = bagian.trim().replace(/^#+/, "").trim().slice(0, 32);
    if (!bersih) continue;
    const kunci = bersih.toLowerCase();
    if (!unik.has(kunci)) {
      unik.add(kunci);
      hasil.push(bersih);
    }
    if (hasil.length >= 12) break;
  }
  return hasil;
}

function cariKegiatanId(id) {
  const target = String(id || "").trim();
  return target ? getDaftarKegiatan().find((k) => k.id === target) || null : null;
}

function adalahGalatToken(err) {
  if (!err || typeof err !== "object") return isDriveTokenExpired();
  return Boolean(err.isTokenExpired || err.isUnauthorized || err.status === 401);
}

function tampilkanNotifikasiCatatan({ pesan = "", tipe = "danger", butuhRelogin = false, tautanDocs = "" } = {}) {
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

function pastikanKerangkaHalamanCatatan() {
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

function aturUlangSemuaFilterCatatan() {
  kataKunciCari = "";
  filterJenis = "ALL";
  const searchInput = document.getElementById("catatan-search-input");
  const jenisSelect = document.getElementById("catatan-filter-jenis");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (jenisSelect instanceof HTMLSelectElement) jenisSelect.value = "ALL";
  renderDaftarCatatan();
}

function perbaruiOpsiKegiatanDiModal() {
  const kegiatanUrut = [...getDaftarKegiatan()].sort((a, b) =>
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

function ambilCatatanTersaring() {
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

function renderDaftarCatatan() {
  const region = document.getElementById("catatan-list-region");
  const bar = document.getElementById("catatan-active-filter-bar");
  const sum = document.getElementById("catatan-result-summary");
  pengendaliFilterCatatan?.perbaruiLencana();
  if (!region) return;

  if (!sudahDimuatPertamaKali) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat daftar catatan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-80"></div><div class="skeleton-line skeleton-w-60"></div></div></div>`;
    return;
  }

  const adaFilter = kataKunciCari.trim() !== "" || filterJenis !== "ALL";
  const hasil = ambilCatatanTersaring();
  const totalAktif = getDaftarCatatan().length;

  if (bar && sum) {
    if (adaFilter || totalAktif > 0) {
      bar.hidden = false;
      let teksRingkasan = adaFilter
        ? `Menampilkan ${hasil.length} dari ${totalAktif} catatan dimuat`
        : `Total ${totalAktif} catatan tercatat`;

      if (adaFilter && !seluruhCatatanSudahDimuat) {
        teksRingkasan += ` • <button type="button" id="btn-cari-semua-catatan" class="btn-link-action" style="background:none;border:none;padding:0;color:var(--color-primary-text, #2563eb);text-decoration:underline;cursor:pointer;font:inherit;">${sedangMencariSemuaCatatan ? "Mencari di semua data..." : "Cari di seluruh catatan server"}</button>`;
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
      ${!seluruhCatatanSudahDimuat ? `<div style="margin-top:12px;"><button type="button" id="btn-cari-semua-catatan-empty" class="btn-secondary btn-sm-touch">${sedangMencariSemuaCatatan ? "Mencari di semua data..." : "Cari di seluruh catatan server"}</button></div>` : ""}
    </div>`;
    return;
  }

  const kartuHtml = hasil.map((item) => {
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
  }).join("");

  const tombolMuatLebih = adaLebihBanyakCatatan
    ? `<div class="doc-load-more-bar">
        <button type="button" id="btn-muat-lebih-catatan" class="btn-secondary"${sedangMuatLebihCatatan ? " disabled" : ""}>
          ${sedangMuatLebihCatatan ? "Memuat..." : "Muat lebih banyak catatan"}
        </button>
      </div>`
    : "";

  region.innerHTML = `<div class="kegiatan-list-grid">${kartuHtml}</div>${tombolMuatLebih}`;
}

/**
 * Fase 5: Memuat batch catatan berikutnya (paginasi).
 */
export async function muatLebihBanyakCatatan() {
  const kursorAwal = kursorCatatanTambahan || lastDocCatatanHalaman;
  if (sedangMuatLebihCatatan || !kursorAwal) return;
  sedangMuatLebihCatatan = true;
  renderDaftarCatatan();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, KOLEKSI.CATATAN),
      where("dihapusAt", "==", null),
      orderBy("updatedAt", "desc"),
      startAfter(kursorAwal),
      limit(UKURAN_HALAMAN_CATATAN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const jenis = d.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
      const entri = {
        id: docSnap.id,
        jenis,
        judul: String(d.judul || ""),
        isi: jenis === JENIS_CATATAN_SINGKAT ? String(d.isi || "") : "",
        kategori: String(d.kategori || ""),
        tag: Array.isArray(d.tag) ? d.tag.map((t) => String(t || "").trim()).filter(Boolean) : [],
        kegiatanId: String(d.kegiatanId || ""),
        disematkan: Boolean(d.disematkan),
        tanggal: String(d.tanggal || ""),
        createdAt: String(d.createdAt || ""),
        updatedAt: String(d.updatedAt || ""),
        dihapusAt: d.dihapusAt || null,
        driveDiSampah: Boolean(d.driveDiSampah)
      };
      if (jenis === JENIS_CATATAN_GDOC) {
        entri.templat = String(d.templat || "kosong");
        entri.docId = String(d.docId || "");
        entri.tautan = String(d.tautan || "");
      }
      petaCatatanTambahan.set(docSnap.id, entri);
    });

    if (!snap.empty) {
      kursorCatatanTambahan = snap.docs[snap.docs.length - 1];
    }
    adaLebihBanyakCatatan = snap.docs.length >= UKURAN_HALAMAN_CATATAN;
    beritahuPerubahanCatatan();
  } catch (err) {
    tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
  } finally {
    sedangMuatLebihCatatan = false;
    renderDaftarCatatan();
  }
}

/**
 * Fase 5: Jembatan sekali pakai untuk mengambil seluruh catatan dari server.
 * Digunakan oleh Ekspor Cadangan, Laporan, dan Pencarian Global mendalam.
 */
export async function ambilSemuaCatatanSekaliPakai() {
  sedangMencariSemuaCatatan = true;
  renderDaftarCatatan();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, KOLEKSI.CATATAN),
      where("dihapusAt", "==", null),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const jenis = d.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
      const entri = {
        id: docSnap.id,
        jenis,
        judul: String(d.judul || ""),
        isi: jenis === JENIS_CATATAN_SINGKAT ? String(d.isi || "") : "",
        kategori: String(d.kategori || ""),
        tag: Array.isArray(d.tag) ? d.tag.map((t) => String(t || "").trim()).filter(Boolean) : [],
        kegiatanId: String(d.kegiatanId || ""),
        disematkan: Boolean(d.disematkan),
        tanggal: String(d.tanggal || ""),
        createdAt: String(d.createdAt || ""),
        updatedAt: String(d.updatedAt || ""),
        dihapusAt: d.dihapusAt || null,
        driveDiSampah: Boolean(d.driveDiSampah)
      };
      if (jenis === JENIS_CATATAN_GDOC) {
        entri.templat = String(d.templat || "kosong");
        entri.docId = String(d.docId || "");
        entri.tautan = String(d.tautan || "");
      }
      petaCatatanTambahan.set(docSnap.id, entri);
    });
    seluruhCatatanSudahDimuat = true;
    beritahuPerubahanCatatan();
    return getDaftarCatatan();
  } finally {
    sedangMencariSemuaCatatan = false;
    renderDaftarCatatan();
  }
}

function setGalatModalSingkat(pesan) {
  const box = document.getElementById("catatan-singkat-alert");
  const txt = document.getElementById("catatan-singkat-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function bukaModalCatatanSingkat(catatanEdit = null, opsiAwal = {}) {
  const modal = document.getElementById("catatan-singkat-modal");
  const titleEl = document.getElementById("catatan-singkat-title");
  const idInput = document.getElementById("catatan-singkat-edit-id");
  const jenisInput = document.getElementById("catatan-singkat-edit-jenis");
  const judulInput = document.getElementById("catatan-singkat-judul");
  const tanggalInput = document.getElementById("catatan-singkat-tanggal");
  const kategoriInput = document.getElementById("catatan-singkat-kategori");
  const isiField = document.getElementById("catatan-singkat-isi-field");
  const isiInput = document.getElementById("catatan-singkat-isi");
  const tagInput = document.getElementById("catatan-singkat-tag");
  const kegSelect = document.getElementById("catatan-singkat-kegiatan");
  const pinInput = document.getElementById("catatan-singkat-pin");
  const submitBtn = document.getElementById("catatan-singkat-submit-btn");
  if (!modal) return;

  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setGalatModalSingkat("");
  perbaruiOpsiKegiatanDiModal();

  if (catatanEdit) {
    const gdoc = catatanEdit.jenis === JENIS_CATATAN_GDOC;
    if (titleEl) titleEl.textContent = gdoc ? "Ubah Info Catatan Google Docs" : "Ubah Catatan Singkat";
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (idInput) idInput.value = catatanEdit.id;
    if (jenisInput) jenisInput.value = gdoc ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
    if (judulInput) judulInput.value = catatanEdit.judul || "";
    if (tanggalInput) tanggalInput.value = parseTanggal(catatanEdit.tanggal) ? catatanEdit.tanggal : hariIni();
    if (kategoriInput) kategoriInput.value = catatanEdit.kategori || "";
    if (isiField) isiField.hidden = gdoc;
    if (isiInput) isiInput.value = gdoc ? "" : catatanEdit.isi || "";
    if (tagInput) tagInput.value = Array.isArray(catatanEdit.tag) ? catatanEdit.tag.join(", ") : "";
    if (kegSelect instanceof HTMLSelectElement) {
      const idKeg = String(catatanEdit.kegiatanId || "").trim();
      kegSelect.value = cariKegiatanId(idKeg) ? idKeg : "";
    }
    if (pinInput instanceof HTMLInputElement) pinInput.checked = Boolean(catatanEdit.disematkan);
  } else {
    const tglAwal = typeof opsiAwal?.tanggal === "string" && parseTanggal(opsiAwal.tanggal) ? opsiAwal.tanggal.trim() : hariIni();
    const kegAwal = String(opsiAwal?.kegiatanId || "").trim();
    if (titleEl) titleEl.textContent = "Tambah Catatan Singkat";
    if (submitBtn) submitBtn.textContent = "Simpan Catatan";
    if (idInput) idInput.value = "";
    if (jenisInput) jenisInput.value = JENIS_CATATAN_SINGKAT;
    if (judulInput) judulInput.value = String(opsiAwal?.judul || "").trim();
    if (tanggalInput) tanggalInput.value = tglAwal;
    if (kategoriInput) kategoriInput.value = "";
    if (isiField) isiField.hidden = false;
    if (isiInput) isiInput.value = "";
    if (tagInput) tagInput.value = "";
    if (kegSelect instanceof HTMLSelectElement) kegSelect.value = cariKegiatanId(kegAwal) ? kegAwal : "";
    if (pinInput instanceof HTMLInputElement) pinInput.checked = false;
  }

  singkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

function tutupModalCatatanSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-modal");
  if (!modal || !singkatModalTerbuka) return;
  singkatModalTerbuka = false;
  modal.hidden = true;
  setGalatModalSingkat("");
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

function setGalatModalGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-alert");
  const txt = document.getElementById("catatan-gdoc-alert-text");
  const btn = document.getElementById("catatan-gdoc-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

function sinkronkanJudulSaranGdoc() {
  const judulInput = document.getElementById("catatan-gdoc-judul");
  const tplSelect = document.getElementById("catatan-gdoc-templat");
  const kegSelect = document.getElementById("catatan-gdoc-kegiatan");
  const descEl = document.getElementById("catatan-gdoc-templat-desc");
  if (!(judulInput instanceof HTMLInputElement) || !(tplSelect instanceof HTMLSelectElement) || !(kegSelect instanceof HTMLSelectElement)) return;

  const infoTpl = ambilInfoTemplatDokumen(tplSelect.value);
  if (descEl) descEl.textContent = infoTpl.deskripsi;

  const sekarang = judulInput.value.trim();
  if (sekarang && sekarang !== judulOtomatisGdocTerakhir) return;

  const keg = cariKegiatanId(kegSelect.value);
  let saran = "";
  if (keg) {
    saran = infoTpl.id === "notulensi" ? `Notulensi - ${keg.judul}` : `${infoTpl.nama} - ${keg.judul}`;
  }
  if (saran) {
    judulInput.value = saran.slice(0, 160);
    judulOtomatisGdocTerakhir = judulInput.value;
  }
}

export function bukaModalBuatCatatanGdoc(opsiAwal = {}) {
  if (!navigator.onLine) {
    tampilkanNotifikasiCatatan({
      pesan: "Tidak ada koneksi internet. Pembuatan dokumen Google Docs memerlukan sambungan aktif.",
      tipe: "warning"
    });
    return;
  }
  const modal = document.getElementById("catatan-gdoc-modal");
  const tplSelect = document.getElementById("catatan-gdoc-templat");
  const judulInput = document.getElementById("catatan-gdoc-judul");
  const tglInput = document.getElementById("catatan-gdoc-tanggal");
  const kegSelect = document.getElementById("catatan-gdoc-kegiatan");
  const katInput = document.getElementById("catatan-gdoc-kategori");
  const tagInput = document.getElementById("catatan-gdoc-tag");
  const pinInput = document.getElementById("catatan-gdoc-pin");
  const progWrap = document.getElementById("catatan-gdoc-progress-wrap");
  if (!modal) return;

  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  perbaruiOpsiKegiatanDiModal();

  const infoTpl = ambilInfoTemplatDokumen(opsiAwal?.templat || "notulensi");
  const kegObj = cariKegiatanId(opsiAwal?.kegiatanId || "");
  const tglAwal = typeof opsiAwal?.tanggal === "string" && parseTanggal(opsiAwal.tanggal)
    ? opsiAwal.tanggal.trim()
    : kegObj && parseTanggal(kegObj.tanggal)
      ? kegObj.tanggal
      : hariIni();

  if (tplSelect instanceof HTMLSelectElement) {
    tplSelect.innerHTML = DAFTAR_TEMPLAT_DOKUMEN.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nama)}</option>`).join("");
    tplSelect.value = infoTpl.id;
  }
  if (kegSelect instanceof HTMLSelectElement) kegSelect.value = kegObj ? kegObj.id : "";
  if (tglInput instanceof HTMLInputElement) tglInput.value = tglAwal;
  if (katInput instanceof HTMLInputElement) katInput.value = infoTpl.id === "notulensi" && kegObj ? "Notulensi" : "";
  if (tagInput instanceof HTMLInputElement) tagInput.value = "";
  if (pinInput instanceof HTMLInputElement) pinInput.checked = false;
  if (progWrap) progWrap.hidden = true;

  judulOtomatisGdocTerakhir = "";
  if (judulInput instanceof HTMLInputElement) {
    const diberikan = String(opsiAwal?.judul || "").trim();
    judulInput.value = diberikan ? diberikan.slice(0, 160) : "";
    if (diberikan) judulOtomatisGdocTerakhir = judulInput.value;
  }
  sinkronkanJudulSaranGdoc();

  if (isDriveTokenExpired()) {
    setGalatModalGdoc("Sesi akses Google Drive telah kedaluwarsa. Tekan tombol \"Masuk ulang\" sebelum membuat dokumen.", true);
  } else {
    setGalatModalGdoc("", false);
  }

  gdocModalTerbuka = true;
  modal.hidden = false;
  perbaruiStatusJaringanCatatan();
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

function tutupModalBuatCatatanGdoc(kembalikanFokus = true) {
  if (sedangMembuatGdoc) return;
  const modal = document.getElementById("catatan-gdoc-modal");
  if (!modal || !gdocModalTerbuka) return;
  gdocModalTerbuka = false;
  modal.hidden = true;
  setGalatModalGdoc("", false);
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

function bukaDialogHapusSingkat(item) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  const title = modal?.querySelector(".modal-title");
  const desc = document.getElementById("catatan-singkat-delete-desc");
  const cancelBtn = document.getElementById("catatan-singkat-delete-cancel-btn");
  if (!modal || !item) return;
  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idCatatanSingkatHapus = item.id;
  if (title) title.textContent = "Pindahkan ke Tempat Sampah?";
  if (desc) desc.textContent = `Catatan singkat "${item.judul}" pada ${formatTanggalCatatan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  hapusSingkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

function tutupDialogHapusSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  if (!modal || !hapusSingkatModalTerbuka) return;
  hapusSingkatModalTerbuka = false;
  idCatatanSingkatHapus = null;
  modal.hidden = true;
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

function setGalatHapusGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-delete-alert");
  const txt = document.getElementById("catatan-gdoc-delete-alert-text");
  const btn = document.getElementById("catatan-gdoc-delete-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

function bukaDialogHapusGdoc(item) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  const desc = document.getElementById("catatan-gdoc-delete-desc");
  const radioApp = document.getElementById("catatan-gdoc-delete-mode-app");
  const radioDrive = document.getElementById("catatan-gdoc-delete-mode-drive");
  const cancelBtn = document.getElementById("catatan-gdoc-delete-cancel-btn");
  if (!modal || !item) return;
  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  itemCatatanGdocHapus = item;
  setGalatHapusGdoc("", false);
  if (radioApp instanceof HTMLInputElement) radioApp.checked = true;
  if (radioDrive instanceof HTMLInputElement) radioDrive.disabled = !navigator.onLine;
  if (desc) desc.textContent = `Konfirmasi penghapusan catatan Google Docs "${item.judul}" (${formatTanggalCatatan(item.tanggal)}):`;
  hapusGdocModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

function tutupDialogHapusGdoc(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  if (!modal || !hapusGdocModalTerbuka) return;
  hapusGdocModalTerbuka = false;
  itemCatatanGdocHapus = null;
  modal.hidden = true;
  setGalatHapusGdoc("", false);
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

async function masukUlangDriveDariCatatan(btn, setelahSukses) {
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    await loginWithGoogle();
    const banner = document.getElementById("token-expired-banner");
    if (banner) banner.hidden = !isDriveTokenExpired();
    if (typeof setelahSukses === "function") setelahSukses();
  } catch (err) {
    const pesan = formatPesanGalatAuth(err);
    if (gdocModalTerbuka) setGalatModalGdoc(pesan, true);
    else if (hapusGdocModalTerbuka) setGalatHapusGdoc(pesan, true);
    else tampilkanNotifikasiCatatan({ pesan, tipe: "danger", butuhRelogin: true });
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

export function initHalamanCatatan() {
  pastikanKerangkaHalamanCatatan();
  pengendaliFilterCatatan = initFilterPanel(document.getElementById("catatan-toolbar"));
  perbaruiStatusJaringanCatatan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  onPerubahanKegiatan(() => {
    perbaruiOpsiKegiatanDiModal();
    renderDaftarCatatan();
  });

  document.getElementById("btn-tambah-catatan-singkat")?.addEventListener("click", () => bukaModalCatatanSingkat(null));
  document.getElementById("btn-tambah-catatan-gdoc")?.addEventListener("click", () => bukaModalBuatCatatanGdoc());

  document.getElementById("catatan-page-feedback")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-catatan-feedback]") : null;
    if (!btn) return;
    const jenis = btn.getAttribute("data-catatan-feedback");
    if (jenis === "dismiss") tampilkanNotifikasiCatatan({ pesan: "" });
    else if (jenis === "relogin") {
      masukUlangDriveDariCatatan(btn, () => tampilkanNotifikasiCatatan({ pesan: "Sesi akses Google Drive berhasil diperbarui.", tipe: "success" }));
    }
  });

  const searchInput = document.getElementById("catatan-search-input");
  const jenisSelect = document.getElementById("catatan-filter-jenis");
  const sortSelect = document.getElementById("catatan-sort-tanggal");

  searchInput?.addEventListener("input", () => {
    kataKunciCari = searchInput instanceof HTMLInputElement ? searchInput.value : "";
    renderDaftarCatatan();
  });
  jenisSelect?.addEventListener("change", () => {
    filterJenis = jenisSelect instanceof HTMLSelectElement ? jenisSelect.value : "ALL";
    renderDaftarCatatan();
  });
  sortSelect?.addEventListener("change", () => {
    urutanTanggal = sortSelect instanceof HTMLSelectElement && sortSelect.value === "asc" ? "asc" : "desc";
    renderDaftarCatatan();
  });

  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.id === "btn-cari-semua-catatan" || target.id === "btn-cari-semua-catatan-empty") {
      ambilSemuaCatatanSekaliPakai();
      return;
    }
    if (target.id === "btn-muat-lebih-catatan") {
      muatLebihBanyakCatatan();
    }
  });

  document.getElementById("catatan-list-region")?.addEventListener("click", async (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-catatan-action]") : null;
    if (!btn) return;
    const aksi = btn.getAttribute("data-catatan-action");

    if (aksi === "filter-tag") {
      const tag = btn.getAttribute("data-tag") || "";
      if (tag && searchInput instanceof HTMLInputElement) {
        kataKunciCari = tag;
        searchInput.value = tag;
        renderDaftarCatatan();
      }
      return;
    }
    if (aksi === "lihat-kegiatan") {
      const kegId = btn.getAttribute("data-kegiatan-id") || "";
      if (kegId && typeof pembukaDetailKegiatanEksternal === "function") pembukaDetailKegiatanEksternal(kegId);
      return;
    }

    const id = btn.getAttribute("data-id") || "";
    const item = getDaftarCatatan().find((c) => c.id === id);
    if (!item) return;

    if (aksi === "toggle-pin") {
      btn.disabled = true;
      try {
        await updateDoc(doc(getFirestoreDb(), "catatan", item.id), {
          disematkan: !item.disematkan,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
      } finally {
        btn.disabled = false;
      }
    } else if (aksi === "edit-catatan") {
      bukaModalCatatanSingkat(item);
    } else if (aksi === "delete-catatan") {
      if (item.jenis === JENIS_CATATAN_GDOC) bukaDialogHapusGdoc(item);
      else bukaDialogHapusSingkat(item);
    }
  });

  const singkatModal = document.getElementById("catatan-singkat-modal");
  document.getElementById("catatan-singkat-close-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  document.getElementById("catatan-singkat-cancel-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  singkatModal?.addEventListener("click", (e) => { if (e.target === singkatModal) tutupModalCatatanSingkat(true); });

  document.getElementById("catatan-singkat-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setGalatModalSingkat("");
    const idEdit = String(document.getElementById("catatan-singkat-edit-id")?.value || "").trim();
    const jenisEdit = document.getElementById("catatan-singkat-edit-jenis")?.value === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
    const judul = String(document.getElementById("catatan-singkat-judul")?.value || "").trim();
    const tanggal = String(document.getElementById("catatan-singkat-tanggal")?.value || "").trim();
    const kategori = String(document.getElementById("catatan-singkat-kategori")?.value || "").trim().slice(0, 40);
    const isi = String(document.getElementById("catatan-singkat-isi")?.value || "").trim();
    const tag = uraiInputTag(document.getElementById("catatan-singkat-tag")?.value || "");
    const kegiatanId = String(document.getElementById("catatan-singkat-kegiatan")?.value || "").trim();
    const disematkan = Boolean(document.getElementById("catatan-singkat-pin")?.checked);

    if (!judul) { setGalatModalSingkat("Judul catatan wajib diisi."); return; }
    if (!tanggal || !parseTanggal(tanggal)) { setGalatModalSingkat("Tanggal wajib diisi dengan benar."); return; }
    if (jenisEdit === JENIS_CATATAN_SINGKAT && !isi) { setGalatModalSingkat("Isi catatan singkat wajib diisi."); return; }

    const submitBtn = document.getElementById("catatan-singkat-submit-btn");
    const sekarang = new Date().toISOString();
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
    try {
      const db = getFirestoreDb();
      if (idEdit) {
        const perubahan = { judul, tanggal, kategori, tag, kegiatanId, disematkan, updatedAt: sekarang };
        if (jenisEdit === JENIS_CATATAN_SINGKAT) perubahan.isi = isi;
        await updateDoc(doc(db, KOLEKSI.CATATAN, idEdit), perubahan);
      } else {
        // Fase 5: Setel dihapusAt: null pada dokumen baru
        await addDoc(collection(db, KOLEKSI.CATATAN), {
          jenis: JENIS_CATATAN_SINGKAT,
          judul,
          isi,
          kategori,
          tag,
          kegiatanId,
          disematkan,
          tanggal,
          dihapusAt: null,
          createdAt: sekarang,
          updatedAt: sekarang
        });
      }
      tutupModalCatatanSingkat(true);
    } catch (err) {
      setGalatModalSingkat(formatPesanGalatFirestore(err));
    } finally {
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    }
  });

  const gdocModal = document.getElementById("catatan-gdoc-modal");
  document.getElementById("catatan-gdoc-close-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  document.getElementById("catatan-gdoc-cancel-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  gdocModal?.addEventListener("click", (e) => { if (e.target === gdocModal) tutupModalBuatCatatanGdoc(true); });
  document.getElementById("catatan-gdoc-templat")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-kegiatan")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => setGalatModalGdoc("", false));
  });

  document.getElementById("catatan-gdoc-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const infoTpl = ambilInfoTemplatDokumen(document.getElementById("catatan-gdoc-templat")?.value || "notulensi");
    const judul = String(document.getElementById("catatan-gdoc-judul")?.value || "").trim();
    const tanggal = String(document.getElementById("catatan-gdoc-tanggal")?.value || "").trim();
    const kegiatanId = String(document.getElementById("catatan-gdoc-kegiatan")?.value || "").trim();
    const kategori = String(document.getElementById("catatan-gdoc-kategori")?.value || "").trim().slice(0, 40);
    const tag = uraiInputTag(document.getElementById("catatan-gdoc-tag")?.value || "");
    const disematkan = Boolean(document.getElementById("catatan-gdoc-pin")?.checked);

    if (!judul) { setGalatModalGdoc("Judul catatan Google Docs wajib diisi.", false); return; }
    if (!tanggal || !parseTanggal(tanggal)) { setGalatModalGdoc("Tanggal wajib diisi dengan benar.", false); return; }
    if (isDriveTokenExpired()) {
      setGalatModalGdoc("Sesi akses Google Drive telah kedaluwarsa. Klik \"Masuk ulang\" terlebih dahulu.", true);
      return;
    }

    const kegObj = kegiatanId ? cariKegiatanId(kegiatanId) : null;
    const htmlKonten = bangunHtmlTemplatDokumen({ templat: infoTpl.id, judul, tanggal, kegiatan: kegObj });

    const submitBtn = document.getElementById("catatan-gdoc-submit-btn");
    const cancelBtn = document.getElementById("catatan-gdoc-cancel-btn");
    const progWrap = document.getElementById("catatan-gdoc-progress-wrap");

    sedangMembuatGdoc = true;
    setGalatModalGdoc("", false);
    if (progWrap) progWrap.hidden = false;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;

    try {
      const hasilDrive = await buatDokumenGoogleDocsDrive({ judul, htmlKonten });
      const sekarang = new Date().toISOString();
      await addDoc(collection(getFirestoreDb(), "catatan"), {
        jenis: JENIS_CATATAN_GDOC,
        judul,
        isi: "",
        kategori,
        tag,
        kegiatanId: kegObj ? kegObj.id : "",
        disematkan,
        tanggal,
        templat: infoTpl.id,
        docId: hasilDrive.id,
        tautan: hasilDrive.webViewLink,
        dihapusAt: null,
        createdAt: sekarang,
        updatedAt: sekarang
      });

      sedangMembuatGdoc = false;
      tutupModalBuatCatatanGdoc(true);
      bukaTabBaruAman(hasilDrive.webViewLink);
      tampilkanNotifikasiCatatan({
        pesan: `Dokumen Google Docs "${judul}" berhasil dibuat di folder Agenda-Arsip.`,
        tipe: "success",
        tautanDocs: hasilDrive.webViewLink
      });
    } catch (err) {
      setGalatModalGdoc(formatPesanGalatDrive(err), adalahGalatToken(err));
    } finally {
      sedangMembuatGdoc = false;
      if (progWrap) progWrap.hidden = true;
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = !navigator.onLine;
      if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
    }
  });

  const delSingkatModal = document.getElementById("catatan-singkat-delete-modal");
  document.getElementById("catatan-singkat-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusSingkat(true));
  delSingkatModal?.addEventListener("click", (e) => { if (e.target === delSingkatModal) tutupDialogHapusSingkat(true); });
  document.getElementById("catatan-singkat-delete-confirm-btn")?.addEventListener("click", async (e) => {
    if (!idCatatanSingkatHapus) return;
    const targetId = idCatatanSingkatHapus;
    const btn = e.currentTarget;
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      await hapusLunakCatatan(targetId, false);
      tutupDialogHapusSingkat(false);
      tampilkanToast("Catatan dipindahkan ke Tempat Sampah", "info", {
        aksiLabel: "Urungkan",
        aksiOnClick: async () => {
          try {
            await pulihkanCatatan(targetId);
            tampilkanToast("Catatan berhasil dipulihkan", "success");
          } catch (errUrung) {
            tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
          }
        },
        durasiMs: 8000
      });
    } catch (err) {
      tutupDialogHapusSingkat(false);
      tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });

  const delGdocModal = document.getElementById("catatan-gdoc-delete-modal");
  document.getElementById("catatan-gdoc-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusGdoc(true));
  delGdocModal?.addEventListener("click", (e) => { if (e.target === delGdocModal) tutupDialogHapusGdoc(true); });
  document.getElementById("catatan-gdoc-delete-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => setGalatHapusGdoc("", false));
  });
  document.getElementById("catatan-gdoc-delete-confirm-btn")?.addEventListener("click", async (e) => {
    if (!itemCatatanGdocHapus) return;
    const target = itemCatatanGdocHapus;
    const hapusDiDrive = Boolean(document.getElementById("catatan-gdoc-delete-mode-drive")?.checked);
    const btn = e.currentTarget;
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    setGalatHapusGdoc("", false);
    try {
      if (hapusDiDrive && target.docId) {
        if (!navigator.onLine) {
          throw new Error("Tidak ada koneksi internet untuk memindahkan dokumen ke Sampah Drive. Pilih \"Hapus dari aplikasi saja\" atau sambungkan internet.");
        }
        try {
          await pindahkanItemKeSampahDrive(target.docId);
        } catch (driveErr) {
          if (!driveErr || !driveErr.isNotFound) throw driveErr;
        }
      }
      await hapusLunakCatatan(target.id, hapusDiDrive);
      tutupDialogHapusGdoc(false);
      tampilkanToast("Catatan Google Docs dipindahkan ke Tempat Sampah", "info", {
        aksiLabel: "Urungkan",
        aksiOnClick: async () => {
          try {
            const hasil = await pulihkanCatatan(target.id);
            if (hasil && hasil.pesanDrive) {
              tampilkanToast(`Catatan dipulihkan. ${hasil.pesanDrive}`, "warning");
            } else {
              tampilkanToast("Catatan berhasil dipulihkan", "success");
            }
          } catch (errUrung) {
            tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
          }
        },
        durasiMs: 8000
      });
    } catch (err) {
      setGalatHapusGdoc(formatPesanGalatDrive(err), adalahGalatToken(err));
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (hapusGdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusGdoc(true); }
    else if (hapusSingkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusSingkat(true); }
    else if (gdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalBuatCatatanGdoc(true); }
    else if (singkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalCatatanSingkat(true); }
  }, true);

  window.addEventListener("online", perbaruiStatusJaringanCatatan);
  window.addEventListener("offline", perbaruiStatusJaringanCatatan);
}

export function subscribeCatatan() {
  unsubscribeCatatan();
  initHalamanCatatan();
  sudahDimuatPertamaKali = false;
  renderDaftarCatatan();
  beritahuPerubahanCatatan();

  // Fase 5: Listener terbatas 100 catatan terbaru yang tidak di tempat sampah
  const db = getFirestoreDb();
  const q = query(
    collection(db, KOLEKSI.CATATAN),
    where("dihapusAt", "==", null),
    orderBy("updatedAt", "desc"),
    limit(UKURAN_HALAMAN_CATATAN)
  );

  unsubscribeSnapshotCatatan = onSnapshot(
    q,
    (snapshot) => {
      petaCatatanHalaman.clear();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const jenis = d.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
        const entri = {
          id: docSnap.id,
          jenis,
          judul: String(d.judul || ""),
          isi: jenis === JENIS_CATATAN_SINGKAT ? String(d.isi || "") : "",
          kategori: String(d.kategori || ""),
          tag: Array.isArray(d.tag) ? d.tag.map((t) => String(t || "").trim()).filter(Boolean) : [],
          kegiatanId: String(d.kegiatanId || ""),
          disematkan: Boolean(d.disematkan),
          tanggal: String(d.tanggal || ""),
          createdAt: String(d.createdAt || ""),
          updatedAt: String(d.updatedAt || ""),
          dihapusAt: d.dihapusAt || null,
          driveDiSampah: Boolean(d.driveDiSampah)
        };
        if (jenis === JENIS_CATATAN_GDOC) {
          entri.templat = String(d.templat || "kosong");
          entri.docId = String(d.docId || "");
          entri.tautan = String(d.tautan || "");
        }
        petaCatatanHalaman.set(docSnap.id, entri);
      });

      if (!snapshot.empty) {
        lastDocCatatanHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      if (!kursorCatatanTambahan) {
        adaLebihBanyakCatatan = snapshot.docs.length >= UKURAN_HALAMAN_CATATAN;
      }
      sudahDimuatPertamaKali = true;
      renderDaftarCatatan();
      beritahuPerubahanCatatan();
    },
    (err) => {
      sudahDimuatPertamaKali = true;
      tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
      renderDaftarCatatan();
      beritahuPerubahanCatatan();
    }
  );

  return () => unsubscribeCatatan();
}

export function unsubscribeCatatan() {
  if (typeof unsubscribeSnapshotCatatan === "function") {
    try { unsubscribeSnapshotCatatan(); } catch (_e) {}
    unsubscribeSnapshotCatatan = null;
  }
  if (timerSorotCatatan !== null) {
    window.clearTimeout(timerSorotCatatan);
    timerSorotCatatan = null;
  }
  petaCatatanHalaman.clear();
  petaCatatanTambahan.clear();
  lastDocCatatanHalaman = null;
  kursorCatatanTambahan = null;
  adaLebihBanyakCatatan = false;
  sedangMuatLebihCatatan = false;
  sedangMencariSemuaCatatan = false;
  seluruhCatatanSudahDimuat = false;
  sudahDimuatPertamaKali = false;
  sedangMembuatGdoc = false;
  pengendaliFilterCatatan?.tutup(false);
  tutupModalCatatanSingkat(false);
  tutupModalBuatCatatanGdoc(false);
  tutupDialogHapusSingkat(false);
  tutupDialogHapusGdoc(false);
  tampilkanNotifikasiCatatan({ pesan: "" });
  beritahuPerubahanCatatan();
}
