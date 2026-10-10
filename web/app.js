/**
 * YouTube RVX Cloud Builder - Universal Dynamic Web App
 * Keamanan Tinggi, Universal Multi-Source Parser, Opsi Kustomisasi Dinamis
 */

const STATE = {
  sources: [],
  currentSource: 'anddea',
  patchTag: 'dev',
  patchReleases: [],
  buildArch: 'all',
  currentVersion: 'recommended',
  showAllVersions: false,
  recommendedVersion: '21.13.164',
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
  authUser: null
};

// =============================================================================
// Inisialisasi Aplikasi
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initSecurity();
  initEventListeners();
  await loadSourcesAndPresets();
  await fetchAndRenderPatches(STATE.currentSource);
  registerServiceWorker();
});

// =============================================================================
// Security & Gatekeeper Authentication
// =============================================================================
function initSecurity() {
  const token = STATE.authToken;
  const statusIcon = document.getElementById('authStatusIcon');
  const statusText = document.getElementById('authStatusText');
  const btnTrigger = document.getElementById('btnTriggerBuild');

  if (token) {
    verifyGithubToken(token);
  } else {
    statusIcon.textContent = '🔒';
    statusText.textContent = 'Locked';
    btnTrigger.title = 'Unlock with your GitHub Token to trigger build';
  }
}

async function verifyGithubToken(token) {
  const statusIcon = document.getElementById('authStatusIcon');
  const statusText = document.getElementById('authStatusText');
  const btnTrigger = document.getElementById('btnTriggerBuild');

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
      statusIcon.textContent = '🟢';
      statusText.textContent = `@${user.login}`;
      btnTrigger.disabled = false;
      btnTrigger.title = 'Trigger build on GitHub Runner';
      return true;
    } else {
      throw new Error('Token is invalid or expired');
    }
  } catch (err) {
    statusIcon.textContent = '⚠️';
    statusText.textContent = 'Invalid Token';
    btnTrigger.disabled = true;
    return false;
  }
}

const DEFAULT_SOURCES = [
  {
    id: "anddea",
    name: "⭐ Anddea Patches (Default - Full Features)",
    repository: "anddea/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json",
    defaultReleaseType: "dev",
    isDefault: true,
    description: "Primary patch source featuring full customization and rich features for YouTube RVX."
  },
  {
    id: "morphe",
    name: "Morphe Official (MorpheApp)",
    repository: "MorpheApp/morphe-patches",
    manifestUrl: "https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Official patch source from the MorpheApp team."
  },
  {
    id: "inotia00",
    name: "Inotia00 (ReVanced Extended)",
    repository: "inotia00/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/inotia00/revanced-patches/refs/heads/revanced-extended/patches.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Classic ReVanced Extended patches by developer inotia00."
  },
  {
    id: "revanced",
    name: "ReVanced Official",
    repository: "ReVanced/revanced-patches",
    manifestUrl: "https://raw.githubusercontent.com/ReVanced/revanced-patches/refs/heads/main/patches.json",
    defaultReleaseType: "latest",
    isDefault: false,
    description: "Official patches from the ReVanced Team."
  }
];

// =============================================================================
// Helper Fetch with Multi-Mirror CDN (jsDelivr -> GitHub Raw)
// =============================================================================
async function fetchManifestWithFallback(url) {
  const urlsToTry = [];

  // Try jsDelivr mirror first for speed and reliable CORS
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
// Load Sumber, Preset, & Katalog Versi APKMirror Lengkap
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
      // Fallback ke CDN jsDelivr jika file lokal belum tersedia
      try {
        const cdnRes = await fetch('https://cdn.jsdelivr.net/gh/Zy0x/YouTube-Revanced@main/config/youtube-versions.json');
        if (cdnRes.ok) {
          STATE.catalogVersions = await cdnRes.json();
        }
      } catch (e) {
        console.warn('Gagal memuat katalog versi dari CDN mirror:', e);
      }
    }
  } catch (err) {
    console.warn('Menggunakan konfigurasi default internal:', err);
    STATE.sources = DEFAULT_SOURCES;
  }

  renderSourceSelector();
  const currentSrcConfig = STATE.sources.find(s => s.id === STATE.currentSource) || STATE.sources[0];
  await loadPatchReleases(currentSrcConfig);
}

function renderSourceSelector() {
  const select = document.getElementById('selectSource');
  if (!select) return;
  select.innerHTML = '';
  STATE.sources.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === STATE.currentSource) opt.selected = true;
    select.appendChild(opt);
  });
}

// =============================================================================
// Mengambil Daftar Rilis Versi Patch (.mpp) dari GitHub API Secara Dinamis
// =============================================================================
async function loadPatchReleases(sourceConfig) {
  if (!sourceConfig) return;
  const repo = sourceConfig.repository || 'anddea/revanced-patches';
  const select = document.getElementById('selectPatchRelease');
  const hint = document.getElementById('patchReleaseHint');
  if (!select) return;

  hint.textContent = `Menghubungkan ke GitHub Releases (${repo})...`;

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

      // Opsi 1: Channel Dev / Prerelease
      const optDev = document.createElement('option');
      optDev.value = 'dev';
      optDev.textContent = `⚡ Prerelease / Dev ${latestPre ? `(${latestPre.tag_name})` : '(Terkini)'}`;
      if (sourceConfig.defaultReleaseType === 'dev' || !latestStable) optDev.selected = true;
      select.appendChild(optDev);

      // Opsi 2: Channel Stable / Latest
      const optStable = document.createElement('option');
      optStable.value = 'latest';
      optStable.textContent = `🛡️ Stable / Latest ${latestStable ? `(${latestStable.tag_name})` : '(Stabil Resmi)'}`;
      if (sourceConfig.defaultReleaseType === 'latest' && latestStable) optStable.selected = true;
      select.appendChild(optStable);

      // Opsi 3: Tag Rilis Spesifik
      if (releases.length > 0) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = '── Tag Rilis Spesifik (.mpp) ──';

        releases.forEach(rel => {
          const opt = document.createElement('option');
          opt.value = rel.tag_name;
          const typeLabel = rel.prerelease ? '[DEV]' : '[STABLE]';
          opt.textContent = `🏷️ ${rel.tag_name} ${typeLabel}`;
          optGroup.appendChild(opt);
        });

        select.appendChild(optGroup);
      }

      hint.textContent = `Tersedia ${releases.length} rilis di GitHub (${latestPre?.tag_name || 'dev'} & ${latestStable?.tag_name || 'latest'})`;
      updatePatchTagBadge(select.value);
      return;
    }
  } catch (err) {
    console.warn('[RVX] Gagal fetch releases dari GitHub API:', err);
  }

  // Fallback standar jika offline / rate limit API
  select.innerHTML = `
    <option value="dev" ${sourceConfig.defaultReleaseType === 'dev' ? 'selected' : ''}>⚡ Prerelease / Dev (Terkini)</option>
    <option value="latest" ${sourceConfig.defaultReleaseType === 'latest' ? 'selected' : ''}>🛡️ Stable / Latest (Stabil Resmi)</option>
  `;
  hint.textContent = 'Channel default: Dev (Prerelease) dan Latest (Stabil).';
  updatePatchTagBadge(select.value);
}

function updatePatchTagBadge(val) {
  const badge = document.getElementById('patchTagBadge');
  if (!badge) return;
  STATE.patchTag = val;

  if (val === 'dev') {
    badge.textContent = 'Prerelease';
    badge.className = 'badge badge-warning';
  } else if (val === 'latest') {
    badge.textContent = 'Stable';
    badge.className = 'badge badge-success';
  } else {
    badge.textContent = val;
    badge.className = 'badge badge-info';
  }
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
    title.textContent = `ℹ️ Catatan Rilis: ${foundRelease.name || foundRelease.tag_name}`;
    const pubDate = foundRelease.published_at ? new Date(foundRelease.published_at).toLocaleString('id-ID') : '-';
    const tagType = foundRelease.prerelease ? 'PRERELEASE / DEV' : 'STABLE';
    content.textContent = `📌 Versi Tag: ${foundRelease.tag_name} (${tagType})\n📅 Tanggal Rilis: ${pubDate}\n\n=== CATATAN RILIS ===\n\n${foundRelease.body || 'Tidak ada catatan rilis khusus.'}`;
  } else {
    title.textContent = `ℹ️ Catatan Rilis: ${currentTag.toUpperCase()}`;
    content.textContent = `Channel aktif: ${currentTag.toUpperCase()}\n\nMorphe CLI akan mengunduh bundle patch .mpp terbaru dari repositori ${STATE.currentSource} saat proses build dijalankan di GitHub Actions.`;
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
// Universal Parser: Integrasi Versi Manifest + Sumber Katalog Lengkap APKMirror
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

  // 1. Prioritaskan versi manifest patch
  sortedManifest.forEach(ver => {
    versionsMap.set(ver, {
      version: ver,
      isBeta: false,
      isRecommended: ver === recommended,
      isManifest: true,
      title: `YouTube ${ver}`
    });
  });

  // 2. Gabungkan seluruh katalog versi dari APKMirror (700+ versi)
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

  // Urutkan versi secara semver menurun
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
  const versionBadge = document.getElementById('versionLoadingBadge');
  const patchContainer = document.getElementById('patchCategoriesContainer');

  versionBadge.textContent = 'Loading versions...';
  versionBadge.className = 'badge badge-info';
  versionContainer.innerHTML = '<p class="form-hint">Analyzing patch manifest & APKMirror version catalog...</p>';
  patchContainer.innerHTML = '<div class="spinner"></div>';

  const sourceConfig = STATE.sources.find(s => s.id === sourceId) || STATE.sources[0] || {
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json'
  };

  try {
    const data = await fetchManifestWithFallback(sourceConfig.manifestUrl);
    const rawPatches = data.patches || [];
    STATE.patches = rawPatches;

    // 1. Universal Version & Recommendation Extraction
    const { allVersions, recommendedVersion } = extractUniversalVersions(rawPatches);
    STATE.availableVersions = allVersions;
    STATE.recommendedVersion = recommendedVersion;

    if (!STATE.currentVersion || STATE.currentVersion === 'recommended') {
      STATE.currentVersion = recommendedVersion;
    }

    versionBadge.textContent = `${allVersions.length} APKMirror Versions`;
    versionBadge.className = 'badge badge-info';

    // 2. Render Version Selector
    renderVersionSelector();

    // 3. Render Patches & Customization Options
    renderPatchCategories(rawPatches);

    // Apply Golden Preset by default
    applyGoldenPreset();

  } catch (err) {
    console.error('[RVX] Error loading patches:', err);
    versionBadge.textContent = 'Failed';
    versionBadge.className = 'badge badge-gold';
    versionContainer.innerHTML = `<p class="form-hint text-danger">Failed to connect to patch source: ${escapeHtml(err.message)}</p>`;
    patchContainer.innerHTML = '<p class="form-hint">Please check your internet connection or select a different patch source.</p>';
  }
}

// =============================================================================
// Render YouTube Version Selector (APKMirror Catalog, Filter, Search & Pagination)
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

  // 1. Apply Category Filters (All, Recommended, Stable Only, Beta)
  let filtered = allList;
  if (STATE.versionFilter === 'recommended') {
    filtered = allList.filter(item => item.isRecommended || item.isManifest);
  } else if (STATE.versionFilter === 'stable') {
    filtered = allList.filter(item => !item.isBeta);
  } else if (STATE.versionFilter === 'beta') {
    filtered = allList.filter(item => item.isBeta);
  }

  // 2. Apply Search Filter
  if (STATE.versionSearch) {
    const q = STATE.versionSearch.toLowerCase();
    filtered = filtered.filter(item => item.version.toLowerCase().includes(q));
  }

  // 3. Determine Display Range
  const limit = STATE.showAllVersions ? filtered.length : (STATE.versionDisplayLimit || 12);
  const displayList = filtered.slice(0, limit);

  // Ensure active version is always visible
  const activeObj = allList.find(x => x.version === STATE.currentVersion);
  if (activeObj && !displayList.some(x => x.version === STATE.currentVersion)) {
    displayList.unshift(activeObj);
  }

  // 4. Render Version Cards
  if (displayList.length === 0) {
    container.innerHTML = '<p class="form-hint" style="grid-column: 1 / -1; padding: 16px 0;">No versions match your search or filter.</p>';
  } else {
    displayList.forEach(item => {
      const ver = item.version;
      const isSelected = ver === STATE.currentVersion;
      const card = document.createElement('label');
      card.className = `version-card ${isSelected ? 'selected' : ''}`;

      let tagHtml = '';
      if (item.isRecommended) {
        tagHtml = '<span class="version-pill-tag version-tag-rec">⭐ RECOMMENDED</span>';
      } else if (!item.isBeta) {
        tagHtml = '<span class="version-pill-tag version-tag-stable">STABLE</span>';
      } else {
        tagHtml = '<span class="version-pill-tag version-tag-beta">BETA</span>';
      }

      card.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 1rem;">v${ver}</div>
          <div class="version-card-meta">
            ${tagHtml}
            ${item.isManifest ? '<span class="form-hint" style="margin: 0; font-size: 0.75rem;">(Pinned)</span>' : ''}
          </div>
        </div>
        <input type="radio" name="youtube_version" value="${ver}" ${isSelected ? 'checked' : ''}>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.version-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        STATE.currentVersion = ver;
      });

      container.appendChild(card);
    });
  }

  // 5. Update Status Hints & Toolbar Buttons
  const counterHint = document.getElementById('versionCounterHint');
  if (counterHint) {
    counterHint.textContent = `Showing ${displayList.length} of ${filtered.length} versions (${allList.length} total APKMirror)`;
  }

  const badge = document.getElementById('versionLoadingBadge');
  if (badge) {
    badge.textContent = `${allList.length} APKMirror Versions`;
  }

  const btnLoadMore = document.getElementById('btnLoadMoreVersions');
  if (btnLoadMore) {
    btnLoadMore.style.display = (displayList.length >= filtered.length) ? 'none' : 'inline-flex';
  }

  const toggleBtnText = document.getElementById('btnToggleAllVersionsText');
  const toggleBtnIcon = document.getElementById('btnToggleAllVersionsIcon');
  if (toggleBtnText && toggleBtnIcon) {
    if (STATE.showAllVersions) {
      toggleBtnText.textContent = 'Show Compact (12 Versions)';
      toggleBtnIcon.textContent = '▲';
    } else {
      toggleBtnText.textContent = `Show All (${filtered.length} Versions)`;
      toggleBtnIcon.textContent = '📋';
    }
  }
}

// =============================================================================
// Group & Render Patches + Customization Options
// =============================================================================
function renderPatchCategories(patches) {
  const container = document.getElementById('patchCategoriesContainer');
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

    const header = document.createElement('button');
    header.className = 'category-header';
    header.setAttribute('type', 'button');
    header.innerHTML = `
      <span>${categories[catTitle].icon} ${catTitle} (${patchList.length})</span>
      <span class="chevron" aria-hidden="true">▾</span>
    `;

    const body = document.createElement('div');
    body.className = 'category-body';

    patchList.forEach(patch => {
      const item = document.createElement('div');
      item.className = 'patch-item';
      item.dataset.patchName = patch.name;

      const isDefault = patch.use !== false;
      if (isDefault) STATE.selectedPatches.add(patch.name);

      let optionsHtml = '';
      if (Array.isArray(patch.options) && patch.options.length > 0) {
        optionsHtml = renderPatchOptions(patch.options);
      }

      item.innerHTML = `
        <div style="width: 100%;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;">
            <div class="patch-info">
              <div class="patch-title">${escapeHtml(patch.name)}</div>
              <div class="patch-desc">${escapeHtml(patch.description || 'No description available')}</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-name="${escapeHtml(patch.name)}" ${isDefault ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
          ${optionsHtml}
        </div>
      `;

      const checkbox = item.querySelector('.switch input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            STATE.selectedPatches.add(patch.name);
          } else {
            STATE.selectedPatches.delete(patch.name);
          }
          updatePatchCount();
        });
      }

      // Bind listener opsi
      item.querySelectorAll('.patch-option-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const val = input.type === 'checkbox' ? input.checked : input.value;
          STATE.selectedOptions[e.target.dataset.optKey] = val;
        });
      });

      body.appendChild(item);
    });

    header.addEventListener('click', () => {
      body.classList.toggle('hidden');
      header.querySelector('.chevron').textContent = body.classList.contains('hidden') ? '▸' : '▾';
    });

    groupEl.appendChild(header);
    groupEl.appendChild(body);
    container.appendChild(groupEl);
  });

  updatePatchCount();
}

function renderPatchOptions(options) {
  let html = '<div class="patch-options-box" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-subtle); display: flex; flex-direction: column; gap: 8px;">';

  options.forEach(opt => {
    const key = opt.key;
    const title = opt.title || key;
    const rawDef = opt.default;
    const defStr = String(rawDef ?? '');
    const optType = (opt.type || '').toLowerCase();

    html += `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.85rem; flex-wrap: wrap;">
      <span style="color: var(--text-secondary); max-width: 60%; word-break: break-word;">${escapeHtml(title)}:</span>`;

    if (opt.values && typeof opt.values === 'object') {
      html += `<select class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" style="width: auto; min-width: 140px; min-height: 38px; padding: 4px 8px;">`;
      if (Array.isArray(opt.values)) {
        opt.values.forEach(val => {
          const sVal = String(val);
          html += `<option value="${escapeHtml(sVal)}" ${sVal === defStr ? 'selected' : ''}>${escapeHtml(sVal)}</option>`;
        });
      } else {
        Object.entries(opt.values).forEach(([label, val]) => {
          html += `<option value="${escapeHtml(String(val))}" ${String(val) === defStr ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        });
      }
      html += `</select>`;
    } else if (typeof rawDef === 'boolean' || optType === 'boolean') {
      const isChecked = rawDef === true;
      html += `
        <label class="switch" style="transform: scale(0.85); margin: 0;">
          <input type="checkbox" class="patch-option-input" data-opt-key="${escapeHtml(key)}" ${isChecked ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;
    } else if (optType === 'int' || optType === 'integer' || optType === 'number' || typeof rawDef === 'number') {
      html += `<input type="number" class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(defStr)}" placeholder="${escapeHtml(defStr)}" style="width: 120px; min-height: 38px; padding: 4px 8px;">`;
    } else if (defStr.startsWith('#') || key.toLowerCase().includes('color')) {
      html += `<input type="text" class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(defStr)}" style="width: 130px; min-height: 38px; padding: 4px 8px; font-family: monospace;">`;
    } else {
      html += `<input type="text" class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(defStr)}" placeholder="${escapeHtml(defStr)}" style="width: 180px; min-height: 38px; padding: 4px 8px;">`;
    }

    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// =============================================================================
// Preset Management (Golden Preset, Ekspor & Impor Racikan)
// =============================================================================
function applyGoldenPreset() {
  const excluded = [
    'Disable edge-to-edge display',
    'Override certificate pinning',
    'Spoof Wi-Fi connection'
  ];

  document.querySelectorAll('.patch-item').forEach(item => {
    const cb = item.querySelector('.switch input[type="checkbox"]');
    if (!cb) return;
    const name = cb.dataset.name;
    if (excluded.includes(name)) {
      cb.checked = false;
      STATE.selectedPatches.delete(name);
    } else {
      cb.checked = true;
      STATE.selectedPatches.add(name);
    }
  });

  // Terapkan default options dari Golden Preset
  STATE.selectedOptions = {
    'iconType': 'cairo',
    'appIcon': 'original',
    'doubleTapLengthArrays': '3, 5, 10, 15, 20, 30, 60, 120, 180',
    'rvxSettingsLabel': 'RVX',
    'darkThemeColor': '#FF000000',
    'lightThemeColor': '#FFFFFFFF',
    'settingsMenuIcon': 'extension',
    'widerButtonsSpace': false,
    'changeTopButtons': true,
    'precompileLegacyThemes': false,
    'applyToAll': true
  };

  syncOptionsToDom();
  updatePatchCount();
}

function syncOptionsToDom() {
  document.querySelectorAll('.patch-option-input').forEach(input => {
    const k = input.dataset.optKey;
    if (STATE.selectedOptions[k] !== undefined) {
      if (input.type === 'checkbox') {
        input.checked = Boolean(STATE.selectedOptions[k]);
      } else {
        input.value = STATE.selectedOptions[k];
      }
    }
  });
}

function exportPreset() {
  const allPatchNames = STATE.patches.map(p => p.name);
  const excluded = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const included = Array.from(STATE.selectedPatches);

  const presetData = {
    format: "rvx-cloud-preset",
    version: "1.0",
    created_at: new Date().toISOString(),
    source: STATE.currentSource,
    patchTag: document.getElementById('selectPatchRelease')?.value || STATE.patchTag || 'dev',
    youtubeVersion: STATE.currentVersion,
    arch: document.getElementById('selectArch')?.value || STATE.buildArch || 'all',
    buildMode: document.getElementById('selectBuildMode')?.value || 'test',
    totalActivePatches: included.length,
    includedPatches: included,
    excludedPatches: excluded,
    options: STATE.selectedOptions
  };

  const jsonStr = JSON.stringify(presetData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rvx-preset-${STATE.currentSource}-v${STATE.currentVersion}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importPreset(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') {
        throw new Error('Data is not a valid JSON object');
      }

      // 1. Switch Patch Source if different
      if (data.source && data.source !== STATE.currentSource) {
        STATE.currentSource = data.source;
        const selectSrc = document.getElementById('selectPatchSource');
        if (selectSrc) selectSrc.value = data.source;
        await fetchAndRenderPatches(data.source);
      }

      // 2. Restore Patch Tag
      if (data.patchTag) {
        STATE.patchTag = data.patchTag;
        const selectTag = document.getElementById('selectPatchRelease');
        if (selectTag) selectTag.value = data.patchTag;
      }

      // 3. Restore YouTube Version
      if (data.youtubeVersion) {
        STATE.currentVersion = data.youtubeVersion;
        const exists = STATE.availableVersions.find(x => x.version === data.youtubeVersion);
        if (!exists) {
          STATE.availableVersions.unshift({
            version: data.youtubeVersion,
            isBeta: false,
            isRecommended: false,
            isManifest: false,
            title: `YouTube ${data.youtubeVersion} (Imported)`
          });
        }
        renderVersionSelector();
      }

      // 4. Restore Target Architecture
      if (data.arch) {
        STATE.buildArch = data.arch;
        const selectArch = document.getElementById('selectArch');
        if (selectArch) selectArch.value = data.arch;
      }

      // 5. Restore Build Mode
      if (data.buildMode) {
        const selectMode = document.getElementById('selectBuildMode');
        if (selectMode) selectMode.value = data.buildMode;
      }

      // 6. Restore Patch Selection
      const includedSet = new Set(data.includedPatches || []);
      const excludedSet = new Set(data.excludedPatches || []);

      document.querySelectorAll('.patch-item').forEach(item => {
        const cb = item.querySelector('.switch input[type="checkbox"]');
        if (!cb) return;
        const name = cb.dataset.name;

        let shouldCheck = true;
        if (data.includedPatches && data.includedPatches.length > 0) {
          shouldCheck = includedSet.has(name);
        } else if (data.excludedPatches && data.excludedPatches.length > 0) {
          shouldCheck = !excludedSet.has(name);
        }

        cb.checked = shouldCheck;
        if (shouldCheck) {
          STATE.selectedPatches.add(name);
        } else {
          STATE.selectedPatches.delete(name);
        }
      });

      // 7. Restore Dynamic Configuration Options
      if (data.options && typeof data.options === 'object') {
        STATE.selectedOptions = { ...data.options };
        syncOptionsToDom();
      }

      updatePatchCount();
      alert(`✅ Preset Imported Successfully!\n• YouTube Version: v${STATE.currentVersion}\n• Active Patches: ${STATE.selectedPatches.size}\n• Patch Source: ${STATE.currentSource}`);
    } catch (err) {
      console.error('Error importing preset:', err);
      alert('❌ Failed to import preset: Invalid JSON file format!');
    }
  };
  reader.readAsText(file);
}

function updatePatchCount() {
  const el = document.getElementById('activePatchCount');
  if (el) el.textContent = STATE.selectedPatches.size;
}

// =============================================================================
// Trigger Cloud Build with Dynamic Configuration Payload
// =============================================================================
async function triggerCloudBuild() {
  if (!STATE.authToken) {
    openAuthModal();
    return;
  }

  const mode = document.getElementById('selectBuildMode').value;
  const arch = document.getElementById('selectArch')?.value || STATE.buildArch || 'all';
  const patchTag = document.getElementById('selectPatchRelease')?.value || STATE.patchTag || 'dev';
  STATE.buildArch = arch;
  STATE.patchTag = patchTag;

  const progressModal = document.getElementById('buildProgressModal');
  const statusMsg = document.getElementById('buildStatusMsg');
  const linksBox = document.getElementById('buildActionLinks');
  const runLink = document.getElementById('linkActionsRun');

  progressModal.classList.remove('hidden');
  linksBox.classList.add('hidden');
  statusMsg.textContent = `Connecting to GitHub Actions runner (${mode.toUpperCase()} mode, ${arch.toUpperCase()})...`;

  // Collect precise excluded patches list
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
        arch: arch,
        build_mode: mode,
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
      statusMsg.textContent = `✅ Build Trigger Dispatched Successfully! Runner is now patching YouTube v${STATE.currentVersion} (${arch.toUpperCase()}) using ${STATE.currentSource} (${patchTag}) bundle with ${includedPatches.length} selected patches.`;
      linksBox.classList.remove('hidden');
      runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Response code: ${res.status}`);
    }
  } catch (err) {
    statusMsg.textContent = `❌ Failed to trigger build: ${err.message}. Make sure your token has 'repo' or 'actions:write' permission.`;
  }
}

// =============================================================================
// Event Listeners & Modals
// =============================================================================
function initEventListeners() {
  document.getElementById('selectSource').addEventListener('change', async (e) => {
    STATE.currentSource = e.target.value;
    const s = STATE.sources.find(src => src.id === e.target.value);
    document.getElementById('sourceDesc').textContent = s?.description || '';
    await loadPatchReleases(s);
    fetchAndRenderPatches(e.target.value);
  });

  const selectPatch = document.getElementById('selectPatchRelease');
  if (selectPatch) {
    selectPatch.addEventListener('change', (e) => {
      updatePatchTagBadge(e.target.value);
    });
  }

  const selectArch = document.getElementById('selectArch');
  if (selectArch) {
    selectArch.addEventListener('change', (e) => {
      STATE.buildArch = e.target.value;
    });
  }

  const btnNotes = document.getElementById('btnViewPatchNotes');
  if (btnNotes) {
    btnNotes.addEventListener('click', showPatchNotesModal);
  }

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

  // Filter Kategori Versi (Semua, Rekomendasi, Stabil Saja, Beta)
  document.querySelectorAll('.btn-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.versionFilter = btn.dataset.filter;
      STATE.versionDisplayLimit = 12;
      renderVersionSelector();
    });
  });

  // Pencarian Versi YouTube
  const inputSearchVer = document.getElementById('inputSearchVersion');
  if (inputSearchVer) {
    inputSearchVer.addEventListener('input', (e) => {
      STATE.versionSearch = e.target.value.trim();
      STATE.versionDisplayLimit = 12;
      renderVersionSelector();
    });
  }

  // Tombol Muat Lebih Banyak Versi Bertahap (+24)
  const btnLoadMore = document.getElementById('btnLoadMoreVersions');
  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      STATE.versionDisplayLimit = (STATE.versionDisplayLimit || 12) + 24;
      renderVersionSelector();
    });
  }

  // Toggle Menampilkan Seluruh Katalog Versi vs Ringkas
  const btnToggleVersions = document.getElementById('btnToggleAllVersions');
  if (btnToggleVersions) {
    btnToggleVersions.addEventListener('click', () => {
      STATE.showAllVersions = !STATE.showAllVersions;
      if (!STATE.showAllVersions) {
        STATE.versionDisplayLimit = 12;
      }
      renderVersionSelector();
    });
  }

  // Terapkan Versi Manual / Custom
  const applyCustomVer = () => {
    const input = document.getElementById('inputCustomVersion');
    if (!input) return;
    const customVer = input.value.trim().replace(/^v/i, '');
    if (!customVer) return;

    if (!/^\d+(\.\d+)+$/.test(customVer)) {
      alert('Invalid version format. Correct format example: 21.07.247 or 20.51.39');
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
    input.value = '';
  };

  const btnApplyVer = document.getElementById('btnApplyCustomVersion');
  if (btnApplyVer) {
    btnApplyVer.addEventListener('click', applyCustomVer);
  }

  const inputCustomVer = document.getElementById('inputCustomVersion');
  if (inputCustomVer) {
    inputCustomVer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCustomVer();
      }
    });
  }

  document.getElementById('btnLoadGoldenPreset').addEventListener('click', applyGoldenPreset);
  document.getElementById('btnResetPatches').addEventListener('click', () => {
    document.querySelectorAll('.patch-item input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      STATE.selectedPatches.add(cb.dataset.name);
    });
    updatePatchCount();
  });

  // Export & Import Custom Preset (.json)
  const btnExport = document.getElementById('btnExportPreset');
  if (btnExport) {
    btnExport.addEventListener('click', exportPreset);
  }

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

  // Smart Patch Search (Matches Patch Name & Feature Description)
  const inputSearchPatch = document.getElementById('inputSearchPatch');
  if (inputSearchPatch) {
    inputSearchPatch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.category-group').forEach(group => {
        let groupHasMatch = false;
        group.querySelectorAll('.patch-item').forEach(item => {
          const name = (item.dataset.patchName || '').toLowerCase();
          const desc = (item.querySelector('.patch-desc')?.textContent || '').toLowerCase();
          const match = !query || name.includes(query) || desc.includes(query);
          item.style.display = match ? 'flex' : 'none';
          if (match) groupHasMatch = true;
        });
        group.style.display = groupHasMatch ? 'block' : 'none';
      });
    });
  }

  document.getElementById('btnTriggerBuild').addEventListener('click', triggerCloudBuild);

  document.getElementById('btnAuthModal').addEventListener('click', openAuthModal);
  document.getElementById('btnCloseAuthModal').addEventListener('click', closeAuthModal);
  document.getElementById('btnCloseProgressModal').addEventListener('click', () => {
    document.getElementById('buildProgressModal').classList.add('hidden');
  });

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
      alertBox.textContent = 'Token was rejected by GitHub API. Please check your token permissions.';
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
