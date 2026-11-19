// Weapons > HARM > SEAD: the HARM shots of a SEAD flight that protect the other flights of its package. The maths is in sead.js (the rings of the map, the
// times of the flight plans, 9 nm/min where a steerpoint has no time, all the HARMs of the flight spread over the time inside the rings, ingress first,
// POS to a steerpoint or HAD at the SAM); the range, the time of flight and the max range of each shot come from the HARM model of the Single shot page
// (airmissile.js harmShot). The page: the package and the flights it protects, the threats on their routes (HARM code, place in the HARM tables), the
// shots (Priority or Azimuth, POS or HAD, a seat or a steerpoint changed by hand), the map or the scheme (a lane for each protected flight: inside the
// rings, not covered, its task; a lane for each seat: launch, flight, impact, glide), the events, the shot chosen and the cover of its SAM.
// Colours: as on the Map page (your route = the flight plan colour, the protected ones = the package colour, the SAM rings = the enemy SAM colour),
// the HARM light blue, the impact red, what is not covered red, you (your flight, your seat, your launches) green; amber for the warnings only.
// Three buttons, each writing nothing before it asks: HARM tables (adds a missing threat), PPT (the threats as pre-planned threats, the AUTO PPT of the
// Map page), Add card (the SEAD card of the Kneeboard, with the map or with the scheme).
// deps: {esc, toast, confirm, ctx() -> {ok, why} | {ok, me, flights, sams, seat, harms, hts, refs}, harm() -> Promise<{m, v}>, toLL(x, y), attach(el),
//   detach(), cyclePlan(), planMode(), layerOn(k), pal(), dtc: {harm(), setHarm(t, n, code)}, ppt([{x, y, rng, name}]) -> Promise<string>, snap(scale),
//   kbAdd(blob, name)}
import { seadPlan, timed, posAt, seatLabels, BACKUP_NM_MIN, POS_AREA, MIN_GAP_S } from './sead.js';
import { harmShot, NM } from './airmissile.js';
import { threatOf } from './harmcodes.js';
import { drawSeadCard, cardBox, SDC_W, SDC_H, SD_COL } from './seadcard.js';

const FT_KM = 3280.84,
  KM_NM = 1.852;
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
const { HARM, IMP, YOU, GAP } = SD_COL;

export function createSeadPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'wpsead';
  let st = {
      prot: {},
      skip: {},
      k: 85,
      sort: 'prio',
      seat: {},
      ref: {},
      mode: null,
      sub: null,
      view: 'map',
      sel: null,
    },
    M = null,
    pend = null,
    failed = false,
    fit = true,
    P = null, // the plan worked out
    X = null, // the context: the package, the SAMs
    H = null, // the missile and the HARM settings of the Single shot page
    shown = false;
  try {
    const o = JSON.parse(sessionStorage.getItem('sead2') || 'null');
    if (o) st = { ...st, ...o };
  } catch (e) {
    /* none */
  }
  const norm = () => {
    const ob = v => (v && typeof v == 'object' && !Array.isArray(v) ? v : {});
    st.prot = ob(st.prot);
    st.skip = ob(st.skip);
    st.seat = ob(st.seat);
    st.ref = ob(st.ref);
    st.k = Math.min(100, Math.max(50, Math.round((+st.k || 85) / 5) * 5));
    st.sort = st.sort == 'az' ? 'az' : 'prio';
    st.mode = st.mode == 'pos' || st.mode == 'had' ? st.mode : null;
    st.sub = POS_AREA[st.sub] ? st.sub : null;
    st.view = st.view == 'sch' ? 'sch' : 'map';
    st.sel = typeof st.sel == 'string' ? st.sel : null;
  };
  norm();
  const save = () => {
    try {
      sessionStorage.setItem('sead2', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const mode = () => st.mode || (H && H.v && H.v.mode == 'had' ? 'had' : 'pos'),
    sub = () => st.sub || (H && H.v && POS_AREA[H.v.sub] ? H.v.sub : 'EOM'),
    glide = () => !(H && H.v && H.v.iso && H.v.gi); // Target Isolate and Glide Inhibit both on: no glide
  // the HARM range, max range and mean speed from a point of the SEAD flight to an aim point (the SAM or its steerpoint): the Single shot model, the
  // shooter turned to the aim point
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
        mode: 'pos',
        sub: sub(),
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
      mode: mode(),
      sub: sub(),
      refs: X.refs || [],
      ref: st.ref,
      glide: glide(),
      seat: st.seat,
      skip: st.skip,
      shot,
    });
    if (st.sel && !P.shots.some(z => z.key == st.sel)) st.sel = null;
    if (!st.sel) {
      const z = P.shots.find(q => q.seat === X.seat) || P.shots[0];
      st.sel = z ? z.key : null;
    }
  }
  const seatName = i => (i == null ? '—' : seatLabels(X.me.n)[i] || '#' + (i + 1)),
    seatNo = i => (i == null ? '—' : '#' + (i + 1)),
    mine = z => X.seat != null && z.seat === X.seat,
    nth = z => (z.k > 1 ? ' · ' + (['', '1st', '2nd', '3rd'][z.k] || z.k + 'th') : ''),
    shotOf = key => P && P.shots.find(z => z.key == key),
    refName = r => (r ? 'STPT ' + r.n + (r.ppt ? ' (PPT ' + (r.n - 55) + ')' : '') : '—');
  // where each threat is in the HARM tables of the DTC: [[table, slot]...]
  function inTables(code) {
    const T = deps.dtc.harm();
    if (!T || code == null) return [];
    const o = [];
    T.forEach((row, t) => row.forEach((c, n) => c == code && o.push([t, n])));
    return o;
  }
  const tabTxt = code =>
    inTables(code)
      .map(([t, n]) => 'T' + (t + 1) + '/' + (n + 1))
      .join(' ');
  const tabTag = r => {
    if (r.sam.code == null) return '<span class="sdw" title="The HARM has no code for this system">no code</span>';
    if (!deps.dtc.harm()) return '<span class="hint">no DTC</span>';
    const w = inTables(r.sam.code);
    return w.length
      ? w
          .map(([t, n]) => `<span class="sdht" title="HARM table ${t + 1}, slot ${n + 1}">T${t + 1}/${n + 1}</span>`)
          .join('')
      : '<span class="sdw">not in a table</span>';
  };
  // the colours of the map now (the basemap decides them, as on the Map page)
  const pal = () => {
    const p = deps.pal ? deps.pal() : null;
    return {
      plan: (p && p.plan) || '#ffd23f',
      mate: (p && p.mate) || '#ffffff',
      ring: (p && p.sam && p.sam.foe && p.sam.foe.c) || '#ff9f1a',
      halo: (p && p.halo) || 'rgba(0,0,0,.65)',
      harm: p && p.plan == '#d6007a' ? '#0369a1' : HARM,
    };
  };

  // ---- the page
  function build() {
    const r = root;
    if (!X || !X.ok) {
      r.innerHTML = `<div class="wcard sdnone fx"><h3>SEAD</h3><p class="hint">${esc(X ? X.why : 'Open a campaign and choose a SEAD flight.')}</p><p class="hint">SEAD works for a package with a SEAD flight and other flights to protect: choose the SEAD flight in the ATO. The Single shot page plans one HARM shot at a PPT of the DTC.</p></div>`;
      return;
    }
    r.innerHTML = `<div class="wpg sdg"><div class="wpl sdl"><div class="wcard" id="sdpk"></div><div class="wcard" id="sdth"></div><div class="wcard" id="sdso"></div></div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>Horizontal plan</h3><span style="flex:1"></span><span class="seg sdvw">${[
        ['map', 'Map'],
        ['sch', 'Scheme'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.view == v ? 'on' : ''}" data-sdview="${v}">${l}</button>`)
        .join(
          ''
        )}</span><button class="btn g" type="button" data-sdfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-sdpf title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></div>
      <div id="sdmapw"><div id="sdmap" class="wmapbox"></div><div class="wleg" id="sdmleg"></div></div><div id="sdsch" hidden></div></div></div>
      <div class="wpr"><div class="wcard" id="sdsh"></div><div class="wcard" id="sdcv"></div><div id="sdpr"></div></div></div>
      <div class="sdbar"><span class="hint" id="sdnote"></span><span style="flex:1"></span><button type="button" class="btn g" data-sdtab title="Checks the HARM tables of the DTC against the threats of your seat: adds a missing one only after asking">HARM tables…</button><button type="button" class="btn g" data-sdppt title="The threats of your seat as pre-planned threats of the DTC (the AUTO PPT of the Map page): an exact steerpoint for POS. Adds the missing ones after asking.">PPT…</button><button type="button" class="btn" data-sdcard title="A SEAD card for the Kneeboard: with the map or with the scheme">Add card…</button></div>`;
    wire();
  }
  function fill() {
    if (!X || !X.ok || !root.querySelector('#sdpk')) return;
    const me = X.me,
      q = s => root.querySelector(s),
      md = mode();
    q('#sdpk').innerHTML = `<h3>Package ${esc(String(me.pkgNo))}${me.tot ? ' · TOT ' + esc(me.tot) : ''}</h3>
      <div class="sdf"><span class="sdyou">YOU</span><b class="sdme">${esc(me.name)}</b><span class="hint">${me.n}× ${esc(me.ac)} · ${esc(me.mission)} · ${X.harms.some(h => h > 0) ? 'AGM-88 ' + X.harms.join(' · ') + ' = ' + X.harms.reduce((a, b) => a + b, 0) : 'no AGM-88 in the loadout'}${X.hts ? ' · HTS' : ''}</span></div>
      ${X.flights
        .map(f => {
          const tk = P.task[f.key];
          return f.sead
            ? `<div class="sdf"><span class="sdbx"></span><b>${esc(f.name)}</b><span class="hint">${f.n}× ${esc(f.ac)} · ${esc(f.mission)} · another SEAD flight</span></div>`
            : `<label class="sdf"><input type="checkbox" data-sdprot="${esc(f.key)}"${st.prot[f.key] !== false ? ' checked' : ''}><b>${esc(f.name)}</b><span class="hint">${f.n}× ${esc(f.ac)} · ${esc(f.mission)}${tk ? ' · STPT ' + tk.n + ' ' + (tk.loiter ? hms(tk.t0).slice(0, 5) + '–' + hms(tk.t1).slice(0, 5) : hms(tk.t0)) : f.tot ? ' · TOT ' + esc(f.tot) : ''}${P.rows.some(r => r.by.includes(f.name)) ? '' : ' · no ring crossed'}</span></label>`;
        })
        .join('')}`;
    const R = P.rows;
    q('#sdth').innerHTML =
      `<h3>Threats on the protected routes</h3>` +
      (R.length
        ? `<table class="sdt"><tr><th></th><th>SAM</th><th>Code</th><th>Flight</th><th>WEZ in</th><th>Inside</th><th>HARMs</th><th>Table</th></tr>${R.map(
            r => {
              const s = shotOf(st.sel);
              return `<tr data-sdsam="${esc(r.id)}" class="${s && s.id == r.id ? 'on' : ''}${st.skip[r.id] ? ' off' : ''}"><td><input type="checkbox" data-sdskip="${esc(r.id)}"${st.skip[r.id] ? '' : ' checked'} title="Shoot at this SAM"></td><td><b>${esc(r.sam.name)}</b></td><td>${r.sam.code == null ? '—' : r.sam.code}</td><td>${esc(r.flight)}${r.by.length > 1 ? ' +' + (r.by.length - 1) : ''}</td><td>${hms(r.tin)}</td><td>${mmss(r.ms / 1000)}</td><td><b>${st.skip[r.id] ? '—' : r.shots.length}</b>${r.gaps.length && !st.skip[r.id] ? ' <span class="sdgap" title="Not covered: ' + r.gaps.map(g => hms(g.t0) + '–' + hms(g.t1)).join(', ') + '">●</span>' : ''}</td><td>${tabTag(r)}</td></tr>`;
            }
          ).join('')}</table>`
        : '<p class="hint">No enemy SAM ring (spotted, radar alive) on the routes of the protected flights.</p>') +
      `<div class="slr"><label>First impact at</label><input type="range" min="50" max="100" step="5" value="${st.k}" data-sdk><em data-sdke>${st.k}% R</em></div><p class="hint wnote">All the HARMs of the flight: one for each SAM first, arriving when the protected flight is at ${st.k}% of the ring radius from it (the SAM needs time to lock and shoot); then the others where it is not covered, ingress first (until its task is done). A SAM can switch its radar off: the shots are spread over the time inside. ${glide() ? 'Each HARM covers from its impact until it would reach its max range (its glide; at most its 300 s of flight).' : 'Target Isolate and Glide Inhibit are on (Single shot page): no glide, a HARM covers its impact only.'} Flight plan times${P.est ? '; ' + BACKUP_NM_MIN + ' nm/min where a steerpoint has no time' : ''}.</p>`;
    const S = P.seats,
      Z = P.shots.filter(z => !st.skip[z.id]),
      refs = X.refs || [];
    q('#sdso').innerHTML =
      `<div class="wh"><h3>Shots · ${X.me.n}-ship</h3><span style="flex:1"></span><span class="seg">${[
        ['prio', 'Priority'],
        ['az', 'Azimuth'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.sort == v ? 'on' : ''}" data-sdsort="${v}">${l}</button>`)
        .join('')}</span></div>
      <div class="sdmd"><span class="seg">${[
        ['pos', 'POS'],
        ['had', 'HAD'],
      ]
        .map(
          ([v, l]) =>
            `<button type="button" class="${md == v ? 'on' : ''}" data-sdmode="${v}" title="${v == 'pos' ? 'POS: the HARM flies to a steerpoint (of the flight plan or a PPT) and looks for the threat chosen in the HARM table around it; the SAM need not be radiating at the launch' : 'HAD: the HARM is shot at the SAM the HTS pod sees: it must be radiating at the launch'}">${l}</button>`
        )
        .join('')}</span><span class="seg">${['EOM', 'PB', 'RUK']
        .map(v => `<button type="button" class="${sub() == v ? 'on' : ''}" data-sdsub="${v}">${v}</button>`)
        .join(
          ''
        )}</span><span class="hint">${md == 'pos' ? 'the SAM within ' + POS_AREA[sub()].toFixed(1) + ' nm of the steerpoint' : X.hts ? 'the SAM radiating, seen by the HTS' : '<span class="sdw">no HTS pod in the loadout</span>'}</span></div>` +
      (Z.length
        ? Z.map(z => {
            const L = z.launch,
              me = mine(z),
              r = P.rows.find(w => w.id == z.id);
            return `<div class="sdsr${st.sel == z.key ? ' on' : ''}${me ? ' me' : ''}" data-sdrow="${esc(z.key)}"><select class="${me ? 'sdme' : ''}" data-sdseat="${esc(z.key)}" aria-label="Seat for ${esc(z.sam.name)}">${S.map(s => `<option value="${s.i}"${z.seat === s.i ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select><span class="sdsn">${esc(z.sam.name)}<em>${esc(nth(z))}</em></span>${
              md == 'pos'
                ? `<select data-sdref="${esc(z.id)}" aria-label="Steerpoint for ${esc(z.sam.name)}"${z.k > 1 ? ' disabled' : ''}>${refs.map(f => `<option value="${f.n}"${r.ref && r.ref.n == f.n ? ' selected' : ''}>${f.ppt ? 'PPT ' + (f.n - 55) + ' · ' : ''}STPT ${f.n}</option>`).join('')}</select>`
                : '<span class="hint">at the SAM</span>'
            }<span class="mono${me ? ' sdme' : ''}" style="color:${me ? '' : HARM}">${L.off ? '—' : 'L ' + hms(L.t)}</span><span class="mono sdimp">◆ ${hms(z.imp)}</span>${!L.off && L.ok && !(md == 'pos' && (!z.ref || !z.ref.inArea)) ? '<span class="sdok">✓</span>' : '<span class="sdw">!</span>'}</div>`;
          }).join('') +
          `<p class="hint wnote">${st.sort == 'az' ? 'Azimuth: the first HARM of each SAM from left to right as seen from your flight, #1 the leftmost.' : 'Priority: the first HARM of each SAM to the lead, the next to #2…, in the order the SAMs are reached.'} At least ${MIN_GAP_S} s between two launches of one aircraft. A seat${md == 'pos' ? ' or a steerpoint' : ''} chosen in the lists stays. ${P.noLoadout ? 'The loadout has no AGM-88: one shot for each aircraft.' : S.map(s => s.label.split(' ')[0] + ' ' + s.used + '/' + s.harms).join(' · ')}</p>`
        : '<p class="hint">No threat to shoot.</p>');
    q('#sdsh').innerHTML = details();
    q('#sdcv').innerHTML = coverCard();
    q('#sdpr').innerHTML = problems();
    const n = q('#sdnote');
    if (n) n.innerHTML = X.seat != null ? 'Your seat: <b class="sdme">' + esc(seatName(X.seat)) + '</b>' : '';
    const vm = st.view == 'map';
    root.querySelectorAll('[data-sdview]').forEach(b => b.classList.toggle('on', b.dataset.sdview == st.view));
    q('#sdmapw').hidden = !vm;
    q('#sdsch').hidden = vm;
    q('[data-sdfit]').hidden = !vm;
    q('[data-sdpf]').hidden = !vm;
    if (vm) q('#sdmleg').innerHTML = mapLegend();
    else q('#sdsch').innerHTML = schemeSvg(schemeModel()) + schemeLegend() + eventsHtml();
  }
  const sw = (c, d, w = 3) =>
    `<svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${c}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>`;
  function mapLegend() {
    const c = pal();
    return `<span>${sw(c.plan)}your route (as on the Map page)</span><span>${sw(c.mate)}protected route</span><span>${sw(c.ring, '7 5')}SAM ring · dotted ${st.k}%</span><span>${sw(c.harm)}HARM: launch and shot · yours bright</span><span><b style="color:${IMP}">◆</b> impact</span><span><b>▲</b> task steerpoint</span>`;
  }
  function schemeLegend() {
    const c = pal();
    return `<div class="wleg"><span><svg width="18" height="8" aria-hidden="true"><rect width="18" height="8" fill="${c.ring}" opacity=".45"/></svg>inside a ring · tick ${st.k}%</span><span><svg width="18" height="8" aria-hidden="true"><rect width="18" height="8" fill="${GAP}"/></svg>not covered</span><span>${sw(HARM, '', 6)}HARM in the air · L launch</span><span><svg width="18" height="8" aria-hidden="true"><rect width="18" height="8" fill="${HARM}" opacity=".3"/></svg>glide: still searching</span><span><b style="color:${IMP}">◆</b> impact</span><span><b>▲</b> task (strike; two for a time on station) · → ingress, ← egress</span></div>`;
  }
  // ---- the scheme: one model, drawn here in SVG and on the card in canvas (seadcard.js)
  function schemeModel() {
    const Z = P.shots.filter(z => !st.skip[z.id]),
      prot = X.flights.filter(
        f => !f.sead && st.prot[f.key] !== false && P.rows.some(r => !st.skip[r.id] && r.by.includes(f.name))
      ),
      lanes = prot.map(f => {
        const rows = P.rows
          .filter(r => !st.skip[r.id] && r.iv.some(v => v[2] == f.key))
          .map(r => {
            const iv = r.iv.filter(v => v[2] == f.key).map(v => [v[0], v[1]]);
            return {
              sam: r.sam.name,
              iv,
              t85: r.key == f.key ? r.t85 : null,
              gaps: r.gaps.filter(g => iv.some(v => g.t0 < v[1] && g.t1 > v[0])).map(g => [g.t0, g.t1]),
            };
          });
        const w = timed(f.f.wps);
        return {
          name: f.name,
          task: P.task[f.key],
          rows,
          t0: w.length ? w[0].arr : 0,
          t1: w.length ? w[w.length - 1].arr : 0,
        };
      }),
      seats = P.seats.map(s => ({
        label: s.label,
        mine: s.i === X.seat,
        harms: s.harms,
        used: s.used,
        shots: Z.filter(z => z.seat === s.i && !z.launch.off).map(z => ({
          sam: z.sam.name,
          tl: z.launch.t,
          imp: z.imp,
          cover: z.cover,
          ok: z.launch.ok,
        })),
      })),
      ts = [];
    lanes.forEach(l => {
      l.rows.forEach(r => r.iv.forEach(v => ts.push(v[0], v[1])));
      if (l.task) ts.push(l.task.t0, l.task.t1);
    });
    seats.forEach(s => s.shots.forEach(z => ts.push(z.tl, z.imp)));
    const t0 = ts.length ? Math.min(...ts) - 30000 : 0,
      t1 = ts.length ? Math.max(...ts) + 30000 : 1;
    seats.forEach(s => s.shots.forEach(z => (z.cover = Math.min(z.cover, t1))));
    return { t0, t1, lanes, seats, ring: pal().ring };
  }
  function schemeSvg(m) {
    if (!m.lanes.length && !m.seats.some(s => s.shots.length)) return '<p class="hint">No shot.</p>';
    const W = 760,
      X0 = 112,
      TW = W - X0 - 14,
      Xt = t => X0 + ((t - m.t0) / (m.t1 - m.t0)) * TW,
      span = m.t1 - m.t0,
      step = span > 1800000 ? 300000 : span > 900000 ? 120000 : 60000,
      o = [];
    let y = 26;
    const top = y;
    // the protected flights
    m.lanes.forEach(l => {
      const tk = l.task,
        h = 18 + l.rows.length * 24 + 18;
      o.push(
        `<text x="8" y="${y + 16}" class="sdsl">${esc(l.name)}</text><text x="8" y="${y + 31}" class="sdss">protected</text>`
      );
      const ta = tk ? Xt(tk.t0) : null,
        tb = tk ? Xt(tk.t1) : null;
      // ingress above, egress below
      if (tk) {
        o.push(
          `<path d="M${Math.max(X0, Xt(l.t0)) + 2} ${y + 3}H${ta - 16}" class="sdarr"/><path d="M${ta - 16} ${y + 3}l-7-4v8z" class="sdarrh"/><text x="${Math.max(X0, Xt(l.t0)) + 4}" y="${y - 1}" class="sdss">INGRESS →</text>`
        );
        o.push(
          `<path d="M${tb + 16} ${y + h - 6}H${Math.min(W - 14, Xt(l.t1))}" class="sdarr"/><path d="M${tb + 16} ${y + h - 6}l7-4v8z" class="sdarrh"/><text x="${Math.min(W - 16, Xt(l.t1))}" y="${y + h + 8}" class="sdss" text-anchor="end">← EGRESS</text>`
        );
      }
      l.rows.forEach((r, i) => {
        const yy = y + 12 + i * 24;
        r.iv.forEach(([a, b]) =>
          o.push(
            `<rect x="${Xt(a)}" y="${yy}" width="${Math.max(2, Xt(b) - Xt(a))}" height="16" rx="2" fill="${m.ring}" fill-opacity=".22" stroke="${m.ring}" stroke-dasharray="5 3"/>`
          )
        );
        r.gaps.forEach(([a, b]) =>
          o.push(
            `<rect x="${Xt(a)}" y="${yy}" width="${Math.max(2, Xt(b) - Xt(a))}" height="16" fill="${GAP}" fill-opacity=".6" stroke="${GAP}"><title>not covered ${hms(a)}–${hms(b)}</title></rect>`
          )
        );
        o.push(`<text x="${Xt(r.iv[0][0]) + 4}" y="${yy + 12}" fill="${m.ring}" class="sdsm">IN ${esc(r.sam)}</text>`);
        if (r.t85) o.push(`<path d="M${Xt(r.t85)} ${yy - 3}V${yy + 19}" stroke="${m.ring}" stroke-width="2.5"/>`);
      });
      if (tk) {
        const tri = x => `<path d="M${x - 11} ${y + 1}l11-20 11 20z" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
        o.push(tri(ta));
        if (tk.loiter) o.push(tri(tb), `<path d="M${ta} ${y - 2}H${tb}" stroke="#fff" stroke-width="3"/>`);
        o.push(`<path d="M${ta} ${y + 2}V${y + h - 8}" stroke="#fff" stroke-dasharray="3 3" opacity=".7"/>`);
        if (tk.loiter)
          o.push(`<path d="M${tb} ${y + 2}V${y + h - 8}" stroke="#fff" stroke-dasharray="3 3" opacity=".7"/>`);
        o.push(
          `<text x="${(tk.loiter ? tb : ta) + 14}" y="${y - 6}" class="sdtk">STPT ${tk.n}${tk.loiter ? ' · ON STATION ' + hms(tk.t0).slice(0, 5) + '–' + hms(tk.t1).slice(0, 5) : ' · ' + hms(tk.t0)}</text>`
        );
      }
      y += h + 22;
    });
    o.push(`<path d="M6 ${y - 12}H${W - 6}" stroke="#2a3441"/>`);
    // the seats
    m.seats.forEach(s => {
      const yy = y,
        a = s.mine ? 1 : 0.6;
      o.push(
        `<text x="8" y="${yy + 14}" class="sdsl${s.mine ? ' sdme' : ''}">${esc(s.label)}</text>${s.mine ? `<text x="8" y="${yy + 28}" class="sdss sdme">YOU</text>` : ''}<text x="8" y="${yy + (s.mine ? 42 : 28)}" class="sdss">AGM-88 ${s.used}/${s.harms == null ? '?' : s.harms}</text><path d="M${X0} ${yy + 12}H${W - 14}" stroke="#2a3441"/>`
      );
      s.shots.forEach(z => {
        const xl = Xt(z.tl),
          xi = Xt(z.imp),
          xc = Xt(z.cover);
        o.push(
          `<g opacity="${a}"><rect x="${xl}" y="${yy + 7}" width="${Math.max(2, xi - xl)}" height="10" rx="2" fill="${HARM}"/><rect x="${xi}" y="${yy + 7}" width="${Math.max(0, xc - xi)}" height="10" fill="${HARM}" fill-opacity=".28"/><text x="${xl}" y="${yy + 3}" text-anchor="middle" class="sdsm" fill="${s.mine ? YOU : HARM}">L</text><path d="M${xi} ${yy + 3}l9 9-9 9-9-9z" fill="${IMP}" stroke="#fff" stroke-width="1.2"/><text x="${xl + 2}" y="${yy + 33}" class="sdss${s.mine ? ' sdme' : ''}">${esc(z.sam)} · ${hms(z.tl).slice(3)}${z.ok ? '' : ' !'}</text></g>`
        );
      });
      y += s.mine ? 58 : 46;
    });
    // the time scale
    for (let t = Math.ceil(m.t0 / step) * step; t <= m.t1; t += step)
      o.unshift(
        `<path d="M${Xt(t)} ${top - 8}V${y - 6}" stroke="#202a36"/><text x="${Xt(t)}" y="12" class="sdss" text-anchor="middle">${hms(t).slice(0, 5)}</text>`
      );
    return `<svg viewBox="0 0 ${W} ${y}" class="sdscv" role="img" aria-label="SEAD scheme"><rect width="${W}" height="${y}" rx="6" fill="#121820"/>${o.join('')}</svg>`;
  }
  // the events of the plan in time order: the launches (yours in green), the impacts, the protected flights entering the rings, at k, their tasks, the
  // parts not covered
  function events() {
    const E = [];
    P.rows
      .filter(r => !st.skip[r.id])
      .forEach(r => {
        E.push({ t: r.tin, c: 'in', s: r.flight + ' IN ' + r.sam.name });
        E.push({ t: r.t85, c: 'in', s: r.flight + ' ' + r.sam.name + ' ' + st.k + '%' });
        r.gaps.forEach(g =>
          E.push({ t: g.t0, c: 'gap', s: r.sam.name + ' NOT COVERED to ' + hms(g.t1) + (g.ing ? ' (ingress)' : '') })
        );
      });
    P.shots
      .filter(z => !st.skip[z.id] && !z.launch.off)
      .forEach(z => {
        E.push({
          t: z.launch.t,
          c: mine(z) ? 'me' : 'harm',
          s:
            seatNo(z.seat) +
            ' LAUNCH ' +
            z.sam.name +
            ' ' +
            mode().toUpperCase() +
            (mode() == 'pos' && z.ref ? ' STPT ' + z.ref.n : ''),
        });
        E.push({ t: z.imp, c: 'imp', s: '◆ ' + z.sam.name + ' (' + seatNo(z.seat) + ')' });
      });
    X.flights
      .filter(
        f =>
          !f.sead &&
          st.prot[f.key] !== false &&
          P.task[f.key] &&
          P.rows.some(r => !st.skip[r.id] && r.by.includes(f.name))
      )
      .forEach(f => {
        const tk = P.task[f.key];
        E.push({
          t: tk.t0,
          c: 'task',
          s: '▲ ' + f.name + (tk.loiter ? ' ON STATION' : ' TASK') + ' (STPT ' + tk.n + ')',
        });
        if (tk.loiter) E.push({ t: tk.t1, c: 'task', s: '▲ ' + f.name + ' OFF STATION' });
      });
    return E.sort((a, b) => a.t - b.t);
  }
  const eventsHtml = () =>
    `<h3 class="sdevh">Events</h3><div class="sdev">${events()
      .map(e => `<div class="e-${e.c}"><span class="mono">${hms(e.t)}</span><span>${esc(e.s)}</span></div>`)
      .join('')}</div>`;
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  function details() {
    const z = shotOf(st.sel);
    if (!z) return '<h3>Shot</h3><p class="hint">Choose a shot.</p>';
    const L = z.launch,
      me = mine(z),
      md = mode();
    let h = `<h3>Shot · <span class="${me ? 'sdme' : ''}">${esc(seatName(z.seat))}</span> · ${esc(z.sam.name)}${esc(nth(z))}</h3>`;
    if (L.off)
      return (
        h +
        `<div class="kv">${kv('LAUNCH', hms(L.t) + ': your flight is not flying then', 'wbad')}${L.fix ? kv('FIX', 'launch at ' + hms(L.fix.t) + ' (impact ' + hms(L.fix.impact) + ')') : ''}</div>`
      );
    const th = threatOf(z.sam.code),
      r = P.rows.find(w => w.id == z.id),
      next = r.shots.find(w => w.k == z.k + 1),
      tb = tabTxt(z.sam.code);
    return (
      h +
      `<div class="kv">${kv('LAUNCH', hms(L.t) + ' · ' + L.from.toFixed(1) + ' nm after STPT ' + L.leg, me ? 'sdme' : '')}${kv('TURN TO', h3(L.brg) + '° (route ' + h3(L.hdg) + '°)')}${kv(
        'MODE',
        md == 'pos'
          ? 'POS ' +
              sub() +
              ' · ' +
              refName(z.ref) +
              (z.ref
                ? z.ref.inArea
                  ? ''
                  : ' <span class="sdw">SAM ' + z.ref.d.toFixed(1) + ' nm away: outside the ' + sub() + ' area</span>'
                : ' <span class="sdw">no steerpoint</span>')
          : 'HAD · at the SAM' + (X.hts ? '' : ' <span class="sdw">no HTS pod</span>')
      )}${kv('THREAT', (z.sam.code == null ? 'no HARM code' : z.sam.code + (th ? ' ' + esc(th[1]) : '')) + (tb ? ' · ' + tb : z.sam.code != null && deps.dtc.harm() ? ' <span class="sdw">not in a table</span>' : ''))}${kv('RANGE', L.d.toFixed(1) + ' nm · HARM ' + L.rTh.toFixed(1) + ' nm (' + Math.round(L.altFt).toLocaleString('en-US') + ' ft, ' + L.gsKt + ' kt)', L.ok ? '' : 'wbad')}${kv('FLIGHT TIME', L.tof + ' s')}${kv('IMPACT', hms(z.imp) + (z.k == 1 ? ' · ' + esc(r.flight) + (r.deep ? ' at its closest point' : ' at ' + st.k + '% of the ring') : ' · when the last one stops covering'))}${kv('COVERS', z.cover > z.imp ? 'to ' + hms(z.cover) + (glide() ? ' (its glide to the max range, ' + L.rMax.toFixed(1) + ' nm)' : '') + (next ? ', then ' + seatNo(next.seat) : '') : 'its impact only')}${kv('YOUR MARGIN', (L.margin >= 0 ? '+' : '−') + Math.abs(L.margin).toFixed(1) + ' nm ' + (L.margin >= 0 ? 'outside' : 'INSIDE') + ' its ring', L.margin < 0 ? 'wbad' : 'sdok')}${kv('OTHER RINGS', L.rings.length ? 'inside ' + L.rings.map(esc).join(', ') : 'clear', L.rings.length ? 'wbad' : 'sdok')}</div>`
    );
  }
  function coverCard() {
    const z = shotOf(st.sel),
      r = z && P.rows.find(w => w.id == z.id);
    if (!r) return '<h3>Cover</h3><p class="hint">Choose a shot.</p>';
    const g = r.gaps;
    return `<h3>${esc(r.sam.name)} · cover</h3><div class="kv">${kv(esc(r.flight).toUpperCase() + ' INSIDE', hms(r.tin) + ' – ' + hms(r.tout) + ' (' + mmss((r.tout - r.tin) / 1000) + ')')}${r.task ? kv('TASK', 'STPT ' + r.task.n + ' ' + (r.task.loiter ? hms(r.task.t0) + '–' + hms(r.task.t1) : hms(r.task.t0))) : ''}${kv('HARMS', r.shots.length + (r.shots.length ? ': ' + r.shots.map(w => seatNo(w.seat) + ' ' + hms(w.imp)).join(' · ') : ''))}${kv('NOT COVERED', g.length ? g.map(q => hms(q.t0) + '–' + hms(q.t1) + ' (' + mmss((q.t1 - q.t0) / 1000) + (q.ing ? ', ingress' : ', egress') + ')').join('<br>') : 'none', g.length ? 'sdgapt' : 'sdok')}</div>`;
  }
  function problems() {
    const md = mode(),
      Z = P.shots.filter(
        z => !st.skip[z.id] && (z.launch.off || !z.launch.ok || (md == 'pos' && (!z.ref || !z.ref.inArea)))
      );
    const no = P.rows.filter(r => !st.skip[r.id] && r.noHarm);
    return (
      Z.map(z => {
        const L = z.launch,
          f = L.fix,
          area = md == 'pos' && (!z.ref || !z.ref.inArea);
        return `<div class="wcard sdpb"><h3>${esc(seatNo(z.seat))} · ${esc(z.sam.name)}${esc(nth(z))}</h3><div class="kv">${
          L.off || !L.ok
            ? kv(
                'PROBLEM',
                L.off
                  ? 'your flight is not flying at ' + hms(L.t)
                  : 'out of range: ' +
                      L.d.toFixed(1) +
                      ' nm at ' +
                      hms(L.t) +
                      ', the HARM reaches ' +
                      L.rTh.toFixed(1) +
                      ' nm',
                'sdw'
              ) +
              kv(
                'FIX',
                f
                  ? 'launch ' +
                      mmss(f.dt) +
                      (f.dt > 0 ? ' later' : ' earlier') +
                      ' (' +
                      hms(f.t) +
                      ', impact ' +
                      hms(f.impact) +
                      ')'
                  : 'none along your route: move a steerpoint closer to the SAM'
              )
            : ''
        }${area ? kv('POS', (z.ref ? refName(z.ref) + ' is ' + z.ref.d.toFixed(1) + ' nm from the SAM, the ' + sub() + ' area ' + POS_AREA[sub()].toFixed(1) + ' nm' : 'no steerpoint') + '', 'sdw') + kv('FIX', 'press PPT… (the SAM as a steerpoint), choose another steerpoint, PB, or HAD') : ''}</div></div>`;
      }).join('') +
      no
        .map(
          r =>
            `<div class="wcard sdpb"><h3>${esc(r.sam.name)}</h3><div class="kv">${kv('PROBLEM', 'no HARM left for it', 'sdw')}${kv('FIX', 'leave out another SAM or give it a seat with a HARM')}</div></div>`
        )
        .join('')
    );
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
    if (!X || !X.ok || st.view != 'map') return;
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
      c = pal(),
      on = k => !!(deps.layerOn && deps.layerOn(k)),
      ll = p => deps.toLL(p.x, p.y),
      all = [];
    WL.clearLayers();
    const line = (pts, o) => L.polyline(pts.map(ll), { renderer: RN, interactive: false, ...o }).addTo(WL);
    const tag = (p, html, cls = '') =>
      L.marker(ll(p), {
        icon: L.divIcon({ className: 'sdtag ' + cls, html, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
    // the routes: drawn here only when the Map page does not show them (its flight plan and package layers)
    X.flights
      .filter(f => !f.sead && st.prot[f.key] !== false)
      .forEach(f => {
        const w = timed(f.f.wps);
        if (w.length < 2) return;
        if (!on('pk')) {
          line(w, { color: c.halo, weight: 6 });
          line(w, { color: c.mate, weight: 3 });
        }
        if (P.rows.some(r => r.by.includes(f.name))) all.push(...w); // the view: the flights that cross a ring
        const tk = P.task[f.key];
        if (tk && P.rows.some(r => !st.skip[r.id] && r.by.includes(f.name)))
          tag(
            { x: tk.x, y: tk.y },
            `<i class="sdtri"></i><span>${esc(f.name)} · STPT ${tk.n} ${tk.loiter ? 'ON STATION ' + hms(tk.t0).slice(0, 5) + '–' + hms(tk.t1).slice(0, 5) : hms(tk.t0).slice(0, 5)}</span>`
          );
      });
    const mw = timed(X.me.f.wps);
    if (mw.length > 1) {
      if (!on('fp')) {
        line(mw, { color: c.halo, weight: 6 });
        line(mw, { color: c.plan, weight: 3 });
      }
      all.push(...mw);
    }
    const md = mode();
    P.rows.forEach(r => {
      const s = r.sam,
        off = !!st.skip[r.id];
      if (!on('se'))
        L.circle(ll(s), {
          renderer: RN,
          radius: s.rng * 1000,
          color: c.ring,
          weight: 2,
          opacity: off ? 0.35 : 0.9,
          dashArray: '8 6',
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(WL);
      L.circle(ll(s), {
        renderer: RN,
        radius: s.rng * 1000 * (st.k / 100),
        color: c.ring,
        weight: 1.2,
        opacity: off ? 0.3 : 0.8,
        dashArray: '2 5',
        fill: false,
        interactive: false,
      }).addTo(WL);
      tag(
        s,
        `<b class="sdsamt" style="color:${c.ring}">▲</b><span style="color:${c.ring}">${esc(s.name)}</span>`,
        'sdsamm'
      );
      all.push({ x: s.x - s.rng, y: s.y }, { x: s.x + s.rng, y: s.y });
      // POS: the steerpoint and the area the seeker looks at
      if (!off && md == 'pos' && r.ref) {
        L.circle(ll(r.ref), {
          renderer: RN,
          radius: POS_AREA[sub()] * KM_NM * 1000,
          color: c.harm,
          weight: 1.2,
          dashArray: '3 4',
          fill: false,
          opacity: r.ref.inArea ? 0.8 : 0.5,
          interactive: false,
        }).addTo(WL);
      }
    });
    // the shots: yours bright, the others pale; the impact on the protected route
    const Z = P.shots.filter(z => !st.skip[z.id] && !z.launch.off),
      fw = Object.fromEntries(X.flights.map(f => [f.key, timed(f.f.wps)]));
    Z.forEach(z => {
      const Lp = z.launch,
        me = mine(z),
        sel = st.sel == z.key,
        a = me || sel ? 1 : 0.55,
        aim = md == 'pos' && z.ref ? z.ref : z.sam;
      line([Lp, aim], { color: c.halo, weight: me ? 6 : 4, opacity: 0.6 * a });
      line([Lp, aim], { color: c.harm, weight: me ? 3.2 : 2, opacity: a, dashArray: Lp.ok ? '' : '2 6' });
      L.circleMarker(ll(Lp), {
        renderer: RN,
        radius: me || sel ? 7 : 5,
        fillColor: c.harm,
        fillOpacity: a,
        color: sel ? '#fff' : '#000',
        weight: 2,
        interactive: false,
      }).addTo(WL);
      tag(
        Lp,
        `<span class="${me ? 'sdme' : ''}" style="${me ? '' : 'color:' + c.harm + ';opacity:' + (a < 1 ? 0.85 : 1)}">${seatNo(z.seat)} L ${hms(Lp.t).slice(3)} ${md.toUpperCase()}</span>`,
        'sdl'
      );
      const r = P.rows.find(w => w.id == z.id),
        p = r && fw[r.key] ? posAt(fw[r.key], z.imp) : null;
      if (p) tag(p, `<i class="sdimpm"></i>`, 'sdimp');
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
      const set = (k, v) => {
        st[k] = v;
        save();
        return draw(false);
      };
      const so = c('[data-sdsort]');
      if (so) return set('sort', so.dataset.sdsort);
      const mo = c('[data-sdmode]');
      if (mo) return set('mode', mo.dataset.sdmode);
      const sb = c('[data-sdsub]');
      if (sb) return set('sub', sb.dataset.sdsub);
      const vw = c('[data-sdview]');
      if (vw) {
        if (st.view == vw.dataset.sdview) return;
        st.view = vw.dataset.sdview;
        fit = true;
        save();
        return draw(false);
      }
      const rw = c('[data-sdrow]');
      if (rw) return set('sel', rw.dataset.sdrow);
      const sm = c('[data-sdsam]');
      if (sm) {
        const z = P.shots.find(w => w.id == sm.dataset.sdsam);
        if (z) return set('sel', z.key);
        return;
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
      if (d.sdprot) {
        st.prot[d.sdprot] = t.checked;
        fit = true;
      } else if (d.sdskip) {
        if (t.checked) delete st.skip[d.sdskip];
        else st.skip[d.sdskip] = true;
      } else if (d.sdseat) st.seat[d.sdseat] = +t.value;
      else if (d.sdref) st.ref[d.sdref] = +t.value;
      else if (d.sdk != null) st.k = +t.value;
      else return;
      save();
      draw(false);
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
        paint();
      };
      po.textContent = LAB[deps.planMode ? deps.planMode() : 0];
    }
  }
  const myShots = () => (P ? P.shots.filter(z => !st.skip[z.id] && (X.seat == null || z.seat === X.seat)) : []);
  // HARM tables: nothing is written without asking; a threat already in a table is fine where it is
  async function tables() {
    const T = deps.dtc.harm();
    if (!T) return deps.toast('Open a DTC with a HARM section first: the tables are in it.', true);
    const R = [
        ...new Map(
          myShots()
            .filter(z => z.sam.code != null)
            .map(z => [z.sam.code, z])
        ).values(),
      ],
      miss = R.filter(z => !inTables(z.sam.code).length);
    if (!R.length) return deps.toast('No threat with a HARM code for your seat.', true);
    if (!miss.length)
      return deps.toast(
        'All your threats are in the HARM tables: ' + R.map(z => z.sam.name + ' ' + tabTxt(z.sam.code)).join(', ') + '.'
      );
    const free = [];
    T.forEach((row, t) => row.forEach((c, n) => (!c || isNaN(c)) && free.push([t, n])));
    const plan = miss.map((z, i) => ({ z, at: free[i] || null }));
    const need = plan.filter(q => !q.at);
    let txt =
      'Your threats not in the HARM tables: ' +
      miss.map(z => z.sam.name + ' (' + z.sam.code + ')').join(', ') +
      '.\n\n' +
      plan
        .filter(q => q.at)
        .map(q => q.z.sam.name + ' → table ' + (q.at[0] + 1) + ', slot ' + (q.at[1] + 1) + ' (free)')
        .join('\n');
    // no free slot: the last slots of the tables are offered, the threats that are not of this mission first
    if (need.length) {
      const used = new Set(P.shots.map(z => z.sam.code)),
        rep = [];
      for (let t = 2; t >= 0 && rep.length < need.length; t--)
        for (let n = 4; n >= 0 && rep.length < need.length; n--)
          if (!used.has(T[t][n]) && !rep.some(q => q[0] == t && q[1] == n)) rep.push([t, n]);
      need.forEach((q, i) => (q.at = rep[i] || null));
      txt +=
        (txt.endsWith('\n\n') ? '' : '\n') +
        need
          .filter(q => q.at)
          .map(q => {
            const o = threatOf(T[q.at[0]][q.at[1]]);
            return (
              q.z.sam.name +
              ' → table ' +
              (q.at[0] + 1) +
              ', slot ' +
              (q.at[1] + 1) +
              ' (replaces ' +
              (o ? o[1] : T[q.at[0]][q.at[1]]) +
              ')'
            );
          })
          .join('\n');
    }
    if (!(await deps.confirm(txt + '\n\nWrite them into the HARM tables of the DTC?'))) return;
    plan.filter(q => q.at).forEach(q => deps.dtc.setHarm(q.at[0], q.at[1], q.z.sam.code));
    deps.toast(plan.filter(q => q.at).length + ' threats written into the HARM tables.');
    draw(false);
  }
  async function ppt() {
    const R = [...new Map(myShots().map(z => [z.id, z])).values()];
    if (!R.length) return deps.toast('No threat for your seat.', true);
    const m = await deps.ppt(R.map(z => ({ x: z.sam.x, y: z.sam.y, rng: z.sam.rng, name: z.sam.name })));
    if (m) deps.toast(m);
    draw(false);
  }

  // ---- the Kneeboard cards: with the map or with the scheme
  function cardData() {
    const Z = P.shots.filter(z => !st.skip[z.id]),
      md = mode();
    return {
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      pkg: 'PACKAGE ' + X.me.pkgNo + (X.me.tot ? ' · TOT ' + X.me.tot : ''),
      seat: X.seat,
      seatName: X.seat != null ? seatName(X.seat) : '',
      k: st.k,
      mode: md.toUpperCase() + (md == 'pos' ? ' ' + sub() : ''),
      prot: X.flights
        .filter(f => !f.sead && st.prot[f.key] !== false && P.rows.some(r => r.by.includes(f.name)))
        .map(f => f.name),
      shots: Z.map(z => ({
        seat: z.seat,
        mine: mine(z),
        seatNo: seatNo(z.seat),
        sam: z.sam.name + nth(z),
        code: z.sam.code,
        tab: tabTxt(z.sam.code),
        ref: md == 'pos' ? refName(z.ref) : 'AT THE SAM',
        tl: z.launch.off ? '—' : hms(z.launch.t),
        imp: hms(z.imp),
        at: z.launch.off ? '' : z.launch.from.toFixed(1) + ' NM AFTER STPT ' + z.launch.leg,
        brg: z.launch.off ? '' : h3(z.launch.brg),
        d: z.launch.off ? 0 : z.launch.d,
        tof: z.launch.off ? 0 : z.launch.tof,
        ok: !z.launch.off && z.launch.ok && !(md == 'pos' && (!z.ref || !z.ref.inArea)),
        why: z.launch.off
          ? 'NOT FLYING'
          : !z.launch.ok
            ? 'OUT OF RANGE'
            : md == 'pos' && (!z.ref || !z.ref.inArea)
              ? 'CHECK THE STPT'
              : '',
      })),
      gaps: P.rows
        .filter(r => !st.skip[r.id] && r.gaps.length)
        .map(r => r.sam.name + ' ' + r.gaps.map(g => hms(g.t0).slice(0, 5) + '–' + hms(g.t1).slice(0, 5)).join(', ')),
      sm: schemeModel(),
      ev: events().map(e => ({ t: hms(e.t), c: e.c, s: e.s })),
      px: null,
    };
  }
  // the map for the card: the lent map fitted to the plan, a picture of it, the points in its pixels
  async function snapPlan(AR = 1520 / 900) {
    if (!deps.snap) return null;
    if (!M) {
      if (st.view != 'map') return null;
      await ensureMap();
      if (!M) return null;
      paint();
    }
    const { L, map, WL } = M,
      ll = p => deps.toLL(p.x, p.y),
      prot = X.flights.filter(f => !f.sead && st.prot[f.key] !== false && P.rows.some(r => r.by.includes(f.name))),
      mw = timed(X.me.f.wps),
      R = P.rows.filter(r => !st.skip[r.id]),
      Z = P.shots.filter(z => !st.skip[z.id] && !z.launch.off),
      pts = [
        ...prot.flatMap(f => timed(f.f.wps)),
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
      const shotP = await deps.snap(2);
      if (!shotP) return null;
      const k = shotP.canvas.width / cw,
        px = p => {
          const q = map.latLngToContainerPoint(ll(p));
          return [(q.x - ox) * k, (q.y - oy) * k];
        },
        kmPx = Math.hypot(...[0, 1].map(i => px({ x: pts[0].x + 1, y: pts[0].y })[i] - px(pts[0])[i])),
        crop = document.createElement('canvas'),
        fw = Object.fromEntries(X.flights.map(f => [f.key, timed(f.f.wps)])),
        md = mode();
      crop.width = Math.round(bw * k);
      crop.height = Math.round(bh * k);
      crop.getContext('2d').drawImage(shotP.canvas, -ox * k, -oy * k);
      return {
        img: crop,
        coast: shotP.coast,
        pal: pal(),
        prot: prot.map(f => fw[f.key].map(px)),
        me: mw.map(px),
        tasks: prot.filter(f => P.task[f.key]).map(f => ({ p: px(P.task[f.key]), n: P.task[f.key].n, name: f.name })),
        sams: R.map(r => ({ c: px(r.sam), r: r.sam.rng * kmPx, name: r.sam.name })),
        shots: Z.map(z => {
          const r = P.rows.find(w => w.id == z.id),
            ip = r && fw[r.key] ? posAt(fw[r.key], z.imp) : null;
          return {
            l: px(z.launch),
            a: px(md == 'pos' && z.ref ? z.ref : z.sam),
            imp: ip ? px(ip) : null,
            mine: mine(z),
            ok: z.launch.ok,
            t: seatNo(z.seat) + ' L ' + hms(z.launch.t).slice(3),
          };
        }),
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
  const KINDS = [
    ['map', 'With the map'],
    ['sch', 'With the scheme'],
  ];
  function drawCard(D, kind) {
    const c = document.createElement('canvas');
    c.width = SDC_W;
    c.height = SDC_H;
    drawSeadCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D, kind);
    return c;
  }
  async function addCard(btn) {
    if (!deps.kbAdd || !P) return;
    btn.disabled = true;
    let D;
    try {
      D = cardData();
      if (!D.shots.length) throw new Error('no shot to put on the card');
      const B = cardBox(D);
      D.px = await snapPlan(B.w / B.h);
    } catch (e) {
      btn.disabled = false;
      return deps.toast('SEAD card: ' + ((e && e.message) || e), true);
    }
    btn.disabled = false;
    const C = Object.fromEntries(KINDS.map(([k]) => [k, drawCard(D, k)])),
      on = {};
    let pre = ['map'];
    try {
      const v = JSON.parse(localStorage.getItem('seadcardkinds') || 'null');
      if (Array.isArray(v) && v.length) pre = v.filter(k => C[k]);
    } catch (e) {
      /* none */
    }
    pre.forEach(k => (on[k] = true));
    const d = document.createElement('dialog');
    d.className = 'tgdlg';
    d.innerHTML = `<h3>Add SEAD cards to the Kneeboard</h3><p class="hint">Both have your shots and the table of the flight; one has the map, the other the scheme and the events. The cards go into the free slots of the Kneeboard; when there is no free slot, among the unused cards.</p><div class="tgcards"></div><div class="tgbar"><span class="hint tgn"></span><span class="tgsp"></span><button type="button" class="btn g" data-a="no">Cancel</button><button type="button" class="btn" data-a="ok">Add</button></div>`;
    document.body.append(d);
    const cnt = () => {
      const n = KINDS.filter(([k]) => on[k]).length,
        b = d.querySelector('[data-a=ok]');
      b.textContent = n ? `Add ${n} card${n > 1 ? 's' : ''}` : 'Add';
      b.classList.toggle('nil', !n);
    };
    KINDS.forEach(([k, l]) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'tgcard' + (on[k] ? ' on' : '');
      it.dataset.kind = k;
      const th = document.createElement('canvas');
      th.width = 300;
      th.height = 450;
      th.getContext('2d').drawImage(C[k], 0, 0, 300, 450);
      it.append(th);
      const sp = document.createElement('span');
      sp.textContent = l;
      it.append(sp);
      it.onclick = () => {
        on[k] = !on[k];
        it.classList.toggle('on', on[k]);
        cnt();
      };
      d.querySelector('.tgcards').append(it);
    });
    cnt();
    const close = () => {
      d.close();
      setTimeout(() => d.remove(), 200);
    };
    d.querySelector('[data-a=no]').onclick = close;
    d.addEventListener('cancel', e => {
      e.preventDefault();
      close();
    });
    d.querySelector('[data-a=ok]').onclick = async () => {
      const L = KINDS.filter(([k]) => on[k]);
      if (!L.length) return;
      try {
        localStorage.setItem('seadcardkinds', JSON.stringify(L.map(x => x[0])));
      } catch (e) {
        /* none */
      }
      close();
      const out = [];
      for (const [k] of L) {
        const blob = await new Promise(r => C[k].toBlob(r, 'image/png'));
        if (!blob) continue;
        const at = await deps.kbAdd(blob, 'SEAD · ' + X.me.name + (k == 'sch' ? ' · scheme' : ''));
        out.push(at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards');
      }
      deps.toast('SEAD card' + (out.length > 1 ? 's' : '') + ' added to the Kneeboard: ' + out.join('; ') + '.');
    };
    d.showModal();
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
    events: () => (P ? events() : []),
    card: () => (P ? cardData() : null),
    cardCanvas: async kind => {
      if (!P) return null;
      const D = cardData(),
        B = cardBox(D);
      if (kind != 'sch') D.px = await snapPlan(B.w / B.h);
      return drawCard(D, kind || 'map');
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
