/**
 * YouTube RVX — API & Data Orchestration
 * Version: 2.1.15
 */

function initSecurity() {
  const statusText = document.getElementById('authStatusText');
  if (STATE.authToken) {
    verifyGithubToken(STATE.authToken);
  } else if (statusText) {
    statusText.textContent = 'Guest';
  }
}

async function verifyGithubToken(token) {
  const statusText = document.getElementById('authStatusText');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (res.ok) {
      const user = await res.json();
      STATE.authUser = user.login;
      if (statusText) statusText.textContent = `@${user.login}`;
      return true;
    }
  } catch (_) {}
  if (statusText) statusText.textContent = 'Invalid';
  return false;
}

async function fetchManifestWithFallback(url) {
  if (!url) throw new Error('Manifest URL is missing');
  const urlsToTry = [url];

  if (url.includes('raw.githubusercontent.com')) {
    urlsToTry.unshift(
      url
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
    );
  }

  // Fallback between patches-list.json and patches.json
  if (url.includes('patches-list.json')) {
    urlsToTry.push(url.replace('patches-list.json', 'patches.json'));
    urlsToTry.push(
      url.replace('patches-list.json', 'patches.json')
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
    );
  } else if (url.includes('patches.json')) {
    urlsToTry.push(url.replace('patches.json', 'patches-list.json'));
    urlsToTry.push(
      url.replace('patches.json', 'patches-list.json')
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
    );
  }

  for (const targetUrl of urlsToTry) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && (Array.isArray(json) || json.patches)) {
          return json;
        }
      }
    } catch (_) {}
  }
  throw new Error(`Failed to reach patch source (${url})`);
}

async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}

async function loadSourcesAndPresets() {
  const [sourcesData, presetData, versionsData] = await Promise.all([
    fetchJsonSafe('config/sources.json'),
    fetchJsonSafe('config/golden-preset.json'),
    fetchJsonSafe('config/youtube-versions.json')
  ]);

  const persisted = loadPersistedSources();
  if (Array.isArray(sourcesData) && sourcesData.length > 0) {
    sourcesData.forEach(def => {
      const idx = persisted.findIndex(s => s.id === def.id);
      if (idx === -1) {
        persisted.push(def);
      } else {
        persisted[idx] = { ...def, ...persisted[idx] };
      }
    });
  }

  STATE.sources = persisted;
  savePersistedSources(STATE.sources);

  if (presetData) STATE.goldenPreset = presetData;
  if (Array.isArray(versionsData) && versionsData.length > 0) {
    STATE.catalogVersions = versionsData;
  }

  renderSourceCards();
  const currentSrcConfig = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  await loadPatchReleases(currentSrcConfig);
}

function getSourceDisplayName(srcId) {
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
  STATE.currentSource = sourceId;
  localStorage.setItem('rvx_active_source', sourceId);
  renderSourceCards();
  const srcObj = STATE.sources.find(s => s.id === sourceId) || STATE.sources[0];
  await loadPatchReleases(srcObj);
  await fetchAndRenderPatches(sourceId);
  syncAllSummaries();
  if (STATE.uiMode === 'tui') renderTuiView();
}

async function loadPatchReleases(sourceConfig) {
  if (!sourceConfig) return;
  const repo = sourceConfig.repository || '';
  const select = document.getElementById('selectPatchRelease');
  const hint = document.getElementById('patchReleaseHint');
  const versionEl = document.getElementById('sourceSheetVersion');
  if (!select) return;

  if (repo && repo.includes('/')) {
    try {
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (STATE.authToken) headers['Authorization'] = `Bearer ${STATE.authToken}`;
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers });
      if (res.ok) {
        const releases = await res.json();
        STATE.patchReleases = releases;
        const latestPre = releases.find(r => r.prerelease);
        const latestStable = releases.find(r => !r.prerelease);

        select.innerHTML = '';
        const optDev = document.createElement('option');
        optDev.value = 'dev';
        optDev.textContent = `Pre-release / Dev ${latestPre ? `(${latestPre.tag_name})` : ''}`;
        if (STATE.preReleasePatches || sourceConfig.defaultReleaseType === 'dev' || !latestStable) {
          optDev.selected = true;
        }
        select.appendChild(optDev);

        const optStable = document.createElement('option');
        optStable.value = 'latest';
        optStable.textContent = `Stable / Official ${latestStable ? `(${latestStable.tag_name})` : ''}`;
        if (!STATE.preReleasePatches && latestStable) {
          optStable.selected = true;
        }
        select.appendChild(optStable);

        // Populate individual releases as well
        releases.slice(0, 8).forEach(rel => {
          const opt = document.createElement('option');
          opt.value = rel.tag_name;
          opt.textContent = `${rel.name || rel.tag_name} (${rel.prerelease ? 'Pre' : 'Stable'})`;
          select.appendChild(opt);
        });

        // Mirror to wizard select if exists
        const wizSelect = document.getElementById('wizardPatchReleaseSelect');
        if (wizSelect) {
          wizSelect.innerHTML = select.innerHTML;
          wizSelect.value = select.value;
        }

        const activeTag = select.value === 'dev' ? (latestPre?.tag_name || 'dev') : (latestStable?.tag_name || 'latest');
        if (hint) hint.textContent = `${repo} • ${activeTag}`;
        if (versionEl) versionEl.textContent = activeTag;
        STATE.patchTag = select.value;
        if (typeof renderWizardReleaseStudio === 'function') renderWizardReleaseStudio();
        return;
      }
    } catch (_) {}
  }

  // Fallback to source pre-configured fallback tags if available
  if (Array.isArray(sourceConfig.fallbackTags) && sourceConfig.fallbackTags.length > 0) {
    STATE.patchReleases = sourceConfig.fallbackTags;
  }

  select.innerHTML = `
    <option value="dev" ${STATE.preReleasePatches ? 'selected' : ''}>Pre-release / Dev</option>
    <option value="latest" ${!STATE.preReleasePatches ? 'selected' : ''}>Stable / Official</option>
  `;
  const wizSelect = document.getElementById('wizardPatchReleaseSelect');
  if (wizSelect) {
    wizSelect.innerHTML = select.innerHTML;
  }
  const defaultTag = STATE.preReleasePatches ? 'dev' : 'latest';
  if (hint) hint.textContent = repo || 'Custom URL';
  if (versionEl) versionEl.textContent = defaultTag;
  STATE.patchTag = select.value;
  if (typeof renderWizardReleaseStudio === 'function') renderWizardReleaseStudio();
}

function classifyVersion(verStr) {
  if (!verStr) return { label: 'Stable', badgeClass: 'badge-stable' };
  const v = String(verStr).toLowerCase();
  if (v.includes('alpha')) return { label: 'Alpha', badgeClass: 'badge-alpha' };
  if (v.includes('beta') || v.includes('-b') || v.includes('.b')) return { label: 'Beta', badgeClass: 'badge-beta' };
  if (v.includes('rc') || v.includes('pre') || v.includes('dev')) return { label: 'Pre-release', badgeClass: 'badge-pre' };
  return { label: 'Stable', badgeClass: 'badge-stable' };
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
        const pkgId = typeof entry === 'string' ? entry : (entry.packageName || entry.name || '');
        const pkgName = typeof entry === 'object' ? (entry.name || entry.packageName) : entry;
        if (!pkgId) return;

        if (!appMap.has(pkgId)) {
          const meta = resolveAppMeta(pkgId, pkgName);
          appMap.set(pkgId, {
            ...meta,
            packageName: pkgId,
            patchCount: 0,
            versions: new Set()
          });
        }
        const appObj = appMap.get(pkgId);
        appObj.patchCount++;

        if (entry.targets && Array.isArray(entry.targets)) {
          entry.targets.forEach(t => {
            if (t && t.version) appObj.versions.add(String(t.version).trim());
          });
        } else if (entry.versions && Array.isArray(entry.versions)) {
          entry.versions.forEach(v => appObj.versions.add(String(v).trim()));
        }
      });
    } else if (typeof compat === 'object') {
      Object.entries(compat).forEach(([pkgId, versions]) => {
        if (!pkgId) return;
        if (!appMap.has(pkgId)) {
          const meta = resolveAppMeta(pkgId);
          appMap.set(pkgId, {
            ...meta,
            packageName: pkgId,
            patchCount: 0,
            versions: new Set()
          });
        }
        const appObj = appMap.get(pkgId);
        appObj.patchCount++;
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
      availableVersionsCount: sortedVersions.length,
      recommendedVersion: sortedVersions[0] || (app.packageName === 'com.google.android.youtube' ? '21.13.164' : 'latest')
    };
  });

  const priorityOrder = [
    'com.google.android.youtube',
    'com.google.android.apps.youtube.music',
    'com.reddit.frontpage',
    'com.twitter.android',
    'com.zhiliaoapp.musically'
  ];

  appList.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a.packageName);
    const idxB = priorityOrder.indexOf(b.packageName);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  if (appList.length === 0) {
    const defaultMeta = resolveAppMeta('com.google.android.youtube');
    appList.push({
      ...defaultMeta,
      packageName: 'com.google.android.youtube',
      patchCount: rawList.length,
      availableVersionsCount: 4,
      recommendedVersion: '21.13.164'
    });
  }

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

function extractVersionsForApp(patches, pkgName) {
  const manifestVersions = new Set();
  patches.forEach(p => {
    const compat = p.compatiblePackages;
    if (!compat) return;
    if (typeof compat === 'object' && !Array.isArray(compat)) {
      if (Array.isArray(compat[pkgName])) {
        compat[pkgName].forEach(v => manifestVersions.add(String(v).trim()));
      }
    } else if (Array.isArray(compat)) {
      compat.forEach(entry => {
        if (!entry) return;
        const matches = typeof entry === 'string'
          ? (entry === pkgName || KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === entry.toLowerCase())
          : (entry.packageName === pkgName || entry.name === pkgName ||
             KNOWN_APP_METADATA[pkgName]?.name.toLowerCase() === (entry.name || '').toLowerCase());

        if (matches) {
          if (Array.isArray(entry.targets)) {
            entry.targets.forEach(t => t?.version && manifestVersions.add(String(t.version).trim()));
          } else if (Array.isArray(entry.versions)) {
            entry.versions.forEach(v => manifestVersions.add(String(v).trim()));
          }
        }
      });
    }
  });

  const sortedManifest = Array.from(manifestVersions)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .reverse();

  const recommended = sortedManifest[0] || (pkgName === 'com.google.android.youtube' ? '21.13.164' : 'latest');
  const versionsMap = new Map();

  sortedManifest.forEach(ver => {
    versionsMap.set(ver, {
      version: ver,
      isRecommended: ver === recommended,
      isManifest: true
    });
  });

  if (pkgName === 'com.google.android.youtube') {
    const catalog = (STATE.catalogVersions && STATE.catalogVersions.length > 0)
      ? STATE.catalogVersions
      : FALLBACK_YOUTUBE_VERSIONS;

    catalog.forEach(item => {
      const ver = typeof item === 'string' ? item : item.version;
      if (!ver) return;
      if (!versionsMap.has(ver)) {
        versionsMap.set(ver, {
          version: ver,
          isRecommended: ver === recommended,
          isManifest: manifestVersions.has(ver)
        });
      }
    });
  }

  const allVersions = Array.from(versionsMap.values()).sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
    if (a.isManifest !== b.isManifest) return a.isManifest ? -1 : 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
  });

  return { allVersions, recommendedVersion: recommended };
}

function selectApp(pkgId) {
  const foundApp = STATE.availableApps.find(a => a.packageName === pkgId) || STATE.availableApps[0];
  if (!foundApp) return;

  STATE.currentApp = foundApp;
  const appPatches = filterPatchesForApp(STATE.allManifestPatches, foundApp.packageName);
  STATE.patches = appPatches;

  const { allVersions, recommendedVersion } = extractVersionsForApp(appPatches, foundApp.packageName);
  STATE.availableVersions = allVersions;
  STATE.recommendedVersion = recommendedVersion;
  STATE.currentVersion = recommendedVersion;

  STATE.selectedPatches.clear();
  appPatches.forEach(p => {
    if (p.use !== false && p.default !== false) STATE.selectedPatches.add(p.name);
    if (Array.isArray(p.options)) {
      p.options.forEach(opt => {
        if (opt.key && opt.default !== undefined && STATE.selectedOptions[opt.key] === undefined) {
          STATE.selectedOptions[opt.key] = opt.default;
        }
      });
    }
  });

  if (foundApp.packageName === 'com.google.android.youtube' && STATE.goldenPreset) {
    applyGoldenPresetStateOnly();
  }

  renderAppCards();
  renderVersionSelector();
  renderMorphePatchList();
  syncAllSummaries();
  fetchInstalledAppInfo();
  if (STATE.uiMode === 'tui') renderTuiView();
}

async function fetchAndRenderPatches(sourceId) {
  const patchContainer = document.getElementById('patchCategoriesContainer');
  if (patchContainer) {
    patchContainer.innerHTML = '<div class="morphe-spinner"></div>';
  }

  const sourceConfig = STATE.sources.find(s => s.id === sourceId) || STATE.sources[0] || DEFAULT_SOURCES[0];

  try {
    const data = await fetchManifestWithFallback(sourceConfig.manifestUrl);
    const rawList = Array.isArray(data) ? data : (data.patches || []);
    STATE.allManifestPatches = rawList;

    STATE.availableApps = extractSupportedApps(rawList);
    const curPkg = STATE.currentApp?.packageName;
    const exists = STATE.availableApps.find(a => a.packageName === curPkg);
    const initialPkg = exists ? exists.packageName : STATE.availableApps[0].packageName;

    selectApp(initialPkg);
  } catch (err) {
    if (patchContainer) {
      patchContainer.innerHTML = `<div class="morphe-alert text-danger">Failed to load patches: ${escapeHtml(err.message)}</div>`;
    }
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

function exportPreset() {
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rvx-preset-${appAlias}-${STATE.currentSource}-${STATE.currentVersion}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const candidatePorts = [8088, 8089, 8090, 8280, 8080];
  const urlsToTest = [''];
  candidatePorts.forEach((p) => {
    urlsToTest.push(`http://127.0.0.1:${p}`);
    urlsToTest.push(`http://localhost:${p}`);
  });

  for (const url of urlsToTest) {
    try {
      const res = await fetch(`${url}/api/v1/system/status`, { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        const data = await res.json();
        // Ensure this is our RVX Daemon and not another server (e.g. Lynx Kernel Manager)
        if (data && (data.jre_ready !== undefined || data.daemon_version !== undefined)) {
          STATE.daemonOnline = true;
          STATE.daemonUrl = url;
          STATE.daemonVersion = data.daemon_version || '2.1.13';
          setEngineMode('local');
          return;
        }
      }
    } catch (_) {}
  }
  STATE.daemonOnline = false;
  STATE.daemonUrl = '';
  setEngineMode('cloud');
}

async function fetchInstalledAppInfo() {
  const text = document.getElementById('installedVerText');
  if (!STATE.daemonOnline) {
    if (text) text.textContent = 'Cloud Mode';
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
  STATE.engineMode = mode === 'cloud' ? 'cloud' : 'local';
  const btnLocal = document.getElementById('btnEngineLocal');
  const btnCloud = document.getElementById('btnEngineCloud');
  const engineTag = document.getElementById('engineModeTag');

  if (btnLocal && btnCloud) {
    const isLocal = STATE.engineMode === 'local';
    btnLocal.classList.toggle('active', isLocal);
    btnLocal.setAttribute('aria-checked', isLocal ? 'true' : 'false');
    btnCloud.classList.toggle('active', !isLocal);
    btnCloud.setAttribute('aria-checked', !isLocal ? 'true' : 'false');
    if (engineTag) engineTag.textContent = isLocal ? 'On-Device' : 'Cloud';
  }
  syncAllSummaries();
}
