/* ==========================================================================
   RETURNING USER DASHBOARD
   ========================================================================== */
function renderAppCardsWithConfigStatus() {
  const container = document.getElementById('homeAppsGrid');
  if (!container) return;
  container.innerHTML = '';
  if (!STATE.homeAppQuery) updatePreflightDoctor();

  if (homeAppListObserver) {
    homeAppListObserver.disconnect();
    homeAppListObserver = null;
  }

  const query = STATE.homeAppQuery || '';
  const apps = (STATE.availableApps || []).filter(app => `${app.name} ${app.packageName}`.toLowerCase().includes(query));
  const count = document.getElementById('homeAppCount');
  if (count) count.textContent = `${apps.length} aplikasi`;
  if (!apps.length) container.innerHTML = '<p class="wizard-patch-empty">Tidak ada aplikasi yang cocok. Coba kata lain.</p>';
  const createCard = app => {
    const isConfigured = isAppConfigured(app.packageName);
    const savedConfig = getAppConfig(app.packageName);
    const card = document.createElement('div');
    card.className = 'morphe-app-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Konfigurasi ${app.name}`);

    const statusBadge = isConfigured
      ? `<span class="badge-configured">Terkonfigurasi</span>`
      : `<span class="badge-needs-setup">+ Setup</span>`;

    const versionPrefix = app.recommendedVersion ? `v${app.recommendedVersion} • ` : '';
    const subText = isConfigured
      ? `v${savedConfig.targetVersion || app.recommendedVersion} • ${savedConfig.mode === 'root' ? 'Mode Root' : 'Non-Root'} (${savedConfig.selectedPatches?.length || app.patchCount} patch)`
      : `${versionPrefix}${formatAppCoverage(app)}`;

    card.innerHTML = `
      ${renderAppIcon(app)}
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 class="yt-card-title">${escapeHtml(app.name)}</h3>
          ${statusBadge}
        </div>
        <p class="yt-card-sub">${escapeHtml(subText)}</p>
      </div>
      ${isConfigured ? `
        <button type="button" class="btn-card-edit" title="Edit konfigurasi aplikasi ini" aria-label="Ubah konfigurasi">⋮</button>
      ` : `
        <div class="app-card-arrow">›</div>
      `}
    `;

    // Click card action
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-edit')) {
        e.stopPropagation();
        openAppSetupWizard(app.packageName);
        return;
      }

      openAppSetupWizard(app.packageName);
    });

    card.addEventListener('keydown', event => {
      if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openAppSetupWizard(app.packageName);
    });
    return card;
  };

  const appendBatch = () => {
    container.querySelector('.wizard-app-load-more')?.remove();
    if (homeAppListObserver) {
      homeAppListObserver.disconnect();
      homeAppListObserver = null;
    }

    const start = Number(container.dataset.renderedApps || 0);
    const end = Math.min(start + WIZARD_APP_BATCH_SIZE, apps.length);
    const fragment = document.createDocumentFragment();
    apps.slice(start, end).forEach(app => fragment.appendChild(createCard(app)));
    container.appendChild(fragment);
    hydrateAppIcons(container);
    container.dataset.renderedApps = String(end);
    if (end >= apps.length) return;

    const loadMore = document.createElement('button');
    loadMore.type = 'button';
    loadMore.className = 'wizard-app-load-more';
    loadMore.textContent = `Muat berikutnya · ${apps.length - end} tersisa`;
    loadMore.addEventListener('click', appendBatch, { once: true });
    container.appendChild(loadMore);

    if ('IntersectionObserver' in window) {
      homeAppListObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendBatch();
      }, { rootMargin: '320px 0px' });
      homeAppListObserver.observe(loadMore);
    }
  };

  container.dataset.renderedApps = '0';
  appendBatch();
}

async function openAppSetupWizard(pkgId) {
  resetWizardSelections();
  selectApp(pkgId);
  const saved = getAppConfig(pkgId);
  goToWizardStep(2);
  switchScreen('wizard');
  if (!saved) return;
  try {
    const selected = await selectPatchSource(saved.source);
    if (STATE.currentApp?.packageName !== pkgId) return;
    if (!selected) throw new Error('Sumber tidak tersedia');
    const ready = await selectPatchChannel(saved.patchTag);
    if (!ready) throw new Error('Rilis tidak tersedia');
    if (STATE.currentApp?.packageName !== pkgId) return;
    applySavedAppConfig(saved);
    goToWizardStep(8);
  } catch (_) {
    showRvxToast('Periksa kembali sumber dan rilis konfigurasi tersimpan.');
    goToWizardStep(2);
  }
}

function applySavedAppConfig(config) {
  if (!config) return;
  if (config.targetVersion) STATE.currentVersion = config.targetVersion;
  if (config.source) STATE.currentSource = config.source;
  if (config.patchTag) STATE.patchTag = config.patchTag;
  if (config.mode) {
    STATE.targetMode = config.mode;
    STATE.modeEditorExpanded = false;
  }
  if (Array.isArray(config.selectedPatches) && config.selectedPatches.length > 0) {
    const available = new Set(STATE.patches.map(patch => patch.name));
    STATE.selectedPatches = new Set(config.selectedPatches.filter(name => available.has(name)));
  }
  if (config.selectedOptions) {
    STATE.selectedOptions = { ...config.selectedOptions };
  }
  if (config.storageFolders) {
    STATE.wizardStorageDraft = config.storageFolders;
    STATE.wizardStorageValidated = false;
  }
  if (config.engineOptions) {
    const engine = config.engineOptions;
    STATE.morpheEngineOptions = {
      ...STATE.morpheEngineOptions, ...engine, executionPolicyVersion: 2,
      continueOnError: engine.executionPolicyVersion === 2 && engine.continueOnError === true,
      force: engine.executionPolicyVersion === 2 && engine.force === true
    };
  }
  syncAllSummaries();
}

/* ==========================================================================
   SILENT DEVELOPER MODE (5 clicks on version in info modal)
   ========================================================================== */
function registerSilentDeveloperListener(versionElement) {
  if (!versionElement) return;

  versionElement.addEventListener('click', () => {
    silentDevClicks++;
    clearTimeout(silentDevTimer);

    if (silentDevClicks >= 5) {
      silentDevClicks = 0;
      openSilentDeveloperModal();
    } else {
      silentDevTimer = setTimeout(() => {
        silentDevClicks = 0;
      }, 2500);
    }
  });
}

function openSilentDeveloperModal() {
  const modal = document.getElementById('silentDevModal');
  if (!modal) return;

  const inputRepo = document.getElementById('inputDevRepo');
  const inputBranch = document.getElementById('inputDevBranch');
  const inputToken = document.getElementById('inputDevToken');

  if (inputRepo) inputRepo.value = 'Zy0x/YouTube-Revanced';
  if (inputBranch) inputBranch.value = 'main';
  if (inputToken) inputToken.value = STATE.authToken || '';

  modal.classList.remove('hidden');
}

/* ==========================================================================
   PREFLIGHT SYSTEM DOCTOR DIAGNOSTIC
   ========================================================================== */
let doctorRequest = 0;
async function updatePreflightDoctor() {
  const request = ++doctorRequest;
  const badge = document.getElementById('doctorBadgeOverall');
  const note = document.getElementById('doctorStatusNote');
  const retry = document.getElementById('btnRetryDiagnostics');
  if (!badge) return;
  badge.textContent = 'Memeriksa…';
  badge.className = 'doctor-badge doctor-badge-checking';
  if (retry) retry.disabled = true;
  if (note) note.textContent = 'Memeriksa kemampuan lingkungan ini.';
  const ids = { jre: 'Jre', engine: 'Engine', root: 'Root', storage: 'Storage', microg: 'Microg' };
  const applyRow = (key, row) => {
    setText(`doc${ids[key]}Text`, row.text);
    const dot = document.getElementById(`doc${ids[key]}Dot`);
    if (dot) dot.className = `doc-dot ${{ ready: 'dot-green', attention: 'dot-yellow', neutral: 'dot-gray', unknown: 'dot-gray' }[row.state]}`;
  };
  Object.keys(ids).forEach(key => applyRow(key, { text: 'Memeriksa…', state: 'unknown' }));
  let data = null;
  let error = '';
  try {
    if (window.RVX_RUNTIME?.allowsNativeBridge) {
      const response = await fetch(`${STATE.daemonUrl}/api/v1/system/status`, { headers: daemonAuthHeaders(), signal: rvxTimeoutSignal(4000) });
      if (!response.ok) throw new Error('Helper perangkat belum terhubung.');
      data = await response.json();
      if (data.web_runtime !== 'local-daemon') throw new Error('Helper perangkat tidak dapat diverifikasi.');
      STATE.daemonStatus = data;
      STATE.daemonOnline = true;
    }
  } catch (failure) { error = failure.message; }
  if (request !== doctorRequest) return;
  let nativeRoot = null;
  let nativeMicrog = null;
  try {
    if (window.RVXNativeBridge?.isRootAvailable) nativeRoot = Boolean(window.RVXNativeBridge.isRootAvailable());
    if (window.RVXNativeBridge?.isPackageInstalled) nativeMicrog = Boolean(window.RVXNativeBridge.isPackageInstalled('app.revanced.android.gms') || window.RVXNativeBridge.isPackageInstalled('com.mgoogle.android.gms'));
  } catch (_) { /* An unavailable bridge is unknown, never ready. */ }
  const report = RVX_UI.diagnostics(data, { mode: STATE.targetMode, nativeRoot, nativeMicrog });
  Object.entries(report.rows).forEach(([key, row]) => applyRow(key, row));
  badge.textContent = report.label;
  badge.className = `doctor-badge doctor-badge-${report.state === 'ready' ? 'ready' : report.state === 'attention' ? 'warning' : 'checking'}`;
  if (note) note.textContent = error
    ? `${error} Muat ulang pemeriksaan atau buka aplikasi melalui modul di perangkat.`
    : data ? 'Status berasal dari pemeriksaan perangkat. Pilihan mode tidak mengubah hasil pemeriksaan.'
    : 'Browser tidak dapat memeriksa akses root atau aplikasi yang terpasang pada perangkat.';
  if (!data && !window.RVX_RUNTIME?.isRootWebUI && !window.RVX_RUNTIME?.isAppEmbedded) {
    let engine = null;
    try { engine = await RVX_LOCAL_ENGINE.loadManifest(); } catch (_) {}
    if (request !== doctorRequest) return;
    applyRow('jre', { text: 'Tidak diperlukan', state: 'neutral' });
    applyRow('engine', { text: engine?.available === true ? 'Mesin browser tersedia' : 'Mesin browser belum tersedia', state: engine?.available === true ? 'ready' : 'attention' });
    badge.textContent = engine?.available === true ? 'Periksa konfigurasi' : 'Build browser belum tersedia';
    badge.className = 'doctor-badge doctor-badge-warning';
    if (note) note.textContent = 'Anda dapat menyiapkan dan menyimpan konfigurasi. Untuk membuat APK saat ini, gunakan aplikasi atau WebUI modul pada perangkat yang didukung.';
  }
  if (retry) retry.disabled = false;
}
