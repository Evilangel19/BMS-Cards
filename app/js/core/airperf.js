// Aircraft performance from the BMS flight model tables (bmsdata/acperf.js): energy (Ps), turn, cruise range / endurance, take-off and landing.
// Pure maths. Units: ft, lb, ft/s, kt, degrees, seconds; fuel flow in lb/h. Everything is an estimate: the tables give the aircraft, the
// rest (atmosphere, rotation, braking) is a simple model, labelled as such on the page.
export const G = 32.174,
  KT = 1.68781,
  RHO0 = 0.0023769,
  A0 = 661.48; // g (ft/s²), ft/s per kt, sea level density (slug/ft³), sea level speed of sound (kt)
const RAD = Math.PI / 180,
  clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ISA with a temperature offset (°C): density ratio, speed of sound (kt), pressure ratio at the geometric altitude (ft)
export function atmos(altFt, dIsa = 0) {
  const h = altFt * 0.3048,
    t = h <= 11000 ? 288.15 - 0.0065 * h : 216.65,
    p = h <= 11000 ? 101325 * (t / 288.15) ** 5.25588 : 22632.06 * Math.exp(-(h - 11000) / 6341.62),
    T = t + dIsa;
  return {
    T,
    rho: (p / (287.053 * T)) * 0.00194032,
    a: 38.9679 * Math.sqrt(T),
    delta: p / 101325,
    sigma: p / (287.053 * T) / 1.225,
  };
}
export const cas = (M, A) => A0 * Math.sqrt(5 * ((A.delta * ((1 + 0.2 * M * M) ** 3.5 - 1) + 1) ** (2 / 7) - 1)); // kt
export function machFromCas(kc, A) {
  let a = 0.05,
    b = 4;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (cas(m, A) < kc) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

const seg = (xs, v) => {
  const n = xs.length;
  if (v <= xs[0]) return [0, 0, 0];
  if (v >= xs[n - 1]) return [n - 1, n - 1, 0];
  let i = 0;
  while (xs[i + 1] < v) i++;
  return [i, i + 1, (v - xs[i]) / (xs[i + 1] - xs[i])];
};
// bilinear value of a table z[ix][iy] (x and y breakpoints), clamped at the edges
export function bilin(t, x, y) {
  const [i0, i1, fx] = seg(t.x, x),
    [j0, j1, fy] = seg(t.y, y),
    z = t.z;
  return t.mult * ((z[i0][j0] * (1 - fy) + z[i0][j1] * fy) * (1 - fx) + (z[i1][j0] * (1 - fy) + z[i1][j1] * fy) * fx);
}

export const cl = (ac, M, al) => bilin(ac.cl, M, al);
export function storesK(ac, M) {
  const l = ac.lim.storesDrag;
  if (l.length < 4) return 0;
  const [m1, k1, m2, k2] = l;
  return M <= m1 ? k1 : M >= m2 ? k2 : k1 + ((k2 - k1) * (M - m1)) / (m2 - m1);
}
// drag coefficient (wing area): table + stores (drag index x the BMS stores line) + gear + air brake
export const cd = (ac, M, al, o = {}) =>
  bilin(ac.cd, M, al) + (o.di || 0) * storesK(ac, M) + (o.gear ? ac.drag.gear : 0) + (o.brake ? ac.drag.brake : 0);

// the highest CL reached at or below the alpha limit; and the alpha that gives a wanted CL (null if it is not reached)
export function clMax(ac, M, aoa = ac.af.aoaMax) {
  let b = { cl: -9, al: 0 };
  for (let a = 0; a <= aoa + 1e-9; a += 0.25) {
    const c = cl(ac, M, a);
    if (c > b.cl) b = { cl: c, al: a };
  }
  return b;
}
export function alphaFor(ac, M, c, aoa = ac.af.aoaMax) {
  let p = cl(ac, M, ac.af.aoaMin),
    pa = ac.af.aoaMin;
  for (let a = ac.af.aoaMin + 0.25; a <= aoa + 1e-9; a += 0.25) {
    const q = cl(ac, M, a);
    if ((p <= c && q >= c) || (p >= c && q <= c)) return q == p ? a : pa + ((a - pa) * (c - p)) / (q - p);
    p = q;
    pa = a;
  }
  return null;
}

// engine: thrust and fuel flow at a power setting 'idle' | 'mil' | 'ab'; for the BMS aircraft with a simple engine the fuel flow is thrust x a factor
export function engine(ac, alt, M, mode) {
  const T = bilin(ac.thrust[mode], alt, M) * ac.thrustFactor;
  let ff;
  if (ac.flow && ac.flow[mode]) ff = bilin(ac.flow[mode], alt, M) * ac.flowFactor;
  else {
    const s = ac.simpleFuel;
    ff = Math.max(s.min || 0, Math.max(0, T) * ((mode == 'ab' ? s.ab : s.normal) || 0.8));
  }
  return { T, ff };
}
// power needed for a thrust: between idle and military (throttle 0..1) or between military and afterburner; null when even the afterburner is not enough
export function powerFor(ac, alt, M, Treq) {
  const i = engine(ac, alt, M, 'idle'),
    m = engine(ac, alt, M, 'mil'),
    a = engine(ac, alt, M, 'ab');
  if (Treq <= i.T) return { mode: 'idle', thr: 0, T: i.T, ff: i.ff };
  if (Treq <= m.T) {
    const f = (Treq - i.T) / (m.T - i.T);
    return { mode: 'part', thr: f, T: Treq, ff: i.ff + f * (m.ff - i.ff) };
  }
  if (Treq <= a.T) {
    const f = (Treq - m.T) / (a.T - m.T);
    return { mode: 'ab', thr: 1 + f * 0.05, T: Treq, ff: m.ff + f * (a.ff - m.ff) };
  }
  return null;
}

// one flight point at n g: lift, drag, thrust (military and afterburner), specific excess power (ft/s)
export function point(ac, o) {
  const { W, alt, M, n = 1 } = o,
    A = atmos(alt, o.dIsa || 0),
    V = M * A.a * KT,
    q = 0.5 * A.rho * V * V,
    S = ac.af.area,
    c = (n * W) / (q * S),
    al = alphaFor(ac, M, c, o.aoa);
  const r = { V, kt: V / KT, q, cas: cas(M, A), cl: c, al, A };
  if (al == null) {
    r.stall = true;
    return r;
  }
  r.D = q * S * cd(ac, M, al, o);
  r.Tm = engine(ac, alt, M, 'mil').T;
  r.Ta = engine(ac, alt, M, 'ab').T;
  r.psMil = ((r.Tm - r.D) * V) / W;
  r.psAb = ((r.Ta - r.D) * V) / W;
  return r;
}

// instantaneous load factor: the best of alpha <= limit, limited by lift, the structural g and the FLCS g limit given by alpha (LIM_POS_G, three points)
function gLimitAlpha(ac, al) {
  const p = ac.lim.posG;
  if (p.length < 6) return ac.af.maxG;
  const [a1, g1, a2, g2, a3, g3] = p;
  return al <= a1
    ? g1
    : al <= a2
      ? g1 + ((g2 - g1) * (al - a1)) / (a2 - a1)
      : al <= a3
        ? g2 + ((g3 - g2) * (al - a2)) / (a3 - a2)
        : g3;
}
export function instG(ac, o) {
  const A = atmos(o.alt, o.dIsa || 0),
    V = o.M * A.a * KT,
    q = 0.5 * A.rho * V * V,
    S = ac.af.area;
  let best = { n: 0, al: 0 };
  for (let al = 0; al <= ac.af.aoaMax + 1e-9; al += 0.25) {
    const n = Math.min((q * S * cl(ac, o.M, al)) / o.W, gLimitAlpha(ac, al), ac.af.maxG);
    if (n > best.n) best = { n, al };
  }
  return best;
}
// sustained load factor with the given power ('mil' | 'ab'): the most g for which thrust >= drag (0 when level flight is not held)
export function sustG(ac, o, mode) {
  const T = engine(ac, o.alt, o.M, mode).T,
    hi = instG(ac, o).n;
  const ok = n => {
    const p = point(ac, { ...o, n });
    return !p.stall && T >= p.D;
  };
  if (!ok(1)) return { n: 0, al: null };
  if (ok(hi)) return { n: hi };
  let a = 1,
    b = hi;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (ok(m)) a = m;
    else b = m;
  }
  return { n: a };
}
export const turnRate = (n, V) => (n <= 1 ? 0 : (G * Math.sqrt(n * n - 1)) / V / RAD); // deg/s, V in ft/s
export const turnRadius = (n, V) => (n <= 1 ? Infinity : (V * V) / (G * Math.sqrt(n * n - 1))); // ft

// turn diagram: for each Mach the instantaneous and the sustained (military / afterburner) g and turn rate at one altitude
export function turnCurve(ac, o) {
  const rows = [];
  for (let M = 0.2; M <= 2.3 + 1e-9; M += 0.02) {
    const A = atmos(o.alt, o.dIsa || 0),
      V = M * A.a * KT,
      kc = cas(M, A);
    if (kc > ac.af.maxKt + 40) break;
    const i = instG(ac, { ...o, M });
    if (i.n < 1.01) continue;
    const sm = sustG(ac, { ...o, M }, 'mil'),
      sa = sustG(ac, { ...o, M }, 'ab');
    rows.push({
      M,
      kt: V / KT,
      cas: kc,
      gI: i.n,
      wI: turnRate(i.n, V),
      gM: sm.n < 1.01 ? null : sm.n,
      wM: sm.n < 1.01 ? null : turnRate(sm.n, V),
      gA: sa.n < 1.01 ? null : sa.n,
      wA: sa.n < 1.01 ? null : turnRate(sa.n, V),
      alI: i.al,
    });
  }
  let corner = null;
  rows.forEach(r => {
    if (!corner || r.wI > corner.wI) corner = r;
  });
  return { rows, corner };
}

// specific excess power on a grid (Mach x altitude) at n g
export function psGrid(ac, o, mode = 'ab') {
  const machs = [],
    alts = [],
    ps = [];
  for (let M = 0.2; M <= 2.3 + 1e-9; M += 0.05) machs.push(+M.toFixed(2));
  for (let h = 0; h <= 60000; h += 2500) alts.push(h);
  alts.forEach(h =>
    ps.push(
      machs.map(M => {
        const A = atmos(h, o.dIsa || 0);
        if (cas(M, A) > ac.af.maxKt + 40) return null;
        const p = point(ac, { ...o, alt: h, M });
        return p.stall ? null : mode == 'ab' ? p.psAb : p.psMil;
      })
    )
  );
  return { machs, alts, ps };
}

// cruise: at each Mach, level flight at 1 g; power, fuel flow (lb/h), specific range (nm/lb). Null rows are those where the thrust is not enough.
export function cruiseCurve(ac, o) {
  const rows = [];
  for (let M = 0.3; M <= 2.2 + 1e-9; M += 0.02) {
    const p = point(ac, { ...o, M });
    if (p.stall || !(p.D > 0)) continue;
    if (p.cas > ac.af.maxKt) break;
    const pw = powerFor(ac, o.alt, M, p.D);
    if (!pw) continue;
    rows.push({
      M,
      kt: p.kt,
      cas: p.cas,
      D: p.D,
      T: pw.T,
      mode: pw.mode,
      thr: pw.thr,
      ff: pw.ff,
      sr: pw.ff > 0 ? p.kt / pw.ff : 0,
    });
  }
  let range = null,
    endur = null;
  rows.forEach(r => {
    if (r.mode != 'ab' && r.ff > 0) {
      if (!range || r.sr > range.sr) range = r;
      if (!endur || r.ff < endur.ff) endur = r;
    }
  });
  return { rows, range, endur };
}
// fuel burn over a leg at constant Mach and altitude, with the weight falling as the fuel is burned: nm, hours, fuel (lb). `fuel` = usable fuel
export function cruiseLeg(ac, o) {
  let W = o.W,
    left = o.fuel,
    nm = 0,
    t = 0;
  const dt = 30;
  while (left > 0 && t < 3600 * 12) {
    const p = point(ac, { ...o, W });
    if (p.stall) break;
    const pw = powerFor(ac, o.alt, o.M, p.D);
    if (!pw || pw.ff <= 0) break;
    const b = Math.min(left, (pw.ff * dt) / 3600);
    nm += ((p.kt * dt) / 3600) * (b / ((pw.ff * dt) / 3600));
    t += dt * (b / ((pw.ff * dt) / 3600));
    left -= b;
    W -= b;
  }
  return { nm, hours: t / 3600, fuel: o.fuel - left, W };
}

// ---- take-off and landing (a simple model: wheel friction and thrust from the file, rotation at the optimum pitch)
// Lift on the ground: the table CL is the clean wing; at take-off the leading-edge flaps, the flaperons and the ground effect add to it. The factor is calibrated on
// the WDP datacard (37 065 lb: rotation 161 kt) and on the BMS take-off speeds seen in flight (160-170 kt at about 37 000 lb), so it is an estimate, not file data.
export const TO_LIFT_GAIN = 1.43;
export function takeoff(ac, o) {
  const { W, elev = 0, dIsa = 0, hw = 0, slope = 0, power = 'ab' } = o,
    kL = o.liftGain || TO_LIFT_GAIN,
    A = atmos(elev, dIsa),
    S = ac.af.area,
    aLO = ac.ground.optTakeoffPitch || ac.af.aoaMax * 0.5,
    mu = ac.ground.roll;
  const aroll = 1,
    dd = { di: o.di || 0, gear: true };
  // lift-off speed: L = W at the take-off pitch
  let V = 80 * KT;
  for (let i = 0; i < 40; i++) {
    const M = V / (A.a * KT);
    V = Math.sqrt(W / (0.5 * A.rho * S * Math.max(0.05, kL * cl(ac, M, aLO))));
  }
  const vlof = V,
    vr = vlof - 10 * KT;
  let v = 0,
    x = 0,
    t = 0;
  const dt = 0.05;
  while (v + hw * KT < vlof && t < 200) {
    const va = v + hw * KT,
      M = Math.max(0, va) / (A.a * KT),
      al = va < vr ? aroll : aroll + ((aLO - aroll) * (va - vr)) / (vlof - vr);
    const q = 0.5 * A.rho * va * va,
      L = q * S * kL * cl(ac, M, al),
      D = q * S * cd(ac, M, al, dd),
      Tt = engine(ac, elev, M, power).T;
    const a = ((Tt - D - mu * Math.max(0, W - L) - W * slope) / W) * G;
    if (a <= 0 && v > 5) return { stuck: true, vlof: vlof / KT, vr: vr / KT };
    v += Math.max(a, 0.01) * dt;
    x += v * dt;
    t += dt;
  }
  // from lift-off to 50 ft: climb angle from the excess thrust
  const M = (vlof + hw * KT) / (A.a * KT),
    q = 0.5 * A.rho * (vlof + hw * KT) ** 2,
    D = q * S * cd(ac, M, aLO, { di: o.di || 0, gear: true }),
    Tt = engine(ac, elev, M, power).T,
    gam = Math.max(0.03, (Tt - D) / W);
  const air = (50 / Math.tan(Math.min(0.35, gam))) * 0.9;
  // abort at rotation: the roll up to Vr plus full braking, idle thrust
  let v2 = 0,
    x2 = 0;
  while (v2 + hw * KT < vr) {
    const va = v2 + hw * KT,
      M2 = va / (A.a * KT),
      al = aroll,
      q2 = 0.5 * A.rho * va * va,
      D2 = q2 * S * cd(ac, M2, al, dd),
      a = ((engine(ac, elev, M2, power).T - D2 - mu * W) / W) * G;
    v2 += Math.max(a, 0.01) * dt;
    x2 += v2 * dt;
  }
  let s = 0;
  while (v2 > 1 && s < 3e4) {
    const va = v2 + hw * KT,
      M2 = Math.max(0, va) / (A.a * KT),
      q2 = 0.5 * A.rho * va * va,
      D2 = q2 * S * cd(ac, M2, aroll, { ...dd, brake: true }),
      a = ((D2 + ac.ground.brake * W + engine(ac, elev, M2, 'idle').T) / W) * G;
    v2 -= a * dt;
    s += Math.max(v2, 0) * dt;
  }
  return {
    vr: vr / KT,
    vlof: vlof / KT,
    aLO,
    roll: x,
    time: t,
    to50: x + air,
    gamma: Math.min(gam, 0.35) / RAD,
    abort: x2 + s,
    A,
  };
}
export function landing(ac, o) {
  const { W, elev = 0, dIsa = 0, hw = 0, slope = 0 } = o,
    A = atmos(elev, dIsa),
    S = ac.af.area,
    aApp = Math.round(ac.af.aoaMax * 0.5 * 2) / 2;
  let V = 150 * KT;
  for (let i = 0; i < 40; i++) {
    const M = V / (A.a * KT);
    V = Math.sqrt(W / (0.5 * A.rho * S * Math.max(0.05, cl(ac, M, aApp))));
  }
  const vapp = V,
    vtd = vapp * 0.97,
    dt = 0.05,
    dd = { di: o.di || 0, gear: true };
  const roll = (aero, brakes) => {
    let v = Math.max(1, vtd - hw * KT),
      x = 0,
      t = 0;
    while (v > 1 && t < 300) {
      const va = v + hw * KT,
        M = Math.max(0, va) / (A.a * KT),
        al = aero && v > 100 * KT ? aApp : 1,
        q = 0.5 * A.rho * va * va,
        L = q * S * cl(ac, M, al),
        D = q * S * cd(ac, M, al, { ...dd, brake: aero }),
        Ti = engine(ac, elev, M, 'idle').T;
      const mu = brakes && t > 2 ? ac.ground.brake : ac.ground.roll,
        a = ((D + mu * Math.max(0, W - L) + W * slope + Math.max(0, Ti)) / W) * G;
      v -= a * dt;
      x += Math.max(v, 0) * dt;
      t += dt;
    }
    return x;
  };
  return {
    aApp,
    vapp: vapp / KT,
    vtd: vtd / KT,
    rollBrakes: roll(false, true),
    rollAero: roll(true, true),
    rollNoBrakes: roll(true, false),
    A,
  };
}

// maximum engine rpm at military power on the ground (% as the cockpit shows it: the chart value x 100)
export const milRpm = ac => (ac.rpm && ac.rpm.max ? Math.round(bilin(ac.rpm.max, 0, 0) * 100) : null);

// refusal speed: the highest speed (kt, ground speed) from which the aircraft can still be stopped on the runway with full brakes and idle thrust,
// accelerating from the threshold (the first 164 ft / 50 m are lost); capped at 225 kt (tyres). 0 when the runway is too short for any abort.
export function refusal(ac, o) {
  const { W, elev = 0, dIsa = 0, hw = 0, power = 'ab', rwy } = o;
  if (!(rwy > 0)) return null;
  const A = atmos(elev, dIsa),
    S = ac.af.area,
    mu = ac.ground.roll,
    dt = 0.05,
    dd = { di: o.di || 0, gear: true },
    avail = rwy - 164;
  let v = 0,
    x = 0,
    best = 0,
    t = 0;
  while (v < 225 * KT && t < 200) {
    // stopping distance from here
    let v2 = v,
      s = 0;
    while (v2 > 1 && s < 5e4) {
      const va = v2 + hw * KT,
        M = Math.max(0, va) / (A.a * KT),
        q = 0.5 * A.rho * va * va,
        D = q * S * cd(ac, M, 1, { ...dd, brake: true });
      v2 -= ((D + ac.ground.brake * W + engine(ac, elev, M, 'idle').T) / W) * G * dt;
      s += Math.max(v2, 0) * dt;
    }
    if (x + s <= avail) best = v;
    else break;
    const va = v + hw * KT,
      M = Math.max(0, va) / (A.a * KT),
      q = 0.5 * A.rho * va * va,
      L = q * S * cl(ac, M, 1),
      a =
        ((engine(ac, elev, M, power).T - q * S * cd(ac, M, 1, dd) - mu * Math.max(0, W - L) - W * (o.slope || 0)) / W) *
        G;
    v += Math.max(a, 0.01) * dt;
    x += v * dt;
    t += dt;
  }
  return best / KT;
}

// climb at military power to an altitude with a constant CAS up to a Mach, then constant Mach. Energy method (the acceleration along the climb is counted).
// -> {minutes, fuel (lb), nm}
export function climb(ac, o, casKt, machMax) {
  const { W: W0, dIsa = 0, di = 0, from = 1500, to } = o;
  let W = W0,
    t = 0,
    fuel = 0,
    nm = 0,
    prev = null;
  const spd = h => {
    const A = atmos(h, dIsa),
      M = Math.min(machMax, machFromCas(casKt, A));
    return { A, M, V: M * A.a * KT };
  };
  for (let h = from; h < to; h += 1000) {
    const hm = h + 500,
      s = spd(hm),
      s2 = spd(hm + 500),
      s1 = spd(hm - 500),
      dVdh = (s2.V - s1.V) / 1000,
      p = point(ac, { W, alt: hm, M: s.M, dIsa, di });
    if (p.stall) return null;
    const roc = p.psMil / (1 + (s.V / G) * dVdh);
    if (!(roc > 3)) return null; // ft/s
    const dtc = 1000 / roc,
      e = engine(ac, hm, s.M, 'mil');
    t += dtc;
    fuel += (e.ff * dtc) / 3600;
    W -= (e.ff * dtc) / 3600;
    nm += (s.V * Math.cos(Math.asin(Math.min(1, roc / s.V))) * dtc) / 6076.12;
  }
  return { minutes: t / 60, fuel, nm };
}
// the schedule with the least fuel to reach the altitude at military power, CAS 300..450 (a practical limit: faster always burns less in the tables) and Mach .70..0.90
export function climbSchedule(ac, o) {
  let best = null;
  for (let c = 300; c <= 450; c += 25)
    for (let m = 0.7; m <= 0.9001; m += 0.04) {
      const r = climb(ac, o, c, m);
      if (!r) continue;
      if (!best || r.fuel < best.fuel - 1e-6) best = { cas: c, mach: +m.toFixed(2), ...r };
    }
  return best;
}
