// @ts-check
// DEAD: destroy a SAM (BMS Training Manual 28.4-28.5). Pure geometry on the campaign map (x east, y north in km; times in ms) for three tactics:
// - HARM standoff (location known): launch outside the WEZ on the way in, turn at the arc radius (the WEZ + a margin) and fly the arc round it inside the
//   search radar, so the SAM radiates and the HARM finds it; the impact must come while the flight is on the arc;
// - Hunter-Killer (location unknown): both to their anchors outside the WEZ; the hunter flies the arc to bait the SAM, defends (ECM, chaff, notch) and
//   goes back to its anchor; the killer marks the SAM (HAD, TGP), then attacks from its anchor while the cover flies an arc on the other side;
// - Bombs / Maverick (no HARM): the attack is planned on the Weapons pages; here the checks.
// The orbit: 'R' with the SAM on the right (clockwise round it), 'L' on the left. The roles per seat: shooter, hunter, killer, cover.
import { timed, posAt, taskOf } from './sead.js';

const KM_NM = 1.852,
  FT_NM = 6076.12;
const brg = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
/** a point at bearing b (deg) and d nm from c (km) */
export const at = (c, b, d) => ({
  x: c.x + Math.sin((b * Math.PI) / 180) * d * KM_NM,
  y: c.y + Math.cos((b * Math.PI) / 180) * d * KM_NM,
});
const nm = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / KM_NM;
/** a smooth line through points (Catmull-Rom, 10 points between two) */
export function spline(P, k = 10) {
  if (P.length < 3) return P.slice();
  const o = [],
    g = i => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++)
    for (let j = 0; j < k; j++) {
      const t = j / k,
        p0 = g(i - 1),
        p1 = g(i),
        p2 = g(i + 1),
        p3 = g(i + 2),
        f = (a, b, c, d) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      o.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  o.push(P[P.length - 1]);
  return o;
}
/** the length of a line (nm) */
const plen = P => P.slice(1).reduce((a, p, i) => a + nm(P[i], p), 0);
/** the points of an arc of radius r nm round c from bearing b0 over span degrees (signed: + clockwise) */
export function arcPts(c, r, b0, span, step = 4) {
  const n = Math.max(2, Math.ceil(Math.abs(span) / step)),
    o = [];
  for (let i = 0; i <= n; i++) o.push(at(c, b0 + (span * i) / n, r));
  return o;
}
// the altitude blocks of the manual (28.4): MSL here (the flight plan gives no height above the ground)
export function altRating(ft) {
  if (ft >= 30000) return { r: 'OPTIMAL', ok: true };
  if (ft >= 16000) return { r: 'GOOD', ok: false };
  if (ft >= 13000) return { r: 'RISKY', ok: false };
  if (ft >= 6000) return { r: 'BAD', ok: false };
  if (ft > 300) return { r: 'VERY BAD', ok: false };
  if (ft >= 50) return { r: 'OPTIMAL', ok: true };
  return { r: 'VERY BAD', ok: false };
}
export const ALT_BLOCKS = [
  ['ABOVE 30 000 FT', 'OPTIMAL', '#22c55e'],
  ['16 000–29 000 FT', 'GOOD', '#facc15'],
  ['13 000–15 000 FT', 'RISKY', '#dc2626'],
  ['6 000–12 000 FT', 'BAD', '#ef4444'],
  ['BELOW 5 000 FT', 'VERY BAD', '#b91c1c'],
  ['50–300 FT AGL', 'OPTIMAL', '#22c55e'],
];
export const ROLES = {
  hs: ['shooter', 'cover'],
  hk: ['hunter', 'killer', 'cover'],
  bomb: ['hunter', 'killer', 'cover'],
};
/** the roles a seat can take: HARM standoff shooter or cover; Hunter-Killer and bombs the lead pair hunter or killer, the element (#3, #4) also cover */
export const rolesOf = (tactic, i) =>
  tactic == 'hs' ? ROLES.hs : i < 2 ? ['hunter', 'killer'] : ROLES[tactic] || ROLES.hk;
/** the default roles: HARM standoff #1 (and #3) shooter, #2 (and #4) cover; Hunter-Killer and bombs #1 killer, #2 hunter, the element cover */
export const defaultRoles = (tactic, n) =>
  Array.from({ length: n }, (_, i) =>
    tactic == 'hs' ? (i % 2 ? 'cover' : 'shooter') : i >= 2 ? 'cover' : i % 2 ? 'hunter' : 'killer'
  );
/** the role of the other aircraft of a pair (#1-#2, #3-#4) when one is chosen: shooter and cover, hunter and killer swapped; cover with cover */
export const partnerRole = (tactic, r) =>
  tactic == 'hs'
    ? r == 'shooter'
      ? 'cover'
      : 'shooter'
    : r == 'hunter'
      ? 'killer'
      : r == 'killer'
        ? 'hunter'
        : 'cover';

/**
 * @param {object} o
 * @param {{x:number,y:number,rng:number,det:number,name:string}} o.sam the SAM: its ring and its search radar (km)
 * @param {any[]} o.wps the waypoints of your flight
 * @param {'hs'|'hk'|'bomb'} o.tactic
 * @param {'R'|'L'} [o.side] the orbit: the SAM on the right or on the left
 * @param {number} [o.ecm] the WEZ with ECM on, a share of the WEZ (0.7)
 * @param {number} [o.margin] the arc outside the WEZ (nm, 2)
 * @param {string[]} o.roles a role for each seat
 * @param {(p:{x:number,y:number,altFt:number,gsKt:number}, aim:{x:number,y:number}) => {rTh:number, vm:number}} [o.shot] the HARM range (nm) and mean speed (nm/s)
 */
export function deadPlan(o) {
  const s = o.sam,
    W = timed(o.wps),
    tk = taskOf(o.wps),
    R = s.rng / KM_NM,
    ecm = o.ecm || 0.7,
    Rdet = (s.det || s.rng) / KM_NM,
    margin = o.margin == null ? 2 : o.margin,
    Ra = R + margin,
    dir = o.side == 'L' ? -1 : 1,
    out = { R, Recm: R * ecm, Rdet, Ra, warn: [], steps: [], seats: [], task: tk };
  // where the flight comes from: the steerpoint before its task (else its first one); its altitude and ground speed on that leg
  const ti = tk ? W.findIndex(p => p.n == tk.n) : W.length - 1,
    prev = W[Math.max(0, ti - 1)] || W[0],
    tT = tk ? tk.t0 : W.length ? W[W.length - 1].arr : 0;
  if (!prev) return { ...out, error: 'no flight plan' };
  const pin = posAt(W, tT - 1000) || { altFt: prev.z * 10, gsKt: 450 },
    gs = pin.gsKt > 150 ? pin.gsKt : 450,
    alt = pin.altFt > 0 ? pin.altFt : 20000,
    th = nm(prev, s) > 1 ? brg(prev.x - s.x, prev.y - s.y) : 270, // the bearing from the SAM to where the flight comes from
    sec = d => (d / gs) * 3600000; // the time to fly d nm, ms
  Object.assign(out, { gs, alt, th, dir, rating: altRating(alt), slow: gs < 350 });
  if (Ra > Rdet)
    out.warn.push(
      'The arc (' +
        Ra.toFixed(0) +
        ' nm) is outside the search radar (' +
        Rdet.toFixed(0) +
        ' nm): the SAM may not switch on.'
    );
  const roles = o.roles,
    idx = r => roles.map((q, i) => (q == r ? i : -1)).filter(i => i >= 0);
  if (o.tactic == 'hs') {
    // the launch: as far as the HARM reaches, but not more than 12 nm before the turn
    const pL0 = { ...at(s, th, Ra + 12), altFt: alt, gsKt: gs },
      h0 = o.shot ? o.shot(pL0, s) : { rTh: Ra + 12, vm: 0.36 },
      vg = gs / 3600, // nm/s
      vm0 = h0.vm || 0.36,
      // the HARM must arrive 10 s at least after the turn onto the arc (the SAM radiates when you are on it): dL / vm >= (dL - Ra) / vg + 10
      dOn = vm0 > vg ? (Ra / vg - 10) / (1 / vg - 1 / vm0) : Infinity,
      dL = Math.max(Ra + 1, Math.min(Ra + 12, h0.rTh * 0.95, dOn)),
      L = at(s, th, dL),
      h = o.shot ? o.shot({ ...L, altFt: alt, gsKt: gs }, s) : h0,
      tof = dL / (h.vm || 0.36),
      tL = tT - sec(dL),
      tTurn = tL + sec(dL - Ra),
      tImp = tL + tof * 1000,
      // the orbit: at least 120 degrees round the WEZ, and 90 s past the impact (at most 220)
      span = Math.min(220, Math.max(120, (((((tImp + 90000 - tTurn) / 3600000) * gs) / Ra) * 180) / Math.PI)),
      arc = arcPts(s, Ra, th, dir * span),
      bEnd = th + dir * span,
      egr = at(s, bEnd + dir * 25, R + 18),
      // the egress: a smooth curve out of the arc (it goes on along the arc, then away from the SAM)
      e0 = at(s, bEnd, Ra),
      tg = bEnd + dir * 90,
      e1 = {
        x: e0.x + Math.sin((tg * Math.PI) / 180) * 8 * KM_NM,
        y: e0.y + Math.cos((tg * Math.PI) / 180) * 8 * KM_NM,
      },
      egrPath = Array.from({ length: 13 }, (_, i) => {
        const u = i / 12,
          a = (1 - u) * (1 - u),
          b = 2 * u * (1 - u),
          c = u * u;
        return { x: a * e0.x + b * e1.x + c * egr.x, y: a * e0.y + b * e1.y + c * egr.y };
      });
    if (dL > h.rTh)
      out.warn.push(
        'Out of range: the HARM reaches ' +
          h.rTh.toFixed(1) +
          ' nm, the launch is at ' +
          dL.toFixed(1) +
          ' nm from the SAM.'
      );
    if (tImp < tTurn)
      out.warn.push('The HARM arrives before you are on the arc: the SAM may still be quiet. Launch farther out.');
    const sh = idx('shooter');
    sh.forEach((i, k) =>
      out.seats.push({
        i,
        role: 'shooter',
        tl: tL + k * 8000,
        imp: tImp + k * 8000,
        tof: Math.round(tof),
        dL,
        brgL: (th + 180) % 360,
      })
    );
    idx('cover').forEach(i => out.seats.push({ i, role: 'cover', arc: arcPts(s, Ra + 4, th, dir * span) }));
    Object.assign(out, {
      L,
      dL,
      tL,
      tTurn,
      tImp,
      tof,
      turn: at(s, th, Ra),
      arc,
      egr,
      egrPath,
      span,
      tEnd: tTurn + sec((Ra * span * Math.PI) / 180),
      rTh: h.rTh,
    });
    out.path = [prev, L, at(s, th, Ra), ...arc];
    return out;
  }
  // Hunter-Killer and bombs, as the Training Manual draws it: the 2-ship in fighting wing to the reset point outside the WEZ (the anchors H and K
  // either side of it), the hunter round the SAM inside the WEZ (on the WEZ with ECM on: the bait), the killer the same way round outside it; at the
  // SAM launch the hunter defends, the killer marks; both back to the reset point; then the killer attacks from below the way in while the other
  // gives top cover
  const Da = Ra + 8,
    off = (Math.asin(Math.min(0.5, 1.5 / Da)) * 180) / Math.PI, // the anchors 1.5 nm either side of the way in
    X = at(s, th, Da),
    A = at(s, th + dir * off, Da),
    B = at(s, th - dir * off, Da),
    tA = tT - sec(Da),
    // the bait: inside the WEZ, on the edge of the WEZ with ECM on (the jammer keeps the SAM from a lock there; it still sees and may shoot)
    Rb = R * ecm,
    Rk = R + 4, // the killer: 4 nm outside the WEZ
    b0 = th + dir * 30,
    hIn = spline([A, at(s, th + dir * 10, (Da + Rb) / 2 + 1.5), at(s, b0, Rb)]),
    arc = arcPts(s, Rb, b0, dir * 85),
    bE = b0 + dir * 85,
    def = spline([
      at(s, bE, Rb),
      at(s, bE + dir * 15, Rb + 5),
      at(s, bE - dir * 10, Da + 5),
      at(s, th + dir * 45, Da + 5),
      A,
    ]),
    kIn = spline([B, at(s, th + dir * 5, (Da + Rk) / 2 + 3), at(s, b0 + dir * 5, Rk)]),
    kArc = arcPts(s, Rk, b0 + dir * 5, dir * 85),
    kE = b0 + dir * 90,
    kBack = spline([
      at(s, kE, Rk),
      at(s, kE + dir * 12, Rk + 5),
      at(s, kE - dir * 10, Da + 9),
      at(s, th + dir * 40, Da + 9),
      B,
    ]),
    // the SAM launch: at the middle of the bait arc, on both lines
    bL = b0 + dir * 50,
    tArc0 = tA + sec(plen(hIn)),
    tArc1 = tArc0 + sec((Rb * 85 * Math.PI) / 180),
    tLaunch = tArc0 + sec((Rb * 50 * Math.PI) / 180),
    tBack = tArc1 + sec(plen(def)),
    // the killer's attack: from the reset point below the way in, then into the SAM (the last part the weapon)
    atk = spline([B, at(s, th - dir * 20, Da - 1), at(s, th - dir * 40, R + 2), at(s, th - dir * 35, R * 0.55)]),
    tAtk = tBack + 60000,
    aEnd = atk[atk.length - 1],
    // top cover: an orbit outside the WEZ on the side of the bait
    cover = arcPts(s, Da + 2, th + dir * 25, dir * 60);
  Object.assign(out, {
    Rb,
    Rk,
    Da,
    X,
    hIn,
    kIn,
    kArc,
    kBack,
    A,
    B,
    tA,
    arc,
    tArc0,
    tArc1,
    tLaunch,
    launchH: at(s, bL, Rb),
    launchK: at(s, bL, Rk),
    def,
    tBack,
    atk,
    tAtk,
    cover,
    bK: th - dir * off,
    attackHdg: (Math.round(brg(s.x - aEnd.x, s.y - aEnd.y)) + 360) % 360 || 360,
  });
  if (o.tactic == 'hk' && !idx('hunter').length) out.warn.push('No hunter: give the role to a seat.');
  if (!idx('killer').length) out.warn.push('No killer: give the role to a seat.');
  roles.forEach((r, i) => out.seats.push({ i, role: r }));
  // the offsets of the anchors from the task steerpoint (the target): bearing, range (ft), the ground elevation unknown (0)
  if (tk) {
    const T = { x: tk.x, y: tk.y },
      row = p => ({
        brg: Math.round(brg(p.x - T.x, p.y - T.y)) || 360,
        rngFt: Math.round(nm(T, p) * FT_NM),
        nm: nm(T, p),
      });
    out.oa = { n: tk.n, oa1: row(A), oa2: row(B) };
  }
  return out;
}
