// @ts-check
// The DEAD card of the Kneeboard (1600 x 2400): your role in big (four boxes: the role, then the times and the headings of it), the warnings (one fire
// control radar on each launcher; the altitude or the speed), then the map (kind 'map': the picture of the Map page with the plan drawn on it) or the
// scheme (kind 'sch': a lane for each seat), the steps (yours green), the nav offsets of the anchors and the roles of the flight.
// D: {title, sub, tgt, rings, seatName, box[[label, big, small] x4], telar, alt, steps[{me, s}], oa, seats[{me, seat, role, times}],
//     lanes[{seat, me, col, name, ph[{a, b, k, l}], mk[{t, s}]}], px (the map picture and the plan in its pixels) | null}
import { SD_COL } from './seadcard.js';

// the phases of the scheme (the page and the card): their colour and name
export const DD_PH = {
  run: ['#94a3b8', 'approach'],
  hold: ['#f59e0b', 'anchor, mark'],
  arc: ['#2dd4bf', 'the arc, bait'],
  def: ['#f87171', 'defend, back to the anchor'],
  atk: ['#3b82f6', 'attack'],
  cover: ['#e879f9', 'cover'],
  harm: [SD_COL.HARM, 'HARM in flight'],
};
export const DDC_W = 1600,
  DDC_H = 2400;
const BG = '#f4f6f8',
  TX = '#111827',
  MU = '#5b6573',
  LN = '#c9d1db',
  AC = '#1f8a4c',
  BAD = '#b91c1c',
  HD = '#374151', // the section titles
  F = 'system-ui, Segoe UI, sans-serif';
const hm = t => {
  const s = Math.round(t / 1000) % 86400;
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
};
const TOP = 190;
const warnH = D => (D.telar >= 0 ? 84 : 0) + (D.alt ? 70 : 0);
const stepsH = D => 50 + Math.min(8, D.steps.length) * 40;
const oaH = D => (D.oa ? 50 + 3 * 40 + 10 : 0);
const seatsH = D => 50 + 36 + D.seats.length * 40;
/** the box of the map or the scheme: under the role and the warnings, over the steps, the offsets and the flight */
export function deadBox(D) {
  const y = TOP + 60 + warnH(D) + 210 + 20,
    bottom = DDC_H - 56 - 20 - seatsH(D) - oaH(D) - stepsH(D) - 20;
  return { x: 40, y, w: DDC_W - 80, h: Math.max(300, bottom - y) };
}
/** @param {CanvasRenderingContext2D} x @param {string} kind 'map' | 'sch' */
export function drawDeadCard(x, D, kind = 'map') {
  const W = DDC_W,
    H = DDC_H,
    font = (w, s) => (x.font = w + ' ' + s + 'px ' + F),
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
  text('DEAD', 40, 56, BAD);
  text('BMS CARDS', W - 40, 56, AC, 'right');
  font('700', 48);
  text(D.title, 40, 116);
  font('500', 28);
  text(D.sub, 40, 156, MU);
  if (D.seatName) {
    font('700', 30);
    const t = 'YOUR SEAT ' + D.seatName,
      w = x.measureText(t).width + 40;
    x.fillStyle = '#374151';
    x.beginPath();
    x.roundRect(W - 40 - w, 84, w, 48, 10);
    x.fill();
    text(t, W - 60, 119, '#fff', 'right');
  }
  let y = TOP;
  font('700', 32);
  text('▲ ' + D.tgt, 40, y + 30, '#c2410c');
  font('500', 24);
  text(D.rings, 40, y + 62, MU);
  y += 80;
  // the warnings
  if (D.telar >= 0) {
    x.fillStyle = '#fde8e8';
    x.strokeStyle = BAD;
    x.lineWidth = 4;
    x.beginPath();
    x.roundRect(40, y, W - 80, 72, 10);
    x.fill();
    x.stroke();
    font('800', 30);
    text('⚠ ONE FCR ON EACH TELAR', 64, y + 46, BAD);
    font('500', 24);
    text('a hit kills one launcher (' + D.telar + ' alive): the others keep shooting', 560, y + 46, BAD);
    y += 84;
  }
  if (D.alt) {
    x.fillStyle = '#fff6c2';
    x.strokeStyle = '#d4a106';
    x.lineWidth = 3;
    x.beginPath();
    x.roundRect(40, y, W - 80, 58, 10);
    x.fill();
    x.stroke();
    font('600', 24);
    fitText('⚠ ' + D.alt, 64, y + 38, W - 130, '#7a5a00');
    y += 70;
  }
  // your role
  const bw = (W - 80 - 3 * 16) / 4;
  // green only for a launch or an attack (the 4th field); the role in its colour
  D.box.forEach(([l, b, s, go], i) => {
    const bx = 40 + i * (bw + 16);
    x.fillStyle = '#fff';
    x.strokeStyle = go ? AC : i ? LN : roleInk(b);
    x.lineWidth = i && !go ? 2 : 4;
    x.beginPath();
    x.roundRect(bx, y, bw, 190, 12);
    x.fill();
    x.stroke();
    if (!l && !b) return;
    font('600', 22);
    text(l, bx + 22, y + 40, MU);
    font('800', i ? 50 : 54);
    fitText(b, bx + 22, y + 112, bw - 40, go ? AC : i ? TX : roleInk(b));
    font('500', 22);
    fitText(s, bx + 22, y + 160, bw - 40, MU);
  });
  // the map or the scheme
  const B = deadBox(D);
  if (kind == 'sch') scheme(x, D, B.x, B.y, B.w, B.h);
  else map(x, D, B.x, B.y, B.w, B.h);
  // the steps
  y = B.y + B.h + 20;
  font('700', 26);
  text('STEPS', 40, y + 30, HD);
  y += 50;
  D.steps.slice(0, 8).forEach((o, i) => {
    if (o.me) {
      x.fillStyle = '#e8f5ee';
      x.fillRect(30, y - 2, W - 60, 38);
    }
    font(o.me ? '700' : '500', 23);
    text(i + 1 + '.', 44, y + 26, o.me ? AC : MU);
    fitText(o.s, 84, y + 26, W - 140, o.me ? AC : TX);
    y += 40;
  });
  // the nav offsets
  if (D.oa) {
    y += 10;
    font('700', 26);
    text(
      'NAV OFFSETS · FROM STPT ' + D.oa.n + (D.oa.n >= 1 && D.oa.n <= 24 ? '' : ' (TYPE THEM ON BOARD, DED)'),
      40,
      y + 30,
      HD
    );
    y += 50;
    const C = [40, 260, 520, 760, 980];
    font('600', 20);
    ['', 'BRG', 'RNG', 'ELEV', 'ANCHOR'].forEach((h, i) => text(h, C[i], y + 24, MU));
    y += 40;
    [
      ['OA1', D.oa.oa1, 'H · HUNTER', '#15803d'],
      ['OA2', D.oa.oa2, 'K · KILLER', '#1d4ed8'],
    ].forEach(([k, a, l, c]) => {
      font('700', 26);
      text(k, C[0], y + 26);
      text(String(a.brg).padStart(3, '0') + '°', C[1], y + 26);
      text(a.nm.toFixed(1) + ' NM', C[2], y + 26);
      text(Math.round(a.el || 0).toLocaleString('en-US') + ' FT', C[3], y + 26);
      text(l, C[4], y + 26, c);
      y += 40;
    });
  }
  // the flight
  y = H - 56 - 20 - seatsH(D);
  font('700', 26);
  text('THE FLIGHT', 40, y + 30, HD);
  y += 50;
  const C = [40, 340, 580];
  font('600', 20);
  ['SEAT', 'ROLE', 'TIMES'].forEach((h, i) => text(h, C[i], y + 24, MU));
  y += 36;
  D.seats.forEach(r => {
    if (r.me) {
      x.fillStyle = '#e5e7eb';
      x.fillRect(30, y, W - 60, 38);
    }
    font(r.me ? '700' : '500', 23);
    text(r.seat + (r.me ? ' · YOU' : ''), C[0], y + 27, TX);
    font('700', 23);
    text(r.role, C[1], y + 27, roleInk(r.role));
    font(r.me ? '700' : '500', 23);
    text(r.times, C[2], y + 27, r.me && r.go ? AC : TX);
    x.strokeStyle = LN;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(30, y + 38);
    x.lineTo(W - 30, y + 38);
    x.stroke();
    y += 40;
  });
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, H - 56, W, 56);
  font('600', 22);
  text('FOR SIMULATION USE ONLY · FALCON BMS', W / 2, H - 20, MU, 'center');
}
// the role colours of the page are for a dark screen: darker ones on the light card
const roleInk = r => ({ SHOOTER: '#1d4ed8', HUNTER: '#15803d', KILLER: '#1d4ed8', COVER: '#a21caf' })[r] || TX;

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
      [cx, cy] = Q(p.sam.c),
      circ = (r, col, w, dash, fill) => {
        x.setLineDash(dash);
        x.lineWidth = w;
        x.strokeStyle = col;
        x.beginPath();
        x.arc(cx, cy, r * s, 0, 7);
        if (fill) {
          x.fillStyle = fill;
          x.fill();
        }
        x.stroke();
        x.setLineDash([]);
      };
    circ(p.sam.R, p.ring, 3, [14, 10], 'rgba(255,159,26,.08)');
    circ(p.sam.Recm, '#ff3b3b', 2.5, [6, 6]);
    circ(p.sam.Rdet, p.ring, 2, [3, 9]);
    if (p.sam.rTh) circ(p.sam.rTh, SD_COL.HARM, 2.5, [12, 10]);
    if (p.sam.seek) circ(p.sam.seek, '#22d3ee', 2.5, [3, 9]);
    if (p.sam.foot && p.sam.foot.length > 2) {
      // the footprint of the HARM submode (the heart of EOM / RUK, the wedge of PB)
      x.beginPath();
      p.sam.foot.forEach((q, i) => (i ? x.lineTo(...Q(q)) : x.moveTo(...Q(q))));
      x.fillStyle = 'rgba(255,255,255,.07)';
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = '#fff';
      x.stroke();
    }
    p.paths.forEach(a => {
      if (a.pts.length < 2) return;
      x.setLineDash(a.dash ? [14, 12] : []);
      x.beginPath();
      a.pts.forEach((q, i) => (i ? x.lineTo(...Q(q)) : x.moveTo(...Q(q))));
      x.lineWidth = a.w + (a.me ? 9 : 5);
      x.strokeStyle = 'rgba(0,0,0,.55)';
      x.stroke();
      x.lineWidth = a.me ? a.w * 1.6 : a.w;
      x.strokeStyle = a.col;
      x.stroke();
      x.setLineDash([]);
    });
    p.marks.forEach(m => {
      const [mx, my] = Q(m.p);
      if (m.k == 'imp') {
        x.fillStyle = SD_COL.IMP;
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(mx, my - 15);
        x.lineTo(mx + 15, my);
        x.lineTo(mx, my + 15);
        x.lineTo(mx - 15, my);
        x.closePath();
        x.fill();
        x.stroke();
        return;
      }
      x.fillStyle = m.col;
      x.strokeStyle = '#000';
      x.lineWidth = 3;
      x.beginPath();
      if (m.k == 'anc') x.rect(mx - 10, my - 10, 20, 20);
      else x.arc(mx, my, 11, 0, 7);
      x.fill();
      x.stroke();
      if (m.l) tag(x, m.l, mx + 18, my + 34, m.tc || m.col);
    });
    x.fillStyle = p.ring;
    x.strokeStyle = '#000';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx, cy - 16);
    x.lineTo(cx + 14, cy + 11);
    x.lineTo(cx - 14, cy + 11);
    x.closePath();
    x.fill();
    x.stroke();
    tag(x, p.sam.name, cx + 22, cy - 14, p.ring);
    if (p.nm > 0) {
      const L = 10 * p.nm * s;
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(PX + 20, PY + PH - 70, L + 40, 50);
      x.strokeStyle = '#fff';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(PX + 40, PY + PH - 32);
      x.lineTo(PX + 40 + L, PY + PH - 32);
      x.stroke();
      x.font = '600 22px ' + F;
      x.fillStyle = '#fff';
      x.textAlign = 'left';
      x.fillText('10 NM', PX + 40, PY + PH - 42);
    }
    if (p.coast) {
      x.font = '500 20px ' + F;
      x.fillStyle = '#cbd5e1';
      x.textAlign = 'right';
      x.fillText('Offline coastlines (the map tiles could not be read)', PX + PW - 20, PY + PH - 20);
    }
  } else {
    x.font = '500 28px ' + F;
    x.fillStyle = '#cbd5e1';
    x.textAlign = 'center';
    x.fillText('No map picture: show the map on the DEAD page first.', PX + PW / 2, PY + PH / 2);
  }
  x.restore();
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.stroke();
}
function tag(x, t, X, Y, col) {
  x.font = '700 24px ' + F;
  x.textAlign = 'left';
  const w = x.measureText(t).width;
  x.fillStyle = 'rgba(0,0,0,.7)';
  x.beginPath();
  x.roundRect(X - 8, Y - 26, w + 16, 34, 6);
  x.fill();
  x.fillStyle = col;
  x.fillText(t, X, Y);
}
function scheme(x, D, PX, PY, PW, PH) {
  x.fillStyle = '#fff';
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.fill();
  x.stroke();
  const L = D.lanes,
    ts = L.flatMap(l => l.ph.flatMap(p => [p.a, p.b]));
  if (!ts.length) return;
  const t0 = Math.min(...ts) - 30000,
    t1 = Math.max(...ts) + 30000,
    X0 = PX + 250,
    XR = PX + PW - 30,
    Xt = t => X0 + ((t - t0) / (t1 - t0)) * (XR - X0),
    span = t1 - t0,
    step = span > 1800000 ? 300000 : span > 900000 ? 120000 : 60000,
    lh = Math.min(170, (PH - 140) / Math.max(1, L.length)),
    yy = PY + 70;
  x.font = '500 22px ' + F;
  x.textAlign = 'center';
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    x.strokeStyle = '#e5e9ee';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(Xt(t), PY + 50);
    x.lineTo(Xt(t), PY + PH - 70);
    x.stroke();
    x.fillStyle = MU;
    x.fillText(hm(t), Xt(t), PY + 38);
  }
  L.forEach((l, i) => {
    const y = yy + i * lh,
      ink = roleInk(l.name);
    x.textAlign = 'left';
    x.font = '700 28px ' + F;
    x.fillStyle = TX;
    x.fillText(l.seat + (l.me ? ' · YOU' : ''), PX + 24, y + 36);
    x.font = '700 22px ' + F;
    x.fillStyle = ink;
    x.fillText(l.name, PX + 24, y + 68);
    l.ph.forEach(p => {
      const a = Xt(p.a),
        b = Xt(p.b),
        dash = p.k == 'def' || p.k == 'cover';
      if (p.k == 'harm') {
        x.fillStyle = DD_PH.harm[0];
        x.fillRect(a, y + 58, Math.max(3, b - a), 12);
        return;
      }
      const pc = (DD_PH[p.k] || [ink])[0];
      x.globalAlpha = dash ? 0.3 : 0.85;
      x.fillStyle = pc;
      x.fillRect(a, y + 16, Math.max(3, b - a), 34);
      x.globalAlpha = 1;
      x.strokeStyle = pc;
      x.lineWidth = 2;
      x.setLineDash(dash ? [8, 6] : []);
      x.strokeRect(a, y + 16, Math.max(3, b - a), 34);
      x.setLineDash([]);
      if (p.l) {
        x.font = '500 20px ' + F;
        x.fillStyle = MU;
        x.fillText(p.l + ' ' + hm(p.a), a + 4, y + 94);
      }
    });
    l.mk.forEach(m => {
      const mx = Xt(m.t);
      if (m.s == '◆') {
        x.fillStyle = SD_COL.IMP;
        x.beginPath();
        x.moveTo(mx, y + 50);
        x.lineTo(mx + 13, y + 64);
        x.lineTo(mx, y + 78);
        x.lineTo(mx - 13, y + 64);
        x.closePath();
        x.fill();
      } else {
        x.font = '800 26px ' + F;
        x.textAlign = 'center';
        x.fillStyle = l.me && m.s == 'L' ? AC : TX;
        x.fillText(m.s, mx, y + 10);
        x.textAlign = 'left';
      }
    });
  });
  // the colours of the phases used
  const used = new Set(L.flatMap(l => l.ph.map(p => p.k)));
  let lx = PX + 24;
  x.font = '500 21px ' + F;
  x.textAlign = 'left';
  Object.keys(DD_PH)
    .filter(k => used.has(k))
    .forEach(k => {
      x.fillStyle = DD_PH[k][0];
      x.fillRect(lx, PY + PH - 46, 26, 16);
      x.fillStyle = MU;
      x.fillText(DD_PH[k][1], lx + 34, PY + PH - 31);
      lx += 60 + x.measureText(DD_PH[k][1]).width;
    });
}
