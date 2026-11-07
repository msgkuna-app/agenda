/**
 * Modul Akses Data Firestore Kegiatan
 * Menangani operasi CRUD, langganan realtime snapshot (jendela aktif dan daftar halaman),
 * paginasi, query getDocs sekali pakai, dan penghitung server.
 */
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  UKURAN_HALAMAN_KEGIATAN,
  hitungRentangJendela
} from "./util.js";
import {
  stateKegiatan,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  beritahuPerubahanKegiatan,
  hapusCacheItem
} from "./state.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";

function normalisasiDataDokumen(docSnap) {
  const d = docSnap.data() || {};
  return {
    id: docSnap.id,
    judul: String(d.judul || ""),
    catatan: String(d.catatan || ""),
    tanggal: String(d.tanggal || ""),
    waktuMulai: String(d.waktuMulai || ""),
    waktuSelesai: String(d.waktuSelesai || ""),
    lokasi: String(d.lokasi || ""),
    kategoriId: String(d.kategoriId || ""),
    status: DAFTAR_STATUS_KEGIATAN.includes(d.status) ? d.status : "Rencana",
    createdAt: d.createdAt || "",
    updatedAt: d.updatedAt || "",
    dihapusAt: d.dihapusAt || null
  };
}

export async function hapusLunakKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, "kegiatan", targetId), {
    dihapusAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  hapusCacheItem(targetId);
  beritahuPerubahanKegiatan();
}

export async function pulihkanKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, "kegiatan", targetId), {
    dihapusAt: null,
    updatedAt: new Date().toISOString()
  });
}

export async function hapusPermanenKegiatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID kegiatan tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "kegiatan", targetId));
  hapusCacheItem(targetId);
  beritahuPerubahanKegiatan();
}

export async function ubahStatusKegiatanCepat(id, statusBaru) {
  const targetId = String(id || "").trim();
  if (!targetId || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) {
    throw new Error("Status kegiatan tidak valid.");
  }

  // Simpan status sebelumnya untuk kemungkinan rollback jika jaringan/Firestore gagal
  const itemLama =
    stateKegiatan.petaJendela.get(targetId) ||
    stateKegiatan.petaHalaman.get(targetId) ||
    stateKegiatan.petaTambahan.get(targetId);
  const statusSebelumnya = itemLama ? itemLama.status : null;
  const sekarang = new Date().toISOString();

  // Pembaruan optimis seketika pada seluruh cache memori lokal
  const perbaruiStatusLokal = (statusTerapkan) => {
    for (const peta of [stateKegiatan.petaJendela, stateKegiatan.petaHalaman, stateKegiatan.petaTambahan]) {
      const item = peta.get(targetId);
      if (item) {
        item.status = statusTerapkan;
        item.updatedAt = sekarang;
      }
    }
  };

  perbaruiStatusLokal(statusBaru);
  beritahuPerubahanKegiatan();

  try {
    const db = getFirestoreDb();
    await updateDoc(doc(db, "kegiatan", targetId), {
      status: statusBaru,
      updatedAt: sekarang
    });
  } catch (err) {
    // Rollback ke status semula jika updateDoc ditolak oleh Firestore
    if (statusSebelumnya) {
      perbaruiStatusLokal(statusSebelumnya);
      beritahuPerubahanKegiatan();
    }
    throw err;
  }
}

export async function simpanKegiatanFirestore(payload, idEdit = "") {
  const db = getFirestoreDb();
  const sekarang = new Date().toISOString();

  if (idEdit) {
    await updateDoc(doc(db, "kegiatan", idEdit), { ...payload, updatedAt: sekarang });
    // Pembaruan optimis pada memori internal untuk item yang diubah
    const perbaruiItemMemori = (peta) => {
      const item = peta.get(idEdit);
      if (item) {
        Object.assign(item, payload, { updatedAt: sekarang });
      }
    };
    perbaruiItemMemori(stateKegiatan.petaJendela);
    perbaruiItemMemori(stateKegiatan.petaHalaman);
    perbaruiItemMemori(stateKegiatan.petaTambahan);
    beritahuPerubahanKegiatan();
  } else {
    // Fase 5: Selalu setel dihapusAt: null pada dokumen baru
    await addDoc(collection(db, "kegiatan"), {
      ...payload,
      dihapusAt: null,
      createdAt: sekarang,
      updatedAt: sekarang
    });
  }
}

/**
 * Fase 5: Menghitung kegiatan yang menggunakan kategori tertentu secara akurat
 * menggunakan getCountFromServer agar tidak bergantung pada data yang terpotong paginasi.
 */
export async function hitungKegiatanPemakaiServer(kategoriId) {
  const target = String(kategoriId || "").trim();
  try {
    const db = getFirestoreDb();
    if (!target) {
      // Tanpa kategori: kategoriId == ""
      const q = query(
        collection(db, "kegiatan"),
        where("kategoriId", "==", ""),
        where("dihapusAt", "==", null)
      );
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }
    const q = query(
      collection(db, "kegiatan"),
      where("kategoriId", "==", target),
      where("dihapusAt", "==", null)
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (_e) {
    // Fallback luring ke memori yang sudah dimuat
    if (!target) {
      return getDaftarKegiatan().filter((item) => manajerKategoriKegiatan.cariInfoKategori(item.kategoriId).tetap).length;
    }
    return getDaftarKegiatan().filter((item) => String(item.kategoriId || "").trim() === target).length;
  }
}

/**
 * Memuat batch kegiatan halaman berikutnya (paginasi).
 */
export async function muatLebihBanyakKegiatan(callbacks = {}) {
  const { onMulai, onSelesai, onGalat } = callbacks;
  if (stateKegiatan.sedangMuatLebihBanyak || !stateKegiatan.lastDocHalaman) return;

  stateKegiatan.sedangMuatLebihBanyak = true;
  if (typeof onMulai === "function") onMulai();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, "kegiatan"),
      where("dihapusAt", "==", null),
      orderBy("tanggal", "desc"),
      startAfter(stateKegiatan.lastDocHalaman),
      limit(UKURAN_HALAMAN_KEGIATAN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      stateKegiatan.petaHalaman.set(docSnap.id, normalisasiDataDokumen(docSnap));
    });

    if (!snap.empty) {
      stateKegiatan.lastDocHalaman = snap.docs[snap.docs.length - 1];
    }
    stateKegiatan.adaLebihBanyakHalaman = snap.docs.length >= UKURAN_HALAMAN_KEGIATAN;
    beritahuPerubahanKegiatan();
  } catch (err) {
    const pesan = formatPesanGalatFirestore(err);
    if (typeof onGalat === "function") onGalat(pesan);
  } finally {
    stateKegiatan.sedangMuatLebihBanyak = false;
    if (typeof onSelesai === "function") onSelesai();
  }
}

/**
 * Jembatan sekali pakai untuk mengambil seluruh kegiatan aktif dari server.
 * Digunakan oleh Ekspor Cadangan dan Pencarian Global mendalam.
 */
export async function ambilSemuaKegiatanSekaliPakai() {
  const db = getFirestoreDb();
  const q = query(
    collection(db, "kegiatan"),
    where("dihapusAt", "==", null),
    orderBy("tanggal", "desc")
  );
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    stateKegiatan.petaTambahan.set(docSnap.id, normalisasiDataDokumen(docSnap));
  });
  beritahuPerubahanKegiatan();
  return getDaftarKegiatan();
}

/**
 * Jembatan sekali pakai untuk mengambil kegiatan pada rentang tanggal tertentu.
 * Digunakan oleh modul Laporan.
 */
export async function ambilKegiatanRentangTanggal(tanggalDari, tanggalSampai) {
  const db = getFirestoreDb();
  const q = query(
    collection(db, "kegiatan"),
    where("dihapusAt", "==", null),
    where("tanggal", ">=", tanggalDari),
    where("tanggal", "<=", tanggalSampai),
    orderBy("tanggal", "asc")
  );
  const snap = await getDocs(q);
  const hasil = [];
  snap.forEach((docSnap) => {
    const item = normalisasiDataDokumen(docSnap);
    stateKegiatan.petaTambahan.set(docSnap.id, item);
    hasil.push(item);
  });
  return hasil;
}

export function mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir, callbacks = {}) {
  const { onData, onGalat } = callbacks;
  if (typeof stateKegiatan.unsubscribeJendela === "function") {
    try { stateKegiatan.unsubscribeJendela(); } catch (_e) {}
    stateKegiatan.unsubscribeJendela = null;
  }

  stateKegiatan.jendelaAwalAktif = tglAwal;
  stateKegiatan.jendelaAkhirAktif = tglAkhir;

  const db = getFirestoreDb();
  const q = query(
    collection(db, "kegiatan"),
    where("dihapusAt", "==", null),
    where("tanggal", ">=", tglAwal),
    where("tanggal", "<=", tglAkhir),
    orderBy("tanggal", "asc")
  );

  stateKegiatan.unsubscribeJendela = onSnapshot(
    q,
    (snapshot) => {
      stateKegiatan.petaJendela.clear();
      snapshot.forEach((docSnap) => {
        stateKegiatan.petaJendela.set(docSnap.id, normalisasiDataDokumen(docSnap));
      });
      stateKegiatan.sudahDimuatPertamaKali = true;
      if (typeof onData === "function") onData();
      beritahuPerubahanKegiatan();
    },
    (err) => {
      stateKegiatan.sudahDimuatPertamaKali = true;
      const pesan = formatPesanGalatFirestore(err);
      if (typeof onGalat === "function") onGalat(pesan);
      beritahuPerubahanKegiatan();
    }
  );
}

export function mulaiLanggananHalamanKegiatan(callbacks = {}) {
  const { onData, onGalat } = callbacks;
  if (typeof stateKegiatan.unsubscribeHalaman === "function") {
    try { stateKegiatan.unsubscribeHalaman(); } catch (_e) {}
    stateKegiatan.unsubscribeHalaman = null;
  }

  const db = getFirestoreDb();
  const q = query(
    collection(db, "kegiatan"),
    where("dihapusAt", "==", null),
    orderBy("tanggal", "desc"),
    limit(UKURAN_HALAMAN_KEGIATAN)
  );

  stateKegiatan.unsubscribeHalaman = onSnapshot(
    q,
    (snapshot) => {
      stateKegiatan.petaHalaman.clear();
      snapshot.forEach((docSnap) => {
        stateKegiatan.petaHalaman.set(docSnap.id, normalisasiDataDokumen(docSnap));
      });

      if (!snapshot.empty) {
        stateKegiatan.lastDocHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      stateKegiatan.adaLebihBanyakHalaman = snapshot.docs.length >= UKURAN_HALAMAN_KEGIATAN;
      stateKegiatan.sudahDimuatPertamaKali = true;
      if (typeof onData === "function") onData();
      beritahuPerubahanKegiatan();
    },
    (err) => {
      const pesan = formatPesanGalatFirestore(err);
      if (typeof onGalat === "function") onGalat(pesan);
    }
  );
}

/**
 * Menyinkronkan listener jendela tanggal aktif saat berpindah bulan pada Kalender Jadwal.
 */
export function sinkronkanJendelaTanggalKegiatan(tahun, bulanIndex, callbacks = {}) {
  const { tglAwal, tglAkhir } = hitungRentangJendela(tahun, bulanIndex);
  if (
    tglAwal === stateKegiatan.jendelaAwalAktif &&
    tglAkhir === stateKegiatan.jendelaAkhirAktif &&
    stateKegiatan.unsubscribeJendela
  ) {
    return;
  }
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir, callbacks);
}