// The cells of the MDC format that follow from other fields of the card (pure: the keys of the card in, the derived cells out).
// Pilots (callsign, STN), audio presets, roll call, targets of the second table.
import { geoLL, locXY } from '../rules/geo.js';
const LL = /^([NS].*?')\s+([EW].*)$/;
// "2x AIM-9M" -> "2x AIM-9M"; "4x AN/ALQ-184" -> "4x ALQ-184"; "2x Tank 370" -> "2x TK370": the name is cut at its first word
const shortW = t => {
  const m = t.match(/^(\d+x)\s+(.*)$/);
  if (!m) return t;
  let w = m[2].replace(/^AN\//, '');
  const k = w.match(/^Tank\s+(\d+)/i);
  w = k ? 'TK' + k[1] : w.split(/\s+/)[0];
  return m[1] + ' ' + w;
};
const clean = v => (v && v !== '---' ? String(v) : '');

/** @param {Record<string, any>} F @returns {Record<string, string>} */
export function mdcDerive(F) {
  const n = k => clean(F[k]),
    o = {};
  // pilots: the callsign of each pilot (flight callsign + position) and the STN of the Link 16 text ("05011 MC 1 FC 3")
  for (let r = 0; r < 8; r++) {
    o[`fl${r}_c`] = n(`fl${r}_1`) && n('cs') ? `${n('cs')}-${r + 1}` : '';
    o[`fl${r}_s`] = n(`fl${r}_3`).split(/\s+/)[0] || '';
  }
  // audio presets (order of the card: 1 OPS, 2 GND, 3 TWR, 4 DEP/APR, 5 CHKN, 6 C2/TAC, 13 TNKR, 10 ALT A, 11 ALT T, 12 ALT G)
  const own = [0, 1, 2, 3, 4].find(i => n(`pk${i}_0`) && n(`pk${i}_0`) == n('cs')) ?? 0;
  [
    '',
    n('ab0_2'),
    n('ab0_7'),
    n('ab0_3'),
    n(`pk${own}_2`),
    n('su2_2'),
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
    o.dl0_fl = stn[own] || '';
    o.dl0_tm = others[0] || '';
    o.dl0_dn = others[1] || '';
    o.dl0_dn2 = others.slice(2).join(' ');
  }
  // loadout: a short form of the four loadout lines
  o.cfg = ['aa', 'ag', 'ecm', 'tanks']
    .flatMap(k => n(k).split(/,\s*/))
    .filter(Boolean)
    .map(shortW)
    .join(' · ');
  // second table: primary and secondary target (steerpoints 99 and 98 of the DTC)
  [
    ['t', 'pri', 'll1', '99'],
    ['u', 'sec', 'll2', '98'],
  ].forEach(([p, k, lk, st]) => {
    const m = LL.exec(n(lk)),
      d = n(k);
    o[`${p}0_0`] = d || m ? st : '';
    o[`${p}0_1`] = m ? m[1] : '';
    o[`${p}0_2`] = m ? m[2] : '';
    o[`${p}0_3`] = m ? n(k + '_alt') : '';
    o[`${p}0_4`] = d;
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
