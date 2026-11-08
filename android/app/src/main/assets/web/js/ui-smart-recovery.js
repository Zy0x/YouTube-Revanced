/* ==========================================================================
   YouTube RVX — Smart Failure Recovery & Pre-release Warning
   Version: 2.1.29
   Handles:
     1. Early warning banner when user selects a Beta/Dev/Pre-release patch
     2. Smart Failure Recovery Modal if patching fails during build
        - 1-click Rollback to Latest Stable Release
        - 1-click Retry with High Tolerances (--continue-on-error & --force)
        - Change APK target version
   ========================================================================== */

function isCurrentReleasePreRelease() {
  const source = STATE.sources.find(s => s.id === STATE.currentSource);
  const releases = STATE.sourceReleases[source?.id] || STATE.patchReleases || [];
  const activeRelease = STATE.selectedRelease || releases.find(r => (r.tag_name || r.name) === STATE.patchTag);
  return Boolean(activeRelease?.prerelease || /(dev|beta|alpha|rc|pre)/i.test(STATE.patchTag || ''));
}

function renderPrereleaseWarning(targetElement) {
  if (!targetElement) return;
  const isBeta = isCurrentReleasePreRelease();
  let existingBanner = document.getElementById('prereleaseWarningBanner');

  if (!isBeta) {
    if (existingBanner) existingBanner.remove();
    return;
  }

  if (!existingBanner) {
    existingBanner = document.createElement('div');
    existingBanner.id = 'prereleaseWarningBanner';
    existingBanner.className = 'prerelease-warning-banner';
    targetElement.parentNode.insertBefore(existingBanner, targetElement.nextSibling);
  }

  existingBanner.innerHTML = `
    <div class="prerelease-warning-content">
      <span class="warning-icon" aria-hidden="true"></span>
      <div class="warning-text">
        <strong>Versi Pra-rilis / Dev (${escapeHtml(STATE.patchTag || 'Beta')}) Terpilih</strong>
        <p>Versi ini mungkin memuat perubahan kode eksperimental dari pembuat patch. Jika patching gagal, Anda dapat beralih ke versi Stabil melalui tombol pemulihan cerdas.</p>
      </div>
    </div>
  `;
}

function openSmartRecoveryModal({ error, details } = {}) {
  let modal = document.getElementById('smartRecoveryModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'smartRecoveryModal';
    modal.className = 'modal-overlay smart-recovery-backdrop hidden'; document.body.appendChild(modal);
  }
  const issue = RVX_UI.failureDiagnosis(error || details);
  const dependency = issue.category === 'dependency';
  const compatibility = issue.category === 'compatibility';
  const primary = dependency ? 'Periksa & siapkan ulang resource' : compatibility ? 'Periksa rilis stabil' : 'Kembali ke tinjauan';
  const secondary = dependency && issue.dependency === 'storage' ? 'Periksa lokasi penyimpanan' : dependency && issue.dependency === 'apk' || compatibility ? 'Periksa versi APK' : 'Periksa pengaturan lanjutan';
  modal.innerHTML = `
    <div class="modal-card smart-recovery-card" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle">
      <div class="modal-header smart-recovery-header"><div><h3 id="recoveryTitle" class="modal-title">${escapeHtml(issue.title)}</h3>
        <p class="modal-subtitle">${escapeHtml(issue.explanation)}</p></div></div>
      <div class="modal-body smart-recovery-body">
        <div class="recovery-error-box"><div class="error-box-label">Penyebab yang terdeteksi</div><p class="recovery-precise-message">${escapeHtml(issue.message)}</p></div>
        ${compatibility && isCurrentReleasePreRelease() ? '<p class="recovery-tip-box">Mesin melaporkan ketidakcocokan patch. Periksa versi APK dan rilis yang didukung sebelum mencoba kembali.</p>' : ''}
        <div class="recovery-options-list">
          <button type="button" id="btnRecoveryPrepare" class="recovery-action-btn primary"><div class="action-info"><strong>${primary}</strong><small>${dependency ? 'Pertahankan pilihan saat ini dan periksa resource yang belum siap.' : 'Periksa kembali pilihan dan kebutuhan proses.'}</small></div></button>
          <button type="button" id="btnRecoveryTarget" class="recovery-action-btn secondary"><div class="action-info"><strong>${secondary}</strong><small>Pilihan hanya diubah setelah Anda menentukannya.</small></div></button>
        </div>
      </div>
      <div class="modal-footer smart-recovery-footer"><button type="button" id="btnCloseSmartRecovery" class="morphe-btn-secondary">Tutup & lihat log</button></div>
    </div>`;
  modal.classList.remove('hidden');
  document.getElementById('btnRecoveryPrepare').addEventListener('click', () => {
    closeSmartRecoveryModal();
    if (compatibility) executeRollbackToLatestStable();
    else { invalidateWizardReview(); openDownloadConsentModal(); }
  });
  document.getElementById('btnRecoveryTarget').addEventListener('click', () => {
    closeSmartRecoveryModal(); switchScreen('wizard');
    goToWizardStep(dependency && issue.dependency === 'storage' ? 7 : dependency && issue.dependency === 'apk' || compatibility ? 3 : 6);
  });
  document.getElementById('btnCloseSmartRecovery').addEventListener('click', closeSmartRecoveryModal);
}

function closeSmartRecoveryModal() {
  const modal = document.getElementById('smartRecoveryModal');
  if (modal) modal.classList.add('hidden');
}

async function executeRollbackToLatestStable() {
  const source = STATE.sources.find(s => s.id === STATE.currentSource);
  const releases = STATE.sourceReleases[source?.id] || STATE.patchReleases || [];
  const latestStable = releases.find(r => !r.prerelease && !r.draft && !/(dev|beta|alpha|rc|pre)/i.test(r.tag_name || r.name || ''));

  if (!latestStable) {
    if (typeof showToast === 'function') {
      showToast('Tidak ditemukan rilis berlabel stabil murni untuk sumber ini.', 'warning');
    } else {
      alert('Tidak ditemukan rilis berlabel stabil murni untuk sumber ini.');
    }
    return;
  }

  const stableTag = latestStable.tag_name || latestStable.name;
  const ready = await selectPatchChannel(stableTag, false);
  goToWizardStep(ready ? 3 : 2);
  switchScreen('wizard');
}

function executeRetryWithTolerantFlags() {
  goToWizardStep(6);
  switchScreen('wizard');
}
