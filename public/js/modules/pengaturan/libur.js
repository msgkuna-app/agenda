/**
 * State Hari Libur & Hari Besar (Tahap 6e: dipecah dari pengaturan/state.js)
 * Pengaturan hari libur/hari besar: penyimpanan Firestore + salinan localStorage,
 * pemberitahuan perubahan ke view/controller.
 * TIDAK menyentuh DOM. Nama berkas sengaja "libur.js" (bukan "hari-libur.js")
 * agar tidak tertukar dengan utilitas akar js/hari-libur.js.
 */
import {
  KUNCI_STORAGE_HARI_LIBUR,
  KOLEKSI,
  DOK_PENGATURAN,
} from "../../config/constants.js";
import { ambilSatu, simpanItem } from "../../services/firestoreRepository.js";
import {
  setelKonfigurasi,
  ambilKonfigurasiAktif,
} from "../../hari-libur.js";

const pemberitahuHariLibur = new Set();

export function onPerubahanHariLibur(fn) {
  if (typeof fn === "function") {
    pemberitahuHariLibur.add(fn);
    return () => pemberitahuHariLibur.delete(fn);
  }
  return () => {};
}

function beritahuPerubahanHariLibur(cfg) {
  pemberitahuHariLibur.forEach((fn) => {
    try { fn(cfg); } catch (_e) {}
  });
}

export function bacaPengaturanHariLiburLokal() {
  try {
    const raw = localStorage.getItem(KUNCI_STORAGE_HARI_LIBUR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setelKonfigurasi(parsed);
        return ambilKonfigurasiAktif();
      }
    }
  } catch (_e) {}
  return ambilKonfigurasiAktif();
}

export async function muatPengaturanHariLibur() {
  bacaPengaturanHariLiburLokal();
  try {
    const data = await ambilSatu(KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR);
    if (data) {
      const cfg = {
        entri: Array.isArray(data.entri) ? data.entri : [],
        disembunyikan: Array.isArray(data.disembunyikan) ? data.disembunyikan : [],
        tampilkanCutiMerah: typeof data.tampilkanCutiMerah === "boolean" ? data.tampilkanCutiMerah : true,
        tampilkanHariBesar: typeof data.tampilkanHariBesar === "boolean" ? data.tampilkanHariBesar : true,
        updatedAt: data.updatedAt || new Date().toISOString()
      };
      setelKonfigurasi(cfg);
      try {
        localStorage.setItem(KUNCI_STORAGE_HARI_LIBUR, JSON.stringify(cfg));
      } catch (_e) {}
      beritahuPerubahanHariLibur(cfg);
      return cfg;
    }
  } catch (_err) {
    // Mode offline: tetap menggunakan data lokal
  }
  return ambilKonfigurasiAktif();
}

export async function simpanPengaturanHariLibur(cfgBaru) {
  const sekarangIso = new Date().toISOString();
  const cfg = {
    entri: Array.isArray(cfgBaru.entri) ? cfgBaru.entri : [],
    disembunyikan: Array.isArray(cfgBaru.disembunyikan) ? cfgBaru.disembunyikan : [],
    tampilkanCutiMerah: typeof cfgBaru.tampilkanCutiMerah === "boolean" ? cfgBaru.tampilkanCutiMerah : true,
    tampilkanHariBesar: typeof cfgBaru.tampilkanHariBesar === "boolean" ? cfgBaru.tampilkanHariBesar : true,
    updatedAt: sekarangIso
  };

  setelKonfigurasi(cfg);
  try {
    localStorage.setItem(KUNCI_STORAGE_HARI_LIBUR, JSON.stringify(cfg));
  } catch (_e) {}

  beritahuPerubahanHariLibur(cfg);
  // Render tabel dikerjakan view lewat onPerubahanHariLibur (lihat controller).

  try {
    await simpanItem(KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR, cfg);
  } catch (err) {
    console.warn("Gagal menyimpan ke Firestore pengaturan/hariLibur:", err);
  }
  return cfg;
}

export function ambilKonfigurasiHariLiburUntukCadangan() {
  return ambilKonfigurasiAktif();
}
