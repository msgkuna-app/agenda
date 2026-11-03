/**
 * Navigasi Sidebar Kiri, Drawer HP, Tooltip Saat Diciutkan, dan Konfigurasi Menu
 * Mematuhi spesifikasi Fase 0 Bagian 1 & 2.
 */

export const SIDEBAR_STORAGE_KEY = "agenda_arsip_sidebar";

/**
 * Satu array konfigurasi menu utama (id, label, ikon SVG, tujuan, deskripsi singkat).
 */
export const MENU_KONFIGURASI = [
  {
    id: "dashboard",
    label: "Dashboard",
    tujuan: "section-dashboard",
    deskripsi: "Ringkasan kegiatan terdekat, arsip dokumen terbaru, dan ikhtisar harian Anda.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="9" rx="1.75"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.75"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.75"/><rect x="3" y="15" width="7.5" height="6" rx="1.75"/></svg>`
  },
  {
    id: "kegiatan",
    label: "Kegiatan",
    tujuan: "section-kegiatan",
    deskripsi: "Daftar agenda kegiatan, tenggat pelaksanaan, kategori, dan status penyelesaian.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
  },
  {
    id: "jadwal",
    label: "Jadwal",
    tujuan: "section-jadwal",
    deskripsi: "Tampilan kalender bulanan dan mingguan untuk meninjau agenda berdasarkan tanggal.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2.5" x2="16" y2="6"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 17.5h.01"/><path d="M12 17.5h.01"/></svg>`
  },
  {
    id: "dokumen",
    label: "Dokumen",
    tujuan: "section-dokumen",
    deskripsi: "Arsip berkas penting yang terhubung rapi ke folder Google Drive pribadi Anda.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8.5" y1="13" x2="15.5" y2="13"/><line x1="8.5" y1="17" x2="13.5" y2="17"/></svg>`
  },
  {
    id: "catatan",
    label: "Catatan",
    tujuan: "section-catatan",
    deskripsi: "Ruang catatan cepat, notula rapat, dan draf pemikiran yang tersinkronisasi.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
  },
  {
    id: "laporan",
    label: "Laporan",
    tujuan: "section-laporan",
    deskripsi: "Rekapitulasi kegiatan dan arsip dokumen periodik serta ekspor ke Google Sheets.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`
  },
  {
    id: "pengaturan",
    label: "Pengaturan",
    tujuan: "section-pengaturan",
    deskripsi: "Pengaturan kategori, folder arsip Google Drive, templat dokumen, dan preferensi.",
    ikon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  }
];

/**
 * Melakukan escape karakter HTML berbahaya dari teks masukan.
 * @param {string} teks
 * @returns {string}
 */
export function escapeHtml(teks) {
  const s = String(teks ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let activeMenuId = "dashboard";
let drawerOpen = false;
let lastFocusedBeforeDrawer = null;
let tooltipTarget = null;
let onNavigateCallback = null;

function isMobileViewport() {
  return window.matchMedia("(max-width: 599.98px)").matches;
}

function isDesktopViewport() {
  return window.matchMedia("(min-width: 1024.02px)").matches;
}

function isHoverCapable() {
  return window.matchMedia("(hover: hover)").matches;
}

/**
 * Membaca status sidebar tersimpan ("expanded" | "collapsed" | null).
 */
function bacaStatusSidebarTersimpan() {
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (v === "expanded" || v === "collapsed") {
      return v;
    }
  } catch (_err) {
    // Abaikan kesalahan penyimpanan
  }
  return null;
}

function simpanStatusSidebar(status) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, status);
  } catch (_err) {
    // Abaikan kesalahan penyimpanan
  }
}

/**
 * Menentukan apakah sidebar sedang diperluas pada tablet/desktop.
 * @returns {boolean}
 */
export function apakahSidebarDiperluas() {
  const state = document.documentElement.getAttribute("data-sidebar");
  if (state === "expanded") return true;
  if (state === "collapsed") return false;
  return isDesktopViewport();
}

/**
 * Menetapkan status diperluas/diciutkan pada sidebar desktop/tablet.
 * @param {boolean} expanded
 * @param {boolean} [simpan=true]
 */
export function setSidebarExpanded(expanded, simpan = true) {
  const nilai = expanded ? "expanded" : "collapsed";
  document.documentElement.setAttribute("data-sidebar", nilai);
  if (simpan) {
    simpanStatusSidebar(nilai);
  }
  const btnToggle = document.getElementById("sidebar-collapse-btn");
  if (btnToggle) {
    btnToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    const label = expanded ? "Ciutkan bilah sisi" : "Perluas bilah sisi";
    btnToggle.setAttribute("aria-label", label);
    btnToggle.setAttribute("title", label);
  }
  if (expanded) {
    sembunyikanTooltip();
  }
}

/**
 * Membuka drawer sidebar pada layar HP (<600px) dan mengunci fokus di dalamnya.
 */
export function bukaDrawerMobile() {
  if (!isMobileViewport()) return;
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btnHamburger = document.getElementById("mobile-menu-btn");
  if (!sidebar || !backdrop) return;

  lastFocusedBeforeDrawer = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  drawerOpen = true;
  document.documentElement.setAttribute("data-drawer", "open");
  backdrop.hidden = false;
  sidebar.removeAttribute("aria-hidden");
  if (btnHamburger) {
    btnHamburger.setAttribute("aria-expanded", "true");
  }

  // Pindahkan fokus ke tombol tutup atau item menu aktif di dalam drawer
  requestAnimationFrame(() => {
    const fokusPertama =
      sidebar.querySelector('.nav-link[aria-current="page"]') ||
      sidebar.querySelector("button, [href], [tabindex]:not([tabindex='-1'])");
    if (fokusPertama instanceof HTMLElement) {
      fokusPertama.focus();
    }
  });
}

/**
 * Menutup drawer sidebar pada layar HP dan mengembalikan fokus.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupDrawerMobile(kembalikanFokus = true) {
  if (!drawerOpen) return;
  const backdrop = document.getElementById("sidebar-backdrop");
  const btnHamburger = document.getElementById("mobile-menu-btn");

  drawerOpen = false;
  document.documentElement.removeAttribute("data-drawer");
  if (backdrop) {
    backdrop.hidden = true;
  }
  if (btnHamburger) {
    btnHamburger.setAttribute("aria-expanded", "false");
  }

  if (kembalikanFokus && lastFocusedBeforeDrawer && document.contains(lastFocusedBeforeDrawer)) {
    lastFocusedBeforeDrawer.focus();
  }
  lastFocusedBeforeDrawer = null;
}

/**
 * Menampilkan tooltip di sebelah kanan ikon saat sidebar dalam kondisi diciutkan.
 * @param {HTMLElement} el
 */
function tampilkanTooltip(el) {
  const tooltip = document.getElementById("sidebar-tooltip");
  if (!tooltip || !el) return;

  // Tooltip hanya relevan saat sidebar diciutkan di luar mode drawer HP
  if (isMobileViewport() || apakahSidebarDiperluas()) {
    sembunyikanTooltip();
    return;
  }

  const label = el.getAttribute("data-tooltip") || el.getAttribute("aria-label") || "";
  if (!label) return;

  tooltipTarget = el;
  tooltip.textContent = label;
  tooltip.hidden = false;
  el.setAttribute("aria-describedby", "sidebar-tooltip");

  const rect = el.getBoundingClientRect();
  const tengahY = rect.top + rect.height / 2;
  const kiriX = rect.right + 12;

  tooltip.style.top = `${Math.round(tengahY)}px`;
  tooltip.style.left = `${Math.round(kiriX)}px`;
  tooltip.classList.add("is-visible");
}

/**
 * Menyembunyikan tooltip sidebar.
 */
export function sembunyikanTooltip() {
  const tooltip = document.getElementById("sidebar-tooltip");
  if (tooltipTarget) {
    tooltipTarget.removeAttribute("aria-describedby");
    tooltipTarget = null;
  }
  if (tooltip) {
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
  }
}

/**
 * Membangun daftar item menu di sidebar dan kerangka bagian konten dari MENU_KONFIGURASI.
 */
function renderMenuDanBagian() {
  const navList = document.getElementById("sidebar-nav-list");
  const contentContainer = document.getElementById("main-sections-container");

  if (navList) {
    navList.innerHTML = MENU_KONFIGURASI.map((item) => {
      const isAktif = item.id === activeMenuId;
      return `
        <li class="nav-item">
          <button
            type="button"
            class="nav-link${isAktif ? " is-active" : ""}"
            id="nav-item-${escapeHtml(item.id)}"
            data-nav-id="${escapeHtml(item.id)}"
            data-target="${escapeHtml(item.tujuan)}"
            data-tooltip="${escapeHtml(item.label)}"
            aria-label="${escapeHtml(item.label)}"
            ${isAktif ? 'aria-current="page"' : ""}
          >
            <span class="nav-icon">${item.ikon}</span>
            <span class="nav-label">${escapeHtml(item.label)}</span>
          </button>
        </li>
      `;
    }).join("");
  }

  if (contentContainer && contentContainer.children.length === 0) {
    contentContainer.innerHTML = MENU_KONFIGURASI.map((item) => {
      const isAktif = item.id === activeMenuId;
      return `
        <section
          id="${escapeHtml(item.tujuan)}"
          class="content-section"
          data-section-id="${escapeHtml(item.id)}"
          aria-labelledby="heading-${escapeHtml(item.id)}"
          ${isAktif ? "" : "hidden"}
        >
          <div class="empty-stage-card">
            <div class="empty-stage-icon" aria-hidden="true">
              ${item.ikon}
            </div>
            <h2 id="heading-${escapeHtml(item.id)}" class="empty-stage-title">${escapeHtml(item.label)}</h2>
            <p class="empty-stage-badge">Fitur ini segera hadir</p>
            <p class="empty-stage-desc">${escapeHtml(item.deskripsi)}</p>
          </div>
        </section>
      `;
    }).join("");
  }
}

/**
 * Mengaktifkan salah satu bagian halaman tanpa memuat ulang halaman.
 * @param {string} menuId
 */
export function pindahBagian(menuId) {
  const targetKonfig = MENU_KONFIGURASI.find((m) => m.id === menuId) || MENU_KONFIGURASI[0];
  activeMenuId = targetKonfig.id;

  const semuaTombol = document.querySelectorAll("#sidebar-nav-list .nav-link");
  semuaTombol.forEach((btn) => {
    const cocok = btn.getAttribute("data-nav-id") === activeMenuId;
    btn.classList.toggle("is-active", cocok);
    if (cocok) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  });

  const semuaBagian = document.querySelectorAll("#main-sections-container .content-section");
  semuaBagian.forEach((sec) => {
    const cocok = sec.getAttribute("data-section-id") === activeMenuId;
    sec.hidden = !cocok;
  });

  const judulHeader = document.getElementById("header-page-title");
  if (judulHeader) {
    judulHeader.textContent = targetKonfig.label;
  }

  sembunyikanTooltip();

  if (drawerOpen) {
    tutupDrawerMobile(false);
  }

  if (typeof onNavigateCallback === "function") {
    onNavigateCallback(targetKonfig);
  }
}

/**
 * Mengunci fokus keyboard (Tab / Shift+Tab) di dalam drawer ketika drawer HP sedang terbuka.
 * @param {KeyboardEvent} e
 */
function tanganiKunciFokusDrawer(e) {
  if (!drawerOpen || e.key !== "Tab") return;
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return;

  const kandidat = Array.from(
    sidebar.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el instanceof HTMLElement && el.offsetParent !== null);

  if (kandidat.length === 0) return;

  const pertama = kandidat[0];
  const terakhir = kandidat[kandidat.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === pertama || !sidebar.contains(document.activeElement)) {
      e.preventDefault();
      terakhir.focus();
    }
  } else {
    if (document.activeElement === terakhir || !sidebar.contains(document.activeElement)) {
      e.preventDefault();
      pertama.focus();
    }
  }
}

/**
 * Memperbarui informasi akun pengguna di bagian bawah sidebar secara aman (escaped).
 * @param {any} user
 */
export function perbaruiInfoAkunSidebar(user) {
  const namaEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");
  const avatarImg = document.getElementById("sidebar-user-photo");
  const avatarFallback = document.getElementById("sidebar-user-initials");

  if (!user) {
    if (namaEl) namaEl.textContent = "Pengguna";
    if (emailEl) emailEl.textContent = "";
    if (avatarImg) {
      avatarImg.hidden = true;
      avatarImg.removeAttribute("src");
    }
    if (avatarFallback) {
      avatarFallback.hidden = false;
      avatarFallback.textContent = "AA";
    }
    return;
  }

  const namaLengkap = String(user.displayName || "").trim();
  const potonganNama = namaLengkap
    ? namaLengkap.split(/\s+/).slice(0, 2).join(" ")
    : String(user.email || "Pemilik").split("@")[0];

  const inisial = potonganNama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0].toUpperCase())
    .join("") || "AA";

  if (namaEl) {
    namaEl.textContent = potonganNama;
    namaEl.setAttribute("title", namaLengkap || potonganNama);
  }
  if (emailEl) {
    emailEl.textContent = String(user.email || "");
    emailEl.setAttribute("title", String(user.email || ""));
  }

  if (avatarFallback) {
    avatarFallback.textContent = inisial;
  }

  if (avatarImg && user.photoURL) {
    avatarImg.onload = () => {
      avatarImg.hidden = false;
      if (avatarFallback) avatarFallback.hidden = true;
    };
    avatarImg.onerror = () => {
      avatarImg.hidden = true;
      if (avatarFallback) avatarFallback.hidden = false;
    };
    avatarImg.src = String(user.photoURL);
    avatarImg.alt = `Foto profil ${potonganNama}`;
  } else if (avatarImg) {
    avatarImg.hidden = true;
    if (avatarFallback) avatarFallback.hidden = false;
  }
}

/**
 * Inisialisasi seluruh perilaku sidebar, drawer HP, dan tooltip.
 * @param {{ onNavigate?: (item: any) => void, onLogoutRequest?: () => void }} [opsi]
 */
export function initSidebar(opsi = {}) {
  onNavigateCallback = opsi.onNavigate || null;

  renderMenuDanBagian();

  // Terapkan status awal sidebar berdasarkan penyimpanan atau lebar layar
  const tersimpan = bacaStatusSidebarTersimpan();
  if (tersimpan) {
    setSidebarExpanded(tersimpan === "expanded", false);
  } else {
    setSidebarExpanded(isDesktopViewport(), false);
  }

  pindahBagian(activeMenuId);

  const btnCollapse = document.getElementById("sidebar-collapse-btn");
  if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
      setSidebarExpanded(!apakahSidebarDiperluas(), true);
    });
  }

  const btnHamburger = document.getElementById("mobile-menu-btn");
  if (btnHamburger) {
    btnHamburger.addEventListener("click", () => {
      if (drawerOpen) {
        tutupDrawerMobile(true);
      } else {
        bukaDrawerMobile();
      }
    });
  }

  const btnCloseDrawer = document.getElementById("sidebar-mobile-close-btn");
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener("click", () => {
      tutupDrawerMobile(true);
    });
  }

  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      tutupDrawerMobile(true);
    });
  }

  const navList = document.getElementById("sidebar-nav-list");
  if (navList) {
    navList.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("[data-nav-id]") : null;
      if (!btn) return;
      const id = btn.getAttribute("data-nav-id");
      if (id) {
        pindahBagian(id);
      }
    });
  }

  // Tooltip untuk item sidebar saat diciutkan (hover di perangkat pointer & fokus keyboard)
  const sidebar = document.getElementById("app-sidebar");
  if (sidebar) {
    sidebar.addEventListener("mouseenter", (e) => {
      if (!isHoverCapable()) return;
      const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (target instanceof HTMLElement) {
        tampilkanTooltip(target);
      }
    }, true);

    sidebar.addEventListener("mouseleave", (e) => {
      if (!isHoverCapable()) return;
      const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (target && target === tooltipTarget) {
        sembunyikanTooltip();
      }
    }, true);

    sidebar.addEventListener("focusin", (e) => {
      const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (target instanceof HTMLElement) {
        tampilkanTooltip(target);
      }
    });

    sidebar.addEventListener("focusout", (e) => {
      const target = e.target instanceof Element ? e.target.closest("[data-tooltip]") : null;
      if (target && target === tooltipTarget) {
        sembunyikanTooltip();
      }
    });
  }

  const btnLogout = document.getElementById("sidebar-logout-btn");
  if (btnLogout && typeof opsi.onLogoutRequest === "function") {
    btnLogout.addEventListener("click", () => {
      sembunyikanTooltip();
      opsi.onLogoutRequest();
    });
  }

  // Penanganan tombol Escape (menutup tooltip atau drawer) dan fokus trap
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (tooltipTarget) {
        sembunyikanTooltip();
      }
      if (drawerOpen) {
        e.preventDefault();
        tutupDrawerMobile(true);
      }
      return;
    }
    tanganiKunciFokusDrawer(e);
  });

  // Penyesuaian saat ukuran layar berubah melintasi batas HP / Tablet / Desktop
  window.addEventListener("resize", () => {
    if (!isMobileViewport() && drawerOpen) {
      tutupDrawerMobile(false);
    }
    if (!bacaStatusSidebarTersimpan()) {
      setSidebarExpanded(isDesktopViewport(), false);
    }
    sembunyikanTooltip();
  });
}
