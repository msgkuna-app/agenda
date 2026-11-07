/**
 * Modul Akses Data Firestore Dokumen
 * Menangani koleksi Firestore "dokumen", paginasi, hitung dokumen server, dan sinkronisasi real-time (Fase 7C)
 */
import {
  getFirestoreDb,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  onSnapshot,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import {
  buatManajerKategori,
  KATEGORI_DOKUMEN_BAWAAN
} from "../kategori.js";
import { resetCacheDrive } from "../drive.js";
import { stateDokumen, getDaftarDokumen, beritahuPerubahanDokumen, resetStateDokumen } from "./state.js";
import { UKURAN_HALAMAN_DOKUMEN } from "./util.js";

/**
 * Registry hook aksi render untuk memutus dependensi sirkular antara data dan UI.
 */
const aksiRender = {
  renderDaftarDokumen: null,
  perbaruiDropdownKategoriDokumen: null,
  tampilkanGalatHalamanDokumen: null,
  initHalamanDokumen: null
};

export function daftarkanAksiRenderDokumen(handlerObj) {
  if (handlerObj && typeof handlerObj === "object") {
    if (typeof handlerObj.renderDaftarDokumen === "function") {
      aksiRender.renderDaftarDokumen = handlerObj.renderDaftarDokumen;
    }
    if (typeof handlerObj.perbaruiDropdownKategoriDokumen === "function") {
      aksiRender.perbaruiDropdownKategoriDokumen = handlerObj.perbaruiDropdownKategoriDokumen;
    }
    if (typeof handlerObj.tampilkanGalatHalamanDokumen === "function") {
      aksiRender.tampilkanGalatHalamanDokumen = handlerObj.tampilkanGalatHalamanDokumen;
    }
    if (typeof handlerObj.initHalamanDokumen === "function") {
      aksiRender.initHalamanDokumen = handlerObj.initHalamanDokumen;
    }
  }
}

/**
 * Manajer kategori dokumen terintegrasi Firestore & folder Google Drive.
 */
export const manajerKategoriDokumen = buatManajerKategori({
  namaKoleksiKategori: "kategoriDokumen",
  namaKoleksiPemakai: "dokumen",
  labelItemPemakai: "dokumen",
  daftarBawaan: KATEGORI_DOKUMEN_BAWAAN,
  pakaiFolderDrive: true
});

/**
 * Menghitung dokumen pemakai kategori secara lokal di memori.
 * @param {string} kategoriId
 * @returns {number}
 */
export function hitungDokumenPemakaiLokal(kategoriId) {
  const target = String(kategoriId || "").trim();
  if (!target) {
    return getDaftarDokumen().filter((item) => manajerKategoriDokumen.cariInfoKategori(item.kategoriId).tetap).length;
  }
  return getDaftarDokumen().filter((item) => String(item.kategoriId || "").trim() === target).length;
}

/**
 * Fase 5: Menghitung dokumen pemakai kategori secara akurat dari server via getCountFromServer.
 * @param {string} kategoriId
 * @returns {Promise<number>}
 */
export async function hitungDokumenPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    const db = getFirestoreDb();
    if (!target) {
      const q = query(collection(db, "dokumen"), where("kategoriId", "==", ""));
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }
    const q = query(collection(db, "dokumen"), where("kategoriId", "==", target));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (_e) {
    return hitungDokumenPemakaiLokal(target);
  }
}

/**
 * Memuat batch dokumen berikutnya dari Firestore (paginasi).
 */
export async function muatLebihBanyakDokumen() {
  if (stateDokumen.sedangMuatLebihDokumen || !stateDokumen.lastDocDokumenHalaman) return;
  stateDokumen.sedangMuatLebihDokumen = true;
  aksiRender.renderDaftarDokumen?.();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, "dokumen"),
      orderBy("tanggalUnggah", "desc"),
      startAfter(stateDokumen.lastDocDokumenHalaman),
      limit(UKURAN_HALAMAN_DOKUMEN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      stateDokumen.petaDokumenHalaman.set(docSnap.id, {
        id: docSnap.id,
        namaTampilan: String(d.namaTampilan || d.namaFile || ""),
        namaFile: String(d.namaFile || ""),
        driveFileId: String(d.driveFileId || ""),
        tautan: String(d.tautan || ""),
        mimeType: String(d.mimeType || "application/octet-stream"),
        ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
        kategoriId: String(d.kategoriId || ""),
        kegiatanId: String(d.kegiatanId || ""),
        catatan: String(d.catatan || ""),
        tanggalUnggah: String(d.tanggalUnggah || d.createdAt || ""),
        createdAt: String(d.createdAt || ""),
        updatedAt: String(d.updatedAt || "")
      });
    });

    if (!snap.empty) {
      stateDokumen.lastDocDokumenHalaman = snap.docs[snap.docs.length - 1];
    }
    stateDokumen.adaLebihBanyakDokumenHalaman = snap.docs.length >= UKURAN_HALAMAN_DOKUMEN;
    beritahuPerubahanDokumen();
  } catch (err) {
    aksiRender.tampilkanGalatHalamanDokumen?.(formatPesanGalatFirestore(err));
  } finally {
    stateDokumen.sedangMuatLebihDokumen = false;
    aksiRender.renderDaftarDokumen?.();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh dokumen dari server.
 * Digunakan oleh Laporan, Ekspor Cadangan, dan Pencarian Global mendalam.
 * @returns {Promise<Array<Object>>}
 */
export async function ambilSemuaDokumenSekaliPakai() {
  const db = getFirestoreDb();
  const q = query(collection(db, "dokumen"), orderBy("tanggalUnggah", "desc"));
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    stateDokumen.petaDokumenTambahan.set(docSnap.id, {
      id: docSnap.id,
      namaTampilan: String(d.namaTampilan || d.namaFile || ""),
      namaFile: String(d.namaFile || ""),
      driveFileId: String(d.driveFileId || ""),
      tautan: String(d.tautan || ""),
      mimeType: String(d.mimeType || "application/octet-stream"),
      ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
      kategoriId: String(d.kategoriId || ""),
      kegiatanId: String(d.kegiatanId || ""),
      catatan: String(d.catatan || ""),
      tanggalUnggah: String(d.tanggalUnggah || d.createdAt || ""),
      createdAt: String(d.createdAt || ""),
      updatedAt: String(d.updatedAt || "")
    });
  });
  beritahuPerubahanDokumen();
  return getDaftarDokumen();
}

/**
 * Memulai langganan real-time snapshot koleksi dokumen.
 * @returns {Function} Fungsi unsubscribe
 */
export function subscribeDokumen() {
  unsubscribeDokumen();
  aksiRender.initHalamanDokumen?.();
  stateDokumen.sudahDimuatPertamaKali = false;
  aksiRender.renderDaftarDokumen?.();
  beritahuPerubahanDokumen();

  manajerKategoriDokumen.subscribe(
    () => {
      aksiRender.perbaruiDropdownKategoriDokumen?.();
      aksiRender.renderDaftarDokumen?.();
      beritahuPerubahanDokumen();
    },
    (pesanGalat) => aksiRender.tampilkanGalatHalamanDokumen?.(pesanGalat)
  );

  const db = getFirestoreDb();
  // Fase 5: Listener dibatasi 100 dokumen terbaru
  const q = query(
    collection(db, "dokumen"),
    orderBy("tanggalUnggah", "desc"),
    limit(UKURAN_HALAMAN_DOKUMEN)
  );

  stateDokumen.unsubscribeSnapshotDokumen = onSnapshot(
    q,
    (snapshot) => {
      stateDokumen.petaDokumenHalaman.clear();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        stateDokumen.petaDokumenHalaman.set(docSnap.id, {
          id: docSnap.id,
          namaTampilan: String(d.namaTampilan || d.namaFile || ""),
          namaFile: String(d.namaFile || ""),
          driveFileId: String(d.driveFileId || ""),
          tautan: String(d.tautan || ""),
          mimeType: String(d.mimeType || "application/octet-stream"),
          ukuran: Number.isFinite(Number(d.ukuran)) ? Number(d.ukuran) : 0,
          kategoriId: String(d.kategoriId || ""),
          kegiatanId: String(d.kegiatanId || ""),
          catatan: String(d.catatan || ""),
          tanggalUnggah: String(d.tanggalUnggah || d.createdAt || ""),
          createdAt: String(d.createdAt || ""),
          updatedAt: String(d.updatedAt || "")
        });
      });

      if (!snapshot.empty) {
        stateDokumen.lastDocDokumenHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      stateDokumen.adaLebihBanyakDokumenHalaman = snapshot.docs.length >= UKURAN_HALAMAN_DOKUMEN;
      stateDokumen.sudahDimuatPertamaKali = true;
      aksiRender.tampilkanGalatHalamanDokumen?.("");
      aksiRender.renderDaftarDokumen?.();
      stateDokumen.dialogKelolaKategoriDokCtrl?.segarkanTampilan();
      beritahuPerubahanDokumen();
    },
    (err) => {
      stateDokumen.sudahDimuatPertamaKali = true;
      aksiRender.tampilkanGalatHalamanDokumen?.(formatPesanGalatFirestore(err));
      aksiRender.renderDaftarDokumen?.();
      beritahuPerubahanDokumen();
    }
  );

  return () => unsubscribeDokumen();
}

/**
 * Menghentikan langganan snapshot dokumen dan membersihkan cache.
 */
export function unsubscribeDokumen() {
  if (typeof stateDokumen.unsubscribeSnapshotDokumen === "function") {
    try {
      stateDokumen.unsubscribeSnapshotDokumen();
    } catch (_e) {}
    stateDokumen.unsubscribeSnapshotDokumen = null;
  }

  manajerKategoriDokumen.unsubscribe();
  resetCacheDrive();
  resetStateDokumen();
  beritahuPerubahanDokumen();
}
