import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({});
vm.runInContext(`${read('web/js/ui-model.js')}\nglobalThis.model = RVX_UI;`, context);
const model = context.model;
const patches = [
  { name: 'Hide ads', use: true },
  { name: 'Remove background playback restrictions', use: true },
  { name: 'SponsorBlock', use: true },
  { name: 'Settings for YouTube', use: true },
  { name: 'GmsCore support', use: true },
  { name: 'Spoof signature', use: true },
  { name: 'Enable debug logging', use: false },
  { name: 'Override certificate pinning', use: false }
];
const names = set => [...set].sort();

function engineState(saved = {}) {
  const sandbox = vm.createContext({ window: {}, RVX_STORAGE: { local: { getItem: key => key === 'rvx_morphe_engine_config' ? JSON.stringify(saved) : null } } });
  vm.runInContext(`${read('web/js/state.js')}\nglobalThis.engine = STATE.morpheEngineOptions;`, sandbox);
  return sandbox.engine;
}

test('fresh and legacy configurations stop on patch failure and enforce version compatibility', () => {
  for (const saved of [{}, { continueOnError: true, force: true }]) {
    const engine = engineState(saved);
    assert.equal(engine.continueOnError, false);
    assert.equal(engine.force, false);
  }
});

test('an explicit opt-in under the new execution policy is preserved', () => {
  const engine = engineState({ executionPolicyVersion: 2, continueOnError: true, force: false });
  assert.equal(engine.continueOnError, true);
  assert.equal(engine.force, false);
});

test('recommendation reads use metadata and excludes root-incompatible patches', () => {
  const result = model.preset(patches, 'balanced', 'root');
  assert.deepEqual(names(result), ['Hide ads', 'Remove background playback restrictions', 'Settings for YouTube', 'SponsorBlock'].sort());
});
test('recommendation has an intentional fallback when defaults are absent', () => {
  const result = model.preset(patches.map(({ name }) => ({ name })), 'balanced', 'root');
  assert.ok(result.has('Hide ads'));
  assert.ok(result.has('SponsorBlock'));
  assert.ok(result.has('Settings for YouTube'));
  assert.ok(!result.has('Enable debug logging'));
});
test('minimal preset retains integration requirements and non-root GmsCore', () => {
  const result = model.preset(patches, 'minimal', 'non-root');
  assert.ok(result.has('Settings for YouTube'));
  assert.ok(result.has('GmsCore support'));
  assert.ok(!result.has('SponsorBlock'));
});
test('unrecognized applications do not receive an arbitrary recommendation', () => {
  assert.equal(model.preset([{ name: 'Unrelated feature' }], 'balanced', 'root').size, 0);
});
test('choosing Root cannot verify device root access', () => {
  const report = model.diagnostics(null, { mode: 'root' });
  assert.equal(report.rows.root.state, 'unknown');
  assert.equal(report.state, 'unknown');
});
test('an incomplete response cannot declare the system ready', () => {
  const report = model.diagnostics({ cli_ready: true }, { mode: 'root' });
  assert.equal(report.state, 'unknown');
  assert.equal(report.rows.storage.state, 'unknown');
});
test('missing CLI and insufficient storage remain actionable', () => {
  const report = model.diagnostics({ jre_ready: true, cli_ready: false, root_available: true, storage_available_bytes: 800 }, { mode: 'root' });
  assert.equal(report.state, 'attention');
  assert.equal(report.rows.engine.state, 'attention');
  assert.equal(report.rows.storage.state, 'attention');
});
test('readiness requires verified dependencies for the selected mode', () => {
  const data = { jre_ready: true, cli_ready: true, root_available: false, storage_available_bytes: 3 * 1024 ** 3, microg_installed: true };
  assert.equal(model.diagnostics(data, { mode: 'non-root' }).state, 'ready');
  assert.equal(model.diagnostics(data, { mode: 'root' }).state, 'attention');
});

const state = () => ({ currentApp: { packageName: 'com.google.android.youtube' }, currentSource: 'anddea', patchTag: 'v1', currentVersion: '21.1', targetMode: 'root', selectedPatches: new Set(['Hide ads', 'SponsorBlock']), selectedOptions: { theme: 'dark' }, morpheEngineOptions: { bytecodeMode: 'STRIP_FAST' } });
test('configuration identity is stable across key and patch ordering', () => {
  const a = state();
  const b = state();
  b.selectedPatches = new Set([...a.selectedPatches].reverse());
  assert.equal(model.buildKey(a), model.buildKey(b));
});
test('results are unavailable before success, without a file, or after an edit', () => {
  const current = state();
  const key = model.buildKey(current);
  assert.equal(model.ownsResult({ status: 'running', key, path: '/result.apk' }, key), false);
  assert.equal(model.ownsResult({ status: 'succeeded', key }, key), false);
  const session = { status: 'succeeded', key, path: '/result.apk' };
  assert.equal(model.ownsResult(session, key), true);
  current.patchTag = 'v2';
  assert.equal(model.ownsResult(session, model.buildKey(current)), false);
  current.patchTag = 'v1';
  current.selectedOptions.theme = 'light';
  assert.equal(model.ownsResult(session, model.buildKey(current)), false);
});
test('browser results can be saved only for the input APK that produced them', () => {
  const current = state();
  current.selectedApkFile = { name: 'input.apk', size: 100, lastModified: 1 };
  const session = { status: 'succeeded', key: model.buildKey(current), blob: { size: 200 } };
  assert.equal(model.ownsResult(session, model.buildKey(current)), true);
  current.selectedApkFile.lastModified = 2;
  assert.equal(model.ownsResult(session, model.buildKey(current)), false);
});
test('build lifecycle rejects duplicate starts and completion without an output', () => {
  const current = { ...state(), logHistory: [], buildSession: { status: 'idle' } };
  const runtime = vm.createContext({ STATE: current, document: { getElementById: () => null }, window: {}, setText() {} });
  vm.runInContext(`${read('web/js/ui-model.js')}\n${read('web/js/ui-workflow.js')}`, runtime);
  assert.equal(vm.runInContext('beginBuildSession()', runtime), true);
  assert.equal(vm.runInContext('beginBuildSession()', runtime), false);
  vm.runInContext('finishBuildSession()', runtime);
  assert.equal(current.buildSession.status, 'failed');
  assert.equal(vm.runInContext('hasCurrentBuildResult()', runtime), false);
  vm.runInContext("beginBuildSession(); finishBuildSession({path:'/verified.apk'})", runtime);
  assert.equal(current.buildSession.status, 'succeeded');
  assert.equal(vm.runInContext('hasCurrentBuildResult()', runtime), true);
  current.currentVersion = '22.0';
  assert.equal(vm.runInContext('hasCurrentBuildResult()', runtime), false);
});
test('a failed browser manifest blocks build while leaving configuration work available', () => {
  const current = { ...state(), sources: [], daemonOnline: false, portableEngineManifest: null, buildSession: { status: 'idle' } };
  const runtime = vm.createContext({ STATE: current });
  vm.runInContext(read('web/js/ui-workflow.js'), runtime);
  assert.equal(vm.runInContext('getBuildAvailability().ready', runtime), false);
  current.engineMode = 'local';
  current.daemonOnline = true;
  assert.equal(vm.runInContext('getBuildAvailability().ready', runtime), true);
  current.daemonStatus = { is_patching: true };
  assert.equal(vm.runInContext('getBuildAvailability().ready', runtime), false);
});
test('single HTML inlines formatted HTML script and stylesheet tags', () => {
  const single = read('web/rvx-local.html');
  assert.doesNotMatch(single, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(single, /<link\b[^>]*\brel=["']stylesheet/i);
  assert.match(single, /const RVX_UI =/);
  assert.match(single, /function initWorkflowUI\(/);
});
test('PWA precache contains every script and imported stylesheet used by the shell', () => {
  const cached = new Set([...read('web/sw.js').matchAll(/'\.\/([^']+)'/g)].map(match => match[1]));
  const referenced = new Set();
  const visit = file => {
    if (referenced.has(file)) return;
    referenced.add(file);
    if (file.endsWith('.css')) {
      for (const match of read(`web/${file}`).matchAll(/@import\s+["']([^"'?]+)/g)) {
        visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
      }
    }
  };
  for (const match of read('web/index.html').matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"?]+)(?:\?[^\"]*)?"/g)) {
    if (!match[1].startsWith('data:')) visit(match[1]);
  }
  for (const file of referenced) assert.ok(cached.has(file), `${file} is missing from the offline shell`);
});

test('download consent cannot bypass storage, runtime, APK or unknown-size requirements', () => {
  const plan = { items: [{ state: 'download' }], ready: true, enoughStorage: true, unknownSizeCount: 1 };
  assert.equal(model.canStartDownload(plan), false);
  assert.equal(model.canStartDownload(plan, { acceptedUnknown: true }), true);
  for (const blocked of [{ ready: false }, { enoughStorage: false }]) {
    assert.equal(model.canStartDownload({ ...plan, ...blocked }, { acceptedUnknown: true }), false);
  }
  assert.equal(model.canStartDownload(plan, { acceptedUnknown: true, editingStorage: true }), false);
  assert.equal(model.canStartDownload(plan, { acceptedUnknown: true, browser: true }), false);
  assert.equal(model.canStartDownload(plan, { acceptedUnknown: true, browser: true, hasApk: true }), true);
  assert.equal(model.canStartDownload(null, { acceptedUnknown: true }), false);
  assert.equal(model.canStartDownload({}, { acceptedUnknown: true }), false);
});

function storageContext() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { disabled: false, textContent: '', innerHTML: '', setAttribute() {}, addEventListener() {}, focus() {}, classList: { add() {}, remove() {}, contains() { return false; } } });
    return elements.get(id);
  };
  const pending = [];
  const sandbox = vm.createContext({
    STATE: { storageBrowseKind: 'storage', daemonUrl: 'http://fixture', storageBrowseParent: '/sdcard' },
    document: { getElementById: element },
    AbortController, URLSearchParams, requestAnimationFrame: fn => fn(),
    daemonAuthHeaders: () => ({}), escapeHtml: s => String(s),
    fetch: () => new Promise(resolve => pending.push(resolve)), rendered: []
  });
  vm.runInContext(read('web/js/ui-storage-consent.js') + '\nrenderStorageBrowser = data => rendered.push(data.current);', sandbox);
  return { sandbox, pending, element };
}

test('a slower folder request cannot overwrite the latest navigation', async () => {
  const { sandbox, pending } = storageContext();
  const first = sandbox.fetchStorageDirectory('/sdcard/old');
  const second = sandbox.fetchStorageDirectory('/sdcard/new');
  pending[1]({ ok: true, json: async () => ({ current: '/sdcard/new' }) });
  await second;
  pending[0]({ ok: true, json: async () => ({ current: '/sdcard/old' }) });
  await first;
  assert.deepEqual([...sandbox.rendered], ['/sdcard/new']);
});

test('closing the folder picker discards pending responses', async () => {
  const { sandbox, pending } = storageContext();
  const request = sandbox.fetchStorageDirectory('/sdcard/old');
  sandbox.closeStorageBrowser();
  pending[0]({ ok: true, json: async () => ({ current: '/sdcard/old' }) });
  await request;
  assert.equal(sandbox.rendered.length, 0);
});

test('a denied folder remains an explicit error instead of silently navigating elsewhere', async () => {
  const { sandbox, pending, element } = storageContext();
  const request = sandbox.fetchStorageDirectory('/sdcard/denied');
  pending[0]({ ok: false, status: 403, json: async () => ({ error: 'Access denied' }) });
  await request;
  assert.match(element('storageBrowserList').innerHTML, /Access denied/);
  assert.equal(element('storageBrowserCurrent').textContent, '/sdcard/denied');
  assert.equal(element('btnUseStorageFolder').disabled, true);
  assert.equal(pending.length, 1);
});

test('storage changes invalidate the configuration identity and its old result', () => {
  const current = state();
  current.wizardStorageDraft = { workspace: { type: 'path', path: '/storage/emulated/0/Rvext/Workspace' }, output: { type: 'path', path: '/storage/emulated/0/Rvext/Output' } };
  const key = model.buildKey(current);
  const result = { status: 'succeeded', key, path: '/result.apk' };
  current.wizardStorageDraft.output.path = '/storage/emulated/0/My Output';
  assert.equal(model.ownsResult(result, model.buildKey(current)), false);
});

function reviewContext() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', checked: false, disabled: false, value: '', classList: { add() {}, remove() {}, toggle() {} } });
    return elements.get(id);
  };
  const requests = [];
  const current = { ...state(), wizardStep: 8, engineMode: 'local', wizardStorageValidated: true, sources: [{ id: 'anddea' }], wizardStorageDraft: { workspace: { type: 'path', path: '/Workspace' }, output: { type: 'path', path: '/Output' } }, pendingDownloadPlan: null };
  const context = vm.createContext({
    STATE: current, RVX_UI: model, window: {}, document: { getElementById: element, querySelectorAll: () => [] },
    RVX_STORAGE: { local: { setItem() {} } },
    setText: (id, text) => { element(id).textContent = text; }, escapeHtml: value => String(value),
    getBuildAvailability: () => ({ ready: true }), getMorpheEngineSummaryText: () => 'Persistent',
    updateWizardBuildValidation: () => true, updateWizardNavigationState: () => {}, daemonAuthHeaders: () => ({}),
    createLocalPatchPayload: () => ({ download_plan_id: current.pendingDownloadPlan?.planId || null }),
    savedConfigurations: 0, persistWizardConfiguration: () => { context.savedConfigurations++; return true; },
    fetch: url => new Promise(resolve => requests.push({ url, resolve })),
    started: [], triggerLocalPatch: payload => context.started.push(payload),
    renderDownloadPlanItem: () => '', formatDownloadBytes: value => String(value), console
  });
  vm.runInContext(read('web/js/ui-wizard-flow.js'), context);
  return { context, requests, element };
}

test('review checks metadata only and binds the accepted plan to the final build', async () => {
  const { context, requests, element } = reviewContext();
  const pending = context.prepareWizardReview();
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/downloads\/plan$/);
  assert.equal(context.started.length, 0);
  requests[0].resolve({ ok: true, json: async () => ({ planId: 'review-1', expiresAt: Math.floor(Date.now() / 1000) + 600, items: [{ label: 'APK', state: 'required' }], unknownSizeCount: 1 }) });
  await pending;
  assert.equal(context.isWizardReviewReady(), false);
  context.startReviewedBuild();
  assert.equal(context.started.length, 0);
  element('checkUnknownSizeConsent').checked = true;
  assert.equal(context.isWizardReviewReady(), true);
  context.startReviewedBuild();
  assert.equal(context.started.length, 1);
  assert.equal(context.started[0].download_plan_id, 'review-1');
  assert.equal(context.savedConfigurations, 1);
});

test('changing folders while review is in flight discards the obsolete plan', async () => {
  const { context, requests } = reviewContext();
  const pending = context.prepareWizardReview();
  context.setWizardStorageFolder('output', { type: 'path', path: '/New Output' });
  requests[0].resolve({ ok: true, json: async () => ({ planId: 'old', items: [{ label: 'APK' }] }) });
  await pending;
  assert.equal(context.STATE.pendingDownloadPlan, null);
  assert.equal(context.STATE.wizardStorageValidated, false);
  assert.equal(context.isWizardReviewReady(), false);
});

test('an expired review cannot start a build', async () => {
  const { context, requests } = reviewContext();
  const pending = context.prepareWizardReview();
  requests[0].resolve({ ok: true, json: async () => ({ planId: 'expired', expiresAt: 1, items: [{ label: 'APK' }] }) });
  await pending;
  context.startReviewedBuild();
  assert.equal(context.started.length, 0);
});

test('configuration-only review lists requirements without downloading resources', async () => {
  const { context, requests, element } = reviewContext();
  context.getBuildAvailability = () => ({ ready: false });
  context.getSourceDisplayName = () => 'Anddea';
  await context.prepareWizardReview();
  assert.equal(requests.length, 0);
  assert.equal(context.STATE.pendingDownloadPlan, null);
  assert.equal(context.isWizardReviewReady(), false);
  assert.match(element('downloadPlanTotal').textContent, /belum ada unduhan/);
  context.startReviewedBuild();
  assert.equal(context.started.length, 0);
});

test('a missing stock APK is diagnosed as an input dependency, never as a dev release failure', () => {
  const diagnosis = model.failureDiagnosis('Patching failed with error: Stock APK untuk com.google.android.youtube (v21.13.164) tidak ditemukan.');
  assert.equal(diagnosis.category, 'dependency');
  assert.equal(diagnosis.dependency, 'apk');
  assert.equal(diagnosis.title, 'APK asli belum siap');
  assert.doesNotMatch(diagnosis.explanation, /beta|dev|smali/);
});

test('structured dependency failures preserve their precise code and message', () => {
  const event = { dependency: 'java', code: 'java_unavailable', message: 'Java 17 terdeteksi; diperlukan Java 21' };
  const diagnosis = model.failureDiagnosis('DEPENDENCY_ERROR|' + JSON.stringify(event));
  assert.equal(diagnosis.code, event.code);
  assert.equal(diagnosis.message, event.message);
  assert.equal(diagnosis.dependency, 'java');
});

test('unknown failures do not invent a patch compatibility explanation', () => {
  assert.equal(model.failureDiagnosis('Process exited with code 1').category, 'unknown');
  assert.equal(model.failureDiagnosis('Patch fingerprint not found').category, 'compatibility');
});

test('a present runtime is not marked ready before an execution check', () => {
  const report = model.diagnostics({ jre_ready: false, jre_present: true, cli_ready: false, cli_present: true }, { mode: 'root' });
  assert.equal(report.rows.jre.state, 'attention');
  assert.equal(report.rows.jre.text, 'Perlu diperiksa');
  assert.equal(report.rows.engine.state, 'attention');
});
