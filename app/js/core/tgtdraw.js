// @ts-check
// Target picture (Weapons > Target): the rules without the page. The place of a picture on the ground, the targets made from the DTC points and the
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
const KSIZE = {
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
export function planBox(pts, c, w = 1080, h = 520) {
  let ex = 0.3,
    ey = 0.3;
  for (const p of pts) {
    ex = Math.max(ex, Math.abs(p.x - c[0]));
    ey = Math.max(ey, Math.abs(p.y - c[1]));
  }
  const wk = Math.max(0.6, ex * 2 * 1.3, ey * 2 * 1.3 * (w / h));
  return geoBox(c[0], c[1], wk, (wk * h) / w);
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
export function planPicture(feats, c, seed, extra = [], ground = null) {
  const W = 2160,
    H = 1040,
    geo = planBox([...feats, ...extra], c, W, H),
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
  // trees: small dark green dots in groups, never on the water nor on the buildings (they are only a look: BMS gives no trees)
  const near = feats.map(f => P(f.x, f.y)),
    clear = Math.max(30, 45 * mpx),
    tr = Math.max(2.5, Math.min(6, 4 * mpx));
  for (let i = 0; i < 46; i++) {
    const cx = r() * W,
      cy = r() * H,
      n = 10 + ((r() * 50) | 0),
      sp = 30 + r() * 110;
    for (let j = 0; j < n; j++) {
      const px = cx + (r() - 0.5) * 2 * sp,
        py = cy + (r() - 0.5) * 2 * sp * 0.7,
        rad = tr * (0.7 + r() * 0.6);
      if (water(px, py) || near.some(q => Math.abs(q[0] - px) < clear && Math.abs(q[1] - py) < clear)) continue;
      g.fillStyle = 'rgba(20,30,16,.35)';
      g.beginPath();
      g.arc(px + rad * 0.5, py + rad * 0.5, rad, 0, 7);
      g.fill();
      g.fillStyle = r() < 0.5 ? '#3d5a2c' : '#47663a';
      g.beginPath();
      g.arc(px, py, rad, 0, 7);
      g.fill();
    }
  }
  // a bridge: the spans in a line; the water across it
  const spans = feats.filter(f => featKind(f.name) == 'span');
  let ang = 0;
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
  for (const f of feats) {
    const k = featKind(f.name),
      [px, py] = P(f.x, f.y),
      [sw, sh] = KSIZE[k],
      w = Math.max(10, sw * mpx),
      h = Math.max(8, sh * mpx);
    g.save();
    g.translate(px, py);
    if (k == 'span') g.rotate(ang);
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowOffsetX = g.shadowOffsetY = Math.max(3, 4 * mpx);
    g.shadowBlur = 3;
    g.fillStyle = f.st == 2 ? '#3b3530' : k == 'rwy' ? '#9a968c' : '#d8d4c8';
    if (k == 'bunk') {
      g.beginPath();
      g.moveTo(-w / 2, h / 2);
      g.lineTo(-w / 2, -h / 6);
      g.quadraticCurveTo(0, -h * 0.75, w / 2, -h / 6);
      g.lineTo(w / 2, h / 2);
      g.closePath();
      g.fill();
    } else if (k == 'tank' || k == 'rad') {
      g.beginPath();
      g.arc(0, 0, w / 2, 0, 7);
      g.fill();
    } else if (k == 'aaa') {
      g.shadowColor = 'transparent';
      g.strokeStyle = '#d8d4c8';
      g.lineWidth = Math.max(3, w / 6);
      g.beginPath();
      g.arc(0, 0, w / 2, 0, 7);
      g.stroke();
    } else g.fillRect(-w / 2, -h / 2, w, h);
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
  return { c: cv, geo };
}

// ---- the filters (on the picture only, never on the symbols)
export const FILTERS = [
  ['none', 'Original'],
  ['recon', 'Recon B/W'],
  ['ir', 'IR white-hot'],
  ['r80', 'Recon 1980s'],
];
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
  if (f == 'r80') {
    // low definition: down to a third and up again
    const q = document.createElement('canvas');
    q.width = Math.max(1, (W / 3.2) | 0);
    q.height = Math.max(1, (H / 3.2) | 0);
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
    g = (g - 128) * con + 128 + NOISE[j] * gr;
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  c.putImageData(d, 0, 0);
  if (f == 'r80') retro(c, W, H, stamp || '');
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
