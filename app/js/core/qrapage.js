// @ts-check
// A-A > DCA for a QRA flight (core/qra.js): shown in the place of the FAOR when the flight chosen is a QRA. ALERT (the flight still waits on its
// airbase): the threat axis of the DCA from the base, the intercept range wanted, the scramble line and the checks (radar coverage, enemy airbases
// inside it). INTERCEPT (the campaign launched it: an Intercept steerpoint): the vector, the collision point, the commit, the stern conversion with
// VID in the ROE. The A-A block of the ROE follows the page, the Map page draws it (Display > DCA), its lines go into the DTC, its cards to the Kneeboard.
// deps: as core/faorpage.js; ctx () -> X: {ok, why, me {key, name, mission, kind, n, ac, pkgNo, tag}, base {x, y, name}, t0 (take-off, ms),
//   ic {x, y, n, arr} | null (the Intercept steerpoint), tgt {name, ac, gone, st {x, y, t, hdg, gs, alt} | null} | null, enemy [{x, y, name}] (the axis),
//   abs [{x, y, name}] (enemy airbases), radars [{x, y, rng km}] (friendly), awacs, bull, joker, bingo, aa}
import { threatBrg, bearing, distNm, altTxt, KM_NM, faorLines } from './faor.js';
import {
  QRA_RANGE,
  cleanQra,
  qraAlert,
  qraIntercept,
  qraFromStpt,
  coverNm,
  qraChecks,
  qraRoe,
  qraDtcLines,
  LINE_NM,
  CLIMB_KT,
} from './qra.js';
import { mapKeep } from './mapkeep.js';
import { SC_W, SC_H } from './smartcard.js';
import { drawSmartAA } from './smartaa.js';
import { drawSmartCombined } from './smartcombo.js';
import { wxAtTarget } from './smartwx.js';
import { toMag } from './magvar.js';
import { drawAACard, aaBox, AAC_W, AAC_H } from './aacard.js';
import { busyRun } from './busy.js';
import { h3, hm, drawLeaflet, toPx, toInk, snapMap, addCards, allOf } from './aakit.js';

const COL = {
  ic: '#4aa3ff',
  scr: '#ef4444',
  commit: '#f0b040',
  base: '#4cc38a',
  tgt: '#ef4444',
  conv: '#ffffff',
  grey: '#9aa8b8',
};
const KINDS = [
  ['map', 'With the map'],
  ['smart', 'Smart QRA'],
  ['combo', 'Smart mission'],
];
const ang = ft => 'ANGELS ' + Math.round(ft / 1000);

export function createQraPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'qrpage';
  let st = { f: {} },
    X = null,
    S = null,
    mode = 'ALERT',
    A = null, // the alert plan
    I = null, // the intercept plan
    COV = null,
    W = [],
    M = null,
    pend = null,
    failed = false,
    fit = true,
    fitKey = '',
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('qra1') || 'null');
    if (o && typeof o == 'object' && o.f && typeof o.f == 'object') st = o;
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem('qra1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const roeNow = () => {
    try {
      return deps.roeGet ? deps.roeGet() : null;
    } catch (e) {
      return null;
    }
  };
  const vid = () => {
    const r = roeNow();
    return !!(r && r.roe.id.includes('vid'));
  };

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    A = I = null;
    W = [];
    if (!X || !X.ok) return (S = null);
    S = cleanQra(st.f[X.me.key]);
    if (!st.f[X.me.key]) {
      st.f[X.me.key] = { ...S };
      save();
    }
    mode = X.ic ? 'INTERCEPT' : 'ALERT';
    const v = vid(),
      roe = roeNow();
    if (mode == 'ALERT') {
      A = qraAlert(X.base, threatBrg(X.base, X.enemy), S);
      COV = coverNm(X.base, A.u, X.radars);
    } else {
      const T = X.tgt && X.tgt.st;
      I = T ? qraIntercept(X.base, X.t0, T, S, v) : qraFromStpt(X.base, X.t0, X.ic, S, v);
    }
    W = qraChecks(S, X.base, {
      mode,
      A,
      I,
      cover: COV,
      awacs: X.awacs,
      abs: X.abs,
      idOk: roe ? roe.roe.id.length > 0 : null,
      tgt: X.tgt,
      ic: X.ic,
    });
  }
  const block = () =>
    qraRoe(S, mode, {
      vec: toMag(mode == 'ALERT' ? A.brg : I ? I.vec : 0),
      ri: A ? A.ri : I ? I.d : 0,
      rs: A ? A.rs : 0,
    });
  function roeWrite() {
    if (!X || !X.ok || !deps.roeSet) return;
    try {
      deps.roeSet(block());
    } catch (e) {
      /* the ROE page is not there (tests) */
    }
  }
  const set = (k, v) => {
    st.f[X.me.key][k] = v;
    save();
  };
  const be = p => (X.bull ? 'BE ' + h3(toMag(bearing(X.bull, p))) + '/' + Math.round(distNm(X.bull, p)) : '--');
  const tgtName = () => (X.tgt ? X.tgt.ac || X.tgt.name : 'unknown');

  // ---- the page
  const val = {
    cor: v => (v > 0 ? '+' : '') + v + '°',
    ri: v => v + ' NM',
    vt: v => v + ' kt',
    vi: v => v + ' kt',
    tc: v => v + ' min',
    ang: v => altTxt(v),
    commit: v => v + ' NM',
    disp: v => v + ' NM',
  };
  const slider = (k, lab) =>
    `<div class="slr"><label>${lab}</label><input type="range" min="${QRA_RANGE[k][0]}" max="${QRA_RANGE[k][1]}" step="${QRA_RANGE[k][2]}" value="${S[k]}" data-qr="${k}"><em data-qre="${k}">${val[k](S[k])}</em></div>`;
  const seg = (k, opts, c) =>
    `<span class="seg">${opts.map(([v, l, t]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-qrset="${k}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</span>`;
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  let built = '';
  function build() {
    built = X && X.ok ? mode + (vid() ? 'v' : '') : '';
    if (!X || !X.ok) {
      root.innerHTML = `<div class="wcard sdnone fx"><h3>QRA</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a QRA flight.')}</p></div>`;
      return;
    }
    const al = mode == 'ALERT';
    root.innerHTML = `<div class="wpg fag"><div class="wpl">
      <div class="wcard" id="qrfl"></div>
      ${
        al
          ? `<div class="wcard"><h3>Threat axis</h3>${slider('cor', 'Correction')}<p class="hint" id="qrax"></p></div>
      <div class="wcard"><h3>Scramble</h3>${slider('ri', 'Intercept at')}${slider('vt', 'Threat speed')}<p class="hint">Intercept at: how far from the base the raid is met. Threat speed: the ground speed of the raid on the axis.</p></div>`
          : ''
      }
      <div class="wcard"><div class="wh"><h3>Intercept</h3><span style="flex:1"></span>${seg(
        'wpn',
        [
          ['free', 'FREE', 'WEAPONS FREE: fire at any target not identified as friendly'],
          ['tight', 'TIGHT', 'WEAPONS TIGHT: fire only at targets identified as hostile'],
          ['hold', 'HOLD', 'WEAPONS HOLD: fire only in self-defence or when ordered'],
        ],
        S.wpn
      )}</div>${slider('tc', 'Climb')}${slider('vi', 'Dash')}${slider('ang', 'ANGELS')}${slider('commit', 'COMMIT')}${vid() ? slider('disp', 'Displacement') : ''}<p class="hint">Climb: the minutes from the take-off to ANGELS (${CLIMB_KT} kt over the ground). Dash: the ground speed after it (BUSTER).${vid() ? ' Displacement: abeam of the target for the stern conversion (VID in the ROE).' : ''}</p></div>
      </div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>${al ? 'QRA · ALERT' : 'QRA · INTERCEPT'}</h3><span style="flex:1"></span><button class="btn g" type="button" data-qrfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-qrpf title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div>
      <div id="qrmap" class="wmapbox"></div><div class="wleg" id="qrleg"></div></div></div>
      <div class="wpr"><div class="wcard" id="qrdt"></div><div class="wcard" id="qrwn"></div><div class="wcard" id="qrroe"></div></div></div>`;
    wire();
  }
  function fill() {
    if (!X || !X.ok || !root.querySelector('#qrfl')) return;
    const q = s => root.querySelector(s),
      me = X.me,
      al = mode == 'ALERT';
    q('#qrfl').innerHTML =
      `<h3>${esc(me.name)} · QRA${al ? '' : ' · INTERCEPT'}</h3><div class="kv">${kv('FLIGHT', esc(me.n + '× ' + me.ac + ' · PKG ' + me.pkgNo))}${kv('BASE', esc(X.base.name || '--'))}${kv('TAKE-OFF', X.t0 ? hm(X.t0) : '--')}${kv('STATE', al ? 'ALERT: no Intercept steerpoint yet' : 'LAUNCHED: STPT ' + X.ic.n + ' Intercept')}</div><div class="wbtns"><button class="btn g" type="button" data-qrdtc title="${al ? 'The scramble line and the intercept line' : 'The vector and the track of the target'} as lines of the DTC (the SIT line FEZ of the F-15). Lines this page wrote before are replaced, after asking.">DTC lines</button><button class="btn g" type="button" data-qrreset title="The default values">Reset</button></div>`;
    const ax = q('#qrax');
    if (ax && A) ax.textContent = 'Threat ' + h3(toMag(A.brg)) + '° magnetic, from the nearest enemy (as the DCA).';
    Object.entries(val).forEach(([k, f]) => {
      const e = q(`[data-qre="${k}"]`);
      if (e) e.textContent = f(S[k]);
      const i = /** @type {HTMLInputElement|null} */ (q(`[data-qr="${k}"]`));
      if (i && document.activeElement !== i) i.value = String(S[k]);
    });
    root.querySelectorAll('[data-qrset]').forEach(b => {
      const el = /** @type {HTMLElement} */ (b);
      el.classList.toggle('on', String(S[el.dataset.qrset]) === el.dataset.v);
    });
    q('#qrdt').innerHTML = al
      ? `<h3>Data</h3><div class="kv">${kv('AXIS', h3(toMag(A.brg)) + '°')}${kv('INTERCEPT', A.ri + ' NM · ' + Math.round(A.tInt) + ' min after take-off')}${kv('SCRAMBLE LINE', A.rs + ' NM', W.some(w => w[1] && /SCRAMBLE/.test(w[0])) ? 'wbad' : '')}${kv('RADAR', X.awacs ? 'AWACS on station' : COV == null ? '--' : COV + ' NM on the axis')}${kv('JOKER / BINGO', esc((X.joker || '--') + ' / ' + (X.bingo || '--')))}${kv('A-A', esc(X.aa || '--'))}</div><p class="hint wnote">The scramble line: a raid on the axis seen there is met at ${A.ri} NM by the QRA airborne at once (climb, then dash).</p>`
      : `<h3>Data</h3><div class="kv">${kv('TARGET', esc(!X.tgt ? '--' : X.tgt.gone ? 'gone from the campaign' : tgtName() + (X.tgt.st ? ' · spotted' : ' · not spotted')))}${kv('VECTOR', I ? h3(toMag(I.vec)) + '° · ' + ang(S.ang) : '--')}${kv('INTERCEPT', I ? I.d + ' NM · ' + hm(I.t) + (I.aspect ? ' · ' + I.aspect : '') : 'none', I ? '' : 'wbad')}${kv('POSITION', I ? esc(be(I.p)) : '--')}${kv('TARGET NOW', X.tgt && X.tgt.st ? h3(toMag(X.tgt.st.hdg)) + '° · ' + X.tgt.st.gs + ' kt · ' + altTxt(X.tgt.st.alt) : '--')}${kv('JOKER / BINGO', esc((X.joker || '--') + ' / ' + (X.bingo || '--')))}${kv('A-A', esc(X.aa || '--'))}</div><p class="hint wnote">The target: where your side sees it now, on a straight line (as the controller gives it); not spotted, the Intercept steerpoint of BMS.</p>`;
    q('#qrwn').innerHTML =
      `<h3>Checks</h3>${W.length ? W.map(([t, red]) => `<div class="${red ? 'wbad' : 'hint'}">${esc(t)}</div>`).join('') : '<div class="sdok">No problem found.</div>'}`;
    const roe = roeNow(),
      id = roe && roe.roe.id.length ? roe.roe.id.join(' + ').toUpperCase() : 'none';
    q('#qrroe').innerHTML =
      `<h3>ROE · A-A block</h3><div class="hint">${faorLines(block(), false).map(esc).join(' · ')}</div><div class="kv">${kv('ID', esc(id), id == 'none' && S.wpn == 'free' ? 'wbad' : '')}</div><p class="hint wnote">Written in the ROE of the flight (Squadron > ROE / SOP). VID among the ID criteria adds the stern conversion to the page and the cards.</p>`;
    legend();
  }
  function legend() {
    const e = root.querySelector('#qrleg');
    if (!e) return;
    const it = (c, t, dash) =>
      `<span><i style="border-top:2px ${dash ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    e.innerHTML = (
      mode == 'ALERT'
        ? [it(COL.scr, 'SCRAMBLE LINE'), it(COL.ic, 'INTERCEPT'), it(COL.grey, 'RADAR', true)]
        : [
            it(COL.ic, 'VECTOR'),
            it(COL.tgt, 'TARGET', true),
            it(COL.commit, 'COMMIT'),
            it(COL.conv, 'STERN CONVERSION', true),
          ]
    ).join(' ');
  }

  // ---- the map (Leaflet lent by the Map page)
  const VK = mapKeep();
  async function ensureMap() {
    const box = root.querySelector('#qrmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    pane(o.map, o.L);
    M = { ...o, WL: o.L.layerGroup().addTo(o.map) };
    fit = !VK.restore(o.map, fitKey);
  }
  const pane = (map, L) => {
    if (!map._qrR) {
      map.createPane('qrP').style.zIndex = 470;
      map._qrR = L.canvas({ pane: 'qrP' });
    }
  };
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
  // THE PLAN, one list of shapes (core/aakit.js)
  function spec() {
    const B = X.base,
      baseDot = { t: 'dot', p: B, col: COL.base, ink: { label: 'BASE', bold: true } };
    if (mode == 'ALERT') {
      const far = A.at(A.rs + 15);
      return [
        {
          t: 'poly',
          pts: [B, A.at(A.rs)],
          col: COL.grey,
          w: 1,
          dash: [2, 5],
          ink: { dash: [2, 4], grey: true },
        },
        { t: 'poly', pts: A.scr, col: COL.scr, w: 2.5, ink: { w: 2, red: true } },
        { t: 'poly', pts: A.ic, col: COL.ic, w: 2.5, ink: { w: 2 } },
        ...(COV != null && !X.awacs && COV < A.rs + 60
          ? [
              {
                t: 'poly',
                pts: [A.at(COV), A.at(COV)].map((p, i) => ({
                  x: p.x + A.u.y * (i ? -1 : 1) * LINE_NM * 0.6 * KM_NM,
                  y: p.y - A.u.x * (i ? -1 : 1) * LINE_NM * 0.6 * KM_NM,
                })),
                col: COL.grey,
                w: 1.5,
                dash: [4, 4],
                ink: { dash: [3, 3], grey: true },
              },
              { t: 'label', p: A.at(COV), text: 'RADAR ' + COV + ' NM', col: COL.grey, ink: { grey: true } },
            ]
          : []),
        baseDot,
        { t: 'arrow', from: A.at(A.rs), to: far, text: 'THREAT ' + h3(toMag(A.brg)) + '°', col: COL.scr },
        {
          t: 'label',
          p: A.scr[0],
          text: 'SCRAMBLE LINE ' + A.rs + ' NM',
          col: COL.scr,
          ink: { red: true, bold: true },
        },
        { t: 'label', p: A.ic[0], text: 'INTERCEPT ' + A.ri + ' NM · ' + Math.round(A.tInt) + ' MIN', col: COL.ic },
      ];
    }
    const T = X.tgt && X.tgt.st;
    if (!I) return [baseDot, ...(T ? [{ t: 'dot', p: T, col: COL.tgt, ink: { label: 'TGT' } }] : [])];
    return [
      ...(I.track
        ? [{ t: 'poly', pts: I.track, col: COL.tgt, w: 2, dash: [6, 5], ink: { w: 1.5, dash: [5, 3], red: true } }]
        : []),
      { t: 'poly', pts: [B, I.p], col: COL.ic, w: 3, ink: { w: 2.5 } },
      ...(I.conv
        ? [{ t: 'poly', pts: I.conv.arc, col: COL.conv, w: 2, dash: [5, 4], ink: { w: 1.5, dash: [4, 3] } }]
        : []),
      ...(I.commitPt
        ? [
            { t: 'dot', p: I.commitPt, col: COL.commit, k: 'sq', ink: { label: 'COMMIT' } },
            { t: 'label', p: I.commitPt, text: 'COMMIT ' + S.commit + ' NM', col: COL.commit, ink: false },
          ]
        : []),
      ...(X.ic && T ? [{ t: 'dot', p: X.ic, col: COL.grey, k: 'tri', ink: { label: 'STPT ' + X.ic.n } }] : []),
      ...(T ? [{ t: 'dot', p: T, col: COL.tgt, ink: { label: String(tgtName()).toUpperCase(), bold: true } }] : []),
      baseDot,
      { t: 'dot', p: I.p, col: COL.ic, ink: { label: 'INTERCEPT ' + hm(I.t), bold: true } },
      {
        t: 'label',
        p: { x: B.x + (I.p.x - B.x) / 4, y: B.y + (I.p.y - B.y) / 4 },
        text: 'VECTOR ' + h3(toMag(I.vec)) + ' · ' + ang(S.ang),
        col: COL.ic,
      },
      { t: 'label', p: I.p, text: 'INTERCEPT ' + hm(I.t) + ' · ' + I.d + ' NM', col: COL.ic, ink: false },
    ];
  }
  const layers = (L, map, WL) => drawLeaflet(L, map._qrR, WL, deps.toLL, spec(), esc);
  function paint() {
    if (!X || !X.ok) return;
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
  function draw(rebuild) {
    if (!shown) return;
    compute();
    const fk = X && X.ok ? X.me.key + mode : '',
      other = fk !== fitKey;
    if (other) {
      fitKey = fk;
      fit = true;
      rebuild = true;
    }
    const want = X && X.ok ? mode + (vid() ? 'v' : '') : '';
    if (rebuild || !root.firstChild || want !== built) {
      detachMap(true);
      failed = false;
      pend = null;
      build();
    }
    fill();
    paint();
    if (other) roeWrite();
  }

  // ---- the controls
  function wire() {
    root.oninput = e => {
      const t = /** @type {HTMLInputElement} */ (e.target),
        k = t.dataset && t.dataset.qr;
      if (!k || !X || !X.ok) return;
      set(k, +t.value);
      compute();
      fill();
      paint();
    };
    root.onchange = e => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t.dataset && t.dataset.qr) roeWrite();
    };
    root.onclick = e => {
      const c = s => /** @type {HTMLElement|null} */ (e.target.closest && e.target.closest(s));
      if (!X || !X.ok) return;
      const sg = c('[data-qrset]');
      if (sg) {
        set(sg.dataset.qrset, sg.dataset.v);
        compute();
        fill();
        paint();
        return roeWrite();
      }
      if (c('[data-qrfit]')) {
        fit = true;
        return paint();
      }
      if (c('[data-qrreset]')) {
        st.f[X.me.key] = cleanQra(null);
        save();
        draw(true);
        return roeWrite();
      }
      if (c('[data-qrdtc]')) return dtc();
      const po = c('[data-qrpf]');
      if (po) {
        const m = deps.cyclePlan ? deps.cyclePlan() : 0;
        po.textContent = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'][m];
        paint();
      }
    };
    const po = root.querySelector('[data-qrpf]');
    if (po) po.textContent = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'][deps.planMode ? deps.planMode() : 0];
  }
  async function dtc() {
    const r = await dtcAuto();
    if (r && r.msg) deps.toast(r.msg, !!r.bad);
  }
  // the lines into the DTC (also AUTO > FEZ of the Map page): {msg, bad} or null
  async function dtcAuto() {
    compute();
    if (!X || !X.ok) return { msg: 'QRA: ' + (X ? X.why : 'no QRA flight'), bad: true };
    if (mode == 'INTERCEPT' && !I) return { msg: 'QRA: no intercept to write.', bad: true };
    if (!deps.dtcLines) return null;
    return deps.dtcLines({ parts: qraDtcLines(mode, A, I, X.base), sit: 8, sitName: 'FEZ', key: 'dca' }, X.me.name);
  }

  // ---- the cards
  const planData = () =>
    toInk(spec(), {
      bull: X.bull,
      be: be(X.base),
      legend: mode == 'ALERT' ? 'SCRAMBLE LINE red · INTERCEPT line · axis dotted' : 'VECTOR · TARGET track dashed red',
    });
  const cs = () => X.me.name.toUpperCase();
  function lines() {
    const al = mode == 'ALERT';
    return al
      ? [
          'AXIS ' + h3(toMag(A.brg)) + '°',
          ['SCRAMBLE LINE ' + A.rs + ' NM', true],
          'INTERCEPT ' + A.ri + ' NM · ' + Math.round(A.tInt) + ' MIN',
          ang(S.ang) + ' · BUSTER',
          'COMMIT ' + S.commit + ' NM · ' + S.wpn.toUpperCase(),
          ...(vid() ? ['VID: STERN CONV ' + S.disp + ' NM'] : []),
        ]
      : [
          'VECTOR ' + (I ? h3(toMag(I.vec)) : '---') + ' · ' + ang(S.ang),
          'INTERCEPT ' + (I ? I.d + ' NM · ' + hm(I.t) : 'NONE'),
          'TGT ' + String(tgtName()).toUpperCase() + (X.tgt && X.tgt.st ? '' : ' (BMS STPT)'),
          'COMMIT ' + S.commit + ' NM · ' + S.wpn.toUpperCase(),
          ...(vid() ? ['VID: STERN CONV ' + S.disp + ' NM'] : []),
        ];
  }
  function smartData() {
    const me = X.me,
      roe = roeNow(),
      al = mode == 'ALERT',
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : '',
      red = W.filter(w => w[1]);
    return {
      title: 'A-A · DCA · QRA' + (al ? '' : ' · INTERCEPT'),
      planLabel: al ? 'ALERT' : 'INTERCEPT',
      right: me.tag || cs(),
      key: al
        ? [
            ['AXIS', h3(toMag(A.brg)) + '°'],
            ['SCRAMBLE', A.rs + ' NM', true],
            ['INTERCEPT', A.ri + ' NM'],
            ['ANGELS', String(Math.round(S.ang / 1000))],
            ['WPN', S.wpn.toUpperCase(), S.wpn == 'free'],
            ['COMMIT', S.commit + ' NM'],
            ['T/O', X.t0 ? hm(X.t0) : '--'],
            ['BINGO', X.bingo || '--', true],
          ]
        : [
            ['VECTOR', I ? h3(toMag(I.vec)) + '°' : '---'],
            ['ANGELS', String(Math.round(S.ang / 1000))],
            ['RANGE', I ? I.d + ' NM' : '--'],
            ['TIME', I ? hm(I.t) : '--', !I],
            ['WPN', S.wpn.toUpperCase(), S.wpn == 'free'],
            ['COMMIT', S.commit + ' NM'],
            ['ASPECT', I && I.aspect ? I.aspect : '--'],
            ['BINGO', X.bingo || '--', true],
          ],
      plan: planData(),
      blocks: [
        [al ? 'SCRAMBLE' : 'INTERCEPT', lines().slice(0, 3)],
        [
          'ID',
          [
            'ID ' + (id || '--'),
            ...(vid() ? ['VID: STERN CONVERSION ' + S.disp + ' NM'] : []),
            'JOKER ' + (X.joker || '--'),
          ],
        ],
        ['BASE', [String(X.base.name || '--').toUpperCase(), be(X.base), 'T/O ' + (X.t0 ? hm(X.t0) : '--')]],
        ['CALLS', ['"' + cs() + ', AIRBORNE"', '"COMMITTING" · "' + cs() + ', RTB"']],
      ],
      foot: [
        [
          'TIME',
          'T/O ' + (X.t0 ? hm(X.t0) : '--'),
          al ? 'ICPT +' + Math.round(A.tInt) + ' MIN' : 'ICPT ' + (I ? hm(I.t) : '--'),
        ],
        ['FUEL', 'JOKER ' + (X.joker || '--'), 'BINGO ' + (X.bingo || '--')],
        [
          'A-A',
          ...String(X.aa || '--')
            .split(' · ')
            .slice(0, 2),
        ],
      ],
      last: red.length
        ? red[0][0]
        : al
          ? 'SCRAMBLE ON THE ORDER OF THE CONTROLLER'
          : 'VECTOR ' + (I ? h3(toMag(I.vec)) : '---') + ' BUSTER',
      lastRed: red.length > 0,
    };
  }
  function classicData() {
    const me = X.me,
      roe = roeNow(),
      al = mode == 'ALERT',
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : 'none',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.map(v => v.toUpperCase()).join(' / ') : 'none';
    return {
      head: 'A-A · DCA · QRA' + (al ? '' : ' · INTERCEPT'),
      rowsHead: al ? 'SCRAMBLE · ROE' : 'INTERCEPT · ROE',
      title: me.name + ' · ' + me.n + '× ' + me.ac,
      sub: 'PKG ' + me.pkgNo + ' · ' + String(X.base.name || '').toUpperCase() + ' · T/O ' + (X.t0 ? hm(X.t0) : '--'),
      box: al
        ? [
            ['THREAT AXIS', h3(toMag(A.brg)) + '°', 'from the nearest enemy'],
            ['SCRAMBLE LINE', A.rs + ' NM', 'raid at ' + S.vt + ' kt', true],
            ['INTERCEPT', A.ri + ' NM', '+' + Math.round(A.tInt) + ' min after T/O'],
            ['COMMIT', S.commit + ' NM', 'WPN ' + S.wpn.toUpperCase(), S.wpn == 'free'],
          ]
        : [
            ['VECTOR', I ? h3(toMag(I.vec)) + '°' : '---', ang(S.ang) + ' · BUSTER'],
            ['INTERCEPT', I ? I.d + ' NM' : 'NONE', I ? hm(I.t) + (I.aspect ? ' · ' + I.aspect : '') : '', !I],
            ['TARGET', String(tgtName()).toUpperCase(), X.tgt && X.tgt.st ? 'spotted' : 'BMS STPT ' + X.ic.n],
            ['COMMIT', S.commit + ' NM', 'WPN ' + S.wpn.toUpperCase(), S.wpn == 'free'],
          ],
      warn: W.filter(w => w[1]).map(w => w[0]),
      rows: [
        ...(al
          ? [
              [
                'RADAR',
                X.awacs ? 'AWACS on station' : COV == null ? '--' : COV + ' NM on the axis',
                W.some(w => w[1] && /radar/.test(w[0])),
              ],
              ['CLIMB / DASH', S.tc + ' min · ' + S.vi + ' kt'],
            ]
          : [
              ['POSITION', I ? be(I.p) : '--'],
              [
                'TARGET NOW',
                X.tgt && X.tgt.st
                  ? h3(toMag(X.tgt.st.hdg)) + '° · ' + X.tgt.st.gs + ' kt · ' + altTxt(X.tgt.st.alt)
                  : '--',
              ],
            ]),
        ['ANGELS', altTxt(S.ang)],
        ['WPN', S.wpn.toUpperCase()],
        ['ID', id, id == 'none' && S.wpn == 'free'],
        ...(vid() ? [['VID', 'stern conversion · ' + S.disp + ' NM']] : []),
        ['BUGOUT', bo],
        ['JOKER / BINGO', (X.joker || '--') + ' / ' + (X.bingo || '--')],
        ['A-A', X.aa || '--'],
      ],
      calls: [
        '"' + cs() + ', AIRBORNE" · after the scramble',
        al
          ? 'CRC: "' + cs() + ', VECTOR ' + h3(toMag(A.brg)) + ', ' + ang(S.ang) + ', BUSTER"'
          : 'CRC: "' + cs() + ', VECTOR ' + (I ? h3(toMag(I.vec)) : '---') + ', ' + ang(S.ang) + ', BUSTER"',
        '"' + cs() + ', COMMITTING" · a hostile group inside ' + S.commit + ' NM',
      ],
      px: null,
    };
  }
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
      pts =
        mode == 'ALERT'
          ? [X.base, ...A.scr, ...A.ic]
          : [X.base, ...(I ? [I.p, ...(I.track || [])] : []), ...(X.tgt && X.tgt.st ? [X.tgt.st] : [])],
      p = await snapMap(M, deps, pts, AR, keep, [X.base, { x: X.base.x + 10 * KM_NM, y: X.base.y }]);
    return p ? { img: p.img, coast: p.coast, nm: p.nm, ...toPx(S0, p.px, p.nm) } : null;
  }
  let CL = null,
    COMBO = null;
  async function comboLoad() {
    try {
      COMBO = deps.combo ? await deps.combo() : null;
    } catch (e) {
      COMBO = null;
    }
  }
  function comboData() {
    const D = smartData(),
      B = COMBO || {},
      W0 = B.wx ? wxAtTarget(B.wx, S.ang) : null,
      check = !W0
        ? null
        : W0.base == null
          ? { label: 'NO CLOUD ✓' }
          : S.ang > W0.top
            ? { label: ang(S.ang) + ' ABOVE THE TOPS ✓' }
            : S.ang < W0.base
              ? { label: ang(S.ang) + ' UNDER THE BASE' }
              : { label: ang(S.ang) + ' IN CLOUD', bad: true };
    return {
      title: 'MISSION · QRA',
      right: D.right,
      key: D.key,
      mod: {
        kind: 'aa',
        label: D.title.replace('A-A · DCA · ', ''),
        plan: D.plan,
        lines: lines(),
        line: D.blocks[2][1].join(' · '),
      },
      tgt: null,
      sam: null,
      wx: W0,
      windLabel: 'WIND ' + altTxt(S.ang),
      check,
      roe: B.roe || null,
      wxLabel: 'WEATHER',
      last: [D.foot[0].slice(1).join(' · ') + ' · ' + D.foot[1].slice(1).join(' · '), D.lastRed ? D.last : ''],
    };
  }
  function drawCard(k) {
    const c = document.createElement('canvas');
    c.width = SC_W;
    c.height = SC_H;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    if (k == 'map') {
      c.width = AAC_W;
      c.height = AAC_H;
      drawAACard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), CL || classicData());
    } else if (k == 'combo') drawSmartCombined(x, comboData());
    else drawSmartAA(x, smartData());
    return c;
  }
  const cardName = k => (k == 'map' ? 'QRA · ' : k == 'combo' ? 'Smart · Mission · ' : 'Smart · QRA · ') + X.me.name;
  async function ready(pic = true) {
    compute();
    if (!X || !X.ok) return false;
    await comboLoad();
    CL = classicData();
    if (pic) {
      const B = aaBox(CL);
      try {
        CL.px = await busyRun('Preparing the QRA cards…', () => snapPlan(B.w / B.h));
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
      if (!(await ready())) return deps.toast('QRA card: ' + (X ? X.why : 'no QRA flight'), true);
    } finally {
      if (btn) btn.disabled = false;
    }
    await addCards(deps, KINDS, drawCard, cardName, 'Add QRA cards to the Kneeboard', 'qracardkinds', ['map']);
  }
  async function allCards() {
    if (!(await ready())) return [];
    return allOf(KINDS, drawCard, cardName, 'QRA');
  }

  return {
    root,
    allCards,
    addCard: b => addCard(b),
    dtcAuto,
    render: async () => {
      shown = true;
      draw(false);
      roeWrite();
    },
    refresh: () => {
      if (shown) draw(false);
    },
    leave: () => {
      shown = false;
      detachMap();
    },
    usable: () => {
      const c = deps.ctx();
      return !!(c && c.ok);
    },
    // Display > DCA of the Map page
    overlay: o => {
      compute();
      if (!X || !X.ok) return false;
      pane(o.map, o.L);
      layers(o.L, o.map, o.WL);
      return true;
    },
    state: () => st,
    setState: o => {
      if (o && typeof o == 'object' && o.f && typeof o.f == 'object') {
        st = { f: { ...o.f } };
        save();
        if (shown) draw(true);
      }
    },
    // for the tests
    plan: () => (compute(), X && X.ok ? { mode, A, I, cover: COV, S } : null),
    warnings: () => (compute(), W),
    smart: () => (compute(), X && X.ok ? smartData() : null),
    combo: () => (compute(), X && X.ok ? comboData() : null),
    classic: () => (compute(), X && X.ok ? classicData() : null),
    cardCanvas: async k => ((await ready(k == 'map')) ? drawCard(k || 'smart') : null),
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.roeGet) deps.roeGet = o.roeGet;
      if (o.roeSet) deps.roeSet = o.roeSet;
    },
  };
}
