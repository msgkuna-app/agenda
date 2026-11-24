/**
 * Opsi Kategori untuk Filter Laporan (2026-11-25: pecahan dari state.js)
 *
 * Menyusun daftar pilihan kategori pada dropdown filter laporan, sesuai jenis
 * laporan yang aktif: kategori terstruktur untuk kegiatan/dokumen, dan kategori
 * berbentuk teks bebas untuk catatan.
 */
import { urutkanDaftarKategori } from "../kategori/index.js";
import { manajerKategoriKegiatan } from "../kegiatan/index.js";
import { manajerKategoriDokumen } from "../dokumen/index.js";
import { getDaftarCatatan } from "../catatan/index.js";

export function ambilDaftarOpsiKategoriLaporan(jenis) {
  if (jenis === "kegiatan" || jenis === "rekap-status") {
    const daftar = urutkanDaftarKategori(manajerKategoriKegiatan.getDaftarKategori());
    return [
      { value: "ALL", label: "Semua Kategori" },
      { value: "NONE", label: "Tanpa Kategori" },
      ...daftar.map((k) => ({ value: k.id, label: k.nama }))
    ];
  }
  if (jenis === "dokumen") {
    const daftar = urutkanDaftarKategori(manajerKategoriDokumen.getDaftarKategori());
    return [
      { value: "ALL", label: "Semua Kategori" },
      { value: "NONE", label: "Tanpa Kategori" },
      ...daftar.map((k) => ({ value: k.id, label: k.nama }))
    ];
  }

  // Catatan: kategori berupa teks bebas, jadi dikumpulkan unik tanpa membedakan
  // huruf besar/kecil, lalu diurutkan menurut abjad Indonesia.
  const unikMap = new Map();
  for (const c of getDaftarCatatan()) {
    const kat = String(c.kategori || "").trim();
    if (kat) {
      const kKecil = kat.toLowerCase();
      if (!unikMap.has(kKecil)) unikMap.set(kKecil, kat);
    }
  }
  const urutNama = Array.from(unikMap.values()).sort((a, b) =>
    a.localeCompare(b, "id", { sensitivity: "base" })
  );
  return [
    { value: "ALL", label: "Semua Kategori" },
    { value: "NONE", label: "Tanpa Kategori" },
    ...urutNama.map((nama) => ({ value: `CAT:${nama}`, label: nama }))
  ];
}
