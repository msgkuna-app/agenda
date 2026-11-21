/**
 * State Modul Sampah (Tahap 3: dipisah dari sampah.js)
 * Cache memori item kegiatan/catatan di Tempat Sampah, langganan Firestore mandiri
 * (where("dihapusAt") != null), hapus batch maks 500, dan pembersihan otomatis >30 hari.
 * TANPA DOM: pembaruan tampilan dipicu controller lewat callback onData/onGalat
 * pada langgananSampah().
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

// Cache memori internal item di Tempat Sampah
const petaKegiatanSampah = new Map();
const petaCatatanSampah = new Map();

let unsubscribeSnapshotKegiatanSampah = null;
let unsubscribeSnapshotCatatanSampah = null;
let kegiatanSampahDimuat = false;
let catatanSampahDimuat = false;
let sudahPernahBersihkanOtomatisSesiIni = false;

export function getDaftarKegiatanDiSampah() {
  return Array.from(petaKegiatanSampah.values()).map((k) => ({ ...k }));
}

export function getDaftarCatatanDiSampah() {
  return Array.from(petaCatatanSampah.values()).map((c) => ({ ...c }));
}

export function isSampahSudahDimuat() {
  return kegiatanSampahDimuat && catatanSampahDimuat;
}

/**
 * Ambil entri mentah dari peta (bukan salinan) — dipakai controller untuk dialog
 * hapus permanen dan argumen pulihkanCatatan (identitas objek sama seperti aslinya).
 */
export function ambilItemSampahMentah(tipe, id) {
  if (tipe === "kegiatan") return petaKegiatanSampah.get(id);
  return petaCatatanSampah.get(id);
}

/** Hapus satu item dari peta (optimistis, sebelum snapshot berikutnya). */
export function hapusItemSampah(tipe, id) {
  if (tipe === "kegiatan") petaKegiatanSampah.delete(id);
  else petaCatatanSampah.delete(id);
}

/** Total jumlah item di kedua peta (dipakai dialog kosongkan). */
export function hitungTotalItemSampah() {
  return petaKegiatanSampah.size + petaCatatanSampah.size;
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
 * Kosongkan Tempat Sampah: hapus semua item kegiatan+catatan via batch, lalu
 * kosongkan kedua peta. Pemanggil (controller) sudah menjamin daftar tidak kosong.
 */
export async function kosongkanSemuaItemSampah() {
  const kegSampah = getDaftarKegiatanDiSampah();
  const catSampah = getDaftarCatatanDiSampah();
  const daftarRef = [
    ...kegSampah.map((k) => ({ koleksi: KOLEKSI.KEGIATAN, id: k.id })),
    ...catSampah.map((c) => ({ koleksi: KOLEKSI.CATATAN, id: c.id }))
  ];

  if (daftarRef.length === 0) return;

  const db = getFirestoreDb();
  await hapusBatchMaks500(db, daftarRef);
  petaKegiatanSampah.clear();
  petaCatatanSampah.clear();
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
    const kadaluwarsaKegiatan = getDaftarKegiatanDiSampah().filter((k) => {
      const t = Date.parse(k.dihapusAt);
      return t && sekarang - t > TIGA_PULUH_HARI_MS;
    });

    const kadaluwarsaCatatan = getDaftarCatatanDiSampah().filter((c) => {
      const t = Date.parse(c.dihapusAt);
      return t && sekarang - t > TIGA_PULUH_HARI_MS;
    });

    const daftarHapus = [
      ...kadaluwarsaKegiatan.map((k) => ({ koleksi: KOLEKSI.KEGIATAN, id: k.id })),
      ...kadaluwarsaCatatan.map((c) => ({ koleksi: KOLEKSI.CATATAN, id: c.id }))
    ];

    if (daftarHapus.length > 0) {
      const db = getFirestoreDb();
      await hapusBatchMaks500(db, daftarHapus);
    }
  } catch (err) {
    console.warn("Pembersihan otomatis sampah > 30 hari gagal:", err);
  }
}

/**
 * Memulai langganan query mandiri Tempat Sampah:
 * - kegiatan where("dihapusAt", "!=", null)
 * - catatan where("dihapusAt", "!=", null)
 * Setiap snapshot: isi peta -> tanda dimuat -> onData() (render, di controller)
 * -> pembersihan otomatis. Galat: console.warn + onGalat(err) (controller yang
 * memformat pesan dan menampilkan banner halaman).
 * @param {{ onData?: () => void, onGalat?: (err: unknown) => void }} opsi
 */
export function langgananSampah(opsi = {}) {
  const db = getFirestoreDb();

  // Query kegiatan di tempat sampah
  try {
    const qKegiatanSampah = query(
      collection(db, KOLEKSI.KEGIATAN),
      where("dihapusAt", "!=", null)
    );

    unsubscribeSnapshotKegiatanSampah = onSnapshot(
      qKegiatanSampah,
      (snapshot) => {
        petaKegiatanSampah.clear();
        snapshot.docs.forEach((docSnap) => {
          const d = docSnap.data();
          petaKegiatanSampah.set(docSnap.id, {
            id: docSnap.id,
            judul: String(d.judul || ""),
            catatan: String(d.catatan || ""),
            tanggal: String(d.tanggal || ""),
            waktuMulai: String(d.waktuMulai || ""),
            waktuSelesai: String(d.waktuSelesai || ""),
            lokasi: String(d.lokasi || ""),
            kategoriId: String(d.kategoriId || ""),
            status: d.status || "Rencana",
            createdAt: d.createdAt || "",
            updatedAt: d.updatedAt || "",
            dihapusAt: d.dihapusAt || null
          });
        });
        kegiatanSampahDimuat = true;
        if (typeof opsi.onData === "function") opsi.onData();
        jalankanPembersihanSampahOtomatis();
      },
      (err) => {
        console.warn("Gagal memuat langganan kegiatan sampah:", err);
        if (typeof opsi.onGalat === "function") opsi.onGalat(err);
      }
    );
  } catch (err) {
    console.warn("Gagal membuat query kegiatan sampah:", err);
  }

  // Query catatan di tempat sampah
  try {
    const qCatatanSampah = query(
      collection(db, KOLEKSI.CATATAN),
      where("dihapusAt", "!=", null)
    );

    unsubscribeSnapshotCatatanSampah = onSnapshot(
      qCatatanSampah,
      (snapshot) => {
        petaCatatanSampah.clear();
        snapshot.docs.forEach((docSnap) => {
          const d = docSnap.data();
          petaCatatanSampah.set(docSnap.id, {
            id: docSnap.id,
            jenis: d.jenis || "singkat",
            judul: String(d.judul || ""),
            isi: String(d.isi || ""),
            kategori: String(d.kategori || ""),
            tag: Array.isArray(d.tag) ? d.tag : [],
            kegiatanId: String(d.kegiatanId || ""),
            templat: String(d.templat || ""),
            docId: String(d.docId || ""),
            tautan: String(d.tautan || ""),
            driveDiSampah: Boolean(d.driveDiSampah),
            disematkan: Boolean(d.disematkan),
            tanggal: String(d.tanggal || ""),
            createdAt: d.createdAt || "",
            updatedAt: d.updatedAt || "",
            dihapusAt: d.dihapusAt || null
          });
        });
        catatanSampahDimuat = true;
        if (typeof opsi.onData === "function") opsi.onData();
        jalankanPembersihanSampahOtomatis();
      },
      (err) => {
        console.warn("Gagal memuat langganan catatan sampah:", err);
        if (typeof opsi.onGalat === "function") opsi.onGalat(err);
      }
    );
  } catch (err) {
    console.warn("Gagal membuat query catatan sampah:", err);
  }
}

/**
 * Lepas kedua langganan snapshot, kosongkan peta, dan reset tanda dimuat.
 * Reset tanda pembersihan otomatis + UI tetap di controller (resetPembersihanSampah),
 * sama seperti urutan aslinya.
 */
export function lepasLanggananSampah() {
  if (typeof unsubscribeSnapshotKegiatanSampah === "function") {
    try { unsubscribeSnapshotKegiatanSampah(); } catch (_e) {}
    unsubscribeSnapshotKegiatanSampah = null;
  }
  if (typeof unsubscribeSnapshotCatatanSampah === "function") {
    try { unsubscribeSnapshotCatatanSampah(); } catch (_e) {}
    unsubscribeSnapshotCatatanSampah = null;
  }

  petaKegiatanSampah.clear();
  petaCatatanSampah.clear();
  kegiatanSampahDimuat = false;
  catatanSampahDimuat = false;
}
