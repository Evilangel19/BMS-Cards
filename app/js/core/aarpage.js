// @ts-check
// Performance > AAR: the refuelling of the flight chosen at its tanker (core/aar.js). The tankers of the datacard (TANKER 1 / 2), the rendezvous (EN ROUTE:
// the tanker where it is at the time of the Refuel steerpoint; ANCHOR: as it passes the first point of its track; HEAD-ON: planned, not made yet), the gap
// at the ARIP, the fuel (FULL, to the JOKER, an AMOUNT) from the fuel plan of the Performance page (deps.fuel), the procedure for the boom or the probe
// with the calls by their names, the map (the lent Leaflet map), the cards (Smart AAR, classic with the map), Display > AAR on the Map page, OA1 / OA2 of the
// Refuel steerpoint in the DTC. One list of shapes for the map and the cards (core/aakit.js).
// The page draws inside the Performance page (core/perfpage.js): left() is its card in the left column, mount() the middle and the right columns.
// deps: {esc, toast, confirm, ctx() -> X, fuel(wps) -> {plan, need(k), loaded, joker} | null, toLL, attach, detach, snap, kbAdd, dtc {open, has, setOA}, sop()}
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
  RATE,
} from './aar.js';
import { tankerJB } from './fuelplan.js';
import { timed } from './sead.js';
import { atmos, cas } from './airperf.js';
import { mapKeep } from './mapkeep.js';
import { SC_W, SC_H } from './smartcard.js';
import { drawSmartAar } from './smartaar.js';
import { drawAACard, aaBox, AAC_W, AAC_H } from './aacard.js';
import { busyRun } from './busy.js';
import { drawLeaflet, toPx, toInk, snapMap, addCards, allOf } from './aakit.js';

const COL = { trk: '#4aa3ff', me: '#3ddc84', anc: '#f0b040', ip: '#b07cff', stpt: '#8b98a8', tk: '#e6edf3' };
const KINDS = [
  ['smart', 'Smart AAR'],
  ['map', 'With the map'],
];
const GAP = [2, 20, 1];
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
  // the defaults of a flight: the rendezvous and the offload of its SOP (Tanker), a gap of 6 NM
  const sopOf = id => ((X && X.sop) || []).find(t => t.id == id);
  function defaults() {
    const rv = sopOf('rv'),
      off = sopOf('offload');
    return {
      tk: 0,
      mode: rv && rv.o == 'anchor' ? 'anchor' : 'enr',
      fill: off && (off.o == 'topoff' || off.o == 'plan') ? 'joker' : 'full',
      amount: 4000,
      gap: 6,
    };
  }

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    T = R = FU = null;
    why = '';
    if (!X || !X.ok) return;
    const d = defaults(),
      raw = st.f[X.me.key] || {};
    S = {
      tk: raw.tk == 1 && X.tankers.length > 1 ? 1 : 0,
      mode: ['enr', 'anchor'].includes(raw.mode) ? raw.mode : d.mode,
      fill: ['full', 'joker', 'amount'].includes(raw.fill) ? raw.fill : d.fill,
      amount: Math.max(0, Math.min(20000, +raw.amount || d.amount)),
      gap: Math.max(GAP[0], Math.min(GAP[1], +raw.gap || d.gap)),
    };
    const tk = X.tankers[S.tk];
    if (!tk) return void (why = 'No tanker on the datacard of ' + X.me.name + ' (TANKER 1 / 2).');
    T = trackOf(tk.wps);
    if (!T) return void (why = tk.name + ' has no track (two Fuel steerpoints of a tanker).');
    const w = timed(X.wps),
      at = w.find(p => p.n == X.k + 1),
      prev = w.find(p => p.n == X.k);
    if (!at) return void (why = 'The Refuel steerpoint ' + (X.k + 1) + ' of ' + X.me.name + ' has no time.');
    const from = prev ? { x: prev.x, y: prev.y, t: prev.dep > prev.arr ? prev.dep : prev.arr } : null;
    R = rendezvous({ T, mode: S.mode, gap: S.gap, plan: at.arr, from });
    if (!R) return void (why = 'The tanker does not fly at the time of the Refuel steerpoint.');
    R.from = from;
    R.at = at;
    fuel();
  }
  // the fuel along the plan to the tanker, and after it; null without the aircraft data
  function fuel() {
    const F = deps.fuel ? deps.fuel(X.wps) : null;
    if (!F || !F.plan) return;
    const rows = F.plan.rows,
      k = X.k,
      used = i => rows[0].minExact - rows[i].minExact,
      fk1 = F.loaded - used(k - 1),
      pn = rows[k].nm > 0 ? rows[k].burn / rows[k].nm : 15,
      d1 = R.from ? Math.hypot(R.arip.x - R.from.x, R.arip.y - R.from.y) / KM_NM : 0,
      d2 = Math.hypot(R.arcp.x - R.arip.x, R.arcp.y - R.arip.y) / KM_NM,
      fArip = fk1 - pn * d1,
      fArct = fArip - pn * d2,
      need = F.need(k),
      O = onload({ at: fArct, need, full: F.loaded, joker: F.joker, fill: S.fill, amount: S.amount }),
      jb = tankerJB(F.plan, X.wps, null, F.joker);
    FU = { fk1, fArip, fArct, need, d1, d2, ...O, jb, full: F.loaded };
  }
  const tk = () => X.tankers[S.tk];
  const method = () => methodOf(X.me.ac);
  const joinAlt = () => Math.max(1000, T.alt - JOIN_BELOW);
  const kcasOf = (tas, alt) => {
    const A = atmos(alt);
    return cas(tas / A.a, A);
  };
  const done = () => R.arct + 60000 + (FU ? FU.min * 60000 : 0);
  // the checks: the rendezvous, the tanker for the method, the fuel
  function warns() {
    const W = [...R.warn],
      m = method(),
      s = serves(tk().type, m);
    if (s === false)
      W.unshift([tk().type + ' has no ' + (m == 'probe' ? 'drogue' : 'boom') + ': choose the other tanker.', true]);
    if (FU && FU.fArct < 0) W.push(['Out of fuel before the tanker: the plan needs more fuel at take-off.', true]);
    else if (FU && FU.jb && FU.fArct < 1000)
      W.push(['Less than 1,000 lb at the join: push earlier or carry more fuel.', true]);
    if (FU && FU.short) W.push(['The onload does not cover the rest of the plan (' + fmt(FU.need) + ' lb).', true]);
    if (done() > T.t1) W.push(['The refuelling ends after the tanker leaves (' + hm(T.t1) + ').', true]);
    return W;
  }

  // ---- the shapes (the map, the classic card, the Smart card)
  function spec() {
    const n = X.k + 1,
      lab = (p, text, col, ink) => ({ t: 'label', p, text, col, ink: ink || false });
    return [
      { t: 'poly', pts: racetrack(T), col: COL.trk, w: 2, dash: [7, 5], close: true, ink: { dash: [4, 3] } },
      // the join leg fits the view; the way in from the steerpoint before does not (the cards stay on the track)
      ...(R.from ? [{ t: 'poly', pts: [R.from, R.arip], col: COL.me, w: 2.5, fit: false, ink: { w: 2 } }] : []),
      { t: 'poly', pts: [R.arip, R.arcp], col: COL.me, w: 2.5, ink: { w: 2 } },
      { t: 'dot', p: R.at, col: COL.stpt, k: 'sq', ink: { label: 'STPT ' + n } },
      lab(R.at, 'STPT ' + n, COL.stpt),
      { t: 'dot', p: T.a, col: COL.anc, k: 'dot', ink: { label: 'ANCHOR', bold: true } },
      lab(T.a, 'ANCHOR' + (S.mode == 'anchor' ? ' · OA1' : ''), COL.anc),
      { t: 'dot', p: R.arip, col: COL.ip, k: 'dot', ink: { label: 'ARIP ' + hm(R.tip), bold: true } },
      lab(R.arip, 'ARIP · OA2 · ' + hm(R.tip), COL.ip),
      { t: 'dot', p: R.arcp, col: COL.tk, k: 'tri', ink: { label: 'JOIN ' + hm(R.arct), bold: true } },
      lab(R.arcp, tk().name + ' at ' + hm(R.arct) + ' (ARCT)' + (S.mode == 'enr' ? ' · OA1' : ''), COL.tk),
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
    )}</div><div class="kv">${kv('TYPE', esc(t.type) + ' · ' + (serves(t.type, m) === false ? 'no ' + (m == 'probe' ? 'drogue' : 'boom') : m == 'probe' ? 'drogue' : 'boom'), serves(t.type, m) === false ? 'wbad' : '')}${kv('A-A TACAN', esc(tcnTxt(t)))}${kv('UHF', esc(t.uhf || '--'))}${T ? kv('TRACK', flOf(T.alt) + ' · ' + T.kcas + ' KCAS · ' + Math.round(T.leg) + ' NM legs') : ''}${kv('ON STATION', esc(t.win || '--'))}</div><div class="wrow"><label>Rendezvous</label>${seg(
      'mode',
      [
        [
          'enr',
          'EN ROUTE',
          'Join the tanker where it is at the time of your Refuel steerpoint, from behind on its path',
        ],
        [
          'anchor',
          'ANCHOR',
          'Wait for the tanker at the anchor (the first point of its track): from the ARIP behind it as it passes the anchor',
        ],
        [
          'head',
          'HEAD-ON',
          'Head-on: offset 8-9 NM, turn behind the tanker at 15 NM. In the next version of the program',
          true,
        ],
      ],
      S.mode
    )}</div><div class="wrow"><label>Fill to</label>${seg(
      'fill',
      [
        ['full', 'FULL', 'The fuel loaded at take-off'],
        ['joker', 'JOKER', 'What the rest of the plan needs plus the Joker margin of the Fuel plan'],
        ['amount', 'AMOUNT', 'A fixed onload'],
      ],
      S.fill
    )}</div>${S.fill == 'amount' ? slr('amount', 'Onload', [500, 20000, 500], S.amount, fmt(S.amount) + ' lb') : ''}${slr('gap', 'Tanker ahead at the ARIP', GAP, S.gap, S.gap + ' NM')}<div class="wbtns"><button class="btn g" type="button" data-aroa${R ? '' : ' disabled'} title="On the Refuel steerpoint ${X.k + 1}: OA1 = the ${S.mode == 'anchor' ? 'anchor' : 'join point (ARCP)'}, OA2 = the ARIP, at the join altitude">Write OA1 / OA2 in the DTC</button></div>${why ? `<p class="wbad">${esc(why)}</p>` : ''}`;
  }
  const slr = (k, lab, r, v, txt) =>
    `<div class="slr"><label>${lab}</label><input type="range" min="${r[0]}" max="${r[1]}" step="${r[2]}" value="${v}" data-arsl="${k}"><em data-are="${k}">${txt}</em></div>`;
  function tiles() {
    const ab = R.from ? Math.round(R.gs || 0) : 0,
      on = FU ? fmt(FU.onload) + ' lb' : '--';
    return `<div class="wpt">${tile('ARCT', hm(R.arct), (S.mode == 'anchor' ? (R.shift ? (R.shift > 0 ? '+' : '−') + Math.round(Math.abs(R.shift) / 60000) + ' min to the plan · ' : 'on the plan · ') : '') + 'ARIP ' + hm(R.tip) + (ab ? ' · ' + ab + ' kt from STPT ' + X.k : ''))}${tile('Onload', on, FU ? (S.fill == 'full' ? 'to full' : S.fill == 'joker' ? 'to the Joker' : 'a fixed amount') + ' · ≈ ' + Math.ceil(FU.min) + ' min at the ' + (method() == 'probe' ? 'basket' : 'boom') : 'no aircraft data')}${tile('Join', flOf(joinAlt()), fmt(JOIN_BELOW) + ' ft below · ' + OVERTAKE + ' kt overtake, ' + S.gap + ' NM gap')}${tile('Fuel at the join', FU ? fmt(FU.fArct) + ' lb' : '--', FU ? 'after: ' + fmt(FU.after) + ' · need ' + fmt(FU.need) : '')}</div>`;
  }
  function tables() {
    const n = X.k + 1,
      ja = joinAlt(),
      tas = T.tas + OVERTAKE,
      f = v => (FU ? fmt(v) : '--'),
      gsK = R.gs ? Math.round(kcasOf(R.gs, ja)) + ' KCAS' : '--',
      nxt = timed(X.wps).find(p => p.n == n + 1),
      times = [
        ...(R.from
          ? [
              [
                'Push · STPT ' + (n - 1),
                hm(R.from.t),
                '0',
                fmt(Math.round((X.wps[n - 2].z || 0) * 10)),
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
          Math.round(kcasOf(tas, ja)) + ' KCAS',
          f(FU && FU.fArip),
        ],
        [
          'Join · ARCP' + (S.mode == 'enr' ? ' · OA1' : ''),
          hm(R.arct),
          FU ? Math.round(FU.d2) : '--',
          fmt(ja),
          T.kcas + ' KCAS',
          f(FU && FU.fArct),
        ],
        ['Done', hm(done()), '—', fmt(T.alt), T.kcas + ' KCAS', f(FU && FU.after)],
        ['Tanker off station', hm(T.t1), '—', '', '', ''],
        ...(nxt
          ? [
              [
                'Next · STPT ' + (n + 1),
                hm(nxt.arr) + (done() > nxt.arr ? ' <span class="wbad">late</span>' : ''),
                '',
                '',
                '',
                '',
              ],
            ]
          : []),
      ],
      proc = procedure(method(), (sopOf('obs') || {}).o).map(r => [r[0], esc(r[1])]),
      W = warns();
    return `${W.length ? `<div class="wcard"><h3>Checks</h3>${W.map(([t, red]) => `<div class="${red ? 'wbad' : 'hint'}">${esc(t)}</div>`).join('')}</div>` : ''}<div class="wcard"><h3>Times<span class="wtip" title="Rear aspect: you join from behind, inside the 2-10 line of the tanker. The gap closes at ${OVERTAKE} kt to 10,000 ft, then 10 kt per 1,000 ft, 10 kt inside 1,000 ft. Fuel: the fuel plan of the Performance page to the steerpoint before, then its burn per NM (≈). Transfer ≈ ${RATE} lb a minute (an estimate).">ⓘ</span></h3>${tbl(['Point', 'Time', 'nm', 'Alt (ft)', 'Speed', 'Fuel (lb)'], times)}</div><div class="wcard"><h3>Procedure · ${method() == 'probe' ? 'PROBE' : 'BOOM'}<span class="wtip" title="BMS Training Manual 4.38 (mission 4D) and the Comms &amp; Nav Book: the calls by their names, as each pilot sends them his own way.">ⓘ</span></h3>${tbl(['When', 'What'], proc, 2)}<p class="hint wnote">Calls to the tanker: ${CALLS.tanker.map(esc).join(' · ')}. To the AWACS: ${CALLS.awacs.map(esc).join(' · ')}.</p></div>`;
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
    c.innerHTML = `<div id="aartl"></div><div class="wcard" id="aarmc"><div class="wh"><h3 id="aarmh">Map</h3><span style="flex:1"></span><button class="btn g" type="button" data-arfit>Fit view</button></div><div id="aarmap" class="wmapbox"></div><div class="wleg" id="aarleg"></div></div><div id="aartb"></div>`;
    r.innerHTML = `<div class="wcard"><h3>Smart card<span class="wtip" title="Add card (top right) puts it on the Kneeboard, with the classic card">ⓘ</span></h3><canvas class="aarpv" width="520" height="780" aria-label="The Smart AAR card"></canvas></div>`;
    wire(root);
    update();
  }
  /** the numbers again: the left card, the tiles, the tables, the preview, the map */
  function update() {
    if (!host || !host.isConnected) return;
    compute();
    const q = s => host.querySelector(s),
      l = q('#aarl');
    if (l) l.innerHTML = leftIn();
    const ok = !!(X && X.ok && R),
      mc = q('#aarmc');
    if (mc) mc.hidden = !ok;
    if (!ok) {
      if (q('#aartl')) q('#aartl').innerHTML = '';
      if (q('#aartb')) q('#aartb').innerHTML = '';
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
    q('#aartb').innerHTML = tables();
    q('#aarmh').textContent = 'Map · STPT ' + (X.k + 1) + ' Refuel · ' + tk().name;
    const it = (c, t, dash) =>
      `<span><i style="border-top:2px ${dash ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    q('#aarleg').innerHTML = [
      it(COL.trk, 'TRACK (turns left: assumed)', true),
      it(COL.me, 'YOU: STPT ' + X.k + ' > ARIP > JOIN'),
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
        set(k, k == 'tk' ? +b.dataset.v : b.dataset.v);
        update();
      }
      if (t.closest('[data-aroa]')) writeOA();
      if (t.closest('[data-arfit]') && M) {
        fit = true;
        paint();
      }
    };
    root.oninput = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (!i.dataset || !i.dataset.arsl || !X || !X.ok) return;
      const k = i.dataset.arsl;
      set(k, +i.value);
      const em = l() && l().querySelector(`[data-are="${k}"]`);
      if (em) em.textContent = k == 'gap' ? i.value + ' NM' : fmt(+i.value) + ' lb';
    };
    root.onchange = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (i.dataset && i.dataset.arsl) update();
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
    const n = X.k + 1,
      at = R.at;
    if (n > 24) return deps.toast('OA1 / OA2: the Refuel steerpoint ' + n + ' is beyond the 24 of the DTC.', true);
    if (deps.dtc.open && !deps.dtc.open()) return deps.toast('No DTC: open one first.', true);
    if (!deps.dtc.has('NAV OFFSETS')) return deps.toast('This DTC has no NAV OFFSETS section.', true);
    const p1 = S.mode == 'anchor' ? T.a : R.arcp,
      o1 = offset(at, p1),
      o2 = offset(at, R.arip),
      el = joinAlt(),
      txt = o => o.brg + '°, ' + o.nm.toFixed(1) + ' nm, ' + el + ' ft';
    if (
      !(await deps.confirm(
        `Write on STPT ${n} (Refuel):\n\nOA1-${n} = ${S.mode == 'anchor' ? 'the anchor' : 'the join (ARCP)'}: ${txt(o1)}\nOA2-${n} = the ARIP: ${txt(o2)}`
      ))
    )
      return;
    deps.dtc.setOA('OA1-' + n, [o1.brg, o1.rngFt, el].join(','));
    deps.dtc.setOA('OA2-' + n, [o2.brg, o2.rngFt, el].join(','));
    deps.toast('OA1 and OA2 of STPT ' + n + ' written to the DTC.');
  }

  // ---- the cards
  function smartData() {
    const t = tk(),
      m = method(),
      ja = joinAlt(),
      W = warns(),
      jb = FU && FU.jb,
      sop = (X.sop || []).map(s => (s.id == 'rv' ? 'RV ' + s.txt : s.txt));
    return {
      title: 'AAR · ' + (m == 'probe' ? 'PROBE' : 'BOOM'),
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
      plan: toInk(spec()),
      legend:
        'LEGS ' +
        Math.round(T.leg) +
        'NM · ' +
        T.kcas +
        'KCAS · ' +
        flOf(T.alt) +
        ' · TURNS LEFT (ASSUMED) · ' +
        (S.mode == 'anchor' ? 'ANCHOR' : 'EN ROUTE'),
      blocks: [
        ...(W.some(w => w[1]) ? [['CHECK', W.filter(w => w[1]).map(w => [w[0].toUpperCase(), true])]] : []),
        [
          'TIMES',
          [
            ...(R.from ? ['PUSH STPT ' + X.k + ' ' + hm(R.from.t)] : []),
            'ARIP ' + hm(R.tip) + ' · ARCT ' + hm(R.arct),
            'DONE ' + hm(done()) + ' · OFF STATION ' + hm(T.t1),
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
            'GAP ' + S.gap + 'NM · OVERTAKE ' + OVERTAKE + 'KT',
            '10KT/1000FT · 10KT INSIDE 1000FT',
          ],
        ],
        [
          m == 'probe' ? 'PROBE' : 'BOOM',
          m == 'probe'
            ? ['EMITTERS SAFE · ARM SAFE', 'PROBE OUT AT 5NM', 'STABLE BEHIND THE BASKET']
            : ['EMITTERS SAFE · ARM SAFE', 'AR DOOR 5NM (400/.85)', 'PRE-CONTACT 50FT · 30° DOWN'],
        ],
        ['CALLS', ['REQUEST FLIGHT REFUELING', 'DONE · TERMINATE FLIGHT REFUEL', 'AWACS: VECTOR TO TANKER']],
      ],
      sop,
    };
  }
  function classicData() {
    const t = tk(),
      m = method(),
      jb = FU && FU.jb,
      n = X.k + 1;
    return {
      head: 'AAR · ' + (m == 'probe' ? 'PROBE' : 'BOOM') + ' · ' + (S.mode == 'anchor' ? 'ANCHOR' : 'EN ROUTE'),
      rowsHead: 'TANKER · TIMES · FUEL',
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      sub: 'TANKER ' + t.name + ' · ' + t.type + ' · STPT ' + n + ' REFUEL',
      box: [
        ['ARCT', hm(R.arct), 'ARIP ' + hm(R.tip) + ' · done ' + hm(done())],
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
        ['JOIN', flOf(joinAlt()), fmt(JOIN_BELOW) + ' ft below · gap ' + S.gap + ' NM'],
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
        ['ARIP · OA2', hm(R.tip)],
        ['JOIN · ARCP', hm(R.arct) + (S.mode == 'enr' ? ' · OA1' : '')],
        ['ANCHOR', S.mode == 'anchor' ? 'OA1' : 'track point 1'],
        ['FUEL AT JOIN', FU ? fmt(FU.fArct) + ' lb' : '--', !!(FU && FU.fArct < 1000)],
        ['AFTER / NEED', FU ? fmt(FU.after) + ' / ' + fmt(FU.need) + ' lb' : '--', !!(FU && FU.short)],
        ['SOP', (X.sop || []).map(s => s.txt).join(' · ') || 'none chosen'],
      ],
      calls: [
        ...procedure(m, (sopOf('obs') || {}).o)
          .slice(2, 7)
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
      pts = [...racetrack(T), R.arip, R.arcp, ...(R.from ? [R.from] : [])],
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
