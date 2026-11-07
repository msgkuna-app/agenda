/**
 * Modul Utama Pengaturan & Cadangan (Agenda & Arsip)
 * Mengorkestrasikan inisialisasi antarmuka, penangan event, dan re-ekspor seluruh fungsi publik.
 */
import { manajerKategoriKegiatan, onPerubahanKegiatan } from "../kegiatan.js";
import { manajerKategoriDokumen, onPerubahanDokumen } from "../dokumen.js";
import { onPerubahanCatatan } from "../catatan.js";
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  onPerubahanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  getStatusUiPengaturan,
  setStatusUiPengaturan
} from "./state.js";
import {
  KOLEKSI_CADANGAN,
  setUmpanBalikPengaturan,
  setStatusCekPembaruan
} from "./util.js";
import {
  muatPengaturanCadangan,
  simpanIntervalCadangan as simpanIntervalCadanganData,
  jalankanMigrasiDihapusAt
} from "./data.js";
import {
  tanganiMasukUlangDrivePengaturan,
  tanganiSinkronkanSemuaFolder,
  tanganiPeriksaPembaruanSw
} from "./akun-drive.js";
import { eksporSeluruhDataJson } from "./ekspor.js";
import {
  uraiBerkasJsonCadangan,
  batalkanPratinjauImpor,
  tampilkanPratinjauImpor,
  jalankanImporDataBatch
} from "./impor.js";
import {
  pastikanKerangkaHalamanPengaturan,
  segarkanTampilanPengaturan,
  perbaruiInfoVersiSwDiDom
} from "./render.js";

export {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KOLEKSI_CADANGAN,
  onPerubahanCadangan,
  getStatusCadangan,
  hitungSelisihHariCadangan,
  muatPengaturanCadangan,
  tundaPengingatCadangan,
  apakahSedangMenundaCadangan,
  segarkanTampilanPengaturan,
  eksporSeluruhDataJson,
  jalankanMigrasiDihapusAt
};

export async function simpanIntervalCadangan(intervalBaru) {
  await simpanIntervalCadanganData(intervalBaru, segarkanTampilanPengaturan);
}

export function initHalamanPengaturan() {
  pastikanKerangkaHalamanPengaturan();
  perbaruiInfoVersiSwDiDom();
  segarkanTampilanPengaturan();

  const ui = getStatusUiPengaturan();
  if (ui.antarmukaSudahDiikat) return;
  setStatusUiPengaturan({ antarmukaSudahDiikat: true });

  const panel = document.getElementById("section-pengaturan");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("#btn-settings-relogin-drive")) {
        tanganiMasukUlangDrivePengaturan();
      } else if (target.closest("#btn-settings-sync-all-folders")) {
        tanganiSinkronkanSemuaFolder();
      } else if (target.closest("#btn-settings-check-update")) {
        tanganiPeriksaPembaruanSw();
      } else if (target.closest("#btn-settings-export-json")) {
        eksporSeluruhDataJson();
      } else if (target.closest("#btn-settings-migrate-dihapusat")) {
        jalankanMigrasiDihapusAt();
      } else if (target.closest("#btn-settings-cancel-import")) {
        batalkanPratinjauImpor();
      } else if (target.closest("#btn-settings-confirm-import")) {
        jalankanImporDataBatch();
      }
    });

    const intervalSelect = panel.querySelector("#settings-backup-interval-select");
    if (intervalSelect instanceof HTMLSelectElement) {
      intervalSelect.addEventListener("change", () => {
        simpanIntervalCadangan(intervalSelect.value);
      });
    }
  }

  const inputImport = document.getElementById("settings-import-file");
  if (inputImport instanceof HTMLInputElement) {
    inputImport.addEventListener("change", async () => {
      setUmpanBalikPengaturan("");
      const berkas = inputImport.files && inputImport.files[0];
      if (!berkas) {
        batalkanPratinjauImpor();
        return;
      }

      try {
        const teks = await berkas.text();
        const dataUrai = uraiBerkasJsonCadangan(teks);
        setStatusUiPengaturan({
          dataSiapImpor: dataUrai,
          namaBerkasImpor: berkas.name
        });
        tampilkanPratinjauImpor();
      } catch (err) {
        batalkanPratinjauImpor();
        setUmpanBalikPengaturan(
          err instanceof Error ? err.message : "Gagal membaca berkas JSON cadangan.",
          "danger"
        );
      }
    });
  }

  manajerKategoriDokumen.onChange(() => segarkanTampilanPengaturan());
  manajerKategoriKegiatan.onChange(() => segarkanTampilanPengaturan());
  onPerubahanKegiatan(() => segarkanTampilanPengaturan());
  onPerubahanDokumen(() => segarkanTampilanPengaturan());
  onPerubahanCatatan(() => segarkanTampilanPengaturan());

  window.addEventListener("online", segarkanTampilanPengaturan);
  window.addEventListener("offline", segarkanTampilanPengaturan);
}

export function resetHalamanPengaturanSaatKeluar() {
  batalkanPratinjauImpor();
  setUmpanBalikPengaturan("");
  setStatusCekPembaruan("");
  const summaryBox = document.getElementById("settings-import-summary-box");
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
}