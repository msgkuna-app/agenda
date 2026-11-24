# Panduan Proyek "Agenda & Arsip"

> Dokumen acuan operasional: struktur aplikasi, struktur database, pengaturan Firebase /
> Firestore / Google Cloud Console, serta langkah-langkah bila kepemilikan aplikasi
> dialihkan ke pemilik (akun Google) lain.
>
> Diperbarui: 2026-11-25 — versi aplikasi **v1.8.51**

---

## 1. Ringkasan

| Aspek | Keterangan |
|---|---|
| Nama aplikasi | Agenda & Arsip |
| Jenis | PWA satu pengguna (single-owner), tanpa backend sendiri |
| Domain | `https://msgkuna.web.app` |
| Teknologi | HTML + CSS + JavaScript ES Module murni — **tanpa bundler, tanpa framework** |
| Hosting | Firebase Hosting (site target `utama` → site `msgkuna`) |
| Database | Cloud Firestore (paket gratis Spark) |
| Berkas | Google Drive milik pemilik (scope `drive.file`) |
| Laporan | Google Sheets API v4 |
| Autentikasi | Firebase Authentication (Google) + Google Identity Services (token Drive) |
| Izin | Hanya **satu akun Google** yang boleh masuk; email & UID diperiksa dua lapis |
| Offline | Service worker (`public/sw.js`), precache daftar `APP_SHELL` |

Catatan: aplikasi **tidak memakai** Firebase Storage, Cloud Functions, Analytics, maupun
Google Calendar API. Kalender pada menu *Jadwal* dirender sendiri dari data kegiatan.

---

## 2. Struktur aplikasi

### 2.1 Struktur berkas

```
C:\agenda-arsip\
  firebase.json            konfigurasi Hosting (target, header, CSP) + Firestore rules/indexes
  firestore.rules          aturan keamanan Firestore (pemilik, validasi field)
  firestore.indexes.json   indeks komposit
  .firebaserc              proyek default + target hosting
  STRUKTUR.md              catatan refactoring & progres tahap (riwayat pengembangan)
  PANDUAN-PEMILIK.md       dokumen ini
  public\
    index.html             seluruh kerangka layar, section, dan modal (satu berkas)
    manifest.webmanifest   metadata PWA (nama, ikon, pintasan)
    sw.js                  service worker; VERSION + APP_SHELL
    css\style.css          seluruh gaya (termasuk tema terang/gelap)
    icons\                 7 berkas ikon (SVG + PNG 32/192/512/maskable/apple-touch)
    js\
      boot-tema.js         skrip klasik sinkron di <head> (anti kilasan tema)
      main.js              ENTRY POINT tunggal: orkestrasi, login, navigasi, langganan data
      config\
        constants.js       semua konstanta (email pemilik, scope, endpoint, kunci storage, kuota)
        firebase.js        firebaseConfig + OAuth Client ID  ← titik utama "ganti proyek"
      services\
        firestoreService.js  inisialisasi App/Auth/Firestore + pesan galat (tidak lagi me-re-export SDK)
        firestoreRepository.js  satu-satunya pemuat SDK Firestore + CRUD bermakna untuk semua modul
        authService.js       Firebase Auth + token GIS Drive (scope drive.file)
        driveService.js      seluruh Google Drive API v3 (folder, unggah, thumbnail, sampah)
        sheetsService.js     Google Sheets API v4 (pembuatan laporan)
        monitoringService.js Cloud Monitoring API v3 (pemakaian Firestore; dorman di paket Spark)
      shared\toast.js       notifikasi toast
      modules\
        dashboard\          state | view | controller | index
        kegiatan\           state | format | view | controller | index
        catatan\            state | format | view | controller | index
        dokumen\            state | format | folder | unggah-kegiatan | view | kegiatan-view | controller | index
        foto\               state | view | controller | index (menempel pada kartu kegiatan)
        laporan\            state | format | view | controller | index
        kategori\           format | state | view | controller | index
        sampah\             format | normalisasi | state | view | controller | index
        pengaturan\         state | view | controller | index
      jadwal.js             kalender bulanan + agenda (memakai view modul kegiatan/dokumen)
      pencarian-global.js   pencarian lintas koleksi (Ctrl+K, "/")
      sidebar.js            menu, drawer mobile, indikator koneksi header
      pwa.js                registrasi & pembaruan service worker
      hari-libur.js         data hari libur nasional/cuti bersama
      templat-dokumen.js    templat catatan Google Docs
      filter-panel.js       panel filter bersama
      timeline-harian.js    komponen timeline
      tema.js               penerapan skema warna
      util-html.js          escapeHtml, svgIkon, nama hari/bulan
      util-tanggal.js       parsing & format tanggal lokal
```

### 2.2 Lapisan dan aturan arsitektur

Arah dependensi **satu arah**:

```
modules/**/view.js  →  modules/**/controller.js  →  services/  →  config/
                                          ↘ shared/, util-*
```

Aturan yang wajib dipatuhi saat mengubah kode:

1. Hanya berkas di `services/` yang boleh memanggil Firebase, Drive, Sheets, atau GIS.
2. `config/` **tidak boleh** mengimpor modul lain (data murni saja).
3. `state.js` tidak menyentuh DOM; `view.js` tidak memanggil API; `controller.js` menyambung keduanya.
4. Satu berkas satu tanggung jawab — pedoman ±250 baris/berkas, ±40 baris/fungsi.
5. Tidak menambah variabel global baru.
6. Berkas baru **wajib** didaftarkan di `APP_SHELL` pada `public/sw.js`, lalu `VERSION`
   dinaikkan bersamaan dengan `VERSI_CADANGAN_SW` di `config/constants.js`.

### 2.3 Halaman (menu sidebar)

| ID section | Label | Isi |
|---|---|---|
| `dashboard` | Dashboard | ringkasan hari ini, jadwal mendatang, pintasan |
| `kegiatan` | Kegiatan | daftar kegiatan, foto & dokumen terkait, filter status/kategori |
| `jadwal` | Jadwal | kalender bulanan + agenda |
| `dokumen` | Dokumen | arsip dokumen Google Drive + kategori/folder |
| `catatan` | Catatan | catatan singkat + catatan Google Docs |
| `laporan` | Laporan | rekapitulasi + ekspor ke Google Sheets / CSV |
| `sampah` | Tempat Sampah | kegiatan/catatan/dokumen/foto/laporan terhapus, pulihkan sebelum 30 hari |
| `pengaturan` | Pengaturan | tema, status akun & Drive, sinkron folder, cadangan JSON, info aplikasi |

Menu didefinisikan di `public/js/sidebar.js` (`MENU_SECTIONS`). Urutan array menentukan
urutan menu dan section yang dibuat otomatis bila belum ada di `index.html`.

### 2.4 Pola modul fitur

Setiap modul mengikuti pola yang sama:

| Berkas | Peran |
|---|---|
| `state.js` | cache data, langganan realtime Firestore, operasi tulis. Tanpa DOM. Sejak v1.8.51 memanggil `services/firestoreRepository.js` (tidak lagi menyusun kueri SDK sendiri). |
| `format.js` | format tampilan (tanggal, ukuran, ikon jenis berkas) |
| `view.js` | perakitan HTML & pembacaan DOM. Tanpa API. |
| `controller.js` | event listener, delegasi klik, orkestrasi state ↔ view |
| `index.js` | pintu publik — **satu-satunya** berkas modul yang diimpor modul lain |

### 2.5 Alur muat aplikasi

1. `boot-tema.js` (sinkron) memasang tema & status sidebar sebelum CSS dirender.
2. `main.js` → `mulaiAplikasi()`: baca pintasan URL, `initTema()`, registrasi service worker.
3. Bila `isFirebaseConfigured()` gagal → layar `config-error` (panduan isi `firebase.js`).
4. `initAuth()` memantau status login Firebase; email ≠ `AUTHORIZED_EMAIL` → langsung dikeluarkan.
5. Setelah login: data dimuat (`subscribeKegiatan`, `subscribeCatatan`, `subscribeDokumen`, `subscribeFoto`, …),
   pengaturan dimuat, kapasitas Drive dibaca, lalu layar utama ditampilkan.
6. Token Drive tidak diminta otomatis kecuali izinnya sudah pernah diberikan (tanpa dialog mengagetkan).

---

## 3. Database — Cloud Firestore

Proyek: `msgkuna-app-85dfb`, database default `(default)`.
Semua koleksi berada di root (tidak ada subkoleksi). Seluruh data milik satu pemilik.

### 3.1 Koleksi

| Koleksi | Isi | Dokumen pengaturan terkait |
|---|---|---|
| `kegiatan` | kegiatan/agenda | — |
| `kategoriKegiatan` | kategori berwarna untuk kegiatan | — |
| `dokumen` | metadata dokumen (berkasnya di Google Drive) | `pengaturan/drive` |
| `kategoriDokumen` | kategori dokumen + pemetaan folder Drive | `pengaturan/drive` |
| `catatan` | catatan singkat & catatan Google Docs | — |
| `foto` | metadata foto kegiatan (berkas di Drive) | `pengaturan/drive.fotoFolderId` |
| `laporan` | riwayat laporan yang diekspor ke Sheets | — |
| `pengaturan` | 3 dokumen tetap: `cadangan`, `drive`, `hariLibur` | — |

### 3.2 Bentuk data per koleksi

Batas panjang divalidasi oleh `firestore.rules`, jadi perubahan tipe/ukuran field **harus**
diikuti perubahan pada berkas aturan tersebut.

**`kegiatan`**

| Field | Tipe | Ketentuan |
|---|---|---|
| `judul` | string | wajib, 1–160 |
| `tanggal` | string | wajib, `YYYY-MM-DD` (tepat 10 karakter) |
| `status` | string | wajib, salah satu: `Rencana`, `Berjalan`, `Selesai` |
| `catatan` | string | opsional, ≤ 5.000 |
| `waktuMulai`, `waktuSelesai` | string | opsional, ≤ 10 (`HH:MM`) |
| `lokasi` | string | opsional, ≤ 140 |
| `kategoriId` | string | opsional, ≤ 100 |
| `createdAt`, `updatedAt` | string | opsional, ≤ 50 (ISO) |
| `dihapusAt` | string/null | penanda hapus lunak (≤ 50) |

**`kategoriKegiatan`** — `nama` (1–40), `warna` (1–30), `urutan` (number ≥ 0), `createdAt`, `updatedAt`.

**`kategoriDokumen`** — `nama`, `warna`, `urutan`, `folderId` (≤ 100, ID folder Drive),
`folderSinkron` (bool), `createdAt`, `updatedAt`.

**`dokumen`**

| Field | Tipe | Ketentuan |
|---|---|---|
| `namaTampilan` | string | wajib, 1–160 |
| `namaFile` | string | wajib, 1–255 |
| `driveFileId` | string | opsional, ≤ 100 |
| `tautan` | string | opsional, ≤ 1000 |
| `mimeType` | string | opsional, ≤ 150 |
| `ukuran` | number | opsional, ≥ 0 (byte) |
| `kategoriId`, `kegiatanId` | string | opsional, ≤ 100 |
| `catatan` | string | opsional, ≤ 5.000 |
| `tanggalUnggah`, `createdAt`, `updatedAt` | string | opsional, ≤ 50 |

**`foto`** — `kegiatanId` (wajib, ≤ 100), `driveFileId` (wajib, ≤ 100), `namaFile` (wajib, ≤ 255),
`tautan` (≤ 1000), `thumbnailLink` (≤ 2000), `mimeType` (≤ 150), `ukuran` (≥ 0), `catatan` (≤ 5000),
`createdAt`, `updatedAt`.

**`catatan`**

| Field | Tipe | Ketentuan |
|---|---|---|
| `jenis` | string | wajib, `singkat` atau `gdoc` |
| `judul` | string | wajib, 1–160 |
| `tanggal` | string | wajib, `YYYY-MM-DD` |
| `isi` | string | opsional, ≤ 100.000 |
| `kategori` | string | opsional, ≤ 40 |
| `tag` | list | opsional, ≤ 20 item |
| `kegiatanId` | string | opsional, ≤ 100 |
| `disematkan` | bool | opsional |
| `templat`, `docId` | string | opsional, ≤ 50 / ≤ 100 |
| `tautan` | string | opsional, ≤ 1000 |
| `dihapusAt` | string/null | hapus lunak |
| `driveDiSampah` | bool | apakah berkas Google Docs sudah dipindah ke sampah Drive |
| `createdAt`, `updatedAt` | string | opsional, ≤ 50 |

**`laporan`** — `nama` (1–200), `jenis` (1–50), `jenisLabel` (≤ 100), `tautan` (≤ 1000),
`sheetId` (≤ 100), `rentangTanggal` (≤ 100), `tanggalDari`/`tanggalSampai` (≤ 15),
`jumlahBaris` (≥ 0), `createdAt`, `updatedAt`.

### 3.3 Dokumen di koleksi `pengaturan`

Dokumen dibuat *lazy* (baru muncul setelah fitur terkait dipakai). ID-nya tetap dan
divalidasi oleh aturan — **jangan mengganti nama ID**.

| Dokumen | Field | Keterangan |
|---|---|---|
| `pengaturan/drive` | `rootFolderId`, `uncategorizedFolderId`, `fotoFolderId` | cache ID folder Drive agar tidak mencari ulang tiap kali |
| `pengaturan/cadangan` | `intervalHari` (0–365), `terakhirEksporAt` (≤ 50) | pengingat cadangan JSON |
| `pengaturan/hariLibur` | `entri` (list ≤ 500), `disembunyikan` (list ≤ 1000), `tampilkanCutiMerah` (bool), `tampilkanHariBesar` (bool), `updatedAt` | juga disalin ke localStorage |

### 3.4 Indeks komposit (`firestore.indexes.json`)

| Koleksi | Urutan field | Dipakai untuk |
|---|---|---|
| `kegiatan` | `dihapusAt` ASC, `tanggal` ASC | daftar kegiatan aktif urut tanggal naik (jendela kalender) |
| `kegiatan` | `dihapusAt` ASC, `tanggal` DESC | daftar kegiatan terbaru (halaman + paginasi) |
| `catatan` | `dihapusAt` ASC, `updatedAt` DESC | catatan terbaru (halaman + paginasi) |
| `catatan` | `dihapusAt` ASC, `tanggal` ASC | catatan per tanggal |
| `dokumen` | `dihapusAt` ASC, `tanggalUnggah` DESC | arsip dokumen terbaru + paginasi |
| `foto` | `dihapusAt` ASC, `createdAt` DESC | galeri foto kegiatan terbaru |
| `laporan` | `dihapusAt` ASC, `createdAt` DESC | riwayat laporan terbaru |

Tujuh indeks di atas sudah cukup untuk seluruh kueri gabungan aplikasi pada v1.8.51 —
Tahap D dan Tahap 2 tidak menambah kueri gabungan baru, sehingga deploy cukup `--only hosting`.

Bila menambah kueri gabungan baru, Firestore akan menolak dengan tautan pembuatan indeks —
salin indeks itu ke berkas ini agar ikut ter-deploy.

### 3.5 Hapus lunak & Tempat Sampah

- **Kelima koleksi** — `kegiatan`, `catatan`, `dokumen`, `foto`, `laporan` — memakai `dihapusAt`
  (ISO string). Item terhapus **tidak** ikut kueri halaman biasa karena setiap kueri daftar
  menyaring `where("dihapusAt", "==", null)` di server; Tempat Sampah memakai
  `where("dihapusAt", "!=", null)`.
- Dokumen lama yang dibuat sebelum fitur ini **tidak punya** field `dihapusAt`, sehingga tidak
  cocok dengan `== null` (dan tidak muncul di Tempat Sampah). Pengaturan menyediakan tombol
  **Migrasi `dihapusAt`** untuk menambahkan field itu secara idempoten (batch maks 500) pada
  kelima koleksi. Setiap jalur pembuatan dokumen baru juga wajib menulis `dihapusAt: null`.
- Hapus lunak **tidak menyentuh Google Drive**, sehingga berhasil juga saat luring. Berkas Drive
  baru dipindahkan ke Sampah Google Drive pada **hapus permanen** (tombol per item, tombol
  Kosongkan, dan pembersihan otomatis >30 hari). Karena itu hapus permanen item berberkas
  **ditolak saat luring** agar berkas tidak menjadi yatim.
- Untuk catatan bertipe `gdoc`, penghapusan menandai `driveDiSampah` dan pemulihannya mencoba
  mengembalikan dokumen dari Sampah Drive.

### 3.6 Kuota paket Spark

| Pos | Batas |
|---|---|
| Penyimpanan | 1 GiB |
| Baca dokumen | 50.000 / hari |
| Tulis dokumen | 20.000 / hari |
| Hapus dokumen | 20.000 / hari |
| Transfer keluar | 10 GiB / bulan |

Angka pemakaian **tidak** dapat dibaca dari aplikasi: Google Cloud Monitoring API mewajibkan
proyek berpenagihan aktif, sehingga pada paket Spark selalu ditolak (403 *"This API method
requires billing to be enabled"*). Lihat pemakaian di
**Firebase Console → Firestore → Usage**:
`https://console.firebase.google.com/project/msgkuna-app-85dfb/firestore/usage`

Kuota harian dihitung mengikuti zona waktu Pasifik, bukan tengah malam WIB.

---

## 4. Aturan keamanan Firestore (`firestore.rules`)

Inti aturan:

```
function isOwner() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email == "<EMAIL_PEMILIK>"
    && (pemilikUid() == "ISI_UID_PEMILIK" || pemilikUid() == "" || request.auth.uid == pemilikUid());
}
```

- **Lapis 1 — email** dari token Firebase (`email_verified` wajib `true`).
- **Lapis 2 — UID** dari fungsi `pemilikUid()`. Saat ini berisi UID asli
  `BL9TbJXXSTSLIedPBMXPgNWohLM2`. Jika diisi string penanda `ISI_UID_PEMILIK` (atau kosong),
  pemeriksaan UID dilewati dan hanya email yang berlaku.
- Semua koleksi: `read/create/update/delete` hanya untuk pemilik; sisanya ditolak.
  `match /{document=**} { allow read, write: if false; }` menutup akses lain.
- `create` memvalidasi **seluruh** dokumen; `update` hanya memvalidasi field yang berubah
  (aman untuk data lama).

Praktik baik: jangan sengaja mengosongkan `pemilikUid()` untuk jangka panjang — pemeriksaan UID
mencegah akses bila email saja dicuri/dipalsukan.

---

## 5. Pengaturan Firebase

### 5.1 Proyek

| Item | Nilai |
|---|---|
| Project ID | `msgkuna-app-85dfb` |
| Project number | `641787111254` |
| Paket | Spark (gratis) |
| Auth domain | `msgkuna-app-85dfb.firebaseapp.com` |
| Hosting site | `msgkuna` → `msgkuna.web.app` |

`firebase.json` mendefinisikan target hosting `utama` dengan folder `public`, dan `.firebaserc`
memetakan target itu ke site `msgkuna`.

### 5.2 Konfigurasi web SDK (`public/js/config/firebase.js`)

```js
export const firebaseConfig = {
  apiKey: "AIzaSyBtYgsCoZk5F1HpBHKCIuHIl0XIAQgcqqU",
  authDomain: "msgkuna-app-85dfb.firebaseapp.com",
  projectId: "msgkuna-app-85dfb",
  storageBucket: "msgkuna-app-85dfb.appspot.com",
  messagingSenderId: "641787111254",
  appId: "1:641787111254:web:20e40d4bc939bc118298f7",
};
export const GOOGLE_CLIENT_ID = "641787111254-r1d0co4oi0i6padlerb7nsb15uhemacj.apps.googleusercontent.com";
```

Nilai ini diambil dari **Firebase Console → Project settings → General → Your apps → Web app**.
`apiKey` Firebase boleh tampil di sisi klien (bukan rahasia); keamanan sebenarnya ada pada
`firestore.rules` dan pembatasan HTTP referrer pada API key.

SDK dimuat dari CDN gstatic v11.4.0 (dinamis, tanpa bundler): App/Auth lewat
`services/firestoreService.js`, dan plambing Firestore (collection/query/onSnapshot dan
sejenisnya) hanya lewat `services/firestoreRepository.js` — modul fitur tidak pernah
menyentuh SDK secara langsung.

### 5.3 Authentication

- Provider aktif: **Google**.
- Mode: satu pengguna. Aplikasi menolak email selain `AUTHORIZED_EMAIL` (di
  `config/constants.js`), lalu mengeluarkan sesi dan mencabut token Drive.
- **Authorized domains** (Authentication → Settings → Authorized domains) harus memuat:
  `msgkuna.web.app`, `msgkuna-app-85dfb.firebaseapp.com` (otomatis), dan domain kustom bila ada.
- Provider Google memakai OAuth Client ID milik proyek ini. `GOOGLE_CLIENT_ID` pada
  `config/firebase.js` sebaiknya menunjuk Client ID Web yang **sama** dengan yang dipakai
  provider tersebut, agar berkas Drive lama (`drive.file`) tetap dapat diakses.

### 5.4 Hosting & header keamanan

`firebase.json` memasang untuk semua path:

| Header | Nilai | Alasan |
|---|---|---|
| `Cache-Control` | `no-cache` | agar perubahan SW/JS langsung berlaku |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | popup login Google |
| `Content-Security-Policy` | lihat berkas | membatasi skrip/gaya/gambar/koneksi ke domain yang dikenal |

Bila aplikasi menambah domain baru untuk gambar atau API, `connect-src` / `img-src` pada CSP
harus diperbarui — jika tidak, permintaan diblokir peramban tanpa pesan yang jelas.

### 5.5 Perintah deploy

```bash
# semuanya: hosting + rules + indexes
firebase deploy

# hanya hosting (site target "utama")
firebase deploy --only hosting:utama

# hanya aturan / indeks
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Sebelum deploy setelah mengubah JS: naikkan `VERSION` di `public/sw.js` **dan**
`VERSI_CADANGAN_SW` di `public/js/config/constants.js` ke nilai yang sama, lalu daftarkan
berkas JS baru di `APP_SHELL`.

---

## 6. Pengaturan Google Cloud Console

Proyek Cloud yang dipakai sama dengan proyek Firebase: `msgkuna-app-85dfb`
(menu **Google Cloud Console → APIs & Services**).

### 6.1 API yang harus aktif

| API | Dipakai untuk | Wajib? |
|---|---|---|
| Google Drive API | semua operasi berkas & folder | ya |
| Google Sheets API | pembuatan laporan | ya (hanya saat membuat laporan) |
| Identity Toolkit / Firebase Auth | login (aktif otomatis oleh Firebase) | ya |
| Cloud Firestore API | database (aktif otomatis) | ya |
| Cloud Monitoring API | **tidak dipakai** — sudah dicabut dari aplikasi | tidak |

Google Docs tidak butuh API terpisah: dokumen dibuat lewat Drive API dengan
`mimeType = application/vnd.google-apps.document`.

### 6.2 OAuth Client (GIS Token Client)

- Jenis: **Web application**.
- Client ID: `641787111254-r1d0co4oi0i6padlerb7nsb15uhemacj.apps.googleusercontent.com`
- **Authorized JavaScript origins** harus memuat:
  - `https://msgkuna.web.app`
  - `https://msgkuna-app-85dfb.firebaseapp.com`
  - `http://localhost` (bila menguji lokal)
- Scope yang diminta aplikasi: `https://www.googleapis.com/auth/drive.file`
  - Ini juga token yang dipakai untuk Google Sheets, karena `drive.file` mengizinkan aplikasi
    membuat serta mengubah berkas yang **dibuatnya sendiri**.
- Client ID ini sebaiknya **tidak diganti** saat serah terima — lihat bagian 9.

### 6.3 OAuth consent screen

- Tipe pengguna: **External** (kecuali memakai Google Workspace internal).
- Status *Testing*: hanya akun yang terdaftar di **Test users** yang dapat memberi izin.
  Tambahkan akun pemilik baru di sini bila status masih *Testing*.
- Status *In production* dengan scope `drive.file` termasuk kategori sensitif/terbatas; Google
  dapat meminta verifikasi bila aplikasi dipakai publik. Untuk pemakaian pribadi, status
  *Testing* + akun pemilik sebagai test user sudah mencukupi (token tetap berlaku, hanya perlu
  memberi izin ulang setiap 7 hari pada beberapa kondisi).

### 6.4 API key

- API key Firebase dibatasi lewat **Google Cloud Console → APIs & Services → Credentials →
  API key → Application restrictions**: pilih *HTTP referrers* dan daftarkan
  `msgkuna.web.app/*` serta `msgkuna-app-85dfb.firebaseapp.com/*`.
- Batasi juga *API restrictions* ke API yang benar-benar dipakai (Identity Toolkit, Firestore,
  Drive, Sheets).

---

## 7. Penyimpanan di luar Firestore

### 7.1 Google Drive (milik akun pemilik)

```
Agenda-Arsip/                     folder induk (NAMA_FOLDER_INDUK)
  Tanpa Kategori/                 berkas tanpa kategori
  Foto Kegiatan/                  semua foto kegiatan
  <Nama Kategori Dokumen>/        satu subfolder per kategori dokumen
```

- ID folder induk, "Tanpa Kategori", dan "Foto Kegiatan" di-cache di `pengaturan/drive`.
- Berkas diunggah dengan `unggahBerkasKeDrive` (multipart ≤ 5 MB, resumable di atasnya).
- Menghapus dokumen/foto = memindahkan berkas Drive ke sampah + menghapus dokumen Firestore.
- Thumbnail foto diambil dari `thumbnailLink`, dengan cadangan `alt=media` (maks 15 MB).

### 7.2 Penyimpanan peramban (per perangkat, tidak tersinkron)

| Kunci | Media | Isi |
|---|---|---|
| `agenda_arsip_tema` | localStorage | skema warna |
| `agenda_arsip_sidebar` | localStorage | status sidebar (terbuka/terlipat) |
| `agenda_arsip_dashboard_hari_ini` | localStorage | preferensi tampilan dashboard |
| `agenda_arsip_update_ditunda` | localStorage | penundaan pembaruan service worker |
| `agenda_arsip_cadangan_*` | localStorage | pengingat cadangan |
| `agenda_arsip_hari_libur` | localStorage | salinan pengaturan hari libur |
| `agenda_arsip_drive_token*` | sessionStorage | **warisan lama**, dibersihkan saat startup; token Drive kini hanya di memori |

Token akses Google **tidak pernah** disimpan ke Firestore maupun localStorage permanen.

---

## 8. Titik hardcode identitas (lokasi yang harus diubah bila pemilik diganti)

| Berkas | Isi yang perlu diubah |
|---|---|
| `public/js/config/firebase.js` | `firebaseConfig.*`, `GOOGLE_CLIENT_ID` |
| `public/js/config/constants.js` | `AUTHORIZED_EMAIL`, `URL_PEMAKAIAN_FIRESTORE_CONSOLE` |
| `firestore.rules` | email pada `isOwner()`, nilai `pemilikUid()` |
| `.firebaserc` | `projects.default`, `projects`/`targets` (project ID & site hosting) |
| `firebase.json` | `hosting.target` (bila nama target berubah), CSP bila domain baru |
| `public/index.html` | `og:url`, `og:image`, `twitter:image`, teks `#authorized-owner-email`, judul/deskripsi |
| `public/js/modules/pengaturan/view.js` | teks `msgkuna.web.app` pada kartu "Teknologi yang Digunakan" |
| `public/manifest.webmanifest` | nama, deskripsi, ikon (bila rebranding) |
| `public/js/boot-tema.js` | kunci `agenda_arsip_tema` (duplikat sengaja; harus sama dengan constants) |

Cara cepat menemukan semuanya:

```bash
grep -rn "msgkuna\|641787111254\|msgkuna.app@gmail.com\|BL9TbJXX" public firestore.rules .firebaserc firebase.json
```

---

## 9. Panduan bila pemilik ingin diganti

Ada dua skenario. **Skenario A hampir selalu lebih baik**: data, folder Drive, dan riwayat
laporan tetap utuh, serta berkas Drive yang sudah diizinkan aplikasi tidak perlu diunggah ulang.

### 9.1 Skenario A — serah terima proyek ke akun Google lain (disarankan)

#### Langkah 0 — persiapan (dilakukan pemilik lama)

1. **Cadangkan data**: Pengaturan → *Ekspor JSON seluruh data*. Simpan berkas di luar Drive
   yang akan dialihkan.
2. **Catat ID penting**: project ID, OAuth Client ID, UID pemilik baru (lihat langkah 2),
   nama site hosting.
3. Pastikan pemilik lama masih bisa masuk (diperlukan untuk langkah IAM & Drive).

#### Langkah 1 — beri akses proyek kepada pemilik baru

Pilih salah satu:

- **A1 — tambah sebagai anggota (paling sederhana).** Google Cloud Console →
  **IAM & Admin → IAM → Grant access**: tambahkan email pemilik baru dengan peran
  `Firebase Admin` (atau `Editor`). Pemilik baru dapat mengakses Firebase Console,
  Firestore, Auth, Hosting, dan Cloud Console tanpa memindahkan kepemilikan.
- **A2 — pindahkan kepemilikan proyek.** Google Cloud Console → **IAM & Admin → Manage
  resources** → pilih proyek → **Change owner** ke akun baru. Akun baru harus lebih dulu
  menjadi *Editor* pada proyek, dan kepemilikan hanya bisa dipindah ke akun dalam organisasi
  yang sama. Tanpa organisasi, gunakan A1.

Setelah itu **pemilik lama sebaiknya mencabut perannya sendiri** agar benar-benar lepas kendali.

#### Langkah 2 — daftarkan akun pemilik baru di Firebase Authentication

1. Pemilik baru membuka aplikasi sekali dan mencoba masuk. Login akan **ditolak** — itu wajar;
   tujuannya agar akunnya tercatat.
   Lebih rapi: Firebase Console → **Authentication → Users → Add user** (atau minta pemilik
   baru login lewat halaman login aplikasi sebelum aturan diubah).
2. Salin **UID** akun tersebut dari daftar *Users*.

#### Langkah 3 — ubah email & UID pemilik

1. `public/js/config/constants.js`:
   ```js
   export const AUTHORIZED_EMAIL = "email-baru@gmail.com";
   ```
2. `firestore.rules`, fungsi `pemilikUid()`:
   ```
   return "<UID_PEMILIK_BARU>";
   ```
   dan fungsi `isOwner()`: ganti literal email menjadi email baru.
3. Deploy aturan lebih dulu, baru hosting:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only hosting:utama
   ```

> Penting: bila aturan di-deploy lebih dulu, pemilik lama langsung kehilangan akses — itu
> memang tujuannya. Bila hosting lebih dulu, pemilik baru belum bisa masuk. Urutan yang
> disarankan: aturan, lalu hosting, lalu uji login dari peramban mode privat.

#### Langkah 4 — alihkan berkas Google Drive

- Pindahkan folder **`Agenda-Arsip`** ke Drive pemilik baru. Dua cara:
  - **Pemilik baru mengunduh lalu mengunggah ulang** folder tersebut (paling aman untuk
    kepemilikan penuh), atau
  - **Pemilik lama berbagi folder** dengan pemilik baru, lalu pemilik baru memilih
    *Move to my Drive*. Folder hasil "move" tetap dimiliki pemilik lama kecuali disalin —
    untuk kepemilikan yang bersih, salin.
- Setelah folder berpindah, **hapus cache ID folder** agar aplikasi mencari ulang:
  buka Firebase Console → Firestore → koleksi `pengaturan` → dokumen `drive` → hapus dokumen
  itu (atau kosongkan ketiga field-nya). Aplikasi akan mencari/membuat folder
  `Agenda-Arsip` milik akun baru pada pemakaian berikutnya.
- ID folder pada `kategoriDokumen.folderId` juga menunjuk folder lama. Jalankan
  **Pengaturan → Sinkronkan semua folder kategori** setelah login sebagai pemilik baru;
  tombol ini akan membuat ulang subfolder yang hilang dan memperbarui `folderId`.

#### Langkah 5 — OAuth consent screen

- Bila status masih *Testing*: tambahkan email pemilik baru ke **Test users**
  (Google Cloud Console → APIs & Services → OAuth consent screen).
- **Jangan mengganti OAuth Client ID** bila tidak perlu. `drive.file` memberi izin per aplikasi:
  Client ID baru = identitas aplikasi baru, sehingga berkas yang dulu diizinkan aplikasi lama
  **tidak** otomatis terlihat oleh aplikasi baru. Mempertahankan Client ID menghindari pemilik
  baru harus memilih ulang setiap berkas.

#### Langkah 6 — batasi ulang API key & authorized domain

- Credentials → API key → HTTP referrers: pastikan hanya domain yang masih dipakai.
- Authentication → Settings → Authorized domains: tambahkan domain baru bila ada.
- Bila domain berubah, perbarui juga CSP di `firebase.json` (`connect-src`, `img-src`) dan
  `og:url`/ikon di `index.html`, lalu deploy.

#### Langkah 7 — bersihkan jejak pemilik lama

1. Firebase Console → Authentication: hapus akun pemilik lama (opsional; bila dihapus,
   `pengaturan/*` tetap utuh).
2. Google Cloud Console → IAM: cabut peran pemilik lama.
3. Akun pemilik lama: cabut akses aplikasi di
   `https://myaccount.google.com/permissions` (menghapus izin `drive.file` aplikasi).
4. Ganti kata sandi akun lama bila ada keraguan.

#### Langkah 8 — uji terima

- [ ] Login dengan akun baru berhasil; akun lain ditolak.
- [ ] Daftar kegiatan, catatan, dokumen, foto tampil lengkap.
- [ ] Unggah satu dokumen → berkas muncul di folder `Agenda-Arsip/<Kategori>` milik akun baru.
- [ ] Unggah satu foto kegiatan → muncul di `Agenda-Arsip/Foto Kegiatan`.
- [ ] Buat satu laporan → Google Sheets berhasil dibuat.
- [ ] Ekspor JSON berhasil; impor JSON ke data uji berhasil.
- [ ] Hapus satu item dari tiap jenis (kegiatan, catatan, dokumen, foto, laporan) → semuanya
      muncul di Tempat Sampah, dapat dipulihkan, dan hapus permanen satu dokumen berberkas
      memindahkan berkasnya ke Sampah Google Drive.
- [ ] Kelola Kategori (kegiatan & dokumen): tambah, ubah warna, geser urutan, dan penghitung
      pemakai menolak penghapusan kategori yang masih dipakai.
- [ ] Kapasitas Drive menampilkan angka akun baru.
- [ ] Service worker memperbarui aplikasi (versi di Pengaturan = `VERSION` terbaru).

### 9.2 Skenario B — pindah ke proyek Firebase baru

Dipakai bila pemilik baru ingin proyek terpisah sepenuhnya. **Data tidak ikut otomatis** dan
berkas Drive harus diunggah ulang / disalin.

1. Buat proyek Firebase baru (paket Spark).
2. Aktifkan **Firestore** (mode produksi), **Authentication → Google**.
3. Tambahkan aplikasi **Web** → salin `firebaseConfig`.
4. Buat **OAuth Client ID** baru (Web application) di Cloud Console proyek baru; aktifkan
   **Google Drive API** dan **Google Sheets API**.
5. Unggah berkas konfigurasi:
   - `firebase target:apply hosting utama <nama-site>` lalu sesuaikan `.firebaserc`.
   - `public/js/config/firebase.js` → `firebaseConfig` + `GOOGLE_CLIENT_ID` baru.
   - `public/js/config/constants.js` → `AUTHORIZED_EMAIL` + `URL_PEMAKAIAN_FIRESTORE_CONSOLE`
     (ganti project ID di URL-nya).
6. `firestore.rules` → email & UID pemilik baru; deploy aturan.
7. `firebase deploy` (hosting + rules + indexes).
8. Impor data: Pengaturan → *Impor JSON* dari berkas ekspor langkah 9.1-0.
9. Unggah ulang berkas Drive (atau salin folder) → lalu **Sinkronkan semua folder kategori**.
10. Perbarui `index.html` (`og:url`, `og:image`), teks `msgkuna.web.app` di
    `modules/pengaturan/view.js`, dan `manifest.webmanifest` bila nama/domain berubah.

### 9.3 Skenario C — hanya ganti email pemilik, akun Google tetap

Bila akun Google-nya sama dan hanya alamat email yang berubah (mis. ganti nama akun):

1. Ubah email di `config/constants.js` dan `firestore.rules` (`isOwner()`).
2. Deploy `firestore:rules` lalu hosting.
3. UID biasanya **tidak berubah** pada akun Google — tetapi verifikasi dulu di
   Authentication → Users; bila berubah, perbarui `pemilikUid()` juga.

---

## 10. Rutinitas pemeliharaan

| Kapan | Tindakan |
|---|---|
| Setiap mengubah JS/CSS | naikkan `VERSION` (`sw.js`) + `VERSI_CADANGAN_SW` (`constants.js`); daftarkan berkas baru di `APP_SHELL` |
| Setiap mengubah field Firestore | perbarui `firestore.rules` **dan** kode `state.js` modul terkait; deploy aturan |
| Setiap menambah kueri gabungan | tambahkan indeks di `firestore.indexes.json`; deploy indeks |
| Setiap deploy | `firebase deploy` (hosting + rules + indexes) |
| Berkala | ekspor JSON cadangan; periksa Firebase Console → Firestore → Usage untuk kuota |
| Sebelum serah terima | ikuti checklist 9.1 langkah 8 |

### Kesalahan umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Missing or insufficient permissions` | email/UID di aturan tidak cocok, atau aturan belum di-deploy | periksa `firestore.rules`, deploy ulang |
| Aplikasi memuat versi lama | `VERSION` tidak dinaikkan | naikkan versi SW, muat ulang; bila tetap, hapus cache situs |
| Berkas Drive "hilang" setelah ganti Client ID | izin `drive.file` terikat pada aplikasi (Client ID) | gunakan Client ID lama, atau pilih ulang berkas |
| Unggah gagal 403 `storageQuota` | Drive penuh | kosongkan sampah Drive / tambah kapasitas |
| Laporan gagal dibuat | Google Sheets API belum aktif / kuota | aktifkan API, cek kuota Sheets |
| Login ditolak padahal email benar | `email_verified` belum `true`, atau UID di `pemilikUid()` salah | verifikasi email Google; periksa UID di Authentication → Users |
| Popup login diblokir | COOP/CSP atau pemblokir popup | pastikan header `firebase.json` utuh, izinkan popup |
