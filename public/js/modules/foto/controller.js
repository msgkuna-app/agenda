/**
 * Controller Modul Foto (fitur foto kegiatan)
 * Menangani modal unggah berkas ke Google Drive, penyimpanan metadata ke
 * Firestore, penghapusan foto, pencarian, dan filter halaman Foto.
 */
import { MAKS_UKURAN_BERKAS_MB } from "../../config/constants.js";
import { formatPesanGalatDrive, pastikanFolderFotoDrive, unggahBerkasKeDrive, pindahkanItemKeSampahDrive } from "../../services/driveService.js";
import { tampilkanToast } from "../../shared/toast.js";
import { escapeHtml } from "../../util-html.js";
import { getDaftarKegiatan, onPerubahanKegiatan } from "../kegiatan/index.js";
import {
  getDaftarFoto,
  onPerubahanFoto,
  langgananFoto,
  lepasLanggananFoto,
  simpanMetadataFoto,
  hapusDokumenFoto,
} from "./state.js";
import {
  pasangElemenFoto,
  pastikanKerangkaHalamanFoto,
  renderDaftarFoto,
  renderPratinjauUnggah,
  bersihkanFormUnggahFoto,
  setelSedangUnggahFoto,
} from "./view.js";

let sudahDipasang = false;
let sedangUnggah = false;
let modalTerbuka = false;
let filterKegiatanId = "ALL";
let kataKunciCari = "";
let fokusSebelumModal = null;

function petaJudulKegiatan() {
  const peta = new Map();
  getDaftarKegiatan().forEach((k) => peta.set(k.id, k));
  return peta;
}

function renderSemua() {
  renderDaftarFoto(getDaftarFoto(), petaJudulKegiatan(), {
    filterKegiatanId,
    kataKunci: kataKunciCari,
  });
  perbaruiOpsiFilterKegiatan();
}

function perbaruiOpsiFilterKegiatan() {
  const select = document.getElementById("filter-foto-kegiatan");
  if (!(select instanceof HTMLSelectElement)) return;
  const daftar = getDaftarKegiatan()
    .slice()
    .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  select.innerHTML =
    '<option value="ALL">Semua kegiatan</option>' +
    daftar
      .map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.judul)}${k.tanggal ? ` (${escapeHtml(k.tanggal)})` : ""}</option>`)
      .join("");
  select.value = filterKegiatanId === "ALL" || daftar.some((k) => k.id === filterKegiatanId) ? filterKegiatanId : "ALL";
  if (select.value !== filterKegiatanId) filterKegiatanId = "ALL";
}

/** Mengisi dropdown kegiatan pada modal unggah. */
function perbaruiDropdownKegiatanModal() {
  const select = document.getElementById("foto-upload-kegiatan");
  if (!(select instanceof HTMLSelectElement)) return;
  const nilaiLama = select.value;
  const daftar = getDaftarKegiatan()
    .slice()
    .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  select.innerHTML =
    '<option value="">— Pilih kegiatan —</option>' +
    daftar
      .map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.judul)}${k.tanggal ? ` (${escapeHtml(k.tanggal)})` : ""}</option>`)
      .join("");
  if (daftar.some((k) => k.id === nilaiLama)) select.value = nilaiLama;
}

function setPesanGalatModal(pesan) {
  const box = document.getElementById("foto-upload-alert");
  const txt = document.getElementById("foto-upload-alert-text");
  if (!box || !txt) return;
  const bersih = String(pesan || "").trim();
  if (!bersih) {
    txt.textContent = "";
    box.hidden = true;
    return;
  }
  txt.textContent = bersih;
  box.hidden = false;
}

export function bukaModalUnggahFoto() {
  if (!navigator.onLine) {
    tampilkanToast("Tidak ada koneksi internet. Unggah foto memerlukan sambungan aktif.", "galat");
    return;
  }
  const modal = document.getElementById("foto-upload-modal");
  if (!modal) return;

  fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  bersihkanFormUnggahFoto();
  setPesanGalatModal("");
  setelSedangUnggahFoto(false);
  perbaruiDropdownKegiatanModal();

  modalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    document.getElementById("foto-upload-kegiatan")?.focus();
  });
}

function tutupModalUnggahFoto(kembalikanFokus = true) {
  const modal = document.getElementById("foto-upload-modal");
  if (!modal || !modalTerbuka) return;
  modalTerbuka = false;
  modal.hidden = true;
  bersihkanFormUnggahFoto();
  setPesanGalatModal("");
  if (kembalikanFokus && fokusSebelumModal && document.contains(fokusSebelumModal)) {
    fokusSebelumModal.focus();
  }
  fokusSebelumModal = null;
}

async function unggahBerkasTerpilih(kegiatanId, berkas) {
  const daftar = Array.from(berkas || []);
  if (!daftar.length) {
    setPesanGalatModal("Pilih satu atau lebih berkas foto terlebih dahulu.");
    return;
  }

  const nonFoto = daftar.filter((f) => !String(f.type || "").startsWith("image/"));
  if (nonFoto.length) {
    setPesanGalatModal(`Berkas berikut bukan gambar: ${nonFoto.map((f) => f.name).join(", ")}.`);
    return;
  }

  const terlaluBesar = daftar.filter((f) => f.size > MAKS_UKURAN_BERKAS_MB * 1024 * 1024);
  if (terlaluBesar.length) {
    setPesanGalatModal(`Ukuran maksimum ${MAKS_UKURAN_BERKAS_MB} MB per berkas. Terlalu besar: ${terlaluBesar.map((f) => f.name).join(", ")}.`);
    return;
  }

  sedangUnggah = true;
  setelSedangUnggahFoto(true);

  let folderId = "";
  try {
    folderId = await pastikanFolderFotoDrive();
  } catch (err) {
    sedangUnggah = false;
    setelSedangUnggahFoto(false);
    setPesanGalatModal(formatPesanGalatDrive(err));
    return;
  }

  let berhasil = 0;
  let gagal = 0;
  for (const file of daftar) {
    try {
      const unggahan = unggahBerkasKeDrive({ file, folderId, namaSimpanDrive: file.name });
      const hasil = await unggahan.promise;
      await simpanMetadataFoto({
        kegiatanId,
        driveFileId: hasil.id,
        namaFile: hasil.name || file.name,
        tautan: hasil.webViewLink || "",
        mimeType: hasil.mimeType || file.type || "",
        ukuran: Number(hasil.size) || file.size || 0,
      });
      berhasil += 1;
    } catch (err) {
      gagal += 1;
      setPesanGalatModal(`Gagal mengunggah "${file.name}": ${formatPesanGalatDrive(err)}`);
    }
  }

  sedangUnggah = false;
  setelSedangUnggahFoto(false);

  if (berhasil) {
    tampilkanToast(`${berhasil} foto berhasil diunggah${gagal ? `, ${gagal} gagal` : ""}.`, gagal ? "info" : "sukses");
    if (!gagal) tutupModalUnggahFoto();
  } else if (!gagal) {
    setPesanGalatModal("Tidak ada berkas yang diunggah.");
  }
}

async function hapusFoto(id) {
  const target = getDaftarFoto().find((f) => f.id === id);
  if (!target) return;
  if (!confirm(`Hapus foto "${target.namaFile}"? Berkas akan dipindahkan ke tempat sampah Google Drive.`)) return;

  try {
    if (target.driveFileId) {
      await pindahkanItemKeSampahDrive(target.driveFileId);
    }
    await hapusDokumenFoto(id);
    tampilkanToast("Foto dihapus.", "sukses");
  } catch (err) {
    tampilkanToast(`Gagal menghapus foto: ${formatPesanGalatDrive(err)}`, "galat");
  }
}

/** Memasang antarmuka halaman Foto (dipanggil sekali saat boot). */
export function initFoto() {
  if (sudahDipasang) return;
  sudahDipasang = true;

  pastikanKerangkaHalamanFoto();

  const daftarEl = document.getElementById("foto-list-region");
  const pratinjauEl = document.getElementById("foto-upload-pratinjau");
  const inputBerkas = document.getElementById("foto-upload-file");
  const inputCari = document.getElementById("foto-search-input");
  const selectFilter = document.getElementById("filter-foto-kegiatan");

  pasangElemenFoto({ daftar: daftarEl, pratinjau: pratinjauEl });

  // --- Halaman: buka modal, pencarian, filter ---
  document.getElementById("btn-unggah-foto")?.addEventListener("click", bukaModalUnggahFoto);

  inputCari?.addEventListener("input", () => {
    kataKunciCari = inputCari.value || "";
    renderDaftarFoto(getDaftarFoto(), petaJudulKegiatan(), {
      filterKegiatanId,
      kataKunci: kataKunciCari,
    });
  });

  selectFilter?.addEventListener("change", () => {
    filterKegiatanId = selectFilter.value || "ALL";
    renderDaftarFoto(getDaftarFoto(), petaJudulKegiatan(), {
      filterKegiatanId,
      kataKunci: kataKunciCari,
    });
  });

  // --- Modal unggah ---
  const form = document.getElementById("foto-upload-form");
  form?.addEventListener("submit", (evt) => {
    evt.preventDefault();
    if (sedangUnggah) return;
    const select = document.getElementById("foto-upload-kegiatan");
    const kegiatanId = String(select?.value || "").trim();
    if (!kegiatanId) {
      setPesanGalatModal("Pilih kegiatan tujuan terlebih dahulu.");
      return;
    }
    unggahBerkasTerpilih(kegiatanId, inputBerkas?.files);
  });

  inputBerkas?.addEventListener("change", () => {
    const info = document.getElementById("foto-upload-file-info");
    const jumlah = inputBerkas?.files?.length || 0;
    if (info) {
      info.textContent = jumlah
        ? `${jumlah} berkas dipilih.`
        : "Pilih satu atau lebih foto dari perangkat Anda.";
    }
    renderPratinjauUnggah(inputBerkas?.files);
  });

  document.getElementById("foto-upload-close-btn")?.addEventListener("click", () => tutupModalUnggahFoto());
  document.getElementById("foto-upload-cancel-btn")?.addEventListener("click", () => tutupModalUnggahFoto());
  document.getElementById("foto-upload-modal")?.addEventListener("click", (evt) => {
    if (evt.target === evt.currentTarget) tutupModalUnggahFoto();
  });

  // --- Daftar foto: hapus + penanganan thumbnail gagal ---
  daftarEl?.addEventListener("click", (evt) => {
    const tombol = evt.target.closest(".tombol-hapus-foto");
    if (!tombol) return;
    evt.preventDefault();
    hapusFoto(tombol.getAttribute("data-id-foto"));
  });

  daftarEl?.addEventListener(
    "error",
    (evt) => {
      const img = evt.target;
      if (!(img instanceof HTMLImageElement)) return;
      img.style.display = "none";
      const wadah = img.parentElement;
      if (wadah) wadah.classList.add("foto-kartu-gagal");
    },
    true
  );

  onPerubahanFoto(() => renderSemua());
  onPerubahanKegiatan(() => renderSemua());
  renderSemua();
}

/**
 * Memulai langganan realtime Firestore foto (dipanggil setelah login).
 * @returns {() => void} fungsi untuk melepas langganan
 */
export function subscribeFoto() {
  return langgananFoto({
    onGalat: (pesan) => tampilkanToast(`Gagal memuat foto: ${pesan}`, "galat"),
  });
}

/** Melepas langganan foto saat pengguna keluar. */
export function lepasFoto() {
  lepasLanggananFoto();
}
