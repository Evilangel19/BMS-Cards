// Missiles page: HARM shot at a threat (POS / HAS) with the map, and radar missile range against aspect (BVR). The maths is in airmissile.js, the numbers come
// from the BMS Misdata tables (missiledata.js; three missiles are built in). deps: {root, esc, points(), ll(n, e), attach(el), detach(), missiles() -> {name: data}}
import D0 from '../data/index.js';
import { timeline, CLASSES, STD } from './bvrtimeline.js';
import { bvrShot, harmShot, marShot, harmFootprint, HARM_SUB, NM } from './airmissile.js';
import { dist, bearing, project } from './popup.js';

const FT_KM = 3280.84;
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
      alt: 25000,
      speed: 450,
      tgtAlt: 25000,
      tgtSpeed: 450,
      aspect: 0,
      shotPct: 100,
      tgtSize: 'fighter',
    },
    tl: { std: { ...STD }, sel: 0, cls: ['Su-27', 'Mig-29A', 'F-16C', 'Mig-31'] },
  };
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (o)
      st = {
        ...st,
        ...o,
        harm: { ...st.harm, ...o.harm },
        bvr: { ...st.bvr, ...o.bvr },
        mode: deps.only || o.mode,
        tl: {
          std: { ...st.tl.std, ...(o.tl && o.tl.std) },
          sel: (o.tl && o.tl.sel) || 0,
          cls: (o.tl && o.tl.cls) || st.tl.cls,
        },
      };
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
          (kind == 'harm' ? DB[k].params.seekerType === 2 : [1, 6].includes(DB[k].params.seekerType))
      )
      .sort();
  function load() {
    if (asked || !deps.missiles) return;
    asked = true;
    Promise.resolve(deps.missiles())
      .then(m => {
        if (m && Object.keys(m).length) {
          DB = { ...DB, ...m };
          if (deps.root.querySelector('.wpg')) draw(false);
        }
      })
      .catch(() => {});
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
      res = bvrShot(m, { ...c, kind: 'aam' });
      return;
    }
    const E = emitters(),
      em = E.find(x => x.v === st.em) || E[0];
    if (!em) return;
    res = harmShot(m, m.loft, { ...c, emitter: { n: em.n, e: em.e }, ringNm: em.ringNm, tgtAlt: c.tgtAlt });
    res.em = em;
  }

  const slider = f => {
    const [l, u, a, b, s] = SL[f],
      v = cur()[f],
      num =
        f == 'heading'
          ? `<span class="wnumw"><input type="number" class="wnum" data-num="${f}" min="${a}" max="${b}" step="1" value="${v}">°</span>`
          : `<em data-em="${f}">${fmt(v)}${u}</em>`;
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
    const tiles = `<div class="tile"><span>Rmax at ${r.v.aspect}° aspect</span><b>${(r.rMax / NM).toFixed(1)} nm</b></div><div class="tile"><span>MAR at ${fmt(r.v.tgtSpeed)} kt</span><b>${Math.max(0, mv).toFixed(1)} nm</b></div>`;
    return `<div class="wpt">${tiles}</div><div class="wcard"><h3>Rmax against aspect</h3>${chart(r)}</div>
      <div class="wcard"><h3>DLZ · launch zone and shot<span class="wtip" title="Cues of the AIM-120 dynamic launch zone (manual 4.3.2.5.1.1). RAERO: the range at this aspect (table range, target not manoeuvring). RTR: the same for a target turned to tail aspect (no-escape). A-pole: range between the aircraft when the seeker goes active, at the pitbull range of the missile file for the target size. F-pole: range at impact. ROPT, RPI and RMIN depend on the termination criteria of the missile and are not in the files, so they are not shown.">ⓘ</span></h3><div class="kv">
      ${kv('RAERO', (r.dlz.raero / NM).toFixed(1) + ' nm')}${kv('RTR', (r.dlz.rtr / NM).toFixed(1) + ' nm')}${kv('A-POLE', r.dlz.aPole === null ? 'no pitbull range in the file' : (r.dlz.aPole / NM).toFixed(1) + ' nm (active ' + fmt(r.flight - (r.dlz.timeToActive || 0)) + ' s before impact)')}${kv('F-POLE', (r.dlz.fPole / NM).toFixed(1) + ' nm')}${kv('CLOSURE', fmt(r.dlz.closure) + ' kt')}${kv('PITBULL RANGE', r.dlz.pitbullNm ? r.dlz.pitbullNm + ' nm (' + { small: 'small fighter', fighter: 'fighter', bomber: 'bomber' }[r.v.tgtSize || 'fighter'] + ')' : '-')}${kv('RMAX HEAD-ON', (r.rHead / NM).toFixed(1) + ' nm (table)')}${kv('SHOT RANGE', (r.shot / NM).toFixed(1) + ' nm')}${kv('FLIGHT TIME', fmt(r.flight) + ' s')}${kv('MEAN MISSILE SPEED', 'Mach ' + (r.vm / 1000).toFixed(1) + '+ (assumed)')}</div></div>
      <div class="wcard"><h3>MAR · minimum abort range<span class="wtip" title="The closest the shooter can be and the target still turn and run, so that the missile falls to the stall speed before it arrives (BVR1 paper, turn-and-run). Uniform: constant deceleration from the missile's maximum speed so that it covers its Rmax. Variable: deceleration growing with the square of the speed, with the paper's measured maximum deceleration (only for the missiles it covers). The target's speed is the aborting aircraft's speed.">ⓘ</span></h3><div class="kv">
      ${kv('MAR, UNIFORM DECEL', Math.max(0, mar.uniform).toFixed(1) + ' nm')}${kv('MAR, VARIABLE DECEL', mar.variable !== null ? Math.max(0, mar.variable).toFixed(1) + ' nm' : 'not available for this missile')}
      ${kv('STALL SPEED', fmt(mar.stall) + ' kt TAS' + (r.v.tgtSpeed > mar.vStall ? ' (the target speed)' : ' (400 KIAS)'))}${kv('MISSILE MAX SPEED', fmt(mar.vMax) + ' kt' + (mar.known ? '' : ' (assumed)'))}${kv('RMAX USED', mar.mor.toFixed(1) + ' nm')}</div></div>`;
  }

  // BVR timeline card: standard conditions + up to 4 enemy classes -> MTR / TR / DOR / DR / MAR / STERN WEZ (+ FR), a scheme of the selected one and the datacard fill
  const STDF = [
    ['alt', 'Altitude (ft)', 0, 50000, 1000],
    ['mach', 'Mach', 0.3, 2, 0.05],
    ['tNotch', 'T notch (s)', 0, 60, 1],
    ['tRecommit', 'T recommit (s)', 0, 90, 1],
  ];
  const f1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toString());
  // the timeline of a class is kept in memory: it is worked out again only when its inputs change (the class, the standard conditions, the missile, the missile data)
  const TLC = { db: null, m: new Map() };
  function tl1(c, std, msl) {
    if (TLC.db !== DB) {
      TLC.db = DB;
      TLC.m.clear();
    }
    const key = JSON.stringify([c, std, msl]);
    if (TLC.m.has(key)) return TLC.m.get(key);
    const r = timeline(c, DB, std, msl);
    if (TLC.m.size > 64) TLC.m.clear();
    TLC.m.set(key, r);
    return r;
  }
  function tlRows() {
    return st.tl.cls.map(c => (c ? tl1(c, st.tl.std, st.bvr.msl) : null));
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
  const STDU = { alt: ' ft', mach: '', tNotch: ' s', tRecommit: ' s' };
  const tlData = () => {
    const R = tlRows(),
      t = st.tl,
      sel = R[t.sel] ? t.sel : R.findIndex(x => x);
    return { R, t, sel };
  };
  // the table of the classes with the Fill datacard button (re-drawn alone while a slider moves)
  // Fill datacard is off until something is changed (classes, missile, conditions) after the page opened or after the last fill
  let tlBase = null;
  const tlSig = () => JSON.stringify([st.tl.cls, st.tl.std, st.bvr.msl]);
  // Fill datacard is on only while the datacard differs from the table (the page asks the datacard); without that link, it compares with the last fill
  const tlSame = () => (deps.bvrSame ? !!deps.bvrSame(tlRows()) : tlSig() === tlBase);
  function tlTable() {
    const { R, sel } = tlData();
    if (tlBase === null) tlBase = tlSig();
    const same = tlSame();
    const rows = R.map((r, i) =>
      r
        ? `<tr data-tlsel="${i}" style="cursor:pointer${i === sel ? ';font-weight:700;color:#ffe680' : ''}" title="${esc(r.src + ' · ' + r.cat)} — click to draw the scheme"><td>${esc(r.cls)}</td><td>${f1(r.mtr)}</td><td>${f1(r.tr)}</td><td>${f1(r.dor)}</td><td>${f1(r.dr)}</td><td>${f1(r.mar)}</td><td>${f1(r.stern)}</td><td>${f1(r.fr)}</td><td style="text-align:left">${r.msl ? esc(r.msl) + (r.picked ? ' ★' : '') : 'Threat Guide'}</td></tr>`
        : ''
    ).join('');
    return `<table class="wtl" style="border-spacing:8px 2px;border-collapse:separate"><tr><th>Class</th><th>MTR</th><th>TR</th><th>DOR</th><th>DR</th><th>MAR</th><th>STERN</th><th>FR</th><th style="text-align:left">Missile</th></tr>${rows}</table><div class="wrow"><button type="button" class="btn${same ? ' nil' : ''}" data-tlfill${same ? ' disabled title="The datacard already holds this table: change a class, the missile or the conditions first."' : ''}>Fill datacard</button></div>`;
  }
  // the left card: the table, the classes in a column and the standard conditions as sliders
  function tlCard() {
    const t = st.tl;
    const std = STDF.map(
      ([k, l, a, b, step]) =>
        `<div class="slr"><label>${l}</label><input type="range" min="${a}" max="${b}" step="${step}" value="${t.std[k]}" data-tls="std.${k}"><em data-tle="${k}">${k == 'alt' ? fmt(t.std[k]) : t.std[k]}${STDU[k]}</em></div>`
    ).join('');
    const pick = t.cls
      .map(
        (c, i) =>
          `<div class="wrow"><label>Class ${i + 1}</label><select data-tl="cls.${i}"><option value="">—</option>${CLASSES.map(x => `<option${x.n === c ? ' selected' : ''}>${esc(x.n)}</option>`).join('')}</select></div>`
      )
      .join('');
    return `<div class="wcard" id="mstl"><h3>BVR timeline · datacard<span class="wtip" title="Standard conditions: the same altitude and speed are used for both aircraft (the enemy's launch and your own escape), head-on (closure = 2 x speed). MAR: the paper model with the enemy class's best radar missile (Threat Guide MAR when the missile is not in the data files). DR = MAR + closure x T notch. DOR = DR + closure x T recommit. STERN WEZ: the tail-chase range of that missile. TR, MTR and FR are arbitrary values that follow the kind of enemy (short, medium or long range). Order: MTR > TR > DOR > DR > MAR > STERN WEZ. MTR, FR, MAR, DR and DOR go to the BVR box of the datacard.">ⓘ</span></h3><div id="mstlt">${tlTable()}</div><div class="wsub">${pick}${std}</div></div>`;
  }
  // the drawing of the selected class: its own card in the middle
  function schemeCard() {
    const { R, sel } = tlData();
    return sel >= 0
      ? `<div class="wcard" id="msch2"><h3>BVR timeline · scheme · ${esc(R[sel].cls)}</h3>${scheme(R[sel])}</div>`
      : '';
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
      t = '',
      k = 0;
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
      const msel = `<div class="wrow"><label>Missile</label><select data-pick="msl">${L.map(k => `<option${k === c.msl ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></div>`;
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
          : `<div class="wcard"><h3>Shot<span class="wtip" title="Maximum range from the BMS table for the launch altitude, speed and target altitude (head-on). Against another aspect it is scaled with the target speed and a mean missile speed: R = Rhead (Vm + Vt cos aspect) / (Vm + Vt). An estimate, not BMS code.">ⓘ</span></h3>${msel}
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
        root.innerHTML = `${tabs}<div class="wpg"><div class="wpl">${left}</div>${st.mode == 'harm' ? `<div class="wpc"><div class="wcard" id="wpmc"><div class="wh"><h3>Horizontal envelope</h3><button class="btn g" type="button" data-fit>Fit view</button><button class="btn g" type="button" data-edit title="Edit points: the DTC points of the map (PPT, targets, lines) can be dragged only when this is on. Off by default, so a point is not moved by mistake.">Edit points: Off</button><button class="btn g" type="button" style="min-width:104px" data-planonly title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div><div id="msh" class="wmapbox"></div><div class="wleg">${HLEG.map(([c, t, d]) => `<span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${c}" stroke-width="3"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>${t}</span>`).join('')}</div><p class="hint wnote">The seeker opens at the trip point (POS / HAD); the white outline is the HTS footprint (the heart of EOM / RUK, the wedge of PB), HAS shows its ±60°.</p></div></div>` : ''}<div class="wpr"><div id="msv" style="display:contents"></div><div id="msr" style="display:contents"></div></div></div>`;
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

  function wire(root) {
    if (!root._tl) {
      root._tl = 1;
      root.addEventListener('change', e => {
        const k = e.target.dataset && e.target.dataset.tl;
        if (!k) return;
        const [a, b] = k.split('.');
        if (a == 'std') st.tl.std[b] = +e.target.value;
        else st.tl.cls[+b] = e.target.value;
        save();
        draw(true);
      });
      root.addEventListener('input', e => {
        // a slider of the standard conditions: only the table and the drawing are redrawn, so the slider keeps being dragged
        const k = e.target.dataset && e.target.dataset.tls;
        if (!k) return;
        const b = k.split('.')[1];
        st.tl.std[b] = +e.target.value;
        save();
        const em = root.querySelector(`[data-tle="${b}"]`);
        if (em) em.textContent = (b == 'alt' ? fmt(e.target.value) : e.target.value) + STDU[b];
        const t = root.querySelector('#mstlt');
        if (t) t.innerHTML = tlTable();
        const sc = root.querySelector('#msch');
        if (sc) sc.innerHTML = schemeCard();
      });
      root.addEventListener('click', e => {
        const q = e.target.closest && e.target.closest('[data-tlsel]');
        if (q) {
          st.tl.sel = +q.dataset.tlsel;
          save();
          draw(true);
          return;
        }
        if (e.target.closest && e.target.closest('[data-tlfill]') && deps.fillBvr && !tlSame()) {
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
          cur()[b.dataset.set] = ['iso', 'gi'].includes(b.dataset.set) ? +b.dataset.v : b.dataset.v;
          b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          save();
          draw(b.dataset.set != 'mode');
        })
    );
    root.querySelectorAll('input[data-sl]').forEach(
      i =>
        (i.oninput = () => {
          const f = i.dataset.sl;
          cur()[f] = +i.value;
          const em = root.querySelector(`[data-em="${f}"]`);
          if (em) em.textContent = fmt(i.value) + SL[f][1];
          const nb = root.querySelector(`input[data-num="${f}"]`);
          if (nb) nb.value = i.value;
          upd();
        })
    );
    root.querySelectorAll('input[data-num]').forEach(
      nb =>
        (nb.onchange = () => {
          const f = nb.dataset.num,
            [, , a, b] = SL[f];
          let n = Math.round(+nb.value);
          if (isNaN(n)) n = cur()[f];
          n = Math.min(b, Math.max(a, n));
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
    calc: c => {
      load();
      return c ? tl1(c, st.tl.std, st.bvr.msl) : null;
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
        st = { ...st, ...o, mode: deps.only || o.mode || st.mode };
        save();
        refresh();
      }
    },
    result: () => res,
  };
}
