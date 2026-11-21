/**
 * Controller Modul Catatan (Tahap 3: dipisah dari catatan.js)
 * Mengorkestrasi alur halaman Catatan: modal singkat, modal Google Docs,
 * dialog hapus + urungkan, pemasangan listener antarmuka, dan langganan data.
 * State data ada di state.js; manipulasi DOM tampilan ada di view.js.
 */
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  KOLEKSI
} from "../../config/constants.js";
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  formatPesanGalatFirestore
} from "../../services/firestoreService.js";
import { loginWithGoogle, isDriveTokenExpired, formatPesanGalatAuth } from "../../services/authService.js";
import { hariIni, parseTanggal } from "../../util-tanggal.js";
import { tampilkanToast } from "../../shared/toast.js";
import {
  buatDokumenGoogleDocsDrive,
  pindahkanItemKeSampahDrive,
  formatPesanGalatDrive
} from "../../services/driveService.js";
import { DAFTAR_TEMPLAT_DOKUMEN, ambilInfoTemplatDokumen, bangunHtmlTemplatDokumen } from "../../templat-dokumen.js";
import { escapeHtml } from "../../util-html.js";
import {
  getDaftarCatatan,
  ambilDaftarKegiatanTerkait,
  langgananPerubahanKegiatan,
  cariKegiatanId,
  setelOpsiPeristiwaCatatan,
  hapusLunakCatatan,
  pulihkanCatatan,
  muatLebihBanyakCatatan,
  ambilSemuaCatatanSekaliPakai,
  onPerubahanCatatan,
  beritahuPerubahanCatatan,
  langgananCatatan,
  hentikanLanggananDataCatatan,
  setelBelumDimuatPertamaKali
} from "./state.js";
import {
  pastikanKerangkaHalamanCatatan,
  pasangFilterCatatan,
  perbaruiStatusJaringanCatatan,
  perbaruiOpsiKegiatanDiModal,
  renderDaftarCatatan,
  tampilkanNotifikasiCatatan,
  setKataKunciCari,
  setFilterJenis,
  setUrutanTanggal,
  getSedangMembuatGdoc,
  setSedangMembuatGdoc,
  lepasAntarmukaCatatan
} from "./view.js";
import { formatTanggalCatatan, uraiInputTag } from "./format.js";

let antarmukaSudahDiikat = false;

let singkatModalTerbuka = false;
let gdocModalTerbuka = false;
let hapusSingkatModalTerbuka = false;
let hapusGdocModalTerbuka = false;

let idCatatanSingkatHapus = null;
let itemCatatanGdocHapus = null;
let fokusSebelumModalCatatan = null;
let judulOtomatisGdocTerakhir = "";
let pembukaDetailKegiatanEksternal = null;

export function daftarkanPembukaDetailKegiatanCatatan(fn) {
  pembukaDetailKegiatanEksternal = typeof fn === "function" ? fn : null;
}

function bukaTabBaruAman(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function adalahGalatToken(err) {
  if (!err || typeof err !== "object") return isDriveTokenExpired();
  return Boolean(err.isTokenExpired || err.isUnauthorized || err.status === 401);
}

function perbaruiOpsiKegiatan() {
  perbaruiOpsiKegiatanDiModal(ambilDaftarKegiatanTerkait());
}

/* ---------- Modal Catatan Singkat ---------- */

function setGalatModalSingkat(pesan) {
  const box = document.getElementById("catatan-singkat-alert");
  const txt = document.getElementById("catatan-singkat-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function bukaModalCatatanSingkat(catatanEdit = null, opsiAwal = {}) {
  const modal = document.getElementById("catatan-singkat-modal");
  const titleEl = document.getElementById("catatan-singkat-title");
  const idInput = document.getElementById("catatan-singkat-edit-id");
  const jenisInput = document.getElementById("catatan-singkat-edit-jenis");
  const judulInput = document.getElementById("catatan-singkat-judul");
  const tanggalInput = document.getElementById("catatan-singkat-tanggal");
  const kategoriInput = document.getElementById("catatan-singkat-kategori");
  const isiField = document.getElementById("catatan-singkat-isi-field");
  const isiInput = document.getElementById("catatan-singkat-isi");
  const tagInput = document.getElementById("catatan-singkat-tag");
  const kegSelect = document.getElementById("catatan-singkat-kegiatan");
  const pinInput = document.getElementById("catatan-singkat-pin");
  const submitBtn = document.getElementById("catatan-singkat-submit-btn");
  if (!modal) return;

  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setGalatModalSingkat("");
  perbaruiOpsiKegiatan();

  if (catatanEdit) {
    const gdoc = catatanEdit.jenis === JENIS_CATATAN_GDOC;
    if (titleEl) titleEl.textContent = gdoc ? "Ubah Info Catatan Google Docs" : "Ubah Catatan Singkat";
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (idInput) idInput.value = catatanEdit.id;
    if (jenisInput) jenisInput.value = gdoc ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
    if (judulInput) judulInput.value = catatanEdit.judul || "";
    if (tanggalInput) tanggalInput.value = parseTanggal(catatanEdit.tanggal) ? catatanEdit.tanggal : hariIni();
    if (kategoriInput) kategoriInput.value = catatanEdit.kategori || "";
    if (isiField) isiField.hidden = gdoc;
    if (isiInput) isiInput.value = gdoc ? "" : catatanEdit.isi || "";
    if (tagInput) tagInput.value = Array.isArray(catatanEdit.tag) ? catatanEdit.tag.join(", ") : "";
    if (kegSelect instanceof HTMLSelectElement) {
      const idKeg = String(catatanEdit.kegiatanId || "").trim();
      kegSelect.value = cariKegiatanId(idKeg) ? idKeg : "";
    }
    if (pinInput instanceof HTMLInputElement) pinInput.checked = Boolean(catatanEdit.disematkan);
  } else {
    const tglAwal = typeof opsiAwal?.tanggal === "string" && parseTanggal(opsiAwal.tanggal) ? opsiAwal.tanggal.trim() : hariIni();
    const kegAwal = String(opsiAwal?.kegiatanId || "").trim();
    if (titleEl) titleEl.textContent = "Tambah Catatan Singkat";
    if (submitBtn) submitBtn.textContent = "Simpan Catatan";
    if (idInput) idInput.value = "";
    if (jenisInput) jenisInput.value = JENIS_CATATAN_SINGKAT;
    if (judulInput) judulInput.value = String(opsiAwal?.judul || "").trim();
    if (tanggalInput) tanggalInput.value = tglAwal;
    if (kategoriInput) kategoriInput.value = "";
    if (isiField) isiField.hidden = false;
    if (isiInput) isiInput.value = "";
    if (tagInput) tagInput.value = "";
    if (kegSelect instanceof HTMLSelectElement) kegSelect.value = cariKegiatanId(kegAwal) ? kegAwal : "";
    if (pinInput instanceof HTMLInputElement) pinInput.checked = false;
  }

  singkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

function tutupModalCatatanSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-modal");
  if (!modal || !singkatModalTerbuka) return;
  singkatModalTerbuka = false;
  modal.hidden = true;
  setGalatModalSingkat("");
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

async function simpanFormCatatanSingkat(e) {
  e.preventDefault();
  setGalatModalSingkat("");
  const idEdit = String(document.getElementById("catatan-singkat-edit-id")?.value || "").trim();
  const jenisEdit = document.getElementById("catatan-singkat-edit-jenis")?.value === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
  const judul = String(document.getElementById("catatan-singkat-judul")?.value || "").trim();
  const tanggal = String(document.getElementById("catatan-singkat-tanggal")?.value || "").trim();
  const kategori = String(document.getElementById("catatan-singkat-kategori")?.value || "").trim().slice(0, 40);
  const isi = String(document.getElementById("catatan-singkat-isi")?.value || "").trim();
  const tag = uraiInputTag(document.getElementById("catatan-singkat-tag")?.value || "");
  const kegiatanId = String(document.getElementById("catatan-singkat-kegiatan")?.value || "").trim();
  const disematkan = Boolean(document.getElementById("catatan-singkat-pin")?.checked);

  if (!judul) { setGalatModalSingkat("Judul catatan wajib diisi."); return; }
  if (!tanggal || !parseTanggal(tanggal)) { setGalatModalSingkat("Tanggal wajib diisi dengan benar."); return; }
  if (jenisEdit === JENIS_CATATAN_SINGKAT && !isi) { setGalatModalSingkat("Isi catatan singkat wajib diisi."); return; }

  const submitBtn = document.getElementById("catatan-singkat-submit-btn");
  const sekarang = new Date().toISOString();
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  try {
    const db = getFirestoreDb();
    if (idEdit) {
      const perubahan = { judul, tanggal, kategori, tag, kegiatanId, disematkan, updatedAt: sekarang };
      if (jenisEdit === JENIS_CATATAN_SINGKAT) perubahan.isi = isi;
      await updateDoc(doc(db, KOLEKSI.CATATAN, idEdit), perubahan);
    } else {
      // Fase 5: Setel dihapusAt: null pada dokumen baru
      await addDoc(collection(db, KOLEKSI.CATATAN), {
        jenis: JENIS_CATATAN_SINGKAT,
        judul,
        isi,
        kategori,
        tag,
        kegiatanId,
        disematkan,
        tanggal,
        dihapusAt: null,
        createdAt: sekarang,
        updatedAt: sekarang
      });
    }
    tutupModalCatatanSingkat(true);
  } catch (err) {
    setGalatModalSingkat(formatPesanGalatFirestore(err));
  } finally {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
  }
}

/* ---------- Modal Catatan Google Docs ---------- */

function setGalatModalGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-alert");
  const txt = document.getElementById("catatan-gdoc-alert-text");
  const btn = document.getElementById("catatan-gdoc-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

function sinkronkanJudulSaranGdoc() {
  const judulInput = document.getElementById("catatan-gdoc-judul");
  const tplSelect = document.getElementById("catatan-gdoc-templat");
  const kegSelect = document.getElementById("catatan-gdoc-kegiatan");
  const descEl = document.getElementById("catatan-gdoc-templat-desc");
  if (!(judulInput instanceof HTMLInputElement) || !(tplSelect instanceof HTMLSelectElement) || !(kegSelect instanceof HTMLSelectElement)) return;

  const infoTpl = ambilInfoTemplatDokumen(tplSelect.value);
  if (descEl) descEl.textContent = infoTpl.deskripsi;

  const sekarang = judulInput.value.trim();
  if (sekarang && sekarang !== judulOtomatisGdocTerakhir) return;

  const keg = cariKegiatanId(kegSelect.value);
  let saran = "";
  if (keg) {
    saran = infoTpl.id === "notulensi" ? `Notulensi - ${keg.judul}` : `${infoTpl.nama} - ${keg.judul}`;
  }
  if (saran) {
    judulInput.value = saran.slice(0, 160);
    judulOtomatisGdocTerakhir = judulInput.value;
  }
}

export function bukaModalBuatCatatanGdoc(opsiAwal = {}) {
  if (!navigator.onLine) {
    tampilkanNotifikasiCatatan({
      pesan: "Tidak ada koneksi internet. Pembuatan dokumen Google Docs memerlukan sambungan aktif.",
      tipe: "warning"
    });
    return;
  }
  const modal = document.getElementById("catatan-gdoc-modal");
  const tplSelect = document.getElementById("catatan-gdoc-templat");
  const judulInput = document.getElementById("catatan-gdoc-judul");
  const tglInput = document.getElementById("catatan-gdoc-tanggal");
  const kegSelect = document.getElementById("catatan-gdoc-kegiatan");
  const katInput = document.getElementById("catatan-gdoc-kategori");
  const tagInput = document.getElementById("catatan-gdoc-tag");
  const pinInput = document.getElementById("catatan-gdoc-pin");
  const progWrap = document.getElementById("catatan-gdoc-progress-wrap");
  if (!modal) return;

  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  perbaruiOpsiKegiatan();

  const infoTpl = ambilInfoTemplatDokumen(opsiAwal?.templat || "notulensi");
  const kegObj = cariKegiatanId(opsiAwal?.kegiatanId || "");
  const tglAwal = typeof opsiAwal?.tanggal === "string" && parseTanggal(opsiAwal.tanggal)
    ? opsiAwal.tanggal.trim()
    : kegObj && parseTanggal(kegObj.tanggal)
      ? kegObj.tanggal
      : hariIni();

  if (tplSelect instanceof HTMLSelectElement) {
    tplSelect.innerHTML = DAFTAR_TEMPLAT_DOKUMEN.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nama)}</option>`).join("");
    tplSelect.value = infoTpl.id;
  }
  if (kegSelect instanceof HTMLSelectElement) kegSelect.value = kegObj ? kegObj.id : "";
  if (tglInput instanceof HTMLInputElement) tglInput.value = tglAwal;
  if (katInput instanceof HTMLInputElement) katInput.value = infoTpl.id === "notulensi" && kegObj ? "Notulensi" : "";
  if (tagInput instanceof HTMLInputElement) tagInput.value = "";
  if (pinInput instanceof HTMLInputElement) pinInput.checked = false;
  if (progWrap) progWrap.hidden = true;

  judulOtomatisGdocTerakhir = "";
  if (judulInput instanceof HTMLInputElement) {
    const diberikan = String(opsiAwal?.judul || "").trim();
    judulInput.value = diberikan ? diberikan.slice(0, 160) : "";
    if (diberikan) judulOtomatisGdocTerakhir = judulInput.value;
  }
  sinkronkanJudulSaranGdoc();

  if (isDriveTokenExpired()) {
    setGalatModalGdoc("Sesi akses Google Drive telah kedaluwarsa. Tekan tombol \"Masuk ulang\" sebelum membuat dokumen.", true);
  } else {
    setGalatModalGdoc("", false);
  }

  gdocModalTerbuka = true;
  modal.hidden = false;
  perbaruiStatusJaringanCatatan();
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

function tutupModalBuatCatatanGdoc(kembalikanFokus = true) {
  if (getSedangMembuatGdoc()) return;
  const modal = document.getElementById("catatan-gdoc-modal");
  if (!modal || !gdocModalTerbuka) return;
  gdocModalTerbuka = false;
  modal.hidden = true;
  setGalatModalGdoc("", false);
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

async function kirimFormGdoc(e) {
  e.preventDefault();
  const infoTpl = ambilInfoTemplatDokumen(document.getElementById("catatan-gdoc-templat")?.value || "notulensi");
  const judul = String(document.getElementById("catatan-gdoc-judul")?.value || "").trim();
  const tanggal = String(document.getElementById("catatan-gdoc-tanggal")?.value || "").trim();
  const kegiatanId = String(document.getElementById("catatan-gdoc-kegiatan")?.value || "").trim();
  const kategori = String(document.getElementById("catatan-gdoc-kategori")?.value || "").trim().slice(0, 40);
  const tag = uraiInputTag(document.getElementById("catatan-gdoc-tag")?.value || "");
  const disematkan = Boolean(document.getElementById("catatan-gdoc-pin")?.checked);

  if (!judul) { setGalatModalGdoc("Judul catatan Google Docs wajib diisi.", false); return; }
  if (!tanggal || !parseTanggal(tanggal)) { setGalatModalGdoc("Tanggal wajib diisi dengan benar.", false); return; }
  if (isDriveTokenExpired()) {
    setGalatModalGdoc("Sesi akses Google Drive telah kedaluwarsa. Klik \"Masuk ulang\" terlebih dahulu.", true);
    return;
  }

  const kegObj = kegiatanId ? cariKegiatanId(kegiatanId) : null;
  const htmlKonten = bangunHtmlTemplatDokumen({ templat: infoTpl.id, judul, tanggal, kegiatan: kegObj });

  const submitBtn = document.getElementById("catatan-gdoc-submit-btn");
  const cancelBtn = document.getElementById("catatan-gdoc-cancel-btn");
  const progWrap = document.getElementById("catatan-gdoc-progress-wrap");

  setSedangMembuatGdoc(true);
  setGalatModalGdoc("", false);
  if (progWrap) progWrap.hidden = false;
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;

  try {
    const hasilDrive = await buatDokumenGoogleDocsDrive({ judul, htmlKonten });
    const sekarang = new Date().toISOString();
    await addDoc(collection(getFirestoreDb(), KOLEKSI.CATATAN), {
      jenis: JENIS_CATATAN_GDOC,
      judul,
      isi: "",
      kategori,
      tag,
      kegiatanId: kegObj ? kegObj.id : "",
      disematkan,
      tanggal,
      templat: infoTpl.id,
      docId: hasilDrive.id,
      tautan: hasilDrive.webViewLink,
      dihapusAt: null,
      createdAt: sekarang,
      updatedAt: sekarang
    });

    setSedangMembuatGdoc(false);
    tutupModalBuatCatatanGdoc(true);
    bukaTabBaruAman(hasilDrive.webViewLink);
    tampilkanNotifikasiCatatan({
      pesan: `Dokumen Google Docs "${judul}" berhasil dibuat di folder Agenda-Arsip.`,
      tipe: "success",
      tautanDocs: hasilDrive.webViewLink
    });
  } catch (err) {
    setGalatModalGdoc(formatPesanGalatDrive(err), adalahGalatToken(err));
  } finally {
    setSedangMembuatGdoc(false);
    if (progWrap) progWrap.hidden = true;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = !navigator.onLine;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
  }
}

/* ---------- Dialog hapus ---------- */

function setGalatHapusGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-delete-alert");
  const txt = document.getElementById("catatan-gdoc-delete-alert-text");
  const btn = document.getElementById("catatan-gdoc-delete-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

function bukaDialogHapusSingkat(item) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  const title = modal?.querySelector(".modal-title");
  const desc = document.getElementById("catatan-singkat-delete-desc");
  const cancelBtn = document.getElementById("catatan-singkat-delete-cancel-btn");
  if (!modal || !item) return;
  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idCatatanSingkatHapus = item.id;
  if (title) title.textContent = "Pindahkan ke Tempat Sampah?";
  if (desc) desc.textContent = `Catatan singkat "${item.judul}" pada ${formatTanggalCatatan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  hapusSingkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

function tutupDialogHapusSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-delete-modal");
  if (!modal || !hapusSingkatModalTerbuka) return;
  hapusSingkatModalTerbuka = false;
  idCatatanSingkatHapus = null;
  modal.hidden = true;
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

function bukaDialogHapusGdoc(item) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  const desc = document.getElementById("catatan-gdoc-delete-desc");
  const radioApp = document.getElementById("catatan-gdoc-delete-mode-app");
  const radioDrive = document.getElementById("catatan-gdoc-delete-mode-drive");
  const cancelBtn = document.getElementById("catatan-gdoc-delete-cancel-btn");
  if (!modal || !item) return;
  fokusSebelumModalCatatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  itemCatatanGdocHapus = item;
  setGalatHapusGdoc("", false);
  if (radioApp instanceof HTMLInputElement) radioApp.checked = true;
  if (radioDrive instanceof HTMLInputElement) radioDrive.disabled = !navigator.onLine;
  if (desc) desc.textContent = `Konfirmasi penghapusan catatan Google Docs "${item.judul}" (${formatTanggalCatatan(item.tanggal)}):`;
  hapusGdocModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (cancelBtn instanceof HTMLElement) cancelBtn.focus(); });
}

function tutupDialogHapusGdoc(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-gdoc-delete-modal");
  if (!modal || !hapusGdocModalTerbuka) return;
  hapusGdocModalTerbuka = false;
  itemCatatanGdocHapus = null;
  modal.hidden = true;
  setGalatHapusGdoc("", false);
  if (kembalikanFokus && fokusSebelumModalCatatan && document.contains(fokusSebelumModalCatatan)) {
    fokusSebelumModalCatatan.focus();
  }
  fokusSebelumModalCatatan = null;
}

async function konfirmasiHapusSingkat(e) {
  if (!idCatatanSingkatHapus) return;
  const targetId = idCatatanSingkatHapus;
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

async function konfirmasiHapusGdoc(e) {
  if (!itemCatatanGdocHapus) return;
  const target = itemCatatanGdocHapus;
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

async function masukUlangDriveDariCatatan(btn, setelahSukses) {
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    await loginWithGoogle();
    const banner = document.getElementById("token-expired-banner");
    if (banner) banner.hidden = !isDriveTokenExpired();
    if (typeof setelahSukses === "function") setelahSukses();
  } catch (err) {
    const pesan = formatPesanGalatAuth(err);
    if (gdocModalTerbuka) setGalatModalGdoc(pesan, true);
    else if (hapusGdocModalTerbuka) setGalatHapusGdoc(pesan, true);
    else tampilkanNotifikasiCatatan({ pesan, tipe: "danger", butuhRelogin: true });
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

/* ---------- Listener halaman ---------- */

function ikatPencarianDanFilter() {
  const searchInput = document.getElementById("catatan-search-input");
  const jenisSelect = document.getElementById("catatan-filter-jenis");
  const sortSelect = document.getElementById("catatan-sort-tanggal");

  searchInput?.addEventListener("input", () => {
    setKataKunciCari(searchInput instanceof HTMLInputElement ? searchInput.value : "");
    renderDaftarCatatan();
  });
  jenisSelect?.addEventListener("change", () => {
    setFilterJenis(jenisSelect instanceof HTMLSelectElement ? jenisSelect.value : "ALL");
    renderDaftarCatatan();
  });
  sortSelect?.addEventListener("change", () => {
    setUrutanTanggal(sortSelect instanceof HTMLSelectElement ? sortSelect.value : "desc");
    renderDaftarCatatan();
  });
}

function ikatAksiGlobal() {
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.id === "btn-cari-semua-catatan" || target.id === "btn-cari-semua-catatan-empty") {
      ambilSemuaCatatanSekaliPakai();
      return;
    }
    if (target.id === "btn-muat-lebih-catatan") {
      muatLebihBanyakCatatan();
    }
  });
}

function ikatDaftarCatatan() {
  document.getElementById("catatan-list-region")?.addEventListener("click", async (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-catatan-action]") : null;
    if (!btn) return;
    const aksi = btn.getAttribute("data-catatan-action");

    if (aksi === "filter-tag") {
      const tag = btn.getAttribute("data-tag") || "";
      const searchInput = document.getElementById("catatan-search-input");
      if (tag && searchInput instanceof HTMLInputElement) {
        setKataKunciCari(tag);
        searchInput.value = tag;
        renderDaftarCatatan();
      }
      return;
    }
    if (aksi === "lihat-kegiatan") {
      const kegId = btn.getAttribute("data-kegiatan-id") || "";
      if (kegId && typeof pembukaDetailKegiatanEksternal === "function") pembukaDetailKegiatanEksternal(kegId);
      return;
    }

    const id = btn.getAttribute("data-id") || "";
    const item = getDaftarCatatan().find((c) => c.id === id);
    if (!item) return;

    if (aksi === "toggle-pin") {
      btn.disabled = true;
      try {
        await updateDoc(doc(getFirestoreDb(), KOLEKSI.CATATAN, item.id), {
          disematkan: !item.disematkan,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        tampilkanNotifikasiCatatan({ pesan: formatPesanGalatFirestore(err), tipe: "danger" });
      } finally {
        btn.disabled = false;
      }
    } else if (aksi === "edit-catatan") {
      bukaModalCatatanSingkat(item);
    } else if (aksi === "delete-catatan") {
      if (item.jenis === JENIS_CATATAN_GDOC) bukaDialogHapusGdoc(item);
      else bukaDialogHapusSingkat(item);
    }
  });
}

function ikatModalSingkat() {
  const singkatModal = document.getElementById("catatan-singkat-modal");
  document.getElementById("catatan-singkat-close-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  document.getElementById("catatan-singkat-cancel-btn")?.addEventListener("click", () => tutupModalCatatanSingkat(true));
  singkatModal?.addEventListener("click", (e) => { if (e.target === singkatModal) tutupModalCatatanSingkat(true); });
  document.getElementById("catatan-singkat-form")?.addEventListener("submit", simpanFormCatatanSingkat);
}

function ikatModalGdoc() {
  const gdocModal = document.getElementById("catatan-gdoc-modal");
  document.getElementById("catatan-gdoc-close-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  document.getElementById("catatan-gdoc-cancel-btn")?.addEventListener("click", () => tutupModalBuatCatatanGdoc(true));
  gdocModal?.addEventListener("click", (e) => { if (e.target === gdocModal) tutupModalBuatCatatanGdoc(true); });
  document.getElementById("catatan-gdoc-templat")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-kegiatan")?.addEventListener("change", sinkronkanJudulSaranGdoc);
  document.getElementById("catatan-gdoc-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => setGalatModalGdoc("", false));
  });
  document.getElementById("catatan-gdoc-form")?.addEventListener("submit", kirimFormGdoc);
}

function ikatDialogHapus() {
  const delSingkatModal = document.getElementById("catatan-singkat-delete-modal");
  document.getElementById("catatan-singkat-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusSingkat(true));
  delSingkatModal?.addEventListener("click", (e) => { if (e.target === delSingkatModal) tutupDialogHapusSingkat(true); });
  document.getElementById("catatan-singkat-delete-confirm-btn")?.addEventListener("click", konfirmasiHapusSingkat);

  const delGdocModal = document.getElementById("catatan-gdoc-delete-modal");
  document.getElementById("catatan-gdoc-delete-cancel-btn")?.addEventListener("click", () => tutupDialogHapusGdoc(true));
  delGdocModal?.addEventListener("click", (e) => { if (e.target === delGdocModal) tutupDialogHapusGdoc(true); });
  document.getElementById("catatan-gdoc-delete-relogin-btn")?.addEventListener("click", (e) => {
    masukUlangDriveDariCatatan(e.currentTarget, () => setGalatHapusGdoc("", false));
  });
  document.getElementById("catatan-gdoc-delete-confirm-btn")?.addEventListener("click", konfirmasiHapusGdoc);
}

function ikatEscapeDanJaringan() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (hapusGdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusGdoc(true); }
    else if (hapusSingkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupDialogHapusSingkat(true); }
    else if (gdocModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalBuatCatatanGdoc(true); }
    else if (singkatModalTerbuka) { e.preventDefault(); e.stopImmediatePropagation(); tutupModalCatatanSingkat(true); }
  }, true);

  window.addEventListener("online", perbaruiStatusJaringanCatatan);
  window.addEventListener("offline", perbaruiStatusJaringanCatatan);
}

export function initHalamanCatatan() {
  pastikanKerangkaHalamanCatatan();
  pasangFilterCatatan();
  perbaruiStatusJaringanCatatan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  langgananPerubahanKegiatan(() => {
    perbaruiOpsiKegiatan();
    renderDaftarCatatan();
  });

  onPerubahanCatatan(() => renderDaftarCatatan());

  document.getElementById("btn-tambah-catatan-singkat")?.addEventListener("click", () => bukaModalCatatanSingkat(null));
  document.getElementById("btn-tambah-catatan-gdoc")?.addEventListener("click", () => bukaModalBuatCatatanGdoc());

  document.getElementById("catatan-page-feedback")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-catatan-feedback]") : null;
    if (!btn) return;
    const jenis = btn.getAttribute("data-catatan-feedback");
    if (jenis === "dismiss") tampilkanNotifikasiCatatan({ pesan: "" });
    else if (jenis === "relogin") {
      masukUlangDriveDariCatatan(btn, () => tampilkanNotifikasiCatatan({ pesan: "Sesi akses Google Drive berhasil diperbarui.", tipe: "success" }));
    }
  });

  ikatPencarianDanFilter();
  ikatAksiGlobal();
  ikatDaftarCatatan();
  ikatModalSingkat();
  ikatModalGdoc();
  ikatDialogHapus();
  ikatEscapeDanJaringan();
}

export function subscribeCatatan() {
  unsubscribeCatatan();
  initHalamanCatatan();
  setelBelumDimuatPertamaKali();
  setelOpsiPeristiwaCatatan({ onGalatHalaman: tampilkanNotifikasiCatatan });
  renderDaftarCatatan();
  beritahuPerubahanCatatan();
  langgananCatatan();
  return () => unsubscribeCatatan();
}

export function unsubscribeCatatan() {
  hentikanLanggananDataCatatan();
  lepasAntarmukaCatatan();
  setSedangMembuatGdoc(false);
  tutupModalCatatanSingkat(false);
  tutupModalBuatCatatanGdoc(false);
  tutupDialogHapusSingkat(false);
  tutupDialogHapusGdoc(false);
  beritahuPerubahanCatatan();
}
