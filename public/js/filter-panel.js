/**
 * Helper Bersama Panel Filter Ringkas ("Agenda & Arsip")
 * Mengelola buka/tutup panel filter di bawah bilah alat, atribut aksesibilitas
 * (aria-expanded, aria-controls, inert, aria-hidden), perhitungan jumlah filter aktif
 * pada lencana, tombol "Atur ulang", penutupan dengan tombol Escape beserta pemulihan
 * fokus ke tombol "Filter", serta penutupan otomatis saat berpindah halaman.
 */

const instansiPanelMap = new WeakMap();
const elemenTerikatSet = new WeakSet();
let penghitungIdPanel = 0;

function ambilKontrolFilter(panel) {
  return Array.from(panel.querySelectorAll("select, input, textarea")).filter((el) => {
    if (el.hasAttribute("data-filter-ignore")) return false;
    if (el instanceof HTMLInputElement) {
      const tipe = (el.type || "text").toLowerCase();
      if (tipe === "hidden" || tipe === "button" || tipe === "submit" || tipe === "reset") {
        return false;
      }
    }
    return true;
  });
}

function apakahKontrolBerbedaDariBawaan(el) {
  if (el instanceof HTMLSelectElement) {
    if (el.options.length === 0) return false;
    const nilaiBawaan = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : String(el.options[0]?.value ?? "");
    return el.value !== nilaiBawaan;
  }

  if (el instanceof HTMLInputElement) {
    const tipe = (el.type || "text").toLowerCase();
    if (tipe === "checkbox" || tipe === "radio") {
      const bawaanCentang = el.hasAttribute("data-default")
        ? el.getAttribute("data-default") === "true"
        : el.defaultChecked;
      return el.checked !== bawaanCentang;
    }
    const bawaanTeks = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : "";
    return el.value.trim() !== bawaanTeks.trim();
  }

  if (el instanceof HTMLTextAreaElement) {
    const bawaanArea = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : "";
    return el.value.trim() !== bawaanArea.trim();
  }

  return false;
}

function aturNilaiAsliElemen(el, proto, nilai) {
  const deskriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (deskriptor && typeof deskriptor.set === "function") {
    deskriptor.set.call(el, nilai);
  } else {
    el.value = nilai;
  }
}

function kembalikanKontrolKeBawaan(el) {
  if (el instanceof HTMLSelectElement) {
    if (el.options.length === 0) return;
    const nilaiBawaan = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : String(el.options[0]?.value ?? "");
    if (el.value !== nilaiBawaan) {
      aturNilaiAsliElemen(el, HTMLSelectElement.prototype, nilaiBawaan);
      if (el.value !== nilaiBawaan && el.options.length > 0) {
        el.selectedIndex = 0;
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  if (el instanceof HTMLInputElement) {
    const tipe = (el.type || "text").toLowerCase();
    if (tipe === "checkbox" || tipe === "radio") {
      const bawaanCentang = el.hasAttribute("data-default")
        ? el.getAttribute("data-default") === "true"
        : el.defaultChecked;
      if (el.checked !== bawaanCentang) {
        const deskriptorChecked = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
        if (deskriptorChecked && typeof deskriptorChecked.set === "function") {
          deskriptorChecked.set.call(el, bawaanCentang);
        } else {
          el.checked = bawaanCentang;
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    const bawaanTeks = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : "";
    if (el.value !== bawaanTeks) {
      aturNilaiAsliElemen(el, HTMLInputElement.prototype, bawaanTeks);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  if (el instanceof HTMLTextAreaElement) {
    const bawaanArea = el.hasAttribute("data-default")
      ? String(el.getAttribute("data-default") ?? "")
      : "";
    if (el.value !== bawaanArea) {
      aturNilaiAsliElemen(el, HTMLTextAreaElement.prototype, bawaanArea);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

function uraiElemenOpsi(opsi = {}) {
  const adalahRootLangsung =
    opsi instanceof HTMLElement || opsi instanceof Document || opsi instanceof DocumentFragment;
  const wadah = adalahRootLangsung
    ? opsi
    : opsi && opsi.root instanceof HTMLElement
      ? opsi.root
      : document;

  const toggle =
    !adalahRootLangsung && opsi?.toggle instanceof HTMLElement
      ? opsi.toggle
      : wadah.querySelector("[data-filter-toggle]");

  const panel =
    !adalahRootLangsung && opsi?.panel instanceof HTMLElement
      ? opsi.panel
      : wadah.querySelector("[data-filter-panel]");

  const badge =
    !adalahRootLangsung && opsi?.badge instanceof HTMLElement
      ? opsi.badge
      : (toggle && toggle.querySelector("[data-filter-badge]")) ||
        wadah.querySelector("[data-filter-badge]");

  const reset =
    !adalahRootLangsung && opsi?.reset instanceof HTMLElement
      ? opsi.reset
      : (panel && panel.querySelector("[data-filter-reset]")) ||
        wadah.querySelector("[data-filter-reset]");

  return { toggle, panel, badge, reset };
}

/**
 * Menginisialisasi panel filter pada suatu halaman secara idempoten.
 * Aman dipanggil berulang pada elemen yang sama maupun setelah halaman dirender ulang.
 *
 * @param {HTMLElement | { root?: HTMLElement, toggle?: HTMLElement, panel?: HTMLElement, badge?: HTMLElement, reset?: HTMLElement }} [opsi]
 */
export function initFilterPanel(opsi = {}) {
  const { toggle, panel, badge, reset } = uraiElemenOpsi(opsi);
  if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
    return null;
  }

  if (!panel.id) {
    penghitungIdPanel += 1;
    panel.id = `filter-panel-otomatis-${penghitungIdPanel}`;
  }

  let state = instansiPanelMap.get(panel);
  if (!state) {
    state = {
      terbuka: false,
      toggle,
      panel,
      badge: badge instanceof HTMLElement ? badge : null,
      reset: reset instanceof HTMLElement ? reset : null,
      pengamatBagian: null,
      bagianTerpantau: null,
      aturTerbuka(buka, kembalikanFokus = false) {
        const nilaiBaru = Boolean(buka);
        state.terbuka = nilaiBaru;

        state.toggle.setAttribute("aria-controls", state.panel.id);
        state.toggle.setAttribute("aria-expanded", nilaiBaru ? "true" : "false");
        state.toggle.classList.toggle("is-open", nilaiBaru);

        state.panel.classList.toggle("is-open", nilaiBaru);
        state.panel.setAttribute("aria-hidden", nilaiBaru ? "false" : "true");
        if ("inert" in state.panel) {
          state.panel.inert = !nilaiBaru;
        }
        if (nilaiBaru) {
          state.panel.removeAttribute("inert");
        } else {
          state.panel.setAttribute("inert", "");
        }

        if (!nilaiBaru && kembalikanFokus) {
          state.toggle.focus();
        }
      },
      perbaruiLencana() {
        const kontrol = ambilKontrolFilter(state.panel);
        let jumlahAktif = 0;
        for (const el of kontrol) {
          if (apakahKontrolBerbedaDariBawaan(el)) {
            jumlahAktif += 1;
          }
        }
        if (state.badge instanceof HTMLElement) {
          state.badge.textContent = String(jumlahAktif);
          state.badge.hidden = jumlahAktif === 0;
        }
        state.toggle.classList.toggle("has-active-filter", jumlahAktif > 0);
        return jumlahAktif;
      },
      aturUlang() {
        const kontrol = ambilKontrolFilter(state.panel);
        for (const el of kontrol) {
          kembalikanKontrolKeBawaan(el);
        }
        state.perbaruiLencana();
      },
      api: null
    };

    state.api = {
      buka: () => state.aturTerbuka(true, false),
      tutup: (kembalikanFokus = false) => state.aturTerbuka(false, kembalikanFokus),
      toggle: () => state.aturTerbuka(!state.terbuka, false),
      perbaruiLencana: () => state.perbaruiLencana(),
      aturUlang: () => state.aturUlang(),
      isTerbuka: () => state.terbuka
    };

    instansiPanelMap.set(panel, state);
  } else {
    state.toggle = toggle;
    state.badge = badge instanceof HTMLElement ? badge : state.badge;
    state.reset = reset instanceof HTMLElement ? reset : state.reset;
  }

  if (!elemenTerikatSet.has(toggle)) {
    elemenTerikatSet.add(toggle);
    toggle.addEventListener("click", () => {
      state.aturTerbuka(!state.terbuka, false);
    });
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.terbuka) {
        e.preventDefault();
        e.stopPropagation();
        state.aturTerbuka(false, true);
      }
    });
  }

  if (!elemenTerikatSet.has(panel)) {
    elemenTerikatSet.add(panel);
    panel.addEventListener("change", () => {
      state.perbaruiLencana();
    });
    panel.addEventListener("input", () => {
      state.perbaruiLencana();
    });
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.terbuka) {
        e.preventDefault();
        e.stopPropagation();
        state.aturTerbuka(false, true);
      }
    });
  }

  if (state.reset instanceof HTMLElement && !elemenTerikatSet.has(state.reset)) {
    elemenTerikatSet.add(state.reset);
    state.reset.addEventListener("click", () => {
      state.aturUlang();
    });
  }

  const bagianHalaman = panel.closest(".content-section, [id^='section-']");
  if (
    bagianHalaman instanceof HTMLElement &&
    state.bagianTerpantau !== bagianHalaman &&
    typeof MutationObserver !== "undefined"
  ) {
    if (state.pengamatBagian) {
      state.pengamatBagian.disconnect();
    }
    state.bagianTerpantau = bagianHalaman;
    state.pengamatBagian = new MutationObserver(() => {
      if (state.terbuka) {
        state.aturTerbuka(false, false);
      }
    });
    state.pengamatBagian.observe(bagianHalaman, {
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  // Setiap inisialisasi halaman dimulai dalam keadaan tertutup (tidak disimpan)
  state.aturTerbuka(false, false);
  state.perbaruiLencana();

  return state.api;
}
