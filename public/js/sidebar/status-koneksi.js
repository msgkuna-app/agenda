/**
 * Indikator Status Koneksi Header (Tahap 7b)
 * Memperbarui ikon online/offline di sudut kanan header; tidak menyentuh bagian lain.
 */

/**
 * Memperbarui indikator status koneksi (ikon saja) di sudut kanan header.
 * @param {boolean} sedangOnline
 */
export function perbaruiStatusKoneksiSidebar(sedangOnline) {
  const indikator = document.getElementById("header-network-indicator");
  if (!indikator) return;

  indikator.classList.toggle("is-offline", !sedangOnline);
  indikator.classList.toggle("is-online", sedangOnline);

  const ikonOnline = indikator.querySelector(".header-network-online");
  const ikonOffline = indikator.querySelector(".header-network-offline");
  if (ikonOnline instanceof HTMLElement) ikonOnline.hidden = !sedangOnline;
  if (ikonOffline instanceof HTMLElement) ikonOffline.hidden = sedangOnline;

  const tooltip = sedangOnline
    ? "Perangkat terhubung ke internet"
    : "Luring — menampilkan data tersimpan di perangkat";
  indikator.setAttribute("data-tooltip", tooltip);
  indikator.setAttribute("title", tooltip);
  indikator.setAttribute("aria-label", tooltip);
}
