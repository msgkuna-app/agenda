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

/**
 * Menggeser sebuah tanggal "YYYY-MM-DD" sebanyak n hari (boleh negatif).
 * Berbeda dari tambahHari(), titik awalnya adalah tanggal acuan, bukan hari ini.
 * @param {string} tanggalStr
 * @param {number} n
 * @returns {string} tanggal hasil, atau string kosong bila acuan tidak valid
 */
export function geserTanggal(tanggalStr, n) {
  const acuan = parseTanggal(tanggalStr);
  if (!acuan) return "";
  const jumlah = Number(n);
  if (!Number.isFinite(jumlah)) return "";
  const hasil = new Date(
    acuan.getFullYear(),
    acuan.getMonth(),
    acuan.getDate() + Math.trunc(jumlah),
    12,
    0,
    0,
    0
  );
  return tanggalLokal(hasil);
}

/**
 * Mengembalikan tanggal akhir rentang yang sah.
 * Kegiatan satu hari (tanpa tanggal selesai, tidak valid, atau lebih awal dari
 * tanggal mulai) dikembalikan sebagai tanggal mulai itu sendiri, sehingga
 * seluruh pemakaian lama tetap berperilaku sama seperti sebelum ada rentang.
 * @param {string} tanggalMulai
 * @param {string} [tanggalSelesai]
 * @returns {string} tanggal mulai bila rentang tidak sah, selain itu tanggal selesai
 */
export function akhiriRentang(tanggalMulai, tanggalSelesai) {
  const mulai = typeof tanggalMulai === "string" ? tanggalMulai.trim() : "";
  const selesai = typeof tanggalSelesai === "string" ? tanggalSelesai.trim() : "";
  if (!parseTanggal(mulai)) return selesai;
  if (!parseTanggal(selesai)) return mulai;
  return selesai >= mulai ? selesai : mulai;
}

/**
 * Menguji apakah sebuah kegiatan mencakup tanggal tertentu.
 * Kegiatan satu hari cocok hanya pada tanggalnya sendiri.
 * @param {{ tanggal?: string, tanggalSelesai?: string }} item
 * @param {string} tanggalStr
 * @returns {boolean}
 */
export function tanggalDalamRentang(item, tanggalStr) {
  const target = typeof tanggalStr === "string" ? tanggalStr.trim() : "";
  if (!parseTanggal(target)) return false;
  const mulai = typeof item?.tanggal === "string" ? item.tanggal.trim() : "";
  if (!parseTanggal(mulai)) return false;
  if (mulai === target) return true;
  const akhir = akhiriRentang(mulai, item?.tanggalSelesai);
  return target > mulai && target <= akhir;
}

/**
 * Menguji apakah rentang kegiatan bersinggungan dengan rentang tanggal
 * [dari, sampai]. Dipakai saringan periode (agenda, laporan, dashboard).
 * @param {{ tanggal?: string, tanggalSelesai?: string }} item
 * @param {string} dari
 * @param {string} sampai
 * @returns {boolean}
 */
export function rentangBersinggungan(item, dari, sampai) {
  const mulai = typeof item?.tanggal === "string" ? item.tanggal.trim() : "";
  if (!parseTanggal(mulai)) return false;
  if (!parseTanggal(dari) || !parseTanggal(sampai)) return false;
  const akhir = akhiriRentang(mulai, item?.tanggalSelesai);
  return mulai <= sampai && akhir >= dari;
}

/**
 * Menghitung jumlah hari dalam rentang kegiatan (minimal 1).
 * @param {{ tanggal?: string, tanggalSelesai?: string }} item
 * @returns {number}
 */
export function jumlahHariRentang(item) {
  const mulai = parseTanggal(typeof item?.tanggal === "string" ? item.tanggal.trim() : "");
  if (!mulai) return 1;
  const akhirStr = akhiriRentang(item?.tanggal, item?.tanggalSelesai);
  const akhir = parseTanggal(akhirStr);
  if (!akhir) return 1;
  const selisihMs = akhir.getTime() - mulai.getTime();
  return Math.max(1, Math.round(selisihMs / 86400000) + 1);
}