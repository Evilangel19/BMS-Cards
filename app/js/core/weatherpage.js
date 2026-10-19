// Weather page: the weather map (.fmap) of the whole theater for the hour chosen on the time slider, with the route of the selected flight, the airbases, the weather along the
// route and the winds aloft. The wind of the map is shown at the layer chosen on the altitude slider (the 10 layers of the BMS manual, 0-50,000 ft); by default the layer nearest to
// the altitude of the flight plan.
// deps: {root, esc, flight() -> {wps, labels, alt, dep, tot, land, hours: [ms of each hourly map], bases: [{role, name, x, y, ms, elev, rwy, ils, atis}], taf} | null,
//        at(ms) -> fmap | null (the map of that hour, or the campaign map), fill() (write ATIS, TAF and runways), fillState() -> {diff}}
import { WX_ALT, WX_COND, wxLevel } from '../parsers/fmap.js';

const MODES = [['cond', 'Weather'], ['wind', 'Wind'], ['temp', 'Temperature'], ['press', 'Pressure'], ['cloud', 'Clouds'], ['vis', 'Visibility']];
const S = 14;                                             // pixels per cell on the canvas
const PAL = {0: [236, 240, 245, .62], 1: [34, 168, 52, .56], 2: [186, 176, 38, .62], 3: [150, 24, 38, .72]};   // sunny white, fair green, poor yellow, inclement red (as the game)
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
    if (mode == 'cond') return WX_COND.map((n, i) => `<span class="wxlk"><i style="background:${rgba([PAL[i][0], PAL[i][1], PAL[i][2], 1])}"></i>${n}</span>`).join('');
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
  function barb(x, cx, cy, hdg, spd, L) {                 // meteorological barb: the staff points to where the wind comes from
    if (spd < 2.5) { x.beginPath(); x.arc(cx, cy, 1.8, 0, 6.3); x.stroke(); return; }
    const a = hdg * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, ex = cx + ux * L, ey = cy + uy * L, B = 4.2;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke();
    let r = Math.round(spd / 5) * 5, d = 0; x.beginPath();
    while (r >= 50) { const sx = ex - ux * d, sy = ey - uy * d; x.moveTo(sx, sy); x.lineTo(sx + px * B - ux * 2, sy + py * B - uy * 2); x.lineTo(sx - ux * 3, sy - uy * 3); r -= 50; d += 3.5; }
    while (r >= 10) { const sx = ex - ux * d, sy = ey - uy * d; x.moveTo(sx, sy); x.lineTo(sx + px * B - ux * 1.5, sy + py * B - uy * 1.5); r -= 10; d += 2.4; }
    if (r >= 5) { if (d == 0) d = 2.4; const sx = ex - ux * d, sy = ey - uy * d; x.moveTo(sx, sy); x.lineTo(sx + px * B * .55 - ux * .8, sy + py * B * .55 - uy * .8); }
    x.stroke();
  }
  const prOf = W => { if (!W.pr) { let a = 1e9, b = -1e9; for (let j = 0; j < W.Y; j++) for (let i = 0; i < W.X; i++) { const p = W.cell(i, j).p; if (p < a) a = p; if (p > b) b = p; } W.pr = [a, b]; } return W.pr; };
  const pos = (W, p) => [p.x / W.cs * S, (W.Y - p.y / W.cs) * S];

  function paint(cv, W, fl, lv, mode) {
    prOf(W); const x = cv.getContext('2d'); cv.width = W.X * S; cv.height = W.Y * S;
    x.fillStyle = '#1b2735'; x.fillRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < W.Y; j++) for (let i = 0; i < W.X; i++) {
      const c = W.cell(i, j, lv), col = cellColor(c, mode, W); if (!col[3]) continue;
      x.fillStyle = rgba(col); x.fillRect(i * S, (W.Y - 1 - j) * S, S, S);
    }
    if (st.barbs) {
      x.strokeStyle = 'rgba(255,255,255,.88)'; x.fillStyle = 'rgba(255,255,255,.88)'; x.lineWidth = 1.2; x.lineJoin = 'round';
      for (let j = 0; j < W.Y; j++) for (let i = 0; i < W.X; i++) { const c = W.cell(i, j, lv); barb(x, (i + .5) * S, (W.Y - 1 - j + .5) * S, c.hdg, c.spd, S * .62); }
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
    const slider = t0 == null ? '<p class="hint">The campaign map is used: no hourly maps for this flight.</p>' : `<div class="wxtm"><div class="wxmk">${marks.map(m => `<span style="left:${m.p}%;background:${m.c}">${m.n} ${hhmm(m.v)}</span>`).join('')}</div><input type="range" id="wxms" min="${t0}" max="${t1}" step="60000" value="${ms}"><div class="wxtk">${hrs.map(h => `<span style="left:${(h - t0) / (t1 - t0) * 100}%">${z2((h / 3600000 | 0) % 24)}</span>`).join('')}</div></div>`;
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
<div class="wxg"><div class="wxl"><div class="wcard"><h3>Map · ${MODES.find(m => m[0] == st.mode)[1]}</h3><div class="wxcvw"><canvas id="wxcv"></canvas></div><div class="wxleg">${legend(st.mode, W, lv)}</div><div class="hint wxinfo" id="wxinfo">Move over the map for the data of a cell.</div></div>
<div class="wcard"><h3>Time</h3>${slider}</div>
<div class="wcard"><h3>Altitude of the wind (ft ×1000)${st.lv == null ? ' · from the flight plan' : ''}</h3><div class="wxlv">${lvTicks}</div><div class="hint">${fl && fl.alt ? `<button type="button" class="btn g sm" data-auto>Nearest to the flight plan (${fmt(fl.alt)} ft → ${WX_ALT[auto] ? WX_ALT[auto] / 1000 + 'k' : 'surface'})</button>` : 'The wind is read from the 10 layers of the map; the barbs and the Wind colours show the layer selected here.'}</div></div></div>
<div class="wxr"><div class="wcard"><h3>Airbases</h3>${bases}</div><div class="wcard"><h3>Along the route</h3>${rte}</div><div class="wcard"><h3>Winds aloft${tg ? ' · ' + esc(((fl.labels && fl.labels[fl.wps.indexOf(tg)]) || 'target') + ' (STPT ' + (fl.wps.indexOf(tg) + 1) + ')') : ''}</h3>${aloft}<div class="hint wxnote">Layers at 0, 3, 6, 9, 12, 18, 24, 30, 40 and 50 thousand feet. Direction is where the wind comes from.</div></div></div></div>`;
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
  return {render: () => { if (!deps.root.isConnected || deps.root.closest('.hide')) return; draw(); }, state: () => st, setState: o => { st = {...st, ...o}; save(); }, root: deps.root, draw};
}
