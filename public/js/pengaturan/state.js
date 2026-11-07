/**
 * Modul State & Penyimpanan Pengaturan & Cadangan (Agenda & Arsip)
 */
import { hariIni, parseTanggal, tanggalLokal, tambahHari } from "../util-tanggal.js";

export const KUNCI_STORAGE_CADANGAN_TERAKHIR = "agenda_arsip_cadangan_terakhir";
export const KUNCI_STORAGE_CADANGAN_INTERVAL = "agenda_arsip_cadangan_interval";
export const KUNCI_STORAGE_CADANGAN_TUNDA = "agenda_arsip_cadangan_tunda_sampai";

const statusCadangan = {
  terakhirEksporAt: null,
  intervalHari: 14,
  sudahDimuat: false
};

const statusUiPengaturan = {
  antarmukaSudahDiikat: false,
  versiAplikasiTerbaca: "",
  sedangSinkronFolder: false,
  sedangMengekspor: false,
  sedangMengimpor: false,
  dataSiapImpor: null,
  namaBerkasImpor: ""
};

const pemberitahuCadangan = new Set();

export function onPerubahanCadangan(fn) {
  if (typeof fn === "function") {
    pemberitahuCadangan.add(fn);
    return () => pemberitahuCadangan.delete(fn);
  }
  return () => {};
}

export function beriTahuPerubahanCadangan() {
  pemberitahuCadangan.forEach((fn) => {
    try { fn(statusCadangan); } catch (_e) {}
  });
}

export function getStatusCadangan() {
  if (!statusCadangan.sudahDimuat) {
    try {
      const tersimpan = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TERAKHIR);
      if (tersimpan) statusCadangan.terakhirEksporAt = tersimpan;
      const inv = localStorage.getItem(KUNCI_STORAGE_CADANGAN_INTERVAL);
      if (inv !== null && !Number.isNaN(Number(inv))) {
        statusCadangan.intervalHari = Number(inv);
      }
    } catch (_e) {}
  }
  return { ...statusCadangan };
}

export function setStatusCadangan(partial) {
  Object.assign(statusCadangan, partial);
}

export function getStatusUiPengaturan() {
  return statusUiPengaturan;
}

export function setStatusUiPengaturan(partial) {
  Object.assign(statusUiPengaturan, partial);
}

export function hitungSelisihHariCadangan(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const tglTerakhirStr = tanggalLokal(d);
  const tglSekarangStr = hariIni();
  const p1 = parseTanggal(tglTerakhirStr);
  const p2 = parseTanggal(tglSekarangStr);
  if (!p1 || !p2) return null;
  const utc1 = Date.UTC(p1.getFullYear(), p1.getMonth(), p1.getDate());
  const utc2 = Date.UTC(p2.getFullYear(), p2.getMonth(), p2.getDate());
  const msPerHari = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((utc2 - utc1) / msPerHari));
}

export function tundaPengingatCadangan(hari = 3) {
  const tundaSampai = tambahHari(hari);
  try {
    localStorage.setItem(KUNCI_STORAGE_CADANGAN_TUNDA, tundaSampai);
  } catch (_e) {}

  beriTahuPerubahanCadangan();
}

export function apakahSedangMenundaCadangan() {
  try {
    const tundaSampai = localStorage.getItem(KUNCI_STORAGE_CADANGAN_TUNDA);
    if (!tundaSampai) return false;
    return hariIni() <= tundaSampai;
  } catch (_e) {
    return false;
  }
}