/**
 * Utilitas Ikon SVG, Konstanta, dan Pembaca Versi SW untuk Pengaturan
 */
import { getStatusUiPengaturan, setStatusUiPengaturan } from "./state.js";

export const VERSI_CADANGAN_SW = "agenda-arsip-v2.0.0";
export const BATAS_OPERASI_BATCH = 500;

export const KOLEKSI_CADANGAN = [
  { key: "kategoriKegiatan", label: "Kategori Kegiatan" },
  { key: "kegiatan", label: "Kegiatan" },
  { key: "kategoriDokumen", label: "Kategori Dokumen" },
  { key: "dokumen", label: "Dokumen (Metadata Drive)" },
  { key: "catatan", label: "Catatan & Metadata Google Docs" },
  { key: "laporan", label: "Riwayat Laporan (Metadata Sheets)" }
];

export const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

export const IKON_MATAHARI = svgIkon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', 17);
export const IKON_BULAN = svgIkon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 17);
export const IKON_SISTEM = svgIkon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 17);
export const IKON_FOLDER_SYNC = svgIkon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="16 13 12 9 8 13"/><line x1="12" y1="9" x2="12" y2="17"/>', 18);
export const IKON_UNDUH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18);
export const IKON_UNGGAH = svgIkon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 18);
export const IKON_SEGAR = svgIkon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 17);
export const IKON_PERINGATAN = svgIkon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 18);

export function setUmpanBalikPengaturan(pesan, tipe = "info") {
  const box = document.getElementById("pengaturan-feedback-box");
  const txt = document.getElementById("pengaturan-feedback-text");
  if (!box || !txt) return;

  const bersih = String(pesan || "").trim();
  if (!bersih) {
    box.hidden = true;
    txt.textContent = "";
    return;
  }

  box.className =
    tipe === "success"
      ? "alert-box alert-box-success"
      : tipe === "warning"
        ? "alert-box alert-box-warning"
        : "alert-box";
  txt.textContent = bersih;
  box.hidden = false;
}

export function setStatusCekPembaruan(pesan) {
  const statusEl = document.getElementById("settings-update-status");
  if (!statusEl) return;
  const bersih = String(pesan || "").trim();
  statusEl.textContent = bersih;
  statusEl.hidden = !bersih;
}

export async function bacaVersiDariSwJs() {
  const ui = getStatusUiPengaturan();
  if (ui.versiAplikasiTerbaca) return ui.versiAplikasiTerbaca;

  try {
    const resp = await fetch("/sw.js", { cache: "no-cache" });
    if (resp.ok) {
      const teks = await resp.text();
      const cocok = /const\s+VERSION\s*=\s*["']([^"']+)["']/.exec(teks);
      if (cocok && cocok[1]) {
        const versi = cocok[1].trim();
        setStatusUiPengaturan({ versiAplikasiTerbaca: versi });
        return versi;
      }
    }
  } catch (_err) {
    // Saat luring, coba ambil dari daftar nama CacheStorage yang aktif
    try {
      if ("caches" in window) {
        const kunci = await caches.keys();
        const ketemu = kunci.find((k) => k.startsWith("agenda-arsip-"));
        if (ketemu) {
          setStatusUiPengaturan({ versiAplikasiTerbaca: ketemu });
          return ketemu;
        }
      }
    } catch (_e2) {}
  }

  setStatusUiPengaturan({ versiAplikasiTerbaca: VERSI_CADANGAN_SW });
  return VERSI_CADANGAN_SW;
}

export function buatIdDokumenCadangan(indeks) {
  return `impor-${Date.now().toString(36)}-${indeks}-${Math.random().toString(36).slice(2, 7)}`;
}