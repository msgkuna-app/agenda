/**
 * Modul Dialog Unggah Dokumen
 * Menangani pengunggahan berkas baru ke Google Drive (resumable/multipart), progress bar, dan simpan ulang metadata (Fase 7C)
 */
import {
  getFirestoreDb,
  collection,
  addDoc,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import {
  unggahBerkasKeDrive,
  formatPesanGalatDrive
} from "../drive.js";
import { loginWithGoogle, formatPesanGalatAuth } from "../auth.js";
import { stateDokumen } from "./state.js";
import { manajerKategoriDokumen } from "./data.js";
import { pastikanFolderTujuanKategoriSiap } from "./drive-ops.js";
import {
  formatUkuranBerkas,
  infoJenisBerkasMime,
  MAKS_UKURAN_BERKAS_MB
} from "./util.js";
import {
  tampilkanGalatHalamanDokumen,
  perbaruiDropdownKategoriDokumen,
  perbaruiDropdownKegiatanTerkait
} from "./render.js";

/**
 * Menampilkan pesan galat atau peringatan pada dialog unggah dokumen dengan opsi pemulihan.
 * @param {string} pesan
 * @param {{ bisaSimpanUlangMetadata?: boolean, butuhRelogin?: boolean }} [opsi={}]
 */
export function setPesanGalatModalUnggah(pesan, opsi = {}) {
  const box = document.getElementById("dokumen-upload-alert");
  const txt = document.getElementById("dokumen-upload-alert-text");
  if (!box || !txt) return;

  const pembersih = String(pesan || "").trim();
  if (!pembersih) {
    txt.textContent = "";
    box.hidden = true;
    const existingActions = box.querySelector(".upload-alert-action-row");
    if (existingActions) existingActions.remove();
    return;
  }

  txt.textContent = pembersih;
  box.hidden = false;

  let actionRow = box.querySelector(".upload-alert-action-row");
  if (!actionRow) {
    actionRow = document.createElement("div");
    actionRow.className = "upload-alert-action-row";
    box.appendChild(actionRow);
  }
  actionRow.innerHTML = "";

  if (opsi.bisaSimpanUlangMetadata) {
    const btnSimpan = document.createElement("button");
    btnSimpan.type = "button";
    btnSimpan.id = "btn-upload-retry-metadata";
    btnSimpan.className = "btn-primary btn-sm-touch";
    btnSimpan.textContent = "Coba simpan ulang metadata";
    btnSimpan.addEventListener("click", () => {
      jalankanSimpanUlangMetadata();
    });
    actionRow.appendChild(btnSimpan);
  }

  if (opsi.butuhRelogin) {
    const btnLogin = document.createElement("button");
    btnLogin.type = "button";
    btnLogin.id = "btn-upload-relogin";
    btnLogin.className = "btn-primary btn-sm-touch";
    btnLogin.textContent = "Masuk ulang";
    btnLogin.addEventListener("click", async () => {
      btnLogin.disabled = true;
      btnLogin.textContent = "Menghubungkan...";
      try {
        await loginWithGoogle();
        setPesanGalatModalUnggah(
          "Sesi masuk berhasil diperbarui. Silakan lanjutkan pengunggahan atau klik tombol di bawah untuk menyimpan catatan.",
          { bisaSimpanUlangMetadata: Boolean(stateDokumen.berkasDriveTersimpanPending) }
        );
      } catch (errLogin) {
        setPesanGalatModalUnggah(formatPesanGalatAuth(errLogin), { butuhRelogin: true });
      }
    });
    actionRow.appendChild(btnLogin);
  }
}

/**
 * Memperbarui tampilan indikator kemajuan (progress bar) pengunggahan berkas.
 * @param {boolean} sedangBerjalan
 * @param {number} [persen=0]
 * @param {string} [labelStatus=""]
 * @param {Object|null} [infoDetail=null]
 */
export function perbaruiTampilanProgresUnggah(
  sedangBerjalan,
  persen = 0,
  labelStatus = "",
  infoDetail = null
) {
  const wrap = document.getElementById("dokumen-upload-progress-wrap");
  const barFill = document.getElementById("dokumen-upload-progress-fill");
  const pctEl = document.getElementById("dokumen-upload-progress-pct");
  const textEl = document.getElementById("dokumen-upload-progress-label");
  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  const fileInput = document.getElementById("dokumen-upload-file");

  if (wrap) wrap.hidden = !sedangBerjalan;
  if (barFill instanceof HTMLElement) barFill.style.width = `${Math.max(0, Math.min(100, persen))}%`;
  if (pctEl) pctEl.textContent = `${Math.max(0, Math.min(100, persen))}%`;

  let teks = labelStatus || "Mengunggah ke Google Drive...";
  if (infoDetail) {
    if (infoDetail.sedangRetry) {
      teks = infoDetail.statusTeks || "Mencoba menyambung ulang ke Google Drive...";
    } else if (infoDetail.sisaDetik && infoDetail.sisaDetik > 0 && persen < 100) {
      const sisa = infoDetail.sisaDetik;
      let sisaTeks = "";
      if (sisa < 60) {
        sisaTeks = `~${Math.ceil(sisa)} dtk`;
      } else {
        const m = Math.floor(sisa / 60);
        const s = Math.round(sisa % 60);
        sisaTeks = `~${m} mnt ${s > 0 ? `${s} dtk` : ""}`.trim();
      }
      teks = `${labelStatus || "Mengunggah ke Google Drive..."} (sisa ${sisaTeks})`;
    }
  }

  if (textEl) textEl.textContent = teks;
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.disabled = sedangBerjalan || !navigator.onLine;
  }
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = sedangBerjalan;
}

/**
 * Menyimpan ulang catatan metadata dokumen ke Firestore jika sebelumnya gagal setelah berkas terunggah di Drive.
 */
export async function jalankanSimpanUlangMetadata() {
  if (!stateDokumen.berkasDriveTersimpanPending || !stateDokumen.dataFormUploadPending) return;
  if (stateDokumen.sedangMenyimpanMetadata) return;

  stateDokumen.sedangMenyimpanMetadata = true;
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(true, 100, "Menyimpan catatan dokumen ke basis data...");

  const cancelBtn = document.getElementById("dokumen-upload-cancel-btn");
  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  if (cancelBtn) cancelBtn.textContent = "Batal";
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Menyimpan Catatan...";
  }

  try {
    const sekarangIso = new Date().toISOString();
    const db = getFirestoreDb();
    await addDoc(collection(db, "dokumen"), {
      ...stateDokumen.dataFormUploadPending,
      tanggalUnggah: sekarangIso,
      createdAt: sekarangIso,
      updatedAt: sekarangIso
    });

    stateDokumen.berkasDriveTersimpanPending = null;
    stateDokumen.dataFormUploadPending = null;
    tutupModalUnggahDokumen(true);
  } catch (errFirestore) {
    perbaruiTampilanProgresUnggah(false, 100, "");
    const pesanGalat = formatPesanGalatFirestore(errFirestore);
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Coba Simpan Ulang Metadata";
    }
    setPesanGalatModalUnggah(
      `Berkas telah berhasil diunggah ke Google Drive (${stateDokumen.berkasDriveTersimpanPending.name || "Dokumen"}), namun gagal menyimpan catatan dokumen ke basis data: ${pesanGalat}. Silakan periksa koneksi lalu klik tombol di bawah untuk menyimpan ulang catatan tanpa mengunggah kembali berkas.`,
      { bisaSimpanUlangMetadata: true }
    );
  } finally {
    stateDokumen.sedangMenyimpanMetadata = false;
  }
}

/**
 * Membuka modal pengunggahan dokumen ke Google Drive.
 */
export function bukaModalUnggahDokumen() {
  if (!navigator.onLine) {
    tampilkanGalatHalamanDokumen(
      "Tidak ada koneksi internet. Pengunggahan dokumen ke Google Drive memerlukan sambungan internet aktif.",
      "warning"
    );
    return;
  }

  const modal = document.getElementById("dokumen-upload-modal");
  const form = document.getElementById("dokumen-upload-form");
  const katSelect = document.getElementById("dokumen-upload-kategori");
  const fileInput = document.getElementById("dokumen-upload-file");
  const fileInfo = document.getElementById("dokumen-upload-file-info");
  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  if (!modal) return;

  stateDokumen.fokusSebelumModalDokumen =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (form instanceof HTMLFormElement) form.reset();
  if (fileInfo) fileInfo.textContent = "Pilih berkas dari perangkat Anda.";
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  stateDokumen.berkasDriveTersimpanPending = null;
  stateDokumen.dataFormUploadPending = null;
  stateDokumen.sedangMenyimpanMetadata = false;

  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = "Unggah ke Drive";
    submitBtn.disabled = !navigator.onLine;
  }

  perbaruiDropdownKategoriDokumen();
  perbaruiDropdownKegiatanTerkait("dokumen-upload-kegiatan", "");

  if (katSelect instanceof HTMLSelectElement) {
    const daftarKat = manajerKategoriDokumen.getDaftarKategori();
    if (stateDokumen.filterKategoriId === "__TANPA_KATEGORI__") {
      katSelect.value = "";
    } else if (
      stateDokumen.filterKategoriId !== "ALL" &&
      daftarKat.some((k) => k.id === stateDokumen.filterKategoriId)
    ) {
      katSelect.value = stateDokumen.filterKategoriId;
    } else {
      katSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
    }
  }

  stateDokumen.unggahModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (fileInput instanceof HTMLElement) fileInput.focus();
  });
}

/**
 * Menutup modal pengunggahan dokumen.
 * @param {boolean} [kembalikanFokus=true]
 */
export function tutupModalUnggahDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-upload-modal");
  if (!modal || !stateDokumen.unggahModalTerbuka) return;

  if (stateDokumen.pengendaliUnggahAktif) {
    stateDokumen.pengendaliUnggahAktif.abort();
    stateDokumen.pengendaliUnggahAktif = null;
  }

  stateDokumen.berkasDriveTersimpanPending = null;
  stateDokumen.dataFormUploadPending = null;
  stateDokumen.sedangMenyimpanMetadata = false;

  stateDokumen.unggahModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = "Unggah ke Drive";
    submitBtn.disabled = !navigator.onLine;
  }

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
 * Menginisialisasi pendengar event untuk modal unggah dokumen.
 */
export function inisialisasiDialogUnggah() {
  const uploadModal = document.getElementById("dokumen-upload-modal");
  const uploadForm = document.getElementById("dokumen-upload-form");
  const uploadFileInput = document.getElementById("dokumen-upload-file");
  const uploadFileInfo = document.getElementById("dokumen-upload-file-info");

  if (uploadFileInput instanceof HTMLInputElement && uploadFileInfo) {
    uploadFileInput.addEventListener("change", () => {
      const f = uploadFileInput.files && uploadFileInput.files[0];
      if (!f) {
        uploadFileInfo.textContent = "Pilih berkas dari perangkat Anda.";
        return;
      }

      const batasBytes = MAKS_UKURAN_BERKAS_MB * 1024 * 1024;
      if (f.size > batasBytes) {
        const ukuranTeks = formatUkuranBerkas(f.size);
        setPesanGalatModalUnggah(
          `Ukuran berkas (${ukuranTeks}) melebihi batas maksimum ${MAKS_UKURAN_BERKAS_MB} MB. Silakan pilih berkas yang lebih kecil.`
        );
        uploadFileInput.value = "";
        uploadFileInfo.textContent = "Pilih berkas dari perangkat Anda.";
        return;
      }

      setPesanGalatModalUnggah("");
      const jenisInfo = infoJenisBerkasMime(f.type, f.name);
      uploadFileInfo.textContent = `${f.name} • ${formatUkuranBerkas(f.size)} (${jenisInfo.label})`;
    });
  }

  document.getElementById("dokumen-upload-close-btn")?.addEventListener("click", () => {
    tutupModalUnggahDokumen(true);
  });
  document.getElementById("dokumen-upload-cancel-btn")?.addEventListener("click", () => {
    if (stateDokumen.pengendaliUnggahAktif) {
      stateDokumen.pengendaliUnggahAktif.abort();
      stateDokumen.pengendaliUnggahAktif = null;
      perbaruiTampilanProgresUnggah(false, 0, "");
      setPesanGalatModalUnggah("Pengunggahan dibatalkan.");
      const submitBtn = document.getElementById("dokumen-upload-submit-btn");
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = !navigator.onLine;
        submitBtn.textContent = "Unggah ke Drive";
      }
      return;
    }
    tutupModalUnggahDokumen(true);
  });
  uploadModal?.addEventListener("click", (e) => {
    if (e.target === uploadModal && !stateDokumen.pengendaliUnggahAktif) {
      tutupModalUnggahDokumen(true);
    }
  });

  uploadForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPesanGalatModalUnggah("");

    if (stateDokumen.berkasDriveTersimpanPending && stateDokumen.dataFormUploadPending) {
      await jalankanSimpanUlangMetadata();
      return;
    }

    if (!navigator.onLine) {
      setPesanGalatModalUnggah("Tidak ada koneksi internet. Pengunggahan ke Google Drive memerlukan sambungan aktif.");
      return;
    }

    const file =
      uploadFileInput instanceof HTMLInputElement && uploadFileInput.files
        ? uploadFileInput.files[0]
        : null;
    if (!file) {
      setPesanGalatModalUnggah("Pilih berkas dokumen yang akan diunggah terlebih dahulu.");
      return;
    }

    const batasBytes = MAKS_UKURAN_BERKAS_MB * 1024 * 1024;
    if (file.size > batasBytes) {
      setPesanGalatModalUnggah(
        `Ukuran berkas (${formatUkuranBerkas(file.size)}) melebihi batas maksimum ${MAKS_UKURAN_BERKAS_MB} MB. Silakan pilih berkas yang lebih kecil.`
      );
      return;
    }

    const kategoriId = String(document.getElementById("dokumen-upload-kategori")?.value || "").trim();
    const namaTampilanInput = String(document.getElementById("dokumen-upload-nama")?.value || "").trim();
    const catatan = String(document.getElementById("dokumen-upload-catatan")?.value || "").trim();
    const kegiatanId = String(document.getElementById("dokumen-upload-kegiatan")?.value || "").trim();
    const cancelBtn = document.getElementById("dokumen-upload-cancel-btn");
    const submitBtn = document.getElementById("dokumen-upload-submit-btn");

    const namaFileTampil = file.name;
    const ukuranFileTampil = formatUkuranBerkas(file.size);

    perbaruiTampilanProgresUnggah(
      true,
      0,
      `Menyiapkan folder kategori di Google Drive... (${namaFileTampil} • ${ukuranFileTampil})`
    );
    if (cancelBtn) cancelBtn.textContent = "Batalkan Unggah";
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

    try {
      const folderTujuanId = await pastikanFolderTujuanKategoriSiap(kategoriId);

      perbaruiTampilanProgresUnggah(
        true,
        1,
        `Mengunggah ${namaFileTampil} (${ukuranFileTampil})...`
      );

      const tugasUnggah = unggahBerkasKeDrive({
        file,
        folderId: folderTujuanId,
        namaSimpanDrive: file.name,
        onProgress: (persen, terunggah, _total, infoDetail) => {
          let label = `Mengunggah ${namaFileTampil} (${formatUkuranBerkas(terunggah)} / ${ukuranFileTampil})...`;
          if (infoDetail?.sedangRetry) {
            label = infoDetail.statusTeks || "Mencoba menyambung ulang ke Google Drive...";
          }
          perbaruiTampilanProgresUnggah(true, persen, label, infoDetail);
        }
      });
      stateDokumen.pengendaliUnggahAktif = tugasUnggah;

      const hasilDrive = await tugasUnggah.promise;
      stateDokumen.pengendaliUnggahAktif = null;

      stateDokumen.berkasDriveTersimpanPending = hasilDrive;
      stateDokumen.dataFormUploadPending = {
        namaTampilan: namaTampilanInput || hasilDrive.name || file.name,
        namaFile: hasilDrive.name || file.name,
        driveFileId: hasilDrive.id,
        tautan: hasilDrive.webViewLink,
        mimeType: hasilDrive.mimeType || file.type || "application/octet-stream",
        ukuran: Number.isFinite(Number(hasilDrive.size)) ? Number(hasilDrive.size) : file.size,
        kategoriId,
        kegiatanId,
        catatan
      };

      await jalankanSimpanUlangMetadata();
    } catch (err) {
      stateDokumen.pengendaliUnggahAktif = null;
      perbaruiTampilanProgresUnggah(false, 0, "");
      if (cancelBtn) cancelBtn.textContent = "Batal";
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = !navigator.onLine;
        submitBtn.textContent = "Unggah ke Drive";
      }

      if (err && err.isAborted) {
        setPesanGalatModalUnggah("Pengunggahan dokumen telah dibatalkan.");
      } else {
        const is401 = Boolean(
          err && (err.isTokenExpired || err.isUnauthorized || err.status === 401)
        );
        setPesanGalatModalUnggah(formatPesanGalatDrive(err), { butuhRelogin: is401 });
      }
    }
  });
}
