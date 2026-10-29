// "Operational" percentage of an objective, as the BMS target list shows it (checked on the Bear Trap campaign against the game: 12th Infantry Division 0%, 3rd Artillery Brigade 25%,
// a wind farm of features worth 0 = 100%, ROK Army 2nd Operations Base 94%, Depot #6 75%, Imsil Bridge 0%, Camp Henry 0%, 50th Infantry Division 0%, Gimhae Airport 50%).
// Objective: 100 minus the value (FED, points) of every destroyed feature and half of the value (rounded down) of every damaged one, never below 0: it is not a share of the total value.
// Airfield (it has runway thresholds): the share of its runways with no destroyed section; the other features do not count.
import { featState } from '../parsers/cam.js';

/**
 * @param {{name: string, value: number}[]} feats the features of the objective (same order as the states)
 * @param {ArrayLike<number> | null | undefined} st the state of each feature in the campaign (0 intact, 1-2 damaged, 3-5 destroyed)
 * @returns {number} 0-100
 */
export function operational(feats, st) {
  if (!st || !feats) return 100;
  const stateAt = k => (st[k] === undefined ? 0 : featState(st[k]));
  const thr = feats.map((f, k) => (/runway thr/i.test(f.name) ? k : -1)).filter(k => k >= 0);
  if (thr.length >= 2) {
    // a runway goes from one threshold to the next (the thresholds come in pairs); its sections are the runway features between them
    const runs = [];
    for (let i = 0; i + 1 < thr.length; i += 2) runs.push([thr[i], thr[i + 1]]);
    const ok = runs.filter(([a, b]) => {
      for (let k = a; k <= b; k++) if (/runway/i.test(feats[k].name) && stateAt(k) == 2) return false;
      return true;
    }).length;
    return Math.round((100 * ok) / runs.length);
  }
  let loss = 0;
  feats.forEach((f, k) => {
    const s = stateAt(k);
    loss += s == 2 ? f.value : s == 1 ? Math.floor(f.value / 2) : 0;
  });
  return Math.max(0, 100 - loss);
}
