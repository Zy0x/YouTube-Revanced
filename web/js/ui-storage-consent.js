/* Directory browser fallback for WebUI hosts without a native picker. */
let storageBrowseRequest = 0;
let storageBrowseController = null;
function storageSpaceText(bytes) {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0
    ? `${formatDownloadBytes(bytes)} tersedia` : 'Ruang tersedia belum diketahui';
}
function closeStorageBrowser() {
  storageBrowseRequest++;
  storageBrowseController?.abort();
  document.getElementById('storageBrowserModal')?.classList.add('hidden');
  const returnId = STATE.storageBrowseReturnFocusId;
  STATE.storageBrowseKind = '';
  STATE.storageBrowsePath = '';
  STATE.storageBrowseParent = '';
  if (returnId) requestAnimationFrame(() => document.getElementById(returnId)?.focus({ preventScroll: true }));
}

function renderStorageBrowser(data) {
  const roots = document.getElementById('storageBrowserRoots');
  const list = document.getElementById('storageBrowserList');
  const current = document.getElementById('storageBrowserCurrent');
  const status = document.getElementById('storageBrowserStatus');
  const upButton = document.getElementById('btnStorageBrowserUp');
  const useButton = document.getElementById('btnUseStorageFolder');
  if (!roots || !list || !current || !upButton || !useButton) return;

  STATE.storageBrowsePath = data.current || '';
  STATE.storageBrowseParent = data.parent || '';
  roots.innerHTML = (data.roots || []).map(root => `<button type="button" class="storage-root-chip" data-storage-path="${escapeHtml(root.path)}" title="${escapeHtml(root.path)}" aria-label="Buka ${escapeHtml(root.path)}" ${root.path === data.current ? 'aria-current="location"' : ''}>${escapeHtml(root.name || root.path)}</button>`).join('');
  current.textContent = data.current || 'Pilih lokasi utama';
  current.title = data.current || '';
  upButton.disabled = !data.parent;
  useButton.disabled = !data.canSelect || !data.current;
  if (status) status.textContent = data.current ? data.canSelect ? storageSpaceText(data.availableBytes) : 'Folder ini hanya dapat dibaca. Pilih folder yang dapat ditulis.' : 'Pilih lokasi untuk melihat folder.';

  const directories = Array.isArray(data.directories) ? data.directories : [];
  const search = document.getElementById('storageFolderSearch');
  if (search) search.disabled = !data.current || !directories.length;
  list.innerHTML = data.current
    ? directories.length
      ? directories.map(directory => `<button type="button" class="storage-folder-row" data-storage-path="${escapeHtml(directory.path)}">
          <span class="storage-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z"/></svg></span>
          <span><strong>${escapeHtml(directory.name)}</strong>${directory.writable === false ? '<small>Hanya baca</small>' : ''}</span>
          <span aria-hidden="true">›</span>
        </button>`).join('')
      : '<div class="storage-browser-empty"><strong>Folder ini tidak memiliki subfolder</strong><small>Anda tetap dapat memilih folder saat ini.</small></div>'
    : '<div class="storage-browser-empty"><strong>Pilih lokasi utama</strong><small>Hanya folder yang ditampilkan di sini.</small></div>';

  list.scrollTop = 0;
  list.setAttribute('aria-busy', 'false');
  document.getElementById('storageFolderSearch').value = '';
  filterStorageFolders();

  roots.querySelectorAll('[data-storage-path]').forEach(button => button.addEventListener('click', () => fetchStorageDirectory(button.dataset.storagePath)));
  list.querySelectorAll('[data-storage-path]').forEach(button => button.addEventListener('click', () => fetchStorageDirectory(button.dataset.storagePath)));
}

function filterStorageFolders() {
  const query = document.getElementById('storageFolderSearch')?.value.trim().toLocaleLowerCase() || '';
  const rows = [...document.querySelectorAll('#storageBrowserList .storage-folder-row')];
  let shown = 0;
  rows.forEach(row => {
    const match = row.querySelector('strong').textContent.toLocaleLowerCase().includes(query);
    row.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  const count = document.getElementById('storageFolderCount');
  if (count) count.textContent = query ? `${shown} dari ${rows.length} folder` : `${rows.length} folder`;
  document.getElementById('storageFolderNoResults')?.classList.toggle('hidden', !query || shown > 0);
}

async function fetchStorageDirectory(path = '') {
  const previousPath = STATE.storageBrowsePath;
  const request = ++storageBrowseRequest;
  storageBrowseController?.abort();
  storageBrowseController = new AbortController();
  const list = document.getElementById('storageBrowserList');
  const status = document.getElementById('storageBrowserStatus');
  const useButton = document.getElementById('btnUseStorageFolder');
  if (list) list.innerHTML = '<div class="storage-browser-empty"><span class="morphe-spinner"></span><strong>Membaca folder…</strong></div>';
  if (status) status.textContent = 'Daemon sedang membaca daftar folder lokal.';
  if (useButton) useButton.disabled = true;
  document.getElementById('btnStorageBrowserUp').disabled = true;
  document.getElementById('storageFolderNoResults')?.classList.add('hidden');
  if (list) list.setAttribute('aria-busy', 'true');
  const search = document.getElementById('storageFolderSearch');
  if (search) search.disabled = true;
  const count = document.getElementById('storageFolderCount');
  if (count) count.textContent = '';
  const params = new URLSearchParams({ kind: STATE.storageBrowseKind });
  if (path) params.set('path', path);
  try {
    const response = await fetch(`${STATE.daemonUrl}/api/v1/storage/browse?${params}`, { headers: daemonAuthHeaders(), signal: storageBrowseController.signal });
    const data = await response.json().catch(() => ({}));
    if (request !== storageBrowseRequest || !STATE.storageBrowseKind) return;
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderStorageBrowser(data);
  } catch (error) {
    if (request !== storageBrowseRequest || error.name === 'AbortError') return;
    STATE.storageBrowsePath = '';
    if (previousPath) STATE.storageBrowseParent = previousPath;
    if (list) {
      list.setAttribute('aria-busy', 'false');
      list.innerHTML = `<div class="storage-browser-empty is-error"><strong>Folder tidak dapat dibuka</strong><small>${escapeHtml(error.message)}</small><button type="button" class="btn-clean-ghost" id="btnRetryStorageBrowse">Coba lagi</button></div>`;
      document.getElementById('btnRetryStorageBrowse')?.addEventListener('click', () => fetchStorageDirectory(path));
    }
    const current = document.getElementById('storageBrowserCurrent');
    if (current) current.textContent = path || 'Pilih lokasi utama';
    document.getElementById('btnStorageBrowserUp').disabled = !STATE.storageBrowseParent;
    if (status) status.textContent = 'Coba lagi atau pilih lokasi lain di atas.';
  }
}

async function openStorageBrowser(kind = 'workspace') {
  if (!['workspace', 'output'].includes(kind) || !STATE.daemonOnline) return;
  STATE.storageBrowseKind = kind;
  STATE.storageBrowseReturnFocusId = kind === 'workspace' ? 'btnPickWizardWorkspace' : 'btnPickWizardOutput';
  const title = document.getElementById('storageBrowserTitle');
  if (title) title.textContent = `Pilih folder ${kind === 'workspace' ? 'Workspace' : 'Output'}`;
  document.getElementById('storageBrowserModal')?.classList.remove('hidden');
  const rootRequest = storageBrowseRequest + 1;
  await fetchStorageDirectory('');
  const initial = STATE.wizardStorageDraft?.[kind]?.path;
  if (storageBrowseRequest === rootRequest && STATE.storageBrowseKind && initial) await fetchStorageDirectory(initial);
}
function useSelectedStorageFolder() {
  if (!STATE.storageBrowsePath || document.getElementById('btnUseStorageFolder')?.disabled) return;
  setWizardStorageFolder(STATE.storageBrowseKind, { path: STATE.storageBrowsePath, label: STATE.storageBrowsePath, type: 'path' });
  closeStorageBrowser();
}
