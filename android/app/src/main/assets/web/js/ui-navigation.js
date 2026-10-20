/* ==========================================================================
   YouTube RVX — Ordered Hierarchical Back Gesture & History Navigation
   Version: 2.1.27
   Handles step-by-step back gestures across Android Native App, PWA, and Web.
   Strict hierarchy:
     1. Menus / Popovers (#patchBulkMenu, #wizardHeaderMenu)
     2. Nested Drawers (#drawerManualTag, #wizAddSourceDrawer, #versionSearchDrawer)
     3. Modals (Storage, Consent, Options, Versions, Tags, Sources, Info, etc.)
     4. TUI Terminal View (back to Morphe UI)
     5. Wizard Steps (Step 5 -> 4 -> 3 -> 2 -> 1) / Screens (Progress -> Patches -> Version -> Home)
     6. Double-Back-to-Exit prompt on root level (2000ms threshold)
   ========================================================================== */

let rvxWebLastBackPressTime = 0;
let rvxToastTimer = null;

/**
 * Displays a non-intrusive floating toast notification for web/PWA.
 */
function showRvxToast(message) {
  let toast = document.getElementById('rvxFloatingToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rvxFloatingToast';
    toast.className = 'rvx-floating-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(rvxToastTimer);
  rvxToastTimer = setTimeout(() => {
    toast?.classList.remove('visible');
  }, 2000);
}

/**
 * Checks whether there is an active menu, drawer, modal, or navigable step/screen
 * that can be backed out of.
 */
function rvxHasBackNavTarget() {
  // 1. Menus
  const bulkMenu = document.getElementById('patchBulkMenu');
  if (bulkMenu && !bulkMenu.classList.contains('hidden')) return true;

  const headerMenu = document.getElementById('wizardHeaderMenu');
  if (headerMenu && !headerMenu.classList.contains('hidden')) return true;

  // 2. Drawers
  const manualDrawer = document.getElementById('drawerManualTag');
  if (manualDrawer && !manualDrawer.classList.contains('hidden')) return true;

  const addSourceDrawer = document.getElementById('wizAddSourceDrawer');
  if (addSourceDrawer && !addSourceDrawer.classList.contains('hidden')) return true;

  const verSearchDrawer = document.getElementById('versionSearchDrawer');
  if (verSearchDrawer && !verSearchDrawer.classList.contains('hidden')) return true;

  // 3. Modals
  const modalIds = [
    'storageBrowserModal',
    'downloadConsentModal',
    'patchOptionsModal',
    'modalOtherVersions',
    'modalPatchTagPicker',
    'modalWizardSourcePicker',
    'patchNotesModal',
    'smartMicrogModal',
    'infoModal',
    'settingsModal',
    'sourcesModal',
    'presetSheetModal',
    'buildProgressModal',
    'silentDevModal'
  ];
  for (const id of modalIds) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) return true;
  }

  const anyVisibleModal = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'))
    .find(el => el.id !== 'tuiView');
  if (anyVisibleModal) return true;

  // 4. TUI Mode
  if (window.STATE?.uiMode === 'tui') return true;
  const tuiView = document.getElementById('tuiView');
  if (tuiView && !tuiView.classList.contains('hidden')) return true;

  // 5. Wizard Steps
  if (window.STATE?.activeScreen === 'wizard' && (window.STATE?.wizardStep || 1) > 1) return true;

  // 6. Classic Morphe Screens
  if (window.STATE?.activeScreen && window.STATE?.activeScreen !== 'wizard' && window.STATE?.activeScreen !== 'home') {
    return true;
  }

  return false;
}

/**
 * Keeps browser history stack synchronized for PWA and Mobile Browsers.
 */
function syncPwaHistory() {
  if (window.RVXNativeBridge) return; // Managed natively by MainActivity.kt
  if (!window.history || !window.history.pushState) return;

  if (rvxHasBackNavTarget()) {
    if (!window.history.state?.rvxSub) {
      window.history.pushState({ rvxSub: true }, '');
    }
  }
}

/**
 * Master Back Gesture Handler for YouTube RVX (both Android Native App and Web/PWA).
 * Executes strictly ordered step-by-step back navigation.
 * Returns true if an action was handled; returns false if at the root level.
 */
window.RVXHandleBackGesture = function() {
  // -------------------------------------------------------------
  // Level 1: Popups & Dropdown Menus
  // -------------------------------------------------------------
  const bulkMenu = document.getElementById('patchBulkMenu');
  if (bulkMenu && !bulkMenu.classList.contains('hidden')) {
    bulkMenu.classList.add('hidden');
    document.getElementById('btnPatchBulkMenu')?.setAttribute('aria-expanded', 'false');
    syncPwaHistory();
    return true;
  }

  const headerMenu = document.getElementById('wizardHeaderMenu');
  if (headerMenu && !headerMenu.classList.contains('hidden')) {
    headerMenu.classList.add('hidden');
    document.getElementById('btnWizardHeaderMenu')?.setAttribute('aria-expanded', 'false');
    syncPwaHistory();
    return true;
  }

  // -------------------------------------------------------------
  // Level 2: Nested Drawers & Sub-panels
  // -------------------------------------------------------------
  const manualDrawer = document.getElementById('drawerManualTag');
  if (manualDrawer && !manualDrawer.classList.contains('hidden')) {
    manualDrawer.classList.add('hidden');
    const icon = document.getElementById('manualToggleIcon');
    if (icon) icon.textContent = '▾';
    syncPwaHistory();
    return true;
  }

  const addSourceDrawer = document.getElementById('wizAddSourceDrawer');
  if (addSourceDrawer && !addSourceDrawer.classList.contains('hidden')) {
    addSourceDrawer.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const verSearchDrawer = document.getElementById('versionSearchDrawer');
  if (verSearchDrawer && !verSearchDrawer.classList.contains('hidden')) {
    verSearchDrawer.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  // -------------------------------------------------------------
  // Level 3: Modal Dialogs (in reverse stack order)
  // -------------------------------------------------------------
  const storageModal = document.getElementById('storageBrowserModal');
  if (storageModal && !storageModal.classList.contains('hidden')) {
    if (typeof closeStorageBrowser === 'function') closeStorageBrowser();
    else storageModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const downloadConsentModal = document.getElementById('downloadConsentModal');
  if (downloadConsentModal && !downloadConsentModal.classList.contains('hidden')) {
    if (typeof closeDownloadConsentModal === 'function') closeDownloadConsentModal();
    else downloadConsentModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const patchOptionsModal = document.getElementById('patchOptionsModal');
  if (patchOptionsModal && !patchOptionsModal.classList.contains('hidden')) {
    if (typeof closePatchOptionsModal === 'function') closePatchOptionsModal();
    else patchOptionsModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const otherVersionsModal = document.getElementById('modalOtherVersions');
  if (otherVersionsModal && !otherVersionsModal.classList.contains('hidden')) {
    if (typeof closeOtherVersionsModal === 'function') closeOtherVersionsModal();
    else otherVersionsModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const tagPickerModal = document.getElementById('modalPatchTagPicker');
  if (tagPickerModal && !tagPickerModal.classList.contains('hidden')) {
    tagPickerModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const sourcePickerModal = document.getElementById('modalWizardSourcePicker');
  if (sourcePickerModal && !sourcePickerModal.classList.contains('hidden')) {
    sourcePickerModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const patchNotesModal = document.getElementById('patchNotesModal');
  if (patchNotesModal && !patchNotesModal.classList.contains('hidden')) {
    patchNotesModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const smartMicrogModal = document.getElementById('smartMicrogModal');
  if (smartMicrogModal && !smartMicrogModal.classList.contains('hidden')) {
    smartMicrogModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const infoModal = document.getElementById('infoModal');
  if (infoModal && !infoModal.classList.contains('hidden')) {
    infoModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal && !settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const sourcesModal = document.getElementById('sourcesModal');
  if (sourcesModal && !sourcesModal.classList.contains('hidden')) {
    sourcesModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const presetSheetModal = document.getElementById('presetSheetModal');
  if (presetSheetModal && !presetSheetModal.classList.contains('hidden')) {
    presetSheetModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const buildProgressModal = document.getElementById('buildProgressModal');
  if (buildProgressModal && !buildProgressModal.classList.contains('hidden')) {
    buildProgressModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  const silentDevModal = document.getElementById('silentDevModal');
  if (silentDevModal && !silentDevModal.classList.contains('hidden')) {
    silentDevModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  // Generic fallback for any other modal overlay
  const anyVisibleModal = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'))
    .find(el => el.id !== 'tuiView');
  if (anyVisibleModal) {
    anyVisibleModal.classList.add('hidden');
    syncPwaHistory();
    return true;
  }

  // -------------------------------------------------------------
  // Level 4: TUI Terminal mode -> switch back to Morphe UI
  // -------------------------------------------------------------
  if (window.STATE?.uiMode === 'tui' || (document.getElementById('tuiView') && !document.getElementById('tuiView').classList.contains('hidden'))) {
    if (typeof setUiMode === 'function') setUiMode('morphe');
    syncPwaHistory();
    return true;
  }

  // -------------------------------------------------------------
  // Level 5: Wizard Step Navigation (Step 5 -> 4 -> 3 -> 2 -> 1)
  // -------------------------------------------------------------
  if (window.STATE?.activeScreen === 'wizard') {
    const currentStep = Number(window.STATE?.wizardStep || 1);
    if (currentStep > 1) {
      if (typeof goToWizardStep === 'function') {
        goToWizardStep(currentStep - 1);
      }
      syncPwaHistory();
      return true;
    }
    // Already on Step 1: Root reached
    return false;
  }

  // -------------------------------------------------------------
  // Level 6: Classic Morphe Screens (Progress -> Patches -> Version -> Home)
  // -------------------------------------------------------------
  if (window.STATE?.activeScreen === 'progress') {
    if (typeof switchScreen === 'function') switchScreen('patches');
    syncPwaHistory();
    return true;
  }
  if (window.STATE?.activeScreen === 'patches') {
    if (typeof switchScreen === 'function') switchScreen('version');
    syncPwaHistory();
    return true;
  }
  if (window.STATE?.activeScreen === 'version') {
    if (typeof switchScreen === 'function') switchScreen('home');
    syncPwaHistory();
    return true;
  }

  // Root level reached (Step 1 or Home)
  return false;
};

/**
 * Initializes listeners for PWA popstate, click delegation, and keyboard escape.
 */
function initRvxNavigation() {
  if (window.history && window.history.replaceState) {
    window.history.replaceState({ rvxBase: true }, '');
  }

  // Handle browser popstate (mobile Chrome, Firefox, Safari, and PWA)
  window.addEventListener('popstate', () => {
    if (window.RVXNativeBridge) return; // Handled directly in MainActivity.kt

    const handled = window.RVXHandleBackGesture();
    if (handled) {
      if (rvxHasBackNavTarget()) {
        window.history.pushState({ rvxSub: true }, '');
      }
    } else {
      const now = Date.now();
      if (now - rvxWebLastBackPressTime < 2000) {
        showRvxToast('Menutup aplikasi…');
      } else {
        rvxWebLastBackPressTime = now;
        showRvxToast('Tekan sekali lagi untuk keluar');
        window.history.pushState({ rvxSub: true }, '');
      }
    }
  });

  // Global delegation: update PWA history state after any DOM interactions
  document.addEventListener('click', () => {
    requestAnimationFrame(syncPwaHistory);
  }, true);

  // Keyboard accessibility: Escape key triggers ordered back navigation
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const handled = window.RVXHandleBackGesture();
      if (handled) event.preventDefault();
    }
  });
}

// Automatically initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRvxNavigation);
} else {
  initRvxNavigation();
}
