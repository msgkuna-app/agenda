/**
 * Pembantu Lampiran per Hari (Tahap 8b)
 *
 * Kegiatan berturutan dapat memiliki foto dan dokumen yang BERBEDA setiap harinya.
 * Kolom opsional `tanggal` (YYYY-MM-DD) pada koleksi `dokumen` dan `foto` mencatat
 * hari mana yang dimiliki sebuah lampiran. Berkas ini menyediakan:
 *   1. fungsi murni tanpa DOM — pemetaan hari kegiatan, tanggal efektif lampiran,
 *      penyaringan lampiran per hari, dan label tanggal hari;
 *   2. satu pembantu DOM bersama (`perbaruiPilihanHariLampiran`) yang dipakai modal
 *      unggah foto dan modal unggah dokumen, agar aturan tampil/sembunyi pilihan
 *      hari tidak ditulis dua kali.
 *
 * Aturan penting yang menjaga data lama tetap utuh: lampiran tanpa `tanggal`
 * (semua data sebelum Tahap 8b) dianggap milik hari PERTAMA kegiatan, sehingga
 * tidak ada lampiran yang hilang dari tampilan setelah pembaruan ini.
 */
import { MAKS_HARI_RENTANG } from "./config/constants.js";
import {
  parseTanggal,
  akhiriRentang,
  jumlahHariRentang,
  tanggalDalamRentang,
  geserTanggal
} from "./util-tanggal.js";
import { escapeHtml, NAMA_HARI_PENDEK, NAMA_BULAN_PENDEK } from "./util-html.js";

/** Label tanggal satu hari: "Kam, 26 Nov 2026". */
export function labelTanggalLampiran(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return "";
  return `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
}

/**
 * Daftar hari yang dicakup sebuah kegiatan, untuk mengisi pilihan hari.
 * Kegiatan satu hari atau tanpa tanggal sah menghasilkan daftar kosong, sehingga
 * pemanggil dapat menyembunyikan pilihan hari sepenuhnya.
 * @param {{ tanggal?: string, tanggalSelesai?: string }} kegiatan
 * @returns {Array<{ tanggal: string, nomorHari: number, totalHari: number, label: string }>}
 */
export function daftarHariKegiatan(kegiatan) {
  const mulai = typeof kegiatan?.tanggal === "string" ? kegiatan.tanggal.trim() : "";
  if (!parseTanggal(mulai)) return [];

  const totalHari = Math.min(Math.max(1, jumlahHariRentang(kegiatan)), MAKS_HARI_RENTANG);
  if (totalHari <= 1) return [];

  const hasil = [];
  let kursor = mulai;
  for (let nomorHari = 1; nomorHari <= totalHari; nomorHari += 1) {
    if (!parseTanggal(kursor)) break;
    hasil.push({
      tanggal: kursor,
      nomorHari,
      totalHari,
      label: `${labelTanggalLampiran(kursor)} — hari ke-${nomorHari} dari ${totalHari}`
    });
    kursor = geserTanggal(kursor, 1);
  }
  return hasil;
}

/**
 * Tanggal efektif sebuah lampiran (foto/dokumen).
 * Lampiran tanpa tanggal sah memakai hari pertama kegiatan; bila kegiatan pun
 * tidak bertanggal, hasilnya string kosong.
 * @param {{ tanggal?: string }} item
 * @param {{ tanggal?: string }} [kegiatan]
 * @returns {string}
 */
export function tanggalEfektifLampiran(item, kegiatan) {
  const tgl = typeof item?.tanggal === "string" ? item.tanggal.trim() : "";
  if (parseTanggal(tgl)) return tgl;
  const mulai = typeof kegiatan?.tanggal === "string" ? kegiatan.tanggal.trim() : "";
  return parseTanggal(mulai) ? mulai : "";
}

/**
 * Menguji apakah sebuah lampiran harus tampil pada hari tertentu dari kegiatan.
 * Lampiran bertanggal di luar rentang kegiatan (mis. tanggal kegiatan diubah
 * setelah lampiran diunggah) tetap ditampilkan pada hari pertama agar tidak lenyap.
 * @param {{ tanggal?: string }} item
 * @param {{ tanggal?: string, tanggalSelesai?: string }} kegiatan
 * @param {string} tanggalHari
 * @param {number} nomorHari
 * @returns {boolean}
 */
export function lampiranTampilPadaHari(item, kegiatan, tanggalHari, nomorHari) {
  const target = typeof tanggalHari === "string" ? tanggalHari.trim() : "";
  if (!parseTanggal(target)) return true;

  const tgl = typeof item?.tanggal === "string" ? item.tanggal.trim() : "";
  if (parseTanggal(tgl) && tanggalDalamRentang(kegiatan, tgl)) {
    return tgl === target;
  }
  // Tanpa tanggal, atau bertanggal di luar rentang kegiatan: milik hari pertama.
  return Number(nomorHari) === 1;
}

/**
 * Menyaring daftar lampiran menjadi lampiran milik satu hari kegiatan.
 * @param {Array} daftar
 * @param {{ tanggal?: string, tanggalSelesai?: string }} kegiatan
 * @param {string} tanggalHari
 * @param {number} nomorHari
 * @returns {Array}
 */
export function saringLampiranHari(daftar, kegiatan, tanggalHari, nomorHari) {
  const list = Array.isArray(daftar) ? daftar : [];
  return list.filter((item) => lampiranTampilPadaHari(item, kegiatan, tanggalHari, nomorHari));
}

/**
 * Membersihkan tanggal lampiran yang dikirim formulir: hanya tanggal sah yang
 * berada di dalam rentang kegiatan yang diterima. Selain itu string kosong,
 * yang berarti "hari pertama kegiatan".
 * @param {string} tanggalMentah
 * @param {{ tanggal?: string, tanggalSelesai?: string }} kegiatan
 * @returns {string}
 */
export function normalkanTanggalLampiran(tanggalMentah, kegiatan) {
  const tgl = typeof tanggalMentah === "string" ? tanggalMentah.trim() : "";
  if (!parseTanggal(tgl)) return "";
  if (!tanggalDalamRentang(kegiatan, tgl)) {
    // Kegiatan tanpa rentang sah hanya menerima tanggalnya sendiri.
    const akhir = akhiriRentang(kegiatan?.tanggal, kegiatan?.tanggalSelesai);
    return parseTanggal(akhir) && akhir === tgl ? tgl : "";
  }
  return tgl;
}

/**
 * Menyiapkan pilihan hari lampiran pada sebuah modal unggah.
 * Pilihan disembunyikan bila kegiatan hanya satu hari (atau tidak diketahui),
 * karena pada kasus itu tanggal lampiran tidak perlu ditanyakan.
 *
 * @param {{
 *   idSelect: string,
 *   idWrap: string,
 *   kegiatanId: string,
 *   daftarKegiatan: Array,
 *   tanggalTerpilih?: string,
 *   keterangan?: string
 * }} opsi
 */
export function perbaruiPilihanHariLampiran({
  idSelect,
  idWrap,
  kegiatanId,
  daftarKegiatan,
  tanggalTerpilih = "",
  keterangan = "Pilih hari tempat foto atau dokumen ini disimpan."
}) {
  const select = document.getElementById(idSelect);
  const wrap = document.getElementById(idWrap);
  if (!(select instanceof HTMLSelectElement)) return;

  const idBersih = String(kegiatanId || "").trim();
  const kegiatan = Array.isArray(daftarKegiatan) ? daftarKegiatan.find((k) => k.id === idBersih) : null;
  const hari = daftarHariKegiatan(kegiatan);

  if (hari.length === 0) {
    select.innerHTML = "";
    if (wrap) wrap.hidden = true;
    return;
  }

  const diminta = normalkanTanggalLampiran(tanggalTerpilih, kegiatan);
  const dipilih = diminta || hari[0].tanggal;

  select.innerHTML = hari
    .map(
      (h) =>
        `<option value="${escapeHtml(h.tanggal)}"${h.tanggal === dipilih ? " selected" : ""}>${escapeHtml(h.label)}</option>`
    )
    .join("");

  const ketEl = wrap ? wrap.querySelector(".field-hint-text") : null;
  if (ketEl) ketEl.textContent = keterangan;

  if (wrap) wrap.hidden = false;
}

/**
 * Membaca tanggal lampiran yang dipilih pada modal unggah. Mengembalikan string
 * kosong bila pilihan hari sedang disembunyikan (kegiatan satu hari).
 * @param {string} idSelect
 * @returns {string}
 */
export function ambilTanggalLampiranTerpilih(idSelect) {
  const select = document.getElementById(idSelect);
  if (!(select instanceof HTMLSelectElement)) return "";
  if (select.closest("[hidden]")) return "";
  return String(select.value || "").trim();
}
