// Performance page: turn and energy (Ps), cruise and range, take-off and landing, from the BMS aircraft tables (bmsdata/acperf.js, maths in airperf.js).
// deps: {root, esc, aircraft: {list() -> [names], get(name) -> Promise<perf data | null>}, loadout() -> {ac, gw, fuel, drag, label} | null, runway?() }
import * as P from './airperf.js';
import { fuelPlan, climbAltitude } from './fuelplan.js';

const MODES = [['field', 'Take-off & landing'], ['cruise', 'Cruise & range'], ['turn', 'Turn & energy'], ['plan', 'Fuel plan']];
const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}).replace(/,/g, ' ');
const SL = {
  fuel: ['Fuel', ' lb', 0, 40000, 100], stores: ['Stores', ' lb', 0, 20000, 100], di: ['Drag index', '', 0, 300, 1], isa: ['Temperature', ' °C ISA', -40, 40, 1],
  alt: ['Altitude', ' ft', 0, 55000, 500], g: ['Ps at', ' g', 1, 9, .5], reserve: ['Reserve', ' lb', 0, 8000, 100], mach: ['Mach', '', .3, 2, .01],
  lres: ['Landing reserve', ' lb', 500, 4000, 100], jok: ['Joker above bingo', ' lb', 0, 2000, 100], elev: ['Field elevation', ' ft', -500, 9000, 100], hw: ['Headwind', ' kt', -20, 40, 1], slope: ['Slope', ' %', -3, 3, .1], lfuel: ['Landing fuel', ' lb', 0, 20000, 100]};
const DEF = {mode: 'turn', ac: 'F-16CM-50', fuel: 7162, stores: 0, di: 0, isa: 0, alt: 15000, g: 1, ps: 'ab', reserve: 1500, mach: 0, elev: 0, hw: 0, slope: 0, power: 'ab', lfuel: 2500, rwy: 0, lres: 1500, jok: 1000};

export function createPerfPage(deps) {
  const esc = deps.esc, KEY = 'pfstate1';
  let st = {...DEF};
  try { const o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o) st = {...st, ...o}; } catch (e) { /* none */ }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* none */ } };
  let note = '', ac = null, loading = '', names = [], tried = false, ready = false, lastSig = '', noData = '';   // noData: the aircraft that has no file (do not ask again)

  // Values of the flight chosen in the Datacard (field elevation, headwind on its runway, temperature against ISA): they drive the page until a slider is moved by hand
  const ov = new Set(), AUTO = ['elev', 'hw', 'isa'];
  const env = () => deps.env && deps.env.get() || null;
  const isAuto = f => { const e = AUTO.includes(f) && env(); return !!(e && e[f] != null && !ov.has(f)); };
  const V = f => { if (!isAuto(f)) return st[f]; const r = SL[f] || [0, 0, -1e9, 1e9]; return Math.min(r[3], Math.max(r[2], Math.round(env()[f]))); };
  const slider = f => { const [l, u, a, b, s] = SL[f], v = f == 'mach' && !st.mach ? '' : V(f); return `<div class="slr"><label>${l}${isAuto(f) ? ' <small class="hint" title="From the flight chosen in the Datacard: move the slider to set your own value">auto</small>' : ''}</label><input type="range" min="${a}" max="${b}" step="${s}" value="${v === '' ? .8 : v}" data-sl="${f}"><em data-em="${f}">${fmtV(f, v === '' ? bestMach() : v)}${u}</em></div>`; };
  const fmtV = (f, v) => f == 'mach' ? (+v).toFixed(2) : f == 'g' ? (+v).toFixed(1) : f == 'slope' ? (+v).toFixed(1) : fmt(v);
  const seg = (f, opts, c) => `<span class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(c) === String(v) ? 'on' : ''}" data-set="${f}" data-v="${v}">${l}</button>`).join('')}</span>`;
  const kv = (a, b, bad) => `<span>${a}</span><b${bad ? ' class="wbad"' : ''}>${b}</b>`;
  const tile = (a, b, s) => `<div class="tile"><span>${a}</span><b>${b}</b>${s ? `<small class="hint">${s}</small>` : ''}</div>`;
  const rwMan = () => { const r = deps.runway && deps.runway.get(); return r ? r.man || 0 : st.rwy || 0; }, rwAuto = () => { const r = deps.runway && deps.runway.get(); return r && r.auto || 0; };
  const rwHint = () => { const r = deps.runway && deps.runway.get(); if (!r) return 'to compare'; return esc(r.name) + (r.man ? ' · typed by you (empty = the game files)' : r.auto ? ' · from the game files (' + fmt(r.auto) + ' × ' + fmt(r.wid) + ' ft), type a length to override' : ' · no size from the game files (' + (r.info || '?') + ')') + ' · for the refusal speed'; };
  const runwayFt = () => { const r = deps.runway && deps.runway.get(); return r ? r.ft || 0 : st.rwy || 0; };
  const envNote = () => { const e = env(); if (!e) return ''; const w = e.wind ? ' · wind ' + String(Math.round(e.wind.hdg) % 360 || 360).padStart(3, '0') + '/' + Math.round(e.wind.spd) + ' kt on runway ' + esc(e.rwy || '?') : ' · no weather for this flight'; return `<p class="hint wnote" data-envnote>Auto: ${esc(e.name)}${w}${ov.size ? ' · <a href="#" data-envreset>use the flight values again</a>' : ''}</p>`; };
  const empty = () => ac ? ac.af.emptyLb : 0;
  const gw = () => empty() + st.fuel + st.stores;
  const base = () => ({W: gw(), dIsa: V('isa'), di: st.di});
  let bestM = .8; const bestMach = () => bestM;

  async function pick(name, reset) {
    loading = name; draw(false);
    let d = null; try { d = await deps.aircraft.get(name); } catch (e) { d = null; }
    if (loading != name) return; loading = '';
    if (d) { ac = d; st.ac = name; noData = ''; if (reset) { st.fuel = d.af.fuelLb; st.stores = 0; st.di = 0; } } else { ac = null; noData = name; }
    save(); draw(false);
  }
  function fromDatacard() {
    const l = deps.loadout && deps.loadout(); if (!l) return false;
    ov.clear(); note = ''; let cand = l.ac || ''; while (cand && !names.includes(cand)) cand = cand.includes(' ') ? cand.replace(/\s+\S+$/, '') : ''; if (cand) { st.ac = cand; if (cand != l.ac) note = 'No file for ' + l.ac + ': using ' + cand + '.'; } else if (l.ac) note = 'No performance data for ' + l.ac + ': showing ' + st.ac + '.';
    const run = () => { const e = ac ? ac.af.emptyLb : 0; st.fuel = l.fuel ? Math.round(l.fuel) : (ac ? ac.af.fuelLb : st.fuel); st.stores = l.gw && e ? Math.max(0, Math.round(l.gw - e - st.fuel)) : 0; st.di = Math.max(0, Math.round(l.drag || 0)); save(); draw(false); };
    if (!ac || ac.name != st.ac) { loading = st.ac; deps.aircraft.get(st.ac).then(d => { loading = ''; if (d) ac = d; run(); }); } else run();
    return true;
  }

  // ---- svg helpers
  const nice = (a, b, n = 6) => { const r = (b - a) / n, p = 10 ** Math.floor(Math.log10(r || 1)), m = r / p, s = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p, o = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) o.push(+v.toFixed(6)); return o; };
  function chart({series, x0, x1, y0, y1, xl, yl, marks = [], w = 560, h = 260, vl = []}) {
    const L = 48, R = 12, T = 12, B = 34, px = x => L + (x - x0) / (x1 - x0) * (w - L - R), py = y => h - B - (y - y0) / (y1 - y0) * (h - T - B);
    let g = ''; nice(x0, x1).forEach(v => { g += `<path d="M${px(v).toFixed(1)} ${T}V${h - B}" stroke="#1d2631"/><text x="${px(v).toFixed(1)}" y="${h - B + 14}" text-anchor="middle">${fmt(v, x1 - x0 < 5 ? 1 : 0)}</text>`; });
    nice(y0, y1, 5).forEach(v => { g += `<path d="M${L} ${py(v).toFixed(1)}H${w - R}" stroke="#1d2631"/><text x="${L - 6}" y="${(py(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v, y1 - y0 < 5 ? 1 : 0)}</text>`; });
    vl.forEach(([x, c, t]) => { g += `<path d="M${px(x).toFixed(1)} ${T}V${h - B}" stroke="${c}" stroke-dasharray="4 4"/><text x="${(px(x) + 4).toFixed(1)}" y="${T + 10}" fill="${c}">${t}</text>`; });
    const lines = series.map(s => { const pts = s.pts.filter(p => p[1] != null && p[0] >= x0 - 1e-9 && p[0] <= x1 + 1e-9); return pts.length ? `<path d="M${pts.map(p => px(p[0]).toFixed(1) + ' ' + py(Math.min(y1, Math.max(y0, p[1]))).toFixed(1)).join('L')}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.2}"${s.d ? ` stroke-dasharray="${s.d}"` : ''}/>` : ''; }).join('');
    const mk = marks.map(m => `<circle cx="${px(m.x).toFixed(1)}" cy="${py(m.y).toFixed(1)}" r="4.5" fill="${m.c}" stroke="#0f1419" stroke-width="1.5"/>${m.t ? `<text x="${(px(m.x) + 7).toFixed(1)}" y="${(py(m.y) - 7).toFixed(1)}" fill="${m.c}">${m.t}</text>` : ''}`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="wpv" style="width:100%;height:auto" role="img" aria-label="${esc(yl)} against ${esc(xl)}"><rect width="${w}" height="${h}" rx="6" fill="#0f1419"/><g fill="#9aa8b8" font-size="10" font-family="system-ui,sans-serif">${g}<text x="${(L + w - R) / 2}" y="${h - 4}" text-anchor="middle">${esc(xl)}</text><text transform="translate(11 ${(T + h - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>${lines}${mk}</g></svg>`;
  }
  const leg = a => `<div class="wleg">${a.map(([c, t, d]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`;

  // ---- tabs
  function turnTab() {
    const o = {...base(), alt: st.alt}, tc = P.turnCurve(ac, o), rows = tc.rows; if (!rows.length) return {tiles: '', body: '<p class="hint">No flight envelope at this altitude and weight.</p>'};
    const xs = [Math.min(...rows.map(r => r.cas)), Math.max(...rows.map(r => r.cas))], xr = [Math.floor(xs[0] / 50) * 50, Math.ceil(xs[1] / 50) * 50];
    const ymax = a => Math.max(1, ...rows.map(r => Math.max(r[a[0]] || 0, r[a[1]] || 0, r[a[2]] || 0)));
    const S = k => rows.map(r => [r.cas, r[k]]), c = tc.corner, cv = [[ac.af.cornerKt, '#6b7a8c', 'BMS corner ' + ac.af.cornerKt]];
    const wmax = Math.ceil(ymax(['wI', 'wM', 'wA']) / 5) * 5, gmax = Math.ceil(ymax(['gI', 'gM', 'gA']));
    const best = k => rows.reduce((b, r) => (r[k] || 0) > (b[k] || 0) ? r : b, rows[0]), sa = best('wA'), sm = best('wM'), nz = r => r.gM == null ? '—' : fmt(r.gM, 1);
    const tiles = `<div class="wpt">${tile('Corner speed', fmt(c.cas) + ' KCAS', fmt(c.gI, 1) + ' g · ' + fmt(c.wI, 1) + '°/s')}${tile('Best sustained, MIL', sm.wM == null ? 'none' : fmt(sm.wM, 1) + '°/s', sm.wM == null ? 'no level turn' : fmt(sm.cas) + ' KCAS · ' + fmt(sm.gM, 1) + ' g')}${tile('Best sustained, AB', sa.wA == null ? 'none' : fmt(sa.wA, 1) + '°/s', sa.wA == null ? 'no level turn' : fmt(sa.cas) + ' KCAS · ' + fmt(sa.gA, 1) + ' g')}</div>`;
    const ser = k => [{c: '#fbbf24', pts: S('w' + k[0])}, {c: '#38bdf8', pts: S('w' + k[1])}, {c: '#f472b6', pts: S('w' + k[2])}];
    const g1 = chart({series: ser(['I', 'M', 'A']), x0: xr[0], x1: xr[1], y0: 0, y1: wmax, xl: 'KCAS (kt)', yl: 'Turn rate (°/s)', vl: cv, marks: [{x: c.cas, y: c.wI, c: '#fbbf24', t: 'corner'}]});
    const g2 = chart({series: [{c: '#fbbf24', pts: S('gI')}, {c: '#38bdf8', pts: S('gM')}, {c: '#f472b6', pts: S('gA')}], x0: xr[0], x1: xr[1], y0: 0, y1: gmax, xl: 'KCAS (kt)', yl: 'Load factor (g)', vl: cv});
    const lg = leg([['#fbbf24', 'Instantaneous (lift, alpha and g limit)'], ['#38bdf8', 'Sustained, MIL'], ['#f472b6', 'Sustained, AFTERBURNER']]);
    const grid = P.psGrid(ac, {...base(), n: st.g}, st.ps), z = grid.ps.flat().filter(v => v != null), vmax = Math.max(100, Math.min(900, Math.max(...z))), vmin = Math.min(-300, Math.min(...z));
    const W = 560, H = 300, L = 48, Rm = 12, T = 8, B = 34, cw = (W - L - Rm) / grid.machs.length, ch = (H - T - B) / grid.alts.length, col = v => v == null ? '#171d26' : v < 0 ? `rgb(${Math.round(70 + 150 * Math.min(1, -v / -vmin))},45,55)` : `rgb(${Math.round(30 + 20 * Math.min(1, v / vmax))},${Math.round(70 + 120 * Math.min(1, v / vmax))},${Math.round(110 + 100 * Math.min(1, v / vmax))})`;
    let cells = ''; grid.alts.forEach((h, j) => grid.machs.forEach((m, i) => { const v = grid.ps[j][i]; cells += `<rect x="${(L + i * cw).toFixed(1)}" y="${(H - B - (j + 1) * ch).toFixed(1)}" width="${(cw + .4).toFixed(1)}" height="${(ch + .4).toFixed(1)}" fill="${col(v)}"><title>Mach ${m.toFixed(2)} · ${fmt(h)} ft · ${v == null ? 'no level flight' : 'Ps ' + fmt(v) + ' ft/s'}</title></rect>`; }));
    let ax = ''; for (let m = .4; m <= 2.3; m += .2) ax += `<text x="${(L + (m - .2) / .05 * cw).toFixed(1)}" y="${H - B + 14}" text-anchor="middle">${m.toFixed(1)}</text>`; for (let h = 0; h <= 60000; h += 10000) ax += `<text x="${L - 6}" y="${(H - B - h / 2500 * ch + 3).toFixed(1)}" text-anchor="end">${h / 1000}k</text>`;
    const ay = H - B - st.alt / 2500 * ch, hline = `<path d="M${L} ${ay.toFixed(1)}H${W - Rm}" stroke="#fbbf24" stroke-dasharray="4 4"/>`;
    const ps = `<svg viewBox="0 0 ${W} ${H}" class="wpv" style="width:100%;height:auto" role="img" aria-label="Specific excess power by Mach and altitude"><rect width="${W}" height="${H}" rx="6" fill="#0f1419"/>${cells}${hline}<g fill="#9aa8b8" font-size="10" font-family="system-ui,sans-serif">${ax}<text x="${(L + W - Rm) / 2}" y="${H - 4}" text-anchor="middle">Mach</text><text transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Altitude (ft)</text></g></svg>`;
    const body = `<div class="wcard"><h3>Turn at ${fmt(st.alt)} ft<span class="wtip" title="Instantaneous: the best g the lift (CL at the alpha limit), the structural g and the flight control limit allow. Sustained: the most g for which the thrust equals the drag, so the speed does not fall. The grey line is the corner speed written in the BMS file.">ⓘ</span></h3>${g1}${lg}${g2}</div>
      <div class="wcard"><h3>Specific excess power · ${st.ps == 'ab' ? 'afterburner' : 'military'} · ${fmtV('g', st.g)} g<span class="wtip" title="Ps = (thrust − drag) × speed / weight, in ft/s, at the load factor chosen. Blue: the aircraft can accelerate or climb; red: it loses energy; the dark area has no level flight at that load factor. The dotted line is the altitude chosen above.">ⓘ</span></h3>${ps}
      <div class="wleg"><span><i style="background:rgb(50,190,210)"></i>Ps &gt; 0 (up to ${fmt(vmax)} ft/s)</span><span><i style="background:rgb(150,45,55)"></i>Ps &lt; 0</span><span><i style="background:#171d26"></i>no level flight</span></div></div>`;
    return {tiles, body};
  }
  function cruiseTab() {
    const o = {...base(), alt: st.alt}, cc = P.cruiseCurve(ac, o), rows = cc.rows;
    if (!rows.length) return {tiles: '', body: '<p class="hint">Level flight at this altitude and weight is not possible in military power.</p>'};
    bestM = cc.range ? cc.range.M : rows[0].M;
    const M = st.mach || +bestM.toFixed(2), usable = Math.max(0, st.fuel - st.reserve), here = rows.reduce((b, r) => Math.abs(r.M - M) < Math.abs(b.M - M) ? r : b, rows[0]);
    const leg1 = P.cruiseLeg(ac, {...o, M, fuel: usable}), en = cc.endur ? P.cruiseLeg(ac, {...o, M: cc.endur.M, fuel: usable}) : null;
    const tiles = `<div class="wpt">${tile('Best range', cc.range ? 'Mach ' + cc.range.M.toFixed(2) : '—', cc.range ? fmt(cc.range.kt) + ' KTAS · ' + fmt(cc.range.ff) + ' lb/h · ' + (cc.range.sr * 1000).toFixed(0) + ' nm per 1000 lb' : '')}${tile('Range at Mach ' + M.toFixed(2), fmt(leg1.nm) + ' nm', fmt(usable) + ' lb usable · ' + leg1.hours.toFixed(1) + ' h · ' + fmt(here.ff) + ' lb/h')}${tile('Best endurance', en ? en.hours.toFixed(1) + ' h' : '—', cc.endur ? 'Mach ' + cc.endur.M.toFixed(2) + ' · ' + fmt(cc.endur.ff) + ' lb/h' : '')}</div>`;
    const alts = [...new Set([10000, 20000, 30000, 40000, st.alt])].sort((a, b) => a - b), col = {10000: '#6b7a8c', 20000: '#8aa0b8', 30000: '#7dd3a8', 40000: '#a78bfa'};
    const ser = alts.map(h => ({c: h == st.alt ? '#fbbf24' : (col[h] || '#9aa8b8'), w: h == st.alt ? 3 : 1.6, pts: P.cruiseCurve(ac, {...base(), alt: h}).rows.filter(r => r.mode != 'ab').map(r => [r.M, r.sr * 1000])}));
    const xmx = Math.min(2.2, Math.max(1, Math.ceil(Math.max(...ser.flatMap(s => s.pts.map(p => p[0]))) * 10) / 10 + .1)), ymax = Math.max(10, ...ser.flatMap(s => s.pts.map(p => p[1]))), g1 = chart({series: ser, x0: .3, x1: xmx, y0: 0, y1: Math.ceil(ymax / 10) * 10, xl: 'Mach', yl: 'Range (nm per 1000 lb)', marks: cc.range ? [{x: cc.range.M, y: cc.range.sr * 1000, c: '#fbbf24', t: 'best'}] : [], vl: [[M, '#6b7a8c', 'now']]});
    const fm = Math.max(...rows.filter(r => r.mode != 'ab').map(r => r.ff));
    const g2 = chart({series: [{c: '#38bdf8', pts: rows.filter(r => r.mode != 'ab').map(r => [r.M, r.ff])}], x0: .3, x1: xmx, y0: 0, y1: Math.ceil(fm / 1000) * 1000, xl: 'Mach', yl: 'Fuel flow (lb/h)', marks: cc.endur ? [{x: cc.endur.M, y: cc.endur.ff, c: '#fbbf24', t: 'endurance'}] : []});
    const tb = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000].map(h => { const c2 = P.cruiseCurve(ac, {...base(), alt: h}), r = c2.range; return r ? `<tr><td>${fmt(h)}</td><td>${r.M.toFixed(2)}</td><td>${fmt(r.cas)}</td><td>${fmt(r.kt)}</td><td>${fmt(r.ff)}</td><td>${(r.sr * 1000).toFixed(0)}</td><td>${c2.endur ? c2.endur.M.toFixed(2) + ' · ' + fmt(c2.endur.ff) : ''}</td></tr>` : `<tr><td>${fmt(h)}</td><td colspan="6" class="hint">no level flight in military power</td></tr>`; }).join('');
    const body = `<div class="wcard"><h3>Specific range<span class="wtip" title="Distance flown per pound of fuel in level flight at 1 g: the thrust needed equals the drag, the fuel flow comes from the BMS tables between idle, military and afterburner. Only the part without afterburner is drawn. The curve of the altitude chosen is yellow.">ⓘ</span></h3>${g1}${leg(alts.map(h => [h == st.alt ? '#fbbf24' : (col[h] || '#9aa8b8'), fmt(h) + ' ft']))}</div>
      <div class="wcard"><h3>Fuel flow at ${fmt(st.alt)} ft</h3>${g2}</div>
      <div class="wcard"><h3>Best range by altitude · ${fmt(gw())} lb</h3><div class="wtbl"><table><tr><th>Alt (ft)</th><th>Mach</th><th>KCAS</th><th>KTAS</th><th>lb/h</th><th>nm/1000 lb</th><th>Best endurance</th></tr>${tb}</table></div></div>`;
    return {tiles, body};
  }
  function fieldTab() {
    const hw = V('hw'), o = {W: gw(), elev: V('elev'), dIsa: V('isa'), hw, slope: st.slope / 100, power: st.power, di: st.di}, t = P.takeoff(ac, o);
    const wl = empty() + st.stores + st.lfuel, l = P.landing(ac, {W: wl, elev: V('elev'), dIsa: V('isa'), hw, slope: st.slope / 100, di: st.di}), rw = runwayFt();
    const ok = (len, need) => rw ? (need <= rw ? ' ✓' : ' ✗') : '';
    const rf = P.refusal(ac, {...o, rwy: rw}), rpm = P.milRpm(ac);
    const tTiles = t.stuck ? '<p class="wperr">The thrust is not enough to reach lift-off speed with this weight, drag and power.</p>' : `<div class="wpt">${tile('Rotate / lift-off', fmt(t.vr) + ' / ' + fmt(t.vlof) + ' kt', 'at ' + fmt(t.aLO) + '° of pitch')}${tile('Ground roll', fmt(t.roll) + ' ft' + ok(rw, t.roll), fmt(t.time) + ' s')}${tile('To 50 ft', fmt(t.to50) + ' ft' + ok(rw, t.to50), 'climb ' + fmt(t.gamma) + '°')}${tile('Abort at rotation', fmt(t.abort) + ' ft' + ok(rw, t.abort), 'full brakes, idle')}${tile('Refusal speed', rf == null ? '—' : rf >= 224.5 ? '225+ kt' : fmt(rf) + ' kt', rf == null ? 'set the runway length' : 'stop on ' + fmt(rw) + ' ft')}${tile('Military power', rpm == null ? '—' : rpm + ' %', 'max rpm: the lead sets 2% less')}</div>`;
    const lTiles = `<div class="wpt">${tile('Approach / touchdown', fmt(l.vapp) + ' / ' + fmt(l.vtd) + ' kt', 'at ' + fmt(l.aApp, 1) + '° · ' + fmt(wl) + ' lb')}${tile('Roll, brakes', fmt(l.rollBrakes) + ' ft' + ok(rw, l.rollBrakes), 'from touchdown')}${tile('Roll, aerobrake + brakes', fmt(l.rollAero) + ' ft' + ok(rw, l.rollAero), 'nose up to 100 kt, speed brake')}${tile('Roll, no brakes', fmt(l.rollNoBrakes) + ' ft' + ok(rw, l.rollNoBrakes), 'rolling friction only')}</div>`;
    return {tiles: '', body: `<div class="wcard"><h3>Take-off · ${fmt(gw())} lb · ${st.power == 'ab' ? 'afterburner' : 'military'}</h3>${tTiles}<p class="hint wnote">Model: thrust and drag from the BMS tables with the gear down, wheel friction ${ac.ground.roll}, rotation at the optimum pitch of the file; the distance to 50 ft assumes a constant climb. A guide, not a figure of the simulator.</p></div>
      <div class="wcard"><h3>Landing · ${fmt(wl)} lb</h3>${lTiles}<p class="hint wnote">Approach at half of the maximum alpha, touchdown at 97% of the approach speed, two seconds of free roll, then brakes (friction ${ac.ground.brake}). Landing weight = empty + stores + landing fuel.</p></div>`};
  }

  function planTab() {
    const fp = deps.flightPlan && deps.flightPlan();
    if (!fp || !fp.wps || fp.wps.length < 2) return {tiles: '', body: '<p class="hint">Pick a flight in the Datacard: the fuel plan is calculated on its steerpoints.</p>'};
    const o = {...base(), empty: empty(), stores: st.stores, reserve: st.lres, jokerMargin: st.jok, loaded: st.fuel, wind: deps.wind}, pl = fuelPlan(ac, fp.wps, o), alt = climbAltitude(fp.wps), cl = P.climbSchedule(ac, {W: gw(), dIsa: V('isa'), di: st.di, to: alt});
    const bad = pl.short > 0, hm = s => { s = Math.round(s); return s <= 0 ? '' : s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' h' : Math.round(s / 60) + ' min'; };
    const tiles = `<div class="wpt">${tile('Fuel at take-off', fmt(pl.toFuel) + ' lb', bad ? 'short by ' + fmt(pl.short) + ' lb: only ' + fmt(st.fuel) + ' loaded' : 'loaded: ' + fmt(st.fuel) + ' lb')}${tile('Bingo', fmt(pl.bingo) + ' lb', 'Min.Fuel of STPT ' + (pl.bingoIdx + 1))}${tile('Joker', fmt(pl.joker) + ' lb', '+' + fmt(st.jok) + ' lb over the bingo')}${tile('Mil climb', cl ? fmt(cl.cas) + ' / .' + String(Math.round(cl.mach * 100)).padStart(2, '0') : '—', cl ? 'to ' + fmt(alt) + ' ft: ' + cl.minutes.toFixed(1) + ' min, ' + fmt(cl.fuel) + ' lb' : 'no climb')}</div>`;
    const windTxt = w => String(Math.round(w.hdg) % 360 || 360).padStart(3, '0') + '/' + Math.round(w.spd) + ' <span class="hint">' + fmt(w.alt / 1000) + 'k</span>';
    const lab = i => esc((fp.labels && fp.labels[i]) || '');
    const rows = pl.rows.map(r => `<tr${r.min == null ? ' class="hint"' : ''}><td>${r.i + 1}</td><td style="text-align:left">${lab(r.i)}</td><td>${fmt(r.alt)}</td><td>${r.nm ? r.nm.toFixed(0) : ''}</td><td>${hm(r.t)}</td><td>${r.mach ? r.mach.toFixed(2) : ''}</td><td>${r.wind ? windTxt(r.wind) : ''}</td><td>${r.burn || r.dwell ? fmt(r.burn) : ''}${r.dwell ? ' <span class="hint">+ ' + hm(r.dwell) + ' hold</span>' : ''}</td><td><b>${r.min == null ? '' : fmt(r.min)}${r.i == pl.bingoIdx ? ' ◄ bingo' : ''}${r.tanker ? ' (tanker)' : ''}</b></td></tr>`).join('');
    return {tiles, body: `<div class="wcard"><h3>Fuel along the flight plan · ${fmt(gw())} lb<span class="wtip" title="Worked back from the landing: Min.Fuel is the fuel needed on arriving at a steerpoint to fly the rest of the plan and land with the reserve. The burn of each leg uses the planned speed and altitude with the BMS thrust and fuel flow tables; holds and orbits (the time between arrival and departure) are burned at Mach .5 to .85. At a tanker the fuel on arrival is taken as 1000 lb. The wind of each leg is the wind aloft of the weather map (when one is loaded) at the layer nearest to its mean altitude: it turns the planned ground speed into the airspeed. The plan stops at the first landing.">ⓘ</span></h3><div class="wtbl"><table><tr><th>STPT</th><th style="text-align:left">Action</th><th>Alt (ft)</th><th>nm</th><th>Time</th><th>Mach</th><th>Wind aloft</th><th>Burn (lb)</th><th>Min.Fuel (lb)</th></tr>${rows}</table></div></div>`};
  }
  function inputs() {
    const names2 = names.length ? names : [st.ac], acsel = `<div class="wrow"><label>Aircraft</label><select data-pick="ac">${names2.map(n => `<option${n == st.ac ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
    const w = ac ? `<div class="kv"><span>EMPTY</span><b>${fmt(empty())} lb</b><span>GROSS</span><b data-gw>${fmt(gw())} lb</b><span>INTERNAL FUEL</span><b>${fmt(ac.af.fuelLb)} lb</b><span>WING AREA</span><b>${fmt(ac.af.area)} ft²</b><span>LIMITS</span><b>${fmt(ac.af.maxG, 1)} g · ${fmt(ac.af.aoaMax)}° alpha</b></div>` : '';
    const loadBtn = deps.loadout ? `<div class="wrow"><button class="btn g" type="button" data-dc title="Take the aircraft, fuel, weight of the stores and drag index of the flight chosen in the Datacard">Load the datacard flight</button></div>` : '';
    const s = m => m.map(slider).join('');
    const per = st.mode == 'turn' ? `<div class="wrow"><label>Ps map</label>${seg('ps', [['mil', 'MIL'], ['ab', 'AB']], st.ps)}</div>${s(['alt', 'g'])}` : st.mode == 'cruise' ? s(['alt', 'reserve', 'mach']) + `<div class="wrow"><button class="btn g" type="button" data-bestm>Best range Mach</button></div>` : st.mode == 'plan' ? s(['lres', 'jok']) + `<p class="hint wnote">Landing reserve and the Joker margin are used by the Datacard (Min.Fuel, Bingo, Joker).</p>` : `<div class="wrow"><label>Power</label>${seg('power', [['mil', 'MIL'], ['ab', 'AB']], st.power)}</div>${s(['elev', 'hw', 'slope', 'lfuel'])}${envNote()}<div class="wrow"><label>Runway</label><input type="number" data-rwy min="0" max="20000" step="100" value="${rwMan() || ''}" placeholder="${rwAuto() || 'length, ft'}" style="width:110px"> <span class="hint">${rwHint()}</span></div>`;
    return `<div class="wcard"><h3>Aircraft and load</h3>${acsel}${loadBtn}${note ? `<p class="hint wnote">${esc(note)}</p>` : ''}${ac ? s(['fuel', 'stores', 'di', 'isa']) : ''}${w}</div><div class="wcard"><h3>${MODES.find(m => m[0] == st.mode)[1]}</h3>${ac ? per : ''}</div>`;
  }

  function draw(keepLeft) {
    const root = deps.root; if (!root) return;
    if (!tried) { tried = true; Promise.resolve(deps.aircraft.list()).then(n => { names = n || []; if (!names.includes(st.ac) && names.length) st.ac = names.includes('F-16CM-50') ? 'F-16CM-50' : names[0]; ac = null; ready = true; draw(false); }).catch(() => { names = []; ready = true; draw(false); }); return; }
    if (ready) { const l = deps.loadout && deps.loadout(), sig = l ? [l.ac, l.gw, l.fuel, l.drag].join('|') : ''; if (sig && sig != lastSig) { lastSig = sig; if (fromDatacard()) return; } }
    if (!ac && !loading && noData != st.ac) { pick(st.ac); return; }
    const tabs = `<div class="wtabs" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" class="${st.mode == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>`;
    let r = {tiles: '', body: ''};
    if (ac) { try { r = st.mode == 'turn' ? turnTab() : st.mode == 'cruise' ? cruiseTab() : st.mode == 'plan' ? planTab() : fieldTab(); } catch (e) { r = {tiles: '', body: `<p class="wperr">Could not compute: ${esc(e.message)}</p>`}; } }
    else r.body = loading ? '<p class="hint">Reading the aircraft data…</p>' : '<p class="wperr">No performance data for this aircraft.</p>';
    if (keepLeft && root.querySelector('.wpl')) { const c = root.querySelector('#pfr'); if (c) { c.innerHTML = r.tiles + r.body; wire(root, true); return; } }
    root.innerHTML = `${tabs}<div class="wpg" style="grid-template-columns:340px minmax(0,760px)"><div class="wpl">${inputs()}</div><div class="wpc" id="pfr" style="grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:12px">${r.tiles}${r.body}</div></div>`;
    wire(root, false);
  }
  function wire(root, partial) {
    const upd = f => { save(); if (deps.prefs && (f == 'lres' || f == 'jok')) deps.prefs.set({reserve: st.lres, joker: st.jok}); const g = root.querySelector('[data-gw]'); if (g) g.textContent = fmt(gw()) + ' lb'; draw(true); };
    if (!partial) {
      root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; save(); draw(false); });
      root.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { st[b.dataset.set] = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); save(); draw(false); });
      root.querySelectorAll('input[data-sl]').forEach(i => { i.oninput = () => { const f = i.dataset.sl; st[f] = +i.value; if (AUTO.includes(f)) { ov.add(f); const lb = i.closest('.slr').querySelector('label small'); if (lb) lb.remove(); const en = root.querySelector('[data-envnote]'); if (en) { en.outerHTML = envNote(); const er = root.querySelector('[data-envreset]'); if (er) er.onclick = ev => { ev.preventDefault(); ov.clear(); draw(false); }; } } const em = root.querySelector(`[data-em="${f}"]`); if (em) em.textContent = fmtV(f, i.value) + SL[f][1]; upd(f); }; });
      root.querySelectorAll('select[data-pick]').forEach(s => s.onchange = () => { st.ac = s.value; ac = null; save(); pick(s.value, true); });
      const er = root.querySelector('[data-envreset]'); if (er) er.onclick = e => { e.preventDefault(); ov.clear(); draw(false); };
      const dc = root.querySelector('[data-dc]'); if (dc) dc.onclick = fromDatacard;
      const bm = root.querySelector('[data-bestm]'); if (bm) bm.onclick = () => { st.mach = 0; save(); draw(false); };
      const rw = root.querySelector('[data-rwy]'); if (rw) rw.onchange = () => { const v = Math.max(0, +rw.value || 0); if (deps.runway) deps.runway.set(v); else st.rwy = v; save(); draw(false); };
    }
  }
  return {refresh: () => { tried = false; ready = false; ac = null; names = []; lastSig = ''; noData = ''; }, render: () => { if (!deps.root.isConnected || deps.root.closest('.hide')) return; if (deps.prefs) { const p = deps.prefs.get(); if (p) { if (p.reserve != null) st.lres = p.reserve; if (p.joker != null) st.jok = p.joker; } } draw(false); }, root: deps.root, state: () => st, setState: o => { st = {...st, ...o}; save(); }, calc: () => ac, fromDatacard};
}
