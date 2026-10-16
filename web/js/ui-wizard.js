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

  // M3 Minimalist Stepper Update
  const m3Bar = document.getElementById('wizardProgressBar');
  if (m3Bar) {
    m3Bar.style.width = `${step * 20}%`;
  }
  const stepCounter = document.getElementById('wizardStepCounter');
  if (stepCounter) {
    stepCounter.textContent = `${step} / 5`;
  }
  const stepTitle = document.getElementById('wizardStepTitle');
  if (stepTitle) {
    if (step === 1) {
      stepTitle.textContent = 'Pilih Aplikasi';
    } else {
      stepTitle.textContent = (STATE.currentApp && (STATE.currentApp.name || STATE.currentApp.appName)) || 'YouTube';
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
  const targetPkg = STATE.currentApp ? STATE.currentApp.packageName : 'com.google.android.youtube';
  const targetAppName = STATE.currentApp ? STATE.currentApp.name : 'YouTube';
  const appLabel = document.getElementById('step2TargetAppName');
  if (appLabel) appLabel.textContent = targetAppName;

  const container = document.getElementById('wizardSourcesGrid');
  if (!container) return;
  container.innerHTML = '';

  const compatibleSources = STATE.sources.filter(s => isSourceCompatibleWithApp(s.id, targetPkg));
  const countBadge = document.getElementById('wizardSourcesCountBadge');
  if (countBadge) {
    countBadge.textContent = `${compatibleSources.length} sumber kompatibel`;
  }

  // Ensure active source is compatible; if not, auto-fallback to first compatible source
  if (!isSourceCompatibleWithApp(STATE.currentSource, targetPkg)) {
    const firstCompat = compatibleSources[0] || STATE.sources[0];
    if (firstCompat && firstCompat.id !== STATE.currentSource) {
      STATE.currentSource = firstCompat.id;
      localStorage.setItem('rvx_active_source', firstCompat.id);
      loadPatchReleases(firstCompat);
    }
  }

  // Sort sources: compatible ones first
  const sortedSources = [...STATE.sources].sort((a, b) => {
    const compA = isSourceCompatibleWithApp(a.id, targetPkg);
    const compB = isSourceCompatibleWithApp(b.id, targetPkg);
    if (compA !== compB) return compA ? -1 : 1;
    return 0;
  });

  sortedSources.forEach(src => {
    const isCompat = isSourceCompatibleWithApp(src.id, targetPkg);
    const isActive = src.id === STATE.currentSource;
    const displayName = getSourceDisplayName(src.id);
    const repoText = src.repository || (src.manifestUrl ? 'Manifest URL' : `${src.id}/patches`);
    const isDeletable = !src.isPreinstalled && !src.isDefault;
    const isRecommended = src.id === 'anddea' || src.badge === 'Recommended';

    const item = document.createElement('div');
    item.className = `wizard-source-item ${isActive ? 'active' : ''} ${!isCompat ? 'incompatible' : ''}`;
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', isActive ? 'true' : 'false');
    item.tabIndex = isCompat ? 0 : -1;
    if (!isCompat) {
      item.style.opacity = '0.45';
      item.style.filter = 'grayscale(0.6)';
    }

    let tagHtml = '';
    if (isCompat) {
      tagHtml = isRecommended ? '<span class="source-item-tag tag-rec">Default</span>' : '<span class="source-item-tag tag-rec" style="background:rgba(56,189,248,0.15);color:#38BDF8;">Kompatibel</span>';
    } else {
      tagHtml = '<span class="source-item-tag" style="background:rgba(239,68,68,0.15);color:#FCA5A5;">Tidak Kompatibel</span>';
    }

    item.innerHTML = `
      <div class="source-item-radio">
        ${isActive ? '<span class="source-radio-dot"></span>' : ''}
      </div>
      <div class="source-item-main">
        <div class="source-item-title-row">
          <span class="source-item-name">${escapeHtml(src.name || displayName)}</span>
          ${tagHtml}
          ${isDeletable ? '<span class="source-item-tag tag-custom">Custom</span>' : ''}
        </div>
        <span class="source-item-repo">${escapeHtml(repoText)}</span>
      </div>
      ${isDeletable ? `
        <button type="button" class="btn-delete-custom-src" title="Hapus sumber ini">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      ` : (isActive ? '<span class="source-check-icon" style="color:#38BDF8;font-size:15px;font-weight:700;margin-left:auto;">✓</span>' : '')}
    `;

    item.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-delete-custom-src')) {
        e.stopPropagation();
        if (confirm(`Hapus sumber "${src.name || displayName}"?`)) {
          deleteCustomSource(src.id);
          await selectPatchSource(STATE.currentSource);
          renderWizardSourceStep();
        }
        return;
      }
      if (!isCompat) {
        alert(`Sumber "${src.name || displayName}" tidak mendukung ${targetAppName}. Silakan pilih sumber yang kompatibel.`);
        return;
      }
      await selectPatchSource(src.id);
      renderWizardSourceStep();
    });

    container.appendChild(item);
  });

  bindWizardSourceToolbar();
  renderStep2ChannelSection();
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
      const name = nameInput ? nameInput.value.trim() : '';
      const repo = repoInput ? repoInput.value.trim() : '';

      if (!repo) {
        alert('Harap masukkan repositori GitHub (owner/repo) atau URL manifest raw.');
        return;
      }

      const added = addCustomSource({
        name: name || repo,
        repository: repo.includes('://') ? '' : repo,
        manifestUrl: repo.includes('://') ? repo : '',
        defaultReleaseType: 'latest'
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
      if (confirm('Reset seluruh daftar sumber kembali ke bawaan resmi?')) {
        resetSourcesToDefault();
        await selectPatchSource('anddea');
        renderWizardSourceStep();
      }
    };
  }
}

function renderStep2ChannelSection() {
  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const releases = (STATE.patchReleases && STATE.patchReleases.length > 0)
    ? STATE.patchReleases
    : (activeSrc?.fallbackTags || []);

  const currentTag = STATE.patchTag || 'latest';
  const isLatest = currentTag === 'latest';

  const btnLatest = document.getElementById('btnChannelLatest');
  const btnCustom = document.getElementById('btnChannelCustom');
  const statusChip = document.getElementById('step2ActiveChannelTag');
  const badgeCurrentTag = document.getElementById('badgeCurrentTag');
  const subtextCustom = document.getElementById('subtextChannelCustom');

  if (btnLatest) {
    btnLatest.classList.toggle('active', isLatest);
    btnLatest.setAttribute('aria-checked', isLatest ? 'true' : 'false');
    btnLatest.onclick = () => {
      STATE.patchTag = 'latest';
      STATE.preReleasePatches = false;
      renderStep2ChannelSection();
      syncReleaseChannelSelection('latest');
    };
  }

  if (btnCustom) {
    btnCustom.classList.toggle('active', !isLatest);
    btnCustom.setAttribute('aria-checked', !isLatest ? 'true' : 'false');
    btnCustom.onclick = () => {
      openPatchTagPickerModal();
    };
  }

  if (badgeCurrentTag) {
    if (!isLatest) {
      badgeCurrentTag.textContent = currentTag;
      badgeCurrentTag.classList.remove('hidden');
    } else {
      badgeCurrentTag.classList.add('hidden');
    }
  }

  if (subtextCustom) {
    subtextCustom.textContent = !isLatest
      ? `Versi aktif: ${currentTag}`
      : 'Pilih versi tag tertentu atau pre-release';
  }

  if (statusChip) {
    if (isLatest) {
      const latestStable = releases.find(r => !r.prerelease);
      statusChip.textContent = `Terbaru (Stable${latestStable ? ` • ${latestStable.tag_name}` : ''})`;
    } else {
      statusChip.textContent = `Kustom (${currentTag})`;
    }
  }

  bindPatchTagPickerModalEvents();
}

let tagPickerFilter = 'all';
let tagPickerSearch = '';
let tagPickerEventsBound = false;

function bindPatchTagPickerModalEvents() {
  if (tagPickerEventsBound) return;
  tagPickerEventsBound = true;

  const modal = document.getElementById('modalPatchTagPicker');
  const btnClose = document.getElementById('btnCloseTagPicker');
  const btnApplyManual = document.getElementById('btnApplyManualTag');
  const inputManual = document.getElementById('inputManualTag');
  const btnToggleManual = document.getElementById('btnToggleManualTag');
  const drawerManual = document.getElementById('drawerManualTag');
  const iconToggleManual = document.getElementById('manualToggleIcon');
  const searchInput = document.getElementById('inputSearchPatchTag');
  const filterPills = document.querySelectorAll('.tag-filter-pill');

  if (btnClose && modal) {
    btnClose.onclick = () => modal.classList.add('hidden');
  }

  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };
  }

  if (btnToggleManual && drawerManual) {
    btnToggleManual.onclick = () => {
      const isHidden = drawerManual.classList.toggle('hidden');
      if (iconToggleManual) iconToggleManual.textContent = isHidden ? '▾' : '▴';
    };
  }

  if (btnApplyManual && inputManual) {
    btnApplyManual.onclick = () => {
      const val = inputManual.value.trim();
      if (!val) return;
      STATE.patchTag = val;
      if (modal) modal.classList.add('hidden');
      renderStep2ChannelSection();
      syncReleaseChannelSelection(val);
      inputManual.value = '';
    };
  }

  if (searchInput) {
    searchInput.oninput = (e) => {
      tagPickerSearch = e.target.value.toLowerCase().trim();
      renderFilteredTagsList();
    };
  }

  filterPills.forEach(pill => {
    pill.onclick = () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      tagPickerFilter = pill.dataset.filter || 'all';
      renderFilteredTagsList();
    };
  });
}

function renderFilteredTagsList() {
  const listContainer = document.getElementById('modalTagsList');
  if (!listContainer) return;
  const modal = document.getElementById('modalPatchTagPicker');

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const releases = (STATE.patchReleases && STATE.patchReleases.length > 0)
    ? STATE.patchReleases
    : (activeSrc?.fallbackTags || []);

  const filtered = releases.filter(rel => {
    const tagName = (rel.tag_name || rel.name || '').toLowerCase();
    const isPre = !!rel.prerelease;

    if (tagPickerFilter === 'stable' && isPre) return false;
    if (tagPickerFilter === 'pre' && !isPre) return false;
    if (tagPickerSearch && !tagName.includes(tagPickerSearch)) return false;
    return true;
  });

  listContainer.innerHTML = '';
  if (filtered.length === 0) {
    listContainer.innerHTML = '<div class="tag-picker-item" style="justify-content:center;color:#94A3B8;padding:24px 12px;"><span class="morphe-muted-hint">Tidak ada rilis yang cocok dengan filter atau pencarian.</span></div>';
    return;
  }

  filtered.slice(0, 30).forEach(rel => {
    const tagName = rel.tag_name || rel.name;
    const isPre = !!rel.prerelease;
    const isSelected = STATE.patchTag === tagName;
    const dateStr = rel.published_at ? formatDate(rel.published_at) : 'Rilis Baru';

    const row = document.createElement('div');
    row.className = `tag-picker-item ${isSelected ? 'active' : ''}`;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', isSelected ? 'true' : 'false');

    row.innerHTML = `
      <div class="tag-item-radio">
        ${isSelected ? '<span class="source-radio-dot"></span>' : ''}
      </div>
      <div class="tag-item-info">
        <div class="tag-item-name-row">
          <span class="tag-item-name">${escapeHtml(tagName)}</span>
          <span class="tag-simple-badge ${isPre ? 'badge-pre' : 'badge-stable'}">${isPre ? 'Pre-release' : 'Stable'}</span>
        </div>
        <span class="tag-item-date">${escapeHtml(dateStr)}</span>
      </div>
      <button type="button" class="btn-tag-changelog" title="Catatan rilis untuk ${escapeHtml(tagName)}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span>Changelog</span>
      </button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-tag-changelog')) {
        e.stopPropagation();
        showPatchNotesModal(tagName);
        return;
      }
      STATE.patchTag = tagName;
      STATE.preReleasePatches = isPre;
      if (modal) modal.classList.add('hidden');
      renderStep2ChannelSection();
      syncReleaseChannelSelection(tagName);
    });

    listContainer.appendChild(row);
  });
}

function openPatchTagPickerModal() {
  const modal = document.getElementById('modalPatchTagPicker');
  const titleEl = document.getElementById('modalTagPickerTitle');
  const subEl = document.getElementById('modalTagPickerSub');
  const searchInput = document.getElementById('inputSearchPatchTag');

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const releases = (STATE.patchReleases && STATE.patchReleases.length > 0)
    ? STATE.patchReleases
    : (activeSrc?.fallbackTags || []);

  if (titleEl) titleEl.textContent = 'Pilih Versi Patch';
  if (subEl) subEl.textContent = `Sumber: ${activeSrc.name || getSourceDisplayName(activeSrc.id)} • ${releases.length} rilis tersedia`;

  tagPickerFilter = 'all';
  tagPickerSearch = '';
  if (searchInput) searchInput.value = '';

  const filterPills = document.querySelectorAll('.tag-filter-pill');
  filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));

  bindPatchTagPickerModalEvents();
  renderFilteredTagsList();

  if (modal) modal.classList.remove('hidden');
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

  const masterApps = typeof getAllSupportedApps === 'function' ? getAllSupportedApps() : [];
  const apps = (STATE.availableApps && STATE.availableApps.length >= masterApps.length)
    ? STATE.availableApps
    : (masterApps.length > 0 ? masterApps : (STATE.availableApps || []));

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

    card.innerHTML = `
      <div class="yt-card-icon" style="background:${app.accentColor || '#B42323'};">
        ${app.iconSvg}
      </div>
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 class="yt-card-title">${escapeHtml(app.name)}</h3>
          ${isConfigured ? '<span class="badge-configured">Terkonfigurasi</span>' : ''}
        </div>
        <p class="yt-card-sub">${app.patchCount} patches • ${app.sourcesCount || 1} sumber</p>
      </div>
      <div class="app-card-arrow">›</div>
    `;

    card.addEventListener('click', async () => {
      selectApp(app.packageName);
      // Auto-switch to compatible source if current one does not support this app
      if (!isSourceCompatibleWithApp(STATE.currentSource, app.packageName)) {
        const bestSrc = STATE.sources.find(s => isSourceCompatibleWithApp(s.id, app.packageName));
        if (bestSrc) {
          await selectPatchSource(bestSrc.id);
        }
      }
      // Load saved app config if exists
      const saved = getAppConfig(app.packageName);
      if (saved) {
        if (saved.targetVersion) STATE.currentVersion = saved.targetVersion;
        if (saved.mode) STATE.targetMode = saved.mode;
      }
      goToWizardStep(2);
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
  bindModeSwitcherEvents();
  renderMorphePatchList();
}

function bindModeSwitcherEvents() {
  const cardRoot = document.getElementById('modeCardRoot');
  const cardNonRoot = document.getElementById('modeCardNonRoot');
  if (cardRoot) cardRoot.onclick = () => setTargetMode('root');
  if (cardNonRoot) cardNonRoot.onclick = () => setTargetMode('non-root');
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

    const chkRoot = cardRoot.querySelector('.m3-mode-segment-check') || cardRoot.querySelector('.source-card-check');
    const chkNon = cardNonRoot.querySelector('.m3-mode-segment-check') || cardNonRoot.querySelector('.source-card-check');
    if (chkRoot) chkRoot.textContent = isRoot ? '✓' : '';
    if (chkNon) chkNon.textContent = !isRoot ? '✓' : '';
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

  const masterApps = typeof getAllSupportedApps === 'function' ? getAllSupportedApps() : [];
  const apps = (STATE.availableApps && STATE.availableApps.length >= masterApps.length)
    ? STATE.availableApps
    : (masterApps.length > 0 ? masterApps : (STATE.availableApps || []));
  apps.forEach(app => {
    const isConfigured = isAppConfigured(app.packageName);
    const savedConfig = getAppConfig(app.packageName);
    const card = document.createElement('div');
    card.className = 'morphe-app-card';

    const statusBadge = isConfigured
      ? `<span class="badge-configured">Terkonfigurasi</span>`
      : `<span class="badge-needs-setup">+ Setup</span>`;

    const subText = isConfigured
      ? `v${savedConfig.targetVersion || app.recommendedVersion} • ${savedConfig.mode === 'root' ? 'Mode Root' : 'Non-Root'} (${savedConfig.selectedPatches?.length || app.patchCount} patches)`
      : `v${app.recommendedVersion} • ${app.patchCount} patches • ${app.sourcesCount || 1} sumber`;

    card.innerHTML = `
      <div class="yt-card-icon" style="background:${app.accentColor || '#B42323'};">
        ${app.iconSvg}
      </div>
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 class="yt-card-title">${escapeHtml(app.name)}</h3>
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
