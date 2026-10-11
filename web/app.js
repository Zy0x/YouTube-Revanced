/**
 * YouTube RVX — 1:1 Morphe Manager & Revancify-Xisr Dual-Mode Architecture (v2.1.6)
 * References:
 * - MorpheApp/morphe-manager (Material 3 Dark, 5-Pill Expert Toolbar, Gear Option Modals, Telemetry Logs)
 * - Xisrr1/Revancify-Xisr (Termux CLI dialog TUI Replica)
 */

const STATE = {
  uiMode: localStorage.getItem('rvx_ui_mode') || 'morphe', // 'morphe' | 'tui'
  activeScreen: 'home', // 'home' | 'version' | 'patches' | 'progress'
  tuiScreen: 'main', // 'main' | 'source' | 'version' | 'patches' | 'options' | 'presets' | 'engine' | 'logs'
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
  versionFilter: 'all',
  versionSearch: '',
  versionDisplayLimit: 10,

  patches: [],
  selectedPatches: new Set(),
  selectedOptions: {},
  goldenPreset: null,
  filterEnabledOnly: false,
  activePatchCategory: 'all',
  patchSearchQuery: '',
  editingPatchName: null,

  authToken: localStorage.getItem('rvx_gh_pat') || '',
  authUser: null,
  engineMode: 'local',
  daemonOnline: false,
  daemonUrl: '',
  terminalAutoScroll: true,
  eventSource: null,
  logHistory: [
    { type: 'I', text: 'Morphe Patcher Engine ready. Target: YouTube v21.13.164 (Anddea).' },
    { type: 'I', text: 'Select patches in Expert mode or tap Patch to start.' }
  ]
};

const DEFAULT_SOURCES = [
  {
    id: 'anddea',
    name: 'Anddea',
    repository: 'anddea/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json',
    defaultReleaseType: 'dev',
    isDefault: true,
    fallbackTags: [
      { tag_name: 'v4.3.1-dev.1', name: 'v4.3.1-dev.1 (Prerelease)', prerelease: true },
      { tag_name: 'v4.3.0', name: 'v4.3.0 (Stable)', prerelease: false }
    ]
  },
  {
    id: 'morphe',
    name: 'Morphe Official',
    repository: 'MorpheApp/morphe-patches',
    manifestUrl: 'https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json',
    defaultReleaseType: 'latest',
    isDefault: false,
    fallbackTags: [
      { tag_name: 'v1.18.0', name: 'v1.18.0 (Stable)', prerelease: false }
    ]
  },
  {
    id: 'inotia00',
    name: 'Inotia00 RVX',
    repository: 'inotia00/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/inotia00/revanced-patches/refs/heads/revanced-extended/patches.json',
    defaultReleaseType: 'latest',
    isDefault: false,
    fallbackTags: [
      { tag_name: 'v2.190.1', name: 'v2.190.1 (Stable)', prerelease: false }
    ]
  },
  {
    id: 'revanced',
    name: 'ReVanced',
    repository: 'ReVanced/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/ReVanced/revanced-patches/refs/heads/main/patches.json',
    defaultReleaseType: 'latest',
    isDefault: false,
    fallbackTags: [
      { tag_name: 'v4.16.0', name: 'v4.16.0 (Stable)', prerelease: false }
    ]
  }
];

const FALLBACK_YOUTUBE_VERSIONS = [
  { version: '21.13.164', isBeta: false, title: 'YouTube 21.13.164' },
  { version: '21.12.39', isBeta: false, title: 'YouTube 21.12.39' },
  { version: '21.11.37', isBeta: false, title: 'YouTube 21.11.37' },
  { version: '21.10.40', isBeta: false, title: 'YouTube 21.10.40' },
  { version: '21.09.38', isBeta: false, title: 'YouTube 21.09.38' },
  { version: '21.08.35', isBeta: false, title: 'YouTube 21.08.35' },
  { version: '21.07.247', isBeta: false, title: 'YouTube 21.07.247' },
  { version: '20.51.39', isBeta: false, title: 'YouTube 20.51.39' }
];

// =============================================================================
// Initialization
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initSecurity();
  initNavigation();
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
  const stepNav = document.getElementById('morpheStepNav');
  const termuxBrand = document.getElementById('termuxTopbarBrand');
  const toggleIcon = document.getElementById('uiModeToggleIcon');
  const toggleText = document.getElementById('uiModeToggleText');

  if (morpheApp) morpheApp.classList.toggle('hidden', isTui);
  if (tuiApp) tuiApp.classList.toggle('hidden', !isTui);
  if (stepNav) stepNav.classList.toggle('hidden', isTui);
  if (termuxBrand) termuxBrand.classList.toggle('hidden', !isTui);

  if (toggleIcon) toggleIcon.textContent = isTui ? '🎨' : '>_';
  if (toggleText) toggleText.textContent = isTui ? 'Morphe GUI' : 'Termux TUI';

  const btnMorphe = document.getElementById('btnSettingModeMorphe');
  const btnTui = document.getElementById('btnSettingModeTui');
  if (btnMorphe) btnMorphe.classList.toggle('active', !isTui);
  if (btnTui) btnTui.classList.toggle('active', isTui);

  if (isTui) {
    renderTuiView();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// =============================================================================
// Morphe Screen Navigation (Home -> Version -> Patches -> Progress)
// =============================================================================
function initNavigation() {
  document.querySelectorAll('.step-nav-pill').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

function switchScreen(screenId) {
  STATE.activeScreen = screenId;

  document.querySelectorAll('.step-nav-pill').forEach(btn => {
    const active = btn.dataset.screen === screenId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

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
// Live Viewport Tracker (Infinix Note 50s/11s, Redmi Note 7, Desktop Quarter)
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

    let deviceTag = '';
    if ((w === 392 && h === 778) || (w === 778 && h === 392) || (w === 850 && h === 296)) {
      deviceTag = ' • Infinix Note 50s';
    } else if ((w === 431 && h === 846) || (w === 846 && h === 431) || (w === 901 && h === 347)) {
      deviceTag = ' • Redmi Note 7';
    } else if ((w === 415 && h === 866) || (w === 866 && h === 415) || (w === 946 && h === 335)) {
      deviceTag = ' • Infinix Note 11s';
    } else if ((w === 723 && h === 704) || (w === 704 && h === 723)) {
      deviceTag = ' • Desktop Half';
    } else if ((w === 723 && h === 296) || (w === 296 && h === 723)) {
      deviceTag = ' • Desktop Quarter';
    }

    const label = `${w}×${h} • DPR ${dpr} • ${orientation}${deviceTag}`;
    const textEl = document.getElementById('viewportResolutionText');
    if (textEl) textEl.textContent = label;
    const tuiHint = document.getElementById('tuiViewportHint');
    if (tuiHint) tuiHint.textContent = label;
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
  if (statusText) statusText.textContent = 'Invalid Token';
  return false;
}

// =============================================================================
// Multi-Mirror Manifest Fetch (jsDelivr -> GitHub Raw)
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
  throw new Error('Failed to reach patch source from all mirrors');
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
      optDev.textContent = `⚡ Pre-release / Dev ${latestPre ? `(${latestPre.tag_name})` : ''}`;
      if (sourceConfig.defaultReleaseType === 'dev' || !latestStable) optDev.selected = true;
      select.appendChild(optDev);

      const optStable = document.createElement('option');
      optStable.value = 'latest';
      optStable.textContent = `🛡️ Stable / Official ${latestStable ? `(${latestStable.tag_name})` : ''}`;
      if (sourceConfig.defaultReleaseType === 'latest' && latestStable) optStable.selected = true;
      select.appendChild(optStable);

      if (hint) {
        hint.textContent = `Active repo: ${repo} • ${latestPre?.tag_name || 'dev'}`;
      }
      STATE.patchTag = select.value;
      return;
    }
  } catch (_) {}

  select.innerHTML = `
    <option value="dev" ${sourceConfig.defaultReleaseType === 'dev' ? 'selected' : ''}>⚡ Pre-release / Dev (Latest)</option>
    <option value="latest" ${sourceConfig.defaultReleaseType === 'latest' ? 'selected' : ''}>🛡️ Stable / Official</option>
  `;
  if (hint) hint.textContent = `Zero-API CDN Channel Active (${repo})`;
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

function classifyPatchCategory(patch) {
  const text = `${patch.name || ''} ${patch.description || ''}`.toLowerCase();
  if (['ads', 'sponsor', 'dislike', 'tracking', 'redirect'].some(k => text.includes(k))) return 'ads';
  if (['player', 'playback', 'swipe', 'audio', 'stream', 'speed', 'control', 'seek', 'video', 'quality'].some(k => text.includes(k))) return 'player';
  if (['theme', 'branding', 'overlay', 'icon', 'color', 'dpi', 'button', 'snack', 'amoled', 'header'].some(k => text.includes(k))) return 'theme';
  if (['shorts', 'navigation', 'bar', 'feed', 'pivot', 'tablet', 'layout'].some(k => text.includes(k))) return 'shorts';
  if (['spoof', 'potoken', 'quic', 'version', 'wifi', 'certificate', 'gms', 'microg'].some(k => text.includes(k))) return 'spoof';
  return 'misc';
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
      isBeta: false,
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
        isBeta: Boolean(item.isBeta),
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

    const recBadge = document.getElementById('recommendedVerBadge');
    if (recBadge) recBadge.textContent = recommendedVersion;

    if (!STATE.currentVersion || STATE.currentVersion === 'recommended') {
      STATE.currentVersion = recommendedVersion;
    }

    // Initialize default selection & Golden Preset
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
// Render Morphe Version Picker List (02-apk-availability.jpg)
// =============================================================================
function renderVersionSelector() {
  const container = document.getElementById('versionListContainer');
  if (!container) return;
  container.innerHTML = '';

  const allList = STATE.availableVersions || [];
  let filtered = allList;
  if (STATE.versionFilter === 'recommended') {
    filtered = allList.filter(item => item.isRecommended || item.isManifest);
  } else if (STATE.versionFilter === 'stable') {
    filtered = allList.filter(item => !item.isBeta);
  } else if (STATE.versionFilter === 'beta') {
    filtered = allList.filter(item => item.isBeta);
  }

  if (STATE.versionSearch) {
    const q = STATE.versionSearch.toLowerCase();
    filtered = filtered.filter(item => item.version.toLowerCase().includes(q));
  }

  const limit = STATE.showAllVersions ? filtered.length : (STATE.versionDisplayLimit || 10);
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

      let rightBadge = `<span class="ver-pill-tag">${item.isBeta ? 'Beta' : 'Stable'}</span>`;
      if (item.isRecommended) {
        rightBadge = `<span class="ver-pill-rec">👍 Recommended</span>`;
      } else if (item.isManifest) {
        rightBadge = `<span class="ver-pill-tag">✓ Supported</span>`;
      }

      row.innerHTML = `
        <div class="ver-row-left">
          <span class="ver-check-mark">${isSelected ? '✓' : ''}</span>
          <span class="ver-number-mono">${escapeHtml(ver)}</span>
        </div>
        ${rightBadge}
      `;

      row.addEventListener('click', () => {
        STATE.currentVersion = ver;
        renderVersionSelector();
        syncAllSummaries();
      });

      container.appendChild(row);
    });
  }

  const counterHint = document.getElementById('versionCounterHint');
  if (counterHint) {
    counterHint.textContent = `${displayList.length} of ${filtered.length} versions`;
  }

  const btnLoadMore = document.getElementById('btnLoadMoreVersions');
  if (btnLoadMore) {
    btnLoadMore.style.display = displayList.length >= filtered.length ? 'none' : 'inline-flex';
  }

  const btnToggleAll = document.getElementById('btnToggleAllVersions');
  if (btnToggleAll) {
    btnToggleAll.textContent = STATE.showAllVersions ? '🔼 Show Less' : '📋 Show All';
  }
}

// =============================================================================
// Render Authentic Morphe Flat Patch Cards List (03-patch-selection.jpg)
// =============================================================================
function renderMorphePatchList() {
  const container = document.getElementById('patchCategoriesContainer');
  if (!container) return;
  container.innerHTML = '';

  const query = (STATE.patchSearchQuery || '').toLowerCase().trim();
  const catFilter = STATE.activePatchCategory || 'all';
  const enabledOnly = STATE.filterEnabledOnly;

  const filtered = STATE.patches.filter(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    if (enabledOnly && !isSelected) return false;
    if (catFilter !== 'all' && classifyPatchCategory(patch) !== catFilter) return false;
    if (query) {
      const n = (patch.name || '').toLowerCase();
      const d = (patch.description || '').toLowerCase();
      if (!n.includes(query) && !d.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="morphe-alert">No patches match the current filter.</div>';
    return;
  }

  filtered.forEach(patch => {
    const isSelected = STATE.selectedPatches.has(patch.name);
    const hasOptions = Array.isArray(patch.options) && patch.options.length > 0;

    const card = document.createElement('div');
    card.className = `patch-item ${isSelected ? 'selected' : ''}`;
    card.dataset.patchName = patch.name;

    card.innerHTML = `
      <div class="morphe-circle-check" aria-hidden="true">✓</div>
      <div class="patch-info">
        <div class="patch-title">${escapeHtml(patch.name)}</div>
        <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
      </div>
      ${hasOptions ? `<button type="button" class="morphe-patch-gear-btn" title="Configure ${escapeHtml(patch.name)} options" aria-label="Configure ${escapeHtml(patch.name)} options">⚙️</button>` : ''}
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
// Authentic Morphe Patch Options Modal (02-expert-branding-patch.jpg)
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
          <option value="true" ${isChecked ? 'selected' : ''}>Enabled (true)</option>
          <option value="false" ${!isChecked ? 'selected' : ''}>Disabled (false)</option>
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
    schema_version: '2.1.6',
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
      const presetSheet = document.getElementById('presetSheetModal');
      if (presetSheet) presetSheet.classList.add('hidden');
    } catch (_) {
      alert('Failed to import preset: Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

// =============================================================================
// Synchronize All Counters, Badges & Labels Across Morphe GUI & Termux TUI
// =============================================================================
function syncAllSummaries() {
  const total = STATE.patches.length || 86;
  const active = STATE.selectedPatches.size;
  const ver = STATE.currentVersion || '21.13.164';
  const srcName = getSourceDisplayName(STATE.currentSource);
  const engineLabel = STATE.engineMode === 'local' ? 'On-Device' : 'Cloud Actions';

  setText('navVersionLabel', `v${ver}`);
  setText('navPatchesBadge', String(active));

  setText('homeCardMeta', `v${ver} • ${srcName} Patches (${active}/${total})`);
  setText('homeQuickVer', ver);
  setText('homeQuickCount', `${active}/${total}`);
  setText('homeSummarySource', `${srcName} (${STATE.patchTag})`);
  setText('homeSummaryEngine', engineLabel);
  setText('homeSummaryPreset', `${active} / ${total} active`);

  setText('expertHeaderVer', `v${ver}`);
  setText('expertHeaderSource', `${srcName} Patches`);
  setText('expertCounterText', `${active}/${total}`);

  setText('progressPatchRatio', `${active} / ${total}`);
  setText('sourceSheetPatchCount', `${total} patches ›`);

  setText('tuiHeaderSummary', `YT v${ver} | ${srcName} (${active}/${total})`);
  setText(
    'tuiDialogSubtitle',
    `App: YouTube (com.google.android.youtube) • Version: v${ver} • Source: ${srcName} (${STATE.patchTag}) • Active Patches: ${active}/${total} • Engine: ${engineLabel}`
  );
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// =============================================================================
// Daemon Status & Execution Engine
// =============================================================================
async function checkDaemonStatus() {
  const badge = document.getElementById('daemonStatusBadge');
  const urlsToTest = ['', 'http://127.0.0.1:8080', 'http://localhost:8080'];

  for (const url of urlsToTest) {
    try {
      const res = await fetch(`${url}/api/v1/system/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        STATE.daemonOnline = true;
        STATE.daemonUrl = url;
        if (badge) {
          badge.className = 'daemon-pill daemon-online';
          const txt = badge.querySelector('.daemon-text');
          if (txt) txt.textContent = `v${data.daemon_version}`;
        }
        setEngineMode('local');
        return;
      }
    } catch (_) {}
  }

  STATE.daemonOnline = false;
  STATE.daemonUrl = '';
  if (badge) {
    badge.className = 'daemon-pill daemon-offline';
    const txt = badge.querySelector('.daemon-text');
    if (txt) txt.textContent = 'Cloud';
  }
  setEngineMode('cloud');
}

async function fetchInstalledAppInfo() {
  const text = document.getElementById('installedVerText');
  const homeBadge = document.getElementById('homeInstalledBadge');
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
        if (homeBadge) homeBadge.textContent = `Installed: v${data.installed_version}`;
      } else {
        if (text) text.textContent = 'Host / PC Test Mode';
      }
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
    if (engineTag) engineTag.textContent = isLocal ? 'On-Device Daemon' : 'GitHub Actions Cloud';
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

  const liveDot = document.getElementById('navLiveDot');
  const heroCard = document.getElementById('postPatchHeroCard');
  const subText = document.getElementById('progressStatusSub');
  const pctPill = document.getElementById('progressPercentPill');
  const barFill = document.getElementById('progressBarFill');

  if (liveDot) liveDot.classList.remove('hidden');
  if (heroCard) heroCard.classList.add('hidden');
  if (subText) subText.textContent = 'Applying patches...';
  if (pctPill) pctPill.textContent = '15%';
  if (barFill) barFill.style.width = '15%';

  setText('telemetryCpuVal', '42%');
  setText('telemetryIoVal', '384 KB/s');

  appendTerminalLog(`[Morphe] Starting On-Device Patch for YouTube v${STATE.currentVersion}`, 'I');
  appendTerminalLog(`[Morphe] Source: ${getSourceDisplayName(STATE.currentSource)} (${STATE.patchTag}) • Active Patches: ${STATE.selectedPatches.size}`, 'I');

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
    let stepPct = 20;

    STATE.eventSource = new EventSource(`${STATE.daemonUrl}/api/v1/patch/stream`);
    STATE.eventSource.onmessage = (event) => {
      const line = event.data || '';
      const isOk = line.includes('completed successfully') || line.includes('succeeded');
      const isErr = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');

      appendTerminalLog(line, isErr ? '!' : (isOk ? '✓' : 'I'));

      stepPct = Math.min(95, stepPct + 8);
      if (pctPill) pctPill.textContent = `${stepPct}%`;
      if (barFill) barFill.style.width = `${stepPct}%`;

      if (line.includes('Patching process completed successfully')) {
        if (liveDot) liveDot.classList.add('hidden');
        if (heroCard) heroCard.classList.remove('hidden');
        if (subText) subText.textContent = 'All done! 🎉';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '8%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      } else if (line.includes('Patching failed')) {
        if (liveDot) liveDot.classList.add('hidden');
        if (subText) subText.textContent = 'Patching halted (see logs below)';
        if (pctPill) pctPill.textContent = '100%';
        if (barFill) barFill.style.width = '100%';
        setText('telemetryCpuVal', '6%');
        setText('telemetryIoVal', '0 KB/s');
        if (STATE.eventSource) STATE.eventSource.close();
      }
    };

    STATE.eventSource.onerror = () => {
      if (liveDot) liveDot.classList.add('hidden');
    };
  } catch (err) {
    appendTerminalLog(`Failed to start patching: ${err.message}`, '!');
    if (liveDot) liveDot.classList.add('hidden');
    if (subText) subText.textContent = 'Error starting patcher';
  }
}

async function triggerCloudBuild() {
  if (!STATE.authToken) {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.classList.remove('hidden');
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
      if (statusMsg) statusMsg.textContent = `✅ Build Dispatched! GitHub Actions is patching YouTube v${STATE.currentVersion}.`;
      if (linksBox) linksBox.classList.remove('hidden');
      if (runLink) runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Response code: ${res.status}`);
    }
  } catch (err) {
    if (statusMsg) statusMsg.textContent = `❌ Cloud Build Error: ${err.message}`;
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
    const badgeClass = type === '!' ? 'log-badge-err' : (type === '✓' ? 'log-badge-ok' : 'log-badge-info');
    row.innerHTML = `
      <span class="log-badge ${badgeClass}">${escapeHtml(type)}</span>
      <span class="log-msg">${escapeHtml(line)}</span>
    `;
    list.appendChild(row);
    if (STATE.terminalAutoScroll && feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }

  if (STATE.uiMode === 'tui' && STATE.tuiScreen === 'logs') {
    renderTuiView();
  }
}

// =============================================================================
// Mode 2: 1:1 Termux CLI Revancify-Xisr TUI Renderer (Xisrr1/Revancify-Xisr)
// =============================================================================
function renderTuiView() {
  const titleEl = document.getElementById('tuiDialogTitle');
  const bodyEl = document.getElementById('tuiDialogBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const total = STATE.patches.length || 86;
  const active = STATE.selectedPatches.size;
  const srcName = getSourceDisplayName(STATE.currentSource);

  if (STATE.tuiScreen === 'main') {
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Main Menu |';
    const menuItems = [
      { num: '1', label: 'Patch App', sub: `Build YouTube v${STATE.currentVersion} (${active} patches)`, action: () => triggerBuildPipeline() },
      { num: '2', label: 'Change Source', sub: `${srcName} [${STATE.patchTag}]`, action: () => { STATE.tuiScreen = 'source'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '3', label: 'Select Version', sub: `v${STATE.currentVersion} ${STATE.currentVersion === STATE.recommendedVersion ? '[Recommended]' : ''}`, action: () => { STATE.tuiScreen = 'version'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '4', label: 'Edit Patches', sub: `${active} / ${total} Enabled`, action: () => { STATE.tuiScreen = 'patches'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '5', label: 'Edit Patch Options', sub: 'Configure individual patch options', action: () => { STATE.tuiScreen = 'options'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '6', label: 'Preset Manager', sub: 'Golden Preset / Export / Import JSON', action: () => { STATE.tuiScreen = 'presets'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '7', label: 'Engine & Settings', sub: `Mode: ${STATE.engineMode === 'local' ? 'On-Device Daemon' : 'Cloud Actions'}`, action: () => { document.getElementById('settingsModal')?.classList.remove('hidden'); } }
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
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Change Source |';
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
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Select YouTube Version |';
    (STATE.availableVersions || []).slice(0, 20).forEach((item, idx) => {
      const isCur = item.version === STATE.currentVersion;
      const tag = item.isRecommended ? '[Recommended]' : (item.isManifest ? '[Supported]' : '[Catalog]');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>v${escapeHtml(item.version)}</span>
        </div>
        <span class="tui-row-sub">${tag}</span>
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
    if (titleEl) titleEl.textContent = `| Revancify-Xisr — Edit Patches (${active}/${total}) |`;

    const strip = document.createElement('div');
    strip.className = 'tui-toolbar-strip';
    strip.innerHTML = `
      <button type="button" class="tui-btn" id="tuiBtnAll">[ Enable All ]</button>
      <button type="button" class="tui-btn" id="tuiBtnGolden">[ Golden Preset ]</button>
      <button type="button" class="tui-btn" id="tuiBtnNone">[ Disable All ]</button>
    `;
    bodyEl.appendChild(strip);

    strip.querySelector('#tuiBtnAll')?.addEventListener('click', () => {
      STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
      renderMorphePatchList();
      syncAllSummaries();
      renderTuiView();
    });
    strip.querySelector('#tuiBtnGolden')?.addEventListener('click', () => {
      applyGoldenPreset();
    });
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
        <span class="tui-row-sub">${Array.isArray(p.options) && p.options.length > 0 ? '[⚙️ Opts]' : ''}</span>
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
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Edit Patch Options |';
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
        <span class="tui-row-sub">${p.options.length} options ›</span>
      `;
      row.addEventListener('click', () => {
        openPatchOptionsModal(p);
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'presets') {
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Preset Manager |';
    const items = [
      { num: '1', label: 'Apply Recommended Golden Preset (81/86)', action: () => { applyGoldenPreset(); STATE.tuiScreen = 'main'; renderTuiView(); } },
      { num: '2', label: 'Export Current Preset (.json)', action: () => exportPreset() },
      { num: '3', label: 'Import Preset File (.json)', action: () => document.getElementById('inputImportPreset')?.click() }
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
    if (titleEl) titleEl.textContent = '| Revancify-Xisr — Patcher CLI Output |';
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

  // TUI Footer Buttons
  document.getElementById('btnTuiPrimary')?.addEventListener('click', () => {
    const activeRow = document.querySelector('#tuiDialogBody .tui-menu-row.tui-row-active') || document.querySelector('#tuiDialogBody .tui-menu-row');
    activeRow?.click();
  });
  document.getElementById('btnTuiSecondary')?.addEventListener('click', () => triggerBuildPipeline());
  document.getElementById('btnTuiBack')?.addEventListener('click', () => {
    STATE.tuiScreen = 'main';
    STATE.tuiSelectedIndex = 0;
    renderTuiView();
  });
  document.getElementById('btnTuiExitToGui')?.addEventListener('click', () => setUiMode('morphe'));

  // Home Hero Card Navigation
  document.getElementById('cardHomeYouTube')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    switchScreen('version');
  });
  document.getElementById('btnHomePickVersion')?.addEventListener('click', () => switchScreen('version'));
  document.getElementById('btnHomeExpertPatches')?.addEventListener('click', () => switchScreen('patches'));
  document.getElementById('btnHomePatchNow')?.addEventListener('click', () => triggerBuildPipeline());

  // Home Bottom Dock Modals ([ Sources ] & [ Settings ])
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

  // Version Screen Actions
  document.getElementById('btnVersionToPatches')?.addEventListener('click', () => switchScreen('patches'));
  document.getElementById('btnVersionQuickPatch')?.addEventListener('click', () => triggerBuildPipeline());

  document.querySelectorAll('.morphe-filter-chips .morphe-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.morphe-filter-chips .morphe-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.versionFilter = btn.dataset.filter;
      STATE.versionDisplayLimit = 10;
      renderVersionSelector();
    });
  });

  document.getElementById('inputSearchVersion')?.addEventListener('input', (e) => {
    STATE.versionSearch = e.target.value.trim();
    STATE.versionDisplayLimit = 10;
    renderVersionSelector();
  });

  document.getElementById('btnUseRecommendedVer')?.addEventListener('click', () => {
    STATE.currentVersion = STATE.recommendedVersion;
    renderVersionSelector();
    syncAllSummaries();
  });

  document.getElementById('btnLoadMoreVersions')?.addEventListener('click', () => {
    STATE.versionDisplayLimit = (STATE.versionDisplayLimit || 10) + 15;
    renderVersionSelector();
  });

  document.getElementById('btnToggleAllVersions')?.addEventListener('click', () => {
    STATE.showAllVersions = !STATE.showAllVersions;
    if (!STATE.showAllVersions) STATE.versionDisplayLimit = 10;
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
        isBeta: false,
        isRecommended: false,
        isManifest: false
      });
    }
    STATE.currentVersion = customVer;
    renderVersionSelector();
    syncAllSummaries();
    input.value = '';
  });

  // Expert Mode Patches Header & 5-Pill Toolbar
  document.getElementById('btnFilterEnabledOnly')?.addEventListener('click', (e) => {
    STATE.filterEnabledOnly = !STATE.filterEnabledOnly;
    e.currentTarget.classList.toggle('filter-active', STATE.filterEnabledOnly);
    renderMorphePatchList();
  });

  document.getElementById('btnTogglePatchSearch')?.addEventListener('click', () => {
    const input = document.getElementById('inputSearchPatch');
    if (input) input.focus();
  });

  // 1. Enable All [ ✓✓ ]
  document.getElementById('btnResetPatches')?.addEventListener('click', () => {
    STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
    renderMorphePatchList();
    syncAllSummaries();
  });

  // 2. Golden Preset [ 👍 ]
  document.getElementById('btnLoadGoldenPreset')?.addEventListener('click', () => applyGoldenPreset());
  document.getElementById('btnSheetGolden')?.addEventListener('click', () => {
    applyGoldenPreset();
    document.getElementById('presetSheetModal')?.classList.add('hidden');
  });

  // 3. Restore Default [ ↺ ]
  document.getElementById('btnRestoreDefaultPatches')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    STATE.patches.forEach(p => {
      if (p.use !== false) STATE.selectedPatches.add(p.name);
    });
    renderMorphePatchList();
    syncAllSummaries();
  });

  // 4. Presets Sheet [ 📋 ]
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

  // 5. Disable All [ ✕ ]
  document.getElementById('btnDisableAllPatches')?.addEventListener('click', () => {
    STATE.selectedPatches.clear();
    renderMorphePatchList();
    syncAllSummaries();
  });

  // Patch Search & Category Chips
  document.getElementById('inputSearchPatch')?.addEventListener('input', (e) => {
    STATE.patchSearchQuery = e.target.value;
    renderMorphePatchList();
  });

  document.querySelectorAll('#patchCategoryChips .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#patchCategoryChips .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      STATE.activePatchCategory = chip.dataset.cat;
      renderMorphePatchList();
    });
  });

  // Patch Options Modal Buttons
  document.getElementById('btnClosePatchOptsModal')?.addEventListener('click', () => {
    document.getElementById('patchOptionsModal')?.classList.add('hidden');
  });
  document.getElementById('btnSavePatchOpts')?.addEventListener('click', savePatchOptionsModal);
  document.getElementById('btnResetPatchOpts')?.addEventListener('click', resetPatchOptionsModal);

  // Trigger Patch Buttons
  document.getElementById('btnTriggerBuild')?.addEventListener('click', triggerBuildPipeline);
  document.getElementById('btnProgressStartPatch')?.addEventListener('click', triggerBuildPipeline);

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

  // Settings: Engine & GitHub Token
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
      alertBox.textContent = valid ? `✅ Authenticated as @${STATE.authUser}` : '⚠️ Token saved (verification failed or offline)';
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

  // Logs Controls
  const btnAutoScroll = document.getElementById('btnAutoScroll');
  btnAutoScroll?.addEventListener('click', () => {
    STATE.terminalAutoScroll = !STATE.terminalAutoScroll;
    btnAutoScroll.textContent = STATE.terminalAutoScroll ? 'Scroll: ON' : 'Scroll: OFF';
    btnAutoScroll.classList.toggle('active', STATE.terminalAutoScroll);
  });

  document.getElementById('btnClearLogs')?.addEventListener('click', () => {
    STATE.logHistory = [{ type: 'I', text: 'Logs cleared. Ready.' }];
    const list = document.getElementById('morpheStructuredLogs');
    if (list) {
      list.innerHTML = `
        <div class="morphe-log-row">
          <span class="log-badge log-badge-info">I</span>
          <span class="log-msg">Logs cleared. Ready.</span>
        </div>
      `;
    }
    const rawPre = document.getElementById('terminalLogs');
    if (rawPre) rawPre.textContent = 'Logs cleared. Ready.';
  });

  const btnCopyLogs = document.getElementById('btnCopyLogs');
  btnCopyLogs?.addEventListener('click', () => {
    const text = STATE.logHistory.map(x => `[${x.type}] ${x.text}`).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const span = btnCopyLogs.querySelector('span:last-child');
        if (span) {
          span.textContent = 'Copied!';
          setTimeout(() => { span.textContent = 'Copy'; }, 1600);
        }
      });
    }
  });

  // Post-Patch Mount & Export ZIP
  document.getElementById('btnHeroHotMount')?.addEventListener('click', async () => {
    const alertBox = document.getElementById('heroMountAlert');
    if (alertBox) {
      alertBox.textContent = 'Mounting YouTube RVX into running app...';
      alertBox.className = 'morphe-alert';
      alertBox.classList.remove('hidden');
    }
    try {
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/mount`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (alertBox) {
          alertBox.textContent = '🎉 Mounted! YouTube has been restarted.';
          alertBox.className = 'morphe-alert text-success';
        }
      } else {
        throw new Error(data.error || 'Failed to mount');
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `❌ Mount error: ${err.message}`;
        alertBox.className = 'morphe-alert text-danger';
      }
    }
  });

  document.getElementById('btnHeroExportZip')?.addEventListener('click', async () => {
    const alertBox = document.getElementById('heroMountAlert');
    if (alertBox) {
      alertBox.textContent = 'Packaging flashable ZIP module...';
      alertBox.className = 'morphe-alert';
      alertBox.classList.remove('hidden');
    }
    try {
      const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/export-zip`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (alertBox) {
          alertBox.textContent = `✅ Saved to: ${data.zip_path || '/sdcard/Download'}`;
          alertBox.className = 'morphe-alert text-success';
        }
      } else {
        throw new Error(data.error || 'Failed to export ZIP');
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `❌ Export error: ${err.message}`;
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
    if (title) title.textContent = `ℹ️ Release Notes: ${foundRelease.name || foundRelease.tag_name}`;
    content.textContent = `Tag: ${foundRelease.tag_name}\n\n${foundRelease.body || 'No release notes provided.'}`;
  } else {
    if (title) title.textContent = `ℹ️ Release Notes (${currentTag.toUpperCase()})`;
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
