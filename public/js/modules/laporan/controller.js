/**
 * Controller Modul Laporan (Tahap 3: dipisah dari laporan.js)
 * Pengikatan peristiwa halaman Laporan, aksi unduh CSV, pembuatan Google Sheets,
 * modal hapus riwayat, dan siklus langganan (subscribe/unsubscribe).
 */
import { SHEETS_API_BASE } from "../../config/constants.js";
import { hariIni } from "../../util-tanggal.js";
import {
  loginWithGoogle,
  formatPesanGalatAuth
} from "../../services/authService.js";
import { formatPesanGalatFirestore } from "../../services/firestoreService.js";
import {
  pastikanFolderIndukDrive,
  pindahkanBerkasKeFolderDrive,
  formatPesanGalatDrive
} from "../../services/driveService.js";
import {
  manajerKategoriKegiatan,
  onPerubahanKegiatan
} from "../kegiatan/index.js";
import {
  manajerKategoriDokumen,
  onPerubahanDokumen
} from "../dokumen/index.js";
import { onPerubahanCatatan } from "../catatan/index.js";
import {
  getJenisAktif,
  setJenisAktif,
  getTanggalDari,
  setTanggalDari,
  getTanggalSampai,
  setTanggalSampai,
  setFilterKategori,
  pastikanDataLaporanTersedia,
  susunDataLaporanSaatIni,
  getDaftarLaporan,
  simpanRiwayatLaporan,
  hapusRiwayatLaporan,
  langgananRiwayatLaporan,
  lepasLanggananRiwayatLaporan,
  setelOpsiPeristiwaLaporan
} from "./state.js";
import {
  hitungAwalBulanIni,
  formatTanggalSetempat,
  escapeSelCsv,
  kolomKeHurufA1
} from "./format.js";
import { panggilSheetsApi } from "./sheets.js";
import {
  pastikanKerangkaHalamanLaporan,
  sinkronkanDropdownKategoriLaporan,
  renderPratinjauLaporan,
  renderRiwayatLaporan,
  tampilkanNotifikasiLaporan,
  perbaruiStatusJaringanLaporan,
  getSedangMembuatSpreadsheet,
  setSedangMembuatSpreadsheet
} from "./view.js";

let antarmukaSudahDiikat = false;
let hapusRiwayatModalTerbuka = false;
let itemRiwayatAkanDihapus = null;
let fokusSebelumModalLaporan = null;
let unsubKategoriKeg = null;
let unsubKategoriDok = null;

function bukaModalHapusRiwayat(idRiwayat) {
  const item = getDaftarLaporan().find((r) => r.id === idRiwayat);
  const modal = document.getElementById("laporan-delete-modal");
  const desc = document.getElementById("laporan-delete-desc");
  const alertBox = document.getElementById("laporan-delete-alert");
  const btnBatal = document.getElementById("laporan-delete-cancel-btn");
  if (!item || !modal) return;

  itemRiwayatAkanDihapus = item;
  hapusRiwayatModalTerbuka = true;
  fokusSebelumModalLaporan = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (alertBox) alertBox.hidden = true;
  if (desc) {
    desc.textContent = `Catatan "${item.nama || "Laporan"}" akan dihapus dari daftar Riwayat Laporan di aplikasi ini. Berkas spreadsheet asli di Google Drive Anda TIDAK ikut dihapus.`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    if (btnBatal instanceof HTMLElement) btnBatal.focus();
  });
}

function tutupModalHapusRiwayat(kembalikanFokus = true) {
  const modal = document.getElementById("laporan-delete-modal");
  if (!modal || !hapusRiwayatModalTerbuka) return;

  hapusRiwayatModalTerbuka = false;
  itemRiwayatAkanDihapus = null;
  modal.hidden = true;

  if (kembalikanFokus && fokusSebelumModalLaporan && document.contains(fokusSebelumModalLaporan)) {
    fokusSebelumModalLaporan.focus();
  }
  fokusSebelumModalLaporan = null;
}

async function konfirmasiHapusRiwayatLaporan() {
  if (!itemRiwayatAkanDihapus) return;
  const btnKonfirmasi = document.getElementById("laporan-delete-confirm-btn");
  const alertBox = document.getElementById("laporan-delete-alert");
  const alertText = document.getElementById("laporan-delete-alert-text");

  if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = true;
  if (alertBox) alertBox.hidden = true;

  try {
    await hapusRiwayatLaporan(itemRiwayatAkanDihapus.id);
    tutupModalHapusRiwayat(true);
  } catch (err) {
    if (alertBox && alertText) {
      alertText.textContent = formatPesanGalatFirestore(err);
      alertBox.hidden = false;
    }
  } finally {
    if (btnKonfirmasi instanceof HTMLButtonElement) btnKonfirmasi.disabled = false;
  }
}

async function unduhLaporanSebagaiCsv() {
  await pastikanDataLaporanTersedia(getJenisAktif(), getTanggalDari(), getTanggalSampai());
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    tampilkanNotifikasiLaporan({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    tampilkanNotifikasiLaporan({ pesan: "Data sumber masih dimuat. Tunggu sesaat lalu coba lagi.", tipe: "warning" });
    return;
  }

  const semuaBaris = [paket.header, ...paket.barisData, paket.barisTotal];
  const isiCsv = "﻿" + semuaBaris.map((baris) => baris.map(escapeSelCsv).join(",")).join("\r\n");
  const blob = new Blob([isiCsv], { type: "text/csv;charset=utf-8;" });
  const urlObj = URL.createObjectURL(blob);

  const slugJenis = paket.infoJenis.judulPendek.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const namaBerkas = `laporan-${slugJenis}-${hariIni()}.csv`;

  const tautanUnduh = document.createElement("a");
  tautanUnduh.href = urlObj;
  tautanUnduh.download = namaBerkas;
  tautanUnduh.hidden = true;
  document.body.appendChild(tautanUnduh);
  tautanUnduh.click();
  tautanUnduh.remove();
  window.setTimeout(() => URL.revokeObjectURL(urlObj), 1500);

  tampilkanNotifikasiLaporan({
    pesan: `Berkas "${namaBerkas}" (${paket.barisData.length} baris) berhasil diunduh ke perangkat Anda.`,
    tipe: "success"
  });
}

async function buatLaporanKeGoogleSheets() {
  if (getSedangMembuatSpreadsheet()) return;

  await pastikanDataLaporanTersedia(getJenisAktif(), getTanggalDari(), getTanggalSampai());
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    tampilkanNotifikasiLaporan({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    tampilkanNotifikasiLaporan({ pesan: "Data sumber masih dimuat. Tunggu beberapa detik lalu coba lagi.", tipe: "warning" });
    return;
  }
  if (!navigator.onLine) {
    tampilkanNotifikasiLaporan({
      pesan: "Tidak ada koneksi internet. Pembuatan Google Sheets dinonaktifkan saat luring, silakan gunakan tombol \"Unduh CSV\".",
      tipe: "warning"
    });
    return;
  }

  setSedangMembuatSpreadsheet(true);
  perbaruiStatusJaringanLaporan();
  tampilkanNotifikasiLaporan({ pesan: "" });

  const progressBox = document.getElementById("laporan-progress-box");
  const progressLabel = document.getElementById("laporan-progress-label");
  if (progressBox) progressBox.hidden = false;
  const setTahap = (teks) => {
    if (progressLabel) progressLabel.textContent = teks;
  };

  try {
    const tglJudul = formatTanggalSetempat(hariIni());
    const judulSpreadsheet = `Laporan ${paket.infoJenis.judulPendek} - ${tglJudul}`;
    const namaTab = paket.infoJenis.namaTab;
    const semuaBaris = [paket.header, ...paket.barisData, paket.barisTotal];
    const jumlahKolom = paket.header.length;
    const jumlahBarisTotal = semuaBaris.length;

    setTahap("Membuat spreadsheet baru di Google Sheets...");
    const dibuat = await panggilSheetsApi(SHEETS_API_BASE, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          title: judulSpreadsheet
        },
        sheets: [
          {
            properties: {
              title: namaTab,
              gridProperties: {
                rowCount: Math.max(jumlahBarisTotal + 4, 25),
                columnCount: Math.max(jumlahKolom, 4),
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    });

    const spreadsheetId = String(dibuat?.spreadsheetId || "").trim();
    if (!spreadsheetId) {
      throw new Error("Google Sheets tidak mengembalikan ID spreadsheet yang baru dibuat.");
    }
    const sheetNumericId =
      Array.isArray(dibuat?.sheets) &&
      dibuat.sheets[0] &&
      dibuat.sheets[0].properties &&
      typeof dibuat.sheets[0].properties.sheetId === "number"
        ? dibuat.sheets[0].properties.sheetId
        : 0;
    const spreadsheetUrl =
      String(dibuat?.spreadsheetUrl || "").trim() ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;

    setTahap("Menulis data dan baris total ke Google Sheets...");
    const kolomAkhirA1 = kolomKeHurufA1(jumlahKolom - 1);
    const rangeA1 = `'${namaTab.replace(/'/g, "''")}'!A1:${kolomAkhirA1}${jumlahBarisTotal}`;
    await panggilSheetsApi(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({
          range: rangeA1,
          majorDimension: "ROWS",
          values: semuaBaris
        })
      }
    );

    setTahap("Mengatur format tabel, pembekuan header, dan lebar kolom...");
    await panggilSheetsApi(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetNumericId,
                  gridProperties: {
                    frozenRowCount: 1
                  }
                },
                fields: "gridProperties.frozenRowCount"
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: sheetNumericId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: jumlahKolom
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.859, green: 0.918, blue: 0.996 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 0.118, green: 0.251, blue: 0.686 }
                    },
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "WRAP"
                  }
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: sheetNumericId,
                  startRowIndex: jumlahBarisTotal - 1,
                  endRowIndex: jumlahBarisTotal,
                  startColumnIndex: 0,
                  endColumnIndex: jumlahKolom
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.945, green: 0.961, blue: 0.976 },
                    textFormat: { bold: true },
                    borders: {
                      top: {
                        style: "SOLID",
                        color: { red: 0.796, green: 0.835, blue: 0.882 }
                      }
                    }
                  }
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,borders.top)"
              }
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetNumericId,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: jumlahKolom
                }
              }
            }
          ]
        })
      }
    );

    setTahap("Memindahkan spreadsheet ke folder Agenda-Arsip di Google Drive...");
    const rootFolderId = await pastikanFolderIndukDrive();
    await pindahkanBerkasKeFolderDrive(spreadsheetId, rootFolderId);

    setTahap("Menyimpan catatan ke Riwayat Laporan...");
    await simpanRiwayatLaporan({
      nama: judulSpreadsheet,
      jenis: paket.infoJenis.id,
      jenisLabel: paket.infoJenis.judulPendek,
      tautan: spreadsheetUrl,
      sheetId: spreadsheetId,
      rentangTanggal: paket.rentangLabel,
      tanggalDari: getTanggalDari(),
      tanggalSampai: getTanggalSampai(),
      jumlahBaris: paket.barisData.length
    });

    tampilkanNotifikasiLaporan({
      pesan: `Laporan "${judulSpreadsheet}" (${paket.barisData.length} baris) berhasil dibuat dan disimpan di folder Agenda-Arsip.`,
      tipe: "success",
      tautanSheets: spreadsheetUrl
    });
  } catch (err) {
    const butuhRelogin = Boolean(
      err && typeof err === "object" && (err.butuhRelogin || err.isTokenExpired || err.isUnauthorized || err.status === 401)
    );
    let pesanGalat = "";
    if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
      pesanGalat = formatPesanGalatFirestore(err);
    } else if (err instanceof Error && err.message) {
      pesanGalat = err.message;
    } else {
      pesanGalat = formatPesanGalatDrive(err);
    }
    tampilkanNotifikasiLaporan({
      pesan: pesanGalat,
      tipe: "danger",
      butuhRelogin
    });
  } finally {
    setSedangMembuatSpreadsheet(false);
    if (progressBox) progressBox.hidden = true;
    perbaruiStatusJaringanLaporan();
  }
}

export function initHalamanLaporan() {
  pastikanKerangkaHalamanLaporan();
  if (antarmukaSudahDiikat) return;
  antarmukaSudahDiikat = true;

  setelOpsiPeristiwaLaporan({ onSumberSiap: () => renderPratinjauLaporan() });

  const panel = document.getElementById("section-laporan");
  if (panel) {
    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.id === "laporan-jenis-select" && target instanceof HTMLSelectElement) {
        setJenisAktif(target.value);
        setFilterKategori("ALL");
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
      } else if (target.id === "laporan-filter-kategori" && target instanceof HTMLSelectElement) {
        setFilterKategori(target.value || "ALL");
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-dari" && target instanceof HTMLInputElement) {
        setTanggalDari(target.value);
        renderPratinjauLaporan();
      } else if (target.id === "laporan-tanggal-sampai" && target instanceof HTMLInputElement) {
        setTanggalSampai(target.value);
        renderPratinjauLaporan();
      }
    });

    panel.addEventListener("click", async (e) => {
      const targetEl = e.target instanceof Element ? e.target : null;
      if (!targetEl) return;

      if (targetEl.closest("#btn-laporan-buat-sheets")) {
        await buatLaporanKeGoogleSheets();
        return;
      }
      if (targetEl.closest("#btn-laporan-unduh-csv")) {
        unduhLaporanSebagaiCsv();
        return;
      }
      if (targetEl.closest("#btn-laporan-reset-filter")) {
        setTanggalDari(hitungAwalBulanIni());
        setTanggalSampai(hariIni());
        setFilterKategori("ALL");
        const inpDari = document.getElementById("laporan-tanggal-dari");
        const inpSampai = document.getElementById("laporan-tanggal-sampai");
        if (inpDari instanceof HTMLInputElement) inpDari.value = getTanggalDari();
        if (inpSampai instanceof HTMLInputElement) inpSampai.value = getTanggalSampai();
        sinkronkanDropdownKategoriLaporan();
        renderPratinjauLaporan();
        return;
      }

      const btnAction = targetEl.closest("[data-laporan-action]");
      if (!btnAction) return;
      const aksi = btnAction.getAttribute("data-laporan-action");

      if (aksi === "dismiss-feedback") {
        tampilkanNotifikasiLaporan({ pesan: "" });
      } else if (aksi === "relogin") {
        if (btnAction instanceof HTMLButtonElement) {
          btnAction.disabled = true;
          btnAction.textContent = "Memuat...";
        }
        try {
          await loginWithGoogle();
          tampilkanNotifikasiLaporan({
            pesan: "Sesi akses Google berhasil diperbarui. Silakan klik \"Buat Laporan\" kembali.",
            tipe: "success"
          });
        } catch (err) {
          tampilkanNotifikasiLaporan({
            pesan: formatPesanGalatAuth(err),
            tipe: "danger",
            butuhRelogin: true
          });
        }
      } else if (aksi === "hapus-riwayat") {
        const id = btnAction.getAttribute("data-id") || "";
        if (id) bukaModalHapusRiwayat(id);
      }
    });
  }

  const modalHapus = document.getElementById("laporan-delete-modal");
  const btnBatalHapus = document.getElementById("laporan-delete-cancel-btn");
  const btnKonfirmasiHapus = document.getElementById("laporan-delete-confirm-btn");

  if (btnBatalHapus) btnBatalHapus.addEventListener("click", () => tutupModalHapusRiwayat(true));
  if (btnKonfirmasiHapus) btnKonfirmasiHapus.addEventListener("click", () => konfirmasiHapusRiwayatLaporan());
  if (modalHapus) {
    modalHapus.addEventListener("click", (e) => {
      if (e.target === modalHapus) tutupModalHapusRiwayat(true);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!hapusRiwayatModalTerbuka) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tutupModalHapusRiwayat(true);
    }
  });

  onPerubahanKegiatan(() => {
    if (getJenisAktif() === "kegiatan" || getJenisAktif() === "rekap-status" || getJenisAktif() === "dokumen" || getJenisAktif() === "catatan") {
      renderPratinjauLaporan();
    }
  });
  onPerubahanDokumen(() => {
    if (getJenisAktif() === "dokumen") renderPratinjauLaporan();
  });
  onPerubahanCatatan(() => {
    if (getJenisAktif() === "catatan") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  renderPratinjauLaporan();
  renderRiwayatLaporan();
}

export function subscribeLaporan() {
  unsubscribeLaporan();
  pastikanKerangkaHalamanLaporan();

  setelOpsiPeristiwaLaporan({ onSumberSiap: () => renderPratinjauLaporan() });

  unsubKategoriKeg = manajerKategoriKegiatan.onChange(() => {
    if (getJenisAktif() === "kegiatan" || getJenisAktif() === "rekap-status") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  unsubKategoriDok = manajerKategoriDokumen.onChange(() => {
    if (getJenisAktif() === "dokumen") {
      sinkronkanDropdownKategoriLaporan();
      renderPratinjauLaporan();
    }
  });

  langgananRiwayatLaporan({
    onData: () => renderRiwayatLaporan(),
    onGalat: (err) => {
      tampilkanNotifikasiLaporan({
        pesan: formatPesanGalatFirestore(err),
        tipe: "danger"
      });
    }
  });

  renderPratinjauLaporan();
  return () => unsubscribeLaporan();
}

export function unsubscribeLaporan() {
  lepasLanggananRiwayatLaporan();
  if (typeof unsubKategoriKeg === "function") {
    try { unsubKategoriKeg(); } catch (_e) {}
    unsubKategoriKeg = null;
  }
  if (typeof unsubKategoriDok === "function") {
    try { unsubKategoriDok(); } catch (_e) {}
    unsubKategoriDok = null;
  }
  tutupModalHapusRiwayat(false);
}
