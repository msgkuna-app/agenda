/**
 * Modul Pencarian Global (Agenda & Arsip)
 * Mencari di kegiatan, catatan, dan dokumen sekaligus menggunakan data yang sudah dimuat.
 * Bekerja luring (offline) tanpa langganan Firestore baru.
 * Bebas dependensi melingkar (fungsi penyedia data disuntikkan via initPencarianGlobal).
 * Menggunakan util-html.js terpusat untuk escapeHtml dan svgIkon.
 */
import { pindahKeBagian } from "./sidebar.js";
import { ambilSemuaKegiatanSekaliPakai } from "./kegiatan.js";
import { ambilSemuaCatatanSekaliPakai } from "./catatan.js";
import { ambilSemuaDokumenSekaliPakai } from "./dokumen.js";
import { escapeHtml, svgIkon } from "./util-html.js";

export { escapeHtml };

const DEBOUNCE_DELAY_MS = 120;
const BATAS_HASIL_PER_KELOMPOK = 5;
const MAKS_PANJANG_CUPLIKAN = 90;

const IKON_KEGIATAN = svgIkon(
  '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  18,
);
const IKON_CATATAN = svgIkon(
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  18,
);
const IKON_DOKUMEN = svgIkon(
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  18,
);

/**
 * Normalisasi teks: huruf kecil, pangkas spasi, hilangkan tanda diakritik.
 * @param {unknown} str
 * @returns {string}
 */
export function normalisasiTeks(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Membersihkan tag HTML dari string isi catatan.
 * @param {string} htmlStr
 * @returns {string}
 */
function bersihkanHtml(htmlStr) {
  if (!htmlStr) return "";
  return String(htmlStr)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Menyorot kata kueri pada teks yang SUDAH di-escape menggunakan elemen <mark>.
 * @param {string} teksEscaped
 * @param {string[]} kataKueri
 * @returns {string}
 */
export function sorotKata(teksEscaped, kataKueri) {
  if (!teksEscaped || !kataKueri || kataKueri.length === 0) return teksEscaped;
  const kataUnik = [...new Set(kataKueri.map((k) => k.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (kataUnik.length === 0) return teksEscaped;

  const pola = kataUnik
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pola})`, "gi");
  return teksEscaped.replace(regex, "<mark>$1</mark>");
}

/**
 * Mengekstrak cuplikan sekitar 90 karakter di sekitar kemunculan kata pertama.
 * @param {string} teksAsli
 * @param {string[]} kataKueri
 * @param {number} maksKarakter
 * @returns {string}
 */
function buatCuplikan(teksAsli, kataKueri, maksKarakter = MAKS_PANJANG_CUPLIKAN) {
  const bersih = String(teksAsli || "").replace(/\s+/g, " ").trim();
  if (!bersih) return "";
  if (bersih.length <= maksKarakter) return bersih;

  const teksNorm = normalisasiTeks(bersih);
  let posPertama = -1;
  let panjangKata = 0;

  for (const kata of kataKueri) {
    const idx = teksNorm.indexOf(kata);
    if (idx !== -1 && (posPertama === -1 || idx < posPertama)) {
      posPertama = idx;
      panjangKata = kata.length;
    }
  }

  if (posPertama === -1) {
    return `${bersih.slice(0, maksKarakter - 1).trimEnd()}…`;
  }

  const sisa = maksKarakter - panjangKata;
  const sebelum = Math.floor(sisa * 0.4);
  const sesudah = sisa - sebelum;

  let mulai = Math.max(0, posPertama - sebelum);
  let akhir = Math.min(bersih.length, posPertama + panjangKata + sesudah);

  // Sesuaikan ke batas kata jika memungkinkan
  if (mulai > 0) {
    const spasiSebelum = bersih.indexOf(" ", mulai);
    if (spasiSebelum !== -1 && spasiSebelum < posPertama) {
      mulai = spasiSebelum + 1;
    }
  }
  if (akhir < bersih.length) {
    const spasiSesudah = bersih.lastIndexOf(" ", akhir);
    if (spasiSesudah !== -1 && spasiSesudah > posPertama + panjangKata) {
      akhir = spasiSesudah;
    }
  }

  let hasil = bersih.slice(mulai, akhir).trim();
  if (mulai > 0) hasil = `…${hasil}`;
  if (akhir < bersih.length) hasil = `${hasil}…`;

  return hasil;
}

/**
 * Fungsi murni pencarian global pada kegiatan, catatan, dan dokumen.
 * @param {string} kueri
 * @param {{ kegiatan?: any[], catatan?: any[], dokumen?: any[] }} sumber
 * @returns {{
 *   kegiatan: { total: number, items: any[] },
 *   catatan: { total: number, items: any[] },
 *   dokumen: { total: number, items: any[] }
 * }}
 */
export function cariGlobal(kueri, sumber = {}) {
  const kueriNorm = normalisasiTeks(kueri);
  const kataKueri = kueriNorm.split(/\s+/).filter(Boolean);

  const hasilKosong = {
    kegiatan: { total: 0, items: [] },
    catatan: { total: 0, items: [] },
    dokumen: { total: 0, items: [] },
  };

  if (kataKueri.length === 0) {
    return hasilKosong;
  }

  const daftarKeg = Array.isArray(sumber.kegiatan) ? sumber.kegiatan : [];
  const daftarCat = Array.isArray(sumber.catatan) ? sumber.catatan : [];
  const daftarDok = Array.isArray(sumber.dokumen) ? sumber.dokumen : [];

  // 1. Saring & Urutkan Kegiatan
  const hasilKeg = [];
  for (const item of daftarKeg) {
    const judul = item.judul || "";
    const catatan = item.catatan || "";
    const lokasi = item.lokasi || "";

    const judulNorm = normalisasiTeks(judul);
    const catatanNorm = normalisasiTeks(catatan);
    const lokasiNorm = normalisasiTeks(lokasi);
    const gabunganNorm = `${judulNorm} ${catatanNorm} ${lokasiNorm}`;

    const cocokSemua = kataKueri.every((k) => gabunganNorm.includes(k));
    if (!cocokSemua) continue;

    const jumlahDiJudul = kataKueri.filter((k) => judulNorm.includes(k)).length;
    const skorJudul = jumlahDiJudul === kataKueri.length ? 2 : jumlahDiJudul > 0 ? 1 : 0;
    const waktuUrut = String(item.updatedAt || item.tanggal || item.createdAt || "");

    const teksCuplikanSumber = catatan || lokasi || judul;
    const cuplikan = buatCuplikan(teksCuplikanSumber, kataKueri);

    hasilKeg.push({
      item,
      kelompok: "kegiatan",
      skorJudul,
      waktuUrut,
      cuplikan,
    });
  }

  hasilKeg.sort((a, b) => {
    if (b.skorJudul !== a.skorJudul) return b.skorJudul - a.skorJudul;
    return b.waktuUrut.localeCompare(a.waktuUrut);
  });

  // 2. Saring & Urutkan Catatan
  const hasilCat = [];
  for (const item of daftarCat) {
    const judul = item.judul || "";
    const isiPolos = bersihkanHtml(item.isi || "");
    const tagTeks = Array.isArray(item.tag) ? item.tag.join(" ") : "";

    const judulNorm = normalisasiTeks(judul);
    const isiNorm = normalisasiTeks(isiPolos);
    const tagNorm = normalisasiTeks(tagTeks);
    const gabunganNorm = `${judulNorm} ${isiNorm} ${tagNorm}`;

    const cocokSemua = kataKueri.every((k) => gabunganNorm.includes(k));
    if (!cocokSemua) continue;

    const jumlahDiJudul = kataKueri.filter((k) => judulNorm.includes(k)).length;
    const skorJudul = jumlahDiJudul === kataKueri.length ? 2 : jumlahDiJudul > 0 ? 1 : 0;
    const waktuUrut = String(item.updatedAt || item.tanggal || item.createdAt || "");

    const teksCuplikanSumber = isiPolos || (Array.isArray(item.tag) ? item.tag.join(", ") : "") || judul;
    const cuplikan = buatCuplikan(teksCuplikanSumber, kataKueri);

    hasilCat.push({
      item,
      kelompok: "catatan",
      skorJudul,
      waktuUrut,
      cuplikan,
    });
  }

  hasilCat.sort((a, b) => {
    if (b.skorJudul !== a.skorJudul) return b.skorJudul - a.skorJudul;
    return b.waktuUrut.localeCompare(a.waktuUrut);
  });

  // 3. Saring & Urutkan Dokumen
  const hasilDok = [];
  for (const item of daftarDok) {
    const namaTampilan = item.namaTampilan || "";
    const namaFile = item.namaFile || "";
    const catatan = item.catatan || "";

    const namaTampilanNorm = normalisasiTeks(namaTampilan);
    const namaFileNorm = normalisasiTeks(namaFile);
    const catatanNorm = normalisasiTeks(catatan);
    const gabunganNorm = `${namaTampilanNorm} ${namaFileNorm} ${catatanNorm}`;

    const cocokSemua = kataKueri.every((k) => gabunganNorm.includes(k));
    if (!cocokSemua) continue;

    const cocokNamaTampilan = kataKueri.filter((k) => namaTampilanNorm.includes(k)).length;
    const cocokNamaFile = kataKueri.filter((k) => namaFileNorm.includes(k)).length;
    const maksCocokNama = Math.max(cocokNamaTampilan, cocokNamaFile);
    const skorJudul = maksCocokNama === kataKueri.length ? 2 : maksCocokNama > 0 ? 1 : 0;
    const waktuUrut = String(item.updatedAt || item.tanggalUnggah || item.createdAt || "");

    const teksCuplikanSumber = catatan || namaFile || namaTampilan;
    const cuplikan = buatCuplikan(teksCuplikanSumber, kataKueri);

    hasilDok.push({
      item,
      kelompok: "dokumen",
      skorJudul,
      waktuUrut,
      cuplikan,
    });
  }

  hasilDok.sort((a, b) => {
    if (b.skorJudul !== a.skorJudul) return b.skorJudul - a.skorJudul;
    return b.waktuUrut.localeCompare(a.waktuUrut);
  });

  return {
    kegiatan: {
      total: hasilKeg.length,
      items: hasilKeg.slice(0, BATAS_HASIL_PER_KELOMPOK),
    },
    catatan: {
      total: hasilCat.length,
      items: hasilCat.slice(0, BATAS_HASIL_PER_KELOMPOK),
    },
    dokumen: {
      total: hasilDok.length,
      items: hasilDok.slice(0, BATAS_HASIL_PER_KELOMPOK),
    },
  };
}

/* ==========================================================================
   Manajemen Antarmuka Pencarian Global (Dialog, Keyboard, Sorotan, Pilihan)
   ========================================================================== */

let penyediaData = {
  getDaftarKegiatan: () => [],
  getDaftarCatatan: () => [],
  getDaftarDokumen: () => [],
};
let dataLengkapSemua = null;
let sedangMemuatDataLengkap = false;

export async function muatSemuaDataUntukPencarian() {
  if (sedangMemuatDataLengkap) return dataLengkapSemua;
  sedangMemuatDataLengkap = true;
  try {
    const [keg, cat, dok] = await Promise.all([
      ambilSemuaKegiatanSekaliPakai(),
      ambilSemuaCatatanSekaliPakai(),
      ambilSemuaDokumenSekaliPakai()
    ]);
    dataLengkapSemua = { kegiatan: keg, catatan: cat, dokumen: dok };
    return dataLengkapSemua;
  } catch (err) {
    console.warn("Gagal memuat seluruh data server untuk pencarian:", err);
    return null;
  } finally {
    sedangMemuatDataLengkap = false;
  }
}
let penanganPilihHasil = null;
let dialogTerbuka = false;
let pemicuFokusTerakhir = null;
let timerDebouncePencarian = null;
let kueriAktif = "";
let daftarElemenPilihan = [];
let indeksPilihanAktif = -1;
let listenerKeyboardGlobalTerdaftar = false;

function formatTanggalSingkat(isoStr) {
  if (!isoStr) return "";
  const bagian = String(isoStr).slice(0, 10).split("-");
  if (bagian.length !== 3) return isoStr;
  return `${bagian[2]}/${bagian[1]}/${bagian[0]}`;
}

export function bukaPencarianGlobal(pemicu = null) {
  const modal = document.getElementById("global-search-modal");
  const input = document.getElementById("global-search-input");
  if (!modal || !input) return;

  pemicuFokusTerakhir =
    pemicu instanceof HTMLElement
      ? pemicu
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

  dialogTerbuka = true;
  modal.hidden = false;
  input.value = "";
  kueriAktif = "";
  indeksPilihanAktif = -1;

  renderStatusAwal();

  requestAnimationFrame(() => {
    input.focus();
  });
}

export function tutupPencarianGlobal(kembalikanFokus = true) {
  const modal = document.getElementById("global-search-modal");
  const input = document.getElementById("global-search-input");
  if (!modal || !dialogTerbuka) return;

  dialogTerbuka = false;
  modal.hidden = true;
  if (timerDebouncePencarian) {
    clearTimeout(timerDebouncePencarian);
    timerDebouncePencarian = null;
  }
  if (input) {
    input.value = "";
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");
  }

  if (kembalikanFokus && pemicuFokusTerakhir && document.contains(pemicuFokusTerakhir)) {
    pemicuFokusTerakhir.focus();
  }
  pemicuFokusTerakhir = null;
}

function renderStatusAwal() {
  const wadah = document.getElementById("global-search-results");
  const infoTotal = document.getElementById("global-search-count-total");
  const input = document.getElementById("global-search-input");
  if (infoTotal) infoTotal.textContent = "";
  if (input) {
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");
  }
  daftarElemenPilihan = [];
  indeksPilihanAktif = -1;

  if (!wadah) return;
  wadah.innerHTML = `
    <div class="global-search-empty-state">
      <span class="global-search-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </span>
      <p class="global-search-empty-title">Ketik untuk mencari</p>
      <p class="global-search-empty-desc">Cari kegiatan, catatan singkat, Google Docs, atau berkas arsip secara bersamaan.</p>
    </div>
  `;
}

function renderStatusTidakAdaHasil(kueri) {
  const wadah = document.getElementById("global-search-results");
  const infoTotal = document.getElementById("global-search-count-total");
  const input = document.getElementById("global-search-input");
  if (infoTotal) infoTotal.textContent = "0 hasil";
  if (input) {
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", "");
  }
  daftarElemenPilihan = [];
  indeksPilihanAktif = -1;

  if (!wadah) return;

  const tombolServer = sedangMemuatDataLengkap
    ? `<div style="margin-top:14px; font-size:13px; color:var(--color-primary); display:flex; align-items:center; justify-content:center; gap:6px;">
        <span>Mencari di semua data...</span>
       </div>`
    : !dataLengkapSemua
      ? `<div style="margin-top:14px; text-align:center;">
          <button type="button" class="btn-secondary" id="btn-search-all-server" style="font-size:13px; padding:6px 14px;">
            Cari di semua data (termasuk server)
          </button>
         </div>`
      : "";

  wadah.innerHTML = `
    <div class="global-search-empty-state">
      <span class="global-search-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </span>
      <p class="global-search-empty-title">Tidak ada hasil ditemukan</p>
      <p class="global-search-empty-desc">Tidak ditemukan kecocokan untuk <strong>&ldquo;${escapeHtml(kueri)}&rdquo;</strong>.</p>
      ${tombolServer}
    </div>
  `;
}

function renderHasil(hasil, kataKueri) {
  const wadah = document.getElementById("global-search-results");
  const infoTotal = document.getElementById("global-search-count-total");
  const input = document.getElementById("global-search-input");
  if (!wadah) return;

  const totalSemua =
    hasil.kegiatan.total + hasil.catatan.total + hasil.dokumen.total;

  if (infoTotal) {
    infoTotal.textContent = `${totalSemua} hasil`;
  }
  if (input) {
    input.setAttribute("aria-expanded", totalSemua > 0 ? "true" : "false");
  }

  if (totalSemua === 0) {
    renderStatusTidakAdaHasil(kueriAktif);
    return;
  }

  const potonganHtml = [];
  let nomorOpsi = 0;

  // 1. Kelompok Kegiatan
  if (hasil.kegiatan.total > 0) {
    const itemHtml = hasil.kegiatan.items
      .map((entry) => {
        const item = entry.item;
        const optId = `global-search-opt-${nomorOpsi++}`;
        const judulSorot = sorotKata(escapeHtml(item.judul), kataKueri);
        const cuplikanSorot = sorotKata(escapeHtml(entry.cuplikan), kataKueri);
        const tglStr = formatTanggalSingkat(item.tanggal);
        const sub = [tglStr, item.status, item.lokasi].filter(Boolean).join(" • ");

        return `
          <div
            id="${optId}"
            class="global-search-item"
            role="option"
            aria-selected="false"
            data-search-index="${nomorOpsi - 1}"
            data-search-kelompok="kegiatan"
            data-search-id="${escapeHtml(item.id)}"
            tabindex="-1"
          >
            <span class="global-search-item-icon" aria-hidden="true">${IKON_KEGIATAN}</span>
            <div class="global-search-item-content">
              <div class="global-search-item-title-row">
                <span class="global-search-item-title">${judulSorot}</span>
              </div>
              <div class="global-search-item-meta">
                <span>${escapeHtml(sub)}</span>
              </div>
              ${cuplikanSorot ? `<p class="global-search-item-snippet">${cuplikanSorot}</p>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    const tombolLihatSemua =
      hasil.kegiatan.total > BATAS_HASIL_PER_KELOMPOK
        ? `<button type="button" class="global-search-see-all-btn" data-search-see-all="kegiatan">Lihat semua ${hasil.kegiatan.total} kegiatan &rarr;</button>`
        : "";

    potonganHtml.push(`
      <div class="global-search-group" role="group" aria-label="Kegiatan">
        <div class="global-search-group-header">
          <span>Kegiatan</span>
          <span class="global-search-group-count">${hasil.kegiatan.total}</span>
        </div>
        ${itemHtml}
        ${tombolLihatSemua}
      </div>
    `);
  }

  // 2. Kelompok Catatan
  if (hasil.catatan.total > 0) {
    const itemHtml = hasil.catatan.items
      .map((entry) => {
        const item = entry.item;
        const optId = `global-search-opt-${nomorOpsi++}`;
        const judulSorot = sorotKata(escapeHtml(item.judul), kataKueri);
        const cuplikanSorot = sorotKata(escapeHtml(entry.cuplikan), kataKueri);
        const jenisLabel = item.jenis === "gdoc" ? "Google Docs" : "Catatan Singkat";
        const tglStr = formatTanggalSingkat(item.tanggal);
        const sub = [tglStr, jenisLabel, item.kategori].filter(Boolean).join(" • ");

        return `
          <div
            id="${optId}"
            class="global-search-item"
            role="option"
            aria-selected="false"
            data-search-index="${nomorOpsi - 1}"
            data-search-kelompok="catatan"
            data-search-id="${escapeHtml(item.id)}"
            tabindex="-1"
          >
            <span class="global-search-item-icon" aria-hidden="true">${IKON_CATATAN}</span>
            <div class="global-search-item-content">
              <div class="global-search-item-title-row">
                <span class="global-search-item-title">${judulSorot}</span>
              </div>
              <div class="global-search-item-meta">
                <span>${escapeHtml(sub)}</span>
              </div>
              ${cuplikanSorot ? `<p class="global-search-item-snippet">${cuplikanSorot}</p>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    const tombolLihatSemua =
      hasil.catatan.total > BATAS_HASIL_PER_KELOMPOK
        ? `<button type="button" class="global-search-see-all-btn" data-search-see-all="catatan">Lihat semua ${hasil.catatan.total} catatan &rarr;</button>`
        : "";

    potonganHtml.push(`
      <div class="global-search-group" role="group" aria-label="Catatan">
        <div class="global-search-group-header">
          <span>Catatan</span>
          <span class="global-search-group-count">${hasil.catatan.total}</span>
        </div>
        ${itemHtml}
        ${tombolLihatSemua}
      </div>
    `);
  }

  // 3. Kelompok Dokumen
  if (hasil.dokumen.total > 0) {
    const itemHtml = hasil.dokumen.items
      .map((entry) => {
        const item = entry.item;
        const optId = `global-search-opt-${nomorOpsi++}`;
        const namaUtama = item.namaTampilan || item.namaFile || "Dokumen";
        const judulSorot = sorotKata(escapeHtml(namaUtama), kataKueri);
        const cuplikanSorot = sorotKata(escapeHtml(entry.cuplikan), kataKueri);
        const tglStr = formatTanggalSingkat(item.tanggalUnggah || item.createdAt);
        const sub = [tglStr, item.namaFile !== namaUtama ? item.namaFile : ""].filter(Boolean).join(" • ");

        return `
          <div
            id="${optId}"
            class="global-search-item"
            role="option"
            aria-selected="false"
            data-search-index="${nomorOpsi - 1}"
            data-search-kelompok="dokumen"
            data-search-id="${escapeHtml(item.id)}"
            tabindex="-1"
          >
            <span class="global-search-item-icon" aria-hidden="true">${IKON_DOKUMEN}</span>
            <div class="global-search-item-content">
              <div class="global-search-item-title-row">
                <span class="global-search-item-title">${judulSorot}</span>
              </div>
              <div class="global-search-item-meta">
                <span>${escapeHtml(sub)}</span>
              </div>
              ${cuplikanSorot ? `<p class="global-search-item-snippet">${cuplikanSorot}</p>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    const tombolLihatSemua =
      hasil.dokumen.total > BATAS_HASIL_PER_KELOMPOK
        ? `<button type="button" class="global-search-see-all-btn" data-search-see-all="dokumen">Lihat semua ${hasil.dokumen.total} dokumen &rarr;</button>`
        : "";

    potonganHtml.push(`
      <div class="global-search-group" role="group" aria-label="Dokumen">
        <div class="global-search-group-header">
          <span>Dokumen</span>
          <span class="global-search-group-count">${hasil.dokumen.total}</span>
        </div>
        ${itemHtml}
        ${tombolLihatSemua}
      </div>
    `);
  }

  const bannerStatus = sedangMemuatDataLengkap
    ? `<div style="padding:10px; font-size:12px; color:var(--color-primary); text-align:center;">
        Mencari di semua data...
       </div>`
    : dataLengkapSemua
      ? `<div style="padding:8px 12px; font-size:12px; color:var(--color-text-muted); text-align:center;">
          ✓ Menampilkan pencarian dari seluruh data server
         </div>`
      : `<div style="margin-top:12px; padding:6px; text-align:center;">
          <button type="button" class="btn-secondary" id="btn-search-all-server" style="font-size:12px; padding:6px 12px;">
            Cari juga di riwayat server yang belum dimuat
          </button>
         </div>`;

  wadah.innerHTML = potonganHtml.join("") + bannerStatus;

  daftarElemenPilihan = Array.from(wadah.querySelectorAll(".global-search-item"));
  indeksPilihanAktif = -1;
}

function sorotPilihanByIndex(indeks) {
  const input = document.getElementById("global-search-input");
  if (daftarElemenPilihan.length === 0) {
    indeksPilihanAktif = -1;
    if (input) input.setAttribute("aria-activedescendant", "");
    return;
  }

  if (indeks < 0) indeks = daftarElemenPilihan.length - 1;
  if (indeks >= daftarElemenPilihan.length) indeks = 0;

  indeksPilihanAktif = indeks;

  daftarElemenPilihan.forEach((el, i) => {
    const aktif = i === indeks;
    el.classList.toggle("is-focused", aktif);
    el.setAttribute("aria-selected", aktif ? "true" : "false");
  });

  const elAktif = daftarElemenPilihan[indeks];
  if (elAktif) {
    if (input) input.setAttribute("aria-activedescendant", elAktif.id);
    elAktif.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function eksekusiPilihanItem(kelompok, id) {
  if (!kelompok || !id) return;
  let sumberItem = null;
  if (kelompok === "kegiatan") {
    sumberItem = penyediaData.getDaftarKegiatan().find((k) => k.id === id);
  } else if (kelompok === "catatan") {
    sumberItem = penyediaData.getDaftarCatatan().find((c) => c.id === id);
  } else if (kelompok === "dokumen") {
    sumberItem = penyediaData.getDaftarDokumen().find((d) => d.id === id);
  }

  tutupPencarianGlobal(false);

  if (typeof penanganPilihHasil === "function") {
    penanganPilihHasil({
      ...sumberItem,
      id,
      kelompok,
    });
  }
}

function eksekusiLihatSemua(kelompok) {
  const kueri = kueriAktif;
  tutupPencarianGlobal(false);
  pindahKeBagian(kelompok);

  requestAnimationFrame(() => {
    let inputTargetId = "";
    if (kelompok === "kegiatan") inputTargetId = "kegiatan-search-input";
    else if (kelompok === "catatan") inputTargetId = "catatan-search-input";
    else if (kelompok === "dokumen") inputTargetId = "dokumen-search-input";

    const inputEl = document.getElementById(inputTargetId);
    if (inputEl instanceof HTMLInputElement) {
      inputEl.value = kueri;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus();
    }
  });
}

function jalankanPencarian(teksKueri) {
  kueriAktif = String(teksKueri || "").trim();
  if (!kueriAktif) {
    renderStatusAwal();
    return;
  }

  const sumber = dataLengkapSemua || {
    kegiatan: penyediaData.getDaftarKegiatan(),
    catatan: penyediaData.getDaftarCatatan(),
    dokumen: penyediaData.getDaftarDokumen(),
  };

  const kataKueri = normalisasiTeks(kueriAktif).split(/\s+/).filter(Boolean);
  const hasil = cariGlobal(kueriAktif, sumber);
  renderHasil(hasil, kataKueri);
}

function tanganiKeydownDialog(e) {
  if (!dialogTerbuka) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    tutupPencarianGlobal(true);
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    sorotPilihanByIndex(indeksPilihanAktif + 1);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    sorotPilihanByIndex(indeksPilihanAktif - 1);
    return;
  }

  if (e.key === "Enter") {
    if (indeksPilihanAktif >= 0 && indeksPilihanAktif < daftarElemenPilihan.length) {
      e.preventDefault();
      const el = daftarElemenPilihan[indeksPilihanAktif];
      const kelompok = el.getAttribute("data-search-kelompok");
      const id = el.getAttribute("data-search-id");
      eksekusiPilihanItem(kelompok, id);
    }
    return;
  }

  // Focus trap untuk tombol di dalam dialog
  if (e.key === "Tab") {
    const modal = document.getElementById("global-search-modal");
    if (!modal) return;
    const elemenFokusable = Array.from(
      modal.querySelectorAll('input:not([disabled]), button:not([disabled]), [tabindex="0"]')
    ).filter((el) => el instanceof HTMLElement && el.offsetParent !== null);

    if (elemenFokusable.length === 0) return;
    const pertama = elemenFokusable[0];
    const terakhir = elemenFokusable[elemenFokusable.length - 1];

    if (e.shiftKey && document.activeElement === pertama) {
      e.preventDefault();
      terakhir.focus();
    } else if (!e.shiftKey && document.activeElement === terakhir) {
      e.preventDefault();
      pertama.focus();
    }
  }
}

function pasangPintasanKeyboardGlobal() {
  if (listenerKeyboardGlobalTerdaftar) return;
  listenerKeyboardGlobalTerdaftar = true;

  document.addEventListener("keydown", (e) => {
    // Jangan buka pencarian jika layar login sedang aktif atau aplikasi belum masuk
    const layarApp = document.getElementById("app-shell");
    if (!layarApp || layarApp.hidden) return;

    // Pintasan Ctrl+K atau Cmd+K
    const isMac = /(mac|iphone|ipod|ipad)/i.test(navigator.userAgent || "");
    const tombolKombinasi = isMac ? e.metaKey : e.ctrlKey;
    if (tombolKombinasi && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (dialogTerbuka) {
        tutupPencarianGlobal(true);
      } else {
        bukaPencarianGlobal();
      }
      return;
    }

    // Pintasan tombol "/" bila tidak sedang mengetik di kolom isian
    if (e.key === "/" && !dialogTerbuka) {
      const el = document.activeElement;
      const tag = el ? el.tagName : "";
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el && el.isContentEditable);
      if (!isInput) {
        e.preventDefault();
        bukaPencarianGlobal();
      }
    }
  });
}

/**
 * Menginisialisasi komponen Pencarian Global.
 * @param {{
 *   getDaftarKegiatan: () => any[],
 *   getDaftarCatatan: () => any[],
 *   getDaftarDokumen: () => any[],
 *   onPilihHasil?: (item: any) => void
 * }} opsi
 */
export function initPencarianGlobal(opsi = {}) {
  if (typeof opsi.getDaftarKegiatan === "function") {
    penyediaData.getDaftarKegiatan = opsi.getDaftarKegiatan;
  }
  if (typeof opsi.getDaftarCatatan === "function") {
    penyediaData.getDaftarCatatan = opsi.getDaftarCatatan;
  }
  if (typeof opsi.getDaftarDokumen === "function") {
    penyediaData.getDaftarDokumen = opsi.getDaftarDokumen;
  }
  if (typeof opsi.onPilihHasil === "function") {
    penanganPilihHasil = opsi.onPilihHasil;
  }

  const modal = document.getElementById("global-search-modal");
  const input = document.getElementById("global-search-input");
  const closeBtn = document.getElementById("global-search-close-btn");
  const sidebarBtn = document.getElementById("sidebar-search-btn");
  const headerBtn = document.getElementById("header-search-btn");
  const resultsRegion = document.getElementById("global-search-results");

  if (sidebarBtn) {
    sidebarBtn.onclick = (e) => {
      e.preventDefault();
      bukaPencarianGlobal(sidebarBtn);
    };
  }

  if (headerBtn) {
    headerBtn.onclick = (e) => {
      e.preventDefault();
      bukaPencarianGlobal(headerBtn);
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => tutupPencarianGlobal(true);
  }

  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        tutupPencarianGlobal(true);
      }
    };
  }

  if (input) {
    input.oninput = () => {
      if (timerDebouncePencarian) clearTimeout(timerDebouncePencarian);
      timerDebouncePencarian = setTimeout(() => {
        jalankanPencarian(input.value);
      }, DEBOUNCE_DELAY_MS);
    };

    input.onkeydown = tanganiKeydownDialog;
  }

  if (resultsRegion) {
    resultsRegion.onclick = (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      const btnSearchServer = targetEl.closest("#btn-search-all-server");
      if (btnSearchServer) {
        btnSearchServer.setAttribute("disabled", "true");
        btnSearchServer.textContent = "Mencari di semua data...";
        sedangMemuatDataLengkap = true;
        jalankanPencarian(kueriAktif);
        muatSemuaDataUntukPencarian().then(() => {
          jalankanPencarian(kueriAktif);
        });
        return;
      }

      const btnSeeAll = targetEl.closest("button[data-search-see-all]");
      if (btnSeeAll) {
        const kelompok = btnSeeAll.getAttribute("data-search-see-all");
        if (kelompok) eksekusiLihatSemua(kelompok);
        return;
      }

      const itemEl = targetEl.closest(".global-search-item[data-search-id]");
      if (itemEl) {
        const kelompok = itemEl.getAttribute("data-search-kelompok");
        const id = itemEl.getAttribute("data-search-id");
        eksekusiPilihanItem(kelompok, id);
      }
    };
  }

  pasangPintasanKeyboardGlobal();
}

/**
 * Membersihkan status pencarian global saat pengguna keluar (logout).
 */
export function bersihkanPencarianGlobal() {
  tutupPencarianGlobal(false);
  dataLengkapSemua = null;
  sedangMemuatDataLengkap = false;
  penyediaData = {
    getDaftarKegiatan: () => [],
    getDaftarCatatan: () => [],
    getDaftarDokumen: () => [],
  };
  penanganPilihHasil = null;
  kueriAktif = "";
  indeksPilihanAktif = -1;
  daftarElemenPilihan = [];
}