/**
 * Hapus Permanen Tempat Sampah (Tahap 6f: dipecah dari sampah/state.js)
 * Tiga jalur penghapusan permanen: tombol Kosongkan, pembersihan otomatis
 * >30 hari, dan pembantu batch. Ketiganya memindahkan berkas Google Drive
 * lebih dulu agar berkas tidak menjadi yatim, lalu menghapus metadata.
 * Pemindahan berkas memerlukan jaringan, sehingga operasi ditolak/dilewati
 * saat luring. State memori dimiliki inti.js.
 */
import { TIGA_PULUH_HARI_MS } from "../../config/constants.js";
import { jalankanBatch } from "../../services/firestoreRepository.js";
import { pindahkanItemKeSampahDrive } from "../../services/driveService.js";
import {
  getTabelJenisSampah,
  ambilPetaSampah,
  hapusItemSampah,
  isSampahSudahDimuat,
  punyaBerkasDrive,
  sudahBersihkanOtomatisSesiIni,
  tandaiSudahBersihkanOtomatisSesiIni
} from "./inti.js";

/**
 * Menghapus sekumpulan dokumen di Firestore lewat jalankanBatch, yang memotong
 * sendiri operasi per BATAS_OPERASI_BATCH (500).
 * @param {Array<{ koleksi: string, id: string }>} daftarRef
 */
async function hapusBatchMaks500(daftarRef) {
  if (daftarRef.length === 0) return;
  await jalankanBatch(
    daftarRef.map((ref) => ({ jenis: "hapus", koleksi: ref.koleksi, id: ref.id }))
  );
}

/**
 * Kumpulkan item yang lolos penyaring beserta kunci koleksinya. Dipakai jalur
 * hapus permanen yang perlu memeriksa `driveFileId` sebelum metadata dihapus.
 * @param {((item: object) => boolean) | null} penyaring
 * @returns {Array<{ koleksi: string, item: object }>}
 */
function kumpulkanItemSampah(penyaring) {
  const hasil = [];
  getTabelJenisSampah().forEach((jenis) => {
    const peta = ambilPetaSampah(jenis.kunci);
    if (!peta) return;
    peta.forEach((item) => {
      if (!penyaring || penyaring(item)) {
        hasil.push({ koleksi: jenis.kunci, item });
      }
    });
  });
  return hasil;
}

/**
 * Pindahkan berkas Drive milik satu item ke Sampah Google Drive.
 * Kegiatan, catatan singkat, dan riwayat laporan tidak punya berkas, sehingga
 * langsung dianggap beres. Berkas yang sudah tidak ada (isNotFound) juga dianggap
 * beres agar metadatanya tetap boleh dihapus.
 * @param {object} item
 * @returns {Promise<boolean>} true bila metadata boleh dihapus sekarang.
 */
async function pindahkanBerkasDriveItem(item) {
  if (!punyaBerkasDrive(item)) return true;
  try {
    await pindahkanItemKeSampahDrive(String(item.driveFileId).trim());
    return true;
  } catch (err) {
    if (err && err.isNotFound) return true;
    console.warn("Gagal memindahkan berkas Drive ke Sampah Drive:", err);
    return false;
  }
}

/**
 * Kosongkan Tempat Sampah: pindahkan berkas Drive, hapus semua item dari seluruh
 * jenis aktif via batch, lalu kosongkan semua peta. Pemanggil (controller) sudah
 * menjamin daftar tidak kosong.
 *
 * Bila ada item berberkas dan perangkat luring, operasi ditolak: memindahkan berkas
 * Drive memerlukan jaringan, dan menghapus metadatanya saja akan meninggalkan berkas
 * yatim di Google Drive.
 */
export async function kosongkanSemuaItemSampah() {
  const daftarItem = kumpulkanItemSampah(null);
  if (daftarItem.length === 0) return;

  const adaBerkas = daftarItem.some(({ item }) => punyaBerkasDrive(item));
  if (adaBerkas && !navigator.onLine) {
    throw new Error(
      "Tidak ada koneksi internet. Berkas dokumen dan foto harus dipindahkan ke Sampah Google Drive lebih dulu; sambungkan perangkat lalu coba lagi."
    );
  }

  const daftarHapus = [];
  for (const entri of daftarItem) {
    const berkasBeres = await pindahkanBerkasDriveItem(entri.item);
    if (berkasBeres) daftarHapus.push({ koleksi: entri.koleksi, id: entri.item.id });
  }

  if (daftarHapus.length > 0) {
    await hapusBatchMaks500(daftarHapus);
  }

  // Item yang berkasnya gagal dipindahkan sengaja dibiarkan di peta agar tetap
  // tampil di Tempat Sampah dan dapat dicoba lagi, bukan menjadi berkas yatim.
  daftarHapus.forEach((ref) => hapusItemSampah(ref.koleksi, ref.id));
}

/**
 * Pembersihan otomatis setelah login dan data tempat sampah dimuat.
 * Berjalan sekali per sesi dan hanya bila perangkat sedang terhubung online.
 * Menghapus permanen item dengan dihapusAt > 30 hari via jalankanBatch (maks 500 per batch),
 * termasuk memindahkan berkas Drive dokumen dan foto agar tidak menjadi yatim.
 * Gagal diam-diam dengan console.warn.
 */
export async function jalankanPembersihanSampahOtomatis() {
  if (sudahBersihkanOtomatisSesiIni()) return;
  if (!navigator.onLine) return;
  if (!isSampahSudahDimuat()) return;

  tandaiSudahBersihkanOtomatisSesiIni();

  try {
    const sekarang = Date.now();
    const kadaluwarsa = kumpulkanItemSampah((item) => {
      const t = Date.parse(item.dihapusAt);
      return Boolean(t) && sekarang - t > TIGA_PULUH_HARI_MS;
    });
    if (kadaluwarsa.length === 0) return;

    const daftarHapus = [];
    for (const entri of kadaluwarsa) {
      const berkasBeres = await pindahkanBerkasDriveItem(entri.item);
      if (berkasBeres) daftarHapus.push({ koleksi: entri.koleksi, id: entri.item.id });
    }

    if (daftarHapus.length > 0) {
      await hapusBatchMaks500(daftarHapus);
      daftarHapus.forEach((ref) => hapusItemSampah(ref.koleksi, ref.id));
    }
  } catch (err) {
    console.warn("Pembersihan otomatis sampah > 30 hari gagal:", err);
  }
}
