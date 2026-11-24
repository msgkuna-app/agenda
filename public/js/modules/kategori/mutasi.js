/**
 * Mutasi Manajer Kategori (Tahap 6g: dipecah dari kategori/state.js)
 * Penulisan data kategori: tambah, ubah, metadata folder Drive, geser urutan,
 * hitung pemakai dari server, dan hapus aman. State memori dimiliki inti.js;
 * pembacaan yang dibutuhkan diambil dari fungsi inti.
 * TANPA DOM.
 */
import {
  tambahItem,
  perbaruiItem,
  hapusItem,
  hitungItem,
  jalankanBatch,
} from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { normalisasiWarnaKategori } from "./format.js";

/**
 * Memasang kemampuan mutasi pada konteks inti manajer kategori.
 * @param {ReturnType<import("./inti.js").buatIntiKategori>} inti
 */
export function buatMutasiKategori(inti) {
  /**
   * Menambahkan kategori baru (tetap diizinkan saat offline lewat cache Firestore).
   * @param {{ nama: string, warna: string, folderId?: string, folderSinkron?: boolean }} input
   * @returns {Promise<{ id: string, nama: string, warna: string }>}
   */
  async function tambahKategori(input) {
    const nama = inti.validasiNamaKategori(input?.nama, null);
    const warna = normalisasiWarnaKategori(input?.warna);
    const urutanMaks = inti.kategoriList.reduce(
      (maks, item) => (Number.isFinite(item.urutan) && item.urutan < 9000 ? Math.max(maks, item.urutan) : maks),
      0
    );
    const sekarang = new Date().toISOString();
    const payload = {
      nama,
      warna,
      urutan: urutanMaks + 1,
      createdAt: sekarang,
      updatedAt: sekarang
    };
    if (inti.pakaiFolderDrive) {
      payload.folderId = String(input?.folderId || "").trim();
      payload.folderSinkron = Boolean(payload.folderId) && input?.folderSinkron === true;
    }
    const idBaru = await tambahItem(inti.namaKoleksiKategori, payload);
    return { id: idBaru, nama, warna };
  }

  /**
   * Mengubah nama dan warna kategori yang sudah ada (tetap diizinkan saat offline).
   * Mengembalikan info apakah nama kategori benar-benar berubah (warna & urutan tidak menyentuh Drive).
   * @param {string} id
   * @param {{ nama: string, warna: string }} input
   */
  async function ubahKategori(id, input) {
    const targetId = String(id || "").trim();
    if (!targetId) {
      throw new Error('"Tanpa Kategori" bersifat tetap dan tidak dapat diubah.');
    }
    const sebelumnya = inti.ambilKategoriById(targetId);
    const nama = inti.validasiNamaKategori(input?.nama, targetId);
    const warna = normalisasiWarnaKategori(input?.warna);
    const namaBerubah = sebelumnya ? sebelumnya.nama !== nama : true;

    const sekarang = new Date().toISOString();
    await perbaruiItem(inti.namaKoleksiKategori, targetId, {
      nama,
      warna,
      updatedAt: sekarang
    });

    return {
      id: targetId,
      nama,
      warna,
      namaBerubah,
      sebelumnya
    };
  }

  /**
   * Memperbarui metadata sinkronisasi folder Drive pada kategoriDokumen.
   * @param {string} id
   * @param {{ folderId?: string, folderSinkron: boolean }} dataFolder
   */
  async function perbaruiStatusFolderKategori(id, dataFolder) {
    if (!inti.pakaiFolderDrive) return;
    const targetId = String(id || "").trim();
    if (!targetId) return;
    const patch = {
      folderSinkron: Boolean(dataFolder.folderSinkron),
      updatedAt: new Date().toISOString()
    };
    if (typeof dataFolder.folderId === "string") {
      patch.folderId = dataFolder.folderId.trim();
    }
    await perbaruiItem(inti.namaKoleksiKategori, targetId, patch);
  }

  /**
   * Menggeser urutan kategori naik (-1) atau turun (+1) dengan jalankanBatch (tidak menyentuh Drive).
   * @param {string} id
   * @param {"up" | "down"} arah
   */
  async function geserUrutanKategori(id, arah) {
    const terurut = inti.getDaftarKategori();
    const idx = terurut.findIndex((k) => k.id === id);
    if (idx === -1) return;

    const targetIdx = arah === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= terurut.length) return;

    const salinan = [...terurut];
    const [dipindah] = salinan.splice(idx, 1);
    salinan.splice(targetIdx, 0, dipindah);

    const sekarang = new Date().toISOString();
    const operasi = [];
    salinan.forEach((item, posisi) => {
      const urutanBaru = posisi + 1;
      if (item.urutan !== urutanBaru) {
        operasi.push({
          jenis: "update",
          koleksi: inti.namaKoleksiKategori,
          id: item.id,
          data: { urutan: urutanBaru, updatedAt: sekarang }
        });
      }
    });

    await jalankanBatch(operasi);
  }

  /**
   * Menghitung jumlah dokumen pemakai kategori langsung dari server (hitungItem).
   * @param {string} kategoriId
   * @returns {Promise<number>}
   */
  async function hitungPemakaiDariServer(kategoriId) {
    if (!navigator.onLine) {
      throw new Error(
        `Penghapusan kategori memerlukan koneksi internet untuk memeriksa jumlah ${inti.labelItemPemakai} di server.`
      );
    }
    // Penghitung server TIDAK menyaring dihapusAt dengan sengaja: pesan galat di
    // bawah menyebut "termasuk yang ada di Tempat Sampah", karena menghapus kategori
    // yang masih dirujuk item terhapus lunak akan memutus relasi saat dipulihkan.
    return hitungItem(inti.namaKoleksiPemakai, [["kategoriId", "==", String(kategoriId || "").trim()]]);
  }

  /**
   * Menghapus kategori setelah memeriksa ulang ke server (hitungItem) tepat sebelum menghapus.
   * Ditolak saat offline atau jika jumlah pemakai > 0.
   * @param {string} id
   */
  async function hapusKategoriAman(id) {
    const targetId = String(id || "").trim();
    if (!targetId) {
      throw new Error('"Tanpa Kategori" bersifat tetap dan tidak bisa dihapus.');
    }
    if (!navigator.onLine) {
      throw new Error(
        "Tidak dapat menghapus kategori saat offline. Sambungkan ke internet terlebih dahulu."
      );
    }

    const snapshotSebelumHapus = inti.ambilKategoriById(targetId);

    let jumlahServer = 0;
    try {
      jumlahServer = await hitungPemakaiDariServer(targetId);
    } catch (err) {
      if (!navigator.onLine) {
        throw new Error(
          "Tidak dapat menghapus kategori saat offline. Sambungkan ke internet terlebih dahulu."
        );
      }
      throw new Error(formatPesanGalatFirestore(err));
    }

    if (jumlahServer > 0) {
      const galatDipakai = new Error(
        `Kategori ini masih dipakai ${jumlahServer} ${inti.labelItemPemakai} (termasuk yang ada di Tempat Sampah) dan tidak bisa dihapus.`
      );
      galatDipakai.jumlahPemakai = jumlahServer;
      throw galatDipakai;
    }

    await hapusItem(inti.namaKoleksiKategori, targetId);
    return snapshotSebelumHapus;
  }

  return {
    tambahKategori,
    ubahKategori,
    perbaruiStatusFolderKategori,
    geserUrutanKategori,
    hitungPemakaiDariServer,
    hapusKategoriAman
  };
}
