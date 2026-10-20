/* Executes only a verified RVX Portable engine. It never performs network I/O. */
self.onmessage = async event => {
  const message = event.data || {};
  if (message.type !== 'run') return;
  try {
    self.postMessage({ type: 'progress', detail: { stage: 'validate-input', progress: 0.02 } });
    const module = await WebAssembly.instantiate(message.engineBuffer, {
      rvx_host: {
        progress(stage, current, total) {
          self.postMessage({ type: 'progress', detail: { stage, current, total } });
        }
      }
    });
    const run = module.instance?.exports?.rvx_run;
    if (typeof run !== 'function') {
      throw new Error('Artefak mesin tidak menyediakan rvx_run');
    }
    /*
     * The production engine ABI owns memory transfer and returns an output
     * descriptor. Until an artifact implementing API v1 is published, the
     * registry keeps engine.available=false and this branch cannot be reached.
     */
    throw new Error('Engine ABI v1 belum tersedia pada artefak yang dimuat');
  } catch (error) {
    self.postMessage({ type: 'error', error: error?.message || String(error) });
  }
};
