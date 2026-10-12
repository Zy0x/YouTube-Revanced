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
   STEP 1: SOURCE & PATCH RELEASE SELECTION (RICH CATALOG & RELEASE STUDIO)
   ========================================================================== */
function getSourceBadgeClass(badge) {
  if (!badge) return 'badge-source-morphe';
  const b = String(badge).toLowerCase();
  if (b.includes('recommend')) return 'badge-source-recommended';
  if (b.includes('classic')) return 'badge-source-classic';
  if (b.includes('morphe')) return 'badge-source-morphe';
  if (b.includes('upstream')) return 'badge-source-upstream';
  if (b.includes('daily')) return 'badge-source-daily';
  if (b.includes('community')) return 'badge-source-community';
  if (b.includes('enhanced')) return 'badge-source-enhanced';
  if (b.includes('lightweight')) return 'badge-source-lightweight';
  if (b.includes('custom')) return 'badge-source-custom';
  return 'badge-source-morphe';
}

function renderWizardSourceStep() {
  const container = document.getElementById('wizardSourcesGrid');
  if (!container) return;
  container.innerHTML = '';

  const countBadge = document.getElementById('wizardSourcesCountBadge');
  if (countBadge) {
    countBadge.textContent = `${STATE.sources.length} Sumber Siap Pakai`;
  }

  STATE.sources.forEach(src => {
    const isActive = src.id === STATE.currentSource;
    const displayName = getSourceDisplayName(src.id);
    const repoText = src.repository || (src.manifestUrl ? 'Manifest URL' : `${src.id}/patches`);
    const badgeText = src.badge || (src.isPreinstalled !== false ? 'Official' : 'Custom');
    const badgeClass = getSourceBadgeClass(badgeText);
    const avatarBg = src.avatarGradient || src.avatarColor || '#3B82F6';
    const avatarChar = src.avatarText || displayName.charAt(0).toUpperCase();

    const card = document.createElement('div');
    card.className = `wizard-source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.tabIndex = 0;

    const isDeletable = !src.isPreinstalled && !src.isDefault;

    card.innerHTML = `
      <div class="wizard-source-top">
        <div class="wizard-source-avatar" style="background: ${avatarBg}">${escapeHtml(avatarChar)}</div>
        <div class="wizard-source-info">
          <div class="wizard-source-title-row">
            <span class="wizard-source-name">${escapeHtml(src.name || displayName)}</span>
            <span class="wizard-source-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
          </div>
          <span class="wizard-source-repo">${escapeHtml(repoText)}</span>
        </div>
      </div>
      <p class="wizard-source-desc">${escapeHtml(src.description || 'Repositori modifikasi patch aplikasi.')}</p>
      <div class="wizard-source-bottom">
        ${isDeletable ? `
          <button type="button" class="btn-delete-custom-src" title="Hapus sumber ini">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Hapus</span>
          </button>
        ` : '<span></span>'}
        <span class="wizard-source-check">${isActive ? '✓' : ''}</span>
      </div>
    `;

    card.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-delete-custom-src')) {
        e.stopPropagation();
        if (confirm(`Hapus sumber "${src.name || displayName}"?`)) {
          deleteCustomSource(src.id);
          await selectPatchSource(STATE.currentSource);
          renderWizardSourceStep();
        }
        return;
      }
      await selectPatchSource(src.id);
      renderWizardSourceStep();
    });

    container.appendChild(card);
  });

  bindWizardSourceToolbar();
  renderWizardReleaseStudio();
}

function bindWizardSourceToolbar() {
  const drawer = document.getElementById('wizAddSourceDrawer');
  const btnToggle = document.getElementById('btnWizToggleAddSource');
  const btnClose = document.getElementById('btnWizCloseAddSource');
  const btnCancel = document.getElementById('btnWizCancelAddSource');
  const btnSave = document.getElementById('btnWizSaveCustomSource');
  const btnReset = document.getElementById('btnWizResetSources');

  if (btnToggle && drawer) {
    btnToggle.onclick = () => drawer.classList.toggle('hidden');
  }
  if (btnClose && drawer) {
    btnClose.onclick = () => drawer.classList.add('hidden');
  }
  if (btnCancel && drawer) {
    btnCancel.onclick = () => drawer.classList.add('hidden');
  }

  if (btnSave && drawer) {
    btnSave.onclick = async () => {
      const nameInput = document.getElementById('inputWizSourceName');
      const repoInput = document.getElementById('inputWizSourceRepo');
      const chanInput = document.getElementById('selectWizSourceChannel');
      const name = nameInput ? nameInput.value.trim() : '';
      const repo = repoInput ? repoInput.value.trim() : '';
      const channel = chanInput ? chanInput.value : 'latest';

      if (!repo) {
        alert('Harap masukkan repositori GitHub (owner/repo) atau URL manifest raw.');
        return;
      }

      const added = addCustomSource({
        name: name || repo,
        repository: repo.includes('://') ? '' : repo,
        manifestUrl: repo.includes('://') ? repo : '',
        defaultReleaseType: channel
      });

      if (added) {
        if (nameInput) nameInput.value = '';
        if (repoInput) repoInput.value = '';
        drawer.classList.add('hidden');
        await selectPatchSource(added.id);
        renderWizardSourceStep();
      }
    };
  }

  if (btnReset) {
    btnReset.onclick = async () => {
      if (confirm('Reset seluruh daftar sumber kembali ke 8 sumber bawaan resmi?')) {
        resetSourcesToDefault();
        await selectPatchSource('anddea');
        renderWizardSourceStep();
      }
    };
  }
}

function renderWizardReleaseStudio() {
  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const releases = (STATE.patchReleases && STATE.patchReleases.length > 0)
    ? STATE.patchReleases
    : (activeSrc?.fallbackTags || []);

  const latestPre = releases.find(r => r.prerelease);
  const latestStable = releases.find(r => !r.prerelease);

  // Active Tag Determination
  const currentTag = STATE.patchTag || (STATE.preReleasePatches ? 'dev' : 'latest');
  const isDev = currentTag === 'dev';
  const isStable = currentTag === 'latest';
  const isSpecificTag = !isDev && !isStable;

  // Active Label in Studio Header
  const activeLabel = document.getElementById('studioActiveLabel');
  if (activeLabel) {
    if (isDev) {
      activeLabel.textContent = `⚡ Saluran Dev ${latestPre ? `(${latestPre.tag_name})` : ''}`;
    } else if (isStable) {
      activeLabel.textContent = `🛡️ Saluran Stable ${latestStable ? `(${latestStable.tag_name})` : ''}`;
    } else {
      activeLabel.textContent = `🏷️ Tag: ${currentTag}`;
    }
  }

  // Segment Cards
  const segDev = document.getElementById('segmentDev');
  const segStable = document.getElementById('segmentStable');
  const segTags = document.getElementById('segmentTags');
  const tagsBrowser = document.getElementById('studioTagsBrowser');

  if (segDev) {
    segDev.classList.toggle('active', isDev);
    segDev.setAttribute('aria-checked', isDev ? 'true' : 'false');
    const chk = segDev.querySelector('.segment-check');
    if (chk) chk.textContent = isDev ? '✓' : '';
    segDev.onclick = () => {
      STATE.patchTag = 'dev';
      STATE.preReleasePatches = true;
      syncReleaseChannelSelection('dev');
      renderWizardReleaseStudio();
    };
  }

  if (segStable) {
    segStable.classList.toggle('active', isStable);
    segStable.setAttribute('aria-checked', isStable ? 'true' : 'false');
    const chk = segStable.querySelector('.segment-check');
    if (chk) chk.textContent = isStable ? '✓' : '';
    segStable.onclick = () => {
      STATE.patchTag = 'latest';
      STATE.preReleasePatches = false;
      syncReleaseChannelSelection('latest');
      renderWizardReleaseStudio();
    };
  }

  if (segTags) {
    segTags.classList.toggle('active', isSpecificTag);
    segTags.setAttribute('aria-checked', isSpecificTag ? 'true' : 'false');
    const chk = segTags.querySelector('.segment-check');
    if (chk) chk.textContent = isSpecificTag ? '✓' : '';
    segTags.onclick = () => {
      if (tagsBrowser) tagsBrowser.classList.toggle('hidden');
    };
  }

  if (tagsBrowser) {
    if (isSpecificTag) {
      tagsBrowser.classList.remove('hidden');
    }
  }

  // Populate Tags Browser List
  const tagsListContainer = document.getElementById('studioTagsList');
  if (tagsListContainer) {
    tagsListContainer.innerHTML = '';

    if (releases.length === 0) {
      tagsListContainer.innerHTML = '<div class="studio-tag-item"><span class="morphe-muted-hint">Tidak ada riwayat tag rilis untuk sumber ini.</span></div>';
    } else {
      releases.slice(0, 10).forEach(rel => {
        const tagName = rel.tag_name || rel.name;
        const isSelected = STATE.patchTag === tagName;
        const isPre = !!rel.prerelease;
        const badgeClass = isPre ? 'badge-source-daily' : 'badge-source-upstream';
        const dateStr = rel.published_at ? formatDate(rel.published_at) : 'Rilis Baru';

        const row = document.createElement('div');
        row.className = `studio-tag-item ${isSelected ? 'active' : ''}`;
        row.setAttribute('role', 'radio');
        row.setAttribute('aria-checked', isSelected ? 'true' : 'false');

        row.innerHTML = `
          <div class="studio-tag-left">
            <span class="studio-tag-name">${escapeHtml(tagName)}</span>
            <span class="studio-tag-badge ${badgeClass}">${isPre ? 'Pre' : 'Stable'}</span>
            <span class="studio-tag-date">${escapeHtml(dateStr)}</span>
          </div>
          <div class="studio-tag-right">
            <button type="button" class="btn-tag-info" title="Lihat catatan rilis untuk tag ${escapeHtml(tagName)}">ℹ</button>
            <span class="segment-check">${isSelected ? '✓' : ''}</span>
          </div>
        `;

        row.addEventListener('click', (e) => {
          if (e.target.closest('.btn-tag-info')) {
            e.stopPropagation();
            showPatchNotesModal(tagName);
            return;
          }
          STATE.patchTag = tagName;
          syncReleaseChannelSelection(tagName);
          renderWizardReleaseStudio();
        });

        tagsListContainer.appendChild(row);
      });
    }
  }

  // Refresh Tags Button
  const btnRefresh = document.getElementById('btnStudioRefreshTags');
  if (btnRefresh) {
    btnRefresh.onclick = async () => {
      btnRefresh.disabled = true;
      btnRefresh.style.opacity = '0.5';
      await loadPatchReleases(activeSrc);
      renderWizardReleaseStudio();
      btnRefresh.disabled = false;
      btnRefresh.style.opacity = '1';
    };
  }

  // Manual Custom Tag Apply
  const btnApplyTag = document.getElementById('btnStudioApplyCustomTag');
  const inputTag = document.getElementById('inputStudioCustomTag');
  if (btnApplyTag && inputTag) {
    btnApplyTag.onclick = () => {
      const val = inputTag.value.trim();
      if (!val) return;
      STATE.patchTag = val;
      syncReleaseChannelSelection(val);
      renderWizardReleaseStudio();
      inputTag.value = '';
    };
  }
}

function syncReleaseChannelSelection(tagVal) {
  const wizSelect = document.getElementById('wizardPatchReleaseSelect');
  const mainSelect = document.getElementById('selectPatchRelease');
  if (wizSelect) wizSelect.value = tagVal;
  if (mainSelect) mainSelect.value = tagVal;
  const versionEl = document.getElementById('sourceSheetVersion');
  if (versionEl) versionEl.textContent = tagVal;
  syncAllSummaries();
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Terbaru';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (_) {
    return 'Terbaru';
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
