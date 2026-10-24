// Offsets placed on the map: for a route steerpoint (1-24) the position of each reference point (OA1, OA2, VRP, VRP PUP, VIP, VIP PUP) in north / east feet,
// and optionally its terrain elevation (ft MSL, editable). The Map page places them, the Weapons page shows them and writes them with Apply.
// Every steerpoint remembers where it was (`at`): when it moves or another flight is picked, its offsets are ignored (a point stays where it was placed, not where its number goes).
export const OFF_KEYS = [['oa1', 'OA1'], ['oa2', 'OA2'], ['vrp', 'VRP'], ['vrpPup', 'VRP PUP'], ['vip', 'VIP'], ['vipPup', 'VIP PUP']];
export const OFF_COLORS = {oa1: '#a78bfa', oa2: '#c4b5fd', vrp: '#f0b040', vrpPup: '#fbbf24', vip: '#34d399', vipPup: '#6ee7b7'};
const near = (a, b) => Math.abs(a.n - b.n) < 100 && Math.abs(a.e - b.e) < 100;

export function createOffsets(key = 'mapoffs1') {
  let D = {}; const subs = [];
  try { const o = JSON.parse(sessionStorage.getItem(key) || '{}'); if (o && typeof o == 'object') D = o; } catch (e) { /* none */ }
  const fire = () => { try { sessionStorage.setItem(key, JSON.stringify(D)); } catch (e) { /* none */ } subs.forEach(f => { try { f(); } catch (e) { /* none */ } }); };
  const fresh = (n, at) => { const o = D[n]; if (!o || (at && o.at && !near(o.at, at))) D[n] = {at: at || (o && o.at), p: {}}; return D[n]; };
  return {
    // the placed points of steerpoint n ({oa1: {n, e, alt?}, ...}); {} when none, or when the steerpoint is no longer where they were placed
    get(n, at) { const o = D[n]; return o && (!at || !o.at || near(o.at, at)) ? o.p : {}; },
    anchor(n) { return D[n] ? D[n].at : null; },
    all() { return D; },
    set(n, at, k, pos) { fresh(n, at).p[k] = {n: pos.n, e: pos.e, ...(pos.alt !== undefined && pos.alt !== null && !isNaN(pos.alt) ? {alt: Math.round(pos.alt)} : {})}; fire(); },
    remove(n, at, k) { const o = D[n]; if (o && o.p[k]) { delete o.p[k]; if (!Object.keys(o.p).length) delete D[n]; fire(); } },
    clear(n) { if (D[n]) { delete D[n]; fire(); } },
    clearAll() { D = {}; fire(); },
    onChange(f) { subs.push(f); },
  };
}
