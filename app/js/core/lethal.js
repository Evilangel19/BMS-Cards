// Fragmentation area (lethality), minimum acceptable release altitude (MRA) and safe escape of a bomb drop. Pure functions, no DOM.
// Source: TO 1F-16CMAM-34-1-1 BMS, 4.2.15 (the three minimum release altitudes), 4.2.16 (safe escape manoeuvres) and the lethality graphs of the
// general-purpose bombs. The numbers are READ FROM THE GRAPHS (a general estimate, not BMS code): 500 lb class (MK-82) about 3 600 ft out, 2 450 ft up,
// 25 s; 2 000 lb class (MK-84) about 3 700 ft out, 2 500 ft up, 27 s. The 1 000 lb class is interpolated by weight (approximate).
// Only free-fall general-purpose bombs: cluster, incendiary, armour-piercing and other special bombs are not covered (bombClass answers null).
import {bombFall, FT_KT} from './popup.js';

const G0 = 32.2, rad = d => d * Math.PI / 180;
export const PULL_G = 5, PULL_DELAY = 2, BUFFER = 120, ARM_MARGIN = .5;   // 5 G pull, begun 2 s after the last release; 120 ft ground clearance; the SMS arming delay needs this much more than the arming delay (tolerance and inherent delay, assumed)

// lethal envelope of a bomb of `lb` pounds: radius on the ground (ft), height (ft), time the fragments keep falling after the impact (s)
export function envelope(lb) {
  lb = +lb; if (!(lb > 0)) return null;
  const f = Math.min(1, Math.max(0, (lb - 500) / 1500)), mix = (a, b) => a + (b - a) * f;
  return {lb, out: mix(3600, 3700), up: mix(2450, 2500), t: mix(25, 27), approx: lb !== 500 && lb !== 2000};
}

// a loadout weapon name -> {lb} for the free-fall general-purpose bombs the model covers, null for everything else
const OUT = /CBU|ROCKEYE|MK-?20\b|BLU|NAPALM|MK-?77|FAE|JSOW|AGM|WCMD|SFW|DURANDAL|RBK|KAB|ODAB|BL-?755|MK-?81\b|M-?117|GBU-?(24|27|28|15|39|53)|PRACTICE|BDU|INERT|LEAFLET|DISPENSER/i;
export function bombClass(name) {
  const n = String(name || ''); if (!n || OUT.test(n)) return null;
  if (/MK-?82|GBU-?(12|38|54)(?!\d)/i.test(n)) return {lb: 500};
  if (/MK-?83|GBU-?(16|32)(?!\d)/i.test(n)) return {lb: 1000};
  if (/MK-?84|GBU-?(10|31)(?!\d)/i.test(n)) return {lb: 2000};
  return null;
}
// the bomb of a loadout [{name, n}]: the heaviest covered one; skipped = the other weapon names that are not covered
export function pickBomb(list) {
  let best = null; const skipped = [];
  for (const w of list || []) { const c = bombClass(w.name); if (c) { if (!best || c.lb > best.lb) best = {name: w.name, lb: c.lb}; } else skipped.push(w.name); }
  return best ? {...best, skipped} : null;
}

// the manoeuvres the manual allows after a dive release, by dive angle (4.2.16.1)
export const maneuvers = dive => [...(dive <= 20 ? ['Turning'] : []), ...(dive <= 25 ? ['Level turning'] : []), ...(dive <= 60 ? ['CLM (climb)'] : [])];

// Aircraft path after the first release: the dive goes on until the last release plus 2 s, then 5 G up to a 20 deg climb, relaxing to 30 deg (CLM, MIL power, constant speed).
// p: {alt, speedKt, diveDeg, stickDur, x0}; samples {t, x, alt, g}: x along the attack line (target 0), alt above the target
export function escapePath(p, tEnd, dt = .1) {
  const V = p.speedKt * FT_KT, w = PULL_G * G0 / V, tPull = p.stickDur + PULL_DELAY;
  let t = 0, x = p.x0, alt = p.alt, g = -rad(p.diveDeg); const out = [{t, x, alt, g}];
  while (t < tEnd) {
    if (t >= tPull) g = g < rad(20) ? Math.min(rad(20), g + w * dt) : Math.min(rad(30), g + rad(5) * dt);
    x += V * Math.cos(g) * dt; alt += V * Math.sin(g) * dt; t += dt; out.push({t, x, alt, g});
  }
  return out;
}

// the drop at a release altitude: where the first bomb is released and each impact (x along the attack line, release time after the first), fall time
function drop(v, alt) {
  const fall = bombFall(alt, v.releaseSpeed, v.diveAngle, v.rangeModel); if (!fall || !(fall.range > 0)) return null;
  const gs = v.releaseSpeed * Math.cos(rad(v.diveAngle)) * FT_KT, L = (v.ripplePulses - 1) * v.stickSpacing, d0 = v.stickMode === 'mid' ? -L / 2 : 0;
  return {tof: fall.time, x0: d0 - fall.range, stickDur: gs > 0 ? L / gs : 0, imp: Array.from({length: v.ripplePulses}, (_, i) => ({d: d0 + i * v.stickSpacing, t: gs > 0 ? i * v.stickSpacing / gs : 0}))};
}
// is the aircraft inside the lethal envelope of a bomb while it is active (impact to impact + env.t)? -> first violation or null
function inside(v, alt, env) {
  const D = drop(v, alt); if (!D) return {error: true};
  const last = D.imp[D.imp.length - 1], tEnd = last.t + D.tof + env.t, path = escapePath({alt, speedKt: v.releaseSpeed, diveDeg: v.diveAngle, stickDur: D.stickDur, x0: D.x0}, tEnd);
  for (const s of path) {
    if (s.alt <= 0) return {t: s.t, x: s.x, alt: 0, ground: true, D, path};
    for (let i = 0; i < D.imp.length; i++) { const te = D.imp[i].t + D.tof; if (s.t >= te && s.t <= te + env.t && ((s.x - D.imp[i].d) / env.out) ** 2 + (s.alt / env.up) ** 2 <= 1) return {t: s.t, x: s.x, alt: s.alt, bomb: i + 1, D, path}; }
  }
  return {D, path, clear: true};
}
// the altitude loss of the dive recovery (5 G, 2 s after the last release) plus the ground clearance buffer
export function recoveryMra(v) {
  const A = rad(v.diveAngle), vF = v.releaseSpeed * FT_KT, gs = vF * Math.cos(A), stickDur = gs > 0 ? (v.ripplePulses - 1) * v.stickSpacing / gs : 0;
  return vF * Math.sin(A) * (stickDur + PULL_DELAY) + vF * vF / (G0 * PULL_G) * (1 - Math.cos(A)) + BUFFER;
}
// lowest release altitude (step 100 ft) at which test(alt) holds for it and the three above
function lowest(test, from = 100, to = 40000) { for (let a = from; a <= to; a += 100) if (test(a) && test(a + 100) && test(a + 200) && test(a + 300)) return a; return null; }

// the whole analysis of a plan r (computePopup / computeHadb / computeToss result) for the bomb envelope env (null = not covered) and the fuze delays [s]
// -> {env, mra: {frag, recovery, arming, value, by}, ralt, below, path, viol, window, flags}
export function analyse(r, env, ads) {
  const v = r.v, toss = r.kind === 'toss', ralt = v.releaseAltitude, adMax = Math.max(...ads, 0), flags = {}, res = {env, ralt, kind: toss ? 'toss' : r.kind || 'popup', tof: v.timeOfFall};
  const armed = a => a > 0 ? a + ARM_MARGIN <= v.timeOfFall : true;
  ads.forEach((a, k) => { if (!armed(a)) flags['ad' + k] = `Arming delay ${a.toFixed(2)} s: the bomb falls only ${v.timeOfFall.toFixed(1)} s, it needs ${ARM_MARGIN} s more than the delay (tolerance, inherent delay).`; });
  if (toss) {   // the aircraft is far from a tossed bomb: only the distance to the impact point counts
    res.far = env ? {range: v.releaseRange, ok: v.releaseRange > env.out} : null;
    res.mra = {value: null}; res.flags = flags; return res;
  }
  const arming = adMax > 0 ? lowest(a => { const f = bombFall(a, v.releaseSpeed, v.diveAngle, v.rangeModel); return !!f && f.time >= adMax + ARM_MARGIN; }, 100, 40000) : 0;
  const recovery = recoveryMra(v), frag = env ? lowest(a => { const q = inside(v, a, env); return !q.error && q.clear; }, 100, 40000) : null;
  const list = [['fragmentation area', frag], ['dive recovery', recovery], ['arming delay', arming]].filter(x => x[1] != null), top = list.reduce((m, x) => x[1] > m[1] ? x : m, list[0]);
  res.mra = {frag, recovery, arming, value: top[1], by: top[0]}; res.below = ralt < top[1];
  if (v.diveAngle > 60) flags.diveAngle = 'No planned safe escape above a 60° dive (TO 4.2.16).';
  if (ralt < recovery) { const m = `Release altitude ${Math.round(ralt)} ft is below the dive recovery altitude (${Math.round(recovery)} ft: 5 G in 2 s plus ${BUFFER} ft).`; flags.releaseAltitude = m; flags.diveAngle = flags.diveAngle || m; flags.releaseSpeed = m; }
  else if (res.below) flags.releaseAltitude = `Release altitude ${Math.round(ralt)} ft is below the minimum acceptable release altitude ${Math.round(top[1])} ft (${top[0]}).`;
  if (env) { const q = inside(v, ralt, env); if (!q.error) { res.viol = q.clear ? null : {t: q.t, x: q.x, alt: q.alt, bomb: q.bomb, ground: !!q.ground}; res.path = q.path; res.window = {from: q.D.tof, to: q.D.imp[q.D.imp.length - 1].t + q.D.tof + env.t}; res.x0 = q.D.x0; } }
  res.flags = flags; return res;
}
