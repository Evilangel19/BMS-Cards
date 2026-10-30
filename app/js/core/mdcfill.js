// The cells of the MDC format that follow from other fields of the card (pure: the keys of the card in, the derived cells out).
// Pilots (callsign, STN), audio presets, roll call, targets of the second table.
const LL = /^([NS].*?')\s+([EW].*)$/;
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
  // roll call: the flights of the package
  for (let i = 0; i < 5; i++) {
    o[`rc${i}_0`] = n(`pk${i}_0`);
    o[`rc${i}_1`] = n(`pk${i}_1`);
    o[`rc${i}_7`] = n(`pk${i}_7`);
  }
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
    o[`${p}0_4`] = d;
  });
  return o;
}
