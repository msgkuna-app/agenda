/**
 * Modul Navigasi Sidebar, Drawer Mobile, Tooltip Ciut, dan Escape HTML (Aturan #9, #13, #14)
 */

const STORAGE_SIDEBAR_KEY = "agenda_arsip_sidebar";

export const MENU_SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    fase: "Fase 2",
    desc: "Ringkasan kegiatan hari ini, jadwal mendatang, dan pintasan cepat akan hadir pada Fase 2.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`
  },
  {
    id: "kegiatan",
    label: "Kegiatan",
    fase: "Fase 1",
    desc: "Kelola daftar kegiatan harian, kategori berwarna, filter status, dan pencarian.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
  },
  {
    id: "jadwal",
    label: "Jadwal",
    fase: "Fase 2",
    desc: "Tampilan kalender bulanan dan agenda mingguan terpadu akan hadir pada Fase 2.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  },
  {
    id: "dokumen",
    label: "Dokumen",
    fase: "Fase 3",
    desc: "Arsip dokumen yang terhubung langsung ke folder Google Drive pribadi akan hadir pada Fase 3.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
  },
  {
    id: "catatan",
    label: "Catatan",
    fase: "Fase 4",
    desc: "Ruang catatan cepat dan referensi pribadi akan hadir pada Fase 4.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
  },
  {
    id: "laporan",
    label: "Laporan",
    fase: "Fase 5",
    desc: "Rekapitulasi kegiatan dan ekspor ke Google Sheets akan hadir pada Fase 5.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
  },
  {
    id: "pengaturan",
    label: "Pengaturan",
    fase: "Fase 5",
    desc: "Pengaturan folder Google Drive utama dan preferensi aplikasi akan hadir pada Fase 5.",
    svg: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  }
];

let activeSectionId = "kegiatan";
let onNavigateCallback = null;
let drawerTriggerFocus = null;

/**
 * Mengamankan teks masukan pengguna sebelum disisipkan ke HTML (Aturan #9).
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

/**
 * Berpindah halaman bagian aplikasi.
 * @param {string} sectionId
 */
export function pindahKeBagian(sectionId) {
  const ditemukan = MENU_SECTIONS.find((m) => m.id === sectionId) || MENU_SECTIONS[0];
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

  if (typeof onNavigateCallback === "function") {
    onNavigateCallback(activeSectionId);
  }
}

export function getActiveSectionId() {
  return activeSectionId;
}

function renderKerangkaBagianAwal() {
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
            ${item.id === activeSectionId ? 'aria-current="page"' : ""}
          >
            <span class="nav-icon">${item.svg}</span>
            <span class="nav-label">${escapeHtml(item.label)}</span>
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
        if (item.id !== "kegiatan") {
          panel.innerHTML = `
            <div class="empty-stage-card">
              <div class="empty-stage-icon" aria-hidden="true">${item.svg}</div>
              <p class="empty-stage-badge">Segera Hadir &bull; ${escapeHtml(item.fase)}</p>
              <h2 class="empty-stage-title">${escapeHtml(item.label)}</h2>
              <p class="empty-stage-desc">${escapeHtml(item.desc)}</p>
            </div>
          `;
        }
        container.appendChild(panel);
      }
    });
  }
}

function initTooltipSidebar() {
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

/**
 * Memperbarui informasi profil pengguna di bagian bawah sidebar.
 * @param {import("https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js").User | null} user
 */
export function perbaruiInfoAkunSidebar(user) {
  const imgEl = document.getElementById("sidebar-user-photo");
  const initialsEl = document.getElementById("sidebar-user-initials");
  const nameEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");

  if (!user) {
    if (imgEl) {
      imgEl.removeAttribute("src");
      imgEl.hidden = true;
    }
    if (initialsEl) {
      initialsEl.textContent = "AA";
      initialsEl.hidden = false;
    }
    if (nameEl) nameEl.textContent = "Pengguna";
    if (emailEl) emailEl.textContent = "";
    return;
  }

  const nama = (user.displayName || "Pemilik Agenda").trim();
  const email = (user.email || "").trim();
  const bagian = nama.split(/\s+/).filter(Boolean);
  const inisial =
    bagian.length >= 2
      ? `${bagian[0][0]}${bagian[1][0]}`.toUpperCase()
      : nama.slice(0, 2).toUpperCase() || "AA";

  if (nameEl) nameEl.textContent = nama;
  if (emailEl) emailEl.textContent = email;
  if (initialsEl) initialsEl.textContent = inisial;

  if (imgEl && user.photoURL) {
    imgEl.src = user.photoURL;
    imgEl.hidden = false;
    if (initialsEl) initialsEl.hidden = true;
    imgEl.onerror = () => {
      imgEl.hidden = true;
      if (initialsEl) initialsEl.hidden = false;
    };
  } else {
    if (imgEl) imgEl.hidden = true;
    if (initialsEl) initialsEl.hidden = false;
  }
}

/**
 * Menginisialisasi sidebar, tombol ciutkan, drawer HP, dan navigasi antar bagian.
 * @param {{ onLogoutRequest?: () => void, onSectionChange?: (id: string) => void, initialSection?: string }} [options]
 */
export function initSidebar(options = {}) {
  if (options.initialSection) {
    activeSectionId = options.initialSection;
  }
  onNavigateCallback = options.onSectionChange || null;

  renderKerangkaBagianAwal();

  const root = document.documentElement;
  const btnCollapse = document.getElementById("sidebar-collapse-btn");
  const sinkronTombolCollapse = () => {
    const collapsed = root.getAttribute("data-sidebar") === "collapsed";
    if (btnCollapse) {
      btnCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const label = collapsed ? "Perluas bilah sisi" : "Ciutkan bilah sisi";
      btnCollapse.setAttribute("aria-label", label);
      btnCollapse.setAttribute("title", label);
    }
  };
  sinkronTombolCollapse();

  if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
      const sekarang = root.getAttribute("data-sidebar") === "collapsed" ? "expanded" : "collapsed";
      root.setAttribute("data-sidebar", sekarang);
      try {
        localStorage.setItem(STORAGE_SIDEBAR_KEY, sekarang);
      } catch (_e) {
        // Abaikan kendala localStorage
      }
      sinkronTombolCollapse();
    });
  }

  const btnMenuMobile = document.getElementById("mobile-menu-btn");
  const btnTutupMobile = document.getElementById("sidebar-mobile-close-btn");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (btnMenuMobile) {
    btnMenuMobile.addEventListener("click", () => bukaDrawerMobile());
  }
  if (btnTutupMobile) {
    btnTutupMobile.addEventListener("click", () => tutupDrawerMobile(true));
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => tutupDrawerMobile(true));
  }

  const navList = document.getElementById("sidebar-nav-list");
  if (navList) {
    navList.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".nav-link[data-section]") : null;
      if (!btn) return;
      const tujuan = btn.getAttribute("data-section");
      if (tujuan) pindahKeBagian(tujuan);
    });
  }

  const btnLogout = document.getElementById("sidebar-logout-btn");
  if (btnLogout && typeof options.onLogoutRequest === "function") {
    btnLogout.addEventListener("click", () => {
      tutupDrawerMobile(false);
      options.onLogoutRequest();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.getAttribute("data-drawer") === "open") {
      e.preventDefault();
      tutupDrawerMobile(true);
    }
  });

  initTooltipSidebar();
  pindahKeBagian(activeSectionId);
}
