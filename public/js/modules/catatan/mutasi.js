/**
 * Mutasi Modul Catatan (Tahap 6d: dipecah dari state.js)
 * Perubahan status catatan di Firestore: hapus lunak, pulihkan (termasuk
 * memulihkan dokumen Google Docs dari Sampah Drive), dan hapus permanen.
 * State memori dimiliki inti.js; setiap mutasi menyegarkan peta lewat
 * penulis terkendali di inti.js.
 */
import {
  JENIS_CATATAN_GDOC,
  KOLEKSI
} from "../../config/constants.js";
import {
  ambilSatu,
  perbaruiItem,
  hapusItem,
} from "../../services/firestoreRepository.js";
import {
  pulihkanItemDariSampahDrive,
  formatPesanGalatDrive
} from "../../services/driveService.js";
import {
  beritahuPerubahanCatatan,
  hapusDariPetaCatatan
} from "./inti.js";

export async function hapusLunakCatatan(id, driveDiSampah = false) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  await perbaruiItem(KOLEKSI.CATATAN, targetId, {
    dihapusAt: new Date().toISOString(),
    driveDiSampah: Boolean(driveDiSampah),
    updatedAt: new Date().toISOString()
  });
  hapusDariPetaCatatan(targetId);
  beritahuPerubahanCatatan();
}

export async function pulihkanCatatan(id, itemOpsional = null) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");

  // Catatan di Tempat Sampah tidak ada di peta memori (listener menyaring dihapusAt),
  // sehingga datanya dibaca dari Firestore bila pemanggil tidak menyertakannya.
  let item = itemOpsional && typeof itemOpsional === "object" ? itemOpsional : null;
  let pesanDrive = "";
  if (!item) {
    try {
      item = await ambilSatu(KOLEKSI.CATATAN, targetId);
    } catch (_e) {
      pesanDrive =
        "Status dokumen Google Docs di Sampah Drive tidak dapat diperiksa (koneksi bermasalah). Jika perlu, pulihkan manual dari Sampah Google Drive.";
    }
  }

  if (item && item.jenis === JENIS_CATATAN_GDOC && item.driveDiSampah && item.docId) {
    try {
      await pulihkanItemDariSampahDrive(item.docId);
    } catch (err) {
      pesanDrive =
        err && err.isNotFound
          ? "Dokumen Google Docs tidak ditemukan di Google Drive (mungkin sudah dihapus permanen)."
          : `Dokumen Google Docs masih berada di Sampah Drive: ${formatPesanGalatDrive(err)}`;
    }
  }

  await perbaruiItem(KOLEKSI.CATATAN, targetId, {
    dihapusAt: null,
    driveDiSampah: false,
    updatedAt: new Date().toISOString()
  });
  return { pesanDrive };
}

export async function hapusPermanenCatatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  await hapusItem(KOLEKSI.CATATAN, targetId);
  hapusDariPetaCatatan(targetId);
  beritahuPerubahanCatatan();
}
