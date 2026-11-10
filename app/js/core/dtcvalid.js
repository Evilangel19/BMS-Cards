// @ts-check
// Checks of the values typed on the Data Cartridge page before they are written into the DTC: a value the game cannot use is refused (the box goes back to the old value).

/** a radio frequency typed in MHz -> the DTC value in kHz, or null: the radios of the jet go from 30 MHz (VHF FM) to 399.975 MHz (UHF); "2525" (the point forgotten) is refused
 * @param {number} mhz */
export function freqKhz(mhz) {
  if (mhz === 0) return '0'; // 0 = no frequency in the preset (as BMS writes the unused ones)
  if (!isFinite(mhz) || mhz < 30 || mhz >= 400) return null;
  return String(Math.round(mhz * 1000));
}
/** an ILS frequency typed in MHz -> the DTC value (hundredths of MHz), or null: the ILS band is 108.10 - 111.95 MHz
 * @param {number} mhz */
export function ilsVal(mhz) {
  if (mhz === 0) return '0'; // 0 = no ILS in the preset (as BMS writes the unused ones)
  if (!isFinite(mhz) || mhz < 108 || mhz > 111.975) return null;
  return String(Math.round(mhz * 100));
}
/** an IFF code as the DTC keeps it, or null: octal digits only; Mode 1 = two digits (the second 0-3), Modes 2 and 3/A = four digits (shorter codes get leading zeros)
 * @param {string} x @param {'m1'|'m4'} kind */
export function iffCode(x, kind) {
  const v = String(x == null ? '' : x).trim();
  if (kind == 'm1') return /^[0-7]?[0-3]$/.test(v) ? v.padStart(2, '0') : null;
  return /^[0-7]{1,4}$/.test(v) ? v.padStart(4, '0') : null;
}
