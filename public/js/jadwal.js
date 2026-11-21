/**
 * Modul Halaman Jadwal & Dialog Rincian Kegiatan (Fase 2 + Integrasi Hari Libur & Tanggal Merah)
 * - Dua tampilan: Kalender Bulanan (awal pekan Senin, bahasa Indonesia, penanda hari libur nasional,
 *   cuti bersama, hari Minggu bertanggal merah, nama libur di layar lebar, panel tanggal terpilih)
 *   dan Daftar Agenda 30 hari ke depan dengan judul tanggal merah bila libur.
 * - Catatan kecil bila data tahun belum tersedia (misal tahun 2028).
 * - Seluruh perhitungan tanggal HANYA memakai util-tanggal.js.
 */
import { formatPesanGalatFirestore } from "./services/firestoreService.js";
import { tanggalLokal, hariIni, tambahHari, parseTanggal } from "./util-tanggal.js";
import { pindahKeBagian } from "./sidebar.js";
import { escapeHtml, svgIkon, NAMA_HARI, NAMA_BULAN, NAMA_BULAN_PENDEK } from "./util-html.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  bukaModalFormKegiatan,
  bukaDialogHapusKegiatan,
  ubahStatusKegiatanCepat,
  kelasBadgeStatus,
  sinkronkanJendelaTanggalKegiatan
} from "./modules/kegiatan/index.js";
import { infoHari, adaDataTahun } from "./hari-libur.js";

// Nama hari/bulan & svgIkon kini diimpor dari util-html.js (Tahap 4: deduplikasi).
// NAMA_HARI_DARI_MINGGU -> NAMA_HARI, NAMA_BULAN_PANJANG -> NAMA_BULAN, NAMA_BULAN_RINGKAS -> NAMA_BULAN_PENDEK.

// Kolom kalender dimulai dari hari Senin (0 = Senin ... 6 = Minggu)
const KOLOM_HARI_SENIN = [
  { penuh: "Senin", pendek: "Sen" },
  { penuh: "Selasa", pendek: "Sel" },
  { penuh: "Rabu", pendek: "Rab" },
  { penuh: "Kamis", pendek: "Kam" },
  { penuh: "Jumat", pendek: "Jum" },
  { penuh: "Sabtu", pendek: "Sab" },
  { penuh: "Minggu", pendek: "Min" }
];

const IKON_KALENDER = svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 16);
const IKON_DAFTAR = svgIkon('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', 16);
const IKON_TAMBAH = (uk = 18) => svgIkon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', uk, 2.2);
const IKON_GALAT = svgIkon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18);
const IKON_JAM = svgIkon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 15);
const IKON_LOKASI = svgIkon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 15);

let jadwalSudahDiikat = false;
let detailModalSudahDiikat = false;
let modeTampilanJadwal = "kalender"; // "kalender" | "agenda"
let tahunKalender = 2026;
let bulanKalender = 0;
let tanggalTerpilih = "";

let detailModalTerbuka = false;
let idKegiatanDetailAktif = null;
let fokusSebelumDetailModal = null;

function inisialisasiStateTanggalAwal() {
  const strHariIni = hariIni();
  const objHariIni = parseTanggal(strHariIni);
  tanggalTerpilih = strHariIni;
  if (objHariIni) {
    tahunKalender = objHariIni.getFullYear();
    bulanKalender = objHariIni.getMonth();
  }
}

export function formatTanggalLengkapIndonesia(tanggalStr) {
  const obj = parseTanggal(tanggalStr);
  if (!obj) return tanggalStr || "-";
  return `${NAMA_HARI[obj.getDay()]}, ${obj.getDate()} ${NAMA_BULAN[obj.getMonth()]} ${obj.getFullYear()}`;
}

export function formatTanggalRingkasIndonesia(tanggalStr) {
  const obj = parseTanggal(tanggalStr);
  if (!obj) return tanggalStr || "-";
  const indeksSenin = (obj.getDay() + 6) % 7;
  return `${KOLOM_HARI_SENIN[indeksSenin].pendek}, ${obj.getDate()} ${NAMA_BULAN_PENDEK[obj.getMonth()]} ${obj.getFullYear()}`;
}

export function urutkanKegiatanKronologis(daftar) {
  return [...daftar].sort((a, b) => {
    const tglA = a.tanggal || "";
    const tglB = b.tanggal || "";
    if (tglA !== tglB) return tglA.localeCompare(tglB);
    const jamA = a.waktuMulai || "99:99";
    const jamB = b.waktuMulai || "99:99";
    if (jamA !== jamB) return jamA.localeCompare(jamB);
    return String(a.judul || "").localeCompare(String(b.judul || ""), "id", { sensitivity: "base" });
  });
}

function tampilkanGalatHalamanJadwal(pesan) {
  const box = document.getElementById("jadwal-page-error");
  const txt = document.getElementById("jadwal-page-error-text");
  if (!box || !txt) return;
  txt.textContent = pesan || "";
  box.hidden = !pesan;
}

function pastikanKerangkaHalamanJadwal() {
  const panel = document.getElementById("section-jadwal");
  if (!panel || panel.querySelector("#jadwal-view-switcher")) return;

  const headerKolomHari = KOLOM_HARI_SENIN.map(
    (h) => `<div class="cal-weekday-cell${h.pendek === "Min" ? " cal-weekday-min" : ""}" role="columnheader" aria-label="${escapeHtml(h.penuh)}"><span class="cal-dow-full">${escapeHtml(h.penuh)}</span><span class="cal-dow-short" aria-hidden="true">${escapeHtml(h.pendek)}</span></div>`
  ).join("");

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Jadwal Kegiatan</h2>
        <p class="section-heading-subtitle">Pantau kegiatan lewat kalender bulanan atau daftar agenda 30 hari ke depan.</p>
      </div>
      <div class="jadwal-header-controls">
        <div id="jadwal-view-switcher" class="segmented-control" role="group" aria-label="Pilih tampilan jadwal">
          <button type="button" id="btn-view-kalender" class="segmented-btn is-active" data-jadwal-view="kalender" aria-pressed="true">${IKON_KALENDER}<span>Kalender Bulanan</span></button>
          <button type="button" id="btn-view-agenda" class="segmented-btn" data-jadwal-view="agenda" aria-pressed="false">${IKON_DAFTAR}<span>Daftar Agenda</span></button>
        </div>
        <button type="button" id="btn-jadwal-tambah-utama" class="btn-primary">${IKON_TAMBAH(18)}<span>Tambah kegiatan</span></button>
      </div>
    </div>
    <div id="jadwal-page-error" class="alert-box" role="alert" hidden>${IKON_GALAT}<span id="jadwal-page-error-text"></span></div>
    <div id="jadwal-kalender-view" class="jadwal-view-panel">
      <div id="jadwal-nodata-notice" role="status" hidden></div>
      <div class="calendar-card">
        <div class="calendar-toolbar">
          <div class="calendar-nav-group">
            <button type="button" id="btn-bulan-sebelumnya" class="icon-btn icon-btn-bordered" aria-label="Bulan sebelumnya" title="Bulan sebelumnya">${svgIkon('<polyline points="15 18 9 12 15 6"/>')}</button>
            <h3 id="jadwal-judul-bulan" class="calendar-month-title" aria-live="polite"></h3>
            <button type="button" id="btn-bulan-berikutnya" class="icon-btn icon-btn-bordered" aria-label="Bulan berikutnya" title="Bulan berikutnya">${svgIkon('<polyline points="9 18 15 12 9 6"/>')}</button>
          </div>
          <button type="button" id="btn-jadwal-hari-ini" class="btn-secondary btn-sm-touch">Hari ini</button>
        </div>
        <div class="cal-board" role="grid" aria-labelledby="jadwal-judul-bulan">
          <div class="cal-weekday-row" role="row">${headerKolomHari}</div>
          <div id="jadwal-calendar-grid" class="cal-days-grid"></div>
        </div>
      </div>
      <section id="jadwal-selected-date-panel" class="selected-date-panel" aria-live="polite" aria-labelledby="jadwal-selected-date-heading"></section>
    </div>
    <div id="jadwal-agenda-view" class="jadwal-view-panel" hidden>
      <div id="jadwal-agenda-region" aria-live="polite"></div>
    </div>
  </div>`;
}

function bangunDaftarSelBulan(tahun, bulanIndex) {
  const tglAwalBulan = parseTanggal(tanggalLokal(new Date(tahun, bulanIndex, 1)));
  if (!tglAwalBulan) return [];

  const offsetSenin = (tglAwalBulan.getDay() + 6) % 7;
  const tahunBerikut = bulanIndex === 11 ? tahun + 1 : tahun;
  const bulanBerikut = bulanIndex === 11 ? 0 : bulanIndex + 1;
  const tglAwalBulanBerikut = parseTanggal(tanggalLokal(new Date(tahunBerikut, bulanBerikut, 1)));

  let jumlahHariBulanIni = 30;
  if (tglAwalBulanBerikut) {
    const tglAkhirBulanIni = parseTanggal(tambahHari(-1, tglAwalBulanBerikut));
    if (tglAkhirBulanIni) jumlahHariBulanIni = tglAkhirBulanIni.getDate();
  }

  const totalSel = Math.ceil((offsetSenin + jumlahHariBulanIni) / 7) * 7;
  const daftarSel = [];
  for (let i = 0; i < totalSel; i += 1) {
    const tanggalStr = tambahHari(i - offsetSenin, tglAwalBulan);
    const objSel = parseTanggal(tanggalStr);
    if (!objSel) continue;
    daftarSel.push({
      tanggalStr,
      hariAngka: objSel.getDate(),
      dalamBulan: objSel.getFullYear() === tahun && objSel.getMonth() === bulanIndex
    });
  }
  return daftarSel;
}

function kelompokkanKegiatanPerTanggal(daftarKegiatan) {
  const peta = new Map();
  urutkanKegiatanKronologis(daftarKegiatan).forEach((item) => {
    if (!item.tanggal || !parseTanggal(item.tanggal)) return;
    if (!peta.has(item.tanggal)) peta.set(item.tanggal, []);
    peta.get(item.tanggal).push(item);
  });
  return peta;
}

function renderKartuItemJadwal(item) {
  const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
  const rentangWaktu = item.waktuMulai
    ? item.waktuSelesai ? `${item.waktuMulai} – ${item.waktuSelesai}` : item.waktuMulai
    : "Sepanjang hari";
  const opsiStatusCepat = DAFTAR_STATUS_KEGIATAN.map(
    (st) => `<option value="${escapeHtml(st)}" ${item.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`
  ).join("");

  return `<article class="kegiatan-card jadwal-event-card${item.status === "Selesai" ? " is-completed" : ""}" data-id="${escapeHtml(item.id)}">
    <div class="kegiatan-card-top">
      <div class="kegiatan-badges-row">
        <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
        <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
      </div>
      <div class="kegiatan-quick-status">
        <label for="jadwal-status-${escapeHtml(item.id)}" class="sr-only">Ubah status untuk ${escapeHtml(item.judul)}</label>
        <select id="jadwal-status-${escapeHtml(item.id)}" class="quick-status-select" data-action="quick-status-jadwal" data-id="${escapeHtml(item.id)}" aria-label="Status kegiatan ${escapeHtml(item.judul)}">${opsiStatusCepat}</select>
      </div>
    </div>
    <h4 class="kegiatan-card-title">
      <button type="button" class="event-title-trigger" data-action="buka-detail-kegiatan" data-id="${escapeHtml(item.id)}">${escapeHtml(item.judul)}</button>
    </h4>
    <div class="kegiatan-meta-list">
      <span class="kegiatan-meta-item">${IKON_JAM}<span>${escapeHtml(rentangWaktu)}</span></span>
      ${item.lokasi ? `<span class="kegiatan-meta-item">${IKON_LOKASI}<span>${escapeHtml(item.lokasi)}</span></span>` : ""}
    </div>
    ${item.catatan ? `<p class="kegiatan-card-note">${escapeHtml(item.catatan)}</p>` : ""}
    <div class="kegiatan-card-footer">
      <button type="button" class="btn-secondary btn-sm-touch" data-action="edit-kegiatan-jadwal" data-id="${escapeHtml(item.id)}">Ubah</button>
      <button type="button" class="btn-danger-outline btn-sm-touch" data-action="hapus-kegiatan-jadwal" data-id="${escapeHtml(item.id)}">Hapus</button>
    </div>
  </article>`;
}

function renderKalenderBulanan(petaPerTanggal) {
  const judulBulanEl = document.getElementById("jadwal-judul-bulan");
  const gridEl = document.getElementById("jadwal-calendar-grid");
  const panelTanggalEl = document.getElementById("jadwal-selected-date-panel");
  const noticeEl = document.getElementById("jadwal-nodata-notice");
  if (!gridEl || !panelTanggalEl) return;

  // Catatan bila tahun tidak tercakup data libur bawaan/tambahan
  if (noticeEl) {
    if (!adaDataTahun(tahunKalender)) {
      noticeEl.innerHTML = `<div class="calendar-nodata-notice" role="status">
        <span>Data hari libur tahun ${tahunKalender} belum tersedia. Hari Minggu tetap ditandai merah.</span>
        <button type="button" class="btn-link-filter" data-action="ke-pengaturan-libur">Kelola hari libur &rarr;</button>
      </div>`;
      noticeEl.hidden = false;
    } else {
      noticeEl.innerHTML = "";
      noticeEl.hidden = true;
    }
  }

  const strHariIni = hariIni();
  if (!tanggalTerpilih || !parseTanggal(tanggalTerpilih)) tanggalTerpilih = strHariIni;
  if (judulBulanEl) judulBulanEl.textContent = `${NAMA_BULAN[bulanKalender]} ${tahunKalender}`;

  const daftarSel = bangunDaftarSelBulan(tahunKalender, bulanKalender);
  const barisHtml = [];

  for (let awal = 0; awal < daftarSel.length; awal += 7) {
    const selHtml = daftarSel.slice(awal, awal + 7).map((sel) => {
      const kegiatanHari = petaPerTanggal.get(sel.tanggalStr) || [];
      const total = kegiatanHari.length;
      const adalahHariIni = sel.tanggalStr === strHariIni;
      const adalahTerpilih = sel.tanggalStr === tanggalTerpilih;
      const infoH = infoHari(sel.tanggalStr);

      // Penanda warna kategori per hari: maks 3 titik, sisanya "+N". Bila tanpa kegiatan namun hari libur, beri titik merah di HP
      const maksTitik = 3;
      const titikHtml = kegiatanHari.slice(0, maksTitik).map((k) => {
        const infoKat = manajerKategoriKegiatan.cariInfoKategori(k.kategoriId);
        return `<span class="cal-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span>`;
      }).join("");
      const sisaTitik = total > maksTitik ? total - maksTitik : 0;
      const penandaKategoriHtml = total > 0
        ? `<span class="cal-dots-row" aria-hidden="true">${titikHtml}${sisaTitik > 0 ? `<span class="cal-dot-more">+${sisaTitik}</span>` : ""}</span>`
        : infoH.libur.length > 0
          ? `<span class="cal-dots-row" aria-hidden="true"><span class="cal-dot cal-dot-${infoH.libur[0].jenis === "cuti" ? "cuti" : "libur"}" aria-hidden="true"></span></span>`
          : `<span class="cal-dots-row cal-dots-empty" aria-hidden="true"></span>`;

      // Nama hari libur / cuti / hari besar kecil (satu baris, ellipsis) di dalam sel pada layar lebar
      let holidayLabelHtml = "";
      if (infoH.libur.length > 0) {
        const liburPertama = infoH.libur[0];
        const clsJenis = liburPertama.jenis === "cuti" ? " cal-holiday-cuti" : "";
        holidayLabelHtml = `<span class="cal-holiday-label${clsJenis}" title="${escapeHtml(liburPertama.nama)}">${escapeHtml(liburPertama.nama)}</span>`;
      } else if (infoH.hariBesar.length > 0) {
        const hbPertama = infoH.hariBesar[0];
        holidayLabelHtml = `<span class="cal-holiday-label cal-holiday-neutral" title="${escapeHtml(hbPertama.nama)}">${escapeHtml(hbPertama.nama)}</span>`;
      }

      // Nama kegiatan singkat dalam sel untuk tablet & desktop (>=600px)
      const maksChipDesktop = 3;
      const daftarChipHtml = total > 0
        ? `<div class="cal-cell-events">${kegiatanHari.slice(0, maksChipDesktop).map((k) => {
            const infoKat = manajerKategoriKegiatan.cariInfoKategori(k.kategoriId);
            const labelSingkat = k.waktuMulai ? `${k.waktuMulai} ${k.judul}` : k.judul;
            return `<button type="button" class="cal-event-chip${k.status === "Selesai" ? " is-completed" : ""}" data-action="buka-detail-kegiatan" data-id="${escapeHtml(k.id)}" data-tanggal="${escapeHtml(sel.tanggalStr)}" title="${escapeHtml(labelSingkat)} (${escapeHtml(infoKat.nama)} • ${escapeHtml(k.status)})"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span class="cal-event-chip-text">${escapeHtml(labelSingkat)}</span></button>`;
          }).join("")}${total > maksChipDesktop ? `<button type="button" class="cal-more-chip" data-action="pilih-tanggal" data-tanggal="${escapeHtml(sel.tanggalStr)}">+${total - maksChipDesktop} kegiatan lainnya</button>` : ""}</div>`
        : "";

      let labelAksesibel = `${formatTanggalLengkapIndonesia(sel.tanggalStr)}`;
      if (infoH.keterangan) {
        labelAksesibel += `, ${infoH.keterangan}`;
      }
      if (adalahHariIni) {
        labelAksesibel += ", Hari ini";
      }
      labelAksesibel += `, ${total} kegiatan`;

      const kelasSel = [
        "cal-day-cell",
        sel.dalamBulan ? "" : "is-outside-month",
        adalahHariIni ? "is-today" : "",
        adalahTerpilih ? "is-selected" : "",
        infoH.merah ? "is-libur" : ""
      ].filter(Boolean).join(" ");

      return `<div class="${kelasSel}" role="gridcell" data-tanggal="${escapeHtml(sel.tanggalStr)}">
        <button type="button" class="cal-day-select-btn" data-action="pilih-tanggal" data-tanggal="${escapeHtml(sel.tanggalStr)}" aria-pressed="${adalahTerpilih ? "true" : "false"}" aria-label="${escapeHtml(labelAksesibel)}" ${infoH.keterangan ? `title="${escapeHtml(infoH.keterangan)}"` : ""}>
          <span class="cal-day-top"><span class="cal-day-number">${sel.hariAngka}</span>${adalahHariIni ? `<span class="cal-today-tag">Hari ini</span>` : ""}</span>
          ${penandaKategoriHtml}
        </button>
        ${holidayLabelHtml}
        ${daftarChipHtml}
      </div>`;
    }).join("");

    barisHtml.push(`<div class="cal-week-row" role="row">${selHtml}</div>`);
  }

  gridEl.innerHTML = barisHtml.join("");

  const kegiatanTerpilih = petaPerTanggal.get(tanggalTerpilih) || [];
  const labelHariIni = tanggalTerpilih === strHariIni ? "Hari ini • " : "";
  const judulTanggalTerpilih = `${labelHariIni}${formatTanggalLengkapIndonesia(tanggalTerpilih)}`;
  const infoTerpilih = infoHari(tanggalTerpilih);

  // Lencana informasi hari libur / cuti bersama / hari besar pada panel terpilih
  let bannerLiburHtml = "";
  if (infoTerpilih.libur.length > 0 || infoTerpilih.minggu || infoTerpilih.hariBesar.length > 0) {
    const daftarLencana = [];
    if (infoTerpilih.minggu && infoTerpilih.libur.length === 0) {
      daftarLencana.push(`<span class="badge-libur">Hari Minggu</span>`);
    }
    for (const l of infoTerpilih.libur) {
      if (l.jenis === "cuti") {
        daftarLencana.push(`<span class="badge-cuti" title="Cuti Bersama">Cuti bersama: ${escapeHtml(l.nama)}</span>`);
      } else if (l.jenis === "tambahan") {
        daftarLencana.push(`<span class="badge-libur" title="Libur Tambahan">Libur: ${escapeHtml(l.nama)}</span>`);
      } else {
        daftarLencana.push(`<span class="badge-libur" title="Libur Nasional">Libur nasional: ${escapeHtml(l.nama)}</span>`);
      }
    }
    for (const hb of infoTerpilih.hariBesar) {
      daftarLencana.push(`<span class="badge-hari-besar" title="Hari Besar Nasional (bukan libur)">${escapeHtml(hb.nama)}</span>`);
    }
    bannerLiburHtml = `<div class="selected-date-holidays" role="note" aria-label="Informasi hari libur dan hari besar">
      <span class="selected-date-holidays-title">Keterangan Hari:</span>
      <div class="holiday-badges-list">${daftarLencana.join("")}</div>
    </div>`;
  }

  if (!isKegiatanSudahDimuat()) {
    panelTanggalEl.innerHTML = `<div class="selected-date-header">
      <div class="selected-date-heading-wrap">
        <h3 id="jadwal-selected-date-heading" class="selected-date-title${infoTerpilih.merah ? " text-libur" : ""}">${escapeHtml(judulTanggalTerpilih)}</h3>
        <p class="selected-date-subtitle">Memuat kegiatan...</p>
      </div>
    </div>
    ${bannerLiburHtml}
    <div class="skeleton-card" role="status" aria-label="Memuat jadwal kegiatan"><div class="skeleton-line skeleton-w-40"></div><div class="skeleton-line skeleton-w-70"></div></div>`;
    return;
  }

  panelTanggalEl.innerHTML = `<div class="selected-date-header">
    <div class="selected-date-heading-wrap">
      <h3 id="jadwal-selected-date-heading" class="selected-date-title${infoTerpilih.merah ? " text-libur" : ""}">${escapeHtml(judulTanggalTerpilih)}</h3>
      <p class="selected-date-subtitle">${kegiatanTerpilih.length > 0 ? `${kegiatanTerpilih.length} kegiatan terjadwal pada tanggal ini` : "Belum ada kegiatan terjadwal pada tanggal ini"}</p>
    </div>
    <button type="button" class="btn-primary btn-sm-touch" data-action="tambah-kegiatan-tanggal" data-tanggal="${escapeHtml(tanggalTerpilih)}">${IKON_TAMBAH(16)}<span>Tambah kegiatan</span></button>
  </div>
  ${bannerLiburHtml}
  ${kegiatanTerpilih.length === 0
    ? `<div class="empty-stage-card empty-stage-compact"><p class="empty-stage-desc">Tidak ada kegiatan pada <strong>${escapeHtml(formatTanggalLengkapIndonesia(tanggalTerpilih))}</strong>. Tekan tombol <strong>Tambah kegiatan</strong> untuk mencatat agenda di tanggal ini.</p></div>`
    : `<div class="kegiatan-list-grid">${kegiatanTerpilih.map((item) => renderKartuItemJadwal(item)).join("")}</div>`}`;
}

function renderDaftarAgenda30Hari(semuaKegiatan) {
  const region = document.getElementById("jadwal-agenda-region");
  if (!region) return;

  const strAwal = hariIni();
  const strBesok = tambahHari(1);
  const strAkhir = tambahHari(30);

  if (!isKegiatanSudahDimuat()) {
    region.innerHTML = `<div class="skeleton-stack" role="status" aria-label="Memuat agenda 30 hari ke depan"><div class="skeleton-card"><div class="skeleton-line skeleton-w-50"></div><div class="skeleton-line skeleton-w-80"></div></div></div>`;
    return;
  }

  const dalamRentang = urutkanKegiatanKronologis(
    semuaKegiatan.filter(
      (item) => Boolean(parseTanggal(item.tanggal)) && item.tanggal >= strAwal && item.tanggal <= strAkhir
    )
  );
  const keteranganRentang = `${formatTanggalRingkasIndonesia(strAwal)} – ${formatTanggalRingkasIndonesia(strAkhir)}`;

  if (dalamRentang.length === 0) {
    region.innerHTML = `<div class="agenda-range-banner"><span class="agenda-range-text">Rentang 30 hari ke depan: <strong>${escapeHtml(keteranganRentang)}</strong></span></div>
    <div class="empty-stage-card">
      <div class="empty-stage-icon" aria-hidden="true">${svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 24)}</div>
      <p class="empty-stage-desc">Belum ada agenda. Gunakan tombol Tambah kegiatan di atas.</p>
    </div>`;
    return;
  }

  const grupTanggal = new Map();
  dalamRentang.forEach((item) => {
    if (!grupTanggal.has(item.tanggal)) grupTanggal.set(item.tanggal, []);
    grupTanggal.get(item.tanggal).push(item);
  });

  const grupHtml = Array.from(grupTanggal.entries()).map(([tgl, daftarItem]) => {
    const penandaRelatif = tgl === strAwal ? "Hari ini • " : tgl === strBesok ? "Besok • " : "";
    const infoGrup = infoHari(tgl);

    let labelLiburAgenda = "";
    if (infoGrup.libur.length > 0) {
      labelLiburAgenda = infoGrup.libur
        .map((l) => (l.jenis === "cuti" ? `Cuti bersama: ${l.nama}` : l.nama))
        .join(", ");
    } else if (infoGrup.minggu) {
      labelLiburAgenda = "Hari Minggu";
    }

    let labelHariBesarAgenda = "";
    if (infoGrup.hariBesar.length > 0) {
      labelHariBesarAgenda = infoGrup.hariBesar.map((h) => h.nama).join(", ");
    }

    return `<section class="agenda-day-group" aria-label="${escapeHtml(formatTanggalLengkapIndonesia(tgl))}">
      <div class="agenda-day-header">
        <div class="agenda-day-title-wrap">
          <h3 class="agenda-day-title${infoGrup.merah ? " text-libur" : ""}">
            ${escapeHtml(penandaRelatif)}${escapeHtml(formatTanggalLengkapIndonesia(tgl))}
            ${labelLiburAgenda ? ` • <span class="agenda-holiday-tag">${escapeHtml(labelLiburAgenda)}</span>` : ""}
            ${labelHariBesarAgenda ? ` • <span class="agenda-haribesar-tag">${escapeHtml(labelHariBesarAgenda)}</span>` : ""}
          </h3>
          <span class="agenda-day-count">${daftarItem.length} kegiatan</span>
        </div>
      </div>
      <div class="kegiatan-list-grid">${daftarItem.map((item) => renderKartuItemJadwal(item)).join("")}</div>
    </section>`;
  }).join("");

  region.innerHTML = `<div class="agenda-range-banner">
    <span class="agenda-range-text">Rentang 30 hari ke depan: <strong>${escapeHtml(keteranganRentang)}</strong></span>
    <span class="agenda-range-total">${dalamRentang.length} kegiatan dalam ${grupTanggal.size} tanggal</span>
  </div>
  <div class="agenda-groups-stack">${grupHtml}</div>`;
}

export function renderHalamanJadwal() {
  pastikanKerangkaHalamanJadwal();

  const btnKalender = document.getElementById("btn-view-kalender");
  const btnAgenda = document.getElementById("btn-view-agenda");
  const viewKalender = document.getElementById("jadwal-kalender-view");
  const viewAgenda = document.getElementById("jadwal-agenda-view");

  const aktifKalender = modeTampilanJadwal === "kalender";
  if (btnKalender) {
    btnKalender.classList.toggle("is-active", aktifKalender);
    btnKalender.setAttribute("aria-pressed", aktifKalender ? "true" : "false");
  }
  if (btnAgenda) {
    btnAgenda.classList.toggle("is-active", !aktifKalender);
    btnAgenda.setAttribute("aria-pressed", !aktifKalender ? "true" : "false");
  }
  if (viewKalender) viewKalender.hidden = !aktifKalender;
  if (viewAgenda) viewAgenda.hidden = aktifKalender;

  const semuaKegiatan = getDaftarKegiatan();
  const petaPerTanggal = kelompokkanKegiatanPerTanggal(semuaKegiatan);

  renderKalenderBulanan(petaPerTanggal);
  renderDaftarAgenda30Hari(semuaKegiatan);

  if (detailModalTerbuka) segarkanIsiDialogDetailKegiatan();
}

export function bukaJadwalPadaTanggal(tanggalTarget) {
  const obj = parseTanggal(tanggalTarget);
  if (obj) {
    tanggalTerpilih = tanggalTarget;
    tahunKalender = obj.getFullYear();
    bulanKalender = obj.getMonth();
    // Sinkronkan jendela tanggal aktif
    sinkronkanJendelaTanggalKegiatan(tahunKalender, bulanKalender);
  }
  modeTampilanJadwal = "kalender";
  pindahKeBagian("jadwal");
  renderHalamanJadwal();
}

function segarkanIsiDialogDetailKegiatan() {
  const modal = document.getElementById("kegiatan-detail-modal");
  const body = document.getElementById("kegiatan-detail-body");
  const titleEl = document.getElementById("kegiatan-detail-title");
  if (!modal || !body || !idKegiatanDetailAktif) return;

  const item = getDaftarKegiatan().find((k) => k.id === idKegiatanDetailAktif);
  if (!item) {
    tutupDialogDetailKegiatan(false);
    return;
  }

  const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
  const rentangWaktu = item.waktuMulai
    ? item.waktuSelesai ? `${item.waktuMulai} – ${item.waktuSelesai}` : item.waktuMulai
    : "Sepanjang hari (tanpa jam khusus)";

  if (titleEl) titleEl.textContent = item.judul;

  const opsiStatus = DAFTAR_STATUS_KEGIATAN.map(
    (st) => `<option value="${escapeHtml(st)}" ${item.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`
  ).join("");

  body.innerHTML = `<div class="kegiatan-badges-row">
    <span class="cat-badge cat-color-${escapeHtml(infoKat.warna)}"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
    <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
  </div>
  <dl class="detail-meta-grid">
    <div class="detail-meta-row"><dt>Tanggal</dt><dd>${escapeHtml(formatTanggalLengkapIndonesia(item.tanggal))}</dd></div>
    <div class="detail-meta-row"><dt>Waktu</dt><dd>${escapeHtml(rentangWaktu)}</dd></div>
    ${item.lokasi ? `<div class="detail-meta-row"><dt>Lokasi</dt><dd>${escapeHtml(item.lokasi)}</dd></div>` : ""}
  </dl>
  ${item.catatan ? `<div class="detail-note-wrap"><span class="form-label">Catatan</span><p class="kegiatan-card-note">${escapeHtml(item.catatan)}</p></div>` : ""}
  <div class="form-field">
    <label for="detail-quick-status-select" class="form-label">Perbarui Status</label>
    <select id="detail-quick-status-select" class="form-select" data-id="${escapeHtml(item.id)}">${opsiStatus}</select>
  </div>`;
}

export function bukaDialogDetailKegiatan(kegiatanId) {
  const modal = document.getElementById("kegiatan-detail-modal");
  const closeBtn = document.getElementById("kegiatan-detail-close-btn");
  if (!modal || !kegiatanId) return;

  const item = getDaftarKegiatan().find((k) => k.id === kegiatanId);
  if (!item) return;

  fokusSebelumDetailModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  idKegiatanDetailAktif = item.id;
  segarkanIsiDialogDetailKegiatan();

  detailModalTerbuka = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (closeBtn instanceof HTMLElement) closeBtn.focus();
  });
}

export function tutupDialogDetailKegiatan(kembalikanFokus = true) {
  const modal = document.getElementById("kegiatan-detail-modal");
  if (!modal || !detailModalTerbuka) return;

  detailModalTerbuka = false;
  idKegiatanDetailAktif = null;
  modal.hidden = true;

  const alertBox = document.getElementById("kegiatan-detail-alert");
  const alertTxt = document.getElementById("kegiatan-detail-alert-text");
  if (alertBox && alertTxt) { alertTxt.textContent = ""; alertBox.hidden = true; }

  if (kembalikanFokus && fokusSebelumDetailModal && document.contains(fokusSebelumDetailModal)) {
    fokusSebelumDetailModal.focus();
  }
  fokusSebelumDetailModal = null;
}

function ikatEventDialogDetailKegiatan() {
  if (detailModalSudahDiikat) return;
  detailModalSudahDiikat = true;

  const modal = document.getElementById("kegiatan-detail-modal");
  const closeBtn = document.getElementById("kegiatan-detail-close-btn");
  const tutupBawahBtn = document.getElementById("kegiatan-detail-dismiss-btn");
  const editBtn = document.getElementById("kegiatan-detail-edit-btn");
  const hapusBtn = document.getElementById("kegiatan-detail-delete-btn");
  const body = document.getElementById("kegiatan-detail-body");
  const alertBox = document.getElementById("kegiatan-detail-alert");
  const alertTxt = document.getElementById("kegiatan-detail-alert-text");

  if (closeBtn) closeBtn.addEventListener("click", () => tutupDialogDetailKegiatan(true));
  if (tutupBawahBtn) tutupBawahBtn.addEventListener("click", () => tutupDialogDetailKegiatan(true));
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) tutupDialogDetailKegiatan(true); });

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const item = getDaftarKegiatan().find((k) => k.id === idKegiatanDetailAktif);
      tutupDialogDetailKegiatan(false);
      if (item) bukaModalFormKegiatan(item);
    });
  }

  if (hapusBtn) {
    hapusBtn.addEventListener("click", () => {
      const item = getDaftarKegiatan().find((k) => k.id === idKegiatanDetailAktif);
      tutupDialogDetailKegiatan(false);
      if (item) bukaDialogHapusKegiatan(item);
    });
  }

  if (body) {
    body.addEventListener("change", async (e) => {
      const select = e.target instanceof HTMLSelectElement && e.target.id === "detail-quick-status-select" ? e.target : null;
      if (!select) return;
      const id = select.getAttribute("data-id");
      if (!id) return;

      if (alertBox && alertTxt) { alertTxt.textContent = ""; alertBox.hidden = true; }
      select.disabled = true;
      try {
        await ubahStatusKegiatanCepat(id, select.value);
      } catch (err) {
        if (alertBox && alertTxt) {
          alertTxt.textContent = formatPesanGalatFirestore(err);
          alertBox.hidden = false;
        }
        segarkanIsiDialogDetailKegiatan();
      } finally {
        select.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && detailModalTerbuka) {
      e.preventDefault();
      tutupDialogDetailKegiatan(true);
    }
  });
}

function pindahBulanKalender(deltaBulan) {
  let bulanBaru = bulanKalender + deltaBulan;
  let tahunBaru = tahunKalender;
  if (bulanBaru < 0) { bulanBaru = 11; tahunBaru -= 1; }
  else if (bulanBaru > 11) { bulanBaru = 0; tahunBaru += 1; }

  tahunKalender = tahunBaru;
  bulanKalender = bulanBaru;

  const strHariIni = hariIni();
  const objHariIni = parseTanggal(strHariIni);
  if (objHariIni && objHariIni.getFullYear() === tahunKalender && objHariIni.getMonth() === bulanKalender) {
    tanggalTerpilih = strHariIni;
  } else {
    tanggalTerpilih = tanggalLokal(new Date(tahunKalender, bulanKalender, 1));
  }

  // Sinkronkan listener jendela kegiatan (+/- 1 bulan)
  sinkronkanJendelaTanggalKegiatan(tahunKalender, bulanKalender);
  renderHalamanJadwal();
}

function pilihTanggalPadaKalender(tanggalStr) {
  const obj = parseTanggal(tanggalStr);
  if (!obj) return;
  tanggalTerpilih = tanggalStr;
  const thnSebelumnya = tahunKalender;
  const blnSebelumnya = bulanKalender;
  tahunKalender = obj.getFullYear();
  bulanKalender = obj.getMonth();

  if (tahunKalender !== thnSebelumnya || bulanKalender !== blnSebelumnya) {
    sinkronkanJendelaTanggalKegiatan(tahunKalender, bulanKalender);
  }
  renderHalamanJadwal();
}

export function initHalamanJadwal() {
  inisialisasiStateTanggalAwal();
  pastikanKerangkaHalamanJadwal();
  ikatEventDialogDetailKegiatan();

  // Sinkronkan jendela tanggal kalender saat init
  sinkronkanJendelaTanggalKegiatan(tahunKalender, bulanKalender);

  if (jadwalSudahDiikat) return;
  jadwalSudahDiikat = true;

  const panel = document.getElementById("section-jadwal");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      const viewBtn = targetEl.closest("button[data-jadwal-view]");
      if (viewBtn) {
        modeTampilanJadwal = viewBtn.getAttribute("data-jadwal-view") === "agenda" ? "agenda" : "kalender";
        tampilkanGalatHalamanJadwal("");
        renderHalamanJadwal();
        return;
      }

      if (targetEl.closest("#btn-jadwal-tambah-utama")) {
        const defaultTgl = modeTampilanJadwal === "kalender" && parseTanggal(tanggalTerpilih) ? tanggalTerpilih : hariIni();
        bukaModalFormKegiatan(null, defaultTgl);
        return;
      }

      if (targetEl.closest("#btn-bulan-sebelumnya")) { pindahBulanKalender(-1); return; }
      if (targetEl.closest("#btn-bulan-berikutnya")) { pindahBulanKalender(1); return; }
      if (targetEl.closest("#btn-jadwal-hari-ini")) {
        inisialisasiStateTanggalAwal();
        sinkronkanJendelaTanggalKegiatan(tahunKalender, bulanKalender);
        renderHalamanJadwal();
        return;
      }

      if (targetEl.closest("[data-action='ke-pengaturan-libur']")) {
        pindahKeBagian("pengaturan");
        requestAnimationFrame(() => {
          const el = document.getElementById("settings-libur-card");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        });
        return;
      }

      const actionBtn = targetEl.closest("button[data-action]");
      if (actionBtn) {
        const aksi = actionBtn.getAttribute("data-action");
        const id = actionBtn.getAttribute("data-id") || "";
        const tgl = actionBtn.getAttribute("data-tanggal") || "";

        if (aksi === "pilih-tanggal" && tgl) { pilihTanggalPadaKalender(tgl); return; }
        if (aksi === "tambah-kegiatan-tanggal") { bukaModalFormKegiatan(null, tgl || tanggalTerpilih || hariIni()); return; }
        if (aksi === "buka-detail-kegiatan" && id) {
          if (tgl && parseTanggal(tgl)) pilihTanggalPadaKalender(tgl);
          bukaDialogDetailKegiatan(id);
          return;
        }
        if (aksi === "edit-kegiatan-jadwal" && id) {
          const item = getDaftarKegiatan().find((k) => k.id === id);
          if (item) bukaModalFormKegiatan(item);
          return;
        }
        if (aksi === "hapus-kegiatan-jadwal" && id) {
          const item = getDaftarKegiatan().find((k) => k.id === id);
          if (item) bukaDialogHapusKegiatan(item);
          return;
        }
      }

      const cellEl = targetEl.closest(".cal-day-cell[data-tanggal]");
      if (cellEl && !targetEl.closest("button, select")) {
        const tglSel = cellEl.getAttribute("data-tanggal");
        if (tglSel) pilihTanggalPadaKalender(tglSel);
      }
    });

    panel.addEventListener("change", async (e) => {
      const select = e.target instanceof HTMLSelectElement && e.target.getAttribute("data-action") === "quick-status-jadwal" ? e.target : null;
      if (!select) return;
      const id = select.getAttribute("data-id");
      if (!id) return;

      tampilkanGalatHalamanJadwal("");
      select.disabled = true;
      try {
        await ubahStatusKegiatanCepat(id, select.value);
      } catch (err) {
        tampilkanGalatHalamanJadwal(formatPesanGalatFirestore(err));
        renderHalamanJadwal();
      } finally {
        select.disabled = false;
      }
    });
  }

  onPerubahanKegiatan(() => renderHalamanJadwal());
  renderHalamanJadwal();
}

export function resetHalamanJadwalSaatKeluar() {
  tutupDialogDetailKegiatan(false);
  tampilkanGalatHalamanJadwal("");
  inisialisasiStateTanggalAwal();
  modeTampilanJadwal = "kalender";
}
