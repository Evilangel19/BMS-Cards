import { CAM } from '../core/cam-core.js';
import { iffModes, iffSeatEdits, l16SeatEdits } from '../core/iffseat.js';
import { ST } from './state.js';
import { G, S, lines } from './dtcfile.js';
import { dtcChanged } from './datacard.js';
import { $ } from './base.js';

/* The DTC for the chosen seat (the rules are in core/iffseat.js). Besides the laser code (app/datacard.js, group "lsr"), the DTC of the pilot holds two more things that belong to one
   aircraft of the flight: the IFF codes (modes 2 and 3, with the codes of the time events) and, in the Link 16 file A, the flight lead flag and the position in the number of the callsign.
   Groups "iff" and "l16" of the switches "from Datacard" of the Data Cartridge page. Only the lines that change are written, and only when the DTC is the one of this flight (an IFF code
   of another flight is left alone). The campaign's IFF file and the DTC are read by the card the same way (app/dtcapply.js), so what is written here is read back unchanged. */

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
  if (groups.l16) l16SeatEdits(k => g('LINK16', k), seat).forEach(e => out.push({ s: 'LINK16', ...e }));
  return out;
}
// writes them into the DTC; returns how many lines changed
export function seatDtcPush(seat, groups) {
  const es = seatDtcEdits(seat, groups);
  es.forEach(e => {
    S(e.s, e.k, e.v);
    dtcChanged(e.s, e.k, true);
  });
  if (es.length && ST.dtcPage && ST.dtcPage.render) ST.dtcPage.render(); // the Data Cartridge page shows the new values
  return es.length;
}
