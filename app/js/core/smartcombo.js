// @ts-check
// The combined Smart card (core/smartcard.js look): one page for the mission of the flight. A fixed base (the target, the weather over it, the ROE / SOP)
// under a module that changes with the task: the attack (Pop-up, HADB, TOSS: its key numbers and its side profile), the SEAD (the timeline of the SAMs),
// the DEAD (the plan around the SAM and the events). The weather is checked against the module: the highest point of the attack, or the cruise level,
// against the clouds over the target.
// C: {title, right, key, mod: {kind: 'attack', side, line} | {kind: 'sead', sead} | {kind: 'dead', dead} | {kind: 'aa', plan, lines}, tgt (the data of the Smart Target card) | null,
//     sam {name, text} (SEAD / DEAD: the SAM in place of the target), wx (wxAtTarget) | null, windAlt, check {alt, label}, roe (the data of the Smart ROE /
//     SOP card) | null, last [line, red line]}
import { scFrame, scKey, scSec, scEnd, scText, scLine, scSide, scTri, scArrow, scRing, wrap } from './smartcard.js';
import { seadTimeline, deadPlanView, scHhmm } from './smartsead.js';
import { KSIZE } from './tgtdraw.js';
import { aaPlanView } from './smartaa.js';

const RED = '#cc0000';

/** @param {CanvasRenderingContext2D} x */
export function drawSmartCombined(x, C) {
  scFrame(x, C.title, C.right);
  scKey(x, C.key);
  // ---- the module
  const M = C.mod;
  if (M.kind == 'attack') {
    scSec(x, 146, M.label || 'ATTACK');
    scSide(x, M.side, [24, 166, 416, 128]);
    if (M.line) scText(x, 12, 324, 12, M.line);
  } else if (M.kind == 'sead') {
    seadTimeline(x, M.sead, 146, 'HARM TIMELINE', 4, 100);
    if (M.line) scText(x, 12, 326, 11, M.line);
  } else if (M.kind == 'aa') {
    scSec(x, 146, M.label || 'A-A');
    aaPlanView(x, M.plan, [12, 160, 250, 160]);
    (M.lines || []).slice(0, 10).forEach((t, i) => {
      const [s, red] = Array.isArray(t) ? t : [t, false];
      scText(x, 272, 176 + i * 15, 11, String(s), { c: red ? RED : undefined, w: i ? 400 : 700 });
    });
    if (M.line) scText(x, 12, 328, 11, M.line);
  } else {
    scSec(x, 146, 'TACTIC');
    deadPlanView(x, M.dead, [12, 166, 250, 150]);
    M.dead.events.slice(0, 5).forEach(([t, s], i) => {
      scText(x, 272, 178 + i * 29, 13, scHhmm(t), { w: 700 });
      wrap(x, s, 11, 176)
        .slice(0, 1)
        .forEach(l => scText(x, 272, 192 + i * 29, 11, l, { c: '#444444' }));
    });
    if (M.line) scText(x, 12, 328, 11, M.line);
  }
  // ---- the target (or the SAM), then the weather over it at its right; without a target (the Target page not opened yet) the weather takes the width
  scSec(x, 334);
  const T = C.tgt,
    wide = !C.sam && !T,
    WX = wide ? 12 : 242;
  if (!wide) {
    scLine(
      x,
      [
        [230, 334],
        [230, 500],
      ],
      { w: 1 }
    );
    scText(x, 12, 350, 12, C.sam ? 'TARGET SAM' : 'TARGET', { w: 700 });
  }
  if (C.sam) {
    scText(x, 12, 368, 12, C.sam.name);
    (C.sam.text || []).slice(0, 2).forEach((t, i) => scText(x, 12, 384 + i * 16, 11, t, { c: '#444444' }));
    scRing(x, 120, 452, 38, { c: RED, w: 1, dash: [5, 3] });
    scTri(x, 120, 452, 7);
  } else if (T) {
    const k = v => (T.key.find(z => z[0] == v) || [])[1] || '--';
    scText(x, 12, 368, 12, String(k('TARGET')) + ' · ELEV ' + k('ELEV'));
    scText(x, 12, 384, 12, String(k('LAT')) + ' ' + k('LONG'));
    scText(
      x,
      12,
      400,
      11,
      'DMPI ' + k('DMPI') + ' · ATK ' + k('ATK HDG') + (k('STATUS') != '--' ? ' · ' + k('STATUS') : ''),
      { c: '#444444' }
    );
    sketch(x, T, [12, 406, 212, 90]);
  }
  const W = C.wx;
  scText(x, WX, 350, 12, C.wxLabel || 'WEATHER AT TGT', { w: 700 });
  if (W) {
    const cells = [
      ['CLOUD', W.cloud],
      [C.windLabel || 'WIND', W.wind],
      ['0 °C', W.z0],
      ['QNH', W.qnh],
    ];
    cells.forEach(([l, v], i) => {
      const a = wide ? 12 + i * 111 : 242 + (i % 2) * 100,
        b = wide ? 370 : 370 + Math.floor(i / 2) * 40;
      scText(x, a, b, 10, String(l), { c: '#666666', w: 700 });
      scText(x, a, b + 18, 15, String(v), { w: 700 });
    });
    wrap(x, W.taf || '', wide ? 13 : 11, wide ? 432 : 204)
      .slice(0, wide ? 4 : 2)
      .forEach((l, i) => scText(x, WX, (wide ? 414 : 452) + i * (wide ? 16 : 14), wide ? 13 : 11, l.trim()));
    if (C.check) scText(x, WX, 492, 12, C.check.label, { c: C.check.bad ? RED : undefined, w: 700 });
  } else scText(x, WX, 370, 12, 'no weather data', { c: '#888888' });
  // ---- the ROE / SOP
  scSec(x, 500, 'ROE / SOP');
  const R = C.roe;
  if (R) {
    const want = ['JOKER', 'BINGO', 'LASER', 'M3', 'PRESET'];
    want.forEach((l, i) => {
      const it = R.key.find(z => z[0] == l) || [l, '--'];
      scText(x, 12 + i * 89, 536, 10, l, { c: it[2] ? RED : '#666666', w: 700 });
      scText(x, 12 + i * 89, 554, 14, String(it[1]).slice(0, 10), { c: it[2] ? RED : undefined, w: 700 });
    });
    const rules = R.blocks.flatMap(b => b[1].map(r => (Array.isArray(r) ? r[0] : r))).slice(0, 3);
    rules.forEach((t, i) => scText(x, 12, 578 + i * 15, 12, '• ' + (wrap(x, t, 12, 420)[0] || ''), {}));
  } else scText(x, 12, 540, 12, 'no ROE / SOP chosen', { c: '#888888' });
  // ---- the last lines
  scSec(x, 626);
  const L = C.last || [];
  if (L[0]) scText(x, 12, 646, 12, fit(x, L[0]));
  if (L[1]) scText(x, 12, 664, 12, fit(x, L[1]), { c: RED });
  scText(x, 12, 684, 10, C.foot || '', { c: '#888888' });
  scEnd(x);
}
const fit = (x, t) => {
  let s = String(t);
  x.font = '400 12px monospace';
  while (s.length > 4 && x.measureText(s).width > 436) s = s.slice(0, -2) + '…';
  return s;
};
// a small sketch of the target: the buildings and the DMPIs, the attack arrow
function sketch(x, T, box) {
  const [bx, by, bw, bh] = box,
    pts = [...T.feats, ...T.dmpis, { x: T.cx, y: T.cy }];
  if (!pts.length) return;
  const xs = pts.map(p => p.x),
    ys = pts.map(p => p.y),
    span = Math.max(
      0.5,
      (Math.max(...xs) - Math.min(...xs)) * 1.3,
      ((Math.max(...ys) - Math.min(...ys)) * 1.3 * bw) / bh
    ),
    sc = bw / span,
    cx = (Math.max(...xs) + Math.min(...xs)) / 2,
    cy = (Math.max(...ys) + Math.min(...ys)) / 2,
    PX = g => bx + bw / 2 + (g - cx) * sc,
    PY = g => by + bh / 2 - (g - cy) * sc;
  x.save();
  x.beginPath();
  x.rect(bx, by, bw, bh);
  x.clip();
  T.feats.forEach(f => {
    const [w, h] = KSIZE[f.kind] || KSIZE.adm,
      a = PX(f.x),
      b = PY(f.y),
      pw = Math.max(3, (w / 1000) * sc),
      ph = Math.max(2, (h / 1000) * sc);
    scLine(
      x,
      [
        [a - pw / 2, b - ph / 2],
        [a + pw / 2, b - ph / 2],
        [a + pw / 2, b + ph / 2],
        [a - pw / 2, b + ph / 2],
      ],
      { close: true, fill: '#ffffff', w: 1 }
    );
  });
  T.dmpis.forEach(d => {
    scTri(x, PX(d.x), PY(d.y), 6);
    scText(x, PX(d.x) + 8, PY(d.y) + 5, 12, String(d.n), { c: RED, w: 700, halo: true });
  });
  if (T.hdgTrue != null && T.dmpis.length) {
    const d = T.dmpis[0],
      A = (T.hdgTrue * Math.PI) / 180,
      a = PX(d.x) - Math.sin(A) * 14,
      b = PY(d.y) + Math.cos(A) * 14,
      a0 = a - Math.sin(A) * 40,
      b0 = b + Math.cos(A) * 40;
    scLine(
      x,
      [
        [a0, b0],
        [a, b],
      ],
      { w: 2 }
    );
    scArrow(x, a, b, Math.atan2(b - b0, a - a0), 7);
  }
  x.restore();
}
