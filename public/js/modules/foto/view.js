/**
 * View Modul Foto (fitur foto kegiatan)
 * Merender blok foto (thumbnail) di dalam kartu kegiatan, serta pratinjau
 * berkas pada modal unggah. Tidak memanggil API — semua aksi lewat controller.
 */
import { escapeHtml, svgIkon } from "../../util-html.js";
import { labelTanggalLampiran } from "../../lampiran-hari.js";
import { jumlahHariRentang } from "../../util-tanggal.js";

const IKON_GAMBAR = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>';
const IKON_HAPUS = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
const IKON_KAMERA = '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';

function formatUkuran(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lencana hari pada kartu lampiran, hanya untuk kegiatan berturutan yang
 * lampirannya memang terikat pada satu hari tertentu.
 */
function lencanaHariHtml(item, kegiatan) {
  if (!kegiatan || jumlahHariRentang(kegiatan) <= 1) return "";
  const tgl = String(item?.tanggal || "").trim();
  if (!tgl) return "";
  return `<span class="foto-kartu-hari" title="Lampiran hari ini">${escapeHtml(labelTanggalLampiran(tgl))}</span>`;
}

function kartuFotoHtml(f, kegiatan) {
  const tautan = f.tautan || (f.driveFileId ? `https://drive.google.com/file/d/${encodeURIComponent(f.driveFileId)}/view` : "#");
  const lencana = lencanaHariHtml(f, kegiatan);
  return `<figure class="foto-kartu" data-id-foto="${escapeHtml(f.id)}">
      <a class="foto-kartu-gambar" href="${escapeHtml(tautan)}" target="_blank" rel="noopener" title="Buka foto di Drive">
        ${f.driveFileId
          ? `<img alt="${escapeHtml(f.namaFile)}" loading="lazy" data-thumb-drive="${escapeHtml(f.driveFileId)}" />`
          : `<span class="foto-kartu-kosong">${svgIkon(IKON_GAMBAR, 28)}</span>`}
      </a>
      <button type="button" class="tombol-hapus-foto" data-id-foto="${escapeHtml(f.id)}" title="Pindahkan ke Tempat Sampah" aria-label="Pindahkan foto ${escapeHtml(f.namaFile)} ke Tempat Sampah">${svgIkon(IKON_HAPUS, 16)}</button>
      ${lencana}
      <figcaption class="foto-kartu-meta">
        <span class="foto-kartu-nama" title="${escapeHtml(f.namaFile)}">${escapeHtml(f.namaFile)}</span>
        <span class="foto-kartu-keterangan">${formatUkuran(f.ukuran)}</span>
      </figcaption>
    </figure>`;
}

/**
 * Menghasilkan HTML blok foto untuk satu kartu kegiatan: label jumlah foto,
 * tombol unggah, dan kisi thumbnail. Dipakai view kegiatan saat render kartu.
 * @param {string} kegiatanId
 * @param {Array} daftarFoto foto milik kegiatan ini (sudah terurut terbaru dulu)
 * @param {string} [tanggalHari] hari yang sedang ditampilkan (kegiatan berturutan);
 *   diteruskan ke modal unggah agar foto langsung tercatat pada hari tersebut.
 * @param {object} [kegiatan] data kegiatan; bila berturutan, setiap foto yang
 *   bertanggal diberi lencana hari agar asal harinya jelas di daftar utuh.
 */
export function htmlFotoKegiatan(kegiatanId, daftarFoto, tanggalHari = "", kegiatan = null) {
  const jumlah = Array.isArray(daftarFoto) ? daftarFoto.length : 0;
  const kisi = jumlah
    ? `<div class="foto-grup-kisi foto-grup-kisi-dalam-kartu">${daftarFoto.map((f) => kartuFotoHtml(f, kegiatan)).join("")}</div>`
    : `<p class="foto-kosong-hint">Belum ada foto untuk kegiatan ini.</p>`;
  return `<div class="kegiatan-foto" data-foto-kegiatan-id="${escapeHtml(kegiatanId)}">
      <div class="kegiatan-foto-kepala">
        <span class="kegiatan-foto-label">${svgIkon(IKON_KAMERA, 15)}<span>Foto${jumlah ? ` (${jumlah})` : ""}</span></span>
        <button type="button" class="btn-secondary btn-sm-touch" data-action="unggah-foto" data-id="${escapeHtml(kegiatanId)}" data-tanggal="${escapeHtml(tanggalHari)}" title="Unggah foto untuk kegiatan ini">${svgIkon('<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 14, 2.2)}<span>Unggah Foto</span></button>
      </div>
      ${kisi}
    </div>`;
}

/** Merender pratinjau berkas yang dipilih pada modal unggah. */
export function renderPratinjauUnggah(berkas) {
  const elemenPratinjau = document.getElementById("foto-upload-pratinjau");
  if (!elemenPratinjau) return;
  const daftar = Array.from(berkas || []);
  if (!daftar.length) {
    elemenPratinjau.innerHTML = "";
    return;
  }
  elemenPratinjau.innerHTML = daftar
    .map((f) => {
      const urlLokal = URL.createObjectURL(f);
      return `<div class="item-pratinjau-foto">
          <img src="${urlLokal}" alt="${escapeHtml(f.name)}" />
          <span>${escapeHtml(f.name)} (${formatUkuran(f.size)})</span>
        </div>`;
    })
    .join("");
}

/** Mengosongkan pratinjau dan input berkas modal setelah unggahan selesai. */
export function bersihkanFormUnggahFoto() {
  const input = document.getElementById("foto-upload-file");
  const info = document.getElementById("foto-upload-file-info");
  if (input instanceof HTMLInputElement) input.value = "";
  if (info) info.textContent = "Pilih satu atau lebih foto dari perangkat Anda.";
  const pratinjau = document.getElementById("foto-upload-pratinjau");
  if (pratinjau) pratinjau.innerHTML = "";
}

/** Mengunci/membuka tombol unggah selama proses berjalan. */
export function setelSedangUnggahFoto(sedangBerjalan) {
  const tombol = document.getElementById("foto-upload-submit-btn");
  if (tombol instanceof HTMLButtonElement) {
    tombol.disabled = Boolean(sedangBerjalan);
    tombol.textContent = sedangBerjalan ? "Mengunggah..." : "Unggah ke Drive";
  }
}
