import { CAM } from '../core/cam-core.js';
import { iffModes, iffSeatEdits } from '../core/iffseat.js';
import { ST } from './state.js';
import { G, lines } from './dtcfile.js';
import { applyEdits, l16DtcEdits } from './l16link.js';
import { $ } from './base.js';

/* The DTC for the chosen seat (the rules are in core/iffseat.js and core/l16plan.js). Besides the laser code (app/datacard.js, group "lsr"), the DTC of the pilot holds more things that belong
   to one aircraft of the flight: the IFF codes (modes 2 and 3, with the codes of the time events), group "iff", and the Link 16 files (group "l16", app/l16link.js: the letters and the number
   of the callsign, the flight lead flag and the STN slots of the package). Groups "iff" and "l16" are the switches "from Datacard" of the Data Cartridge page. Only the lines that change are
   written, and the IFF codes only when the DTC is the one of this flight (a code of another flight is left alone). The campaign's IFF file and the DTC are read by the card the same way
   (app/dtcapply.js), so what is written here is read back unchanged. */

// the lines to write for the aircraft `seat` of the flight on the card: [{s, k, v}]
export function seatDtcEdits(seat, groups = { iff: true, l16: true }) {
  const x = ST.CL && ST.CL[+$('fsel').value || 0],
    fl = x && x.f;
  if (!lines.length || !ST.C || !fl || !(seat >= 0 && seat < 4)) return [];
  const g = (s, k) => G(s, k, ''),
    out = [];
  if (groups.iff && g('IFF', 'Mode2 Code') !== '') {
    let els = [];
    try {
      els = CAM.els0(ST.C, fl);
    } catch (e) {
      els = [];
    }
    const P = ST.IFFP && ST.IFFP[fl.owner],
      fi = Math.max(
        0,
        els.findIndex(e => e.id.n == fl.id.n && e.id.c == fl.id.c)
      );
    iffSeatEdits(k => g('IFF', k), fi, seat, {
      mode2: !!(+g('IFF', 'Mode2 On') && iffModes(P, fl).a2),
      m2set: P && P.M2Setting !== undefined ? P.M2Setting : 0,
      m3set: P && P.M3Setting !== undefined ? P.M3Setting : 0,
    }).forEach(e => out.push({ s: 'IFF', ...e }));
  }
  if (groups.l16) out.push(...l16DtcEdits(seat));
  return out;
}
// writes them into the DTC; returns how many lines changed
export function seatDtcPush(seat, groups) {
  return applyEdits(seatDtcEdits(seat, groups));
}
