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
        .replace('/refs/tags/', '@')
    );
  }

  // Fallback between patches-list.json and patches.json
  if (url.includes('patches-list.json')) {
    urlsToTry.push(url.replace('patches-list.json', 'patches.json'));
    urlsToTry.push(
      url.replace('patches-list.json', 'patches.json')
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
        .replace('/refs/tags/', '@')
    );
  } else if (url.includes('patches.json')) {
    urlsToTry.push(url.replace('patches.json', 'patches-list.json'));
    urlsToTry.push(
      url.replace('patches.json', 'patches-list.json')
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/refs/heads/', '@')
        .replace('/refs/tags/', '@')
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

function registryV2ToLegacy(index, appsDocument) {
  if (index?.schemaVersion !== 2 || !Array.isArray(index.sources)) return null;
  const apps = Array.isArray(appsDocument?.apps)
    ? appsDocument.apps
    : Array.isArray(index.popularApps) ? index.popularApps : [];
  const packagesBySource = new Map();
  apps.forEach(app => {
    (app.sourceIds || []).forEach(sourceId => {
      const packages = packagesBySource.get(sourceId) || [];
      packages.push(app.packageName);
      packagesBySource.set(sourceId, packages);
    });
  });
  const sources = index.sources.map(source => {
    const release = source.latestRelease || {};
    const nativeMpp = release.nativeMpp || { available: false };
    const portable = release.portable || { available: false };
    return {
      id: source.id,
      bundleId: source.id,
      bundleUrl: nativeMpp.available ? nativeMpp.url || '' : '',
      description: source.description || '',
      iconUrl: source.iconUrl || null,
      name: source.name,
      packages: packagesBySource.get(source.id) || [],
      patchCount: source.patchCount || 0,
      prerelease: Boolean(release.prerelease),
      publishedAt: release.publishedAt || '',
      repository: source.repository || '',
      sourceUrl: source.sourceUrl || '',
      version: release.tag || '',
      capabilities: {
        nativeMpp,
        portable
      }
    };
  }).filter(source => source.repository && source.packages.length > 0);
  return {
    appCount: apps.length,
    apps,
    catalogEtag: index.catalogEtag || '',
    catalogGeneration: index.catalogGeneration || index.generatedAt || '',
    provider: index.provider || 'rvx-registry-v2',
    sourceCount: sources.length,
    sources,
    schemaVersion: 2,
    generatedAt: index.generatedAt || ''
  };
}

async function fetchRegistryV2({ refresh = false } = {}) {
  const suffix = refresh ? `?refresh=${Date.now()}` : '';
  const index = await fetchJsonSafe(`registry/v2/index.json${suffix}`);
  if (index?.schemaVersion !== 2) return null;
  const appsUrl = index.appsIndexUrl || 'registry/v2/apps/index.json';
  const apps = await fetchJsonSafe(`${appsUrl}${suffix}`);
  return registryV2ToLegacy(index, apps);
}

async function loadRegistryCatalogCached() {
  const cacheKey = 'rvx_registry_catalog_v3';
  let cachedData = null;
  let cachedEtag = '';
  let cachedRecord = null;
  try {
    cachedRecord = JSON.parse(RVX_STORAGE.local.getItem(cacheKey) || 'null');
    if (cachedRecord?.data?.sources) {
      cachedData = cachedRecord.data;
      cachedEtag = cachedRecord.etag || cachedData.catalogEtag || '';
    }
  } catch (_) {}

  const refreshCache = async () => {
    try {
      let fresh = await fetchRegistryV2({ refresh: true });
      if (!fresh?.sources && window.RVX_RUNTIME?.isRootWebUI && STATE.daemonOnline) {
        const response = await fetch(`${STATE.daemonUrl}/api/v1/sources/catalog?refresh=true`);
        if (response.ok) fresh = await response.json();
      }
      if (!fresh?.sources) return null;
      const etag = fresh.catalogEtag || '';
      RVX_STORAGE.local.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), etag, data: fresh }));
      const changed = !cachedData
        || fresh.catalogGeneration !== cachedData.catalogGeneration
        || fresh.catalogEtag !== cachedData.catalogEtag;
      if (changed) {
        window.dispatchEvent(new CustomEvent('rvx:registry-updated', { detail: fresh }));
      }
      return fresh;
    } catch (_) {
      return null;
    }
  };

  if (cachedData) {
    setTimeout(() => { refreshCache(); }, 0);
    return cachedData;
  }

  const registryV2 = await fetchRegistryV2();
  if (registryV2?.sources) {
    RVX_STORAGE.local.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      etag: registryV2.catalogEtag || '',
      data: registryV2
    }));
    return registryV2;
  }

  const fresh = await refreshCache();
  if (fresh?.sources) {
    return fresh;
  }

  return null;
}

function getCachedRegistryAppMetadata(fallbackApps = []) {
  try {
    const cached = JSON.parse(RVX_STORAGE.local.getItem('rvx_registry_apps_v1') || 'null');
    if (cached?.savedAt && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000 && Array.isArray(cached.apps)) {
      return cached.apps;
    }
  } catch (_) {}
  return Array.isArray(fallbackApps) ? fallbackApps : [];
}

async function refreshRegistryAppMetadata(force = false) {
  let data = await fetchJsonSafe(`registry/v2/apps/index.json${force ? `?refresh=${Date.now()}` : ''}`);
  if ((!Array.isArray(data?.apps) || data.apps.length === 0) && window.RVX_RUNTIME?.isRootWebUI && STATE.daemonOnline) {
    const suffix = force ? '?refresh=true' : '';
    data = await fetchJsonSafe(`${STATE.daemonUrl}/api/v1/sources/catalog/apps${suffix}`);
  }
  if (!Array.isArray(data?.apps) || data.apps.length === 0) return false;

  try {
    RVX_STORAGE.local.setItem('rvx_registry_apps_v1', JSON.stringify({
      savedAt: Date.now(),
      apps: data.apps
    }));
  } catch (_) {}

  if (force) {
    STATE.registryApps = data.apps;
    STATE.availableApps = getAllSupportedApps();
    if (STATE.wizardStep === 1 && typeof renderWizardAppStep === 'function') {
      renderWizardAppStep();
    }
  }
  return true;
}

async function refreshRegistryCatalogNow() {
  try {
    const fresh = await fetchRegistryV2({ refresh: true });
    if (!fresh?.sources) return false;
    applyRegistryCatalogUpdate(fresh);
    return true;
  } catch (_) {
    return false;
  }
}

function resetOtherVersionCatalog({ preserveSelection = false } = {}) {
  STATE.otherVersions = [];
  STATE.otherVersionsTotal = 0;
  STATE.otherVersionsNextOffset = 0;
  STATE.otherVersionsQuery = '';
  STATE.otherVersionsChannel = 'all';
  STATE.otherVersionsLoading = false;
  STATE.otherVersionsRefreshedAt = 0;
  if (!preserveSelection) STATE.selectedExternalVersion = null;
}

async function fetchKnownAppVersions({ offset = 0, q = '', channel = 'all', refresh = false, append = false } = {}) {
  const packageName = STATE.currentApp?.packageName;
  if (!packageName || STATE.otherVersionsLoading) return { ok: false, error: 'Aplikasi belum dipilih' };
  STATE.otherVersionsLoading = true;
  const params = new URLSearchParams({
    package: packageName,
    offset: String(Math.max(0, offset)),
    limit: '30',
    q: String(q || ''),
    channel: String(channel || 'all'),
    refresh: String(Boolean(refresh))
  });
  try {
    let data = null;
    if (window.RVX_RUNTIME?.isRootWebUI && STATE.daemonOnline) {
      const response = await fetch(`${STATE.daemonUrl}/api/v1/apps/versions?${params}`);
      if (response.ok) data = await response.json();
    }
    if (!data) {
      if (refresh || !Array.isArray(STATE.registryApps) || STATE.registryApps.length === 0) {
        await refreshRegistryAppMetadata(refresh);
      }
      const record = (STATE.registryApps || []).find(app => app.packageName === packageName);
      const query = String(q || '').trim().toLowerCase();
      const known = (record?.versions || [])
        .map(version => ({ version: String(version), isBeta: /alpha|beta|rc|dev|pre/i.test(String(version)), origin: 'registry-v2' }))
        .filter(item => !query || item.version.toLowerCase().includes(query))
        .filter(item => channel === 'all' || (channel === 'beta' ? item.isBeta : !item.isBeta))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
      const start = Math.max(0, Number(offset || 0));
      const items = known.slice(start, start + 30);
      data = {
        items,
        total: known.length,
        nextOffset: start + items.length < known.length ? start + items.length : null,
        refreshedAt: Date.now()
      };
    }
    if (STATE.currentApp?.packageName !== packageName) return { ok: false, error: 'Aplikasi berubah' };
    const sourceVersions = new Set((STATE.sourceVersions || []).map(item => String(item.version)));
    const incoming = (Array.isArray(data.items) ? data.items : [])
      .filter(item => item?.version && !sourceVersions.has(String(item.version)));
    const merged = append ? [...STATE.otherVersions, ...incoming] : incoming;
    STATE.otherVersions = Array.from(new Map(merged.map(item => [String(item.version), item])).values());
    STATE.otherVersionsTotal = Math.max(0, Number(data.total || 0) - sourceVersions.size);
    STATE.otherVersionsNextOffset = data.nextOffset === null || data.nextOffset === undefined
      ? null
      : Number(data.nextOffset);
    STATE.otherVersionsQuery = String(q || '');
    STATE.otherVersionsChannel = String(channel || 'all');
    STATE.otherVersionsRefreshedAt = Number(data.refreshedAt || Date.now());
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || 'Katalog versi tidak dapat dimuat' };
  } finally {
    STATE.otherVersionsLoading = false;
  }
}

function getManifestPatchList(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.patches) ? data.patches : null;
}

function resolveSourceReleaseTag(sourceConfig, tag = STATE.patchTag) {
  const releases = STATE.sourceReleases[sourceConfig?.id] || [];
  if (tag === 'latest') {
    return releases.find(release => !release.prerelease && !release.draft)?.tag_name || '';
  }
  if (tag === 'dev' || tag === 'prerelease') {
    return releases.find(release => release.prerelease && !release.draft)?.tag_name || '';
  }
  return String(tag || '').trim();
}

function getSelectedSourceRelease(sourceConfig = STATE.sources.find(source => source.id === STATE.currentSource), tag = STATE.patchTag) {
  if (!sourceConfig || !tag) return null;
  const releases = STATE.sourceReleases[sourceConfig.id] || STATE.patchReleases || [];
  if (tag === 'latest') return releases.find(release => !release.prerelease && !release.draft) || null;
  if (tag === 'dev' || tag === 'prerelease') return releases.find(release => release.prerelease && !release.draft) || null;
  return releases.find(release => (release.tag_name || release.name) === tag && !release.draft) || null;
}

function resolveSourceRegistryBundleId(sourceConfig, tag = STATE.patchTag) {
  if (!sourceConfig) return '';
  const selectedTag = resolveSourceReleaseTag(sourceConfig, tag);
  const catalogTag = sourceConfig.catalogRelease?.tag_name || sourceConfig.catalogRelease?.name || '';
  if (sourceConfig.registryBundleId) {
    return selectedTag && catalogTag && selectedTag === catalogTag
      ? sourceConfig.registryBundleId
      : '';
  }
  if (selectedTag && catalogTag && selectedTag === catalogTag) {
    return sourceConfig.registryFallbackBundleId || '';
  }
  return '';
}

function sourceReleaseManifestUrl(sourceConfig, tag = STATE.patchTag) {
  const repository = String(sourceConfig?.repository || '').trim();
  const resolvedTag = resolveSourceReleaseTag(sourceConfig, tag);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !resolvedTag) return '';
  const encodedTag = resolvedTag.split('/').map(part => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${repository}/refs/tags/${encodedTag}/patches-list.json`;
}

async function loadSourceManifest(sourceConfig, force = false) {
  const registryBundleId = resolveSourceRegistryBundleId(sourceConfig);
  const resolvedTag = resolveSourceReleaseTag(sourceConfig);
  const releaseManifestUrl = sourceReleaseManifestUrl(sourceConfig);
  if (!sourceConfig?.id || (!releaseManifestUrl && !sourceConfig.manifestUrl && !registryBundleId)) return null;
  const sourceId = sourceConfig.id;
  const cacheKey = registryBundleId
    ? `bundle:${registryBundleId}`
    : releaseManifestUrl
      ? `release:${sourceConfig.repository}@${resolvedTag}`
      : `manifest:${sourceConfig.manifestUrl}`;
  if (!force
    && STATE.sourceManifestCacheKey[sourceId] === cacheKey
    && Object.prototype.hasOwnProperty.call(STATE.sourceManifestCache, sourceId)) {
    return STATE.sourceManifestCache[sourceId];
  }

  const loadToken = (STATE.sourceManifestLoadToken[sourceId] || 0) + 1;
  STATE.sourceManifestLoadToken[sourceId] = loadToken;
  const previousStatus = STATE.sourceManifestStatus[sourceId];
  STATE.sourceManifestStatus[sourceId] = previousStatus?.status === 'ready'
    ? { ...previousStatus, loading: true, metadataError: '' }
    : { status: 'loading', packageNames: new Set(), loading: true };
  try {
    let data = null;
    let dataOrigin = '';
    if (releaseManifestUrl) {
      data = await fetchManifestWithFallback(releaseManifestUrl);
      if (getManifestPatchList(data)) {
        dataOrigin = 'release-tag';
      }
    }
    if (!getManifestPatchList(data) && registryBundleId && STATE.daemonOnline) {
      data = await fetchJsonSafe(`${STATE.daemonUrl}/api/v1/sources/catalog/patches?bundle=${encodeURIComponent(registryBundleId)}`);
      if (getManifestPatchList(data)) {
        dataOrigin = 'registry';
      }
    }
    if (!getManifestPatchList(data) && !releaseManifestUrl && sourceConfig.manifestUrl) {
      data = await fetchManifestWithFallback(sourceConfig.manifestUrl);
      if (getManifestPatchList(data)) dataOrigin = 'configured-manifest';
    }
    const patches = getManifestPatchList(data);
    if (!patches) throw new Error(`Metadata rilis ${resolvedTag || STATE.patchTag || ''} tidak dapat diverifikasi`);
    const packageNames = new Set(extractSupportedApps(patches).map(app => app.packageName));
    // A slower request for the same source must never overwrite a newer tag.
    if (STATE.sourceManifestLoadToken[sourceId] !== loadToken) return null;
    STATE.sourceManifestCache[sourceId] = patches;
    STATE.sourceManifestCacheKey[sourceId] = cacheKey;
    STATE.sourceManifestStatus[sourceId] = { status: 'ready', packageNames, loading: false, sourceTag: resolvedTag, dataOrigin };
    return patches;
  } catch (error) {
    if (STATE.sourceManifestLoadToken[sourceId] !== loadToken) return null;
    delete STATE.sourceManifestCache[sourceId];
    delete STATE.sourceManifestCacheKey[sourceId];
    STATE.sourceManifestStatus[sourceId] = previousStatus?.status === 'ready'
      ? { ...previousStatus, loading: false, metadataError: error.message }
      : { status: 'error', packageNames: new Set(), loading: false, error: error.message };
    return null;
  }
}

function registrySourceDisplayName(rawName, repository) {
  const owner = String(repository || '').split('/')[0] || 'Community';
  const value = String(rawName || repository?.split('/').pop() || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\bmorphe\b/ig, '')
    .replace(/\bpatches?\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
  const distinctName = value || owner;
  const title = distinctName.replace(/\b\w/g, letter => letter.toUpperCase());
  return `${title} Patches`;
}

function normalizeRegistrySource(entry) {
  if (!entry?.id || !entry?.bundleId || !Array.isArray(entry.packages)) return null;
  const nativeMpp = entry.capabilities?.nativeMpp || {
    available: Boolean(entry.bundleUrl),
    url: entry.bundleUrl || '',
    sha256: ''
  };
  const portable = entry.capabilities?.portable || { available: false };
  if (!nativeMpp.available && !portable.available) {
    // Keep discoverable source metadata, but never mark it executable.
    entry.metadataOnly = true;
  }
  const name = registrySourceDisplayName(entry.name, entry.repository);
  const assetName = decodeURIComponent(String(nativeMpp.url || '').split('/').pop() || 'patches.mpp');
  const release = {
    tag_name: entry.version || 'latest',
    name: entry.version || 'Latest',
    published_at: entry.publishedAt || '',
    prerelease: Boolean(entry.prerelease),
    draft: false,
    body: entry.releaseNotes || '',
    assets: nativeMpp.available ? [{ name: assetName, browser_download_url: nativeMpp.url }] : [],
    capabilities: { nativeMpp, portable }
  };
  return {
    id: `registry-${entry.id}`,
    name,
    repository: entry.repository || '',
    sourceUrl: entry.sourceUrl || '',
    manifestUrl: '',
    registryBundleId: entry.bundleId,
    registryPackages: entry.packages,
    bundleAssetPattern: '*.mpp',
    bundleUrl: nativeMpp.url || null,
    bundleStatus: nativeMpp.available ? 'ready' : 'missing',
    releaseStatus: 'ready',
    defaultReleaseType: entry.prerelease ? 'dev' : 'latest',
    isDefault: false,
    isPreinstalled: true,
    isDiscovered: true,
    badge: 'Registry',
    avatarText: name.slice(0, 2).toUpperCase(),
    avatarGradient: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)',
    description: entry.description || `Sumber Morphe terverifikasi dari ${entry.sourceUrl || entry.repository}`,
    registryPatchCount: entry.patchCount || 0,
    iconUrl: entry.iconUrl || entry.ownerAvatarUrl || null,
    catalogRelease: release,
    capabilities: { nativeMpp, portable }
  };
}

function mergeRegistryCatalogSources(baseSources, registryData) {
  const knownSources = new Map(baseSources
    .map(source => [String(source.repository || source.sourceUrl || '').toLowerCase(), source])
    .filter(([key]) => Boolean(key)));
  const discoveredSources = [];
  (Array.isArray(registryData?.sources) ? registryData.sources : [])
    .map(normalizeRegistrySource)
    .filter(Boolean)
    .forEach(source => {
      const key = String(source.repository || source.sourceUrl || '').toLowerCase();
      if (!key) return;
      const existing = knownSources.get(key);
      if (existing) {
        existing.catalogRelease = source.catalogRelease;
        existing.registryFallbackBundleId = source.registryBundleId;
        existing.registryFallbackBundleUrl = source.bundleUrl;
        existing.registryPackages = source.registryPackages;
        existing.iconUrl = existing.iconUrl || source.iconUrl;
        existing.capabilities = source.capabilities;
        return;
      }
      knownSources.set(key, source);
      discoveredSources.push(source);
    });
  return [...baseSources, ...discoveredSources];
}

function applyRegistryCatalogUpdate(registryData) {
  if (!registryData?.sources || !Array.isArray(STATE.sources) || STATE.sources.length === 0) return;
  const baseSources = STATE.sources.filter(source => !source.isDiscovered);
  STATE.sources = mergeRegistryCatalogSources(baseSources, registryData);
  STATE.registryApps = getCachedRegistryAppMetadata(registryData.apps);

  STATE.sources.forEach(source => {
    if (!Array.isArray(source.registryPackages)) return;
    STATE.sourceManifestStatus[source.id] = {
      status: 'ready',
      packageNames: new Set(source.registryPackages)
    };
    const hasFullReleaseHistory = Array.isArray(STATE.sourceReleases[source.id])
      && STATE.sourceReleases[source.id].length > 1
      && (source.releaseStatus === 'ready' || source.releaseStatus === 'cached');
    if (source.catalogRelease && !hasFullReleaseHistory) {
      STATE.sourceReleases[source.id] = [source.catalogRelease];
      source.releaseStatus = 'catalog';
    }
    refreshSourceBundleAvailability(source);
  });

  if (STATE.currentSource && !STATE.sources.some(source => source.id === STATE.currentSource)) {
    STATE.currentSource = null;
  }
  STATE.availableApps = getAllSupportedApps();

  if (STATE.wizardStep === 1 && typeof renderWizardAppStep === 'function') {
    renderWizardAppStep();
  } else if (STATE.wizardStep === 2 && typeof renderWizardSourceStep === 'function') {
    renderWizardSourceStep();
  }
  setTimeout(() => { refreshRegistryAppMetadata(true); }, 0);
}

async function loadSourceReleaseList(sourceConfig, force = false) {
  if (!sourceConfig?.id) return [];
  // A catalog seed contains only the current release. Do not mistake it for
  // the full history or the picker will reorder itself after opening.
  if (!force
    && sourceConfig.releaseStatus !== 'catalog'
    && Object.prototype.hasOwnProperty.call(STATE.sourceReleases, sourceConfig.id)) {
    return STATE.sourceReleases[sourceConfig.id];
  }
  let releaseCache = {};
  try { releaseCache = JSON.parse(RVX_STORAGE.local.getItem('rvx_source_releases_v1') || '{}'); } catch (_) {}
  const cached = releaseCache[sourceConfig.id];
  if (!force && cached?.fetchedAt && Date.now() - cached.fetchedAt < 30 * 60 * 1000 && Array.isArray(cached.releases)) {
    STATE.sourceReleases[sourceConfig.id] = cached.releases;
    sourceConfig.releaseStatus = 'cached';
    return cached.releases;
  }
  const repo = sourceConfig.repository || '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    STATE.sourceReleases[sourceConfig.id] = [];
    sourceConfig.releaseStatus = 'error';
    return [];
  }

  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (STATE.authToken) headers['Authorization'] = `Bearer ${STATE.authToken}`;
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const releases = await res.json();
    STATE.sourceReleases[sourceConfig.id] = Array.isArray(releases)
      ? releases.filter(release => !release.draft).sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0))
      : [];
    sourceConfig.releaseStatus = 'ready';
    releaseCache[sourceConfig.id] = { fetchedAt: Date.now(), releases: STATE.sourceReleases[sourceConfig.id] };
    try { RVX_STORAGE.local.setItem('rvx_source_releases_v1', JSON.stringify(releaseCache)); } catch (_) {}
  } catch (_) {
    try {
      // An empty daemonUrl means the daemon shares this page's origin.
      if (!STATE.daemonOnline) throw new Error('Local release proxy unavailable');
      const fallback = await fetch(`${STATE.daemonUrl}/api/v1/sources/releases?repo=${encodeURIComponent(repo)}`, {
        signal: rvxTimeoutSignal(20000)
      });
      if (!fallback.ok) throw new Error(`Local release proxy ${fallback.status}`);
      const releases = await fallback.json();
      STATE.sourceReleases[sourceConfig.id] = Array.isArray(releases)
        ? releases.filter(release => !release.draft).sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
        : [];
      sourceConfig.releaseStatus = 'ready';
      releaseCache[sourceConfig.id] = { fetchedAt: Date.now(), releases: STATE.sourceReleases[sourceConfig.id] };
      try { RVX_STORAGE.local.setItem('rvx_source_releases_v1', JSON.stringify(releaseCache)); } catch (_) {}
      return STATE.sourceReleases[sourceConfig.id];
    } catch (_) {
      STATE.sourceReleases[sourceConfig.id] = Array.isArray(cached?.releases) ? cached.releases : [];
      sourceConfig.releaseStatus = STATE.sourceReleases[sourceConfig.id].length ? 'cached' : 'error';
    }
  }
  return STATE.sourceReleases[sourceConfig.id];
}

function sourceBundlePattern(sourceConfig) {
  return String(sourceConfig?.bundleAssetPattern || '*.mpp').toLowerCase();
}

function sourceReleaseBundleAsset(sourceConfig, release) {
  if (!release || sourceBundlePattern(sourceConfig) !== '*.mpp') return null;
  return (release.assets || []).find(asset => /\.mpp$/i.test(asset.name || '')) || null;
}

function resolveSourceBundleUrl(sourceConfig, tag = 'latest') {
  const releases = STATE.sourceReleases[sourceConfig?.id] || [];
  const candidates = tag === 'dev' || tag === 'prerelease'
    ? releases.filter(release => release.prerelease && !release.draft)
    : tag === 'latest'
      ? releases.filter(release => !release.prerelease && !release.draft)
      : releases.filter(release => release.tag_name === tag && !release.draft);
  const release = candidates.find(item => sourceReleaseBundleAsset(sourceConfig, item));
  return sourceReleaseBundleAsset(sourceConfig, release)?.browser_download_url || null;
}

function refreshSourceBundleAvailability(sourceConfig, tag = null) {
  if (!sourceConfig) return null;
  const pattern = sourceBundlePattern(sourceConfig);
  if (pattern !== '*.mpp') {
    sourceConfig.bundleStatus = 'unsupported';
    sourceConfig.bundleUrl = null;
    return null;
  }

  const releases = STATE.sourceReleases[sourceConfig.id] || [];
  const hasMppRelease = releases.some(release => sourceReleaseBundleAsset(sourceConfig, release));
  const catalogFallbackUrl = sourceConfig.registryFallbackBundleUrl
    || sourceReleaseBundleAsset(sourceConfig, sourceConfig.catalogRelease)?.browser_download_url
    || null;
  if (!hasMppRelease && sourceConfig.releaseStatus === 'error') {
    sourceConfig.bundleStatus = 'unverified';
    sourceConfig.bundleUrl = null;
    return null;
  }
  const selectedTag = tag || (sourceConfig.defaultReleaseType === 'dev' ? 'dev' : 'latest');
  const selectedBundleUrl = resolveSourceBundleUrl(sourceConfig, selectedTag);
  // Once the user selects a specific channel/tag, never silently substitute a
  // different release. Compatibility must describe the bundle that will run.
  sourceConfig.bundleUrl = tag
    ? selectedBundleUrl
    : selectedBundleUrl || resolveSourceBundleUrl(sourceConfig, 'latest') || resolveSourceBundleUrl(sourceConfig, 'dev') || catalogFallbackUrl;
  sourceConfig.bundleStatus = tag
    ? (selectedBundleUrl ? 'ready' : 'missing')
    : (sourceConfig.bundleUrl && (hasMppRelease || catalogFallbackUrl) ? 'ready' : 'missing');
  return sourceConfig.bundleUrl;
}
