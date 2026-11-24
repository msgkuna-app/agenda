/**
 * State Modul Sampah (Tahap 3: dipisah dari sampah.js; Tahap B: berbasis tabel jenis;
 * Tahap 6f: dipecah)
 * Pintu re-export state Tempat Sampah. Isi sebenarnya dibagi menurut tanggung jawab:
 *   - inti.js      : tabel JENIS_SAMPAH, tiga peta per jenis, seluruh pembacaan
 *   - hapus.js     : Kosongkan, pembersihan otomatis >30 hari, pemindahan berkas Drive
 *   - langganan.js : langganan per jenis & pelepasan langganan
 * Konsumen (index.js, view.js, controller.js) tidak perlu diubah.
 *
 * Seluruh perilaku diatur tabel JENIS_SAMPAH. Menambah jenis baru cukup dengan
 * menambah satu baris di tabel itu (inti.js) beserta fungsi normalkan-nya.
 *
 * Sejak v1.8.44 kelima koleksi hapus lunak terdaftar, termasuk dokumen dan foto yang
 * berberkas di Google Drive. Setiap penghapusan permanen memindahkan berkas Drive
 * lebih dulu agar berkas tidak menjadi yatim; pemindahan itu memerlukan jaringan,
 * sehingga pembersihan otomatis dilewati saat luring dan kedua tombol hapus permanen
 * menolak item berberkas saat luring. TANPA DOM: pembaruan tampilan dipicu controller
 * lewat callback onData/onGalat pada langgananSampah().
 */
export {
  getJenisSampah,
  getDaftarSampah,
  getSemuaItemSampah,
  isSampahSudahDimuat,
  ambilItemSampahMentah,
  hapusItemSampah,
  hitungTotalItemSampah,
  hitungItemSampahBerberkas,
  punyaBerkasDrive,
  resetFlagPembersihanSampah
} from "./inti.js";

export {
  kosongkanSemuaItemSampah,
  jalankanPembersihanSampahOtomatis
} from "./hapus.js";

export {
  langgananSampah,
  lepasLanggananSampah
} from "./langganan.js";
