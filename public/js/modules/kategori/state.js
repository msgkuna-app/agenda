/**
 * State Modul Kategori (Tahap 3: dipisah dari kategori.js)
 * Pabrik `buatManajerKategori` — pengelola kategori generik untuk koleksi
 * "kategoriKegiatan" maupun "kategoriDokumen": langganan real-time, pembuatan
 * kategori bawaan anti-duplikat, tambah, ubah, pengurutan naik/turun,
 * penghapusan aman dengan getCountFromServer, serta metadata folder Drive.
 * TANPA DOM. Instansi manajer dibuat oleh modules/kegiatan/state.js dan
 * modules/dokumen/state.js (Aturan #5, #7, #8, #9, #10, #12).
 */
import {
  getFirestoreDb,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  getCountFromServer,
  formatPesanGalatFirestore
} from "../../services/firestoreService.js";
import {
  normalisasiWarnaKategori,
  urutkanDaftarKategori,
  TANPA_KATEGORI_INFO
} from "./format.js";

/**
 * Membuat pengelola kategori generik yang dapat dipakai untuk "kategoriKegiatan" maupun "kategoriDokumen".
 * @param {{
 *   namaKoleksiKategori: string,
 *   namaKoleksiPemakai: string,
 *   labelItemPemakai?: string,
 *   daftarBawaan?: Array<{id: string, nama: string, warna: string, urutan: number}>,
 *   pakaiFolderDrive?: boolean
 * }} konfigurasi
 */
export function buatManajerKategori(konfigurasi) {
  const {
    namaKoleksiKategori,
    namaKoleksiPemakai,
    labelItemPemakai = "kegiatan",
    daftarBawaan = [],
    pakaiFolderDrive = false
  } = konfigurasi;

  let unsubscribeSnapshot = null;
  let kategoriList = [];
  let sedangSeeding = false;
  let sudahCekSeedSesiIni = false;
  const listenersPerubahan = new Set();
  // Penerima yang didaftarkan oleh panggilan subscribe() terakhir. Hanya penerima ini
  // yang dilepas oleh unsubscribe(); pendaftar lewat onChange() tetap hidup (dulu ikut
  // terhapus sehingga dropdown filter kategori tidak pernah tersegarkan lagi).
  let penerimaSubscribeAktif = null;

  function beritahuPerubahan() {
    const salinan = getDaftarKategori();
    listenersPerubahan.forEach((fn) => {
      try {
        fn(salinan);
      } catch (_e) {
        // Abaikan kendala listener eksternal
      }
    });
  }

  /**
   * Membuat kategori bawaan secara idempoten (memakai ID dokumen deterministik di dalam writeBatch)
   * hanya bila koleksi benar-benar kosong sehingga aman dijalankan berulang tanpa membuat ganda.
   */
  async function pastikanKategoriBawaanJikaKosong() {
    if (sedangSeeding || sudahCekSeedSesiIni || daftarBawaan.length === 0) {
      return;
    }
    sedangSeeding = true;
    try {
      const db = getFirestoreDb();
      const kolRef = collection(db, namaKoleksiKategori);
      const snap = await getDocs(kolRef);
      if (!snap.empty) {
        sudahCekSeedSesiIni = true;
        return;
      }

      const sekarang = new Date().toISOString();
      const batch = writeBatch(db);
      daftarBawaan.forEach((item, idx) => {
        const docId = item.id || `bawaan-${idx + 1}`;
        const ref = doc(db, namaKoleksiKategori, docId);
        const payload = {
          nama: item.nama,
          warna: normalisasiWarnaKategori(item.warna),
          urutan: Number.isFinite(item.urutan) ? item.urutan : idx + 1,
          createdAt: sekarang,
          updatedAt: sekarang
        };
        if (pakaiFolderDrive) {
          payload.folderId = "";
          payload.folderSinkron = false;
        }
        batch.set(ref, payload);
      });
      await batch.commit();
      sudahCekSeedSesiIni = true;
    } catch (_err) {
      // Biarkan snapshot berikutnya mencoba lagi bila saat ini belum siap
    } finally {
      sedangSeeding = false;
    }
  }

  /**
   * Memulai langganan Firestore koleksi kategori (Aturan #5: hentikan langganan lama dulu).
   * @param {(daftar: Array<any>) => void} [onUpdate]
   * @param {(pesanGalat: string) => void} [onError]
   */
  function subscribe(onUpdate, onError) {
    unsubscribe();
    sudahCekSeedSesiIni = false;

    if (typeof onUpdate === "function") {
      listenersPerubahan.add(onUpdate);
      penerimaSubscribeAktif = onUpdate;
    }

    const db = getFirestoreDb();
    const kolRef = collection(db, namaKoleksiKategori);

    unsubscribeSnapshot = onSnapshot(
      kolRef,
      async (snapshot) => {
        if (snapshot.empty && !snapshot.metadata.fromCache && !sudahCekSeedSesiIni) {
          await pastikanKategoriBawaanJikaKosong();
        }

        const hasil = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const entri = {
            id: docSnap.id,
            nama: String(data.nama || "").trim(),
            warna: normalisasiWarnaKategori(data.warna),
            urutan: Number.isFinite(Number(data.urutan)) ? Number(data.urutan) : 9999,
            createdAt: data.createdAt || "",
            updatedAt: data.updatedAt || ""
          };
          if (pakaiFolderDrive) {
            entri.folderId = String(data.folderId || "").trim();
            entri.folderSinkron = Boolean(entri.folderId) && data.folderSinkron === true;
          }
          hasil.push(entri);
        });

        kategoriList = urutkanDaftarKategori(hasil);
        beritahuPerubahan();
      },
      (err) => {
        if (typeof onError === "function") {
          onError(formatPesanGalatFirestore(err));
        }
      }
    );

    return () => unsubscribe();
  }

  /**
   * Menghentikan langganan koleksi kategori dan membersihkan state memori.
   * Pendaftar onChange() milik modul pemakai (mis. dropdown filter kategori dokumen)
   * TIDAK dilepas di sini: langganan dipasang ulang setiap login, dan melepasnya
   * membuat dropdown tidak pernah tersegarkan lagi setelah kategori termuat.
   */
  function unsubscribe() {
    if (typeof unsubscribeSnapshot === "function") {
      try {
        unsubscribeSnapshot();
      } catch (_e) {
        // Abaikan
      }
      unsubscribeSnapshot = null;
    }
    if (penerimaSubscribeAktif) {
      listenersPerubahan.delete(penerimaSubscribeAktif);
      penerimaSubscribeAktif = null;
    }
    kategoriList = [];
    sudahCekSeedSesiIni = false;
    sedangSeeding = false;
  }

  function onChange(fn) {
    if (typeof fn !== "function") return () => {};
    listenersPerubahan.add(fn);
    return () => listenersPerubahan.delete(fn);
  }

  function getDaftarKategori() {
    return kategoriList.map((k) => ({ ...k }));
  }

  function ambilKategoriById(id) {
    const targetId = String(id || "").trim();
    if (!targetId) return null;
    const ketemu = kategoriList.find((k) => k.id === targetId);
    return ketemu ? { ...ketemu } : null;
  }

  /**
   * Mencari info nama dan warna kategori berdasarkan kategoriId (Aturan #7).
   * Jika kosong atau tidak ditemukan, kembalikan "Tanpa Kategori".
   * @param {string | null | undefined} kategoriId
   */
  function cariInfoKategori(kategoriId) {
    const idDicari = String(kategoriId || "").trim();
    if (!idDicari) {
      return { ...TANPA_KATEGORI_INFO };
    }
    const ketemu = kategoriList.find((k) => k.id === idDicari);
    if (!ketemu) {
      return { ...TANPA_KATEGORI_INFO };
    }
    return {
      id: ketemu.id,
      nama: ketemu.nama,
      warna: ketemu.warna,
      folderId: ketemu.folderId || "",
      folderSinkron: Boolean(ketemu.folderSinkron),
      tetap: false
    };
  }

  function validasiNamaKategori(namaMentah, abaikanId = null) {
    const nama = String(namaMentah || "").trim();
    if (!nama) {
      throw new Error("Nama kategori wajib diisi.");
    }
    if (nama.length > 40) {
      throw new Error("Nama kategori maksimal 40 karakter.");
    }
    const namaKecil = nama.toLowerCase();
    if (namaKecil === TANPA_KATEGORI_INFO.nama.toLowerCase()) {
      throw new Error('"Tanpa Kategori" bersifat tetap dan tidak boleh dipakai sebagai nama baru.');
    }
    const duplikat = kategoriList.some(
      (k) => k.id !== abaikanId && k.nama.trim().toLowerCase() === namaKecil
    );
    if (duplikat) {
      throw new Error(`Kategori "${nama}" sudah ada. Gunakan nama lain.`);
    }
    return nama;
  }

  /**
   * Menambahkan kategori baru (tetap diizinkan saat offline lewat cache Firestore).
   * @param {{ nama: string, warna: string, folderId?: string, folderSinkron?: boolean }} input
   * @returns {Promise<{ id: string, nama: string, warna: string }>}
   */
  async function tambahKategori(input) {
    const nama = validasiNamaKategori(input?.nama, null);
    const warna = normalisasiWarnaKategori(input?.warna);
    const urutanMaks = kategoriList.reduce(
      (maks, item) => (Number.isFinite(item.urutan) && item.urutan < 9000 ? Math.max(maks, item.urutan) : maks),
      0
    );
    const sekarang = new Date().toISOString();
    const db = getFirestoreDb();
    const payload = {
      nama,
      warna,
      urutan: urutanMaks + 1,
      createdAt: sekarang,
      updatedAt: sekarang
    };
    if (pakaiFolderDrive) {
      payload.folderId = String(input?.folderId || "").trim();
      payload.folderSinkron = Boolean(payload.folderId) && input?.folderSinkron === true;
    }
    const docRef = await addDoc(collection(db, namaKoleksiKategori), payload);
    return { id: docRef.id, nama, warna };
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
    const sebelumnya = ambilKategoriById(targetId);
    const nama = validasiNamaKategori(input?.nama, targetId);
    const warna = normalisasiWarnaKategori(input?.warna);
    const namaBerubah = sebelumnya ? sebelumnya.nama !== nama : true;

    const sekarang = new Date().toISOString();
    const db = getFirestoreDb();
    await updateDoc(doc(db, namaKoleksiKategori, targetId), {
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
    if (!pakaiFolderDrive) return;
    const targetId = String(id || "").trim();
    if (!targetId) return;
    const patch = {
      folderSinkron: Boolean(dataFolder.folderSinkron),
      updatedAt: new Date().toISOString()
    };
    if (typeof dataFolder.folderId === "string") {
      patch.folderId = dataFolder.folderId.trim();
    }
    const db = getFirestoreDb();
    await updateDoc(doc(db, namaKoleksiKategori, targetId), patch);
  }

  /**
   * Menggeser urutan kategori naik (-1) atau turun (+1) dengan writeBatch (tidak menyentuh Drive).
   * @param {string} id
   * @param {"up" | "down"} arah
   */
  async function geserUrutanKategori(id, arah) {
    const terurut = getDaftarKategori();
    const idx = terurut.findIndex((k) => k.id === id);
    if (idx === -1) return;

    const targetIdx = arah === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= terurut.length) return;

    const salinan = [...terurut];
    const [dipindah] = salinan.splice(idx, 1);
    salinan.splice(targetIdx, 0, dipindah);

    const sekarang = new Date().toISOString();
    const db = getFirestoreDb();
    const batch = writeBatch(db);

    salinan.forEach((item, posisi) => {
      const urutanBaru = posisi + 1;
      if (item.urutan !== urutanBaru) {
        batch.update(doc(db, namaKoleksiKategori, item.id), {
          urutan: urutanBaru,
          updatedAt: sekarang
        });
      }
    });

    await batch.commit();
  }

  /**
   * Menghitung jumlah dokumen pemakai kategori langsung dari server menggunakan getCountFromServer.
   * @param {string} kategoriId
   * @returns {Promise<number>}
   */
  async function hitungPemakaiDariServer(kategoriId) {
    if (!navigator.onLine) {
      throw new Error(
        `Penghapusan kategori memerlukan koneksi internet untuk memeriksa jumlah ${labelItemPemakai} di server.`
      );
    }
    const db = getFirestoreDb();
    const q = query(
      collection(db, namaKoleksiPemakai),
      where("kategoriId", "==", String(kategoriId || "").trim())
    );
    const agregat = await getCountFromServer(q);
    return agregat.data().count;
  }

  /**
   * Menghapus kategori setelah memeriksa ulang ke server dengan getCountFromServer tepat sebelum menghapus.
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

    const snapshotSebelumHapus = ambilKategoriById(targetId);

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
        `Kategori ini masih dipakai ${jumlahServer} ${labelItemPemakai} (termasuk yang ada di Tempat Sampah) dan tidak bisa dihapus.`
      );
      galatDipakai.jumlahPemakai = jumlahServer;
      throw galatDipakai;
    }

    const db = getFirestoreDb();
    await deleteDoc(doc(db, namaKoleksiKategori, targetId));
    return snapshotSebelumHapus;
  }

  return {
    namaKoleksiKategori,
    namaKoleksiPemakai,
    labelItemPemakai,
    pakaiFolderDrive,
    subscribe,
    unsubscribe,
    onChange,
    getDaftarKategori,
    ambilKategoriById,
    cariInfoKategori,
    tambahKategori,
    ubahKategori,
    perbaruiStatusFolderKategori,
    geserUrutanKategori,
    hitungPemakaiDariServer,
    hapusKategoriAman
  };
}
