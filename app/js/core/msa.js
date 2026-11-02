// Minimum safe altitudes from the terrain (pure: the heights come in through a function, nothing is read here).
// Three values, all information only (they never raise an alert: a low-level route is below them by design):
//  - route MSA (USAF, AFMAN 11-202V3 12.12.6): highest terrain within 5 NM of the centreline of a leg + 500 ft, up to 100 ft
//  - ERAA (same manual): highest terrain within 22 NM of the whole route + 1,000 ft, or + 2,000 ft in mountainous terrain (relief of 500 ft or more in 0.5 NM)
//  - airbase / navaid MSA (civil IFR sectors): highest terrain within 25 NM of the point + 1,000 ft, up to 100 ft, in 1 to 4 sectors
// Positions are BMS feet {n, e} (north / east), heights are feet.
export const NMFT = 6076.12;
export const VFR_HALF = 5, // NM each side of the centreline
  VFR_ADD = 500,
  ERAA_HALF = 22,
  ERAA_ADD = 1000,
  ERAA_ADD_MTN = 2000,
  IFR_RADIUS = 25,
  IFR_ADD = 1000,
  MTN_RELIEF = 500, // ft
  MTN_SPAN = 0.5, // NM
  MTN_SHARE = 0.05; // part of the sampled pairs that must be steep for the area to count as mountainous

// up to the next 100 ft (a tiny tolerance keeps 2,300.0000001 at 2,300)
export const up100 = v => Math.ceil(v / 100 - 1e-6) * 100;
export const vfrMsa = maxFt => up100(maxFt + VFR_ADD);
export const eraaAlt = (maxFt, mountainous) => up100(maxFt + (mountainous ? ERAA_ADD_MTN : ERAA_ADD));
export const ifrMsa = maxFt => up100(maxFt + IFR_ADD);

// points of a strip along the leg a -> b: every `along` NM along, every `cross` NM across, up to `half` NM each side.
// Returns { pts, nA, nC } in the order along-major (index = i * nC + j) so that neighbours can be compared.
export function strip(a, b, half, along, cross) {
  const dx = b.e - a.e,
    dy = b.n - a.n,
    L = Math.hypot(dx, dy),
    nA = Math.max(2, Math.ceil(L / (along * NMFT)) + 1),
    ux = L ? dx / L : 0,
    uy = L ? dy / L : 1,
    nC = Math.round((2 * half) / cross) + 1,
    pts = [];
  for (let i = 0; i < nA; i++) {
    const t = nA == 1 ? 0 : i / (nA - 1);
    for (let j = 0; j < nC; j++) {
      const c = (-half + j * cross) * NMFT;
      pts.push({ e: a.e + dx * t - uy * c, n: a.n + dy * t + ux * c });
    }
  }
  return { pts, nA, nC };
}

const H = v => (v === null || v === undefined || !isFinite(v) ? null : v);

// steep neighbours (relief >= MTN_RELIEF between samples MTN_SPAN apart) over the sampled pairs: { steep, pairs }
export function relief(h, nA, nC) {
  let steep = 0,
    pairs = 0;
  const cmp = (p, q) => {
    p = H(p);
    q = H(q);
    if (p === null || q === null) return;
    pairs++;
    if (Math.abs(p - q) >= MTN_RELIEF) steep++;
  };
  for (let i = 0; i < nA; i++)
    for (let j = 0; j < nC; j++) {
      if (i + 1 < nA) cmp(h[i * nC + j], h[(i + 1) * nC + j]);
      if (j + 1 < nC) cmp(h[i * nC + j], h[i * nC + j + 1]);
    }
  return { steep, pairs };
}

/**
 * The MSA of every leg of a route and the ERAA of the whole route.
 * @param {(pts: {n:number,e:number}[]) => Promise<(number|null)[]|null>} elev heights of points (null = no terrain data)
 * @param {{n:number,e:number}[]} route the steerpoints
 * @returns {Promise<null | {legs: (number|null)[], eraa: number|null, mountainous: boolean, maxFt: number}>}
 *   legs[i] = MSA of the leg that ends at steerpoint i (legs[0] = null)
 */
export async function routeMsa(elev, route, progress) {
  if (!route || route.length < 2) return null;
  const fine = [],
    coarse = [];
  for (let i = 0; i + 1 < route.length; i++) {
    fine.push(strip(route[i], route[i + 1], VFR_HALF, MTN_SPAN, MTN_SPAN));
    coarse.push(strip(route[i], route[i + 1], ERAA_HALF, 1.5, 1));
  }
  const all = [];
  fine.forEach(s => all.push(...s.pts));
  coarse.forEach(s => all.push(...s.pts));
  const hs = [];
  const CH = 4000; // chunks: the progress bar moves and a very long route does not block one call
  for (let o = 0; o < all.length; o += CH) {
    const r = await elev(all.slice(o, o + CH));
    if (!r) return null;
    hs.push(...r);
    if (progress) progress(Math.min(1, (o + CH) / all.length));
  }
  let p = 0;
  const legs = [null];
  let maxAll = -Infinity,
    steep = 0,
    pairs = 0,
    got = 0;
  fine.forEach(s => {
    const h = hs.slice(p, p + s.pts.length);
    p += s.pts.length;
    let m = -Infinity;
    h.forEach(v => {
      v = H(v);
      if (v !== null) {
        got++;
        if (v > m) m = v;
      }
    });
    legs.push(m === -Infinity ? null : vfrMsa(Math.max(0, m)));
    maxAll = Math.max(maxAll, m);
    const r = relief(h, s.nA, s.nC);
    steep += r.steep;
    pairs += r.pairs;
  });
  coarse.forEach(s => {
    for (let i = 0; i < s.pts.length; i++) {
      const v = H(hs[p + i]);
      if (v !== null && v > maxAll) maxAll = v;
    }
    p += s.pts.length;
  });
  if (!got) return null;
  const mountainous = pairs > 0 && steep / pairs >= MTN_SHARE;
  return { legs, eraa: eraaAlt(Math.max(0, maxAll), mountainous), mountainous, maxFt: maxAll };
}

// ---- sectors of an airbase / navaid (civil IFR) ----
export const NB = 72; // bins of 5 degrees
export const MIN_BINS = 9; // a sector is at least 45 degrees
export const SECTOR_COST = 3000; // what one more sector must save (ft x bins) to be worth it
export const MAX_SECTORS = 4;

// the points around a position: NB bins, one sample every NM up to 25 NM (index = bin * 25 + (ring - 1))
export function ringPoints(c) {
  const pts = [];
  for (let b = 0; b < NB; b++) {
    const t = ((b * 5 + 2.5) * Math.PI) / 180;
    for (let r = 1; r <= IFR_RADIUS; r++)
      pts.push({ e: c.e + Math.sin(t) * r * NMFT, n: c.n + Math.cos(t) * r * NMFT });
  }
  return pts;
}

// highest terrain of each bin (the bin itself is included: the point of the airbase counts)
export function binMax(h, c0) {
  const out = new Array(NB).fill(0);
  for (let b = 0; b < NB; b++) {
    let m = Math.max(0, c0 || 0);
    for (let r = 0; r < IFR_RADIUS; r++) {
      const v = H(h[b * IFR_RADIUS + r]);
      if (v !== null && v > m) m = v;
    }
    out[b] = m;
  }
  return out;
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
export async function baseMsa(elev, c, c0) {
  const h = await elev(ringPoints(c));
  if (!h) return null;
  return sectors(binMax(h, c0));
}

// the bearing a pilot reads: from the sector edge towards the reference point (inbound), magnetic = true - variation (east positive)
export const inbound = (deg, magvar) => (((deg + 180 - (magvar || 0)) % 360) + 360) % 360;
