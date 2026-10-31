/**
 * RVX Patcher - MicroG / GmsCore Manager & Stock APK Downloader
 * Handles MicroG variant selection, installation link/trigger,
 * package detection, and stock YouTube APK downloading.
 */

const MICROG_VARIANTS = {
  revanced: {
    name: 'ReVanced GmsCore',
    pkg: 'app.revanced.android.gms',
    url: 'https://github.com/ReVanced/GmsCore/releases/latest/download/app.revanced.android.gms-24.10.17-signed.apk'
  },
  inotia00: {
    name: 'mMicroG by Inotia00',
    pkg: 'app.revanced.android.gms',
    url: 'https://github.com/inotia00/mMicroG/releases/latest/download/microg.apk'
  },
  huawei: {
    name: 'GmsCore (Huawei/Honor)',
    pkg: 'app.revanced.android.gms',
    url: 'https://github.com/ReVanced/GmsCore/releases/latest/download/app.revanced.android.gms-24.10.17-hw-signed.apk'
  },
  vanced: {
    name: 'Vanced MicroG',
    pkg: 'com.mgoogle.android.gms',
    url: 'https://github.com/TeamVanced/VancedMicroG/releases/download/v0.2.24.220220/microg.apk'
  }
};

function openMicrogManagerModal() {
  const modal = document.getElementById('smartMicrogModal');
  if (!modal) return;

  const detectTitle = document.getElementById('microgDetectTitle');
  const detectSub = document.getElementById('microgModalMsg');
  const detectIcon = document.getElementById('microgDetectIcon');

  let installedPkg = null;
  let installedName = null;
  if (window.RVXNativeBridge?.isPackageInstalled) {
    if (window.RVXNativeBridge.isPackageInstalled('app.revanced.android.gms')) {
      installedPkg = 'app.revanced.android.gms';
      installedName = 'ReVanced GmsCore';
    } else if (window.RVXNativeBridge.isPackageInstalled('com.mgoogle.android.gms')) {
      installedPkg = 'com.mgoogle.android.gms';
      installedName = 'Vanced MicroG / mMicroG';
    }
  }

  if (installedPkg) {
    if (detectTitle) detectTitle.textContent = `Terpasang: ${installedName}`;
    if (detectSub) detectSub.textContent = 'MicroG sudah aktif di perangkat Anda. YouTube RVX siap digunakan untuk login Google.';
    if (detectIcon) detectIcon.textContent = '✅';
  } else {
    if (detectTitle) detectTitle.textContent = 'MicroG Belum Terpasang';
    if (detectSub) detectSub.textContent = 'YouTube RVX Non-Root wajib memerlukan MicroG agar tidak crash dan dapat masuk ke akun Google Anda.';
    if (detectIcon) detectIcon.textContent = '⚠️';
  }

  const variantCards = modal.querySelectorAll('.microg-variant-card');
  variantCards.forEach(card => {
    card.onclick = () => {
      variantCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    };
  });

  const btnDownload = document.getElementById('btnMicrogDownloadInstall');
  if (btnDownload) {
    btnDownload.onclick = () => {
      const selectedRadio = modal.querySelector('input[name="microg_choice"]:checked');
      const variantKey = selectedRadio?.value || 'revanced';
      const variant = MICROG_VARIANTS[variantKey] || MICROG_VARIANTS.revanced;

      if (window.RVXNativeBridge?.openBrowser) {
        window.RVXNativeBridge.openBrowser(variant.url);
      } else {
        window.open(variant.url, '_blank');
      }
      if (typeof showToast === 'function') {
        showToast(`Membuka unduhan: ${variant.name}...`);
      }
      modal.classList.add('hidden');
    };
  }

  const btnIgnore = document.getElementById('btnMicrogIgnore');
  if (btnIgnore) {
    btnIgnore.onclick = () => modal.classList.add('hidden');
  }

  const btnClose = document.getElementById('btnCloseMicrogModal');
  if (btnClose) {
    btnClose.onclick = () => modal.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function setupStockApkDownloadHandler() {
  const btn = document.getElementById('btnWizardDownloadStockApk');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const pkg = STATE.currentApp?.packageName || 'com.google.android.youtube';
    const ver = STATE.currentVersion;
    if (!ver) {
      if (typeof showToast === 'function') showToast('Pilih versi target APK terlebih dahulu.', 'warning');
      return;
    }

    const btnText = document.getElementById('btnWizardDownloadStockApkText');
    if (btnText) btnText.textContent = '⏳ Memulai unduhan APK...';
    btn.disabled = true;

    try {
      const token = RVX_STORAGE.session.getItem('rvx_daemon_token') || '';
      const res = await fetch('/api/v1/downloads/stock-apk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rvx-token': token
        },
        body: JSON.stringify({ packageName: pkg, targetVersion: ver })
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof showToast === 'function') {
          showToast(data.message || `Unduhan APK stok v${ver} dimulai!`);
        }
        if (data.cached) {
          if (btnText) btnText.textContent = '✅ APK Tersedia di Cache';
        } else {
          if (btnText) btnText.textContent = '⬇️ Mengunduh di latar belakang...';
        }
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(`Gagal memulai unduhan: ${e.message}`, 'error');
      }
      if (btnText) btnText.textContent = '⬇️ Unduh APK Rekomendasi Resmi';
    } finally {
      btn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupStockApkDownloadHandler();
});
