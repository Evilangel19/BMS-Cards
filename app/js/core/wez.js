// @ts-check
// WEZ exposure time of a flight: when its flight plan is inside the range rings of the enemy SAMs (the rings of the map: the maximum range of the system,
// whatever the altitude). Pure maths on the campaign waypoints (x, y in km; arr, dep in ms) and the SAM list (x, y, rng in km).
// Between two steerpoints the aircraft flies straight at a constant speed (from the departure of one to the arrival at the next); a wait at a steerpoint
// (arrival -> departure) is spent on it. The plan ends at the first landing; steerpoints without a time are skipped.

/** the times [t0, t1] (ms) a leg from a (at ta) to b (at tb) is inside the circle (cx, cy, r); null when it never is */
function legIn(a, b, ta, tb, cx, cy, r) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    fx = a.x - cx,
    fy = a.y - cy,
    A = dx * dx + dy * dy,
    c = fx * fx + fy * fy - r * r;
  if (A < 1e-12) return c <= 0 && tb > ta ? [ta, tb] : null;
  const B = 2 * (fx * dx + fy * dy),
    D = B * B - 4 * A * c;
  if (D < 0) return null;
  const s = Math.sqrt(D),
    k0 = Math.max(0, (-B - s) / (2 * A)),
    k1 = Math.min(1, (-B + s) / (2 * A));
  if (k1 <= k0) return null;
  return [ta + (tb - ta) * k0, ta + (tb - ta) * k1];
}
/** sorted intervals joined where they touch or overlap */
export function joinIv(iv) {
  const s = iv
      .filter(v => v && v[1] > v[0])
      .map(v => [v[0], v[1]])
      .sort((p, q) => p[0] - q[0]),
    o = [];
  for (const v of s) {
    const l = o[o.length - 1];
    if (l && v[0] <= l[1] + 1) l[1] = Math.max(l[1], v[1]);
    else o.push(v);
  }
  return o;
}
const sum = iv => iv.reduce((t, v) => t + (v[1] - v[0]), 0);

/**
 * @param {{x:number,y:number,arr?:number,dep?:number,act?:number}[]} wps the waypoints of the flight (campaign)
 * @param {{x:number,y:number,rng:number,name?:string}[]} sams the SAMs that count (enemy, spotted, radar alive)
 * @returns {null | {t0:number,t1:number,ms:number,iv:number[][],per:{i:number,name:string,rng:number,ms:number,iv:number[][]}[],top:string}}
 *  t0 / t1: entry into the first ring and exit from the last; ms: the time really spent inside rings (overlapping rings counted once, the gaps not counted);
 *  per: every SAM crossed with its own time; top: the name of the crossed SAM with the largest ring. null when no ring is crossed.
 */
export function wezOf(wps, sams) {
  const end = (wps || []).findIndex((p, i) => i > 0 && p.act == 7),
    w = (end > 0 ? wps.slice(0, end + 1) : wps || []).filter(p => p.arr > 0);
  if (w.length < 2 || !sams || !sams.length) return null;
  const per = [];
  sams.forEach((s, i) => {
    if (!(s.rng > 0)) return;
    const iv = [];
    for (let k = 0; k < w.length; k++) {
      const a = w[k],
        dep = a.dep && a.dep > a.arr ? a.dep : a.arr;
      if (dep > a.arr && Math.hypot(a.x - s.x, a.y - s.y) <= s.rng) iv.push([a.arr, dep]);
      const b = w[k + 1];
      if (b && b.arr > dep) iv.push(legIn(a, b, dep, b.arr, s.x, s.y, s.rng));
    }
    const j = joinIv(iv);
    if (j.length && sum(j) >= 1000) per.push({ i, name: s.name || '', rng: s.rng, ms: sum(j), iv: j });
  });
  if (!per.length) return null;
  const all = joinIv(per.flatMap(p => p.iv)),
    top = per.slice().sort((p, q) => q.rng - p.rng)[0];
  return { t0: all[0][0], t1: all[all.length - 1][1], ms: sum(all), iv: all, per, top: top.name };
}
const hm = ms => {
  const s = Math.floor(ms / 1000) % 86400,
    q = n => String(n).padStart(2, '0');
  return q(Math.floor(s / 3600)) + ':' + q(Math.floor((s % 3600) / 60));
};
/** minutes of exposure as written: whole minutes, at least 1 */
export const wezMin = ms => Math.max(1, Math.round(ms / 60000));
/** "WEZ 12:41-13:05 9' SA-6" (the name of the largest ring crossed is left out with name = false) */
export function wezText(z, name = true) {
  if (!z) return '';
  return 'WEZ ' + hm(z.t0) + '-' + hm(z.t1) + ' ' + wezMin(z.ms) + "'" + (name && z.top ? ' ' + z.top : '');
}
/** the SAMs of the map that count for a flight: mapUnits() of its side, enemy, spotted, with a ring and a living radar */
export const wezSams = UL =>
  (UL || [])
    .filter(m => m.sam && !m.noFcr && m.hostile && m.spotted)
    .map(m => ({ x: m.u.x, y: m.u.y, rng: m.rng, name: m.name }));
