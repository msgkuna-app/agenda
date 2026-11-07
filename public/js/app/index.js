/**
 * Modul Induk Bootstrap & Orkestrasi Aplikasi (Agenda & Arsip - Fase 7C)
 * Menginisialisasi komponen UI, pendaftaran service worker, listener global,
 * sesi otentikasi Firebase, dan orkestrasi langganan data.
 */

import { isFirebaseConfigured } from "../firebase-config.js";
import {
  AUTHORIZED_EMAIL,
  initAuth,
  consumeLastAuthError,
  formatPesanGalatAuth,
} from "../auth.js";
import { initTema } from "../tema.js";
import {
  initSidebar,
  perbaruiInfoAkunSidebar,
} from "../sidebar.js";
import { NAMA_HARI, NAMA_BULAN } from "../util-html.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";
import {
  initHalamanKegiatan,
  subscribeKegiatan,
  getDaftarKegiatan,
  daftarkanPembukaDetailKegiatan,
} from "../kegiatan.js";
import {
  initHalamanJadwal,
  renderHalamanJadwal,
  bukaDialogDetailKegiatan,
} from "../jadwal.js";
import {
  initHalamanDokumen,
  subscribeDokumen,
  getDaftarDokumen,
} from "../dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  initHalamanCatatan,
  subscribeCatatan,
  getDaftarCatatan,
  tautanAmanGoogleDocs,
  sorotCatatanDiHalaman,
  daftarkanPembukaDetailKegiatanCatatan,
} from "../catatan.js";
import {
  initHalamanLaporan,
  subscribeLaporan,
} from "../laporan.js";
import {
  initHalamanPengaturan,
  segarkanTampilanPengaturan,
  muatPengaturanCadangan,
} from "../pengaturan.js";
import {
  initHalamanSampah,
  renderHalamanSampah,
  subscribeSampah,
} from "../sampah.js";
import { initPencarianGlobal } from "../pencarian-global.js";

import {
  bacaAksiPintasanDariUrl,
  batalkanAksiPintasanTertunda,
  jalankanAksiPintasanSetelahLayarTampil,
} from "./pintasan.js";
import {
  daftarkanServiceWorker,
  initPwaInstallPrompt,
  periksaPembaruan,
} from "./pwa.js";
import {
  perbaruiIndikatorJaringan,
  periksaStatusTokenDrive,
  mulaiPemantauTokenDrive,
  hentikanPemantauTokenDrive,
  ikatTombolPerbaruiDrive,
} from "./jaringan-token.js";
import {
  tampilkanLayarUtama,
  setPesanGalatLogin,
  bukaDialogKeluar,
  hentikanSemuaLanggananData,
  tambahUnsubscriberData,
  ikatTombolLogin,
  ikatDialogKeluar,
  tanganiNavigasiKeyboardDialogKeluar,
} from "./sesi.js";
import {
  initHalamanDashboard,
  renderDashboard,
} from "./dashboard.js";

// Re-ekspor untuk konsistensi API publik
export { hentikanSemuaLanggananData } from "./sesi.js";
export { periksaPembaruan } from "./pwa.js";

function perbaruiTanggalHeader() {
  const el = document.getElementById("header-date-text");
  if (!el) return;
  const isoLokal = hariIni();
  const tgl = parseTanggal(isoLokal);
  el.textContent = tgl
    ? `${NAMA_HARI[tgl.getDay()]}, ${tgl.getDate()} ${NAMA_BULAN[tgl.getMonth()]} ${tgl.getFullYear()}`
    : isoLokal;
}

function dokumenTautan(item) {
  return item && typeof item.tautan === "string" ? item.tautan : "";
}

function pasangEventListenerGlobal() {
  ikatTombolLogin();
  ikatTombolPerbaruiDrive();
  ikatDialogKeluar();

  document.addEventListener("keydown", (e) => {
    tanganiNavigasiKeyboardDialogKeluar(e);
  });

  window.addEventListener("online", () => perbaruiIndikatorJaringan(true));
  window.addEventListener("offline", () => perbaruiIndikatorJaringan(true));
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      !document.getElementById("app-shell")?.hidden
    ) {
      periksaStatusTokenDrive();
      perbaruiTanggalHeader();
      renderDashboard();
      renderHalamanJadwal();
      segarkanTampilanPengaturan();
    }
  });
}

export function mulaiAplikasi() {
  bacaAksiPintasanDariUrl();
  initTema();
  daftarkanServiceWorker();
  initPwaInstallPrompt();

  const ownerBadge = document.getElementById("authorized-owner-email");
  if (ownerBadge) ownerBadge.textContent = AUTHORIZED_EMAIL;

  if (!isFirebaseConfigured()) {
    tampilkanLayarUtama("config-error");
    return;
  }

  tampilkanLayarUtama("checking");

  initSidebar({
    initialSection: "dashboard",
    onLogoutRequest: (pemicu) => bukaDialogKeluar(pemicu),
    onSectionChange: (sectionId) => {
      if (sectionId === "pengaturan") {
        segarkanTampilanPengaturan();
      } else if (sectionId === "sampah") {
        renderHalamanSampah();
      }
    },
  });

  daftarkanPembukaDetailKegiatan(bukaDialogDetailKegiatan);
  daftarkanPembukaDetailKegiatanCatatan(bukaDialogDetailKegiatan);

  initHalamanKegiatan();
  initHalamanJadwal();
  initHalamanDokumen();
  initHalamanCatatan();
  initHalamanLaporan();
  initHalamanPengaturan();
  initHalamanSampah();
  initHalamanDashboard();
  pasangEventListenerGlobal();
  perbaruiTanggalHeader();
  perbaruiIndikatorJaringan(false);

  try {
    initAuth((user, _token) => {
      hentikanSemuaLanggananData();

      if (!user) {
        hentikanPemantauTokenDrive();
        perbaruiInfoAkunSidebar(null);
        const pesanPenolakan = consumeLastAuthError();
        if (pesanPenolakan) {
          batalkanAksiPintasanTertunda();
          setPesanGalatLogin(pesanPenolakan);
        }
        tampilkanLayarUtama("login");
        return;
      }

      setPesanGalatLogin("");
      perbaruiInfoAkunSidebar(user);
      perbaruiTanggalHeader();
      tampilkanLayarUtama("app");
      mulaiPemantauTokenDrive();

      const unsubKegiatan = subscribeKegiatan();
      const unsubDokumen = subscribeDokumen();
      const unsubCatatan = subscribeCatatan();
      const unsubLaporan = subscribeLaporan();
      const unsubSampah = subscribeSampah();
      tambahUnsubscriberData(
        unsubKegiatan,
        unsubDokumen,
        unsubCatatan,
        unsubLaporan,
        unsubSampah,
      );

      initPencarianGlobal({
        getDaftarKegiatan,
        getDaftarCatatan,
        getDaftarDokumen,
        onPilihHasil: (item) => {
          if (!item) return;
          if (item.kelompok === "kegiatan") {
            bukaDialogDetailKegiatan(item.id);
          } else if (item.kelompok === "catatan") {
            if (item.jenis === JENIS_CATATAN_GDOC) {
              const urlDocs = tautanAmanGoogleDocs(item);
              if (urlDocs && urlDocs !== "#") {
                window.open(urlDocs, "_blank", "noopener");
              }
            } else {
              import("../sidebar.js").then(({ pindahKeBagian }) => {
                pindahKeBagian("catatan");
                sorotCatatanDiHalaman(item.id);
              });
            }
          } else if (item.kelompok === "dokumen") {
            import("../sidebar.js").then(({ pindahKeBagian }) => {
              pindahKeBagian("dokumen");
              const tautanAman =
                item.tautan && /^https?:\/\//i.test(dokumenTautan(item))
                  ? item.tautan
                  : item.driveFileId
                    ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
                    : "";
              if (tautanAman) {
                window.open(tautanAman, "_blank", "noopener");
              }
            });
          }
        },
      });

      muatPengaturanCadangan();
      segarkanTampilanPengaturan();
      jalankanAksiPintasanSetelahLayarTampil();
    });
  } catch (err) {
    setPesanGalatLogin(formatPesanGalatAuth(err));
    tampilkanLayarUtama("login");
  }
}

mulaiAplikasi();