/**
 * YouTube RVX — Application Bootstrap & Event Orchestrator
 * Version: 2.1.14
 */

document.addEventListener('DOMContentLoaded', async () => {
  initSecurity();
  initViewportTracker();
  initEventListeners();
  initKeyboardNavigation();
  setUiMode(STATE.uiMode);

  await checkDaemonStatus();
  await loadSourcesAndPresets();
  await fetchAndRenderPatches(STATE.currentSource);
  await fetchInstalledAppInfo();
  syncAllSummaries();
  registerServiceWorker();
});

function setUiMode(mode) {
  STATE.uiMode = mode === 'tui' ? 'tui' : 'morphe';
  localStorage.setItem('rvx_ui_mode', STATE.uiMode);

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
    progress: 'screenProgress'
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
  document.getElementById('btnClosePatchOptsModal')?.addEventListener('click', () => {
    document.getElementById('patchOptionsModal')?.classList.add('hidden');
  });
  document.getElementById('btnSavePatchOpts')?.addEventListener('click', savePatchOptionsModal);
  document.getElementById('btnResetPatchOpts')?.addEventListener('click', resetPatchOptionsModal);

  // Trigger Patch & Progress Controls
  document.getElementById('btnTriggerBuild')?.addEventListener('click', triggerBuildPipeline);
  document.getElementById('btnProgressBackHome')?.addEventListener('click', () => {
    if (STATE.eventSource) STATE.eventSource.close();
    switchScreen('home');
  });

  // Release Channel & Notes
  document.getElementById('selectPatchRelease')?.addEventListener('change', (e) => {
    STATE.patchTag = e.target.value;
    syncAllSummaries();
  });
  document.getElementById('btnViewPatchNotes')?.addEventListener('click', showPatchNotesModal);
  document.getElementById('btnClosePatchNotesModal')?.addEventListener('click', () => {
    document.getElementById('patchNotesModal')?.classList.add('hidden');
  });
  document.getElementById('btnClosePatchNotesBtn')?.addEventListener('click', () => {
    document.getElementById('patchNotesModal')?.classList.add('hidden');
  });

  // Settings
  document.getElementById('btnEngineLocal')?.addEventListener('click', () => setEngineMode('local'));
  document.getElementById('btnEngineCloud')?.addEventListener('click', () => setEngineMode('cloud'));

  document.getElementById('btnSaveAuth')?.addEventListener('click', async () => {
    const input = document.getElementById('inputGithubToken');
    const alertBox = document.getElementById('authAlert');
    const token = input?.value.trim() || '';
    if (!token) return;
    localStorage.setItem('rvx_gh_pat', token);
    STATE.authToken = token;
    const valid = await verifyGithubToken(token);
    if (alertBox) {
      alertBox.classList.remove('hidden');
      alertBox.textContent = valid ? `Authenticated as @${STATE.authUser}` : 'Token saved';
    }
  });

  document.getElementById('btnClearAuth')?.addEventListener('click', () => {
    localStorage.removeItem('rvx_gh_pat');
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
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/mount`, { method: 'POST' });
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
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/export-zip`, { method: 'POST' });
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
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost && 'caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => {
          if (k !== 'rvx-builder-v2.1.14') {
            caches.delete(k);
          }
        });
      });
    }

    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update();
    }).catch(() => {});
  }
}
