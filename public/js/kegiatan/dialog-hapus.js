/**
 * Modul Dialog Hapus Lunak Kegiatan
 * Menangani konfirmasi pemindahan kegiatan ke Tempat Sampah dan toast pembatalan (Urungkan).
 */
import { stateKegiatan } from "./state.js";
import { formatTanggalTampilan } from "./util.js";
import { hapusLunakKegiatan, pulihkanKegiatan } from "./data.js";
import { tampilkanGalatHalamanKegiatan } from "./render.js";
import { tampilkanToast } from "../sidebar.js";
import { formatPesanGalatFirestore } from "../firebase-config.js";

export function bukaDialogHapusKegiatan(item) {
  const modal = document.getElementById("kegiatan-delete-modal");
  const title = document.getElementById("kegiatan-delete-title");
  const desc = document.getElementById("kegiatan-delete-desc");
  const cancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  if (!modal || !item) return;

  stateKegiatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stateKegiatan.idKegiatanAkanDihapus = item.id;
  if (title) {
    title.textContent = "Pindahkan ke Tempat Sampah?";
  }
  if (desc) {
    desc.textContent = `Kegiatan "${item.judul}" pada ${formatTanggalTampilan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  }

  stateKegiatan.hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

export function tutupDialogHapusKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-delete-modal");
  if (!modal || !stateKegiatan.hapusModalTerbuka) return;
  stateKegiatan.hapusModalTerbuka = false;
  stateKegiatan.idKegiatanAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && stateKegiatan.fokusSebelumModal && document.contains(stateKegiatan.fokusSebelumModal)) {
    stateKegiatan.fokusSebelumModal.focus();
  }
  stateKegiatan.fokusSebelumModal = null;
}

export function inisialisasiDialogHapusKegiatan() {
  const deleteModal = document.getElementById("kegiatan-delete-modal");
  const deleteCancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  const deleteConfirmBtn = document.getElementById("kegiatan-delete-confirm-btn");

  if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", () => tutupDialogHapusKegiatan(true));
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) tutupDialogHapusKegiatan(true);
    });
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
      if (!stateKegiatan.idKegiatanAkanDihapus) return;
      const targetId = stateKegiatan.idKegiatanAkanDihapus;
      deleteConfirmBtn.disabled = true;
      tampilkanGalatHalamanKegiatan("");
      try {
        await hapusLunakKegiatan(targetId);
        tutupDialogHapusKegiatan(false);
        const detailModal = document.getElementById("kegiatan-detail-modal");
        if (detailModal && !detailModal.hidden) {
          detailModal.hidden = true;
        }
        tampilkanToast("Kegiatan dipindahkan ke Tempat Sampah", "info", {
          aksiLabel: "Urungkan",
          aksiOnClick: async () => {
            try {
              await pulihkanKegiatan(targetId);
              tampilkanToast("Kegiatan berhasil dipulihkan", "success");
            } catch (errUrung) {
              tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
            }
          },
          durasiMs: 8000
        });
      } catch (err) {
        tutupDialogHapusKegiatan(false);
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
      } finally {
        deleteConfirmBtn.disabled = false;
      }
    });
  }
}