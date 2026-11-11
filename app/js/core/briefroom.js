// Briefing room: the rules without the screen (roles, who leads the room, the drawings, distances and bearings), so they can be tested in Node.
// The screen and the network are in core/briefing.js.

export const NM = 1852;
const R_E = 6371008.8,
  rad = d => (d * Math.PI) / 180,
  deg = r => (r * 180) / Math.PI;

// ---- the earth: great-circle distance (m), true bearing (degrees), the point at a distance and bearing
export function dist(a, b) {
  const p1 = rad(a[0]),
    p2 = rad(b[0]),
    dp = p2 - p1,
    dl = rad(b[1] - a[1]);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_E * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function brg(a, b) {
  const p1 = rad(a[0]),
    p2 = rad(b[0]),
    dl = rad(b[1] - a[1]);
  const t = Math.atan2(
    Math.sin(dl) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  );
  return (deg(t) + 360) % 360;
}
export function dest(a, b, d) {
  const p1 = rad(a[0]),
    l1 = rad(a[1]),
    t = rad(b),
    dr = d / R_E;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), deg(l2)];
}
// ---- what the ruler and the compass write: 34.9 NM, 081, 64.7 km, 212 300 ft
export const pad3 = n => String(((Math.round(n) % 360) + 360) % 360).padStart(3, '0');
export const fmtNm = m => {
  const n = m / NM;
  return (n < 100 ? n.toFixed(1) : String(Math.round(n))) + ' NM';
};
export const fmtKm = m => (m < 100000 ? (m / 1000).toFixed(1) : String(Math.round(m / 1000))) + ' km';
export const fmtFt = m => String(Math.round((m * 3.28084) / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ft';

// ---- roles in the squadron (q: the squadron, ov: orgView(q)). The leaders can open the room and be the briefer.
export function roleOf(q, ov, uid) {
  if (!q || !uid) return { role: 'Pilot', lead: false };
  const pk = ov ? ov.packages : [],
    flights = pk.some(p => p.flights.length > 0);
  if (q.owner === uid) return { role: 'Commander', lead: true };
  if (q.mc === uid) return { role: 'Mission commander', lead: true };
  if (pk.some(p => p.lead === uid)) return { role: 'Package lead', lead: true };
  if (pk.some(p => p.flights.some(f => f.lead === uid))) return { role: 'Flight lead', lead: true };
  if (!flights && q.leader === uid) return { role: 'Mission leader', lead: true };
  if (ov && ov.seat && ov.seat[uid]) return { role: 'Wingman', lead: false };
  return { role: 'Pilot', lead: false };
}
// order in the list: the briefer, who has a pen, me, the leaders, then by name
export function listOrder(room, meUid, members) {
  const pens = room.pens || [];
  const rank = m => (m.uid === room.briefer ? 0 : pens.includes(m.uid) ? 1 : m.uid === meUid ? 2 : m.lead ? 3 : 4);
  return members
    .slice()
    .sort((a, b) => rank(a) - rank(b) || String(a.n).localeCompare(String(b.n), 'en', { numeric: true }));
}
// who becomes the briefer when there is none (the room was just opened, or the briefer left): the leader who came in first
export function nextBriefer(members) {
  const l = members.filter(m => m.lead).sort((a, b) => a.joined - b.joined || (a.uid < b.uid ? -1 : 1));
  return l.length ? l[0].uid : null;
}
// a newer room state wins; at the same version the one of the briefer
export function roomNewer(mine, theirs) {
  if (!theirs || typeof theirs != 'object') return false;
  if ((theirs.v || 0) != (mine.v || 0)) return (theirs.v || 0) > (mine.v || 0);
  return theirs.by === theirs.briefer && mine.by !== mine.briefer;
}
export const canDraw = (room, uid) => !!uid && (room.briefer === uid || (room.pens || []).includes(uid));

// ---- the drawings: kinds and their points; an object that comes from the network is checked before it is kept
export const KINDS = [
  'pen',
  'mark',
  'line',
  'arrow',
  'box',
  'circle',
  'text',
  'sym',
  'ab',
  'trk',
  'pt',
  'tgt',
  'bull',
  'orbit',
  'hold',
  'ring',
  'ruler',
  'comp',
];
export const SIDES = ['hostile', 'friend', 'neutral', 'unknown'];
const okLL = p => Array.isArray(p) && p.length == 2 && p.every(v => Number.isFinite(v)) && Math.abs(p[0]) <= 90;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
export const MAX_PTS = 4000,
  MAX_OBJS = 3000;
export function cleanObj(o) {
  if (!o || typeof o != 'object' || !KINDS.includes(o.k) || typeof o.id != 'string' || o.id.length > 60) return null;
  const r = { id: o.id, k: o.k, by: str(o.by, 40), col: /^#[0-9a-f]{6}$/i.test(o.col) ? o.col : '#ffffff' };
  r.w = Math.max(1, Math.min(12, +o.w || 3));
  for (const f of ['a', 'b', 'at', 'c'])
    if (o[f] !== undefined) {
      if (!okLL(o[f])) return null;
      r[f] = [+o[f][0], +o[f][1]];
    }
  if (o.pts !== undefined) {
    if (!Array.isArray(o.pts) || !o.pts.length || o.pts.length > MAX_PTS || !o.pts.every(okLL)) return null;
    r.pts = o.pts.map(p => [+p[0], +p[1]]);
  }
  if (o.side !== undefined) r.side = SIDES.includes(o.side) ? o.side : 'unknown';
  if (o.lab !== undefined) r.lab = str(o.lab, 60);
  if (o.k == 'text') {
    r.txt = str(o.txt, 600);
    r.size = Math.max(10, Math.min(40, +o.size || 18));
  }
  if (o.k == 'sym') r.g = str(o.g, 12);
  if (o.k == 'pt') r.code = o.code == 'CP' ? 'CP' : 'IP';
  if (o.k == 'trk') {
    r.hdg = (((+o.hdg || 0) % 360) + 360) % 360;
    r.cs = str(o.cs, 20);
    r.fl = Math.max(0, Math.min(999, Math.round(+o.fl || 0)));
    r.spd = Math.max(0, Math.min(3000, Math.round(+o.spd || 0)));
  }
  if (o.k == 'ring') r.r = Math.max(0, Math.min(2e6, +o.r || 0));
  const need = {
    pen: ['pts'],
    mark: ['pts'],
    line: ['a', 'b'],
    arrow: ['a', 'b'],
    box: ['a', 'b'],
    circle: ['a', 'b'],
    ruler: ['a', 'b'],
    comp: ['a', 'b'],
    orbit: ['a', 'b'],
    hold: ['a', 'b'],
    ring: ['c'],
    text: ['at'],
    sym: ['at'],
    ab: ['at'],
    trk: ['at'],
    pt: ['at'],
    tgt: ['at'],
    bull: ['at'],
  }[o.k];
  if (!need.every(f => r[f])) return null;
  return r;
}
// move an object: every point by the same amount
export function shiftObj(o, dLat, dLng) {
  const n = JSON.parse(JSON.stringify(o)),
    s = ll => [ll[0] + dLat, ll[1] + dLng];
  ['a', 'b', 'at', 'c'].forEach(f => {
    if (n[f]) n[f] = s(n[f]);
  });
  if (n.pts) n.pts = n.pts.map(s);
  return n;
}
// the colour of a pilot (cursor, dot in the list), always the same for the same pilot
const PILOT_COLS = [
  '#f5c842',
  '#38bdf8',
  '#fb923c',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#93c5fd',
  '#fca5a5',
  '#86efac',
  '#fde68a',
  '#c4b5fd',
  '#fdba74',
  '#67e8f9',
  '#bef264',
];
export function pilotColour(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PILOT_COLS[h % PILOT_COLS.length];
}

// ---- the weather of the room (chosen by the briefer): the filter of the Weather page, the hour (ms of the campaign, null = the campaign map), the layer of the wind, the opacity
export const WX_KINDS = ['off', 'cond', 'wind', 'temp', 'press', 'cloud', 'vis'];
export function cleanWx(w) {
  if (!w || typeof w != 'object' || !WX_KINDS.includes(w.mode)) return { mode: 'off', ms: null, lv: 0, op: 80 };
  return {
    mode: w.mode,
    ms: Number.isFinite(w.ms) ? Math.round(w.ms) : null,
    lv: Math.max(0, Math.min(9, Math.round(+w.lv || 0))),
    op: Math.max(10, Math.min(100, Math.round(+w.op || 80))),
  };
}
