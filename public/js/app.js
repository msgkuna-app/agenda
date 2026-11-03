/**
 * Titik Masuk Utama Aplikasi "Agenda & Arsip" (Fase 3: Dokumen di Google Drive)
 * Mengatur sesi masuk, layar galat konfigurasi, layar login, Dashboard (termasuk kartu
 * 5 "Dokumen terbaru"), halaman Kegiatan, Jadwal, dan Dokumen, pemantau kedaluwarsa token
 * Google Drive, konfirmasi keluar, dan Service Worker.
 */
import { isFirebaseConfigured } from "./firebase-config.js";
import {
  AUTHORIZED_EMAIL,
  initAuth,
  loginWithGoogle,
  logoutUser,
  isDriveTokenExpired,
  consumeLastAuthError,
  formatPesanGalatAuth
} from "./auth.js";
import { initTema } from "./tema.js";
import {
  initSidebar,
  perbaruiInfoAkunSidebar,
  tutupDrawerMobile,
  pindahKeBagian,
  escapeHtml
} from "./sidebar.js";
import { hariIni, tambahHari, parseTanggal } from "./util-tanggal.js";
import {
  DAFTAR_STATUS_KEGIATAN,
  manajerKategoriKegiatan,
  initHalamanKegiatan,
  subscribeKegiatan,
  unsubscribeKegiatan,
  getDaftarKegiatan,
  isKegiatanSudahDimuat,
  onPerubahanKegiatan,
  bukaModalFormKegiatan,
  terapkanFilterStatusKegiatan,
  kelasBadgeStatus
} from "./kegiatan.js";
import {
  initHalamanJadwal,
  renderHalamanJadwal,
  bukaJadwalPadaTanggal,
  bukaDialogDetailKegiatan,
  resetHalamanJadwalSaatKeluar,
  formatTanggalLengkapIndonesia,
  formatTanggalRingkasIndonesia,
  urutkanKegiatanKronologis
} from "./jadwal.js";
import {
  manajerKategoriDokumen,
  initHalamanDokumen,
  subscribeDokumen,
  unsubscribeDokumen,
  getDaftarDokumen,
  isDokumenSudahDimuat,
  onPerubahanDokumen,
  bukaModalUnggahDokumen,
  formatTanggalDokumenLokal,
  formatUkuranBerkas,
  infoJenisBerkasMime
} from "./dokumen.js";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const svgIkon = (isi, uk = 18, tebal = 2) =>
  `<svg viewBox="0 0 24 24" width="${uk}" height="${uk}" fill="none" stroke="currentColor" stroke-width="${tebal}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;

let dataUnsubscribers = [];
let tokenCheckIntervalId = null;
let logoutDialogOpen = false;
let focusBeforeModal = null;
let dashboardSudahDiikat = false;

export function hentikanSemuaLanggananData() {
  unsubscribeKegiatan();
  unsubscribeDokumen();
  resetHalamanJadwalSaatKeluar();
  while (dataUnsubscribers.length > 0) {
    const unsub = dataUnsubscribers.pop();
    if (typeof unsub === "function") {
      try { unsub(); } catch (_err) {}
    }
  }
}

function tampilkanLayarUtama(namaLayar) {
  const layarChecking = document.getElementById("screen-checking");
  const layarConfigError = document.getElementById("screen-config-error");
  const layarLogin = document.getElementById("screen-login");
  const layarApp = document.getElementById("app-shell");

  if (layarChecking) layarChecking.hidden = namaLayar !== "checking";
  if (layarConfigError) layarConfigError.hidden = namaLayar !== "config-error";
  if (layarLogin) layarLogin.hidden = namaLayar !== "login";
  if (layarApp) layarApp.hidden = namaLayar !== "app";

  if (namaLayar !== "app") {
    tutupDrawerMobile(false);
    tutupDialogKeluar(false);
  }
}

function setPesanGalatLogin(pesan) {
  const kotak = document.getElementById("login-error-box");
  const teks = document.getElementById("login-error-text");
  if (!kotak || !teks) return;
  const bersih = pesan ? pesan.trim() : "";
  teks.textContent = bersih;
  kotak.hidden = !bersih;
}

function perbaruiTanggalHeader() {
  const el = document.getElementById("header-date-text");
  if (!el) return;
  const isoLokal = hariIni();
  const tgl = parseTanggal(isoLokal);
  el.textContent = tgl
    ? `${NAMA_HARI[tgl.getDay()]}, ${tgl.getDate()} ${NAMA_BULAN[tgl.getMonth()]} ${tgl.getFullYear()}`
    : isoLokal;
}

function pastikanKerangkaDashboard() {
  const panel = document.getElementById("section-dashboard");
  if (!panel || panel.querySelector("#dashboard-cards-grid")) return;

  panel.innerHTML = `<div class="page-stack">
    <div class="section-header-bar">
      <div class="section-heading-group">
        <h2 class="section-heading-title">Ringkasan Hari Ini</h2>
        <p id="dashboard-subtitle-tanggal" class="section-heading-subtitle"></p>
      </div>
      <div class="section-header-actions">
        <button type="button" id="btn-dashboard-buka-jadwal" class="btn-secondary">${svgIkon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', 17)}<span>Buka Jadwal</span></button>
        <button type="button" id="btn-dashboard-tambah-kegiatan" class="btn-primary">${svgIkon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18, 2.2)}<span>Tambah kegiatan</span></button>
      </div>
    </div>
    <div id="dashboard-cards-grid" class="dashboard-cards-grid">
      <section class="dash-card" aria-labelledby="dash-title-hari-ini">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-hari-ini" class="dash-card-title">Kegiatan hari ini</h3>
            <span id="dash-meta-hari-ini" class="dash-card-caption"></span>
          </div>
          <span id="dash-count-hari-ini" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-hari-ini" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="tambah-hari-ini">+ Tambah kegiatan hari ini</button>
          <button type="button" class="btn-link-filter" data-dash-action="jadwal-hari-ini">Lihat di kalender</button>
        </div>
      </section>

      <section class="dash-card" aria-labelledby="dash-title-7hari">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-7hari" class="dash-card-title">7 hari ke depan</h3>
            <span id="dash-meta-7hari" class="dash-card-caption"></span>
          </div>
          <span id="dash-count-7hari" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-7hari" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="buka-jadwal">Buka halaman Jadwal</button>
        </div>
      </section>

      <section class="dash-card" aria-labelledby="dash-title-status">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-status" class="dash-card-title">Ringkasan status</h3>
            <span id="dash-meta-status" class="dash-card-caption">Semua kegiatan tercatat</span>
          </div>
          <span id="dash-count-total" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-status" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="semua-kegiatan">Kelola semua kegiatan</button>
        </div>
      </section>

      <section class="dash-card" aria-labelledby="dash-title-dokumen">
        <div class="dash-card-header">
          <div class="dash-card-heading-group">
            <h3 id="dash-title-dokumen" class="dash-card-title">Dokumen terbaru</h3>
            <span class="dash-card-caption">5 berkas terakhir di Google Drive</span>
          </div>
          <span id="dash-count-dokumen" class="dash-metric-number">0</span>
        </div>
        <div id="dash-body-dokumen" class="dash-card-body" aria-live="polite"></div>
        <div class="dash-card-footer">
          <button type="button" class="btn-link-filter" data-dash-action="unggah-dokumen">+ Unggah dokumen</button>
          <button type="button" class="btn-link-filter" data-dash-action="buka-dokumen">Semua dokumen</button>
        </div>
      </section>
    </div>
  </div>`;
}

function renderBarisKegiatanDashboard(item, tampilkanTanggal) {
  const infoKat = manajerKategoriKegiatan.cariInfoKategori(item.kategoriId);
  const labelWaktu = item.waktuMulai
    ? item.waktuSelesai ? `${item.waktuMulai}–${item.waktuSelesai}` : item.waktuMulai
    : "Sepanjang hari";
  const infoSub = tampilkanTanggal ? `${formatTanggalRingkasIndonesia(item.tanggal)} • ${labelWaktu}` : labelWaktu;

  return `<li class="dash-activity-item${item.status === "Selesai" ? " is-completed" : ""}">
    <div class="dash-activity-main">
      <button type="button" class="dash-activity-title-btn" data-dash-action="detail-kegiatan" data-id="${escapeHtml(item.id)}">${escapeHtml(item.judul)}</button>
      <div class="dash-activity-meta">
        <span class="dash-activity-time">${escapeHtml(infoSub)}</span>
        <span class="dash-meta-sep" aria-hidden="true">•</span>
        <span class="dash-cat-inline"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
      </div>
    </div>
    <span class="${kelasBadgeStatus(item.status)}">${escapeHtml(item.status)}</span>
  </li>`;
}

function renderKartuDokumenDashboard() {
  const bodyDokumen = document.getElementById("dash-body-dokumen");
  const countDokumen = document.getElementById("dash-count-dokumen");
  if (!bodyDokumen) return;

  if (!isDokumenSudahDimuat()) {
    bodyDokumen.innerHTML = `<div class="dash-loading-state"><div class="spinner" aria-hidden="true"></div><span>Memuat arsip dokumen...</span></div>`;
    return;
  }

  const semuaDokumen = getDaftarDokumen();
  if (countDokumen) countDokumen.textContent = String(semuaDokumen.length);

  if (semuaDokumen.length === 0) {
    bodyDokumen.innerHTML = `<p class="dash-empty-text">Belum ada dokumen yang diunggah ke Google Drive.</p>`;
    return;
  }

  const limaTerbaru = [...semuaDokumen]
    .sort((a, b) =>
      String(b.tanggalUnggah || b.createdAt || "").localeCompare(
        String(a.tanggalUnggah || a.createdAt || "")
      )
    )
    .slice(0, 5);

  const htmlItem = limaTerbaru
    .map((dok) => {
      const infoKat = manajerKategoriDokumen.cariInfoKategori(dok.kategoriId);
      const jenis = infoJenisBerkasMime(dok.mimeType, dok.namaFile);
      const nama = dok.namaTampilan || dok.namaFile || "Dokumen";
      const tanggalLokalStr = formatTanggalDokumenLokal(dok.tanggalUnggah || dok.createdAt);
      const ukuranStr = formatUkuranBerkas(dok.ukuran);
      const tautanAman =
        dok.tautan && /^https?:\/\//i.test(dok.tautan)
          ? dok.tautan
          : dok.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(dok.driveFileId)}/view`
            : "#";

      return `<li class="dash-doc-item">
        <div class="dash-activity-main">
          <a href="${escapeHtml(tautanAman)}" target="_blank" rel="noopener noreferrer" class="dash-doc-link" title="Buka ${escapeHtml(nama)} di Google Drive">
            <span class="dash-doc-link-text">${escapeHtml(nama)}</span>
          </a>
          <div class="dash-activity-meta">
            <span>${escapeHtml(jenis.label)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span>${escapeHtml(ukuranStr)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span>${escapeHtml(tanggalLokalStr)}</span>
            <span class="dash-meta-sep" aria-hidden="true">•</span>
            <span class="dash-cat-inline"><span class="cat-dot cat-dot-${escapeHtml(infoKat.warna)}" aria-hidden="true"></span><span>${escapeHtml(infoKat.nama)}</span></span>
          </div>
        </div>
      </li>`;
    })
    .join("");

  const sisa = semuaDokumen.length - limaTerbaru.length;
  bodyDokumen.innerHTML = `<ul class="dash-doc-list">${htmlItem}</ul>${
    sisa > 0 ? `<p class="dash-more-note">+${sisa} dokumen lainnya di Arsip Dokumen</p>` : ""
  }`;
}

function renderDashboard() {
  pastikanKerangkaDashboard();

  const strHariIni = hariIni();
  const strBesok = tambahHari(1);
  const strTujuhHari = tambahHari(7);

  const subtitleEl = document.getElementById("dashboard-subtitle-tanggal");
  if (subtitleEl) {
    subtitleEl.textContent = `Ikhtisar jadwal, status kegiatan, dan arsip dokumen Anda pada ${formatTanggalLengkapIndonesia(strHariIni)}.`;
  }

  const metaHariIniEl = document.getElementById("dash-meta-hari-ini");
  const meta7HariEl = document.getElementById("dash-meta-7hari");
  if (metaHariIniEl) metaHariIniEl.textContent = formatTanggalRingkasIndonesia(strHariIni);
  if (meta7HariEl) meta7HariEl.textContent = `${formatTanggalRingkasIndonesia(strBesok)} – ${formatTanggalRingkasIndonesia(strTujuhHari)}`;

  renderKartuDokumenDashboard();

  const bodyHariIni = document.getElementById("dash-body-hari-ini");
  const body7Hari = document.getElementById("dash-body-7hari");
  const bodyStatus = document.getElementById("dash-body-status");
  const countHariIni = document.getElementById("dash-count-hari-ini");
  const count7Hari = document.getElementById("dash-count-7hari");
  const countTotal = document.getElementById("dash-count-total");
  if (!bodyHariIni || !body7Hari || !bodyStatus) return;

  if (!isKegiatanSudahDimuat()) {
    const muatHtml = `<div class="dash-loading-state"><div class="spinner" aria-hidden="true"></div><span>Memuat data kegiatan...</span></div>`;
    bodyHariIni.innerHTML = muatHtml;
    body7Hari.innerHTML = muatHtml;
    bodyStatus.innerHTML = muatHtml;
    return;
  }

  const semuaKegiatan = getDaftarKegiatan();

  // 1. Kegiatan hari ini: tanggal == hariIni() (semua status tetap dihitung)
  const kegiatanHariIni = urutkanKegiatanKronologis(
    semuaKegiatan.filter((item) => Boolean(parseTanggal(item.tanggal)) && item.tanggal === strHariIni)
  );

  // 2. 7 hari ke depan: hariIni() sampai tambahHari(7), tidak termasuk hari ini (semua status tetap dihitung)
  const kegiatan7Hari = urutkanKegiatanKronologis(
    semuaKegiatan.filter(
      (item) => Boolean(parseTanggal(item.tanggal)) && item.tanggal > strHariIni && item.tanggal <= strTujuhHari
    )
  );

  // 3. Ringkasan status: jumlah per status
  const hitunganStatus = { Rencana: 0, Berjalan: 0, Selesai: 0 };
  semuaKegiatan.forEach((item) => {
    const st = DAFTAR_STATUS_KEGIATAN.includes(item.status) ? item.status : "Rencana";
    hitunganStatus[st] += 1;
  });

  if (countHariIni) countHariIni.textContent = String(kegiatanHariIni.length);
  if (count7Hari) count7Hari.textContent = String(kegiatan7Hari.length);
  if (countTotal) countTotal.textContent = String(semuaKegiatan.length);

  if (kegiatanHariIni.length === 0) {
    bodyHariIni.innerHTML = `<p class="dash-empty-text">Belum ada kegiatan yang dijadwalkan untuk hari ini.</p>`;
  } else {
    const maks = 5;
    const sisa = kegiatanHariIni.length - maks;
    bodyHariIni.innerHTML = `<ul class="dash-activity-list">${kegiatanHariIni.slice(0, maks).map((item) => renderBarisKegiatanDashboard(item, false)).join("")}</ul>${sisa > 0 ? `<p class="dash-more-note">+${sisa} kegiatan lainnya hari ini</p>` : ""}`;
  }

  if (kegiatan7Hari.length === 0) {
    body7Hari.innerHTML = `<p class="dash-empty-text">Tidak ada kegiatan terjadwal untuk 7 hari ke depan (besok hingga ${escapeHtml(formatTanggalRingkasIndonesia(strTujuhHari))}).</p>`;
  } else {
    const maks7 = 5;
    const sisa7 = kegiatan7Hari.length - maks7;
    body7Hari.innerHTML = `<ul class="dash-activity-list">${kegiatan7Hari.slice(0, maks7).map((item) => renderBarisKegiatanDashboard(item, true)).join("")}</ul>${sisa7 > 0 ? `<p class="dash-more-note">+${sisa7} kegiatan lainnya dalam 7 hari ke depan</p>` : ""}`;
  }

  const totalSemua = semuaKegiatan.length;
  bodyStatus.innerHTML = `<ul class="dash-status-list">${DAFTAR_STATUS_KEGIATAN.map((st) => {
    const jumlah = hitunganStatus[st] || 0;
    const persen = totalSemua > 0 ? Math.round((jumlah / totalSemua) * 100) : 0;
    return `<li class="dash-status-row">
      <button type="button" class="dash-status-btn" data-dash-action="filter-status" data-status="${escapeHtml(st)}" title="Lihat kegiatan berstatus ${escapeHtml(st)}">
        <span class="${kelasBadgeStatus(st)}">${escapeHtml(st)}</span>
        <span class="dash-status-numbers"><strong class="dash-status-count">${jumlah}</strong><span class="dash-status-pct">(${persen}%)</span></span>
      </button>
    </li>`;
  }).join("")}</ul>`;
}

function initHalamanDashboard() {
  pastikanKerangkaDashboard();
  if (dashboardSudahDiikat) return;
  dashboardSudahDiikat = true;

  const panel = document.getElementById("section-dashboard");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      if (targetEl.closest("#btn-dashboard-buka-jadwal")) { pindahKeBagian("jadwal"); return; }
      if (targetEl.closest("#btn-dashboard-tambah-kegiatan")) { bukaModalFormKegiatan(null, hariIni()); return; }

      const btnAksi = targetEl.closest("button[data-dash-action]");
      if (!btnAksi) return;

      const aksi = btnAksi.getAttribute("data-dash-action");
      if (aksi === "tambah-hari-ini") bukaModalFormKegiatan(null, hariIni());
      else if (aksi === "jadwal-hari-ini") bukaJadwalPadaTanggal(hariIni());
      else if (aksi === "buka-jadwal") pindahKeBagian("jadwal");
      else if (aksi === "semua-kegiatan") terapkanFilterStatusKegiatan("ALL");
      else if (aksi === "filter-status") terapkanFilterStatusKegiatan(btnAksi.getAttribute("data-status") || "ALL");
      else if (aksi === "detail-kegiatan") {
        const id = btnAksi.getAttribute("data-id") || "";
        if (id) bukaDialogDetailKegiatan(id);
      } else if (aksi === "unggah-dokumen") {
        pindahKeBagian("dokumen");
        bukaModalUnggahDokumen();
      } else if (aksi === "buka-dokumen") {
        pindahKeBagian("dokumen");
      }
    });
  }

  onPerubahanKegiatan(() => renderDashboard());
  onPerubahanDokumen(() => renderKartuDokumenDashboard());
  renderDashboard();
}

function periksaStatusTokenDrive() {
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = !isDriveTokenExpired();
}

function mulaiPemantauTokenDrive() {
  hentikanPemantauTokenDrive();
  periksaStatusTokenDrive();
  tokenCheckIntervalId = window.setInterval(periksaStatusTokenDrive, 30 * 1000);
}

function hentikanPemantauTokenDrive() {
  if (tokenCheckIntervalId !== null) {
    window.clearInterval(tokenCheckIntervalId);
    tokenCheckIntervalId = null;
  }
  const banner = document.getElementById("token-expired-banner");
  if (banner) banner.hidden = true;
}

function perbaruiIndikatorJaringan() {
  const offlineBanner = document.getElementById("offline-banner");
  if (offlineBanner) offlineBanner.hidden = navigator.onLine;
}

function bukaDialogKeluar() {
  const modal = document.getElementById("logout-confirm-modal");
  const btnBatal = document.getElementById("logout-cancel-btn");
  if (!modal) return;

  focusBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  logoutDialogOpen = true;
  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

function tutupDialogKeluar(kembalikanFokus = true) {
  const modal = document.getElementById("logout-confirm-modal");
  if (!modal || !logoutDialogOpen) return;

  logoutDialogOpen = false;
  modal.hidden = true;
  if (kembalikanFokus && focusBeforeModal && document.contains(focusBeforeModal)) {
    focusBeforeModal.focus();
  }
  focusBeforeModal = null;
}

function pasangEventListenerAntarmuka() {
  const btnLogin = document.getElementById("google-login-btn");
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      setPesanGalatLogin("");
      btnLogin.disabled = true;
      btnLogin.setAttribute("aria-busy", "true");
      const labelEl = btnLogin.querySelector(".btn-google-label");
      const teksAwal = labelEl ? labelEl.textContent : "Masuk dengan Google";
      if (labelEl) labelEl.textContent = "Menghubungkan ke Google...";

      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
      } catch (err) {
        const pesanTertunda = consumeLastAuthError();
        setPesanGalatLogin(pesanTertunda || formatPesanGalatAuth(err));
      } finally {
        btnLogin.disabled = false;
        btnLogin.removeAttribute("aria-busy");
        if (labelEl) labelEl.textContent = teksAwal;
      }
    });
  }

  const btnRelogin = document.getElementById("relogin-drive-btn");
  if (btnRelogin) {
    btnRelogin.addEventListener("click", async () => {
      btnRelogin.disabled = true;
      const teksAwal = btnRelogin.textContent;
      btnRelogin.textContent = "Memuat...";
      try {
        await loginWithGoogle();
        periksaStatusTokenDrive();
      } catch (err) {
        const bannerText = document.getElementById("token-expired-text");
        if (bannerText) bannerText.textContent = `Gagal memperbarui sesi Drive: ${escapeHtml(formatPesanGalatAuth(err))}`;
      } finally {
        btnRelogin.disabled = false;
        btnRelogin.textContent = teksAwal;
      }
    });
  }

  const modalLogout = document.getElementById("logout-confirm-modal");
  const btnBatalLogout = document.getElementById("logout-cancel-btn");
  const btnKonfirmasiLogout = document.getElementById("logout-confirm-btn");

  if (btnBatalLogout) btnBatalLogout.addEventListener("click", () => tutupDialogKeluar(true));
  if (modalLogout) modalLogout.addEventListener("click", (e) => { if (e.target === modalLogout) tutupDialogKeluar(true); });

  if (btnKonfirmasiLogout) {
    btnKonfirmasiLogout.addEventListener("click", async () => {
      btnKonfirmasiLogout.disabled = true;
      try {
        tutupDialogKeluar(false);
        hentikanSemuaLanggananData();
        hentikanPemantauTokenDrive();
        await logoutUser();
      } catch (err) {
        setPesanGalatLogin(formatPesanGalatAuth(err));
      } finally {
        btnKonfirmasiLogout.disabled = false;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!logoutDialogOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupDialogKeluar(true);
      return;
    }
    if (e.key === "Tab" && modalLogout) {
      const tombol = Array.from(modalLogout.querySelectorAll("button:not([disabled])"));
      if (tombol.length === 0) return;
      const pertama = tombol[0];
      const terakhir = tombol[tombol.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    }
  });

  window.addEventListener("online", perbaruiIndikatorJaringan);
  window.addEventListener("offline", perbaruiIndikatorJaringan);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !document.getElementById("app-shell")?.hidden) {
      periksaStatusTokenDrive();
      perbaruiTanggalHeader();
      renderDashboard();
      renderHalamanJadwal();
    }
  });
}

let deferredInstallPrompt = null;

function initPwaInstallPrompt() {
  const btnInstall = document.getElementById("pwa-install-btn");
  const iosModal = document.getElementById("ios-install-modal");
  const btnTutupIos = document.getElementById("ios-install-close-btn");
  if (!btnInstall) return;

  const sedangStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (sedangStandalone) {
    btnInstall.hidden = true;
    return;
  }

  const perangkatIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  if (perangkatIos) btnInstall.hidden = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstall.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    btnInstall.hidden = true;
  });

  btnInstall.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const pilihan = await deferredInstallPrompt.userChoice;
      if (pilihan && pilihan.outcome === "accepted") btnInstall.hidden = true;
      deferredInstallPrompt = null;
    } else if (perangkatIos && iosModal) {
      iosModal.hidden = false;
      if (btnTutupIos instanceof HTMLElement) btnTutupIos.focus();
    }
  });

  if (btnTutupIos && iosModal) {
    btnTutupIos.addEventListener("click", () => { iosModal.hidden = true; btnInstall.focus(); });
    iosModal.addEventListener("click", (e) => {
      if (e.target === iosModal) { iosModal.hidden = true; btnInstall.focus(); }
    });
  }
}

function daftarkanServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (err) {
      console.warn("Pendaftaran Service Worker gagal:", err);
    }
  });
}

function mulaiAplikasi() {
  initTema();
  daftarkanServiceWorker();
  initPwaInstallPrompt();

  const ownerBadge = document.getElementById("authorized-owner-email");
  if (ownerBadge) ownerBadge.textContent = AUTHORIZED_EMAIL;

  if (!isFirebaseConfigured()) {
    tampilkanLayarUtama("config-error");
    return;
  }

  tampilkanLayarUtama("checking");

  initSidebar({
    initialSection: "dashboard",
    onLogoutRequest: () => bukaDialogKeluar()
  });

  initHalamanKegiatan();
  initHalamanJadwal();
  initHalamanDokumen();
  initHalamanDashboard();
  pasangEventListenerAntarmuka();
  perbaruiTanggalHeader();
  perbaruiIndikatorJaringan();

  try {
    initAuth((user, _token) => {
      hentikanSemuaLanggananData();

      if (!user) {
        hentikanPemantauTokenDrive();
        perbaruiInfoAkunSidebar(null);
        const pesanPenolakan = consumeLastAuthError();
        if (pesanPenolakan) setPesanGalatLogin(pesanPenolakan);
        tampilkanLayarUtama("login");
        return;
      }

      setPesanGalatLogin("");
      perbaruiInfoAkunSidebar(user);
      perbaruiTanggalHeader();
      tampilkanLayarUtama("app");
      mulaiPemantauTokenDrive();

      const unsubKegiatan = subscribeKegiatan();
      const unsubDokumen = subscribeDokumen();
      dataUnsubscribers.push(unsubKegiatan, unsubDokumen);
    });
  } catch (err) {
    setPesanGalatLogin(formatPesanGalatAuth(err));
    tampilkanLayarUtama("login");
  }
}

mulaiAplikasi();
