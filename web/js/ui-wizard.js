/**
 * YouTube RVX — Setup Wizard & Returning Dashboard Orchestrator
 * Version: 2.1.15
 */

let silentDevClicks = 0;
let silentDevTimer = null;
let wizardOverlayReturnFocus = null;
let otherVersionsSearchTimer = null;
let pendingExternalVersion = '';

function resetWizardSelections() {
  STATE.currentApp = null;
  STATE.currentSource = null;
  STATE.patchTag = '';
  STATE.selectedRelease = null;
  STATE.patchReleases = [];
  STATE.channelLoading = false;
  STATE.channelLoadToken += 1;
  STATE.currentVersion = '';
  resetBrowserPatchState();
  STATE.showAllVersions = false;
  STATE.sourceVersions = [];
  resetOtherVersionCatalog();
  STATE.targetMode = null;
  STATE.modeEditorExpanded = true;
  STATE.patches = [];
  STATE.allManifestPatches = [];
  STATE.selectedPatches.clear();
  STATE.selectedOptions = {};
  STATE.patchSearchQuery = '';
  STATE.patchListFilter = 'all';
}

function updateWizardNavigationState() {
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  const sourceReady = Boolean(
    source
    && STATE.currentApp
    && isSourceCompatibleWithApp(source.id, STATE.currentApp.packageName)
    && source.bundleStatus === 'ready'
    && !STATE.channelLoading
  );
  const states = [
    ['btnWizStep1Next', Boolean(STATE.currentApp), 'Pilih aplikasi terlebih dahulu'],
    ['btnWizStep2Next', sourceReady && Boolean(STATE.patchTag), STATE.channelLoading ? 'Sedang memverifikasi metadata source terpilih' : 'Pilih sumber dan saluran rilis terlebih dahulu'],
    ['btnWizStep3Next', Boolean(STATE.currentVersion), 'Pilih versi APK terlebih dahulu'],
    ['btnWizStep4Next', Boolean(STATE.targetMode) && STATE.selectedPatches.size > 0, 'Pilih mode dan minimal satu patch terlebih dahulu']
  ];
  states.forEach(([id, enabled, hint]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = !enabled;
    button.title = enabled ? '' : hint;
  });
}

function initWizardOrDashboard() {
  const wizardScreen = document.getElementById('screenWizard');
  const homeScreen = document.getElementById('screenHome');

  if (STATE.setupCompleted) {
    if (wizardScreen) wizardScreen.classList.remove('active');
    if (homeScreen) homeScreen.classList.add('active');
    renderAppCardsWithConfigStatus();
    switchScreen('home');
  } else {
    resetWizardSelections();
    goToWizardStep(1);
    switchScreen('wizard');
  }
}

function goToWizardStep(step) {
  if (step < 1 || step > 5) return;
  STATE.wizardStep = step;

  // Update Stepper Visuals
  const nodes = document.querySelectorAll('.wizard-step-node');
  nodes.forEach((node, idx) => {
    const nodeStep = idx + 1;
    node.classList.toggle('active', nodeStep === step);
    node.classList.toggle('completed', nodeStep < step);
    node.setAttribute('aria-current', nodeStep === step ? 'step' : 'false');
  });

  const progressLine = document.getElementById('wizardStepperProgress');
  if (progressLine) {
    const pct = ((step - 1) / 4) * 100;
    progressLine.style.width = `${pct}%`;
  }

  // M3 Minimalist Stepper Update
  const m3Bar = document.getElementById('wizardProgressBar');
  if (m3Bar) {
    m3Bar.style.width = `${step * 20}%`;
  }
  const stepCounter = document.getElementById('wizardStepCounter');
  if (stepCounter) {
    stepCounter.textContent = `${String(step).padStart(2, '0')}/05`;
  }
  const stepTitle = document.getElementById('wizardStepTitle');
  const refreshButton = document.getElementById('btnWizardStepRefresh');
  if (stepTitle) {
    const labels = ['Aplikasi', 'Sumber patch', 'Versi APK', 'Mode & fitur', 'Konfirmasi'];
    stepTitle.textContent = labels[step - 1];
    if (refreshButton) {
      refreshButton.setAttribute('aria-label', `Muat ulang metadata ${labels[step - 1].toLowerCase()}`);
      refreshButton.title = `Muat ulang metadata ${labels[step - 1].toLowerCase()}`;
    }
  }

  // Switch Active Step Pane
  for (let i = 1; i <= 5; i++) {
    const pane = document.getElementById(`wizardStep${i}`);
    if (pane) pane.classList.toggle('active', i === step);
  }

  // Render content for target step
  switch (step) {
    case 1:
      renderWizardAppStep();
      break;
    case 2:
      renderWizardSourceStep();
      break;
    case 3:
      renderWizardVersionStep();
      break;
    case 4:
      renderWizardModeAndPatchesStep();
      break;
    case 5:
      renderWizardBuildStep();
      break;
  }

  updateWizardNavigationState();
  updateWizardRefreshStatus();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateWizardRefreshStatus(message = '') {
  const status = document.getElementById('wizardRefreshStatus');
  if (!status) return;
  if (message) {
    status.textContent = message;
    status.dataset.short = message.startsWith('Memperbarui') ? 'Memuat' : message.startsWith('Gagal') ? 'Gagal' : '';
    return;
  }
  const entry = STATE.stepRefreshState[STATE.wizardStep];
  if (!entry?.updatedAt) {
    status.textContent = '';
    status.title = '';
    status.dataset.short = '';
    return;
  }
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(entry.updatedAt);
  status.textContent = `Diperbarui ${time}`;
  status.dataset.short = time;
  status.title = `Metadata terakhir diperbarui ${time}`;
}

function sourceHasSelectedTag(source, tag) {
  const releases = STATE.sourceReleases[source?.id] || [];
  if (tag === 'latest') return releases.some(item => !item.prerelease && !item.draft);
  if (tag === 'dev' || tag === 'prerelease') return releases.some(item => item.prerelease && !item.draft);
  return releases.some(item => (item.tag_name || item.name) === tag && !item.draft);
}

async function refreshWizardStep() {
  const step = STATE.wizardStep;
  const button = document.getElementById('btnWizardStepRefresh');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  updateWizardRefreshStatus('Memperbarui…');

  const snapshot = {
    source: STATE.currentSource,
    tag: STATE.patchTag,
    appPackage: STATE.currentApp?.packageName || '',
    version: STATE.currentVersion,
    external: STATE.selectedExternalVersion ? { ...STATE.selectedExternalVersion } : null,
    patches: new Set(STATE.selectedPatches),
    options: { ...STATE.selectedOptions },
    targetMode: STATE.targetMode,
    allManifestPatches: STATE.allManifestPatches,
    patchList: STATE.patches,
    sourceVersions: STATE.sourceVersions,
    availableVersions: STATE.availableVersions,
    otherVersions: STATE.otherVersions,
    otherVersionsTotal: STATE.otherVersionsTotal,
    otherVersionsNextOffset: STATE.otherVersionsNextOffset,
    otherVersionsQuery: STATE.otherVersionsQuery,
    otherVersionsChannel: STATE.otherVersionsChannel,
    releases: STATE.patchReleases
  };

  let ok = true;
  try {
    if (step === 1) {
      const results = await Promise.all([refreshRegistryCatalogNow(), refreshRegistryAppMetadata(true)]);
      ok = results.some(Boolean);
      STATE.availableApps = getAllSupportedApps();
      renderWizardAppStep();
    } else if (step === 2) {
      const source = STATE.sources.find(item => item.id === snapshot.source);
      if (!source) throw new Error('Source terpilih sudah tidak tersedia');
      await loadSourceReleaseList(source, true);
      STATE.patchReleases = (STATE.sourceReleases[source.id] || [])
        .filter(release => sourceReleaseBundleAsset(source, release));
      refreshSourceBundleAvailability(source, snapshot.tag || null);
      if (snapshot.tag && !sourceHasSelectedTag(source, snapshot.tag)) {
        STATE.patchTag = '';
        STATE.patches = [];
        STATE.allManifestPatches = [];
        STATE.sourceVersions = [];
        STATE.availableVersions = [];
        STATE.currentVersion = '';
        resetOtherVersionCatalog();
      } else if (snapshot.tag) {
        ok = await fetchAndRenderPatches(snapshot.source, true);
      }
      renderWizardSourceStep();
    } else {
      if (!snapshot.source || !snapshot.tag) throw new Error('Source atau rilis belum dipilih');
      ok = await fetchAndRenderPatches(snapshot.source, true);
      if (!ok) throw new Error('Metadata source aktif tidak dapat diperbarui');

      const sourceVersionStillValid = STATE.sourceVersions.some(item => item.version === snapshot.version);
      STATE.selectedExternalVersion = sourceVersionStillValid ? null : snapshot.external;
      STATE.currentVersion = sourceVersionStillValid || snapshot.external?.version === snapshot.version
        ? snapshot.version
        : '';

      if (step >= 4) {
        STATE.optionPreviewCache = {};
        STATE.forceOptionPreviewRefresh = true;
        const names = new Set(STATE.patches.map(patch => patch.name));
        STATE.selectedPatches = new Set([...snapshot.patches].filter(name => names.has(name)));
        const optionKeys = new Set(STATE.patches.flatMap(patch => (patch.options || []).map(option => option.key).filter(Boolean)));
        STATE.selectedOptions = Object.fromEntries(Object.entries(snapshot.options).filter(([key]) => optionKeys.has(key)));
        STATE.targetMode = snapshot.targetMode;
      }

      if (snapshot.otherVersions.length) {
        await fetchKnownAppVersions({
          offset: 0,
          q: snapshot.otherVersionsQuery,
          channel: snapshot.otherVersionsChannel,
          refresh: true
        });
      }
      if (step === 3) renderWizardVersionStep();
      if (step === 4) renderWizardModeAndPatchesStep();
      if (step === 5) {
        renderWizardBuildStep();
        const valid = Boolean(STATE.currentVersion && STATE.targetMode && STATE.selectedPatches.size);
        if (!valid) {
          updateWizardBuildValidation('Ada pilihan yang sudah tidak tersedia setelah pembaruan.');
          throw new Error('Ada pilihan yang sudah tidak tersedia. Kembali ke langkah terkait.');
        }
      }
    }
    if (!ok) throw new Error('Pembaruan gagal');
    STATE.stepRefreshState[step] = { updatedAt: Date.now(), ok: true };
    updateWizardRefreshStatus();
  } catch (error) {
    STATE.currentSource = snapshot.source;
    STATE.patchTag = snapshot.tag;
    STATE.allManifestPatches = snapshot.allManifestPatches;
    STATE.patches = snapshot.patchList;
    STATE.sourceVersions = snapshot.sourceVersions;
    STATE.availableVersions = snapshot.availableVersions;
    STATE.otherVersions = snapshot.otherVersions;
    STATE.otherVersionsTotal = snapshot.otherVersionsTotal;
    STATE.otherVersionsNextOffset = snapshot.otherVersionsNextOffset;
    STATE.otherVersionsQuery = snapshot.otherVersionsQuery;
    STATE.otherVersionsChannel = snapshot.otherVersionsChannel;
    STATE.patchReleases = snapshot.releases;
    STATE.currentVersion = snapshot.version;
    STATE.selectedExternalVersion = snapshot.external;
    STATE.selectedPatches = snapshot.patches;
    STATE.selectedOptions = snapshot.options;
    STATE.targetMode = snapshot.targetMode;
    STATE.stepRefreshState[step] = { updatedAt: Date.now(), ok: false, error: error.message };
    updateWizardRefreshStatus('Gagal diperbarui · data lama tetap dipakai');
    if (step === 2) renderWizardSourceStep();
    if (step === 3) renderWizardVersionStep();
    if (step === 4) renderWizardModeAndPatchesStep();
    if (step === 5) {
      renderWizardBuildStep();
      if (!STATE.currentVersion || !STATE.targetMode || STATE.selectedPatches.size === 0) {
        updateWizardBuildValidation(error.message);
      }
    }
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    updateWizardNavigationState();
  }
}



function renderWizardVersionStep() {
  const appNameEl = document.getElementById('wizardVersionAppName');
  if (appNameEl && STATE.currentApp) {
    appNameEl.textContent = STATE.currentApp.name || 'YouTube';
  }

  const container = document.getElementById('wizardVersionList');
  if (!container) return;
  container.innerHTML = '';

  const sourceVersions = (STATE.sourceVersions || STATE.availableVersions || [])
    .filter(item => Number(item.supportedPatchCount || 0) > 0);
  const totalVersions = sourceVersions.length;
  const totalPatches = STATE.patches.length;
  const summary = document.getElementById('wizardVersionCatalogSummary');
  const count = document.getElementById('wizardVersionCatalogCount');
  if (summary) {
    const sourceName = getSourceDisplayName(STATE.currentSource);
    const releases = STATE.patchReleases || [];
    const selectedRelease = STATE.patchTag === 'latest'
      ? releases.find(release => !release.prerelease && !release.draft)
      : STATE.patchTag === 'dev' || STATE.patchTag === 'prerelease'
        ? releases.find(release => release.prerelease && !release.draft)
        : releases.find(release => (release.tag_name || release.name) === STATE.patchTag);
    const releaseLabel = selectedRelease?.tag_name || selectedRelease?.name || STATE.patchTag;
    summary.textContent = `Metadata ${sourceName}${releaseLabel ? ` • ${releaseLabel}` : ''}`;
  }
  if (count) count.textContent = `${totalPatches} patch diperiksa`;

  const versions = sourceVersions;

  if (versions.length === 0) {
    container.innerHTML = `<div class="version-empty-state">${escapeHtml(getSourceDisplayName(STATE.currentSource))} tidak mencantumkan versi APK yang dapat diverifikasi untuk aplikasi ini.</div>`;
  }

  versions.forEach(item => {
    const ver = item.version;
    const displayVersion = /^v/i.test(ver) ? ver : `v${ver}`;
    const isSelected = ver === STATE.currentVersion;
    const supported = Number(item.supportedPatchCount || 0);
    const total = Number(item.totalPatchCount || totalPatches);
    const fullySupported = total > 0 && supported === total;
    const unsupported = supported === 0;
    const supportClass = fullySupported ? 'full' : unsupported ? 'none' : 'partial';
    const supportLabel = fullySupported ? 'Didukung penuh' : unsupported ? 'Tidak didukung' : 'Didukung sebagian';

    const row = document.createElement('div');
    row.className = `version-choice-row ${isSelected ? 'active' : ''} ${unsupported ? 'unsupported' : ''}`;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    row.setAttribute('aria-disabled', unsupported ? 'true' : 'false');
    row.setAttribute('tabindex', unsupported ? '-1' : '0');
    row.setAttribute('aria-label', `${displayVersion}, ${supportLabel}, ${supported} dari ${total} patch`);

    row.innerHTML = `
      <div class="version-choice-main">
        <span class="version-choice-radio" aria-hidden="true">${isSelected ? SVG_CHECK : ''}</span>
        <div class="version-choice-copy">
          <span class="version-choice-number">${escapeHtml(displayVersion)}</span>
          ${item.isRecommended ? '<span class="version-best-label">Direkomendasikan</span>' : ''}
        </div>
      </div>
      <div class="version-support-copy">
        <span class="version-support-badge ${supportClass}">${supportLabel}</span>
        <span class="version-support-count">${supported} dari ${total} patch</span>
      </div>
    `;

    const selectVersion = () => {
      if (unsupported) return;
      STATE.currentVersion = ver;
      STATE.selectedExternalVersion = null;
      renderWizardVersionStep();
      syncAllSummaries();
      updateWizardNavigationState();
    };
    row.addEventListener('click', selectVersion);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectVersion();
      }
    });

    container.appendChild(row);
  });

  const externalCard = document.getElementById('wizardExternalVersionCard');
  if (externalCard) {
    const external = STATE.selectedExternalVersion;
    externalCard.classList.toggle('hidden', !external);
    if (external) {
      const display = /^v/i.test(external.version) ? external.version : `v${external.version}`;
      externalCard.innerHTML = `
        <span class="external-version-mark" aria-hidden="true">!</span>
        <span class="external-version-copy"><strong>${escapeHtml(display)}</strong><small>Kompatibilitas belum terverifikasi</small></span>
        <span class="external-version-badge">Di luar rekomendasi source</span>
      `;
    }
  }

  const visibleCount = document.getElementById('wizardVersionVisibleCount');
  if (visibleCount) visibleCount.textContent = `${totalVersions} versi direkomendasikan source`;
  updateWizardNavigationState();
}

function renderOtherVersionsList() {
  const list = document.getElementById('otherVersionsList');
  const supportedList = document.getElementById('otherVersionsSupportedList');
  const supportedSection = document.getElementById('otherVersionsSupportedSection');
  const supportedCount = document.getElementById('otherVersionsSupportedCount');
  const status = document.getElementById('otherVersionsStatus');
  const loadMore = document.getElementById('btnLoadMoreVersions');
  if (!list || !supportedList || !status || !loadMore) return;
  list.innerHTML = '';
  supportedList.innerHTML = '';

  const query = String(STATE.otherVersionsQuery || '').toLowerCase();
  const channel = STATE.otherVersionsChannel || 'all';
  const sourceVersions = (STATE.sourceVersions || []).filter(item => {
    const isBeta = Boolean(item.isBeta);
    const channelMatches = channel === 'all' || (channel === 'beta' ? isBeta : !isBeta);
    return channelMatches && (!query || String(item.version || '').toLowerCase().includes(query));
  });
  supportedSection?.classList.toggle('hidden', sourceVersions.length === 0);
  if (supportedCount) supportedCount.textContent = `${sourceVersions.length} versi`;
  sourceVersions.forEach(item => {
    const version = String(item.version);
    const display = /^v/i.test(version) ? version : `v${version}`;
    const supported = Number(item.supportedPatchCount || 0);
    const total = Number(item.totalPatchCount || STATE.patches.length || 0);
    const full = total > 0 && supported === total;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `other-version-row verified-version-row ${STATE.currentVersion === version && !STATE.selectedExternalVersion ? 'active' : ''}`;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', String(STATE.currentVersion === version && !STATE.selectedExternalVersion));
    row.innerHTML = `
      <span class="other-version-main"><strong>${escapeHtml(display)}</strong><small>${supported} dari ${total} patch · ${item.isBeta ? 'Beta / pra-rilis' : 'Stabil'}</small></span>
      <span class="verified-version-badges">${item.isRecommended ? '<span class="version-best-label">Direkomendasikan</span>' : ''}<span class="version-support-badge ${full ? 'full' : 'partial'}">${full ? 'Didukung penuh' : 'Didukung sebagian'}</span></span>
      <span aria-hidden="true">›</span>`;
    row.addEventListener('click', () => {
      STATE.currentVersion = version;
      STATE.selectedExternalVersion = null;
      closeOtherVersionsModal();
      renderWizardVersionStep();
      syncAllSummaries();
    });
    supportedList.appendChild(row);
  });

  if (STATE.otherVersionsLoading && STATE.otherVersions.length === 0) {
    status.textContent = 'Memuat versi yang diketahui…';
  } else if (STATE.otherVersions.length === 0) {
    status.textContent = STATE.otherVersionsQuery
      ? 'Tidak ada versi yang cocok.'
      : 'Belum ada versi tambahan yang dapat dimuat.';
  } else {
    status.textContent = `${STATE.otherVersions.length} versi ditampilkan`;
  }

  STATE.otherVersions.forEach(item => {
    const version = String(item.version);
    const display = /^v/i.test(version) ? version : `v${version}`;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'other-version-row';
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', String(STATE.selectedExternalVersion?.version === version));
    const originLabel = item.origin === 'patch-registry' ? 'Registry patch' : item.origin === 'local-youtube-catalog' ? 'Katalog lokal' : 'Katalog versi';
    row.innerHTML = `
      <span class="other-version-main"><strong>${escapeHtml(display)}</strong><small>${item.isBeta ? 'Beta / pra-rilis' : 'Stabil'} · ${originLabel}</small></span>
      <span class="external-version-badge">Di luar rekomendasi source</span>
      <span aria-hidden="true">›</span>
    `;
    row.addEventListener('click', () => showExternalVersionWarning(version));
    list.appendChild(row);
  });

  loadMore.classList.toggle('hidden', STATE.otherVersionsNextOffset === null || STATE.otherVersions.length === 0);
  loadMore.disabled = STATE.otherVersionsLoading;
  loadMore.textContent = STATE.otherVersionsLoading ? 'Memuat…' : 'Muat berikutnya';
}

async function loadOtherVersions({ reset = false, refresh = false } = {}) {
  if (reset) {
    STATE.otherVersions = [];
    STATE.otherVersionsNextOffset = 0;
  }
  renderOtherVersionsList();
  const result = await fetchKnownAppVersions({
    offset: reset ? 0 : Number(STATE.otherVersionsNextOffset || 0),
    q: STATE.otherVersionsQuery,
    channel: STATE.otherVersionsChannel,
    refresh,
    append: !reset
  });
  renderOtherVersionsList();
  if (!result.ok) {
    const status = document.getElementById('otherVersionsStatus');
    if (status) status.textContent = `Katalog tidak dapat diperbarui. ${STATE.otherVersions.length ? 'Data terakhir tetap ditampilkan.' : result.error}`;
  }
}

function openOtherVersionsModal() {
  const modal = document.getElementById('modalOtherVersions');
  if (!modal || !STATE.currentApp) return;
  wizardOverlayReturnFocus = document.getElementById('btnOpenOtherVersions');
  const subtitle = document.getElementById('otherVersionsSubtitle');
  if (subtitle) subtitle.textContent = `${STATE.currentApp.name} · ${getSourceDisplayName(STATE.currentSource)} · dukungan source dipisahkan dari katalog tambahan.`;
  document.getElementById('externalVersionWarning')?.classList.add('hidden');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('otherVersionsTitle')?.focus());
  if (STATE.otherVersions.length === 0) loadOtherVersions({ reset: true });
  else renderOtherVersionsList();
}

function closeOtherVersionsModal() {
  document.getElementById('modalOtherVersions')?.classList.add('hidden');
  pendingExternalVersion = '';
  requestAnimationFrame(() => wizardOverlayReturnFocus?.focus());
}

function showExternalVersionWarning(version) {
  pendingExternalVersion = String(version || '').trim().replace(/^v/i, '');
  if (!pendingExternalVersion || !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(pendingExternalVersion)) return;
  const warning = document.getElementById('externalVersionWarning');
  const title = document.getElementById('externalVersionWarningTitle');
  if (title) title.textContent = `v${pendingExternalVersion} berada di luar rekomendasi source`;
  warning?.classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('btnConfirmExternalVersion')?.focus());
}

function confirmExternalVersionSelection() {
  if (!pendingExternalVersion) return;
  const known = STATE.otherVersions.find(item => String(item.version) === pendingExternalVersion);
  STATE.selectedExternalVersion = {
    version: pendingExternalVersion,
    origin: known?.origin || 'manual',
    isBeta: Boolean(known?.isBeta)
  };
  STATE.currentVersion = pendingExternalVersion;
  closeOtherVersionsModal();
  renderWizardVersionStep();
  syncAllSummaries();
}

function bindOtherVersionsEvents() {
  const modal = document.getElementById('modalOtherVersions');
  document.getElementById('btnOpenOtherVersions')?.addEventListener('click', openOtherVersionsModal);
  document.getElementById('btnCloseOtherVersions')?.addEventListener('click', closeOtherVersionsModal);
  modal?.addEventListener('click', event => {
    if (event.target === modal) closeOtherVersionsModal();
  });
  document.getElementById('inputOtherVersionSearch')?.addEventListener('input', event => {
    STATE.otherVersionsQuery = event.target.value.trim();
    clearTimeout(otherVersionsSearchTimer);
    otherVersionsSearchTimer = setTimeout(() => loadOtherVersions({ reset: true }), 250);
  });
  document.querySelectorAll('[data-other-version-filter]').forEach(button => {
    button.addEventListener('click', () => {
      STATE.otherVersionsChannel = button.dataset.otherVersionFilter || 'all';
      document.querySelectorAll('[data-other-version-filter]').forEach(other => {
        const active = other === button;
        other.classList.toggle('active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      loadOtherVersions({ reset: true });
    });
  });
  document.getElementById('btnLoadMoreVersions')?.addEventListener('click', () => loadOtherVersions());
  document.getElementById('btnUseManualVersion')?.addEventListener('click', () => {
    const input = document.getElementById('inputManualVersion');
    showExternalVersionWarning(input?.value || '');
  });
  document.getElementById('inputManualVersion')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      showExternalVersionWarning(event.currentTarget.value);
    }
  });
  document.getElementById('btnCancelExternalVersion')?.addEventListener('click', () => {
    pendingExternalVersion = '';
    document.getElementById('externalVersionWarning')?.classList.add('hidden');
  });
  document.getElementById('btnConfirmExternalVersion')?.addEventListener('click', confirmExternalVersionSelection);
}

/* ==========================================================================
   STEP 4: TARGET MODE & PATCH CURATION
   ========================================================================== */
function renderWizardModeAndPatchesStep() {
  const searchInput = document.getElementById('inputWizPatchSearch');
  if (searchInput) searchInput.value = STATE.patchSearchQuery || '';
  updateModeSwitcherUI();
  renderModeWorkspaceState();
  bindModeSwitcherEvents();

  // Tab switching between Patch Fitur (Source) and Mesin Morphe CLI
  const tabPatches = document.getElementById('tabCuratePatches');
  const tabEngine = document.getElementById('tabCurateEngine');
  if (tabPatches && tabEngine) {
    tabPatches.onclick = () => { if (typeof switchCurateTab === 'function') switchCurateTab('patches'); };
    tabEngine.onclick = () => { if (typeof switchCurateTab === 'function') switchCurateTab('engine'); };
    if (typeof switchCurateTab === 'function') switchCurateTab(STATE.wizardStep4ActiveTab || 'patches');
  }

  renderMorphePatchList('wizardPatchCategoriesContainer');
  updateWizardPatchStats();
  updateWizardNavigationState();
}

function bindModeSwitcherEvents() {
  const cardRoot = document.getElementById('modeCardRoot');
  const cardNonRoot = document.getElementById('modeCardNonRoot');
  if (cardRoot) cardRoot.onclick = () => setTargetMode('root');
  if (cardNonRoot) cardNonRoot.onclick = () => setTargetMode('non-root');
  [cardRoot, cardNonRoot].filter(Boolean).forEach(card => {
    card.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setTargetMode(card.id === 'modeCardRoot' ? 'root' : 'non-root');
    };
  });
  const compactSummary = document.getElementById('btnModeCompactSummary');
  if (compactSummary) compactSummary.onclick = () => {
    STATE.modeEditorExpanded = true;
    renderModeWorkspaceState();
    requestAnimationFrame(() => document.getElementById(STATE.targetMode === 'non-root' ? 'modeCardNonRoot' : 'modeCardRoot')?.focus());
  };
}

function renderModeWorkspaceState() {
  const step = document.getElementById('wizardStep4');
  const hasMode = STATE.targetMode === 'root' || STATE.targetMode === 'non-root';
  const collapsed = hasMode && !STATE.modeEditorExpanded;
  const isRoot = STATE.targetMode === 'root';
  step?.classList.toggle('mode-workspace-active', collapsed);

  const compact = document.getElementById('btnModeCompactSummary');
  compact?.classList.toggle('hidden', !collapsed);
  compact?.setAttribute('aria-expanded', String(!collapsed));

  const title = isRoot ? 'Root' : hasMode ? 'Non-root' : 'Belum dipilih';
  const subtitle = isRoot ? 'Magisk, KernelSU, APatch' : hasMode ? 'APK mandiri dengan GmsCore' : 'Pilih lingkungan perangkat';
  setText('modeCompactTitle', title);
  setText('modeCompactSubtitle', subtitle);
  const icon = compact?.querySelector('.mode-compact-icon');
  if (icon) icon.textContent = isRoot ? 'R' : hasMode ? 'N' : '·';
}

function updateModeSwitcherUI() {
  const isRoot = STATE.targetMode === 'root';
  const isNonRoot = STATE.targetMode === 'non-root';
  const cardRoot = document.getElementById('modeCardRoot');
  const cardNonRoot = document.getElementById('modeCardNonRoot');

  if (cardRoot && cardNonRoot) {
    cardRoot.classList.toggle('active', isRoot);
    cardNonRoot.classList.toggle('active', isNonRoot);
    cardRoot.setAttribute('aria-checked', isRoot ? 'true' : 'false');
    cardNonRoot.setAttribute('aria-checked', isNonRoot ? 'true' : 'false');

    const status = document.getElementById('wizardModeStatus');
    if (status) {
      status.textContent = isRoot ? 'Root dipilih' : isNonRoot ? 'Non-root dipilih' : 'Belum dipilih';
      status.classList.toggle('is-ready', isRoot || isNonRoot);
    }
  }
}

function setTargetMode(mode) {
  STATE.targetMode = mode === 'non-root' ? 'non-root' : 'root';
  STATE.modeEditorExpanded = false;
  RVX_STORAGE.local.setItem('rvx_target_mode', STATE.targetMode);
  updateModeSwitcherUI();
  renderModeWorkspaceState();

  renderMorphePatchList('wizardPatchCategoriesContainer');
  syncAllSummaries();
  updateWizardPatchStats();
  updateWizardNavigationState();
}

function updateWizardPatchStats(visibleCount = null) {
  const patchNames = new Set(STATE.patches.map(patch => patch.name));
  const selectedCount = [...STATE.selectedPatches].filter(name => patchNames.has(name)).length;
  const totalCount = STATE.patches.length;
  const selectedEl = document.getElementById('wizardSelectedPatchCount');
  const tabBadgeEl = document.getElementById('tabBadgePatchCount');
  const totalEl = document.getElementById('wizardTotalPatchCount');
  const visibleEl = document.getElementById('wizardVisiblePatchCount');
  if (selectedEl) selectedEl.textContent = String(selectedCount);
  if (tabBadgeEl) tabBadgeEl.textContent = String(selectedCount);
  if (totalEl) totalEl.textContent = String(totalCount);
  if (visibleEl) {
    const shown = visibleCount === null
      ? document.querySelectorAll('#wizardPatchCategoriesContainer .wizard-patch-row').length
      : visibleCount;
    visibleEl.textContent = `${shown} ditampilkan`;
  }

  document.querySelectorAll('[data-patch-filter]').forEach(button => {
    const active = button.dataset.patchFilter === (STATE.patchListFilter || 'all');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const next = document.getElementById('btnWizStep4Next');
  if (next) {
    next.textContent = selectedCount > 0 ? `Lanjut · ${selectedCount} patch ›` : 'Pilih patch untuk lanjut';
  }
}

function adjustMicrogForMode(mode) {
  const microgPatchNames = ['gmscore-support', 'microg-support', 'GmsCore Support', 'MicroG Support'];
  const foundPatch = STATE.patches.find(p =>
    microgPatchNames.some(m => p.name.toLowerCase().includes('microg') || p.name.toLowerCase().includes('gmscore'))
  );

  if (!foundPatch) return;

  if (mode === 'root') {
    // Mode Root: disable MicroG
    STATE.selectedPatches.delete(foundPatch.name);
  } else {
    // Mode Non-Root: enable MicroG
    STATE.selectedPatches.add(foundPatch.name);
  }
}

function checkMicrogSmartWarning(patchName, newCheckedState) {
  const isMicrog = patchName.toLowerCase().includes('microg') || patchName.toLowerCase().includes('gmscore');
  if (!isMicrog) return;

  const modal = document.getElementById('smartMicrogModal');
  const title = document.getElementById('microgModalTitle');
  const msg = document.getElementById('microgModalMsg');
  const btnFix = document.getElementById('btnMicrogAutoFix');
  const btnIgnore = document.getElementById('btnMicrogIgnore');

  if (!modal) return;

  if (STATE.targetMode === 'root' && newCheckedState === true) {
    if (title) title.textContent = 'Peringatan: Mode Root Terpilih';
    if (msg) msg.textContent = 'Anda sedang menggunakan Mode Root. Patch GmsCore/MicroG biasanya tidak diperlukan untuk perangkat Root dan dapat menyebabkan konflik atau crash. Ingin perbaiki otomatis (uncheck)?';
    if (btnFix) {
      btnFix.textContent = 'Perbaiki Otomatis (Uncheck)';
      btnFix.onclick = () => {
        STATE.selectedPatches.delete(patchName);
        renderMorphePatchList(STATE.wizardStep === 4 ? 'wizardPatchCategoriesContainer' : 'patchCategoriesContainer');
        modal.classList.add('hidden');
      };
    }
    if (btnIgnore) {
      btnIgnore.onclick = () => modal.classList.add('hidden');
    }
    modal.classList.remove('hidden');
  } else if (STATE.targetMode === 'non-root' && newCheckedState === false) {
    if (title) title.textContent = 'Peringatan: Mode Non-Root Terpilih';
    if (msg) msg.textContent = 'Anda berada di Mode Non-Root. Tanpa patch GmsCore/MicroG, aplikasi tidak akan bisa login ke Akun Google pada perangkat tanpa root. Ingin centang otomatis kembali?';
    if (btnFix) {
      btnFix.textContent = 'Centang Otomatis (Check)';
      btnFix.onclick = () => {
        STATE.selectedPatches.add(patchName);
        renderMorphePatchList(STATE.wizardStep === 4 ? 'wizardPatchCategoriesContainer' : 'patchCategoriesContainer');
        modal.classList.add('hidden');
      };
    }
    if (btnIgnore) {
      btnIgnore.onclick = () => modal.classList.add('hidden');
    }
    modal.classList.remove('hidden');
  }
}

/* ==========================================================================
   STEP 5: BUILD & FINISH EXECUTION
   ========================================================================== */
function renderWizardBuildStep() {
  setText('summaryAppName', STATE.currentApp?.name || '—');
  setText('summaryVersion', STATE.currentVersion ? `v${STATE.currentVersion}` : '—');
  setText('summarySource', getSourceDisplayName(STATE.currentSource));
  setText('summaryMode', STATE.targetMode === 'root'
    ? 'Mode Root (Magisk/KSU/APatch)'
    : STATE.targetMode === 'non-root' ? 'Mode Non-Root (Standalone APK)' : '—');
  setText('summaryPatchesCount', `${STATE.selectedPatches.size} aktif`);
  if (typeof getMorpheEngineSummaryText === 'function') {
    setText('summaryEngineConfig', getMorpheEngineSummaryText());
  }

  // Adapt completion buttons
  const btnRoot = document.getElementById('btnWizardRootInstall');
  if (btnRoot) {
    btnRoot.classList.toggle('hidden', STATE.targetMode !== 'root');
  }
  updateWizardBuildValidation();
}

function updateWizardBuildValidation(message = '') {
  const notice = document.getElementById('wizardValidationNotice');
  const buildButton = document.getElementById('btnWizardStartBuild');
  const missingVersion = !STATE.currentVersion;
  const missingPatchSetup = !STATE.targetMode || STATE.selectedPatches.size === 0;
  const valid = Boolean(STATE.currentApp && STATE.currentSource && STATE.patchTag && !missingVersion && !missingPatchSetup);
  if (buildButton) {
    buildButton.disabled = !valid;
    buildButton.title = valid ? '' : 'Perbaiki pilihan yang sudah tidak tersedia.';
  }
  if (!notice) return valid;
  notice.classList.toggle('hidden', valid && !message);
  if (!valid || message) {
    const targetStep = missingVersion ? 3 : missingPatchSetup ? 4 : 2;
    const label = targetStep === 3 ? 'Periksa versi APK' : targetStep === 4 ? 'Periksa mode & patch' : 'Periksa sumber patch';
    notice.innerHTML = `<span>${escapeHtml(message || 'Sebagian konfigurasi perlu diperiksa kembali.')}</span><button type="button">${label}</button>`;
    notice.querySelector('button')?.addEventListener('click', () => goToWizardStep(targetStep));
  }
  return valid;
}

function completeWizardAndEnterDashboard() {
  const pkg = STATE.currentApp?.packageName;
  if (!pkg || !STATE.currentSource || !STATE.patchTag || !STATE.currentVersion || !STATE.targetMode) return;
  saveAppConfig(pkg, {
    appName: STATE.currentApp?.name || 'YouTube',
    targetVersion: STATE.currentVersion,
    source: STATE.currentSource,
    patchTag: STATE.patchTag,
    mode: STATE.targetMode,
    selectedPatches: Array.from(STATE.selectedPatches),
    selectedOptions: STATE.selectedOptions
  });

  STATE.setupCompleted = true;
  RVX_STORAGE.local.setItem('rvx_setup_completed', 'true');

  initWizardOrDashboard();
}
