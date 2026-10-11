/**
 * YouTube RVX — Morphe UI Renderers & Pipeline
 * Version: 2.1.10
 */

function renderAppCards() {
  const container = document.getElementById('homeAppsGrid');
  if (!container) return;
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

  STATE.sources.forEach(s => {
    const isActive = s.id === STATE.currentSource;
    const shortTitle = getSourceDisplayName(s.id);
    const repo = s.repository || `${s.id}/patches`;

    const card = document.createElement('div');
    card.className = `source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.innerHTML = `
      <div class="source-card-header">
        <span>${escapeHtml(shortTitle)}</span>
        <span class="source-card-check">${isActive ? '✓' : ''}</span>
      </div>
      <div class="source-card-repo">${escapeHtml(repo)}</div>
    `;

    card.addEventListener('click', async () => {
      await selectPatchSource(s.id);
    });

    container.appendChild(card);
  });

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const repoLink = document.getElementById('linkSourceRepo');
  if (repoLink && activeSrc && activeSrc.repository) {
    repoLink.href = `https://github.com/${activeSrc.repository}`;
  }
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

      const rightHtml = item.isRecommended
        ? `<span class="ver-pill-rec">${SVG_THUMB}<span>Recommended</span></span>`
        : '';

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
      if (STATE.selectedPatches.has(patch.name)) {
        STATE.selectedPatches.delete(patch.name);
        card.classList.remove('selected');
      } else {
        STATE.selectedPatches.add(patch.name);
        card.classList.add('selected');
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

  const payload = {
    package_name: STATE.currentApp?.packageName || 'com.google.android.youtube',
    target_version: STATE.currentVersion,
    patch_source: STATE.currentSource,
    patch_tag: STATE.patchTag,
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
