// Weapons page: pop-up calculator (map of the attack, side profile, sliders, results, NAV OFFSETS). The maths is in popup.js.
// deps: {root, esc, G, S, lines, route, points, changed, confirm, alert, ll(n, e) -> [lat, lon], attach(el) -> {L, map}, detach()}  (route() -> steerpoints [{n, x: north ft, y: east ft, alt, t}])
import { otherLook, cardDark } from './cardink.js';
import D0 from '../data/index.js';
import { busyRun } from './busy.js';
import { mapKeep } from './mapkeep.js';
const PPTL = new Proxy([], { get: (_, k) => D0.ppt[k], has: (_, k) => k in D0.ppt }); // the threat list is read from the BMS installation (Ppt.ini)
import { cbuFootprint } from '../bmsdata/bombdata.js';
import { analyse, envelope, pickBomb, isGuided, maneuvers, PULL_G, PULL_DELAY } from './lethal.js';
import { computePopup, DEFAULTS, LIMITS, FT_NM, FT_KT, bearing, dist, project, offsetRow, norm } from './popup.js';
import { attackTrack, fragZone, deconflict, fromSplit } from './deconf.js';
import { fragOutline } from './frag.js';
import { drawAtkCard, ATC_W, ATC_H } from './atkcard.js';
import { drawSmartAttack, SC_W, SC_H, planBox } from './smartcard.js';
import { drawSmartCombined } from './smartcombo.js';
import { wxAtTarget } from './smartwx.js';
import { chooseCards } from './tgdlg.js';
import {
  computeHadb,
  computeToss,
  matCheck,
  HADB_DEFAULTS,
  TOSS_DEFAULTS,
  HADB_LIMITS,
  TOSS_LIMITS,
} from './strike.js';
import { toMag } from './magvar.js';

const KEY = 'wppopup3';
const MODES = [
  ['popup', 'Pop-up'],
  ['hadb', 'HADB'],
  ['toss', 'TOSS'],
  ['harm', 'HARM'],
  ['tgt', 'Target'],
];
const ATK = ['popup', 'hadb', 'toss']; // the modes that plan an attack (HARM and Target are pages of their own under the same tabs)
const SL = [
  // sliders: [field, label, unit, decimals]
  ['diveAngle', 'Dive angle', '°', 0],
  ['releaseAltitude', 'Release alt.', ' ft', 0],
  ['ingressAltitude', 'Ingress alt.', ' ft', 0],
  ['releaseSpeed', 'Release speed', ' kt', 0],
  ['timeOnFinal', 'Tracking time', ' s', 0],
  ['stickSpacing', 'Spacing', ' ft', 0],
  ['vrpToPup', 'VRP to PUP', ' nm', 1],
  ['ingressSpeed', 'Ingress speed', ' kt', 0],
  ['releaseAngle', 'Release angle', '°', 0],
  ['releaseExtra', 'Extra climb', ' ft', 0],
  ['angleOff', 'Angle off', '°', 0],
  ['oa1ToVip', 'OA1 to VIP', ' nm', 1],
  ['egressHeading', 'Egress heading', '°', 0],
];
const fmt = (v, d = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, ' ');
const b3 = b => {
  let g = Math.round(b * 10) / 10;
  if (g === 0) g = 360;
  return g.toFixed(1).padStart(5, '0');
}; // bearings and headings run 1-360
const nm2 = ft => (ft / FT_NM).toFixed(2) + ' nm';
const h3 = h => String(Math.round(h) % 360 || 360).padStart(3, '0');
// a heading the pilot flies: magnetic (BMS 4.38); the bearings of the NAV OFFSETS and of the VIP stay true, as the DED takes them
const hm = h => h3(toMag(h));

// a NAV OFFSETS value: steerpoint first for the four VIP / VRP rows (as the game and WDP write it), the older order (bearing, range, elevation, steerpoint) is recognised by its first value
export function navRow(text, withStpt = true) {
  const a = String(text || '')
    .split(',')
    .map(t => t.trim());
  if (!withStpt) return { brg: a[0], rng: a[1], elev: a[2] };
  if (a.length >= 4 && !/^\d{1,2}$/.test(a[0])) return { stpt: +a[3] || 0, brg: a[0], rng: a[1], elev: a[2] };
  return { stpt: +a[0] || 0, brg: a[1], rng: a[2], elev: a[3] };
}
// a part of the state (a mission file from an older version has fewer fields, and a file may come from anybody): a field the page knows keeps the type it has by default
// (a number stays a finite number, text stays text), a missing one is the default, a field the page does not know is kept as it is
const part = (d, v) => {
  const o = { ...d };
  if (v && typeof v == 'object' && !Array.isArray(v))
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (k === '__proto__') continue;
      if (!(k in d) || (typeof x == typeof d[k] && (typeof x != 'number' || isFinite(x)))) o[k] = x;
    }
  return o;
};
export function createWeaponsPage(deps) {
  const { esc } = deps;
  const blank = () => ({
    mode: 'popup',
    amode: 'popup', // the last attack mode used (the Target tab shows its attack)
    bomb: 'auto',
    oa1: 'top',
    ref: 'vrp',
    src: 'dtc',
    refPt: 'tgt',
    stpt: null,
    tgt: null,
    inp: { ...DEFAULTS },
    hadb: { ...HADB_DEFAULTS },
    toss: { ...TOSS_DEFAULTS },
    mat: { on: 0, ppt: '', samMax: 30000, samMin: 500 },
    map: { on: true, op: 80 },
    fz: {
      mode: 'c1',
      prof: 1,
      ftype: 'NSTL',
      sub: 'CCRP',
      c1ad1: 4,
      c1ad2: 6,
      c2ad: 1.5,
      c2ba: 500,
      cbu: 'CBU-87',
      loaded: false,
    },
  });
  let st = blank();
  // the state o (the page of a mission, or the session) over the state keep: the parts it holds are completed with the defaults, the others stay as they are
  const take = (o, keep) => {
    const d = blank(),
      g = k => (o[k] && typeof o[k] == 'object' && !Array.isArray(o[k]) ? part(d[k], o[k]) : keep[k]),
      r = { ...keep, ...o, inp: g('inp'), hadb: g('hadb'), toss: g('toss'), map: g('map'), mat: g('mat'), fz: g('fz') };
    // the sets of the lead and of the element belong to the state they came with (an older file has none: the flight only)
    r.grp = o.grp && typeof o.grp == 'object' ? o.grp : {};
    r.fls = o.fls && typeof o.fls == 'object' ? o.fls : null;
    r.inMode = r.fls && ATK.includes(o.inMode) ? o.inMode : null;
    if (!r.inMode) r.fls = null;
    if (!r.inp.heading) r.inp.heading = 360;
    if (!MODES.some(m => m[0] === r.mode)) r.mode = keep.mode;
    return r;
  };
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (o && typeof o == 'object') st = take(o, st);
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  let lethN = 0,
    res = null,
    ctx = null,
    mapNote = '',
    el = null,
    elKey = '',
    elTok = 0; // el: terrain elevations (ft MSL) of the points of the drawing, from HeightMap.raw when the BMS folder is known

  const cur = () => (st.mode == 'hadb' ? st.hadb : st.mode == 'toss' ? st.toss : st.inp);
  const ENG = m => (m == 'hadb' ? computeHadb : m == 'toss' ? computeToss : computePopup);

  // ---------- the flight and its split: one attack for the whole flight (the lead's), or, after Split, a second one for the ELEMENT (3-4; 3 in a three-ship)
  // or the WINGMAN (2 in a two-ship). Each attack section (Pop-up, HADB, TOSS) has its own split. The element's attack starts as the mirror of the
  // lead's (Mirror on) and becomes its own when one of its controls is changed; Rejoin drops it.
  // The attack shown lives in the usual fields (st.inp / st.hadb / st.toss and SHARED): the lead's, or while the element's is shown, the element's, the
  // lead's then waiting in st.fls. st.grp[section] = {split, who ('lead' / 'elem': the one shown), elem (its set when not shown), mir}.
  // st.inMode: the section whose attack is in the fields (the last attack section shown).
  const SHARED = ['ref', 'oa1', 'refPt', 'tgt', 'bomb', 'fz'],
    WHO = ['lead', 'elem'],
    PK = m => (m == 'popup' ? 'inp' : m),
    PD = m => (m == 'hadb' ? HADB_DEFAULTS : m == 'toss' ? TOSS_DEFAULTS : DEFAULTS),
    clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const grpOf = m => {
    if (!st.grp || typeof st.grp != 'object') st.grp = {};
    const g = st.grp[m];
    if (!g || typeof g != 'object' || !WHO.includes(g.who) || typeof g.split != 'boolean')
      st.grp[m] = { split: false, who: 'lead', elem: null, mir: false, egr: 'own' };
    const G = st.grp[m];
    if (G.egr != 'shared') G.egr = 'own';
    return G;
  };
  // the sets of 1.3.0-beta.15 / 16 (FLIGHT, LEAD and ELEMENT): the lead's becomes the attack, the element's stays as the split
  function migrate() {
    const G = st.grp;
    if (!G || typeof G != 'object' || !Object.values(G).some(g => g && (g.who == 'flight' || 'lead' in g))) return;
    const m0 = st.inMode,
      g0 = G[m0];
    if (ATK.includes(m0) && st.fls && g0 && g0.who != 'flight') {
      g0[g0.who] = snapOf(m0);
      putSnap(m0, st.fls);
    }
    st.fls = null;
    st.inMode = null;
    ATK.forEach(m => {
      const g = G[m];
      if (!g || typeof g != 'object' || typeof g.split == 'boolean') return;
      if (g.lead) putSnap(m, g.lead);
      G[m] = { split: !!(g.elem || g.mir), who: 'lead', elem: g.elem || null, mir: !!g.mir };
    });
  }
  // the seat chosen on the Datacard (0-3) and how many aircraft the flight has (4 when there is no flight: the groups stay possible)
  const seatInfo = () => {
    try {
      const s = deps.seat && deps.seat();
      return s && s.size > 0 ? s : { n: 0, size: 4 };
    } catch (e) {
      return { n: 0, size: 4 };
    }
  };
  const whoName = w => {
    const z = seatInfo().size;
    return w == 'lead'
      ? z <= 2
        ? 'LEAD 1'
        : 'LEAD 1-2'
      : w == 'elem'
        ? z <= 2
          ? 'WINGMAN 2'
          : z == 3
            ? 'ELEMENT 3'
            : 'ELEMENT 3-4'
        : '';
  };
  const secName = () => (seatInfo().size <= 2 ? 'wingman' : 'element');
  const snapOf = m => {
    const s = { p: clone(st[PK(m)]) };
    SHARED.forEach(k => (s[k] = clone(st[k])));
    return s;
  };
  const putSnap = (m, s) => {
    st[PK(m)] = part(PD(m), s.p);
    SHARED.forEach(k => {
      if (s[k] !== undefined) st[k] = clone(s[k]);
    });
  };
  // the attack and the ingress headings of a set, worked out in its own fields (for the mirror)
  function headingOf(m, s) {
    const keep = snapOf(m);
    try {
      putSnap(m, s);
      const c = gather();
      if (!c.t || !c.ref) return null;
      const r = ENG(m)(c.tPos, c.ref, { ...st[PK(m)], ...fuzeInputs() });
      if (!r || r.error) return null;
      // the axis of the mirror: the line from the target through the split point (Type 1 PUP, Type 2 VRP, HADB line-up point, TOSS OA2): mirrored
      // about it the attack keeps the target and the split point, the two come there together and turn to opposite sides
      const sp = splitOf(r, c)[0],
        B = sp && dist(sp, r.target) > 1 ? bearing(r.target, sp) : r.v.ingressHeading;
      return { A: r.v.attackHeading, B };
    } catch (e) {
      return null;
    } finally {
      putSnap(m, keep);
    }
  }
  // the lead's attack mirrored about the line from the target through the split point: the same target, reference and split point, the turn on
  // the other side, the attack, climb and egress headings mirrored about that line
  function mirrorOf(m, s) {
    const o = clone(s),
      p = o.p,
      H = headingOf(m, s),
      flip = x => (x == 'left' ? 'right' : x == 'right' ? 'left' : x),
      mir = (h, B) => Math.round(norm(2 * B - h)) || 360;
    p.side = flip(p.side);
    p.egressTurn = flip(p.egressTurn);
    if (H && isFinite(H.B)) {
      if (p.egressTurn == 'set' && isFinite(p.egressHeading)) p.egressHeading = mir(p.egressHeading, H.B);
      // the heading slider: the attack heading, or in the pop-up the climb heading
      if (m == 'popup' && p.headingMode == 'ingress') {
        if (isFinite(p.heading)) p.heading = mir(p.heading, H.B);
      } else if (isFinite(H.A)) p.heading = mir(H.A, H.B);
    }
    return o;
  }
  function leave() {
    const m = st.inMode;
    st.inMode = null;
    if (!ATK.includes(m)) return;
    const g = grpOf(m);
    if (g.who != 'elem' || !st.fls) return;
    g.elem = snapOf(m);
    putSnap(m, st.fls);
    st.fls = null;
  }
  function enter(m) {
    st.inMode = m;
    const g = grpOf(m);
    if (seatInfo().size <= 1) g.split = false;
    if (!g.split) g.who = 'lead';
    if (g.who != 'elem') return;
    st.fls = snapOf(m);
    putSnap(m, g.mir || !g.elem ? mirrorOf(m, st.fls) : g.elem);
  }
  const sync = () => {
    migrate();
    if (ATK.includes(st.mode) && st.inMode !== st.mode) {
      leave();
      enter(st.mode);
    }
  };
  const switchWho = w => {
    const m = st.inMode;
    if (!ATK.includes(m)) return;
    leave();
    grpOf(m).who = w;
    enter(m);
  };
  // fn run with the set of another group in the fields (res and ctx worked out for it), then everything back as it was
  function withGroup(w, fn) {
    const m = st.inMode;
    if (!ATK.includes(m)) return null;
    const g = grpOf(m),
      was = g.who,
      R0 = res,
      C0 = ctx;
    leave();
    g.who = w;
    enter(m);
    try {
      compute(true);
      return fn();
    } catch (e) {
      return null;
    } finally {
      leave();
      g.who = was;
      enter(m);
      res = R0;
      ctx = C0;
    }
  }
  // the attack Apply writes: the element's for the seats of the element (3-4; 2 in a two-ship) when the flight is split, else the lead's
  const seatWho = () => {
    const s = seatInfo();
    return s.size > 1 && (s.size <= 2 ? s.n >= 1 : s.n >= 2) ? 'elem' : 'lead';
  };
  const applyWho = () => {
    const m = st.inMode;
    return ATK.includes(m) && grpOf(m).split && seatWho() == 'elem' ? 'elem' : 'lead';
  };
  // the aircraft whose loadout gives the bomb: 1 for the lead, 3 for the element (2 for the wingman)
  const acOf = () => {
    const m = st.inMode,
      w = ATK.includes(m) ? grpOf(m).who : 'lead';
    return w == 'elem' ? (seatInfo().size <= 2 ? 1 : 2) : 0;
  };
  // a change of the element's own values ends its mirror
  const own = () => {
    const m = st.inMode;
    if (!ATK.includes(m)) return;
    const g = grpOf(m);
    if (g.who == 'elem' && g.mir) {
      g.mir = false;
      const b = deps.root.querySelector('[data-mir]');
      if (b) b.classList.remove('on');
    }
  };
  const lim = f =>
    (st.mode == 'toss' && st.mat.on && f == 'ingressAltitude' ? [50, 50000, 250] : null) ||
    (st.mode == 'hadb' ? HADB_LIMITS[f] : st.mode == 'toss' ? TOSS_LIMITS[f] : null) ||
    LIMITS[f];
  const exists = (s, k) => deps.lines().some(l => l.s == s && l.k === k);

  // BMS Threat Guide: launch altitude floor and typical engagement ceiling (ft) of the SAMs, by the PPT name written in the DTC
  const SAMALT = {
    sa2: [300, 73000],
    sa3: [150, 45000],
    sa4: [300, 60000],
    sa5: [1000, 123000],
    sa6: [550, 36000],
    sa8: [80, 16000],
    sa9: [50, 14500],
    10: [60, 123000],
    11: [180, 54000],
    12: [100, 100000],
    13: [30, 12000],
    15: [35, 20000],
    17: [140, 81000],
    19: [50, 10200],
    20: [125, 150000],
    hwk: [200, 44000],
    mnp: [50, 10000],
    zsu: [0, 10000],
    aaa: [0, 10000],
    sky: [0, 10000],
  };
  const samAlt = p => {
    const q = p && SAMALT[String(p.pname || '').toLowerCase()];
    return q ? { min: q[0], max: q[1] } : null;
  };
  // everything the page needs from the DTC. On board the pull-up point and the OA rows hang on steerpoints 1-99 (not on the weapon targets),
  // so the target IS a steerpoint: the route (1-24), geo-line points (31-54), pre-planned threats (56-70) or precision targets (81-99).
  function gather() {
    const R = (deps.route() || []).filter(x => x.n >= 0 && x.n <= 23),
      P = deps.points && deps.points();
    const isSam = q => {
      const k = PPTL.findIndex(e => e[0].toLowerCase() == String(q.name || '').toLowerCase());
      return k >= 0 && k < 26;
    };
    const G = { prec: 'TGT STPT', sam: 'PPT SAM', route: 'Flight plan', oth: 'PPT others', line: 'Lines' },
      T0 = [];
    const FP = deps.fplan ? deps.fplan() : []; // the flight picked in the Datacard, as on the Map page and in the Steerpoints page; without one the route points saved in the file (target_N = STPT N + 1)
    if (FP.length)
      FP.filter(w => w.n <= 24).forEach(w =>
        T0.push({
          v: 'r:' + w.n,
          label: 'STPT ' + w.n,
          group: G.route,
          n: w.y * FT_KM,
          e: w.x * FT_KM,
          name: 'STPT ' + w.n,
          stpt: w.n,
        })
      );
    else
      R.filter(z => +z.x || +z.y).forEach(z =>
        T0.push({
          v: 'r:' + (z.n + 1),
          label: 'STPT ' + (z.n + 1),
          group: G.route,
          n: +z.x,
          e: +z.y,
          name: 'STPT ' + (z.n + 1),
          stpt: z.n + 1,
        })
      );
    if (P)
      for (const g of ['line', 'ppt', 'prec'])
        (P[g] || [])
          .filter(q => !q.empty)
          .forEach(q =>
            T0.push({
              v: g + ':' + q.slot,
              label: 'STPT ' + q.stpt + (q.name ? ' · ' + q.name : ''),
              group: g == 'prec' ? G.prec : g == 'line' ? G.line : isSam(q) ? G.sam : G.oth,
              n: q.y * FT_KM,
              e: q.x * FT_KM,
              name: q.name || 'STPT ' + q.stpt,
              pname: q.name,
              stpt: q.stpt,
              ringFt: g == 'ppt' ? (q.rngNm || 0) * FT_NM : 0,
            })
          );
    const order = [G.prec, G.sam, G.route, G.oth, G.line],
      TA = order.flatMap(g => T0.filter(x => x.group == g));
    // DTC entry: the game loads the pull-up point and the OA rows only on the route steerpoints 1-24 (25 is the bullseye); Manual entry: any steerpoint 1-99, typed in the DED
    const TR = TA.filter(x => x.group == G.route && x.stpt >= 1 && x.stpt <= 24),
      T = st.src == 'man' || !TR.length ? TA : TR; // no route steerpoint at all: every point stays choosable, with a red warning
    const t = T.find(x => x.v === st.tgt) || T[0] || null,
      tPos = t ? { n: t.n, e: t.e } : null;
    const RL = [{ v: 'tgt', label: 'Target itself', group: '' }, ...TA.map(x => ({ ...x, pos: { n: x.n, e: x.e } }))],
      pick = RL.find(x => x.v === st.refPt) || RL[0];
    const vipPos = pick && pick.pos ? pick.pos : tPos;
    return {
      T,
      TA,
      R,
      RL,
      t,
      sp: t ? { n: t.stpt } : null,
      tPos,
      stPos: tPos,
      vipPos,
      ref: st.ref == 'vip' ? vipPos : tPos,
    };
  }

  // fuze: C1 (free-fall / GBU: two arming delays) or C2 (CBU: arming delay and burst altitude); values start from the DTC profile
  const FZ = {
    c1ad1: [0, 10, 0.05, 'C1_AD1'],
    c1ad2: [0, 10, 0.05, 'C1_AD2'],
    c2ad: [0, 10, 0.05, 'C2_AD'],
    c2ba: [100, 10000, 100, 'C2_BA'],
  };
  const fuzeInputs = () => {
    const f = st.fz;
    return f.mode == 'c2'
      ? { fuzeMode: 'c2', ad1: f.c2ad, burstAltitude: f.c2ba }
      : { fuzeMode: 'c1', ad1: f.c1ad1, ad2: f.c1ad2 };
  };
  const fzKey = k => 'Profile' + st.fz.prof + '_' + FZ[k][3];
  function fzLoad() {
    // the DTC keeps the delays in 1/100 s
    Object.keys(FZ).forEach(k => {
      const v = deps.G('FCC_AGB', fzKey(k), '');
      if (v !== '' && !isNaN(+v)) st.fz[k] = k == 'c2ba' ? +v : Math.round(+v) / 100;
    });
    // fuze type (0 NSTL, 1 NOSE, 2 TAIL) and sub mode (7 CCIP, 8 CCRP) of the profile
    const ft = { 0: 'NSTL', 1: 'NOSE', 2: 'TAIL' }[+deps.G('FCC_AGB', 'Profile' + st.fz.prof + '_Fuze', '')],
      sb = { 7: 'CCIP', 8: 'CCRP' }[+deps.G('FCC_AGB', 'Profile' + st.fz.prof + '_Submode', '')];
    if (ft) st.fz.ftype = ft;
    if (sb) st.fz.sub = sb;
    st.fz.loaded = true;
  }
  // writes a value in the style already there (1/100 s delays and decimals are kept)
  // every write to the DTC goes through wr(): in a dry run (dry is a list) it is only noted, to know whether Apply would change anything
  let dry = null;
  const wr = (sec, key, v) => {
    if (dry) dry.push([sec, key, String(v)]);
    else {
      deps.S(sec, key, String(v));
      deps.changed(sec, key);
    }
  };
  function putAgb(key, n) {
    const old = deps.G('FCC_AGB', key, '');
    wr('FCC_AGB', key, String(old).includes('.') ? (+n).toFixed(6) : String(Math.round(n)));
  }
  function fzWrite() {
    // fuze delays and burst altitude of the profile, then the stick: pulses (stored minus one), spacing, single / pair, release angle (toss)
    const i = cur(),
      tell = [];
    Object.keys(FZ).forEach(k => {
      putAgb(fzKey(k), k == 'c2ba' ? st.fz[k] : st.fz[k] * 100);
      tell.push(fzKey(k));
    });
    const pk = x => 'Profile' + st.fz.prof + '_' + x;
    wr('FCC_AGB', pk('Fuze'), { NSTL: '0', NOSE: '1', TAIL: '2' }[st.fz.ftype] || '0');
    wr('FCC_AGB', pk('Submode'), st.fz.sub == 'CCIP' ? '7' : '8');
    tell.push(pk('Fuze'), pk('Submode'));
    putAgb(pk('Release_Pulse'), i.ripplePulses - 1);
    putAgb(pk('Release_Spacing'), i.stickSpacing);
    tell.push(pk('Release_Pulse'), pk('Release_Spacing'));
    wr('FCC_AGB', pk('SGL/PAIR'), i.releaseMode == 'pair' ? '1' : '0');
    tell.push(pk('SGL/PAIR'));
    if (st.mode == 'toss') {
      putAgb(pk('Release_Angle'), i.releaseAngle);
      tell.push(pk('Release_Angle'));
    }
    return tell;
  }

  // terrain elevation of the target and of the points that become NAV OFFSETS rows; latest request wins, the results are redrawn when they arrive
  function loadElev() {
    if (!deps.elev || !res || res.error) {
      el = null;
      elKey = '';
      return;
    }
    const P = { tgt: res.target, oa: res.oa, vrp: res.vrp, pup: res.pup },
      ks = Object.keys(P),
      key = ks.map(k => Math.round(P[k].n) + ',' + Math.round(P[k].e)).join('|');
    if (key === elKey) return;
    if (key.split('|')[0] !== elKey.split('|')[0]) el = null;
    elKey = key;
    const tok = ++elTok;
    Promise.resolve(deps.elev(ks.map(k => P[k])))
      .then(h => {
        if (tok !== elTok) return;
        el = h ? Object.fromEntries(ks.map((k, i) => [k, h[i]])) : null;
        const rv = deps.root.querySelector('#wpr');
        if (rv && res && !res.error) {
          rv.innerHTML = dcCard() + results();
          rv.querySelectorAll('.wpvs').forEach(e => {
            e.scrollLeft = e.scrollWidth;
          });
        }
      })
      .catch(() => {
        el = null;
      });
  }
  // cluster bomb damage data (BMS Bombdata folder; nothing without it)
  let BD = { ...D0.bfb },
    bdAsk = false;
  const cbuInfo = r => {
    const b = r.fuze.burst,
      d = BD[st.fz.cbu] || BD['CBU-87'];
    if (!b || !d) return null;
    const f = cbuFootprint(d, b.alt);
    return f ? { ...f, shortBy: b.shortBy, d } : null;
  };
  function cbuFill() {
    const e = deps.root.querySelector('select[data-pick=cbu]');
    if (e)
      e.innerHTML = Object.keys(BD)
        .map(k => `<option${k === st.fz.cbu ? ' selected' : ''}>${esc(k)}</option>`)
        .join('');
  }
  function bombData() {
    if (bdAsk || !deps.bombs) return;
    bdAsk = true;
    Promise.resolve(deps.bombs())
      .then(m => {
        if (m && Object.keys(m).length) {
          BD = { ...D0.bfb, ...m };
          cbuFill();
          if (res && !res.error) draw(true);
        }
      })
      .catch(() => {});
  }
  const has = v => v !== null && v !== undefined && !isNaN(v);
  const msl = (agl, t) => (has(t) ? `${fmt(agl)} ft AGL · ${fmt(agl + t)} MSL` : fmt(agl) + ' ft AGL');

  // the bomb of the lethality model: from the loadout of the selected flight (the heaviest general-purpose bomb), or chosen by hand (500 / 1000 / 2000 lb class, or off)
  const BOMBS = [
    ['500', '500 lb class (MK-82)'],
    ['1000', '1000 lb class (MK-83, approximate)'],
    ['2000', '2000 lb class (MK-84)'],
    ['off', 'Not calculated'],
  ];
  function bombSel() {
    if (st.fz.mode == 'c2') return { env: null, label: 'cluster bomb: lethality not calculated' };
    const b = st.bomb || 'auto';
    if (b == 'off') return { env: null, label: 'not calculated' };
    if (b != 'auto') return { env: envelope(+b), label: BOMBS.find(x => x[0] == b)[1], manual: true };
    const L = deps.loadout ? deps.loadout(acOf()) : [],
      p = pickBomb(L),
      names = [...new Set(L.map(w => w.name).filter(n => n && !/^(AIM|AA-|R-\d|ALQ|AN\/|TANK|.*tank)/i.test(n)))];
    return p
      ? {
          env: envelope(p.lb),
          label: p.name + ' (' + p.lb + ' lb)',
          loadout: true,
          skipped: p.skipped,
          guided: isGuided(p.name),
        }
      : {
          env: null,
          label: 'no covered bomb in the loadout' + (names.length ? ' (' + names.slice(0, 4).join(', ') + ')' : ''),
        };
  }
  const guided = () => st.fz.mode == 'c1' && !!bombSel().guided; // a guided bomb of the loadout: the C1 arming delays are not set here
  const GUIDED_NOTE =
    'Guided bomb (JDAM, JSOW, GBU-54): set its arming delay and impact azimuth by hand on the SMS CNTL page, PROF 1-4. The profiles here are ballistic and not accurate for guided bombs, which glide.';
  const fzKeys = () => (st.fz.mode == 'c2' ? ['c2ad'] : ['c1ad1', 'c1ad2']);
  const bombOpts = () =>
    `<option value="auto"${(st.bomb || 'auto') == 'auto' ? ' selected' : ''}>Auto · ${esc(bombSel().label)}</option>${BOMBS.map(([v, l]) => `<option value="${v}"${st.bomb == v ? ' selected' : ''}>${l}</option>`).join('')}`;
  // the shared egress (visual): the element goes out to the egress point of the lead (its OA2 Egress: the egress heading and range from the lead's
  // release), on the heading from its own release; the lead's egress altitude, or 1 000 ft above it
  function shareEgress(m) {
    const L = st.fls;
    if (!L) return;
    const keep = snapOf(m),
      relOf = r => r.release || r.vrp;
    let P = null,
      lp = null;
    try {
      putSnap(m, L);
      const c = gather();
      if (c.t && c.ref) {
        const r = ENG(m)(c.tPos, c.ref, { ...st[PK(m)], ...fuzeInputs() });
        if (r && !r.error && relOf(r)) {
          lp = { ...st[PK(m)] };
          P = project(relOf(r), r.v.egressHeading, lp.egressRange);
        }
      }
    } catch (e) {
      P = null;
    } finally {
      putSnap(m, keep);
    }
    if (!P || !isFinite(P.n) || !isFinite(P.e)) return;
    const c = gather();
    if (!c.t || !c.ref) return;
    const me = st[PK(m)],
      r = ENG(m)(c.tPos, c.ref, { ...me, ...fuzeInputs() });
    if (!r || r.error || !relOf(r)) return;
    me.egressTurn = 'set';
    me.egressHeading = Math.round(bearing(relOf(r), P)) || 360;
    me.egressRange = Math.round(dist(relOf(r), P));
    me.oa2Mode = lp.oa2Mode;
    me.egressAltitude = lp.egressAltitude;
  }
  // a toss without a turn before the line-up (angle off 0) is flown in formation: the split is the egress only, the element's attack is the lead's
  const EGF = ['egressRange', 'egressTurn', 'egressHeading', 'egressAngle', 'egressAltitude', 'oa2Mode'];
  const tossForm = () => {
    const g = grpOf('toss'),
      L = g.who == 'elem' ? st.fls : snapOf('toss');
    return !!L && !(+L.p.angleOff > 0);
  };
  function formElem() {
    const L = st.fls;
    if (!L) return;
    const me = st.toss;
    Object.keys(L.p).forEach(k => {
      if (!EGF.includes(k)) me[k] = clone(L.p[k]);
    });
    SHARED.forEach(k => {
      if (L[k] !== undefined) st[k] = clone(L[k]);
    });
  }
  function compute(noElev) {
    sync();
    if (ATK.includes(st.mode) && st.inMode === st.mode) {
      const g = grpOf(st.mode);
      if (g.split && g.who == 'elem' && st.mode == 'toss' && tossForm()) formElem();
      if (g.split && g.who == 'elem' && g.egr == 'shared') shareEgress(st.mode);
    }
    if (!st.fz.loaded) fzLoad();
    ctx = gather();
    res = null;
    if (!ctx.t || !ctx.ref) return;
    const eng = ENG(st.mode);
    res = eng(ctx.tPos, ctx.ref, { ...cur(), ...fuzeInputs() });
    if (st.mode == 'toss' && st.mat.on && res && !res.error) {
      // MAT: the toss against the WEZ of a PPT
      const P = ctx.TA.filter(x => x.ringFt > 0 && x.pname !== undefined && x.v.startsWith('ppt:')),
        p = P.find(x => x.v === st.mat.ppt) || P[0];
      const d = samAlt(p);
      if (p && d && !st.mat.man && st.mat.auto !== p.v) {
        st.mat.auto = p.v;
        st.mat.samMax = d.max;
        st.mat.samMin = d.min;
        if (st.toss.ingressAltitude < d.max) st.toss.ingressAltitude = Math.min(50000, d.max + 1000);
        res = eng(ctx.tPos, ctx.ref, { ...cur(), ...fuzeInputs() });
      }
      res.mat = p
        ? {
            ...matCheck(
              res,
              { n: p.n, e: p.e, ringFt: p.ringFt },
              { max: st.mat.samMax, min: Math.min(st.mat.samMin, st.mat.samMax) }
            ),
            name: p.label,
            pos: { n: p.n, e: p.e },
          }
        : { missing: true };
    }
    if (res && !res.error) {
      const sel = bombSel(),
        keys = fzKeys();
      res.an = analyse(res, sel.env, sel.guided && st.fz.mode == 'c1' ? [] : keys.map(k => st.fz[k]));
      res.an.sel = sel;
    }
    if (!noElev) loadElev();
  }

  // ---------- horizontal view: the Map page's own Leaflet map (its chosen layer and flight plan) with the pop-up drawn over it ----------
  const FT_KM = 3280.84;
  // one colour and one dash style per phase of the attack, the same in every drawing
  const PH = {
    ingress: ['Ingress', '#34d399', ''],
    climb: ['Climb', '#fbbf24', ''],
    pull: ['Pull-down / pull-up', '#e879f9', ''],
    dive: ['Dive and tracking', '#38bdf8', ''],
    fall: ['Bomb fall', '#ff5d5d', '6 5'],
    egress: ['Egress / OA', '#a78bfa', '2 6'],
    ref: ['VIP to target', '#cbd5e1', '4 4'],
    leth: ['Lethal zone', '#ff5d5d', '2 3'],
    gleth: ['Lethal zone of the other', '#f0c040', '2 3'],
    escape: ['Safe escape (CLM)', '#34d399', '8 4'],
  };
  const legendKeys = horiz => [
    ...legendBase(horiz),
    ...(res && res.an && res.an.env ? (horiz || st.mode == 'toss' ? ['leth'] : ['leth', 'escape']) : []),
    ...(!horiz && GHO && GHO.env ? ['gleth'] : []),
  ];
  const legendBase = horiz =>
    st.mode == 'hadb'
      ? ['ingress', 'pull', 'dive', 'fall', 'egress', ...(horiz && st.ref == 'vip' ? ['ref'] : [])]
      : st.mode == 'toss'
        ? ['ingress', 'pull', 'climb', 'fall', ...(horiz && st.ref == 'vip' ? ['ref'] : [])]
        : ['ingress', 'climb', 'pull', 'dive', 'fall', 'egress', ...(horiz && st.ref == 'vip' ? ['ref'] : [])];
  const legend = keys =>
    `<div class="wleg">${keys.map(k => `<span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${PH[k][1]}" stroke-width="3"${PH[k][2] ? ` stroke-dasharray="${PH[k][2]}"` : ''}/></svg>${PH[k][0]}</span>`).join('')}</div>`;
  let M = null,
    pend = null,
    failed = false,
    fit = true;
  async function ensureMap() {
    const box = deps.root.querySelector('#wph');
    if (!box || !deps.attach) {
      failed = true;
      return;
    }
    const o = await deps.attach(box);
    if (!o) {
      failed = true;
      mapNote = 'The map could not be loaded.';
      return;
    }
    if (!o.map._wpR) {
      o.map.createPane('wpP').style.zIndex = 470;
      o.map._wpR = o.L.canvas({ pane: 'wpP' });
    }
    M = { ...o, WL: o.L.layerGroup().addTo(o.map), box };
    fit = !VK.restore(o.map, viewKey()); // back from another tab: the view as it was left
    const eb = deps.root.querySelector('[data-edit]');
    if (eb) {
      const on = deps.isEdit && deps.isEdit();
      eb.textContent = 'Edit points: ' + (on ? 'On' : 'Off');
      eb.classList.toggle('on', !!on);
    }
  }
  const VK = mapKeep(),
    viewKey = () => st.mode + '|' + st.tgt;
  function detachMap() {
    if (!M) return;
    VK.save(M.map, viewKey());
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
  function applyOp() {
    if (!M) return;
    const o = st.map.on ? st.map.op / 100 : 0;
    ['tilePane', 'coastP'].forEach(k => {
      const p = M.map.getPane(k);
      if (p) p.style.opacity = o;
    });
  }
  // what the horizontal view draws: lines per phase, marks, arrows, labels. The pop-up builds it here, HADB and TOSS bring their own (strike.js)
  // OA1 (set by the OA1 button of the attack profile): the top of the manoeuvre (pop-up: the pull-down point, HADB / TOSS: the PUP)
  // or the other reference (pop-up: the aim-off point, HADB / TOSS: the line-up point before the VIP)
  const oa1Top = () => st.oa1 !== 'aim';
  const oa1Pos = r => (st.mode == 'popup' ? (oa1Top() ? r.pdp : r.oa) : oa1Top() ? r.pup : r.oa);
  const oa1Names = () =>
    st.mode == 'popup'
      ? [
          ['top', 'Top of climb'],
          ['aim', 'Aim-off point'],
        ]
      : [
          ['top', 'PUP'],
          ['aim', 'Line-up point'],
        ];
  // the drawing of the plan: the diamond of OA1 goes where the button says
  function oa1Plan(D, r) {
    let marks = D.marks.filter(m => m[1] !== 'OA1'),
      segs = D.segs;
    if (oa1Top()) {
      const t = oa1Pos(r),
        i = marks.findIndex(m => m[0] === t);
      if (i >= 0)
        marks[i] = [t, (marks[i][1] ? marks[i][1] + ' · ' : '') + 'OA1', '#a78bfa', 'dia', ...marks[i].slice(4)];
      else marks.push([t, 'OA1', '#a78bfa', 'dia']);
      if (st.mode == 'popup') segs = segs.filter(z => !(z[0] == 'egress' && z[1][1] === r.oa));
    } else marks.push([r.oa, 'OA1', '#a78bfa', 'dia']);
    return { ...D, marks, segs };
  }
  function popupDraw(r, vip) {
    const v = r.v,
      mid = (a, b) => ({ n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 });
    return {
      segs: [
        ...(r.firstArc ? [['ingress', r.firstArc]] : []),
        ['ingress', [r.vrp, r.pup]],
        ['climb', [r.climbStart, r.pdp]],
        ['pull', r.arc],
        ['dive', [r.map, r.release]],
        ['fall', [r.release, r.target]],
        ...(r.oa2 && st.inp.oa2Mode == 'egress' ? [['egress', [r.release, r.oa2]]] : []),
        ['egress', [r.target, r.oa]],
        ...(vip && dist(vip, r.target) > 50 ? [['ref', [vip, r.target]]] : []),
      ],
      marks: [
        [r.vrp, st.ref == 'vip' ? 'Line-up' : 'VRP', '#f0b040', 'big'],
        ...(vip ? [[vip, 'VIP', '#f0b040', 'big']] : []),
        ...(r.firstArc ? [[r.climbStart, '', '#ffe680', 'small']] : []),
        [
          r.pup,
          'PUP',
          '#ffe680',
          '',
          'right',
          [8, 0],
          'PUP · ' + b3(r.offsets.pup.brg) + '° · ' + nm2(r.offsets.pup.rng) + ' from the reference',
        ],
        [r.pdp, 'PDP', '#ffe680', '', 'left', [-8, 0], 'PDP · pull-down point'],
        [r.map, 'MAP', '#ffe680', '', 'left', [-8, 0], 'MAP · rolled out on the attack heading'],
        [r.release, 'Release', '#4aa3ff', 'small5'],
        [r.oa, 'OA1', '#a78bfa', 'dia'],
      ],
      arrows: [
        [r.vrp, r.pup, 'ingress'],
        [r.climbStart, r.pdp, 'climb'],
        [r.map, r.release, 'dive'],
      ],
      labels: [
        [mid(r.climbStart, r.pdp), 'Climb ' + hm(v.pullHeading) + '°', 'left', [-8, 0]],
        [mid(r.map, r.release), 'Attack ' + hm(v.attackHeading) + '°', 'right', [8, 0]],
      ],
    };
  }
  // ---------- the other group (lead <-> element / wingman): drawn white under the attack shown, and the deconfliction of the two ----------
  let APPEAR = {},
    GHO = null,
    DC = null,
    SWEEP = {},
    DCK = '',
    sweepT = 0;
  function ghost() {
    const m = st.inMode;
    if (!ATK.includes(m) || st.mode !== m || !res || res.error) return null;
    const g = grpOf(m);
    if (!g.split) return null;
    const o = g.who == 'lead' ? 'elem' : 'lead';
    return withGroup(o, () => {
      if (!res || res.error || !ctx.t) return null;
      const vip = st.ref == 'vip' ? ctx.vipPos : null,
        D = oa1Plan(res.draw || popupDraw(res, vip), res);
      return {
        who: o,
        r: res,
        // a point that could not be worked out is left out of the drawing (Leaflet stops at one)
        segs: D.segs.filter(z => z[0] != 'ref' && z[1].every(q => q && isFinite(q.n) && isFinite(q.e))),
        env: res.an && res.an.env,
        split: splitOf(res),
      };
    });
  }
  const trackOf = (r, segs) => attackTrack(segs, r.v, st.inMode);
  // where the two split (before it they fly together, so it is not checked, and the times count from it): Type 1 pop-up the PUP, Type 2 the VRP;
  // HADB the line-up point (OA1 when it is set there); TOSS the OA2 with an angle off, else the VRP; the PUP when the reference is a VIP
  function splitOf(r, c = ctx) {
    const m = st.inMode,
      vrp = st.ref != 'vip';
    if (m == 'popup') return r.v.profileType === 1 || !vrp || !r.vrp ? [r.pup, 'PUP'] : [r.vrp, 'VRP'];
    if (m == 'hadb') return r.oa ? [r.oa, 'line-up point'] : [r.pup, 'PUP'];
    if (r.v.angleOff > 0 && r.oa2) return [r.oa2, 'OA2'];
    if (r.release) return [r.release, 'release']; // in formation up to the release: the split is the egress
    return vrp && c && c.ref ? [c.ref, 'VRP'] : [r.pup, 'PUP'];
  }
  const sideOf = (r, segs, env, sp) => fromSplit(trackOf(r, segs), fragZone(r, env), sp[0]);
  const sidesOf = (r, env, other) => {
    const vip = st.ref == 'vip' ? ctx.vipPos : null,
      me = sideOf(r, oa1Plan(r.draw || popupDraw(r, vip), r).segs, env, splitOf(r)),
      lead = grpOf(st.inMode).who == 'lead';
    return lead ? [me, other] : [other, me];
  };
  // a shared egress is a visual rejoin: after the release the two are not checked against each other in the air
  const dcOpt = () => ({ shared: grpOf(st.inMode).egr == 'shared' });
  const otherSide = () => sideOf(GHO.r, GHO.segs, GHO.env, GHO.split);
  function deconfNow() {
    if (!GHO || !res || res.error) return null;
    const [A, B] = sidesOf(res, res.an && res.an.env, otherSide());
    return deconflict(A, B, dcOpt());
  }
  // the sliders that, moved over their range, clear the conflict: the side to move them to (worked out after the last change, not while dragging).
  // On one target the fragments are often met whatever the attack (only the timing keeps them out): then the sliders that keep the paths apart.
  let SWEEPK = 'all';
  function sweep() {
    SWEEP = {};
    const paths = {};
    if (!GHO || !DC || !DC.close || !res || res.error || !ctx.t) return;
    const m = st.inMode,
      eng = ENG(m),
      base = { ...cur(), ...fuzeInputs() },
      env = res.an && res.an.env,
      ot = otherSide();
    deps.root.querySelectorAll('.wpl input[data-sl]').forEach(inp => {
      const i = /** @type {HTMLInputElement} */ (inp),
        f = i.dataset.sl;
      if (!(f in base)) return;
      const a = +i.min,
        b = +i.max,
        now = +i.value;
      let best = null,
        bestP = null;
      for (let k = 0; k <= 12; k++) {
        const x = a + ((b - a) * k) / 12;
        if (Math.abs(x - now) < 1e-9) continue;
        try {
          const r = eng(ctx.tPos, ctx.ref, {
            ...base,
            [f]: NM[f] ? x * FT_NM : x,
            ...(f == 'egressHeading' ? { egressTurn: 'set' } : {}),
          });
          if (!r || r.error) continue;
          const [A, B] = sidesOf(r, env, ot),
            d = deconflict(A, B, dcOpt()),
            nearer = q => q == null || Math.abs(x - now) < Math.abs(q - now);
          if (!d.conflict && nearer(best)) best = x;
          if (DC.close && !d.close && nearer(bestP)) bestP = x;
        } catch (e) {
          /* none */
        }
      }
      if (best != null) SWEEP[f] = best > now ? 1 : -1;
      if (bestP != null) paths[f] = bestP > now ? 1 : -1;
    });
    SWEEPK = 'all';
    if (!Object.keys(SWEEP).length && Object.keys(paths).length) {
      SWEEP = paths;
      SWEEPK = 'paths';
    }
  }
  // red: a conflict an attack parameter can clear (the paths close together, or fragments another attack keeps out of); amber: only the timing can
  // (fragments met whatever the attack on this target)
  // red: no spacing clears it (the two together in the air whatever the timing): the attack has to change; amber: the spacing clears it (the
  // fragments pass each point only for a while, so a spacing always keeps out of them)
  const dcLevel = () => (!DC || !DC.conflict ? 'ok' : DC.close ? 'bad' : 'warn');
  // the texts of the deconfliction, for the card on the page and the Attack card of the Kneeboard
  function dcTexts() {
    const m = st.inMode;
    if (!ATK.includes(m) || st.mode !== m || !grpOf(m).split || !GHO || !DC || !res || res.error) return null;
    const sec = secName(),
      Sec = sec[0].toUpperCase() + sec.slice(1),
      // the split point of the attack shown (the lead's has the same name unless the two differ in the kind of attack)
      sp = splitOf(res)[1],
      gp = GHO.split ? GHO.split[1] : sp,
      at = sp == gp ? 'the ' + sp : 'the split point',
      lv = dcLevel(),
      why = [DC.frag && 'ensure fragment clearance', (DC.close || DC.met) && 'prevent a mid-air collision']
        .filter(Boolean)
        .join(' and '),
      state =
        lv == 'bad'
          ? 'Change the attack: the two meet in the air whatever the timing (the red sliders).'
          : lv == 'warn'
            ? `Delay the ${sec} by the time above to ${why}.`
            : 'No conflict.',
      other = grpOf(m).who == 'lead' ? sec : 'lead',
      // A is the lead, B the element: inA, the element inside the lead's fragments; inB, the lead inside the element's
      meIn = grpOf(m).who == 'lead' ? DC.inB : DC.inA,
      heIn = grpOf(m).who == 'lead' ? DC.inA : DC.inB,
      // flown together (no spacing), who would be inside whose fragments
      inside = [
        meIn && `Your flight path is inside the ${other}'s fragments if flown together.`,
        heIn && `The ${other}'s flight path is inside your fragments if flown together.`,
      ].filter(Boolean),
      PHN = { ingress: 'ingress', climb: 'climb', pull: 'pull', dive: 'dive', egress: 'egress' },
      mineS = grpOf(m).who == 'lead' ? 'A' : 'B',
      by = DC.by,
      setBy = !by
        ? ''
        : by.air
          ? 'set by the two paths meeting in the air'
          : `set by ${by.me == mineS ? 'your' : `the ${other}'s`} ${PHN[by.p.k] || 'path'} at ${fmt(Math.round(by.p.alt / 50) * 50)} ft, ${(dist(by.p, by.c) / FT_NM).toFixed(1)} nm from ${by.me == mineS ? `the ${other}'s` : 'your'} impact`;
    return { sec, Sec, at, lv, state, other, inside, setBy, joined: grpOf(m).egr == 'shared' };
  }
  function dcCard() {
    const T = dcTexts();
    if (!T) return '';
    const { sec, Sec, at, lv, state, inside, setBy, joined } = T;
    return `<div class="wcard wdc${lv == 'bad' ? ' bad' : lv == 'warn' ? ' warn' : ''}"><h3>Lead and ${sec}</h3><div class="tiles"><div class="tile"><span>${Sec} at ${at}, after the lead</span><b>at least +${DC.spacing} s</b>${setBy ? `<span class="wsetby">${setBy}</span>` : ''}</div></div><p class="${lv == 'bad' ? 'wwarn' : lv == 'warn' ? 'wamb' : 'hint'}">${state}</p>${inside.map(x => `<p class="${lv == 'bad' ? 'wwarn' : 'wamb'}"><b>${x}</b></p>`).join('')}${
      joined
        ? `<p class="hint">Joined egress: visual rejoin after the release, checked there only against the fragments. 500 ft of altitude between the two until visual.</p>`
        : ''
    }${DC.zones ? '' : '<p class="hint">No bomb envelope: fragments not counted.</p>'}<p class="hint wnote">From ${at} on (before it: formation). An estimate. White: the other attack.</p></div>`;
  }

  // ---------- the Attack card of the Kneeboard: the data of the role shown (atkcard.js draws it) ----------
  function atkData() {
    if (!res || res.error || !ctx.t) return null;
    const r = res,
      v = r.v,
      m = st.inMode,
      g = ATK.includes(m) ? grpOf(m) : null,
      split = !!(g && g.split),
      who = split ? g.who : 'flight',
      vip = st.ref == 'vip' ? ctx.vipPos : null,
      PD0 = oa1Plan(r.draw || popupDraw(r, vip), r),
      ok = pts => pts.every(q => q && isFinite(q.n) && isFinite(q.e)),
      c = cardInfo(),
      nm = d => (d / FT_NM).toFixed(1) + ' nm';
    // the side profile, as on the page
    const spec = r.vert ? { ...r.vert } : popVert(r);
    if (r.kind == 'toss') {
      const ig = spec.segs.find(z => z[0] == 'ingress'),
        pupX = ig ? ig[1][ig[1].length - 1][0] : 0,
        endX = Math.max(...spec.segs.flatMap(z => z[1].map(p => p[0]))),
        stub = Math.max(3000, Math.min(12000, (endX - pupX) * 0.35));
      spec.segs = spec.segs.map(z =>
        z[0] == 'ingress' ? [z[0], z[1].map(p => [Math.max(p[0], pupX - stub), p[1]])] : z
      );
    }
    const an = r.an,
      env = an && an.env,
      I = r.impacts || [],
      dI = env && I.length ? [I[0].d, I[I.length - 1].d].filter((d, i, a) => a.indexOf(d) === i) : [],
      domes = env && env.model ? dI.map(d => fragOutline(env.model, 0).map(([px, z]) => [d + px, z])) : [];
    // the other role's fragments across this attack's line, and the part of this path inside them if flown together
    const odomes = [],
      hot = [];
    if (GHO && GHO.env && GHO.env.model && GHO.r && GHO.r.impacts && isFinite(v.attackHeading)) {
      const A = (v.attackHeading * Math.PI) / 180,
        ux = Math.sin(A),
        uy = Math.cos(A),
        T = r.target,
        along = p => (p.e - T.e) * ux + (p.n - T.n) * uy,
        side = p => Math.abs((p.e - T.e) * uy - (p.n - T.n) * ux),
        GI = GHO.r.impacts;
      [GI[0], GI[GI.length - 1]]
        .filter((q, i, a) => a.indexOf(q) === i)
        .forEach(q => {
          const o = fragOutline(GHO.env.model, side(q)).map(([px, z]) => [along(q) + px, z]);
          if (o.length) odomes.push(o);
        });
      const hp = DC ? (g.who == 'lead' ? DC.hotA : DC.hotB) : [];
      let cur = [];
      (hp || []).forEach((p, i) => {
        if (i && dist(p, hp[i - 1]) > 600) {
          hot.push(cur);
          cur = [];
        }
        cur.push([along(p), p.alt]);
      });
      if (cur.length > 1) hot.push(cur);
    }
    const mra = an && an.mra && an.mra.value ? an.mra.value : null;
    // the parameters of this attack
    const rows =
      st.mode == 'popup'
        ? [
            ['Ingress', `${c.ia} ft · ${c.is} kt`],
            ['Climb heading', c.ph],
            ['Climb angle', c.cl],
            ['Turn', c.tn],
            ['Pull-down alt.', c.pd + ' ft'],
            ['Attack heading', c.ah],
            ['Dive angle', v.diveAngle + '°'],
            ['Tracking', v.timeOnFinal + ' s'],
            ['Release', `${c.rh} ft · ${c.rs} kt`],
            ['Egress', `${hm(v.egressHeading)}° · ${nm(v.egressRange || 0)}`],
          ]
        : st.mode == 'hadb'
          ? [
              ['Ingress', `${c.ia} ft · ${c.is} kt`],
              ['Ingress heading', c.ph],
              ['Turn', c.tn],
              ['Aim-off', nm(v.aod)],
              ['Attack heading', c.ah],
              ['Dive angle', v.diveAngle + '°'],
              ['Tracking', v.timeOnFinal + ' s'],
              ['Release', `${c.rh} ft · ${c.rs} kt`],
              ['Egress', `${hm(v.egressHeading)}° · ${nm(v.egressRange || 0)}`],
            ]
          : [
              ['Ingress', `${c.ia} ft · ${c.is} kt`],
              ['Ingress heading', c.ph],
              ['Turn', c.tn],
              ['Attack heading', c.ah],
              ['Release angle', v.releaseAngle + '°'],
              ['Pull-up distance', nm(v.pullDistance)],
              ['Release', `${c.rh} ft · ${c.rs} kt`],
              ['Egress', `${hm(v.egressHeading)}° · ${nm(v.egressRange || 0)}`],
            ];
    // the spacing (split) and the safety
    const T = dcTexts(),
      LV = { bad: '#d03030', warn: '#c27c0e', ok: '#1f8a4c' },
      spacing = T
        ? {
            head: `${T.Sec} at ${T.at}, after the lead`,
            value: `+${DC.spacing} s`,
            by: T.setBy,
            text: T.state,
            col: LV[T.lv],
          }
        : null,
      safety = [];
    if (mra)
      safety.push([
        `MRA ${fmt(Math.round(mra))} ft (${an.mra.by}) · release ${fmt(Math.round(v.releaseAltitude))} ft${an.below ? ': BELOW the MRA' : ''}`,
        an.below ? '#d03030' : '#1c2530',
      ]);
    if (an && an.viol && !an.viol.ground)
      safety.push([`Inside the fragments of your bomb ${an.viol.t.toFixed(1)} s after the release`, '#d03030']);
    if (T) T.inside.forEach(t => safety.push([t, LV[T.lv]]));
    if (T && T.joined)
      safety.push(['Joined egress: visual rejoin, 500 ft of altitude between the two until visual', '#4a5568']);
    let offs = [];
    try {
      offs = Object.values(offsets())
        .filter(o => o && o.row)
        .map(o => [
          o.label,
          h3(+o.row.brg) + '°',
          fmt(Math.round(+o.row.rng)),
          o.alt !== undefined ? fmt(Math.round(o.alt)) : '',
        ]);
    } catch (e) {
      offs = [];
    }
    const sm = smartBase(r, PD0, spec, mra, offs, c, who);
    return {
      sm,
      role: who == 'flight' ? 'FLIGHT' : whoName(who),
      roleCol: who == 'lead' ? '#1d4ed8' : who == 'elem' ? '#b45309' : '#1f8a4c',
      title: (deps.title && deps.title()) || '',
      kind: c.label,
      target: (ctx.t.name || 'Target') + (ctx.sp && !/STPT\s*\d/.test(ctx.t.name || '') ? ' · STPT ' + ctx.sp.n : ''),
      leth:
        env && I.length ? { r: env.out, pts: [I[0], I[I.length - 1]].filter((q, i, a) => a.indexOf(q) === i) } : null,
      bomb: bombSel().label,
      segs: PD0.segs.filter(z => z[0] != 'ref' && ok(z[1])),
      marks: PD0.marks.filter(mk => mk[0] && isFinite(mk[0].n)).map(mk => [mk[0], mk[1]]),
      target0: r.target,
      other: GHO ? GHO.segs.filter(z => z[0] != 'fall').map(z => z[1]) : [],
      otherName: GHO ? whoName(GHO.who) : '',
      prof: {
        segs: [
          ...spec.segs,
          ...(env && an.path
            ? [
                [
                  'escape',
                  an.path
                    .filter(q => q.t <= an.window.to && q.x <= I[I.length - 1].d + env.out + 600)
                    .map(q => [q.x, q.alt]),
                ],
              ]
            : []),
        ],
        marks: spec.marks.map(mk => [mk[0], mk[1]]),
        domes,
        odomes,
        hot,
        mra,
        mraT: mra ? fmt(Math.round(mra)) + ' ft' : '',
      },
      rows,
      spacing,
      safety,
      offsets: offs,
      notes: ['BMS Cards · an estimate from the TO graphs and the plan; check it in the game.'],
    };
  }
  // ---- the Smart card of an attack (core/smartcard.js): the numbers of the attack ready, the terrain and the references read when the card is made
  const SHORT = {
    Release: 'REL',
    'Roll out': 'ROLL OUT',
    'PUP · pull-up': 'PUP',
    'VRP · turn': 'VRP',
    'Line-up': 'LINE-UP',
    MAP: '',
  };
  const short = l => {
    const t = String(l || '').split(' · ')[0];
    return SHORT[t] !== undefined ? SHORT[t] : t.toUpperCase();
  };
  // the weapon of the key box: the bomb chosen, else the first bomb of the loadout (number × name); a long name gives its designation (AGM-88 HARM -> AGM-88)
  const wpnName = n => {
    const t = String(n || '')
      .replace(/\s*\(.*\)$/, '')
      .trim();
    if (t.length <= 9) return t.toUpperCase();
    const code = /^[A-Z]{1,4}-?\d+[A-Z]{0,2}(?:\/[A-Z])?/i.exec(t);
    return (code ? code[0] : t.split(/\s+/)[0]).toUpperCase().slice(0, 9);
  };
  function wpnShort() {
    const b = bombSel();
    if (b.manual) return wpnName(b.label);
    const L = (deps.loadout && deps.loadout(0)) || [],
      w =
        (b.loadout && L.find(z => wpnName(z.name) == wpnName(b.label))) ||
        L.find(z => /MK|GBU|CBU|BDU|BLU|AGM|JDAM|SDB|BOMB|M117|KAB|FAB/i.test(z.name)) ||
        L[0];
    return w ? (w.n > 1 ? w.n + '×' : '') + wpnName(w.name) : b.loadout ? wpnName(b.label) : '--';
  }
  function smartBase(r, PD0, spec, mra, offs, c, who) {
    const v = r.v,
      T = r.target,
      nmT = p => (p ? (dist(p, T) / FT_NM).toFixed(1) + ' NM' : '--'),
      tgt = ctx.t ? (ctx.sp && ctx.sp.n ? 'STPT ' + ctx.sp.n : ctx.t.name || 'TGT') : 'TGT',
      tot = deps.tot && ctx.sp ? deps.tot(ctx.sp.n) : '',
      wpn = wpnShort(),
      fz =
        r.fuze && r.fuze.ad1
          ? 'AD1 ' + r.fuze.ad1.delay + ' s' + (r.fuze.ad1.armed ? ' ARM' : ' SAFE')
          : r.fuze && r.fuze.burst
            ? 'BA ' + fmt(v.burstAltitude)
            : '',
      stick = v.ripplePulses > 1 ? v.ripplePulses + ' × ' + fmt(v.stickSpacing) + ' ft' : 'single',
      eg = hm(v.egressHeading) + '°',
      kind = st.mode,
      red = mra != null && v.releaseAltitude < mra;
    // the plan: the segments of the page, the line to OA1 left out, the egress from the release
    const segs = PD0.segs.filter(z => z[0] != 'ref' && !(z[0] == 'egress' && z[1][0] === T));
    if (!segs.some(z => z[0] == 'egress') && isFinite(v.egressHeading))
      segs.push(['egress', [r.release, project(r.release, v.egressHeading, Math.min(8000, v.egressRange || 8000))]]);
    const marks = PD0.marks
      .filter(m => m[0] && isFinite(m[0].n) && m[1] !== 'VIP')
      .map(m => [
        m[0],
        short(m[1]) +
          (m[1] == 'PUP' || m[1] == 'PUP · pull-up'
            ? ' ' + hm(v.pullHeading || v.ingressHeading || v.attackHeading) + '°'
            : ''),
        m[3] == 'dia' ? 'dia' : '',
      ])
      .map(m => (m[1] == 'REL' ? [m[0], 'REL ' + hm(v.attackHeading) + '°', m[2]] : m));
    // the side: as on the page (the escape of the fragments left out); x from the target, negative before it
    const sSegs = spec.segs.filter(z => z[0] != 'escape'),
      sMarks = spec.marks.map(mk => mk[0]),
      sLabels = spec.marks.map(mk => [
        mk[0][0],
        mk[0][1],
        short(mk[1]) + (/\d/.test(mk[1]) && !/\d/.test(short(mk[1])) ? ' ' + String(mk[1]).replace(/^[^\d]*/, '') : ''),
      ]);
    const key =
      kind == 'popup'
        ? [
            ['TGT', tgt],
            ['TOT', tot || '--'],
            ['ATK HDG', hm(v.attackHeading) + '°'],
            ['WPN', wpn],
            ['PUP', nmT(r.pup)],
            ['APEX', fmt(v.apexAltitude)],
            ['REL', fmt(v.releaseAltitude), red],
            ['MRA', mra ? fmt(mra) : '--', true],
          ]
        : kind == 'hadb'
          ? [
              ['TGT', tgt],
              ['TOT', tot || '--'],
              ['ATK HDG', hm(v.attackHeading) + '°'],
              ['WPN', wpn],
              ['ROLL-IN', fmt(v.ingressAltitude)],
              ['DIVE', v.diveAngle + '°'],
              ['REL', fmt(v.releaseAltitude), red],
              mra ? ['MRA', fmt(mra), true] : ['SLANT', ((v.wheelRange || 0) / FT_NM).toFixed(1) + ' NM'],
            ]
          : [
              ['TGT', tgt],
              ['TOT', tot || '--'],
              ['ATK HDG', hm(v.attackHeading) + '°'],
              ['WPN', wpn],
              ['PUP', nmT(r.pup)],
              ['ANGLE', v.releaseAngle + '°'],
              ['REL', ((v.releaseRange || 0) / FT_NM).toFixed(1) + ' NM'],
              ['MIN REL', fmt(v.minReleaseAltitude || v.releaseAltitude), true],
            ];
    const foot =
      kind == 'popup'
        ? [
            ['INGRESS', 'PULL ' + c.ph, c.is + ' KCAS', c.ia + ' ft'],
            ['ROLL-IN', 'CLIMB ' + c.cl, 'AOD ' + fmt(v.aod), 'TRACK ' + v.timeOnFinal + ' s'],
            ['BOMB', 'TOF ' + (v.timeOfFall || 0).toFixed(1) + ' s', fz, stick],
          ]
        : kind == 'hadb'
          ? [
              ['INGRESS', 'HDG ' + c.ph, c.is + ' KCAS', c.ia + ' ft'],
              [
                'ROLL-IN',
                'TURN ' + Math.round(v.turnAngle || 0) + '° ' + v.turnG + ' G',
                'AOD ' + (v.aod / FT_NM).toFixed(1) + ' NM',
                'TRACK ' + v.timeOnFinal + ' s',
              ],
              ['BOMB', 'TOF ' + (v.timeOfFall || 0).toFixed(1) + ' s', fz, stick],
            ]
          : [
              ['INGRESS', 'HDG ' + c.ph, c.is + ' KCAS', c.ia + ' ft'],
              [
                'PULL-UP',
                v.turnG + ' G to ' + v.releaseAngle + '°',
                'PULL ' + ((v.pullDistance || 0) / FT_NM).toFixed(2) + ' NM',
                'REL ' + c.rs + ' KCAS',
              ],
              ['BOMB', 'TOF ' + (v.timeOfFall || 0).toFixed(1) + ' s', fz, stick],
            ];
    const oa = (offs || [])
      .slice(0, 2)
      .map(o => o[0] + ' ' + o[1] + ' ' + o[2] + ' ft')
      .join(' · ');
    // the view of the map of this page when the card is made (the zoom the pilot chose): the plan of the card shows the same ground
    let view = null;
    try {
      if (M && M.map && deps.fromLL && M.map.getContainer().clientWidth) {
        const b = M.map.getBounds(),
          K = 3280.84,
          P = [b.getSouthWest(), b.getNorthEast(), b.getNorthWest(), b.getSouthEast()]
            .map(q => deps.fromLL(q.lat, q.lng))
            .map(([gx, gy]) => ({ n: gy * K, e: gx * K }));
        view = P;
      }
    } catch (e) {
      view = null;
    }
    return {
      view,
      kind,
      title: 'ATK · ' + (c.label || kind.toUpperCase()) + (who == 'lead' ? ' · A' : who == 'elem' ? ' · B' : ''),
      right: (deps.tag && deps.tag()) || ((deps.title && deps.title()) || '').split(' · ')[0] || '',
      key,
      foot,
      last: (oa ? oa + ' · ' : '') + 'EGR ' + eg + ' · GS ' + Math.round(v.groundSpeed || 0) + ' kt',
      T,
      ingress: v.ingressAltitude,
      unrolled: kind == 'popup', // the x of the pop-up profile runs along the flown path; HADB / TOSS along the attack line
      attack: v.attackHeading,
      segs,
      marks,
      side: {
        segs: sSegs,
        marks: sMarks,
        labels: sLabels,
        line: mra
          ? { h: mra, label: 'MRA ' + fmt(mra) }
          : kind == 'toss' && v.minReleaseAltitude
            ? { h: v.minReleaseAltitude, label: 'MIN REL ' + fmt(v.minReleaseAltitude) }
            : null,
      },
    };
  }
  // the card itself: the grid of the terrain of the plan view and the ground under the path, the references near the attack, then the drawing
  const PLAN_AR = 436 / 246;
  async function smartCard(sm) {
    const T = sm.T,
      pts = [...sm.segs.flatMap(z => z[1]), ...sm.marks.map(m => m[0]), T].filter(p => p && isFinite(p.n)),
      [e0, e1, n0, n1] = sm.view ? planBox(sm.view, PLAN_AR, 0) : planBox(pts, PLAN_AR), // the zoom of the page, else the attack
      nx = 120,
      ny = Math.round(nx / PLAN_AR),
      G = { e0, e1, n0, n1, nx, ny, h: /** @type {number[]} */ ([]) },
      q = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        q.push({ e: e0 + ((i + 0.5) / nx) * (e1 - e0), n: n1 - ((j + 0.5) / ny) * (n1 - n0) });
    // the path flown (the plan segments in order, without the fall and the egress), for the ground of the profile and the references
    const path = sm.segs
        .filter(z => !['fall', 'egress', 'ref'].includes(z[0]))
        .flatMap(z => z[1])
        .filter(p => p && isFinite(p.n))
        .concat([T]),
      dense = [];
    for (let i = 0; i + 1 < path.length; i++)
      for (let k = 0; k < 8; k++) {
        const a = path[i],
          b = path[i + 1],
          f = k / 8;
        dense.push({ n: a.n + (b.n - a.n) * f, e: a.e + (b.e - a.e) * f });
      }
    dense.push(T);
    const A = ((sm.attack || 0) * Math.PI) / 180,
      ua = { n: Math.cos(A), e: Math.sin(A) },
      after = [1, 2, 3, 4, 5, 6].map(k => ({ n: T.n + ua.n * 500 * k, e: T.e + ua.e * 500 * k }));
    let H = null;
    try {
      H = deps.elev ? await deps.elev([...q, ...dense, ...after]) : null;
    } catch (e) {
      H = null;
    }
    let ter = null;
    if (H && H.length == q.length + dense.length + after.length) {
      G.h = H.slice(0, q.length).map(h => (h == null ? null : Math.max(0, h)));
      // x of each point: from the target backwards (the flown distance for the pop-up, the distance along the attack line for HADB / TOSS)
      const xs = [];
      let acc = 0;
      for (let i = dense.length - 1; i >= 0; i--) {
        if (i < dense.length - 1) acc += dist(dense[i], dense[i + 1]);
        xs[i] = sm.unrolled ? -acc : (dense[i].n - T.n) * ua.n + (dense[i].e - T.e) * ua.e;
      }
      ter = dense
        .map((p, i) => [xs[i], H[q.length + i] || 0])
        .concat(after.map((p, k) => [500 * (k + 1), H[q.length + dense.length + k] || 0]));
      ter.sort((a, b) => a[0] - b[0]);
    }
    // the references near the path (1.5 NM), the most useful first, at most 7
    let refs = [];
    try {
      const all = deps.refs ? (await deps.refs({ e0, e1, n0, n1 })) || [] : [],
        near = p => Math.min(...dense.map(d => Math.hypot(d.n - p.n, d.e - p.e))),
        PR = { city: 0, town: 1, airfield: 2, bridge: 3, sam: 4, unit: 4, obst: 5, obj: 6, village: 7 };
      refs = all
        .map(r => ({ ...r, d: near(r) }))
        .filter(r => r.d < 1.5 * FT_NM && dist(r, T) > 600)
        .sort((a, b) => (PR[a.k] ?? 9) - (PR[b.k] ?? 9) || a.d - b.d)
        .slice(0, 7);
    } catch (e) {
      refs = [];
    }
    const xMin = Math.min(...sm.side.segs.flatMap(z => z[1].map(p => p[0])));
    return {
      title: sm.title,
      right: sm.right,
      key: sm.key,
      side: { ...sm.side, ter, x0: xMin, x1: 2500 },
      plan: { segs: sm.segs, marks: sm.marks, target: T, grid: G.h.length ? G : null, ingress: sm.ingress, refs },
      foot: sm.foot,
      last: sm.last,
    };
  }
  // the combined Smart card of a role: the attack (its key numbers, its side profile) over the target, the weather over it and the ROE / SOP
  function comboOf(sm, A, B) {
    const tops = sm.side.segs.filter(z => z[0] != 'fall').flatMap(z => z[1].map(p => p[1])),
      top = tops.length ? Math.max(...tops) : 0,
      wAlt = Math.max(3000, Math.round((sm.ingress || 0) / 1000) * 1000),
      W = B.wx ? wxAtTarget(B.wx, wAlt) : null,
      what = sm.kind == 'toss' ? 'BOMB TOP' : sm.kind == 'hadb' ? 'ROLL-IN' : 'APEX',
      ftop =
        sm.kind == 'toss'
          ? (sm.side.segs.find(z => z[0] == 'fall') || [0, [[0, 0]]])[1].reduce((m, p) => Math.max(m, p[1]), 0)
          : top,
      check = !W
        ? null
        : W.base == null
          ? { label: 'NO CLOUD OVER THE TARGET \u2713' }
          : ftop < W.base
            ? { label: what + ' ' + fmt(ftop) + ' < BASE ' + fmt(W.base) + ' \u2713' }
            : { label: what + ' ' + fmt(ftop) + ' IN CLOUD ' + fmt(W.base) + '-' + fmt(W.top), bad: true };
    return {
      title: 'MISSION · ' + sm.title.replace(/^ATK · /, ''),
      right: sm.right,
      key: sm.key,
      mod: {
        kind: 'attack',
        label: 'ATTACK · ' + sm.title.replace(/^ATK · /, ''),
        side: A.side,
        line: sm.foot
          .map(c => c.slice(1).join(' '))
          .join(' · ')
          .slice(0, 64),
      },
      tgt: B.tgt,
      wx: W,
      windLabel: 'WIND ' + wAlt / 1000 + 'k',
      check,
      roe: B.roe,
      last: [sm.last, ''],
    };
  }
  // the Smart cards of the roles, in both looks: [{name, c, alt, dark, kind}] (the attack card, and the combined card when the base can be read)
  async function smartCards(L) {
    const out = [];
    let B = null;
    try {
      B = deps.combo ? await deps.combo() : null;
    } catch (e) {
      B = null;
    }
    for (const D of L) {
      if (!D || !D.sm) continue;
      const A = await smartCard(D.sm),
        mk = (f, data) => () => {
          const c = document.createElement('canvas');
          c.width = SC_W;
          c.height = SC_H;
          f(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), data);
          return c;
        };
      const nm = 'Smart · Attack · ' + D.role + (D.target ? ' · ' + D.target : ''),
        m1 = mk(drawSmartAttack, A);
      out.push({ name: nm, label: nm, c: m1(), alt: otherLook(m1), dark: cardDark(), sk: 'smart' });
      if (B) {
        const C = comboOf(D.sm, A, B),
          m2 = mk(drawSmartCombined, C),
          n2 = 'Smart · Mission · ' + D.role + (D.target ? ' · ' + D.target : '');
        out.push({ name: n2, label: n2, c: m2(), alt: otherLook(m2), dark: cardDark(), sk: 'combo' });
      }
    }
    return out;
  }
  // the plan of a card on the map of the Map page: the lent map fitted to the card's points (in the middle band of the card's proportions), its
  // picture taken without the drawing of this page, the points in its pixels; the map goes back as it was
  async function snapPlan(D) {
    if (!M || !deps.snap || !D) return null;
    const { L, map, WL } = M,
      ll = p => deps.ll(p.n, p.e),
      pts = [...D.segs.flatMap(z => z[1]), ...D.other.flat(), D.target0].filter(p => p && isFinite(p.n));
    if (D.leth) D.leth.pts.forEach(q => [0, 90, 180, 270].forEach(b => pts.push(project(q, b, D.leth.r))));
    if (!pts.length) return null;
    const el = map.getContainer(),
      cw = el.clientWidth,
      ch = el.clientHeight,
      AR = 1520 / 820,
      bw = Math.min(cw, ch * AR),
      bh = bw / AR,
      ox = (cw - bw) / 2,
      oy = (ch - bh) / 2,
      c0 = map.getCenter(),
      z0 = map.getZoom();
    WL.remove();
    try {
      map.fitBounds(L.latLngBounds(pts.map(ll)), {
        paddingTopLeft: [ox + 30, oy + 30],
        paddingBottomRight: [ox + 30, oy + 30],
        animate: false,
      });
      // the tiles of the new view
      await new Promise(r => setTimeout(r, 1200));
      const shot = await deps.snap(2);
      if (!shot) return null;
      const k = shot.canvas.width / cw,
        px = p => {
          const q = map.latLngToContainerPoint(ll(p));
          return [(q.x - ox) * k, (q.y - oy) * k];
        },
        t = D.target0,
        nmPx = t ? Math.hypot(...[0, 1].map(i => px(project(t, 0, FT_NM))[i] - px(t)[i])) : 0;
      const crop = document.createElement('canvas');
      crop.width = Math.round(bw * k);
      crop.height = Math.round(bh * k);
      crop.getContext('2d').drawImage(shot.canvas, -ox * k, -oy * k);
      return {
        img: crop,
        coast: shot.coast,
        segs: D.segs.map(([ph, a]) => [ph, a.map(px)]),
        marks: D.marks.map(([p, l]) => [px(p), l]),
        other: D.other.map(a => a.map(px)),
        tgt: t ? px(t) : null,
        leth: D.leth ? D.leth.pts.map(q => ({ c: px(q), r: (D.leth.r / FT_NM) * nmPx })) : [],
        nm: nmPx,
      };
    } catch (e) {
      return null;
    } finally {
      WL.addTo(map);
      map.setView(c0, z0, { animate: false });
    }
  }
  // Add card: the cards of the roles drawn and put into the Kneeboard
  async function addAtkCards(btn) {
    if (!deps.kbAdd) return;
    btn.disabled = true;
    try {
      const L = atkCards();
      if (!L.length) throw new Error('no attack to draw');
      // the classic card and the Smart card of each role, chosen on their pictures (the choice kept for the next time)
      let keep = { std: true, smart: true, combo: true };
      try {
        keep = { ...keep, ...JSON.parse(localStorage.getItem('atkcardkinds') || '{}') };
      } catch (e) {
        /* the default */
      }
      const list = await busyRun('Preparing the Attack cards…', async () => {
        const o = [];
        for (const D of L) {
          D.px = await snapPlan(D); // the loading bar of the map
          const mk = () => {
            const c = document.createElement('canvas');
            c.width = ATC_W;
            c.height = ATC_H;
            drawAtkCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D);
            return c;
          };
          const nm = 'Attack · ' + D.role + (D.target ? ' · ' + D.target : '');
          o.push({
            kind: 'std',
            role: D.role,
            name: nm,
            label: 'Attack · ' + D.role,
            c: mk(),
            alt: otherLook(mk),
            on: keep.std,
          });
        }
        for (const z of await smartCards(L))
          o.push({
            ...z,
            kind: z.sk,
            label: (z.sk == 'combo' ? 'Smart mission · ' : 'Smart · ') + z.name.split(' · ')[2],
            on: z.sk == 'combo' ? keep.combo : keep.smart,
          });
        return o;
      });
      btn.disabled = false;
      const pick = await chooseCards(list, 'Add Attack cards to the Kneeboard');
      if (!pick.length) return;
      try {
        localStorage.setItem(
          'atkcardkinds',
          JSON.stringify({
            std: pick.some(z => z.kind == 'std'),
            smart: pick.some(z => z.kind == 'smart'),
            combo: pick.some(z => z.kind == 'combo'),
          })
        );
      } catch (e) {
        /* not kept */
      }
      const out = [];
      for (const z of pick) {
        const blob = await new Promise(r => z.c.toBlob(r, 'image/png'));
        if (!blob) continue;
        const alt = await new Promise(r => z.alt.toBlob(r, 'image/png'));
        const at = await deps.kbAdd(blob, z.name, alt, cardDark());
        out.push(z.label + ': ' + (at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards'));
      }
      if (deps.toast)
        deps.toast(
          out.length +
            ' attack card' +
            (out.length > 1 ? 's' : '') +
            ' added to the Kneeboard. ' +
            out.join(' · ') +
            '.'
        );
    } catch (e) {
      if (deps.toast) deps.toast('The attack card could not be made: ' + ((e && e.message) || e), true);
    }
    btn.disabled = false;
    draw(true);
  }
  // every attack card, in both looks, for Add all cards of the Kneeboard: [{name, label, c, alt, dark}] (none without an attack: no target chosen, or a
  // steerpoint that is no target)
  async function allCards() {
    const m0 = st.mode;
    if (!ATK.includes(st.mode)) st.mode = ATK.includes(st.amode) ? st.amode : 'popup';
    try {
      compute();
      if (!ctx || !ctx.t || !ctx.T.some(x => x.v === st.tgt)) return []; // no target chosen: the planner would take the first steerpoint
      const out = [];
      for (const D of atkCards()) {
        D.px = await snapPlan(D);
        const mk = () => {
          const c = document.createElement('canvas');
          c.width = ATC_W;
          c.height = ATC_H;
          drawAtkCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D);
          return c;
        };
        const nm = 'Attack · ' + D.role + (D.target ? ' · ' + D.target : '');
        out.push({ name: nm, label: nm, c: mk(), alt: otherLook(mk), dark: cardDark() });
      }
      return out.concat(await smartCards(atkCards()));
    } catch (e) {
      return [];
    } finally {
      st.mode = m0;
    }
  }
  // the cards of the roles: the flight, or the lead and the element of a split flight
  function atkCards() {
    const m = st.inMode;
    compute();
    GHO = ghost();
    DC = deconfNow();
    if (!ATK.includes(m) || st.mode !== m || !grpOf(m).split) return [atkData()].filter(Boolean);
    const g = grpOf(m),
      out = [];
    ['lead', 'elem'].forEach(w => {
      if (g.who == w) {
        compute();
        GHO = ghost();
        DC = deconfNow();
        out.push(atkData());
      } else
        out.push(
          withGroup(w, () => {
            GHO = ghost();
            DC = deconfNow();
            return atkData();
          })
        );
    });
    // back to the role shown
    compute();
    GHO = ghost();
    DC = deconfNow();
    return out.filter(Boolean);
  }
  function drawMap(r) {
    const { L, map, WL } = M,
      RN = map._wpR,
      v = r.v,
      vip = st.ref == 'vip' ? ctx.vipPos : null,
      ll = p => deps.ll(p.n, p.e),
      D0 = vrpMark(oa1Plan(r.draw || popupDraw(r, vip), r), r),
      D =
        vip && dist(vip, r.target) > 50 && !D0.marks.some(m => m[0] === vip)
          ? {
              ...D0,
              segs: [...D0.segs, ['ref', [vip, r.target]]],
              marks: [...D0.marks, [vip, 'VIP · reference', '#f0b040', 'big']],
            }
          : D0,
      mid = (a, b) => ({ n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 });
    WL.clearLayers();
    const geo = [
        r.target,
        ...D.segs.filter(z => z[0] != 'ref').flatMap(z => z[1]),
        ...D.marks.filter(m => !vip || m[0] !== vip).map(m => m[0]),
        ...(r.oa2 ? [r.oa2] : []),
      ],
      ext = Math.max(...geo.map(p => dist(p, r.target)));
    const farVip = !!vip && dist(vip, r.target) > 3 * ext + 5 * FT_NM,
      all = [...geo, ...(vip && !farVip ? [vip] : [])]; // a VIP far from the attack stays out of the fit: the view stays on the attack
    if (farVip)
      D.marks = D.marks.map(m =>
        m[0] === vip
          ? [
              m[0],
              'VIP · ' +
                (dist(vip, r.target) / FT_NM).toFixed(0) +
                ' nm ' +
                h3(bearing(r.target, vip)) +
                '° (off the view)',
              ...m.slice(2),
            ]
          : m
      );
    // the attack in red when the timing cannot clear the conflict with the other attack: its parameters have to change
    const redAll = dcLevel() == 'bad';
    const line = (pts, k, w = 4) => {
      const c = redAll && k != 'ref' ? '#ff4d4d' : PH[k][1],
        d = PH[k][2],
        q = pts.map(ll);
      L.polyline(q, { renderer: RN, color: '#000', weight: w + 2, opacity: 0.4, interactive: false }).addTo(WL);
      L.polyline(q, { renderer: RN, color: c, weight: w, dashArray: d || null, opacity: 1, interactive: false }).addTo(
        WL
      );
    };
    const dot = (p, fill, rad = 6, tip = '') => {
      const m = L.circleMarker(ll(p), {
        renderer: RN,
        radius: rad,
        fillColor: fill,
        fillOpacity: 1,
        color: '#111',
        weight: 2,
      }).addTo(WL);
      if (tip) m.bindTooltip(esc(tip));
    };
    const dia = (p, fill, tip) => {
      const m = L.marker(ll(p), {
        icon: L.divIcon({
          className: 'wpdia',
          html: `<i style="background:${fill}"></i>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(WL);
      if (tip) m.bindTooltip(esc(tip));
    };
    const lab = (p, t, dir = 'right', off = [8, 0]) =>
      L.circleMarker(ll(p), { radius: 0, opacity: 0, fillOpacity: 0, interactive: false, renderer: RN })
        .bindTooltip(esc(t), { permanent: true, direction: dir, className: 'wplab', offset: off })
        .addTo(WL);
    const arrow = (a, b, k) =>
      L.marker(ll(mid(a, b)), {
        icon: L.divIcon({
          className: 'wparr',
          html: `<i style="border-bottom-color:${PH[k][1]};transform:rotate(${bearing(a, b).toFixed(0)}deg)"></i>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
    // distance rings around the target
    const spread = Math.max(...all.map(p => dist(p, r.target))) / FT_NM,
      ringStep = [1, 2, 5, 10, 20, 50].find(k => spread / k <= 5) || 50;
    for (let k = 1; k * ringStep <= spread + ringStep; k++) {
      L.circle(ll(r.target), {
        renderer: RN,
        radius: k * ringStep * 1852,
        color: '#cbd5e1',
        weight: 1,
        opacity: 0.7,
        dashArray: '3 5',
        fill: false,
        interactive: false,
      }).addTo(WL);
      lab(project(r.target, 0, k * ringStep * FT_NM), k * ringStep + ' nm', 'top', [0, 0]);
    }
    // the other group first, so the attack shown stays on top
    if (GHO) {
      GHO.segs
        .filter(z => z[0] != 'fall')
        .forEach(([, pts]) => {
          const q = pts.map(ll);
          L.polyline(q, { renderer: RN, color: '#000', weight: 5, opacity: 0.45, interactive: false }).addTo(WL);
          L.polyline(q, { renderer: RN, color: '#fff', weight: 3, opacity: 0.95, interactive: false }).addTo(WL);
        });
      const zn = fragZone(GHO.r, GHO.env);
      if (zn)
        zn.pts.forEach(q =>
          L.circle(ll(q), {
            renderer: RN,
            radius: zn.out * 0.3048,
            color: '#fff',
            weight: 1.5,
            opacity: 0.9,
            dashArray: '4 5',
            fill: false,
            interactive: false,
          }).addTo(WL)
        );
      const g0 = GHO.segs[0] && GHO.segs[0][1][0];
      if (g0) lab(g0, whoName(GHO.who), 'left', [-8, 0]);
    }
    D.segs.forEach(
      ([k, pts]) =>
        pts.every(q => q && isFinite(q.n) && isFinite(q.e)) && line(pts, k, k == 'egress' || k == 'ref' ? 3 : 4)
    );
    (D.arrows || []).forEach(a => arrow(...a));
    (D.labels || []).forEach(a => lab(...a));
    r.impacts.forEach(q =>
      dot(q, '#ff5d5d', 3, 'Impact ' + q.i + ' · ' + (q.d >= 0 ? '+' : '−') + fmt(Math.abs(q.d)) + ' ft')
    );
    const an = r.an,
      LQ = an && an.env ? [r.impacts[0], r.impacts[r.impacts.length - 1]].filter((q, i, a) => a.indexOf(q) === i) : [];
    lethN = LQ.length; // lethal radius around the first and the last impact of the stick
    if (an && an.env)
      LQ.forEach(q =>
        L.circle(ll(q), {
          renderer: RN,
          radius: an.env.out * 0.3048,
          color: '#ff3b3b',
          weight: 2,
          opacity: 0.95,
          fillColor: '#ff3b3b',
          fillOpacity: 0.07,
          interactive: false,
        }).addTo(WL)
      );
    const cb = cbuInfo(r);
    if (cb)
      r.impacts.forEach(q => {
        const c = project(q, v.attackHeading + 180, cb.shortBy);
        L.circle(ll(c), {
          renderer: RN,
          radius: (cb.diameter / 2) * 0.3048,
          color: '#ff5d5d',
          weight: 2,
          opacity: 0.9,
          dashArray: '6 5',
          fillColor: '#ff5d5d',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(WL);
      });
    D.marks.forEach(([p, label, fill, kind, dir, off, tip]) => {
      if (kind == 'dia') dia(p, fill, label);
      else dot(p, fill, kind == 'big' ? 7 : kind == 'small' ? 4 : kind == 'small5' ? 5 : 6, tip || label);
      if (label) lab(p, label, dir || 'right', off || [8, 0]);
    });
    dia(r.target, '#fff', ctx.t.name || 'Target');
    lab(r.target, ctx.t.name || 'Target', 'right', [14, -10]);
    if ((r.kind != 'toss' || !r.hasTurn) && r.oa2) {
      dia(r.oa2, '#a78bfa', 'OA2');
      lab(r.oa2, 'OA2');
    }
    if (fit) {
      fit = false;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(all.map(ll)), { padding: [60, 60], maxZoom: 12, animate: false });
    }
  }
  function paint() {
    const root = deps.root,
      ok = res && !res.error,
      hid = (id, h) => {
        const e = root.querySelector(id);
        if (e) e.hidden = h;
      };
    hid('#wpmc', !ok);
    hid('#wpic', !ok);
    hid('#wpe', ok || !ctx.t || !ctx.ref);
    const eb = root.querySelector('#wpe');
    if (eb && !ok) eb.innerHTML = res && res.error ? `<div class="wperr">${esc(res.error)}</div>` : '';
    root.querySelector('#wpp').innerHTML = ok ? pattern(res) : '';
    root.querySelector('#wpl1').innerHTML = ok ? legend(legendKeys(true)) : '';
    if (!ok) return;
    if (!M) {
      if (!failed && !pend)
        pend = ensureMap().then(() => {
          pend = null;
          if (M) paint();
          else if (failed) {
            const n = root.querySelector('#wpmn');
            if (n) n.textContent = mapNote;
          }
        });
      return;
    }
    M.map.invalidateSize();
    applyOp();
    drawMap(res);
  }

  // ---------- impact pattern: the stick seen along the attack line, scaled to its own length ----------
  function pattern(r) {
    const cb = cbuInfo(r),
      v = r.v,
      I = r.impacts,
      W = 700,
      H = 150,
      L = Math.max(v.stickLength, 100),
      x0 = Math.min(0, I[0].d - (cb ? cb.shortBy + cb.diameter / 2 : 0)) - L * 0.25 - 60,
      x1 = Math.max(0, I[I.length - 1].d + (cb ? cb.diameter / 2 : 0)) + L * 0.25 + 60;
    const X = d => 30 + ((d - x0) / (x1 - x0)) * (W - 60),
      y = 70,
      pair = v.releaseMode == 'pair';
    const marks = I.map(
      q =>
        (pair ? [-7, 7] : [0])
          .map(
            o =>
              `<circle cx="${X(q.d).toFixed(1)}" cy="${y + o}" r="5" fill="#ff5d5d" stroke="#111" stroke-width="1.5"/>`
          )
          .join('') + `<text x="${X(q.d).toFixed(1)}" y="${y + 28}" text-anchor="middle">${q.i}</text>`
    ).join('');
    const ticks = I.map(
      q =>
        `<text x="${X(q.d).toFixed(1)}" y="${y - 16}" text-anchor="middle" fill="#8b98a8">${q.d >= 0 ? '+' : '−'}${fmt(Math.abs(q.d))}</text>`
    ).join('');
    const foot = cb
      ? I.map(q => {
          const c = q.d - cb.shortBy;
          return `<path d="M${X(c - cb.diameter / 2).toFixed(1)} ${y + 40} H${X(c + cb.diameter / 2).toFixed(1)}" stroke="#ff5d5d" stroke-width="3" stroke-dasharray="6 5" opacity=".7"/>`;
        }).join('')
      : '';
    const gap = I.length > 1 ? v.stickSpacing / v.groundSpeed / FT_KT : 0;
    return `<svg viewBox="0 0 ${W} ${H}" class="wpp" role="img" aria-label="Where the bombs of the stick hit"><rect width="${W}" height="${H}" rx="6" fill="#0f1419"/>
      <path d="M30 ${y} H${W - 30}" stroke="#2a3441" stroke-width="2"/><path d="M${W - 30} ${y} l-9 -5 v10z" fill="#2a3441"/>
      <g font-family="system-ui,sans-serif" font-size="11" fill="#cfd8e2"><path d="M${X(0)} ${y - 26} V${y + 20}" stroke="#fff" stroke-dasharray="3 3"/><path d="M${X(0)} ${H - 24} l6 6 l-6 6 l-6 -6z" fill="#fff" stroke="#111"/><text x="${X(0) + 10}" y="${H - 8}" fill="#fff">target</text><text x="${W - 34}" y="${y - 30}" text-anchor="end" fill="#8b98a8">attack heading →</text>${ticks}${marks}${foot}</g></svg>
      <div class="hint" style="margin-top:6px">${I.length} pulse${I.length > 1 ? 's' : ''} × ${pair ? 'pair' : 'single'} · stick ${fmt(v.stickLength)} ft${I.length > 1 ? ` · every ${gap.toFixed(2)} s` : ''} ${cb ? ` · CBU footprint ${fmt(cb.diameter)} ft` : ''}${r.an && r.an.env ? ` · lethal radius ${fmt(r.an.env.out)} ft around each impact for ${Math.round(r.an.env.t)} s after the last (red circles on the map)` : ''} · ${v.stickMode == 'mid' ? 'target in the middle of the stick' : 'first bomb on the target'}${pair ? ' · the sideways gap of a pair is not shown' : ''}</div>`;
  }

  // ---------- side profile ----------
  // the pop-up side view: PUP, climb, the closed-form pull-down circle (joins the dive exactly), dive, bomb fall
  function popVert(r) {
    const v = r.v,
      A = (v.diveAngle * Math.PI) / 180,
      C = (v.climbAngle * Math.PI) / 180,
      R = v.turnRadius;
    const xMap = -v.mapDistance,
      xRel = -v.releaseRange,
      xPdp = xMap - R * (Math.sin(C) + Math.sin(A)),
      xPup = xPdp - v.pupToPdp;
    const arc = [];
    for (let i = 0; i <= 40; i++) {
      const th = C - ((C + A) * i) / 40;
      arc.push([xPdp + R * (Math.sin(C) - Math.sin(th)), v.pulldownAltitude + R * (Math.cos(th) - Math.cos(C))]);
    }
    const dive = [
        [xMap, v.trackAltitude],
        [xRel, v.releaseAltitude],
      ],
      apex = arc.reduce((m, p) => (p[1] > m[1] ? p : m), arc[0]);
    return {
      segs: [
        [
          'ingress',
          [
            [xPup - 600, v.ingressAltitude],
            [xPup, v.ingressAltitude],
          ],
        ],
        [
          'climb',
          [
            [xPup, v.ingressAltitude],
            [xPdp, v.pulldownAltitude],
          ],
        ],
        ['pull', arc],
        ['dive', dive],
        ['fall', [dive[1], [0, 0]]],
      ],
      marks: [
        [[xPup, v.ingressAltitude], 'PUP · CA ' + v.climbAngle + '°', '#f0b040', 4, 14],
        [[xPdp, v.pulldownAltitude], 'PDWN ' + fmt(v.pulldownAltitude), '#ffe680', -48, -8],
        [apex, 'Apex ' + fmt(v.apexAltitude), '#4aa3ff', -26, -8],
        [dive[1], 'RALT ' + fmt(v.releaseAltitude), '#4aa3ff', -70, -6],
      ],
      tgt: 'TGT · DA ' + v.diveAngle + '°',
    };
  }
  function profile(r) {
    const spec = r.vert ? { ...r.vert, tgt: 'TGT' } : popVert(r);
    if (r.kind == 'toss') {
      // the long level ingress is cut to a short stub (the pull-up and the fall are what matters)
      const ig = spec.segs.find(z => z[0] == 'ingress'),
        pupX = ig ? ig[1][ig[1].length - 1][0] : 0,
        endX = Math.max(...spec.segs.flatMap(z => z[1].map(p => p[0]))),
        stub = Math.max(3000, Math.min(12000, (endX - pupX) * 0.35));
      spec.segs = spec.segs.map(z =>
        z[0] == 'ingress' ? [z[0], z[1].map(p => [Math.max(p[0], pupX - stub), p[1]])] : z
      );
    }
    // OA1 in the side view (small isosceles triangle): top of climb = the pull-down point; PUP; the aim-off point on the ground past the target; the line-up point on the ingress
    const ig0 = spec.segs.find(z => z[0] == 'ingress'),
      igEnd = ig0 && ig0[1][ig0[1].length - 1],
      igStart = ig0 && ig0[1][0];
    let oa1 = null;
    if (oa1Top())
      oa1 =
        st.mode == 'popup'
          ? [spec.marks.find(m => /^PDWN/.test(m[1]))[0][0], r.v.pulldownAltitude]
          : igEnd
            ? [igEnd[0], igEnd[1]]
            : null;
    else oa1 = st.mode == 'popup' ? [r.v.aod, 0] : igStart ? [Math.min(igEnd[0], igStart[0] + 6000), igStart[1]] : null;
    const an = r.an,
      env = an && an.env,
      I = r.impacts,
      dI = env ? [I[0].d, I[I.length - 1].d].filter((d, i, a) => a.indexOf(d) === i) : [];
    const epath =
      env && an.path ? an.path.filter(q => q.t <= an.window.to && q.x <= I[I.length - 1].d + env.out + 600) : []; // the escape path, until it has left the zone to the side
    const pts = [
      ...spec.segs.flatMap(z => z[1]),
      ...(oa1 ? [oa1] : []),
      ...(env
        ? [
            [I[0].d - env.out, 0],
            [I[I.length - 1].d + env.out, 0],
            [I[0].d, env.up],
          ]
        : []),
      ...epath.map(q => [q.x, q.alt]),
    ];
    const x0 = Math.min(...pts.map(p => p[0])) - 300,
      x1 = Math.max(400, ...pts.map(p => p[0])),
      top = Math.max(...pts.map(p => p[1])),
      ymax = Math.max(top, r.mat && !r.mat.missing ? Math.min(r.mat.samMax, top * 1.25) : 0) * 1.15;
    let W = 360,
      H,
      sx,
      sy;
    if (r.kind == 'toss') {
      const s = Math.min((620 - 56) / (x1 - x0), (520 - 44) / ymax);
      W = Math.max(360, Math.round((x1 - x0) * s + 56));
      H = Math.max(220, Math.round(ymax * s + 44));
      sx = sy = s;
    } // kept to scale: at most 620 x 520, readable at any length; the view scrolls sideways
    else {
      H = Math.round(Math.min(2000, Math.max(190, (ymax * (W - 56)) / (x1 - x0) + 44)));
      sx = (W - 56) / (x1 - x0);
      sy = (H - 44) / ymax;
    } // the others grow downwards with the page (44 px of free space on the right: the fall is not glued to the border)
    const px = q => 12 + (q - x0) * sx,
      py = q => H - 22 - q * sy;
    const path = a => 'M' + a.map(p => px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1)).join(' L');
    const dot = (p, c, rr = 4) =>
      `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="${rr}" fill="${c}"/>`;
    const tx = (p, t, dx = 6, dy = -6) =>
      `<text x="${(px(p[0]) + dx).toFixed(1)}" y="${(py(p[1]) + dy).toFixed(1)}">${esc(t)}</text>`;
    let grid = '';
    const step = ymax > 24000 ? 8000 : ymax > 12000 ? 4000 : ymax > 6000 ? 2000 : ymax > 2500 ? 1000 : 500;
    for (let a = step; a < ymax; a += step)
      grid += `<path d="M0 ${py(a).toFixed(1)} H${W}"/><text x="3" y="${(py(a) - 2).toFixed(1)}" stroke="none">${fmt(a)}</text>`;
    let bubble = '';
    if (r.mat && !r.mat.missing && r.mat.chord) {
      const m = r.mat,
        a = Math.max(x0, m.chord[0]),
        b = Math.min(x1, m.chord[1]),
        sTop = Math.min(m.samMax, (ymax / 1.15) * 1.1);
      if (b > a)
        bubble = `<rect x="${px(a).toFixed(1)}" y="${py(sTop).toFixed(1)}" width="${(px(b) - px(a)).toFixed(1)}" height="${Math.max(2, py(m.samMin) - py(sTop)).toFixed(1)}" rx="10" fill="#ff5d5d" fill-opacity=".14" stroke="#ff5d5d" stroke-dasharray="5 4"/><text x="${(px(a) + 8).toFixed(1)}" y="${(py(sTop) + 13).toFixed(1)}" fill="#ff9d9d" font-size="10" font-family="system-ui,sans-serif">SAM WEZ ${fmt(m.samMin)}–${fmt(m.samMax)} ft</text>`;
    }
    // the maximum fragment envelope of the graph (frag.js) around an impact, in the attack's vertical plane
    const domePath = d => {
      const a = env.model ? fragOutline(env.model, 0).map(([x, z]) => [d + x, z]) : [];
      return a.length ? path(a) + ' Z' : '';
    };
    const dome = env
      ? dI
          .map(
            d =>
              `<path d="${domePath(d)}" fill="#ff5d5d" fill-opacity=".09" stroke="#ff5d5d" stroke-width="1.4" stroke-dasharray="2 3"/>`
          )
          .join('') +
        `<g fill="#ff8a8a" font-size="10" font-family="system-ui,sans-serif">${tx([dI[0], env.up], 'lethal ' + Math.round(env.t) + ' s', -14, -6)}</g>`
      : '';
    // the lethal zone of the other attack across this attack's line (x along the attack heading from the target), and where this attack enters it
    let gdome = '',
      gin = '';
    if (GHO && GHO.env && GHO.r && GHO.r.impacts && GHO.r.impacts.length && r.target && isFinite(r.v.attackHeading)) {
      const A = (r.v.attackHeading * Math.PI) / 180,
        ux = Math.sin(A),
        uy = Math.cos(A),
        T = r.target,
        ge = GHO.env,
        GI = GHO.r.impacts,
        along = p => (p.e - T.e) * ux + (p.n - T.n) * uy,
        side = p => Math.abs((p.e - T.e) * uy - (p.n - T.n) * ux);
      [GI[0], GI[GI.length - 1]]
        .filter((q, i, a) => a.indexOf(q) === i)
        .forEach(q => {
          const h = side(q),
            d = along(q),
            a = ge.model ? fragOutline(ge.model, h).map(([x, z]) => [d + x, z]) : [];
          if (a.length)
            gdome += `<path d="${path(a)} Z" fill="#f0c040" fill-opacity=".08" stroke="#f0c040" stroke-width="1.4" stroke-dasharray="2 3"/>`;
        });
      const lead = grpOf(st.inMode).who == 'lead',
        mine = lead ? 'A' : 'B',
        hotP = DC ? (lead ? DC.hotA : DC.hotB) : [];
      // the part of this path inside the other's fragments if the two flew together: what the spacing keeps it out of
      if (hotP && hotP.length) {
        const runs = [];
        let cur = [];
        hotP.forEach((p, i) => {
          if (i && dist(p, hotP[i - 1]) > 600) {
            runs.push(cur);
            cur = [];
          }
          cur.push([along(p), p.alt]);
        });
        runs.push(cur);
        gin += runs
          .filter(r => r.length > 1)
          .map(
            r =>
              `<path d="${path(r)}" fill="none" stroke="#ff9f1c" stroke-width="4" stroke-linecap="round" opacity=".85"><title>Inside the fragments of the ${lead ? secName() : 'lead'} if the two flew together: the spacing keeps you out</title></path>`
          )
          .join('');
      }
      // the point that sets the spacing, when it is on this path
      const by = DC && DC.by;
      if (by && !by.air && by.me == mine && by.p) {
        const x = along(by.p);
        if (x >= x0 && x <= x1 && by.p.alt <= ymax)
          gin += `<circle cx="${px(x).toFixed(1)}" cy="${py(by.p.alt).toFixed(1)}" r="7" fill="none" stroke="#ff9f1c" stroke-width="2.2"><title>This point sets the spacing: +${DC.spacing} s after the lead</title></circle><text x="${(px(x) + 10).toFixed(1)}" y="${(py(by.p.alt) - 8).toFixed(1)}" fill="#ffb55c" font-size="11" font-weight="700" font-family="system-ui,sans-serif">+${DC.spacing} s</text>`;
      }
    }
    const seg4 = (d, k) =>
      `<path d="${d}" fill="none" stroke="${PH[k][1]}" stroke-width="2.6"${PH[k][2] ? ` stroke-dasharray="${PH[k][2]}"` : ''}/>`;
    return `<div class="wpvs"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="wpv"${r.kind == 'toss' && W > 360 ? ' data-wide' : ''} role="img" aria-label="Side profile of the attack">
      <rect width="${W}" height="${H}" rx="6" fill="#0f1419"/><path d="M0 ${py(0)} H${W}" stroke="#2a3441"/><g stroke="#2a3441" stroke-dasharray="2 4" fill="#8b98a8" font-size="9" font-family="system-ui,sans-serif">${grid}</g>
      ${bubble}${gdome}${dome}${spec.segs.map(([k, a]) => seg4(path(a), k)).join('')}${epath.length > 1 ? seg4(path(epath.map(q => [q.x, q.alt])), 'escape') : ''}${an && an.viol && !an.viol.ground ? `<circle cx="${px(an.viol.x).toFixed(1)}" cy="${py(an.viol.alt).toFixed(1)}" r="7" fill="none" stroke="#ff5d5d" stroke-width="2.2"><title>Inside the lethal zone ${an.viol.t.toFixed(1)} s after the release</title></circle>` : ''}${gin}${spec.marks.map(m => dot(m[0], m[2])).join('')}${oa1 ? `<path d="M${px(oa1[0]).toFixed(1)} ${(py(oa1[1]) - 7).toFixed(1)} l5.5 12 h-11z" fill="#a78bfa" stroke="#111" stroke-width="1.5"><title>OA1</title></path>` : ''}<path d="M${px(0)} ${py(0) - 6} l6 6 l-6 6 l-6 -6z" fill="#fff" stroke="#111" stroke-width="1.5"/>
      <g fill="#9aa8b8" font-size="10" font-family="system-ui,sans-serif">${spec.marks.map(m => tx(m[0], m[1], m[3] === undefined ? 6 : m[3], m[4] === undefined ? -6 : m[4])).join('')}${oa1 ? tx(oa1, 'OA1', 8, 14) : ''}${tx([0, 0], spec.tgt, -70, -8)}</g></svg></div>${legend(legendKeys(false))}`;
  }

  // ---------- NAV OFFSETS ----------
  const elv = k => (el && has(el[k]) ? el[k] : undefined);
  // the game loads the pull-up point and the OA rows only on the route steerpoints 1-24 (25 is the bullseye): the DTC entry writes the NAV OFFSETS, the Manual entry never does
  const routeOk = () => !!(ctx && ctx.t && ctx.t.group == 'Flight plan' && ctx.t.stpt >= 1 && ctx.t.stpt <= 24);
  const writable = () => st.src == 'dtc' && routeOk();
  const OFFKEY = /^(VIP|VIPPUP|VRP|VRPPUP|OA[12]-\d+)$/,
    zeroRow = k => (/^OA/.test(k) ? '0,0,0' : '0,0,0,0');
  const held = k => {
    const o = navRow(deps.G('NAV OFFSETS', k, ''), !k.startsWith('OA'));
    return [o.brg, o.rng, o.elev].some(v => +v);
  };
  // every offset row of the DTC, but the ones kept, that still holds a value: a new attack replaces the earlier ones (and the game could not show them on another steerpoint)
  const toClear = keep =>
    [
      ...new Set(
        deps
          .lines()
          .filter(l => l.s == 'NAV OFFSETS' && OFFKEY.test(l.k) && !keep.includes(l.k))
          .map(l => l.k)
      ),
    ].filter(held);
  const plan = () => {
    const rows = writable() ? Object.values(offsets()) : [];
    return { rows, clr: toClear(rows.map(x => x.key)) };
  };
  function offsets() {
    const r = res,
      sp = ctx.stPos,
      o = {},
      vip = st.ref == 'vip',
      n = ctx.sp ? ctx.sp.n : 0;
    const mo = deps.offs && sp && n ? deps.offs.get(n, ctx.tPos) : {},
      mp = k => (mo[k] ? { n: mo[k].n, e: mo[k].e } : null),
      mal = (k, d) => (mo[k] && mo[k].alt !== undefined ? mo[k].alt : d); // points placed on the Map page replace the computed ones
    o.pup = {
      key: vip ? 'VIPPUP' : 'VRPPUP',
      label: vip ? 'VIP → PUP' : 'TGT → PUP',
      row: offsetRow(ctx.ref, r.pup),
      stpt: n,
      alt: elv('pup'),
    };
    // a loft without a turn also gets its VRP (the line-up point): a reference the pilot can use
    o.ref = vip
      ? { key: 'VIP', label: 'VIP → TGT', row: offsetRow(ctx.vipPos, ctx.tPos), stpt: n, alt: elv('tgt') }
      : { key: 'VRP', label: 'TGT → VRP', row: offsetRow(ctx.tPos, r.vrp), stpt: n, alt: elv('vrp') };
    const MP = ' · map';
    if (mp(vip ? 'vipPup' : 'vrpPup'))
      o.pup = {
        ...o.pup,
        label: o.pup.label + MP,
        row: offsetRow(vip && mp('vip') ? mp('vip') : ctx.ref, mp(vip ? 'vipPup' : 'vrpPup')),
        alt: mal(vip ? 'vipPup' : 'vrpPup', o.pup.alt),
      };
    if (vip ? mp('vip') : mp('vrp'))
      o.ref = vip
        ? { key: 'VIP', label: 'VIP → TGT' + MP, row: offsetRow(mp('vip'), ctx.tPos), stpt: n, alt: elv('tgt') }
        : {
            key: 'VRP',
            label: 'TGT → VRP' + MP,
            row: offsetRow(ctx.tPos, mp('vrp')),
            stpt: n,
            alt: mal('vrp', elv('vrp')),
          };
    if (sp) {
      // OA1 follows the button of the attack profile: the top of the manoeuvre (pop-up: pull-down point at the pull-down altitude, HADB / TOSS: the PUP at the ingress altitude, MSL) or the other reference
      const tg = elv('tgt') || 0,
        igE = r.vert && r.vert.segs.find(z => z[0] == 'ingress'),
        pupAlt = igE ? igE[1][igE[1].length - 1][1] : r.v.ingressAltitude;
      o.oa1 = oa1Top()
        ? {
            key: 'OA1-' + n,
            label: 'OA1 · STPT ' + n + (st.mode == 'popup' ? ' · top of climb' : ' · PUP'),
            row: offsetRow(sp, oa1Pos(r)),
            alt: (st.mode == 'popup' ? r.v.pulldownAltitude : pupAlt) + tg,
          }
        : {
            key: 'OA1-' + n,
            label: 'OA1 · STPT ' + n + (st.mode == 'popup' ? ' · aim-off' : ' · line-up'),
            row: offsetRow(sp, r.oa),
            alt: elv('oa'),
          };
      if (r.oa2) o.oa2 = { key: 'OA2-' + n, label: 'OA2 · STPT ' + n, row: offsetRow(sp, r.oa2), alt: r.oa2Alt };
      if (mp('oa1'))
        o.oa1 = {
          key: 'OA1-' + n,
          label: 'OA1 · STPT ' + n + MP,
          row: offsetRow(sp, mp('oa1')),
          alt: mal('oa1', o.oa1 ? o.oa1.alt : elv('oa')),
        };
      if (mp('oa2'))
        o.oa2 = {
          key: 'OA2-' + n,
          label: 'OA2 · STPT ' + n + MP,
          row: offsetRow(sp, mp('oa2')),
          alt: mal('oa2', o.oa2 ? o.oa2.alt : r.oa2Alt),
        };
    }
    // elevations (the manual: enter 0 to put an offset at ground level): an OA that sits on another point of the attack gets 0 ft, and no row has a negative elevation
    const P = {
        oa1: mp('oa1') || (sp ? oa1Pos(r) : null),
        oa2: mp('oa2') || r.oa2,
        ref: vip ? mp('vip') || ctx.vipPos : mp('vrp') || r.vrp,
        pup: mp(vip ? 'vipPup' : 'vrpPup') || r.pup,
        tgt: ctx.tPos,
      },
      same = (a, b) => !!a && !!b && dist(a, b) < 100;
    ['oa1', 'oa2'].forEach(k => {
      if (o[k] && Object.keys(P).some(x => x != k && same(P[k], P[x]))) o[k].alt = 0;
    });
    Object.values(o).forEach(x => {
      if (x.alt !== undefined && x.alt < 0) x.alt = 0;
    });
    return o;
  }

  // HADB / TOSS drawing with the VRP selected: the VRP is shown (on the point that is already drawn there, or on its own)
  function vrpMark(d, r) {
    if (st.ref != 'vrp' || !r.draw || !r.vrp) return d;
    const i = d.marks.findIndex(m => dist(m[0], r.vrp) < 50);
    if (i < 0) return { ...d, marks: [...d.marks, [r.vrp, 'VRP', '#f0b040', 'big']] };
    if (/VRP/.test(d.marks[i][1])) return d;
    return { ...d, marks: d.marks.map((m, j) => (j === i ? [m[0], m[1] + ' · VRP', ...m.slice(2)] : m)) };
  }
  // the drawing for the Map page's DTC filter: phases with their colours, in the page's own north / east feet (the caller converts)
  // the attack of the last attack mode (Pop-up, HADB or TOSS), for the Target tab: the drawing (feet), its target, the headings, the speed, the fuze
  function attack() {
    const m0 = st.mode;
    if (!ATK.includes(st.mode)) st.mode = ATK.includes(st.amode) ? st.amode : 'popup';
    try {
      const s = spec();
      if (!s || !res || !ctx.t) return null;
      const v = res.v || {},
        sel = bombSel();
      return {
        segs: s.segs,
        t: { n: ctx.t.n, e: ctx.t.e, name: ctx.t.name, stpt: ctx.t.stpt },
        mode: (MODES.find(m => m[0] == st.mode) || ['', ''])[1],
        hdg: v.attackHeading,
        egr: v.egressHeading,
        spd: v.releaseSpeed || v.ingressSpeed,
        rel: v.releaseAltitude,
        fz: st.fz.mode == 'c2' ? 'C2 · ' + st.fz.c2ba + ' ft' : st.fz.ftype,
        wpn: sel && (sel.loadout || sel.manual) ? sel.label : '',
        // the impacts of the stick (feet), the lethal radius around the first and the last, the CBU footprints: as on the map of this page
        impacts: (res.impacts || []).map(q => ({ n: q.n, e: q.e })),
        leth:
          res.an && res.an.env && res.impacts && res.impacts.length
            ? {
                r: res.an.env.out,
                pts: [res.impacts[0], res.impacts[res.impacts.length - 1]].filter((q, i, a) => a.indexOf(q) === i),
              }
            : null,
        cbu: (() => {
          const cb = cbuInfo(res);
          return cb
            ? { r: cb.diameter / 2, pts: (res.impacts || []).map(q => project(q, v.attackHeading + 180, cb.shortBy)) }
            : null;
        })(),
      };
    } catch (e) {
      return null;
    } finally {
      st.mode = m0;
    }
  }
  function spec() {
    try {
      compute();
    } catch (e) {
      return null;
    }
    if (!res || res.error || !ctx.t) return null;
    const r = res,
      vip = st.ref == 'vip' ? ctx.vipPos : null,
      D = oa1Plan(r.draw || popupDraw(r, vip), r);
    const gh = ghost();
    return {
      ghost: gh ? gh.segs.filter(z => z[0] != 'fall').map(z => z[1]) : [],
      segs: D.segs.map(([k, pts]) => ({ k, color: PH[k][1], dash: PH[k][2], pts })),
      marks: [
        ...D.marks.map(m => ({ p: m[0], label: m[1], color: m[2], r: m[3] == 'big' ? 6 : 4 })),
        { p: r.target, label: ctx.t.name || 'Target', color: '#fff', r: 6, perm: true },
      ],
    };
  }
  // what the datacard shows in its Delivery section (OA1 / OA2 values come from the NAV OFFSETS rows)
  function cardInfo() {
    const r = res,
      v = r.v,
      side = v.side == 'left' ? 'L' : 'R',
      c = {
        mode: st.mode,
        ref: st.ref,
        label:
          st.mode == 'toss' && st.mat.on
            ? 'MAT TOSS'
            : { popup: 'POP-UP T' + v.profileType, hadb: 'HADB', toss: 'TOSS' }[st.mode],
      };
    c.ia = fmt(v.ingressAltitude);
    c.is = fmt(v.ingressSpeed || v.releaseSpeed);
    c.rh = fmt(v.releaseAltitude);
    c.rs = fmt(v.releaseSpeed);
    c.ah = hm(v.attackHeading) + '°';
    if (st.mode == 'popup')
      Object.assign(c, {
        ph: hm(v.pullHeading) + '°',
        cl: Math.round(v.climbAngle) + '°',
        pd: fmt(v.pulldownAltitude),
        tn: side + ' ' + v.turnG + 'G',
        th: 'TGT visible',
      });
    else if (st.mode == 'hadb')
      Object.assign(c, {
        ph: hm(v.ingressHeading) + '°',
        cl: 'DA ' + v.diveAngle + '°',
        pd: 'AOD ' + (v.aod / FT_NM).toFixed(1),
        tn: side + ' ' + v.turnG + 'G',
        th: 'TGT not visible',
      });
    else
      Object.assign(c, {
        ph: hm(r.hasTurn ? v.ingressHeading : v.attackHeading) + '°',
        cl: 'RA ' + v.releaseAngle + '°',
        pd: 'PUL ' + (v.pullDistance / FT_NM).toFixed(1),
        tn: r.hasTurn ? side + ' ' + v.angleOff + '°' : 'none',
        th: 'TGT not visible',
      });
    c.src = st.src;
    c.stpt = ctx.sp ? ctx.sp.n : 0; // the steerpoint of the attack: the OA1 / OA2 rows are read from the DTC with it
    if (st.src == 'man' && ctx.sp) {
      const O = offsets(),
        f = x =>
          x ? [String(x.row.brg), String(x.row.rng), String(Math.round(x.alt !== undefined ? x.alt : 0))] : null;
      c.man = { stpt: ctx.sp.n, dv: f(O.ref), dp: f(O.pup), oa: f(O.oa1), ob: f(O.oa2) };
    }
    return c;
  }
  // zero every offset row of the DTC (a mission that needs none)
  const mapHas = () => !!deps.offs && Object.keys(deps.offs.all()).length > 0;
  async function clearAll() {
    if (!deps.lines().some(l => l.s == 'NAV OFFSETS')) {
      if (mapHas()) deps.offs.clearAll();
      await deps.alert(deps.lines().length ? 'This DTC has no NAV OFFSETS section.' : 'No DTC: open one first.', 'bad');
      return;
    }
    const clr = toClear([]);
    clr.forEach(k => wr('NAV OFFSETS', k, zeroRow(k)));
    // the points placed on the Map page go too
    if (mapHas()) deps.offs.clearAll();
    st.applied = null;
    st.cleared = clr;
    st.card = null;
    save();
    draw(true);
    if (clr.length && deps.applied) deps.applied();
  }

  async function apply() {
    // the DTC is the one of the seat chosen on the Datacard: its group's set is shown, then written
    const tw = applyWho(),
      am = st.inMode;
    if (ATK.includes(am) && st.mode === am && grpOf(am).who !== tw) {
      switchWho(tw);
      fit = true;
      save();
      draw(false);
    }
    if (!res || res.error || !ctx.sp) return;
    // the Manual entry writes no offsets to the DTC, so it does not need the section: Apply then gives the datacard its values
    const nav = deps.lines().some(l => l.s == 'NAV OFFSETS');
    if (!nav && st.src == 'dtc') {
      await deps.alert(deps.lines().length ? 'This DTC has no NAV OFFSETS section.' : 'No DTC: open one first.', 'bad');
      return;
    }
    const agb = deps.lines().some(l => l.s == 'FCC_AGB');
    const { rows, clr } = plan(),
      tell = [];
    // VIP / VRP rows (and their PUP rows) are "steerpoint, bearing, range, elevation" as the game and WDP write them; OA rows are "bearing, range, elevation" and carry the steerpoint in their name.
    // (Older versions of this program wrote bearing, range, elevation, steerpoint: still read.)
    const old = x => navRow(deps.G('NAV OFFSETS', x.key, ''), !x.key.startsWith('OA'));
    const busy = rows.filter(
      x =>
        exists('NAV OFFSETS', x.key) &&
        (x.stpt ? old(x).stpt === x.stpt || !old(x).stpt : true) &&
        [old(x).brg, old(x).rng].some(v => +v)
    );
    const other = rows.filter(x => x.stpt && exists('NAV OFFSETS', x.key) && old(x).stpt && old(x).stpt !== x.stpt);
    const what = [...new Set([...busy, ...other])].map(x => x.key);
    if (
      (busy.length || other.length || agb) &&
      !(await deps.confirm(
        (what.length
          ? 'Replace the values now in ' +
            what.join(', ') +
            (other.length ? ' (' + other.map(x => x.key).join(', ') + ' belong to another steerpoint)' : '')
          : 'Write the NAV OFFSETS') +
          (agb
            ? (what.length ? ', and' : ' and') +
              ' the fuze, burst altitude and stick settings of bomb profile ' +
              st.fz.prof
            : '') +
          '?'
      ))
    )
      return;
    rows.forEach(x => {
      const o = old(x),
        el = x.alt !== undefined ? String(Math.round(x.alt)) : o.elev === undefined || o.elev === '' ? '0' : o.elev,
        v = x.stpt
          ? [String(x.stpt), String(x.row.brg), String(x.row.rng), el]
          : [String(x.row.brg), String(x.row.rng), el];
      wr('NAV OFFSETS', x.key, v.join(','));
      tell.push(x.key);
    });
    clr.forEach(k => wr('NAV OFFSETS', k, zeroRow(k)));
    if (nav && deps.G('NAV OFFSETS', 'Modesel', '') !== st.ref) {
      wr('NAV OFFSETS', 'Modesel', st.ref);
      tell.push('Modesel');
    }
    if (agb) (tell.push('Profile ' + st.fz.prof + ' (fuze, stick)'), fzWrite());
    st.applied = tell;
    st.cleared = clr;
    st.card = cardInfo();
    save();
    draw(true);
    if (deps.applied) deps.applied();
  }
  // does Apply have anything to write? (the rows and settings it would write, compared with the DTC)
  function pending() {
    if (!res || res.error || !ctx || !ctx.sp) return false;
    const nav = deps.lines().some(l => l.s == 'NAV OFFSETS');
    if (!nav && st.src == 'dtc') return false;
    // the datacard is out of date (another attack, another setting, the offsets were cleared): Apply has something to write even when the DTC already holds the rows
    try {
      if (JSON.stringify(cardInfo()) !== JSON.stringify(st.card)) return true;
    } catch (e) {
      return true;
    }
    if (!nav) return false;
    const w = [];
    dry = w;
    try {
      const P = plan();
      P.clr.forEach(k => wr('NAV OFFSETS', k, zeroRow(k)));
      P.rows.forEach(x => {
        const o = navRow(deps.G('NAV OFFSETS', x.key, ''), !!x.stpt),
          el = x.alt !== undefined ? String(Math.round(x.alt)) : o.elev === undefined || o.elev === '' ? '0' : o.elev;
        wr(
          'NAV OFFSETS',
          x.key,
          (x.stpt
            ? [String(x.stpt), String(x.row.brg), String(x.row.rng), el]
            : [String(x.row.brg), String(x.row.rng), el]
          ).join(',')
        );
      });
      wr('NAV OFFSETS', 'Modesel', st.ref);
      if (deps.lines().some(l => l.s == 'FCC_AGB')) fzWrite();
    } catch (e) {
      return true;
    } finally {
      dry = null;
    }
    const nz = v => String(v).replace(/\s+/g, '');
    return w.some(([sec, k, v]) => !exists(sec, k) || nz(deps.G(sec, k, '')) !== nz(v));
  }
  const btn = () => {
    if (deps.applyBtn) {
      const m = st.inMode,
        tw = applyWho(),
        other = ATK.includes(m) && st.mode === m && grpOf(m).who !== tw;
      let p = false;
      try {
        p = other ? !!withGroup(tw, () => pending()) : pending();
      } catch (e) {
        p = true;
      }
      deps.applyBtn.classList.toggle('nil', !p);
      deps.applyBtn.textContent =
        'Apply to the DTC' +
        (ATK.includes(m) && grpOf(m).split ? (tw == 'elem' ? ' (' + secName() + ')' : ' (lead)') : '');
    }
    if (deps.clearBtn) {
      let n = false;
      try {
        n = (!!deps.lines().some(l => l.s == 'NAV OFFSETS') && toClear([]).length > 0) || mapHas();
      } catch (e) {
        /* none */
      }
      deps.clearBtn.classList.toggle('nil', !n);
    }
  };

  // ---------- page ----------
  const seg = (f, opts, cur) =>
    `<span class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-set="${f}" data-v="${v}">${l}</button>`).join('')}</span>`;
  // distances are shown in nm (the engine keeps feet): these sliders move in nm, altitudes stay in ft
  const NM = { vrpToPup: [0.5, 10, 0.1], egressRange: [0.5, 15, 0.1], oa1ToVip: [0.5, 10, 0.1] };
  const slider = (f, label, unit, dec) => {
    if (NM[f]) {
      const [a, b, q] = NM[f],
        v = Math.round((cur()[f] / FT_NM) * 10) / 10;
      return `<div class="slr"><label>${label}</label><input type="range" min="${a}" max="${b}" step="${q}" value="${v}" data-sl="${f}"><em data-em="${f}">${v.toFixed(1)} nm</em></div>`;
    }
    const [a, b, s] = lim(f),
      fine = f == 'heading' || f == 'egressHeading'; // headings: a number box beside the slider for exact values
    return `<div class="slr"><label>${label}</label><input type="range" min="${a}" max="${b}" step="${s}" value="${cur()[f]}" data-sl="${f}">${fine ? `<span class="wnumw"><input type="number" class="wnum" data-slnum="${f}" min="${a}" max="${b}" step="1" value="${cur()[f]}">°</span>` : `<em data-em="${f}">${fmt(cur()[f], dec)}${unit}</em>`}</div>`;
  };
  const fzSlider = k => {
    const [a, b, q] = FZ[k],
      v = st.fz[k],
      ba = k == 'c2ba';
    return `<div class="slr"><label>${k == 'c2ba' ? 'Burst alt.' : 'AD' + (k.endsWith('2') ? '2' : '1')}</label><input type="range" min="${a}" max="${b}" step="${q}" value="${v}" data-fz="${k}"><em data-fzem="${k}">${ba ? fmt(v) + ' ft' : v.toFixed(2) + ' s'}</em></div>`;
  };
  const sliderOf = f =>
    SL.find(x => x[0] === f) ||
    (f == 'heading'
      ? [f, 'Heading', '°', 0]
      : f == 'egressAltitude'
        ? [f, 'Egress alt.', ' ft', 0]
        : [f, 'Egress range', ' nm', 1]);

  // lethality, minimum acceptable release altitude and the guided safe escape (TO 1F-16CMAM-34-1-1 BMS 4.2.15 and 4.2.16)
  function safetyRows(v) {
    const an = res && res.an;
    if (!an) return '';
    const k = (a, b, bad) => `<span>${a}</span><b class="${bad ? 'wbad' : ''}">${b}</b>`,
      env = an.env,
      sel = an.sel,
      m = an.mra;
    let h = k(
      'BOMB',
      esc(sel.label) +
        (sel.loadout ? '<br>from the loadout' : sel.manual ? '<br>chosen' : '') +
        (sel.skipped && sel.skipped.length ? '<br>not covered: ' + esc(sel.skipped.join(', ')) : '')
    );
    if (env)
      h += k(
        'LETHALITY',
        `radius ${fmt(env.out)} ft, up to ${fmt(env.up)} ft high<br>the fragments fall for ${Math.round(env.t)} s after the last impact${env.approx ? '<br>interpolated between the 500 and 2000 lb classes: approximate' : ''}`
      );
    if (m && m.value != null)
      h += k(
        'MRA',
        `${fmt(m.value)} ft AGL, the highest of:<br>fragmentation area ${m.frag == null ? 'not calculated' : fmt(m.frag) + ' ft AGL'}<br>dive recovery ${fmt(m.recovery)} ft AGL<br>arming delay ${fmt(m.arming)} ft AGL${an.below ? '<br>the release altitude is BELOW it' : ''}`,
        an.below
      );
    if (an.far)
      return (
        h +
        k(
          'ESCAPE',
          `Release ${nm2(an.far.range)} from the target: ${an.far.ok ? 'outside' : 'INSIDE'} the ${fmt(env.out)} ft radius<br>Turn away after the release; no dive recovery is needed`,
          !an.far.ok
        )
      );
    if (st.mode == 'toss') return h;
    const man = maneuvers(v.diveAngle);
    if (!man.length) return h + k('ESCAPE', `No planned safe escape above a 60° dive.`, true);
    h += k(
      'ESCAPE',
      `Straight on for ${PULL_DELAY} s after the last release<br>then pull ${PULL_G} G in 2 s toward the horizon, MIL power<br>CLM: keep ${PULL_G} G to a 20° climb, relax to 30°${man.includes('Turning') ? '<br>Turning (dives to 20°): roll to 60–85° bank, pull ' + PULL_G + ' G until 60° off the release heading' : ''}${man.includes('Level turning') ? '<br>Level turning (to 25°): wings-level pull, then a level pull until 60° off the release heading' : ''}`
    );
    if (env)
      h += an.viol
        ? k(
            'CHECK',
            an.viol.ground
              ? 'The climb-out path reaches the ground.'
              : `CLM path: INSIDE the lethal zone ${an.viol.t.toFixed(1)} s after the release<br>${fmt(Math.abs(an.viol.x))} ft ${an.viol.x < 0 ? 'before' : 'past'} the target, ${fmt(an.viol.alt)} ft AGL<br>Release higher${m && m.value ? ' (at least ' + fmt(m.value) + ' ft AGL)' : ''}`,
            true
          )
        : k('CHECK', 'CLM path: clear of the lethal zone.');
    return h;
  }
  // what the fuze delays mean for this drop: has the bomb fallen long enough to be armed, and where / how high is it then
  function fuzeCard(v, f, turn) {
    const row = (lab, a) =>
      `<span>${lab}</span><b class="${a.armed ? '' : 'wbad'}">${a.armed ? 'armed after ' + a.delay.toFixed(2) + ' s<br>' + fmt(a.alt) + ' ft AGL<br>' + nm2(a.x) + ' from release' : 'NOT ARMED: ' + a.delay.toFixed(2) + ' s is more than the ' + f.tof.toFixed(1) + ' s fall'}</b>`;
    const gd = f.mode != 'c2' && res && res.an && res.an.sel && res.an.sel.guided;
    let h =
      `<span>FALL TIME</span><b>${f.tof.toFixed(1)} s</b>` +
      (gd ? `<span>GUIDED</span><b>${GUIDED_NOTE}</b>` : row('AD1', f.ad1) + (f.ad2 ? row('AD2', f.ad2) : ''));
    const cb = f.burst && ctx && res ? cbuInfo(res) : null;
    if (f.burst)
      h += `<span>BURST</span><b class="${f.burst.armedFirst ? '' : 'wbad'}">${fmt(f.burst.alt)} ft AGL<br>${f.burst.t.toFixed(1)} s after release<br>${fmt(f.burst.shortBy)} ft short of the impact point${f.burst.armedFirst ? '' : '<br>opens before it is armed'}</b>`;
    if (cb)
      h += `<span>FOOTPRINT</span><b>${fmt(cb.diameter)} ft across (${nm2(cb.diameter)})<br>${Math.round(cb.effect * 100)}% effect<br>${st.fz.cbu}: full effect up to ${fmt(cb.d.lethalHeight)} ft AGL, none above ${fmt(cb.d.ineffectiveHeight)} ft AGL</b>`;
    h += safetyRows(v);
    return `<div class="wcard"><h3>${st.mode == 'popup' ? 'Turn' : 'Heading'} data and fuze ${f.mode == 'c2' ? 'C2 (CBU)' : 'C1'}</h3><div class="kv wkv1">${turn}</div><div class="kv wkv1 wsub">${h}</div></div>`;
  }

  // MAT: what the flight path does against the SAM's WEZ
  function matResult(r) {
    const m = r.mat;
    if (!m) return '';
    if (m.missing)
      return `<div class="wcard"><h3>MAT · SAM WEZ</h3><div class="wperr">MAT needs a PPT with a range ring: add a pre-planned threat to the DTC (Data Cartridge page, or the Map page) and give it its range.</div></div>`;
    const k = (a, b, bad) => `<span>${a}</span><b${bad ? ' class="wbad"' : ''}>${b}</b>`,
      nmf = f => (f / FT_NM).toFixed(1) + ' nm';
    let verdict;
    if (m.hit)
      verdict = k(
        'VERDICT',
        `The flight path crosses the WEZ at ${fmt(m.hit.alt)} ft, ${nmf(Math.abs(m.hit.x))} from the target` +
          (m.short > 0
            ? `; the release is ${nmf(m.short)} INSIDE the ring: the loft does not clear it. Go above ${fmt(m.safeAltitude)} ft or move the release out`
            : ''),
        true
      );
    else
      verdict = k(
        'VERDICT',
        m.aboveSam || m.ingressAbove
          ? 'Clear: the path stays above the SAM top'
          : m.releaseOutside
            ? `Clear: the release is ${nmf(m.releaseMargin)} outside the ring`
            : 'Clear: the path crosses the ring outside the SAM altitudes'
      );
    return `<div class="wcard"><h3>MAT · SAM WEZ</h3><div class="kv">${k('SAM', esc(m.name) + ' · ring ' + nmf(m.ringFt))}${k('SAM ALTITUDES', fmt(m.samMin) + '–' + fmt(m.samMax) + ' ft')}${k('RELEASE TO SAM', nmf(m.releaseToPpt) + (m.releaseOutside ? ' (outside)' : ' (inside)'), !m.releaseOutside)}${k('MIN ALT OVER THE SAM', fmt(m.safeAltitude) + ' ft · ingress ' + fmt(r.v.ingressAltitude) + ' ft', !m.ingressAbove && !!m.hit)}${verdict}</div></div>`;
  }
  function results() {
    const r = res;
    if (!ctx.t) return '<p class="hint">There is no target yet: set a steerpoint in the DTC first.</p>';
    if (!ctx.ref) return '<p class="hint">The route has no steerpoint to use as reference.</p>';
    if (r.error) return '';
    const v = r.v,
      k = (a, b) => `<span>${a}</span><b>${b}</b>`,
      T = el && el.tgt,
      tgtElev = el && has(el.tgt) ? k('TGT ELEV', fmt(el.tgt) + ' ft MSL') : '';
    const O = offsets();
    const rowsH = Object.values(O)
      .map(
        x =>
          `<tr><td>${esc(x.label)}</td><td>${b3(x.row.brg)}°</td><td>${fmt(x.row.rng)}</td><td>${x.alt === undefined ? '' : fmt(x.alt) + ' ft'}</td></tr>`
      )
      .join('');
    const pupTile = `<div class="tile"><span>${st.mode == 'popup' ? 'PUP' : 'VIP'} to target</span><b>${hm(v.pupBearing)}° · ${(v.pupToTarget / FT_NM).toFixed(1)} nm</b></div>`;
    let tiles, kv, turn;
    if (st.mode == 'hadb') {
      tiles =
        pupTile + `<div class="tile"><span>Dive angle / angle off</span><b>${v.diveAngle}° / ${v.angleOff}°</b></div>`;
      kv =
        tgtElev +
        k('INGRESS ALT', msl(v.ingressAltitude, T)) +
        k('RALT', msl(v.releaseAltitude, T)) +
        `<span>MRA</span><b class="${r.an && r.an.below ? 'wbad' : ''}">${fmt(r.an && r.an.mra.value != null ? r.an.mra.value : 0)} ft AGL</b>` +
        k('AOD', nm2(v.aod)) +
        k('RELEASE RNG', nm2(v.releaseRange)) +
        k('WHEEL RNG', nm2(v.wheelRange)) +
        k('RADIUS', nm2(v.turnRadius)) +
        k('TURN ANGLE', Math.round(v.turnAngle) + '°') +
        k('TURN DROP', fmt(v.altitudeLoss) + ' ft') +
        k('TOF STICK', v.tofStick.toFixed(1) + ' s');
      turn =
        k('INGRESS HDG', hm(v.ingressHeading) + '°') +
        k('ATTACK HDG', hm(v.attackHeading) + '°') +
        k('ANGLE OFF', v.angleOff + '°') +
        k('TURN', v.side == 'left' ? 'Left' : 'Right') +
        k('TURN G', v.turnG + ' G') +
        k('OA1 TO VIP', nm2(v.oa1ToVip));
    } else if (st.mode == 'toss') {
      tiles =
        pupTile +
        `<div class="tile"><span>Release angle / pull-up</span><b>${v.releaseAngle}° / ${v.turnG} G</b></div>`;
      kv =
        tgtElev +
        k('RALT', msl(v.releaseAltitude, T)) +
        k('LOWEST RALT', fmt(v.minReleaseAltitude) + ' ft AGL') +
        k('PULL-UP DIST', nm2(v.pullDistance)) +
        k('RELEASE RNG', nm2(v.releaseRange)) +
        k('BOMB TOF', v.timeOfFall.toFixed(1) + ' s') +
        k('TOF STICK', v.tofStick.toFixed(1) + ' s');
      turn =
        k('ATTACK HDG', hm(v.attackHeading) + '°') +
        (r.hasTurn
          ? k('INGRESS HDG', hm(v.ingressHeading) + '°') +
            k('ANGLE OFF', v.angleOff + '°') +
            k('TURN', v.side == 'left' ? 'Left' : 'Right')
          : k('TURN', 'none')) +
        k('OA1 TO VIP', nm2(v.oa1ToVip));
    } else {
      tiles =
        pupTile + `<div class="tile"><span>Dive / climb angle</span><b>${v.diveAngle}° / ${v.climbAngle}°</b></div>`;
      kv =
        tgtElev +
        k('PDWN', msl(v.pulldownAltitude, T)) +
        k('APEX', msl(v.apexAltitude, T)) +
        k('RALT', msl(v.releaseAltitude, T)) +
        `<span>MRA</span><b class="${r.an && r.an.below ? 'wbad' : ''}">${fmt(r.an && r.an.mra.value != null ? r.an.mra.value : v.mra)} ft AGL</b>` +
        k('AOD', nm2(v.aod)) +
        k('MAP', nm2(v.mapDistance)) +
        k('RADIUS', nm2(v.turnRadius)) +
        k('ALTLOSS', fmt(v.altitudeLoss) + ' ft') +
        k('GNDC', fmt(v.groundClearance) + ' ft AGL') +
        k('TOF STICK', v.tofStick.toFixed(1) + ' s');
      turn =
        (v.profileType == 1
          ? k('APPROACH', hm(v.approachHeading) + '°') + k('OFFSET ANG', Math.round(v.offsetAngle) + '°')
          : '') +
        k('CLIMB HDG', hm(v.pullHeading) + '°') +
        k('CLIMB ANG', v.climbAngle + '°') +
        k('ANGLE OFF', v.angleOff + '°') +
        k('ATTACK HDG', hm(v.attackHeading) + '°') +
        k('TURN', v.side == 'left' ? 'Left' : 'Right');
    }
    const fzc = fuzeCard(v, r.fuze, turn);
    return `<div class="wpt">${tiles}</div>${matResult(r)}
    <div class="wcard"><div class="wh"><h3>Vertical envelope</h3><span class="hint">altitudes AGL · distances to scale</span></div>${profile(r)}</div>
    <div class="wcard"><h3>NAV OFFSETS</h3><table class="dt"><tr><th></th><th>Bearing</th><th>Range ft</th><th>Elev.</th></tr>${rowsH}</table>
    <p class="hint wnote">${doneText() || (st.src == 'man' ? 'Manual entry: Apply writes the weapon settings only and clears the offsets of the DTC. Type these rows in the DED.' : 'Apply to the DTC (top right) writes these rows and the weapon settings, and clears the other offsets. Missing rows are created.')}</p></div>
    ${st.src == 'man' ? dedCard(O) : ''}${fzc}
    <div class="wcard"><h3>Results</h3><div class="kv">${kv}</div></div>`;
  }

  // Manual entry: the offsets are typed in the DED in flight (the DTC cannot carry them on a steerpoint outside the route)
  function dedCard(O) {
    const n = ctx.sp ? ctx.sp.n : 0,
      e = x => (x.alt === undefined ? 0 : Math.round(x.alt));
    const li = [
      ...(O.oa1 ? [['OA1', O.oa1]] : []),
      ...(O.oa2 ? [['OA2', O.oa2]] : []),
      ...(O.ref ? [[O.ref.key + ' · TGT ' + n, O.ref]] : []),
      ...(O.pup ? [[O.pup.key.replace('PUP', ' PUP'), O.pup]] : []),
    ];
    return `<div class="wcard wded"><h3>Type this in the DED · STPT ${n}</h3><table class="dt"><tr><th></th><th>BRG</th><th>RNG ft</th><th>ELEV ft</th></tr>${li.map(([a, x]) => `<tr><td>${esc(a)}</td><td>${b3(x.row.brg)}°</td><td>${fmt(x.row.rng)}</td><td>${fmt(e(x))}</td></tr>`).join('')}</table></div>`;
  }

  // the explanations sit in a hover tip beside the card title instead of taking room in the card
  function tipNotes(h) {
    const re = /<p class="hint wnote">([\s\S]*?)<\/p>/;
    for (let m; (m = re.exec(h));) {
      const k = h.lastIndexOf('</h3>', m.index),
        tip = `<span class="wtip" title="${m[1].replace(/"/g, '&quot;')}">ⓘ</span>`;
      h = h.slice(0, m.index) + h.slice(m.index + m[0].length);
      if (k >= 0) h = h.slice(0, k) + tip + h.slice(k);
    }
    return h;
  }

  // Add card at the right of the tabs: the cards of the page shown (an attack, the SEAD or DEAD page of the HARM tab, the pages of the target)
  function wireTabCard(root) {
    const b = root.querySelector('[data-tabcard]');
    if (!b) return;
    b.onclick = () => {
      if (ATK.includes(st.mode)) return addAtkCards(b);
      const p = st.mode == 'tgt' ? deps.tgt : deps.harm;
      if (p && p.addCard) return p.addCard(b);
    };
  }
  function draw(keepLeft) {
    const sub = st.mode == 'harm' ? deps.harm : st.mode == 'tgt' ? deps.tgt : null;
    if (sub) {
      // the HARM shot and the target picture live on their own page objects, shown under the same mode tabs
      if (st.mode != 'harm' && deps.harm) deps.harm.leave();
      if (st.mode != 'tgt' && deps.tgt) deps.tgt.leave();
      detachMap();
      failed = false;
      pend = null;
      document.body.classList.add('onharm');
      if (deps.applyBtn) deps.applyBtn.classList.add('nil');
      const root = deps.root;
      if (!keepLeft || !root.contains(sub.root)) {
        root.innerHTML = `<div class="wtabs" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" class="${st.mode == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}<button type="button" class="btn wtcard" data-tabcard title="Kneeboard cards of the page shown: the attack (Pop-up, HADB, TOSS), the SEAD or DEAD card, or the pages of the target">Add card</button></div>`;
        root.appendChild(sub.root);
        root.querySelectorAll('[data-mode]').forEach(
          b =>
            (b.onclick = () => {
              if (st.mode == b.dataset.mode) return;
              if (ATK.includes(st.mode)) st.amode = st.mode;
              st.mode = b.dataset.mode;
              st.applied = st.cleared = null;
              save();
              sub.leave();
              draw(false);
            })
        );
        wireTabCard(root);
      }
      sub.render();
      return;
    }
    document.body.classList.remove('onharm');
    if (deps.harm) deps.harm.leave();
    if (deps.tgt) deps.tgt.leave();
    compute();
    GHO = ghost();
    DC = deconfNow();
    // the red sliders belong to the kind of conflict they were found for
    const dk = DC && DC.conflict ? DC.frag + '|' + !!DC.close : '';
    if (dk != DCK) SWEEP = {};
    DCK = dk;
    bombData();
    const root = deps.root,
      i = cur();
    btn();
    if (!keepLeft || !root.querySelector('.wpl')) {
      detachMap();
      failed = false;
      pend = null;
      fit = true;
      const T = ctx.T;
      const groups = [...new Set(ctx.RL.map(x => x.group))],
        refOpts = groups
          .map(g => {
            const os = ctx.RL.filter(x => x.group === g)
              .map(
                x =>
                  `<option value="${x.v}"${st.refPt === x.v || (!ctx.RL.some(y => y.v === st.refPt) && x.v === 'tgt') ? ' selected' : ''}>${esc(x.label)}</option>`
              )
              .join('');
            return g ? `<optgroup label="${g}">${os}</optgroup>` : os;
          })
          .join('');
      const tOpts = [...new Set(T.map(x => x.group))]
        .map(
          g =>
            `<optgroup label="${g}">${T.filter(x => x.group === g)
              .map(t => `<option value="${t.v}"${ctx.t && ctx.t.v === t.v ? ' selected' : ''}>${esc(t.label)}</option>`)
              .join('')}</optgroup>`
        )
        .join('');
      const md = st.mode,
        tabs = `<div class="wtabs" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" class="${md == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}<button type="button" class="btn wtcard" data-tabcard title="Kneeboard cards of the page shown: the attack (Pop-up, HADB, TOSS), the SEAD or DEAD card, or the pages of the target">Add card</button></div>`;
      const gq = grpOf(st.inMode),
        one = seatInfo().size <= 1,
        // the rows and buttons of the split fade in when they appear, not each time the panel is drawn again (a click on them would be lost)
        nw = k => (APPEAR[k] ? '' : ' wnew'),
        grpRow = `<div class="wrow wgrp"><label>Flight</label><span class="wgrpb"><button type="button" class="btn g wsplit" data-split${one ? ' disabled' : ''} title="${gq.split ? `Rejoin: the ${secName()}'s attack is dropped, the lead's is the attack of the whole flight again.` : `Split: the ${secName()} gets an attack of its own, the mirror of the lead's to start with. Apply writes the attack of the seat chosen on the Datacard.`}">${gq.split ? 'Rejoin' : st.inMode == 'toss' && tossForm() ? 'Split egress' : 'Split'}</button>${gq.split && gq.who == 'elem' ? `<button type="button" class="btn g wmir${gq.mir ? ' on' : ''}${nw('mir')}" data-mir title="The attack of the lead, mirrored: the same target and reference, the turn on the other side, the attack and the egress mirrored about the heading flown together. Moving a control makes the attack the ${secName()}'s own.">Mirror</button>` : ''}</span></div>${
          gq.split
            ? `<div class="wrow wgrp wshow${nw('show')}"><label>Show</label><span class="seg">${WHO.map(w => `<button type="button" class="w-${w}${gq.who == w ? ' on' : ''}" data-who="${w}" title="${w == 'lead' ? 'The attack of the lead' : `The attack of the ${secName()}`}">${whoName(w)}</button>`).join('')}</span></div>`
            : ''
        }`;
      const refCard = `<div class="wcard"><h3>Reference</h3>${grpRow}
          <div class="wrow"><label>Reference</label>${seg(
            'ref',
            [
              ['vip', 'VIP'],
              ['vrp', 'VRP'],
            ],
            st.ref
          )}</div>
          <div class="wrow"><label>Entry</label>${seg(
            'src',
            [
              ['dtc', 'DTC'],
              ['man', 'Manual'],
            ],
            st.src
          )}<span class="hint">${st.src == 'man' ? 'typed in the DED' : 'written into the DTC'}</span></div>
          ${
            md == 'popup'
              ? `<div class="wrow"><label>Profile</label>${seg(
                  'profileType',
                  [
                    [1, 'Type 1'],
                    [2, 'Type 2'],
                  ],
                  i.profileType
                )}</div>`
              : ''
          }
          <div class="wrow"><label>Target STPT <small>${st.src == 'man' ? '1-99' : '1-24'}</small></label><select data-pick="tgt">${tOpts || '<option>none set</option>'}</select></div>
          ${st.src == 'dtc' && !routeOk() ? `<p class="wwarn">The game loads offsets only on the route steerpoints 1-24 (25 is the bullseye). This point is not one, so Apply writes no offsets: add a route steerpoint, or use Manual.</p>` : st.src == 'dtc' ? '' : `<p class="hint">Any steerpoint 1-99, offsets typed in the DED in flight.</p>`}
          <div class="wrow wvip"${st.ref == 'vip' ? '' : ' hidden'}><label>VIP point</label><select data-pick="refpt">${refOpts}</select></div>
          ${md == 'popup' ? `<div class="wvrp"${st.ref == 'vrp' ? '' : ' hidden'}>${slider('vrpToPup', 'VRP to PUP', ' nm', 1)}</div>` : ''}
          <div class="wrow"><label>Range model</label>${seg(
            'rangeModel',
            [
              ['low_drag', 'Low drag'],
              ['high_drag', 'High drag'],
            ],
            i.rangeModel
          )}</div></div>`;
      const sideRow = lab =>
          `<div class="wrow"><label>${lab}</label>${seg(
            'side',
            [
              ['left', 'Left'],
              ['right', 'Right'],
            ],
            i.side
          )}</div>`,
        gRow = lab =>
          `<div class="wrow"><label>${lab}</label>${seg(
            'turnG',
            [
              [3, '3 G'],
              [4, '4 G'],
              [5, '5 G'],
            ],
            i.turnG
          )}</div>`;
      const sl = list =>
        list
          .map(f => {
            const x = sliderOf(f);
            return slider(f, x[1], x[2], x[3]);
          })
          .join('');
      // Egress: OA2 (off / target / egress) and where the egress goes
      const egrBody = `${slider('egressHeading', 'Egress heading', '°', 0)}${slider('egressRange', 'Egress range', ' nm', 1)}${i.egressAltitude !== undefined && md != 'toss' ? slider('egressAltitude', 'Egress alt.', ' ft', 0) : ''}`;
      const oa2Seg = seg(
        'oa2Mode',
        [
          ['off', 'Off'],
          ['target', 'TGT'],
          ['egress', 'Egress'],
        ],
        i.oa2Mode
      );
      const ge = grpOf(st.inMode),
        egShare = ge.split
          ? `<div class="wrow wegsh"><label>Egress</label><button type="button" class="btn g wegb${ge.egr == 'shared' ? '' : ' on'}${APPEAR.eg ? '' : ' wnew'}" data-egsplit title="${ge.egr == 'shared' ? `Off: one egress for the flight, the ${secName()} goes out to the egress point of the lead and rejoins visually. Press to split it.` : `On: each its own egress (the mirror turns the ${secName()}'s to the other side). Press for one egress for the flight, a visual rejoin.`}">Split</button></div>`
          : '';
      const egressCard =
        md == 'toss'
          ? `<div class="wcard" data-egcard><h3>Egress</h3>${egShare}<div class="woa2"${+i.angleOff > 0 ? ' hidden' : ''}><div class="wrow"><label>OA2</label>${oa2Seg}</div></div>${egrBody}<div class="wegalt"${i.oa2Mode == 'egress' && !(+i.angleOff > 0) ? '' : ' hidden'}>${slider('egressAltitude', 'Egress alt.', ' ft', 0)}</div><p class="hint wnote">The heading flown after the release, drawn from the release point. Without a turn (angle off 0) OA2 can serve the egress.</p></div>`
          : `<div class="wcard" data-egcard><h3>Egress</h3>${egShare}<div class="wrow"><label>OA2</label>${seg(
              'oa2Mode',
              [
                ['off', 'Off'],
                ['target', 'TGT'],
                ['egress', 'Egress'],
              ],
              i.oa2Mode
            )}</div><div class="wegr"${i.oa2Mode == 'egress' ? '' : ' hidden'}>${egrBody}</div></div>`;
      // Weapon settings: the bomb profile of the DTC (fuze, arming, burst altitude) and how the stick is released
      const weaponCard = `<div class="wcard"><h3>Weapon settings</h3>
          <div class="wrow"><label>Pulses</label><input data-num="ripplePulses" type="number" min="1" max="12" value="${i.ripplePulses}"></div>
          ${slider('stickSpacing', 'Spacing', ' ft', 0)}
          <div class="wrow"><label>Release</label>${seg(
            'releaseMode',
            [
              ['single', 'Single'],
              ['pair', 'Pair'],
            ],
            i.releaseMode
          )}</div>
          <div class="wrow"><label>Aiming point</label>${seg(
            'stickMode',
            [
              ['mid', 'Ripple centre'],
              ['start', 'First bomb'],
            ],
            i.stickMode
          )}</div>
          <div class="wrow"><label>Bomb profile</label>${seg(
            'fzprof',
            [
              [1, '1'],
              [2, '2'],
            ],
            st.fz.prof
          )}<span class="hint">Apply writes into it</span></div>
          <div class="wrow"><label>Fuze type</label>${seg(
            'fzftype',
            [
              ['NSTL', 'NSTL'],
              ['NOSE', 'Nose'],
              ['TAIL', 'Tail'],
            ],
            st.fz.ftype
          )}</div>
          <div class="wrow"><label>Sub mode</label>${seg(
            'fzsub',
            [
              ['CCRP', 'CCRP'],
              ['CCIP', 'CCIP'],
            ],
            st.fz.sub
          )}</div>
          <div class="wrow"><label>Fuze</label>${seg(
            'fzmode',
            [
              ['c1', 'C1 · GP / GBU'],
              ['c2', 'C2 · CBU'],
            ],
            st.fz.mode
          )}</div>
          <div class="wfz" data-m="c1"${st.fz.mode == 'c1' ? '' : ' hidden'}><div class="wrow"><label>Bomb</label><select data-pick="bomb" title="Sets the lethal zone, the minimum release altitude and the escape check">${bombOpts()}</select></div><p class="hint wguide"${guided() ? '' : ' hidden'}>${GUIDED_NOTE}</p><div class="wads"${guided() ? ' hidden' : ''}>${fzSlider('c1ad1', 'AD1')}${fzSlider('c1ad2', 'AD2')}</div></div>
          <div class="wfz" data-m="c2"${st.fz.mode == 'c2' ? '' : ' hidden'}><div class="wrow"><label>Weapon</label><select data-pick="cbu">${Object.keys(
            BD
          )
            .map(k => `<option${k === st.fz.cbu ? ' selected' : ''}>${esc(k)}</option>`)
            .join('')}</select></div>${fzSlider('c2ad', 'AD1')}${fzSlider('c2ba', 'Burst alt.')}</div>
          <p class="hint wnote">Arming delay: seconds after release. AD1 is used with the NOSE fuze, AD2 with TAIL or NSTL (TO 4.2.7.6.10). Burst altitude: ft above the target.</p></div>`;
      const PL = ctx.TA.filter(x => x.v.startsWith('ppt:')),
        pDef = PL.find(x => x.ringFt > 0);
      const matCard = `<div class="wcard"><h3>MAT · SAM standoff</h3><div class="wrow"><label>MAT</label><span class="seg">${[
        [0, 'Off'],
        [1, 'On'],
      ]
        .map(
          ([v, l]) =>
            `<button type="button" class="${st.mat.on == v ? 'on' : ''}" data-mat="on" data-v="${v}">${l}</button>`
        )
        .join('')}</span></div>
        ${
          st.mat.on
            ? `<div class="wrow"><label>SAM (PPT)</label><select data-mat="ppt">${PL.map(x => `<option value="${x.v}"${(st.mat.ppt ? st.mat.ppt === x.v : x === pDef) ? ' selected' : ''}>${esc(x.label)}${x.ringFt ? ' · ' + (x.ringFt / FT_NM).toFixed(0) + ' nm' : ' · no ring'}</option>`).join('') || '<option>no PPT in the DTC</option>'}</select></div>
        <div class="slr"><label>SAM max alt.</label><input type="range" min="2000" max="150000" step="500" value="${st.mat.samMax}" data-mat="samMax"><em data-em="samMax">${fmt(st.mat.samMax)} ft</em></div>
        <div class="slr"><label>SAM min alt.</label><input type="range" min="0" max="10000" step="100" value="${st.mat.samMin}" data-mat="samMin"><em data-em="samMin">${fmt(st.mat.samMin)} ft</em></div>`
            : ''
        }
        <p class="hint wnote">SAM altitudes start from the BMS Threat Guide values of the chosen threat (SA-2, SA-3...); move the sliders to set your own.</p><p class="hint wnote">Medium altitude toss: the release is planned outside the SAM's range ring, or above its top, so that the loft carries the bomb to the target. It needs a PPT of the DTC with a range ring (the steerpoint references stay as they are). SAM altitudes are above the target. While MAT is on the ingress altitude goes up to 50 000 ft.</p></div>`;
      const oa1Row = `<div class="wrow"><label>OA1</label><span class="seg">${oa1Names()
        .map(
          ([v, l]) =>
            `<button type="button" class="${(st.oa1 !== 'aim' ? 'top' : 'aim') === v ? 'on' : ''}" data-oa1="${v}">${l}</button>`
        )
        .join('')}</span></div>`;
      let mid;
      if (md == 'hadb')
        mid = `<div class="wcard"><h3>Release</h3>${sl(['diveAngle', 'releaseAltitude', 'releaseSpeed', 'timeOnFinal'])}<p class="hint wnote">High altitude dive bombing: roll in at the VIP, turn and dive onto the target. The ingress altitude is not chosen: release altitude, dive angle and tracking time give it. Speeds are true airspeed.</p></div>
        <div class="wcard"><h3>Ingress and turn</h3>${sl(['ingressSpeed', 'heading'])}${sideRow('Turn to target')}${sl(['angleOff'])}${gRow('Turn G')}${sl(['oa1ToVip'])}${oa1Row}<p class="hint wnote">The ingress heading is the attack heading turned away by the angle off. Fly over OA1 and the VIP, at the VIP turn in with the chosen G.</p></div>${egressCard}${weaponCard}`;
      else if (md == 'toss')
        mid = `<div class="wcard"><h3>Release</h3>${sl(['releaseAngle', 'ingressAltitude', 'ingressSpeed', 'releaseSpeed', 'releaseExtra'])}<p class="hint wnote">Low altitude toss: level at the ingress altitude, at the VIP pull up to the release angle, release, turn away. The release altitude is the lowest the pull-up gives plus the extra climb. Speeds are true airspeed.</p></div>${matCard}
        <div class="wcard"><h3>Line-up and turn</h3>${sl(['heading'])}${sideRow('Turn')}${sl(['angleOff'])}${gRow('Pull-up G')}${sl(['oa1ToVip'])}${oa1Row}<p class="hint wnote">Angle off 0 = no turn before the line-up (then there are no VRP and OA2). Otherwise the ingress comes in turned away by the angle off, VRP is where the turn starts and OA2 lines up with it. OA1 sits on the attack line before the VIP: it is the line-up point, fly toward it before the pull-up. OA2 exists only when the angle off is more than 0: it sits on the ingress leg before the turn. Both are cues to steer by, not mandatory.</p></div>${egressCard}${weaponCard}`;
      else
        mid = `<div class="wcard"><h3>Attack profile</h3>${SL.slice(0, 5)
          .map(x => slider(x[0], x[1], x[2], x[3]))
          .join('')}
          ${sideRow('Turn')}${gRow('Turn G')}
          <div class="wrow"><label>Heading of</label>${seg(
            'headingMode',
            [
              ['attack', 'Attack run'],
              ['ingress', 'Climb'],
            ],
            i.headingMode
          )}</div>${slider('heading', 'Heading', '°', 0)}
          ${oa1Row}
          <p class="hint wnote">Tracking time: seconds to aim after rolling out of the turn, until release. Heading, attack run: the heading of the dive over the target; climb: the heading flown up from the PUP (the attack run is then that heading turned by the angle off).</p></div>${egressCard}${weaponCard}`;
      root.innerHTML = `${tabs}<div class="wpg"><div class="wpl">${refCard}${tipNotes(mid)}</div>
        <div class="wpc"><div class="wcard" id="wpmc"><div class="wh"><h3>Horizontal envelope</h3><button class="btn g" type="button" data-fit>Fit view</button><button class="btn g${deps.isEdit && deps.isEdit() ? ' on' : ''}" type="button" data-edit title="Edit points: the DTC points of the map (PPT, targets, lines) can be dragged only when this is on. Off by default, so a point is not moved by mistake.">Edit points: ${deps.isEdit && deps.isEdit() ? 'On' : 'Off'}</button><button class="btn g" type="button" style="min-width:104px" data-planonly title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">All filters</button></div>
          <div class="wrow wmap"><label>Map layer</label>${seg(
            'mapon',
            [
              ['1', 'On'],
              ['0', 'Off'],
            ],
            st.map.on ? 1 : 0
          )}<div class="slr"${st.map.on ? '' : ' hidden'}><label>Opacity</label><input type="range" min="0" max="100" step="5" value="${st.map.op}" data-mop><em data-em="mop">${st.map.op}%</em></div><span class="hint" id="wpmn"></span><div class="wobj"><label>Objects</label>${seg(
            'objon',
            [
              ['1', 'On'],
              ['0', 'Off'],
            ],
            deps.objectsOn && deps.objectsOn() ? 1 : 0
          )}</div></div>
          <div id="wph" class="wmapbox"></div><div id="wpl1"></div><p class="hint wnote">The layer and the flight plan are those of the Map page. Scroll to zoom, drag to move.</p></div>
          <div class="wcard" id="wpic"><div class="wh"><h3>Impact pattern</h3><span class="hint">distance from the target along the attack line</span></div><div id="wpp"></div></div>
          <div class="wmid" id="wpe" hidden></div></div>
        <div class="wpr" id="wpr"></div></div>`;
      // what is on the panel now: what appears next time fades in, what stays does not
      APPEAR = {
        show: !!root.querySelector('.wshow'),
        mir: !!root.querySelector('.wmir'),
        eg: !!root.querySelector('.wegb'),
      };
      wire(root);
    }
    const rv = root.querySelector('#wpr');
    paint();
    rv.innerHTML = dcCard() + results();
    rv.querySelectorAll('.wpvs').forEach(e => {
      e.scrollLeft = e.scrollWidth;
    });
    const mn = root.querySelector('#wpmn');
    if (mn) mn.textContent = mapNote;
    flagSliders();
    note();
    // the sliders that clear a conflict: worked out once the sliders rest
    clearTimeout(sweepT);
    if (DC && DC.conflict)
      sweepT = setTimeout(() => {
        try {
          const lv0 = dcLevel();
          sweep();
          flagSliders();
          // the card says whether an attack parameter can clear it (red) or only the timing (amber)
          const c = deps.root.querySelector('#wpr .wdc');
          if (c) c.outerHTML = dcCard();
          if (dcLevel() != lv0 && res && !res.error && M) drawMap(res);
        } catch (e) {
          /* none */
        }
      }, 350);
  }
  // sliders whose value breaks a limit turn red (lethal.js flags): a tip says why. The release altitude track shows the minimum acceptable altitude as a red stretch.
  function flagSliders() {
    const root = deps.root,
      an = res && !res.error && res.an;
    const keepD = dcLevel() == 'bad' ? SWEEP : {};
    root.querySelectorAll('.slr.bad').forEach(e => {
      e.classList.remove('bad', 'dcl');
      e.removeAttribute('title');
    });
    // the arrows that stay are kept (no fade at each drawing), the others go
    root.querySelectorAll('.slr .dcd').forEach(e => {
      const i = e.closest('.slr').querySelector('input[data-sl]'),
        d = i && keepD[i.dataset.sl];
      if (!d || e.textContent != (d > 0 ? '▶' : '◀')) e.remove();
    });
    // a conflict with the other group: the sliders that clear it, with the side to move them to
    if (dcLevel() == 'bad')
      Object.entries(SWEEP).forEach(([f, d]) => {
        const i = root.querySelector(`.wpl input[data-sl="${f}"]`),
          row = i && i.closest('.slr'),
          lb = row && row.querySelector('label');
        if (!row || !lb) return;
        row.classList.add('bad', 'dcl');
        row.title = `Conflict with the ${grpOf(st.inMode).who == 'lead' ? secName() : 'lead'}: moving this ${d > 0 ? 'up (▶)' : 'down (◀)'} ${SWEEPK == 'paths' ? 'keeps the two paths apart (the fragments still need the spacing)' : 'clears it'}.`;
        if (!lb.querySelector('.dcd')) lb.insertAdjacentHTML('beforeend', `<i class="dcd">${d > 0 ? '▶' : '◀'}</i>`);
      });
    root.querySelectorAll('input.zone').forEach(i => {
      i.classList.remove('zone');
      i.style.removeProperty('--z');
    });
    const bs = root.querySelector('select[data-pick=bomb]');
    if (bs) bs.innerHTML = bombOpts();
    const gd = guided();
    root.querySelectorAll('.wguide').forEach(e => {
      e.hidden = !gd;
    });
    root.querySelectorAll('.wads').forEach(e => {
      e.hidden = gd;
    });
    if (!an) return;
    const mark = (sel, msg) => {
      const i = root.querySelector(sel),
        row = i && i.closest('.slr');
      if (row) {
        row.classList.add('bad');
        row.title = msg;
      }
    };
    Object.entries(an.flags || {}).forEach(([k, m]) => {
      if (/^ad\d$/.test(k)) mark(`input[data-fz="${fzKeys()[+k.slice(2)]}"]`, m);
      else mark(`input[data-sl="${k}"]`, m);
    });
    const ri = root.querySelector('input[data-sl=releaseAltitude]');
    if (ri && an.mra && an.mra.value != null) {
      const [a, b] = lim('releaseAltitude');
      ri.classList.add('zone');
      ri.style.setProperty('--z', Math.max(0, Math.min(100, ((an.mra.value - a) / (b - a)) * 100)).toFixed(1) + '%');
      ri.title = 'Red: below the minimum acceptable release altitude (' + fmt(an.mra.value) + ' ft)';
    }
  }
  const doneText = () =>
    st.applied
      ? 'Written: ' +
        (st.applied.length ? st.applied.join(', ') : 'nothing') +
        (st.cleared && st.cleared.length ? ' · Cleared: ' + st.cleared.join(', ') : '')
      : st.cleared
        ? 'Cleared: ' + (st.cleared.length ? st.cleared.join(', ') : 'nothing to clear')
        : '';
  const note = () => {
    if (deps.applyNote) deps.applyNote.textContent = doneText();
  };

  function wire(root) {
    const upd = () => {
      save();
      draw(true);
    };
    const sb = root.querySelector('[data-split]');
    if (sb)
      sb.onclick = () => {
        const m = st.inMode,
          g = grpOf(m);
        if (!ATK.includes(m)) return;
        if (g.split) {
          // Rejoin: back to the lead's attack, the element's dropped
          if (g.who == 'elem') leave();
          Object.assign(g, { split: false, who: 'lead', elem: null, mir: false });
          st.inMode = m;
        } else Object.assign(g, { split: true, who: 'lead', elem: null, mir: true });
        st.applied = st.cleared = null;
        fit = true;
        save();
        draw(false);
      };
    const egb = root.querySelector('[data-egsplit]');
    if (egb)
      egb.onclick = () => {
        const g = grpOf(st.inMode);
        g.egr = g.egr == 'shared' ? 'own' : 'shared';
        st.applied = st.cleared = null;
        save();
        draw(false);
      };
    // the element's egress follows the lead's while it is shared: its controls are shown, locked
    {
      const g = ATK.includes(st.inMode) ? grpOf(st.inMode) : null;
      if (g && g.split && g.who == 'elem' && g.egr == 'shared')
        root.querySelectorAll('[data-egcard] input, [data-egcard] button, [data-egcard] select').forEach(e => {
          if (e.closest('.wegsh')) return;
          e.disabled = true;
          e.title = "Joined egress: the lead's egress point";
        });
      // a toss in formation: the element flies the lead's attack, only its egress is its own
      if (g && g.split && g.who == 'elem' && st.inMode == 'toss' && tossForm())
        root.querySelectorAll('.wpl input, .wpl button, .wpl select').forEach(e => {
          if (e.closest('[data-egcard]') || e.closest('.wgrp')) return;
          e.disabled = true;
          e.title = "Toss in formation (angle off 0): the lead's attack, the split is the egress only";
        });
    }
    root.querySelectorAll('[data-who]').forEach(
      b =>
        (b.onclick = () => {
          const g = grpOf(st.inMode);
          if (g.who == b.dataset.who) return;
          switchWho(b.dataset.who);
          st.applied = st.cleared = null;
          fit = true;
          save();
          draw(false);
        })
    );
    const mb = root.querySelector('[data-mir]');
    if (mb)
      mb.onclick = () => {
        const m = st.inMode,
          g = grpOf(m);
        g.mir = !g.mir;
        if (g.mir) {
          // the element's own values make way for the mirror of the lead
          leave();
          enter(m);
        }
        st.applied = st.cleared = null;
        fit = true;
        save();
        draw(false);
      };
    root.querySelectorAll('[data-mat]').forEach(e => {
      const f = e.dataset.mat;
      if (e.tagName == 'BUTTON')
        e.onclick = () => {
          st.mat.on = +e.dataset.v;
          const t = st.toss;
          if (st.mat.on && t.ingressAltitude < st.mat.samMax) t.ingressAltitude = Math.min(50000, st.mat.samMax + 1000);
          if (!st.mat.on && t.ingressAltitude > 2000) t.ingressAltitude = 2000;
          st.applied = st.cleared = null;
          fit = true;
          save();
          draw(false);
        };
      else if (e.tagName == 'SELECT')
        e.onchange = () => {
          st.mat.ppt = e.value;
          st.mat.man = false;
          st.mat.auto = null;
          upd();
          ['samMax', 'samMin'].forEach(f => {
            const i = root.querySelector(`[data-mat="${f}"]`),
              em = root.querySelector(`[data-em="${f}"]`);
            if (i) i.value = st.mat[f];
            if (em) em.textContent = fmt(st.mat[f]) + ' ft';
          });
        };
      else
        e.oninput = () => {
          st.mat[f] = +e.value;
          st.mat.man = true;
          const em = root.querySelector(`[data-em="${f}"]`);
          if (em) em.textContent = fmt(e.value) + ' ft';
          upd();
        };
    });
    root.querySelectorAll('[data-set]').forEach(
      b =>
        (b.onclick = () => {
          const f = b.dataset.set,
            v = b.dataset.v;
          if (f == 'src') {
            st.src = v;
            st.applied = st.cleared = null;
            fit = true;
            save();
            draw(false);
            return;
          }
          if (f == 'objon') {
            if (deps.objectsAll) deps.objectsAll(v == '1');
            b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            return;
          }
          if (f != 'mapon') own();
          if (f == 'mapon') {
            st.map.on = v == '1';
            root.querySelector('.wmap .slr').hidden = !st.map.on;
          } else if (f == 'ref') st.ref = v;
          else cur()[f] = f == 'turnG' || f == 'profileType' ? +v : v;
          b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          if (f == 'oa2Mode') {
            const eg = root.querySelector('.wegr'),
              ea = root.querySelector('.wegalt');
            if (eg) eg.hidden = v != 'egress';
            if (ea) ea.hidden = v != 'egress' || +cur().angleOff > 0;
          }
          if (f == 'ref' || f == 'profileType') fit = true;
          if (f == 'ref') {
            root.querySelector('.wvip').hidden = v != 'vip';
            const vr = root.querySelector('.wvrp');
            if (vr) vr.hidden = v != 'vrp';
          }
          st.applied = st.cleared = null;
          upd();
        })
    );
    root.querySelectorAll('[data-oa1]').forEach(
      b =>
        (b.onclick = () => {
          own();
          st.oa1 = b.dataset.oa1;
          root.querySelectorAll('[data-oa1]').forEach(x => x.classList.toggle('on', x.dataset.oa1 === st.oa1));
          st.applied = st.cleared = null;
          save();
          draw(true);
        })
    );
    // TOSS: with an angle off OA2 is the line-up before the turn, so the egress choice is hidden
    const oa2Vis = () => {
      const e = root.querySelector('.woa2');
      if (e) e.hidden = st.mode == 'toss' && +cur().angleOff > 0;
      const a = root.querySelector('.wegalt');
      if (a) a.hidden = cur().oa2Mode != 'egress' || +cur().angleOff > 0;
    };
    root.querySelectorAll('input[data-sl]').forEach(inp => {
      inp.oninput = () => {
        const f = inp.dataset.sl,
          x = sliderOf(f);
        own();
        cur()[f] = NM[f] ? Math.round(+inp.value * FT_NM) : +inp.value;
        if (f == 'egressHeading') cur().egressTurn = 'set';
        oa2Vis();
        const em = root.querySelector(`[data-em="${f}"]`);
        if (em) em.textContent = fmt(inp.value, x[3]) + x[2];
        const nb = root.querySelector(`[data-slnum="${f}"]`);
        if (nb) nb.value = inp.value;
        st.applied = st.cleared = null;
        upd();
      };
    });
    root.querySelectorAll('input[data-slnum]').forEach(
      nb =>
        (nb.onchange = () => {
          const f = nb.dataset.slnum,
            [a, b] = lim(f);
          let n = Math.round(+nb.value);
          own();
          if (isNaN(n)) n = cur()[f];
          n = Math.min(b, Math.max(a, n));
          nb.value = n;
          cur()[f] = n;
          oa2Vis();
          if (f == 'egressHeading') cur().egressTurn = 'set';
          const sl = root.querySelector(`input[data-sl="${f}"]`);
          if (sl) sl.value = n;
          st.applied = st.cleared = null;
          upd();
        })
    );
    root.querySelectorAll('input[data-fz]').forEach(
      inp =>
        (inp.oninput = () => {
          const k = inp.dataset.fz;
          own();
          st.fz[k] = +inp.value;
          root.querySelector(`[data-fzem="${k}"]`).textContent =
            k == 'c2ba' ? fmt(st.fz[k]) + ' ft' : st.fz[k].toFixed(2) + ' s';
          upd();
        })
    );
    root.querySelectorAll('[data-set=fzmode],[data-set=fzprof],[data-set=fzftype],[data-set=fzsub]').forEach(
      b =>
        (b.onclick = () => {
          own();
          if (b.dataset.set == 'fzmode') st.fz.mode = b.dataset.v;
          else if (b.dataset.set == 'fzftype') st.fz.ftype = b.dataset.v;
          else if (b.dataset.set == 'fzsub') st.fz.sub = b.dataset.v;
          else {
            st.fz.prof = +b.dataset.v;
            fzLoad();
          }
          save();
          draw(false);
        })
    );
    root.querySelectorAll('input[data-mop]').forEach(
      inp =>
        (inp.oninput = () => {
          st.map.op = +inp.value;
          root.querySelector('[data-em=mop]').textContent = inp.value + '%';
          upd();
        })
    );
    root.querySelectorAll('[data-mode]').forEach(
      b =>
        (b.onclick = () => {
          if (st.mode == b.dataset.mode) return;
          if (ATK.includes(st.mode)) st.amode = st.mode;
          st.mode = b.dataset.mode;
          st.applied = st.cleared = null;
          save();
          draw(false);
        })
    );
    const eb = root.querySelector('[data-edit]');
    if (eb) {
      const lab = () => {
        const o = deps.isEdit && deps.isEdit();
        eb.textContent = 'Edit points: ' + (o ? 'On' : 'Off');
        eb.classList.toggle('on', !!o);
      };
      eb.onclick = () => {
        if (deps.toggleEdit) deps.toggleEdit();
        lab();
      };
      lab();
    }
    const po = root.querySelector('[data-planonly]');
    if (po) {
      const LAB = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'];
      po.onclick = () => {
        const m = deps.cyclePlan ? deps.cyclePlan() : 0;
        po.textContent = LAB[m];
      };
      po.textContent = LAB[deps.planMode ? deps.planMode() : 0];
    }
    wireTabCard(root);
    const fb = root.querySelector('[data-fit]');
    if (fb)
      fb.onclick = () => {
        fit = true;
        if (res && !res.error && M) drawMap(res);
      };
    root.querySelectorAll('input[data-num]').forEach(
      inp =>
        (inp.onchange = () => {
          const f = inp.dataset.num,
            n = Math.round(+inp.value);
          if (!(n >= 1 && n <= 24)) {
            inp.value = cur()[f];
            return;
          }
          own();
          cur()[f] = n;
          inp.value = n;
          st.applied = st.cleared = null;
          upd();
        })
    );
    root.querySelectorAll('select[data-pick]').forEach(
      s =>
        (s.onchange = () => {
          own();
          if (s.dataset.pick == 'bomb') {
            st.bomb = s.value;
            save();
            draw(true);
            return;
          }
          if (s.dataset.pick == 'cbu') {
            st.fz.cbu = s.value;
            save();
            draw(true);
            return;
          }
          if (s.dataset.pick == 'refpt') st.refPt = s.value;
          else st.tgt = s.value;
          fit = true;
          st.applied = st.cleared = null;
          upd();
        })
    );
  }

  // the DTC changed (a point moved, renumbered, retyped or removed from the map): keep the chosen target / reference on the same point, then redraw
  const sameAt = (o, l) => l.find(x => Math.abs(x.n - o.n) < 1 && Math.abs(x.e - o.e) < 1);
  const remap = (key, oldL, newL) => {
    if (!key || newL.some(x => x.v === key)) return key;
    const o = oldL.find(x => x.v === key),
      m = o && sameAt(o, newL);
    return m ? m.v : key;
  };
  function refresh() {
    if (st.mode == 'harm') {
      if (deps.harm && deps.harm.refresh) deps.harm.refresh();
      return;
    }
    if (!ctx) return;
    const oldT = ctx.T,
      sig = c => JSON.stringify(c.T.map(x => [x.v, x.label]));
    try {
      const was = sig(ctx);
      ctx = gather();
      st.tgt = remap(st.tgt, oldT, ctx.T);
      st.refPt = remap(st.refPt, oldT, ctx.T);
      compute();
      if (deps.root.closest('.hide')) return;
      draw(sig(ctx) === was);
    } catch (e) {
      /* none */
    }
  }
  // for the tests: what the lethality analysis found and how many lethal circles the map holds
  // Points placed on the Map page go straight into the NAV OFFSETS of the DTC (route steerpoints 1-24, DTC entry): a removed point gives its row back as zeros. The rows are the ones Apply writes for the same points.
  const MROW = {
    oa1: n => 'OA1-' + n,
    oa2: n => 'OA2-' + n,
    vrp: () => 'VRP',
    vrpPup: () => 'VRPPUP',
    vip: () => 'VIP',
    vipPup: () => 'VIPPUP',
  };
  const mapKeys = () => {
    const out = new Set();
    Object.entries(deps.offs.all()).forEach(([n, o]) => Object.keys(o.p || {}).forEach(k => out.add(n + '|' + k)));
    return out;
  };
  let mapPrev = deps.offs ? mapKeys() : new Set();
  function mapWrite() {
    const now = mapKeys(),
      all = deps.offs.all();
    const prev = mapPrev;
    mapPrev = now;
    if (st.src != 'dtc' || !deps.lines().some(l => l.s == 'NAV OFFSETS')) return false;
    let n0 = 0;
    const put = (key, vals) => {
      const o = navRow(deps.G('NAV OFFSETS', key, ''), !key.startsWith('OA')),
        v = vals.join(',');
      if (String(deps.G('NAV OFFSETS', key, '')).replace(/\s+/g, '') === v && exists('NAV OFFSETS', key)) return;
      wr('NAV OFFSETS', key, v);
      n0++;
      return o;
    };
    Object.entries(all).forEach(([ns, o]) => {
      const n = +ns,
        at = o.at,
        p = o.p || {};
      if (!at || n < 1 || n > 24) return;
      const el = (k, key) => {
          const q = navRow(deps.G('NAV OFFSETS', key, ''), !key.startsWith('OA'));
          // 0 ft when the point sits on another one, never a negative elevation
          const hit =
              ['oa1', 'oa2'].includes(k) &&
              [
                at,
                ...Object.entries(p)
                  .filter(([x]) => x != k)
                  .map(([, v]) => v),
              ].some(v => dist(v, p[k]) < 100),
            e = hit ? 0 : p[k].alt !== undefined ? p[k].alt : +q.elev || 0;
          return String(Math.max(0, Math.round(e)));
        },
        rw = (a, b) => offsetRow(a, b);
      ['oa1', 'oa2'].forEach(k => {
        if (!p[k]) return;
        const r = rw(at, p[k]);
        put(MROW[k](n), [String(r.brg), String(r.rng), el(k, MROW[k](n))]);
      });
      [
        ['vrp', at, 'vrp', p.vrp, true],
        ['vrpPup', at, 'vrpPup', p.vrpPup, true],
        ['vip', null, 'vip', p.vip, false],
        ['vipPup', p.vip || at, 'vipPup', p.vipPup, true],
      ].forEach(([k, from, , pos, fromTo]) => {
        if (!pos) return;
        const key = MROW[k](n),
          r = fromTo ? rw(from, pos) : rw(pos, at);
        put(key, [String(n), String(r.brg), String(r.rng), el(k, key)]);
      });
      if (p.vip || p.vipPup) {
        if (deps.G('NAV OFFSETS', 'Modesel', '') !== 'vip') (wr('NAV OFFSETS', 'Modesel', 'vip'), n0++);
      } else if (p.vrp || p.vrpPup) {
        if (deps.G('NAV OFFSETS', 'Modesel', '') !== 'vrp') (wr('NAV OFFSETS', 'Modesel', 'vrp'), n0++);
      }
    });
    prev.forEach(pk => {
      if (now.has(pk)) return;
      const [ns, k] = pk.split('|'),
        key = MROW[k](ns);
      if (exists('NAV OFFSETS', key) && held(key)) (wr('NAV OFFSETS', key, zeroRow(key)), n0++);
    });
    return n0 > 0;
  }
  if (deps.offs)
    deps.offs.onChange(() => {
      let w = false;
      try {
        w = mapWrite();
      } catch (e) {
        /* none */
      }
      if (w && deps.applied) deps.applied();
      st.applied = st.cleared = null;
      if (!deps.root.closest('.hide') && ctx) {
        try {
          draw(true);
        } catch (e) {
          /* none */
        }
      }
    });
  const lethal = () =>
    res && res.an
      ? {
          env: res.an.env,
          mra: res.an.mra,
          below: res.an.below,
          viol: res.an.viol,
          flags: res.an.flags,
          circles: lethN,
        }
      : null;
  return {
    mode: () => st.mode, // Add all cards of the Kneeboard: the tab to give back
    amode: () => (ATK.includes(st.mode) ? st.mode : ATK.includes(st.amode) ? st.amode : 'popup'), // the attack page last shown
    lethal,
    allCards,
    refresh,
    render: () => {
      if (deps.root.closest('.hide')) return;
      draw(false);
    },
    leave: () => {
      detachMap();
      if (deps.harm) deps.harm.leave();
      if (deps.tgt) deps.tgt.leave();
      document.body.classList.remove('onharm');
    },
    setElev: f => {
      deps.elev = f;
      elKey = '';
      draw(true);
    },
    state: () => st,
    // the horizontal drawing of an attack page (popup, hadb, toss) on the target steerpoint nearest to a point (x, y km: Weapons > HARM > DEAD, its SAM),
    // with the settings of that page, in km: {label, segs [{k, name, col, dash, pts}], marks [{x, y, l, col}]} | {error} | null (no steerpoint within
    // 10 nm). The page is left as it was (its mode, its target, its result)
    planLines: (mode, x, y) => {
      if (!ATK.includes(mode)) return null;
      const keep = { mode: st.mode, tgt: st.tgt },
        r0 = res,
        c0 = ctx;
      try {
        const T = gather().T,
          d = q => Math.hypot(q.e / FT_KM - x, q.n / FT_KM - y) / 1.852,
          b = T.slice().sort((a, c) => d(a) - d(c))[0];
        if (!b || d(b) > 10) return null;
        st.mode = mode;
        st.tgt = b.v;
        compute(true);
        const r = res;
        if (!r || r.error)
          return { label: b.label, error: (r && r.error) || 'no solution with the settings of the page' };
        const D = vrpMark(oa1Plan(r.draw || popupDraw(r, null), r), r),
          km = p => ({ x: p.e / FT_KM, y: p.n / FT_KM });
        return {
          label: b.label,
          segs: D.segs
            .filter(z => z[0] != 'ref' && PH[z[0]])
            .map(([k, pts]) => ({ k, name: PH[k][0], col: PH[k][1], dash: PH[k][2], pts: pts.map(km) })),
          marks: D.marks.map(m => ({ ...km(m[0]), l: m[1], col: m[2] || '#fff' })),
        };
      } catch (e) {
        return { error: (e && e.message) || String(e) };
      } finally {
        st.mode = keep.mode;
        st.tgt = keep.tgt;
        sync();
        res = r0;
        ctx = c0;
      }
    },
    // the target steerpoint nearest to a point (x, y km; Weapons > HARM > DEAD: its SAM), chosen for the attack pages; null when none is within 10 nm
    aimAt: (x, y) => {
      const T = gather().T,
        d = q => Math.hypot(q.e / FT_KM - x, q.n / FT_KM - y) / 1.852,
        b = T.slice().sort((a, c) => d(a) - d(c))[0];
      if (!b || d(b) > 10) return null;
      st.tgt = b.v;
      st.applied = st.cleared = null;
      save();
      return { label: b.label, nm: d(b) };
    },
    btn,
    clearAll,
    setState: o => {
      if (o && typeof o == 'object') {
        st = take(o, st);
        save();
        refresh();
      }
    },
    spec,
    attack,
    apply,
    card: () => st.card,
    // the data of the Attack cards of the Kneeboard (one per role)
    atkCards: () => atkCards(),
    atkSnap: async () => {
      const L = atkCards();
      for (const D of L) D.px = await snapPlan(D);
      return L;
    },
    // for the tests: the other group (phases of its drawing) and the deconfliction
    _dc: () => ({
      ghost: GHO ? GHO.segs.map(z => [z[0], z[1].map(q => [Math.round(q.n), Math.round(q.e)])]) : null,
      dc: DC,
      sweep: SWEEP,
      level: dcLevel(),
      oa2: res && !res.error && res.oa2 ? [Math.round(res.oa2.n), Math.round(res.oa2.e)] : null,
      sides: GHO && res && !res.error ? sidesOf(res, res.an && res.an.env, otherSide()).map(x => x.trk) : null,
    }),
  };
}
