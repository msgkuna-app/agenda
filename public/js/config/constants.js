/**
 * Konstanta aplikasi terpusat (Tahap 1). TANPA impor — aturan #4.
 * Berkas lain mengimpor dari sini; jangan menulis ulang literal yang sama di modul.
 */

// Identitas pemilik & OAuth (firestore.rules tetap memuat email pemilik sendiri; ubah keduanya bersamaan)
export const AUTHORIZED_EMAIL = "msgkuna.app@gmail.com";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
// Cakupan baca-saja untuk membaca metrik pemakaian Firestore (diminta terpisah dari Drive)
export const MONITORING_SCOPE = "https://www.googleapis.com/auth/monitoring.read";

// Endpoint API Google
export const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
export const DRIVE_ABOUT_API = "https://www.googleapis.com/drive/v3/about";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
export const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
export const MONITORING_TIMESERIES_API = "https://monitoring.googleapis.com/v3/projects";
// Halaman pemakaian Firestore di Firebase Console (cadangan manual untuk membandingkan angka)
export const URL_PEMAKAIAN_FIRESTORE_CONSOLE = "https://console.firebase.google.com/project/msgkuna-app-85dfb/firestore/usage";
// Halaman penagihan proyek di Google Cloud Console (diperlukan agar Cloud Monitoring API dapat dipakai)
export const URL_AKTIFKAN_PENAGIHAN = "https://console.cloud.google.com/billing/linkedaccount?project=msgkuna-app-85dfb";

// Google Drive: nama folder, MIME, unggah resumable
export const NAMA_FOLDER_INDUK = "Agenda-Arsip";
export const NAMA_FOLDER_TANPA_KATEGORI = "Tanpa Kategori";
export const NAMA_FOLDER_FOTO = "Foto Kegiatan";
export const MIME_TYPE_FOLDER_DRIVE = "application/vnd.google-apps.folder";
export const MIME_TYPE_GOOGLE_DOCS = "application/vnd.google-apps.document";
export const AMBANG_UNGGAH_RESUMABLE_BYTES = 5 * 1024 * 1024;
export const UKURAN_POTONGAN_RESUMABLE_BYTES = 2 * 1024 * 1024;
export const MAKS_PERCOBAAN_RETRY = 5;
export const JEDA_RETRY_DASAR_MS = 1000;
export const MAKS_UKURAN_BERKAS_MB = 100;
export const JEDA_RAPIKAN_MS = 280;

// Token Drive (hanya di memori)
export const MARGIN_KEDALUWARSA_MS = 2 * 60 * 1000;
export const INTERVAL_CEK_TOKEN_DRIVE_MS = 30 * 1000;
export const STORAGE_TOKEN_KEY_LAMA = "agenda_arsip_drive_token";
export const STORAGE_TOKEN_TS_KEY_LAMA = "agenda_arsip_drive_token_ts";

// Kunci localStorage / sessionStorage (boot-tema.js adalah skrip klasik: duplikat kunci tema & sidebar di sana WAJIB sama)
export const STORAGE_KEY_TEMA = "agenda_arsip_tema";
export const STORAGE_SIDEBAR_KEY = "agenda_arsip_sidebar";
export const KUNCI_STORAGE_TAMPILAN_HARI_INI = "agenda_arsip_dashboard_hari_ini";
export const KUNCI_TUNDA_UPDATE_SW = "agenda_arsip_update_ditunda";
export const KUNCI_STORAGE_CADANGAN_TERAKHIR = "agenda_arsip_cadangan_terakhir";
export const KUNCI_STORAGE_CADANGAN_INTERVAL = "agenda_arsip_cadangan_interval";
export const KUNCI_STORAGE_CADANGAN_TUNDA = "agenda_arsip_cadangan_tunda_sampai";
export const KUNCI_STORAGE_HARI_LIBUR = "agenda_arsip_hari_libur";
// Penanda bahwa izin baca metrik Cloud Monitoring sudah pernah diberikan (agar pemuatan berikutnya boleh senyap)
export const KUNCI_STORAGE_IZIN_MONITORING = "agenda_arsip_izin_monitoring";

// Ukuran halaman & batas operasi
export const UKURAN_HALAMAN_KEGIATAN = 50;
export const UKURAN_HALAMAN_CATATAN = 100;
export const UKURAN_HALAMAN_DOKUMEN = 100;
export const UKURAN_HALAMAN_FOTO = 200;
export const BATAS_OPERASI_BATCH = 500;
export const TIGA_PULUH_HARI_MS = 30 * 24 * 60 * 60 * 1000;
export const SATU_HARI_MS = 24 * 60 * 60 * 1000;
export const INTERVAL_CEK_UPDATE_SW_MS = 60 * 60 * 1000;

// Pencarian global
export const DEBOUNCE_DELAY_MS = 120;
export const BATAS_HASIL_PER_KELOMPOK = 5;
export const MAKS_PANJANG_CUPLIKAN = 90;

// Nilai domain
export const JENIS_CATATAN_SINGKAT = "singkat";
export const JENIS_CATATAN_GDOC = "gdoc";

export const DAFTAR_STATUS_KEGIATAN = Object.freeze(["Rencana", "Berjalan", "Selesai"]);

export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

// Nama koleksi & dokumen pengaturan Firestore (harus sama dengan firestore.rules)
export const KOLEKSI = Object.freeze({
  KEGIATAN: "kegiatan",
  KATEGORI_KEGIATAN: "kategoriKegiatan",
  DOKUMEN: "dokumen",
  KATEGORI_DOKUMEN: "kategoriDokumen",
  CATATAN: "catatan",
  LAPORAN: "laporan",
  PENGATURAN: "pengaturan",
  FOTO: "foto"
});
export const DOK_PENGATURAN = Object.freeze({
  CADANGAN: "cadangan",
  DRIVE: "drive",
  HARI_LIBUR: "hariLibur"
});

// Koleksi yang memakai hapus lunak (dihapusAt) beserta label tampilannya.
// Dipakai bersama oleh: pemeriksa migrasi di Pengaturan dan Tempat Sampah.
// Sejak Tahap D (v1.8.45) seluruh kueri daftar juga menyaring where("dihapusAt","==",null).
// Urutan di sini = urutan tampilan Tempat Sampah.
export const KOLEKSI_HAPUS_LUNAK = Object.freeze([
  Object.freeze({ key: KOLEKSI.KEGIATAN, label: "Kegiatan", satuan: "kegiatan" }),
  Object.freeze({ key: KOLEKSI.CATATAN, label: "Catatan", satuan: "catatan" }),
  Object.freeze({ key: KOLEKSI.DOKUMEN, label: "Dokumen", satuan: "dokumen" }),
  Object.freeze({ key: KOLEKSI.FOTO, label: "Foto", satuan: "foto" }),
  Object.freeze({ key: KOLEKSI.LAPORAN, label: "Laporan", satuan: "laporan" })
]);

// Versi cadangan bila sw.js tidak terbaca. WAJIB sama dengan VERSION di sw.js (skrip klasik, tidak bisa mengimpor).
export const VERSI_CADANGAN_SW = "agenda-arsip-v1.8.45";

// Batas paket gratis Firestore (Spark). Nilai teks dipakai pada kartu "Kapasitas Layanan"
// di Pengaturan; nilai angka dipakai untuk menghitung persentase pemakaian.
// Pemakaian sebenarnya dibaca lewat Google Cloud Monitoring API (services/monitoringService.js).
export const KUOTA_FIRESTORE_SPARK = Object.freeze({
  penyimpanan: "1 GiB",
  bacaPerHari: "50.000",
  tulisPerHari: "20.000",
  hapusPerHari: "20.000",
  keluarPerBulan: "10 GiB",
});
export const KUOTA_FIRESTORE_SPARK_ANGKA = Object.freeze({
  penyimpananByte: 1024 * 1024 * 1024,
  bacaPerHari: 50000,
  tulisPerHari: 20000,
  hapusPerHari: 20000,
});

// Metrik Cloud Monitoring untuk pemakaian Firestore (nama terverifikasi lewat uji API Explorer).
// Cadangan `_count` dipakai bila nama utama tidak mengembalikan data pada proyek tertentu.
export const METRIK_PEMAKAIAN_FIRESTORE = Object.freeze({
  baca: Object.freeze([
    "firestore.googleapis.com/document/read_ops_count",
    "firestore.googleapis.com/document/read_count",
  ]),
  tulis: Object.freeze([
    "firestore.googleapis.com/document/write_ops_count",
    "firestore.googleapis.com/document/write_count",
  ]),
  hapus: Object.freeze([
    "firestore.googleapis.com/document/delete_ops_count",
    "firestore.googleapis.com/document/delete_count",
  ]),
  penyimpanan: Object.freeze([
    "firestore.googleapis.com/storage/data_and_index_storage_bytes",
    "firestore.googleapis.com/storage/utilization",
  ]),
});

// Jendela & periode agregasi pembacaan metrik pemakaian Firestore
export const PERIODE_AGREGASI_PEMAKAIAN_DETIK = 3600;
// Zona waktu resmi perhitungan kuota harian Firestore (reset tengah malam waktu Pasifik)
export const ZONA_WAKTU_KUOTA_FIRESTORE = "America/Los_Angeles";
