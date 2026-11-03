/**
 * Modul Templat Dokumen HTML untuk Konversi Otomatis Google Docs (Fase 4)
 * Mematuhi Aturan #6 & #9:
 * - Seluruh teks masukan pengguna di-escape sebelum dimasukkan ke HTML.
 * - Tanggal kalender diproses HANYA lewat util-tanggal.js (parseTanggal, hariIni).
 * - Menyediakan 3 templat: Notulensi Rapat, Catatan Kosong, dan Catatan Harian,
 *   masing-masing otomatis memuat judul kegiatan terkait (bila ada) dan tanggal.
 */
import { hariIni, parseTanggal } from "./util-tanggal.js";

const NAMA_HARI_LENGKAP = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu"
];

const NAMA_BULAN_LENGKAP = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

export const DAFTAR_TEMPLAT_DOKUMEN = [
  {
    id: "notulensi",
    nama: "Notulensi Rapat",
    deskripsi:
      "Memuat judul rapat, tanggal, waktu, tempat, peserta, agenda, pembahasan, keputusan, tabel tindak lanjut, dan catatan tambahan."
  },
  {
    id: "kosong",
    nama: "Catatan Kosong",
    deskripsi:
      "Dokumen bersih dengan judul, tanggal, dan rujukan kegiatan terkait (bila dipilih) untuk penulisan bebas."
  },
  {
    id: "harian",
    nama: "Catatan Harian",
    deskripsi:
      "Jurnal harian terstruktur berisi tanggal, ringkasan, hal yang dikerjakan, kendala, dan rencana besok."
  }
];

/**
 * Meng-escape karakter HTML berbahaya dari masukan pengguna (Aturan #9).
 * @param {unknown} nilai
 * @returns {string}
 */
export function escapeHtmlTemplat(nilai) {
  return String(nilai ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Memformat tanggal "YYYY-MM-DD" menjadi teks Bahasa Indonesia memakai parseTanggal() (Aturan #6).
 * @param {string} tanggalStr
 * @returns {string}
 */
export function formatTanggalTemplatIndonesia(tanggalStr) {
  const bersih = String(tanggalStr || "").trim() || hariIni();
  const tgl = parseTanggal(bersih);
  if (!tgl) {
    return bersih;
  }
  return `${NAMA_HARI_LENGKAP[tgl.getDay()]}, ${tgl.getDate()} ${NAMA_BULAN_LENGKAP[tgl.getMonth()]} ${tgl.getFullYear()}`;
}

/**
 * Mengambil informasi templat berdasarkan ID.
 * @param {string} idTemplat
 */
export function ambilInfoTemplatDokumen(idTemplat) {
  const target = String(idTemplat || "").trim().toLowerCase();
  return (
    DAFTAR_TEMPLAT_DOKUMEN.find((item) => item.id === target) ||
    DAFTAR_TEMPLAT_DOKUMEN[0]
  );
}

const GAYA_DASAR_DOKUMEN = `
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #0f172a;
  }
  h1 {
    font-size: 18pt;
    margin: 0 0 6pt 0;
    color: #1e3a8a;
  }
  h2 {
    font-size: 13pt;
    margin: 16pt 0 6pt 0;
    color: #1e40af;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 3pt;
  }
  p {
    margin: 0 0 8pt 0;
  }
  .meta-subtitle {
    font-size: 10.5pt;
    color: #475569;
    margin-bottom: 14pt;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 14pt 0;
  }
  th, td {
    border: 1px solid #94a3b8;
    padding: 6pt 8pt;
    vertical-align: top;
    text-align: left;
    font-size: 10.5pt;
  }
  th {
    background-color: #eff6ff;
    color: #1e3a8a;
    font-weight: bold;
  }
  .meta-table th {
    width: 28%;
    background-color: #f8fafc;
    color: #334155;
  }
  ul, ol {
    margin: 4pt 0 12pt 18pt;
  }
  li {
    margin-bottom: 4pt;
  }
`;

/**
 * Membangun dokumen HTML utuh siap konversi otomatis ke Google Docs.
 * Semua teks masukan pengguna di-escape terlebih dahulu.
 * @param {{
 *   templat: string,
 *   judul: string,
 *   tanggal: string,
 *   kegiatan?: {
 *     judul?: string,
 *     tanggal?: string,
 *     waktuMulai?: string,
 *     waktuSelesai?: string,
 *     lokasi?: string,
 *     catatan?: string
 *   } | null
 * }} parameter
 * @returns {string}
 */
export function bangunHtmlTemplatDokumen(parameter) {
  const infoTemplat = ambilInfoTemplatDokumen(parameter?.templat);
  const judulMentah = String(parameter?.judul || "").trim() || infoTemplat.nama;
  const tanggalMentah = String(parameter?.tanggal || "").trim() || hariIni();
  const kegiatan = parameter?.kegiatan || null;

  const judulAman = escapeHtmlTemplat(judulMentah);
  const tanggalAman = escapeHtmlTemplat(formatTanggalTemplatIndonesia(tanggalMentah));
  const judulKegiatanMentah = String(kegiatan?.judul || "").trim();
  const judulKegiatanAman = escapeHtmlTemplat(judulKegiatanMentah);

  const waktuMulai = String(kegiatan?.waktuMulai || "").trim();
  const waktuSelesai = String(kegiatan?.waktuSelesai || "").trim();
  const waktuRapatMentah = waktuMulai
    ? waktuSelesai
      ? `${waktuMulai} – ${waktuSelesai}`
      : waktuMulai
    : "[Isi waktu rapat]";
  const waktuAman = escapeHtmlTemplat(waktuRapatMentah);

  const tempatMentah = String(kegiatan?.lokasi || "").trim() || "[Isi tempat / ruang rapat]";
  const tempatAman = escapeHtmlTemplat(tempatMentah);

  const catatanKegiatanMentah = String(kegiatan?.catatan || "").trim();
  const catatanKegiatanAman = escapeHtmlTemplat(catatanKegiatanMentah).replace(/\r?\n/g, "<br />");

  let isiBody = "";

  if (infoTemplat.id === "notulensi") {
    const namaRapatTampil = judulKegiatanAman || judulAman;
    isiBody = `
      <h1>${judulAman}</h1>
      <p class="meta-subtitle">Notulensi Rapat &bull; ${tanggalAman}</p>

      <table class="meta-table">
        <tbody>
          <tr>
            <th>Judul Rapat</th>
            <td>${namaRapatTampil}</td>
          </tr>
          ${
            judulKegiatanAman && judulKegiatanMentah !== judulMentah
              ? `<tr><th>Kegiatan Terkait</th><td>${judulKegiatanAman}</td></tr>`
              : ""
          }
          <tr>
            <th>Tanggal</th>
            <td>${tanggalAman}</td>
          </tr>
          <tr>
            <th>Waktu</th>
            <td>${waktuAman}</td>
          </tr>
          <tr>
            <th>Tempat</th>
            <td>${tempatAman}</td>
          </tr>
          <tr>
            <th>Peserta</th>
            <td>1. <br />2. <br />3. </td>
          </tr>
        </tbody>
      </table>

      <h2>1. Agenda</h2>
      ${
        catatanKegiatanAman
          ? `<p>${catatanKegiatanAman}</p>`
          : `<ol><li>[Pokok agenda pertama]</li><li>[Pokok agenda kedua]</li></ol>`
      }

      <h2>2. Pembahasan</h2>
      <p>[Tuliskan rincian jalannya pembahasan rapat di sini...]</p>

      <h2>3. Keputusan</h2>
      <ol>
        <li>[Keputusan rapat 1]</li>
        <li>[Keputusan rapat 2]</li>
      </ol>

      <h2>4. Tindak Lanjut</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 34%;">Tugas</th>
            <th style="width: 24%;">Penanggung Jawab</th>
            <th style="width: 22%;">Tenggat</th>
            <th style="width: 20%;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>Belum mulai</td>
          </tr>
          <tr>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>Belum mulai</td>
          </tr>
          <tr>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>Belum mulai</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Catatan Tambahan</h2>
      <p>[Tambahkan keterangan pendukung atau lampiran bila diperlukan...]</p>
    `;
  } else if (infoTemplat.id === "harian") {
    isiBody = `
      <h1>${judulAman}</h1>
      <p class="meta-subtitle">
        Tanggal: <strong>${tanggalAman}</strong>${
          judulKegiatanAman ? ` &bull; Kegiatan Terkait: <strong>${judulKegiatanAman}</strong>` : ""
        }
      </p>

      <h2>1. Ringkasan</h2>
      <p>[Ringkasan singkat fokus atau capaian utama hari ini...]</p>

      <h2>2. Hal yang Dikerjakan</h2>
      <ul>
        <li>${judulKegiatanAman ? `Menindaklanjuti kegiatan: ${judulKegiatanAman}` : "[Pekerjaan / kegiatan pertama]"}</li>
        <li>[Pekerjaan / kegiatan berikutnya]</li>
      </ul>

      <h2>3. Kendala</h2>
      <p>[Catat hambatan atau hal yang memerlukan perhatian khusus...]</p>

      <h2>4. Rencana Besok</h2>
      <ul>
        <li>[Prioritas utama besok]</li>
        <li>[Tindak lanjut berikutnya]</li>
      </ul>
    `;
  } else {
    // Templat "kosong" (Catatan Kosong)
    isiBody = `
      <h1>${judulAman}</h1>
      <p class="meta-subtitle">
        Tanggal: <strong>${tanggalAman}</strong>${
          judulKegiatanAman ? `<br />Kegiatan Terkait: <strong>${judulKegiatanAman}</strong>` : ""
        }
      </p>
      <p>&nbsp;</p>
    `;
  }

  return `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <title>${judulAman}</title>
    <style>${GAYA_DASAR_DOKUMEN}</style>
  </head>
  <body>
    ${isiBody}
  </body>
</html>`;
}
