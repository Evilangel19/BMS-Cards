// NATO-style (APP-6 / MIL-STD-2525 look) unit symbols drawn as SVG: blue rectangle = friendly, red diamond = hostile, green square =
// neutral. The inner sign depends on the BMS unit category (UCD name). Drawn from scratch with simple shapes (no copied artwork).

const G = { // inner signs in a [-1, 1] box; stroke only
  inf: '<path d="M-1-1L1 1M-1 1L1-1"/>',
  armor: '<ellipse rx=".8" ry=".5"/>',
  mech: '<path d="M-1-1L1 1M-1 1L1-1"/><ellipse rx=".75" ry=".45"/>',
  cav: '<path d="M-1 1L1-1"/>',
  armcav: '<path d="M-1 1L1-1"/><ellipse rx=".75" ry=".45"/>',
  art: '<circle r=".3" class="f"/>',
  rocket: '<circle cx="0" cy=".45" r=".28" class="f"/><path d="M0 .2V-1M-.4-.55L0-1L.4-.55"/>',
  missile: '<path d="M0 1V-1M-.45-.5L0-1L.45-.5"/>',
  ad: '<path d="M-.95 .75Q0-1.15 .95 .75"/>',
  shorad: '<path d="M-.95 .75Q0-1.15 .95 .75"/><circle cx="0" cy=".2" r=".16" class="f"/>',
  aaa: '<path d="M-.95 .75Q0-1.15 .95 .75"/><circle cx="0" cy=".2" r=".3" class="f"/>',
  basedef: '<path d="M-.95 .75Q0-1.15 .95 .75M-.95 .75H.95"/>',
  abn: '<path d="M-1-1L1 1M-1 1L1-1"/><path d="M-.6-.9Q0-1.5 .6-.9" transform="translate(0 -.1)"/>',
  ship: '<path d="M-1-.1H1L.6 .7H-.6ZM-.2-.1V-.7H.35V-.1"/>',
  sub: '<ellipse cy=".3" rx="1" ry=".35"/><path d="M-.15-.05V-.6H.3V-.05"/>',
  hq: 'T:HQ', eng: 'T:E', sup: 'T:S', sf: 'T:SF', mar: 'T:M', unk: 'T:?'
};
export const CAT_GLYPH = {
  'Armored': 'armor', 'Tank': 'armor', 'Mech': 'mech', 'Motor Rifle': 'mech', 'Armored Cavalry': 'armcav', 'Cavalry': 'cav',
  'Infantry': 'inf', 'Airborne': 'abn', 'Air Assault': 'abn', 'Airmobile': 'abn', 'Marine': 'mar', 'Amphibian Assault': 'mar', 'Spec Ops': 'sf',
  'Engineer': 'eng', 'HQ': 'hq', 'Supply': 'sup', 'Rocket': 'rocket', 'Rocket Artillery': 'rocket', 'Missile': 'missile',
  'SP Artillery': 'art', 'Towed Artillery': 'art', 'SP Guns': 'art', 'Towed Gun': 'art',
  'Air Defense': 'ad', 'SHORAD': 'shorad', 'AAA': 'aaa', 'Base Defense': 'basedef',
  'SAG': 'ship', 'CSG': 'ship', 'ARG': 'ship', 'ASW/SUW': 'ship', 'Sub': 'sub', 'MV': 'ship'};
export const glyphOf = cat => CAT_GLYPH[cat] || 'unk';
const COL = {friend: '#4f8cff', hostile: '#ff5d5d', neutral: '#4cc38a'};

// side: 'friend' | 'hostile' | 'neutral'. Returns {html, w, h} with the symbol as an inline SVG string.
export function unitSymbol(cat, side) {
  const col = COL[side] || COL.neutral, g = G[glyphOf(cat)], rect = side != 'hostile';
  const frame = rect ? '<rect x="2" y="2" width="24" height="16" class="fr"/>' : '<path d="M14 2L26 14L14 26L2 14Z" class="fr"/>';
  const [w, h, cx, cy, sx, sy] = rect ? [28, 20, 14, 10, 8, 5] : [28, 28, 14, 14, 5.5, 5.5];
  const inner = g.startsWith('T:') ? `<text x="${cx}" y="${cy + 3.4}" text-anchor="middle" class="t">${g.slice(2)}</text>`
    : `<g transform="translate(${cx} ${cy}) scale(${sx} ${sy})" class="gl">${g}</g>`;
  return {w, h, html: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="u-${side}" style="--c:${col}">${frame}${inner}</svg>`};
}

// Airbase and navaid icons (SVG strings, 18 x 18). Airbase: two parallel runways cut across by a third (no circle); VOR: hexagon with a dot; VOR/DME: box with the hexagon points; DME: box; VORTAC: hexagon with three
// blocks; TACAN: three-lobed shape; NDB: dotted circles (symbols as in the standard chart legend).
export function placeIcon(kind, sub, color) {
  let g;
  if (kind == 'ab') g = '<g transform="rotate(45 9 9)"><path d="M7.4 1.5V16.5M10.6 1.5V16.5" class="th"/><path d="M3.5 11.4L14.5 6.6" class="th"/></g>';   // two parallel runways cut across by a third
  else if (sub == 'vortac') g = '<path d="M5.5 4.5H12.5L15.5 9.5L12.5 14.5H5.5L2.5 9.5Z" class="fr"/><path d="M2.5 9.5L5.5 4.5L3 2.8L0.3 7.3Z M15.5 9.5L12.5 4.5L15 2.8L17.7 7.3Z M6.3 14.5H11.7V17.5H6.3Z" class="f"/><circle cx="9" cy="9.5" r="1.3" class="f"/>';
  else if (sub == 'vordme') g = '<rect x="1.5" y="3" width="15" height="12" class="fr"/><path d="M1.5 9L5 3M1.5 9L5 15M16.5 9L13 3M16.5 9L13 15" class="th2"/><circle cx="9" cy="9" r="1.3" class="f"/>';
  else if (sub == 'dme') g = '<rect x="1.5" y="3" width="15" height="12" class="fr"/><circle cx="9" cy="9" r="1.3" class="f"/>';
  else if (sub == 'vor') g = '<path d="M5 3.5H13L16.5 9L13 14.5H5L1.5 9Z" class="fr"/><circle cx="9" cy="9" r="1.4" class="f"/>';
  else if (sub == 'ndb') g = '<circle cx="9" cy="9" r="8" class="dr" stroke-dasharray="0.01 1.5"/><circle cx="9" cy="9" r="6.2" class="dr" stroke-dasharray="0.01 1.35"/><circle cx="9" cy="9" r="4.4" class="dr" stroke-dasharray="0.01 1.2"/><circle cx="9" cy="9" r="2.4" class="fr" style="fill:#0d1b2a"/><circle cx="9" cy="9" r=".8" class="f"/>';
  else if (sub == 'tacan') g = '<path d="M1.5 8.6L4.4 3.2L7.3 5.1H10.7L13.6 3.2L16.5 8.6L12.9 12.2V16.3H5.1V12.2Z" class="fr"/><circle cx="9" cy="9.4" r="1.4" class="f"/>';
  else g = '<path d="M5 3.5H13L16.5 9L13 14.5H5L1.5 9Z" class="fr"/><circle cx="9" cy="9" r="1.4" class="f"/>';
  return {w: 18, h: 18, html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"${kind == 'ab' ? ' class="ab"' : ''} style="--c:${color || (kind == 'ab' ? '#e6edf3' : '#6cb6ff')}"><g class="ol">${g}</g>${g}</svg>`};
}
