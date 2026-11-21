# STRUKTUR.md - Agenda & Arsip

> Berkas acuan untuk Project Claude. Perbarui setiap selesai satu tahap refactoring,
> lalu hapus versi lama di Project dan unggah versi baru.

Terakhir diperbarui: 2026-11-21
Tahap saat ini: Tahap 3a (dashboard), 3b (pengaturan), 3d (dokumen) SELESAI — lanjut modul lain dari Tahap 3

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
7. Entry point tunggal: `js/app.js` (boot sinkron: `js/boot-tema.js` di `<head>`).

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
    app.js              (entry point/orkestrator; dashboard SUDAH dipindah, ±660 baris)
    boot-tema.js        (skrip klasik sinkron <head>, anti-FOUC)
    modules/
      dashboard/        (Tahap 3a: state.js, view.js, controller.js, index.js)
      pengaturan/       (Tahap 3b+3b-2: state.js, view.js, controller.js, index.js; jembatan pengaturan.js SUDAH DIHAPUS)
      dokumen/          (Tahap 3d: state.js, format.js, view.js, controller.js, index.js; dokumen.js jadi jembatan)
    config/
      constants.js      (82)
      firebase.js       (33)
    pwa.js
    kegiatan.js  jadwal.js  dokumen.js  catatan.js  laporan.js
    kategori.js  sampah.js  pencarian-global.js
    sidebar.js   tema.js   hari-libur.js  templat-dokumen.js
    filter-panel.js  timeline-harian.js
    util-html.js  util-tanggal.js
    shared/
      toast.js          (tampilkanToast; di-re-export sidebar.js demi kompatibilitas)
    services/
      firestoreService.js (jalur tunggal SDK Firebase; firebase-config.js SUDAH DIHAPUS)
      authService.js      (GIS token + Firebase Auth; auth.js SUDAH DIHAPUS)
      driveService.js     (Google Drive API v3; drive.js SUDAH DIHAPUS)
firebase.json
firestore.indexes.json
firestore.rules
```

### Struktur target
Tidak berubah (lihat versi sebelumnya): `js/main.js`, `config/`, `services/`, `shared/`, `modules/<fitur>/{view,controller,state,utils}`.
Catatan: entry point target `main.js`; saat migrasi, ganti nama `app.js` di langkah terakhir agar `index.html` tidak rusak.

## 4. Daftar berkas (hasil audit 2026-11-21)

Total JS: 18.581 baris / 25 berkas. Kolom "Kondisi": S=service, V=view/DOM, T=state/cache, U=util.

| Berkas | Baris | Kondisi | Diimpor oleh | Catatan |
|---|---|---|---|---|
| js/dokumen.js | 2140 | S+V+T | app, laporan, pencarian-global, pengaturan | terbesar; panggil Firestore+Drive langsung |
| js/pengaturan.js | 2126 | S+V+T | app | god object #2: cadangan semua koleksi + hari libur + migrasi |
| js/laporan.js | 1646 | S+V+T | app, pengaturan | panggil Sheets API langsung (SHEETS_API_BASE) |
| js/kegiatan.js | 1515 | S+V+T | app, catatan, dokumen, jadwal, laporan, pencarian-global, pengaturan, sampah | fan-in 8; siklus dgn catatan |
| js/catatan.js | 1379 | S+V+T | app, kegiatan, laporan, pencarian-global, pengaturan, sampah | siklus dgn kegiatan |
| js/app.js | 1324 | V (orchestrator+dashboard) | index.html | dashboard ±700 baris harus jadi modul sendiri |
| js/drive.js | 1291 | S | app, catatan, dokumen, laporan, pengaturan | sudah service-like, tinggal pindah nama/lokasi |
| js/kategori.js | 1271 | S+V+T | app, dokumen, kegiatan, laporan, pengaturan | `buatManajerKategori` = pola contoh yang bagus |
| js/pencarian-global.js | 955 | V | app | tarik data via `ambilSemuaXSekaliPakai` (OK) |
| js/sampah.js | 793 | S+V+T | app | batch delete otomatis 30 hari |
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
- `laporan.js` memanggil Sheets API (SHEETS_API_BASE) langsung di modul view.
- `drive.js` de-facto driveService tapi diimpor langsung oleh 5 modul (belum lewat lapisan service resmi).

### Kode duplikat
- [SELESAI 2026-11-21, Tahap 4a+4d] `svgIkon` duplikat 6x -> kini semua modul (termasuk jadwal.js) mengimpor dari util-html.js.
- [SELESAI 2026-11-21, Tahap 4a+4d] `NAMA_HARI_PENDEK`/`NAMA_BULAN_PENDEK` duplikat 4x -> kini diimpor dari util-html.js. Di jadwal.js: NAMA_HARI_DARI_MINGGU -> NAMA_HARI, NAMA_BULAN_PANJANG -> NAMA_BULAN, NAMA_BULAN_RINGKAS -> NAMA_BULAN_PENDEK. KOLOM_HARI_SENIN tetap lokal (struktur khusus kalender awal-Senin).
- [BELUM] Pola list+pagination+subscribe hampir identik di kegiatan/catatan/dokumen/laporan (muatLebihBanyakX, ambilSemuaXSekaliPakai, onPerubahanX, subscribeX/unsubscribeX) -> kandidat service generik Tahap 2.

### Dependensi melingkar
- `kegiatan.js:48` -> catatan.js DAN `catatan.js:37` -> kegiatan.js (siklus penuh; hidup karena ES module hoisting, tetap wajib diputus di Tahap 3).
- Fan-in berisiko: `sidebar.js` (10) menyimpan utility non-sidebar; `kegiatan.js` (8).
- [SELESAI 2026-11-21, Tahap 4b] `tampilkanToast` (±130 baris) dipindah dari sidebar.js ke shared/toast.js; sidebar.js kini re-export demi kompatibilitas; 5 konsumen (app, catatan, kegiatan, pengaturan, sampah) kini impor langsung dari shared/toast.js.
- [SELESAI 2026-11-21, Tahap 4c] `escapeHtml` tidak lagi diimpor lewat sidebar.js di modul mana pun; 7 modul kini impor langsung dari util-html.js. sidebar.js hanya diimpor untuk fungsi sidebar asli (initSidebar, pindahKeBagian, perbaruiInfoAkunSidebar, perbaruiStatusKoneksiSidebar, tutupDrawerMobile, getActiveSectionId, bukaDrawerMobile). Re-export di sidebar.js (escapeHtml, escapeAtribut, tampilkanToast) dipertahankan sementara dan boleh dihapus setelah dipastikan tak ada konsumen.

### Poin positif (jangan dirusak saat refactor)
- Config sudah terpusat di `js/config/` (Tahap 1 prakteknya sudah tercapai; tinggal formalisasi).
- Entry point tunggal `app.js`; `boot-tema.js` sinkron anti-FOUC di head.
- `pwa.js` sudah terpisah; `buatManajerKategori` (kategori.js:204) adalah pola factory yang tepat untuk ditiru di service generik.
- util kecil (`util-tanggal` 81, `util-html` 101) sudah bersih dan jadi sumber kebenaran.

## 6. Progres tahap

| Tahap | Isi | Status | Commit |
|---|---|---|---|
| 0 | Audit & peta dependensi | **selesai 2026-11-21** | - |
| 1 | Pusatkan config | sebagian (config/ sudah ada; boot-tema + jembatan firebase-config tersisa) | - |
| 2 | Pusatkan service | **2a+2b+2c selesai 2026-11-21**: services/firestoreService.js (SDK Firebase), services/authService.js (dari auth.js), services/driveService.js (dari drive.js). Jembatan auth.js/drive.js SUDAH DIHAPUS; konsumen impor langsung dari services/. Sisa: 2d (CRUD bermakna, menyatu dengan Tahap 3) | - |
| 3 | Pecah god object (per modul) | **3a selesai 2026-11-21**: app.js (1.324 → ±660 baris); blok dashboard (state/view/controller/index) kini di js/modules/dashboard/. **3b + 3b-2 selesai 2026-11-21**: pengaturan.js (2.126 baris) → modules/pengaturan/; jembatan sudah dihapus. **3d selesai 2026-11-21**: dokumen.js (2.140 baris) → modules/dokumen/ (state/format/view/controller/index); dokumen.js jadi jembatan `export *` sementara | - |
| 4 | Komponen & util bersama | **SELESAI 2026-11-21**: 4a (deduplikasi svgIkon & nama hari/bulan), 4b (tampilkanToast -> js/shared/toast.js), 4c (escapeHtml langsung dari util-html), 4d (jadwal.js: svgIkon + NAMA_HARI/NAMA_BULAN/NAMA_BULAN_PENDEK) | a3d99fe (4c) |
| 5 | Penegakan aturan & dokumentasi | belum | - |

### Progres Tahap 3 per modul
| Modul | Status |
|---|---|
| dashboard (dari app.js) | **SELESAI 2026-11-21 (3a)**: modules/dashboard/{state,view,controller,index}.js; callback bukaDialogDetailKegiatan disuntikkan via wrapper renderDashboard() di controller.js |
| kegiatan | belum |
| dokumen | **SELESAI 2026-11-21 (3d)**: modules/dokumen/{state,format,view,controller,index}.js; dokumen.js jadi jembatan `export *` — lanjut 3d-2 (arahkan konsumen langsung, hapus jembatan). State tidak menyentuh DOM; render dipicu lewat onPerubahanDokumen; `setUnggahSedangBerjalan` di view menjaga tombol submit saat unggahan berjalan |
| catatan | belum |
| laporan | belum |
| kategori | belum |
| pengaturan | **SELESAI 2026-11-21 (3b+3b-2)**: modules/pengaturan/{state,view,controller,index}.js; jembatan pengaturan.js dihapus, app.js & modules/dashboard impor langsung dari modules/pengaturan/index.js |
| sampah | belum |

## 7. Catatan penting
- Status commit (2026-11-21): Tahap 4a+4b masuk bersama di commit b941998 "penambahan toast.js" (9 berkas, +164/-151) dan sudah ter-push ke origin/main. Working tree bersih. Pelajaran: saat bekerja bertahap di working tree yang sama, commit tiap tahap SEBELUM tahap berikutnya mulai agar riwayat tidak tercampur.
- PENTING pengujian: sw.js VERSION (kini v1.8.4) meng-precache semua berkas JS di APP_SHELL. Setelah mengubah JS, naikkan VERSION di sw.js DAN VERSI_CADANGAN_SW di js/config/constants.js bersamaan, plus daftarkan berkas JS baru di APP_SHELL.
- Bug/perilaku yang harus dijaga: siklus `kegiatan<->catatan` saat ini berfungsi (ES module hoisting); saat memutus siklus, pastikan modal "catatan terkait kegiatan" tetap jalan.
- Urutan kerja yang disarankan hasil audit: (1) pindahkan toast/escapeHtml keluar dari sidebar.js, (2) bentuk services/firestoreService + driveService dari pola yang sudah ada, (3) pecah app.js -> dashboard module, (4) pecah pengaturan.js, dokumen.js.
- Keputusan yang sudah diambil: struktur target tidak berubah; entry point baru diberi nama `main.js` pada langkah terakhir migrasi.
