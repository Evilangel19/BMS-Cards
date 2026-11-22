// @ts-check
// The fragments of a general-purpose bomb in space and time. Pure functions, no DOM.
// Source: TO 1F-16CMAM-34-1-1 BMS, 4.2.7.7, the "maximum fragment envelope" graphs of the MK-82 (500 lb) and MK-84 (2 000 lb) LDGP bombs: three
// fragment paths each (straight up, steep, shallow) with the time in seconds at each point. The points are READ FROM THE GRAPHS (a general estimate,
// not BMS code); the 1 000 lb class is blended between the two by weight (approximate).
// The model: the three paths and one along the ground are the fastest fragments at about 90, 60, 30 and 0 degrees; between them the paths are blended
// by angle; slower fragments fly the same shape smaller (k^2 the size, k the time: the ballistic scaling). Every fragment is followed in time on a grid
// of the vertical plane (distance from the impact r, height above it z): each cell keeps the first and the last second a fragment is there. A point
// is dangerous only in that window (high up for a moment, low down for most of the fall), and outside the envelope never.

// [t s, r ft, z ft] read from the graphs
const MK82 = {
    V: [
      [0, 0, 0],
      [1, 0, 1650],
      [3, 0, 2350],
      [5, 0, 2800],
      [7, 0, 2950],
      [9, 0, 3050],
      [11, 0, 2980],
      [13, 0, 2750],
      [15, 0, 2450],
      [17, 0, 2200],
      [19, 0, 1850],
      [21, 0, 1550],
      [23, 0, 950],
      [25, 0, 550],
      [26.5, 0, 0],
    ],
    S: [
      [0, 0, 0],
      [1, 800, 1350],
      [3, 1080, 2000],
      [5, 1450, 2350],
      [7, 1700, 2450],
      [9, 1900, 2450],
      [11, 2050, 2300],
      [13, 2200, 2050],
      [15, 2300, 1750],
      [17, 2350, 1450],
      [19, 2450, 1050],
      [21, 2500, 650],
      [23, 2550, 250],
      [24, 2580, 0],
    ],
    L: [
      [0, 0, 0],
      [1, 1350, 800],
      [3, 2100, 1100],
      [5, 2550, 1200],
      [7, 2850, 1150],
      [9, 3100, 1000],
      [11, 3350, 800],
      [13, 3500, 500],
      [15, 3650, 150],
      [15.5, 3680, 0],
    ],
  },
  MK84 = {
    V: [
      [0, 0, 0],
      [1, 0, 1620],
      [3, 0, 2520],
      [5, 0, 2800],
      [7, 0, 3000],
      [9, 0, 3070],
      [11, 0, 3000],
      [13, 0, 2800],
      [15, 0, 2520],
      [17, 0, 2250],
      [19, 0, 1830],
      [21, 0, 1450],
      [23, 0, 1050],
      [25, 0, 650],
      [27, 0, 250],
      [28, 0, 0],
    ],
    S: [
      [0, 0, 0],
      [1, 800, 1380],
      [3, 1250, 2050],
      [5, 1500, 2350],
      [7, 1750, 2480],
      [9, 1900, 2480],
      [11, 2050, 2370],
      [13, 2200, 2150],
      [15, 2350, 1830],
      [17, 2400, 1500],
      [19, 2450, 1150],
      [21, 2500, 730],
      [23, 2550, 330],
      [24, 2570, 0],
    ],
    L: [
      [0, 0, 0],
      [1, 1400, 820],
      [3, 2150, 1120],
      [5, 2600, 1220],
      [7, 2900, 1190],
      [9, 3150, 1050],
      [11, 3350, 830],
      [13, 3550, 540],
      [15, 3650, 230],
      [15.8, 3680, 0],
    ],
  };

export const CELL = 50; // ft
const NR = 80,
  NZ = 70; // 4 000 ft out, 3 500 ft up

// the position on a path at time t (linear between the points; after its end it stays on the ground)
function at(P, t) {
  if (t <= 0) return [0, 0];
  for (let i = 1; i < P.length; i++)
    if (t <= P[i][0]) {
      const a = P[i - 1],
        b = P[i],
        f = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  const e = P[P.length - 1];
  return [e[1], 0];
}
const end = P => P[P.length - 1][0];
// the paths of a bomb blended by weight f (0: MK-82, 1: MK-84), on a common normalised time
function blendPaths(f) {
  const out = {};
  ['V', 'S', 'L'].forEach(k => {
    const A = MK82[k],
      B = MK84[k],
      T = end(A) + (end(B) - end(A)) * f;
    out[k] = Array.from({ length: 61 }, (_, i) => {
      const s = i / 60,
        p = at(A, s * end(A)),
        q = at(B, s * end(B));
      return [s * T, p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    });
  });
  // along the ground: as far as the shallow path, at its times
  out.G = out.L.map(([t, r]) => [t, r, 0]);
  return out;
}
// the position of a fastest fragment launched at angle a (0-90 degrees) at time t
function fast(paths, a, t) {
  const A = [
      [0, paths.G],
      [30, paths.L],
      [60, paths.S],
      [90, paths.V],
    ],
    j = Math.min(
      3,
      Math.max(
        1,
        A.findIndex(x => x[0] >= a)
      )
    ),
    [a0, P] = A[j - 1],
    [a1, Q] = A[j],
    f = (a - a0) / (a1 - a0),
    T = end(P) + (end(Q) - end(P)) * f,
    s = Math.min(1, t / T),
    p = at(P, s * end(P)),
    q = at(Q, s * end(Q));
  return { r: p[0] + (q[0] - p[0]) * f, z: p[1] + (q[1] - p[1]) * f, T };
}

const CACHE = new Map();
/** the fragment model of a bomb of lb pounds: {out, up, t, win(r, z) -> [first s, last s] after the impact or null, R(z) -> the reach at height z} */
export function fragModel(lb) {
  const f = Math.min(1, Math.max(0, (+lb - 500) / 1500)),
    key = Math.round(f * 1000);
  if (CACHE.has(key)) return CACHE.get(key);
  const paths = blendPaths(f),
    lo = new Float32Array(NR * NZ).fill(Infinity),
    hi = new Float32Array(NR * NZ).fill(-Infinity),
    mark = (r, z, t) => {
      const i = Math.floor(r / CELL),
        j = Math.floor(Math.max(0, z) / CELL);
      if (i < 0 || j < 0 || i >= NR || j >= NZ) return;
      const c = j * NR + i;
      if (t < lo[c]) lo[c] = t;
      if (t > hi[c]) hi[c] = t;
    };
  for (let a = 0; a <= 90; a += 2.5)
    for (let k = 1; k > 0.12; k -= 0.05) {
      const T = fast(paths, a, 0.001).T * k;
      for (let t = 0; t <= T; t += 0.1) {
        const p = fast(paths, a, t / k);
        mark(p.r * k * k, p.z * k * k, t);
      }
    }
  // a cell between two marked ones is filled from its neighbours (the sampling leaves holes at the edge of the slow fragments)
  const L2 = Float32Array.from(lo),
    H2 = Float32Array.from(hi);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NR; i++) {
      const c = j * NR + i;
      if (isFinite(lo[c])) continue;
      let n = 0,
        a = Infinity,
        b = -Infinity;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ii = i + di,
          jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NR || jj >= NZ) continue;
        const d = jj * NR + ii;
        if (isFinite(lo[d])) {
          n++;
          a = Math.min(a, lo[d]);
          b = Math.max(b, hi[d]);
        }
      }
      if (n >= 3) {
        L2[c] = a;
        H2[c] = b;
      }
    }
  // the reach at each height, and the envelope numbers
  const reach = new Float32Array(NZ);
  let out = 0,
    up = 0,
    tmax = 0;
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NR; i++) {
      const c = j * NR + i;
      if (!isFinite(L2[c])) continue;
      reach[j] = Math.max(reach[j], (i + 1) * CELL);
      out = Math.max(out, (i + 1) * CELL);
      up = Math.max(up, (j + 1) * CELL);
      tmax = Math.max(tmax, H2[c]);
    }
  const M = {
    out,
    up,
    t: Math.round(tmax * 10) / 10,
    win(r, z) {
      if (!(z >= 0) || !(r >= 0)) return null;
      const i = Math.floor(r / CELL),
        j = Math.floor(z / CELL);
      if (i >= NR || j >= NZ) return null;
      const c = j * NR + i;
      return isFinite(L2[c]) ? [L2[c], H2[c]] : null;
    },
    R(z) {
      const j = Math.floor(z / CELL);
      return j >= 0 && j < NZ ? reach[j] : 0;
    },
  };
  CACHE.set(key, M);
  return M;
}

/** the outline of the envelope in the vertical plane, at a side distance h from the impact (0: through it): [[x, z]...] from -x to +x */
export function fragOutline(M, h = 0) {
  const right = [];
  for (let z = 0; z <= M.up; z += CELL) {
    const R = M.R(z);
    if (R <= h) {
      if (right.length) break;
      continue;
    }
    right.push([Math.sqrt(R * R - h * h), z]);
  }
  if (!right.length) return [];
  const top = right[right.length - 1];
  return [...right, [0, top[1] + CELL / 2], ...right.map(([x, z]) => [-x, z]).reverse()];
}
