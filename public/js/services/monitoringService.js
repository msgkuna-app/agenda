/**
 * Layanan Google Cloud Monitoring API v3 — pemakaian Cloud Firestore
 * - Membaca metrik firestore.googleapis.com/* untuk menghitung pemakaian nyata:
 *   baca, tulis, hapus (jumlah operasi) dan penyimpanan (byte).
 * - Hanya membaca (read-only); tidak mengubah konfigurasi Google Cloud.
 * - Token akses bercakupan monitoring.read diminta terpisah dari token Drive
 *   (lihat mintaTokenMonitoring di authService.js).
 * - Kendala yang ditangani: API belum diaktifkan (403), cakupan ditolak (401/403),
 *   luring, dan metrik kosong (proyek belum punya data).
 */
import {
  MONITORING_TIMESERIES_API,
  JENDELA_PEMAKAIAN_FIRESTORE_JAM,
  PERIODE_AGREGASI_PEMAKAIAN_DETIK,
} from "../config/constants.js";
import { firebaseConfig } from "./firestoreService.js";
import {
  getMonitoringAccessToken,
  isMonitoringTokenExpired,
  mintaTokenMonitoring,
} from "./authService.js";

const METRIK = Object.freeze({
  baca: "firestore.googleapis.com/document/read_count",
  tulis: "firestore.googleapis.com/document/write_count",
  hapus: "firestore.googleapis.com/document/delete_count",
  penyimpanan: "firestore.googleapis.com/storage/utilization",
});

/** Membuat galat terstruktur untuk kendala Cloud Monitoring API. */
function buatGalatMonitoring(status, pesanAsli, alasanKode = "") {
  let pesan = "Terjadi kesalahan saat membaca metrik pemakaian Firestore.";
  const rawLower = String(pesanAsli || "").toLowerCase();
  const reasonLower = String(alasanKode || "").toLowerCase();

  if (!navigator.onLine) {
    pesan = "Tidak ada koneksi internet. Pemakaian Firestore memerlukan sambungan aktif.";
  } else if (status === 401) {
    pesan = 'Izin baca metrik Google Cloud belum aktif. Tekan "Muat pemakaian Firestore" untuk memperbarui izin.';
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("is disabled")
    ) {
      pesan =
        "Cloud Monitoring API belum diaktifkan pada proyek Google Cloud ini. Aktifkan di Cloud Console (APIs & Services → Library → Cloud Monitoring API), lalu coba lagi. Pengaktifan API gratis dan tidak mengurangi kuota Spark.";
    } else if (reasonLower.includes("permissiondenied") || rawLower.includes("permission")) {
      pesan = "Akun Google ini tidak berhak membaca metrik proyek tersebut (403). Pastikan memakai akun pemilik proyek.";
    } else {
      pesan = `Permintaan metrik ditolak Google (403)${pesanAsli ? `: ${pesanAsli}` : "."}`;
    }
  } else if (status === 429) {
    pesan = "Terlalu banyak permintaan ke Cloud Monitoring API. Coba lagi beberapa saat.";
  } else if (pesanAsli) {
    pesan = `Kendala Cloud Monitoring (${status}): ${pesanAsli}`;
  }

  const err = new Error(pesan);
  err.status = status;
  err.reason = alasanKode;
  err.detail = String(pesanAsli || "").slice(0, 300);
  err.isApiDisabled = status === 403;
  err.isUnauthorized = status === 401;
  err.isTokenExpired = status === 401;
  return err;
}

/** Menerjemahkan sembarang galat pemakaian Firestore ke pesan yang jelas. */
export function formatPesanGalatMonitoring(err) {
  if (!navigator.onLine) {
    return "Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.";
  }
  const detail =
    err && typeof err === "object" && typeof err.detail === "string" ? err.detail.trim() : "";
  if (err instanceof Error && err.message) {
    return detail ? `${err.message} (Detail Google: ${detail})` : err.message;
  }
  return "Terjadi kesalahan saat membaca pemakaian Firestore.";
}

/** Memastikan token Cloud Monitoring siap dipakai (dengan pembaruan otomatis bila kedaluwarsa). */
async function ambilTokenMonitoringWajib({ senyap = false } = {}) {
  if (!navigator.onLine) {
    const errOffline = new Error(
      "Tidak ada koneksi internet. Pemakaian Firestore memerlukan sambungan aktif."
    );
    errOffline.isOffline = true;
    throw errOffline;
  }

  if (isMonitoringTokenExpired()) {
    const hasil = await mintaTokenMonitoring({ senyap });
    return String(hasil?.token || "");
  }
  return String(getMonitoringAccessToken() || "");
}

/** Membaca satu nilai angka dari point Cloud Monitoring (int64Value atau doubleValue). */
function nilaiPoint(point) {
  const nilai = point && typeof point === "object" ? point.value : null;
  if (!nilai || typeof nilai !== "object") return 0;
  const angka = Number(
    nilai.int64Value !== undefined ? nilai.int64Value : nilai.doubleValue !== undefined ? nilai.doubleValue : 0
  );
  return Number.isFinite(angka) ? angka : 0;
}

/**
 * Mengambil deret metrik Firestore dari Cloud Monitoring API.
 * @param {{ metrik: string, aligner: string, pereduksi: string, senyap?: boolean }} opsi
 * @returns {Promise<{ nilaiPerPeriode: number[], nilaiTerakhir: number, total: number }>}
 */
async function ambilDeretMetrik({ metrik, aligner, pereduksi, senyap = false }) {
  const projectId = String(firebaseConfig?.projectId || "").trim();
  if (!projectId) {
    throw new Error("ID proyek Firebase belum dikonfigurasi pada js/config/firebase.js.");
  }

  const token = await ambilTokenMonitoringWajib({ senyap });
  if (!token) {
    throw new Error('Izin baca metrik Google Cloud belum aktif. Tekan "Muat pemakaian Firestore" untuk memberi izin.');
  }

  const akhir = new Date();
  const mulai = new Date(akhir.getTime() - JENDELA_PEMAKAIAN_FIRESTORE_JAM * 60 * 60 * 1000);

  const params = new URLSearchParams({
    filter: `metric.type="${metrik}"`,
    "interval.startTime": mulai.toISOString(),
    "interval.endTime": akhir.toISOString(),
    "aggregation.alignmentPeriod": `${PERIODE_AGREGASI_PEMAKAIAN_DETIK}s`,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.crossSeriesReducer": pereduksi,
  });

  let resp;
  try {
    resp = await fetch(`${MONITORING_TIMESERIES_API}/${encodeURIComponent(projectId)}/timeSeries?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (_netErr) {
    throw new Error("Gagal menghubungi Cloud Monitoring API. Periksa koneksi internet Anda.");
  }

  if (!resp.ok) {
    let pesanAsli = "";
    let alasan = "";
    try {
      const isi = await resp.json();
      pesanAsli = String(isi?.error?.message || "");
      alasan = String(isi?.error?.status || "");
    } catch (_e) {}
    throw buatGalatMonitoring(resp.status, pesanAsli, alasan);
  }

  const data = await resp.json().catch(() => null);
  const deret = Array.isArray(data?.timeSeries) ? data.timeSeries : [];

  // Gabungkan seluruh deret per periode. Bila API tetap mengembalikan beberapa deret,
  // metrik hitungan dijumlahkan dan metrik penyimpanan diambil nilai maksimumnya.
  const gabungMaks = pereduksi === "REDUCE_MAX";
  const perPeriode = new Map();
  deret.forEach((seri) => {
    (Array.isArray(seri?.points) ? seri.points : []).forEach((p) => {
      const kunci = String(p?.interval?.endTime || "");
      const nilai = nilaiPoint(p);
      const sebelumnya = perPeriode.get(kunci);
      if (sebelumnya === undefined) {
        perPeriode.set(kunci, nilai);
      } else {
        perPeriode.set(kunci, gabungMaks ? Math.max(sebelumnya, nilai) : sebelumnya + nilai);
      }
    });
  });

  // API mengembalikan titik terbaru lebih dahulu; urutkan naik agar grafik terbaca kronologis.
  const waktuPerPeriode = Array.from(perPeriode.keys()).sort();
  const nilaiPerPeriode = waktuPerPeriode.map((k) => Number(perPeriode.get(k)) || 0);
  const total = nilaiPerPeriode.reduce((acc, n) => acc + n, 0);
  // Bucket terakhir bisa masih kosong karena metrik tertunda; pakai nilai terakhir yang terisi.
  const terisi = nilaiPerPeriode.filter((n) => n > 0);
  const nilaiTerakhir = terisi.length > 0 ? terisi[terisi.length - 1] : 0;

  return { nilaiPerPeriode, waktuPerPeriode, nilaiTerakhir, total };
}

/**
 * Membaca pemakaian Firestore pada jendela waktu terakhir (default 24 jam).
 * @param {{ senyap?: boolean }} [opsi] `senyap` meminta token tanpa memunculkan dialog bila memungkinkan.
 * @returns {Promise<{ baca: object, tulis: object, hapus: object, penyimpananByte: number, jendelaJam: number, diperbaruiPada: string }>}
 */
export async function ambilPemakaianFirestore(opsi = {}) {
  const senyap = Boolean(opsi.senyap);

  const [baca, tulis, hapus] = await Promise.all([
    ambilDeretMetrik({ metrik: METRIK.baca, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", senyap }),
    ambilDeretMetrik({ metrik: METRIK.tulis, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", senyap }),
    ambilDeretMetrik({ metrik: METRIK.hapus, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", senyap }),
  ]);

  // Metrik penyimpanan bersifat pelengkap: bila tidak tersedia, kartu tetap menampilkan
  // angka baca/tulis/hapus dan menandai penyimpanan sebagai tidak tersedia (-1).
  let penyimpananByte = -1;
  try {
    const penyimpanan = await ambilDeretMetrik({
      metrik: METRIK.penyimpanan,
      aligner: "ALIGN_MAX",
      pereduksi: "REDUCE_MAX",
      senyap,
    });
    penyimpananByte = Math.max(0, Number(penyimpanan.nilaiTerakhir) || 0);
  } catch (_errPenyimpanan) {
    penyimpananByte = -1;
  }

  return {
    baca,
    tulis,
    hapus,
    penyimpananByte,
    jendelaJam: JENDELA_PEMAKAIAN_FIRESTORE_JAM,
    diperbaruiPada: new Date().toISOString(),
  };
}
