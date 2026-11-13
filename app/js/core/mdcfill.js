// The cells of the MDC format that follow from other fields of the card (pure: the keys of the card in, the derived cells out).
// Pilots (callsign, STN), audio presets, roll call, targets of the second table.
import { geoLL, locXY } from '../rules/geo.js';
const LL = /^([NS].*?')\s+([EW].*)$/;
// "2x AIM-9M" -> "2x AIM-9M"; "4x AN/ALQ-184" -> "4x ALQ-184"; "2x Tank 370" or "2x Tank F-15C 600gal" -> "2x TK370" / "2x TK600"; "4x GBU-31(v)1/B" -> "4x GBU-31";
// one of a kind without its "1x" (a pod: "AAQ-33")
const shortW = t => {
  const m = t.match(/^(\d+)x\s+(.*)$/);
  if (!m) return t;
  let w = m[2].replace(/^AN\//, '');
  const k = w.match(/^(?:Fuel\s+)?Tank\b.*?(\d{3,4})(?:\s*gal)?\b/i);
  w = k ? 'TK' + k[1] : w.split(/\s+/)[0].replace(/\(.*$/, '');
  return m[1] == '1' ? w : m[1] + 'x ' + w;
};
// the escorted flights in the short form of the MDC: the two letters of Link 16 (first and last letter of the callsign) and the number:
// "Escort Devil 3, Panther 4, Jaguar 2" -> "ESC DL3 PR4 JR2"; any other text stays as it is
// a callsign in the short form of Link 16: "Devil 3" -> "DL3"
export function csShort(cs) {
  const k = /^(.*?)[\s-]*(\d+)$/.exec(String(cs || '').trim()),
    w = (k ? k[1] : String(cs || '')).replace(/[^A-Za-z]/g, '').toUpperCase();
  return w.length >= 2 ? w[0] + w[w.length - 1] + (k ? k[2] : '') : String(cs || '');
}
export function escShort(t) {
  const m = /^escort\s+(.+)$/i.exec(String(t || '').trim());
  if (!m) return t;
  return (
    'ESC ' +
    m[1]
      .split(/\s*,\s*/)
      .map(csShort)
      .join(' ')
  );
}
const clean = v => (v && v !== '---' ? String(v) : '');

/** @param {Record<string, any>} F @param {number} [seat] the chosen seat of the flight (0 = the leader, also when no seat is chosen) @returns {Record<string, string>} */
export function mdcDerive(F, seat = 0) {
  const n = k => clean(F[k]),
    o = {};
  // IFF: the cells M2 and M3 are the ones of the chosen seat (fl<seat>_m holds "mode 2|mode 3", written by the DTC fill); with no IFF data they are left as they are
  {
    const m = F[`fl${seat}_m`];
    if (typeof m == 'string' && m.includes('|')) {
      const [a, b] = m.split('|');
      o.m2 = a || '';
      o.m3 = b || '';
    }
  }
  // pilots: the callsign of each pilot (flight callsign + position) and the STN of the Link 16 text ("05011 MC 1 FC 3")
  for (let r = 0; r < 8; r++) {
    o[`fl${r}_c`] = n(`fl${r}_1`) && n('cs') ? `${n('cs')}-${r + 1}` : '';
    o[`fl${r}_s`] = n(`fl${r}_3`).split(/\s+/)[0] || '';
  }
  // audio presets (order of the card: 1 OPS, 2 GND, 3 TWR, 4 DEP/APR, 5 CHKN, 6 C2/TAC, 13 TNKR, 10 ALT A, 11 ALT T, 12 ALT G). As in the DTC of BMS: 5 is the AWACS (check-in), 6 the UHF of the
  // player's own flight (the frequency for AWACS, FAC and JTAC), 13 the first tanker
  const own = [0, 1, 2, 3, 4].find(i => n(`pk${i}_0`) && n(`pk${i}_0`) == n('cs')) ?? 0;
  [
    '',
    n('ab0_2'),
    n('ab0_7'),
    n('ab0_3'),
    n('su2_2'),
    n(`pk${own}_2`),
    n('su0_2'),
    n('ab2_3'),
    n('ab2_7'),
    n('ab2_2'),
  ].forEach((v, i) => (o[`ps${i}`] = v));
  // link: the tables are A (row 1) and B (row 2); Flight = STN of the own flight, Team = the next flight of the package, Donor = the other STNs
  o.dl0_ndl = 'A';
  o.dl1_ndl = 'B';
  {
    const stn = [0, 1, 2, 3, 4].map(i => n(`pk${i}_4`)),
      others = stn.filter((v, i) => v && i != own);
    // the "Flight" cell of the link table: the STN of the chosen seat (the first word of its Link 16 cell), the lead of the flight for the leader
    o.dl0_fl = (seat > 0 && n(`fl${seat}_3`).split(/\s+/)[0]) || stn[own] || '';
    o.dl0_tm = others[0] || '';
    o.dl0_dn = others[1] || '';
    o.dl0_dn2 = others.slice(2).join(' ');
  }
  // Airspace / TGT: the primary target (the escorted flights in the short form)
  o.airsp = escShort(n('pri'));
  // loadout: a short form of the four loadout lines
  // the cell is one line high: the short names (no "1x", no "(v)1/B", tanks as TK600) let it be written bigger
  o.cfg = ['aa', 'ag', 'ecm', 'tanks']
    .flatMap(k => n(k).split(/,\s*/))
    .filter(Boolean)
    .map(shortW)
    .join(' · ');
  // second table: primary and secondary target (steerpoints 99 and 98 of the DTC), rows 1 and 2; row 3 is free
  [
    ['t0', 'pri', 'll1', '99'],
    ['t1', 'sec', 'll2', '98'],
  ].forEach(([p, k, lk, st]) => {
    const m = LL.exec(n(lk)),
      d = n(k);
    o[`${p}_0`] = d || m ? st : '';
    o[`${p}_1`] = m ? m[1] : '';
    o[`${p}_2`] = m ? m[2] : '';
    o[`${p}_3`] = m ? n(k + '_alt') : '';
    o[`${p}_4`] = escShort(d);
  });
  return o;
}

// Known EOB of the MDC (9 rows): the PPT of the DTC, the SAM first (then the other threats with a ring, then the plain points), each in the order of the DTC
export const EOB = ['xAD', 'xAE', 'xAF', 'xAH', 'xAJ'];
const NOT_SAM = /^(AAA|ZSU|MNP|SKY|BDZ|CSR)$/i;
export function pptRows(pts, list, C) {
  const info = p => (list || []).find(e => String(e[0]).toLowerCase() == String(p.name).toLowerCase()),
    rank = p => {
      const e = info(p);
      return e && e[1] > 1 ? (NOT_SAM.test(e[0]) ? 1 : 0) : 2;
    };
  return (pts || [])
    .filter(p => !p.empty)
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, 9)
    .map(({ p }) => {
      const e = info(p),
        m = /^([NS].*?')\s+([EW].*)$/.exec(C ? geoLL(C, p.x, p.y) : '');
      return [String(p.stpt), e ? e[2] : p.name, m ? m[1] : '', m ? m[2] : '', C ? locXY(C, p.x, p.y) : ''];
    });
}
