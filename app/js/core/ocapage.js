// @ts-check
// A-A > OCA: the SWEEP or the ESCORT of a package (core/oca.js). The route and the times of the package from the ATO, where the fighter should be
// (the lead on the package, the side and the offset: the codes FS-1 / FS-2 / FS-3 of the NATO manual), the sweep area, the commit around the
// fighter, the stop around the package, the target area; a time slider moves them along the route. The warnings in red; the A-A block of the ROE of the
// flight (deps.roeSet), Display > OCA on the Map page, the DTC lines, the cards (with the map, Smart OCA, Smart mission). One list of shapes for the map
// and the cards (core/aakit.js).
// deps: as the DCA page (core/faorpage.js), without msa.
// X: {ok, why, me {key, name, mission, kind, n, ac, pkgNo, tag, w (its timed route)}, prot [{name, w (timed route), tgt {x, y, n, t}}], main (the protected
//     flight the plan follows), sams [{x, y, r (km), name}], bull, joker, bingo, aa}
import {
  ocaDefaults,
  cleanOca,
  OCA_RANGE,
  KM_NM,
  modeOf,
  posCode,
  POS_HELP,
  pkgWindow,
  fighterAt,
  track,
  sweepArea,
  ocaChecks,
  ocaRoe,
  ocaDtcLines,
} from './oca.js';
import { altTxt, altBlock, bearing, distNm, faorLines } from './faor.js';
import { posAt } from './sead.js';
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
  pkg: '#cbd5e1',
  me: '#4cc38a',
  cor: '#4aa3ff',
  commit: '#f0b040',
  stop: '#ef4444',
  ta: '#f0b040',
  sam: '#ff6b6b',
  plan: '#ffffff',
};
const KINDS = [
  ['map', 'With the map'],
  ['smart', 'Smart OCA'],
  ['combo', 'Smart mission'],
];

export function createOcaPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'ocpage';
  let st = { f: {} },
    X = null,
    S = null,
    WIN = null, // the window of the package {a, b, t0, t1, pts}
    T = [], // the track of the fighter
    W = [],
    TL = null,
    M = null,
    pend = null,
    failed = false,
    fit = true,
    fitKey = '',
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('oca1') || 'null');
    if (o && typeof o == 'object' && o.f && typeof o.f == 'object') st = o;
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem('oca1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const cruise = () => (X && X.main ? Math.max(0, ...X.main.w.map(p => Math.abs(p.z || 0) * 10)) : 0);
  // the lead of the flight plan: the package over its target minus my time at my steerpoint nearest to it (within 15 NM), min; null without one
  const plannedLead = () => {
    if (!X || !X.main || !X.main.tgt || !X.me.w.length || X.indep) return null;
    const g = X.main.tgt,
      n = X.me.w.map(p => ({ p, d: distNm(p, g) })).sort((a, b) => a.d - b.d)[0];
    return n && n.d <= 15 ? (g.t - n.p.arr) / 60000 : null;
  };
  const mode = () => modeOf(X.me.kind, S);
  const code = () => posCode(mode(), S.side, S.off, X.indep);
  // the Sun over the target at its time (the date of the campaign set on the Datacard); null without it
  const sun = () => (X.sun ? X.sun(X.main.tgt.x, X.main.tgt.y, X.main.tgt.t) : null);
  const now = () =>
    S.cur == null ? Math.min(WIN.t1, Math.max(WIN.t0, X.main.tgt.t - 5 * 60000)) : WIN.t0 + S.cur * 60000;
  const roeNow = () => {
    try {
      return deps.roeGet ? deps.roeGet() : null;
    } catch (e) {
      return null;
    }
  };

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    if (!X || !X.ok) {
      S = WIN = null;
      T = W = [];
      return;
    }
    const k = X.me.kind,
      raw = st.f[X.me.key];
    S = cleanOca(raw || ocaDefaults(k, 'det', plannedLead(), cruise()), k, plannedLead(), cruise());
    if (!raw) {
      st.f[X.me.key] = { ...S };
      save();
    }
    // an independent sweep flies its own route: no lead, no side
    if (X.indep) S = { ...S, lead: 0, side: 0, off: 0 };
    WIN = pkgWindow(X.main.w, X.main.tgt.n, X.main.end);
    T = track(X.main.w, S, WIN.t0, WIN.t1);
    const roe = roeNow(),
      su = sun();
    W = ocaChecks({
      kind: k,
      s: S,
      track: T,
      sams: X.sams,
      dor: TL ? TL.dor : null,
      idOk: roe ? roe.roe.id.length > 0 : null,
      bingo: roe ? roe.roe.abort.includes('bingo') : null,
      planned: plannedLead(),
      hm,
      indep: X.indep,
      dark: su != null && su < -6,
      sun: su,
    });
  }
  async function tlLoad() {
    try {
      const R = deps.timeline ? await deps.timeline() : null,
        rows = (R || []).filter(r => r && r.dor != null);
      const top = rows.sort((a, b) => b.dor - a.dor)[0];
      TL = top ? { dor: top.dor, mar: top.mar, cls: top.cls } : null;
    } catch (e) {
      TL = null;
    }
  }
  function roeWrite() {
    if (!X || !X.ok || !deps.roeSet) return;
    try {
      deps.roeSet(ocaRoe(S, X.me.kind, code()));
    } catch (e) {
      /* the ROE page is not there (tests) */
    }
  }
  const set = (k, v) => {
    st.f[X.me.key][k] = v;
    save();
  };

  // ---- the plan: one list of shapes for the map and the cards
  function spec() {
    const t = now(),
      pk = posAt(X.main.w, t),
      fp = fighterAt(X.main.w, S, t),
      m = mode(),
      nm = mode() == 'sweep' ? 'SWEEP' : 'ESCORT',
      sams = X.sams.filter(c => T.some(p => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 20 * KM_NM)),
      tg = [
        ...new Map(X.prot.filter(f => f.tgt).map(f => [f.tgt.x.toFixed(1) + ',' + f.tgt.y.toFixed(1), f.tgt])).values(),
      ];
    return [
      // the SAMs on the cards only: the map shows them already (its SAM layers, AUTO PPT)
      ...sams.map(c => ({
        t: 'ring',
        c,
        r: c.r,
        col: COL.sam,
        w: 1.5,
        dash: [4, 4],
        map: false,
        ink: { red: true, dash: [4, 3] },
      })),
      ...sams.map(c => ({ t: 'label', p: c, text: c.name, col: COL.sam, map: false, ink: { red: true } })),
      ...(X.indep ? [] : tg).map(g => ({
        t: 'ring',
        c: g,
        r: S.ta * KM_NM,
        col: COL.ta,
        w: 1.5,
        dash: [2, 5],
        ink: { dash: [2, 3] },
      })),
      ...(m == 'sweep'
        ? [
            {
              t: 'poly',
              pts: sweepArea(T, S.w),
              close: true,
              fill: true,
              col: COL.cor,
              w: 1,
              ink: { w: 1, fill: 'rgba(0,0,0,0.04)' },
            },
          ]
        : []),
      { t: 'poly', pts: WIN.pts, col: COL.pkg, w: 3, ink: { w: 4, round: true } },
      ...X.prot
        .filter(f => f !== X.main)
        .map(f => ({
          t: 'poly',
          pts: f.w.filter(p => p.arr >= WIN.t0 && p.arr <= WIN.t1),
          col: COL.pkg,
          w: 1.5,
          fit: false,
          ink: { grey: true },
        })),
      ...(X.me.w.length > 1 && !X.indep
        ? [
            {
              t: 'poly',
              pts: X.me.w.slice(1, -1),
              col: COL.plan,
              w: 1,
              dash: [3, 5],
              fit: false,
              ink: { grey: true, dash: [2, 3] },
            },
          ]
        : []),
      { t: 'poly', pts: T, col: COL.me, w: 2.5, dash: [8, 5], ink: { w: 1.5, dash: [6, 4] } },
      ...tg.map(g => ({ t: 'dot', p: g, col: COL.stop, k: 'tri', ink: { label: 'TGT', bold: true } })),
      ...(pk && !X.indep
        ? [
            {
              t: 'ring',
              c: pk,
              r: S.stop * KM_NM,
              col: COL.stop,
              w: 1.5,
              dash: [6, 6],
              ink: { red: true, dash: [5, 4] },
            },
            { t: 'dot', p: pk, col: COL.pkg, k: 'sq', ink: { label: 'PKG ' + hm(t) } },
            { t: 'label', p: pk, text: 'PKG ' + hm(t) + ' · STOP ' + S.stop, col: COL.pkg, ink: false },
          ]
        : []),
      ...(fp
        ? [
            { t: 'ring', c: fp, r: S.commit * KM_NM, col: COL.commit, w: 1.5, dash: [8, 6], ink: { dash: [7, 4] } },

            { t: 'dot', p: fp, col: COL.me, k: 'tri', ink: { label: nm + ' ' + code(), bold: true } },
            {
              t: 'label',
              p: fp,
              text:
                nm +
                ' ' +
                code() +
                (X.indep ? '' : ' · +' + S.lead + ' min') +
                ' · COMMIT ' +
                S.commit +
                ' · WPN ' +
                S.wpn.toUpperCase(),
              col: COL.me,
              ink: false,
            },
          ]
        : []),
    ];
  }
  const layers = (L, map, WL) => drawLeaflet(L, map._ocR, WL, deps.toLL, spec(), esc);

  // ---- the page
  const slider = (k, lab, R, v, txt) =>
    `<div class="slr"><label>${lab}</label><input type="range" min="${R[0]}" max="${R[1]}" step="${R[2]}" value="${v}" data-oc="${k}"><em data-oce="${k}">${txt}</em></div>`;
  const seg = (k, opts, c) =>
    `<span class="seg">${opts.map(([v, l, t]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-ocset="${k}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</span>`;
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  const val = {
    cur: v => hm(WIN.t0 + v * 60000),
    lead: v => '+' + v + ' min',
    off: v => v + ' NM',
    w: v => v + ' NM',
    commit: v => v + ' NM',
    stop: v => v + ' NM',
    ta: v => v + ' NM',
    a0: v => altTxt(v),
    a1: v => altTxt(v),
  };
  const valOf = k => (k == 'a0' ? S.alt[0] : k == 'a1' ? S.alt[1] : k == 'cur' ? (now() - WIN.t0) / 60000 : S[k]);
  function build() {
    if (!X || !X.ok) {
      root.innerHTML = `<div class="wcard sdnone fx"><h3>OCA</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a SWEEP or ESCORT flight.')}</p><p class="hint">OCA plans the SWEEP and the ESCORT of a package: where to fly ahead or beside it, the commit, the stop, the target area. Choose a SWEEP or ESCORT flight in the ATO.</p></div>`;
      return;
    }
    const sw = X.me.kind == 'SWEEP',
      span = Math.max(1, Math.round((WIN.t1 - WIN.t0) / 60000));
    root.innerHTML = `<div class="wpg ocg"><div class="wpl">
      <div class="wcard" id="ocfl"></div>
      <div class="wcard"><div class="wh"><h3>Position</h3><span style="flex:1"></span>${
        sw
          ? ''
          : seg(
              'esc',
              [
                [
                  'det',
                  'Detached',
                  'Detached escort (FS-2): less than 2 min ahead or 10 NM aside; the package in sight or not',
                ],
                ['emb', 'Embedded', 'Close (embedded) escort (FS-3): with the package, in sight of it'],
              ],
              S.esc
            )
      }</div>${
        X.indep
          ? `<p class="hint">Independent sweep (FS-1D): no other flight in package ${esc(String(X.me.pkgNo))}, the plan follows your own sweep steerpoints.</p>`
          : `<div class="wrow"><label>Side</label>${seg(
              'side',
              [
                ['-1', 'Left', 'B: left of the route of the package'],
                ['0', 'On route', 'A: on the route of the package'],
                ['1', 'Right', 'C: right of the route of the package'],
              ],
              S.side
            )}</div>${slider('lead', 'Lead on package', OCA_RANGE.lead, S.lead, val.lead(S.lead))}${slider('off', 'Offset', OCA_RANGE.off, S.off, val.off(S.off))}`
      }${
        sw
          ? slider('w', 'Sweep width', OCA_RANGE.w, S.w, val.w(S.w))
          : `<div class="wrow"><label>IMC / low level</label>${seg(
              'night',
              [
                ['false', 'No'],
                [
                  'true',
                  'Yes',
                  'IMC, or low level over rolling ground: no close escort (NATO). The night comes from the date of the campaign.',
                ],
              ],
              S.night
            )}</div><p class="hint" id="ocsun"></p>`
      }<p class="hint" id="occode" title="${esc(POS_HELP)}"></p></div>
      <div class="wcard"><div class="wh"><h3>Engagement</h3><span style="flex:1"></span>${seg(
        'wpn',
        [
          ['free', 'FREE', 'WEAPONS FREE: fire at any target not identified as friendly'],
          ['tight', 'TIGHT', 'WEAPONS TIGHT: fire only at targets identified as hostile'],
          ['hold', 'HOLD', 'WEAPONS HOLD: fire only in self-defence or when ordered'],
        ],
        S.wpn
      )}</div>${slider('commit', 'COMMIT', OCA_RANGE.commit, S.commit, val.commit(S.commit))}${slider('stop', X.indep ? 'STOP from route' : 'STOP from package', OCA_RANGE.stop, S.stop, val.stop(S.stop))}${X.indep ? '' : slider('ta', 'Target area', OCA_RANGE.ta, S.ta, val.ta(S.ta))}${slider('a0', 'Block floor', OCA_RANGE.alt, S.alt[0], val.a0(S.alt[0]))}${slider('a1', 'Block ceiling', OCA_RANGE.alt, S.alt[1], val.a1(S.alt[1]))}<p class="hint">COMMIT: a hostile group closer than this to you. STOP: no pursuit further than this from the package. Target area: the air ${sw ? 'the sweep clears' : 'around the target'}.</p></div>
      </div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>${sw ? 'SWEEP' : 'ESCORT'}</h3><span style="flex:1"></span><button class="btn g" type="button" data-ocfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-ocpf title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div>
      ${slider('cur', X.indep ? 'Time' : 'Package time', [0, span, 0.5], valOf('cur'), val.cur(valOf('cur')))}
      <div id="ocmap" class="wmapbox"></div><div class="wleg" id="ocleg"></div></div></div>
      <div class="wpr"><div class="wcard" id="ocdt"></div><div class="wcard" id="ocwn"></div><div class="wcard" id="ocroe"></div></div></div>`;
    wire();
  }
  function fill() {
    if (!X || !X.ok || !root.querySelector('#ocfl')) return;
    const q = s => root.querySelector(s),
      me = X.me,
      g = X.main.tgt,
      pl = plannedLead();
    q('#ocfl').innerHTML =
      `<h3>${esc(me.name)} · ${esc(me.kind)}</h3><div class="kv">${kv('FLIGHT', esc(me.n + '× ' + me.ac + ' · PKG ' + me.pkgNo))}${
        X.indep
          ? kv(
              'SWEEP',
              'independent · STPT ' + g.n + (X.main.end && X.main.end != g.n ? '-' + X.main.end : '') + ' · ' + hm(g.t)
            )
          : kv('PROTECTS', esc(X.prot.map(f => f.name).join(', '))) +
            kv('PKG TOT', hm(g.t) + ' · ' + esc(X.main.name) + ' STPT ' + g.n) +
            kv(
              'PLAN LEAD',
              pl == null ? 'no steerpoint near the target' : (pl >= 0 ? '+' : '') + Math.round(pl * 2) / 2 + ' min'
            )
      }</div><div class="wbtns"><button class="btn g" type="button" data-ocdtc title="Your track and the target area as lines of the DTC (LINE1-4 of the F-16; the SIT line MISC of the F-15). Lines this page wrote before are replaced, after asking.">DTC lines</button><button class="btn g" type="button" data-ocreset title="The values of the NATO manual for this mission">Reset profile</button></div>`;
    const sn = q('#ocsun'),
      su = sun();
    if (sn)
      sn.textContent =
        su == null
          ? 'Night: set the date of the campaign on the Datacard (ephemerides) to know it.'
          : 'Sun over the target at ' +
            hm(g.t) +
            ': ' +
            Math.round(su) +
            '° (' +
            (su < -6 ? 'night' : su < 0 ? 'twilight' : 'day') +
            ')';
    const m = mode();
    q('#occode').textContent =
      code() +
      ' · ' +
      (X.indep
        ? 'independent sweep'
        : m == 'sweep'
          ? 'sweep: 2 min ahead or 10 NM aside, at least'
          : m == 'det'
            ? 'detached escort: under 2 min and 10 NM'
            : 'embedded escort: with the package, in sight') +
      ' (NATO) ⓘ';
    Object.keys(val).forEach(k => {
      const e = q(`[data-oce="${k}"]`),
        v = valOf(k);
      if (e) e.textContent = val[k](v);
      const i = /** @type {HTMLInputElement|null} */ (q(`[data-oc="${k}"]`));
      if (i && document.activeElement !== i) i.value = String(v);
    });
    root.querySelectorAll('[data-ocset]').forEach(b => {
      const el = /** @type {HTMLElement} */ (b);
      el.classList.toggle('on', String(S[el.dataset.ocset]) === el.dataset.v);
    });
    const roe = roeNow(),
      id = roe && roe.roe.id.length ? roe.roe.id.join(' + ').toUpperCase() : 'none',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.join(' / ').toUpperCase() : 'none',
      fp = fighterAt(X.main.w, S, now()),
      pk = posAt(X.main.w, now());
    q('#ocdt').innerHTML =
      `<h3>Data</h3><div class="kv">${kv('POSITION', X.indep ? code() + ' · your own route' : code() + ' · +' + S.lead + ' min · ' + S.off + ' NM')}${kv('NOW', fp && pk && !X.indep ? hm(now()) + ' · ' + Math.round(distNm(fp, pk)) + ' NM from the package' : hm(now()))}${kv('BLOCK', esc(altBlock(S.alt)))}${kv('WPN', S.wpn.toUpperCase())}${kv('JOKER / BINGO', esc((X.joker || '--') + ' / ' + (X.bingo || '--')))}${kv('MAR / DOR', TL ? Math.round(TL.mar) + ' / ' + Math.round(TL.dor) + ' NM · ' + esc(TL.cls) : '--')}${kv('A-A', esc(X.aa || '--'))}${kv('BMS', me.kind == 'SWEEP' ? 'success: one kill' : 'success: no loss in the package')}</div>`;
    q('#ocwn').innerHTML =
      `<h3>Checks</h3>${W.length ? W.map(([t, red]) => `<div class="${red ? 'wbad' : 'hint'}">${esc(t)}</div>`).join('') : '<div class="sdok">No problem found.</div>'}`;
    q('#ocroe').innerHTML = `<h3>ROE · A-A block</h3><div class="hint">${faorLines(ocaRoe(S, me.kind, code()), false)
      .map(esc)
      .join(
        ' · '
      )}</div><div class="kv">${kv('ID', esc(id), id == 'none' && S.wpn == 'free' ? 'wbad' : '')}${kv('BUGOUT', esc(bo))}</div><p class="hint wnote">Written in the ROE of the flight (Squadron > ROE / SOP): its weapons control and commit win over those of the preset.</p>`;
    const e = q('#ocleg'),
      it = (c, t, dash) =>
        `<span><i style="border-top:2px ${dash ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    if (e)
      e.innerHTML = [
        ...(X.indep ? [] : [it(COL.pkg, 'PACKAGE')]),
        it(COL.me, me.kind, true),
        ...(m == 'sweep' ? [it(COL.cor, 'SWEEP AREA')] : []),
        it(COL.commit, 'COMMIT', true),
        ...(X.indep ? [] : [it(COL.stop, 'STOP', true), it(COL.ta, 'TGT AREA', true)]),
      ].join(' ');
  }

  // ---- the map
  const VK = mapKeep();
  async function ensureMap() {
    const box = root.querySelector('#ocmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._ocR) {
      o.map.createPane('ocP').style.zIndex = 470;
      o.map._ocR = o.L.canvas({ pane: 'ocP' });
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
    const was = X && X.ok;
    compute();
    const fk = X && X.ok ? X.me.key : '',
      other = fk !== fitKey;
    if (other) {
      fitKey = fk;
      fit = true;
      rebuild = true;
    }
    if (rebuild || !root.firstChild || !root.querySelector('.ocg') !== !(X && X.ok) || was !== (X && X.ok)) {
      detachMap(true);
      failed = false;
      pend = null;
      build();
    }
    fill();
    paint();
    if (other) roeWrite();
  }
  function wire() {
    root.oninput = e => {
      const t = /** @type {HTMLInputElement} */ (e.target),
        k = t.dataset && t.dataset.oc;
      if (!k || !X || !X.ok) return;
      const v = +t.value,
        f = st.f[X.me.key];
      if (k == 'a0') set('alt', [v, Math.max(f.alt ? f.alt[1] : v + 1000, v + 1000)]);
      else if (k == 'a1') set('alt', [Math.min(f.alt ? f.alt[0] : v - 1000, v - 1000), v]);
      else set(k, v);
      compute();
      fill();
      paint();
    };
    root.onchange = e => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t.dataset && t.dataset.oc && t.dataset.oc != 'cur') roeWrite();
    };
    root.onclick = e => {
      const c = s => /** @type {HTMLElement|null} */ (e.target.closest && e.target.closest(s));
      if (!X || !X.ok) return;
      const sg = c('[data-ocset]');
      if (sg) {
        const k = sg.dataset.ocset,
          v = k == 'side' ? +sg.dataset.v : k == 'night' ? sg.dataset.v == 'true' : sg.dataset.v;
        if (k == 'esc' && v != S.esc) {
          // another kind of escort: its own defaults (lead, side, commit, stop), the time and the block kept
          st.f[X.me.key] = {
            ...ocaDefaults(X.me.kind, v, plannedLead(), cruise()),
            alt: S.alt,
            cur: S.cur,
            night: S.night,
          };
          save();
          draw(true);
          return roeWrite();
        }
        set(k, v);
        compute();
        fill();
        paint();
        return roeWrite();
      }
      if (c('[data-ocfit]')) {
        fit = true;
        return paint();
      }
      if (c('[data-ocreset]')) {
        st.f[X.me.key] = ocaDefaults(X.me.kind, S.esc || 'det', plannedLead(), cruise());
        save();
        draw(true);
        return roeWrite();
      }
      if (c('[data-ocdtc]')) return dtc();
      const po = c('[data-ocpf]');
      if (po) {
        const m = deps.cyclePlan ? deps.cyclePlan() : 0;
        po.textContent = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'][m];
        paint();
      }
    };
    const po = root.querySelector('[data-ocpf]');
    if (po) po.textContent = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'][deps.planMode ? deps.planMode() : 0];
  }
  async function dtc() {
    const r = await dtcAuto();
    if (r && r.msg) deps.toast(r.msg, !!r.bad);
  }
  // the lines of the plan into the DTC (also the AUTO menu of the Map page): {msg, bad} or null
  async function dtcAuto() {
    compute();
    if (!X || !X.ok) return { msg: 'OCA: ' + (X ? X.why : 'no SWEEP or ESCORT flight'), bad: true };
    if (!deps.dtcLines) return null;
    const L = ocaDtcLines(T, X.main.tgt, S);
    return deps.dtcLines(
      {
        parts: [
          ...(L.track.length > 1 ? [['track', X.me.kind == 'SWEEP' ? 'SWEEP TRACK' : 'ESCORT TRACK', L.track]] : []),
          ...(L.area ? [['area', 'TGT AREA', L.area]] : []),
        ],
        sit: 9,
        sitName: 'MISC',
        key: 'oca',
      },
      X.me.name
    );
  }

  // ---- the cards
  const be = p => (X.bull ? 'BE ' + h3(toMag(bearing(X.bull, p))) + '/' + Math.round(distNm(X.bull, p)) : '--');
  const callsOf = () => {
    const cs = X.me.name.toUpperCase(),
      g = X.main.tgt;
    return X.me.kind == 'SWEEP'
      ? [
          '"' + cs + ', PUSHING" · ' + S.lead + ' min ahead of the package (' + hm(WIN.t0) + ')',
          '"' + cs + ', COMMITTING" · a hostile group inside ' + S.commit + ' NM',
          '"' + cs + ', EGRESSING" · after the last striker off the target (' + hm(g.t) + ')',
        ]
      : [
          '"' + cs + ', JOINED" · ' + code() + ' with ' + X.main.name.toUpperCase(),
          '"' +
            cs +
            ', COMMITTING" · a hostile group inside ' +
            S.commit +
            ' NM, no further than ' +
            S.stop +
            ' NM from the package',
          '"' + cs + ', RESUME" · back on the package after the merge',
        ];
  };
  function smartData() {
    const me = X.me,
      g = X.main.tgt,
      roe = roeNow(),
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : '',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.map(v => v.toUpperCase()).join(' / ') : '';
    return {
      title: 'A-A · OCA · ' + me.kind,
      planLabel: me.kind == 'SWEEP' ? 'SWEEP · PACKAGE AT ' + hm(now()) : 'ESCORT · PACKAGE AT ' + hm(now()),
      right: me.tag || me.name.toUpperCase(),
      key: [
        ['POSITION', code()],
        ['LEAD', '+' + S.lead + ' MIN'],
        ['COMMIT', S.commit + ' NM'],
        ['WPN', S.wpn.toUpperCase()],
        ['STOP', S.stop + ' NM', true],
        ['PKG TOT', hm(g.t)],
        ['BLOCK', altBlock(S.alt)],
        ['BINGO', X.bingo || '--', true],
      ],
      plan: toInk(spec(), {
        bull: X.bull,
        be: be(g),
        legend: 'PKG grey · your track dashed · STOP red: from the PKG',
      }),
      blocks: [
        [
          X.indep ? 'SWEEP' : 'PACKAGE',
          [
            X.indep ? 'INDEPENDENT · OWN ROUTE' : X.prot.map(f => f.name.toUpperCase()).join(', '),
            'TGT ' + be(g) + ' · ' + hm(g.t),
            me.kind == 'SWEEP' ? 'TGT AREA ' + S.ta + ' NM' : 'STAY WITH THE PACKAGE',
          ],
        ],
        ['ID / BUGOUT', ['ID ' + (id || '--'), 'BUGOUT ' + (bo || '--'), 'JOKER ' + (X.joker || '--')]],
        [
          'LINES',
          [
            'COMMIT ' + S.commit + ' NM from you',
            ['STOP ' + S.stop + ' NM from the package', true],
            ...(TL ? ['MAR ' + Math.round(TL.mar) + ' · DOR ' + Math.round(TL.dor) + ' (' + TL.cls + ')'] : []),
          ],
        ],
        ['CALLS', callsOf().map(c => c.split(' · ')[0])],
      ],
      foot: [
        ['TIME', 'PUSH ' + hm(WIN.t0), 'TOT ' + hm(g.t)],
        ['FUEL', 'JOKER ' + (X.joker || '--'), 'BINGO ' + (X.bingo || '--')],
        [
          'A-A',
          ...String(X.aa || '--')
            .split(' · ')
            .slice(0, 2),
        ],
      ],
      last: W.filter(w => w[1]).length
        ? W.filter(w => w[1])[0][0]
        : me.kind == 'SWEEP'
          ? 'CLEAR THE AIR AHEAD OF THE PACKAGE'
          : 'STAY BETWEEN THE THREAT AND THE PACKAGE',
      lastRed: W.some(w => w[1]),
    };
  }
  function classicData() {
    const me = X.me,
      g = X.main.tgt,
      roe = roeNow(),
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : 'none',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.map(v => v.toUpperCase()).join(' / ') : 'none',
      m = mode(),
      sams = X.sams.filter(c => T.some(p => Math.hypot(p.x - c.x, p.y - c.y) < c.r));
    return {
      head: 'A-A · OCA · ' + me.kind,
      rowsHead: 'PACKAGE · ROE',
      title: me.name + ' · ' + me.n + '× ' + me.ac,
      sub:
        'PKG ' +
        me.pkgNo +
        (X.indep ? ' · INDEPENDENT SWEEP' : ' · PROTECTS ' + X.prot.map(f => f.name).join(', ')) +
        ' · TGT ' +
        be(g),
      box: [
        ['POSITION', code(), m == 'sweep' ? 'sweep' : m == 'det' ? 'detached escort' : 'embedded escort'],
        [
          'LEAD',
          '+' + S.lead + ' min',
          (S.off ? S.off + ' NM ' + (S.side < 0 ? 'left' : 'right') : 'on the route') + ' of the package',
        ],
        ['COMMIT', S.commit + ' NM', 'WPN ' + S.wpn.toUpperCase()],
        ['PKG TOT', hm(g.t), 'STOP ' + S.stop + ' NM from it'],
      ],
      warn: W.filter(w => w[1]).map(w => w[0]),
      rows: [
        ['PACKAGE', X.indep ? 'none: independent sweep' : X.prot.map(f => f.name).join(', ')],
        ['PUSH / TOT', hm(WIN.t0) + ' / ' + hm(g.t)],
        ['BLOCK', altBlock(S.alt)],
        ['TGT AREA', S.ta + ' NM · ' + be(g)],
        ['SAMS', sams.length ? sams.map(c => c.name).join(', ') : 'none on the track', sams.length > 0],
        ['MAR / DOR', TL ? Math.round(TL.mar) + ' / ' + Math.round(TL.dor) + ' NM · ' + TL.cls : '--'],
        ['WPN', S.wpn.toUpperCase()],
        ['ID', id, id == 'none' && S.wpn == 'free'],
        ['BUGOUT', bo],
        ['JOKER / BINGO', (X.joker || '--') + ' / ' + (X.bingo || '--')],
        ['A-A', X.aa || '--'],
      ],
      calls: callsOf(),
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
      fitPts = [...WIN.pts, ...T],
      g = X.main.tgt,
      p = await snapMap(M, deps, fitPts, AR, keep, [g, { x: g.x + 10 * KM_NM, y: g.y }]);
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
      mid = (S.alt[0] + S.alt[1]) / 2,
      W0 = B.wx ? wxAtTarget(B.wx, mid) : null,
      blk = altBlock(S.alt),
      check = !W0
        ? null
        : W0.base == null
          ? { label: 'NO CLOUD OVER THE TARGET ✓' }
          : S.alt[0] > W0.top
            ? { label: 'BLOCK ' + blk + ' ABOVE THE TOPS ✓' }
            : S.alt[1] < W0.base
              ? { label: 'BLOCK ' + blk + ' UNDER THE BASE' }
              : { label: 'BLOCK ' + blk + ' IN CLOUD', bad: true };
    return {
      title: 'MISSION · ' + X.me.kind,
      right: D.right,
      key: D.key,
      mod: {
        kind: 'aa',
        label: 'OCA · ' + X.me.kind + ' ' + code(),
        plan: D.plan,
        lines: [
          code() + ' · +' + S.lead + ' MIN',
          blk + ' · ' + S.wpn.toUpperCase(),
          'COMMIT ' + S.commit + ' NM',
          ['STOP ' + S.stop + ' NM FROM PKG', true],
          'TGT AREA ' + S.ta + ' NM',
          'PKG TOT ' + hm(X.main.tgt.t),
          ...(TL ? ['DOR ' + Math.round(TL.dor) + ' NM'] : []),
        ],
        line: X.indep
          ? 'INDEPENDENT SWEEP · OWN ROUTE'
          : 'PROTECTS ' + X.prot.map(f => f.name.toUpperCase()).join(', '),
      },
      tgt: null,
      sam: null,
      wx: W0,
      windLabel: 'WIND ' + altTxt(mid),
      wxLabel: 'WEATHER AT TGT',
      check,
      roe: B.roe || null,
      last: ['PUSH ' + hm(WIN.t0) + ' · TOT ' + hm(X.main.tgt.t), D.lastRed ? D.last : ''],
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
  const cardName = k => (k == 'map' ? 'OCA · ' : k == 'combo' ? 'Smart · Mission · ' : 'Smart · OCA · ') + X.me.name;
  async function ready(pic = true) {
    await tlLoad();
    compute();
    if (!X || !X.ok) return false;
    await comboLoad();
    CL = classicData();
    if (pic) {
      const B = aaBox(CL);
      try {
        CL.px = await busyRun('Preparing the OCA cards…', () => snapPlan(B.w / B.h));
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
      if (!(await ready())) return deps.toast('OCA card: ' + (X ? X.why : 'no SWEEP or ESCORT flight'), true);
    } finally {
      if (btn) btn.disabled = false;
    }
    await addCards(deps, KINDS, drawCard, cardName, 'Add OCA cards to the Kneeboard', 'ocacardkinds', ['map']);
  }
  async function allCards() {
    if (!(await ready())) return [];
    return allOf(KINDS, drawCard, cardName, 'OCA');
  }

  return {
    root,
    allCards,
    addCard: b => addCard(b),
    dtcAuto,
    render: async () => {
      shown = true;
      await tlLoad();
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
    // Display > OCA of the Map page
    overlay: o => {
      compute();
      if (!X || !X.ok) return false;
      if (!o.map._ocR) {
        o.map.createPane('ocP').style.zIndex = 470;
        o.map._ocR = o.L.canvas({ pane: 'ocP' });
      }
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
    plan: () => (compute(), X && X.ok ? { S, T, WIN, W, code: code() } : null),
    smart: () => (compute(), X && X.ok ? smartData() : null),
    cardCanvas: async k => ((await ready(k == 'map')) ? drawCard(k || 'smart') : null),
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.timeline) deps.timeline = o.timeline;
      if (o.roeGet) deps.roeGet = o.roeGet;
      if (o.roeSet) deps.roeSet = o.roeSet;
    },
  };
}
