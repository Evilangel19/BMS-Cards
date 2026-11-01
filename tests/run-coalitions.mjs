// Friend and foe come from the relations of the campaign (.tea), the same everywhere: map, ATO, tankers, JTAC, FAC(A), hostile battalion near a target
import { allyOf, hostileOf, neutralOf } from '../app/js/core/coalitions.js';
import { allyOf as allyMap } from '../app/js/core/mapdata.js';
import { jtacPick, pickTankers } from '../app/js/rules/support.js';
import { fac } from '../app/js/core/flight.js';
let ok = true;
const ck = (n, c) => {
  ok &&= !!c;
  console.log(c ? 'ok  ' : 'FAIL', n);
};
// relations 0 hostile, 1 allied, 2 friendly, 3 neutral, 4 unfriendly, 5 at war.  Here: 2 and 5 are allied, 3 is hostile to them, 6 is neutral.
const st = Array.from({ length: 8 }, () => Array(8).fill(0));
st[2][5] = st[5][2] = 1;
st[2][6] = st[6][2] = 3;
st[3][6] = st[6][3] = 3;
const C = { stance: st };
ck('same team: friend', allyOf(C, 2, 2));
ck('allied by the campaign although 5 is not below 4', allyOf(C, 2, 5) && allyOf(C, 5, 2));
ck('teams 2 and 3 are NOT friends here (the old "both below 4" rule said so)', !allyOf(C, 2, 3) && hostileOf(C, 2, 3));
ck('neutral is not a friend', !allyOf(C, 2, 6));
st[2][7] = st[7][2] = 5;
st[3][5] = st[5][3] = 4;
ck(
  'neutral (3) is neither a friend nor hostile: a third class',
  neutralOf(C, 2, 6) && !hostileOf(C, 2, 6) && !allyOf(C, 2, 6)
);
ck(
  'hostile (0), unfriendly (4) and at war (5) are hostile, in either direction',
  hostileOf(C, 2, 3) && hostileOf(C, 2, 7) && hostileOf(C, 7, 2) && hostileOf(C, 3, 5) && !neutralOf(C, 2, 7)
);
ck(
  'every team falls in exactly one class (ally, hostile, neutral) for a real team',
  [1, 2, 3, 4, 5, 6, 7].every(a =>
    [1, 2, 3, 4, 5, 6, 7].every(
      b => [allyOf(C, a, b), hostileOf(C, a, b), neutralOf(C, a, b)].filter(Boolean).length === 1
    )
  )
);
ck('without relations nothing is neutral', !neutralOf({}, 1, 4) && !neutralOf({}, 1, 2));
ck('team 0 (unknown) is never hostile', !hostileOf(C, 0, 2) && !hostileOf(C, 2, 0));
ck(
  'without relations: teams 1-3 stand together, 4 and above against them',
  allyOf({}, 1, 3) && !allyOf({}, 1, 4) && hostileOf({}, 1, 4) && !hostileOf({}, 1, 3)
);
ck('the map uses the same function', allyMap === allyOf);
// units of a small campaign
const D = {
  S: { 2001: 'Viper', 300: 'CAS', 301: 'AIR REFUEL', 302: 'FAC(A)' },
  gu: { 1: 'AAA', 2: 'Armor' },
  ac: { 5: 'KC-135R', 6: 'A-10A' },
  un: {},
};
const wp = (x, y, act, arr) => ({ x, y, z: 0, act, arr, dep: arr });
const flight = (n, owner, omis, wps, ci) => ({
  kind: 'flight',
  id: { n, c: 1 },
  owner,
  omis,
  wps,
  c: { i: ci },
  nameId: n,
  pkg: { n: 99, c: 1 },
  csId: 1,
  csNum: n,
});
const gnd = (n, owner, ci, x, y) => ({ kind: 'gnd', id: { n, c: 1 }, owner, nameId: n, x, y, c: { i: ci }, wps: [] });
const f = flight(1, 2, 0, [wp(100, 100, 0, 1000), wp(110, 110, 17, 2000), wp(120, 120, 7, 3000)], 6);
const tk5 = flight(2, 5, 1, [wp(100, 100, 24, 1500)], 5),
  tk3 = flight(3, 3, 1, [wp(100, 100, 24, 1500)], 5);
const jt5 = gnd(10, 5, 1, 111, 111),
  en3 = gnd(11, 3, 1, 112, 112);
const C2 = { stance: st, D, units: [f, tk5, tk3, jt5, en3], byId: {}, bull: null };
const reg = C => {
  C.units.forEach(u => {
    C.byId[u.id.n + ':' + u.id.c] = u;
  });
  C.byId['99:1'] = { els: [{ n: 1, c: 1 }] };
};
reg(C2);
let jp = null;
try {
  jp = jtacPick(C2, f);
} catch (e) {
  console.log('jtacPick:', e.message);
}
ck('JTAC: an allied battalion of team 5 serves, the hostile one of team 3 is the enemy', jp && jp.u === jt5);
const C3 = { ...C2, units: [f, jt5, gnd(12, 5, 1, 112, 112), gnd(13, 6, 1, 112.5, 112.5)] };
ck('JTAC: no hostile unit (a neutral one is not an enemy), no JTAC', jtacPick(C3, f) === null);
let tk = [];
try {
  tk = pickTankers(C2, f, null);
} catch (e) {
  console.log('pickTankers:', e.message);
}
ck('tankers: the allied tanker (team 5) is offered, the hostile one (team 3) is not', tk.length === 1 && tk[0] === tk5);
const fa5 = flight(20, 5, 2, [wp(105, 105, 17, 1500)], 6),
  fa3 = flight(21, 3, 2, [wp(105, 105, 17, 1500)], 6);
const C4 = { stance: st, D, units: [f, fa3, fa5], byId: {}, bull: { x: 90, y: 90 } };
reg(C4);
let fc = null;
try {
  fc = fac(C4, f, true);
} catch (e) {
  console.log('fac:', e.message);
}
ck('FAC(A): the allied one (team 5) is found, not the hostile one (team 3)', fc && /Viper20/.test(fc.ty));
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
