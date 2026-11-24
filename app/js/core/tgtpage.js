// A-G > Target: a target picture in the style of a Basic Target Graphic. Page 1 (graphic): the picture of the target (the plan of the objective, a
// picture of the Map page or a pasted screenshot) with the BTG symbols drawn on it, the DMPI boxes under it; page 2 (target information): the text and
// the detail pictures for the positive identification. "Fill from the datacard" draws the DMPIs (DTC), the attack (attack planner, else the flight plan),
// the SAM rings and the enemy units (campaign). The pages go to the Kneeboard as cards (2:3) or onto the datacard in place of the map screenshot.
// The rules without the page (place on the ground, targets, threats, plan, filters) are in tgtdraw.js. Nothing is written into the DTC.
// deps: {esc, anim(), toast(msg), points() -> Promise<{points, objs}>, features(objId) -> Promise<{feats, pct}|null>, threats() -> {sams, units},
//   attack() -> {segs, t, hdg, egr, spd, rel, fz, wpn}|null, route() -> [{n, x, y}], info() -> {cs, mis, tot, wpn}, geoLL(x, y), pick() -> Promise<{x, y, name}|null>,
//   mapFrame(el, [x, y], nm) -> Promise<bool>, mapDetach(), fromLL(lat, lon), kbAdd(blob, name) -> Promise<{side, row}|null>, putShot(canvas), shotDim(), prefs: {load, save}}
import { inkCard, otherLook, cardDark } from './cardink.js';
import { pickAll } from './tgdlg.js';
import {
  PAL,
  COL,
  KM_NM,
  toUV,
  fromUV,
  geoWidth,
  geoCorners,
  brgDist,
  brg3,
  groupTargets,
  threatsNear,
  planPicture,
  planBox,
  rotBox,
  northOn,
  groundGrid,
  featSym,
  spanAngle,
  FILTERS,
  HUDS,
  filterPic,
} from './tgtdraw.js';
import { OBJ_TYPES } from './targets.js';
import { toMag } from './magvar.js';
import { drawSmartTarget } from './smarttgt.js';
import { featKind } from './tgtdraw.js';
// the headings and bearings the pilot reads: magnetic (BMS 4.38); the heading of the pod picture ("T"), the wind and the turn of the picture stay true
const brgM = b => brg3(toMag(b));

const FT_KM = 3280.84,
  PW = 1100,
  PH = 850,
  FONT = 'system-ui, Segoe UI, sans-serif',
  PEN = '"BMS Hand", cursive',
  CLS = 'FOR SIMULATION USE ONLY · FALCON BMS';
const TOOLS = [
  ['select', 'Select'],
  ['callout', 'Callout'],
  ['dmpi', 'DMPI'],
  ['num', 'Number'],
  ['box', 'Box'],
  ['circle', 'Circle'],
  ['area', 'Area'],
  ['arrow', 'Arrow'],
  ['axis', 'Axis'],
  ['north', 'North'],
  ['scale', 'Scale'],
  ['text', 'Text'],
];
const HINT = {
  select:
    'Drag a symbol to move it. Click a symbol to select it, double-click it to change its text. Delete removes the selected symbol.',
  callout: 'Click the point, then click where the label goes, then type the text.',
  dmpi: 'Click the aim point: a red triangle with its DMPI number. The boxes under the picture fill themselves.',
  num: 'Click: a black disc with the next number.',
  box: 'Drag to draw a box around a building or a group.',
  circle: 'Drag to draw a circle: red for the primary target, yellow for the secondary.',
  area: 'Drag to draw a diamond around the installation.',
  arrow: 'Drag from the label to the point.',
  axis: 'Drag from the IP side to the target: a dashed arrow with its heading.',
  north: 'Click where the north arrow goes. Drag a little to turn it.',
  scale: 'Drag along a known length, then type the length (for example 500 FT).',
  text: 'Click, then type the text.',
};
// the icons of the tool bar (24 x 24, drawn with the stroke, as the bar of the Briefing room)
const TICON = {
  select: '<path d="M5 3l12 8-5.5 1.2L9 18z"/>',
  callout:
    '<circle cx="5" cy="19" r="1.6" fill="currentColor"/><path d="M6.2 17.8L11 13"/><rect x="11" y="4" width="10" height="9" rx="1"/>',
  dmpi: '<path d="M12 4l8.5 15h-17z" fill="currentColor" fill-opacity=".3"/>',
  num: '<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".3"/><path d="M10.5 9l2-1.2V16.5"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  area: '<path d="M12 3l9 9-9 9-9-9z" stroke-dasharray="3 2.4"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  axis: '<path d="M12 21V4M8 8l4-4 4 4M9 14h6M9 17.5h6"/>',
  north: '<path d="M12 2.5l4 9h-8z" fill="currentColor" fill-opacity=".35"/><path d="M9 21v-6.5l6 6.5v-6.5"/>',
  scale: '<path d="M3 15h18M3 11.5v7M12 13v4M21 11.5v7"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  del: '<path d="M8 20h12M5 15l9-9 5 5-7 7H8z"/><path d="M9.5 10.5l5 5"/>',
  bld: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6M9 11h2M13 11h2"/>',
  clr: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};
const tico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${TICON[k]}</svg>`;
const COLS = ['#ffffff', '#ff3b30', '#f5d142', '#111111', '#38d6f2', '#4cc38a'];
// the four sizes of the symbols and of the labels: S, M, L, XL
const SIZES = [
  ['s', 'S', 1],
  ['m', 'M', 1.25],
  ['l', 'L', 1.5],
  ['xl', 'XL', 2],
];
const szK = s => (SIZES.find(z => z[0] == s) || SIZES[0])[2];
const SHOWS = [
  ['dmpi', 'DMPI'],
  ['route', 'Route'],
  ['egr', 'Egress'],
  ['sam', 'SAM WEZ'],
  ['unit', 'Enemy units'],
  ['imp', 'Impacts'],
];
const VIEWS = [
  ['plan', 'Synthetic'],
  ['map', 'Map'],
  ['shot', 'Screenshot'],
];
const RANGES = [2, 5, 10, 20, 40];

export function createTargetPage(deps) {
  const { esc } = deps;
  const root = document.createElement('div');
  root.className = 'tgp';
  // ---- the settings that stay from one session to the next
  const PF = {
    filt: 'recon',
    con: 1.3,
    grn: 14,
    lsty: 'prog',
    pst: 'prog',
    range: 10,
    show: { dmpi: true, route: true, egr: true, sam: true, unit: true, imp: true },
    names: true,
    bld: true, // the buildings of the objective drawn on a picture of the map
    banner: 'CLASSIFIED', // the top line of the UAV FLIR display
    nscope: 'dmpi', // the names of the sub-objectives: of the DMPIs or all
    pen: false, // handwritten notes: the notes of the picture and the remarks in handwriting (the font only)
    lsz: 's', // the size of the labels drawn by the program (threats, units, names): S, M, L, XL
    ccol: '', // the colour chosen with the colour picker (a seventh swatch)
  };
  let pfT = 0;
  const pfSave = () => {
    clearTimeout(pfT);
    pfT = setTimeout(() => {
      try {
        deps.prefs && deps.prefs.save(PF);
      } catch (e) {}
    }, 400);
  };
  // ---- the targets and what the pilot did on each (kept for the session: the pictures are not saved)
  let TL = [],
    OBJS = [],
    sel = '',
    page = 'g',
    tool = 'select',
    col = '#ffffff',
    sz = 's', // the size of the next symbol
    selA = -1,
    drag = null,
    mv = null,
    pend = null,
    framing = false,
    built = false;
  // PICTURES: entries with no place (a screenshot to recognise an aircraft in an A-A mission...): only the Screenshot and Map views, the Graphic card
  // without coordinates; PIC_C, where the map opens for them (the first point of the flight)
  const PICS = [];
  let PICN = 0,
    PIC_C = { x: 512, y: 512 };
  const PICKS = [],
    HIDE = new Set(), // the points taken out of the list (the target of the flight, a route steerpoint): only hidden
    ST = {},
    FEAT = {};
  const pid = p => p.kind + ':' + (p.ref || p.short || '') + ':' + p.x.toFixed(3) + ',' + p.y.toFixed(3);
  const tgt = () => TL.find(t => t.key == sel) || null;
  const st = () => {
    const t = tgt();
    if (!t) return null;
    return (
      ST[t.key] ||
      (ST[t.key] = {
        view: t.pic ? 'shot' : t.objId != null ? 'plan' : 'map',
        shot: null,
        map: null,
        ann: { plan: [], map: [], shot: [] },
        fac: t.name.toUpperCase(),
        auto: true, // Fill from the datacard on at first
        rem: '',
        bv: 0,
      })
    );
  };
  const A = () => {
    const s = st();
    return s ? s.ann[s.view] : [];
  };
  // ---- drawing: x is the context drawn into (the page on screen, a card, the datacard picture), in page pixels
  let x = null,
    IMG = { x: 10, y: 122, w: 1080, h: 520 },
    CARDM = false, // the picture fills its frame (a card, the datacard): the middle is kept
    CROPR = null, // the part of the picture (u0, v0, w, h) drawn into IMG: the datacard
    SCR = false, // drawing the page on screen (the marks that are not printed: crop frame, the × of the DMPI boxes)
    CROP = null, // the crop frame shown for Put on datacard
    PLACED = [],
    DEFER = null, // the labels of the datacard layer, drawn after its symbols
    SYMS = null; // the places of those symbols (the labels keep off them)
  // the colours of the page. On a card of the dark look (CARDDK, always in the Paper layout): Paper turned like the other cards, its black bands drawn
  // light so they come out as dark panels with light text, its lines dim
  let CARDDK = false;
  const PAPER_DK = { ...PAL.paper, band: '#e8ebef', btx: '#000000', line: '#9aa0a6' };
  const P = () => (CARDDK ? PAPER_DK : PAL[PF.pst] || PAL.prog);

  // the picture under the symbols: {c (filtered), geo (null for a screenshot)}
  const FC = new Map();
  function rawPic() {
    const s = st(),
      t = tgt();
    if (!s || !t) return null;
    if (s.view == 'shot') return s.shot ? { c: s.shot, geo: null, k: 'shot' + s.bv } : null;
    if (s.view == 'map') return s.map ? { c: s.map.c, geo: s.map.geo, k: 'map' + s.bv } : null;
    const f = FEAT[t.key];
    return f && f.plan ? { c: f.plan.c, geo: f.plan.geo, k: 'plan' + (f.v || 0) } : null;
  }
  function stamp() {
    const t = tgt(),
      i = deps.info ? deps.info() : {};
    return [
      'FR ' + String(1 + (Math.abs(hash(sel)) % 900)).padStart(4, '0'),
      t ? t.label : '',
      i.tot || '',
      'BMS CARDS',
    ]
      .filter(Boolean)
      .join('   ');
  }
  const hash = s => [...String(s)].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
  function pic() {
    const r = rawPic();
    if (!r) return null;
    const key = sel + '|' + r.k + '|' + PF.filt + '|' + PF.con + '|' + PF.grn;
    if (!FC.has(key)) {
      if (FC.size > 12) FC.clear();
      FC.set(key, filterPic(r.c, PF.filt, PF.con, PF.grn, stamp()));
    }
    return { c: FC.get(key), geo: r.geo };
  }
  function prect() {
    if (CROPR) {
      const p = pic(),
        bw = p ? p.c.width : IMG.w,
        bh = p ? p.c.height : IMG.h,
        k = IMG.w / (CROPR.w * bw);
      return { x: IMG.x - CROPR.u * bw * k, y: IMG.y - CROPR.v * bh * k, w: bw * k, h: bh * k };
    }
    const p = pic(),
      bw = p ? p.c.width : IMG.w,
      bh = p ? p.c.height : IMG.h,
      r = (CARDM ? Math.max : Math.min)(IMG.w / bw, IMG.h / bh),
      w = bw * r,
      h = bh * r;
    return { x: IMG.x + (IMG.w - w) / 2, y: IMG.y + (IMG.h - h) / 2, w, h };
  }
  // the part of the picture that is seen
  function vr() {
    const r = prect(),
      x0 = Math.max(r.x, IMG.x),
      y0 = Math.max(r.y, IMG.y);
    return { x: x0, y: y0, w: Math.min(r.x + r.w, IMG.x + IMG.w) - x0, h: Math.min(r.y + r.h, IMG.y + IMG.h) - y0 };
  }
  const toP = (u, v) => {
      const r = prect();
      return [r.x + u * r.w, r.y + v * r.h];
    },
    toU = (px, py) => {
      const r = prect();
      return [(px - r.x) / r.w, (py - r.y) / r.h];
    };
  const geo = () => {
    const p = pic();
    return p ? p.geo : null;
  };
  const W2P = (gx, gy) => {
    const [u, v] = toUV(geo(), gx, gy);
    return toP(u, v);
  };
  const pxPerKm = () => prect().w / geoWidth(geo());
  // where north points on the picture (degrees clockwise from the top): 0 without a place on the ground (a screenshot)
  const nUp = () => northOn(geo());
  const inR = (px, py, m = 0) => {
    const r = vr();
    return px >= r.x + m && px <= r.x + r.w - m && py >= r.y + m && py <= r.y + r.h - m;
  };

  // ---- labels and symbols
  function tag(t, lx, ly, o = {}) {
    if (DEFER) return void DEFER.push([t, lx, ly, o]);
    const pen = o.pen,
      ls = o.ls || PF.lsty,
      k = o.k || szK(PF.lsz); // a symbol drawn by hand gives its own size; the labels of the program take the one of the Page card
    x.font = pen ? 21 * k + 'px ' + PEN : '600 ' + 14 * k + 'px ' + FONT;
    const w = x.measureText(t).width + 14 * k,
      h = (pen ? 30 : 22) * k;
    let bx = lx - (o.al == 'c' ? w / 2 : o.al == 'r' ? w : 0),
      by = ly - h / 2;
    const cl = () => {
      if (o.clamp || CARDM) {
        const r = vr();
        bx = Math.max(r.x + 4, Math.min(r.x + r.w - w - 4, bx));
        by = Math.max(r.y + 4, Math.min(r.y + r.h - h - 4, by));
      }
    };
    cl();
    if (o.avoid) {
      const b0 = bx,
        y0 = by,
        hit = () =>
          PLACED.some(q => bx < q[0] + q[2] + 4 && bx + w + 4 > q[0] && by < q[1] + q[3] + 3 && by + h + 3 > q[1]);
      for (let i = 1; i < 14 && hit(); i++) {
        const s = (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        bx = b0;
        by = y0 + s * (h + 4);
        cl();
        if (hit()) {
          by = y0;
          bx = b0 + s * (w * 0.5 + 8);
          cl();
        }
      }
      PLACED.push([bx, by, w, h]);
      // moved away from its symbol: a thin line back to it
      if (o.anchor && (bx != b0 || by != y0)) {
        const [ax, ay] = o.anchor,
          nx = Math.max(bx, Math.min(bx + w, ax)),
          ny = Math.max(by, Math.min(by + h, ay));
        if (Math.hypot(nx - ax, ny - ay) > 14) {
          x.strokeStyle = o.col || '#e6edf3';
          x.lineWidth = 1.2;
          x.beginPath();
          x.moveTo(ax, ay);
          x.lineTo(nx, ny);
          x.stroke();
        }
      }
    }
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    if (pen) {
      x.fillStyle = o.col || '#fff';
      x.fillText(t, bx + 7 * k, by + h / 2 + 1);
      return;
    }
    const c = o.col;
    if (ls == 'prog') {
      x.fillStyle = 'rgba(15,20,25,.88)';
      x.fillRect(bx, by, w, h);
      x.strokeStyle = c || '#e6edf3';
      x.lineWidth = 1.2;
      x.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      x.fillStyle = c || '#e6edf3';
    } else {
      x.fillStyle = '#fff';
      x.fillRect(bx, by, w, h);
      x.strokeStyle = ls == 'red' ? '#d01818' : c && c != '#ffffff' ? c : '#000';
      x.lineWidth = 1.4;
      x.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      x.fillStyle = ls == 'red' ? '#d01818' : '#000';
    }
    x.fillText(t, bx + 7 * k, by + h / 2 + 1);
  }
  function tri(px, py, k = 1) {
    if (SYMS) SYMS.push([px - 12 * k, py - 14 * k, 24 * k, 22 * k]);
    x.fillStyle = COL.dmpi;
    x.strokeStyle = '#fff';
    x.lineWidth = 1.5 * k;
    x.beginPath();
    x.moveTo(px, py - 14 * k);
    x.lineTo(px + 12 * k, py + 8 * k);
    x.lineTo(px - 12 * k, py + 8 * k);
    x.closePath();
    x.fill();
    x.stroke();
  }
  function head(a1, b1, a2, b2, s, c) {
    const an = Math.atan2(b2 - b1, a2 - a1);
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(a2, b2);
    x.lineTo(a2 - s * Math.cos(an - 0.42), b2 - s * Math.sin(an - 0.42));
    x.lineTo(a2 - s * Math.cos(an + 0.42), b2 - s * Math.sin(an + 0.42));
    x.closePath();
    x.fill();
  }
  // a hostile unit: the red diamond of the Map page (APP-6 look) with its inner sign
  function unitSym(px, py, g) {
    if (SYMS) SYMS.push([px - 16, py - 16, 32, 32]);
    const s = 15,
      q = s * 0.42;
    x.save();
    x.translate(px, py);
    x.fillStyle = 'rgba(15,20,25,.85)';
    x.strokeStyle = COL.unit;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -s);
    x.lineTo(s, 0);
    x.lineTo(0, s);
    x.lineTo(-s, 0);
    x.closePath();
    x.fill();
    x.stroke();
    x.lineWidth = 1.6;
    x.beginPath();
    if (/inf|mech|abn/.test(g)) {
      x.moveTo(-q, -q * 0.6);
      x.lineTo(q, q * 0.6);
      x.moveTo(-q, q * 0.6);
      x.lineTo(q, -q * 0.6);
    }
    if (/armor|mech|armcav/.test(g)) {
      x.moveTo(q, 0);
      x.ellipse(0, 0, q, q * 0.6, 0, 0, 7);
    }
    if (/cav/.test(g)) {
      x.moveTo(-q, q * 0.6);
      x.lineTo(q, -q * 0.6);
    }
    if (/ad|aaa|shorad|basedef/.test(g)) {
      x.moveTo(-q, q * 0.7);
      x.quadraticCurveTo(0, -q * 1.3, q, q * 0.7);
    }
    if (/missile|rocket/.test(g)) {
      x.moveTo(0, q);
      x.lineTo(0, -q);
      x.moveTo(-q * 0.5, -q * 0.4);
      x.lineTo(0, -q);
      x.lineTo(q * 0.5, -q * 0.4);
    }
    if (/ship|carrier|sub/.test(g)) {
      x.moveTo(-q, 0);
      x.lineTo(q, 0);
      x.lineTo(q * 0.6, q * 0.6);
      x.lineTo(-q * 0.6, q * 0.6);
      x.closePath();
    }
    x.stroke();
    if (/art/.test(g)) {
      x.fillStyle = COL.unit;
      x.beginPath();
      x.arc(0, 0, 3.5, 0, 7);
      x.fill();
    }
    if (/hq|eng|sup|sf|mar|unk/.test(g) && !/shorad/.test(g)) {
      x.fillStyle = COL.unit;
      x.font = '700 9px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText({ hq: 'HQ', eng: 'E', sup: 'S', sf: 'SF', mar: 'M', unk: '?' }[g] || '', 0, 1);
    }
    x.restore();
  }
  // an arrow at the edge of the picture, towards something outside it (b: bearing from the middle of the picture)
  function edge(b, text, c) {
    const r = vr(),
      cx = r.x + r.w / 2,
      cy = r.y + r.h / 2,
      R2 = Math.PI / 180,
      dx = Math.sin(b * R2),
      dy = -Math.cos(b * R2),
      m = 26;
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (r.x + r.w - m - cx) / dx);
    if (dx < -1e-6) t = Math.min(t, (r.x + m - cx) / dx);
    if (dy > 1e-6) t = Math.min(t, (r.y + r.h - m - cy) / dy);
    if (dy < -1e-6) t = Math.min(t, (r.y + m - cy) / dy);
    const qx = cx + dx * t,
      qy = cy + dy * t;
    x.strokeStyle = c;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(qx - dx * 22, qy - dy * 22);
    x.lineTo(qx, qy);
    x.stroke();
    head(qx - dx * 22, qy - dy * 22, qx + dx * 6, qy + dy * 6, 14, c);
    tag(text, qx - dx * 34, qy - dy * 34, {
      col: c,
      al: dx > 0.3 ? 'r' : dx < -0.3 ? 'l' : 'c',
      clamp: true,
      avoid: true,
    });
  }

  // ---- what the datacard gives for the target on screen (ground in km)
  function dc() {
    const t = tgt();
    if (!t) return null;
    const c = [t.x, t.y],
      th = deps.threats ? deps.threats() : { sams: [], units: [] },
      near = threatsNear(c, th.sams, th.units),
      route = attackRoute(t);
    return { t, c, sams: near.sams, units: near.units, route };
  }
  // the attack: the attack planner when its target is on this target, else the legs of the flight plan in and out of the steerpoint on it
  function attackRoute(t) {
    const pts = [[t.x, t.y], ...t.dmpis.map(d => [d.x, d.y])],
      on = (gx, gy, km) => pts.some(p => Math.hypot(p[0] - gx, p[1] - gy) < km);
    try {
      const a = deps.attack && deps.attack();
      if (a && a.t && on(a.t.e / FT_KM, a.t.n / FT_KM, 3)) {
        const K = p => [p.e / FT_KM, p.n / FT_KM],
          ing = a.segs.filter(s => s.k != 'egress' && s.k != 'ref').map(s => s.pts.map(K)),
          egr = a.segs.filter(s => s.k == 'egress').map(s => s.pts.map(K)),
          tp = K(a.t);
        return {
          src: 'attack',
          ing,
          egr,
          tp,
          ip: ing.length && ing[0].length ? ing[0][0] : null,
          ep: egr.length ? egr[egr.length - 1][egr[egr.length - 1].length - 1] : null,
          hdg: a.hdg,
          ehdg: a.egr,
          spd: a.spd,
          rel: a.rel,
          mode: a.mode,
          fz: a.fz,
          wpn: a.wpn,
          imp: (a.impacts || []).map(K),
          leth: a.leth ? { r: a.leth.r / FT_KM, pts: a.leth.pts.map(K) } : null,
          cbu: a.cbu ? { r: a.cbu.r / FT_KM, pts: a.cbu.pts.map(K) } : null,
        };
      }
    } catch (e) {}
    const R = (deps.route && deps.route()) || [];
    let bi = -1,
      bd = 6;
    R.forEach((w, i) => {
      const d = Math.min(...pts.map(p => Math.hypot(p[0] - w.x, p[1] - w.y)));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi < 0) return null;
    const w = R[bi],
      a = R[bi - 1],
      b = R[bi + 1],
      tp = [w.x, w.y];
    return {
      src: 'route',
      stpt: w.n,
      ing: a ? [[[a.x, a.y], tp]] : [],
      egr: b ? [[tp, [b.x, b.y]]] : [],
      tp,
      ip: a ? [a.x, a.y] : null,
      ep: b ? [b.x, b.y] : null,
      ipName: a ? 'STPT ' + a.n : '',
      epName: b ? 'STPT ' + b.n : '',
      hdg: a ? brgDist([a.x, a.y], tp).brg : null,
      ehdg: b ? brgDist(tp, [b.x, b.y]).brg : null,
    };
  }
  // the datacard layer of the graphic page
  function autoLayer() {
    const D = dc(),
      g = geo(),
      r = vr(),
      sh = PF.show;
    PLACED = [];
    DEFER = [];
    SYMS = [];
    if (!D || (tgt() && tgt().pic)) {
      DEFER = SYMS = null;
      return;
    }
    const k = g ? pxPerKm() : 0;
    if (sh.sam)
      D.sams.forEach(s => {
        const txt = `${s.name} · ${s.nm.toFixed(1)} NM ${brgM(s.brg)} · WEZ ${s.rNm.toFixed(0)} NM${s.inside ? ' · TGT INSIDE' : ''}`;
        if (!g) return edge(s.brg, txt, COL.sam);
        const [cx, cy] = W2P(s.x, s.y),
          R = s.r * k,
          nx = Math.max(r.x, Math.min(r.x + r.w, cx)),
          ny = Math.max(r.y, Math.min(r.y + r.h, cy)),
          dn = Math.hypot(nx - cx, ny - cy),
          df = Math.max(
            ...[
              [r.x, r.y],
              [r.x + r.w, r.y],
              [r.x, r.y + r.h],
              [r.x + r.w, r.y + r.h],
            ].map(([a, b]) => Math.hypot(a - cx, b - cy))
          );
        if (dn < R && df > R) {
          x.fillStyle = 'rgba(255,159,26,.06)';
          x.beginPath();
          x.arc(cx, cy, R, 0, 7);
          x.fill();
          x.strokeStyle = COL.sam;
          x.lineWidth = 2.2;
          x.setLineDash([10, 7]);
          x.stroke();
          x.setLineDash([]);
          let L = null;
          for (let b = 0; b < 360; b += 30) {
            const q = [cx + Math.sin((b * Math.PI) / 180) * R, cy - Math.cos((b * Math.PI) / 180) * R];
            if (inR(q[0], q[1], 40)) {
              L = q;
              break;
            }
          }
          if (L)
            tag(`${s.name} WEZ ${s.rNm.toFixed(0)} NM`, L[0], L[1], {
              col: COL.sam,
              al: 'c',
              clamp: true,
              avoid: true,
            });
          if (inR(cx, cy)) {
            x.fillStyle = COL.sam;
            x.beginPath();
            x.arc(cx, cy, 5, 0, 7);
            x.fill();
            tag(s.name.toUpperCase(), cx + 10, cy + 16, { col: COL.sam, clamp: true, avoid: true });
          } else if (!L) edge(s.brg, txt, COL.sam);
        } else if (!inR(cx, cy)) edge(s.brg, txt, COL.sam);
        else {
          x.fillStyle = COL.sam;
          x.beginPath();
          x.arc(cx, cy, 5, 0, 7);
          x.fill();
          tag(s.name.toUpperCase(), cx + 10, cy + 16, { col: COL.sam, clamp: true, avoid: true });
        }
      });
    if (sh.unit)
      D.units.forEach(u => {
        const txt = `${u.name} · ${u.nm.toFixed(1)} NM`;
        if (!g) return edge(u.brg, txt, COL.unit);
        const [px, py] = W2P(u.x, u.y);
        if (inR(px, py, 16)) {
          unitSym(px, py, u.glyph);
          tag(u.name.toUpperCase(), px + 20, py, { col: COL.unit, clamp: true, avoid: true });
        } else edge(u.brg, txt, COL.unit);
      });
    const R = D.route;
    if (R) {
      const leg = (lines, c, lab, dash, isIn, end, endName, hdg) => {
        if (!lines.length) return;
        if (!g) {
          if (hdg != null) edge(isIn ? hdg + 180 : hdg, lab, c);
          return;
        }
        x.save();
        x.beginPath();
        x.rect(r.x, r.y, r.w, r.h);
        x.clip();
        x.lineCap = 'round';
        x.lineJoin = 'round';
        x.setLineDash(dash);
        lines.forEach(pl => {
          x.beginPath();
          pl.forEach((p, i) => {
            const q = W2P(p[0], p[1]);
            if (i) x.lineTo(q[0], q[1]);
            else x.moveTo(q[0], q[1]);
          });
          x.strokeStyle = 'rgba(0,0,0,.55)';
          x.lineWidth = 7;
          x.stroke();
          x.strokeStyle = c;
          x.lineWidth = 3.5;
          x.stroke();
        });
        x.setLineDash([]);
        x.restore();
        if (hdg == null) return;
        // the arrow and the label on the straight line through the target, where it is seen
        const o = W2P(R.tp[0], R.tp[1]),
          a = (((isIn ? hdg + 180 : hdg) % 360) * Math.PI) / 180,
          ux = Math.sin(a),
          uy = -Math.cos(a),
          dv = Math.min(r.w, r.h) * 0.36,
          hx = o[0] + ux * dv,
          hy = o[1] + uy * dv,
          s = isIn ? -1 : 1;
        if (inR(hx, hy, 10)) head(hx - s * ux * 10, hy - s * uy * 10, hx + s * ux * 8, hy + s * uy * 8, 18, c);
        tag(lab, o[0] + ux * dv * 0.6 - uy * 24, o[1] + uy * dv * 0.6 + ux * 24, {
          col: c,
          al: 'c',
          clamp: true,
          avoid: true,
        });
        if (end && endName) {
          const [px, py] = W2P(end[0], end[1]);
          if (inR(px, py, 12)) {
            x.strokeStyle = c;
            x.lineWidth = 2.5;
            x.beginPath();
            x.arc(px, py, 8, 0, 7);
            x.stroke();
            tag(endName, px + 12, py - 16, { col: c, clamp: true, avoid: true });
          }
        }
      };
      if (sh.route)
        leg(
          R.ing,
          COL.ing,
          'RUN-IN ' + (R.hdg != null ? brgM(R.hdg) : '') + (R.spd ? ' · ' + Math.round(R.spd) + ' KT' : ''),
          [14, 8],
          true,
          R.ip,
          R.src == 'route' ? R.ipName : 'IP',
          R.hdg
        );
      if (sh.egr)
        leg(
          R.egr,
          COL.egr,
          'EGRESS ' + (R.ehdg != null ? brgM(R.ehdg) : ''),
          [],
          false,
          R.ep,
          R.src == 'route' ? R.epName : '',
          R.ehdg
        );
    }
    // the impacts of the stick, as on the map of the A-G page: red dots, the lethal radius around the first and the last, the CBU footprints
    if (R && R.src == 'attack' && sh.imp && g) {
      const k = pxPerKm(),
        ring = (q, rad, c, dash, fill) => {
          const [px, py] = W2P(q[0], q[1]);
          x.beginPath();
          x.arc(px, py, rad * k, 0, 7);
          x.fillStyle = fill;
          x.fill();
          x.setLineDash(dash);
          x.strokeStyle = c;
          x.lineWidth = 2;
          x.stroke();
          x.setLineDash([]);
        };
      if (R.cbu) R.cbu.pts.forEach(q => ring(q, R.cbu.r, '#ff5d5d', [6, 5], 'rgba(255,93,93,.12)'));
      if (R.leth) R.leth.pts.forEach(q => ring(q, R.leth.r, '#ff3b3b', [], 'rgba(255,59,59,.07)'));
      R.imp.forEach(q => {
        const [px, py] = W2P(q[0], q[1]);
        x.beginPath();
        x.arc(px, py, 3.5, 0, 7);
        x.fillStyle = '#ff5d5d';
        x.fill();
        x.strokeStyle = '#111';
        x.lineWidth = 2;
        x.stroke();
      });
    }
    const f = FEAT[D.t.key];
    // the aim points: each with its label (its STPT); points closer than 18 px share one label (DMPI 1, 2 · STPT 81, 82)
    if (sh.dmpi && g) {
      const seen = [];
      D.t.dmpis.forEach((d, i) => {
        const [px, py] = W2P(d.x, d.y);
        if (!inR(px, py)) return;
        tri(px, py);
        const near = seen.find(q => Math.hypot(q.px - px, q.py - py) < 18);
        if (near) near.ix.push(i);
        else seen.push({ px, py, d, ix: [i] });
      });
      seen.forEach(({ px, py, d, ix }) => {
        const L = ix.map(i => D.t.dmpis[i]),
          one = ix.length == 1;
        tag(
          one
            ? dmpiName(d, ix[0]) +
                (PF.names && d.name && !/^(STPT|WPN|PICK)/.test(d.name) ? ' · ' + d.name.toUpperCase() : '')
            : 'DMPI ' +
                ix.map(i => i + 1).join(', ') +
                (L.some(q => q.short) ? ' · ' + L.map(q => q.short || '—').join(', ') : ''),
          px + 16,
          py - 16,
          { avoid: true, col: refCol(d.kind), anchor: [px, py] }
        );
      });
    } // a screenshot has no scale: its aim points are the ones put by hand with the DMPI tool
    // the labels last, around the symbols (the symbols never cover a label)
    const LB = DEFER;
    DEFER = null;
    PLACED = SYMS.slice();
    SYMS = null;
    LB.forEach(([t, lx, ly, o]) => tag(t, lx, ly, { ...o, avoid: true }));
    // the names of the sub-objectives (all of them): the ones that have room
    if (g && PF.names && PF.nscope == 'all' && f && f.feats) {
      x.font = '600 11px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      let n = 0;
      for (const q of f.feats) {
        if (n > 80) break;
        if (sh.dmpi && D.t.dmpis.some(d => Math.hypot(d.x - q.x, d.y - q.y) < 0.03)) continue;
        const [px, py] = W2P(q.x, q.y);
        if (!inR(px, py, 8)) continue;
        const w = x.measureText(q.name).width + 6,
          bx = px - w / 2,
          by = py + 9;
        if (PLACED.some(b => bx < b[0] + b[2] && bx + w > b[0] && by < b[1] + b[3] && by + 14 > b[1])) continue;
        PLACED.push([bx, by, w, 14]);
        x.lineWidth = 3;
        x.strokeStyle = 'rgba(0,0,0,.75)';
        x.strokeText(q.name, px, by + 7);
        x.fillStyle = q.st == 2 ? '#ff8a80' : '#e6edf3';
        x.fillText(q.name, px, by + 7);
        n++;
      }
    }
  }
  const dmpiName = (d, i) => 'DMPI ' + (i + 1) + (d.short ? ' · ' + d.short : '');
  // the colour of a steerpoint as on the Map page (its palette: dark, light or the BMS one): TGT STPT, weapon target, route steerpoint
  function refCol(kind, page) {
    let m = deps.mapPal ? deps.mapPal() : null;
    if (!m || (page && m.light)) m = { prec: '#4dd0e1', wpn: '#ef4444', stpt: '#ffd23f' };
    return kind == 'prec' ? m.prec : kind == 'wpn' ? m.wpn : kind == 'stpt' ? m.stpt : undefined;
  }
  // the buildings of the objective on a picture of the map (where the objective files put them; their size in metres, a few px at least)
  function mapBuildings() {
    const t = tgt(),
      f = t && FEAT[t.key];
    if (!f || !f.feats) return;
    const mpx = pxPerKm() / 1000,
      P = (gx, gy) => W2P(gx, gy),
      ang = spanAngle(f.feats, P);
    f.feats.forEach(q => {
      const [px, py] = P(q.x, q.y);
      if (inR(px, py, -10))
        featSym(x, q, px, py, mpx, ang, { min: 0.6, edge: 'rgba(0,0,0,.6)', grid: (nUp() * Math.PI) / 180 });
    });
  }
  // ---- the sensor displays of the UAV filters, over the picture and under the symbols, with the data of the mission (never a real organisation)
  function hudData() {
    const t = tgt(),
      i = deps.info ? deps.info() : {},
      R = t ? attackRoute(t) : null,
      d = t && t.dmpis[0],
      ll = t && deps.geoLL ? deps.geoLL(d ? d.x : t.x, d ? d.y : t.y) : '',
      w = t && deps.wind ? deps.wind(t.x, t.y, (R && R.rel) || 2000) : null;
    return {
      cs: i.cs || '',
      tot: i.tot || '',
      ll,
      elv: d && d.altFt ? d.altFt + ' FT' : '',
      tgt: d ? d.short || 'DMPI 1' : t ? t.label : '',
      hdg: R && R.hdg != null ? R.hdg : null,
      alt: R && R.rel ? Math.round(R.rel) : null,
      spd: R && R.spd ? Math.round(R.spd) : null,
      wind: w,
    };
  }
  // the display of a targeting pod (white hot): the black bands, the heading tape, the data down both sides, the field of view, the cross, the clock
  function hudTgp() {
    const R = vr(),
      u = R.h / 520,
      D = hudData(),
      cx = R.x + R.w / 2,
      cy = R.y + R.h / 2,
      bh = R.h * 0.07,
      hd = D.hdg == null ? 0 : D.hdg;
    x.save();
    x.fillStyle = '#000';
    x.fillRect(R.x, R.y, R.w, bh);
    x.fillRect(R.x, R.y + R.h - bh, R.w, bh);
    x.strokeStyle = '#f2f2f2';
    x.fillStyle = '#f2f2f2';
    x.shadowColor = 'rgba(0,0,0,.85)';
    x.shadowBlur = 3 * u;
    x.lineWidth = 2 * u;
    x.font = '700 ' + 15 * u + 'px monospace';
    x.textBaseline = 'middle';
    // the heading tape at the top, with the heading in a box
    const ty = R.y + bh + 52 * u,
      tw = R.w * 0.3,
      pxd = tw / 40;
    x.beginPath();
    x.moveTo(cx - tw / 2, ty);
    x.lineTo(cx + tw / 2, ty);
    for (let d = Math.ceil((hd - 20) / 5) * 5; d <= hd + 20; d += 5) {
      const px = cx + (d - hd) * pxd,
        L = d % 10 ? 7 : 13;
      x.moveTo(px, ty);
      x.lineTo(px, ty - L * u);
    }
    x.stroke();
    x.textAlign = 'center';
    const hs = brg3(hd).replace('°', '') + 'T',
      hw = x.measureText(hs).width + 12 * u;
    x.strokeRect(cx - hw / 2, ty - 44 * u, hw, 22 * u);
    x.fillText(hs, cx, ty - 33 * u);
    x.beginPath();
    x.moveTo(cx - 6 * u, ty - 20 * u);
    x.lineTo(cx + 6 * u, ty - 20 * u);
    x.lineTo(cx, ty - 12 * u);
    x.closePath();
    x.fill();
    // the field of view and the cross
    const fw = R.w * 0.52,
      fh = R.h * 0.52,
      l = 14 * u;
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sy]) => {
      const px = cx + (sx * fw) / 2,
        py = cy + (sy * fh) / 2;
      x.beginPath();
      x.moveTo(px - sx * l, py);
      x.lineTo(px, py);
      x.lineTo(px, py - sy * l);
      x.stroke();
    });
    x.beginPath();
    [
      [-26, 0, -9, 0],
      [9, 0, 26, 0],
      [0, -20, 0, -9],
      [0, 9, 0, 20],
    ].forEach(([a, b2, c2, e]) => {
      x.moveTo(cx + a * u, cy + b2 * u);
      x.lineTo(cx + c2 * u, cy + e * u);
    });
    x.stroke();
    // the elevation scale on the left
    const sx0 = R.x + 140 * u,
      sy0 = cy - 90 * u,
      sh = 200 * u;
    x.beginPath();
    x.moveTo(sx0, sy0);
    x.lineTo(sx0, sy0 + sh);
    for (let k = 0; k <= 6; k++) {
      x.moveTo(sx0, sy0 + (k * sh) / 6);
      x.lineTo(sx0 - (k % 3 ? 6 : 12) * u, sy0 + (k * sh) / 6);
    }
    x.stroke();
    x.textAlign = 'right';
    x.fillText('60', sx0 - 18 * u, sy0);
    x.fillText('0', sx0 - 18 * u, sy0 + sh / 3);
    const dep = D.alt != null ? -Math.min(80, Math.max(5, Math.round(D.alt / 200))) : -45;
    x.textAlign = 'left';
    x.fillText('<' + dep, sx0 + 8 * u, sy0 + sh / 3 + (-dep / 60) * (sh / 3));
    // the data down both sides
    const col = (lines, left, y0) => {
      x.textAlign = left ? 'left' : 'right';
      lines
        .filter(Boolean)
        .forEach((q, k) => x.fillText(String(q), left ? R.x + 18 * u : R.x + R.w - 18 * u, y0 + k * 21 * u));
    };
    col(['POINT', 'UN', 'IR WHT', 'P1', 'NARO'], true, R.y + bh + 40 * u);
    const ll = String(D.ll).split(/\s+(?=[EW])/);
    col(
      ['ACFT', D.spd != null && D.spd + ' KT', D.alt != null && D.alt.toLocaleString('en-US') + ' MSL', D.cs],
      false,
      R.y + bh + 40 * u
    );
    col(
      [
        D.tgt,
        ll[0],
        ll[1],
        D.hdg != null && 'BRG ' + brgM(D.hdg).replace('°', ''),
        D.elv && 'ELV ' + D.elv.replace(' FT', 'F'),
      ],
      false,
      cy + 60 * u
    );
    col(['SEL', D.tot || '00:00:00'], true, R.y + R.h - bh - 46 * u);
    x.textAlign = 'center';
    x.fillText('ELRF', cx - R.w * 0.15, R.y + R.h - bh - 46 * u);
    x.restore();
  }
  function hudUav() {
    const R = vr(),
      u = R.h / 520,
      D = hudData(),
      C = '#5ce6ec',
      cx = R.x + R.w / 2,
      cy = R.y + R.h / 2;
    x.save();
    x.strokeStyle = C;
    x.fillStyle = C;
    x.shadowColor = C;
    x.shadowBlur = 6 * u;
    x.lineWidth = 2 * u;
    const corners = (w, h, l) => {
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].forEach(([sx, sy]) => {
        const px = cx + (sx * w) / 2,
          py = cy + (sy * h) / 2;
        x.beginPath();
        x.moveTo(px - sx * l, py);
        x.lineTo(px, py);
        x.lineTo(px, py - sy * l);
        x.stroke();
      });
    };
    corners(R.w * 0.5, R.h * 0.5, 10 * u); // the field of view
    x.lineWidth = 2.6 * u;
    corners(R.h * 0.24, R.h * 0.24, 13 * u); // the tracking box
    x.lineWidth = 2 * u;
    x.beginPath();
    [
      [-22, 0, -8, 0],
      [8, 0, 22, 0],
      [0, -18, 0, -8],
      [0, 8, 0, 18],
    ].forEach(([a, b, c2, e]) => {
      x.moveTo(cx + a * u, cy + b * u);
      x.lineTo(cx + c2 * u, cy + e * u);
    });
    x.stroke();
    x.font = '700 ' + 13 * u + 'px monospace';
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    x.fillText(D.tgt, cx + R.h * 0.12 + 8 * u, cy + 6 * u);
    // the data down both sides
    const col = (lines, left) => {
      x.textAlign = left ? 'left' : 'right';
      lines.filter(Boolean).forEach((q, k) => {
        const yy = R.y + R.h * 0.2 + k * 22 * u,
          xx = left ? R.x + 14 * u : R.x + R.w - 14 * u,
          w = x.measureText(q).width + 10 * u;
        x.shadowBlur = 0;
        x.fillStyle = 'rgba(30,80,90,.35)';
        x.fillRect(left ? xx - 5 * u : xx - w + 5 * u, yy - 9 * u, w, 18 * u);
        x.shadowBlur = 6 * u;
        x.fillStyle = C;
        x.fillText(q, xx, yy);
      });
    };
    const ll = String(D.ll).split(/\s+(?=[EW])/);
    col([D.cs, D.tgt, ll[0], ll[1], D.elv && 'ELEV ' + D.elv, D.tot && 'TOT ' + D.tot], true);
    col(
      [
        'BLK HOT',
        'NFOV',
        D.hdg != null && 'HDG ' + brgM(D.hdg),
        D.alt != null && 'ALT ' + D.alt.toLocaleString('en-US'),
        D.spd != null && 'GS ' + D.spd + ' KT',
        'LRD ARM',
      ],
      false
    );
    // the banner at the top
    if (PF.banner) {
      x.font = '800 ' + 28 * u + 'px ' + FONT;
      x.textAlign = 'center';
      const w = x.measureText(PF.banner).width + 24 * u;
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(20,24,20,.55)';
      x.fillRect(cx - w / 2, R.y + 10 * u, w, 40 * u);
      x.fillStyle = '#62f25a';
      x.shadowColor = '#62f25a';
      x.shadowBlur = 4 * u;
      x.fillText(PF.banner, cx, R.y + 31 * u);
    }
    x.restore();
  }
  function hudSuav() {
    const R = vr(),
      u = R.h / 520,
      D = hudData(),
      cx = R.x + R.w / 2,
      cy = R.y + R.h / 2,
      Y = '#e2c046',
      s2 = R.h * 0.17;
    x.save();
    x.shadowColor = 'rgba(0,0,0,.5)';
    x.shadowBlur = 3 * u;
    // the yellow box with its cross
    x.strokeStyle = Y;
    x.lineWidth = 3 * u;
    x.beginPath();
    x.roundRect(cx - s2, cy - s2, 2 * s2, 2 * s2, 8 * u);
    x.stroke();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 2 * u;
    x.setLineDash([12 * u, 7 * u]);
    x.beginPath();
    x.moveTo(cx - s2 + 4 * u, cy);
    x.lineTo(cx + s2 - 4 * u, cy);
    x.moveTo(cx, cy - s2 + 4 * u);
    x.lineTo(cx, cy + s2 - 4 * u);
    x.stroke();
    x.setLineDash([]);
    // the sun
    const sx = cx + s2 + 20 * u;
    x.fillStyle = '#f5c518';
    x.strokeStyle = '#f5c518';
    x.beginPath();
    x.arc(sx, cy, 6 * u, 0, 7);
    x.fill();
    x.lineWidth = 1.6 * u;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      x.beginPath();
      x.moveTo(sx + Math.cos(a) * 9 * u, cy + Math.sin(a) * 9 * u);
      x.lineTo(sx + Math.cos(a) * 13 * u, cy + Math.sin(a) * 13 * u);
      x.stroke();
    }
    // the compass at the bottom: an arc that turns with the heading
    const rr = R.h * 0.16,
      by = R.y + R.h,
      hd = D.hdg == null ? 0 : D.hdg;
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(12,14,16,.88)';
    x.beginPath();
    x.arc(cx, by, rr, Math.PI, 2 * Math.PI);
    x.closePath();
    x.fill();
    x.strokeStyle = '#d9dde2';
    x.fillStyle = '#d9dde2';
    x.lineWidth = 1.4 * u;
    x.font = '600 ' + 13 * u + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let b = 0; b < 360; b += 15) {
      const a = ((b - hd + 540) % 360) - 180;
      if (Math.abs(a) > 80) continue;
      const t = (a * Math.PI) / 180,
        dx = Math.sin(t),
        dy = -Math.cos(t),
        L = b % 45 ? 5 : 9;
      x.beginPath();
      x.moveTo(cx + dx * (rr - 2 * u), by + dy * (rr - 2 * u));
      x.lineTo(cx + dx * (rr - L * u), by + dy * (rr - L * u));
      x.stroke();
      const nm = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[b];
      if (nm) x.fillText(nm, cx + dx * (rr - 22 * u), by + dy * (rr - 22 * u));
    }
    x.fillStyle = '#ff4136';
    x.font = '800 ' + 22 * u + 'px ' + FONT;
    x.fillText('OFF', cx, by - rr * 0.32);
    x.fillStyle = '#58d68d';
    x.font = '700 ' + 20 * u + 'px ' + FONT;
    x.fillText(brg3(hd).replace('°', ''), cx, by - rr - 16 * u);
    x.fillStyle = '#3b82f6';
    x.beginPath();
    x.arc(cx, by - rr + 4 * u, 4 * u, 0, 7);
    x.fill();
    // the wind on the left, the vertical speed on the right
    x.shadowBlur = 3 * u;
    x.fillStyle = '#ffffff';
    x.font = '600 ' + 17 * u + 'px ' + FONT;
    x.textAlign = 'right';
    const ws = D.wind ? (D.wind.spd * 0.5144).toFixed(1).padStart(4, '0') : '--.-',
      wd = D.wind ? ' ' + brg3(D.wind.hdg) : '';
    x.fillText('WS ' + ws + wd, cx - rr - 18 * u, by - 18 * u);
    x.textAlign = 'left';
    x.fillStyle = '#ff4136';
    x.fillText('OFF', cx + rr + 18 * u, by - 18 * u);
    x.fillStyle = '#ffffff';
    x.fillText('0.0  VS', cx + rr + 70 * u, by - 18 * u);
    x.restore();
  }
  // the symbols drawn by hand
  function drawSym(a, i) {
    // the notes: handwritten as typed, else in capitals (the choice of the Filter card)
    if (a.t && /^(callout|text|circle|box)$/.test(a.k))
      a = { ...a, pen: PF.pen, t: PF.pen ? String(a.t) : String(a.t).toUpperCase() };
    const [p1x, p1y] = toP(a.u, a.v),
      p2 = a.u2 !== undefined ? toP(a.u2, a.v2) : null,
      c = a.col || '#fff',
      k = szK(a.sz), // the size of the symbol: its lines, heads and texts (not its place)
      lo = { pen: a.pen, col: a.pen ? c : undefined, k };
    x.save();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const line = (a1, b1, a2, b2, w) => {
      x.strokeStyle = c;
      x.lineWidth = (w || 2.5) * k;
      x.beginPath();
      x.moveTo(a1, b1);
      x.lineTo(a2, b2);
      x.stroke();
    };
    if (a.k == 'callout') {
      const [lx, ly] = toP(a.lu, a.lv);
      x.strokeStyle = PF.lsty == 'red' ? '#d01818' : c;
      x.lineWidth = 2.4 * k;
      x.beginPath();
      x.moveTo(p1x, p1y);
      x.lineTo(lx, ly);
      x.stroke();
      tag(a.t, lx, ly, { ...lo, al: lx < p1x ? 'r' : 'l' });
    } else if (a.k == 'dmpi') {
      tri(p1x, p1y, k);
      tag(a.t, p1x + 16 * k, p1y - 16 * k, { k });
    } else if (a.k == 'num') {
      x.fillStyle = '#111';
      x.strokeStyle = '#fff';
      x.lineWidth = 2 * k;
      x.beginPath();
      x.arc(p1x, p1y, 14 * k, 0, 7);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.font = 'bold ' + 16 * k + 'px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(a.t, p1x, p1y + 1);
    } else if (a.k == 'box' && p2) {
      x.strokeStyle = c;
      x.lineWidth = 3 * k;
      x.strokeRect(Math.min(p1x, p2[0]), Math.min(p1y, p2[1]), Math.abs(p2[0] - p1x), Math.abs(p2[1] - p1y));
      if (a.t) tag(a.t, Math.min(p1x, p2[0]), Math.min(p1y, p2[1]) - 14 * k, lo);
    } else if (a.k == 'circle' && p2) {
      x.strokeStyle = c;
      x.lineWidth = 3 * k;
      x.beginPath();
      x.ellipse((p1x + p2[0]) / 2, (p1y + p2[1]) / 2, Math.abs(p2[0] - p1x) / 2, Math.abs(p2[1] - p1y) / 2, 0, 0, 7);
      x.stroke();
      if (a.t) tag(a.t, (p1x + p2[0]) / 2, Math.max(p1y, p2[1]) + 16 * k, { ...lo, al: 'c' });
    } else if (a.k == 'area' && p2) {
      const cx = (p1x + p2[0]) / 2,
        cy = (p1y + p2[1]) / 2,
        rx = Math.abs(p2[0] - p1x) / 2,
        ry = Math.abs(p2[1] - p1y) / 2;
      x.strokeStyle = c;
      x.lineWidth = 3.5 * k;
      x.beginPath();
      x.moveTo(cx, cy - ry);
      x.lineTo(cx + rx, cy);
      x.lineTo(cx, cy + ry);
      x.lineTo(cx - rx, cy);
      x.closePath();
      x.stroke();
    } else if (a.k == 'arrow' && p2) {
      line(p1x, p1y, p2[0], p2[1], 3);
      head(p1x, p1y, p2[0], p2[1], 16 * k, c);
      if (a.t) tag(a.t, p1x, p1y, { ...lo, al: 'r' });
    } else if (a.k == 'axis' && p2) {
      x.setLineDash([14, 8]);
      line(p1x, p1y, p2[0], p2[1], 3.5);
      x.setLineDash([]);
      head(p1x, p1y, p2[0], p2[1], 20 * k, c);
      const hd = (Math.atan2(p2[0] - p1x, -(p2[1] - p1y)) * 180) / Math.PI - nUp(); // a heading on the ground
      tag('RUN-IN ' + brgM(hd) + (a.t ? ' · ' + a.t : ''), (p1x + p2[0]) / 2, (p1y + p2[1]) / 2 - 20 * k, {
        col: c,
        al: 'c',
        k,
      });
    } else if (a.k == 'north') {
      const r = (((a.rot || 0) + nUp()) * Math.PI) / 180; // turned by hand from the true north of the picture
      x.translate(p1x, p1y);
      x.scale(k, k);
      x.rotate(r);
      x.fillStyle = c;
      x.strokeStyle = c;
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(0, 28);
      x.lineTo(0, -14);
      x.stroke();
      x.beginPath();
      x.moveTo(0, -30);
      x.lineTo(11, -10);
      x.lineTo(-11, -10);
      x.closePath();
      x.fill();
      x.beginPath();
      x.moveTo(-10, 14);
      x.lineTo(10, 6);
      x.stroke();
      x.rotate(-r);
      x.font = 'bold 18px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('N', Math.sin(r) * 44, -Math.cos(r) * 44);
    } else if (a.k == 'scale' && p2) {
      line(p1x, p1y, p2[0], p2[1], 3.5);
      [[p1x, p1y], p2].forEach(([qx, qy]) => line(qx, qy - 8 * k, qx, qy + 8 * k, 3.5));
      x.font = 'bold ' + 14 * k + 'px ' + FONT;
      x.fillStyle = c;
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.fillText(a.t || '', (p1x + p2[0]) / 2, (p1y + p2[1]) / 2 - 12 * k);
      x.fillText('0', p1x, p1y - 12 * k);
    } else if (a.k == 'text') {
      x.font = a.pen ? 25 * k + 'px ' + PEN : 'bold ' + 17 * k + 'px ' + FONT;
      x.fillStyle = c;
      x.textAlign = 'left';
      x.textBaseline = 'middle';
      if (!a.pen) {
        x.strokeStyle = 'rgba(0,0,0,.7)';
        x.lineWidth = 3 * k;
        x.strokeText(a.t, p1x, p1y);
      }
      x.fillText(a.t, p1x, p1y);
    }
    if (i === selA) {
      x.setLineDash([4, 3]);
      x.strokeStyle = '#4cc38a';
      x.lineWidth = 1.5;
      const bx = bbox(a);
      x.strokeRect(bx[0] - 6, bx[1] - 6, bx[2] - bx[0] + 12, bx[3] - bx[1] + 12);
      x.setLineDash([]);
    }
    x.restore();
  }
  function bbox(a) {
    const k = szK(a.sz),
      p = toP(a.u, a.v),
      q = a.u2 !== undefined ? toP(a.u2, a.v2) : a.lu !== undefined ? toP(a.lu, a.lv) : [p[0] + 30 * k, p[1] + 20 * k];
    return [
      Math.min(p[0], q[0]) - 14 * k,
      Math.min(p[1], q[1]) - 16 * k,
      Math.max(p[0], q[0]) + (a.k == 'callout' || a.k == 'dmpi' || a.k == 'text' ? 120 : 14) * k,
      Math.max(p[1], q[1]) + 14 * k,
    ];
  }
  // the picture with its symbols in IMG
  // the picture of the target: as the filters make it, in both looks of the cards (never turned by the dark look)
  function picture() {
    const r = /** @type {any} */ (x).__raw;
    /** @type {any} */ (x).__raw = true;
    try {
      picture0();
    } finally {
      /** @type {any} */ (x).__raw = r;
    }
  }
  function picture0() {
    const p = pic(),
      s = st();
    x.fillStyle = '#000';
    x.fillRect(IMG.x, IMG.y, IMG.w, IMG.h);
    x.save();
    x.beginPath();
    x.rect(IMG.x, IMG.y, IMG.w, IMG.h);
    x.clip();
    if (p) {
      const r = prect();
      x.drawImage(p.c, r.x, r.y, r.w, r.h);
      if (HUDS.includes(PF.filt)) ({ uav: hudUav, suav: hudSuav, tgp: hudTgp })[PF.filt]();
      if (s && s.view == 'map' && PF.bld && p.geo) mapBuildings();
      if (s && s.auto)
        try {
          autoLayer();
        } finally {
          DEFER = SYMS = null;
        }
      A().forEach((a, i) => drawSym(a, i));
      if (drag && drag.k) drawSym(drag, -1);
    } else {
      x.fillStyle = '#8b98a8';
      x.font = '15px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(emptyText(), IMG.x + IMG.w / 2, IMG.y + IMG.h / 2);
    }
    x.restore();
  }
  function emptyText() {
    const s = st(),
      t = tgt();
    if (!t) return 'No target: add one with "Add target", or put a target in the DTC.';
    if (s.view == 'shot') return 'Paste a screenshot (Ctrl+V), drop it on the left or choose a file.';
    if (s.view == 'map') return 'Press "Frame on the map" and capture the target.';
    const f = FEAT[t.key];
    if (t.objId == null) return 'This point is on no objective: use the Map or a screenshot.';
    if (!f || f.loading) return 'Reading the objective files…';
    return 'The objective files cannot be read (Settings > Folders: the BMS folder). Use the Map or a screenshot.';
  }

  // ---- the page frame: header and footer
  function hdr(title) {
    const p = P(),
      t = tgt(),
      s = st(),
      i = deps.info ? deps.info() : {},
      f = t && FEAT[t.key];
    x.fillStyle = p.page;
    x.fillRect(0, 0, PW, PH);
    x.fillStyle = p.panel;
    x.fillRect(1, 1, PW - 2, 114);
    x.strokeStyle = p.line;
    x.lineWidth = PF.pst == 'prog' ? 1 : 2;
    x.strokeRect(1, 1, PW - 2, 114);
    x.beginPath();
    x.moveTo(800, 1);
    x.lineTo(800, 115);
    x.stroke();
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = p.ac;
    x.font = '700 12px ' + FONT;
    x.fillText(title, 16, 24);
    x.fillStyle = p.tx;
    x.font = '700 21px ' + FONT;
    x.fillText(fit((s && s.fac) || '', 770), 16, 50);
    x.font = '13px ' + FONT;
    if (t && !t.pic) {
      const elv = t.dmpis.find(d => d.altFt) ? t.dmpis.find(d => d.altFt).altFt + ' FT MSL' : '—',
        F = [
          [
            ['TGT ID', t.objId != null ? 'OBJ ' + t.objId : t.label],
            ['FUNCTION', t.type >= 0 && OBJ_TYPES[t.type] ? String(OBJ_TYPES[t.type]).toUpperCase() : '—'],
            ['STPT', t.refs.join(', ') || '—'],
          ],
          [
            ['COORDS', deps.geoLL ? deps.geoLL(t.x, t.y) : ''],
            ['ELEV', elv],
            ['STATUS', f && f.pct != null ? f.pct + '% OPERATIONAL' : '—'],
          ],
        ];
      F.forEach((row, k) => {
        let xx = 16;
        row.forEach(([l, v]) => {
          x.fillStyle = p.mu;
          x.fillText(l, xx, 78 + k * 20);
          xx += x.measureText(l).width + 6;
          x.fillStyle = p.tx;
          v = fit(String(v), 330);
          x.fillText(v, xx, 78 + k * 20);
          xx += x.measureText(v).width + 22;
        });
      });
    }
    x.textAlign = 'center';
    x.fillStyle = p.ac;
    x.font = '700 15px ' + FONT;
    x.fillText('BMS CARDS', 950, 32);
    x.fillStyle = p.mu;
    x.font = '12px ' + FONT;
    x.fillText(fit(i.cs || '', 280), 950, 54);
    x.fillText(
      'SOURCE: ' + (!s ? '—' : s.view == 'shot' ? 'SCREENSHOT' : s.view == 'map' ? 'MAP PAGE' : 'BMS OBJECTIVE FILES'),
      950,
      74
    );
    x.fillText(fit((t && t.flight && i.tot) || i.mis || '', 280), 950, 94);
    x.fillStyle = p.band;
    x.fillRect(0, PH - 34, PW, 34);
    if (PF.pst == 'prog') {
      x.strokeStyle = p.line;
      x.lineWidth = 1;
      x.strokeRect(0.5, PH - 34, PW - 1, 33);
    }
    x.fillStyle = p.btx;
    x.font = '600 12px ' + FONT;
    x.fillText(CLS + '   ·   DATUM WGS-84', PW / 2, PH - 13);
  }
  const fit = (s, w) => {
    if (x.measureText(s).width <= w) return s;
    while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  };
  // the aim points of the boxes and of the text page: the DTC ones (with Fill), then the ones put by hand
  function dmpiList() {
    const t = tgt(),
      s = st();
    if (!t || !s) return [];
    const R = s.auto ? attackRoute(t) : null,
      inf = deps.info ? deps.info() : {},
      D =
        s.auto && PF.show.dmpi
          ? t.dmpis.map((d, i) => ({
              t: 'DMPI ' + (i + 1),
              ref: d.ref,
              d: d.name || 'Aim point',
              ll: deps.geoLL ? deps.geoLL(d.x, d.y) : '',
              elv: d.altFt ? d.altFt + ' FT MSL' : '—',
              w: (R && R.wpn) || inf.wpn || '—',
              fz: (R && R.fz) || '—',
              x: d.x,
              y: d.y,
              kind: d.kind,
              src: d,
            }))
          : [],
      g = geo();
    return D.concat(
      A()
        .filter(a => a.k == 'dmpi')
        .map(a => {
          let ll = 'COORDS: —',
            gx = null,
            gy = null;
          if (g) {
            [gx, gy] = fromUV(g, a.u, a.v);
            ll = deps.geoLL ? deps.geoLL(gx, gy) : '';
          }
          return {
            t: a.t,
            ref: '',
            d: a.d || 'Aim point',
            ll,
            elv: '—',
            w: '—',
            fz: '—',
            x: gx,
            y: gy,
            u: a.u,
            v: a.v,
          };
        })
    );
  }
  function boxes(by, o = {}) {
    const p = P(),
      D = dmpiList(),
      cols = o.cols || 6,
      bw = (o.w || PW - 20) / cols;
    for (let i = 0; i < 6; i++) {
      const bx = (o.x0 == null ? 10 : o.x0) + (i % cols) * bw,
        yy = by + Math.floor(i / cols) * 164;
      x.fillStyle = p.panel;
      x.fillRect(bx, yy, bw - 6, 156);
      x.strokeStyle = p.line;
      x.lineWidth = PF.pst == 'prog' ? 1 : 1.2;
      x.strokeRect(bx, yy, bw - 6, 156);
      const a = D[i];
      x.textAlign = 'left';
      x.textBaseline = 'alphabetic';
      if (!a) {
        if (!i) {
          x.fillStyle = p.mu;
          x.font = '12px ' + FONT;
          ['DMPI: fill from the', 'datacard, or use the', 'DMPI tool.'].forEach((q, k) =>
            x.fillText(q, bx + 8, yy + 22 + k * 18)
          );
        }
        continue;
      }
      x.fillStyle = PF.pst == 'prog' ? '#ff5d5d' : '#000';
      x.font = '700 13px ' + FONT;
      x.fillText(a.t, bx + 8, yy + 20);
      if (a.ref) {
        x.textAlign = 'right';
        x.fillStyle = PF.pst == 'prog' ? refCol(a.kind, true) || COL.ing : '#000';
        x.font = '700 11.5px ' + FONT;
        x.fillText(a.ref, bx + bw - 14, yy + 20);
        x.textAlign = 'left';
      }
      x.fillStyle = p.tx;
      x.font = '11.5px ' + FONT;
      [a.d.toUpperCase(), a.ll, 'ELEV: ' + a.elv, 'WPN: ' + a.w, 'FUZE: ' + a.fz].forEach((q, k) =>
        x.fillText(fit(q, bw - 22), bx + 8, yy + 44 + k * 21)
      );
      if (SCR) {
        // on screen only: the × that takes this aim point away
        const [cx, cy] = boxX(i, yy);
        x.fillStyle = 'rgba(255,93,93,.14)';
        x.beginPath();
        x.arc(cx, cy, 9, 0, 7);
        x.fill();
        x.strokeStyle = '#ff5d5d';
        x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(cx - 3.5, cy - 3.5);
        x.lineTo(cx + 3.5, cy + 3.5);
        x.moveTo(cx + 3.5, cy - 3.5);
        x.lineTo(cx - 3.5, cy + 3.5);
        x.stroke();
      }
    }
  }
  const boxX = (i, by = 652) => [10 + i * ((PW - 20) / 6) + (PW - 20) / 6 - 6 - 14, by + 156 - 14];
  function graphic() {
    const p = P();
    const pic = !!(tgt() && tgt().pic);
    hdr(pic ? 'PICTURE' : 'BASIC TARGET GRAPHIC');
    picture();
    x.strokeStyle = p.line;
    x.lineWidth = PF.pst == 'prog' ? 1 : 2;
    x.strokeRect(IMG.x, IMG.y, IMG.w, IMG.h);
    if (!pic) boxes(652);
  }
  // the text page: description, components, DMPI, threats, attack, remarks; the detail pictures on the right
  // o: where the text goes and how big (the page, or a Kneeboard card), and where the detail pictures go (null: none)
  function textPage(o = {}) {
    const p = P(),
      t = tgt(),
      s = st(),
      X0 = o.x0 || 22,
      TW = o.w || 514,
      FS = o.font || 13,
      LH = o.lh || 18,
      MAXY = o.maxY || PH - 50,
      NC = o.comps || 6,
      DET = o.det === undefined ? { x: 560, y: 128, w: 528, h: 330, gap: 20 } : o.det;
    if (!o.noHdr) hdr('TARGET INFORMATION');
    if (!t || !s) return;
    const f = FEAT[t.key],
      D = s.auto ? dc() : null,
      DM = dmpiList(),
      N = A().filter(a => a.k == 'callout');
    let y = o.y0 || 152;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    const H = q => {
        if (PF.pst == 'prog') {
          x.fillStyle = p.ac;
          x.font = '700 ' + (FS - 1) + 'px ' + FONT;
          x.fillText(q, X0, y);
          x.strokeStyle = p.line;
          x.lineWidth = 1;
          x.beginPath();
          x.moveTo(X0, y + 6);
          x.lineTo(X0 + TW, y + 6);
          x.stroke();
        } else {
          x.fillStyle = p.band;
          x.fillRect(X0 - 6, y - FS - 2, TW + 6, FS + 7);
          x.fillStyle = p.btx;
          x.font = 'bold ' + (FS - 0.5) + 'px ' + FONT;
          x.fillText(q, X0, y);
        }
        y += LH + 6;
      },
      L = (q, c) => {
        if (y > MAXY) return;
        x.fillStyle = c || p.tx;
        x.font = FS + 'px ' + FONT;
        x.fillText(fit(q, TW - 4), X0 + 2, y);
        y += LH;
      },
      M = () => L('Not filled: press "Fill from the datacard".', p.mu);
    H('1. TARGET DESCRIPTION');
    L(
      t.name.toUpperCase() +
        (t.objId != null ? ' (OBJ ' + t.objId + ')' : '') +
        (t.type >= 0 && OBJ_TYPES[t.type] ? ' · ' + OBJ_TYPES[t.type] : '')
    );
    L((deps.geoLL ? deps.geoLL(t.x, t.y) : '') + (t.refs.length ? ' · ' + t.refs.join(', ') : ''));
    L(
      f && f.feats
        ? `Status: ${f.pct != null ? f.pct + '% operational · ' : ''}${f.feats.length} components`
        : 'Status: not known'
    );
    y += LH / 3;
    const marked = N.map(a => a.t).filter(Boolean);
    if (o.pic) {
      // the card: the graphic in small (the DMPIs, the attack, the threats) in place of the list of the components
      if (marked.length) L('Marked on the picture: ' + marked.join(', '));
      y += LH / 3;
      H('2. GRAPHIC');
      const I0 = IMG,
        C0 = CARDM;
      IMG = { x: X0 - 6, y: y - LH + 2, w: TW + 6, h: o.pic };
      CARDM = true;
      try {
        picture();
        x.strokeStyle = p.line;
        x.lineWidth = PF.pst == 'prog' ? 1 : 2;
        x.strokeRect(IMG.x, IMG.y, IMG.w, IMG.h);
      } finally {
        IMG = I0;
        CARDM = C0;
      }
      y += o.pic + LH / 2;
    } else {
      H('2. COMPONENTS');
      const comp =
        f && f.feats
          ? f.feats.map((q, i) => `${i + 1}. ${q.name}${q.st == 2 ? ' (destroyed)' : q.st == 1 ? ' (damaged)' : ''}`)
          : [];
      const nc = marked.length ? NC - 1 : NC;
      comp.slice(0, nc).forEach(q => L(q));
      if (comp.length > nc) L('… ' + (comp.length - nc) + ' more', p.mu);
      if (!comp.length) L('—', p.mu);
      if (marked.length) L('Marked on the picture: ' + marked.join(', '));
      y += LH / 3;
    }
    H('3. DMPI');
    if (DM.length)
      DM.slice(0, o.dmpis || 4).forEach(a =>
        L(`${a.t}${a.ref ? ' (' + a.ref + ')' : ''}: ${a.d} · ${a.w} · fuze ${a.fz}`)
      );
    else M();
    y += LH / 3;
    H('4. THREATS');
    if (D) {
      D.sams.forEach(q =>
        L(
          `${q.name}: ${q.nm.toFixed(1)} NM ${brgM(q.brg)} · WEZ ${q.rNm.toFixed(0)} NM${q.inside ? ' · the target is inside' : ''}`,
          PF.pst == 'prog' ? COL.sam : '#a35a00'
        )
      );
      D.units.forEach(q =>
        L(`${q.name}: ${q.nm.toFixed(1)} NM ${brgM(q.brg)}`, PF.pst == 'prog' ? COL.unit : '#b00000')
      );
      if (!D.sams.length && !D.units.length) L('No known enemy SAM or unit near the target.', p.mu);
    } else M();
    y += LH / 3;
    H('5. ATTACK');
    if (D && D.route) {
      const R = D.route;
      if (R.src == 'attack') {
        L(
          `${R.mode || 'Attack'} · run-in ${R.hdg != null ? brgM(R.hdg) : '—'}${R.spd ? ' · ' + Math.round(R.spd) + ' KT' : ''}${R.rel ? ' · release ' + Math.round(R.rel).toLocaleString('en-US') + ' ft' : ''}`
        );
        L(`Egress ${R.ehdg != null ? brgM(R.ehdg) : '—'}${R.wpn ? ' · ' + R.wpn : ''}`);
      } else {
        L(
          `Flight plan: STPT ${R.stpt}${R.ipName ? ' from ' + R.ipName : ''}${R.hdg != null ? ' · in ' + brgM(R.hdg) : ''}`
        );
        L(`Out${R.epName ? ' to ' + R.epName : ''}${R.ehdg != null ? ' · ' + brgM(R.ehdg) : ''}`);
      }
      const i = deps.info ? deps.info() : {};
      if (t.flight && i.tot) L('TOT ' + i.tot);
    } else if (D) L('No attack: plan it on the Pop-up, HADB or TOSS tab.', p.mu);
    else M();
    y += LH / 3;
    H('6. REMARKS');
    if (PF.pen && s.rem) {
      // handwritten remarks, in the ink of the page
      const f0 = FS + 3;
      s.rem.split('\n').forEach(q => {
        if (y > MAXY) return;
        x.fillStyle = PF.pst == 'prog' ? p.tx : '#1b2f7a';
        x.font = f0 + 'px ' + PEN;
        x.fillText(fit(q, TW - 4), X0 + 2, y + 2);
        y += LH + 6;
      });
    } else (s.rem || '—').split('\n').forEach(q => L(q));
    if (DET) details(DET, DM);
  }
  // the detail pictures: around the aim points, on the plan of the objective (or on the screenshot); two, one under the other
  function details(o, DM) {
    const p = P(),
      t = tgt(),
      s = st();
    if (!t || !s) return;
    const f = FEAT[t.key],
      shot = s.view == 'shot' && s.shot,
      fp = f && f.plan,
      src = shot ? pic() : fp ? { c: planFiltered(), geo: fp.geo } : pic(),
      pts = [];
    if (src) {
      if (src.geo)
        DM.filter(a => a.x != null).forEach(a => {
          const [u, v] = toUV(src.geo, a.x, a.y);
          if (u > -0.1 && u < 1.1 && v > -0.1 && v < 1.1) pts.push({ u, v, t: a.t });
        });
      else DM.filter(a => a.u != null).forEach(a => pts.push({ u: a.u, v: a.v, t: a.t }));
      if (!pts.length || (s.det && s.det.includes('TARGET'))) {
        const q = src.geo ? toUV(src.geo, t.x, t.y) : [0.5, 0.5];
        pts.push({ u: q[0], v: q[1], t: 'TARGET' });
      }
    }
    // the two pictures: the aim points chosen above the page (Details), else the first two
    const pick = s.det ? s.det.map(n => pts.find(a => a.t == n)).filter(Boolean) : [];
    (pick.length ? pick.concat(pts.filter(a => !pick.includes(a) && !s.det.includes(a.t))) : pts)
      .slice(0, 2)
      .forEach((a, i) => {
        const bx = o.x,
          by = o.y + i * (o.h + o.gap),
          bw = o.w,
          bh = o.h,
          sw = src.c.width / 5,
          sh = (sw * bh) / bw;
        const r = /** @type {any} */ (x).__raw;
        /** @type {any} */ (x).__raw = true; // the picture as it is
        x.fillStyle = '#000';
        x.fillRect(bx, by, bw, bh);
        x.drawImage(src.c, a.u * src.c.width - sw / 2, a.v * src.c.height - sh / 2, sw, sh, bx, by, bw, bh);
        /** @type {any} */ (x).__raw = r;
        x.strokeStyle = p.line;
        x.lineWidth = PF.pst == 'prog' ? 1 : 2;
        x.strokeRect(bx, by, bw, bh);
        tri(bx + bw / 2, by + bh / 2);
        tag('DETAIL · ' + a.t, bx + 8, by + 20, {});
      });
  }
  function planFiltered() {
    const t = tgt(),
      f = t && FEAT[t.key];
    if (!f || !f.plan) return null;
    const key = sel + '|plan|' + PF.filt + '|' + PF.con + '|' + PF.grn;
    if (!FC.has(key)) FC.set(key, filterPic(f.plan.c, PF.filt, PF.con, PF.grn, stamp()));
    return FC.get(key);
  }

  // ---- the page on screen: drawn at twice its size (sharp), in page pixels
  let cv = null;
  // under Style: the look of the cards (the ☀ / ☾ of the Kneeboard); the cards are in the Paper (BTG) layout whatever the Style
  function styleHint() {
    const h = root && root.querySelector('.tgsth');
    if (!h) return;
    const dk = cardDark();
    h.textContent = dk ? '☾ Dark cards selected' : '☀ Light cards selected';
    h.title =
      'The Kneeboard cards of the target are made in the Paper (BTG) layout, ' +
      (dk ? 'dark' : 'light') +
      ' as chosen on the Kneeboard page (each card keeps the other look too). The Style is for the page on screen, Save PNG and the datacard.';
    h.classList.toggle('dk', dk);
  }
  function draw() {
    styleHint();
    if (!cv) return;
    q('.tgdc').disabled = !!CROP || !rawPic(); // Put on datacard: a picture first
    x = cv.getContext('2d');
    x.setTransform(2, 0, 0, 2, 0, 0);
    IMG = { x: 10, y: 122, w: 1080, h: 520 };
    CARDM = false;
    SCR = true;
    if (page == 'g') graphic();
    else textPage();
    if (CROP && page == 'g') cropMarks();
    SCR = false;
    const n = root.querySelector('.tginfo'),
      t = tgt();
    if (n) n.textContent = t ? t.label + ' · ' + t.name + ' · ' + A().length + ' symbols' : '';
    const dl = root.querySelector('.tgdel');
    if (dl) dl.disabled = !(page == 'g' && selA >= 0 && selA < A().length);
    detBar();
    // the tool bar draws on the graphic only
    const tb = root.querySelector('.tgtb');
    if (tb && tb.hidden != (page != 'g')) {
      tb.hidden = page != 'g';
      root.querySelector('.tgthint').hidden = page != 'g';
      if (page == 'g') appear(tb);
    }
  }
  // the choice of the aim points of the detail pictures (on the plan or the map: a screenshot keeps the DMPIs put by hand, in their order)
  function detBar() {
    const b = root.querySelector('.tgdetb'),
      s = st();
    if (!b) return;
    const on = page == 't' && !!s && s.view != 'shot' && !!pic();
    if (b.hidden == on) {
      b.hidden = !on;
      if (on) appear(b);
    }
    if (!on) return;
    const g = pic() && pic().geo,
      N = dmpiList()
        .filter(a => (g ? a.x != null : a.u != null))
        .map(a => a.t)
        .concat('TARGET'),
      cur = [0, 1].map(i => (s.det && N.includes(s.det[i]) ? s.det[i] : N[Math.min(i, N.length - 1)]));
    b.querySelectorAll('select').forEach((e, i) => {
      const h = N.map(n => `<option value="${esc(n)}"${n == cur[i] ? ' selected' : ''}>${esc(n)}</option>`).join('');
      if (e.dataset.h != h) {
        e.innerHTML = h;
        e.dataset.h = h;
      }
      e.value = cur[i];
    });
  }
  // the crop frame of Put on datacard: the part that goes to the datacard, the rest darker
  function cropMarks() {
    const r = prect(),
      fx = r.x + CROP.u * r.w,
      fy = r.y + CROP.v * r.h,
      fw = CROP.w * r.w,
      fh = CROP.h * r.h;
    x.save();
    x.beginPath();
    x.rect(r.x, r.y, r.w, r.h);
    x.rect(fx, fy, fw, fh);
    x.fillStyle = 'rgba(0,0,0,.6)';
    x.fill('evenodd');
    x.setLineDash([8, 5]);
    x.strokeStyle = '#4cc38a';
    x.lineWidth = 2;
    x.strokeRect(fx, fy, fw, fh);
    x.setLineDash([]);
    x.restore();
    tag(CROP.name.toUpperCase() + ' · ' + CROP.dim, fx + 6, fy + 18, { col: '#4cc38a', ls: 'prog' });
  }
  // another canvas, drawn in page pixels at scale k
  function into(w, h, k, fn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x0 = x,
      I0 = IMG,
      C0 = CARDM,
      R0 = CROPR,
      S0 = SCR,
      s0 = selA;
    SCR = false;
    x = c.getContext('2d');
    x.setTransform(k, 0, 0, k, 0, 0);
    selA = -1;
    try {
      fn();
    } finally {
      x = x0;
      IMG = I0;
      CARDM = C0;
      CROPR = R0;
      SCR = S0;
      selA = s0;
      CARDDK = false;
    }
    return c;
  }
  // a Kneeboard card (1600 x 2400, 2:3), laid out for its shape with everything at one scale (760 x 1140 page pixels):
  // g the graphic (header, picture, the six DMPI boxes in two rows), t the target information, d the two detail pictures
  const CW = 760,
    CH = 1140;
  function cardHdr(title) {
    const p = P(),
      t = tgt(),
      s = st(),
      i = deps.info ? deps.info() : {},
      f = t && FEAT[t.key];
    x.fillStyle = p.page;
    x.fillRect(0, 0, CW, CH);
    x.fillStyle = p.panel;
    x.fillRect(1, 1, CW - 2, 150);
    x.strokeStyle = p.line;
    x.lineWidth = PF.pst == 'prog' ? 1 : 2;
    x.strokeRect(1, 1, CW - 2, 150);
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.fillStyle = p.ac;
    x.font = '700 12px ' + FONT;
    x.fillText(title, 16, 24);
    x.textAlign = 'right';
    x.font = '700 13px ' + FONT;
    x.fillText('BMS CARDS', CW - 16, 24);
    x.textAlign = 'left';
    x.fillStyle = p.tx;
    x.font = '700 21px ' + FONT;
    x.fillText(fit((s && s.fac) || '', CW - 32), 16, 52);
    if (!t) return;
    const elv = t.dmpis.find(d => d.altFt),
      rows = t.pic
        ? [
            [
              ['SOURCE', !s ? '—' : s.view == 'map' ? 'MAP' : 'SCREENSHOT'],
              ['', i.cs || ''],
            ],
          ]
        : [
            [
              ['TGT ID', t.objId != null ? 'OBJ ' + t.objId : t.label],
              ['FUNCTION', t.type >= 0 && OBJ_TYPES[t.type] ? String(OBJ_TYPES[t.type]).toUpperCase() : '—'],
              ['STATUS', f && f.pct != null ? f.pct + '%' : '—'],
            ],
            [
              ['COORDS', deps.geoLL ? deps.geoLL(t.x, t.y) : ''],
              ['ELEV', elv ? elv.altFt + ' FT MSL' : '—'],
            ],
            [
              ['STPT', t.refs.join(', ') || '—'],
              ['SOURCE', !s ? '—' : s.view == 'shot' ? 'SCREENSHOT' : s.view == 'map' ? 'MAP' : 'OBJECTIVE FILES'],
              ['', i.cs || ''],
            ],
          ];
    x.font = '13px ' + FONT;
    rows.forEach((row, k) => {
      let xx = 16;
      row.forEach(([l, v]) => {
        if (l) {
          x.fillStyle = p.mu;
          x.fillText(l, xx, 82 + k * 22);
          xx += x.measureText(l).width + 6;
        }
        x.fillStyle = l ? p.tx : p.mu;
        v = fit(String(v), CW - 16 - xx);
        x.fillText(v, xx, 82 + k * 22);
        xx += x.measureText(v).width + 20;
      });
    });
  }
  // the cards are always in the Paper (BTG) layout (the Style of the page is for the screen, the PNG and the datacard): light, or dark (bands dark with
  // light text) as the look of the cards
  // the places and objectives within 2 km of the target (not the target itself): the 3 nearest, read before the Smart card is drawn
  let NEAR = { key: '', list: [] };
  async function nearLoad() {
    const t = tgt();
    if (!t || !deps.refs) return;
    if (NEAR.key == t.key) return;
    try {
      const L =
        (await deps.refs({
          e0: (t.x - 2) * FT_KM,
          e1: (t.x + 2) * FT_KM,
          n0: (t.y - 2) * FT_KM,
          n1: (t.y + 2) * FT_KM,
        })) || [];
      NEAR = {
        key: t.key,
        list: L.filter(r => r.k != 'unit' && r.k != 'sam')
          .map(r => ({
            x: r.e / FT_KM,
            y: r.n / FT_KM,
            k: r.k,
            label: r.label,
            km: Math.hypot(r.e / FT_KM - t.x, r.n / FT_KM - t.y),
          }))
          .filter(r => r.km > 0.2 && r.km <= 2)
          .sort((a, b) => a.km - b.km)
          .slice(0, 3),
      };
    } catch (e) {
      NEAR = { key: t.key, list: [] };
    }
  }
  // the Smart card of the target (core/smarttgt.js): the numbers of the target, a sketch of its buildings and DMPIs, the components, the remarks
  function smartData() {
    const t = tgt(),
      s = st(),
      f = t && FEAT[t.key];
    if (!t) return null;
    const i = deps.info ? deps.info() : {},
      R = attackRoute(t),
      D0 = s && s.auto ? dc() : null,
      d0 = t.dmpis[0],
      elv = t.dmpis.find(d => d.altFt),
      ll = String(deps.geoLL ? deps.geoLL(d0 ? d0.x : t.x, d0 ? d0.y : t.y) : '').split(/\s+(?=[EW]\s?\d)/),
      feats = (f && f.feats) || [],
      hdgT = R && R.hdg != null ? R.hdg : null,
      hdg = hdgT != null ? String(Math.round(toMag(hdgT)) % 360 || 360).padStart(3, '0') + '°' : '--',
      dm = t.dmpis.map((d, k) => ({ x: d.x, y: d.y, n: k + 1, short: d.short || '' })),
      names = new Map();
    feats.forEach(q => names.set(q.name, (names.get(q.name) || 0) + 1));
    const comps = [
      ...dm.map(
        d =>
          'DMPI ' +
          d.n +
          (d.short ? '  ' + d.short.toUpperCase() : '') +
          (t.dmpis[d.n - 1].altFt ? '  ELEV ' + t.dmpis[d.n - 1].altFt : '')
      ),
      ...[...names.entries()].slice(0, 6).map(([n, c]) => '   ' + c + ' × ' + String(n).toUpperCase()),
      ...(D0 && PF.show.sam
        ? D0.sams
            .slice(0, 3)
            .map(z => [
              String(z.name).toUpperCase() +
                ' ' +
                z.nm.toFixed(1) +
                ' NM ' +
                String(Math.round(toMag(z.brg)) % 360 || 360).padStart(3, '0') +
                '° · WEZ ' +
                z.rNm.toFixed(0) +
                (z.inside ? ' · TGT INSIDE' : ''),
              z.inside,
            ])
        : []),
      ...(D0 && PF.show.unit
        ? D0.units.slice(0, 2).map(z => String(z.name).toUpperCase() + ' ' + z.nm.toFixed(1) + ' NM')
        : []),
      ...(NEAR.key == t.key
        ? NEAR.list.map(r => {
            const b = Math.round(toMag((Math.atan2(r.x - t.x, r.y - t.y) * 180) / Math.PI + 360)) % 360 || 360;
            return 'NEAR ' + r.label + ' ' + r.km.toFixed(1) + ' KM ' + String(b).padStart(3, '0') + '°';
          })
        : []),
    ];
    return {
      title: 'TARGET' + (t.refs.length ? ' · ' + t.refs[0] : ''),
      right: i.tag || i.cs || '',
      key: [
        ['TARGET', ((s && s.fac) || t.name).toUpperCase().slice(0, 12)],
        ['ELEV', elv ? elv.altFt : '--'],
        ['DMPI', String(t.dmpis.length)],
        ['ATK HDG', hdg],
        ['LAT', (ll[0] || '--').replace(/\s+/g, '')],
        ['LONG', (ll[1] || '--').replace(/\s+/g, '')],
        ['STATUS', f && f.pct != null ? f.pct + ' %' : '--', f && f.pct != null && f.pct < 50],
        ['TOT', i.tot || '--'],
      ],
      cx: t.x,
      cy: t.y,
      feats: feats.map(q => ({ x: q.x, y: q.y, kind: featKind(q.name), st: q.st, name: q.name })),
      dmpis: dm,
      ing: R && R.ing && (!s || !s.auto || PF.show.route) ? R.ing : [],
      egr: R && R.egr && (!s || !s.auto || PF.show.egr) ? R.egr : [],
      // Fill from the datacard on: what the page shows of it (SAMs, units, impacts)
      sams:
        s && s.auto && PF.show.sam && D0
          ? D0.sams.map(z => ({
              x: z.x,
              y: z.y,
              r: z.r,
              name: z.name,
              nm: z.nm,
              brg: z.brg,
              rNm: z.rNm,
              inside: z.inside,
            }))
          : [],
      units:
        s && s.auto && PF.show.unit && D0
          ? D0.units.map(z => ({ x: z.x, y: z.y, name: z.name, nm: z.nm, brg: z.brg }))
          : [],
      imp: s && s.auto && PF.show.imp && R && R.imp ? R.imp : [],
      near: NEAR.key == t.key ? NEAR.list : [],
      hdg: hdgT != null ? hdg : null,
      hdgTrue: hdgT,
      comps,
      notes: [s && s.rem ? s.rem : ''].filter(Boolean),
    };
  }
  function card(kind) {
    if (kind == 's') {
      const c = document.createElement('canvas'),
        D = smartData();
      c.width = 1600;
      c.height = 2400;
      if (D) drawSmartTarget(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D);
      return c;
    }
    const pst0 = PF.pst;
    PF.pst = 'paper';
    try {
      return card0(kind);
    } finally {
      PF.pst = pst0;
    }
  }
  function card0(kind) {
    return into(1600, 2400, 1600 / CW, () => {
      inkCard(x); // the look of the cards (the picture of the target is left as it is)
      CARDDK = cardDark();
      const p = P();
      if (kind == 'g') {
        const pic = !!(tgt() && tgt().pic);
        cardHdr(pic ? 'PICTURE' : 'BASIC TARGET GRAPHIC');
        IMG = { x: 0, y: 160, w: CW, h: pic ? CH - 160 - 44 : 560 }; // a picture fills the card: no DMPI
        CARDM = true;
        picture();
        CARDM = false;
        x.strokeStyle = p.line;
        x.lineWidth = PF.pst == 'prog' ? 1 : 2;
        x.strokeRect(IMG.x, IMG.y, IMG.w, IMG.h);
        if (!pic) boxes(732, { x0: 6, w: CW - 6, cols: 3 });
      } else if (kind == 't') {
        cardHdr('TARGET INFORMATION');
        textPage({
          noHdr: true,
          x0: 22,
          y0: 190,
          w: CW - 44,
          font: 15,
          lh: 23,
          maxY: CH - 60,
          comps: 12,
          dmpis: 6,
          det: null,
          pic: 380,
        });
      } else {
        cardHdr('TARGET INFORMATION · DETAILS');
        details({ x: 8, y: 162, w: CW - 16, h: 452, gap: 14 }, dmpiList());
      }
      x.fillStyle = p.band;
      x.fillRect(0, CH - 34, CW, 34);
      x.fillStyle = p.btx;
      x.font = '600 12px ' + FONT;
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.fillText(CLS, CW / 2, CH - 13);
    });
  }
  // the picture for the datacard (the shape of its free space)
  function dcShot(crop) {
    const d = shotDim(),
      w = d.out,
      h = Math.round((d.out * d.h) / d.w),
      lw = 760,
      k = w / lw;
    return into(w, h, k, () => {
      IMG = { x: 0, y: 0, w: lw, h: h / k };
      CARDM = true;
      CROPR = crop || null;
      picture();
    });
  }
  const shotDim = () => (deps.shotDim && deps.shotDim()) || { w: 564, h: 752, out: 1128, name: 'Datacard' };
  // the biggest frame of the datacard shape on the picture, in the middle (u, v, w, h of the picture)
  function cropStart() {
    const p = pic(),
      d = shotDim(),
      a = d.w / d.h,
      pa = p.c.width / p.c.height;
    let w = 1,
      h = pa / a;
    if (h > 1) {
      h = 1;
      w = a / pa;
    }
    const s = st(),
      o =
        s && s.crop && Math.abs(s.crop.w / s.crop.h - w / h) < 1e-6 ? s.crop : { u: (1 - w) / 2, v: (1 - h) / 2, w, h };
    CROP = { ...o, name: d.name || 'Datacard', dim: d.w + ' × ' + d.h, aspect: w / h };
    page = 'g';
    segSet('page', 'g');
    q('.tgcropbar').hidden = false;
    q('.tgdc').disabled = true;
    appear(q('.tgcropbar'));
    q('.tgcropbar').scrollIntoView({ block: 'nearest', behavior: deps.anim && !deps.anim() ? 'auto' : 'smooth' });
    q('.tgcropn').textContent =
      CROP.name + ' format (' + CROP.dim + '): drag the frame; the wheel or the slider changes its size.';
    q('.tgcrops').max = String(Math.round(w * 100)); // the largest frame that fits
    q('.tgcrops').value = String(Math.round(CROP.w * 100));
    draw();
  }
  function cropEnd(ok) {
    if (!CROP) return;
    const c = { u: CROP.u, v: CROP.v, w: CROP.w, h: CROP.h };
    CROP = null;
    q('.tgcropbar').hidden = true;
    q('.tgdc').disabled = false;
    draw();
    if (!ok) return;
    const s = st();
    if (s) s.crop = c;
    deps.putShot(dcShot(c));
    deps.toast && deps.toast('The target picture is on the datacard, in place of the map screenshot.');
  }
  // a new size of the crop frame (w: part of the width of the picture), kept in the picture and around its middle
  function cropSize(w) {
    if (!CROP) return;
    const a = CROP.aspect;
    let nw = Math.max(0.12, Math.min(w, 1)),
      nh = nw / a;
    if (nh > 1) {
      nh = 1;
      nw = a;
    }
    const cx = CROP.u + CROP.w / 2,
      cy = CROP.v + CROP.h / 2;
    CROP.w = nw;
    CROP.h = nh;
    cropMove(cx - nw / 2, cy - nh / 2);
  }
  function cropMove(u, v) {
    CROP.u = Math.max(0, Math.min(1 - CROP.w, u));
    CROP.v = Math.max(0, Math.min(1 - CROP.h, v));
    draw();
  }

  // ---- the controls
  const seg = (name, opts, cur) =>
    `<span class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-v="${v}">${esc(l)}</button>`).join('')}</span>`;
  // the handwriting of the notes (Homemade Apple, Apache License 2.0, in app/vendor/homemade-apple)
  function penFont() {
    try {
      // (fonts.check says true for a family it does not know: the font is looked for in the set itself)
      if (
        typeof FontFace == 'undefined' ||
        penOk ||
        [...document.fonts].some(z => z.family.replace(/"/g, '') == 'BMS Hand')
      )
        return;
      penOk = true;
      const f = new FontFace('BMS Hand', 'url(./vendor/homemade-apple/homemade-apple-latin-400-normal.woff2)');
      f.load()
        .then(ff => {
          document.fonts.add(ff);
          draw();
        })
        .catch(() => (penOk = false));
    } catch (e) {}
  }
  let penOk = false;
  function build() {
    built = true;
    penFont();
    root.innerHTML = `<div class="tgleft">
  <div class="wcard"><h3>Target <span class="tgh">DTC and flight</span></h3><div class="tglist"></div><div class="tgrow"><button type="button" class="btn g tgadd">＋ Add target…</button><button type="button" class="btn g tgpic" title="A picture with no place: a screenshot or a picture of the map (an aircraft to recognise in an A-A mission, a formation...), its Graphic card without coordinates">＋ Picture</button></div></div>
  <div class="wcard"><h3>Background</h3>${seg('view', VIEWS, 'plan')}
   <div class="tgsec" data-sec="plan"><div class="tgrow"><span class="hint">Zoom</span><span class="seg tgzoom"><button type="button" data-z="-" title="Zoom out">−</button><button type="button" data-z="0" class="tgzk" title="All the objective">all</button><button type="button" data-z="+" title="Zoom in">+</button></span><span class="hint">or the wheel on the picture</span></div>
    <div class="tgrow"><span class="hint">Turn</span><span class="seg tgrot"><button type="button" data-r="-15" title="Turn the plan 15° to the left">↺ 15°</button><button type="button" data-r="0" title="North at the top">N up</button><button type="button" data-r="+15" title="Turn the plan 15° to the right">↻ 15°</button><button type="button" data-r="atk" title="The attack heading at the top">Attack up</button></span><span class="hint tgrotv">North up</span></div><p class="hint">The objective from the BMS files: the right positions, the buildings as symbols.</p></div>
   <div class="tgsec" data-sec="map"><div class="tgrow"><span class="hint">Width</span>${seg(
     'range',
     RANGES.map(r => [r, r + ' NM']),
     PF.range
   )}</div>
    <div class="tgrow"><button type="button" class="btn g gn tgframe">Take picture</button><button type="button" class="btn g tgunframe" hidden>Back to the picture</button></div>
    <p class="hint">The map of the Map page: choose what it shows (LEVELS, Edit points, Map filters above it; the zoom is the Width above), then Take picture: the frame can be zoomed; press Capture. The picture is then drawn on as the others.</p></div>
   <div class="tgsec" data-sec="shot"><label class="tgdrop"><b>Paste a screenshot</b> (Ctrl+V), drop it here or <u>choose a file</u><input type="file" accept="image/*" hidden><br><span class="hint">BMS Recon view, a map screenshot, a picture of the target</span></label>
    <p class="hint">North is up. The scale is not known: the route and the threats show as arrows at the edge.</p></div></div>
  <div class="wcard tgfrom"><h3>From the datacard</h3><button type="button" class="btn tgfill">⤓ Fill from the datacard</button>
   <div class="tgfset" hidden><div class="tgok">✓ <span class="tgsrc"></span></div><div class="tgchips tgshow"></div><div class="tgrow tgnrow"><button type="button" class="btn g tgnames${PF.names ? ' on' : ''}" title="Names of the sub-objectives on the picture">Names</button><span class="tgnsc"${PF.names ? '' : ' hidden'}>${seg(
     'nscope',
     [
       ['dmpi', 'DMPI'],
       ['all', 'All'],
     ],
     PF.nscope
   )}</span></div><button type="button" class="btn g rd tgunfill" title="Take away what was filled from the datacard">Remove</button><p class="hint tgunh">Takes away what came from the DTC, the attack planner and the campaign.</p></div></div>
 </div>
 <div class="tgright">
  <div class="wcard"><h3>Filter</h3>${seg('filt', FILTERS, PF.filt)}
   <label class="tgsl"><span>Contrast</span><input type="range" min="0.8" max="1.8" step="0.05" data-pf="con" value="${PF.con}"></label>
   <label class="tgsl"><span>Grain</span><input type="range" min="0" max="60" step="2" data-pf="grn" value="${PF.grn}"></label>
   <label class="tgpen" title="The notes of the picture (Text, Callout, the names of Box and Circle) and the remarks of the Target information in handwriting, as typed. Only the font changes."><input type="checkbox"${PF.pen ? ' checked' : ''}> Handwritten notes</label>
   <label class="tgsl tgban"${PF.filt == 'uav' ? '' : ' hidden'}><span>Banner</span><input type="text" class="tgbant" maxlength="40"></label></div>
  <div class="wcard"><div class="tgph"><h3>Page</h3><button type="button" class="btn g tgpng" title="The page shown, as a PNG file">Save PNG</button></div><div class="tgrow"><span class="hint">Style</span>${seg(
    'pst',
    [
      ['prog', 'Program'],
      ['paper', 'Paper (BTG)'],
    ],
    PF.pst
  )}</div>
   <p class="hint tgsth"></p>
   <div class="tgrow"><span class="hint">Labels</span>${seg(
     'lsty',
     [
       ['prog', 'Program'],
       ['box', 'Black on white'],
       ['red', 'Red on white'],
     ],
     PF.lsty
   )}</div>
   <div class="tgrow" title="The size of the labels that the program writes: threats, units and names"><span class="hint">Label size</span>${seg(
     'lsz',
     SIZES.map(([v, l]) => [v, l]),
     PF.lsz
   )}</div>
   <label class="tgsl"><span>Facility</span><input type="text" class="tgfac"></label>
   <label class="tgsl tgrem"><span>Remarks</span><textarea class="tgremt" placeholder="Shown on the text page"></textarea></label>
</div>
 </div>
 <div class="tgc wcard"><div class="tgbar tgtopbar">${seg(
   'page',
   [
     ['g', 'Graphic'],
     ['t', 'Target information'],
   ],
   page
 )}<span class="tglev" hidden></span><span class="tgdetb" hidden title="The aim points of the two detail pictures (Target information and its Details card)"><span class="hint">Details</span><select data-det="0" aria-label="Detail 1"></select><select data-det="1" aria-label="Detail 2"></select></span><span class="tgmapb" hidden><button type="button" class="btn g tgpf" title="Map filters: as chosen on the Map page, none, only the flight plan, or the flight plan with the PPT rings. Press to change.">Map filters</button></span><span class="tgsp"></span><span class="hint tginfo"></span><button type="button" class="btn tgdc" title="The picture takes the place of the map screenshot of the datacard">Put on datacard</button></div>
  <div class="tgtb">${TOOLS.map(
    ([k, l]) =>
      `<button type="button" class="t${k == tool ? ' on' : ''}" data-tool="${k}" title="${esc(k == 'select' ? 'Select and move' : k == 'axis' ? 'Attack axis' : l)}">${tico(k)}<span>${esc(l)}</span></button>`
  ).join(
    ''
  )}<i class="vs"></i><span class="tgcols">${COLS.map(c => `<i data-col="${c}" style="background:${c}" class="${c == col ? 'on' : ''}" title="Colour"></i>`).join('')}<i data-col="${PF.ccol}" style="background:${PF.ccol || 'transparent'}" class="tgccol${PF.ccol && PF.ccol == col ? ' on' : ''}" title="Your colour"${PF.ccol ? '' : ' hidden'}></i><label class="tgcpk" title="Choose a different colour. The colour stays as a swatch."><input type="color" value="${PF.ccol || '#ff8c1a'}"></label></span><i class="vs"></i>${seg(
    'sz',
    SIZES.map(([v, l]) => [v, l]),
    sz
  ).replace(
    'class="seg"',
    'class="seg tgszs" title="The size of the symbol: its lines and its text. Select a symbol to change its size."'
  )}<i class="vs"></i><button type="button" class="t tgbld${PF.bld ? ' on' : ''}" title="The buildings of the objective drawn on the picture of the map (where the objective files put them)" hidden>${tico('bld')}<span>Buildings</span></button><button type="button" class="t tgundo" title="Undo">${tico('undo')}<span>Undo</span></button><button type="button" class="t er tgdel" title="Delete the symbol chosen with the select tool" disabled>${tico('del')}<span>Selected</span></button><button type="button" class="t cl tgclr" title="Delete all the symbols and notes drawn on this background">${tico('clr')}<span>Annotations</span></button></div>
  <p class="hint tgthint">${esc(HINT[tool])}</p>
  <div class="tgstage"><canvas width="${PW * 2}" height="${PH * 2}"></canvas><div class="tgmap" hidden></div><div class="tged" hidden><input type="text"><button type="button" class="btn">OK</button></div></div>
  <div class="tgbar tgcropbar" hidden><span class="hint tgcropn"></span><span class="tgsp"></span><label class="tgsl" style="margin:0"><span>Size</span><input type="range" class="tgcrops" min="12" max="100" step="1"></label><button type="button" class="btn g tgcropno">Cancel</button><button type="button" class="btn tgcropok">Put on datacard</button></div></div>`;
    cv = root.querySelector('canvas');
    wire();
  }
  const q = s => root.querySelector(s);
  const qa = s => root.querySelectorAll(s);
  function segSet(name, v) {
    const s = q(`[data-seg="${name}"]`);
    if (s) s.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
  }
  const appear = el => {
    if (!el || (deps.anim && !deps.anim())) return;
    el.classList.remove('tgapp');
    void el.offsetWidth;
    el.classList.add('tgapp');
  };
  function wire() {
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-seg] button');
      if (!b) return;
      const name = b.parentNode.dataset.seg,
        v = b.dataset.v;
      segSet(name, v);
      if (name == 'view') setView(v);
      else if (name == 'range') {
        PF.range = +v;
        pfSave();
        if (framing) live();
      } else if (name == 'filt') {
        PF.filt = v;
        banUI();
        pfSave();
        draw();
      } else if (name == 'lsty') {
        PF.lsty = v;
        pfSave();
        draw();
      } else if (name == 'lsz') {
        PF.lsz = v;
        pfSave();
        draw();
      } else if (name == 'sz') {
        sz = v;
        if (selA >= 0 && A()[selA]) {
          A()[selA].sz = v;
          draw();
        }
      } else if (name == 'pst') {
        PF.pst = v;
        PF.lsty = v == 'paper' ? 'box' : 'prog';
        segSet('lsty', PF.lsty);
        pfSave();
        draw();
      } else if (name == 'page') {
        if (CROP && v != 'g') cropEnd(false);
        page = v;
        draw();
      } else if (name == 'nscope') {
        PF.nscope = v;
        pfSave();
        draw();
      }
    });
    qa('[data-det]').forEach(
      e =>
        (e.onchange = () => {
          const s = st();
          if (!s) return;
          const v = [...qa('[data-det]')].map(z => z.value);
          s.det = v;
          draw();
        })
    );
    qa('[data-pf]').forEach(
      i =>
        (i.oninput = () => {
          PF[i.dataset.pf] = +i.value;
          pfSave();
          draw();
        })
    );
    qa('[data-tool]').forEach(
      b =>
        (b.onclick = () => {
          tool = b.dataset.tool;
          selA = -1;
          pend = null;
          qa('[data-tool]').forEach(z => z.classList.toggle('on', z == b));
          q('.tgthint').textContent = HINT[tool];
          draw();
        })
    );
    // the colour picker: the colour chosen becomes the seventh swatch, chosen at once
    const cpk = /** @type {HTMLInputElement} */ (q('.tgcpk input'));
    cpk.oninput = () => {
      const s = /** @type {HTMLElement} */ (q('.tgccol'));
      PF.ccol = cpk.value;
      s.dataset.col = cpk.value;
      s.style.background = cpk.value;
      s.hidden = false;
      pfSave();
      s.click();
    };
    qa('[data-col]').forEach(
      i =>
        (i.onclick = () => {
          col = i.dataset.col;
          qa('[data-col]').forEach(z => z.classList.toggle('on', z == i));
          if (selA >= 0 && A()[selA]) {
            A()[selA].col = col;
            draw();
          }
        })
    );
    q('.tgadd').onclick = async () => {
      if (!deps.pick) return;
      const p = await deps.pick();
      if (!p) return;
      // a weapon target of the DTC (as Add target on the Map page); when the DTC has no free one, a point of this list only
      const put = deps.addWpn ? await deps.addWpn(p) : 'none';
      if (put != 'ok') {
        PICKS.push({
          ref: 'WPN TGT (this list only)',
          short: 'WPN TGT',
          name: p.name,
          x: p.x,
          y: p.y,
          altFt: p.altFt || 0,
          dmpi: true,
          kind: 'pick',
        });
        deps.toast &&
          deps.toast(
            put == 'full'
              ? 'The DTC has no free weapon target: the target is kept in this list only.'
              : 'No DTC is open: the target is kept in this list only.',
            true
          );
      }
      await loadTargets();
      const t = TL.find(z => z.dmpis.some(d => Math.hypot(d.x - p.x, d.y - p.y) < 0.01));
      if (t) selT(t.key);
    };
    q('.tgpic').onclick = async () => {
      const k = 'pic:' + ++PICN;
      PICS.push({ key: k, label: 'PICTURE', name: 'PICTURE ' + PICN, pic: true, kind: 'pic' });
      await loadTargets();
      selT(k);
    };
    q('.tgnames').onclick = () => {
      PF.names = !PF.names;
      q('.tgnames').classList.toggle('on', PF.names);
      const n = q('.tgnsc');
      n.hidden = !PF.names;
      if (PF.names) appear(n);
      pfSave();
      draw();
    };
    q('.tgbant').value = PF.banner;
    q('.tgbant').oninput = e => {
      PF.banner = e.target.value;
      pfSave();
      draw();
    };
    qa('[data-z]').forEach(
      b =>
        (b.onclick = () => {
          const s = st(),
            k = (s && s.pz && s.pz.k) || 1;
          planZoom(b.dataset.z == '0' ? 1 : b.dataset.z == '+' ? k * 1.5 : k / 1.5);
        })
    );
    qa('.tgrot [data-r]').forEach(
      b =>
        (b.onclick = () => {
          const s = st(),
            t = tgt(),
            r = (s && s.pz && s.pz.r) || 0,
            k = b.dataset.r;
          if (k == 'atk') {
            const R = t ? attackRoute(t) : null;
            if (!R || R.hdg == null) {
              if (deps.toast)
                deps.toast(
                  'No attack heading: plan the attack on the Pop-up, HADB or TOSS tab, or fill from the datacard.',
                  true
                );
              return;
            }
            planTurn(R.hdg);
          } else planTurn(k == '0' ? 0 : r + +k);
        })
    );
    // Map filters of the horizontal envelope of the A-G page, for the map lent here (the points of the map are never edited here: the tab is for drawing)
    const pf = q('.tgpf'),
      PLAB = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'];
    pf.onclick = () => (pf.textContent = PLAB[deps.cyclePlan ? deps.cyclePlan() : 0]);
    const bl = q('.tgbld');
    bl.onclick = () => {
      PF.bld = !PF.bld;
      bl.classList.toggle('on', PF.bld);
      pfSave();
      draw();
    };
    mapBtns = () => {
      pf.textContent = PLAB[deps.planMode ? deps.planMode() : 0];
    };
    q('.tgcropno').onclick = () => cropEnd(false);
    q('.tgcropok').onclick = () => cropEnd(true);
    q('.tgcrops').oninput = e => cropSize(+e.target.value / 100);
    cv.addEventListener(
      'wheel',
      e => {
        if (!CROP) {
          // the zoom of the plan, around the point under the pointer
          const s = st(),
            g = geo();
          if (page != 'g' || !s || s.view != 'plan' || !g) return;
          const r = cv.getBoundingClientRect(),
            [u, v] = toU(((e.clientX - r.left) * PW) / r.width, ((e.clientY - r.top) * PH) / r.height);
          if (u < 0 || u > 1 || v < 0 || v > 1) return;
          e.preventDefault();
          const k = (s.pz && s.pz.k) || 1;
          planZoom(k * (e.deltaY < 0 ? 1.25 : 0.8), fromUV(g, u, v));
          return;
        }
        e.preventDefault();
        cropSize(CROP.w * (e.deltaY > 0 ? 1.06 : 1 / 1.06));
        q('.tgcrops').value = String(Math.round(CROP.w * 100));
      },
      { passive: false }
    );
    q('.tgfill').onclick = () => {
      const s = st();
      if (!s) return;
      s.auto = true;
      fillUI(true);
      draw();
    };
    q('.tgunfill').onclick = () => {
      const s = st();
      if (!s) return;
      s.auto = false;
      fillUI();
      draw();
    };
    q('.tgfac').oninput = e => {
      const s = st();
      if (s) s.fac = e.target.value;
      if (tgt() && tgt().pic) {
        const r = q('.tgrowt.on span'); // the name of a picture is its title: the list follows it
        if (r && r.firstChild) r.firstChild.textContent = s.fac;
      }
      draw();
    };
    q('.tgremt').oninput = e => {
      const s = st();
      if (s) s.rem = e.target.value;
      if (page == 't') draw();
    };
    q('.tgpen input').onchange = e => {
      PF.pen = e.target.checked;
      pfSave();
      if (PF.pen) penFont();
      draw();
    };
    const fi = q('.tgdrop input');
    fi.onchange = () => setImg(fi.files[0]);
    const dz = q('.tgdrop');
    ['dragenter', 'dragover'].forEach(t =>
      dz.addEventListener(t, e => {
        e.preventDefault();
        dz.classList.add('hot');
      })
    );
    ['dragleave', 'drop'].forEach(t =>
      dz.addEventListener(t, e => {
        e.preventDefault();
        dz.classList.remove('hot');
      })
    );
    dz.addEventListener('drop', e => setImg(e.dataTransfer.files[0]));
    q('.tgframe').onclick = () => (framing ? frame() : live());
    q('.tgunframe').onclick = () => unframe();
    q('.tgundo').onclick = () => {
      A().pop();
      selA = -1;
      draw();
    };
    q('.tgdel').onclick = () => {
      if (selA >= 0) {
        A().splice(selA, 1);
        selA = -1;
        draw();
      }
    };
    q('.tgclr').onclick = () => {
      const s = st();
      if (!s || !A().length) return;
      if (
        !(deps.confirm ? deps.confirm : confirm)('Delete all the annotations of this background (' + A().length + ')?')
      )
        return;
      s.ann[s.view] = [];
      selA = -1;
      draw();
    };
    q('.tgpng').onclick = () => {
      draw();
      cv.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a'),
          t = tgt();
        a.href = URL.createObjectURL(b);
        a.download =
          'Target ' +
          (t ? t.name.replace(/[\\/:*?"<>|]/g, '') : '') +
          (page == 'g' ? ' - graphic' : ' - information') +
          '.png';
        document.body.append(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 500);
      }, 'image/png');
    };
    q('.tgdc').onclick = () => {
      if (!pic()) return deps.toast && deps.toast('There is no picture yet.', true);
      cropStart();
    };
    // drawing on the picture
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return [((e.clientX - r.left) * PW) / r.width, ((e.clientY - r.top) * PH) / r.height];
    };
    const hit = (px, py) => {
      const L = A();
      for (let i = L.length - 1; i >= 0; i--) {
        const b = bbox(L[i]);
        if (px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]) return i;
      }
      return -1;
    };
    const nextN = k =>
      A().filter(a => a.k == k).length +
      1 +
      (k == 'dmpi' && st() && st().auto && PF.show.dmpi ? tgt().dmpis.length : 0);
    cv.onpointerdown = e => {
      if (page != 'g' || !pic()) return;
      const [px, py] = pos(e),
        [u, v] = toU(px, py);
      if (CROP) {
        if (u >= CROP.u && u <= CROP.u + CROP.w && v >= CROP.v && v <= CROP.v + CROP.h) {
          mv = { crop: true, u, v, o: { u: CROP.u, v: CROP.v } };
          cv.setPointerCapture(e.pointerId);
        }
        return;
      }
      // the × of a DMPI box
      const D = dmpiList();
      for (let i = 0; i < Math.min(6, D.length); i++) {
        const [cx, cy] = boxX(i);
        if (Math.hypot(px - cx, py - cy) < 11) return removeDmpi(D[i]);
      }
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      if (tool == 'select') {
        selA = hit(px, py);
        if (selA >= 0) {
          sz = A()[selA].sz || 's'; // the size buttons show the size of the symbol chosen
          segSet('sz', sz);
          mv = { i: selA, u, v, o: JSON.parse(JSON.stringify(A()[selA])) };
          cv.setPointerCapture(e.pointerId);
        }
        draw();
        return;
      }
      if (tool == 'callout') {
        if (!pend) {
          pend = { k: 'callout', u, v, col, sz };
          return;
        }
        const a = { ...pend, lu: u, lv: v };
        pend = null;
        ask(px, py, '', t => {
          if (t) {
            a.t = t;
            A().push(a);
            draw();
          }
        });
        return;
      }
      if (tool == 'dmpi') {
        const n = nextN('dmpi');
        ask(px, py, 'DMPI ' + n, t => {
          A().push({ k: 'dmpi', u, v, t: t || 'DMPI ' + n, d: '', sz });
          draw();
        });
        return;
      }
      if (tool == 'num') {
        A().push({ k: 'num', u, v, t: String(nextN('num')), col, sz });
        draw();
        return;
      }
      if (tool == 'text') {
        ask(px, py, '', t => {
          if (t) {
            A().push({ k: 'text', u, v, t, col, sz });
            draw();
          }
        });
        return;
      }
      if (tool == 'north') {
        drag = { k: 'north', u, v, col, sz, rot: 0, px, py };
        cv.setPointerCapture(e.pointerId);
        return;
      }
      drag = { k: tool, u, v, u2: u, v2: v, col, sz };
      cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = e => {
      if (!mv && !drag) return hover(e);
      const [px, py] = pos(e),
        [u, v] = toU(px, py);
      if (mv && mv.crop) {
        cropMove(mv.o.u + u - mv.u, mv.o.v + v - mv.v);
        return;
      }
      if (mv) {
        const a = A()[mv.i],
          du = u - mv.u,
          dv = v - mv.v;
        ['u', 'u2', 'lu'].forEach(k => {
          if (mv.o[k] !== undefined) a[k] = mv.o[k] + du;
        });
        ['v', 'v2', 'lv'].forEach(k => {
          if (mv.o[k] !== undefined) a[k] = mv.o[k] + dv;
        });
        draw();
        return;
      }
      if (drag.k == 'north') {
        drag.rot = Math.round((Math.atan2(px - drag.px, -(py - drag.py)) * 180) / Math.PI - nUp());
        if (Math.hypot(px - drag.px, py - drag.py) < 12) drag.rot = 0;
      } else {
        drag.u2 = u;
        drag.v2 = v;
      }
      draw();
    };
    cv.onpointerup = e => {
      mv = null;
      if (!drag) return;
      const a = drag;
      drag = null;
      const [px, py] = pos(e);
      if (a.k != 'north') {
        const p1 = toP(a.u, a.v),
          p2 = toP(a.u2, a.v2);
        if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 8) {
          draw();
          return;
        }
      }
      delete a.px;
      delete a.py;
      if (a.k == 'scale')
        return ask(px, py, '500 FT', t => {
          a.t = t;
          A().push(a);
          draw();
        });
      if (a.k == 'circle' || a.k == 'box')
        return ask(px, py, '', t => {
          a.t = t || '';
          A().push(a);
          draw();
        });
      A().push(a);
      draw();
    };
    // the pointer: the move cross only on what can be moved (a symbol, the crop frame), a hand on the × of a DMPI box, the draw cross for the tools
    function hover(e) {
      const [px, py] = pos(e),
        [u, v] = toU(px, py),
        inPic = page == 'g' && pic() && u >= 0 && u <= 1 && v >= 0 && v <= 1;
      let c = 'default';
      if (
        page == 'g' &&
        dmpiList()
          .slice(0, 6)
          .some((_, i) => Math.hypot(px - boxX(i)[0], py - boxX(i)[1]) < 11)
      )
        c = 'pointer';
      else if (CROP)
        c = inPic && u >= CROP.u && u <= CROP.u + CROP.w && v >= CROP.v && v <= CROP.v + CROP.h ? 'move' : 'default';
      else if (inPic) c = tool == 'select' ? (hit(px, py) >= 0 ? 'move' : 'default') : 'crosshair';
      if (cv.style.cursor != c) cv.style.cursor = c;
    }
    cv.onpointerleave = () => (cv.style.cursor = 'default');
    cv.ondblclick = e => {
      if (page != 'g' || tool != 'select') return;
      const [px, py] = pos(e),
        i = hit(px, py);
      if (i < 0) return;
      const a = A()[i];
      ask(px, py, a.t || '', t => {
        a.t = t;
        draw();
      });
    };
  }
  function ask(px, py, def, cb) {
    const r = cv.getBoundingClientRect(),
      ed = q('.tged'),
      inp = ed.querySelector('input');
    ed.hidden = false;
    ed.style.left = Math.max(0, Math.min(r.width - 320, (px * r.width) / PW)) + 'px';
    ed.style.top = (py * r.height) / PH + 10 + 'px';
    appear(ed);
    inp.value = def || '';
    inp.focus();
    inp.select();
    const ok = () => {
      ed.hidden = true;
      cb(inp.value.trim());
    };
    ed.querySelector('button').onclick = ok;
    inp.onkeydown = e => {
      if (e.key == 'Enter') ok();
      if (e.key == 'Escape') ed.hidden = true;
    };
  }
  const onKey = e => {
    if (!root.isConnected || root.closest('.hide')) return;
    if (
      (e.key == 'Delete' || e.key == 'Backspace') &&
      selA >= 0 &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)
    ) {
      A().splice(selA, 1);
      selA = -1;
      draw();
    }
  };
  const onPaste = e => {
    if (!root.isConnected || root.closest('.hide') || !tgt()) return;
    const it = [...((e.clipboardData || {}).items || [])].find(i => i.type.startsWith('image/'));
    if (it) {
      e.preventDefault();
      setImg(it.getAsFile());
    }
  };
  function setImg(file) {
    const s = st();
    if (!s || !file || !/^image\//.test(file.type)) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      URL.revokeObjectURL(im.src);
      s.shot = c;
      s.bv++;
      setView('shot');
    };
    im.onerror = () => deps.toast && deps.toast('The picture could not be read.', true);
    im.src = URL.createObjectURL(file);
  }
  // the Map page lent to the tab (live): what it shows is chosen first, then Take picture opens the frame
  async function live() {
    const t = tgt();
    if (!t || !deps.mapShow) return;
    const m = q('.tgmap');
    if (m.hidden) appear(m);
    m.hidden = false;
    cv.hidden = true;
    framing = true;
    liveUI();
    const ok = await deps.mapShow(m, [t.x, t.y], PF.range);
    if (!ok) {
      unframe();
      deps.toast && deps.toast('The map could not be loaded.', true);
      return;
    }
    if (!framing || !st() || st().view != 'map') return;
    levels(true);
  }
  async function frame() {
    if (!framing) await live();
    if (framing && deps.mapShoot) deps.mapShoot(PF.range);
  }
  function unframe() {
    if (framing && deps.mapDetach) deps.mapDetach();
    framing = false;
    if (!built) return;
    q('.tgmap').hidden = true;
    cv.hidden = false;
    levels(false);
    liveUI();
    draw();
  }
  // the buttons of the map section: live map or picture
  function liveUI() {
    if (!built) return;
    const s = st(),
      b = q('.tgframe');
    b.textContent = framing ? 'Take picture' : 'Back to the map';
    const u = q('.tgunframe');
    u.hidden = !(framing && s && s.map);
    qa('.tgpf').forEach(e => {
      if (framing && e.hidden) appear(e);
      e.hidden = !framing;
    });
    bldUI();
    if (framing) mapBtns();
  }
  // Buildings (in the tool bar) draws on the picture of the map once it is taken: not on the live map, not on the other backgrounds
  function bldUI() {
    if (!built) return;
    const s = st(),
      bl = q('.tgbld'),
      h = !(s && s.view == 'map' && !framing);
    if (!h && bl.hidden) appear(bl);
    bl.hidden = h;
  }
  // the LEVELS menu of the Map page (base map and layers), lent to the bar of the picture while the background is the map
  let levOn = false,
    mapBtns = () => {};
  async function levels(on) {
    const el = built && q('.tglev');
    if (!el || !deps.levelsTo) return;
    if (on && root.isConnected && !el.querySelector('#mpbasew')) {
      levOn = !!(await deps.levelsTo(el));
      // the background may have changed while the map was getting ready
      if (levOn && (!st() || st().view != 'map' || !framing || !root.isConnected)) return levels(false);
      el.hidden = !levOn;
      if (levOn) appear(el);
    } else if (!on && levOn) {
      deps.levelsBack();
      levOn = false;
      el.hidden = true;
    }
  }
  // Kneeboard cards: a small window with the three cards to choose
  async function addCards() {
    if (!tgt()) return;
    await nearLoad();
    const d = document.createElement('dialog'),
      K = tgt().pic
        ? [['g', 'Picture']]
        : [
            ['g', 'Graphic'],
            ['t', 'Target information'],
            ['d', 'Details (positive ID)'],
            ['s', 'Smart'],
          ],
      on = { g: true, t: true, d: true, s: true };
    d.className = 'tgdlg';
    d.innerHTML = `<h3>Add cards to the Kneeboard</h3><p class="hint">Each page becomes a card. The cards go into the free slots of the Kneeboard; when there is no free slot, among the unused cards.</p><div class="tgcards"></div><div class="tgbar"><span class="hint tgn"></span><span class="tgsp"></span><button type="button" class="btn g" data-a="no">Cancel</button><button type="button" class="btn" data-a="ok">Add</button></div>`;
    document.body.append(d);
    const C = {},
      cnt = () => {
        const n = K.filter(([k]) => on[k]).length,
          b = d.querySelector('[data-a=ok]');
        b.textContent = n ? `Add ${n} card${n > 1 ? 's' : ''}` : 'Add';
        b.classList.toggle('nil', !n);
      };
    K.forEach(([k, l]) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'tgcard' + (on[k] ? ' on' : '');
      C[k] = card(k);
      const th = document.createElement('canvas');
      th.width = 300;
      th.height = 450;
      th.getContext('2d').drawImage(C[k], 0, 0, 300, 450);
      it.append(th);
      const s = document.createElement('span');
      s.textContent = l;
      it.append(s);
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
    pickAll(d); // Select all / none
    d.querySelector('[data-a=no]').onclick = close;
    d.addEventListener('cancel', e => {
      e.preventDefault();
      close();
    });
    d.querySelector('[data-a=ok]').onclick = async () => {
      const L = K.filter(([k]) => on[k]);
      if (!L.length) return;
      close();
      const t = tgt(),
        out = [];
      for (const [k, l] of L) {
        const blob = await new Promise(r => C[k].toBlob(r, 'image/png'));
        if (!blob) continue;
        // the other look too (light / dark): the kneeboard switches it later
        const alt = await new Promise(r => otherLook(() => card(k)).toBlob(r, 'image/png'));
        const at = await deps.kbAdd(blob, 'Target · ' + t.name + ' · ' + l, alt, cardDark());
        out.push(l + ': ' + (at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards'));
      }
      deps.toast &&
        deps.toast(
          out.length + ' card' + (out.length > 1 ? 's' : '') + ' added to the Kneeboard. ' + out.join(' · ') + '.'
        );
    };
    d.showModal();
  }

  // ---- the state of the controls
  function banUI() {
    const b = q('.tgban'),
      on = PF.filt == 'uav';
    if (on && b.hidden) appear(b);
    b.hidden = !on;
  }
  function setView(v) {
    const s = st();
    if (!s) return;
    if (framing && v != 'map') unframe();
    s.view = v;
    selA = -1;
    segSet('view', v);
    qa('.tgsec').forEach(e => {
      const on = e.dataset.sec == v;
      if (on && e.hidden) appear(e);
      e.hidden = !on;
    });
    if (v != 'map') levels(false);
    const mb = q('.tgmapb');
    if (v == 'map' && mb.hidden) appear(mb);
    mb.hidden = v != 'map';
    // the map: live first, the picture once it is taken
    if (v == 'map' && !s.map && !framing) live();
    else liveUI();
    zoomUI();
    PF.filt = v == 'plan' ? (PF.filt == 'none' ? 'recon' : PF.filt) : PF.filt;
    segSet('filt', PF.filt);
    draw();
  }
  function fillUI(anim) {
    const s = st(),
      t = tgt(),
      f = q('.tgfset');
    q('.tgfill').hidden = !!(s && s.auto);
    f.hidden = !(s && s.auto);
    q('.tgfill').disabled = !t;
    if (s && s.auto) {
      if (anim) appear(f);
      const D = dc(),
        n = t.dmpis.length;
      q('.tgsrc').textContent = [
        n + ' DMPI',
        D.route ? (D.route.src == 'attack' ? 'attack planner' : 'flight plan') : 'no route',
        D.sams.length + ' SAM',
        D.units.length + ' unit' + (D.units.length == 1 ? '' : 's'),
      ].join(', ');
      const sh = q('.tgshow');
      sh.innerHTML = SHOWS.map(
        ([k, l]) => `<button type="button" data-show="${k}" class="${PF.show[k] ? 'on' : ''}">${l}</button>`
      ).join('');
      sh.querySelectorAll('[data-show]').forEach(
        b =>
          (b.onclick = () => {
            PF.show[b.dataset.show] = !PF.show[b.dataset.show];
            b.classList.toggle('on', PF.show[b.dataset.show]);
            pfSave();
            draw();
          })
      );
    }
  }
  function tlist() {
    if (deps.cardSync) queueMicrotask(deps.cardSync); // Add card: dimmed with no target chosen
    const L = q('.tglist');
    const name = t => (t.pic && ST[t.key] && ST[t.key].fac) || t.name;
    if (!TL.length) {
      L.innerHTML =
        '<p class="hint">No target. The TGT steerpoints and the weapon targets of the DTC, the target of the flight and the points added here show in this list.</p>';
      return;
    }
    L.innerHTML = TL.map(
      t =>
        `<div role="button" tabindex="0" class="tgrowt${t.key == sel ? ' on' : ''}" data-k="${esc(t.key)}"><b>${esc(t.label)}</b><span>${esc(name(t))}<small>${esc(
          t.pic
            ? 'no place: a screenshot or the map'
            : [
                t.dmpis.length ? t.dmpis.length + ' DMPI' : '',
                t.objId != null && t.type >= 0 && OBJ_TYPES[t.type] ? OBJ_TYPES[t.type] : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'point'
        )}</small></span><button type="button" class="tgx" title="${esc(rmTitle(t))}">×</button></div>`
    ).join('');
    L.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = e => {
        const t = TL.find(z => z.key == b.dataset.k);
        if (e.target.closest('.tgx')) return t && removeTarget(t);
        selT(b.dataset.k);
      };
      b.onkeydown = e => {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault();
          selT(b.dataset.k);
        }
      };
    });
  }
  // ---- taking a target or an aim point away: the TGT steerpoints and the weapon targets are deleted from the DTC (so from the Map too); the target of
  // the flight, a route steerpoint and a picked point are only taken out of this list
  const inDtc = d => d && (d.kind == 'prec' || d.kind == 'wpn');
  const rmTitle = t =>
    t.pic
      ? 'Remove this picture'
      : t.dmpis.some(inDtc)
        ? 'Remove: ' +
          t.dmpis
            .filter(inDtc)
            .map(d => d.short)
            .join(', ') +
          ' deleted from the DTC'
        : 'Remove from this list';
  async function removeTarget(t) {
    if (t.pic) {
      if (
        deps.confirm &&
        !(await deps.confirm('Remove ' + ((ST[t.key] && ST[t.key].fac) || t.name) + ' and its picture?'))
      )
        return;
      const i = PICS.findIndex(z => z.key == t.key);
      if (i >= 0) PICS.splice(i, 1);
      delete ST[t.key];
      await loadTargets();
      return selT(sel);
    }
    const del = t.dmpis.filter(inDtc),
      msg = del.length
        ? `Remove ${t.name}? ${del.map(d => d.ref).join(', ')} will be deleted from the DTC (and from the map).` +
          (t.flight ? ' The target of the flight is only taken out of this list.' : '')
        : `Take ${t.name} out of this list?` +
          (t.flight ? ' It is the target of the flight: the campaign does not change.' : '');
    if (deps.confirm && !(await deps.confirm(msg))) return;
    if (del.length && deps.removeDtc) deps.removeDtc(del);
    t.dmpis.filter(d => !inDtc(d)).forEach(d => HIDE.add(pid(d)));
    (t.pts || []).filter(d => d.kind == 'flight').forEach(d => HIDE.add(pid(d)));
    for (let i = PICKS.length - 1; i >= 0; i--) if (t.dmpis.includes(PICKS[i])) PICKS.splice(i, 1);
    await loadTargets();
    selT(sel);
  }
  async function removeDmpi(a) {
    if (!a) return;
    if (!a.src) {
      // put by hand
      const L = A(),
        i = L.findIndex(z => z.k == 'dmpi' && z.u == a.u && z.v == a.v);
      if (i >= 0) L.splice(i, 1);
      return draw();
    }
    const d = a.src;
    if (inDtc(d)) {
      if (deps.confirm && !(await deps.confirm(`Delete ${d.ref} from the DTC (and from the map)?`))) return;
      deps.removeDtc && deps.removeDtc([d]);
    } else {
      HIDE.add(pid(d));
      const i = PICKS.indexOf(d);
      if (i >= 0) PICKS.splice(i, 1);
    }
    await loadTargets();
    selT(sel);
  }
  function selT(k) {
    if (CROP) cropEnd(false);
    queueMicrotask(zoomUI);
    if (framing) unframe();
    sel = k;
    selA = -1;
    pend = null;
    tlist();
    const s = st(),
      t = tgt();
    q('.tgfac').value = s ? s.fac : '';
    q('.tgremt').value = s ? s.rem : '';
    qa('[data-seg=view] [data-v=plan]').forEach(b => (b.disabled = !!(t && t.pic))); // a picture has no objective
    qa('[data-seg=page] [data-v=t]').forEach(b => (b.disabled = !!(t && t.pic))); // ...nor target information
    q('.tgfrom').hidden = !!(t && t.pic); // ...nor DTC points
    if (t && t.pic && page != 'g') {
      page = 'g';
      segSet('page', 'g');
    }
    fillUI();
    if (t) loadPlan(t);
    if (s) setView(s.view);
    else draw();
  }
  async function loadPlan(t) {
    if (t.objId == null || !deps.features || FEAT[t.key]) return;
    FEAT[t.key] = { loading: true };
    try {
      const r = await deps.features(t.objId);
      if (r && r.feats && r.feats.length) {
        FEAT[t.key] = { feats: r.feats, pct: r.pct, air: r.air || null, v: 0 };
        buildPlan(t);
      } else FEAT[t.key] = { none: true };
    } catch (e) {
      FEAT[t.key] = { none: true };
    }
    if (sel == t.key) {
      const s = st();
      if (s && s.view == 'plan' && !FEAT[t.key].plan && (s.map || s.shot)) s.view = s.map ? 'map' : 'shot';
      draw();
    }
  }
  // the plan of the objective, for its zoom (s.pz: {k, c}); the relief of the BMS terrain comes after, when the BMS folder is known
  let PLT = 0;
  function buildPlan(t) {
    const f = FEAT[t.key],
      s = ST[t.key];
    if (!f || !f.feats) return;
    const ex = t.dmpis.map(d => ({ x: d.x, y: d.y })),
      ar = f.air ? f.air.rwy.flatMap(r => r.c.map(([x, y]) => ({ x, y }))) : [],
      z = (s && s.pz) || { k: 1, c: [t.x, t.y] },
      r = z.r || 0, // the heading at the top of the plan
      g0 = planBox([...f.feats, ...ex, ...ar], [t.x, t.y], 2160, 1040, r),
      w = geoWidth(g0) / z.k,
      box = rotBox(z.c[0], z.c[1], w, (w * 1040) / 2160, r),
      key = z.k + ':' + z.c.join(',') + ':' + r;
    f.plan = planPicture(f.feats, [t.x, t.y], t.key, ex, f.gk == key ? f.ground : null, box, f.air);
    f.v++;
    if (!deps.heights || f.gk == key) return;
    clearTimeout(PLT);
    PLT = setTimeout(() => {
      const gr = groundGrid(box);
      deps
        .heights(gr.pts)
        .then(h => {
          if (!h || !h.some(q => q != null)) return;
          const z2 = (ST[t.key] && ST[t.key].pz) || { k: 1, c: [t.x, t.y] };
          if (z2.k + ':' + z2.c.join(',') + ':' + (z2.r || 0) != key) return; // zoomed or turned again meanwhile
          f.ground = { cols: gr.cols, rows: gr.rows, h };
          f.gk = key;
          f.plan = planPicture(f.feats, [t.x, t.y], t.key, ex, f.ground, box, f.air);
          f.v++;
          if (sel == t.key) draw();
        })
        .catch(() => {});
    }, 250);
  }
  // zoom of the plan (k: 1 = all the objective, up to 8), around the ground point g (km); the symbols drawn by hand stay on their ground
  function planZoom(k, g) {
    const t = tgt(),
      s = st(),
      f = t && FEAT[t.key];
    if (!t || !s || !f || !f.plan) return;
    const old = f.plan.geo,
      z = s.pz || { k: 1, c: [t.x, t.y] },
      nk = Math.max(1, Math.min(8, k));
    if (nk == z.k && !g) return;
    let c = z.c;
    if (g) {
      // the point under the pointer stays under it (along and across the picture, which may be turned)
      const [u, v] = toUV(old, g[0], g[1]),
        w = geoWidth(old) * (z.k / nk),
        h = (w * 1040) / 2160,
        a = ((z.r || 0) * Math.PI) / 180,
        up = [Math.sin(a), Math.cos(a)],
        rt = [Math.cos(a), -Math.sin(a)];
      c = [g[0] - rt[0] * (u - 0.5) * w + up[0] * (v - 0.5) * h, g[1] - rt[1] * (u - 0.5) * w + up[1] * (v - 0.5) * h];
    }
    if (nk == 1) c = [t.x, t.y];
    replan(t, s, f, { ...z, k: nk, c });
    zoomUI();
  }
  // the turn of the plan: its top to the heading deg (0 north up); the symbols drawn by hand stay on their ground
  function planTurn(deg) {
    const t = tgt(),
      s = st(),
      f = t && FEAT[t.key];
    if (!t || !s || !f || !f.plan) return;
    const z = s.pz || { k: 1, c: [t.x, t.y] },
      r = ((Math.round(deg) % 360) + 360) % 360;
    if (r == (z.r || 0)) return;
    replan(t, s, f, { ...z, r });
    zoomUI();
  }
  // the plan made again with another zoom or turn (s.pz = z), the symbols drawn by hand moved with their ground
  function replan(t, s, f, z) {
    const old = f.plan.geo;
    const ann = s.ann.plan.map(a => {
      const o = { a };
      [
        ['u', 'v'],
        ['u2', 'v2'],
        ['lu', 'lv'],
      ].forEach(([u, v]) => {
        if (a[u] !== undefined) o[u] = fromUV(old, a[u], a[v]);
      });
      return o;
    });
    s.pz = z;
    buildPlan(t);
    const ng = f.plan.geo;
    ann.forEach(o =>
      [
        ['u', 'v'],
        ['u2', 'v2'],
        ['lu', 'lv'],
      ].forEach(([u, v]) => {
        if (o[u]) [o.a[u], o.a[v]] = toUV(ng, o[u][0], o[u][1]);
      })
    );
    draw();
  }
  function zoomUI() {
    const s = st(),
      k = (s && s.pz && s.pz.k) || 1,
      r = (s && s.pz && s.pz.r) || 0,
      el = built && q('.tgzk');
    if (el) el.textContent = k == 1 ? 'all' : '× ' + Math.round(k * 10) / 10;
    const rv = built && q('.tgrotv');
    if (rv) rv.textContent = r ? brg3(r) + ' up' : 'North up';
  }
  async function loadTargets() {
    let r = { points: [], objs: [] };
    try {
      r = (deps.points && (await deps.points())) || r;
    } catch (e) {}
    OBJS = r.objs || [];
    const all = [...(r.points || []), ...PICKS].filter(p => !HIDE.has(pid(p)));
    if ((r.points || [])[0]) PIC_C = { x: r.points[0].x, y: r.points[0].y };
    TL = groupTargets(all, OBJS);
    // the points of each target (the flight one is not an aim point)
    TL.forEach(t => (t.pts = all.filter(p => p.kind == 'flight' && Math.hypot(p.x - t.x, p.y - t.y) < 3.2)));
    TL.push(...PICS.map(q => ({ ...q, x: PIC_C.x, y: PIC_C.y, dmpis: [], refs: [], pts: [], objId: null, type: -1 })));
    if (!TL.some(t => t.key == sel)) sel = TL.length ? TL[0].key : '';
  }

  // the cards of the target chosen, in both looks, for Add all cards of the Kneeboard: [{name, label, c, alt, dark, off}] (Details off at first)
  async function allCards(self) {
    if (!built) await self.render();
    const t = tgt();
    if (!t) return [];
    await nearLoad();
    if (t.pic) {
      const nm = (st() && st().fac) || t.name;
      return [
        { name: 'Picture · ' + nm, label: 'Picture', c: card('g'), alt: otherLook(() => card('g')), dark: cardDark() },
      ];
    }
    return [
      ['g', 'Graphic'],
      ['t', 'Target information'],
      ['d', 'Details (positive ID)'],
      ['s', 'Smart'],
    ].map(([k, l]) => ({
      name: k == 's' ? 'Smart · Target · ' + t.name : 'Target · ' + t.name + ' · ' + l,
      label: k == 's' ? 'Smart · Target' : 'Target · ' + l,
      c: card(k),
      alt: otherLook(() => card(k)),
      dark: cardDark(),
    }));
  }
  return {
    root,
    // the data of the Smart Target card (null before the page was built or without a target): the combined Smart cards take their target from it
    // (not built here: building the page takes the map of the page shown)
    smart: () => (built && tgt() && !tgt().pic ? smartData() : null),
    allCards() {
      return allCards(this);
    },
    // Add card of the A-G pages row: the pages of the target as Kneeboard cards
    addCard() {
      return built ? addCards() : undefined;
    },
    canCard: () => built && !!tgt(),
    async render() {
      if (!built) {
        build();
        try {
          const o = deps.prefs && (await deps.prefs.load());
          if (o && typeof o == 'object') {
            for (const k of ['filt', 'lsty', 'pst', 'banner', 'nscope']) if (typeof o[k] == 'string') PF[k] = o[k];
            if (typeof o.names == 'boolean') PF.names = o.names;
            if (typeof o.pen == 'boolean') PF.pen = o.pen;
            q('.tgpen input').checked = PF.pen;
            if (PF.pen) penFont();
            q('.tgbant').value = PF.banner;
            q('.tgnames').classList.toggle('on', PF.names);
            q('.tgnsc').hidden = !PF.names;
            segSet('nscope', PF.nscope);
            banUI();
            for (const k of ['con', 'grn', 'range']) if (isFinite(o[k])) PF[k] = +o[k];
            if (o.show && typeof o.show == 'object')
              for (const k of Object.keys(PF.show)) if (typeof o.show[k] == 'boolean') PF.show[k] = o.show[k];
            ['filt', 'lsty', 'pst', 'range'].forEach(k => segSet(k, PF[k]));
            qa('[data-pf]').forEach(i => (i.value = PF[i.dataset.pf]));
          }
        } catch (e) {}
        document.addEventListener('paste', onPaste);
        document.addEventListener('keydown', onKey);
      }
      await loadTargets();
      selT(sel);
    },
    leave() {
      if (CROP) cropEnd(false);
      if (framing) unframe();
      levels(false);
    },
    // the picture captured in the frame of the Map page: corners {tl, tr, bl} as [lat, lon]
    setShot(c, g) {
      const s = st();
      if (!s || !c) return;
      let gg = null;
      try {
        if (g && deps.fromLL) gg = geoCorners(deps.fromLL(...g.tl), deps.fromLL(...g.tr), deps.fromLL(...g.bl));
      } catch (e) {}
      s.map = { c, geo: gg };
      s.bv++;
      unframe();
      setView('map');
    },
    // files dropped on the window (the desktop program takes the drops): a picture is the screenshot when this tab is shown
    drop(files) {
      if (!root.isConnected || root.closest('.hide') || !tgt()) return false;
      const f = files.find(z => /\.(png|jpe?g|webp|bmp|gif)$/i.test(z.name || '') || /^image\//.test(z.type || ''));
      if (!f) return false;
      setImg(
        f.type
          ? f
          : new File([f], f.name, {
              type: 'image/' + (/\.jpe?g$/i.test(f.name) ? 'jpeg' : f.name.split('.').pop().toLowerCase()),
            })
      );
      return true;
    },
    // for the tests
    _t: {
      planZoom,
      nUp: () => nUp(),
      air: () => (FEAT[sel] && FEAT[sel].air) || null,
      crop: () => CROP,
      boxX,
      list: () => TL,
      sel: () => sel,
      state: () => st(),
      card,
      dcShot,
      dmpiList,
      dc,
      setImg,
      KM_NM,
    },
  };
}
