/* Shared decisions for presets, diagnostics and build ownership. No DOM access. */
const RVX_UI = (() => {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isGms = name => /\b(gmscore|microg)\b/.test(normalize(name));
  const excluded = name => /\b(debug|test|certificate pinning|spoof wi fi|change version code)\b/.test(normalize(name));

  function preset(patches, type, mode) {
    const defaults = patches.filter(p => p.use === true || p.enabledByDefault === true || p.default === true);
    const essentials = /\b(hide ads|remove ads|video ads|general ads|ad block|background playback|background play|spoof video streams|spoof client|settings for|settings integration|gmscore|microg)\b/;
    const balanced = /\b(sponsorblock|return youtube dislike|sanitize sharing links|video playback)\b/;
    let selected;
    if (type === 'minimal') {
      selected = patches.filter(p => essentials.test(normalize(p.name)));
    } else if (type === 'power') {
      selected = patches.filter(p => !excluded(p.name));
    } else {
      selected = defaults.length
        ? defaults.filter(p => !excluded(p.name))
        : patches.filter(p => essentials.test(normalize(p.name)) || balanced.test(normalize(p.name)));
    }
    const names = new Set(selected.map(p => p.name));
    patches.filter(p => isGms(p.name)).forEach(p => {
      if (mode === 'non-root') names.add(p.name);
      else names.delete(p.name);
    });
    if (mode === 'root') patches.filter(p => normalize(p.name) === 'spoof signature').forEach(p => names.delete(p.name));
    return names;
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }

  function buildKey(state) {
    return JSON.stringify(canonical({
      app: state.currentApp?.packageName,
      source: state.currentSource,
      tag: state.patchTag,
      version: state.currentVersion,
      mode: state.targetMode,
      patches: [...state.selectedPatches].sort(),
      options: state.selectedOptions,
      engine: state.morpheEngineOptions,
      storage: state.wizardStorageDraft ? ['workspace', 'output'].map(kind => {
        const folder = state.wizardStorageDraft[kind];
        return folder ? [folder.type, folder.path || folder.label, folder.uri || ''] : null;
      }) : null,
      apk: state.selectedApkFile ? [state.selectedApkFile.name, state.selectedApkFile.size, state.selectedApkFile.lastModified] : null
    }));
  }

  function ownsResult(session, key) {
    return Boolean(session?.status === 'succeeded' && session.key === key && (session.path || session.blob));
  }

  function diagnostics(data, { mode, nativeRoot = null, nativeMicrog = null } = {}) {
    const item = (text, state = 'unknown') => ({ text, state });
    const root = typeof data?.root_available === 'boolean' ? data.root_available : nativeRoot;
    const microg = typeof data?.microg_installed === 'boolean' ? data.microg_installed : nativeMicrog;
    const needsMicrog = mode === 'non-root';
    const bytes = data?.storage_available_bytes;
    const rows = {
      jre: data?.jre_ready === true ? item('Terverifikasi', 'ready') : data?.jre_ready === false ? item(data.jre_present ? 'Perlu diperiksa' : 'Perlu diunduh', 'attention') : item('Belum terverifikasi'),
      engine: data?.cli_ready === true ? item('Terverifikasi', 'ready') : data?.cli_ready === false ? item(data.cli_present ? 'Perlu diperiksa' : 'Perlu diunduh', 'attention') : item('Belum terverifikasi'),
      root: root === true ? item('Root terverifikasi', 'ready') : root === false ? item('Tanpa akses root', mode === 'root' ? 'attention' : 'neutral') : item('Belum terverifikasi'),
      storage: typeof bytes === 'number' && bytes > 0
        ? item(data.storage_available_formatted ? `${data.storage_available_formatted} tersedia` : `${(bytes / 1024 ** 3).toFixed(1)} GB tersedia`, bytes >= 1024 ** 3 ? 'ready' : 'attention')
        : item('Belum terverifikasi'),
      microg: !needsMicrog ? item('Tidak diperlukan', 'neutral') : microg === true ? item('Terpasang', 'ready') : microg === false ? item('Belum terpasang', 'attention') : item('Belum terverifikasi')
    };
    const required = [rows.jre, rows.engine, rows.storage, ...(mode === 'root' ? [rows.root] : []), ...(needsMicrog ? [rows.microg] : [])];
    const attention = required.filter(row => row.state === 'attention').length;
    const unknown = required.some(row => row.state === 'unknown');
    return { rows, state: attention ? 'attention' : unknown ? 'unknown' : 'ready', label: attention ? `${attention} hal perlu diperiksa` : unknown ? 'Belum terverifikasi' : 'Siap untuk patch' };
  }

  function patchGroup(name) {
    const n = normalize(name);
    if (/\b(ads|sponsorblock|dislike|sharing links)\b/.test(n)) return 'Iklan & privasi';
    if (/\b(playback|player|video streams|audio|seek|volume|swipe|fullscreen|miniplayer|potoken)\b/.test(n)) return 'Pemutaran';
    if (/\b(shorts|feed|comments|navigation|toolbar|layout|theme|branding|icon|ambient|thumbnail|start page)\b/.test(n)) return 'Tampilan';
    return 'Lainnya';
  }

  function canStartDownload(plan, { acceptedUnknown = false, editingStorage = false, browser = false, hasApk = false } = {}) {
    return Boolean(plan) && Array.isArray(plan.items) && plan.items.length > 0
      && plan.ready !== false && plan.enoughStorage !== false
      && !editingStorage && (!browser || hasApk)
      && (!(Number(plan.unknownSizeCount) > 0) || acceptedUnknown);
  }

  function failureDiagnosis(error) {
    let value = typeof error === 'object' && error ? error : { message: String(error || '') };
    const marker = String(value.message || '').indexOf('DEPENDENCY_ERROR|');
    if (marker >= 0) { try { value = JSON.parse(value.message.slice(marker + 17)); } catch (_) {} }
    const message = String(value.message || 'Proses berakhir tanpa keterangan yang cukup.');
    const text = message.toLowerCase();
    let dependency = value.dependency || '';
    if (!dependency && /stock apk|apk asli|apk.*(tidak ditemukan|belum.*siap)/.test(text)) dependency = 'apk';
    if (!dependency && /java.*(not found|tidak|gagal|permission|versi)|unsupportedclassversionerror/.test(text)) dependency = 'java';
    if (!dependency && /storage|penyimpanan|no space left|tidak dapat ditulis/.test(text)) dependency = 'storage';
    const names = { apk: 'APK asli', java: 'Java Runtime', cli: 'Mesin Morphe', bundle: 'Bundle patch', storage: 'Penyimpanan' };
    const compatibility = !dependency && /fingerprint.*(not found|failed)|patch.*(incompatible|not compatible)|unsupported.*(app version|apk version)/.test(text);
    return { message, dependency, code: value.code || (dependency ? `${dependency}_unavailable` : compatibility ? 'patch_incompatible' : 'build_failed'),
      category: dependency ? 'dependency' : compatibility ? 'compatibility' : 'unknown',
      title: dependency ? `${names[dependency] || 'Resource'} belum siap` : 'Proses belum selesai',
      explanation: dependency ? 'Persiapan resource belum berhasil. Periksa penyebab di bawah sebelum melanjutkan ke patch.' : compatibility ? 'Patch melaporkan ketidakcocokan dengan APK yang dipilih.' : 'Penyebab perlu diperiksa dari pesan dan log proses.' };
  }

  return Object.freeze({ preset, buildKey, ownsResult, diagnostics, patchGroup, isGms, canStartDownload, failureDiagnosis });
})();
