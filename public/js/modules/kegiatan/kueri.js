/**
 * Kueri Modul Kegiatan (2026-11-25: pecahan dari state.js)
 *
 * Pembacaan sekali pakai ke Firestore: agregasi pemakai kategori, paginasi
 * "muat lebih banyak", jembatan ambil-semua (Ekspor Cadangan & Pencarian Global),
 * dan pengambilan per rentang tanggal (modul Laporan).
 *
 * Seluruh state bersama (peta, kursor, bendera) dimiliki `inti.js`; berkas ini
 * hanya membacanya lewat fungsi yang diekspor di sana.
 */
import { UKURAN_HALAMAN_KEGIATAN, KOLEKSI } from "../../config/constants.js";
import { ambilDaftar, hitungItem } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import {
  manajerKategoriKegiatan,
  petaKegiatanTambahan,
  petakanKegiatan,
  getDaftarKegiatan,
  beritahuPerubahanKegiatan,
  getKursorHalamanKegiatan,
  setKursorHalamanKegiatan,
  getSedangMuatLebihKegiatan,
  setSedangMuatLebihKegiatan,
  setAdaLebihBanyakKegiatan
} from "./inti.js";

/**
 * Fase 5: Menghitung kegiatan yang menggunakan kategori tertentu secara akurat
 * lewat agregasi server (hitungItem) agar tidak bergantung pada data yang terpotong paginasi.
 */
export async function hitungKegiatanPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    return await hitungItem(KOLEKSI.KEGIATAN, [
      ["kategoriId", "==", target],
      ["dihapusAt", "==", null]
    ]);
  } catch (_e) {
    // Fallback luring ke memori yang sudah dimuat
    if (!target) {
      return getDaftarKegiatan().filter((item) => manajerKategoriKegiatan.cariInfoKategori(item.kategoriId).tetap).length;
    }
    return getDaftarKegiatan().filter((item) => String(item.kategoriId || "").trim() === target).length;
  }
}

/**
 * Memuat batch kegiatan halaman berikutnya (paginasi).
 * Mengembalikan pesan galat bila gagal; null bila berhasil. Pemanggil yang menampilkan.
 */
export async function muatLebihBanyakKegiatan() {
  if (getSedangMuatLebihKegiatan() || !getKursorHalamanKegiatan()) return null;
  setSedangMuatLebihKegiatan(true);
  beritahuPerubahanKegiatan();

  try {
    const { items, meta } = await ambilDaftar(KOLEKSI.KEGIATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggal", "desc"],
      mulaiSetelah: getKursorHalamanKegiatan(),
      batas: UKURAN_HALAMAN_KEGIATAN,
    });
    items.forEach((item) => {
      petaKegiatanTambahan.set(item.id, petakanKegiatan(item));
    });

    // meta.dokumenTerakhir adalah DocumentSnapshot mentah — satu-satunya bentuk
    // yang diterima startAfter oleh Firestore.
    if (meta.dokumenTerakhir) {
      setKursorHalamanKegiatan(meta.dokumenTerakhir);
    }
    setAdaLebihBanyakKegiatan(meta.jumlah >= UKURAN_HALAMAN_KEGIATAN);
    return null;
  } catch (err) {
    return formatPesanGalatFirestore(err);
  } finally {
    setSedangMuatLebihKegiatan(false);
    beritahuPerubahanKegiatan();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh kegiatan aktif dari server.
 * Digunakan oleh Ekspor Cadangan dan Pencarian Global mendalam.
 */
export async function ambilSemuaKegiatanSekaliPakai() {
  const { items } = await ambilDaftar(KOLEKSI.KEGIATAN, {
    filter: [["dihapusAt", "==", null]],
    urutkan: ["tanggal", "desc"],
  });
  items.forEach((item) => {
    petaKegiatanTambahan.set(item.id, petakanKegiatan(item));
  });
  beritahuPerubahanKegiatan();
  return getDaftarKegiatan();
}

/**
 * Jembatan sekali pakai untuk mengambil kegiatan pada rentang tanggal tertentu.
 * Digunakan oleh modul Laporan.
 */
export async function ambilKegiatanRentangTanggal(tanggalDari, tanggalSampai) {
  const { items } = await ambilDaftar(KOLEKSI.KEGIATAN, {
    filter: [
      ["dihapusAt", "==", null],
      ["tanggal", ">=", tanggalDari],
      ["tanggal", "<=", tanggalSampai],
    ],
    urutkan: ["tanggal", "asc"],
  });
  const hasil = [];
  items.forEach((item) => {
    const dipetakan = petakanKegiatan(item);
    petaKegiatanTambahan.set(item.id, dipetakan);
    hasil.push(dipetakan);
  });
  return hasil;
}
