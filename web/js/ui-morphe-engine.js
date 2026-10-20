/* ==========================================================================
   YouTube RVX — Morphe Engine & CLI Options Manager
   Version: 2.1.28
   Categorized engine configuration separated from application source patches:
     1. Keystore & Digital Signature (Persistent, Custom, Unsigned)
     2. CPU Architecture & Native Library Stripping (--striplibs)
     3. Bytecode Compilation Mode (--bytecode-mode)
     4. Build Tolerance & Flow Control (--continue-on-error, -f, --disable-purge)
   ========================================================================== */

function saveMorpheEngineOptions() {
  try {
    RVX_STORAGE.local.setItem('rvx_morphe_engine_config', JSON.stringify(STATE.morpheEngineOptions));
  } catch (_) {}
  syncAllSummaries();
}

function getMorpheEngineSummaryText() {
  const opts = STATE.morpheEngineOptions || {};
  const parts = [];

  // 1. Keystore
  if (opts.keystoreMode === 'unsigned') {
    parts.push('Unsigned');
  } else if (opts.keystoreMode === 'custom') {
    parts.push('Keystore Kustom');
  } else {
    parts.push('Keystore Persisten');
  }

  // 2. Arch stripping
  if (opts.stripLibs && Array.isArray(opts.selectedArchs) && opts.selectedArchs.length > 0) {
    parts.push(opts.selectedArchs.join(', '));
  } else {
    parts.push('Universal (Semua Arch)');
  }

  // 3. Bytecode Mode
  parts.push(opts.bytecodeMode || 'STRIP_FAST');

  return parts.join(' • ');
}

function switchCurateTab(tab) {
  STATE.wizardStep4ActiveTab = tab;
  const tabPatches = document.getElementById('tabCuratePatches');
  const tabEngine = document.getElementById('tabCurateEngine');
  const viewPatches = document.getElementById('viewCuratePatches');
  const viewEngine = document.getElementById('viewCurateEngine');

  const isPatches = tab === 'patches';
  tabPatches?.classList.toggle('active', isPatches);
  tabPatches?.setAttribute('aria-selected', String(isPatches));
  tabEngine?.classList.toggle('active', !isPatches);
  tabEngine?.setAttribute('aria-selected', String(!isPatches));

  viewPatches?.classList.toggle('hidden', !isPatches);
  viewEngine?.classList.toggle('hidden', isPatches);

  if (!isPatches && viewEngine) {
    renderMorpheEnginePanel(viewEngine);
  }
}

function renderMorpheEnginePanel(container) {
  if (!container) return;
  const opts = STATE.morpheEngineOptions;

  const archs = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];
  const selectedArchs = new Set(opts.selectedArchs || ['arm64-v8a']);

  container.innerHTML = `
    <div class="morphe-engine-layout">
      <!-- 01: KEYSTORE & SIGNING -->
      <section class="engine-card" aria-labelledby="headingEngineKeystore">
        <div class="engine-card-header">
          <span class="engine-step-badge">01 · Penandatanganan Digital</span>
          <h4 id="headingEngineKeystore">Keystore &amp; Signature</h4>
          <p class="engine-subtext">Menentukan kunci kriptografis untuk menandatangani APK hasil patch.</p>
        </div>
        <div class="engine-radio-group" role="radiogroup" aria-label="Mode Keystore">
          <label class="engine-radio-item ${opts.keystoreMode === 'persistent' ? 'active' : ''}">
            <input type="radio" name="optKeystoreMode" value="persistent" ${opts.keystoreMode === 'persistent' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>Keystore Persisten (Rekomendasi)</strong>
              <small>Membuat &amp; memakai kunci lokal yang sama agar update berikutnya dapat langsung ditimpa tanpa uninstall.</small>
            </div>
          </label>
          <label class="engine-radio-item ${opts.keystoreMode === 'custom' ? 'active' : ''}">
            <input type="radio" name="optKeystoreMode" value="custom" ${opts.keystoreMode === 'custom' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>Keystore Kustom</strong>
              <small>Gunakan berkas kunci Anda sendiri (.keystore / .jks / .p12).</small>
            </div>
          </label>
          <label class="engine-radio-item ${opts.keystoreMode === 'unsigned' ? 'active' : ''}">
            <input type="radio" name="optKeystoreMode" value="unsigned" ${opts.keystoreMode === 'unsigned' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>Unsigned APK (--unsigned)</strong>
              <small>Menghasilkan APK mentah tanpa tanda tangan (untuk root mount atau ditandatangani manual).</small>
            </div>
          </label>
        </div>

        <div id="engineCustomKeystorePanel" class="engine-subpanel ${opts.keystoreMode === 'custom' ? '' : 'hidden'}">
          <div class="engine-field-row">
            <label class="engine-label" for="inputEngineKeystorePath">Lokasi Berkas Keystore</label>
            <input type="text" id="inputEngineKeystorePath" class="morphe-input" placeholder="/sdcard/.../kunci.keystore" value="${escapeHtml(opts.customKeystorePath || '')}">
          </div>
          <div class="engine-fields-grid">
            <div class="engine-field-row">
              <label class="engine-label" for="inputEngineKeystoreAlias">Key Alias</label>
              <input type="text" id="inputEngineKeystoreAlias" class="morphe-input" placeholder="Morphe Key" value="${escapeHtml(opts.keystoreAlias || '')}">
            </div>
            <div class="engine-field-row">
              <label class="engine-label" for="inputEngineKeystorePass">Keystore Password</label>
              <input type="password" id="inputEngineKeystorePass" class="morphe-input" placeholder="Opsional jika kosong" value="${escapeHtml(opts.keystorePassword || '')}">
            </div>
          </div>
        </div>

        <div class="engine-field-row" style="margin-top: 12px;">
          <label class="engine-label" for="inputEngineSignerName">Nama Signer APK (--signer)</label>
          <input type="text" id="inputEngineSignerName" class="morphe-input" placeholder="Morphe" value="${escapeHtml(opts.signerName || 'Morphe')}">
        </div>
      </section>

      <!-- 02: CPU ARCHITECTURE & STRIP LIBS -->
      <section class="engine-card" aria-labelledby="headingEngineArch">
        <div class="engine-card-header">
          <span class="engine-step-badge">02 · Pustaka Native</span>
          <h4 id="headingEngineArch">Optimalisasi Arsitektur CPU (--striplibs)</h4>
          <p class="engine-subtext">Pangkas pustaka .so yang tidak sesuai dengan arsitektur ponsel untuk menghemat ruang memori (~50-60 MB).</p>
        </div>
        <div class="engine-toggle-row">
          <label class="engine-toggle-label" for="toggleEngineStripLibs">
            <span>Aktifkan pemangkasan arsitektur (--striplibs)</span>
            <small>Menghapus pustaka CPU lain yang tidak terpilih dari APK akhir.</small>
          </label>
          <input type="checkbox" id="toggleEngineStripLibs" class="engine-switch" ${opts.stripLibs ? 'checked' : ''}>
        </div>
        <div id="engineArchChipsContainer" class="engine-chips-wrapper ${opts.stripLibs ? '' : 'disabled'}">
          ${archs.map(arch => `
            <button type="button" class="engine-chip-btn ${selectedArchs.has(arch) ? 'active' : ''}" data-arch="${arch}">
              <span class="chip-check">${selectedArchs.has(arch) ? '✓' : '+'}</span>
              <span>${arch}</span>
              ${arch === 'arm64-v8a' ? '<span class="chip-badge">Umum</span>' : ''}
            </button>
          `).join('')}
        </div>
      </section>

      <!-- 03: BYTECODE COMPILER MODE -->
      <section class="engine-card" aria-labelledby="headingEngineBytecode">
        <div class="engine-card-header">
          <span class="engine-step-badge">03 · Kompiler DEX</span>
          <h4 id="headingEngineBytecode">Mode Kompilasi Bytecode (--bytecode-mode)</h4>
          <p class="engine-subtext">Algoritma rekompilasi berkas DEX oleh mesin Morphe CLI.</p>
        </div>
        <div class="engine-radio-group" role="radiogroup" aria-label="Bytecode Mode">
          <label class="engine-radio-item ${opts.bytecodeMode === 'STRIP_FAST' ? 'active' : ''}">
            <input type="radio" name="optBytecodeMode" value="STRIP_FAST" ${opts.bytecodeMode === 'STRIP_FAST' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>STRIP_FAST (Bawaan &amp; Direkomendasikan)</strong>
              <small>Kompilasi paralel berkecepatan tinggi dengan stripping kelas termodifikasi.</small>
            </div>
          </label>
          <label class="engine-radio-item ${opts.bytecodeMode === 'STRIP_SAFE' ? 'active' : ''}">
            <input type="radio" name="optBytecodeMode" value="STRIP_SAFE" ${opts.bytecodeMode === 'STRIP_SAFE' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>STRIP_SAFE (Aman / Bertahap)</strong>
              <small>Metode bertahap untuk APK yang memiliki proteksi kode rumit.</small>
            </div>
          </label>
          <label class="engine-radio-item ${opts.bytecodeMode === 'FULL' ? 'active' : ''}">
            <input type="radio" name="optBytecodeMode" value="FULL" ${opts.bytecodeMode === 'FULL' ? 'checked' : ''}>
            <div class="engine-radio-content">
              <strong>FULL (Rekompresi Penuh)</strong>
              <small>Membangun ulang seluruh kelas bytecode dari awal (lebih lambat).</small>
            </div>
          </label>
        </div>
      </section>

      <!-- 04: BUILD RESILIENCE & DEBUG -->
      <section class="engine-card" aria-labelledby="headingEngineResilience">
        <div class="engine-card-header">
          <span class="engine-step-badge">04 · Alur Eksekusi &amp; Toleransi</span>
          <h4 id="headingEngineResilience">Ketahanan Build &amp; Debug</h4>
          <p class="engine-subtext">Perilaku saat menangani peringatan dan berkas sementara.</p>
        </div>
        <div class="engine-toggle-list">
          <div class="engine-toggle-row">
            <label class="engine-toggle-label" for="toggleEngineContinueOnError">
              <span>Lanjutkan jika ada patch gagal (--continue-on-error)</span>
              <small>Proses patching tidak langsung dibatalkan jika hanya 1 patch non-kritis yang bermasalah (standar Revancify Termux).</small>
            </label>
            <input type="checkbox" id="toggleEngineContinueOnError" class="engine-switch" ${opts.continueOnError ? 'checked' : ''}>
          </div>
          <div class="engine-toggle-row">
            <label class="engine-toggle-label" for="toggleEngineForce">
              <span>Abaikan pengecekan versi APK (-f / --force)</span>
              <small>Memaksa patching pada versi APK meskipun tidak tercantum resmi dalam rekomendasi sumber.</small>
            </label>
            <input type="checkbox" id="toggleEngineForce" class="engine-switch" ${opts.force ? 'checked' : ''}>
          </div>
          <div class="engine-toggle-row">
            <label class="engine-toggle-label" for="toggleEngineDisablePurge">
              <span>Simpan berkas kerja sementara (--disable-purge)</span>
              <small>Menyimpan berkas DEX dan XML hasil dekompilasi untuk keperluan analitik atau debug.</small>
            </label>
            <input type="checkbox" id="toggleEngineDisablePurge" class="engine-switch" ${opts.disablePurge ? 'checked' : ''}>
          </div>
        </div>
      </section>
    </div>
  `;

  bindMorpheEngineEvents(container);
}

function bindMorpheEngineEvents(container) {
  if (!container) return;

  // Keystore mode radio
  container.querySelectorAll('input[name="optKeystoreMode"]').forEach(radio => {
    radio.onchange = () => {
      STATE.morpheEngineOptions.keystoreMode = radio.value;
      container.querySelectorAll('.engine-radio-item').forEach(el => {
        const input = el.querySelector('input[name="optKeystoreMode"]');
        if (input) el.classList.toggle('active', input.value === radio.value);
      });
      const subpanel = document.getElementById('engineCustomKeystorePanel');
      if (subpanel) subpanel.classList.toggle('hidden', radio.value !== 'custom');
      saveMorpheEngineOptions();
    };
  });

  // Custom keystore inputs
  const inputPath = document.getElementById('inputEngineKeystorePath');
  if (inputPath) {
    inputPath.oninput = (e) => {
      STATE.morpheEngineOptions.customKeystorePath = e.target.value.trim();
      saveMorpheEngineOptions();
    };
  }
  const inputAlias = document.getElementById('inputEngineKeystoreAlias');
  if (inputAlias) {
    inputAlias.oninput = (e) => {
      STATE.morpheEngineOptions.keystoreAlias = e.target.value.trim();
      saveMorpheEngineOptions();
    };
  }
  const inputPass = document.getElementById('inputEngineKeystorePass');
  if (inputPass) {
    inputPass.oninput = (e) => {
      STATE.morpheEngineOptions.keystorePassword = e.target.value;
      saveMorpheEngineOptions();
    };
  }
  const inputSigner = document.getElementById('inputEngineSignerName');
  if (inputSigner) {
    inputSigner.oninput = (e) => {
      STATE.morpheEngineOptions.signerName = e.target.value.trim() || 'Morphe';
      saveMorpheEngineOptions();
    };
  }

  // Strip Libs switch
  const toggleStripLibs = document.getElementById('toggleEngineStripLibs');
  const chipsWrapper = document.getElementById('engineArchChipsContainer');
  if (toggleStripLibs) {
    toggleStripLibs.onchange = () => {
      STATE.morpheEngineOptions.stripLibs = toggleStripLibs.checked;
      chipsWrapper?.classList.toggle('disabled', !toggleStripLibs.checked);
      saveMorpheEngineOptions();
    };
  }

  // Arch chips
  container.querySelectorAll('.engine-chip-btn').forEach(btn => {
    btn.onclick = () => {
      if (!STATE.morpheEngineOptions.stripLibs) return;
      const arch = btn.dataset.arch;
      let set = new Set(STATE.morpheEngineOptions.selectedArchs || []);
      if (set.has(arch)) {
        if (set.size > 1) set.delete(arch);
      } else {
        set.add(arch);
      }
      STATE.morpheEngineOptions.selectedArchs = Array.from(set);
      btn.classList.toggle('active', set.has(arch));
      const checkEl = btn.querySelector('.chip-check');
      if (checkEl) checkEl.textContent = set.has(arch) ? '✓' : '+';
      saveMorpheEngineOptions();
    };
  });

  // Bytecode mode radio
  container.querySelectorAll('input[name="optBytecodeMode"]').forEach(radio => {
    radio.onchange = () => {
      STATE.morpheEngineOptions.bytecodeMode = radio.value;
      container.querySelectorAll('.engine-radio-item').forEach(el => {
        const input = el.querySelector('input[name="optBytecodeMode"]');
        if (input) el.classList.toggle('active', input.value === radio.value);
      });
      saveMorpheEngineOptions();
    };
  });

  // Resilience switches
  const toggleContinue = document.getElementById('toggleEngineContinueOnError');
  if (toggleContinue) {
    toggleContinue.onchange = () => {
      STATE.morpheEngineOptions.continueOnError = toggleContinue.checked;
      saveMorpheEngineOptions();
    };
  }
  const toggleForce = document.getElementById('toggleEngineForce');
  if (toggleForce) {
    toggleForce.onchange = () => {
      STATE.morpheEngineOptions.force = toggleForce.checked;
      saveMorpheEngineOptions();
    };
  }
  const togglePurge = document.getElementById('toggleEngineDisablePurge');
  if (togglePurge) {
    togglePurge.onchange = () => {
      STATE.morpheEngineOptions.disablePurge = togglePurge.checked;
      saveMorpheEngineOptions();
    };
  }
}
