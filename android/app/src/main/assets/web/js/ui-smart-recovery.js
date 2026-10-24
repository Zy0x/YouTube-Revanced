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
      <span class="warning-icon" aria-hidden="true">⚠️</span>
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
    modal = document.createElement('div');
    modal.id = 'smartRecoveryModal';
    modal.className = 'modal-backdrop smart-recovery-backdrop';
    document.body.appendChild(modal);
  }

  const isBeta = isCurrentReleasePreRelease();
  const sourceObj = STATE.sources.find(s => s.id === STATE.currentSource);
  const sourceName = sourceObj?.name || STATE.currentSource || 'Sumber Patch';
  const tag = STATE.patchTag || 'Pra-rilis';

  modal.innerHTML = `
    <div class="modal-card smart-recovery-card" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle">
      <div class="modal-header smart-recovery-header">
        <div class="recovery-header-icon" aria-hidden="true">🛠️</div>
        <div>
          <h3 id="recoveryTitle" class="modal-title">Pemulihan Cerdas: Patching Terhenti</h3>
          <p class="modal-subtitle">Terjadi kendala pada rilis <strong>${escapeHtml(sourceName)} (${escapeHtml(tag)})</strong></p>
        </div>
      </div>

      <div class="modal-body smart-recovery-body">
        <div class="recovery-error-box">
          <div class="error-box-label">Pesan Kesalahan:</div>
          <code class="error-box-code">${escapeHtml(error || details || 'Morphe CLI keluar dengan kode status gagal.')}</code>
        </div>

        ${isBeta ? `
          <div class="recovery-tip-box">
            <span class="tip-badge">Penyebab Umum</span>
            <p>Rilis dev/beta sering kali memperkenalkan patch baru yang belum sepenuhnya kompatibel dengan struktur smali bytecode versi APK yang dipilih.</p>
          </div>
        ` : ''}

        <div class="recovery-options-list">
          <!-- Opsi 1: Rollback ke Stabil -->
          <button type="button" id="btnRecoveryRollbackStable" class="recovery-action-btn primary">
            <span class="action-icon">🌟</span>
            <div class="action-info">
              <strong>Beralih ke Versi Stabil Terakhir (Rekomendasi 1-Klik)</strong>
              <small>Otomatis mengganti sumber ke rilis stabil yang telah terverifikasi aman.</small>
            </div>
          </button>

          <!-- Opsi 2: Retry Toleransi -->
          <button type="button" id="btnRecoveryRetryTolerant" class="recovery-action-btn secondary">
            <span class="action-icon">⚡</span>
            <div class="action-info">
              <strong>Coba Lagi dengan Toleransi Tinggi (--continue-on-error &amp; --force)</strong>
              <small>Mengabaikan patch minor yang gagal dan melanjutkan kompilasi APK.</small>
            </div>
          </button>

          <!-- Opsi 3: Ganti Versi APK Target -->
          <button type="button" id="btnRecoveryChangeVersion" class="recovery-action-btn outline">
            <span class="action-icon">📦</span>
            <div class="action-info">
              <strong>Pilih Versi APK Target Lain (Langkah 3)</strong>
              <small>Gunakan versi APK yang direkomendasikan secara resmi oleh patch.</small>
            </div>
          </button>
        </div>
      </div>

      <div class="modal-footer smart-recovery-footer">
        <button type="button" id="btnCloseSmartRecovery" class="morphe-btn-secondary">Tutup &amp; Lihat Log</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Bind actions
  document.getElementById('btnRecoveryRollbackStable')?.addEventListener('click', () => {
    closeSmartRecoveryModal();
    executeRollbackToLatestStable();
  });

  document.getElementById('btnRecoveryRetryTolerant')?.addEventListener('click', () => {
    closeSmartRecoveryModal();
    executeRetryWithTolerantFlags();
  });

  document.getElementById('btnRecoveryChangeVersion')?.addEventListener('click', () => {
    closeSmartRecoveryModal();
    if (typeof navigateToStep === 'function') {
      navigateToStep(3);
    }
  });

  document.getElementById('btnCloseSmartRecovery')?.addEventListener('click', closeSmartRecoveryModal);
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
  STATE.patchTag = stableTag;
  STATE.selectedRelease = latestStable;

  if (typeof showToast === 'function') {
    showToast(`Beralih ke rilis stabil: ${stableTag}... Menyiapkan metadata.`);
  }

  // Navigate back to Step 2 or re-evaluate Step 4
  if (typeof navigateToStep === 'function') {
    navigateToStep(2);
    // Refresh release UI if available
    if (typeof renderReleaseChannels === 'function') {
      renderReleaseChannels();
    }
  }
}

function executeRetryWithTolerantFlags() {
  if (!STATE.morpheEngineOptions) STATE.morpheEngineOptions = {};
  STATE.morpheEngineOptions.continueOnError = true;
  STATE.morpheEngineOptions.force = true;

  if (typeof saveMorpheEngineOptions === 'function') {
    saveMorpheEngineOptions();
  }

  if (typeof showToast === 'function') {
    showToast('Toleransi diaktifkan (--continue-on-error & --force). Mencoba ulang build...');
  }

  // Trigger rebuild
  if (typeof triggerBuildPipeline === 'function') {
    triggerBuildPipeline();
  }
}
