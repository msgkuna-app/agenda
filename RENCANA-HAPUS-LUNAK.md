# Rencana — Hapus Lunak untuk Dokumen, Foto, dan Laporan

Status: **RENCANA, belum dikerjakan.** Versi aplikasi saat rencana disusun: **v1.8.41**
(commit a1f7d39). Disusun 2026-11-24.

---

## 1. Permintaan

Koleksi **dokumen**, **foto**, dan **laporan** agar memakai hapus lunak seperti
**kegiatan** dan **catatan**: item yang dihapus tidak langsung lenyap dari Firestore,
melainkan masuk **Tempat Sampah** selama 30 hari dan masih dapat dipulihkan.

## 2. Keadaan sekarang

| Koleksi | Cara hapus sekarang | Masuk Tempat Sampah |
|---|---|---|
| kegiatan | lunak (`dihapusAt`) | ya |
| catatan | lunak (`dihapusAt`) + `driveDiSampah` | ya |
| **dokumen** | **permanen** (`deleteDoc`) | tidak |
| **foto** | **permanen** (`deleteDoc`) | tidak |
| **laporan** | **permanen** (`deleteDoc`) | tidak |

Saat menghapus:

- **Dokumen** (`dokumen/controller.js:1274-1313`): pengguna memilih lewat radio
  `#dokumen-delete-mode-drive` — buang berkas ke Sampah **Google Drive** sekaligus,
  atau hapus dari daftar aplikasi saja. Setelah itu `deleteDoc` dijalankan.
- **Foto** (`foto/controller.js:157-171`): `confirm()` lalu **selalu**
  `pindahkanItemKeSampahDrive`, kemudian `deleteDoc`.
- **Laporan** (`laporan/state.js:680`): hanya `deleteDoc`. Riwayat laporan tidak punya
  berkas Drive, hanya tautan Google Sheets. Karena itu laporan **tidak** memerlukan
  penanganan Drive sama sekali.

## 3. Empat kendala yang wajib diselesaikan

### 3.1 Aturan Firestore menolak field `dihapusAt`

`validDokumen` (`firestore.rules:140`), `validFoto` (`:185`), dan `validLaporan`
(`:275`) memakai `d.keys().hasOnly([...])` yang **tidak memuat `dihapusAt`**.
Menulis field itu akan ditolak dengan `permission-denied`.

Pola yang sudah benar ada di `validKegiatan` (`:49-65`) dan `validCatatan`:

```javascript
&& (!('dihapusAt' in d) || d.dihapusAt == null || (d.dihapusAt is string && d.dihapusAt.size() <= 50));
```

Enam fungsi harus disesuaikan: `validDokumen`, `validDokumenUbah`, `validFoto`,
`validFotoUbah`, `validLaporan`, `validLaporanUbah`. Karena berkas Drive baru dipindahkan
saat hapus permanen (bagian 6 butir 1), **tidak ada field baru** yang diperlukan —
cukup `dihapusAt`.

### 3.2 Indeks komposit belum ada

`firestore.indexes.json` kini hanya memuat indeks untuk `kegiatan` dan `catatan`.
Kueri baru memerlukan:

| Koleksi | Kueri | Indeks yang perlu ditambahkan |
|---|---|---|
| dokumen | `where(dihapusAt == null)` + `orderBy(tanggalUnggah desc)` | `dihapusAt ASC, tanggalUnggah DESC` |
| foto | `where(dihapusAt == null)` + `orderBy(createdAt desc)` | `dihapusAt ASC, createdAt DESC` |
| laporan | `where(dihapusAt == null)` (+ `orderBy(createdAt desc)`) | `dihapusAt ASC, createdAt DESC` |

Kueri Tempat Sampah (`where("dihapusAt", "!=", null)`) cukup memakai indeks otomatis
satu bidang, sama seperti kegiatan dan catatan sekarang.

Catatan: kueri "jumlah pemakai kategori" (`where(kategoriId == …)` + `where(dihapusAt == null)`)
**tidak** memerlukan indeks komposit karena hanya berisi penyaring kesamaan — inilah
sebabnya `hitungKegiatanPemakaiServer` berjalan tanpa indeks khusus.

### 3.3 Data lama tidak punya field `dihapusAt` — ini yang paling berbahaya

Kueri `where("dihapusAt", "==", null)` **tidak cocok** dengan dokumen yang belum
memiliki field tersebut. Bila kode baru dipasang lebih dulu, seluruh dokumen, foto, dan
laporan lama **akan hilang dari aplikasi** walaupun datanya masih utuh di Firestore.

Persoalan yang sama pernah terjadi pada kegiatan dan catatan — itulah alasan tombol
**"Periksa & Lengkapi Field dihapusAt"** ada di `pengaturan/view.js:642-655` dan
`jalankanMigrasiDihapusAt` (`pengaturan/controller.js:567`) yang **kini hanya menangani
kegiatan dan catatan**:

```javascript
const [snapKegiatan, snapCatatan] = await Promise.all([
  getDocs(collection(db, KOLEKSI.KEGIATAN)),
  getDocs(collection(db, KOLEKSI.CATATAN))
]);
```

Migrasi itu harus diperluas ke dokumen, foto, dan laporan sebelum kode penyaring dipakai.

### 3.4 Modul Tempat Sampah masih terpaku dua jenis

`sampah/state.js` memiliki dua peta dan dua langganan yang ditulis terpisah
(`petaKegiatanSampah`, `petaCatatanSampah`). `sampah/view.js:18` membatasi filter pada
`"semua" | "kegiatan" | "catatan"`, dengan opsi dropdown di `:82-83`.
`sampah/controller.js` bercabang `tipe === "kegiatan" ? … : catatan` (`:151`, `:203`).

Menambah tiga jenis dengan menyalin pola yang ada akan menghasilkan lima salinan hampir
identik. Karena itu modul ini perlu diubah menjadi **berbasis tabel jenis** lebih dulu.

## 4. Urutan pekerjaan (wajib berurutan)

Urutan ini disusun agar **tidak ada tahap yang membuat data lama tidak terlihat**.

### Tahap A — Aturan & indeks (v1.8.42, tanpa perubahan perilaku) — **SELESAI 2026-11-24**
1. `firestore.rules`: tambahkan `dihapusAt` pada enam fungsi validator dokumen/foto/laporan.
   Field `driveDiSampah` **tidak** ditambahkan (lihat bagian 6.1 — cukup `dihapusAt` saja).
2. `firestore.indexes.json`: tambahkan tiga indeks pada tabel 3.2.
3. Perluas `jalankanMigrasiDihapusAt` agar mencakup dokumen, foto, dan laporan; perbarui
   teks tombol dan statusnya di `pengaturan/view.js`.
4. **Tidak ada** kueri yang diubah. Aplikasi berperilaku persis seperti v1.8.41.
5. Deploy: `firebase deploy --only firestore:rules,firestore:indexes,hosting`.
6. **Anda menjalankan tombol migrasi** di Pengaturan dan memastikan hasilnya melaporkan
   0 dokumen perlu migrasi.

Catatan pelaksanaan:
- Tabel `KOLEKSI_HAPUS_LUNAK` ditempatkan di `config/constants.js` (bukan di dalam
  controller) karena Tahap B akan memakainya juga di modul Tempat Sampah. Setiap entri
  berisi `key` (nama koleksi), `label` (kapital, untuk UI filter) dan `satuan`
  (huruf kecil, untuk kalimat laporan migrasi).
- Hasil yang perlu dicatat saat deploy: `firestore.rules` dan `firestore.indexes.json`
  berubah, jadi deploy wajib menyertakan `firestore:rules,firestore:indexes` — bukan
  hanya `hosting`.

### Tahap B — Generalisasi modul Tempat Sampah (v1.8.43, tanpa perubahan perilaku)
1. `sampah/state.js`: ganti dua peta menjadi peta berkunci jenis, dengan tabel jenis:
   `{ kegiatan, catatan, dokumen, foto, laporan }` — masing-masing menyebut koleksi,
   kunci judul, dan cara memulihkan.
2. `sampah/view.js`: opsi filter dibuat dari tabel jenis; label dan ikon per jenis.
3. `sampah/controller.js`: hapus percabangan `tipe === "kegiatan" ? … : catatan`.
4. Belum ada koleksi baru yang benar-benar dilanggan — tabelnya masih berisi dua jenis.
5. Uji: Tempat Sampah berjalan sama seperti sebelumnya.

### Tahap C — Hapus lunak untuk dokumen & foto (v1.8.44)
1. `dokumen/state.js` dan `foto/state.js`: tambahkan `hapusLunak(id)`, `pulihkan(id)`,
   dan `hapusPermanen(id)`.
2. `hapusLunak(id)` hanya menulis `dihapusAt` + `updatedAt`. **Tidak memanggil Drive**
   dan karenanya berhasil juga saat luring.
3. `pulihkan(id)` mengembalikan `dihapusAt` menjadi `null`. Tidak menyentuh Drive karena
   berkas belum pernah dipindahkan.
4. `hapusPermanen(id)` — inilah satu-satunya tempat `pindahkanItemKeSampahDrive`
   dipanggil untuk dokumen dan foto, lalu `deleteDoc`. Rotari tombol radio
   `#dokumen-delete-mode-drive` dipindahkan dari dialog hapus ke dialog hapus permanen di
   Tempat Sampah (Tahap E); bila Anda lebih suka disederhanakan, radio itu dapat dihapus
   dan perilakunya dijadikan tetap.
5. `foto/controller.js:157-171` — `confirm()` diubah menjadi pemberitahuan "dipindahkan
   ke Tempat Sampah" dan tidak lagi memanggil Drive.
6. Uji: hapus lunak satu dokumen dan satu foto dalam keadaan luring, lalu pastikan
   keduanya masih ada di Firestore dan berkasnya masih ada di Google Drive.

### Tahap D — Alihkan kueri ke hapus lunak (v1.8.45)
1. `dokumen/state.js`: `langgananDokumen`, `muatLebihBanyakDokumen`,
   `ambilSemuaDokumenSekaliPakai`, dan `hitungDokumenPemakaiServer` menambahkan
   `where("dihapusAt", "==", null)`; kursor paginasi disesuaikan dengan urutan baru.
2. `foto/state.js`: `langgananFoto` menambahkan penyaring yang sama.
3. `laporan/state.js`: `langgananRiwayatLaporan` menambahkan penyaring yang sama.
4. `pengaturan/controller.js`: penyusun payload ekspor/impor (`:696-720`) menyertakan
   `dihapusAt` sehingga berkas cadangan lama tetap dapat diimpor. Sesuai keputusan
   bagian 6 butir 3, **hanya item aktif yang diekspor**.
5. Tombol hapus di antarmuka diarahkan ke `hapusLunak` (Tahap C).
6. Uji menyeluruh: daftar Dokumen, daftar Foto pada kartu Kegiatan, riwayat Laporan,
   pencarian global, ekspor JSON, impor JSON, dan penghitung pemakai kategori.

### Tahap E — Daftarkan tiga jenis baru ke Tempat Sampah (v1.8.46)
1. `sampah/state.js`: tambahkan tiga langganan dan tiga peta.
2. `sampah/controller.js`: cabang pulihkan dan hapus permanen untuk tiga jenis baru.
3. Hapus permanen dari Tempat Sampah memanggil `pindahkanItemKeSampahDrive` untuk
   dokumen dan foto (berkas baru dipindahkan di titik ini), lalu `deleteDoc`.
4. Pembersihan otomatis >30 hari mencakup tiga jenis baru **dan** memindahkan berkas
   Drive-nya, agar berkas tidak tertinggal di Drive setelah metadata dihapus.
5. Uji: hapus tiap jenis, lihat di Tempat Sampah, pulihkan, lalu hapus permanen dan
   pastikan berkasnya berpindah ke Sampah Google Drive.

## 5. Berkas yang akan tersentuh

| Berkas | Tahap | Perubahan |
|---|---|---|
| `firestore.rules` | A | 6 validator + 2 field baru |
| `firestore.indexes.json` | A | +3 indeks |
| `modules/pengaturan/controller.js` | A, D | migrasi diperluas; payload ekspor/impor |
| `modules/pengaturan/view.js` | A | teks tombol dan status migrasi |
| `modules/sampah/{state,view,controller}.js` | B, E | berbasis tabel jenis |
| `modules/dokumen/{state,controller}.js` | C, D | hapus lunak + penyaring |
| `modules/foto/{state,controller}.js` | C, D | hapus lunak + penyaring |
| `modules/laporan/{state}.js` | C, D | hapus lunak + penyaring |
| `public/sw.js`, `config/constants.js` | A–E | naikkan versi tiap tahap |
| `STRUKTUR.md` | A–E | catatan tiap tahap |

`services/firestoreService.js` **tidak diubah** pada rencana ini. Bila Tahap 2
(repositori) dikerjakan lebih dulu, penyesuaiannya cukup di `firestoreRepository.js`.

## 6. Keputusan yang sudah diambil (2026-11-24)

1. **Berkas Drive dipindahkan saat hapus permanen.** Saat item dokumen/foto dihapus
   lunak, berkas tetap di Google Drive dan catatan metadata hanya diberi `dihapusAt`.
   `pindahkanItemKeSampahDrive` baru dipanggil ketika item benar-benar dihapus dari
   Tempat Sampah (Tahap E) atau oleh pembersihan otomatis >30 hari.

   Konsekuensi yang harus diingat saat mengerjakan Tahap C dan E:
   - Hapus lunak dokumen/foto **tidak boleh** memanggil Drive sama sekali, sehingga
     menghapus saat luring tetap berhasil (berbeda dari perilaku catatan sekarang yang
     menolak saat luring).
   - `driveDiSampah` tidak lagi berarti "berkas sudah dipindahkan", melainkan "berkas
     perlu dipindahkan saat dihapus permanen". Karena itu penanda ini boleh **tidak**
     ditambahkan ke `firestore.rules` — cukup `dihapusAt` saja. Ini menyederhanakan
     Tahap A: tidak ada field baru, hanya `dihapusAt` pada enam validator.
   - Radio `#dokumen-delete-mode-drive` ("buang berkas ke Sampah Drive") perlu
     dipindahkan dari dialog hapus ke dialog **hapus permanen di Tempat Sampah**, atau
     dihapus sama sekali dan diganti perilaku tetap (selalu pindahkan berkas saat hapus
     permanen). Keputusan ini akan dikonfirmasi lagi pada Tahap C.
   - Pulihkan dari Tempat Sampah hanya perlu mengembalikan `dihapusAt` menjadi `null`
     tanpa menyentuh Drive, sehingga jauh lebih sederhana daripada alur catatan.

2. **Riwayat laporan ikut hapus lunak.** Laporan diperlakukan sama seperti jenis lain;
   tidak ada penanganan Drive karena laporan tidak memiliki berkas.

3. **Ekspor JSON hanya memuat item aktif.** Aturan ini berlaku untuk seluruh koleksi.
   `ambilSemuaDokumenSekaliPakai` (dan padanannya) akan menyaring `dihapusAt == null`,
   sehingga cadangan tidak memunculkan kembali item yang sudah dihapus.

## 7. Perkiraan

| Tahap | Isi | Beban |
|---|---|---|
| A | Aturan, indeks, migrasi | sedang — **wajib paling awal** |
| B | Generalisasi modul Sampah | sedang |
| C | Hapus lunak untuk dokumen & foto | sedang |
| D | Alihkan kueri | berat — paling banyak berkas |
| E | Tiga jenis baru di Tempat Sampah | sedang |

Lima tahap, masing-masing satu commit dan satu kenaikan versi Service Worker. Perkiraan
keseluruhan setara dua kali pekerjaan perbaikan tiga bug pada v1.8.41.

## 8. Yang tidak termasuk

- Kategori (`kategoriKegiatan`, `kategoriDokumen`) tetap hapus permanen. Permintaan Anda
  tidak menyebutnya, dan menghapus kategori sudah memiliki pengaman penghitung pemakai.
- Tidak ada perubahan masa simpan 30 hari.
- Tidak ada perubahan pada penghapusan berkas di Google Drive selain yang disebut di
  bagian 6 butir 1.
