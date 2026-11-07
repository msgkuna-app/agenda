/**
 * Modul Akses Data Catatan (Fase 7C)
 * Operasi Firestore: listener realtime, paginasi, pencarian server, soft delete, pemulihan, dan hapus permanen.
 */
import {
  getFirestoreDb,
  collection,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { isDriveTokenExpired, getDriveAccessToken } from "../auth.js";
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  UKURAN_HALAMAN_CATATAN
} from "./util.js";
import {
  petaCatatanHalaman,
  petaCatatanTambahan,
  stateCatatan,
  beritahuPerubahanCatatan,
  getDaftarCatatan,
  getDaftarCatatanDiSampah
} from "./state.js";
import { renderDaftarCatatan, tampilkanNotifikasiCatatan } from "./render.js";
import { tutupModalCatatanSingkat } from "./dialog-singkat.js";
import { tutupModalBuatCatatanGdoc } from "./dialog-gdoc.js";
import { tutupDialogHapusSingkat, tutupDialogHapusGdoc } from "./dialog-hapus.js";

function parseDataCatatanDoc(docSnap) {
  const d = docSnap.data() || {};
  const jenis = d.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
  const entri = {
    id: docSnap.id,
    jenis,
    judul: String(d.judul || ""),
    isi: jenis === JENIS_CATATAN_SINGKAT ? String(d.isi || "") : "",
    kategori: String(d.kategori || ""),
    tag: Array.isArray(d.tag) ? d.tag.map((t) => String(t || "").trim()).filter(Boolean) : [],
    kegiatanId: String(d.kegiatanId || ""),
    disematkan: Boolean(d.disematkan),
    tanggal: String(d.tanggal || ""),
    createdAt: String(d.createdAt || ""),
    updatedAt: String(d.updatedAt || ""),
    dihapusAt: d.dihapusAt || null,
    driveDiSampah: Boolean(d.driveDiSampah)
  };
  if (jenis === JENIS_CATATAN_GDOC) {
    entri.templat = String(d.templat || "kosong");
    entri.docId = String(d.docId || "");
    entri.tautan = String(d.tautan || "");
  }
  return entri;
}

export async function hapusLunakCatatan(id, driveDiSampah = false) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const db = getFirestoreDb();
  await updateDoc(doc(db, "catatan", targetId), {
    dihapusAt: new Date().toISOString(),
    driveDiSampah: Boolean(driveDiSampah),
    updatedAt: new Date().toISOString()
  });
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
}

export async function pulihkanCatatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const item = getDaftarCatatanDiSampah().find((c) => c.id === targetId) ||
    petaCatatanHalaman.get(targetId) ||
    petaCatatanTambahan.get(targetId);

  let pesanDrive = "";

  if (item && item.jenis === JENIS_CATATAN_GDOC && item.driveDiSampah && item.docId) {
    if (!navigator.onLine || isDriveTokenExpired()) {
      pesanDrive = "Dokumen Google Docs masih berada di Sampah Drive (token kedaluwarsa atau offline).";
    } else {
      try {
        const token = typeof getDriveAccessToken === "function" ? getDriveAccessToken() : null;
        if (!token) {
          pesanDrive = "Dokumen Google Docs masih berada di Sampah Drive (token akses tidak tersedia).";
        } else {
          const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.docId)}?supportsAllDrives=true`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json; charset=UTF-8"
              },
              body: JSON.stringify({ trashed: false })
            }
          );
          if (!resp.ok) {
            pesanDrive = "Dokumen Google Docs masih berada di Sampah Drive (gagal memperbarui status di Google Drive).";
          }
        }
      } catch (_e) {
        pesanDrive = "Dokumen Google Docs masih berada di Sampah Drive.";
      }
    }
  }

  const db = getFirestoreDb();
  await updateDoc(doc(db, "catatan", targetId), {
    dihapusAt: null,
    driveDiSampah: false,
    updatedAt: new Date().toISOString()
  });

  return { pesanDrive };
}

export async function hapusPermanenCatatan(id) {
  const targetId = String(id || "").trim();
  if (!targetId) throw new Error("ID catatan tidak valid.");
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "catatan", targetId));
  petaCatatanHalaman.delete(targetId);
  petaCatatanTambahan.delete(targetId);
  beritahuPerubahanCatatan();
}

/**
 * Fase 5: Memuat batch catatan berikutnya (paginasi).
 */
export async function muatLebihBanyakCatatan() {
  if (stateCatatan.sedangMuatLebih || !stateCatatan.lastDocHalaman) return;
  stateCatatan.sedangMuatLebih = true;
  renderDaftarCatatan();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, "catatan"),
      where("dihapusAt", "==", null),
      orderBy("updatedAt", "desc"),
      startAfter(stateCatatan.lastDocHalaman),
      limit(UKURAN_HALAMAN_CATATAN)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const entri = parseDataCatatanDoc(docSnap);
      petaCatatanHalaman.set(docSnap.id, entri);
    });

    if (!snap.empty) {
      stateCatatan.lastDocHalaman = snap.docs[snap.docs.length - 1];
    }
    stateCatatan.adaLebihBanyak = snap.docs.length >= UKURAN_HALAMAN_CATATAN;
    beritahuPerubahanCatatan();
  } catch (err) {
    tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
  } finally {
    stateCatatan.sedangMuatLebih = false;
    renderDaftarCatatan();
  }
}

/**
 * Fase 5: Jembatan sekali pakai untuk mengambil seluruh catatan dari server.
 * Digunakan oleh Ekspor Cadangan, Laporan, dan Pencarian Global mendalam.
 */
export async function ambilSemuaCatatanSekaliPakai() {
  stateCatatan.sedangMencariSemua = true;
  renderDaftarCatatan();

  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, "catatan"),
      where("dihapusAt", "==", null),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const entri = parseDataCatatanDoc(docSnap);
      petaCatatanTambahan.set(docSnap.id, entri);
    });
    stateCatatan.seluruhCatatanSudahDimuat = true;
    beritahuPerubahanCatatan();
    return getDaftarCatatan();
  } finally {
    stateCatatan.sedangMencariSemua = false;
    renderDaftarCatatan();
  }
}

export function subscribeCatatan() {
  unsubscribeCatatan();
  stateCatatan.sudahDimuatPertamaKali = false;
  renderDaftarCatatan();
  beritahuPerubahanCatatan();

  // Fase 5: Listener terbatas 100 catatan terbaru yang tidak di tempat sampah
  const db = getFirestoreDb();
  const q = query(
    collection(db, "catatan"),
    where("dihapusAt", "==", null),
    orderBy("updatedAt", "desc"),
    limit(UKURAN_HALAMAN_CATATAN)
  );

  stateCatatan.unsubscribeSnapshot = onSnapshot(
    q,
    (snapshot) => {
      petaCatatanHalaman.clear();
      snapshot.forEach((docSnap) => {
        const entri = parseDataCatatanDoc(docSnap);
        petaCatatanHalaman.set(docSnap.id, entri);
      });

      if (!snapshot.empty) {
        stateCatatan.lastDocHalaman = snapshot.docs[snapshot.docs.length - 1];
      }
      stateCatatan.adaLebihBanyak = snapshot.docs.length >= UKURAN_HALAMAN_CATATAN;
      stateCatatan.sudahDimuatPertamaKali = true;
      renderDaftarCatatan();
      beritahuPerubahanCatatan();
    },
    (err) => {
      stateCatatan.sudahDimuatPertamaKali = true;
      tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
      renderDaftarCatatan();
      beritahuPerubahanCatatan();
    }
  );

  return () => unsubscribeCatatan();
}

export function unsubscribeCatatan() {
  if (typeof stateCatatan.unsubscribeSnapshot === "function") {
    try { stateCatatan.unsubscribeSnapshot(); } catch (_e) {}
    stateCatatan.unsubscribeSnapshot = null;
  }
  if (stateCatatan.timerSorotCatatan !== null) {
    window.clearTimeout(stateCatatan.timerSorotCatatan);
    stateCatatan.timerSorotCatatan = null;
  }
  petaCatatanHalaman.clear();
  petaCatatanTambahan.clear();
  stateCatatan.lastDocHalaman = null;
  stateCatatan.adaLebihBanyak = false;
  stateCatatan.sedangMuatLebih = false;
  stateCatatan.sedangMencariSemua = false;
  stateCatatan.seluruhCatatanSudahDimuat = false;
  stateCatatan.sudahDimuatPertamaKali = false;
  stateCatatan.sedangMembuatGdoc = false;
  stateCatatan.pengendaliFilter?.tutup(false);
  tutupModalCatatanSingkat(false);
  tutupModalBuatCatatanGdoc(false);
  tutupDialogHapusSingkat(false);
  tutupDialogHapusGdoc(false);
  tampilkanNotifikasiCatatan({ pesan: "" });
  beritahuPerubahanCatatan();
}
