/**
 * Modul Operasi Google Sheets API & Google Drive
 * Menangani pembuatan spreadsheet baru, penulisan baris dan baris total,
 * styling format tabel (header biru muda, borders, freeze baris pertama, auto-resize),
 * pemindahan ke folder Drive "Agenda-Arsip", dan pencatatan riwayat ke Firestore.
 */
import {
  getFirestoreDb,
  collection,
  addDoc,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import {
  getDriveAccessToken,
  isDriveTokenExpired
} from "../auth.js";
import { hariIni } from "../util-tanggal.js";
import {
  pastikanFolderIndukDrive,
  pindahkanBerkasKeFolderDrive,
  formatPesanGalatDrive
} from "../drive.js";
import {
  SHEETS_API_BASE,
  formatTanggalSetempat,
  kolomKeHurufA1
} from "./util.js";
import { stateLaporan } from "./state.js";
import { pastikanDataLaporanTersedia, susunDataLaporanSaatIni } from "./data.js";

let statusTombolUpdater = null;
let notifikasiHandler = null;

export function setSheetsUiHandlers({ updateStatusTombol, beriNotifikasi } = {}) {
  if (typeof updateStatusTombol === "function") statusTombolUpdater = updateStatusTombol;
  if (typeof beriNotifikasi === "function") notifikasiHandler = beriNotifikasi;
}

function panggilUpdateStatusTombol() {
  if (typeof statusTombolUpdater === "function") {
    statusTombolUpdater();
  }
}

function panggilNotifikasi(payload) {
  if (typeof notifikasiHandler === "function") {
    notifikasiHandler(payload);
  }
}

export function buatErrorSheets(status, pesanAsli, alasanKode = "", detailStatus = "") {
  const rawLower = String(pesanAsli || "").toLowerCase();
  const reasonLower = String(alasanKode || "").toLowerCase();
  const statusStrLower = String(detailStatus || "").toLowerCase();

  let pesan = "Terjadi kesalahan saat membuat laporan di Google Sheets.";
  let butuhRelogin = false;

  if (!navigator.onLine) {
    pesan = "Tidak ada koneksi internet. Pembuatan Google Sheets memerlukan sambungan internet aktif. Anda tetap dapat memakai tombol \"Unduh CSV\".";
  } else if (status === 401) {
    pesan = "Sesi akses Google telah kedaluwarsa atau tidak sah. Silakan klik tombol \"Masuk ulang\" lalu coba buat laporan kembali.";
    butuhRelogin = true;
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("sheets api has not been used") ||
      rawLower.includes("google sheets api has not been used") ||
      (rawLower.includes("sheets.googleapis.com") && rawLower.includes("disabled")) ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("is disabled")
    ) {
      pesan = "Google Sheets API belum diaktifkan pada proyek ini. Buka Google Cloud Console -> APIs & Services -> Library, cari \"Google Sheets API\", klik Enable, lalu coba lagi.";
    } else if (
      reasonLower.includes("insufficientpermissions") ||
      reasonLower.includes("access_token_scope_insufficient") ||
      rawLower.includes("insufficient authentication scopes") ||
      rawLower.includes("insufficient permission") ||
      statusStrLower === "permission_denied"
    ) {
      pesan = "Izin akses Google tidak mencukupi untuk membuat Google Sheets (403). Silakan klik \"Masuk ulang\" dan setujui izin akses Google Drive, atau jika masih ditolak mungkin perlu menambah scope https://www.googleapis.com/auth/spreadsheets pada konfigurasi login.";
      butuhRelogin = true;
    } else {
      pesan = `Permintaan ditolak oleh Google Sheets (403)${pesanAsli ? `: ${pesanAsli}` : "."} Anda dapat mencoba \"Masuk ulang\" atau periksa pengaktifan Google Sheets API di Google Cloud Console.`;
      butuhRelogin = true;
    }
  } else if (status === 404) {
    pesan = "Spreadsheet tujuan tidak ditemukan di Google Sheets (404).";
  } else if (status === 429) {
    pesan = "Terlalu banyak permintaan ke Google Sheets dalam waktu singkat (429). Tunggu beberapa detik lalu coba kembali.";
  } else if (pesanAsli) {
    pesan = `Kendala Google Sheets (${status}): ${pesanAsli}`;
  }

  const err = new Error(pesan);
  err.status = status;
  err.butuhRelogin = butuhRelogin;
  err.isTokenExpired = status === 401;
  return err;
}

export async function panggilSheetsApi(url, opsi = {}) {
  if (!navigator.onLine) {
    throw buatErrorSheets(0, "");
  }
  if (isDriveTokenExpired()) {
    const errExp = new Error(
      "Sesi akses Google telah kedaluwarsa (lebih dari 50 menit) atau belum aktif. Klik \"Masuk ulang\" sebelum membuat spreadsheet."
    );
    errExp.butuhRelogin = true;
    errExp.isTokenExpired = true;
    throw errExp;
  }
  const token = getDriveAccessToken();
  if (!token) {
    const errNoToken = new Error(
      "Token akses Google tidak tersedia. Klik \"Masuk ulang\" untuk memperbarui sesi akses."
    );
    errNoToken.butuhRelogin = true;
    errNoToken.isTokenExpired = true;
    throw errNoToken;
  }

  const headers = new Headers(opsi.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opsi.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
  }

  let resp;
  try {
    resp = await fetch(url, { ...opsi, headers });
  } catch (_netErr) {
    throw new Error(
      !navigator.onLine
        ? "Koneksi internet terputus saat menghubungi Google Sheets. Gunakan tombol \"Unduh CSV\" bila sedang luring."
        : "Gagal menghubungi layanan Google Sheets. Periksa sambungan internet Anda."
    );
  }

  if (!resp.ok) {
    let pesanAsli = "";
    let alasanKode = "";
    let statusTeks = "";
    try {
      const data = await resp.json();
      if (data && data.error) {
        pesanAsli = String(data.error.message || "");
        statusTeks = String(data.error.status || "");
        if (Array.isArray(data.error.errors) && data.error.errors.length > 0) {
          alasanKode = String(data.error.errors[0].reason || "");
        }
        if (!alasanKode && Array.isArray(data.error.details)) {
          const infoErr = data.error.details.find((d) => d && d.reason);
          if (infoErr) alasanKode = String(infoErr.reason);
        }
      }
    } catch (_e) {
      try { pesanAsli = await resp.text(); } catch (_e2) {}
    }
    throw buatErrorSheets(resp.status, pesanAsli, alasanKode, statusTeks);
  }

  return resp.json();
}

async function buatSpreadsheetBaru(judulSpreadsheet, namaTab, jumlahBarisTotal, jumlahKolom) {
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

  return { spreadsheetId, sheetNumericId, spreadsheetUrl };
}

async function tulisNilaiSpreadsheet(spreadsheetId, namaTab, semuaBaris, jumlahKolom, jumlahBarisTotal) {
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
}

async function aturFormatTabelSpreadsheet(spreadsheetId, sheetNumericId, jumlahKolom, jumlahBarisTotal) {
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
}

async function simpanRiwayatLaporanFirestore(judulSpreadsheet, paket, spreadsheetUrl, spreadsheetId) {
  const db = getFirestoreDb();
  await addDoc(collection(db, "laporan"), {
    nama: judulSpreadsheet,
    jenis: paket.infoJenis.id,
    jenisLabel: paket.infoJenis.judulPendek,
    tautan: spreadsheetUrl,
    sheetId: spreadsheetId,
    rentangTanggal: paket.rentangLabel,
    tanggalDari: stateLaporan.tanggalDari,
    tanggalSampai: stateLaporan.tanggalSampai,
    jumlahBaris: paket.barisData.length,
    createdAt: new Date().toISOString()
  });
}

export async function buatLaporanKeGoogleSheets() {
  if (stateLaporan.sedangMembuatSpreadsheet) return;

  await pastikanDataLaporanTersedia(stateLaporan.jenisAktif, stateLaporan.tanggalDari, stateLaporan.tanggalSampai);
  const paket = susunDataLaporanSaatIni();
  if (!paket.valid) {
    panggilNotifikasi({ pesan: paket.pesanValidasi, tipe: "danger" });
    return;
  }
  if (paket.sedangMemuatSumber) {
    panggilNotifikasi({ pesan: "Data sumber masih dimuat. Tunggu beberapa detik lalu coba lagi.", tipe: "warning" });
    return;
  }
  if (!navigator.onLine) {
    panggilNotifikasi({
      pesan: "Tidak ada koneksi internet. Pembuatan Google Sheets dinonaktifkan saat luring, silakan gunakan tombol \"Unduh CSV\".",
      tipe: "warning"
    });
    return;
  }

  stateLaporan.sedangMembuatSpreadsheet = true;
  panggilUpdateStatusTombol();
  panggilNotifikasi({ pesan: "" });

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
    const { spreadsheetId, sheetNumericId, spreadsheetUrl } = await buatSpreadsheetBaru(
      judulSpreadsheet,
      namaTab,
      jumlahBarisTotal,
      jumlahKolom
    );

    setTahap("Menulis data dan baris total ke Google Sheets...");
    await tulisNilaiSpreadsheet(spreadsheetId, namaTab, semuaBaris, jumlahKolom, jumlahBarisTotal);

    setTahap("Mengatur format tabel, pembekuan header, dan lebar kolom...");
    await aturFormatTabelSpreadsheet(spreadsheetId, sheetNumericId, jumlahKolom, jumlahBarisTotal);

    setTahap("Memindahkan spreadsheet ke folder Agenda-Arsip di Google Drive...");
    const rootFolderId = await pastikanFolderIndukDrive();
    await pindahkanBerkasKeFolderDrive(spreadsheetId, rootFolderId);

    setTahap("Menyimpan catatan ke Riwayat Laporan...");
    await simpanRiwayatLaporanFirestore(judulSpreadsheet, paket, spreadsheetUrl, spreadsheetId);

    panggilNotifikasi({
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
    panggilNotifikasi({
      pesan: pesanGalat,
      tipe: "danger",
      butuhRelogin
    });
  } finally {
    stateLaporan.sedangMembuatSpreadsheet = false;
    if (progressBox) progressBox.hidden = true;
    panggilUpdateStatusTombol();
  }
}