/**
 * YouTube RVX — State Management & Constants
 * Version: 2.1.15
 */

const STATE = {
  uiMode: RVX_STORAGE.local.getItem('rvx_ui_mode') || 'morphe',
  activeScreen: 'home', // 'home' | 'version' | 'patches' | 'progress' | 'wizard'
  tuiScreen: 'main',
  tuiSelectedIndex: 0,

  // Setup Wizard & Returning User Dashboard State
  setupCompleted: RVX_STORAGE.local.getItem('rvx_setup_completed') === 'true',
  wizardStep: 1, // 1: Source & Release, 2: App, 3: Version, 4: Mode & Patches, 5: Build
  targetMode: null, // user must explicitly choose 'root' or 'non-root'
  appConfigs: {},

  // Multi-Application MPP Support
  allManifestPatches: [],
  availableApps: [],
  currentApp: null,

  sources: [],
  registryApps: [],
  sourceManifestCache: {},
  sourceManifestCacheKey: {},
  sourceManifestLoadToken: {},
  sourceManifestStatus: {},
  sourceReleases: {},
  currentSource: null,
  patchTag: '',
  patchReleases: [],
  channelLoading: false,
  channelLoadToken: 0,
  currentVersion: '',
  showAllVersions: false,
  sourceVersions: [],
  selectedExternalVersion: null,
  otherVersions: [],
  otherVersionsTotal: 0,
  otherVersionsNextOffset: 0,
  otherVersionsQuery: '',
  otherVersionsChannel: 'all',
  otherVersionsLoading: false,
  otherVersionsRefreshedAt: 0,
  stepRefreshState: {},
  preReleasePatches: RVX_STORAGE.local.getItem('rvx_pre_release_patches') !== 'false',
  experimentalAppVersions: RVX_STORAGE.local.getItem('rvx_experimental_app_versions') === 'true',
  recommendedVersion: '',
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
  patchListFilter: 'all',
  editingPatchName: null,
  modeEditorExpanded: true,
  patchOptionsDraft: {},
  patchOptionFiles: {},
  patchOptionsReturnFocusId: '',
  optionPreviewCache: {},
  forceOptionPreviewRefresh: false,

  // MicroG smart prompt tracking
  microgWarningDismissed: false,

  authToken: RVX_STORAGE.local.getItem('rvx_gh_pat') || '',
  authUser: null,
  engineMode: window.RVX_RUNTIME?.isRootWebUI ? 'local' : 'browser',
  runtimeCapabilities: null,
  portableEngineManifest: null,
  portableEngineStatus: null,
  selectedRelease: null,
  selectedApkFile: null,
  browserDownloadPlan: null,
  browserPatchAbortController: null,
  registrySchemaVersion: 0,
  registryGeneratedAt: '',
  daemonOnline: false,
  daemonUrl: '',
  daemonVersion: '2.1.15',
  daemonStatus: null,
  deviceAccessMode: 'browser-only',
  pendingLocalPatchPayload: null,
  storageLocations: [],
  storageSelection: null,
  storageBrowseKind: '',
  storageBrowsePath: '',
  storageBrowseParent: '',
  storageBrowseReturnFocusId: '',
  pendingDownloadPlan: null,
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
    name: 'Anddea Patches',
    repository: 'anddea/revanced-patches',
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json',
    bundleAssetPattern: '*.mpp',
    defaultReleaseType: 'dev',
    isDefault: true,
    isPreinstalled: true,
    badge: 'Recommended',
    avatarText: 'A',
    avatarColor: '#EF4444',
    avatarGradient: 'linear-gradient(135deg, #EF4444 0%, #991B1B 100%)',
    description: 'Fitur kustomisasi terlengkap untuk YouTube RVX dengan update rutin paling aktif'
  },
  {
    id: 'morphe',
    name: 'Morphe Official',
    repository: 'MorpheApp/morphe-patches',
    manifestUrl: 'https://raw.githubusercontent.com/MorpheApp/morphe-patches/refs/heads/main/patches-list.json',
    bundleAssetPattern: '*.mpp',
    defaultReleaseType: 'latest',
    isDefault: false,
    isPreinstalled: true,
    badge: 'Morphe Team',
    avatarText: 'M',
    avatarColor: '#3B82F6',
    avatarGradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    description: 'Patches resmi terkurasi oleh tim ekosistem Morphe Manager'
  },
  {
    id: 'piko',
    name: 'Piko Patches',
    repository: 'crimera/piko',
    manifestUrl: 'https://raw.githubusercontent.com/crimera/piko/refs/heads/main/patches-list.json',
    bundleAssetPattern: '*.mpp',
    defaultReleaseType: 'latest',
    isDefault: false,
    isPreinstalled: true,
    badge: 'X & Instagram',
    avatarText: 'P',
    avatarColor: '#6366F1',
    avatarGradient: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
    description: 'Patch komunitas untuk Twitter/X dan Instagram'
  }
];

const FALLBACK_YOUTUBE_VERSIONS = [
  { version: '21.13.164', isBeta: false },
  { version: '21.12.39', isBeta: false },
  { version: '21.11.37', isBeta: false },
  { version: '20.51.39', isBeta: false }
];

const KNOWN_APP_METADATA = {
  'com.google.android.youtube': {
    name: 'YouTube',
    alias: 'YouTube',
    accentColor: '#FF0033',
    gradient: 'linear-gradient(135deg, #7A121D 0%, #2B0B0E 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>`
  },
  'com.google.android.apps.youtube.music': {
    name: 'YouTube Music',
    alias: 'YouTubeMusic',
    accentColor: '#FF0000',
    gradient: 'linear-gradient(135deg, #780E1A 0%, #1A0507 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF"><circle cx="12" cy="12" r="10" fill="none" stroke="#FFFFFF" stroke-width="2"/><polygon points="10,8 16,12 10,16"/></svg>`
  },
  'com.reddit.frontpage': {
    name: 'Reddit',
    alias: 'Reddit',
    accentColor: '#FF4500',
    gradient: 'linear-gradient(135deg, #7C2B0D 0%, #1E0C04 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF"><circle cx="12" cy="12" r="9" fill="none" stroke="#FFFFFF" stroke-width="2"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M8.5 15c1 1.2 2.3 1.8 3.5 1.8s2.5-.6 3.5-1.8" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  'com.twitter.android': {
    name: 'Twitter / X',
    alias: 'Twitter',
    accentColor: '#1D9BF0',
    gradient: 'linear-gradient(135deg, #163654 0%, #081420 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="#FFFFFF"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
  },
  'com.zhiliaoapp.musically': {
    name: 'TikTok',
    alias: 'TikTok',
    accentColor: '#00F2FE',
    gradient: 'linear-gradient(135deg, #0C4348 0%, #051A1D 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="#FFFFFF"><path d="M12.5 2v12.2a3.8 3.8 0 1 1-3.5-3.8c.4 0 .8.1 1.2.2V6.3c1.5 1.2 3.4 1.9 5.5 1.9V4.5a6.5 6.5 0 0 1-3.2-2.5z"/></svg>`
  },
  'com.instagram.android': {
    name: 'Instagram',
    alias: 'Instagram',
    accentColor: '#E1306C',
    gradient: 'linear-gradient(135deg, #6B1B47 0%, #200715 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`
  },
  'tv.twitch.android.app': {
    name: 'Twitch',
    alias: 'Twitch',
    accentColor: '#9146FF',
    gradient: 'linear-gradient(135deg, #3D1A72 0%, #15062A 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="#FFFFFF"><path d="M2.149 0l-1.612 4.119v16.036h5.361v3.845h3.845l3.845-3.845h4.298l6.114-6.114V0H2.149zm19.141 13.065l-3.376 3.376h-4.975l-3.376 3.376v-3.376H4.382V2.149h16.908v10.916zm-9.395-6.837h2.149v6.114h-2.149V6.228zm5.361 0h2.149v6.114h-2.149V6.228z"/></svg>`
  },
  'com.spotify.music': {
    name: 'Spotify',
    alias: 'Spotify',
    accentColor: '#1DB954',
    gradient: 'linear-gradient(135deg, #0F5128 0%, #061F10 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="#FFFFFF"><circle cx="12" cy="12" r="10"/><path d="M8 9.5c3-1 6-1 8.5.5M8.5 12.5c2.5-.8 5-.8 7 .5M9 15.5c2-.5 4-.5 5.5.5" stroke="#000000" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  'com.duolingo': {
    name: 'Duolingo',
    alias: 'Duolingo',
    accentColor: '#58CC02',
    gradient: 'linear-gradient(135deg, #2D6B00 0%, #0F2500 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="9" cy="11" r="2" fill="#FFFFFF"/><circle cx="15" cy="11" r="2" fill="#FFFFFF"/><path d="M10 16c1 1 3 1 4 0"/></svg>`
  },
  'com.strava': {
    name: 'Strava',
    alias: 'Strava',
    accentColor: '#FC4C02',
    gradient: 'linear-gradient(135deg, #7A2400 0%, #260B00 100%)',
    iconSvg: `<svg viewBox="0 0 24 24" width="26" height="26" fill="#FFFFFF"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.925 15.57h4.172"/></svg>`
  },
  'com.facebook.katana': {
    name: 'Facebook',
    alias: 'Facebook',
    accentColor: '#1877F2',
    gradient: 'linear-gradient(135deg, #174EA6 0%, #071B3E 100%)'
  },
  'com.instagram.barcelona': {
    name: 'Threads',
    alias: 'Threads',
    accentColor: '#202124',
    gradient: 'linear-gradient(135deg, #303134 0%, #111214 100%)'
  },
  'org.telegram.messenger': {
    name: 'Telegram',
    alias: 'Telegram',
    accentColor: '#229ED9',
    gradient: 'linear-gradient(135deg, #176A93 0%, #082A3B 100%)'
  },
  'com.google.android.inputmethod.latin': {
    name: 'Gboard',
    alias: 'Gboard',
    accentColor: '#4285F4',
    gradient: 'linear-gradient(135deg, #295AA8 0%, #0D2347 100%)'
  },
  'com.lemon.lvoverseas': {
    name: 'CapCut',
    alias: 'CapCut',
    accentColor: '#202124',
    gradient: 'linear-gradient(135deg, #303134 0%, #111214 100%)'
  }
};

const APP_PRIORITY_ORDER = [
  'com.google.android.youtube',
  'com.google.android.apps.youtube.music',
  'com.zhiliaoapp.musically',
  'com.instagram.android',
  'com.twitter.android',
  'com.reddit.frontpage',
  'com.spotify.music',
  'com.facebook.katana',
  'com.instagram.barcelona',
  'tv.twitch.android.app',
  'org.telegram.messenger',
  'com.google.android.inputmethod.latin',
  'com.lemon.lvoverseas',
  'com.strava',
  'com.duolingo'
];

function compareAppsByPriority(a, b) {
  const indexA = APP_PRIORITY_ORDER.indexOf(a.packageName);
  const indexB = APP_PRIORITY_ORDER.indexOf(b.packageName);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.name.localeCompare(b.name);
}

const GENERIC_APP_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.5"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;

function resolveAppMeta(pkgId, fallbackName = null) {
  const normId = String(pkgId || '').trim();
  if (KNOWN_APP_METADATA[normId]) {
    return { ...KNOWN_APP_METADATA[normId], packageName: normId };
  }
  for (const [key, meta] of Object.entries(KNOWN_APP_METADATA)) {
    if (meta.name.toLowerCase() === normId.toLowerCase() || meta.alias.toLowerCase() === normId.toLowerCase()) {
      return { ...meta, packageName: key };
    }
  }

  let derivedName = fallbackName;
  if (!derivedName) {
    const parts = normId.split('.');
    derivedName = capitalize(parts[parts.length - 1] || normId);
  }

  return {
    packageName: normId,
    name: derivedName,
    alias: derivedName.replace(/\s+/g, ''),
    accentColor: '#63B3ED',
    gradient: 'linear-gradient(135deg, #2D3748 0%, #1A202C 100%)',
    iconSvg: GENERIC_APP_SVG
  };
}

function normalizePackageId(pkgId) {
  const value = String(pkgId || '').trim();
  if (!value || Object.prototype.hasOwnProperty.call(KNOWN_APP_METADATA, value)) return value;
  const normalizedName = value.toLowerCase();
  const known = Object.entries(KNOWN_APP_METADATA).find(([, meta]) =>
    meta.name.toLowerCase() === normalizedName || meta.alias.toLowerCase() === normalizedName
  );
  return known ? known[0] : value;
}

function isSourceCompatibleWithApp(sourceId, pkgName) {
  if (!pkgName) return false;
  const sourceStatus = STATE.sourceManifestStatus[sourceId];
  return sourceStatus?.status === 'ready' && sourceStatus.packageNames instanceof Set
    ? sourceStatus.packageNames.has(pkgName)
    : false;
}

function getCompatibleSourcesForApp(pkgName) {
  if (!pkgName) return [];
  const list = STATE.sources && STATE.sources.length ? STATE.sources : DEFAULT_SOURCES;
  return list.filter(s => isSourceCompatibleWithApp(s.id, pkgName));
}

function getAllSupportedApps() {
  if (typeof extractSupportedApps !== 'function') return [];
  const appsByPackage = new Map();

  Object.entries(STATE.sourceManifestCache || {}).forEach(([sourceId, patches]) => {
    const manifestStatus = STATE.sourceManifestStatus[sourceId];
    if (manifestStatus?.status !== 'ready') return;
    if (!Array.isArray(patches)) return;
    extractSupportedApps(patches).forEach(app => {
      const entry = appsByPackage.get(app.packageName) || {
        ...app,
        patchCount: 0,
        patchNames: new Set(),
        sourcesCount: 0,
        supportingSources: [],
        sourceIds: new Set()
      };
      (app.patchNames || []).forEach(name => entry.patchNames.add(name));
      entry.patchCount = entry.patchNames.size;
      const knownVersionsCount = entry.availableVersionsCount || 0;
      if (app.recommendedVersion && (!entry.recommendedVersion || (app.availableVersionsCount || 0) > knownVersionsCount)) {
        entry.recommendedVersion = app.recommendedVersion;
      }
      entry.availableVersionsCount = Math.max(knownVersionsCount, app.availableVersionsCount || 0);
      if (!entry.sourceIds.has(sourceId)) {
        entry.sourceIds.add(sourceId);
        entry.sourcesCount += 1;
        const source = STATE.sources.find(item => item.id === sourceId);
        entry.supportingSources.push(source?.name || sourceId);
      }
      appsByPackage.set(app.packageName, entry);
    });
  });

  const registryMetadata = new Map((STATE.registryApps || []).map(app => [app.packageName, app]));
  // Registry compatibility is already verified catalog data. Use it for every
  // matched source so the app picker does not need to download every manifest.
  (STATE.sources || []).filter(source => Array.isArray(source.registryPackages)).forEach(source => {
    (source.registryPackages || []).forEach(packageName => {
      const registryApp = registryMetadata.get(packageName) || {};
      const meta = resolveAppMeta(packageName, registryApp.name || null);
      const versions = Array.isArray(registryApp.versions) ? registryApp.versions.filter(Boolean) : [];
      const entry = appsByPackage.get(packageName) || {
        ...meta,
        iconUrl: registryApp.iconUrl || null,
        packageName,
        patchCount: 0,
        patchNames: new Set(),
        sourcesCount: 0,
        supportingSources: [],
        sourceIds: new Set(),
        recommendedVersion: versions.slice().sort((a, b) =>
          String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: 'base' })
        )[0] || '',
        availableVersionsCount: versions.length,
        catalogCoverageUnknown: true
      };
      if (!entry.iconUrl && registryApp.iconUrl) entry.iconUrl = registryApp.iconUrl;
      if (!entry.sourceIds.has(source.id)) {
        entry.sourceIds.add(source.id);
        entry.sourcesCount += 1;
        entry.supportingSources.push(source.name || source.id);
      }
      entry.catalogCoverageUnknown = true;
      appsByPackage.set(packageName, entry);
    });
  });

  return Array.from(appsByPackage.values()).map(app => ({
    ...app,
    patchNames: Array.from(app.patchNames),
    sourceIds: Array.from(app.sourceIds)
  })).sort(compareAppsByPriority);
}

// Master catalog of all supported apps
STATE.availableApps = [];

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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function loadPersistedSources() {
  try {
    const raw = RVX_STORAGE.local.getItem('rvx_sources_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_SOURCES));
}

function savePersistedSources(sources) {
  try {
    RVX_STORAGE.local.setItem('rvx_sources_v2', JSON.stringify(sources.filter(source => !source.isDiscovered)));
  } catch (_) {}
}

function addCustomSource(source) {
  if (!source || (!source.repository && !source.manifestUrl)) return null;
  const rawInput = (source.repository || source.manifestUrl || '').trim();
  const cleanRepo = rawInput.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
  
  const isUrl = cleanRepo.startsWith('http://') || cleanRepo.startsWith('https://');
  const id = (source.id || (isUrl ? 'custom_' + Date.now().toString(36) : cleanRepo.replace(/[\/\.-]/g, '_').toLowerCase())).slice(0, 32);
  const name = (source.name || (isUrl ? 'Custom Feed' : cleanRepo.split('/')[1] || cleanRepo)).trim();
  
  const manifestUrl = isUrl 
    ? cleanRepo 
    : `https://raw.githubusercontent.com/${cleanRepo}/refs/heads/main/patches-list.json`;

  const newSource = {
    id,
    name,
    repository: isUrl ? '' : cleanRepo,
    manifestUrl,
    bundleAssetPattern: '*.mpp',
    defaultReleaseType: source.defaultReleaseType || 'latest',
    isDefault: false,
    isPreinstalled: false,
    badge: 'Custom',
    avatarText: name.charAt(0).toUpperCase() || 'C',
    avatarColor: '#14B8A6',
    avatarGradient: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)',
    description: source.description || (isUrl ? `Custom URL: ${cleanRepo}` : `GitHub: ${cleanRepo}`)
  };

  const existingIdx = STATE.sources.findIndex(s => s.id === id);
  if (existingIdx !== -1) {
    STATE.sources[existingIdx] = newSource;
  } else {
    STATE.sources.push(newSource);
  }
  delete STATE.sourceManifestCache[id];
  delete STATE.sourceManifestCacheKey[id];
  delete STATE.sourceManifestLoadToken[id];
  delete STATE.sourceManifestStatus[id];
  delete STATE.sourceReleases[id];

  savePersistedSources(STATE.sources);
  return newSource;
}

function deleteCustomSource(sourceId) {
  const idx = STATE.sources.findIndex(s => s.id === sourceId);
  if (idx === -1) return false;

  STATE.sources.splice(idx, 1);
  delete STATE.sourceManifestCache[sourceId];
  delete STATE.sourceManifestCacheKey[sourceId];
  delete STATE.sourceManifestLoadToken[sourceId];
  delete STATE.sourceManifestStatus[sourceId];
  delete STATE.sourceReleases[sourceId];
  if (STATE.sources.length === 0) {
    STATE.sources = JSON.parse(JSON.stringify(DEFAULT_SOURCES));
  }
  savePersistedSources(STATE.sources);

  if (STATE.currentSource === sourceId) {
    STATE.currentSource = null;
    STATE.patchTag = '';
    RVX_STORAGE.local.removeItem('rvx_active_source');
  }
  STATE.availableApps = getAllSupportedApps();
  return true;
}

function resetSourcesToDefault() {
  const installed = STATE.sources.filter(source => source.isPreinstalled || source.isDefault);
  STATE.sources = installed.length ? installed : JSON.parse(JSON.stringify(DEFAULT_SOURCES));
  savePersistedSources(STATE.sources);
  STATE.currentSource = null;
  STATE.patchTag = '';
  RVX_STORAGE.local.removeItem('rvx_active_source');
}

function loadAppConfigs() {
  try {
    const raw = RVX_STORAGE.local.getItem('rvx_app_configs');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {};
}

function saveAppConfig(pkgId, config) {
  if (!pkgId) return;
  STATE.appConfigs[pkgId] = {
    ...config,
    configuredAt: new Date().toISOString()
  };
  try {
    RVX_STORAGE.local.setItem('rvx_app_configs', JSON.stringify(STATE.appConfigs));
  } catch (_) {}
}

function getAppConfig(pkgId) {
  if (!pkgId) return null;
  return STATE.appConfigs[pkgId] || null;
}

function isAppConfigured(pkgId) {
  if (!pkgId) return false;
  return !!(STATE.appConfigs && STATE.appConfigs[pkgId]);
}

function resetAllAppConfigs() {
  STATE.appConfigs = {};
  RVX_STORAGE.local.removeItem('rvx_app_configs');
  RVX_STORAGE.local.removeItem('rvx_setup_completed');
  STATE.setupCompleted = false;
}

function resetBrowserPatchState() {
  STATE.selectedApkFile = null;
  STATE.browserDownloadPlan = null;
  STATE.pendingDownloadPlan = null;
  STATE.browserPatchAbortController?.abort();
  STATE.browserPatchAbortController = null;
  const input = document.getElementById('inputBrowserApk');
  if (input) input.value = '';
  const panel = document.getElementById('browserApkInputPanel');
  panel?.classList.remove('is-ready');
  const status = document.getElementById('browserApkInputStatus');
  if (status) status.textContent = 'Pilih APK yang versinya sesuai dengan konfigurasi.';
}

// Initialize loaded app configs
STATE.appConfigs = loadAppConfigs();


