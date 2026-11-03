// MSA / ERAA of the selected flight (datacard, MDC, map) and of the airbases: the terrain comes from the HeightMap.raw of the BMS folder (gamefiles.js terrain()),
// nothing is estimated: without it the cells stay empty. The results are kept per route / airbase, the terrain is read once.
import { routeMsa, baseMsa } from '../core/msa.js';
import { heightsAt } from '../bmsdata/heightmap.js';
import { readRange } from '../platform/desktop.js';
import { flightRoute } from '../core/mapdata.js';
import { FT_KM } from '../core/mapdtc.js';
import { busyWrap } from '../core/busy.js';
import { terrain } from './gamefiles.js';
import { ST } from './state.js';
import { F, FD } from './datacard.js';
import { MFD, draw } from './cardview.js';

async function elev0(pts) {
  const t = await terrain();
  return t ? heightsAt((o, l) => readRange(t.path, o, l), t.spec, pts) : null;
}
export const MSA_IO = { elev: elev0 }; // (replaceable by the tests)
const elev = pts => MSA_IO.elev(pts);
const th = () => (ST.TH && ST.TH.name) || '';
const ROUTES = new Map(),
  BASES = new Map(),
  CELLS = new Map(); // theater -> cells of the grid already read (core/msa.js): one cache for all the flights and airbases of the theater
const cells = () => {
  if (!CELLS.has(th())) CELLS.set(th(), new Map());
  return CELLS.get(th());
};
// {n, e} (BMS feet) of the steerpoints of a flight
export const routeFt = (C, f) => flightRoute(C, f).map(p => ({ n: p.y * FT_KM, e: p.x * FT_KM }));
/** @returns {Promise<null | {legs:(number|null)[], eraa:number|null, mountainous:boolean}>} */
export function msaOfFlight(f) {
  if (!ST.C || !f || !f.wps || f.wps.length < 2) return Promise.resolve(null);
  const r = routeFt(ST.C, f),
    key = th() + '|' + r.map(p => Math.round(p.n) + ',' + Math.round(p.e)).join(';');
  if (!ROUTES.has(key))
    ROUTES.set(
      key,
      busyWrap('Reading the terrain for the MSA…', routeMsa(elev, r, { cache: cells() })).then(
        v => {
          if (!v) ROUTES.delete(key); // no terrain data (yet): asked again next time
          return v;
        },
        () => {
          ROUTES.delete(key); // the file could not be read: nothing is kept, it is asked again next time
          return null;
        }
      )
    );
  return ROUTES.get(key);
}
/** sectors of an airbase / navaid at campaign km (x, y); [] when the terrain is not available */
export function msaOfBase(x, y) {
  const key = th() + '|' + x + ',' + y;
  if (!BASES.has(key)) {
    const p = { n: y * FT_KM, e: x * FT_KM };
    BASES.set(
      key,
      baseMsa(elev, p, 0, { cache: cells() }).then(
        v => {
          if (!v) BASES.delete(key);
          return v;
        },
        () => {
          BASES.delete(key);
          return null;
        }
      )
    );
  }
  return BASES.get(key);
}
export const clearMsa = () => {
  ROUTES.clear();
  BASES.clear();
  CELLS.clear();
};

// the MSA column of the flight plan (cells 'fp<row>_11', the same keys feed the MDC) and the ERAA of the flight ('aux'): written after the automatic fill, what the pilot typed stays
export async function msaFill(i) {
  const x = ST.CL && ST.CL[i];
  if (!x || !ST.C) return;
  const k = ST.CURK,
    r = await msaOfFlight(x.f);
  if (!r || ST.CURK !== k || !ST.AUTO) return;
  const put = (key, v) => {
    if (ST.MANK && ST.MANK.has(key)) return;
    F[key] = v;
    ST.AUTO[key] = v;
    [...FD, ...MFD].filter(d => d.k == key && d.el).forEach(d => (d.el.value = v));
  };
  r.legs.forEach((v, q) => {
    if (q < 24) put(`fp${q}_11`, v === null ? '---' : String(v));
  });
  if (r.eraa !== null) put('aux', String(r.eraa));
  draw();
}
