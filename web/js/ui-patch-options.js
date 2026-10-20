function cloneOptionValue(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function normalizePatchOptionType(option) {
  return String(option?.type || '')
    .replace(/^kotlin\./i, '')
    .replace(/\?$/, '')
    .toLowerCase();
}

function getPatchOptionChoices(option) {
  const raw = option?.values ?? option?.possibleValues;
  if (Array.isArray(raw)) return raw.map(value => ({ label: String(value), value }));
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([label, value]) => ({ label, value }));
  }
  return [];
}

function getOptionChoicePreview(patch, option, value) {
  const key = optionPreviewCacheKey(patch);
  const entries = Array.isArray(STATE.optionPreviewCache[key]) ? STATE.optionPreviewCache[key] : [];
  const normalized = String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const match = entries.find(entry => entry.optionKey === option.key
    && String(entry.value || '').replace(/[^a-z0-9]/gi, '').toLowerCase() === normalized
    && entry.status === 'verified' && entry.url && entry.assetPath);
  if (!match) return null;
  return {
    kind: match.mediaType === 'android-vector' ? 'android-vector' : 'image',
    url: match.url,
    path: match.assetPath,
    commit: match.sourceCommit
  };
}

function optionPreviewCacheKey(patch) {
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  return [source?.repository || STATE.currentSource, getSelectedPatchRef(), STATE.currentApp?.packageName, patch?.name].join('|');
}

function getSelectedPatchRef() {
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  const releases = STATE.sourceReleases[source?.id] || STATE.patchReleases || [];
  const release = STATE.patchTag === 'latest'
    ? releases.find(item => !item.prerelease && !item.draft)
    : STATE.patchTag === 'dev' || STATE.patchTag === 'prerelease'
      ? releases.find(item => item.prerelease && !item.draft)
      : releases.find(item => (item.tag_name || item.name) === STATE.patchTag);
  return release?.tag_name || release?.name || STATE.patchTag || 'main';
}

async function ensureVerifiedOptionPreviews(patch) {
  const key = optionPreviewCacheKey(patch);
  if (Array.isArray(STATE.optionPreviewCache[key])) return STATE.optionPreviewCache[key];
  if (STATE.optionPreviewCache[key] instanceof Promise) return STATE.optionPreviewCache[key];
  const source = STATE.sources.find(item => item.id === STATE.currentSource);
  const request = (async () => {
    try {
      const params = new URLSearchParams({
        source: source?.repository || STATE.currentSource || '',
        tag: getSelectedPatchRef(),
        package: STATE.currentApp?.packageName || '',
        patch: patch?.name || '',
        refresh: STATE.forceOptionPreviewRefresh ? 'true' : 'false'
      });
      const response = await fetch(`${STATE.daemonUrl}/api/v1/sources/option-previews?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data.choices) ? data.choices : [];
    } catch (_) {
      return [];
    }
  })();
  STATE.optionPreviewCache[key] = request;
  const result = await request;
  STATE.optionPreviewCache[key] = result;
  return result;
}

function androidVectorToSvg(xmlText) {
  const documentXml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (documentXml.querySelector('parsererror')) return '';
  const vector = documentXml.documentElement;
  if (vector.localName !== 'vector') return '';
  const androidNs = 'http://schemas.android.com/apk/res/android';
  const attr = (element, name) => element.getAttributeNS(androidNs, name) || element.getAttribute(`android:${name}`) || '';
  const viewportWidth = Number.parseFloat(attr(vector, 'viewportWidth')) || 24;
  const viewportHeight = Number.parseFloat(attr(vector, 'viewportHeight')) || 24;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
  svg.setAttribute('aria-hidden', 'true');

  const appendChildren = (source, target) => {
    Array.from(source.children).forEach(child => {
      if (child.localName === 'group') {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const pivotX = Number.parseFloat(attr(child, 'pivotX')) || 0;
        const pivotY = Number.parseFloat(attr(child, 'pivotY')) || 0;
        const scaleX = Number.parseFloat(attr(child, 'scaleX')) || 1;
        const scaleY = Number.parseFloat(attr(child, 'scaleY')) || 1;
        const rotation = Number.parseFloat(attr(child, 'rotation')) || 0;
        const translateX = Number.parseFloat(attr(child, 'translateX')) || 0;
        const translateY = Number.parseFloat(attr(child, 'translateY')) || 0;
        group.setAttribute('transform', `translate(${translateX + pivotX} ${translateY + pivotY}) rotate(${rotation}) scale(${scaleX} ${scaleY}) translate(${-pivotX} ${-pivotY})`);
        appendChildren(child, group);
        target.appendChild(group);
      } else if (child.localName === 'path') {
        const pathData = attr(child, 'pathData');
        if (!pathData) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        const fill = attr(child, 'fillColor');
        path.setAttribute('fill', fill.startsWith('#') ? fill : fill === '@android:color/transparent' ? 'transparent' : 'currentColor');
        const fillAlpha = attr(child, 'fillAlpha');
        if (fillAlpha) path.setAttribute('fill-opacity', fillAlpha);
        const stroke = attr(child, 'strokeColor');
        if (stroke) path.setAttribute('stroke', stroke.startsWith('#') ? stroke : 'currentColor');
        const strokeWidth = attr(child, 'strokeWidth');
        if (strokeWidth) path.setAttribute('stroke-width', strokeWidth);
        if (attr(child, 'fillType') === 'evenOdd') path.setAttribute('fill-rule', 'evenodd');
        target.appendChild(path);
      }
    });
  };
  appendChildren(vector, svg);
  return svg.outerHTML;
}

async function hydrateOptionChoicePreviews() {
  const previews = Array.from(document.querySelectorAll('#modalPatchOptsBody .option-choice-preview[data-preview-url]'));
  await Promise.allSettled(previews.map(async preview => {
    const url = preview.dataset.previewUrl;
    if (!url) return;
    try {
      if (preview.dataset.previewKind === 'android-vector') {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Preview unavailable');
        const svg = androidVectorToSvg(await response.text());
        if (!svg) throw new Error('Unsupported vector');
        preview.innerHTML = svg;
      } else {
        const image = new Image();
        image.alt = '';
        image.decoding = 'async';
        await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Preview timeout')), 8000);
          image.onload = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error('Preview unavailable'));
          };
          image.src = url;
        });
        preview.replaceChildren(image);
      }
      preview.classList.add('is-ready');
    } catch (_) {
      preview.classList.add('is-unavailable');
    }
  }));
}

function optionValuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function patchHasCustomizedOptions(patch) {
  return Array.isArray(patch?.options) && patch.options.some(option =>
    Object.prototype.hasOwnProperty.call(STATE.selectedOptions, option.key)
    && !optionValuesEqual(STATE.selectedOptions[option.key], option.default)
  );
}

function detectPatchOptionControl(option) {
  const type = normalizePatchOptionType(option);
  const key = String(option?.key || '').toLowerCase();
  const title = String(option?.title || '').toLowerCase();
  const description = String(option?.description || '').toLowerCase();
  const semanticText = `${key} ${title} ${description}`;
  const choices = getPatchOptionChoices(option);
  if (type === 'boolean' || typeof option?.default === 'boolean') return 'boolean';
  if (/list|array|set|collection/.test(type)) return 'list';
  if (/int|long|short|byte/.test(type)) return 'integer';
  if (/float|double|number|decimal/.test(type)) return 'decimal';
  if (key === 'customicon' || (choices.length === 0 && /folder|directory/.test(`${type} ${semanticText}`))) return 'folder';
  if (choices.length === 0 && /(image|icon|logo|splash)/.test(semanticText) && /(file|path|\.png|\.webp|\.jpg|\.jpeg|\.svg)/.test(semanticText)) return 'image';
  if (choices.length === 0 && (/file|path/.test(type) || /path to .*file|\.xml|\.png|\.webp|\.json|\.zip/.test(semanticText))) return 'file';
  if (/color|colour/.test(semanticText) || /^#[0-9a-f]{6,8}$/i.test(String(option?.default || ''))) return 'color';
  if (choices.length > 0) return 'choice';
  if (/map|object|json/.test(type) || (option?.default && typeof option.default === 'object' && !Array.isArray(option.default))) return 'json';
  if (/password|secret|token|api.?key/.test(semanticText)) return 'password';
  if (/url|uri|endpoint|host/.test(`${type} ${semanticText}`)) return 'url';
  if (/separated by commas|comma-separated|one per line/.test(description) || String(option?.default || '').length > 140) return 'multiline';
  return 'text';
}

function patchOptionTypeLabel(control) {
  return ({ boolean: 'Sakelar', choice: 'Pilihan', list: 'Daftar', integer: 'Angka bulat', decimal: 'Angka', folder: 'Folder', image: 'Gambar', file: 'Berkas', color: 'Warna', json: 'Data terstruktur', password: 'Rahasia', url: 'Alamat', multiline: 'Daftar teks', text: 'Teks' })[control] || 'Nilai';
}

function optionValueForInput(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function renderPatchOptionControl(patch, option, currentValue, control) {
  const key = escapeHtml(option.key);
  if (control === 'boolean') {
    const checked = currentValue === true || currentValue === 'true';
    return `<button type="button" class="option-smart-switch modal-opt-input" role="switch" aria-checked="${checked}" data-opt-key="${key}" data-opt-control="boolean">
      <span class="option-switch-track"><span></span></span><span class="option-switch-label">${checked ? 'Aktif' : 'Nonaktif'}</span>
    </button>`;
  }
  if (control === 'choice') {
    const choices = getPatchOptionChoices(option);
    const previewChoices = choices.map(item => ({ ...item, preview: getOptionChoicePreview(patch, option, item.value) }));
    const hasVisualPreviews = previewChoices.some(item => item.preview) && previewChoices.length <= 12;
    if (hasVisualPreviews) {
      const verifiedPreview = previewChoices.find(item => item.preview)?.preview;
      const repository = STATE.sources.find(item => item.id === STATE.currentSource)?.repository || STATE.currentSource;
      const provenance = `${repository}@${String(verifiedPreview?.commit || getSelectedPatchRef()).slice(0, 8)} · ${verifiedPreview?.path || ''}`;
      return `<div class="option-visual-choice-grid" role="radiogroup" aria-label="${escapeHtml(option.title || option.key)}">
        ${previewChoices.map(item => {
          const active = String(item.value) === String(currentValue ?? '');
          return `<button type="button" class="option-visual-choice ${active ? 'active' : ''}" role="radio" aria-checked="${active}" data-opt-key="${key}" data-choice-value="${escapeHtml(String(item.value))}">
            <span class="option-choice-preview ${item.preview ? '' : 'is-unavailable'}" ${item.preview ? `data-preview-kind="${item.preview.kind}" data-preview-url="${escapeHtml(item.preview.url)}" title="${escapeHtml(item.preview.path)}"` : ''}>${item.preview ? '' : '<small>Tanpa preview source</small>'}</span>
            <span>${escapeHtml(item.label)}</span>
          </button>`;
        }).join('')}
        <small class="option-preview-source-note" title="${escapeHtml(provenance)}">Aset source terverifikasi · ${escapeHtml(provenance)}</small>
      </div>`;
    }
    const hasCurrentChoice = choices.some(item => String(item.value) === String(currentValue ?? ''));
    return `<select class="morphe-select modal-opt-input option-smart-select" data-opt-key="${key}" data-opt-control="choice">
      ${!hasCurrentChoice ? '<option value="__rvx_null__" selected>Belum dipilih</option>' : ''}
      ${choices.map(item => `<option value="${escapeHtml(String(item.value))}" ${String(item.value) === String(currentValue ?? '') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
    </select>`;
  }
  if (control === 'color') {
    const raw = optionValueForInput(currentValue);
    const hex = /^#[0-9a-f]{8}$/i.test(raw) ? `#${raw.slice(3)}` : /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#000000';
    const choices = getPatchOptionChoices(option);
    return `<div class="option-color-control">
      ${choices.length ? `<select class="morphe-select option-color-preset" aria-label="Pilihan warna dari sumber patch">
        <option value="">Kustom / referensi resource</option>
        ${choices.map(item => `<option value="${escapeHtml(String(item.value))}" ${String(item.value) === raw ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
      </select>` : ''}
      <div class="option-color-value-row">
        <input type="color" class="option-color-picker" value="${escapeHtml(hex)}" aria-label="Pilih warna">
        <input type="text" class="morphe-input modal-opt-input" data-opt-key="${key}" data-opt-control="color" value="${escapeHtml(raw)}" placeholder="#AARRGGBB atau @color/nama">
        <span class="option-color-preview" style="--option-color:${escapeHtml(hex)}"></span>
      </div>
    </div>`;
  }
  if (control === 'file' || control === 'folder' || control === 'image') {
    const isFolder = control === 'folder';
    const isImage = control === 'image';
    const accept = isFolder ? '.png,.webp,.xml,.json,.zip' : isImage ? 'image/png,image/webp,image/jpeg,image/svg+xml' : option.key.toLowerCase().includes('translation') ? '.xml,text/xml,application/xml' : '*/*';
    return `<div class="option-upload-control" data-upload-key="${key}" data-upload-mode="${control}">
      <input type="text" class="morphe-input modal-opt-input option-upload-path" data-opt-key="${key}" data-opt-control="${control}" value="${escapeHtml(optionValueForInput(currentValue))}" placeholder="Pilih ${isFolder ? 'folder aset' : isImage ? 'gambar' : 'berkas'} atau masukkan path lokal">
      <label class="option-upload-button">
        <input type="file" class="option-file-input" accept="${accept}" ${isFolder ? 'multiple webkitdirectory directory' : ''}>
        <span>${isFolder ? 'Pilih folder' : isImage ? 'Pilih gambar' : 'Pilih berkas'}</span>
      </label>
      <small class="option-upload-summary">Belum ada aset baru dipilih</small>
    </div>`;
  }
  if (control === 'list' || control === 'multiline' || control === 'json') {
    const placeholder = control === 'json' ? '{ "nilai": true }' : 'Pisahkan nilai dengan koma atau baris baru';
    return `<textarea class="morphe-input modal-opt-input option-smart-textarea" data-opt-key="${key}" data-opt-control="${control}" rows="3" placeholder="${placeholder}">${escapeHtml(optionValueForInput(currentValue))}</textarea>`;
  }
  const inputType = control === 'integer' || control === 'decimal' ? 'number' : control === 'url' ? 'url' : control === 'password' ? 'password' : 'text';
  const step = control === 'integer' ? '1' : control === 'decimal' ? 'any' : '';
  return `<input type="${inputType}" class="morphe-input modal-opt-input" data-opt-key="${key}" data-opt-control="${control}" value="${escapeHtml(optionValueForInput(currentValue))}" ${step ? `step="${step}"` : ''}>`;
}

function renderPatchOptionsForm(patch) {
  const modal = document.getElementById('patchOptionsModal');
  const titleEl = document.getElementById('modalPatchOptsTitle');
  const descEl = document.getElementById('modalPatchOptsDesc');
  const metaEl = document.getElementById('modalPatchOptsMeta');
  const bodyEl = document.getElementById('modalPatchOptsBody');
  if (!modal || !bodyEl) return;
  if (titleEl) titleEl.textContent = patch.name;
  if (descEl) descEl.textContent = patch.description || '';
  bodyEl.innerHTML = '';

  const options = Array.isArray(patch.options) ? patch.options : [];
  const requiredCount = options.filter(option => option.required).length;
  if (metaEl) metaEl.textContent = `${options.length} konfigurasi${requiredCount ? ` · ${requiredCount} wajib` : ''}`;
  options.forEach(opt => {
    const key = opt.key;
    const title = opt.title || key;
    const currentVal = STATE.patchOptionsDraft[key];
    const control = detectPatchOptionControl(opt);

    const optCard = document.createElement('div');
    optCard.className = 'morphe-opt-card';
    optCard.dataset.optionKey = key;

    optCard.innerHTML = `
      <div class="morphe-opt-header">
        <span class="morphe-opt-title">${escapeHtml(title)}${opt.required ? '<em>Wajib</em>' : ''}</span>
        <span class="morphe-opt-kind">${patchOptionTypeLabel(control)}</span>
      </div>
      ${opt.description ? `<p class="morphe-muted-hint">${escapeHtml(opt.description)}</p>` : ''}
      ${renderPatchOptionControl(patch, opt, currentVal, control)}
      <p class="option-validation-message hidden" role="alert"></p>
    `;

    bodyEl.appendChild(optCard);
  });

  bindPatchOptionControls(patch);
  updatePatchOptionConditionalFields();
  validatePatchOptionsDraft(patch);
  hydrateOptionChoicePreviews();
}

async function openPatchOptionsModal(patch) {
  const modal = document.getElementById('patchOptionsModal');
  if (!modal) return;
  STATE.editingPatchName = patch.name;
  STATE.patchOptionsReturnFocusId = document.activeElement?.id || '';
  STATE.patchOptionFiles = {};
  STATE.patchOptionsDraft = {};
  (patch.options || []).forEach(option => {
    STATE.patchOptionsDraft[option.key] = cloneOptionValue(
      Object.prototype.hasOwnProperty.call(STATE.selectedOptions, option.key)
        ? STATE.selectedOptions[option.key]
        : option.default
    );
  });
  const body = document.getElementById('modalPatchOptsBody');
  const title = document.getElementById('modalPatchOptsTitle');
  const desc = document.getElementById('modalPatchOptsDesc');
  if (title) title.textContent = patch.name;
  if (desc) desc.textContent = patch.description || '';
  if (body) body.innerHTML = '<div class="option-preview-loading">Memeriksa aset pada source dan tag terpilih…</div>';
  const status = document.getElementById('patchOptionsSaveStatus');
  if (status) status.textContent = '';

  modal.classList.remove('hidden');
  await ensureVerifiedOptionPreviews(patch);
  if (STATE.editingPatchName !== patch.name || modal.classList.contains('hidden')) return;
  renderPatchOptionsForm(patch);
  requestAnimationFrame(() => modal.querySelector('.modal-opt-input, .option-smart-switch')?.focus({ preventScroll: true }));
}

function readPatchOptionInput(input, patch) {
  const control = input.dataset.optControl || 'text';
  const option = (patch?.options || []).find(item => item.key === input.dataset.optKey);
  if (control === 'boolean') return input.getAttribute('aria-checked') === 'true';
  if (control === 'integer') return input.value === '' ? null : Number.parseInt(input.value, 10);
  if (control === 'decimal') return input.value === '' ? null : Number.parseFloat(input.value);
  if (control === 'list') return input.value.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
  if (control === 'json') {
    if (!input.value.trim()) return null;
    try { return JSON.parse(input.value); } catch (_) { return input.value; }
  }
  if (control === 'choice') {
    if (input.value === '__rvx_null__') return null;
    const match = getPatchOptionChoices(option).find(item => String(item.value) === input.value);
    return match ? cloneOptionValue(match.value) : input.value;
  }
  if (input.value === '' && (option?.default === null || String(option?.type || '').endsWith('?'))) return null;
  return input.value;
}

function bindPatchOptionControls(patch) {
  const body = document.getElementById('modalPatchOptsBody');
  if (!body) return;
  body.querySelectorAll('.option-smart-switch').forEach(button => {
    button.addEventListener('click', () => {
      const checked = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(checked));
      button.querySelector('.option-switch-label').textContent = checked ? 'Aktif' : 'Nonaktif';
      STATE.patchOptionsDraft[button.dataset.optKey] = checked;
      validatePatchOptionsDraft(patch);
    });
  });
  body.querySelectorAll('.option-visual-choice').forEach(button => {
    button.addEventListener('click', () => {
      const option = (patch.options || []).find(item => item.key === button.dataset.optKey);
      const match = getPatchOptionChoices(option).find(item => String(item.value) === button.dataset.choiceValue);
      STATE.patchOptionsDraft[button.dataset.optKey] = cloneOptionValue(match ? match.value : button.dataset.choiceValue);
      button.closest('.option-visual-choice-grid')?.querySelectorAll('.option-visual-choice').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', String(active));
      });
      updatePatchOptionConditionalFields();
      validatePatchOptionsDraft(patch);
    });
  });
  body.querySelectorAll('.modal-opt-input:not(.option-smart-switch)').forEach(input => {
    const update = () => {
      STATE.patchOptionsDraft[input.dataset.optKey] = readPatchOptionInput(input, patch);
      updatePatchOptionConditionalFields();
      validatePatchOptionsDraft(patch);
    };
    input.addEventListener('input', update);
    input.addEventListener('change', update);
  });
  body.querySelectorAll('.option-color-control').forEach(group => {
    const picker = group.querySelector('.option-color-picker');
    const textInput = group.querySelector('.modal-opt-input');
    const preview = group.querySelector('.option-color-preview');
    const preset = group.querySelector('.option-color-preset');
    const syncPreview = raw => {
      const normalized = /^#[0-9a-f]{8}$/i.test(raw) ? `#${raw.slice(3)}` : /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#000000';
      if (picker) picker.value = normalized;
      preview?.style.setProperty('--option-color', normalized);
    };
    picker?.addEventListener('input', () => {
      const oldValue = String(textInput.value || '');
      textInput.value = /^#[0-9a-f]{8}$/i.test(oldValue) ? `#${oldValue.slice(1, 3)}${picker.value.slice(1)}` : picker.value;
      preview?.style.setProperty('--option-color', picker.value);
      if (preset) preset.value = '';
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    preset?.addEventListener('change', () => {
      if (!preset.value) return;
      textInput.value = preset.value;
      syncPreview(preset.value);
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    textInput?.addEventListener('input', () => {
      syncPreview(textInput.value);
      if (preset && preset.value !== textInput.value) preset.value = '';
    });
  });
  body.querySelectorAll('.option-file-input').forEach(input => {
    input.addEventListener('change', () => {
      const wrap = input.closest('.option-upload-control');
      const key = wrap.dataset.uploadKey;
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      STATE.patchOptionFiles[key] = { files, mode: wrap.dataset.uploadMode };
      wrap.querySelector('.option-upload-summary').textContent = `${files.length} berkas · ${formatDownloadBytes(total)} · diunggah saat disimpan`;
      wrap.classList.add('has-files');
      validatePatchOptionsDraft(patch);
    });
  });
}

function updatePatchOptionConditionalFields() {
  const customIconCard = document.querySelector('#modalPatchOptsBody [data-option-key="customIcon"]');
  if (customIconCard) customIconCard.classList.toggle('option-is-conditional-hidden', STATE.patchOptionsDraft.appIcon !== 'custom');
}

function validatePatchOptionsDraft(patch) {
  let valid = true;
  (patch.options || []).forEach(option => {
    const card = Array.from(document.querySelectorAll('#modalPatchOptsBody [data-option-key]'))
      .find(item => item.dataset.optionKey === option.key);
    if (!card || card.classList.contains('option-is-conditional-hidden')) return;
    const message = card.querySelector('.option-validation-message');
    const value = STATE.patchOptionsDraft[option.key];
    const control = detectPatchOptionControl(option);
    let error = '';
    const hasPendingFile = Boolean(STATE.patchOptionFiles[option.key]?.files?.length);
    if (option.required && !hasPendingFile && (value === null || value === undefined || String(value).trim() === '')) error = 'Nilai ini wajib diisi.';
    if (!error && (control === 'integer' || control === 'decimal') && value !== null && !Number.isFinite(value)) error = 'Masukkan angka yang valid.';
    if (!error && control === 'json' && value !== null && typeof value !== 'object') error = 'Format data belum valid. Gunakan JSON yang benar.';
    if (!error && /packagename/i.test(option.key) && value && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(String(value))) error = 'Gunakan format package Android, misalnya app.example.youtube.';
    if (!error && control === 'color' && value && !/^#[0-9a-f]{6,8}$/i.test(String(value)) && !/^@[\w.:/-]+$/.test(String(value))) error = 'Gunakan warna hex atau referensi resource Android.';
    card.classList.toggle('has-error', Boolean(error));
    if (message) {
      message.textContent = error;
      message.classList.toggle('hidden', !error);
    }
    if (error) valid = false;
  });
  const save = document.getElementById('btnSavePatchOpts');
  if (save) save.disabled = !valid;
  return valid;
}

async function uploadPatchOptionAsset(key, pending) {
  const form = new FormData();
  form.append('mode', pending.mode);
  form.append('relativePaths', JSON.stringify(pending.files.map(file => file.webkitRelativePath || file.name)));
  pending.files.forEach(file => form.append('files', file, file.name));
  const response = await fetch(`${STATE.daemonUrl}/api/v1/assets/upload`, { method: 'POST', headers: daemonAuthHeaders(), body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Gagal mengunggah aset ${key}`);
  return result.path;
}

function closePatchOptionsModal() {
  const modal = document.getElementById('patchOptionsModal');
  if (modal) modal.classList.add('hidden');
  const returnTarget = STATE.patchOptionsReturnFocusId ? document.getElementById(STATE.patchOptionsReturnFocusId) : null;
  if (returnTarget) requestAnimationFrame(() => returnTarget.focus());
  STATE.patchOptionsDraft = {};
  STATE.patchOptionFiles = {};
}

async function savePatchOptionsModal() {
  const patch = STATE.patches.find(item => item.name === STATE.editingPatchName);
  if (!patch || !validatePatchOptionsDraft(patch)) return;
  const save = document.getElementById('btnSavePatchOpts');
  const status = document.getElementById('patchOptionsSaveStatus');
  if (save) save.disabled = true;
  if (status) status.textContent = Object.keys(STATE.patchOptionFiles).length ? 'Mengunggah aset lokal…' : 'Menyimpan konfigurasi…';
  try {
    for (const [key, pending] of Object.entries(STATE.patchOptionFiles)) {
      STATE.patchOptionsDraft[key] = await uploadPatchOptionAsset(key, pending);
    }
    (patch.options || []).forEach(option => {
      STATE.selectedOptions[option.key] = cloneOptionValue(STATE.patchOptionsDraft[option.key]);
    });
    const scrollRoot = document.querySelector('.mode-curation-scroll');
    const scrollTop = scrollRoot?.scrollTop || 0;
    const returnFocusId = STATE.patchOptionsReturnFocusId;
    closePatchOptionsModal();
    renderMorphePatchList(STATE.wizardStep === 4 ? 'wizardPatchCategoriesContainer' : 'patchCategoriesContainer');
    requestAnimationFrame(() => {
      if (scrollRoot) scrollRoot.scrollTop = scrollTop;
      if (returnFocusId) document.getElementById(returnFocusId)?.focus();
    });
  } catch (error) {
    if (status) status.textContent = error.message;
    if (save) save.disabled = false;
  }
  if (STATE.uiMode === 'tui') renderTuiView();
}

function resetPatchOptionsModal() {
  const patch = STATE.patches.find(p => p.name === STATE.editingPatchName);
  if (!patch || !Array.isArray(patch.options)) return;
  STATE.patchOptionFiles = {};
  patch.options.forEach(opt => {
    if (opt.key) STATE.patchOptionsDraft[opt.key] = cloneOptionValue(opt.default);
  });
  renderPatchOptionsForm(patch);
  const status = document.getElementById('patchOptionsSaveStatus');
  if (status) status.textContent = 'Nilai bawaan siap diterapkan.';
}
