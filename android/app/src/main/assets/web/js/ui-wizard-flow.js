/* Dedicated storage and review steps. Resource downloads start only on consent. */
let wizardReviewRequest = 0;
let wizardStorageRequest = 0;
let nativeFolderRequest = null;
const wizardFolderHandles = new Map();

function invalidateWizardReview() {
  wizardReviewRequest++;
  STATE.pendingDownloadPlan = null;
  STATE.pendingLocalPatchPayload = null;
  STATE.wizardReviewKey = '';
  STATE.wizardReviewLoading = false;
  STATE.wizardReviewError = '';
  const check = document.getElementById('checkUnknownSizeConsent');
  if (check) check.checked = false;
}

function defaultWizardFolder(kind) {
  const path = `/storage/emulated/0/Rvext/${kind === 'workspace' ? 'Workspace' : 'Output'}`;
  return { type: 'path', path, label: path, default: true };
}

function setWizardStorageFolder(kind, folder) {
  if (!['workspace', 'output'].includes(kind) || STATE.wizardStorageBusy) return;
  wizardStorageRequest++;
  STATE.wizardStorageDraft ||= {};
  STATE.wizardStorageDraft[kind] = folder;
  STATE.wizardStorageValidated = false;
  invalidateWizardReview();
  RVX_STORAGE.local.setItem('rvx_wizard_folders', JSON.stringify(STATE.wizardStorageDraft));
  renderWizardStorageChoices();
}

function renderWizardStorageChoices() {
  for (const kind of ['workspace', 'output']) {
    const cap = kind === 'workspace' ? 'Workspace' : 'Output';
    const folder = STATE.wizardStorageDraft?.[kind];
    setText(`wizard${cap}Path`, folder?.path || folder?.label || 'Belum ada folder');
    setText(`wizard${cap}State`, !folder ? 'Belum dipilih' : STATE.wizardStorageValidated ? 'Akses terverifikasi' : 'Dipilih');
    const manual = document.getElementById(`wizard${cap}Manual`);
    if (manual) manual.value = folder?.path || '';
  }
  document.querySelectorAll('#wizardStep7 button').forEach(button => { button.disabled = STATE.wizardStorageBusy; });
  document.getElementById('wizardStorageManual')?.classList.toggle('hidden', Boolean(window.RVXNativeBridge?.pickStorageDirectory));
  updateWizardNavigationState();
  if (STATE.wizardStorageBusy) document.getElementById('btnWizStep7Next').disabled = true;
}

async function renderWizardStorageStep() {
  if (!STATE.wizardStorageDraft) {
    try { STATE.wizardStorageDraft = JSON.parse(RVX_STORAGE.local.getItem('rvx_wizard_folders') || 'null'); } catch (_) {}
  }
  renderWizardStorageChoices();
  setText('wizardStorageStatus', 'Pilih dua folder, atau gunakan pintasan folder bawaan. Akses diperiksa saat Anda melanjutkan.');
  if (!STATE.daemonOnline || STATE.wizardStorageDraft) return;
  const request = ++wizardStorageRequest;
  try {
    const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/locations`, { headers: daemonAuthHeaders() });
    const data = await response.json();
    if (request !== wizardStorageRequest || !response.ok || !data.selection) return;
    STATE.storageSelection = data.selection;
    const workspace = data.selection.workspacePath || data.selection.storagePath;
    const output = data.selection.outputPath || data.selection.storagePath;
    if (workspace && output) {
      STATE.wizardStorageDraft = {
        workspace: { type: 'path', path: workspace, label: workspace },
        output: { type: 'path', path: output, label: output }
      };
      // Revalidate explicitly; a saved path is not proof of current permission.
      STATE.wizardStorageValidated = false;
      renderWizardStorageChoices();
    }
  } catch (_) { /* Folder selection remains usable without a saved selection. */ }
}

async function pickWizardFolder(kind) {
  if (STATE.wizardStorageBusy || nativeFolderRequest) return;
  if (window.RVXNativeBridge?.pickStorageDirectory) {
    nativeFolderRequest = { id: `${Date.now()}-${kind}`, kind };
    try { window.RVXNativeBridge.pickStorageDirectory(kind, nativeFolderRequest.id); }
    catch (error) { nativeFolderRequest = null; setText('wizardStorageStatus', error.message); }
    return;
  }
  if (typeof window.showDirectoryPicker === 'function' && STATE.engineMode !== 'local') {
    try {
      const handle = await window.showDirectoryPicker({ id: `rvx-${kind}`, mode: 'readwrite' });
      wizardFolderHandles.set(kind, handle);
      await RVX_ARTIFACT_STORE.settings.put(`directory-${kind}`, handle).catch(() => {});
      setWizardStorageFolder(kind, { type: 'browser', label: handle.name });
      setText('wizardStorageStatus', 'Folder dipilih melalui pemilih perangkat. Browser menyimpan akses sebagai handle, bukan alamat berkas.');
    } catch (error) {
      if (error.name !== 'AbortError') setText('wizardStorageStatus', `Folder belum dipilih: ${error.message}`);
    }
    return;
  }
  if (STATE.daemonOnline) { await openStorageBrowser(kind); return; }
  setText('wizardStorageStatus', 'Pemilih folder tidak tersedia pada browser ini. Gunakan aplikasi Android atau simpan pilihan folder bawaan untuk konfigurasi.');
}

window.rvxStorageDirectoryResult = function rvxStorageDirectoryResult(result) {
  if (!nativeFolderRequest || result.requestId !== nativeFolderRequest.id) return;
  const { kind } = nativeFolderRequest;
  nativeFolderRequest = null;
  if (result.cancelled) return;
  if (result.error || !result.path) {
    setText('wizardStorageStatus', result.error || 'Pilih folder pada penyimpanan perangkat, bukan penyedia cloud.');
    return;
  }
  setWizardStorageFolder(kind, { type: 'path', path: result.path, label: result.path, uri: result.uri });
  setText('wizardStorageStatus', 'Folder dipilih. Akses tulis mesin build akan diperiksa sebelum lanjut.');
};

async function validateWizardStorageAndContinue() {
  const draft = STATE.wizardStorageDraft;
  if (STATE.wizardStorageBusy || !draft?.workspace || !draft?.output) return;
  STATE.wizardStorageBusy = true;
  const key = JSON.stringify(draft);
  renderWizardStorageChoices();
  document.getElementById('btnWizardStoragePermission')?.classList.add('hidden');
  setText('wizardStorageStatus', 'Memeriksa lokasi penyimpanan…');
  try {
    if (STATE.daemonOnline && STATE.engineMode === 'local') {
      if (!draft.workspace.path || !draft.output.path) throw new Error('Mesin native memerlukan folder pada perangkat yang menjalankan helper. Pilih kembali melalui aplikasi atau WebUI helper.');
      const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/selection`, {
        method: 'PUT', headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ workspaceId: 'custom-workspace', outputId: 'custom-output', workspacePath: draft.workspace.path, outputPath: draft.output.path })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (JSON.stringify(STATE.wizardStorageDraft) !== key) return;
      STATE.storageSelection = data.selection;
      STATE.wizardStorageValidated = true;
    } else {
      // Browsers cannot validate Android paths. Keep these as configuration only.
      STATE.wizardStorageValidated = false;
      for (const kind of ['workspace', 'output']) {
        if (draft[kind].type !== 'browser') continue;
        let handle = wizardFolderHandles.get(kind);
        if (!handle) handle = (await RVX_ARTIFACT_STORE.settings.get(`directory-${kind}`))?.value;
        if (!handle || await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error(`Pilih kembali folder ${kind === 'workspace' ? 'Workspace' : 'Output'} untuk memberi akses.`);
        wizardFolderHandles.set(kind, handle);
      }
    }
    RVX_STORAGE.local.setItem('rvx_wizard_folders', JSON.stringify(draft));
    goToWizardStep(8);
  } catch (error) {
    setText('wizardStorageStatus', `Lokasi belum siap: ${error.message}`);
    if (window.RVXNativeBridge?.requestStoragePermission) document.getElementById('btnWizardStoragePermission')?.classList.remove('hidden');
  } finally {
    STATE.wizardStorageBusy = false;
    renderWizardStorageChoices();
  }
}

function wizardReviewIdentity() { return RVX_UI.buildKey(STATE); }

function isWizardReviewReady() {
  const plan = STATE.pendingDownloadPlan;
  return STATE.wizardReviewKey === wizardReviewIdentity() && !STATE.wizardReviewLoading
    && (STATE.engineMode !== 'local' || STATE.wizardStorageValidated)
    && (!plan?.expiresAt || plan.expiresAt * 1000 > Date.now())
    && RVX_UI.canStartDownload(plan, { acceptedUnknown: Boolean(document.getElementById('checkUnknownSizeConsent')?.checked), browser: STATE.engineMode === 'browser', hasApk: Boolean(STATE.selectedApkFile) });
}

function getWizardReviewHint() {
  if (STATE.wizardReviewLoading) return 'Memeriksa resource dan cache. Belum ada unduhan yang dimulai.';
  if (STATE.wizardReviewError) return STATE.wizardReviewError;
  if (!STATE.wizardStorageDraft?.workspace || !STATE.wizardStorageDraft?.output) return 'Pilih Workspace dan Output pada tahap lokasi penyimpanan.';
  if (STATE.engineMode === 'local' && !STATE.wizardStorageValidated) return 'Periksa akses folder pada tahap lokasi penyimpanan.';
  if (STATE.pendingDownloadPlan?.expiresAt * 1000 <= Date.now()) return 'Pemeriksaan resource sudah kedaluwarsa. Tekan “Periksa lagi”.';
  if (Number(STATE.pendingDownloadPlan?.unknownSizeCount) > 0 && !document.getElementById('checkUnknownSizeConsent')?.checked) return 'Periksa dan setujui pemberitahuan ukuran berkas yang belum diketahui.';
  if (STATE.engineMode === 'browser' && !STATE.selectedApkFile) return 'Pilih APK asli yang sesuai dengan versi konfigurasi.';
  return 'Periksa resource sebelum memulai proses.';
}

function reviewDeviceDependencies() {
  const unsigned = STATE.morpheEngineOptions?.keystoreMode === 'unsigned';
  const items = [{ label: 'Penandatanganan APK', state: unsigned ? 'not-needed' : 'generated', detail: unsigned ? 'APK tanpa tanda tangan. Tandatangani hasil terlebih dahulu sebelum memasangnya.' : getMorpheEngineSummaryText() }];
  if (STATE.targetMode === 'non-root' && STATE.patches.some(p => STATE.selectedPatches.has(p.name) && RVX_UI.isGms(p.name))) {
    items.push({ label: 'GmsCore', state: STATE.daemonStatus?.microg_installed === true ? 'ready' : 'device', detail: 'Diperlukan saat menggunakan APK non-root. Pemasangannya dilakukan terpisah.' });
  }
  if (STATE.targetMode === 'root') items.push({ label: 'Magisk / KernelSU / APatch', state: STATE.daemonStatus?.root_available === true ? 'ready' : 'device', detail: 'Diperlukan pada perangkat tempat hasil root dipasang.' });
  return items;
}

function renderWizardResourcePlan(plan) {
  const labels = { ready: 'Tersedia', cached: 'Cache lokal', download: 'Perlu diunduh', required: 'Perlu diunduh', generated: 'Dibuat saat proses', 'not-needed': 'Tidak diperlukan', unavailable: 'Belum tersedia', 'native-only': 'Mesin native', device: 'Periksa perangkat', planned: 'Belum diperiksa' };
  const items = [...(plan?.items || []), ...reviewDeviceDependencies()];
  document.getElementById('downloadPlanList').innerHTML = items.map(item => {
    const detail = item.detail || (['cached', 'ready'].includes(item.state) ? 'Menggunakan berkas yang sudah tersedia.' : ['download', 'required'].includes(item.state) ? item.downloadBytes == null ? 'Ukuran belum diberikan server asal.' : `${formatDownloadBytes(item.downloadBytes)} untuk diunduh.` : item.state === 'not-needed' ? 'Tidak digunakan untuk pilihan ini.' : 'Disiapkan pada tahap proses.');
    return renderDownloadPlanItem(['cached', 'ready'].includes(item.state) ? '✓' : '·', item.label, detail, labels[item.state] || item.state, ['cached', 'ready'].includes(item.state) ? 'is-cached' : ['download', 'required'].includes(item.state) ? 'is-download' : '');
  }).join('');
  const unknown = Number(plan?.unknownSizeCount || 0);
  document.getElementById('unknownSizeConsent')?.classList.toggle('hidden', unknown === 0);
  setText('downloadPlanTotal', plan ? `${formatDownloadBytes(plan.knownDownloadBytes || 0)} unduhan diketahui${unknown ? ` · ${unknown} berkas belum diketahui ukurannya` : ''}` : 'Ukuran dan cache diperiksa melalui mesin build pada perangkat.');
  const warning = document.getElementById('downloadPlanWarning');
  warning.textContent = plan?.enoughStorage === false ? 'Ruang penyimpanan tidak cukup. Pilih folder lain atau kosongkan ruang.' : '';
  warning.classList.toggle('hidden', !warning.textContent);
}

async function prepareWizardReview() {
  const request = ++wizardReviewRequest;
  const key = wizardReviewIdentity();
  STATE.pendingDownloadPlan = null;
  STATE.pendingLocalPatchPayload = null;
  STATE.wizardReviewLoading = true;
  STATE.wizardReviewError = '';
  STATE.wizardReviewKey = '';
  document.getElementById('checkUnknownSizeConsent').checked = false;
  document.getElementById('unknownSizeConsent').classList.add('hidden');
  for (const kind of ['workspace', 'output']) setText(`summary${kind === 'workspace' ? 'Workspace' : 'Output'}Path`, STATE.wizardStorageDraft?.[kind]?.path || STATE.wizardStorageDraft?.[kind]?.label || 'Belum dipilih');
  setText('reviewPatchDetailsLabel', `${STATE.selectedPatches.size} fitur patch dipilih`);
  document.getElementById('reviewPatchDetails').innerHTML = [...STATE.selectedPatches].sort().map(name => `<li>${escapeHtml(name)}</li>`).join('');
  document.getElementById('browserApkInputPanel').classList.toggle('hidden', STATE.engineMode !== 'browser' || !getBuildAvailability().ready);
  document.getElementById('btnRefreshReviewResources').classList.toggle('hidden', !getBuildAvailability().ready);
  setText('downloadPlanTotal', 'Memeriksa resource dan cache…');
  document.getElementById('downloadPlanList').innerHTML = '';
  updateWizardBuildValidation();
  try {
    if (!getBuildAvailability().ready) {
      const items = [
        { label: 'APK asli', detail: `${STATE.currentApp?.name || 'Aplikasi'} versi ${STATE.currentVersion || 'terpilih'}.` },
        { label: 'Bundle patch', detail: `${getSourceDisplayName(STATE.currentSource)} · ${STATE.patchTag || 'rilis terpilih'}.` },
        { label: 'Mesin Morphe', detail: 'Mesin untuk menerapkan patch dan membangun APK.' },
        { label: 'Java Runtime', detail: 'Lingkungan Java untuk menjalankan mesin native.' }
      ].map(item => ({ ...item, state: 'planned' }));
      renderWizardResourcePlan({ items, knownDownloadBytes: 0 });
      setText('downloadPlanTotal', 'Daftar kebutuhan · belum ada unduhan');
      return;
    }
    let plan;
    if (STATE.engineMode === 'local') {
      if (!STATE.wizardStorageValidated) throw new Error('Pilih dan periksa Workspace serta Output pada tahap 7 terlebih dahulu.');
      const response = await fetch(`${STATE.daemonUrl}/api/v1/downloads/plan`, {
        method: 'POST', headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(createLocalPatchPayload())
      });
      plan = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(plan.error || `HTTP ${response.status}`);
    } else {
      const source = STATE.sources.find(item => item.id === STATE.currentSource);
      plan = await RVX_LOCAL_ENGINE.preflight({ source, release: STATE.selectedRelease || getSelectedSourceRelease(), apkSize: STATE.selectedApkFile?.size || 0 });
    }
    if (request !== wizardReviewRequest || STATE.wizardStep !== 8 || key !== wizardReviewIdentity()) return;
    STATE.pendingDownloadPlan = plan;
    STATE.browserDownloadPlan = STATE.engineMode === 'browser' ? plan : null;
    STATE.wizardReviewKey = key;
    STATE.pendingLocalPatchPayload = createLocalPatchPayload();
    renderWizardResourcePlan(plan);
    if (plan.ready === false) STATE.wizardReviewError = plan.reason || 'Runtime belum siap.';
  } catch (error) {
    if (request !== wizardReviewRequest) return;
    STATE.wizardReviewError = `Resource belum siap: ${error.message}`;
    setText('downloadPlanTotal', 'Pemeriksaan belum berhasil');
    renderWizardResourcePlan(null);
  } finally {
    if (request === wizardReviewRequest) {
      STATE.wizardReviewLoading = false;
      updateWizardBuildValidation();
    }
  }
}

function openDownloadConsentModal() {
  switchScreen('wizard');
  goToWizardStep(STATE.wizardStorageDraft?.workspace && STATE.wizardStorageDraft?.output ? 8 : 7);
}

function startReviewedBuild() {
  if (!updateWizardBuildValidation() || !isWizardReviewReady()) return;
  if (!persistWizardConfiguration()) return;
  const plan = STATE.pendingDownloadPlan;
  const payload = STATE.pendingLocalPatchPayload || createLocalPatchPayload();
  if (STATE.engineMode === 'browser') triggerBrowserPatchBuild(plan, STATE.selectedApkFile);
  else if (payload) triggerLocalPatch(payload);
}

function initWizardFlowUI() {
  for (const step of [5, 6]) {
    document.getElementById(`btnWizStep${step}Back`)?.addEventListener('click', () => goToWizardStep(step - 1));
    document.getElementById(`btnWizStep${step}Next`)?.addEventListener('click', () => { if (step !== 5 || STATE.selectedPatches.size) goToWizardStep(step + 1); });
  }
  document.getElementById('btnWizStep7Back').addEventListener('click', () => goToWizardStep(6));
  document.getElementById('btnWizStep7Next').addEventListener('click', validateWizardStorageAndContinue);
  document.getElementById('btnWizStep8Back')?.addEventListener('click', () => goToWizardStep(7));
  document.getElementById('btnWizardFinish')?.addEventListener('click', () => {
    if (persistWizardConfiguration()) {
      showRvxToast('Konfigurasi berhasil disimpan.');
      switchScreen('home');
    }
  });
  document.getElementById('btnWizardStartBuild')?.addEventListener('click', startReviewedBuild);
  document.getElementById('btnWizardDefaultFolders').addEventListener('click', () => {
    for (const kind of ['workspace', 'output']) setWizardStorageFolder(kind, defaultWizardFolder(kind));
    setText('wizardStorageStatus', 'Folder bawaan dipilih. Folder akan dibuat bila belum ada, setelah akses diperiksa.');
  });
  document.querySelectorAll('[data-default-folder]').forEach(button => button.addEventListener('click', () => setWizardStorageFolder(button.dataset.defaultFolder, defaultWizardFolder(button.dataset.defaultFolder))));
  for (const kind of ['workspace', 'output']) document.getElementById(`btnPickWizard${kind === 'workspace' ? 'Workspace' : 'Output'}`).addEventListener('click', () => pickWizardFolder(kind));
  document.getElementById('btnWizardStoragePermission').addEventListener('click', () => window.RVXNativeBridge?.requestStoragePermission());
  document.getElementById('btnApplyWizardStoragePaths').addEventListener('click', () => {
    const paths = Object.fromEntries(['workspace', 'output'].map(kind => [kind, document.getElementById(`wizard${kind === 'workspace' ? 'Workspace' : 'Output'}Manual`).value.trim()]));
    for (const [kind, path] of Object.entries(paths)) {
      if (path) setWizardStorageFolder(kind, { type: 'path', path, label: path });
    }
  });
  document.getElementById('checkUnknownSizeConsent').addEventListener('change', () => updateWizardBuildValidation());
  document.getElementById('btnRefreshReviewResources').addEventListener('click', prepareWizardReview);
  document.getElementById('inputBrowserApk').addEventListener('change', event => {
    STATE.selectedApkFile = event.target.files?.[0] || null;
    setText('browserApkInputStatus', STATE.selectedApkFile ? `${STATE.selectedApkFile.name} · ${formatDownloadBytes(STATE.selectedApkFile.size)}` : 'Pilih APK yang versinya sesuai dengan konfigurasi.');
    prepareWizardReview();
  });
  document.getElementById('storageFolderSearch').addEventListener('input', filterStorageFolders);
  document.getElementById('btnStorageBrowserUp').addEventListener('click', () => { if (STATE.storageBrowseParent) fetchStorageDirectory(STATE.storageBrowseParent); });
  document.getElementById('btnUseStorageFolder').addEventListener('click', useSelectedStorageFolder);
  for (const id of ['btnCloseStorageBrowser', 'btnCancelStorageBrowser']) document.getElementById(id).addEventListener('click', closeStorageBrowser);
  document.getElementById('storageBrowserModal').addEventListener('click', event => { if (event.target.id === 'storageBrowserModal') closeStorageBrowser(); });
}
