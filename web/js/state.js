/**
 * YouTube RVX — State Management & Constants
 * Version: 2.1.9
 */

const STATE = {
  uiMode: localStorage.getItem('rvx_ui_mode') || 'morphe',
  activeScreen: 'home', // 'home' | 'version' | 'patches' | 'progress'
  tuiScreen: 'main',
  tuiSelectedIndex: 0,

  // Multi-Application MPP Support
  allManifestPatches: [],
  availableApps: [],
  currentApp: {
    packageName: 'com.google.android.youtube',
    appName: 'YouTube',
    patchCount: 0,
    accentColor: '#FF0033',
    gradient: 'linear-gradient(135deg, #7A121D 0%, #2B0B0E 100%)'
  },

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
  daemonVersion: '2.1.10',
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
  }
};

const GENERIC_APP_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.5"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;

function resolveAppMeta(pkgId, fallbackName = null) {
  const normId = String(pkgId || '').trim();
  if (KNOWN_APP_METADATA[normId]) {
    return { ...KNOWN_APP_METADATA[normId], packageName: normId };
  }
  // Check by name if ID was passed as "YouTube Music" or "Reddit"
  for (const [key, meta] of Object.entries(KNOWN_APP_METADATA)) {
    if (meta.name.toLowerCase() === normId.toLowerCase() || meta.alias.toLowerCase() === normId.toLowerCase()) {
      return { ...meta, packageName: key };
    }
  }

  // Derive human friendly name for unknown packages
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

