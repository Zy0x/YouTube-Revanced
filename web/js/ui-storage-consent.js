function locationOptionMarkup(location, selectedId) {
  const free = location.availableBytes ? ` · ${formatDownloadBytes(location.availableBytes)} kosong` : '';
  return `<option value="${escapeHtml(location.id)}" ${location.id === selectedId ? 'selected' : ''} ${location.writable === false ? 'disabled' : ''}>${escapeHtml(location.label)}${free}</option>`;
}

function renderStorageLocations({ edit = false } = {}) {
  const selection = STATE.storageSelection;
  const editor = document.getElementById('storageLocationEditor');
  const readout = document.getElementById('storageLocationReadout');
  const storageSelect = document.getElementById('selectStorageLocation') || document.getElementById('selectWorkspaceLocation');
  if (!editor || !readout || !storageSelect) return;

  const storageItems = STATE.storageLocations.filter(item => item.kind === 'storage' || item.kind === 'output');
  const activeId = selection?.storageId || selection?.outputPath || selection?.workspaceId;
  storageSelect.innerHTML = `${storageItems.map(item => locationOptionMarkup(item, activeId)).join('')}${storageItems.some(item => item.id === 'custom-storage' || item.id === 'custom-output') ? '' : '<option value="custom-storage">Path khusus…</option>'}`;

  if (activeId && [...storageSelect.options].some(option => option.value === activeId)) {
    storageSelect.value = activeId;
  }
  const customInput = document.getElementById('inputCustomStorage') || document.getElementById('inputCustomWorkspace');
  const activePath = selection?.storagePath || selection?.outputPath || selection?.workspacePath || '';
  if (customInput && (storageSelect.value === 'custom-storage' || storageSelect.value === 'custom-output' || !selection?.storageId)) {
    customInput.value = activePath;
  }

  const displayPath = activePath || 'Belum dipilih';
  readout.innerHTML = `<div><span>Direktori</span><strong title="${escapeHtml(displayPath)}">${escapeHtml(displayPath)}</strong></div>`;
  editor.classList.toggle('hidden', !edit && Boolean(selection));
  readout.classList.toggle('hidden', edit || !selection);
  document.getElementById('btnChangeStorageLocations')?.classList.toggle('hidden', edit || !selection);
  syncCustomStorageFields();
}

function syncCustomStorageFields() {
  const selVal = (document.getElementById('selectStorageLocation') || document.getElementById('selectWorkspaceLocation'))?.value;
  const isCustom = selVal === 'custom-storage' || selVal === 'custom-workspace' || selVal === 'custom-output';
  document.getElementById('customStorageField')?.classList.toggle('hidden', !isCustom);
  document.getElementById('customWorkspaceField')?.classList.toggle('hidden', !isCustom);
  document.getElementById('customOutputField')?.classList.toggle('hidden', !isCustom);
}

function renderBrowserStorageMode() {
  const runtime = window.RVX_RUNTIME || {};
  const readout = document.getElementById('storageLocationReadout');
  const editor = document.getElementById('storageLocationEditor');
  const changeButton = document.getElementById('btnChangeStorageLocations');
  const heading = document.getElementById('storageLocationHeading');
  const help = heading?.parentElement?.querySelector('small');
  const workspace = runtime.supportsOPFS
    ? 'Penyimpanan privat browser (OPFS)'
    : 'Memori sesi browser';
  const output = runtime.supportsNativeSavePicker
    ? 'Pemilih simpan perangkat saat hasil siap'
    : runtime.supportsShareFiles
      ? 'Share sheet perangkat saat hasil siap'
      : 'Folder unduhan browser';
  if (heading) heading.textContent = 'Penyimpanan browser';
  if (help) help.textContent = 'Browser tidak mengekspos path internal perangkat kepada halaman HTML.';
  if (readout) {
    readout.innerHTML = `<div><span>Direktori</span><strong>${escapeHtml(output || workspace)}</strong></div>`;
    readout.classList.remove('hidden');
  }
  editor?.classList.add('hidden');
  changeButton?.classList.add('hidden');
}

function storageBrowseElements(kind = STATE.storageBrowseKind || 'storage') {
  return {
    select: document.getElementById('selectStorageLocation') || document.getElementById('selectWorkspaceLocation'),
    input: document.getElementById('inputCustomStorage') || document.getElementById('inputCustomWorkspace'),
    customId: document.getElementById('selectStorageLocation') ? 'custom-storage' : 'custom-workspace',
    openerId: document.getElementById('btnBrowseStorage') ? 'btnBrowseStorage' : 'btnBrowseWorkspace'
  };
}

function closeStorageBrowser() {
  document.getElementById('storageBrowserModal')?.classList.add('hidden');
  const returnId = STATE.storageBrowseReturnFocusId;
  STATE.storageBrowseKind = '';
  STATE.storageBrowsePath = '';
  STATE.storageBrowseParent = '';
  if (returnId) document.getElementById(returnId)?.focus();
}

function renderStorageBrowser(data) {
  const roots = document.getElementById('storageBrowserRoots');
  const list = document.getElementById('storageBrowserList');
  const current = document.getElementById('storageBrowserCurrent');
  const status = document.getElementById('storageBrowserStatus');
  const upButton = document.getElementById('btnStorageBrowserUp');
  const useButton = document.getElementById('btnUseStorageFolder');
  if (!roots || !list || !current || !upButton || !useButton) return;

  STATE.storageBrowsePath = data.current || '';
  STATE.storageBrowseParent = data.parent || '';
  roots.innerHTML = (data.roots || []).map(root => `<button type="button" class="storage-root-chip" data-storage-path="${escapeHtml(root.path)}" title="${escapeHtml(root.path)}">${escapeHtml(root.name || root.path)}</button>`).join('');
  current.textContent = data.current || 'Pilih lokasi utama';
  current.title = data.current || '';
  upButton.disabled = !data.parent;
  useButton.disabled = !data.canSelect || !data.current;
  if (status) status.textContent = data.current ? `${formatDownloadBytes(data.availableBytes || 0)} ruang tersedia` : 'Pilih drive atau lokasi utama untuk mulai menjelajah.';

  const directories = Array.isArray(data.directories) ? data.directories : [];
  list.innerHTML = data.current
    ? directories.length
      ? directories.map(directory => `<button type="button" class="storage-folder-row" data-storage-path="${escapeHtml(directory.path)}">
          <span class="storage-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z"/></svg></span>
          <span><strong>${escapeHtml(directory.name)}</strong><small>${formatDownloadBytes(directory.availableBytes || 0)} tersedia</small></span>
          <span aria-hidden="true">›</span>
        </button>`).join('')
      : '<div class="storage-browser-empty"><strong>Folder ini tidak memiliki subfolder</strong><small>Anda tetap dapat memilih folder saat ini.</small></div>'
    : '<div class="storage-browser-empty"><strong>Pilih lokasi utama</strong><small>Daemon hanya menampilkan folder, bukan isi berkas pribadi.</small></div>';

  roots.querySelectorAll('[data-storage-path]').forEach(button => button.addEventListener('click', () => fetchStorageDirectory(button.dataset.storagePath)));
  list.querySelectorAll('[data-storage-path]').forEach(button => button.addEventListener('click', () => fetchStorageDirectory(button.dataset.storagePath)));
}

async function fetchStorageDirectory(path = '') {
  const list = document.getElementById('storageBrowserList');
  const status = document.getElementById('storageBrowserStatus');
  const useButton = document.getElementById('btnUseStorageFolder');
  if (list) list.innerHTML = '<div class="storage-browser-empty"><span class="morphe-spinner"></span><strong>Membaca folder…</strong></div>';
  if (status) status.textContent = 'Daemon sedang membaca daftar folder lokal.';
  if (useButton) useButton.disabled = true;
  const params = new URLSearchParams({ kind: STATE.storageBrowseKind });
  if (path) params.set('path', path);
  try {
    const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/browse?${params}`, { headers: daemonAuthHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderStorageBrowser(data);
  } catch (error) {
    if (path) {
      await fetchStorageDirectory('');
      return;
    }
    if (list) list.innerHTML = `<div class="storage-browser-empty is-error"><strong>Folder tidak dapat dibuka</strong><small>${escapeHtml(error.message)}</small></div>`;
    if (status) status.textContent = 'Pilih lokasi lain atau periksa izin daemon.';
  }
}

async function openStorageBrowser(kind = 'storage') {
  if (kind !== 'workspace' && kind !== 'output' && kind !== 'storage') return;
  if (!STATE.daemonOnline) {
    renderBrowserStorageMode();
    return;
  }
  const modal = document.getElementById('storageBrowserModal');
  const title = document.getElementById('storageBrowserTitle');
  const subtitle = document.getElementById('storageBrowserSubtitle');
  const controls = storageBrowseElements(kind);
  STATE.storageBrowseKind = kind;
  STATE.storageBrowseReturnFocusId = controls.openerId;
  const selected = STATE.storageLocations.find(location => (location.kind === kind || location.kind === 'storage' || location.kind === 'output') && location.id === controls.select?.value);
  const initialPath = controls.select?.value === controls.customId ? controls.input?.value.trim() : selected?.path;
  if (title) title.textContent = 'Pilih folder penyimpanan';
  if (subtitle) subtitle.textContent = 'Workspace, cache, bundle, serta APK dan ZIP hasil akhir disimpan dalam folder ini.';
  modal?.classList.remove('hidden');
  title?.focus({ preventScroll: true });
  await fetchStorageDirectory(initialPath || '');
}

function useSelectedStorageFolder() {
  if (!STATE.storageBrowsePath) return;
  const controls = storageBrowseElements();
  if (controls.select) controls.select.value = controls.customId;
  if (controls.input) controls.input.value = STATE.storageBrowsePath;
  syncCustomStorageFields();
  const status = document.getElementById('storageLocationStatus');
  if (status) status.textContent = 'Folder dipilih. Tekan “Simpan & periksa lokasi” untuk memvalidasi akses tulis.';
  closeStorageBrowser();
}

async function loadStorageLocations({ edit = false } = {}) {
  const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/locations`, { headers: daemonAuthHeaders() });
  if (!response.ok) throw new Error('Daemon tidak dapat membaca lokasi penyimpanan');
  const data = await response.json();
  STATE.storageLocations = Array.isArray(data.locations) ? data.locations : [];
  STATE.storageSelection = data.selection || null;
  renderStorageLocations({ edit: edit || data.requiresSelection });
  return data;
}

async function saveStorageLocations() {
  const status = document.getElementById('storageLocationStatus');
  const button = document.getElementById('btnSaveStorageLocations');
  if (button) button.disabled = true;
  if (status) status.textContent = 'Memvalidasi akses tulis dan ruang kosong…';
  const selectEl = document.getElementById('selectStorageLocation') || document.getElementById('selectWorkspaceLocation');
  const customEl = document.getElementById('inputCustomStorage') || document.getElementById('inputCustomWorkspace');
  const storageVal = selectEl?.value || '';
  const customVal = customEl?.value.trim() || null;
  const payload = {
    storageId: storageVal,
    storagePath: customVal,
    workspaceId: storageVal,
    outputId: storageVal,
    workspacePath: customVal,
    outputPath: customVal
  };
  try {
    const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/selection`, {
      method: 'PUT', headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (window.RVXNativeBridge?.requestStoragePermission) {
        window.RVXNativeBridge.requestStoragePermission();
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    STATE.storageSelection = data.selection;
    await loadStorageLocations();
    await runDownloadPreflight();
  } catch (error) {
    if (status) {
      status.innerHTML = `${escapeHtml(error.message)} ${window.RVXNativeBridge ? '<button type="button" class="btn-clean-ghost" style="margin-top:6px;font-size:12px;padding:3px 10px;" onclick="window.RVXNativeBridge?.requestStoragePermission()">Buka Izin Akses File</button>' : ''}`;
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function renderDownloadPreflight(plan) {
  const list = document.getElementById('downloadPlanList');
  const total = document.getElementById('downloadPlanTotal');
  const confirmButton = document.getElementById('btnConfirmDownloadConsent');
  const unknownConsent = document.getElementById('unknownSizeConsent');
  const unknownCheck = document.getElementById('checkUnknownSizeConsent');
  const stateLabels = { ready: 'Siap', cached: 'Cache', download: 'Unduh', required: 'Perlu unduh', generated: 'Lokal', 'not-needed': 'Tidak perlu', unavailable: 'Belum tersedia', 'native-only': 'Root/native saja' };
  const stateClasses = { ready: 'is-cached', cached: 'is-cached', download: 'is-download', required: 'is-download', generated: '', 'not-needed': '', unavailable: 'is-download', 'native-only': 'is-download' };
  const readout = document.getElementById('storageLocationReadout');
  if (readout && (plan.storage || plan.output || plan.workspace)) {
    const target = plan.storage || plan.output || plan.workspace;
    const isSame = plan.workspace?.path === plan.output?.path;
    if (isSame || plan.storage) {
      readout.innerHTML = `<div><span>Direktori Penyimpanan</span><strong title="${escapeHtml(target.path)}">${escapeHtml(target.path)} · ${formatDownloadBytes(target.availableBytes)} kosong</strong></div>`;
    } else {
      readout.innerHTML = `<div><span>Workspace</span><strong title="${escapeHtml(plan.workspace.path)}">${escapeHtml(plan.workspace.path)} · ${formatDownloadBytes(plan.workspace.availableBytes)} kosong</strong></div><div><span>Hasil akhir</span><strong title="${escapeHtml(plan.output.path)}">${escapeHtml(plan.output.path)} · ${formatDownloadBytes(plan.output.availableBytes)} kosong</strong></div>`;
    }
  }
  list.innerHTML = (plan.items || []).map(item => {
    const download = item.downloadBytes === null || item.downloadBytes === undefined ? 'Ukuran unduh tidak diberikan server' : `Unduh ${formatDownloadBytes(item.downloadBytes)}`;
    const stored = item.storedBytes === null || item.storedBytes === undefined ? 'ukuran tersimpan diketahui setelah proses' : `tersimpan ${formatDownloadBytes(item.storedBytes)}`;
    return renderDownloadPlanItem(item.state === 'cached' || item.state === 'ready' ? '✓' : '◇', item.label, `${download} · ${stored} · ${item.destination}`, stateLabels[item.state] || item.state, stateClasses[item.state] || '');
  }).join('');
  const unknown = Number(plan.unknownSizeCount || 0);
  if (total) total.textContent = `${formatDownloadBytes(plan.knownDownloadBytes || 0)} diketahui${unknown ? ` + ${unknown} item tanpa ukuran` : ''}`;
  unknownConsent?.classList.toggle('hidden', unknown === 0);
  if (unknownCheck) unknownCheck.checked = false;
  const needsDownloads = (plan.items || []).some(item => item.state === 'download' || item.state === 'required');
  if (confirmButton) {
    confirmButton.disabled = unknown > 0 || plan.ready === false || plan.enoughStorage === false;
    confirmButton.textContent = needsDownloads ? 'Setujui & mulai' : 'Mulai dari cache';
  }
}

async function runDownloadPreflight() {
  const list = document.getElementById('downloadPlanList');
  const confirmButton = document.getElementById('btnConfirmDownloadConsent');
  if (!STATE.storageSelection) return;
  if (list) list.innerHTML = renderDownloadPlanItem('·', 'Memeriksa rencana', 'Hanya metadata dan header ukuran yang dibaca.', 'Sebentar…');
  if (confirmButton) confirmButton.disabled = true;
  STATE.pendingDownloadPlan = null;
  STATE.pendingLocalPatchPayload = createLocalPatchPayload();
  const response = await fetch(`${STATE.daemonUrl}/api/v1/downloads/plan`, {
    method: 'POST', headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(STATE.pendingLocalPatchPayload)
  });
  const plan = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(plan.error || `HTTP ${response.status}`);
  STATE.pendingDownloadPlan = plan;
  STATE.pendingLocalPatchPayload = createLocalPatchPayload();
  renderDownloadPreflight(plan);
}

async function openDownloadConsentModal() {
  const activeSourceObj = STATE.sources.find(source => source.id === STATE.currentSource);
  const packageName = STATE.currentApp?.packageName;
  if (STATE.engineMode === 'local' && !activeSourceObj?.bundleUrl) {
    alert('Bundle .mpp untuk sumber yang dipilih belum tersedia. Pilih sumber lain yang berstatus siap.');
    return;
  }
  if (!packageName || !isSourceCompatibleWithApp(activeSourceObj.id, packageName)) {
    alert('Sumber patch yang dipilih tidak mendukung aplikasi ini. Pilih sumber yang kompatibel.');
    return;
  }

  const modal = document.getElementById('downloadConsentModal');
  const list = document.getElementById('downloadPlanList');
  const total = document.getElementById('downloadPlanTotal');
  const network = document.getElementById('downloadPlanNetwork');
  const confirmButton = document.getElementById('btnConfirmDownloadConsent');
  const runtimeGate = document.getElementById('localRuntimeGate');
  if (!modal || !list) return;

  modal.classList.remove('hidden');
  list.innerHTML = renderDownloadPlanItem('·', 'Memeriksa perangkat', 'Membaca cache dan APK lokal tanpa mengunduh berkas.', 'Sebentar…');
  if (total) total.textContent = 'Memeriksa cache lokal…';
  if (confirmButton) confirmButton.disabled = true;
  runtimeGate?.classList.add('hidden');
  document.getElementById('browserApkInputPanel')?.classList.toggle('hidden', STATE.engineMode !== 'browser');
  document.getElementById('btnPrepareOnWifi')?.classList.add('hidden');
  if (network) network.textContent = navigator.connection?.effectiveType?.toUpperCase() || 'Jaringan';

  try {
    if (STATE.engineMode === 'browser') {
      renderBrowserStorageMode();
      const release = STATE.selectedRelease || getSelectedSourceRelease(activeSourceObj, STATE.patchTag);
      const plan = await RVX_LOCAL_ENGINE.preflight({
        source: activeSourceObj,
        release,
        apkSize: STATE.selectedApkFile?.size || 0
      });
      STATE.browserDownloadPlan = plan;
      STATE.pendingDownloadPlan = plan;
      renderDownloadPreflight(plan);
      const opener = document.getElementById('btnOpenLocalRuntime');
      const gateText = document.getElementById('localRuntimeGateText');
      const wifiButton = document.getElementById('btnPrepareOnWifi');
      if (opener) opener.classList.add('hidden');
      if (!plan.ready) {
        if (gateText) gateText.textContent = plan.reason;
        runtimeGate?.classList.remove('hidden');
        if (total) total.textContent = 'Tidak ada unduhan yang dimulai';
        if (confirmButton) confirmButton.disabled = true;
        return;
      }
      if (plan.enoughStorage === false) {
        if (gateText) gateText.textContent = 'Ruang penyimpanan browser tidak cukup untuk APK, hasil, dan file sementara.';
        runtimeGate?.classList.remove('hidden');
        if (confirmButton) confirmButton.disabled = true;
        return;
      }
      if (wifiButton && plan.knownDownloadBytes > 0) wifiButton.classList.remove('hidden');
      if (confirmButton) confirmButton.disabled = !STATE.selectedApkFile;
      return;
    }

    if (!STATE.daemonOnline) await checkDaemonStatus();
    if (!STATE.daemonOnline) {
      const opener = document.getElementById('btnOpenLocalRuntime');
      const gateText = document.getElementById('localRuntimeGateText');
      opener?.classList.add('hidden');
      if (gateText) gateText.textContent = 'Native helper Root WebUI tidak tersedia. Periksa service modul lalu muat ulang halaman.';
      runtimeGate?.classList.remove('hidden');
      list.innerHTML = renderDownloadPlanItem('◇', 'Helper root tidak tersedia', 'Tidak ada koneksi ke origin atau perangkat lain yang dicoba.', 'Periksa modul');
      if (total) total.textContent = 'Tidak ada unduhan atau penggunaan kuota';
      return;
    }
    if (!(await ensureDaemonSession(STATE.daemonUrl))) {
      const localUrl = localDaemonWebUrl();
      const opener = document.getElementById('btnOpenLocalRuntime');
      const gateText = document.getElementById('localRuntimeGateText');
      if (opener && localUrl) {
        opener.classList.remove('hidden');
        opener.removeAttribute('download');
        opener.textContent = 'Buka Root WebUI';
        opener.href = localUrl;
      } else if (opener && !window.RVX_RUNTIME?.isSingleFile) {
        opener.classList.remove('hidden');
        opener.href = 'rvx-local.html';
        opener.download = 'rvx-local.html';
        opener.textContent = 'Unduh HTML lokal';
      } else {
        opener?.classList.add('hidden');
      }
      if (gateText) gateText.textContent = STATE.daemonOnline
        ? 'Runtime ditemukan, tetapi halaman ini tidak memperoleh sesi perangkat. Muat ulang Root WebUI agar akses penyimpanan memakai origin yang sama.'
        : 'Companion lokal belum ditemukan. Jalankan companion pada perangkat ini, lalu buka UI lokal.';
      runtimeGate?.classList.remove('hidden');
      list.innerHTML = renderDownloadPlanItem('⌂', 'Akses lokal diperlukan', 'Tidak ada file yang diunduh. Pairing manual sudah tidak digunakan.', 'Menunggu companion');
      if (total) total.textContent = 'Hubungkan runtime lokal untuk melanjutkan';
      return;
    }
    const storage = await loadStorageLocations();
    if (!storage.requiresSelection && STATE.storageSelection) await runDownloadPreflight();
    else {
      list.innerHTML = renderDownloadPlanItem('⌖', 'Pilih lokasi penyimpanan', 'Pilih folder penyimpanan kerja & hasil, lalu tekan “Simpan & periksa lokasi”.', 'Menunggu pilihan');
      if (total) total.textContent = 'Pilih folder sebelum memulai';
    }
  } catch (error) {
    list.innerHTML = renderDownloadPlanItem('!', 'Preflight gagal', error.message, 'Coba lagi', 'is-download');
    if (total) total.textContent = 'Rencana belum siap';
  }
}

function closeDownloadConsentModal() {
  if (!document.getElementById('storageBrowserModal')?.classList.contains('hidden')) closeStorageBrowser();
  document.getElementById('downloadConsentModal')?.classList.add('hidden');
  STATE.pendingLocalPatchPayload = null;
  STATE.pendingDownloadPlan = null;
}

function confirmLocalPatchBuild() {
  if (STATE.engineMode === 'browser') {
    if (!STATE.selectedApkFile || !STATE.browserDownloadPlan?.ready) return;
    document.getElementById('downloadConsentModal')?.classList.add('hidden');
    triggerBrowserPatchBuild(STATE.browserDownloadPlan, STATE.selectedApkFile);
    return;
  }
  const payload = STATE.pendingLocalPatchPayload;
  if (!payload) return;
  document.getElementById('downloadConsentModal')?.classList.add('hidden');
  STATE.pendingLocalPatchPayload = null;
  triggerLocalPatch(payload);
}
