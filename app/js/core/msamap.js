// The MSA symbol of an airbase / navaid for the map (SVG): a black disc with a light edge, the sectors cut where the highest terrain changes, the value of each sector in a
// box (white on black), the hexagon of the reference point in the middle; from a certain size the bearings of the sector edges (inbound, like on the approach charts).
// It grows with the zoom: small and quiet when the map is far, readable when it is close.
import { inbound } from './msa.js';

export const msaSize = z => Math.max(34, Math.min(150, Math.round(34 + (z - 7) * 20)));
const f0 = v => String(Math.round(v));
const pad3 = v => String(Math.round(v)).padStart(3, '0');

/** @param {{from:number,to:number,msa:number}[]} secs  @param {number} zoom  @param {number} [magvar] degrees east (the bearings are magnetic = true - variation)
 *  @returns {{html:string, size:number}} the svg is centred on its (0,0): put it in a divIcon of size 0 */
export function msaSymbol(secs, zoom, magvar) {
  const S = msaSize(zoom),
    R = S / 2,
    big = S >= 90,
    W = S + (big ? 96 : 8),
    C = W / 2,
    fs = Math.max(8, S / 9.5),
    pt = (deg, r) => {
      const t = (deg * Math.PI) / 180;
      return [C + Math.sin(t) * r, C - Math.cos(t) * r];
    },
    EDGE = '#dfe7f0';
  let g = `<circle cx="${C}" cy="${C}" r="${R}" fill="#000" fill-opacity=".9" stroke="${EDGE}" stroke-width="1.1"/>`;
  const box = (x, y, txt) =>
    `<rect x="${x - fs * 1.5}" y="${y - fs * 0.85}" width="${fs * 3}" height="${fs * 1.55}" rx="2" fill="#000" stroke="${EDGE}" stroke-width=".8"/>` +
    `<text x="${x}" y="${y + fs * 0.34}" font-size="${fs}" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui,Arial,sans-serif">${txt}</text>`;
  if (secs.length == 1) g += box(C, C - R * 0.5, f0(secs[0].msa));
  else
    secs.forEach((s, i) => {
      const [x0, y0] = pt(s.from, R),
        [mx, my] = pt((s.from + s.to) / 2, R * 0.58);
      g +=
        `<line x1="${C}" y1="${C}" x2="${x0}" y2="${y0}" stroke="${EDGE}" stroke-width=".9"/>` + box(mx, my, f0(s.msa));
      if (big) {
        const [ax, ay] = pt(s.from, R + 22),
          [bx, by] = pt(s.from, R * 0.64),
          [tx, ty] = pt(s.from, R + 36);
        g +=
          `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#fff" stroke-width="1" marker-end="url(#ar)"/>` +
          `<text x="${tx}" y="${ty + 4}" font-size="11" font-weight="700" font-style="italic" fill="#fff" text-anchor="middle" font-family="system-ui,Arial,sans-serif" style="paint-order:stroke" stroke="#000" stroke-width="3">${pad3(inbound(s.from, magvar))}°</text>`;
      }
    });
  g += `<polygon points="${C},${C - 5} ${C + 4.5},${C - 2.5} ${C + 4.5},${C + 2.5} ${C},${C + 5} ${C - 4.5},${C + 2.5} ${C - 4.5},${C - 2.5}" fill="#fff" stroke="#000" stroke-width="1"/>`;
  const defs = big
    ? '<defs><marker id="ar" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6z" fill="#fff"/></marker></defs>'
    : '';
  return {
    size: S,
    html: `<svg width="${W}" height="${W}" style="position:absolute;left:${-C}px;top:${-C}px;overflow:visible;pointer-events:none">${defs}${g}</svg>`,
  };
}
