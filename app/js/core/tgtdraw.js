// @ts-check
// Target picture (A-G > Target): the rules without the page. The place of a picture on the ground, the targets made from the DTC points and the
// objectives, the threats near a target, the kind of a building from its name, the plan of an objective and the filters of a picture.
// Ground positions are campaign km (x = east, y = north), like the rest of the program; a picture point is (u, v), 0..1 from its top left corner.

export const KM_NM = 1.852;
/** colours of the page: the program (dark) or the paper of a Basic Target Graphic */
export const PAL = {
  prog: {
    page: '#0f1419',
    panel: '#1a212b',
    line: '#2a3441',
    tx: '#e6edf3',
    mu: '#8b98a8',
    ac: '#4cc38a',
    band: '#1a212b',
    btx: '#8b98a8',
  },
  paper: {
    page: '#ffffff',
    panel: '#ffffff',
    line: '#000000',
    tx: '#000000',
    mu: '#333333',
    ac: '#000000',
    band: '#000000',
    btx: '#ffffff',
  },
};
/** colours of the datacard layer (the same as the Map page: SAM rings orange, enemy units red) */
export const COL = { sam: '#ff9f1a', unit: '#ff5d5d', ing: '#38d6f2', egr: '#4cc38a', dmpi: '#ff3b30' };

// ---- where a picture is on the ground: {o: [x, y] of the top left corner, u: [dx, dy] across the width, v: [dx, dy] down the height} (km)
/**
 * @param {number} cx @param {number} cy centre (km) @param {number} w @param {number} h width and height (km), north up
 */
export const geoBox = (cx, cy, w, h) => ({ o: [cx - w / 2, cy + h / 2], u: [w, 0], v: [0, -h] });
/** a picture turned on the ground: its top points to the heading deg (0 = north up), around (cx, cy), w x h km */
export function rotBox(cx, cy, w, h, deg = 0) {
  const a = (deg * Math.PI) / 180,
    up = [Math.sin(a), Math.cos(a)],
    rt = [Math.cos(a), -Math.sin(a)];
  return {
    o: [cx - (rt[0] * w) / 2 + (up[0] * h) / 2, cy - (rt[1] * w) / 2 + (up[1] * h) / 2],
    u: [rt[0] * w, rt[1] * w],
    v: [-up[0] * h, -up[1] * h],
  };
}
/** where north points on a picture: degrees clockwise from its top (0 for north up) */
export function northOn(g) {
  if (!g) return 0;
  const [u0, v0] = toUV(g, g.o[0], g.o[1]),
    [u1, v1] = toUV(g, g.o[0], g.o[1] + 1),
    w = geoWidth(g),
    h = Math.hypot(g.v[0], g.v[1]);
  // in the units of the ground on both axes (the picture may not be square)
  return (Math.atan2((u1 - u0) * w, -(v1 - v0) * h) * 180) / Math.PI;
}
/** three corners (km) of a picture: top left, top right, bottom left */
export const geoCorners = (tl, tr, bl) => ({
  o: tl,
  u: [tr[0] - tl[0], tr[1] - tl[1]],
  v: [bl[0] - tl[0], bl[1] - tl[1]],
});
/** ground (km) -> picture (u, v) */
export function toUV(g, x, y) {
  const a = g.u[0],
    b = g.v[0],
    c = g.u[1],
    d = g.v[1],
    det = a * d - b * c,
    px = x - g.o[0],
    py = y - g.o[1];
  if (!det) return [NaN, NaN];
  return [(d * px - b * py) / det, (-c * px + a * py) / det];
}
/** picture (u, v) -> ground (km) */
export const fromUV = (g, u, v) => [g.o[0] + u * g.u[0] + v * g.v[0], g.o[1] + u * g.u[1] + v * g.v[1]];
/** width of the picture on the ground (km) */
export const geoWidth = g => Math.hypot(g.u[0], g.u[1]);
/** bearing (degrees, 0-360) and distance (NM) from a to b, campaign grid */
export function brgDist(a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  return { brg: ((((Math.atan2(dx, dy) * 180) / Math.PI) % 360) + 360) % 360, nm: Math.hypot(dx, dy) / KM_NM };
}
export const brg3 = b => String(Math.round(((b % 360) + 360) % 360) || 360).padStart(3, '0') + '°';

// ---- the targets: the DTC points (TGT steerpoints, weapon targets, the target of the attack planner), the target of the flight and the points picked here,
// put together by the objective they are on. points: [{ref, short, name, x, y, altFt, dmpi, kind}], objs: [{id, name, x, y, type}]
/**
 * @returns {{key:string,label:string,name:string,x:number,y:number,objId:number|null,type:number,refs:string[],dmpis:any[],flight:boolean}[]}
 */
export function groupTargets(points, objs, km = 3) {
  const out = [],
    by = new Map();
  for (const p of points || []) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    let ob = null,
      bd = km;
    for (const o of objs || []) {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd) {
        bd = d;
        ob = o;
      }
    }
    const key = ob ? 'o' + ob.id : 'p' + (p.ref || p.short || p.name) + ':' + p.x.toFixed(3) + ',' + p.y.toFixed(3);
    let t = by.get(key);
    if (!t) {
      t = {
        key,
        label: p.short || p.ref || '',
        name: ob ? ob.name : p.name || p.ref || 'Target',
        x: ob ? ob.x : p.x,
        y: ob ? ob.y : p.y,
        objId: ob ? ob.id : null,
        type: ob && ob.type != null ? ob.type : -1,
        refs: [],
        dmpis: [],
        flight: false,
      };
      by.set(key, t);
      out.push(t);
    }
    if (p.kind == 'flight') {
      t.flight = true;
      t.label = p.short || t.label;
    } else if (!t.refs.includes(p.short || p.ref)) t.refs.push(p.short || p.ref);
    if (p.dmpi && !t.dmpis.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.005)) t.dmpis.push(p);
  }
  out.forEach(t => {
    if (!t.label || t.flight) t.label = t.flight ? 'FLIGHT' : t.refs[0] || '';
  });
  return out.sort((a, b) => Number(b.flight) - Number(a.flight));
}

// ---- the threats near a target: the enemy SAMs whose ring comes near it, the enemy units around it
/**
 * @param {[number, number]} c the target (km)
 * @param {{name:string,x:number,y:number,r:number}[]} sams ring r in km
 * @param {{name:string,x:number,y:number,glyph:string}[]} units
 */
export function threatsNear(c, sams, units, o = {}) {
  const ringNm = o.ringNm == null ? 10 : o.ringNm,
    unitNm = o.unitNm == null ? 12 : o.unitNm;
  const S = (sams || [])
    .map(s => ({ ...s, ...brgDist(c, [s.x, s.y]), rNm: s.r / KM_NM }))
    .filter(s => s.nm - s.rNm <= ringNm && s.nm <= 60)
    .map(s => ({ ...s, inside: s.nm <= s.rNm }))
    .sort((a, b) => a.nm - a.rNm - (b.nm - b.rNm))
    .slice(0, o.maxSams || 6);
  const U = (units || [])
    .map(u => ({ ...u, ...brgDist(c, [u.x, u.y]) }))
    .filter(u => u.nm <= unitNm)
    .sort((a, b) => a.nm - b.nm)
    .slice(0, o.maxUnits || 8);
  return { sams: S, units: U };
}

// ---- the plan of an objective: the features where the objective files put them, drawn as symbols by their kind (their shape is only in the 3D models)
const KINDS = [
  ['span', /bridge|span/i],
  ['rwy', /runway|taxi|apron|ramp/i],
  ['bunk', /bunker|shelter|hardened|has\b/i],
  ['tank', /tank|pol\b|fuel|oil|petrol/i],
  ['rad', /radar|dish/i],
  ['aaa', /aaa|sam\b|gun|launcher|zsu|flak|revet/i],
  ['tow', /tower|antenna|mast|\bcomms?\b|radio|pylon/i],
  ['ware', /hangar|warehouse|storage|depot|barrack|factory|hall|plant|shed|works|store|garage|workshop/i],
];
/** the kind of a feature from its name: span, rwy, bunk, tank, rad, aaa, tow, ware or adm (any other building) */
export const featKind = name => (KINDS.find(([, r]) => r.test(String(name || ''))) || ['adm'])[0];
/** size of the symbol of a kind, in metres [width, height] */
export const KSIZE = {
  bunk: [40, 26],
  ware: [72, 30],
  tank: [30, 30],
  adm: [46, 34],
  tow: [10, 10],
  rad: [34, 34],
  span: [100, 22],
  aaa: [24, 24],
  rwy: [60, 40],
};

// the trees around a target: [x, y (km), radius (m), shade], the same every time, over 4 km around it
const TREES = new Map();
function trees(c, seed) {
  const k = seed + ':' + c[0].toFixed(3) + ',' + c[1].toFixed(3);
  if (TREES.has(k)) return TREES.get(k);
  const r = rng(k + 'trees'),
    out = [];
  for (let i = 0; i < 160; i++) {
    const cx = c[0] + (r() - 0.5) * 4,
      cy = c[1] + (r() - 0.5) * 4,
      n = 10 + ((r() * 50) | 0),
      sp = 0.02 + r() * 0.08;
    for (let j = 0; j < n; j++)
      out.push([cx + (r() - 0.5) * 2 * sp, cy + (r() - 0.5) * 2 * sp * 0.7, 3 + r() * 3, r() < 0.5 ? 1 : 0]);
  }
  if (TREES.size > 20) TREES.clear();
  TREES.set(k, out);
  return out;
}
// ---- the runways and taxiways of an airbase (from its point files): the corners of the runways are exact, the taxi paths approximate
const inPoly = (p, x, y, m = 0) => {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if (p[i][1] > y != p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0])
      ins = !ins;
  return ins || (m > 0 && p.some((a, i) => segDist(a, p[(i + 1) % p.length], x, y) < m));
};
const segDist = (a, b, x, y) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = dx * dx + dy * dy,
    t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
};
function airfield(g, air, RW, TX, twid, mpx, nA = 0) {
  g.save();
  g.lineCap = g.lineJoin = 'round';
  // the taxiways: a darker edge, then the surface
  for (const [w, col] of [
    [twid + 3, '#55534d'],
    [twid, '#8a867c'],
  ]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    for (const l of TX) {
      g.beginPath();
      l.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
    }
  }
  RW.forEach((p, k) => {
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 4;
    g.fillStyle = '#7f7b72';
    g.beginPath();
    p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    g.fill();
    g.shadowColor = 'transparent';
    // the long axis: the middles of the two short sides
    const d = i => Math.hypot(p[(i + 1) % 4][0] - p[i][0], p[(i + 1) % 4][1] - p[i][1]),
      s = d(0) < d(1) ? 0 : 1,
      mid = i => [(p[i][0] + p[(i + 1) % 4][0]) / 2, (p[i][1] + p[(i + 1) % 4][1]) / 2],
      A = mid(s),
      B = mid(s + 2),
      len = Math.hypot(B[0] - A[0], B[1] - A[1]),
      wid = d(s),
      ux = (B[0] - A[0]) / len,
      uy = (B[1] - A[1]) / len;
    if (len < 20) return;
    // the edges and the centre line
    g.strokeStyle = 'rgba(235,235,225,.75)';
    g.lineWidth = Math.max(1, 1 * mpx);
    g.beginPath();
    p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    g.stroke();
    g.setLineDash([Math.max(6, 30 * mpx), Math.max(5, 20 * mpx)]);
    g.lineWidth = Math.max(1, 0.9 * mpx);
    g.beginPath();
    g.moveTo(A[0] + ux * wid, A[1] + uy * wid);
    g.lineTo(B[0] - ux * wid, B[1] - uy * wid);
    g.stroke();
    g.setLineDash([]);
    // the numbers at the ends: the end a runway is landed from is the one behind its heading
    const ends = (air.rwy[k] && air.rwy[k].ends) || [],
      fs = Math.max(11, Math.min(42, wid * 0.55));
    g.fillStyle = '#f2f2ea';
    g.font = '700 ' + fs + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const e of ends) {
      // the heading on the picture (north may not be up)
      const hx = Math.sin(((e.dir + nA) * Math.PI) / 180),
        hy = -Math.cos(((e.dir + nA) * Math.PI) / 180),
        at = hx * ux + hy * uy > 0 ? A : B,
        sg = at == A ? 1 : -1,
        px = at[0] + ux * sg * fs * 1.4,
        py = at[1] + uy * sg * fs * 1.4;
      g.save();
      g.translate(px, py);
      g.rotate(Math.atan2(hy, hx) + Math.PI / 2);
      g.fillText(String(e.n).padStart(2, '0'), 0, 0);
      g.restore();
    }
  });
  g.restore();
}

/**
 * the symbol of a building (light roof and shadow, dark when destroyed), its size in metres at mpx px a metre (never smaller than a few px)
 * @param {CanvasRenderingContext2D} g @param {{name:string, st?:number}} f
 */
export function featSym(g, f, px, py, mpx, ang = 0, o = {}) {
  const k = featKind(f.name),
    [sw, sh] = KSIZE[k],
    mn = o.min || 1,
    w = Math.max(10 * mn, sw * mpx),
    h = Math.max(8 * mn, sh * mpx);
  g.save();
  g.translate(px, py);
  if (k == 'span') g.rotate(ang);
  else if (o.grid) g.rotate(o.grid); // square to the grid of the ground, on a turned picture
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowOffsetX = g.shadowOffsetY = Math.max(3 * mn, 4 * mpx);
  g.shadowBlur = 3;
  g.fillStyle = f.st == 2 ? '#3b3530' : k == 'rwy' ? '#9a968c' : '#d8d4c8';
  if (o.edge) {
    g.strokeStyle = o.edge;
    g.lineWidth = 1.2;
  }
  g.beginPath();
  if (k == 'bunk') {
    g.moveTo(-w / 2, h / 2);
    g.lineTo(-w / 2, -h / 6);
    g.quadraticCurveTo(0, -h * 0.75, w / 2, -h / 6);
    g.lineTo(w / 2, h / 2);
    g.closePath();
  } else if (k == 'tank' || k == 'rad') g.arc(0, 0, w / 2, 0, 7);
  else if (k != 'aaa') g.rect(-w / 2, -h / 2, w, h);
  if (k == 'aaa') {
    g.shadowColor = 'transparent';
    g.strokeStyle = f.st == 2 ? '#3b3530' : '#d8d4c8';
    g.lineWidth = Math.max(3, w / 6);
    g.arc(0, 0, w / 2, 0, 7);
    g.stroke();
  } else {
    g.fill();
    if (o.edge) {
      g.shadowColor = 'transparent';
      g.stroke();
    }
  }
  if (f.st == 2) {
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(20,15,10,.7)';
    g.beginPath();
    g.arc(w * 0.12, h * 0.1, Math.max(w, h) * 0.55, 0, 7);
    g.fill();
  } else if (f.st == 1) {
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(30,25,20,.55)';
    g.beginPath();
    g.arc(w * 0.2, 0, Math.max(w, h) * 0.28, 0, 7);
    g.fill();
  }
  g.restore();
}
/** the angle of a bridge (its spans in a line), for the plan and for the buildings drawn on a map */
export function spanAngle(feats, P) {
  const sp = feats.filter(f => featKind(f.name) == 'span');
  if (sp.length < 2) return 0;
  const a = P(sp[0].x, sp[0].y),
    b = P(sp[sp.length - 1].x, sp[sp.length - 1].y);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
/** a seeded random, the same picture every time */
export function rng(s) {
  let h = 0;
  for (const c of String(s)) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** the ground the plan covers: the features (and the aim points) with a margin, at least 600 m wide, in the proportions w:h */
export function planBox(pts, c, w = 1080, h = 520, deg = 0) {
  let ex = 0.3,
    ey = 0.3;
  const a = (deg * Math.PI) / 180,
    co = Math.cos(a),
    sn = Math.sin(a);
  for (const p of pts) {
    // across and along the turned picture
    const dx = p.x - c[0],
      dy = p.y - c[1];
    ex = Math.max(ex, Math.abs(dx * co - dy * sn));
    ey = Math.max(ey, Math.abs(dx * sn + dy * co));
  }
  const wk = Math.max(0.6, ex * 2 * 1.3, ey * 2 * 1.3 * (w / h));
  return rotBox(c[0], c[1], wk, (wk * h) / w, deg);
}
// ---- the ground of the plan: the heights of the BMS terrain (HeightMap.raw, about 30 m a sample) on a grid over the plan, shaded as a relief
/** the grid of the ground over a picture: its points (km, row by row from the top left) and its size; about one point every 30 m, at most `max` across */
export function groundGrid(geo, aspect = 2160 / 1040, max = 160) {
  const wm = geoWidth(geo) * 1000,
    cols = Math.max(8, Math.min(max, Math.ceil(wm / 30))),
    rows = Math.max(4, Math.round(cols / aspect)),
    pts = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) pts.push(fromUV(geo, (c + 0.5) / cols, (r + 0.5) / rows));
  return { cols, rows, pts, cellM: wm / cols };
}
/**
 * the light on the ground (0 dark .. 1 lit), sun from the north west 45 degrees above the horizon, the relief made twice as steep
 * @param {ArrayLike<number|null>} h heights (ft), row by row from the top left @param {number} cols @param {number} rows @param {number} cellM
 */
export function hillshade(h, cols, rows, cellM, z = 2) {
  const out = new Float32Array(cols * rows),
    at = (c, r) => {
      const v = h[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
      return v == null ? 0 : v * 0.3048;
    },
    az = (315 * Math.PI) / 180,
    alt = (45 * Math.PI) / 180,
    lx = Math.sin(az) * Math.cos(alt), // the light: east, north, up
    ly = Math.cos(az) * Math.cos(alt),
    lz = Math.sin(alt);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const de = (z * (at(c + 1, r) - at(c - 1, r))) / (2 * cellM), // rise to the east
        dn = (z * (at(c, r - 1) - at(c, r + 1))) / (2 * cellM), // rise to the north (row 0 is the north edge)
        m = Math.hypot(de, dn, 1);
      out[r * cols + c] = Math.max(0, Math.min(1, (-de * lx - dn * ly + lz) / m));
    }
  return out;
}
/**
 * The plan: an aerial-like picture (the ground, trees, light roofs with their shadows), 2160 x 1040 px. feats: [{name, x, y, st (0 intact, 1 damaged,
 * 2 destroyed)}]. ground (optional): {cols, rows, h (ft, null outside the theater)} on the grid of groundGrid(planBox(...)): relief, and water where it is 0.
 * @returns {{c: HTMLCanvasElement, geo: any}}
 */
export function planPicture(feats, c, seed, extra = [], ground = null, box = null, air = null) {
  const W = 2160,
    H = 1040,
    geo = box || planBox([...feats, ...extra], c, W, H),
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')),
    r = rng(seed),
    mpx = W / (geoWidth(geo) * 1000), // px per metre
    P = (x, y) => {
      const [u, v] = toUV(geo, x, y);
      return [u * W, v * H];
    };
  let water = () => false;
  if (ground && ground.h && ground.h.some(v => v != null)) {
    const { cols, rows, h } = ground,
      sh = hillshade(h, cols, rows, (geoWidth(geo) * 1000) / cols),
      gc = document.createElement('canvas');
    gc.width = cols;
    gc.height = rows;
    const gx = /** @type {CanvasRenderingContext2D} */ (gc.getContext('2d')),
      id = gx.createImageData(cols, rows),
      hs = h.filter(v => v != null && v > 0),
      lo = hs.length ? Math.min(...hs) : 0,
      hi = hs.length ? Math.max(...hs) : 1;
    for (let i = 0; i < cols * rows; i++) {
      const v = h[i],
        k = i * 4;
      if (v != null && v <= 0) {
        id.data.set([44, 67, 80, 255], k); // water
        continue;
      }
      const t = hi > lo ? ((v || lo) - lo) / (hi - lo) : 0, // low and green .. high and drier
        l = 0.55 + 0.6 * sh[i];
      id.data.set(
        [(96 + 40 * t) * l, (116 + 18 * t) * l, (82 + 14 * t) * l, 255].map(q => Math.max(0, Math.min(255, q))),
        k
      );
    }
    gx.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(gc, 0, 0, W, H);
    water = (px, py) => {
      const v =
        h[Math.min(rows - 1, Math.floor((py / H) * rows)) * cols + Math.min(cols - 1, Math.floor((px / W) * cols))];
      return v != null && v <= 0;
    };
  } else {
    // no terrain: an even ground with a few wide, soft changes of tone
    g.fillStyle = '#6b7657';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x0 = r() * W,
        y0 = r() * H,
        rr = 200 + r() * 420,
        gr = g.createRadialGradient(x0, y0, 0, x0, y0, rr);
      gr.addColorStop(0, r() < 0.5 ? 'rgba(130,128,96,.18)' : 'rgba(70,92,58,.2)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x0 - rr, y0 - rr, 2 * rr, 2 * rr);
    }
  }
  // trees: small dark green dots in groups, never on the water nor on the buildings (they are only a look: BMS gives no trees). They stand on the
  // ground (a zoom keeps them in place and makes them bigger)
  const near = feats.map(f => P(f.x, f.y)),
    clear = Math.max(30, 45 * mpx),
    RW = air && air.rwy && air.rwy.length ? air.rwy.map(r => r.c.map(q => P(q[0], q[1]))) : [],
    TX = RW.length && air.taxi ? air.taxi.map(l => l.map(q => P(q[0], q[1]))) : [],
    twid = Math.max(5, 23 * mpx), // a taxiway about 23 m wide
    onAir = (px, py) =>
      RW.some(p => inPoly(p, px, py, 25)) ||
      TX.some(l => l.some((a, i) => i && segDist(l[i - 1], a, px, py) < twid + 25));
  for (const t of trees(c, seed)) {
    const [px, py] = P(t[0], t[1]),
      rad = Math.max(2.2, Math.min(18, t[2] * mpx));
    if (px < -20 || py < -20 || px > W + 20 || py > H + 20) continue;
    if (water(px, py) || near.some(q => Math.abs(q[0] - px) < clear && Math.abs(q[1] - py) < clear)) continue;
    if (RW.length && onAir(px, py)) continue;
    g.fillStyle = 'rgba(20,30,16,.35)';
    g.beginPath();
    g.arc(px + rad * 0.5, py + rad * 0.5, rad, 0, 7);
    g.fill();
    g.fillStyle = t[3] ? '#3d5a2c' : '#47663a';
    g.beginPath();
    g.arc(px, py, rad, 0, 7);
    g.fill();
  }
  // a bridge: the spans in a line; the water across it
  const spans = feats.filter(f => featKind(f.name) == 'span');
  let ang = 0;
  const gridA = (northOn(geo) * Math.PI) / 180; // the east of the ground on the picture
  if (spans.length >= 2) {
    const a = P(spans[0].x, spans[0].y),
      b = P(spans[spans.length - 1].x, spans[spans.length - 1].y);
    ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const m = P(c[0], c[1]);
    g.save();
    g.translate(m[0], m[1]);
    g.rotate(ang + Math.PI / 2);
    g.fillStyle = '#2f4652';
    g.fillRect(-W * 2, -Math.max(40, 90 * mpx), W * 4, Math.max(80, 180 * mpx));
    g.restore();
  }
  if (RW.length) airfield(g, air, RW, TX, twid, mpx, northOn(geo));
  for (const f of feats) {
    // the runway sections are in the runway drawn above: only the destroyed ones show (craters)
    if (RW.length && featKind(f.name) == 'rwy') {
      if (f.st == 2) {
        const [px, py] = P(f.x, f.y);
        g.fillStyle = 'rgba(40,34,28,.85)';
        g.beginPath();
        g.arc(px, py, Math.max(5, 14 * mpx), 0, 7);
        g.fill();
      }
      continue;
    }
    const [px, py] = P(f.x, f.y);
    featSym(g, f, px, py, mpx, ang, { grid: gridA });
  }
  return { c: cv, geo };
}

// ---- the filters (on the picture only, never on the symbols)
export const FILTERS = [
  ['none', 'Original'],
  ['recon', 'IR white-hot'],
  ['ir', 'IR black-hot'],
  ['r80', 'Recon 1980s'],
  ['uav', 'UAV FLIR'],
  ['suav', 'Small drone'],
  ['tgp', 'Targeting pod'],
  ['nvg', 'NVG'],
];
/** the filters that put a sensor display over the picture (drawn by the page: it holds the data of the mission) */
export const HUDS = ['uav', 'suav', 'tgp'];
let NOISE = null;
/**
 * @param {HTMLCanvasElement} src @param {string} f filter @param {number} con contrast @param {number} grn grain
 * @param {string} [stamp] the text burnt into a 1980s picture
 */
export function filterPic(src, f, con, grn, stamp) {
  const W = src.width,
    H = src.height,
    o = document.createElement('canvas');
  o.width = W;
  o.height = H;
  const c = /** @type {CanvasRenderingContext2D} */ (o.getContext('2d', { willReadFrequently: true }));
  const soft = { r80: 3.2, uav: 1.8, suav: 2.4, tgp: 1.7, nvg: 2 }[f];
  if (soft) {
    // lower definition: down and up again (a third for the 1980s film, softer for the video of a drone)
    const q = document.createElement('canvas');
    q.width = Math.max(1, (W / soft) | 0);
    q.height = Math.max(1, (H / soft) | 0);
    /** @type {CanvasRenderingContext2D} */ (q.getContext('2d')).drawImage(src, 0, 0, q.width, q.height);
    c.imageSmoothingEnabled = true;
    c.drawImage(q, 0, 0, W, H);
  } else c.drawImage(src, 0, 0);
  if (f == 'none' || !FILTERS.some(x => x[0] == f)) return o;
  const d = c.getImageData(0, 0, W, H),
    p = d.data,
    gr = grn * (f == 'r80' ? 1.6 : 1);
  if (!NOISE || NOISE.length < W * H) {
    const r = rng('grain');
    NOISE = new Float32Array(Math.max(W * H, 2160 * 1040));
    for (let i = 0; i < NOISE.length; i++) NOISE[i] = r() - 0.5;
  }
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    let g = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    if (f == 'ir') g = 255 - g * 0.85; // white hot
    if (f == 'uav') {
      // the sensor of a large drone: black hot, a soft grey, a little grain
      g = (215 - g * 0.8 - 128) * (0.55 + con * 0.35) + 128 + NOISE[j] * gr * 0.6;
      p[i] = p[i + 1] = p[i + 2] = g;
      continue;
    }
    if (f == 'tgp') {
      // the targeting pod, white hot: a mid grey ground, the light things bright and hard, a fine grain
      const k = g / 255;
      g = (Math.pow(k, 0.85) * 255 * 0.82 + 30 - 128) * con * 1.25 + 128 + NOISE[j] * gr * 0.8;
      p[i] = p[i + 1] = p[i + 2] = g;
      continue;
    }
    if (f == 'nvg') {
      // night vision: the green of the phosphor, bright and grainy
      g = (g * 0.9 + 30 - 128) * con + 128 + NOISE[j] * gr * 1.5;
      p[i] = g * 0.32;
      p[i + 1] = g * 1.02;
      p[i + 2] = g * 0.42;
      continue;
    }
    if (f == 'suav') {
      // the video of a small drone: cold blue grey, flat, hazy
      g = (g - 128) * con * 0.7 + 128 + 22 + NOISE[j] * gr * 0.7;
      p[i] = g * 0.86 + 6;
      p[i + 1] = g * 0.94 + 10;
      p[i + 2] = g * 1.02 + 18;
      continue;
    }
    g = (g - 128) * con + 128 + NOISE[j] * gr;
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  c.putImageData(d, 0, 0);
  if (f == 'r80') retro(c, W, H, stamp || '');
  if (f == 'tgp') {
    // the bloom of the hot things: a blurred copy of the picture laid over it, lighter
    const b = document.createElement('canvas');
    b.width = Math.max(1, (W / 10) | 0);
    b.height = Math.max(1, (H / 10) | 0);
    const bx = /** @type {CanvasRenderingContext2D} */ (b.getContext('2d'));
    bx.drawImage(o, 0, 0, b.width, b.height);
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.28;
    c.imageSmoothingEnabled = true;
    c.drawImage(b, 0, 0, W, H);
    c.restore();
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }
  if (f == 'nvg') {
    // the round field of the tube, dark outside, a little glow in the middle
    const R = Math.min(W, H) * 0.62,
      v = c.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, Math.max(R * 1.25, Math.hypot(W, H) / 2));
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.6, 'rgba(0,10,0,.55)');
    v.addColorStop(1, 'rgba(0,6,0,.95)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    const gl = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.6);
    gl.addColorStop(0, 'rgba(120,255,140,.10)');
    gl.addColorStop(1, 'rgba(120,255,140,0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, W, H);
  }
  if (f == 'uav' || f == 'suav') {
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, f == 'uav' ? 'rgba(0,0,0,.28)' : 'rgba(20,30,40,.25)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }
  return o;
}
// 1980s reconnaissance: scan lines, torn lines, drop-outs, a grey-green cast, dark corners, the frame data burnt in
function retro(c, W, H, stamp) {
  const r = rng('r80' + W + 'x' + H),
    o = document.createElement('canvas'),
    k = W / 1080;
  o.width = W;
  o.height = H;
  /** @type {CanvasRenderingContext2D} */ (o.getContext('2d')).drawImage(c.canvas, 0, 0);
  for (let i = 0; i < 7; i++) {
    const y = (r() * H) | 0,
      h = ((2 + r() * 10) * k) | 0,
      dx = (r() - 0.5) * 18 * k;
    c.drawImage(o, 0, y, W, h, dx, y, W, h);
  }
  c.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = 0; y < H; y += Math.max(2, Math.round(3 * k))) c.fillRect(0, y, W, Math.max(1, k));
  for (let i = 0; i < 26; i++) {
    c.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`;
    c.fillRect(r() * W, r() * H, (8 + r() * 90) * k, (1 + r() * 1.5) * k);
  }
  c.fillStyle = 'rgba(255,255,255,.07)';
  c.fillRect(0, r() * H, W, (14 + r() * 20) * k);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = '#d8e3cf';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  if (stamp) {
    // in the middle part of the picture, so that a card (which keeps the middle) keeps it too
    const f = Math.max(12, (W / 64) | 0);
    c.font = `${f}px monospace`;
    c.fillStyle = 'rgba(235,240,230,.85)';
    c.textBaseline = 'bottom';
    c.textAlign = 'center';
    c.fillText(stamp, W / 2, H - f * 0.6);
    c.textAlign = 'left';
  }
}
