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
  // box2 (AAR): the checklist of the method and the calls in the box of the SOP, on its right
  const two = !!(D.box2 && D.box2.length),
    ph = 196;
  aaPlanView(x, D.plan, [12, 160, 436, ph]);
  if (D.legend) scText(x, 14, 174 + ph, 10, D.legend, { c: '#555555' });
  scSec(x, 182 + ph);
  // the SOP box: its lines from the bottom up
  const W = two ? 206 : 424,
    L = (D.sop.length ? D.sop : [D.empty || 'NONE CHOSEN: SQUADRON > ROE / SOP > SOP > TANKER']).flatMap(t =>
      wrap(x, '• ' + t, 12, W)
    ),
    R2 = two
      ? D.box2.flatMap(([h, rows]) => [[h, true], ...rows.flatMap(r => wrap(x, r, 11, 200).map(l => [l, false]))])
      : [],
    rows = L.slice(0, two ? 10 : 6),
    h2 = two ? R2.length * 13 + (D.box2.length - 1) * 4 - 17 : 0, // the right column starts at the title line
    hgt = Math.max(rows.length * 15, h2),
    y0 = 684 - 10 - hgt - 22;
  blocks(x, D.blocks, 200 + ph, y0 - 14);
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
  if (two) {
    scLine(
      x,
      [
        [234, y0 + 8],
        [234, 676],
      ],
      { w: 1, c: RED }
    );
    let y = y0 + 17;
    for (const [t, head] of R2) {
      if (head && y > y0 + 17) y += 4;
      scText(
        x,
        head ? 244 : t.startsWith('   ') ? 252 : 244,
        y,
        head ? 12 : 11,
        t.trim(),
        head ? { c: RED, w: 700 } : {}
      );
      y += 13;
    }
  }
  scEnd(x);
}
