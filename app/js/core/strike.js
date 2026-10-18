// HADB (high altitude dive bombing) and LAT (low altitude toss) planners, after the Weapon Delivery Planner manual. Pure functions, no DOM.
// A general physics estimate, not the BMS fire control computer: the pull-up / dive turn is a constant-load-factor arc at a mean speed, the bomb
// falls with the same drag models as the pop-up (popup.js bombFall). Coordinates are BMS {n, e} feet; altitudes are feet above the target.
import {FT_NM, FT_KT, norm, project, dist, bearing, bombFall, stickImpacts, fuzeData, egressHeading, offsetRow} from './popup.js';

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI, G0 = 32.2;
const COMMON = {ripplePulses: 1, stickSpacing: 0, stickMode: 'mid', releaseMode: 'single', rangeModel: 'low_drag', heading: 360, side: 'right', turnG: 3, oa1ToVip: 18228,
  oa2Mode: 'off', egressRange: 10000, egressTurn: 'set', egressHeading: 360, egressAngle: 45, egressAltitude: 2000, fuzeMode: 'c1', ad1: 4, ad2: 6, burstAltitude: 500};
export const HADB_DEFAULTS = {...COMMON, diveAngle: 30, releaseAltitude: 12000, releaseSpeed: 450, ingressSpeed: 400, timeOnFinal: 5, angleOff: 60, turnG: 4};
export const TOSS_DEFAULTS = {...COMMON, releaseAngle: 23, ingressAltitude: 300, ingressSpeed: 500, releaseSpeed: 480, releaseExtra: 0, angleOff: 0};
export const HADB_LIMITS = {diveAngle: [10, 60, 1], releaseAltitude: [3000, 30000, 500], releaseSpeed: [300, 650, 5], ingressSpeed: [250, 600, 5], timeOnFinal: [0, 20, 1], angleOff: [0, 90, 5], turnG: [3, 5, 1], stickSpacing: [0, 1000, 25]};
export const TOSS_LIMITS = {releaseAngle: [5, 60, 1], ingressAltitude: [50, 2000, 50], ingressSpeed: [300, 650, 5], releaseSpeed: [300, 650, 5], releaseExtra: [0, 3000, 100], angleOff: [0, 90, 5], turnG: [3, 5, 1], stickSpacing: [0, 1000, 25]};

const unit = h => ({n: Math.cos(rad(h)), e: Math.sin(rad(h))});
const add = (p, q, k = 1) => ({n: p.n + q.n * k, e: p.e + q.e * k});

// the common tail: stick, fuze, OA2 / egress, wheel
function tail(target, attack, v, fall, pulses, gsFps, extra) {
  const stickLen = (pulses - 1) * v.stickSpacing, egressHdg = egressHeading(v, attack);
  const oa2 = v.oa2Mode === 'target' ? {...target} : v.oa2Mode === 'egress' ? project(target, egressHdg, v.egressRange) : null;
  return {impacts: stickImpacts(target, attack, v, pulses, stickLen, gsFps), fuze: fuzeData(fall, v), oa2, oa2Alt: v.oa2Mode === 'egress' ? v.egressAltitude : v.oa2Mode === 'target' ? 0 : undefined, stickLen, egressHdg, ...extra};
}

// ---------- HADB ----------
// Ingress level at the ingress altitude on the ingress heading (attack heading turned away by the angle off), OA1 behind the VIP. At the VIP a
// diving turn onto the attack heading and the dive angle: the velocity turns through Theta = acos(cos A cos angleOff) along one great circle,
// so the turn displaces the aircraft by R tan(Theta/2) (u0 + u1) and drops it by R tan(Theta/2) sin A. Then the tracking time, then the release.
export function computeHadb(target, ref, inp) {
  const v = {...HADB_DEFAULTS, ...inp}, A = rad(v.diveAngle), al = rad(v.angleOff);
  if (!(v.diveAngle > 0 && v.diveAngle < 89 && v.releaseAltitude > 0 && v.releaseSpeed > 0 && v.ingressSpeed > 0 && v.timeOnFinal >= 0 && v.angleOff >= 0 && v.angleOff < 180 && v.turnG >= 1 && v.stickSpacing >= 0)) return {error: 'HADB parameters are outside valid ranges.'};
  const pulses = Math.max(1, Math.round(v.ripplePulses)), fall = bombFall(v.releaseAltitude, v.releaseSpeed, v.diveAngle, v.rangeModel);
  if (!fall || !(fall.range > 0)) return {error: 'Could not compute bomb range.'};
  const gs = v.releaseSpeed * Math.cos(A), gsFps = gs * FT_KT, vFps = v.releaseSpeed * FT_KT, stickLen = (pulses - 1) * v.stickSpacing;
  const relRange = fall.range + (v.stickMode === 'mid' ? stickLen / 2 : 0), trackH = gsFps * v.timeOnFinal, trackV = vFps * Math.sin(A) * v.timeOnFinal;
  const aod = v.releaseAltitude / Math.tan(A) - relRange;
  if (aod <= 0) return {error: 'AOD is negative for this profile. Increase release altitude or reduce bomb range.'};
  const attack = norm(v.heading), hin = norm(attack + (v.side === 'right' ? -v.angleOff : v.angleOff));
  const u0 = {n: unit(hin).n, e: unit(hin).e, v: 0}, ua = unit(attack), u1 = {n: Math.cos(A) * ua.n, e: Math.cos(A) * ua.e, v: -Math.sin(A)};
  const th = Math.acos(Math.min(1, Math.max(-1, Math.cos(A) * Math.cos(al)))), vMean = (v.ingressSpeed + v.releaseSpeed) / 2 * FT_KT, R = vMean * vMean / (G0 * v.turnG);
  const k = th > 1e-6 ? R * Math.tan(th / 2) : 0;
  const release = project(target, attack + 180, relRange), endTurn = project(release, attack + 180, trackH);
  const dispH = {n: k * (u0.n + u1.n), e: k * (u0.e + u1.e)}, drop = k * Math.sin(A);
  const pup = {n: endTurn.n - dispH.n, e: endTurn.e - dispH.e}, oa = add(pup, u0, -v.oa1ToVip);
  const ingressAlt = v.releaseAltitude + trackV + drop;
  // turn path (horizontal points and the side view: distance along the attack line, altitude)
  const arc = [], side = []; const sT = Math.sin(th) || 1;
  for (let i = 0; i <= 24; i++) { const f = th * i / 24, a = (Math.cos(th - f) - Math.cos(th)) / sT * R, b = (1 - Math.cos(f)) / sT * R;
    const p = {n: pup.n + a * u0.n + b * u1.n, e: pup.e + a * u0.e + b * u1.e}, h = ingressAlt + a * u0.v + b * u1.v; arc.push(p); side.push({p, h}); }
  const along = p => (p.n - target.n) * ua.n + (p.e - target.e) * ua.e;
  const vert = {segs: [['ingress', [[along(oa) - 6000, ingressAlt], [along(pup), ingressAlt]]], ['pull', side.map(q => [along(q.p), q.h])], ['dive', [[along(endTurn), v.releaseAltitude + trackV], [-relRange, v.releaseAltitude]]], ['fall', fall.track.map(q => [-relRange + q.x, q.alt])]],
    marks: [[[along(pup), ingressAlt], 'VIP', '#ffe680'], [[along(endTurn), v.releaseAltitude + trackV], 'Roll out', '#ffe680'], [[-relRange, v.releaseAltitude], 'Release · ' + Math.round(v.releaseAltitude) + ' ft', '#4aa3ff']]};
  const t = tail(target, attack, v, fall, pulses, gsFps, {});
  const slant = Math.hypot(dist(pup, target), ingressAlt);
  return {target, pup, vrp: release, oa, oa2: t.oa2, oa2Alt: t.oa2Alt, fuze: t.fuze, impacts: t.impacts, kind: 'hadb',
    draw: {segs: [['ingress', [oa, pup]], ['pull', arc], ['dive', [endTurn, release]], ['fall', [release, target]], ...(t.oa2 && v.oa2Mode == 'egress' ? [['egress', [target, t.oa2]]] : [])],
      marks: [[oa, 'OA1', '#a78bfa', 'dia'], [pup, 'VIP', '#ffe680'], [endTurn, 'Roll out', '#ffe680'], [release, 'VRP · release', '#4aa3ff']], arrows: [[oa, pup, 'ingress'], [endTurn, release, 'dive']],
      labels: [[mid2(oa, pup), 'Ingress ' + h3(hin) + '°'], [mid2(endTurn, release), 'Attack ' + h3(attack) + '°']]},
    vert, v: {...v, ripplePulses: pulses, bombRange: fall.range, timeOfFall: fall.time, stickLength: stickLen, releaseRange: relRange, groundSpeed: gs, aod, attackHeading: attack, ingressHeading: hin, approachHeading: hin, turnRadius: R, turnAngle: deg(th), altitudeLoss: drop, ingressAltitude: ingressAlt, mapDistance: relRange + trackH, trackingFt: trackH, pupToTarget: dist(pup, target), pupBearing: bearing(pup, target), wheelRange: slant, egressHeading: t.egressHeading, tofStick: fall.time + (gsFps > 0 ? stickLen / gsFps : 0)}};
}

// ---------- LAT (low altitude toss) ----------
// Level ingress, optionally a turn onto the attack heading (VRP = start of the turn, OA2 lined up before it), OA1 the line-up point, then at the VIP a
// pull-up at turnG to the release angle (constant load factor at the mean speed), an optional straight climb, release, the bomb flies up and over.
export function computeToss(target, ref, inp) {
  const v = {...TOSS_DEFAULTS, ...inp}, Ar = rad(v.releaseAngle);
  if (!(v.releaseAngle > 0 && v.releaseAngle < 89 && v.ingressAltitude >= 0 && v.releaseSpeed > 0 && v.ingressSpeed > 0 && v.turnG > 1 && v.releaseExtra >= 0 && v.angleOff >= 0 && v.angleOff < 180 && v.stickSpacing >= 0)) return {error: 'TOSS parameters are outside valid ranges.'};
  const pulses = Math.max(1, Math.round(v.ripplePulses)), stickLen = (pulses - 1) * v.stickSpacing;
  // pull-up arc: gamma' = g (n - cos gamma) / V
  const V = (v.ingressSpeed + v.releaseSpeed) / 2 * FT_KT, pull = [{x: 0, h: 0}]; let g = 0, x = 0, h = 0, n = 0; const dt = .02;
  while (g < Ar && n++ < 5000) { const w = G0 * (v.turnG - Math.cos(g)) / V; g += w * dt; x += V * Math.cos(g) * dt; h += V * Math.sin(g) * dt; pull.push({x, h}); }
  if (n >= 5000) return {error: 'Could not compute the pull-up.'};
  const xa = x, ha = h, xs = v.releaseExtra / Math.tan(Ar), relAlt = v.ingressAltitude + ha + v.releaseExtra, relAltMin = v.ingressAltitude + ha;
  const fall = bombFall(relAlt, v.releaseSpeed, -v.releaseAngle, v.rangeModel, true);
  if (!fall || !(fall.range > 0)) return {error: 'Could not compute bomb range.'};
  const gsFps = v.releaseSpeed * Math.cos(Ar) * FT_KT, relRange = fall.range + (v.stickMode === 'mid' ? stickLen / 2 : 0);
  const attack = norm(v.heading), ua = unit(attack), release = project(target, attack + 180, relRange), pup = project(release, attack + 180, xa + xs), oa = project(pup, attack + 180, v.oa1ToVip);
  // heading turn before the line-up (angle off 0 = none): from the ingress heading onto the attack heading, ending on OA1
  let vrp = null, oa2L = null, hin = attack, tArc = null; const Rt = (v.ingressSpeed * FT_KT) ** 2 / (G0 * v.turnG);
  if (v.angleOff > 0) {
    hin = norm(attack + (v.side === 'right' ? -v.angleOff : v.angleOff)); const t = rad(v.angleOff), k = Rt * Math.tan(t / 2), u0 = unit(hin);
    vrp = {n: oa.n - k * (u0.n + ua.n), e: oa.e - k * (u0.e + ua.e)}; oa2L = add(vrp, u0, -v.oa1ToVip);
    tArc = []; const c = {n: vrp.n + Math.cos(rad(hin + (v.side === 'right' ? 90 : -90))) * Rt, e: vrp.e + Math.sin(rad(hin + (v.side === 'right' ? 90 : -90))) * Rt};
    for (let i = 0; i <= 24; i++) { const a = t * i / 24 * (v.side === 'right' ? 1 : -1), rn = vrp.n - c.n, re = vrp.e - c.e; tArc.push({n: c.n - re * Math.sin(a) + rn * Math.cos(a), e: c.e + re * Math.cos(a) + rn * Math.sin(a)}); }
  }
  const along = p => (p.n - target.n) * ua.n + (p.e - target.e) * ua.e, xRel = -relRange;
  const arcPts = pull.map(q => [along(pup) + q.x, v.ingressAltitude + q.h]);
  const vert = {segs: [['ingress', [[along(oa) - 6000, v.ingressAltitude], [along(pup), v.ingressAltitude]]], ['pull', arcPts], ['climb', [[xRel - xs, relAltMin], [xRel, relAlt]]], ['fall', fall.track.map(q => [xRel + q.x, q.alt])]],
    marks: [[[along(pup), v.ingressAltitude], 'VIP', '#ffe680'], [[xRel, relAlt], 'Release · ' + Math.round(relAlt) + ' ft', '#4aa3ff']]};
  const tl = tail(target, attack, {...v, releaseAltitude: relAlt}, fall, pulses, gsFps, {});
  const preTurn = vrp ? [['ingress', [oa2L, vrp]], ['pull', tArc]] : [];
  return {target, release, pup, vrp: vrp || oa, oa, oa2: oa2L, oa2Alt: undefined, fuze: tl.fuze, impacts: tl.impacts, kind: 'toss', hasTurn: !!vrp,
    draw: {segs: [...preTurn, ['ingress', [oa, pup]], ['climb', [pup, release]], ['fall', [release, target]], ['egress', [target, project(target, tl.egressHdg, v.egressRange)]]],
      marks: [...(vrp ? [[oa2L, 'OA2', '#a78bfa', 'dia'], [vrp, 'VRP · turn', '#f0b040']] : []), [oa, 'OA1', '#a78bfa', 'dia'], [pup, 'VIP · pull-up', '#ffe680'], [release, 'Release', '#4aa3ff']], arrows: [[oa, pup, 'ingress'], [pup, release, 'climb']],
      labels: [[mid2(oa, pup), 'Attack ' + h3(attack) + '°'], ...(vrp ? [[mid2(oa2L, vrp), 'Ingress ' + h3(hin) + '°']] : [])]},
    vert, v: {...v, ripplePulses: pulses, bombRange: fall.range, timeOfFall: fall.time, stickLength: stickLen, releaseRange: relRange, groundSpeed: gsFps / FT_KT, attackHeading: attack, ingressHeading: hin, approachHeading: hin, turnRadius: Rt, pullDistance: xa + xs, releaseAltitude: relAlt, minReleaseAltitude: relAltMin, pupToTarget: dist(pup, target), pupBearing: bearing(pup, target), tofStick: fall.time + (gsFps > 0 ? stickLen / gsFps : 0), egressHeading: tl.egressHeading}};
}
// ---------- MAT: the toss as a standoff release outside (or above) the WEZ of a SAM ----------
// r: a toss result (computeToss); ppt: {n, e, ringFt} the threat (position and range ring of the DTC PPT); sam: {max, min} launch altitudes in ft (the same reference as the toss: above the target).
// The aircraft is safe where it is outside the ring, above the SAM's top or below its bottom. The side view shows the WEZ as a box over the stretch of the attack line inside the ring.
export function matCheck(r, ppt, sam) {
  const v = r.v, h = rad(v.attackHeading), u = {n: Math.cos(h), e: Math.sin(h)}, R = ppt.ringFt, T = r.target;
  const pn = ppt.n - T.n, pe = ppt.e - T.e, proj = pn * u.n + pe * u.e, perp2 = pn * pn + pe * pe - proj * proj;
  const half = R * R > perp2 ? Math.sqrt(R * R - perp2) : 0, chord = half > 0 ? [proj - half, proj + half] : null;   // along-track stretch of the attack line inside the ring (x from the target, negative before it)
  const at = x => ({n: T.n + x * u.n, e: T.e + x * u.e}), inRing = x => dist(at(x), ppt) < R;
  let hit = null, lowest = Infinity;
  for (const [k, pts] of r.vert.segs) {
    if (k !== 'ingress' && k !== 'pull' && k !== 'climb') continue;
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 250));
      for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, alt = a[1] + (b[1] - a[1]) * j / n; lowest = Math.min(lowest, alt);
        if (!hit && inRing(x) && alt >= sam.min && alt <= sam.max) hit = {x, alt}; } }
  }
  const dRel = dist(r.release, ppt), ingress = v.ingressAltitude;
  return {ringFt: R, samMax: sam.max, samMin: sam.min, chord, hit, releaseToPpt: dRel, releaseMargin: dRel - R, releaseOutside: dRel >= R, aboveSam: lowest > sam.max, ingressAbove: ingress > sam.max,
    safeAltitude: sam.max, short: dRel < R ? R - dRel : 0};
}
const mid2 = (a, b) => ({n: (a.n + b.n) / 2, e: (a.e + b.e) / 2});
const h3 = h => String(Math.round(h) % 360 || 360).padStart(3, '0');
export {offsetRow, FT_NM};
