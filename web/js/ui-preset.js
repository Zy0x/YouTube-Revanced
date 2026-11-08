/* ==========================================================================
   YouTube RVX — Patch Preset Manager (Revancify-Xisr Compatible Format)
   Version: 2.1.29
   Enables saving and loading patch selections + options in JSON format:
   [
     {
       "pkgName": "com.google.android.youtube",
       "patches": ["..."],
       "options": [{"title": "...", "patchName": "...", "key": "...", "value": "..."}]
     }
   ]
   ========================================================================== */

function exportCurrentPatchPreset() {
  const currentApp = STATE.currentApp;
  const pkgName = currentApp?.packageName || 'com.google.android.youtube';
  const appName = (currentApp?.name || 'YouTube').replace(/[^a-zA-Z0-9_-]/g, '');

  const patches = Array.from(STATE.selectedPatches || []);
  if (patches.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Belum ada patch yang dipilih untuk diekspor.', 'warning');
    } else {
      alert('Belum ada patch yang dipilih untuk diekspor.');
    }
    return;
  }

  // Format options as array of { title, patchName, key, value }
  const options = [];
  (STATE.patches || []).forEach(patch => {
    if (Array.isArray(patch.options)) {
      patch.options.forEach(opt => {
        if (STATE.selectedOptions && STATE.selectedOptions[opt.key] !== undefined) {
          options.push({
            title: opt.title || opt.name || opt.key,
            patchName: patch.name,
            key: opt.key,
            value: STATE.selectedOptions[opt.key]
          });
        }
      });
    }
  });

  const sourceName = STATE.currentSource || 'RVX';
  const presetData = [
    {
      pkgName: pkgName,
      patches: patches,
      options: options
    }
  ];

  const jsonStr = JSON.stringify(presetData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sourceName}-${appName}-patches.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (typeof showToast === 'function') {
    showToast(`Preset ${patches.length} patch berhasil diekspor (${sourceName}-${appName}-patches.json)`);
  }
}

function triggerImportPatchPreset() {
  let fileInput = document.getElementById('inputImportPresetFile');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'inputImportPresetFile';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.onchange = handlePresetFileSelected;
  }
  fileInput.click();
}

function handlePresetFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      applyPatchPresetData(data);
    } catch (err) {
      alert(`Gagal membaca berkas preset JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function applyPatchPresetData(presetArray) {
  if (!Array.isArray(presetArray) || presetArray.length === 0) {
    alert('Format preset tidak valid (harus array JSON standar Revancify).');
    return;
  }

  const pkgName = STATE.currentApp?.packageName || 'com.google.android.youtube';
  const entry = presetArray.find(item => item.pkgName === pkgName);

  if (!entry || !Array.isArray(entry.patches)) {
    alert('Tidak ditemukan data patch yang sesuai dalam file preset JSON ini.');
    return;
  }

  STATE.activePreset = '';
  // Apply patches
  if (!STATE.selectedPatches) STATE.selectedPatches = new Set();
  STATE.selectedPatches.clear();

  const availableNames = new Set((STATE.patches || []).map(p => p.name));
  let matched = 0;

  entry.patches.forEach(name => {
    if (availableNames.has(name)) {
      STATE.selectedPatches.add(name);
      matched++;
    }
  });

  // Apply options if present
  if (Array.isArray(entry.options)) {
    if (!STATE.selectedOptions) STATE.selectedOptions = {};
    entry.options.forEach(opt => {
      if (opt.key && opt.value !== undefined) {
        STATE.selectedOptions[opt.key] = opt.value;
      }
    });
  }

  // Re-render patch list and summaries
  if (typeof renderMorphePatchList === 'function') {
    renderMorphePatchList(STATE.activeScreen === 'wizard' ? 'wizardPatchCategoriesContainer' : 'patchCategoriesContainer');
  }
  if (typeof syncAllSummaries === 'function') {
    syncAllSummaries();
  }
  if (typeof updateWizardNavigationState === 'function') {
    updateWizardNavigationState();
  }

  if (typeof showToast === 'function') {
    showToast(`Preset berhasil dimuat: ${matched} patch aktif diterapkan!`);
  } else {
    alert(`Preset berhasil dimuat: ${matched} patch aktif diterapkan!`);
  }
}

/* ==========================================================================
   CURATED PATCH PRESETS (BALANCED, MINIMAL, POWER)
   ========================================================================== */
function applyCuratedPreset(type) {
  if (!Array.isArray(STATE.patches) || !STATE.patches.length) return;
  const selection = RVX_UI.preset(STATE.patches, type, STATE.targetMode);
  if (!selection.size) {
    const message = 'Preset ini belum tersedia untuk sumber ini. Pilih fitur secara manual.';
    setText('presetSelectionStatus', message);
    if (typeof showRvxToast === 'function') showRvxToast(message);
    return;
  }
  STATE.selectedPatches = selection;
  STATE.activePreset = type;

  ['btnPresetBalanced', 'btnPresetMinimal', 'btnPresetPower'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const match = (type === 'minimal' && id === 'btnPresetMinimal') ||
                  (type === 'power' && id === 'btnPresetPower') ||
                  (type === 'balanced' && id === 'btnPresetBalanced');
    btn.classList.toggle('active', match);
    btn.setAttribute('aria-pressed', String(match));
  });

  setText('presetSelectionStatus', `${type === 'minimal' ? 'Minimalis' : type === 'power' ? 'Lengkap' : 'Rekomendasi'} diterapkan · ${selection.size} patch aktif`);
  const containerId = STATE.activeScreen === 'wizard' ? 'wizardPatchCategoriesContainer' : 'patchCategoriesContainer';
  if (typeof renderMorphePatchList === 'function') {
    renderMorphePatchList(containerId);
  }
  if (typeof syncAllSummaries === 'function') {
    syncAllSummaries();
  }
  if (typeof updateWizardNavigationState === 'function') {
    updateWizardNavigationState();
  }
  if (typeof showToast === 'function') {
    const label = type === 'minimal' ? 'Minimalis' : type === 'power' ? 'Lengkap' : 'Rekomendasi';
    showToast(`Preset diterapkan: ${label} (${STATE.selectedPatches.size} patch)`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnPresetBalanced')?.addEventListener('click', () => applyCuratedPreset('balanced'));
  document.getElementById('btnPresetMinimal')?.addEventListener('click', () => applyCuratedPreset('minimal'));
  document.getElementById('btnPresetPower')?.addEventListener('click', () => applyCuratedPreset('power'));
});
