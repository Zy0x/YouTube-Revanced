/**
 * YouTube RVX — Application Bootstrap & Event Orchestrator
 * Version: 2.1.15
 */

document.addEventListener('DOMContentLoaded', async () => {
  initSecurity();
  initViewportTracker();
  initEventListeners();
  initKeyboardNavigation();
  setUiMode(STATE.uiMode);
  document.getElementById('btnDownloadSingleHtml')?.classList.toggle('hidden', Boolean(window.RVX_RUNTIME?.isSingleFile));

  // Runtime detection never probes localhost from hosted or standalone builds.
  // Root WebUI verifies only its own origin.
  await Promise.all([
    checkDaemonStatus(),
    loadSourcesAndPresets()
  ]);
  // A new setup starts blank. Saved values are restored only when the user
  // explicitly opens an existing app configuration from the dashboard.
  syncAllSummaries();

  // Initialize Wizard or Dashboard based on setup status
  if (typeof initWizardOrDashboard === 'function') {
    initWizardOrDashboard();
  }

  registerServiceWorker();
  // Device inspection is useful but must never delay the first interactive UI.
  setTimeout(() => { fetchInstalledAppInfo(); }, 0);
});

function setUiMode(mode) {
  STATE.uiMode = mode === 'tui' ? 'tui' : 'morphe';
  RVX_STORAGE.local.setItem('rvx_ui_mode', STATE.uiMode);

  const isTui = STATE.uiMode === 'tui';
  document.body.classList.toggle('mode-tui', isTui);
  document.body.classList.toggle('mode-morphe', !isTui);

  const morpheApp = document.getElementById('morpheAppContainer');
  const tuiApp = document.getElementById('tuiAppContainer');

  if (morpheApp) morpheApp.classList.toggle('hidden', isTui);
  if (tuiApp) tuiApp.classList.toggle('hidden', !isTui);

  const btnMorphe = document.getElementById('btnSettingModeMorphe');
  const btnTui = document.getElementById('btnSettingModeTui');
  if (btnMorphe) btnMorphe.classList.toggle('active', !isTui);
  if (btnTui) btnTui.classList.toggle('active', isTui);

  if (isTui) {
    renderTuiView();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function switchScreen(screenId) {
  STATE.activeScreen = screenId;
  const screenMap = {
    home: 'screenHome',
    version: 'screenVersion',
    patches: 'screenPatches',
    progress: 'screenProgress',
    wizard: 'screenWizard'
  };
  Object.entries(screenMap).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el) el.classList.toggle('active', key === screenId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initViewportTracker() {
  const updateMetrics = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w > h && h <= 500 && window.scrollY > 0) {
      window.scrollTo(0, 0);
    }
    const dpr = (window.devicePixelRatio || 1).toFixed(2);
    const orientation = w > h ? 'Landscape' : 'Portrait';
    const textEl = document.getElementById('viewportResolutionText');
    if (textEl) {
      textEl.textContent = `${w} × ${h} px • DPR ${dpr} • ${orientation}`;
    }
  };

  window.addEventListener('resize', updateMetrics);
  window.addEventListener('orientationchange', updateMetrics);
  updateMetrics();
}

function initEventListeners() {
  const closePatchBulkMenu = () => {
    document.getElementById('patchBulkMenu')?.classList.add('hidden');
    document.getElementById('btnPatchBulkMenu')?.setAttribute('aria-expanded', 'false');
  };
  // Dual-UI Mode Switcher
  document.getElementById('btnToggleUiMode')?.addEventListener('click', () => {
    setUiMode(STATE.uiMode === 'morphe' ? 'tui' : 'morphe');
  });
  document.getElementById('btnSettingModeMorphe')?.addEventListener('click', () => setUiMode('morphe'));
  document.getElementById('btnSettingModeTui')?.addEventListener('click', () => setUiMode('tui'));

  // Info (i) Modal
  const openInfo = () => {
    syncAllSummaries();
    document.getElementById('infoModal')?.classList.remove('hidden');
    loadDaemonSessionInfo();
  };
  document.getElementById('btnOpenInfoModal')?.addEventListener('click', openInfo);
  document.getElementById('btnVersionInfo')?.addEventListener('click', openInfo);
  document.getElementById('btnProgressInfo')?.addEventListener('click', openInfo);
  document.getElementById('btnCloseInfoModal')?.addEventListener('click', () => {
    document.getElementById('infoModal')?.classList.add('hidden');
  });
  document.getElementById('btnDoneInfoModal')?.addEventListener('click', () => {
    document.getElementById('infoModal')?.classList.add('hidden');
  });
  document.getElementById('btnRetryLocalRuntime')?.addEventListener('click', async () => {
    await checkDaemonStatus();
    openDownloadConsentModal();
  });
  document.getElementById('btnInfoJumpPatches')?.addEventListener('click', () => {
    document.getElementById('infoModal')?.classList.add('hidden');
    switchScreen('patches');
  });
  document.getElementById('btnInfoJumpLogs')?.addEventListener('click', () => {
    document.getElementById('infoModal')?.classList.add('hidden');
    switchScreen('progress');
  });

  // TUI Footer Buttons
  document.getElementById('btnTuiPrimary')?.addEventListener('click', () => {
    const activeRow = document.querySelector('#tuiDialogBody .tui-menu-row.tui-row-active') || document.querySelector('#tuiDialogBody .tui-menu-row');
    activeRow?.click();
  });
  document.getElementById('btnTuiBack')?.addEventListener('click', () => {
    STATE.tuiScreen = 'main';
    STATE.tuiSelectedIndex = 0;
    renderTuiView();
  });
  document.getElementById('btnTuiExitToGui')?.addEventListener('click', () => setUiMode('morphe'));

  // Screen 1: Home Card -> Version Screen
  document.getElementById('cardHomeYouTube')?.addEventListener('click', () => {
    switchScreen('version');
  });

  // Home Bottom Dock ([ Sources ] & [ Settings ])
  document.getElementById('btnOpenSourcesModal')?.addEventListener('click', () => {
    renderSourceCards();
    document.getElementById('sourcesModal')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseSourcesModal')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
  });
  document.getElementById('btnDoneSourcesModal')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
  });

  // Sources Sheet: Add Custom Source & Reset
  document.getElementById('btnOpenAddSourceForm')?.addEventListener('click', () => {
    const form = document.getElementById('addSourceFormContainer');
    form?.classList.toggle('hidden');
    if (form && !form.classList.contains('hidden')) {
      document.getElementById('inputCustomSourceName')?.focus();
    }
  });
  document.getElementById('btnCancelAddSource')?.addEventListener('click', () => {
    document.getElementById('addSourceFormContainer')?.classList.add('hidden');
  });

  document.getElementById('btnSaveCustomSource')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('inputCustomSourceName');
    const repoInput = document.getElementById('inputCustomSourceRepo');
    const channelSelect = document.getElementById('selectCustomSourceChannel');

    const name = nameInput?.value.trim();
    const repoOrUrl = repoInput?.value.trim();
    const channel = channelSelect?.value || 'latest';

    if (!repoOrUrl) {
      alert('Please enter a GitHub repository (e.g. user/repo) or a valid manifest URL.');
      repoInput?.focus();
      return;
    }

    const newSource = addCustomSource({
      name: name || repoOrUrl,
      repository: repoOrUrl,
      defaultReleaseType: channel
    });

    if (newSource) {
      document.getElementById('addSourceFormContainer')?.classList.add('hidden');
      if (nameInput) nameInput.value = '';
      if (repoInput) repoInput.value = '';
      renderSourceCards();
      await selectPatchSource(newSource.id);
    }
  });

  document.getElementById('btnResetSourcesDefault')?.addEventListener('click', async () => {
    if (confirm('Reset all patch sources back to default factory settings?')) {
      resetSourcesToDefault();
      renderSourceCards();
      await selectPatchSource('anddea');
    }
  });

  document.getElementById('btnOpenSettingsModal')?.addEventListener('click', () => {
    const tokenInput = document.getElementById('inputGithubToken');
    if (tokenInput) tokenInput.value = STATE.authToken;
    document.getElementById('settingsModal')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseSettingsModal')?.addEventListener('click', () => {
    document.getElementById('settingsModal')?.classList.add('hidden');
  });
  document.getElementById('btnDoneSettingsModal')?.addEventListener('click', () => {
    document.getElementById('settingsModal')?.classList.add('hidden');
  });

  // Screen 2: Version Picker Actions
  document.getElementById('btnVersionBackHome')?.addEventListener('click', () => switchScreen('home'));
  document.getElementById('btnToggleVersionSearch')?.addEventListener('click', () => {
    const drawer = document.getElementById('versionSearchDrawer');
    if (drawer) {
      drawer.classList.toggle('hidden');
      if (!drawer.classList.contains('hidden')) {
        document.getElementById('inputSearchVersion')?.focus();
      }
    }
  });
  document.getElementById('btnVersionToPatches')?.addEventListener('click', () => switchScreen('patches'));
  document.getElementById('btnVersionQuickPatch')?.addEventListener('click', () => triggerBuildPipeline());

  document.getElementById('inputSearchVersion')?.addEventListener('input', (e) => {
    STATE.versionSearch = e.target.value.trim();
    renderVersionSelector();
  });

  document.getElementById('btnToggleAllVersions')?.addEventListener('click', () => {
    STATE.showAllVersions = !STATE.showAllVersions;
    renderVersionSelector();
  });

  document.getElementById('btnApplyCustomVersion')?.addEventListener('click', () => {
    const input = document.getElementById('inputCustomVersion');
    if (!input) return;
    const customVer = input.value.trim().replace(/^v/i, '');
    if (!customVer) return;
    if (!/^\d+(\.\d+)+$/.test(customVer)) {
      alert('Invalid version format. Example: 21.13.164');
      return;
    }
    if (!STATE.availableVersions.some(x => x.version === customVer)) {
      STATE.availableVersions.unshift({
        version: customVer,
        isRecommended: false,
        isManifest: false
      });
    }
    STATE.currentVersion = customVer;
    renderVersionSelector();
    syncAllSummaries();
    input.value = '';
  });

  // Screen 3: Expert Mode Patches Header & 5-Pill Toolbar
  document.getElementById('btnPatchesBack')?.addEventListener('click', () => switchScreen('version'));

  document.getElementById('btnFilterEnabledOnly')?.addEventListener('click', (e) => {
    STATE.filterEnabledOnly = !STATE.filterEnabledOnly;
    e.currentTarget.classList.toggle('filter-active', STATE.filterEnabledOnly);
    renderMorphePatchList();
  });

  document.getElementById('btnTogglePatchSearch')?.addEventListener('click', () => {
    const bar = document.getElementById('patchSearchCollapsible');
    if (bar) {
      bar.classList.toggle('hidden');
      if (!bar.classList.contains('hidden')) {
        document.getElementById('inputSearchPatch')?.focus();
      }
    }
  });

  document.getElementById('btnResetPatches')?.addEventListener('click', () => {
    STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
    renderMorphePatchList();
    syncAllSummaries();
  });

  document.getElementById('btnLoadGoldenPreset')?.addEventListener('click', () => applyGoldenPreset());
  document.getElementById('btnSheetGolden')?.addEventListener('click', () => {
    applyGoldenPreset();
    document.getElementById('presetSheetModal')?.classList.add('hidden');
  });

  document.getElementById('btnRestoreDefaultPatches')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    STATE.patches.forEach(p => {
      if (p.use !== false) STATE.selectedPatches.add(p.name);
    });
    renderMorphePatchList();
    syncAllSummaries();
  });

  document.getElementById('btnOpenPresetSheet')?.addEventListener('click', () => {
    document.getElementById('presetSheetModal')?.classList.remove('hidden');
  });
  document.getElementById('btnClosePresetSheet')?.addEventListener('click', () => {
    document.getElementById('presetSheetModal')?.classList.add('hidden');
  });
  document.getElementById('btnExportPreset')?.addEventListener('click', exportPreset);
  document.getElementById('btnImportPreset')?.addEventListener('click', () => {
    document.getElementById('inputImportPreset')?.click();
  });
  document.getElementById('inputImportPreset')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importPreset(file);
      e.target.value = '';
    }
  });

  document.getElementById('btnDisableAllPatches')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    renderMorphePatchList();
    syncAllSummaries();
  });

  document.getElementById('inputSearchPatch')?.addEventListener('input', (e) => {
    STATE.patchSearchQuery = e.target.value;
    renderMorphePatchList();
  });

  // Patch Options Modal
  document.getElementById('btnClosePatchOptsModal')?.addEventListener('click', closePatchOptionsModal);
  document.getElementById('btnCancelPatchOpts')?.addEventListener('click', closePatchOptionsModal);
  document.getElementById('btnSavePatchOpts')?.addEventListener('click', savePatchOptionsModal);
  document.getElementById('btnResetPatchOpts')?.addEventListener('click', resetPatchOptionsModal);
  document.getElementById('patchOptionsModal')?.addEventListener('click', event => {
    if (event.target.id === 'patchOptionsModal') closePatchOptionsModal();
  });

  // Trigger Patch & Progress Controls
  document.getElementById('btnTriggerBuild')?.addEventListener('click', triggerBuildPipeline);
  document.getElementById('btnProgressBackHome')?.addEventListener('click', () => {
    if (STATE.eventSource) STATE.eventSource.close();
    switchScreen('home');
  });

  // Release Channel & Notes
  document.getElementById('selectPatchRelease')?.addEventListener('change', async (e) => {
    const tag = e.target.value;
    const release = (STATE.patchReleases || []).find(item => (item.tag_name || item.name) === tag);
    await selectPatchChannel(tag, release ? Boolean(release.prerelease) : null);
    syncAllSummaries();
  });
  document.getElementById('btnViewPatchNotes')?.addEventListener('click', showPatchNotesModal);
  document.getElementById('btnClosePatchNotesModal')?.addEventListener('click', () => {
    document.getElementById('patchNotesModal')?.classList.add('hidden');
  });
  document.getElementById('btnSaveAuth')?.addEventListener('click', async () => {
    const input = document.getElementById('inputGithubToken');
    const alertBox = document.getElementById('authAlert');
    const token = input?.value.trim() || '';
    if (!token) return;
    RVX_STORAGE.local.setItem('rvx_gh_pat', token);
    STATE.authToken = token;
    const valid = await verifyGithubToken(token);
    if (alertBox) {
      alertBox.classList.remove('hidden');
      alertBox.textContent = valid ? `Authenticated as @${STATE.authUser}` : 'Token saved';
    }
  });

  document.getElementById('btnClearAuth')?.addEventListener('click', () => {
    RVX_STORAGE.local.removeItem('rvx_gh_pat');
    STATE.authToken = '';
    STATE.authUser = null;
    const input = document.getElementById('inputGithubToken');
    if (input) input.value = '';
    setText('authStatusText', 'Guest');
  });

  document.getElementById('btnCloseProgressModal')?.addEventListener('click', () => {
    document.getElementById('buildProgressModal')?.classList.add('hidden');
  });

  document.getElementById('btnClearLogs')?.addEventListener('click', () => {
    STATE.logHistory = [{ type: 'I', text: 'Logs cleared.' }];
    const list = document.getElementById('morpheStructuredLogs');
    if (list) {
      list.innerHTML = `
        <div class="morphe-log-row">
          <span class="log-badge log-badge-info">I</span>
          <span class="log-msg">Logs cleared.</span>
        </div>
      `;
    }
    document.getElementById('infoModal')?.classList.add('hidden');
  });

  document.getElementById('btnCopyLogs')?.addEventListener('click', () => {
    const text = STATE.logHistory.map(x => `[${x.type}] ${x.text}`).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setText('copyBtnLabel', 'Copied');
        setTimeout(() => setText('copyBtnLabel', 'Copy'), 1500);
      });
    }
  });

  // Post-Patch Mount & Export ZIP
  document.getElementById('btnHeroHotMount')?.addEventListener('click', async () => {
    const alertBox = document.getElementById('heroMountAlert');
    if (alertBox) {
      alertBox.textContent = 'Mounting YouTube RVX...';
      alertBox.className = 'morphe-alert';
      alertBox.classList.remove('hidden');
    }
    try {
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/mount`, { method: 'POST', headers: daemonAuthHeaders() });
      const data = await res.json();
      if (res.ok) {
        if (alertBox) {
          alertBox.textContent = 'Mounted! YouTube restarted.';
          alertBox.className = 'morphe-alert text-success';
        }
      } else {
        throw new Error(data.error || 'Failed to mount');
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Mount error: ${err.message}`;
        alertBox.className = 'morphe-alert text-danger';
      }
    }
  });

  document.getElementById('btnHeroExportZip')?.addEventListener('click', async () => {
    const alertBox = document.getElementById('heroMountAlert');
    if (alertBox) {
      alertBox.textContent = 'Packaging flashable ZIP...';
      alertBox.className = 'morphe-alert';
      alertBox.classList.remove('hidden');
    }
    try {
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/export-zip`, { method: 'POST', headers: daemonAuthHeaders() });
      const data = await res.json();
      if (res.ok) {
        if (alertBox) {
          alertBox.textContent = `Saved to: ${data.path || '/sdcard/Download/YouTube-RVX-Flashable.zip'}`;
          alertBox.className = 'morphe-alert text-success';
        }
      } else {
        throw new Error(data.error || 'Failed to export ZIP');
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Export error: ${err.message}`;
        alertBox.className = 'morphe-alert text-danger';
      }
    }
  });

  // Setup Wizard & Returning Dashboard Event Handlers
  document.querySelectorAll('.wizard-step-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10);
      if (step) goToWizardStep(step);
    });
  });

  document.getElementById('btnRestartWizard')?.addEventListener('click', () => {
    resetWizardSelections();
    goToWizardStep(1);
    switchScreen('wizard');
  });

  document.getElementById('btnWizardToggleUi')?.addEventListener('click', () => {
    document.getElementById('wizardHeaderMenu')?.classList.add('hidden');
    setUiMode(STATE.uiMode === 'morphe' ? 'tui' : 'morphe');
  });

  document.getElementById('btnDownloadSingleHtml')?.addEventListener('click', () => {
    document.getElementById('wizardHeaderMenu')?.classList.add('hidden');
    const link = document.createElement('a');
    link.href = 'rvx-local.html';
    link.download = 'rvx-local.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  document.getElementById('btnWizardInfo')?.addEventListener('click', () => {
    document.getElementById('wizardHeaderMenu')?.classList.add('hidden');
    syncAllSummaries();
    document.getElementById('infoModal')?.classList.remove('hidden');
    loadDaemonSessionInfo();
  });
  document.getElementById('btnWizardStepRefresh')?.addEventListener('click', refreshWizardStep);
  document.getElementById('btnWizardHeaderMenu')?.addEventListener('click', event => {
    event.stopPropagation();
    const menu = document.getElementById('wizardHeaderMenu');
    const opening = menu?.classList.contains('hidden');
    menu?.classList.toggle('hidden', !opening);
    event.currentTarget.setAttribute('aria-expanded', String(Boolean(opening)));
  });
  document.getElementById('wizardHeaderMenu')?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => {
    document.getElementById('wizardHeaderMenu')?.classList.add('hidden');
    document.getElementById('btnWizardHeaderMenu')?.setAttribute('aria-expanded', 'false');
  });

  // Wizard Step 1 Handlers
  document.getElementById('btnWizStep1Next')?.addEventListener('click', () => {
    if (STATE.currentApp) goToWizardStep(2);
  });
  document.getElementById('btnWizardReleaseNotes')?.addEventListener('click', showPatchNotesModal);
  document.getElementById('wizardPatchReleaseSelect')?.addEventListener('change', async (e) => {
    const tag = e.target.value;
    const release = (STATE.patchReleases || []).find(item => (item.tag_name || item.name) === tag);
    await syncReleaseChannelSelection(tag, release ? Boolean(release.prerelease) : null);
  });

  // Wizard Step 2 Handlers
  document.getElementById('btnWizStep2Back')?.addEventListener('click', () => goToWizardStep(1));
  document.getElementById('btnWizStep2Next')?.addEventListener('click', async (event) => {
    if (!STATE.currentSource || !STATE.patchTag) return;
    if (STATE.patches.length > 0 && !STATE.channelLoading) {
      goToWizardStep(3);
      return;
    }
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Menyiapkan patch…';
    const ready = await fetchAndRenderPatches(STATE.currentSource);
    button.textContent = originalText;
    if (ready) goToWizardStep(3);
    else renderWizardActiveSource();
  });

  // Wizard Step 3 Handlers
  document.getElementById('btnWizStep3Back')?.addEventListener('click', () => goToWizardStep(2));
  document.getElementById('btnWizStep3Next')?.addEventListener('click', () => {
    if (STATE.currentVersion) goToWizardStep(4);
  });
  bindOtherVersionsEvents();

  // Wizard Step 4 Handlers
  document.getElementById('inputWizPatchSearch')?.addEventListener('input', (e) => {
    STATE.patchSearchQuery = e.target.value;
    renderMorphePatchList('wizardPatchCategoriesContainer');
  });
  document.querySelectorAll('[data-patch-filter]').forEach(button => {
    button.addEventListener('click', () => {
      STATE.patchListFilter = button.dataset.patchFilter || 'all';
      renderMorphePatchList('wizardPatchCategoriesContainer');
    });
  });
  document.getElementById('btnPatchBulkMenu')?.addEventListener('click', event => {
    event.stopPropagation();
    const menu = document.getElementById('patchBulkMenu');
    const opening = menu?.classList.contains('hidden');
    menu?.classList.toggle('hidden', !opening);
    event.currentTarget.setAttribute('aria-expanded', String(Boolean(opening)));
  });
  document.getElementById('patchBulkMenu')?.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', closePatchBulkMenu);
  document.addEventListener('keydown', event => {
    const optionsModal = document.getElementById('patchOptionsModal');
    const optionsOpen = optionsModal && !optionsModal.classList.contains('hidden');
    if (event.key === 'Escape') {
      closePatchBulkMenu();
      if (optionsOpen) closePatchOptionsModal();
      if (!document.getElementById('modalOtherVersions')?.classList.contains('hidden')) closeOtherVersionsModal();
      return;
    }
    if (event.key !== 'Tab' || !optionsOpen) return;
    const focusable = Array.from(optionsModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(element => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.getElementById('btnWizPatchesDefault')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    STATE.patches.forEach(p => {
      if (p.use !== false) STATE.selectedPatches.add(p.name);
    });
    adjustMicrogForMode(STATE.targetMode);
    renderMorphePatchList('wizardPatchCategoriesContainer');
    syncAllSummaries();
    closePatchBulkMenu();
  });
  document.getElementById('btnWizPatchesAll')?.addEventListener('click', () => {
    STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
    renderMorphePatchList('wizardPatchCategoriesContainer');
    syncAllSummaries();
    closePatchBulkMenu();
  });
  document.getElementById('btnWizPatchesClear')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    renderMorphePatchList('wizardPatchCategoriesContainer');
    syncAllSummaries();
    closePatchBulkMenu();
  });
  document.getElementById('btnWizExportPreset')?.addEventListener('click', () => {
    if (typeof exportCurrentPatchPreset === 'function') exportCurrentPatchPreset();
    closePatchBulkMenu();
  });
  document.getElementById('btnWizImportPreset')?.addEventListener('click', () => {
    if (typeof triggerImportPatchPreset === 'function') triggerImportPatchPreset();
    closePatchBulkMenu();
  });
  document.getElementById('btnWizStep4Back')?.addEventListener('click', () => goToWizardStep(3));
  document.getElementById('btnWizStep4Next')?.addEventListener('click', () => {
    if (STATE.targetMode && STATE.selectedPatches.size > 0) goToWizardStep(5);
  });

  // Wizard Step 5 Handlers
  document.getElementById('btnWizardStartBuild')?.addEventListener('click', () => {
    triggerBuildPipeline();
  });
  document.getElementById('btnCloseDownloadConsent')?.addEventListener('click', closeDownloadConsentModal);
  document.getElementById('btnCancelDownloadConsent')?.addEventListener('click', closeDownloadConsentModal);
  document.getElementById('btnConfirmDownloadConsent')?.addEventListener('click', confirmLocalPatchBuild);
  document.getElementById('inputBrowserApk')?.addEventListener('change', event => {
    const file = event.target.files?.[0] || null;
    STATE.selectedApkFile = file;
    const panel = document.getElementById('browserApkInputPanel');
    const status = document.getElementById('browserApkInputStatus');
    panel?.classList.toggle('is-ready', Boolean(file));
    if (status) {
      status.textContent = file
        ? `${file.name} · ${formatDownloadBytes(file.size)}`
        : 'Pilih APK yang versinya sesuai dengan konfigurasi.';
    }
    if (STATE.engineMode === 'browser') openDownloadConsentModal();
  });
  document.getElementById('btnPrepareOnWifi')?.addEventListener('click', () => {
    RVX_STORAGE.local.setItem('rvx_prepare_on_wifi', JSON.stringify({
      packageName: STATE.currentApp?.packageName || '',
      source: STATE.currentSource || '',
      tag: STATE.patchTag || '',
      savedAt: Date.now()
    }));
    const total = document.getElementById('downloadPlanTotal');
    if (total) total.textContent = 'Disimpan; buka kembali saat terhubung ke Wi-Fi';
  });
  document.getElementById('btnChangeStorageLocations')?.addEventListener('click', () => {
    STATE.pendingDownloadPlan = null;
    document.getElementById('btnConfirmDownloadConsent').disabled = true;
    renderStorageLocations({ edit: true });
  });
  document.getElementById('selectWorkspaceLocation')?.addEventListener('change', syncCustomStorageFields);
  document.getElementById('selectOutputLocation')?.addEventListener('change', syncCustomStorageFields);
  document.getElementById('btnBrowseWorkspace')?.addEventListener('click', () => openStorageBrowser('workspace'));
  document.getElementById('btnBrowseOutput')?.addEventListener('click', () => openStorageBrowser('output'));
  document.getElementById('btnStorageBrowserUp')?.addEventListener('click', () => {
    if (STATE.storageBrowseParent) fetchStorageDirectory(STATE.storageBrowseParent);
  });
  document.getElementById('btnUseStorageFolder')?.addEventListener('click', useSelectedStorageFolder);
  document.getElementById('btnCloseStorageBrowser')?.addEventListener('click', closeStorageBrowser);
  document.getElementById('btnCancelStorageBrowser')?.addEventListener('click', closeStorageBrowser);
  document.getElementById('storageBrowserModal')?.addEventListener('click', event => {
    if (event.target.id === 'storageBrowserModal') closeStorageBrowser();
  });
  document.getElementById('btnSaveStorageLocations')?.addEventListener('click', saveStorageLocations);
  document.getElementById('checkUnknownSizeConsent')?.addEventListener('change', event => {
    const button = document.getElementById('btnConfirmDownloadConsent');
    if (button && STATE.pendingDownloadPlan) button.disabled = !event.target.checked;
  });
  document.getElementById('downloadConsentModal')?.addEventListener('click', event => {
    if (event.target.id === 'downloadConsentModal') closeDownloadConsentModal();
  });
  document.getElementById('btnWizardRootInstall')?.addEventListener('click', () => {
    document.getElementById('btnHeroHotMount')?.click();
  });
  document.getElementById('btnWizardSaveFile')?.addEventListener('click', () => {
    document.getElementById('btnHeroExportZip')?.click();
  });
  document.getElementById('btnWizardFinish')?.addEventListener('click', () => {
    completeWizardAndEnterDashboard();
  });
  document.getElementById('btnWizStep5Back')?.addEventListener('click', () => goToWizardStep(4));

  // Silent Developer Listener & Dispatch
  const infoVerEl = document.getElementById('infoEngineStatus');
  if (infoVerEl && typeof registerSilentDeveloperListener === 'function') {
    registerSilentDeveloperListener(infoVerEl);
  }
  document.getElementById('btnCloseDevModal')?.addEventListener('click', () => {
    document.getElementById('silentDevModal')?.classList.add('hidden');
  });
  document.getElementById('btnDevDispatchTrigger')?.addEventListener('click', async () => {
    const alertBox = document.getElementById('devDispatchAlert');
    const repo = document.getElementById('inputDevRepo')?.value.trim();
    const branch = document.getElementById('inputDevBranch')?.value.trim();
    const token = document.getElementById('inputDevToken')?.value.trim();

    if (!token) {
      if (alertBox) {
        alertBox.textContent = 'Personal Access Token (PAT) wajib diisi.';
        alertBox.className = 'morphe-alert text-danger';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    if (alertBox) {
      alertBox.textContent = 'Mengirim release dispatch...';
      alertBox.className = 'morphe-alert';
      alertBox.classList.remove('hidden');
    }

    try {
      await triggerSilentDeveloperDispatch({
        token,
        repo,
        branch,
        eventType: 'build-rvx',
        payload: {
          package_name: STATE.currentApp?.packageName || 'com.google.android.youtube',
          target_version: STATE.currentVersion,
          source: STATE.currentSource,
          tag: STATE.patchTag,
          mode: STATE.targetMode
        }
      });
      if (alertBox) {
        alertBox.textContent = 'Dispatch berhasil dikirim ke GitHub Actions!';
        alertBox.className = 'morphe-alert text-success';
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Dispatch error: ${err.message}`;
        alertBox.className = 'morphe-alert text-danger';
      }
    }
  });
}

function registerServiceWorker() {
  if (window.RVX_RUNTIME?.isFileProtocol) return;
  if ('serviceWorker' in navigator) {
    const host = window.location.hostname;
    const isPrivateIpv4 = /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const isLocalRuntime = host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || isPrivateIpv4;
    if (isLocalRuntime) {
      // The local daemon always serves the newest workspace files. Persistent
      // PWA caches on different LAN origins can otherwise run different builds.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          reg.unregister();
        }
      });
      if ('caches' in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
      return;
    }

    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update();
    }).catch(() => {});
  }
}
