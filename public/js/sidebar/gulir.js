/**
 * Utilitas Gulir Area Konten (Tahap 7b)
 * Menggulung area konten utama (#workspace-scroll), bukan window.
 */

/**
 * Mengambil elemen penggulung konten utama (#workspace-scroll / .app-workspace).
 * @returns {HTMLElement | null}
 */
export function getElemenScrollUtama() {
  return document.getElementById("workspace-scroll") || document.querySelector(".app-workspace");
}

/**
 * Menggulung area konten utama ke puncak (bukan window.scrollTo).
 */
export function gulirAreaKontenKeAtas() {
  const el = getElemenScrollUtama();
  if (el) {
    el.scrollTop = 0;
  }
}
