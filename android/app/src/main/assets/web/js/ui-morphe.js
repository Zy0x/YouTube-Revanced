/**
 * YouTube RVX — Morphe UI Renderers & Pipeline
 * Version: 2.1.15
 */

function renderAppCards() {
  const container = document.getElementById('homeAppsGrid');
  if (!container) return;

  if (STATE.setupCompleted && typeof renderAppCardsWithConfigStatus === 'function') {
    renderAppCardsWithConfigStatus();
    return;
  }

  container.innerHTML = '';

  const apps = STATE.availableApps || [];
  if (apps.length === 0) {
    container.innerHTML = '<div class="morphe-ver-row"><span class="morphe-muted-hint">Loading supported applications...</span></div>';
    return;
  }

  apps.forEach(app => {
    const isSelected = STATE.currentApp && STATE.currentApp.packageName === app.packageName;
    const card = document.createElement('div');
    card.className = `morphe-app-card ${isSelected ? 'active-app' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    card.setAttribute('tabindex', '0');
    card.style.setProperty('--app-bg-gradient', app.gradient);
    const versionText = app.recommendedVersion ? `v${escapeHtml(app.recommendedVersion)} • ` : '';
    const coverageText = app.catalogCoverageUnknown
      ? `${app.sourcesCount || 1} patch sources available`
      : `${app.patchCount} patches available`;

    card.innerHTML = `
      ${renderAppIcon(app)}
      <div class="yt-card-text">
        <h2 class="yt-card-title">${escapeHtml(app.name)}</h2>
        <p class="yt-card-sub">${versionText}${coverageText}</p>
      </div>
      <div class="app-card-arrow" aria-hidden="true">›</div>
    `;

    const handleClick = () => {
      selectApp(app.packageName);
      switchScreen('version');
    };

    card.addEventListener('click', handleClick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    });

    container.appendChild(card);
    hydrateAppIcons(card);
  });
}

function renderSourceCards() {
  const container = document.getElementById('sourceCardsGrid');
  if (!container) return;
  container.innerHTML = '';

  setText('modalSourcesCountSub', `${STATE.sources.length} sources installed`);

  STATE.sources.forEach(s => {
    const isActive = s.id === STATE.currentSource;
    const shortTitle = getSourceDisplayName(s.id);
    const repo = s.repository || (s.manifestUrl ? 'Custom Feed' : `${s.id}/patches`);
    const avatar = s.avatarText || shortTitle.charAt(0).toUpperCase() || 'P';
    const avatarBg = s.avatarColor || '#3182CE';

    const card = document.createElement('div');
    card.className = `source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.title = s.description || shortTitle;
    card.innerHTML = `
      <div class="source-card-avatar" style="background: ${avatarBg}">${avatar}</div>
      <div class="source-card-meta">
        <span class="source-card-title">${escapeHtml(shortTitle)}</span>
        <span class="source-card-tag">${s.isPreinstalled !== false ? 'Pre-installed' : 'Custom'}</span>
      </div>
      <span class="source-card-check">${isActive ? '✓' : ''}</span>
    `;

    card.addEventListener('click', async () => {
      await selectPatchSource(s.id);
    });

    container.appendChild(card);
  });

  renderActiveSourceDetails();
}

function renderActiveSourceDetails() {
  const container = document.getElementById('activeSourceDetailsBox');
  if (!container) return;

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  if (!activeSrc) return;

  const shortTitle = getSourceDisplayName(activeSrc.id);
  const repo = activeSrc.repository || activeSrc.manifestUrl || '';
  const avatar = activeSrc.avatarText || shortTitle.charAt(0).toUpperCase() || 'P';
  const avatarBg = activeSrc.avatarColor || '#3182CE';
  const isPre = activeSrc.isPreinstalled !== false;
  const patchesCount = STATE.patches.length || STATE.allManifestPatches.length || 0;
  const appsCount = STATE.availableApps.length || 1;
  const activeTag = STATE.patchTag || (STATE.preReleasePatches ? 'dev' : 'latest');
  const browserUrl = activeSrc.repository 
    ? `https://github.com/${activeSrc.repository}`
    : (activeSrc.manifestUrl || '#');

  container.innerHTML = `
    <!-- Top Header matching 01-sources-sheet.jpg -->
    <div class="source-active-header">
      <div class="source-active-avatar" style="background: ${avatarBg}">
        ${avatar}
      </div>
      <div class="source-active-meta">
        <div class="source-active-title">${escapeHtml(activeSrc.name || shortTitle)}</div>
        <div class="source-active-tags">
          <span class="source-badge ${isPre ? '' : 'source-badge-custom'}">${isPre ? 'Pre-installed' : 'Custom'}</span>
          <span class="source-active-repo">${escapeHtml(repo)}</span>
        </div>
      </div>
    </div>

    <!-- 3 Info Rows matching 01-sources-sheet.jpg -->
    <div class="source-info-rows">
      <div class="source-info-row" id="rowSrcPatches" title="View patches for current app">
        <div class="source-info-label">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Patches</span>
        </div>
        <div class="source-info-val">
          <span>${patchesCount}</span>
          <span class="source-chevron">›</span>
        </div>
      </div>

      <div class="source-info-row" id="rowSrcVersion" title="Active release channel">
        <div class="source-info-label">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Version</span>
        </div>
        <div class="source-info-val">
          <span>${escapeHtml(activeTag)}</span>
          <span class="source-chevron">›</span>
        </div>
      </div>

      <div class="source-info-row" id="rowSrcApps" title="Supported applications in this patch source">
        <div class="source-info-label">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>Apps</span>
        </div>
        <div class="source-info-val">
          <span>${appsCount}</span>
          <span class="source-chevron">›</span>
        </div>
      </div>
    </div>

    <!-- Actions Row -->
    <div class="source-active-actions">
      <a href="${browserUrl}" target="_blank" rel="noopener noreferrer" class="morphe-pill-btn morphe-pill-outline btn-block" style="flex: 1;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        <span>Open in browser</span>
      </a>
      <button type="button" id="btnRefreshActiveSource" class="icon-circle-btn" title="Refresh source manifest" aria-label="Refresh manifest">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      </button>
      ${!isPre ? `
        <button type="button" id="btnDeleteActiveSource" class="source-btn-delete" title="Delete custom source" aria-label="Delete source">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Delete</span>
        </button>
      ` : ''}
    </div>

    <!-- Material 3 Switches (1:1 with 01-sources-sheet.jpg) -->
    <div class="morphe-switch-row">
      <div class="morphe-switch-label">
        <span class="morphe-switch-title">Pre-release patches</span>
        <span class="morphe-switch-desc">Receives early access to new experimental patch versions</span>
      </div>
      <label class="morphe-switch" aria-label="Toggle pre-release patches">
        <input type="checkbox" id="togglePreReleasePatches" ${STATE.preReleasePatches ? 'checked' : ''}>
        <span class="morphe-switch-slider"></span>
      </label>
    </div>

    <div class="morphe-switch-row">
      <div class="morphe-switch-label">
        <span class="morphe-switch-title">Experimental app versions</span>
        <span class="morphe-switch-desc">Shows and patches experimental app targets</span>
      </div>
      <label class="morphe-switch" aria-label="Toggle experimental app versions">
        <input type="checkbox" id="toggleExperimentalAppVersions" ${STATE.experimentalAppVersions ? 'checked' : ''}>
        <span class="morphe-switch-slider"></span>
      </label>
    </div>
  `;

  // Attach event handlers
  container.querySelector('#btnRefreshActiveSource')?.addEventListener('click', async () => {
    await selectPatchSource(activeSrc.id);
  });

  container.querySelector('#btnDeleteActiveSource')?.addEventListener('click', async () => {
    if (confirm(`Remove custom patch source "${activeSrc.name || shortTitle}"?`)) {
      deleteCustomSource(activeSrc.id);
      await selectPatchSource(STATE.currentSource);
    }
  });

  container.querySelector('#togglePreReleasePatches')?.addEventListener('change', async (e) => {
    STATE.preReleasePatches = e.target.checked;
    RVX_STORAGE.local.setItem('rvx_pre_release_patches', String(STATE.preReleasePatches));
    await loadPatchReleases(activeSrc);
    renderActiveSourceDetails();
  });

  container.querySelector('#toggleExperimentalAppVersions')?.addEventListener('change', (e) => {
    STATE.experimentalAppVersions = e.target.checked;
    STATE.showAllVersions = e.target.checked;
    RVX_STORAGE.local.setItem('rvx_experimental_app_versions', String(STATE.experimentalAppVersions));
    renderVersionSelector();
  });

  container.querySelector('#rowSrcPatches')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
    switchScreen('patches');
  });

  container.querySelector('#rowSrcApps')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
    switchScreen('home');
  });
}

function renderVersionSelector() {
  const container = document.getElementById('versionListContainer');
  if (!container) return;
  container.innerHTML = '';

  let filtered = STATE.availableVersions || [];
  if (STATE.versionSearch) {
    const q = STATE.versionSearch.toLowerCase();
    filtered = filtered.filter(item => item.version.toLowerCase().includes(q));
  }

  const limit = STATE.showAllVersions ? 25 : (STATE.versionDisplayLimit || 4);
  const displayList = filtered.slice(0, limit);

  if (displayList.length === 0) {
    container.innerHTML = '<div class="morphe-ver-row"><span class="morphe-muted-hint">No matching versions found.</span></div>';
  } else {
    displayList.forEach(item => {
      const ver = item.version;
      const isSelected = ver === STATE.currentVersion;
      const row = document.createElement('div');
      row.className = `morphe-ver-row ${isSelected ? 'active' : ''}`;
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', isSelected ? 'true' : 'false');

      const cls = typeof classifyVersion === 'function' ? classifyVersion(ver) : { label: 'Stable', badgeClass: 'badge-stable' };
      const rightHtml = `
        <div class="version-badges-row">
          <span class="badge-version ${cls.badgeClass}">${cls.label}</span>
          ${item.isRecommended ? `<span class="ver-pill-rec">${SVG_THUMB}<span>Recommended</span></span>` : ''}
        </div>
      `;

      row.innerHTML = `
        <div class="ver-row-left">
          <span class="ver-check-mark">${isSelected ? SVG_CHECK : ''}</span>
          <span class="ver-number-mono">${escapeHtml(ver)}</span>
        </div>
        ${rightHtml}
      `;

      row.addEventListener('click', () => {
        STATE.currentVersion = ver;
        renderVersionSelector();
        syncAllSummaries();
      });

      container.appendChild(row);
    });
  }

  const btnToggleAll = document.getElementById('btnToggleAllVersions');
  if (btnToggleAll) {
    btnToggleAll.textContent = STATE.showAllVersions ? 'Show fewer versions' : 'Show more versions';
  }
}

function renderMorphePatchList(containerId = 'patchCategoriesContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const isWizardList = containerId === 'wizardPatchCategoriesContainer';
  const query = (STATE.patchSearchQuery || '').toLowerCase().trim();
  const enabledOnly = STATE.filterEnabledOnly;
  const viewFilter = isWizardList ? (STATE.patchListFilter || 'all') : 'all';

  const filtered = STATE.patches.filter(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    if (enabledOnly && !isSelected) return false;
    if (viewFilter === 'selected' && !isSelected) return false;
    if (viewFilter === 'options' && !(Array.isArray(patch.options) && patch.options.length > 0)) return false;
    if (query) {
      const n = (patch.name || '').toLowerCase();
      const d = (patch.description || '').toLowerCase();
      if (!n.includes(query) && !d.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = isWizardList
      ? '<div class="wizard-patch-empty"><strong>Tidak ada patch yang cocok</strong><span>Ubah pencarian atau filter untuk melihat patch lainnya.</span></div>'
      : '<div class="morphe-alert">No matching patches.</div>';
    if (isWizardList && typeof updateWizardPatchStats === 'function') updateWizardPatchStats(0);
    return;
  }

  filtered.forEach(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    const hasOptions = Array.isArray(patch.options) && patch.options.length > 0;

    const card = document.createElement('div');
    card.className = `${isWizardList ? 'wizard-patch-row' : 'patch-item'} ${isSelected ? 'selected' : ''}`;
    card.dataset.patchName = patch.name;
    card.setAttribute('role', isWizardList ? 'checkbox' : 'button');
    card.setAttribute('aria-checked', String(isSelected));
    card.setAttribute('tabindex', '0');

    card.innerHTML = isWizardList ? `
      <span class="patch-toggle" aria-hidden="true"><span></span></span>
      <span class="wizard-patch-copy">
      <span class="wizard-patch-title-line">
          <strong>${escapeHtml(patch.name)}</strong>
          ${hasOptions ? '<span class="patch-options-badge">Beropsi</span>' : ''}
        ${hasOptions && patchHasCustomizedOptions(patch) ? '<span class="patch-options-badge is-customized">Diatur</span>' : ''}
        </span>
        <span class="wizard-patch-description">${escapeHtml(patch.description || 'Tidak ada deskripsi dari sumber patch.')}</span>
      </span>
      ${hasOptions ? `<button type="button" id="patchOptBtn-${STATE.patches.indexOf(patch)}" class="morphe-patch-gear-btn wizard-patch-options" title="Atur ${escapeHtml(patch.name)}" aria-label="Atur ${escapeHtml(patch.name)}">${SVG_GEAR}<span>Atur</span></button>` : ''}
    ` : `
      <div class="morphe-circle-check" aria-hidden="true">${SVG_CHECK}</div>
      <div class="patch-info">
        <div class="patch-title">${escapeHtml(patch.name)}</div>
        <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
      </div>
      ${hasOptions ? `<button type="button" class="morphe-patch-gear-btn" title="Configure ${escapeHtml(patch.name)}" aria-label="Configure ${escapeHtml(patch.name)}">${SVG_GEAR}</button>` : ''}
    `;

    const togglePatch = e => {
      if (e.target.closest('.morphe-patch-gear-btn')) {
        e.stopPropagation();
        openPatchOptionsModal(patch);
        return;
      }
      const willBeChecked = !STATE.selectedPatches.has(patch.name);
      if (STATE.selectedPatches.has(patch.name)) {
        STATE.selectedPatches.delete(patch.name);
        card.classList.remove('selected');
      } else {
        STATE.selectedPatches.add(patch.name);
        card.classList.add('selected');
      }
      if (typeof checkMicrogSmartWarning === 'function') {
        checkMicrogSmartWarning(patch.name, willBeChecked);
      }
      if (isWizardList) renderMorphePatchList(containerId);
      syncAllSummaries();
    };
    card.addEventListener('click', togglePatch);
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      togglePatch(event);
    });

    container.appendChild(card);
  });
  if (isWizardList && typeof updateWizardPatchStats === 'function') updateWizardPatchStats(filtered.length);
}


function syncAllSummaries() {
  const total = STATE.patches.length || 0;
  const active = STATE.selectedPatches.size;
  const ver = STATE.currentVersion || '—';
  const srcName = getSourceDisplayName(STATE.currentSource);
  const appName = STATE.currentApp?.name || 'Belum dipilih';
  const statusSuffix = STATE.installedVersion ? 'Installed' : 'Ready to patch';

  setText('homeCardMeta', `v${ver} • ${statusSuffix}`);
  setText('expertAppName', appName);
  setText('versionAppHeading', appName);
  setText('expertHeaderSource', `${srcName} Patches`);
  setText('expertCounterText', `${active}/${total}`);
  setText('progressPatchRatio', `${active} / ${total}`);
  setText('sourceSheetPatchCount', `${total} ›`);

  const headerEl = document.getElementById('morpheExpertHeader');
  if (headerEl && STATE.currentApp?.gradient) {
    headerEl.style.background = STATE.currentApp.gradient;
  }
  const headerIconEl = document.getElementById('expertHeaderAppIcon');
  if (headerIconEl && STATE.currentApp?.iconSvg) {
    headerIconEl.innerHTML = STATE.currentApp.iconSvg;
    if (STATE.currentApp.accentColor) {
      headerIconEl.style.background = STATE.currentApp.accentColor;
    }
  }

  setText('infoTargetVersion', STATE.currentVersion ? `v${ver}` : 'Belum dipilih');
  setText('infoActiveSource', STATE.currentSource ? `${srcName}${STATE.patchTag ? ` · ${STATE.patchTag}` : ''}` : 'Belum dipilih');
  setText('infoActivePatches', total ? `${active} / ${total}` : 'Belum dipilih');
  setText(
    'infoEngineStatus',
    STATE.engineMode === 'local'
      ? `Root/native · Morphe ${STATE.daemonVersion}`
      : STATE.engineMode === 'browser'
        ? `Browser lokal · ${window.RVX_RUNTIME?.supportsThreads ? 'multithread' : 'single thread'}`
        : 'Tidak tersedia'
  );
  const accessModeLabels = {
    'root-integrated': 'Root terintegrasi',
    'local-companion': 'Companion non-root',
    'desktop-local': 'Desktop lokal',
    'browser-local': 'HTML lokal',
    'browser-only': 'Browser saja',
    'standalone-browser': 'HTML lokal',
    'hosted-browser': 'PWA lokal',
    'root-helper-unavailable': 'Helper root tidak tersedia'
  };
  setText('infoDeviceAccessMode', accessModeLabels[STATE.deviceAccessMode] || 'Browser lokal');

  setText('tuiDialogSubtitle', `${appName} v${ver} • ${srcName} (${active}/${total})`);
  if (typeof updateWizardNavigationState === 'function') updateWizardNavigationState();
}

function triggerBuildPipeline() {
  if (STATE.engineMode === 'local' || STATE.engineMode === 'browser') {
    openDownloadConsentModal();
  } else {
    triggerCloudBuild();
  }
}

function createLocalPatchPayload() {
  const activeSourceObj = STATE.sources.find(s => s.id === STATE.currentSource);
  const activeRelease = STATE.selectedRelease || getSelectedSourceRelease(activeSourceObj, STATE.patchTag);
  const nativeMpp = activeRelease?.capabilities?.nativeMpp || activeSourceObj?.capabilities?.nativeMpp || {};
  const selectedAsset = getSelectedBundleAsset();
  const packageName = STATE.currentApp?.packageName;
  const allPatchNames = STATE.patches.map(p => p.name);
  return {
    package_name: packageName,
    target_version: STATE.currentVersion,
    patch_source: activeSourceObj?.repository || STATE.currentSource,
    patch_tag: STATE.patchTag,
    patch_bundle_url: selectedAsset?.browser_download_url || nativeMpp.url || activeSourceObj?.bundleUrl || null,
    patch_bundle_sha256: nativeMpp.sha256 || null,
    source_commit: activeRelease?.sourceCommit || null,
    manifest_sha256: activeRelease?.manifestSha256 || null,
    // Compatibility metadata was already verified during release selection.
    // Morphe CLI only consumes the .mpp, so do not download it again as JSON.
    manifest_url: null,
    is_root: STATE.targetMode === 'root',
    included_patches: Array.from(STATE.selectedPatches),
    excluded_patches: allPatchNames.filter(name => !STATE.selectedPatches.has(name)),
    options: STATE.selectedOptions,
    download_plan_id: STATE.pendingDownloadPlan?.planId || null,
    workspace_location_id: STATE.storageSelection?.workspaceId || null,
    output_location_id: STATE.storageSelection?.outputId || null,
    morphe_engine_options: {
      keystore_mode: STATE.morpheEngineOptions?.keystoreMode || 'persistent',
      custom_keystore_path: STATE.morpheEngineOptions?.customKeystorePath || null,
      keystore_password: STATE.morpheEngineOptions?.keystorePassword || null,
      keystore_alias: STATE.morpheEngineOptions?.keystoreAlias || null,
      keystore_entry_password: STATE.morpheEngineOptions?.keystoreEntryPassword || null,
      signer_name: STATE.morpheEngineOptions?.signerName || 'Morphe',
      unsigned: STATE.morpheEngineOptions?.keystoreMode === 'unsigned',
      strip_libs: STATE.morpheEngineOptions?.stripLibs ? (STATE.morpheEngineOptions.selectedArchs || ['arm64-v8a']) : [],
      bytecode_mode: STATE.morpheEngineOptions?.bytecodeMode || 'STRIP_FAST',
      continue_on_error: STATE.morpheEngineOptions?.continueOnError !== false,
      force: STATE.morpheEngineOptions?.force !== false,
      disable_purge: STATE.morpheEngineOptions?.disablePurge === true
    }
  };
}

function formatDownloadBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return 'ukuran belum tersedia';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function getSelectedBundleAsset() {
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  if (!source) return null;
  const releases = STATE.sourceReleases[source.id] || STATE.patchReleases || [];
  const release = STATE.patchTag === 'latest'
    ? releases.find(item => !item.prerelease && !item.draft)
    : STATE.patchTag === 'dev' || STATE.patchTag === 'prerelease'
      ? releases.find(item => item.prerelease && !item.draft)
      : releases.find(item => (item.tag_name || item.name) === STATE.patchTag);
  return sourceReleaseBundleAsset(source, release);
}

function renderDownloadPlanItem(icon, title, detail, state, stateClass = '') {
  return `<div class="download-plan-item">
    <span class="download-plan-icon" aria-hidden="true">${icon}</span>
    <span class="download-plan-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
    <span class="download-plan-state ${stateClass}">${escapeHtml(state)}</span>
  </div>`;
}


async function triggerBrowserPatchBuild(plan, apkFile) {
  const controller = new AbortController();
  STATE.browserPatchAbortController?.abort();
  STATE.browserPatchAbortController = controller;
  switchScreen('progress');
  setLocalBuildProgress(1, 'Menyiapkan pemrosesan lokal');
  appendTerminalLog('APK tetap berada di perangkat ini.', 'I');
  try {
    const output = await RVX_LOCAL_ENGINE.run({
      plan,
      apkFile,
      signal: controller.signal,
      job: createLocalPatchPayload(),
      onProgress(detail) {
        if (detail.artifact) {
          const total = Number(detail.artifactTotal || detail.total || 0);
          const received = Number(detail.artifactReceived || detail.received || 0);
          const percentage = total > 0 ? Math.min(35, Math.round((received / total) * 35)) : 3;
          setLocalBuildProgress(percentage, detail.artifact === 'engine' ? 'Menyiapkan mesin lokal' : 'Menyiapkan artefak source');
          return;
        }
        const stageLabels = {
          'validate-input': 'Memvalidasi APK',
          prepare: 'Menyiapkan file lokal',
          decode: 'Membaca DEX dan resource',
          apply: 'Menerapkan patch',
          rebuild: 'Membangun APK',
          sign: 'Menandatangani APK',
          verify: 'Memverifikasi hasil',
          save: 'Menyiapkan hasil'
        };
        setLocalBuildProgress(Math.max(36, Math.round(Number(detail.progress || 0) * 100)), stageLabels[detail.stage] || 'Memproses secara lokal');
      }
    });
    setLocalBuildProgress(100, 'APK selesai dan terverifikasi');
    const appAlias = STATE.currentApp?.alias || 'app';
    await rvxSaveBlob(output, `rvx-${appAlias}-${STATE.currentVersion}.apk`, 'application/vnd.android.package-archive');
    appendTerminalLog('Hasil patch berhasil disimpan pada perangkat.', 'S');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      appendTerminalLog(`Build browser dihentikan: ${error.message}`, 'E');
      setLocalBuildProgress(0, error.message);
    }
  } finally {
    if (STATE.browserPatchAbortController === controller) STATE.browserPatchAbortController = null;
  }
}

function setLocalBuildProgress(percent, label) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  setText('progressStatusSub', label);
  setText('progressPercentPill', `${safePercent}%`);
  const barFill = document.getElementById('progressBarFill');
  if (barFill) barFill.style.width = `${safePercent}%`;
}

function parseDownloadProgress(line) {
  if (!line.startsWith('DOWNLOAD_PROGRESS|')) return null;
  const [, label, receivedRaw, totalRaw] = line.split('|');
  const received = Number(receivedRaw || 0);
  const total = Number(totalRaw || 0);
  return { label, received, total };
}

async function triggerLocalPatch(payload = createLocalPatchPayload()) {
  const activeSourceObj = STATE.sources.find(s => s.id === STATE.currentSource);
  const packageName = STATE.currentApp?.packageName;
  if (!activeSourceObj?.bundleUrl || !packageName) return;

  if (STATE.uiMode === 'morphe') {
    switchScreen('progress');
  } else {
    STATE.tuiScreen = 'logs';
    renderTuiView();
  }

  const heroCard = document.getElementById('postPatchHeroCard');
  if (heroCard) heroCard.classList.add('hidden');
  setLocalBuildProgress(3, 'Memulai proses lokal');
  setText('telemetryCpuVal', '—');
  setText('telemetryIoVal', '—');
  setText('telemetryMemVal', '—');

  const appName = STATE.currentApp?.name || 'Aplikasi';
  appendTerminalLog(`Memulai patch ${appName} v${STATE.currentVersion}`, 'I');

  try {
    const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/start`, {
      method: 'POST',
      headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (STATE.eventSource) STATE.eventSource.close();
    const controller = new AbortController();
    STATE.eventSource = { close: () => controller.abort() };
    const streamResponse = await fetch(`${STATE.daemonUrl}/api/v1/patch/stream`, {
      headers: daemonAuthHeaders(), signal: controller.signal
    });
    if (!streamResponse.ok || !streamResponse.body) throw new Error(`Log stream HTTP ${streamResponse.status}`);
    consumePatchEventStream(streamResponse.body, line => {
      const download = parseDownloadProgress(line);
      if (download) {
        const ranges = { jre: [5, 18], cli: [18, 30], bundle: [30, 48] };
        const [start, end] = ranges[download.label] || [10, 45];
        const fraction = download.total > 0 ? download.received / download.total : 0;
        setLocalBuildProgress(start + ((end - start) * fraction), `Mengunduh ${download.label} · ${formatDownloadBytes(download.received)}${download.total > 0 ? ` / ${formatDownloadBytes(download.total)}` : ''}`);
        setText('telemetryIoVal', formatDownloadBytes(download.received));
        return;
      }
      if (line.startsWith('OUTPUT_FILE|')) {
        const [, path, sizeRaw] = line.split('|');
        const size = Number(sizeRaw || 0);
        setLocalBuildProgress(99, `Hasil ${formatDownloadBytes(size)} disimpan ke ${path}`);
        appendTerminalLog(`Hasil akhir: ${path} (${formatDownloadBytes(size)})`, 'I');
        if (window.RVXNativeBridge?.installApk && !STATE.isRoot) {
          setTimeout(() => {
            try { window.RVXNativeBridge.installApk(path); } catch (_) {}
          }, 600);
        }
        return;
      }
      const isOk = line.includes('completed successfully') || line.includes('succeeded');
      const isErr = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');

      appendTerminalLog(line, isErr ? '!' : (isOk ? 'I' : 'I'));

      if (line.includes('Checking Java')) setLocalBuildProgress(5, 'Memeriksa Java Runtime');
      else if (line.includes('Morphe CLI is ready')) setLocalBuildProgress(30, 'Mesin Morphe siap');
      else if (line.includes('Using cached patch bundle')) setLocalBuildProgress(48, 'Bundle patch diambil dari cache');
      else if (line.includes('Resolving patch bundle')) setLocalBuildProgress(32, 'Menyiapkan bundle patch');
      else if (line.includes('Stock APK')) setLocalBuildProgress(55, 'APK target siap');
      else if (line.includes('Executing Morphe CLI')) setLocalBuildProgress(62, 'Menerapkan patch');
      else if (line.includes('Output APK generated')) setLocalBuildProgress(96, 'Menyelesaikan APK hasil patch');

      if (line.includes('Patching process completed successfully')) {
        if (heroCard) heroCard.classList.remove('hidden');
        setLocalBuildProgress(100, 'Selesai');
        if (STATE.eventSource) STATE.eventSource.close();
      } else if (line.includes('Patching failed')) {
        setLocalBuildProgress(100, 'Proses dihentikan karena kesalahan');
        if (STATE.eventSource) STATE.eventSource.close();
      }
    }).catch(error => {
      if (error.name !== 'AbortError') appendTerminalLog(`Log stream terputus: ${error.message}`, '!');
    });
  } catch (err) {
    appendTerminalLog(`Failed to start patching: ${err.message}`, '!');
    setLocalBuildProgress(100, 'Gagal memulai proses');
  }
}

function daemonAuthHeaders(extra = {}) {
  const token = RVX_STORAGE.session.getItem('rvx_daemon_token') || '';
  return token ? { ...extra, 'X-RVX-Token': token } : extra;
}

async function consumePatchEventStream(stream, onLine) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    frames.forEach(frame => frame.split(/\r?\n/).filter(line => line.startsWith('data:')).forEach(line => onLine(line.slice(5).trimStart())));
    if (done) break;
  }
}

async function triggerCloudBuild() {
  if (!STATE.authToken) {
    document.getElementById('settingsModal')?.classList.remove('hidden');
    return;
  }

  const progressModal = document.getElementById('buildProgressModal');
  const statusMsg = document.getElementById('buildStatusMsg');
  const linksBox = document.getElementById('buildActionLinks');
  const runLink = document.getElementById('linkActionsRun');

  if (progressModal) progressModal.classList.remove('hidden');
  if (linksBox) linksBox.classList.add('hidden');
  if (statusMsg) statusMsg.textContent = 'Connecting to GitHub Actions runner...';

  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  try {
    const payload = {
      event_type: 'build-rvx',
      client_payload: {
        package_name: STATE.currentApp?.packageName || 'com.google.android.youtube',
        app_name: STATE.currentApp?.name || 'YouTube',
        target_version: STATE.currentVersion,
        youtube_version: STATE.currentVersion,
        patch_source: STATE.currentSource,
        patch_tag: STATE.patchTag || 'dev',
        arch: 'all',
        build_mode: 'test',
        included_patches: includedPatches,
        excluded_patches: excludedPatches,
        options: STATE.selectedOptions
      }
    };

    const res = await fetch('https://api.github.com/repos/Zy0x/YouTube-Revanced/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STATE.authToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 204 || res.ok) {
      if (statusMsg) statusMsg.textContent = `Build Dispatched for YouTube v${STATE.currentVersion}.`;
      if (linksBox) linksBox.classList.remove('hidden');
      if (runLink) runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Response code: ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) statusMsg.textContent = `Cloud Build Error: ${err.message}`;
  }
}

function appendTerminalLog(line, type = 'I') {
  STATE.logHistory.push({ type, text: line });

  const rawPre = document.getElementById('terminalLogs');
  if (rawPre) rawPre.textContent += `\n${line}`;

  const list = document.getElementById('morpheStructuredLogs');
  const feed = document.getElementById('terminalBody');
  if (list) {
    const row = document.createElement('div');
    row.className = 'morphe-log-row';
    const badgeClass = type === '!' ? 'log-badge-err' : 'log-badge-info';
    row.innerHTML = `
      <span class="log-badge ${badgeClass}">${escapeHtml(type)}</span>
      <span class="log-msg">${escapeHtml(line)}</span>
    `;
    list.appendChild(row);
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  if (STATE.uiMode === 'tui' && STATE.tuiScreen === 'logs') {
    renderTuiView();
  }
}

function renderReleaseNotesMarkdown(markdown) {
  const renderInline = (value) => {
    const tokens = [];
    let text = escapeHtml(value);

    // Keep links limited to absolute HTTP(S) URLs and escape their attributes.
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
      const token = `\u0000${tokens.length}\u0000`;
      tokens.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
      return token;
    });
    text = text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\u0000(\d+)\u0000/g, (match, index) => tokens[Number(index)] || '');
    return text;
  };

  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>${list.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    const bullet = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.+)$/);
    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join('') || '<p class="notes-empty">Rilis ini tidak menyertakan catatan changelog.</p>';
}

function showPatchNotesModal(specificTag) {
  const modal = document.getElementById('patchNotesModal');
  const content = document.getElementById('patchNotesContent');
  const title = document.getElementById('modalPatchNotesTitle');
  if (!modal || !content) return;

  const currentTag = (typeof specificTag === 'string' && specificTag) ? specificTag : (STATE.patchTag || 'dev');
  const releases = STATE.patchReleases || [];
  let foundRelease = null;

  if (currentTag === 'dev') {
    foundRelease = releases.find(r => r.prerelease && !r.draft);
  } else if (currentTag === 'latest') {
    foundRelease = releases.find(r => !r.prerelease && !r.draft);
  } else {
    foundRelease = releases.find(r => r.tag_name === currentTag);
  }

  if (foundRelease) {
    if (title) title.textContent = `Release Notes: ${foundRelease.name || foundRelease.tag_name}`;
    content.innerHTML = `<div class="notes-release-tag">${escapeHtml(foundRelease.tag_name)}</div>${renderReleaseNotesMarkdown(foundRelease.body)}`;
  } else {
    if (title) title.textContent = `Release Notes (${currentTag.toUpperCase()})`;
    content.innerHTML = `<p><strong>Active channel:</strong> ${escapeHtml(currentTag.toUpperCase())}<br><strong>Source:</strong> ${escapeHtml(getSourceDisplayName(STATE.currentSource))}</p>`;
  }

  modal.classList.remove('hidden');
}
