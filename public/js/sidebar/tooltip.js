/**
 * Tooltip Sidebar Ciut (Tahap 7b)
 * Menampilkan label tombol navigasi saat sidebar dalam keadaan ciut dan lebar layar cukup.
 */

/**
 * Memasang pendengar tooltip untuk tombol di dalam sidebar.
 * Dipanggil sekali dari initSidebar().
 */
export function initTooltipSidebar() {
  const tooltip = document.getElementById("sidebar-tooltip");
  const sidebar = document.getElementById("app-sidebar");
  if (!tooltip || !sidebar) return;

  const sembunyikan = () => {
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
  };

  const tampilkan = (el) => {
    if (document.documentElement.getAttribute("data-sidebar") !== "collapsed") {
      sembunyikan();
      return;
    }
    if (window.matchMedia && !window.matchMedia("(min-width: 600px)").matches) {
      sembunyikan();
      return;
    }
    const label = el.getAttribute("data-tooltip");
    if (!label) return;
    const rect = el.getBoundingClientRect();
    tooltip.textContent = label;
    tooltip.hidden = false;
    tooltip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tooltip.style.left = `${Math.round(rect.right + 10)}px`;
    requestAnimationFrame(() => {
      tooltip.classList.add("is-visible");
    });
  };

  sidebar.addEventListener("mouseover", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
    if (target) tampilkan(target);
  });

  sidebar.addEventListener("mouseout", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
    if (target) sembunyikan();
  });

  sidebar.addEventListener("focusin", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
    if (target) tampilkan(target);
  });

  sidebar.addEventListener("focusout", sembunyikan);
}
