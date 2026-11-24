/**
 * Langganan Manajer Kategori (Tahap 6g: dipecah dari kategori/state.js)
 * Langganan realtime koleksi kategori beserta pembuatan kategori bawaan yang
 * idempoten (seeding) dan pelepasan langganan. State memori dimiliki inti.js.
 * TANPA DOM.
 */
import {
  langgananKoleksi,
  ambilDaftar,
  jalankanBatch,
} from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { normalisasiWarnaKategori, urutkanDaftarKategori } from "./format.js";

/**
 * Memasang kemampuan langganan pada konteks inti manajer kategori.
 * @param {ReturnType<import("./inti.js").buatIntiKategori>} inti
 */
export function buatLanggananKategori(inti) {
  /**
   * Membuat kategori bawaan secara idempoten (memakai ID dokumen deterministik via jalankanBatch)
   * hanya bila koleksi benar-benar kosong sehingga aman dijalankan berulang tanpa membuat ganda.
   */
  async function pastikanKategoriBawaanJikaKosong() {
    if (inti.sedangSeeding || inti.sudahCekSeedSesiIni || inti.daftarBawaan.length === 0) {
      return;
    }
    inti.sedangSeeding = true;
    try {
      const { items } = await ambilDaftar(inti.namaKoleksiKategori);
      if (items.length > 0) {
        inti.sudahCekSeedSesiIni = true;
        return;
      }

      const sekarang = new Date().toISOString();
      const operasi = inti.daftarBawaan.map((item, idx) => {
        const docId = item.id || `bawaan-${idx + 1}`;
        const payload = {
          nama: item.nama,
          warna: normalisasiWarnaKategori(item.warna),
          urutan: Number.isFinite(item.urutan) ? item.urutan : idx + 1,
          createdAt: sekarang,
          updatedAt: sekarang
        };
        if (inti.pakaiFolderDrive) {
          payload.folderId = "";
          payload.folderSinkron = false;
        }
        // merge: false — kategori bawaan ditulis dengan id deterministik; isinya
        // harus persis payload ini, bukan gabungan dengan sisa dokumen lama.
        return { jenis: "set", koleksi: inti.namaKoleksiKategori, id: docId, data: payload, merge: false };
      });
      await jalankanBatch(operasi);
      inti.sudahCekSeedSesiIni = true;
    } catch (_err) {
      // Biarkan snapshot berikutnya mencoba lagi bila saat ini belum siap
    } finally {
      inti.sedangSeeding = false;
    }
  }

  /**
   * Memulai langganan Firestore koleksi kategori (Aturan #5: hentikan langganan lama dulu).
   * @param {(daftar: Array<any>) => void} [onUpdate]
   * @param {(pesanGalat: string) => void} [onError]
   */
  function subscribe(onUpdate, onError) {
    unsubscribe();
    inti.sudahCekSeedSesiIni = false;

    if (typeof onUpdate === "function") {
      inti.listenersPerubahan.add(onUpdate);
      inti.penerimaSubscribeAktif = onUpdate;
    }

    inti.unsubscribeSnapshot = langgananKoleksi(
      inti.namaKoleksiKategori,
      {},
      {
        onData: async (items, meta) => {
          // Seeding ditunda bila snapshot berasal dari cache: koleksi bisa saja
          // sebenarnya sudah berisi data di server.
          if (meta.kosong && !meta.dariCache && !inti.sudahCekSeedSesiIni) {
            await pastikanKategoriBawaanJikaKosong();
          }

          const hasil = items.map((item) => {
            const entri = {
              id: item.id,
              nama: String(item.nama || "").trim(),
              warna: normalisasiWarnaKategori(item.warna),
              urutan: Number.isFinite(Number(item.urutan)) ? Number(item.urutan) : 9999,
              createdAt: item.createdAt || "",
              updatedAt: item.updatedAt || ""
            };
            if (inti.pakaiFolderDrive) {
              entri.folderId = String(item.folderId || "").trim();
              entri.folderSinkron = Boolean(entri.folderId) && item.folderSinkron === true;
            }
            return entri;
          });

          inti.kategoriList = urutkanDaftarKategori(hasil);
          inti.beritahuPerubahan();
        },
        onGalat: (err) => {
          if (typeof onError === "function") {
            onError(formatPesanGalatFirestore(err));
          }
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
    if (typeof inti.unsubscribeSnapshot === "function") {
      try {
        inti.unsubscribeSnapshot();
      } catch (_e) {
        // Abaikan
      }
      inti.unsubscribeSnapshot = null;
    }
    if (inti.penerimaSubscribeAktif) {
      inti.listenersPerubahan.delete(inti.penerimaSubscribeAktif);
      inti.penerimaSubscribeAktif = null;
    }
    inti.kategoriList = [];
    inti.sudahCekSeedSesiIni = false;
    inti.sedangSeeding = false;
  }

  return { subscribe, unsubscribe };
}
