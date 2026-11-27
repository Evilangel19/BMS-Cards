// Runs every tests/run-*.mjs one after the other (npm test). A test that needs BMS files which are not in the repository
// (see tests/FIXTURES.md) is skipped with a note when they are missing, so a fresh clone and the CI run what they can.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The BMS files a test cannot start without (a test skips by itself the parts whose other files are missing: tests/fixture.mjs). The tables of the game
// (app/js/data/local/index.js) are made from the BMS files of the developer: without them a campaign is read with no entity types.
const TABLES = 'app/js/data/local/index.js',
  BEAR = 'tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam';
const NEEDS = {
  'run-airmissile.mjs': ['app/js/data/local/missilefallback.js'],
  'run-airperf.mjs': ['app/js/data/local/acfallback.js'],
  'run-bombdata.mjs': ['app/js/data/local/bombfallback.js'],
  'run-missiledata.mjs': [
    'tests/fixtures/misdata/AGM-88.dat',
    'tests/fixtures/misdata/MisTypes.lst',
    'tests/fixtures/misdata/Lofttables/AIM120.txt',
  ],
  'run-ato.mjs': [BEAR, TABLES],
  'run-golden.mjs': [BEAR, TABLES, 'tests/golden/golden.json'],
  'run-map.mjs': [BEAR, TABLES],
  'run-mission.mjs': [BEAR, TABLES],
  'run-squadron.mjs': [BEAR, TABLES],
  'run-carriers.mjs': ['tests/fixtures/psikorea/PSIKorea.cam', 'tests/fixtures/koreau2/KoreaU2.cam', TABLES],
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
