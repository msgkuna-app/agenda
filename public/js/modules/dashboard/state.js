/**
 * State Modul Dashboard (Tahap 3a: dipisah dari app.js)
 * - Menyimpan preferensi tampilan "Kegiatan hari ini" (timeline | daftar) di localStorage.
 * - Menyimpan flag apakah listener dashboard sudah dipasang.
 * Tidak menyentuh DOM dan tidak mengimpor modul fitur (aturannya: satu arah ke bawah).
 */
import { KUNCI_STORAGE_TAMPILAN_HARI_INI } from "../../config/constants.js";

/**
 * Membaca preferensi tampilan dari localStorage; default "timeline".
 * @returns {"timeline" | "daftar"}
 */
function ambilPreferensiTampilanHariIni() {
  try {
    const tersimpan = localStorage.getItem(KUNCI_STORAGE_TAMPILAN_HARI_INI);
    if (tersimpan === "daftar" || tersimpan === "timeline") {
      return tersimpan;
    }
  } catch (_e) {}
  return "timeline";
}

/**
 * Menyimpan preferensi tampilan ke localStorage.
 * @param {"timeline" | "daftar"} mode
 */
function simpanPreferensiTampilanHariIni(mode) {
  try {
    localStorage.setItem(KUNCI_STORAGE_TAMPILAN_HARI_INI, mode);
  } catch (_e) {}
}

/** Mode tampilan aktif: "timeline" | "daftar". */
export let modeTampilanHariIni = ambilPreferensiTampilanHariIni();

/** Flag agar listener pada panel dashboard hanya dipasang sekali. */
export let dashboardSudahDiikat = false;

/**
 * Mengubah mode tampilan aktif, menyimpannya, dan menandai perlu render ulang.
 * @param {"timeline" | "daftar"} mode
 */
export function setModeTampilanHariIni(mode) {
  if (mode !== "timeline" && mode !== "daftar") return;
  modeTampilanHariIni = mode;
  simpanPreferensiTampilanHariIni(mode);
}

/**
 * Menandai bahwa listener dashboard sudah terpasang.
 */
export function tandaiDashboardSudahDiikat() {
  dashboardSudahDiikat = true;
}
