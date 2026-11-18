// @ts-check
// Deconfliction of two attacks of one flight (lead and element, or lead and wingman). Pure functions, no DOM. A general estimate, not BMS code:
// - the path of each attack is the drawing of the Weapons page up to the release (phases in feet, north / east), then straight on and out on the egress
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
            });
          }
          s += d;
        } else if (!out.length) out.push({ ...pts[0], alt: a0 });
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
    zone: zone && { ...zone, t0: zone.t0 - t0, t1: zone.t1 - t0 },
  };
}

// the fragment zone of an attack: around its first and last impact, while the fragments fall (times from its release)
export function fragZone(r, env) {
  if (!env || !r || !r.impacts || !r.impacts.length) return null;
  const v = r.v || {},
    I = r.impacts,
    t0 = (v.timeOfFall || 0) + Math.min(...I.map(q => q.t || 0));
  return {
    pts: [I[0], I[I.length - 1]].filter((q, i, a) => a.indexOf(q) === i).map(q => ({ n: q.n, e: q.e })),
    out: env.out,
    up: env.up,
    t0,
    t1: (v.timeOfFall || 0) + Math.max(...I.map(q => q.t || 0)) + env.t,
  };
}
const inZone = (p, z) => !!z && p.alt < z.up && z.pts.some(c => dist(c, p) < z.out);

/** A = the first attack (the lead), B = the second; each {trk, zone}; opt.shared: one egress for the two, a visual rejoin after the release (the
 * paths are not checked against each other there, the fragments are). Returns the conflict and the least spacing (s after the lead) that keeps each out of the
 * fragments of the other: B must not be in A's zone while A's fragments fall, and A must be past B's zone before B's bombs land. */
export function deconflict(A, B, opt = {}) {
  const inA = B.trk.filter(p => inZone(p, A.zone)),
    inB = A.trk.filter(p => inZone(p, B.zone));
  let need = 0;
  if (A.zone) inA.forEach(p => (need = Math.max(need, A.zone.t1 - p.t)));
  if (B.zone) inB.forEach(p => (need = Math.max(need, p.t - B.zone.t0)));
  // the closest approach of the two aircraft: at about the same place, altitude and time, the second one flying dt after the first (two paths that
  // cross over the target at different times are not too close; two that leave the split point together are not either)
  const fresh = p => p.s != null && p.s < SEP;
  const closeAt = dt => {
    let c = null;
    for (const a of A.trk)
      for (const b of B.trk) {
        if (
          Math.abs(a.alt - b.alt) >= SEP_ALT ||
          fresh(a) ||
          fresh(b) ||
          (opt.shared && (a.post || b.post)) ||
          Math.abs(a.t - (b.t + dt)) > SEP_T
        )
          continue;
        const d = dist(a, b);
        if (d < SEP && (!c || d < c.d)) c = { d, n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 };
      }
    return c;
  };
  // the spacing keeps them out of the fragments and apart in the air: the least one that does both, up to MAX_DT more
  let dt = Math.ceil(need),
    close = closeAt(dt);
  const met = close;
  for (let k = 1; close && k <= MAX_DT; k++) {
    const c = closeAt(dt + k);
    if (!c) {
      dt += k;
      close = null;
    }
  }
  return {
    frag: inA.length > 0 || inB.length > 0,
    fragAt: inA[0] || inB[0] || null,
    inA: inA[0] || null, // the first point of B inside A's fragment zone
    inB: inB[0] || null, // the first point of A inside B's
    close,
    met: !!met, // together in the air with the spacing of the fragments alone (the timing then takes more)
    conflict: inA.length > 0 || inB.length > 0 || !!close || !!met,
    spacing: dt,
    zones: !!(A.zone && B.zone),
  };
}
