/**
 * Controller Modul Kategori (Tahap 3: dipisah dari kategori.js)
 * Pabrik dialog "Kelola Kategori" generik (kegiatan & dokumen): registri sesi aktif,
 * pemasangan listener DOM modal sekali, handler tambah/ubah/urutkan/hapus/sinkron
 * Drive, serta buka/tutup dialog.
 *
 * State sesi disimpan pada objek `ctx` yang dibuat di sini (satu per pemanggilan
 * inisialisasiDialogKelolaKategori) lalu diteruskan ke fungsi render di view.js.
 * Dengan begitu dialog kegiatan dan dialog dokumen tetap memiliki state terpisah
 * walau berbagi modal DOM yang sama — paritas perilaku dengan closure aslinya.
 */
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { PRESET_WARNA_KATEGORI, normalisasiWarnaKategori } from "./format.js";
import {
  tampilkanPesan,
  perbaruiPenghitungKarakter,
  renderPilihanWarna,
  resetFormKeTambah,
  mulaiModeUbah,
  segarkanHitunganServerSemua,
  renderDaftarKategori
} from "./view.js";

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

  const ctx = {
    // Opsi dari pemanggil
    manajer,
    hitungPemakaiLokal,
    onLihatItemKategori,
    judulDialog,
    opsiDrive,
    // Referensi DOM dialog
    modal: document.getElementById("kategori-manage-modal"),
    titleEl: document.getElementById("kategori-manage-title"),
    formHeading: document.getElementById("kategori-form-heading"),
    inputId: document.getElementById("kategori-edit-id"),
    inputNama: document.getElementById("kategori-nama-input"),
    charCounter: document.getElementById("kategori-nama-counter"),
    swatchContainer: document.getElementById("kategori-warna-picker"),
    submitBtn: document.getElementById("kategori-submit-btn"),
    cancelEditBtn: document.getElementById("kategori-cancel-edit-btn"),
    alertBox: document.getElementById("kategori-alert-box"),
    alertText: document.getElementById("kategori-alert-text"),
    listContainer: document.getElementById("kategori-manage-list"),
    // State sesi dialog
    terbuka: false,
    warnaTerpilih: PRESET_WARNA_KATEGORI[0].id,
    fokusSebelumnya: null,
    cacheHitunganServer: new Map(),
    sedangMemuatHitunganServer: false,
    tawaranBuatUlang404: null,
    tawaranSampahFolderTerhapus: null,
    konfirmasiSampahTerbuka: false
  };

  async function tanganiSubmitForm() {
    tampilkanPesan(ctx, "");
    const idSedangEdit = ctx.inputId ? ctx.inputId.value.trim() : "";
    const namaInput = ctx.inputNama ? ctx.inputNama.value : "";

    if (ctx.submitBtn) ctx.submitBtn.disabled = true;
    try {
      if (idSedangEdit) {
        const hasilUbah = await manajer.ubahKategori(idSedangEdit, {
          nama: namaInput,
          warna: ctx.warnaTerpilih
        });
        resetFormKeTambah(ctx);

        if (hasilUbah.namaBerubah && opsiDrive?.onSetelahUbahNamaKategori) {
          const responDrive = await opsiDrive.onSetelahUbahNamaKategori(hasilUbah);
          if (responDrive?.folder404) {
            ctx.tawaranBuatUlang404 = { id: hasilUbah.id, nama: hasilUbah.nama };
          }
          if (responDrive?.peringatan) {
            tampilkanPesan(ctx, responDrive.peringatan, "warning");
          }
        }
      } else {
        const katBaru = await manajer.tambahKategori({
          nama: namaInput,
          warna: ctx.warnaTerpilih
        });
        resetFormKeTambah(ctx);

        if (opsiDrive?.onSetelahTambahKategori) {
          const responDrive = await opsiDrive.onSetelahTambahKategori(katBaru);
          if (responDrive?.peringatan) {
            tampilkanPesan(ctx, responDrive.peringatan, "warning");
          }
        }
      }
      renderDaftarKategori(ctx);
    } catch (err) {
      tampilkanPesan(ctx, err instanceof Error ? err.message : formatPesanGalatFirestore(err));
    } finally {
      if (ctx.submitBtn) ctx.submitBtn.disabled = false;
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
      ctx.tawaranBuatUlang404 = null;
      renderDaftarKategori(ctx);
      return;
    }

    if (aksi === "recreate-folder-404" && opsiDrive?.onBuatUlangFolderDanPindahkan) {
      const kat = manajer.ambilKategoriById(id) || ctx.tawaranBuatUlang404;
      if (!kat) return;
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Membuat ulang...";
      tampilkanPesan(ctx, "");
      try {
        const hasil = await opsiDrive.onBuatUlangFolderDanPindahkan(kat);
        ctx.tawaranBuatUlang404 = null;
        if (hasil?.pesanSukses) {
          tampilkanPesan(ctx, hasil.pesanSukses, "success");
        }
      } catch (err) {
        tampilkanPesan(ctx, err instanceof Error ? err.message : "Gagal membuat ulang folder kategori di Google Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori(ctx);
      }
      return;
    }

    if (aksi === "keep-drive-folder") {
      ctx.tawaranSampahFolderTerhapus = null;
      ctx.konfirmasiSampahTerbuka = false;
      renderDaftarKategori(ctx);
      return;
    }

    if (aksi === "ask-trash-folder") {
      ctx.konfirmasiSampahTerbuka = true;
      renderDaftarKategori(ctx);
      return;
    }

    if (aksi === "cancel-trash-folder") {
      ctx.konfirmasiSampahTerbuka = false;
      renderDaftarKategori(ctx);
      return;
    }

    if (aksi === "confirm-trash-folder" && opsiDrive?.onBuangFolderBekasKeSampah && ctx.tawaranSampahFolderTerhapus) {
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Memindahkan...";
      tampilkanPesan(ctx, "");
      try {
        await opsiDrive.onBuangFolderBekasKeSampah(ctx.tawaranSampahFolderTerhapus);
        const namaLama = ctx.tawaranSampahFolderTerhapus.nama;
        ctx.tawaranSampahFolderTerhapus = null;
        ctx.konfirmasiSampahTerbuka = false;
        tampilkanPesan(ctx, `Folder "${namaLama}" telah dipindahkan ke Sampah Google Drive.`, "success");
      } catch (err) {
        tampilkanPesan(ctx, err instanceof Error ? err.message : "Gagal memindahkan folder ke Sampah Google Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori(ctx);
      }
      return;
    }

    if (aksi === "sync-folder" && opsiDrive?.onSinkronkanFolder) {
      const kat = manajer.ambilKategoriById(id);
      if (!kat) return;
      btn.disabled = true;
      const teksAsli = btn.textContent;
      btn.textContent = "Menyinkronkan...";
      tampilkanPesan(ctx, "");
      try {
        const hasil = await opsiDrive.onSinkronkanFolder(kat);
        if (hasil?.folder404) {
          ctx.tawaranBuatUlang404 = { id: kat.id, nama: kat.nama };
        }
        if (hasil?.pesanGalat) {
          tampilkanPesan(ctx, hasil.pesanGalat, "warning");
        } else if (hasil?.pesanSukses) {
          tampilkanPesan(ctx, hasil.pesanSukses, "success");
        }
      } catch (err) {
        tampilkanPesan(ctx, err instanceof Error ? err.message : "Gagal menyinkronkan folder Drive.");
      } finally {
        if (document.contains(btn)) {
          btn.disabled = false;
          btn.textContent = teksAsli;
        }
        renderDaftarKategori(ctx);
      }
      return;
    }

    if (aksi === "edit") {
      const kat = manajer.getDaftarKategori().find((k) => k.id === id);
      if (kat) mulaiModeUbah(ctx, kat);
      return;
    }

    if (aksi === "up" || aksi === "down") {
      tampilkanPesan(ctx, "");
      btn.disabled = true;
      try {
        await manajer.geserUrutanKategori(id, aksi);
      } catch (err) {
        tampilkanPesan(ctx, formatPesanGalatFirestore(err));
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (aksi === "delete") {
      tampilkanPesan(ctx, "");
      if (!navigator.onLine) {
        tampilkanPesan(
          ctx,
          "Tidak dapat menghapus kategori saat offline. Sambungkan ke internet terlebih dahulu."
        );
        renderDaftarKategori(ctx);
        return;
      }

      btn.disabled = true;
      const labelAwal = btn.textContent;
      btn.textContent = "Memeriksa...";
      try {
        const dihapus = await manajer.hapusKategoriAman(id);
        ctx.cacheHitunganServer.delete(id);
        if (ctx.inputId && ctx.inputId.value === id) {
          resetFormKeTambah(ctx);
        }
        if (ctx.tawaranBuatUlang404 && ctx.tawaranBuatUlang404.id === id) {
          ctx.tawaranBuatUlang404 = null;
        }

        if (manajer.pakaiFolderDrive && dihapus?.folderId) {
          ctx.tawaranSampahFolderTerhapus = {
            nama: dihapus.nama,
            folderId: dihapus.folderId
          };
          ctx.konfirmasiSampahTerbuka = false;
        } else if (manajer.pakaiFolderDrive) {
          tampilkanPesan(ctx, `Kategori "${dihapus?.nama || ""}" berhasil dihapus.`, "success");
        }

        renderDaftarKategori(ctx);
      } catch (err) {
        if (err && typeof err === "object" && typeof err.jumlahPemakai === "number") {
          ctx.cacheHitunganServer.set(id, err.jumlahPemakai);
        }
        tampilkanPesan(ctx, err instanceof Error ? err.message : formatPesanGalatFirestore(err));
        renderDaftarKategori(ctx);
      } finally {
        if (document.contains(btn)) {
          btn.textContent = labelAwal;
        }
      }
    }
  }

  function sinkronkanStatusJaringan() {
    if (!ctx.terbuka) return;
    if (!navigator.onLine) {
      tampilkanPesan(
        ctx,
        "Mode luring: Anda tetap dapat menambah atau mengubah kategori, tetapi penghapusan memerlukan internet.",
        "warning"
      );
    } else {
      tampilkanPesan(ctx, "");
      segarkanHitunganServerSemua(ctx);
    }
    renderDaftarKategori(ctx);
  }

  const objekSesiIni = {
    perbaruiPenghitungKarakter: () => perbaruiPenghitungKarakter(ctx),
    pilihWarna: (kode) => {
      ctx.warnaTerpilih = normalisasiWarnaKategori(kode);
      renderPilihanWarna(ctx);
    },
    batalkanModeUbah: () => {
      tampilkanPesan(ctx, "");
      resetFormKeTambah(ctx);
    },
    tanganiSubmitForm,
    tanganiKlikDaftar,
    sinkronkanStatusJaringan,
    tutup
  };

  function buka() {
    if (!ctx.modal) return;
    if (sesiDialogAktif && sesiDialogAktif !== objekSesiIni) {
      sesiDialogAktif.tutup(false);
    }

    sesiDialogAktif = objekSesiIni;
    ctx.fokusSebelumnya = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ctx.terbuka = true;
    ctx.cacheHitunganServer.clear();
    ctx.tawaranBuatUlang404 = null;
    ctx.tawaranSampahFolderTerhapus = null;
    ctx.konfirmasiSampahTerbuka = false;

    if (ctx.titleEl) ctx.titleEl.textContent = judulDialog;
    tampilkanPesan(
      ctx,
      !navigator.onLine
        ? "Mode luring: Anda tetap dapat menambah atau mengubah kategori, tetapi penghapusan memerlukan internet."
        : "",
      "warning"
    );
    resetFormKeTambah(ctx);
    renderDaftarKategori(ctx);
    ctx.modal.hidden = false;

    segarkanHitunganServerSemua(ctx);

    requestAnimationFrame(() => {
      if (ctx.inputNama instanceof HTMLElement) {
        ctx.inputNama.focus();
      }
    });
  }

  function tutup(kembalikanFokus = true) {
    if (!ctx.modal || !ctx.terbuka) return;
    ctx.terbuka = false;
    if (sesiDialogAktif === objekSesiIni) {
      sesiDialogAktif = null;
    }
    ctx.modal.hidden = true;
    ctx.tawaranBuatUlang404 = null;
    ctx.tawaranSampahFolderTerhapus = null;
    ctx.konfirmasiSampahTerbuka = false;
    tampilkanPesan(ctx, "");
    resetFormKeTambah(ctx);

    if (kembalikanFokus && ctx.fokusSebelumnya && document.contains(ctx.fokusSebelumnya)) {
      ctx.fokusSebelumnya.focus();
    }
    ctx.fokusSebelumnya = null;
  }

  manajer.onChange(() => {
    if (ctx.terbuka) {
      renderDaftarKategori(ctx);
    }
  });

  return {
    buka,
    tutup,
    segarkanTampilan: () => {
      if (ctx.terbuka) renderDaftarKategori(ctx);
    }
  };
}
