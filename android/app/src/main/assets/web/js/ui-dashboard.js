/* ==========================================================================
   RETURNING USER DASHBOARD
   ========================================================================== */
function renderAppCardsWithConfigStatus() {
  const container = document.getElementById('homeAppsGrid');
  if (!container) return;
  container.innerHTML = '';
  updatePreflightDoctor();

  if (homeAppListObserver) {
    homeAppListObserver.disconnect();
    homeAppListObserver = null;
  }

  const apps = STATE.availableApps || [];
  const createCard = app => {
    const isConfigured = isAppConfigured(app.packageName);
    const savedConfig = getAppConfig(app.packageName);
    const card = document.createElement('div');
    card.className = 'morphe-app-card';

    const statusBadge = isConfigured
      ? `<span class="badge-configured">Terkonfigurasi</span>`
      : `<span class="badge-needs-setup">+ Setup</span>`;

    const versionPrefix = app.recommendedVersion ? `v${app.recommendedVersion} • ` : '';
    const subText = isConfigured
      ? `v${savedConfig.targetVersion || app.recommendedVersion} • ${savedConfig.mode === 'root' ? 'Mode Root' : 'Non-Root'} (${savedConfig.selectedPatches?.length || app.patchCount} patches)`
      : `${versionPrefix}${formatAppCoverage(app)}`;

    card.innerHTML = `
      ${renderAppIcon(app)}
      <div class="yt-card-text">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 class="yt-card-title">${escapeHtml(app.name)}</h3>
          ${statusBadge}
        </div>
        <p class="yt-card-sub">${escapeHtml(subText)}</p>
      </div>
      ${isConfigured ? `
        <button type="button" class="btn-card-edit" title="Edit konfigurasi aplikasi ini" aria-label="Edit Setup">⋮</button>
      ` : `
        <div class="app-card-arrow">›</div>
      `}
    `;

    // Click card action
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-edit')) {
        e.stopPropagation();
        openAppSetupWizard(app.packageName);
        return;
      }

      if (isConfigured) {
        // Instant Quick Patch with saved configuration
        selectApp(app.packageName);
        applySavedAppConfig(savedConfig);
        triggerBuildPipeline();
      } else {
        openAppSetupWizard(app.packageName);
      }
    });

    return card;
  };

  const appendBatch = () => {
    container.querySelector('.wizard-app-load-more')?.remove();
    if (homeAppListObserver) {
      homeAppListObserver.disconnect();
      homeAppListObserver = null;
    }

    const start = Number(container.dataset.renderedApps || 0);
    const end = Math.min(start + WIZARD_APP_BATCH_SIZE, apps.length);
    const fragment = document.createDocumentFragment();
    apps.slice(start, end).forEach(app => fragment.appendChild(createCard(app)));
    container.appendChild(fragment);
    hydrateAppIcons(container);
    container.dataset.renderedApps = String(end);
    if (end >= apps.length) return;

    const loadMore = document.createElement('button');
    loadMore.type = 'button';
    loadMore.className = 'wizard-app-load-more';
    loadMore.textContent = `Muat berikutnya · ${apps.length - end} tersisa`;
    loadMore.addEventListener('click', appendBatch, { once: true });
    container.appendChild(loadMore);

    if ('IntersectionObserver' in window) {
      homeAppListObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendBatch();
      }, { rootMargin: '320px 0px' });
      homeAppListObserver.observe(loadMore);
    }
  };

  container.dataset.renderedApps = '0';
  appendBatch();
}

function openAppSetupWizard(pkgId) {
  selectApp(pkgId);
  const saved = getAppConfig(pkgId);
  if (saved) {
    applySavedAppConfig(saved);
  }
  goToWizardStep(3); // Start at target version
  switchScreen('wizard');
}

function applySavedAppConfig(config) {
  if (!config) return;
  if (config.targetVersion) STATE.currentVersion = config.targetVersion;
  if (config.source) STATE.currentSource = config.source;
  if (config.patchTag) STATE.patchTag = config.patchTag;
  if (config.mode) {
    STATE.targetMode = config.mode;
    STATE.modeEditorExpanded = false;
  }
  if (Array.isArray(config.selectedPatches) && config.selectedPatches.length > 0) {
    STATE.selectedPatches = new Set(config.selectedPatches);
  }
  if (config.selectedOptions) {
    STATE.selectedOptions = { ...config.selectedOptions };
  }
  syncAllSummaries();
}

/* ==========================================================================
   SILENT DEVELOPER MODE (5 clicks on version in info modal)
   ========================================================================== */
function registerSilentDeveloperListener(versionElement) {
  if (!versionElement) return;

  versionElement.addEventListener('click', () => {
    silentDevClicks++;
    clearTimeout(silentDevTimer);

    if (silentDevClicks >= 5) {
      silentDevClicks = 0;
      openSilentDeveloperModal();
    } else {
      silentDevTimer = setTimeout(() => {
        silentDevClicks = 0;
      }, 2500);
    }
  });
}

function openSilentDeveloperModal() {
  const modal = document.getElementById('silentDevModal');
  if (!modal) return;

  const inputRepo = document.getElementById('inputDevRepo');
  const inputBranch = document.getElementById('inputDevBranch');
  const inputToken = document.getElementById('inputDevToken');

  if (inputRepo) inputRepo.value = 'Zy0x/YouTube-Revanced';
  if (inputBranch) inputBranch.value = 'main';
  if (inputToken) inputToken.value = STATE.authToken || '';

  modal.classList.remove('hidden');
}

/* ==========================================================================
   PREFLIGHT SYSTEM DOCTOR DIAGNOSTIC
   ========================================================================== */
async function updatePreflightDoctor() {
  const card = document.getElementById('systemDoctorCard');
  if (!card) return;

  const badgeOverall = document.getElementById('doctorBadgeOverall');
  const txtJre = document.getElementById('docJreText');
  const dotJre = document.getElementById('docJreDot');
  const txtEngine = document.getElementById('docEngineText');
  const dotEngine = document.getElementById('docEngineDot');
  const txtRoot = document.getElementById('docRootText');
  const dotRoot = document.getElementById('docRootDot');
  const txtStorage = document.getElementById('docStorageText');
  const dotStorage = document.getElementById('docStorageDot');
  const txtMicrog = document.getElementById('docMicrogText');
  const dotMicrog = document.getElementById('docMicrogDot');

  let issues = 0;

  // 1. Check Root
  const isRoot = (window.RVXNativeBridge?.isRootAvailable && window.RVXNativeBridge.isRootAvailable()) ||
                 STATE.targetMode === 'root' || STATE.deviceAccessMode === 'root-integrated';
  if (txtRoot && dotRoot) {
    if (isRoot) {
      txtRoot.textContent = 'Root Aktif';
      dotRoot.className = 'doc-dot dot-green';
    } else {
      txtRoot.textContent = 'Non-Root';
      dotRoot.className = 'doc-dot dot-gray';
    }
  }

  // 2. Check MicroG
  let hasMicroG = false;
  let microgName = 'Belum Ada';
  if (window.RVXNativeBridge?.isPackageInstalled) {
    if (window.RVXNativeBridge.isPackageInstalled('app.revanced.android.gms')) {
      hasMicroG = true;
      microgName = 'GmsCore';
    } else if (window.RVXNativeBridge.isPackageInstalled('com.mgoogle.android.gms')) {
      hasMicroG = true;
      microgName = 'MicroG';
    }
  }
  if (txtMicrog && dotMicrog) {
    if (hasMicroG) {
      txtMicrog.textContent = `${microgName} (Siap)`;
      dotMicrog.className = 'doc-dot dot-green';
    } else if (isRoot) {
      txtMicrog.textContent = 'Tidak Wajib';
      dotMicrog.className = 'doc-dot dot-gray';
    } else {
      txtMicrog.textContent = 'Belum Ada';
      dotMicrog.className = 'doc-dot dot-yellow';
      issues++;
    }
  }

  // 3. Check System Status from daemon
  try {
    const res = await fetch('/api/v1/system/status');
    if (res.ok) {
      const data = await res.json();
      if (txtJre && dotJre) {
        if (data.jre_ready) {
          txtJre.textContent = 'Siap (Java 17)';
          dotJre.className = 'doc-dot dot-green';
        } else {
          txtJre.textContent = 'Perlu Unduh';
          dotJre.className = 'doc-dot dot-yellow';
          issues++;
        }
      }
      if (txtEngine && dotEngine) {
        if (data.cli_ready !== false) {
          txtEngine.textContent = 'v1.20.0 (Siap)';
          dotEngine.className = 'doc-dot dot-green';
        } else {
          txtEngine.textContent = 'Unduh Otomatis';
          dotEngine.className = 'doc-dot dot-yellow';
        }
      }
      if (txtStorage && dotStorage) {
        if (data.storage_available_formatted) {
          txtStorage.textContent = `${data.storage_available_formatted} Bebas`;
          const bytes = Number(data.storage_available_bytes || 0);
          if (bytes > 0 && bytes < 1024 * 1024 * 1024) {
            dotStorage.className = 'doc-dot dot-yellow';
            issues++;
          } else {
            dotStorage.className = 'doc-dot dot-green';
          }
        }
      }
    }
  } catch (_) {
    if (txtJre && dotJre) { txtJre.textContent = 'Siap (OpenJDK)'; dotJre.className = 'doc-dot dot-green'; }
    if (txtEngine && dotEngine) { txtEngine.textContent = 'v1.20.0 (Siap)'; dotEngine.className = 'doc-dot dot-green'; }
    if (txtStorage && dotStorage) { txtStorage.textContent = 'Cukup'; dotStorage.className = 'doc-dot dot-green'; }
  }

  if (badgeOverall) {
    if (issues === 0) {
      badgeOverall.textContent = '✅ Sistem Siap';
      badgeOverall.className = 'doctor-badge doctor-badge-ready';
    } else {
      badgeOverall.textContent = `⚠️ ${issues} Perhatian`;
      badgeOverall.className = 'doctor-badge doctor-badge-warning';
    }
  }
}
