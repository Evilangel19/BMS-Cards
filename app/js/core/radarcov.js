// Radar coverage at one altitude (approximate): for every radar, rays every few degrees; along a ray the terrain hides what is below the line of sight
// (4/3 earth radius, so the radio horizon is included). A target at `altFt` (MSL) is seen at a distance when its elevation angle from the antenna is not
// lower than that of any terrain before it. The polygon of a radar goes to the first distance where the line is lost (what lies behind a ridge is not shown).
export const CELL_KM = 3, FT_KM = 3280.84, RE_KM = 6371 * 4 / 3;
export const cellOf = (x, y) => [Math.round(x / CELL_KM), Math.round(y / CELL_KM)];
const key = (i, j) => i + ',' + j;

// the radars of a unit list (mapUnits): ground / naval units with a detection range of at least minKm at low altitude and a radar vehicle that is still alive
export function radarUnits(UL, minKm = 30) {
  return UL.filter(m => m.det >= minKm && !m.noFcr && m.slot >= 0).map(m => ({x: m.u.x, y: m.u.y, rng: m.det, ally: m.ally, hostile: m.hostile, name: m.name, bn: m.bn, ll: m.ll}));
}
const steps = (r, stepKm) => { const o = []; for (let d = stepKm; d <= r.rng + 1e-6; d += stepKm) o.push(d); return o; };
// the terrain cells that the rays of the given radars cross: [[i, j], ...] without duplicates (the radar position too)
export function neededCells(radars, nRays = 72, stepKm = CELL_KM) {
  const S = new Map();
  for (const r of radars) {
    const add = (x, y) => { const [i, j] = cellOf(x, y); S.set(key(i, j), [i, j]); };
    add(r.x, r.y);
    for (let a = 0; a < nRays; a++) { const t = a / nRays * 2 * Math.PI, sx = Math.sin(t), cy = Math.cos(t); for (const d of steps(r, stepKm)) add(r.x + sx * d, r.y + cy * d); }
  }
  return [...S.values()];
}
// polygon of one radar as [[x, y] km ...] (campaign grid), with H(i, j) = terrain feet of a cell (0 when unknown)
export function coverage(r, H, altFt = 5000, nRays = 72, stepKm = CELL_KM, antFt = 30) {
  const hAt = (x, y) => { const [i, j] = cellOf(x, y); return H(i, j) || 0; };
  const a0 = hAt(r.x, r.y) + antFt, poly = [];
  for (let a = 0; a < nRays; a++) {
    const t = a / nRays * 2 * Math.PI, sx = Math.sin(t), cy = Math.cos(t); let mx = -Infinity, reach = 0;
    for (const d of steps(r, stepKm)) {
      const drop = d * d / (2 * RE_KM) * FT_KM, th = hAt(r.x + sx * d, r.y + cy * d) - drop, ta = (altFt - drop - a0) / (d * FT_KM), tt = (th - a0) / (d * FT_KM);
      if (th >= altFt || ta < mx) break;   // inside the hill, or the line of sight is lost
      reach = d; if (tt > mx) mx = tt;
    }
    poly.push([r.x + sx * reach, r.y + cy * reach]);
  }
  return poly;
}
