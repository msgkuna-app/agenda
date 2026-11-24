/**
 * Kueri Modul Dokumen (2026-11-25: pecahan dari state.js)
 *
 * Pembacaan sekali pakai ke Firestore: agregasi penghitung pemakai kategori
 * (dipakai dialog Kelola Kategori Dokumen), paginasi "muat lebih banyak", dan
 * jembatan ambil-semua untuk Laporan, Ekspor Cadangan, serta Pencarian Global.
 *
 * Seluruh state bersama (peta, kursor, bendera) dimiliki `inti.js`.
 */
import { UKURAN_HALAMAN_DOKUMEN, KOLEKSI } from "../../config/constants.js";
import { ambilDaftar, hitungItem } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import {
  manajerKategoriDokumen,
  petaDokumenTambahan,
  petakanDokumen,
  getDaftarDokumen,
  beritahuPerubahanDokumen,
  getKursorTambahan,
  setKursorTambahan,
  getPenandaHalamanAkhir,
  setAdaLebihBanyakDokumen,
  sedangMemuatLebihDokumen,
  setSedangMemuatLebihDokumen,
} from "./inti.js";

/**
 * Fase 5: Menghitung dokumen pemakai kategori secara akurat dari server via agregasi.
 */
export async function hitungDokumenPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    // Hanya dokumen aktif yang dihitung: dokumen di Tempat Sampah tidak lagi "memakai"
    // kategori, sejalan dengan dialog Kelola Kategori yang memperingatkan sebelum hapus.
    return await hitungItem(KOLEKSI.DOKUMEN, [
      ["kategoriId", "==", target],
      ["dihapusAt", "==", null]
    ]);
  } catch (_e) {
    return hitungDokumenPemakaiLokal(target);
  }
}

/**
 * Penghitung cadangan berbasis memori (sinkron). Dipakai sebagai fallback saat
 * agregasi server gagal, DAN dipakai dialog Kelola Kategori lewat `hitungPemakaiLokal`
 * yang mensyaratkan fungsi sinkron pengembali angka (angka akurat dari server masuk
 * lewat `cacheHitunganServer`, bukan lewat jalur ini).
 */
export function hitungDokumenPemakaiLokal(kategoriId) {
  const target = String(kategoriId || "").trim();
  if (!target) {
    return getDaftarDokumen().filter((item) => manajerKategoriDokumen.cariInfoKategori(item.kategoriId).tetap).length;
  }
  return getDaftarDokumen().filter((item) => String(item.kategoriId || "").trim() === target).length;
}

/**
 * Memuat batch dokumen berikutnya (paginasi server).
 * Mengembalikan pesan galat bila gagal; null bila berhasil. Pemanggil yang menampilkan.
 */
export async function muatLebihBanyakDokumen() {
  const kursorAwal = getKursorTambahan() || getPenandaHalamanAkhir();
  if (sedangMemuatLebihDokumen() || !kursorAwal) return null;
  setSedangMemuatLebihDokumen(true);
  beritahuPerubahanDokumen();

  try {
    const { items, meta } = await ambilDaftar(KOLEKSI.DOKUMEN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggalUnggah", "desc"],
      mulaiSetelah: kursorAwal,
      batas: UKURAN_HALAMAN_DOKUMEN,
    });
    items.forEach((item) => {
      petaDokumenTambahan.set(item.id, petakanDokumen(item));
    });

    // meta.dokumenTerakhir adalah DocumentSnapshot mentah — satu-satunya bentuk
    // yang diterima startAfter oleh Firestore.
    if (meta.dokumenTerakhir) {
      setKursorTambahan(meta.dokumenTerakhir);
    }
    // Sejak Tahap D kueri sudah menyaring dokumen di Tempat Sampah, sehingga jumlah
    // dokumen yang terbaca sama dengan jumlah dokumen aktif yang akan tampil.
    setAdaLebihBanyakDokumen(meta.jumlah >= UKURAN_HALAMAN_DOKUMEN);
    return null;
  } catch (err) {
    return formatPesanGalatFirestore(err);
  } finally {
    setSedangMemuatLebihDokumen(false);
    beritahuPerubahanDokumen();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh dokumen aktif dari server.
 * Digunakan oleh Laporan, Ekspor Cadangan, dan Pencarian Global mendalam.
 * Sejak Tahap D kueri menyaring where("dihapusAt", "==", null), sehingga dokumen di
 * Tempat Sampah tidak ikut terbaca. Ini juga yang menjaga aturan "ekspor JSON hanya
 * memuat item aktif" tanpa penyaringan tambahan di pemanggil.
 */
export async function ambilSemuaDokumenSekaliPakai() {
  const { items } = await ambilDaftar(KOLEKSI.DOKUMEN, {
    filter: [["dihapusAt", "==", null]],
    urutkan: ["tanggalUnggah", "desc"],
  });
  items.forEach((item) => {
    petaDokumenTambahan.set(item.id, petakanDokumen(item));
  });
  beritahuPerubahanDokumen();
  return getDaftarDokumen();
}
