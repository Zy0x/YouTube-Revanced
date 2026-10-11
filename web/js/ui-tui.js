/**
 * YouTube RVX — Termux CLI Revancify-Xisr 1:1 TUI Renderer
 * Version: 2.1.9
 */

function renderTuiView() {
  const titleEl = document.getElementById('tuiDialogTitle');
  const bodyEl = document.getElementById('tuiDialogBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const total = STATE.patches.length || 83;
  const active = STATE.selectedPatches.size;
  const srcName = getSourceDisplayName(STATE.currentSource);

  if (STATE.tuiScreen === 'main') {
    if (titleEl) titleEl.textContent = '| Main Menu |';
    const menuItems = [
      { num: '1', label: 'Select App', sub: STATE.currentApp?.name || 'YouTube', action: () => { STATE.tuiScreen = 'app'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '2', label: 'Change Source', sub: srcName, action: () => { STATE.tuiScreen = 'source'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '3', label: 'Select Version', sub: `v${STATE.currentVersion}`, action: () => { STATE.tuiScreen = 'version'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '4', label: 'Edit Patches', sub: `${active}/${total}`, action: () => { STATE.tuiScreen = 'patches'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '5', label: 'Edit Patch Options', sub: 'Options', action: () => { STATE.tuiScreen = 'options'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '6', label: 'Preset Manager', sub: 'JSON', action: () => { STATE.tuiScreen = 'presets'; STATE.tuiSelectedIndex = 0; renderTuiView(); } },
      { num: '7', label: 'Patch App (Compile)', sub: 'Start Build', action: () => triggerBuildPipeline() },
      { num: '8', label: 'Mount / Export ZIP', sub: 'Install Module', action: () => {
          document.getElementById('screenVersion')?.classList.remove('active');
          document.getElementById('screenPatches')?.classList.remove('active');
          document.getElementById('screenHome')?.classList.remove('active');
          document.getElementById('screenProgress')?.classList.add('active');
          document.getElementById('tuiAppContainer')?.classList.add('hidden');
          document.getElementById('morpheAppContainer')?.classList.remove('hidden');
        }
      },
      { num: '9', label: 'Settings', sub: STATE.engineMode === 'local' ? 'Local' : 'Cloud', action: () => { document.getElementById('settingsModal')?.classList.remove('hidden'); } }
    ];

    menuItems.forEach((item, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${item.num}</span>
          <span>${escapeHtml(item.label)}</span>
        </div>
        <span class="tui-row-sub">${escapeHtml(item.sub)}</span>
      `;
      row.addEventListener('click', () => {
        STATE.tuiSelectedIndex = idx;
        item.action();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'app') {
    if (titleEl) titleEl.textContent = '| Select Application |';
    (STATE.availableApps || []).forEach((app, idx) => {
      const isCur = STATE.currentApp && STATE.currentApp.packageName === app.packageName;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>${escapeHtml(app.name)}</span>
        </div>
        <span class="tui-row-sub">${app.patchCount} patches</span>
      `;
      row.addEventListener('click', () => {
        STATE.tuiSelectedIndex = idx;
        selectApp(app.packageName);
        STATE.tuiScreen = 'main';
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'source') {
    if (titleEl) titleEl.textContent = `| Change Source (${STATE.sources.length}) |`;
    STATE.sources.forEach((s, idx) => {
      const isCur = s.id === STATE.currentSource;
      const isPre = s.isPreinstalled !== false;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>${escapeHtml(getSourceDisplayName(s.id))}</span>
        </div>
        <span class="tui-row-sub">${isPre ? '[Official]' : '[Custom]'} ${escapeHtml(s.repository || '')}</span>
      `;
      row.addEventListener('click', async () => {
        STATE.tuiSelectedIndex = idx;
        await selectPatchSource(s.id);
        STATE.tuiScreen = 'main';
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });

    // TUI Action: [+] Add Custom Source
    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.className = 'tui-menu-row';
    addRow.innerHTML = `
      <div class="tui-row-left">
        <span class="tui-row-num" style="color: #68D391;">[+]</span>
        <span style="color: #68D391; font-weight: bold;">Add Custom Source</span>
      </div>
      <span class="tui-row-sub">GitHub repo or URL</span>
    `;
    addRow.addEventListener('click', async () => {
      const repo = prompt('Enter GitHub repository (e.g. owner/repo) or raw manifest URL:');
      if (!repo || !repo.trim()) return;
      const name = prompt('Enter display name for this source (optional):') || repo.trim();
      const newSource = addCustomSource({ name, repository: repo.trim(), defaultReleaseType: 'latest' });
      if (newSource) {
        await selectPatchSource(newSource.id);
        renderTuiView();
      }
    });
    bodyEl.appendChild(addRow);

    // TUI Action: [-] Remove Current Custom Source (if applicable)
    const curObj = STATE.sources.find(s => s.id === STATE.currentSource);
    if (curObj && curObj.isPreinstalled === false) {
      const delRow = document.createElement('button');
      delRow.type = 'button';
      delRow.className = 'tui-menu-row';
      delRow.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num" style="color: #FC8181;">[-]</span>
          <span style="color: #FC8181;">Delete Active Custom Source</span>
        </div>
        <span class="tui-row-sub">${escapeHtml(curObj.name)}</span>
      `;
      delRow.addEventListener('click', async () => {
        if (confirm(`Remove custom source "${curObj.name}"?`)) {
          deleteCustomSource(curObj.id);
          await selectPatchSource(STATE.currentSource);
          renderTuiView();
        }
      });
      bodyEl.appendChild(delRow);
    }

    // TUI Action: [R] Reset Defaults
    const resetRow = document.createElement('button');
    resetRow.type = 'button';
    resetRow.className = 'tui-menu-row';
    resetRow.innerHTML = `
      <div class="tui-row-left">
        <span class="tui-row-num">[R]</span>
        <span style="color: #A0AEC0;">Reset to Factory Defaults</span>
      </div>
      <span class="tui-row-sub">Restore 4 official</span>
    `;
    resetRow.addEventListener('click', async () => {
      if (confirm('Reset all patch sources to factory defaults?')) {
        resetSourcesToDefault();
        await selectPatchSource('anddea');
        renderTuiView();
      }
    });
    bodyEl.appendChild(resetRow);
    return;
  }

  if (STATE.tuiScreen === 'version') {
    if (titleEl) titleEl.textContent = '| Select Version |';
    (STATE.availableVersions || []).slice(0, 15).forEach((item, idx) => {
      const isCur = item.version === STATE.currentVersion;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${isCur ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isCur ? '(*)' : '( )'}</span>
          <span>${escapeHtml(item.version)}</span>
        </div>
        <span class="tui-row-sub">${item.isRecommended ? '[Rec]' : ''}</span>
      `;
      row.addEventListener('click', () => {
        STATE.currentVersion = item.version;
        STATE.tuiSelectedIndex = idx;
        renderVersionSelector();
        syncAllSummaries();
        STATE.tuiScreen = 'main';
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'patches') {
    if (titleEl) titleEl.textContent = `| Edit Patches (${active}/${total}) |`;
    const strip = document.createElement('div');
    strip.className = 'tui-toolbar-strip';
    strip.innerHTML = `
      <button type="button" class="tui-btn" id="tuiBtnAll">[ All ]</button>
      <button type="button" class="tui-btn" id="tuiBtnGolden">[ Golden ]</button>
      <button type="button" class="tui-btn" id="tuiBtnNone">[ None ]</button>
    `;
    bodyEl.appendChild(strip);

    strip.querySelector('#tuiBtnAll')?.addEventListener('click', () => {
      STATE.patches.forEach(p => STATE.selectedPatches.add(p.name));
      renderMorphePatchList();
      syncAllSummaries();
      renderTuiView();
    });
    strip.querySelector('#tuiBtnGolden')?.addEventListener('click', () => applyGoldenPreset());
    strip.querySelector('#tuiBtnNone')?.addEventListener('click', () => {
      STATE.selectedPatches.clear();
      renderMorphePatchList();
      syncAllSummaries();
      renderTuiView();
    });

    STATE.patches.forEach((p, idx) => {
      const isSel = STATE.selectedPatches.has(p.name);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${isSel ? '[*]' : '[ ]'}</span>
          <span>${escapeHtml(p.name)}</span>
        </div>
      `;
      row.addEventListener('click', () => {
        STATE.tuiSelectedIndex = idx;
        if (STATE.selectedPatches.has(p.name)) {
          STATE.selectedPatches.delete(p.name);
        } else {
          STATE.selectedPatches.add(p.name);
        }
        renderMorphePatchList();
        syncAllSummaries();
        renderTuiView();
      });
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'options') {
    if (titleEl) titleEl.textContent = '| Patch Options |';
    const patchesWithOpts = STATE.patches.filter(p => Array.isArray(p.options) && p.options.length > 0);
    patchesWithOpts.forEach((p, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === STATE.tuiSelectedIndex ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${idx + 1}</span>
          <span>${escapeHtml(p.name)}</span>
        </div>
        <span class="tui-row-sub">${p.options.length} ›</span>
      `;
      row.addEventListener('click', () => openPatchOptionsModal(p));
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'presets') {
    if (titleEl) titleEl.textContent = '| Presets |';
    const items = [
      { num: '1', label: 'Apply Golden Preset', action: () => { applyGoldenPreset(); STATE.tuiScreen = 'main'; renderTuiView(); } },
      { num: '2', label: 'Export Preset (.json)', action: () => exportPreset() },
      { num: '3', label: 'Import Preset (.json)', action: () => document.getElementById('inputImportPreset')?.click() }
    ];
    items.forEach((it, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `tui-menu-row ${idx === 0 ? 'tui-row-active' : ''}`;
      row.innerHTML = `
        <div class="tui-row-left">
          <span class="tui-row-num">${it.num}</span>
          <span>${escapeHtml(it.label)}</span>
        </div>
      `;
      row.addEventListener('click', it.action);
      bodyEl.appendChild(row);
    });
    return;
  }

  if (STATE.tuiScreen === 'logs') {
    if (titleEl) titleEl.textContent = '| Patcher Output |';
    STATE.logHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'morphe-log-row';
      div.innerHTML = `
        <span class="log-badge log-badge-info">${escapeHtml(entry.type)}</span>
        <span class="log-msg">${escapeHtml(entry.text)}</span>
      `;
      bodyEl.appendChild(div);
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
}

function initKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (STATE.uiMode !== 'tui') return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    const rows = Array.from(document.querySelectorAll('#tuiDialogBody .tui-menu-row'));
    if (rows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      STATE.tuiSelectedIndex = (STATE.tuiSelectedIndex + 1) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('tui-row-active', i === STATE.tuiSelectedIndex));
      rows[STATE.tuiSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      STATE.tuiSelectedIndex = (STATE.tuiSelectedIndex - 1 + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('tui-row-active', i === STATE.tuiSelectedIndex));
      rows[STATE.tuiSelectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[STATE.tuiSelectedIndex]?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      STATE.tuiScreen = 'main';
      STATE.tuiSelectedIndex = 0;
      renderTuiView();
    }
  });
}
