// @ts-check
// A-G > TASMO: the attack of a ship by the flight chosen (core/tasmo.js). The page as the DEAD page (core/deadpage.js): the target (the ship, its group, spotted
// or not: the area of uncertainty), the weapon of the load (an anti-ship missile and its options; with a Maverick or bombs the attack is planned on A-G >
// Pop-up), the altitudes, the map or the profile, the steps; the shot, the nav offsets (OA1 the launch, OA2 the radar acquisition or the descent, from
// the steerpoint of the route nearest to the ship) and the ship as the Harpoon steerpoint 90 in the DTC, the checks. The cards: Smart TASMO and the
// classic card with the map. Display > TASMO on the Map page. One list of shapes for the map and the cards (core/aakit.js).
// deps: {esc, toast, confirm, ctx() -> X, mis() -> Promise<Misdata table | null>, toLL, attach, detach, snap, kbAdd, openMode(mode, {x, y}), cyclePlan, planMode,
//   dtc {open(), has(sec), setOA(key, v), setTarget(key, t)}}
// X: {ok, why, me {key, name, n, ac, pkgNo, tag}, wps, task {n, x, y, t0}, ships [{id, x, y, name, cat, rng, low, det, detAir, spotted, boat, d, grp}],
//   weapons [{id, name, n, rngKm, kind: 'asm' | 'mav' | 'bomb'}], radar (NM), target (ship id)}
import {
  tasmoPlan,
  defaultDist,
  tasmoSteps,
  horizonNm,
  altForHorizon,
  misKey,
  missileKt,
  isHarpoon,
  KM_NM,
  MANPADS_FT,
  LOW_FT,
} from './tasmo.js';
import { rmax } from '../bmsdata/missiledata.js';
import { timed } from './sead.js';
import { mapKeep } from './mapkeep.js';
import { SC_W, SC_H } from './smartcard.js';
import { drawSmartAar } from './smartaar.js';
import { drawAACard, aaBox, AAC_W, AAC_H } from './aacard.js';
import { busyRun } from './busy.js';
import { drawLeaflet, toPx, toInk, snapMap, addCards, allOf } from './aakit.js';

const COL = {
  sam: '#e5484d',
  hor: '#f0b040',
  me: '#3ddc84',
  msl: '#ffd166',
  acq: '#b07cff',
  unc: '#c9d1d9',
  ship: '#ff6b6b',
};
const KINDS = [
  ['smart', 'Smart TASMO'],
  ['map', 'With the map'],
];
const FT_NM = 6076.12,
  PFL = ['Map filters', 'No filters', 'Plan', 'Plan + PPT']; // the button of the filters of the map (as DEAD)
const fmt = v => (v == null || !isFinite(v) ? '--' : Math.round(v).toLocaleString('en-US'));
const hm = t => {
  const m = Math.floor((t || 0) / 60000);
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
const h3 = d => String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, '0');
const brg = (a, b) => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
const nmOf = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / KM_NM;

export function createTasmoPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'wptasmo';
  let st = { f: {}, view: 'map' },
    X = null,
    S = null, // the choices for the flight
    ship = null,
    W = null, // the weapon
    G = null, // the geometry: {from, near, cruise, gs, tot, rmax, src}
    P = null, // the plan (an anti-ship missile)
    MIS = undefined,
    M = null,
    pend = null,
    failed = false,
    fit = true,
    fitKey = '',
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('tasmo1') || 'null');
    if (o && typeof o == 'object' && o.f) st = { ...st, ...o };
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem('tasmo1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const loadMis = () => {
    if (MIS !== undefined || !deps.mis) return;
    MIS = null;
    Promise.resolve(deps.mis())
      .then(t => {
        MIS = t || null;
        if (shown) update();
      })
      .catch(() => {});
  };

  // ---- the numbers
  function compute() {
    X = deps.ctx();
    P = G = W = ship = null;
    if (!X || !X.ok) return;
    const raw = st.f[X.me.key] || {};
    ship = X.ships.find(s => s.id == raw.ship) || X.ships.find(s => s.id == X.target) || X.ships[0] || null;
    W =
      X.weapons.find(w => w.id == raw.wpn) ||
      X.weapons.find(w => w.kind == 'asm') ||
      X.weapons.find(w => w.kind == 'mav') ||
      X.weapons[0] ||
      null;
    if (!ship) return;
    const w = timed(X.wps),
      at = w.find(p => p.n == X.task.n) || w[w.length - 1],
      prev = w.find(p => p.n == X.task.n - 1) || w[0],
      cruise = Math.round((prev.z || at.z || 0) * 10) || 20000,
      legNm = nmOf(prev, at),
      legH = (at.arr - (prev.dep > prev.arr ? prev.dep : prev.arr)) / 3600000,
      gs = legH > 0 ? Math.max(250, Math.min(700, legNm / legH)) : 480,
      // the steerpoint of the route nearest to the ship (not the take-off nor the landing): the OAs and their numbers
      near = w
        .filter(p => p.act != 1 && p.act != 7 && p.n <= 24)
        .reduce((a, p) => (!a || nmOf(p, ship) < nmOf(a, ship) ? p : a), null);
    G = { from: prev, at, near, cruise, gs, tot: at.arr };
    S = {
      alt: Math.max(200, Math.min(40000, +raw.alt || 500)),
      dist: +raw.dist || 0,
      n: Math.max(1, Math.min(4, +raw.n || 2)),
      mode: raw.mode || '',
      area: raw.area || 'LARGE',
      prio: raw.prio || 'NORM',
      fly: raw.fly || 'LOW',
      term: raw.term || 'POP',
    };
    if (!W || W.kind != 'asm') return;
    // the range: the Misdata of the missile at the launch altitude (else the range of the campaign)
    const m = MIS && MIS[misKey(W.name)],
      r = m && m.range ? rmax(m, S.alt, gs * 1.68781, 0) : null;
    G.rmax = r ? r / FT_NM : W.rngKm / KM_NM;
    G.src = r ? 'Misdata' : 'the campaign';
    if (!S.dist) S.dist = defaultDist(ship, S.alt, G.rmax);
    P = tasmoPlan({
      ship,
      from: prev,
      cruise,
      alt: S.alt,
      dist: S.dist,
      rmax: G.rmax,
      radar: X.radar,
      tot: at.arr,
      gs,
      mslKt: missileKt(W.name),
      n: S.n,
    });
    if (!S.mode) S.mode = P.mode;
  }
  const set = (k, v) => {
    st.f[X.me.key] = { ...(st.f[X.me.key] || {}), ship: ship && ship.id, wpn: W && W.id, ...S, [k]: v };
    if (k == 'ship' || k == 'wpn') {
      st.f[X.me.key].dist = 0; // the distance again for the ship or the missile
      st.f[X.me.key].mode = '';
    }
    if (k == 'alt') st.f[X.me.key].dist = 0;
    save();
  };
  const hpn = () => !!W && isHarpoon(W.name);
  const grp = () => X.ships.filter(s => s !== ship && nmOf(s, ship) <= 10);
  const threats = () => X.ships.filter(s => s.rng > 0 && !s.boat && (s === ship || nmOf(s, ship) <= 60));
  const boats = () => X.ships.filter(s => s.boat && s !== ship && nmOf(s, ship) <= 80);
  // all the checks: the plan, the patrol boats near the way in
  function checks() {
    const C = P ? [...P.warn] : [];
    if (W && W.kind != 'asm')
      C.push([W.name + ': the attack is planned in A-G > Pop-up or HADB (the ship as the target).', false]);
    if (!W) C.push(['No anti-ship weapon, Maverick or bomb in the load of the flight.', true]);
    const way = P ? [G.from, P.desc || P.launch, P.launch] : [G.from, ship];
    boats().forEach(b => {
      const d = Math.min(...way.slice(1).map((p, i) => segNm(way[i], p, b)));
      if (d < b.low / KM_NM + 3 && (P ? S.alt : G.cruise) < MANPADS_FT)
        C.push([
          b.name +
            ' (MANPADS ' +
            (b.low / KM_NM).toFixed(0) +
            ' NM) ' +
            d.toFixed(0) +
            ' NM from your way in: keep above ' +
            fmt(MANPADS_FT) +
            ' ft or away.',
          false,
        ]);
    });
    return C;
  }
  const segNm = (a, b, p) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = dx * dx + dy * dy,
      k = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    return Math.hypot(a.x + dx * k - p.x, a.y + dy * k - p.y) / KM_NM;
  };

  // ---- the shapes (the map, the classic card, the Smart card)
  function spec() {
    const lab = (p, text, col, ink) => ({ t: 'label', p, text, col, ink: ink || false }),
      U = ship.spotted ? 3 : 40,
      O = [];
    threats().forEach(s => {
      O.push({ t: 'ring', c: s, r: s.rng, col: COL.sam, w: 2, ink: { red: true, w: 1.5, dash: [] } });
      if (s.low > 0 && s.low < s.rng)
        O.push({ t: 'ring', c: s, r: s.low, col: COL.sam, w: 1.5, dash: [6, 5], ink: { red: true, dash: [3, 3] } });
    });
    boats().forEach(b =>
      O.push({ t: 'ring', c: b, r: b.low, col: COL.sam, w: 1.2, dash: [3, 4], ink: { red: true, dash: [2, 3] } })
    );
    O.push({ t: 'ring', c: ship, r: U * KM_NM, col: COL.unc, w: 1.5, dash: [3, 3], ink: { dash: [2, 3] } });
    if (P)
      O.push({
        t: 'ring',
        c: ship,
        r: horizonNm(S.alt) * KM_NM,
        col: COL.hor,
        w: 1.5,
        dash: [8, 6],
        ink: { dash: [5, 4] },
      });
    X.ships
      .filter(s => s === ship || nmOf(s, ship) <= 60)
      .forEach(s =>
        O.push({
          t: 'dot',
          p: s,
          col: s === ship ? COL.ship : COL.sam,
          k: 'tri',
          ink: s === ship ? { label: s.name.toUpperCase(), bold: true } : {},
        })
      );
    O.push(
      lab(ship, ship.name + (ship.spotted ? ' · spotted ±3 NM' : ' · NOT SPOTTED ±40 NM') + ' · HPN STPT 90', COL.ship)
    );
    if (!P) {
      O.push({ t: 'poly', pts: [G.from, ship], col: COL.me, w: 2, dash: [6, 6], ink: { dash: [4, 3] } });
      return O;
    }
    const path = [G.from, ...(P.desc ? [P.desc] : []), P.launch];
    O.push({ t: 'poly', pts: path, col: COL.me, w: 2.5, fit: false, ink: { w: 2 } });
    O.push({ t: 'poly', pts: [P.desc || P.launch, P.launch], col: COL.me, w: 2.5, ink: { w: 2 } });
    O.push({ t: 'poly', pts: [P.launch, ship], col: COL.msl, w: 2, dash: [7, 5], ink: { dash: [5, 3] } });
    O.push({
      t: 'dot',
      p: P.launch,
      col: COL.me,
      k: 'dot',
      ink: { label: 'LAUNCH ' + S.dist + 'NM ' + hm(P.tLaunch), bold: true },
    });
    O.push(lab(P.launch, 'LAUNCH · OA1 · ' + S.dist + ' NM · ' + hm(P.tLaunch), COL.me));
    if (P.desc) {
      O.push({ t: 'dot', p: P.desc, col: COL.me, k: 'sq', ink: { label: 'DESCEND ' + hm(P.tDesc) } });
      O.push(lab(P.desc, 'DESCEND' + (oa2Acq() ? '' : ' · OA2') + ' · ' + hm(P.tDesc), COL.me));
    }
    if (P.acq) {
      O.push({ t: 'dot', p: P.acq, col: COL.acq, k: 'dot', ink: { label: 'RADAR ' + P.acq.nm.toFixed(0) + 'NM' } });
      O.push(
        lab(P.acq, 'RADAR ACQUISITION' + (oa2Acq() ? ' · OA2' : '') + ' · ≈' + P.acq.nm.toFixed(0) + ' NM', COL.acq)
      );
    }
    return O;
  }
  const layers = (L, map, WL) => drawLeaflet(L, map._tsR, WL, deps.toLL, spec(), esc);

  // ---- the profile: the altitude against the distance to the ship
  function profile() {
    const w = 640,
      h = 230,
      Dm = Math.ceil(Math.max(P.desc ? P.desc.nm : 0, P.acq ? P.acq.nm : 0, S.dist, P.ring) / 10) * 10 + 10,
      Am = Math.max(G.cruise, S.alt, 5000) * 1.15,
      x = d => 40 + (1 - d / Dm) * (w - 60),
      y = a => h - 24 - (a / Am) * (h - 40),
      hor = Array.from({ length: 41 }, (_, i) => (i / 40) * Dm)
        .map(d => `${x(d).toFixed(1)},${y(Math.min(Am, altForHorizon(d))).toFixed(1)}`)
        .join(' '),
      det = Math.min(Dm, (ship.detAir || ship.det || 0) / KM_NM),
      // where the ship sees you: above the horizon, inside its detection range
      seen = Array.from({ length: 41 }, (_, i) => (i / 40) * det)
        .map(d => `${x(d).toFixed(1)},${y(Math.min(Am, altForHorizon(d))).toFixed(1)}`)
        .join(' '),
      me = [
        [Dm, G.cruise],
        ...(P.desc
          ? [
              [P.desc.nm, G.cruise],
              [Math.max(S.dist, P.desc.nm - 8), S.alt],
            ]
          : [[S.dist, S.alt]]),
        [S.dist, S.alt],
      ]
        .map(([d, a]) => `${x(d).toFixed(1)},${y(a).toFixed(1)}`)
        .join(' '),
      tick = Array.from({ length: Dm / 10 + 1 }, (_, i) => i * 10),
      t = (X0, Y0, s, c, a = 'middle') =>
        `<text x="${X0}" y="${Y0}" fill="${c}" font-size="11" text-anchor="${a}">${esc(s)}</text>`;
    return `<svg viewBox="0 0 ${w} ${h}" class="tsprof" role="img" aria-label="The profile of the attack">
      <rect x="40" y="16" width="${w - 60}" height="${h - 40}" fill="#0f1720"/>
      <polygon points="${x(0)},${y(Am)} ${seen} ${x(det)},${y(Am)}" fill="#f0b04022"/>
      <polyline points="${hor}" fill="none" stroke="${COL.hor}" stroke-width="1.5" stroke-dasharray="6 5"/>
      <rect x="${x(Math.min(Dm, P.U))}" y="16" width="${x(0) - x(Math.min(Dm, P.U))}" height="${h - 40}" fill="#c9d1d914"/>
      <line x1="${x(P.ring)}" y1="16" x2="${x(P.ring)}" y2="${h - 24}" stroke="${COL.sam}" stroke-width="2"/>
      ${t(x(P.ring) + 4, 28, 'SAM ' + P.ring.toFixed(0) + ' NM' + (P.ringLow ? ' (low)' : ''), COL.sam, 'start')}
      <polyline points="${me}" fill="none" stroke="${COL.me}" stroke-width="2.5"/>
      <line x1="${x(S.dist)}" y1="${y(S.alt)}" x2="${x(0)}" y2="${y(50)}" stroke="${COL.msl}" stroke-width="2" stroke-dasharray="7 5"/>
      <circle cx="${x(S.dist)}" cy="${y(S.alt)}" r="5" fill="${COL.me}" stroke="#fff"/>
      ${t(x(S.dist), y(S.alt) - 10, 'LAUNCH ' + S.dist + ' NM', COL.me)}
      ${P.acq ? `<circle cx="${x(P.acq.nm)}" cy="${y(P.acq.alt)}" r="4" fill="${COL.acq}"/>${t(x(P.acq.nm), y(P.acq.alt) - 9, 'RADAR ≈' + P.acq.nm.toFixed(0), COL.acq)}` : ''}
      ${t(x(Dm) + 4, 30, 'THE SHIP SEES YOU ABOVE THE HORIZON (' + det.toFixed(0) + ' NM)', COL.hor, 'start')}
      ${tick.map(d => `<line x1="${x(d)}" y1="${h - 24}" x2="${x(d)}" y2="${h - 20}" stroke="#8b98a8"/>${t(x(d), h - 8, String(d), '#8b98a8')}`).join('')}
      ${t(x(0) - 4, h - 30, 'SHIP ±' + P.U, COL.unc, 'end')}
      ${t(8, y(G.cruise) + 4, fmt(G.cruise / 1000) + 'K', '#8b98a8', 'start')}${t(8, y(S.alt) + 4, fmt(S.alt), '#8b98a8', 'start')}
    </svg>`;
  }

  // ---- the page
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  const seg = (k, opts, c) =>
    `<span class="seg tsseg">${opts.map(([v, l, t]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-tsset="${k}" data-v="${v}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</span>`;
  const row = (l, c) => `<div class="tsrow"><label>${l}</label>${c}</div>`;
  const slr = (k, lab, r, v, txt, bad) =>
    `<div class="slr${bad ? ' bad' : ''}"><label>${lab}</label><input type="range" min="${r[0]}" max="${r[1]}" step="${r[2]}" value="${v}" data-tssl="${k}"><em data-tse="${k}">${txt}</em></div>`;
  function build() {
    if (!X || !X.ok || !ship) {
      root.innerHTML = `<div class="wcard sdnone fx"><h3>TASMO</h3><p class="hint">${esc(X && !X.ok ? X.why : 'No enemy ship near the task of the flight.')}</p></div>`;
      return;
    }
    root.innerHTML = `<div class="wpg sdg dg ts"><div class="wpl sdl"><div class="wcard" id="tstg"></div><div class="wcard" id="tswp"></div><div class="wcard" id="tsal"></div></div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3 id="tsph">${st.view == 'map' ? 'Horizontal plan' : 'Profile'}</h3><span class="seg sdvw">${[
        ['map', 'Map'],
        ['prof', 'Profile'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.view == v ? 'on' : ''}" data-tsview="${v}">${l}</button>`)
        .join(
          ''
        )}</span><span style="flex:1"></span><button class="btn g" type="button" data-tsfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-tspf>Map filters</button></div>
      <div id="tsmapw"${st.view == 'map' ? '' : ' hidden'}><div id="tsmap" class="wmapbox"></div><div class="wleg" id="tsleg"></div></div><div id="tsprof"${st.view == 'prof' ? '' : ' hidden'}></div></div><div class="wcard" id="tsstp"></div></div>
      <div class="wpr"><div class="wcard" id="tssh"></div><div class="wcard" id="tsoa"></div><div id="tswn"></div></div></div>`;
    wire();
  }
  function update() {
    if (!shown) return;
    compute();
    if (!root.querySelector('.ts') || !X || !X.ok || !ship) {
      build();
      if (!X || !X.ok || !ship) return detachMap(true);
      const pf = root.querySelector('[data-tspf]');
      if (pf) pf.textContent = PFL[deps.planMode ? deps.planMode() : 0];
    }
    const q = s => /** @type {HTMLElement} */ (root.querySelector(s));
    const fk = X.me.key + ':' + ship.id;
    if (fk != fitKey) {
      fitKey = fk;
      fit = true;
    }
    q('#tstg').innerHTML = target();
    q('#tswp').innerHTML = weapon();
    q('#tsal').innerHTML = alts();
    q('#tsstp').innerHTML = stepsHtml();
    q('#tssh').innerHTML = shot();
    q('#tsoa').innerHTML = oaHtml();
    q('#tswn').innerHTML = checks()
      .map(
        ([t, red]) =>
          `<div class="wcard${red ? ' sdpb' : ''}"><h3>Check</h3><p class="${red ? 'wbad' : 'hint'}">${esc(t)}</p></div>`
      )
      .join('');
    q('#tsprof').innerHTML = P ? profile() : '<p class="hint">The profile needs an anti-ship missile.</p>';
    q('#tsleg').innerHTML = legend();
    paint();
  }
  function target() {
    const g = grp(),
      U = ship.spotted ? 3 : 40;
    return `<div class="wh"><h3>Target</h3><span style="flex:1"></span><select data-tsship aria-label="Ship">${X.ships
      .map(
        s =>
          `<option value="${esc(s.id)}"${s === ship ? ' selected' : ''}>${esc(s.name)} · ${s.d.toFixed(0)} NM${s.spotted ? '' : ' · not spotted'}</option>`
      )
      .join(
        ''
      )}</select></div><div class="kv">${kv('GROUP', g.length ? esc(ship.name) + ' + ' + g.length + ' (within 10 NM)' : 'alone')}${kv('SAM', ship.rng > 0 ? (ship.rng / KM_NM).toFixed(0) + ' NM (' + ship.rng + ' km)' + (ship.low > 0 ? ' · low ' + (ship.low / KM_NM).toFixed(0) + ' NM' : '') : ship.boat ? 'MANPADS ' + (ship.low / KM_NM).toFixed(0) + ' NM under ' + fmt(MANPADS_FT) + ' ft' : 'none', ship.rng > 0 ? 'wbad' : '')}${kv('RADAR', ship.detAir || ship.det ? 'detects at ' + ((ship.detAir || ship.det) / KM_NM).toFixed(0) + ' NM' + (ship.det ? ' (low ' + (ship.det / KM_NM).toFixed(0) + ')' : '') : '--')}${kv('POSITION', ship.spotted ? 'spotted · ±' + U + ' NM' : 'NOT SPOTTED · ±' + U + ' NM', ship.spotted ? '' : 'wbad')}</div><p class="hint wnote">The fog of war: the ship can be anywhere in its area. A spotted ship ±3 NM, a ship not spotted ±40 NM.</p>`;
  }
  function weapon() {
    const sel = `<select data-tswpn aria-label="Weapon">${X.weapons
      .map(
        w =>
          `<option value="${esc(String(w.id))}"${w === W ? ' selected' : ''}>${esc(w.name)} ×${w.n}${w.kind == 'asm' ? '' : w.kind == 'mav' ? ' · Maverick' : ' · bomb'}</option>`
      )
      .join('')}</select>`;
    if (!W)
      return `<h3>Weapon</h3><p class="wbad">No anti-ship weapon, Maverick or bomb in the load of ${esc(X.me.name)}.</p>`;
    if (W.kind != 'asm')
      return `<div class="wh"><h3>Weapon</h3><span style="flex:1"></span>${sel}</div><p class="hint">${esc(W.name)}: the attack is planned in A-G > Pop-up or HADB, the ship as the target (sea level). This page keeps the ship, its rings, its radar horizon and the times.</p><div class="ddbtns"><button class="btn" type="button" data-tspop>Attack in A-G &gt; Pop-up</button><button class="btn g" type="button" data-tshadb>HADB</button></div>`;
    const h = hpn();
    return `<div class="wh"><h3>Weapon</h3><span style="flex:1"></span>${sel}</div><div class="kv">${kv('RANGE', G.rmax.toFixed(0) + ' NM at ' + fmt(S.alt) + ' ft (' + esc(G.src) + ')')}${kv('SPEED', '≈ ' + missileKt(W.name) + ' kt')}</div>${
      h
        ? row(
            'Mode',
            seg(
              'mode',
              [
                ['rbl', 'RBL', 'Range and bearing: on the position of the ship (STPT 90 or the SPI)'],
                ['bol', 'BOL', 'Bearing only: the seeker on at the enable range, no search area'],
                ['los', 'LOS', 'Line of sight'],
              ],
              S.mode
            )
          ) +
          (S.mode == 'rbl'
            ? row(
                'Search area',
                seg(
                  'area',
                  [
                    ['LARGE', 'LARGE', 'Grows with the range: the default'],
                    ['MED', 'MED'],
                    ['SMALL', 'SMALL'],
                  ],
                  S.area
                )
              ) +
              row(
                'Priority',
                seg(
                  'prio',
                  ['NORM', 'NEAR', 'FAR', 'LEFT', 'RIGHT'].map(v => [v, v]),
                  S.prio
                )
              )
            : '') +
          row(
            'Fly-out',
            seg(
              'fly',
              [
                ['LOW', 'LOW'],
                ['HIGH', 'HIGH', 'High to 10 NM, the waypoint or the enable range'],
              ],
              S.fly
            )
          ) +
          row(
            'Terminal',
            seg(
              'term',
              [
                ['POP', 'POP'],
                ['SKIM', 'SKIM'],
              ],
              S.term
            )
          )
        : ''
    }${row(
      'Missiles',
      seg(
        'n',
        [1, 2, 4].filter(v => v <= Math.max(1, W.n * X.me.n)).map(v => [v, String(v)]),
        S.n
      )
    )}`;
  }
  function alts() {
    if (!P)
      return `<h3>Altitude · speed</h3><div class="kv">${kv('CRUISE', fmt(G.cruise) + ' ft · ' + Math.round(G.gs) + ' kt')}${kv('RADAR HORIZON', horizonNm(G.cruise).toFixed(0) + ' NM at the cruise')}</div>`;
    return `<h3>Altitude · speed</h3>${slr('alt', 'Launch altitude', [200, 35000, 100], S.alt, fmt(S.alt) + ' ft')}${slr('dist', 'Launch distance', [5, Math.max(10, Math.ceil(G.rmax + 10)), 1], S.dist, S.dist + ' NM', P.reach < 0 || P.margin < 0)}<div class="kv">${kv('CRUISE', fmt(G.cruise) + ' ft · ' + Math.round(G.gs) + ' kt')}${kv('RADAR HORIZON', horizonNm(S.alt).toFixed(0) + ' NM at ' + fmt(S.alt) + ' ft · ' + horizonNm(G.cruise).toFixed(0) + ' at the cruise')}${S.alt < LOW_FT ? kv('UNDER 5,000 FT', 'the low ring and the low detection of the ship') : ''}</div>`;
  }
  const launchTxt = () => S.dist + ' NM · ' + fmt(S.alt) + ' ft · heading ' + h3(brg(P.launch, ship));
  function stepsHtml() {
    if (!P)
      return `<h3>Steps</h3><p class="hint">With ${esc(W ? W.name : 'no weapon')} the steps are those of the attack page.</p>`;
    const T = {
        Descent: P.tDesc,
        Radar: P.tAcq,
        Launch: P.tLaunch,
        After: P.tLaunch + P.tof,
      },
      L = tasmoSteps(W.name, S, P, launchTxt());
    return `<h3>Steps · ${esc(W.name)}${hpn() ? ' · ' + S.mode.toUpperCase() : ''}<span class="wtip" title="TO 1F-16CMAM-34-1-1 BMS 4.2.6.1 (AGM-84)">ⓘ</span></h3><ol class="ddsteps">${L.map(([a, b]) => `<li><b>${T[a] ? hm(T[a]) + ' ' : ''}${esc(a)}</b> · ${esc(b)}</li>`).join('')}</ol>`;
  }
  function shot() {
    if (!P) return `<h3>Shot</h3><p class="hint">No anti-ship missile chosen.</p>`;
    return `<h3>Shot · ${S.n}× ${esc(W.name)}</h3><div class="kv">${kv('LAUNCH', hm(P.tLaunch) + ' · ' + launchTxt(), P.margin < 0 || P.reach < 0 ? 'wbad' : 'sdme')}${kv('RANGE', G.rmax.toFixed(0) + ' NM · ' + (P.reach >= 0 ? P.reach.toFixed(0) + ' NM to spare' : 'SHORT by ' + (-P.reach).toFixed(0) + ' NM'), P.reach < 0 ? 'wbad' : '')}${kv('FLIGHT TIME', '≈ ' + (P.tof / 60000).toFixed(1) + ' min')}${kv('IMPACT', hm(P.tLaunch + P.tof) + ' · the time of STPT ' + X.task.n)}${kv('SAM MARGIN', (P.margin >= 0 ? '+' : '−') + Math.abs(P.margin).toFixed(0) + ' NM ' + (P.margin >= 0 ? 'outside' : 'INSIDE') + ' the ' + (P.ringLow ? 'low ' : '') + 'ring', P.margin < 0 ? 'wbad' : 'sdok')}${kv('SEEN', P.hidden ? 'no: under the horizon (' + P.seen.toFixed(0) + ' NM)' : 'yes, from ' + P.seen.toFixed(0) + ' NM', P.hidden ? 'sdok' : 'sdw')}${hpn() && S.mode == 'bol' ? kv('BOL', 'enable ' + P.enable + ' NM · destruct ' + P.destruct + ' NM') : ''}${P.acq ? kv('RADAR', '≈ ' + P.acq.nm.toFixed(0) + ' NM at ' + fmt(P.acq.alt) + ' ft (the range of the radar of the aircraft, the horizon)') : ''}</div>`;
  }
  // the nav offsets from the steerpoint of the route nearest to the ship: OA1 the launch, OA2 the radar acquisition (not spotted) or the descent
  const oa2Acq = () => !!(P && P.acq && P.acq.nm > S.dist); // the radar acquisition before the launch: OA2 (else the descent)
  function oas() {
    if (!P || !G.near) return [];
    const o = [['OA1', 'Launch', P.launch, S.alt]],
      p2 = oa2Acq()
        ? ['OA2', 'Radar acquisition', P.acq, P.acq.alt]
        : P.desc
          ? ['OA2', 'Descent', P.desc, G.cruise]
          : null;
    if (p2) o.push(p2);
    return o.map(([k, l, p, el]) => ({
      k: k + '-' + G.near.n,
      l,
      brg: Math.round(((brg(G.near, p) % 360) + 360) % 360) || 360,
      rngFt: Math.round(nmOf(G.near, p) * FT_NM),
      nm: nmOf(G.near, p),
      el: Math.round(el),
    }));
  }
  function oaHtml() {
    const O = oas();
    return `<h3>Nav offsets · STPT ${G.near ? G.near.n : '--'}</h3>${O.length ? `<table class="oat"><tr><th>OA</th><th>Point</th><th>Bearing</th><th>Range</th><th>Elev</th></tr>${O.map(o => `<tr><td>${o.k}</td><td>${o.l}</td><td>${h3(o.brg)}° T</td><td>${o.nm.toFixed(1)} nm</td><td>${fmt(o.el)}</td></tr>`).join('')}</table>` : '<p class="hint">No point for an offset.</p>'}<div class="ddbtns"><button class="btn g" type="button" data-tsoa${O.length ? '' : ' disabled'}>Write OA1 / OA2</button><button class="btn g" type="button" data-tshpn title="The ship (the centre of its area) as the Harpoon target, steerpoint 90 of the DTC">Write HPN STPT 90</button></div>`;
  }
  function legend() {
    const it = (c, t, d) =>
      `<span><i style="border-top:2px ${d ? 'dashed' : 'solid'} ${c};width:18px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${t}</span>`;
    return [
      it(COL.sam, 'SAM'),
      it(COL.sam, 'LOW / MANPADS (patrol boats, under ' + fmt(MANPADS_FT) + ' ft)', true),
      it(COL.hor, 'RADAR HORIZON (launch altitude)', true),
      it(COL.unc, 'POSITION ±NM', true),
      it(COL.me, 'YOU'),
      it(COL.msl, 'MISSILE', true),
    ].join(' ');
  }
  function wire() {
    root.onclick = e => {
      const t = /** @type {HTMLElement} */ (e.target),
        b = /** @type {HTMLElement|null} */ (t.closest('[data-tsset]'));
      if (b && X && X.ok) {
        set(b.dataset.tsset, b.dataset.tsset == 'n' ? +b.dataset.v : b.dataset.v);
        update();
      }
      const v = /** @type {HTMLElement|null} */ (t.closest('[data-tsview]'));
      if (v) {
        st.view = v.dataset.tsview;
        save();
        root.querySelectorAll('[data-tsview]').forEach(x => x.classList.toggle('on', x === v));
        root.querySelector('#tsmapw').toggleAttribute('hidden', st.view != 'map');
        root.querySelector('#tsprof').toggleAttribute('hidden', st.view != 'prof');
        root.querySelector('#tsph').textContent = st.view == 'map' ? 'Horizontal plan' : 'Profile';
        if (st.view == 'map') paint();
      }
      const pf = /** @type {HTMLElement|null} */ (t.closest('[data-tspf]'));
      if (pf && deps.cyclePlan) {
        pf.textContent = PFL[deps.cyclePlan()];
        paint();
      }
      if (t.closest('[data-tsfit]') && M) {
        fit = true;
        paint();
      }
      if (t.closest('[data-tsoa]')) writeOA();
      if (t.closest('[data-tshpn]')) writeHpn();
      if (t.closest('[data-tspop]') && deps.openMode) deps.openMode('popup', ship);
      if (t.closest('[data-tshadb]') && deps.openMode) deps.openMode('hadb', ship);
    };
    root.onchange = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (i.dataset.tsship != null) set('ship', i.value);
      else if (i.dataset.tswpn != null) set('wpn', i.value);
      else if (i.dataset.tssl) set(i.dataset.tssl, +i.value);
      else return;
      update();
    };
    root.oninput = e => {
      const i = /** @type {HTMLInputElement} */ (e.target);
      if (!i.dataset || !i.dataset.tssl) return;
      const em = root.querySelector(`[data-tse="${i.dataset.tssl}"]`);
      if (em) em.textContent = i.dataset.tssl == 'alt' ? fmt(+i.value) + ' ft' : i.value + ' NM';
    };
  }

  // ---- the map
  const VK = mapKeep();
  async function ensureMap() {
    const box = root.querySelector('#tsmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._tsR) {
      o.map.createPane('tsP').style.zIndex = 470;
      o.map._tsR = o.L.canvas({ pane: 'tsP' });
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
    if (!X || !X.ok || !ship || st.view != 'map') return;
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

  // ---- the DTC
  async function writeOA() {
    const O = oas();
    if (!O.length) return;
    if (deps.dtc.open && !deps.dtc.open()) return deps.toast('No DTC: open one first.', true);
    if (!deps.dtc.has('NAV OFFSETS')) return deps.toast('This DTC has no NAV OFFSETS section.', true);
    if (
      !(await deps.confirm(
        'Write on STPT ' +
          G.near.n +
          ':\n\n' +
          O.map(
            o => o.k + ' = ' + o.l.toLowerCase() + ': ' + o.brg + '°, ' + o.nm.toFixed(1) + ' nm, ' + o.el + ' ft'
          ).join('\n')
      ))
    )
      return;
    O.forEach(o => deps.dtc.setOA(o.k, [o.brg, o.rngFt, o.el].join(',')));
    deps.toast(O.map(o => o.k).join(' and ') + ' written to the DTC.');
  }
  async function writeHpn() {
    if (deps.dtc.open && !deps.dtc.open()) return deps.toast('No DTC: open one first.', true);
    if (
      !(await deps.confirm(
        'Write ' +
          ship.name +
          ' (the centre of its area, ±' +
          (ship.spotted ? 3 : 40) +
          ' NM) as the Harpoon target, steerpoint 90?'
      ))
    )
      return;
    deps.dtc.setTarget('target_89', { n: ship.y * 3280.84, e: ship.x * 3280.84, elv: 0, name: ship.name });
    deps.toast(ship.name + ' written as STPT 90.');
  }

  // ---- the cards
  function smartData() {
    const w = W ? W.name : '--',
      red = checks().filter(c => c[1]);
    return {
      title: 'TASMO · ' + (P ? misKey(w) + (hpn() ? ' · ' + S.mode.toUpperCase() : '') : w.toUpperCase()),
      right: X.me.tag,
      key: [
        ['TARGET', ship.name.toUpperCase()],
        ['STPT', 'HPN 90'],
        ['LAUNCH', P ? S.dist + ' NM' : '--'],
        ['ALT', P ? fmt(S.alt) + ' FT' : '--'],
        ['TOT', hm(G.tot)],
        ['TOF', P ? (P.tof / 60000).toFixed(1) + ' MIN' : '--'],
        ['SAM', ship.rng > 0 ? (ship.rng / KM_NM).toFixed(0) + ' NM' : '--', true],
        ['POSITION', '±' + (ship.spotted ? 3 : 40) + ' NM', !ship.spotted],
      ],
      plan: toInk(spec()),
      legend:
        (ship.spotted ? 'SPOTTED' : 'NOT SPOTTED') +
        ' · RADAR HORIZON ' +
        horizonNm(P ? S.alt : G.cruise).toFixed(0) +
        'NM · STPT ' +
        (G.near ? G.near.n : '--'),
      blocks: [
        ...(red.length ? [['CHECK', red.map(r => [r[0].toUpperCase(), true])]] : []),
        [
          'TIMES',
          P
            ? [
                ...(P.tDesc ? ['DESCEND ' + hm(P.tDesc)] : []),
                ...(P.tAcq ? ['RADAR ' + hm(P.tAcq)] : []),
                'LAUNCH ' + hm(P.tLaunch) + ' · IMPACT ' + hm(P.tLaunch + P.tof),
              ]
            : ['TOT ' + hm(G.tot)],
        ],
        ...(P && hpn()
          ? [
              [
                'WPN',
                [
                  S.mode.toUpperCase() +
                    (S.mode == 'rbl' ? ' · ' + S.area + ' · ' + S.prio : ' · EN ' + P.enable + ' · DS ' + P.destruct),
                  S.fly + ' · ' + S.term + ' · ' + S.n + ' MSL',
                ],
              ],
            ]
          : []),
        [
          'PROFILE',
          P
            ? [
                (P.desc ? 'DESCEND ' + P.desc.nm.toFixed(0) + 'NM · ' : '') + fmt(S.alt) + 'FT',
                P.hidden ? 'UNDER THE HORIZON ' + P.seen.toFixed(0) + 'NM' : 'SEEN FROM ' + P.seen.toFixed(0) + 'NM',
              ]
            : ['ATTACK: A-G > POP-UP'],
        ],
        ...(P && P.acq ? [['RADAR', ['SEA ≈' + P.acq.nm.toFixed(0) + 'NM · AREA ±' + P.U + 'NM']]] : []),
        ['OA', oas().map(o => o.k + ' ' + o.l.toUpperCase() + ' ' + h3(o.brg) + '/' + o.nm.toFixed(0))],
      ],
      planTitle: 'PLAN',
      boxTitle: 'THREATS',
      sop: [
        ...threats().map(
          s =>
            s.name.toUpperCase() +
            ' SAM ' +
            (s.rng / KM_NM).toFixed(0) +
            'NM' +
            (s.low > 0 ? ' · LOW ' + (s.low / KM_NM).toFixed(0) + 'NM' : '')
        ),
        ...(boats().length
          ? [
              boats().length +
                ' PATROL BOATS · MANPADS ' +
                (boats()[0].low / KM_NM).toFixed(0) +
                'NM <' +
                MANPADS_FT / 1000 +
                'K',
            ]
          : []),
      ],
      empty: 'NO SAM NEAR THE SHIP',
    };
  }
  function classicData() {
    const O = oas();
    return {
      head: 'TASMO · ' + (W ? W.name : '--') + (P && hpn() ? ' · ' + S.mode.toUpperCase() : ''),
      rowsHead: 'SHIP · SHOT · OFFSETS',
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      sub: 'TARGET ' + ship.name + (ship.spotted ? ' · spotted' : ' · NOT SPOTTED') + ' · STPT ' + X.task.n,
      box: [
        ['LAUNCH', P ? hm(P.tLaunch) : '--', P ? S.dist + ' NM · ' + fmt(S.alt) + ' ft' : 'A-G > Pop-up'],
        ['IMPACT', P ? hm(P.tLaunch + P.tof) : hm(G.tot), P ? '≈ ' + (P.tof / 60000).toFixed(1) + ' min' : ''],
        [
          'HORIZON',
          horizonNm(P ? S.alt : G.cruise).toFixed(0) + ' NM',
          P ? (P.hidden ? 'hidden at the launch' : 'SEEN at the launch') : '',
        ],
        [
          'SAM',
          ship.rng > 0 ? (ship.rng / KM_NM).toFixed(0) + ' NM' : '--',
          P ? 'margin ' + P.margin.toFixed(0) + ' NM' : '',
          true,
        ],
      ],
      warn: checks()
        .filter(c => c[1])
        .map(c => c[0]),
      rows: [
        ['SHIP', ship.name + ' · ±' + (ship.spotted ? 3 : 40) + ' NM'],
        ['GROUP', grp().length ? grp().length + 1 + ' ships' : 'alone'],
        [
          'SAM',
          ship.rng > 0
            ? (ship.rng / KM_NM).toFixed(0) + ' NM' + (ship.low > 0 ? ' · low ' + (ship.low / KM_NM).toFixed(0) : '')
            : 'none',
          ship.rng > 0,
        ],
        ['WEAPON', W ? S.n + '× ' + W.name : '--'],
        ...(P && hpn()
          ? [
              [
                'WPN',
                S.mode.toUpperCase() +
                  (S.mode == 'rbl'
                    ? ' · ' + S.area + ' · ' + S.prio
                    : ' · enable ' + P.enable + ' · destruct ' + P.destruct) +
                  ' · ' +
                  S.fly +
                  ' · ' +
                  S.term,
              ],
            ]
          : []),
        ...(P && P.desc ? [['DESCEND', hm(P.tDesc) + ' · ' + P.desc.nm.toFixed(0) + ' NM']] : []),
        ...(P && P.acq ? [['RADAR', '≈ ' + P.acq.nm.toFixed(0) + ' NM' + (P.tAcq ? ' · ' + hm(P.tAcq) : '')]] : []),
        ...O.map(o => [o.k, o.l + ' · ' + h3(o.brg) + '° ' + o.nm.toFixed(1) + ' nm · ' + fmt(o.el) + ' ft']),
        ['STPT 90', 'HPN target: the centre of the area'],
      ],
      calls: P
        ? tasmoSteps(W.name, S, P, launchTxt()).map(r => r[0] + ': ' + r[1])
        : ['The attack: A-G > Pop-up or HADB, the ship as the target'],
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
      R = Math.max(ship.rng / KM_NM, 10),
      pts = [
        ship,
        ...(P ? [P.launch, ...(P.desc ? [P.desc] : [])] : [G.from]),
        { x: ship.x + R * KM_NM, y: ship.y },
        { x: ship.x - R * KM_NM, y: ship.y },
      ],
      p = await snapMap(M, deps, pts, AR, keep, [ship, { x: ship.x + 10 * KM_NM, y: ship.y }]);
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
  const cardName = k => (k == 'map' ? 'TASMO · ' : 'Smart · TASMO · ') + X.me.name;
  async function ready(pic = true) {
    compute();
    if (!X || !X.ok || !ship) return false;
    CL = classicData();
    if (pic) {
      const B = aaBox(CL);
      try {
        CL.px = await busyRun('Preparing the TASMO cards…', () => snapPlan(B.w / B.h));
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
      if (!(await ready())) return deps.toast('TASMO card: ' + (X && !X.ok ? X.why : 'no ship'), true);
    } finally {
      if (btn) btn.disabled = false;
    }
    await addCards(deps, KINDS, drawCard, cardName, 'Add TASMO cards to the Kneeboard', 'tasmocardkinds', [
      'smart',
      'map',
    ]);
  }
  async function allCards() {
    if (!(await ready())) return [];
    return allOf(KINDS, drawCard, cardName, 'TASMO');
  }

  return {
    root,
    canCard: () => (compute(), !!(X && X.ok && ship)),
    addCard,
    allCards,
    render: () => {
      shown = true;
      loadMis();
      update();
    },
    refresh: () => {
      if (shown) update();
    },
    leave: () => {
      shown = false;
      detachMap();
    },
    usable: () => {
      const c = deps.ctx();
      return !!(c && c.ok && c.ships && c.ships.length);
    },
    // Display > TASMO of the Map page
    overlay: o => {
      loadMis();
      compute();
      if (!X || !X.ok || !ship) return false;
      if (!o.map._tsR) {
        o.map.createPane('tsP').style.zIndex = 470;
        o.map._tsR = o.L.canvas({ pane: 'tsP' });
      }
      layers(o.L, o.map, o.WL);
      return true;
    },
    // for the tests
    plan: () => (
      compute(),
      {
        why: X && !X.ok ? X.why : ship ? '' : 'no ship',
        S,
        G,
        P,
        ship: ship && ship.id,
        wpn: W && W.name,
        checks: X && X.ok && ship ? checks() : [],
        oas: X && X.ok && ship ? oas() : [],
      }
    ),
    smart: () => (compute(), X && X.ok && ship ? smartData() : null),
    cardCanvas: async k => ((await ready(k == 'map')) ? drawCard(k || 'smart') : null),
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if ('mis' in o) {
        MIS = o.mis;
        deps.mis = null;
      }
    },
  };
}
