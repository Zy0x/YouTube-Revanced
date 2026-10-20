/* Browser-local RVX Portable engine coordinator. No native/localhost fallback. */
(function initializeLocalEngine() {
  const ENGINE_MANIFEST_URL = 'engine/v1/manifest.json';
  let engineManifest = null;
  let manifestPromise = null;
  let activeWorker = null;

  function decodeBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function verifySignedArtifactManifest(manifest) {
    if (!manifest?.signedPayload || !manifest?.signature || !engineManifest?.registryPublicKey) {
      throw new Error('Artefak portable tidak memiliki signature registry');
    }
    const publicKey = await crypto.subtle.importKey(
      'raw',
      decodeBase64(engineManifest.registryPublicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      decodeBase64(manifest.signature),
      new TextEncoder().encode(manifest.signedPayload)
    );
    if (!valid) throw new Error('Signature artefak portable tidak valid');
    const payload = JSON.parse(manifest.signedPayload);
    if (payload.sha256 !== manifest.sha256 || payload.size !== manifest.size) {
      throw new Error('Payload signature tidak cocok dengan artefak');
    }
    return true;
  }

  async function loadManifest({ refresh = false } = {}) {
    if (engineManifest && !refresh) return engineManifest;
    if (manifestPromise && !refresh) return manifestPromise;
    manifestPromise = (async () => {
      const suffix = refresh ? `?refresh=${Date.now()}` : '';
      const response = await fetch(`${ENGINE_MANIFEST_URL}${suffix}`, { cache: refresh ? 'reload' : 'default' });
      if (!response.ok) throw new Error(`Manifest mesin lokal tidak tersedia (HTTP ${response.status})`);
      const data = await response.json();
      if (data.schemaVersion !== 1) throw new Error('Versi manifest mesin tidak didukung');
      engineManifest = data;
      return data;
    })().finally(() => { manifestPromise = null; });
    return manifestPromise;
  }

  function resolveReleaseCapability(source, release) {
    const portable = release?.capabilities?.portable
      || release?.portable
      || source?.capabilities?.portable
      || source?.portable
      || { available: false };
    const nativeMpp = release?.capabilities?.nativeMpp
      || release?.nativeMpp
      || source?.capabilities?.nativeMpp
      || source?.nativeMpp
      || { available: Boolean(source?.bundleUrl) };
    return {
      portable: {
        available: portable.available === true,
        artifactManifestUrl: portable.artifactManifestUrl || '',
        artifactHash: portable.artifactHash || '',
        engineApiVersion: portable.engineApiVersion || '',
        patchCoverage: Number(portable.patchCoverage || 0),
        verifiedAt: portable.verifiedAt || ''
      },
      nativeMpp: {
        available: nativeMpp.available !== false && Boolean(nativeMpp.url || source?.bundleUrl),
        url: nativeMpp.url || source?.bundleUrl || '',
        sha256: nativeMpp.sha256 || ''
      }
    };
  }

  async function getStatus(source, release) {
    const runtime = await rvxDetectCapabilities();
    const capabilities = resolveReleaseCapability(source, release);
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (error) {
      return { ready: false, code: 'engine-manifest-unavailable', reason: error.message, runtime, capabilities };
    }
    if (!runtime.browserPatchPrerequisites) {
      return {
        ready: false,
        code: 'browser-unsupported',
        reason: 'Browser ini belum menyediakan WebAssembly, Worker, WebCrypto, dan penyimpanan lokal yang diperlukan.',
        runtime,
        capabilities,
        manifest
      };
    }
    if (manifest.available !== true) {
      return {
        ready: false,
        code: 'engine-unavailable',
        reason: manifest.statusMessage || 'Mesin patch portable belum diterbitkan.',
        runtime,
        capabilities,
        manifest
      };
    }
    if (!capabilities.portable.available) {
      return {
        ready: false,
        code: 'release-native-only',
        reason: 'Release source ini belum memiliki artefak portable terverifikasi dan hanya dapat dibangun melalui Root WebUI.',
        runtime,
        capabilities,
        manifest
      };
    }
    if (capabilities.portable.engineApiVersion !== manifest.apiVersion) {
      return {
        ready: false,
        code: 'engine-api-mismatch',
        reason: 'Artefak patch membutuhkan versi mesin lokal yang berbeda.',
        runtime,
        capabilities,
        manifest
      };
    }
    return { ready: true, code: 'ready', reason: '', runtime, capabilities, manifest };
  }

  async function loadArtifactManifest(url) {
    if (!url) throw new Error('Manifest artefak portable tidak dicantumkan oleh release');
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`Manifest artefak gagal dimuat (HTTP ${response.status})`);
    const manifest = await response.json();
    RVX_ARTIFACT_STORE.validateManifest(manifest);
    await verifySignedArtifactManifest(manifest);
    return manifest;
  }

  async function preflight({ source, release, apkSize = 0 } = {}) {
    const status = await getStatus(source, release);
    const estimate = status.runtime?.storageEstimate || null;
    if (!status.ready) {
      return {
        ...status,
        knownDownloadBytes: 0,
        unknownSizeCount: 0,
        items: [
          { label: 'Mesin patch browser', state: 'unavailable', downloadBytes: 0, storedBytes: 0, destination: 'Penyimpanan privat browser' },
          { label: 'Artefak source', state: 'native-only', downloadBytes: 0, storedBytes: 0, destination: 'Belum tersedia untuk browser' }
        ],
        storage: estimate
      };
    }
    const variant = status.runtime.supportsThreads
      ? status.manifest.variants?.threaded
      : status.manifest.variants?.singleThread;
    if (!variant?.artifactManifestUrl) throw new Error('Varian mesin yang sesuai tidak tersedia');
    const [engineArtifact, patchArtifact] = await Promise.all([
      loadArtifactManifest(variant.artifactManifestUrl),
      loadArtifactManifest(status.capabilities.portable.artifactManifestUrl)
    ]);
    const [engineCached, patchCached] = await Promise.all([
      RVX_ARTIFACT_STORE.isArtifactReady(engineArtifact),
      RVX_ARTIFACT_STORE.isArtifactReady(patchArtifact)
    ]);
    const temporaryBytes = Math.ceil((Number(apkSize || 0) * 2.25) + engineArtifact.size + patchArtifact.size);
    const availableBytes = Number(estimate?.quota || 0) - Number(estimate?.usage || 0);
    return {
      ...status,
      engineArtifact,
      patchArtifact,
      storage: estimate,
      availableBytes,
      temporaryBytes,
      enoughStorage: !availableBytes || availableBytes >= temporaryBytes,
      knownDownloadBytes: (engineCached ? 0 : engineArtifact.size) + (patchCached ? 0 : patchArtifact.size),
      unknownSizeCount: 0,
      items: [
        {
          label: 'Mesin patch browser',
          state: engineCached ? 'cached' : 'download',
          downloadBytes: engineCached ? 0 : engineArtifact.size,
          storedBytes: engineCached ? engineArtifact.size : 0,
          destination: 'Penyimpanan privat browser'
        },
        {
          label: 'Artefak source terverifikasi',
          state: patchCached ? 'cached' : 'download',
          downloadBytes: patchCached ? 0 : patchArtifact.size,
          storedBytes: patchCached ? patchArtifact.size : 0,
          destination: 'Penyimpanan privat browser'
        },
        {
          label: 'Ruang sementara APK',
          state: 'generated',
          downloadBytes: 0,
          storedBytes: temporaryBytes,
          destination: 'Dihapus setelah proses'
        }
      ]
    };
  }

  async function prepare(plan, onProgress, signal) {
    if (!plan?.ready || !plan.engineArtifact || !plan.patchArtifact) throw new Error(plan?.reason || 'Rencana browser belum siap');
    if (plan.enoughStorage === false) throw new Error('Ruang penyimpanan browser tidak mencukupi');
    await rvxDetectCapabilities({ requestPersistence: true });
    const engineBlob = await RVX_ARTIFACT_STORE.downloadArtifact(plan.engineArtifact, {
      signal,
      onProgress: progress => onProgress?.({ artifact: 'engine', ...progress })
    });
    const patchBlob = await RVX_ARTIFACT_STORE.downloadArtifact(plan.patchArtifact, {
      signal,
      onProgress: progress => onProgress?.({ artifact: 'patch', ...progress })
    });
    return { engineBlob, patchBlob };
  }

  function workerUrl() {
    if (window.__RVX_ENGINE_WORKER_SOURCE__) {
      return URL.createObjectURL(new Blob([window.__RVX_ENGINE_WORKER_SOURCE__], { type: 'text/javascript' }));
    }
    return 'workers/rvx-engine-worker.js';
  }

  async function run({ plan, apkFile, job, onProgress, signal }) {
    if (!(apkFile instanceof Blob)) throw new Error('Pilih APK target terlebih dahulu');
    const prepared = await prepare(plan, onProgress, signal);
    const url = workerUrl();
    const worker = new Worker(url);
    activeWorker = worker;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.terminate();
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        if (activeWorker === worker) activeWorker = null;
      };
      signal?.addEventListener('abort', () => {
        cleanup();
        reject(new DOMException('Proses dibatalkan', 'AbortError'));
      }, { once: true });
      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === 'progress') onProgress?.(message.detail);
        if (message.type === 'result') {
          cleanup();
          resolve(new Blob([message.buffer], { type: 'application/vnd.android.package-archive' }));
        }
        if (message.type === 'error') {
          cleanup();
          reject(new Error(message.error || 'Mesin patch browser gagal'));
        }
      };
      worker.onerror = event => {
        cleanup();
        reject(new Error(event.message || 'Worker mesin patch berhenti'));
      };
      Promise.all([
        prepared.engineBlob.arrayBuffer(),
        prepared.patchBlob.arrayBuffer(),
        apkFile.arrayBuffer()
      ]).then(([engineBuffer, patchBuffer, apkBuffer]) => {
        worker.postMessage({
          type: 'run',
          engineBuffer,
          patchBuffer,
          apkBuffer,
          job
        }, [engineBuffer, patchBuffer, apkBuffer]);
      }).catch(error => {
        cleanup();
        reject(error);
      });
    });
  }

  function cancel() {
    activeWorker?.terminate();
    activeWorker = null;
  }

  window.RVX_LOCAL_ENGINE = Object.freeze({
    loadManifest,
    resolveReleaseCapability,
    getStatus,
    preflight,
    prepare,
    run,
    cancel
  });
})();
