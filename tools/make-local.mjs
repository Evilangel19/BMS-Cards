// Makes app/js/data/local/ (gitignored) from the files of a Falcon BMS installation, with the readers of the program: the tables (index.js, as
// loadGameData reads them at start) and the data the tests take as built-in (missilefallback.js, acfallback.js, bombfallback.js). The tests that open
// a campaign need them; nothing of it goes into the repository.
// Usage: node tools/make-local.mjs --objects <Falcon4_*.xml folder> --campaign <CampObjData.XML, Strings.txt, RadioMap.dat ... folder> --sim <Data\Sim>
import fs from 'node:fs';
import path from 'node:path';
import { buildTables, FILES, ENCODING, parseAircraftData, aliasAircraft } from '../app/js/bmsdata/bmsdata.js';
import { parseMisList, parseMissileDat, parseLoftTable } from '../app/js/bmsdata/missiledata.js';
import { parseBombList, parseBombDat } from '../app/js/bmsdata/bombdata.js';
import { parseAcPerf } from '../app/js/bmsdata/acperf.js';

const arg = k => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : null;
};
const objects = arg('objects'),
  campaign = arg('campaign'),
  sim = arg('sim');
if (!objects || !campaign || !sim) {
  console.log('Usage: node tools/make-local.mjs --objects <dir> --campaign <dir> --sim <dir>');
  process.exit(1);
}
const OUT = new URL('../app/js/data/local/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const rd = (p, enc = 'latin1') => new TextDecoder(enc).decode(fs.readFileSync(p));
const find = (dir, name) => {
  const f = fs.readdirSync(dir).find(n => n.toLowerCase() == name.toLowerCase());
  return f ? path.join(dir, f) : null;
};
const IN_OBJECTS = new Set(['ct', 'vcd', 'ucd', 'wcd', 'rack', 'rcd']);

// the tables: the same reader as the program (bmsdata.js buildTables)
const T = await buildTables(async k => {
  const p = find(IN_OBJECTS.has(k) ? objects : campaign, FILES[k]);
  return p ? rd(p, ENCODING[k] || 'latin1') : null;
});
if (T.missing.length) console.log('missing:', T.missing.join(', '));
if (T.errors.length) console.log('errors:', T.errors.join('; '));

// missiles (as gamefiles.js reads Data\Sim\Misdata): name -> {title, params, range, loft, extra}
const mdir = path.join(sim, 'Misdata'),
  mis = {},
  lofts = {};
for (const n of parseMisList(rd(path.join(mdir, 'MisTypes.lst')))) {
  try {
    const m = parseMissileDat(rd(path.join(mdir, n + '.dat')));
    if (!m.range) continue;
    let lt = null;
    if (m.loftFile) {
      if (!(m.loftFile in lofts)) {
        try {
          lofts[m.loftFile] = parseLoftTable(rd(path.join(mdir, 'Lofttables', m.loftFile)));
        } catch (e) {
          lofts[m.loftFile] = null;
        }
      }
      lt = lofts[m.loftFile];
    }
    mis[n] = { title: m.title, params: m.params, range: m.range, loft: lt, extra: m.extra };
  } catch (e) {
    /* a file of the list that is missing */
  }
}
// bombs (as pages.js reads Data\Sim\Bombdata): name -> the CBU data
const bdir = path.join(sim, 'Bombdata'),
  bombs = {};
for (const n of parseBombList(rd(path.join(bdir, 'BombTypes.lst')))) {
  try {
    const d = parseBombDat(rd(path.join(bdir, n + '.dat')));
    if (d) bombs[n] = d;
  } catch (e) {
    /* a file of the list that is missing */
  }
}
// aircraft (as gamefiles.js reads Data\Sim\Acdata\*.txtpb): file name -> performance
const adir = path.join(sim, 'Acdata'),
  ac = {};
for (const f of fs.readdirSync(adir).filter(f => f.endsWith('.txtpb'))) {
  const n = f.slice(0, -6);
  try {
    const d = parseAcPerf(rd(path.join(adir, f), 'utf-8'), n);
    if (d) ac[n] = d;
  } catch (e) {
    /* not a flight model */
  }
}
// the weights, the fuel and the hardpoints of the aircraft (as gamedata.js reads Data\Sim\Acdata at start)
const W = aliasAircraft(
  parseAircraftData(
    fs
      .readdirSync(adir)
      .filter(f => /\.txtpb$/i.test(f))
      .map(f => ({ name: f, text: rd(path.join(adir, f), 'utf-8') }))
  ),
  Object.values(T.tables.ac || {})
);
const js = v => JSON.stringify(v);
fs.writeFileSync(
  new URL('index.js', OUT),
  'export default ' + js({ ...T.tables, ew: W.ew, fi: W.fi, hp: W.hp, mfb: mis, bfb: bombs, acfb: ac }) + ';\n'
);
fs.writeFileSync(new URL('missilefallback.js', OUT), 'export const MISSILE_FALLBACK = ' + js(mis) + ';\n');
fs.writeFileSync(new URL('bombfallback.js', OUT), 'export const FALLBACK = ' + js(bombs) + ';\n');
fs.writeFileSync(new URL('acfallback.js', OUT), 'export const AC_FALLBACK = ' + js(ac) + ';\n');
console.log(
  'app/js/data/local: tables ' +
    Object.keys(T.tables).length +
    ', missiles ' +
    Object.keys(mis).length +
    ', bombs ' +
    Object.keys(bombs).length +
    ', aircraft ' +
    Object.keys(ac).length
);
