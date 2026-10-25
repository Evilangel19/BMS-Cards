// The medals of the logbook (the six counters of the game's logbook editor) and the officer ranks, drawn as small SVG pictures.
// The drawings are simple stylised icons made for this program: they follow the real decorations and insignia of the US Air Force (colours, shapes, ribbons) but are not copies of them.
const GOLD = ['#f3d98a', '#c9992b', '#7a5a14'], SILVER = ['#f1f4f8', '#aab4c0', '#5d6773'], BRONZE = ['#e3b07c', '#a8713d', '#5c3a1b'];
const NAMES = ['Air Force Cross', 'Silver Star', 'Distinguished Flying Cross', 'Air Medal', 'Korea Campaign', 'Longevity'];
const PAL = [BRONZE, GOLD, GOLD, BRONZE, BRONZE, SILVER];
const BLUE = '#1f3c8e', RED = '#cf3b2a', WHITE = '#f4f4f4', ORANGE = '#e0a63a', SKY = '#8fb6dd', MBLUE = '#3f78b8', AMBLUE = '#2a5fb8';

// ribbon stripes: [colour, width in parts] from the left (as in the pictures of the real decorations)
const RIB = [
  [[RED, 2], [WHITE, 1], [SKY, 13], [WHITE, 1], [RED, 2]],                                                           // Air Force Cross: sky blue with white and red edges
  [[BLUE, 1.2], [WHITE, .6], [BLUE, 4], [WHITE, 3.5], [RED, 4.5], [WHITE, 3.5], [BLUE, 4], [WHITE, .6], [BLUE, 1.2]],  // Silver Star
  [[BLUE, 1], [WHITE, 1], [BLUE, 7], [RED, 2.5], [BLUE, 7], [WHITE, 1], [BLUE, 1]],                                  // Distinguished Flying Cross
  [[AMBLUE, 1], [ORANGE, 3.5], [AMBLUE, 9], [ORANGE, 3.5], [AMBLUE, 1]],                                             // Air Medal: blue with golden orange stripes
  [[WHITE, .8], [MBLUE, 8], [WHITE, 2], [MBLUE, 8], [WHITE, .8]],                                                    // Korean Service: blue with a white centre stripe
  [[BLUE, 2], [WHITE, 1], [BLUE, 9], [WHITE, 1], [BLUE, 2]]                                                          // longevity (a ribbon only in the real world)
];

const stripes = (i, x0, w, y, h) => { const tot = RIB[i].reduce((s, r) => s + r[1], 0); let x = x0;
  return RIB[i].map(([c, k]) => { const wx = k / tot * w, r = `<rect x="${x.toFixed(2)}" y="${y}" width="${(wx + 0.05).toFixed(2)}" height="${h}" fill="${c}"/>`; x += wx; return r; }).join(''); };
const ribbon = i => `<g>${stripes(i, 17, 30, 0, 38)}<path d="M17 0H47V38L32 31L17 38Z" fill="none" stroke="#0006" stroke-width="1"/></g>`;
const star = (cx, cy, ro, ri, n = 5, rot = -90) => Array.from({length: n * 2}, (_, k) => { const a = (rot + k * 180 / n) * Math.PI / 180, r = k % 2 ? ri : ro; return (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2); }).join(' ');
const arm = (a, len = 24, w0 = 5, w1 = 8) => `<path transform="rotate(${a} 32 64)" d="M${32 - w0} ${64 - 5}L${32 - w1} ${64 - len}H${32 + w1}L${32 + w0} ${64 - 5}Z"/>`;
const disc = (i, extra = '') => `<circle cx="32" cy="64" r="25" fill="url(#mg${i})" stroke="#0007" stroke-width="1.2"/><circle cx="32" cy="64" r="21.5" fill="none" stroke="#fff6" stroke-width="1"/>${extra}`;
// two laurel branches round a centre: leaves along two arcs, open at the top
const laurel = (cx, cy, r, col, n = 8, ls = 1) => [-1, 1].map(sd => Array.from({length: n}, (_, k) => { const t = Math.PI * (0.14 + k * 0.1), x = cx + sd * r * Math.sin(t), y = cy + r * Math.cos(t); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(3 * ls).toFixed(1)}" ry="${(1.5 * ls).toFixed(1)}" transform="rotate(${(-sd * t * 180 / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${col}"/>`; }).join('')).join('');
// a flat eagle with spread wings (centre x, y; width w)
const eagleP = (cx, cy, w, fill, line) => `<path transform="translate(${cx} ${cy}) scale(${w / 32})" d="M0 -13C1 -13 2 -12 2 -10.5L1.5 -9C6 -11 11 -11 16 -8C14 -6 13 -5 11 -4.5C13 -4 13 -2.5 11.5 -1.5C9 -1 7 -1.5 5 -2C7 -0.5 6 1 4 1L2.5 1.5L3 7L6 11L0 9.5L-6 11L-3 7L-2.5 1.5L-4 1C-6 1 -7 -0.5 -5 -2C-7 -1.5 -9 -1 -11.5 -1.5C-13 -2.5 -13 -4 -11 -4.5C-13 -5 -14 -6 -16 -8C-11 -11 -6 -11 -1.5 -9L-2 -10.5C-2 -12 -1 -13 0 -13Z" fill="${fill}" stroke="${line}" stroke-width="${(1 * 32 / w).toFixed(2)}" stroke-linejoin="round"/>`;
// a lobed oak leaf with a stem, pointing up, centred on (cx, cy), about 36 units high at scale 1
const OAK = 'M0 -18C4 -16 5 -12 3 -10C8 -10 9 -5 5 -3C10 -2 10 4 5 5C7 8 4 13 0 17C-4 13 -7 8 -5 5C-10 4 -10 -2 -5 -3C-9 -5 -8 -10 -3 -10C-5 -12 -4 -16 0 -18Z';
const oak = (cx, cy, s, fill, rot = 0) => `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})"><path d="${OAK}" fill="${fill}" stroke="#0008" stroke-width="${(1 / s).toFixed(2)}" stroke-linejoin="round"/><path d="M0 -14V17M0 6L-4 1M0 6L4 1M0 -1L-3.5 -5M0 -1L3.5 -5" stroke="#0007" stroke-width="${(0.8 / s).toFixed(2)}" fill="none"/><path d="M0 17V21" stroke="#0008" stroke-width="${(1.6 / s).toFixed(2)}" stroke-linecap="round"/></g>`;

const BODY = [
  // Air Force Cross: bronze cross with beveled arms, a green laurel wreath and a bronze eagle in the middle
  i => `<g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a, 26, 5, 8)).join('')}<rect x="27" y="59" width="10" height="10"/></g><g stroke="#fff6" stroke-width=".9" fill="none">${[0, 90, 180, 270].map(a => `<path transform="rotate(${a} 32 64)" d="M32 56V41"/>`).join('')}</g>${laurel(32, 64.5, 11.5, '#3d7a3a', 7, .9)}<circle cx="32" cy="64.5" r="8.4" fill="${BRONZE[1]}" stroke="#0007" stroke-width=".8"/>${eagleP(32, 65, 13, BRONZE[0], '#3a230f')}`,
  // Silver Star: a gold star with a small laurel wreath and a silver star in the middle
  i => `<polygon points="${star(32, 65, 29, 11.5)}" fill="url(#mg${i})" stroke="#0007" stroke-width="1.2" stroke-linejoin="round"/>${laurel(32, 64.5, 8.2, GOLD[2], 7, .75)}<polygon points="${star(32, 65, 5.3, 2.3)}" fill="${SILVER[0]}" stroke="#0008" stroke-width=".7" stroke-linejoin="round"/>`,
  // Distinguished Flying Cross: a gold cross with rays between the arms and a big four-bladed propeller
  i => `<g stroke="${GOLD[2]}" stroke-width="1.1" opacity=".9">${[45, 135, 225, 315].flatMap(a => [-14, -7, 0, 7, 14].map(d => `<path transform="rotate(${a + d} 32 64)" d="M32 55V${37 + Math.abs(d) * 0.25}"/>`)).join('')}</g><g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a, 28, 4.5, 8)).join('')}<rect x="27.5" y="59.5" width="9" height="9"/></g><g fill="url(#mg${i})" stroke="#4a3208" stroke-width="1" stroke-linejoin="round">${[45, 135, 225, 315].map(a => `<path transform="rotate(${a} 32 64)" d="M32 64C25.5 59 25.5 49 32 42C38.5 49 38.5 59 32 64Z"/>`).join('')}</g><circle cx="32" cy="64" r="2.6" fill="${GOLD[2]}" stroke="#fff8" stroke-width=".6"/>`,
  // Air Medal: a bronze star of twelve rays with an eagle holding lightning bolts
  i => `<polygon points="${star(32, 64, 29, 21, 12, -90)}" fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round"/>${eagleP(32, 62, 28, BRONZE[0], '#3a230f')}<path d="M24 74L29 67L27 67L32 60M40 74L35 67L37 67L32 60" fill="none" stroke="${BRONZE[2]}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
  // Korea: a bronze disc with the Korean gate (a gateway with two roofs)
  i => disc(i, `<g fill="${BRONZE[2]}" stroke="#2a1808" stroke-width=".6" stroke-linejoin="round"><path d="M19 57Q32 49.5 45 57L43 59.5H21Z"/><path d="M23 52Q32 46 41 52L39.5 54.5H24.5Z"/><rect x="24" y="59.5" width="16" height="2.4"/><rect x="24" y="62" width="3.4" height="12"/><rect x="36.6" y="62" width="3.4" height="12"/><rect x="21" y="74" width="22" height="2.4"/></g><rect x="28.3" y="62.3" width="7.4" height="11.7" fill="${BRONZE[0]}" opacity=".55"/>`),
  // Longevity: a ribbon bar (the real award is a ribbon only) with an oak leaf cluster of three leaves
  i => `<g transform="translate(0 -4)"><rect x="9" y="52" width="46" height="24" rx="1.5" fill="#0006"/>${stripes(i, 10, 44, 53, 22)}<rect x="9" y="52" width="46" height="24" rx="1.5" fill="none" stroke="#0008" stroke-width="1"/>${[-7, 0, 7].map((dx, k) => oak(32 + dx, 64, 0.34, SILVER[0], k * 25 - 25)).join('')}</g>`
];

const grad = (i, p) => `<linearGradient id="mg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset=".55" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient>`;
// ids are made unique with `uid` so that several pictures can live in one page
export function medalSvg(i, uid = '') {
  if (!(i >= 0 && i < NAMES.length)) return '';
  const g = grad(i, PAL[i]).replace(/id="mg(\d)"/, `id="mg${i}${uid}"`), body = BODY[i](i).replace(/url\(#mg(\d)\)/g, `url(#mg$1${uid})`);
  return `<svg viewBox="0 0 64 100" width="64" height="100" role="img" aria-label="${NAMES[i]}" xmlns="http://www.w3.org/2000/svg"><defs>${g}</defs>${i == 5 ? '' : ribbon(i) + '<circle cx="32" cy="38" r="3.2" fill="#9aa4b0" stroke="#0007" stroke-width=".8"/>'}${body}</svg>`;
}
export const medalNames = () => NAMES.slice();

// Officer rank insignia of the US Air Force (second lieutenant ... general): gold bar, silver bar, two silver bars, gold oak leaf, silver oak leaf, silver eagle, one to four silver stars.
// Drawn from scratch after the insignia table of the DoD pay grades: lit metal (gradient), dark edge
let RK = 0;
function rankSvg(r) {
  const id = 'rk' + (RK++), met = (c, k) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  const defs = `<defs>${met(GOLD, 'g')}${met(SILVER, 's')}</defs>`, G = `url(#${id}g)`, S = `url(#${id}s)`, E = '#0009';
  const bar = (x, f) => `<rect x="${x}" y="7" width="8" height="26" rx="1" fill="${f}" stroke="${E}" stroke-width=".9"/><rect x="${x + 1.2}" y="8.2" width="2" height="23.6" fill="#fff6"/>`;
  // oak leaf: three rounded lobes on each side, two acorns on the stem; the outline is the union of the shapes (dark pass below the fill pass)
  const leaf = f => {
    const sh = [['ellipse', 0, -1, 4.4, 13], ['circle', 0, -12.6, 3.3], ...[-1, 1].flatMap(m => [['circle', m * 5.2, -8.6, 3.5], ['circle', m * 6.4, -2.2, 4], ['circle', m * 5.4, 4.6, 3.4]])];
    const el = (a, k) => a[0] == 'circle' ? `<circle cx="${a[1]}" cy="${a[2]}" r="${a[3] + k}"/>` : `<ellipse cx="${a[1]}" cy="${a[2]}" rx="${a[3] + k}" ry="${a[4] + k}"/>`;
    const ac = [-1, 1].map(m => `<ellipse cx="${m * 3.6}" cy="15.2" rx="2.2" ry="2.8"/>`).join('');
    return `<g transform="translate(20 18) scale(.98)"><g fill="${E}" stroke="${E}" stroke-width="1.6">${sh.map(a => el(a, .5)).join('')}${ac}<path d="M0 8V15" /></g><g fill="${f}">${sh.map(a => el(a, 0)).join('')}${ac}</g><path d="M0 9.5V17" stroke="${E}" stroke-width="1.2"/><g stroke="${E}" stroke-width=".8" fill="none" opacity=".75"><path d="M0 -14V10"/><path d="M0 6L-5 3M0 6L5 3M0 -1L-5.5 -4M0 -1L5.5 -4M0 -7L-4 -9M0 -7L4 -9"/></g><g fill="#0006">${[-1, 1].map(m => `<path d="M${m * 3.6 - 2.2} 14.6a2.2 1.6 0 0 1 4.4 0z"/>`).join('')}</g></g>`;
  };
  // eagle with spread wings, head turned to its left, shield on the chest, tail fan
  const eagle = f => {
    const wing = m => `<path transform="scale(${m} 1)" d="M3 -8C8 -13 15 -13 19.5 -8.5L18.2 -5.3L19.6 -3L16.6 -1.6L17.2 1.2L13.6 1L13.4 3.8L9.6 2.4L5 3.4Z"/>`;
    const vein = m => `<path transform="scale(${m} 1)" d="M6 -5L17 -6.5M6 -2.5L15.5 -2.4M6 0L13 0.4" stroke="${E}" stroke-width=".7" fill="none" opacity=".7"/>`;
    const body = `<path d="M-2.6 -8.4C-4.6 -5 -4.4 0 -3.3 4L-4.8 8.6L-2.2 7.7L-1 11.2L0 8.6L1 11.2L2.2 7.7L4.8 8.6L3.3 4C4.4 0 4.6 -5 2.6 -8.4Z"/><circle cx="-0.4" cy="-11.4" r="2.9"/><path d="M-2.7 -12.4L-6.3 -10.9L-2.9 -10Z"/>`;
    return `<g transform="translate(20 21.5) scale(.98)"><g fill="${E}" stroke="${E}" stroke-width="1.5" stroke-linejoin="round">${wing(1)}${wing(-1)}${body}</g><g fill="${f}">${wing(1)}${wing(-1)}${body}</g>${vein(1)}${vein(-1)}<path d="M-2.4 -3.4H2.4V1.4Q0 3.8 -2.4 1.4Z" fill="#0007"/><path d="M-0.1 -11.9L-1 -12.6" stroke="#0008" stroke-width=".8"/></g>`;
  };
  const stars = n => Array.from({length: n}, (_, k) => { const sz = n == 1 ? 9 : n == 2 ? 7.4 : n == 3 ? 6 : 4.5, dx = (k - (n - 1) / 2) * sz * 2.15; return `<polygon points="${star(20 + dx, 20.5, sz, sz * .4)}" fill="${S}" stroke="${E}" stroke-width=".8" stroke-linejoin="round"/>`; }).join('');
  const art = [bar(16, G), bar(16, S), bar(8.5, S) + bar(23.5, S), leaf(G), leaf(S), eagle(S), stars(1), stars(2), stars(3), stars(4)][r];
  return art ? `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${defs}${art}</svg>` : '';
}
export {rankSvg};
