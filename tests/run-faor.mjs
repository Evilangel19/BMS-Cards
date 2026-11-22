// BVR > FAOR (core/faor.js): the kinds of mission, the threat axis from the CAP points and the enemy, the FEZ, the hardwall, the warnings, the FAOR block
// of the ROE (core/roesop.js) and the lines of the DTC. Made-up positions (km of a theater), no BMS file.
import {
  KM_NM,
  capKind,
  defaults,
  limits,
  cleanState,
  plannedMin,
  threatBrg,
  faorGeo,
  inFez,
  hardwall,
  checks,
  faorRoe,
  cleanFaor,
  faorLines,
  faorDtcLines,
  altBlock,
  angDiff,
} from '../app/js/core/faor.js';
import { cleanSel, roeText, fullText, emptySel, cleanPresets, pickDefault } from '../app/js/core/roesop.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

// ---- the kinds
ok(
  'the CAP kinds of BMS: BARCAP (and BARCAP2), CAP, AMBUSHCAP, TARCAP, DCA, HAVCAP, RESCAP / RESCORT',
  capKind('BARCAP') == 'BARCAP' &&
    capKind('BARCAP2') == 'BARCAP' &&
    capKind('ambushcap') == 'AMBUSHCAP' &&
    capKind('RESCORT') == 'RESCAP' &&
    capKind('HAVCAP') == 'HAVCAP' &&
    capKind('SWEEP') === null &&
    capKind('STRIKE') === null
);
// ---- the time on station: from the first CAP point to the last, never under the planned one
const T0 = 9 * 3600000,
  cap = [
    { x: 500, y: 500, n: 4, arr: T0, dep: T0 },
    { x: 500 + 20 * KM_NM, y: 500, n: 5, arr: T0 + 5 * 60000, dep: T0 + 40 * 60000 },
  ];
ok('planned on station: 40 min', plannedMin(cap) == 40);
const D = defaults('BARCAP', 40, null);
ok(
  'BARCAP: 60 × 30 NM, FL250-350, TIGHT, 40 min',
  D.w == 60 && D.d == 30 && D.alt[0] == 25000 && D.wpn == 'tight' && D.stn == 40
);
ok('HAVCAP: at least one hour on station', defaults('HAVCAP', 30, null).stn == 60 && limits('HAVCAP', 30).stn[0] == 60);
ok('the on station slider starts at the planned time', limits('CAP', 45).stn[0] == 45);
const A = defaults('AMBUSHCAP', 40, 3200);
ok('AMBUSHCAP: the block from the MSA of the FEZ (+500 / +3 000 ft)', A.alt[0] == 3700 && A.alt[1] == 6200);
const C0 = cleanState({ w: 999, stn: 5, wpn: 'x', alt: [30000, 20000] }, 'CAP', 45);
ok('a saved state put back in range', C0.w == 120 && C0.stn == 45 && C0.wpn == 'tight' && C0.alt[1] > C0.alt[0]);

// ---- the threat axis: square to the CAP leg (east-west), on the side of the enemy (north)
const en = [
  { x: 510, y: 700 },
  { x: 560, y: 720 },
];
const anc = { x: 500 + 10 * KM_NM, y: 500 };
const tb = threatBrg(anc, en);
ok('the enemy airbases are about north ' + tb.toFixed(0), angDiff(tb, 0) < 15);
let s = { ...D };
let G = faorGeo(cap, tb, s);
ok('CAP leg 090: the axis 000 (north, the enemy side) ' + G.brg.toFixed(0), near(G.leg, 90) && angDiff(G.brg, 0) < 0.5);
G = faorGeo(cap, 180, s);
ok('the enemy to the south: the axis 180', angDiff(G.brg, 180) < 0.5);
G = faorGeo(cap, tb, { ...s, axis: 'par' });
ok('along the leg: 090 or 270, the nearer to the enemy', angDiff(G.brg, 90) < 0.5 || angDiff(G.brg, 270) < 0.5);
G = faorGeo(cap, tb, { ...s, cor: 20 });
ok('the correction turns the axis', angDiff(G.brg, 20) < 0.5);
G = faorGeo([cap[0]], 45, s);
ok('one CAP point: straight at the enemy', angDiff(G.brg, 45) < 0.5 && G.leg === null);
// ---- the FEZ: the long side to the threat, the CAP in its back third
G = faorGeo(cap, 0, s);
const xs = G.box.map(p => p.x),
  ys = G.box.map(p => p.y);
ok(
  'FEZ 60 NM wide east-west, 30 NM deep, 20 NM in front of the anchor and 10 behind',
  near((Math.max(...xs) - Math.min(...xs)) / KM_NM, 60, 0.01) &&
    near((Math.max(...ys) - anc.y) / KM_NM, 20, 0.01) &&
    near((anc.y - Math.min(...ys)) / KM_NM, 10, 0.01)
);
ok(
  'the CAP points inside the FEZ',
  cap.every(p => inFez(G, s, p))
);
ok('COMMIT 40 NM north of the anchor', near((G.commit[0].y - anc.y) / KM_NM, 40, 0.01));
// ---- the hardwall: a CAP 50 NM to the east
const mate = { name: 'VIPER 2', anchor: { x: anc.x + 50 * KM_NM, y: anc.y } };
const H = hardwall(G, s, [mate, { name: 'FAR', anchor: { x: anc.x, y: anc.y - 200 * KM_NM } }]);
ok(
  'the hardwall half way (25 NM east), square to the line between the CAPs',
  H && H.name == 'VIPER 2' && near((H.a.x - anc.x) / KM_NM, 25, 0.01) && near(H.a.x, H.b.x, 0.01)
);
ok('my FEZ (30 NM to the east) crosses it: gap -5 NM', near(H.gap, -5, 0.01));
ok(
  'no CAP within 80 NM: no hardwall',
  hardwall(G, s, [{ name: 'FAR', anchor: { x: anc.x, y: anc.y - 200 * KM_NM } }]) === null
);
// ---- the warnings
const ctx = { kind: 'BARCAP', planned: 40, msa: 27000, dor: 45, idOk: false, bingo: false, hw: H, targets: [] };
const W = checks(G, { ...s, wpn: 'free', stop: 50 }, ctx)
  .filter(w => w[1])
  .map(w => w[0]);
ok(
  'COMMIT under the DOR',
  W.some(t => /COMMIT 40 NM < DOR 45/.test(t))
);
ok(
  'STOP more than 30 NM past the CAP points',
  W.some(t => /^STOP 50 NM: over 30 NM/.test(t))
);
ok(
  'STOP 25 NM past them: a note, not red',
  checks(G, { ...s, stop: 25 }, { kind: 'CAP', planned: 40 }).some(w => /over 20 NM/.test(w[0]) && !w[1])
);
ok(
  'the FEZ floor under the MSA',
  W.some(t => /FEZ floor FL250 under the MSA FL270/.test(t))
);
ok(
  'WPN FREE without ID, BUGOUT without BINGO',
  W.some(t => /WPN FREE without ID/.test(t)) && W.some(t => /BUGOUT without BINGO/.test(t))
);
ok(
  'the FEZ over the hardwall',
  W.some(t => /over the HARDWALL with VIPER 2/.test(t))
);
ok(
  'a clean BARCAP: no red',
  checks(G, s, {
    kind: 'BARCAP',
    planned: 40,
    msa: 5000,
    dor: 30,
    idOk: true,
    bingo: true,
    hw: null,
    targets: [],
  }).filter(w => w[1]).length == 0
);
ok(
  'DCA: STOP further than 30 NM from the asset',
  checks(G, { ...s, stop: 35 }, { kind: 'DCA', planned: 40 }).some(w => /further than 30 NM from the asset/.test(w[0]))
);
ok(
  'TARCAP: a target of the strikers outside the FEZ',
  checks(G, s, {
    kind: 'TARCAP',
    planned: 40,
    targets: [{ x: anc.x, y: anc.y + 60 * KM_NM, name: 'HAMMER STPT 6' }],
  }).some(w => /TARGET HAMMER STPT 6 outside the FEZ/.test(w[0]))
);
// ---- the lines of the DTC
const L = faorDtcLines(G, H);
ok(
  'DTC: the FEZ closed (5 points), COMMIT / STOP as a U (4), the HARDWALL (2)',
  L.fez.length == 5 && L.fez[0] === L.fez[4] && L.cs.length == 4 && L.hw.length == 2
);

// ---- the FAOR block of the ROE
const fa = faorRoe({ ...s, commit: 35.4 }, 'BARCAP', 'Viper 2');
ok('the block: rounded numbers, the hardwall', fa.commit == 35 && fa.hw == 'Viper 2' && fa.wpn == 'tight');
ok(
  'a block from outside is checked',
  cleanFaor({ wpn: 'nope' }) === null && cleanFaor({ ...fa, commit: 1e9 }).commit == 200
);
ok(
  'altitude blocks: FL250-350, 3 700 ft-6 200 ft',
  altBlock([25000, 35000]) == 'FL250-350' && altBlock([3700, 6200]) == '3 700 ft-6 200 ft'
);
const sel = cleanSel({
  ...emptySel(),
  roe: { ws: 'hold', id: ['vid'], commit: 'n20', abort: ['bingo'], extra: [], restr: [] },
  faor: fa,
});
const txt = roeText(sel).split('\n');
ok(
  'the ROE box: the FAOR weapons control and commit in place of the chosen ones, same number of lines ' + txt,
  txt[0] == 'WPN TIGHT' && txt.includes('COMMIT 35NM') && !txt.includes('COMMIT 20NM') && txt.length == 4
);
const ft = fullText(sel);
ok(
  'the ROE card: a FAOR block first, without the weapons status and commit of the menu',
  ft.roe[0][0] == 'FAOR · BARCAP' &&
    ft.roe[0][1].length == faorLines(fa, true).length &&
    !ft.roe.some(r => /Weapons status|Commit/.test(r[0]))
);
ok(
  'the short lines: FEZ WPN, COMMIT, STOP, DROP, the block, HARDWALL, NO FIRE OUTSIDE FEZ',
  faorLines(fa, false).join('|') ==
    'FEZ WPN TIGHT|COMMIT 35NM|STOP 20NM|DROP 15NM|FEZ FL250-350|HARDWALL VIPER 2|NO FIRE OUTSIDE FEZ'
);
ok('a preset never keeps a FAOR block', cleanPresets([{ name: 'X', sel }])[0].sel.faor === null);
ok(
  'the default of a flight has no FAOR block',
  pickDefault({ mine: [{ name: 'X', sel, cats: ['Defensive Counter Air'] }], src: 'me', cat: 'Defensive Counter Air' })
    .sel.faor === null
);
ok('without a FAOR block the ROE text is as before', roeText({ ...sel, faor: null }).split('\n')[0] == 'WPN HOLD');

if (bad) {
  console.log(`${bad} of ${n} FAOR checks FAILED`);
  process.exit(1);
}
console.log(`OK - ${n} FAOR checks`);
