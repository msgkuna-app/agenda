/**
 * Langganan Modul Dokumen (2026-11-25: pecahan dari state.js)
 *
 * Langganan realtime modul dokumen: kategori dokumen (pemuatan awal + realtime)
 * dan 100 dokumen terbaru. Berkas ini pemilik handle langganan dokumen, karena
 * hanya di sini ia dipasang dan dilepas.
 *
 * State bersama (dua peta, kursor, bendera) dimiliki `inti.js`.
 */
import { UKURAN_HALAMAN_DOKUMEN, KOLEKSI } from "../../config/constants.js";
import { langgananKoleksi } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import {
  manajerKategoriDokumen,
  petaDokumenHalaman,
  petakanDokumen,
  beritahuPerubahanDokumen,
  tandaiDokumenSudahDimuat,
  getKursorTambahan,
  setKursorTambahan,
  setPenandaHalamanAkhir,
  setAdaLebihBanyakDokumen,
  setSedangMemuatLebihDokumen,
  kosongkanPetaDokumen,
  bersihkanCacheDrive,
} from "./inti.js";

let unsubscribeSnapshotDokumen = null;

/**
 * Memasang listener realtime 100 dokumen terbaru.
 * @param {{ onGalat?: (pesan: string) => void, onSukses?: () => void }} [opsi]
 */
export function langgananDokumen(opsi = {}) {
  tandaiDokumenSudahDimuat(false);
  beritahuPerubahanDokumen();

  manajerKategoriDokumen.subscribe(
    () => beritahuPerubahanDokumen(),
    (pesanGalat) => {
      if (typeof opsi.onGalat === "function") opsi.onGalat(pesanGalat);
    }
  );

  unsubscribeSnapshotDokumen = langgananKoleksi(
    KOLEKSI.DOKUMEN,
    {
      // Fase 5: Listener dibatasi 100 dokumen terbaru. Sejak Tahap D kueri menyaring
      // dokumen di Tempat Sampah, sehingga 100 baris yang terbaca semuanya tampil.
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggalUnggah", "desc"],
      batas: UKURAN_HALAMAN_DOKUMEN,
    },
    {
      onData: (items, meta) => {
        petaDokumenHalaman.clear();
        items.forEach((item) => {
          petaDokumenHalaman.set(item.id, petakanDokumen(item));
        });

        if (meta.dokumenTerakhir) {
          setPenandaHalamanAkhir(meta.dokumenTerakhir);
        }
        // Bendera paginasi hanya dihitung listener halaman; bila pengguna sudah
        // memuat halaman tambahan, bendera itu milik kueri.js dan tidak ditimpa.
        if (!getKursorTambahan()) {
          setAdaLebihBanyakDokumen(meta.jumlah >= UKURAN_HALAMAN_DOKUMEN);
        }
        tandaiDokumenSudahDimuat(true);
        if (typeof opsi.onSukses === "function") opsi.onSukses();
        beritahuPerubahanDokumen();
      },
      onGalat: (err) => {
        tandaiDokumenSudahDimuat(true);
        if (typeof opsi.onGalat === "function") opsi.onGalat(formatPesanGalatFirestore(err));
        beritahuPerubahanDokumen();
      }
    }
  );
}

/**
 * Melepas listener realtime + langganan kategori dan mengosongkan cache.
 */
export function lepasLanggananDokumen() {
  if (typeof unsubscribeSnapshotDokumen === "function") {
    try {
      unsubscribeSnapshotDokumen();
    } catch (_e) {}
    unsubscribeSnapshotDokumen = null;
  }

  manajerKategoriDokumen.unsubscribe();
  bersihkanCacheDrive();
  kosongkanPetaDokumen();
  setPenandaHalamanAkhir(null);
  setKursorTambahan(null);
  setAdaLebihBanyakDokumen(false);
  setSedangMemuatLebihDokumen(false);
  tandaiDokumenSudahDimuat(false);
  beritahuPerubahanDokumen();
}
