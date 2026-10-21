// Map page data: converts campaign grid coordinates (km, x = east, y = north, origin 512/512 at the theater
// center) to latitude/longitude and builds the point/line sets the map layers draw. Pure functions, no DOM.
import {tmInv, tmFwd, getGeo} from '../rules/geo.js';
import {ord} from './flight.js';
import {clean} from './flight.js';

// campaign km -> [lat, lon]
export const toLL = (gx, gy) => tmInv((gx - 512) * 1000, (gy - 512) * 1000);

// [lat, lon] -> campaign km [x, y] (inverse of toLL)
export const fromLL = (lat, lon) => { const [e, n] = tmFwd(lat, lon); return [e / 1000 + 512, n / 1000 + 512]; };

// "N 37° 05.000'  E 127° 01.000'"
export function fmtLL(lat, lon) {
  const f = (v, pz, ng, w) => {
    const s = v >= 0 ? pz : ng; v = Math.abs(v);
    let d = Math.floor(v), m = (v - d) * 60;
    if (m >= 59.9995) { d++; m = 0; }
    return s + ' ' + String(d).padStart(w, '0') + '° ' + m.toFixed(3).padStart(6, '0') + "'";
  };
  return f(lat, 'N', 'S', 2) + '  ' + f(lon, 'E', 'W', 3);
}

// Airbases of the theater: [{id, name, ll, kind, sub}] kind: 'ab' airbase, 'nav' navaid (sub: vortac / tacan / vor / vordme / dme / ndb), 'ship' carrier start spot
const NAV = /\b(VOR|VORTAC|TACAN|NDB|DME)\b/, SHIP = /^(USS|TAKR|CV-|CVN|LHD|LHA|HMS|JS )/;
export function mapAirbases(D) {
  const nb = D.navOcd || [];   // objective classes named like a navigation beacon in the OCD file ("Air Nav Beacon")
  return D.ob.filter(o => D.ab[o[0]]).map(o => ({id: o[0], name: clean(o[1]), ll: toLL(o[2], o[3]), kind: NAV.test(o[1]) || nb.includes(o[4]) ? 'nav' : SHIP.test(o[1]) ? 'ship' : 'ab', sub: /VORTAC/.test(o[1]) ? 'vortac' : /TACAN/.test(o[1]) ? 'tacan' : /VOR/.test(o[1]) ? (/DME/.test(o[1]) ? 'vordme' : 'vor') : /DME/.test(o[1]) ? 'dme' : /NDB/.test(o[1]) ? 'ndb' : nb.includes(o[4]) ? 'vordme' : ''}));
}

// Team that owns an airbase (objective id), or null when the campaign file does not say: the owner recorded in the objective deltas,
// else the owner of a squadron based there. (Initial owners of untouched objectives are in the theater files, not in the campaign.)
export function airbaseOwner(C, id) {
  if (!C) return null;
  if (C.objOwn && C.objOwn.has(id)) return C.objOwn.get(id);
  const q = C.units.find(u => u.kind == 'sqd' && u.airbase && u.airbase.n == id); return q ? q.owner : null;
}
// 'own' = the viewed team, 'ally', 'enemy', or 'unknown'
export const airbaseSide = (C, id, view) => { const o = airbaseOwner(C, id); return o == null || o == 0 ? 'unknown' : o == view ? 'own' : allyOf(C, o, view) ? 'ally' : 'enemy'; };

// Route of a flight: [{n, act, ll}] with the waypoint number (1 = first waypoint) and its action
export function flightRoute(C, f) {
  if (!f || !f.wps) return [];
  return f.wps.map((w, i) => ({n: i + 1, act: w.act, ll: toLL(w.x, w.y), x: w.x, y: w.y, altFt: Math.round(w.z * 10), arr: w.arr}));
}

// Bounds of the whole theater, [[south, west], [north, east]]
export const theaterBounds = () => {
  const g = getGeo();
  if (g.lat === 38.5 && g.lon === 127.5) return [[32, 121], [43.5, 133.5]];
  const c = [[0, 0], [0, 1024], [1024, 0], [1024, 1024]].map(([x, y]) => toLL(x, y)), la = c.map(q => q[0]), lo = c.map(q => q[1]);
  return [[Math.min(...la) - 0.3, Math.min(...lo) - 0.3], [Math.max(...la) + 0.3, Math.max(...lo) + 0.3]];
};

// ---- units, SAM rings, flights at a given time ---------------------------------------------
// Same rule as the ATO: teams are friends when their stance (either direction) is 1 or 2.
export const allyOf = (C, x, y) => {
  if (x == y) return true;
  const s = C && C.stance;
  if (!s || !s[x] || !s[y]) return x > 0 && y > 0 && x < 4 && y < 4;
  return [s[x][y], s[y][x]].some(v => v == 1 || v == 2);
};
// A unit is "spotted" when the low byte of its spotted field has the bit of one of the given teams (1 << team).
// (Reading checked on the sample campaigns: ROK, the player's allies in the data, hold the bits of enemy units they spotted.)
export const spottedBy = (u, teams) => teams.some(t => ((u.spA | 0) >> t) & 1);
const SAMCAT = new Set(['Air Defense', 'SHORAD']);

// Ground and naval units: [{u, ll, owner, name, cat, rng, low, sam, noFcr, ally, spotted}] seen from team `view`.
// noFcr: a SAM unit whose fire control radar vehicle is gone (the class names the slot of that vehicle, the roster has 2 bits of count per slot): it cannot engage, so no ring and no automatic threat.
export function mapUnits(C, view) {
  const D = C.D, mates = [0, 1, 2, 3, 4, 5, 6, 7].filter(t => allyOf(C, t, view));
  return C.units.filter(u => (u.kind == 'gnd' || u.kind == 'sea') && u.c).map(u => {
    const i = (D.un || {})[u.c.i] || ['?', 0, 0, -1, 0], ally = allyOf(C, u.owner, view);
    return {u, ll: toLL(u.x, u.y), owner: u.owner, name: D.ac[u.c.i] || i[0], bn: u.kind == 'gnd' ? ord(u.nameId) + ' ' + ((D.gu || {})[u.c.i] || i[0]) + ' Battalion' : D.ac[u.c.i] || i[0], cat: i[0], rng: i[1], low: i[2], det: i[4] || 0, slot: i[3] == null ? -1 : i[3], sam: SAMCAT.has(i[0]) && i[1] > 0, noFcr: SAMCAT.has(i[0]) && i[1] > 0 && i[3] >= 0 && u.roster != null && ((u.roster >>> (i[3] * 2)) & 3) === 0, ally, spotted: ally || spottedBy(u, mates)};
  });
}

// waypoints with a time (the last ones of a route are often not timed)
const timed = f => (f.wps || []).filter(w => w.arr > 0);
const KM_NM = 1.852;
// State of a flight at campaign time t (ms), flying its timed waypoints: {ll, hdg (deg), altFt, gsKt} or null when it is not flying then.
export function flightState(f, t) {
  const w = timed(f); if (w.length < 2 || t < w[0].arr || t > w[w.length - 1].arr) return null;
  let i = 0; while (i < w.length - 2 && t > w[i + 1].arr) i++;
  const a = w[i], b = w[i + 1], dt = b.arr - a.arr, k = dt > 0 ? (t - a.arr) / dt : 0;
  const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, km = Math.hypot(b.x - a.x, b.y - a.y);
  return {ll: toLL(x, y), hdg: (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360, altFt: Math.round((a.z + (b.z - a.z) * k) * 10),
    gsKt: dt > 0 ? Math.round(km / KM_NM / (dt / 3600000)) : 0};
}
// Steerpoint kinds: circle = navigation / take-off / landing / push / split / holding, triangle = any mission activity
// (CAP, strike, SEAD, ground attack, refuel, recon, jamming, ...). Codes as in the campaign file.
const PLAIN = new Set([0, 1, 2, 3, 7, 8]);
export const isActivity = act => !PLAIN.has(act);
// Distance (nm) and course (deg) of the leg that ends at each steerpoint (the first one has none)
export function legs(route) {
  return route.map((p, i) => {
    if (!i) return null; const q = route[i - 1], dx = p.x - q.x, dy = p.y - q.y;
    return {nm: Math.hypot(dx, dy) / KM_NM, hdg: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, from: q.ll, to: p.ll, mid: [(q.ll[0] + p.ll[0]) / 2, (q.ll[1] + p.ll[1]) / 2]};
  });
}
// Bullseye [lat, lon] or null
export const bullseye = C => C && C.bull ? toLL(C.bull.x, C.bull.y) : null;
// Shortest distance (km, campaign grid) from the point x,y to the route (a polyline of waypoints with x, y in km)
export function distToRoute(route, x, y) {
  if (!route || !route.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[i + 1] || a, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const k = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - a.x - k * dx, y - a.y - k * dy));
  }
  return best;
}
// A SAM site of range rng (km) "crosses" the flight plan when its range circle touches any leg of the route
export const crossesRoute = (route, x, y, rng) => distToRoute(route, x, y) <= rng;

// ---- front line ---------------------------------------------------------------------------------
// n points along the front: among the friendly combat units, the ones closest to the (spotted) enemy ground units, spread from one end of the front to the other.
// `U` = mapUnits() of the viewed team. The front axis is the main direction of those units (west -> east, or south -> north when it runs north-south).
// Returns [{x, y, m}] in order along the axis (x, y in campaign km, m = the unit), or null when there is no front (no friendly / enemy ground units).
const REAR = new Set(['Supply', 'HQ', 'Engineer']), AIRDEF = new Set(['Air Defense', 'SHORAD', 'AAA', 'Missile']);
export function frontLine(U, n = 6) {
  const g = U.filter(m => m.u.kind == 'gnd'), fr = g.filter(m => m.ally && !REAR.has(m.cat) && !AIRDEF.has(m.cat)), en = g.filter(m => !m.ally && m.owner != 0 && !REAR.has(m.cat));
  if (fr.length < 2 || !en.length) return null;
  fr.forEach(m => { m.fd = Math.min(...en.map(e => Math.hypot(e.u.x - m.u.x, e.u.y - m.u.y))); });
  const ds = fr.map(m => m.fd).sort((a, b) => a - b), lim = Math.max(Math.min(ds[Math.floor(ds.length * 0.3)], 60), ds[Math.min(n, ds.length) - 1]);
  const cand = fr.filter(m => m.fd <= lim); if (cand.length < 2) return null;
  const mx = cand.reduce((s, m) => s + m.u.x, 0) / cand.length, my = cand.reduce((s, m) => s + m.u.y, 0) / cand.length;
  let cxx = 0, cyy = 0, cxy = 0; cand.forEach(m => { const a = m.u.x - mx, b = m.u.y - my; cxx += a * a; cyy += b * b; cxy += a * b; });
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy); let ax = Math.cos(th), ay = Math.sin(th); if (ax < -1e-9 || (Math.abs(ax) < 1e-9 && ay < 0)) { ax = -ax; ay = -ay; }
  cand.forEach(m => { m.t = (m.u.x - mx) * ax + (m.u.y - my) * ay; });
  const t0 = Math.min(...cand.map(m => m.t)), t1 = Math.max(...cand.map(m => m.t)), w = (t1 - t0) / n || 1, used = new Set(), out = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + i * w, b = a + w, mid = a + w / 2, free = cand.filter(m => !used.has(m));
    let pick = free.filter(m => m.t >= a && (m.t < b || i == n - 1)).sort((p, q) => p.fd - q.fd)[0];   // in its stretch of the front: the unit closest to the enemy
    if (!pick) pick = free.sort((p, q) => Math.abs(p.t - mid) - Math.abs(q.t - mid))[0];
    if (!pick) break; used.add(pick); out.push(pick);
  }
  return out.sort((p, q) => p.t - q.t).map(m => ({x: m.u.x, y: m.u.y, m}));
}
