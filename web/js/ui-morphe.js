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

    card.innerHTML = `
      <div class="yt-card-icon" style="background:${app.accentColor || '#B42323'};" aria-hidden="true">
        ${app.iconSvg}
      </div>
      <div class="yt-card-text">
        <h2 class="yt-card-title">${escapeHtml(app.name)}</h2>
        <p class="yt-card-sub">v${escapeHtml(app.recommendedVersion)} • ${app.patchCount} patches available</p>
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
    localStorage.setItem('rvx_pre_release_patches', String(STATE.preReleasePatches));
    await loadPatchReleases(activeSrc);
    renderActiveSourceDetails();
  });

  container.querySelector('#toggleExperimentalAppVersions')?.addEventListener('change', (e) => {
    STATE.experimentalAppVersions = e.target.checked;
    STATE.showAllVersions = e.target.checked;
    localStorage.setItem('rvx_experimental_app_versions', String(STATE.experimentalAppVersions));
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

function renderMorphePatchList() {
  const container = document.getElementById('patchCategoriesContainer');
  if (!container) return;
  container.innerHTML = '';

  const query = (STATE.patchSearchQuery || '').toLowerCase().trim();
  const enabledOnly = STATE.filterEnabledOnly;

  const filtered = STATE.patches.filter(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    if (enabledOnly && !isSelected) return false;
    if (query) {
      const n = (patch.name || '').toLowerCase();
      const d = (patch.description || '').toLowerCase();
      if (!n.includes(query) && !d.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="morphe-alert">No matching patches.</div>';
    return;
  }

  filtered.forEach(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    const hasOptions = Array.isArray(patch.options) && patch.options.length > 0;

    const card = document.createElement('div');
    card.className = `patch-item ${isSelected ? 'selected' : ''}`;
    card.dataset.patchName = patch.name;

    card.innerHTML = `
      <div class="morphe-circle-check" aria-hidden="true">${SVG_CHECK}</div>
      <div class="patch-info">
        <div class="patch-title">${escapeHtml(patch.name)}</div>
        <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
      </div>
      ${hasOptions ? `<button type="button" class="morphe-patch-gear-btn" title="Configure ${escapeHtml(patch.name)}" aria-label="Configure ${escapeHtml(patch.name)}">${SVG_GEAR}</button>` : ''}
    `;

    card.addEventListener('click', (e) => {
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
      syncAllSummaries();
    });

    container.appendChild(card);
  });
}

function openPatchOptionsModal(patch) {
  const modal = document.getElementById('patchOptionsModal');
  const titleEl = document.getElementById('modalPatchOptsTitle');
  const descEl = document.getElementById('modalPatchOptsDesc');
  const bodyEl = document.getElementById('modalPatchOptsBody');
  if (!modal || !bodyEl) return;

  STATE.editingPatchName = patch.name;
  if (titleEl) titleEl.textContent = patch.name;
  if (descEl) descEl.textContent = patch.description || '';
  bodyEl.innerHTML = '';

  const options = Array.isArray(patch.options) ? patch.options : [];
  options.forEach(opt => {
    const key = opt.key;
    const title = opt.title || key;
    const rawDef = opt.default;
    const currentVal = STATE.selectedOptions[key] !== undefined ? STATE.selectedOptions[key] : rawDef;
    const optType = (opt.type || '').toLowerCase();

    const optCard = document.createElement('div');
    optCard.className = 'morphe-opt-card';

    let controlHtml = '';
    if (optType === 'boolean' || typeof rawDef === 'boolean') {
      const isChecked = currentVal === true || currentVal === 'true';
      controlHtml = `
        <select class="morphe-select modal-opt-input" data-opt-key="${escapeHtml(key)}" data-opt-type="boolean">
          <option value="true" ${isChecked ? 'selected' : ''}>Enabled</option>
          <option value="false" ${!isChecked ? 'selected' : ''}>Disabled</option>
        </select>
      `;
    } else if (Array.isArray(opt.possibleValues) && opt.possibleValues.length > 0) {
      controlHtml = `<select class="morphe-select modal-opt-input" data-opt-key="${escapeHtml(key)}">`;
      opt.possibleValues.forEach(val => {
        const sel = String(val) === String(currentVal ?? '') ? 'selected' : '';
        controlHtml += `<option value="${escapeHtml(String(val))}" ${sel}>${escapeHtml(String(val))}</option>`;
      });
      controlHtml += `</select>`;
    } else {
      controlHtml = `<input type="text" class="morphe-input modal-opt-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(String(currentVal ?? ''))}">`;
    }

    optCard.innerHTML = `
      <div class="morphe-opt-header">
        <span class="morphe-opt-title">${escapeHtml(title)}</span>
        <span class="morphe-opt-key">${escapeHtml(key)}</span>
      </div>
      ${opt.description ? `<p class="morphe-muted-hint">${escapeHtml(opt.description)}</p>` : ''}
      ${controlHtml}
    `;

    bodyEl.appendChild(optCard);
  });

  modal.classList.remove('hidden');
}

function savePatchOptionsModal() {
  const bodyEl = document.getElementById('modalPatchOptsBody');
  const modal = document.getElementById('patchOptionsModal');
  if (bodyEl) {
    bodyEl.querySelectorAll('.modal-opt-input').forEach(input => {
      const key = input.dataset.optKey;
      if (input.dataset.optType === 'boolean') {
        STATE.selectedOptions[key] = input.value === 'true';
      } else {
        STATE.selectedOptions[key] = input.value;
      }
    });
  }
  if (modal) modal.classList.add('hidden');
  if (STATE.uiMode === 'tui') renderTuiView();
}

function resetPatchOptionsModal() {
  const patch = STATE.patches.find(p => p.name === STATE.editingPatchName);
  if (!patch || !Array.isArray(patch.options)) return;
  patch.options.forEach(opt => {
    if (opt.key) STATE.selectedOptions[opt.key] = opt.default;
  });
  openPatchOptionsModal(patch);
}

function syncAllSummaries() {
  const total = STATE.patches.length || 0;
  const active = STATE.selectedPatches.size;
  const ver = STATE.currentVersion || 'latest';
  const srcName = getSourceDisplayName(STATE.currentSource);
  const appName = STATE.currentApp?.name || 'YouTube';
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

  setText('infoTargetVersion', `v${ver}`);
  setText('infoActiveSource', `${srcName} (${STATE.patchTag})`);
  setText('infoActivePatches', `${active} / ${total}`);
  setText(
    'infoEngineStatus',
    STATE.engineMode === 'local'
      ? `On-Device Daemon (v${STATE.daemonVersion})`
      : 'GitHub Actions Cloud'
  );

  setText('tuiDialogSubtitle', `${appName} v${ver} • ${srcName} (${active}/${total})`);
}

function triggerBuildPipeline() {
  if (STATE.engineMode === 'local') {
    triggerLocalPatch();
  } else {
    triggerCloudBuild();
  }
}

async function triggerLocalPatch() {
  if (STATE.uiMode === 'morphe') {
    switchScreen('progress');
  } else {
    STATE.tuiScreen = 'logs';
    renderTuiView();
  }

  const heroCard = document.getElementById('postPatchHeroCard');
  const subText = document.getElementById('progressStatusSub');
  const pctPill = document.getElementById('progressPercentPill');
  const barFill = document.getElementById('progressBarFill');

  if (heroCard) heroCard.classList.add('hidden');
  if (subText) subText.textContent = 'Applying patches';
  if (pctPill) pctPill.textContent = '15%';
  if (barFill) barFill.style.width = '15%';

  setText('telemetryCpuVal', '41%');
  setText('telemetryIoVal', '240 KB/s');

  const appName = STATE.currentApp?.name || 'YouTube';
  appendTerminalLog(`Starting patcher for ${appName} v${STATE.currentVersion}`, 'I');

  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  const activeSourceObj = STATE.sources.find(s => s.id === STATE.currentSource);
  const payload = {
    package_name: STATE.currentApp?.packageName || 'com.google.android.youtube',
    target_version: STATE.currentVersion,
    patch_source: activeSourceObj?.repository || STATE.currentSource,
    patch_tag: STATE.patchTag,
    patch_bundle_url: activeSourceObj?.bundleUrl || null,
    manifest_url: activeSourceObj?.manifestUrl || null,
    is_root: true,
    included_patches: includedPatches,
    excluded_patches: excludedPatches,
    options: STATE.selectedOptions
  };

  try {
    const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (STATE.eventSource) STATE.eventSource.close();
    let stepPct = 22;

    STATE.eventSource = new EventSource(`${STATE.daemonUrl}/api/v1/patch/stream`);
    STATE.eventSource.onmessage = (event) => {
      const line = event.data || '';
      const isOk = line.includes('completed successfully') || line.includes('succeeded');
      const isErr = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');

      appendTerminalLog(line, isErr ? '!' : (isOk ? 'I' : 'I'));

      stepPct = Math.min(96, stepPct + 8);
      if (pctPill) pctPill.textContent = `${stepPct}%`;
      if (barFill) barFill.style.width = `${stepPct}%`;

      if (line.includes('Patching process completed successfully')) {
        if (heroCard) heroCard.classList.remove('hidden');
        if (subText) subText.textContent = 'All done!';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '6%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      } else if (line.includes('Patching failed')) {
        if (subText) subText.textContent = 'Patching halted';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '4%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      }
    };
  } catch (err) {
    appendTerminalLog(`Failed to start patching: ${err.message}`, '!');
    if (subText) subText.textContent = 'Error';
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

function showPatchNotesModal() {
  const modal = document.getElementById('patchNotesModal');
  const content = document.getElementById('patchNotesContent');
  const title = document.getElementById('modalPatchNotesTitle');
  if (!modal || !content) return;

  const currentTag = STATE.patchTag || 'dev';
  const releases = STATE.patchReleases || [];
  let foundRelease = null;

  if (currentTag === 'dev') {
    foundRelease = releases.find(r => r.prerelease) || releases[0];
  } else if (currentTag === 'latest') {
    foundRelease = releases.find(r => !r.prerelease) || releases[0];
  } else {
    foundRelease = releases.find(r => r.tag_name === currentTag);
  }

  if (foundRelease) {
    if (title) title.textContent = `Release Notes: ${foundRelease.name || foundRelease.tag_name}`;
    content.textContent = `Tag: ${foundRelease.tag_name}\n\n${foundRelease.body || 'No release notes provided.'}`;
  } else {
    if (title) title.textContent = `Release Notes (${currentTag.toUpperCase()})`;
    content.textContent = `Active Channel: ${currentTag.toUpperCase()}\nSource: ${getSourceDisplayName(STATE.currentSource)}`;
  }

  modal.classList.remove('hidden');
}
