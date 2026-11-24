/**
 * Inti Manajer Kategori (Tahap 6g: dipecah dari kategori/state.js)
 * Pemilik konfigurasi dan state memori satu instans manajer kategori:
 * daftar kategori, status seeding, pendengar perubahan, dan penerima subscribe
 * terakhir. Berisi pembacaan (getDaftarKategori, ambilKategoriById,
 * cariInfoKategori), pemberitahuan, dan validasi nama kategori.
 * Mutasi data ada di mutasi.js; langganan realtime di langganan.js.
 * TANPA DOM.
 */
import { TANPA_KATEGORI_INFO } from "./format.js";

/**
 * Membuat konteks inti manajer kategori. Seluruh fungsi di berkas ini dan di
 * langganan.js / mutasi.js bekerja pada objek `inti` yang sama, sehingga state
 * tetap berupa satu himpunan nilai per instans (setara closure berkas lama).
 * @param {{
 *   namaKoleksiKategori: string,
 *   namaKoleksiPemakai: string,
 *   labelItemPemakai?: string,
 *   daftarBawaan?: Array<{id: string, nama: string, warna: string, urutan: number}>,
 *   pakaiFolderDrive?: boolean
 * }} konfigurasi
 */
export function buatIntiKategori(konfigurasi = {}) {
  const {
    namaKoleksiKategori,
    namaKoleksiPemakai,
    labelItemPemakai = "kegiatan",
    daftarBawaan = [],
    pakaiFolderDrive = false
  } = konfigurasi;

  const inti = {
    // Konfigurasi
    namaKoleksiKategori,
    namaKoleksiPemakai,
    labelItemPemakai,
    pakaiFolderDrive,
    daftarBawaan,
    // State memori instans
    kategoriList: [],
    unsubscribeSnapshot: null,
    sedangSeeding: false,
    sudahCekSeedSesiIni: false,
    listenersPerubahan: new Set(),
    // Penerima yang didaftarkan oleh panggilan subscribe() terakhir. Hanya penerima ini
    // yang dilepas oleh unsubscribe(); pendaftar lewat onChange() tetap hidup (dulu ikut
    // terhapus sehingga dropdown filter kategori tidak pernah tersegarkan lagi).
    penerimaSubscribeAktif: null
  };

  function beritahuPerubahan() {
    const salinan = getDaftarKategori();
    inti.listenersPerubahan.forEach((fn) => {
      try {
        fn(salinan);
      } catch (_e) {
        // Abaikan kendala listener eksternal
      }
    });
  }

  function onChange(fn) {
    if (typeof fn !== "function") return () => {};
    inti.listenersPerubahan.add(fn);
    return () => inti.listenersPerubahan.delete(fn);
  }

  function getDaftarKategori() {
    return inti.kategoriList.map((k) => ({ ...k }));
  }

  function ambilKategoriById(id) {
    const targetId = String(id || "").trim();
    if (!targetId) return null;
    const ketemu = inti.kategoriList.find((k) => k.id === targetId);
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
    const ketemu = inti.kategoriList.find((k) => k.id === idDicari);
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
    const duplikat = inti.kategoriList.some(
      (k) => k.id !== abaikanId && k.nama.trim().toLowerCase() === namaKecil
    );
    if (duplikat) {
      throw new Error(`Kategori "${nama}" sudah ada. Gunakan nama lain.`);
    }
    return nama;
  }

  return Object.assign(inti, {
    beritahuPerubahan,
    onChange,
    getDaftarKategori,
    ambilKategoriById,
    cariInfoKategori,
    validasiNamaKategori
  });
}
