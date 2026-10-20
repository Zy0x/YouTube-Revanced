/* Content-addressed browser storage and resumable verified downloads. */
(function initializeArtifactStore() {
  const DB_NAME = 'rvx-local-v1';
  const DB_VERSION = 1;
  const ARTIFACT_STORE = 'artifacts';
  const CHUNK_STORE = 'chunks';
  const SETTINGS_STORE = 'settings';

  function bytesToHex(bytes) {
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  async function sha256(value) {
    const buffer = value instanceof ArrayBuffer ? value : await value.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return bytesToHex(new Uint8Array(hash));
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ARTIFACT_STORE)) {
          database.createObjectStore(ARTIFACT_STORE, { keyPath: 'hash' });
        }
        if (!database.objectStoreNames.contains(CHUNK_STORE)) {
          const chunks = database.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
          chunks.createIndex('artifactHash', 'artifactHash', { unique: false });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Penyimpanan lokal tidak dapat dibuka'));
    });
  }

  async function transact(storeName, mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      try {
        request = operation(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        const result = request && 'result' in request ? request.result : undefined;
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        const error = transaction.error || new Error('Operasi penyimpanan lokal gagal');
        database.close();
        reject(error);
      };
      transaction.onabort = transaction.onerror;
    });
  }

  const db = {
    get(store, key) { return transact(store, 'readonly', objectStore => objectStore.get(key)); },
    put(store, value) { return transact(store, 'readwrite', objectStore => objectStore.put(value)); },
    delete(store, key) { return transact(store, 'readwrite', objectStore => objectStore.delete(key)); },
    getAllByIndex(store, index, key) {
      return transact(store, 'readonly', objectStore => objectStore.index(index).getAll(key));
    }
  };

  async function getOpfsFileHandle(hash, { create = false } = {}) {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    const rvx = await root.getDirectoryHandle('rvx', { create });
    const artifacts = await rvx.getDirectoryHandle('artifacts', { create });
    return artifacts.getFileHandle(`${String(hash).replace(/[^a-f0-9]/gi, '')}.bin`, { create });
  }

  function validateManifest(manifest) {
    if (!manifest || manifest.schemaVersion !== 1) throw new Error('Schema artefak tidak didukung');
    if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 || '')) throw new Error('Hash artefak tidak valid');
    if (!Array.isArray(manifest.chunks) || manifest.chunks.length === 0) throw new Error('Manifest tidak memiliki chunk');
    let expectedOffset = 0;
    manifest.chunks.forEach((chunk, index) => {
      if (!chunk || !chunk.url || !/^[a-f0-9]{64}$/i.test(chunk.sha256 || '')) {
        throw new Error(`Metadata chunk ${index + 1} tidak valid`);
      }
      if (!Number.isSafeInteger(chunk.size) || chunk.size <= 0) {
        throw new Error(`Ukuran chunk ${index + 1} tidak valid`);
      }
      if (chunk.offset !== undefined && chunk.offset !== expectedOffset) {
        throw new Error(`Offset chunk ${index + 1} tidak berurutan`);
      }
      expectedOffset += chunk.size;
    });
    if (Number.isSafeInteger(manifest.size) && manifest.size !== expectedOffset) {
      throw new Error('Total ukuran artefak tidak cocok dengan daftar chunk');
    }
    return manifest;
  }

  async function isArtifactReady(manifest) {
    validateManifest(manifest);
    const record = await db.get(ARTIFACT_STORE, manifest.sha256);
    if (!record || record.state !== 'ready' || record.size !== manifest.size) return false;
    if (record.storage === 'opfs') {
      try {
        const handle = await getOpfsFileHandle(manifest.sha256);
        const file = await handle.getFile();
        return file.size === manifest.size;
      } catch (_) {
        return false;
      }
    }
    const chunks = await db.getAllByIndex(CHUNK_STORE, 'artifactHash', manifest.sha256);
    return chunks.length === manifest.chunks.length;
  }

  async function removeArtifact(hash) {
    const chunks = await db.getAllByIndex(CHUNK_STORE, 'artifactHash', hash).catch(() => []);
    await Promise.all(chunks.map(chunk => db.delete(CHUNK_STORE, chunk.key)));
    await db.delete(ARTIFACT_STORE, hash).catch(() => {});
    try {
      const root = await navigator.storage?.getDirectory?.();
      const rvx = await root?.getDirectoryHandle('rvx');
      const artifacts = await rvx?.getDirectoryHandle('artifacts');
      await artifacts?.removeEntry(`${String(hash).replace(/[^a-f0-9]/gi, '')}.bin`);
    } catch (_) {}
  }

  async function fetchChunk(manifest, chunk, index, signal, onProgress) {
    const key = `${manifest.sha256}:${index}`;
    const cached = await db.get(CHUNK_STORE, key).catch(() => null);
    if (cached?.sha256 === chunk.sha256 && cached?.blob?.size === chunk.size) {
      onProgress?.({ phase: 'download', index, received: chunk.size, total: chunk.size, cached: true });
      return cached.blob;
    }
    const response = await fetch(chunk.url, { signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`Chunk ${index + 1} gagal diunduh (HTTP ${response.status})`);
    const reader = response.body?.getReader();
    let received = 0;
    let blob;
    if (reader) {
      const pieces = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        received += value.byteLength;
        onProgress?.({ phase: 'download', index, received, total: chunk.size, cached: false });
      }
      blob = new Blob(pieces, { type: 'application/octet-stream' });
    } else {
      blob = await response.blob();
      received = blob.size;
      onProgress?.({ phase: 'download', index, received, total: chunk.size, cached: false });
    }
    if (blob.size !== chunk.size) throw new Error(`Ukuran chunk ${index + 1} tidak cocok`);
    const actualHash = await sha256(blob);
    if (actualHash.toLowerCase() !== chunk.sha256.toLowerCase()) {
      throw new Error(`Hash chunk ${index + 1} tidak cocok`);
    }
    await db.put(CHUNK_STORE, { key, artifactHash: manifest.sha256, index, sha256: actualHash, blob });
    return blob;
  }

  async function downloadArtifact(rawManifest, { signal, onProgress } = {}) {
    const manifest = validateManifest(rawManifest);
    if (await isArtifactReady(manifest)) {
      onProgress?.({ phase: 'ready', received: manifest.size, total: manifest.size, cached: true });
      return getArtifactBlob(manifest);
    }
    await db.put(ARTIFACT_STORE, {
      hash: manifest.sha256,
      state: 'downloading',
      size: manifest.size,
      kind: manifest.kind || 'artifact',
      updatedAt: Date.now()
    });

    const concurrency = navigator.connection?.saveData ? 1 : 3;
    const blobs = new Array(manifest.chunks.length);
    let cursor = 0;
    let completedBytes = 0;
    async function worker() {
      while (cursor < manifest.chunks.length) {
        const index = cursor++;
        const chunk = manifest.chunks[index];
        blobs[index] = await fetchChunk(manifest, chunk, index, signal, progress => {
          const current = blobs.reduce((sum, item) => sum + (item?.size || 0), 0);
          onProgress?.({ ...progress, artifactReceived: completedBytes + progress.received, artifactTotal: manifest.size, verifiedBytes: current });
        });
        completedBytes += blobs[index].size;
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, manifest.chunks.length) }, () => worker()));
    const artifactBlob = new Blob(blobs, { type: manifest.mediaType || 'application/octet-stream' });
    const artifactHash = await sha256(artifactBlob);
    if (artifactHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      await removeArtifact(manifest.sha256);
      throw new Error('Hash artefak gabungan tidak cocok');
    }

    let storage = 'indexeddb';
    try {
      const handle = await getOpfsFileHandle(manifest.sha256, { create: true });
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(artifactBlob);
        await writable.close();
        storage = 'opfs';
      }
    } catch (_) {
      storage = 'indexeddb';
    }
    await db.put(ARTIFACT_STORE, {
      hash: manifest.sha256,
      state: 'ready',
      size: artifactBlob.size,
      kind: manifest.kind || 'artifact',
      storage,
      verifiedAt: Date.now(),
      updatedAt: Date.now()
    });
    onProgress?.({ phase: 'ready', received: manifest.size, total: manifest.size, cached: false });
    return artifactBlob;
  }

  async function getArtifactBlob(rawManifest) {
    const manifest = validateManifest(rawManifest);
    const record = await db.get(ARTIFACT_STORE, manifest.sha256);
    if (!record || record.state !== 'ready') return null;
    if (record.storage === 'opfs') {
      try {
        const handle = await getOpfsFileHandle(manifest.sha256);
        return await handle.getFile();
      } catch (_) {}
    }
    const chunks = await db.getAllByIndex(CHUNK_STORE, 'artifactHash', manifest.sha256);
    if (chunks.length !== manifest.chunks.length) return null;
    chunks.sort((left, right) => left.index - right.index);
    return new Blob(chunks.map(chunk => chunk.blob), { type: manifest.mediaType || 'application/octet-stream' });
  }

  window.RVX_ARTIFACT_STORE = Object.freeze({
    sha256,
    validateManifest,
    isArtifactReady,
    downloadArtifact,
    getArtifactBlob,
    removeArtifact,
    settings: {
      get: key => db.get(SETTINGS_STORE, key),
      put: (key, value) => db.put(SETTINGS_STORE, { key, value, updatedAt: Date.now() })
    }
  });
})();
