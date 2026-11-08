/* Build results belong to the exact configuration that produced them. */
function hasCurrentBuildResult() {
  return RVX_UI.ownsResult(STATE.buildSession, RVX_UI.buildKey(STATE));
}

function beginBuildSession() {
  if (STATE.buildSession?.status === 'running') return false;
  STATE.lastOutputApkPath = '';
  STATE.logHistory = [];
  const terminal = document.getElementById('morpheStructuredLogs');
  if (terminal) terminal.innerHTML = '';
  setText('terminalLogs', '');
  STATE.buildSession = { status: 'running', key: RVX_UI.buildKey(STATE), path: '', blob: null, error: '' };
  if (typeof resetBuildDependencies === 'function') resetBuildDependencies();
  renderBuildResult();
  return true;
}

function finishBuildSession({ path = '', blob = null } = {}) {
  if (STATE.buildSession?.status !== 'running') return;
  if (!path && !blob) {
    failBuildSession('Proses berakhir tanpa berkas hasil yang terverifikasi.');
    return;
  }
  Object.assign(STATE.buildSession, { status: 'succeeded', path, blob });
  STATE.lastOutputApkPath = path;
  renderBuildResult();
}

function failBuildSession(message, status = 'failed') {
  if (!STATE.buildSession) return;
  Object.assign(STATE.buildSession, { status, path: '', blob: null, error: message });
  STATE.lastOutputApkPath = '';
  renderBuildResult();
}

function renderBuildResult() {
  const result = hasCurrentBuildResult();
  const session = STATE.buildSession || {};
  const running = session.status === 'running';
  document.getElementById('postPatchHeroCard')?.classList.add('hidden');
  document.getElementById('buildResultPanel')?.classList.toggle('hidden', !result);
  document.getElementById('buildFailurePanel')?.classList.toggle('hidden', !['failed', 'cancelled'].includes(session.status));
  setText('buildResultDetail', session.path || 'APK siap disimpan ke perangkat Anda.');
  setText('buildFailureDetail', session.error || '');
  const root = STATE.daemonStatus?.is_android === true && (STATE.daemonStatus?.root_available === true || STATE.daemonStatus?.root_installer_available === true);
  ['btnResultMount', 'btnWizardRootInstall'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !(result && root && session.path && STATE.targetMode === 'root')));
  ['btnResultZip', 'btnWizardSaveFile'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !(result && session.path)));
  document.getElementById('btnResultSaveApk')?.classList.toggle('hidden', !(result && session.blob));
  document.getElementById('btnResultInstallApk')?.classList.toggle('hidden', !(result && session.path && window.RVXNativeBridge?.installApk && STATE.targetMode === 'non-root'));
  const back = document.getElementById('btnProgressBackHome');
  if (back) {
    back.querySelector('span').textContent = running ? (STATE.engineMode === 'browser' ? 'Batalkan proses' : 'Proses sedang berjalan') : 'Kembali ke konfigurasi';
    back.disabled = running && STATE.engineMode !== 'browser';
  }
  const status = document.getElementById('screenProgress');
  if (status) status.dataset.buildState = session.status || 'idle';
}

async function cancelBuildSession() {
  if (STATE.buildSession?.status === 'running') {
    if (STATE.browserPatchAbortController) {
      STATE.browserPatchAbortController.abort();
    } else return; // The native helper does not expose cancellation.
    STATE.eventSource?.close();
    window.RVXNativeBridge?.setKeepScreenOn?.(false);
    failBuildSession('Proses dibatalkan. Konfigurasi Anda tetap tersedia.', 'cancelled');
    setText('progressStatusSub', 'Dibatalkan');
    return;
  }
  goToWizardStep(8);
  switchScreen('wizard');
}

function getBuildAvailability() {
  if (STATE.daemonOnline && STATE.engineMode === 'local') {
    if (STATE.daemonStatus?.is_patching && STATE.buildSession.status !== 'running') return { ready: false, message: 'Perangkat masih menjalankan proses patch. Tunggu hingga selesai sebelum memulai lagi.' };
    return { ready: true, message: '' };
  }
  if (STATE.portableEngineManifest?.available !== true) return {
    ready: false,
    message: 'Build belum tersedia di browser ini. Anda dapat menyimpan konfigurasi, lalu menggunakan aplikasi atau WebUI modul pada perangkat yang didukung.'
  };
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  if (source && STATE.patchTag) {
    const capability = RVX_LOCAL_ENGINE.resolveReleaseCapability(source, STATE.selectedRelease || getSelectedSourceRelease());
    if (!capability.portable.available) return { ready: false, message: 'Rilis ini memerlukan mesin native. Simpan konfigurasi dan buka melalui aplikasi atau WebUI modul.' };
  }
  return { ready: true, message: '' };
}

function renderRuntimeAvailability() {
  const notice = document.getElementById('wizardRuntimeNotice');
  if (!notice || !STATE.runtimeCapabilities) return;
  const availability = getBuildAvailability();
  notice.classList.toggle('hidden', availability.ready || STATE.wizardStep === 8);
  setText('wizardRuntimeNoticeText', availability.ready ? '' : 'Mode konfigurasi. Build memerlukan aplikasi atau WebUI modul; pilihan Anda dapat disimpan.');
}

function updatePresetPresentation() {
  const labels = { balanced: 'Rekomendasi', minimal: 'Minimalis', power: 'Lengkap' };
  Object.entries({ balanced: 'btnPresetBalanced', minimal: 'btnPresetMinimal', power: 'btnPresetPower' }).forEach(([type, id]) => {
    const button = document.getElementById(id);
    if (!button) return;
    const selection = RVX_UI.preset(STATE.patches, type, STATE.targetMode);
    const active = STATE.activePreset === type && selection.size === STATE.selectedPatches.size && [...selection].every(name => STATE.selectedPatches.has(name));
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !selection.size;
    button.textContent = `${labels[type]} · ${selection.size}`;
  });
}

function initWorkflowUI() {
  document.querySelectorAll('[data-edit-step]').forEach(button => button.addEventListener('click', () => goToWizardStep(Number(button.dataset.editStep))));
  document.getElementById('btnCheckModeMicrog')?.addEventListener('click', openMicrogManagerModal);
  document.getElementById('btnRetryDiagnostics')?.addEventListener('click', updatePreflightDoctor);
  document.getElementById('btnResultSaveApk')?.addEventListener('click', async () => {
    if (!hasCurrentBuildResult() || !STATE.buildSession.blob) return;
    try { await rvxSaveBlob(STATE.buildSession.blob, `rvx-${STATE.currentApp?.alias || 'app'}-${STATE.currentVersion}.apk`, 'application/vnd.android.package-archive'); }
    catch (error) { showRvxToast(`Berkas belum disimpan: ${error.message}`); }
  });
  document.getElementById('btnResultInstallApk')?.addEventListener('click', () => {
    if (!hasCurrentBuildResult() || !STATE.buildSession.path || !window.RVXNativeBridge?.installApk) return;
    try { window.RVXNativeBridge.installApk(STATE.buildSession.path); }
    catch (error) { showRvxToast(`Pemasang belum dapat dibuka: ${error.message}`); }
  });
  document.getElementById('btnResultZip')?.addEventListener('click', () => { if (hasCurrentBuildResult()) document.getElementById('btnHeroExportZip')?.click(); });
  document.getElementById('btnResultMount')?.addEventListener('click', () => { if (hasCurrentBuildResult()) document.getElementById('btnHeroHotMount')?.click(); });
  document.getElementById('btnRetryBuild')?.addEventListener('click', () => { goToWizardStep(8); switchScreen('wizard'); });
  document.getElementById('homeAppSearch')?.addEventListener('input', event => {
    STATE.homeAppQuery = event.target.value.trim().toLowerCase();
    renderAppCardsWithConfigStatus();
  });
  document.getElementById('wizardPatchGroup')?.addEventListener('change', event => {
    STATE.patchGroup = event.target.value;
    renderMorphePatchList('wizardPatchCategoriesContainer');
  });
  // One modal stack handles keyboard focus, including nested dialogs.
  let openModals = [];
  const returnFocus = new Map();
  const updateModals = () => {
    const visible = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    const added = visible.filter(modal => !openModals.includes(modal));
    added.forEach(modal => {
      returnFocus.set(modal, document.activeElement);
      modal.dataset.openOrder = String(Date.now());
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('role', 'dialog');
      const title = modal.querySelector('h2, h3, .modal-title');
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
    });
    const removed = openModals.filter(modal => !visible.includes(modal));
    const top = visible.sort((a, b) => Number(a.dataset.openOrder || 0) - Number(b.dataset.openOrder || 0)).at(-1);
    document.getElementById('morpheAppContainer').inert = Boolean(top);
    document.getElementById('tuiAppContainer').inert = Boolean(top);
    visible.forEach(modal => { modal.inert = modal !== top; });
    removed.forEach(modal => {
      modal.inert = false;
      const opener = returnFocus.get(modal);
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
      returnFocus.delete(modal);
    });
    openModals = visible;
  };
  new MutationObserver(updateModals).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', event => {
    const modal = openModals.at(-1);
    if (!modal || event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
    if (!controls.length) { event.preventDefault(); return; }
    const index = controls.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && (index === -1 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
  });
}
