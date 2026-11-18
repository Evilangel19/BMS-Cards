// @ts-check
// Deconfliction of two attacks of one flight (lead and element, or lead and wingman). Pure functions, no DOM. A general estimate, not BMS code:
// - the path of each attack is the drawing of the Weapons page (phases in feet, north / east), with an altitude per phase (ingress altitude, apex,
//   release altitude, egress altitude) and a time from the release (negative before it) at the ground speed;
// - the fragments of the bombs of an attack fill, from the first impact to the last impact plus the time they keep falling, a cylinder around the first
//   and the last impact: the radius and the height of the lethal envelope of the bomb (lethal.js);
// - a conflict is a path that passes inside the fragment zone of the other attack, or two paths closer than SEP at about the same altitude. A conflict
//   holds whatever the timing: the spacing only says how many seconds after the lead the second attack must come to keep out of the fragments.
import { dist } from './popup.js';

export const SEP = 1500, // ft: two paths closer than this at about the same altitude
  SEP_ALT = 1000, // ft
  STEP = 250; // ft between the points of a path

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
  // the egress leaves from the release point (the drawing starts it at the target)
  const relP0 = pre[pre.length - 1],
    post = walk(
      segs
        .filter(z => z[0] == 'egress')
        .map((z, i) => (i == 0 && z[1].length > 1 ? [z[0], [{ n: relP0.n, e: relP0.e }, ...z[1].slice(1)]] : z))
    );
  // times: 0 at the release (the end of the run in), back along the run in, on along the egress
  let t = 0;
  for (let i = pre.length - 1; i >= 0; i--) {
    if (i < pre.length - 1) t -= dist(pre[i], pre[i + 1]) / fps;
    pre[i].t = t;
  }
  const relP = pre[pre.length - 1];
  t = 0;
  let last = relP;
  post.forEach(p => {
    t += dist(last, p) / fps;
    p.t = t;
    last = p;
  });
  return [...pre, ...post];
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

/** A = the first attack (the lead), B = the second; each {trk, zone}. Returns the conflict and the least spacing (s after the lead) that keeps each out of the
 * fragments of the other: B must not be in A's zone while A's fragments fall, and A must be past B's zone before B's bombs land. */
export function deconflict(A, B) {
  const inA = B.trk.filter(p => inZone(p, A.zone)),
    inB = A.trk.filter(p => inZone(p, B.zone));
  let need = 0;
  if (A.zone) inA.forEach(p => (need = Math.max(need, A.zone.t1 - p.t)));
  if (B.zone) inB.forEach(p => (need = Math.max(need, p.t - B.zone.t0)));
  // the closest approach of the two paths at about the same altitude
  let close = null;
  for (const a of A.trk)
    for (const b of B.trk) {
      if (Math.abs(a.alt - b.alt) >= SEP_ALT) continue;
      const d = dist(a, b);
      if (d < SEP && (!close || d < close.d)) close = { d, n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 };
    }
  return {
    frag: inA.length > 0 || inB.length > 0,
    fragAt: inA[0] || inB[0] || null,
    close,
    conflict: inA.length > 0 || inB.length > 0 || !!close,
    spacing: Math.ceil(need),
    zones: !!(A.zone && B.zone),
  };
}
