// @ts-check
// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import { ord, acOf, actName, els0, hms, nearObj, csOf } from '../core/flight.js';
import { geoLL, hmN, locXY } from './geo.js';
import { allyOf, hostileOf } from '../core/coalitions.js';
function svc(C, f) {
  const B = [0, 1, 2, 3, 4, 7, 8],
    w = f.wps,
    a = w.find(p => !B.includes(p.act));
  if (!a) return null;
  const g = w.filter(p => p.act == a.act),
    st = g[0].arr,
    en = g[g.length - 1].dep || g[g.length - 1].arr,
    nm = actName(w, w.indexOf(g[0]), C.D.S[300 + f.omis] || '');
  const gnd = [14, 15, 16, 17, 19].includes(a.act),
    mn = C.D.S[300 + f.omis] || '';
  // missions against ground units (DEAD, SEAD, the three CAS, BAI, SCAR, AI, FAC(A)): the target is the hostile battalion at the attack point (a radar or a site next to it must not take its place)
  const bn =
    gnd && /^(DEAD|SEAD|CAS|ON CALL CAS|PRE-PLAN CAS|BAI|SCAR|AI|FAC\(A\))$/.test(mn)
      ? hostileGnd(C, f, g[0].x, g[0].y)
      : null;
  const o = gnd && !bn ? nearObj(C, g[0].x, g[0].y) : null;
  // CAS (on call, pre-planned, plain): the time that counts is the time on station, from the first attack point to the last one; the other ground attacks have a single TOT
  const cas = /^(ON CALL CAS|PRE-PLAN CAS|CAS)$/.test(mn);
  // ESCORT: the flights of the package that attack ground targets are the ones escorted: "Escort Cobra 6, Viper 2"
  const esc =
    mn == 'ESCORT'
      ? els0(C, f)
          .filter(e => e !== f && e.kind == 'flight' && (e.wps || []).some(p => [14, 15, 16, 17, 19].includes(p.act)))
          .map(e => csOf(C, e))
      : [];
  return {
    tm: !st ? '' : gnd ? (cas && en && en > st ? hms(st) + ' - ' + hms(en) : hms(st)) : hmN(st) + ' - ' + hmN(en),
    tgt: esc.length ? nm + ' ' + esc.join(', ') : bn ? bn.name : (o && o[1]) || nm,
    ll: bn ? geoLL(C, bn.u.x, bn.u.y) : o ? geoLL(C, o[2], o[3]) : '',
  };
}
// the hostile ground unit (battalion) closest to a point, within km; null when there is none
function hostileGnd(C, f, x, y, km = 1) {
  /** @type {any} */
  let b = null,
    bd = km;
  C.units.forEach(u => {
    if (u.kind != 'gnd' || u.nameId == null || !hostileOf(C, u.owner, f.owner)) return;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      b = u;
    }
  });
  return b ? { u: b, d: bd, name: gndName(C, b) } : null;
}
// "1153rd AAA Battalion": ordinal + category of the unit class + Battalion
function gndName(C, u) {
  const c = (C.D.gu && C.D.gu[u.c.i]) || (C.D.un && C.D.un[u.c.i] && C.D.un[u.c.i][0]) || '';
  return (ord(u.nameId) + ' ' + c + ' Battalion').replace(/\s+/g, ' ').trim();
}
function pickTankers(C, f, P) {
  const el = els0(C, f),
    all = el.flatMap(e => e.wps),
    ts = all.map(p => p.arr).filter(Boolean),
    a = ts.length ? Math.min(...ts) : -1e15,
    b = all.length ? Math.max(...all.map(p => p.dep || p.arr)) : 1e15;
  const win = u => {
    let g = u.wps.filter(p => p.act == 24);
    if (!g.length) g = u.wps.filter(p => p.arr);
    return g.length ? [g[0].arr, g[g.length - 1].dep || g[g.length - 1].arr] : [0, 0];
  };
  const asg = P && P.tanker && C.byId[P.tanker.n + ':' + P.tanker.c],
    ty = u => acOf(C, u),
    probe = /F\/A-18|F-18|EF-18|CF-188|AV-8|Harrier/i.test(ty(f));
  const pref = u => (probe ? /^KC-130/.test(ty(u)) : /^KC-(135|10)/.test(ty(u)));
  const c = C.units.filter(
    u =>
      u.kind == 'flight' &&
      /^KC-/.test(ty(u)) &&
      u.wps.length &&
      (u === asg || (allyOf(C, u.owner, f.owner) && (w => w[0] <= b && w[1] >= a)(win(u))))
  );
  return c
    .filter(u => u !== f && !el.some(e => e.id.n == u.id.n && e.id.c == u.id.c))
    .sort((x, y) => Number(pref(y)) - Number(pref(x)) || Number(y === asg) - Number(x === asg) || win(x)[0] - win(y)[0])
    .slice(0, 2);
}
// the friendly ground unit that acts as JTAC of a CAS flight: {u, cat, name, d, loc} or null
function jtacPick(C, f) {
  if (!/CAS$/.test(C.D.S[300 + f.omis] || '')) return null;
  const B = [0, 1, 2, 3, 4, 7, 8],
    tg = f.wps.filter(p => !B.includes(p.act));
  if (!tg.length) return null;
  const ally = o => allyOf(C, o, f.owner),
    g = C.units.filter(u => u.kind == 'gnd'),
    en = g.filter(u => hostileOf(C, u.owner, f.owner));
  if (!en.length) return null;
  const dm = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / 1.852;
  let best = null;
  g.filter(u => ally(u.owner) && C.D.gu[u.c.i]).forEach(u => {
    const dt = Math.min(...tg.map(p => dm(u, p))),
      de = Math.min(...en.map(e => dm(u, e)));
    if ((dt <= 10 || de <= 6) && dt <= 30 && (!best || dt < best.d))
      best = {
        u,
        cat: C.D.gu[u.c.i],
        name: ord(u.nameId) + ' ' + C.D.gu[u.c.i] + ' Battalion',
        d: dt,
        loc: locXY(C, u.x, u.y),
      };
  });
  return best;
}
function jtac(C, f, uhf6) {
  if (!uhf6) return null;
  const b = jtacPick(C, f);
  return b && { cat: b.cat, name: b.name, d: b.d, loc: b.loc };
}
export { svc, pickTankers, jtac, jtacPick };
