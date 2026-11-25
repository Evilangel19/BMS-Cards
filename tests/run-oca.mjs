// A-A > OCA (core/oca.js): the kinds, the defaults of the NATO manual, the position of the fighter on the package, the corridor of the sweep, the checks,
// the A-A block of the ROE and the DTC lines. A made-up package (km of a theater, times in ms), no BMS file.
import {
  KM_NM,
  ocaKind,
  ocaDefaults,
  cleanOca,
  modeOf,
  posCode,
  pkgWindow,
  fighterAt,
  track,
  sweepArea,
  ocaChecks,
  ocaRoe,
  ocaDtcLines,
} from '../app/js/core/oca.js';
import { faorLines, cleanFaor } from '../app/js/core/faor.js';
import { cleanSel, roeText, fullText, emptySel } from '../app/js/core/roesop.js';
import { setBase, sunAlt } from '../app/js/rules/ephemerides.js';
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
// the strikers: north at 480 kt (8 NM a minute), push at 09:00 from y 300, target at 09:10 (80 NM north), egress east
const T0 = 9 * 3600000,
  K = KM_NM,
  R = [
    { x: 500, y: 200, z: -2500, arr: T0 - 10 * 60000, dep: T0 - 10 * 60000, act: 1, n: 1 },
    { x: 500, y: 300, z: -2500, arr: T0, dep: T0, act: 2, n: 2 },
    { x: 500, y: 300 + 40 * K, z: -2500, arr: T0 + 5 * 60000, dep: T0 + 5 * 60000, act: 0, n: 3 },
    { x: 500, y: 300 + 80 * K, z: -2500, arr: T0 + 10 * 60000, dep: T0 + 10 * 60000, act: 17, n: 4 },
    { x: 500 + 40 * K, y: 300 + 80 * K, z: -2500, arr: T0 + 15 * 60000, dep: T0 + 15 * 60000, act: 0, n: 5 },
    { x: 500 + 80 * K, y: 300 + 80 * K, z: -2500, arr: T0 + 20 * 60000, dep: T0 + 20 * 60000, act: 0, n: 6 },
  ];
ok(
  'kinds: SWEEP, ESCORT; not RESCORT or STRIKE',
  ocaKind('sweep') == 'SWEEP' && ocaKind('ESCORT') == 'ESCORT' && !ocaKind('RESCORT') && !ocaKind('STRIKE')
);
const sw = ocaDefaults('SWEEP', '', null, 25000),
  det = ocaDefaults('ESCORT', 'det', null, 25000),
  emb = ocaDefaults('ESCORT', 'emb', null, 25000);
ok(
  'SWEEP: 3 min ahead, COMMIT 40, WPN FREE, target area 30 NM',
  sw.lead == 3 && sw.commit == 40 && sw.wpn == 'free' && sw.ta == 30
);
ok(
  'detached escort: 1 min, COMMIT 30, TIGHT, the block over the package',
  det.lead == 1 && det.commit == 30 && det.wpn == 'tight' && det.alt[0] == 27000
);
ok('embedded escort: with the package, at its side', emb.lead == 0 && emb.side == 1 && emb.off == 1);
ok(
  'a planned lead that fits the mode is the default (sweep 4.2 -> 4)',
  ocaDefaults('SWEEP', '', 4.2, 0).lead == 4 && ocaDefaults('SWEEP', '', 1, 0).lead == 3
);
ok(
  'a saved state put back in range',
  cleanOca({ lead: 99, side: 7, wpn: 'x', esc: 'zz' }, 'ESCORT', null, 0).lead == 10 &&
    cleanOca({ side: 7 }, 'ESCORT', null, 0).side == 0 &&
    cleanOca({ esc: 'zz' }, 'ESCORT', null, 0).esc == 'det'
);
ok(
  'the position codes of the NATO manual',
  posCode('sweep', 0, 0) == 'FS-1A' &&
    posCode('det', -1, 5) == 'FS-2B' &&
    posCode('emb', 1, 1) == 'FS-3C' &&
    posCode('det', 1, 0) == 'FS-2A'
);
const Wn = pkgWindow(R, 4);
ok(
  'the window: from the push to two steerpoints after the target',
  Wn.t0 == T0 && Wn.t1 == T0 + 20 * 60000 && Wn.pts.length == 5
);
// the fighter 3 min ahead on the route, then 3 min ahead and 10 NM to the right
let s = { ...sw, side: 0, off: 0 };
let p = fighterAt(R, s, T0);
ok(
  '3 min ahead of the package at the push: 24 NM north of it ' + ((p.y - 300) / K).toFixed(1),
  near((p.y - 300) / K, 24, 0.1) && near(p.x, 500, 0.01)
);
p = fighterAt(R, { ...s, side: 1, off: 10 }, T0);
ok('10 NM right of the route (heading north: to the east)', near((p.x - 500) / K, 10, 0.01));
p = fighterAt(R, { ...s, side: -1, off: 10 }, T0);
ok('10 NM left: to the west', near((p.x - 500) / K, -10, 0.01));
const T = track(R, s, Wn.t0, Wn.t1);
ok(
  'the track ends with the route (no point past the last steerpoint)',
  T.length > 10 && T[T.length - 1].t <= Wn.t1 - 3 * 60000
);
const C = sweepArea(T, 20),
  dSeg = (p, a, b) => {
    const vx = b.x - a.x,
      vy = b.y - a.y,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
  };
ok(
  'the sweep area: one outline, every point of it 10 NM from the track (north, then east) ' + C.length,
  C.length > 20 && C.every(p => near(Math.min(...T.slice(1).map((q, i) => dSeg(p, T[i], q))) / K, 10, 0.4))
);
ok(
  'the sweep area does not fill the inside of the turn: a point 20 NM inside the corner is out of it',
  (() => {
    const c = { x: T[0].x + 20 * K, y: T[T.length - 1].y - 20 * K };
    let inside = false;
    for (let i = 0, k = C.length - 1; i < C.length; k = i++)
      if (C[i].y > c.y != C[k].y > c.y && c.x < ((C[k].x - C[i].x) * (c.y - C[i].y)) / (C[k].y - C[i].y) + C[i].x)
        inside = !inside;
    return !inside;
  })()
);
ok(
  'one point: a circle; two: a capsule 20 NM wide',
  sweepArea([{ x: 0, y: 0 }], 20).every(p => near(Math.hypot(p.x, p.y) / K, 10, 0.4)) &&
    sweepArea(
      [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
      ],
      20
    ).every(p => near(dSeg(p, { x: 0, y: 0 }, { x: 0, y: 50 }) / K, 10, 0.4))
);
// the checks
const chk = (o, re) =>
  ocaChecks({ kind: 'SWEEP', s: { ...sw }, track: T, sams: [], ...o }).some(w => w[1] && re.test(w[0]));
ok(
  'a sweep under 2 min and within 10 NM is an escort',
  chk({ s: { ...sw, lead: 1 } }, /a detached escort, not a sweep/)
);
ok('a sweep 1 min ahead but 12 NM aside is fine', !chk({ s: { ...sw, lead: 1, off: 12, side: 1 } }, /not a sweep/));
ok(
  'an escort 2 min ahead is a sweep',
  ocaChecks({ kind: 'ESCORT', s: { ...det, lead: 2 }, track: T }).some(w =>
    /a sweep, the package is left alone/.test(w[0])
  )
);
ok(
  'COMMIT 45 for a sweep, 35 for a detached escort: over the manual',
  chk({ s: { ...sw, commit: 45 } }, /over 40 NM for a sweep/) &&
    ocaChecks({ kind: 'ESCORT', s: { ...det, commit: 35 }, track: T }).some(w =>
      /over 30 NM for a detached escort/.test(w[0])
    )
);
ok('COMMIT under the DOR', chk({ dor: 42 }, /COMMIT 40 NM < DOR 42/));
ok(
  'embedded escort at night',
  ocaChecks({ kind: 'ESCORT', s: { ...emb, night: true }, track: T }).some(w => /no close escort/.test(w[0]))
);
ok(
  'a SAM ring on the track, with the time',
  chk(
    { sams: [{ x: 500, y: 300 + 60 * K, r: 15 * K, name: 'SA-6' }], hm: t => String(Math.round((t - T0) / 60000)) },
    /^SA-6: inside its ring at \d+/
  )
);
ok(
  'a clean sweep: no red',
  ocaChecks({ kind: 'SWEEP', s: sw, track: T, sams: [], dor: 30, idOk: true, bingo: true }).filter(w => w[1]).length ==
    0
);
ok(
  'the flight plan leads by 1 min more than the page: a note',
  ocaChecks({ kind: 'SWEEP', s: sw, track: T, planned: 4.5 }).some(w => !w[1] && /Flight plan: lead 4.5 min/.test(w[0]))
);
ok(
  'modes',
  modeOf('SWEEP', {}) == 'sweep' && modeOf('ESCORT', { esc: 'emb' }) == 'emb' && modeOf('ESCORT', {}) == 'det'
);
ok(
  'an independent sweep: FS-1D, no lead rule',
  posCode('sweep', 0, 0, true) == 'FS-1D' &&
    !ocaChecks({ kind: 'SWEEP', s: { ...sw, lead: 0 }, track: T, indep: true }).some(w => /not a sweep/.test(w[0]))
);
ok(
  'night over the target: no embedded escort, with the height of the Sun',
  ocaChecks({ kind: 'ESCORT', s: emb, track: T, dark: true, sun: -14.4 }).some(
    w => w[1] && w[0] == 'Night over the target (Sun -14°): no close escort'
  )
);
ok('an independent sweep: the window ends at its last sweep steerpoint', pkgWindow(R, 3, 4).b == 3);
// the night from the date of the campaign (the Datacard): the middle of the theater (Korea, 38.5 N 127.5 E) on 21 June
ok('no date: no Sun', sunAlt(512, 512, 3 * 3600000) === null);
setBase('2026-06-21');
const noon = sunAlt(512, 512, 3.5 * 3600000),
  midnight = sunAlt(512, 512, 15.5 * 3600000);
ok(
  '21 June over Korea: the Sun high at 03:30Z (' +
    Math.round(noon) +
    '°), under the horizon at 15:30Z (' +
    Math.round(midnight) +
    '°)',
  noon > 70 && noon < 78 && midnight < -20
);
// the ROE block
const b = cleanFaor(ocaRoe(sw, 'SWEEP', 'FS-1A'));
ok(
  'the block keeps the position (an OCA block) and the target area, no lead',
  b.lead == null && b.pos == 'FS-1A' && b.ta == 30
);
ok(
  'its lines: no tactic (no lead, no position)',
  faorLines(b, false).join('|') == 'WPN FREE|COMMIT 40NM|STOP 30NM FROM PKG|BLOCK FL250-350|TGT AREA 30NM'
);
ok('escort lines', faorLines(cleanFaor(ocaRoe(det, 'ESCORT', 'FS-2A')), false).includes('STAY WITH THE PACKAGE'));
const sel = cleanSel({
  ...emptySel(),
  roe: { ws: 'tight', id: [], commit: 'n20', abort: [], extra: [], restr: [] },
  faor: b,
});
ok(
  'the ROE box: the WPN and COMMIT chosen by the pilot win over those of the block, then STOP',
  roeText(sel) == 'WPN TIGHT\nCOMMIT 20NM\nSTOP 30NM FROM PKG'
);
ok(
  'the ROE box without a choice of the pilot: WPN FREE and COMMIT 40NM of the block, then STOP',
  roeText({ ...sel, roe: { ...sel.roe, ws: null, commit: null } }) == 'WPN FREE\nCOMMIT 40NM\nSTOP 30NM FROM PKG'
);
ok('the ROE card: the A-A · SWEEP block', fullText(sel).roe[0][0] == 'A-A · SWEEP');
// the DTC lines
const inPoly = (c, C) => {
  let r = false;
  for (let i = 0, k = C.length - 1; i < C.length; k = i++)
    if (C[i].y > c.y != C[k].y > c.y && c.x < ((C[k].x - C[i].x) * (c.y - C[i].y)) / (C[k].y - C[i].y) + C[i].x) r = !r;
  return r;
};
// the package of the test: south to north, at the target (500, 300 + 80 NM) at 09:10
const W0 = [
    { x: 500, y: 300, arr: 0, t: 0 },
    { x: 500, y: 300 + 80 * K, arr: 600000, t: 600000 },
  ],
  TG = { x: 500, y: 300 + 80 * K, t: 600000 },
  E = ocaDtcLines(T, W0, TG, { ...det, lead: 0, side: 0, off: 0, stop: 30, commit: 40 }, false);
ok(
  'DTC, escort: one line, a U of 4 points open to the south (the arrival), its sides touching the circles (COMMIT 40 here) ' +
    JSON.stringify(E.map(z => z[2].map(p => [Math.round((p.x - 500) / K), Math.round((p.y - 300 - 80 * K) / K)]))),
  E.length == 1 &&
    E[0][2].length == 4 &&
    [
      [-40, -40],
      [-40, 40],
      [40, 40],
      [40, -40],
    ].every((q, i) => near((E[0][2][i].x - 500) / K, q[0], 0.5) && near((E[0][2][i].y - 300 - 80 * K) / K, q[1], 0.5))
);
{
  // pushed 60 NM south of the target: the sides go on to two points abeam of the push, 40 NM each side
  const B = ocaDtcLines(
      T,
      W0,
      TG,
      { ...det, lead: 0, side: 0, off: 0, stop: 30, commit: 40 },
      false,
      600000 * (20 / 80)
    ),
    q = B[0][2].map(p => [Math.round((p.x - 500) / K), Math.round((p.y - 300 - 80 * K) / K)]);
  ok(
    'DTC, escort with the push: 6 points, the sides bent back to it ' + JSON.stringify(q),
    q.length == 6 && q[0][0] == -40 && q[0][1] == -60 && q[5][0] == 40 && q[5][1] == -60 && q[1][1] == -40
  );
}
const LS = ocaDtcLines(T, W0, null, { ...sw, w: 20 }, true),
  SA = sweepArea(T, 20),
  ring = LS.length == 2 ? [...LS[0][2], ...LS[1][2].slice(1, 5)] : [];
ok(
  'DTC, sweep: two lines of 6 points that meet at the ends, no track',
  LS.length == 2 &&
    LS.every(z => z[2].length == 6) &&
    near(LS[0][2][5].x, LS[1][2][0].x, 1e-9) &&
    near(LS[1][2][5].y, LS[0][2][0].y, 1e-9)
);
ok(
  'DTC, sweep: the whole sweep area inside the 10 points, none of them far out (under 6 NM from it)',
  SA.every(p => inPoly(p, ring) || Math.min(...ring.map((q, i) => dSeg(p, q, ring[(i + 1) % ring.length]))) < 0.1) &&
    ring.every(p => Math.min(...SA.map(q => Math.hypot(p.x - q.x, p.y - q.y))) / K < 6)
);

if (bad) {
  console.log(`${bad} of ${n} OCA checks FAILED`);
  process.exit(1);
}
console.log(`OK - ${n} OCA checks`);
