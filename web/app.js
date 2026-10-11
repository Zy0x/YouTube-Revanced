/**
 * YouTube RVX — 1:1 Morphe Manager & Revancify-Xisr Ultra-Clean Architecture (v2.1.7)
 */

const STATE = {
  uiMode: localStorage.getItem('rvx_ui_mode') || 'morphe',
  activeScreen: 'home', // 'home' | 'version' | 'patches' | 'progress'
  tuiScreen: 'main',
  tuiSelectedIndex: 0,

  sources: [],
  currentSource: 'anddea',
  patchTag: 'dev',
  patchReleases: [],
  currentVersion: '21.13.164',
  showAllVersions: false,
  recommendedVersion: '21.13.164',
  installedVersion: null,
  catalogVersions: [],
  availableVersions: [],
  versionSearch: '',
  versionDisplayLimit: 4,

  patches: [],
  selectedPatches: new Set(),
  selectedOptions: {},
  goldenPreset: null,
  filterEnabledOnly: false,
  patchSearchQuery: '',
  editingPatchName: null,

  authToken: localStorage.getItem('rvx_gh_pat') || '',
  authUser: null,
  engineMode: 'local',
  daemonOnline: false,
  daemonUrl: '',
  daemonVersion: '2.1.7',
  eventSource: null,
  logHistory: [
    { type: 'I', text: 'Remove background playback restrictions succeeded' },
    { type: 'I', text: 'Return YouTube Dislike succeeded' },
    { type: 'I', text: 'SponsorBlock succeeded' },
    { type: 'I', text: 'Spoof video streams succeeded' }
  ]
};

const SVG_CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_GEAR = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const SVG_THUMB = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;

const DEFAULT_SOURCES = [
  {
    id: 'anddea',
    name: 'Anddea',
    repository: 'anddea/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json',
    defaultReleaseType: 'dev',
    isDefault: true
  },
  {
    id: 'morphe',
    name: 'Morphe Official',
    repository: 'MorpheApp/morphe-patches',
    manifestUrl: 'https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json',
    defaultReleaseType: 'latest',
    isDefault: false
  },
  {
    id: 'inotia00',
    name: 'Inotia00 RVX',
    repository: 'inotia00/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/inotia00/revanced-patches/refs/heads/revanced-extended/patches.json',
    defaultReleaseType: 'latest',
    isDefault: false
  },
  {
    id: 'revanced',
    name: 'ReVanced',
    repository: 'ReVanced/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/ReVanced/revanced-patches/refs/heads/main/patches.json',
    defaultReleaseType: 'latest',
    isDefault: false
  }
];

const FALLBACK_YOUTUBE_VERSIONS = [
  { version: '21.13.164', isBeta: false },
  { version: '21.12.39', isBeta: false },
  { version: '21.11.37', isBeta: false },
  { version: '20.51.39', isBeta: false }
];

// =============================================================================
// Initialization
// =============================================================================
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

// =============================================================================
// Dual-Mode Switcher (Morphe Manager 1:1 GUI <-> Termux Revancify-Xisr 1:1 TUI)
// =============================================================================
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

// =============================================================================
// Viewport Telemetry (Stored cleanly inside the (i) Info Modal)
// =============================================================================
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

// =============================================================================
// Security & GitHub Token Verification
// =============================================================================
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

// =============================================================================
// Multi-Mirror Manifest Fetch
// =============================================================================
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

function renderSourceCards() {
  const container = document.getElementById('sourceCardsGrid');
  if (!container) return;
  container.innerHTML = '';

  STATE.sources.forEach(s => {
    const isActive = s.id === STATE.currentSource;
    const shortTitle = getSourceDisplayName(s.id);
    const repo = s.repository || `${s.id}/patches`;

    const card = document.createElement('div');
    card.className = `source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    card.innerHTML = `
      <div class="source-card-header">
        <span>${escapeHtml(shortTitle)}</span>
        <span class="source-card-check">${isActive ? '✓' : ''}</span>
      </div>
      <div class="source-card-repo">${escapeHtml(repo)}</div>
    `;

    card.addEventListener('click', async () => {
      await selectPatchSource(s.id);
    });

    container.appendChild(card);
  });

  const activeSrc = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  const repoLink = document.getElementById('linkSourceRepo');
  if (repoLink && activeSrc && activeSrc.repository) {
    repoLink.href = `https://github.com/${activeSrc.repository}`;
  }
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

// =============================================================================
// Filter Patches & Extract YouTube Versions
// =============================================================================
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

// =============================================================================
// Render 1:1 Morphe Version List (02-apk-availability.jpg — Clean, No Badge Spam)
// =============================================================================
function renderVersionSelector() {
  const container = document.getElementById('versionListContainer');
  if (!container) return;
  container.innerHTML = '';

  let filtered = STATE.availableVersions || [];
  if (STATE.versionSearch) {
    const q = STATE.versionSearch.toLowerCase();
    filtered = filtered.filter(item => item.version.toLowerCase().includes(q));
  }

  const limit = STATE.showAllVersions ? 25 : (STATE.versionDisplayLimit || 4);
  const displayList = filtered.slice(0, limit);

  if (displayList.length === 0) {
    container.innerHTML = '<div class="morphe-ver-row"><span class="morphe-muted-hint">No matching versions found.</span></div>';
  } else {
    displayList.forEach(item => {
      const ver = item.version;
      const isSelected = ver === STATE.currentVersion;
      const row = document.createElement('div');
      row.className = `morphe-ver-row ${isSelected ? 'active' : ''}`;
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', isSelected ? 'true' : 'false');

      // Only show the blue "Recommended" pill on the recommended version, matching 02-apk-availability.jpg 1:1
      const rightHtml = item.isRecommended
        ? `<span class="ver-pill-rec">${SVG_THUMB}<span>Recommended</span></span>`
        : '';

      row.innerHTML = `
        <div class="ver-row-left">
          <span class="ver-check-mark">${isSelected ? SVG_CHECK : ''}</span>
          <span class="ver-number-mono">${escapeHtml(ver)}</span>
        </div>
        ${rightHtml}
      `;

      row.addEventListener('click', () => {
        STATE.currentVersion = ver;
        renderVersionSelector();
        syncAllSummaries();
      });

      container.appendChild(row);
    });
  }

  const btnToggleAll = document.getElementById('btnToggleAllVersions');
  if (btnToggleAll) {
    btnToggleAll.textContent = STATE.showAllVersions ? 'Show fewer versions' : 'Show more versions';
  }
}

// =============================================================================
// Render 1:1 Morphe Flat Patch Cards (03-patch-selection.jpg)
// =============================================================================
function renderMorphePatchList() {
  const container = document.getElementById('patchCategoriesContainer');
  if (!container) return;
  container.innerHTML = '';

  const query = (STATE.patchSearchQuery || '').toLowerCase().trim();
  const enabledOnly = STATE.filterEnabledOnly;

  const filtered = STATE.patches.filter(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    if (enabledOnly && !isSelected) return false;
    if (query) {
      const n = (patch.name || '').toLowerCase();
      const d = (patch.description || '').toLowerCase();
      if (!n.includes(query) && !d.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="morphe-alert">No matching patches.</div>';
    return;
  }

  filtered.forEach(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    const hasOptions = Array.isArray(patch.options) && patch.options.length > 0;

    const card = document.createElement('div');
    card.className = `patch-item ${isSelected ? 'selected' : ''}`;
    card.dataset.patchName = patch.name;

    card.innerHTML = `
      <div class="morphe-circle-check" aria-hidden="true">${SVG_CHECK}</div>
      <div class="patch-info">
        <div class="patch-title">${escapeHtml(patch.name)}</div>
        <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
      </div>
      ${hasOptions ? `<button type="button" class="morphe-patch-gear-btn" title="Configure ${escapeHtml(patch.name)}" aria-label="Configure ${escapeHtml(patch.name)}">${SVG_GEAR}</button>` : ''}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.morphe-patch-gear-btn')) {
        e.stopPropagation();
        openPatchOptionsModal(patch);
        return;
      }
      if (STATE.selectedPatches.has(patch.name)) {
        STATE.selectedPatches.delete(patch.name);
        card.classList.remove('selected');
      } else {
        STATE.selectedPatches.add(patch.name);
        card.classList.add('selected');
      }
      syncAllSummaries();
    });

    container.appendChild(card);
  });
}

// =============================================================================
// Morphe Patch Options Modal (02-expert-branding-patch.jpg)
// =============================================================================
function openPatchOptionsModal(patch) {
  const modal = document.getElementById('patchOptionsModal');
  const titleEl = document.getElementById('modalPatchOptsTitle');
  const descEl = document.getElementById('modalPatchOptsDesc');
  const bodyEl = document.getElementById('modalPatchOptsBody');
  if (!modal || !bodyEl) return;

  STATE.editingPatchName = patch.name;
  if (titleEl) titleEl.textContent = patch.name;
  if (descEl) descEl.textContent = patch.description || '';
  bodyEl.innerHTML = '';

  const options = Array.isArray(patch.options) ? patch.options : [];
  options.forEach(opt => {
    const key = opt.key;
    const title = opt.title || key;
    const rawDef = opt.default;
    const currentVal = STATE.selectedOptions[key] !== undefined ? STATE.selectedOptions[key] : rawDef;
    const optType = (opt.type || '').toLowerCase();

    const optCard = document.createElement('div');
    optCard.className = 'morphe-opt-card';

    let controlHtml = '';
    if (optType === 'boolean' || typeof rawDef === 'boolean') {
      const isChecked = currentVal === true || currentVal === 'true';
      controlHtml = `
        <select class="morphe-select modal-opt-input" data-opt-key="${escapeHtml(key)}" data-opt-type="boolean">
          <option value="true" ${isChecked ? 'selected' : ''}>Enabled</option>
          <option value="false" ${!isChecked ? 'selected' : ''}>Disabled</option>
        </select>
      `;
    } else if (Array.isArray(opt.possibleValues) && opt.possibleValues.length > 0) {
      controlHtml = `<select class="morphe-select modal-opt-input" data-opt-key="${escapeHtml(key)}">`;
      opt.possibleValues.forEach(val => {
        const sel = String(val) === String(currentVal ?? '') ? 'selected' : '';
        controlHtml += `<option value="${escapeHtml(String(val))}" ${sel}>${escapeHtml(String(val))}</option>`;
      });
      controlHtml += `</select>`;
    } else {
      controlHtml = `<input type="text" class="morphe-input modal-opt-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(String(currentVal ?? ''))}">`;
    }

    optCard.innerHTML = `
      <div class="morphe-opt-header">
        <span class="morphe-opt-title">${escapeHtml(title)}</span>
        <span class="morphe-opt-key">${escapeHtml(key)}</span>
      </div>
      ${opt.description ? `<p class="morphe-muted-hint">${escapeHtml(opt.description)}</p>` : ''}
      ${controlHtml}
    `;

    bodyEl.appendChild(optCard);
  });

  modal.classList.remove('hidden');
}

function savePatchOptionsModal() {
  const bodyEl = document.getElementById('modalPatchOptsBody');
  const modal = document.getElementById('patchOptionsModal');
  if (bodyEl) {
    bodyEl.querySelectorAll('.modal-opt-input').forEach(input => {
      const key = input.dataset.optKey;
      if (input.dataset.optType === 'boolean') {
        STATE.selectedOptions[key] = input.value === 'true';
      } else {
        STATE.selectedOptions[key] = input.value;
      }
    });
  }
  if (modal) modal.classList.add('hidden');
  if (STATE.uiMode === 'tui') renderTuiView();
}

function resetPatchOptionsModal() {
  const patch = STATE.patches.find(p => p.name === STATE.editingPatchName);
  if (!patch || !Array.isArray(patch.options)) return;
  patch.options.forEach(opt => {
    if (opt.key) STATE.selectedOptions[opt.key] = opt.default;
  });
  openPatchOptionsModal(patch);
}

// =============================================================================
// Golden Preset & Export / Import JSON
// =============================================================================
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
    schema_version: '2.1.7',
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

// =============================================================================
// Synchronize Clean Labels & Info (i) Modal Fields
// =============================================================================
function syncAllSummaries() {
  const total = STATE.patches.length || 83;
  const active = STATE.selectedPatches.size;
  const ver = STATE.currentVersion || '21.13.164';
  const srcName = getSourceDisplayName(STATE.currentSource);
  const statusSuffix = STATE.installedVersion ? 'Installed' : 'Not patched yet';

  // 1:1 Home Card Subtitle ("v21.13.164 • Not patched yet")
  setText('homeCardMeta', `v${ver} • ${statusSuffix}`);

  // 1:1 Expert Mode Header
  setText('expertHeaderSource', `${srcName} Patches`);
  setText('expertCounterText', `${active}/${total}`);

  // 1:1 Progress Screen
  setText('progressPatchRatio', `${active} / ${total}`);
  setText('sourceSheetPatchCount', `${total} ›`);

  // Info (i) Modal Fields
  setText('infoTargetVersion', `v${ver}`);
  setText('infoActiveSource', `${srcName} (${STATE.patchTag})`);
  setText('infoActivePatches', `${active} / ${total}`);
  setText(
    'infoEngineStatus',
    STATE.engineMode === 'local'
      ? `On-Device Daemon (v${STATE.daemonVersion})`
      : 'GitHub Actions Cloud'
  );

  // Termux TUI Subtitle
  setText('tuiDialogSubtitle', `YouTube v${ver} • ${srcName} (${active}/${total})`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// =============================================================================
// Daemon Status & Execution Engine
// =============================================================================
async function checkDaemonStatus() {
  const urlsToTest = ['', 'http://127.0.0.1:8080', 'http://localhost:8080'];
  for (const url of urlsToTest) {
    try {
      const res = await fetch(`${url}/api/v1/system/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        STATE.daemonOnline = true;
        STATE.daemonUrl = url;
        STATE.daemonVersion = data.daemon_version || '2.1.7';
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

// =============================================================================
// Patching Execution & Morphe Progress Logs (05-patching-progress.jpg)
// =============================================================================
function triggerBuildPipeline() {
  if (STATE.engineMode === 'local') {
    triggerLocalPatch();
  } else {
    triggerCloudBuild();
  }
}

async function triggerLocalPatch() {
  if (STATE.uiMode === 'morphe') {
    switchScreen('progress');
  } else {
    STATE.tuiScreen = 'logs';
    renderTuiView();
  }

  const heroCard = document.getElementById('postPatchHeroCard');
  const subText = document.getElementById('progressStatusSub');
  const pctPill = document.getElementById('progressPercentPill');
  const barFill = document.getElementById('progressBarFill');

  if (heroCard) heroCard.classList.add('hidden');
  if (subText) subText.textContent = 'Applying patches';
  if (pctPill) pctPill.textContent = '15%';
  if (barFill) barFill.style.width = '15%';

  setText('telemetryCpuVal', '41%');
  setText('telemetryIoVal', '240 KB/s');

  appendTerminalLog(`Starting patcher for YouTube v${STATE.currentVersion}`, 'I');

  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  const payload = {
    target_version: STATE.currentVersion,
    patch_source: STATE.currentSource,
    patch_tag: STATE.patchTag,
    is_root: true,
    included_patches: includedPatches,
    excluded_patches: excludedPatches,
    options: STATE.selectedOptions
  };

  try {
    const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (STATE.eventSource) STATE.eventSource.close();
    let stepPct = 22;

    STATE.eventSource = new EventSource(`${STATE.daemonUrl}/api/v1/patch/stream`);
    STATE.eventSource.onmessage = (event) => {
      const line = event.data || '';
      const isOk = line.includes('completed successfully') || line.includes('succeeded');
      const isErr = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');

      appendTerminalLog(line, isErr ? '!' : (isOk ? 'I' : 'I'));

      stepPct = Math.min(96, stepPct + 8);
      if (pctPill) pctPill.textContent = `${stepPct}%`;
      if (barFill) barFill.style.width = `${stepPct}%`;

      if (line.includes('Patching process completed successfully')) {
        if (heroCard) heroCard.classList.remove('hidden');
        if (subText) subText.textContent = 'All done!';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '6%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      } else if (line.includes('Patching failed')) {
        if (subText) subText.textContent = 'Patching halted';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '4%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      }
    };
  } catch (err) {
    appendTerminalLog(`Failed to start patching: ${err.message}`, '!');
    if (subText) subText.textContent = 'Error';
  }
}

async function triggerCloudBuild() {
  if (!STATE.authToken) {
    document.getElementById('settingsModal')?.classList.remove('hidden');
    return;
  }

  const progressModal = document.getElementById('buildProgressModal');
  const statusMsg = document.getElementById('buildStatusMsg');
  const linksBox = document.getElementById('buildActionLinks');
  const runLink = document.getElementById('linkActionsRun');

  if (progressModal) progressModal.classList.remove('hidden');
  if (linksBox) linksBox.classList.add('hidden');
  if (statusMsg) statusMsg.textContent = 'Connecting to GitHub Actions runner...';

  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  try {
    const payload = {
      event_type: 'build-rvx',
      client_payload: {
        youtube_version: STATE.currentVersion,
        patch_source: STATE.currentSource,
        patch_tag: STATE.patchTag || 'dev',
        arch: 'all',
        build_mode: 'test',
        included_patches: includedPatches,
        excluded_patches: excludedPatches,
        options: STATE.selectedOptions
      }
    };

    const res = await fetch('https://api.github.com/repos/Zy0x/YouTube-Revanced/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STATE.authToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 204 || res.ok) {
      if (statusMsg) statusMsg.textContent = `Build Dispatched for YouTube v${STATE.currentVersion}.`;
      if (linksBox) linksBox.classList.remove('hidden');
      if (runLink) runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Response code: ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) statusMsg.textContent = `Cloud Build Error: ${err.message}`;
  }
}

function appendTerminalLog(line, type = 'I') {
  STATE.logHistory.push({ type, text: line });

  const rawPre = document.getElementById('terminalLogs');
  if (rawPre) rawPre.textContent += `\n${line}`;

  const list = document.getElementById('morpheStructuredLogs');
  const feed = document.getElementById('terminalBody');
  if (list) {
    const row = document.createElement('div');
    row.className = 'morphe-log-row';
    const badgeClass = type === '!' ? 'log-badge-err' : 'log-badge-info';
    row.innerHTML = `
      <span class="log-badge ${badgeClass}">${escapeHtml(type)}</span>
      <span class="log-msg">${escapeHtml(line)}</span>
    `;
    list.appendChild(row);
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  if (STATE.uiMode === 'tui' && STATE.tuiScreen === 'logs') {
    renderTuiView();
  }
}

// =============================================================================
// Mode 2: 1:1 Termux CLI Revancify-Xisr TUI Renderer
// =============================================================================
function renderTuiView() {
  const titleEl = document.getElementById('tuiDialogTitle');
  const bodyEl = document.getElementById('tuiDialogBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const total = STATE.patches.length || 83;
  const active = STATE.selectedPatches.size;
  const srcName = getSourceDisplayName(STATE.currentSource);

  if (STATE.tuiScreen === 'main') {
    if (titleEl) titleEl.textContent = '| Main Menu |';
    const menuItems = [
      { num: '1', label: 'Patch App', sub: `v${STATE.currentVersion}`, action: () => triggerBuildPipeline() },
      { num: '2', label: 'Change Source', sub: srcName, action: () => { STATE.tuiScreen = 'source'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '3', label: 'Select Version', sub: `v${STATE.currentVersion}`, action: () => { STATE.tuiScreen = 'version'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '4', label: 'Edit Patches', sub: `${active}/${total}`, action: () => { STATE.tuiScreen = 'patches'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '5', label: 'Edit Patch Options', sub: 'Options', action: () => { STATE.tuiScreen = 'options'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '6', label: 'Preset Manager', sub: 'JSON', action: () => { STATE.tuiScreen = 'presets'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '7', label: 'Settings', sub: STATE.engineMode === 'local' ? 'Local' : 'Cloud', action: () => { document.getElementById('settingsModal')?.classList.remove('hidden'); } }
    ];

    menuItems.forEach((item, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${item.num}</span>
          <span>${escapeHtml(item.label)}</span>
        </div>
        <span class="tui-row-sub">${escapeHtml(item.sub)}</span>
      `;
      row.addEventListener('click', () => {
        STATE.tuiSelectedIndex = idx;
        item.action();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'source') {
    if (titleEl) titleEl.textContent = '| Change Source |';
    STATE.sources.forEach((s, idx) => {
      const isCur = s.id === STATE.currentSource;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>${escapeHtml(getSourceDisplayName(s.id))}</span>
        </div>
        <span class="tui-row-sub">${escapeHtml(s.repository || '')}</span>
      `;
      row.addEventListener('click', async () => {
        STATE.tuiSelectedIndex = idx;
        await selectPatchSource(s.id);
        STATE.tuiScreen = 'main';
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'version') {
    if (titleEl) titleEl.textContent = '| Select Version |';
    (STATE.availableVersions || []).slice(0, 15).forEach((item, idx) => {
      const isCur = item.version === STATE.currentVersion;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>${escapeHtml(item.version)}</span>
        </div>
        <span class="tui-row-sub">${item.isRecommended ? '[Rec]' : ''}</span>
      `;
      row.addEventListener('click', () => {
        STATE.currentVersion = item.version;
        STATE.tuiSelectedIndex = idx;
        renderVersionSelector();
        syncAllSummaries();
        STATE.tuiScreen = 'main';
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'patches') {
    if (titleEl) titleEl.textContent = `| Edit Patches (${active}/${total}) |`;
    const strip = document.createElement('div');
    strip.className = 'tui-toolbar-strip';
    strip.innerHTML = `
      <button type="button" class="tui-btn" id="tuiBtnAll">[ All ]</button>
      <button type="button" class="tui-btn" id="tuiBtnGolden">[ Golden ]</button>
      <button type="button" class="tui-btn" id="tuiBtnNone">[ None ]</button>
    `;
    bodyEl.appendChild(strip);

    strip.querySelector('#tuiBtnAll')?.addEventListener('click', () => {
      STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
      renderMorphePatchList();
      syncAllSummaries();
      renderTuiView();
    });
    strip.querySelector('#tuiBtnGolden')?.addEventListener('click', () => applyGoldenPreset());
    strip.querySelector('#tuiBtnNone')?.addEventListener('click', () => {
      STATE.selectedPatches.clear();
      renderMorphePatchList();
      syncAllSummaries();
      renderTuiView();
    });

    STATE.patches.forEach((p, idx) => {
      const isSel = STATE.selectedPatches.has(p.name);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isSel ? '[*]' : '[ ]'}</span>
          <span>${escapeHtml(p.name)}</span>
        </div>
      `;
      row.addEventListener('click', () => {
        STATE.tuiSelectedIndex = idx;
        if (STATE.selectedPatches.has(p.name)) {
          STATE.selectedPatches.delete(p.name);
        } else {
          STATE.selectedPatches.add(p.name);
        }
        renderMorphePatchList();
        syncAllSummaries();
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'options') {
    if (titleEl) titleEl.textContent = '| Patch Options |';
    const patchesWithOpts = STATE.patches.filter(p => Array.isArray(p.options) && p.options.length > 0);
    patchesWithOpts.forEach((p, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${idx + 1}</span>
          <span>${escapeHtml(p.name)}</span>
        </div>
        <span class="tui-row-sub">${p.options.length} ›</span>
      `;
      row.addEventListener('click', () => openPatchOptionsModal(p));
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'presets') {
    if (titleEl) titleEl.textContent = '| Presets |';
    const items = [
      { num: '1', label: 'Apply Golden Preset', action: () => { applyGoldenPreset(); STATE.tuiScreen = 'main'; renderTuiView(); } },
      { num: '2', label: 'Export Preset (.json)', action: () => exportPreset() },
      { num: '3', label: 'Import Preset (.json)', action: () => document.getElementById('inputImportPreset')?.click() }
    ];
    items.forEach((it, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === 0 ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${it.num}</span>
          <span>${escapeHtml(it.label)}</span>
        </div>
      `;
      row.addEventListener('click', it.action);
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'logs') {
    if (titleEl) titleEl.textContent = '| Patcher Output |';
    STATE.logHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'morphe-log-row';
      div.innerHTML = `
        <span class="log-badge log-badge-info">${escapeHtml(entry.type)}</span>
        <span class="log-msg">${escapeHtml(entry.text)}</span>
      `;
      bodyEl.appendChild(div);
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
}

function initKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (STATE.uiMode !== 'tui') return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    const rows = Array.from(document.querySelectorAll('#tuiDialogBody .tui-menu-row'));
    if (rows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      STATE.tuiSelectedIndex = (STATE.tuiSelectedIndex + 1) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('tui-row-active', i === STATE.tuiSelectedIndex));
      rows[STATE.tuiSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      STATE.tuiSelectedIndex = (STATE.tuiSelectedIndex - 1 + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('tui-row-active', i === STATE.tuiSelectedIndex));
      rows[STATE.tuiSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[STATE.tuiSelectedIndex]?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      STATE.tuiScreen = 'main';
      STATE.tuiSelectedIndex = 0;
      renderTuiView();
    }
  });
}

// =============================================================================
// Event Listeners & Modal Bindings
// =============================================================================
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
    document.getElementById('sourcesModal')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseSourcesModal')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
  });
  document.getElementById('btnDoneSourcesModal')?.addEventListener('click', () => {
    document.getElementById('sourcesModal')?.classList.add('hidden');
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
          alertBox.textContent = `Saved to: ${data.zip_path || '/sdcard/Download'}`;
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

function showPatchNotesModal() {
  const modal = document.getElementById('patchNotesModal');
  const content = document.getElementById('patchNotesContent');
  const title = document.getElementById('modalPatchNotesTitle');
  if (!modal || !content) return;

  const currentTag = STATE.patchTag || 'dev';
  const releases = STATE.patchReleases || [];
  let foundRelease = null;

  if (currentTag === 'dev') {
    foundRelease = releases.find(r => r.prerelease) || releases[0];
  } else if (currentTag === 'latest') {
    foundRelease = releases.find(r => !r.prerelease) || releases[0];
  } else {
    foundRelease = releases.find(r => r.tag_name === currentTag);
  }

  if (foundRelease) {
    if (title) title.textContent = `Release Notes: ${foundRelease.name || foundRelease.tag_name}`;
    content.textContent = `Tag: ${foundRelease.tag_name}\n\n${foundRelease.body || 'No release notes provided.'}`;
  } else {
    if (title) title.textContent = `Release Notes (${currentTag.toUpperCase()})`;
    content.textContent = `Active Channel: ${currentTag.toUpperCase()}\nSource: ${getSourceDisplayName(STATE.currentSource)}`;
  }

  modal.classList.remove('hidden');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
