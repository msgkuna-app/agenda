/**
 * Modul PWA & Service Worker (Agenda & Arsip - Fase 7C)
 * Mengelola pendaftaran Service Worker, pemeriksaan pembaruan berkala,
 * spanduk update aplikasi, dan inisialisasi prompt instalasi PWA (Desktop/Android/iOS).
 */

const KUNCI_TUNDA_UPDATE_SW = "agenda_arsip_update_ditunda";
const INTERVAL_CEK_UPDATE_SW_MS = 60 * 60 * 1000;

let swRegistration = null;
let registrasiSwDipantau = null;
let swUpdateMenunggu = false;
let swUpdateIntervalId = null;
let sedangMuatUlangSw = false;
let spandukSwSudahDiikat = false;
let deferredInstallPrompt = null;

function apakahUpdateSwDitunda() {
  try {
    return sessionStorage.getItem(KUNCI_TUNDA_UPDATE_SW) === "1";
  } catch (_err) {
    return false;
  }
}

function simpanPenandaTundaUpdateSw() {
  try {
    sessionStorage.setItem(KUNCI_TUNDA_UPDATE_SW, "1");
  } catch (_err) {}
}

function hapusPenandaTundaUpdateSw() {
  try {
    sessionStorage.removeItem(KUNCI_TUNDA_UPDATE_SW);
  } catch (_err) {}
}

function apakahLayarAplikasiAktif() {
  const layarApp = document.getElementById("app-shell");
  return Boolean(layarApp && !layarApp.hidden);
}

export function perbaruiVisibilitasSpandukSw() {
  const spanduk = document.getElementById("sw-update-banner");
  if (!spanduk) return;

  const tampil =
    swUpdateMenunggu &&
    apakahLayarAplikasiAktif() &&
    !apakahUpdateSwDitunda();

  spanduk.hidden = !tampil;
  if (tampil) {
    document.documentElement.setAttribute("data-sw-banner", "visible");
  } else {
    document.documentElement.removeAttribute("data-sw-banner");
  }
}

function tandaiPembaruanSwMenunggu() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    return;
  }
  swUpdateMenunggu = true;
  perbaruiVisibilitasSpandukSw();
}

function pantauWorkerInstalling(workerBaru) {
  if (!workerBaru) return;
  workerBaru.addEventListener("statechange", () => {
    if (
      workerBaru.state === "installed" &&
      navigator.serviceWorker.controller
    ) {
      hapusPenandaTundaUpdateSw();
      tandaiPembaruanSwMenunggu();
    }
  });
}

function ikatRegistrasiServiceWorker(registration) {
  if (!registration) return;
  swRegistration = registration;

  if (registration.waiting && navigator.serviceWorker.controller) {
    tandaiPembaruanSwMenunggu();
  }

  if (registrasiSwDipantau === registration) return;
  registrasiSwDipantau = registration;

  if (registration.installing) {
    pantauWorkerInstalling(registration.installing);
  }

  registration.addEventListener("updatefound", () => {
    pantauWorkerInstalling(registration.installing);
  });
}

export async function periksaPembaruanSwBerkala() {
  if (!swRegistration) return;
  try {
    await swRegistration.update();
    if (swRegistration.waiting && navigator.serviceWorker.controller) {
      tandaiPembaruanSwMenunggu();
    }
  } catch (_err) {}
}

function ikatTombolSpandukSw() {
  if (spandukSwSudahDiikat) return;
  spandukSwSudahDiikat = true;

  const btnMuatUlang = document.getElementById("sw-update-reload-btn");
  const btnNanti = document.getElementById("sw-update-later-btn");

  if (btnMuatUlang) {
    btnMuatUlang.addEventListener("click", () => {
      if (!("serviceWorker" in navigator) || sedangMuatUlangSw) return;
      const waitingWorker = swRegistration && swRegistration.waiting;
      if (!waitingWorker) {
        swUpdateMenunggu = false;
        perbaruiVisibilitasSpandukSw();
        return;
      }

      sedangMuatUlangSw = true;
      if (btnMuatUlang instanceof HTMLButtonElement) {
        btnMuatUlang.disabled = true;
        btnMuatUlang.textContent = "Memuat ulang...";
      }
      if (btnNanti instanceof HTMLButtonElement) {
        btnNanti.disabled = true;
      }

      let sudahReload = false;
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          if (sudahReload) return;
          sudahReload = true;
          location.reload();
        },
        { once: true },
      );

      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });
  }

  if (btnNanti) {
    btnNanti.addEventListener("click", () => {
      simpanPenandaTundaUpdateSw();
      perbaruiVisibilitasSpandukSw();
    });
  }
}

export async function periksaPembaruan() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  let registration =
    swRegistration || (await navigator.serviceWorker.getRegistration());
  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }
  ikatRegistrasiServiceWorker(registration);

  const hasilUpdate = await registration.update();
  const regAktif = hasilUpdate || registration;
  ikatRegistrasiServiceWorker(regAktif);

  if (regAktif.installing) {
    await new Promise((resolve) => {
      const workerBaru = regAktif.installing;
      if (
        !workerBaru ||
        workerBaru.state === "installed" ||
        workerBaru.state === "redundant"
      ) {
        resolve();
        return;
      }
      const saatStatusBerubah = () => {
        if (
          workerBaru.state === "installed" ||
          workerBaru.state === "redundant"
        ) {
          workerBaru.removeEventListener("statechange", saatStatusBerubah);
          resolve();
        }
      };
      workerBaru.addEventListener("statechange", saatStatusBerubah);
    });
  }

  if (regAktif.waiting && navigator.serviceWorker.controller) {
    hapusPenandaTundaUpdateSw();
    tandaiPembaruanSwMenunggu();
  }

  return regAktif;
}

export function daftarkanServiceWorker() {
  ikatTombolSpandukSw();
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      ikatRegistrasiServiceWorker(registration);

      if (swUpdateIntervalId !== null) {
        window.clearInterval(swUpdateIntervalId);
      }
      swUpdateIntervalId = window.setInterval(() => {
        periksaPembaruanSwBerkala();
      }, INTERVAL_CEK_UPDATE_SW_MS);
    } catch (err) {
      console.warn("Pendaftaran Service Worker gagal:", err);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      periksaPembaruanSwBerkala();
    }
  });
}

export function initPwaInstallPrompt() {
  const btnInstall = document.getElementById("pwa-install-btn");
  const iosModal = document.getElementById("ios-install-modal");
  const btnTutupIos = document.getElementById("ios-install-close-btn");
  if (!btnInstall) return;

  const sedangStandalone =
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (sedangStandalone) {
    btnInstall.hidden = true;
    return;
  }

  const perangkatIos = /iphone|ipad|ipod/.test(
    window.navigator.userAgent.toLowerCase(),
  );
  if (perangkatIos) btnInstall.hidden = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstall.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    btnInstall.hidden = true;
  });

  btnInstall.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const pilihan = await deferredInstallPrompt.userChoice;
      if (pilihan && pilihan.outcome === "accepted") btnInstall.hidden = true;
      deferredInstallPrompt = null;
    } else if (perangkatIos && iosModal) {
      iosModal.hidden = false;
      if (btnTutupIos instanceof HTMLElement) btnTutupIos.focus();
    }
  });

  if (btnTutupIos && iosModal) {
    btnTutupIos.addEventListener("click", () => {
      iosModal.hidden = true;
      btnInstall.focus();
    });
    iosModal.addEventListener("click", (e) => {
      if (e.target === iosModal) {
        iosModal.hidden = true;
        btnInstall.focus();
      }
    });
  }
}