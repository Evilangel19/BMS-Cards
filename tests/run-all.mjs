// Runs every tests/run-*.mjs one after the other (npm test). A test that needs BMS files which are not in the repository
// (see tests/FIXTURES.md) is skipped with a note when they are missing, so a fresh clone and the CI run what they can.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEEDS = {
  'run-airmissile.mjs': ['app/js/data/local/missilefallback.js'],
  'run-airperf.mjs': ['app/js/data/local/acfallback.js'],
  'run-bombdata.mjs': ['app/js/data/local/bombfallback.js'],
  'run-missiledata.mjs': ['tests/fixtures/misdata/AGM-88.dat'],
  'run-ato.mjs': ['tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'],
  'run-golden.mjs': ['tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'],
  'run-map.mjs': ['tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'],
  'run-mission.mjs': ['tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'],
  'run-squadron.mjs': ['tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam'],
  'run-carriers.mjs': ['tests/fixtures/evilkorea/EvilKorea.cam'],
  'run-parsers.mjs': ['tests/golden/parsers.json'],
};
const only = process.argv.slice(2);
const files = fs
  .readdirSync(path.join(root, 'tests'))
  .filter(f => /^run-.*\.mjs$/.test(f) && f !== 'run-all.mjs' && (!only.length || only.some(o => f.includes(o))))
  .sort();
let failed = 0,
  skipped = 0;
for (const f of files) {
  const miss = (NEEDS[f] || []).filter(p => !fs.existsSync(path.join(root, p)));
  if (miss.length) {
    skipped++;
    console.log(`SKIP ${f}: needs ${miss[0]} (a BMS file, not in the repository)`);
    continue;
  }
  const r = spawnSync(process.execPath, [path.join('tests', f)], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').pop();
  if (r.status !== 0) {
    failed++;
    console.log(`FAIL ${f}\n${out.trim().split('\n').slice(-15).join('\n')}`);
  } else console.log(`ok   ${f}: ${last}`);
}
console.log(`\n${files.length - skipped - failed} passed, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
