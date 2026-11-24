/**
 * State Modul Kategori (Tahap 3: dipisah dari kategori.js; Tahap 6g: dipecah)
 * Pabrik `buatManajerKategori` — pengelola kategori generik untuk koleksi
 * "kategoriKegiatan" maupun "kategoriDokumen": langganan real-time, pembuatan
 * kategori bawaan anti-duplikat, tambah, ubah, pengurutan naik/turun,
 * penghapusan aman dengan hitungItem (agregasi server), serta metadata folder Drive.
 * TANPA DOM. Instansi manajer dibuat oleh modules/kegiatan/inti.js dan
 * modules/dokumen/inti.js (Aturan #5, #7, #8, #9, #10, #12).
 *
 * Berkas ini hanya perakit; isinya dibagi menurut tanggung jawab:
 *   - inti.js      : konfigurasi + state instans, pembacaan, pemberitahuan, validasi
 *   - langganan.js : langganan realtime + seeding kategori bawaan
 *   - mutasi.js    : tambah, ubah, status folder, geser urutan, hitung & hapus aman
 */
import { buatIntiKategori } from "./inti.js";
import { buatLanggananKategori } from "./langganan.js";
import { buatMutasiKategori } from "./mutasi.js";

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
  const inti = buatIntiKategori(konfigurasi);
  const { subscribe, unsubscribe } = buatLanggananKategori(inti);
  const mutasi = buatMutasiKategori(inti);

  return {
    namaKoleksiKategori: inti.namaKoleksiKategori,
    namaKoleksiPemakai: inti.namaKoleksiPemakai,
    labelItemPemakai: inti.labelItemPemakai,
    pakaiFolderDrive: inti.pakaiFolderDrive,
    subscribe,
    unsubscribe,
    onChange: inti.onChange,
    getDaftarKategori: inti.getDaftarKategori,
    ambilKategoriById: inti.ambilKategoriById,
    cariInfoKategori: inti.cariInfoKategori,
    tambahKategori: mutasi.tambahKategori,
    ubahKategori: mutasi.ubahKategori,
    perbaruiStatusFolderKategori: mutasi.perbaruiStatusFolderKategori,
    geserUrutanKategori: mutasi.geserUrutanKategori,
    hitungPemakaiDariServer: mutasi.hitungPemakaiDariServer,
    hapusKategoriAman: mutasi.hapusKategoriAman
  };
}
