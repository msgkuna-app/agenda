/**
 * Layanan Google Cloud Monitoring API v3 — pemakaian Cloud Firestore
 * (dibangun ulang 2026-11-24 setelah uji API Explorer membuktikan API dapat diakses
 * pada proyek ini; versi lama dicabut di commit 2ad5a9a karena galat 403 penagihan)
 * - Membaca metrik firestore.googleapis.com/* untuk menghitung pemakaian nyata:
 *   baca, tulis, hapus (jumlah operasi) dan penyimpanan (byte).
 * - Hanya membaca (read-only); tidak mengubah konfigurasi Google Cloud.
 * - Token akses bercakupan monitoring.read diminta terpisah dari token Drive
 *   (lihat mintaTokenMonitoring di authService.js).
 * - Nama metrik utama hasil uji API Explorer (…_ops_count, storage/data_and_index_storage_bytes);
 *   bila deret kosong, dicoba nama cadangan (…_count, storage/utilization).
 * - Jendela harian mengikuti aturan kuota resmi Firestore: reset tengah malam
 *   zona waktu Pasifik (America/Los_Angeles), bukan 24 jam bergulir.
 */
import {
  MONITORING_TIMESERIES_API,
  METRIK_PEMAKAIAN_FIRESTORE,
  PERIODE_AGREGASI_PEMAKAIAN_DETIK,
  ZONA_WAKTU_KUOTA_FIRESTORE,
} from "../config/constants.js";
import { firebaseConfig } from "./firestoreService.js";
import {
  getMonitoringAccessToken,
  isMonitoringTokenExpired,
  mintaTokenMonitoring,
} from "./authService.js";

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
    } else if (
      rawLower.includes("requires billing") ||
      rawLower.includes("billing to be enabled")
    ) {
      pesan =
        "Pemakaian otomatis tidak dapat dibaca pada paket Spark: Google mensyaratkan akun penagihan aktif (paket Blaze) untuk Cloud Monitoring API. Angka batas paket di atas tetap berlaku, dan pemakaian nyata dapat dilihat lewat tautan Firebase Console di bawah. Bila penagihan diaktifkan, fitur ini langsung berjalan tanpa perubahan.";
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
  err.isBillingRequired =
    status === 403 && (rawLower.includes("requires billing") || rawLower.includes("billing to be enabled"));
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
  // Galat penagihan sudah dijelaskan lengkap; detail mentah Google hanya mengulang 403.
  const sembunyikanDetail = Boolean(err && typeof err === "object" && err.isBillingRequired);
  if (err instanceof Error && err.message) {
    return detail && !sembunyikanDetail ? `${err.message} (Detail Google: ${detail})` : err.message;
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
 * Awal hari ini (pukul 00:00) pada zona waktu Pasifik — awal jendela kuota harian resmi.
 * @param {Date} [now]
 * @returns {Date}
 */
export function awalHariPasifik(now = new Date()) {
  const bagian = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_WAKTU_KUOTA_FIRESTORE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const ambil = (tipe) => Number(bagian.find((p) => p.type === tipe)?.value || 0) % 24;
  const detikBerlalu = ambil("hour") * 3600 + ambil("minute") * 60 + ambil("second");
  return new Date(now.getTime() - detikBerlalu * 1000 - now.getMilliseconds());
}

/**
 * Mengambil deret satu metrik dari Cloud Monitoring API.
 * @param {{ metrik: string, aligner: string, pereduksi: string, mulai: Date, akhir: Date, senyap?: boolean }} opsi
 * @returns {Promise<{ nilaiPerPeriode: number[], waktuPerPeriode: string[], nilaiTerakhir: number, total: number }>}
 */
async function ambilDeretSatuMetrik({ metrik, aligner, pereduksi, mulai, akhir, senyap = false }) {
  const projectId = String(firebaseConfig?.projectId || "").trim();
  if (!projectId) {
    throw new Error("ID proyek Firebase belum dikonfigurasi pada js/config/firebase.js.");
  }

  const token = await ambilTokenMonitoringWajib({ senyap });
  if (!token) {
    throw new Error('Izin baca metrik Google Cloud belum aktif. Tekan "Muat pemakaian Firestore" untuk memberi izin.');
  }

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

  // Gabungkan seluruh deret per periode. Bila API mengembalikan beberapa deret,
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
  const terisi = gabungMaks ? nilaiPerPeriode : nilaiPerPeriode.filter((n) => n > 0);
  const nilaiTerakhir = terisi.length > 0 ? terisi[terisi.length - 1] : 0;

  return { nilaiPerPeriode, waktuPerPeriode, nilaiTerakhir, total };
}

/**
 * Membaca satu kelompok metrik dengan cadangan nama: coba nama-nama berurutan;
 * lanjut ke nama berikutnya hanya bila hasilnya kosong (bukan galat).
 * @param {{ nama: string[], aligner: string, pereduksi: string, mulai: Date, akhir: Date, senyap?: boolean }} opsi
 */
async function ambilDeretDenganCadangan({ nama, aligner, pereduksi, mulai, akhir, senyap = false }) {
  for (let i = 0; i < nama.length; i += 1) {
    const hasil = await ambilDeretSatuMetrik({
      metrik: nama[i],
      aligner,
      pereduksi,
      mulai,
      akhir,
      senyap,
    });
    if (hasil.nilaiPerPeriode.length > 0 || hasil.total > 0) {
      return hasil;
    }
  }
  // Semua nama mengembalikan kosong: proyek memang belum punya data metrik (bukan galat).
  return { nilaiPerPeriode: [], waktuPerPeriode: [], nilaiTerakhir: 0, total: 0 };
}

/**
 * Membaca pemakaian Firestore sejak awal hari kuota (tengah malam waktu Pasifik).
 * @param {{ senyap?: boolean }} [opsi] `senyap` meminta token tanpa memunculkan dialog bila memungkinkan.
 * @returns {Promise<{ baca: object, tulis: object, hapus: object, penyimpananByte: number, mulaiJendela: string, diperbaruiPada: string }>}
 */
export async function ambilPemakaianFirestore(opsi = {}) {
  const senyap = Boolean(opsi.senyap);
  const akhir = new Date();
  const mulai = awalHariPasifik(akhir);

  const [baca, tulis, hapus] = await Promise.all([
    ambilDeretDenganCadangan({ nama: METRIK_PEMAKAIAN_FIRESTORE.baca, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", mulai, akhir, senyap }),
    ambilDeretDenganCadangan({ nama: METRIK_PEMAKAIAN_FIRESTORE.tulis, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", mulai, akhir, senyap }),
    ambilDeretDenganCadangan({ nama: METRIK_PEMAKAIAN_FIRESTORE.hapus, aligner: "ALIGN_SUM", pereduksi: "REDUCE_SUM", mulai, akhir, senyap }),
  ]);

  // Metrik penyimpanan bersifat pelengkap: bila tidak tersedia, kartu tetap menampilkan
  // angka baca/tulis/hapus dan menandai penyimpanan sebagai tidak tersedia (-1).
  let penyimpananByte = -1;
  try {
    const penyimpanan = await ambilDeretDenganCadangan({
      nama: METRIK_PEMAKAIAN_FIRESTORE.penyimpanan,
      aligner: "ALIGN_MAX",
      pereduksi: "REDUCE_MAX",
      mulai,
      akhir,
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
    mulaiJendela: mulai.toISOString(),
    diperbaruiPada: akhir.toISOString(),
  };
}
