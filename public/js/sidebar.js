/**
 * Modul Navigasi Sidebar — perakit & inisialisasi (Tahap 7b)
 * Mematuhi Aturan #9, #13, #14 & Bagian A1, A2, A3, D, E.
 *
 * Berkas ini dulu berisi seluruh logika sidebar (452 baris). Pada Tahap 7b isinya dipecah
 * menurut tanggung jawab ke folder ./sidebar/ dan berkas ini kini menjadi dua hal saja:
 *   1. initSidebar() — satu-satunya pemasang pendengar (collapse, drawer, nav, logout, Esc);
 *   2. pintu re-export, supaya seluruh konsumen yang mengimpor dari "./sidebar.js"
 *      (main.js, jadwal.js, pencarian-global.js, dashboard/dokumen/kegiatan controller)
 *      tidak perlu diubah satu baris pun.
 *
 * Arah impor satu arah: sidebar.js -> sidebar/*.js -> (menu-bagian, gulir, util-html),
 * tanpa lingkaran.
 */

import { STORAGE_SIDEBAR_KEY } from "./config/constants.js";
import {
  pindahKeBagian,
  renderKerangkaBagianAwal,
  konfigurasiNavigasi,
  getActiveSectionId,
} from "./sidebar/navigasi.js";
import { bukaDrawerMobile, tutupDrawerMobile } from "./sidebar/drawer.js";
import { initTooltipSidebar } from "./sidebar/tooltip.js";
import { perbaruiStatusKoneksiSidebar } from "./sidebar/status-koneksi.js";

// Pintu re-export — jaga nama dan bentuknya; konsumen luar mengandalkan jalur ini.
export { MENU_SECTIONS } from "./sidebar/menu-bagian.js";
export { getElemenScrollUtama, gulirAreaKontenKeAtas } from "./sidebar/gulir.js";
export { perbaruiInfoAkunSidebar } from "./sidebar/akun.js";
export { perbaruiStatusKoneksiSidebar };
export { bukaDrawerMobile, tutupDrawerMobile };
export { pindahKeBagian, getActiveSectionId };

/**
 * Menginisialisasi sidebar, tombol ciutkan, drawer HP, dan navigasi antar bagian.
 * @param {{ onLogoutRequest?: (triggerEl?: HTMLElement | null) => void, onSectionChange?: (id: string) => void, initialSection?: string }} [options]
 */
export function initSidebar(options = {}) {
  konfigurasiNavigasi(options);
  renderKerangkaBagianAwal();

  const root = document.documentElement;
  const btnCollapse = document.getElementById("sidebar-collapse-btn");
  const sinkronTombolCollapse = () => {
    const collapsed = root.getAttribute("data-sidebar") === "collapsed";
    if (btnCollapse) {
      btnCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const label = collapsed ? "Perluas bilah sisi" : "Ciutkan bilah sisi";
      btnCollapse.setAttribute("aria-label", label);
      btnCollapse.setAttribute("title", label);
    }
  };
  sinkronTombolCollapse();

  if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
      const sekarang = root.getAttribute("data-sidebar") === "collapsed" ? "expanded" : "collapsed";
      root.setAttribute("data-sidebar", sekarang);
      try {
        localStorage.setItem(STORAGE_SIDEBAR_KEY, sekarang);
      } catch (_e) {
        // Abaikan kendala localStorage
      }
      sinkronTombolCollapse();
    });
  }

  const btnMenuMobile = document.getElementById("mobile-menu-btn");
  const btnTutupMobile = document.getElementById("sidebar-mobile-close-btn");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (btnMenuMobile) {
    btnMenuMobile.addEventListener("click", () => bukaDrawerMobile());
  }
  if (btnTutupMobile) {
    btnTutupMobile.addEventListener("click", () => tutupDrawerMobile(true));
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => tutupDrawerMobile(true));
  }

  const navList = document.getElementById("sidebar-nav-list");
  if (navList) {
    navList.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".nav-link[data-section]") : null;
      if (!btn) return;
      const tujuan = btn.getAttribute("data-section");
      if (tujuan) pindahKeBagian(tujuan);
    });
  }

  const btnLogout = document.getElementById("sidebar-logout-btn");
  if (btnLogout && typeof options.onLogoutRequest === "function") {
    btnLogout.addEventListener("click", () => {
      const pemicu = btnLogout;
      tutupDrawerMobile(false);
      options.onLogoutRequest(pemicu);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.getAttribute("data-drawer") === "open") {
      e.preventDefault();
      tutupDrawerMobile(true);
    }
  });

  perbaruiStatusKoneksiSidebar(navigator.onLine);
  initTooltipSidebar();
  pindahKeBagian(getActiveSectionId());
}
