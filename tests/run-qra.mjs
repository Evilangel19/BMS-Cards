// A-A > DCA for a QRA flight (core/qra.js): the scramble line, the radar coverage, the collision point, the stern conversion, the checks, the A-A
// block of the ROE and its lines. Made-up base and targets.
import {
  qraKind,
  cleanQra,
  qraAlert,
  coverNm,
  qraIntercept,
  qraFromStpt,
  qraChecks,
  qraRoe,
  qraDtcLines,
  reachNm,
  timeTo,
  CLIMB_KT,
} from '../app/js/core/qra.js';
import { cleanFaor, faorLines, distNm, bearing, KM_NM } from '../app/js/core/faor.js';

let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const near = (a, b, t) => Math.abs(a - b) <= t;
const B = { x: 500, y: 500 },
  S = cleanQra(null),
  nm = (p, brg, d) => ({
    x: p.x + Math.sin((brg * Math.PI) / 180) * d * KM_NM,
    y: p.y + Math.cos((brg * Math.PI) / 180) * d * KM_NM,
  });

ck(
  'QRA and INTERCEPTION are QRA, BARCAP is not',
  qraKind('QRA') == 'QRA' && qraKind('INTERCEPTION') == 'QRA' && !qraKind('BARCAP')
);
ck(
  'a bad state: the defaults, values in their sliders',
  cleanQra({ ri: 9999, vi: 'x', wpn: 'nuke' }).ri == 150 &&
    cleanQra({ vi: 'x' }).vi == 520 &&
    cleanQra({ wpn: 'nuke' }).wpn == 'tight'
);

// the climb then the dash
ck('reach: 3 min of climb at 350 kt is 17.5 NM', near(reachNm(3, S), 17.5, 0.01));
ck('reach and time are inverse', near(timeTo(reachNm(7.5, S), S), 7.5, 1e-6));

// the alert: 40 NM, 480 kt raid: 3 min of climb (17.5 NM) + 22.5 NM at 520 kt = 5.6 min; rs = 40 + 480 * 5.6 / 60 = 84.9
{
  const A = qraAlert(B, 0, S);
  ck('alert: time to the intercept ' + A.tInt.toFixed(2), near(A.tInt, 3 + (22.5 / 520) * 60, 0.01));
  ck('alert: scramble line 85 NM (' + A.rs + ')', A.rs == 85);
  ck(
    'alert: the scramble line is square to the axis, 85 NM north',
    near(distNm(B, { x: (A.scr[0].x + A.scr[1].x) / 2, y: (A.scr[0].y + A.scr[1].y) / 2 }), 85, 0.01) &&
      near(A.scr[0].y, A.scr[1].y, 1e-6)
  );
  ck('alert: a faster raid pushes the line out', qraAlert(B, 0, { ...S, vt: 700 }).rs > A.rs);
  ck('alert: the correction turns the axis', qraAlert(B, 10, { ...S, cor: -15 }).brg == 355);
  // a radar 60 NM north of the base with 100 NM of range sees 160 NM out on the axis; one far to the side sees nothing of it
  const cov = coverNm(
    B,
    A.u,
    [nm(B, 0, 60), nm(B, 90, 300)].map((p, i) => ({ ...p, rng: (i ? 100 : 100) * KM_NM }))
  );
  ck('radar coverage on the axis 160 NM (' + cov + ')', cov == 160);
  ck('no radar: null', coverNm(B, A.u, []) == null);
  const W1 = qraChecks(S, B, { mode: 'ALERT', A, cover: 60, awacs: false, abs: [], idOk: true }),
    W2 = qraChecks(S, B, { mode: 'ALERT', A, cover: 160, awacs: false, abs: [], idOk: true }),
    W3 = qraChecks(S, B, { mode: 'ALERT', A, cover: 60, awacs: true, abs: [], idOk: true }),
    W4 = qraChecks(S, B, {
      mode: 'ALERT',
      A,
      cover: 160,
      awacs: false,
      abs: [{ ...nm(B, 10, 70), name: 'NORTH AB' }],
      idOk: true,
    });
  ck(
    'scramble line beyond the radar: red',
    W1.some(w => w[1] && /SCRAMBLE LINE/.test(w[0]))
  );
  ck('scramble line inside the radar: no red', !W2.some(w => w[1]));
  ck('AWACS on station: no red', !W3.some(w => w[1]));
  ck(
    'enemy airbase inside the scramble line on the axis: red',
    W4.some(w => w[1] && /NORTH AB/.test(w[0]))
  );
  ck(
    'weapons free without ID: red',
    qraChecks({ ...S, wpn: 'free' }, B, { mode: 'ALERT', A, cover: 160, abs: [], idOk: false }).some(
      w => w[1] && /FREE/.test(w[0])
    )
  );
  const L = qraDtcLines('ALERT', A, null, B);
  ck(
    'alert DTC lines: SCRAMBLE and INTERCEPT, two points each',
    L.map(z => z[1]).join() == 'SCRAMBLE,INTERCEPT' && L.every(z => z[2].length == 2)
  );
}

// the intercept: a target 100 NM north flying south at 480 kt, the fighter airborne at the time of the target
{
  const T = { ...nm(B, 0, 100), t: 0, hdg: 180, gs: 480 },
    I = qraIntercept(B, 0, T, S, false);
  ck('head-on: the vector is north', I && near(I.vec, 0, 0.5));
  ck(
    'head-on: the fighter and the target meet where both got there at the same time',
    I && near(reachNm(I.tInt, S), I.d, 0.5) && near(distNm(T, I.p), (480 * I.tInt) / 60, 0.5)
  );
  ck('head-on: aspect HOT', I && I.aspect == 'HOT');
  ck('the commit point is on the vector, before the intercept', I && I.commitPt && distNm(B, I.commitPt) < I.d);
  ck('no VID: no conversion', I && !I.conv);
  // a target flying away faster than the dash: none
  ck(
    'opening faster than the dash: no intercept',
    qraIntercept(B, 0, { ...nm(B, 0, 50), t: 0, hdg: 0, gs: 700 }, S, false) == null
  );
  // a crossing target (east to west, 60 NM north): the fighter leads it (vector east of north)
  const X = qraIntercept(B, 0, { ...nm(nm(B, 0, 60), 90, 60), t: 0, hdg: 270, gs: 450 }, S, true);
  ck(
    'crossing: the vector leads the target, ahead of its bearing now (45°): ' + (X && Math.round(X.vec)) + '°',
    X && X.vec >= 0 && X.vec < 40
  );
  ck(
    'VID: the conversion starts abeam the target by the displacement',
    X && X.conv && near(distNm(X.conv.aim, X.p), S.disp, 0.01) && near(distNm(X.conv.arc[12], X.p), 0, 0.01)
  );
  ck('VID: the turn goes behind the target', X && X.conv.arc[6].x > X.p.x);
  // the fighter left 20 minutes before the target was seen: it is further on
  const late = qraIntercept(B, -20 * 60000, T, S, false);
  ck('airborne earlier: the intercept is further out', late && late.d > I.d);
  const W = qraChecks(S, B, { mode: 'INTERCEPT', I: null, tgt: { st: T }, idOk: true });
  ck(
    'no intercept: red',
    W.some(w => w[1] && /No intercept/.test(w[0]))
  );
  const ic = { ...nm(B, 0, 20), n: 3, arr: 0 },
    W2 = qraChecks(S, B, { mode: 'INTERCEPT', I, tgt: { st: T }, ic, idOk: true });
  ck(
    'far from the steerpoint of BMS: a grey line, no red',
    W2.some(w => !w[1] && /STPT 3/.test(w[0])) && !W2.some(w => w[1])
  );
  const L = qraDtcLines('INTERCEPT', null, I, B);
  ck('intercept DTC lines: VECTOR and TARGET', L.map(z => z[1]).join() == 'VECTOR,TARGET');
}

// without a spotted target: the steerpoint of BMS
{
  const ic = { ...nm(B, 45, 50), n: 3, arr: 10 * 60000 },
    I = qraFromStpt(B, 0, ic, S, true);
  ck(
    'BMS steerpoint: the vector to it, 50 NM, 10 min',
    near(I.vec, 45, 0.5) && I.d == 50 && near(I.tInt, 10, 1e-6) && !I.track
  );
  ck('BMS steerpoint: the conversion as head-on', I.conv && near(distNm(I.conv.aim, ic), S.disp, 0.01));
  const W = qraChecks(S, B, { mode: 'INTERCEPT', I, tgt: { gone: false, st: null }, ic, idOk: true });
  ck('not spotted: said, not red', W.some(w => /not spotted/.test(w[0])) && !W.some(w => w[1]));
  ck(
    'gone: said',
    qraChecks(S, B, { mode: 'INTERCEPT', I, tgt: { gone: true, st: null }, ic }).some(w => /no longer/.test(w[0]))
  );
}

// the block of the ROE
{
  const a = cleanFaor(qraRoe(S, 'ALERT', { vec: 5, ri: 40, rs: 85, vid: true })),
    L = faorLines(a, false);
  ck(
    'alert block: QRA, the lines',
    a.kind == 'QRA' &&
      a.qra == 'ALERT' &&
      L.includes('SCRAMBLE LINE 85NM AXIS 005') &&
      L.includes('INTERCEPT 40NM FROM BASE') &&
      L.includes('VID: STERN CONV 4NM')
  );
  const b = cleanFaor(qraRoe(S, 'INTERCEPT', { vec: 0, ri: 30, vid: false })),
    M = faorLines(b, true);
  ck(
    'intercept block: the vector 360, ANGELS 25, no VID line',
    M.some(x => /Vector 360°, ANGELS 25/.test(x)) && !M.some(x => /VID/.test(x))
  );
  ck(
    'a block of DCA has no QRA lines',
    !faorLines(cleanFaor({ wpn: 'tight', commit: 40, stop: 20, drop: 12, alt: [20000, 30000] }), false).some(x =>
      /SCRAMBLE|VECTOR/.test(x)
    )
  );
  ck('a bad QRA field is dropped', cleanFaor({ ...qraRoe(S, 'X', {}) }).qra == null);
}
ck('the climb speed is 350 kt', CLIMB_KT == 350 && bearing({ x: 0, y: 0 }, { x: 1, y: 0 }) == 90);

console.log(bad ? 'FAIL - ' + bad + ' of ' + n : 'OK - ' + n + ' QRA checks');
process.exit(bad ? 1 : 0);
