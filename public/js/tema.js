/**
 * Pengelola Tema Tampilan (Terang / Gelap / Ikuti Sistem) — Aturan #14
 * Menyimpan preferensi di localStorage dan memperbarui atribut data-theme pada <html>.
 */

import { STORAGE_KEY_TEMA } from "./config/constants.js";

/**
 * Warna bilah peramban (meta theme-color).
 * Nilai ini WAJIB sama dengan pasangan warna di js/boot-tema.js (skrip klasik yang tidak
 * bisa mengimpor) dan dengan "theme_color" di manifest.webmanifest + meta di index.html.
 */
export const WARNA_TEMA_TERANG = "#0B5FA5";
export const WARNA_TEMA_GELAP = "#0f172a";

/**
 * Membaca preferensi tema tersimpan.
 * @returns {"light" | "dark" | "system"}
 */
export function getPreferensiTema() {
  try {
    const val = localStorage.getItem(STORAGE_KEY_TEMA);
    if (val === "light" || val === "dark" || val === "system") {
      return val;
    }
  } catch (_e) {
    // Abaikan kendala akses localStorage
  }
  return "system";
}

/**
 * Menerapkan tema ke elemen <html>, meta theme-color, dan tombol pemilih.
 * @param {"light" | "dark" | "system"} pilihan
 */
export function terapkanTema(pilihan) {
  const pref = pilihan === "light" || pilihan === "dark" ? pilihan : "system";
  const root = document.documentElement;
  const gelapSistem =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const efektif = pref === "system" ? (gelapSistem ? "dark" : "light") : pref;

  if (pref === "light" || pref === "dark") {
    root.setAttribute("data-theme", pref);
  } else {
    root.removeAttribute("data-theme");
  }
  root.style.colorScheme = efektif;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      efektif === "dark" ? WARNA_TEMA_GELAP : WARNA_TEMA_TERANG,
    );
  }

  const semuaTombol = document.querySelectorAll(".theme-choice-btn[data-theme-choice]");
  semuaTombol.forEach((btn) => {
    const aktif = btn.getAttribute("data-theme-choice") === pref;
    btn.classList.toggle("is-active", aktif);
    btn.setAttribute("aria-pressed", aktif ? "true" : "false");
  });
}

/**
 * Menginisialisasi pemilih tema dan pendengar perubahan skema warna sistem.
 */
export function initTema() {
  const awal = getPreferensiTema();
  terapkanTema(awal);

  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target.closest(".theme-choice-btn[data-theme-choice]") : null;
    if (!target) return;
    const nilai = target.getAttribute("data-theme-choice");
    if (nilai !== "light" && nilai !== "dark" && nilai !== "system") return;
    try {
      localStorage.setItem(STORAGE_KEY_TEMA, nilai);
    } catch (_err) {
      // Abaikan kendala akses localStorage
    }
    terapkanTema(nilai);
  });

  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const sinkronSistem = () => {
      if (getPreferensiTema() === "system") {
        terapkanTema("system");
      }
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sinkronSistem);
    }
  }
}
