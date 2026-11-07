/**
 * Akses Data Firestore & Migrasi Soft Delete untuk Pengaturan
 */
import {
  getFirestoreDb,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { escapeHtml, tampilkanToast } from "../sidebar.js";
import {
  KUNCI_STORAGE_CADANGAN_TERAKHIR,
  KUNCI_STORAGE_CADANGAN_INTERVAL,
  getStatusCadangan,
  setStatusCadangan,
  beriTahuPerubahanCadangan
} from "./state.js";

export async function muatPengaturanCadangan() {
  let terakhir = null;
  let interval = 14;

  try {
    const t = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
    if (t) terakhir = t;
    const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
    if (inv !== null && !Number.isNaN(Number(inv))) {
      interval = Number(inv);
    }
  } catch (_e) {}

  try {
    const db = getFirestoreDb();
    const docRef = doc(db, "pengaturan", "cadangan");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.terakhirEksporAt) {
        terakhir = String(data.terakhirEksporAt);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_TERAKHIR, terakhir);
        } catch (_e2) {}
      }
      if (data.intervalHari !== undefined && Number.isFinite(Number(data.intervalHari))) {
        interval = Number(data.intervalHari);
        try {
          localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(interval));
        } catch (_e3) {}
      }
    }
  } catch (_err) {
    // Offline: tetap gunakan salinan lokal dari localStorage
  }

  setStatusCadangan({
    terakhirEksporAt: terakhir,
    intervalHari: interval,
    sudahDimuat: true
  });

  beriTahuPerubahanCadangan();
  return getStatusCadangan();
}

export async function simpanIntervalCadangan(intervalBaru, onSelesai) {
  const inv = Number(intervalBaru);
  setStatusCadangan({ intervalHari: inv });

  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_INTERVAL, String(inv));
  } catch (_e) {}

  try {
    const db = getFirestoreDb();
    await setDoc(
      doc(db, "pengaturan", "cadangan"),
      {
        intervalHari: inv,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (_err) {
    // Jika gagal (offline), salinan lokal sudah tersimpan
  }

  beriTahuPerubahanCadangan();
  if (typeof onSelesai === "function") {
    onSelesai();
  }
}

export async function simpanMetadataEksporCadangan(sekarangIso) {
  setStatusCadangan({ terakhirEksporAt: sekarangIso });

  try {
    const db = getFirestoreDb();
    await setDoc(
      doc(db, "pengaturan", "cadangan"),
      {
        terakhirEksporAt: sekarangIso,
        updatedAt: sekarangIso
      },
      { merge: true }
    );
  } catch (_err) {
    // Offline: salinan lokal sudah tersimpan di localStorage
  }

  beriTahuPerubahanCadangan();
}

export async function jalankanMigrasiDihapusAt() {
  const btn = document.getElementById("btn-settings-migrate-dihapusat");
  const statusEl = document.getElementById("settings-migration-status");
  if (btn instanceof HTMLButtonElement) btn.disabled = true;

  if (statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `<span style="color:var(--color-primary);">Memeriksa dokumen tanpa field dihapusAt...</span>`;
  }

  try {
    const db = getFirestoreDb();
    const [snapKegiatan, snapCatatan] = await Promise.all([
      getDocs(collection(db, "kegiatan")),
      getDocs(collection(db, "catatan"))
    ]);

    const butuhMigrasiKegiatan = [];
    snapKegiatan.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.dihapusAt === "undefined") {
        butuhMigrasiKegiatan.push(docSnap.ref);
      }
    });

    const butuhMigrasiCatatan = [];
    snapCatatan.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.dihapusAt === "undefined") {
        butuhMigrasiCatatan.push(docSnap.ref);
      }
    });

    const totalPerlu = butuhMigrasiKegiatan.length + butuhMigrasiCatatan.length;
    if (totalPerlu === 0) {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Seluruh dokumen sudah memiliki field dihapusAt (0 dokumen perlu migrasi).</span>`;
      }
      tampilkanToast("Semua dokumen sudah termigrasi", "success");
      return;
    }

    if (statusEl) {
      statusEl.innerHTML = `<span>Ditemukan ${totalPerlu} dokumen (${butuhMigrasiKegiatan.length} kegiatan, ${butuhMigrasiCatatan.length} catatan) tanpa dihapusAt. Memperbarui...</span>`;
    }

    const semuaRef = [...butuhMigrasiKegiatan, ...butuhMigrasiCatatan];
    for (let i = 0; i < semuaRef.length; i += 500) {
      const chunk = semuaRef.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach((ref) => {
        batch.update(ref, { dihapusAt: null });
      });
      await batch.commit();
    }

    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Berhasil memigrasi ${totalPerlu} dokumen dengan dihapusAt: null.</span>`;
    }
    tampilkanToast(`Migrasi berhasil: ${totalPerlu} dokumen diperbarui`, "success");
  } catch (err) {
    console.error("Gagal menjalankan migrasi dihapusAt:", err);
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--color-danger);">Gagal migrasi: ${escapeHtml(formatPesanGalatFirestore(err))}</span>`;
    }
    tampilkanToast(`Gagal migrasi: ${formatPesanGalatFirestore(err)}`, "danger");
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}