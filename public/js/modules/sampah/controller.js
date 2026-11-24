/**
 * Controller Modul Sampah (Tahap 3: dipisah dari sampah.js; Tahap B: berbasis tabel jenis)
 * Mengikat antarmuka halaman Tempat Sampah (delegasi klik, dua modal konfirmasi,
 * tombol Escape), mengorkestrasi langganan Firestore lewat state, dan menampilkan
 * toast. Semua operasi Firestore ada di state.js; semua render di view.js.
 *
 * Perilaku tiap jenis diatur tabel PENANGAN_JENIS, sehingga controller tidak lagi
 * bercabang `tipe === "kegiatan" ? … : catatan`. Tahap E cukup menambah entri baru
 * di tabel itu (dan langganan di state.js).
 */
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { KOLEKSI, KOLEKSI_HAPUS_LUNAK } from "../../config/constants.js";
import { pulihkanKegiatan, hapusPermanenKegiatan } from "../kegiatan/index.js";
import { pulihkanCatatan, hapusPermanenCatatan } from "../catatan/index.js";
import { tampilkanToast } from "../../shared/toast.js";
import {
  ambilItemSampahMentah,
  hapusItemSampah,
  hitungTotalItemSampah,
  kosongkanSemuaItemSampah,
  langgananSampah,
  lepasLanggananSampah,
  resetFlagPembersihanSampah
} from "./state.js";
import { initFilterPanel } from "../../filter-panel.js";
import {
  pastikanKerangkaHalamanSampah,
  tampilkanGalatHalamanSampah,
  renderHalamanSampah,
  setFilterSegmenSampah,
  setKataKunciSampah
} from "./view.js";

/**
 * Perilaku per jenis item Tempat Sampah.
 * - `pulihkan(id, item)`: mengembalikan item; boleh mengembalikan
 *   `{ pesanDrive }` untuk pesan tambahan (catatan Google Docs).
 * - `hapusPermanen(id, item)`: menghapus dari Firestore.
 * Kata untuk kalimat dialog ("Item kegiatan …") diambil dari tabel bersama
 * KOLEKSI_HAPUS_LUNAK di config/constants.js agar tidak ditulis dua kali.
 */
const PENANGAN_JENIS = {
  [KOLEKSI.KEGIATAN]: {
    pulihkan: async (id) => {
      await pulihkanKegiatan(id);
      return { pesanDrive: "" };
    },
    hapusPermanen: (id) => hapusPermanenKegiatan(id)
  },
  [KOLEKSI.CATATAN]: {
    pulihkan: (id, item) => pulihkanCatatan(id, item),
    hapusPermanen: (id) => hapusPermanenCatatan(id)
  }
};

/** Label & satuan tampilan per kunci koleksi, dari tabel bersama di constants. */
const infoPerKunci = new Map(KOLEKSI_HAPUS_LUNAK.map((info) => [info.key, info]));

let antarmukaSampahDiikat = false;
let pengendaliFilterSampah = null;

let itemAkanDihapusPermanen = null; // { tipe: kunci koleksi, item: any }
let fokusSebelumModalSampah = null;

function ambilPenangan(tipe) {
  return PENANGAN_JENIS[tipe] || null;
}

function bukaDialogHapusPermanen(tipe, id) {
  const modal = document.getElementById("sampah-hapus-permanen-modal");
  const desc = document.getElementById("sampah-hapus-permanen-desc");
  const cancelBtn = document.getElementById("sampah-hapus-permanen-cancel-btn");
  if (!modal) return;

  const penangan = ambilPenangan(tipe);
  const item = ambilItemSampahMentah(tipe, id);
  if (!penangan || !item) return;

  fokusSebelumModalSampah = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  itemAkanDihapusPermanen = { tipe, item };

  if (desc) {
    const info = infoPerKunci.get(tipe);
    const satuan = info ? info.satuan : tipe;
    desc.textContent = `Item ${satuan} "${item.judul || "Tanpa Judul"}" akan dihapus permanen dari Firestore dan tidak dapat dipulihkan kembali.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusPermanen(kembalikanFokus = true) {
  const modal = document.getElementById("sampah-hapus-permanen-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  itemAkanDihapusPermanen = null;

  if (kembalikanFokus && fokusSebelumModalSampah && document.contains(fokusSebelumModalSampah)) {
    fokusSebelumModalSampah.focus();
  }
  fokusSebelumModalSampah = null;
}

function bukaDialogKosongkanSampah() {
  const modal = document.getElementById("sampah-kosongkan-modal");
  const desc = document.getElementById("sampah-kosongkan-desc");
  const cancelBtn = document.getElementById("sampah-kosongkan-cancel-btn");
  if (!modal) return;

  const total = hitungTotalItemSampah();
  if (total === 0) {
    tampilkanToast("Tempat Sampah sudah kosong", "info");
    return;
  }

  fokusSebelumModalSampah = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (desc) {
    desc.textContent = `Semua ${total} item di Tempat Sampah akan dihapus permanen dari Firestore. Tindakan ini tidak dapat dibatalkan.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogKosongkanSampah(kembalikanFokus = true) {
  const modal = document.getElementById("sampah-kosongkan-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalSampah && document.contains(fokusSebelumModalSampah)) {
    fokusSebelumModalSampah.focus();
  }
  fokusSebelumModalSampah = null;
}

/** Tindakan tombol "Pulihkan" untuk satu item; galat diteruskan ke pemanggil. */
async function pulihkanItemSampah(tipe, id) {
  const penangan = ambilPenangan(tipe);
  if (!penangan) return;

  const hasil = await penangan.pulihkan(id, ambilItemSampahMentah(tipe, id));
  hapusItemSampah(tipe, id);

  const info = infoPerKunci.get(tipe);
  const label = info ? info.label : tipe;
  if (hasil && hasil.pesanDrive) {
    tampilkanToast(`${label} dipulihkan. ${hasil.pesanDrive}`, "warning");
  } else {
    tampilkanToast(`${label} berhasil dipulihkan`, "success");
  }
}

/** Tindakan tombol "Hapus Permanen" untuk satu item; galat diteruskan ke pemanggil. */
async function hapusItemSampahPermanen(tipe, item) {
  const penangan = ambilPenangan(tipe);
  if (!penangan) return;
  await penangan.hapusPermanen(item.id, item);
  hapusItemSampah(tipe, item.id);
}

export function initHalamanSampah() {
  pastikanKerangkaHalamanSampah();
  pengendaliFilterSampah = initFilterPanel(document.getElementById("sampah-toolbar"));
  if (antarmukaSampahDiikat) return;
  antarmukaSampahDiikat = true;

  const panel = document.getElementById("section-sampah");
  if (!panel) return;

  // Pencarian & filter jenis item
  const inputCari = document.getElementById("sampah-search-input");
  if (inputCari instanceof HTMLInputElement) {
    inputCari.addEventListener("input", () => {
      setKataKunciSampah(inputCari.value);
      renderHalamanSampah();
    });
  }

  const selectJenis = document.getElementById("sampah-filter-jenis");
  if (selectJenis instanceof HTMLSelectElement) {
    selectJenis.addEventListener("change", () => {
      setFilterSegmenSampah(selectJenis.value);
      renderHalamanSampah();
    });
  }

  // Delegasi klik
  panel.addEventListener("click", async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    // 1. Tombol Kosongkan
    if (target.closest("#sampah-btn-kosongkan")) {
      bukaDialogKosongkanSampah();
      return;
    }

    // 2. Tombol aksi item: Pulihkan
    const btnPulihkan = target.closest("button[data-sampah-action='pulihkan']");
    if (btnPulihkan) {
      const tipe = btnPulihkan.getAttribute("data-sampah-tipe");
      const id = btnPulihkan.getAttribute("data-sampah-id");
      if (!tipe || !id) return;

      btnPulihkan.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        await pulihkanItemSampah(tipe, id);
        renderHalamanSampah();
      } catch (err) {
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal memulihkan: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        btnPulihkan.removeAttribute("disabled");
      }
      return;
    }

    // 3. Tombol aksi item: Hapus Permanen
    const btnHapus = target.closest("button[data-sampah-action='hapus-permanen']");
    if (btnHapus) {
      const tipe = btnHapus.getAttribute("data-sampah-tipe");
      const id = btnHapus.getAttribute("data-sampah-id");
      if (tipe && id) {
        bukaDialogHapusPermanen(tipe, id);
      }
    }
  });

  // Modal Hapus Permanen Tunggal
  const modalHapus = document.getElementById("sampah-hapus-permanen-modal");
  const cancelHapusBtn = document.getElementById("sampah-hapus-permanen-cancel-btn");
  const confirmHapusBtn = document.getElementById("sampah-hapus-permanen-confirm-btn");

  if (cancelHapusBtn) cancelHapusBtn.addEventListener("click", () => tutupDialogHapusPermanen(true));
  if (modalHapus) {
    modalHapus.addEventListener("click", (e) => {
      if (e.target === modalHapus) tutupDialogHapusPermanen(true);
    });
  }
  if (confirmHapusBtn) {
    confirmHapusBtn.addEventListener("click", async () => {
      if (!itemAkanDihapusPermanen) return;
      const { tipe, item } = itemAkanDihapusPermanen;
      confirmHapusBtn.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        await hapusItemSampahPermanen(tipe, item);
        tutupDialogHapusPermanen(false);
        renderHalamanSampah();
        tampilkanToast("Item berhasil dihapus permanen", "success");
      } catch (err) {
        tutupDialogHapusPermanen(false);
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal menghapus permanen: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        confirmHapusBtn.removeAttribute("disabled");
      }
    });
  }

  // Modal Kosongkan Tempat Sampah
  const modalKosongkan = document.getElementById("sampah-kosongkan-modal");
  const cancelKosongkanBtn = document.getElementById("sampah-kosongkan-cancel-btn");
  const confirmKosongkanBtn = document.getElementById("sampah-kosongkan-confirm-btn");

  if (cancelKosongkanBtn) cancelKosongkanBtn.addEventListener("click", () => tutupDialogKosongkanSampah(true));
  if (modalKosongkan) {
    modalKosongkan.addEventListener("click", (e) => {
      if (e.target === modalKosongkan) tutupDialogKosongkanSampah(true);
    });
  }
  if (confirmKosongkanBtn) {
    confirmKosongkanBtn.addEventListener("click", async () => {
      const kosong = hitungTotalItemSampah() === 0;

      if (kosong) {
        tutupDialogKosongkanSampah(true);
        return;
      }

      confirmKosongkanBtn.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        await kosongkanSemuaItemSampah();
        tutupDialogKosongkanSampah(false);
        renderHalamanSampah();
        tampilkanToast("Tempat Sampah berhasil dikosongkan", "success");
      } catch (err) {
        tutupDialogKosongkanSampah(false);
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal mengosongkan: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        confirmKosongkanBtn.removeAttribute("disabled");
      }
    });
  }

  // Tangani tombol Escape untuk modal sampah
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalKosongkan && !modalKosongkan.hidden) {
      e.preventDefault();
      tutupDialogKosongkanSampah(true);
    } else if (modalHapus && !modalHapus.hidden) {
      e.preventDefault();
      tutupDialogHapusPermanen(true);
    }
  });

  renderHalamanSampah();
}

/**
 * Memulai langganan query mandiri Tempat Sampah untuk setiap jenis aktif
 * (kegiatan dan catatan pada tahap ini): where("dihapusAt", "!=", null).
 */
export function subscribeSampah() {
  unsubscribeSampah();
  initHalamanSampah();

  langgananSampah({
    onData: () => renderHalamanSampah(),
    onGalat: (err) => tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err))
  });

  return () => unsubscribeSampah();
}

export function unsubscribeSampah() {
  lepasLanggananSampah();
  resetPembersihanSampah();
}

export function resetPembersihanSampah() {
  resetFlagPembersihanSampah();
  setFilterSegmenSampah("semua");
  setKataKunciSampah("");

  const inputCari = document.getElementById("sampah-search-input");
  if (inputCari instanceof HTMLInputElement) inputCari.value = "";
  const selectJenis = document.getElementById("sampah-filter-jenis");
  if (selectJenis instanceof HTMLSelectElement) selectJenis.value = "semua";
  pengendaliFilterSampah?.perbaruiLencana();

  itemAkanDihapusPermanen = null;
  tutupDialogHapusPermanen(false);
  tutupDialogKosongkanSampah(false);
}
