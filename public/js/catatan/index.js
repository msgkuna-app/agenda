/**
 * Modul Utama Catatan (Fase 7C)
 * Mengikat event listener antarmuka pengguna dan mengekspor semua API publik modul Catatan.
 */
import {
  getFirestoreDb,
  doc,
  updateDoc,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { onPerubahanKegiatan } from "../kegiatan.js";
import { initFilterPanel } from "../filter-panel.js";
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN,
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
  urutkanDaftarCatatan
} from "./util.js";
import {
  stateCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  daftarkanPembukaDetailKegiatanCatatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah,
  getCatatanTerkaitKegiatan
} from "./state.js";
import {
  subscribeCatatan,
  unsubscribeCatatan,
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai,
  hapusLunakCatatan,
  pulihkanCatatan,
  hapusPermanenCatatan
} from "./data.js";
import {
  pastikanKerangkaHalamanCatatan,
  perbaruiStatusJaringanCatatan,
  perbaruiOpsiKegiatanDiModal,
  renderDaftarCatatan,
  sorotCatatanDiHalaman,
  tampilkanNotifikasiCatatan
} from "./render.js";
import {
  bukaModalCatatanSingkat,
  tutupModalCatatanSingkat,
  tanganiSubmitCatatanSingkat
} from "./dialog-singkat.js";
import {
  bukaModalBuatCatatanGdoc,
  tutupModalBuatCatatanGdoc,
  sinkronkanJudulSaranGdoc,
  masukUlangDriveDariCatatan,
  tanganiSubmitCatatanGdoc
} from "./dialog-gdoc.js";
import {
  bukaDialogHapusSingkat,
  tutupDialogHapusSingkat,
  tanganiKonfirmasiHapusSingkat,
  bukaDialogHapusGdoc,
  tutupDialogHapusGdoc,
  tanganiKonfirmasiHapusGdoc,
  setGalatHapusGdoc
} from "./dialog-hapus.js";

export function initHalamanCatatan() {
  pastikanKerangkaHalamanCatatan();
  stateCatatan.pengendaliFilter = initFilterPanel(document.getElementById("catatan-toolbar"));
  perbaruiStatusJaringanCatatan();
  if (stateCatatan.antarmukaSudahDiikat) return;
  stateCatatan.antarmukaSudahDiikat = true;

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
    if (jenis === "dismiss") {
      tampilkanNotifikasiCatatan({ pesan: "" });
    } else if (jenis === "relogin") {
      masukUlangDriveDariCatatan(btn, () => tampilkanNotifikasiCatatan({ pesan: "Sesi akses Google Drive berhasil diperbarui.", tipe: "success" }));
    }
  });

  const searchInput = document.getElementById("catatan-search-input");
  const jenisSelect = document.getElementById("catatan-filter-jenis");
  const sortSelect = document.getElementById("catatan-sort-tanggal");

  searchInput?.addEventListener("input", () => {
    stateCatatan.kataKunciCari = searchInput instanceof HTMLInputElement ? searchInput.value : "";
    renderDaftarCatatan();
  });
  jenisSelect?.addEventListener("change", () => {
    stateCatatan.filterJenis = jenisSelect instanceof HTMLSelectElement ? jenisSelect.value : "ALL";
    renderDaftarCatatan();
  });
  sortSelect?.addEventListener("change", () => {
    stateCatatan.urutanTanggal = sortSelect instanceof HTMLSelectElement && sortSelect.value === "asc" ? "asc" : "desc";
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
        stateCatatan.kataKunciCari = tag;
        searchInput.value = tag;
        renderDaftarCatatan();
      }
      return;
    }
    if (aksi === "lihat-kegiatan") {
      const kegId = btn.getAttribute("data-kegiatan-id") || "";
      if (kegId && typeof stateCatatan.pembukaDetailKegiatanEksternal === "function") {
        stateCatatan.pembukaDetailKegiatanEksternal(kegId);
      }
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

  // Modal Catatan Singkat
  const singkatModal = document.getElementById("catatan-singkat-modal");
  document.getElementById("catatan-singkat-close-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  document.getElementById("catatan-singkat-cancel-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  singkatModal?.addEventListener("click", (e) => { if (e.target === singkatModal) tutupModalCatatanSingkat(true); });
  document.getElementById("catatan-singkat-form")?.addEventListener("submit", tanganiSubmitCatatanSingkat);

  // Modal Catatan Google Docs
  const gdocModal = document.getElementById("catatan-gdoc-modal");
  document.getElementById("catatan-gdoc-close-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  document.getElementById("catatan-gdoc-cancel-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  gdocModal?.addEventListener("click", (e) => { if (e.target === gdocModal) tutupModalBuatCatatanGdoc(true); });
  document.getElementById("catatan-gdoc-templat")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-kegiatan")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => sinkronkanJudulSaranGdoc());
  });
  document.getElementById("catatan-gdoc-form")?.addEventListener("submit", tanganiSubmitCatatanGdoc);

  // Dialog Hapus Catatan Singkat
  const delSingkatModal = document.getElementById("catatan-singkat-delete-modal");
  document.getElementById("catatan-singkat-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusSingkat(true));
  delSingkatModal?.addEventListener("click", (e) => { if (e.target === delSingkatModal) tutupDialogHapusSingkat(true); });
  document.getElementById("catatan-singkat-delete-confirm-btn")?.addEventListener("click", tanganiKonfirmasiHapusSingkat);

  // Dialog Hapus Catatan Google Docs
  const delGdocModal = document.getElementById("catatan-gdoc-delete-modal");
  document.getElementById("catatan-gdoc-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusGdoc(true));
  delGdocModal?.addEventListener("click", (e) => { if (e.target === delGdocModal) tutupDialogHapusGdoc(true); });
  document.getElementById("catatan-gdoc-delete-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => setGalatHapusGdoc("", false));
  });
  document.getElementById("catatan-gdoc-delete-confirm-btn")?.addEventListener("click", tanganiKonfirmasiHapusGdoc);

  // Penanganan Tombol Escape
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (stateCatatan.hapusGdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusGdoc(true); }
    else if (stateCatatan.hapusSingkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusSingkat(true); }
    else if (stateCatatan.gdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalBuatCatatanGdoc(true); }
    else if (stateCatatan.singkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalCatatanSingkat(true); }
  }, true);

  window.addEventListener("online", perbaruiStatusJaringanCatatan);
  window.addEventListener("offline", perbaruiStatusJaringanCatatan);
}

// Ekspor API Publik Lengkap (kompatibilitas 100% untuk semua pengimpor)
export {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN,
  formatTanggalCatatan,
  tautanAmanGoogleDocs,
  urutkanDaftarCatatan,
  isCatatanSudahDimuat,
  onPerubahanCatatan,
  daftarkanPembukaDetailKegiatanCatatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah,
  getCatatanTerkaitKegiatan,
  subscribeCatatan,
  unsubscribeCatatan,
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai,
  hapusLunakCatatan,
  pulihkanCatatan,
  hapusPermanenCatatan,
  perbaruiStatusJaringanCatatan,
  sorotCatatanDiHalaman,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc
};