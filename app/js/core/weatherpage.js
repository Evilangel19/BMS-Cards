// Weather page: the weather map (.fmap) of the whole theater for the hour chosen on the time slider, with the route of the selected flight, the airbases, the weather along the
// route and the winds aloft. The wind of the map is shown at the layer chosen on the altitude slider (the 10 layers of the BMS manual, 0-50,000 ft); by default the layer nearest to
// the altitude of the flight plan.
// deps: {root, esc, flight() -> {wps, labels, alt, dep, tot, land, hours: [ms of each hourly map], bases: [{role, name, x, y, ms, elev, rwy, ils, atis}], taf} | null,
//        at(ms) -> fmap | null (the map of that hour, or the campaign map), fill() (write ATIS, TAF and runways), fillState() -> {diff}}
import { WX_ALT, WX_COND, wxLevel } from '../parsers/fmap.js';
import { tmFwd } from '../rules/geo.js';
import basemap from '../data/basemap.js';

const MODES = [['cond', 'Weather'], ['wind', 'Wind'], ['temp', 'Temperature'], ['press', 'Pressure'], ['cloud', 'Clouds'], ['vis', 'Visibility']];
const S = 14, BSTEP = 4;                                  // pixels per cell on the canvas; a barb every BSTEP cells
const PAL = {0: [0, 0, 0, 0], 1: [34, 168, 52, .56], 2: [186, 176, 38, .62], 3: [150, 24, 38, .72]};   // sunny: nothing (the base map shows), fair green, poor yellow, inclement red (as the game)
const NOTE = ['Clear', 'Fair', 'Poor', 'Inclement'], NCOL = ['#7ee2a8', '#7ee2a8', '#f0c46a', '#ff9a9a'], NBG = ['#16362a', '#16362a', '#3a2f12', '#4a1d1d'];
const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}).replace(/,/g, ' ');
const z2 = v => String(v).padStart(2, '0'), hhmm = ms => { const s = Math.floor(ms / 1000); return z2((s % 86400) / 3600 | 0) + ':' + z2((s % 3600) / 60 | 0); };
const dayOf = ms => Math.floor(ms / 86400000) + 1;
const wind = (h, s) => String(Math.round(h) % 360 || 360).padStart(3, '0') + '/' + Math.round(s);
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// colour ramps: stops [value, [r, g, b, a]]
const ramp = (st, v) => { if (v <= st[0][0]) return st[0][1]; for (let i = 1; i < st.length; i++) if (v <= st[i][0]) return lerp(st[i - 1][1], st[i][1], (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); return st[st.length - 1][1]; };
const RW = [[0, [30, 60, 110, .45]], [15, [40, 160, 200, .6]], [35, [230, 210, 70, .66]], [60, [225, 70, 60, .72]], [90, [190, 60, 200, .78]]];
const RT = [[-20, [60, 90, 220, .7]], [0, [150, 200, 240, .6]], [15, [240, 220, 90, .6]], [30, [230, 110, 50, .7]], [40, [200, 40, 40, .75]]];
const RV = [[0, [220, 60, 60, .8]], [5, [230, 200, 60, .7]], [20, [90, 170, 90, .3]], [60, [0, 0, 0, 0]]];

export function createWeatherPage(deps) {
  const esc = deps.esc, KEY = 'wxstate1';
  let st = {mode: 'cond', lv: null, ms: null, barbs: true};
  try { const o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o) st = {...st, ...o}; } catch (e) { /* none */ }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* none */ } };
  let cur = null;                                         // what is drawn: {W, lv, mode}

  const rgba = c => `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;
  const legend = (mode, W, lv) => {
    const bar = (sts, a, b, u) => `<span class="wxlg"><i style="background:linear-gradient(90deg,${sts.map(s => rgba(s[1])).join(',')})"></i><span>${a}</span><span style="margin-left:auto">${b} ${u}</span></span>`;
    if (mode == 'cond') return WX_COND.map((n, i) => `<span class="wxlk"><i style="${i ? 'background:' + rgba([PAL[i][0], PAL[i][1], PAL[i][2], 1]) : 'background:transparent;border:1px solid #cfd8e2;box-sizing:border-box'}"></i>${n}</span>`).join('');
    if (mode == 'wind') return bar(RW, '0', '90', 'kt at ' + fmt(WX_ALT[lv]) + ' ft');
    if (mode == 'temp') return bar(RT, '−20', '40', '°C at the surface');
    if (mode == 'press') return `<span class="wxlk"><i style="background:rgba(120,150,230,.6)"></i>low → high pressure (this map: ${fmt(W.pr[0], 0)} to ${fmt(W.pr[1], 0)} mbar)</span>`;
    if (mode == 'cloud') return `<span class="wxlk"><i style="background:rgba(255,255,255,.7)"></i>more cumulus = whiter (density 1-13); the altitude is in the cell data</span>`;
    return bar(RV, '0', '60', 'km');
  };
  const cellColor = (c, mode, W) => {
    if (mode == 'cond') return PAL[Math.min(3, Math.max(0, c.cond))];
    if (mode == 'wind') return ramp(RW, c.spd);
    if (mode == 'temp') return ramp(RT, c.t);
    if (mode == 'press') { const t = (c.p - W.pr[0]) / Math.max(1, W.pr[1] - W.pr[0]); return lerp([70, 90, 190, .5], [200, 110, 220, .7], t); }
    if (mode == 'cloud') return c.cu >= 9999 ? [0, 0, 0, 0] : [255, 255, 255, .12 + .6 * Math.min(1, c.dens / 13)];
    return ramp(RV, c.fogEnd);
  };
  // meteorological barb as a path: the staff points to where the wind comes from; a half barb is 5 kt, a full one 10, a pennant 50
  function barb(cx, cy, hdg, spd, L, B) {
    const p = new Path2D();
    if (spd < 2.5) { p.moveTo(cx + 3.2, cy); p.arc(cx, cy, 3.2, 0, 6.3); return p; }
    const a = hdg * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, ex = cx + ux * L, ey = cy + uy * L;
    p.moveTo(cx, cy); p.lineTo(ex, ey);
    let r = Math.round(spd / 5) * 5, d = 0;
    while (r >= 50) { const sx = ex - ux * d, sy = ey - uy * d; p.moveTo(sx, sy); p.lineTo(sx + px * B - ux * B * .4, sy + py * B - uy * B * .4); p.lineTo(sx - ux * B * .7, sy - uy * B * .7); p.closePath(); r -= 50; d += B * .85; }
    while (r >= 10) { const sx = ex - ux * d, sy = ey - uy * d; p.moveTo(sx, sy); p.lineTo(sx + px * B - ux * B * .35, sy + py * B - uy * B * .35); r -= 10; d += B * .5; }
    if (r >= 5) { if (d == 0) d = B * .5; const sx = ex - ux * d, sy = ey - uy * d; p.moveTo(sx, sy); p.lineTo(sx + px * B * .55 - ux * B * .2, sy + py * B * .55 - uy * B * .2); }
    return p;
  }
  // the base map under the cells: sea, land, coast, lakes, rivers and borders of the offline map (Korea projection), drawn once
  let BASE = null;
  function baseMap(W) {
    const key = W.X + 'x' + W.Y + '/' + W.cs; if (BASE && BASE.key == key) return BASE;
    const mk = () => { const c = document.createElement('canvas'); c.width = W.X * S; c.height = W.Y * S; return c; }, under = mk(), over = mk(), w = under.width, h = under.height, u = under.getContext('2d'), o = over.getContext('2d');
    const pt = q => { const m = tmFwd(q[1], q[0]); return [(m[0] / 1000 + 512) / W.cs * S, (W.Y - (m[1] / 1000 + 512) / W.cs) * S]; };
    const path = (rings, close) => { const p = new Path2D(); rings.forEach(r => { let on = false; r.forEach(q => { const c = pt(q); if (c[0] < -400 || c[0] > w + 400 || c[1] < -400 || c[1] > h + 400) { on = false; return; } if (on) p.lineTo(c[0], c[1]); else { p.moveTo(c[0], c[1]); on = true; } }); if (close) p.closePath(); }); return p; };
    u.fillStyle = '#0f1d2b'; u.fillRect(0, 0, w, h);
    const land = path(basemap.land, true), lakes = path(basemap.lakes || [], true);
    u.fillStyle = '#2b3744'; u.fill(land); u.fillStyle = '#0f1d2b'; u.fill(lakes);               // under the cells: sea, land, lakes
    o.lineJoin = 'round'; o.strokeStyle = '#3f78ad'; o.lineWidth = 1; o.globalAlpha = .85; o.stroke(path(basemap.rivers || [], false)); o.stroke(lakes); o.globalAlpha = 1;   // over the cells: rivers, coast, borders
    o.strokeStyle = 'rgba(8,14,22,.8)'; o.lineWidth = 3.2; o.stroke(land); o.strokeStyle = '#e4ebf2'; o.lineWidth = 1.5; o.stroke(land);
    o.setLineDash([6, 4]); o.strokeStyle = 'rgba(8,14,22,.7)'; o.lineWidth = 3; o.stroke(path(basemap.borders, false)); o.strokeStyle = '#ffd98a'; o.lineWidth = 1.3; o.stroke(path(basemap.borders, false)); o.setLineDash([]);
    BASE = {key, under, over}; return BASE;
  }
  const prOf = W => { if (!W.pr) { let a = 1e9, b = -1e9; for (let j = 0; j < W.Y; j++) for (let i = 0; i < W.X; i++) { const p = W.cell(i, j).p; if (p < a) a = p; if (p > b) b = p; } W.pr = [a, b]; } return W.pr; };
  const pos = (W, p) => [p.x / W.cs * S, (W.Y - p.y / W.cs) * S];

  function paint(cv, W, fl, lv, mode) {
    prOf(W); const x = cv.getContext('2d'); cv.width = W.X * S; cv.height = W.Y * S;
    const bm = baseMap(W); x.drawImage(bm.under, 0, 0);
    for (let j = 0; j < W.Y; j++) for (let i = 0; i < W.X; i++) {
      const c = W.cell(i, j, lv), col = cellColor(c, mode, W); if (!col[3]) continue;
      x.fillStyle = rgba(col); x.fillRect(i * S, (W.Y - 1 - j) * S, S, S);
    }
    x.drawImage(bm.over, 0, 0);                          // coast, rivers and borders over the cells
    if (st.barbs) {                                      // fewer, bigger barbs: one every 4 cells, with a dark outline
      x.lineJoin = 'round'; x.lineCap = 'round';
      for (let j = 1; j < W.Y; j += BSTEP) for (let i = 1; i < W.X; i += BSTEP) {
        const c = W.cell(i, j, lv), p = barb((i + .5) * S, (W.Y - 1 - j + .5) * S, c.hdg, c.spd, S * 2.6, S * .72);
        x.strokeStyle = 'rgba(8,14,22,.85)'; x.lineWidth = 4; x.stroke(p); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 1.9; x.stroke(p); x.fill(p);
      }
    }
    if (fl && fl.wps && fl.wps.length) {
      const P = fl.wps.map(p => pos(W, p)), end = fl.wps.findIndex((p, i) => i > 0 && p.act == 7), n = end > 0 ? end + 1 : fl.wps.length;
      x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); P.slice(0, n).forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]));
      x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 5; x.stroke(); x.strokeStyle = '#34d399'; x.lineWidth = 2.6; x.stroke();
      x.font = '11px system-ui,sans-serif'; x.textBaseline = 'middle';
      P.slice(0, n).forEach((q, i) => { x.beginPath(); x.arc(q[0], q[1], 4, 0, 6.3); x.fillStyle = '#ffe680'; x.fill(); x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke(); x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(String(i + 1), q[0] + 7, q[1] - 7); x.fillStyle = '#fff'; x.fillText(String(i + 1), q[0] + 7, q[1] - 7); });
    }
    (fl && fl.bases || []).forEach(b => {
      const q = pos(W, b); x.beginPath(); x.rect(q[0] - 4, q[1] - 4, 8, 8); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke();
      x.font = 'bold 11px system-ui,sans-serif'; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(b.role + ' ' + b.name.replace(/\s*\(.*$/, ''), q[0] + 8, q[1] + 9); x.fillStyle = '#fff'; x.fillText(b.role + ' ' + b.name.replace(/\s*\(.*$/, ''), q[0] + 8, q[1] + 9);
    });
  }

  const cellInfo = (c, lv, i, j, W) => {
    const cu = c.cu >= 9999 ? 'no cumulus' : `cumulus ${fmt(c.cu)} ft · density ${c.dens} · size ${c.size.toFixed(1)}${c.tcu ? ' · tower' : ''}${c.shower ? ' · shower' : ''}`;
    return `<b>${WX_COND[Math.min(3, Math.max(0, c.cond))]}</b> · cell ${i + 1}/${j + 1} · wind ${wind(c.hdg, c.spd)} kt at ${fmt(WX_ALT[lv])} ft · ${c.t.toFixed(0)} °C · ${fmt(c.p)} mbar · visibility ${c.fogEnd >= 60 ? '60+' : c.fogEnd.toFixed(0)} km${c.fogEnd < 10 ? ' (fog layer to ' + fmt(c.fogZ) + ' ft)' : ''} · ${cu}`;
  };

  function draw() {
    const root = deps.root; if (!root) return;
    const fl = deps.flight(), hrs = fl && fl.hours && fl.hours.length ? fl.hours : [];
    const t0 = hrs.length ? hrs[0] : null, t1 = hrs.length ? hrs[hrs.length - 1] + 3599000 : null;
    let ms = st.ms != null && t0 != null ? Math.min(t1, Math.max(t0, st.ms)) : (fl && (fl.tot || fl.dep)) || null;
    if (t0 != null && ms != null) ms = Math.min(t1, Math.max(t0, ms));
    const W = deps.at(ms);
    if (!W) { root.innerHTML = '<div class="wcard"><h3>Weather</h3><p class="hint">No weather map yet: open a campaign (its .fmap loads with it) or a mission that carries the weather.</p></div>'; return; }
    prOf(W);
    const auto = fl && fl.alt ? wxLevel(fl.alt) : 0, lv = st.lv != null ? st.lv : auto, fd = deps.fillState ? deps.fillState() : null;
    const tabs = `<div class="wtabs" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" class="${st.mode == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>`;
    const fillBtn = fl && deps.fill ? `<button type="button" class="btn ${fd && fd.diff ? 'bl' : 'g'}${fd && !fd.diff ? ' nil' : ''}" data-fill title="Write ATIS, TAF and runways of the flight again from the weather maps of the right hours (fields you typed by hand are replaced). Dimmed when the datacard already holds them.">Fill datacard (ATIS, TAF, runways)</button>` : '';
    const marks = [];
    if (fl && t0 != null) [['DEP', fl.dep, '#8cc4ff'], ['TOT', fl.tot, '#ffe680'], ['LAND', fl.land, '#7ee2a8']].forEach(([n, v, c]) => { if (v != null && v >= t0 && v <= t1) marks.push({n, v, c, p: (v - t0) / (t1 - t0) * 100}); });
    const slider = t0 == null ? '<p class="hint">The campaign map is used: no hourly maps for this flight.</p>' : `<div class="wxtm"><div class="wxmk">${marks.map((m, k) => `<span style="left:${Math.min(92, Math.max(8, m.p))}%;top:${k % 2 * 22}px;background:${m.c}">${m.n} ${hhmm(m.v)}</span>`).join('')}</div><input type="range" id="wxms" min="${t0}" max="${t1}" step="60000" value="${ms}"><div class="wxtk">${hrs.map(h => `<span style="left:${(h - t0) / (t1 - t0) * 100}%">${z2((h / 3600000 | 0) % 24)}</span>`).join('')}</div></div>`;
    const lvTicks = WX_ALT.map((a, i) => `<button type="button" class="${i == lv ? 'on' : ''}" data-lv="${i}">${a ? a / 1000 : 'SFC'}</button>`).join('');
    const bases = fl && fl.bases.length ? fl.bases.map(b => `<div class="wxb"><div><span class="hint">${b.role}</span> <b>${esc(b.name)}</b><span class="hint" style="float:right">${b.rwy ? 'RWY ' + esc(b.rwy) : ''}${b.ils ? ' · ILS ' + esc(b.ils) : ''} ${b.ms != null ? ' · ' + hhmm(b.ms) + 'Z' : ''}</span></div><div class="wxa">${esc(b.atis)}</div></div>`).join('') + (fl.taf ? `<div class="wxb"><div class="hint">TARGET FORECAST</div><div class="wxa">${esc(fl.taf)}</div></div>` : '') : '<p class="hint">Pick a flight in the Datacard to see its airbases.</p>';
    const rte = fl && fl.wps.length ? (() => {
      const end = fl.wps.findIndex((p, i) => i > 0 && p.act == 7), n = end > 0 ? end + 1 : fl.wps.length;
      return `<div class="wtbl"><table><tr><th>STPT</th><th style="text-align:left">Action</th><th>Time</th><th>Alt (ft)</th><th>Wind aloft</th><th style="text-align:left">Condition</th></tr>${fl.wps.slice(0, n).map((p, i) => {
        const t = p.arr || p.dep || fl.dep, Wi = deps.at(t) || W, c = Wi.at(p.x, p.y), alt = p.z * 10, w = Wi.wind(p.x, p.y, alt), k = Math.min(3, Math.max(0, c.cond)), tag = NOTE[k] + (c.tcu && k >= 2 ? ' · tower cu' : '') + (c.fogEnd < 10 && alt < c.fogZ ? ' · fog' : '');
        return `<tr><td>${i + 1}</td><td style="text-align:left">${esc((fl.labels && fl.labels[i]) || '')}</td><td>${t ? hhmm(t) + 'Z' : ''}</td><td>${fmt(alt)}</td><td>${wind(w.hdg, w.spd)} <span class="hint">${fmt(w.alt / 1000)}k</span></td><td style="text-align:left"><span class="wxt" style="background:${NBG[k]};color:${NCOL[k]}">${tag}</span></td></tr>`;
      }).join('')}</table></div>`;
    })() : '<p class="hint">No flight selected.</p>';
    const tg = fl && fl.wps.length ? (fl.wps.find(p => ![0, 1, 2, 3, 4, 7, 8].includes(p.act)) || fl.wps[Math.min(1, fl.wps.length - 1)]) : null;
    const prof = tg ? (deps.at(tg.arr || ms) || W).profile(tg.x, tg.y) : W.profile(W.X * W.cs / 2, W.Y * W.cs / 2), mx = Math.max(20, ...prof.map(p => p.spd));
    const aloft = prof.map(p => `<div class="wxw${p.lv == lv ? ' on' : ''}" data-lv="${p.lv}"><span>${p.alt ? fmt(p.alt) + ' ft' : 'Surface'}</span><div class="wxbar"><u style="width:${p.spd / mx * 100}%"></u></div><b>${wind(p.hdg, p.spd)} kt</b></div>`).join('');
    root.innerHTML = `${tabs}<div class="wxtop"><span class="hint">${fl ? esc(fl.title || '') : 'campaign weather'}${ms != null ? ' · day ' + dayOf(ms) + ' · ' + hhmm(ms) + 'Z' : ''}</span><span style="flex:1"></span><label class="wxck"><input type="checkbox" id="wxbarbs"${st.barbs ? ' checked' : ''}> Wind barbs</label>${fillBtn}</div>
<div class="wxg"><div class="wxl"><div class="wcard"><h3>Map · ${MODES.find(m => m[0] == st.mode)[1]}</h3><div class="wxcvw"><canvas id="wxcv"></canvas></div><div class="wxleg">${legend(st.mode, W, lv)}</div><div class="hint wxinfo" id="wxinfo">Move over the map for the data of a cell.</div></div></div>
<div class="wxr"><div class="wcard"><h3>Airbases</h3>${bases}</div><div class="wcard"><h3>Along the route</h3>${rte}</div><div class="wcard"><h3>Winds aloft${tg ? ' · ' + esc(((fl.labels && fl.labels[fl.wps.indexOf(tg)]) || 'target') + ' (STPT ' + (fl.wps.indexOf(tg) + 1) + ')') : ''}</h3>${aloft}<div class="hint wxnote">Layers at 0, 3, 6, 9, 12, 18, 24, 30, 40 and 50 thousand feet. Direction is where the wind comes from.</div></div><div class="wcard"><h3>Time</h3>${slider}</div>
<div class="wcard"><h3>Altitude of the wind (ft ×1000)${st.lv == null ? ' · from the flight plan' : ''}</h3><div class="wxlv">${lvTicks}</div><div class="hint">${fl && fl.alt ? `<button type="button" class="btn g sm" data-auto>Nearest to the flight plan (${fmt(fl.alt)} ft → ${WX_ALT[auto] ? WX_ALT[auto] / 1000 + 'k' : 'surface'})</button>` : 'The wind is read from the 10 layers of the map; the barbs and the Wind colours show the layer selected here.'}</div></div></div></div>`;
    const cv = root.querySelector('#wxcv'); paint(cv, W, fl, lv, st.mode); cur = {W, lv};
    const info = root.querySelector('#wxinfo');
    cv.onmousemove = e => { const Wc = cur.W, r = cv.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / r.width * Wc.X), j = Wc.Y - 1 - Math.floor((e.clientY - r.top) / r.height * Wc.Y); if (i >= 0 && j >= 0 && i < Wc.X && j < Wc.Y) info.innerHTML = cellInfo(Wc.cell(i, j, lv), lv, i, j, Wc); };
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; save(); draw(); });
    root.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { st.lv = +b.dataset.lv; save(); draw(); });
    const au = root.querySelector('[data-auto]'); if (au) au.onclick = () => { st.lv = null; save(); draw(); };
    const bb = root.querySelector('#wxbarbs'); if (bb) bb.onchange = () => { st.barbs = bb.checked; save(); draw(); };
    const sl = root.querySelector('#wxms'); if (sl) { sl.oninput = () => { st.ms = +sl.value; const W2 = deps.at(st.ms); root.querySelector('.wxtop .hint').textContent = (fl && fl.title ? fl.title + ' · ' : '') + 'day ' + dayOf(st.ms) + ' · ' + hhmm(st.ms) + 'Z'; if (W2 && W2 !== cur.W) { cur.W = W2; paint(cv, W2, fl, lv, st.mode); } }; sl.onchange = () => { st.ms = +sl.value; save(); draw(); }; }
    const fb = root.querySelector('[data-fill]'); if (fb) fb.onclick = () => { if (fb.classList.contains('nil')) return; deps.fill(); draw(); };
  }
  return {base: () => cur && baseMap(cur.W).under, render: () => { if (!deps.root.isConnected || deps.root.closest('.hide')) return; draw(); }, state: () => st, setState: o => { st = {...st, ...o}; save(); }, root: deps.root, draw};
}
