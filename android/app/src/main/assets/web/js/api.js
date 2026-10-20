async function loadSourcesAndPresets() {
  if (!window.__rvxRegistrySyncBound) {
    window.__rvxRegistrySyncBound = true;
    window.addEventListener('rvx:registry-updated', event => {
      applyRegistryCatalogUpdate(event.detail);
    });
  }

  const [sourcesData, presetData, registryData] = await Promise.all([
    fetchJsonSafe('config/sources.json'),
    fetchJsonSafe('config/golden-preset.json'),
    loadRegistryCatalogCached()
  ]);

  const persisted = loadPersistedSources();
  const configuredIds = new Set((Array.isArray(sourcesData) ? sourcesData : DEFAULT_SOURCES).map(source => source.id));
  const installedSources = (Array.isArray(sourcesData) && sourcesData.length ? sourcesData : DEFAULT_SOURCES)
    .map(def => {
      const saved = persisted.find(source => source.id === def.id);
      const merged = { ...saved, ...def, isPreinstalled: true };
      delete merged.fallbackTags;
      return merged;
    });
  // Built-in sources are defined by config; keep user-added sources from local storage.
  const retiredBuiltinIds = new Set(['revanced', 'j-hc', 'cuynu', 'inotia00', 'yt-advanced']);
  const customSources = persisted.filter(source =>
    !source.isPreinstalled && !source.isDiscovered && !configuredIds.has(source.id) && !retiredBuiltinIds.has(source.id)
  );
  const baseSources = [...installedSources, ...customSources];
  STATE.sources = mergeRegistryCatalogSources(baseSources, registryData);
  STATE.registryApps = getCachedRegistryAppMetadata(registryData?.apps);
  if (STATE.currentSource && !STATE.sources.some(source => source.id === STATE.currentSource)) {
    STATE.currentSource = null;
  }
  savePersistedSources(STATE.sources);

  if (presetData) STATE.goldenPreset = presetData;
  STATE.sourceManifestCache = {};
  STATE.sourceManifestCacheKey = {};
  STATE.sourceManifestLoadToken = {};
  STATE.sourceManifestStatus = {};
  STATE.sourceReleases = {};
  STATE.sources.forEach(source => {
    if (!Array.isArray(source.registryPackages)) return;
    STATE.sourceManifestStatus[source.id] = {
      status: 'ready',
      packageNames: new Set(source.registryPackages)
    };
    if (source.catalogRelease) {
      STATE.sourceReleases[source.id] = [source.catalogRelease];
      source.releaseStatus = 'catalog';
    }
  });
  // Manifests and release histories are loaded only when a source is selected.
  // The verified registry package index is enough to build the initial catalog.
  STATE.sources.forEach(source => refreshSourceBundleAvailability(source));
  if (STATE.currentSource && !STATE.sources.some(source => source.id === STATE.currentSource && source.bundleStatus === 'ready')) {
    STATE.currentSource = null;
  }
  STATE.availableApps = getAllSupportedApps();
  setTimeout(() => { refreshRegistryAppMetadata(); }, 0);

  const currentSrcConfig = STATE.sources.find(s => s.id === STATE.currentSource);
  if (currentSrcConfig) await loadPatchReleases(currentSrcConfig, false);
}

function getSourceDisplayName(srcId) {
  if (!srcId) return 'Belum dipilih';
  const found = STATE.sources.find(s => s.id === srcId);
  if (!found) return capitalize(srcId);
  return (found.name || found.id)
    .replace(/\s*\(Default\)/i, '')
    .replace(/\s*\(Official\)/i, '')
    .replace(/\s*\(ReVanced Extended\)/i, ' RVX')
    .replace(/\s*Patches$/i, '')
    .trim();
}

async function selectPatchSource(sourceId) {
  const srcObj = STATE.sources.find(source => source.id === sourceId);
  if (!srcObj) return false;

  const token = ++STATE.channelLoadToken;
  STATE.channelLoading = true;
  STATE.currentSource = sourceId;
  STATE.patchTag = '';
  STATE.selectedRelease = null;
  STATE.patchReleases = [];
  STATE.allManifestPatches = [];
  STATE.patches = [];
  STATE.availableVersions = [];
  STATE.sourceVersions = [];
  STATE.recommendedVersion = '';
  STATE.currentVersion = '';
  resetBrowserPatchState();
  STATE.showAllVersions = false;
  resetOtherVersionCatalog();
  STATE.selectedPatches.clear();
  RVX_STORAGE.local.setItem('rvx_active_source', sourceId);
  renderSourceCards();
  if (typeof renderWizardSourceStep === 'function') renderWizardSourceStep();

  // Source selection loads only its release list. Exact patch metadata is
  // requested after the user chooses a channel, matching the wizard data flow.
  await loadPatchReleases(srcObj, false, token);
  if (token !== STATE.channelLoadToken || STATE.currentSource !== sourceId) return false;
  STATE.patchTag = '';
  STATE.preReleasePatches = false;
  STATE.channelLoading = false;
  refreshSourceBundleAvailability(srcObj);
  syncAllSummaries();
  if (typeof renderWizardSourceStep === 'function') renderWizardSourceStep();
  if (STATE.uiMode === 'tui') renderTuiView();
  return true;
}

async function selectPatchChannel(tagValue, preRelease = null) {
  const sourceId = STATE.currentSource;
  const sourceConfig = STATE.sources.find(source => source.id === sourceId);
  const tag = String(tagValue || '').trim();
  if (!sourceConfig || !tag) return false;

  const token = ++STATE.channelLoadToken;
  STATE.channelLoading = true;
  STATE.patchTag = tag;
  STATE.selectedRelease = getSelectedSourceRelease(sourceConfig, tag);
  STATE.preReleasePatches = preRelease === null
    ? tag === 'dev' || tag === 'prerelease'
    : Boolean(preRelease);
  STATE.allManifestPatches = [];
  STATE.patches = [];
  STATE.availableVersions = [];
  STATE.sourceVersions = [];
  STATE.recommendedVersion = '';
  STATE.currentVersion = '';
  resetBrowserPatchState();
  STATE.showAllVersions = false;
  resetOtherVersionCatalog();
  STATE.selectedPatches.clear();
  refreshSourceBundleAvailability(sourceConfig, tag);
  syncAllSummaries();
  if (typeof renderWizardSourceStep === 'function') renderWizardSourceStep();

  // The cache key already includes the exact source bundle/tag. Reusing it
  // makes returning to a release instant without mixing data across sources.
  try {
    const ready = await fetchAndRenderPatches(sourceId, false, { token, tag });
    if (token !== STATE.channelLoadToken || STATE.currentSource !== sourceId || STATE.patchTag !== tag) {
      return false;
    }
    return ready;
  } finally {
    if (token === STATE.channelLoadToken) {
      STATE.channelLoading = false;
      syncAllSummaries();
      if (typeof renderWizardSourceStep === 'function') renderWizardSourceStep();
    }
  }
}

async function loadPatchReleases(sourceConfig, refreshAppUi = true, selectionToken = null) {
  if (!sourceConfig) return;
  const repo = sourceConfig.repository || '';
  const select = document.getElementById('selectPatchRelease');
  const hint = document.getElementById('patchReleaseHint');
  const versionEl = document.getElementById('sourceSheetVersion');
  if (!select) return;

  if ((repo && repo.includes('/')) || sourceConfig.registryBundleId) {
    try {
      const releases = await loadSourceReleaseList(sourceConfig);
      if (selectionToken !== null
        && (selectionToken !== STATE.channelLoadToken || STATE.currentSource !== sourceConfig.id)) return false;
      const bundleReleases = releases.filter(release => sourceReleaseBundleAsset(sourceConfig, release));
      if (bundleReleases.length > 0) {
        STATE.patchReleases = bundleReleases;
        const latestPre = bundleReleases.find(r => r.prerelease && !r.draft);
        const latestStable = bundleReleases.find(r => !r.prerelease && !r.draft);

        select.innerHTML = '<option value="" selected disabled>Pilih saluran atau tag rilis</option>';
        if (latestPre) {
          const optDev = document.createElement('option');
          optDev.value = 'dev';
          optDev.textContent = `Pre-release / Dev (${latestPre.tag_name})`;
          select.appendChild(optDev);
        }

        if (latestStable) {
          const optStable = document.createElement('option');
          optStable.value = 'latest';
          optStable.textContent = `Stable / Official (${latestStable.tag_name})`;
          select.appendChild(optStable);
        }

        // Populate individual releases as well
        bundleReleases.slice(0, 10).forEach(rel => {
          const opt = document.createElement('option');
          opt.value = rel.tag_name;
          opt.textContent = `${rel.name || rel.tag_name} (${rel.prerelease ? 'Pre' : 'Stable'})`;
          select.appendChild(opt);
        });

        select.value = '';
        STATE.patchTag = '';
        STATE.preReleasePatches = false;

        // Mirror to wizard select if exists
        const wizSelect = document.getElementById('wizardPatchReleaseSelect');
        if (wizSelect) {
          wizSelect.innerHTML = select.innerHTML;
          wizSelect.value = '';
        }

        if (hint) hint.textContent = `${repo} • ${bundleReleases.length} rilis tersedia`;
        if (versionEl) versionEl.textContent = 'Pilih rilis';
        refreshSourceBundleAvailability(sourceConfig);
        STATE.availableApps = getAllSupportedApps();
        if (refreshAppUi && typeof renderWizardAppStep === 'function') renderWizardAppStep();
        if (typeof renderWizardReleaseStudio === 'function') renderWizardReleaseStudio();
        return true;
      }
    } catch (_) {}
  }

  if (selectionToken !== null
    && (selectionToken !== STATE.channelLoadToken || STATE.currentSource !== sourceConfig.id)) return false;
  STATE.patchReleases = [];

  select.innerHTML = '<option value="">Tidak ada rilis yang tersedia</option>';
  const wizSelect = document.getElementById('wizardPatchReleaseSelect');
  if (wizSelect) {
    wizSelect.innerHTML = select.innerHTML;
  }
  if (hint) hint.textContent = 'Tidak ada data rilis dari sumber ini';
  if (versionEl) versionEl.textContent = '—';
  STATE.patchTag = '';
  sourceConfig.bundleUrl = null;
  sourceConfig.bundleStatus = 'missing';
  STATE.availableApps = getAllSupportedApps();
  if (refreshAppUi && typeof renderWizardAppStep === 'function') renderWizardAppStep();
  if (typeof renderWizardReleaseStudio === 'function') renderWizardReleaseStudio();
  return false;
}

function classifyVersion(verStr) {
  if (!verStr) return { label: 'Stabil', badgeClass: 'badge-stable' };
  const v = String(verStr).toLowerCase();
  if (v.includes('alpha')) return { label: 'Alpha', badgeClass: 'badge-alpha' };
  if (v.includes('beta') || v.includes('-b') || v.includes('.b')) return { label: 'Beta', badgeClass: 'badge-beta' };
  if (v.includes('rc') || v.includes('pre') || v.includes('dev')) return { label: 'Pra-rilis', badgeClass: 'badge-pre' };
  return { label: 'Stabil', badgeClass: 'badge-stable' };
}

async function triggerSilentDeveloperDispatch({ token, repo, branch, eventType, payload }) {
  if (!token) throw new Error('Developer token required');
  const cleanRepo = String(repo || 'Zy0x/YouTube-Revanced').replace(/[^a-zA-Z0-9_\-\/]/g, '');
  const cleanBranch = String(branch || 'main').replace(/[^a-zA-Z0-9_\-\/\.]/g, '');
  const cleanEventType = String(eventType || 'build-rvx').replace(/[^a-zA-Z0-9_\-]/g, '');

  const res = await fetch(`https://api.github.com/repos/${cleanRepo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_type: cleanEventType,
      client_payload: {
        ...payload,
        ref: cleanBranch
      }
    })
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return true;
}

function extractSupportedApps(rawList) {
  const appMap = new Map();

  rawList.forEach(patch => {
    const compat = patch.compatiblePackages;
    if (!compat) return;

    if (Array.isArray(compat)) {
      compat.forEach(entry => {
        if (!entry) return;
        const pkgId = normalizePackageId(typeof entry === 'string' ? entry : (entry.packageName || entry.name || ''));
        const pkgName = typeof entry === 'object' ? (entry.name || entry.packageName) : entry;
        if (!pkgId) return;

        if (!appMap.has(pkgId)) {
          const meta = resolveAppMeta(pkgId, pkgName);
          appMap.set(pkgId, {
            ...meta,
            packageName: pkgId,
            patchCount: 0,
            patchNames: new Set(),
            versions: new Set()
          });
        }
        const appObj = appMap.get(pkgId);
        appObj.patchCount++;
        if (patch.name) appObj.patchNames.add(String(patch.name));

        if (entry.targets && Array.isArray(entry.targets)) {
          entry.targets.forEach(t => {
            if (t && t.version) appObj.versions.add(String(t.version).trim());
          });
        } else if (entry.versions && Array.isArray(entry.versions)) {
          entry.versions.forEach(v => appObj.versions.add(String(v).trim()));
        }
      });
    } else if (typeof compat === 'object') {
      Object.entries(compat).forEach(([rawPkgId, versions]) => {
        const pkgId = normalizePackageId(rawPkgId);
        if (!pkgId) return;
        if (!appMap.has(pkgId)) {
          const meta = resolveAppMeta(pkgId);
          appMap.set(pkgId, {
            ...meta,
            packageName: pkgId,
            patchCount: 0,
            patchNames: new Set(),
            versions: new Set()
          });
        }
        const appObj = appMap.get(pkgId);
        appObj.patchCount++;
        if (patch.name) appObj.patchNames.add(String(patch.name));
        if (Array.isArray(versions)) {
          versions.forEach(v => appObj.versions.add(String(v).trim()));
        }
      });
    }
  });

  const appList = Array.from(appMap.values()).map(app => {
    const sortedVersions = Array.from(app.versions).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    ).reverse();
    return {
      ...app,
      patchCount: app.patchNames.size || app.patchCount,
      patchNames: Array.from(app.patchNames),
      availableVersionsCount: sortedVersions.length,
      recommendedVersion: sortedVersions[0] || ''
    };
  });

  appList.sort(compareAppsByPriority);

  return appList;
}

function filterPatchesForApp(patches, pkgName) {
  if (!pkgName) return patches;
  return patches.filter(p => {
    const compat = p.compatiblePackages;
    if (!compat) return true;
    if (typeof compat === 'object' && !Array.isArray(compat)) {
      const keys = Object.keys(compat);
      if (keys.length === 0) return true;
      return Object.prototype.hasOwnProperty.call(compat, pkgName);
    }
    if (Array.isArray(compat)) {
      if (compat.length === 0) return true;
      return compat.some(entry => {
        if (!entry) return false;
        if (typeof entry === 'string') {
          return entry === pkgName || (KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === entry.toLowerCase());
        }
        return entry.packageName === pkgName || entry.name === pkgName ||
          (KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === (entry.name || '').toLowerCase());
      });
    }
    return true;
  });
}

function getPatchVersionCompatibility(patch, pkgName) {
  const compat = patch?.compatiblePackages;
  const versions = new Set();

  if (!compat || (Array.isArray(compat) && compat.length === 0)) {
    return { matches: true, unrestricted: true, versions };
  }

  const collectVersions = value => {
    if (Array.isArray(value)) {
      value.forEach(entry => {
        const version = typeof entry === 'string' ? entry : entry?.version;
        if (version) versions.add(String(version).trim());
      });
      return value.length > 0;
    }
    if (value && typeof value === 'object') {
      const targets = Array.isArray(value.targets) ? value.targets : [];
      const listed = Array.isArray(value.versions) ? value.versions : [];
      collectVersions([...targets, ...listed]);
      return targets.length > 0 || listed.length > 0;
    }
    return false;
  };

  if (!Array.isArray(compat) && typeof compat === 'object') {
    const keys = Object.keys(compat);
    if (keys.length === 0) return { matches: true, unrestricted: true, versions };
    if (!Object.prototype.hasOwnProperty.call(compat, pkgName)) {
      return { matches: false, unrestricted: false, versions };
    }
    const restricted = collectVersions(compat[pkgName]);
    return { matches: true, unrestricted: !restricted, versions };
  }

  let matches = false;
  let unrestricted = false;
  compat.forEach(entry => {
    if (!entry) return;
    if (typeof entry === 'string') {
      const entryId = normalizePackageId(entry);
      if (entryId === pkgName || KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === entry.toLowerCase()) {
        matches = true;
        unrestricted = true;
      }
      return;
    }

    const entryId = normalizePackageId(entry.packageName || entry.name || '');
    const appNameMatches = KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === String(entry.name || '').toLowerCase();
    if (entryId !== pkgName && !appNameMatches) return;

    matches = true;
    const restricted = collectVersions({ targets: entry.targets, versions: entry.versions });
    if (!restricted) unrestricted = true;
  });

  return { matches, unrestricted, versions };
}

function patchSupportsAppVersion(patch, pkgName, version) {
  const compatibility = getPatchVersionCompatibility(patch, pkgName);
  return compatibility.matches && (compatibility.unrestricted || compatibility.versions.has(String(version).trim()));
}

function extractVersionsForApp(patches, pkgName) {
  const manifestVersions = new Set();
  patches.forEach(p => {
    const compatibility = getPatchVersionCompatibility(p, pkgName);
    compatibility.versions.forEach(version => manifestVersions.add(version));
  });

  const sortedManifest = Array.from(manifestVersions)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .reverse();

  const versionsMap = new Map();

  sortedManifest.forEach(ver => {
    versionsMap.set(ver, {
      version: ver,
      isManifest: true
    });
  });

  const totalPatchCount = patches.length;
  const allVersions = Array.from(versionsMap.values()).map(item => {
    const supportedPatchCount = patches.reduce((count, patch) =>
      count + (patchSupportsAppVersion(patch, pkgName, item.version) ? 1 : 0), 0);
    return {
      ...item,
      supportedPatchCount,
      totalPatchCount,
      supportPercent: totalPatchCount > 0 ? Math.round((supportedPatchCount / totalPatchCount) * 100) : 0
    };
  }).sort((a, b) => {
    if (a.supportedPatchCount !== b.supportedPatchCount) return b.supportedPatchCount - a.supportedPatchCount;
    if (a.isManifest !== b.isManifest) return a.isManifest ? -1 : 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
  });

  const recommended = allVersions[0]?.version || '';
  allVersions.forEach(item => {
    item.isRecommended = item.version === recommended && item.supportedPatchCount > 0;
  });

  return { allVersions, recommendedVersion: recommended };
}

function selectApp(pkgId) {
  const foundApp = STATE.availableApps.find(a => a.packageName === pkgId);
  if (!foundApp) return;

  STATE.currentApp = foundApp;
  const appPatches = filterPatchesForApp(STATE.allManifestPatches, foundApp.packageName);
  STATE.patches = appPatches;

  const { allVersions, recommendedVersion } = extractVersionsForApp(appPatches, foundApp.packageName);
  STATE.sourceVersions = allVersions.filter(item => Number(item.supportedPatchCount || 0) > 0);
  STATE.availableVersions = STATE.sourceVersions;
  STATE.recommendedVersion = recommendedVersion;
  STATE.currentVersion = '';
  resetBrowserPatchState();
  STATE.selectedExternalVersion = null;
  resetOtherVersionCatalog();
  STATE.showAllVersions = false;
  STATE.patchSearchQuery = '';
  STATE.patchListFilter = 'all';

  STATE.selectedPatches.clear();
  appPatches.forEach(p => {
    if (Array.isArray(p.options)) {
      p.options.forEach(opt => {
        if (opt.key && opt.default !== undefined && STATE.selectedOptions[opt.key] === undefined) {
          STATE.selectedOptions[opt.key] = opt.default;
        }
      });
    }
  });

  renderAppCards();
  renderVersionSelector();
  renderMorphePatchList();
  syncAllSummaries();
  fetchInstalledAppInfo();
  if (STATE.uiMode === 'tui') renderTuiView();
}

async function fetchAndRenderPatches(sourceId, force = false, requestContext = null) {
  const patchContainer = document.getElementById('patchCategoriesContainer');
  if (patchContainer) {
    patchContainer.innerHTML = '<div class="morphe-spinner"></div>';
  }

  const sourceConfig = STATE.sources.find(s => s.id === sourceId);
  if (!sourceConfig || STATE.currentSource !== sourceId) return false;

  try {
    const rawList = await loadSourceManifest(sourceConfig, force);
    if (requestContext && (
      requestContext.token !== STATE.channelLoadToken
      || STATE.currentSource !== sourceId
      || STATE.patchTag !== requestContext.tag
    )) return false;
    if (!rawList) throw new Error(STATE.sourceManifestStatus[sourceId]?.error || 'Manifest sumber tidak dapat diverifikasi');
    if (STATE.currentSource !== sourceId) return false;
    STATE.allManifestPatches = rawList;

    const manifestApps = extractSupportedApps(rawList);
    STATE.availableApps = getAllSupportedApps();

    const curPkg = STATE.currentApp?.packageName || '';
    const exists = manifestApps.find(a => a.packageName === curPkg);
    const initialPkg = exists?.packageName;
    if (!initialPkg) throw new Error('Sumber ini tidak kompatibel dengan aplikasi yang dipilih');

    selectApp(initialPkg);
    return true;
  } catch (err) {
    if (patchContainer) {
      patchContainer.innerHTML = `<div class="morphe-alert text-danger">Failed to load patches: ${escapeHtml(err.message)}</div>`;
    }
    return false;
  }
}

function applyGoldenPresetStateOnly() {
  if (!STATE.goldenPreset) return;
  const config = STATE.goldenPreset;

  if (config.target_youtube_version) {
    STATE.currentVersion = config.target_youtube_version;
  }

  const excSet = new Set([
    ...(config.excludedPatches || []),
    ...(config.rootExcludedPatches || []),
    ...(config.excluded_patches || [])
  ]);
  const incList = config.included_patches || [];

  STATE.selectedPatches.clear();
  STATE.patches.forEach(patch => {
    let shouldSelect = true;
    if (excSet.has(patch.name)) {
      shouldSelect = false;
    } else if (incList.length > 0 && !incList.includes(patch.name)) {
      shouldSelect = false;
    }
    if (shouldSelect) STATE.selectedPatches.add(patch.name);
  });

  if (config.options && typeof config.options === 'object') {
    Object.entries(config.options).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.entries(v).forEach(([optKey, optVal]) => {
          STATE.selectedOptions[optKey] = optVal;
        });
      } else {
        STATE.selectedOptions[k] = v;
      }
    });
  }
}

function applyGoldenPreset() {
  applyGoldenPresetStateOnly();
  renderVersionSelector();
  renderMorphePatchList();
  syncAllSummaries();
  if (STATE.uiMode === 'tui') renderTuiView();
}

async function exportPreset() {
  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);
  const appAlias = STATE.currentApp?.alias || 'App';

  const payload = {
    schema_version: '2.1.10',
    exported_at: new Date().toISOString(),
    package_name: STATE.currentApp?.packageName || 'com.google.android.youtube',
    app_name: STATE.currentApp?.name || 'YouTube',
    patch_source: STATE.currentSource,
    patch_tag: STATE.patchTag,
    target_version: STATE.currentVersion,
    active_patch_count: STATE.selectedPatches.size,
    included_patches: includedPatches,
    excluded_patches: excludedPatches,
    options: STATE.selectedOptions
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  await rvxSaveBlob(
    blob,
    `rvx-preset-${appAlias}-${STATE.currentSource}-${STATE.currentVersion}.json`,
    'application/json'
  );
}

function importPreset(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.patch_source && STATE.sources.some(s => s.id === data.patch_source)) {
        STATE.currentSource = data.patch_source;
      }
      if (data.target_youtube_version) {
        STATE.currentVersion = data.target_youtube_version;
      }

      const exc = new Set([
        ...(data.excluded_patches || []),
        ...(data.excludedPatches || []),
        ...(data.rootExcludedPatches || [])
      ]);
      const inc = new Set(data.included_patches || []);

      STATE.selectedPatches.clear();
      STATE.patches.forEach(p => {
        let active = true;
        if (exc.has(p.name)) active = false;
        else if (inc.size > 0 && !inc.has(p.name)) active = false;
        if (active) STATE.selectedPatches.add(p.name);
      });

      if (data.options && typeof data.options === 'object') {
        STATE.selectedOptions = { ...STATE.selectedOptions, ...data.options };
      }

      renderVersionSelector();
      renderMorphePatchList();
      syncAllSummaries();
      if (STATE.uiMode === 'tui') renderTuiView();
      document.getElementById('presetSheetModal')?.classList.add('hidden');
    } catch (_) {
      alert('Failed to import preset: Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

async function checkDaemonStatus() {
  STATE.runtimeCapabilities = await rvxDetectCapabilities();
  if (!window.RVX_RUNTIME?.allowsNativeBridge) {
    STATE.daemonOnline = false;
    STATE.daemonUrl = '';
    STATE.daemonStatus = null;
    STATE.deviceAccessMode = window.RVX_RUNTIME?.isStandalone ? 'standalone-browser' : 'hosted-browser';
    setEngineMode('browser');
    try {
      STATE.portableEngineManifest = await RVX_LOCAL_ENGINE.loadManifest();
    } catch (_) {
      STATE.portableEngineManifest = null;
    }
    return false;
  }

  try {
    // Root WebUI talks only to its own origin. Hosted pages and file:// pages
    // never scan loopback ports or request a native session.
    const res = await fetch('/api/v1/system/status', { signal: rvxTimeoutSignal(1600) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.web_runtime !== 'local-daemon') throw new Error('Bukan RVX Root WebUI');
    STATE.daemonOnline = true;
    STATE.daemonUrl = '';
    STATE.daemonVersion = data.daemon_version || '2.1.30';
    STATE.daemonStatus = data;
    STATE.deviceAccessMode = data.access_mode || 'root-integrated';
    await ensureDaemonSession('');
    setEngineMode('local');
    return true;
  } catch (_) {
    STATE.daemonOnline = false;
    STATE.daemonUrl = '';
    STATE.daemonStatus = null;
    STATE.deviceAccessMode = 'root-helper-unavailable';
    setEngineMode('browser');
    return false;
  }
}

async function loadDaemonSessionInfo() {
  const codeEl = document.getElementById('infoPairingCode');
  const hintEl = document.getElementById('infoPairingHint');
  if (!codeEl) return;

  if (!STATE.daemonOnline) {
    const standalone = Boolean(window.RVX_RUNTIME?.isStandalone);
    codeEl.textContent = standalone ? 'HTML lokal' : 'Browser lokal';
    if (hintEl) hintEl.textContent = standalone
      ? 'Tidak ada pairing. Metadata, APK, cache, dan konfigurasi tetap berada di browser perangkat ini.'
      : 'Tidak ada pairing atau akses localhost. Patching berjalan lokal untuk release portable yang terverifikasi.';
    return;
  }

  const connected = Boolean(RVX_STORAGE.session.getItem('rvx_daemon_token'));
  codeEl.textContent = connected ? 'Root WebUI lokal' : 'Helper lokal tidak siap';
  if (hintEl) hintEl.textContent = connected
    ? 'Sesi dibuat otomatis pada origin lokal ini; tidak ada kode pairing.'
    : 'Muat ulang Root WebUI atau periksa service modul.';
}

async function ensureDaemonSession(url = STATE.daemonUrl) {
  if (!window.RVX_RUNTIME?.allowsNativeBridge || !STATE.daemonOnline) return false;
  try {
    const bootstrap = await fetch(`${url}/api/v1/session/bootstrap`, { signal: rvxTimeoutSignal(1600) });
    if (bootstrap.ok) {
      const data = await bootstrap.json();
      if (data.token) {
        RVX_STORAGE.session.setItem('rvx_daemon_token', data.token);
        return true;
      }
    }
  } catch (_) {
    // A stale token must never trigger an opaque pairing prompt. The caller
    // renders a local-runtime gate with an explicit route back to the daemon.
  }
  RVX_STORAGE.session.removeItem('rvx_daemon_token');
  return false;
}

function localDaemonWebUrl() {
  return window.RVX_RUNTIME?.isRootWebUI ? `${location.origin}/?build=2.3.0` : '';
}

function isLocalDaemonPage() {
  if (!STATE.daemonOnline) return false;
  if (!STATE.daemonUrl) return true;
  try { return new URL(STATE.daemonUrl, location.href).origin === location.origin; }
  catch (_) { return false; }
}

async function fetchInstalledAppInfo() {
  const text = document.getElementById('installedVerText');
  if (!STATE.daemonOnline) {
    if (text) text.textContent = 'Pilih APK secara lokal';
    return;
  }
  try {
    const pkg = STATE.currentApp?.packageName || 'com.google.android.youtube';
    let res = await fetch(`${STATE.daemonUrl}/api/v1/system/app-info?pkg=${encodeURIComponent(pkg)}`);
    if (!res.ok) {
      res = await fetch(`${STATE.daemonUrl}/api/v1/system/youtube-info`);
    }
    if (res.ok) {
      const data = await res.json();
      if (data.installed_version && data.installed_version !== 'Unknown') {
        STATE.installedVersion = data.installed_version;
        if (text) text.textContent = `v${data.installed_version}`;
      } else {
        STATE.installedVersion = null;
        if (text) text.textContent = 'Not installed on device';
      }
      syncAllSummaries();
    }
  } catch (_) {}
}

function setEngineMode(mode) {
  STATE.engineMode = mode === 'local' ? 'local' : 'browser';
  const engineTag = document.getElementById('engineModeTag');
  const title = document.getElementById('runtimeSummaryTitle');
  const detail = document.getElementById('runtimeSummaryText');
  const isLocal = STATE.engineMode === 'local';
  if (engineTag) engineTag.textContent = isLocal ? 'Root/native' : 'Browser lokal';
  if (title) title.textContent = isLocal ? 'Morphe/JVM pada Root WebUI' : 'Rust/WASM di browser';
  if (detail) detail.textContent = isLocal
    ? 'Bundle MPP diproses pada perangkat melalui helper modul lokal.'
    : 'Build hanya aktif untuk release yang memiliki artefak portable terverifikasi.';
  syncAllSummaries();
}
