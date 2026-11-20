/**
 * Modul Notifikasi Toast Global (Tahap 4b: dipisah dari sidebar.js)
 * - Menyediakan tampilkanToast dengan position: fixed dan env(safe-area-inset-bottom).
 * - Mandiri: hanya bergantung pada util-html.js (escapeHtml), tanpa state sidebar.
 * - Tidak boleh mengimpor sidebar.js agar tidak terjadi ketergantungan melingkar.
 */

import { escapeHtml } from "../util-html.js";

/**
 * Menampilkan notifikasi toast konsisten yang mengambang (position: fixed) dan
 * memperhitungkan env(safe-area-inset-bottom). Mendukung tombol aksi opsional {aksiLabel, aksiOnClick, durasiMs}.
 * @param {string} pesan
 * @param {"info" | "success" | "warning" | "danger"} [tipe="info"]
 * @param {number | { aksiLabel?: string, aksiOnClick?: () => void, durasiMs?: number }} [opsiAtauDurasi=3800]
 */
export function tampilkanToast(pesan, tipe = "info", opsiAtauDurasi = 3800) {
  const bersih = String(pesan || "").trim();
  if (!bersih) return;

  let durasiMs = 3800;
  let aksiLabel = "";
  let aksiOnClick = null;

  if (typeof opsiAtauDurasi === "number") {
    durasiMs = opsiAtauDurasi;
  } else if (opsiAtauDurasi && typeof opsiAtauDurasi === "object") {
    if (typeof opsiAtauDurasi.durasiMs === "number") durasiMs = opsiAtauDurasi.durasiMs;
    if (opsiAtauDurasi.aksiLabel) aksiLabel = String(opsiAtauDurasi.aksiLabel).trim();
    if (typeof opsiAtauDurasi.aksiOnClick === "function") aksiOnClick = opsiAtauDurasi.aksiOnClick;
  }

  let wadah = document.getElementById("toast-region");
  if (!wadah) {
    wadah = document.createElement("div");
    wadah.id = "toast-region";
    wadah.className = "toast-region";
    wadah.setAttribute("aria-live", "polite");
    wadah.setAttribute("aria-atomic", "false");
    document.body.appendChild(wadah);
  }

  while (wadah.children.length >= 3) {
    wadah.firstElementChild?.remove();
  }

  const toast = document.createElement("div");
  const jenisKelas =
    tipe === "success"
      ? "toast-success"
      : tipe === "warning"
        ? "toast-warning"
        : tipe === "danger"
          ? "toast-danger"
          : "toast-info";
  toast.className = `toast-item ${jenisKelas}`;
  toast.setAttribute("role", aksiLabel ? "status" : (tipe === "danger" ? "alert" : "status"));

  const ikonPath =
    tipe === "success"
      ? '<polyline points="20 6 9 17 4 12"/>'
      : tipe === "warning" || tipe === "danger"
        ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';

  const tombolAksiHtml = aksiLabel
    ? `<button type="button" class="toast-action-btn" data-toast-action>${escapeHtml(aksiLabel)}</button>`
    : "";

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ikonPath}</svg>
    </span>
    <span class="toast-text">${escapeHtml(bersih)}</span>
    ${tombolAksiHtml}
    <button type="button" class="icon-btn toast-close-btn" aria-label="Tutup pemberitahuan" title="Tutup">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  let dihapus = false;
  let timerId = null;
  let sisaWaktuMs = durasiMs;
  let waktuMulai = Date.now();

  const hapusToast = () => {
    if (dihapus) return;
    dihapus = true;
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 180);
  };

  const jadwalkanTimer = (ms) => {
    if (ms <= 0) return;
    waktuMulai = Date.now();
    sisaWaktuMs = ms;
    timerId = window.setTimeout(hapusToast, ms);
  };

  const jedaTimer = () => {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
      sisaWaktuMs = Math.max(0, sisaWaktuMs - (Date.now() - waktuMulai));
    }
  };

  const lanjutkanTimer = () => {
    if (sisaWaktuMs > 0) {
      jadwalkanTimer(sisaWaktuMs);
    }
  };

  toast.addEventListener("mouseenter", jedaTimer);
  toast.addEventListener("mouseleave", () => {
    if (!toast.contains(document.activeElement)) {
      lanjutkanTimer();
    }
  });

  toast.addEventListener("focusin", jedaTimer);
  toast.addEventListener("focusout", (e) => {
    if (!toast.contains(e.relatedTarget)) {
      lanjutkanTimer();
    }
  });

  if (aksiOnClick) {
    const btnAksi = toast.querySelector("[data-toast-action]");
    if (btnAksi) {
      btnAksi.addEventListener("click", () => {
        hapusToast();
        aksiOnClick();
      });
    }
  }

  toast.querySelector(".toast-close-btn")?.addEventListener("click", hapusToast);
  wadah.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  if (durasiMs > 0) {
    jadwalkanTimer(durasiMs);
  }
}
