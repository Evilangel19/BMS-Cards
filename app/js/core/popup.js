// @ts-check
// Pop-up attack calculator (CCRP / CCIP dive delivery): pure functions, no DOM.
// Plane geometry in BMS coordinates {n, e} = north / east feet. Written from scratch for BMS Cards; the numbers were
// cross-checked against the UOAF bms_html_briefing pop-up computer (see docs/archive/ARCHITECTURE-history.md, "Pop-up engine").
export const FT_NM = 6076.12,
  FT_KT = 1.68781,
  MRA_BUFFER = 120;
export const DEFAULTS = {
  diveAngle: 15,
  releaseAltitude: 2000,
  ingressAltitude: 500,
  releaseSpeed: 520,
  timeOnFinal: 5,
  ripplePulses: 1,
  stickSpacing: 0,
  stickMode: 'mid',
  heading: 360,
  headingMode: 'attack',
  side: 'right',
  turnG: 3,
  oa2Mode: 'off',
  egressRange: 10000,
  egressTurn: 'set',
  egressHeading: 360,
  egressAngle: 45,
  egressAltitude: 2000,
  fuzeMode: 'c1',
  ad1: 4,
  ad2: 6,
  burstAltitude: 500,
  profileType: 2,
  vrpToPup: 15000,
  releaseMode: 'single',
  rangeModel: 'low_drag',
  bombRange: 5138,
};
export const LIMITS = {
  diveAngle: [5, 45, 1],
  releaseAltitude: [100, 10000, 100],
  ingressAltitude: [0, 5000, 100],
  releaseSpeed: [300, 650, 5],
  timeOnFinal: [0, 20, 1],
  stickSpacing: [0, 1000, 25],
  heading: [1, 360, 1],
  vrpToPup: [3000, 61000, 600],
  turnG: [3, 5, 1],
  egressRange: [3000, 91000, 600],
  egressAltitude: [0, 30000, 500],
  ad1: [0, 10, 0.05],
  ad2: [0, 10, 0.05],
  burstAltitude: [100, 10000, 100],
  egressAngle: [15, 90, 5],
  egressHeading: [1, 360, 1],
};

const rad = d => (d * Math.PI) / 180,
  deg = r => (r * 180) / Math.PI;
export const norm = b => ((b % 360) + 360) % 360;
export const project = (p, brg, ft) => ({ n: p.n + Math.cos(rad(brg)) * ft, e: p.e + Math.sin(rad(brg)) * ft });
export const dist = (a, b) => Math.hypot(b.n - a.n, b.e - a.e);
export const bearing = (a, b) => norm(deg(Math.atan2(b.e - a.e, b.n - a.n)));
// NAV OFFSETS row values: bearing from a to b (0.1 deg) and range (ft)
export const offsetRow = (a, b) => {
  let g = Math.round(bearing(a, b) * 10) / 10;
  if (g === 0 || g === 360) g = 360;
  return { brg: g, rng: Math.round(dist(a, b)) };
}; // bearings run 1-360 (north is 360)

// Bomb fall with a simple drag model, integrated in 0.1 s steps; returns ground range (ft) and time of fall (s).
// physical = true (TOSS): quadratic drag on the whole velocity, scaled by the air density at the bomb's altitude (scale height 26 000 ft), the same drag at sea level as the
// low / high drag model has at 500 kt. A lofted bomb keeps its forward speed in thin air and does not fall straight down after a few seconds.
function bombFallPhysical(releaseAlt, speedKt, diveDeg, model) {
  const dt = 0.05,
    c = (model === 'high_drag' ? 140 : 0.165 * 140) / (500 * FT_KT) ** 2,
    g = 32.177,
    a = rad(diveDeg);
  let vx = Math.cos(a) * speedKt * FT_KT,
    vz = -Math.sin(a) * speedKt * FT_KT,
    x = 0,
    alt = releaseAlt,
    t = 0,
    n = 0;
  const track = [{ t: 0, x: 0, alt: releaseAlt }];
  while (n++ < 20000) {
    const sp = Math.hypot(vx, vz),
      k = c * Math.exp(-Math.max(0, alt) / 26000) * sp;
    const ax = -k * vx,
      az = -g - k * vz,
      nx = x + vx * dt + 0.5 * ax * dt * dt,
      nz = alt + vz * dt + 0.5 * az * dt * dt;
    vx += ax * dt;
    vz += az * dt;
    if (nz <= 0 && vz < 0) {
      const f = alt / (alt - nz || 1);
      const end = { t: t + f * dt, x: x + (nx - x) * f, alt: 0 };
      track.push(end);
      return { range: end.x, time: end.t, track };
    }
    x = nx;
    alt = nz;
    t += dt;
    track.push({ t, x, alt });
  }
  return null;
}
export function bombFall(releaseAlt, speedKt, diveDeg, model, physical) {
  if (physical) return bombFallPhysical(releaseAlt, speedKt, diveDeg, model);
  const dt = 0.1,
    k = model === 'high_drag' ? 1 : 0.165,
    g = model === 'high_drag' ? 20.91505 : 32.177,
    a = rad(diveDeg);
  let vx = Math.round(Math.cos(a) * speedKt * FT_KT * 100) / 100,
    vy = Math.round(Math.sin(a) * speedKt * FT_KT * 100) / 100;
  let x = 0,
    alt = releaseAlt,
    t = 0,
    dx = 0,
    dz = 0,
    n = 0;
  const track = [{ t: 0, x: 0, alt: releaseAlt }];
  while (alt > 0 && n++ < 10000) {
    const acc = vx > 0 ? (-k * 140 * Math.abs(vx)) / Math.sqrt(vx * vx + 0.1) : 0;
    dx = vx * dt + 0.5 * acc * dt * dt;
    dz = -vy * dt - 0.5 * g * dt * dt;
    x += dx;
    alt += dz;
    t += dt;
    vx = Math.max(0, vx + acc * dt);
    vy += g * dt;
    track.push({ t, x, alt });
  }
  if (n >= 10000 || !dz) return null;
  const over = alt / dz; // fraction of the last step below the ground
  const end = { t: t - over * dt, x: x - over * dx, alt: 0 };
  track[track.length - 1] = end;
  return { range: end.x, time: end.t, track };
}

function arcPoints(start, h0, h1, radius, side) {
  const delta = side === 'left' ? -norm(h0 - h1) : norm(h1 - h0);
  if (Math.abs(delta) < 0.1) return [start];
  const sgn = delta >= 0 ? 1 : -1,
    nrm = rad(h0 + 90 * sgn);
  const c = { n: start.n + Math.cos(nrm) * radius, e: start.e + Math.sin(nrm) * radius };
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / 6)),
    pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad((delta * i) / steps),
      rn = start.n - c.n,
      re = start.e - c.e;
    pts.push({ n: c.n - re * Math.sin(a) + rn * Math.cos(a), e: c.e + re * Math.cos(a) + rn * Math.sin(a) });
  }
  return pts;
}

// Type 1 (WDP): fly straight at the target, turn away by the offset angle at the PUP onto the pull heading, then climb to the start of the
// pull-down. Given where the climb starts (c0) and the pull heading, find the PUP: the point from which a first turn (opposite to the final
// turn) of beta degrees ends on c0 and the straight-in heading h1 points exactly at the target.
function solveType1(c0, pullHdg, target, radius, side) {
  const first = side === 'left' ? 'right' : 'left',
    sgn = first === 'left' ? 1 : -1;
  const at = beta => {
    const h1 = norm(pullHdg + sgn * beta),
      e = arcPoints({ n: 0, e: 0 }, h1, pullHdg, radius, first),
      d = e[e.length - 1],
      pup = { n: c0.n - d.n, e: c0.e - d.e };
    return { beta, h1, pup, g: ((bearing(pup, target) - h1 + 540) % 360) - 180 };
  };
  let lo = at(1);
  for (let b = 2; b <= 150; b++) {
    const hi = at(b);
    if (lo.g * hi.g <= 0) {
      let a = lo.beta,
        z = hi.beta,
        m = lo;
      for (let i = 0; i < 40; i++) {
        const mid = at((a + z) / 2);
        if (mid.g * at(a).g <= 0) z = mid.beta;
        else a = mid.beta;
        m = mid;
      }
      return { beta: m.beta, h1: m.h1, pup: m.pup, arc: arcPoints(m.pup, m.h1, pullHdg, radius, first) };
    }
    lo = hi;
  }
  return null;
}

// egress heading: straight on along the attack heading, or the heading set (1-360); 'left' / 'right' (turn by egressAngle) is the older form
export const egressHeading = (v, attack) =>
  v.egressTurn === 'set'
    ? norm(v.egressHeading)
    : v.egressTurn === 'left'
      ? norm(attack - v.egressAngle)
      : v.egressTurn === 'right'
        ? norm(attack + v.egressAngle)
        : attack;

// impact points of the stick along the attack line: distance from the target (+ beyond, - short), time after the first release, bombs per pulse (SGL 1 / PAIR 2)
export function stickImpacts(target, attack, v, pulses, stickLen, gsFps) {
  return Array.from({ length: pulses }, (_, i) => {
    const d = (v.stickMode === 'mid' ? -stickLen / 2 : 0) + i * v.stickSpacing,
      p = project(target, attack, d);
    return {
      i: i + 1,
      d,
      n: p.n,
      e: p.e,
      t: gsFps > 0 ? (i * v.stickSpacing) / gsFps : NaN,
      bombs: v.releaseMode === 'pair' ? 2 : 1,
    };
  });
}

// fuze: arming delay (s after release) and, for CBU, burst altitude (ft above the target): where the bomb is at that moment and whether it has fallen long enough
export function fuzeData(fall, v) {
  const trk = fall.track || null,
    at = t => {
      if (!trk) return null;
      const i = trk.findIndex(q => q.t >= t);
      if (i < 0) return null;
      if (i === 0) return trk[0];
      const a = trk[i - 1],
        b = trk[i],
        f = (t - a.t) / (b.t - a.t || 1);
      return { t, x: a.x + f * (b.x - a.x), alt: a.alt + f * (b.alt - a.alt) };
    };
  const arm = ad => {
    const q = at(ad);
    return { delay: ad, armed: !!trk && ad <= fall.time, x: q ? q.x : null, alt: q ? q.alt : null };
  };
  let burst = null;
  if (trk && v.fuzeMode === 'c2') {
    const i = trk.findIndex(z => z.alt <= v.burstAltitude),
      q =
        v.burstAltitude >= v.releaseAltitude || i <= 0
          ? trk[0]
          : (() => {
              const A = trk[i - 1],
                B = trk[i],
                f = (A.alt - v.burstAltitude) / (A.alt - B.alt || 1);
              return { t: A.t + f * (B.t - A.t), x: A.x + f * (B.x - A.x), alt: v.burstAltitude };
            })();
    burst = q ? { alt: q.alt, t: q.t, x: q.x, shortBy: fall.range - q.x, armedFirst: v.ad1 <= q.t } : null;
  }
  return { mode: v.fuzeMode, tof: fall.time, ad1: arm(v.ad1), ad2: v.fuzeMode === 'c1' ? arm(v.ad2) : null, burst };
}

// target / ref = {n, e}; inp = fields of DEFAULTS. Returns {error} or the whole plan.
export function computePopup(target, ref, inp) {
  const v = { ...DEFAULTS, ...inp },
    A = rad(v.diveAngle);
  const bad = !(
    v.diveAngle > 0 &&
    v.diveAngle < 89 &&
    v.releaseAltitude > 0 &&
    v.ingressAltitude >= 0 &&
    v.releaseSpeed > 0 &&
    v.timeOnFinal >= 0 &&
    v.stickSpacing >= 0 &&
    v.vrpToPup > 0 &&
    v.turnG >= 1 &&
    v.egressRange >= 0 &&
    v.egressAngle >= 0
  );
  if (bad) return { error: 'Pop-up parameters are outside valid ranges.' };
  const pulses = Math.max(1, Math.round(v.ripplePulses));
  const fall =
    v.rangeModel === 'manual'
      ? { range: v.bombRange, time: NaN }
      : bombFall(v.releaseAltitude, v.releaseSpeed, v.diveAngle, v.rangeModel);
  if (!fall || !(fall.range > 0)) return { error: 'Could not compute bomb range.' };
  const gs = v.releaseSpeed * Math.cos(A),
    gsFps = gs * FT_KT,
    vFps = v.releaseSpeed * FT_KT;
  const stickLen = (pulses - 1) * v.stickSpacing,
    stickDur = gsFps > 0 ? stickLen / gsFps : NaN;
  const relRange = fall.range + (v.stickMode === 'mid' ? stickLen / 2 : 0);
  const trackH = gs * 1.69 * v.timeOnFinal,
    trackV = v.releaseSpeed * 1.69 * v.timeOnFinal * Math.sin(A);
  const mapDist = relRange + trackH,
    aod = v.releaseAltitude / Math.tan(A) - relRange;
  if (aod <= 0) return { error: 'AOD is negative for this profile. Increase release altitude or reduce bomb range.' };
  const climb = v.diveAngle <= 15 ? v.diveAngle + 5 : v.diveAngle + 10,
    C = rad(climb),
    angleOff = 2 * climb;
  const turnG = v.turnG,
    trackAlt = v.releaseAltitude + trackV;
  const radius = (v.releaseSpeed * 1.69) ** 2 / (32.2 * turnG);
  const delay = stickDur + 2,
    pullRadius = vFps ** 2 / (32.2 * 5);
  const lossDelay = vFps * Math.sin(A) * delay,
    lossPull = pullRadius * (1 - Math.cos(A)),
    loss = lossDelay + lossPull;
  const pdwnAlt = trackAlt - radius * (Math.cos(A) - Math.cos(C)),
    apex = pdwnAlt + radius * (1 - Math.cos(C));
  const pupToPdp = (pdwnAlt - v.ingressAltitude) / Math.tan(C);
  if (pupToPdp <= 0) return { error: 'Ingress altitude is above the computed pull-down altitude.' };
  // WDP geometry: the pull heading is the attack heading turned away by the angle off (2 x climb angle); the climb runs straight on that heading,
  // at the pull-down point the aircraft turns by the angle off (3-5 G radius) onto the attack heading and rolls out at the MAP.
  const attack =
    v.headingMode === 'attack' ? norm(v.heading) : norm(v.heading + (v.side === 'right' ? angleOff : -angleOff));
  const pull =
    v.headingMode === 'attack' ? norm(attack + (v.side === 'right' ? -angleOff : angleOff)) : norm(v.heading);
  const map = project(target, attack + 180, mapDist),
    release = project(target, attack + 180, relRange);
  const turnArc = arcPoints({ n: 0, e: 0 }, pull, attack, radius, v.side),
    dsp = turnArc[turnArc.length - 1];
  const pdp = { n: map.n - dsp.n, e: map.e - dsp.e },
    arc = arcPoints(pdp, pull, attack, radius, v.side);
  const type = v.profileType === 1 ? 1 : 2,
    climbStart = project(pdp, pull + 180, pupToPdp),
    oa = project(target, attack, aod);
  let pup = climbStart,
    firstArc = null,
    approach = null,
    offsetAngle = 0;
  if (type === 1) {
    const t1 = solveType1(climbStart, pull, target, radius, v.side);
    if (!t1)
      return {
        error: 'Could not solve the Type 1 approach (turn onto the pull heading). Try another heading or fewer G.',
      };
    pup = t1.pup;
    firstArc = t1.arc;
    approach = t1.h1;
    offsetAngle = t1.beta;
  }
  // line-up point (VRP): on the way in, a set distance before the PUP (Type 1: on the straight line target - PUP; Type 2: on the pull heading)
  const vrp =
      type === 1
        ? project(target, bearing(target, pup), dist(target, pup) + v.vrpToPup)
        : project(pup, pull + 180, v.vrpToPup),
    action = vrp;
  // egress heading: straight on along the attack heading, or turned left / right by egressAngle after the release
  const egressHdg = egressHeading(v, attack);
  // OA2 (second offset aim point): off, on the target itself at zero elevation, or out along the egress heading
  // impact points of the stick along the attack line, fuze data
  const impacts = stickImpacts(target, attack, v, pulses, stickLen, gsFps);
  const oa2 =
    v.oa2Mode === 'target' ? { ...target } : v.oa2Mode === 'egress' ? project(target, egressHdg, v.egressRange) : null;
  const fuze = fuzeData(fall, v);
  // OA2 elevation: zero on the target, the egress altitude out along the egress
  const oa2Alt = v.oa2Mode === 'egress' ? v.egressAltitude : 0;
  const off = offsetRow;
  const r = ref || target;
  return {
    target,
    action,
    pup,
    climbStart,
    vrp,
    firstArc,
    pdp,
    map,
    release,
    oa,
    oa2,
    oa2Alt,
    fuze,
    arc,
    impacts,
    offsets: { pup: off(r, pup), vrp: off(target, vrp), oa: off(r, oa), oa2: oa2 ? off(r, oa2) : null },
    v: {
      ...v,
      ripplePulses: pulses,
      bombRange: fall.range,
      timeOfFall: fall.time,
      stickLength: stickLen,
      stickDuration: stickDur,
      releaseRange: relRange,
      groundSpeed: gs,
      trackingFt: trackH,
      mapDistance: mapDist,
      aod,
      climbAngle: climb,
      angleOff,
      trackAltitude: trackAlt,
      pulldownAltitude: pdwnAlt,
      apexAltitude: apex,
      pupToPdp,
      turnRadius: radius,
      altitudeLoss: loss,
      groundClearance: v.releaseAltitude - loss,
      mra: loss + MRA_BUFFER,
      attackHeading: attack,
      egressHeading: egressHdg,
      ingressHeading: pull,
      legHeading: pull,
      pullHeading: pull,
      profileType: type,
      approachHeading: approach,
      offsetAngle,
      tofStick: fall.time + stickDur,
      pupToTarget: dist(pup, target),
      pupBearing: bearing(pup, target),
    },
  };
}
