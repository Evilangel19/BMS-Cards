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

// Heraldic eagle of the US insignia (spread wings made of feathers, head turned to its left, striped shield on the chest, tail), drawn in a 100 x 60 box and
// centred on (cx, cy) with width w. claws: 'arrows' = olive branch and arrows (colonel's eagle), 'bolts' = lightning bolts (Air Medal), '' = none.
let EC = 0;
const eagleH = (cx, cy, w, fill, edge, claws = '') => {
  const id = 'ec' + (EC++), E = edge || '#000a', f = (L, a) => `<g transform="translate(56 24) rotate(${a})"><path d="M0 -3.2L${L - 4} -4.6Q${L + 1.5} 0 ${L - 4} 4.6L0 3.2Z" fill="${fill}" stroke="${E}" stroke-width=".7" stroke-linejoin="round"/><path d="M2 0H${L - 3}" stroke="${E}" stroke-width=".5" opacity=".6"/></g>`;
  const wing = m => `<g transform="${m < 0 ? 'translate(100 0) scale(-1 1)' : ''}">${[[36, 10], [40, 1], [43, -8], [45, -17], [46, -26], [46, -35], [44, -44]].map(([L, a]) => f(L, a)).join('')}<ellipse cx="60" cy="22" rx="10" ry="6.5" transform="rotate(-18 60 22)" fill="${fill}" stroke="${E}" stroke-width=".7"/></g>`;
  const tail = [-26, -13, 0, 13, 26].map(a => `<g transform="translate(50 47) rotate(${a + 90})"><path d="M0 -2.6L10 -3.4Q12.5 0 10 3.4L0 2.6Z" fill="${fill}" stroke="${E}" stroke-width=".6"/></g>`).join('');
  const shield = 'M41 17H59V36Q59 46 50 50Q41 46 41 36Z';
  const stripes = [0, 1, 2, 3, 4].map(k => `<rect x="${41 + k * 3.6}" y="23" width="3.6" height="30" fill="${k % 2 ? '#0006' : '#fff4'}"/>`).join('');
  const head = `<ellipse cx="50" cy="16" rx="9.5" ry="6" fill="${fill}" stroke="${E}" stroke-width=".7"/><ellipse cx="47.5" cy="9.5" rx="7" ry="6.4" fill="${fill}" stroke="${E}" stroke-width=".7"/><path d="M42 8.2Q33.5 8.6 32.4 16.5Q36.8 12.8 42.5 14Z" fill="${fill}" stroke="${E}" stroke-width=".8" stroke-linejoin="round"/><circle cx="45.6" cy="8.4" r="1.2" fill="${E}"/>`;
  const br = claws == 'arrows' ? `<path d="M36 52Q24 50 12 56" fill="none" stroke="${E}" stroke-width="1.6" stroke-linecap="round"/>${[[30, 52, -25], [24, 52.4, 20], [18, 54, -20], [14, 56, 25]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="1.7" transform="rotate(${a} ${x} ${y})" fill="${fill}" stroke="${E}" stroke-width=".5"/>`).join('')}<g stroke="${E}" stroke-width="1.1" stroke-linecap="round">${[0, 3, 6].map(d => `<path d="M64 ${51 + d * .5}L90 ${54 + d}"/>`).join('')}</g><g fill="${fill}" stroke="${E}" stroke-width=".5">${[0, 3, 6].map(d => `<path d="M90 ${54 + d}l-4 -2.2v4.4z"/>`).join('')}</g>` : claws == 'bolts' ? `<g fill="${fill}" stroke="${E}" stroke-width=".8" stroke-linejoin="round"><path d="M34 46l-9 7h5l-7 7 12-9h-5z"/><path d="M66 46l9 7h-5l7 7-12-9h5z"/></g>` : '';
  const claw = `<g fill="${fill}" stroke="${E}" stroke-width=".6"><path d="M41 49l-1.5 7 3-1.5 1.5 2 1-6z"/><path d="M59 49l1.5 7-3-1.5-1.5 2-1-6z"/></g>`;
  return `<g transform="translate(${cx} ${cy}) scale(${w / 100}) translate(-50 -30)"><defs><clipPath id="${id}"><path d="${shield}"/></clipPath></defs>${wing(1)}${wing(-1)}${tail}${br}${claw}<path d="${shield}" fill="${fill}"/><g clip-path="url(#${id})">${stripes}<rect x="41" y="17" width="18" height="6" fill="#0007"/></g><path d="${shield}" fill="none" stroke="${E}" stroke-width=".9"/>${head}</g>`;
};
// the oak leaf of the major and lieutenant colonel: seven pointed lobes cut like a faceted metal leaf, a short stem (about 33 units high at scale 1)
const leafP = (cx, cy, sc, lit, dark, edge, rot = 0) => {
  const R = 16, r = 11.4, P = (a, rr) => [rr * Math.sin(a * Math.PI / 180), -rr * Math.cos(a * Math.PI / 180)], tips = Array.from({length: 7}, (_, k) => 360 / 7 * (k - 3)).map(a => a), pts = [];
  const step = 360 / 7;
  const sil = [], fac = [];
  tips.forEach((a, k) => { const t = P(a, R), nl = P(a - step / 2, r), nr = P(a + step / 2, r); sil.push(...(k == 0 ? [nl] : []), t, nr); fac.push(`<polygon points="0,0 ${nl.join()} ${t.join()}" fill="${dark}"/><polygon points="0,0 ${t.join()} ${nr.join()}" fill="${lit}"/>`); });
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${sc})"><rect x="-1.7" y="${r - 1}" width="3.4" height="${R + 1 - r + 0.4}" fill="${dark}" stroke="${edge}" stroke-width=".8"/>${fac.join('')}<polygon points="${sil.map(q => q.map(v => v.toFixed(2)).join()).join(' ')}" fill="none" stroke="${edge}" stroke-width="1.1" stroke-linejoin="round"/><path d="${tips.map(a => 'M0 0L' + P(a, R - 1).join()).join('')}" stroke="${edge}" stroke-width=".5" opacity=".55"/></g>`;
};

const BODY = [
  // Air Force Cross: bronze cross with beveled arms, a green laurel wreath and a bronze eagle in the middle
  i => `<g stroke="#fff6" stroke-width=".9" fill="none">${[0, 90, 180, 270].map(a => `<path transform="rotate(${a} 32 64)" d="M32 56V41"/>`).join('')}</g><g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a, 26, 5, 8)).join('')}<rect x="27" y="59" width="10" height="10"/></g>${laurel(32, 64.5, 12.6, '#3d7a3a', 8, 1)}<circle cx="32" cy="64.5" r="9.6" fill="${BRONZE[1]}" stroke="#0007" stroke-width=".8"/>${eagleH(32, 64.5, 17, BRONZE[0], '#3a230f')}`,
  // Silver Star: a gold star with a small laurel wreath and a silver star in the middle
  i => `<polygon points="${star(32, 65, 29, 11.5)}" fill="url(#mg${i})" stroke="#0007" stroke-width="1.2" stroke-linejoin="round"/>${laurel(32, 64.5, 8.2, GOLD[2], 7, .75)}<polygon points="${star(32, 65, 5.3, 2.3)}" fill="${SILVER[0]}" stroke="#0008" stroke-width=".7" stroke-linejoin="round"/>`,
  // Distinguished Flying Cross: a gold cross with rays between the arms and a big four-bladed propeller
  i => `<g stroke="${GOLD[2]}" stroke-width="1.1" opacity=".9">${[45, 135, 225, 315].flatMap(a => [-14, -7, 0, 7, 14].map(d => `<path transform="rotate(${a + d} 32 64)" d="M32 55V${37 + Math.abs(d) * 0.25}"/>`)).join('')}</g><g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a, 28, 4.5, 8)).join('')}<rect x="27.5" y="59.5" width="9" height="9"/></g><g fill="url(#mg${i})" stroke="#4a3208" stroke-width="1" stroke-linejoin="round">${[45, 135, 225, 315].map(a => `<path transform="rotate(${a} 32 64)" d="M32 64C25.5 59 25.5 49 32 42C38.5 49 38.5 59 32 64Z"/>`).join('')}</g><circle cx="32" cy="64" r="2.6" fill="${GOLD[2]}" stroke="#fff8" stroke-width=".6"/>`,
  // Air Medal: a bronze star of twelve rays with an eagle holding lightning bolts
  i => `<polygon points="${star(32, 64, 29, 21, 12, -90)}" fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round"/><circle cx="32" cy="64" r="17" fill="${BRONZE[1]}" opacity=".55"/>${eagleH(32, 64, 30, BRONZE[0], '#3a230f', 'bolts')}`,
  // Korea: a bronze disc with the Korean gate (a gateway with two roofs)
  i => disc(i, `<g fill="${BRONZE[2]}" stroke="#2a1808" stroke-width=".6" stroke-linejoin="round"><path d="M19 57Q32 49.5 45 57L43 59.5H21Z"/><path d="M23 52Q32 46 41 52L39.5 54.5H24.5Z"/><rect x="24" y="59.5" width="16" height="2.4"/><rect x="24" y="62" width="3.4" height="12"/><rect x="36.6" y="62" width="3.4" height="12"/><rect x="21" y="74" width="22" height="2.4"/></g><rect x="28.3" y="62.3" width="7.4" height="11.7" fill="${BRONZE[0]}" opacity=".55"/><path id="kp${i}" d="M14.5 64A17.5 17.5 0 0 1 49.5 64" fill="none"/><text font-size="4.6" font-weight="700" fill="${BRONZE[2]}" letter-spacing=".6" text-anchor="middle" font-family="Georgia,serif"><textPath href="#kp${i}" startOffset="50%">KOREAN SERVICE</textPath></text>`),
  // Longevity: a ribbon bar (the real award is a ribbon only) with an oak leaf cluster of three leaves
  i => `<g transform="translate(0 -4)"><rect x="9" y="52" width="46" height="24" rx="1.5" fill="#0006"/>${stripes(i, 10, 44, 53, 22)}<rect x="9" y="52" width="46" height="24" rx="1.5" fill="none" stroke="#0008" stroke-width="1"/>${[-8, 0, 8].map((dx, k) => leafP(32 + dx, 64, 0.36, SILVER[0], SILVER[1], '#0008', k * 28 - 28)).join('')}</g>`
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
  // oak leaf (major: gold, lieutenant colonel: silver) and the colonel's eagle with olive branch and arrows: shaped after the insignia table, lit and shaded facets
  const leaf = (lit, dark) => leafP(20, 19.5, 1.1, lit, dark, E);
  const eagle = (f) => eagleH(20, 21, 39, f, E, 'arrows');
  const stars = n => Array.from({length: n}, (_, k) => { const sz = n == 1 ? 9 : n == 2 ? 7.4 : n == 3 ? 6 : 4.5, dx = (k - (n - 1) / 2) * sz * 2.15; return `<polygon points="${star(20 + dx, 20.5, sz, sz * .4)}" fill="${S}" stroke="${E}" stroke-width=".8" stroke-linejoin="round"/>`; }).join('');
  const art = [bar(16, G), bar(16, S), bar(8.5, S) + bar(23.5, S), leaf('#f4dc8c', '#b88a26'), leaf('#eef2f6', '#8a96a4'), eagle(S), stars(1), stars(2), stars(3), stars(4)][r];
  return art ? `<svg viewBox="0 0 40 40" width="48" height="48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${defs}${art}</svg>` : '';
}
export {rankSvg};
