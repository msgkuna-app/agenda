/**
 * Kueri Sekali Pakai Modul Catatan (Tahap 6d: dipecah dari state.js)
 * Pembacaan tidak berlangganan: memuat batch berikutnya (paginasi) dan
 * mengambil seluruh catatan dari server untuk Ekspor Cadangan, Laporan, dan
 * Pencarian Global mendalam. State memori dimiliki inti.js.
 */
import { UKURAN_HALAMAN_CATATAN, KOLEKSI } from "../../config/constants.js";
import { ambilDaftar } from "../../services/firestoreRepository.js";
import {
  beritahuPerubahanCatatan,
  getDaftarCatatan,
  getKursorCatatanTambahan,
  getPenandaHalamanCatatan,
  getSedangMuatLebihCatatan,
  laporkanGalatCatatan,
  setAdaLebihBanyakCatatan,
  setKursorCatatanTambahan,
  setSedangMencariSemuaCatatan,
  setSedangMuatLebihCatatan,
  setSeluruhCatatanSudahDimuat,
  simpanKePetaTambahan
} from "./inti.js";

/**
 * Fase 5: Memuat batch catatan berikutnya (paginasi).
 */
export async function muatLebihBanyakCatatan() {
  const kursorAwal = getKursorCatatanTambahan() || getPenandaHalamanCatatan();
  if (getSedangMuatLebihCatatan() || !kursorAwal) return;
  setSedangMuatLebihCatatan(true);
  beritahuPerubahanCatatan();

  try {
    const { items, meta } = await ambilDaftar(KOLEKSI.CATATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
      mulaiSetelah: kursorAwal,
      batas: UKURAN_HALAMAN_CATATAN,
    });
    simpanKePetaTambahan(items);

    if (meta.dokumenTerakhir) {
      setKursorCatatanTambahan(meta.dokumenTerakhir);
    }
    setAdaLebihBanyakCatatan(meta.jumlah >= UKURAN_HALAMAN_CATATAN);
    beritahuPerubahanCatatan();
  } catch (err) {
    laporkanGalatCatatan(err);
  } finally {
    setSedangMuatLebihCatatan(false);
    beritahuPerubahanCatatan();
  }
}

/**
 * Fase 5: Jembatan sekali pakai untuk mengambil seluruh catatan dari server.
 * Digunakan oleh Ekspor Cadangan, Laporan, dan Pencarian Global mendalam.
 */
export async function ambilSemuaCatatanSekaliPakai() {
  setSedangMencariSemuaCatatan(true);
  beritahuPerubahanCatatan();

  try {
    const { items } = await ambilDaftar(KOLEKSI.CATATAN, {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
    });
    simpanKePetaTambahan(items);
    setSeluruhCatatanSudahDimuat(true);
    beritahuPerubahanCatatan();
    return getDaftarCatatan();
  } finally {
    setSedangMencariSemuaCatatan(false);
    beritahuPerubahanCatatan();
  }
}
