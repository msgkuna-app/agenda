/**
 * Utilitas tanggal kalender lokal (Aturan #6)
 * DILARANG memakai toISOString().slice(0,10), split("T"), atau new Date("YYYY-MM-DD").
 */

/**
 * Mengubah objek Date menjadi string "YYYY-MM-DD" sesuai zona waktu lokal perangkat.
 * @param {Date} d
 * @returns {string}
 */
export function tanggalLokal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError("Argumen tanggalLokal harus berupa objek Date yang valid.");
  }
  const tahun = d.getFullYear();
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const tanggal = String(d.getDate()).padStart(2, "0");
  return `${tahun}-${bulan}-${tanggal}`;
}

/**
 * Mengembalikan tanggal hari ini dalam format "YYYY-MM-DD" zona waktu lokal.
 * @returns {string}
 */
export function hariIni() {
  return tanggalLokal(new Date());
}

/**
 * Menambahkan sejumlah hari dari hari ini (atau dari tanggal referensi opsional)
 * dan mengembalikan string "YYYY-MM-DD" lokal.
 * @param {number} n - Jumlah hari yang ditambahkan (boleh negatif)
 * @param {Date} [dariTanggal] - Objek Date opsional; default hari ini
 * @returns {string}
 */
export function tambahHari(n, dariTanggal) {
  const jumlah = Number(n);
  if (!Number.isFinite(jumlah)) {
    throw new TypeError("Argumen n pada tambahHari harus berupa angka.");
  }
  const sumber = dariTanggal instanceof Date ? new Date(dariTanggal.getTime()) : new Date();
  const salinan = new Date(
    sumber.getFullYear(),
    sumber.getMonth(),
    sumber.getDate() + Math.trunc(jumlah),
    12,
    0,
    0,
    0
  );
  return tanggalLokal(salinan);
}

/**
 * Mengurai string "YYYY-MM-DD" menjadi objek Date pada pukul 00:00:00 waktu lokal
 * tanpa pergeseran UTC.
 * @param {string} str
 * @returns {Date | null}
 */
export function parseTanggal(str) {
  if (typeof str !== "string") {
    return null;
  }
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!cocok) {
    return null;
  }
  const tahun = Number(cocok[1]);
  const bulanIndex = Number(cocok[2]) - 1;
  const hari = Number(cocok[3]);

  const hasil = new Date(tahun, bulanIndex, hari, 0, 0, 0, 0);
  if (
    hasil.getFullYear() !== tahun ||
    hasil.getMonth() !== bulanIndex ||
    hasil.getDate() !== hari
  ) {
    return null;
  }
  return hasil;
}