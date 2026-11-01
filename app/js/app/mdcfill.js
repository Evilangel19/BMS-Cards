import { mdcDerive, pptRows, EOB } from '../core/mdcfill.js';
import { dtcPoints } from '../core/mapdtc.js';
import D0 from '../data/index.js';
import { ST } from './state.js';
import { F } from './datacard.js';
import { lines } from './dtcfile.js';

// the cells of the MDC format that follow from the card: written again after every automatic fill (what the pilot typed stays)
export function mdcAuto() {
  const o = mdcDerive(F),
    P = dtcPoints(lines),
    rows = pptRows(P && P.ppt, D0.ppt, ST.C);
  for (let r = 0; r < 9; r++) EOB.forEach((c, j) => (o[c + (25 + r)] = (rows[r] && rows[r][j]) || ''));
  for (const k in o) if (!(ST.MANK && ST.MANK.has(k))) F[k] = o[k];
}
