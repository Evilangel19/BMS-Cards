// @ts-check
// The FAOR card of the Kneeboard (1600 x 2400), in the look of the other cards of the program (DEAD, SEAD): the kind and the flight, four boxes (the threat
// axis, COMMIT with the weapons control, STOP with DROP, the time on station), the warnings of the page, the picture of the map of the page with the FAOR
// drawn on it, the FEZ and the ROE in two columns, the calls.
// D: {kind, title, sub, box [[label, big, small, red] x4], warn [text], rows [[label, value, red]], calls [text], px (the map picture and the FAOR in its
//     pixels: {img, coast, nm (px per NM), fez, commit, stop, hw, hwName, cap, stn (px), threat [a, b], labels {commit, stop, fez, stn, threat}}) | null}
import { kbPx, inkCard } from './cardink.js';

export const FAC_W = 1600,
  FAC_H = 2400;
const BG = '#f4f6f8',
  TX = '#111827',
  MU = '#3f4856',
  LN = '#a4aebb',
  AC = '#1f8a4c',
  BAD = '#b91c1c',
  HD = '#374151',
  F = 'system-ui, Segoe UI, sans-serif';
const COL = { fez: '#4aa3ff', commit: '#f0b040', stop: '#ef4444', hw: '#ffffff', cap: '#4cc38a' };
const TOP = 190;
const rowsH = D => 50 + Math.ceil(D.rows.length / 2) * 40;
const callsH = D => 70 + D.calls.length * 38;
/** the box of the map: under the boxes and the warnings, over the FEZ and the calls */
export function faorBox(D) {
  const y = TOP + 210 + Math.min(3, D.warn.length) * 66 + 10,
    bottom = FAC_H - 56 - 20 - callsH(D) - rowsH(D) - 20;
  return { x: 40, y, w: FAC_W - 80, h: Math.max(300, bottom - y) };
}
/** @param {CanvasRenderingContext2D} x */
export function drawFaorCard(x, D) {
  inkCard(x);
  const W = FAC_W,
    H = FAC_H,
    font = (w, s) => (x.font = w + ' ' + kbPx(s) + 'px ' + F),
    text = (t, X, Y, c = TX, a = 'left') => {
      x.fillStyle = c;
      x.textAlign = /** @type {CanvasTextAlign} */ (a);
      x.fillText(t, X, Y);
    },
    fitText = (t, X, Y, maxW, c = TX) => {
      let s = String(t);
      while (s.length > 4 && x.measureText(s).width > maxW) s = s.slice(0, -2);
      text(s.length < String(t).length ? s.replace(/\s+\S*$/, '') + '…' : s, X, Y, c);
    };
  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, 0, W, 170);
  font('700', 30);
  text('FAOR · ' + D.kind, 40, 56, '#1d4ed8');
  text('BMS CARDS', W - 40, 56, AC, 'right');
  font('700', 48);
  fitText(D.title, 40, 116, W - 80);
  font('500', 28);
  fitText(D.sub, 40, 156, W - 80, MU);
  // the four boxes
  let y = TOP;
  const bw = (W - 80 - 3 * 16) / 4;
  D.box.forEach(([l, b, s, red], i) => {
    const bx = 40 + i * (bw + 16);
    x.fillStyle = '#fff';
    x.strokeStyle = red ? BAD : i ? LN : '#1d4ed8';
    x.lineWidth = i && !red ? 2 : 4;
    x.beginPath();
    x.roundRect(bx, y, bw, 190, 12);
    x.fill();
    x.stroke();
    font('600', 22);
    text(l, bx + 22, y + 40, MU);
    font('800', 50);
    fitText(b, bx + 22, y + 112, bw - 40, red ? BAD : TX);
    font('500', 22);
    fitText(s, bx + 22, y + 160, bw - 40, MU);
  });
  y += 210;
  // the warnings (three at most)
  D.warn.slice(0, 3).forEach(w => {
    x.fillStyle = '#fde8e8';
    x.strokeStyle = BAD;
    x.lineWidth = 3;
    x.beginPath();
    x.roundRect(40, y, W - 80, 56, 10);
    x.fill();
    x.stroke();
    font('700', 24);
    fitText('⚠ ' + w, 64, y + 37, W - 130, BAD);
    y += 66;
  });
  // the map (its picture is dark already: left as it is in the dark look)
  const B = faorBox(D);
  /** @type {any} */ (x).__raw = true;
  map(x, D, B.x, B.y, B.w, B.h);
  /** @type {any} */ (x).__raw = false;
  // the FEZ and the ROE: two columns of label / value
  y = B.y + B.h + 20;
  font('700', 26);
  text('FEZ · ROE', 40, y + 30, HD);
  y += 50;
  const half = Math.ceil(D.rows.length / 2),
    colX = [40, W / 2 + 10];
  D.rows.forEach(([l, v, red], i) => {
    const c = i < half ? 0 : 1,
      ry = y + (i % half) * 40;
    font('600', 21);
    text(l, colX[c], ry + 27, MU);
    font('700', 23);
    fitText(String(v), colX[c] + 210, ry + 27, W / 2 - 270, red ? BAD : TX);
    x.strokeStyle = LN;
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(colX[c], ry + 38);
    x.lineTo(colX[c] + W / 2 - 60, ry + 38);
    x.stroke();
  });
  // the calls
  y = B.y + B.h + 20 + rowsH(D) + 20;
  font('700', 26);
  text('CALLS', 40, y + 30, HD);
  y += 50;
  D.calls.forEach(t => {
    font('600', 24);
    fitText(t, 40, y + 27, W - 80);
    y += 38;
  });
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, H - 56, W, 56);
  font('600', 22);
  text('FOR SIMULATION USE ONLY · FALCON BMS', W / 2, H - 20, MU, 'center');
}

function map(x, D, PX, PY, PW, PH) {
  x.save();
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.clip();
  x.fillStyle = '#0d1a22';
  x.fillRect(PX, PY, PW, PH);
  const p = D.px;
  if (p && p.img) {
    const s = Math.min(PW / p.img.width, PH / p.img.height),
      iw = p.img.width * s,
      ih = p.img.height * s,
      ox = PX + (PW - iw) / 2,
      oy = PY + (PH - ih) / 2;
    x.drawImage(p.img, ox, oy, iw, ih);
    const Q = q => /** @type {[number, number]} */ ([ox + q[0] * s, oy + q[1] * s]),
      path = (pts, col, w, dash, close, fill) => {
        if (!pts || pts.length < 2) return;
        x.beginPath();
        pts.forEach((q, i) => (i ? x.lineTo(...Q(q)) : x.moveTo(...Q(q))));
        if (close) x.closePath();
        if (fill) {
          x.fillStyle = fill;
          x.fill();
        }
        x.setLineDash([]);
        x.lineWidth = w + 4;
        x.strokeStyle = 'rgba(0,0,0,.5)';
        x.stroke();
        x.setLineDash(dash);
        x.lineWidth = w;
        x.strokeStyle = col;
        x.stroke();
        x.setLineDash([]);
      };
    // the station rings, the FEZ, the lines
    p.cap.forEach(c => {
      const [a, b] = Q(c);
      x.setLineDash([6, 10]);
      x.lineWidth = 2.5;
      x.strokeStyle = COL.cap;
      x.beginPath();
      x.arc(a, b, p.stn * s, 0, 7);
      x.stroke();
      x.setLineDash([]);
    });
    path(p.fez, COL.fez, 4, [], true, 'rgba(74,163,255,.12)');
    path(p.commit, COL.commit, 4, [18, 12]);
    path(p.stop, COL.stop, 5, []);
    if (p.hw) path(p.hw, COL.hw, 4, [20, 14]);
    if (p.cap.length > 1) path(p.cap, COL.cap, 8, []);
    path(p.threat, COL.stop, 2.5, [4, 8]);
    p.cap.forEach(c => {
      const [a, b] = Q(c);
      x.fillStyle = COL.cap;
      x.strokeStyle = '#000';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(a, b, 11, 0, 7);
      x.fill();
      x.stroke();
    });
    // the labels, apart from each other
    const placed = [],
      put = (q, t, col) => {
        if (!q || !t) return;
        let [X, Y] = Q(q);
        x.font = '700 ' + kbPx(24) + 'px ' + F;
        const w = x.measureText(t).width + 16;
        X = Math.min(Math.max(X + 14, PX + 12), PX + PW - w - 4);
        Y = Math.min(Math.max(Y + 8, PY + 40), PY + PH - 16);
        for (
          let k = 0;
          k < 8 && placed.some(r => X < r[0] + r[2] && r[0] < X + w && Y - 26 < r[1] + 34 && r[1] < Y + 8);
          k++
        )
          Y += 36;
        placed.push([X, Y - 26, w]);
        tag(x, t, X, Y, col);
      };
    const L = p.labels || {};
    put(p.threat && p.threat[1], L.threat, COL.stop);
    put(p.commit[1], L.commit, COL.commit);
    put(p.stop[1], L.stop, COL.stop);
    put(p.fez[3], L.fez, COL.fez);
    if (p.hw) put(p.hw[1], 'HARDWALL ' + (p.hwName || ''), COL.hw);
    put(p.cap[p.cap.length - 1], L.stn, COL.cap);
    if (p.nm > 0) {
      const Ls = 10 * p.nm * s;
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(PX + 20, PY + PH - 70, Ls + 40, 50);
      x.strokeStyle = '#fff';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(PX + 40, PY + PH - 32);
      x.lineTo(PX + 40 + Ls, PY + PH - 32);
      x.stroke();
      x.font = '600 ' + kbPx(22) + 'px ' + F;
      x.fillStyle = '#fff';
      x.textAlign = 'left';
      x.fillText('10 NM', PX + 40, PY + PH - 42);
    }
    if (p.coast) {
      x.font = '500 ' + kbPx(20) + 'px ' + F;
      x.fillStyle = '#cbd5e1';
      x.textAlign = 'right';
      x.fillText('Offline coastlines (the map tiles could not be read)', PX + PW - 20, PY + PH - 20);
    }
  } else {
    x.font = '500 ' + kbPx(28) + 'px ' + F;
    x.fillStyle = '#cbd5e1';
    x.textAlign = 'center';
    x.fillText('No map picture: show the map on the FAOR page first.', PX + PW / 2, PY + PH / 2);
  }
  x.restore();
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.stroke();
}
function tag(x, t, X, Y, col) {
  x.font = '700 ' + kbPx(24) + 'px ' + F;
  x.textAlign = 'left';
  const w = x.measureText(t).width;
  x.fillStyle = 'rgba(0,0,0,.7)';
  x.beginPath();
  x.roundRect(X - 8, Y - 26, w + 16, 34, 6);
  x.fill();
  x.fillStyle = col;
  x.fillText(t, X, Y);
}
