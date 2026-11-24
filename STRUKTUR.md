# STRUKTUR.md - Agenda & Arsip

> Berkas acuan untuk Project Claude. Perbarui setiap selesai satu tahap refactoring,
> lalu hapus versi lama di Project dan unggah versi baru.

Terakhir diperbarui: 2026-11-24
Tahap saat ini: **Perbaikan pengingat cadangan, filter kategori dokumen, dan kartu terlipat Pengaturan (2026-11-24)** — (1) pilihan interval pengingat cadangan kini tersimpan (listener change + simpanIntervalCadangan yang selama ini tak pernah dipanggil) dan muatPengaturanCadangan memilih waktu ekspor paling baru antara salinan lokal & server (dulu server selalu menimpa, ekspor yang tulis servernya gagal terasa hilang → banner muncul tiap hari) plus pemulihan best-effort ke server; (2) buatManajerKategori.unsubscribe() tidak lagi membersihkan listenersPerubahan (penerima onChange() milik pemakai tetap hidup — dulu terhapus tiap langganan dipasang ulang sehingga dropdown filter kategori dokumen hanya berisi "Semua Kategori") + dropdown kategori dokumen diisi saat initHalamanDokumen; (3) kartu Teknologi, Kapasitas Layanan, Cadangan Data, dan Hari Libur di Pengaturan menjadi <details>/<summary> (Teknologi & Cadangan tertutup bawaan; Kapasitas & Hari Libur terbuka) dengan gaya .dash-card-lipat, tombol di dalam summary dijaga dari toggle via preventDefault. SW v1.8.41. Sisa opsional: Tahap 2 (CRUD bermakna menggantikan re-export SDK di firestoreService.js)

## 1. Ringkasan aplikasi
- Nama: Agenda & Arsip
- Fungsi: kegiatan/jadwal, dokumen (Google Drive), catatan (Google Docs), laporan, kategori, dashboard
- Teknologi: HTML/JS murni (tanpa bundler), Firebase Hosting + Firestore, Google Identity Services, Drive API, Calendar API, PWA (service worker)
- Pengguna: pribadi (satu akun Google)
- Domain: msgkuna.web.app

## 2. Aturan arsitektur (wajib dipatuhi)
1. Perilaku aplikasi tidak boleh berubah selama refactor.
2. Arah dependensi satu arah: `views -> services -> config`.
3. Hanya `services/` yang boleh memanggil Firebase, Drive, atau Calendar.
4. `config/` tidak boleh mengimpor modul lain.
5. Satu berkas satu tanggung jawab (maks. +-250 baris, fungsi maks. +-40 baris).
6. Tidak menambah variabel global baru.
7. Entry point tunggal: `js/main.js` (Tahap 5: rename dari app.js; boot sinkron: `js/boot-tema.js` di `<head>`).

## 3. Struktur folder

### Kondisi saat ini (hasil audit 2026-11-21)
```
public/
  index.html            (2.469 baris — semua section+modal dalam satu berkas)
  manifest.webmanifest
  sw.js                 (149 baris)
  css/
    style.css           (5.576 baris)
  icons/                (7 berkas ikon)
  js/
    main.js             (entry point/orkestrator; Tahap 5: rename dari app.js; dashboard SUDAH dipindah)
    boot-tema.js        (skrip klasik sinkron <head>, anti-FOUC)
    modules/
      dashboard/        (Tahap 3a: state.js, view.js, controller.js, index.js)
      pengaturan/       (Tahap 3b+3b-2: state.js, view.js, controller.js, index.js; jembatan pengaturan.js SUDAH DIHAPUS)
      dokumen/          (Tahap 3d+3d-2: state.js, format.js, view.js, controller.js, index.js, kegiatan-view.js — blok dokumen terkait di kartu kegiatan; folder.js — penyiapan folder kategori bersama; unggah-kegiatan.js — unggah dokumen dari form kegiatan; jembatan dokumen.js SUDAH DIHAPUS)
      kegiatan/         (Tahap 3e+3e-2: state.js, format.js, view.js, controller.js, index.js; jembatan kegiatan.js SUDAH DIHAPUS)
      catatan/          (Tahap 3+3-2: state.js, format.js, view.js, controller.js, index.js; jembatan catatan.js SUDAH DIHAPUS)
      laporan/          (Tahap 3+3-2: state.js, format.js, view.js, controller.js, index.js; jembatan laporan.js SUDAH DIHAPUS; panggilan Sheets kini di services/sheetsService.js Tahap 2d)
      kategori/         (Tahap 3+3-2: format.js, state.js, view.js, controller.js, index.js; jembatan kategori.js SUDAH DIHAPUS)
      foto/             (foto kegiatan TERINTEGRASI di kartu Kegiatan: state.js, view.js, controller.js, index.js; koleksi Firestore "foto"; folder Drive "Foto Kegiatan"; halaman Foto tersendiri DIHAPUS)
      sampah/           (Tahap 3+3-2: format.js, state.js, view.js, controller.js, index.js; jembatan sampah.js SUDAH DIHAPUS)
    config/
      constants.js      (82)
      firebase.js       (33)
    pwa.js
    jadwal.js
    pencarian-global.js
    sidebar.js   tema.js   hari-libur.js  templat-dokumen.js
    filter-panel.js  timeline-harian.js
    util-html.js  util-tanggal.js
    shared/
      toast.js          (tampilkanToast; re-export dari sidebar.js SUDAH DIHAPUS)
    services/
      firestoreService.js (jalur tunggal SDK Firebase; firebase-config.js SUDAH DIHAPUS)
      authService.js      (GIS token + Firebase Auth; auth.js SUDAH DIHAPUS)
      driveService.js     (Google Drive API v3; drive.js SUDAH DIHAPUS)
      sheetsService.js    (Tahap 2d: Google Sheets API v4, dari modules/laporan/sheets.js)
      monitoringService.js (2026-11-24: Cloud Monitoring API v3 timeSeries.list; pemakaian Firestore; token monitoring.read terpisah)
firebase.json
firestore.indexes.json
firestore.rules
PANDUAN-PEMILIK.md   (struktur aplikasi, skema database, pengaturan Firebase/Firestore/Google Cloud, panduan ganti pemilik)
```

### Struktur target
Sudah tercapai (Tahap 0–5, 2026-11-21): `js/main.js`, `config/`, `services/`, `shared/`, `modules/<fitur>/{view,controller,state,format}`.
Catatan: entry point telah diganti nama `app.js` → `main.js` (index.html + APP_SHELL ikut diperbarui).

## 4. Daftar berkas (hasil audit 2026-11-21)

Total JS: 18.581 baris / 25 berkas. Kolom "Kondisi": S=service, V=view/DOM, T=state/cache, U=util.

| Berkas | Baris | Kondisi | Diimpor oleh | Catatan |
|---|---|---|---|---|
| js/dokumen.js | - | DIHAPUS (3d-2) | - | isi kini di modules/dokumen/; 7 konsumen impor dari modules/dokumen/index.js |
| js/pengaturan.js | 2126 | S+V+T | app | god object #2: cadangan semua koleksi + hari libur + migrasi |
| js/laporan.js | - | DIHAPUS (3-2) | - | isi kini di modules/laporan/; 3 konsumen (app.js, pengaturan controller+view) impor dari modules/laporan/index.js |
| js/kegiatan.js | - | DIHAPUS (3e-2) | - | isi kini di modules/kegiatan/; 11 konsumen impor dari modules/kegiatan/index.js |
| js/catatan.js | - | DIHAPUS (3-2) | - | isi kini di modules/catatan/; 10 konsumen impor dari modules/catatan/index.js |
| js/main.js | - | V (orchestrator) | index.html | Tahap 5: rename dari app.js; dashboard sudah jadi modul |
| js/drive.js | 1291 | S | app, catatan, dokumen, laporan, pengaturan | sudah service-like, tinggal pindah nama/lokasi |
| js/kategori.js | - | DIHAPUS (3-2) | - | isi kini di modules/kategori/; 9 berkas konsumen impor dari modules/kategori/index.js |
| js/pencarian-global.js | 955 | V | app | tarik data via `ambilSemuaXSekaliPakai` (OK) |
| js/sampah.js | - | DIHAPUS (3-2) | - | isi kini di modules/sampah/; 2 konsumen (app.js, dashboard/controller.js) impor dari modules/sampah/index.js |
| js/jadwal.js | 791 | V | app, pengaturan | |
| js/sidebar.js | 591 | V+U | 10 modul | tampilkanToast/escapeHtml/pindahKeBagian sebaiknya pindah ke shared |
| js/timeline-harian.js | 546 | U+V | app | sudah bersih |
| js/auth.js | 403 | S | app, catatan, dokumen, drive, laporan, pengaturan | GIS token + Firestore auth |
| js/filter-panel.js | 314 | V+U | catatan, dokumen, kegiatan | sudah bersih |
| js/templat-dokumen.js | 309 | U+D | catatan | D=data templat |
| js/hari-libur.js | 297 | U+D | app, jadwal, kegiatan, pengaturan | |
| js/pwa.js | 236 | S | app, pengaturan | sudah terpisah dari app.js |
| js/boot-tema.js | 178 | V (boot) | index.html (sinkron) | hardcode "agenda_arsip_tema" — duplikasi kunci dgn constants |
| js/firebase-config.js | 93 | config+S | 11 modul | jembatan SDK; target: pecah jadi services/firestoreService |
| js/util-html.js | 101 | U | 6 modul | sumber kebenaran escapeHtml/svgIkon/nama hari-bulan |
| js/tema.js | 86 | U+V | app, pengaturan | |
| js/config/constants.js | 82 | config | 13 modul | terpusat, bagus |
| js/util-tanggal.js | 81 | U | 10 modul | sudah bersih |
| js/config/firebase.js | 33 | config | firebase-config.js | terpusat, bagus |

## 5. Temuan audit (2026-11-21)

### God object
- `app.js` (1.324): modul Dashboard tersembunyi di entry point (renderDashboard, initHalamanDashboard, render kartu kegiatan/dokumen/catatan, banner cadangan) + pemantau token Drive.
- `pengaturan.js` (2.126): cadangan JSON seluruh koleksi + pengaturan hari libur + migrasi `dihapusAt` + UI.
- `dokumen.js` (2.140): CRUD Firestore + unggah Drive + kategori + filter + render + pagination dalam satu berkas.

### Config yang tersebar / duplikasi kunci
- `boot-tema.js:14` hardcode `"agenda_arsip_tema"` (keterbatasan skrip klasik; harus dijaga sinkron dgn `config/constants.js`).
- `firebase-config.js` masih re-export semuanya (jembatan). Target akhir: modul modul impor SDK hanya via services.

### Pemanggilan API langsung di views (melanggar aturan #3)
- SEMUA modul halaman memanggil Firestore langsung: `kategori.js:219-563` (8x getFirestoreDb), `kegiatan.js`, `catatan.js`, `dokumen.js`, `laporan.js`, `pengaturan.js`, `sampah.js`, `jadwal.js`.
- [SELESAI 2026-11-21, Tahap 2d] `laporan.js` memanggil Sheets API (SHEETS_API_BASE) langsung di modul view. Panggilan kini terisolasi di services/sheetsService.js (panggilSheetsApi + buatErrorSheets); modules/laporan/sheets.js DIHAPUS; URL tetap disusun controller dari konstanta SHEETS_API_BASE (config).
- `drive.js` de-facto driveService tapi diimpor langsung oleh 5 modul (belum lewat lapisan service resmi).

### Kode duplikat
- [SELESAI 2026-11-21, Tahap 4a+4d] `svgIkon` duplikat 6x -> kini semua modul (termasuk jadwal.js) mengimpor dari util-html.js.
- [SELESAI 2026-11-21, Tahap 4a+4d] `NAMA_HARI_PENDEK`/`NAMA_BULAN_PENDEK` duplikat 4x -> kini diimpor dari util-html.js. Di jadwal.js: NAMA_HARI_DARI_MINGGU -> NAMA_HARI, NAMA_BULAN_PANJANG -> NAMA_BULAN, NAMA_BULAN_RINGKAS -> NAMA_BULAN_PENDEK. KOLOM_HARI_SENIN tetap lokal (struktur khusus kalender awal-Senin).
- [BELUM] Pola list+pagination+subscribe hampir identik di kegiatan/catatan/dokumen/laporan (muatLebihBanyakX, ambilSemuaXSekaliPakai, onPerubahanX, subscribeX/unsubscribeX) -> kandidat service generik Tahap 2.

### Dependensi melingkar
- [SELESAI 2026-11-21, Tahap 3e] Siklus `kegiatan⇄catatan` diputus: modules/catatan tidak lagi mengimpor modul kegiatan; state.js menerima sumber data kegiatan lewat `daftarkanSumberKegiatan({ getDaftar, onPerubahan })` yang dipanggil app.js sebelum `subscribeKegiatan()`/`subscribeCatatan()`. Bila registrasi terlewat, halaman catatan tetap berjalan — hanya pilihan "kegiatan terkait" yang kosong (bawaan aman).
- Fan-in berisiko: `sidebar.js` (10) menyimpan utility non-sidebar; `kegiatan.js` (8).
- [SELESAI 2026-11-21, Tahap 4b] `tampilkanToast` (±130 baris) dipindah dari sidebar.js ke shared/toast.js; sidebar.js kini re-export demi kompatibilitas; 5 konsumen (app, catatan, kegiatan, pengaturan, sampah) kini impor langsung dari shared/toast.js.
- [SELESAI 2026-11-21, Tahap 4c] `escapeHtml` tidak lagi diimpor lewat sidebar.js di modul mana pun; 7 modul kini impor langsung dari util-html.js. sidebar.js hanya diimpor untuk fungsi sidebar asli (initSidebar, pindahKeBagian, perbaruiInfoAkunSidebar, perbaruiStatusKoneksiSidebar, tutupDrawerMobile, getActiveSectionId, bukaDrawerMobile). Re-export di sidebar.js (escapeHtml, escapeAtribut, tampilkanToast) SUDAH DIHAPUS pada pembersihan jembatan 2026-11-21 setelah dipastikan tak ada konsumen; sidebar.js hanya diekspor untuk fungsi sidebar asli (initSidebar, pindahKeBagian, perbaruiInfoAkunSidebar, perbaruiStatusKoneksiSidebar, tutupDrawerMobile, getActiveSectionId, bukaDrawerMobile).

### Poin positif (jangan dirusak saat refactor)
- Config sudah terpusat di `js/config/` (Tahap 1 prakteknya sudah tercapai; tinggal formalisasi).
- Entry point tunggal `app.js`; `boot-tema.js` sinkron anti-FOUC di head.
- `pwa.js` sudah terpisah; `buatManajerKategori` (kini modules/kategori/state.js) adalah pola factory yang tepat untuk ditiru di service generik.
- util kecil (`util-tanggal` 81, `util-html` 101) sudah bersih dan jadi sumber kebenaran.

## 6. Progres tahap

| Tahap | Isi | Status | Commit |
|---|---|---|---|
| 0 | Audit & peta dependensi | **selesai 2026-11-21** | - |
| 1 | Pusatkan config | sebagian (config/ sudah ada; boot-tema hardcode kunci tema tersisa sebagai keterbatasan skrip klasik) | - |
| 2 | Pusatkan service | **2a+2b+2c+2d selesai 2026-11-21**: services/firestoreService.js (SDK Firebase), services/authService.js (dari auth.js), services/driveService.js (dari drive.js), services/sheetsService.js (Tahap 2d, dari modules/laporan/sheets.js — panggilSheetsApi + buatErrorSheets). Jembatan auth.js/drive.js/firebase-config.js SUDAH DIHAPUS; konsumen impor langsung dari services/. Tahap 2 tuntas | - |
| 3 | Pecah god object (per modul) | **3a selesai 2026-11-21**: app.js (1.324 → ±660 baris); blok dashboard (state/view/controller/index) kini di js/modules/dashboard/. **3b + 3b-2 selesai 2026-11-21**: pengaturan.js (2.126 baris) → modules/pengaturan/; jembatan sudah dihapus. **3d + 3d-2 selesai 2026-11-21**: dokumen.js (2.140 baris) → modules/dokumen/ (state/format/view/controller/index); 7 konsumen kini impor langsung dari modules/dokumen/index.js dan jembatan dokumen.js dihapus. **3e + 3e-2 selesai 2026-11-21**: kegiatan.js (1.515 baris) → modules/kegiatan/ (state/format/view/controller/index); 11 konsumen kini impor langsung dari modules/kegiatan/index.js dan jembatan kegiatan.js dihapus; siklus kegiatan⇄catatan diputus via `daftarkanSumberKegiatan` dari app.js. **3 catatan selesai 2026-11-21**: catatan.js (1.379 baris) → modules/catatan/ (state/format/view/controller/index); jembatan re-export 25 nama dipakai 10 konsumen. **3-2 selesai 2026-11-21**: 10 konsumen kini impor langsung dari modules/catatan/index.js dan jembatan catatan.js dihapus. **3 laporan selesai 2026-11-21**: laporan.js (1.646 baris) → modules/laporan/ (state/format/sheets/view/controller/index); panggilan Sheets API diisolasi di sheets.js; jembatan re-export 8 nama dipakai 3 konsumen. **3-2 laporan selesai 2026-11-21**: 3 konsumen (app.js, pengaturan controller+view) kini impor langsung dari modules/laporan/index.js dan jembatan laporan.js dihapus. **3 kategori selesai 2026-11-21**: kategori.js (1.271 baris) → modules/kategori/ (format/state/view/controller/index); pabrik buatManajerKategori di state.js (tanpa DOM); dialog Kelola Kategori dipecah view (render via ctx per sesi) + controller (listener sekali, registri sesi); jembatan re-export 8 nama dipakai 4 modul konsumen. **3-2 kategori selesai 2026-11-21**: 9 berkas konsumen (kegiatan×3, dokumen×3, laporan×1, pengaturan×2) kini impor langsung dari modules/kategori/index.js dan jembatan kategori.js dihapus. **3 sampah selesai 2026-11-21**: sampah.js (793 baris) → modules/sampah/ (format/state/view/controller/index); state tanpa DOM (peta item, langganan where("dihapusAt") != null, hapus batch maks 500, pembersihan otomatis >30 hari), render/galat disuntikkan controller via onData/onGalat; jembatan re-export 9 nama dipakai 2 konsumen. **3-2 sampah selesai 2026-11-21**: 2 konsumen (app.js, dashboard/controller.js) kini impor langsung dari modules/sampah/index.js dan jembatan sampah.js dihapus — seluruh Tahap 3 tuntas | - |
| 4 | Komponen & util bersama | **SELESAI 2026-11-21**: 4a (deduplikasi svgIkon & nama hari/bulan), 4b (tampilkanToast -> js/shared/toast.js), 4c (escapeHtml langsung dari util-html), 4d (jadwal.js: svgIkon + NAMA_HARI/NAMA_BULAN/NAMA_BULAN_PENDEK) | a3d99fe (4c) |
| 5 | Penegakan aturan & dokumentasi | **SELESAI 2026-11-21**: audit kepatuhan (SDK Firebase hanya di services/; fetch ke API Google hanya di services/ — pengecualian terdokumentasi: pengaturan/view.js fetch("/sw.js") milik sendiri untuk cek versi; config/ tanpa impor); entry point rename app.js → main.js (index.html + APP_SHELL); dokumentasi STRUKTUR.md diselaraskan |
| Fitur foto | Unggah foto ke Drive + kaitkan kegiatan | **SELESAI 2026-11-21 (Tahap A+B)**: KOLEKSI.FOTO + NAMA_FOLDER_FOTO + UKURAN_HALAMAN_FOTO di constants; services/driveService.js bertambah pastikanFolderFotoDrive (folder "Foto Kegiatan" di bawah folder induk, id disimpan di pengaturan/drive.fotoFolderId); modul modules/foto/{state,view,controller,index}.js (langganan realtime koleksi "foto", unggah multi-berkas via unggahBerkasKeDrive, thumbnail via Drive API + token OAuth — ambilThumbnailFotoDrive: thumbnailLink dulu, cadangan alt=media maks 15 MB, blob URL + cache memori; host thumbnail butuh izin connect-src https://*.googleusercontent.com di firebase.json); hapus = Drive ke sampah + hapus dokumen; firestore.rules: koleksi "foto" + bidang fotoFolderId | - |
| Foto di kartu Kegiatan | Integrasi foto ke halaman Kegiatan + hapus halaman Foto | **SELESAI 2026-11-21**: entri "Foto" DIHAPUS dari MENU_SECTIONS (sidebar.js) — panel section-foto ikut hilang; foto/view.js: htmlFotoKegiatan() merender blok foto (label jumlah + tombol "Unggah Foto" + kisi thumbnail) yang disisipkan ke tiap kartu kegiatan (kegiatan/view.js impor getDaftarFoto dari foto/state + htmlFotoKegiatan dari foto/view); foto/controller.js: bukaModalUnggahFoto(kegiatanId) — modal tanpa dropdown, judul kegiatan tampil sebagai teks statis #foto-upload-kegiatan-judul (index.html), klik tombol unggah/hapus ditangani delegasi document; thumbnail dimuat via MutationObserver pada #kegiatan-list-region; perubahan foto memicu renderDaftarKegiatan; CSS .kegiatan-foto/.form-static-value di style.css; SW v1.8.28 | - |
| Dokumen di kartu Kegiatan | Tampilkan & unggah dokumen terkait per kegiatan | **SELESAI 2026-11-21**: modules/dokumen/kegiatan-view.js (baru) — htmlDokumenKegiatan() merender blok "Dokumen (n)" berisi daftar dokumen terkait (ikon jenis, tautan Drive, ukuran) + tombol "Unggah Dokumen" + tombol hapus per dokumen; kegiatan/view.js menyisipkan blok ini di tiap kartu (impor getDaftarDokumen + htmlDokumenKegiatan); kegiatan/controller.js berlangganan onPerubahanDokumen untuk menyegarkan kartu; dokumen/controller.js: bukaModalUnggahDokumen(kegiatanIdAwal) mengisi dropdown kegiatan otomatis, delegasi document menangani [data-action="unggah-dokumen-kegiatan"] dan .tombol-hapus-dokumen-kegiatan (memakai dialog hapus dokumen yang sudah ada — pilihan hapus dari aplikasi / Drive); unggah berulang didukung (tanpa batas satu kali); CSS .kegiatan-dokumen* di style.css; SW v1.8.30 + kegiatan-view.js di APP_SHELL | - |
| Info teknologi & kapasitas | Kartu Teknologi + Kapasitas Layanan di Pengaturan | **SELESAI 2026-11-21**: kartu "Teknologi yang Digunakan" (HTML/CSS/JS ES Module vanilla, Firestore + Firebase SDK v11.4.0, Firebase Auth + GIS, Drive API v3 scope drive.file, Sheets/Docs API, Firebase Hosting, PWA) dan kartu "Kapasitas Layanan" — kapasitas Drive dibaca dari Drive API about.get?fields=storageQuota (fungsi services/driveService.js: ambilKapasitasDrive; konstanta DRIVE_ABOUT_API) menampilkan terpasang/tersedia/terpakai + bar persentase; Firestore menampilkan batas paket gratis Spark dari KUOTA_FIRESTORE_SPARK (config/constants.js) + catatan bahwa pemakaian aktual hanya terlihat di Firebase Console (tidak ada API kuota sisi klien); controller: perbaruiKapasitasDrive()/muatKapasitasDriveSekali() (cache, tombol "Perbarui" memaksa baca ulang, dimuat saat init & setelah login di main.js, direset saat keluar); CSS .capacity-bar di style.css; SW v1.8.31 | - |
| Panduan kuota Firestore | Info Spark + panduan Monitoring API di Pengaturan | **SELESAI 2026-11-22**: kartu Cloud Firestore (Spark) pada kartu Kapasitas Layanan diperbarui — catatan kaki diganti dan ditambah elemen lipat `<details class="settings-guide">` (tanpa JS, sesuai aturan view) berisi 4 langkah: (1) aktifkan Cloud Monitoring API di proyek msgkuna-app-85dfb (tautan API Library), (2) cara tercepat tanpa kode via Metrics Explorer dengan metrik firestore.googleapis.com/document/read_count, write_count, delete_count, storage/utilization, (3) contoh curl monitoring.googleapis.com/v3/projects/{projectId}/timeSeries dengan scope https://www.googleapis.com/auth/monitoring.read, (4) batasan (hanya pemakaian, bukan sisa kuota; metrik tertunda; zona waktu Pasifik). CSS .settings-guide/.settings-guide-steps di style.css; komentar KUOTA_FIRESTORE_SPARK diperbarui; SW v1.8.34 | - |
| Pemakaian Firestore otomatis | Pemakaian nyata Firestore via Cloud Monitoring API di kartu Kapasitas Layanan | **DIPULIHKAN 2026-11-24, DORMAN (v1.8.40)**: riwayat — v1.8.35–v1.8.37 dicabut di v1.8.38 karena 403 penagihan; jalur klien dihidupkan kembali dan diuji ulang, hasilnya tetap 403 <em>&ldquo;This API method requires billing to be enabled&rdquo;</em> (proyek #641787111254 belum menautkan akun penagihan). Keputusan pengguna: kode dipertahankan, pesan diperjelas. Yang terpasang: (1) `config/constants.js` — `MONITORING_SCOPE`, `MONITORING_TIMESERIES_API`, `KUNCI_STORAGE_IZIN_MONITORING`, `KUOTA_FIRESTORE_SPARK_ANGKA`, `METRIK_PEMAKAIAN_FIRESTORE` (nama utama `read_ops_count`/`write_ops_count`/`delete_ops_count`/`storage/data_and_index_storage_bytes` + cadangan `…_count`/`storage/utilization`), `PERIODE_AGREGASI_PEMAKAIAN_DETIK`, `ZONA_WAKTU_KUOTA_FIRESTORE`, `URL_AKTIFKAN_PENAGIHAN`; (2) `services/authService.js` — `mintaTokenMonitoring`/`getMonitoringAccessToken`/`isMonitoringTokenExpired`/`apakahIzinMonitoringPernahDiberikan`, pencabutan token ganda saat logout; (3) `services/monitoringService.js` — `awalHariPasifik()`, `ambilDeretSatuMetrik` → `ambilDeretDenganCadangan`, `ambilPemakaianFirestore`, deteksi `err.isBillingRequired`; (4) `modules/pengaturan/{view,controller,index}.js` + `main.js` — kartu pemakaian, grafik batang per jam, tombol muat, pemuatan senyap bila izin sudah ada, baris bantuan penagihan (`#settings-firestore-billing-help`, tampil hanya saat galat penagihan); (5) CSS `.firestore-usage-*` & `.sub-card-title-kecil`. SW v1.8.40 + monitoringService.js di APP_SHELL. <strong>Catatan:</strong> akses otomatis mustahil pada paket Spark — Cloud Function juga terkena batas yang sama dan deploy-nya pun mensyaratkan Blaze | - |
| Pencarian ke header & dokumen kegiatan | Pindah pencarian global, kolom dokumen di form, dokumen di jadwal | **SELESAI 2026-11-22**: (1) kotak pencarian sidebar (#sidebar-search-btn + CSS .sidebar-search-*) dihapus; tombol header #header-search-btn selalu tampil (media query display:none ≥600px dihapus); pencarian-global.js tidak lagi mengikat sidebarBtn (Ctrl+K dan "/" tetap). (1b) pill indikator koneksi sidebar (#sidebar-network-indicator + CSS .sidebar-network-pill/.network-dot/.network-label, termasuk aturan collapsed) DIHAPUS; indikator kini #header-network-indicator (ikon wifi/wifi-off saja) di ujung kanan header; perbaruiStatusKoneksiSidebar (sidebar.js) mengurus elemen header; CSS .header-network-indicator di style.css. (2) Form Tambah/Ubah Kegiatan mendapat kolom "Dokumen Pendukung" (#kegiatan-dokumen-input multiple + #kegiatan-dokumen-daftar dengan tombol hapus per berkas); berkas ditampung di memori, divalidasi MAKS_UKURAN_BERKAS_MB (100 MB), dan baru diunggah setelah kegiatan tersimpan (folder mengikuti kategori kegiatan); helper modules/dokumen/unggah-kegiatan.js (unggahBerkasSebagaiDokumenKegiatan) mencatat ke koleksi "dokumen" dengan kegiatanId; pastikanFolderTujuanKategoriSiap dipindah ke modules/dokumen/folder.js agar dipakai bersama tanpa impor melingkar; kegagalan unggah dilaporkan via toast tanpa membatalkan kegiatan. (3) jadwal.js menyisipkan htmlDokumenKegiatan() di setiap kartu (kalender tanggal terpilih & daftar agenda) dan berlangganan onPerubahanDokumen; kontrol unggah/hapus memakai delegasi global modul dokumen yang sudah ada; CSS .form-file-* di style.css; SW v1.8.33 + folder.js & unggah-kegiatan.js di APP_SHELL | - |
| Pengingat cadangan, filter kategori dokumen, kartu lipat Pengaturan | Perbaikan tiga kendala yang dilaporkan pemilik | **SELESAI 2026-11-24**: (1) `modules/pengaturan/controller.js` memasang listener `change` untuk `#settings-backup-interval-select` (memanggil `simpanIntervalCadangan` yang sebelumnya tak pernah dipakai) sehingga pilihan 7/14/30 hari/Nonaktif benar-benar tersimpan; `modules/pengaturan/state.js` `muatPengaturanCadangan()` kini memilih waktu ekspor PALING BARU antara salinan localStorage dan Firestore (dulu nilai server selalu menimpa sehingga ekspor yang penulisan servernya gagal terasa hilang dan banner "Ekspor sekarang" muncul lagi tiap hari), mengutamakan interval lokal, dan memulihkan catatan server secara best-effort bila salinan lokal lebih baru. (2) `modules/kategori/state.js`: `unsubscribe()` tidak lagi memanggil `listenersPerubahan.clear()` — hanya penerima dari panggilan `subscribe()` terakhir yang dilepas (`penerimaSubscribeAktif`), sehingga `manajerKategoriDokumen.onChange()` milik halaman Dokumen tetap hidup setelah langganan dipasang ulang saat login (gejala: dropdown Kategori Dokumen hanya berisi "Semua Kategori"); `modules/dokumen/controller.js` juga mengisi dropdown itu saat `initHalamanDokumen()`. (3) `modules/pengaturan/view.js`: kartu Teknologi yang Digunakan, Kapasitas Layanan, Cadangan Data, dan Hari Libur & Hari Besar kini `<details class="dash-card dash-card-lipat">` dengan header `<summary>` (Teknologi & Cadangan tertutup bawaan; Kapasitas & Hari Libur terbuka); CSS `.dash-card-lipat`, `.dash-card-summary`, `.dash-card-chevron`, `.dash-card-summary-actions` di style.css; klik tombol di dalam summary dicegah men-toggle kartu lewat listener capture + preventDefault. SW v1.8.41 | - |

### Progres Tahap 3 per modul
| Modul | Status |
|---|---|
| dashboard (dari app.js) | **SELESAI 2026-11-21 (3a)**: modules/dashboard/{state,view,controller,index}.js; callback bukaDialogDetailKegiatan disuntikkan via wrapper renderDashboard() di controller.js |
| kegiatan | **SELESAI 2026-11-21 (3e+3e-2)**: modules/kegiatan/{state,format,view,controller,index}.js; jembatan kegiatan.js dihapus — 11 konsumen (app, jadwal, laporan, pencarian-global, sampah, dashboard×2, dokumen×2, pengaturan×2) impor langsung dari modules/kegiatan/index.js. Siklus kegiatan⇄catatan diputus; state tidak menyentuh DOM (pola pengaturan); peristiwa DOM (galat halaman, segarkan detail/dialog) disuntikkan controller via `setelOpsiPeristiwaKegiatan` |
| dokumen | **SELESAI 2026-11-21 (3d+3d-2)**: modules/dokumen/{state,format,view,controller,index}.js; jembatan dokumen.js dihapus — 7 konsumen (app, laporan, pencarian-global, dashboard, pengaturan) impor langsung dari modules/dokumen/index.js. State tidak menyentuh DOM; render dipicu lewat onPerubahanDokumen; `setUnggahSedangBerjalan` di view menjaga tombol submit saat unggahan berjalan |
| catatan | **SELESAI 2026-11-21 (3+3-2)**: modules/catatan/{state,format,view,controller,index}.js; state tanpa DOM (pola pengaturan), galat halaman disuntikkan controller via `setelOpsiPeristiwaCatatan`; registri sumber kegiatan (pemutus siklus 3e) di state.js; jembatan catatan.js dihapus — 10 konsumen (app, laporan, pencarian-global, sampah, dashboard×2, kegiatan×2, pengaturan×2) impor langsung dari modules/catatan/index.js |
| laporan | **SELESAI 2026-11-21 (3+3-2, 2d)**: modules/laporan/{state,format,view,controller,index}.js; state tanpa DOM (pola pengaturan), render ulang setelah data sumber termuat disuntikkan controller via `setelOpsiPeristiwaLaporan`; panggilan Sheets API kini di services/sheetsService.js (Tahap 2d, modules/laporan/sheets.js dihapus); jembatan laporan.js dihapus — 3 konsumen (app.js, pengaturan controller+view) impor langsung dari modules/laporan/index.js |
| kategori | **SELESAI 2026-11-21 (3+3-2)**: modules/kategori/{format,state,view,controller,index}.js; buatManajerKategori (Firestore CRUD, tanpa DOM) di state.js; dialog Kelola Kategori: view.js merender via objek ctx per sesi (dua dialog kegiatan/dokumen bisa hidup bersama), controller.js menyimpan registri sesi aktif + listener modal sekali pasang; jembatan kategori.js dihapus — 9 berkas konsumen impor langsung dari modules/kategori/index.js |
| pengaturan | **SELESAI 2026-11-21 (3b+3b-2)**: modules/pengaturan/{state,view,controller,index}.js; jembatan pengaturan.js dihapus, app.js & modules/dashboard impor langsung dari modules/pengaturan/index.js |
| sampah | **SELESAI 2026-11-21 (3+3-2)**: modules/sampah/{format,state,view,controller,index}.js; state tanpa DOM (peta item, langganan where("dihapusAt") != null, hapus batch maks 500, pembersihan otomatis >30 hari), render & galat halaman disuntikkan controller lewat onData/onGalat di langgananSampah(); filter segmen dimiliki view (setFilterSegmenSampah); jembatan sampah.js dihapus — 2 konsumen (app.js, dashboard/controller.js) impor langsung dari modules/sampah/index.js |

## 7. Catatan penting
- Status commit (2026-11-21): Tahap 4a+4b masuk bersama di commit b941998 "penambahan toast.js" (9 berkas, +164/-151) dan sudah ter-push ke origin/main. Working tree bersih. Pelajaran: saat bekerja bertahap di working tree yang sama, commit tiap tahap SEBELUM tahap berikutnya mulai agar riwayat tidak tercampur.
- PENTING pengujian: sw.js VERSION (kini v1.8.41) meng-precache semua berkas JS di APP_SHELL. Setelah mengubah JS, naikkan VERSION di sw.js DAN VERSI_CADANGAN_SW di js/config/constants.js bersamaan, plus daftarkan berkas JS baru di APP_SHELL.
- Kendala yang sudah dipastikan (2026-11-24): Cloud Monitoring API menolak proyek ini dengan 403 "requires billing to be enabled" selama belum ada akun penagihan tertaut. Pemakaian Firestore otomatis TIDAK akan berfungsi pada paket Spark — baik lewat pemanggilan klien maupun Cloud Function (deploy Cloud Function pun mensyaratkan Blaze). Jangan mengulang percobaan ini tanpa memastikan penagihan proyek sudah aktif.
- Bug/perilaku yang harus dijaga: siklus `kegiatan<->catatan` saat ini berfungsi (ES module hoisting); saat memutus siklus, pastikan modal "catatan terkait kegiatan" tetap jalan.
- Urutan kerja yang disarankan hasil audit: (1) pindahkan toast/escapeHtml keluar dari sidebar.js, (2) bentuk services/firestoreService + driveService dari pola yang sudah ada, (3) pecah app.js -> dashboard module, (4) pecah pengaturan.js, dokumen.js.
- Keputusan yang sudah diambil: struktur target tidak berubah; entry point baru diberi nama `main.js` — SUDAH DIJALANKAN pada Tahap 5.
