// The version of the program is written in several files and they must all say the same: the window and the saved files use version.js,
// the build uses package.json, tauri.conf.json and Cargo.toml, and the two lock files carry it too (a stale one confuses `npm ci` and `cargo`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, parseVer, cmpVer, newerVersion } from '../app/js/core/version.js';

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

// the notice of a newer version: the order of the versions and the newest tag
ok(
  'a version is read with and without the v',
  parseVer('v1.2.0').n.join('.') === '1.2.0' && parseVer('1.2.0-beta.10').pre[1] === 10 && parseVer('latest') === null
);
ok(
  'beta.10 is newer than beta.9, a release newer than its betas',
  cmpVer('1.2.0-beta.10', '1.2.0-beta.9') > 0 &&
    cmpVer('1.2.0', '1.2.0-beta.10') > 0 &&
    cmpVer('1.1.0', '1.2.0-beta.1') < 0 &&
    cmpVer('1.2.0', '1.2.0') === 0
);
ok(
  'the newest tag that is newer than this version',
  newerVersion(['v1.0.0', 'v1.1.0', 'v1.2.0', 'nightly'], '1.2.0-beta.10') === '1.2.0' &&
    newerVersion(['v1.1.0'], '1.2.0-beta.10') === '' &&
    newerVersion(['v1.3.0', 'v1.2.1'], '1.2.0') === '1.3.0'
);
ok(
  'a pilot on a release is not told about betas; one on a beta is',
  newerVersion(['v1.3.0-beta.1'], '1.2.0') === '' &&
    newerVersion(['v1.2.0-beta.11'], '1.2.0-beta.10') === '1.2.0-beta.11'
);
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
