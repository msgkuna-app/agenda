/**
 * Pengelola Tema Tampilan (Terang / Gelap / Ikuti Sistem) — Aturan #14
 * Menyimpan preferensi di localStorage dan memperbarui atribut data-theme pada <html>.
 */

const STORAGE_KEY_TEMA = "agenda_arsip_tema";

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
    meta.setAttribute("content", efektif === "dark" ? "#162836" : "#0069a8");    
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
