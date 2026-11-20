// @ts-check
// AUTO coastlines (F-15 SIT lines, Korea only): the coast of the Korean peninsula from the land polygons of the map (Natural Earth, [lon, lat] rings)
// cut in two lines that keep their meaning: ECOAST from the mouth of the Tumen down the east coast and along half of the south coast, WCOAST from there
// along the other half of the south coast, round the south-west corner and up the west coast to the mouth of the Yalu. The islands are other rings and
// are left out. Each line is cut down to `n` points keeping the shape (the points farthest from the line so far are added first).

// the anchors on the coast: the mouths of the Tumen and of the Yalu (the borders), Busan (the south-east corner), Haenam (the south-west corner)
export const KOREA_COAST = {
  tumen: [130.7, 42.29],
  busan: [129.05, 35.1],
  haenam: [126.53, 34.3],
  yalu: [124.33, 39.83],
};
const KX = Math.cos((38 * Math.PI) / 180); // degrees of longitude to degrees of latitude, about, at 38°N
const d2 = (a, b) => ((a[0] - b[0]) * KX) ** 2 + (a[1] - b[1]) ** 2;
const len = (a, b) => Math.sqrt(d2(a, b));
// the distance of p from the segment a-b (the same flat measure)
function segDist(p, a, b) {
  const ax = a[0] * KX,
    ay = a[1],
    bx = b[0] * KX - ax,
    by = b[1] - ay,
    px = p[0] * KX - ax,
    py = p[1] - ay,
    l = bx * bx + by * by,
    t = l ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}
/** a line cut down to n points: the two ends, then each time the point farthest from the line so far */
export function simplifyTo(pts, n) {
  if (pts.length <= n) return pts.slice();
  const keep = new Set([0, pts.length - 1]);
  while (keep.size < n) {
    const k = [...keep].sort((a, b) => a - b);
    let best = -1,
      bd = -1;
    for (let s = 0; s + 1 < k.length; s++)
      for (let i = k[s] + 1; i < k[s + 1]; i++) {
        const d = segDist(pts[i], pts[k[s]], pts[k[s + 1]]);
        if (d > bd) {
          bd = d;
          best = i;
        }
      }
    if (best < 0) break;
    keep.add(best);
  }
  return [...keep].sort((a, b) => a - b).map(i => pts[i]);
}
/**
 * @param {number[][][]} land the land rings, [lon, lat]
 * @param {number} [n] points per line (30: all the points of a SIT line)
 * @returns {{east: number[][], west: number[][]}|null} [lon, lat] points, null when the peninsula is not found
 */
export function koreaCoasts(land, n = 30) {
  const A = KOREA_COAST;
  // the ring of the peninsula: the one passing nearest to Busan
  let ring = null,
    rd = Infinity;
  (land || []).forEach(r => {
    r.forEach(p => {
      const d = d2(p, A.busan);
      if (d < rd) {
        rd = d;
        ring = r;
      }
    });
  });
  if (!ring || rd > 0.04) return null;
  const R = ring,
    N = R.length,
    near = q => {
      let k = 0,
        b = Infinity;
      R.forEach((p, i) => {
        const d = d2(p, q);
        if (d < b) {
          b = d;
          k = i;
        }
      });
      return b < 0.09 ? k : -1;
    };
  const iT = near(A.tumen),
    iB = near(A.busan),
    iH = near(A.haenam),
    iY = near(A.yalu);
  if ([iT, iB, iH, iY].some(i => i < 0)) return null;
  // the way round the ring that goes Tumen, Busan, Haenam, Yalu (the other way goes round the whole continent)
  const fw = (a, b) => (b - a + N) % N;
  const dir = fw(iT, iB) + fw(iB, iH) + fw(iH, iY) < N ? 1 : -1;
  const path = [];
  for (let i = iT, s = 0; s <= N; s++) {
    path.push(R[i]);
    if (i == iY) break;
    i = (i + dir + N) % N;
  }
  const at = q => path.findIndex(p => p === R[q]),
    jB = at(iB),
    jH = at(iH);
  if (jB < 0 || jH < jB || path[path.length - 1] !== R[iY]) return null;
  // the middle of the south coast (Busan - Haenam), by length along the coast
  let tot = 0;
  for (let j = jB; j < jH; j++) tot += len(path[j], path[j + 1]);
  let run = 0,
    jS = jB;
  for (let j = jB; j < jH; j++) {
    run += len(path[j], path[j + 1]);
    if (run >= tot / 2) {
      jS = j + 1;
      break;
    }
  }
  return { east: simplifyTo(path.slice(0, jS + 1), n), west: simplifyTo(path.slice(jS), n) };
}
