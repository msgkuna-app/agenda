/**
 * State Modul Sampah (Tahap 3: dipisah dari sampah.js; Tahap B: berbasis tabel jenis)
 * Cache memori item di Tempat Sampah, langganan Firestore mandiri
 * (where("dihapusAt") != null), hapus batch maks 500, dan pembersihan otomatis >30 hari.
 * TANPA DOM: pembaruan tampilan dipicu controller lewat callback onData/onGalat
 * pada langgananSampah().
 *
 * Seluruh perilaku diatur tabel JENIS_SAMPAH. Menambah jenis baru (Tahap E) cukup
 * dengan menambah satu baris di tabel itu beserta fungsi normalkan-nya.
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
import { normalkanKegiatan, normalkanCatatan } from "./normalisasi.js";

/**
 * Tabel jenis item Tempat Sampah. `kunci` adalah nama koleksi Firestore sekaligus
 * nilai data-sampah-tipe di antarmuka. Tabel ini sengaja hanya memuat dua jenis
 * sampai Tahap E mendaftarkan dokumen, foto, dan laporan — koleksi yang belum
 * terdaftar tidak dilanggan sama sekali, sehingga tidak ada kueri baru yang berjalan.
 */
const JENIS_SAMPAH = [
  { kunci: KOLEKSI.KEGIATAN, normalkan: normalkanKegiatan },
  { kunci: KOLEKSI.CATATAN, normalkan: normalkanCatatan }
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

/** Kumpulkan { koleksi, id } seluruh item yang lolos penyaring. */
function kumpulkanRefSampah(penyaring) {
  const daftarRef = [];
  JENIS_SAMPAH.forEach((jenis) => {
    petaPerJenis.get(jenis.kunci).forEach((item) => {
      if (!penyaring || penyaring(item)) {
        daftarRef.push({ koleksi: jenis.kunci, id: item.id });
      }
    });
  });
  return daftarRef;
}

/**
 * Kosongkan Tempat Sampah: hapus semua item dari seluruh jenis aktif via batch,
 * lalu kosongkan semua peta. Pemanggil (controller) sudah menjamin daftar tidak kosong.
 */
export async function kosongkanSemuaItemSampah() {
  const daftarRef = kumpulkanRefSampah(null);
  if (daftarRef.length === 0) return;

  const db = getFirestoreDb();
  await hapusBatchMaks500(db, daftarRef);
  JENIS_SAMPAH.forEach((jenis) => petaPerJenis.get(jenis.kunci).clear());
}

/**
 * Pembersihan otomatis setelah login dan data tempat sampah dimuat.
 * Berjalan sekali per sesi dan hanya bila perangkat sedang terhubung online.
 * Menghapus permanen item dengan dihapusAt > 30 hari via writeBatch (maks 500 per batch).
 * Gagal diam-diam dengan console.warn.
 */
export async function jalankanPembersihanSampahOtomatis() {
  if (sudahPernahBersihkanOtomatisSesiIni) return;
  if (!navigator.onLine) return;
  if (!isSampahSudahDimuat()) return;

  sudahPernahBersihkanOtomatisSesiIni = true;

  try {
    const sekarang = Date.now();
    const daftarHapus = kumpulkanRefSampah((item) => {
      const t = Date.parse(item.dihapusAt);
      return Boolean(t) && sekarang - t > TIGA_PULUH_HARI_MS;
    });

    if (daftarHapus.length > 0) {
      const db = getFirestoreDb();
      await hapusBatchMaks500(db, daftarHapus);
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
