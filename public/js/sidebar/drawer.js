/**
 * Drawer Navigasi Layar HP (Tahap 7b)
 * Membuka/menutup drawer, mengelola atribut data-drawer, backdrop, dan pengembalian fokus.
 * Pemilik tunggal `drawerTriggerFocus` — satu drawer untuk satu dokumen, jadi state ini
 * memang milik modul.
 */

let drawerTriggerFocus = null;

export function bukaDrawerMobile() {
  const root = document.documentElement;
  const backdrop = document.getElementById("sidebar-backdrop");
  const btnMenu = document.getElementById("mobile-menu-btn");
  const btnTutup = document.getElementById("sidebar-mobile-close-btn");

  drawerTriggerFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (backdrop) backdrop.hidden = false;
  root.setAttribute("data-drawer", "open");
  if (btnMenu) btnMenu.setAttribute("aria-expanded", "true");

  requestAnimationFrame(() => {
    if (btnTutup instanceof HTMLElement) {
      btnTutup.focus();
    }
  });
}

/**
 * Menutup drawer navigasi pada layar HP.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupDrawerMobile(kembalikanFokus = true) {
  const root = document.documentElement;
  const backdrop = document.getElementById("sidebar-backdrop");
  const btnMenu = document.getElementById("mobile-menu-btn");

  if (root.getAttribute("data-drawer") !== "open") {
    if (backdrop) backdrop.hidden = true;
    return;
  }

  root.removeAttribute("data-drawer");
  if (btnMenu) btnMenu.setAttribute("aria-expanded", "false");
  if (backdrop) backdrop.hidden = true;

  if (kembalikanFokus && drawerTriggerFocus && document.contains(drawerTriggerFocus)) {
    drawerTriggerFocus.focus();
  }
  drawerTriggerFocus = null;
}
