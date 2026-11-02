// Minimum safe altitudes from the terrain (pure: the heights come in through a function, nothing is read here).
// Three values, all information only (they never raise an alert: a low-level route is below them by design):
//  - route MSA (USAF, AFMAN 11-202V3 12.12.6): highest terrain within 5 NM of the centreline of a leg + 500 ft, up to 100 ft
//  - ERAA (same manual): highest terrain within 22 NM of the whole route + 1,000 ft, or + 2,000 ft in mountainous terrain (relief of 500 ft or more in 0.5 NM)
//  - airbase / navaid MSA (civil IFR sectors): highest terrain within 25 NM of the point + 1,000 ft, up to 100 ft, in 1 to 4 sectors
// Positions are BMS feet {n, e} (north / east), heights are feet.
//
// The terrain is read on a grid of 1 km cells (like the radar coverage does with its cells): a cell holds the highest of a few samples taken along the row of the
// height map that crosses it. The cells of one row of the grid are in the same row of the file, so one read serves all of them, and a cell that was read once is
// kept (`cache`), so the next flight, or an airbase on the same ground, costs nothing.
export const NMFT = 6076.12;
export const VFR_HALF = 5, // NM each side of the centreline
  VFR_ADD = 500,
  ERAA_HALF = 22,
  ERAA_ADD = 1000,
  ERAA_ADD_MTN = 2000,
  IFR_RADIUS = 25,
  IFR_ADD = 1000,
  MTN_RELIEF = 500, // ft
  MTN_SHARE = 0.05; // part of the neighbouring cells (1 km, about 0.5 NM) that must differ by MTN_RELIEF for the area to count as mountainous
export const CELL = 3280.84; // 1 km in feet: the size of a cell
const OFFS = [-0.375, -0.125, 0.125, 0.375]; // samples along the row of a cell, in cells
const CHUNK = 6000; // cells per call of the reader

// up to the next 100 ft (a tiny tolerance keeps 2,300.0000001 at 2,300)
export const up100 = v => Math.ceil(v / 100 - 1e-6) * 100;
export const vfrMsa = maxFt => up100(maxFt + VFR_ADD);
export const eraaAlt = (maxFt, mountainous) => up100(maxFt + (mountainous ? ERAA_ADD_MTN : ERAA_ADD));
export const ifrMsa = maxFt => up100(maxFt + IFR_ADD);

const key = (i, j) => i + ',' + j;
const num = v => (v === null || v === undefined || !isFinite(v) ? null : v);

/**
 * Reads the cells that are not in the cache yet: `cells` = [[i, j]], the centre of a cell is (e = i * CELL, n = j * CELL).
 * Returns false when there is no terrain data. The cells are asked in the order of the rows (j), so a call of the reader holds whole rows.
 */
export async function loadCells(elev, cells, cache, progress) {
  const todo = cells.filter(([i, j]) => !cache.has(key(i, j))).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (let o = 0; o < todo.length; o += CHUNK) {
    const part = todo.slice(o, o + CHUNK),
      pts = [];
    part.forEach(([i, j]) => OFFS.forEach(d => pts.push({ e: (i + d) * CELL, n: j * CELL })));
    const h = await elev(pts);
    if (!h) return false;
    part.forEach(([i, j], k) => {
      let m = null;
      for (let q = 0; q < OFFS.length; q++) {
        const v = num(h[k * OFFS.length + q]);
        if (v !== null && (m === null || v > m)) m = v;
      }
      cache.set(key(i, j), m);
    });
    if (progress) progress(Math.min(1, (o + CHUNK) / todo.length));
  }
  return true;
}
const hAt = (cache, i, j) => {
  const v = cache.get(key(i, j));
  return v === undefined ? null : v;
};

// distance (feet) from a point to the segment a-b
function distSeg(p, a, b) {
  const dx = b.e - a.e,
    dy = b.n - a.n,
    L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.e - a.e) * dx + (p.n - a.n) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.e - (a.e + t * dx), p.n - (a.n + t * dy));
}

/**
 * The MSA of every leg of a route and the ERAA of the whole route.
 * @param {(pts: {n:number,e:number}[]) => Promise<(number|null)[]|null>} elev heights of points (null = no terrain data)
 * @param {{n:number,e:number}[]} route the steerpoints
 * @param {{cache?: Map<string, number|null>, progress?: (p:number)=>void}} [opt]
 * @returns {Promise<null | {legs: (number|null)[], eraa: number|null, mountainous: boolean, maxFt: number}>}
 *   legs[i] = MSA of the leg that ends at steerpoint i (legs[0] = null)
 */
export async function routeMsa(elev, route, opt) {
  if (!route || route.length < 2) return null;
  const cache = (opt && opt.cache) || new Map(),
    RIN = VFR_HALF * NMFT,
    ROUT = ERAA_HALF * NMFT,
    inner = [], // per leg: the cells within 5 NM
    innerAll = new Map(),
    outer = new Map(); // cells within 22 NM, one in four (2 km) beyond the 5 NM
  for (let k = 0; k + 1 < route.length; k++) {
    const a = route[k],
      b = route[k + 1],
      i0 = Math.floor((Math.min(a.e, b.e) - ROUT) / CELL),
      i1 = Math.ceil((Math.max(a.e, b.e) + ROUT) / CELL),
      j0 = Math.floor((Math.min(a.n, b.n) - ROUT) / CELL),
      j1 = Math.ceil((Math.max(a.n, b.n) + ROUT) / CELL),
      mine = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const d = distSeg({ e: i * CELL, n: j * CELL }, a, b);
        if (d <= RIN) {
          mine.push([i, j]);
          innerAll.set(key(i, j), [i, j]);
        } else if (d <= ROUT && i % 2 === 0 && j % 2 === 0) outer.set(key(i, j), [i, j]);
      }
    inner.push(mine);
  }
  const all = [...innerAll.values(), ...[...outer.values()].filter(c => !innerAll.has(key(c[0], c[1])))];
  if (!(await loadCells(elev, all, cache, opt && opt.progress))) return null;
  let maxAll = -Infinity,
    got = 0;
  const legs = [null];
  inner.forEach(cells => {
    let m = -Infinity;
    for (const [i, j] of cells) {
      const v = hAt(cache, i, j);
      if (v !== null) {
        got++;
        if (v > m) m = v;
      }
    }
    legs.push(m === -Infinity ? null : vfrMsa(Math.max(0, m)));
    if (m > maxAll) maxAll = m;
  });
  for (const [i, j] of outer.values()) {
    const v = hAt(cache, i, j);
    if (v !== null && v > maxAll) maxAll = v;
  }
  if (!got) return null;
  // relief: neighbouring cells of the 5 NM strips (1 km apart, about the 0.5 NM of the definition)
  let steep = 0,
    pairs = 0;
  for (const [i, j] of innerAll.values()) {
    const h = hAt(cache, i, j);
    if (h === null) continue;
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      if (!innerAll.has(key(i + di, j + dj))) continue;
      const g = hAt(cache, i + di, j + dj);
      if (g === null) continue;
      pairs++;
      if (Math.abs(h - g) >= MTN_RELIEF) steep++;
    }
  }
  const mountainous = pairs > 0 && steep / pairs >= MTN_SHARE;
  return { legs, eraa: eraaAlt(Math.max(0, maxAll), mountainous), mountainous, maxFt: maxAll };
}

// ---- sectors of an airbase / navaid (civil IFR) ----
export const NB = 72; // bins of 5 degrees
export const MIN_BINS = 9; // a sector is at least 45 degrees
export const SECTOR_COST = 3000; // what one more sector must save (ft x bins) to be worth it
export const MAX_SECTORS = 4;

/**
 * The highest terrain of each bin of 5 degrees (clockwise from north) within 25 NM of c, from the cells of the grid; the cell of the point counts in every bin.
 * @returns {Promise<number[]|null>} null when there is no terrain data
 */
export async function baseBins(elev, c, c0, opt) {
  const cache = (opt && opt.cache) || new Map(),
    R = IFR_RADIUS * NMFT,
    ci = Math.round(c.e / CELL),
    cj = Math.round(c.n / CELL),
    n = Math.ceil(R / CELL) + 1,
    cells = [];
  for (let i = ci - n; i <= ci + n; i++)
    for (let j = cj - n; j <= cj + n; j++) if (Math.hypot(i * CELL - c.e, j * CELL - c.n) <= R) cells.push([i, j]);
  if (!(await loadCells(elev, cells, cache))) return null;
  const out = new Array(NB).fill(Math.max(0, c0 || 0));
  let got = 0;
  for (const [i, j] of cells) {
    const v = hAt(cache, i, j);
    if (v === null) continue;
    got++;
    const de = i * CELL - c.e,
      dn = j * CELL - c.n;
    if (Math.hypot(de, dn) < CELL * 0.75) {
      for (let b = 0; b < NB; b++) if (v > out[b]) out[b] = v; // the ground of the point itself
      continue;
    }
    const b = Math.floor((((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360) / 5) % NB;
    if (v > out[b]) out[b] = v;
  }
  return got ? out : null;
}

/**
 * The best division of the circle in 1 to 4 sectors: the sectors are cut where the highest terrain changes, so that every sector is not much higher than its terrain.
 * @param {number[]} bm highest terrain of the NB bins (clockwise from north, bin 0 = 0-5 degrees)
 * @returns {{ from:number, to:number, max:number, msa:number }[]} sectors in degrees (true, clockwise, from < to, to may exceed 360)
 */
export function sectors(bm) {
  const mx = new Array(NB * 2).fill(0);
  for (let i = 0; i < NB * 2; i++) mx[i] = bm[i % NB];
  // one sector s..e-1: [cost, highest]; cost = how far its highest terrain is above each bin
  const total = (s, e) => {
    let m = 0,
      sum = 0;
    for (let b = s; b < e; b++) {
      if (mx[b] > m) m = mx[b];
      sum += mx[b];
    }
    return [m * (e - s) - sum, m];
  };
  const one = total(0, NB);
  let best = { score: one[0] + SECTOR_COST, cuts: [[0, NB]], maxes: [one[1]] };
  for (let s0 = 0; s0 < NB; s0++) {
    // cost table of the sectors i..j-1 of the bins s0 .. s0 + NB
    const C = [];
    for (let i = 0; i <= NB; i++) {
      const row = new Array(NB + 1).fill(Infinity);
      let m = 0,
        sum = 0;
      for (let j = i + 1; j <= NB; j++) {
        const v = mx[s0 + j - 1];
        if (v > m) m = v;
        sum += v;
        if (j - i >= MIN_BINS) row[j] = m * (j - i) - sum;
      }
      C.push(row);
    }
    const f = [new Array(NB + 1).fill(Infinity)],
      bk = [new Array(NB + 1).fill(-1)];
    f[0][0] = 0;
    for (let q = 1; q <= MAX_SECTORS; q++) {
      const fq = new Array(NB + 1).fill(Infinity),
        bq = new Array(NB + 1).fill(-1);
      for (let j = MIN_BINS * q; j <= NB; j++)
        for (let i = MIN_BINS * (q - 1); i <= j - MIN_BINS; i++) {
          if (f[q - 1][i] === Infinity) continue;
          const v = f[q - 1][i] + C[i][j];
          if (v < fq[j]) {
            fq[j] = v;
            bq[j] = i;
          }
        }
      f.push(fq);
      bk.push(bq);
      if (q < 2 || fq[NB] === Infinity) continue;
      const score = fq[NB] + SECTOR_COST * q;
      if (score < best.score) {
        const cuts = [];
        let j = NB;
        for (let r = q; r >= 1; r--) {
          const i = bk[r][j];
          cuts.unshift([s0 + i, s0 + j]);
          j = i;
        }
        best = { score, cuts, maxes: cuts.map(([a, b]) => total(a, b)[1]) };
      }
    }
  }
  return best.cuts.map(([a, b], i) => ({ from: a * 5, to: b * 5, max: best.maxes[i], msa: ifrMsa(best.maxes[i]) }));
}

/** the sectors of a position: reads the terrain through `elev` (null when there is no terrain data) */
export async function baseMsa(elev, c, c0, opt) {
  const bm = await baseBins(elev, c, c0, opt);
  return bm ? sectors(bm) : null;
}

// the bearing a pilot reads: from the sector edge towards the reference point (inbound), magnetic = true - variation (east positive)
export const inbound = (deg, magvar) => (((deg + 180 - (magvar || 0)) % 360) + 360) % 360;
