/**
 * View Bantuan: daftar dokumen terkait di dalam kartu kegiatan.
 * Hanya membangun HTML (tanpa DOM/API) agar modul kegiatan tidak perlu
 * mengimpor seluruh modul dokumen (menghindari siklus impor).
 */
import { escapeHtml, svgIkon } from "../../util-html.js";
import { formatUkuranBerkas, infoJenisBerkasMime } from "./format.js";
import { labelTanggalLampiran } from "../../lampiran-hari.js";
import { jumlahHariRentang } from "../../util-tanggal.js";

const IKON_DOKUMEN = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
const IKON_HAPUS = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';

function itemDokumenHtml(item, kegiatan) {
  const jenis = infoJenisBerkasMime(item.mimeType, item.namaFile);
  const nama = item.namaTampilan || item.namaFile || "Dokumen Tanpa Nama";
  const tautanAman =
    item.tautan && /^https?:\/\//i.test(item.tautan)
      ? item.tautan
      : item.driveFileId
        ? `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`
        : "#";
  const ukuran = formatUkuranBerkas(item.ukuran);
  const tglHari = String(item.tanggal || "").trim();
  const lencana =
    kegiatan && jumlahHariRentang(kegiatan) > 1 && tglHari
      ? `<span class="kegiatan-dokumen-hari">${escapeHtml(labelTanggalLampiran(tglHari))}</span>`
      : "";

  return `<li class="kegiatan-dokumen-item" data-id-dokumen="${escapeHtml(item.id)}">
      <span class="kegiatan-dokumen-ikon ${escapeHtml(jenis.kelasWarna)}" aria-hidden="true">${jenis.svg}</span>
      <div class="kegiatan-dokumen-info">
        <a class="kegiatan-dokumen-nama" href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" title="Buka ${escapeHtml(nama)} di Google Drive">${escapeHtml(nama)}</a>
        <span class="kegiatan-dokumen-meta">${escapeHtml(jenis.label)} · ${escapeHtml(ukuran)}${lencana ? ` · ${lencana}` : ""}</span>
      </div>
      <button type="button" class="tombol-hapus-dokumen-kegiatan" data-id-dokumen="${escapeHtml(item.id)}" title="Pindahkan ke Tempat Sampah" aria-label="Pindahkan dokumen ${escapeHtml(nama)} ke Tempat Sampah">${svgIkon(IKON_HAPUS, 16)}</button>
    </li>`;
}

/**
 * Menghasilkan HTML blok dokumen terkait untuk satu kartu kegiatan.
 * @param {string} kegiatanId
 * @param {Array} daftarDokumen dokumen milik kegiatan ini
 * @param {string} [tanggalHari] hari yang sedang ditampilkan (kegiatan berturutan);
 *   diteruskan ke modal unggah agar dokumen langsung tercatat pada hari tersebut.
 * @param {object} [kegiatan] data kegiatan; bila berturutan, setiap dokumen yang
 *   bertanggal diberi keterangan hari agar asal harinya jelas di daftar utuh.
 */
export function htmlDokumenKegiatan(kegiatanId, daftarDokumen, tanggalHari = "", kegiatan = null) {
  const jumlah = Array.isArray(daftarDokumen) ? daftarDokumen.length : 0;
  const isi = jumlah
    ? `<ul class="kegiatan-dokumen-list">${daftarDokumen.map((d) => itemDokumenHtml(d, kegiatan)).join("")}</ul>`
    : `<p class="foto-kosong-hint">Belum ada dokumen untuk kegiatan ini.</p>`;

  return `<div class="kegiatan-dokumen" data-dokumen-kegiatan-id="${escapeHtml(kegiatanId)}">
      <div class="kegiatan-foto-kepala">
        <span class="kegiatan-foto-label">${svgIkon(IKON_DOKUMEN, 15)}<span>Dokumen${jumlah ? ` (${jumlah})` : ""}</span></span>
        <button type="button" class="btn-secondary btn-sm-touch" data-action="unggah-dokumen-kegiatan" data-id="${escapeHtml(kegiatanId)}" data-tanggal="${escapeHtml(tanggalHari)}" title="Unggah dokumen untuk kegiatan ini">${svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 14, 2.2)}<span>Unggah Dokumen</span></button>
      </div>
      ${isi}
    </div>`;
}
