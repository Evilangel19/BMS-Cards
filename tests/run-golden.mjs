// Golden tests: run the prototype core on each fixture campaign and compare with stored results.
// Usage: node tests/run-golden.mjs [--update]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update');

// Core library as an ES module (app/js). Results must match the golden file made from the prototype.
const { CAM } = await import(new URL('../app/js/core/cam-core.js', import.meta.url));
if (process.env.BMS_DATA) { // run the same flights with tables read from BMS files
  const { FILES, ALIASES, ENCODING, buildTables } = await import(new URL('../app/js/bmsdata/bmsdata.js', import.meta.url));
  const r = await buildTables(async k => { const p = [FILES[k], ...(ALIASES[k] || [])].map(n => path.join(process.env.BMS_DATA, n)).find(q => fs.existsSync(q)); return p ? new TextDecoder(ENCODING[k]).decode(fs.readFileSync(p)) : null; });
  Object.assign(CAM.D, r.tables);
  const acDir = process.env.BMS_ACDATA || path.join(process.env.BMS_DATA, 'Acdata');
  if (fs.existsSync(acDir)) {
    const { parseAircraftData } = await import(new URL('../app/js/bmsdata/bmsdata.js', import.meta.url));
    const a = parseAircraftData(fs.readdirSync(acDir).filter(f => /^F-16.*\.txtpb$/i.test(f)).map(f => ({ name: f, text: fs.readFileSync(path.join(acDir, f), 'utf8').slice(0, 4000) })));
    CAM.D.ew = a.ew; CAM.D.fi = a.fi;
  }
}
const { parseLink16 } = await import(new URL('../app/js/parsers/link16.js', import.meta.url));
const { parseIff } = await import(new URL('../app/js/parsers/iff.js', import.meta.url));
const { parseTwx } = await import(new URL('../app/js/parsers/twx.js', import.meta.url));
const { parseDtc } = await import(new URL('../app/js/parsers/dtc.js', import.meta.url));
CAM.setBase('2026-09-30'); // fixed date: ephemerides must be deterministic

const sets = [
  { name: 'beartrap', cam: 'PSI_BEAR_TRAP_26.cam', fmap: 'PSI_BEAR_TRAP_26.fmap' },
  { name: 'evilkorea', cam: 'EvilKorea.cam', fmap: 'EvilKorea.fmap' },
];

const out = {};
for (const s of sets) {
  const dir = path.join(root, 'tests', 'fixtures', s.name);
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(path.join(dir, s.cam))), CAM.D, s.cam);
  const WX = CAM.parseFmap(new Uint8Array(fs.readFileSync(path.join(dir, s.fmap))));
  const flights = CAM.listFlights(C);
  const res = [];
  flights.forEach((x, i) => {
    const F = CAM.fillCard(C, x.f);
    const r = { i, label: x.label, card: F };
    try { r.taf = CAM.tafText(C, WX, x.f); r.atis = CAM.atisText(WX, F.__dep, F.ab0_4); } catch (e) { r.wxError = String(e.message || e); }
    res.push(r);
  });
  out[s.name] = { flights: flights.length, bull: C.bull, results: res };
}

const gp = path.join(root, 'tests', 'golden', 'golden.json');
const cur = JSON.stringify(out, null, 1);
if (update || !fs.existsSync(gp)) {
  fs.writeFileSync(gp, cur + '\n');
  console.log('golden written:', Object.entries(out).map(([k, v]) => `${k}=${v.flights} flights`).join(', '));
  process.exit(0);
}
const gold = JSON.parse(fs.readFileSync(gp, 'utf8'));
let bad = 0, total = 0, weaponOnly = 0;
for (const k of Object.keys(gold)) {
  const g = gold[k], c = out[k];
  if (!c || g.flights !== c.flights) { console.log(`FAIL ${k}: flight count ${g.flights} -> ${c && c.flights}`); bad++; continue; }
  g.results.forEach((gr, i) => {
    total++;
    const a = JSON.stringify(gr), b = JSON.stringify(JSON.parse(JSON.stringify(c.results[i])));
    if (a !== b) {
      const keys = new Set([...Object.keys(gr.card || {}), ...Object.keys(c.results[i].card || {})]);
      const diffs = [...keys].filter(q => JSON.stringify(gr.card[q]) !== JSON.stringify(c.results[i].card[q])).slice(0, 5);
      // With BMS tables the embedded weapon table (incomplete) is replaced, so weight and drag may legitimately differ.
      const allDiffs = [...keys].filter(q => JSON.stringify(gr.card[q]) !== JSON.stringify(c.results[i].card[q]));
      if (process.env.BMS_DATA && allDiffs.length && allDiffs.every(q => ['drag', 'gw', 'fuel'].includes(q)) && JSON.stringify(gr.taf) === JSON.stringify(c.results[i].taf)) { weaponOnly++; return; }
      bad++;
      console.log(`FAIL ${k} #${i} ${gr.label}: ${diffs.join(', ') || 'taf/atis'}`);
    }
  });
}
if (weaponOnly) console.log(`note: ${weaponOnly} flights differ only in drag/weight (BMS weapon and aircraft data are more complete / more recent than the embedded tables)`);
console.log(bad ? `${bad} of ${total} flights differ` : `OK - ${total} flights match the golden results`);
process.exit(bad ? 1 : 0);
