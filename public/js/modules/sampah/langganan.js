/**
 * Langganan Realtime Tempat Sampah (Tahap 6f: dipecah dari sampah/state.js)
 * Pemilik listener snapshot per jenis: kueri mandiri
 * where("dihapusAt", "!=", null) untuk setiap jenis aktif.
 * State memori dimiliki inti.js; pembersihan otomatis dipanggil dari hapus.js.
 */
import { langgananKoleksi } from "../../services/firestoreRepository.js";
import {
  getTabelJenisSampah,
  ambilPetaSampah,
  ambilLanggananSampah,
  setLanggananSampah,
  setStatusMuatSampah
} from "./inti.js";
import { jalankanPembersihanSampahOtomatis } from "./hapus.js";

/**
 * Memulai langganan query mandiri Tempat Sampah untuk setiap jenis aktif:
 * where("dihapusAt", "!=", null).
 * Setiap snapshot: isi peta -> tanda dimuat -> onData() (render, di controller)
 * -> pembersihan otomatis. Galat: console.warn + onGalat(err) (controller yang
 * memformat pesan dan menampilkan banner halaman).
 * @param {{ onData?: () => void, onGalat?: (err: unknown) => void }} opsi
 */
export function langgananSampah(opsi = {}) {
  getTabelJenisSampah().forEach((jenis) => {
    try {
      const unsubscribe = langgananKoleksi(
        jenis.kunci,
        { filter: [["dihapusAt", "!=", null]] },
        {
          onData: (items) => {
            const peta = ambilPetaSampah(jenis.kunci);
            peta.clear();
            items.forEach((item) => {
              const dinormalkan = jenis.normalkan(item);
              peta.set(dinormalkan.id, dinormalkan);
            });
            setStatusMuatSampah(jenis.kunci, true);
            if (typeof opsi.onData === "function") opsi.onData();
            jalankanPembersihanSampahOtomatis();
          },
          onGalat: (err) => {
            console.warn(`Gagal memuat langganan ${jenis.kunci} sampah:`, err);
            if (typeof opsi.onGalat === "function") opsi.onGalat(err);
          }
        }
      );

      setLanggananSampah(jenis.kunci, unsubscribe);
    } catch (err) {
      console.warn(`Gagal membuat query ${jenis.kunci} sampah:`, err);
    }
  });
}

/**
 * Lepas semua langganan snapshot, kosongkan semua peta, dan reset tanda dimuat.
 * Reset tanda pembersihan otomatis + UI tetap di controller (resetPembersihanSampah),
 * sama seperti urutan aslinya.
 */
export function lepasLanggananSampah() {
  getTabelJenisSampah().forEach((jenis) => {
    const unsubscribe = ambilLanggananSampah(jenis.kunci);
    if (typeof unsubscribe === "function") {
      try { unsubscribe(); } catch (_e) {}
    }
    setLanggananSampah(jenis.kunci, null);

    const peta = ambilPetaSampah(jenis.kunci);
    if (peta) peta.clear();
    setStatusMuatSampah(jenis.kunci, false);
  });
}
