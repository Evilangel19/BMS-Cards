// The ROE / SOP card of the Kneeboard ("Add card" on Squadron > ROE / SOP): the whole text of the choices, not shortened, in order: ROE by section, SOP by
// phase (every topic chosen). One card when everything fits; else ROE on one card and SOP on another (more SOP cards only when even the smaller text
// does not fit). Drawn on a canvas of the size of a Kneeboard card (800 x 1200, at 2x).
import { fullText } from '../core/roesop.js';

const W = 1600,
  H = 2400,
  M = 80;
// the blocks of a part: a big heading, then sections (a small heading) with their entries ("Label" + text)
function blocksOf(T, part) {
  const B = [];
  if (part == 'roe') {
    T.roe.forEach(([lab, L]) => B.push({ sec: lab, items: L.map(t => ['', t]) }));
    if (T.roeFree.length) B.push({ sec: 'Other', items: T.roeFree.map(t => ['', t]) });
  } else {
    T.sop.forEach(([ph, L]) => B.push({ sec: ph, items: L }));
    if (T.sopFree.length) B.push({ sec: 'Other', items: T.sopFree.map(t => ['', t]) });
  }
  return B;
}
const wrap = (x, t, w) => {
  const out = [];
  let cur = '';
  String(t)
    .split(/\s+/)
    .forEach(wd => {
      const q = cur ? cur + ' ' + wd : wd;
      if (cur && x.measureText(q).width > w) {
        out.push(cur);
        cur = wd;
      } else cur = q;
    });
  if (cur) out.push(cur);
  return out;
};
// the lines of a part at the scale k: [{kind, text, h, lab?}]
// tight: a small heading, line height 1.18, little room between the entries; the column of the labels as wide as the longest label
function linesOf(x, B, k) {
  const L = [],
    fs = 34 * k;
  x.font = 'bold ' + fs + 'px Arial';
  const lw = Math.min(
    390 * k,
    Math.max(200 * k, ...B.flatMap(b => b.items.map(([lab]) => (lab ? x.measureText(lab).width + 34 * k : 0))))
  );
  B.forEach(b => {
    L.push({ kind: 'sec', text: b.sec, h: SEC * k });
    b.items.forEach(([lab, t]) => {
      x.font = fs + 'px Arial';
      const w = W - 2 * M - (lab ? lw : 24 * k),
        R = wrap(x, t, w);
      R.forEach((r, i) =>
        L.push({ kind: 'it', lab: i ? '' : lab, text: r, ind: lab ? lw : 24 * k, bullet: !lab && !i, h: fs * 1.18 })
      );
      L[L.length - 1].h += 3 * k;
    });
    L[L.length - 1].h += 6 * k;
  });
  return L;
}
const SEC = 48; // the height of the heading of a section (at the scale 1)
const sum = L => L.reduce((s, l) => s + l.h, 0);
const HEAD = 110, // the title of the card
  BAND = 68; // the band with the name of a part
// the cards (one or two): [{title: 'ROE / SOP' | 'ROE / SOP (2)', parts: [[name, lines, k]]}]; plan.cut when the end did not fit
export function roeCardPlan(sel, x) {
  const T = fullText(sel),
    room = H - 2 * M - HEAD,
    R = blocksOf(T, 'roe'),
    S = blocksOf(T, 'sop'),
    part = (name, B, k) => [name, linesOf(x, B, k), k],
    both = k => [R.length ? part('ROE', R, k) : null, S.length ? part('SOP', S, k) : null].filter(Boolean),
    h = P => P.reduce((s, p) => s + BAND * p[2] + sum(p[1]), 0);
  if (!R.length && !S.length) return [];
  for (const k of [1, 0.92, 0.85, 0.78]) {
    const P = both(k);
    if (h(P) <= room) return [{ title: 'ROE / SOP', parts: P }];
  }
  // two cards at most: ROE and SOP go on in one flow (the SOP may start on the first card), the text smaller until it fits; what does not fit even at
  // the smallest size is cut (cut = true, the page says so)
  const pack = (k, cut) => {
    const C = [
      { title: 'ROE / SOP', parts: [], band: 1 },
      { title: 'ROE / SOP (2)', parts: [], band: 1 },
    ];
    let ci = 0,
      used = 0,
      over = false;
    for (const [name, L] of both(k)) {
      const first = L[0] ? L[0].h + (L[1] ? L[1].h : 0) : 0;
      if (used && used + BAND * k + first > room) {
        ci++;
        used = 0;
      }
      if (ci > 1) {
        over = true;
        break;
      }
      let cur = [name, [], k];
      C[ci].parts.push(cur);
      used += BAND * k;
      for (let i = 0; i < L.length; i++) {
        const l = L[i],
          need = l.h + (l.kind == 'sec' && L[i + 1] ? L[i + 1].h : 0); // a section heading never alone at the bottom
        if (used + need > room) {
          ci++;
          if (ci > 1) {
            over = true;
            break;
          }
          cur = [name + ' (cont.)', [], k];
          C[ci].parts.push(cur);
          used = BAND * k;
        }
        cur[1].push(l);
        used += l.h;
      }
      if (over) break;
    }
    if (over && !cut) return null;
    const out = C.filter(c => c.parts.length);
    if (out.length == 1) out[0].title = 'ROE / SOP';
    if (over) out.cut = true;
    return out;
  };
  for (const k of [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6]) {
    const P = pack(k);
    if (P) return P;
  }
  return pack(0.6, true);
}
// draws one card; sub = the flight or the preset
export function roeCardDraw(c, x, sub) {
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#111';
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = 'bold 56px Arial';
  x.fillText(c.title, M, M + 50);
  if (sub) {
    x.font = '34px Arial';
    x.fillStyle = '#555';
    x.fillText(sub, M, M + 90);
  }
  x.fillStyle = '#111';
  x.fillRect(M, M + HEAD - 12, W - 2 * M, 4);
  let y = M + HEAD;
  c.parts.forEach(([name, L, k]) => {
    // the part: a grey band with its name (when the card holds two parts)
    if (c.band || c.parts.length > 1 || c.title.indexOf(name) != 0) {
      x.fillStyle = '#d6d6d6';
      x.fillRect(M, y, W - 2 * M, 54 * k);
      x.fillStyle = '#111';
      x.font = 'bold ' + 40 * k + 'px Arial';
      x.fillText(name, M + 18, y + 40 * k);
      y += BAND * k;
    } else y += 10 * k;
    const fs = 34 * k;
    L.forEach(l => {
      if (l.kind == 'sec') {
        x.font = 'bold ' + 34 * k + 'px Arial';
        x.fillStyle = '#1f6b3a';
        x.fillText(l.text, M, y + 34 * k);
        x.fillStyle = '#bbb';
        x.fillRect(M, y + 41 * k, W - 2 * M, 2);
      } else {
        x.fillStyle = '#111';
        if (l.lab) {
          x.font = 'bold ' + fs + 'px Arial';
          x.fillText(l.lab, M + 10, y + fs, l.ind - 30);
        }
        x.font = fs + 'px Arial';
        if (l.bullet) x.fillText('•', M + 4, y + fs);
        x.fillText(l.text, M + l.ind, y + fs);
      }
      y += l.h;
    });
  });
}
export const CARD_W = W,
  CARD_H = H;
