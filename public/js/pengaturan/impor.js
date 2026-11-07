/**
 * Impor Cadangan Data JSON (Validasi, Pratinjau, Mode Lewati/Timpa, writeBatch Maks 500)
 */
import {
  getFirestoreDb,
  collection,
  doc,
  getDocs,
  writeBatch,
  formatPesanGalatFirestore
} from "../firebase-config.js";
import { normalisasiWarnaKategori } from "../kategori.js";
import { DAFTAR_STATUS_KEGIATAN } from "../kegiatan.js";
import { JENIS_CATATAN_GDOC, JENIS_CATATAN_SINGKAT } from "../catatan.js";
import { parseTanggal, hariIni } from "../util-tanggal.js";
import { escapeHtml, tampilkanToast } from "../sidebar.js";
import { getStatusUiPengaturan, setStatusUiPengaturan } from "./state.js";
import {
  BATAS_OPERASI_BATCH,
  KOLEKSI_CADANGAN,
  buatIdDokumenCadangan,
  setUmpanBalikPengaturan
} from "./util.js";
import { segarkanTampilanPengaturan } from "./render.js";

export function sanitasiItemKoleksi(namaKoleksi, mentah, indeks) {
  if (!mentah || typeof mentah !== "object") return null;
  const sekarang = new Date().toISOString();
  const idBersih = String(mentah.id || "").trim().replace(/\//g, "_") || buatIdDokumenCadangan(indeks);

  if (namaKoleksi === "kategoriKegiatan") {
    const nama = String(mentah.nama || "").trim().slice(0, 40);
    if (!nama) return null;
    return {
      id: idBersih,
      data: {
        nama,
        warna: normalisasiWarnaKategori(mentah.warna),
        urutan: Number.isFinite(Number(mentah.urutan)) ? Number(mentah.urutan) : indeks + 1,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "kategoriDokumen") {
    const nama = String(mentah.nama || "").trim().slice(0, 40);
    if (!nama) return null;
    const folderId = String(mentah.folderId || "").trim();
    return {
      id: idBersih,
      data: {
        nama,
        warna: normalisasiWarnaKategori(mentah.warna),
        urutan: Number.isFinite(Number(mentah.urutan)) ? Number(mentah.urutan) : indeks + 1,
        folderId,
        folderSinkron: Boolean(folderId) && mentah.folderSinkron === true,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "kegiatan") {
    const judul = String(mentah.judul || "").trim().slice(0, 160);
    if (!judul) return null;
    const tglMentah = String(mentah.tanggal || "").trim();
    const tanggal = parseTanggal(tglMentah) ? tglMentah : hariIni();
    const status = DAFTAR_STATUS_KEGIATAN.includes(mentah.status) ? mentah.status : "Rencana";
    return {
      id: idBersih,
      data: {
        judul,
        catatan: String(mentah.catatan || ""),
        tanggal,
        waktuMulai: String(mentah.waktuMulai || "").trim(),
        waktuSelesai: String(mentah.waktuSelesai || "").trim(),
        lokasi: String(mentah.lokasi || "").trim().slice(0, 140),
        kategoriId: String(mentah.kategoriId || "").trim(),
        status,
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "dokumen") {
    const namaFile = String(mentah.namaFile || mentah.namaTampilan || "").trim();
    const namaTampilan = String(mentah.namaTampilan || namaFile || "Dokumen").trim().slice(0, 160);
    return {
      id: idBersih,
      data: {
        namaTampilan,
        namaFile: namaFile || namaTampilan,
        driveFileId: String(mentah.driveFileId || "").trim(),
        tautan: String(mentah.tautan || "").trim(),
        mimeType: String(mentah.mimeType || "application/octet-stream").trim(),
        ukuran: Number.isFinite(Number(mentah.ukuran)) ? Number(mentah.ukuran) : 0,
        kategoriId: String(mentah.kategoriId || "").trim(),
        kegiatanId: String(mentah.kegiatanId || "").trim(),
        catatan: String(mentah.catatan || ""),
        tanggalUnggah: String(mentah.tanggalUnggah || mentah.createdAt || sekarang),
        createdAt: String(mentah.createdAt || sekarang),
        updatedAt: String(mentah.updatedAt || sekarang)
      }
    };
  }

  if (namaKoleksi === "catatan") {
    const jenis = mentah.jenis === JENIS_CATATAN_GDOC ? JENIS_CATATAN_GDOC : JENIS_CATATAN_SINGKAT;
    const judul = String(mentah.judul || "").trim().slice(0, 160);
    if (!judul) return null;
    const tglMentah = String(mentah.tanggal || "").trim();
    const tanggal = parseTanggal(tglMentah) ? tglMentah : hariIni();
    const tagArr = Array.isArray(mentah.tag)
      ? mentah.tag.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    const dataCatatan = {
      jenis,
      judul,
      isi: jenis === JENIS_CATATAN_SINGKAT ? String(mentah.isi || "") : "",
      kategori: String(mentah.kategori || "").trim().slice(0, 40),
      tag: tagArr,
      kegiatanId: String(mentah.kegiatanId || "").trim(),
      disematkan: Boolean(mentah.disematkan),
      tanggal,
      createdAt: String(mentah.createdAt || sekarang),
      updatedAt: String(mentah.updatedAt || sekarang)
    };
    if (jenis === JENIS_CATATAN_GDOC) {
      dataCatatan.templat = String(mentah.templat || "kosong");
      dataCatatan.docId = String(mentah.docId || "").trim();
      dataCatatan.tautan = String(mentah.tautan || "").trim();
    }
    return { id: idBersih, data: dataCatatan };
  }

  if (namaKoleksi === "laporan") {
    const nama = String(mentah.nama || "Laporan Google Sheets").trim();
    return {
      id: idBersih,
      data: {
        nama,
        jenis: String(mentah.jenis || "kegiatan"),
        jenisLabel: String(mentah.jenisLabel || ""),
        tautan: String(mentah.tautan || "").trim(),
        sheetId: String(mentah.sheetId || "").trim(),
        rentangTanggal: String(mentah.rentangTanggal || ""),
        tanggalDari: String(mentah.tanggalDari || ""),
        tanggalSampai: String(mentah.tanggalSampai || ""),
        jumlahBaris: Number.isFinite(Number(mentah.jumlahBaris)) ? Number(mentah.jumlahBaris) : 0,
        createdAt: String(mentah.createdAt || sekarang)
      }
    };
  }

  return null;
}

export function uraiBerkasJsonCadangan(teksJson) {
  let objek;
  try {
    objek = JSON.parse(teksJson);
  } catch (_e) {
    throw new Error("Berkas bukan JSON yang sah. Pilih berkas cadangan .json yang benar.");
  }

  if (!objek || typeof objek !== "object") {
    throw new Error("Struktur berkas JSON tidak dikenali.");
  }

  const sumber =
    objek.koleksi && typeof objek.koleksi === "object"
      ? objek.koleksi
      : objek.data && typeof objek.data === "object"
        ? objek.data
        : objek;

  const hasilPerKoleksi = {};
  let totalValid = 0;

  for (const info of KOLEKSI_CADANGAN) {
    const arrMentah = Array.isArray(sumber[info.key]) ? sumber[info.key] : [];
    const unikId = new Map();
    arrMentah.forEach((item, idx) => {
      const bersih = sanitasiItemKoleksi(info.key, item, idx);
      if (bersih) {
        unikId.set(bersih.id, bersih);
      }
    });
    const daftarBersih = Array.from(unikId.values());
    hasilPerKoleksi[info.key] = daftarBersih;
    totalValid += daftarBersih.length;
  }

  const adaKunciKoleksi = KOLEKSI_CADANGAN.some((k) => Array.isArray(sumber[k.key]));
  if (!adaKunciKoleksi) {
    throw new Error(
      "Berkas JSON tidak memuat koleksi Agenda & Arsip (kegiatan, kategoriKegiatan, dokumen, kategoriDokumen, catatan, laporan)."
    );
  }

  return {
    tanggalEkspor: String(objek.tanggalEkspor || ""),
    koleksi: hasilPerKoleksi,
    totalValid
  };
}

export function batalkanPratinjauImpor() {
  setStatusUiPengaturan({
    dataSiapImpor: null,
    namaBerkasImpor: ""
  });
  const inputFile = document.getElementById("settings-import-file");
  if (inputFile instanceof HTMLInputElement) inputFile.value = "";
  const panelPreview = document.getElementById("settings-import-preview-panel");
  if (panelPreview) panelPreview.hidden = true;
  const progWrap = document.getElementById("settings-import-progress-wrap");
  if (progWrap) progWrap.hidden = true;
}

export function tampilkanPratinjauImpor() {
  const ui = getStatusUiPengaturan();
  const panelPreview = document.getElementById("settings-import-preview-panel");
  const metaEl = document.getElementById("settings-import-file-meta");
  const gridEl = document.getElementById("settings-import-counts-grid");
  const summaryBox = document.getElementById("settings-import-summary-box");
  const btnConfirm = document.getElementById("btn-settings-confirm-import");
  if (!panelPreview || !gridEl || !ui.dataSiapImpor) return;

  if (summaryBox) {
    summaryBox.hidden = true;
    summaryBox.innerHTML = "";
  }

  if (metaEl) {
    const infoTgl = ui.dataSiapImpor.tanggalEkspor ? ` • Tanggal ekspor: ${ui.dataSiapImpor.tanggalEkspor}` : "";
    metaEl.textContent = `Berkas: ${ui.namaBerkasImpor} • Total ${ui.dataSiapImpor.totalValid} entri siap diperiksa${infoTgl}`;
  }

  gridEl.innerHTML = KOLEKSI_CADANGAN.map((k) => {
    const jml = ui.dataSiapImpor.koleksi[k.key]?.length || 0;
    return `<div class="organize-stat-item">
      <span class="organize-stat-value">${jml}</span>
      <span class="organize-stat-label">${escapeHtml(k.label)}</span>
    </div>`;
  }).join("");

  if (btnConfirm instanceof HTMLButtonElement) {
    btnConfirm.disabled = ui.dataSiapImpor.totalValid === 0;
  }

  panelPreview.hidden = false;
}

export async function jalankanImporDataBatch() {
  const ui = getStatusUiPengaturan();
  if (ui.sedangMengimpor || !ui.dataSiapImpor) return;

  const radioOverwrite = document.getElementById("settings-import-mode-overwrite");
  const modeTimpa = radioOverwrite instanceof HTMLInputElement && radioOverwrite.checked;

  const btnConfirm = document.getElementById("btn-settings-confirm-import");
  const btnCancel = document.getElementById("btn-settings-cancel-import");
  const progWrap = document.getElementById("settings-import-progress-wrap");
  const progLabel = document.getElementById("settings-import-progress-label");
  const progPct = document.getElementById("settings-import-progress-pct");
  const progFill = document.getElementById("settings-import-progress-fill");
  const summaryBox = document.getElementById("settings-import-summary-box");

  setStatusUiPengaturan({ sedangMengimpor: true });
  setUmpanBalikPengaturan("");
  if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = true;
  if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = true;
  if (progWrap) progWrap.hidden = false;

  const perbaruiProgres = (label, persen) => {
    const p = Math.max(0, Math.min(100, Math.round(persen)));
    if (progLabel) progLabel.textContent = label;
    if (progPct) progPct.textContent = `${p}%`;
    if (progFill instanceof HTMLElement) progFill.style.width = `${p}%`;
  };

  try {
    const db = getFirestoreDb();
    perbaruiProgres("Memeriksa data yang sudah ada di aplikasi...", 5);

    const petaIdSudahAda = new Map();
    for (const info of KOLEKSI_CADANGAN) {
      const snap = await getDocs(collection(db, info.key));
      const setIds = new Set();
      snap.forEach((d) => setIds.add(d.id));
      petaIdSudahAda.set(info.key, setIds);
    }

    const operasiTulis = [];
    let ditambahkan = 0;
    let ditimpa = 0;
    let dilewati = 0;

    for (const info of KOLEKSI_CADANGAN) {
      const daftarImpor = ui.dataSiapImpor.koleksi[info.key] || [];
      const sudahAdaSet = petaIdSudahAda.get(info.key) || new Set();

      for (const entri of daftarImpor) {
        const sudahAda = sudahAdaSet.has(entri.id);
        if (sudahAda && !modeTimpa) {
          dilewati += 1;
          continue;
        }
        operasiTulis.push({
          ref: doc(db, info.key, entri.id),
          data: entri.data
        });
        if (sudahAda) ditimpa += 1;
        else ditambahkan += 1;
      }
    }

    if (operasiTulis.length > 0) {
      const totalBatch = Math.ceil(operasiTulis.length / BATAS_OPERASI_BATCH);
      for (let indeksBatch = 0; indeksBatch < totalBatch; indeksBatch += 1) {
        const mulai = indeksBatch * BATAS_OPERASI_BATCH;
        const potongan = operasiTulis.slice(mulai, mulai + BATAS_OPERASI_BATCH);
        const batch = writeBatch(db);
        potongan.forEach((op) => {
          batch.set(op.ref, op.data);
        });

        const persen = 15 + ((indeksBatch + 1) / totalBatch) * 85;
        perbaruiProgres(
          `Menyimpan batch ${indeksBatch + 1} dari ${totalBatch} (${Math.min(mulai + potongan.length, operasiTulis.length)}/${operasiTulis.length} data)...`,
          persen
        );
        await batch.commit();
      }
    } else {
      perbaruiProgres("Tidak ada perubahan baru yang perlu ditulis.", 100);
    }

    batalkanPratinjauImpor();

    if (summaryBox) {
      summaryBox.hidden = false;
      summaryBox.innerHTML = `
        <div class="organize-notice-box">
          <strong class="sub-card-title">Ringkasan Hasil Impor Cadangan</strong>
          <div class="organize-summary-grid">
            <div class="organize-stat-item">
              <span class="organize-stat-value">${ditambahkan}</span>
              <span class="organize-stat-label">Data Baru Ditambahkan</span>
            </div>
            <div class="organize-stat-item">
              <span class="organize-stat-value">${ditimpa}</span>
              <span class="organize-stat-label">Data Lama Ditimpa</span>
            </div>
            <div class="organize-stat-item">
              <span class="organize-stat-value">${dilewati}</span>
              <span class="organize-stat-label">Dilewati (Sudah Ada)</span>
            </div>
          </div>
        </div>
      `;
    }

    tampilkanToast(
      `Impor selesai: ${ditambahkan} ditambahkan, ${ditimpa} ditimpa, ${dilewati} dilewati.`,
      "success"
    );
  } catch (err) {
    setUmpanBalikPengaturan(formatPesanGalatFirestore(err), "danger");
  } finally {
    setStatusUiPengaturan({ sedangMengimpor: false });
    if (progWrap) progWrap.hidden = true;
    if (btnConfirm instanceof HTMLButtonElement) btnConfirm.disabled = false;
    if (btnCancel instanceof HTMLButtonElement) btnCancel.disabled = false;
    segarkanTampilanPengaturan();
  }
}