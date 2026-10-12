/**
 * YouTube RVX — Setup Wizard & Returning Dashboard Orchestrator
 * Version: 2.1.15
 */

let silentDevClicks = 0;
let silentDevTimer = null;

function initWizardOrDashboard() {
  const wizardScreen = document.getElementById('screenWizard');
  const homeScreen = document.getElementById('screenHome');

  if (STATE.setupCompleted) {
    if (wizardScreen) wizardScreen.classList.remove('active');
    if (homeScreen) homeScreen.classList.add('active');
    renderAppCardsWithConfigStatus();
    switchScreen('home');
  } else {
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

  // Switch Active Step Pane
  for (let i = 1; i <= 5; i++) {
    const pane = document.getElementById(`wizardStep${i}`);
    if (pane) pane.classList.toggle('active', i === step);
  }

  // Render content for target step
  switch (step) {
    case 1:
      renderWizardSourceStep();
      break;
    case 2:
      renderWizardAppStep();
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

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   STEP 1: SOURCE & PATCH RELEASE SELECTION
   ========================================================================== */
function renderWizardSourceStep() {
  const container = document.getElementById('wizardSourcesGrid');
  if (!container) return;
  container.innerHTML = '';

  STATE.sources.forEach(src => {
    const isActive = src.id === STATE.currentSource;
    const displayName = getSourceDisplayName(src.id);
    const card = document.createElement('div');
    card.className = `source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.title = src.description || displayName;

    card.innerHTML = `
      <div class="source-card-avatar" style="background: ${src.avatarColor || '#3182CE'}">${src.avatarText || displayName.charAt(0)}</div>
      <div class="source-card-meta">
        <span class="source-card-title">${escapeHtml(displayName)}</span>
        <span class="source-card-tag">${src.isPreinstalled !== false ? 'Official / Pre-installed' : 'Custom'}</span>
      </div>
      <span class="source-card-check">${isActive ? '✓' : ''}</span>
    `;

    card.addEventListener('click', async () => {
      await selectPatchSource(src.id);
      renderWizardSourceStep();
    });

    container.appendChild(card);
  });

  const wizSelect = document.getElementById('wizardPatchReleaseSelect');
  const mainSelect = document.getElementById('selectPatchRelease');
  if (wizSelect && mainSelect) {
    wizSelect.innerHTML = mainSelect.innerHTML;
    wizSelect.value = STATE.patchTag || mainSelect.value;
  }
}

/* ==========================================================================
   STEP 2: TARGET APPLICATION SELECTION
   ========================================================================== */
function renderWizardAppStep() {
  const container = document.getElementById('wizardAppsGrid');
  if (!container) return;
  container.innerHTML = '';

  const apps = STATE.availableApps || [];
  if (apps.length === 0) {
    container.innerHTML = '<div class="morphe-ver-row"><span class="morphe-muted-hint">Memuat aplikasi yang didukung...</span></div>';
    return;
  }

  apps.forEach(app => {
    const isSelected = STATE.currentApp && STATE.currentApp.packageName === app.packageName;
    const isConfigured = isAppConfigured(app.packageName);
    const card = document.createElement('div');
    card.className = `morphe-app-card ${isSelected ? 'active-app' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    card.style.setProperty('--app-bg-gradient', app.gradient);

    card.innerHTML = `
      <div class="yt-card-icon" style="background:${app.accentColor || '#B42323'};">
        ${app.iconSvg}
      </div>
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 class="yt-card-title">${escapeHtml(app.name)}</h2>
          ${isConfigured ? '<span class="badge-configured">✓ Configured</span>' : ''}
        </div>
        <p class="yt-card-sub">v${escapeHtml(app.recommendedVersion)} • ${app.patchCount} patches available</p>
      </div>
      <div class="app-card-arrow">›</div>
    `;

    card.addEventListener('click', () => {
      selectApp(app.packageName);
      // Load saved app config if exists
      const saved = getAppConfig(app.packageName);
      if (saved) {
        if (saved.targetVersion) STATE.currentVersion = saved.targetVersion;
        if (saved.mode) STATE.targetMode = saved.mode;
      }
      goToWizardStep(3);
    });

    container.appendChild(card);
  });
}

/* ==========================================================================
   STEP 3: TARGET APP VERSION SELECTION
   ========================================================================== */
function renderWizardVersionStep() {
  const appNameEl = document.getElementById('wizardVersionAppName');
  if (appNameEl && STATE.currentApp) {
    appNameEl.textContent = STATE.currentApp.name || 'YouTube';
  }

  // Render Recommended Hero Banner
  const heroRec = document.getElementById('wizardRecVersionHero');
  const heroNum = document.getElementById('wizardRecVersionNum');
  const recVer = STATE.recommendedVersion || (STATE.availableVersions[0]?.version) || '21.13.164';

  if (heroNum) heroNum.textContent = `v${recVer}`;
  if (heroRec) {
    const isRecSelected = STATE.currentVersion === recVer;
    heroRec.classList.toggle('selected', isRecSelected);
    heroRec.onclick = () => {
      STATE.currentVersion = recVer;
      renderWizardVersionStep();
      syncAllSummaries();
    };
  }

  // Render All Available Versions
  const container = document.getElementById('wizardVersionList');
  if (!container) return;
  container.innerHTML = '';

  const versions = STATE.showAllVersions
    ? STATE.availableVersions
    : STATE.availableVersions.slice(0, 5);

  versions.forEach(item => {
    const ver = item.version;
    const isSelected = ver === STATE.currentVersion;
    const cls = classifyVersion(ver);

    const row = document.createElement('div');
    row.className = `morphe-ver-row ${isSelected ? 'active' : ''}`;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', isSelected ? 'true' : 'false');

    row.innerHTML = `
      <div class="ver-row-left">
        <span class="ver-check-mark">${isSelected ? SVG_CHECK : ''}</span>
        <span class="ver-number-mono">${escapeHtml(ver)}</span>
      </div>
      <div class="version-badges-row">
        <span class="badge-version ${cls.badgeClass}">${cls.label}</span>
        ${item.isRecommended ? `<span class="ver-pill-rec">${SVG_THUMB}<span>Suggested</span></span>` : ''}
      </div>
    `;

    row.addEventListener('click', () => {
      STATE.currentVersion = ver;
      renderWizardVersionStep();
      syncAllSummaries();
    });

    container.appendChild(row);
  });

  const toggleBtn = document.getElementById('btnWizardToggleAllVersions');
  if (toggleBtn) {
    toggleBtn.textContent = STATE.showAllVersions ? 'Tampilkan lebih sedikit' : 'Tampilkan semua versi';
  }
}

/* ==========================================================================
   STEP 4: TARGET MODE & PATCH CURATION
   ========================================================================== */
function renderWizardModeAndPatchesStep() {
  updateModeSwitcherUI();
  renderMorphePatchList();
}

function updateModeSwitcherUI() {
  const isRoot = STATE.targetMode === 'root';
  const cardRoot = document.getElementById('modeCardRoot');
  const cardNonRoot = document.getElementById('modeCardNonRoot');

  if (cardRoot && cardNonRoot) {
    cardRoot.classList.toggle('active', isRoot);
    cardNonRoot.classList.toggle('active', !isRoot);
    cardRoot.setAttribute('aria-checked', isRoot ? 'true' : 'false');
    cardNonRoot.setAttribute('aria-checked', !isRoot ? 'true' : 'false');
  }
}

function setTargetMode(mode) {
  STATE.targetMode = mode === 'non-root' ? 'non-root' : 'root';
  localStorage.setItem('rvx_target_mode', STATE.targetMode);
  updateModeSwitcherUI();

  // Smart GmsCore/MicroG auto toggle based on mode
  adjustMicrogForMode(STATE.targetMode);
  renderMorphePatchList();
  syncAllSummaries();
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
        renderMorphePatchList();
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
        renderMorphePatchList();
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
  setText('summaryAppName', STATE.currentApp?.name || 'YouTube');
  setText('summaryVersion', `v${STATE.currentVersion}`);
  setText('summarySource', getSourceDisplayName(STATE.currentSource));
  setText('summaryMode', STATE.targetMode === 'root' ? 'Mode Root (Magisk/KSU/APatch)' : 'Mode Non-Root (Standalone APK)');
  setText('summaryPatchesCount', `${STATE.selectedPatches.size} aktif`);

  // Adapt completion buttons
  const btnRoot = document.getElementById('btnWizardRootInstall');
  if (btnRoot) {
    btnRoot.classList.toggle('hidden', STATE.targetMode !== 'root');
  }
}

function completeWizardAndEnterDashboard() {
  const pkg = STATE.currentApp?.packageName || 'com.google.android.youtube';
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
  localStorage.setItem('rvx_setup_completed', 'true');

  initWizardOrDashboard();
}

/* ==========================================================================
   RETURNING USER DASHBOARD
   ========================================================================== */
function renderAppCardsWithConfigStatus() {
  const container = document.getElementById('homeAppsGrid');
  if (!container) return;
  container.innerHTML = '';

  const apps = STATE.availableApps || [];
  apps.forEach(app => {
    const isConfigured = isAppConfigured(app.packageName);
    const savedConfig = getAppConfig(app.packageName);
    const card = document.createElement('div');
    card.className = 'morphe-app-card';
    card.style.setProperty('--app-bg-gradient', app.gradient);

    const statusBadge = isConfigured
      ? `<span class="badge-configured">✓ Configured</span>`
      : `<span class="badge-needs-setup">+ Setup</span>`;

    const subText = isConfigured
      ? `v${savedConfig.targetVersion || app.recommendedVersion} • ${savedConfig.mode === 'root' ? 'Mode Root' : 'Non-Root'} (${savedConfig.selectedPatches?.length || app.patchCount} patches)`
      : `v${app.recommendedVersion} • ${app.patchCount} patches available`;

    card.innerHTML = `
      <div class="yt-card-icon" style="background:${app.accentColor || '#B42323'};">
        ${app.iconSvg}
      </div>
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 class="yt-card-title">${escapeHtml(app.name)}</h2>
          ${statusBadge}
        </div>
        <p class="yt-card-sub">${escapeHtml(subText)}</p>
      </div>
      ${isConfigured ? `
        <button type="button" class="btn-card-edit" title="Edit konfigurasi aplikasi ini" aria-label="Edit Setup">⋮</button>
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

      if (isConfigured) {
        // Instant Quick Patch with saved configuration
        selectApp(app.packageName);
        applySavedAppConfig(savedConfig);
        triggerBuildPipeline();
      } else {
        openAppSetupWizard(app.packageName);
      }
    });

    container.appendChild(card);
  });
}

function openAppSetupWizard(pkgId) {
  selectApp(pkgId);
  const saved = getAppConfig(pkgId);
  if (saved) {
    applySavedAppConfig(saved);
  }
  goToWizardStep(3); // Start at target version
  switchScreen('wizard');
}

function applySavedAppConfig(config) {
  if (!config) return;
  if (config.targetVersion) STATE.currentVersion = config.targetVersion;
  if (config.source) STATE.currentSource = config.source;
  if (config.patchTag) STATE.patchTag = config.patchTag;
  if (config.mode) STATE.targetMode = config.mode;
  if (Array.isArray(config.selectedPatches) && config.selectedPatches.length > 0) {
    STATE.selectedPatches = new Set(config.selectedPatches);
  }
  if (config.selectedOptions) {
    STATE.selectedOptions = { ...config.selectedOptions };
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
