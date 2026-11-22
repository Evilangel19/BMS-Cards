// @ts-check
// MAGNETIC VARIATION (BMS 4.38: the EGI of the jet adds it to the true heading; the HSI and the DED show magnetic): the grid of the theater,
// <theater>\Weather\MagVarMap_<theater>.csv, read from the BMS folder. Its format: a first line "#<year>", then a table "y\x, 0, 16, ... 1024" of campaign km
// (x = east, y = north), every value the variation in degrees, east positive (Korea about -6 to -10, Balkans +3 to +5). Between the nodes it is
// interpolated (bilinear); outside, the nearest edge.
// Every heading and bearing the pilot reads (legs, attack and ingress headings, turn to, bullseye, MSA sectors) is shown magnetic: magnetic = true - variation.
// What the DED takes as true (the bearings of the NAV OFFSETS, VIP / VRP) and the winds (METAR) stay true. Without the grid the variation is 0.

/** @typedef {{ year: number, x: number[], y: number[], v: number[][] }} MagGrid */

/** @param {string} text the CSV  @returns {MagGrid|null} */
export function parseMagVar(text) {
  const L = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(l => l.trim());
  if (L.length < 4 || !/^\s*#\s*\d+/.test(L[0])) return null;
  const year = parseInt(L[0].replace(/[^\d]/g, ''), 10),
    cells = l =>
      l
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== ''); // the lines end with a comma
  const head = cells(L[1]);
  if (!/^y\\x$/i.test(head[0])) return null;
  const x = head.slice(1).map(Number);
  const y = [],
    v = [];
  for (const l of L.slice(2)) {
    const c = cells(l);
    if (c.length < x.length + 1) continue;
    y.push(Number(c[0]));
    v.push(c.slice(1, x.length + 1).map(Number));
  }
  const fin = a => a.every(n => isFinite(n));
  if (x.length < 2 || y.length < 2 || !fin(x) || !fin(y) || !v.every(fin)) return null;
  for (let i = 1; i < x.length; i++) if (!(x[i] > x[i - 1])) return null;
  for (let i = 1; i < y.length; i++) if (!(y[i] > y[i - 1])) return null;
  return { year, x, y, v };
}

let GRID = /** @type {MagGrid|null} */ (null);
let REF = 0; // the variation of the place of the flight (or of the middle of the theater): the headings of a page that has no position of its own
/** @param {MagGrid|null} g */
export function setMagGrid(g) {
  GRID = g;
  REF = magAt(512, 512);
}
export const magGrid = () => GRID;
// position on an axis: index of the lower node and the fraction to the next one (outside: the edge)
const pos = (a, t) => {
  if (t <= a[0]) return [0, 0];
  if (t >= a[a.length - 1]) return [a.length - 2, 1];
  let i = 0;
  while (i < a.length - 2 && t > a[i + 1]) i++;
  return [i, (t - a[i]) / (a[i + 1] - a[i])];
};
/** the variation (degrees, east positive) at campaign km x (east), y (north); 0 without the grid */
export function magAt(x, y) {
  if (!GRID || !isFinite(x) || !isFinite(y)) return 0;
  const [i, fx] = pos(GRID.x, x),
    [j, fy] = pos(GRID.y, y),
    V = GRID.v,
    lo = V[j][i] + (V[j][i + 1] - V[j][i]) * fx,
    hi = V[j + 1][i] + (V[j + 1][i + 1] - V[j + 1][i]) * fx;
  return lo + (hi - lo) * fy;
}
/** the place of reference (campaign km): the flight chosen; nothing given: the middle of the theater */
export function setMagRef(x, y) {
  REF = isFinite(x) && isFinite(y) ? magAt(x, y) : magAt(512, 512);
}
export const magRef = () => REF;
/** a true heading or bearing (degrees) as the pilot reads it: magnetic, with the variation of the place (campaign km) or of the reference */
export function toMag(deg, x, y) {
  const v = x === undefined || y === undefined ? REF : magAt(x, y);
  return (((deg - v) % 360) + 360) % 360;
}
