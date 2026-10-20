import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const webRoot = path.join(projectRoot, 'web');
const outputPath = path.join(webRoot, 'rvx-local.html');

function read(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8');
}

function inlineCss(relativePath, seen = new Set()) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (seen.has(normalized)) return '';
  seen.add(normalized);
  const directory = path.posix.dirname(normalized);
  return read(normalized).replace(
    /@import\s+["']([^"'?]+)(?:\?[^"']*)?["']\s*;/g,
    (_, imported) => inlineCss(path.posix.normalize(path.posix.join(directory, imported)), seen),
  );
}

const embeddedFiles = Object.fromEntries([
  'config/sources.json',
  'config/golden-preset.json',
  'registry/v2/index.json',
  'registry/v2/apps/index.json',
  'engine/v1/manifest.json',
].map((name) => [name, read(name)]));

const serializedFiles = JSON.stringify(embeddedFiles).replaceAll('<', '\\u003c');
const workerSource = JSON.stringify(read('workers/rvx-engine-worker.js')).replaceAll('<', '\\u003c');
const runtimeBootstrap = `
<script>
window.__RVX_DISTRIBUTION__ = 'standalone';
window.__RVX_EMBEDDED_FILES__ = ${serializedFiles};
window.__RVX_ENGINE_WORKER_SOURCE__ = ${workerSource};
(() => {
  const networkFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    let pathname = raw;
    try { pathname = new URL(raw, window.location.href).pathname.replace(/^\\/+/, ''); } catch (_) {}
    const key = Object.keys(window.__RVX_EMBEDDED_FILES__).find(name => pathname === name || pathname.endsWith('/' + name));
    if (key) {
      return Promise.resolve(new Response(window.__RVX_EMBEDDED_FILES__[key], {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-RVX-Embedded': '1' }
      }));
    }
    return networkFetch(input, init);
  };
})();
</script>`;

let html = read('index.html');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(
  /\s*<link rel="stylesheet" href="style\.css\?v=[^"]+">/,
  `\n  <meta name="rvx-distribution" content="single-html">\n  <style>\n${inlineCss('style.css')}\n  </style>`,
);
html = html.replace('</head>', `${runtimeBootstrap}\n</head>`);
html = html.replace(
  /<script src="([^"?]+)(?:\?v=[^"]+)?"><\/script>/g,
  (_, source) => `<script>\n${read(source).replaceAll('</script>', '<\\/script>')}\n</script>`,
);

fs.writeFileSync(outputPath, html);
const size = fs.statSync(outputPath).size;
console.log(`Created ${path.relative(projectRoot, outputPath)} (${(size / 1024 / 1024).toFixed(2)} MiB)`);
