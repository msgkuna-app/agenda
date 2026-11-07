/**
 * Modul Operasi Google Drive Khusus Dokumen
 * Menangani pembuatan subfolder kategori, penanganan 404, sinkronisasi, dan pemindahan berkas (Fase 7C)
 */
import {
  buatSubfolderKategoriDrive,
  pastikanFolderTanpaKategoriDrive,
  gantiNamaFolderDrive,
  ambilMetadataItemDrive,
  pindahkanItemKeSampahDrive,
  pindahkanBerkasKeFolderDrive,
  formatPesanGalatDrive
} from "../drive.js";
import { stateDokumen, getDaftarDokumen } from "./state.js";
import { manajerKategoriDokumen } from "./data.js";

/**
 * Memastikan subfolder Google Drive kategori tujuan siap sebelum berkas diunggah atau dipindahkan.
 * Jika kategori tanpa folder (atau folder lama 404), subfolder baru akan dibuat otomatis.
 * @param {string} kategoriId
 * @returns {Promise<string>} ID folder Google Drive yang valid
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

/**
 * Membuat paket opsi siklus hidup folder Google Drive untuk dialog kelola kategori dokumen.
 * @returns {Object}
 */
export function buatOpsiDriveKategoriDokumen() {
  return {
    onSetelahTambahKategori: async (katBaru) => {
      try {
        const dibuat = await buatSubfolderKategoriDrive(katBaru.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: "",
          folderSinkron: false
        });
        return {
          peringatan: `Kategori "${katBaru.nama}" tersimpan, tetapi folder Google Drive belum dapat dibuat (${formatPesanGalatDrive(err)}). Folder akan dibuat otomatis saat dibutuhkan atau lewat tombol "Sinkronkan folder".`
        };
      }
    },

    onSetelahUbahNamaKategori: async (hasilUbah) => {
      const katTerkini = manajerKategoriDokumen.ambilKategoriById(hasilUbah.id) || hasilUbah.sebelumnya;
      const folderIdLama = String(katTerkini?.folderId || "").trim();

      if (!folderIdLama) {
        try {
          const dibuat = await buatSubfolderKategoriDrive(hasilUbah.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderId: dibuat.folderId,
            folderSinkron: true
          });
          return {};
        } catch (err) {
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderSinkron: false
          });
          return {
            peringatan: `Nama kategori diperbarui di aplikasi, namun pembuatan folder Google Drive gagal: ${formatPesanGalatDrive(err)}`
          };
        }
      }

      try {
        await gantiNamaFolderDrive(folderIdLama, hasilUbah.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderId: folderIdLama,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            peringatan: `Folder Google Drive untuk "${hasilUbah.nama}" tidak ditemukan (404). Gunakan pilihan di bawah untuk membuat ulang folder.`
          };
        }
        return {
          peringatan: `Nama kategori tersimpan, tetapi gagal mengganti nama folder di Google Drive: ${formatPesanGalatDrive(err)}`
        };
      }
    },

    onSinkronkanFolder: async (kat) => {
      const segar = manajerKategoriDokumen.ambilKategoriById(kat.id) || kat;
      if (!segar.folderId) {
        const dibuat = await buatSubfolderKategoriDrive(segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Subfolder Drive untuk kategori "${segar.nama}" berhasil dibuat dan disinkronkan.` };
      }

      try {
        await gantiNamaFolderDrive(segar.folderId, segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: segar.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Nama folder Drive untuk kategori "${segar.nama}" berhasil disinkronkan.` };
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            pesanGalat: `Folder lama tidak ditemukan di Google Drive (404). Anda dapat membuat ulang folder kategori "${segar.nama}".`
          };
        }
        throw new Error(formatPesanGalatDrive(err));
      }
    },

    onBuatUlangFolderDanPindahkan: async (kat) => {
      const dibuat = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuat.folderId,
        folderSinkron: true
      });

      const dokKategoriIni = getDaftarDokumen().filter(
        (d) => String(d.kategoriId || "").trim() === kat.id && d.driveFileId
      );
      let dipindah = 0;
      let gagal = 0;

      for (const dok of dokKategoriIni) {
        try {
          await pindahkanBerkasKeFolderDrive(dok.driveFileId, dibuat.folderId);
          dipindah += 1;
        } catch (_e) {
          gagal += 1;
        }
      }

      if (dokKategoriIni.length === 0) {
        return { pesanSukses: `Folder baru untuk kategori "${kat.nama}" berhasil dibuat di Google Drive.` };
      }
      return {
        pesanSukses:
          gagal === 0
            ? `Folder kategori "${kat.nama}" dibuat ulang dan ${dipindah} dokumen dipindahkan ke dalamnya.`
            : `Folder "${kat.nama}" dibuat ulang (${dipindah} dokumen dipindahkan, ${gagal} dokumen tidak dapat dipindahkan).`
      };
    },

    onBuangFolderBekasKeSampah: async (infoFolder) => {
      await pindahkanItemKeSampahDrive(infoFolder.folderId);
    }
  };
}

/**
 * Fase 6 Bagian B3: Menyinkronkan satu folder kategori dokumen dari halaman Pengaturan.
 * @param {string} kategoriId
 * @returns {Promise<{ nama: string, pesan: string }>}
 */
export async function sinkronkanSatuFolderKategoriDokumen(kategoriId) {
  const kat = manajerKategoriDokumen.ambilKategoriById(kategoriId);
  if (!kat) {
    throw new Error("Kategori dokumen tidak ditemukan.");
  }

  if (!kat.folderId) {
    const dibuat = await buatSubfolderKategoriDrive(kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: dibuat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Subfolder baru dibuat dan disinkronkan" };
  }

  try {
    await gantiNamaFolderDrive(kat.folderId, kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: kat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Nama folder disinkronkan" };
  } catch (err) {
    if (err && err.isNotFound) {
      const dibuatUlang = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuatUlang.folderId,
        folderSinkron: true
      });
      return { nama: kat.nama, pesan: "Folder lama tidak ditemukan (404), dibuat ulang" };
    }
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderSinkron: false
    });
    throw new Error(formatPesanGalatDrive(err));
  }
}
