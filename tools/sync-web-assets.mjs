// The web directory is the source of truth for the Android WebView assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'web');
const destination = path.join(root, 'android/app/src/main/assets/web');
let changed = 0;
function sync(directory = '') {
  for (const entry of fs.readdirSync(path.join(source, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) { sync(relative); continue; }
    const input = fs.readFileSync(path.join(source, relative));
    const output = path.join(destination, relative);
    if (fs.existsSync(output) && input.equals(fs.readFileSync(output))) continue;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, input);
    changed++;
  }
}
sync();
console.log(`Android WebView: ${changed} asset(s) updated.`);
