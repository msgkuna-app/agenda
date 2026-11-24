/**
 * Profil Akun di Kaki Sidebar (Tahap 7b)
 * Merender nama, email, dan foto/inisial pengguna pada bagian bawah sidebar.
 */

/**
 * Memperbarui informasi profil pengguna di bagian bawah sidebar, lengkap dengan atribut title
 * dan tooltip saat sidebar diciutkan agar nama/email panjang tetap dapat dibaca penuh.
 * @param {import("https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js").User | null} user
 */
export function perbaruiInfoAkunSidebar(user) {
  const imgEl = document.getElementById("sidebar-user-photo");
  const initialsEl = document.getElementById("sidebar-user-initials");
  const nameEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");
  const profileEl =
    document.getElementById("sidebar-account-profile") ||
    document.querySelector(".account-profile");

  if (!user) {
    if (imgEl) {
      imgEl.removeAttribute("src");
      imgEl.hidden = true;
    }
    if (initialsEl) {
      initialsEl.textContent = "AA";
      initialsEl.hidden = false;
    }
    if (nameEl) {
      nameEl.textContent = "Pengguna";
      nameEl.setAttribute("title", "Pengguna");
    }
    if (emailEl) {
      emailEl.textContent = "";
      emailEl.removeAttribute("title");
    }
    if (profileEl) {
      profileEl.setAttribute("title", "Pengguna");
      profileEl.removeAttribute("data-tooltip");
    }
    return;
  }

  const nama = (user.displayName || "Pemilik Agenda").trim();
  const email = (user.email || "").trim();
  const bagian = nama.split(/\s+/).filter(Boolean);
  const inisial =
    bagian.length >= 2
      ? `${bagian[0][0]}${bagian[1][0]}`.toUpperCase()
      : nama.slice(0, 2).toUpperCase() || "AA";
  const ringkasAkun = email ? `${nama} (${email})` : nama;

  if (nameEl) {
    nameEl.textContent = nama;
    nameEl.setAttribute("title", nama);
  }
  if (emailEl) {
    emailEl.textContent = email;
    if (email) {
      emailEl.setAttribute("title", email);
    } else {
      emailEl.removeAttribute("title");
    }
  }
  if (profileEl) {
    profileEl.setAttribute("title", ringkasAkun);
    profileEl.setAttribute("data-tooltip", ringkasAkun);
  }
  if (initialsEl) initialsEl.textContent = inisial;

  if (imgEl && user.photoURL) {
    imgEl.src = user.photoURL;
    imgEl.hidden = false;
    if (initialsEl) initialsEl.hidden = true;
    imgEl.onerror = () => {
      imgEl.hidden = true;
      if (initialsEl) initialsEl.hidden = false;
    };
  } else {
    if (imgEl) imgEl.hidden = true;
    if (initialsEl) initialsEl.hidden = false;
  }
}
