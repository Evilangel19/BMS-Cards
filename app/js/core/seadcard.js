// @ts-check
// The SEAD cards of the Kneeboard (1600 x 2400): your shots in big (launch, steerpoint or SAM, turn, range, impact), then either the plan on the map
// chosen on the Map page (kind 'map': the protected routes, your route, the rings, the launch points, the shots, the impacts, the task steerpoints) or
// the scheme (kind 'sch': a lane for each protected flight, a lane for each seat) with the events; at the bottom the table of the flight.
// The colours of the page: the HARM light blue, the impact red, what is not covered red, you green.
// D: {title, pkg, seat, seatName, k, mode, prot[], shots[{seat, mine, seatNo, sam, code, tab, ref, tl, imp, at, brg, d, tof, ok, why}], gaps[],
//     sm (the scheme model of seadpage.js), ev[{t, c, s}], px (the map picture and its points) | null}
export const SDC_W = 1600,
  SDC_H = 2400;
export const SD_COL = {
  HARM: '#38bdf8',
  IMP: '#ff3b3b',
  YOU: '#4cc38a',
  GAP: '#ff3b3b',
  MATES: ['#c4b5fd', '#f9a8d4', '#fde68a', '#d6d3d1'], // the other protected flights on the scheme
};
const BG = '#f4f6f8',
  TX = '#111827',
  MU = '#5b6573',
  LN = '#c9d1db',
  AC = '#1f8a4c',
  BAD = '#c2410c',
  HB = '#0284c7', // the HARM on the light card
  F = 'system-ui, Segoe UI, sans-serif';
const hm = t => {
  const s = Math.round(t / 1000) % 86400;
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
};
const hms = t => {
  const s = Math.round(t / 1000) % 86400,
    q = n => String(n).padStart(2, '0');
  return q(Math.floor(s / 3600)) + ':' + q(Math.floor((s % 3600) / 60)) + ':' + q(s % 60);
};
const ms = t => {
  const s = Math.round(t / 1000) % 86400;
  return String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

// the box of the map or the scheme on the card: under your shots, over the table of the flight (the map picture is taken in its shape)
export function cardBox(D) {
  const n = D.shots.filter(r => D.seat == null || r.mine).length,
    y = 224 + (n ? Math.min(3, n) * 162 : 70) + (n > 3 ? 30 : 0),
    nT = Math.min(10, D.shots.length),
    tableH = 50 + 36 + nT * 40 + (D.gaps.length ? 44 : 0);
  return { x: 40, y: y + 10, w: SDC_W - 80, h: SDC_H - 56 - 30 - tableH - (y + 10) - 20, tableH };
}
/** @param {CanvasRenderingContext2D} x @param {string} kind 'map' | 'sch' */
export function drawSeadCard(x, D, kind = 'map') {
  const W = SDC_W,
    H = SDC_H,
    font = (w, s) => (x.font = w + ' ' + s + 'px ' + F),
    text = (t, X, Y, c = TX, a = 'left') => {
      x.fillStyle = c;
      x.textAlign = /** @type {CanvasTextAlign} */ (a);
      x.fillText(t, X, Y);
    };
  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  // header
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, 0, W, 170);
  font('700', 30);
  text('SEAD', 40, 56, AC);
  text('BMS CARDS', W - 40, 56, AC, 'right');
  font('700', 48);
  text(D.title, 40, 116);
  font('500', 28);
  text(D.pkg + ' · FIRST IMPACT AT ' + D.k + '% OF THE RING · ' + D.mode, 40, 156, MU);
  if (D.seatName) {
    font('700', 30);
    const t = 'YOUR SEAT ' + D.seatName,
      w = x.measureText(t).width + 40;
    x.fillStyle = AC;
    x.beginPath();
    x.roundRect(W - 40 - w, 84, w, 48, 10);
    x.fill();
    text(t, W - 60, 119, '#fff', 'right');
  }
  // your shots
  const mine = D.shots.filter(r => D.seat == null || r.mine);
  let y = 210;
  font('700', 26);
  text(D.seatName ? 'YOUR SHOTS' : 'SHOTS', 40, y, AC);
  y += 14;
  const BH = 150;
  mine.slice(0, 3).forEach(r => {
    x.strokeStyle = r.ok ? LN : BAD;
    x.lineWidth = r.ok ? 2 : 4;
    x.fillStyle = '#fff';
    x.beginPath();
    x.roundRect(40, y, W - 80, BH, 12);
    x.fill();
    x.stroke();
    x.fillStyle = AC;
    x.fillRect(40, y, 14, BH);
    font('700', 40);
    text(r.sam, 76, y + 50);
    font('500', 24);
    text((r.code != null ? 'ALIC ' + r.code : 'NO ALIC') + (r.tab ? ' · ' + r.tab : ''), 76, y + 86, MU);
    text(r.ref, 76, y + 118, MU);
    if (r.why) {
      font('700', 22);
      text(r.why, 76, y + 142, BAD);
    }
    font('500', 22);
    text('LAUNCH', 640, y + 36, MU);
    font('700', 52);
    text(r.tl, 640, y + 92, AC);
    font('500', 22);
    text(r.at, 640, y + 128, MU);
    text('TURN TO', 1060, y + 36, MU);
    font('700', 36);
    text(r.brg ? r.brg + '°' : '—', 1060, y + 80);
    font('500', 22);
    text('RANGE · TOF', 1260, y + 36, MU);
    font('700', 30);
    text(r.d ? r.d.toFixed(1) + ' NM · ' + r.tof + ' S' : '—', 1260, y + 78);
    x.fillStyle = SD_COL.IMP;
    diamond(x, 1072, y + 118, 11);
    font('600', 24);
    text('IMPACT ' + r.imp, 1092, y + 127);
    y += BH + 12;
  });
  if (!mine.length) {
    font('500', 28);
    text('No shot for your seat.', 40, y + 40, MU);
    y += 70;
  }
  if (mine.length > 3) {
    font('500', 24);
    text('+ ' + (mine.length - 3) + ' more in the table below', 40, y + 10, MU);
    y += 30;
  }
  // the table of the flight takes its room at the bottom; the map or the scheme the rest
  const B = cardBox(D),
    nT = Math.min(10, D.shots.length),
    tableH = B.tableH,
    footer = 56;
  if (kind == 'sch') scheme(x, D, B.x, B.y, B.w, B.h);
  else map(x, D, B.x, B.y, B.w, B.h);
  // the flight
  y = H - footer - 20 - tableH;
  font('700', 26);
  text('THE FLIGHT', 40, y + 26, AC);
  y += 36;
  const C = [40, 150, 400, 620, 830, 1030, 1200];
  font('600', 20);
  ['SEAT', 'SAM', 'STPT / AIM', 'LAUNCH', 'IMPACT', 'TURN TO', 'WHERE'].forEach((h, i) => text(h, C[i], y + 26, MU));
  y += 36;
  D.shots.slice(0, nT).forEach(r => {
    if (r.mine) {
      x.fillStyle = '#e8f5ee';
      x.fillRect(30, y, W - 60, 38);
    }
    font(r.mine ? '700' : '500', 22);
    text(r.seatNo, C[0], y + 27, r.mine ? AC : TX);
    text(r.sam, C[1], y + 27);
    text(r.ref.replace('AT THE SAM', 'SAM'), C[2], y + 27);
    text(r.tl, C[3], y + 27, r.ok ? (r.mine ? AC : TX) : BAD);
    text(r.imp, C[4], y + 27);
    text(r.brg ? r.brg + '°' : '—', C[5], y + 27);
    text(r.why || r.at, C[6], y + 27, r.why ? BAD : TX);
    x.strokeStyle = LN;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(30, y + 38);
    x.lineTo(W - 30, y + 38);
    x.stroke();
    y += 40;
  });
  if (D.gaps.length) {
    font('600', 22);
    text('NOT COVERED: ' + D.gaps.join(' · '), 40, y + 32, SD_COL.GAP);
  }
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, H - footer, W, footer);
  font('600', 22);
  text('FOR SIMULATION USE ONLY · FALCON BMS', W / 2, H - 20, MU, 'center');
}
function diamond(x, cx, cy, r) {
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.lineTo(cx + r, cy);
  x.lineTo(cx, cy + r);
  x.lineTo(cx - r, cy);
  x.closePath();
  x.fill();
}
function tri(x, cx, cy, r, fill, stroke) {
  x.fillStyle = fill;
  x.strokeStyle = stroke;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.lineTo(cx + r * 0.9, cy + r * 0.7);
  x.lineTo(cx - r * 0.9, cy + r * 0.7);
  x.closePath();
  x.fill();
  x.stroke();
}
/** a label on the map: dark box, coloured text */
function tagDark(x, t, X, Y, c, bold = true) {
  x.font = (bold ? '700' : '600') + ' 24px ' + F;
  const w = x.measureText(t).width;
  x.fillStyle = 'rgba(0,0,0,.65)';
  x.fillRect(X - 6, Y - 24, w + 12, 32);
  x.fillStyle = c;
  x.textAlign = 'left';
  x.fillText(t, X, Y);
}
// the plan on the map picture
function map(x, D, PX, PY, PW, PH) {
  x.save();
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.clip();
  x.fillStyle = '#0d1a22';
  x.fillRect(PX, PY, PW, PH);
  const p = D.px;
  if (p && p.img) {
    // the picture keeps its shape: fitted in the box, centred
    const s = Math.min(PW / p.img.width, PH / p.img.height),
      iw = p.img.width * s,
      ih = p.img.height * s,
      ox = PX + (PW - iw) / 2,
      oy = PY + (PH - ih) / 2;
    x.drawImage(p.img, ox, oy, iw, ih);
    const c = p.pal || {},
      Q = q => /** @type {[number, number]} */ ([ox + q[0] * s, oy + q[1] * s]),
      path = (a, col, w, dash) => {
        if (a.length < 2) return;
        x.setLineDash(dash || []);
        x.lineWidth = w + 5;
        x.strokeStyle = 'rgba(0,0,0,.55)';
        x.beginPath();
        a.forEach((q, i) => (i ? x.lineTo(...Q(q)) : x.moveTo(...Q(q))));
        x.stroke();
        x.lineWidth = w;
        x.strokeStyle = col;
        x.stroke();
        x.setLineDash([]);
      };
    const ring = c.ring || '#ff9f1a';
    p.sams.forEach(z => {
      const [cx, cy] = Q(z.c),
        r = z.r * s;
      x.fillStyle = 'rgba(255,159,26,.08)';
      x.strokeStyle = ring;
      x.lineWidth = 3;
      x.setLineDash([14, 10]);
      x.beginPath();
      x.arc(cx, cy, r, 0, 7);
      x.fill();
      x.stroke();
      x.setLineDash([3, 8]);
      x.lineWidth = 2;
      x.beginPath();
      x.arc(cx, cy, r * p.k, 0, 7);
      x.stroke();
      x.setLineDash([]);
    });
    p.prot.forEach(a => path(a, c.mate || '#fff', 5));
    path(p.me, c.plan || '#ffd23f', 5);
    p.shots.forEach(z => {
      path([z.l, z.a], SD_COL.HARM, z.mine ? 5 : 3, z.ok ? [] : [4, 10]);
      const [lx, ly] = Q(z.l);
      x.globalAlpha = z.mine ? 1 : 0.7;
      x.fillStyle = SD_COL.HARM;
      x.strokeStyle = '#000';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(lx, ly, z.mine ? 14 : 10, 0, 7);
      x.fill();
      x.stroke();
      x.globalAlpha = 1;
      tagDark(x, z.t, lx + 18, ly + 36, z.mine ? SD_COL.YOU : SD_COL.HARM, z.mine);
      if (z.imp) {
        const [ix, iy] = Q(z.imp);
        x.fillStyle = SD_COL.IMP;
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        diamond(x, ix, iy, 13);
        x.stroke();
      }
    });
    p.sams.forEach(z => {
      const [cx, cy] = Q(z.c);
      tri(x, cx, cy, 14, ring, '#000');
      tagDark(x, z.name, cx + 18, cy + 8, ring);
    });
    p.tasks.forEach(t => {
      const [tx, ty] = Q(t.p);
      tri(x, tx, ty, 18, '#fff', '#000');
      tagDark(x, t.name + ' · STPT ' + t.n, tx + 22, ty + 8, '#fff');
    });
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
    x.fillText('No map picture: show the map on the SEAD page first.', PX + PW / 2, PY + PH / 2);
  }
  x.restore();
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.stroke();
}
// the scheme and the events (the same layout as the page, on the light card)
function scheme(x, D, PX, PY, PW, PH) {
  const m = D.sm,
    font = (w, s) => (x.font = w + ' ' + s + 'px ' + F),
    text = (t, X, Y, c = TX, a = 'left') => {
      x.fillStyle = c;
      x.textAlign = /** @type {CanvasTextAlign} */ (a);
      x.fillText(t, X, Y);
    },
    tw = (t, w, s) => {
      font(w, s);
      return x.measureText(t).width;
    },
    line = (x0, y0, x1, y1, c, w, dash) => {
      x.strokeStyle = c;
      x.lineWidth = w;
      x.setLineDash(dash || []);
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x1, y1);
      x.stroke();
      x.setLineDash([]);
    },
    arrowHead = (xh, yh, dir, c) => {
      x.fillStyle = c;
      x.beginPath();
      x.moveTo(xh, yh);
      x.lineTo(xh - dir * 12, yh - 6);
      x.lineTo(xh - dir * 12, yh + 6);
      x.closePath();
      x.fill();
    },
    X0 = PX + 330,
    XR = PX + PW - 20,
    Xt = t => X0 + ((Math.min(Math.max(t, m.t0), m.t1) - m.t0) / (m.t1 - m.t0)) * (XR - X0),
    ring = '#d97706',
    MATES = ['#7c3aed', '#db2777', '#a16207', '#57534e'], // darker for the light card
    col = i => (i ? MATES[(i - 1) % MATES.length] : '#111827'),
    n = m.prot.length;
  // the events take the lower part: two columns
  const ev = D.ev || [],
    evRows = Math.min(Math.ceil(ev.length / 2), 12),
    evH = ev.length ? 50 + evRows * 32 : 0,
    SH = PH - evH;
  x.fillStyle = '#fff';
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, SH, 12);
  x.fill();
  x.stroke();
  // the room the parts need, scaled into the box
  const seatH = s => Math.max(Math.max(1, s.shots.length) * 58, 34 + s.shots.length * 24) + 16,
    // the height is A + B k (the fixed parts and the scaled ones): k so that it fits
    A = 130 + 10 + 14 + 40 + 16 + 2 * n * 8 + m.rows.length * 6,
    B = 2 * n * 22 + m.rows.length * 40 + m.seats.reduce((a, s) => a + seatH(s), 0),
    k = Math.max(0.3, Math.min(1.3, (SH - 30 - A) / B)),
    span = m.t1 - m.t0,
    step = span > 1800000 ? 300000 : span > 900000 ? 120000 : 60000;
  font('500', 20);
  for (let t = Math.ceil(m.t0 / step) * step; t <= m.t1; t += step) {
    text(hm(t), Xt(t), PY + 28, MU, 'center');
    line(Xt(t), PY + 36, Xt(t), PY + SH - 10, '#e5e9ef', 1);
  }
  let y = PY + 60 * k + 20;
  const P0 = m.prot[0];
  font('800', 26);
  text('PACKAGE ' + m.pkg, PX + 16, PY + 70);
  font('500', 20);
  text(n + ' PROTECTED' + (P0 ? ' · FIRST IN: ' + P0.name.toUpperCase() : ''), PX + 16, PY + 96, MU);
  y = Math.max(y, PY + 110);
  const yIn = y + 20,
    gIn = 22 * k + 8,
    yRows = yIn + n * gIn + 10,
    gR = 40 * k + 6,
    yOut = yRows + m.rows.length * gR + 14,
    yEnd = yOut + n * gIn;
  // the task of the first flight in
  if (P0 && P0.task) {
    const tx = Xt(P0.task.t0);
    tri(x, tx, y - 4, 18, '#fff', '#111');
    font('800', 22);
    const lab =
        P0.name.toUpperCase() +
        ' · STPT ' +
        P0.task.n +
        ' · ' +
        hm(P0.task.t0) +
        (P0.task.loiter ? '–' + hm(P0.task.t1) : ''),
      right = tx + 24 + x.measureText(lab).width < XR;
    text(lab, right ? tx + 24 : tx - 24, y + 4, TX, right ? 'left' : 'right');
    line(tx, y + 10, tx, yOut + 4, '#111', 2, [6, 6]);
    if (P0.task.loiter) {
      line(tx, y - 14, Xt(P0.task.t1), y - 14, '#111', 4);
      line(Xt(P0.task.t1), y + 10, Xt(P0.task.t1), yOut + 4, '#111', 2, [6, 6]);
    }
  }
  font('600', 18);
  text('INGRESS →', PX + 16, yIn + ((n - 1) * gIn) / 2 + 7, MU);
  // the arrows: the way in (the others above), the way out (the others below), labels in the time area, arrows shortened for them
  m.prot.forEach((f, i) => {
    const c = col(i),
      w = i ? 2 : 4,
      lab = f.name.toUpperCase(),
      role = ' ' + f.role,
      lw = tw(lab, '700', 19) + tw(role, '500', 15) + 12,
      tA = f.task ? f.task.t0 : f.t1,
      yi = yIn + (n - 1 - i) * gIn,
      xa = Math.max(Xt(f.t0), X0 + lw),
      xb = Xt(tA) - 10;
    const label = (xl, yl, align) => {
      font('700', 19);
      const a = x.measureText(lab).width;
      font('500', 15);
      const b = x.measureText(role).width;
      const x0 = align == 'right' ? xl - a - b : xl;
      font('700', 19);
      text(lab, x0, yl + 7, c);
      font('500', 15);
      text(role, x0 + a, yl + 7, c);
    };
    if (xb > xa + 14) {
      label(xa - 6, yi, 'right');
      line(xa, yi, xb, yi, c, w);
      arrowHead(xb + 2, yi, 1, c);
      if (i && f.task) {
        font('500', 16);
        text(hm(f.task.t0), xb + 8, yi + 6, c);
      }
    }
    if (!f.task) return;
    const yo = yOut + i * gIn,
      xc = Xt(f.task.t1) + 10,
      xd = Math.min(Xt(f.t1), XR - lw);
    if (xd > xc + 14) {
      line(xc, yo, xd, yo, c, w);
      arrowHead(xc - 2, yo, -1, c);
      label(xd + 6, yo, 'left');
    }
  });
  font('600', 18);
  text('← EGRESS', PX + 16, yOut + ((n - 1) * gIn) / 2 + 7, MU);
  // the SAMs
  m.rows.forEach((r, i) => {
    const yy = yRows + i * gR,
      bh = 26 * k + 4;
    font('800', 22);
    text(r.sam, X0 - 12, yy + bh - 6, ring, 'right');
    (r.on || []).forEach(([a, b]) => {
      x.globalAlpha = 0.5;
      line(Xt(a), yy + bh + 4, Xt(b), yy + bh + 4, ring, 3);
      x.globalAlpha = 1;
    });
    r.iv.forEach(([a, b]) => {
      x.fillStyle = 'rgba(217,119,6,.16)';
      x.fillRect(Xt(a), yy, Math.max(2, Xt(b) - Xt(a)), bh);
      x.strokeStyle = ring;
      x.setLineDash([8, 5]);
      x.lineWidth = 2;
      x.strokeRect(Xt(a), yy, Math.max(2, Xt(b) - Xt(a)), bh);
      x.setLineDash([]);
    });
    r.gaps.forEach(([a, b]) => {
      x.fillStyle = 'rgba(255,59,59,.55)';
      x.fillRect(Xt(a), yy, Math.max(2, Xt(b) - Xt(a)), bh);
    });
    line(Xt(r.t85), yy - 4, Xt(r.t85), yy + bh + 4, ring, 4);
    r.imp.forEach(t => {
      x.fillStyle = SD_COL.IMP;
      x.strokeStyle = '#fff';
      x.lineWidth = 2;
      diamond(x, Xt(t), yy + bh / 2, 12);
      x.stroke();
    });
  });
  y = yEnd + 40;
  line(PX + 10, y, PX + PW - 10, y, LN, 2);
  y += 16;
  // the seats: the launches and times of flight under the name, a row for each launch
  m.seats.forEach(s => {
    const yy = y + 10;
    font(s.mine ? '800' : '700', 24);
    text(s.label + (s.mine ? ' · YOU' : ''), PX + 16, yy + 22, s.mine ? AC : TX);
    font('500', 18);
    text(s.used + '/' + (s.harms == null ? '?' : s.harms), X0 - 12, yy + 22, MU, 'right');
    s.shots.forEach((z, i) => {
      font(s.mine ? '700' : '500', 19);
      text('L ' + hms(z.tl) + ' · TOF ' + z.tof + ' S', PX + 16, yy + 48 + i * Math.min(24, 58 * k), s.mine ? AC : MU);
    });
    if (!s.shots.length) line(X0, yy + 20, XR, yy + 20, '#e5e9ef', 2);
    s.shots.forEach((z, i) => {
      const ry = yy + i * 58 * k,
        xl = Xt(z.tl),
        xi = Xt(z.imp),
        xc = Xt(z.cover);
      line(X0, ry + 20, XR, ry + 20, '#e5e9ef', 2);
      x.globalAlpha = s.mine ? 1 : 0.65;
      x.fillStyle = HB;
      x.fillRect(xl, ry + 12, Math.max(3, xi - xl), 16);
      x.globalAlpha = s.mine ? 0.3 : 0.2;
      x.fillRect(xi, ry + 12, Math.max(0, xc - xi), 16);
      x.globalAlpha = 1;
      font('800', 20);
      text('L', xl - 6, ry + 27, s.mine ? AC : HB, 'right');
      x.fillStyle = SD_COL.IMP;
      x.strokeStyle = '#fff';
      x.lineWidth = 2;
      diamond(x, xi, ry + 20, 13);
      x.stroke();
      const tx = z.sam + ' · ◆ ' + ms(z.imp) + (z.aim ? ' · ' + z.aim : '') + (z.ok ? '' : ' · !'),
        tr = xl + tw(tx, s.mine ? '700' : '500', 19) > XR;
      font(s.mine ? '700' : '500', 19);
      text(tx, tr ? xi : xl, ry + 50, s.mine ? AC : MU, tr ? 'right' : 'left');
    });
    y += seatH(s) * k;
  });
  // the events
  if (ev.length) {
    let ey = PY + SH + 40;
    font('700', 26);
    text('EVENTS', PX, ey, AC);
    ey += 8;
    const colE = c =>
      c == 'me'
        ? AC
        : c == 'harm'
          ? HB
          : c == 'imp'
            ? SD_COL.IMP
            : c == 'gap'
              ? SD_COL.GAP
              : c == 'in'
                ? '#b45309'
                : TX;
    ev.slice(0, evRows * 2).forEach((e, i) => {
      const cx = PX + (i < evRows ? 0 : PW / 2),
        cy = ey + 28 + (i % evRows) * 32;
      font('500', 21);
      text(e.t, cx, cy, MU);
      font(e.c == 'me' || e.c == 'task' ? '800' : '600', 21);
      text(e.s, cx + 104, cy, colE(e.c));
    });
  }
}
