/**
 * Pengendali (Controller) Modul Dokumen (Tahap 3d: dipisah dari dokumen.js)
 * Menangani aksi pengguna: unggah ke Drive, ubah metadata, hapus, rapikan folder,
 * kelola kategori dokumen, serta sinkron folder dari halaman Pengaturan.
 * Render daftar didelegasikan ke view.js; data ke state.js.
 */
import {
  MAKS_UKURAN_BERKAS_MB,
  JEDA_RAPIKAN_MS,
  KOLEKSI,
} from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  formatPesanGalatFirestore,
} from "../../services/firestoreService.js";
import {
  buatSubfolderKategoriDrive,
  pastikanFolderTanpaKategoriDrive,
  gantiNamaFolderDrive,
  ambilMetadataItemDrive,
  pindahkanItemKeSampahDrive,
  pindahkanBerkasKeFolderDrive,
  unggahBerkasKeDrive,
  formatPesanGalatDrive,
} from "../../services/driveService.js";
import { loginWithGoogle, formatPesanGalatAuth } from "../../services/authService.js";
import { inisialisasiDialogKelolaKategori } from "../../kategori.js";
import { onPerubahanKegiatan } from "../../modules/kegiatan/index.js";
import { pindahKeBagian } from "../../sidebar.js";
import {
  manajerKategoriDokumen,
  getDaftarDokumen,
  onPerubahanDokumen,
  hapusDokumenDariPeta,
  beritahuPerubahanDokumen,
  hitungDokumenPemakaiServer,
  muatLebihBanyakDokumen,
  langgananDokumen,
  lepasLanggananDokumen,
  setKursorTambahan,
  setSedangMemuatLebihDokumen,
  setAdaLebihBanyakDokumen,
  tandaiDokumenSudahDimuat,
} from "./state.js";
import {
  setKataKunciCari,
  getFilterKategoriId,
  setFilterKategoriId,
  setUrutBerdasarkan,
  setArahUrutan,
  resetBatasTampil,
  tambahBatasTampil,
  pasangFilterDokumen,
  tutupPanelFilterDokumen,
  tampilkanGalatHalamanDokumen,
  pastikanKerangkaHalamanDokumen,
  perbaruiDropdownKategoriDokumen,
  perbaruiDropdownKegiatanTerkait,
  renderDaftarDokumen,
  perbaruiStatusJaringanDokumen,
  setUnggahSedangBerjalan,
} from "./view.js";
import { formatUkuranBerkas, infoJenisBerkasMime } from "./format.js";

// --- State lokal controller --------------------------------------------------

let sudahDiikat = false;
let dialogKelolaKategoriDokCtrl = null;
let idMenuTitikTigaTerbuka = null;

// State modal Unggah Dokumen
let unggahModalTerbuka = false;
let pengendaliUnggahAktif = null;
let fokusSebelumModalDokumen = null;
let berkasDriveTersimpanPending = null;
let dataFormUploadPending = null;
let sedangMenyimpanMetadata = false;

// State modal Ubah Metadata Dokumen
let editModalTerbuka = false;

// State modal Hapus Dokumen
let hapusModalTerbuka = false;
let dokumenAkanDihapus = null;

// State modal Rapikan Dokumen ke Folder Kategori
let rapikanModalTerbuka = false;
let sedangMerapikan = false;
let batalkanRapikan = false;

// --- Sinkron folder kategori (dipanggil halaman Pengaturan) ------------------

export async function sinkronkanSatuFolderKategoriDokumen(kategoriId) {
  const kat = manajerKategoriDokumen.ambilKategoriById(kategoriId);
  if (!kat) {
    throw new Error("Kategori dokumen tidak ditemukan.");
  }

  if (!kat.folderId) {
    const dibuat = await buatSubfolderKategoriDrive(kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: dibuat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Subfolder baru dibuat dan disinkronkan" };
  }

  try {
    await gantiNamaFolderDrive(kat.folderId, kat.nama);
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderId: kat.folderId,
      folderSinkron: true
    });
    return { nama: kat.nama, pesan: "Nama folder disinkronkan" };
  } catch (err) {
    if (err && err.isNotFound) {
      const dibuatUlang = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuatUlang.folderId,
        folderSinkron: true
      });
      return { nama: kat.nama, pesan: "Folder lama tidak ditemukan (404), dibuat ulang" };
    }
    await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
      folderSinkron: false
    });
    throw new Error(formatPesanGalatDrive(err));
  }
}

// --- Folder tujuan unggah ----------------------------------------------------

async function pastikanFolderTujuanKategoriSiap(kategoriId) {
  const idBersih = String(kategoriId || "").trim();
  const kat = idBersih ? manajerKategoriDokumen.ambilKategoriById(idBersih) : null;

  if (!kat) {
    return pastikanFolderTanpaKategoriDrive();
  }

  if (kat.folderId) {
    try {
      const meta = await ambilMetadataItemDrive(kat.folderId);
      if (meta && !meta.trashed) {
        if (!kat.folderSinkron) {
          await gantiNamaFolderDrive(kat.folderId, kat.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
            folderId: kat.folderId,
            folderSinkron: true
          });
        }
        return kat.folderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
    }
  }

  const dibuat = await buatSubfolderKategoriDrive(kat.nama);
  await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
    folderId: dibuat.folderId,
    folderSinkron: true
  });
  return dibuat.folderId;
}

function buatOpsiDriveKategoriDokumen() {
  return {
    onSetelahTambahKategori: async (katBaru) => {
      try {
        const dibuat = await buatSubfolderKategoriDrive(katBaru.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(katBaru.id, {
          folderId: "",
          folderSinkron: false
        });
        return {
          peringatan: `Kategori "${katBaru.nama}" tersimpan, tetapi folder Google Drive belum dapat dibuat (${formatPesanGalatDrive(err)}). Folder akan dibuat otomatis saat dibutuhkan atau lewat tombol "Sinkronkan folder".`
        };
      }
    },

    onSetelahUbahNamaKategori: async (hasilUbah) => {
      const katTerkini = manajerKategoriDokumen.ambilKategoriById(hasilUbah.id) || hasilUbah.sebelumnya;
      const folderIdLama = String(katTerkini?.folderId || "").trim();

      if (!folderIdLama) {
        try {
          const dibuat = await buatSubfolderKategoriDrive(hasilUbah.nama);
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderId: dibuat.folderId,
            folderSinkron: true
          });
          return {};
        } catch (err) {
          await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
            folderSinkron: false
          });
          return {
            peringatan: `Nama kategori diperbarui di aplikasi, namun pembuatan folder Google Drive gagal: ${formatPesanGalatDrive(err)}`
          };
        }
      }

      try {
        await gantiNamaFolderDrive(folderIdLama, hasilUbah.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderId: folderIdLama,
          folderSinkron: true
        });
        return {};
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(hasilUbah.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            peringatan: `Folder Google Drive untuk "${hasilUbah.nama}" tidak ditemukan (404). Gunakan pilihan di bawah untuk membuat ulang folder.`
          };
        }
        return {
          peringatan: `Nama kategori tersimpan, tetapi gagal mengganti nama folder di Google Drive: ${formatPesanGalatDrive(err)}`
        };
      }
    },

    onSinkronkanFolder: async (kat) => {
      const segar = manajerKategoriDokumen.ambilKategoriById(kat.id) || kat;
      if (!segar.folderId) {
        const dibuat = await buatSubfolderKategoriDrive(segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: dibuat.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Subfolder Drive untuk kategori "${segar.nama}" berhasil dibuat dan disinkronkan.` };
      }

      try {
        await gantiNamaFolderDrive(segar.folderId, segar.nama);
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderId: segar.folderId,
          folderSinkron: true
        });
        return { pesanSukses: `Nama folder Drive untuk kategori "${segar.nama}" berhasil disinkronkan.` };
      } catch (err) {
        await manajerKategoriDokumen.perbaruiStatusFolderKategori(segar.id, {
          folderSinkron: false
        });
        if (err && err.isNotFound) {
          return {
            folder404: true,
            pesanGalat: `Folder lama tidak ditemukan di Google Drive (404). Anda dapat membuat ulang folder kategori "${segar.nama}".`
          };
        }
        throw new Error(formatPesanGalatDrive(err));
      }
    },

    onBuatUlangFolderDanPindahkan: async (kat) => {
      const dibuat = await buatSubfolderKategoriDrive(kat.nama);
      await manajerKategoriDokumen.perbaruiStatusFolderKategori(kat.id, {
        folderId: dibuat.folderId,
        folderSinkron: true
      });

      const dokKategoriIni = getDaftarDokumen().filter(
        (d) => String(d.kategoriId || "").trim() === kat.id && d.driveFileId
      );
      let dipindah = 0;
      let gagal = 0;

      for (const dok of dokKategoriIni) {
        try {
          await pindahkanBerkasKeFolderDrive(dok.driveFileId, dibuat.folderId);
          dipindah += 1;
        } catch (_e) {
          gagal += 1;
        }
      }

      if (dokKategoriIni.length === 0) {
        return { pesanSukses: `Folder baru untuk kategori "${kat.nama}" berhasil dibuat di Google Drive.` };
      }
      return {
        pesanSukses:
          gagal === 0
            ? `Folder kategori "${kat.nama}" dibuat ulang dan ${dipindah} dokumen dipindahkan ke dalamnya.`
            : `Folder "${kat.nama}" dibuat ulang (${dipindah} dokumen dipindahkan, ${gagal} dokumen tidak dapat dipindahkan).`
      };
    },

    onBuangFolderBekasKeSampah: async (infoFolder) => {
      await pindahkanItemKeSampahDrive(infoFolder.folderId);
    }
  };
}

// --- Modal unggah ------------------------------------------------------------

function setPesanGalatModalUnggah(pesan, opsi = {}) {
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
          { bisaSimpanUlangMetadata: Boolean(berkasDriveTersimpanPending) }
        );
      } catch (errLogin) {
        setPesanGalatModalUnggah(formatPesanGalatAuth(errLogin), { butuhRelogin: true });
      }
    });
    actionRow.appendChild(btnLogin);
  }
}

function perbaruiTampilanProgresUnggah(sedangBerjalan, persen = 0, labelStatus = "", infoDetail = null) {
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

async function jalankanSimpanUlangMetadata() {
  if (!berkasDriveTersimpanPending || !dataFormUploadPending) return;
  if (sedangMenyimpanMetadata) return;

  sedangMenyimpanMetadata = true;
  // Unggahan Drive sudah selesai; tombol submit kembali mengikuti status jaringan.
  setUnggahSedangBerjalan(false);
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
    await addDoc(collection(db, KOLEKSI.DOKUMEN), {
      ...dataFormUploadPending,
      tanggalUnggah: sekarangIso,
      createdAt: sekarangIso,
      updatedAt: sekarangIso
    });

    berkasDriveTersimpanPending = null;
    dataFormUploadPending = null;
    tutupModalUnggahDokumen(true);
  } catch (errFirestore) {
    perbaruiTampilanProgresUnggah(false, 100, "");
    const pesanGalat = formatPesanGalatFirestore(errFirestore);
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Coba Simpan Ulang Metadata";
    }
    setPesanGalatModalUnggah(
      `Berkas telah berhasil diunggah ke Google Drive (${berkasDriveTersimpanPending.name || "Dokumen"}), namun gagal menyimpan catatan dokumen ke basis data: ${pesanGalat}. Silakan periksa koneksi lalu klik tombol di bawah untuk menyimpan ulang catatan tanpa mengunggah kembali berkas.`,
      { bisaSimpanUlangMetadata: true }
    );
  } finally {
    sedangMenyimpanMetadata = false;
  }
}

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

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (form instanceof HTMLFormElement) form.reset();
  if (fileInfo) fileInfo.textContent = "Pilih berkas dari perangkat Anda.";
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  berkasDriveTersimpanPending = null;
  dataFormUploadPending = null;
  sedangMenyimpanMetadata = false;

  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = "Unggah ke Drive";
    submitBtn.disabled = !navigator.onLine;
  }

  perbaruiDropdownKategoriDokumen();
  perbaruiDropdownKegiatanTerkait("dokumen-upload-kegiatan", "");

  const filterKategoriId = getFilterKategoriId();
  if (katSelect instanceof HTMLSelectElement) {
    const daftarKat = manajerKategoriDokumen.getDaftarKategori();
    if (filterKategoriId === "__TANPA_KATEGORI__") {
      katSelect.value = "";
    } else if (filterKategoriId !== "ALL" && daftarKat.some((k) => k.id === filterKategoriId)) {
      katSelect.value = filterKategoriId;
    } else {
      katSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
    }
  }

  unggahModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (fileInput instanceof HTMLElement) fileInput.focus();
  });
}

function tutupModalUnggahDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-upload-modal");
  if (!modal || !unggahModalTerbuka) return;

  if (pengendaliUnggahAktif) {
    pengendaliUnggahAktif.abort();
    pengendaliUnggahAktif = null;
  }

  berkasDriveTersimpanPending = null;
  dataFormUploadPending = null;
  sedangMenyimpanMetadata = false;

  unggahModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalUnggah("");
  perbaruiTampilanProgresUnggah(false, 0, "");

  const submitBtn = document.getElementById("dokumen-upload-submit-btn");
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = "Unggah ke Drive";
    submitBtn.disabled = !navigator.onLine;
  }

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// --- Modal ubah metadata -----------------------------------------------------

function setPesanGalatModalEdit(pesan) {
  const box = document.getElementById("dokumen-edit-alert");
  const txt = document.getElementById("dokumen-edit-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function bukaModalEditDokumen(item) {
  const modal = document.getElementById("dokumen-edit-modal");
  const idInput = document.getElementById("dokumen-edit-id");
  const namaInput = document.getElementById("dokumen-edit-nama");
  const fileAsliEl = document.getElementById("dokumen-edit-namafile-info");
  const katSelect = document.getElementById("dokumen-edit-kategori");
  const catatanInput = document.getElementById("dokumen-edit-catatan");
  if (!modal || !item) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

  editModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (namaInput instanceof HTMLElement) namaInput.focus();
  });
}

function tutupModalEditDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-edit-modal");
  if (!modal || !editModalTerbuka) return;
  editModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatModalEdit("");

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// --- Modal hapus -------------------------------------------------------------

function setPesanGalatModalHapus(pesan) {
  const box = document.getElementById("dokumen-delete-alert");
  const txt = document.getElementById("dokumen-delete-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function bukaDialogHapusDokumen(item) {
  const modal = document.getElementById("dokumen-delete-modal");
  const desc = document.getElementById("dokumen-delete-desc");
  const radioAppOnly = document.getElementById("dokumen-delete-mode-app");
  const radioDrive = document.getElementById("dokumen-delete-mode-drive");
  const cancelBtn = document.getElementById("dokumen-delete-cancel-btn");
  if (!modal || !item) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dokumenAkanDihapus = item;
  setPesanGalatModalHapus("");

  const label = item.namaTampilan || item.namaFile || "dokumen ini";
  if (desc) {
    desc.textContent = `Pilih cara menghapus "${label}" (${formatUkuranBerkas(item.ukuran)}):`;
  }
  if (radioAppOnly instanceof HTMLInputElement) {
    radioAppOnly.checked = true;
  }
  if (radioDrive instanceof HTMLInputElement) {
    radioDrive.disabled = !navigator.onLine;
  }

  hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-delete-modal");
  if (!modal || !hapusModalTerbuka) return;
  hapusModalTerbuka = false;
  dokumenAkanDihapus = null;
  modal.hidden = true;
  setPesanGalatModalHapus("");

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

// --- Menu titik tiga ---------------------------------------------------------

function tutupMenuTitikTigaDokumen() {
  if (!idMenuTitikTigaTerbuka) return;
  idMenuTitikTigaTerbuka = null;
  document.querySelectorAll(".doc-kebab-popover:not([hidden])").forEach((el) => {
    el.setAttribute("hidden", "");
  });
  document.querySelectorAll(".doc-kebab-btn[aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

// --- Modal rapikan -----------------------------------------------------------

function jedaMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bukaModalRapikanDokumen() {
  const modal = document.getElementById("dokumen-organize-modal");
  const countInfo = document.getElementById("dokumen-organize-total-info");
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const closeBtn = document.getElementById("dokumen-organize-cancel-btn");
  if (!modal) return;

  fokusSebelumModalDokumen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sedangMerapikan = false;
  batalkanRapikan = false;

  const total = getDaftarDokumen().length;
  if (countInfo) {
    countInfo.textContent = `Terdapat ${total} dokumen tercatat yang akan diperiksa penempatan foldernya.`;
  }
  if (progressBox) progressBox.hidden = true;
  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }
  if (alertBox) alertBox.hidden = true;
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.hidden = false;
    startBtn.disabled = total === 0 || !navigator.onLine;
    startBtn.textContent = "Mulai Rapikan";
  }
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.textContent = "Tutup";
  }

  rapikanModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (startBtn && !startBtn.disabled) startBtn.focus();
    else if (closeBtn instanceof HTMLElement) closeBtn.focus();
  });
}

function tutupModalRapikanDokumen(kembalikanFokus = true) {
  const modal = document.getElementById("dokumen-organize-modal");
  if (!modal || !rapikanModalTerbuka) return;
  if (sedangMerapikan) {
    batalkanRapikan = true;
    return;
  }
  rapikanModalTerbuka = false;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalDokumen && document.contains(fokusSebelumModalDokumen)) {
    fokusSebelumModalDokumen.focus();
  }
  fokusSebelumModalDokumen = null;
}

async function jalankanRapikanDokumenKeFolder() {
  if (sedangMerapikan) return;
  const progressBox = document.getElementById("dokumen-organize-progress-box");
  const progressFill = document.getElementById("dokumen-organize-progress-fill");
  const progressText = document.getElementById("dokumen-organize-progress-text");
  const summaryBox = document.getElementById("dokumen-organize-summary-box");
  const alertBox = document.getElementById("dokumen-organize-alert");
  const alertText = document.getElementById("dokumen-organize-alert-text");
  const startBtn = document.getElementById("dokumen-organize-start-btn");
  const cancelBtn = document.getElementById("dokumen-organize-cancel-btn");

  const daftar = getDaftarDokumen();
  const total = daftar.length;
  if (total === 0) return;

  sedangMerapikan = true;
  batalkanRapikan = false;

  if (alertBox) alertBox.hidden = true;
  if (summaryBox) summaryBox.hidden = true;
  if (progressBox) progressBox.hidden = false;
  if (startBtn instanceof HTMLButtonElement) startBtn.disabled = true;
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.textContent = "Hentikan";

  const cacheFolderTujuan = new Map();
  let berhasilDipindah = 0;
  let dilewatiSudahSesuai = 0;
  let gagalDipindah = 0;
  let pesanGagalTerakhir = "";

  try {
    for (let i = 0; i < total; i += 1) {
      if (batalkanRapikan) break;

      const ke = i + 1;
      const persen = Math.round((ke / total) * 100);
      if (progressFill instanceof HTMLElement) progressFill.style.width = `${persen}%`;
      if (progressText) progressText.textContent = `${ke} dari ${total}`;

      const dok = daftar[i];
      if (!dok.driveFileId) {
        gagalDipindah += 1;
        continue;
      }

      const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
      const kunciFolder = infoKat.tetap ? "__TANPA_KATEGORI__" : infoKat.id;

      try {
        let folderTujuanId = cacheFolderTujuan.get(kunciFolder);
        if (!folderTujuanId) {
          folderTujuanId = await pastikanFolderTujuanKategoriSiap(infoKat.tetap ? "" : infoKat.id);
          cacheFolderTujuan.set(kunciFolder, folderTujuanId);
        }

        const hasil = await pindahkanBerkasKeFolderDrive(dok.driveFileId, folderTujuanId);
        if (hasil.status === "moved") {
          berhasilDipindah += 1;
        } else {
          dilewatiSudahSesuai += 1;
        }
      } catch (err) {
        gagalDipindah += 1;
        pesanGagalTerakhir = formatPesanGalatDrive(err);
        if (err && (err.isUnauthorized || err.isTokenExpired)) {
          break;
        }
      }

      if (i < total - 1 && !batalkanRapikan) {
        await jedaMs(JEDA_RAPIKAN_MS);
      }
    }

    if (summaryBox) {
      summaryBox.hidden = false;
      summaryBox.innerHTML = `
        <div class="organize-summary-grid">
          <div class="organize-stat-item">
            <span class="organize-stat-value">${berhasilDipindah}</span>
            <span class="organize-stat-label">Dipindahkan</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${dilewatiSudahSesuai}</span>
            <span class="organize-stat-label">Dilewati (sudah di foldernya)</span>
          </div>
          <div class="organize-stat-item">
            <span class="organize-stat-value">${gagalDipindah}</span>
            <span class="organize-stat-label">Gagal</span>
          </div>
        </div>
        ${batalkanRapikan ? `<p class="organize-note-muted">Proses dihentikan sebelum seluruh dokumen selesai diperiksa.</p>` : ""}
      `;
    }

    if (gagalDipindah > 0 && alertBox && alertText) {
      alertText.textContent = pesanGagalTerakhir || "Sebagian dokumen tidak dapat dipindahkan.";
      alertBox.hidden = false;
    }
  } catch (errFatal) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatDrive(errFatal);
      alertBox.hidden = false;
    }
  } finally {
    sedangMerapikan = false;
    batalkanRapikan = false;
    if (startBtn instanceof HTMLButtonElement) {
      startBtn.disabled = !navigator.onLine;
      startBtn.textContent = "Jalankan Lagi";
    }
    if (cancelBtn instanceof HTMLButtonElement) {
      cancelBtn.textContent = "Tutup";
    }
  }
}

// --- Perpindahan halaman -----------------------------------------------------

export function terapkanFilterKategoriDokumen(targetKategoriId) {
  setKataKunciCari("");
  setFilterKategoriId(targetKategoriId);
  resetBatasTampil();
  tutupPanelFilterDokumen(false);

  const searchInput = document.getElementById("dokumen-search-input");
  const katSelect = document.getElementById("dokumen-filter-kategori");
  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategoriDokumen();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = getFilterKategoriId();

  pindahKeBagian("dokumen");
  renderDaftarDokumen();
}

// --- Inisialisasi halaman ----------------------------------------------------

export function initHalamanDokumen() {
  pastikanKerangkaHalamanDokumen();
  pasangFilterDokumen(document.getElementById("dokumen-toolbar"));
  perbaruiStatusJaringanDokumen();
  if (sudahDiikat) return;
  sudahDiikat = true;

  dialogKelolaKategoriDokCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriDokumen,
    hitungPemakaiLokal: hitungDokumenPemakaiServer,
    onLihatItemKategori: (katId) => terapkanFilterKategoriDokumen(katId),
    judulDialog: "Kelola Kategori Dokumen",
    opsiDrive: buatOpsiDriveKategoriDokumen()
  });

  manajerKategoriDokumen.onChange(() => {
    perbaruiDropdownKategoriDokumen();
    renderDaftarDokumen();
  });

  onPerubahanKegiatan(() => {
    renderDaftarDokumen();
  });

  // Penyegaran tampilan saat data dokumen berubah (menggantikan render langsung dari state).
  onPerubahanDokumen(() => {
    renderDaftarDokumen();
    dialogKelolaKategoriDokCtrl?.segarkanTampilan();
  });

  document.getElementById("btn-kelola-kategori-dokumen")?.addEventListener("click", () => {
    dialogKelolaKategoriDokCtrl?.buka();
  });

  document.getElementById("btn-unggah-dokumen")?.addEventListener("click", () => {
    bukaModalUnggahDokumen();
  });

  document.getElementById("btn-rapikan-dokumen-drive")?.addEventListener("click", () => {
    bukaModalRapikanDokumen();
  });

  const searchInput = document.getElementById("dokumen-search-input");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener("input", () => {
      setKataKunciCari(searchInput.value);
      resetBatasTampil();
      renderDaftarDokumen();
    });
  }

  const filterKatSelect = document.getElementById("dokumen-filter-kategori");
  if (filterKatSelect instanceof HTMLSelectElement) {
    filterKatSelect.addEventListener("change", () => {
      setFilterKategoriId(filterKatSelect.value);
      resetBatasTampil();
      renderDaftarDokumen();
    });
  }

  const sortFieldSelect = document.getElementById("dokumen-sort-field");
  if (sortFieldSelect instanceof HTMLSelectElement) {
    sortFieldSelect.addEventListener("change", () => {
      setUrutBerdasarkan(sortFieldSelect.value);
      renderDaftarDokumen();
    });
  }

  const sortDirSelect = document.getElementById("dokumen-sort-dir");
  if (sortDirSelect instanceof HTMLSelectElement) {
    sortDirSelect.addEventListener("change", () => {
      setArahUrutan(sortDirSelect.value);
      renderDaftarDokumen();
    });
  }

  const listRegion = document.getElementById("dokumen-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("#btn-tampil-lebih-dokumen")) {
        tambahBatasTampil();
        renderDaftarDokumen();
        return;
      }

      if (target.closest("#btn-muat-server-dokumen")) {
        muatLebihBanyakDokumen().then((pesanGalat) => {
          if (pesanGalat) tampilkanGalatHalamanDokumen(pesanGalat);
        });
        return;
      }

      const btnAksi = target.closest("button[data-doc-action]");
      if (!btnAksi) return;

      const aksi = btnAksi.getAttribute("data-doc-action");
      const id = btnAksi.getAttribute("data-id") || "";

      if (aksi === "toggle-menu") {
        e.stopPropagation();
        const menuEl = document.getElementById(`doc-menu-${id}`);
        if (!menuEl) return;
        const sedangBuka = idMenuTitikTigaTerbuka === id && !menuEl.hidden;
        tutupMenuTitikTigaDokumen();
        if (!sedangBuka) {
          idMenuTitikTigaTerbuka = id;
          menuEl.hidden = false;
          btnAksi.setAttribute("aria-expanded", "true");
        }
        return;
      }

      tutupMenuTitikTigaDokumen();
      const dok = getDaftarDokumen().find((d) => d.id === id);
      if (!dok) return;

      if (aksi === "edit") {
        bukaModalEditDokumen(dok);
      } else if (aksi === "delete") {
        bukaDialogHapusDokumen(dok);
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!idMenuTitikTigaTerbuka) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(".doc-mobile-kebab-wrap")) return;
    tutupMenuTitikTigaDokumen();
  });

  pasangEventModalUnggah();
  pasangEventModalEdit();
  pasangEventModalHapus();
  pasangEventModalRapikan();
  pasangEventPapanKetik();

  window.addEventListener("online", perbaruiStatusJaringanDokumen);
  window.addEventListener("offline", perbaruiStatusJaringanDokumen);
}

// --- Event modal unggah ------------------------------------------------------

function pasangEventModalUnggah() {
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
    if (pengendaliUnggahAktif) {
      pengendaliUnggahAktif.abort();
      pengendaliUnggahAktif = null;
      setUnggahSedangBerjalan(false);
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
    if (e.target === uploadModal && !pengendaliUnggahAktif) {
      tutupModalUnggahDokumen(true);
    }
  });

  uploadForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPesanGalatModalUnggah("");

    if (berkasDriveTersimpanPending && dataFormUploadPending) {
      await jalankanSimpanUlangMetadata();
      return;
    }

    if (!navigator.onLine) {
      setPesanGalatModalUnggah("Tidak ada koneksi internet. Pengunggahan ke Google Drive memerlukan sambungan aktif.");
      return;
    }

    const file = uploadFileInput instanceof HTMLInputElement && uploadFileInput.files ? uploadFileInput.files[0] : null;
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
    setUnggahSedangBerjalan(true);
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
        onProgress: (persen, terunggah, total, infoDetail) => {
          let label = `Mengunggah ${namaFileTampil} (${formatUkuranBerkas(terunggah)} / ${ukuranFileTampil})...`;
          if (infoDetail?.sedangRetry) {
            label = infoDetail.statusTeks || "Mencoba menyambung ulang ke Google Drive...";
          }
          perbaruiTampilanProgresUnggah(true, persen, label, infoDetail);
        }
      });
      pengendaliUnggahAktif = tugasUnggah;

      const hasilDrive = await tugasUnggah.promise;
      pengendaliUnggahAktif = null;

      berkasDriveTersimpanPending = hasilDrive;
      dataFormUploadPending = {
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
      pengendaliUnggahAktif = null;
      setUnggahSedangBerjalan(false);
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

// --- Event modal ubah metadata ----------------------------------------------

function pasangEventModalEdit() {
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
      await updateDoc(doc(db, KOLEKSI.DOKUMEN, dokLama.id), {
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

// --- Event modal hapus -------------------------------------------------------

function pasangEventModalHapus() {
  const deleteModal = document.getElementById("dokumen-delete-modal");
  const deleteConfirmBtn = document.getElementById("dokumen-delete-confirm-btn");

  document.getElementById("dokumen-delete-cancel-btn")?.addEventListener("click", () => {
    tutupDialogHapusDokumen(true);
  });
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) tutupDialogHapusDokumen(true);
  });

  deleteConfirmBtn?.addEventListener("click", async () => {
    if (!dokumenAkanDihapus) return;
    const target = dokumenAkanDihapus;
    const radioTrashDrive = document.getElementById("dokumen-delete-mode-drive");
    const buangKeSampahDrive = radioTrashDrive instanceof HTMLInputElement && radioTrashDrive.checked;

    setPesanGalatModalHapus("");
    if (deleteConfirmBtn instanceof HTMLButtonElement) {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = "Menghapus...";
    }

    try {
      if (buangKeSampahDrive && target.driveFileId) {
        if (!navigator.onLine) {
          throw new Error("Tidak ada koneksi internet untuk memindahkan berkas ke Sampah Drive. Pilih \"Hapus dari daftar aplikasi saja\".");
        }
        try {
          await pindahkanItemKeSampahDrive(target.driveFileId);
        } catch (errDrive) {
          if (!errDrive || !errDrive.isNotFound) {
            throw errDrive;
          }
        }
      }

      const db = getFirestoreDb();
      await deleteDoc(doc(db, KOLEKSI.DOKUMEN, target.id));
      hapusDokumenDariPeta(target.id);
      tutupDialogHapusDokumen(false);
      beritahuPerubahanDokumen();
    } catch (err) {
      setPesanGalatModalHapus(formatPesanGalatDrive(err));
    } finally {
      if (deleteConfirmBtn instanceof HTMLButtonElement) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = "Hapus Dokumen";
      }
    }
  });
}

// --- Event modal rapikan -----------------------------------------------------

function pasangEventModalRapikan() {
  const organizeModal = document.getElementById("dokumen-organize-modal");
  document.getElementById("dokumen-organize-close-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-cancel-btn")?.addEventListener("click", () => {
    tutupModalRapikanDokumen(true);
  });
  document.getElementById("dokumen-organize-start-btn")?.addEventListener("click", () => {
    jalankanRapikanDokumenKeFolder();
  });
  organizeModal?.addEventListener("click", (e) => {
    if (e.target === organizeModal && !sedangMerapikan) {
      tutupModalRapikanDokumen(true);
    }
  });
}

// --- Tombol Escape -----------------------------------------------------------

function pasangEventPapanKetik() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (idMenuTitikTigaTerbuka) {
      e.preventDefault();
      tutupMenuTitikTigaDokumen();
    } else if (hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusDokumen(true);
    } else if (editModalTerbuka) {
      e.preventDefault();
      tutupModalEditDokumen(true);
    } else if (unggahModalTerbuka && !pengendaliUnggahAktif) {
      e.preventDefault();
      tutupModalUnggahDokumen(true);
    } else if (rapikanModalTerbuka && !sedangMerapikan) {
      e.preventDefault();
      tutupModalRapikanDokumen(true);
    }
  });
}

// --- Langganan halaman -------------------------------------------------------

export function subscribeDokumen() {
  unsubscribeDokumen();
  initHalamanDokumen();
  tandaiDokumenSudahDimuat(false);
  renderDaftarDokumen();

  langgananDokumen({
    onSukses: () => tampilkanGalatHalamanDokumen(""),
    onGalat: (pesanGalat) => tampilkanGalatHalamanDokumen(pesanGalat),
  });

  return () => unsubscribeDokumen();
}

export function unsubscribeDokumen() {
  lepasLanggananDokumen();

  tutupPanelFilterDokumen(false);
  tutupMenuTitikTigaDokumen();
  tutupModalUnggahDokumen(false);
  tutupModalEditDokumen(false);
  tutupDialogHapusDokumen(false);
  if (rapikanModalTerbuka) {
    sedangMerapikan = false;
    batalkanRapikan = true;
    tutupModalRapikanDokumen(false);
  }
  dialogKelolaKategoriDokCtrl?.tutup(false);

  // Bersihkan kursor tambahan agar pemanggilan berikutnya mulai dari awal.
  setKursorTambahan(null);
  setAdaLebihBanyakDokumen(false);
  setSedangMemuatLebihDokumen(false);
}
