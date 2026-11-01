// The version of the program is written in several files and they must all say the same: the window and the saved files use version.js,
// the build uses package.json, tauri.conf.json and Cargo.toml, and the two lock files carry it too (a stale one confuses `npm ci` and `cargo`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../app/js/core/version.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0,
  bad = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name);
  }
};
const V = APP_VERSION;
const json = f => JSON.parse(read(f));
const first = (text, re) => {
  const m = re.exec(text);
  return m ? m[1] : null;
};
const same = (what, v) => ok(what + ' says ' + V + (v === V ? '' : ' (it says ' + v + ')'), v === V);

ok('the version has the form 0.9.9-beta.N or x.y.z', /^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(V));
same('package.json', json('package.json').version);
same('src-tauri/tauri.conf.json', json('src-tauri/tauri.conf.json').version);
same('src-tauri/Cargo.toml', first(read('src-tauri/Cargo.toml'), /^version\s*=\s*"([^"]+)"/m));
const lock = json('package-lock.json');
same('package-lock.json (top)', lock.version);
same('package-lock.json (package)', lock.packages && lock.packages[''] && lock.packages[''].version);
same(
  'src-tauri/Cargo.lock (bms-cards)',
  first(read('src-tauri/Cargo.lock'), /name = "bms-cards"\r?\nversion = "([^"]+)"/)
);
// every beta has its line in the roadmap
const m = /-beta\.(\d+)$/.exec(V);
if (m) ok('docs/ROADMAP.md has a line for ' + V, read('docs/ROADMAP.md').includes('- ' + V + ' ('));

console.log(bad ? `${bad} of ${n} version checks failed` : `OK - ${n} version checks`);
process.exit(bad ? 1 : 0);
