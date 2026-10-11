/**
 * YouTube RVX — State Management & Constants
 * Version: 2.1.9
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
  daemonVersion: '2.1.9',
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
