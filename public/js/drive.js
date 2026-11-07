/**
 * Modul Operasi Google Drive API v3 & Struktur Folder Kategori (Fase 3 + Fase 4 Google Docs & Resumable Upload)
 * Mematuhi Aturan #2, #7, #8, #10, #12:
 * - Seluruh operasi memakai ID (folderId, fileId), kecuali pencarian satu kali folder induk "Agenda-Arsip"
 *   jika belum tercatat di koleksi "pengaturan" (dokumen "drive").
 * - Tidak pernah menyimpan access token di Firestore.
 * - Penanganan galat jelas: token kedaluwarsa, tidak ada koneksi, API belum aktif, 403/404 Google,
 *   serta permission-denied Firestore.
 * - Unggah berkas cerdas: multipart untuk berkas <= 5 MB, resumable per potongan 2 MiB dengan retry backoff
 *   dan query status untuk berkas > 5 MB.
 */
import {
  getFirestoreDb,
  doc,
  getDoc,
  setDoc,
  formatPesanGalatFirestore
} from "./firebase-config.js";
import { getDriveAccessToken, isDriveTokenExpired } from "./auth.js";

export const NAMA_FOLDER_INDUK = "Agenda-Arsip";
export const NAMA_FOLDER_TANPA_KATEGORI = "Tanpa Kategori";
export const MIME_TYPE_FOLDER_DRIVE = "application/vnd.google-apps.folder";
export const MIME_TYPE_GOOGLE_DOCS = "application/vnd.google-apps.document";

/** Ambang ukuran berkas untuk beralih dari multipart sederhana ke resumable (5 MB) */
export const AMBANG_UNGGAH_RESUMABLE_BYTES = 5 * 1024 * 1024;

/** Ukuran tiap potongan unggahan resumable: 2 MiB (kelipatan wajib 256 KiB) */
export const UKURAN_POTONGAN_RESUMABLE_BYTES = 2 * 1024 * 1024;

const MAKS_PERCOBAAN_RETRY = 5;
const JEDA_RETRY_DASAR_MS = 1000;

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

let cacheRootFolderId = null;
let cacheUncategorizedFolderId = null;
let janjiPastikanInduk = null;
let janjiPastikanTanpaKategori = null;

/**
 * Membersihkan cache ID folder Drive di memori saat pengguna keluar sesi.
 */
export function resetCacheDrive() {
  cacheRootFolderId = null;
  cacheUncategorizedFolderId = null;
  janjiPastikanInduk = null;
  janjiPastikanTanpaKategori = null;
}

/**
 * Membersihkan nama folder sesuai spesifikasi Fase 3:
 * pangkas spasi, ganti / dan \ dengan "-", maksimal 100 karakter.
 * @param {string} namaMentah
 * @returns {string}
 */
export function bersihkanNamaFolderDrive(namaMentah) {
  const bersih = String(namaMentah || "")
    .trim()
    .replace(/[\/\\]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .trim();
  return bersih || "Folder";
}

/**
 * Membuat objek Error terstruktur untuk galat Google Drive API.
 * @param {number} status
 * @param {string} pesanAsli
 * @param {string} alasanKode
 */
function buatErrorDrive(status, pesanAsli, alasanKode = "") {
  let pesan = "Terjadi kesalahan saat berkomunikasi dengan Google Drive.";
  const rawLower = String(pesanAsli || "").toLowerCase();
  const reasonLower = String(alasanKode || "").toLowerCase();

  if (!navigator.onLine) {
    pesan = "Tidak ada koneksi internet. Operasi Google Drive memerlukan sambungan aktif.";
  } else if (status === 401) {
    pesan = "Sesi akses Google Drive telah kedaluwarsa atau tidak sah. Tekan tombol \"Masuk ulang\" untuk memperbarui sesi.";
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("drive api has not been used") ||
      rawLower.includes("is disabled")
    ) {
      pesan = "Google Drive API belum diaktifkan pada proyek Google Cloud / Firebase ini. Aktifkan \"Google Drive API\" di Google Cloud Console lalu coba lagi.";
    } else if (
      reasonLower.includes("insufficientfilepermissions") ||
      reasonLower.includes("forbidden") ||
      rawLower.includes("insufficient permissions") ||
      rawLower.includes("appnotauthorizedtofile")
    ) {
      pesan = "Akses ke berkas atau folder Google Drive ditolak (403). Aplikasi hanya dapat mengubah/memindahkan berkas yang dibuat melalui aplikasi ini.";
    } else if (reasonLower.includes("storagequotaexceeded") || rawLower.includes("storage quota")) {
      pesan = "Penyimpanan Google Drive Anda penuh (kuota terlampaui). Kosongkan ruang terlebih dahulu.";
    } else if (reasonLower.includes("ratelimitexceeded") || reasonLower.includes("userratelimitexceeded")) {
      pesan = "Batas laju permintaan Google Drive tercapai sementara (403). Tunggu beberapa detik lalu coba kembali.";
    } else {
      pesan = `Permintaan ditolak oleh Google Drive (403)${pesanAsli ? `: ${pesanAsli}` : "."}`;
    }
  } else if (status === 404) {
    pesan = "Berkas atau folder tidak ditemukan di Google Drive (404). Mungkin sudah dihapus secara permanen atau aksesnya dicabut.";
  } else if (status === 429) {
    pesan = "Terlalu banyak permintaan ke Google Drive dalam waktu singkat. Coba lagi sesaat lagi.";
  } else if (pesanAsli) {
    pesan = `Kendala Google Drive (${status}): ${pesanAsli}`;
  }

  const err = new Error(pesan);
  err.status = status;
  err.reason = alasanKode;
  err.isNotFound = status === 404;
  err.isForbidden = status === 403;
  err.isUnauthorized = status === 401;
  err.isTokenExpired = status === 401;
  return err;
}

/**
 * Menerjemahkan sembarang galat operasi Drive / jaringan / Firestore ke pesan jelas (Aturan #10).
 * @param {unknown} err
 * @returns {string}
 */
export function formatPesanGalatDrive(err) {
  if (!navigator.onLine) {
    return "Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.";
  }
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return formatPesanGalatFirestore(err);
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Terjadi kesalahan saat memproses berkas di Google Drive.";
}

/**
 * Memastikan token akses Google Drive tersedia dan belum kedaluwarsa.
 * @returns {string}
 */
function ambilTokenWajib() {
  if (!navigator.onLine) {
    const errOffline = new Error("Tidak ada koneksi internet. Sambungkan perangkat Anda terlebih dahulu.");
    errOffline.isOffline = true;
    throw errOffline;
  }
  if (isDriveTokenExpired()) {
    const err = new Error(
      "Sesi akses Google Drive telah kedaluwarsa (lebih dari 50 menit) atau belum tersedia. Silakan klik tombol \"Masuk ulang\"."
    );
    err.isTokenExpired = true;
    err.isUnauthorized = true;
    err.status = 401;
    throw err;
  }
  const token = getDriveAccessToken();
  if (!token) {
    const err = new Error(
      "Token akses Google Drive tidak tersedia. Silakan klik tombol \"Masuk ulang\" untuk memperbarui izin Drive."
    );
    err.isTokenExpired = true;
    err.isUnauthorized = true;
    err.status = 401;
    throw err;
  }
  return token;
}

/**
 * Mengurai respons gagal dari Google Drive REST API.
 * @param {Response} resp
 */
async function uraiResponsGalatDrive(resp) {
  let pesanAsli = "";
  let alasanKode = "";
  try {
    const data = await resp.json();
    if (data && typeof data === "object" && data.error) {
      pesanAsli = String(data.error.message || "");
      if (Array.isArray(data.error.errors) && data.error.errors.length > 0) {
        alasanKode = String(data.error.errors[0].reason || "");
      }
    }
  } catch (_e) {
    try {
      pesanAsli = await resp.text();
    } catch (_e2) {
      pesanAsli = "";
    }
  }
  return buatErrorDrive(resp.status, pesanAsli, alasanKode);
}

/**
 * Pemanggilan standar JSON ke endpoint Google Drive API v3.
 * @param {string} url
 * @param {RequestInit} [opsi]
 */
async function panggilDriveJson(url, opsi = {}) {
  const token = ambilTokenWajib();
  const headers = new Headers(opsi.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opsi.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
  }

  let resp;
  try {
    resp = await fetch(url, {
      ...opsi,
      headers
    });
  } catch (_netErr) {
    throw new Error("Gagal menghubungi server Google Drive. Periksa koneksi internet Anda.");
  }

  if (!resp.ok) {
    throw await uraiResponsGalatDrive(resp);
  }

  if (resp.status === 204) {
    return null;
  }

  const teks = await resp.text();
  if (!teks) return null;
  return JSON.parse(teks);
}

/**
 * Membaca dokumen pengaturan/drive dari Firestore.
 */
export async function ambilPengaturanDriveFirestore() {
  const db = getFirestoreDb();
  const ref = doc(db, "pengaturan", "drive");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  const d = snap.data() || {};
  return {
    rootFolderId: String(d.rootFolderId || "").trim(),
    uncategorizedFolderId: String(d.uncategorizedFolderId || "").trim(),
    updatedAt: String(d.updatedAt || "")
  };
}

/**
 * Menyimpan perubahan ID folder ke koleksi "pengaturan" dokumen "drive" (tanpa menyimpan token!).
 * @param {Record<string, unknown>} dataParsial
 */
async function simpanPengaturanDriveFirestore(dataParsial) {
  const db = getFirestoreDb();
  const ref = doc(db, "pengaturan", "drive");
  await setDoc(
    ref,
    {
      ...dataParsial,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

/**
 * Memeriksa metadata folder/file berdasarkan ID dan memastikan belum dibuang ke sampah.
 * @param {string} fileId
 * @returns {Promise<{id: string, name: string, mimeType: string, trashed: boolean, parents?: string[], webViewLink?: string, size?: string}>}
 */
export async function ambilMetadataItemDrive(fileId) {
  const idBersih = String(fileId || "").trim();
  if (!idBersih) {
    const err = new Error("ID berkas atau folder Drive kosong.");
    err.status = 404;
    err.isNotFound = true;
    throw err;
  }
  const params = new URLSearchParams({
    fields: "id,name,mimeType,trashed,parents,webViewLink,size"
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "GET"
  });
}

/**
 * Membuat folder baru di Google Drive.
 * @param {string} namaFolder
 * @param {string | null} [parentFolderId]
 * @returns {Promise<{id: string, name: string}>}
 */
export async function buatFolderDrive(namaFolder, parentFolderId = null) {
  const namaBersih = bersihkanNamaFolderDrive(namaFolder);
  const body = {
    name: namaBersih,
    mimeType: MIME_TYPE_FOLDER_DRIVE
  };
  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const params = new URLSearchParams({
    fields: "id,name,mimeType"
  });

  return panggilDriveJson(`${DRIVE_FILES_API}?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/**
 * Mencari folder induk "Agenda-Arsip" berdasarkan nama HANYA SEKALI jika belum ada ID-nya
 * di koleksi pengaturan/drive.
 * @returns {Promise<string | null>}
 */
async function cariFolderIndukSekali() {
  const q = `mimeType = '${MIME_TYPE_FOLDER_DRIVE}' and name = '${NAMA_FOLDER_INDUK}' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,createdTime)",
    pageSize: "5",
    spaces: "drive"
  });
  const data = await panggilDriveJson(`${DRIVE_FILES_API}?${params.toString()}`, {
    method: "GET"
  });
  const daftar = Array.isArray(data?.files) ? data.files : [];
  return daftar.length > 0 && daftar[0].id ? String(daftar[0].id) : null;
}

/**
 * Memastikan folder induk "Agenda-Arsip" siap dipakai:
 * 1. Baca ID dari koleksi "pengaturan" dokumen "drive".
 * 2. Jika sudah ada ID, verifikasi lewat ID (apabila 404 atau trashed, buat baru lalu perbarui ID).
 * 3. Jika belum pernah ada ID di pengaturan/drive, cari sekali berdasarkan nama "Agenda-Arsip",
 *    buat bila tidak ditemukan, simpan ID-nya di pengaturan/drive, dan pakai ID itu seterusnya.
 * @returns {Promise<string>}
 */
export async function pastikanFolderIndukDrive() {
  if (cacheRootFolderId) {
    try {
      const meta = await ambilMetadataItemDrive(cacheRootFolderId);
      if (meta && !meta.trashed) {
        return cacheRootFolderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
      cacheRootFolderId = null;
    }
  }

  if (janjiPastikanInduk) {
    return janjiPastikanInduk;
  }

  janjiPastikanInduk = (async () => {
    const pengaturan = await ambilPengaturanDriveFirestore();
    const tersimpanId = pengaturan?.rootFolderId || "";

    if (tersimpanId) {
      try {
        const meta = await ambilMetadataItemDrive(tersimpanId);
        if (meta && !meta.trashed) {
          cacheRootFolderId = tersimpanId;
          return tersimpanId;
        }
      } catch (err) {
        if (!err || !err.isNotFound) {
          throw err;
        }
      }

      // ID tercatat sebelumnya ternyata sudah dihapus (404 / trashed) -> buat folder induk baru memakai ID baru
      const folderBaru = await buatFolderDrive(NAMA_FOLDER_INDUK, null);
      cacheRootFolderId = folderBaru.id;
      cacheUncategorizedFolderId = null;
      await simpanPengaturanDriveFirestore({
        rootFolderId: folderBaru.id,
        uncategorizedFolderId: ""
      });
      return folderBaru.id;
    }

    // Belum pernah tercatat di pengaturan/drive: cari berdasarkan nama sekali saja
    let ditemukanId = await cariFolderIndukSekali();
    if (!ditemukanId) {
      const dibuat = await buatFolderDrive(NAMA_FOLDER_INDUK, null);
      ditemukanId = dibuat.id;
    }

    cacheRootFolderId = ditemukanId;
    await simpanPengaturanDriveFirestore({
      rootFolderId: ditemukanId
    });
    return ditemukanId;
  })();

  try {
    return await janjiPastikanInduk;
  } finally {
    janjiPastikanInduk = null;
  }
}

/**
 * Memastikan subfolder "Tanpa Kategori" tersedia di dalam folder induk "Agenda-Arsip"
 * dan ID-nya disimpan pada pengaturan/drive (uncategorizedFolderId).
 * @returns {Promise<string>}
 */
export async function pastikanFolderTanpaKategoriDrive() {
  const rootId = await pastikanFolderIndukDrive();

  if (cacheUncategorizedFolderId) {
    try {
      const meta = await ambilMetadataItemDrive(cacheUncategorizedFolderId);
      if (meta && !meta.trashed) {
        return cacheUncategorizedFolderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
      cacheUncategorizedFolderId = null;
    }
  }

  if (janjiPastikanTanpaKategori) {
    return janjiPastikanTanpaKategori;
  }

  janjiPastikanTanpaKategori = (async () => {
    const pengaturan = await ambilPengaturanDriveFirestore();
    const tersimpanId = pengaturan?.uncategorizedFolderId || "";

    if (tersimpanId) {
      try {
        const meta = await ambilMetadataItemDrive(tersimpanId);
        if (meta && !meta.trashed) {
          cacheUncategorizedFolderId = tersimpanId;
          return tersimpanId;
        }
      } catch (err) {
        if (!err || !err.isNotFound) {
          throw err;
        }
      }
    }

    const dibuat = await buatFolderDrive(NAMA_FOLDER_TANPA_KATEGORI, rootId);
    cacheUncategorizedFolderId = dibuat.id;
    await simpanPengaturanDriveFirestore({
      rootFolderId: rootId,
      uncategorizedFolderId: dibuat.id
    });
    return dibuat.id;
  })();

  try {
    return await janjiPastikanTanpaKategori;
  } finally {
    janjiPastikanTanpaKategori = null;
  }
}

/**
 * Membuat subfolder kategori dokumen di bawah folder induk "Agenda-Arsip".
 * @param {string} namaKategori
 * @returns {Promise<{folderId: string, rootFolderId: string, namaBersih: string}>}
 */
export async function buatSubfolderKategoriDrive(namaKategori) {
  const rootFolderId = await pastikanFolderIndukDrive();
  const namaBersih = bersihkanNamaFolderDrive(namaKategori);
  const folder = await buatFolderDrive(namaBersih, rootFolderId);
  return {
    folderId: folder.id,
    rootFolderId,
    namaBersih
  };
}

/**
 * Mengganti nama folder kategori di Google Drive memakai PATCH /drive/v3/files/{folderId}.
 * Jika folder sudah berada di sampah Drive (trashed=true), perlakukan sama seperti 404.
 * @param {string} folderId
 * @param {string} namaBaru
 */
export async function gantiNamaFolderDrive(folderId, namaBaru) {
  const idBersih = String(folderId || "").trim();
  if (!idBersih) {
    throw buatErrorDrive(404, "Folder kategori belum memiliki ID di Google Drive.", "notFound");
  }

  const meta = await ambilMetadataItemDrive(idBersih);
  if (meta?.trashed) {
    throw buatErrorDrive(404, "Folder kategori berada di Sampah Google Drive.", "notFound");
  }

  const namaBersih = bersihkanNamaFolderDrive(namaBaru);
  const params = new URLSearchParams({
    fields: "id,name,trashed"
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ name: namaBersih })
  });
}

/**
 * Memindahkan file atau folder ke Sampah Google Drive (trashed = true).
 * @param {string} itemId
 */
export async function pindahkanItemKeSampahDrive(itemId) {
  const idBersih = String(itemId || "").trim();
  if (!idBersih) {
    throw new Error("ID item Google Drive tidak ditemukan.");
  }
  const params = new URLSearchParams({
    fields: "id,trashed"
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true })
  });
}

/**
 * Memindahkan berkas Drive ke folder tujuan berdasarkan ID:
 * 1. GET parents berkas saat ini.
 * 2. Jika sudah berada tepat di folder tujuan saja, kembalikan status "skipped" (idempotent).
 * 3. PATCH dengan addParents=targetFolderId dan removeParents=parentsLama.
 * @param {string} driveFileId
 * @param {string} targetFolderId
 * @returns {Promise<{status: "moved" | "skipped", parentsSebelumnya: string[]}>}
 */
export async function pindahkanBerkasKeFolderDrive(driveFileId, targetFolderId) {
  const fileId = String(driveFileId || "").trim();
  const tujuanId = String(targetFolderId || "").trim();
  if (!fileId || !tujuanId) {
    throw new Error("ID berkas atau folder tujuan Google Drive tidak lengkap.");
  }

  const info = await ambilMetadataItemDrive(fileId);
  if (info?.trashed) {
    throw buatErrorDrive(404, "Berkas berada di Sampah Google Drive.", "notFound");
  }

  const parentsLama = Array.isArray(info?.parents) ? info.parents.filter(Boolean) : [];
  const sudahDiTujuan = parentsLama.includes(tujuanId) && parentsLama.length === 1;
  if (sudahDiTujuan) {
    return { status: "skipped", parentsSebelumnya: parentsLama };
  }

  const removeParents = parentsLama.filter((p) => p !== tujuanId).join(",");
  const params = new URLSearchParams({
    addParents: tujuanId,
    fields: "id,parents,webViewLink"
  });
  if (removeParents) {
    params.set("removeParents", removeParents);
  }

  await panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({})
  });

  return { status: "moved", parentsSebelumnya: parentsLama };
}

/**
 * Mengunggah berkas ke Google Drive menggunakan uploadType=multipart sederhana (untuk berkas <= 5 MB),
 * dilengkapi laporan progres (0-100%) dan dukungan pembatalan (abort).
 * @param {{
 *   file: File,
 *   folderId: string,
 *   namaSimpanDrive?: string,
 *   onProgress?: (persen: number, terunggah: number, total: number, infoDetail?: Record<string, unknown>) => void
 * }} konfigurasi
 * @returns {{ promise: Promise<{id: string, name: string, mimeType: string, size: number, webViewLink: string}>, abort: () => void }}
 */
function unggahBerkasMultipartSederhana(konfigurasi) {
  const { file, folderId, namaSimpanDrive, onProgress } = konfigurasi;
  let xhrAktif = null;
  let dibatalkanManual = false;
  const waktuMulai = Date.now();

  const promise = new Promise((resolve, reject) => {
    let token;
    try {
      token = ambilTokenWajib();
    } catch (err) {
      reject(err);
      return;
    }

    if (!(file instanceof File)) {
      reject(new Error("Pilih berkas yang akan diunggah terlebih dahulu."));
      return;
    }

    const folderTujuan = String(folderId || "").trim();
    if (!folderTujuan) {
      reject(new Error("Folder kategori tujuan di Google Drive belum siap."));
      return;
    }

    const mimeAsli = file.type || "application/octet-stream";
    const namaFinal = String(namaSimpanDrive || file.name || "Dokumen").trim() || "Dokumen";
    const metadata = {
      name: namaFinal,
      parents: [folderTujuan]
    };

    const boundary = `-------AgendaArsipBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const bagianPembuka =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeAsli}\r\n\r\n`;
    const bagianPenutup = `\r\n--${boundary}--`;

    const bodyMultipart = new Blob([bagianPembuka, file, bagianPenutup], {
      type: `multipart/related; boundary=${boundary}`
    });

    const params = new URLSearchParams({
      uploadType: "multipart",
      fields: "id,name,mimeType,size,webViewLink"
    });

    const xhr = new XMLHttpRequest();
    xhrAktif = xhr;
    xhr.open("POST", `${DRIVE_UPLOAD_API}?${params.toString()}`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);

    xhr.upload.addEventListener("progress", (evt) => {
      if (!evt.lengthComputable || typeof onProgress !== "function") return;
      const persen = evt.total > 0 ? Math.min(99, Math.round((evt.loaded / evt.total) * 100)) : 0;
      const durasiDetik = Math.max(0.1, (Date.now() - waktuMulai) / 1000);
      const kecepatanBps = evt.loaded / durasiDetik;
      const sisaBytes = Math.max(0, evt.total - evt.loaded);
      const sisaDetik = kecepatanBps > 0 ? sisaBytes / kecepatanBps : 0;

      onProgress(persen, evt.loaded, evt.total, {
        kecepatanBps,
        sisaDetik,
        statusTeks: "Mengunggah berkas ke Google Drive...",
        sedangRetry: false
      });
    });

    xhr.addEventListener("abort", () => {
      const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
      errBatal.isAborted = true;
      reject(errBatal);
    });

    xhr.addEventListener("error", () => {
      if (dibatalkanManual) return;
      reject(
        new Error(
          !navigator.onLine
            ? "Koneksi internet terputus saat mengunggah berkas ke Google Drive."
            : "Gagal mengirim berkas ke Google Drive. Periksa jaringan Anda lalu coba lagi."
        )
      );
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const hasil = JSON.parse(xhr.responseText || "{}");
          const idDrive = String(hasil.id || "");
          const tautanDrive =
            String(hasil.webViewLink || "").trim() ||
            `https://drive.google.com/file/d/${encodeURIComponent(idDrive)}/view`;
          if (typeof onProgress === "function") {
            onProgress(100, file.size, file.size, {
              statusTeks: "Pengunggahan ke Google Drive selesai.",
              sedangRetry: false,
              sisaDetik: 0
            });
          }
          resolve({
            id: idDrive,
            name: String(hasil.name || namaFinal),
            mimeType: String(hasil.mimeType || mimeAsli),
            size: Number.isFinite(Number(hasil.size)) ? Number(hasil.size) : file.size,
            webViewLink: tautanDrive
          });
        } catch (_parseErr) {
          reject(new Error("Respons unggahan dari Google Drive tidak dapat dibaca."));
        }
        return;
      }

      let pesanAsli = "";
      let alasanKode = "";
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        if (parsed && parsed.error) {
          pesanAsli = String(parsed.error.message || "");
          if (Array.isArray(parsed.error.errors) && parsed.error.errors.length > 0) {
            alasanKode = String(parsed.error.errors[0].reason || "");
          }
        }
      } catch (_e) {
        pesanAsli = xhr.statusText || "";
      }
      reject(buatErrorDrive(xhr.status, pesanAsli, alasanKode));
    });

    xhr.send(bodyMultipart);
  });

  return {
    promise,
    abort: () => {
      dibatalkanManual = true;
      if (xhrAktif) {
        try {
          xhrAktif.abort();
        } catch (_e) {
          // Abaikan
        }
      }
    }
  };
}

/**
 * Mengunggah berkas ke Google Drive menggunakan mekanisme Resumable Upload (uploadType=resumable).
 * - Menginisiasi sesi dengan POST metadata untuk mendapatkan Location session URI.
 * - Mengirim berkas per potongan (2 MiB, kelipatan 256 KiB) dengan header Content-Range.
 * - Mendukung retry otomatis dengan exponential backoff untuk galat jaringan dan 5xx.
 * - Bila terjadi galat di tengah jalan, status ditanyakan ke Drive (Content-Range: bytes * / total)
 *   lalu melanjutkan dari offset byte terakhir yang berhasil diterima Google Drive.
 * - Mendukung pembatalan (abort) dengan membersihkan timer dan membatalkan request aktif.
 * - Menangani 401 (token kedaluwarsa) secara terstruktur.
 *
 * @param {{
 *   file: File,
 *   folderId: string,
 *   namaSimpanDrive?: string,
 *   onProgress?: (persen: number, terunggah: number, total: number, infoDetail?: {
 *     kecepatanBps?: number,
 *     sisaDetik?: number,
 *     statusTeks?: string,
 *     sedangRetry?: boolean,
 *     percobaanRetry?: number,
 *     maksPercobaanRetry?: number,
 *     potonganAktif?: number,
 *     totalPotongan?: number
 *   }) => void
 * }} konfigurasi
 * @returns {{ promise: Promise<{id: string, name: string, mimeType: string, size: number, webViewLink: string}>, abort: () => void }}
 */
export function unggahBerkasResumableKeDrive(konfigurasi) {
  const { file, folderId, namaSimpanDrive, onProgress } = konfigurasi;

  let xhrAktif = null;
  let timerRetry = null;
  let listenerOnline = null;
  let dibatalkanManual = false;
  let sessionUrl = null;

  const promise = new Promise(async (resolve, reject) => {
    let token;
    try {
      token = ambilTokenWajib();
    } catch (err) {
      reject(err);
      return;
    }

    if (!(file instanceof File)) {
      reject(new Error("Pilih berkas yang akan diunggah terlebih dahulu."));
      return;
    }

    const folderTujuan = String(folderId || "").trim();
    if (!folderTujuan) {
      reject(new Error("Folder kategori tujuan di Google Drive belum siap."));
      return;
    }

    const totalBytes = file.size;
    const mimeAsli = file.type || "application/octet-stream";
    const namaFinal = String(namaSimpanDrive || file.name || "Dokumen").trim() || "Dokumen";
    const totalPotongan = Math.max(1, Math.ceil(totalBytes / UKURAN_POTONGAN_RESUMABLE_BYTES));
    const waktuMulai = Date.now();

    const jedaPromise = (ms) =>
      new Promise((res) => {
        timerRetry = window.setTimeout(() => {
          timerRetry = null;
          res();
        }, ms);
      });

    const laporProgres = (persen, terunggah, infoEkstra = {}) => {
      if (typeof onProgress !== "function" || dibatalkanManual) return;
      const durasiDetik = Math.max(0.1, (Date.now() - waktuMulai) / 1000);
      const kecepatanBps = terunggah > 0 ? terunggah / durasiDetik : 0;
      const sisaBytes = Math.max(0, totalBytes - terunggah);
      const sisaDetik = kecepatanBps > 0 ? sisaBytes / kecepatanBps : 0;
      const potonganKe = Math.min(
        totalPotongan,
        Math.floor(terunggah / UKURAN_POTONGAN_RESUMABLE_BYTES) + 1
      );

      onProgress(persen, terunggah, totalBytes, {
        kecepatanBps,
        sisaDetik,
        statusTeks: infoEkstra.statusTeks || `Mengunggah potongan ${potonganKe} dari ${totalPotongan}...`,
        sedangRetry: Boolean(infoEkstra.sedangRetry),
        percobaanRetry: infoEkstra.percobaanRetry || 0,
        maksPercobaanRetry: MAKS_PERCOBAAN_RETRY,
        potonganAktif: potonganKe,
        totalPotongan,
        ...infoEkstra
      });
    };

    /**
     * Langkah 1: Inisiasi sesi upload resumable (POST)
     * Mengembalikan URI session upload dari header Location.
     */
    async function inisiasiSesiResumable() {
      let percobaan = 0;
      while (percobaan < MAKS_PERCOBAAN_RETRY) {
        if (dibatalkanManual) {
          const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
          errBatal.isAborted = true;
          throw errBatal;
        }

        try {
          // Selalu pastikan token masih valid sebelum inisiasi sesi
          token = ambilTokenWajib();
        } catch (errAuth) {
          throw errAuth;
        }

        try {
          const params = new URLSearchParams({
            uploadType: "resumable",
            fields: "id,name,mimeType,size,webViewLink"
          });
          const metadata = {
            name: namaFinal,
            parents: [folderTujuan]
          };

          const hasilLocation = await new Promise((res, rej) => {
            const xhr = new XMLHttpRequest();
            xhrAktif = xhr;
            xhr.open("POST", `${DRIVE_UPLOAD_API}?${params.toString()}`, true);
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
            xhr.setRequestHeader("X-Upload-Content-Type", mimeAsli);
            xhr.setRequestHeader("X-Upload-Content-Length", String(totalBytes));

            xhr.addEventListener("abort", () => {
              const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
              errBatal.isAborted = true;
              rej(errBatal);
            });

            xhr.addEventListener("error", () => {
              rej(new Error(!navigator.onLine ? "Tidak ada koneksi internet." : "Gagal inisiasi sesi unggah."));
            });

            xhr.addEventListener("load", () => {
              if (xhr.status === 200) {
                const loc = xhr.getResponseHeader("Location") || xhr.getResponseHeader("location");
                if (loc) {
                  res(loc);
                } else {
                  rej(new Error("Google Drive tidak mengembalikan header Location untuk sesi resumable."));
                }
                return;
              }

              let pesanAsli = "";
              let alasanKode = "";
              try {
                const parsed = JSON.parse(xhr.responseText || "{}");
                if (parsed?.error) {
                  pesanAsli = String(parsed.error.message || "");
                  if (Array.isArray(parsed.error.errors) && parsed.error.errors.length > 0) {
                    alasanKode = String(parsed.error.errors[0].reason || "");
                  }
                }
              } catch (_e) {
                pesanAsli = xhr.statusText || "";
              }
              rej(buatErrorDrive(xhr.status, pesanAsli, alasanKode));
            });

            xhr.send(JSON.stringify(metadata));
          });

          xhrAktif = null;
          return hasilLocation;
        } catch (errInit) {
          xhrAktif = null;
          if (dibatalkanManual || errInit.isAborted) throw errInit;
          if (errInit.isTokenExpired || errInit.isUnauthorized || errInit.status === 401) {
            throw errInit;
          }

          percobaan += 1;
          if (percobaan >= MAKS_PERCOBAAN_RETRY) {
            throw errInit;
          }

          laporProgres(0, 0, {
            statusTeks: "Mencoba menyambung ulang...",
            sedangRetry: true,
            percobaanRetry: percobaan
          });

          const jedaMs =
            Math.min(30000, JEDA_RETRY_DASAR_MS * Math.pow(2, percobaan - 1)) +
            Math.round(Math.random() * 400);
          await jedaPromise(jedaMs);
        }
      }

      throw new Error("Gagal menginisiasi sesi unggah Google Drive setelah beberapa kali percobaan.");
    }

    /**
     * Langkah 2: Menanyakan status byte terakhir yang telah diterima Google Drive
     * Menggunakan PUT Content-Range: bytes * / totalBytes.
     */
    async function queryStatusByteDrive(urlSesi) {
      return new Promise((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhrAktif = xhr;
        xhr.open("PUT", urlSesi, true);
        xhr.setRequestHeader("Content-Range", `bytes */${totalBytes}`);

        xhr.addEventListener("abort", () => {
          const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
          errBatal.isAborted = true;
          rej(errBatal);
        });

        xhr.addEventListener("error", () => {
          rej(new Error(!navigator.onLine ? "Tidak ada koneksi internet." : "Gagal memeriksa status unggah di Drive."));
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 308) {
            const rangeStr = xhr.getResponseHeader("Range") || xhr.getResponseHeader("range");
            if (rangeStr) {
              const cocok = rangeStr.match(/bytes=0-(\d+)/i);
              if (cocok && cocok[1]) {
                res({ selesai: false, offsetBerikutnya: parseInt(cocok[1], 10) + 1 });
                return;
              }
            }
            // Status 308 tanpa Range berarti belum ada byte tersimpan di Drive
            res({ selesai: false, offsetBerikutnya: 0 });
            return;
          }

          if (xhr.status === 200 || xhr.status === 201) {
            // Berkas ternyata sudah selesai terunggah sepenuhnya!
            try {
              const hasil = JSON.parse(xhr.responseText || "{}");
              res({ selesai: true, hasil });
            } catch (_e) {
              res({ selesai: true, hasil: {} });
            }
            return;
          }

          if (xhr.status === 401) {
            rej(buatErrorDrive(401, "Sesi akses Google Drive telah kedaluwarsa. Silakan masuk ulang."));
            return;
          }

          if (xhr.status === 404 || xhr.status === 410) {
            rej(buatErrorDrive(xhr.status, "Sesi unggah Drive telah kedaluwarsa atau tidak valid.", "uploadSessionExpired"));
            return;
          }

          rej(buatErrorDrive(xhr.status, xhr.statusText || "Status Drive tidak terduga saat query offset."));
        });

        xhr.send();
      });
    }

    /**
     * Langkah 3: Mengirim satu potongan (chunk) ke Google Drive
     */
    function kirimSatuPotongan(urlSesi, offsetMulai, offsetAkhir) {
      return new Promise((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhrAktif = xhr;
        xhr.open("PUT", urlSesi, true);

        const rangeStr = `bytes ${offsetMulai}-${offsetAkhir - 1}/${totalBytes}`;
        xhr.setRequestHeader("Content-Range", rangeStr);
        xhr.setRequestHeader("Content-Type", mimeAsli);

        xhr.upload.addEventListener("progress", (evt) => {
          if (!evt.lengthComputable || dibatalkanManual) return;
          const terunggahSaatIni = Math.min(totalBytes, offsetMulai + evt.loaded);
          const persen = totalBytes > 0 ? Math.min(99, Math.round((terunggahSaatIni / totalBytes) * 100)) : 0;
          laporProgres(persen, terunggahSaatIni, {
            statusTeks: `Mengunggah potongan (${Math.floor(offsetMulai / UKURAN_POTONGAN_RESUMABLE_BYTES) + 1}/${totalPotongan})...`
          });
        });

        xhr.addEventListener("abort", () => {
          const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
          errBatal.isAborted = true;
          rej(errBatal);
        });

        xhr.addEventListener("error", () => {
          rej(new Error(!navigator.onLine ? "Koneksi internet terputus saat mengunggah berkas." : "Gagal mengirim potongan berkas ke Google Drive."));
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 308) {
            const rangeStrRes = xhr.getResponseHeader("Range") || xhr.getResponseHeader("range");
            let nextOffset = offsetAkhir;
            if (rangeStrRes) {
              const cocok = rangeStrRes.match(/bytes=0-(\d+)/i);
              if (cocok && cocok[1]) {
                nextOffset = parseInt(cocok[1], 10) + 1;
              }
            }
            res({ status: 308, nextOffset });
            return;
          }

          if (xhr.status === 200 || xhr.status === 201) {
            try {
              const hasil = JSON.parse(xhr.responseText || "{}");
              res({ status: xhr.status, hasil });
            } catch (_pe) {
              res({ status: xhr.status, hasil: {} });
            }
            return;
          }

          if (xhr.status === 401) {
            rej(buatErrorDrive(401, "Sesi akses Google Drive telah kedaluwarsa. Silakan masuk ulang."));
            return;
          }

          let pesanAsli = "";
          let alasanKode = "";
          try {
            const parsed = JSON.parse(xhr.responseText || "{}");
            if (parsed?.error) {
              pesanAsli = String(parsed.error.message || "");
              if (Array.isArray(parsed.error.errors) && parsed.error.errors.length > 0) {
                alasanKode = String(parsed.error.errors[0].reason || "");
              }
            }
          } catch (_e) {
            pesanAsli = xhr.statusText || "";
          }
          rej(buatErrorDrive(xhr.status, pesanAsli, alasanKode));
        });

        const blobPotongan = file.slice(offsetMulai, offsetAkhir);
        xhr.send(blobPotongan);
      });
    }

    // Jalankan keseluruhan alur resumable
    try {
      laporProgres(0, 0, { statusTeks: "Menyiapkan sesi unggah ke Google Drive..." });
      sessionUrl = await inisiasiSesiResumable();

      let offset = 0;
      let percobaanRetryPotongan = 0;

      while (offset < totalBytes) {
        if (dibatalkanManual) {
          const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
          errBatal.isAborted = true;
          throw errBatal;
        }

        const akhirPotongan = Math.min(offset + UKURAN_POTONGAN_RESUMABLE_BYTES, totalBytes);

        try {
          const hasilPot = await kirimSatuPotongan(sessionUrl, offset, akhirPotongan);
          xhrAktif = null;
          percobaanRetryPotongan = 0;

          if (hasilPot.status === 308) {
            offset = hasilPot.nextOffset;
            const persen = totalBytes > 0 ? Math.min(99, Math.round((offset / totalBytes) * 100)) : 0;
            laporProgres(persen, offset);
            continue;
          }

          if (hasilPot.status === 200 || hasilPot.status === 201) {
            // Berhasil selesai!
            const idDrive = String(hasilPot.hasil?.id || "");
            const tautanDrive =
              String(hasilPot.hasil?.webViewLink || "").trim() ||
              `https://drive.google.com/file/d/${encodeURIComponent(idDrive)}/view`;

            laporProgres(100, totalBytes, {
              statusTeks: "Pengunggahan ke Google Drive selesai.",
              sedangRetry: false,
              sisaDetik: 0
            });

            resolve({
              id: idDrive,
              name: String(hasilPot.hasil?.name || namaFinal),
              mimeType: String(hasilPot.hasil?.mimeType || mimeAsli),
              size: Number.isFinite(Number(hasilPot.hasil?.size))
                ? Number(hasilPot.hasil?.size)
                : totalBytes,
              webViewLink: tautanDrive
            });
            return;
          }
        } catch (errPot) {
          xhrAktif = null;
          if (dibatalkanManual || errPot.isAborted) throw errPot;

          // Jika 401, jangan retry berulang; langsung laporkan untuk penanganan masuk ulang
          if (errPot.isTokenExpired || errPot.isUnauthorized || errPot.status === 401) {
            throw errPot;
          }

          percobaanRetryPotongan += 1;
          if (percobaanRetryPotongan > MAKS_PERCOBAAN_RETRY) {
            throw new Error(
              `Pengunggahan terhenti setelah ${MAKS_PERCOBAAN_RETRY} kali mencoba menyambung ulang. Periksa koneksi internet Anda lalu coba lagi.`
            );
          }

          laporProgres(
            totalBytes > 0 ? Math.min(99, Math.round((offset / totalBytes) * 100)) : 0,
            offset,
            {
              statusTeks: "Mencoba menyambung ulang...",
              sedangRetry: true,
              percobaanRetry: percobaanRetryPotongan
            }
          );

          // Exponential backoff dengan jitter
          const jedaMs =
            Math.min(30000, JEDA_RETRY_DASAR_MS * Math.pow(2, percobaanRetryPotongan - 1)) +
            Math.round(Math.random() * 400);
          await jedaPromise(jedaMs);

          // Tanyakan offset status ke Google Drive untuk melanjutkan dari titik sebenarnya
          try {
            const statusDrive = await queryStatusByteDrive(sessionUrl);
            xhrAktif = null;
            if (statusDrive.selesai) {
              const idDrive = String(statusDrive.hasil?.id || "");
              const tautanDrive =
                String(statusDrive.hasil?.webViewLink || "").trim() ||
                `https://drive.google.com/file/d/${encodeURIComponent(idDrive)}/view`;

              laporProgres(100, totalBytes, {
                statusTeks: "Pengunggahan ke Google Drive selesai.",
                sedangRetry: false,
                sisaDetik: 0
              });

              resolve({
                id: idDrive,
                name: String(statusDrive.hasil?.name || namaFinal),
                mimeType: String(statusDrive.hasil?.mimeType || mimeAsli),
                size: Number.isFinite(Number(statusDrive.hasil?.size))
                  ? Number(statusDrive.hasil?.size)
                  : totalBytes,
                webViewLink: tautanDrive
              });
              return;
            }

            offset = statusDrive.offsetBerikutnya;
            percobaanRetryPotongan = 0; // Berhasil tersambung kembali
          } catch (errStatus) {
            xhrAktif = null;
            if (dibatalkanManual || errStatus.isAborted) throw errStatus;
            if (errStatus.isTokenExpired || errStatus.isUnauthorized || errStatus.status === 401) {
              throw errStatus;
            }
            // Lanjut ke loop berikutnya untuk mencoba query / kirim kembali
          }
        }
      }
    } catch (errFatal) {
      if (timerRetry) {
        clearTimeout(timerRetry);
        timerRetry = null;
      }
      reject(errFatal);
    }
  });

  return {
    promise,
    abort: () => {
      dibatalkanManual = true;
      if (timerRetry) {
        clearTimeout(timerRetry);
        timerRetry = null;
      }
      if (listenerOnline) {
        window.removeEventListener("online", listenerOnline);
        listenerOnline = null;
      }
      if (xhrAktif) {
        try {
          xhrAktif.abort();
        } catch (_e) {
          // Abaikan
        }
        xhrAktif = null;
      }
      // Kirim DELETE sesi ke Google Drive bila URL sesi sudah terbentuk (fire-and-forget)
      if (sessionUrl) {
        try {
          const xhrBatal = new XMLHttpRequest();
          xhrBatal.open("DELETE", sessionUrl, true);
          xhrBatal.setRequestHeader("Content-Length", "0");
          xhrBatal.send();
        } catch (_eDel) {
          // Abaikan kendala saat membatalkan sesi
        }
      }
    }
  };
}

/**
 * Fungsi utama pengunggahan berkas ke Google Drive:
 * - Secara cerdas memilih multipart sederhana jika ukuran berkas <= 5 MB (AMBANG_UNGGAH_RESUMABLE_BYTES).
 * - Menggunakan resumable upload per potongan 2 MiB dengan retry otomatis jika ukuran berkas > 5 MB.
 * - Tetap mengekspor nama dan antarmuka return { promise, abort } yang identik untuk kompatibilitas penuh.
 *
 * @param {{
 *   file: File,
 *   folderId: string,
 *   namaSimpanDrive?: string,
 *   onProgress?: (persen: number, terunggah: number, total: number, infoDetail?: Record<string, unknown>) => void
 * }} konfigurasi
 * @returns {{ promise: Promise<{id: string, name: string, mimeType: string, size: number, webViewLink: string}>, abort: () => void }}
 */
export function unggahBerkasKeDrive(konfigurasi) {
  const { file } = konfigurasi || {};
  if (file instanceof File && file.size > AMBANG_UNGGAH_RESUMABLE_BYTES) {
    return unggahBerkasResumableKeDrive(konfigurasi);
  }
  return unggahBerkasMultipartSederhana(konfigurasi);
}

/**
 * Mempertahankan fungsi ekspor unggahBerkasMultipartKeDrive yang sudah dipakai modul lain (Aturan #2 & Tugas #2):
 * Jika berkas <= 5 MB, dijalankan via multipart sederhana.
 * Jika berkas > 5 MB, otomatis dialihkan ke mekanisme resumable upload yang andal.
 * Bentuk kembalian ({ promise, abort }) dan nama fungsi tetap 100% kompatibel.
 */
export function unggahBerkasMultipartKeDrive(konfigurasi) {
  return unggahBerkasKeDrive(konfigurasi);
}

/**
 * Fase 4: Membuat dokumen Google Docs baru di dalam folder induk "Agenda-Arsip"
 * dengan mengunggah HTML secara multipart untuk dikonversi otomatis oleh Google Drive API.
 * Meminta field id,name,webViewLink sesuai spesifikasi.
 * Jalur pembuatan ini tetap dipertahankan sesuai Aturan Tugas #2.
 * @param {{ judul: string, htmlKonten: string }} konfigurasi
 * @returns {Promise<{ id: string, name: string, webViewLink: string, parentFolderId: string }>}
 */
export async function buatDokumenGoogleDocsDrive(konfigurasi) {
  const token = ambilTokenWajib();
  const rootFolderId = await pastikanFolderIndukDrive();

  const namaBersih = String(konfigurasi?.judul || "").trim() || "Catatan Google Docs";
  const htmlIsi = String(konfigurasi?.htmlKonten || "");

  const metadata = {
    name: namaBersih,
    mimeType: MIME_TYPE_GOOGLE_DOCS,
    parents: [rootFolderId]
  };

  const boundary = `-------AgendaArsipGdocBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const bodyMultipart = new Blob(
    [
      `--${boundary}\r\n`,
      `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
      `${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\n`,
      `Content-Type: text/html; charset=UTF-8\r\n\r\n`,
      htmlIsi,
      `\r\n--${boundary}--`
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,webViewLink"
  });

  let resp;
  try {
    resp = await fetch(`${DRIVE_UPLOAD_API}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: bodyMultipart
    });
  } catch (_netErr) {
    throw new Error(
      !navigator.onLine
        ? "Tidak ada koneksi internet. Pembuatan dokumen Google Docs memerlukan sambungan aktif."
        : "Gagal menghubungi Google Drive saat membuat dokumen Google Docs. Periksa koneksi Anda."
    );
  }

  if (!resp.ok) {
    throw await uraiResponsGalatDrive(resp);
  }

  const hasil = await resp.json();
  const docId = String(hasil?.id || "").trim();
  if (!docId) {
    throw new Error("Google Drive tidak mengembalikan ID dokumen Google Docs yang dibuat.");
  }

  const tautan =
    String(hasil?.webViewLink || "").trim() ||
    `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`;

  return {
    id: docId,
    name: String(hasil?.name || namaBersih),
    webViewLink: tautan,
    parentFolderId: rootFolderId
  };
}
