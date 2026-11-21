// Minimum safe altitudes from the terrain (pure: the heights come in through a function, nothing is read here).
// Three values, all information only (they never raise an alert: a low-level route is below them by design):
//  - route MSA (USAF, AFMAN 11-202V3 12.12.6): highest terrain within 5 NM of the centreline of a leg + 500 ft, up to 100 ft
//  - ERAA (same manual): highest terrain within 22 NM of the whole route + 1,000 ft, or + 2,000 ft in mountainous terrain (relief of 500 ft or more in 0.5 NM)
//  - airbase / navaid MSA (civil IFR sectors): highest terrain within 25 NM of the point + 1,000 ft, up to 100 ft, in 1 to 4 sectors
// Positions are BMS feet {n, e} (north / east), heights are feet.
//
// The terrain is read in two passes. First on a grid of 1 km cells (like the radar coverage does with its cells): a cell holds the highest of a few samples taken
// along the row of the height map that crosses it. The cells of one row of the grid are in the same row of the file, so one read serves all of them, and a cell
// that was read once is kept (`cache`), so the next flight, or an airbase on the same ground, costs nothing. A peak between two of those rows would be missed,
// so then the cells that may hold the highest ground (their coarse highest plus what their slope may hide, `hidden`, above the highest found, for each leg, the whole
// route or each bin of an airbase) are read
// again whole, a sample every FINE_STEP of the cell (about 60 m, every second sample of the height map): the result is the one of a full reading, for a small part
// of its cost. The fine highest of a cell is kept too (key "f" + cell).
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
export const FINE_N = 16, // the fine pass: FINE_N x FINE_N samples in a cell (1 km / 16 = 62.5 m)
  FINE_MARGIN = 2000, // ft: the most a cell may hide above its coarse highest
  FINE_CHUNK = 64; // cells per call of the reader in the fine pass
// how much higher than its coarse highest a cell may be: the steepest step to its neighbours (a slope that goes on for the half km between the row of samples and
// the edge of the cell is half of it: twice that for safety), at most
// FINE_MARGIN; flat ground hides nothing. A cell is read again whole when its coarse highest plus that could beat the highest found.
const hidden = (cache, i, j) => {
  const h = hAt(cache, i, j);
  if (h === null) return 0;
  let d = 0;
  for (const [a, b] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const g = hAt(cache, i + a, j + b);
    if (g !== null) d = Math.max(d, Math.abs(h - g));
  }
  return Math.min(FINE_MARGIN, d);
};
// the most a cell may hold: its coarse highest and what its slope may hide
const bound = (cache, i, j) => {
  const v = hAt(cache, i, j);
  return v === null ? -Infinity : v + hidden(cache, i, j);
};
const TOP_BATCH = 8; // cells read finely at a time at first, highest bound first (then twice as many each time, up to FINE_CHUNK)
/**
 * The fine pass of groups of cells (the legs and the whole route; the bins of an airbase), highest bound first: the cells are read whole a batch at a time, and
 * it stops as soon as no cell left may beat the highest found of its group (branch and bound): on most ground a handful of cells is read, in a few calls.
 * groups: [{items: [{c: [i, j], ub}], top}] (top: the highest known; a cell may be in several groups). Returns false when there is no terrain data.
 */
async function topDown(elev, cache, groups) {
  const fineOf = c => {
    const f = cache.get('f' + key(c[0], c[1]));
    return f === undefined ? undefined : f;
  };
  for (const g of groups)
    for (const it of g.items) {
      const f = fineOf(it.c);
      if (f !== undefined && f !== null && f > g.top) g.top = f;
    }
  let batch = TOP_BATCH;
  for (;;) {
    const want = new Map(); // key -> {c, ub}: the cells not read finely that may still beat the top of one of their groups
    for (const g of groups)
      for (const it of g.items)
        if (it.ub > g.top && fineOf(it.c) === undefined) {
          const k = key(it.c[0], it.c[1]),
            w = want.get(k);
          if (!w || w.ub < it.ub) want.set(k, it);
        }
    if (!want.size) return true;
    const part = [...want.values()]
      .sort((a, b) => b.ub - a.ub)
      .slice(0, batch)
      .map(it => it.c);
    batch = Math.min(batch * 2, FINE_CHUNK);
    if (!(await fineCells(elev, part, cache))) return false;
    for (const g of groups)
      for (const it of g.items) {
        const v = best(cache, it.c[0], it.c[1]);
        if (v !== null && v > g.top) g.top = v;
      }
  }
}

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
// the highest ground of a cell: the fine pass when it was read, else the coarse one
const best = (cache, i, j) => {
  const f = cache.get('f' + key(i, j));
  return f === undefined || f === null ? hAt(cache, i, j) : f;
};
/**
 * The fine pass: the cells (that are not read finely yet) read whole, FINE_N x FINE_N samples; their highest (and the coarse one, if higher) kept as "f" + cell.
 * The reader is asked with fine = true (short pieces of the rows). Returns false when there is no terrain data.
 */
export async function fineCells(elev, cells, cache) {
  const todo = [];
  const seen = new Set();
  for (const [i, j] of cells) {
    const k = key(i, j);
    if (seen.has(k) || cache.has('f' + k)) continue;
    seen.add(k);
    todo.push([i, j]);
  }
  todo.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const n2 = FINE_N * FINE_N;
  for (let o = 0; o < todo.length; o += FINE_CHUNK) {
    const part = todo.slice(o, o + FINE_CHUNK),
      pts = [];
    part.forEach(([i, j]) => {
      for (let a = 0; a < FINE_N; a++)
        for (let b = 0; b < FINE_N; b++)
          pts.push({ e: (i - 0.5 + (b + 0.5) / FINE_N) * CELL, n: (j - 0.5 + (a + 0.5) / FINE_N) * CELL });
    });
    const h = await elev(pts, true);
    if (!h) return false;
    part.forEach(([i, j], k) => {
      let m = hAt(cache, i, j);
      for (let q = 0; q < n2; q++) {
        const v = num(h[k * n2 + q]);
        if (v !== null && (m === null || v > m)) m = v;
      }
      cache.set('f' + key(i, j), m);
    });
  }
  return true;
}

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
  // the fine pass, highest first: for each leg, then for the whole route (an outer cell stands for the 2 km around it, so its neighbours are read too)
  const hiOf = cells => cells.reduce((m, [i, j]) => Math.max(m, hAt(cache, i, j) ?? -Infinity), -Infinity),
    outerFine = [];
  const groups = [];
  for (const cells of inner) {
    const m = hiOf(cells);
    if (m > -Infinity) groups.push({ items: cells.map(c => ({ c, ub: bound(cache, c[0], c[1]) })), top: m });
  }
  const m0 = Math.max(hiOf([...innerAll.values()]), hiOf([...outer.values()]));
  if (m0 > -Infinity) {
    const items = [...innerAll.values()].map(c => ({ c, ub: bound(cache, c[0], c[1]) }));
    // an outer cell is read one in four (2 km apart): its own step is to the next one read, 2 cells away
    for (const [i, j] of outer.values()) {
      const v = hAt(cache, i, j);
      if (v === null) continue;
      let d = 0;
      for (const [a, b] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        const g = hAt(cache, i + a, j + b);
        if (g !== null) d = Math.max(d, Math.abs(v - g));
      }
      const ub = v + Math.min(FINE_MARGIN, d);
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          outerFine.push([i + di, j + dj]);
          items.push({ c: [i + di, j + dj], ub });
        }
    }
    groups.push({ items, top: m0 });
  }
  if (!(await topDown(elev, cache, groups))) return null;
  let maxAll = -Infinity,
    got = 0;
  const legs = [null];
  inner.forEach(cells => {
    let m = -Infinity;
    for (const [i, j] of cells) {
      const v = best(cache, i, j);
      if (v !== null) {
        got++;
        if (v > m) m = v;
      }
    }
    legs.push(m === -Infinity ? null : vfrMsa(Math.max(0, m)));
    if (m > maxAll) maxAll = m;
  });
  for (const [i, j] of [...outer.values(), ...outerFine]) {
    const v = best(cache, i, j);
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
  const binOf = (i, j) => {
    const de = i * CELL - c.e,
      dn = j * CELL - c.n;
    return Math.hypot(de, dn) < CELL * 0.75
      ? -1
      : Math.floor((((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360) / 5) % NB;
  };
  // the fine pass: the cells near the highest of their bin (the cell of the point counts for every bin)
  const hi = new Array(NB).fill(-Infinity);
  for (const [i, j] of cells) {
    const v = hAt(cache, i, j),
      b = binOf(i, j);
    if (v === null) continue;
    if (b < 0) for (let q = 0; q < NB; q++) hi[q] = Math.max(hi[q], v);
    else hi[b] = Math.max(hi[b], v);
  }
  // the fine pass of each bin, highest first (the cells of the point count for every bin)
  const byBin = Array.from({ length: NB }, () => []),
    mid = [];
  for (const [i, j] of cells) {
    const b = binOf(i, j),
      it = { c: [i, j], ub: bound(cache, i, j) };
    if (b < 0) mid.push(it);
    else byBin[b].push(it);
  }
  const groups = [];
  for (let q = 0; q < NB; q++) if (hi[q] > -Infinity) groups.push({ items: byBin[q].concat(mid), top: hi[q] });
  if (!(await topDown(elev, cache, groups))) return null;
  const out = new Array(NB).fill(Math.max(0, c0 || 0));
  let got = 0;
  for (const [i, j] of cells) {
    const v = best(cache, i, j);
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
