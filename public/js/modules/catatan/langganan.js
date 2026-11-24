/**
 * Langganan Realtime Modul Catatan (Tahap 6d: dipecah dari state.js)
 * Pemilik listener snapshot halaman: 100 catatan terbaru dengan penyaring
 * dihapusAt == null, plus pelepasan langganan dan pengosongan state memori.
 * State memori dimiliki inti.js.
 */
import { UKURAN_HALAMAN_CATATAN, KOLEKSI } from "../../config/constants.js";
import { langgananKoleksi } from "../../services/firestoreRepository.js";
import {
  beritahuPerubahanCatatan,
  getKursorCatatanTambahan,
  kosongkanPetaCatatan,
  laporkanGalatCatatan,
  setAdaLebihBanyakCatatan,
  setKursorCatatanTambahan,
  setPenandaHalamanCatatan,
  setSedangMencariSemuaCatatan,
  setSedangMuatLebihCatatan,
  setSeluruhCatatanSudahDimuat,
  setSudahDimuatPertamaKali,
  simpanHalamanCatatan
} from "./inti.js";

let unsubscribeSnapshotCatatan = null;

/**
 * Berlangganan listener 100 catatan terbaru (where dihapusAt == null).
 * Memperbarui peta halaman, kursor, dan flag, lalu memberitahu pendengar.
 */
export function langgananCatatan() {
  unsubscribeSnapshotCatatan = langgananKoleksi(
    KOLEKSI.CATATAN,
    {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["updatedAt", "desc"],
      batas: UKURAN_HALAMAN_CATATAN,
    },
    {
      onData: (items, meta) => {
        simpanHalamanCatatan(items);

        if (meta.dokumenTerakhir) {
          setPenandaHalamanCatatan(meta.dokumenTerakhir);
        }
        if (!getKursorCatatanTambahan()) {
          setAdaLebihBanyakCatatan(meta.jumlah >= UKURAN_HALAMAN_CATATAN);
        }
        setSudahDimuatPertamaKali(true);
        beritahuPerubahanCatatan();
      },
      onGalat: (err) => {
        setSudahDimuatPertamaKali(true);
        laporkanGalatCatatan(err);
        beritahuPerubahanCatatan();
      }
    }
  );
}

/** Menghentikan listener dan mengosongkan seluruh data/flag memori (tanpa DOM). */
export function hentikanLanggananDataCatatan() {
  if (typeof unsubscribeSnapshotCatatan === "function") {
    try { unsubscribeSnapshotCatatan(); } catch (_e) {}
    unsubscribeSnapshotCatatan = null;
  }
  kosongkanPetaCatatan();
  setPenandaHalamanCatatan(null);
  setKursorCatatanTambahan(null);
  setAdaLebihBanyakCatatan(false);
  setSedangMuatLebihCatatan(false);
  setSedangMencariSemuaCatatan(false);
  setSeluruhCatatanSudahDimuat(false);
  setSudahDimuatPertamaKali(false);
}

/** Menandai belum dimuat lalu memberitahu (dipakai ulang saat langganan diulang). */
export function setelBelumDimuatPertamaKali() {
  setSudahDimuatPertamaKali(false);
}
