// The medals of the logbook (the six counters of the game's logbook editor) and the officer ranks, drawn as small SVG pictures.
// The drawings are simple original icons made for this program (ribbon + medal, bars, leaves, stars): they only suggest the kind of decoration, they are not copies of the official insignia.
const GOLD = ['#f3d98a', '#c9992b', '#7a5a14'], SILVER = ['#f1f4f8', '#aab4c0', '#5d6773'], BRONZE = ['#e3b07c', '#a8713d', '#5c3a1b'];

// ribbon stripes: [colour, width in 1/24 parts] from the left
const RIB = [
  [['#1b3a8c', 6], ['#fff', 1.5], ['#c0272d', 1.5], ['#fff', 1.5], ['#1b3a8c', 6]],
  [['#c0272d', 4], ['#fff', 2], ['#1b3a8c', 8], ['#fff', 2], ['#c0272d', 4]],
  [['#1b3a8c', 5], ['#fff', 1.5], ['#c0272d', 3], ['#fff', 1.5], ['#c0272d', 3], ['#fff', 1.5], ['#1b3a8c', 5]],
  [['#1b3a8c', 5], ['#e8892b', 7], ['#1b3a8c', 5]],
  [['#fff', 2], ['#6fb4e6', 8], ['#fff', 2], ['#6fb4e6', 8], ['#fff', 2]],
  [['#3d7a4a', 7], ['#fff', 2], ['#3d7a4a', 6], ['#fff', 2], ['#3d7a4a', 7]]
];
const NAMES = ['Air Force Cross', 'Silver Star', 'Distinguished Flying Cross', 'Air Medal', 'Korea Campaign', 'Longevity'];
const PAL = [GOLD, SILVER, BRONZE, BRONZE, GOLD, SILVER];

const ribbon = i => { const tot = RIB[i].reduce((s, r) => s + r[1], 0); let x = 17;
  return `<g>${RIB[i].map(([c, w]) => { const wx = w / tot * 30, r = `<rect x="${x.toFixed(2)}" y="0" width="${(wx + 0.05).toFixed(2)}" height="38" fill="${c}"/>`; x += wx; return r; }).join('')}<path d="M17 0H47V38L32 31L17 38Z" fill="none" stroke="#0006" stroke-width="1"/></g>`; };
const star = (cx, cy, ro, ri, n = 5, rot = -90) => Array.from({length: n * 2}, (_, k) => { const a = (rot + k * 180 / n) * Math.PI / 180, r = k % 2 ? ri : ro; return (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2); }).join(' ');
const arm = (a, len = 24, w0 = 5, w1 = 8) => `<path transform="rotate(${a} 32 64)" d="M${32 - w0} ${64 - 5}L${32 - w1} ${64 - len}H${32 + w1}L${32 + w0} ${64 - 5}Z"/>`;
const disc = (i, extra = '') => `<circle cx="32" cy="64" r="25" fill="url(#mg${i})" stroke="#0007" stroke-width="1.2"/><circle cx="32" cy="64" r="21.5" fill="none" stroke="#fff6" stroke-width="1"/>${extra}`;

const BODY = [
  // Air Force Cross: cross with flared arms
  i => `<g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a)).join('')}<rect x="27" y="59" width="10" height="10"/></g><circle cx="32" cy="64" r="6" fill="${GOLD[2]}" stroke="#fff8" stroke-width="1"/>`,
  // Silver Star: five-pointed star with a disc in the middle
  i => `<polygon points="${star(32, 65, 28, 11.5)}" fill="url(#mg${i})" stroke="#0007" stroke-width="1.2" stroke-linejoin="round"/><circle cx="32" cy="65" r="7" fill="${SILVER[1]}" stroke="#0007" stroke-width="1"/><polygon points="${star(32, 65, 5, 2, 5)}" fill="#fff"/>`,
  // Distinguished Flying Cross: cross over rays
  i => `<g stroke="${BRONZE[2]}" stroke-width="1.4" opacity=".85">${[45, 135, 225, 315].map(a => `<path transform="rotate(${a} 32 64)" d="M32 64V36"/>`).join('')}</g><g fill="url(#mg${i})" stroke="#0007" stroke-width="1.1" stroke-linejoin="round">${[0, 90, 180, 270].map(a => arm(a, 27, 4, 7)).join('')}<rect x="28" y="60" width="8" height="8"/></g><circle cx="32" cy="64" r="4" fill="${BRONZE[2]}"/>`,
  // Air Medal: disc with a pair of wings
  i => disc(i, `<path d="M32 60C25 54 15 55 9.5 62C17 60.5 24 62 32 67C40 62 47 60.5 54.5 62C49 55 39 54 32 60Z" fill="${BRONZE[2]}" stroke="#fff7" stroke-width=".8"/><path d="M32 56V76" stroke="${BRONZE[2]}" stroke-width="2.4" stroke-linecap="round"/>`),
  // Korea Campaign: disc with sun over a mountain
  i => disc(i, `<circle cx="32" cy="55" r="5" fill="${GOLD[2]}"/><path d="M13 78L25 60L31 69L38 58L51 78Z" fill="${GOLD[2]}" stroke="#fff7" stroke-width=".8" stroke-linejoin="round"/>`),
  // Longevity: disc with a laurel wreath and a star
  i => disc(i, [-1, 1].map(sd => Array.from({length: 7}, (_, k) => { const x = 32 + sd * 14 * Math.sin(k * 0.42 + 0.35), y = 80 - k * 4.1; return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.6" ry="1.5" transform="rotate(${(sd * (-35 - k * 7)).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${SILVER[2]}"/>`; }).join('')).join('') + `<polygon points="${star(32, 63, 8, 3.4)}" fill="${SILVER[2]}"/>`)
];

const grad = (i, p) => `<linearGradient id="mg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset=".55" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient>`;
// ids are made unique with `uid` so that several pictures can live in one page
export function medalSvg(i, uid = '') {
  if (!(i >= 0 && i < NAMES.length)) return '';
  const g = grad(i, PAL[i]).replace(/id="mg(\d)"/, `id="mg${i}${uid}"`), body = BODY[i](i).replace(/url\(#mg(\d)\)/g, `url(#mg$1${uid})`);
  return `<svg viewBox="0 0 64 100" width="64" height="100" role="img" aria-label="${NAMES[i]}" xmlns="http://www.w3.org/2000/svg"><defs>${g}</defs>${ribbon(i)}<circle cx="32" cy="38" r="3.2" fill="#9aa4b0" stroke="#0007" stroke-width=".8"/>${body}</svg>`;
}
export const medalNames = () => NAMES.slice();

// Officer rank insignia (second lieutenant ... general): gold bar, silver bar, two bars, gold leaf, silver leaf, eagle, one to four stars
export function rankSvg(r) {
  const bar = (x, c) => `<rect x="${x}" y="9" width="6" height="22" rx="1" fill="${c}" stroke="#0007" stroke-width=".8"/>`;
  const leaf = c => `<path d="M20 5C32 6 36 18 33 30C28 37 19 36 10 30C5 20 9 7 20 5Z" fill="${c}" stroke="#0007" stroke-width=".9"/><path d="M20 8V33" stroke="#0007" stroke-width=".8"/>`;
  const eagle = `<path d="M20 8L24 14L36 10C33 18 31 22 25 24L26 33L20 30L14 33L15 24C9 22 7 18 4 10L16 14Z" fill="${SILVER[1]}" stroke="#0007" stroke-width=".9" stroke-linejoin="round"/>`;
  const stars = n => Array.from({length: n}, (_, k) => `<polygon points="${star(20 + (k - (n - 1) / 2) * (n == 4 ? 9 : n == 3 ? 11 : 13), 20, n == 4 ? 4.8 : n == 3 ? 6.2 : 8, n == 4 ? 2 : n == 3 ? 2.6 : 3.2)}" fill="${SILVER[0]}" stroke="#0007" stroke-width=".7"/>`).join('');
  const art = [bar(17, GOLD[1]), bar(17, SILVER[1]), bar(11, SILVER[1]) + bar(23, SILVER[1]), leaf(GOLD[1]), leaf(SILVER[1]), eagle, stars(1), stars(2), stars(3), stars(4)][r];
  return art ? `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${art}</svg>` : '';
}
