// IFF codes of one aircraft of a flight (pure: no DTC, no card; the Link 16 files are in l16plan.js). The campaign's IFF file gives every aircraft of a flight its own codes: in a mode 2 or mode 3
// code the low six bits are a block (4, 24 or 44) plus 20 / 4 = the flight of the package and, in the low two bits, the aircraft of the flight. The DTC of a pilot holds the codes of
// one aircraft; the codes of the others are the same with their low two bits. Used by the card (what each seat has, app/dtcapply.js) and to write the DTC for the chosen seat
// (app/seatdtc.js): rewriting a code for another seat and reading it back give the same codes, so the two never fight.
export const IFF_BLOCKS = [4, 24, 44];
// the actions of a flight that are no attack for the IFF files: take-off, nav, tanker, landing, holding (code of the mission type: the attack settings are the second one)
const PLAIN_ACT = [0, 1, 2, 3, 4, 7, 8];

/** which modes the IFF file allows for the mission of a flight: {a2, a4} (1 / 0). P = the IFF file of the owner ({pm: {mission: 'YYZZ'}}), fl = the flight ({omis, wps}) */
export function iffModes(P, fl) {
  let a2 = 1,
    a4 = 1;
  if (P && P.pm && P.pm[fl.omis]) {
    const pr = P.pm[fl.omis],
      yy = +pr.slice(0, 2),
      zz = +pr.slice(2),
      m = yy != zz && (fl.wps || []).some(p => !PLAIN_ACT.includes(p.act)) ? zz : yy;
    a2 = m & 2 ? 1 : 0;
    a4 = m & 8 ? 1 : 0;
  }
  return { a2, a4 };
}

/**
 * The code of the aircraft `seat` (0..3) of the flight number `fi` of its package, from a code of the DTC (octal text).
 * setting: the IFF file's rule for the mode: 0 = one code per aircraft (the pattern above), 1 = the same code for all. '' when the code is not one of this flight (another flight's DTC).
 * @param {string|number} code @param {number} fi @param {number} seat @param {number} [setting] @returns {string}
 */
export function seatIffCode(code, fi, seat, setting = 0) {
  const c = String(code == null ? '' : code).trim();
  if (!/^[0-7]{1,4}$/.test(c)) return '';
  if (setting == 1) return c.padStart(4, '0');
  if (setting != 0) return '';
  const o = parseInt(c, 8),
    y = o & 63,
    b = IFF_BLOCKS.find(q => y >= q && y - q < 20);
  if (b === undefined || Math.floor((y - b) / 4) !== fi) return '';
  return (((o >> 6) << 6) | (b + fi * 4 + seat)).toString(8).padStart(4, '0');
}
const same = (a, b) => parseInt(a, 8) === parseInt(b, 8);

/**
 * The lines of the [IFF] section that make the DTC the one of the aircraft `seat`: Mode 2 code, Mode 3A code and the Mode 3A code of every time event. Only the lines that change.
 * @param {(key: string) => string} get the value of a key of the section ('' when it is not there)
 * @param {{mode2?: boolean, m2set?: number, m3set?: number}} [o] mode2: mode 2 is in use for this mission; m2set, m3set: the rules of the IFF file
 * @returns {{k: string, v: string}[]}
 */
export function iffSeatEdits(get, fi, seat, o = {}) {
  const out = [],
    one = (k, set) => {
      const cur = String(get(k)).trim(),
        v = cur === '' ? '' : seatIffCode(cur, fi, seat, set);
      if (v && !same(v, cur)) out.push({ k, v });
    };
  if (o.mode2 !== false) one('Mode2 Code', o.m2set || 0);
  one('Mode3A Code', o.m3set || 0);
  for (let n = 0; n < 48 && String(get(`TIME ${n} Criteria`)) !== ''; n++) one(`TIME ${n} Mode3A Code`, o.m3set || 0);
  return out;
}
