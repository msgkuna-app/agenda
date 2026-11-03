/**
 * Pengelolaan Tema (Terang / Gelap / Ikuti Sistem)
 * Menyimpan pilihan ke localStorage "agenda_arsip_tema" dan menyelaraskan
 * atribut data-theme, color-scheme, serta <meta name="theme-color">.
 */

export const THEME_STORAGE_KEY = "agenda_arsip_tema";
export const THEME_COLORS = {
  light: "#1e40af",
  dark: "#0f172a"
};

let currentPreference = "system";
let mediaQueryList = null;
const listeners = new Set();

/**
 * Membaca preferensi tema dari localStorage secara aman.
 * @returns {"light" | "dark" | "system"}
 */
export function bacaPreferensiTema() {
  try {
    const tersimpan = localStorage.getItem(THEME_STORAGE_KEY);
    if (tersimpan === "light" || tersimpan === "dark" || tersimpan === "system") {
      return tersimpan;
    }
  } catch (_err) {
    // Abaikan jika penyimpanan diblokir
  }
  return "system";
}

/**
 * Menentukan tema efektif ("light" atau "dark") berdasarkan preferensi saat ini.
 * @param {"light" | "dark" | "system"} pref
 * @returns {"light" | "dark"}
 */
export function hitungTemaEfektif(pref) {
  if (pref === "light" || pref === "dark") {
    return pref;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

/**
 * Memperbarui DOM (data-theme, color-scheme, dan meta theme-color).
 * @param {"light" | "dark" | "system"} pref
 */
function terapkanKeDokumen(pref) {
  const root = document.documentElement;
  const efektif = hitungTemaEfektif(pref);

  if (pref === "light") {
    root.setAttribute("data-theme", "light");
  } else if (pref === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }

  root.style.colorScheme = efektif;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute(
      "content",
      efektif === "dark" ? THEME_COLORS.dark : THEME_COLORS.light
    );
  }

  perbaruiTombolPemilihTema(pref);

  for (const fn of listeners) {
    try {
      fn(pref, efektif);
    } catch (_err) {
      // Abaikan kesalahan callback eksternal
    }
  }
}

/**
 * Menyelaraskan status aria-pressed pada tombol pemilih tema di antarmuka.
 * @param {"light" | "dark" | "system"} pref
 */
function perbaruiTombolPemilihTema(pref) {
  const tombolList = document.querySelectorAll("[data-theme-choice]");
  tombolList.forEach((btn) => {
    const nilai = btn.getAttribute("data-theme-choice");
    const aktif = nilai === pref;
    btn.setAttribute("aria-pressed", aktif ? "true" : "false");
    btn.classList.toggle("is-active", aktif);
  });
}

/**
 * Mengatur preferensi tema baru dan menyimpannya ke localStorage.
 * @param {"light" | "dark" | "system"} pref
 */
export function setTema(pref) {
  const valid = pref === "light" || pref === "dark" || pref === "system" ? pref : "system";
  currentPreference = valid;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, valid);
  } catch (_err) {
    // Abaikan kegagalan tulis localStorage
  }
  terapkanKeDokumen(valid);
}

/**
 * Mengambil preferensi tema saat ini.
 * @returns {"light" | "dark" | "system"}
 */
export function getTema() {
  return currentPreference;
}

/**
 * Mendaftarkan pemantau perubahan tema.
 * @param {(pref: string, efektif: string) => void} callback
 * @returns {() => void}
 */
export function onPerubahanTema(callback) {
  if (typeof callback === "function") {
    listeners.add(callback);
  }
  return () => listeners.delete(callback);
}

/**
 * Inisialisasi sistem tema dan pasang event listener pada kontrol pemilih tema.
 */
export function initTema() {
  currentPreference = bacaPreferensiTema();
  terapkanKeDokumen(currentPreference);

  if (window.matchMedia) {
    mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (currentPreference === "system") {
        terapkanKeDokumen("system");
      }
    };
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handler);
    } else if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(handler);
    }
  }

  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-theme-choice]") : null;
    if (!target) return;
    const pilihan = target.getAttribute("data-theme-choice");
    if (pilihan === "light" || pilihan === "dark" || pilihan === "system") {
      setTema(pilihan);
    }
  });
}
