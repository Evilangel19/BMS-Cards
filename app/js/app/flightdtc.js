import { ST } from './state.js';
import { F } from './datacard.js';
import { G, lines } from './dtcfile.js';
import { applyEdits, l16ChanEdits } from './l16link.js';
import { radioEdits, radioPlan } from '../core/radioplan.js';

/* What the DTC takes from the flight on the card whatever the seat is (the seat part is app/seatdtc.js): the channels of Link 16 (Mission, Fighter, Special of file A, with the group "l16") and
   the radio presets 5, 6, 13 and 15... of the Radio page (group "radio", the rules are in core/radioplan.js). Both are the switches "from Datacard" of the Data Cartridge page. They are written when
   a flight is opened (app/selection.js -> seatEnter) and when the switch is turned on; only the lines that change, and only the lines that are in the file. */

// the lines of [Radio] for the flight on the card: [{s, k, v}]
export function radioDtcEdits() {
  if (!lines.length) return [];
  const has = k => lines.some(l => l.s === 'Radio' && l.k === k);
  return radioEdits(radioPlan(F), k => (has(k) ? G('Radio', k, '') : null));
}
// groups: {l16, radio}
export function flightDtcEdits(groups = { l16: true, radio: true }) {
  const out = [];
  if (groups.l16) out.push(...l16ChanEdits());
  if (groups.radio) out.push(...radioDtcEdits());
  return out;
}
// writes them into the DTC for the groups that follow the Datacard; only: {radio: true} = just that group (its switch was turned on). Returns how many lines changed
export function flightDtcPush(only) {
  if (!lines.length || !ST.DCS || ST.CURK == null) return 0;
  const on = g => (!only || !!only[g]) && !!ST.DCS[g];
  return applyEdits(flightDtcEdits({ l16: on('l16'), radio: on('radio') }));
}
