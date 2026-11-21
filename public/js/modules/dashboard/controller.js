/**
 * Pengendali (Controller) Modul Dashboard (Tahap 3a: dipisah dari app.js)
 * Memasang listener klik pada panel dashboard, mengatur perpindahan halaman,
 * mode tampilan, dan langganan perubahan data. Delegasi render ke view.js.
 */
import { hariIni } from "../../util-tanggal.js";
import { pindahKeBagian } from "../../sidebar.js";
import { tampilkanToast } from "../../shared/toast.js";
import {
  bukaModalFormKegiatan,
  onPerubahanKegiatan,
} from "../../kegiatan.js";
import {
  onPerubahanDokumen,
  bukaModalUnggahDokumen,
} from "../../modules/dokumen/index.js";
import {
  onPerubahanCatatan,
  sorotCatatanDiHalaman,
} from "../../catatan.js";
import {
  bukaJadwalPadaTanggal,
  bukaDialogDetailKegiatan,
} from "../../jadwal.js";
import {
  eksporSeluruhDataJson,
  tundaPengingatCadangan,
  onPerubahanCadangan,
} from "../pengaturan/index.js";
import { renderHalamanSampah, jalankanPembersihanSampahOtomatis } from "../../sampah.js";
import {
  setModeTampilanHariIni,
  dashboardSudahDiikat,
  tandaiDashboardSudahDiikat,
} from "./state.js";
import {
  renderDashboard as renderDashboardInti,
  renderKartuDokumenDashboard,
  renderKartuCatatanDashboard,
  perbaruiBannerPengingatCadangan,
} from "./view.js";

/**
 * Render dashboard dengan callback pembuka detail kegiatan.
 */
function render() {
  renderDashboardInti({ bukaDetailKegiatan: bukaDialogDetailKegiatan });
}

/**
 * Render ulang dashboard (pintu publik untuk modul lain, mis. app.js).
 * Callback pembuka detail kegiatan sudah disuntikkan di sini, sehingga
 * pemanggil tidak perlu tahu detail internal maupun mengimpor jadwal.js.
 */
export function renderDashboard() {
  render();
}

/**
 * Menangani klik di dalam panel dashboard (delegasi event).
 * @param {MouseEvent} e
 */
function tanganiKlikDashboard(e) {
  const targetEl = e.target instanceof Element ? e.target : null;
  if (!targetEl) return;

  if (targetEl.closest("#btn-dashboard-buka-jadwal")) {
    pindahKeBagian("jadwal");
    return;
  }
  if (targetEl.closest("#btn-dashboard-tambah-kegiatan")) {
    bukaModalFormKegiatan(null, hariIni());
    return;
  }

  if (targetEl.closest("#btn-backup-reminder-export")) {
    eksporSeluruhDataJson();
    return;
  }

  if (targetEl.closest("#btn-backup-reminder-snooze")) {
    tundaPengingatCadangan(3);
    perbaruiBannerPengingatCadangan();
    tampilkanToast("Pengingat cadangan ditunda selama 3 hari.", "info");
    return;
  }

  const btnViewSwitch = targetEl.closest("button[data-dash-view]");
  if (btnViewSwitch) {
    const viewMode = btnViewSwitch.getAttribute("data-dash-view");
    if (viewMode === "timeline" || viewMode === "daftar") {
      setModeTampilanHariIni(viewMode);
      render();
    }
    return;
  }

  const btnAksi = targetEl.closest("button[data-dash-action]");
  if (!btnAksi) return;

  const aksi = btnAksi.getAttribute("data-dash-action");
  if (aksi === "tambah-hari-ini") bukaModalFormKegiatan(null, hariIni());
  else if (aksi === "jadwal-hari-ini") bukaJadwalPadaTanggal(hariIni());
  else if (aksi === "buka-jadwal") pindahKeBagian("jadwal");
  else if (aksi === "buka-catatan") pindahKeBagian("catatan");
  else if (aksi === "buat-catatan") {
    pindahKeBagian("catatan");
    requestAnimationFrame(() => {
      document.getElementById("btn-tambah-catatan-singkat")?.focus();
    });
  } else if (aksi === "buka-catatan-item") {
    const id = btnAksi.getAttribute("data-id") || "";
    pindahKeBagian("catatan");
    if (id) sorotCatatanDiHalaman(id);
  } else if (aksi === "detail-kegiatan") {
    const id = btnAksi.getAttribute("data-id") || "";
    if (id) bukaDialogDetailKegiatan(id);
  } else if (aksi === "unggah-dokumen") {
    pindahKeBagian("dokumen");
    bukaModalUnggahDokumen();
  } else if (aksi === "buka-dokumen") {
    pindahKeBagian("dokumen");
  }
}

/**
 * Inisialisasi halaman dashboard: pasang listener (sekali) dan render awal.
 */
export function initHalamanDashboard() {
  render();
  if (dashboardSudahDiikat) return;
  tandaiDashboardSudahDiikat();

  const panel = document.getElementById("section-dashboard");
  if (panel) {
    panel.addEventListener("click", tanganiKlikDashboard);
  }

  onPerubahanKegiatan(() => {
    render();
    renderHalamanSampah();
    jalankanPembersihanSampahOtomatis();
  });
  onPerubahanDokumen(() => {
    renderKartuDokumenDashboard();
    perbaruiBannerPengingatCadangan();
  });
  onPerubahanCatatan(() => {
    renderKartuCatatanDashboard();
    perbaruiBannerPengingatCadangan();
    renderHalamanSampah();
    jalankanPembersihanSampahOtomatis();
  });
  onPerubahanCadangan(() => perbaruiBannerPengingatCadangan());
  render();
}
