// @ts-check
// AUTO NOE (the DTC editing of the Map page): the walls of the valley of the low-level part of the flight plan, as two lines (VALLEY L, VALLEY R).
// The low part: the legs whose two steerpoints are under LOW_FT, a take-off or landing steerpoint left out; when there are several, the longest
// (the same length: the one nearest the target). At stations along it, to the left and to the right, the first place where the terrain rises to the
// altitude of the leg there (a turn there without climbing would hit it), looked for up to SEARCH_NM; where the valley is wider, the wall stays at
// SEARCH_NM and the line says so. Pure: the heights come from outside (the HeightMap of the BMS folder), km of the theater, ft.
export const LOW_FT = 5000,
  SEARCH_NM = 5,
  STEP_NM = 0.25,
  STATIONS = 24;
const KM_NM = 1.852,
  TAKEOFF = 1,
  LAND = 7;

/** the low part of a route [{x, y, altFt, act}] -> the steerpoints of it (indexes a..b) or null */
export function lowPart(r) {
  const ok = i => r[i] && r[i].altFt < LOW_FT && r[i].act != TAKEOFF && r[i].act != LAND,
    runs = [];
  let a = -1;
  for (let i = 0; i < r.length - 1; i++) {
    if (ok(i) && ok(i + 1)) {
      if (a < 0) a = i;
    } else if (a >= 0) {
      runs.push([a, i]);
      a = -1;
    }
  }
  if (a >= 0) runs.push([a, r.length - 1]);
  if (!runs.length) return null;
  const len = ([p, q]) => {
      let s = 0;
      for (let i = p; i < q; i++) s += Math.hypot(r[i + 1].x - r[i].x, r[i + 1].y - r[i].y);
      return s;
    },
    tgt = r.findIndex(p => ![0, 1, 2, 3, 4, 7, 8].includes(p.act)); // the first steerpoint of an action: the target
  runs.sort((p, q) => len(q) - len(p) || (tgt < 0 ? 0 : Math.abs(p[1] - tgt) - Math.abs(q[1] - tgt)));
  return { a: runs[0][0], b: runs[0][1], km: len(runs[0]) };
}

/** the stations of the low part and the points whose heights are needed: {st: [{x, y, alt, n: {x, y}}], pts: [{x, y}]} (pts: per station, the left
 * side then the right side, STEP_NM to SEARCH_NM) */
export function noeSamples(r, part) {
  const seg = r.slice(part.a, part.b + 1),
    L = [0];
  for (let i = 1; i < seg.length; i++) L.push(L[i - 1] + Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y));
  const tot = L[L.length - 1] || 1,
    st = [],
    pts = [],
    steps = Math.round(SEARCH_NM / STEP_NM);
  for (let k = 0; k <= STATIONS; k++) {
    const d = (tot * k) / STATIONS;
    let i = 0;
    while (i < seg.length - 2 && L[i + 1] < d) i++;
    const p = seg[i],
      q = seg[i + 1],
      f = (d - L[i]) / (L[i + 1] - L[i] || 1),
      dx = q.x - p.x,
      dy = q.y - p.y,
      ln = Math.hypot(dx, dy) || 1,
      s = { x: p.x + dx * f, y: p.y + dy * f, alt: p.altFt + (q.altFt - p.altFt) * f, n: { x: -dy / ln, y: dx / ln } }; // n: to the left
    st.push(s);
    [1, -1].forEach(side => {
      for (let j = 1; j <= steps; j++) {
        const o = j * STEP_NM * KM_NM * side;
        pts.push({ x: s.x + s.n.x * o, y: s.y + s.n.y * o });
      }
    });
  }
  return { st, pts };
}

// n points of a polyline that keep its shape (Visvalingam: the smallest triangles go first), the two ends kept
function keep(P, n) {
  const Q = P.slice(),
    tri = (p, q, r) => Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  while (Q.length > n) {
    let k = 1,
      b = Infinity;
    for (let i = 1; i < Q.length - 1; i++) {
      const v = tri(Q[i - 1], Q[i], Q[i + 1]);
      if (v < b) {
        b = v;
        k = i;
      }
    }
    Q.splice(k, 1);
  }
  return Q;
}

/** the walls from the heights of noeSamples().pts (ft, null: unknown) -> {L: [{x, y}] (n), R: [...], wide: share of stations with no wall} */
export function noeWalls(S, H, n = 6) {
  const steps = Math.round(SEARCH_NM / STEP_NM),
    side = { L: [], R: [] };
  let open = 0;
  S.st.forEach((s, k) => {
    [
      ['L', 1, 0],
      ['R', -1, 1],
    ].forEach(([w, sg, half]) => {
      let j = 1;
      for (; j <= steps; j++) {
        const h = H[(k * 2 + half) * steps + j - 1];
        if (h != null && h >= s.alt) break;
      }
      if (j > steps) {
        j = steps;
        open++;
      }
      const o = j * STEP_NM * KM_NM * sg;
      side[w].push({ x: s.x + s.n.x * o, y: s.y + s.n.y * o });
    });
  });
  return { L: keep(side.L, n), R: keep(side.R, n), wide: open / (S.st.length * 2) };
}
