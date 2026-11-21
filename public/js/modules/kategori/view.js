/**
 * View Modul Kategori (Tahap 3: dipisah dari kategori.js)
 * Seluruh render DOM dialog "Kelola Kategori" (kegiatan & dokumen): banner pesan,
 * penghitung karakter, pemilih warna, daftar kategori, panel tawaran Drive, dan
 * hitungan pemakai server.
 *
 * Setiap fungsi menerima satu objek `ctx` yang dibuat controller.js per sesi
 * dialog. State sesi (terbuka, warna terpilih, cache hitungan, tawaran Drive)
 * tetap per-instance sehingga dialog kegiatan dan dialog dokumen dapat hidup
 * bersamaan dengan berbagi modal DOM yang sama — sama seperti closure aslinya.
 * View tidak memanggil Firestore secara langsung; semua akses data lewat
 * `ctx.manajer` (dibuat state.js).
 */
import { escapeHtml } from "../../util-html.js";
import { PRESET_WARNA_KATEGORI, normalisasiWarnaKategori } from "./format.js";

export function tampilkanPesan(ctx, pesan, tipe = "danger") {
  if (!ctx.alertBox || !ctx.alertText) return;
  if (!pesan) {
    ctx.alertText.textContent = "";
    ctx.alertBox.hidden = true;
    ctx.alertBox.classList.remove("alert-box-warning", "alert-box-success");
    return;
  }
  ctx.alertText.textContent = pesan;
  ctx.alertBox.classList.toggle("alert-box-warning", tipe === "warning");
  ctx.alertBox.classList.toggle("alert-box-success", tipe === "success");
  ctx.alertBox.hidden = false;
}

export function perbaruiPenghitungKarakter(ctx) {
  if (!ctx.inputNama || !ctx.charCounter) return;
  const panjang = ctx.inputNama.value.length;
  ctx.charCounter.textContent = `${panjang}/40`;
}

export function renderPilihanWarna(ctx) {
  if (!ctx.swatchContainer) return;
  ctx.swatchContainer.innerHTML = PRESET_WARNA_KATEGORI.map((w) => {
    const dipilih = w.id === ctx.warnaTerpilih;
    return `
        <button
          type="button"
          class="color-swatch-btn${dipilih ? " is-selected" : ""}"
          data-warna="${escapeHtml(w.id)}"
          role="radio"
          aria-checked="${dipilih ? "true" : "false"}"
          aria-label="${escapeHtml(w.label)}"
          title="${escapeHtml(w.label)}"
        >
          <span class="swatch-dot cat-dot-${escapeHtml(w.id)}" aria-hidden="true"></span>
          <span class="swatch-name">${escapeHtml(w.label)}</span>
        </button>
      `;
  }).join("");
}

export function resetFormKeTambah(ctx) {
  if (ctx.inputId) ctx.inputId.value = "";
  if (ctx.inputNama) ctx.inputNama.value = "";
  ctx.warnaTerpilih = PRESET_WARNA_KATEGORI[0].id;
  if (ctx.formHeading) ctx.formHeading.textContent = "Tambah Kategori Baru";
  if (ctx.submitBtn) ctx.submitBtn.textContent = "Tambah Kategori";
  if (ctx.cancelEditBtn) ctx.cancelEditBtn.hidden = true;
  perbaruiPenghitungKarakter(ctx);
  renderPilihanWarna(ctx);
}

export function mulaiModeUbah(ctx, kat) {
  if (!kat || !kat.id) return;
  tampilkanPesan(ctx, "");
  if (ctx.inputId) ctx.inputId.value = kat.id;
  if (ctx.inputNama) {
    ctx.inputNama.value = kat.nama;
    ctx.inputNama.focus();
  }
  ctx.warnaTerpilih = normalisasiWarnaKategori(kat.warna);
  if (ctx.formHeading) ctx.formHeading.textContent = `Ubah Kategori "${kat.nama}"`;
  if (ctx.submitBtn) ctx.submitBtn.textContent = "Simpan Perubahan";
  if (ctx.cancelEditBtn) ctx.cancelEditBtn.hidden = false;
  perbaruiPenghitungKarakter(ctx);
  renderPilihanWarna(ctx);
}

export function ambilJumlahPemakai(ctx, kategoriId) {
  const lokal = typeof ctx.hitungPemakaiLokal === "function" ? ctx.hitungPemakaiLokal(kategoriId) : 0;
  if (kategoriId && ctx.cacheHitunganServer.has(kategoriId)) {
    return Math.max(lokal, ctx.cacheHitunganServer.get(kategoriId));
  }
  return lokal;
}

export async function segarkanHitunganServerSemua(ctx) {
  if (!ctx.terbuka || !navigator.onLine || ctx.sedangMemuatHitunganServer) return;
  ctx.sedangMemuatHitunganServer = true;
  try {
    const daftar = ctx.manajer.getDaftarKategori();
    await Promise.all(
      daftar.map(async (kat) => {
        try {
          const jml = await ctx.manajer.hitungPemakaiDariServer(kat.id);
          ctx.cacheHitunganServer.set(kat.id, jml);
        } catch (_e) {
          // Gunakan hitungan lokal sebagai cadangan tampilan
        }
      })
    );
    if (ctx.terbuka) {
      renderDaftarKategori(ctx);
    }
  } finally {
    ctx.sedangMemuatHitunganServer = false;
  }
}

function renderPanelTawaranDriveAtas(ctx) {
  const blok = [];
  const manajer = ctx.manajer;

  if (ctx.tawaranBuatUlang404) {
    const kat = manajer.ambilKategoriById(ctx.tawaranBuatUlang404.id) || ctx.tawaranBuatUlang404;
    blok.push(`
        <li class="kategori-drive-callout kategori-drive-callout-warning">
          <div class="kategori-drive-callout-text">
            <strong>Folder Drive tidak ditemukan (404) untuk kategori "${escapeHtml(kat.nama)}".</strong>
            <span>Folder lama mungkin telah dihapus di Google Drive. Anda dapat membuat ulang folder kategori ini dan memindahkan dokumen kategori ini ke dalamnya.</span>
          </div>
          <div class="kategori-drive-callout-actions">
            <button type="button" class="btn-secondary btn-sm-touch" data-action="dismiss-404">Tutup</button>
            <button type="button" class="btn-primary btn-sm-touch" data-action="recreate-folder-404" data-id="${escapeHtml(kat.id)}">
              Buat ulang folder &amp; pindahkan dokumen
            </button>
          </div>
        </li>
      `);
  }

  if (ctx.tawaranSampahFolderTerhapus && ctx.tawaranSampahFolderTerhapus.folderId) {
    const info = ctx.tawaranSampahFolderTerhapus;
    blok.push(`
        <li class="kategori-drive-callout">
          <div class="kategori-drive-callout-text">
            <strong>Kategori "${escapeHtml(info.nama)}" dihapus dari aplikasi.</strong>
            <span>Folder Google Drive kategori ini <strong>tidak dihapus otomatis</strong> agar berkas lain yang mungkin Anda taruh manual di dalamnya tetap aman.</span>
          </div>
          ${
            ctx.konfirmasiSampahTerbuka
              ? `<div class="kategori-drive-trash-warning" role="alert">
                  <p><strong>Peringatan:</strong> Memindahkan folder "${escapeHtml(info.nama)}" ke Sampah Google Drive juga akan memindahkan seluruh isi di dalam folder tersebut ke Sampah Drive. Lanjutkan?</p>
                  <div class="kategori-drive-callout-actions">
                    <button type="button" class="btn-secondary btn-sm-touch" data-action="cancel-trash-folder">Batal</button>
                    <button type="button" class="btn-danger btn-sm-touch" data-action="confirm-trash-folder">Ya, Pindahkan ke Sampah Drive</button>
                  </div>
                </div>`
              : `<div class="kategori-drive-callout-actions">
                  <button type="button" class="btn-secondary btn-sm-touch" data-action="keep-drive-folder">Biarkan Folder di Drive</button>
                  <button type="button" class="btn-danger-outline btn-sm-touch" data-action="ask-trash-folder">
                    Pindahkan folder ke sampah Drive
                  </button>
                </div>`
          }
        </li>
      `);
  }

  return blok.join("");
}

export function renderDaftarKategori(ctx) {
  if (!ctx.listContainer) return;
  const manajer = ctx.manajer;
  const daftar = manajer.getDaftarKategori();
  const labelItem = manajer.labelItemPemakai;
  const sedangOffline = !navigator.onLine;
  const jumlahTanpaKategori =
    typeof ctx.hitungPemakaiLokal === "function" ? ctx.hitungPemakaiLokal("") : 0;

  const panelTawaran = manajer.pakaiFolderDrive ? renderPanelTawaranDriveAtas(ctx) : "";

  const barisKategori = daftar
    .map((kat, index) => {
      const jumlah = ambilJumlahPemakai(ctx, kat.id);
      const palingAtas = index === 0;
      const palingBawah = index === daftar.length - 1;
      const hapusNonaktif = jumlah > 0 || sedangOffline;

      let keteranganHapus = "";
      if (jumlah > 0) {
        keteranganHapus = `Dipakai ${jumlah} ${labelItem} — tidak dapat dihapus`;
      } else if (sedangOffline) {
        keteranganHapus = "Penghapusan memerlukan koneksi internet";
      } else {
        keteranganHapus = `Hapus kategori ${kat.nama}`;
      }

      const belumSinkronDrive = manajer.pakaiFolderDrive && (!kat.folderId || !kat.folderSinkron);

      return `
          <li class="kategori-item" data-id="${escapeHtml(kat.id)}">
            <div class="kategori-item-main">
              <div class="kategori-badges-inline">
                <span class="cat-badge cat-color-${escapeHtml(kat.warna)}">
                  <span class="cat-dot cat-dot-${escapeHtml(kat.warna)}" aria-hidden="true"></span>
                  <span>${escapeHtml(kat.nama)}</span>
                </span>
                ${
                  belumSinkronDrive
                    ? `<span class="sync-warning-badge" title="Folder kategori ini di Google Drive belum dibuat atau namanya belum tersinkron">Folder belum sinkron</span>`
                    : ""
                }
              </div>
              <span class="kategori-count-text">Dipakai ${jumlah} ${escapeHtml(labelItem)}</span>
            </div>

            ${
              belumSinkronDrive && ctx.opsiDrive?.onSinkronkanFolder
                ? `<div class="kategori-sync-row">
                    <span>Subfolder Google Drive belum sinkron dengan kategori ini.</span>
                    <button type="button" class="btn-secondary btn-sm-touch" data-action="sync-folder" data-id="${escapeHtml(kat.id)}" ${sedangOffline ? "disabled" : ""}>
                      Sinkronkan folder
                    </button>
                  </div>`
                : ""
            }

            ${
              jumlah > 0
                ? `<div class="kategori-used-notice">
                    <span>Masih dipakai oleh ${jumlah} ${escapeHtml(labelItem)}.</span>
                    <button type="button" class="btn-link-filter" data-action="filter" data-id="${escapeHtml(kat.id)}">
                      Lihat ${escapeHtml(labelItem)} kategori ini
                    </button>
                  </div>`
                : ""
            }

            <div class="kategori-item-actions">
              <div class="kategori-order-group" role="group" aria-label="Urutan kategori ${escapeHtml(kat.nama)}">
                <button
                  type="button"
                  class="icon-btn icon-btn-bordered"
                  data-action="up"
                  data-id="${escapeHtml(kat.id)}"
                  aria-label="Naikkan urutan ${escapeHtml(kat.nama)}"
                  title="Naikkan urutan"
                  ${palingAtas ? "disabled" : ""}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn-bordered"
                  data-action="down"
                  data-id="${escapeHtml(kat.id)}"
                  aria-label="Turunkan urutan ${escapeHtml(kat.nama)}"
                  title="Turunkan urutan"
                  ${palingBawah ? "disabled" : ""}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>

              <div class="kategori-crud-group">
                <button
                  type="button"
                  class="btn-secondary btn-sm-touch"
                  data-action="edit"
                  data-id="${escapeHtml(kat.id)}"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  class="btn-danger-outline btn-sm-touch"
                  data-action="delete"
                  data-id="${escapeHtml(kat.id)}"
                  title="${escapeHtml(keteranganHapus)}"
                  aria-label="${escapeHtml(keteranganHapus)}"
                  ${hapusNonaktif ? "disabled" : ""}
                >
                  ${jumlah > 0 ? `Hapus (${jumlah})` : "Hapus"}
                </button>
              </div>
            </div>
          </li>
        `;
    })
    .join("");

  const barisTanpaKategori = `
      <li class="kategori-item kategori-item-fixed">
        <div class="kategori-item-main">
          <span class="cat-badge cat-color-netral">
            <span class="cat-dot cat-dot-netral" aria-hidden="true"></span>
            <span>Tanpa Kategori</span>
          </span>
          <span class="kategori-count-text">Dipakai ${jumlahTanpaKategori} ${escapeHtml(labelItem)}</span>
        </div>
        <div class="kategori-fixed-note">
          <span>Kategori tetap sistem (tidak dapat diubah atau dihapus).</span>
          ${
            jumlahTanpaKategori > 0
              ? `<button type="button" class="btn-link-filter" data-action="filter-uncategorized">
                  Lihat ${escapeHtml(labelItem)} kategori ini
                </button>`
              : ""
          }
        </div>
      </li>
    `;

  ctx.listContainer.innerHTML = panelTawaran + barisKategori + barisTanpaKategori;
}
