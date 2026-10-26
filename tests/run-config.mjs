// Config tests: defaults file in sync with code, merge rules.
import fs from 'node:fs';
import { DEFAULTS, mergeConfig } from '../app/js/config/config.js';

let bad = 0,
  n = 0;
const ok = (name, cond) => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name);
  }
};
const file = JSON.parse(fs.readFileSync(new URL('../config/config.default.json', import.meta.url), 'utf8'));
ok('config.default.json matches DEFAULTS', JSON.stringify(file) === JSON.stringify(DEFAULTS));
ok(
  'undefined -> defaults, no warnings',
  JSON.stringify(mergeConfig(undefined)) === JSON.stringify({ config: DEFAULTS, warnings: [] })
);
let r = mergeConfig({ paths: { campaigns: 'D:\\BMS\\Campaigns' }, extra: 1 });
ok(
  'partial config merges',
  r.config.paths.campaigns === 'D:\\BMS\\Campaigns' && r.config.extra === undefined && r.warnings.length === 0
);
r = mergeConfig({ paths: { dtc: 5 }, ui: 'x', export: { fileName: 'old' }, paths2: 1 });
ok(
  'wrong types fall back with warnings',
  r.config.paths.dtc === '' &&
    r.config.ui.animations === true &&
    r.config.export === undefined &&
    r.warnings.length === 2
);
r = mergeConfig([1]);
ok('non-object -> defaults + warning', r.warnings.length === 1 && r.config.version === 1);
ok('DEFAULTS is not mutated', DEFAULTS.paths.dtc === '');
console.log(bad ? `${bad} of ${n} config checks failed` : `OK - ${n} config checks`);
process.exit(bad ? 1 : 0);
