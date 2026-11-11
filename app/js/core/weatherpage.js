// Weather page: the weather map (.fmap) of the hour chosen on the time slider drawn over the Leaflet map of the Map page (the Weapons page borrows it the same way: not editable, no buttons,
// zoom and drag as usual), with the route of the selected flight and its airbases from the Map layers. The tabs above the map (Weather, Wind, Temperature, Pressure, Clouds, Visibility) choose
// the filter drawn over it. The wind of the map is shown, as barbs, only in the Wind filter, at the layer chosen in the "Time & altitude" panel of the map (the 10 layers of the BMS manual,
// 0-50,000 ft); by default the layer nearest to the altitude of the flight plan. Cards on the right: airbases with ATIS, weather along the route, winds aloft.
// deps: {root, esc, flight() -> {title, wps, labels, alt, dep, tot, land, hours: [ms of each hourly map], bases: [{role, name, x, y, ms, elev, rwy, ils, atis}], taf} | null,
//        at(ms) -> fmap | null (the map of that hour, or the campaign map), fill() (write ATIS, TAF and runways), fillState() -> {diff},
//        attach(el) -> Promise<{L, map} | null>, detach(), toLL(xKm, yKm) -> [lat, lon], fromLL(lat, lon) -> [xKm, yKm], bounds: [[lat, lon], [lat, lon]]}
import { WX_ALT, WX_COND, wxLevel } from '../parsers/fmap.js';
import { WX_MODES as MODES, prOf, legend, drawWx } from './wxlayer.js';

const NOTE = ['Clear', 'Fair', 'Poor', 'Inclement'],
  NCOL = ['#7ee2a8', '#7ee2a8', '#f0c46a', '#ff9a9a'],
  NBG = ['#16362a', '#16362a', '#3a2f12', '#4a1d1d'];
const fmt = (v, d = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, ' ');
const z2 = v => String(v).padStart(2, '0'),
  hhmm = ms => {
    const s = Math.floor(ms / 1000);
    return z2(((s % 86400) / 3600) | 0) + ':' + z2(((s % 3600) / 60) | 0);
  };
const dayOf = ms => Math.floor(ms / 86400000) + 1;
const wind = (h, s) => String(Math.round(h) % 360 || 360).padStart(3, '0') + '/' + Math.round(s);

export function createWeatherPage(deps) {
  const esc = deps.esc,
    KEY = 'wxstate2';
  let st = { mode: 'cond', lv: null, ms: null, open: true, op: 100 };
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (o) st = { ...st, ...o };
  } catch (e) {
    /* none */
  }
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  let cur = null,
    M = null,
    tok = 0,
    view = null; // cur: what is drawn {W, lv, fl}; M: the borrowed map {L, map, group, box, on}; view: bounds kept between two drawings of the page

  const cellInfo = (c, lv, i, j) => {
    const cu =
      c.cu >= 9999
        ? 'no cumulus'
        : `cumulus ${fmt(c.cu)} ft · density ${c.dens} · size ${c.size.toFixed(1)}${c.tcu ? ' · tower' : ''}${c.shower ? ' · shower' : ''}`;
    return `<b>${WX_COND[Math.min(3, Math.max(0, c.cond))]}</b> · cell ${i + 1}/${j + 1} · wind ${wind(c.hdg, c.spd)} kt at ${fmt(WX_ALT[lv])} ft · ${c.t.toFixed(0)} °C · ${fmt(c.p)} mbar · visibility ${c.fogEnd >= 60 ? '60+' : c.fogEnd.toFixed(0)} km${c.fogEnd < 10 ? ' (fog layer to ' + fmt(c.fogZ) + ' ft)' : ''} · ${cu}`;
  };

  // ---- the weather over the borrowed map
  function layers() {
    if (!M || !cur) return;
    drawWx({ L: M.L, map: M.map, group: M.group, W: cur.W, lv: cur.lv, mode: st.mode, op: st.op, toLL: deps.toLL });
  }
  async function mapUp() {
    const mine = ++tok,
      box = deps.root.querySelector('#wxbox');
    if (!box || !deps.attach) return;
    const o = await deps.attach(box);
    if (!o) {
      box.innerHTML = '<p class="hint" style="padding:12px">The map could not be loaded.</p>';
      return;
    }
    if (mine !== tok || !box.isConnected) {
      try {
        deps.detach();
      } catch (e) {
        /* none */
      }
      return;
    }
    const info = deps.root.querySelector('#wxinfo');
    const mv = e => {
      if (!cur || !info) return;
      const g = deps.fromLL(e.latlng.lat, e.latlng.lng),
        i = Math.floor(g[0] / cur.W.cs),
        j = Math.floor(g[1] / cur.W.cs);
      if (i >= 0 && j >= 0 && i < cur.W.X && j < cur.W.Y)
        info.innerHTML = cellInfo(cur.W.cell(i, j, cur.lv), cur.lv, i, j);
    };
    const zm = () => {
      if (st.mode == 'wind') layers();
    };
    M = { ...o, group: o.L.layerGroup().addTo(o.map), box, mv, zm };
    o.map.on('mousemove', mv);
    o.map.on('zoomend', zm);
    o.map.invalidateSize();
    o.map.fitBounds(view || deps.bounds);
    layers();
  }
  function mapDown() {
    tok++;
    if (!M) return;
    try {
      const pn = M.map.getPane('wxP');
      if (pn) pn.style.opacity = '';
      view = M.map.getBounds();
      M.map.off('mousemove', M.mv);
      M.map.off('zoomend', M.zm);
      M.group.remove();
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

  // ---- the page
  const stateOf = () => {
    const fl = deps.flight(),
      hrs = fl && fl.hours && fl.hours.length ? fl.hours : [],
      t0 = hrs.length ? hrs[0] : null,
      t1 = hrs.length ? hrs[hrs.length - 1] + 3599000 : null;
    let ms = st.ms != null && t0 != null ? st.ms : (fl && (fl.tot || fl.dep)) || null;
    if (t0 != null && ms != null) ms = Math.min(t1, Math.max(t0, ms));
    const auto = fl && fl.alt ? wxLevel(fl.alt) : 0;
    return { fl, hrs, t0, t1, ms, auto, lv: st.lv != null ? st.lv : auto };
  };
  const panelHtml = s => {
    const { fl, hrs, t0, t1, ms, auto, lv } = s,
      marks = [];
    if (fl && t0 != null)
      [
        ['DEP', fl.dep, '#8cc4ff'],
        ['TOT', fl.tot, '#ffe680'],
        ['LAND', fl.land, '#7ee2a8'],
      ].forEach(([n, v, c]) => {
        if (v != null && v >= t0 && v <= t1) marks.push({ n, v, c, p: ((v - t0) / (t1 - t0)) * 100 });
      });
    const slider =
      t0 == null
        ? '<p class="hint" style="margin:0 0 8px">The campaign map is used: no hourly maps for this flight.</p>'
        : `<div class="wxtm"><div class="wxmk">${marks.map((m, k) => `<span style="left:${Math.min(88, Math.max(12, m.p))}%;top:${(k % 2) * 22}px;background:${m.c}">${m.n} ${hhmm(m.v)}</span>`).join('')}</div><input type="range" id="wxms" min="${t0}" max="${t1}" step="60000" value="${ms}"><div class="wxtk">${hrs.map(h => `<span style="left:${((h - t0) / (t1 - t0)) * 100}%">${z2(((h / 3600000) | 0) % 24)}</span>`).join('')}</div></div>`;
    const lab = a => (a ? a / 1000 : 'SFC'),
      pos = i => (i / (WX_ALT.length - 1)) * 100;
    const altBlock =
      st.mode != 'wind'
        ? ''
        : `<div class="wxph" style="margin-top:6px">Altitude of the wind (ft ×1000)<b id="wxalh">${st.lv == null ? ' · from the flight plan' : ''}</b></div><div class="wxtm" id="wxlv"><div class="wxmk"><span id="wxlvp" style="left:${Math.min(92, Math.max(8, pos(lv)))}%;background:#3ddc84">${lv ? fmt(WX_ALT[lv]) + ' ft' : 'Surface'}</span></div><input type="range" id="wxlvs" min="0" max="${WX_ALT.length - 1}" step="1" value="${lv}" aria-label="Altitude of the wind"><div class="wxtk">${WX_ALT.map((a, i) => `<span data-t="${i}" style="left:${pos(i)}%${i == lv ? ';color:#3ddc84;font-weight:700' : ''}">${lab(a)}</span>`).join('')}</div></div>${fl && fl.alt ? `<button type="button" class="btn g sm" data-auto>Nearest to the flight plan (${fmt(fl.alt)} ft → ${WX_ALT[auto] ? WX_ALT[auto] / 1000 + 'k' : 'surface'})</button>` : ''}`;
    return `<div class="wxph">Time <b id="wxtl">${ms != null ? 'day ' + dayOf(ms) + ' · ' + hhmm(ms) + 'Z' : ''}</b></div>${slider}${altBlock}<div class="wxph" style="margin-top:8px">Weather opacity <b id="wxopl">${st.op}%</b></div><input type="range" id="wxop" min="10" max="100" step="5" value="${st.op}" style="width:100%;accent-color:#3ddc84" aria-label="Weather opacity">${st.mode == 'wind' ? '' : '<p class="hint wxnote" style="margin:6px 0 0">The altitude of the wind can be chosen in the Wind tab.</p>'}`;
  };
  const alofts = (s, W) => {
    const { fl, ms, lv } = s,
      tg =
        fl && fl.wps.length
          ? fl.wps.find(p => ![0, 1, 2, 3, 4, 7, 8].includes(p.act)) || fl.wps[Math.min(1, fl.wps.length - 1)]
          : null;
    const prof = tg ? (deps.at(tg.arr || ms) || W).profile(tg.x, tg.y) : W.profile((W.X * W.cs) / 2, (W.Y * W.cs) / 2),
      mx = Math.max(20, ...prof.map(p => p.spd));
    return {
      tg,
      html: prof
        .map(
          p =>
            `<div class="wxw${p.lv == lv ? ' on' : ''}" data-lv="${p.lv}"><span>${p.alt ? fmt(p.alt) + ' ft' : 'Surface'}</span><div class="wxbar"><u style="width:${(p.spd / mx) * 100}%"></u></div><b>${wind(p.hdg, p.spd)} kt</b></div>`
        )
        .join(''),
    };
  };
  const topText = s =>
    (s.fl ? esc(s.fl.title || '') : 'campaign weather') +
    (s.ms != null ? ' · day ' + dayOf(s.ms) + ' · ' + hhmm(s.ms) + 'Z' : '');

  function draw() {
    const root = deps.root;
    if (!root) return;
    mapDown();
    const s = stateOf(),
      { fl, ms, lv } = s,
      W = deps.at(ms);
    if (!W) {
      root.innerHTML =
        '<div class="wcard"><h3>Weather</h3><p class="hint">No weather map yet: open a campaign (its .fmap loads with it) or a mission that carries the weather.</p></div>';
      cur = null;
      return;
    }
    prOf(W);
    cur = { W, lv, fl };
    const fd = deps.fillState ? deps.fillState() : null;
    const tabs = `<div class="wtabs" id="wxtabs" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" class="${st.mode == k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>`;
    const fillBtn =
      fl && deps.fill
        ? `<button type="button" class="btn ${fd && fd.diff ? 'bl' : 'g'}${fd && !fd.diff ? ' nil' : ''}" data-fill title="Write ATIS, TAF and runways of the flight again from the weather maps of the right hours (fields you typed by hand are replaced). Dimmed when the datacard already holds them.">Fill datacard (ATIS, TAF, runways)</button>`
        : '';
    const bases =
      fl && fl.bases.length
        ? fl.bases
            .map(
              b =>
                `<div class="wxb"><div><span class="hint">${b.role}</span> <b>${esc(b.name)}</b><span class="hint" style="float:right">${b.rwy ? 'RWY ' + esc(b.rwy) : ''}${b.ils ? ' · ILS ' + esc(b.ils) : ''}${b.ms != null ? ' · ' + hhmm(b.ms) + 'Z' : ''}</span></div><div class="wxa">${esc(b.atis)}</div></div>`
            )
            .join('') +
          (fl.taf
            ? `<div class="wxb"><div class="hint">${fl.tafMode == 'LDG' ? 'LANDING FORECAST' + (fl.tafId ? ' · ' + esc(fl.tafId) : '') : 'TARGET FORECAST'}<span class="seg" style="float:right" title="Which forecast goes on the datacard"><button type="button" class="${fl.tafMode == 'LDG' ? '' : 'on'}" data-taf="TGT">TGT</button><button type="button" class="${fl.tafMode == 'LDG' ? 'on' : ''}" data-taf="LDG">LDG</button></span></div><div class="wxa">${esc(fl.taf)}</div></div>`
            : '')
        : '<p class="hint">Pick a flight in the Datacard to see its airbases.</p>';
    const rte =
      fl && fl.wps.length
        ? (() => {
            const end = fl.wps.findIndex((p, i) => i > 0 && p.act == 7),
              n = end > 0 ? end + 1 : fl.wps.length;
            return `<div class="wtbl"><table><tr><th>STPT</th><th style="text-align:left">Action</th><th>Time</th><th>Alt (ft)</th><th>Wind aloft</th><th style="text-align:left">Condition</th></tr>${fl.wps
              .slice(0, n)
              .map((p, i) => {
                const t = p.arr || p.dep || fl.dep,
                  Wi = deps.at(t) || W,
                  c = Wi.at(p.x, p.y),
                  alt = p.z * 10,
                  w = Wi.wind(p.x, p.y, alt),
                  k = Math.min(3, Math.max(0, c.cond)),
                  tag =
                    NOTE[k] + (c.tcu && k >= 2 ? ' · tower cu' : '') + (c.fogEnd < 10 && alt < c.fogZ ? ' · fog' : '');
                return `<tr><td>${i + 1}</td><td style="text-align:left">${esc((fl.labels && fl.labels[i]) || '')}</td><td>${t ? hhmm(t) + 'Z' : ''}</td><td>${fmt(alt)}</td><td>${wind(w.hdg, w.spd)} <span class="hint">${fmt(w.alt / 1000)}k</span></td><td style="text-align:left"><span class="wxt" style="background:${NBG[k]};color:${NCOL[k]}">${tag}</span></td></tr>`;
              })
              .join('')}</table></div>`;
          })()
        : '<p class="hint">No flight selected.</p>';
    const al = alofts(s, W);
    root.innerHTML = `${tabs}<div class="wxtop"><span class="hint" id="wxtop">${topText(s)}</span><span style="flex:1"></span>${fillBtn}</div>
<div class="wxg"><div class="wxl"><div class="wcard"><h3 id="wxh">Map · ${MODES.find(m => m[0] == st.mode)[1]}</h3><div class="wxmapbox" id="wxbox"></div><div class="wxleg" id="wxleg">${legend(st.mode, W, lv)}</div><div class="hint wxinfo" id="wxinfo">Move over the map for the data of a cell. Scroll to zoom, drag to move.</div></div></div>
<div class="wxr"><div class="wcard"><h3>Airbases</h3>${bases}</div><div class="wcard"><h3>Along the route</h3>${rte}</div><div class="wcard"><h3>Winds aloft${al.tg ? ' · ' + esc(((fl.labels && fl.labels[fl.wps.indexOf(al.tg)]) || 'target') + ' (STPT ' + (fl.wps.indexOf(al.tg) + 1) + ')') : ''}</h3><div id="wxal">${al.html}</div><div class="hint wxnote">Layers at 0, 3, 6, 9, 12, 18, 24, 30, 40 and 50 thousand feet. Direction is where the wind comes from.</div></div></div></div>`;
    // the panel sits on the map (like the filters of the Map page): the map is put in the box first, the panel over it
    const box = root.querySelector('#wxbox');
    box.insertAdjacentHTML(
      'beforeend',
      `<div class="wxpan"><button class="btn" id="wxpb">TIME &amp; ALTITUDE <i>${st.open ? '▴' : '▾'}</i></button><div id="wxpp" class="mpp" style="${st.open ? '' : 'display:none'}">${panelHtml(s)}</div></div>`
    );
    wire();
    mapUp();
  }
  // mode, altitude, time: the map and the small parts change, the page is not drawn again
  function upd(panel) {
    const root = deps.root,
      s = stateOf(),
      W = deps.at(s.ms);
    if (!root.querySelector('#wxbox') || !W) {
      draw();
      return;
    }
    prOf(W);
    cur = { W, lv: s.lv, fl: s.fl };
    root.querySelectorAll('#wxtabs [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode == st.mode));
    root.querySelector('#wxh').textContent = 'Map · ' + MODES.find(m => m[0] == st.mode)[1];
    root.querySelector('#wxleg').innerHTML = legend(st.mode, W, s.lv);
    root.querySelector('#wxtop').innerHTML = topText(s);
    root.querySelectorAll('#wxal .wxw').forEach(r => r.classList.toggle('on', +r.dataset.lv == s.lv));
    if (panel) {
      root.querySelector('#wxpp').innerHTML = panelHtml(s);
      wirePanel();
    }
    layers();
  }
  function wirePanel() {
    const root = deps.root,
      sl = root.querySelector('#wxms');
    const ls = root.querySelector('#wxlvs');
    if (ls) {
      ls.oninput = () => {
        st.lv = +ls.value;
        const n = WX_ALT.length - 1,
          p = root.querySelector('#wxlvp'),
          h = root.querySelector('#wxalh');
        if (p) {
          p.style.left = Math.min(92, Math.max(8, (st.lv / n) * 100)) + '%';
          p.textContent = st.lv ? fmt(WX_ALT[st.lv]) + ' ft' : 'Surface';
        }
        if (h) h.textContent = '';
        root.querySelectorAll('#wxlv .wxtk span').forEach(t => {
          const on = +t.dataset.t == st.lv;
          t.style.color = on ? '#3ddc84' : '';
          t.style.fontWeight = on ? '700' : '';
        });
        upd(false);
      };
      ls.onchange = save;
    }
    const op = root.querySelector('#wxop');
    if (op) {
      op.oninput = () => {
        st.op = +op.value;
        const pn = M && M.map.getPane('wxP');
        if (pn) pn.style.opacity = st.op / 100;
        const l = root.querySelector('#wxopl');
        if (l) l.textContent = st.op + '%';
      };
      op.onchange = save;
    }
    const au = root.querySelector('#wxpp [data-auto]');
    if (au)
      au.onclick = () => {
        st.lv = null;
        save();
        upd(true);
      };
    if (sl) {
      sl.oninput = () => {
        st.ms = +sl.value;
        const s = stateOf(),
          W2 = deps.at(st.ms),
          l = root.querySelector('#wxtl');
        if (l) l.textContent = 'day ' + dayOf(st.ms) + ' · ' + hhmm(st.ms) + 'Z';
        if (W2 && cur && W2 !== cur.W) {
          cur = { W: W2, lv: s.lv, fl: s.fl };
          layers();
        }
      };
      sl.onchange = () => {
        st.ms = +sl.value;
        save();
        upd(false);
        const t = root.querySelector('#wxtop');
        if (t) t.innerHTML = topText(stateOf());
      };
    }
  }
  function wire() {
    const root = deps.root;
    root.querySelectorAll('#wxtabs [data-mode]').forEach(
      b =>
        (b.onclick = () => {
          const w = (st.mode == 'wind') != (b.dataset.mode == 'wind');
          st.mode = b.dataset.mode;
          save();
          upd(w);
        })
    );
    root.querySelectorAll('#wxal [data-lv]').forEach(
      b =>
        (b.onclick = () => {
          st.lv = +b.dataset.lv;
          save();
          upd(true);
        })
    );
    const pb = root.querySelector('#wxpb'),
      pp = root.querySelector('#wxpp');
    if (pb)
      pb.onclick = () => {
        st.open = !st.open;
        save();
        pp.style.display = st.open ? '' : 'none';
        pb.querySelector('i').textContent = st.open ? '▴' : '▾';
      };
    root.querySelectorAll('[data-taf]').forEach(
      b =>
        (b.onclick = () => {
          if (deps.setTaf) deps.setTaf(b.dataset.taf);
          draw();
        })
    );
    const fb = root.querySelector('[data-fill]');
    if (fb)
      fb.onclick = () => {
        if (fb.classList.contains('nil')) return;
        deps.fill();
        draw();
      };
    wirePanel();
  }
  return {
    render: () => {
      if (!deps.root.isConnected || deps.root.closest('.hide')) return;
      draw();
    },
    leave: () => mapDown(),
    resetView: () => {
      view = null;
    },
    state: () => st,
    setState: o => {
      st = { ...st, ...o };
      save();
    },
    root: deps.root,
    draw,
    layer: () => M,
  };
}
