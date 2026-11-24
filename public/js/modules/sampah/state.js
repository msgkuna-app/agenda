/**
 * State Modul Sampah (Tahap 3: dipisah dari sampah.js; Tahap B: berbasis tabel jenis)
 * Cache memori item di Tempat Sampah, langganan Firestore mandiri
 * (where("dihapusAt") != null), hapus batch maks 500, dan pembersihan otomatis >30 hari.
 * TANPA DOM: pembaruan tampilan dipicu controller lewat callback onData/onGalat
 * pada langgananSampah().
 *
 * Seluruh perilaku diatur tabel JENIS_SAMPAH. Menambah jenis baru cukup dengan
 * menambah satu baris di tabel itu beserta fungsi normalkan-nya.
 *
 * Sejak v1.8.44 kelima koleksi hapus lunak terdaftar, termasuk dokumen dan foto yang
 * berberkas di Google Drive. Setiap penghapusan permanen (tombol per item, tombol
 * Kosongkan, dan pembersihan otomatis >30 hari) memindahkan berkas Drive lebih dulu
 * agar berkas tidak menjadi yatim. Pemindahan itu memerlukan jaringan, sehingga
 * pembersihan otomatis dilewati saat luring dan kedua tombol hapus permanen menolak
 * item berberkas saat luring.
 */
import { TIGA_PULUH_HARI_MS, BATAS_OPERASI_BATCH, KOLEKSI } from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  writeBatch,
  onSnapshot,
  query,
  where
} from "../../services/firestoreService.js";
import { pindahkanItemKeSampahDrive } from "../../services/driveService.js";
import {
  normalkanKegiatan,
  normalkanCatatan,
  normalkanDokumen,
  normalkanFoto,
  normalkanLaporan
} from "./normalisasi.js";

/**
 * Tabel jenis item Tempat Sampah. `kunci` adalah nama koleksi Firestore sekaligus
 * nilai data-sampah-tipe di antarmuka. Sejak v1.8.44 kelima koleksi hapus lunak
 * terdaftar; seluruhnya sudah termigrasi ke field dihapusAt sehingga kueri
 * where("dihapusAt", "!=", null) aman dijalankan.
 */
const JENIS_SAMPAH = [
  { kunci: KOLEKSI.KEGIATAN, normalkan: normalkanKegiatan },
  { kunci: KOLEKSI.CATATAN, normalkan: normalkanCatatan },
  { kunci: KOLEKSI.DOKUMEN, normalkan: normalkanDokumen },
  { kunci: KOLEKSI.FOTO, normalkan: normalkanFoto },
  { kunci: KOLEKSI.LAPORAN, normalkan: normalkanLaporan }
];

const petaPerJenis = new Map();      // kunci -> Map(id -> item)
const langgananPerJenis = new Map(); // kunci -> unsubscribe
const statusMuatPerJenis = new Map(); // kunci -> boolean

JENIS_SAMPAH.forEach((jenis) => {
  petaPerJenis.set(jenis.kunci, new Map());
  langgananPerJenis.set(jenis.kunci, null);
  statusMuatPerJenis.set(jenis.kunci, false);
});

let sudahPernahBersihkanOtomatisSesiIni = false;

/** Daftar kunci jenis yang aktif di Tempat Sampah (dipakai view untuk opsi filter). */
export function getJenisSampah() {
  return JENIS_SAMPAH.map((jenis) => jenis.kunci);
}

/** Salinan item satu jenis; daftar kosong bila kunci tidak dikenal. */
export function getDaftarSampah(kunci) {
  const peta = petaPerJenis.get(kunci);
  if (!peta) return [];
  return Array.from(peta.values()).map((item) => ({ ...item }));
}

/** Salinan seluruh item dari semua jenis aktif. */
export function getSemuaItemSampah() {
  const hasil = [];
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => hasil.push({ ...item }));
  });
  return hasil;
}

export function isSampahSudahDimuat() {
  return JENIS_SAMPAH.every((jenis) => statusMuatPerJenis.get(jenis.kunci) === true);
}

/**
 * Ambil entri mentah dari peta (bukan salinan) — dipakai controller untuk dialog
 * hapus permanen dan argumen pulihkanCatatan (identitas objek sama seperti aslinya).
 */
export function ambilItemSampahMentah(kunci, id) {
  const peta = petaPerJenis.get(kunci);
  return peta ? peta.get(id) : undefined;
}

/** Hapus satu item dari peta (optimistis, sebelum snapshot berikutnya). */
export function hapusItemSampah(kunci, id) {
  const peta = petaPerJenis.get(kunci);
  if (peta) peta.delete(id);
}

/** Total jumlah item di seluruh jenis (dipakai dialog kosongkan). */
export function hitungTotalItemSampah() {
  let total = 0;
  JENIS_SAMPAH.forEach((jenis) => {
    total += petaPerJenis.get(jenis.kunci).size;
  });
  return total;
}

/** Jumlah item di Tempat Sampah yang masih menunjuk berkas Google Drive. */
export function hitungItemSampahBerberkas() {
  let total = 0;
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => {
      if (punyaBerkasDrive(item)) total += 1;
    });
  });
  return total;
}

/** Reset tanda pembersihan otomatis (sekali per sesi). */
export function resetFlagPembersihanSampah() {
  sudahPernahBersihkanOtomatisSesiIni = false;
}

/**
 * Menghapus sekumpulan dokumen di Firestore memakai writeBatch dengan batas maksimal 500 operasi.
 * @param {import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js").Firestore} db
 * @param {Array<{ koleksi: string, id: string }>} daftarRef
 */
async function hapusBatchMaks500(db, daftarRef) {
  for (let i = 0; i < daftarRef.length; i += BATAS_OPERASI_BATCH) {
    const chunk = daftarRef.slice(i, i + BATAS_OPERASI_BATCH);
    const batch = writeBatch(db);
    chunk.forEach((ref) => {
      batch.delete(doc(db, ref.koleksi, ref.id));
    });
    await batch.commit();
  }
}

/**
 * Kumpulkan item yang lolos penyaring beserta kunci koleksinya. Dipakai jalur
 * hapus permanen yang perlu memeriksa `driveFileId` sebelum metadata dihapus.
 * @param {((item: object) => boolean) | null} penyaring
 * @returns {Array<{ koleksi: string, item: object }>}
 */
function kumpulkanItemSampah(penyaring) {
  const hasil = [];
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => {
      if (!penyaring || penyaring(item)) {
        hasil.push({ koleksi: jenis.kunci, item });
      }
    });
  });
  return hasil;
}

/**
 * True bila item ini menunjuk berkas Google Drive (dokumen dan foto).
 * Dipakai internal modul ini dan controller (untuk memperingatkan saat luring).
 */
export function punyaBerkasDrive(item) {
  return String((item && item.driveFileId) || "").trim() !== "";
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
    const db = getFirestoreDb();
    await hapusBatchMaks500(db, daftarHapus);
  }

  // Item yang berkasnya gagal dipindahkan sengaja dibiarkan di peta agar tetap
  // tampil di Tempat Sampah dan dapat dicoba lagi, bukan menjadi berkas yatim.
  daftarHapus.forEach((ref) => hapusItemSampah(ref.koleksi, ref.id));
}

/**
 * Pembersihan otomatis setelah login dan data tempat sampah dimuat.
 * Berjalan sekali per sesi dan hanya bila perangkat sedang terhubung online.
 * Menghapus permanen item dengan dihapusAt > 30 hari via writeBatch (maks 500 per batch),
 * termasuk memindahkan berkas Drive dokumen dan foto agar tidak menjadi yatim.
 * Gagal diam-diam dengan console.warn.
 */
export async function jalankanPembersihanSampahOtomatis() {
  if (sudahPernahBersihkanOtomatisSesiIni) return;
  if (!navigator.onLine) return;
  if (!isSampahSudahDimuat()) return;

  sudahPernahBersihkanOtomatisSesiIni = true;

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
      const db = getFirestoreDb();
      await hapusBatchMaks500(db, daftarHapus);
      daftarHapus.forEach((ref) => hapusItemSampah(ref.koleksi, ref.id));
    }
  } catch (err) {
    console.warn("Pembersihan otomatis sampah > 30 hari gagal:", err);
  }
}

/**
 * Memulai langganan query mandiri Tempat Sampah untuk setiap jenis aktif:
 * where("dihapusAt", "!=", null).
 * Setiap snapshot: isi peta -> tanda dimuat -> onData() (render, di controller)
 * -> pembersihan otomatis. Galat: console.warn + onGalat(err) (controller yang
 * memformat pesan dan menampilkan banner halaman).
 * @param {{ onData?: () => void, onGalat?: (err: unknown) => void }} opsi
 */
export function langgananSampah(opsi = {}) {
  const db = getFirestoreDb();

  JENIS_SAMPAH.forEach((jenis) => {
    try {
      const kueriJenis = query(
        collection(db, jenis.kunci),
        where("dihapusAt", "!=", null)
      );

      const unsubscribe = onSnapshot(
        kueriJenis,
        (snapshot) => {
          const peta = petaPerJenis.get(jenis.kunci);
          peta.clear();
          snapshot.docs.forEach((docSnap) => {
            const item = jenis.normalkan(docSnap);
            peta.set(item.id, item);
          });
          statusMuatPerJenis.set(jenis.kunci, true);
          if (typeof opsi.onData === "function") opsi.onData();
          jalankanPembersihanSampahOtomatis();
        },
        (err) => {
          console.warn(`Gagal memuat langganan ${jenis.kunci} sampah:`, err);
          if (typeof opsi.onGalat === "function") opsi.onGalat(err);
        }
      );

      langgananPerJenis.set(jenis.kunci, unsubscribe);
    } catch (err) {
      console.warn(`Gagal membuat query ${jenis.kunci} sampah:`, err);
    }
  });
}

/**
 * Lepas semua langganan snapshot, kosongkan semua peta, dan reset tanda dimuat.
 * Reset tanda pembersihan otomatis + UI tetap di controller (resetPembersihanSampah),
 * sama seperti urutan aslinya.
 */
export function lepasLanggananSampah() {
  langgananPerJenis.forEach((unsubscribe, kunci) => {
    if (typeof unsubscribe === "function") {
      try { unsubscribe(); } catch (_e) {}
    }
    langgananPerJenis.set(kunci, null);
  });

  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).clear();
    statusMuatPerJenis.set(jenis.kunci, false);
  });
}
