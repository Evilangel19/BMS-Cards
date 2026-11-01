// Airbase tables built from BMS files: ATC files (runway numbers and headings), the AIP (ILS, elevation) and
// Stations+Ils.dat (frequencies, used for ILS only when the AIP is not available).
import { aipFor } from './aip.js';

// One ATC file (Data\TerrData\ATC\<name>.dat) -> { campId, ends: [{ qfu: '06', hdg: 59, id: 0 }] } (parallel runways repeat the numbers; id = the database runway number, which the objective files use for the runway size)
export function parseAtc(text) {
  const t = text.replace(/\r/g, '');
  const id = t.match(/#\s*CampID[^\n]*\n\s*(\d+)/);
  if (!id) return null;
  const ends = [...t.matchAll(/#\s*RUNWAY:\s*(\d+)\s+HDG:\s*(\d+)\s+QFU:\s*(\d+)/g)].map(m => ({
    qfu: m[3].padStart(2, '0'),
    hdg: +m[2],
    id: +m[1],
  }));
  return ends.length ? { campId: id[1], ends } : null;
}

const num = e => e.replace(/[LRC]/g, '').padStart(2, '0');

// ILS of one end number from the AIP list ({ f, end }). Two parallel runways can share the number: the first one listed is used.
function ilsFor(aip, qfu) {
  if (!aip) return 0;
  const hit = aip.ils.filter(i => num(i.end) === qfu),
    near = aip.ils.filter(i => Math.abs(+num(i.end) - +qfu) === 1);
  return (hit[0] || near[0] || {}).f || 0;
}

// atc: [parseAtc results]; aipList: parseAip result or null; ob: campaign objects [[campId, name, ...]]; ab: Stations table.
// -> { ap: {campId: {i, rw: [[number, heading, ils]]}}, api: {icao: {i, rw}}, el: {campId: feet}, tn: {campId: '27 X'} }
export function buildAirbases({ atc, aipList, ob, ab }) {
  const icaoOf = {},
    nameOf = {};
  for (const o of ob || []) {
    const m = String(o[1]).match(/\(([A-Z]{4})\)/);
    if (m) {
      icaoOf[o[0]] = m[1];
      nameOf[o[0]] = o[1];
    }
  }
  const ap = {},
    api = {},
    el = {},
    tn = {};
  const put = (campId, icao, rw, keepApi = false) => {
    ap[campId] = { i: icao, rw };
    if (icao && !(keepApi && api[icao])) api[icao] = { i: icao, rw };
  };
  for (const a of atc) {
    const uniq = a.ends.filter((e, i) => a.ends.findIndex(x => x.qfu === e.qfu) === i); // parallel runways repeat the numbers
    const icao = icaoOf[a.campId] || '',
      aip = aipList && icao ? aipFor(aipList, icao, nameOf[a.campId]) : null;
    let fallbackIls = 0; // no AIP: use the Stations frequency only when every ILS of the airbase is the same
    if (!aip && ab && ab[a.campId]) {
      const f = [...new Set(ab[a.campId].slice(7, 11).filter(Boolean))];
      if (f.length === 1) fallbackIls = f[0];
    }
    put(
      a.campId,
      icao,
      uniq.map(e => [e.qfu, e.hdg, aip ? ilsFor(aip, e.qfu) : fallbackIls])
    );
  }
  // elevation and TACAN from the AIP for every airbase found there
  if (aipList)
    for (const o of ob || []) {
      const icao = icaoOf[o[0]],
        aip = icao && aipFor(aipList, icao, nameOf[o[0]]);
      if (!aip) continue;
      if (aip.elev != null) el[o[0]] = aip.elev;
      if (aip.tacan) tn[o[0]] = +aip.tacan.slice(0, -1) + ' ' + aip.tacan.slice(-1);
    }
  // airbases without an ATC file: runways from the AIP (heading = number x 10)
  if (aipList)
    for (const o of ob || []) {
      const icao = icaoOf[o[0]];
      if (!icao || ap[o[0]]) continue;
      const aip = aipFor(aipList, icao, nameOf[o[0]]);
      if (!aip) continue;
      const ends = aip.rwys.flatMap(r => r.split('/')).map(num);
      if (ends.length)
        put(
          o[0],
          icao,
          ends.map(q => [q, +q * 10, ilsFor(aip, q)]),
          true
        );
    }
  return { ap, api, el, tn };
}
