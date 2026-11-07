/**
 * Modul Dialog Catatan Singkat (Fase 7C)
 * Menangani modal tambah & ubah catatan singkat (dan pengubahan meta info catatan docs).
 */
import {
  getFirestoreDb,
  collection,
  doc,
  addDoc,
  updateDoc,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";
import {
  JENIS_CATATAN_SINGKAT,
  JENIS_CATATAN_GDOC,
  uraiInputTag,
  cariKegiatanId
} from "./util.js";
import { stateCatatan } from "./state.js";
import { perbaruiOpsiKegiatanDiModal } from "./render.js";

export function setGalatModalSingkat(pesan) {
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

  stateCatatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setGalatModalSingkat("");
  perbaruiOpsiKegiatanDiModal();

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

  stateCatatan.singkatModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

export function tutupModalCatatanSingkat(kembalikanFokus = true) {
  const modal = document.getElementById("catatan-singkat-modal");
  if (!modal || !stateCatatan.singkatModalTerbuka) return;
  stateCatatan.singkatModalTerbuka = false;
  modal.hidden = true;
  setGalatModalSingkat("");
  if (kembalikanFokus && stateCatatan.fokusSebelumModal && document.contains(stateCatatan.fokusSebelumModal)) {
    stateCatatan.fokusSebelumModal.focus();
  }
  stateCatatan.fokusSebelumModal = null;
}

export async function tanganiSubmitCatatanSingkat(e) {
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
      await updateDoc(doc(db, "catatan", idEdit), perubahan);
    } else {
      // Fase 5: Setel dihapusAt: null pada dokumen baru
      await addDoc(collection(db, "catatan"), {
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