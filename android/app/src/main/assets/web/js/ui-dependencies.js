/* Structured preparation events are separate from actual patch execution. */
function renderBuildDependencies() {
  const list = document.getElementById('buildDependencyList');
  if (!list) return;
  const labels = { apk: 'APK asli', java: 'Java Runtime', cli: 'Mesin Morphe', bundle: 'Bundle patch' };
  const states = { waiting: 'Menunggu', checking: 'Memeriksa', preparing: 'Menyiapkan', downloading: 'Mengunduh', retrying: 'Mengulang unduhan', invalid: 'Perlu diperbaiki', ready: 'Terverifikasi', failed: 'Belum siap' };
  list.innerHTML = Object.entries(labels).map(([key, label]) => {
    const phase = STATE.buildSession?.resources?.[key] || 'waiting';
    return `<li data-state="${escapeHtml(phase)}"><span>${label}</span><strong>${states[phase] || phase}</strong></li>`;
  }).join('');
  document.getElementById('buildDependencyPanel')?.classList.remove('hidden');
}

function resetBuildDependencies() {
  STATE.buildSession.phase = 'preparing';
  STATE.buildSession.resources = {};
  setText('progressProcessTitle', 'Menyiapkan resource');
  setText('buildDependencyTitle', 'Kesiapan resource');
  setText('buildDependencyDetail', 'Patch dimulai setelah APK, Java, mesin, dan bundle lolos pemeriksaan.');
  renderBuildDependencies();
}

function processDependencyEvent(line) {
  if (line.startsWith('DEPENDENCY_STATUS|')) {
    const [, kind, phase, ...detail] = line.split('|');
    const key = kind === 'jre' ? 'java' : kind;
    STATE.buildSession.resources ||= {};
    STATE.buildSession.resources[key] = phase;
    renderBuildDependencies();
    setText('buildDependencyDetail', detail.join('|'));
    setText('progressStatusSub', detail.join('|'));
    appendTerminalLog(detail.join('|'), phase === 'invalid' ? '!' : 'I');
    return true;
  }
  if (line.startsWith('DEPENDENCIES_READY|')) {
    STATE.buildSession.phase = 'prepared';
    setLocalBuildProgress(35, 'Seluruh resource terverifikasi');
    setText('progressProcessTitle', 'Resource siap');
    setText('buildDependencyDetail', 'Seluruh resource lolos pemeriksaan. Mesin build siap dijalankan.');
    return true;
  }
  if (line.startsWith('PIPELINE_STAGE|patch|')) {
    STATE.buildSession.phase = 'patching';
    setText('progressProcessTitle', 'Proses patch');
    setLocalBuildProgress(40, 'Menerapkan fitur patch');
    return true;
  }
  if (line.startsWith('DEPENDENCY_ERROR|')) {
    let issue;
    try { issue = JSON.parse(line.slice(17)); } catch (_) { issue = { message: line }; }
    const diagnosis = RVX_UI.failureDiagnosis(issue);
    STATE.buildSession.resources ||= {};
    if (diagnosis.dependency) STATE.buildSession.resources[diagnosis.dependency] = 'failed';
    failBuildSession(diagnosis.message);
    renderBuildDependencies();
    setText('buildDependencyTitle', 'Resource belum siap');
    setText('buildDependencyDetail', diagnosis.message);
    setText('progressStatusSub', STATE.buildSession.phase === 'patching' ? 'Proses terhenti. Periksa penyebabnya.' : 'Persiapan resource terhenti. Patch belum dimulai.');
    window.RVXNativeBridge?.setKeepScreenOn?.(false);
    STATE.eventSource?.close();
    openSmartRecoveryModal({ error: issue });
    return true;
  }
  return false;
}
