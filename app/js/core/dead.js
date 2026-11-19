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
export const ROLES = { hs: ['shooter', 'cover'], hk: ['hunter', 'killer', 'cover'], bomb: ['killer', 'cover'] };
/** the default roles: HARM standoff all shooters; Hunter-Killer #1 killer, #2 hunter (a 4-ship: two pairs); bombs all killers */
export const defaultRoles = (tactic, n) =>
  Array.from({ length: n }, (_, i) =>
    tactic == 'hs' ? 'shooter' : tactic == 'hk' ? (i % 2 ? 'hunter' : 'killer') : 'killer'
  );

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
      span = Math.min(200, (((((tImp + 60000 - tTurn) / 3600000) * gs) / Ra) * 180) / Math.PI),
      arc = arcPts(s, Ra, th, dir * Math.max(30, span)),
      bEnd = th + dir * Math.max(30, span),
      egr = at(s, bEnd, R + 15);
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
    idx('cover').forEach(i =>
      out.seats.push({ i, role: 'cover', arc: arcPts(s, Ra + 4, th, dir * Math.max(30, span)) })
    );
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
      tEnd: tTurn + sec((Ra * Math.max(30, span) * Math.PI) / 180),
      rTh: h.rTh,
    });
    out.path = [prev, L, at(s, th, Ra), ...arc, egr];
    return out;
  }
  // Hunter-Killer (and the bombs: the killer's run from its anchor): the anchors 8 nm outside the arc, either side of the way in
  const Da = Ra + 8,
    bH = th + dir * 15,
    bK = th - dir * 15,
    A = at(s, bH, Da),
    B = at(s, bK, Da),
    tA = tT - sec(Da),
    tArc0 = tA + 60000 + sec(Da - Ra),
    arc = arcPts(s, Ra, bH, dir * 90),
    tArc1 = tArc0 + sec((Ra * Math.PI) / 2),
    bE = bH + dir * 90,
    def = [at(s, bE, Ra), at(s, bE + dir * 10, Ra + 7), at(s, (bE + bH) / 2, Da + 4), A],
    tBack = tArc1 + sec(Ra * 0.9 + 14),
    atk = [B, at(s, bK, R * 0.9), at(s, bK, 4)],
    tAtk = tBack + 60000,
    cover = arcPts(s, Ra + 4, bK + dir * 20, -dir * 70);
  Object.assign(out, { A, B, tA, arc, tArc0, tArc1, def, tBack, atk, tAtk, cover, bK, attackHdg: (bK + 180) % 360 });
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
