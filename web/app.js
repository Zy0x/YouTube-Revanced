/**
 * YouTube RVX Cloud Builder - Universal Dynamic Web App
 * Keamanan Tinggi, Universal Multi-Source Parser, Opsi Kustomisasi Dinamis
 */

const STATE = {
  sources: [],
  currentSource: 'anddea',
  currentVersion: 'recommended',
  availableVersions: [],
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
// Keamanan & Autentikasi Gatekeeper
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
    statusText.textContent = 'Terkunci';
    btnTrigger.title = 'Buka kunci dengan GitHub Token untuk memicu build';
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
      btnTrigger.title = 'Jalankan build di GitHub Runner';
      return true;
    } else {
      throw new Error('Token tidak valid atau kedaluwarsa');
    }
  } catch (err) {
    statusIcon.textContent = '⚠️';
    statusText.textContent = 'Token Salah';
    btnTrigger.disabled = true;
    return false;
  }
}

// =============================================================================
// Load Sumber & Preset
// =============================================================================
async function loadSourcesAndPresets() {
  try {
    const [sourcesRes, presetRes] = await Promise.all([
      fetch('../config/sources.json').catch(() => null),
      fetch('../config/golden-preset.json').catch(() => null)
    ]);

    if (sourcesRes && sourcesRes.ok) {
      STATE.sources = await sourcesRes.json();
      renderSourceSelector();
    } else {
      STATE.sources = [
        {
          id: 'anddea',
          name: '⭐ Anddea Patches (Default)',
          manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json',
          description: 'Patch utama dengan opsi kustomisasi terlengkap.'
        }
      ];
    }

    if (presetRes && presetRes.ok) {
      STATE.goldenPreset = await presetRes.json();
    }
  } catch (err) {
    console.warn('Gagal memuat preset lokal, menggunakan konfigurasi standar:', err);
  }
}

function renderSourceSelector() {
  const select = document.getElementById('selectSource');
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
// Universal Parser: Mengekstrak Versi YouTube dari Format Apa Pun
// =============================================================================
function extractUniversalVersions(patches, pkgName = 'com.google.android.youtube') {
  const versions = new Set();

  patches.forEach(p => {
    const compat = p.compatiblePackages;
    if (!compat) return;

    // Format 1: Anddea / Morphe (Object: { "com.google.android.youtube": ["21.13.164", ...] })
    if (typeof compat === 'object' && !Array.isArray(compat)) {
      if (Array.isArray(compat[pkgName])) {
        compat[pkgName].forEach(v => versions.add(String(v).trim()));
      }
    }
    // Format 2: ReVanced / Inotia00 (Array of objects: [ { name: "...", versions: [...] } ])
    else if (Array.isArray(compat)) {
      compat.forEach(entry => {
        if (entry && entry.name === pkgName && Array.isArray(entry.versions)) {
          entry.versions.forEach(v => versions.add(String(v).trim()));
        }
      });
    }
  });

  return Array.from(versions).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }).reverse();
}

// =============================================================================
// Fetch Manifest & Render Patches Secara Dinamis
// =============================================================================
async function fetchAndRenderPatches(sourceId) {
  const versionContainer = document.getElementById('versionListContainer');
  const versionBadge = document.getElementById('versionLoadingBadge');
  const patchContainer = document.getElementById('patchCategoriesContainer');

  versionBadge.textContent = 'Memuat versi...';
  versionBadge.className = 'badge badge-info';
  versionContainer.innerHTML = '<p class="form-hint">Menganalisis manifest patch...</p>';
  patchContainer.innerHTML = '<div class="spinner"></div>';

  const sourceConfig = STATE.sources.find(s => s.id === sourceId) || {
    manifestUrl: 'https://raw.githubusercontent.com/anddea/revanced-patches/refs/heads/main/patches-list.json'
  };

  try {
    const res = await fetch(sourceConfig.manifestUrl);
    if (!res.ok) throw new Error('Gagal mengambil manifest patch');

    const data = await res.json();
    const rawPatches = data.patches || [];
    STATE.patches = rawPatches;

    // 1. Ekstraksi Universal Versi
    const sortedVersions = extractUniversalVersions(rawPatches);
    STATE.availableVersions = sortedVersions;

    const recommendedVersion = sortedVersions[0] || '21.13.164';
    versionBadge.textContent = `${sortedVersions.length} Versi Kompatibel`;

    // 2. Render Pilihan Versi
    renderVersionSelector(sortedVersions, recommendedVersion);

    // 3. Render Patch & Opsi Kustomisasi
    renderPatchCategories(rawPatches);

    // Terapkan Golden Preset secara default
    applyGoldenPreset();

  } catch (err) {
    console.error('Error memuat patch:', err);
    versionBadge.textContent = 'Gagal';
    versionBadge.className = 'badge badge-gold';
    versionContainer.innerHTML = '<p class="form-hint text-danger">Gagal menghubungi sumber patch.</p>';
    patchContainer.innerHTML = '<p class="form-hint">Silakan periksa koneksi internet.</p>';
  }
}

// =============================================================================
// Render Selector Versi YouTube
// =============================================================================
function renderVersionSelector(versions, recommended) {
  const container = document.getElementById('versionListContainer');
  container.innerHTML = '';

  if (versions.length === 0) {
    versions = ['21.13.164', '20.51.39'];
    recommended = '21.13.164';
  }

  versions.forEach((ver) => {
    const isRecommended = ver === recommended;
    const card = document.createElement('label');
    card.className = `version-card ${isRecommended ? 'selected' : ''}`;

    card.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 1rem;">v${ver}</div>
        <div class="form-hint" style="margin: 0;">${isRecommended ? '⭐ Versi Rekomendasi Resmi' : 'Versi Kompatibel'}</div>
      </div>
      <input type="radio" name="youtube_version" value="${ver}" ${isRecommended ? 'checked' : ''}>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.version-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.currentVersion = ver;
    });

    container.appendChild(card);
  });

  STATE.currentVersion = recommended;
}

// =============================================================================
// Kelompokkan & Render Patch + Input Opsi Kustomisasi
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
    'Pemutar Video & Gestur': {
      icon: '▶️',
      keywords: ['player', 'playback', 'swipe', 'audio', 'stream', 'speed', 'controls']
    },
    'Tampilan & Tema': {
      icon: '🎨',
      keywords: ['theme', 'branding', 'overlay', 'icon', 'color', 'dpi', 'buttons']
    },
    'Shorts & Navigasi': {
      icon: '⚡',
      keywords: ['shorts', 'navigation', 'bar', 'feed', 'header']
    },
    'Anti-Buffering & Spoofing': {
      icon: '🔧',
      keywords: ['spoof', 'potoken', 'quic', 'version', 'wifi', 'certificate']
    },
    'Fitur Lainnya': {
      icon: '🧩',
      keywords: []
    }
  };

  const grouped = {};
  Object.keys(categories).forEach(k => grouped[k] = []);

  patches.forEach(patch => {
    const nameLower = patch.name.toLowerCase();
    let assigned = false;

    for (const [catName, catData] of Object.entries(categories)) {
      if (catData.keywords.some(kw => nameLower.includes(kw))) {
        grouped[catName].push(patch);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      grouped['Fitur Lainnya'].push(patch);
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
              <div class="patch-desc">${escapeHtml(patch.description || 'Tidak ada deskripsi')}</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-name="${escapeHtml(patch.name)}" ${isDefault ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
          ${optionsHtml}
        </div>
      `;

      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          STATE.selectedPatches.add(patch.name);
        } else {
          STATE.selectedPatches.delete(patch.name);
        }
        updatePatchCount();
      });

      // Bind listener opsi
      item.querySelectorAll('.patch-option-input').forEach(input => {
        input.addEventListener('change', (e) => {
          STATE.selectedOptions[e.target.dataset.optKey] = e.target.value;
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
    const def = opt.default || '';

    html += `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.85rem;">
      <span style="color: var(--text-secondary);">${escapeHtml(title)}:</span>`;

    if (opt.values && typeof opt.values === 'object') {
      html += `<select class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" style="width: auto; min-height: 36px; padding: 4px 8px;">`;
      Object.entries(opt.values).forEach(([label, val]) => {
        html += `<option value="${escapeHtml(val)}" ${val === def ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      });
      html += `</select>`;
    } else if (def.startsWith('#') || key.toLowerCase().includes('color')) {
      html += `<input type="text" class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(def)}" style="width: 120px; min-height: 36px; padding: 4px 8px; font-family: monospace;">`;
    } else {
      html += `<input type="text" class="form-control form-control-sm patch-option-input" data-opt-key="${escapeHtml(key)}" value="${escapeHtml(def)}" placeholder="${escapeHtml(def)}" style="width: 180px; min-height: 36px; padding: 4px 8px;">`;
    }

    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// =============================================================================
// Preset Management (Golden Preset)
// =============================================================================
function applyGoldenPreset() {
  const excluded = [
    'Disable edge-to-edge display',
    'Override certificate pinning',
    'Spoof Wi-Fi connection'
  ];

  document.querySelectorAll('.patch-item input[type="checkbox"]').forEach(cb => {
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
    'settingsMenuIcon': 'extension'
  };

  document.querySelectorAll('.patch-option-input').forEach(input => {
    const k = input.dataset.optKey;
    if (STATE.selectedOptions[k]) {
      input.value = STATE.selectedOptions[k];
    }
  });

  updatePatchCount();
}

function updatePatchCount() {
  const el = document.getElementById('activePatchCount');
  if (el) el.textContent = STATE.selectedPatches.size;
}

// =============================================================================
// Trigger Cloud Build dengan Payload Konfigurasi Lengkap
// =============================================================================
async function triggerCloudBuild() {
  if (!STATE.authToken) {
    openAuthModal();
    return;
  }

  const mode = document.getElementById('selectBuildMode').value;
  const progressModal = document.getElementById('buildProgressModal');
  const statusMsg = document.getElementById('buildStatusMsg');
  const linksBox = document.getElementById('buildActionLinks');
  const runLink = document.getElementById('linkActionsRun');

  progressModal.classList.remove('hidden');
  linksBox.classList.add('hidden');
  statusMsg.textContent = `Menghubungkan ke GitHub Actions runner (${mode.toUpperCase()} mode)...`;

  // Kumpulkan list excluded patches secara presisi
  const allPatchNames = STATE.patches.map(p => p.name);
  const excludedPatches = allPatchNames.filter(name => !STATE.selectedPatches.has(name));
  const includedPatches = Array.from(STATE.selectedPatches);

  try {
    const payload = {
      event_type: 'build-rvx',
      client_payload: {
        youtube_version: STATE.currentVersion,
        patch_source: STATE.currentSource,
        patch_tag: 'dev',
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
      statusMsg.textContent = `✅ Sinyal Build Berhasil Dikirim! Runner sedang mem-patch YouTube v${STATE.currentVersion} dengan ${includedPatches.length} patch dan kustomisasi dinamis Anda.`;
      linksBox.classList.remove('hidden');
      runLink.href = 'https://github.com/Zy0x/YouTube-Revanced/actions';
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Kode respons: ${res.status}`);
    }
  } catch (err) {
    statusMsg.textContent = `❌ Gagal memicu build: ${err.message}. Pastikan token Anda memiliki izin 'repo' atau 'actions:write'.`;
  }
}

// =============================================================================
// Event Listeners & Modals
// =============================================================================
function initEventListeners() {
  document.getElementById('selectSource').addEventListener('change', (e) => {
    STATE.currentSource = e.target.value;
    const s = STATE.sources.find(src => src.id === e.target.value);
    document.getElementById('sourceDesc').textContent = s?.description || '';
    fetchAndRenderPatches(e.target.value);
  });

  document.getElementById('btnLoadGoldenPreset').addEventListener('click', applyGoldenPreset);
  document.getElementById('btnResetPatches').addEventListener('click', () => {
    document.querySelectorAll('.patch-item input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      STATE.selectedPatches.add(cb.dataset.name);
    });
    updatePatchCount();
  });

  document.getElementById('inputSearchPatch').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.patch-item').forEach(item => {
      const name = item.dataset.patchName.toLowerCase();
      item.style.display = name.includes(query) ? 'flex' : 'none';
    });
  });

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
      alertBox.textContent = 'Token tidak boleh kosong!';
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
      alertBox.textContent = 'Token ditolak oleh GitHub API. Periksa kembali token Anda.';
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
