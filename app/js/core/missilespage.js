// Missiles page: HARM shot at a threat (POS / HAS) with the map, and radar missile range against aspect (BVR). The maths is in airmissile.js, the numbers come
// from the BMS Misdata tables (missiledata.js; three missiles are built in). deps: {root, esc, points(), ll(n, e), attach(el), detach(), missiles() -> {name: data}}
import D0 from '../data/index.js';
import { timeline, CLASSES, STD, mslName, toKt, toMach } from './bvrtimeline.js';
import { bvrShot, harmShot, marShot, HARM_SUB, NM } from './airmissile.js';
import { bearing, project } from './popup.js';

const FT_KM = 3280.84;
// surface-to-air missiles (they have a radar seeker too) and the inert training rounds are not air-to-air shots
const GROUND = /^(SA-|Patriot$|Hawk$|Nike$|CrotaleNG$|RIM-|CATM|UNUSED)/i;
const MODES = [
  ['harm', 'HARM'],
  ['bvr', 'BVR / MAR'],
]; // deps.only keeps one of them (the HARM lives on the Weapons page, the BVR on the Missiles page)
const fmt = (v, d = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, ' ');
const h3 = h => String(Math.round(h) % 360 || 360).padStart(3, '0');
const SL = {
  heading: ['Heading', '°', 1, 360, 1],
  alt: ['Launch alt.', ' ft', 1000, 55000, 500],
  speed: ['Launch speed', ' kt', 250, 750, 10],
  tgtAlt: ['Target alt.', ' ft', 0, 55000, 500],
  tgtSpeed: ['Target speed', ' kt', 0, 800, 10],
  shotPct: ['Shot at', '% of Rmax', 20, 100, 5],
  aspect: ['Aspect', '°', 0, 180, 5],
  offNose: ['Emitter off the nose', '°', -180, 180, 5],
};
// the BVR page shows its speeds in knots (true airspeed) or in Mach, one unit for each card, and keeps the values in the unit shown: speed field -> its altitude field
const SPEED = { speed: 'alt', tgtSpeed: 'tgtAlt' };
// the speed of the timeline in each unit: min, max, step, decimals
const TLS = { mach: [0.3, 2, 0.05, 2], kt: [150, 1300, 10, 0] };
// a number with some decimals, kept inside a range
const rnd = (v, a, b, dec) => {
  const k = 10 ** dec;
  return Math.min(b, Math.max(a, Math.round(v * k) / k));
};

export function createMissilesPage(deps) {
  const esc = deps.esc,
    KEY = deps.key || 'msmissiles1',
    modes = deps.only ? MODES.filter(m => m[0] == deps.only) : MODES;
  let st = {
    mode: deps.only || 'harm',
    em: null,
    harm: {
      mode: 'pos',
      sub: 'EOM',
      iso: 0,
      gi: 0,
      msl: 'AGM-88',
      heading: 360,
      alt: 25000,
      speed: 450,
      shotPct: 90,
      offNose: 0,
      tgtAlt: 0,
    },
    bvr: {
      msl: 'AIM-120B',
      u: 'kt', // the unit of the two speeds
      alt: 25000,
      speed: 450,
      tgtAlt: 25000,
      tgtSpeed: 450,
      aspect: 0,
      shotPct: 100,
      tgtSize: 'fighter',
    },
    sliders: 1, // the Sliders switch of the BVR page: sliders (1) or number boxes (0)
    tl: {
      std: { alt: STD.alt, spd: STD.mach, tNotch: STD.tNotch, tRecommit: STD.tRecommit }, // yours; the speed is in the unit u
      sel: 0,
      cls: ['Su-27', 'Mig-29A', 'F-16C', 'Mig-31'],
      msl: ['', '', '', ''], // the missile of each row ('' = the best one of the class)
      en: [null, null, null, null], // the altitude and speed {alt, spd} of each enemy; null = it flies like you
      open: [false, false, false, false], // the rows that show the altitude and speed of their enemy
      u: 'mach', // the unit of the speeds of the timeline
    },
    map: { on: true, op: 80 }, // the map layer under the horizontal envelope, as on the Weapons page
  };
  // the timeline of an older page or mission file: the speed was std.mach and a row had no missile menu
  // (a state that has no unit was written with the speeds in Mach for the timeline and in knots for the Shot card; one without the missile menus or the
  // enemy's conditions starts them again, whatever the page holds now)
  const mergeTl = (a, b) => {
    if (!b || typeof b != 'object') return a;
    const s = { ...b.std };
    if (s.spd == null && s.mach != null) s.spd = s.mach;
    delete s.mach;
    return {
      ...a,
      std: { ...a.std, ...s },
      sel: b.sel || 0,
      cls: b.cls || a.cls,
      msl: b.msl || [],
      en: b.en || [],
      open: b.open || [],
      u: b.u == 'kt' ? 'kt' : 'mach',
    };
  };
  const mergeBvr = (a, b) => (b && typeof b == 'object' ? { ...a, u: 'kt', ...b } : a);
  // whatever came in (an older page, a mission file from anybody) is brought to the shapes the page draws and to numbers inside the ranges of its sliders
  function norm() {
    const t = st.tl,
      b = st.bvr,
      num = (v, lo, hi, d) => (typeof v == 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d),
      arr = v => (Array.isArray(v) ? v : []);
    t.u = t.u == 'kt' ? 'kt' : 'mach';
    b.u = b.u == 'mach' ? 'mach' : 'kt';
    st.sliders = st.sliders === 0 || st.sliders === false ? 0 : 1;
    const [s0, s1] = TLS[t.u],
      sd = t.u == 'kt' ? Math.round(toKt(STD.mach, STD.alt)) : STD.mach,
      o = t.std && typeof t.std == 'object' ? t.std : {};
    t.std = {
      alt: num(o.alt, 0, 50000, STD.alt),
      spd: num(o.spd, s0, s1, sd),
      tNotch: num(o.tNotch, 0, 60, STD.tNotch),
      tRecommit: num(o.tRecommit, 0, 90, STD.tRecommit),
    };
    t.sel = Number.isInteger(t.sel) && t.sel >= 0 && t.sel < 4 ? t.sel : 0;
    t.cls = [0, 1, 2, 3].map(i => (CLASSES.some(c => c.n === arr(t.cls)[i]) ? t.cls[i] : ''));
    t.msl = [0, 1, 2, 3].map(i => (typeof arr(t.msl)[i] == 'string' ? t.msl[i] : ''));
    t.en = [0, 1, 2, 3].map(i => {
      const e = arr(t.en)[i];
      return e && typeof e == 'object'
        ? { alt: num(e.alt, 0, 50000, t.std.alt), spd: num(e.spd, s0, s1, t.std.spd) }
        : null;
    });
    t.open = [0, 1, 2, 3].map(i => arr(t.open)[i] === true);
    // the HARM card (the Weapons page keeps it) and what the two pages share
    const h = st.harm && typeof st.harm == 'object' ? st.harm : {},
      mp = st.map && typeof st.map == 'object' ? st.map : {};
    st.harm = {
      mode: ['pos', 'has', 'had'].includes(h.mode) ? h.mode : 'pos',
      sub: ['EOM', 'PB', 'RUK'].includes(h.sub) ? h.sub : 'EOM',
      iso: h.iso == 1 ? 1 : 0,
      gi: h.gi == 1 ? 1 : 0,
      msl: typeof h.msl == 'string' ? h.msl : 'AGM-88',
      heading: num(h.heading, 1, 360, 360),
      alt: num(h.alt, 1000, 55000, 25000),
      speed: num(h.speed, 250, 750, 450),
      shotPct: num(h.shotPct, 20, 100, 90),
      offNose: num(h.offNose, -180, 180, 0),
      tgtAlt: num(h.tgtAlt, 0, 55000, 0),
    };
    st.em = typeof st.em == 'string' ? st.em : null;
    st.map = { on: mp.on !== false, op: num(mp.op, 0, 100, 80) };
    if (!modes.some(m => m[0] === st.mode)) st.mode = modes[0][0];
    const kt = b.u == 'kt';
    if (typeof b.msl != 'string') b.msl = 'AIM-120B';
    b.alt = num(b.alt, 1000, 55000, 25000);
    b.tgtAlt = num(b.tgtAlt, 0, 55000, 25000);
    b.speed = kt ? num(b.speed, 250, 750, 450) : num(b.speed, 0.4, 1.4, 0.75);
    b.tgtSpeed = kt ? num(b.tgtSpeed, 0, 800, 450) : num(b.tgtSpeed, 0, 1.4, 0.75);
    b.aspect = num(b.aspect, 0, 180, 0);
    b.shotPct = num(b.shotPct, 20, 100, 100);
    b.tgtSize = ['small', 'fighter', 'bomber'].includes(b.tgtSize) ? b.tgtSize : 'fighter';
  }
  let fromSession = false,
    touched = false; // touched: the page was changed (by the pilot or by a mission) before the file of the last session was read
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    fromSession = !!o;
    if (o)
      st = {
        ...st,
        ...o,
        harm: { ...st.harm, ...o.harm },
        map: { ...st.map, ...o.map },
        bvr: mergeBvr(st.bvr, o.bvr),
        mode: deps.only || o.mode,
        tl: mergeTl(st.tl, o.tl),
      };
  } catch (e) {
    /* none */
  }
  norm();
  const save = () => {
    touched = true;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      /* none */
    }
    // deps.prefs: the page is remembered from one session to the next (the BVR page: the classes, their missiles and conditions, the units); a mission opened still wins
    if (deps.prefs)
      try {
        deps.prefs.save({ ...st, mode: undefined });
      } catch (e) {
        /* not saved */
      }
  };
  if (deps.prefs && !fromSession)
    Promise.resolve()
      .then(() => deps.prefs.load())
      .then(o => {
        if (!o || typeof o != 'object' || touched) return;
        st = {
          ...st,
          ...o,
          harm: { ...st.harm, ...(o.harm && typeof o.harm == 'object' ? o.harm : {}) },
          bvr: mergeBvr(st.bvr, o.bvr),
          tl: mergeTl(st.tl, o.tl),
          map: { ...st.map, ...(o.map && typeof o.map == 'object' ? o.map : {}) },
          mode: deps.only || st.mode,
        };
        norm();
        try {
          sessionStorage.setItem(KEY, JSON.stringify(st));
        } catch (e) {
          /* none */
        }
        if (deps.root.isConnected && !deps.root.closest('.hide') && deps.root.querySelector('.wpg')) draw(false);
      })
      .catch(() => {});
  let DB = { ...D0.mfb },
    asked = false,
    M = null,
    pend = null,
    failed = false,
    fit = true,
    res = null;
  const cur = () => st[st.mode];
  const names = kind =>
    Object.keys(DB)
      .filter(
        k =>
          !/unused/i.test(k) &&
          !/unused/i.test(DB[k].title || '') &&
          DB[k].range &&
          (kind == 'harm' || !GROUND.test(k)) &&
          (kind == 'harm' ? DB[k].params.seekerType === 2 : [1, 6].includes(DB[k].params.seekerType))
      )
      .sort();
  let loadP = null; // the missile files being read (the BVR rows of the datacard wait for them)
  function load() {
    if (asked || !deps.missiles) return loadP;
    asked = true;
    return (loadP = Promise.resolve(deps.missiles())
      .then(m => {
        if (m && Object.keys(m).length) {
          DB = { ...DB, ...m };
          if (deps.root.querySelector('.wpg')) draw(false);
        }
      })
      .catch(() => {}));
  }

  function emitters() {
    const P = deps.points && deps.points();
    return P
      ? P.ppt
          .filter(p => !p.empty)
          .map(p => ({
            v: String(p.slot),
            label: 'STPT ' + p.stpt + (p.name ? ' · ' + p.name : ''),
            n: p.y * FT_KM,
            e: p.x * FT_KM,
            ringNm: p.rngNm || 0,
            alt: p.altFt || 0,
          }))
      : [];
  }
  const tab = list => {
    const L = names(list),
      c = cur();
    if (!DB[c.msl] || !L.includes(c.msl)) c.msl = L[0];
    return L;
  };

  function compute() {
    const c = cur(),
      m = DB[c.msl];
    res = null;
    if (!m) return;
    if (st.mode == 'bvr') {
      res = bvrShot(m, { ...c, speed: ktOf('speed'), tgtSpeed: ktOf('tgtSpeed'), kind: 'aam' });
      return;
    }
    const E = emitters(),
      em = E.find(x => x.v === st.em) || E[0];
    if (!em) return;
    res = harmShot(m, m.loft, { ...c, emitter: { n: em.n, e: em.e }, ringNm: em.ringNm, tgtAlt: c.tgtAlt });
    res.em = em;
  }

  // the Shot card keeps its two speeds in the unit shown (kt or Mach): the model gets knots
  const bvrU = () => (st.bvr.u == 'mach' ? 'mach' : 'kt');
  const sliders = () => st.sliders !== 0;
  const ktOf = f => (bvrU() == 'mach' ? toKt(st.bvr[f], st.bvr[SPEED[f]]) : st.bvr[f]);
  // a field of the Shot card: [label, unit, min, max, step, decimals] (the speeds depend on the unit) and its value as text
  const sdef = f =>
    st.mode == 'bvr' && SPEED[f] && bvrU() == 'mach'
      ? [SL[f][0], ' Mach', f == 'speed' ? 0.4 : 0, 1.4, 0.05, 2]
      : [...SL[f], 0];
  const stxt = (f, v) =>
    st.mode == 'bvr' && SPEED[f] && bvrU() == 'mach' ? 'Mach ' + Number(v).toFixed(2) : fmt(v) + SL[f][1];
  const slider = f => {
    const [l, u, a, b, s] = sdef(f),
      v = cur()[f];
    if (st.mode == 'bvr' && !sliders())
      return `<div class="wrow"><label>${l}</label><span class="wnumw"><input type="number" class="wnum" data-num="${f}" min="${a}" max="${b}" step="${s}" value="${v}">${u.trim()}</span></div>`;
    const num =
      f == 'heading'
        ? `<span class="wnumw"><input type="number" class="wnum" data-num="${f}" min="${a}" max="${b}" step="1" value="${v}">°</span>`
        : `<em data-em="${f}">${stxt(f, v)}</em>`;
    return `<div class="slr"><label>${l}</label><input type="range" min="${a}" max="${b}" step="${s}" value="${v}" data-sl="${f}">${num}</div>`;
  };
  const seg = (f, opts, c) =>
    `<span class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-set="${f}" data-v="${v}">${l}</button>`).join('')}</span>`;
  const kv = (a, b, bad) => `<span>${a}</span><b${bad ? ' class="wbad"' : ''}>${b}</b>`;

  function results() {
    const r = res;
    if (!r)
      return st.mode == 'harm'
        ? '<p class="hint">Add a pre-planned threat (PPT) to the DTC: the HARM is shot at its position.</p>'
        : '<p class="hint">No missile data.</p>';
    if (r.error) return `<p class="hint">${esc(r.error)}</p>`;
    if (st.mode == 'harm') {
      const tiles = `<div class="tile"><span>Rmax</span><b>${(r.rMax / NM).toFixed(1)} nm</b></div><div class="tile"><span>Range at ${fmt(r.v.offNose)}° off the nose</span><b>${(r.rTh / NM).toFixed(1)} nm</b></div>`,
        v = r.v,
        sub = HARM_SUB[v.sub];
      const o = harmOpt(v),
        tiTxt = o.flex
          ? 'Off: if the primary threat is not found the HARM flexes, it looks for other emitter types (secondary, then tertiary).'
          : 'On: no flex, the HARM keeps looking for the handed-off threat only.',
        giTxt = o.lotg
          ? 'Off: loss of track glide (LOTG) and equation of motion glide (EOMG) are both possible.'
          : 'On: no LOTG; ' +
            (o.eomg
              ? 'EOMG is still possible.'
              : 'no EOMG either (TI and GI both on): the missile neither glides nor flexes.');
      return (
        `<div class="wpt">${tiles}</div><div class="wcard"><h3>Shot</h3><div class="kv">${kv('LAUNCH POINT', r.shot ? h3(bearing(r.em, r.launch) % 360) + '° · ' + (r.shot / NM).toFixed(1) + ' nm from the emitter' : 'none: outside the envelope')}${kv('ATTACK HDG', h3(v.heading) + '°')}${kv('LOFT ANGLE', r.loft == null ? 'none (no loft table)' : Math.round(r.loft) + '°')}${kv('FLIGHT TIME', fmt(r.flight) + ' s')}` +
        (r.ringFt
          ? kv('SAM RING', (r.ringFt / NM).toFixed(1) + ' nm') +
            kv(
              'MARGIN',
              (r.margin >= 0 ? '+' : '−') +
                (Math.abs(r.margin) / NM).toFixed(1) +
                ' nm ' +
                (r.outside ? '(shot from outside the ring)' : '(INSIDE the ring)'),
              !r.outside
            )
          : kv('SAM RING', 'not set on this PPT')) +
        kv(
          'ENVELOPE',
          r.seekerOk
            ? r.has
              ? 'emitter inside the ±' + r.gimbal + '° of the seeker'
              : 'emitter inside the ' + v.sub + ' footprint (' + Math.round(r.factor * 100) + '% of Rmax)'
            : r.has
              ? 'emitter outside the ±' + r.gimbal + '° of the seeker'
              : 'emitter OUTSIDE the ' + v.sub + ' footprint',
          !r.seekerOk
        ) +
        `</div></div>
        <div class="wcard"><h3>Seeker options<span class="wtip" title="From the BMS manual (TO 1F-16CMAM-34-1-1). In POS and HAD the missile flies to the steerpoint and only then opens its seeker; the submode decides where and how wide. The HAS seeker sees 120° in all. Target Isolate (TI) and Glide Inhibit (GI) are two independent switches (the HARM page shows TI, TI highlighted, NC or SD): TI stops the flex, GI stops the glide.">ⓘ</span></h3><div class="kv wkv1">` +
        (r.has
          ? kv('HAS', 'the missile is the sensor: ±60°, only radars that emit are seen')
          : kv('SEEKER ON', sub.on + ' nm from the steerpoint · ' + sub.fov + ' FOV') +
            kv(
              'SUBMODE',
              {
                EOM: 'EOM: well known position (a steerpoint), narrow FOV',
                PB: 'PB: long range, wide FOV, shot within about ±11° of the nose',
                RUK: 'RUK: range unknown, degraded EOM, wide FOV, opened about 30 nm out',
              }[v.sub]
            )) +
        kv('TARGET ISOLATE (TI)', tiTxt) +
        kv('GLIDE INHIBIT (GI)', giTxt) +
        kv('HARM PAGE SHOWS', o.state) +
        (o.lotg
          ? kv(
              'LOTG',
              'loss of track glide: if the primary threat is lost the missile glides with the seeker wide open'
            )
          : '') +
        (o.eomg
          ? kv(
              'EOMG',
              'equation of motion glide: if the primary threat is not found at the trip point the missile glides and searches further out, seeker wide open'
            )
          : '') +
        `</div></div>`
      );
    }
    const mar = marShot(st.bvr.msl, r.rHead, r.v.tgtSpeed, r.v.tgtAlt),
      mv = mar.variable !== null ? mar.variable : mar.uniform;
    const tiles = `<div class="tile"><span>Rmax at ${r.v.aspect}° aspect</span><b>${(r.rMax / NM).toFixed(1)} nm</b></div><div class="tile"><span>Enemy MAR at ${stxt('tgtSpeed', st.bvr.tgtSpeed)}</span><b>${Math.max(0, mv).toFixed(1)} nm</b></div>`;
    return `<div class="wpt">${tiles}</div><div class="wcard"><h3>Rmax against aspect</h3>${chart(r)}</div>
      <div class="wcard"><h3>DLZ · launch zone and shot<span class="wtip" title="Cues of the AIM-120 dynamic launch zone (manual 4.3.2.5.1.1). RAERO: the range at this aspect (table range, target not manoeuvring). RTR: the same for a target turned to tail aspect (no-escape). A-pole: range between the aircraft when the seeker goes active, at the pitbull range of the missile file for the target size. F-pole: range at impact. ROPT, RPI and RMIN depend on the termination criteria of the missile and are not in the files, so they are not shown.">ⓘ</span></h3><div class="kv">
      ${kv('RAERO', (r.dlz.raero / NM).toFixed(1) + ' nm')}${kv('RTR', (r.dlz.rtr / NM).toFixed(1) + ' nm')}${kv('A-POLE', r.dlz.aPole === null ? 'no pitbull range in the file' : (r.dlz.aPole / NM).toFixed(1) + ' nm (active ' + fmt(r.flight - (r.dlz.timeToActive || 0)) + ' s before impact)')}${kv('F-POLE', (r.dlz.fPole / NM).toFixed(1) + ' nm')}${kv('CLOSURE', fmt(r.dlz.closure) + ' kt')}${kv('PITBULL RANGE', r.dlz.pitbullNm ? r.dlz.pitbullNm + ' nm (' + { small: 'small fighter', fighter: 'fighter', bomber: 'bomber' }[r.v.tgtSize || 'fighter'] + ')' : '-')}${kv('RMAX HEAD-ON', (r.rHead / NM).toFixed(1) + ' nm (table)')}${kv('SHOT RANGE', (r.shot / NM).toFixed(1) + ' nm')}${kv('FLIGHT TIME', fmt(r.flight) + ' s')}${kv('MEAN MISSILE SPEED', 'Mach ' + (r.vm / 1000).toFixed(1) + '+ (assumed)')}</div></div>
      <div class="wcard"><h3>MAR · minimum abort range<span class="wtip" title="The closest the shooter can be and the target still turn and run, so that the missile falls to the stall speed before it arrives (BVR1 paper, turn-and-run). Uniform: constant deceleration from the missile's maximum speed so that it covers its Rmax. Variable: deceleration growing with the square of the speed, with the paper's measured maximum deceleration (only for the missiles it covers). The target's speed is the aborting aircraft's speed.">ⓘ</span></h3><div class="kv">
      ${kv('MAR, UNIFORM DECEL', Math.max(0, mar.uniform).toFixed(1) + ' nm')}${kv('MAR, VARIABLE DECEL', mar.variable !== null ? Math.max(0, mar.variable).toFixed(1) + ' nm' : 'not available for this missile')}
      ${kv('STALL SPEED', fmt(mar.stall) + ' kt TAS' + (r.v.tgtSpeed > mar.vStall ? ' (the target speed)' : ' (400 KIAS)'))}${kv('MISSILE MAX SPEED', fmt(mar.vMax) + ' kt' + (mar.known ? '' : ' (assumed)'))}${kv('RMAX USED', mar.mor.toFixed(1) + ' nm')}</div></div>`;
  }

  // BVR timeline card: your conditions + up to 4 enemy classes (each with its missile and, if you want, its own altitude and speed) -> MTR / TR / DOR / DR / MAR / STERN WEZ (+ FR), a scheme of the selected one and the datacard fill
  const tlU = () => (st.tl.u == 'kt' ? 'kt' : 'mach');
  // a field of the timeline card: [label, unit, min, max, step, decimals]. alt and spd are yours (std) or an enemy's (en), the speed is in the unit of the card
  const tdef = k =>
    k == 'alt'
      ? ['Altitude (ft)', ' ft', 0, 50000, 1000, 0]
      : k == 'spd'
        ? ['Speed', tlU() == 'mach' ? ' Mach' : ' kt', ...TLS[tlU()]]
        : k == 'tNotch'
          ? ['T notch (s)', ' s', 0, 60, 1, 0]
          : ['T recommit (s)', ' s', 0, 90, 1, 0];
  const ttxt = (k, v) =>
    k == 'alt'
      ? fmt(v) + ' ft'
      : k == 'spd'
        ? tlU() == 'mach'
          ? 'Mach ' + Number(v).toFixed(2)
          : fmt(v) + ' kt'
        : v + ' s';
  const f1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toString());
  // yours and the enemy's conditions for the model (it works in Mach); an enemy without its own altitude and speed flies like you
  const tlStd = () => {
    const s = st.tl.std;
    return {
      alt: s.alt,
      mach: tlU() == 'mach' ? s.spd : toMach(s.spd, s.alt),
      tNotch: s.tNotch,
      tRecommit: s.tRecommit,
    };
  };
  const tlEn = i => {
    const o = st.tl.en[i];
    return o ? { alt: o.alt, mach: tlU() == 'mach' ? o.spd : toMach(o.spd, o.alt) } : null;
  };
  const tlEff = i => {
    const o = st.tl.en[i] || st.tl.std;
    return { alt: o.alt, spd: o.spd };
  };
  // the missile of a row: its own choice (one of the missiles the class carries), '' = the best one of the class
  const slotMsl = i => st.tl.msl[i] || null;
  // the timeline of a class is kept in memory: it is worked out again only when its inputs change (the class, the conditions, the missile, the missile data)
  const TLC = { db: null, m: new Map() };
  function tl1(c, std, msl, en) {
    if (TLC.db !== DB) {
      TLC.db = DB;
      TLC.m.clear();
    }
    const key = JSON.stringify([c, std, msl, en]);
    if (TLC.m.has(key)) return TLC.m.get(key);
    const r = timeline(c, DB, std, msl, en);
    if (TLC.m.size > 64) TLC.m.clear();
    TLC.m.set(key, r);
    return r;
  }
  function tlRows() {
    const std = tlStd();
    return st.tl.cls.map((c, i) => (c ? tl1(c, std, slotMsl(i), tlEn(i)) : null));
  }
  // the scheme of the two flow charts: range down the page (the adversary at the top), the lines MTR > TR > DOR > DR > MAR > STERN WEZ, and the Launch-and-Leave (Skate / Short Skate) and Launch-and-Decide (Banzai / abort) tracks
  function scheme(r) {
    // one scale for every table (8.17 px per nm): a longer MTR makes the drawing taller instead of squeezing it (at least as tall as for 42.5 nm)
    const W = 440,
      K = 8.17,
      max = Math.max(r.mtr + 6, 48.5),
      top = 34,
      bot = top + max * K,
      H = bot + 40,
      y = d => top + d * K,
      X0 = 112;
    const L = [
      ['MTR', r.mtr, 'Minimum Targeting Range'],
      ['TR', r.tr, 'Transition Range'],
      ['DOR', r.dor, 'Desired Out Range'],
      ['DR', r.dr, 'Decision Range'],
      ['MAR', r.mar, 'Minimum Abort Range'],
      ['STERN WEZ', r.stern, 'Stern weapon employment zone'],
    ];
    const col = {
      MTR: '#a78bfa',
      TR: '#60a5fa',
      DOR: '#34d399',
      DR: '#fbbf24',
      MAR: '#fb923c',
      'STERN WEZ': '#f87171',
    };
    const lines = L.map(
      ([k, v, t]) =>
        `<path d="M${X0} ${y(v).toFixed(1)}H${W - 10}" stroke="${col[k]}" stroke-dasharray="4 4" opacity=".7"/><text x="${W - 12}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end" fill="${col[k]}" font-weight="700" font-size="11">${k} ${f1(v)} nm</text>`
    ).join('');
    const arrow = (x, y1, y2, c) =>
      `<path d="M${x} ${y1.toFixed(1)}V${y2.toFixed(1)}" stroke="${c}" stroke-width="2" fill="none"/>`;
    const hook = (x, yy, dx, c) =>
      `<path d="M${x} ${yy.toFixed(1)}q0 -14 ${dx / 2} -14t${dx / 2} 14V${(yy + 46).toFixed(1)}" stroke="${c}" stroke-width="2" fill="none" marker-end="url(#ar)"/>`;
    const tri = (x, yy, c, up) =>
      `<path d="M${x - 8} ${yy + (up ? 8 : -8)}L${x + 8} ${yy + (up ? 8 : -8)}L${x} ${yy + (up ? -8 : 8)}Z" fill="${c}" opacity=".85"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="wsch" style="width:100%;height:auto;display:block;margin-top:10px" role="img" aria-label="BVR timeline scheme"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#cbd5e1"/></marker></defs>
      <rect width="${W}" height="${H}" rx="6" fill="#0f1419"/><g font-family="system-ui,sans-serif" font-size="10" fill="#cbd5e1">
      <path d="M${X0 - 36} ${top}V${bot}" stroke="#64748b" stroke-width="2"/>${lines}
      ${tri(X0 + 40, top - 10, '#ef4444', false)}${tri(X0 + 62, top - 10, '#ef4444', false)}<text x="${X0 + 80}" y="${top - 12}">Adversary</text>
      ${arrow(X0 + 150, bot - 6, y(r.dor), '#38bdf8')}${hook(X0 + 150, y(r.dor), 40, '#38bdf8')}<text x="${X0 + 100}" y="${(y(r.dor) + 62).toFixed(1)}" fill="#34d399" font-weight="700">Skate</text>
      ${arrow(X0 + 200, bot - 6, y(r.mar), '#38bdf8')}${tri(X0 + 200, bot + 8, '#3b82f6', true)}${hook(X0 + 200, y(r.mar), 40, '#38bdf8')}<text x="${X0 + 210}" y="${(y(r.mar) + 62).toFixed(1)}" fill="#34d399" font-weight="700">Short Skate</text>
      ${arrow(X0 + 20, bot - 6, y(r.dr), '#cbd5e1')}${arrow(X0 + 20, y(r.dr), y(r.mar) - 24, '#cbd5e1')}<path d="M${X0 + 20} ${y(r.dr).toFixed(1)}q-22 0 -22 22" stroke="#f87171" stroke-width="2" fill="none" marker-end="url(#ar)"/>
      ${tri(X0 + 20, y(r.mar) - 30, '#3b82f6', true)}<text x="${X0 + 30}" y="${((y(r.dr) + y(r.mar)) / 2).toFixed(1)}" fill="#fb923c" font-weight="700">Banzai</text><text x="${X0 - 28}" y="${(y(r.dr) + 40).toFixed(1)}" fill="#f87171" font-weight="700">Abort</text>
      <text x="${X0 + 30}" y="${(y(r.dr) - 6).toFixed(1)}" font-size="9">notch ${f1(st.tl.std.tNotch)} s</text>
      ${tri(X0 + 20, bot + 8, '#3b82f6', true)}${tri(X0 + 150, bot + 8, '#3b82f6', true)}<text x="${X0 - 28}" y="${bot + 30}" font-weight="700">Launch and Decide</text><text x="${X0 + 118}" y="${bot + 30}" font-weight="700">Launch and Leave</text></g></svg>`;
  }
  const tlData = () => {
    const R = tlRows(),
      t = st.tl,
      sel = R[t.sel] ? t.sel : R.findIndex(x => x);
    return { R, t, sel };
  };
  // the table of the classes with the Fill datacard button (re-drawn alone while a slider moves)
  // Fill datacard is off until something is changed (classes, missile, conditions) after the page opened or after the last fill
  let tlBase = null;
  const tlSig = () => JSON.stringify([st.tl.cls, st.tl.std, st.tl.msl, st.tl.en, st.tl.u]);
  // Fill datacard is on only while the datacard differs from the table (the page asks the datacard); without that link, it compares with the last fill
  const tlSame = () => (deps.bvrSame ? !!deps.bvrSame(tlRows()) : tlSig() === tlBase);
  function tlTable() {
    const { R, sel } = tlData();
    if (tlBase === null) tlBase = tlSig();
    const same = tlSame();
    const rows = R.map((r, i) =>
      r
        ? `<tr data-tlsel="${i}"${i === sel ? ' class="sel"' : ''} title="${esc(r.src + ' · ' + r.cat + (st.tl.en[i] ? ' · enemy at ' + fmt(r.en.alt) + ' ft, Mach ' + r.en.mach.toFixed(2) : ''))} — click to draw the scheme"><td>${esc(r.cls)}</td><td>${f1(r.mtr)}</td><td>${f1(r.tr)}</td><td>${f1(r.dor)}</td><td>${f1(r.dr)}</td><td>${f1(r.mar)}</td><td>${f1(r.stern)}</td><td>${f1(r.fr)}</td><td style="text-align:left">${r.msl ? esc(mslName(r.msl)) + (r.picked ? ' ★' : '') : 'Threat Guide'}</td></tr>`
        : ''
    ).join('');
    return `<table class="wtl" style="border-spacing:8px 2px;border-collapse:separate"><tr><th>Class</th><th>MTR</th><th>TR</th><th>DOR</th><th>DR</th><th>MAR</th><th>STERN</th><th>FR</th><th style="text-align:left">Missile</th></tr>${rows}</table><div class="wrow"><button type="button" class="btn${same ? ' nil' : ''}" data-tlfill${same ? ' disabled title="The datacard already holds this table: change a class, the missile or the conditions first."' : ''}>Fill datacard</button></div>`;
  }
  // the missile menu of a row: the class's best one by default, then the other radar missiles the class carries that are in the data files
  function msMenu(c, i) {
    const k = CLASSES.find(x => x.n === c);
    if (!k) return '';
    const has = n => DB[n] && DB[n].range,
      L = k.ms.filter(has),
      def = k.m && has(k.m) ? k.m : null,
      sel = slotMsl(i);
    if (!L.length)
      return '<select disabled title="No missile of this class in the data files: the Threat Guide MAR is used"><option>Threat Guide</option></select>';
    return `<select data-tl="msl.${i}" title="Enemy missile of this row (your own missile is in the Shot card)"><option value="">${esc(def ? mslName(def) : 'Threat Guide')} (default)</option>${L.filter(
      n => n !== def
    )
      .map(n => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(mslName(n))}</option>`)
      .join('')}</select>`;
  }
  // the unit of the speeds and the Sliders switch (as on the EWS page), at the right of the title of a card of the BVR page
  const hdrCtl = w =>
    `<span class="wctl"><span class="seg">${[
      ['kt', 'kt'],
      ['mach', 'Mach'],
    ]
      .map(
        ([v, l]) =>
          `<button type="button" class="${(w == 'tl' ? tlU() : bvrU()) == v ? 'on' : ''}" data-unit="${w}" data-v="${v}">${l}</button>`
      )
      .join(
        ''
      )}</span><button type="button" class="dsw${sliders() ? ' on' : ''}" data-sliders="1" title="Sliders, or number boxes to type the values"><i></i>Sliders</button></span>`;
  // a value of the timeline card as a slider or, with the Sliders switch off, a number box. id: std.<field> (yours) or en.<row>.<field> (an enemy's)
  function tctl(id, k, v) {
    const [l, u, a, b, s] = tdef(k);
    return sliders()
      ? `<div class="slr"><label>${l}</label><input type="range" min="${a}" max="${b}" step="${s}" value="${v}" data-tls="${id}"><em data-tle="${id}">${ttxt(k, v)}</em></div>`
      : `<div class="wrow"><label>${l}</label><span class="wnumw"><input type="number" class="wnum" data-tlb="${id}" min="${a}" max="${b}" step="${s}" value="${v}">${u.trim()}</span></div>`;
  }
  // the arrow of a row (its hint) and the head of its block say whether the enemy has its own altitude and speed
  const exTitle = i => {
    const o = st.tl.en[i];
    return o
      ? `This enemy flies at ${fmt(o.alt)} ft, ${ttxt('spd', o.spd)}. Click to show or hide its altitude and speed`
      : 'Altitude and speed of this enemy: like yours unless you change them';
  };
  const enHead = i =>
    st.tl.en[i]
      ? `<span>Its own altitude and speed</span><button type="button" class="btn g" data-tllike="${i}" title="The enemy flies like you again">Like you</button>`
      : '<span>Flies like you: change a value to give it its own</span>';
  // the altitude and speed of the enemy of a row (like yours until you change them): always in the page, the "open" class opens it smoothly and closes it (nothing in it can be reached with Tab while it is closed)
  function enBlock(i) {
    const e = tlEff(i);
    return `<div class="wen${st.tl.open[i] ? ' open' : ''}" data-i="${i}"><div class="weni"><div class="wenh">${enHead(i)}</div>${tctl(`en.${i}.alt`, 'alt', e.alt)}${tctl(`en.${i}.spd`, 'spd', e.spd)}</div></div>`;
  }
  // the left card: the table, the classes in a column (each with its missile menu and, under its arrow, its altitude and speed) and your conditions
  function tlCard() {
    const t = st.tl;
    const pick = t.cls
      .map((c, i) => {
        const o = t.en[i],
          open = t.open[i],
          ex = c
            ? `<button type="button" class="wex${open ? ' on' : ''}${o ? ' ov' : ''}" data-tlopen="${i}" aria-expanded="${!!open}" title="${exTitle(i)}"><span>▸</span></button>`
            : '';
        return `<div class="wrow"><div class="wlc"><label>Class ${i + 1}</label>${ex}</div><select data-tl="cls.${i}"><option value="">—</option>${CLASSES.map(x => `<option${x.n === c ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select>${msMenu(c, i)}</div>${c ? enBlock(i) : ''}`;
      })
      .join('');
    const you = ['alt', 'spd', 'tNotch', 'tRecommit'].map(k => tctl('std.' + k, k, t.std[k])).join('');
    return `<div class="wcard" id="mstl"><div class="wh"><h3>BVR timeline · datacard<span class="wtip" title="Conditions: yours (one altitude and speed for the whole table, at the bottom) and the enemy's (the arrow next to a class shows its own altitude and speed; until you change them the enemy flies like you). The speed is in knots (true airspeed) or in Mach, as chosen at the top right. Head-on: closure = your speed + the enemy's. MAR: the paper model with the enemy's missile (the second menu of the row; Threat Guide MAR when the missile is not in the data files), launched from the enemy's altitude and speed at you. DR = MAR + closure x T notch. DOR = DR + closure x T recommit. STERN WEZ: the tail-chase range of that missile. TR, MTR and FR are arbitrary values that follow the kind of enemy (short, medium or long range). Order: MTR > TR > DOR > DR > MAR > STERN WEZ. MTR, FR, MAR, DR and DOR go to the BVR box of the datacard.">ⓘ</span></h3>${hdrCtl('tl')}</div><div id="mstlt">${tlTable()}</div><div class="wsub">${pick}<div class="wsubh">You</div>${you}</div></div>`;
  }
  // the drawing of the selected class: its own card in the middle, with the conditions it was worked out for
  function schemeCard() {
    const { R, sel } = tlData();
    if (sel < 0) return '';
    const r = R[sel],
      cd = o => `${fmt(o.alt)} ft, Mach ${o.mach.toFixed(2)} (${fmt(o.kt)} kt)`;
    return `<div class="wcard" id="msch2"><h3>BVR timeline · scheme · ${esc(r.cls)}</h3><p class="hint wcond">${r.msl ? esc(mslName(r.msl)) : 'Threat Guide'} · enemy ${cd(r.en)} · you ${cd(r.me)} · closure ${fmt(r.vc)} kt</p>${scheme(r)}</div>`;
  }
  function chart(r) {
    const W = 360,
      H = 170,
      mx = Math.max(...r.curve.map(p => p[1])) * 1.1,
      px = a => 30 + (a / 180) * (W - 44),
      py = y => H - 24 - (y / mx) * (H - 40);
    const path = 'M' + r.curve.map(p => px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1)).join(' L');
    let g = '';
    const step = mx / NM > 80 ? 40 : mx / NM > 40 ? 20 : 10;
    for (let k = step; k * NM < mx; k += step)
      g += `<path d="M30 ${py(k * NM).toFixed(1)} H${W - 14}"/><text x="2" y="${(py(k * NM) + 3).toFixed(1)}" stroke="none">${k} nm</text>`;
    const x = px(r.v.aspect),
      y = py(r.rMax);
    return `<svg viewBox="0 0 ${W} ${H}" class="wpp" role="img" aria-label="Maximum range against target aspect"><rect width="${W}" height="${H}" rx="6" fill="#0f1419"/><g stroke="#2a3441" stroke-dasharray="2 4" fill="#8b98a8" font-size="9" font-family="system-ui,sans-serif">${g}</g>
      <path d="${path}" fill="none" stroke="#38bdf8" stroke-width="2.6"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#ffe680" stroke="#111" stroke-width="1.5"/>
      <g fill="#9aa8b8" font-size="10" font-family="system-ui,sans-serif"><text x="30" y="${H - 8}">0° head-on</text><text x="${W - 14}" y="${H - 8}" text-anchor="end">180° tail</text></g></svg>`;
  }

  // The two HARM switches of the manual (TI = Target Isolate, GI = Glide Inhibit) are independent. Off/Off (default): glides and flexes; TI: glides, no flex;
  // GI: no LOTG but EOMG possible, flexes; TI + GI: neither. The HARM page shows TI, TI highlighted, NC, SD.
  function harmOpt(v) {
    return {
      flex: !v.iso,
      lotg: !v.gi,
      eomg: !(v.iso && v.gi),
      state: v.iso ? (v.gi ? 'SD' : 'TI highlighted') : v.gi ? 'NC' : 'TI',
    };
  }
  // ---------- HARM side view (Target Isolate / Glide Inhibit): schematic, from the loft angle and the seeker trip point ----------
  const HLEG = [
    ['#ff5d5d', 'SAM ring', ''],
    ['#38bdf8', 'HARM range', '6 5'],
    ['#fbbf24', 'Seeker opens', '2 6'],
    ['#ffffff', 'HTS footprint', ''],
    ['#22d3ee', 'HAS ±60°', '4 4'],
    ['#fbbf24', 'Line to the emitter', ''],
  ];
  function harmVert(r) {
    if (!r || r.error || !r.shot) return '';
    const v = r.v,
      o = harmOpt(v);
    const sh = r.shot,
      trip = r.seekerOn ? Math.min(sh, r.seekerOn.ft) : sh * 0.15,
      la = ((r.loft == null ? 25 : r.loft) * Math.PI) / 180,
      apex = v.alt + Math.min(40000, Math.tan(la) * sh * 0.3),
      tg = v.tgtAlt || 0;
    const glide = o.lotg || o.eomg,
      ext = glide ? Math.min(r.rMax * 0.35, 50 * NM) : 0,
      x0 = -sh,
      x1 = ext,
      top = Math.max(apex, v.alt) * 1.12;
    const W = 460,
      H = 380,
      px = x => 14 + ((x - x0) / (x1 - x0 + 1)) * (W - 28),
      py = a => H - 24 - (a / top) * (H - 44),
      P = a => 'M' + a.map(q => px(q[0]).toFixed(1) + ' ' + py(q[1]).toFixed(1)).join(' L');
    const arc = [],
      n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n,
        x = -sh + t * sh,
        a =
          t < 0.35
            ? v.alt + (apex - v.alt) * Math.sin(((t / 0.35) * Math.PI) / 2)
            : apex - (apex - tg) * Math.pow((t - 0.35) / 0.65, 1.6);
      arc.push([x, a]);
    }
    const tp = [-trip, arc.reduce((b, q) => (Math.abs(q[0] + trip) < Math.abs(b[0] + trip) ? q : b), arc[0])[1]];
    let g = '',
      t = '';
    const txt = (x, y, c, s, a) => `<text x="${x}" y="${y}" fill="${c}"${a ? ` text-anchor="${a}"` : ''}>${s}</text>`;
    if (glide) {
      g = `<path d="${P([tp, [0, tg + (tp[1] - tg) * 0.5], [ext, tg + 200]])}" fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-dasharray="6 4"/>`;
      t += txt(
        W - 10,
        py(tg + (tp[1] - tg) * 0.5) - 12,
        '#22d3ee',
        (o.lotg ? 'LOTG' : '') + (o.lotg && o.eomg ? ' · ' : '') + (o.eomg ? 'EOMG' : '') + ': seeker wide open',
        'end'
      );
    }
    if (o.flex) t += txt(px(-trip) - 40, py(tp[1]) - 28, '#fbbf24', 'FLEX: looks for other threats');
    if (!glide && !o.flex) t += txt(W - 10, 22, '#9aa8b8', 'TI + GI: no flex, no glide', 'end');
    return `<h3>Vertical envelope · schematic<span class="wtip" title="From the manual: after the trip point the seeker looks for the primary threat; unless Target Isolate is on it then flexes to other emitter types, unless Glide Inhibit is on the missile glides (LOTG / EOMG) with the seeker wide open, to find a threat further out. Shapes are schematic: the manual gives no numbers.">ⓘ</span></h3><svg viewBox="0 0 ${W} ${H}" class="wpv" style="width:100%;height:auto" role="img" aria-label="Side view of the HARM shot"><rect width="${W}" height="${H}" rx="6" fill="#0f1419"/><path d="M0 ${py(0)} H${W}" stroke="#2a3441"/>
      <path d="${P(arc)}" fill="none" stroke="#4aa3ff" stroke-width="2.6"/>${g}<circle cx="${px(-sh).toFixed(1)}" cy="${py(v.alt).toFixed(1)}" r="4" fill="#4aa3ff"/><circle cx="${px(-trip).toFixed(1)}" cy="${py(tp[1]).toFixed(1)}" r="4" fill="#fbbf24"/><path d="M${px(0)} ${py(tg) - 6} l6 6 l-6 6 l-6 -6z" fill="#fff" stroke="#111" stroke-width="1.5"/>
      <g fill="#9aa8b8" font-size="10" font-family="system-ui,sans-serif">${txt(px(-sh) + 8, py(v.alt) + 18, '#9aa8b8', 'Launch ' + fmt(v.alt) + ' ft')}${txt(px(-trip) - 30, py(tp[1]) + 16, '#fbbf24', 'Seeker opens')}${txt(px(0) + 8, py(tg) - 8, '#9aa8b8', 'Emitter')}${t}</g></svg>`;
  }
  // ---------- map (HARM) ----------
  async function ensureMap() {
    const box = deps.root.querySelector('#msh');
    if (!box || !deps.attach) {
      failed = true;
      return;
    }
    const o = await deps.attach(box);
    if (!o) {
      failed = true;
      return;
    }
    if (!o.map._wpR) {
      o.map.createPane('wpP').style.zIndex = 470;
      o.map._wpR = o.L.canvas({ pane: 'wpP' });
    }
    M = { ...o, WL: o.L.layerGroup().addTo(o.map) };
    fit = true;
    const eb = deps.root.querySelector('[data-edit]');
    if (eb) {
      const on = deps.isEdit && deps.isEdit();
      eb.textContent = 'Edit points: ' + (on ? 'On' : 'Off');
      eb.classList.toggle('on', !!on);
    }
  }
  function detachMap() {
    if (!M) return;
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
  // the map layer (satellite / coast) fades with the slider, or is switched off
  function applyOp() {
    if (!M) return;
    const o = st.map.on ? st.map.op / 100 : 0;
    ['tilePane', 'coastP'].forEach(k => {
      const p = M.map.getPane(k);
      if (p) p.style.opacity = o;
    });
  }
  function paint() {
    if (st.mode != 'harm') return;
    if (!M) {
      if (!failed && !pend)
        pend = ensureMap().then(() => {
          pend = null;
          if (M) paint();
        });
      return;
    }
    applyOp();
    const r = res,
      { L, map, WL } = M,
      RN = map._wpR;
    WL.clearLayers();
    if (!r || r.error) return;
    const ll = p => deps.ll(p.n, p.e),
      circ = (rf, col, dash, tip) =>
        L.circle(ll(r.em), {
          renderer: RN,
          radius: rf * 0.3048,
          color: col,
          weight: 2,
          opacity: 0.9,
          dashArray: dash,
          fill: false,
          interactive: false,
        }).addTo(WL);
    if (r.ringFt) circ(r.ringFt, '#ff5d5d', '', 'SAM');
    circ(r.rMax, '#38bdf8', '6 5');
    if (r.seekerOn) circ(r.seekerOn.ft, '#fbbf24', '2 6'); // where the seeker opens
    if (r.foot && r.shot)
      L.polygon(r.foot.map(ll), {
        renderer: RN,
        color: '#fff',
        weight: 2,
        opacity: 0.95,
        fillColor: '#fff',
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(WL); // the HTS footprint (white outline of the HAD page)
    if (r.has && r.shot) {
      const w = [];
      w.push(r.launch);
      for (let t = -60; t <= 60; t += 10) w.push(project(r.launch, r.v.heading + t, r.rMax));
      w.push(r.launch);
      L.polygon(w.map(ll), {
        renderer: RN,
        color: '#22d3ee',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#22d3ee',
        fillOpacity: 0.05,
        dashArray: '4 4',
        interactive: false,
      }).addTo(WL);
    }
    L.polyline([ll(r.launch), ll(r.em)], {
      renderer: RN,
      color: '#000',
      weight: 6,
      opacity: 0.4,
      interactive: false,
    }).addTo(WL);
    L.polyline([ll(r.launch), ll(r.em)], { renderer: RN, color: '#fbbf24', weight: 3.5, interactive: false }).addTo(WL);
    const lab = (p, t, d = 'right') =>
      L.circleMarker(ll(p), { radius: 0, opacity: 0, fillOpacity: 0, interactive: false, renderer: RN })
        .bindTooltip(esc(t), { permanent: true, direction: d, className: 'wplab', offset: [8, 0] })
        .addTo(WL);
    L.circleMarker(ll(r.launch), {
      renderer: RN,
      radius: 6,
      fillColor: '#4aa3ff',
      fillOpacity: 1,
      color: '#111',
      weight: 2,
    }).addTo(WL);
    lab(r.launch, 'Launch · ' + h3(r.v.heading) + '°');
    L.circleMarker(ll(r.em), {
      renderer: RN,
      radius: 7,
      fillColor: '#fff',
      fillOpacity: 1,
      color: '#111',
      weight: 2,
    }).addTo(WL);
    lab(r.em, r.em.label);
    if (fit) {
      fit = false;
      map.invalidateSize();
      const b = L.latLngBounds([ll(r.launch), ll(r.em)]);
      const e = r.rMax / FT_KM / 111;
      map.fitBounds(b.extend([ll(r.em)[0] + e, ll(r.em)[1]]).extend([ll(r.em)[0] - e, ll(r.em)[1]]), {
        padding: [40, 40],
        maxZoom: 10,
        animate: false,
      });
    }
  }

  function draw(keepLeft) {
    load();
    const root = deps.root,
      c = cur(),
      L = tab(st.mode),
      E = emitters();
    lastE = E;
    compute();
    if (!keepLeft || !root.querySelector('.wpl')) {
      detachMap();
      failed = false;
      pend = null;
      fit = true;
      const tabs = deps.only
        ? ''
        : `<div class="wtabs" role="tablist">${modes.map(([k, l]) => `<button type="button" role="tab" class="${st.mode == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>`;
      const msel = `<div class="wrow"><label>Missile</label><select data-pick="msl">${L.map(k => `<option value="${esc(k)}"${k === c.msl ? ' selected' : ''}>${esc(mslName(k))}</option>`).join('')}</select></div>`;
      const left =
        st.mode == 'harm'
          ? `<div class="wcard"><h3>Shot<span class="wtip" title="POS: the HARM is shot at the known position of the emitter (a steerpoint). HAS: the HARM is the sensor and sees only emitting radars within ±60°. HAD: the HTS pod gives the position; the missile is shot as in POS. The range is the table range of the missile for the launch altitude and speed; the flight time is an estimate.">ⓘ</span></h3>
          <div class="wrow"><label>Mode</label>${seg(
            'mode',
            [
              ['pos', 'POS'],
              ['has', 'HAS'],
              ['had', 'HAD'],
            ],
            c.mode
          )}</div>
          ${
            c.mode == 'has'
              ? ''
              : `<div class="wrow"><label>Submode</label>${seg(
                  'sub',
                  [
                    ['EOM', 'EOM'],
                    ['PB', 'PB'],
                    ['RUK', 'RUK'],
                  ],
                  c.sub
                )}</div>`
          }
          <div class="wrow"><label>Target isolate</label>${seg(
            'iso',
            [
              [0, 'Off'],
              [1, 'On'],
            ],
            c.iso
          )}</div>
          <div class="wrow"><label>Glide inhibit</label>${seg(
            'gi',
            [
              [0, 'Off'],
              [1, 'On'],
            ],
            c.gi
          )}</div>
          <div class="wrow"><label>Emitter</label><select data-pick="em">${E.map(x => `<option value="${x.v}"${(st.em ? st.em === x.v : x === E[0]) ? ' selected' : ''}>${esc(x.label)}${x.ringNm ? ' · ' + x.ringNm.toFixed(0) + ' nm' : ''}</option>`).join('') || '<option>no PPT in the DTC</option>'}</select></div>${msel}
          ${['heading', 'alt', 'speed', 'tgtAlt', 'shotPct', 'offNose'].map(slider).join('')}</div>`
          : `<div class="wcard"><div class="wh"><h3>Your shot<span class="wtip" title="Your missile, launched from your altitude and speed at the target (the enemy). Maximum range from the BMS table for the launch altitude, speed and target altitude (head-on). Against another aspect it is scaled with the target speed and a mean missile speed: R = Rhead (Vm + Vt cos aspect) / (Vm + Vt). An estimate, not BMS code. Enemy MAR: the range at which that target has to turn and run. The speeds are in knots (true airspeed) or in Mach, as chosen at the top right.">ⓘ</span></h3>${hdrCtl('bvr')}</div>${msel}
          ${['alt', 'speed', 'tgtAlt', 'tgtSpeed', 'aspect', 'shotPct'].map(slider).join('')}<div class="wrow"><label>Target</label>${seg(
            'tgtSize',
            [
              ['small', 'Small fighter'],
              ['fighter', 'Fighter'],
              ['bomber', 'Bomber'],
            ],
            c.tgtSize
          )}</div></div>`;
      if (st.mode == 'bvr')
        root.innerHTML = `${tabs}<div class="wpg" style="grid-template-columns:480px minmax(0,1fr) 340px"><div class="wpc" style="grid-column:1;grid-row:1;min-width:0"><div class="wpc" id="mstlbox" style="grid-column:auto;grid-row:auto"></div><div class="wpl" style="grid-row:auto">${left}</div></div><div class="wpc" id="msch" style="grid-column:2;grid-row:1"></div><div class="wpc" style="grid-column:3;grid-row:1;min-width:0"><div class="wpr" id="msr" style="grid-column:auto;grid-row:auto"></div></div></div>`;
      else
        root.innerHTML = `${tabs}<div class="wpg"><div class="wpl">${left}</div>${
          st.mode == 'harm'
            ? `<div class="wpc"><div class="wcard" id="wpmc"><div class="wh"><h3>Horizontal envelope</h3><button class="btn g" type="button" data-fit>Fit view</button><button class="btn g" type="button" data-edit title="Edit points: the DTC points of the map (PPT, targets, lines) can be dragged only when this is on. Off by default, so a point is not moved by mistake.">Edit points: Off</button><button class="btn g" type="button" style="min-width:104px" data-planonly title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div><div class="wrow wmap"><label>Map layer</label>${seg(
                'mapon',
                [
                  ['1', 'On'],
                  ['0', 'Off'],
                ],
                st.map.on ? 1 : 0
              )}<div class="slr"${st.map.on ? '' : ' hidden'}><label>Opacity</label><input type="range" min="0" max="100" step="5" value="${st.map.op}" data-mop><em data-em="mop">${st.map.op}%</em></div><div class="wobj"><label>Objects</label>${seg(
                'objon',
                [
                  ['1', 'On'],
                  ['0', 'Off'],
                ],
                deps.objectsOn && deps.objectsOn() ? 1 : 0
              )}</div></div><div id="msh" class="wmapbox"></div><div class="wleg">${HLEG.map(([c, t, d]) => `<span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${c}" stroke-width="3"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>${t}</span>`).join('')}</div><p class="hint wnote">The seeker opens at the trip point (POS / HAD); the white outline is the HTS footprint (the heart of EOM / RUK, the wedge of PB), HAS shows its ±60°.</p></div></div>`
            : ''
        }<div class="wpr"><div id="msv" style="display:contents"></div><div id="msr" style="display:contents"></div></div></div>`;
      wire(root);
    }
    root.querySelector('#msr').innerHTML = results();
    if (st.mode == 'harm') {
      const h = harmVert(res),
        mv = root.querySelector('#msv');
      if (mv) mv.innerHTML = h ? `<div class="wcard">${h}</div>` : '';
    }
    const tb = root.querySelector('#mstlbox');
    if (tb) tb.innerHTML = tlCard();
    const sc = root.querySelector('#msch');
    if (sc) sc.innerHTML = schemeCard();
    paint();
  }

  // a value of the timeline card by its id: std.<field> (yours) or en.<row>.<field> (an enemy's; the first change gives it its own altitude and speed)
  const tlGet = id => {
    const p = id.split('.');
    return p[0] == 'std' ? st.tl.std[p[1]] : tlEff(+p[1])[p[2]];
  };
  const tlSet = (id, v) => {
    const p = id.split('.');
    if (p[0] == 'std') st.tl.std[p[1]] = v;
    else {
      const i = +p[1];
      st.tl.en[i] = st.tl.en[i] || tlEff(i);
      st.tl.en[i][p[2]] = v;
    }
  };
  // a value of the timeline card changed (a slider moving, a number typed): its text, the enemies that fly like you, the marks of the enemies, the table and the drawing
  // are put right in place, without drawing the card again, so the slider or the box in use keeps the focus (the Tab key goes on to the next box)
  function tlPatch(root, id) {
    const k = id.split('.').pop(),
      v = tlGet(id),
      em = root.querySelector(`[data-tle="${id}"]`),
      bx = root.querySelector(`input[data-tlb="${id}"]`);
    if (em) em.textContent = ttxt(k, v);
    if (bx && +bx.value !== v) bx.value = v;
    if (id.startsWith('std.'))
      st.tl.en.forEach((o, i) => {
        if (o) return;
        ['alt', 'spd'].forEach(f => {
          const e = `en.${i}.${f}`,
            s = root.querySelector(`input[data-tls="${e}"]`),
            b = root.querySelector(`input[data-tlb="${e}"]`),
            m = root.querySelector(`[data-tle="${e}"]`);
          if (s) s.value = st.tl.std[f];
          if (b) b.value = st.tl.std[f];
          if (m) m.textContent = ttxt(f, st.tl.std[f]);
        });
      });
    st.tl.en.forEach((o, i) => {
      const a = root.querySelector(`[data-tlopen="${i}"]`),
        h = root.querySelector(`.wen[data-i="${i}"] .wenh`);
      if (a) {
        a.classList.toggle('ov', !!o);
        a.title = exTitle(i);
      }
      if (h) h.innerHTML = enHead(i);
    });
    const t = root.querySelector('#mstlt');
    if (t) t.innerHTML = tlTable();
    const sc = root.querySelector('#msch');
    if (sc) sc.innerHTML = schemeCard();
  }
  // switches and segmented buttons that are drawn again with the page: they start as they were and move to their new state, so their transition is seen
  // (the CSS does the rest: it is off with Settings > Animations and with the system "reduce motion")
  function flip(els, was, now) {
    els.forEach(b => b.classList.toggle('on', was(b)));
    void document.body.offsetWidth; // the old look is on the screen before the new one is set
    els.forEach(b => b.classList.toggle('on', now(b)));
  }
  // another row of the table chosen: the yellow mark moves in place (the colour changes smoothly) and the drawing of that class fades in
  function tlSelect(root, i) {
    if (i === tlData().sel) return;
    st.tl.sel = i;
    save();
    root.querySelectorAll('tr[data-tlsel]').forEach(r => r.classList.toggle('sel', +r.dataset.tlsel === i));
    const sc = root.querySelector('#msch');
    if (sc) {
      sc.innerHTML = schemeCard();
      if (sc.firstElementChild) sc.firstElementChild.classList.add('fx');
    }
  }
  // the unit of the speeds of a card changes: every speed is converted at its own altitude, so it stays the same speed
  function setUnit(w, u) {
    if (u != 'kt' && u != 'mach') return;
    if (w == 'bvr') {
      const c = st.bvr,
        old = { speed: c.speed, tgtSpeed: c.tgtSpeed };
      if (bvrU() == u) return;
      c.u = u;
      Object.keys(SPEED).forEach(f => {
        const [, , a, b, , dec] = sdef(f);
        c[f] = rnd(u == 'kt' ? toKt(old[f], c[SPEED[f]]) : toMach(old[f], c[SPEED[f]]), a, b, dec);
      });
    } else {
      const t = st.tl,
        old = { s: t.std.spd, e: t.en.map(o => (o ? o.spd : null)) };
      if (tlU() == u) return;
      t.u = u;
      const [, , a, b, , dec] = tdef('spd'),
        cv = (v, alt) => rnd(u == 'kt' ? toKt(v, alt) : toMach(v, alt), a, b, dec);
      t.std.spd = cv(old.s, t.std.alt);
      t.en.forEach((o, i) => {
        if (o) o.spd = cv(old.e[i], o.alt);
      });
    }
  }
  function wire(root) {
    if (!root._tl) {
      root._tl = 1;
      root.addEventListener('change', e => {
        const t = e.target,
          d = t.dataset || {};
        if (d.tlb) {
          // a number box of the timeline card (the Sliders switch is off): kept in its range, an empty box keeps the old value
          const [, , a, z, , dec] = tdef(d.tlb.split('.').pop());
          let n = t.value === '' ? NaN : rnd(+t.value, a, z, dec);
          if (isNaN(n)) n = tlGet(d.tlb);
          tlSet(d.tlb, n);
          save();
          tlPatch(root, d.tlb);
          return;
        }
        if (!d.tl) return;
        const [a, i] = d.tl.split('.');
        if (a == 'msl') st.tl.msl[+i] = t.value;
        else {
          // another aircraft in the row: its missile, altitude and speed start again
          st.tl.cls[+i] = t.value;
          st.tl.msl[+i] = '';
          st.tl.en[+i] = null;
          st.tl.open[+i] = false;
        }
        save();
        draw(true);
      });
      root.addEventListener('input', e => {
        // a slider of the timeline card: only the table, the drawing and the marks are redrawn, so the slider keeps being dragged
        const id = e.target.dataset && e.target.dataset.tls;
        if (!id) return;
        tlSet(id, +e.target.value);
        save();
        tlPatch(root, id);
      });
      root.addEventListener('click', e => {
        const c = e.target.closest ? s => e.target.closest(s) : () => null;
        const q = c('[data-tlsel]');
        if (q) {
          tlSelect(root, +q.dataset.tlsel);
          return;
        }
        const u = c('[data-unit]');
        if (u) {
          const w = u.dataset.unit,
            was = w == 'bvr' ? bvrU() : tlU();
          setUnit(w, u.dataset.v);
          save();
          draw(false);
          flip(
            [...root.querySelectorAll(`[data-unit="${w}"]`)],
            b => b.dataset.v == was,
            b => b.dataset.v == u.dataset.v
          );
          return;
        }
        if (c('[data-sliders]')) {
          const was = sliders();
          st.sliders = was ? 0 : 1;
          save();
          draw(false);
          // the cards were drawn again with the sliders or the number boxes: the switch slides, the cards fade in
          flip(
            [...root.querySelectorAll('[data-sliders]')],
            () => !!was,
            () => !!sliders()
          );
          root.querySelectorAll('#mstl, .wpl > .wcard').forEach(x => x.classList.add('fx'));
          return;
        }
        const o = c('[data-tlopen]');
        if (o) {
          const i = +o.dataset.tlopen,
            w = root.querySelector(`.wen[data-i="${i}"]`);
          st.tl.open[i] = !st.tl.open[i];
          save();
          if (w) {
            // in place: the arrow turns and the block opens or closes smoothly
            w.classList.toggle('open', !!st.tl.open[i]);
            o.classList.toggle('on', !!st.tl.open[i]);
            o.setAttribute('aria-expanded', String(!!st.tl.open[i]));
          } else draw(true);
          return;
        }
        const l = c('[data-tllike]');
        if (l) {
          st.tl.en[+l.dataset.tllike] = null;
          save();
          draw(true);
          return;
        }
        if (c('[data-tlfill]') && deps.fillBvr && !tlSame()) {
          deps.fillBvr(tlRows());
          tlBase = tlSig();
          const t = root.querySelector('#mstlt');
          if (t) t.innerHTML = tlTable();
        }
      });
    }
    const upd = () => {
      save();
      draw(true);
    };
    root.querySelectorAll('[data-mode]').forEach(
      b =>
        (b.onclick = () => {
          if (st.mode != b.dataset.mode) {
            st.mode = b.dataset.mode;
            save();
            draw(false);
          }
        })
    );
    root.querySelectorAll('[data-set]').forEach(
      b =>
        (b.onclick = () => {
          const f = b.dataset.set;
          if (f == 'objon' || f == 'mapon') {
            if (f == 'objon') {
              if (deps.objectsAll) deps.objectsAll(b.dataset.v == '1');
            } else {
              st.map.on = b.dataset.v == '1';
              const sl = root.querySelector('.wmap .slr');
              if (sl) sl.hidden = !st.map.on;
              applyOp();
              save();
            }
            b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            return;
          }
          cur()[b.dataset.set] = ['iso', 'gi'].includes(b.dataset.set) ? +b.dataset.v : b.dataset.v;
          b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          save();
          draw(b.dataset.set != 'mode');
        })
    );
    root.querySelectorAll('input[data-mop]').forEach(
      i =>
        (i.oninput = () => {
          st.map.op = +i.value;
          const em = root.querySelector('[data-em="mop"]');
          if (em) em.textContent = i.value + '%';
          applyOp();
          save();
        })
    );
    root.querySelectorAll('input[data-sl]').forEach(
      i =>
        (i.oninput = () => {
          const f = i.dataset.sl;
          cur()[f] = +i.value;
          const em = root.querySelector(`[data-em="${f}"]`);
          if (em) em.textContent = stxt(f, +i.value);
          const nb = root.querySelector(`input[data-num="${f}"]`);
          if (nb) nb.value = i.value;
          upd();
        })
    );
    root.querySelectorAll('input[data-num]').forEach(
      nb =>
        (nb.onchange = () => {
          const f = nb.dataset.num,
            [, , a, b, , dec] = sdef(f);
          let n = nb.value === '' ? NaN : rnd(+nb.value, a, b, dec);
          if (isNaN(n)) n = cur()[f];
          nb.value = n;
          cur()[f] = n;
          const s = root.querySelector(`input[data-sl="${f}"]`);
          if (s) s.value = n;
          upd();
        })
    );
    root.querySelectorAll('select[data-pick]').forEach(
      s =>
        (s.onchange = () => {
          if (s.dataset.pick == 'em') {
            st.em = s.value;
            fit = true;
            const e = emitters().find(x => x.v === s.value);
            if (e && e.alt > 0) st.harm.tgtAlt = Math.min(55000, Math.round(e.alt / 500) * 500);
          } else cur().msl = s.value;
          save();
          draw(true);
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
    const fb = root.querySelector('[data-fit]');
    if (fb)
      fb.onclick = () => {
        fit = true;
        paint();
      };
  }
  let lastE = [];
  function refresh() {
    if (!deps.root.isConnected || deps.root.closest('.hide') || st.mode != 'harm') return;
    const E = emitters(),
      sig = a => JSON.stringify(a.map(e => [e.v, e.label]));
    if (st.em && !E.some(x => x.v === st.em)) {
      const o = lastE.find(x => x.v === st.em),
        m = o && E.find(x => Math.abs(x.n - o.n) < 1 && Math.abs(x.e - o.e) < 1);
      if (m) st.em = m.v;
    }
    const same = sig(E) === sig(lastE);
    lastE = E;
    draw(same);
  }
  return {
    refresh,
    rows: tlRows,
    // the rows of the timeline once the missile files are read (the datacard fills its BVR box with them)
    rowsReady: async () => {
      await load();
      return tlRows();
    },
    calc: c => {
      load();
      if (!c) return null;
      // a class that is in a row of the table gives the numbers of that row (its missile and its enemy's conditions)
      const i = st.tl.cls.indexOf(c);
      return i >= 0 ? tl1(c, tlStd(), slotMsl(i), tlEn(i)) : tl1(c, tlStd(), null, null);
    },
    tlCache: () => TLC.m.size,
    render: () => {
      if (!deps.root.isConnected || deps.root.closest('.hide')) return;
      draw(false);
    },
    root: deps.root,
    leave: detachMap,
    state: () => st,
    setState: o => {
      if (o && typeof o == 'object') {
        st = {
          ...st,
          ...o,
          harm: { ...st.harm, ...(o.harm && typeof o.harm == 'object' ? o.harm : {}) },
          bvr: mergeBvr(st.bvr, o.bvr),
          tl: mergeTl(st.tl, o.tl),
          map: { ...st.map, ...(o.map && typeof o.map == 'object' ? o.map : {}) },
          mode: deps.only || o.mode || st.mode,
        };
        norm();
        save();
        refresh();
      }
    },
    result: () => res,
  };
}
