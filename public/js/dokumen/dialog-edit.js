/**
 * Modul Dialog Ubah Metadata Dokumen
 * Menangani modal perubahan nama tampilan, kategori, catatan, dan kegiatan terkait dokumen (Fase 7C)
 */
import { getFirestoreDb, doc, updateDoc } from "../firebase-config.js";
import { pindahkanBerkasKeFolderDrive, formatPesanGalatDrive } from "../drive.js";
import { stateDokumen, getDaftarDokumen } from "./state.js";
import { manajerKategoriDokumen } from "./data.js";
import { pastikanFolderTujuanKategoriSiap } from "./drive-ops.js";
import { formatUkuranBerkas } from "./util.js";
import {
  perbaruiDropdownKategoriDokumen,
  perbaruiDropdownKegiatanTerkait
} from "./render.js";

/**
 * Menampilkan pesan galat pada modal ubah metadata dokumen.
 * @param {string} pesan
 */
export function setPesanGalatModalEdit(pesan) {
  const box = document.getElementById("dokumen-edit-alert");
  const txt = document.getElementById("dokumen-edit-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

/**
 * Membuka modal ubah metadata dokumen.
 * @param {Object} item
 */
export function bukaModalEditDokumen(item) {
  const modal = document.getElementById("dokumen-edit-modal");
  const idInput = document.getElementById("dokumen-edit-id");
  const namaInput = document.getElementById("dokumen-edit-nama");
  const fileAsliEl = document.getElementById("dokumen-edit-namafile-info");
  const katSelect = document.getElementById("dokumen-edit-kategori");
  const catatanInput = document.getElementById("dokumen-edit-catatan");
  if (!modal || !item) return;

  stateDokumen.fokusSebelumModalDokumen =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setPesanGalatModalEdit("");
  perbaruiDropdownKategoriDokumen();
  perbaruiDropdownKegiatanTerkait("dokumen-edit-kegiatan", item.kegiatanId || "");

  if (idInput instanceof HTMLInputElement) idInput.value = item.id;
  if (namaInput instanceof HTMLInputElement) namaInput.value = item.namaTampilan || item.namaFile || "";
  if (fileAsliEl) {
    fileAsliEl.textContent = `${item.namaFile || "-"} (${formatUkuranBerkas(item.ukuran)})`;
  }
  if (katSelect instanceof HTMLSelectElement) {
    const infoKat = manajerKategoriDokumen.cariInfoKategori(item.kategoriId);
    katSelect.value = infoKat.tetap ? "" : infoKat.id;
  }
  if (catatanInput instanceof HTMLTextAreaElement) {
    catatanInput.value = item.catatan || "";
  }

  stateDokumen.editModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (namaInput instanceof HTMLElement) namaInput.focus();
  });
}

/**
 * Menutup modal ubah metadata dokumen.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupModalEditDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-edit-modal");
  if (!modal || !stateDokumen.editModalTerbuka) return;
  stateDokumen.editModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalEdit("");

  if (
    kembalikanFokus &&
    stateDokumen.fokusSebelumModalDokumen &&
    document.contains(stateDokumen.fokusSebelumModalDokumen)
  ) {
    stateDokumen.fokusSebelumModalDokumen.focus();
  }
  stateDokumen.fokusSebelumModalDokumen = null;
}

/**
 * Menginisialisasi pendengar event untuk modal ubah metadata dokumen.
 */
export function inisialisasiDialogEdit() {
  const editModal = document.getElementById("dokumen-edit-modal");
  const editForm = document.getElementById("dokumen-edit-form");
  const editSubmitBtn = document.getElementById("dokumen-edit-submit-btn");

  document.getElementById("dokumen-edit-close-btn")?.addEventListener("click", () => {
    tutupModalEditDokumen(true);
  });
  document.getElementById("dokumen-edit-cancel-btn")?.addEventListener("click", () => {
    tutupModalEditDokumen(true);
  });
  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) tutupModalEditDokumen(true);
  });

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPesanGalatModalEdit("");

    const idDok = String(document.getElementById("dokumen-edit-id")?.value || "").trim();
    const dokLama = getDaftarDokumen().find((d) => d.id === idDok);
    if (!dokLama) {
      tutupModalEditDokumen(true);
      return;
    }

    const namaTampilanBaru = String(document.getElementById("dokumen-edit-nama")?.value || "").trim();
    const kategoriIdBaru = String(document.getElementById("dokumen-edit-kategori")?.value || "").trim();
    const catatanBaru = String(document.getElementById("dokumen-edit-catatan")?.value || "").trim();
    const kegiatanIdBaru = String(document.getElementById("dokumen-edit-kegiatan")?.value || "").trim();

    if (!namaTampilanBaru) {
      setPesanGalatModalEdit("Nama tampilan dokumen wajib diisi.");
      return;
    }

    const infoKatLama = manajerKategoriDokumen.cariInfoKategori(dokLama.kategoriId);
    const infoKatBaru = manajerKategoriDokumen.cariInfoKategori(kategoriIdBaru);
    const idEfektifLama = infoKatLama.tetap ? "" : infoKatLama.id;
    const idEfektifBaru = infoKatBaru.tetap ? "" : infoKatBaru.id;
    const pindahKategori = idEfektifLama !== idEfektifBaru;

    if (pindahKategori && !navigator.onLine) {
      setPesanGalatModalEdit(
        "Tidak dapat memindahkan kategori dokumen saat luring karena berkas di Google Drive harus ikut dipindahkan ke folder kategori tujuan."
      );
      return;
    }

    if (editSubmitBtn instanceof HTMLButtonElement) {
      editSubmitBtn.disabled = true;
      editSubmitBtn.textContent = pindahKategori ? "Memindahkan di Drive..." : "Menyimpan...";
    }

    try {
      if (pindahKategori && dokLama.driveFileId) {
        const folderTujuanId = await pastikanFolderTujuanKategoriSiap(idEfektifBaru);
        await pindahkanBerkasKeFolderDrive(dokLama.driveFileId, folderTujuanId);
      }

      const db = getFirestoreDb();
      await updateDoc(doc(db, "dokumen", dokLama.id), {
        namaTampilan: namaTampilanBaru,
        kategoriId: idEfektifBaru,
        catatan: catatanBaru,
        kegiatanId: kegiatanIdBaru,
        updatedAt: new Date().toISOString()
      });

      tutupModalEditDokumen(true);
    } catch (err) {
      setPesanGalatModalEdit(formatPesanGalatDrive(err));
    } finally {
      if (editSubmitBtn instanceof HTMLButtonElement) {
        editSubmitBtn.disabled = false;
        editSubmitBtn.textContent = "Simpan Perubahan";
      }
    }
  });
}
