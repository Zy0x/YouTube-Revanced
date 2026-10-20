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

let wizardSourcePickerFilter = 'compatible';
let wizardSourcePickerSearch = '';
let wizardSourcePickerEventsBound = false;
let wizardAppSearchQuery = '';
let wizardAppSearchEventsBound = false;
let wizardAppSearchTimer = null;
let wizardAppListObserver = null;
let appIconObserver = null;
let homeAppListObserver = null;
const WIZARD_APP_BATCH_SIZE = 32;

function renderAppIcon(app) {
  const packageName = String(app?.packageName || '').trim();
  const iconUrl = app?.iconUrl || `${STATE.daemonUrl}/api/v1/apps/icon?package=${encodeURIComponent(packageName)}`;
  return `
    <div class="yt-card-icon app-icon-shell" style="background:${app?.accentColor || '#273244'};">
      <span class="app-icon-fallback" aria-hidden="true">${app?.iconSvg || GENERIC_APP_SVG}</span>
      <img class="app-icon-image" data-app-icon data-src="${escapeHtml(iconUrl)}" alt="" loading="lazy" decoding="async">
    </div>
  `;
}

function formatAppCoverage(app) {
  const sourceCount = app?.sourcesCount || 1;
  if (app?.catalogCoverageUnknown) return `${sourceCount} sumber patch`;
  return `${app?.patchCount || 0} patches • ${sourceCount} sumber`;
}

function hydrateAppIcons(root) {
  if (!appIconObserver && 'IntersectionObserver' in window) {
    appIconObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const image = entry.target;
        appIconObserver.unobserve(image);
        if (image.dataset.src) {
          image.src = image.dataset.src;
          delete image.dataset.src;
        }
      });
    }, { rootMargin: '120px 0px' });
  }

  root.querySelectorAll('img[data-app-icon][data-src]').forEach(image => {
    const settle = () => {
      if (image.complete && image.naturalWidth > 0) {
        image.closest('.app-icon-shell')?.classList.add('has-image');
      } else if (image.complete) {
        image.remove();
      }
    };
    image.addEventListener('load', settle, { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    if (appIconObserver) {
      appIconObserver.observe(image);
    } else {
      image.src = image.dataset.src;
      delete image.dataset.src;
    }
  });
}

function createWizardAppCard(app) {
  const isSelected = STATE.currentApp && STATE.currentApp.packageName === app.packageName;
  const isConfigured = isAppConfigured(app.packageName);
  const card = document.createElement('div');
  card.className = `morphe-app-card ${isSelected ? 'active-app' : ''}`;
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

  card.innerHTML = `
    ${renderAppIcon(app)}
    <div class="yt-card-text">
      <div style="display: flex; align-items: center; gap: 8px;">
        <h3 class="yt-card-title">${escapeHtml(app.name)}</h3>
        ${isConfigured ? '<span class="badge-configured">Terkonfigurasi</span>' : ''}
      </div>
      <p class="yt-card-sub">${formatAppCoverage(app)}</p>
    </div>
    <div class="app-card-arrow">›</div>
  `;

  card.addEventListener('click', async () => {
    STATE.currentSource = null;
    STATE.patchTag = '';
    STATE.patchReleases = [];
    STATE.channelLoading = false;
    STATE.channelLoadToken += 1;
    STATE.currentVersion = '';
    STATE.targetMode = null;
    STATE.modeEditorExpanded = true;
    STATE.selectedPatches.clear();
    selectApp(app.packageName);
    goToWizardStep(2);
  });

  return card;
}

function appendWizardAppBatch(container, apps) {
  container.querySelector('.wizard-app-load-more')?.remove();
  if (wizardAppListObserver) {
    wizardAppListObserver.disconnect();
    wizardAppListObserver = null;
  }

  const start = Number(container.dataset.renderedApps || 0);
  const end = Math.min(start + WIZARD_APP_BATCH_SIZE, apps.length);
  const fragment = document.createDocumentFragment();
  apps.slice(start, end).forEach(app => fragment.appendChild(createWizardAppCard(app)));
  container.appendChild(fragment);
  hydrateAppIcons(container);
  container.dataset.renderedApps = String(end);

  if (end >= apps.length) return;

  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'wizard-app-load-more';
  loadMore.textContent = `Muat berikutnya · ${apps.length - end} tersisa`;
  const appendNext = () => appendWizardAppBatch(container, apps);
  loadMore.addEventListener('click', appendNext, { once: true });
  container.appendChild(loadMore);

  if ('IntersectionObserver' in window) {
    wizardAppListObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) appendNext();
    }, {
      root: container.closest('.wizard-pane-scrollable'),
      rootMargin: '240px 0px'
    });
    wizardAppListObserver.observe(loadMore);
  }
}

function renderWizardSourceStep() {
  const targetPkg = STATE.currentApp?.packageName || '';
  const targetAppName = STATE.currentApp?.name || 'Belum dipilih';
  const appLabel = document.getElementById('step2TargetAppName');
  if (appLabel) appLabel.textContent = targetAppName;

  renderWizardActiveSource();
  renderWizardSourcePickerList();
  bindWizardSourceToolbar();
  renderStep2ChannelSection();
}

function renderWizardActiveSource() {
  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource);
  const targetPkg = STATE.currentApp?.packageName || '';
  const avatar = document.getElementById('step2SourceAvatar');
  const name = document.getElementById('step2SourceName');
  const repo = document.getElementById('step2SourceRepo');
  const status = document.getElementById('step2SourceStatus');
  const pickerSub = document.getElementById('modalWizardSourceSub');

  if (!activeSrc) {
    if (avatar) {
      avatar.textContent = '—';
      avatar.style.background = '#2b2824';
    }
    if (name) name.textContent = 'Pilih sumber patch';
    if (repo) repo.textContent = 'Belum ada sumber yang dipilih';
    if (status) status.textContent = '';
    const compatibleCount = STATE.sources.filter(source => isSourceCompatibleWithApp(source.id, targetPkg)).length;
    if (pickerSub) pickerSub.textContent = `${compatibleCount} sumber kompatibel • ${targetPkg}`;
    updateWizardNavigationState();
    return;
  }

  const displayName = activeSrc.name || getSourceDisplayName(activeSrc.id);
  const repoText = activeSrc.repository || (activeSrc.manifestUrl ? 'Manifest URL' : `${activeSrc.id}/patches`);

  if (avatar) {
    avatar.textContent = activeSrc.avatarText || displayName.charAt(0).toUpperCase();
    avatar.style.background = activeSrc.avatarColor || '#3182CE';
  }
  if (name) name.textContent = displayName;
  if (repo) repo.textContent = repoText;
  const verified = STATE.sourceManifestStatus[activeSrc.id]?.status === 'ready';
  const manifestCompatible = isSourceCompatibleWithApp(activeSrc.id, targetPkg);
  const bundleReady = activeSrc.bundleStatus === 'ready';
  const isUsable = manifestCompatible && bundleReady;
  const sourceStatus = STATE.sourceManifestStatus[activeSrc.id]?.status;
  const statusText = isUsable ? 'Kompatibel'
    : manifestCompatible && activeSrc.bundleStatus === 'unverified' ? 'Cocok · rilis belum terverifikasi'
      : manifestCompatible && activeSrc.bundleStatus === 'missing' ? 'Cocok · bundle .mpp tidak ada'
    : activeSrc.bundleStatus === 'unsupported' ? 'Format patch tidak didukung'
      : activeSrc.bundleStatus === 'unverified' ? 'Rilis belum dapat diverifikasi'
        : activeSrc.bundleStatus === 'missing' ? 'Bundle patch tidak tersedia'
        : verified ? 'Tidak kompatibel' : sourceStatus === 'error' ? 'Manifest gagal dimuat' : 'Tidak terverifikasi';
  if (status) status.textContent = `${statusText}${activeSrc.isPreinstalled === false ? ' · Kustom' : ''}`;
  const compatibleCount = STATE.sources.filter(source => isSourceCompatibleWithApp(source.id, targetPkg)).length;
  if (pickerSub) pickerSub.textContent = `${STATE.currentApp?.name || targetPkg} · ${compatibleCount} source kompatibel`;
  const nextButton = document.getElementById('btnWizStep2Next');
  if (nextButton) {
    const canContinue = isUsable && Boolean(STATE.patchTag) && !STATE.channelLoading;
    nextButton.disabled = !canContinue;
    nextButton.title = canContinue ? '' : STATE.channelLoading
      ? 'Sedang memverifikasi metadata source terpilih'
      : 'Pilih sumber kompatibel dan saluran rilis terlebih dahulu';
  }
}

function renderWizardSourcePickerList() {
  const container = document.getElementById('wizardSourcesGrid');
  if (!container) return;

  const targetPkg = STATE.currentApp?.packageName || '';
  const normalizedSearch = wizardSourcePickerSearch.toLowerCase();
  const matchingSources = STATE.sources.filter(src => {
    const verification = STATE.sourceManifestStatus[src.id]?.status;
    const isVerified = verification === 'ready';
    const manifestCompatible = isVerified && isSourceCompatibleWithApp(src.id, targetPkg);
    const isCustom = !src.isPreinstalled && !src.isDefault;
    if (wizardSourcePickerFilter === 'compatible' && !manifestCompatible) return false;
    if (wizardSourcePickerFilter === 'custom' && !isCustom) return false;
    if (!normalizedSearch) return true;
    const haystack = [src.name, src.id, src.repository, src.manifestUrl].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  matchingSources.sort((a, b) => {
    if (a.id === STATE.currentSource) return -1;
    if (b.id === STATE.currentSource) return 1;
    const readyA = a.bundleStatus === 'ready' && isSourceCompatibleWithApp(a.id, targetPkg);
    const readyB = b.bundleStatus === 'ready' && isSourceCompatibleWithApp(b.id, targetPkg);
    if (readyA !== readyB) return Number(readyB) - Number(readyA);
    const compatibleA = STATE.sourceManifestStatus[a.id]?.status === 'ready' && isSourceCompatibleWithApp(a.id, targetPkg);
    const compatibleB = STATE.sourceManifestStatus[b.id]?.status === 'ready' && isSourceCompatibleWithApp(b.id, targetPkg);
    return Number(compatibleB) - Number(compatibleA);
  });

  container.innerHTML = '';
  if (matchingSources.length === 0) {
    const emptyMessage = wizardSourcePickerFilter === 'compatible'
      ? 'Tidak ada sumber yang terverifikasi kompatibel untuk aplikasi ini.'
      : 'Tidak ada sumber yang cocok dengan pencarian.';
    container.innerHTML = `<div class="wizard-source-empty">${emptyMessage}</div>`;
    return;
  }

  matchingSources.forEach(src => {
    const verification = STATE.sourceManifestStatus[src.id]?.status;
    const isVerified = verification === 'ready';
    const manifestCompatible = isVerified && isSourceCompatibleWithApp(src.id, targetPkg);
    const isCompatible = manifestCompatible && src.bundleStatus === 'ready';
    const isActive = src.id === STATE.currentSource;
    const isCustom = !src.isPreinstalled && !src.isDefault;
    const displayName = src.name || getSourceDisplayName(src.id);
    const repoText = src.repository || src.manifestUrl || '';
    const latestRelease = STATE.sourceReleases[src.id]?.[0];
    const releaseDate = latestRelease?.published_at ? formatCompactReleaseDate(latestRelease.published_at) : '';
    const latestName = latestRelease?.tag_name || latestRelease?.name || '';
    const releaseMeta = latestRelease && latestName
      ? `Rilis ${latestName}${releaseDate ? ` · ${releaseDate}` : ''}`
      : '';
    const compatibilityLabel = isCompatible
      ? 'Kompatibel'
      : manifestCompatible && src.bundleStatus === 'unverified' ? 'Cocok · rilis belum terverifikasi'
        : manifestCompatible && src.bundleStatus === 'missing' ? 'Cocok · bundle .mpp tidak ada'
        : src.bundleStatus === 'unsupported' ? 'Format tidak didukung'
        : src.bundleStatus === 'unverified' ? 'Rilis belum terverifikasi'
        : src.bundleStatus === 'missing' ? 'Bundle tidak tersedia'
          : isVerified ? 'Tidak kompatibel' : verification === 'error' ? 'Manifest gagal dimuat' : 'Memeriksa…';
    const item = document.createElement('div');
    item.className = `wizard-source-item ${isActive ? 'active' : ''} ${!isCompatible ? 'incompatible' : ''}`;
    item.setAttribute('role', 'presentation');

    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'wizard-source-select';
    choose.setAttribute('role', 'radio');
    choose.setAttribute('aria-checked', String(isActive));
    choose.disabled = !isCompatible;
    choose.setAttribute('aria-label', `${displayName}, ${compatibilityLabel.toLowerCase()} dengan aplikasi ini`);
    if (verification === 'error') choose.title = STATE.sourceManifestStatus[src.id]?.error || 'Manifest sumber tidak dapat dimuat';
    choose.innerHTML = `
      <span class="source-item-radio" aria-hidden="true">${isActive ? '<span class="source-radio-dot"></span>' : ''}</span>
      <span class="source-item-main">
        <span class="source-item-title-row">
          <span class="source-item-name">${escapeHtml(displayName)}</span>
        <span class="source-item-tag ${isCompatible ? 'tag-rec' : manifestCompatible ? 'tag-unverified' : isVerified ? 'tag-incompatible' : 'tag-unverified'}">${compatibilityLabel}</span>
          ${isCustom ? '<span class="source-item-tag tag-custom">Kustom</span>' : ''}
        </span>
        <span class="source-item-repo">${escapeHtml(repoText)}</span>
        ${releaseMeta ? `<span class="source-item-latest">${escapeHtml(releaseMeta)}</span>` : ''}
      </span>
      ${isActive ? '<span class="source-check-icon" aria-hidden="true">✓</span>' : '<span class="summary-card-chevron" aria-hidden="true">›</span>'}
    `;
    choose.addEventListener('click', async () => {
      if (!isCompatible) return;
      document.getElementById('modalWizardSourcePicker')?.classList.add('hidden');
      await selectPatchSource(src.id);
      renderWizardSourceStep();
    });
    item.appendChild(choose);

    if (isCustom) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn-delete-custom-src';
      deleteButton.title = `Hapus sumber ${displayName}`;
      deleteButton.setAttribute('aria-label', `Hapus sumber ${displayName}`);
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      deleteButton.addEventListener('click', async () => {
        if (!confirm(`Hapus sumber "${displayName}"?`)) return;
        deleteCustomSource(src.id);
        if (STATE.currentSource) await selectPatchSource(STATE.currentSource);
        renderWizardSourceStep();
      });
      item.appendChild(deleteButton);
    }

    container.appendChild(item);
  });
}

function bindWizardSourceToolbar() {
  const drawer = document.getElementById('wizAddSourceDrawer');
  const btnToggle = document.getElementById('btnWizToggleAddSource');
  const btnClose = document.getElementById('btnWizCloseAddSource');
  const btnCancel = document.getElementById('btnWizCancelAddSource');
  const btnSave = document.getElementById('btnWizSaveCustomSource');
  const btnReset = document.getElementById('btnWizResetSources');
  const modal = document.getElementById('modalWizardSourcePicker');
  const openButton = document.getElementById('btnOpenWizardSourcePicker');
  const closeButton = document.getElementById('btnCloseWizardSourcePicker');

  if (openButton && modal) {
    openButton.onclick = () => {
      wizardOverlayReturnFocus = openButton;
      wizardSourcePickerFilter = 'compatible';
      wizardSourcePickerSearch = '';
      const input = document.getElementById('inputSearchWizardSource');
      if (input) input.value = '';
      document.querySelectorAll('.source-filter-pill').forEach(pill => {
        const selected = pill.dataset.filter === 'compatible';
        pill.classList.toggle('active', selected);
        pill.setAttribute('aria-selected', String(selected));
      });
      renderWizardSourcePickerList();
      modal.classList.remove('hidden');
      requestAnimationFrame(() => document.getElementById('modalWizardSourceTitle')?.focus());
    };
  }
  const closePicker = () => {
    modal?.classList.add('hidden');
    requestAnimationFrame(() => wizardOverlayReturnFocus?.focus());
  };
  if (closeButton && modal) closeButton.onclick = closePicker;
  if (modal) {
    modal.onclick = event => {
      if (event.target === modal) closePicker();
    };
  }

  if (!wizardSourcePickerEventsBound) {
    wizardSourcePickerEventsBound = true;
    document.getElementById('inputSearchWizardSource')?.addEventListener('input', event => {
      wizardSourcePickerSearch = event.target.value.trim();
      renderWizardSourcePickerList();
    });
    document.querySelectorAll('.source-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        wizardSourcePickerFilter = pill.dataset.filter || 'compatible';
        document.querySelectorAll('.source-filter-pill').forEach(other => {
          const selected = other === pill;
          other.classList.toggle('active', selected);
          other.setAttribute('aria-selected', String(selected));
        });
        renderWizardSourcePickerList();
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!document.getElementById('modalWizardSourcePicker')?.classList.contains('hidden')) closePicker();
      }
    });
  }

  if (btnToggle && drawer) {
    btnToggle.onclick = () => {
      const willOpen = drawer.classList.contains('hidden');
      drawer.classList.toggle('hidden', !willOpen);
      if (willOpen) document.getElementById('inputWizSourceName')?.focus();
    };
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
        modal?.classList.add('hidden');
        renderWizardSourceStep();
      }
    };
  }

  if (btnReset) {
    btnReset.onclick = async () => {
      if (confirm('Reset seluruh daftar sumber kembali ke bawaan resmi?')) {
        resetSourcesToDefault();
        modal?.classList.add('hidden');
        renderWizardSourceStep();
      }
    };
  }
}

function renderStep2ChannelSection() {
  const releases = STATE.patchReleases || [];
  const currentTag = STATE.patchTag || '';
  const hasSource = Boolean(STATE.currentSource);

  const picker = document.getElementById('btnChannelPicker');
  const title = document.getElementById('channelChoiceTitle');
  const subtitle = document.getElementById('channelChoiceSubtitle');
  const badge = document.getElementById('channelChoiceBadge');
  const loadStatus = document.getElementById('channelLoadStatus');
  const loadTitle = document.getElementById('channelLoadTitle');
  const loadDetail = document.getElementById('channelLoadDetail');
  const latestStable = releases.find(r => !r.prerelease && !r.draft);
  const latestPre = releases.find(r => r.prerelease && !r.draft);
  const newestRelease = releases.find(r => !r.draft);
  const selectedRelease = currentTag === 'latest'
    ? latestStable
    : currentTag === 'dev' || currentTag === 'prerelease'
      ? latestPre
      : releases.find(r => (r.tag_name || r.name) === currentTag);
  const selectedTag = selectedRelease?.tag_name || selectedRelease?.name || currentTag;
  const selectedDate = selectedRelease?.published_at ? formatCompactReleaseDate(selectedRelease.published_at) : '';
  const newestTag = newestRelease?.tag_name || newestRelease?.name || '';
  const isLatest = Boolean(selectedTag && newestTag && selectedTag === newestTag);

  if (title) title.textContent = !hasSource
    ? 'Pilih sumber terlebih dahulu'
    : !currentTag
      ? 'Pilih saluran rilis'
      : `Rilis · ${selectedTag}`;
  if (subtitle) {
    subtitle.textContent = !hasSource
      ? 'Saluran tersedia setelah sumber dipilih'
      : !currentTag
        ? 'Belum ada saluran yang dipilih'
        : `${selectedRelease?.prerelease ? 'Pra-rilis' : 'Stabil'}${selectedDate ? ` · ${selectedDate}` : ''}`;
  }
  if (badge) badge.classList.toggle('hidden', !isLatest);
  if (loadStatus) {
    const hasVerifiedMetadata = Boolean(currentTag && STATE.patches.length > 0 && !STATE.channelLoading);
    const manifestState = STATE.sourceManifestStatus[STATE.currentSource] || {};
    const metadataError = manifestState.error || manifestState.metadataError || '';
    loadStatus.classList.toggle('hidden', !currentTag);
    loadStatus.classList.toggle('is-loading', STATE.channelLoading);
    loadStatus.classList.toggle('is-ready', hasVerifiedMetadata);
    loadStatus.classList.toggle('is-error', Boolean(currentTag && !STATE.channelLoading && !hasVerifiedMetadata));
    if (loadTitle) loadTitle.textContent = STATE.channelLoading
      ? 'Memeriksa metadata rilis…'
      : hasVerifiedMetadata ? 'Metadata rilis siap' : 'Metadata rilis belum tersedia';
    if (loadDetail) loadDetail.textContent = STATE.channelLoading
      ? 'Hanya data kompatibilitas kecil. Bundle patch belum diunduh.'
      : hasVerifiedMetadata
        ? `${STATE.patches.length} patch terverifikasi · bundle belum diunduh`
        : metadataError || 'Tidak ada bundle yang diunduh. Pilih ulang rilis atau coba lagi.';
  }
  if (picker) {
    picker.disabled = !hasSource;
    picker.onclick = hasSource ? () => openPatchTagPickerModal() : null;
  }

  bindPatchTagPickerModalEvents();
  updateWizardNavigationState();
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
  const filterPills = modal?.querySelectorAll('.tag-filter-pill') || [];

  const closePicker = () => {
    modal?.classList.add('hidden');
    requestAnimationFrame(() => wizardOverlayReturnFocus?.focus());
  };
  if (btnClose && modal) btnClose.onclick = closePicker;

  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closePicker();
    };
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) closePicker();
    });
  }

  if (btnToggleManual && drawerManual) {
    btnToggleManual.onclick = () => {
      const isHidden = drawerManual.classList.toggle('hidden');
      if (iconToggleManual) iconToggleManual.textContent = isHidden ? '▾' : '▴';
    };
  }

  if (btnApplyManual && inputManual) {
    btnApplyManual.onclick = async () => {
      const val = inputManual.value.trim();
      if (!val) return;
      if (modal) modal.classList.add('hidden');
      const release = (STATE.patchReleases || []).find(item => (item.tag_name || item.name) === val);
      await syncReleaseChannelSelection(val, release ? Boolean(release.prerelease) : null);
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

  const releases = STATE.patchReleases || [];
  const newestRelease = releases.find(release => !release.draft);
  const newestTag = newestRelease?.tag_name || newestRelease?.name || '';

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
    const message = releases.length === 0
      ? 'Sumber ini tidak menyediakan data rilis.'
      : 'Tidak ada rilis yang cocok dengan filter atau pencarian.';
    listContainer.innerHTML = `<div class="tag-picker-item" style="justify-content:center;color:#94A3B8;padding:24px 12px;"><span class="morphe-muted-hint">${message}</span></div>`;
    return;
  }

  filtered.slice(0, 30).forEach(rel => {
    const tagName = rel.tag_name || rel.name;
    const isPre = !!rel.prerelease;
    const isSelected = STATE.patchTag === tagName;
    const isLatestRelease = Boolean(newestTag && tagName === newestTag);
    const dateStr = rel.published_at ? formatCompactReleaseDate(rel.published_at) : '';

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
          ${isLatestRelease ? '<span class="tag-simple-badge badge-latest">Latest</span>' : ''}
          <span class="tag-simple-badge ${isPre ? 'badge-pre' : 'badge-stable'}">${isPre ? 'Pra-rilis' : 'Stabil'}</span>
        </div>
        ${dateStr ? `<span class="tag-item-date">${escapeHtml(dateStr)}</span>` : ''}
      </div>
      <button type="button" class="btn-tag-changelog" title="Catatan rilis untuk ${escapeHtml(tagName)}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span>Catatan</span>
      </button>
    `;

    row.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-tag-changelog')) {
        e.stopPropagation();
        showPatchNotesModal(tagName);
        return;
      }
      if (modal) modal.classList.add('hidden');
      await syncReleaseChannelSelection(tagName, isPre);
    });

    listContainer.appendChild(row);
  });
}

function openPatchTagPickerModal() {
  const modal = document.getElementById('modalPatchTagPicker');
  const titleEl = document.getElementById('modalTagPickerTitle');
  const subEl = document.getElementById('modalTagPickerSub');
  const searchInput = document.getElementById('inputSearchPatchTag');

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource);
  if (!activeSrc) return;
  wizardOverlayReturnFocus = document.getElementById('btnChannelPicker');
  const releases = STATE.patchReleases || [];

  if (titleEl) titleEl.textContent = 'Pilih Versi Patch';
  if (subEl) subEl.textContent = `Sumber: ${activeSrc.name || getSourceDisplayName(activeSrc.id)} • ${releases.length} rilis tersedia`;

  tagPickerFilter = 'all';
  tagPickerSearch = '';
  if (searchInput) searchInput.value = '';

  const filterPills = modal?.querySelectorAll('.tag-filter-pill') || [];
  filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));

  bindPatchTagPickerModalEvents();
  renderFilteredTagsList();

  if (modal) {
    modal.classList.remove('hidden');
    requestAnimationFrame(() => titleEl?.focus());
  }

  // The current release is available immediately from the registry. Fetch the
  // historical list only after this overlay is already visible.
  if (activeSrc?.releaseStatus === 'catalog' && activeSrc.repository) {
    if (subEl) subEl.textContent = `Sumber: ${activeSrc.name || getSourceDisplayName(activeSrc.id)} • memuat riwayat…`;
    loadSourceReleaseList(activeSrc, true).then(fullReleases => {
      if (STATE.currentSource !== activeSrc.id) return;
      const bundleReleases = fullReleases.filter(release => sourceReleaseBundleAsset(activeSrc, release));
      if (bundleReleases.length > 0) STATE.patchReleases = bundleReleases;
      if (subEl) subEl.textContent = `Sumber: ${activeSrc.name || getSourceDisplayName(activeSrc.id)} • ${STATE.patchReleases.length} rilis tersedia`;
      renderFilteredTagsList();
    });
  }
}

async function syncReleaseChannelSelection(tagVal, preRelease = null) {
  const wizSelect = document.getElementById('wizardPatchReleaseSelect');
  const mainSelect = document.getElementById('selectPatchRelease');
  if (wizSelect) wizSelect.value = tagVal;
  if (mainSelect) mainSelect.value = tagVal;
  const versionEl = document.getElementById('sourceSheetVersion');
  if (versionEl) versionEl.textContent = tagVal;
  const loadPromise = selectPatchChannel(tagVal, preRelease);
  renderStep2ChannelSection();
  renderWizardActiveSource();
  updateWizardNavigationState();
  const ready = await loadPromise;
  renderStep2ChannelSection();
  renderWizardSourcePickerList();
  renderWizardActiveSource();
  syncAllSummaries();
  return ready;
}

function formatCompactReleaseDate(isoStr) {
  const date = new Date(isoStr);
  if (!isoStr || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/* ==========================================================================
   STEP 2: TARGET APPLICATION SELECTION
   ========================================================================== */

function renderWizardAppStep() {
  const container = document.getElementById('wizardAppsGrid');
  if (!container) return;
  if (wizardAppListObserver) {
    wizardAppListObserver.disconnect();
    wizardAppListObserver = null;
  }
  container.innerHTML = '';
  container.dataset.renderedApps = '0';

  const notice = document.getElementById('wizardCatalogNotice');
  const failedManifestSources = STATE.sources.filter(source => STATE.sourceManifestStatus[source.id]?.status === 'error');
  const unverifiedBundleSources = STATE.sources.filter(source => source.bundleStatus === 'unverified');
  const missingBundleSources = STATE.sources.filter(source => source.bundleStatus === 'missing');
  const failedSources = [...new Map([...failedManifestSources, ...unverifiedBundleSources].map(source => [source.id, source])).values()];
  const noticeIssues = [
    failedManifestSources.length ? `${failedManifestSources.length} manifest gagal dimuat` : '',
    unverifiedBundleSources.length ? `${unverifiedBundleSources.length} rilis belum bisa diverifikasi` : '',
    missingBundleSources.length ? `${missingBundleSources.length} sumber tidak menyediakan bundle .mpp yang bisa dipakai` : ''
  ].filter(Boolean).join(' · ');
  if (notice) {
    notice.hidden = !noticeIssues;
    notice.innerHTML = noticeIssues ? `
      <div class="catalog-health-copy">
        <strong>Katalog aplikasi mengikuti manifest sumber</strong>
        <span>${noticeIssues}. Aplikasi yang tampil hanya berasal dari manifest valid.</span>
      </div>
      ${failedManifestSources.length || unverifiedBundleSources.length ? '<button type="button" class="catalog-health-retry">Coba lagi</button>' : ''}
    ` : '';
    const retry = notice.querySelector('.catalog-health-retry');
    retry?.addEventListener('click', async () => {
      retry.disabled = true;
      retry.textContent = 'Memuat…';
      await Promise.all(failedSources.flatMap(source => [
        loadSourceManifest(source, true),
        loadSourceReleaseList(source, true)
      ]));
      failedSources.forEach(source => refreshSourceBundleAvailability(source));
      STATE.availableApps = getAllSupportedApps();
      renderWizardAppStep();
    });
  }

  const apps = STATE.availableApps || [];

  if (apps.length === 0) {
    container.innerHTML = failedSources.length
      ? '<div class="morphe-ver-row"><span class="morphe-muted-hint">Belum ada aplikasi yang dapat diverifikasi. Periksa status sumber di atas, lalu coba muat ulang.</span></div>'
      : '<div class="morphe-ver-row"><span class="morphe-muted-hint">Memuat aplikasi yang didukung...</span></div>';
    return;
  }

  const searchInput = document.getElementById('wizardAppSearch');
  if (searchInput) {
    searchInput.value = wizardAppSearchQuery;
    if (!wizardAppSearchEventsBound) {
      searchInput.addEventListener('input', () => {
        wizardAppSearchQuery = searchInput.value.trim().toLowerCase();
        clearTimeout(wizardAppSearchTimer);
        wizardAppSearchTimer = setTimeout(renderWizardAppStep, 80);
      });
      wizardAppSearchEventsBound = true;
    }
  }
  const filteredApps = apps.filter(app => `${app.name} ${app.packageName}`.toLowerCase().includes(wizardAppSearchQuery));
  const count = document.getElementById('wizardAppCount');
  if (count) count.textContent = `${filteredApps.length} dari ${apps.length}`;
  if (filteredApps.length === 0) {
    container.innerHTML = '<div class="morphe-ver-row"><span class="morphe-muted-hint">Tidak ada aplikasi yang cocok dengan pencarian.</span></div>';
    return;
  }

  appendWizardAppBatch(container, filteredApps);
}

/* ==========================================================================
   STEP 3: TARGET APP VERSION SELECTION
   ========================================================================== */
