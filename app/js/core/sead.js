// @ts-check
// SEAD: HARM shots that protect the flights of a package. Pure maths on the campaign waypoints (x east, y north in km; arr, dep in ms) and the SAM list
// (x, y, rng in km), the same rings as the WEZ exposure time of the map. For each SAM crossed by a protected flight: when the flight enters the ring, when
// it is at k (85%) of the radius from the SAM (the HARM must be there then: the SAM needs time to lock and shoot), and where the SEAD flight is when it
// has to launch (impact time - time of flight, worked out again from where it is then). The times come from the flight plan; a steerpoint without a
// time gets one at 9 nm/min (Mach 0.9) from the last timed one. The shots are shared among the aircraft of the SEAD flight: Priority (the first threat
// reached to the lead, the next to #2 ...) or Azimuth (from left to right as seen from the SEAD flight), as many as each aircraft has HARMs.
import { legIn, joinIv } from './wez.js';

const KM_NM = 1.852;
export const BACKUP_NM_MIN = 9;
const brg = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
const rel = a => ((((a + 180) % 360) + 360) % 360) - 180;

/** the timed waypoints up to the first landing: {x, y, z, arr, dep, act, n (number of the steerpoint), est (time from the 9 nm/min rule)} */
export function timed(wps) {
  const W = wps || [],
    end = W.findIndex((p, i) => i > 0 && p.act == 7),
    w = (end > 0 ? W.slice(0, end + 1) : W).map((p, i) => ({ ...p, n: i + 1, est: false }));
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1],
      b = w[i];
    if (!(b.arr > 0) && a.arr > 0) {
      b.arr = (a.dep > a.arr ? a.dep : a.arr) + (Math.hypot(b.x - a.x, b.y - a.y) / KM_NM / BACKUP_NM_MIN) * 60000;
      b.est = true;
    }
  }
  return w.filter(p => p.arr > 0);
}
const dep = p => (p.dep > p.arr ? p.dep : p.arr);
/** where a flight is at time t (ms): {x, y, hdg, altFt, gsKt, leg (number of the steerpoint it comes from), from (nm from it)}, null when it is not flying then */
export function posAt(w, t) {
  if (!w.length || t < w[0].arr || t > dep(w[w.length - 1])) return null;
  for (let i = 0; i < w.length; i++) {
    const a = w[i],
      b = w[i + 1];
    if (t <= dep(a)) {
      return {
        x: a.x,
        y: a.y,
        hdg: b ? brg(b.x - a.x, b.y - a.y) : 0,
        altFt: Math.round(a.z * 10),
        gsKt: 0,
        leg: a.n,
        from: 0,
      };
    }
    if (b && t <= b.arr) {
      const t0 = dep(a),
        k = b.arr > t0 ? (t - t0) / (b.arr - t0) : 0,
        km = Math.hypot(b.x - a.x, b.y - a.y);
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        hdg: brg(b.x - a.x, b.y - a.y),
        altFt: Math.round((a.z + (b.z - a.z) * k) * 10),
        gsKt: b.arr > t0 ? Math.round(km / KM_NM / ((b.arr - t0) / 3600000)) : 0,
        leg: a.n,
        from: (km * k) / KM_NM,
      };
    }
  }
  return null;
}
/** the times [t0, t1] the flight is inside the circle (cx, cy, r km), joined */
export function inside(w, cx, cy, r) {
  const iv = [];
  for (let k = 0; k < w.length; k++) {
    const a = w[k],
      d = dep(a);
    if (d > a.arr && Math.hypot(a.x - cx, a.y - cy) <= r) iv.push([a.arr, d]);
    const b = w[k + 1];
    if (b && b.arr > d) iv.push(legIn(a, b, d, b.arr, cx, cy, r));
  }
  return joinIv(iv);
}
/** the time of the closest point of the flight to (cx, cy) inside [t0, t1] */
function closest(w, cx, cy, t0, t1) {
  let best = null,
    bd = Infinity;
  for (let t = t0; t <= t1; t += 1000) {
    const p = posAt(w, t);
    if (!p) continue;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}
export const seatLabels = n =>
  n >= 4
    ? ['#1 LEAD', '#2', '#3 ELEMENT', '#4']
    : n == 3
      ? ['#1 LEAD', '#2', '#3']
      : n == 2
        ? ['#1 LEAD', '#2']
        : ['#1'];

/**
 * @param {object} o
 * @param {{key:string,name:string,wps:any[]}[]} o.prot the protected flights
 * @param {{wps:any[],n:number,harms:number[]}} o.sead the SEAD flight: its waypoints, its aircraft, the HARMs of each
 * @param {{id:string,x:number,y:number,rng:number,name:string,code:number|null}[]} o.sams the SAMs that count (enemy, spotted, radar alive)
 * @param {number} [o.k] where the HARM must arrive, a share of the ring radius from the SAM (0.85)
 * @param {'prio'|'az'} [o.sort]
 * @param {Object<string,number>} [o.seat] seats chosen by hand (SAM id -> 0..3)
 * @param {Object<string,boolean>} [o.skip] the SAMs not to shoot
 * @param {(p:{x:number,y:number,altFt:number,gsKt:number}, s:any, d:number) => {rTh:number, rMax:number, vm:number}} o.shot the HARM range (nm) and mean speed (nm/s) from there
 */
export function seadPlan(o) {
  const k = o.k || 0.85,
    W = timed(o.sead.wps),
    est = W.some(p => p.est) || o.prot.some(f => timed(f.wps).some(p => p.est)),
    rows = [];
  o.sams.forEach(s => {
    if (!(s.rng > 0)) return;
    let best = null;
    const by = [];
    o.prot.forEach(f => {
      const w = timed(f.wps),
        iv = inside(w, s.x, s.y, s.rng).filter(v => v[1] - v[0] >= 1000);
      if (!iv.length) return;
      by.push(f.name);
      const v = iv[0],
        e = inside(w, s.x, s.y, s.rng * k).find(z => z[0] >= v[0] - 1 && z[0] <= v[1]),
        t85 = e ? e[0] : closest(w, s.x, s.y, v[0], v[1]);
      if (t85 == null) return;
      if (!best || t85 < best.t85) {
        const p = posAt(w, t85);
        best = {
          flight: f.name,
          key: f.key,
          tin: v[0],
          tout: v[1],
          ms: iv.reduce((a, z) => a + z[1] - z[0], 0),
          t85,
          p85: p ? { x: p.x, y: p.y } : { x: s.x, y: s.y },
          deep: !e, // the route never comes to k of the radius: the closest point
        };
      }
    });
    if (best) rows.push({ id: s.id, sam: s, by, ...best });
  });
  rows.sort((a, b) => a.t85 - b.t85);
  // the order of the shots: Priority (the first reached first) or Azimuth (left to right from the SEAD flight, a minute before the impact)
  const act = rows.filter(r => !(o.skip && o.skip[r.id]));
  if (o.sort == 'az')
    act.forEach(r => {
      const p = posAt(W, r.t85 - 60000) || posAt(W, W.length ? W[0].arr : 0);
      r.az = p ? rel(brg(r.sam.x - p.x, r.sam.y - p.y) - p.hdg) : 0;
    });
  const ord = o.sort == 'az' ? act.slice().sort((a, b) => a.az - b.az) : act,
    n = Math.max(1, Math.min(4, o.sead.n || 1)),
    H = o.sead.harms && o.sead.harms.some(h => h > 0) ? o.sead.harms.slice(0, n) : null,
    left = Array.from({ length: n }, (_, i) => (H ? H[i] || 0 : Infinity));
  let ptr = 0;
  ord.forEach(r => {
    const m = o.seat && o.seat[r.id];
    if (m != null && m >= 0 && m < n) {
      r.seat = m;
      r.hand = true;
      if (left[m] > 0) left[m]--;
      else r.noHarm = true;
      return;
    }
    let s = -1;
    for (let j = 0; j < n; j++) {
      const q = (ptr + j) % n;
      if (left[q] > 0) {
        s = q;
        break;
      }
    }
    if (s < 0) {
      r.seat = null;
      r.noHarm = true;
      return;
    }
    r.seat = s;
    left[s]--;
    ptr = s + 1;
  });
  // the launch of each shot: from where the SEAD flight is then
  act.forEach(r => (r.launch = launchFor(W, r, o.shot, o.sams)));
  const L = seatLabels(n);
  return {
    rows,
    est,
    seats: L.slice(0, n).map((l, i) => ({
      i,
      label: l,
      harms: H ? H[i] || 0 : null,
      used: act.filter(r => r.seat === i).length,
    })),
    noLoadout: !H,
  };
}
// the launch for the impact at r.t85: the time of flight comes from the range from where the SEAD flight is then (a few rounds until it settles)
function launchFor(W, r, shot, sams) {
  const s = r.sam,
    at = t => {
      const p = posAt(W, t);
      if (!p) return null;
      const d = Math.hypot(p.x - s.x, p.y - s.y) / KM_NM,
        h = shot(p, s, d);
      return { p, d, h };
    };
  let tof = 60,
    q = null;
  for (let i = 0; i < 8; i++) {
    q = at(r.t85 - tof * 1000);
    if (!q) break;
    const nt = q.d / q.h.vm;
    if (Math.abs(nt - tof) < 0.3) {
      tof = nt;
      break;
    }
    tof = nt;
  }
  const t = r.t85 - tof * 1000;
  q = at(t);
  if (!q) return { t, off: true, fix: fixFor(W, r, at, t) };
  const ok = q.d <= q.h.rTh;
  return {
    t,
    x: q.p.x,
    y: q.p.y,
    hdg: q.p.hdg,
    brg: brg(s.x - q.p.x, s.y - q.p.y),
    altFt: q.p.altFt,
    gsKt: q.p.gsKt,
    leg: q.p.leg,
    from: q.p.from,
    d: q.d,
    tof: Math.round(tof),
    rTh: q.h.rTh,
    rMax: q.h.rMax,
    ok,
    margin: (q.d - s.rng / KM_NM) * 1, // nm outside this SAM's ring (negative: inside)
    rings: sams.filter(z => z !== s && Math.hypot(z.x - q.p.x, z.y - q.p.y) < z.rng).map(z => z.name),
    fix: ok ? null : fixFor(W, r, at, t),
  };
}
// out of range (or not flying then): the nearest launch time from which the HARM reaches, and its impact
function fixFor(W, r, at, t) {
  for (let dt = 2000; dt <= 600000; dt += 2000)
    for (const sg of [1, -1]) {
      const q = at(t + sg * dt);
      if (q && q.d <= q.h.rTh)
        return { dt: (sg * dt) / 1000, t: t + sg * dt, impact: t + sg * dt + (q.d / q.h.vm) * 1000 };
    }
  return null;
}
