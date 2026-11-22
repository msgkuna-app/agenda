/**
 * Penyiapan folder tujuan Google Drive untuk dokumen.
 * Dipisahkan dari controller agar dapat dipakai bersama oleh modal unggah
 * dokumen dan unggahan dokumen dari form kegiatan (tanpa impor melingkar).
 */
import { manajerKategoriDokumen } from "./state.js";
import {
  buatSubfolderKategoriDrive,
  pastikanFolderTanpaKategoriDrive,
  gantiNamaFolderDrive,
  ambilMetadataItemDrive,
} from "../../services/driveService.js";

/**
 * Memastikan folder Drive untuk kategori dokumen siap dipakai.
 * Mengembalikan id folder tujuan. Bila kategori tidak ada, memakai folder
 * "Tanpa Kategori".
 * @param {string} kategoriId
 * @returns {Promise<string>}
 */
export async function pastikanFolderTujuanKategoriSiap(kategoriId) {
  const idBersih = String(kategoriId || "").trim();
  const kat = idBersih ? manajerKategoriDokumen.ambilKategoriById(idBersih) : null;

  if (!kat) {
    return pastikanFolderTanpaKategoriDrive();
  }

  if (kat.folderId) {
    try {
      const meta = await ambilMetadataItemDrive(kat.folderId);
      if (meta && !meta.trashed) {
        if (!kat.folderSinkron) {
          await gantiNamaFolderDrive(kat.folderId, kat.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
            folderId: kat.folderId,
            folderSinkron: true
          });
        }
        return kat.folderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
    }
  }

  const dibuat = await buatSubfolderKategoriDrive(kat.nama);
  await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
    folderId: dibuat.folderId,
    folderSinkron: true
  });
  return dibuat.folderId;
}
