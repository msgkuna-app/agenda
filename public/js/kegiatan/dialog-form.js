/**
 * Modul Dialog Formulir Tambah & Ubah Kegiatan
 * Menangani validasi input formulir, pembukaan modal, penutupan modal,
 * dan penyimpanan data kegiatan ke Firestore.
 */
import {
  stateKegiatan,
  manajerKategoriKegiatan
} from "./state.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  validJamOpsional
} from "./util.js";
import { perbaruiDropdownKategori } from "./render.js";
import { simpanKegiatanFirestore } from "./data.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { formatPesanGalatFirestore } from "../firebase-config.js";

export function setPesanGalatFormKegiatan(pesan) {
  const box = document.getElementById("kegiatan-form-alert");
  const txt = document.getElementById("kegiatan-form-alert-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function ambilDanValidasiDataForm() {
  const judul = String(document.getElementById("kegiatan-judul-input")?.value || "").trim();
  const tanggal = String(document.getElementById("kegiatan-tanggal-input")?.value || "").trim();
  const waktuMulai = String(document.getElementById("kegiatan-mulai-input")?.value || "").trim();
  const waktuSelesai = String(document.getElementById("kegiatan-selesai-input")?.value || "").trim();
  const lokasi = String(document.getElementById("kegiatan-lokasi-input")?.value || "").trim();
  const kategoriId = String(document.getElementById("kegiatan-kategori-select")?.value || "").trim();
  const statusMentah = String(document.getElementById("kegiatan-status-select")?.value || "Rencana").trim();
  const catatan = String(document.getElementById("kegiatan-catatan-input")?.value || "").trim();

  if (!judul) throw new Error("Judul kegiatan wajib diisi.");
  if (!tanggal || !parseTanggal(tanggal)) {
    throw new Error("Tanggal kegiatan wajib diisi dengan format tanggal yang benar.");
  }
  if (!validJamOpsional(waktuMulai) || !validJamOpsional(waktuSelesai)) {
    throw new Error("Format waktu harus berupa jam:menit (HH:MM).");
  }
  if (waktuSelesai && !waktuMulai) {
    throw new Error("Isi waktu mulai terlebih dahulu sebelum mengisi waktu selesai.");
  }
  if (waktuMulai && waktuSelesai && waktuSelesai < waktuMulai) {
    throw new Error("Waktu selesai tidak boleh lebih awal dari waktu mulai.");
  }

  const status = DAFTAR_STATUS_KEGIATAN.includes(statusMentah) ? statusMentah : "Rencana";
  return { judul, catatan, tanggal, waktuMulai, waktuSelesai, lokasi, kategoriId, status };
}

export function bukaModalFormKegiatan(kegiatanEdit = null, tanggalAwal = null) {
  const modal = document.getElementById("kegiatan-form-modal");
  const titleEl = document.getElementById("kegiatan-form-title");
  const idInput = document.getElementById("kegiatan-edit-id");
  const judulInput = document.getElementById("kegiatan-judul-input");
  const tanggalInput = document.getElementById("kegiatan-tanggal-input");
  const mulaiInput = document.getElementById("kegiatan-mulai-input");
  const selesaiInput = document.getElementById("kegiatan-selesai-input");
  const lokasiInput = document.getElementById("kegiatan-lokasi-input");
  const kategoriSelect = document.getElementById("kegiatan-kategori-select");
  const statusSelect = document.getElementById("kegiatan-status-select");
  const catatanInput = document.getElementById("kegiatan-catatan-input");
  const submitBtn = document.getElementById("kegiatan-form-submit-btn");
  if (!modal) return;

  stateKegiatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setPesanGalatFormKegiatan("");
  perbaruiDropdownKategori();

  if (kegiatanEdit) {
    if (titleEl) titleEl.textContent = "Ubah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (idInput) idInput.value = kegiatanEdit.id;
    if (judulInput) judulInput.value = kegiatanEdit.judul || "";
    if (tanggalInput) tanggalInput.value = kegiatanEdit.tanggal || hariIni();
    if (mulaiInput) mulaiInput.value = kegiatanEdit.waktuMulai || "";
    if (selesaiInput) selesaiInput.value = kegiatanEdit.waktuSelesai || "";
    if (lokasiInput) lokasiInput.value = kegiatanEdit.lokasi || "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const info = manajerKategoriKegiatan.cariInfoKategori(kegiatanEdit.kategoriId);
      kategoriSelect.value = info.tetap ? "" : info.id;
    }
    if (statusSelect instanceof HTMLSelectElement) {
      statusSelect.value = DAFTAR_STATUS_KEGIATAN.includes(kegiatanEdit.status) ? kegiatanEdit.status : "Rencana";
    }
    if (catatanInput) catatanInput.value = kegiatanEdit.catatan || "";
  } else {
    const tanggalTerpilihValid =
      typeof tanggalAwal === "string" && parseTanggal(tanggalAwal) ? tanggalAwal.trim() : hariIni();

    if (titleEl) titleEl.textContent = "Tambah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Kegiatan";
    if (idInput) idInput.value = "";
    if (judulInput) judulInput.value = "";
    if (tanggalInput) tanggalInput.value = tanggalTerpilihValid;
    if (mulaiInput) mulaiInput.value = "";
    if (selesaiInput) selesaiInput.value = "";
    if (lokasiInput) lokasiInput.value = "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const daftarKat = manajerKategoriKegiatan.getDaftarKategori();
      if (stateKegiatan.filterKategoriId !== "ALL" && stateKegiatan.filterKategoriId !== "__TANPA_KATEGORI__") {
        kategoriSelect.value = stateKegiatan.filterKategoriId;
      } else {
        kategoriSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
      }
    }
    if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "Rencana";
    if (catatanInput) catatanInput.value = "";
  }

  stateKegiatan.formModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (judulInput instanceof HTMLElement) judulInput.focus();
  });
}

export function tutupModalFormKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-form-modal");
  if (!modal || !stateKegiatan.formModalTerbuka) return;
  stateKegiatan.formModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatFormKegiatan("");

  if (kembalikanFokus && stateKegiatan.fokusSebelumModal && document.contains(stateKegiatan.fokusSebelumModal)) {
    stateKegiatan.fokusSebelumModal.focus();
  }
  stateKegiatan.fokusSebelumModal = null;
}

export function inisialisasiFormKegiatan() {
  const formModal = document.getElementById("kegiatan-form-modal");
  const formEl = document.getElementById("kegiatan-form");
  const formCloseBtn = document.getElementById("kegiatan-form-close-btn");
  const formCancelBtn = document.getElementById("kegiatan-form-cancel-btn");
  const formSubmitBtn = document.getElementById("kegiatan-form-submit-btn");

  if (formCloseBtn) formCloseBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  if (formCancelBtn) formCancelBtn.addEventListener("click", () => tutupModalFormKegiatan(true));
  if (formModal) {
    formModal.addEventListener("click", (e) => {
      if (e.target === formModal) tutupModalFormKegiatan(true);
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      setPesanGalatFormKegiatan("");

      let payload;
      try {
        payload = ambilDanValidasiDataForm();
      } catch (validErr) {
        setPesanGalatFormKegiatan(validErr instanceof Error ? validErr.message : "Data kegiatan belum lengkap.");
        return;
      }

      const idEdit = String(document.getElementById("kegiatan-edit-id")?.value || "").trim();

      if (formSubmitBtn) formSubmitBtn.disabled = true;
      try {
        await simpanKegiatanFirestore(payload, idEdit);
        tutupModalFormKegiatan(true);
      } catch (err) {
        setPesanGalatFormKegiatan(formatPesanGalatFirestore(err));
      } finally {
        if (formSubmitBtn) formSubmitBtn.disabled = false;
      }
    });
  }
}