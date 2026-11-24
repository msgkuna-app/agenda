/**
 * Skrip Sinkron Awal (Boot Tema & Status Sidebar)
 * Dimuat secara sinkron di <head> sebelum stylesheet untuk mencegah kilasan warna tema
 * dan ukuran sidebar (FOUC).
 *
 * Kunci localStorage TIDAK ditulis di sini. Keduanya dibaca dari atribut <html>
 * (data-kunci-tema / data-kunci-sidebar) yang juga menjadi sumber tunggal bagi
 * js/config/constants.js, sehingga tidak ada duplikat yang bisa berselisih.
 * Skrip ini klasik (bukan modul) agar dapat berjalan sebelum stylesheet dimuat.
 */
(function () {
  "use strict";

  var root = document.documentElement;

  // Kunci diambil dari atribut <html>; cadangan di bawah hanya berlaku bila atribut hilang
  // (mis. dokumen dibuka dari potongan HTML lama yang masih tersimpan di cache).
  var kunciTema = root.getAttribute("data-kunci-tema") || "agenda_arsip_tema";
  var kunciSidebar =
    root.getAttribute("data-kunci-sidebar") || "agenda_arsip_sidebar";

  // 1. Tema: terang / gelap / ikuti sistem
  var prefTema = "system";
  try {
    var t = localStorage.getItem(kunciTema);
    if (t === "light" || t === "dark" || t === "system") prefTema = t;
  } catch (_e) {}

  var gelapSistem =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  var efektif =
    prefTema === "system" ? (gelapSistem ? "dark" : "light") : prefTema;

  if (prefTema === "light" || prefTema === "dark") {
    root.setAttribute("data-theme", prefTema);
  } else {
    root.removeAttribute("data-theme");
  }
  root.style.colorScheme = efektif;

  // Nilai warna WAJIB sama dengan WARNA_TEMA_TERANG/WARNA_TEMA_GELAP di js/tema.js
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      efektif === "dark" ? "#0f172a" : "#0B5FA5",
    );
  }

  // 2. Status sidebar: terbuka / ciut, dengan taksiran lebar layar saat pertama dibuka
  var statusSidebar = null;
  try {
    var s = localStorage.getItem(kunciSidebar);
    if (s === "expanded" || s === "collapsed") statusSidebar = s;
  } catch (_e2) {}

  if (!statusSidebar) {
    statusSidebar =
      window.matchMedia &&
      window.matchMedia("(min-width: 1024.02px)").matches
        ? "expanded"
        : "collapsed";
  }
  root.setAttribute("data-sidebar", statusSidebar);
})();
