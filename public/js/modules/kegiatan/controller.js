/**
 * Controller Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Mengikat antarmuka halaman Kegiatan: modal tambah/ubah & hapus, modal detail
 * beserta catatan terkait, panel filter, ubah status cepat, dan siklus
 * subscribe/unsubscribe langganan Firestore. Render dipicu lewat
 * onPerubahanKegiatan() dari state (pola yang sama dengan modul pengaturan).
 */
import { DAFTAR_STATUS_KEGIATAN, KOLEKSI, MAKS_UKURAN_BERKAS_MB } from "../../config/constants.js";
import { tambahItem, perbaruiItem } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { formatPesanGalatDrive } from "../../services/driveService.js";
import { svgIkon, escapeHtml } from "../../util-html.js";
import { formatUkuranBerkas } from "../dokumen/format.js";
import { unggahBerkasSebagaiDokumenKegiatan } from "../dokumen/unggah-kegiatan.js";
import { inisialisasiDialogKelolaKategori } from "../kategori/index.js";
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { pindahKeBagian } from "../../sidebar.js";
import { tampilkanToast } from "../../shared/toast.js";
import {
  JENIS_CATATAN_GDOC,
  getCatatanTerkaitKegiatan,
  onPerubahanCatatan,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc,
  formatTanggalCatatan,
  tautanAmanGoogleDocs
} from "../../modules/catatan/index.js";
import {
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  onPerubahanKegiatan,
  beritahuPerubahanKegiatan,
  terapkanPerubahanLokalKegiatan,
  ubahStatusKegiatanCepat,
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hitungKegiatanPemakaiLokal,
  muatLebihBanyakKegiatan,
  tandaiKegiatanSudahDimuat,
  setelOpsiPeristiwaKegiatan,
  langgananKategoriKegiatan,
  mulaiLanggananJendelaKegiatan,
  mulaiLanggananHalamanKegiatan,
  lepasLanggananKegiatan,
  hitungRentangJendela
} from "./state.js";
import { validJamOpsional, formatTanggalTampilan } from "./format.js";
import { onPerubahanDokumen } from "../dokumen/state.js";
import {
  IKON_CATATAN_META,
  IKON_GDOC_MINI,
  IKON_TAB_BARU,
  pastikanKerangkaHalamanKegiatan,
  perbaruiDropdownKategori,
  getFilterKategoriId,
  getFilterStatus,
  setKataKunciCari,
  setFilterKategoriId,
  setFilterStatus,
  setUrutanTanggal,
  pasangFilterKegiatan,
  tutupPanelFilterKegiatan,
  renderDaftarKegiatan,
  tampilkanGalatHalamanKegiatan,
  setPesanGalatFormKegiatan,
  perbaruiPetunjukHariLiburForm
} from "./view.js";

let antarmukaSudahDiikat = false;
let dialogKelolaKategoriCtrl = null;

let formModalTerbuka = false;
let hapusModalTerbuka = false;
let idKegiatanAkanDihapus = null;
let fokusSebelumModalKegiatan = null;

// Berkas dokumen pendukung yang dipilih di form (belum diunggah ke Drive).
let berkasDokumenForm = [];

const IKON_HAPUS_BERKAS = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';

/**
 * Merender daftar berkas dokumen pendukung yang dipilih pada form kegiatan,
 * lengkap dengan tombol hapus per berkas.
 */
function renderDaftarBerkasDokumenForm() {
  const list = document.getElementById("kegiatan-dokumen-daftar");
  if (!list) return;

  if (berkasDokumenForm.length === 0) {
    list.innerHTML = "";
    list.hidden = true;
    return;
  }

  list.hidden = false;
  list.innerHTML = berkasDokumenForm
    .map(
      (berkas, indeks) => `<li class="form-file-item">
        <span class="form-file-name" title="${escapeHtml(berkas.name)}">${escapeHtml(berkas.name)}</span>
        <span class="form-file-size">${escapeHtml(formatUkuranBerkas(berkas.size))}</span>
        <button type="button" class="form-file-remove" data-indeks-berkas="${indeks}" title="Hapus berkas dari daftar" aria-label="Hapus ${escapeHtml(berkas.name)} dari daftar dokumen">${svgIkon(IKON_HAPUS_BERKAS, 15, 2)}</button>
      </li>`
    )
    .join("");
}

function kosongkanBerkasDokumenForm() {
  berkasDokumenForm = [];
  renderDaftarBerkasDokumenForm();
  const input = document.getElementById("kegiatan-dokumen-input");
  if (input instanceof HTMLInputElement) input.value = "";
}

let pembukaDetailKegiatanFn = null;
let idKegiatanTerakhirDiklik = "";
let idKegiatanDetailAktif = "";

export function daftarkanPembukaDetailKegiatan(fn) {
  pembukaDetailKegiatanFn = typeof fn === "function" ? fn : null;
}

// --- Modal detail & catatan terkait ------------------------------------------

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

// --- Modal tambah / ubah kegiatan ---------------------------------------------

export function bukaModalFormKegiatan(kegiatanEdit = null, tanggalAwal = null) {
  const modal = document.getElementById("kegiatan-form-modal");
  const titleEl = document.getElementById("kegiatan-form-title");
  const idInput = document.getElementById("kegiatan-edit-id");
  const judulInput = document.getElementById("kegiatan-judul-input");
  const tanggalInput = document.getElementById("kegiatan-tanggal-input");
  const tanggalSelesaiInput = document.getElementById("kegiatan-tanggal-selesai-input");
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
    if (tanggalSelesaiInput) tanggalSelesaiInput.value = kegiatanEdit.tanggalSelesai || "";
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
    if (tanggalSelesaiInput) tanggalSelesaiInput.value = "";
    if (mulaiInput) mulaiInput.value = "";
    if (selesaiInput) selesaiInput.value = "";
    if (lokasiInput) lokasiInput.value = "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const daftarKat = manajerKategoriKegiatan.getDaftarKategori();
      const filterKatId = getFilterKategoriId();
      if (filterKatId !== "ALL" && filterKatId !== "__TANPA_KATEGORI__") {
        kategoriSelect.value = filterKatId;
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

  kosongkanBerkasDokumenForm();

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

// --- Dialog hapus (pindah ke Tempat Sampah) -----------------------------------

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

// --- Formulir -----------------------------------------------------------------

function ambilDanValidasiDataForm() {
  const judul = String(document.getElementById("kegiatan-judul-input")?.value || "").trim();
  const tanggal = String(document.getElementById("kegiatan-tanggal-input")?.value || "").trim();
  const tanggalSelesai = String(document.getElementById("kegiatan-tanggal-selesai-input")?.value || "").trim();
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
  if (tanggalSelesai && !parseTanggal(tanggalSelesai)) {
    throw new Error("Tanggal selesai harus berupa tanggal yang benar atau dikosongkan.");
  }
  if (tanggalSelesai && tanggalSelesai < tanggal) {
    throw new Error("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
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
  return { judul, catatan, tanggal, tanggalSelesai, waktuMulai, waktuSelesai, lokasi, kategoriId, status };
}

// --- Pintasan filter dari modul lain -------------------------------------------

export function terapkanFilterKategoriKegiatan(targetKategoriId) {
  setKataKunciCari("");
  setFilterStatus("ALL");
  setFilterKategoriId(targetKategoriId || "ALL");
  tutupPanelFilterKegiatan();

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "ALL";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = getFilterKategoriId();

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

export function terapkanFilterStatusKegiatan(targetStatus) {
  setKataKunciCari("");
  setFilterKategoriId("ALL");
  setFilterStatus(DAFTAR_STATUS_KEGIATAN.includes(targetStatus) ? targetStatus : "ALL");
  tutupPanelFilterKegiatan();

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = "ALL";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = getFilterStatus();

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

// --- Inisialisasi & langganan ---------------------------------------------------

export function initHalamanKegiatan() {
  pastikanKerangkaHalamanKegiatan();
  pasangFilterKegiatan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  // Pola pengaturan: state memberi tahu, controller merender.
  onPerubahanKegiatan(() => {
    renderDaftarKegiatan();
  });

  dialogKelolaKategoriCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriKegiatan,
    // Wajib fungsi SINKRON pengembali angka: view.js memakainya sebagai nilai,
    // bukan promise. Angka akurat dari server menyusul lewat cacheHitunganServer
    // (segarkanHitunganServerSemua -> manajer.hitungPemakaiDariServer).
    hitungPemakaiLokal: hitungKegiatanPemakaiLokal,
    onLihatItemKategori: (katId) => terapkanFilterKategoriKegiatan(katId),
    judulDialog: "Kelola Kategori Kegiatan"
  });

  manajerKategoriKegiatan.onChange(() => {
    perbaruiDropdownKategori();
    beritahuPerubahanKegiatan();
  });

  onPerubahanCatatan(() => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });

  // Dokumen terkait ditampilkan di kartu kegiatan — segarkan saat data dokumen berubah.
  onPerubahanDokumen(() => {
    renderDaftarKegiatan();
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
      setKataKunciCari(searchInput.value);
      renderDaftarKegiatan();
    });
  }

  const filterKatSelect = document.getElementById("kegiatan-filter-kategori");
  if (filterKatSelect) {
    filterKatSelect.addEventListener("change", () => {
      setFilterKategoriId(filterKatSelect.value);
      renderDaftarKegiatan();
    });
  }

  const filterStatusSelect = document.getElementById("kegiatan-filter-status");
  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", () => {
      setFilterStatus(filterStatusSelect.value);
      renderDaftarKegiatan();
    });
  }

  const sortSelect = document.getElementById("kegiatan-sort-tanggal");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      setUrutanTanggal(sortSelect.value === "desc" ? "desc" : "asc");
      renderDaftarKegiatan();
    });
  }

  const listRegion = document.getElementById("kegiatan-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action], #btn-muat-lebih-kegiatan") : null;
      if (!btn) return;

      if (btn.id === "btn-muat-lebih-kegiatan") {
        muatLebihBanyakKegiatan().then((pesan) => {
          if (pesan) tampilkanGalatHalamanKegiatan(pesan);
        });
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

  const dokumenInputEl = document.getElementById("kegiatan-dokumen-input");
  if (dokumenInputEl instanceof HTMLInputElement) {
    dokumenInputEl.addEventListener("change", () => {
      const batasBytes = MAKS_UKURAN_BERKAS_MB * 1024 * 1024;
      const berkasBaru = Array.from(dokumenInputEl.files || []);
      const terlaluBesar = berkasBaru.filter((f) => f.size > batasBytes);

      if (terlaluBesar.length > 0) {
        const daftarNama = terlaluBesar
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ");
        setPesanGalatFormKegiatan(
          `Berkas berikut melebihi batas maksimum ${MAKS_UKURAN_BERKAS_MB} MB dan tidak ditambahkan: ${daftarNama}${terlaluBesar.length > 3 ? ", ..." : ""}`
        );
      } else {
        setPesanGalatFormKegiatan("");
      }

      berkasBaru
        .filter((f) => f.size <= batasBytes)
        .forEach((f) => berkasDokumenForm.push(f));

      dokumenInputEl.value = "";
      renderDaftarBerkasDokumenForm();
    });
  }

  const dokumenDaftarEl = document.getElementById("kegiatan-dokumen-daftar");
  if (dokumenDaftarEl) {
    dokumenDaftarEl.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-indeks-berkas]") : null;
      if (!btn) return;
      const indeks = Number(btn.getAttribute("data-indeks-berkas"));
      if (!Number.isInteger(indeks) || indeks < 0 || indeks >= berkasDokumenForm.length) return;
      berkasDokumenForm.splice(indeks, 1);
      renderDaftarBerkasDokumenForm();
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
      const berkasAkanDiunggah = [...berkasDokumenForm];

      if (berkasAkanDiunggah.length > 0 && !navigator.onLine) {
        setPesanGalatFormKegiatan(
          "Dokumen pendukung memerlukan koneksi internet untuk diunggah ke Google Drive. Hapus berkas dari daftar atau sambungkan perangkat terlebih dahulu."
        );
        return;
      }

      if (formSubmitBtn) formSubmitBtn.disabled = true;
      let idKegiatanTersimpan = idEdit;
      let berkasGagal = 0;
      let pesanGagalTerakhir = "";
      try {
        if (idEdit) {
          await perbaruiItem(KOLEKSI.KEGIATAN, idEdit, { ...payload, updatedAt: sekarang });
          terapkanPerubahanLokalKegiatan(idEdit, { ...payload, updatedAt: sekarang });
          beritahuPerubahanKegiatan();
        } else {
          // Fase 5: Selalu setel dihapusAt: null pada dokumen baru
          idKegiatanTersimpan = await tambahItem(KOLEKSI.KEGIATAN, {
            ...payload,
            dihapusAt: null,
            createdAt: sekarang,
            updatedAt: sekarang
          });
        }

        if (berkasAkanDiunggah.length > 0) {
          const total = berkasAkanDiunggah.length;
          for (let i = 0; i < total; i += 1) {
            const berkas = berkasAkanDiunggah[i];
            if (formSubmitBtn) {
              formSubmitBtn.textContent = `Mengunggah dokumen ${i + 1}/${total}...`;
            }
            try {
              await unggahBerkasSebagaiDokumenKegiatan({
                file: berkas,
                kegiatanId: idKegiatanTersimpan,
                kategoriId: payload.kategoriId,
              });
            } catch (errUnggah) {
              berkasGagal += 1;
              pesanGagalTerakhir = formatPesanGalatDrive(errUnggah);
            }
          }
        }

        berkasDokumenForm = [];
        renderDaftarBerkasDokumenForm();
        tutupModalFormKegiatan(true);

        const berkasBerhasil = berkasAkanDiunggah.length - berkasGagal;
        if (berkasGagal > 0) {
          tampilkanToast(
            `Kegiatan tersimpan, tetapi ${berkasGagal} dari ${berkasAkanDiunggah.length} dokumen gagal diunggah${pesanGagalTerakhir ? `: ${pesanGagalTerakhir}` : "."}`,
            "warning",
            { durasiMs: 9000 }
          );
        } else if (berkasBerhasil > 0) {
          tampilkanToast(`${berkasBerhasil} dokumen berhasil diunggah`, "success");
        }
      } catch (err) {
        setPesanGalatFormKegiatan(formatPesanGalatFirestore(err));
      } finally {
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.textContent = idEdit ? "Simpan Perubahan" : "Simpan Kegiatan";
        }
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

export function subscribeKegiatan() {
  unsubscribeKegiatan();
  initHalamanKegiatan();
  tandaiKegiatanSudahDimuat(false);
  renderDaftarKegiatan();
  beritahuPerubahanKegiatan();

  // Opsi peristiwa DOM yang dipicu state saat snapshot berjalan.
  setelOpsiPeristiwaKegiatan({
    onSuksesJendela: () => {
      tampilkanGalatHalamanKegiatan("");
      renderCatatanTerkaitDiDetailModal();
      dialogKelolaKategoriCtrl?.segarkanTampilan();
    },
    onGalatJendela: (pesan) => tampilkanGalatHalamanKegiatan(pesan),
    onGalatHalaman: (pesan) => tampilkanGalatHalamanKegiatan(pesan),
    onKategoriOk: () => perbaruiDropdownKategori(),
    onGalatKategori: (pesan) => tampilkanGalatHalamanKegiatan(pesan)
  });

  langgananKategoriKegiatan();

  // Inisialisasi jendela tanggal hari ini (+/- 1 bulan)
  const skr = parseTanggal(hariIni()) || new Date();
  const { tglAwal, tglAkhir } = hitungRentangJendela(skr.getFullYear(), skr.getMonth());
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);

  // Inisialisasi listener daftar halaman kegiatan
  mulaiLanggananHalamanKegiatan();

  return () => unsubscribeKegiatan();
}

export function unsubscribeKegiatan() {
  // Melepas langganan + mengosongkan cache data (beritahu di akhirnya).
  lepasLanggananKegiatan();

  idKegiatanDetailAktif = "";
  idKegiatanTerakhirDiklik = "";

  tutupPanelFilterKegiatan();
  tutupModalFormKegiatan(false);
  tutupDialogHapusKegiatan(false);
  dialogKelolaKategoriCtrl?.tutup(false);
}
