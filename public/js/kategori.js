/**
 * Modul Generik Pengelolaan Kategori (Fase 1 & diperluas pada Fase 3 untuk kategoriDokumen)
 * Mendukung langganan real-time, pembuatan kategori bawaan anti-duplikat, tambah, ubah,
 * pengurutan naik/turun, penghapusan aman dengan getCountFromServer, serta sinkronisasi
 * folder Google Drive khusus untuk koleksi "kategoriDokumen" tanpa merusak kategori kegiatan
 * (Aturan #5, #7, #8, #9, #10, #12).
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
} from "./firebase-config.js";
import { escapeHtml } from "./sidebar.js";

/**
 * Daftar warna preset kategori yang dipetakan ke CSS Custom Properties di style.css
 * agar kontras terbaca jelas pada Tema Terang maupun Tema Gelap (Aturan #14).
 */
export const PRESET_WARNA_KATEGORI = [
  { id: "biru", label: "Biru Samudra" },
  { id: "hijau", label: "Hijau Zamrud" },
  { id: "amber", label: "Kuning Amber" },
  { id: "ungu", label: "Ungu Kecubung" },
  { id: "merah", label: "Merah Koral" },
  { id: "sian", label: "Biru Sian" },
  { id: "merahmuda", label: "Merah Muda" },
  { id: "abu", label: "Abu Batu" }
];

export const KATEGORI_KEGIATAN_BAWAAN = [
  { id: "bawaan-pekerjaan", nama: "Pekerjaan", warna: "biru", urutan: 1 },
  { id: "bawaan-pribadi", nama: "Pribadi", warna: "hijau", urutan: 2 },
  { id: "bawaan-keluarga", nama: "Keluarga", warna: "amber", urutan: 3 },
  { id: "bawaan-pertemuan", nama: "Pertemuan", warna: "ungu", urutan: 4 },
  { id: "bawaan-lainnya", nama: "Lainnya", warna: "abu", urutan: 5 }
];

export const KATEGORI_DOKUMEN_BAWAAN = [
  { id: "bawaan-dok-umum", nama: "Umum", warna: "biru", urutan: 1 },
  { id: "bawaan-dok-keuangan", nama: "Keuangan", warna: "hijau", urutan: 2 },
  { id: "bawaan-dok-pekerjaan", nama: "Pekerjaan", warna: "ungu", urutan: 3 },
  { id: "bawaan-dok-pribadi", nama: "Pribadi", warna: "amber", urutan: 4 },
  { id: "bawaan-dok-lainnya", nama: "Lainnya", warna: "abu", urutan: 5 }
];

export const TANPA_KATEGORI_INFO = Object.freeze({
  id: "",
  nama: "Tanpa Kategori",
  warna: "netral",
  tetap: true
});

/**
 * Normalisasi kode warna preset agar selalu valid.
 * @param {string} warna
 * @returns {string}
 */
export function normalisasiWarnaKategori(warna) {
  const bersih = String(warna || "").trim().toLowerCase();
  const ada = PRESET_WARNA_KATEGORI.some((p) => p.id === bersih);
  return ada ? bersih : "biru";
}

/**
 * Mengurutkan daftar kategori berdasarkan field urutan lalu nama.
 * @param {Array<{id: string, nama: string, warna: string, urutan: number}>} daftar
 */
export function urutkanDaftarKategori(daftar) {
  return [...daftar].sort((a, b) => {
    const uA = Number.isFinite(Number(a.urutan)) ? Number(a.urutan) : 9999;
    const uB = Number.isFinite(Number(b.urutan)) ? Number(b.urutan) : 9999;
    if (uA !== uB) return uA - uB;
    return String(a.nama || "").localeCompare(String(b.nama || ""), "id", {
      sensitivity: "base"
    });
  });
}

// Memastikan pengikatan event listener DOM pada #kategori-manage-modal hanya dipasang satu kali,
// dan selalu mendelegasikan aksi ke sesi pengontrol dialog yang sedang terbuka.
let sesiDialogAktif = null;
let listenerDomModalTerpasang = false;

function pasangListenerDomModalKategoriSekali() {
  if (listenerDomModalTerpasang) return;
  listenerDomModalTerpasang = true;

  const modal = document.getElementById("kategori-manage-modal");
  const closeBtn = document.getElementById("kategori-manage-close-btn");
  const form = document.getElementById("kategori-form");
  const inputNama = document.getElementById("kategori-nama-input");
  const swatchContainer = document.getElementById("kategori-warna-picker");
  const cancelEditBtn = document.getElementById("kategori-cancel-edit-btn");
  const listContainer = document.getElementById("kategori-manage-list");

  if (inputNama) {
    inputNama.addEventListener("input", () => {
      sesiDialogAktif?.perbaruiPenghitungKarakter();
    });
  }

  if (swatchContainer) {
    swatchContainer.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".color-swatch-btn[data-warna]") : null;
      if (!btn || !sesiDialogAktif) return;
      const dipilih = btn.getAttribute("data-warna");
      if (dipilih) {
        sesiDialogAktif.pilihWarna(dipilih);
      }
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      sesiDialogAktif?.batalkanModeUbah();
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sesiDialogAktif?.tanganiSubmitForm();
    });
  }

  if (listContainer) {
    listContainer.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action]") : null;
      if (!btn || !sesiDialogAktif) return;
      sesiDialogAktif.tanganiKlikDaftar(btn);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      sesiDialogAktif?.tutup(true);
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        sesiDialogAktif?.tutup(true);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!sesiDialogAktif) return;
    if (e.key === "Escape") {
      e.preventDefault();
      sesiDialogAktif.tutup(true);
    }
  });

  const syncJaringanGlobal = () => {
    sesiDialogAktif?.sinkronkanStatusJaringan();
  };
  window.addEventListener("online", syncJaringanGlobal);
  window.addEventListener("offline", syncJaringanGlobal);
}

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
    listenersPerubahan.clear();
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
        `Kategori ini masih dipakai ${jumlahServer} ${labelItemPemakai} dan tidak bisa dihapus.`
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

/**
 * Mengikat antarmuka modal/lembar "Kelola Kategori" yang generik dan responsif
 * (dipakai bersama oleh Kelola Kategori Kegiatan dan Kelola Kategori Dokumen).
 * @param {{
 *   manajer: ReturnType<typeof buatManajerKategori>,
 *   hitungPemakaiLokal: (kategoriId: string) => number,
 *   onLihatItemKategori: (kategoriId: string) => void,
 *   judulDialog?: string,
 *   opsiDrive?: {
 *     onSetelahTambahKategori?: (katBaru: {id: string, nama: string, warna: string}) => Promise<{peringatan?: string} | void>,
 *     onSetelahUbahNamaKategori?: (hasilUbah: {id: string, nama: string, sebelumnya: any}) => Promise<{peringatan?: string, folder404?: boolean} | void>,
 *     onSinkronkanFolder?: (kat: any) => Promise<{pesanSukses?: string, folder404?: boolean, pesanGalat?: string} | void>,
 *     onBuatUlangFolderDanPindahkan?: (kat: any) => Promise<{pesanSukses?: string} | void>,
 *     onBuangFolderBekasKeSampah?: (infoFolder: {nama: string, folderId: string}) => Promise<void>
 *   }
 * }} opsi
 */
export function inisialisasiDialogKelolaKategori(opsi) {
  pasangListenerDomModalKategoriSekali();

  const {
    manajer,
    hitungPemakaiLokal,
    onLihatItemKategori,
    judulDialog = "Kelola Kategori Kegiatan",
    opsiDrive = null
  } = opsi;

  const modal = document.getElementById("kategori-manage-modal");
  const titleEl = document.getElementById("kategori-manage-title");
  const formHeading = document.getElementById("kategori-form-heading");
  const inputId = document.getElementById("kategori-edit-id");
  const inputNama = document.getElementById("kategori-nama-input");
  const charCounter = document.getElementById("kategori-nama-counter");
  const swatchContainer = document.getElementById("kategori-warna-picker");
  const submitBtn = document.getElementById("kategori-submit-btn");
  const cancelEditBtn = document.getElementById("kategori-cancel-edit-btn");
  const alertBox = document.getElementById("kategori-alert-box");
  const alertText = document.getElementById("kategori-alert-text");
  const listContainer = document.getElementById("kategori-manage-list");

  let terbuka = false;
  let warnaTerpilih = PRESET_WARNA_KATEGORI[0].id;
  let fokusSebelumnya = null;
  let cacheHitunganServer = new Map();
  let sedangMemuatHitunganServer = false;

  // State khusus alur Google Drive (kategoriDokumen):
  // - tawaranBuatUlang404: kategori yang foldernya 404 saat ubah nama / sinkronisasi
  // - tawaranSampahFolderTerhapus: folder Drive bekas kategori kosong yang baru saja dihapus
  let tawaranBuatUlang404 = null;
  let tawaranSampahFolderTerhapus = null;
  let konfirmasiSampahTerbuka = false;

  function tampilkanPesan(pesan, tipe = "danger") {
    if (!alertBox || !alertText) return;
    if (!pesan) {
      alertText.textContent = "";
      alertBox.hidden = true;
      alertBox.classList.remove("alert-box-warning", "alert-box-success");
      return;
    }
    alertText.textContent = pesan;
    alertBox.classList.toggle("alert-box-warning", tipe === "warning");
    alertBox.classList.toggle("alert-box-success", tipe === "success");
    alertBox.hidden = false;
  }

  function perbaruiPenghitungKarakter() {
    if (!inputNama || !charCounter) return;
    const panjang = inputNama.value.length;
    charCounter.textContent = `${panjang}/40`;
  }

  function renderPilihanWarna() {
    if (!swatchContainer) return;
    swatchContainer.innerHTML = PRESET_WARNA_KATEGORI.map((w) => {
      const dipilih = w.id === warnaTerpilih;
      return `
        <button
          type="button"
          class="color-swatch-btn${dipilih ? " is-selected" : ""}"
          data-warna="${escapeHtml(w.id)}"
          role="radio"
          aria-checked="${dipilih ? "true" : "false"}"
          aria-label="${escapeHtml(w.label)}"
          title="${escapeHtml(w.label)}"
        >
          <span class="swatch-dot cat-dot-${escapeHtml(w.id)}" aria-hidden="true"></span>
          <span class="swatch-name">${escapeHtml(w.label)}</span>
        </button>
      `;
    }).join("");
  }

  function resetFormKeTambah() {
    if (inputId) inputId.value = "";
    if (inputNama) inputNama.value = "";
    warnaTerpilih = PRESET_WARNA_KATEGORI[0].id;
    if (formHeading) formHeading.textContent = "Tambah Kategori Baru";
    if (submitBtn) submitBtn.textContent = "Tambah Kategori";
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    perbaruiPenghitungKarakter();
    renderPilihanWarna();
  }

  function mulaiModeUbah(kat) {
    if (!kat || !kat.id) return;
    tampilkanPesan("");
    if (inputId) inputId.value = kat.id;
    if (inputNama) {
      inputNama.value = kat.nama;
      inputNama.focus();
    }
    warnaTerpilih = normalisasiWarnaKategori(kat.warna);
    if (formHeading) formHeading.textContent = `Ubah Kategori "${kat.nama}"`;
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (cancelEditBtn) cancelEditBtn.hidden = false;
    perbaruiPenghitungKarakter();
    renderPilihanWarna();
  }

  function ambilJumlahPemakai(kategoriId) {
    const lokal = typeof hitungPemakaiLokal === "function" ? hitungPemakaiLokal(kategoriId) : 0;
    if (kategoriId && cacheHitunganServer.has(kategoriId)) {
      return Math.max(lokal, cacheHitunganServer.get(kategoriId));
    }
    return lokal;
  }

  async function segarkanHitunganServerSemua() {
    if (!terbuka || !navigator.onLine || sedangMemuatHitunganServer) return;
    sedangMemuatHitunganServer = true;
    try {
      const daftar = manajer.getDaftarKategori();
      await Promise.all(
        daftar.map(async (kat) => {
          try {
            const jml = await manajer.hitungPemakaiDariServer(kat.id);
            cacheHitunganServer.set(kat.id, jml);
          } catch (_e) {
            // Gunakan hitungan lokal sebagai cadangan tampilan
          }
        })
      );
      if (terbuka) {
        renderDaftarKategori();
      }
    } finally {
      sedangMemuatHitunganServer = false;
    }
  }

  function renderPanelTawaranDriveAtas() {
    const blok = [];

    if (tawaranBuatUlang404) {
      const kat = manajer.ambilKategoriById(tawaranBuatUlang404.id) || tawaranBuatUlang404;
      blok.push(`
        <li class="kategori-drive-callout kategori-drive-callout-warning">
          <div class="kategori-drive-callout-text">
            <strong>Folder Drive tidak ditemukan (404) untuk kategori "${escapeHtml(kat.nama)}".</strong>
            <span>Folder lama mungkin telah dihapus di Google Drive. Anda dapat membuat ulang folder kategori ini dan memindahkan dokumen kategori ini ke dalamnya.</span>
          </div>
          <div class="kategori-drive-callout-actions">
            <button type="button" class="btn-secondary btn-sm-touch" data-action="dismiss-404">Tutup</button>
            <button type="button" class="btn-primary btn-sm-touch" data-action="recreate-folder-404" data-id="${escapeHtml(kat.id)}">
              Buat ulang folder &amp; pindahkan dokumen
            </button>
          </div>
        </li>
      `);
    }

    if (tawaranSampahFolderTerhapus && tawaranSampahFolderTerhapus.folderId) {
      const info = tawaranSampahFolderTerhapus;
      blok.push(`
        <li class="kategori-drive-callout">
          <div class="kategori-drive-callout-text">
            <strong>Kategori "${escapeHtml(info.nama)}" dihapus dari aplikasi.</strong>
            <span>Folder Google Drive kategori ini <strong>tidak dihapus otomatis</strong> agar berkas lain yang mungkin Anda taruh manual di dalamnya tetap aman.</span>
          </div>
          ${
            konfirmasiSampahTerbuka
              ? `<div class="kategori-drive-trash-warning" role="alert">
                  <p><strong>Peringatan:</strong> Memindahkan folder "${escapeHtml(info.nama)}" ke Sampah Google Drive juga akan memindahkan seluruh isi di dalam folder tersebut ke Sampah Drive. Lanjutkan?</p>
                  <div class="kategori-drive-callout-actions">
                    <button type="button" class="btn-secondary btn-sm-touch" data-action="cancel-trash-folder">Batal</button>
                    <button type="button" class="btn-danger btn-sm-touch" data-action="confirm-trash-folder">Ya, Pindahkan ke Sampah Drive</button>
                  </div>
                </div>`
              : `<div class="kategori-drive-callout-actions">
                  <button type="button" class="btn-secondary btn-sm-touch" data-action="keep-drive-folder">Biarkan Folder di Drive</button>
                  <button type="button" class="btn-danger-outline btn-sm-touch" data-action="ask-trash-folder">
                    Pindahkan folder ke sampah Drive
                  </button>
                </div>`
          }
        </li>
      `);
    }

    return blok.join("");
  }

  function renderDaftarKategori() {
    if (!listContainer) return;
    const daftar = manajer.getDaftarKategori();
    const labelItem = manajer.labelItemPemakai;
    const sedangOffline = !navigator.onLine;
    const jumlahTanpaKategori =
      typeof hitungPemakaiLokal === "function" ? hitungPemakaiLokal("") : 0;

    const panelTawaran = manajer.pakaiFolderDrive ? renderPanelTawaranDriveAtas() : "";

    const barisKategori = daftar
      .map((kat, index) => {
        const jumlah = ambilJumlahPemakai(kat.id);
        const palingAtas = index === 0;
        const palingBawah = index === daftar.length - 1;
        const hapusNonaktif = jumlah > 0 || sedangOffline;

        let keteranganHapus = "";
        if (jumlah > 0) {
          keteranganHapus = `Dipakai ${jumlah} ${labelItem} — tidak dapat dihapus`;
        } else if (sedangOffline) {
          keteranganHapus = "Penghapusan memerlukan koneksi internet";
        } else {
          keteranganHapus = `Hapus kategori ${kat.nama}`;
        }

        const belumSinkronDrive = manajer.pakaiFolderDrive && (!kat.folderId || !kat.folderSinkron);

        return `
          <li class="kategori-item" data-id="${escapeHtml(kat.id)}">
            <div class="kategori-item-main">
              <div class="kategori-badges-inline">
                <span class="cat-badge cat-color-${escapeHtml(kat.warna)}">
                  <span class="cat-dot cat-dot-${escapeHtml(kat.warna)}" aria-hidden="true"></span>
                  <span>${escapeHtml(kat.nama)}</span>
                </span>
                ${
                  belumSinkronDrive
                    ? `<span class="sync-warning-badge" title="Folder kategori ini di Google Drive belum dibuat atau namanya belum tersinkron">Folder belum sinkron</span>`
                    : ""
                }
              </div>
              <span class="kategori-count-text">Dipakai ${jumlah} ${escapeHtml(labelItem)}</span>
            </div>

            ${
              belumSinkronDrive && opsiDrive?.onSinkronkanFolder
                ? `<div class="kategori-sync-row">
                    <span>Subfolder Google Drive belum sinkron dengan kategori ini.</span>
                    <button type="button" class="btn-secondary btn-sm-touch" data-action="sync-folder" data-id="${escapeHtml(kat.id)}" ${sedangOffline ? "disabled" : ""}>
                      Sinkronkan folder
                    </button>
                  </div>`
                : ""
            }

            ${
              jumlah > 0
                ? `<div class="kategori-used-notice">
                    <span>Masih dipakai oleh ${jumlah} ${escapeHtml(labelItem)}.</span>
                    <button type="button" class="btn-link-filter" data-action="filter" data-id="${escapeHtml(kat.id)}">
                      Lihat ${escapeHtml(labelItem)} kategori ini
                    </button>
                  </div>`
                : ""
            }

            <div class="kategori-item-actions">
              <div class="kategori-order-group" role="group" aria-label="Urutan kategori ${escapeHtml(kat.nama)}">
                <button
                  type="button"
                  class="icon-btn icon-btn-bordered"
                  data-action="up"
                  data-id="${escapeHtml(kat.id)}"
                  aria-label="Naikkan urutan ${escapeHtml(kat.nama)}"
                  title="Naikkan urutan"
                  ${palingAtas ? "disabled" : ""}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn-bordered"
                  data-action="down"
                  data-id="${escapeHtml(kat.id)}"
                  aria-label="Turunkan urutan ${escapeHtml(kat.nama)}"
                  title="Turunkan urutan"
                  ${palingBawah ? "disabled" : ""}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>

              <div class="kategori-crud-group">
                <button
                  type="button"
                  class="btn-secondary btn-sm-touch"
                  data-action="edit"
                  data-id="${escapeHtml(kat.id)}"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  class="btn-danger-outline btn-sm-touch"
                  data-action="delete"
                  data-id="${escapeHtml(kat.id)}"
                  title="${escapeHtml(keteranganHapus)}"
                  aria-label="${escapeHtml(keteranganHapus)}"
                  ${hapusNonaktif ? "disabled" : ""}
                >
                  ${jumlah > 0 ? `Hapus (${jumlah})` : "Hapus"}
                </button>
              </div>
            </div>
          </li>
        `;
      })
      .join("");

    const barisTanpaKategori = `
      <li class="kategori-item kategori-item-fixed">
        <div class="kategori-item-main">
          <span class="cat-badge cat-color-netral">
            <span class="cat-dot cat-dot-netral" aria-hidden="true"></span>
            <span>Tanpa Kategori</span>
          </span>
          <span class="kategori-count-text">Dipakai ${jumlahTanpaKategori} ${escapeHtml(labelItem)}</span>
        </div>
        <div class="kategori-fixed-note">
          <span>Kategori tetap sistem (tidak dapat diubah atau dihapus).</span>
          ${
            jumlahTanpaKategori > 0
              ? `<button type="button" class="btn-link-filter" data-action="filter-uncategorized">
                  Lihat ${escapeHtml(labelItem)} kategori ini
                </button>`
              : ""
          }
        </div>
      </li>
    `;

    listContainer.innerHTML = panelTawaran + barisKategori + barisTanpaKategori;
  }

  async function tanganiSubmitForm() {
    tampilkanPesan("");
    const idSedangEdit = inputId ? inputId.value.trim() : "";
    const namaInput = inputNama ? inputNama.value : "";

    if (submitBtn) submitBtn.disabled = true;
    try {
      if (idSedangEdit) {
        const hasilUbah = await manajer.ubahKategori(idSedangEdit, {
          nama: namaInput,
          warna: warnaTerpilih
        });
        resetFormKeTambah();

        if (hasilUbah.namaBerubah && opsiDrive?.onSetelahUbahNamaKategori) {
          const responDrive = await opsiDrive.onSetelahUbahNamaKategori(hasilUbah);
          if (responDrive?.folder404) {
            tawaranBuatUlang404 = { id: hasilUbah.id, nama: hasilUbah.nama };
          }
          if (responDrive?.peringatan) {
            tampilkanPesan(responDrive.peringatan, "warning");
          }
        }
      } else {
        const katBaru = await manajer.tambahKategori({
          nama: namaInput,
          warna: warnaTerpilih
        });
        resetFormKeTambah();

        if (opsiDrive?.onSetelahTambahKategori) {
          const responDrive = await opsiDrive.onSetelahTambahKategori(katBaru);
          if (responDrive?.peringatan) {
            tampilkanPesan(responDrive.peringatan, "warning");
          }
        }
      }
      renderDaftarKategori();
    } catch (err) {
      tampilkanPesan(err instanceof Error ? err.message : formatPesanGalatFirestore(err));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function tanganiKlikDaftar(btn) {
    const aksi = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";

    if (aksi === "filter") {
      tutup(false);
      if (typeof onLihatItemKategori === "function") {
        onLihatItemKategori(id);
      }
      return;
    }

    if (aksi === "filter-uncategorized") {
      tutup(false);
      if (typeof onLihatItemKategori === "function") {
        onLihatItemKategori("__TANPA_KATEGORI__");
      }
      return;
    }

    if (aksi === "dismiss-404") {
      tawaranBuatUlang404 = null;
      renderDaftarKategori();
      return;
    }

    if (aksi === "recreate-folder-404" && opsiDrive?.onBuatUlangFolderDanPindahkan) {
      const kat = manajer.ambilKategoriById(id) || tawaranBuatUlang404;
      if (!kat) return;
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Membuat ulang...";
      tampilkanPesan("");
      try {
        const hasil = await opsiDrive.onBuatUlangFolderDanPindahkan(kat);
        tawaranBuatUlang404 = null;
        if (hasil?.pesanSukses) {
          tampilkanPesan(hasil.pesanSukses, "success");
        }
      } catch (err) {
        tampilkanPesan(err instanceof Error ? err.message : "Gagal membuat ulang folder kategori di Google Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori();
      }
      return;
    }

    if (aksi === "keep-drive-folder") {
      tawaranSampahFolderTerhapus = null;
      konfirmasiSampahTerbuka = false;
      renderDaftarKategori();
      return;
    }

    if (aksi === "ask-trash-folder") {
      konfirmasiSampahTerbuka = true;
      renderDaftarKategori();
      return;
    }

    if (aksi === "cancel-trash-folder") {
      konfirmasiSampahTerbuka = false;
      renderDaftarKategori();
      return;
    }

    if (aksi === "confirm-trash-folder" && opsiDrive?.onBuangFolderBekasKeSampah && tawaranSampahFolderTerhapus) {
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Memindahkan...";
      tampilkanPesan("");
      try {
        await opsiDrive.onBuangFolderBekasKeSampah(tawaranSampahFolderTerhapus);
        const namaLama = tawaranSampahFolderTerhapus.nama;
        tawaranSampahFolderTerhapus = null;
        konfirmasiSampahTerbuka = false;
        tampilkanPesan(`Folder "${namaLama}" telah dipindahkan ke Sampah Google Drive.`, "success");
      } catch (err) {
        tampilkanPesan(err instanceof Error ? err.message : "Gagal memindahkan folder ke Sampah Google Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori();
      }
      return;
    }

    if (aksi === "sync-folder" && opsiDrive?.onSinkronkanFolder) {
      const kat = manajer.ambilKategoriById(id);
      if (!kat) return;
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Menyinkronkan...";
      tampilkanPesan("");
      try {
        const hasil = await opsiDrive.onSinkronkanFolder(kat);
        if (hasil?.folder404) {
          tawaranBuatUlang404 = { id: kat.id, nama: kat.nama };
        }
        if (hasil?.pesanGalat) {
          tampilkanPesan(hasil.pesanGalat, "warning");
        } else if (hasil?.pesanSukses) {
          tampilkanPesan(hasil.pesanSukses, "success");
        }
      } catch (err) {
        tampilkanPesan(err instanceof Error ? err.message : "Gagal menyinkronkan folder Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori();
      }
      return;
    }

    if (aksi === "edit") {
      const kat = manajer.getDaftarKategori().find((k) => k.id === id);
      if (kat) mulaiModeUbah(kat);
      return;
    }

    if (aksi === "up" || aksi === "down") {
      tampilkanPesan("");
      btn.disabled = true;
      try {
        await manajer.geserUrutanKategori(id, aksi);
      } catch (err) {
        tampilkanPesan(formatPesanGalatFirestore(err));
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (aksi === "delete") {
      tampilkanPesan("");
      if (!navigator.onLine) {
        tampilkanPesan(
          "Tidak dapat menghapus kategori saat offline. Sambungkan ke internet terlebih dahulu."
        );
        renderDaftarKategori();
        return;
      }

      btn.disabled = true;
      const labelAwal = btn.textContent;
      btn.textContent = "Memeriksa...";
      try {
        const dihapus = await manajer.hapusKategoriAman(id);
        cacheHitunganServer.delete(id);
        if (inputId && inputId.value === id) {
          resetFormKeTambah();
        }
        if (tawaranBuatUlang404 && tawaranBuatUlang404.id === id) {
          tawaranBuatUlang404 = null;
        }

        if (manajer.pakaiFolderDrive && dihapus?.folderId) {
          tawaranSampahFolderTerhapus = {
            nama: dihapus.nama,
            folderId: dihapus.folderId
          };
          konfirmasiSampahTerbuka = false;
        } else if (manajer.pakaiFolderDrive) {
          tampilkanPesan(`Kategori "${dihapus?.nama || ""}" berhasil dihapus.`, "success");
        }

        renderDaftarKategori();
      } catch (err) {
        if (err && typeof err === "object" && typeof err.jumlahPemakai === "number") {
          cacheHitunganServer.set(id, err.jumlahPemakai);
        }
        tampilkanPesan(err instanceof Error ? err.message : formatPesanGalatFirestore(err));
        renderDaftarKategori();
      } finally {
        if (document.contains(btn)) {
          btn.textContent = labelAwal;
        }
      }
    }
  }

  function sinkronkanStatusJaringan() {
    if (!terbuka) return;
    if (!navigator.onLine) {
      tampilkanPesan(
        "Mode luring: Anda tetap dapat menambah atau mengubah kategori, tetapi penghapusan memerlukan internet.",
        "warning"
      );
    } else {
      tampilkanPesan("");
      segarkanHitunganServerSemua();
    }
    renderDaftarKategori();
  }

  const objekSesiIni = {
    perbaruiPenghitungKarakter,
    pilihWarna: (kode) => {
      warnaTerpilih = normalisasiWarnaKategori(kode);
      renderPilihanWarna();
    },
    batalkanModeUbah: () => {
      tampilkanPesan("");
      resetFormKeTambah();
    },
    tanganiSubmitForm,
    tanganiKlikDaftar,
    sinkronkanStatusJaringan,
    tutup
  };

  function buka() {
    if (!modal) return;
    if (sesiDialogAktif && sesiDialogAktif !== objekSesiIni) {
      sesiDialogAktif.tutup(false);
    }

    sesiDialogAktif = objekSesiIni;
    fokusSebelumnya = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    terbuka = true;
    cacheHitunganServer.clear();
    tawaranBuatUlang404 = null;
    tawaranSampahFolderTerhapus = null;
    konfirmasiSampahTerbuka = false;

    if (titleEl) titleEl.textContent = judulDialog;
    tampilkanPesan(
      !navigator.onLine
        ? "Mode luring: Anda tetap dapat menambah atau mengubah kategori, tetapi penghapusan memerlukan internet."
        : "",
      "warning"
    );
    resetFormKeTambah();
    renderDaftarKategori();
    modal.hidden = false;

    segarkanHitunganServerSemua();

    requestAnimationFrame(() => {
      if (inputNama instanceof HTMLElement) {
        inputNama.focus();
      }
    });
  }

  function tutup(kembalikanFokus = true) {
    if (!modal || !terbuka) return;
    terbuka = false;
    if (sesiDialogAktif === objekSesiIni) {
      sesiDialogAktif = null;
    }
    modal.hidden = true;
    tawaranBuatUlang404 = null;
    tawaranSampahFolderTerhapus = null;
    konfirmasiSampahTerbuka = false;
    tampilkanPesan("");
    resetFormKeTambah();

    if (kembalikanFokus && fokusSebelumnya && document.contains(fokusSebelumnya)) {
      fokusSebelumnya.focus();
    }
    fokusSebelumnya = null;
  }

  manajer.onChange(() => {
    if (terbuka) {
      renderDaftarKategori();
    }
  });

  return {
    buka,
    tutup,
    segarkanTampilan: () => {
      if (terbuka) renderDaftarKategori();
    }
  };
}
