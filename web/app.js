/**
 * YouTube RVX Patcher - Morphe Mobile-First Web Architecture
 * Universal Multi-Source Parser, Step-Based Navigation, Adaptive Viewports
 */

const STATE = {
  sources: [],
  currentSource: 'anddea',
  patchTag: 'dev',
  patchReleases: [],
  buildArch: 'all',
  currentVersion: '21.13.164',
  showAllVersions: false,
  recommendedVersion: '21.13.164',
  installedVersion: null,
  catalogVersions: [],
  availableVersions: [],
  versionFilter: 'all',
  versionSearch: '',
  versionDisplayLimit: 12,
  patches: [],
  selectedPatches: new Set(),
  selectedOptions: {},
  goldenPreset: null,
  authToken: localStorage.getItem('rvx_gh_pat') || '',
  authPasscode: localStorage.getItem('rvx_passcode') || '',
  authUser: null,
  // Dual-Engine & On-Device Daemon State
  engineMode: 'local',
  daemonOnline: false,
  daemonUrl: '',
  terminalAutoScroll: true,
  eventSource: null,
  activeTab: 'source'
};

// =============================================================================
// Application Initialization
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initSecurity();
  initTabs();
  initEngineSwitcher();
  initViewportTracker();
  initEventListeners();
  await checkDaemonStatus();
  await loadSourcesAndPresets();
  await fetchAndRenderPatches(STATE.currentSource);
  await fetchInstalledAppInfo();
  updateBottomBarSummary();
  registerServiceWorker();
});

// =============================================================================
// Morphe Tab Navigation System (Step-Based Flow)
// =============================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const railButtons = document.querySelectorAll('.rail-tab-btn');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  railButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  STATE.activeTab = tabId;

  // Sync top tab bar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isTarget = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // Sync landscape rail
  document.querySelectorAll('.rail-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Sync tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tabPane${capitalize(tabId)}`);
  if (activePane) {
    activePane.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// Live Viewport Tracker (For Testing Infinix, Redmi & Desktop Quarter)
// =============================================================================
function initViewportTracker() {
  const updateMetrics = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
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

    const textEl = document.getElementById('viewportResolutionText');
    if (textEl) {
      textEl.textContent = `📐 ${w} × ${h} px • DPR: ${dpr} • ${orientation}${deviceTag}`;
    }
  };

  window.addEventListener('resize', updateMetrics);
  window.addEventListener('orientationchange', updateMetrics);
  updateMetrics();
}

// =============================================================================
// Security & Gatekeeper Authentication
// =============================================================================
function initSecurity() {
  const token = STATE.authToken;
  const statusIcon = document.getElementById('authStatusIcon');
  const statusText = document.getElementById('authStatusText');

  if (token) {
    verifyGithubToken(token);
  } else {
    if (statusIcon) statusIcon.textContent = '🔒';
    if (statusText) statusText.textContent = 'Guest';
  }
}

async function verifyGithubToken(token) {
  const statusIcon = document.getElementById('authStatusIcon');
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
      if (statusIcon) statusIcon.textContent = '🟢';
      if (statusText) statusText.textContent = `@${user.login}`;
      return true;
    } else {
      throw new Error('Token is invalid or expired');
    }
  } catch (err) {
    if (statusIcon) statusIcon.textContent = '⚠️';
    if (statusText) statusText.textContent = 'Invalid';
    return false;
  }
}

const DEFAULT_SOURCES = [
  {
    id: "anddea",
    name: "Anddea Patches (Default)",
    repository: "anddea/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json",
    manifestCdnUrl: "https://cdn.jsdelivr.net/gh/anddea/revanced-patches@main/patches-list.json",
    defaultReleaseType: "dev",
    isDefault: true,
    description: "Primary patch source featuring full customization and rich features for YouTube RVX.",
    fallbackTags: [
      { tag_name: "v4.3.1-dev.1", name: "v4.3.1-dev.1 (Prerelease)", prerelease: true },
      { tag_name: "v4.3.0", name: "v4.3.0 (Stable)", prerelease: false }
    ]
  },
  {
    id: "morphe",
    name: "Morphe Official",
    repository: "MorpheApp/morphe-patches",
    manifestUrl: "https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json",
    manifestCdnUrl: "https://cdn.jsdelivr.net/gh/MorpheApp/morphe-patches@main/patches-list.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Official patch source from the MorpheApp team.",
    fallbackTags: [
      { tag_name: "v1.18.0", name: "v1.18.0 (Stable)", prerelease: false }
    ]
  },
  {
    id: "inotia00",
    name: "Inotia00 (ReVanced Extended)",
    repository: "inotia00/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/inotia00/revanced-patches/refs/heads/revanced-extended/patches.json",
    manifestCdnUrl: "https://cdn.jsdelivr.net/gh/inotia00/revanced-patches@revanced-extended/patches.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Classic ReVanced Extended patches by developer inotia00.",
    fallbackTags: [
      { tag_name: "v2.190.1", name: "v2.190.1 (Stable)", prerelease: false }
    ]
  },
  {
    id: "revanced",
    name: "ReVanced Official",
    repository: "ReVanced/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/ReVanced/revanced-patches/refs/heads/main/patches.json",
    manifestCdnUrl: "https://cdn.jsdelivr.net/gh/ReVanced/revanced-patches@main/patches.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Official patches from the ReVanced Team.",
    fallbackTags: [
      { tag_name: "v4.16.0", name: "v4.16.0 (Stable)", prerelease: false }
    ]
  }
];

// =============================================================================
// Helper Fetch with Multi-Mirror CDN (jsDelivr -> GitHub Raw)
// =============================================================================
async function fetchManifestWithFallback(url) {
  const urlsToTry = [];

  if (url.includes('raw.githubusercontent.com')) {
    const jsd = url
      .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
      .replace('/refs/heads/', '@');
    urlsToTry.push(jsd);
  }

  urlsToTry.push(url);

  for (const targetUrl of urlsToTry) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`[RVX] Failed to fetch from ${targetUrl}, trying next mirror...`, e);
    }
  }

  throw new Error('Failed to reach patch source from all mirrors (jsDelivr & GitHub Raw)');
}

// =============================================================================
// Load Sources, Presets & APKMirror Catalog
// =============================================================================
async function loadSourcesAndPresets() {
  try {
    const [sourcesRes, presetRes, versionsRes] = await Promise.all([
      fetch('config/sources.json').catch(() => null) || fetch('../config/sources.json').catch(() => null),
      fetch('config/golden-preset.json').catch(() => null) || fetch('../config/golden-preset.json').catch(() => null),
      fetch('config/youtube-versions.json').catch(() => null) || fetch('../config/youtube-versions.json').catch(() => null)
    ]);

    if (sourcesRes && sourcesRes.ok) {
      STATE.sources = await sourcesRes.json();
    } else {
      STATE.sources = DEFAULT_SOURCES;
    }

    if (presetRes && presetRes.ok) {
      STATE.goldenPreset = await presetRes.json();
    }

    if (versionsRes && versionsRes.ok) {
      STATE.catalogVersions = await versionsRes.json();
    } else {
      try {
        const cdnRes = await fetch('https://cdn.jsdelivr.net/gh/Zy0x/YouTube-Revanced@main/config/youtube-versions.json');
        if (cdnRes.ok) {
          STATE.catalogVersions = await cdnRes.json();
        }
      } catch (e) {
        console.warn('Failed to load version catalog from CDN:', e);
      }
    }
  } catch (err) {
    STATE.sources = DEFAULT_SOURCES;
  }

  renderSourceCards();
  const currentSrcConfig = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  await loadPatchReleases(currentSrcConfig);
}

function renderSourceCards() {
  const container = document.getElementById('sourceCardsGrid');
  if (!container) return;
  container.innerHTML = '';

  STATE.sources.forEach(s => {
    const card = document.createElement('div');
    const isActive = s.id === STATE.currentSource;
    card.className = `source-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');

    card.innerHTML = `
      <div class="source-card-header">
        <span class="source-card-title">${escapeHtml(s.name)}</span>
        ${isActive ? '<span class="headline-tag">Selected</span>' : ''}
      </div>
      <div class="source-card-desc">${escapeHtml(s.description || '')}</div>
    `;

    card.addEventListener('click', async () => {
      document.querySelectorAll('.source-card').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-checked', 'true');
      STATE.currentSource = s.id;

      const tagBadge = document.getElementById('sourceTagBadge');
      if (tagBadge) tagBadge.textContent = s.name.split(' ')[0];

      await loadPatchReleases(s);
      await fetchAndRenderPatches(s.id);
    });

    container.appendChild(card);
  });
}

// =============================================================================
// Fetch Patch Release (.mpp) Channels with Zero-API Rate-Limit Protection
// =============================================================================
async function loadPatchReleases(sourceConfig) {
  if (!sourceConfig) return;
  const repo = sourceConfig.repository || 'anddea/revanced-patches';
  const select = document.getElementById('selectPatchRelease');
  const hint = document.getElementById('patchReleaseHint');
  if (!select) return;

  hint.textContent = `Connecting to release mirrors (${repo})...`;

  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (STATE.authToken) {
      headers['Authorization'] = `Bearer ${STATE.authToken}`;
    }
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=15`, { headers });
    if (res.ok) {
      const releases = await res.json();
      STATE.patchReleases = releases;

      const latestPre = releases.find(r => r.prerelease);
      const latestStable = releases.find(r => !r.prerelease);

      select.innerHTML = '';

      // Option 1: Channel Dev / Prerelease
      const optDev = document.createElement('option');
      optDev.value = 'dev';
      optDev.textContent = `⚡ Prerelease / Dev ${latestPre ? `(${latestPre.tag_name})` : '(Latest)'}`;
      if (sourceConfig.defaultReleaseType === 'dev' || !latestStable) optDev.selected = true;
      select.appendChild(optDev);

      // Option 2: Channel Stable / Latest
      const optStable = document.createElement('option');
      optStable.value = 'latest';
      optStable.textContent = `🛡️ Stable / Latest ${latestStable ? `(${latestStable.tag_name})` : '(Official)'}`;
      if (sourceConfig.defaultReleaseType === 'latest' && latestStable) optStable.selected = true;
      select.appendChild(optStable);

      // Option 3: Specific Release Tags
      if (releases.length > 0) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = '── Specific Release Tags (.mpp) ──';

        releases.forEach(rel => {
          const opt = document.createElement('option');
          opt.value = rel.tag_name;
          const typeLabel = rel.prerelease ? '[DEV]' : '[STABLE]';
          opt.textContent = `🏷️ ${rel.tag_name} ${typeLabel}`;
          optGroup.appendChild(opt);
        });

        select.appendChild(optGroup);
      }

      hint.textContent = `Discovered ${releases.length} releases on GitHub (${latestPre?.tag_name || 'dev'} & ${latestStable?.tag_name || 'latest'})`;
      STATE.patchTag = select.value;
      return;
    }
  } catch (err) {
    console.warn('[RVX] GitHub API skipped or rate limited. Using zero-API fallback channel:', err);
  }

  // Resilient Zero-API Fallback
  select.innerHTML = '';
  const optDev = document.createElement('option');
  optDev.value = 'dev';
  optDev.textContent = '⚡ Prerelease / Dev (Latest Channel)';
  if (sourceConfig.defaultReleaseType === 'dev') optDev.selected = true;
  select.appendChild(optDev);

  const optStable = document.createElement('option');
  optStable.value = 'latest';
  optStable.textContent = '🛡️ Stable / Latest (Official Channel)';
  if (sourceConfig.defaultReleaseType === 'latest') optStable.selected = true;
  select.appendChild(optStable);

  if (sourceConfig.fallbackTags && sourceConfig.fallbackTags.length > 0) {
    const optGroup = document.createElement('optgroup');
    optGroup.label = '── Verified Static Tags (.mpp) ──';
    sourceConfig.fallbackTags.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tag_name;
      opt.textContent = `🏷️ ${t.name}`;
      optGroup.appendChild(opt);
    });
    select.appendChild(optGroup);
  }

  hint.textContent = 'Standard Channels active: Dev & Latest. Zero GitHub API quota consumed.';
  STATE.patchTag = select.value;
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
    title.textContent = `ℹ️ Release Notes: ${foundRelease.name || foundRelease.tag_name}`;
    const pubDate = foundRelease.published_at ? new Date(foundRelease.published_at).toLocaleString('en-US') : '-';
    const tagType = foundRelease.prerelease ? 'PRERELEASE / DEV' : 'STABLE';
    content.textContent = `📌 Tag: ${foundRelease.tag_name} (${tagType})\n📅 Published Date: ${pubDate}\n\n=== RELEASE NOTES ===\n\n${foundRelease.body || 'No release notes provided.'}`;
  } else {
    title.textContent = `ℹ️ Release Notes: ${currentTag.toUpperCase()}`;
    content.textContent = `Active Channel: ${currentTag.toUpperCase()}\n\nMorphe CLI automatically downloads the corresponding .mpp patch bundle from the ${STATE.currentSource} repository.`;
  }

  modal.classList.remove('hidden');
}

const FALLBACK_YOUTUBE_VERSIONS = [
  { version: '21.13.164', isBeta: false, title: 'YouTube 21.13.164' },
  { version: '21.12.39', isBeta: false, title: 'YouTube 21.12.39' },
  { version: '21.11.37', isBeta: false, title: 'YouTube 21.11.37' },
  { version: '21.10.40', isBeta: false, title: 'YouTube 21.10.40' },
  { version: '21.09.38', isBeta: false, title: 'YouTube 21.09.38' },
  { version: '21.08.35', isBeta: false, title: 'YouTube 21.08.35' },
  { version: '21.07.247', isBeta: false, title: 'YouTube 21.07.247' },
  { version: '20.51.39', isBeta: false, title: 'YouTube 20.51.39' },
  { version: '20.05.46', isBeta: false, title: 'YouTube 20.05.46' }
];

// =============================================================================
// Universal Parser: Extract Supported & Catalog YouTube Versions
// =============================================================================
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

  const sortedManifest = Array.from(manifestVersions).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }).reverse();

  const recommended = sortedManifest[0] || '21.13.164';
  const versionsMap = new Map();

  sortedManifest.forEach(ver => {
    versionsMap.set(ver, {
      version: ver,
      isBeta: false,
      isRecommended: ver === recommended,
      isManifest: true,
      title: `YouTube ${ver}`
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
        isManifest: manifestVersions.has(ver),
        title: item.title || `YouTube ${ver}`
      });
    }
  });

  const allVersions = Array.from(versionsMap.values()).sort((a, b) => {
    return a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' });
  }).reverse();

  return {
    allVersions,
    recommendedVersion: recommended
  };
}

// =============================================================================
// Fetch Manifest & Render Patches Dynamically
// =============================================================================
async function fetchAndRenderPatches(sourceId) {
  const versionContainer = document.getElementById('versionListContainer');
  const patchContainer = document.getElementById('patchCategoriesContainer');

  if (versionContainer) {
    versionContainer.innerHTML = '<p class="card-hint">Loading versions from APKMirror & patch manifest...</p>';
  }
  if (patchContainer) {
    patchContainer.innerHTML = '<div class="morphe-spinner"></div>';
  }

  const sourceConfig = STATE.sources.find(s => s.id === sourceId) || STATE.sources[0] || {
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json'
  };

  try {
    const data = await fetchManifestWithFallback(sourceConfig.manifestUrl);
    const rawPatches = data.patches || [];
    STATE.patches = rawPatches;

    const { allVersions, recommendedVersion } = extractUniversalVersions(rawPatches);
    STATE.availableVersions = allVersions;
    STATE.recommendedVersion = recommendedVersion;

    const recBadge = document.getElementById('recommendedVerBadge');
    if (recBadge) recBadge.textContent = recommendedVersion;

    if (!STATE.currentVersion || STATE.currentVersion === 'recommended') {
      STATE.currentVersion = recommendedVersion;
    }

    renderVersionSelector();
    renderPatchCategories(rawPatches);
    applyGoldenPreset();
    updateBottomBarSummary();

  } catch (err) {
    console.error('[RVX] Error loading patches:', err);
    if (versionContainer) {
      versionContainer.innerHTML = `<p class="alert text-danger">Failed to connect to patch source: ${escapeHtml(err.message)}</p>`;
    }
    if (patchContainer) {
      patchContainer.innerHTML = '<p class="card-hint">Check internet connection or select a different source.</p>';
    }
  }
}

// =============================================================================
// Render YouTube Version Selector (Mobile-First Card Grid)
// =============================================================================
function renderVersionSelector() {
  const container = document.getElementById('versionListContainer');
  if (!container) return;
  container.innerHTML = '';

  const allList = STATE.availableVersions || [];
  const recommended = STATE.recommendedVersion || '21.13.164';

  if (!STATE.currentVersion || STATE.currentVersion === 'recommended') {
    STATE.currentVersion = recommended;
  }

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

  const limit = STATE.showAllVersions ? filtered.length : (STATE.versionDisplayLimit || 12);
  const displayList = filtered.slice(0, limit);

  if (displayList.length === 0) {
    container.innerHTML = '<p class="card-hint">No matching versions found.</p>';
  } else {
    displayList.forEach(item => {
      const ver = item.version;
      const isSelected = (ver === STATE.currentVersion);
      const card = document.createElement('div');
      card.className = `version-item-card ${isSelected ? 'active' : ''}`;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

      let badgeText = item.isBeta ? '⚡ Beta' : '🛡️ Stable';
      if (item.isRecommended) badgeText = '⭐ Recommended';

      card.innerHTML = `
        <div class="version-item-ver">v${ver}</div>
        <div class="version-item-badge">${badgeText}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.version-item-card').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('active');
        card.setAttribute('aria-checked', 'true');
        STATE.currentVersion = ver;
        updateBottomBarSummary();
      });

      container.appendChild(card);
    });
  }

  const counterHint = document.getElementById('versionCounterHint');
  if (counterHint) {
    counterHint.textContent = `Showing ${displayList.length} of ${filtered.length} versions`;
  }

  const btnLoadMore = document.getElementById('btnLoadMoreVersions');
  if (btnLoadMore) {
    btnLoadMore.style.display = (displayList.length >= filtered.length) ? 'none' : 'inline-flex';
  }

  const selectedBadge = document.getElementById('selectedVersionBadge');
  if (selectedBadge) {
    selectedBadge.textContent = `v${STATE.currentVersion}`;
  }
}

// =============================================================================
// Group & Render Patches with Full-Card Touch Targets & Morphe Switches
// =============================================================================
function renderPatchCategories(patches) {
  const container = document.getElementById('patchCategoriesContainer');
  if (!container) return;
  container.innerHTML = '';
  STATE.selectedOptions = {};

  const categories = {
    'Ad-blocking & Sponsor': {
      icon: '🛡️',
      keywords: ['ads', 'sponsorblock', 'dislike', 'tracking', 'redirects']
    },
    'Video Player & Gestures': {
      icon: '▶️',
      keywords: ['player', 'playback', 'swipe', 'audio', 'stream', 'speed', 'controls']
    },
    'Appearance & Themes': {
      icon: '🎨',
      keywords: ['theme', 'branding', 'overlay', 'icon', 'color', 'dpi', 'buttons']
    },
    'Shorts & Navigation': {
      icon: '⚡',
      keywords: ['shorts', 'navigation', 'bar', 'feed', 'header']
    },
    'Anti-Buffering & Spoofing': {
      icon: '🔧',
      keywords: ['spoof', 'potoken', 'quic', 'version', 'wifi', 'certificate']
    },
    'Miscellaneous Features': {
      icon: '🧩',
      keywords: []
    }
  };

  const grouped = {};
  Object.keys(categories).forEach(k => grouped[k] = []);

  patches.forEach(patch => {
    const nameLower = (patch.name || '').toLowerCase();
    const descLower = (patch.description || '').toLowerCase();
    let assigned = false;

    for (const [catName, catData] of Object.entries(categories)) {
      if (catData.keywords.some(kw => nameLower.includes(kw) || descLower.includes(kw))) {
        grouped[catName].push(patch);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      grouped['Miscellaneous Features'].push(patch);
    }
  });

  Object.entries(grouped).forEach(([catTitle, patchList]) => {
    if (patchList.length === 0) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'category-group';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
      <span>${categories[catTitle].icon} ${catTitle}</span>
      <span class="badge badge-primary">${patchList.length}</span>
    `;

    const body = document.createElement('div');
    body.className = 'category-patches-list';

    patchList.forEach(patch => {
      const isDefault = patch.use !== false;
      if (isDefault) STATE.selectedPatches.add(patch.name);

      const item = document.createElement('div');
      item.className = `patch-item ${isDefault ? 'selected' : ''}`;
      item.dataset.patchName = patch.name;

      let optionsHtml = '';
      if (Array.isArray(patch.options) && patch.options.length > 0) {
        optionsHtml = renderPatchOptions(patch.options);
      }

      item.innerHTML = `
        <div class="patch-info">
          <div class="patch-title">${escapeHtml(patch.name)}</div>
          <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
          ${optionsHtml}
        </div>
        <label class="switch" aria-label="Toggle ${escapeHtml(patch.name)}">
          <input type="checkbox" data-name="${escapeHtml(patch.name)}" ${isDefault ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      // Full-Card Touch Target (Rule 1 & Rule 2): Tapping anywhere on item toggles the patch
      item.addEventListener('click', (e) => {
        if (e.target.closest('.patch-option-input') || e.target.closest('select')) {
          return; // Let dropdowns/inputs handle their own interaction
        }
        const cb = item.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        if (cb.checked) {
          STATE.selectedPatches.add(patch.name);
          item.classList.add('selected');
        } else {
          STATE.selectedPatches.delete(patch.name);
          item.classList.remove('selected');
        }
        updatePatchCount();
        updateBottomBarSummary();
      });

      // Bind dynamic options listeners
      item.querySelectorAll('.patch-option-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const val = input.type === 'checkbox' ? input.checked : input.value;
          STATE.selectedOptions[e.target.dataset.optKey] = val;
        });
      });

      body.appendChild(item);
    });

    groupEl.appendChild(header);
    groupEl.appendChild(body);
    container.appendChild(groupEl);
  });

  updatePatchCount();
  updateBottomBarSummary();
}

function renderPatchOptions(options) {
  let html = '<div class="patch-options-box" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-subtle); display: flex; flex-direction: column; gap: 6px;">';

  options.forEach(opt => {
    const key = opt.key;
    const title = opt.title || key;
    const rawDef = opt.default;
    const defStr = String(rawDef ?? '');
    const optType = (opt.type || '').toLowerCase();

    html += `<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.8rem; flex-wrap: wrap;">
      <span style="color: var(--text-secondary);">${escapeHtml(title)}:</span>`;

    if (optType === 'boolean' || typeof rawDef === 'boolean') {
      const checked = Boolean(rawDef);
      html += `<label class="switch" style="width: 44px; height: 24px;">
        <input type="checkbox" class="patch-option-input" data-opt-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
        <span class="slider"></span>
      </label>`;
    } else if (Array.isArray(opt.possibleValues) && opt.possibleValues.length > 0) {
      html += `<select class="form-control patch-option-input" data-opt-key="${escapeHtml(key)}" style="width: auto; min-height: 36px; padding: 4px 8px; font-size: 0.8rem;">`;
      opt.possibleValues.forEach(val => {
        const sel = String(val) === defStr ? 'selected' : '';
        html += `<option value="${escapeHtml(String(val))}" ${sel}>${escapeHtml(String(val))}</option>`;
      });
      html += `</select>`;
    } else {
      html += `<input type="text" class="form-control patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(defStr)}" style="width: 140px; min-height: 36px; padding: 4px 8px; font-size: 0.8rem;">`;
    }

    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// =============================================================================
// Golden Preset & Custom Preset Export/Import (.json)
// =============================================================================
function applyGoldenPreset() {
  if (!STATE.goldenPreset) return;
  const config = STATE.goldenPreset;
  const targetVer = config.target_youtube_version || '21.13.164';
  const targetSrc = config.patch_source || 'anddea';

  STATE.currentVersion = targetVer;
  STATE.currentSource = targetSrc;

  const excList = config.excluded_patches || [];
  const incList = config.included_patches || [];

  STATE.selectedPatches.clear();

  document.querySelectorAll('.patch-item').forEach(item => {
    const name = item.dataset.patchName;
    const cb = item.querySelector('input[type="checkbox"]');
    if (!cb) return;

    let shouldSelect = true;
    if (excList.includes(name)) {
      shouldSelect = false;
    } else if (incList.length > 0 && !incList.includes(name)) {
      shouldSelect = false;
    }

    cb.checked = shouldSelect;
    item.classList.toggle('selected', shouldSelect);
    if (shouldSelect) {
      STATE.selectedPatches.add(name);
    }
  });

  if (config.options && typeof config.options === 'object') {
    STATE.selectedOptions = { ...config.options };
    syncOptionsToDom();
  }

  updatePatchCount();
  updateBottomBarSummary();
  renderVersionSelector();
}

function syncOptionsToDom() {
  Object.entries(STATE.selectedOptions).forEach(([k, v]) => {
    const el = document.querySelector(`.patch-option-input[data-opt-key="${k}"]`);
    if (el) {
      if (el.type === 'checkbox') {
        el.checked = Boolean(v);
      } else {
        el.value = String(v);
      }
    }
  });
}

function exportPreset() {
  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  const payload = {
    schema_version: "2.1.4",
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

      const exc = new Set(data.excluded_patches || []);
      const inc = new Set(data.included_patches || []);

      STATE.selectedPatches.clear();
      document.querySelectorAll('.patch-item').forEach(item => {
        const name = item.dataset.patchName;
        const cb = item.querySelector('input[type="checkbox"]');
        if (!cb) return;

        let active = true;
        if (exc.has(name)) active = false;
        else if (inc.size > 0 && !inc.has(name)) active = false;

        cb.checked = active;
        item.classList.toggle('selected', active);
        if (active) STATE.selectedPatches.add(name);
      });

      if (data.options && typeof data.options === 'object') {
        STATE.selectedOptions = { ...data.options };
        syncOptionsToDom();
      }

      updatePatchCount();
      updateBottomBarSummary();
      alert(`✅ Preset Imported: v${STATE.currentVersion} • ${STATE.selectedPatches.size} active patches.`);
    } catch (err) {
      alert('❌ Failed to import preset: Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

function updatePatchCount() {
  const count = STATE.selectedPatches.size;
  const el = document.getElementById('activePatchCount');
  const badge = document.getElementById('tabPatchCountBadge');
  const railBadge = document.getElementById('railPatchCount');

  if (el) el.textContent = count;
  if (badge) badge.textContent = count;
  if (railBadge) railBadge.textContent = count;
}

function updateBottomBarSummary() {
  const targetEl = document.getElementById('bottomBarTarget');
  const patchEl = document.getElementById('bottomBarPatches');
  const engineEl = document.getElementById('bottomBarEngine');
  const railSummary = document.getElementById('railSummaryLabel');

  const verText = `v${STATE.currentVersion}`;
  const patchText = `${STATE.selectedPatches.size} patches`;
  const engineText = STATE.engineMode === 'local' ? 'Local' : 'Cloud';

  if (targetEl) targetEl.textContent = verText;
  if (patchEl) patchEl.textContent = patchText;
  if (engineEl) engineEl.textContent = engineText;
  if (railSummary) railSummary.textContent = `${verText} • ${patchText}`;

  const selectedBadge = document.getElementById('selectedVersionBadge');
  if (selectedBadge) selectedBadge.textContent = verText;
}

// =============================================================================
// Engine Mode Switcher & Daemon Communication
// =============================================================================
function initEngineSwitcher() {
  const btnLocal = document.getElementById('btnEngineLocal');
  const btnCloud = document.getElementById('btnEngineCloud');

  if (btnLocal) {
    btnLocal.addEventListener('click', () => setEngineMode('local'));
  }
  if (btnCloud) {
    btnCloud.addEventListener('click', () => setEngineMode('cloud'));
  }
}

async function checkDaemonStatus() {
  const badge = document.getElementById('daemonStatusBadge');
  const urlsToTest = [
    '', // Relative if served by daemon
    'http://127.0.0.1:8080',
    'http://localhost:8080'
  ];

  for (const url of urlsToTest) {
    try {
      const res = await fetch(`${url}/api/v1/system/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        STATE.daemonOnline = true;
        STATE.daemonUrl = url;
        if (badge) {
          badge.className = 'status-pill status-pill-online';
          const textSpan = badge.querySelector('.status-pill-text');
          if (textSpan) textSpan.textContent = `Online (v${data.daemon_version})`;
        }
        setEngineMode('local');
        return;
      }
    } catch (_) {}
  }

  STATE.daemonOnline = false;
  STATE.daemonUrl = '';
  if (badge) {
    badge.className = 'status-pill status-pill-offline';
    const textSpan = badge.querySelector('.status-pill-text');
    if (textSpan) textSpan.textContent = 'Daemon Offline';
  }
  setEngineMode('cloud');
}

async function fetchInstalledAppInfo() {
  if (!STATE.daemonOnline) return;
  try {
    const res = await fetch(`${STATE.daemonUrl}/api/v1/system/youtube-info`);
    if (res.ok) {
      const data = await res.json();
      if (data.installed_version && data.installed_version !== 'Unknown') {
        STATE.installedVersion = data.installed_version;
        const text = document.getElementById('installedVerText');
        if (text) text.textContent = `v${data.installed_version}`;
      }
    }
  } catch (_) {}
}

function setEngineMode(mode) {
  STATE.engineMode = mode;
  const btnLocal = document.getElementById('btnEngineLocal');
  const btnCloud = document.getElementById('btnEngineCloud');
  const btnTrigger = document.getElementById('btnTriggerBuild');
  const btnRail = document.getElementById('btnRailTrigger');
  const engineTag = document.getElementById('engineModeTag');

  if (btnLocal && btnCloud) {
    if (mode === 'local') {
      btnLocal.classList.add('active');
      btnLocal.setAttribute('aria-checked', 'true');
      btnCloud.classList.remove('active');
      btnCloud.setAttribute('aria-checked', 'false');
      if (engineTag) engineTag.textContent = 'Zero-Cloud / On-Device';
    } else {
      btnCloud.classList.add('active');
      btnCloud.setAttribute('aria-checked', 'true');
      btnLocal.classList.remove('active');
      btnLocal.setAttribute('aria-checked', 'false');
      if (engineTag) engineTag.textContent = 'GitHub Actions Cloud';
    }
  }

  const ctaText = mode === 'local' ? 'Patch On Device' : 'Build on GitHub';
  if (btnTrigger) {
    const txt = btnTrigger.querySelector('.btn-text');
    if (txt) txt.textContent = ctaText;
    btnTrigger.disabled = false;
  }
  if (btnRail) {
    btnRail.textContent = `⚡ ${ctaText}`;
  }

  updateBottomBarSummary();
}

// =============================================================================
// Patch Execution (Local Daemon & Cloud Actions)
// =============================================================================
async function triggerLocalPatch() {
  // 1. Auto-Navigate to Tab 3 (Terminal & Output) per interview decision
  switchTab('terminal');

  const indicator = document.getElementById('patchStatusBadge');
  const liveBadge = document.getElementById('tabTerminalLiveBadge');
  const heroCard = document.getElementById('postPatchHeroCard');

  if (indicator) indicator.classList.remove('hidden');
  if (liveBadge) liveBadge.classList.remove('hidden');
  if (heroCard) heroCard.classList.add('hidden');

  appendTerminalLog('===========================================================');
  appendTerminalLog(`[WebUI] Initiating On-Device Patch for YouTube v${STATE.currentVersion}`);
  appendTerminalLog(`[WebUI] Patch Source: ${STATE.currentSource} (${STATE.patchTag})`);
  appendTerminalLog(`[WebUI] Selected Patches: ${STATE.selectedPatches.size}`);
  appendTerminalLog('===========================================================');

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

    if (STATE.eventSource) {
      STATE.eventSource.close();
    }

    STATE.eventSource = new EventSource(`${STATE.daemonUrl}/api/v1/patch/stream`);
    STATE.eventSource.onmessage = (event) => {
      appendTerminalLog(event.data);
      if (event.data.includes('Patching process completed successfully')) {
        if (indicator) indicator.classList.add('hidden');
        if (liveBadge) liveBadge.classList.add('hidden');
        if (heroCard) heroCard.classList.remove('hidden');
        if (STATE.eventSource) STATE.eventSource.close();
      } else if (event.data.includes('Patching failed')) {
        if (indicator) indicator.classList.add('hidden');
        if (liveBadge) liveBadge.classList.add('hidden');
        if (STATE.eventSource) STATE.eventSource.close();
      }
    };

    STATE.eventSource.onerror = () => {
      if (indicator) indicator.classList.add('hidden');
      if (liveBadge) liveBadge.classList.add('hidden');
    };
  } catch (err) {
    appendTerminalLog(`❌ Failed to start patching: ${err.message}`);
    if (indicator) indicator.classList.add('hidden');
    if (liveBadge) liveBadge.classList.add('hidden');
  }
}

async function triggerCloudBuild() {
  if (!STATE.authToken) {
    openAuthModal();
    return;
  }

  const patchTag = STATE.patchTag || 'dev';
  const progressModal = document.getElementById('buildProgressModal');
  const statusMsg = document.getElementById('buildStatusMsg');
  const linksBox = document.getElementById('buildActionLinks');
  const runLink = document.getElementById('linkActionsRun');

  progressModal.classList.remove('hidden');
  linksBox.classList.add('hidden');
  statusMsg.textContent = `Connecting to GitHub Actions runner...`;

  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  try {
    const payload = {
      event_type: 'build-rvx',
      client_payload: {
        youtube_version: STATE.currentVersion,
        patch_source: STATE.currentSource,
        patch_tag: patchTag,
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
      statusMsg.textContent = `✅ Build Dispatched to GitHub Actions! Runner is patching YouTube v${STATE.currentVersion}.`;
      linksBox.classList.remove('hidden');
      runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Response code: ${res.status}`);
    }
  } catch (err) {
    statusMsg.textContent = `❌ Cloud Build Error: ${err.message}`;
  }
}

function appendTerminalLog(line) {
  const container = document.getElementById('terminalLogs');
  const body = document.getElementById('terminalBody');
  if (!container) return;

  container.textContent += `\n${line}`;
  if (STATE.terminalAutoScroll && body) {
    body.scrollTop = body.scrollHeight;
  }
}

// =============================================================================
// Event Listeners & Modals
// =============================================================================
function initEventListeners() {
  const triggerHandler = () => {
    if (STATE.engineMode === 'local') {
      triggerLocalPatch();
    } else {
      triggerCloudBuild();
    }
  };

  const btnTrigger = document.getElementById('btnTriggerBuild');
  if (btnTrigger) btnTrigger.addEventListener('click', triggerHandler);

  const btnRailTrigger = document.getElementById('btnRailTrigger');
  if (btnRailTrigger) btnRailTrigger.addEventListener('click', triggerHandler);

  // Hero Card Fast Actions
  const btnUseInstalled = document.getElementById('btnUseInstalledVer');
  if (btnUseInstalled) {
    btnUseInstalled.addEventListener('click', () => {
      if (STATE.installedVersion) {
        STATE.currentVersion = STATE.installedVersion;
        renderVersionSelector();
        updateBottomBarSummary();
      } else {
        alert('Installed YouTube version has not been detected yet.');
      }
    });
  }

  const btnUseRecommended = document.getElementById('btnUseRecommendedVer');
  if (btnUseRecommended) {
    btnUseRecommended.addEventListener('click', () => {
      STATE.currentVersion = STATE.recommendedVersion;
      renderVersionSelector();
      updateBottomBarSummary();
    });
  }

  // Version Filter Pills
  document.querySelectorAll('.btn-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.versionFilter = btn.dataset.filter;
      STATE.versionDisplayLimit = 12;
      renderVersionSelector();
    });
  });

  // Version Search
  const inputSearchVer = document.getElementById('inputSearchVersion');
  if (inputSearchVer) {
    inputSearchVer.addEventListener('input', (e) => {
      STATE.versionSearch = e.target.value.trim();
      STATE.versionDisplayLimit = 12;
      renderVersionSelector();
    });
  }

  // Version Pagination
  const btnLoadMore = document.getElementById('btnLoadMoreVersions');
  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      STATE.versionDisplayLimit = (STATE.versionDisplayLimit || 12) + 24;
      renderVersionSelector();
    });
  }

  const btnToggleAll = document.getElementById('btnToggleAllVersions');
  if (btnToggleAll) {
    btnToggleAll.addEventListener('click', () => {
      STATE.showAllVersions = !STATE.showAllVersions;
      if (!STATE.showAllVersions) STATE.versionDisplayLimit = 12;
      renderVersionSelector();
    });
  }

  // Custom Version Input
  const applyCustomVer = () => {
    const input = document.getElementById('inputCustomVersion');
    if (!input) return;
    const customVer = input.value.trim().replace(/^v/i, '');
    if (!customVer) return;

    if (!/^\d+(\.\d+)+$/.test(customVer)) {
      alert('Invalid version format. Example: 21.07.247 or 20.51.39');
      return;
    }

    const exists = STATE.availableVersions.find(x => x.version === customVer);
    if (!exists) {
      STATE.availableVersions.unshift({
        version: customVer,
        isBeta: false,
        isRecommended: false,
        isManifest: false,
        title: `YouTube ${customVer} (Custom)`
      });
    }
    STATE.currentVersion = customVer;
    renderVersionSelector();
    updateBottomBarSummary();
    input.value = '';
  };

  const btnApplyVer = document.getElementById('btnApplyCustomVersion');
  if (btnApplyVer) btnApplyVer.addEventListener('click', applyCustomVer);

  // Preset Buttons
  document.getElementById('btnLoadGoldenPreset').addEventListener('click', applyGoldenPreset);
  document.getElementById('btnResetPatches').addEventListener('click', () => {
    document.querySelectorAll('.patch-item input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      STATE.selectedPatches.add(cb.dataset.name);
    });
    document.querySelectorAll('.patch-item').forEach(p => p.classList.add('selected'));
    updatePatchCount();
    updateBottomBarSummary();
  });

  const btnExport = document.getElementById('btnExportPreset');
  if (btnExport) btnExport.addEventListener('click', exportPreset);

  const btnImport = document.getElementById('btnImportPreset');
  const inputImport = document.getElementById('inputImportPreset');
  if (btnImport && inputImport) {
    btnImport.addEventListener('click', () => inputImport.click());
    inputImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importPreset(file);
        inputImport.value = '';
      }
    });
  }

  // Patch Search Bar
  const inputSearchPatch = document.getElementById('inputSearchPatch');
  if (inputSearchPatch) {
    inputSearchPatch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.category-group').forEach(group => {
        let hasMatch = false;
        group.querySelectorAll('.patch-item').forEach(item => {
          const name = (item.dataset.patchName || '').toLowerCase();
          const desc = (item.querySelector('.patch-desc')?.textContent || '').toLowerCase();
          const match = !query || name.includes(query) || desc.includes(query);
          item.style.display = match ? 'flex' : 'none';
          if (match) hasMatch = true;
        });
        group.style.display = hasMatch ? 'block' : 'none';
      });
    });
  }

  // Terminal Controls
  const btnAutoScroll = document.getElementById('btnAutoScroll');
  if (btnAutoScroll) {
    btnAutoScroll.addEventListener('click', () => {
      STATE.terminalAutoScroll = !STATE.terminalAutoScroll;
      btnAutoScroll.textContent = STATE.terminalAutoScroll ? '📜 Scroll: ON' : '📜 Scroll: OFF';
      btnAutoScroll.classList.toggle('active', STATE.terminalAutoScroll);
    });
  }

  const btnClearLogs = document.getElementById('btnClearLogs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      const logs = document.getElementById('terminalLogs');
      if (logs) logs.textContent = 'Cleared. Ready.';
    });
  }

  const btnCopyLogs = document.getElementById('btnCopyLogs');
  if (btnCopyLogs) {
    btnCopyLogs.addEventListener('click', () => {
      const logs = document.getElementById('terminalLogs');
      if (logs && navigator.clipboard) {
        navigator.clipboard.writeText(logs.textContent).then(() => {
          btnCopyLogs.textContent = '✅ Copied!';
          setTimeout(() => btnCopyLogs.textContent = '📋 Copy', 1800);
        });
      }
    });
  }

  // Post-Patch Actions (Hero Card & Modal)
  const bindMountAction = (btnId, alertId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const alertBox = document.getElementById(alertId);
      if (alertBox) {
        alertBox.textContent = 'Mounting YouTube RVX into running app...';
        alertBox.className = 'alert text-secondary';
        alertBox.classList.remove('hidden');
      }

      try {
        const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/mount`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          if (alertBox) {
            alertBox.textContent = '🎉 Successfully mounted! YouTube has been restarted.';
            alertBox.className = 'alert text-success';
          }
        } else {
          throw new Error(data.error || 'Failed to mount');
        }
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = `❌ Mount error: ${err.message}`;
          alertBox.className = 'alert text-danger';
        }
      }
    });
  };

  const bindExportZipAction = (btnId, alertId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const alertBox = document.getElementById(alertId);
      if (alertBox) {
        alertBox.textContent = 'Packaging flashable ZIP module...';
        alertBox.className = 'alert text-secondary';
        alertBox.classList.remove('hidden');
      }

      try {
        const res = await fetch(`${STATE.daemonUrl}/api/v1/patch/export-zip`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          if (alertBox) {
            alertBox.textContent = `💾 Flashable ZIP saved to: ${data.path}`;
            alertBox.className = 'alert text-success';
          }
        } else {
          throw new Error(data.error || 'Failed to export ZIP');
        }
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = `❌ Export error: ${err.message}`;
          alertBox.className = 'alert text-danger';
        }
      }
    });
  };

  bindMountAction('btnHeroHotMount', 'heroMountAlert');
  bindMountAction('btnHotMount', 'mountAlert');
  bindExportZipAction('btnHeroExportZip', 'heroMountAlert');
  bindExportZipAction('btnExportZip', 'mountAlert');

  // Modals
  document.getElementById('btnAuthModal').addEventListener('click', openAuthModal);
  document.getElementById('btnCloseAuthModal').addEventListener('click', closeAuthModal);
  document.getElementById('btnCloseProgressModal').addEventListener('click', () => {
    document.getElementById('buildProgressModal').classList.add('hidden');
  });

  const btnNotes = document.getElementById('btnViewPatchNotes');
  if (btnNotes) btnNotes.addEventListener('click', showPatchNotesModal);

  const btnCloseNotes = document.getElementById('btnClosePatchNotesModal');
  if (btnCloseNotes) {
    btnCloseNotes.addEventListener('click', () => {
      document.getElementById('patchNotesModal').classList.add('hidden');
    });
  }

  const btnCloseNotesBtn = document.getElementById('btnClosePatchNotesBtn');
  if (btnCloseNotesBtn) {
    btnCloseNotesBtn.addEventListener('click', () => {
      document.getElementById('patchNotesModal').classList.add('hidden');
    });
  }

  const btnCloseSuccess = document.getElementById('btnCloseSuccessModal');
  if (btnCloseSuccess) {
    btnCloseSuccess.addEventListener('click', () => {
      document.getElementById('patchSuccessModal').classList.add('hidden');
    });
  }

  const btnFinish = document.getElementById('btnFinishSuccess');
  if (btnFinish) {
    btnFinish.addEventListener('click', () => {
      document.getElementById('patchSuccessModal').classList.add('hidden');
    });
  }

  // Token Auth
  document.getElementById('btnSaveAuth').addEventListener('click', async () => {
    const token = document.getElementById('inputGithubToken').value.trim();
    const alertBox = document.getElementById('authAlert');

    if (!token) {
      alertBox.textContent = 'Token cannot be empty!';
      alertBox.className = 'alert text-danger';
      alertBox.classList.remove('hidden');
      return;
    }

    const valid = await verifyGithubToken(token);
    if (valid) {
      localStorage.setItem('rvx_gh_pat', token);
      STATE.authToken = token;
      closeAuthModal();
    } else {
      alertBox.textContent = 'Token was rejected by GitHub API.';
      alertBox.className = 'alert text-danger';
      alertBox.classList.remove('hidden');
    }
  });

  document.getElementById('btnClearAuth').addEventListener('click', () => {
    localStorage.removeItem('rvx_gh_pat');
    STATE.authToken = '';
    STATE.authUser = null;
    initSecurity();
    closeAuthModal();
  });
}

function openAuthModal() {
  document.getElementById('inputGithubToken').value = STATE.authToken;
  document.getElementById('authAlert').classList.add('hidden');
  document.getElementById('authModal').classList.remove('hidden');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }
}
