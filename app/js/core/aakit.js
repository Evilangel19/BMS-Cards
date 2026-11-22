// @ts-check
// What the pages of A-A (DCA: core/faorpage.js, OCA: core/ocapage.js) share. A page describes its plan once, as a list of shapes in km of the theater
// (x east, y north), and the same list is drawn three ways: on the lent Leaflet map (the page and the Map page, Display), in the pixels of the picture
// of the map for the classic card (core/aacard.js), and in ink on the Smart card (core/smartaa.js).
// A shape: {t: 'poly', pts, col, w, dash, close, fill} | {t: 'ring', c, r (km), col, w, dash} | {t: 'dot', p, col, k: 'dot' | 'sq' | 'tri'} |
//          {t: 'label', p, text, col} | {t: 'arrow', from, to, text, col}; ink: how the Smart card draws it ({w, dash, red, grey, fill, round, label, bold,
//          p, text, at}: another place or text for a label), false: not on the Smart card; map: false: not on the map (the cards only).
import { chooseCards } from './tgdlg.js';
import { otherLook, cardDark } from './cardink.js';

export const h3 = d => String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, '0');
export const hm = t => {
  const m = Math.floor((t || 0) / 60000);
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};

// ---- on the Leaflet map: the shapes in the group WL (RN: the canvas renderer of the page); the points to fit the view to
export function drawLeaflet(L, RN, WL, toLL, S, esc) {
  const ll = p => toLL(p.x, p.y),
    tag = (p, t, c) =>
      L.marker(ll(p), {
        icon: L.divIcon({ className: 'sdtag', html: `<span style="color:${c}">${esc(t)}</span>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(WL),
    dash = d => (d && d.length ? d.join(' ') : undefined),
    fit = [];
  S.forEach(s => {
    if (s.map === false) return; // the cards only
    if (s.t == 'poly') {
      const o = { renderer: RN, interactive: false, color: s.col, weight: s.w || 2, dashArray: dash(s.dash) };
      (s.close
        ? L.polygon(s.pts.map(ll), { ...o, fillColor: s.col, fillOpacity: s.fill ? 0.1 : 0, fill: !!s.fill })
        : L.polyline(s.pts.map(ll), o)
      ).addTo(WL);
      if (s.fit !== false) fit.push(...s.pts);
    } else if (s.t == 'ring')
      L.circle(ll(s.c), {
        renderer: RN,
        interactive: false,
        radius: s.r * 1000,
        color: s.col,
        weight: s.w || 1,
        dashArray: dash(s.dash),
        fill: false,
      }).addTo(WL);
    else if (s.t == 'dot')
      L.circleMarker(ll(s.p), {
        renderer: RN,
        interactive: false,
        radius: 5,
        color: '#000',
        weight: 1.5,
        fillColor: s.col,
        fillOpacity: 1,
      }).addTo(WL);
    else if (s.t == 'label') tag(s.p, s.text, s.col);
    else if (s.t == 'arrow') {
      L.polyline([ll(s.from), ll(s.to)], {
        renderer: RN,
        interactive: false,
        color: s.col,
        weight: 1,
        dashArray: '2 4',
      }).addTo(WL);
      tag(s.to, s.text, s.col);
      fit.push(s.to);
    }
  });
  return fit.map(ll);
}

// ---- in the pixels of the map picture (px: km point -> [x, y]; nm: pixels per NM): the plan of the classic card
export function toPx(S, px, nm) {
  const o = { rings: [], polys: [], dots: [], labels: [] },
    k = nm / 1.852;
  S.forEach(s => {
    if (s.t == 'poly')
      o.polys.push({
        pts: s.pts.map(px),
        col: s.col,
        w: (s.w || 2) * 2,
        dash: (s.dash || []).map(v => v * 2),
        close: s.close,
        fill: s.fill ? hexA(s.col, 0.12) : null,
      });
    else if (s.t == 'ring')
      o.rings.push({
        c: px(s.c),
        r: s.r * k,
        col: s.col,
        w: (s.w || 1) * 2.5,
        dash: (s.dash || [3, 5]).map(v => v * 2),
      });
    else if (s.t == 'dot') o.dots.push({ p: px(s.p), col: s.col, k: s.k });
    else if (s.t == 'label') o.labels.push({ p: px(s.p), t: s.text, col: s.col });
    else if (s.t == 'arrow') {
      o.polys.push({ pts: [px(s.from), px(s.to)], col: s.col, w: 2.5, dash: [4, 8] });
      o.labels.push({ p: px(s.to), t: s.text, col: s.col });
    }
  });
  return o;
}
const hexA = (c, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  if (!m) return 'rgba(255,255,255,' + a + ')';
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};

// ---- in ink (the Smart card, core/smartaa.js P)
export function toInk(S, extra = {}) {
  const P = { view: [], polys: [], rings: [], dots: [], labels: [], arrow: null, ...extra };
  S.forEach(s => {
    const i = s.ink;
    if (i === false) return;
    const n = i || {};
    if (s.t == 'poly') {
      P.polys.push({
        pts: s.pts,
        w: n.w || 1.5,
        dash: n.dash || [],
        red: n.red,
        grey: n.grey,
        fill: n.fill,
        close: s.close,
        round: n.round,
      });
      if (s.fit !== false) P.view.push(...s.pts);
    } else if (s.t == 'ring')
      P.rings.push({
        c: s.c,
        r: s.r,
        w: n.w || 1,
        dash: n.dash || [2, 4],
        red: n.red,
        grey: n.grey !== false && !n.red,
      });
    else if (s.t == 'dot') P.dots.push({ p: s.p, k: s.k, label: n.label, bold: n.bold });
    else if (s.t == 'label') P.labels.push({ p: n.p || s.p, t: n.text || s.text, red: n.red, bold: n.bold, at: n.at });
    else if (s.t == 'arrow') {
      P.arrow = { from: s.from, to: s.to, label: n.text || s.text };
      P.view.push(s.to);
    }
  });
  return P;
}

// ---- the picture of the lent map for the classic card: the plan layer (WL) taken off, the view as the pilot left it (keep) or fitted to the points,
// a picture of it (deps.snap) cut to the aspect AR; px / nm to draw the plan in its pixels. null without a picture
export async function snapMap(M, deps, fitPts, AR, keep, nmRef) {
  const { L, map, WL } = M,
    ll = p => deps.toLL(p.x, p.y),
    el = map.getContainer(),
    cw = el.clientWidth,
    ch = el.clientHeight,
    bw = Math.min(cw, ch * AR),
    bh = bw / AR,
    ox = (cw - bw) / 2,
    oy = (ch - bh) / 2,
    c0 = map.getCenter(),
    z0 = map.getZoom();
  WL.remove();
  try {
    if (!keep)
      map.fitBounds(L.latLngBounds(fitPts.map(ll)), {
        paddingTopLeft: [ox + 20, oy + 20],
        paddingBottomRight: [ox + 20, oy + 20],
        animate: false,
      });
    await new Promise(r => setTimeout(r, keep ? 600 : 1200));
    const shot = await deps.snap(2);
    if (!shot) return null;
    const k = shot.canvas.width / cw,
      px = p => {
        const q = map.latLngToContainerPoint(ll(p));
        return /** @type {[number, number]} */ ([(q.x - ox) * k, (q.y - oy) * k]);
      },
      a = px(nmRef[0]),
      b = px(nmRef[1]),
      nm =
        Math.hypot(b[0] - a[0], b[1] - a[1]) / (Math.hypot(nmRef[1].x - nmRef[0].x, nmRef[1].y - nmRef[0].y) / 1.852),
      crop = document.createElement('canvas');
    crop.width = Math.round(bw * k);
    crop.height = Math.round(bh * k);
    /** @type {CanvasRenderingContext2D} */ (crop.getContext('2d')).drawImage(shot.canvas, -ox * k, -oy * k);
    return { img: crop, coast: shot.coast, nm, px };
  } catch (e) {
    return null;
  } finally {
    WL.addTo(map);
    map.setView(c0, z0, { animate: false });
  }
}

// ---- Add card: the cards of the page in the window of the program (core/tgdlg.js), the choice kept (key), then into the Kneeboard
// kinds [[k, label]], make(k) -> canvas, name(k) -> the name on the Kneeboard
export async function addCards(deps, kinds, make, name, title, key, pre) {
  let keep = pre;
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(v) && v.length) keep = v;
  } catch (e) {
    /* none */
  }
  const list = kinds.map(([k, l]) => ({
    k,
    label: l,
    name: name(k),
    c: make(k),
    alt: otherLook(() => make(k)),
    on: keep.includes(k),
  }));
  const pick = await chooseCards(list, title);
  if (!pick.length) return;
  try {
    localStorage.setItem(key, JSON.stringify(pick.map(z => z.k)));
  } catch (e) {
    /* not kept */
  }
  const out = [];
  for (const z of pick) {
    const blob = await new Promise(r => z.c.toBlob(r, 'image/png'));
    if (!blob) continue;
    const alt = await new Promise(r => z.alt.toBlob(r, 'image/png'));
    const at = await deps.kbAdd(blob, z.name, alt, cardDark());
    out.push(z.label + ': ' + (at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards'));
  }
  deps.toast(out.length + ' card' + (out.length > 1 ? 's' : '') + ' added to the Kneeboard. ' + out.join(' · ') + '.');
}
// every card of the page, in both looks, for Add all cards of the Kneeboard
export const allOf = (kinds, make, name, prefix) =>
  kinds.map(([k, l]) => ({
    name: name(k),
    label: prefix + ' · ' + l,
    c: make(k),
    alt: otherLook(() => make(k)),
    dark: cardDark(),
  }));
