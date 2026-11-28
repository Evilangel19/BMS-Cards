// @ts-check
// Performance > AAR: the refuelling of the flight chosen at its tanker (core/aar.js). The tankers of the datacard (TANKER 1 / 2), the rendezvous with its
// ATP-56 name (RV GOLF: en route, the tanker where it is at the time of the Refuel steerpoint; RV ECHO: at the anchor as the tanker passes it; RV HEAD-ON:
// on the first leg, the receiver turns behind the tanker), the distance from the ARIP, the fuel (FULL, to the JOKER, an AMOUNT) from the fuel plan of the Performance page (deps.fuel), the procedure for the boom or the probe
// with the calls by their names, the map (the lent Leaflet map), the cards (Smart AAR, classic with the map), Display > AAR on the Map page, OA1 / OA2 of the
// Refuel steerpoint in the DTC. One list of shapes for the map and the cards (core/aakit.js).
// The page draws inside the Performance page (core/perfpage.js): left() is its card in the left column, mount() the middle and the right columns.
// deps: {esc, toast, confirm, ctx() -> X, cyclePlan, planMode, fuel(wps) -> {plan, need(k), loaded, joker, cap (the tanks full)} | null, toLL, attach, detach, snap, kbAdd, dtc {open, has, setOA}, sop()}
// X: {ok, why, me {key, name, n, ac, pkgNo, tag}, wps (the waypoints of the flight), k (index of its Refuel steerpoint), tankers [{name, type, tcn, uhf, win,
//     wps}], sop [{id, o, txt}] (the Tanker topics of its SOP)}
import {
  trackOf,
  racetrack,
  rendezvous,
  onload,
  procedure,
  methodOf,
  serves,
  tankerKind,
  offset,
  hm,
  CALLS,
  KM_NM,
  OVERTAKE,
  JOIN_BELOW,
  HEAD_KT,
  HEAD_TRAIL,
  RATE,
  CYCLE_MIN,
} from './aar.js';
import { toMag } from './magvar.js';
import { tankerJB, jokerFor, BASIC } from './fuelplan.js';
import { timed } from './sead.js';
import { atmos, cas } from './airperf.js';
import { mapKeep } from './mapkeep.js';
import { SC_W, SC_H } from './smartcard.js';
import { drawSmartAar } from './smartaar.js';
import { drawAACard, aaBox, AAC_W, AAC_H } from './aacard.js';
import { busyRun } from './busy.js';
import { fmtLL } from './mapdata.js';
import { drawLeaflet, toPx, toInk, snapMap, addCards, allOf } from './aakit.js';

const COL = { trk: '#4aa3ff', me: '#3ddc84', anc: '#f0b040', ip: '#b07cff', stpt: '#8b98a8', tk: '#e6edf3' };
const KINDS = [
  ['smart', 'Smart AAR'],
  ['map', 'With the map'],
];
const DIST = [10, 80, 5];
const PFL = ['Map filters', 'No filters', 'Plan', 'Plan + PPT']; // the button of the filters of the map (as DEAD and TASMO)
const PUSH_KT = 420, // to the ARIP from the push steerpoint when the Refuel steerpoint has no time (the speed of the fuel plan without times)
  ARRIVE = 1000; // the least fuel at the join (lb): as the tanker arrival of the fuel plan
const MODE = { golf: 'RV GOLF', echo: 'RV ECHO', head: 'RV HEAD-ON' };
const fmt = v => (v == null || !isFinite(v) ? '--' : Math.round(v).toLocaleString('en-US'));
const flOf = a => (a >= 18000 ? 'FL' + String(Math.round(a / 100)).padStart(3, '0') : fmt(a) + ' ft');
const kLb = v => (v == null || !isFinite(v) ? '--' : (Math.round(v / 100) / 10).toFixed(1));

export function createAarPage(deps) {
  const { esc } = deps;
  let st = { f: {} },
    X = null, // the context of the flight
    S = null, // the choices for it
    T = null, // the track of the tanker
    R = null, // the rendezvous
    FU = null, // the fuel
    PU = null, // the push: {i (index of the steerpoint in the waypoints), n (its number), next (index of the steerpoint after the refuelling), fixed, list}
    why = '',
    M = null,
    pend = null,
    failed = false,
    fit = true,
    fitKey = '',
    host = null;
  try {
    const o = JSON.parse(sessionStorage.getItem('aar1') || 'null');
    if (o && typeof o == 'object' && o.f && typeof o.f == 'object') st = o;
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem('aar1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  // the defaults of a flight: the rendezvous and the offload of its SOP (Tanker), the ARIP 40 NM before the ARCP, a left turn
  const sopOf = id => ((X && X.sop) || []).find(t => t.id == id);
  function defaults() {
    const rv = sopOf('rv'),
      off = sopOf('offload');
    return {
      tk: 0,
      mode: rv && rv.o == 'anchor' ? 'echo' : rv && rv.o == 'pp' ? 'head' : 'golf',
      fill: off && (off.o == 'topoff' || off.o == 'plan') ? 'joker' : 'full',
      amount: 4000,
      dist: 40,
      turn: 'L',
    };
  }

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    T = R = FU = PU = null;
    why = '';
    if (!X || !X.ok) return;
    const d = defaults(),
      raw = st.f[X.me.key] || {};
    S = {
      tk: raw.tk == 1 && X.tankers.length > 1 ? 1 : 0,
      mode: ['golf', 'echo', 'head'].includes(raw.mode) ? raw.mode : d.mode,
      fill: ['full', 'joker', 'amount'].includes(raw.fill) ? raw.fill : d.fill,
      amount: Math.max(0, Math.min(20000, +raw.amount || d.amount)),
      dist: Math.max(DIST[0], Math.min(DIST[1], +raw.dist || d.dist)),
      turn: raw.turn == 'R' ? 'R' : 'L',
      push: +raw.push || 0, // the steerpoint to go to the tanker from (the Refuel steerpoint with no time)
      at: +raw.at || 0, // the join time chosen with the slider (the Refuel steerpoint with no time); 0: the earliest
    };
    const tk = X.tankers[S.tk];
    if (!tk) return void (why = 'No tanker on the datacard of ' + X.me.name + ' (TANKER 1 / 2).');
    T = trackOf(tk.wps);
    if (!T) return void (why = tk.name + ' has no track (two Fuel steerpoints of a tanker).');
    const w = timed(X.wps),
      ref = w.find(p => p.n == X.k + 1), // the Refuel steerpoint in the route, with its time
      dep = p => (p.dep > p.arr ? p.dep : p.arr);
    let pp, plan;
    if (ref) {
      // the Refuel steerpoint in the route: from the steerpoint before it, at its time
      pp = w.find(p => p.n == X.k);
      PU = { i: X.k - 1, n: X.k, next: X.k + 1, fixed: true, list: [] };
      plan = ref.arr;
    } else {
      // BMS puts the Refuel steerpoint after the landing, with no time: the pilot chooses the steerpoint of the route he goes to the tanker from
      const list = w.filter(p => p.n > 1 && p.act != 7 && p.act != 4);
      if (!list.length) return void (why = X.me.name + ' has no steerpoint of the route to go to the tanker from.');
      const mid = { x: (T.a.x + T.b.x) / 2, y: (T.a.y + T.b.y) / 2 },
        nmTo = p => Math.hypot(p.x - mid.x, p.y - mid.y) / KM_NM,
        inWin = list.filter(p => dep(p) + (nmTo(p) / PUSH_KT) * 3600000 >= T.t0 && dep(p) <= T.t1),
        lastAct = list.reduce((a, p) => (BASIC.includes(p.act) ? a : p), null),
        after = lastAct && list.find(p => p.n > lastAct.n),
        def = inWin.length ? inWin.reduce((a, p) => (nmTo(p) < nmTo(a) ? p : a)) : after || list[list.length - 1];
      pp = list.find(p => p.n == S.push) || def;
      PU = { i: pp.n - 1, n: pp.n, next: pp.n, fixed: false, list: list.map(p => ({ n: p.n, t: dep(p) })), def: def.n };
    }
    let from = pp ? { x: pp.x, y: pp.y, t: dep(pp) } : null;
    if (!ref) {
      // the earliest join: the first time at which the push steerpoint reaches the ARIP at 420 kt or slower (the ARIP moves with the tanker: a scan
      // by 20 s, at most to the end of its station)
      const reach = t => {
        const r = rendezvous({ T, mode: 'golf', dist: S.dist, turn: S.turn, plan: t, from });
        return r && (Math.hypot(r.arip.x - from.x, r.arip.y - from.y) / KM_NM / PUSH_KT) * 3600000 <= r.tip - from.t;
      };
      let lo = Math.max(from.t, T.t0);
      while (lo < Math.max(T.t1, from.t) && !reach(lo)) lo += 20000;
      // the latest join: the whole flight done before the tanker goes off station (the time on the boom of the earliest join, the onloads change
      // little), and the fuel at the join not below 1,000 lb with the hold
      PU.lo = lo;
      PU.hi = lo;
      plan = lo;
      const at = t => {
        const r0 = rendezvous({ T, mode: S.mode, dist: S.dist, turn: S.turn, plan: t, from });
        if (!r0) return null;
        // you hold at the push steerpoint and push at 420 kt: the push time puts you at the ARIP on time
        const d = Math.hypot(r0.arip.x - from.x, r0.arip.y - from.y) / KM_NM,
          late = r0.tip - (d / PUSH_KT) * 3600000,
          // less than 1 min early: you fly a little slower, no hold
          push = late - from.t >= 60000 ? late : from.t,
          f2 = { ...from, t: push };
        return {
          R: rendezvous({ T, mode: S.mode, dist: S.dist, turn: S.turn, plan: t, from: f2 }),
          hold: push - from.t,
        };
      };
      // the plan at a join time t: R and FU (null: the tanker does not fly then)
      const tryAt = t => {
        const a = at(t);
        if (!a || !a.R) return (R = FU = null);
        R = a.R;
        R.hold = a.hold;
        R.from = { ...from, t: from.t + a.hold };
        fuel();
        return R;
      };
      const fits = t => tryAt(t) && (!FU || (flightEnd() <= T.t1 && FU.fArct >= ARRIVE));
      if (tryAt(lo)) {
        // a first guess from the earliest join, then back by 1 min to the first time that fits (the onloads grow with the hold)
        const busy = FU ? flightEnd() - R.arct : 60000,
          perMin = FU ? FU.hb : 0;
        let hi = lo + Math.floor((T.t1 - busy - lo) / 60000) * 60000;
        if (FU && perMin > 0) hi = Math.min(hi, lo + Math.floor((FU.fArct - ARRIVE) / perMin) * 60000);
        while (hi > lo && !fits(hi)) hi -= 60000;
        PU.hi = Math.max(lo, hi);
      }
      R = FU = null;
      plan = S.at ? Math.max(PU.lo, Math.min(PU.hi, S.at)) : lo;
      PU.at = plan;
      const a = at(plan);
      R = a && a.R;
      if (R) {
        R.hold = a.hold;
        from = { ...from, t: from.t + a.hold };
      }
    } else R = rendezvous({ T, mode: S.mode, dist: S.dist, turn: S.turn, plan, from });
    if (!R) return void (why = 'The tanker does not fly at the time of the join (' + hm(plan) + ').');
    // with no time on the Refuel steerpoint the ±1 min of ATP-56 is to the push: the speed to the ARIP says it
    if (!ref) R.warn = R.warn.filter(x => !/^The ARCT is/.test(x[0]));
    R.from = from;
    // OA1 / OA2 go on the steerpoint the pilot goes to the tanker from: the Refuel steerpoint when it has a time, else the steerpoint chosen in Join after
    // (BMS puts the Refuel steerpoint with no time after the landing: offsets on it pointed at the wrong place, and stayed there when Join after changed)
    R.oaN = ref ? X.k + 1 : PU.n;
    R.at = ref || pp;
    fuel();
  }
  // the fuel along the plan to the tanker, and after it; null without the aircraft data
  function fuel() {
    const F = deps.fuel ? deps.fuel(X.wps) : null;
    if (!F || !F.plan) return;
    const rows = F.plan.rows,
      i = PU.i,
      used = j => rows[0].minExact - rows[j].minExact,
      lg = rows[PU.fixed ? X.k : Math.min(i + 1, rows.length - 1)], // the leg after the push: its burn per NM
      pn = lg && lg.nm > 0 && lg.burn > 0 ? lg.burn / lg.nm : 15,
      // the burn a minute in the hold at the push steerpoint and behind the tanker: as the leg after the push at 420 kt (an estimate, more than a
      // hold at the endurance speed: the safe side)
      hb = (pn * PUSH_KT) / 60,
      fk1 = F.loaded - used(i) - ((R.hold || 0) / 60000) * hb,
      d1 = R.from ? Math.hypot(R.arip.x - R.from.x, R.arip.y - R.from.y) / KM_NM : 0,
      nm = (p, q) => Math.hypot(q.x - p.x, q.y - p.y) / KM_NM,
      d2 = R.turn ? nm(R.arip, R.turn.p) + Math.PI * R.turn.r + nm(R.turn.roll, R.arcp) : nm(R.arip, R.arcp),
      fArip = fk1 - pn * d1,
      fArct = fArip - pn * d2,
      nx = rows[PU.next] && rows[PU.next].minExact != null ? PU.next : -1,
      // the rest of the plan after the join: from the ARCP back to the next steerpoint of the route, then its fuel plan (to the landing with the reserve)
      need = PU.fixed
        ? F.need(X.k)
        : nx >= 0
          ? rows[nx].minExact + pn * nm(R.arcp, X.wps[nx])
          : F.plan.reserve + pn * nm(R.arcp, X.wps[i]),
      cap = F.cap || F.loaded, // the tanks full (internal and drop tanks): FULL, and the most the tanks take at the join
      O = onload({ at: fArct, need, full: cap, joker: F.joker, fill: S.fill, amount: S.amount }),
      // TANK J/B: the fuel at the push to reach the join with 1,000 lb (the plan gives it when the Refuel steerpoint is in the route)
      b0 = ARRIVE + pn * (d1 + d2),
      jb = (PU.fixed && tankerJB(F.plan, X.wps, null, F.joker)) || {
        bingo: Math.ceil(b0 / 100) * 100,
        joker: jokerFor(Math.ceil(b0 / 100) * 100, F.joker),
      },
      // the flight, one after the other (ATP-56: one receiver on the boom or on the basket): the lead, then each wingman from the observation
      // position, CYCLE_MIN after the one before him disconnects. A wingman burns fuel while he waits: his onload is more than the lead's.
      seq = [];
    let t = R.arct + 60000;
    for (let k = 0; k < nAc(); k++) {
      const wait = k ? (t - R.arct) / 60000 : 0,
        o = k ? onload({ at: fArct - wait * hb, need, full: cap, joker: F.joker, fill: S.fill, amount: S.amount }) : O;
      t += o.min * 60000;
      seq.push({ n: k + 1, onload: o.onload, end: t });
      t += CYCLE_MIN * 60000;
    }
    FU = { fk1, fArip, fArct, need, d1, d2, ...O, jb, full: cap, hb, seq };
  }
  const tk = () => X.tankers[S.tk];
  const method = () => methodOf(X.me.ac);
  const joinAlt = () => Math.max(1000, T.alt - JOIN_BELOW);
  const kcasOf = (tas, alt) => {
    const A = atmos(alt);
    return cas(tas / A.a, A);
  };
  const done = () => R.arct + 60000 + (FU ? FU.min * 60000 : 0);
  // the whole flight (one after the other: FU.seq); null without the fuel
  const nAc = () => Math.max(1, +(X && X.me && X.me.n) || 1),
    flightEnd = () => (FU ? FU.seq[FU.seq.length - 1].end : null),
    doneAll = flightEnd;
  // the headings to fly (magnetic, as the HSI): ARIP -> ARCP; head-on: the parallel course to the turn (the reciprocal of the first leg, the track at
  // two turn radii on the side of the turn), then the course of the track after the 180° turn
  const tb = (p, q) => ((Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI + 360) % 360,
    m3 = (d, p) => String(Math.round(toMag(d, p.x, p.y)) % 360 || 360).padStart(3, '0') + '°';
  function legs() {
    if (R.turn) {
      const side = R.turn.sd > 0 ? 'left' : 'right';
      return [
        {
          leg: 'ARIP → turn',
          hdg: m3(tb(T.b, T.a), R.arip),
          note: 'the track ' + (2 * R.turn.r).toFixed(1) + ' NM on your ' + side,
          short:
            'ARIP>TURN ' +
            m3(tb(T.b, T.a), R.arip) +
            ' TRACK ' +
            (2 * R.turn.r).toFixed(1) +
            'NM ' +
            side.toUpperCase(),
        },
        {
          leg: 'Turn → ARCP',
          hdg: m3(tb(T.a, T.b), R.turn.roll),
          note: side + ' turn 180°, on the track',
          short: 'TURN ' + side[0].toUpperCase() + '>ARCP ' + m3(tb(T.a, T.b), R.turn.roll),
        },
      ];
    }
    const h = m3(tb(R.arip, R.arcp), R.arip);
    return [
      {
        leg: 'ARIP → ARCP',
        hdg: h,
        note: S.mode == 'echo' ? 'on the line of the track' : 'the tanker ahead',
        short: 'ARIP>ARCP ' + h,
      },
    ];
  }
  // the checks: the rendezvous, the tanker for the method, the fuel
  function warns() {
    const W = [...R.warn],
      m = method(),
      s = serves(tk().type, m);
    if (s === false)
      W.unshift([tk().type + ' has no ' + (m == 'probe' ? 'drogue' : 'boom') + ': choose the other tanker.', true]);
    // the fuel to reach the tanker: at the push (TANK J/B), at the join; and what if the tanker is not there
    const earlier = PU.fixed ? 'carry more fuel' : 'push from an earlier steerpoint or carry more fuel';
    if (FU && FU.fArct < 0)
      W.push([
        'Not enough fuel to reach the tanker: ' +
          fmt(-FU.fArct) +
          ' lb short at the join (' +
          fmt(FU.fk1) +
          ' lb at STPT ' +
          PU.n +
          ', TANK Bingo ' +
          fmt(FU.jb.bingo) +
          '): ' +
          earlier +
          '.',
        true,
      ]);
    else if (FU && FU.fArct < ARRIVE)
      W.push([
        'Only ' +
          fmt(FU.fArct) +
          ' lb at the join, less than ' +
          fmt(ARRIVE) +
          ' (TANK Bingo ' +
          fmt(FU.jb.bingo) +
          ' at STPT ' +
          PU.n +
          '): ' +
          earlier +
          '.',
        true,
      ]);
    if (FU && FU.fArct >= 0 && FU.fArct < FU.need)
      W.push([
        'No tanker, no way home: ' +
          fmt(FU.fArct) +
          ' lb at the join, the rest of the plan needs ' +
          fmt(FU.need) +
          ' lb (with the reserve). Know your divert.',
        false,
      ]);
    if (FU && FU.short) W.push(['The onload does not cover the rest of the plan (' + fmt(FU.need) + ' lb).', true]);
    if (done() > T.t1) W.push(['The refuelling ends after the tanker leaves (' + hm(T.t1) + ').', true]);
    return W;
  }

  // ---- the shapes (the map, the classic card, the Smart card)
  // the heading of each leg at its middle: head-on, the parallel course and the course after the turn; else ARIP -> ARCP
  function hdgLabels() {
    const L = legs(),
      mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      at = R.turn ? [mid(R.arip, R.turn.p), mid(R.turn.roll, R.arcp)] : [mid(R.arip, R.arcp)];
    return at.map((p, i) => ({ t: 'label', p, text: L[i].hdg, col: COL.me, ink: { text: L[i].hdg, bold: true } }));
  }
  function spec() {
    const n = X.k + 1,
      lab = (p, text, col, ink) => ({ t: 'label', p, text, col, ink: ink || false });
    return [
      // the side of the turns is not known: both racetracks, faint, and the line of the track
      ...[-1, 1].map(sd => ({
        t: 'poly',
        pts: racetrack(T, sd),
        col: COL.trk,
        w: 1.5,
        dash: [4, 6],
        close: true,
        ink: { dash: [2, 4], grey: true },
      })),
      { t: 'poly', pts: [T.a, T.b], col: COL.trk, w: 3, ink: { w: 2 } },
      // the join leg fits the view; the way in from the steerpoint before does not (the cards stay on the track)
      ...(R.from ? [{ t: 'poly', pts: [R.from, R.arip], col: COL.me, w: 2.5, fit: false, ink: { w: 2 } }] : []),
      ...(R.turn
        ? [
            { t: 'poly', pts: [R.arip, R.turn.p, ...R.turn.arc, R.arcp], col: COL.me, w: 2.5, ink: { w: 2 } },
            { t: 'dot', p: R.turn.p, col: COL.me, k: 'dot', ink: { label: 'TURN ' + hm(R.turn.t), bold: true } },
            lab(R.turn.p, 'TURN · ' + hm(R.turn.t) + ' · ' + R.turn.range.toFixed(0) + ' NM', COL.me),
          ]
        : [{ t: 'poly', pts: [R.arip, R.arcp], col: COL.me, w: 2.5, ink: { w: 2 } }]),
      // the headings to fly, on their legs (magnetic)
      ...hdgLabels(),
      { t: 'dot', p: R.at, col: COL.stpt, k: 'sq', ink: { label: 'STPT ' + n } },
      lab(R.at, 'STPT ' + n, COL.stpt),
      { t: 'dot', p: T.a, col: COL.anc, k: 'dot', ink: { label: 'ANCHOR', bold: true } },
      lab(T.a, 'ANCHOR', COL.anc),
      { t: 'dot', p: R.arip, col: COL.ip, k: 'dot', ink: { label: 'ARIP ' + hm(R.tip), bold: true } },
      lab(R.arip, 'ARIP · OA2 · ' + hm(R.tip), COL.ip),
      { t: 'dot', p: R.arcp, col: COL.tk, k: 'tri', ink: { label: 'ARCP ' + hm(R.arct), bold: true } },
      lab(R.arcp, 'ARCP · OA1 · ' + tk().name + ' at ' + hm(R.arct) + ' (ARCT)', COL.tk),
      lab(T.b, flOf(T.alt) + ' · ' + T.kcas + ' KCAS', COL.trk, { text: flOf(T.alt) }),
    ];
  }
  const layers = (L, map, WL) => drawLeaflet(L, map._arR, WL, deps.toLL, spec(), esc);

  // ---- the page
  const seg = (k, opts, c) =>
    `<span class="seg">${opts.map(([v, l, t, off]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}"${off ? ' disabled' : ''} data-arset="${k}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</span>`;
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  const tile = (a, b, s) =>
    `<div class="tile"><span>${a}</span><b>${b}</b>${s ? `<small class="hint">${s}</small>` : ''}</div>`;
  // a table; nl: the number of columns from the left that are aligned left
  const tbl = (H, rows, nl = 1) => {
    const al = i => (i < nl ? ' style="text-align:left"' : '');
    return `<div class="wtbl"><table><tr>${H.map((h, i) => `<th${al(i)}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${al(i)}>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  };
  const tcnTxt = t =>
    (t.tcn ? t.tcn + ' · ' : '') +
    ({ brg: 'distance and bearing', dme: 'distance only' }[tankerKind(t.type).tcn] || 'A-A TACAN');
  /** the card of the left column (Performance builds it with its own inputs) */
  function left() {
    compute();
    return `<div class="wcard" id="aarl">${leftIn()}</div>`;
  }
  function leftIn() {
    if (!X || !X.ok)
      return `<h3>AAR</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a flight.')}</p>`;
    if (!X.tankers.length) return `<h3>AAR</h3><p class="hint">${esc(why)}</p>`;
    const t = tk(),
      m = method();
    return `<h3>AAR · ${m == 'probe' ? 'PROBE' : 'BOOM'}</h3><div class="wrow"><label>Tanker</label>${seg(
      'tk',
      X.tankers.map((q, i) => [i, 'TANKER ' + (i + 1) + ' · ' + esc(q.name), q.type]),
      S.tk
    )}</div><div class="kv">${kv('TYPE', esc(t.type) + ' · ' + (serves(t.type, m) === false ? 'no ' + (m == 'probe' ? 'drogue' : 'boom') : m == 'probe' ? 'drogue' : 'boom'), serves(t.type, m) === false ? 'wbad' : '')}${kv('A-A TACAN', esc(tcnTxt(t)))}${kv('UHF', esc(t.uhf || '--'))}${T ? kv('TRACK', flOf(T.alt) + ' · ' + T.kcas + ' KCAS · ' + Math.round(T.leg) + ' NM legs') : ''}${kv('ON STATION', esc(t.win || '--'))}</div>${
      PU && !PU.fixed
        ? `<div class="wrow"><label>Join after</label><select data-arpush aria-label="Join after" title="The default: the steerpoint nearest to the track while the tanker is on station, else the first one after the target">${PU.list
            .map(
              p =>
                `<option value="${p.n}"${p.n == PU.n ? ' selected' : ''}>STPT ${p.n} · ${hm(p.t)}${p.n == PU.def ? ' (default)' : ''}</option>`
            )
            .join(
              ''
            )}</select></div>${PU.lo != null ? slr('at', 'Join time', [PU.lo, PU.hi, 60000], PU.at, hm(PU.at), false, PU.hi <= PU.lo, 'From the earliest time you can reach the ARIP to the latest time: the flight is done before the tanker goes off station, and you have ' + fmt(ARRIVE) + ' lb at the join') : ''}<p class="hint wnote">BMS gives the Refuel steerpoint ${X.k + 1} no time. Choose the steerpoint and the join time. You fly to the ARIP at ${PUSH_KT} kt. When you are early, you hold at the steerpoint.</p>`
        : ''
    }<div class="wrow"><label>Rendezvous</label>${seg(
      'mode',
      [
        [
          'golf',
          'RV GOLF',
          'En route (ATP-56 RV Golf): join the tanker where it is at the time of your Refuel steerpoint, from behind on its path',
        ],
        [
          'echo',
          'RV ECHO',
          'Anchor (ATP-56 RV Echo): reach the anchor (the first point of the track) behind the tanker as it passes it',
        ],
        [
          'head',
          'RV HEAD-ON',
          'Head-on (BMS Training Manual): fly the reciprocal of the first leg, offset 8 NM, turn 180° behind the tanker, roll out 2.5 NM in trail',
        ],
      ],
      S.mode
    )}</div><div class="wrow"><label>Fill to</label>${seg(
      'fill',
      [
        ['full', 'FULL', 'The tanks full: the internal fuel and the drop tanks of the load'],
        ['joker', 'JOKER', 'What the rest of the plan needs plus the Joker margin of the Fuel plan'],
        ['amount', 'AMOUNT', 'A fixed onload'],
      ],
      S.fill
    )}</div>${S.fill == 'amount' ? slr('amount', amLab(S.amount), [500, 20000, 500], S.amount, fmt(S.amount) + ' lb', FU && S.amount > maxOn()) : ''}${
      S.mode == 'head'
        ? `<div class="wrow"><label>Turn</label>${seg(
            'turn',
            [
              ['L', 'LEFT'],
              ['R', 'RIGHT'],
            ],
            S.turn
          )}</div>`
        : ''
    }${slr('dist', S.mode == 'head' ? 'ARIP to the turn' : 'ARIP to the ARCP', DIST, S.dist, S.dist + ' NM')}<div class="wbtns"><button class="btn g" type="button" data-aroa${R ? '' : ' disabled'} title="On ${PU && !PU.fixed ? 'the Join after steerpoint ' + PU.n : 'the Refuel steerpoint ' + (X.k + 1)}: OA1 = the ARCP (where you reach the tanker${S.mode == 'echo' ? ': the anchor' : ''}), OA2 = the ARIP (where the rendezvous starts), at the join altitude">Write OA1 / OA2 in the DTC</button></div>${why ? `<p class="wbad">${esc(why)}</p>` : ''}`;
  }
  // the most the tanks take at the join; the Onload slider is red above it
  const maxOn = () => (FU ? Math.max(0, Math.round(FU.full - FU.fArct)) : Infinity);
  const amLab = v => 'Onload' + (FU && v > maxOn() ? ' · max ' + fmt(maxOn()) + ' lb' : '');
  const slr = (k, lab, r, v, txt, bad, off, tip) =>
    `<div class="slr${bad ? ' bad' : ''}"${tip ? ` title="${tip}"` : ''}><label>${lab}</label><input type="range" min="${r[0]}" max="${r[1]}" step="${r[2]}" value="${v}" data-arsl="${k}"${off ? ' disabled' : ''}><em data-are="${k}">${txt}</em></div>`;
  function tiles() {
    const ab = R.from ? Math.round(R.gs || 0) : 0,
      on = FU ? fmt(FU.onload) + ' lb' : '--';
    return `<div class="wpt">${tile('ARCT', hm(R.arct), (S.mode != 'golf' ? (R.shift ? (R.shift > 0 ? '+' : '−') + Math.round(Math.abs(R.shift) / 60000) + ' min to the plan · ' : 'on the plan · ') : '') + 'ARIP ' + hm(R.tip) + (ab ? ' · ' + ab + ' kt from STPT ' + PU.n : '') + (R.hold >= 60000 ? ' · hold ' + Math.round(R.hold / 60000) + ' min, push ' + hm(R.from.t) : ''))}${tile('Onload', on, FU ? (S.fill == 'full' ? 'to full' : S.fill == 'joker' ? 'to the Joker' : 'a fixed amount') + ' · ≈ ' + Math.ceil(FU.min) + ' min at the ' + (method() == 'probe' ? 'basket' : 'boom') : 'no aircraft data')}${tile('Join', flOf(joinAlt()), R.turn ? 'turn ' + (R.turn.sd > 0 ? 'left' : 'right') + ' at ' + R.turn.range.toFixed(0) + ' NM, the tanker at ' + R.turn.clock + " o'clock" : fmt(JOIN_BELOW) + ' ft below · tanker ' + R.gap.toFixed(1) + ' NM ahead at the ARIP')}${tile('Fuel at the join', FU ? fmt(FU.fArct) + ' lb' : '--', FU ? 'after: ' + fmt(FU.after) + ' · need ' + fmt(FU.need) : '')}</div>`;
  }
  function tables() {
    const n = X.k + 1,
      ja = joinAlt(),
      tas = T.tas + OVERTAKE,
      f = v => (FU ? fmt(v) : '--'),
      gsK = R.gs ? Math.round(kcasOf(R.gs, ja)) + ' KCAS' : '--',
      nxt = timed(X.wps).find(p => p.n == (PU.fixed ? n + 1 : PU.n + 1)),
      times = [
        ...(R.from
          ? [
              [
                'Push · STPT ' + PU.n,
                hm(R.from.t),
                '0',
                fmt(Math.round((X.wps[PU.i].z || 0) * 10)),
                gsK,
                f(FU && FU.fk1),
              ],
            ]
          : []),
        [
          'ARIP · OA2',
          hm(R.tip),
          FU ? Math.round(FU.d1) : '--',
          fmt(ja),
          Math.round(kcasOf(R.turn ? HEAD_KT : tas, ja)) + ' KCAS',
          f(FU && FU.fArip),
        ],
        ...(R.turn
          ? [
              [
                'Turn ' + (R.turn.sd > 0 ? 'left' : 'right'),
                hm(R.turn.t),
                S.dist,
                fmt(ja),
                Math.round(kcasOf(HEAD_KT, ja)) + ' KCAS',
                '',
              ],
            ]
          : []),
        [
          'ARCP · OA1',
          hm(R.arct),
          FU ? Math.round(FU.d2 - (R.turn ? S.dist : 0)) : '--',
          fmt(ja),
          T.kcas + ' KCAS',
          f(FU && FU.fArct),
        ],
        ['Done · lead', hm(done()), '—', fmt(T.alt), T.kcas + ' KCAS', f(FU && FU.after)],
        ...(FU
          ? FU.seq.slice(1).map(q => ['Done · #' + q.n, hm(q.end), '—', '', '+' + fmt(q.onload) + ' lb', ''])
          : []),
        ['Tanker off station', hm(T.t1), '—', '', '', ''],
        ...(nxt
          ? [
              [
                'Next · STPT ' + nxt.n,
                hm(nxt.arr) + (done() > nxt.arr ? ' <span class="wbad">late</span>' : ''),
                '',
                '',
                '',
                '',
              ],
            ]
          : []),
      ],
      proc = procedure(method(), (sopOf('obs') || {}).o, R.turn).map(r => [r[0], esc(r[1])]),
      W = warns();
    return {
      mid: `<div class="wcard"><h3>Procedure · ${method() == 'probe' ? 'PROBE' : 'BOOM'}<span class="wtip" title="BMS Training Manual 4.38 (mission 4D) and the Comms &amp; Nav Book: the calls by their names, as each pilot sends them his own way.">ⓘ</span></h3>${tbl(['When', 'What'], proc, 2)}<p class="hint wnote">Calls to the tanker: ${CALLS.tanker.map(esc).join(' · ')}. To the AWACS: ${CALLS.awacs.map(esc).join(' · ')}.</p></div>`,
      times: `<div class="wcard" id="aartm"><h3>Times<span class="wtip" title="Rear aspect: you join from behind, inside the 2-10 line of the tanker. The gap closes at ${OVERTAKE} kt to 10,000 ft, then 10 kt per 1,000 ft, 10 kt inside 1,000 ft. Fuel: the fuel plan of the Performance page to the steerpoint before, then its burn per NM (≈). Transfer ≈ ${RATE} lb a minute (an estimate). The flight: one aircraft at a time. A wingman waits at the observation position and burns fuel. He gets to contact ${CYCLE_MIN} min after the aircraft before him disconnects (an estimate). Headings magnetic.">ⓘ</span></h3>${tbl(['Point', 'Time', 'nm', 'Alt (ft)', 'Speed', 'Fuel (lb)'], times)}${tbl(
        ['Leg', 'Heading', ''],
        legs().map(l => [l.leg, l.hdg, esc(l.note)])
      )}</div>${W.length ? `<div class="wcard"><h3>Checks</h3>${W.map(([t, red]) => `<div class="${red ? 'wbad' : 'hint'}">${esc(t)}</div>`).join('')}</div>` : ''}`,
    };
  }
  /** the middle and right columns, in the Performance page (#pfr, #pfr2) */
  function mount(root) {
    host = root;
    const c = root.querySelector('#pfr'),
      r = root.querySelector('#pfr2');
    if (!c || !r) return;
    detachMap(true);
    failed = false;
    pend = null;
    c.innerHTML = `<div id="aartl"></div><div class="wcard" id="aarmc"><div class="wh"><h3 id="aarmh">Map</h3><span style="flex:1"></span><button class="btn g" type="button" data-arfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-arpf>${PFL[deps.planMode ? deps.planMode() : 0]}</button></div><div id="aarmap" class="wmapbox"></div><div class="wleg" id="aarleg"></div></div><div id="aartb"></div>`;
    r.innerHTML = `<div class="wcard"><h3>Smart card<span class="wtip" title="Add card (top right) puts it on the Kneeboard, with the classic card">ⓘ</span></h3><canvas class="aarpv" width="520" height="780" aria-label="The Smart AAR card"></canvas></div><div id="aartt"></div>`;
    wire(root);
    update();
  }
  /** the numbers again: the left card, the tiles, the tables, the preview, the map */
  // keepLeft: a slider moves (the left column with it is not drawn again)
  function update(keepLeft) {
    if (!host || !host.isConnected) return;
    compute();
    const q = s => host.querySelector(s),
      l = q('#aarl');
    if (l && !keepLeft) l.innerHTML = leftIn();
    const ok = !!(X && X.ok && R),
      mc = q('#aarmc');
    if (mc) mc.hidden = !ok;
    if (!ok) {
      if (q('#aartl')) q('#aartl').innerHTML = '';
      if (q('#aartb')) q('#aartb').innerHTML = '';
      if (q('#aartt')) q('#aartt').innerHTML = '';
      const cv = q('.aarpv');
      if (cv) cv.hidden = true;
      detachMap(true);
      return;
    }
    const fk = X.me.key + ':' + S.tk + ':' + S.mode;
    if (fk !== fitKey) {
      fitKey = fk;
      fit = true;
    }
    q('#aartl').innerHTML = tiles();
    const tb = tables();
    q('#aartb').innerHTML = tb.mid;
    q('#aartt').innerHTML = tb.times; // the Times under the Smart card
    q('#aarmh').textContent = 'Map · STPT ' + (X.k + 1) + ' Refuel · ' + tk().name;
    const it = (c, t, dash) =>
      `<span><i style="border-top:2px ${dash ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    q('#aarleg').innerHTML = [
      it(COL.trk, 'TRACK'),
      it(COL.trk, 'TURNS LEFT OR RIGHT (as the tanker comes)', true),
      it(COL.me, 'YOU: STPT ' + PU.n + ' > ARIP > JOIN'),
    ].join(' ');
    const cv = /** @type {HTMLCanvasElement|null} */ (q('.aarpv'));
    if (cv) {
      cv.hidden = false;
      preview(cv);
    }
    paint();
  }
  let PV = null;
  function preview(cv) {
    if (!PV) {
      PV = document.createElement('canvas');
      PV.width = SC_W;
      PV.height = SC_H;
    }
    const x = /** @type {CanvasRenderingContext2D} */ (PV.getContext('2d'));
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, SC_W, SC_H);
    drawSmartAar(x, smartData());
    const y = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    y.imageSmoothingQuality = 'high';
    y.clearRect(0, 0, cv.width, cv.height);
    y.drawImage(PV, 0, 0, cv.width, cv.height);
  }
  function wire(root) {
    const l = () => root.querySelector('#aarl'),
      set = (k, v) => {
        st.f[X.me.key] = { ...S, [k]: v };
        save();
      };
    root.onclick = e => {
      const t = /** @type {HTMLElement} */ (e.target),
        b = /** @type {HTMLElement|null} */ (t.closest('[data-arset]'));
      if (b && X && X.ok && !(/** @type {HTMLButtonElement} */ (b).disabled)) {
        const k = b.dataset.arset;
        set(k, k == 'tk' || k == 'push' ? +b.dataset.v : b.dataset.v);
        update();
      }
      if (t.closest('[data-aroa]')) writeOA();
      const pf = /** @type {HTMLElement|null} */ (t.closest('[data-arpf]'));
      if (pf && deps.cyclePlan) {
        pf.textContent = PFL[deps.cyclePlan()];
        paint();
      }
      if (t.closest('[data-arfit]') && M) {
        fit = true;
        paint();
      }
    };
    let raf = 0;
    root.oninput = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (!i.dataset || !i.dataset.arsl || !X || !X.ok) return;
      const k = i.dataset.arsl;
      set(k, +i.value);
      const em = l() && l().querySelector(`[data-are="${k}"]`);
      if (em) em.textContent = k == 'dist' ? i.value + ' NM' : k == 'at' ? hm(+i.value) : fmt(+i.value) + ' lb';
      // the plan in real time: drawn again at each frame while the slider moves
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          update(true);
          if (k == 'amount' && i.isConnected) {
            const sl = i.closest('.slr');
            sl.classList.toggle('bad', !!FU && +i.value > maxOn());
            sl.querySelector('label').textContent = amLab(+i.value);
          }
        });
    };
    root.onchange = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (i.dataset && i.dataset.arpush != null && X && X.ok) {
        st.f[X.me.key] = { ...S, push: +i.value, at: 0 };
        save();
        update();
      } else if (i.dataset && i.dataset.arsl) update();
    };
  }

  // ---- the map
  const VK = mapKeep();
  async function ensureMap() {
    const box = host && host.querySelector('#aarmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._arR) {
      o.map.createPane('arP').style.zIndex = 470;
      o.map._arR = o.L.canvas({ pane: 'arP' });
    }
    M = { ...o, WL: o.L.layerGroup().addTo(o.map) };
    fit = !VK.restore(o.map, fitKey);
  }
  function detachMap(nosave) {
    if (!M) return;
    if (!nosave && M.map.getContainer().clientWidth) VK.save(M.map, fitKey);
    try {
      M.WL.remove();
    } catch (e) {
      /* none */
    }
    M = null;
    try {
      deps.detach();
    } catch (e) {
      /* none */
    }
  }
  function paint() {
    if (!X || !X.ok || !R) return;
    if (!M) {
      if (!failed && !pend)
        pend = ensureMap().then(() => {
          pend = null;
          if (M) paint();
        });
      return;
    }
    const { L, map, WL } = M;
    WL.clearLayers();
    const b = layers(L, map, WL);
    if (fit && b.length) {
      fit = false;
      try {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(b), { padding: [30, 30], animate: false });
      } catch (e) {
        /* none */
      }
    }
  }

  // ---- OA1 / OA2 of the Refuel steerpoint
  async function writeOA() {
    if (!X || !X.ok || !R) return;
    const n = R.oaN,
      at = R.at;
    if (n > 24) return deps.toast('OA1 / OA2: the steerpoint ' + n + ' is beyond the 24 of the DTC.', true);
    if (deps.dtc.open && !deps.dtc.open()) return deps.toast('No DTC: open one first.', true);
    if (!deps.dtc.has('NAV OFFSETS')) return deps.toast('This DTC has no NAV OFFSETS section.', true);
    const p1 = R.arcp,
      o1 = offset(at, p1),
      o2 = offset(at, R.arip),
      el = joinAlt(),
      txt = o => o.brg + '°, ' + o.nm.toFixed(1) + ' nm, ' + el + ' ft';
    if (
      !(await deps.confirm(
        `Write on STPT ${n} (${PU.fixed ? 'Refuel' : 'Join after'}):\n\nOA1-${n} = the ARCP${S.mode == 'echo' ? ' (the anchor)' : ''}: ${txt(o1)}\nOA2-${n} = the ARIP: ${txt(o2)}`
      ))
    )
      return;
    deps.dtc.setOA('OA1-' + n, [o1.brg, o1.rngFt, el].join(','));
    deps.dtc.setOA('OA2-' + n, [o2.brg, o2.rngFt, el].join(','));
    deps.toast('OA1 and OA2 of STPT ' + n + ' written to the DTC.');
  }

  // the points of the rendezvous for the cards: ARIP, ARCP and the anchor of the track (lat / long), and OA1 / OA2 from the steerpoint they go on
  // (the values Write OA1 / OA2 puts in the DTC)
  function pointsOf() {
    const ll = p => deps.toLL(p.x, p.y),
      el = joinAlt(),
      o1 = offset(R.at, R.arcp),
      o2 = offset(R.at, R.arip),
      oa = o => String(o.brg).padStart(3, '0') + '° ' + o.nm.toFixed(1) + ' NM ' + fmt(el) + ' FT';
    return {
      arip: ll(R.arip),
      arcp: ll(R.arcp),
      anchor: ll(R.anchor),
      same: Math.hypot(R.arcp.x - R.anchor.x, R.arcp.y - R.anchor.y) < 0.1, // RV ECHO: the ARCP is the anchor
      n: R.oaN,
      oa1: oa(o1),
      oa2: oa(o2),
      o1: String(o1.brg).padStart(3, '0') + '°/' + o1.nm.toFixed(1),
      o2: String(o2.brg).padStart(3, '0') + '°/' + o2.nm.toFixed(1),
    };
  }
  // N37°05.00 E127°01.00: degrees and minutes to the hundredth (the Smart card, monospaced and narrow)
  const dm = (v, pz, ng, w) => {
    const sg = v >= 0 ? pz : ng;
    v = Math.abs(v);
    let d = Math.floor(v),
      m = Math.round((v - d) * 6000) / 100;
    if (m >= 60) {
      d++;
      m = 0;
    }
    return sg + String(d).padStart(w, '0') + '°' + m.toFixed(2).padStart(5, '0');
  };
  const llShort = c => dm(c[0], 'N', 'S', 2) + ' ' + dm(c[1], 'E', 'W', 3);

  // ---- the cards
  function smartData() {
    const t = tk(),
      m = method(),
      ja = joinAlt(),
      W = warns(),
      jb = FU && FU.jb,
      sop = (X.sop || []).map(s => s.txt);
    return {
      title: 'AAR · ' + (m == 'probe' ? 'PROBE' : 'BOOM') + ' · ' + MODE[S.mode],
      right: X.me.tag,
      key: [
        ['TANKER', t.name.toUpperCase()],
        ['TACAN', t.tcn ? t.tcn + (tankerKind(t.type).tcn == 'brg' ? ' BRG' : ' DME') : '--'],
        ['UHF', t.uhf || '--'],
        ['ALT', flOf(T.alt)],
        ['ARCT', hm(R.arct)],
        ['TYPE', m == 'probe' ? 'PROBE' : 'BOOM', serves(t.type, m) === false],
        ['ONLOAD', FU ? kLb(FU.onload) + 'K' : '--'],
        ['BINGO', jb ? kLb(jb.bingo) : '--', true],
      ],
      // the offsets and the headings in the plan, under TRACK (1.4.0-beta.45: the plan keeps its full height)
      plan: toInk(spec(), {
        note: (P => ['OA1 ' + P.o1 + ' · OA2 ' + P.o2 + ' · STPT ' + P.n, ...legs().map(l => l.short)])(pointsOf()),
      }),
      legend:
        'LEGS ' + Math.round(T.leg) + 'NM · ' + T.kcas + 'KCAS · ' + flOf(T.alt) + ' · TURNS L/R · ' + MODE[S.mode],
      blocks: [
        ...(W.some(w => w[1]) ? [['CHECK', W.filter(w => w[1]).map(w => [w[0].toUpperCase(), true])]] : []),
        [
          'TIMES',
          [
            // short lines: the TIMES block keeps one column with FUEL under it
            (R.from ? 'PUSH STPT ' + PU.n + ' ' + hm(R.from.t) + ' · ' : '') + 'ARIP ' + hm(R.tip),
            (R.turn ? 'TURN ' + hm(R.turn.t) + ' · ' : '') + 'ARCT ' + hm(R.arct),
            nAc() > 1 && FU ? 'DONE ' + FU.seq.map(q => hm(q.end)).join('/') : 'DONE ' + hm(done()),
            'OFF STATION ' + hm(T.t1),
          ],
        ],
        [
          'FUEL',
          FU
            ? [
                'ARIP ' + kLb(FU.fArip) + ' · JOIN ' + kLb(FU.fArct),
                'ONLOAD ' + kLb(FU.onload) + ' · AFTER ' + kLb(FU.after),
                'NEED ' + kLb(FU.need) + (jb ? ' · TANK J/B ' + kLb(jb.joker) + '/' + kLb(jb.bingo) : ''),
              ]
            : ['NO AIRCRAFT DATA'],
        ],
        [
          'JOIN',
          [
            flOf(ja) + ' · ' + JOIN_BELOW + 'FT BELOW',
            ...(R.turn
              ? [
                  'TURN ' +
                    (R.turn.sd > 0 ? 'L' : 'R') +
                    ' AT ' +
                    R.turn.range.toFixed(0) +
                    'NM, TANKER ' +
                    R.turn.clock +
                    " O'CLOCK",
                  '30° BANK ' + HEAD_KT + 'KT · ROLL OUT ' + HEAD_TRAIL + 'NM',
                ]
              : ['TANKER ' + R.gap.toFixed(1) + 'NM AHEAD AT ARIP', 'OVERTAKE ' + OVERTAKE + 'KT · 10KT/1000FT']),
          ],
        ],
        (P => [
          'POINTS · OA ON STPT ' + P.n + ' · ' + flOf(joinAlt()),
          [
            'ARIP ' + llShort(P.arip),
            ...(P.same ? ['ARCP/ANCH ' + llShort(P.arcp)] : ['ARCP ' + llShort(P.arcp), 'ANCH ' + llShort(P.anchor)]),
          ],
        ])(pointsOf()),
      ],
      sop,
      // the checklist of the method and the calls: in the box of the SOP, on its right
      box2: [
        [
          m == 'probe' ? 'PROBE' : 'BOOM',
          m == 'probe'
            ? ['EMITTERS SAFE · ARM SAFE', 'PROBE OUT AT 5NM', 'STABLE BEHIND THE BASKET']
            : ['EMITTERS SAFE · ARM SAFE', 'AR DOOR 5NM (400/.85)', 'PRE-CONTACT 50FT · 30° DOWN'],
        ],
        ['CALLS', ['REQUEST FLIGHT REFUELING', 'DONE · TERMINATE FLIGHT REFUEL', 'AWACS: VECTOR TO TANKER']],
      ],
    };
  }
  function classicData() {
    const t = tk(),
      m = method(),
      jb = FU && FU.jb,
      n = X.k + 1,
      P = pointsOf();
    return {
      head: 'AAR · ' + (m == 'probe' ? 'PROBE' : 'BOOM') + ' · ' + MODE[S.mode],
      rowsHead: 'TANKER · TIMES · FUEL',
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      sub: 'TANKER ' + t.name + ' · ' + t.type + ' · STPT ' + n + ' REFUEL',
      box: [
        [
          'ARCT',
          hm(R.arct),
          'ARIP ' + hm(R.tip) + ' · done ' + hm(done()) + (nAc() > 1 && FU ? ' · flight ' + hm(doneAll()) : ''),
        ],
        [
          'ONLOAD',
          FU ? fmt(FU.onload) + ' lb' : '--',
          FU
            ? (S.fill == 'full' ? 'to full' : S.fill == 'joker' ? 'to the Joker' : 'amount') +
              ' · ≈ ' +
              Math.ceil(FU.min) +
              ' min'
            : '',
        ],
        [
          'JOIN',
          flOf(joinAlt()),
          R.turn
            ? 'turn ' + (R.turn.sd > 0 ? 'left' : 'right') + ' at ' + R.turn.range.toFixed(0) + ' NM'
            : fmt(JOIN_BELOW) + ' ft below · ARIP ' + S.dist + ' NM before',
        ],
        ['TANK BINGO', jb ? fmt(jb.bingo) : '--', jb ? 'joker ' + fmt(jb.joker) : '', true],
      ],
      warn: warns()
        .filter(w => w[1])
        .map(w => w[0]),
      rows: [
        ['TANKER', t.name + ' · ' + t.type],
        ['A-A TACAN', tcnTxt(t)],
        ['UHF', t.uhf || '--'],
        ['TRACK', flOf(T.alt) + ' · ' + T.kcas + ' KCAS · ' + Math.round(T.leg) + ' NM'],
        ['ON STATION', t.win || '--'],
        ['ARIP · OA2', hm(R.tip) + ' · ' + fmtLL(...P.arip)],
        ['ARCP · OA1', hm(R.arct) + ' · ' + fmtLL(...P.arcp)],
        ['ANCHOR', fmtLL(...P.anchor)],
        ...legs().map(l => [
          'HDG · ' + l.leg.split(' → ')[0].toUpperCase(),
          l.hdg + ' to the ' + l.leg.split(' → ')[1] + ' · ' + l.note,
        ]),
        ...(nAc() > 1 ? [['FLIGHT DONE', FU ? FU.seq.map(q => '#' + q.n + ' ' + hm(q.end)).join(' · ') : '--']] : []),
        ['OA1 · STPT ' + P.n, P.oa1],
        ['OA2 · STPT ' + P.n, P.oa2],
        ...(R.turn
          ? [['TURN', hm(R.turn.t) + ' · ' + R.turn.range.toFixed(0) + ' NM · ' + R.turn.clock + " o'clock"]]
          : []),
        ['FUEL AT JOIN', FU ? fmt(FU.fArct) + ' lb' : '--', !!(FU && FU.fArct < 1000)],
        ['AFTER / NEED', FU ? fmt(FU.after) + ' / ' + fmt(FU.need) + ' lb' : '--', !!(FU && FU.short)],
        ['SOP', (X.sop || []).map(s => s.txt).join(' · ') || 'none chosen'],
      ],
      calls: [
        ...procedure(m, (sopOf('obs') || {}).o, R.turn)
          .slice(R.turn ? 1 : 2, 7)
          .map(r => r[0] + ': ' + r[1]),
        'Tanker: ' + CALLS.tanker.join(' · '),
        'AWACS: ' + CALLS.awacs.join(' · '),
      ],
      px: null,
    };
  }
  let CL = null;
  async function snapPlan(AR) {
    if (!deps.snap) return null;
    let keep = !!M;
    if (!M) {
      failed = false;
      await ensureMap();
      if (!M) return null;
      keep = !fit;
    }
    M.map.invalidateSize();
    paint();
    const S0 = spec(),
      pts = [...racetrack(T, -1), ...racetrack(T, 1), R.arip, R.arcp, ...(R.from ? [R.from] : [])],
      p = await snapMap(M, deps, pts, AR, keep, [T.a, { x: T.a.x + 10 * KM_NM, y: T.a.y }]);
    return p ? { img: p.img, coast: p.coast, nm: p.nm, ...toPx(S0, p.px, p.nm) } : null;
  }
  function drawCard(k) {
    const c = document.createElement('canvas');
    if (k == 'map') {
      c.width = AAC_W;
      c.height = AAC_H;
      drawAACard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), CL || classicData());
    } else {
      c.width = SC_W;
      c.height = SC_H;
      drawSmartAar(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), smartData());
    }
    return c;
  }
  const cardName = k => (k == 'map' ? 'AAR · ' : 'Smart · AAR · ') + X.me.name;
  async function ready(pic = true) {
    compute();
    if (!X || !X.ok || !R) return false;
    CL = classicData();
    if (pic) {
      const B = aaBox(CL);
      try {
        CL.px = await busyRun('Preparing the AAR cards…', () => snapPlan(B.w / B.h));
      } catch (e) {
        CL.px = null;
      }
    }
    return true;
  }
  async function addCard(btn) {
    if (!deps.kbAdd) return;
    if (btn) btn.disabled = true;
    try {
      if (!(await ready())) return deps.toast('AAR card: ' + (X && !X.ok ? X.why : why || 'no flight'), true);
    } finally {
      if (btn) btn.disabled = false;
    }
    await addCards(deps, KINDS, drawCard, cardName, 'Add AAR cards to the Kneeboard', 'aarcardkinds', ['smart', 'map']);
  }
  async function allCards() {
    if (!(await ready())) return [];
    return allOf(KINDS, drawCard, cardName, 'AAR');
  }

  return {
    left,
    mount,
    update,
    leave: () => {
      detachMap();
      if (host) host.onclick = host.oninput = host.onchange = null;
      host = null;
    },
    addCard,
    allCards,
    canCard: () => (compute(), !!(X && X.ok && R)),
    usable: () => {
      const c = deps.ctx();
      return !!(c && c.ok);
    },
    // Display > AAR of the Map page
    overlay: o => {
      compute();
      if (!X || !X.ok || !R) return false;
      if (!o.map._arR) {
        o.map.createPane('arP').style.zIndex = 470;
        o.map._arR = o.L.canvas({ pane: 'arP' });
      }
      layers(o.L, o.map, o.WL);
      return true;
    },
    state: () => st,
    // for the tests
    plan: () => (compute(), R ? { S, T, R, FU, warn: warns() } : { why: X && !X.ok ? X.why : why }),
    smart: () => (compute(), R ? smartData() : null),
    cardCanvas: async k => ((await ready(k == 'map')) ? drawCard(k || 'smart') : null),
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.fuel) deps.fuel = o.fuel;
    },
  };
}
