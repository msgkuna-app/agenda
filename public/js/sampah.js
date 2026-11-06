/**
 * Modul Halaman "Tempat Sampah" dan Pembersihan Otomatis 30 Hari (Fase 7)
 * Mengelola pemulihan dan penghapusan permanen kegiatan dan catatan yang dihapus lunak,
 * filter segmen "Semua | Kegiatan | Catatan", hitung mundur masa simpan 30 hari,
 * konfirmasi kosongkan tempat sampah, serta pembersihan otomatis sekali per sesi saat daring.
 */
import {
  getFirestoreDb,
  doc,
  writeBatch,
  formatPesanGalatFirestore
} from "./firebase-config.js";
import {
  getDaftarKegiatanDiSampah,
  pulihkanKegiatan,
  hapusPermanenKegiatan,
  isKegiatanSudahDimuat
} from "./kegiatan.js";
import {
  getDaftarCatatanDiSampah,
  pulihkanCatatan,
  hapusPermanenCatatan,
  isCatatanSudahDimuat,
  JENIS_CATATAN_GDOC
} from "./catatan.js";
import { parseTanggal, hariIni } from "./util-tanggal.js";
import { escapeHtml, tampilkanToast } from "./sidebar.js";

const TIGA_PULUH_HARI_MS = 30 * 24 * 60 * 60 * 1000;
const SATU_HARI_MS = 24 * 60 * 60 * 1000;

const NAMA_HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAMA_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const svgIkon = (isi, uk = 18, tebal = 2, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

const IKON_KEGIATAN = svgIkon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 20);
const IKON_CATATAN_SINGKAT = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', 20);
const IKON_CATATAN_GDOC = svgIkon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/>', 20);
const IKON_SAMPAH = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', 22);
const IKON_PULIHKAN = svgIkon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', 16);
const IKON_HAPUS_PERMANEN = svgIkon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16);

let filterSegmenAktif = "semua"; // "semua" | "kegiatan" | "catatan"
let antarmukaSampahDiikat = false;
let sudahPernahBersihkanOtomatisSesiIni = false;

let itemAkanDihapusPermanen = null; // { tipe: "kegiatan" | "catatan", item: any }
let fokusSebelumModalSampah = null;

function formatTanggalTeks(tanggalStr) {
  const objek = parseTanggal(tanggalStr);
  if (!objek) return tanggalStr || "-";
  const teks = `${NAMA_HARI_PENDEK[objek.getDay()]}, ${objek.getDate()} ${NAMA_BULAN_PENDEK[objek.getMonth()]} ${objek.getFullYear()}`;
  return tanggalStr === hariIni() ? `Hari ini • ${teks}` : teks;
}

function hitungInformasiHariSampah(dihapusAt) {
  const tDihapus = Date.parse(dihapusAt) || Date.now();
  const sekarang = Date.now();
  const selisihLaluMs = Math.max(0, sekarang - tDihapus);
  const hariLalu = Math.floor(selisihLaluMs / SATU_HARI_MS);

  const tKadaluwarsa = tDihapus + TIGA_PULUH_HARI_MS;
  const sisaMs = tKadaluwarsa - sekarang;
  const hariTersisa = Math.max(0, Math.ceil(sisaMs / SATU_HARI_MS));

  const teksLalu = hariLalu === 0 ? "Dihapus hari ini" : `Dihapus ${hariLalu} hari lalu`;
  const teksSisa = hariTersisa === 0 ? "tersisa kurang dari 1 hari" : `tersisa ${hariTersisa} hari`;

  return {
    hariLalu,
    hariTersisa,
    ringkasan: `${teksLalu} • ${teksSisa}`
  };
}

/**
 * Menghapus sekumpulan dokumen di Firestore memakai writeBatch dengan batas maksimal 500 operasi.
 * @param {import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js").Firestore} db
 * @param {Array<{ koleksi: string, id: string }>} daftarRef
 */
async function hapusBatchMaks500(db, daftarRef) {
  for (let i = 0; i < daftarRef.length; i += 500) {
    const chunk = daftarRef.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach((ref) => {
      batch.delete(doc(db, ref.koleksi, ref.id));
    });
    await batch.commit();
  }
}

function pastikanKerangkaHalamanSampah() {
  const panel = document.getElementById("section-sampah");
  if (!panel || panel.querySelector("#sampah-toolbar")) return;

  panel.innerHTML = `
    <div class="page-stack">
      <div class="section-header-bar">
        <div class="section-heading-group">
          <h2 class="section-heading-title">Tempat Sampah</h2>
          <p class="section-heading-subtitle">Item dihapus permanen setelah 30 hari.</p>
        </div>
        <div class="section-header-actions">
          <button type="button" id="sampah-btn-kosongkan" class="btn-danger">
            ${IKON_SAMPAH}
            <span>Kosongkan Tempat Sampah</span>
          </button>
        </div>
      </div>

      <div id="sampah-page-error" class="alert-box" role="alert" hidden>
        ${svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}
        <span id="sampah-page-error-text"></span>
      </div>

      <div id="sampah-toolbar" class="filter-card">
        <div class="segmented-control" role="tablist" aria-label="Pilih jenis item tempat sampah">
          <button
            type="button"
            class="segmented-btn is-active"
            role="tab"
            aria-selected="true"
            data-sampah-segment="semua"
            id="sampah-tab-semua"
          >
            Semua (<span id="sampah-count-semua">0</span>)
          </button>
          <button
            type="button"
            class="segmented-btn"
            role="tab"
            aria-selected="false"
            data-sampah-segment="kegiatan"
            id="sampah-tab-kegiatan"
          >
            Kegiatan (<span id="sampah-count-kegiatan">0</span>)
          </button>
          <button
            type="button"
            class="segmented-btn"
            role="tab"
            aria-selected="false"
            data-sampah-segment="catatan"
            id="sampah-tab-catatan"
          >
            Catatan (<span id="sampah-count-catatan">0</span>)
          </button>
        </div>
      </div>

      <div id="sampah-active-filter-bar" class="result-summary-bar" hidden>
        <span id="sampah-result-summary" class="result-summary-text"></span>
      </div>

      <div id="sampah-list-region" aria-live="polite"></div>
    </div>

    <!-- Modal Konfirmasi Hapus Permanen Item Tunggal -->
    <div
      id="sampah-hapus-permanen-modal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sampah-hapus-permanen-title"
      aria-describedby="sampah-hapus-permanen-desc"
      hidden
    >
      <div class="modal-dialog">
        <h2 id="sampah-hapus-permanen-title" class="modal-title">Hapus permanen item ini?</h2>
        <p id="sampah-hapus-permanen-desc" class="modal-desc"></p>
        <div class="modal-actions">
          <button type="button" id="sampah-hapus-permanen-cancel-btn" class="btn-secondary">Batal</button>
          <button type="button" id="sampah-hapus-permanen-confirm-btn" class="btn-danger">Hapus Permanen</button>
        </div>
      </div>
    </div>

    <!-- Modal Konfirmasi Kosongkan Tempat Sampah -->
    <div
      id="sampah-kosongkan-modal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sampah-kosongkan-title"
      aria-describedby="sampah-kosongkan-desc"
      hidden
    >
      <div class="modal-dialog">
        <h2 id="sampah-kosongkan-title" class="modal-title">Kosongkan Tempat Sampah?</h2>
        <p id="sampah-kosongkan-desc" class="modal-desc"></p>
        <div class="modal-actions">
          <button type="button" id="sampah-kosongkan-cancel-btn" class="btn-secondary">Batal</button>
          <button type="button" id="sampah-kosongkan-confirm-btn" class="btn-danger">Kosongkan Semua</button>
        </div>
      </div>
    </div>
  `;
}

function tampilkanGalatHalamanSampah(pesan) {
  const box = document.getElementById("sampah-page-error");
  const txt = document.getElementById("sampah-page-error-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

export function renderHalamanSampah() {
  pastikanKerangkaHalamanSampah();

  const region = document.getElementById("sampah-list-region");
  const btnKosongkan = document.getElementById("sampah-btn-kosongkan");
  const countSemuaEl = document.getElementById("sampah-count-semua");
  const countKegEl = document.getElementById("sampah-count-kegiatan");
  const countCatEl = document.getElementById("sampah-count-catatan");
  const barSummary = document.getElementById("sampah-active-filter-bar");
  const txtSummary = document.getElementById("sampah-result-summary");

  if (!region) return;

  const kegiatanSampah = getDaftarKegiatanDiSampah().map((k) => ({
    ...k,
    _tipe: "kegiatan",
    _labelTipe: "Kegiatan"
  }));

  const catatanSampah = getDaftarCatatanDiSampah().map((c) => ({
    ...c,
    _tipe: "catatan",
    _labelTipe: c.jenis === JENIS_CATATAN_GDOC ? "Google Docs" : "Catatan"
  }));

  const totalKegiatan = kegiatanSampah.length;
  const totalCatatan = catatanSampah.length;
  const totalSemua = totalKegiatan + totalCatatan;

  if (countSemuaEl) countSemuaEl.textContent = String(totalSemua);
  if (countKegEl) countKegEl.textContent = String(totalKegiatan);
  if (countCatEl) countCatEl.textContent = String(totalCatatan);

  if (btnKosongkan instanceof HTMLButtonElement) {
    btnKosongkan.disabled = totalSemua === 0;
  }

  let daftarTampil = [];
  if (filterSegmenAktif === "kegiatan") {
    daftarTampil = kegiatanSampah;
  } else if (filterSegmenAktif === "catatan") {
    daftarTampil = catatanSampah;
  } else {
    daftarTampil = [...kegiatanSampah, ...catatanSampah];
  }

  // Urutkan item dari yang paling baru dihapus
  daftarTampil.sort((a, b) => {
    const tA = Date.parse(a.dihapusAt) || 0;
    const tB = Date.parse(b.dihapusAt) || 0;
    return tB - tA;
  });

  if (barSummary && txtSummary) {
    if (totalSemua > 0) {
      barSummary.hidden = false;
      txtSummary.textContent =
        filterSegmenAktif === "semua"
          ? `Menampilkan total ${totalSemua} item di Tempat Sampah`
          : `Menampilkan ${daftarTampil.length} dari ${totalSemua} item di Tempat Sampah`;
    } else {
      barSummary.hidden = true;
    }
  }

  if (totalSemua === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <div class="empty-stage-icon" aria-hidden="true">${IKON_SAMPAH}</div>
        <h3 class="empty-stage-title">Tempat Sampah Kosong</h3>
        <p class="empty-stage-desc">Tidak ada kegiatan atau catatan yang dihapus sementara. Item yang Anda hapus akan disimpan di sini selama 30 hari sebelum dihapus permanen.</p>
      </div>
    `;
    return;
  }

  if (daftarTampil.length === 0) {
    region.innerHTML = `
      <div class="empty-stage-card">
        <h3 class="empty-stage-title">Tidak Ada Item pada Kategori Ini</h3>
        <p class="empty-stage-desc">Tidak ditemukan item ${filterSegmenAktif} di Tempat Sampah.</p>
      </div>
    `;
    return;
  }

  const htmlKartu = daftarTampil.map((item) => {
    const infoHari = hitungInformasiHariSampah(item.dihapusAt);
    const ikonItem =
      item._tipe === "kegiatan"
        ? IKON_KEGIATAN
        : item.jenis === JENIS_CATATAN_GDOC
          ? IKON_CATATAN_GDOC
          : IKON_CATATAN_SINGKAT;

    const tglInfo = item.tanggal ? formatTanggalTeks(item.tanggal) : "-";
    const badgeKelas = item.hariTersisa <= 3 ? "sampah-countdown-urgent" : "sampah-countdown-normal";

    return `
      <div class="kegiatan-card sampah-card" data-sampah-tipe="${escapeHtml(item._tipe)}" data-sampah-id="${escapeHtml(item.id)}">
        <div class="sampah-card-header">
          <div class="sampah-item-meta">
            <span class="sampah-type-badge">${escapeHtml(item._labelTipe)}</span>
            <span class="sampah-date-label">${escapeHtml(tglInfo)}</span>
          </div>
          <span class="sampah-countdown-pill ${badgeKelas}">
            ${escapeHtml(infoHari.ringkasan)}
          </span>
        </div>

        <div class="sampah-card-body">
          <div class="sampah-icon-wrap" aria-hidden="true">${ikonItem}</div>
          <div class="sampah-text-wrap">
            <h3 class="kegiatan-card-title sampah-title">${escapeHtml(item.judul || "Tanpa Judul")}</h3>
            ${item.catatan ? `<p class="sampah-excerpt">${escapeHtml(item.catatan)}</p>` : ""}
            ${item.isi ? `<p class="sampah-excerpt">${escapeHtml(item.isi)}</p>` : ""}
          </div>
        </div>

        <div class="sampah-card-actions">
          <button
            type="button"
            class="btn-secondary sampah-action-btn"
            data-sampah-action="pulihkan"
            data-sampah-tipe="${escapeHtml(item._tipe)}"
            data-sampah-id="${escapeHtml(item.id)}"
          >
            ${IKON_PULIHKAN}
            <span>Pulihkan</span>
          </button>
          <button
            type="button"
            class="btn-danger sampah-action-btn"
            data-sampah-action="hapus-permanen"
            data-sampah-tipe="${escapeHtml(item._tipe)}"
            data-sampah-id="${escapeHtml(item.id)}"
          >
            ${IKON_HAPUS_PERMANEN}
            <span>Hapus Permanen</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  region.innerHTML = `<div class="kegiatan-grid-list">${htmlKartu}</div>`;
}

function bukaDialogHapusPermanen(tipe, id) {
  const modal = document.getElementById("sampah-hapus-permanen-modal");
  const desc = document.getElementById("sampah-hapus-permanen-desc");
  const cancelBtn = document.getElementById("sampah-hapus-permanen-cancel-btn");
  if (!modal) return;

  let item = null;
  if (tipe === "kegiatan") {
    item = getDaftarKegiatanDiSampah().find((k) => k.id === id);
  } else {
    item = getDaftarCatatanDiSampah().find((c) => c.id === id);
  }
  if (!item) return;

  fokusSebelumModalSampah = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  itemAkanDihapusPermanen = { tipe, item };

  if (desc) {
    const jenisTeks = tipe === "kegiatan" ? "kegiatan" : "catatan";
    desc.textContent = `Item ${jenisTeks} "${item.judul || "Tanpa Judul"}" akan dihapus permanen dari Firestore dan tidak dapat dipulihkan kembali.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogHapusPermanen(kembalikanFokus = true) {
  const modal = document.getElementById("sampah-hapus-permanen-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  itemAkanDihapusPermanen = null;

  if (kembalikanFokus && fokusSebelumModalSampah && document.contains(fokusSebelumModalSampah)) {
    fokusSebelumModalSampah.focus();
  }
  fokusSebelumModalSampah = null;
}

function bukaDialogKosongkanSampah() {
  const modal = document.getElementById("sampah-kosongkan-modal");
  const desc = document.getElementById("sampah-kosongkan-desc");
  const cancelBtn = document.getElementById("sampah-kosongkan-cancel-btn");
  if (!modal) return;

  const total = getDaftarKegiatanDiSampah().length + getDaftarCatatanDiSampah().length;
  if (total === 0) {
    tampilkanToast("Tempat Sampah sudah kosong", "info");
    return;
  }

  fokusSebelumModalSampah = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (desc) {
    desc.textContent = `Semua ${total} item di Tempat Sampah akan dihapus permanen dari Firestore. Tindakan ini tidak dapat dibatalkan.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (cancelBtn instanceof HTMLElement) cancelBtn.focus();
  });
}

function tutupDialogKosongkanSampah(kembalikanFokus = true) {
  const modal = document.getElementById("sampah-kosongkan-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalSampah && document.contains(fokusSebelumModalSampah)) {
    fokusSebelumModalSampah.focus();
  }
  fokusSebelumModalSampah = null;
}

export function initHalamanSampah() {
  pastikanKerangkaHalamanSampah();
  if (antarmukaSampahDiikat) return;
  antarmukaSampahDiikat = true;

  const panel = document.getElementById("section-sampah");
  if (!panel) return;

  // Delegasi tab segmen
  panel.addEventListener("click", async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    // 1. Klik tab segmen
    const segBtn = target.closest("button[data-sampah-segment]");
    if (segBtn) {
      const seg = segBtn.getAttribute("data-sampah-segment") || "semua";
      filterSegmenAktif = seg;
      panel.querySelectorAll(".segmented-btn[data-sampah-segment]").forEach((b) => {
        const aktif = b.getAttribute("data-sampah-segment") === seg;
        b.classList.toggle("is-active", aktif);
        b.setAttribute("aria-selected", aktif ? "true" : "false");
      });
      renderHalamanSampah();
      return;
    }

    // 2. Tombol Kosongkan
    if (target.closest("#sampah-btn-kosongkan")) {
      bukaDialogKosongkanSampah();
      return;
    }

    // 3. Tombol aksi item: Pulihkan
    const btnPulihkan = target.closest("button[data-sampah-action='pulihkan']");
    if (btnPulihkan) {
      const tipe = btnPulihkan.getAttribute("data-sampah-tipe");
      const id = btnPulihkan.getAttribute("data-sampah-id");
      if (!id) return;

      btnPulihkan.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        if (tipe === "kegiatan") {
          await pulihkanKegiatan(id);
          tampilkanToast("Kegiatan berhasil dipulihkan", "success");
        } else {
          const hasil = await pulihkanCatatan(id);
          if (hasil && hasil.pesanDrive) {
            tampilkanToast(`Catatan dipulihkan. ${hasil.pesanDrive}`, "warning");
          } else {
            tampilkanToast("Catatan berhasil dipulihkan", "success");
          }
        }
      } catch (err) {
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal memulihkan: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        btnPulihkan.removeAttribute("disabled");
      }
      return;
    }

    // 4. Tombol aksi item: Hapus Permanen
    const btnHapus = target.closest("button[data-sampah-action='hapus-permanen']");
    if (btnHapus) {
      const tipe = btnHapus.getAttribute("data-sampah-tipe");
      const id = btnHapus.getAttribute("data-sampah-id");
      if (tipe && id) {
        bukaDialogHapusPermanen(tipe, id);
      }
    }
  });

  // Modal Hapus Permanen Tunggal
  const modalHapus = document.getElementById("sampah-hapus-permanen-modal");
  const cancelHapusBtn = document.getElementById("sampah-hapus-permanen-cancel-btn");
  const confirmHapusBtn = document.getElementById("sampah-hapus-permanen-confirm-btn");

  if (cancelHapusBtn) cancelHapusBtn.addEventListener("click", () => tutupDialogHapusPermanen(true));
  if (modalHapus) {
    modalHapus.addEventListener("click", (e) => {
      if (e.target === modalHapus) tutupDialogHapusPermanen(true);
    });
  }
  if (confirmHapusBtn) {
    confirmHapusBtn.addEventListener("click", async () => {
      if (!itemAkanDihapusPermanen) return;
      const { tipe, item } = itemAkanDihapusPermanen;
      confirmHapusBtn.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        if (tipe === "kegiatan") {
          await hapusPermanenKegiatan(item.id);
        } else {
          await hapusPermanenCatatan(item.id);
        }
        tutupDialogHapusPermanen(false);
        tampilkanToast("Item berhasil dihapus permanen", "success");
      } catch (err) {
        tutupDialogHapusPermanen(false);
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal menghapus permanen: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        confirmHapusBtn.removeAttribute("disabled");
      }
    });
  }

  // Modal Kosongkan Tempat Sampah
  const modalKosongkan = document.getElementById("sampah-kosongkan-modal");
  const cancelKosongkanBtn = document.getElementById("sampah-kosongkan-cancel-btn");
  const confirmKosongkanBtn = document.getElementById("sampah-kosongkan-confirm-btn");

  if (cancelKosongkanBtn) cancelKosongkanBtn.addEventListener("click", () => tutupDialogKosongkanSampah(true));
  if (modalKosongkan) {
    modalKosongkan.addEventListener("click", (e) => {
      if (e.target === modalKosongkan) tutupDialogKosongkanSampah(true);
    });
  }
  if (confirmKosongkanBtn) {
    confirmKosongkanBtn.addEventListener("click", async () => {
      const kegSampah = getDaftarKegiatanDiSampah();
      const catSampah = getDaftarCatatanDiSampah();
      const daftarRef = [
        ...kegSampah.map((k) => ({ koleksi: "kegiatan", id: k.id })),
        ...catSampah.map((c) => ({ koleksi: "catatan", id: c.id }))
      ];

      if (daftarRef.length === 0) {
        tutupDialogKosongkanSampah(true);
        return;
      }

      confirmKosongkanBtn.setAttribute("disabled", "true");
      tampilkanGalatHalamanSampah("");
      try {
        const db = getFirestoreDb();
        await hapusBatchMaks500(db, daftarRef);
        tutupDialogKosongkanSampah(false);
        tampilkanToast("Tempat Sampah berhasil dikosongkan", "success");
      } catch (err) {
        tutupDialogKosongkanSampah(false);
        tampilkanGalatHalamanSampah(formatPesanGalatFirestore(err));
        tampilkanToast(`Gagal mengosongkan: ${formatPesanGalatFirestore(err)}`, "danger");
      } finally {
        confirmKosongkanBtn.removeAttribute("disabled");
      }
    });
  }

  // Tangani tombol Escape untuk modal sampah
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalKosongkan && !modalKosongkan.hidden) {
      e.preventDefault();
      tutupDialogKosongkanSampah(true);
    } else if (modalHapus && !modalHapus.hidden) {
      e.preventDefault();
      tutupDialogHapusPermanen(true);
    }
  });

  renderHalamanSampah();
}

/**
 * Pembersihan otomatis setelah login dan data kegiatan serta catatan dimuat.
 * Berjalan sekali per sesi dan hanya bila perangkat sedang terhubung online.
 * Menghapus permanen item dengan dihapusAt > 30 hari via writeBatch (maks 500 per batch).
 * Gagal diam-diam dengan console.warn.
 */
export async function jalankanPembersihanSampahOtomatis() {
  if (sudahPernahBersihkanOtomatisSesiIni) return;
  if (!navigator.onLine) return;
  if (!isKegiatanSudahDimuat() || !isCatatanSudahDimuat()) return;

  sudahPernahBersihkanOtomatisSesiIni = true;

  try {
    const sekarang = Date.now();
    const kadaluwarsaKegiatan = getDaftarKegiatanDiSampah().filter((k) => {
      const t = Date.parse(k.dihapusAt);
      return t && sekarang - t > TIGA_PULUH_HARI_MS;
    });

    const kadaluwarsaCatatan = getDaftarCatatanDiSampah().filter((c) => {
      const t = Date.parse(c.dihapusAt);
      return t && sekarang - t > TIGA_PULUH_HARI_MS;
    });

    const daftarHapus = [
      ...kadaluwarsaKegiatan.map((k) => ({ koleksi: "kegiatan", id: k.id })),
      ...kadaluwarsaCatatan.map((c) => ({ koleksi: "catatan", id: c.id }))
    ];

    if (daftarHapus.length > 0) {
      const db = getFirestoreDb();
      await hapusBatchMaks500(db, daftarHapus);
    }
  } catch (err) {
    console.warn("Pembersihan otomatis sampah > 30 hari gagal:", err);
  }
}

export function resetPembersihanSampah() {
  sudahPernahBersihkanOtomatisSesiIni = false;
  filterSegmenAktif = "semua";
  itemAkanDihapusPermanen = null;
  tutupDialogHapusPermanen(false);
  tutupDialogKosongkanSampah(false);
}
