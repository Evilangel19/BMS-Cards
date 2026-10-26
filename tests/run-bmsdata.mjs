// Game-data tests: tables read from BMS files must equal the embedded fallback tables.
// BMS files are not stored in the repository. Set BMS_DATA to a folder that contains them
// (e.g. BMS_DATA=/path/to/Data npm run test:bmsdata). Without it the test is skipped.
import fs from 'node:fs';
import path from 'node:path';
import D from '../app/js/data/index.js';
import { FILES, ALIASES, ENCODING, buildTables } from '../app/js/bmsdata/bmsdata.js';

const dir = process.env.BMS_DATA;
if (!dir || !fs.existsSync(dir)) {
  console.log('SKIP - set BMS_DATA to run the game-data tests');
  process.exit(0);
}

const dec = (k, buf) => new TextDecoder(ENCODING[k]).decode(buf);
const { tables, missing, errors } = await buildTables(async k => {
  const p = [FILES[k], ...(ALIASES[k] || [])].map(n => path.join(dir, n)).find(q => fs.existsSync(q));
  return p ? dec(k, fs.readFileSync(p)) : null;
});
let bad = 0,
  n = 0;
const ok = (name, cond, info = '') => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name, info);
  }
};
ok('all files found', missing.length === 0, missing.join(', '));
ok('no parse errors', errors.length === 0, errors.join('; '));
for (const k of ['ct', 'ac', 'wn', 'ob', 'rm', 'S', 'pn', 'wt', 'gu', 'un', 'ab', 'tf']) {
  if (!tables[k]) {
    ok('table ' + k, false, 'not built');
    continue;
  }
  if (['S', 'rm', 'wt', 'tf'].includes(k)) {
    // fallback must be contained in the new table (new tables may have more keys)
    // tf: the embedded values for tanks 94, 105 and 106 (F-4 / F-15E tanks) were wrong in the prototype; BMS values win.
    const diff = Object.keys(D[k]).filter(
      q => !(k === 'tf' && ['94', '105', '106'].includes(q)) && JSON.stringify(D[k][q]) !== JSON.stringify(tables[k][q])
    );
    ok('table ' + k, diff.length === 0, diff.slice(0, 3).join(','));
  } else ok('table ' + k, JSON.stringify(D[k]) === JSON.stringify(tables[k]));
}
// Aircraft data (Data\Sim\Acdata): set BMS_ACDATA to that folder (default: <BMS_DATA>/Acdata)
const acDir = process.env.BMS_ACDATA || path.join(dir, 'Acdata');
if (fs.existsSync(acDir)) {
  const { parseAircraftData } = await import('../app/js/bmsdata/bmsdata.js');
  const files = fs
    .readdirSync(acDir)
    .filter(f => /^F-16.*\.txtpb$/i.test(f))
    .map(f => ({ name: f, text: fs.readFileSync(path.join(acDir, f), 'utf8').slice(0, 4000) }));
  const { ew, fi } = parseAircraftData(files);
  ok('aircraft files read', files.length > 20, String(files.length));
  ok(
    'empty weights',
    ew['F-16CM-52'] === 19500 && ew['F-16C-52'] === 19500 && ew['F-16C-32'] === 18000 && ew['F-16CM-40'] === 19800,
    JSON.stringify([ew['F-16CM-52'], ew['F-16C-52'], ew['F-16CM-40']])
  );
  ok('internal fuel', fi['F-16CM-52'] === 7162 && fi['F-16DM-40'] === 5898);
} else console.log('note: no Acdata folder found, aircraft data checks skipped');
// Airbases: ATC files + AIP (set BMS_AIP / BMS_ATC, default <BMS_DATA>/KTO_AIP.pdf and <BMS_DATA>/ATC)
const aipFile = process.env.BMS_AIP || path.join(dir, 'KTO_AIP.pdf'),
  atcDir = process.env.BMS_ATC || path.join(dir, 'ATC');
if (fs.existsSync(aipFile) && fs.existsSync(atcDir)) {
  const { pdfTextItems } = await import('../app/js/platform/pdf.js');
  const { parseAip, aipFor } = await import('../app/js/bmsdata/aip.js');
  const { parseAtc, buildAirbases } = await import('../app/js/bmsdata/airbases.js');
  const aipList = parseAip(await pdfTextItems(new Uint8Array(fs.readFileSync(aipFile))));
  const atc = fs
    .readdirSync(atcDir)
    .filter(f => /\.dat$/i.test(f))
    .map(f => parseAtc(fs.readFileSync(path.join(atcDir, f), 'latin1')))
    .filter(Boolean);
  const r = buildAirbases({ atc, aipList, ob: tables.ob, ab: tables.ab });
  ok('AIP airports read', aipList.length > 20, String(aipList.length));
  ok('ATC files read', atc.length > 15, String(atc.length));
  // elevations in the AIP must equal the embedded table (which was made from the AIP)
  const el = Object.keys(D.el).filter(k => k in r.el && r.el[k] !== D.el[k]);
  ok('elevations equal the embedded table', el.length === 0, el.join(','));
  // TACAN from the AIP must equal the embedded corrections where both exist
  const tnd = Object.keys(D.tn).filter(k => k in r.tn && r.tn[k] !== D.tn[k]);
  ok('TACAN equals the embedded corrections', tnd.length === 0, tnd.join(','));
  ok('TACAN read for the main airbases', Object.keys(r.tn).length > 20, String(Object.keys(r.tn).length));
  // coordinate conversion: object positions must fall where the AIP says (grid km -> lat/long, within 1.5 km; the AIP has a few typos in its coordinates)
  const { geoLL } = await import('../app/js/rules/geo.js');
  let far = 0,
    cmp = 0;
  for (const o of tables.ob) {
    const m = String(o[1]).match(/\(([A-Z]{4})\)/),
      a = m && aipFor(aipList, m[1], o[1]);
    if (!a || a.lat == null || a.lon == null) continue;
    const q = geoLL(null, o[2], o[3]).match(/([NS])\s+(\d+)°\s+([\d.]+)'\s+([EW])\s+(\d+)°\s+([\d.]+)/);
    const lat = +q[2] + q[3] / 60,
      lon = +q[5] + q[6] / 60;
    cmp++;
    if (Math.hypot((lat - a.lat) * 111.19, (lon - a.lon) * 111.19 * Math.cos((lat * Math.PI) / 180)) > 1.5) far++;
  }
  ok('coordinates match the AIP', cmp > 40 && far <= cmp * 0.12, `${far} of ${cmp} farther than 1.5 km`);
  ok(
    'Cheongju: ILS on 24 only',
    JSON.stringify(r.ap['997'].rw.map(x => (x[2] ? x[0] : ''))) === '["","24"]',
    JSON.stringify(r.ap['997'])
  );
  ok(
    'Jungwon found by name (AIP code differs)',
    r.ap['930'].rw.some(x => x[2] === 11130)
  );
} else console.log('note: no KTO_AIP.pdf / ATC folder found, airbase checks skipped');
console.log(bad ? `${bad} of ${n} game-data checks failed` : `OK - ${n} game-data checks match the embedded tables`);
process.exit(bad ? 1 : 0);
