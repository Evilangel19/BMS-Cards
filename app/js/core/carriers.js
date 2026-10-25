// Aircraft carriers and amphibious ships. In the theater files a carrier is an objective row with the position 0,0 (it has no place) and the same airbase row as an airfield
// (TACAN channel, radio frequencies); in the campaign it is a naval unit that moves, and the squadrons on board name that unit (`airbase.n` = entity id of the unit).
// carriers(C) joins the two: [[objective id, name, x, y, ocd], ...] - a copy of the objective row with the position of the ship - with `.unit` on each row.
const SHIP = /^(USS|TAKR|CV-|CVN|LHD|LHA|HMS|JS )/, HULL = /\b(CVN?|LH[AD])-\d+\b/i;
const ALIAS = [[/type\s*001/i, 'liaoning'], [/type\s*002/i, 'shandong']];   // the name of the unit class and the name of the objective differ for the Chinese carriers
const CACHE = new WeakMap();
export function carriers(C) {
  if (!C || !C.D || !C.D.ob || !C.units) return [];
  if (CACHE.has(C)) return CACHE.get(C);
  const D = C.D, based = new Set(C.units.filter(q => q.kind == 'sqd' && q.airbase).map(q => q.airbase.n)), rows = D.ob.filter(o => SHIP.test(o[1]) && D.ab && D.ab[o[0]]), out = [];
  C.units.forEach(u => {
    if (u.kind != 'sea' || !u.c || !u.id || !based.has(u.id.n)) return;
    const cn = String(D.ac[u.c.i] || '').toLowerCase(), al = ALIAS.find(a => a[0].test(cn)), last = o => String(o[1]).trim().split(/\s+/).pop().toLowerCase();
    let cand = rows.filter(o => cn.includes(last(o)) || (al && last(o) == al[1]));
    if (cand.length > 1) { const h = cn.match(HULL); const by = h ? cand.filter(o => String(o[1]).toLowerCase().includes(h[0].toLowerCase())) : []; cand = by.length ? by : cand; }
    if (!cand.length) return;
    const r = cand[0].slice(); r[2] = u.x; r[3] = u.y; r.unit = u; out.push(r);
  });
  CACHE.set(C, out); return out;
}
// the carrier within `km` of a place (a steerpoint of take-off or recovery), nearest first; null when none
export function carrierNear(C, x, y, km = 25) {
  let b = null, bd = km; carriers(C).forEach(r => { const d = Math.hypot(r[2] - x, r[3] - y); if (d < bd) { bd = d; b = r; } });
  return b ? {row: b, d: bd} : null;
}
// TACAN channel ("10X") and UHF of a carrier row, '' when the airbase row has none
export function carrierRadio(C, r) {
  const a = C.D.ab[r[0]] || [], tcn = a[0] > 1 ? a[0] + (a[1] || 'X') : '', uhf = a[5] ? (a[5] / 1000).toFixed(3) : '';
  return {tcn, uhf};
}
