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
export const SAM_NM_S = 0.5; // the mean speed of a SAM missile (about Mach 3), for its time of flight to the protected flight (an estimate)
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
// the times to cover joined: [t0, t1, ingress]; overlapping ones are one (ingress if either is)
function joinNeed(v) {
  const o = [];
  v.filter(z => z[1] > z[0])
    .sort((a, b) => a[0] - b[0])
    .forEach(z => {
      const l = o[o.length - 1];
      if (l && z[0] <= l[1]) {
        l[1] = Math.max(l[1], z[1]);
        l[2] = l[2] || z[2];
      } else o.push([z[0], z[1], z[2]]);
    });
  return o;
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
 * @param {any[][]} [o.act] the waypoints of every flight of the package (yours too): the SAM radiates while any of them is inside its ring
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
  // the SAM radiates while any flight of the package is inside its ring (the protected ones, yours, the others): o.act
  const actW = (o.act || []).map(timed);
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
    // the time to cover: each time a protected flight is inside the ring, from when the SAM could shoot (the first one: at k of the radius; the next
    // ones, a re-entry on the way back or another flight: the same time after the entry); ingress until the task of that flight is done, egress after
    const lag = best.t85 - best.tin,
      need = joinNeed(
        all.map(([a, b, key]) => {
          const t0 = a <= best.tin + 1 && key == best.key ? best.t85 : Math.min(b, a + lag),
            tk = task[key];
          return [t0, b, !tk || t0 <= tk.t1];
        })
      ),
      on = joinIv([...all.map(v => [v[0], v[1]]), ...actW.flatMap(w => inside(w, s.x, s.y, s.rng))]),
      tk = task[best.key];
    rows.push({ id: s.id, sam: s, by, ...best, iv: all, need, on, task: tk, tEnd: tk ? tk.t1 : null, shots: [] });
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
  // the time a HARM covers [from, to]: from its launch (a HARM in the air keeps the SAM quiet), or earlier, the impact less the time of flight of a SAM
  // missile (one already flying loses its guidance when the HARM hits the radar), never before the SAM is on; to the end of its glide (its max range,
  // at most its 300 s of flight; none with no glide: its impact)
  function win(r, L, imp) {
    if (L.off) return [imp, imp];
    const end = o.glide === false ? imp : Math.max(imp, L.t + Math.min(MAX_FLIGHT_S, L.rMax / L.vm) * 1000),
      onAt = r.on.find(v => imp >= v[0] - 1 && imp <= v[1] + 1),
      dS = samDist(r, imp);
    return [Math.max(onAt ? onAt[0] : imp, Math.min(L.t, imp - (dS / SAM_NM_S) * 1000)), end];
  }
  // the time (ms) a window adds to the cover of what the protected flights need of a SAM
  function gain(r, [a, b]) {
    return r.need.reduce((g, [t0, t1]) => {
      const u0 = Math.max(a, t0),
        u1 = Math.min(b, t1);
      return u1 <= u0 ? g : g + uncovered(u0, u1, cov(r)).reduce((x, [p, q]) => x + q - p, 0);
    }, 0);
  }
  function addShot(r, imp0, first) {
    let imp = imp0;
    const key = r.shots.length ? r.id + '#' + (r.shots.length + 1) : r.id,
      aim = mode == 'pos' && r.ref ? r.ref : r.sam,
      m = o.seat && o.seat[key];
    let L = launchFor(W, { ...r, t85: imp, sam: { ...r.sam, x: aim.x, y: aim.y } }, o.shot, o.sams, r.sam);
    // a launch inside the ring of its SAM: the last launch before your flight enters it, the impact earlier (still while the SAM is on, or the HARM
    // finds it off). o.outside (Launch outside the rings): taken whenever there is one; else the one of the two that covers more of the time the
    // protected flights still need, the one outside when they cover the same (an earlier launch that covers none of it is never taken)
    if (!L.off && L.margin < 0) {
      const onAt = r.on.find(v => imp >= v[0] - 1 && imp <= v[1] + 1),
        E = earlierOut(W, aim, r.sam, L.t, onAt ? onAt[0] : imp, o.shot, o.sams);
      if (E) {
        const gE = gain(r, win(r, E, E.imp)),
          gL = gain(r, win(r, L, imp));
        if (o.outside ? true : gE > 0 && gE >= gL) {
          L = { ...E, moved: Math.round((L.t - E.t) / 1000), useless: gE <= 0 };
          imp = E.imp;
        } else L = { ...L, inside: true };
      }
    }
    let s = -1;
    if (m != null && m >= 0 && m < n) s = m;
    else {
      // Azimuth: the SAMs left of your route to #1 (and #3), right to #2 (and #4), all the HARMs of a SAM to the same aircraft when it can; Priority:
      // the next aircraft with a HARM
      const az = o.sort == 'az' && n > 1,
        same = az && r.shots.length ? [r.shots[0].seat] : [],
        side = az ? [...Array(n).keys()].filter(q => q % 2 == (r.az > 0 ? 1 : 0)) : [],
        pool = [...same, ...side, ...[...Array(n).keys()].map(j => (ptr + j) % n)];
      for (const q of pool)
        if (seatOk(q, L.t)) {
          s = q;
          break;
        }
    }
    if (s < 0 || (!first && (L.off || !L.ok))) return null; // an extra shot only when it can be flown
    const hand = m != null && s === m;
    if (left[s] > 0) left[s]--;
    if (!hand) ptr = s + 1;
    // its cover: from its launch (a HARM in the air keeps the SAM quiet), or earlier, the impact less the time of flight of a SAM missile (one
    // already flying loses its guidance when the HARM hits the radar), never before the SAM is on; to the end of its glide (its max range, at most its
    // 300 s of flight; none with no glide: its impact)
    const [start, end] = win(r, L, imp),
      z = {
        key,
        id: r.id,
        sam: r.sam,
        k: r.shots.length + 1,
        seat: s,
        hand,
        imp,
        cover: end,
        from: start,
        launch: L,
        ref: r.ref,
        mode,
      };
    r.shots.push(z);
    shots.push(z);
    return z;
  }
  // the distance (nm) from the SAM to the nearest protected flight inside its ring at a time (the flight of a SAM missile), else k of the radius
  const protW = o.prot.map(f => timed(f.wps)),
    samDist = (r, t) => {
      let d = (r.sam.rng * k) / KM_NM;
      protW.forEach(w => {
        const p = posAt(w, t);
        if (p) {
          const q = Math.hypot(p.x - r.sam.x, p.y - r.sam.y) / KM_NM;
          if (q < r.sam.rng / KM_NM) d = Math.min(d, q);
        }
      });
      return d;
    },
    cov = r => r.shots.map(z => [z.from, z.cover]);
  // 1) one HARM for each SAM, in the order of the sort, at k of its radius
  ord.forEach(r => {
    const z = addShot(r, r.t85, true);
    if (!z) r.noHarm = true;
  });
  // 2) the next times a protected flight comes inside a ring (the way back, another flight): a HARM for the first of each, so the egress has one too
  ord
    .filter(r => r.shots.length)
    .flatMap(r => r.need.slice(1).map(v => ({ r, v })))
    .sort((a, b) => a.v[0] - b.v[0])
    .forEach(({ r, v }) => {
      if (!left.some(q => q > 0)) return;
      if (cov(r).some(c => c[0] <= v[0] && c[1] > v[0])) return;
      addShot(r, v[0], false);
    });
  // 3) the HARMs left: on the parts not covered, ingress first, the earliest first; the HARM launched when the part begins (its time of flight
  // after it) and arriving while the SAM is on
  const blocked = new Set();
  for (let g = 0; g < 60 && left.some(v => v > 0); g++) {
    let pick = null;
    ord.forEach(r => {
      if (!r.shots.length) return;
      const tof = (r.shots[r.shots.length - 1].launch.tof || 45) * 1000;
      r.need.forEach(([a, b, ing]) =>
        uncovered(a, b, cov(r)).forEach(([u0, u1]) => {
          const onAt = r.on.find(v => u0 >= v[0] - 1 && u0 <= v[1]),
            t = Math.max(a, Math.min(u0 + tof, onAt ? onAt[1] : u1)),
            key = r.id + '@' + Math.round(u0 / 1000);
          if (blocked.has(key)) return;
          if (!pick || (ing && !pick.ing) || (ing == pick.ing && u0 < pick.u0))
            pick = { r, t, ing, key, u0, u1, a, onEnd: onAt ? onAt[1] : u1 };
        })
      );
    });
    if (!pick) break;
    // the launch at the start of the part: the impact moved by the difference (its time of flight changes with the range), a few rounds; the
    // impact kept inside the part and while the SAM is on
    const r = pick.r,
      aim = mode == 'pos' && r.ref ? r.ref : r.sam,
      lo = pick.a,
      hi = Math.max(lo, Math.min(pick.u1, pick.onEnd));
    let t = Math.min(hi, Math.max(lo, pick.t)),
      Lt = null;
    for (let i = 0; i < 4; i++) {
      const L = launchFor(W, { ...r, t85: t, sam: { ...r.sam, x: aim.x, y: aim.y } }, o.shot, o.sams, r.sam);
      Lt = L.off ? null : L.t;
      if (L.off || Math.abs(L.t - pick.u0) < 1500) break;
      t = Math.min(hi, Math.max(lo, t - (L.t - pick.u0)));
    }
    if (Lt == null || Lt >= pick.u1 - 1000) {
      blocked.add(pick.key);
      continue;
    }
    if (!addShot(r, t, false)) blocked.add(pick.key);
  }
  // the shots of a SAM numbered in the order they arrive (their keys stay: a seat chosen by hand keeps its shot)
  rows.forEach(r => {
    r.shots.sort((a, b) => a.imp - b.imp);
    r.shots.forEach((z, i) => (z.k = i + 1));
  });
  // what stays uncovered of each SAM, ingress and egress
  // before the first impact: from when the first flight enters the ring to when the first HARM covers (the SAM is taken to need until k of the
  // radius to shoot; shown, not planned)
  rows.forEach(r => {
    const f = r.shots.length ? Math.min(...r.shots.map(z => z.from)) : null,
      a = Math.max(r.tin, r.on.length ? r.on[0][0] : r.tin);
    r.pre = f != null && f - a > 1000 ? { t0: a, t1: f } : null;
  });
  rows.forEach(r => {
    r.gaps = r.shots.length
      ? r.need.flatMap(([a, b, ing]) => uncovered(a, b, cov(r)).map(([u0, u1]) => ({ t0: u0, t1: u1, ing })))
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
// a launch inside the ring of its SAM (sam0): back along your route, the last time you are still outside it (0.5 nm) and in HARM range of the aim,
// the HARM arriving not before t0 (the SAM on). The launch as launchFor gives it, with its impact; null when there is none in 10 minutes
function earlierOut(W, aim, sam0, t, t0, shot, sams) {
  for (let dt = 2000; dt <= 600000; dt += 2000) {
    const p = posAt(W, t - dt);
    if (!p) return null;
    if (Math.hypot(p.x - sam0.x, p.y - sam0.y) / KM_NM < sam0.rng / KM_NM + 0.5) continue;
    const d = Math.hypot(p.x - aim.x, p.y - aim.y) / KM_NM,
      h = shot(p, aim, d);
    if (d > h.rTh) return null; // farther back is farther away
    const tl = t - dt,
      imp = tl + (d / h.vm) * 1000;
    if (imp < t0) return null;
    return {
      t: tl,
      imp,
      x: p.x,
      y: p.y,
      hdg: p.hdg,
      brg: brg(aim.x - p.x, aim.y - p.y),
      altFt: p.altFt,
      gsKt: p.gsKt,
      leg: p.leg,
      from: p.from,
      d,
      tof: Math.round(d / h.vm),
      rTh: h.rTh,
      rMax: h.rMax,
      vm: h.vm,
      ok: true,
      margin: Math.hypot(p.x - sam0.x, p.y - sam0.y) / KM_NM - sam0.rng / KM_NM,
      rings: sams.filter(z => z.id !== sam0.id && Math.hypot(z.x - p.x, z.y - p.y) < z.rng).map(z => z.name),
      fix: null,
    };
  }
  return null;
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
