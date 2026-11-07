/**
 * Modul Dialog Catatan Google Docs (Fase 7C)
 * Menangani pembuatan dokumen baru Google Docs via Drive API, integrasi templat, dan penyimpanan referensi Firestore.
 */
import {
  getFirestoreDb,
  collection,
  addDoc
} from "../firebase-config.js";
import { loginWithGoogle, isDriveTokenExpired, formatPesanGalatAuth } from "../auth.js";
import { hariIni, parseTanggal } from "../util-tanggal.js";
import { escapeHtml } from "../sidebar.js";
import { buatDokumenGoogleDocsDrive, formatPesanGalatDrive } from "../drive.js";
import {
  DAFTAR_TEMPLAT_DOKUMEN,
  ambilInfoTemplatDokumen,
  bangunHtmlTemplatDokumen
} from "../templat-dokumen.js";
import {
  JENIS_CATATAN_GDOC,
  bukaTabBaruAman,
  uraiInputTag,
  cariKegiatanId,
  adalahGalatToken
} from "./util.js";
import { stateCatatan } from "./state.js";
import {
  perbaruiStatusJaringanCatatan,
  perbaruiOpsiKegiatanDiModal,
  tampilkanNotifikasiCatatan
} from "./render.js";
import { setGalatHapusGdoc } from "./dialog-hapus.js";

export function setGalatModalGdoc(pesan, butuhRelogin = false) {
  const box = document.getElementById("catatan-gdoc-alert");
  const txt = document.getElementById("catatan-gdoc-alert-text");
  const btn = document.getElementById("catatan-gdoc-relogin-btn");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
  if (btn) btn.hidden = !(pesan && butuhRelogin);
}

export function sinkronkanJudulSaranGdoc() {
  const judulInput = document.getElementById("catatan-gdoc-judul");
  const tplSelect = document.getElementById("catatan-gdoc-templat");
  const kegSelect = document.getElementById("catatan-gdoc-kegiatan");
  const descEl = document.getElementById("catatan-gdoc-templat-desc");
  if (!(judulInput instanceof HTMLInputElement) || !(tplSelect instanceof HTMLSelectElement) || !(kegSelect instanceof HTMLSelectElement)) return;

  const infoTpl = ambilInfoTemplatDokumen(tplSelect.value);
  if (descEl) descEl.textContent = infoTpl.deskripsi;

  const sekarang = judulInput.value.trim();
  if (sekarang && sekarang !== stateCatatan.judulOtomatisGdocTerakhir) return;

  const keg = cariKegiatanId(kegSelect.value);
  let saran = "";
  if (keg) {
    saran = infoTpl.id === "notulensi" ? `Notulensi - ${keg.judul}` : `${infoTpl.nama} - ${keg.judul}`;
  }
  if (saran) {
    judulInput.value = saran.slice(0, 160);
    stateCatatan.judulOtomatisGdocTerakhir = judulInput.value;
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

  stateCatatan.fokusSebelumModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  perbaruiOpsiKegiatanDiModal();

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

  stateCatatan.judulOtomatisGdocTerakhir = "";
  if (judulInput instanceof HTMLInputElement) {
    const diberikan = String(opsiAwal?.judul || "").trim();
    judulInput.value = diberikan ? diberikan.slice(0, 160) : "";
    if (diberikan) stateCatatan.judulOtomatisGdocTerakhir = judulInput.value;
  }
  sinkronkanJudulSaranGdoc();

  if (isDriveTokenExpired()) {
    setGalatModalGdoc("Sesi akses Google Drive telah kedaluwarsa. Tekan tombol \"Masuk ulang\" sebelum membuat dokumen.", true);
  } else {
    setGalatModalGdoc("", false);
  }

  stateCatatan.gdocModalTerbuka = true;
  modal.hidden = false;
  perbaruiStatusJaringanCatatan();
  requestAnimationFrame(() => { if (judulInput instanceof HTMLElement) judulInput.focus(); });
}

export function tutupModalBuatCatatanGdoc(kembalikanFokus = true) {
  if (stateCatatan.sedangMembuatGdoc) return;
  const modal = document.getElementById("catatan-gdoc-modal");
  if (!modal || !stateCatatan.gdocModalTerbuka) return;
  stateCatatan.gdocModalTerbuka = false;
  modal.hidden = true;
  setGalatModalGdoc("", false);
  if (kembalikanFokus && stateCatatan.fokusSebelumModal && document.contains(stateCatatan.fokusSebelumModal)) {
    stateCatatan.fokusSebelumModal.focus();
  }
  stateCatatan.fokusSebelumModal = null;
}

export async function masukUlangDriveDariCatatan(btn, setelahSukses) {
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    await loginWithGoogle();
    const banner = document.getElementById("token-expired-banner");
    if (banner) banner.hidden = !isDriveTokenExpired();
    if (typeof setelahSukses === "function") setelahSukses();
  } catch (err) {
    const pesan = formatPesanGalatAuth(err);
    if (stateCatatan.gdocModalTerbuka) setGalatModalGdoc(pesan, true);
    else if (stateCatatan.hapusGdocModalTerbuka) setGalatHapusGdoc(pesan, true);
    else tampilkanNotifikasiCatatan({ pesan, tipe: "danger", butuhRelogin: true });
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}

export async function tanganiSubmitCatatanGdoc(e) {
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

  stateCatatan.sedangMembuatGdoc = true;
  setGalatModalGdoc("", false);
  if (progWrap) progWrap.hidden = false;
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = true;

  try {
    const hasilDrive = await buatDokumenGoogleDocsDrive({ judul, htmlKonten });
    const sekarang = new Date().toISOString();
    await addDoc(collection(getFirestoreDb(), "catatan"), {
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

    stateCatatan.sedangMembuatGdoc = false;
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
    stateCatatan.sedangMembuatGdoc = false;
    if (progWrap) progWrap.hidden = true;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = !navigator.onLine;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = false;
  }
}