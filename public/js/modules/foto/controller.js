/**
 * Controller Modul Foto (fitur foto kegiatan)
 * Menangani modal unggah berkas ke Google Drive, penyimpanan metadata ke
 * Firestore, penghapusan foto, serta pemuatan thumbnail yang ditampilkan di
 * dalam kartu kegiatan. Halaman Foto tersendiri sudah dihapus.
 */
import { MAKS_UKURAN_BERKAS_MB } from "../../config/constants.js";
import { formatPesanGalatDrive, pastikanFolderFotoDrive, unggahBerkasKeDrive, ambilThumbnailFotoDrive } from "../../services/driveService.js";
import { tampilkanToast } from "../../shared/toast.js";
import { getDaftarKegiatan } from "../kegiatan/index.js";
import { renderDaftarKegiatan } from "../kegiatan/view.js";
import {
  perbaruiPilihanHariLampiran,
  ambilTanggalLampiranTerpilih,
  labelTanggalLampiran
} from "../../lampiran-hari.js";
import {
  getDaftarFoto,
  onPerubahanFoto,
  langgananFoto,
  lepasLanggananFoto,
  simpanMetadataFoto,
  hapusLunakFoto,
} from "./state.js";
import {
  renderPratinjauUnggah,
  bersihkanFormUnggahFoto,
  setelSedangUnggahFoto,
} from "./view.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";

let sudahDipasang = false;
let sedangUnggah = false;
let modalTerbuka = false;
let kegiatanIdSaatIni = "";
let tanggalSaatIni = "";
let fokusSebelumModal = null;

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

/** Membuka modal unggah untuk satu kegiatan tertentu (dipanggil dari kartu). */
export function bukaModalUnggahFoto(kegiatanId, tanggalAwal = "") {
  const id = String(kegiatanId || "").trim();
  const kegiatan = getDaftarKegiatan().find((k) => k.id === id);
  if (!id || !kegiatan) {
    tampilkanToast("Kegiatan tidak ditemukan.", "galat");
    return;
  }
  if (!navigator.onLine) {
    tampilkanToast("Tidak ada koneksi internet. Unggah foto memerlukan sambungan aktif.", "galat");
    return;
  }
  const modal = document.getElementById("foto-upload-modal");
  if (!modal) return;

  fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  kegiatanIdSaatIni = id;

  const judulEl = document.getElementById("foto-upload-kegiatan-judul");
  if (judulEl) judulEl.textContent = kegiatan.judul || "(Tanpa judul)";

  // Pilihan hari hanya muncul untuk kegiatan berturutan. Bila tersembunyi,
  // tanggalSaatIni tetap kosong sehingga data lampiran sama seperti sebelumnya
  // (lampiran tanpa tanggal dianggap milik hari pertama kegiatan).
  perbaruiPilihanHariLampiran({
    idSelect: "foto-upload-hari",
    idWrap: "foto-upload-hari-wrap",
    kegiatanId: id,
    daftarKegiatan: getDaftarKegiatan(),
    tanggalTerpilih: tanggalAwal
  });
  tanggalSaatIni = ambilTanggalLampiranTerpilih("foto-upload-hari");

  bersihkanFormUnggahFoto();
  setPesanGalatModal("");
  setelSedangUnggahFoto(false);

  modalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    document.getElementById("foto-upload-file")?.focus();
  });
}

function tutupModalUnggahFoto(kembalikanFokus = true) {
  const modal = document.getElementById("foto-upload-modal");
  if (!modal || !modalTerbuka) return;
  modalTerbuka = false;
  modal.hidden = true;
  kegiatanIdSaatIni = "";
  tanggalSaatIni = "";
  bersihkanFormUnggahFoto();
  setPesanGalatModal("");
  if (kembalikanFokus && fokusSebelumModal && document.contains(fokusSebelumModal)) {
    fokusSebelumModal.focus();
  }
  fokusSebelumModal = null;
}

async function unggahBerkasTerpilih(kegiatanId, berkas, tanggalLampiran = "") {
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
        tanggal: tanggalLampiran,
        driveFileId: hasil.id,
        namaFile: hasil.name || file.name,
        tautan: hasil.webViewLink || "",
        thumbnailLink: hasil.thumbnailLink || "",
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
    const labelHari = labelTanggalLampiran(tanggalLampiran);
    const infoHari = labelHari ? ` pada ${labelHari}` : "";
    tampilkanToast(`${berhasil} foto berhasil diunggah${infoHari}${gagal ? `, ${gagal} gagal` : ""}.`, gagal ? "info" : "sukses");
    if (!gagal) tutupModalUnggahFoto();
  } else if (!gagal) {
    setPesanGalatModal("Tidak ada berkas yang diunggah.");
  }
}

async function hapusFoto(id) {
  const target = getDaftarFoto().find((f) => f.id === id);
  if (!target) return;
  if (!confirm(`Pindahkan foto "${target.namaFile}" ke Tempat Sampah? Berkas aslinya tetap tersimpan di Google Drive dan dapat dipulihkan dalam 30 hari.`)) return;

  try {
    // Hapus lunak: hanya metadata yang ditandai, Drive tidak disentuh sama sekali,
    // sehingga berhasil juga saat luring. Berkas dipindahkan ke Sampah Drive saat
    // foto dihapus permanen dari Tempat Sampah.
    await hapusLunakFoto(id);
    tampilkanToast("Foto dipindahkan ke Tempat Sampah.", "success");
  } catch (err) {
    tampilkanToast(`Gagal memindahkan foto: ${formatPesanGalatFirestore(err)}`, "danger");
  }
}

/**
 * Memuat thumbnail setiap foto pada cakupan dokumen melalui Drive API
 * (token OAuth) dan mengganti atribut src. Hasil di-cache di driveService
 * sehingga render ulang tidak memicu unduhan berulang.
 */
export function muatThumbnailDalam(root = document) {
  const cakupan = root instanceof Element ? root : document;
  cakupan.querySelectorAll("img[data-thumb-drive]").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.src) return;
    const fileId = img.getAttribute("data-thumb-drive");
    if (!fileId) return;
    ambilThumbnailFotoDrive(fileId)
      .then((urlLokal) => {
        if (document.contains(img)) img.src = urlLokal;
      })
      .catch(() => {
        // Sembunyikan elemen gambar (hindari ikon rusak); foto tetap dapat
        // dibuka lewat tautan Drive.
        img.style.display = "none";
        const wadah = img.parentElement;
        if (wadah) wadah.classList.add("foto-kartu-gagal");
      });
  });
}

/** Render ulang daftar kegiatan setelah data foto berubah. */
function renderUlangKegiatan() {
  renderDaftarKegiatan();
  muatThumbnailDalam(document);
}

/** Memasang antarmuka modul foto (dipanggil sekali saat boot). */
export function initFoto() {
  if (sudahDipasang) return;
  sudahDipasang = true;

  // --- Tombol unggah foto pada kartu kegiatan (delegasi dokumen) ---
  document.addEventListener("click", (evt) => {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target) return;

    const tombolUnggah = target.closest('[data-action="unggah-foto"]');
    if (tombolUnggah) {
      evt.preventDefault();
      bukaModalUnggahFoto(
        tombolUnggah.getAttribute("data-id"),
        tombolUnggah.getAttribute("data-tanggal") || ""
      );
      return;
    }

    const tombolHapus = target.closest(".tombol-hapus-foto");
    if (tombolHapus) {
      evt.preventDefault();
      hapusFoto(tombolHapus.getAttribute("data-id-foto"));
    }
  });

  // --- Modal unggah ---
  const inputBerkas = document.getElementById("foto-upload-file");
  const selectHari = document.getElementById("foto-upload-hari");
  const form = document.getElementById("foto-upload-form");
  form?.addEventListener("submit", (evt) => {
    evt.preventDefault();
    if (sedangUnggah) return;
    if (!kegiatanIdSaatIni) {
      setPesanGalatModal("Kegiatan tujuan tidak valid. Tutup modal lalu coba lagi dari kartu kegiatan.");
      return;
    }
    unggahBerkasTerpilih(kegiatanIdSaatIni, inputBerkas?.files, tanggalSaatIni);
  });

  // Pengguna boleh memilih hari lain sebelum menekan Unggah ke Drive.
  selectHari?.addEventListener("change", () => {
    tanggalSaatIni = ambilTanggalLampiranTerpilih("foto-upload-hari");
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

  // --- Pemuatan thumbnail saat kartu kegiatan dirender ulang ---
  const daftarEl = document.getElementById("kegiatan-list-region");
  if (daftarEl && typeof MutationObserver !== "undefined") {
    const pengamat = new MutationObserver(() => muatThumbnailDalam(daftarEl));
    pengamat.observe(daftarEl, { childList: true, subtree: true });
  }

  // --- Penanganan gambar gagal dimuat (capture agar error img tertangkap) ---
  document.addEventListener(
    "error",
    (evt) => {
      const img = evt.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.hasAttribute("data-thumb-drive")) return;
      img.style.display = "none";
      const wadah = img.parentElement;
      if (wadah) wadah.classList.add("foto-kartu-gagal");
    },
    true
  );

  onPerubahanFoto(() => renderUlangKegiatan());
  renderUlangKegiatan();
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
