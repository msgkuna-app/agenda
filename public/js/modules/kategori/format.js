/**
 * Format Modul Kategori (Tahap 3: dipisah dari kategori.js)
 * Konstanta publik kategori (preset warna, daftar bawaan, "Tanpa Kategori"),
 * normalisasi kode warna, dan pengurutan daftar kategori.
 * Murni: tanpa DOM dan tanpa akses jaringan.
 */

/**
 * Daftar warna preset kategori yang dipetakan ke CSS Custom Properties di style.css
 * agar kontras terbaca jelas pada Tema Terang maupun Tema Gelap (Aturan #14).
 */
export const PRESET_WARNA_KATEGORI = [
  { id: "biru", label: "Biru Statistik" },
  { id: "hijau", label: "Hijau Sensus" },
  { id: "amber", label: "Oranye Survei" },
  { id: "ungu", label: "Ungu Kecubung" },
  { id: "merah", label: "Merah Koral" },
  { id: "sian", label: "Toska Pesisir" },
  { id: "merahmuda", label: "Merah Muda" },
  { id: "abu", label: "Abu Seragam" }
];

export const KATEGORI_KEGIATAN_BAWAAN = [
  { id: "bawaan-pekerjaan", nama: "Pekerjaan", warna: "biru", urutan: 1 },
  { id: "bawaan-pribadi", nama: "Pribadi", warna: "hijau", urutan: 2 },
  { id: "bawaan-keluarga", nama: "Keluarga", warna: "amber", urutan: 3 },
  { id: "bawaan-pertemuan", nama: "Pertemuan", warna: "ungu", urutan: 4 },
  { id: "bawaan-lainnya", nama: "Lainnya", warna: "abu", urutan: 5 }
];

export const KATEGORI_DOKUMEN_BAWAAN = [
  { id: "bawaan-dok-umum", nama: "Umum", warna: "biru", urutan: 1 },
  { id: "bawaan-dok-keuangan", nama: "Keuangan", warna: "hijau", urutan: 2 },
  { id: "bawaan-dok-pekerjaan", nama: "Pekerjaan", warna: "ungu", urutan: 3 },
  { id: "bawaan-dok-pribadi", nama: "Pribadi", warna: "amber", urutan: 4 },
  { id: "bawaan-dok-lainnya", nama: "Lainnya", warna: "abu", urutan: 5 }
];

export const TANPA_KATEGORI_INFO = Object.freeze({
  id: "",
  nama: "Tanpa Kategori",
  warna: "netral",
  tetap: true
});

/**
 * Normalisasi kode warna preset agar selalu valid.
 * @param {string} warna
 * @returns {string}
 */
export function normalisasiWarnaKategori(warna) {
  const bersih = String(warna || "").trim().toLowerCase();
  const ada = PRESET_WARNA_KATEGORI.some((p) => p.id === bersih);
  return ada ? bersih : "biru";
}

/**
 * Mengurutkan daftar kategori berdasarkan field urutan lalu nama.
 * @param {Array<{id: string, nama: string, warna: string, urutan: number}>} daftar
 */
export function urutkanDaftarKategori(daftar) {
  return [...daftar].sort((a, b) => {
    const uA = Number.isFinite(Number(a.urutan)) ? Number(a.urutan) : 9999;
    const uB = Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 9999;
    if (uA !== uB) return uA - uB;
    return String(a.nama || "").localeCompare(String(b.nama || ""), "id", {
      sensitivity: "base"
    });
  });
}
