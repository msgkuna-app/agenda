/**
 * Controller Modul Kegiatan (Tahap 3e: dipisah dari kegiatan.js)
 * Mengikat antarmuka halaman Kegiatan: modal tambah/ubah & hapus, modal detail
 * beserta catatan terkait, panel filter, ubah status cepat, dan siklus
 * subscribe/unsubscribe langganan Firestore. Render dipicu lewat
 * onPerubahanKegiatan() dari state (pola yang sama dengan modul pengaturan).
 */
import { DAFTAR_STATUS_KEGIATAN, KOLEKSI } from "../../config/constants.js";
import { tambahItem, perbaruiItem } from "../../services/firestoreRepository.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import { escapeHtml } from "../../util-html.js";
import { inisialisasiDialogKelolaKategori } from "../kategori/index.js";
import {
  hariIni,
  parseTanggal,
  tanggalDalamRentang,
  geserTanggal,
  jumlahHariRentang
} from "../../util-tanggal.js";
import { pindahKeBagian } from "../../sidebar.js";
import { tampilkanToast } from "../../shared/toast.js";
import {
  JENIS_CATATAN_GDOC,
  getCatatanTerkaitKegiatan,
  onPerubahanCatatan,
  bukaModalCatatanSingkat,
  bukaModalBuatCatatanGdoc,
  formatTanggalCatatan,
  tautanAmanGoogleDocs
} from "../../modules/catatan/index.js";
import {
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  onPerubahanKegiatan,
  beritahuPerubahanKegiatan,
  terapkanPerubahanLokalKegiatan,
  ubahStatusKegiatanCepat,
  hapusLunakKegiatan,
  pulihkanKegiatan,
  hitungKegiatanPemakaiLokal,
  muatLebihBanyakKegiatan,
  tandaiKegiatanSudahDimuat,
  setelOpsiPeristiwaKegiatan,
  langgananKategoriKegiatan,
  mulaiLanggananJendelaKegiatan,
  mulaiLanggananHalamanKegiatan,
  lepasLanggananKegiatan,
  hitungRentangJendela
} from "./state.js";
import { validJamOpsional, formatTanggalTampilan } from "./format.js";
import { onPerubahanDokumen } from "../dokumen/state.js";
import {
  IKON_CATATAN_META,
  IKON_GDOC_MINI,
  IKON_TAB_BARU,
  pastikanKerangkaHalamanKegiatan,
  perbaruiDropdownKategori,
  getFilterKategoriId,
  getFilterStatus,
  setKataKunciCari,
  setFilterKategoriId,
  setFilterStatus,
  setUrutanTanggal,
  pasangFilterKegiatan,
  tutupPanelFilterKegiatan,
  renderDaftarKegiatan,
  tampilkanGalatHalamanKegiatan,
  setPesanGalatFormKegiatan,
  perbaruiPetunjukHariLiburForm
} from "./view.js";

let antarmukaSudahDiikat = false;
let dialogKelolaKategoriCtrl = null;

let formModalTerbuka = false;
let hapusModalTerbuka = false;
let idKegiatanAkanDihapus = null;
let fokusSebelumModalKegiatan = null;
let pembukaDetailKegiatanFn = null;

// --- Modal detail & catatan terkait ------------------------------------------

let idKegiatanTerakhirDiklik = "";
let idKegiatanDetailAktif = "";

export function daftarkanPembukaDetailKegiatan(fn) {
  pembukaDetailKegiatanFn = typeof fn === "function" ? fn : null;
}

function deteksiKegiatanPadaModalDetail() {
  const modal = document.getElementById("kegiatan-detail-modal");
  const detailBody = document.getElementById("kegiatan-detail-body");
  if (!modal || modal.hidden || !detailBody) return null;

  const semuaKegiatan = getDaftarKegiatan();

  const elDenganId = detailBody.querySelector("[data-id]");
  if (elDenganId) {
    const idDariDom = String(elDenganId.getAttribute("data-id") || "").trim();
    const ditemukan = semuaKegiatan.find((k) => k.id === idDariDom);
    if (ditemukan) return ditemukan;
  }

  const teksBody = String(detailBody.textContent || "");
  for (const kandidatId of [idKegiatanDetailAktif, idKegiatanTerakhirDiklik]) {
    if (!kandidatId) continue;
    const item = semuaKegiatan.find((k) => k.id === kandidatId);
    if (item && (!item.judul || teksBody.includes(item.judul))) {
      return item;
    }
  }

  const headingEl = detailBody.querySelector("h3, h4, .kegiatan-card-title");
  if (headingEl) {
    const teksJudul = String(headingEl.textContent || "").trim();
    const cocok = semuaKegiatan.find((k) => k.judul.trim() === teksJudul);
    if (cocok) return cocok;
  }

  return null;
}

function renderCatatanTerkaitDiDetailModal() {
  const modal = document.getElementById("kegiatan-detail-modal");
  const wadah = document.getElementById("kegiatan-detail-catatan-section");
  if (!modal || !wadah) return;

  if (modal.hidden) {
    wadah.innerHTML = "";
    return;
  }

  const kegiatan = deteksiKegiatanPadaModalDetail();
  if (!kegiatan) {
    wadah.innerHTML = "";
    return;
  }

  idKegiatanDetailAktif = kegiatan.id;
  const catatanTerkait = getCatatanTerkaitKegiatan(kegiatan.id);
  const sedangOnline = navigator.onLine;

  const daftarHtml = catatanTerkait.length === 0
    ? `<p class="detail-catatan-empty">Belum ada catatan atau notulensi yang dikaitkan dengan kegiatan ini.</p>`
    : `<ul class="detail-catatan-list">${catatanTerkait.map((c) => {
        const gdoc = c.jenis === JENIS_CATATAN_GDOC;
        const urlDocs = gdoc ? tautanAmanGoogleDocs(c) : "";
        return `<li class="detail-catatan-item">
          <div class="detail-catatan-main">
            <div class="detail-catatan-title-row">
              <span class="detail-catatan-icon" aria-hidden="true">${gdoc ? IKON_GDOC_MINI : IKON_CATATAN_META}</span>
              <span class="detail-catatan-title">${escapeHtml(c.judul)}</span>
              <span class="catatan-kind-badge ${gdoc ? "kind-gdoc" : "kind-singkat"}">${gdoc ? "Google Docs" : "Singkat"}</span>
            </div>
            <span class="detail-catatan-meta">${escapeHtml(formatTanggalCatatan(c.tanggal))}</span>
            ${!gdoc && c.isi ? `<p class="detail-catatan-snippet">${escapeHtml(c.isi)}</p>` : ""}
          </div>
          <div class="detail-catatan-item-actions">
            ${
              gdoc
                ? `<a href="${escapeHtml(urlDocs)}" target="_blank" rel="noopener" class="btn-secondary btn-sm-touch">${IKON_TAB_BARU}<span>Buka di Google Docs</span></a>`
                : `<button type="button" class="btn-secondary btn-sm-touch" data-detail-catatan-action="edit-singkat" data-catatan-id="${escapeHtml(c.id)}">Lihat / Ubah</button>`
            }
          </div>
        </li>`;
      }).join("")}</ul>`;

  wadah.innerHTML = `<section class="detail-catatan-box" aria-labelledby="detail-catatan-heading">
    <div class="detail-catatan-header">
      <div class="detail-catatan-heading-wrap">
        <h3 id="detail-catatan-heading" class="sub-card-title">Catatan Terkait (${catatanTerkait.length})</h3>
        <span class="field-hint-text">Catatan singkat dan notulensi Google Docs untuk kegiatan ini</span>
      </div>
      <div class="detail-catatan-actions">
        <button type="button" class="btn-secondary btn-sm-touch" data-detail-catatan-action="tambah-catatan" data-kegiatan-id="${escapeHtml(kegiatan.id)}">+ Tambah catatan</button>
        <button type="button" class="btn-primary btn-sm-touch" data-detail-catatan-action="buat-notulensi" data-kegiatan-id="${escapeHtml(kegiatan.id)}"${!sedangOnline ? ' disabled title="Tidak ada koneksi internet. Pembuatan Google Docs memerlukan sambungan aktif."' : ""}>${IKON_GDOC_MINI}<span>Buat notulensi</span></button>
      </div>
    </div>
    ${daftarHtml}
  </section>`;
}

function picuBuatNotulensiUntukKegiatan(kegiatan, tanggalAwal = "") {
  if (!kegiatan) return;
  // Tanggal notulensi: hari yang sedang dibuka (bila diberikan dan masih di dalam
  // rentang kegiatan), selain itu hari pertama kegiatan, selain itu hari ini.
  const diminta = typeof tanggalAwal === "string" ? tanggalAwal.trim() : "";
  const tanggalNotulensi = parseTanggal(diminta) && tanggalDalamRentang(kegiatan, diminta)
    ? diminta
    : parseTanggal(kegiatan.tanggal)
      ? kegiatan.tanggal
      : hariIni();
  bukaModalBuatCatatanGdoc({
    templat: "notulensi",
    kegiatanId: kegiatan.id,
    tanggal: tanggalNotulensi,
    judul: `Notulensi - ${kegiatan.judul}`
  });
}

/**
 * Pintu publik pembuatan notulensi (Tahap 8b): kartu halaman Jadwal memakai
 * jalur yang SAMA dengan halaman Kegiatan — templat "notulensi", kegiatanId,
 * tanggal kegiatan, dan judul "Notulensi - <judul kegiatan>" — sehingga tidak
 * ada logika preset yang disalin ke berkas lain.
 *
 * Sejak v1.8.67 `tanggalHari` boleh diberikan oleh pemanggil: pada kegiatan
 * berturutan, kartu Jadwal merender satu kartu per hari, sehingga notulensi
 * seharusnya bertanggal HARI YANG SEDANG DIBUKA, bukan selalu hari pertama.
 * Tanggal di luar rentang kegiatan diabaikan (jatuh ke hari pertama).
 *
 * @param {string} kegiatanId
 * @param {string} [tanggalHari] tanggal kartu yang diklik (YYYY-MM-DD)
 * @returns {boolean} false bila id kosong atau kegiatan tidak ditemukan.
 */
export function buatNotulensiUntukKegiatan(kegiatanId, tanggalHari = "") {
  const id = String(kegiatanId || "").trim();
  if (!id) return false;
  const kegiatan = getDaftarKegiatan().find((k) => k.id === id);
  if (!kegiatan) return false;
  picuBuatNotulensiUntukKegiatan(kegiatan, tanggalHari);
  return true;
}

// --- Modal tambah / ubah kegiatan ---------------------------------------------

export function bukaModalFormKegiatan(kegiatanEdit = null, tanggalAwal = null) {
  const modal = document.getElementById("kegiatan-form-modal");
  const titleEl = document.getElementById("kegiatan-form-title");
  const idInput = document.getElementById("kegiatan-edit-id");
  const judulInput = document.getElementById("kegiatan-judul-input");
  const tanggalInput = document.getElementById("kegiatan-tanggal-input");
  const tanggalSelesaiInput = document.getElementById("kegiatan-tanggal-selesai-input");
  const mulaiInput = document.getElementById("kegiatan-mulai-input");
  const selesaiInput = document.getElementById("kegiatan-selesai-input");
  const lokasiInput = document.getElementById("kegiatan-lokasi-input");
  const kategoriSelect = document.getElementById("kegiatan-kategori-select");
  const statusSelect = document.getElementById("kegiatan-status-select");
  const catatanInput = document.getElementById("kegiatan-catatan-input");
  const submitBtn = document.getElementById("kegiatan-form-submit-btn");
  if (!modal) return;

  fokusSebelumModalKegiatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setPesanGalatFormKegiatan("");
  perbaruiDropdownKategori();

  if (kegiatanEdit) {
    if (titleEl) titleEl.textContent = "Ubah Kegiatan";
    if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
    if (idInput) idInput.value = kegiatanEdit.id;
    if (judulInput) judulInput.value = kegiatanEdit.judul || "";
    if (tanggalInput) tanggalInput.value = kegiatanEdit.tanggal || hariIni();
    if (tanggalSelesaiInput) tanggalSelesaiInput.value = kegiatanEdit.tanggalSelesai || "";
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
    if (tanggalSelesaiInput) tanggalSelesaiInput.value = "";
    if (mulaiInput) mulaiInput.value = "";
    if (selesaiInput) selesaiInput.value = "";
    if (lokasiInput) lokasiInput.value = "";
    if (kategoriSelect instanceof HTMLSelectElement) {
      const daftarKat = manajerKategoriKegiatan.getDaftarKategori();
      const filterKatId = getFilterKategoriId();
      if (filterKatId !== "ALL" && filterKatId !== "__TANPA_KATEGORI__") {
        kategoriSelect.value = filterKatId;
      } else {
        kategoriSelect.value = daftarKat.length > 0 ? daftarKat[0].id : "";
      }
    }
    if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "Rencana";
    if (catatanInput) catatanInput.value = "";
  }

  if (tanggalInput) {
    perbaruiPetunjukHariLiburForm(tanggalInput.value);
  }

  formModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (judulInput instanceof HTMLElement) judulInput.focus();
  });
}

/**
 * Membuka form Tambah Kegiatan yang sudah terisi salinan sebuah kegiatan
 * (Tahap 8c). Salinan adalah kegiatan BARU: `#kegiatan-edit-id` dibiarkan
 * kosong sehingga penyimpanan memakai `tambahItem`, bukan `perbaruiItem`.
 *
 * Ketetapan pemilik: tanggal salinan = HARI INI (bukan tanggal asal), dengan
 * durasi yang sama seperti asal; judul disalin apa adanya tanpa akhiran
 * penanda. Status direset ke "Rencana" karena salinan belum pernah berjalan.
 *
 * @param {string} kegiatanId id kegiatan yang hendak diduplikasi
 * @returns {boolean} false bila id kosong atau kegiatan tidak ditemukan
 */
export function bukaModalDuplikatKegiatan(kegiatanId) {
  const id = String(kegiatanId || "").trim();
  if (!id) return false;
  const asal = getDaftarKegiatan().find((k) => k.id === id);
  if (!asal) return false;

  const tanggalSalinan = hariIni();
  bukaModalFormKegiatan(null, tanggalSalinan);

  const modal = document.getElementById("kegiatan-form-modal");
  if (!modal || modal.hidden) return false;

  const isiNilai = (elemenId, nilai) => {
    const el = document.getElementById(elemenId);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      el.value = nilai;
    }
  };

  // Id dikosongkan sekali lagi agar tidak ada jalur yang membuatnya jadi "ubah".
  isiNilai("kegiatan-edit-id", "");
  isiNilai("kegiatan-judul-input", asal.judul || "");
  isiNilai("kegiatan-mulai-input", asal.waktuMulai || "");
  isiNilai("kegiatan-selesai-input", asal.waktuSelesai || "");
  isiNilai("kegiatan-lokasi-input", asal.lokasi || "");
  isiNilai("kegiatan-catatan-input", asal.catatan || "");

  const infoKat = manajerKategoriKegiatan.cariInfoKategori(asal.kategoriId);
  isiNilai("kegiatan-kategori-select", infoKat.tetap ? "" : infoKat.id);
  isiNilai("kegiatan-status-select", "Rencana");

  // Durasi asal dipertahankan: kegiatan 5 hari tetap 5 hari, mulai hari ini.
  const totalHari = jumlahHariRentang(asal);
  const tanggalSelesaiSalinan =
    totalHari > 1 ? geserTanggal(tanggalSalinan, totalHari - 1) : "";
  isiNilai("kegiatan-tanggal-selesai-input", tanggalSelesaiSalinan);

  // Judul modal dibedakan agar jelas ini bukan penyuntingan kegiatan asal.
  const titleEl = document.getElementById("kegiatan-form-title");
  if (titleEl) titleEl.textContent = "Duplikat Kegiatan";

  const judulInput = document.getElementById("kegiatan-judul-input");
  if (judulInput instanceof HTMLElement) {
    // Didaftarkan SETELAH fokus milik bukaModalFormKegiatan agar giliran fokus
    // terakhir jatuh ke sini, dan seluruh judul tersorot siap ditimpa.
    requestAnimationFrame(() => {
      judulInput.focus();
      if (judulInput instanceof HTMLInputElement) judulInput.select();
    });
  }
  return true;
}

function tutupModalFormKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-form-modal");
  if (!modal || !formModalTerbuka) return;
  formModalTerbuka = false;
  modal.hidden = true;
  setPesanGalatFormKegiatan("");

  const hintEl = document.getElementById("kegiatan-tanggal-hint-libur");
  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "";
    hintEl.className = "field-hint-libur";
  }

  if (kembalikanFokus && fokusSebelumModalKegiatan && document.contains(fokusSebelumModalKegiatan)) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

// --- Dialog hapus (pindah ke Tempat Sampah) -----------------------------------

export function bukaDialogHapusKegiatan(item) {
  const modal = document.getElementById("kegiatan-delete-modal");
  const title = document.getElementById("kegiatan-delete-title");
  const desc = document.getElementById("kegiatan-delete-desc");
  const cancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  if (!modal || !item) return;

  fokusSebelumModalKegiatan = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idKegiatanAkanDihapus = item.id;
  if (title) {
    title.textContent = "Pindahkan ke Tempat Sampah?";
  }
  if (desc) {
    desc.textContent = `Kegiatan "${item.judul}" pada ${formatTanggalTampilan(item.tanggal)} akan dipindahkan ke Tempat Sampah. Dapat dipulihkan selama 30 hari.`;
  }

  hapusModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-delete-modal");
  if (!modal || !hapusModalTerbuka) return;
  hapusModalTerbuka = false;
  idKegiatanAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalKegiatan && document.contains(fokusSebelumModalKegiatan)) {
    fokusSebelumModalKegiatan.focus();
  }
  fokusSebelumModalKegiatan = null;
}

// --- Formulir -----------------------------------------------------------------

function ambilDanValidasiDataForm() {
  const judul = String(document.getElementById("kegiatan-judul-input")?.value || "").trim();
  const tanggal = String(document.getElementById("kegiatan-tanggal-input")?.value || "").trim();
  const tanggalSelesai = String(document.getElementById("kegiatan-tanggal-selesai-input")?.value || "").trim();
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
  if (tanggalSelesai && !parseTanggal(tanggalSelesai)) {
    throw new Error("Tanggal selesai harus berupa tanggal yang benar atau dikosongkan.");
  }
  if (tanggalSelesai && tanggalSelesai < tanggal) {
    throw new Error("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
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
  return { judul, catatan, tanggal, tanggalSelesai, waktuMulai, waktuSelesai, lokasi, kategoriId, status };
}

// --- Pintasan filter dari modul lain -------------------------------------------

export function terapkanFilterKategoriKegiatan(targetKategoriId) {
  setKataKunciCari("");
  setFilterStatus("ALL");
  setFilterKategoriId(targetKategoriId || "ALL");
  tutupPanelFilterKegiatan();

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = "ALL";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = getFilterKategoriId();

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

export function terapkanFilterStatusKegiatan(targetStatus) {
  setKataKunciCari("");
  setFilterKategoriId("ALL");
  setFilterStatus(DAFTAR_STATUS_KEGIATAN.includes(targetStatus) ? targetStatus : "ALL");
  tutupPanelFilterKegiatan();

  const searchInput = document.getElementById("kegiatan-search-input");
  const statusSelect = document.getElementById("kegiatan-filter-status");
  const katSelect = document.getElementById("kegiatan-filter-kategori");

  if (searchInput instanceof HTMLInputElement) searchInput.value = "";
  perbaruiDropdownKategori();
  if (katSelect instanceof HTMLSelectElement) katSelect.value = "ALL";
  if (statusSelect instanceof HTMLSelectElement) statusSelect.value = getFilterStatus();

  pindahKeBagian("kegiatan");
  renderDaftarKegiatan();
}

// --- Inisialisasi & langganan ---------------------------------------------------

export function initHalamanKegiatan() {
  pastikanKerangkaHalamanKegiatan();
  pasangFilterKegiatan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  // Pola pengaturan: state memberi tahu, controller merender.
  onPerubahanKegiatan(() => {
    renderDaftarKegiatan();
  });

  dialogKelolaKategoriCtrl = inisialisasiDialogKelolaKategori({
    manajer: manajerKategoriKegiatan,
    // Wajib fungsi SINKRON pengembali angka: view.js memakainya sebagai nilai,
    // bukan promise. Angka akurat dari server menyusul lewat cacheHitunganServer
    // (segarkanHitunganServerSemua -> manajer.hitungPemakaiDariServer).
    hitungPemakaiLokal: hitungKegiatanPemakaiLokal,
    onLihatItemKategori: (katId) => terapkanFilterKategoriKegiatan(katId),
    judulDialog: "Kelola Kategori Kegiatan"
  });

  manajerKategoriKegiatan.onChange(() => {
    perbaruiDropdownKategori();
    beritahuPerubahanKegiatan();
  });

  onPerubahanCatatan(() => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });

  // Dokumen terkait ditampilkan di kartu kegiatan — segarkan saat data dokumen berubah.
  onPerubahanDokumen(() => {
    renderDaftarKegiatan();
  });

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest("#kegiatan-detail-modal")) return;
      const pembawaId = target.closest("[data-id], [data-kegiatan-id]");
      if (!pembawaId) return;
      const kandidat = String(
        pembawaId.getAttribute("data-kegiatan-id") || pembawaId.getAttribute("data-id") || ""
      ).trim();
      if (kandidat && getDaftarKegiatan().some((k) => k.id === kandidat)) {
        idKegiatanTerakhirDiklik = kandidat;
      }
    },
    true
  );

  const detailModal = document.getElementById("kegiatan-detail-modal");
  const detailBody = document.getElementById("kegiatan-detail-body");
  const detailCatatanSection = document.getElementById("kegiatan-detail-catatan-section");

  if (detailModal && typeof MutationObserver !== "undefined") {
    const pengamatDetail = new MutationObserver(() => {
      if (detailModal.hidden) {
        idKegiatanDetailAktif = "";
      }
      renderCatatanTerkaitDiDetailModal();
    });
    pengamatDetail.observe(detailModal, { attributes: true, attributeFilter: ["hidden"] });
    if (detailBody) {
      pengamatDetail.observe(detailBody, { childList: true });
    }
  }

  if (detailCatatanSection) {
    detailCatatanSection.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-detail-catatan-action]") : null;
      if (!btn) return;
      const aksi = btn.getAttribute("data-detail-catatan-action");

      if (aksi === "tambah-catatan") {
        const kegId = btn.getAttribute("data-kegiatan-id") || idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        bukaModalCatatanSingkat(null, {
          kegiatanId: keg ? keg.id : "",
          tanggal: keg && parseTanggal(keg.tanggal) ? keg.tanggal : hariIni()
        });
      } else if (aksi === "buat-notulensi") {
        const kegId = btn.getAttribute("data-kegiatan-id") || idKegiatanDetailAktif;
        const keg = getDaftarKegiatan().find((k) => k.id === kegId);
        if (keg) picuBuatNotulensiUntukKegiatan(keg);
      } else if (aksi === "edit-singkat") {
        const catId = btn.getAttribute("data-catatan-id") || "";
        const kegId = idKegiatanDetailAktif;
        const ditemukan = getCatatanTerkaitKegiatan(kegId).find((c) => c.id === catId);
        if (ditemukan) bukaModalCatatanSingkat(ditemukan);
      }
    });
  }

  window.addEventListener("online", () => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });
  window.addEventListener("offline", () => {
    renderDaftarKegiatan();
    renderCatatanTerkaitDiDetailModal();
  });

  const btnKelolaKat = document.getElementById("btn-buka-kelola-kategori");
  if (btnKelolaKat) btnKelolaKat.addEventListener("click", () => dialogKelolaKategoriCtrl?.buka());

  const btnTambah = document.getElementById("btn-tambah-kegiatan");
  if (btnTambah) btnTambah.addEventListener("click", () => bukaModalFormKegiatan(null));

  const searchInput = document.getElementById("kegiatan-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      setKataKunciCari(searchInput.value);
      renderDaftarKegiatan();
    });
  }

  const filterKatSelect = document.getElementById("kegiatan-filter-kategori");
  if (filterKatSelect) {
    filterKatSelect.addEventListener("change", () => {
      setFilterKategoriId(filterKatSelect.value);
      renderDaftarKegiatan();
    });
  }

  const filterStatusSelect = document.getElementById("kegiatan-filter-status");
  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", () => {
      setFilterStatus(filterStatusSelect.value);
      renderDaftarKegiatan();
    });
  }

  const sortSelect = document.getElementById("kegiatan-sort-tanggal");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      setUrutanTanggal(sortSelect.value === "desc" ? "desc" : "asc");
      renderDaftarKegiatan();
    });
  }

  const listRegion = document.getElementById("kegiatan-list-region");
  if (listRegion) {
    listRegion.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-action], #btn-muat-lebih-kegiatan") : null;
      if (!btn) return;

      if (btn.id === "btn-muat-lebih-kegiatan") {
        muatLebihBanyakKegiatan().then((pesan) => {
          if (pesan) tampilkanGalatHalamanKegiatan(pesan);
        });
        return;
      }

      const aksi = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      const tgl = btn.getAttribute("data-tanggal") || "";
      if (!id) return;

      const item = getDaftarKegiatan().find((k) => k.id === id);
      if (!item) return;

      if (aksi === "detail-kegiatan") {
        idKegiatanDetailAktif = item.id;
        idKegiatanTerakhirDiklik = item.id;
        if (typeof pembukaDetailKegiatanFn === "function") {
          pembukaDetailKegiatanFn(item.id);
        }
      } else if (aksi === "buat-notulensi") {
        // Kirim hari kartu yang diklik agar notulensi bertanggal hari itu,
        // bukan selalu hari pertama kegiatan berturutan (v1.8.69).
        picuBuatNotulensiUntukKegiatan(item, tgl);
      } else if (aksi === "edit-kegiatan") {
        bukaModalFormKegiatan(item);
      } else if (aksi === "duplikat-kegiatan") {
        // Salinan adalah kegiatan BARU: tanggal hari ini, judul sama (Tahap 8c).
        bukaModalDuplikatKegiatan(item.id);
      } else if (aksi === "delete-kegiatan") {
        bukaDialogHapusKegiatan(item);
      }
    });

    listRegion.addEventListener("change", async (e) => {
      const select = e.target instanceof HTMLSelectElement && e.target.getAttribute("data-action") === "quick-status" ? e.target : null;
      if (!select) return;

      const id = select.getAttribute("data-id");
      const statusBaru = select.value;
      if (!id || !DAFTAR_STATUS_KEGIATAN.includes(statusBaru)) return;

      tampilkanGalatHalamanKegiatan("");
      select.disabled = true;
      try {
        await ubahStatusKegiatanCepat(id, statusBaru);
      } catch (err) {
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
        renderDaftarKegiatan();
      } finally {
        select.disabled = false;
      }
    });
  }

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

  const tanggalInputEl = document.getElementById("kegiatan-tanggal-input");
  if (tanggalInputEl) {
    tanggalInputEl.addEventListener("input", () => {
      perbaruiPetunjukHariLiburForm(tanggalInputEl.value);
    });
    tanggalInputEl.addEventListener("change", () => {
      perbaruiPetunjukHariLiburForm(tanggalInputEl.value);
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
      const sekarang = new Date().toISOString();

      if (formSubmitBtn) formSubmitBtn.disabled = true;
      try {
        if (idEdit) {
          await perbaruiItem(KOLEKSI.KEGIATAN, idEdit, { ...payload, updatedAt: sekarang });
          terapkanPerubahanLokalKegiatan(idEdit, { ...payload, updatedAt: sekarang });
          beritahuPerubahanKegiatan();
        } else {
          // Fase 5: Selalu setel dihapusAt: null pada dokumen baru
          await tambahItem(KOLEKSI.KEGIATAN, {
            ...payload,
            dihapusAt: null,
            createdAt: sekarang,
            updatedAt: sekarang
          });
        }

        tutupModalFormKegiatan(true);
      } catch (err) {
        setPesanGalatFormKegiatan(formatPesanGalatFirestore(err));
      } finally {
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.textContent = idEdit ? "Simpan Perubahan" : "Simpan Kegiatan";
        }
      }
    });
  }

  const deleteModal = document.getElementById("kegiatan-delete-modal");
  const deleteCancelBtn = document.getElementById("kegiatan-delete-cancel-btn");
  const deleteConfirmBtn = document.getElementById("kegiatan-delete-confirm-btn");

  if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", () => tutupDialogHapusKegiatan(true));
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) tutupDialogHapusKegiatan(true);
    });
  }
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
      if (!idKegiatanAkanDihapus) return;
      const targetId = idKegiatanAkanDihapus;
      deleteConfirmBtn.disabled = true;
      tampilkanGalatHalamanKegiatan("");
      try {
        await hapusLunakKegiatan(targetId);
        tutupDialogHapusKegiatan(false);
        const detailModal = document.getElementById("kegiatan-detail-modal");
        if (detailModal && !detailModal.hidden) {
          detailModal.hidden = true;
        }
        tampilkanToast("Kegiatan dipindahkan ke Tempat Sampah", "info", {
          aksiLabel: "Urungkan",
          aksiOnClick: async () => {
            try {
              await pulihkanKegiatan(targetId);
              tampilkanToast("Kegiatan berhasil dipulihkan", "success");
            } catch (errUrung) {
              tampilkanToast(`Gagal mengurungkan: ${formatPesanGalatFirestore(errUrung)}`, "danger");
            }
          },
          durasiMs: 8000
        });
      } catch (err) {
        tutupDialogHapusKegiatan(false);
        tampilkanGalatHalamanKegiatan(formatPesanGalatFirestore(err));
      } finally {
        deleteConfirmBtn.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (hapusModalTerbuka) {
      e.preventDefault();
      tutupDialogHapusKegiatan(true);
    } else if (formModalTerbuka) {
      e.preventDefault();
      tutupModalFormKegiatan(true);
    }
  });
}

export function subscribeKegiatan() {
  unsubscribeKegiatan();
  initHalamanKegiatan();
  tandaiKegiatanSudahDimuat(false);
  renderDaftarKegiatan();
  beritahuPerubahanKegiatan();

  // Opsi peristiwa DOM yang dipicu state saat snapshot berjalan.
  setelOpsiPeristiwaKegiatan({
    onSuksesJendela: () => {
      tampilkanGalatHalamanKegiatan("");
      renderCatatanTerkaitDiDetailModal();
      dialogKelolaKategoriCtrl?.segarkanTampilan();
    },
    onGalatJendela: (pesan) => tampilkanGalatHalamanKegiatan(pesan),
    onGalatHalaman: (pesan) => tampilkanGalatHalamanKegiatan(pesan),
    onKategoriOk: () => perbaruiDropdownKategori(),
    onGalatKategori: (pesan) => tampilkanGalatHalamanKegiatan(pesan)
  });

  langgananKategoriKegiatan();

  // Inisialisasi jendela tanggal hari ini (+/- 1 bulan)
  const skr = parseTanggal(hariIni()) || new Date();
  const { tglAwal, tglAkhir } = hitungRentangJendela(skr.getFullYear(), skr.getMonth());
  mulaiLanggananJendelaKegiatan(tglAwal, tglAkhir);

  // Inisialisasi listener daftar halaman kegiatan
  mulaiLanggananHalamanKegiatan();

  return () => unsubscribeKegiatan();
}

export function unsubscribeKegiatan() {
  // Melepas langganan + mengosongkan cache data (beritahu di akhirnya).
  lepasLanggananKegiatan();

  idKegiatanDetailAktif = "";
  idKegiatanTerakhirDiklik = "";

  tutupPanelFilterKegiatan();
  tutupModalFormKegiatan(false);
  tutupDialogHapusKegiatan(false);
  dialogKelolaKategoriCtrl?.tutup(false);
}
