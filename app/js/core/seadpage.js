// Weapons > HARM > SEAD: the HARM shots of a SEAD flight that protect the other flights of its package. The maths is in sead.js (the rings of the map, the
// times of the flight plans, 9 nm/min where a steerpoint has no time), the range and the time of flight of each shot come from the HARM shot of the
// Single shot page (airmissile.js harmShot, its missile, mode and submode). The page: the package and the flights it protects, the threats on their
// routes (each with its HARM code and its place in the HARM tables of the DTC), the sort of the shots among the aircraft (Priority or Azimuth, a seat
// changed by hand), the map (routes, rings, impact points at 85 %, the launch points of each seat), the timeline, the shot chosen. Three buttons, each
// writing nothing before it asks: Add card (a SEAD card for the Kneeboard), HARM tables (adds a missing threat, in a free slot or the one chosen),
// PPT (the threats assigned as pre-planned threats, with the AUTO PPT of the Map page).
// deps: {esc, toast, confirm, ctx() -> {ok, why} | {ok, me, flights, sams, seat, harms}, harm() -> Promise<{m, v}>, toLL(x, y), attach(el), detach(),
//   cyclePlan(), planMode(), dtc: {open(), harm(), setHarm(t, n, code)}, ppt([{x, y, rng, name}]) -> Promise<string>, snap(scale), kbAdd(blob, name)}
import { seadPlan, timed, seatLabels, BACKUP_NM_MIN } from './sead.js';
import { harmShot, NM } from './airmissile.js';
import { threatOf } from './harmcodes.js';
import { drawSeadCard, SDC_W, SDC_H } from './seadcard.js';

const FT_KM = 3280.84,
  KM_NM = 1.852;
export const SEAT_COL = ['#4aa3ff', '#f0b040', '#b07cff', '#34d399'];
const hms = t => {
  const s = Math.round(t / 1000) % 86400,
    q = n => String(n).padStart(2, '0');
  return q(Math.floor(s / 3600)) + ':' + q(Math.floor((s % 3600) / 60)) + ':' + q(s % 60);
};
const mmss = s => {
  const a = Math.abs(Math.round(s));
  return Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
};
const h3 = d => String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, '0');

export function createSeadPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'wpsead';
  let st = { prot: {}, skip: {}, k: 85, sort: 'prio', seat: {}, sel: null },
    M = null,
    pend = null,
    failed = false,
    fit = true,
    P = null, // the plan worked out
    X = null, // the context: the package, the SAMs
    H = null, // the missile and the HARM settings of the Single shot page
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('sead1') || 'null');
    if (o) st = { ...st, ...o };
  } catch (e) {
    /* none */
  }
  const norm = () => {
    const ob = v => (v && typeof v == 'object' && !Array.isArray(v) ? v : {});
    st.prot = ob(st.prot);
    st.skip = ob(st.skip);
    st.seat = ob(st.seat);
    st.k = Math.min(100, Math.max(50, Math.round((+st.k || 85) / 5) * 5));
    st.sort = st.sort == 'az' ? 'az' : 'prio';
    st.sel = typeof st.sel == 'string' ? st.sel : null;
  };
  norm();
  const save = () => {
    try {
      sessionStorage.setItem('sead1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  // the HARM range and mean speed from a point of the SEAD flight to a SAM: the Single shot model, aimed at the SAM (the shooter turns to it)
  function shot(p, s) {
    if (!H || !H.m) return { rTh: 0, rMax: 0, vm: 0.33 };
    const brg = ((Math.atan2(s.x - p.x, s.y - p.y) * 180) / Math.PI + 360) % 360,
      r = harmShot(H.m, H.m.loft, {
        alt: p.altFt > 500 ? p.altFt : 25000,
        speed: p.gsKt > 150 ? p.gsKt : 450,
        tgtAlt: 0,
        heading: brg,
        offNose: 0,
        shotPct: 100,
        mode: H.v.mode,
        sub: H.v.sub,
        emitter: { n: s.y * FT_KM, e: s.x * FT_KM },
      });
    if (!r || r.error) return { rTh: 0, rMax: 0, vm: 0.33 };
    return { rTh: r.rTh / NM, rMax: r.rMax / NM, vm: r.flight > 0 ? r.shot / NM / r.flight : 0.33 };
  }
  function compute() {
    X = deps.ctx();
    P = null;
    if (!X || !X.ok) return;
    const prot = X.flights.filter(f => st.prot[f.key] !== false && !f.sead);
    P = seadPlan({
      prot: prot.map(f => ({ key: f.key, name: f.name, wps: f.f.wps })),
      sead: { wps: X.me.f.wps, n: X.me.n, harms: X.harms },
      sams: X.sams,
      k: st.k / 100,
      sort: st.sort,
      seat: st.seat,
      skip: st.skip,
      shot,
    });
    if (st.sel && !P.rows.some(r => r.id == st.sel)) st.sel = null;
    if (!st.sel) {
      const r = P.rows.find(z => z.launch && z.seat === X.seat) || P.rows.find(z => z.launch);
      st.sel = r ? r.id : null;
    }
  }
  const seatName = i => (i == null ? '—' : seatLabels(X.me.n)[i] || '#' + (i + 1));
  // where each threat is in the HARM tables of the DTC: [[table, slot]...]
  function inTables(code) {
    const T = deps.dtc.harm();
    if (!T || code == null) return [];
    const o = [];
    T.forEach((row, t) => row.forEach((c, n) => c == code && o.push([t, n])));
    return o;
  }
  const HC = ['#4aa3ff', '#f0b040', '#b07cff'];
  const tabTag = r => {
    if (r.sam.code == null) return '<span class="sdw" title="The HARM has no code for this system">no code</span>';
    if (!deps.dtc.harm()) return '<span class="hint">no DTC</span>';
    const w = inTables(r.sam.code);
    return w.length
      ? w
          .map(
            ([t, n]) =>
              `<span class="sdht" style="background:${HC[t]}" title="HARM table ${t + 1}, slot ${n + 1}">T${t + 1}</span>`
          )
          .join('')
      : '<span class="sdw">not in a table</span>';
  };

  // ---- the page
  function build() {
    const r = root;
    if (!X || !X.ok) {
      r.innerHTML = `<div class="wcard sdnone fx"><h3>SEAD</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a SEAD flight.')}</p><p class="hint">SEAD works for a package with a SEAD flight and other flights to protect: choose the SEAD flight in the ATO. The Single shot page plans one HARM shot at a PPT of the DTC.</p></div>`;
      return;
    }
    r.innerHTML = `<div class="wpg sdg"><div class="wpl sdl"><div class="wcard" id="sdpk"></div><div class="wcard" id="sdth"></div><div class="wcard" id="sdso"></div></div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>Horizontal plan</h3><span style="flex:1"></span><button class="btn g" type="button" data-sdfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-sdpf title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div><div id="sdmap" class="wmapbox"></div>
      <div class="wleg"><span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="#e6edf3" stroke-width="3"/></svg>protected route</span><span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="#4cc38a" stroke-width="3" stroke-dasharray="6 4"/></svg>your route</span><span><svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="#ff5d5d" stroke-width="3"/></svg>SAM ring · dashed ${st.k}%</span><span><svg width="12" height="12" aria-hidden="true"><path d="M6 1l5 5-5 5-5-5z" fill="#ff9f1c"/></svg>impact (${st.k}%)</span><span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#4aa3ff"/></svg>launch of each seat</span></div></div></div>
      <div class="wpr"><div class="wcard" id="sdtl"></div><div class="wcard" id="sdsh"></div><div id="sdpr"></div></div></div>
      <div class="sdbar"><span class="hint" id="sdnote"></span><span style="flex:1"></span><button type="button" class="btn g" data-sdtab title="Checks the HARM tables of the DTC against the threats assigned: adds a missing one only after asking">HARM tables…</button><button type="button" class="btn g" data-sdppt title="The threats assigned as pre-planned threats of the DTC (the AUTO PPT of the Map page): adds the missing ones after asking">PPT…</button><button type="button" class="btn" data-sdcard title="A SEAD card for the Kneeboard: the shots of the flight, the timeline and the map">Add card</button></div>`;
    wire();
  }
  function fill() {
    if (!X || !X.ok || !root.querySelector('#sdpk')) return;
    const me = X.me,
      q = s => root.querySelector(s);
    q('#sdpk').innerHTML = `<h3>Package ${esc(String(me.pkgNo))}${me.tot ? ' · TOT ' + esc(me.tot) : ''}</h3>
      <div class="sdf"><span class="sdyou">YOU</span><b>${esc(me.name)}</b><span class="hint">${me.n}× ${esc(me.ac)} · ${esc(me.mission)} · ${X.harms.some(h => h > 0) ? 'AGM-88 ' + X.harms.map(h => '×' + h).join(' ') : 'no AGM-88 in the loadout'}</span></div>
      ${X.flights
        .map(f =>
          f.sead
            ? `<div class="sdf"><span class="sdbx"></span><b>${esc(f.name)}</b><span class="hint">${f.n}× ${esc(f.ac)} · ${esc(f.mission)} · another SEAD flight</span></div>`
            : `<label class="sdf"><input type="checkbox" data-sdprot="${esc(f.key)}"${st.prot[f.key] !== false ? ' checked' : ''}><b>${esc(f.name)}</b><span class="hint">${f.n}× ${esc(f.ac)} · ${esc(f.mission)}${f.tot ? ' · TOT ' + esc(f.tot) : ''}${P.rows.some(r => r.by.includes(f.name)) ? '' : ' · no ring crossed'}</span></label>`
        )
        .join('')}`;
    const R = P.rows;
    q('#sdth').innerHTML =
      `<h3>Threats on the protected routes</h3>` +
      (R.length
        ? `<table class="sdt"><tr><th></th><th>SAM</th><th>Code</th><th>Flight</th><th>WEZ in</th><th>Inside</th><th>HARM table</th></tr>${R.map(
            r =>
              `<tr data-sdrow="${esc(r.id)}" class="${st.sel == r.id ? 'on' : ''}${st.skip[r.id] ? ' off' : ''}"><td><input type="checkbox" data-sdskip="${esc(r.id)}"${st.skip[r.id] ? '' : ' checked'} title="Shoot at this SAM"></td><td><b>${esc(r.sam.name)}</b></td><td>${r.sam.code == null ? '—' : r.sam.code}</td><td>${esc(r.flight)}${r.by.length > 1 ? ' +' + (r.by.length - 1) : ''}</td><td>${hms(r.tin)}</td><td>${mmss((r.tout - r.tin) / 1000)}</td><td>${tabTag(r)}</td></tr>`
          ).join('')}</table>`
        : '<p class="hint">No enemy SAM ring (spotted, radar alive) on the routes of the protected flights.</p>') +
      `<div class="slr"><label>Impact at</label><input type="range" min="50" max="100" step="5" value="${st.k}" data-sdk><em data-sdke>${st.k}% R</em></div><p class="hint wnote">The HARM arrives when the protected flight is at ${st.k}% of the ring radius from the SAM: the SAM needs time to lock and shoot. Flight plan times${P.est ? '; ' + BACKUP_NM_MIN + ' nm/min where a steerpoint has no time' : ''}.</p>`;
    const S = P.seats,
      act = R.filter(r => !st.skip[r.id]);
    q('#sdso').innerHTML =
      `<div class="wh"><h3>Sort · ${X.me.n}-ship</h3><span style="flex:1"></span><span class="seg">${[
        ['prio', 'Priority'],
        ['az', 'Azimuth'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.sort == v ? 'on' : ''}" data-sdsort="${v}">${l}</button>`)
        .join('')}</span></div>` +
      (act.length
        ? act
            .map(r => {
              const L = r.launch,
                c = r.seat == null ? '#8b98a8' : SEAT_COL[r.seat];
              return `<div class="sdsr${st.sel == r.id ? ' on' : ''}" data-sdrow="${esc(r.id)}"><span class="sdseat" style="border-color:${c};color:${c}">${esc(seatName(r.seat))}</span><select data-sdseat="${esc(r.id)}" aria-label="Seat for ${esc(r.sam.name)}">${S.map(s => `<option value="${s.i}"${r.seat === s.i ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select><span>${esc(r.sam.name)}</span><span class="mono">${L && !L.off ? 'L ' + hms(L.t) : '—'}</span>${r.noHarm ? '<span class="sdw">no HARM left</span>' : !L || L.off ? '<span class="sdw">not flying</span>' : L.ok ? '<span class="sdok">✓</span>' : '<span class="sdw">out of range</span>'}</div>`;
            })
            .join('') +
          `<p class="hint wnote">${st.sort == 'az' ? 'Azimuth: from left to right as seen from your flight, #1 the leftmost.' : 'Priority: the first threat reached goes to the lead, the next to #2…'} A seat chosen in the list stays.${P.noLoadout ? ' The loadout has no AGM-88: the HARMs of each aircraft are not counted.' : ' ' + S.map(s => s.label.split(' ')[0] + ' ' + s.used + '/' + s.harms).join(' · ')}</p>`
        : '<p class="hint">No threat to shoot.</p>');
    q('#sdtl').innerHTML = timeline();
    q('#sdsh').innerHTML = details();
    q('#sdpr').innerHTML = problems();
    const n = q('#sdnote');
    if (n) n.textContent = X.seat != null ? 'Your seat: ' + seatName(X.seat) : '';
  }
  function timeline() {
    const R = P.rows.filter(r => !st.skip[r.id] && r.launch && !r.launch.off);
    if (!R.length) return '<h3>Timeline</h3><p class="hint">No shot.</p>';
    const t0 = Math.min(...R.map(r => Math.min(r.tin, r.launch.t))) - 30000,
      t1 = Math.max(...R.map(r => r.tout)) + 30000,
      W = 100,
      X = t => (((t - t0) / (t1 - t0)) * W).toFixed(2) + '%',
      span = t1 - t0,
      step = span > 1200000 ? 300000 : span > 600000 ? 120000 : 60000,
      tk = [];
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) tk.push(t);
    return `<h3>Timeline</h3><div class="sdtk">${tk.map(t => `<span style="left:${X(t)}">${hms(t).slice(0, 5)}</span>`).join('')}</div>${R.map(
      r => {
        const L = r.launch,
          c = r.seat == null ? '#8b98a8' : SEAT_COL[r.seat];
        return `<div class="sdtr${st.sel == r.id ? ' on' : ''}" data-sdrow="${esc(r.id)}"><span class="sdtn">${esc(r.sam.name)}<em>${esc(seatName(r.seat).split(' ')[0])}</em></span><div class="sdtb"><i class="sdwz" style="left:${X(r.tin)};width:calc(${X(r.tout)} - ${X(r.tin)})" title="${esc(r.flight)} inside the ring ${hms(r.tin)}-${hms(r.tout)}"></i><i class="sdhm" style="left:${X(L.t)};width:calc(${X(r.t85)} - ${X(L.t)});background:${c}" title="HARM ${hms(L.t)} → ${hms(r.t85)}"></i><i class="sd85" style="left:calc(${X(r.t85)} - 5px)"></i></div></div>`;
      }
    ).join(
      ''
    )}<div class="wleg"><span><svg width="18" height="8" aria-hidden="true"><rect width="18" height="8" fill="rgba(255,93,93,.5)"/></svg>protected flight inside the ring</span><span><svg width="18" height="8" aria-hidden="true"><rect width="18" height="8" fill="#4aa3ff"/></svg>HARM in the air</span><span><svg width="10" height="10" aria-hidden="true"><path d="M5 0l5 5-5 5-5-5z" fill="#ff9f1c"/></svg>${st.k}%</span></div>`;
  }
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  function details() {
    const r = P.rows.find(z => z.id == st.sel);
    if (!r) return '<h3>Shot</h3><p class="hint">Choose a threat.</p>';
    const L = r.launch;
    let h = `<h3>Shot · ${esc(seatName(r.seat))} · ${esc(r.sam.name)}</h3>`;
    if (!L) return h + '<p class="hint">Not shot (its box is off).</p>';
    if (L.off)
      return (
        h +
        `<div class="kv">${kv('LAUNCH', hms(L.t) + ': your flight is not flying then', 'wbad')}${L.fix ? kv('FIX', 'launch at ' + hms(L.fix.t) + ' (impact ' + hms(L.fix.impact) + ')') : ''}</div>`
      );
    const th = threatOf(r.sam.code);
    return (
      h +
      `<div class="kv">${kv('LAUNCH', hms(L.t) + ' · ' + L.from.toFixed(1) + ' nm after STPT ' + L.leg)}${kv('TURN TO', h3(L.brg) + '° (route ' + h3(L.hdg) + '°)')}${kv('RANGE', L.d.toFixed(1) + ' nm · HARM ' + L.rTh.toFixed(1) + ' nm (' + Math.round(L.altFt).toLocaleString('en-US') + ' ft, ' + L.gsKt + ' kt)', L.ok ? '' : 'wbad')}${kv('FLIGHT TIME', L.tof + ' s')}${kv('IMPACT', hms(r.t85) + ' · ' + esc(r.flight) + (r.deep ? ' at its closest point' : ' at ' + st.k + '% of the ring'))}${kv('MODE', esc(String(H && H.v ? H.v.mode : 'pos').toUpperCase()) + (H && H.v && H.v.mode != 'has' ? ' · ' + esc(H.v.sub) : '') + ' · ' + (r.sam.code == null ? 'no HARM code' : 'code ' + r.sam.code + (th ? ' ' + esc(th[1]) : '')))}${kv('YOUR MARGIN', (L.margin >= 0 ? '+' : '−') + Math.abs(L.margin).toFixed(1) + ' nm ' + (L.margin >= 0 ? 'outside' : 'INSIDE') + ' its ring', L.margin < 0 ? 'wbad' : '')}${kv('OTHER RINGS', L.rings.length ? 'inside ' + L.rings.map(esc).join(', ') : 'clear', L.rings.length ? 'wbad' : 'sdok')}</div><p class="hint wnote">The missile, mode and submode of the Single shot page; aimed at the SAM, from the altitude and ground speed of your flight plan there.</p>`
    );
  }
  function problems() {
    const R = P.rows.filter(r => !st.skip[r.id] && r.launch && (r.launch.off || !r.launch.ok || r.noHarm));
    return R.map(r => {
      const L = r.launch,
        f = L.fix;
      return `<div class="wcard sdpb"><h3>${esc(seatName(r.seat).split(' ')[0])} · ${esc(r.sam.name)}</h3><div class="kv">${kv('PROBLEM', r.noHarm ? 'no HARM left for it' : L.off ? 'your flight is not flying at ' + hms(L.t) : 'out of range: ' + L.d.toFixed(1) + ' nm at ' + hms(L.t) + ', the HARM reaches ' + L.rTh.toFixed(1) + ' nm', 'sdw')}${kv('FIX', r.noHarm ? 'leave out a threat or give it to a seat with a HARM' : f ? 'launch ' + mmss(f.dt) + (f.dt > 0 ? ' later' : ' earlier') + ' (' + hms(f.t) + ', impact ' + hms(f.impact) + (f.impact > r.t85 ? ', after the ' + st.k + '% point' : '') + ')' : 'none along your route: move a steerpoint closer to the SAM')}</div></div>`;
    }).join('');
  }

  // ---- the map (Leaflet lent by the Map page)
  async function ensureMap() {
    const box = root.querySelector('#sdmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._sdR) {
      o.map.createPane('sdP').style.zIndex = 470;
      o.map._sdR = o.L.canvas({ pane: 'sdP' });
    }
    M = { ...o, WL: o.L.layerGroup().addTo(o.map) };
    fit = true;
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
    if (!X || !X.ok) return;
    if (!M) {
      if (!failed && !pend)
        pend = ensureMap().then(() => {
          pend = null;
          if (M) paint();
        });
      return;
    }
    const { L, map, WL } = M,
      RN = map._sdR,
      ll = p => deps.toLL(p.x, p.y),
      all = [];
    WL.clearLayers();
    const line = (pts, o) => L.polyline(pts.map(ll), { renderer: RN, interactive: false, ...o }).addTo(WL);
    const lab = (p, t, col, d = 'right') =>
      L.circleMarker(ll(p), { radius: 0, opacity: 0, fillOpacity: 0, interactive: false, renderer: RN })
        .bindTooltip(`<span style="color:${col}">${esc(t)}</span>`, {
          permanent: true,
          direction: d,
          className: 'wplab sdlab',
          offset: [8, 0],
        })
        .addTo(WL);
    X.flights
      .filter(f => !f.sead && st.prot[f.key] !== false)
      .forEach(f => {
        const w = timed(f.f.wps);
        if (w.length < 2) return;
        line(w, { color: '#000', weight: 6, opacity: 0.35 });
        line(w, { color: '#e6edf3', weight: 3 });
        if (P.rows.some(r => r.by.includes(f.name))) all.push(...w); // the view: the flights that cross a ring
      });
    const mw = timed(X.me.f.wps);
    if (mw.length > 1) {
      line(mw, { color: '#000', weight: 6, opacity: 0.35 });
      line(mw, { color: '#4cc38a', weight: 3, dashArray: '9 6' });
      all.push(...mw);
    }
    P.rows.forEach(r => {
      const s = r.sam,
        off = !!st.skip[r.id];
      [1, st.k / 100].forEach((k, i) =>
        L.circle(ll(s), {
          renderer: RN,
          radius: s.rng * 1000 * k,
          color: '#ff5d5d',
          weight: i ? 1.2 : 2,
          opacity: off ? 0.35 : 0.9,
          dashArray: i ? '5 5' : '',
          fill: !i,
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(WL)
      );
      L.marker(ll(s), {
        icon: L.divIcon({ className: 'sdsam', html: `<span>${esc(s.name)}</span>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
      all.push({ x: s.x - s.rng, y: s.y }, { x: s.x + s.rng, y: s.y });
      if (off || !r.launch) return;
      L.marker(ll(r.p85), {
        icon: L.divIcon({
          className: 'sd85m',
          html: `<i></i><span>${st.k}% ${hms(r.t85).slice(3)}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
      const Lp = r.launch;
      if (Lp.off) return;
      const c = r.seat == null ? '#8b98a8' : SEAT_COL[r.seat];
      line([Lp, s], { color: '#000', weight: 5, opacity: 0.4 });
      line([Lp, s], { color: c, weight: 2.5, dashArray: Lp.ok ? '' : '2 6' });
      L.circleMarker(ll(Lp), {
        renderer: RN,
        radius: st.sel == r.id ? 8 : 6,
        fillColor: c,
        fillOpacity: 1,
        color: st.sel == r.id ? '#fff' : '#111',
        weight: 2,
        interactive: false,
      }).addTo(WL);
      lab(Lp, seatName(r.seat).split(' ')[0] + ' L ' + hms(Lp.t).slice(3), c);
    });
    if (fit && all.length) {
      fit = false;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(all.map(ll)), { padding: [30, 30], maxZoom: 10, animate: false });
    }
  }
  async function draw(rebuild) {
    if (!shown) return;
    if (!H && deps.harm) {
      try {
        H = await deps.harm();
      } catch (e) {
        H = null;
      }
      if (!shown) return;
    }
    const was = X && X.ok;
    compute();
    if (rebuild || !root.querySelector('.sdg') !== !(X && X.ok) || was !== (X && X.ok)) {
      detachMap();
      failed = false;
      pend = null;
      build();
    }
    fill();
    paint();
  }

  // ---- the buttons
  function wire() {
    const q = s => root.querySelector(s);
    root.onclick = e => {
      const c = s => e.target.closest && e.target.closest(s);
      if (c('select, input')) return;
      const so = c('[data-sdsort]');
      if (so) {
        st.sort = so.dataset.sdsort;
        save();
        return draw(false);
      }
      const rw = c('[data-sdrow]');
      if (rw) {
        st.sel = rw.dataset.sdrow;
        save();
        return draw(false);
      }
      if (c('[data-sdfit]')) {
        fit = true;
        return paint();
      }
      if (c('[data-sdtab]')) return tables();
      if (c('[data-sdppt]')) return ppt();
      if (c('[data-sdcard]')) return addCard(c('[data-sdcard]'));
    };
    root.onchange = e => {
      const t = e.target,
        d = t.dataset || {};
      if (d.sdprot) st.prot[d.sdprot] = t.checked;
      else if (d.sdskip) {
        if (t.checked) delete st.skip[d.sdskip];
        else st.skip[d.sdskip] = true;
      } else if (d.sdseat) st.seat[d.sdseat] = +t.value;
      else if (d.sdk != null) st.k = +t.value;
      else return;
      if (d.sdprot) fit = true;
      save();
      draw(d.sdk != null);
    };
    root.oninput = e => {
      const d = e.target.dataset || {};
      if (d.sdk == null) return;
      const em = q('[data-sdke]');
      if (em) em.textContent = e.target.value + '% R';
    };
    const po = q('[data-sdpf]');
    if (po) {
      const LAB = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'];
      po.onclick = () => {
        const m = deps.cyclePlan ? deps.cyclePlan() : 0;
        po.textContent = LAB[m];
      };
      po.textContent = LAB[deps.planMode ? deps.planMode() : 0];
    }
  }
  const mine = () => (P ? P.rows.filter(r => !st.skip[r.id] && r.launch && (X.seat == null || r.seat === X.seat)) : []);
  // HARM tables: nothing is written without asking; a threat already in a table is fine where it is
  async function tables() {
    const T = deps.dtc.harm();
    if (!T) return deps.toast('Open a DTC with a HARM section first: the tables are in it.', true);
    const R = mine().filter(r => r.sam.code != null),
      miss = [...new Map(R.filter(r => !inTables(r.sam.code).length).map(r => [r.sam.code, r])).values()];
    if (!R.length) return deps.toast('No threat with a HARM code for your seat.', true);
    if (!miss.length)
      return deps.toast(
        'All your threats are in the HARM tables: ' +
          R.map(
            r =>
              r.sam.name +
              ' ' +
              inTables(r.sam.code)
                .map(([t, n]) => 'T' + (t + 1) + '/' + (n + 1))
                .join(' ')
          ).join(', ') +
          '.'
      );
    const free = [];
    T.forEach((row, t) => row.forEach((c, n) => (!c || isNaN(c)) && free.push([t, n])));
    const plan = miss.map((r, i) => ({ r, at: free[i] || null }));
    const need = plan.filter(z => !z.at);
    let txt =
      'Your threats not in the HARM tables: ' +
      miss.map(r => r.sam.name + ' (' + r.sam.code + ')').join(', ') +
      '.\n\n' +
      plan
        .filter(z => z.at)
        .map(z => z.r.sam.name + ' → table ' + (z.at[0] + 1) + ', slot ' + (z.at[1] + 1) + ' (free)')
        .join('\n');
    // no free slot: the last slots of the tables are offered, the threats that are not of this mission first
    if (need.length) {
      const used = new Set(R.map(r => r.sam.code)),
        rep = [];
      for (let t = 2; t >= 0 && rep.length < need.length; t--)
        for (let n = 4; n >= 0 && rep.length < need.length; n--)
          if (!used.has(T[t][n]) && !rep.some(z => z[0] == t && z[1] == n)) rep.push([t, n]);
      need.forEach((z, i) => {
        z.at = rep[i] || null;
        z.rep = true;
      });
      txt +=
        (txt.endsWith('\n\n') ? '' : '\n') +
        need
          .filter(z => z.at)
          .map(z => {
            const o = threatOf(T[z.at[0]][z.at[1]]);
            return (
              z.r.sam.name +
              ' → table ' +
              (z.at[0] + 1) +
              ', slot ' +
              (z.at[1] + 1) +
              ' (replaces ' +
              (o ? o[1] : T[z.at[0]][z.at[1]]) +
              ')'
            );
          })
          .join('\n');
    }
    if (!(await deps.confirm(txt + '\n\nWrite them into the HARM tables of the DTC?'))) return;
    plan.filter(z => z.at).forEach(z => deps.dtc.setHarm(z.at[0], z.at[1], z.r.sam.code));
    deps.toast(plan.filter(z => z.at).length + ' threats written into the HARM tables.');
    draw(false);
  }
  async function ppt() {
    const R = mine();
    if (!R.length) return deps.toast('No threat for your seat.', true);
    const m = await deps.ppt(R.map(r => ({ x: r.sam.x, y: r.sam.y, rng: r.sam.rng, name: r.sam.name })));
    if (m) deps.toast(m);
    draw(false);
  }

  // ---- the Kneeboard card
  function cardData() {
    const R = P.rows.filter(r => !st.skip[r.id] && r.launch);
    return {
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      pkg: 'PACKAGE ' + X.me.pkgNo + (X.me.tot ? ' · TOT ' + X.me.tot : ''),
      seat: X.seat,
      seatName: X.seat != null ? seatName(X.seat) : '',
      k: st.k,
      mode: H && H.v ? String(H.v.mode).toUpperCase() + (H.v.mode != 'has' ? ' ' + H.v.sub : '') : 'POS EOM',
      prot: X.flights
        .filter(f => !f.sead && st.prot[f.key] !== false && P.rows.some(r => r.by.includes(f.name)))
        .map(f => f.name),
      rows: R.map(r => ({
        seat: r.seat,
        seatName: seatName(r.seat),
        sam: r.sam.name,
        code: r.sam.code,
        tab: inTables(r.sam.code)
          .map(([t, n]) => 'T' + (t + 1) + '/' + (n + 1))
          .join(' '),
        flight: r.flight,
        tin: hms(r.tin),
        tout: hms(r.tout),
        t85: hms(r.t85),
        tl: r.launch.off ? '—' : hms(r.launch.t),
        at: r.launch.off ? '' : r.launch.from.toFixed(1) + ' NM AFTER STPT ' + r.launch.leg,
        brg: r.launch.off ? '' : h3(r.launch.brg),
        d: r.launch.off ? 0 : r.launch.d,
        tof: r.launch.off ? 0 : r.launch.tof,
        ok: !r.launch.off && r.launch.ok && !r.noHarm,
        why: r.noHarm ? 'NO HARM LEFT' : r.launch.off ? 'NOT FLYING' : r.launch.ok ? '' : 'OUT OF RANGE',
        ms: [r.tin, r.tout, r.launch.off ? r.t85 : r.launch.t, r.t85],
      })),
      px: null,
    };
  }
  // the map for the card: the lent map fitted to the plan, a picture of it, the points in its pixels
  async function snapPlan(D) {
    if (!M || !deps.snap) return null;
    const { L, map, WL } = M,
      ll = p => deps.toLL(p.x, p.y),
      prot = X.flights
        .filter(f => !f.sead && st.prot[f.key] !== false && P.rows.some(r => r.by.includes(f.name)))
        .map(f => timed(f.f.wps)),
      mw = timed(X.me.f.wps),
      R = P.rows.filter(r => !st.skip[r.id] && r.launch),
      pts = [
        ...prot.flat(),
        ...mw,
        ...R.flatMap(r => [
          { x: r.sam.x - r.sam.rng, y: r.sam.y },
          { x: r.sam.x + r.sam.rng, y: r.sam.y },
        ]),
      ];
    if (!pts.length) return null;
    const el = map.getContainer(),
      cw = el.clientWidth,
      ch = el.clientHeight,
      AR = 1520 / 900,
      bw = Math.min(cw, ch * AR),
      bh = bw / AR,
      ox = (cw - bw) / 2,
      oy = (ch - bh) / 2,
      c0 = map.getCenter(),
      z0 = map.getZoom();
    WL.remove();
    try {
      map.fitBounds(L.latLngBounds(pts.map(ll)), {
        paddingTopLeft: [ox + 20, oy + 20],
        paddingBottomRight: [ox + 20, oy + 20],
        animate: false,
      });
      await new Promise(r => setTimeout(r, 1200));
      const shot = await deps.snap(2);
      if (!shot) return null;
      const k = shot.canvas.width / cw,
        px = p => {
          const q = map.latLngToContainerPoint(ll(p));
          return [(q.x - ox) * k, (q.y - oy) * k];
        },
        kmPx = Math.hypot(...[0, 1].map(i => px({ x: pts[0].x + 1, y: pts[0].y })[i] - px(pts[0])[i])),
        crop = document.createElement('canvas');
      crop.width = Math.round(bw * k);
      crop.height = Math.round(bh * k);
      crop.getContext('2d').drawImage(shot.canvas, -ox * k, -oy * k);
      return {
        img: crop,
        coast: shot.coast,
        prot: prot.map(w => w.map(px)),
        me: mw.map(px),
        sams: R.map(r => ({
          c: px(r.sam),
          r: r.sam.rng * kmPx,
          name: r.sam.name,
          p85: px(r.p85),
          l: r.launch.off ? null : px(r.launch),
          seat: r.seat,
          ok: r.launch.ok,
          tl: r.launch.off ? '' : hms(r.launch.t).slice(3),
        })),
        nm: kmPx * KM_NM,
        k: st.k / 100,
      };
    } catch (e) {
      return null;
    } finally {
      WL.addTo(map);
      map.setView(c0, z0, { animate: false });
    }
  }
  async function addCard(btn) {
    if (!deps.kbAdd || !P) return;
    btn.disabled = true;
    try {
      const D = cardData();
      if (!D.rows.length) throw new Error('no shot to put on the card');
      D.px = await snapPlan(D);
      const c = document.createElement('canvas');
      c.width = SDC_W;
      c.height = SDC_H;
      drawSeadCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('the card could not be drawn');
      const at = await deps.kbAdd(blob, 'SEAD · ' + X.me.name);
      deps.toast(
        'SEAD card added to the Kneeboard: ' +
          (at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards') +
          '.'
      );
    } catch (e) {
      deps.toast('SEAD card: ' + ((e && e.message) || e), true);
    } finally {
      btn.disabled = false;
    }
  }

  return {
    root,
    render: () => {
      shown = true;
      draw(true);
    },
    refresh: () => {
      if (shown) draw(false);
    },
    leave: () => {
      shown = false;
      detachMap();
    },
    // the SEAD flight chosen: the page is the one to show (else Single shot)
    usable: () => {
      const c = deps.ctx();
      return !!(c && c.ok);
    },
    state: () => st,
    setState: o => {
      if (o && typeof o == 'object') {
        st = { ...st, ...o };
        norm();
        save();
        if (shown) draw(true);
      }
    },
    // for the tests
    plan: () => P,
    card: () => (P ? cardData() : null),
    cardMap: async () => {
      if (!P) return null;
      const D = cardData();
      D.px = await snapPlan(D);
      const c = document.createElement('canvas');
      c.width = SDC_W;
      c.height = SDC_H;
      drawSeadCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D);
      return c;
    },
    cardCanvas: () => {
      if (!P) return null;
      const c = document.createElement('canvas');
      c.width = SDC_W;
      c.height = SDC_H;
      drawSeadCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), cardData());
      return c;
    },
    reloadHarm: () => {
      H = null;
    },
    // the tests give a made-up package and missile (no campaign, no BMS files)
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.harm) {
        deps.harm = o.harm;
        H = null;
      }
    },
  };
}
