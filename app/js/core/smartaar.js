// @ts-check
// The Smart AAR card (core/smartcard.js look) of Performance > AAR: the key numbers, the track of the tanker with the ARIP and the join, short blocks in
// two columns, the Tanker topics of the SOP of the flight in a red box at the bottom. The Smart TASMO card (core/tasmopage.js) has the same look, its
// threats in the red box.
// D: {title, right, key, plan: P (core/smartaa.js), legend, blocks: [[head, [lines]]], sop: [text], planTitle?, boxTitle?, empty? (the line of an empty box)}
import { scFrame, scKey, scSec, scEnd, scText, scLine, wrap } from './smartcard.js';
import { aaPlanView, blocks } from './smartaa.js';

const RED = '#cc0000';

/** @param {CanvasRenderingContext2D} x */
export function drawSmartAar(x, D) {
  scFrame(x, D.title, D.right);
  scKey(x, D.key);
  scSec(x, 146, D.planTitle || 'TRACK');
  aaPlanView(x, D.plan, [12, 160, 436, 196]);
  if (D.legend) scText(x, 14, 370, 10, D.legend, { c: '#555555' });
  scSec(x, 378);
  // the SOP box: its lines from the bottom up
  const L = (D.sop.length ? D.sop : [D.empty || 'NONE CHOSEN: SQUADRON > ROE / SOP > SOP > TANKER']).flatMap(t =>
      wrap(x, '• ' + t, 12, 424)
    ),
    rows = L.slice(0, 6),
    y0 = 684 - 10 - rows.length * 15 - 22;
  blocks(x, D.blocks, 396, y0 - 14);
  scLine(
    x,
    [
      [8, y0],
      [452, y0],
      [452, 684],
      [8, 684],
    ],
    { close: true, w: 2, c: RED }
  );
  scText(x, 16, y0 + 17, 12, D.boxTitle || 'SOP TANKER', { c: RED, w: 700 });
  rows.forEach((l, i) => scText(x, l.startsWith('   ') ? 26 : 16, y0 + 34 + i * 15, 12, l.trim()));
  scEnd(x);
}
