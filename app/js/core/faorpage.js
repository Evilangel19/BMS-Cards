// @ts-check
// A-A > DCA: the Fighter Area Of Responsibility of a CAP flight (BARCAP, CAP, AMBUSHCAP, TARCAP, DCA, HAVCAP, RESCAP; core/faor.js). The FEZ on the
// threat axis (from the two CAP steerpoints, on the side of the nearest enemy), its lines and its altitude block, with sliders that start from the
// profile of the kind of mission and stop at the minimums of BMS; the warnings in red. The A-A block of the ROE of the flight follows the page (deps.roeSet),
// the Map page draws it (Display > DCA), its lines go into the DTC (deps.dtcLines), its cards go to the Kneeboard (with the map, Smart DCA, Smart mission).
// The plan is one list of shapes (spec), drawn on the map, on the classic card and on the Smart card (core/aakit.js).
// deps: {esc, toast, ctx () -> X, attach, detach, toLL, cyclePlan, planMode, msa (km polygon) -> Promise<ft | null>, roeGet () -> sel, roeSet (block),
//        dtcLines ({parts, sit, sitName, key}, name) -> {msg, bad}, timeline () -> Promise<rows>, combo () -> Promise<base>, kbAdd, snap (scale)}
// X: {ok, why, me {key, name, mission, kind, n, ac, pkgNo, tag}, cap [{x, y, n, arr, dep}], enemy [{x, y, name}], bull {x, y} | null, mates [{name, anchor}],
//     targets [{x, y, name}], joker, bingo, aa (the A-A loadout, text)}
import {
  PROFILES,
  RANGE,
  KM_NM,
  STN_NM,
  capKind,
  plannedMin,
  defaults,
  limits,
  cleanState,
  threatBrg,
  faorGeo,
  hardwall,
  checks,
  faorRoe,
  faorLines,
  faorDtcLines,
  altTxt,
  altBlock,
  bearing,
  distNm,
} from './faor.js';
import { mapKeep } from './mapkeep.js';
import { SC_W, SC_H } from './smartcard.js';
import { drawSmartAA } from './smartaa.js';
import { drawSmartCombined } from './smartcombo.js';
import { wxAtTarget } from './smartwx.js';
import { toMag } from './magvar.js';
import { drawAACard, aaBox, AAC_W, AAC_H } from './aacard.js';
import { busyRun } from './busy.js';
import { h3, hm, drawLeaflet, toPx, toInk, snapMap, addCards, allOf } from './aakit.js';

const COL = { fez: '#4aa3ff', commit: '#f0b040', stop: '#ef4444', hw: '#ffffff', cap: '#4cc38a', mate: '#9aa8b8' };
const KINDS = [
  ['map', 'With the map'],
  ['smart', 'Smart DCA'],
  ['combo', 'Smart mission'],
];

export function createFaorPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'fapage';
  let st = { f: {} },
    X = null,
    S = null, // the state of the flight shown
    G = null,
    HW = null,
    W = [],
    MSA = { k: '', v: null, p: null },
    TL = null, // the BVR timeline: {dor, mar, cls}
    M = null,
    pend = null,
    failed = false,
    fit = true,
    fitKey = '',
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('dca1') || 'null');
    if (o && typeof o == 'object' && o.f && typeof o.f == 'object') st = o;
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem('dca1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const planned = () => (X && X.ok ? plannedMin(X.cap) : 0);

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    if (!X || !X.ok) {
      S = G = HW = null;
      W = [];
      return;
    }
    const k = X.me.kind,
      raw = st.f[X.me.key];
    S = cleanState(raw || defaults(k, planned(), MSA.v), k, planned());
    S.altAuto = raw ? raw.altAuto !== false && PROFILES[k].alt == 'msa' : PROFILES[k].alt == 'msa';
    if (!raw) {
      st.f[X.me.key] = { ...S };
      save();
    }
    const a0 = X.cap.length ? X.cap : [{ x: 512, y: 512 }],
      anc = { x: (a0[0].x + a0[a0.length - 1].x) / 2, y: (a0[0].y + a0[a0.length - 1].y) / 2 };
    G = faorGeo(X.cap, threatBrg(anc, X.enemy), S);
    HW = hardwall(G, S, X.mates);
    const roe = roeNow();
    W = checks(G, S, {
      kind: k,
      planned: planned(),
      msa: MSA.k == msaKey() ? MSA.v : null,
      dor: TL ? TL.dor : null,
      idOk: roe ? roe.roe.id.length > 0 : null,
      bingo: roe ? roe.roe.abort.includes('bingo') : null,
      hw: HW,
      targets: X.targets,
    });
  }
  const roeNow = () => {
    try {
      return deps.roeGet ? deps.roeGet() : null;
    } catch (e) {
      return null;
    }
  };
  // the MSA of the FEZ (the highest ground under it + 1 000 ft), read once for each FEZ; the AMBUSHCAP block follows it until a slider moves it
  const msaKey = () => (G ? G.box.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(';') : '');
  function msaAsk() {
    const k = msaKey();
    if (!k || MSA.k == k || !deps.msa) return;
    MSA = { k, v: null, p: null };
    MSA.p = Promise.resolve(deps.msa(G.box))
      .then(v => {
        if (MSA.k != k) return;
        MSA.v = v == null ? null : v;
        const f = X && X.ok && st.f[X.me.key];
        if (f && S && S.altAuto && v != null) {
          const D = defaults(X.me.kind, planned(), v);
          f.alt = D.alt;
          save();
        }
        if (shown) draw(false);
      })
      .catch(() => {});
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
  // the FAOR block of the ROE of the flight, as the page is now
  function roeWrite() {
    if (!X || !X.ok || !deps.roeSet) return;
    try {
      deps.roeSet(faorRoe(S, X.me.kind, HW ? HW.name : ''));
    } catch (e) {
      /* the ROE page is not there (tests) */
    }
  }
  const set = (k, v) => {
    const f = st.f[X.me.key];
    f[k] = v;
    if (k == 'alt') f.altAuto = false;
    save();
  };

  // ---- the page
  const slider = (k, lab, R, v, txt) =>
    `<div class="slr"><label>${lab}</label><input type="range" min="${R[0]}" max="${R[1]}" step="${R[2]}" value="${v}" data-fa="${k}"><em data-fae="${k}">${txt}</em></div>`;
  const seg = (k, opts, c) =>
    `<span class="seg">${opts.map(([v, l, t]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-faset="${k}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</span>`;
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  const val = {
    cor: v => (v > 0 ? '+' : '') + v + '°',
    w: v => v + ' NM',
    d: v => v + ' NM',
    commit: v => v + ' NM',
    stop: v => v + ' NM',
    drop: v => v + ' NM',
    stn: v => v + ' min',
    a0: v => altTxt(v),
    a1: v => altTxt(v),
  };
  function build() {
    if (!X || !X.ok) {
      root.innerHTML = `<div class="wcard sdnone fx"><h3>DCA</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a CAP flight.')}</p><p class="hint">The FAOR is planned for the CAP flights: BARCAP, CAP, AMBUSHCAP, TARCAP, DCA, HAVCAP and RESCAP. Choose one in the ATO.</p></div>`;
      return;
    }
    const L = limits(X.me.kind, planned());
    root.innerHTML = `<div class="wpg fag"><div class="wpl">
      <div class="wcard" id="fafl"></div>
      <div class="wcard"><div class="wh"><h3>Threat axis</h3><span style="flex:1"></span>${seg(
        'axis',
        [
          ['perp', 'CAP leg ⟂', 'Square to the leg between the two CAP points, on the side of the enemy airbases'],
          ['par', 'CAP leg ∥', 'Along the leg between the two CAP points, toward the enemy airbases'],
        ],
        S.axis
      )}</div>${slider('cor', 'Correction', RANGE.cor, S.cor, val.cor(S.cor))}<p class="hint" id="faax"></p></div>
      <div class="wcard"><div class="wh"><h3>FEZ</h3><span style="flex:1"></span>${seg(
        'wpn',
        [
          ['free', 'FREE', 'WEAPONS FREE: fire at any target not identified as friendly'],
          ['tight', 'TIGHT', 'WEAPONS TIGHT: fire only at targets identified as hostile'],
          ['hold', 'HOLD', 'WEAPONS HOLD: fire only in self-defence or when ordered'],
        ],
        S.wpn
      )}</div>${slider('w', 'FEZ width', RANGE.w, S.w, val.w(S.w))}${slider('d', 'FEZ depth', RANGE.d, S.d, val.d(S.d))}${slider('a0', 'FEZ floor', RANGE.alt, S.alt[0], val.a0(S.alt[0]))}${slider('a1', 'FEZ ceiling', RANGE.alt, S.alt[1], val.a1(S.alt[1]))}</div>
      <div class="wcard"><h3>Lines</h3>${slider('commit', 'COMMIT', RANGE.commit, S.commit, val.commit(S.commit))}${slider('stop', 'STOP', RANGE.stop, S.stop, val.stop(S.stop))}${slider('drop', 'DROP', RANGE.drop, S.drop, val.drop(S.drop))}${slider('stn', 'On station', L.stn, S.stn, val.stn(S.stn))}<p class="hint">COMMIT: a hostile group closer than this toward the threat. STOP: no pursuit beyond it. DROP: a group running cold further than this is let go. On station: not less than planned (BMS fails the mission).</p></div>
      </div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>FAOR</h3><span style="flex:1"></span><button class="btn g" type="button" data-fafit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-fapf title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div>
      <div id="famap" class="wmapbox"></div><div class="wleg" id="faleg"></div></div></div>
      <div class="wpr"><div class="wcard" id="fadt"></div><div class="wcard" id="fawn"></div><div class="wcard" id="faroe"></div></div></div>`;
    wire();
  }
  function fill() {
    if (!X || !X.ok || !root.querySelector('#fafl')) return;
    const q = s => root.querySelector(s),
      me = X.me,
      P = PROFILES[me.kind],
      pl = planned(),
      c0 = X.cap[0],
      c1 = X.cap[X.cap.length - 1];
    q('#fafl').innerHTML =
      `<h3>${esc(me.name)} · ${esc(me.kind)}</h3><div class="kv">${kv('FLIGHT', esc(me.n + '× ' + me.ac + ' · PKG ' + me.pkgNo))}${kv('CAP', X.cap.length ? 'STPT ' + X.cap.map(p => p.n).join(' · ') : 'no CAP steerpoint', X.cap.length ? '' : 'wbad')}${kv('ON STATION', c0 && c0.arr ? hm(c0.arr) + ' – ' + hm(c1.dep || c1.arr) + (pl ? ' · ' + pl + ' min' : '') : '--')}${kv('ANCHOR', esc(P.anchor))}</div><div class="wbtns"><button class="btn g" type="button" data-fadtc title="The FEZ, COMMIT / STOP and the HARDWALL as lines of the DTC (LINE1-4 of the F-16; the SIT line FEZ of the F-15). Lines this page wrote before are replaced, after asking.">DTC lines</button><button class="btn g" type="button" data-fareset title="The values of the profile of the kind of mission">Reset profile</button></div>`;
    const en = G.enemy;
    q('#faax').textContent =
      'Threat ' +
      h3(toMag(G.brg)) +
      '° magnetic' +
      (G.leg != null ? ' · CAP leg ' + h3(toMag(G.leg)) + '°' : ' · one CAP point: straight at the enemy') +
      (en != null ? ' · nearest enemy ' + h3(toMag(en)) + '°' : ' · no enemy known');
    Object.entries(val).forEach(([k, f]) => {
      const e = q(`[data-fae="${k}"]`),
        v = k == 'a0' ? S.alt[0] : k == 'a1' ? S.alt[1] : S[k];
      if (e) e.textContent = f(v);
      const i = /** @type {HTMLInputElement|null} */ (q(`[data-fa="${k}"]`));
      if (i && document.activeElement !== i) i.value = String(v);
    });
    root.querySelectorAll('[data-faset]').forEach(b => {
      const el = /** @type {HTMLElement} */ (b);
      el.classList.toggle('on', String(S[el.dataset.faset]) === el.dataset.v);
    });
    const be = X.bull ? h3(toMag(bearing(X.bull, G.anchor))) + '/' + Math.round(distNm(X.bull, G.anchor)) : '--',
      msa = MSA.k == msaKey() ? MSA.v : null;
    q('#fadt').innerHTML =
      `<h3>Data</h3><div class="kv">${kv('FEZ', S.w + ' × ' + S.d + ' NM · ' + esc(altBlock(S.alt)))}${kv('WPN', S.wpn.toUpperCase())}${kv('ANCHOR', 'BE ' + be)}${kv('MSA FEZ', msa == null ? '--' : altTxt(msa))}${kv('JOKER / BINGO', esc((X.joker || '--') + ' / ' + (X.bingo || '--')))}${kv('MAR / DOR', TL ? Math.round(TL.mar) + ' / ' + Math.round(TL.dor) + ' NM · ' + esc(TL.cls) : '--')}${kv('A-A', esc(X.aa || '--'))}${kv('HARDWALL', HW ? esc(HW.name) + ' · ' + Math.round(HW.gap) + ' NM' : 'no CAP within 80 NM', HW && HW.gap < 5 ? 'wbad' : '')}</div><p class="hint wnote">MAR / DOR: the worst row of the Timeline. The anchor: the middle of the CAP points, from the bullseye of the campaign.</p>`;
    q('#fawn').innerHTML =
      `<h3>Checks</h3>${W.length ? W.map(([t, red]) => `<div class="${red ? 'wbad' : 'hint'}">${esc(t)}</div>`).join('') : '<div class="sdok">No problem found.</div>'}`;
    const roe = roeNow(),
      fa = faorRoe(S, me.kind, HW ? HW.name : ''),
      id = roe && roe.roe.id.length ? roe.roe.id.join(' + ').toUpperCase() : 'none',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.join(' / ').toUpperCase() : 'none';
    q('#faroe').innerHTML =
      `<h3>ROE · A-A block</h3><div class="hint">${faorLines(fa, false).map(esc).join(' · ')}</div><div class="kv">${kv('ID', esc(id), id == 'none' && S.wpn == 'free' ? 'wbad' : '')}${kv('BUGOUT', esc(bo))}</div><p class="hint wnote">Written in the ROE of the flight (Squadron > ROE / SOP): its weapons control and commit win over those of the preset.</p>`;
    legend();
  }
  function legend() {
    const e = root.querySelector('#faleg');
    if (!e) return;
    const it = (c, t, dash) =>
      `<span><i style="border-top:2px ${dash ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    e.innerHTML = [
      it(COL.fez, 'FEZ'),
      it(COL.commit, 'COMMIT', true),
      it(COL.stop, 'STOP'),
      it(COL.hw, 'HARDWALL', true),
      it(COL.cap, 'CAP · ' + STN_NM + ' NM', true),
    ].join(' ');
  }

  // ---- the map (Leaflet lent by the Map page)
  const VK = mapKeep();
  async function ensureMap() {
    const box = root.querySelector('#famap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._faR) {
      o.map.createPane('faP').style.zIndex = 470;
      o.map._faR = o.L.canvas({ pane: 'faP' });
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
  // THE PLAN, one list of shapes (core/aakit.js) for the map, the classic card and the Smart card
  function spec() {
    const c0 = X.cap[0],
      c1 = X.cap[X.cap.length - 1],
      f = G.at(0, G.front),
      t = G.at(0, G.front + Math.max(8, S.d / 3)),
      stn = 'ON STN ' + (c0.arr ? hm(c0.arr) + '-' + hm(c1.dep || c1.arr) + ' · ' : '') + S.stn + ' min';
    return [
      ...X.cap.map(p => ({ t: 'ring', c: p, r: STN_NM * KM_NM, col: COL.cap, dash: [3, 5], ink: { dash: [2, 4] } })),
      { t: 'poly', pts: G.box, close: true, fill: true, col: COL.fez, w: 2, ink: { w: 2, fill: 'rgba(0,0,0,0.05)' } },
      ...(X.cap.length > 1
        ? [{ t: 'poly', pts: X.cap, col: COL.cap, w: 4, fit: false, ink: { w: 5, round: true } }]
        : []),
      { t: 'poly', pts: G.commit, col: COL.commit, w: 2, dash: [8, 6], ink: { dash: [7, 4] } },
      { t: 'poly', pts: G.stop, col: COL.stop, w: 2.5, ink: { w: 2, red: true } },
      ...(HW
        ? [
            { t: 'poly', pts: [HW.a, HW.b], col: COL.hw, w: 2.5, dash: [10, 7], ink: { w: 2.5, dash: [8, 5] } },
            {
              t: 'label',
              p: HW.b,
              text: 'HARDWALL ' + HW.name,
              col: COL.hw,
              ink: { text: 'HARDWALL ' + String(HW.name).toUpperCase() },
            },
          ]
        : []),
      ...X.cap.map((p, i) => ({
        t: 'dot',
        p,
        col: COL.cap,
        ink: { label: 'CAP' + (X.cap.length > 1 ? i + 1 : ''), bold: true },
      })),
      { t: 'arrow', from: G.anchor, to: t, text: 'THREAT ' + h3(toMag(G.brg)) + '°', col: COL.stop },
      {
        t: 'label',
        p: G.commit[1],
        text: 'COMMIT ' + S.commit + ' · WPN ' + S.wpn.toUpperCase(),
        col: COL.commit,
        ink: {
          p: G.commit[0],
          at: [
            [6, -7],
            [6, 15],
          ],
        },
      },
      {
        t: 'label',
        p: G.stop[1],
        text: 'STOP ' + S.stop + ' · DROP ' + S.drop,
        col: COL.stop,
        ink: {
          p: G.stop[0],
          red: true,
          bold: true,
          at: [
            [6, -7],
            [6, 15],
          ],
        },
      },
      {
        t: 'label',
        p: c1,
        text: stn,
        col: COL.cap,
        ink: {
          at: [
            [-30, 20],
            [-30, -12],
            [10, 20],
          ],
        },
      },
      { t: 'label', p: f, text: 'FEZ ' + altBlock(S.alt), col: COL.fez, ink: false },
    ];
  }
  const layers = (L, map, WL) => drawLeaflet(L, map._faR, WL, deps.toLL, spec(), esc);
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
    if (rebuild || !root.querySelector('.fag') !== !(X && X.ok) || was !== (X && X.ok)) {
      detachMap(true);
      failed = false;
      pend = null;
      build();
    }
    if (X && X.ok) msaAsk();
    fill();
    paint();
    if (other) roeWrite(); // another flight: its FAOR block
  }

  // ---- the controls
  function wire() {
    root.oninput = e => {
      const t = /** @type {HTMLInputElement} */ (e.target),
        k = t.dataset && t.dataset.fa;
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
      if (t.dataset && t.dataset.fa) roeWrite();
    };
    root.onclick = e => {
      const c = s => /** @type {HTMLElement|null} */ (e.target.closest && e.target.closest(s));
      if (!X || !X.ok) return;
      const sg = c('[data-faset]');
      if (sg) {
        set(sg.dataset.faset, sg.dataset.v);
        compute();
        fill();
        paint();
        return roeWrite();
      }
      if (c('[data-fafit]')) {
        fit = true;
        return paint();
      }
      if (c('[data-fareset]')) {
        st.f[X.me.key] = { ...defaults(X.me.kind, planned(), MSA.k == msaKey() ? MSA.v : null), altAuto: true };
        save();
        draw(true);
        return roeWrite();
      }
      if (c('[data-fadtc]')) return dtc();
      const po = c('[data-fapf]');
      if (po) {
        const LAB = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'];
        const m = deps.cyclePlan ? deps.cyclePlan() : 0;
        po.textContent = LAB[m];
        paint();
      }
    };
    const po = root.querySelector('[data-fapf]');
    if (po) po.textContent = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'][deps.planMode ? deps.planMode() : 0];
  }
  async function dtc() {
    const r = await dtcAuto();
    if (r && r.msg) deps.toast(r.msg, !!r.bad);
  }
  // the lines of the FAOR into the DTC (also AUTO > FEZ of the Map page): {msg, bad} or null
  async function dtcAuto() {
    compute();
    if (!X || !X.ok) return { msg: 'FEZ: ' + (X ? X.why : 'no CAP flight'), bad: true };
    if (!deps.dtcLines) return null;
    const L = faorDtcLines(G, HW);
    return deps.dtcLines(
      {
        parts: [['fez', 'FEZ', L.fez], ['cs', 'COMMIT / STOP', L.cs], ...(L.hw ? [['hw', 'HARDWALL', L.hw]] : [])],
        sit: 8,
        sitName: 'FEZ',
        key: 'dca',
      },
      X.me.name
    );
  }

  // ---- the cards
  function planData() {
    return toInk(spec(), {
      bull: X.bull,
      be: X.bull ? 'BE ' + h3(toMag(bearing(X.bull, G.anchor))) + '/' + Math.round(distNm(X.bull, G.anchor)) : '',
      legend: 'COMMIT, HARDWALL dashed · STOP red · rings ' + STN_NM + ' NM: station',
    });
  }
  function smartData() {
    const me = X.me,
      roe = roeNow(),
      be = p => (X.bull ? 'BE ' + h3(toMag(bearing(X.bull, p))) + '/' + Math.round(distNm(X.bull, p)) : ''),
      c0 = X.cap[0],
      c1 = X.cap[X.cap.length - 1],
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : '',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.map(v => v.toUpperCase()).join(' / ') : '';
    return {
      title: 'A-A · DCA · ' + me.kind,
      planLabel: 'FAOR',
      right: me.tag || me.name.toUpperCase(),
      key: [
        ['AXIS', h3(toMag(G.brg)) + '°'],
        ['FEZ', S.w + '×' + S.d],
        ['ALT', altBlock(S.alt)],
        ['WPN', S.wpn.toUpperCase(), S.wpn == 'free'],
        ['COMMIT', S.commit + ' NM'],
        ['STOP', S.stop + ' NM', true],
        ['ON STN', c0 && c0.arr ? hm(c0.arr) + '-' + hm(c1.dep || c1.arr) : S.stn + ' min'],
        ['BINGO', X.bingo || '--', true],
      ],
      plan: planData(),
      blocks: [
        ['FEZ', ['ANCHOR ' + be(G.anchor), 'CAP ' + X.cap.map(p => 'STPT ' + p.n).join(' · '), 'NO FIRE OUTSIDE FEZ']],
        ['ID / BUGOUT', ['ID ' + (id || '--'), 'BUGOUT ' + (bo || '--'), 'JOKER ' + (X.joker || '--')]],
        [
          'LINES',
          [
            'COMMIT ' + S.commit + ' NM toward ' + h3(toMag(G.brg)) + '°',
            ['STOP ' + S.stop + ' NM: no pursuit beyond', true],
            'DROP ' + S.drop + ' NM cold',
            ...(TL ? ['MAR ' + Math.round(TL.mar) + ' · DOR ' + Math.round(TL.dor) + ' (' + TL.cls + ')'] : []),
          ],
        ],
        ['CALLS', ['"ON STATION ' + be(G.anchor) + '"', '"COMMITTING" · "OFF STATION"']],
      ],
      foot: [
        [
          'TIME',
          'ON ' + (c0 && c0.arr ? hm(c0.arr) : '--'),
          'OFF ' + (c1 && (c1.dep || c1.arr) ? hm(c1.dep || c1.arr) : '--'),
        ],
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
        : HW
          ? 'HARDWALL ' + HW.name + ' +5 NM'
          : 'NO FIRE OUTSIDE FEZ',
      lastRed: W.some(w => w[1]),
    };
  }
  // ---- the classic card: the picture of the page's map with the FAOR drawn in its pixels
  function classicData() {
    const me = X.me,
      roe = roeNow(),
      c0 = X.cap[0],
      c1 = X.cap[X.cap.length - 1],
      be = p => (X.bull ? 'BE ' + h3(toMag(bearing(X.bull, p))) + '/' + Math.round(distNm(X.bull, p)) : '--'),
      msa = MSA.k == msaKey() ? MSA.v : null,
      id = roe && roe.roe.id.length ? roe.roe.id.map(v => v.toUpperCase()).join(' + ') : 'none',
      bo = roe && roe.roe.abort.length ? roe.roe.abort.map(v => v.toUpperCase()).join(' / ') : 'none',
      cs = me.name.toUpperCase();
    return {
      head: 'A-A · DCA · ' + me.kind,
      rowsHead: 'FEZ · ROE',
      title: me.name + ' · ' + me.n + '× ' + me.ac,
      sub: 'PKG ' + me.pkgNo + ' · CAP STPT ' + X.cap.map(p => p.n).join(' · ') + ' · ANCHOR ' + be(G.anchor),
      box: [
        ['THREAT AXIS', h3(toMag(G.brg)) + '°', S.axis == 'par' ? 'along the CAP leg' : 'square to the CAP leg'],
        ['COMMIT', S.commit + ' NM', 'WPN ' + S.wpn.toUpperCase(), S.wpn == 'free'],
        ['STOP', S.stop + ' NM', 'DROP ' + S.drop + ' NM cold', true],
        [
          'ON STATION',
          S.stn + ' min',
          c0 && c0.arr ? hm(c0.arr) + '–' + hm(c1.dep || c1.arr) : 'planned ' + planned() + ' min',
        ],
      ],
      warn: W.filter(w => w[1]).map(w => w[0]),
      rows: [
        ['FEZ', S.w + ' × ' + S.d + ' NM'],
        ['BLOCK', altBlock(S.alt)],
        ['MSA FEZ', msa == null ? '--' : altTxt(msa), msa != null && S.alt[0] < msa],
        ['ANCHOR', be(G.anchor)],
        ['HARDWALL', HW ? HW.name + ' · 5 NM buffer' : 'none', !!HW && HW.gap < 5],
        ['MAR / DOR', TL ? Math.round(TL.mar) + ' / ' + Math.round(TL.dor) + ' NM · ' + TL.cls : '--'],
        ['WPN', S.wpn.toUpperCase() + ' · NO FIRE OUTSIDE FEZ'],
        ['ID', id, id == 'none' && S.wpn == 'free'],
        ['BUGOUT', bo],
        ['JOKER / BINGO', (X.joker || '--') + ' / ' + (X.bingo || '--')],
        ['A-A', X.aa || '--'],
      ],
      calls: [
        '"' + cs + ', ON STATION, ' + be(G.anchor) + ', ' + altBlock(S.alt) + '"',
        '"' + cs + ', COMMITTING" · ' + 'a hostile group inside ' + S.commit + ' NM toward ' + h3(toMag(G.brg)) + '°',
        '"' + cs + ', OFF STATION" · at ' + (c1 && (c1.dep || c1.arr) ? hm(c1.dep || c1.arr) : '--') + ' or at JOKER',
      ],
      px: null,
    };
  }
  // the map for the card: the page's map (opened out of sight when the page is not shown), the view as the pilot left it, the plan in its pixels
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
      fitPts = [...G.box, ...G.commit, ...G.stop, ...(HW ? [HW.a, HW.b] : [])],
      p = await snapMap(M, deps, fitPts, AR, keep, [G.anchor, G.at(0, 10)]);
    return p ? { img: p.img, coast: p.coast, nm: p.nm, ...toPx(S0, p.px, p.nm) } : null;
  }
  let CL = null; // the classic card data with its picture, made before the window opens
  let COMBO = null;
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
          ? { label: 'NO CLOUD OVER THE FAOR ✓' }
          : S.alt[0] > W0.top
            ? { label: 'FEZ ' + blk + ' ABOVE THE TOPS ✓' }
            : S.alt[1] < W0.base
              ? { label: 'FEZ ' + blk + ' UNDER THE BASE' }
              : { label: 'FEZ ' + blk + ' IN CLOUD', bad: true };
    return {
      title: 'MISSION · ' + X.me.kind,
      right: D.right,
      key: D.key,
      mod: {
        kind: 'aa',
        label: 'DCA · FAOR · THREAT ' + h3(toMag(G.brg)) + '°',
        plan: D.plan,
        lines: [
          'FEZ ' + S.w + '×' + S.d + ' NM',
          blk + ' · ' + S.wpn.toUpperCase(),
          'COMMIT ' + S.commit + ' NM',
          ['STOP ' + S.stop + ' NM', true],
          'DROP ' + S.drop + ' NM',
          ...(TL ? ['DOR ' + Math.round(TL.dor) + ' NM'] : []),
          ...(HW ? [['HARDWALL ' + String(HW.name).toUpperCase(), true]] : []),
          'NO FIRE OUTSIDE FEZ',
        ],
        line: D.blocks[0][1][0] + ' · ' + D.blocks[0][1][1],
      },
      tgt: null,
      sam: null,
      wx: W0,
      windLabel: 'WIND ' + altTxt(mid),
      check,
      roe: B.roe || null,
      wxLabel: 'WEATHER AT CAP',
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
  const cardName = k => (k == 'map' ? 'DCA · ' : k == 'combo' ? 'Smart · Mission · ' : 'Smart · DCA · ') + X.me.name;
  async function ready(pic = true) {
    await tlLoad();
    compute();
    if (!X || !X.ok) return false;
    await comboLoad();
    CL = classicData();
    if (pic) {
      const B = aaBox(CL);
      try {
        CL.px = await busyRun('Preparing the DCA cards…', () => snapPlan(B.w / B.h));
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
      if (!(await ready())) return deps.toast('DCA card: ' + (X ? X.why : 'no CAP flight'), true);
    } finally {
      if (btn) btn.disabled = false;
    }
    await addCards(deps, KINDS, drawCard, cardName, 'Add DCA cards to the Kneeboard', 'faorcardkinds', ['map']);
  }
  // every card of the page, in both looks, for Add all cards of the Kneeboard (none without a CAP flight)
  async function allCards() {
    if (!(await ready())) return [];
    return allOf(KINDS, drawCard, cardName, 'DCA');
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
    // Display > FAOR of the Map page: the FAOR of the flight in the group given, without moving the view; false: nothing to draw
    overlay: o => {
      compute();
      if (!X || !X.ok) return false;
      if (!o.map._faR) {
        o.map.createPane('faP').style.zIndex = 470;
        o.map._faR = o.L.canvas({ pane: 'faP' });
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
    geo: () => (compute(), G),
    warnings: () => (compute(), W),
    smart: () => (compute(), X && X.ok ? smartData() : null),
    combo: () => (compute(), X && X.ok ? comboData() : null),
    cardCanvas: async k => ((await ready(k == 'map')) ? drawCard(k || 'smart') : null),
    classic: () => (compute(), X && X.ok ? classicData() : null),
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.msa) deps.msa = o.msa;
      if (o.timeline) deps.timeline = o.timeline;
      if (o.roeGet) deps.roeGet = o.roeGet;
      if (o.roeSet) deps.roeSet = o.roeSet;
    },
  };
}
export { capKind };
