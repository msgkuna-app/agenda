/**
 * Modul Utama Halaman Laporan (Index & Re-ekspor)
 * Mengkoordinasikan inisialisasi antarmuka, penangan event pengguna,
 * langganan data Firestore real-time & kategori, serta mengekspor seluruh API publik modul laporan.
 */
import {
  getFirestoreDb,
  collection,
  onSnapshot,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import {
  loginWithGoogle,
  formatPesanGalatAuth
} from "../auth.js";
import {
  manajerKategoriKegiatan,
  onPerubahanKegiatan
} from "../kegiatan.js";
import {
  manajerKategoriDokumen,
  onPerubahanDokumen
} from "../dokumen.js";
import { onPerubahanCatatan } from "../catatan.js";

import {
  DAFTAR_JENIS_LAPORAN
} from "./util.js";
import {
  stateLaporan,
  getDaftarLaporan,
  isLaporanSudahDimuat,
  resetFilterKeBulanIni
} from "./state.js";
import {
  pastikanDataLaporanTersedia,
  setNotifikasiLaporanHandler,
  unduhLaporanSebagaiCsv
} from "./data.js";
import {
  buatLaporanKeGoogleSheets,
  setSheetsUiHandlers
} from "./sheets-ops.js";
import {
  tampilkanNotifikasiLaporan,
  perbaruiStatusTombolLaporan,
  perbaruiStatusJaringanLaporan,
  sinkronkanDropdownKategoriLaporan,
  renderPratinjauLaporan,
  renderRiwayatLaporan,
  pastikanKerangkaHalamanLaporan
} from "./render.js";
import {
  bukaModalHapusRiwayat,
  tutupModalHapusRiwayat,
  konfirmasiHapusRiwayatLaporan
} from "./dialog-hapus.js";

// Sambungkan notifier dan status updater antarmuka
setNotifikasiLaporanHandler(tampilkanNotifikasiLaporan);
setSheetsUiHandlers({
  updateStatusTombol: perbaruiStatusTombolLaporan,
  beriNotifikasi: tampilkanNotifikasiLaporan
});

// Re-ekspor seluruh API publik untuk modul eksternal
export {
  DAFTAR_JENIS_LAPORAN,
  getDaftarLaporan,
  isLaporanSudahDimuat,
  pastikanDataLaporanTersedia,
  perbaruiStatusJaringanLaporan
};

export function initHalamanLaporan() {
  pastikanKerangkaHalamanLaporan();
  if (stateLaporan.antarmukaSudahDiikat) return;
  stateLaporan.antarmukaSudahDiikat = true;

  const panel = document.getElementById("section-laporan");
  if (panel) {
    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.id === "laporan-jenis-select" && target instanceof HTMLSelectElement) {
        stateLaporan.jenisAktif = target.value;
        stateLaporan.filterKategori = "ALL";
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
      } else if (target.id === "laporan-filter-kategori" && target instanceof HTMLSelectElement) {
        stateLaporan.filterKategori = target.value || "ALL";
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-dari" && target instanceof HTMLInputElement) {
        stateLaporan.tanggalDari = target.value;
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-sampai" && target instanceof HTMLInputElement) {
        stateLaporan.tanggalSampai = target.value;
        renderPratinjauLaporan();
      }
    });

    panel.addEventListener("click", async (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      if (targetEl.closest("#btn-laporan-buat-sheets")) {
        await buatLaporanKeGoogleSheets();
        return;
      }
      if (targetEl.closest("#btn-laporan-unduh-csv")) {
        unduhLaporanSebagaiCsv();
        return;
      }
      if (targetEl.closest("#btn-laporan-reset-filter")) {
        resetFilterKeBulanIni();
        const inpDari = document.getElementById("laporan-tanggal-dari");
        const inpSampai = document.getElementById("laporan-tanggal-sampai");
        if (inpDari instanceof HTMLInputElement) inpDari.value = stateLaporan.tanggalDari;
        if (inpSampai instanceof HTMLInputElement) inpSampai.value = stateLaporan.tanggalSampai;
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
        return;
      }

      const btnAction = targetEl.closest("[data-laporan-action]");
      if (!btnAction) return;
      const aksi = btnAction.getAttribute("data-laporan-action");

      if (aksi === "dismiss-feedback") {
        tampilkanNotifikasiLaporan({ pesan: "" });
      } else if (aksi === "relogin") {
        if (btnAction instanceof HTMLButtonElement) {
          btnAction.disabled = true;
          btnAction.textContent = "Memuat...";
        }
        try {
          await loginWithGoogle();
          tampilkanNotifikasiLaporan({
            pesan: "Sesi akses Google berhasil diperbarui. Silakan klik \"Buat Laporan\" kembali.",
            tipe: "success"
          });
        } catch (err) {
          tampilkanNotifikasiLaporan({
            pesan: formatPesanGalatAuth(err),
            tipe: "danger",
            butuhRelogin: true
          });
        }
      } else if (aksi === "hapus-riwayat") {
        const id = btnAction.getAttribute("data-id") || "";
        if (id) bukaModalHapusRiwayat(id);
      }
    });
  }

  const modalHapus = document.getElementById("laporan-delete-modal");
  const btnBatalHapus = document.getElementById("laporan-delete-cancel-btn");
  const btnKonfirmasiHapus = document.getElementById("laporan-delete-confirm-btn");

  if (btnBatalHapus) btnBatalHapus.addEventListener("click", () => tutupModalHapusRiwayat(true));
  if (btnKonfirmasiHapus) btnKonfirmasiHapus.addEventListener("click", () => konfirmasiHapusRiwayatLaporan());
  if (modalHapus) {
    modalHapus.addEventListener("click", (e) => {
      if (e.target === modalHapus) tutupModalHapusRiwayat(true);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!stateLaporan.hapusRiwayatModalTerbuka) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupModalHapusRiwayat(true);
    }
  });

  onPerubahanKegiatan(() => {
    if (
      stateLaporan.jenisAktif === "kegiatan" ||
      stateLaporan.jenisAktif === "rekap-status" ||
      stateLaporan.jenisAktif === "dokumen" ||
      stateLaporan.jenisAktif === "catatan"
    ) {
      renderPratinjauLaporan();
    }
  });
  onPerubahanDokumen(() => {
    if (stateLaporan.jenisAktif === "dokumen") renderPratinjauLaporan();
  });
  onPerubahanCatatan(() => {
    if (stateLaporan.jenisAktif === "catatan") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  renderPratinjauLaporan();
  renderRiwayatLaporan();
}

export function subscribeLaporan() {
  unsubscribeLaporan();
  pastikanKerangkaHalamanLaporan();

  stateLaporan.unsubKategoriKeg = manajerKategoriKegiatan.onChange(() => {
    if (stateLaporan.jenisAktif === "kegiatan" || stateLaporan.jenisAktif === "rekap-status") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  stateLaporan.unsubKategoriDok = manajerKategoriDokumen.onChange(() => {
    if (stateLaporan.jenisAktif === "dokumen") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  const db = getFirestoreDb();
  stateLaporan.unsubscribeSnapshotLaporan = onSnapshot(
    collection(db, "laporan"),
    (snapshot) => {
      stateLaporan.daftarRiwayatLaporan = snapshot.docs.map((dok) => {
        const d = dok.data() || {};
        return {
          id: dok.id,
          nama: String(d.nama || ""),
          jenis: String(d.jenis || "kegiatan"),
          jenisLabel: String(d.jenisLabel || ""),
          tautan: String(d.tautan || ""),
          sheetId: String(d.sheetId || ""),
          rentangTanggal: String(d.rentangTanggal || ""),
          tanggalDari: String(d.tanggalDari || ""),
          tanggalSampai: String(d.tanggalSampai || ""),
          jumlahBaris: Number.isFinite(Number(d.jumlahBaris)) ? Number(d.jumlahBaris) : 0,
          createdAt: String(d.createdAt || "")
        };
      });
      stateLaporan.riwayatSudahDimuat = true;
      renderRiwayatLaporan();
    },
    (err) => {
      stateLaporan.riwayatSudahDimuat = true;
      tampilkanNotifikasiLaporan({
        pesan: formatPesanGalatFirestore(err),
        tipe: "danger"
      });
      renderRiwayatLaporan();
    }
  );

  renderPratinjauLaporan();
  return () => unsubscribeLaporan();
}

export function unsubscribeLaporan() {
  if (typeof stateLaporan.unsubscribeSnapshotLaporan === "function") {
    try { stateLaporan.unsubscribeSnapshotLaporan(); } catch (_e) {}
    stateLaporan.unsubscribeSnapshotLaporan = null;
  }
  if (typeof stateLaporan.unsubKategoriKeg === "function") {
    try { stateLaporan.unsubKategoriKeg(); } catch (_e) {}
    stateLaporan.unsubKategoriKeg = null;
  }
  if (typeof stateLaporan.unsubKategoriDok === "function") {
    try { stateLaporan.unsubKategoriDok(); } catch (_e) {}
    stateLaporan.unsubKategoriDok = null;
  }
  stateLaporan.daftarRiwayatLaporan = [];
  stateLaporan.riwayatSudahDimuat = false;
  tutupModalHapusRiwayat(false);
}