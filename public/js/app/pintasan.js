/**
 * Modul Pintasan Aksi URL (Agenda & Arsip - Fase 7C)
 * Menangani aksi pintasan URL (?aksi=tambah-kegiatan atau ?aksi=catatan-baru)
 * yang dipicu dari pintasan PWA (Web App Shortcuts) atau navigasi eksternal.
 */

import { hariIni } from "../util-tanggal.js";
import { bukaModalFormKegiatan } from "../kegiatan.js";
import { pindahKeBagian } from "../sidebar.js";

const DAFTAR_PUTIH_AKSI_PINTASAN = ["tambah-kegiatan", "catatan-baru"];
let aksiPintasanTertunda = null;
let aksiPintasanSudahDijalankan = false;

function bersihkanParameterAksiUrl() {
  try {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );
  } catch (_err) {}
}

export function bacaAksiPintasanDariUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const aksi = params.get("aksi");
    if (aksi && DAFTAR_PUTIH_AKSI_PINTASAN.includes(aksi)) {
      aksiPintasanTertunda = aksi;
    }
    if (params.has("aksi")) {
      bersihkanParameterAksiUrl();
    }
  } catch (_err) {}
}

export function batalkanAksiPintasanTertunda() {
  aksiPintasanTertunda = null;
}

export function jalankanAksiPintasanSetelahLayarTampil() {
  if (aksiPintasanSudahDijalankan || !aksiPintasanTertunda) {
    bersihkanParameterAksiUrl();
    return;
  }
  const aksi = aksiPintasanTertunda;
  aksiPintasanTertunda = null;
  aksiPintasanSudahDijalankan = true;
  bersihkanParameterAksiUrl();

  if (aksi === "tambah-kegiatan") {
    bukaModalFormKegiatan(null, hariIni());
  } else if (aksi === "catatan-baru") {
    pindahKeBagian("catatan");
    requestAnimationFrame(() => {
      const btnTambah = document.getElementById("btn-tambah-catatan-singkat");
      if (btnTambah) {
        btnTambah.click();
      }
    });
  }
}