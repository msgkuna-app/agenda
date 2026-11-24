/**
 * Navigasi Antar Bagian (Tahap 7b)
 * Pemilik tunggal state navigasi: bagian aktif dan callback pergantian bagian.
 * Berisi pula perakitan kerangka awal (daftar tombol sidebar + panel konten kosong).
 */

import { MENU_SECTIONS } from "./menu-bagian.js";
import { escapeHtml } from "../util-html.js";
import { tutupDrawerMobile } from "./drawer.js";
import { gulirAreaKontenKeAtas } from "./gulir.js";

let activeSectionId = "kegiatan";
let onNavigateCallback = null;

/**
 * Menyiapkan state navigasi dari initSidebar(). Hanya dipanggil sekali saat inisialisasi.
 * @param {{ initialSection?: string, onSectionChange?: (id: string) => void }} [options]
 */
export function konfigurasiNavigasi(options = {}) {
  if (options.initialSection) {
    activeSectionId = options.initialSection;
  }
  onNavigateCallback = options.onSectionChange || null;
}

/**
 * Berpindah halaman bagian aplikasi dan mengembalikan gulungan area konten utama ke atas.
 * @param {string} sectionId
 */
export function pindahKeBagian(sectionId) {
  const ditemukan = MENU_SECTIONS.find((m) => m.id === sectionId) || MENU_SECTIONS[0];
  const berpindahBagian = activeSectionId !== ditemukan.id;
  activeSectionId = ditemukan.id;

  const judulHeader = document.getElementById("header-page-title");
  if (judulHeader) {
    judulHeader.textContent = ditemukan.label;
  }

  document.querySelectorAll(".nav-link[data-section]").forEach((btn) => {
    const aktif = btn.getAttribute("data-section") === activeSectionId;
    btn.classList.toggle("is-active", aktif);
    if (aktif) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  });

  document.querySelectorAll(".content-section[data-section-panel]").forEach((panel) => {
    const aktif = panel.getAttribute("data-section-panel") === activeSectionId;
    panel.hidden = !aktif;
  });

  tutupDrawerMobile(false);
  if (berpindahBagian) {
    gulirAreaKontenKeAtas();
  }

  if (typeof onNavigateCallback === "function") {
    onNavigateCallback(activeSectionId);
  }
}

export function getActiveSectionId() {
  return activeSectionId;
}

/**
 * Merakit daftar tombol sidebar dan panel konten yang belum ada.
 * Dipanggil sekali dari initSidebar() sebelum pindahKeBagian() pertama.
 */
export function renderKerangkaBagianAwal() {
  const navList = document.getElementById("sidebar-nav-list");
  const container = document.getElementById("main-sections-container");

  if (navList) {
    navList.innerHTML = MENU_SECTIONS.map(
      (item) => `
        <li>
          <button
            type="button"
            class="nav-link${item.id === activeSectionId ? " is-active" : ""}"
            data-section="${escapeHtml(item.id)}"
            data-tooltip="${escapeHtml(item.label)}"
            title="${escapeHtml(item.label)}"
            ${item.id === activeSectionId ? 'aria-current="page"' : ""}
          >
            <span class="nav-icon">${item.svg}</span>
            <span class="nav-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
          </button>
        </li>
      `
    ).join("");
  }

  if (container) {
    MENU_SECTIONS.forEach((item) => {
      let panel = document.getElementById(`section-${item.id}`);
      if (!panel) {
        panel = document.createElement("section");
        panel.id = `section-${item.id}`;
        panel.className = "content-section";
        panel.setAttribute("data-section-panel", item.id);
        panel.hidden = item.id !== activeSectionId;
        container.appendChild(panel);
      }
    });
  }
}
