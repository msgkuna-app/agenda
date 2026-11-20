/**
 * Modul Garis Waktu Vertikal Harian (Timeline Harian)
 * Memuat:
 * 1A. hitungTataLetak(daftarKegiatan): Fungsi murni penghitung kolom & tumpang tindih
 * 1B. renderTimelineHarian(wadah, daftarKegiatan, opsi): Fungsi penggambar antarmuka garis waktu
 *
 * Menggunakan util-html.js terpusat untuk escapeHtml (tetap di-re-export).
 * Sesuai panduan: ES modules, murni tanpa framework, WCAG AA, SVG inline.
 */

import { escapeHtml } from "./util-html.js";
export { escapeHtml };

/**
 * Mengubah string "HH:MM" menjadi jumlah menit sejak 00:00.
 * Mengembalikan null jika format tidak valid atau kosong.
 * @param {string} str
 * @returns {number | null}
 */
export function konversiKeMenit(str) {
  if (typeof str !== "string") return null;
  const bersih = str.trim();
  const cocok = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(bersih);
  if (!cocok) return null;
  return Number(cocok[1]) * 60 + Number(cocok[2]);
}

/**
 * Mengubah jumlah menit sejak 00:00 menjadi format teks "HH:MM".
 * @param {number} menit
 * @returns {string}
 */
export function formatMenitKeJam(menit) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(menit)));
  const j = Math.floor(m / 60);
  const s = m % 60;
  return `${String(j).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 1A. Fungsi murni penghitung tata letak kolom dan deteksi bentrokan.
 *
 * @param {Array<{id: string, judul: string, waktuMulai?: string, waktuSelesai?: string, [key: string]: any}>} daftarKegiatan
 * @returns {Array<{
 *   id: string,
 *   item: any,
 *   kolom: number,
 *   jumlahKolom: number,
 *   mulaiMenit: number,
 *   selesaiMenit: number,
 *   bentrok: boolean,
 *   bentrokDengan: string[],
 *   tanpaJam: boolean,
 *   durasiPerkiraan: boolean
 * }>}
 */
export function hitungTataLetak(daftarKegiatan) {
  if (!Array.isArray(daftarKegiatan) || daftarKegiatan.length === 0) {
    return [];
  }

  const hasil = [];
  const berwaktu = [];

  for (const k of daftarKegiatan) {
    const id = String(k.id || "");
    const mulai = konversiKeMenit(k.waktuMulai);

    if (mulai === null) {
      hasil.push({
        id,
        item: k,
        kolom: 0,
        jumlahKolom: 1,
        mulaiMenit: 0,
        selesaiMenit: 0,
        bentrok: false,
        bentrokDengan: [],
        tanpaJam: true,
        durasiPerkiraan: false
      });
      continue;
    }

    let selesai = konversiKeMenit(k.waktuSelesai);
    let durasiPerkiraan = false;

    if (selesai === null) {
      selesai = mulai + 60;
      durasiPerkiraan = true;
    }

    // Durasi minimal 30 menit untuk tampilan
    if (selesai < mulai + 30) {
      selesai = mulai + 30;
    }

    // Jika melewati atau sama dengan 24:00 (1440 menit), potong pada 24:00
    if (selesai > 1440) {
      selesai = 1440;
    }
    if (mulai >= 1440) {
      // Kasus batas jam 24:00
      selesai = 1440;
    }

    berwaktu.push({
      id,
      item: k,
      kolom: 0,
      jumlahKolom: 1,
      mulaiMenit: mulai,
      selesaiMenit: selesai,
      bentrok: false,
      bentrokDengan: [],
      tanpaJam: false,
      durasiPerkiraan
    });
  }

  if (berwaktu.length === 0) {
    return hasil;
  }

  // 1. Deteksi bentrokan (A dan B tumpang tindih jika mulaiA < selesaiB && mulaiB < selesaiA)
  // Catatan: Waktu selesai sama dengan waktu mulai (misal 10:00 dan 10:00) BUKAN bentrokan.
  for (let i = 0; i < berwaktu.length; i++) {
    for (let j = i + 1; j < berwaktu.length; j++) {
      const a = berwaktu[i];
      const b = berwaktu[j];
      const tumpangTindih = a.mulaiMenit < b.selesaiMenit && b.mulaiMenit < a.selesaiMenit;
      if (tumpangTindih) {
        a.bentrok = true;
        a.bentrokDengan.push(b.id);
        b.bentrok = true;
        b.bentrokDengan.push(a.id);
      }
    }
  }

  // 2. Urutkan menurut waktu mulai (jika sama, yang durasinya lebih panjang lebih dulu)
  berwaktu.sort((a, b) => {
    if (a.mulaiMenit !== b.mulaiMenit) {
      return a.mulaiMenit - b.mulaiMenit;
    }
    const durA = a.selesaiMenit - a.mulaiMenit;
    const durB = b.selesaiMenit - b.mulaiMenit;
    if (durA !== durB) {
      return durB - durA; // durasi lebih panjang lebih dulu
    }
    return String(a.item.judul || "").localeCompare(String(b.item.judul || ""), "id");
  });

  // 3. Kelompokkan menjadi kluster peristiwa yang saling tersambung melalui rentang waktu
  const klusterList = [];
  let klusterSaatIni = [];
  let akhirMaksKluster = -1;

  for (const ev of berwaktu) {
    if (klusterSaatIni.length === 0) {
      klusterSaatIni.push(ev);
      akhirMaksKluster = ev.selesaiMenit;
    } else if (ev.mulaiMenit < akhirMaksKluster) {
      // Tersambung ke kluster ini
      klusterSaatIni.push(ev);
      if (ev.selesaiMenit > akhirMaksKluster) {
        akhirMaksKluster = ev.selesaiMenit;
      }
    } else {
      // Akhir kluster sebelumnya
      klusterList.push(klusterSaatIni);
      klusterSaatIni = [ev];
      akhirMaksKluster = ev.selesaiMenit;
    }
  }
  if (klusterSaatIni.length > 0) {
    klusterList.push(klusterSaatIni);
  }

  // 4. Di dalam setiap kluster, tetapkan kolom pertama yang kosong
  for (const kluster of klusterList) {
    // Array penampung waktu selesai terakhir per kolom
    const akhirPerKolom = [];

    for (const ev of kluster) {
      let kolomDitemukan = -1;
      for (let k = 0; k < akhirPerKolom.length; k++) {
        // Kolom k bebas jika akhirPerKolom[k] <= ev.mulaiMenit
        if (akhirPerKolom[k] <= ev.mulaiMenit) {
          kolomDitemukan = k;
          akhirPerKolom[k] = ev.selesaiMenit;
          break;
        }
      }
      if (kolomDitemukan === -1) {
        kolomDitemukan = akhirPerKolom.length;
        akhirPerKolom.push(ev.selesaiMenit);
      }
      ev.kolom = kolomDitemukan;
    }

    const totalKolomKluster = Math.max(1, akhirPerKolom.length);
    for (const ev of kluster) {
      ev.jumlahKolom = totalKolomKluster;
    }
  }

  return [...hasil, ...berwaktu];
}

/* ==========================================================================
   1B. Fungsi Penggambar: renderTimelineHarian
   ========================================================================== */

// Simpan status rentang 24 jam di sesi memori
let modeRentang24Jam = false;

// Ikon inline SVG
const IKON_LOKASI = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const IKON_JAM_RINGKAS = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

/**
 * Membersihkan listener dan timer pemantau waktu sekarang pada wadah timeline.
 * @param {HTMLElement} wadah
 */
export function bersihkanTimelineHarian(wadah) {
  if (!wadah) return;
  if (wadah._timelineCleanup && typeof wadah._timelineCleanup === "function") {
    try {
      wadah._timelineCleanup();
    } catch (_e) {}
    wadah._timelineCleanup = null;
  }
}

/**
 * Menggambar antarmuka garis waktu harian vertikal ke dalam elemen wadah.
 *
 * @param {HTMLElement} wadah - Elemen kontainer tujuan
 * @param {Array<any>} daftarKegiatan - Daftar kegiatan hari ini
 * @param {{
 *   tanggal?: string,
 *   ambilWarna?: (kategoriId: string) => string,
 *   ambilNamaKategori?: (kategoriId: string) => string,
 *   saatKlik?: (idKegiatan: string) => void
 * }} opsi
 */
export function renderTimelineHarian(wadah, daftarKegiatan, opsi = {}) {
  if (!wadah) return;

  // Bersihkan pemantau lama sebelum render ulang
  bersihkanTimelineHarian(wadah);

  const ambilWarna = typeof opsi.ambilWarna === "function" ? opsi.ambilWarna : () => "biru";
  const ambilNamaKategori = typeof opsi.ambilNamaKategori === "function" ? opsi.ambilNamaKategori : () => "Kategori";
  const saatKlik = typeof opsi.saatKlik === "function" ? opsi.saatKlik : () => {};

  // Hitung tata letak
  const tataLetak = hitungTataLetak(daftarKegiatan);
  const tanpaJamList = tataLetak.filter((e) => e.tanpaJam);
  const berwaktuList = tataLetak.filter((e) => !e.tanpaJam);

  // Tentukan batas jam awal dan akhir (Bawaan: 06:00 sampai 18:00)
  let jamAwal = 6;
  let jamAkhir = 18;

  if (modeRentang24Jam) {
    jamAwal = 0;
    jamAkhir = 24;
  } else if (berwaktuList.length > 0) {
    let menitTerkecil = Math.min(...berwaktuList.map((e) => e.mulaiMenit));
    let menitTerbesar = Math.max(...berwaktuList.map((e) => e.selesaiMenit));
    let jamMulai = Math.floor(menitTerkecil / 60);
    let jamSelesai = Math.ceil(menitTerbesar / 60);

    if (jamMulai < jamAwal) jamAwal = Math.max(0, jamMulai);
    if (jamSelesai > jamAkhir) jamAkhir = Math.min(24, jamSelesai);
  }

  const totalJam = jamAkhir - jamAwal;
  const menitAwalRentang = jamAwal * 60;
  const menitAkhirRentang = jamAkhir * 60;
  const totalMenitRentang = totalJam * 60;

  // Hitung menit sekarang (berdasarkan waktu lokal sistem)
  const sekarang = new Date();
  const menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes();

  // HTML Jalur "Sepanjang hari / tanpa jam"
  let htmlJalurTanpaJam = "";
  if (tanpaJamList.length > 0) {
    const chipsHtml = tanpaJamList
      .map((e) => {
        const item = e.item;
        const warna = ambilWarna(item.kategoriId);
        const namaKat = ambilNamaKategori(item.kategoriId);
        const selesai = item.status === "Selesai";
        return `
          <button
            type="button"
            class="tl-all-day-chip cat-color-${escapeHtml(warna)}${selesai ? " is-completed" : ""}"
            data-kegiatan-id="${escapeHtml(e.id)}"
            title="${escapeHtml(item.judul)} • ${escapeHtml(namaKat)} (Sepanjang hari)"
          >
            <span class="cat-dot cat-dot-${escapeHtml(warna)}" aria-hidden="true"></span>
            <span class="tl-chip-title">${escapeHtml(item.judul)}</span>
          </button>`;
      })
      .join("");

    htmlJalurTanpaJam = `
      <div class="tl-all-day-strip" aria-label="Kegiatan sepanjang hari atau tanpa jam">
        <span class="tl-all-day-label">Sepanjang hari</span>
        <div class="tl-all-day-chips">${chipsHtml}</div>
      </div>`;
  }

  // Baris-baris Jam
  let htmlGarisJam = "";
  for (let j = jamAwal; j <= jamAkhir; j++) {
    const jamStr = `${String(j % 24).padStart(2, "0")}:00`;
    htmlGarisJam += `
      <div class="tl-hour-slot" data-hour="${j}">
        <span class="tl-hour-label">${jamStr}</span>
        <div class="tl-hour-line" aria-hidden="true"></div>
      </div>`;
  }

  // Hitung jumlah kolom maksimum yang bertumpuk untuk scroll horizontal jika terlalu sempit
  const maksKolom = berwaktuList.reduce((acc, ev) => Math.max(acc, ev.jumlahKolom), 1);
  const minLebarGrid = Math.max(260, maksKolom * 76);

  // Blok-blok Kegiatan Berwaktu (tanpa penanda bentrok)
  let htmlBlokKegiatan = "";
  for (const ev of berwaktuList) {
    const item = ev.item;
    const warna = ambilWarna(item.kategoriId);
    const namaKat = ambilNamaKategori(item.kategoriId);
    const selesai = item.status === "Selesai";
    const sedangBerjalan =
      !selesai && menitSekarang >= ev.mulaiMenit && menitSekarang < ev.selesaiMenit;

    // Perhitungan posisi vertikal berbasis persentase
    const topPct = ((ev.mulaiMenit - menitAwalRentang) / totalMenitRentang) * 100;
    const heightPct = ((ev.selesaiMenit - ev.mulaiMenit) / totalMenitRentang) * 100;

    // Perhitungan kolom horizontal
    const lebarPct = 100 / ev.jumlahKolom;
    const leftPct = ev.kolom * lebarPct;

    // Format rentang waktu
    const jamMulaiStr = formatMenitKeJam(ev.mulaiMenit);
    const perkiraanTanda = ev.durasiPerkiraan ? "~" : "";
    const jamSelesaiStr = `${perkiraanTanda}${formatMenitKeJam(ev.selesaiMenit)}`;
    const rentangWaktuStr = `${jamMulaiStr}–${jamSelesaiStr}`;

    // Durasi menit untuk menandai blok pendek (<45 menit)
    const durasiMenit = ev.selesaiMenit - ev.mulaiMenit;
    const isBlokPendek = durasiMenit < 45;

    const ariaLabel = `${item.judul}, ${jamMulaiStr} sampai ${jamSelesaiStr}${item.lokasi ? `, lokasi ${item.lokasi}` : ""}`;
    const titleAttr = `${item.judul}\n${rentangWaktuStr} • ${namaKat}${item.lokasi ? `\nLokasi: ${item.lokasi}` : ""}${item.status ? `\nStatus: ${item.status}` : ""}`;

    htmlBlokKegiatan += `
      <button
        type="button"
        id="tl-event-block-${escapeHtml(ev.id)}"
        class="tl-event-block cat-border-${escapeHtml(warna)}${selesai ? " is-completed" : ""}${sedangBerjalan ? " is-current" : ""}${isBlokPendek ? " is-short" : ""}"
        data-kegiatan-id="${escapeHtml(ev.id)}"
        style="top: ${topPct}%; height: ${heightPct}%; left: ${leftPct}%; width: calc(${lebarPct}% - 4px);"
        aria-label="${escapeHtml(ariaLabel)}"
        title="${escapeHtml(titleAttr)}"
      >
        <div class="tl-event-content">
          <div class="tl-event-header-row">
            <span class="tl-event-title">${escapeHtml(item.judul)}</span>
          </div>
          <span class="tl-event-time">${escapeHtml(rentangWaktuStr)}</span>
          ${!isBlokPendek && item.lokasi ? `<span class="tl-event-location">${IKON_LOKASI}<span>${escapeHtml(item.lokasi)}</span></span>` : ""}
        </div>
      </button>`;
  }

  // Indikator Garis Waktu Sekarang
  let htmlGarisSekarang = "";
  const apakahSekarangDalamRentang =
    menitSekarang >= menitAwalRentang && menitSekarang <= menitAkhirRentang;

  if (apakahSekarangDalamRentang) {
    const nowTopPct = ((menitSekarang - menitAwalRentang) / totalMenitRentang) * 100;
    const jamSekarangStr = formatMenitKeJam(menitSekarang);
    htmlGarisSekarang = `
      <div id="tl-now-indicator" class="tl-now-indicator" style="top: ${nowTopPct}%;" aria-label="Waktu sekarang: ${jamSekarangStr}">
        <span class="tl-now-dot" aria-hidden="true"></span>
        <span class="tl-now-line" aria-hidden="true"></span>
        <span class="tl-now-badge">${jamSekarangStr}</span>
      </div>`;
  }

  // Gabungkan seluruh struktur komponen
  wadah.innerHTML = `
    <div class="tl-container">
      <div class="tl-top-toolbar">
        <button
          type="button"
          id="tl-toggle-range-btn"
          class="tl-range-btn"
          aria-pressed="${modeRentang24Jam ? "true" : "false"}"
          title="${modeRentang24Jam ? "Tampilkan rentang ringkas (06:00–18:00)" : "Tampilkan 24 jam penuh (00:00–24:00)"}"
        >
          ${IKON_JAM_RINGKAS}
          <span>${modeRentang24Jam ? "Rentang ringkas" : "Tampilkan 24 jam"}</span>
        </button>
      </div>

      ${htmlJalurTanpaJam}

      <div class="tl-scroll-viewport" tabindex="0" role="region" aria-label="Jadwal garis waktu harian">
        <div class="tl-grid-surface" style="min-width: ${minLebarGrid}px;">
          <div class="tl-hours-column" aria-hidden="true">
            ${htmlGarisJam}
          </div>
          <div class="tl-events-canvas">
            ${htmlGarisSekarang}
            ${htmlBlokKegiatan}
          </div>
        </div>
      </div>
    </div>
  `;

  // Gulung otomatis ke waktu sekarang atau kegiatan pertama
  const viewport = wadah.querySelector(".tl-scroll-viewport");
  if (viewport instanceof HTMLElement) {
    requestAnimationFrame(() => {
      let targetMenit = menitSekarang;
      if (!apakahSekarangDalamRentang) {
        if (berwaktuList.length > 0) {
          targetMenit = berwaktuList[0].mulaiMenit;
        } else {
          targetMenit = menitAwalRentang;
        }
      }
      // Kurangi 45 menit agar ada konteks visual sebelum waktu tersebut
      const menitFokus = Math.max(menitAwalRentang, targetMenit - 45);
      const rasioScroll = (menitFokus - menitAwalRentang) / totalMenitRentang;
      const totalScrollHeight = viewport.scrollHeight - viewport.clientHeight;
      if (totalScrollHeight > 0) {
        viewport.scrollTop = Math.max(0, rasioScroll * viewport.scrollHeight);
      }
    });
  }

  // Event handler tombol rentang 24 jam
  const btnToggleRange = wadah.querySelector("#tl-toggle-range-btn");
  if (btnToggleRange) {
    btnToggleRange.addEventListener("click", () => {
      modeRentang24Jam = !modeRentang24Jam;
      renderTimelineHarian(wadah, daftarKegiatan, opsi);
    });
  }

  // Event handler klik blok dan chip kegiatan (dilepas lagi lewat _timelineCleanup agar tidak menumpuk)
  const saatKlikKegiatan = (e) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    if (!targetEl) return;
    const btnKegiatan = targetEl.closest("button[data-kegiatan-id]");
    if (!btnKegiatan) return;

    const idKegiatan = btnKegiatan.getAttribute("data-kegiatan-id");
    if (idKegiatan) {
      saatKlik(idKegiatan);
    }
  };
  wadah.addEventListener("click", saatKlikKegiatan);

  // Pembaruan garis "sekarang" setiap 60 detik + penghentian saat visibilitychange hidden
  let intervalId = null;

  function perbaruiGarisSekarang() {
    if (document.visibilityState !== "visible") return;
    const now = new Date();
    const currMin = now.getHours() * 60 + now.getMinutes();
    const indicatorEl = wadah.querySelector("#tl-now-indicator");

    if (currMin >= menitAwalRentang && currMin <= menitAkhirRentang) {
      const nowTopPct = ((currMin - menitAwalRentang) / totalMenitRentang) * 100;
      const jamSekarangStr = formatMenitKeJam(currMin);

      if (indicatorEl instanceof HTMLElement) {
        indicatorEl.style.top = `${nowTopPct}%`;
        indicatorEl.setAttribute("aria-label", `Waktu sekarang: ${jamSekarangStr}`);
        const badgeEl = indicatorEl.querySelector(".tl-now-badge");
        if (badgeEl) badgeEl.textContent = jamSekarangStr;
      } else {
        // Jika sebelumnya belum dirender (misal baru masuk rentang), buat elemen
        const canvas = wadah.querySelector(".tl-events-canvas");
        if (canvas) {
          const div = document.createElement("div");
          div.id = "tl-now-indicator";
          div.className = "tl-now-indicator";
          div.style.top = `${nowTopPct}%`;
          div.setAttribute("aria-label", `Waktu sekarang: ${jamSekarangStr}`);
          div.innerHTML = `
            <span class="tl-now-dot" aria-hidden="true"></span>
            <span class="tl-now-line" aria-hidden="true"></span>
            <span class="tl-now-badge">${jamSekarangStr}</span>`;
          canvas.prepend(div);
        }
      }
    } else if (indicatorEl) {
      indicatorEl.remove();
    }
  }

  function mulaiTimer() {
    hentikanTimer();
    intervalId = window.setInterval(perbaruiGarisSekarang, 60 * 1000);
  }

  function hentikanTimer() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      perbaruiGarisSekarang();
      mulaiTimer();
    } else {
      hentikanTimer();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  mulaiTimer();

  // Simpan pembersih untuk dipanggil saat re-render atau komponen dibuang
  wadah._timelineCleanup = () => {
    wadah.removeEventListener("click", saatKlikKegiatan);
    hentikanTimer();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}