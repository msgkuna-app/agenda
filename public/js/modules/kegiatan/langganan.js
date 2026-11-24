/**
 * Langganan Modul Kegiatan (2026-11-25: pecahan dari state.js)
 *
 * Seluruh langganan realtime modul kegiatan: jendela tanggal kalender (Dashboard
 * & Jadwal), halaman daftar kegiatan (dengan paginasi), dan data kategori.
 * Berkas ini juga pemilik jendela tanggal aktif dan kedua fungsi pelepas
 * snapshot, karena hanya di sini keduanya dipasang.
 *
 * State bersama (tiga peta, kursor, bendera, opsi peristiwa) tetap dimiliki
 * `inti.js`; berkas ini mengubahnya lewat fungsi yang diekspor di sana.
 */
import { UKURAN_HALAMAN_KEGIATAN, KOLEKSI } from "../../config/constants.js";
import { langgananKoleksi } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { tanggalLokal } from "../../util-tanggal.js";
import {
  manajerKategoriKegiatan,
  petaKegiatanJendela,
  petaKegiatanHalaman,
  petaKegiatanTambahan,
  petakanKegiatan,
  beritahuPerubahanKegiatan,
  tandaiKegiatanSudahDimuat,
  getOpsiPeristiwaKegiatan,
  setKursorHalamanKegiatan,
  setAdaLebihBanyakKegiatan,
  setSedangMuatLebihKegiatan
} from "./inti.js";

let unsubscribeSnapshotJendela = null;
let unsubscribeSnapshotHalaman = null;
let jendelaAwalAktif = "";
let jendelaAkhirAktif = "";

export function hitungRentangJendela(tahun, bulanIndex) {
  // Rentang jendela: 1 bulan sebelum s/d 1 bulan sesudah bulan aktif (+/- 1 bulan)
  const dMulai = new Date(tahun, bulanIndex - 1, 1);
  const dAkhir = new Date(tahun, bulanIndex + 2, 0); // hari terakhir bulan berikutnya
  return {
    tglAwal: tanggalLokal(dMulai),
    tglAkhir: tanggalLokal(dAkhir)
  };
}

/**
 * Menyinkronkan listener jendela tanggal aktif saat berpindah bulan pada Kalender Jadwal.
 */
export function sinkronkanJendelaTanggalKegiatan(tahun, bulanIndex) {
  const { tglAwal, tglAkhir } = hitungRentangJendela(tahun, bulanIndex);
  if (tglAwal === jendelaAwalAktif && tglAkhir === jendelaAkhirAktif && unsubscribeSnapshotJendela) {
    return;
  }
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);
}

export function mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir) {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }

  jendelaAwalAktif = tglAwal;
  jendelaAkhirAktif = tglAkhir;

  unsubscribeSnapshotJendela = langgananKoleksi(
    KOLEKSI.KEGIATAN,
    {
      filter: [
        ["dihapusAt", "==", null],
        ["tanggal", ">=", tglAwal],
        ["tanggal", "<=", tglAkhir],
      ],
      urutkan: ["tanggal", "asc"],
    },
    {
      onData: (items) => {
        petaKegiatanJendela.clear();
        items.forEach((item) => {
          petaKegiatanJendela.set(item.id, petakanKegiatan(item));
        });
        tandaiKegiatanSudahDimuat(true);
        const opsiPeristiwa = getOpsiPeristiwaKegiatan();
        if (typeof opsiPeristiwa.onSuksesJendela === "function") opsiPeristiwa.onSuksesJendela();
        beritahuPerubahanKegiatan();
      },
      onGalat: (err) => {
        tandaiKegiatanSudahDimuat(true);
        const opsiPeristiwa = getOpsiPeristiwaKegiatan();
        if (typeof opsiPeristiwa.onGalatJendela === "function") {
          opsiPeristiwa.onGalatJendela(formatPesanGalatFirestore(err));
        }
        beritahuPerubahanKegiatan();
      }
    }
  );
}

export function mulaiLanggananHalamanKegiatan() {
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  unsubscribeSnapshotHalaman = langgananKoleksi(
    KOLEKSI.KEGIATAN,
    {
      filter: [["dihapusAt", "==", null]],
      urutkan: ["tanggal", "desc"],
      batas: UKURAN_HALAMAN_KEGIATAN,
    },
    {
      onData: (items, meta) => {
        petaKegiatanHalaman.clear();
        items.forEach((item) => {
          petaKegiatanHalaman.set(item.id, petakanKegiatan(item));
        });

        if (meta.dokumenTerakhir) {
          setKursorHalamanKegiatan(meta.dokumenTerakhir);
        }
        setAdaLebihBanyakKegiatan(meta.jumlah >= UKURAN_HALAMAN_KEGIATAN);
        tandaiKegiatanSudahDimuat(true);
        beritahuPerubahanKegiatan();
      },
      onGalat: (err) => {
        const opsiPeristiwa = getOpsiPeristiwaKegiatan();
        if (typeof opsiPeristiwa.onGalatHalaman === "function") {
          opsiPeristiwa.onGalatHalaman(formatPesanGalatFirestore(err));
        }
      }
    }
  );
}

/**
 * Memasang langganan data kategori (pemuatan awal + realtime).
 * onKategoriOk dipanggil sebelum beritahu agar dropdown kategori terbarui
 * lebih dulu, sama seperti urutan pada berkas lama.
 */
export function langgananKategoriKegiatan() {
  manajerKategoriKegiatan.subscribe(
    () => {
      const opsiPeristiwa = getOpsiPeristiwaKegiatan();
      if (typeof opsiPeristiwa.onKategoriOk === "function") opsiPeristiwa.onKategoriOk();
      beritahuPerubahanKegiatan();
    },
    (pesanGalat) => {
      const opsiPeristiwa = getOpsiPeristiwaKegiatan();
      if (typeof opsiPeristiwa.onGalatKategori === "function") opsiPeristiwa.onGalatKategori(pesanGalat);
    }
  );
}

/**
 * Melepas semua langganan realtime + kategori dan mengosongkan cache.
 * Pembersihan antarmuka (modal, panel filter) dilakukan controller.
 */
export function lepasLanggananKegiatan() {
  if (typeof unsubscribeSnapshotJendela === "function") {
    try { unsubscribeSnapshotJendela(); } catch (_e) {}
    unsubscribeSnapshotJendela = null;
  }
  if (typeof unsubscribeSnapshotHalaman === "function") {
    try { unsubscribeSnapshotHalaman(); } catch (_e) {}
    unsubscribeSnapshotHalaman = null;
  }

  manajerKategoriKegiatan.unsubscribe();
  petaKegiatanJendela.clear();
  petaKegiatanHalaman.clear();
  petaKegiatanTambahan.clear();
  setKursorHalamanKegiatan(null);
  setAdaLebihBanyakKegiatan(false);
  setSedangMuatLebihKegiatan(false);
  jendelaAwalAktif = "";
  jendelaAkhirAktif = "";

  tandaiKegiatanSudahDimuat(false);
  beritahuPerubahanKegiatan();
}
