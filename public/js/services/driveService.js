/**
 * Layanan Operasi Google Drive API v3 & Struktur Folder Kategori (Tahap 2c: dipindah dari js/drive.js)
 * - Seluruh operasi memakai ID (folderId, fileId).
 * - Tidak pernah menyimpan access token di storage / Firestore.
 * - Penanganan galat jelas: token kedaluwarsa, tidak ada koneksi, API belum aktif, 403/404 Google.
 * - Memperbarui token otomatis sebelum kedaluwarsa (lazy refresh via mintaTokenDrive di ambilTokenWajib).
 */
import { NAMA_FOLDER_INDUK, NAMA_FOLDER_TANPA_KATEGORI, NAMA_FOLDER_FOTO, MIME_TYPE_FOLDER_DRIVE, MIME_TYPE_GOOGLE_DOCS, AMBANG_UNGGAH_RESUMABLE_BYTES, UKURAN_POTONGAN_RESUMABLE_BYTES, MAKS_PERCOBAAN_RETRY, JEDA_RETRY_DASAR_MS, DRIVE_FILES_API, DRIVE_UPLOAD_API, KOLEKSI, DOK_PENGATURAN } from "../config/constants.js";
export { NAMA_FOLDER_INDUK, NAMA_FOLDER_TANPA_KATEGORI, MIME_TYPE_FOLDER_DRIVE, MIME_TYPE_GOOGLE_DOCS, AMBANG_UNGGAH_RESUMABLE_BYTES, UKURAN_POTONGAN_RESUMABLE_BYTES };
import {
  getFirestoreDb,
  doc,
  getDoc,
  setDoc,
  formatPesanGalatFirestore,
} from "./firestoreService.js";
import { getDriveAccessToken, isDriveTokenExpired, mintaTokenDrive } from "./authService.js";

let cacheRootFolderId = null;
let cacheUncategorizedFolderId = null;
let cacheFotoFolderId = null;
let janjiPastikanInduk = null;
let janjiPastikanTanpaKategori = null;

/**
 * Membersihkan cache ID folder Drive di memori saat pengguna keluar sesi.
 */
export function resetCacheDrive() {
  cacheRootFolderId = null;
  cacheUncategorizedFolderId = null;
  cacheFotoFolderId = null;
  resetCacheThumbnailDrive();
  janjiPastikanInduk = null;
  janjiPastikanTanpaKategori = null;
}

/**
 * Membersihkan nama folder sesuai spesifikasi:
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
    pesan = 'Sesi akses Google Drive telah kedaluwarsa atau tidak sah. Tekan tombol "Masuk ulang" untuk memperbarui sesi.';
  } else if (status === 403) {
    if (
      reasonLower.includes("accessnotconfigured") ||
      rawLower.includes("has not been used in project") ||
      rawLower.includes("drive api has not been used") ||
      rawLower.includes("is disabled")
    ) {
      pesan = 'Google Drive API belum diaktifkan pada proyek Google Cloud / Firebase ini. Aktifkan "Google Drive API" di Google Cloud Console lalu coba lagi.';
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
 * Menerjemahkan sembarang galat operasi Drive / jaringan / Firestore ke pesan jelas.
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
 * Dilengkapi lazy refresh otomatis via GIS (mintaTokenDrive({ senyap: true })) bila kedaluwarsa.
 * @returns {Promise<string>}
 */
export async function ambilTokenWajib() {
  if (!navigator.onLine) {
    const errOffline = new Error("Tidak ada koneksi internet. Sambungkan perangkat Anda terlebih dahulu.");
    errOffline.isOffline = true;
    throw errOffline;
  }

  // Jika kedaluwarsa atau belum ada token, coba perbarui secara senyap (lazy refresh)
  if (isDriveTokenExpired()) {
    try {
      const hasil = await mintaTokenDrive({ senyap: true });
      if (hasil?.token) {
        return hasil.token;
      }
    } catch (_errSilent) {
      // Jika permintaan senyap gagal (mis. belum pernah consent atau butuh interaksi)
      const err = new Error(
        'Sesi akses Google Drive telah kedaluwarsa atau belum aktif. Silakan klik tombol "Masuk ulang" untuk memberikan izin.'
      );
      err.isTokenExpired = true;
      err.isUnauthorized = true;
      err.status = 401;
      throw err;
    }
  }

  const token = getDriveAccessToken();
  if (!token) {
    const err = new Error(
      'Token akses Google Drive tidak tersedia. Silakan klik tombol "Masuk ulang" untuk memperbarui izin Drive.'
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
  const token = await ambilTokenWajib();
  const headers = new Headers(opsi.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opsi.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
  }

  let resp;
  try {
    resp = await fetch(url, {
      ...opsi,
      headers,
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
  const ref = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.DRIVE);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  const d = snap.data() || {};
  return {
    rootFolderId: String(d.rootFolderId || "").trim(),
    uncategorizedFolderId: String(d.uncategorizedFolderId || "").trim(),
    fotoFolderId: String(d.fotoFolderId || "").trim(),
    updatedAt: String(d.updatedAt || ""),
  };
}

/**
 * Menyimpan perubahan ID folder ke koleksi "pengaturan" dokumen "drive".
 * @param {Record<string, unknown>} dataParsial
 */
async function simpanPengaturanDriveFirestore(dataParsial) {
  const db = getFirestoreDb();
  const ref = doc(db, KOLEKSI.PENGATURAN, DOK_PENGATURAN.DRIVE);
  await setDoc(
    ref,
    {
      ...dataParsial,
      updatedAt: new Date().toISOString(),
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
    fields: "id,name,mimeType,trashed,parents,webViewLink,size",
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "GET",
  });
}

// --- Thumbnail foto via API (autentikasi token, aman untuk semua perangkat) ---

const cacheBlobUrlThumbnail = new Map();
const janjiThumbnail = new Map();
// Batas unduhan berkas asli sebagai cadangan thumbnail (15 MB).
const BATAS_UNDUH_THUMBNAIL_BYTES = 15 * 1024 * 1024;

/**
 * Mengunduh blob dari URL Drive dengan token. Mengembalikan null bila gagal
 * (kecuali lemparTetap=true, yang melempar galatnya).
 * @returns {Promise<Blob|null>}
 */
async function unduhBlobDrive(url, token, lemparTetap = false) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (_netErr) {
    if (lemparTetap) {
      throw new Error(!navigator.onLine
        ? "Tidak ada koneksi internet."
        : "Gagal menghubungi Google Drive.");
    }
    return null;
  }
  if (!resp.ok) {
    if (lemparTetap) {
      throw await uraiResponsGalatDrive(resp);
    }
    return null;
  }
  try {
    return await resp.blob();
  } catch (_err) {
    return null;
  }
}

function simpanBlobThumbnail(idBersih, blob) {
  const urlLokal = URL.createObjectURL(blob);
  cacheBlobUrlThumbnail.set(idBersih, urlLokal);
  return urlLokal;
}

/**
 * Mengambil thumbnail berkas foto lewat Drive API memakai token OAuth, lalu
 * mengembalikan blob URL lokal. Tidak bergantung pada cookie peramban, sehingga
 * tetap tampil di tablet/ponsel yang belum masuk akun Google. Hasil di-cache.
 * @param {string} fileId
 * @returns {Promise<string>} blob URL untuk src elemen <img>
 */
export async function ambilThumbnailFotoDrive(fileId) {
  const idBersih = String(fileId || "").trim();
  if (!idBersih) throw new Error("ID berkas foto kosong.");

  if (cacheBlobUrlThumbnail.has(idBersih)) {
    return cacheBlobUrlThumbnail.get(idBersih);
  }
  if (janjiThumbnail.has(idBersih)) {
    return janjiThumbnail.get(idBersih);
  }

  const janji = (async () => {
    // 1) Minta metadata ringkas: thumbnailLink, tipe, dan ukuran berkas.
    const params = new URLSearchParams({ fields: "thumbnailLink,mimeType,size" });
    const meta = await panggilDriveJson(
      `${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`,
      { method: "GET" }
    );

    const token = await ambilTokenWajib();

    // 2) Utamakan thumbnailLink (kecil & cepat). Host thumbnail Google tidak
    //    dijamin mengizinkan fetch lintas domain, sehingga kegagalannya perlu
    //    ditangani dengan cadangan.
    const tautanThumb = String(meta?.thumbnailLink || "").replace(/=s\d+(-[a-z]+)?$/i, "=w220");
    if (tautanThumb) {
      const blob = await unduhBlobDrive(tautAnThumb, token, false);
      if (blob) return simpanBlobThumbnail(idBersih, blob);
    }

    // 3) Cadangan: unduh berkas asli lewat googleapis.com (CORS & CSP diizinkan).
    //    Batasi ukuran agar tidak mengunduh berkas raksasa hanya untuk thumbnail.
    const ukuranBerkas = Number(meta?.size) || 0;
    if (ukuranBerkas > BATAS_UNDUH_THUMBNAIL_BYTES) {
      const err = new Error("Thumbnail tidak tersedia untuk berkas ini.");
      err.isThumbnailTidakTersedia = true;
      throw err;
    }
    const urlAsli = `${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?alt=media`;
    const blobAsli = await unduhBlobDrive(urlAsli, token, true);
    if (!blobAsli) {
      throw new Error("Gagal mengambil gambar dari Google Drive.");
    }
    return simpanBlobThumbnail(idBersih, blobAsli);
  })();

  janjiThumbnail.set(idBersih, janji);
  try {
    return await janji;
  } finally {
    janjiThumbnail.delete(idBersih);
  }
}

/**
 * Mengosongkan cache blob URL thumbnail (dipanggil saat keluar sesi).
 */
export function resetCacheThumbnailDrive() {
  cacheBlobUrlThumbnail.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (_err) {}
  });
  cacheBlobUrlThumbnail.clear();
  janjiThumbnail.clear();
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
    mimeType: MIME_TYPE_FOLDER_DRIVE,
  };
  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const params = new URLSearchParams({
    fields: "id,name,mimeType",
  });

  return panggilDriveJson(`${DRIVE_FILES_API}?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(body),
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
    spaces: "drive",
  });
  const data = await panggilDriveJson(`${DRIVE_FILES_API}?${params.toString()}`, {
    method: "GET",
  });
  const daftar = Array.isArray(data?.files) ? data.files : [];
  return daftar.length > 0 && daftar[0].id ? String(daftar[0].id) : null;
}

/**
 * Memastikan folder induk "Agenda-Arsip" siap dipakai.
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

      const folderBaru = await buatFolderDrive(NAMA_FOLDER_INDUK, null);
      cacheRootFolderId = folderBaru.id;
      cacheUncategorizedFolderId = null;
      await simpanPengaturanDriveFirestore({
        rootFolderId: folderBaru.id,
        uncategorizedFolderId: "",
      });
      return folderBaru.id;
    }

    let ditemukanId = await cariFolderIndukSekali();
    if (!ditemukanId) {
      const dibuat = await buatFolderDrive(NAMA_FOLDER_INDUK, null);
      ditemukanId = dibuat.id;
    }

    cacheRootFolderId = ditemukanId;
    await simpanPengaturanDriveFirestore({
      rootFolderId: ditemukanId,
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
 * Memastikan subfolder "Tanpa Kategori" tersedia di dalam folder induk "Agenda-Arsip".
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
      uncategorizedFolderId: dibuat.id,
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
 * Memastikan subfolder "Foto Kegiatan" tersedia di dalam folder induk "Agenda-Arsip".
 * @returns {Promise<string>}
 */
export async function pastikanFolderFotoDrive() {
  const rootId = await pastikanFolderIndukDrive();

  if (cacheFotoFolderId) {
    try {
      const meta = await ambilMetadataItemDrive(cacheFotoFolderId);
      if (meta && !meta.trashed) {
        return cacheFotoFolderId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
      cacheFotoFolderId = null;
    }
  }

  const pengaturan = await ambilPengaturanDriveFirestore();
  const tersimpanId = pengaturan?.fotoFolderId || "";

  if (tersimpanId) {
    try {
      const meta = await ambilMetadataItemDrive(tersimpanId);
      if (meta && !meta.trashed) {
        cacheFotoFolderId = tersimpanId;
        return tersimpanId;
      }
    } catch (err) {
      if (!err || !err.isNotFound) {
        throw err;
      }
    }
  }

  const dibuat = await buatFolderDrive(NAMA_FOLDER_FOTO, rootId);
  cacheFotoFolderId = dibuat.id;
  await simpanPengaturanDriveFirestore({
    rootFolderId: rootId,
    fotoFolderId: dibuat.id,
  });
  return dibuat.id;
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
    namaBersih,
  };
}

/**
 * Mengganti nama folder kategori di Google Drive memakai PATCH.
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
    fields: "id,name,trashed",
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ name: namaBersih }),
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
    fields: "id,trashed",
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
}

/**
 * Mengembalikan file atau folder dari Sampah Google Drive (trashed = false).
 * @param {string} itemId
 */
export async function pulihkanItemDariSampahDrive(itemId) {
  const idBersih = String(itemId || "").trim();
  if (!idBersih) {
    throw new Error("ID item Google Drive tidak ditemukan.");
  }
  const params = new URLSearchParams({
    fields: "id,trashed",
  });
  return panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(idBersih)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: false }),
  });
}

/**
 * Memindahkan berkas Drive ke folder tujuan berdasarkan ID.
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
    fields: "id,parents,webViewLink",
  });
  if (removeParents) {
    params.set("removeParents", removeParents);
  }

  await panggilDriveJson(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });

  return { status: "moved", parentsSebelumnya: parentsLama };
}

/**
 * Mengunggah berkas ke Google Drive menggunakan uploadType=multipart sederhana.
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

  const promise = (async () => {
    const token = await ambilTokenWajib();

    if (!(file instanceof File)) {
      throw new Error("Pilih berkas yang akan diunggah terlebih dahulu.");
    }

    const folderTujuan = String(folderId || "").trim();
    if (!folderTujuan) {
      throw new Error("Folder kategori tujuan di Google Drive belum siap.");
    }

    const mimeAsli = file.type || "application/octet-stream";
    const namaFinal = String(namaSimpanDrive || file.name || "Dokumen").trim() || "Dokumen";
    const metadata = {
      name: namaFinal,
      parents: [folderTujuan],
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
      type: `multipart/related; boundary=${boundary}`,
    });

    const params = new URLSearchParams({
      uploadType: "multipart",
      fields: "id,name,mimeType,size,webViewLink,thumbnailLink",
    });

    return new Promise((resolve, reject) => {
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
          sedangRetry: false,
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
                sisaDetik: 0,
              });
            }
            resolve({
              id: idDrive,
              name: String(hasil.name || namaFinal),
              mimeType: String(hasil.mimeType || mimeAsli),
              size: Number.isFinite(Number(hasil.size)) ? Number(hasil.size) : file.size,
              webViewLink: tautanDrive,
              thumbnailLink: String(hasil.thumbnailLink || ""),
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
  })();

  return {
    promise,
    abort: () => {
      dibatalkanManual = true;
      if (xhrAktif) {
        try {
          xhrAktif.abort();
        } catch (_e) {}
      }
    },
  };
}

/**
 * Mengunggah berkas ke Google Drive menggunakan mekanisme Resumable Upload.
 * @param {{
 *   file: File,
 *   folderId: string,
 *   namaSimpanDrive?: string,
 *   onProgress?: (persen: number, terunggah: number, total: number, infoDetail?: Record<string, unknown>) => void
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

  const promise = (async () => {
    let token = await ambilTokenWajib();

    if (!(file instanceof File)) {
      throw new Error("Pilih berkas yang akan diunggah terlebih dahulu.");
    }

    const folderTujuan = String(folderId || "").trim();
    if (!folderTujuan) {
      throw new Error("Folder kategori tujuan di Google Drive belum siap.");
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
        ...infoEkstra,
      });
    };

    async function inisiasiSesiResumable() {
      let percobaan = 0;
      while (percobaan < MAKS_PERCOBAAN_RETRY) {
        if (dibatalkanManual) {
          const errBatal = new Error("Pengunggahan dokumen dibatalkan.");
          errBatal.isAborted = true;
          throw errBatal;
        }

        token = await ambilTokenWajib();

        try {
          const params = new URLSearchParams({
            uploadType: "resumable",
            fields: "id,name,mimeType,size,webViewLink,thumbnailLink",
          });
          const metadata = {
            name: namaFinal,
            parents: [folderTujuan],
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
            percobaanRetry: percobaan,
          });

          const jedaMs =
            Math.min(30000, JEDA_RETRY_DASAR_MS * Math.pow(2, percobaan - 1)) +
            Math.round(Math.random() * 400);
          await jedaPromise(jedaMs);
        }
      }

      throw new Error("Gagal menginisiasi sesi unggah Google Drive setelah beberapa kali percobaan.");
    }

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
            res({ selesai: false, offsetBerikutnya: 0 });
            return;
          }

          if (xhr.status === 200 || xhr.status === 201) {
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
            statusTeks: `Mengunggah potongan (${Math.floor(offsetMulai / UKURAN_POTONGAN_RESUMABLE_BYTES) + 1}/${totalPotongan})...`,
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
            const idDrive = String(hasilPot.hasil?.id || "");
            const tautanDrive =
              String(hasilPot.hasil?.webViewLink || "").trim() ||
              `https://drive.google.com/file/d/${encodeURIComponent(idDrive)}/view`;

            laporProgres(100, totalBytes, {
              statusTeks: "Pengunggahan ke Google Drive selesai.",
              sedangRetry: false,
              sisaDetik: 0,
            });

            return {
              id: idDrive,
              name: String(hasilPot.hasil?.name || namaFinal),
              mimeType: String(hasilPot.hasil?.mimeType || mimeAsli),
              size: Number.isFinite(Number(hasilPot.hasil?.size))
                ? Number(hasilPot.hasil?.size)
                : totalBytes,
              webViewLink: tautanDrive,
              thumbnailLink: String(hasilPot.hasil?.thumbnailLink || ""),
            };
          }
        } catch (errPot) {
          xhrAktif = null;
          if (dibatalkanManual || errPot.isAborted) throw errPot;

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
              percobaanRetry: percobaanRetryPotongan,
            }
          );

          const jedaMs =
            Math.min(30000, JEDA_RETRY_DASAR_MS * Math.pow(2, percobaanRetryPotongan - 1)) +
            Math.round(Math.random() * 400);
          await jedaPromise(jedaMs);

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
                sisaDetik: 0,
              });

              return {
                id: idDrive,
                name: String(statusDrive.hasil?.name || namaFinal),
                mimeType: String(statusDrive.hasil?.mimeType || mimeAsli),
                size: Number.isFinite(Number(statusDrive.hasil?.size))
                  ? Number(statusDrive.hasil?.size)
                  : totalBytes,
                webViewLink: tautanDrive,
                thumbnailLink: String(statusDrive.hasil?.thumbnailLink || ""),
              };
            }

            offset = statusDrive.offsetBerikutnya;
            percobaanRetryPotongan = 0;
          } catch (errStatus) {
            xhrAktif = null;
            if (dibatalkanManual || errStatus.isAborted) throw errStatus;
            if (errStatus.isTokenExpired || errStatus.isUnauthorized || errStatus.status === 401) {
              throw errStatus;
            }
          }
        }
      }
    } catch (errFatal) {
      if (timerRetry) {
        clearTimeout(timerRetry);
        timerRetry = null;
      }
      throw errFatal;
    }
  })();

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
        } catch (_e) {}
        xhrAktif = null;
      }
      if (sessionUrl) {
        try {
          const xhrBatal = new XMLHttpRequest();
          xhrBatal.open("DELETE", sessionUrl, true);
          xhrBatal.setRequestHeader("Content-Length", "0");
          xhrBatal.send();
        } catch (_eDel) {}
      }
    },
  };
}

/**
 * Fungsi utama pengunggahan berkas ke Google Drive.
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

export function unggahBerkasMultipartKeDrive(konfigurasi) {
  return unggahBerkasKeDrive(konfigurasi);
}

/**
 * Fase 4: Membuat dokumen Google Docs baru di dalam folder induk "Agenda-Arsip".
 * @param {{ judul: string, htmlKonten: string }} konfigurasi
 * @returns {Promise<{ id: string, name: string, webViewLink: string, parentFolderId: string }>}
 */
export async function buatDokumenGoogleDocsDrive(konfigurasi) {
  const token = await ambilTokenWajib();
  const rootFolderId = await pastikanFolderIndukDrive();

  const namaBersih = String(konfigurasi?.judul || "").trim() || "Catatan Google Docs";
  const htmlIsi = String(konfigurasi?.htmlKonten || "");

  const metadata = {
    name: namaBersih,
    mimeType: MIME_TYPE_GOOGLE_DOCS,
    parents: [rootFolderId],
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
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,webViewLink",
  });

  let resp;
  try {
    resp = await fetch(`${DRIVE_UPLOAD_API}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyMultipart,
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
    parentFolderId: rootFolderId,
  };
}