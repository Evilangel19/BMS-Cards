// The columns of the flight plan of the Datacard (1600 x 1200 space of the blank). The blank has 8 columns after the steerpoint number; the MSA column (new) sits next to
// Alt, the other columns were made narrower (STPT, HDG, Dist, Alt, Min.Fuel) with the same size of text, and Action / TOS are wider.
// OLD: start and width (with the gap) of the columns of the earlier blank; NEW: the same columns now. The field keys do not change (fp<row>_<j>, MSA is fp<row>_11).
export const FP_OLD = [27, 76, 182, 317, 395, 473, 552, 630, 708, 787]; // STPT, Action, TOS, HDG, Dist, Mach/TAS, Alt, Min.Fuel, Formation, end
export const FP_NEW = [27, 71, 195, 335, 387, 441, 520, 582, 640, 710, 787]; // the same + MSA after Alt (index 7)
export const FP_NAMES = ['STPT', 'Action', 'TOS', 'HDG', 'Dist', 'Mach/TAS', 'Alt', 'MSA', 'Min.Fuel', 'Formation'];
// the old column (index into FP_OLD) of a new one (null = the MSA column)
const OLDI = [0, 1, 2, 3, 4, 5, 6, null, 7, 8];
export const fpStart = j => FP_NEW[j];
export const fpSpan = j => FP_NEW[j + 1] - FP_NEW[j];
// centre of a cell of a new column (the cells are 2 px smaller than the column)
export const fpCx = j => FP_NEW[j] + (fpSpan(j) - 2) / 2;
const oldSpan = i => FP_OLD[i + 1] - FP_OLD[i];
// index (of the old table) of the column that holds x, null outside the flight plan columns
export const oldCol = x => {
  if (x < FP_OLD[0] - 1 || x >= FP_OLD[9] - 1) return null;
  for (let i = 0; i < 9; i++) if (x < FP_OLD[i + 1] - 1) return i;
  return null;
};
const newOf = i => OLDI.indexOf(i);
// a cell [x, y, w, h, g] of the old blank -> the new one (a cell that starts at the start of a column follows it; a smaller one is moved with the centre of its column)
export function fpCell(c) {
  const [x, y, w, h, g] = c,
    i = oldCol(x);
  if (i === null) return c;
  const j = newOf(i);
  if (Math.abs(x - FP_OLD[i]) <= 2) return [FP_NEW[j] + (x - FP_OLD[i]), y, fpSpan(j) - (oldSpan(i) - w), h, g];
  const sh = FP_NEW[j] + fpSpan(j) / 2 - (FP_OLD[i] + oldSpan(i) / 2);
  return [x + sh, y, w, h, g];
}
// the MSA copy of an Alt cell
export function fpMsaCell(c) {
  const [x, y, w, h, g] = c,
    j = 7;
  return [FP_NEW[j] + (x - FP_OLD[6]), y, fpSpan(j) - (oldSpan(6) - w), h, g];
}
// a text (left x, or centre x when `ce`) of the old blank -> its new x
export function fpTextX(x) {
  const i = oldCol(x);
  if (i === null) return x;
  const j = newOf(i);
  return x + (FP_NEW[j] + fpSpan(j) / 2 - (FP_OLD[i] + oldSpan(i) / 2));
}
