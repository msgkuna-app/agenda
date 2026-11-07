/**
 * Modul Utama Pengendali Dokumen (Entry Point & Re-Export)
 * Mengorkestrasi inisialisasi antarmuka, delegasi event DOM, dan menyediakan fasad ekspor (Fase 7C)
 */
import { inisialisasiDialogKelolaKategori } from "../kategori.js";
import { onPerubahanKegiatan } from "../kegiatan.js";
import { initFilterPanel } from "../filter-panel.js";
import { stateDokumen, getDaftarDokumen, beritahuPerubahanDokumen } from "./state.js";
import {
  manajerKategoriDokumen,
  hitungDokumenPemakaiServer,
  daftarkanAksiRenderDokumen
} from "./data.js";
import { buatOpsiDriveKategoriDokumen } from "./drive-ops.js";
import {
  pastikanKerangkaHalamanDokumen,
  renderDaftarDokumen,
  perbaruiDropdownKategoriDokumen,
  tampilkanGalatHalamanDokumen,
  terapkanFilterKategoriDokumen,
  tutupMenuTitikTigaDokumen,
  perbaruiStatusJaringanDokumen
} from "./render.js";
import {
  bukaModalUnggahDokumen,
  tutupModalUnggahDokumen,
  inisialisasiDialogUnggah
} from "./dialog-unggah.js";
import {
  bukaModalEditDokumen,
  tutupModalEditDokumen,
  inisialisasiDialogEdit
} from "./dialog-edit.js";
import {
  bukaDialogHapusDokumen,
  tutupDialogHapusDokumen,
  inisialisasiDialogHapus
} from "./dialog-hapus.js";
import {
  bukaModalRapikanDokumen,
  tutupModalRapikanDokumen,
  inisialisasiDialogRapikan
} from "./dialog-rapikan.js";
import { muatLebihBanyakDokumen } from "./data.js";

// Daftarkan aksi render ke data.js untuk memutus siklus dependensi
daftarkanAksiRenderDokumen({
  renderDaftarDokumen,
  perbaruiDropdownKategoriDokumen,
  tampilkanGalatHalamanDokumen,
  initHalamanDokumen
});

/**
 * Menginisialisasi seluruh antarmuka arsip dokumen, toolbar, dan pendengar event.
 */
export function initHalamanDokumen() {
  pastikanKerangkaHalamanDokumen();
  stateDokumen.pengendaliFilterDokumen = initFilterPanel(
    document.getElementById("dokumen-toolbar")
  );
  perbaruiStatusJaringanDokumen();

  if (stateDokumen.antarmukaSudahDiikat) return;
  stateDokumen.antarmukaSudahDiikat = true;

  stateDokumen.dialogKelolaKategoriDokCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriDokumen,
    hitungPemakaiLokal: hitungDokumenPemakaiServer,
    onLihatItemKategori: (katId) => terapkanFilterKategoriDokumen(katId),
    judulDialog: "Kelola Kategori Dokumen",
    opsiDrive: buatOpsiDriveKategoriDokumen()
  });

  manajerKategoriDokumen.onChange(() => {
    perbaruiDropdownKategoriDokumen();
    renderDaftarDokumen();
    beritahuPerubahanDokumen();
  });

  onPerubahanKegiatan(() => {
    renderDaftarDokumen();
  });

  document.getElementById("btn-kelola-kategori-dokumen")?.addEventListener("click", () => {
    stateDokumen.dialogKelolaKategoriDokCtrl?.buka();
  });

  document.getElementById("btn-unggah-dokumen")?.addEventListener("click", () => {
    bukaModalUnggahDokumen();
  });

  document.getElementById("btn-rapikan-dokumen-drive")?.addEventListener("click", () => {
    bukaModalRapikanDokumen();
  });

  const searchInput = document.getElementById("dokumen-search-input");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener("input", () => {
      stateDokumen.kataKunciCari = searchInput.value;
      stateDokumen.batasTampil = 40;
      renderDaftarDokumen();
    });
  }

  const filterKatSelect = document.getElementById("dokumen-filter-kategori");
  if (filterKatSelect instanceof HTMLSelectElement) {
    filterKatSelect.addEventListener("change", () => {
      stateDokumen.filterKategoriId = filterKatSelect.value;
      stateDokumen.batasTampil = 40;
      renderDaftarDokumen();
    });
  }

  const sortFieldSelect = document.getElementById("dokumen-sort-field");
  if (sortFieldSelect instanceof HTMLSelectElement) {
    sortFieldSelect.addEventListener("change", () => {
      const val = sortFieldSelect.value;
      stateDokumen.urutBerdasarkan = val === "nama" || val === "ukuran" ? val : "tanggal";
      renderDaftarDokumen();
    });
  }

  const sortDirSelect = document.getElementById("dokumen-sort-dir");
  if (sortDirSelect instanceof HTMLSelectElement) {
    sortDirSelect.addEventListener("change", () => {
      stateDokumen.arahUrutan = sortDirSelect.value === "asc" ? "asc" : "desc";
      renderDaftarDokumen();
    });
  }

  const listRegion = document.getElementById("dokumen-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("#btn-tampil-lebih-dokumen")) {
        stateDokumen.batasTampil += 40;
        renderDaftarDokumen();
        return;
      }

      if (target.closest("#btn-muat-server-dokumen")) {
        muatLebihBanyakDokumen();
        return;
      }

      const btnAksi = target.closest("button[data-doc-action]");
      if (!btnAksi) return;

      const aksi = btnAksi.getAttribute("data-doc-action");
      const id = btnAksi.getAttribute("data-id") || "";

      if (aksi === "toggle-menu") {
        e.stopPropagation();
        const menuEl = document.getElementById(`doc-menu-${id}`);
        if (!menuEl) return;
        const sedangBuka = stateDokumen.idMenuTitikTigaTerbuka === id && !menuEl.hidden;
        tutupMenuTitikTigaDokumen();
        if (!sedangBuka) {
          stateDokumen.idMenuTitikTigaTerbuka = id;
          menuEl.hidden = false;
          btnAksi.setAttribute("aria-expanded", "true");
        }
        return;
      }

      tutupMenuTitikTigaDokumen();
      const dok = getDaftarDokumen().find((d) => d.id === id);
      if (!dok) return;

      if (aksi === "edit") {
        bukaModalEditDokumen(dok);
      } else if (aksi === "delete") {
        bukaDialogHapusDokumen(dok);
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!stateDokumen.idMenuTitikTigaTerbuka) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(".doc-mobile-kebab-wrap")) return;
    tutupMenuTitikTigaDokumen();
  });

  // Inisialisasi pendengar event seluruh dialog
  inisialisasiDialogUnggah();
  inisialisasiDialogEdit();
  inisialisasiDialogHapus();
  inisialisasiDialogRapikan();

  // Pengendali pintasan tombol Escape untuk menutup menu atau modal aktif
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (stateDokumen.idMenuTitikTigaTerbuka) {
      e.preventDefault();
      tutupMenuTitikTigaDokumen();
    } else if (stateDokumen.hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusDokumen(true);
    } else if (stateDokumen.editModalTerbuka) {
      e.preventDefault();
      tutupModalEditDokumen(true);
    } else if (stateDokumen.unggahModalTerbuka && !stateDokumen.pengendaliUnggahAktif) {
      e.preventDefault();
      tutupModalUnggahDokumen(true);
    } else if (stateDokumen.rapikanModalTerbuka && !stateDokumen.sedangMerapikan) {
      e.preventDefault();
      tutupModalRapikanDokumen(true);
    }
  });

  window.addEventListener("online", perbaruiStatusJaringanDokumen);
  window.addEventListener("offline", perbaruiStatusJaringanDokumen);
}

// Re-export lengkap 19 simbol publik untuk kompatibilitas penuh aplikasi
export {
  MAKS_UKURAN_BERKAS_MB,
  UKURAN_HALAMAN_DOKUMEN,
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime
} from "./util.js";

export {
  getDaftarDokumen,
  isDokumenSudahDimuat,
  onPerubahanDokumen
} from "./state.js";

export {
  manajerKategoriDokumen,
  hitungDokumenPemakaiServer,
  muatLebihBanyakDokumen,
  ambilSemuaDokumenSekaliPakai,
  subscribeDokumen,
  unsubscribeDokumen
} from "./data.js";

export { sinkronkanSatuFolderKategoriDokumen } from "./drive-ops.js";

export {
  perbaruiStatusJaringanDokumen,
  terapkanFilterKategoriDokumen
} from "./render.js";

export { bukaModalUnggahDokumen } from "./dialog-unggah.js";
