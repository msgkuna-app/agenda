/**
 * Modul Data dan Logika Hari Libur Nasional, Cuti Bersama, dan Hari Besar (Tahap 1 & 2)
 * Sumber Data Bawaan: SKB 3 Menteri 2026 dan 2027 (Sekretariat Negara).
 * Fungsi-fungsi dalam berkas ini murni (tanpa akses jaringan atau DOM).
 */
import { parseTanggal } from "./util-tanggal.js";

/**
 * Data bawaan hari libur nasional dan cuti bersama 2026 & 2027.
 * Jumlah:
 * - 2026: 17 libur + 8 cuti = 25
 * - 2027: 18 libur + 8 cuti = 26
 */
export const DATA_HARI_LIBUR_BAWAAN = [
  // --- 2026: Libur Nasional (17) ---
  { tanggal: "2026-01-01", nama: "Tahun Baru 2026 Masehi", jenis: "libur" },
  { tanggal: "2026-01-16", nama: "Isra Mikraj Nabi Muhammad saw.", jenis: "libur" },
  { tanggal: "2026-02-17", nama: "Tahun Baru Imlek 2577 Kongzili", jenis: "libur" },
  { tanggal: "2026-03-19", nama: "Hari Suci Nyepi (Tahun Baru Saka 1948)", jenis: "libur" },
  { tanggal: "2026-03-21", nama: "Idulfitri 1447 H", jenis: "libur" },
  { tanggal: "2026-03-22", nama: "Idulfitri 1447 H", jenis: "libur" },
  { tanggal: "2026-04-03", nama: "Wafat Yesus Kristus", jenis: "libur" },
  { tanggal: "2026-04-05", nama: "Kebangkitan Yesus Kristus (Paskah)", jenis: "libur" },
  { tanggal: "2026-05-01", nama: "Hari Buruh Internasional", jenis: "libur" },
  { tanggal: "2026-05-14", nama: "Kenaikan Yesus Kristus", jenis: "libur" },
  { tanggal: "2026-05-27", nama: "Iduladha 1447 H", jenis: "libur" },
  { tanggal: "2026-05-31", nama: "Hari Raya Waisak 2570 BE", jenis: "libur" },
  { tanggal: "2026-06-01", nama: "Hari Lahir Pancasila", jenis: "libur" },
  { tanggal: "2026-06-16", nama: "1 Muharam Tahun Baru Islam 1448 H", jenis: "libur" },
  { tanggal: "2026-08-17", nama: "Proklamasi Kemerdekaan", jenis: "libur" },
  { tanggal: "2026-08-25", nama: "Maulid Nabi Muhammad saw.", jenis: "libur" },
  { tanggal: "2026-12-25", nama: "Kelahiran Yesus Kristus (Natal)", jenis: "libur" },

  // --- 2026: Cuti Bersama (8) ---
  { tanggal: "2026-02-16", nama: "Cuti Bersama Tahun Baru Imlek 2577 Kongzili", jenis: "cuti" },
  { tanggal: "2026-03-18", nama: "Cuti Bersama Hari Suci Nyepi", jenis: "cuti" },
  { tanggal: "2026-03-20", nama: "Cuti Bersama Idulfitri 1447 H", jenis: "cuti" },
  { tanggal: "2026-03-23", nama: "Cuti Bersama Idulfitri 1447 H", jenis: "cuti" },
  { tanggal: "2026-03-24", nama: "Cuti Bersama Idulfitri 1447 H", jenis: "cuti" },
  { tanggal: "2026-05-15", nama: "Cuti Bersama Kenaikan Yesus Kristus", jenis: "cuti" },
  { tanggal: "2026-05-28", nama: "Cuti Bersama Iduladha 1447 H", jenis: "cuti" },
  { tanggal: "2026-12-24", nama: "Cuti Bersama Kelahiran Yesus Kristus (Natal)", jenis: "cuti" },

  // --- 2027: Libur Nasional (18) ---
  { tanggal: "2027-01-01", nama: "Tahun Baru 2027 Masehi", jenis: "libur" },
  { tanggal: "2027-01-05", nama: "Isra Mikraj Nabi Muhammad saw.", jenis: "libur" },
  { tanggal: "2027-02-06", nama: "Tahun Baru Imlek 2578 Kongzili", jenis: "libur" },
  { tanggal: "2027-03-08", nama: "Hari Suci Nyepi (Tahun Baru Saka 1949)", jenis: "libur" },
  { tanggal: "2027-03-10", nama: "Idulfitri 1448 H", jenis: "libur" },
  { tanggal: "2027-03-11", nama: "Idulfitri 1448 H", jenis: "libur" },
  { tanggal: "2027-03-26", nama: "Wafat Yesus Kristus", jenis: "libur" },
  { tanggal: "2027-03-28", nama: "Kebangkitan Yesus Kristus (Paskah)", jenis: "libur" },
  { tanggal: "2027-05-01", nama: "Hari Buruh Internasional", jenis: "libur" },
  { tanggal: "2027-05-06", nama: "Kenaikan Yesus Kristus", jenis: "libur" },
  { tanggal: "2027-05-17", nama: "Iduladha 1448 H", jenis: "libur" },
  { tanggal: "2027-05-20", nama: "Hari Raya Waisak 2571 BE", jenis: "libur" },
  { tanggal: "2027-06-01", nama: "Hari Lahir Pancasila", jenis: "libur" },
  { tanggal: "2027-06-06", nama: "1 Muharam Tahun Baru Islam 1449 H", jenis: "libur" },
  { tanggal: "2027-08-15", nama: "Maulid Nabi Muhammad saw.", jenis: "libur" },
  { tanggal: "2027-08-17", nama: "Proklamasi Kemerdekaan", jenis: "libur" },
  { tanggal: "2027-12-25", nama: "Kelahiran Yesus Kristus (Natal)", jenis: "libur" },
  { tanggal: "2027-12-26", nama: "Isra Mikraj Nabi Muhammad saw.", jenis: "libur" },

  // --- 2027: Cuti Bersama (8) ---
  { tanggal: "2027-02-05", nama: "Cuti Bersama Tahun Baru Imlek 2578 Kongzili", jenis: "cuti" },
  { tanggal: "2027-03-09", nama: "Cuti Bersama Idulfitri 1448 H", jenis: "cuti" },
  { tanggal: "2027-03-12", nama: "Cuti Bersama Idulfitri 1448 H", jenis: "cuti" },
  { tanggal: "2027-03-15", nama: "Cuti Bersama Idulfitri 1448 H", jenis: "cuti" },
  { tanggal: "2027-03-25", nama: "Cuti Bersama Wafat Yesus Kristus", jenis: "cuti" },
  { tanggal: "2027-05-18", nama: "Cuti Bersama Iduladha 1448 H", jenis: "cuti" },
  { tanggal: "2027-05-19", nama: "Cuti Bersama Waisak 2571 BE", jenis: "cuti" },
  { tanggal: "2027-12-24", nama: "Cuti Bersama Kelahiran Yesus Kristus (Natal)", jenis: "cuti" }
];

/**
 * Hari besar nasional tetap (bukan tanggal merah, tanggal sama setiap tahun).
 */
export const HARI_BESAR_TETAP = [
  { bulan: 4, tanggal: 21, nama: "Hari Kartini" },
  { bulan: 5, tanggal: 2, nama: "Hari Pendidikan Nasional" },
  { bulan: 5, tanggal: 20, nama: "Hari Kebangkitan Nasional" },
  { bulan: 7, tanggal: 23, nama: "Hari Anak Nasional" },
  { bulan: 10, tanggal: 28, nama: "Hari Sumpah Pemuda" },
  { bulan: 11, tanggal: 10, nama: "Hari Pahlawan" },
  { bulan: 11, tanggal: 25, nama: "Hari Guru Nasional" },
  { bulan: 12, tanggal: 22, nama: "Hari Ibu" }
];

/**
 * Menghasilkan kunci entri untuk penyembunyian.
 * @param {string} tanggal - YYYY-MM-DD
 * @param {string} nama
 * @returns {string}
 */
export function kunciEntri(tanggal, nama) {
  return `${String(tanggal || "").trim()}|${String(nama || "").trim()}`;
}

// State konfigurasi internal
let entriPengguna = [];
let himpunanDisembunyikan = new Set();
let opsiTampilkanCutiMerah = true;
let opsiTampilkanHariBesar = true;

// Struktur cepat: Map tanggal (YYYY-MM-DD) -> Array entri { nama, jenis, bawaan, id }
const petaTanggalKeEntri = new Map();
// Set tahun yang memiliki data (bawaan atau tambahan pengguna)
const himpunanTahunTercakup = new Set([2026, 2027]);

/**
 * Membangun ulang Map pencarian tanggal berdasarkan konfigurasi aktif.
 */
function bangunUlangPeta() {
  petaTanggalKeEntri.clear();
  himpunanTahunTercakup.clear();
  himpunanTahunTercakup.add(2026);
  himpunanTahunTercakup.add(2027);

  // 1. Masukkan entri bawaan (jika tidak disembunyikan)
  for (const bawaan of DATA_HARI_LIBUR_BAWAAN) {
    const k = kunciEntri(bawaan.tanggal, bawaan.nama);
    if (himpunanDisembunyikan.has(k)) {
      continue;
    }
    if (!petaTanggalKeEntri.has(bawaan.tanggal)) {
      petaTanggalKeEntri.set(bawaan.tanggal, []);
    }
    petaTanggalKeEntri.get(bawaan.tanggal).push({
      nama: bawaan.nama,
      jenis: bawaan.jenis,
      bawaan: true
    });
  }

  // 2. Masukkan entri tambahan pengguna
  for (const u of entriPengguna) {
    if (!u || !u.tanggal || !u.nama) continue;
    const tgl = String(u.tanggal).trim();
    const thn = Number(tgl.slice(0, 4));
    if (Number.isFinite(thn) && thn > 1900) {
      himpunanTahunTercakup.add(thn);
    }
    if (!petaTanggalKeEntri.has(tgl)) {
      petaTanggalKeEntri.set(tgl, []);
    }
    petaTanggalKeEntri.get(tgl).push({
      id: u.id,
      nama: u.nama,
      jenis: u.jenis || "tambahan",
      bawaan: false
    });
  }
}

/**
 * Menyetel konfigurasi hari libur dan membangun ulang Map pencarian.
 * @param {object} konfigurasi
 * @param {Array} [konfigurasi.entri]
 * @param {Array<string>} [konfigurasi.disembunyikan]
 * @param {boolean} [konfigurasi.tampilkanCutiMerah]
 * @param {boolean} [konfigurasi.tampilkanHariBesar]
 */
export function setelKonfigurasi(konfigurasi = {}) {
  entriPengguna = Array.isArray(konfigurasi.entri) ? [...konfigurasi.entri] : [];
  himpunanDisembunyikan = new Set(
    Array.isArray(konfigurasi.disembunyikan) ? konfigurasi.disembunyikan : []
  );
  opsiTampilkanCutiMerah =
    typeof konfigurasi.tampilkanCutiMerah === "boolean"
      ? konfigurasi.tampilkanCutiMerah
      : true;
  opsiTampilkanHariBesar =
    typeof konfigurasi.tampilkanHariBesar === "boolean"
      ? konfigurasi.tampilkanHariBesar
      : true;

  bangunUlangPeta();
}

/**
 * Mengembalikan salinan konfigurasi aktif saat ini.
 */
export function ambilKonfigurasiAktif() {
  return {
    entri: [...entriPengguna],
    disembunyikan: Array.from(himpunanDisembunyikan),
    tampilkanCutiMerah: opsiTampilkanCutiMerah,
    tampilkanHariBesar: opsiTampilkanHariBesar
  };
}

/**
 * Memeriksa apakah data hari libur tersedia untuk tahun tertentu.
 * @param {number|string} tahun
 * @returns {boolean}
 */
export function adaDataTahun(tahun) {
  const t = Number(tahun);
  if (!Number.isFinite(t)) return false;
  return himpunanTahunTercakup.has(t);
}

/**
 * Mengembalikan informasi lengkap mengenai suatu tanggal:
 * apakah hari Minggu, apakah bertanggal merah, daftar libur/cuti, daftar hari besar,
 * serta keterangan ringkas untuk title dan aria-label.
 *
 * @param {string} tanggalStr - Format "YYYY-MM-DD"
 * @returns {{
 *   minggu: boolean,
 *   merah: boolean,
 *   libur: Array<{ nama: string, jenis: string }>,
 *   hariBesar: Array<{ nama: string }>,
 *   keterangan: string
 * }}
 */
export function infoHari(tanggalStr) {
  const d = parseTanggal(tanggalStr);
  if (!d) {
    return {
      minggu: false,
      merah: false,
      libur: [],
      hariBesar: [],
      keterangan: ""
    };
  }

  const minggu = d.getDay() === 0;
  const entriHari = petaTanggalKeEntri.get(tanggalStr) || [];

  const libur = [];
  const hariBesar = [];

  for (const item of entriHari) {
    if (item.jenis === "besar") {
      if (opsiTampilkanHariBesar) {
        hariBesar.push({ nama: item.nama });
      }
    } else {
      libur.push({ nama: item.nama, jenis: item.jenis });
    }
  }

  // Tambahkan hari besar tetap tahunan jika aktif
  if (opsiTampilkanHariBesar) {
    const bln = d.getMonth() + 1;
    const tgl = d.getDate();
    for (const hb of HARI_BESAR_TETAP) {
      if (hb.bulan === bln && hb.tanggal === tgl) {
        const k = kunciEntri(tanggalStr, hb.nama);
        if (!himpunanDisembunyikan.has(k)) {
          if (!hariBesar.some((x) => x.nama === hb.nama)) {
            hariBesar.push({ nama: hb.nama });
          }
        }
      }
    }
  }

  const adaLibur = libur.some((l) => l.jenis === "libur" || l.jenis === "tambahan");
  const adaCuti = libur.some((l) => l.jenis === "cuti");
  const merah = minggu || adaLibur || (opsiTampilkanCutiMerah && adaCuti);

  // Bangun keterangan teks yang ramah aksesibilitas
  const bagianKeterangan = [];
  if (minggu) {
    bagianKeterangan.push("Minggu");
  }

  for (const l of libur) {
    if (l.jenis === "cuti") {
      bagianKeterangan.push(`Cuti bersama: ${l.nama}`);
    } else if (l.jenis === "tambahan") {
      bagianKeterangan.push(`Libur: ${l.nama}`);
    } else {
      bagianKeterangan.push(`Libur nasional: ${l.nama}`);
    }
  }

  for (const hb of hariBesar) {
    bagianKeterangan.push(`Hari besar: ${hb.nama}`);
  }

  const keterangan = bagianKeterangan.join(", ");

  return {
    minggu,
    merah,
    libur,
    hariBesar,
    keterangan
  };
}

// Inisialisasi bawaan awal saat modul dimuat
setelKonfigurasi();