// Kneeboard pages: 16 rows, each row = one 2048x2048 DDS (left page | right page, 1024x2048 each).
// Row 1 is 7982.dds ... row 16 is 7997.dds. A page is 800x1200 "page units" stretched onto 1024x2048 (like the datacard).
export const FIRST_ID = 7982,
  ROWS = 16,
  PAGE_W = 1024,
  PAGE_H = 2048,
  UNIT_W = 800,
  UNIT_H = 1200;
export const rowFile = i => FIRST_ID + i + '.dds';
export const DEFAULT_SLOTS = () =>
  Array.from({ length: ROWS }, (_, i) => ({
    left: { kind: i ? 'empty' : 'dcl', mode: 'fill' },
    right: { kind: i ? 'empty' : 'dcr', mode: 'fill' },
  }));
// Rectangle (in texture pixels, inside the 1024x2048 page) where an iw x ih picture is drawn.
// 'fit' keeps the picture proportions inside the page, centred; 'fill' stretches it over the whole page.
export function fitRect(iw, ih, mode) {
  if (mode === 'fill' || !iw || !ih) return { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
  const s = Math.min(UNIT_W / iw, UNIT_H / ih),
    w = (iw * s * PAGE_W) / UNIT_W,
    h = (ih * s * PAGE_H) / UNIT_H;
  return { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, w, h };
}
// Rows that must be written: row 1 always, the others only when a side holds something.
export const rowUsed = (s, i) => i === 0 || s.left.kind !== 'empty' || s.right.kind !== 'empty';
export const autoDir = (join, bms) =>
  bms ? join(join(join(join(bms, 'Data'), 'TerrData'), 'Objects'), 'KoreaObj') : '';
// Order used to cycle a slot: empty, datacard left, datacard right, then the imported pages.
export const cycleList = lib => [
  { kind: 'empty' },
  { kind: 'dcl' },
  { kind: 'dcr' },
  ...lib.map(item => ({ kind: 'pic', item })),
];
export function cycleNext(cur, lib, dir) {
  const L = cycleList(lib),
    i = L.findIndex(o => o.kind === cur.kind && (o.kind !== 'pic' || o.item === cur.item));
  return L[((i < 0 ? 0 : i) + dir + L.length) % L.length];
}
// "1-5, 8, 10-12" -> { pages: [1,2,3,4,5,8,10,11,12] } or { error }. Page numbers start at 1.
export function parsePages(text, total, max = 40) {
  const out = [],
    seen = new Set();
  for (const part of String(text || '')
    .split(/[,;\s]+/)
    .filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return { error: `"${part}" is not a page or a range` };
    let a = +m[1],
      b = m[2] ? +m[2] : a;
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > total) return { error: `pages go from 1 to ${total}` };
    for (let i = a; i <= b; i++)
      if (!seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
  }
  if (!out.length) return { error: 'type at least one page' };
  if (out.length > max) return { error: `at most ${max} pages at a time (you typed ${out.length})` };
  return { pages: out };
}
