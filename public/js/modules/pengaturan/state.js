/**
 * State Modul Pengaturan (Tahap 3b: dipisah dari pengaturan.js)
 * - Pengaturan hari libur & hari besar (penyimpanan Firestore + salinan localStorage).
 * - Status & interval pengingat cadangan (ekspor JSON).
 * - Daftar koleksi yang ikut diekspor/diimpor.
 *
 * Aturan: berkas ini tidak menyentuh DOM dan tidak mengimpor modul tampilan.
 * Import ke view/controller sebaiknya lewat ./index.js agar API publik tetap satu pintu.
 */
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  KUNCI_STORAGE_CADANGAN_TUNDA,
  KUNCI_STORAGE_HARI_LIBUR,
  KOLEKSI,
  DOK_PENGATURAN,
} from "../../config/constants.js";
import {
  getFirestoreDb,
  doc,
  getDoc,
  setDoc,
} from "../../services/firestoreService.js";
import {
  hariIni,
  parseTanggal,
  tanggalLokal,
  tambahHari,
} from "../../util-tanggal.js";
import {
  setelKonfigurasi,
  ambilKonfigurasiAktif,
} from "../../hari-libur.js";

// ============================================================================
// Pengaturan Hari Libur & Hari Besar
// ============================================================================

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
    const db = getFirestoreDb();
    const docRef = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
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
    const db = getFirestoreDb();
    await setDoc(doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.HARI_LIBUR), cfg, { merge: true });
  } catch (err) {
    console.warn("Gagal menyimpan ke Firestore pengaturan/hariLibur:", err);
  }
  return cfg;
}

export function ambilKonfigurasiHariLiburUntukCadangan() {
  return ambilKonfigurasiAktif();
}

// ============================================================================
// Status & Pengingat Cadangan (Ekspor JSON)
// ============================================================================

export const statusCadangan = {
  terakhirEksporAt: null,
  intervalHari: 14,
  sudahDimuat: false
};

const pemberitahuCadangan = new Set();

export function onPerubahanCadangan(fn) {
  if (typeof fn === "function") {
    pemberitahuCadangan.add(fn);
    return () => pemberitahuCadangan.delete(fn);
  }
  return () => {};
}

/**
 * Memberitahu semua pelanggan status cadangan.
 * Dipakai internal state dan oleh proses ekspor (controller) setelah menulis waktu ekspor.
 */
export function beritahuPerubahanCadangan() {
  pemberitahuCadangan.forEach((fn) => {
    try { fn(statusCadangan); } catch (_e) {}
  });
}

export function getStatusCadangan() {
  if (!statusCadangan.sudahDimuat) {
    try {
      const tersimpan = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
      if (tersimpan) statusCadangan.terakhirEksporAt = tersimpan;
      const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
      if (inv !== null && !Number.isNaN(Number(inv))) {
        statusCadangan.intervalHari = Number(inv);
      }
    } catch (_e) {}
  }
  return { ...statusCadangan };
}

export function hitungSelisihHariCadangan(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const tglTerakhirStr = tanggalLokal(d);
  const tglSekarangStr = hariIni();
  const p1 = parseTanggal(tglTerakhirStr);
  const p2 = parseTanggal(tglSekarangStr);
  if (!p1 || !p2) return null;
  const utc1 = Date.UTC(p1.getFullYear(), p1.getMonth(), p1.getDate());
  const utc2 = Date.UTC(p2.getFullYear(), p2.getMonth(), p2.getDate());
  const msPerHari = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((utc2 - utc1) / msPerHari));
}

export async function muatPengaturanCadangan() {
  let terakhir = null;
  let interval = 14;
  let terakhirLokal = null;
  let intervalLokal = null;

  try {
    const t = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
    if (t) terakhir = t;
    terakhirLokal = terakhir;
    const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
    if (inv !== null && !Number.isNaN(Number(inv))) {
      interval = Number(inv);
      intervalLokal = interval;
    }
  } catch (_e) {}

  let perluTulisUlangServer = false;

  try {
    const db = getFirestoreDb();
    const docRef = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.CADANGAN);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      // Pilih waktu ekspor yang PALING BARU. Dulu nilai server selalu menimpa salinan
      // lokal sehingga ekspor yang berhasil offline (atau yang tulis servernya gagal)
      // terasa hilang — pengingat pun muncul lagi setiap hari.
      if (data.terakhirEksporAt && (!terakhir || String(data.terakhirEksporAt) > terakhir)) {
        terakhir = String(data.terakhirEksporAt);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_TERAKHIR, terakhir);
        } catch (_e2) {}
      } else if (terakhirLokal && String(data.terakhirEksporAt || "") < terakhirLokal) {
        perluTulisUlangServer = true;
      }
      // Salinan lokal diutamakan karena perubahan interval bisa saja belum tersimpan
      // ke server (mis. saat luring).
      if (intervalLokal === null && data.intervalHari !== undefined && Number.isFinite(Number(data.intervalHari))) {
        interval = Number(data.intervalHari);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(interval));
        } catch (_e3) {}
      }
    } else if (terakhirLokal) {
      perluTulisUlangServer = true;
    }

    // Pulihkan catatan server bila salinan lokal lebih baru (mis. tulis sebelumnya gagal
    // saat jaringan putus), supaya pengingat tidak muncul lagi pada sesi berikutnya.
    if (perluTulisUlangServer) {
      const pemulihan = { terakhirEksporAt: terakhirLokal, updatedAt: new Date().toISOString() };
      if (intervalLokal !== null) pemulihan.intervalHari = intervalLokal;
      try {
        await setDoc(docRef, pemulihan, { merge: true });
      } catch (_e4) {
        // Biarkan; salinan lokal tetap dipakai
      }
    }
  } catch (_err) {
    // Offline: tetap gunakan salinan lokal dari localStorage
  }

  statusCadangan.terakhirEksporAt = terakhir;
  statusCadangan.intervalHari = interval;
  statusCadangan.sudahDimuat = true;

  beritahuPerubahanCadangan();

  return { ...statusCadangan };
}

/**
 * Menyimpan interval pengingat cadangan. Penggeseran tampilan dikerjakan controller
 * lewat onPerubahanCadangan (agar state.js tetap tanpa DOM).
 */
export async function simpanIntervalCadangan(intervalBaru) {
  const inv = Number(intervalBaru);
  statusCadangan.intervalHari = inv;

  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(inv));
  } catch (_e) {}

  try {
    const db = getFirestoreDb();
    await setDoc(doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.CADANGAN), {
      intervalHari: inv,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (_err) {
    // Jika gagal (offline), salinan lokal sudah tersimpan
  }

  beritahuPerubahanCadangan();
}

export function tundaPengingatCadangan(hari = 3) {
  const tundaSampai = tambahHari(hari);
  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_TUNDA, tundaSampai);
  } catch (_e) {}

  beritahuPerubahanCadangan();
}

export function apakahSedangMenundaCadangan() {
  try {
    const tundaSampai = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TUNDA);
    if (!tundaSampai) return false;
    return hariIni() <= tundaSampai;
  } catch (_e) {
    return false;
  }
}

/** Mengambil ISO waktu ekspor terakhir (dipakai layar tertentu). */
export function getStatusCadanganMentah() {
  return { ...statusCadangan };
}

// ============================================================================
// Daftar koleksi cadangan
// ============================================================================

export const KOLEKSI_CADANGAN = [
  { key: "kategoriKegiatan", label: "Kategori Kegiatan" },
  { key: "kegiatan", label: "Kegiatan" },
  { key: "kategoriDokumen", label: "Kategori Dokumen" },
  { key: "dokumen", label: "Dokumen (Metadata Drive)" },
  { key: "catatan", label: "Catatan & Metadata Google Docs" },
  { key: "laporan", label: "Riwayat Laporan (Metadata Sheets)" }
];
