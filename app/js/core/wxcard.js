// The Weather card of the Kneeboard (1600 x 2400, light): a chart of the weather around the route (SIGWX: clouds, rain, snow, fog, storms; or Surface:
// isobars and rain, as a civil surface chart), the profile along the route (terrain, clouds, rain, fog, 0 °C, contrails, winds aloft), the METAR and the
// TAF of the departure, the target, the landing and the alternate, decoded where they fit, and the contrail levels.
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

/** draws the card on a 1600 x 2400 context; style 'sigwx' or 'surface' */
export function drawWxCard(x, D, style = 'sigwx') {
  const sig = style != 'surface';
  x.save();
  x.fillStyle = '#fff';
  x.fillRect(0, 0, WXC_W, WXC_H);
  // ---- header
  x.fillStyle = INK;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = `bold 52px ${FONT}`;
  x.fillText('WEATHER', 40, 82);
  const tw = x.measureText('WEATHER').width;
  x.font = `24px ${FONT}`;
  x.fillText(String(D.title || '').slice(0, 70), 70 + tw, 78);
  x.textAlign = 'right';
  x.font = `bold 26px ${FONT}`;
  x.fillStyle = sig ? '#c0392b' : '#1f5fa8';
  x.fillText(sig ? 'SIGWX' : 'SURFACE', 1560, 78);
  x.textAlign = 'left';
  x.font = `21px ${FONT}`;
  x.fillStyle = '#4a5568';
  x.fillText(
    [
      D.dep != null ? 'DEP ' + hm(D.dep) : '',
      D.tot != null ? 'TOT ' + hm(D.tot) : '',
      D.land != null ? 'LDG ' + hm(D.land) : '',
    ]
      .filter(Boolean)
      .join(' · ') + (D.sub ? '     ' + D.sub : ''),
    40,
    120
  );
  x.fillStyle = INK;
  x.fillRect(40, 136, 1520, 3);

  // ---- the chart
  const PX = 40,
    PY = 150,
    PW = 1520,
    PH = 1000,
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
    kmPx = PW / wk,
    W = D.at(D.tot != null ? D.tot : D.dep);
  x.save();
  x.translate(PX, PY);
  x.beginPath();
  x.rect(0, 0, PW, PH);
  x.clip();
  x.fillStyle = sig ? '#dcecf6' : '#a9d8ee';
  x.fillRect(0, 0, PW, PH);
  // land
  x.fillStyle = sig ? '#f6f3ea' : '#e6eed3';
  x.strokeStyle = sig ? '#8a97a6' : '#6f8c7a';
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
  if (W) {
    const GW = 190,
      GH = Math.round((GW * PH) / PW),
      cov = field(W, c => (c.cond > 0 && c.cu !== 10000 ? c.dens : 0)),
      rain = field(W, c => (c.cond >= 2 && c.dens > 7 ? 1 : 0)),
      fogF = field(W, c => (c.fogEnd < 5 ? 1 : 0)),
      pr = field(W, c => c.p),
      gC = raster(cov, V, GW, GH, 2),
      gR = raster(rain, V, GW, GH, 2),
      gP = raster(pr, V, GW, GH, 3);
    // cloud cover and rain areas: soft fills from a small picture
    const img = document.createElement('canvas');
    img.width = GW;
    img.height = GH;
    const ix = /** @type {CanvasRenderingContext2D} */ (img.getContext('2d')),
      id = ix.createImageData(GW, GH);
    for (let k = 0; k < GW * GH; k++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      if (sig) {
        const c = Math.max(0, Math.min(1, (gC[k] - 2) / 11));
        if (c > 0.08) {
          r = g = b = 150;
          a = 0.12 + c * 0.38;
        }
      } else if (gR[k] > 0.25) {
        // a soft edge, so the small picture does not show its pixels when it is stretched
        r = 95;
        g = 190;
        b = 80;
        a = 0.32 * Math.min(1, (gR[k] - 0.25) / 0.5);
      }
      id.data.set([r, g, b, Math.round(a * 255)], k * 4);
    }
    ix.putImageData(id, 0, 0);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, PW, PH);
    if (!sig) {
      x.strokeStyle = '#3f9a4e';
      x.lineWidth = 1.8;
      isolines(gR, GW, GH, 0.5, V).forEach(l => lenOf(l) > 40 && (poly(x, l), x.stroke()));
    }
    if (sig) {
      // BKN/OVC: scalloped edge; rain areas: green line; symbols on a lattice
      x.strokeStyle = '#5a6472';
      x.lineWidth = 1.6;
      isolines(gC, GW, GH, 7.5, V).forEach(l => lenOf(l) > 60 && scallops(x, l, 7));
      x.strokeStyle = '#2e9b55';
      x.lineWidth = 2.2;
      isolines(gR, GW, GH, 0.5, V).forEach(l => lenOf(l) > 40 && (poly(x, l), x.stroke()));
      const tF = field(W, c => c.t);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      for (let v = 40; v < PH; v += 78)
        for (let u = 40 + ((v / 78) % 2) * 39; u < PW; u += 78) {
          const [e, n] = V.inv(u, v);
          if (bil(rain, e, n) > 0.5) {
            const snow = bil(tF, e, n) <= 0;
            x.fillStyle = '#1f7a3d';
            x.font = `bold ${snow ? 22 : 15}px ${FONT}`;
            x.fillText(snow ? '*' : '•', u, v);
          } else if (bil(fogF, e, n) > 0.5) {
            x.fillStyle = '#c9971a';
            x.font = `bold 20px ${FONT}`;
            x.fillText('≡', u, v);
          }
        }
      // thunderstorms
      x.fillStyle = '#c0392b';
      x.font = `bold 17px ${FONT}`;
      for (let j = 0; j < W.Y; j++)
        for (let i = 0; i < W.X; i++) {
          const c = W.cell(i, j);
          if (c.cond >= 3 && c.tcu) {
            const [u, v] = V.px((i + 0.5) * W.cs, (j + 0.5) * W.cs);
            if (u > 0 && v > 0 && u < PW && v < PH) x.fillText('CB', u, v);
          }
        }
    }
    // isobars: every 2 hPa (Surface: bold every 4); the value, and small h / l on the high and the low side
    let lo = 1e9,
      hi = -1e9;
    gP.forEach(v => ((lo = Math.min(lo, v)), (hi = Math.max(hi, v))));
    for (let lev = Math.ceil(lo / 2) * 2; lev <= hi; lev += 2) {
      const bold = !sig && lev % 4 == 0;
      x.strokeStyle = sig ? '#7b8794' : INK;
      x.lineWidth = sig ? 1.1 : bold ? 2.6 : 1.2;
      isolines(gP, GW, GH, lev, V).forEach(l => {
        if (lenOf(l) < 80) return;
        poly(x, l);
        x.stroke();
        const m = along(l, 0.5),
          nx = -Math.sin(m.a),
          ny = Math.cos(m.a),
          [e1, n1] = V.inv(m.x + nx * 14, m.y + ny * 14),
          up = bil(pr, e1, n1) > lev; // the side of the normal is the high side
        x.fillStyle = '#fff';
        x.fillRect(m.x - 22, m.y - 11, 44, 22);
        x.fillStyle = sig ? '#4b5563' : INK;
        x.font = `${bold ? 'bold ' : ''}15px ${FONT}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(String(lev), m.x, m.y);
        // a serif letter: a sans-serif l looks like a bar
        x.font = `bold italic 18px Georgia, 'Times New Roman', serif`;
        const s = up ? 1 : -1;
        x.fillStyle = '#1f4fbf';
        x.fillText('h', m.x + nx * 22 * s, m.y + ny * 22 * s);
        x.fillStyle = '#d0312d';
        x.fillText('l', m.x - nx * 22 * s, m.y - ny * 22 * s);
      });
    }
    // H and L: the centres of pressure in the chart
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
        if (u < 50 || vv < 50 || u > PW - 50 || vv > PH - 60) continue;
        x.fillStyle = mx ? '#1f4fbf' : '#d0312d';
        x.font = `bold 54px ${FONT}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(mx ? 'H' : 'L', u, vv);
        x.font = `bold 18px ${FONT}`;
        x.fillText(String(Math.round(pr.a[j * W.X + i])), u, vv + 40);
      }
  }
  // the route, the waypoints, the airbases
  const rp = D.route.map(p => V.px(p.x, p.y));
  x.strokeStyle = ROUTE;
  x.lineWidth = 4;
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
    x.arc(u, v, 8, 0, 7);
    x.fill();
    x.stroke();
    x.fillStyle = '#7a0d57';
    x.font = `bold 17px ${FONT}`;
    x.textAlign = 'left';
    x.textBaseline = 'bottom';
    x.fillText(String(D.route[i].n), u + 10, v - 6);
  });
  if (rp.length) {
    const a = rp[0],
      b = rp[rp.length - 1],
      same = Math.hypot(a[0] - b[0], a[1] - b[1]) < 30;
    tagBox(x, same ? 'DEP / LDG ' + (D.depId || '') : 'DEP ' + (D.depId || ''), a[0], a[1] + 34);
    if (!same) tagBox(x, 'LDG ' + (D.ldgId || ''), b[0], b[1] + 34);
    if (D.tgt >= 0 && rp[D.tgt]) tagBox(x, 'TGT', rp[D.tgt][0], rp[D.tgt][1] - 34);
    if (D.altn) {
      const q = V.px(D.altn.x, D.altn.y);
      tagBox(x, 'ALTN ' + (D.altn.id || ''), q[0], q[1] + 30);
    }
  }
  // winds at the cruise level on a few waypoints
  if (W && D.route.length > 2) {
    x.strokeStyle = INK;
    x.fillStyle = INK;
    x.lineWidth = 1.8;
    const cr = Math.max(...D.route.map(p => p.alt)),
      step = Math.max(1, Math.floor(D.route.length / 4));
    for (let i = 1; i < D.route.length - 1; i += step) {
      const p = D.route[i],
        Wi = D.at(p.t) || W,
        w = Wi.wind(p.x, p.y, cr),
        [u, v] = V.px(p.x, p.y);
      barb(x, u - 26, v + 26, w.hdg, w.spd);
    }
  }
  // legend, scale, north
  x.font = `14px ${FONT}`;
  const lg = sig
    ? 'Cloud cover in grey · BKN/OVC scalloped · rain area green: • rain  * snow · ≡ fog · CB storm · isobars hPa (h high, l low side) · wind at the cruise level'
    : 'Isobars every 2 hPa (bold every 4; h high, l low side) · H / L pressure centres · rain in green · wind at the cruise level';
  x.fillStyle = 'rgba(255,255,255,.88)';
  x.fillRect(8, PH - 30, x.measureText(lg).width + 16, 24);
  x.fillStyle = INK;
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(lg, 16, PH - 18);
  const nm50 = 92.6 * kmPx;
  x.fillRect(PW - 20 - nm50, PH - 40, nm50, 4);
  x.textAlign = 'right';
  x.fillText('50 NM', PW - 20, PH - 18);
  x.beginPath();
  x.moveTo(40, 60);
  x.lineTo(32, 82);
  x.lineTo(48, 82);
  x.closePath();
  x.fill();
  x.font = `bold 20px ${FONT}`;
  x.textAlign = 'center';
  x.fillText('N', 40, 100);
  x.restore();
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(PX, PY, PW, PH);

  // ---- the profile along the route
  const QX = 140,
    QY = 1200,
    QW = 1420,
    QH = 480,
    TOP = 40000,
    S = D.prof || [],
    dTot = S.length ? S[S.length - 1].d : 1,
    qx = d => QX + (d / dTot) * QW,
    qy = a => QY + QH - (Math.max(0, a) / TOP) * QH;
  x.fillStyle = INK;
  x.font = `bold 19px ${FONT}`;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillText('PROFILE ALONG THE ROUTE', 40, QY - 14);
  x.font = `16px ${FONT}`;
  x.fillStyle = '#4a5568';
  x.fillText('clouds · rain · fog · 0 °C · contrails · winds 3, 9, 18, 30 thousand ft', 340, QY - 14);
  x.fillStyle = sig ? '#eef6fb' : '#f4f9fc';
  x.fillRect(QX, QY, QW, QH);
  x.strokeStyle = '#d5dde5';
  x.lineWidth = 1;
  x.fillStyle = INK;
  x.font = `15px ${FONT}`;
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
    line(p => p.elev + (Math.max(0, p.tt) / 2) * 1000, '#1f6fd1', [12, 6], 2.2);
    line(p => p.contrail, '#6b7280', [5, 5], 2.2);
    const last = S[S.length - 1];
    x.font = `bold 15px ${FONT}`;
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
    D.route.forEach((p, i) => {
      const u = qx(p.d),
        v = qy(p.alt);
      x.fillStyle = '#fff';
      x.strokeStyle = ROUTE;
      x.lineWidth = 2.4;
      x.beginPath();
      x.arc(u, v, 7, 0, 7);
      x.fill();
      x.stroke();
      if (u - lastX < 44) return;
      lastX = u;
      x.fillStyle = INK;
      x.font = `bold 15px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'top';
      x.fillText(String(p.n), u, QY + QH + 6);
      x.font = `14px ${FONT}`;
      x.fillText(hm(p.t), u, QY + QH + 24);
    });
    const step = Math.max(1, Math.floor(D.route.length / 4));
    x.strokeStyle = '#374151';
    x.fillStyle = '#374151';
    x.lineWidth = 1.5;
    for (let i = 1; i < D.route.length - 1; i += step) {
      const p = D.route[i],
        Wi = D.at(p.t);
      if (!Wi) continue;
      [3000, 9000, 18000, 30000].forEach(a => {
        const w = Wi.wind(p.x, p.y, a);
        barb(x, qx(p.d), qy(a), w.hdg, w.spd, 22);
      });
    }
  }
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(QX, QY, QW, QH);

  // ---- the reports: raw, then decoded where it fits
  let y = QY + QH + 70;
  const BOT = WXC_H - 70,
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
  const RAW = `21px ${MONO}`,
    DEC = `italic 17px ${FONT}`;
  // the raw reports first (they always go), then the decoding as long as there is room
  const R = (D.reports || []).filter(r => r.text);
  const rawH = R.reduce((s, r) => s + 30 + wrap(r.text, 1480, RAW).length * 27 + 14, 0),
    decH = R.reduce((s, r) => s + (/^TAF/.test(r.text) ? tafParts(r.text).length : 1) * 22, 0),
    room = BOT - 50 - y,
    dec = rawH + decH <= room;
  R.forEach(r => {
    x.fillStyle = INK;
    x.font = `bold 20px ${FONT}`;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillText(r.lab, 40, y);
    if (r.col && COL[r.col]) {
      x.font = `bold 18px ${FONT}`;
      const w = x.measureText(r.col).width + 16;
      x.fillStyle = COL[r.col];
      x.fillRect(1560 - w, y - 20, w, 26);
      x.fillStyle = '#fff';
      x.textAlign = 'center';
      x.fillText(r.col, 1560 - w / 2, y);
      x.textAlign = 'left';
    }
    y += 30;
    x.fillStyle = INK;
    wrap(r.text, 1480, RAW).forEach(l => {
      x.font = RAW;
      x.fillText(l, 52, y);
      y += 27;
    });
    if (dec) {
      x.fillStyle = '#4a5568';
      x.font = DEC;
      const parts = /^TAF/.test(r.text) ? tafParts(r.text) : [['', r.text]];
      parts.forEach(([h, t]) => {
        x.fillText('› ' + (h ? h + ': ' : '') + decodeWx(t), 52, y - 2);
        y += 22;
      });
    }
    y += 14;
  });
  if (D.contrail) {
    x.fillStyle = INK;
    x.font = `bold 20px ${FONT}`;
    const c = D.contrail.map(v => Math.round(v / 100) * 100);
    x.fillText(
      `CONTRAILS   sunny ${c[0]} · fair ${c[1]} · poor ${c[2]} · inclement ${c[3]} ft`,
      40,
      Math.min(y + 14, WXC_H - 30)
    );
  }
  x.restore();
}
