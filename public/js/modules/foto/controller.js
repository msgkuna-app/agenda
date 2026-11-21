/**
 * Controller Modul Foto (fitur foto kegiatan)
 * Menangani unggah berkas ke Google Drive, penyimpanan metadata ke Firestore,
 * penghapusan foto, serta pemasangan listener antarmuka halaman Foto.
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
let filterKegiatanId = "";

function petaJudulKegiatan() {
  const peta = new Map();
  getDaftarKegiatan().forEach((k) => peta.set(k.id, k));
  return peta;
}

function renderSemua() {
  renderDaftarFoto(getDaftarFoto(), petaJudulKegiatan(), filterKegiatanId);
  perbaruiPilihanKegiatan();
}

function perbaruiPilihanKegiatan() {
  const select = document.getElementById("pilih-kegiatan-foto");
  if (!select) return;
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

  const selectFilter = document.getElementById("filter-foto-kegiatan");
  if (selectFilter) {
    const nilaiFilterLama = filterKegiatanId;
    selectFilter.innerHTML =
      '<option value="">Semua kegiatan</option>' +
      daftar.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.judul)}${k.tanggal ? ` (${escapeHtml(k.tanggal)})` : ""}</option>`).join("");
    selectFilter.value = nilaiFilterLama || "";
  }
}

async function unggahBerkasTerpilih(berkas) {
  const select = document.getElementById("pilih-kegiatan-foto");
  const kegiatanId = String(select?.value || "").trim();
  if (!kegiatanId) {
    tampilkanToast("Pilih kegiatan tujuan sebelum mengunggah foto.", "galat");
    return;
  }

  const daftar = Array.from(berkas || []);
  if (!daftar.length) {
    tampilkanToast("Pilih satu atau lebih berkas foto terlebih dahulu.", "galat");
    return;
  }

  const nonFoto = daftar.filter((f) => !String(f.type || "").startsWith("image/"));
  if (nonFoto.length) {
    tampilkanToast(`Berkas berikut bukan gambar: ${nonFoto.map((f) => f.name).join(", ")}.`, "galat");
    return;
  }

  const terlaluBesar = daftar.filter((f) => f.size > MAKS_UKURAN_BERKAS_MB * 1024 * 1024);
  if (terlaluBesar.length) {
    tampilkanToast(`Ukuran maksimum ${MAKS_UKURAN_BERKAS_MB} MB per berkas. Terlalu besar: ${terlaluBesar.map((f) => f.name).join(", ")}.`, "galat");
    return;
  }

  sedangUnggah = true;
  setelSedangUnggahFoto(true);

  let berhasil = 0;
  let gagal = 0;
  let folderId = "";
  try {
    folderId = await pastikanFolderFotoDrive();
  } catch (err) {
    sedangUnggah = false;
    setelSedangUnggahFoto(false);
    tampilkanToast(formatPesanGalatDrive(err), "galat");
    return;
  }

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
      tampilkanToast(`Gagal mengunggah "${file.name}": ${formatPesanGalatDrive(err)}`, "galat");
    }
  }

  sedangUnggah = false;
  setelSedangUnggahFoto(false);
  bersihkanFormUnggahFoto();

  if (berhasil) {
    tampilkanToast(`${berhasil} foto berhasil diunggah${gagal ? `, ${gagal} gagal` : ""}.`, gagal ? "info" : "sukses");
  } else if (!gagal) {
    tampilkanToast("Tidak ada berkas yang diunggah.", "info");
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

  const daftarEl = document.getElementById("daftar-foto");
  const kosongEl = document.getElementById("foto-kosong");
  const inputBerkas = document.getElementById("input-berkas-foto");
  const pratinjauEl = document.getElementById("pratinjau-foto");
  const tombolUnggah = document.getElementById("tombol-unggah-foto");
  const selectKegiatan = document.getElementById("pilih-kegiatan-foto");
  const selectFilter = document.getElementById("filter-foto-kegiatan");

  pasangElemenFoto({ daftar: daftarEl, kosong: kosongEl, inputBerkas, pratinjau: pratinjauEl });

  inputBerkas?.addEventListener("change", () => {
    renderPratinjauUnggah(inputBerkas.files);
  });

  tombolUnggah?.addEventListener("click", () => {
    if (sedangUnggah) return;
    const berkas = inputBerkas?.files;
    if (!berkas || !berkas.length) {
      tampilkanToast("Pilih berkas foto terlebih dahulu.", "galat");
      return;
    }
    unggahBerkasTerpilih(berkas);
  });

  selectFilter?.addEventListener("change", () => {
    filterKegiatanId = selectFilter.value || "";
    renderSemua();
  });

  selectKegiatan?.addEventListener("change", () => {
    if (!filterKegiatanId) return;
    filterKegiatanId = selectKegiatan.value || "";
    if (selectFilter) selectFilter.value = filterKegiatanId;
    renderSemua();
  });

  daftarEl?.addEventListener("click", (evt) => {
    const tombol = evt.target.closest(".tombol-hapus-foto");
    if (!tombol) return;
    evt.preventDefault();
    hapusFoto(tombol.getAttribute("data-id-foto"));
  });

  // Bila thumbnail Drive tidak dapat dimuat (mis. berkas privat), tampilkan
  // kotak placeholder alih-alih ikon gambar rusak.
  daftarEl?.addEventListener(
    "error",
    (evt) => {
      const img = evt.target;
      if (!(img instanceof HTMLImageElement)) return;
      img.style.display = "none";
      const tautan = img.closest(".foto-thumb");
      if (tautan) tautan.classList.add("foto-thumb-kosong");
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
