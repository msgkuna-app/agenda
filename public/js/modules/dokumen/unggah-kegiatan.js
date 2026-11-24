/**
 * Unggah berkas sebagai dokumen terkait kegiatan.
 * Dipakai oleh form Tambah/Ubah Kegiatan: berkas dipilih sebelum kegiatan
 * tersimpan, lalu setelah kegiatan dibuat berkas ini diunggah ke Google Drive
 * dan dicatat ke koleksi "dokumen" dengan kegiatanId.
 */
import { KOLEKSI } from "../../config/constants.js";
import { tambahItem } from "../../services/firestoreRepository.js";
import { unggahBerkasKeDrive, formatPesanGalatDrive } from "../../services/driveService.js";
import { beritahuPerubahanDokumen } from "./state.js";
import { pastikanFolderTujuanKategoriSiap } from "./folder.js";

/**
 * Mengunggah satu berkas ke Drive lalu mencatatnya sebagai dokumen kegiatan.
 * @param {{
 *   file: File,
 *   kegiatanId: string,
 *   kategoriId?: string,
 *   catatan?: string,
 *   onProgress?: (persen: number, terunggah: number, total: number, infoDetail?: any) => void
 * }} opsi
 * @returns {Promise<object>} hasil unggahan Drive
 */
export async function unggahBerkasSebagaiDokumenKegiatan({
  file,
  kegiatanId,
  kategoriId = "",
  catatan = "",
  onProgress,
} = {}) {
  if (!(file instanceof File)) {
    throw new Error("Berkas yang akan diunggah tidak valid.");
  }
  if (!String(kegiatanId || "").trim()) {
    throw new Error("Kegiatan belum tersimpan, dokumen belum dapat dikaitkan.");
  }
  if (!navigator.onLine) {
    throw new Error("Tidak ada koneksi internet. Unggahan ke Google Drive memerlukan sambungan aktif.");
  }

  const folderTujuanId = await pastikanFolderTujuanKategoriSiap(kategoriId);

  const tugasUnggah = unggahBerkasKeDrive({
    file,
    folderId: folderTujuanId,
    namaSimpanDrive: file.name,
    onProgress: typeof onProgress === "function" ? onProgress : undefined,
  });

  let hasilDrive;
  try {
    hasilDrive = await tugasUnggah.promise;
  } catch (err) {
    throw new Error(formatPesanGalatDrive(err));
  }

  const sekarangIso = new Date().toISOString();
  await tambahItem(KOLEKSI.DOKUMEN, {
    namaTampilan: hasilDrive.name || file.name,
    namaFile: hasilDrive.name || file.name,
    driveFileId: hasilDrive.id || "",
    tautan: hasilDrive.webViewLink || "",
    mimeType: hasilDrive.mimeType || file.type || "application/octet-stream",
    ukuran: Number.isFinite(Number(hasilDrive.size)) ? Number(hasilDrive.size) : file.size,
    kategoriId: String(kategoriId || "").trim(),
    kegiatanId: String(kegiatanId || "").trim(),
    catatan: String(catatan || "").trim(),
    tanggalUnggah: sekarangIso,
    createdAt: sekarangIso,
    updatedAt: sekarangIso,
    // Wajib ada sejak awal: kueri aktif memakai where("dihapusAt", "==", null), yang
    // TIDAK cocok untuk dokumen tanpa field ini.
    dihapusAt: null,
  });
  beritahuPerubahanDokumen();

  return hasilDrive;
}
