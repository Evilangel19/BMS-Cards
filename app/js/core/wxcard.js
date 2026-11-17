// The Weather card of the Kneeboard (1600 x 2400, light), three looks:
// SIGWX and RADAR: a chart of the weather around the route (SIGWX: cloud cover, rain, snow, fog, storms as on a significant weather chart; RADAR: the
// clouds as a satellite picture and the rain as radar echoes by intensity), both with the isobars and the centres of pressure; the profile along the route
// (terrain, clouds, rain, fog, 0 °C, contrails, winds aloft); the METAR and the TAF of the departure, the target, the landing and the alternate, decoded
// where they fit; the contrail levels.
// WIND: three charts of the wind and the temperature at the time of the target, at three levels (layers of the maps of BMS), and the contrail levels.
// The weather maps of BMS are cells of about 17 km: here they are read between the centres of the cells (bilinear), so the areas and the lines are smooth.
// D: {title, sub, dep, tot, land, route: [{x, y, alt, t, n}] (km, ft, ms; to the landing), tgt (index), altn: {x, y, id} | null, at(ms) -> map,
//     prof: [{d, x, y, t, alt, elev, cond, cu, dens, size, tcu, fogEnd, tt, contrail}], coast: [[[x, y]...]] (km), reports: [{lab, text, col}], contrail: [4]}
import { barbPath } from './wxlayer.js';

export const WXC_W = 1600,
  WXC_H = 2400;
const INK = '#1a1f2b',
  ROUTE = '#b0127c',
  FONT = 'Segoe UI, Arial, sans-serif',
  MONO = 'Consolas, "Courier New", monospace';
const p2 = n => String(n).padStart(2, '0');
const hm = ms => {
  const s = Math.floor(ms / 1000);
  return p2(((s % 86400) / 3600) | 0) + p2(((s % 3600) / 60) | 0) + 'Z';
};

// ---- fields of a map read between the cell centres
function field(W, key, lv = 0) {
  const X = W.X,
    Y = W.Y,
    a = new Float32Array(X * Y);
  for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) a[j * X + i] = key(W.cell(i, j, lv));
  return { a, X, Y, cs: W.cs };
}
// value at a point (km), bilinear between the centres
function bil(f, x, y) {
  const u = Math.max(0, Math.min(f.X - 1.0001, x / f.cs - 0.5)),
    v = Math.max(0, Math.min(f.Y - 1.0001, y / f.cs - 0.5)),
    i = Math.floor(u),
    j = Math.floor(v),
    s = u - i,
    t = v - j,
    A = f.a;
  return (
    A[j * f.X + i] * (1 - s) * (1 - t) +
    A[j * f.X + i + 1] * s * (1 - t) +
    A[(j + 1) * f.X + i] * (1 - s) * t +
    A[(j + 1) * f.X + i + 1] * s * t
  );
}
// a grid of the panel (gw x gh samples) of a field, smoothed by a box of r samples
function raster(f, V, gw, gh, r = 0) {
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const [x, y] = V.inv(((i + 0.5) / gw) * V.w, ((j + 0.5) / gh) * V.h);
      g[j * gw + i] = bil(f, x, y);
    }
  if (!r) return g;
  const o = new Float32Array(g.length);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      let s = 0,
        n = 0;
      for (let b = -r; b <= r; b++)
        for (let a = -r; a <= r; a++) {
          const ii = i + a,
            jj = j + b;
          if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
          s += g[jj * gw + ii];
          n++;
        }
      o[j * gw + i] = s / n;
    }
  return o;
}
// marching squares: the lines of a level on a grid, joined into polylines (panel px)
function isolines(g, gw, gh, lev, V) {
  const sx = V.w / gw,
    sy = V.h / gh,
    segs = [];
  const P = (i, j) => [(i + 0.5) * sx, (j + 0.5) * sy];
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const a = g[j * gw + i],
        b = g[j * gw + i + 1],
        c = g[(j + 1) * gw + i + 1],
        d = g[(j + 1) * gw + i];
      const k = (a > lev ? 8 : 0) | (b > lev ? 4 : 0) | (c > lev ? 2 : 0) | (d > lev ? 1 : 0);
      if (k == 0 || k == 15) continue;
      const e = (p, q, va, vb) => {
        const t = (lev - va) / (vb - va || 1e-9),
          A = P(...p),
          B = P(...q);
        return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      };
      const T = e([i, j], [i + 1, j], a, b),
        R = e([i + 1, j], [i + 1, j + 1], b, c),
        Bm = e([i, j + 1], [i + 1, j + 1], d, c),
        L = e([i, j], [i, j + 1], a, d);
      const add = (p, q) => segs.push([p, q]);
      switch (k) {
        case 1:
        case 14:
          add(L, Bm);
          break;
        case 2:
        case 13:
          add(Bm, R);
          break;
        case 3:
        case 12:
          add(L, R);
          break;
        case 4:
        case 11:
          add(T, R);
          break;
        case 5:
          add(L, T);
          add(Bm, R);
          break;
        case 6:
        case 9:
          add(T, Bm);
          break;
        case 7:
        case 8:
          add(L, T);
          break;
        case 10:
          add(T, R);
          add(L, Bm);
          break;
      }
    }
  // join the segments by their ends
  const key = p => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4),
    ends = new Map();
  segs.forEach((s, n) =>
    s.forEach((p, e) => {
      const k = key(p);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push([n, e]);
    })
  );
  const used = new Uint8Array(segs.length),
    lines = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1;
    const line = [segs[n][0], segs[n][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0],
          nx = (ends.get(key(tip)) || []).find(([m]) => !used[m]);
        if (!nx) break;
        used[nx[0]] = 1;
        const q = segs[nx[0]][1 - nx[1]];
        if (dir) line.push(q);
        else line.unshift(q);
      }
    }
    lines.push(line);
  }
  return lines;
}
const lenOf = l => l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
// a point at a share of a polyline, with its direction
function along(l, share) {
  const L = lenOf(l) * share;
  let s = 0;
  for (let i = 1; i < l.length; i++) {
    const d = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    if (s + d >= L) {
      const t = (L - s) / (d || 1);
      return {
        x: l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t,
        y: l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t,
        a: Math.atan2(l[i][1] - l[i - 1][1], l[i][0] - l[i - 1][0]),
      };
    }
    s += d;
  }
  const p = l[l.length - 1];
  return { x: p[0], y: p[1], a: 0 };
}
// the edge of a SIGWX cloud area: small arcs along the line
function scallops(x, l, r) {
  const L = lenOf(l);
  if (L < r * 6) return;
  const n = Math.floor(L / (2 * r));
  let prev = along(l, 0);
  for (let k = 1; k <= n; k++) {
    const q = along(l, k / n),
      mx = (prev.x + q.x) / 2,
      my = (prev.y + q.y) / 2,
      a = Math.atan2(q.y - prev.y, q.x - prev.x),
      d = Math.hypot(q.x - prev.x, q.y - prev.y) / 2;
    x.beginPath();
    x.arc(mx, my, d, a + Math.PI, a, false);
    x.stroke();
    prev = q;
  }
}
const poly = (x, l) => {
  x.beginPath();
  l.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
};
function barb(x, cx, cy, hdg, spd, L = 26) {
  x.stroke(new Path2D(barbPath(cx, cy, hdg, spd, L, L * 0.42)));
}
function tagBox(x, t, cx, cy, fs = 17) {
  x.font = `bold ${fs}px ${FONT}`;
  const w = x.measureText(t).width + 14;
  x.fillStyle = INK;
  x.beginPath();
  if (x.roundRect) x.roundRect(cx - w / 2, cy - fs * 0.85, w, fs * 1.7, 5);
  else x.rect(cx - w / 2, cy - fs * 0.85, w, fs * 1.7);
  x.fill();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(t, cx, cy + 1);
}

// ---- the decoding of a report, one line
const COV = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast' };
export function decodeWx(m) {
  const o = [];
  for (const t of String(m).split(/\s+/)) {
    let r;
    if (t == '00000KT') o.push('calm');
    else if ((r = /^(\d{3}|VRB)(\d\d)(?:G(\d\d))?KT$/.exec(t)))
      o.push(
        (r[1] == 'VRB' ? 'wind variable ' : 'wind ' + r[1] + '° ') + +r[2] + ' kt' + (r[3] ? ' gust ' + +r[3] : '')
      );
    else if (t == 'CAVOK') o.push('CAVOK');
    else if (t == 'NSC') o.push('no significant cloud');
    else if (t == 'NSW') o.push('no more weather');
    else if (/^\d{4}$/.test(t)) o.push(t == '9999' ? 'vis 10 km+' : 'vis ' + (+t / 1000).toFixed(1) + ' km');
    else if ((r = /^(FEW|SCT|BKN|OVC)(\d{3})(TCU|CB)?$/.exec(t)))
      o.push(COV[r[1]] + ' ' + +r[2] * 100 + ' ft' + (r[3] ? ' ' + r[3] : ''));
    else if ((r = /^([-+]?)(SH|TS)?(RASN|RA|SN)$/.exec(t)))
      o.push(
        (r[1] == '-' ? 'light ' : r[1] == '+' ? 'heavy ' : '') +
          (r[2] == 'SH' ? 'showers of ' : r[2] == 'TS' ? 'thunderstorm with ' : '') +
          (r[3] == 'RASN' ? 'rain and snow' : r[3] == 'SN' ? 'snow' : 'rain')
      );
    else if (t == 'BR') o.push('mist');
    else if (t == 'FG') o.push('fog');
    else if ((r = /^(M?\d\d)\/(M?\d\d)$/.exec(t)))
      o.push('temp ' + r[1].replace('M', '-') + ' / dew ' + r[2].replace('M', '-'));
    else if ((r = /^A(\d\d)(\d\d)$/.exec(t))) o.push('alt ' + r[1] + '.' + r[2]);
    else if ((r = /^Q(\d{3,4})$/.exec(t))) o.push('QNH ' + r[1]);
  }
  return o.join(' · ');
}
// a TAF in its parts: [label, text]
export function tafParts(t) {
  const P = String(t).split(/ (?=FM\d{6}|TEMPO )/);
  return P.map((s, i) => {
    if (!i) return ['from start', s.replace(/^TAF \S+ \S+ \S+ /, '')];
    if (s.startsWith('FM')) return ['from ' + s.slice(4, 6) + ':' + s.slice(6, 8) + 'Z', s.slice(9)];
    const m = /^TEMPO (\S+) (.*)$/.exec(s);
    return m ? ['temporarily ' + m[1], m[2]] : ['', s];
  });
}

// ---- a soft texture for the RADAR chart (value noise on the ground, km): echoes and clouds are not smooth blobs
const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function vnoise(x, y) {
  const i = Math.floor(x),
    j = Math.floor(y),
    s = x - i,
    t = y - j,
    u = s * s * (3 - 2 * s),
    v = t * t * (3 - 2 * t);
  const a = hash(i, j),
    b = hash(i + 1, j),
    c = hash(i, j + 1),
    d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (e, n) => 0.55 * vnoise(e / 16, n / 16) + 0.3 * vnoise(e / 7 + 9, n / 7) + 0.15 * vnoise(e / 3, n / 3 + 5);
// a colour scale: stops [value, r, g, b, alpha]
function ramp(S, v) {
  if (v <= S[0][0]) return null;
  for (let k = 1; k < S.length; k++)
    if (v <= S[k][0]) {
      const a = S[k - 1],
        b = S[k],
        t = (v - a[0]) / (b[0] - a[0]);
      return [1, 2, 3, 4].map(q => a[q] + (b[q] - a[q]) * t);
    }
  return S[S.length - 1].slice(1);
}
// the radar scale: rain green, yellow, orange, red, magenta for the storms; snow in blues
const RAIN = [
    [0.35, 120, 200, 120, 0],
    [0.6, 110, 196, 110, 0.45],
    [1.2, 46, 160, 67, 0.7],
    [1.9, 236, 214, 50, 0.88],
    [2.5, 242, 140, 40, 0.9],
    [3.1, 220, 45, 45, 0.92],
    [3.8, 196, 40, 168, 0.95],
  ],
  SNOW = [
    [0.35, 170, 210, 240, 0],
    [0.6, 160, 205, 242, 0.45],
    [1.3, 100, 160, 232, 0.72],
    [2.2, 55, 105, 214, 0.88],
    [3.2, 40, 55, 180, 0.92],
  ],
  // the speed of the wind (kt): light blues to purples
  ISOT = [
    [8, 255, 255, 255, 0],
    [12, 210, 230, 248, 0.5],
    [20, 180, 214, 243, 0.55],
    [30, 140, 190, 236, 0.55],
    [45, 150, 160, 232, 0.55],
    [60, 180, 140, 222, 0.55],
    [80, 216, 120, 200, 0.55],
    [100, 236, 100, 150, 0.55],
    [130, 236, 80, 90, 0.6],
  ];
// a picture of the panel (gw x gh) from a colour function, stretched smooth onto the chart
function paint(x, gw, gh, PW, PH, col) {
  const img = document.createElement('canvas');
  img.width = gw;
  img.height = gh;
  const ix = /** @type {CanvasRenderingContext2D} */ (img.getContext('2d')),
    id = ix.createImageData(gw, gh);
  for (let k = 0; k < gw * gh; k++) {
    const c = col(k);
    if (c) id.data.set([c[0], c[1], c[2], Math.round(c[3] * 255)], k * 4);
  }
  ix.putImageData(id, 0, 0);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, PW, PH);
}
// the ISA lapse rate: the maps of BMS have the temperature at the surface only
const tAt = (t, alt) => t - (1.98 * alt) / 1000;
const LOOK = {
  sigwx: { sea: '#dcecf6', land: '#f6f3ea', coast: '#8a97a6', tag: '#c0392b', name: 'SIGWX' },
  radar: { sea: '#a9bccb', land: '#d6d2c6', coast: '#86909a', tag: '#1f8a4c', name: 'RADAR' },
  wind: { sea: '#eef3f7', land: '#f8f7f2', coast: '#a3adb7', tag: '#5b3fb0', name: 'WIND' },
};

// the isobars every 2 hPa with their value, a small h and l on the high and the low side; a big H or L on the centres of pressure
function pressure(x, W, V, GW, GH, lineCol, labCol) {
  const pr = field(W, c => c.p),
    gP = raster(pr, V, GW, GH, 3);
  let lo = 1e9,
    hi = -1e9;
  gP.forEach(v => ((lo = Math.min(lo, v)), (hi = Math.max(hi, v))));
  for (let lev = Math.ceil(lo / 2) * 2; lev <= hi; lev += 2) {
    x.strokeStyle = lineCol;
    x.lineWidth = 1.3;
    isolines(gP, GW, GH, lev, V).forEach(l => {
      if (lenOf(l) < 90) return;
      poly(x, l);
      x.stroke();
      const m = along(l, 0.5),
        nx = -Math.sin(m.a),
        ny = Math.cos(m.a),
        [e1, n1] = V.inv(m.x + nx * 14, m.y + ny * 14),
        up = bil(pr, e1, n1) > lev; // the side of the normal is the high side
      x.fillStyle = '#fff';
      x.fillRect(m.x - 27, m.y - 13, 54, 26);
      x.fillStyle = labCol;
      x.font = `18px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(lev), m.x, m.y);
      // a serif letter: a sans-serif l looks like a bar
      x.font = `bold italic 22px Georgia, 'Times New Roman', serif`;
      const s = up ? 1 : -1;
      x.fillStyle = '#1f4fbf';
      x.fillText('h', m.x + nx * 26 * s, m.y + ny * 26 * s);
      x.fillStyle = '#d0312d';
      x.fillText('l', m.x - nx * 26 * s, m.y - ny * 26 * s);
    });
  }
  const sm = (i, j) => {
    let s = 0,
      n = 0;
    for (let b = -1; b <= 1; b++)
      for (let a = -1; a <= 1; a++) {
        const ii = i + a,
          jj = j + b;
        if (ii < 0 || jj < 0 || ii >= W.X || jj >= W.Y) continue;
        s += pr.a[jj * W.X + ii];
        n++;
      }
    return s / n;
  };
  for (let j = 3; j < W.Y - 3; j++)
    for (let i = 3; i < W.X - 3; i++) {
      const v = sm(i, j);
      let mx = true,
        mn = true;
      for (let b = -4; b <= 4 && (mx || mn); b++)
        for (let a = -4; a <= 4; a++) {
          if (!a && !b) continue;
          const w = sm(Math.max(0, Math.min(W.X - 1, i + a)), Math.max(0, Math.min(W.Y - 1, j + b)));
          if (w >= v) mx = false;
          if (w <= v) mn = false;
        }
      if (!mx && !mn) continue;
      const [u, vv] = V.px((i + 0.5) * W.cs, (j + 0.5) * W.cs);
      if (u < 50 || vv < 50 || u > V.w - 50 || vv > V.h - 70) continue;
      x.fillStyle = mx ? '#1f4fbf' : '#d0312d';
      x.font = `bold 62px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(mx ? 'H' : 'L', u, vv);
      x.font = `bold 21px ${FONT}`;
      x.fillText(String(Math.round(pr.a[j * W.X + i])), u, vv + 44);
    }
}

// ---- one chart around the route: B the box on the card; mode sigwx, radar or wind (alt: the level of the wind chart)
function chart(x, D, B, W, mode, alt = 0) {
  const { X: PX, Y: PY, W: PW, H: PH } = B,
    L = LOOK[mode],
    pts = D.route.concat(D.altn ? [D.altn] : []),
    xs = pts.map(p => p.x),
    ys = pts.map(p => p.y),
    cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2,
    wk = Math.max(Math.max(...xs) - Math.min(...xs), ((Math.max(...ys) - Math.min(...ys)) * PW) / PH, 120) * 1.35,
    hk = (wk * PH) / PW,
    V = {
      w: PW,
      h: PH,
      px: (e, n) => [((e - (cx - wk / 2)) / wk) * PW, ((cy + hk / 2 - n) / hk) * PH],
      inv: (u, v) => [cx - wk / 2 + (u / PW) * wk, cy + hk / 2 - (v / PH) * hk],
    },
    kmPx = PW / wk;
  x.save();
  x.translate(PX, PY);
  x.beginPath();
  x.rect(0, 0, PW, PH);
  x.clip();
  x.fillStyle = L.sea;
  x.fillRect(0, 0, PW, PH);
  x.fillStyle = L.land;
  x.strokeStyle = L.coast;
  x.lineWidth = 1.2;
  for (const r of D.coast || []) {
    x.beginPath();
    r.forEach((q, i) => {
      const [u, v] = V.px(q[0], q[1]);
      i ? x.lineTo(u, v) : x.moveTo(u, v);
    });
    x.closePath();
    x.fill();
    x.stroke();
  }
  const coasts = col => {
    x.strokeStyle = col;
    x.lineWidth = 1.2;
    for (const r of D.coast || []) {
      x.beginPath();
      r.forEach((q, i) => {
        const [u, v] = V.px(q[0], q[1]);
        i ? x.lineTo(u, v) : x.moveTo(u, v);
      });
      x.closePath();
      x.stroke();
    }
  };
  let legend = '';
  if (W && mode == 'sigwx') {
    const GW = 190,
      GH = Math.round((GW * PH) / PW),
      cov = field(W, c => (c.cond > 0 && c.cu !== 10000 ? c.dens : 0)),
      rain = field(W, c => (c.cond >= 2 && c.dens > 7 ? 1 : 0)),
      fogF = field(W, c => (c.fogEnd < 5 ? 1 : 0)),
      gC = raster(cov, V, GW, GH, 2),
      gR = raster(rain, V, GW, GH, 2);
    // cloud cover: soft greys; BKN/OVC: scalloped edge; rain areas: green line; symbols on a lattice
    paint(x, GW, GH, PW, PH, k => {
      const c = Math.max(0, Math.min(1, (gC[k] - 2) / 11));
      return c > 0.08 ? [150, 150, 150, 0.12 + c * 0.38] : null;
    });
    x.strokeStyle = '#5a6472';
    x.lineWidth = 1.6;
    isolines(gC, GW, GH, 7.5, V).forEach(l => lenOf(l) > 60 && scallops(x, l, 7));
    x.strokeStyle = '#2e9b55';
    x.lineWidth = 2.4;
    isolines(gR, GW, GH, 0.5, V).forEach(l => lenOf(l) > 40 && (poly(x, l), x.stroke()));
    const tF = field(W, c => c.t);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let v = 40; v < PH; v += 80)
      for (let u = 40 + ((v / 80) % 2) * 40; u < PW; u += 80) {
        const [e, n] = V.inv(u, v);
        if (bil(rain, e, n) > 0.5) {
          const snow = bil(tF, e, n) <= 0;
          x.fillStyle = '#1f7a3d';
          x.font = `bold ${snow ? 27 : 19}px ${FONT}`;
          x.fillText(snow ? '*' : '•', u, v);
        } else if (bil(fogF, e, n) > 0.5) {
          x.fillStyle = '#c9971a';
          x.font = `bold 25px ${FONT}`;
          x.fillText('≡', u, v);
        }
      }
    x.fillStyle = '#c0392b';
    x.font = `bold 21px ${FONT}`;
    for (let j = 0; j < W.Y; j++)
      for (let i = 0; i < W.X; i++) {
        const c = W.cell(i, j);
        if (c.cond >= 3 && c.tcu) {
          const [u, v] = V.px((i + 0.5) * W.cs, (j + 0.5) * W.cs);
          if (u > 0 && v > 0 && u < PW && v < PH) x.fillText('CB', u, v);
        }
      }
    pressure(x, W, V, GW, GH, '#7b8794', '#4b5563');
    legend =
      'Cloud cover grey · BKN/OVC scalloped · rain area green: • rain  * snow · ≡ fog · CB storm · isobars hPa (h high, l low side) · wind at cruise level';
  } else if (W && mode == 'radar') {
    // a satellite picture of the clouds, and over it the echoes of the radar by intensity
    const GW = 300,
      GH = Math.round((GW * PH) / PW),
      cov = field(W, c => (c.cond > 0 && c.cu !== 10000 ? c.dens : 0)),
      echo = field(W, c => {
        if (!(c.cond >= 2 && c.dens > 7 && c.cu !== 10000)) return 0;
        let v = c.cond == 2 ? 1 : c.dens >= 12 ? 2.6 : 2;
        if (c.tcu && c.cond >= 3) v = 3.6;
        return v + (c.shower ? 0.4 : 0);
      }),
      tF = field(W, c => c.t),
      gC = raster(cov, V, GW, GH, 2),
      gE = raster(echo, V, GW, GH, 2),
      gT = raster(tF, V, GW, GH, 1),
      tex = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const [e, n] = V.inv(((i + 0.5) / GW) * PW, ((j + 0.5) / GH) * PH);
        tex[j * GW + i] = fbm(e, n);
      }
    paint(x, GW, GH, PW, PH, k => {
      const c = Math.max(0, Math.min(1, (gC[k] - 1.5) / 11)) * (0.65 + 0.7 * tex[k]);
      return c > 0.05 ? [255, 255, 255, Math.min(0.92, Math.pow(c, 0.8) * 0.9)] : null;
    });
    // the texture breaks the light rain into cells, as on a radar picture
    paint(x, GW, GH, PW, PH, k => ramp(gT[k] <= 0 ? SNOW : RAIN, gE[k] * (0.4 + 1.05 * tex[k])));
    // the coasts over the echoes, as on a radar display
    coasts('rgba(40,46,54,.75)');
    for (let j = 0; j < W.Y; j++)
      for (let i = 0; i < W.X; i++) {
        const c = W.cell(i, j);
        if (c.cond >= 3 && c.tcu) {
          const [u, v] = V.px((i + 0.5) * W.cs, (j + 0.5) * W.cs);
          if (u > 0 && v > 0 && u < PW && v < PH) {
            // a storm cell: a lightning mark
            x.fillStyle = '#fff';
            x.strokeStyle = '#7a1060';
            x.lineWidth = 2;
            x.beginPath();
            x.moveTo(u + 3, v - 14);
            x.lineTo(u - 6, v + 2);
            x.lineTo(u, v + 2);
            x.lineTo(u - 4, v + 14);
            x.lineTo(u + 7, v - 3);
            x.lineTo(u + 1, v - 3);
            x.closePath();
            x.fill();
            x.stroke();
          }
        }
      }
    pressure(x, W, V, GW, GH, 'rgba(38,46,58,.7)', INK);
    legend =
      'Satellite clouds white · radar echoes by intensity (scale below right) · ⚡ storm cell · isobars hPa (h high, l low side)';
  } else if (W && mode == 'wind') {
    // the speed in colour, lines every 20 kt, the isotherms every 5 °C (0 °C blue), a lattice of barbs with the temperature
    const GW = 190,
      GH = Math.round((GW * PH) / PW),
      U = new Float32Array(W.X * W.Y),
      Vv = new Float32Array(W.X * W.Y);
    for (let j = 0; j < W.Y; j++)
      for (let i = 0; i < W.X; i++) {
        const w = W.wind((i + 0.5) * W.cs, (j + 0.5) * W.cs, alt),
          r = (w.hdg * Math.PI) / 180;
        U[j * W.X + i] = -w.spd * Math.sin(r);
        Vv[j * W.X + i] = -w.spd * Math.cos(r);
      }
    const fU = { a: U, X: W.X, Y: W.Y, cs: W.cs },
      fV = { a: Vv, X: W.X, Y: W.Y, cs: W.cs },
      tF = field(W, c => tAt(c.t, alt)),
      gU = raster(fU, V, GW, GH, 2),
      gV = raster(fV, V, GW, GH, 2),
      gS = gU.map((u, k) => Math.hypot(u, gV[k])),
      gT = raster(tF, V, GW, GH, 2);
    paint(x, GW, GH, PW, PH, k => ramp(ISOT, gS[k]));
    coasts('rgba(70,80,92,.8)');
    x.strokeStyle = '#5b6b8c';
    x.lineWidth = 1.4;
    x.font = `bold 17px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let lev = 20; lev <= 140; lev += 20)
      isolines(gS, GW, GH, lev, V).forEach(l => {
        if (lenOf(l) < 80) return;
        poly(x, l);
        x.stroke();
        const m = along(l, 0.3);
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.fillRect(m.x - 25, m.y - 11, 50, 22);
        x.fillStyle = '#3d4a66';
        x.fillText(lev + ' kt', m.x, m.y);
      });
    let tl = 1e9,
      th = -1e9;
    gT.forEach(v => ((tl = Math.min(tl, v)), (th = Math.max(th, v))));
    for (let lev = Math.ceil(tl / 5) * 5; lev <= th; lev += 5) {
      const z = lev == 0;
      x.strokeStyle = z ? '#1f6fd1' : '#c0392b';
      x.lineWidth = z ? 2.6 : 1.5;
      x.setLineDash(z ? [] : [10, 7]);
      isolines(gT, GW, GH, lev, V).forEach(l => {
        if (lenOf(l) < 80) return;
        poly(x, l);
        x.stroke();
        const m = along(l, 0.7);
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.fillRect(m.x - 25, m.y - 11, 50, 22);
        x.fillStyle = z ? '#1f6fd1' : '#a52a1f';
        x.fillText(lev + '°', m.x, m.y);
      });
    }
    x.setLineDash([]);
    const fS = { a: U.map((u, k) => Math.hypot(u, Vv[k])), X: W.X, Y: W.Y, cs: W.cs };
    x.strokeStyle = INK;
    x.fillStyle = INK;
    for (let v = 70; v < PH - 40; v += 115)
      for (let u = 70 + (((v - 70) / 115) % 2) * 57; u < PW - 40; u += 115) {
        const [e, n] = V.inv(u, v),
          uu = bil(fU, e, n),
          vv = bil(fV, e, n),
          s = Math.max(bil(fS, e, n), Math.hypot(uu, vv)),
          h = ((Math.atan2(-uu, -vv) * 180) / Math.PI + 360) % 360;
        x.lineWidth = 2;
        if (s < 3) {
          x.beginPath();
          x.arc(u, v, 7, 0, 7);
          x.stroke();
        } else barb(x, u, v, h, s, 34);
        x.font = `bold 18px ${FONT}`;
        x.textAlign = 'left';
        x.textBaseline = 'top';
        const t = Math.round(bil(tF, e, n));
        x.fillStyle = t <= 0 ? '#1f5fa8' : '#a52a1f';
        x.fillText((t > 0 ? '+' : '') + t, u + 8, v + 8);
        x.fillStyle = INK;
      }
    legend =
      'Wind speed in colour, lines every 20 kt · isotherms every 5 °C (0 °C blue) · barbs with the temperature (°C, standard lapse rate)';
  }
  // the route, the waypoints, the airbases
  const thin = mode == 'wind',
    rp = D.route.map(p => V.px(p.x, p.y));
  x.strokeStyle = ROUTE;
  x.lineWidth = thin ? 3 : 4;
  x.lineJoin = 'round';
  poly(x, rp);
  x.stroke();
  if (D.altn && rp.length) {
    const a = V.px(D.altn.x, D.altn.y);
    x.setLineDash([12, 8]);
    x.lineWidth = 2.4;
    poly(x, [rp[rp.length - 1], a]);
    x.stroke();
    x.setLineDash([]);
  }
  rp.forEach(([u, v], i) => {
    x.fillStyle = '#fff';
    x.strokeStyle = ROUTE;
    x.lineWidth = 2.6;
    x.beginPath();
    x.arc(u, v, thin ? 7 : 9, 0, 7);
    x.fill();
    x.stroke();
    x.fillStyle = '#7a0d57';
    x.font = `bold ${thin ? 18 : 21}px ${FONT}`;
    x.textAlign = 'left';
    x.textBaseline = 'bottom';
    x.fillText(String(D.route[i].n), u + 11, v - 6);
  });
  if (rp.length) {
    const a = rp[0],
      b = rp[rp.length - 1],
      same = Math.hypot(a[0] - b[0], a[1] - b[1]) < 30,
      fs = thin ? 18 : 21;
    tagBox(x, same ? 'DEP / LDG ' + (D.depId || '') : 'DEP ' + (D.depId || ''), a[0], a[1] + 40, fs);
    if (!same) tagBox(x, 'LDG ' + (D.ldgId || ''), b[0], b[1] + 40, fs);
    if (D.tgt >= 0 && rp[D.tgt]) tagBox(x, 'TGT', rp[D.tgt][0], rp[D.tgt][1] - 40, fs);
    if (D.altn) {
      const q = V.px(D.altn.x, D.altn.y);
      tagBox(x, 'ALTN ' + (D.altn.id || ''), q[0], q[1] + 36, fs);
    }
  }
  // winds at the cruise level on a few waypoints (the wind chart has its own)
  if (W && !thin && D.route.length > 2) {
    x.strokeStyle = INK;
    x.lineWidth = 2;
    const cr = Math.max(...D.route.map(p => p.alt)),
      step = Math.max(1, Math.floor(D.route.length / 4));
    for (let i = 1; i < D.route.length - 1; i += step) {
      const p = D.route[i],
        Wi = D.at(p.t) || W,
        w = Wi.wind(p.x, p.y, cr),
        [u, v] = V.px(p.x, p.y);
      barb(x, u - 30, v + 30, w.hdg, w.spd, 30);
    }
  }
  // legend, scale, north
  x.font = `17px ${FONT}`;
  const lw = x.measureText(legend).width;
  if (legend) {
    x.fillStyle = 'rgba(255,255,255,.9)';
    x.fillRect(8, PH - 36, lw + 18, 28);
    x.fillStyle = INK;
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    x.fillText(legend, 17, PH - 22);
  }
  // the colour scales of the radar and of the wind
  const scale = (S, labs, x0, y0, w) => {
    labs.forEach((l, k) => {
      // the colour as it shows on a light ground
      const c = ramp(S, l[0]) || [255, 255, 255, 1],
        m = q => (c[q] * c[3] + 255 * (1 - c[3])) | 0;
      x.fillStyle = `rgb(${m(0)},${m(1)},${m(2)})`;
      x.fillRect(x0 + k * w, y0, w, 18);
    });
    x.fillStyle = INK;
    x.font = `15px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'top';
    labs.forEach((l, k) => x.fillText(l[1], x0 + k * w + w / 2, y0 + 21));
  };
  const sx = PW - 20;
  if (mode == 'radar') {
    const labs = [
      [0.8, 'light'],
      [1.5, 'mod'],
      [2.3, 'heavy'],
      [2.9, 'v.heavy'],
      [3.7, 'storm'],
    ];
    x.fillStyle = 'rgba(255,255,255,.9)';
    x.fillRect(PW - 20 - 5 * 66 - 10 - 2 * 66, PH - 102, 7 * 66 + 20, 52);
    scale(RAIN, labs, PW - 20 - 7 * 66, PH - 96, 66);
    scale(
      SNOW,
      [
        [1, 'snow'],
        [2.4, 'hvy sn'],
      ],
      PW - 20 - 2 * 66,
      PH - 96,
      66
    );
  } else if (mode == 'wind') {
    const labs = [12, 20, 30, 45, 60, 80, 100, 130].map(v => [v, String(v)]);
    x.fillStyle = 'rgba(255,255,255,.92)';
    x.fillRect(PW - 20 - 8 * 46 - 10 - 30, PH - 102, 8 * 46 + 50, 52);
    scale(ISOT, labs, PW - 20 - 8 * 46 - 30, PH - 96, 46);
    x.textAlign = 'left';
    x.fillText('kt', PW - 46, PH - 92);
  }
  const nm50 = 92.6 * kmPx;
  x.fillStyle = INK;
  x.fillRect(sx - nm50, PH - 42, nm50, 4);
  x.font = `17px ${FONT}`;
  x.textAlign = 'right';
  x.textBaseline = 'middle';
  x.fillText('50 NM', sx, PH - 22);
  x.beginPath();
  x.moveTo(40, 54);
  x.lineTo(31, 80);
  x.lineTo(49, 80);
  x.closePath();
  x.fill();
  x.font = `bold 24px ${FONT}`;
  x.textAlign = 'center';
  x.fillText('N', 40, 100);
  x.restore();
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(PX, PY, PW, PH);
}

function header(x, D, mode, sub) {
  const L = LOOK[mode];
  x.fillStyle = '#fff';
  x.fillRect(0, 0, WXC_W, WXC_H);
  x.fillStyle = INK;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = `bold 56px ${FONT}`;
  x.fillText('WEATHER', 40, 84);
  const tw = x.measureText('WEATHER').width;
  x.font = `28px ${FONT}`;
  x.fillText(String(D.title || '').slice(0, 60), 70 + tw, 80);
  x.textAlign = 'right';
  x.font = `bold 32px ${FONT}`;
  x.fillStyle = L.tag;
  x.fillText(L.name, 1560, 80);
  x.textAlign = 'left';
  x.font = `24px ${FONT}`;
  x.fillStyle = '#4a5568';
  x.fillText(
    [
      D.dep != null ? 'DEP ' + hm(D.dep) : '',
      D.tot != null ? 'TOT ' + hm(D.tot) : '',
      D.land != null ? 'LDG ' + hm(D.land) : '',
    ]
      .filter(Boolean)
      .join(' · ') + (sub ? '     ' + sub : ''),
    40,
    124
  );
  x.fillStyle = INK;
  x.fillRect(40, 140, 1520, 3);
}
function contrails(x, D, y) {
  if (!D.contrail) return;
  x.fillStyle = INK;
  x.font = `bold 24px ${FONT}`;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  const c = D.contrail.map(v => Math.round(v / 100) * 100);
  x.fillText(`CONTRAILS   sunny ${c[0]} · fair ${c[1]} · poor ${c[2]} · inclement ${c[3]} ft`, 40, y);
}

// the levels of the WIND card: layers of the weather maps of BMS (low, medium, high)
export const WIND_LEVELS = [6000, 18000, 30000];

/** draws the card on a 1600 x 2400 context; style 'sigwx', 'radar' or 'wind' */
export function drawWxCard(x, D, style = 'sigwx') {
  const mode = LOOK[style] ? style : 'sigwx',
    tot = D.tot != null ? D.tot : D.dep,
    W = D.at(tot);
  x.save();
  if (mode == 'wind') {
    // three charts of the wind and the temperature at the time of the target, on three levels
    header(x, D, mode, 'Winds and temperatures aloft at ' + hm(tot) + (D.tot != null ? ' (TOT)' : ''));
    const H = 620;
    WIND_LEVELS.forEach((a, k) => {
      const y0 = 168 + k * (H + 84);
      let z0 = null;
      if (W) {
        // the freezing level over the target (above its ground), for the line of the title
        const p = D.route[D.tgt >= 0 ? D.tgt : 0],
          S = D.prof || [],
          g = p && S.length ? S.reduce((b, q) => (Math.abs(q.d - p.d) < Math.abs(b.d - p.d) ? q : b)).elev || 0 : 0;
        z0 = p ? g + (Math.max(0, W.at(p.x, p.y).t) / 1.98) * 1000 : null;
      }
      x.fillStyle = INK;
      x.font = `bold 30px ${FONT}`;
      x.textAlign = 'left';
      x.textBaseline = 'alphabetic';
      x.fillText('FL' + String(a / 100).padStart(3, '0'), 40, y0 + 36);
      x.font = `22px ${FONT}`;
      x.fillStyle = '#4a5568';
      x.fillText(
        a.toLocaleString('en-US').replace(/,/g, ' ') +
          ' ft · wind and temperature' +
          (k == 0 && z0 != null ? ' · 0 °C over the target at ' + Math.round(z0 / 100) * 100 + ' ft' : ''),
        170,
        y0 + 36
      );
      chart(x, D, { X: 40, Y: y0 + 52, W: 1520, H }, W, 'wind', a);
    });
    contrails(x, D, WXC_H - 52);
    x.font = `18px ${FONT}`;
    x.fillStyle = '#4a5568';
    x.fillText('Temperatures aloft from the surface with the standard lapse rate (2 °C per 1 000 ft).', 40, WXC_H - 20);
    x.restore();
    return;
  }
  header(x, D, mode, D.sub);
  chart(x, D, { X: 40, Y: 156, W: 1520, H: 960 }, W, mode);

  // ---- the profile along the route
  const QX = 150,
    QY = 1180,
    QW = 1410,
    QH = 420,
    TOP = 40000,
    S = D.prof || [],
    dTot = S.length ? S[S.length - 1].d : 1,
    qx = d => QX + (d / dTot) * QW,
    qy = a => QY + QH - (Math.max(0, a) / TOP) * QH;
  x.fillStyle = INK;
  x.font = `bold 23px ${FONT}`;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillText('PROFILE ALONG THE ROUTE', 40, QY - 14);
  const pw = x.measureText('PROFILE ALONG THE ROUTE').width;
  x.font = `19px ${FONT}`;
  x.fillStyle = '#4a5568';
  x.fillText('clouds · rain · fog · 0 °C · contrails · winds 3, 9, 18, 30 thousand ft', 70 + pw, QY - 14);
  x.fillStyle = mode == 'sigwx' ? '#eef6fb' : '#f1f4f7';
  x.fillRect(QX, QY, QW, QH);
  x.strokeStyle = '#d5dde5';
  x.lineWidth = 1;
  x.fillStyle = INK;
  x.font = `18px ${FONT}`;
  x.textAlign = 'right';
  x.textBaseline = 'middle';
  for (let a = 0; a <= TOP; a += 5000) {
    if (a && a < TOP) {
      x.beginPath();
      x.moveTo(QX, qy(a));
      x.lineTo(QX + QW, qy(a));
      x.stroke();
    }
    if (a % 10000 == 0) x.fillText(a ? 'FL' + a / 100 : 'SFC', QX - 10, qy(a));
  }
  if (S.length > 1) {
    x.save();
    x.beginPath();
    x.rect(QX, QY, QW, QH);
    x.clip();
    // clouds: bands from base to top (cumulus thicker, towering higher), rain shafts, fog
    for (let k = 0; k < S.length - 1; k++) {
      const p = S[k],
        q = S[k + 1];
      if (!(p.cond > 0 && p.dens > 4 && p.cu !== 10000)) continue;
      const th = p => (2500 + ((5 - p.size) / 5) * 8500) * (p.tcu ? 1.5 : 1) * (p.cond >= 2 ? 0.7 : 1),
        al = 0.3 + 0.45 * Math.min(1, (p.dens - 4) / 9);
      x.fillStyle = `rgba(140,150,162,${al})`;
      x.beginPath();
      x.moveTo(qx(p.d), qy(p.cu));
      x.lineTo(qx(q.d), qy(q.cu));
      x.lineTo(qx(q.d), qy(q.cu + th(q)));
      x.lineTo(qx(p.d), qy(p.cu + th(p)));
      x.closePath();
      x.fill();
      if (p.cond < 2 && k % 3 == 0) {
        x.beginPath();
        x.ellipse((qx(p.d) + qx(q.d)) / 2, qy(p.cu + th(p)), Math.max(8, (qx(q.d) - qx(p.d)) * 2), 12, 0, 0, 7);
        x.fill();
      }
      if (p.cond >= 2 && p.dens > 7 && k % 2 == 0) {
        x.strokeStyle = 'rgba(46,155,85,.8)';
        x.lineWidth = 1.2;
        x.beginPath();
        x.moveTo(qx(p.d), qy(p.cu));
        x.lineTo(qx(p.d) - 4, qy(p.elev));
        x.stroke();
      }
    }
    for (let k = 0; k < S.length - 1; k++)
      if (S[k].fogEnd < 5) {
        x.fillStyle = 'rgba(233,199,90,.55)';
        x.fillRect(
          qx(S[k].d),
          qy(S[k].elev + 700),
          qx(S[k + 1].d) - qx(S[k].d) + 1,
          qy(S[k].elev) - qy(S[k].elev + 700)
        );
      }
    // 0 °C and contrails
    const line = (f, col, dash, lw) => {
      x.strokeStyle = col;
      x.lineWidth = lw;
      x.setLineDash(dash);
      x.beginPath();
      S.forEach((p, i) => (i ? x.lineTo(qx(p.d), qy(f(p))) : x.moveTo(qx(p.d), qy(f(p)))));
      x.stroke();
      x.setLineDash([]);
    };
    line(p => p.elev + (Math.max(0, p.tt) / 2) * 1000, '#1f6fd1', [12, 6], 2.4);
    line(p => p.contrail, '#6b7280', [5, 5], 2.4);
    const last = S[S.length - 1];
    x.font = `bold 18px ${FONT}`;
    x.textAlign = 'right';
    x.textBaseline = 'bottom';
    x.fillStyle = '#1f6fd1';
    x.fillText('0 °C', QX + QW - 8, qy(last.elev + (Math.max(0, last.tt) / 2) * 1000) - 4);
    x.fillStyle = '#4b5563';
    x.fillText('CONTRAIL ' + Math.round(last.contrail / 100) * 100, QX + QW - 8, qy(last.contrail) - 4);
    // terrain
    x.fillStyle = '#d8c3a0';
    x.beginPath();
    x.moveTo(qx(0), qy(0));
    S.forEach(p => x.lineTo(qx(p.d), qy(p.elev)));
    x.lineTo(qx(dTot), qy(0));
    x.closePath();
    x.fill();
    // the flight
    x.strokeStyle = ROUTE;
    x.lineWidth = 4;
    x.beginPath();
    S.forEach((p, i) => (i ? x.lineTo(qx(p.d), qy(p.alt)) : x.moveTo(qx(p.d), qy(p.alt))));
    x.stroke();
    x.restore();
    // waypoints: their time below; winds aloft on a few
    let lastX = -99;
    D.route.forEach(p => {
      const u = qx(p.d),
        v = qy(p.alt);
      x.fillStyle = '#fff';
      x.strokeStyle = ROUTE;
      x.lineWidth = 2.4;
      x.beginPath();
      x.arc(u, v, 8, 0, 7);
      x.fill();
      x.stroke();
      if (u - lastX < 56) return;
      lastX = u;
      x.fillStyle = INK;
      x.font = `bold 18px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'top';
      x.fillText(String(p.n), u, QY + QH + 6);
      x.font = `17px ${FONT}`;
      x.fillText(hm(p.t), u, QY + QH + 28);
    });
    const step = Math.max(1, Math.floor(D.route.length / 4));
    x.strokeStyle = '#374151';
    x.lineWidth = 1.6;
    for (let i = 1; i < D.route.length - 1; i += step) {
      const p = D.route[i],
        Wi = D.at(p.t);
      if (!Wi) continue;
      [3000, 9000, 18000, 30000].forEach(a => {
        const w = Wi.wind(p.x, p.y, a);
        barb(x, qx(p.d), qy(a), w.hdg, w.spd, 24);
      });
    }
  }
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(QX, QY, QW, QH);

  // ---- the reports: raw, then decoded where it fits
  let y = QY + QH + 100;
  const BOT = WXC_H - 40,
    COL = { BLU: '#1f6fd1', WHT: '#8a94a3', GRN: '#2e9b55', YLO: '#d4a017', AMB: '#e67e22', RED: '#c0392b' };
  const wrap = (t, w, font) => {
    x.font = font;
    const out = [];
    let cur = '';
    for (const word of String(t).split(' ')) {
      const nx = cur ? cur + ' ' + word : word;
      if (x.measureText(nx).width > w && cur) {
        out.push(cur);
        cur = word;
      } else cur = nx;
    }
    if (cur) out.push(cur);
    return out;
  };
  const RAW = `24px ${MONO}`,
    DEC = `italic 20px ${FONT}`,
    LH = 34,
    RH = 30,
    DH = 26,
    GAP = 12;
  // the raw reports first (they always go), then the decoding as long as there is room
  const R = (D.reports || []).filter(r => r.text);
  const rawH = R.reduce((s, r) => s + LH + wrap(r.text, 1480, RAW).length * RH + GAP, 0),
    decH = R.reduce((s, r) => s + (/^TAF/.test(r.text) ? tafParts(r.text).length : 1) * DH, 0),
    room = BOT - 50 - y,
    dec = rawH + decH <= room;
  R.forEach(r => {
    x.fillStyle = INK;
    x.font = `bold 24px ${FONT}`;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillText(r.lab, 40, y);
    if (r.col && COL[r.col]) {
      x.font = `bold 21px ${FONT}`;
      const w = x.measureText(r.col).width + 18;
      x.fillStyle = COL[r.col];
      x.fillRect(1560 - w, y - 23, w, 30);
      x.fillStyle = '#fff';
      x.textAlign = 'center';
      x.fillText(r.col, 1560 - w / 2, y);
      x.textAlign = 'left';
    }
    y += LH;
    x.fillStyle = INK;
    wrap(r.text, 1480, RAW).forEach(l => {
      x.font = RAW;
      x.fillText(l, 52, y);
      y += RH;
    });
    if (dec) {
      x.fillStyle = '#4a5568';
      x.font = DEC;
      const parts = /^TAF/.test(r.text) ? tafParts(r.text) : [['', r.text]];
      parts.forEach(([h, t]) => {
        x.fillText('› ' + (h ? h + ': ' : '') + decodeWx(t), 52, y - 3);
        y += DH;
      });
    }
    y += GAP;
  });
  contrails(x, D, Math.min(y + 16, WXC_H - 26));
  x.restore();
}
