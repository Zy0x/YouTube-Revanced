/* RVX runtime boundary for hosted PWA, standalone HTML, and Root WebUI. */
(function initializeUniversalRuntime() {
  function safeStorage(name) {
    const memory = new Map();
    let nativeStorage = null;
    try {
      nativeStorage = window[name];
      const probe = `__rvx_probe_${Date.now()}`;
      nativeStorage.setItem(probe, '1');
      nativeStorage.removeItem(probe);
    } catch (_) {
      nativeStorage = null;
    }
    return {
      getItem(key) {
        try { return nativeStorage ? nativeStorage.getItem(key) : (memory.get(key) ?? null); }
        catch (_) { return memory.get(key) ?? null; }
      },
      setItem(key, value) {
        const text = String(value);
        memory.set(key, text);
        try { nativeStorage?.setItem(key, text); } catch (_) {}
      },
      removeItem(key) {
        memory.delete(key);
        try { nativeStorage?.removeItem(key); } catch (_) {}
      }
    };
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const explicitDistribution = window.__RVX_DISTRIBUTION__
    || document.querySelector('meta[name="rvx-distribution"]')?.content;
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const distribution = explicitDistribution
    || (protocol === 'file:' ? 'standalone' : loopback ? 'root-webui' : 'hosted');
  const userAgent = navigator.userAgent || '';
  const platform = /iPad|iPhone|iPod/.test(userAgent) ? 'ios'
    : /Android/.test(userAgent) ? 'android'
      : 'desktop';
  const isStandalone = distribution === 'standalone' || distribution === 'single-html' || protocol === 'file:';
  const isRootWebUI = distribution === 'root-webui';

  window.RVX_STORAGE = Object.freeze({
    local: safeStorage('localStorage'),
    session: safeStorage('sessionStorage')
  });

  const runtime = {
    distribution: isStandalone ? 'standalone' : distribution,
    protocol,
    platform,
    isSingleFile: isStandalone,
    isStandalone,
    isRootWebUI,
    isHosted: distribution === 'hosted',
    isFileProtocol: protocol === 'file:',
    allowsNativeBridge: isRootWebUI,
    supportsWasm: typeof WebAssembly === 'object',
    supportsWorker: typeof Worker === 'function',
    supportsIndexedDB: typeof indexedDB === 'object',
    supportsOPFS: Boolean(navigator.storage?.getDirectory),
    supportsPersistentStorage: typeof navigator.storage?.persist === 'function',
    supportsNativeSavePicker: typeof window.showSaveFilePicker === 'function',
    supportsDirectoryPicker: typeof window.showDirectoryPicker === 'function',
    supportsShareFiles: typeof navigator.share === 'function' && typeof navigator.canShare === 'function',
    supportsWebCrypto: Boolean(window.crypto?.subtle),
    supportsThreads: Boolean(window.crossOriginIsolated && typeof SharedArrayBuffer === 'function'),
    storageEstimate: null,
    persistentStorage: false,
    browserPatchPrerequisites: false,
    checkedAt: 0
  };

  window.RVX_RUNTIME = runtime;

  window.rvxDetectCapabilities = async function rvxDetectCapabilities({ requestPersistence = false } = {}) {
    runtime.supportsOPFS = Boolean(navigator.storage?.getDirectory);
    runtime.supportsThreads = Boolean(window.crossOriginIsolated && typeof SharedArrayBuffer === 'function');
    try {
      runtime.storageEstimate = await navigator.storage?.estimate?.() || null;
    } catch (_) {
      runtime.storageEstimate = null;
    }
    try {
      runtime.persistentStorage = Boolean(await navigator.storage?.persisted?.());
      if (requestPersistence && !runtime.persistentStorage) {
        runtime.persistentStorage = Boolean(await navigator.storage?.persist?.());
      }
    } catch (_) {
      runtime.persistentStorage = false;
    }
    runtime.browserPatchPrerequisites = Boolean(
      runtime.supportsWasm
      && runtime.supportsWorker
      && runtime.supportsIndexedDB
      && runtime.supportsWebCrypto
      && (runtime.supportsOPFS || typeof Blob === 'function')
    );
    runtime.checkedAt = Date.now();
    window.dispatchEvent(new CustomEvent('rvx:runtime-capabilities', { detail: { ...runtime } }));
    return runtime;
  };

  window.rvxTimeoutSignal = function rvxTimeoutSignal(milliseconds) {
    if (typeof window.AbortSignal?.timeout === 'function') return window.AbortSignal.timeout(milliseconds);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  };

  window.rvxSaveBlob = async function rvxSaveBlob(blob, suggestedName, mimeType = blob.type || 'application/octet-stream') {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const extension = '.' + suggestedName.split('.').pop();
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'RVX output', accept: { [mimeType]: [extension] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { method: 'file-picker' };
      } catch (error) {
        if (error?.name === 'AbortError') return { method: 'cancelled' };
      }
    }

    const file = new File([blob], suggestedName, { type: mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: suggestedName });
        return { method: 'share-sheet' };
      } catch (error) {
        if (error?.name === 'AbortError') return { method: 'cancelled' };
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { method: 'download' };
  };
})();
