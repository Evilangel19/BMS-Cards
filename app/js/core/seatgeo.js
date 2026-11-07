// Where the round buttons of the pilot seat sit (app/seat.js) and how far the text of their cells is pushed to the right (app/cardview.js).
// The buttons are HTML over the card, at the LEFT of the first cell of a row (the Name cell of a pilot, the Callsign cell of a flight); the text of that cell starts
// after them, so a button never covers a letter. Everything here is in pixels of the card canvas (2048 wide): the buttons are scaled with the card, the indent is drawn into it.
const KX = 2048 / 1600,
  KY = 2048 / 1200;
export const SEAT_PAD = 6; // from the left edge of the cell to the button
export const SEAT_GAP = 8; // from the button to the first letter
// the diameter of the button in a cell h pixels high (the tall cells of the roll call get the same button as the datacard)
export const seatBtn = h => Math.round(Math.max(22, Math.min(32, h * 0.8)));
// the space the text leaves at the left of such a cell
export const seatIndent = h => SEAT_PAD + seatBtn(h) + SEAT_GAP;
// the same, in card units (1600 x 1200) for a cell hCard units high
export const seatShift = hCard => seatIndent(hCard * KY) / KX;
// the cells that have a button: the Name of the pilots and the Callsign of the package flights (Datacard), the Name of the pilots and the Callsign of the roll call (MDC format)
export const seatCell = (k, mdc) => (mdc ? /^(fl[0-3]_0|rc[0-7]_0)$/ : /^(fl[0-3]_0|pk[0-4]_0)$/).test(k);
// the nominal height of a cell of the Datacard (card units): the rows of the template are 24 units apart
export const DC_ROW = 24;
