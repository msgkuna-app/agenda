/**
 * Modul Utama Pengendali Kegiatan (Index)
 * Mengoordinasikan inisialisasi antarmuka, event listeners, siklus hidup langganan Firestore,
 * dan re-ekspor fungsi-fungsi publik.
 */
import {
  stateKegiatan,
  manajerKategoriKegiatan,
  daftarkanPembukaDetailKegiatan,
  getDaftarKegiatan,
  getKegiatanJendela,
  getDaftarKegiatanDiSampah,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  beritahuPerubahanKegiatan
} from "./state.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  UKURAN_HALAMAN_KEGIATAN,
  kelasBadgeStatus,
  hitungRentangJendela
} from "./util.js";
import {
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hapusPermanenKegiatan,
  ubahStatusKegiatanCepat,
  hitungKegiatanPemakaiServer,
  muatLebihBanyakKegiatan,
  ambilSemuaKegiatanSekaliPakai,
  ambilKegiatanRentangTanggal,
  mulaiLanggananJendelaKegiatan,
  mulaiLanggananHalamanKegiatan,
  sinkronkanJendelaTanggalKegiatan as sinkronkanJendelaData
} from "./data.js";
import {
  tampilkanGalatHalamanKegiatan,
  pastikanKerangkaHalamanKegiatan,
  perbaruiDropdownKategori,
  renderDaftarKegiatan,
  renderCatatanTerkaitDiDetailModal,
  picuBuatNotulensiUntukKegiatan
} from "./render.js";
import {
  bukaModalFormKegiatan,
  tutupModalFormKegiatan,
  inisialisasiFormKegiatan
} from "./dialog-form.js";
import {
  bukaDialogHapusKegiatan,
  tutupDialogHapusKegiatan,
  inisialisasiDialogHapusKegiatan
} from "./dialog-hapus.js";
import { inisialisasiDialogKelolaKategori } from "../kategori.js";
import { initFilterPanel } from "../filter-panel.js";
import { pindahKeBagian } from "../sidebar.js";
import {
  onPerubahanCatatan,
  bukaModalCatatanSingkat,
  getCatatanTerkaitKegiatan
} from "../catatan.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { formatPesanGalatFirestore } from "../firebase-config.js";

// Re-ekspor semua konstanta dan fungsi publik
export {
  DAFTAR_STATUS_KEGIATAN,
  UKURAN_HALAMAN_KEGIATAN,
  manajerKategoriKegiatan,
  daftarkanPembukaDetailKegiatan,
  getDaftarKegiatan,
  getKegiatanJendela,
  getDaftarKegiatanDiSampah,
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hapusPermanenKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  ubahStatusKegiatanCepat,
  hitungKegiatanPemakaiServer,
  kelasBadgeStatus,
  muatLebihBanyakKegiatan,
  ambilSemuaKegiatanSekaliPakai,
  ambilKegiatanRentangTanggal,
  bukaModalFormKegiatan,
  bukaDialogHapusKegiatan
};

export function terapkanFilterKategoriKegiatan(targetKategoriId) {
  stateKegiatan.kataKunciCari = "";
  stateKegiatan.filterStatus = "ALL";
  stateKegiatan.filterKategoriId = targetKategoriId || "ALL";
  stateKegiatan.pengendaliFilter?.tutup(false);

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "ALL";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = stateKegiatan.filterKategoriId;

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

export function terapkanFilterStatusKegiatan(targetStatus) {
  stateKegiatan.kataKunciCari = "";
  stateKegiatan.filterKategoriId = "ALL";
  stateKegiatan.filterStatus = DAFTAR_STATUS_KEGIATAN.includes(targetStatus) ? targetStatus : "ALL";
  stateKegiatan.pengendaliFilter?.tutup(false);

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = "ALL";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = stateKegiatan.filterStatus;

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

export function sinkronkanJendelaTanggalKegiatan(tahun, bulanIndex) {
  sinkronkanJendelaData(tahun, bulanIndex, {
    onData: () => {
      tampilkanGalatHalamanKegiatan("");
      renderDaftarKegiatan();
      renderCatatanTerkaitDiDetailModal();
      stateKegiatan.dialogKelolaKategoriCtrl?.segarkanTampilan();
    },
    onGalat: (pesan) => {
      tampilkanGalatHalamanKegiatan(pesan);
      renderDaftarKegiatan();
    }
  });
}

export function initHalamanKegiatan() {
  pastikanKerangkaHalamanKegiatan();
  stateKegiatan.pengendaliFilter = initFilterPanel(document.getElementById("kegiatan-toolbar"));
  if (stateKegiatan.antarmukaSudahDiikat) return;
  stateKegiatan.antarmukaSudahDiikat = true;

  stateKegiatan.dialogKelolaKategoriCtrl = inisialisasiDialogKelolaKategori({
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
        stateKegiatan.idKegiatanTerakhirDiklik = kandidat;
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
        stateKegiatan.idKegiatanDetailAktif = "";
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
        const kegId = btn.getAttribute("data-kegiatan-id") || stateKegiatan.idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        bukaModalCatatanSingkat(null, {
          kegiatanId: keg ? keg.id : "",
          tanggal: keg && parseTanggal(keg.tanggal) ? keg.tanggal : hariIni()
        });
      } else if (aksi === "buat-notulensi") {
        const kegId = btn.getAttribute("data-kegiatan-id") || stateKegiatan.idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        if (keg) picuBuatNotulensiUntukKegiatan(keg);
      } else if (aksi === "edit-singkat") {
        const catId = btn.getAttribute("data-catatan-id") || "";
        const kegId = stateKegiatan.idKegiatanDetailAktif;
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
  if (btnKelolaKat) btnKelolaKat.addEventListener("click", () => stateKegiatan.dialogKelolaKategoriCtrl?.buka());

  const btnTambah = document.getElementById("btn-tambah-kegiatan");
  if (btnTambah) btnTambah.addEventListener("click", () => bukaModalFormKegiatan(null));

  const searchInput = document.getElementById("kegiatan-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      stateKegiatan.kataKunciCari = searchInput.value;
      renderDaftarKegiatan();
    });
  }

  const filterKatSelect = document.getElementById("kegiatan-filter-kategori");
  if (filterKatSelect) {
    filterKatSelect.addEventListener("change", () => {
      stateKegiatan.filterKategoriId = filterKatSelect.value;
      renderDaftarKegiatan();
    });
  }

  const filterStatusSelect = document.getElementById("kegiatan-filter-status");
  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", () => {
      stateKegiatan.filterStatus = filterStatusSelect.value;
      renderDaftarKegiatan();
    });
  }

  const sortSelect = document.getElementById("kegiatan-sort-tanggal");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      stateKegiatan.urutanTanggal = sortSelect.value === "desc" ? "desc" : "asc";
      renderDaftarKegiatan();
    });
  }

  const listRegion = document.getElementById("kegiatan-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action], #btn-muat-lebih-kegiatan") : null;
      if (!btn) return;

      if (btn.id === "btn-muat-lebih-kegiatan") {
        muatLebihBanyakKegiatan({
          onMulai: () => renderDaftarKegiatan(),
          onSelesai: () => renderDaftarKegiatan(),
          onGalat: (pesan) => tampilkanGalatHalamanKegiatan(pesan)
        });
        return;
      }

      const aksi = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const item = getDaftarKegiatan().find((k) => k.id === id);
      if (!item) return;

      if (aksi === "detail-kegiatan") {
        stateKegiatan.idKegiatanDetailAktif = item.id;
        stateKegiatan.idKegiatanTerakhirDiklik = item.id;
        if (typeof stateKegiatan.pembukaDetailKegiatanFn === "function") {
          stateKegiatan.pembukaDetailKegiatanFn(item.id);
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
        // Segarkan tampilan kartu seketika agar badge status dan kelas kartu terpasang
        renderDaftarKegiatan();
      } catch (err) {
        console.error("Gagal mengubah status kegiatan:", err);
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
        renderDaftarKegiatan();
      } finally {
        select.disabled = false;
      }
    });
  }

  inisialisasiFormKegiatan();
  inisialisasiDialogHapusKegiatan();

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (stateKegiatan.hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusKegiatan(true);
    } else if (stateKegiatan.formModalTerbuka) {
      e.preventDefault();
      tutupModalFormKegiatan(true);
    }
  });
}

export function subscribeKegiatan() {
  unsubscribeKegiatan();
  initHalamanKegiatan();
  stateKegiatan.sudahDimuatPertamaKali = false;
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
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir, {
    onData: () => {
      tampilkanGalatHalamanKegiatan("");
      renderDaftarKegiatan();
      renderCatatanTerkaitDiDetailModal();
      stateKegiatan.dialogKelolaKategoriCtrl?.segarkanTampilan();
    },
    onGalat: (pesan) => {
      tampilkanGalatHalamanKegiatan(pesan);
      renderDaftarKegiatan();
    }
  });

  // Inisialisasi listener daftar halaman kegiatan
  mulaiLanggananHalamanKegiatan({
    onData: () => {
      renderDaftarKegiatan();
    },
    onGalat: (pesan) => {
      tampilkanGalatHalamanKegiatan(pesan);
    }
  });

  return () => unsubscribeKegiatan();
}

export function unsubscribeKegiatan() {
  if (typeof stateKegiatan.unsubscribeJendela === "function") {
    try { stateKegiatan.unsubscribeJendela(); } catch (_e) {}
    stateKegiatan.unsubscribeJendela = null;
  }
  if (typeof stateKegiatan.unsubscribeHalaman === "function") {
    try { stateKegiatan.unsubscribeHalaman(); } catch (_e) {}
    stateKegiatan.unsubscribeHalaman = null;
  }

  manajerKategoriKegiatan.unsubscribe();
  stateKegiatan.petaJendela.clear();
  stateKegiatan.petaHalaman.clear();
  stateKegiatan.petaTambahan.clear();
  stateKegiatan.lastDocHalaman = null;
  stateKegiatan.adaLebihBanyakHalaman = false;
  stateKegiatan.sedangMuatLebihBanyak = false;
  stateKegiatan.jendelaAwalAktif = "";
  stateKegiatan.jendelaAkhirAktif = "";

  stateKegiatan.sudahDimuatPertamaKali = false;
  stateKegiatan.idKegiatanDetailAktif = "";
  stateKegiatan.idKegiatanTerakhirDiklik = "";

  stateKegiatan.pengendaliFilter?.tutup(false);
  tutupModalFormKegiatan(false);
  tutupDialogHapusKegiatan(false);
  stateKegiatan.dialogKelolaKategoriCtrl?.tutup(false);
  beritahuPerubahanKegiatan();
}