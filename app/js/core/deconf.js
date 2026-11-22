// @ts-check
// Deconfliction of two attacks of one flight (lead and element, or lead and wingman). Pure functions, no DOM. A general estimate, not BMS code:
// - the path of each attack is the drawing of the A-G page up to the release (phases in feet, north / east), then straight on and out on the egress
//   heading, with an altitude per phase (ingress altitude, apex, release altitude, egress altitude) and a time from the release (negative before it) at
//   the ground speed;
// - the fragments of the bombs of an attack fill, from the first impact to the last impact plus the time they keep falling, a cylinder around the first
//   and the last impact: the radius and the height of the lethal envelope of the bomb (lethal.js);
// - the spacing: how many seconds after the lead the second attack must come to keep out of the fragments of the other (a path inside the fragment
//   zone of the other attack is a conflict the timing clears, unless an attack parameter can keep it out);
// - two aircraft closer than SEP at about the same altitude and the same time (the second flying the spacing after the first) are a conflict: the
//   spacing grows to keep them apart (up to MAX_DT); what no spacing clears stays a conflict of the attacks themselves.
// - the two fly together up to the split point (fromSplit): only what follows it is checked, and the times count from it; they leave it together, so
//   their first SEP after it are not taken for paths too close.
import { dist, project } from './popup.js';

export const SEP = 1500, // ft: two paths closer than this at about the same altitude
  SEP_ALT = 1000, // ft
  SEP_T = 3, // s: about the same time
  MAX_DT = 90, // s: the most the spacing may add to keep the two apart in the air
  STEP = 250, // ft between the points of a path
  POST_STRAIGHT = 3000, // ft straight on after the release
  POST_EGRESS = 12000; // ft on the egress heading

const PRE = ['ingress', 'climb', 'pull', 'dive'];

// the path of an attack: [{n, e, alt, t}] from its drawing (segs: [[phase, [{n, e}...]]...]), its values (r.v) and its kind ('popup', 'hadb', 'toss')
export function attackTrack(segs, v, kind) {
  const num = x => (typeof x == 'number' && isFinite(x) ? x : null),
    rel = num(v.releaseAltitude) ?? 0,
    ia = num(v.ingressAltitude) ?? num(v.trackAltitude) ?? rel,
    ap = num(v.apexAltitude) ?? Math.max(ia, rel),
    ALT = {
      ingress: [ia, ia],
      climb: kind == 'toss' ? [ia, rel] : [ia, ap],
      pull: kind == 'toss' ? [ia, ia] : [ap, ap],
      dive: [num(v.trackAltitude) ?? ap, rel],
      egress: [rel, num(v.egressAltitude) ?? rel],
    },
    fps = Math.max(150, num(v.groundSpeed) || num(v.releaseSpeed) || num(v.ingressSpeed) || 450) * 1.6878;
  // the points of a list of segments, each with its altitude
  const walk = list => {
    const out = [];
    list.forEach(([k, pts]) => {
      const [a0, a1] = ALT[k] || [rel, rel];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        if (i) {
          const d = dist(pts[i - 1], pts[i]),
            n = Math.max(1, Math.ceil(d / STEP));
          for (let j = 1; j <= n; j++) {
            const f = j / n,
              ss = s + d * f;
            out.push({
              n: pts[i - 1].n + (pts[i].n - pts[i - 1].n) * f,
              e: pts[i - 1].e + (pts[i].e - pts[i - 1].e) * f,
              alt: a0 + (a1 - a0) * (len ? ss / len : 1),
              k,
            });
          }
          s += d;
        } else if (!out.length) out.push({ ...pts[0], alt: a0, k });
      }
    });
    return out;
  };
  const pre = walk(segs.filter(z => PRE.includes(z[0])));
  if (!pre.length) return [];
  // after the release (the drawing has no flown egress: its egress lines are the OA lines from the target): straight on along the attack heading
  // while the bombs leave and the pull starts, then on the egress heading
  const relP0 = pre[pre.length - 1],
    A = num(v.attackHeading),
    E = num(v.egressHeading) ?? A,
    p1 = A == null ? null : project(relP0, A, POST_STRAIGHT),
    post = p1 ? walk([['egress', [{ n: relP0.n, e: relP0.e }, p1, project(p1, E, POST_EGRESS)]]]) : [];
  // times: 0 at the release (the end of the run in), back along the run in, on along the egress
  let t = 0;
  for (let i = pre.length - 1; i >= 0; i--) {
    if (i < pre.length - 1) t -= dist(pre[i], pre[i + 1]) / fps;
    pre[i].t = t;
  }
  const relP = pre[pre.length - 1];
  t = 0;
  post.forEach(p => (p.post = true)); // after the release
  let last = relP;
  post.forEach(p => {
    t += dist(last, p) / fps;
    p.t = t;
    last = p;
  });
  return [...pre, ...post];
}

/** the part of a path from the point where the two attacks split (before it they fly together, in formation): its times, and those of the fragment zone,
 * counted from that point. sp {n, e}: the nearest point of the run in is taken (none: the whole path, times from the release). */
export function fromSplit(trk, zone, sp) {
  if (!sp || !trk.length) return { trk, zone };
  let k = 0,
    best = Infinity;
  trk.forEach((p, i) => {
    const d = dist(p, sp);
    if (p.t <= 0 && d < best) {
      best = d;
      k = i;
    }
  });
  const t0 = trk[k].t;
  let s = 0;
  return {
    // s: the distance flown from the split point (the two leave it together: the first SEP do not count as close)
    trk: trk.slice(k).map((p, i, a) => ({ ...p, t: p.t - t0, s: (s += i ? dist(a[i - 1], p) : 0) })),
    zone: zone && { ...zone, t0: zone.t0 - t0, t1: zone.t1 - t0, pts: zone.pts.map(c => ({ ...c, t: c.t - t0 })) },
  };
}

// the fragments of an attack: its first and last impact (each with its time from the release) and the bomb's model of the fragments in space and
// time (frag.js); t0 / t1 the first impact and the end of the fall of the last
export function fragZone(r, env) {
  if (!env || !env.model || !r || !r.impacts || !r.impacts.length) return null;
  const v = r.v || {},
    I = r.impacts,
    tof = v.timeOfFall || 0;
  return {
    pts: [I[0], I[I.length - 1]]
      .filter((q, i, a) => a.indexOf(q) === i)
      .map(q => ({ n: q.n, e: q.e, t: tof + (q.t || 0) })),
    env,
    out: env.out,
    up: env.up,
    t0: tof + Math.min(...I.map(q => q.t || 0)),
    t1: tof + Math.max(...I.map(q => q.t || 0)) + env.t,
  };
}
const PAD = 1; // s around each window of the fragments (the model is read from graphs)

/** A = the first attack (the lead), B = the second; each {trk, zone}; opt.shared: one egress for the two, a visual rejoin after the release (the
 * paths are not checked against each other there, the fragments are). The second flies dt after the first: each point of a path is in the fragments
 * of the other only while they pass it (its window, frag.js), so each point forbids an interval of dt; the spacing is the least dt >= 0 out of every
 * interval that also keeps the two apart in the air. Returns the conflict (flown together, dt 0), the spacing and what sets it. */
export function deconflict(A, B, opt = {}) {
  const I = [];
  // B inside A's fragments: B at dt + p.t, A's impact at c.t: dt + p.t - c.t in the window
  if (A.zone)
    B.trk.forEach(p =>
      A.zone.pts.forEach(c => {
        const w = A.zone.env.model.win(dist(c, p), p.alt);
        if (w) I.push({ lo: c.t + w[0] - p.t - PAD, hi: c.t + w[1] - p.t + PAD, p, c, me: 'B' });
      })
    );
  // A inside B's fragments: B's impact at dt + c.t: p.t - dt - c.t in the window
  if (B.zone)
    A.trk.forEach(p =>
      B.zone.pts.forEach(c => {
        const w = B.zone.env.model.win(dist(c, p), p.alt);
        if (w) I.push({ lo: p.t - c.t - w[1] - PAD, hi: p.t - c.t - w[0] + PAD, p, c, me: 'A' });
      })
    );
  const hot = I.filter(x => x.lo <= 0 && x.hi >= 0),
    hotA = hot.filter(x => x.me == 'A').map(x => x.p),
    hotB = hot.filter(x => x.me == 'B').map(x => x.p);
  // the two aircraft at about the same place, altitude and time, the second dt after the first (the paths are in time order: a window of B)
  const fresh = p => p.s != null && p.s < SEP;
  const closeAt = (dt, all) => {
    let c = null,
      j0 = 0;
    for (const a of A.trk) {
      if (fresh(a) || (opt.shared && a.post)) continue;
      while (j0 < B.trk.length && B.trk[j0].t + dt < a.t - SEP_T) j0++;
      for (let j = j0; j < B.trk.length && B.trk[j].t + dt <= a.t + SEP_T; j++) {
        const b = B.trk[j];
        if (Math.abs(a.alt - b.alt) >= SEP_ALT || fresh(b) || (opt.shared && b.post)) continue;
        const d = dist(a, b);
        if (d < SEP && (!c || d < c.d)) {
          c = { d, n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 };
          if (!all) return c;
        }
      }
    }
    return c;
  };
  // the least spacing: out of every interval of the fragments, then apart in the air, up to MAX_DT
  let dt = 0,
    by = null,
    met = false,
    close = null,
    dtF = null; // the spacing the fragments alone ask
  for (let guard = 0; guard < 400; guard++) {
    const inside = I.filter(x => x.lo <= dt && x.hi >= dt);
    if (inside.length) {
      by = inside.reduce((m, x) => (x.hi > m.hi ? x : m));
      dt = by.hi + 0.01;
      continue;
    }
    const t = Math.ceil(dt);
    if (t > dt && I.some(x => x.lo <= t && x.hi >= t)) {
      dt = t;
      continue;
    }
    dt = t;
    if (dtF == null) dtF = dt;
    const c = closeAt(dt, false);
    if (!c) break;
    met = true;
    if (dt >= dtF + MAX_DT) {
      close = closeAt(dt, true);
      break;
    }
    by = { air: true };
    dt += 1;
  }
  const frag = hot.length > 0;
  return {
    frag, // flown together, one is inside the other's fragments
    fragAt: hotB[0] || hotA[0] || null,
    inA: hotB[0] || null, // the first point of B inside A's fragments (flown together)
    inB: hotA[0] || null, // the first point of A inside B's
    hotA, // the points of A inside B's fragments when flown together
    hotB,
    by: dt > 0 && by ? (by.air ? { air: true } : { p: by.p, c: by.c, me: by.me }) : null, // what sets the spacing
    close, // together in the air whatever the spacing (up to MAX_DT): a conflict of the attacks themselves
    met: met && !close, // flown with the spacing of the fragments alone they would meet in the air
    conflict: frag || met || !!close,
    spacing: Math.ceil(dt),
    zones: !!(A.zone && B.zone),
  };
}
