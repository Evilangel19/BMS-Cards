// The weather of a BMS weather map (.fmap) drawn over a Leaflet map: the cells coloured for a filter (weather, wind, temperature, pressure, clouds, visibility)
// and, for the wind, the barbs at a layer. Used by the Weather page and by the Briefing of the Squadron page (the same colours and barbs on both).
import { WX_ALT, WX_COND } from '../parsers/fmap.js';

export const WX_MODES = [
  ['cond', 'Weather'],
  ['wind', 'Wind'],
  ['temp', 'Temperature'],
  ['press', 'Pressure'],
  ['cloud', 'Clouds'],
  ['vis', 'Visibility'],
];

const PAL = { 0: [0, 0, 0, 0], 1: [34, 168, 52, 0.56], 2: [186, 176, 38, 0.62], 3: [150, 24, 38, 0.72] }; // sunny: nothing (the map shows), fair green, poor yellow, inclement red (as the game)
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// colour ramps: stops [value, [r, g, b, a]]
const ramp = (st, v) => {
  if (v <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++)
    if (v <= st[i][0]) return lerp(st[i - 1][1], st[i][1], (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0]));
  return st[st.length - 1][1];
};
const RW = [
  [0, [30, 60, 110, 0.45]],
  [15, [40, 160, 200, 0.6]],
  [35, [230, 210, 70, 0.66]],
  [60, [225, 70, 60, 0.72]],
  [90, [190, 60, 200, 0.78]],
];
const RT = [
  [-20, [60, 90, 220, 0.7]],
  [0, [150, 200, 240, 0.6]],
  [15, [240, 220, 90, 0.6]],
  [30, [230, 110, 50, 0.7]],
  [40, [200, 40, 40, 0.75]],
];
const RV = [
  [0, [220, 60, 60, 0.8]],
  [5, [230, 200, 60, 0.7]],
  [20, [90, 170, 90, 0.3]],
  [60, [0, 0, 0, 0]],
];

const fmt = (v, d = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, ' ');
// meteorological barb as an SVG path around (cx, cy): the staff points to where the wind comes from; a half barb is 5 kt, a full one 10, a pennant 50
export function barbPath(cx, cy, hdg, spd, L, B) {
  const f = v => v.toFixed(1);
  if (spd < 2.5) return `M${f(cx + 3.4)} ${f(cy)}a3.4 3.4 0 1 0 -6.8 0a3.4 3.4 0 1 0 6.8 0`;
  const a = (hdg * Math.PI) / 180,
    ux = Math.sin(a),
    uy = -Math.cos(a),
    px = -uy,
    py = ux,
    ex = cx + ux * L,
    ey = cy + uy * L;
  let d = `M${f(cx)} ${f(cy)}L${f(ex)} ${f(ey)}`,
    r = Math.round(spd / 5) * 5,
    o = 0;
  while (r >= 50) {
    const sx = ex - ux * o,
      sy = ey - uy * o;
    d += `M${f(sx)} ${f(sy)}L${f(sx + px * B - ux * B * 0.4)} ${f(sy + py * B - uy * B * 0.4)}L${f(sx - ux * B * 0.7)} ${f(sy - uy * B * 0.7)}Z`;
    r -= 50;
    o += B * 0.85;
  }
  while (r >= 10) {
    const sx = ex - ux * o,
      sy = ey - uy * o;
    d += `M${f(sx)} ${f(sy)}L${f(sx + px * B - ux * B * 0.35)} ${f(sy + py * B - uy * B * 0.35)}`;
    r -= 10;
    o += B * 0.5;
  }
  if (r >= 5) {
    if (o == 0) o = B * 0.5;
    const sx = ex - ux * o,
      sy = ey - uy * o;
    d += `M${f(sx)} ${f(sy)}L${f(sx + px * B * 0.55 - ux * B * 0.2)} ${f(sy + py * B * 0.55 - uy * B * 0.2)}`;
  }
  return d;
}

const rgba = c => `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;

// lowest and highest pressure of a map (kept on it)
export const prOf = W => {
  if (!W.pr) {
    let a = 1e9,
      b = -1e9;
    for (let j = 0; j < W.Y; j++)
      for (let i = 0; i < W.X; i++) {
        const p = W.cell(i, j).p;
        if (p < a) a = p;
        if (p > b) b = p;
      }
    W.pr = [a, b];
  }
  return W.pr;
};

// the legend of a filter (HTML)
export const legend = (mode, W, lv) => {
  const bar = (sts, a, b, u) =>
    `<span class="wxlg"><i style="background:linear-gradient(90deg,${sts.map(s => rgba(s[1])).join(',')})"></i><span>${a}</span><span style="margin-left:auto">${b} ${u}</span></span>`;
  if (mode == 'cond')
    return WX_COND.map(
      (n, i) =>
        `<span class="wxlk"><i style="${i ? 'background:' + rgba([PAL[i][0], PAL[i][1], PAL[i][2], 1]) : 'background:transparent;border:1px solid #cfd8e2;box-sizing:border-box'}"></i>${n}</span>`
    ).join('');
  if (mode == 'wind')
    return bar(RW, '0', '90', 'kt · barbs at ' + (WX_ALT[lv] ? fmt(WX_ALT[lv]) + ' ft' : 'the surface'));
  if (mode == 'temp') return bar(RT, '−20', '40', '°C at the surface');
  if (mode == 'press') {
    const p = prOf(W);
    return `<span class="wxlk"><i style="background:rgba(120,150,230,.6)"></i>low → high pressure (this map: ${fmt(p[0], 0)} to ${fmt(p[1], 0)} mbar)</span>`;
  }
  if (mode == 'cloud')
    return `<span class="wxlk"><i style="background:rgba(255,255,255,.7)"></i>more cumulus = whiter (density 1-13); the altitude is in the cell data</span>`;
  return bar(RV, '0', '60', 'km');
};

const cellColor = (c, mode, W) => {
  if (mode == 'cond') return PAL[Math.min(3, Math.max(0, c.cond))];
  if (mode == 'wind') return ramp(RW, c.spd);
  if (mode == 'temp') return ramp(RT, c.t);
  if (mode == 'press') {
    const p = prOf(W),
      t = (c.p - p[0]) / Math.max(1, p[1] - p[0]);
    return lerp([70, 90, 190, 0.5], [200, 110, 220, 0.7], t);
  }
  if (mode == 'cloud') return c.cu >= 9999 ? [0, 0, 0, 0] : [255, 255, 255, 0.12 + 0.6 * Math.min(1, c.dens / 13)];
  return ramp(RV, c.fogEnd);
};

// draws the weather W (layer lv for the wind) with the filter mode into group (panes wxP and wxA of the map, made by the Map page), opacity op (%)
export function drawWx({ L, map, group, W, lv, mode, op, toLL }) {
  const cs = W.cs;
  group.clearLayers();
  const pn = map.getPane('wxP');
  if (pn) pn.style.opacity = String((op == null ? 100 : op) / 100);
  const cv = document.createElement('canvas');
  cv.width = W.X;
  cv.height = W.Y;
  const x = cv.getContext('2d'),
    im = x.createImageData(W.X, W.Y);
  for (let j = 0; j < W.Y; j++)
    for (let i = 0; i < W.X; i++) {
      const c = cellColor(W.cell(i, j, lv), mode, W);
      im.data.set([c[0], c[1], c[2], Math.round(c[3] * 255)], 4 * ((W.Y - 1 - j) * W.X + i));
    }
  x.putImageData(im, 0, 0);
  const nw = toLL(0, W.Y * cs),
    se = toLL(W.X * cs, 0);
  group.addLayer(
    L.imageOverlay(
      cv.toDataURL(),
      [
        [se[0], nw[1]],
        [nw[0], se[1]],
      ],
      { pane: 'wxP', interactive: false, className: 'wxcells' }
    )
  );
  if (mode == 'wind') {
    // barbs: as many as the zoom allows (about one every 46 px)
    const p0 = map.latLngToContainerPoint(toLL(10 * cs, 10 * cs)),
      p1 = map.latLngToContainerPoint(toLL(11 * cs, 10 * cs)),
      px = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
      step = Math.max(1, Math.min(8, Math.ceil(46 / px)));
    for (let j = Math.floor(step / 2); j < W.Y; j += step)
      for (let i = Math.floor(step / 2); i < W.X; i += step) {
        const c = W.cell(i, j, lv),
          d = barbPath(50, 50, c.hdg, c.spd, 27, 10);
        group.addLayer(
          L.marker(toLL((i + 0.5) * cs, (j + 0.5) * cs), {
            pane: 'wxA',
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'wxbb',
              iconSize: [0, 0],
              html: `<svg width="100" height="100" style="position:absolute;left:-50px;top:-50px"><path d="${d}" fill="#080e16" stroke="#080e16" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="#fff" stroke="#fff" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
            }),
          })
        );
      }
  }
}
