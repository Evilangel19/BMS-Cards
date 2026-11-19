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

// POS: the HARM flies to a steerpoint (of the flight plan or a PPT) and opens its seeker before it (EOM 8 nm, PB 13, RUK 30: airmissile HARM_SUB), narrow
// (EOM) or wide (PB, RUK). The SAM must be in what the seeker sees there: taken as a circle round the steerpoint, the seeker-on distance x the tangent of
// half the field of view (narrow 10 deg, wide 30 deg): EOM 1.4 nm, PB 7.5, RUK 17.3 (an estimate)
export const POS_AREA = {
  EOM: 8 * Math.tan((10 * Math.PI) / 180),
  PB: 13 * Math.tan((30 * Math.PI) / 180),
  RUK: 30 * Math.tan((30 * Math.PI) / 180),
};
export const MIN_GAP_S = 8; // the least time between two launches of one aircraft
const MAX_FLIGHT_S = 300; // the HARM data file: Final Time 300 s
const NON_ACT = new Set([0, 1, 2, 3, 4, 7, 8]); // nav, takeoff, push, split, refuel, land, holding: not the task of the flight
/** the task of a flight: the first steerpoint with an action (strike, CAS, CAP, ...) and how long it stays (the steerpoints with an action that follow
 * it, the time on station): {n, x, y, t0, t1, loiter} or null */
export function taskOf(wps) {
  const w = timed(wps),
    i = w.findIndex((p, k) => k > 0 && !NON_ACT.has(p.act));
  if (i < 0) return null;
  let j = i;
  while (j + 1 < w.length && !NON_ACT.has(w[j + 1].act)) j++;
  const t0 = w[i].arr,
    t1 = Math.max(dep(w[j]), w[j].arr);
  return { n: w[i].n, n1: w[j].n, x: w[i].x, y: w[i].y, x1: w[j].x, y1: w[j].y, t0, t1, loiter: t1 - t0 > 60000 };
}
// the parts of [t0, t1] not covered by the intervals iv
function uncovered(t0, t1, iv) {
  const o = [];
  let t = t0;
  iv.slice()
    .sort((a, b) => a[0] - b[0])
    .forEach(([a, b]) => {
      if (a > t) o.push([t, Math.min(a, t1)]);
      t = Math.max(t, b);
    });
  if (t < t1) o.push([t, t1]);
  return o.filter(z => z[1] - z[0] > 1000);
}

/**
 * @param {object} o
 * @param {{key:string,name:string,wps:any[]}[]} o.prot the protected flights
 * @param {{wps:any[],n:number,harms:number[]}} o.sead the SEAD flight: its waypoints, its aircraft, the HARMs of each
 * @param {{id:string,x:number,y:number,rng:number,name:string,code:number|null}[]} o.sams the SAMs that count (enemy, spotted, radar alive)
 * @param {number} [o.k] where the first HARM must arrive, a share of the ring radius from the SAM (0.85)
 * @param {'prio'|'az'} [o.sort]
 * @param {'pos'|'had'} [o.mode] POS: to a steerpoint (flight plan or PPT); HAD: at the SAM (it must be radiating)
 * @param {'EOM'|'PB'|'RUK'} [o.sub]
 * @param {{n:number,x:number,y:number,ppt?:boolean}[]} [o.refs] the steerpoints for POS: the flight plan and the PPTs of the DTC
 * @param {Object<string,number>} [o.ref] a steerpoint chosen by hand for a SAM (POS)
 * @param {boolean} [o.glide] the HARM glides on to its max range (no: Target Isolate and Glide Inhibit both on)
 * @param {Object<string,number>} [o.seat] seats chosen by hand (shot key -> 0..3; a SAM's first shot: its id, the next ones id#2, id#3...)
 * @param {Object<string,boolean>} [o.skip] the SAMs not to shoot
 * @param {(p:{x:number,y:number,altFt:number,gsKt:number}, aim:{x:number,y:number}, d:number) => {rTh:number, rMax:number, vm:number}} o.shot the HARM range
 *   at that aim (nm), its max range (nm) and mean speed (nm/s) from there
 */
export function seadPlan(o) {
  const k = o.k || 0.85,
    W = timed(o.sead.wps),
    mode = o.mode == 'had' ? 'had' : 'pos',
    sub = POS_AREA[o.sub] ? o.sub : 'EOM',
    area = POS_AREA[sub],
    est = W.some(p => p.est) || o.prot.some(f => timed(f.wps).some(p => p.est)),
    task = Object.fromEntries(o.prot.map(f => [f.key, taskOf(f.wps)])),
    rows = [];
  o.sams.forEach(s => {
    if (!(s.rng > 0)) return;
    let best = null;
    const by = [],
      all = [];
    o.prot.forEach(f => {
      const w = timed(f.wps),
        iv = inside(w, s.x, s.y, s.rng).filter(v => v[1] - v[0] >= 1000);
      if (!iv.length) return;
      by.push(f.name);
      all.push(...iv.map(v => [...v, f.key]));
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
          deep: !e,
        };
      }
    });
    if (!best) return;
    // the time to cover: inside the ring, from the first impact on; ingress until the task of the flight is done, egress after
    const tk = task[best.key],
      tEnd = tk ? tk.t1 : null,
      need = all
        .filter(v => v[1] > best.t85)
        .map(v => [Math.max(v[0], best.t85), v[1]])
        .sort((a, b) => a[0] - b[0]);
    rows.push({ id: s.id, sam: s, by, ...best, iv: all, need, task: tk, tEnd, shots: [] });
  });
  rows.sort((a, b) => a.t85 - b.t85);
  const act = rows.filter(r => !(o.skip && o.skip[r.id]));
  if (o.sort == 'az')
    act.forEach(r => {
      const p = posAt(W, r.t85 - 60000) || posAt(W, W.length ? W[0].arr : 0);
      r.az = p ? rel(brg(r.sam.x - p.x, r.sam.y - p.y) - p.hdg) : 0;
    });
  const ord = o.sort == 'az' ? act.slice().sort((a, b) => a.az - b.az) : act,
    n = Math.max(1, Math.min(4, o.sead.n || 1)),
    H = o.sead.harms && o.sead.harms.some(h => h > 0) ? o.sead.harms.slice(0, n) : null,
    left = Array.from({ length: n }, (_, i) => (H ? H[i] || 0 : 1)), // no AGM-88 in the loadout: one shot each
    shots = [];
  // the steerpoint of a SAM for POS: chosen by hand, else the PPT on it, else the nearest steerpoint of the flight plan that has it in the seeker's area
  const refs = o.refs || [],
    dNm = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / KM_NM,
    refFor = r => {
      if (mode != 'pos') return null;
      const h = o.ref && o.ref[r.id] != null ? refs.find(z => z.n == o.ref[r.id]) : null;
      if (h) return { ...h, hand: true, d: dNm(h, r.sam), inArea: dNm(h, r.sam) <= area };
      const p = refs.filter(z => z.ppt && dNm(z, r.sam) < 0.3)[0];
      if (p) return { ...p, d: dNm(p, r.sam), inArea: true };
      const f = refs
        .filter(z => !z.ppt)
        .map(z => ({ ...z, d: dNm(z, r.sam) }))
        .sort((a, b) => a.d - b.d)[0];
      return f ? { ...f, inArea: f.d <= area } : null;
    };
  ord.forEach(r => (r.ref = refFor(r)));
  // a shot of a SAM for an impact time: the seat (by hand, else the next one with a HARM and 8 s from its other launches), the launch, its cover
  const seatOk = (q, tl) =>
    left[q] > 0 && !shots.some(z => z.seat === q && z.launch && Math.abs(z.launch.t - tl) < MIN_GAP_S * 1000);
  let ptr = 0;
  function addShot(r, imp, first) {
    const key = r.shots.length ? r.id + '#' + (r.shots.length + 1) : r.id,
      aim = mode == 'pos' && r.ref ? r.ref : r.sam,
      L = launchFor(W, { ...r, t85: imp, sam: { ...r.sam, x: aim.x, y: aim.y } }, o.shot, o.sams, r.sam),
      m = o.seat && o.seat[key];
    let s = -1;
    if (m != null && m >= 0 && m < n) s = m;
    else
      for (let j = 0; j < n; j++) {
        const q = (ptr + j) % n;
        if (seatOk(q, L.t)) {
          s = q;
          break;
        }
      }
    if (s < 0 || (!first && (L.off || !L.ok))) return null; // an extra shot only when it can be flown
    const hand = m != null && s === m;
    if (left[s] > 0) left[s]--;
    if (!hand) ptr = s + 1;
    const cover = L.off
        ? imp
        : o.glide === false
          ? imp + 1000
          : Math.max(imp, L.t + Math.min(MAX_FLIGHT_S, L.rMax / L.vm) * 1000),
      z = { key, id: r.id, sam: r.sam, k: r.shots.length + 1, seat: s, hand, imp, cover, launch: L, ref: r.ref, mode };
    r.shots.push(z);
    shots.push(z);
    return z;
  }
  // 1) one HARM for each SAM, in the order of the sort, at k of its radius
  ord.forEach(r => {
    const z = addShot(r, r.t85, true);
    if (!z) r.noHarm = true;
  });
  // 2) the HARMs left: on the parts not covered, ingress first (the task of the flight), the next HARM arriving when the cover of the last one ends
  const blocked = new Set();
  for (let g = 0; g < 60 && left.some(v => v > 0); g++) {
    let pick = null;
    ord.forEach(r => {
      if (!r.shots.length) return;
      const cv = r.shots.map(z => [z.imp, z.cover]);
      r.need.forEach(([a, b]) =>
        uncovered(a, b, cv).forEach(([u0, u1]) => {
          // with the glide the next HARM arrives when the cover of the last one ends; without it the HARMs left are spread (the middle of the
          // longest part not covered)
          const t = o.glide === false ? (u0 + u1) / 2 : u0,
            ing = r.tEnd == null || u0 <= r.tEnd,
            key = r.id + '@' + Math.round(t / 1000);
          if (blocked.has(key) || (o.glide === false && u1 - u0 < 2 * MIN_GAP_S * 1000)) return;
          const better = pick && (o.glide === false ? u1 - u0 > pick.len : t < pick.t);
          if (!pick || (ing && !pick.ing) || (ing == pick.ing && better)) pick = { r, t, ing, key, len: u1 - u0 };
        })
      );
    });
    if (!pick) break;
    if (!addShot(pick.r, pick.t, false)) blocked.add(pick.key);
  }
  // what stays uncovered of each SAM, ingress and egress
  rows.forEach(r => {
    const cv = r.shots.map(z => [z.imp, z.cover]);
    r.gaps = r.shots.length
      ? r.need
          .flatMap(([a, b]) => uncovered(a, b, cv))
          .map(([a, b]) => ({ t0: a, t1: b, ing: r.tEnd == null || a <= r.tEnd }))
      : [];
  });
  shots.sort((a, b) => a.launch.t - b.launch.t);
  const L = seatLabels(n);
  return {
    rows,
    shots,
    est,
    mode,
    sub,
    area,
    task,
    seats: L.slice(0, n).map((l, i) => ({
      i,
      label: l,
      harms: H ? H[i] || 0 : null,
      used: shots.filter(z => z.seat === i).length,
    })),
    noLoadout: !H,
  };
}
// the launch for the impact at r.t85 at the aim point (r.sam: the SAM or, in POS, its steerpoint): the time of flight comes from the range from where
// the SEAD flight is then (a few rounds until it settles). sam0: the SAM itself (its ring, the margin)
function launchFor(W, r, shot, sams, sam0) {
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
  if (!q) return { t, off: true, rMax: 0, vm: 1, fix: fixFor(W, r, at, t) };
  const ok = q.d <= q.h.rTh,
    S0 = sam0 || s;
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
    vm: q.h.vm,
    ok,
    margin: Math.hypot(q.p.x - S0.x, q.p.y - S0.y) / KM_NM - S0.rng / KM_NM, // nm outside the SAM's ring (negative: inside)
    rings: sams.filter(z => z.id !== S0.id && Math.hypot(z.x - q.p.x, z.y - q.p.y) < z.rng).map(z => z.name),
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
