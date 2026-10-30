import { mdcDerive } from '../core/mdcfill.js';
import { ST } from './state.js';
import { F } from './datacard.js';

// the cells of the MDC format that follow from the card: written again after every automatic fill (what the pilot typed stays)
export function mdcAuto() {
  const o = mdcDerive(F);
  for (const k in o) if (!(ST.MANK && ST.MANK.has(k))) F[k] = o[k];
}
