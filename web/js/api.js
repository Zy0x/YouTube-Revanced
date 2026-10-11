/**
 * YouTube RVX — API & Data Orchestration
 * Version: 2.1.9
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
  const urlsToTry = [];
  if (url.includes('raw.githubusercontent.com')) {
    urlsToTry.push(
      url
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
    );
  }
  urlsToTry.push(url);

  for (const targetUrl of urlsToTry) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) return await res.json();
    } catch (_) {}
  }
  throw new Error('Failed to reach patch source');
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

  STATE.sources = Array.isArray(sourcesData) && sourcesData.length > 0 ? sourcesData : DEFAULT_SOURCES;
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
  renderSourceCards();
  const srcObj = STATE.sources.find(s => s.id === sourceId) || STATE.sources[0];
  await loadPatchReleases(srcObj);
  await fetchAndRenderPatches(sourceId);
  syncAllSummaries();
  if (STATE.uiMode === 'tui') renderTuiView();
}

async function loadPatchReleases(sourceConfig) {
  if (!sourceConfig) return;
  const repo = sourceConfig.repository || 'anddea/revanced-patches';
  const select = document.getElementById('selectPatchRelease');
  const hint = document.getElementById('patchReleaseHint');
  if (!select) return;

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
      if (sourceConfig.defaultReleaseType === 'dev' || !latestStable) optDev.selected = true;
      select.appendChild(optDev);

      const optStable = document.createElement('option');
      optStable.value = 'latest';
      optStable.textContent = `Stable / Official ${latestStable ? `(${latestStable.tag_name})` : ''}`;
      if (sourceConfig.defaultReleaseType === 'latest' && latestStable) optStable.selected = true;
      select.appendChild(optStable);

      if (hint) {
        hint.textContent = `${repo} • ${latestPre?.tag_name || 'dev'}`;
      }
      STATE.patchTag = select.value;
      return;
    }
  } catch (_) {}

  select.innerHTML = `
    <option value="dev" ${sourceConfig.defaultReleaseType === 'dev' ? 'selected' : ''}>Pre-release / Dev</option>
    <option value="latest" ${sourceConfig.defaultReleaseType === 'latest' ? 'selected' : ''}>Stable / Official</option>
  `;
  if (hint) hint.textContent = `${repo}`;
  STATE.patchTag = select.value;
}

function filterPatchesForYouTube(patches, pkgName = 'com.google.android.youtube') {
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
      return compat.some(entry => entry && (entry.name === pkgName || entry === pkgName));
    }
    return true;
  });
}

function extractUniversalVersions(patches, pkgName = 'com.google.android.youtube') {
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
        if (entry && entry.name === pkgName && Array.isArray(entry.versions)) {
          entry.versions.forEach(v => manifestVersions.add(String(v).trim()));
        }
      });
    }
  });

  const sortedManifest = Array.from(manifestVersions)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .reverse();

  const recommended = sortedManifest[0] || '21.13.164';
  const versionsMap = new Map();

  sortedManifest.forEach(ver => {
    versionsMap.set(ver, {
      version: ver,
      isRecommended: ver === recommended,
      isManifest: true
    });
  });

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

  const allVersions = Array.from(versionsMap.values()).sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
    if (a.isManifest !== b.isManifest) return a.isManifest ? -1 : 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
  });

  return { allVersions, recommendedVersion: recommended };
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
    const ytPatches = filterPatchesForYouTube(rawList, 'com.google.android.youtube');
    STATE.patches = ytPatches;

    const { allVersions, recommendedVersion } = extractUniversalVersions(ytPatches);
    STATE.availableVersions = allVersions;
    STATE.recommendedVersion = recommendedVersion;

    if (!STATE.currentVersion || STATE.currentVersion === 'recommended') {
      STATE.currentVersion = recommendedVersion;
    }

    STATE.selectedPatches.clear();
    ytPatches.forEach(p => {
      if (p.use !== false) STATE.selectedPatches.add(p.name);
      if (Array.isArray(p.options)) {
        p.options.forEach(opt => {
          if (opt.key && opt.default !== undefined && STATE.selectedOptions[opt.key] === undefined) {
            STATE.selectedOptions[opt.key] = opt.default;
          }
        });
      }
    });

    if (STATE.goldenPreset) {
      applyGoldenPresetStateOnly();
    }

    renderVersionSelector();
    renderMorphePatchList();
    syncAllSummaries();
    if (STATE.uiMode === 'tui') renderTuiView();
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

  const payload = {
    schema_version: '2.1.9',
    exported_at: new Date().toISOString(),
    patch_source: STATE.currentSource,
    patch_tag: STATE.patchTag,
    target_youtube_version: STATE.currentVersion,
    active_patch_count: STATE.selectedPatches.size,
    included_patches: includedPatches,
    excluded_patches: excludedPatches,
    options: STATE.selectedOptions
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rvx-preset-${STATE.currentSource}-${STATE.currentVersion}.json`;
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
  const urlsToTest = ['', 'http://127.0.0.1:8080', 'http://localhost:8080'];
  for (const url of urlsToTest) {
    try {
      const res = await fetch(`${url}/api/v1/system/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        STATE.daemonOnline = true;
        STATE.daemonUrl = url;
        STATE.daemonVersion = data.daemon_version || '2.1.9';
        setEngineMode('local');
        return;
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
    const res = await fetch(`${STATE.daemonUrl}/api/v1/system/youtube-info`);
    if (res.ok) {
      const data = await res.json();
      if (data.installed_version && data.installed_version !== 'Unknown') {
        STATE.installedVersion = data.installed_version;
        if (text) text.textContent = `v${data.installed_version}`;
      } else {
        if (text) text.textContent = 'Not installed / Host PC';
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
