/**
 * Modul Dialog Hapus Catatan (Fase 7C)
 * Menangani modal konfirmasi pemindahan ke Tempat Sampah untuk catatan singkat dan catatan Google Docs (termasuk opsi hapus di Drive).
 */
import { formatPesanGalatFirestore } from "../firebase-config.js";
import { tampilkanToast } from "../sidebar.js";
import { pindahkanItemKeSampahDrive, formatPesanGalatDrive } from "../drive.js";
import { formatTanggalCatatan, adalahGalatToken } from "./util.js";
import { stateCatatan } from "./state.js";
import { hapusLunakCatatan, pulihkanCatatan } from "./data.js";
import { tampilkanNotifikasiCatatan } from "./render.js";

export function bukaDialogHapusSingkat(item) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  const title = modal?.querySelector(".modal-title");
  const desc = document.getElementById("catatan-singkat-delete-desc");
  const cancelBtn = document.getElementById("catatan-singkat-delete-cancel-btn");
  if (!modal || !item) return;

  stateCatatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stateCatatan.idCatatanSingkatHapus = item.id;
  if (title) title.textContent = "Pindahkan ke Tempat Sampah?";
  if (desc) desc.textContent = `Catatan singkat "${item.judul}" pada ${formatTanggalCatatan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  stateCatatan.hapusSingkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

export function tutupDialogHapusSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  if (!modal || !stateCatatan.hapusSingkatModalTerbuka) return;
  stateCatatan.hapusSingkatModalTerbuka = false;
  stateCatatan.idCatatanSingkatHapus = null;
  modal.hidden = true;
  if (kembalikanFokus && stateCatatan.fokusSebelumModal && document.contains(stateCatatan.fokusSebelumModal)) {
    stateCatatan.fokusSebelumModal.focus();
  }
  stateCatatan.fokusSebelumModal = null;
}

export async function tanganiKonfirmasiHapusSingkat(e) {
  if (!stateCatatan.idCatatanSingkatHapus) return;
  const targetId = stateCatatan.idCatatanSingkatHapus;
  const btn = e.currentTarget;
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    await hapusLunakCatatan(targetId, false);
    tutupDialogHapusSingkat(false);
    tampilkanToast("Catatan dipindahkan ke Tempat Sampah", "info", {
      aksiLabel: "Urungkan",
      aksiOnClick: async () => {
        try {
          await pulihkanCatatan(targetId);
          tampilkanToast("Catatan berhasil dipulihkan", "success");
        } catch (errUrung) {
          tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
        }
      },
      durasiMs: 8000
    });
  } catch (err) {
    tutupDialogHapusSingkat(false);
    tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

export function setGalatHapusGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-delete-alert");
  const txt = document.getElementById("catatan-gdoc-delete-alert-text");
  const btn = document.getElementById("catatan-gdoc-delete-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

export function bukaDialogHapusGdoc(item) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  const desc = document.getElementById("catatan-gdoc-delete-desc");
  const radioApp = document.getElementById("catatan-gdoc-delete-mode-app");
  const radioDrive = document.getElementById("catatan-gdoc-delete-mode-drive");
  const cancelBtn = document.getElementById("catatan-gdoc-delete-cancel-btn");
  if (!modal || !item) return;

  stateCatatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  stateCatatan.itemCatatanGdocHapus = item;
  setGalatHapusGdoc("", false);
  if (radioApp instanceof HTMLInputElement) radioApp.checked = true;
  if (radioDrive instanceof HTMLInputElement) radioDrive.disabled = !navigator.onLine;
  if (desc) desc.textContent = `Konfirmasi penghapusan catatan Google Docs "${item.judul}" (${formatTanggalCatatan(item.tanggal)}):`;
  stateCatatan.hapusGdocModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

export function tutupDialogHapusGdoc(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  if (!modal || !stateCatatan.hapusGdocModalTerbuka) return;
  stateCatatan.hapusGdocModalTerbuka = false;
  stateCatatan.itemCatatanGdocHapus = null;
  modal.hidden = true;
  setGalatHapusGdoc("", false);
  if (kembalikanFokus && stateCatatan.fokusSebelumModal && document.contains(stateCatatan.fokusSebelumModal)) {
    stateCatatan.fokusSebelumModal.focus();
  }
  stateCatatan.fokusSebelumModal = null;
}

export async function tanganiKonfirmasiHapusGdoc(e) {
  if (!stateCatatan.itemCatatanGdocHapus) return;
  const target = stateCatatan.itemCatatanGdocHapus;
  const hapusDiDrive = Boolean(document.getElementById("catatan-gdoc-delete-mode-drive")?.checked);
  const btn = e.currentTarget;
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  setGalatHapusGdoc("", false);
  try {
    if (hapusDiDrive && target.docId) {
      if (!navigator.onLine) {
        throw new Error("Tidak ada koneksi internet untuk memindahkan dokumen ke Sampah Drive. Pilih \"Hapus dari aplikasi saja\" atau sambungkan internet.");
      }
      try {
        await pindahkanItemKeSampahDrive(target.docId);
      } catch (driveErr) {
        if (!driveErr || !driveErr.isNotFound) throw driveErr;
      }
    }
    await hapusLunakCatatan(target.id, hapusDiDrive);
    tutupDialogHapusGdoc(false);
    tampilkanToast("Catatan Google Docs dipindahkan ke Tempat Sampah", "info", {
      aksiLabel: "Urungkan",
      aksiOnClick: async () => {
        try {
          const hasil = await pulihkanCatatan(target.id);
          if (hasil && hasil.pesanDrive) {
            tampilkanToast(`Catatan dipulihkan. ${hasil.pesanDrive}`, "warning");
          } else {
            tampilkanToast("Catatan berhasil dipulihkan", "success");
          }
        } catch (errUrung) {
          tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
        }
      },
      durasiMs: 8000
    });
  } catch (err) {
    setGalatHapusGdoc(formatPesanGalatDrive(err), adalahGalatToken(err));
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}