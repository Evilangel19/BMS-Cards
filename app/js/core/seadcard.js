// @ts-check
// The SEAD card of the Kneeboard (1600 x 2400): the shots of the pilot's seat in big, the plan on the map chosen on the Map page (the protected routes,
// your route, the rings, the impact points, the launch points of each seat), the timeline of the flight and the table of all the shots.
// D: {title, pkg, seat, seatName, k, mode, prot[], rows[{seat, seatName, sam, code, tab, flight, tin, tout, t85, tl, at, brg, d, tof, ok, why, ms[4]}],
//     px: {img, coast, prot[[px]], me[px], sams[{c, r, name, p85, l, seat, ok, tl}], nm, k} | null}
export const SDC_W = 1600,
  SDC_H = 2400;
const COL = ['#4aa3ff', '#f0b040', '#b07cff', '#34d399'],
  BG = '#f4f6f8',
  TX = '#111827',
  MU = '#5b6573',
  LN = '#c9d1db',
  AC = '#1f8a4c',
  BAD = '#c2410c',
  F = 'system-ui, Segoe UI, sans-serif';

/** @param {CanvasRenderingContext2D} x */
export function drawSeadCard(x, D) {
  const W = SDC_W,
    H = SDC_H,
    font = (w, s) => (x.font = w + ' ' + s + 'px ' + F),
    text = (t, X, Y, c = TX, a = 'left') => {
      x.fillStyle = c;
      x.textAlign = /** @type {CanvasTextAlign} */ (a);
      x.fillText(t, X, Y);
    },
    seatCol = s => (s == null ? '#8b98a8' : COL[s]);
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
  text(D.pkg + ' · IMPACT AT ' + D.k + '% OF THE RING · ' + D.mode, 40, 156, MU);
  if (D.seatName) {
    font('700', 30);
    const t = 'YOUR SEAT ' + D.seatName,
      w = x.measureText(t).width + 40;
    x.fillStyle = seatCol(D.seat);
    x.beginPath();
    x.roundRect(W - 40 - w, 84, w, 48, 10);
    x.fill();
    text(t, W - 60, 119, '#fff', 'right');
  }
  // your shots
  const mine = D.rows.filter(r => D.seat == null || r.seat === D.seat);
  let y = 210;
  font('700', 26);
  text(D.seatName ? 'YOUR SHOTS' : 'SHOTS', 40, y, AC);
  y += 14;
  const BH = 196;
  mine.slice(0, 2).forEach(r => {
    x.strokeStyle = r.ok ? LN : BAD;
    x.lineWidth = r.ok ? 2 : 4;
    x.fillStyle = '#fff';
    x.beginPath();
    x.roundRect(40, y, W - 80, BH, 12);
    x.fill();
    x.stroke();
    x.fillStyle = seatCol(r.seat);
    x.fillRect(40, y, 14, BH);
    font('700', 44);
    text(r.sam, 76, y + 58);
    font('500', 26);
    text((r.code != null ? 'CODE ' + r.code : 'NO HARM CODE') + (r.tab ? ' · ' + r.tab : ''), 76, y + 96, MU);
    text('PROTECTS ' + r.flight.toUpperCase() + ' · IN ' + r.tin, 76, y + 132, MU);
    if (r.why) {
      font('700', 26);
      text(r.why, 76, y + 172, BAD);
    }
    font('500', 24);
    text('LAUNCH', 700, y + 42, MU);
    font('700', 56);
    text(r.tl, 700, y + 104);
    font('500', 26);
    text(r.at, 700, y + 146, MU);
    font('500', 24);
    text('TURN TO', 1130, y + 42, MU);
    font('700', 40);
    text(r.brg ? r.brg + '°' : '—', 1130, y + 90);
    font('500', 24);
    text('RANGE · TOF', 1330, y + 42, MU);
    font('700', 34);
    text(r.d ? r.d.toFixed(1) + ' NM' : '—', 1330, y + 86);
    text(r.tof ? r.tof + ' S' : '', 1330, y + 128);
    font('500', 24);
    text('IMPACT ' + r.t85, 1130, y + 172, MU);
    y += BH + 16;
  });
  if (!mine.length) {
    font('500', 28);
    text('No shot for your seat.', 40, y + 40, MU);
    y += 70;
  }
  if (mine.length > 2) {
    font('500', 24);
    text('+ ' + (mine.length - 2) + ' more in the table below', 40, y + 10, MU);
    y += 30;
  }
  // the plan
  // the map takes the room left by the timeline and the table under it
  const nR = Math.min(7, D.rows.length),
    below = 76 + 50 + nR * 46 + 80 + Math.min(8, D.rows.length) * 42 + 90,
    PX = 40,
    PY = y + 10,
    PW = W - 80,
    PH = Math.max(560, Math.min(1300, H - PY - below - 40));
  x.save();
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.clip();
  x.fillStyle = '#0d1a22';
  x.fillRect(PX, PY, PW, PH);
  const p = D.px;
  if (p && p.img) {
    x.drawImage(p.img, PX, PY, PW, PH);
    const k = PW / p.img.width,
      Q = q => [PX + q[0] * k, PY + q[1] * k],
      path = (a, c, w, dash) => {
        if (a.length < 2) return;
        x.setLineDash(dash || []);
        x.lineWidth = w + 5;
        x.strokeStyle = 'rgba(0,0,0,.55)';
        x.beginPath();
        a.forEach((q, i) => (i ? x.lineTo(...Q(q)) : x.moveTo(...Q(q))));
        x.stroke();
        x.lineWidth = w;
        x.strokeStyle = c;
        x.stroke();
        x.setLineDash([]);
      };
    p.sams.forEach(s => {
      const [cx, cy] = Q(s.c),
        r = s.r * k;
      x.fillStyle = 'rgba(255,80,80,.10)';
      x.strokeStyle = '#ff5d5d';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(cx, cy, r, 0, 7);
      x.fill();
      x.stroke();
      x.setLineDash([10, 8]);
      x.lineWidth = 2;
      x.beginPath();
      x.arc(cx, cy, r * p.k, 0, 7);
      x.stroke();
      x.setLineDash([]);
    });
    p.prot.forEach(a => path(a, '#ffffff', 5));
    path(p.me, '#4cc38a', 5, [18, 12]);
    p.sams.forEach(s => {
      const [cx, cy] = Q(s.c),
        c = s.seat == null ? '#8b98a8' : COL[s.seat];
      if (s.l) {
        path([s.l, s.c], c, 4, s.ok ? [] : [4, 10]);
        const [lx, ly] = Q(s.l);
        x.fillStyle = c;
        x.strokeStyle = '#000';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(lx, ly, 13, 0, 7);
        x.fill();
        x.stroke();
        tagDark(x, (s.seat == null ? '—' : '#' + (s.seat + 1)) + ' L ' + s.tl, lx + 18, ly + 36, c);
      }
      const [ix, iy] = Q(s.p85);
      x.fillStyle = '#ff9f1c';
      x.strokeStyle = '#fff';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(ix, iy - 13);
      x.lineTo(ix + 13, iy);
      x.lineTo(ix, iy + 13);
      x.lineTo(ix - 13, iy);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#ff3b3b';
      x.beginPath();
      x.moveTo(cx, cy - 14);
      x.lineTo(cx + 12, cy + 9);
      x.lineTo(cx - 12, cy + 9);
      x.closePath();
      x.fill();
      tagDark(x, s.name, cx + 18, cy + 8, '#ffb3b3');
    });
    if (p.nm > 0) {
      const L = Math.round((10 * p.nm * k) / 1) || 1;
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(PX + 20, PY + PH - 70, L + 40, 50);
      x.strokeStyle = '#fff';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(PX + 40, PY + PH - 32);
      x.lineTo(PX + 40 + L, PY + PH - 32);
      x.stroke();
      font('600', 22);
      text('10 NM', PX + 40, PY + PH - 42, '#fff');
    }
    if (p.coast) {
      font('500', 20);
      text('Offline coastlines (the map tiles could not be read)', PX + PW - 20, PY + PH - 20, '#cbd5e1', 'right');
    }
  } else {
    font('500', 28);
    text('No map picture: open the HARM page with the map shown.', PX + PW / 2, PY + PH / 2, '#cbd5e1', 'center');
  }
  x.restore();
  x.strokeStyle = LN;
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect(PX, PY, PW, PH, 12);
  x.stroke();
  font('500', 22);
  text(
    'WHITE: ' + (D.prot.join(', ') || '—').toUpperCase() + ' · GREEN: YOUR ROUTE · ◆ IMPACT · ● LAUNCH',
    PX,
    PY + PH + 32,
    MU
  );
  // the timeline
  y = PY + PH + 76;
  font('700', 26);
  text('TIMELINE', 40, y, AC);
  y += 20;
  const R = D.rows.filter(r => r.ms && r.ms.every(isFinite));
  if (R.length) {
    const t0 = Math.min(...R.map(r => Math.min(r.ms[0], r.ms[2]))) - 30000,
      t1 = Math.max(...R.map(r => r.ms[1])) + 30000,
      TX0 = 300,
      TW = W - 40 - TX0,
      X = t => TX0 + ((t - t0) / (t1 - t0)) * TW,
      step = t1 - t0 > 1200000 ? 300000 : t1 - t0 > 600000 ? 120000 : 60000;
    font('500', 20);
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const s = Math.round(t / 1000) % 86400;
      text(
        String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
        X(t),
        y + 14,
        MU,
        'center'
      );
      x.strokeStyle = '#dde3ea';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(X(t), y + 22);
      x.lineTo(X(t), y + 30 + R.length * 46);
      x.stroke();
    }
    y += 30;
    R.slice(0, 7).forEach(r => {
      const me = D.seat != null && r.seat === D.seat;
      font(me ? '700' : '500', 26);
      text(r.sam + '  ' + (r.seat == null ? '—' : '#' + (r.seat + 1)), 40, y + 30, me ? TX : MU);
      x.fillStyle = 'rgba(255,93,93,.35)';
      x.fillRect(X(r.ms[0]), y + 8, X(r.ms[1]) - X(r.ms[0]), 30);
      x.strokeStyle = '#ff5d5d';
      x.lineWidth = 2;
      x.strokeRect(X(r.ms[0]), y + 8, X(r.ms[1]) - X(r.ms[0]), 30);
      x.fillStyle = r.seat == null ? '#8b98a8' : COL[r.seat];
      x.fillRect(X(r.ms[2]), y + 16, Math.max(4, X(r.ms[3]) - X(r.ms[2])), 14);
      const ix = X(r.ms[3]);
      x.fillStyle = '#ff9f1c';
      x.beginPath();
      x.moveTo(ix, y + 10);
      x.lineTo(ix + 12, y + 23);
      x.lineTo(ix, y + 36);
      x.lineTo(ix - 12, y + 23);
      x.closePath();
      x.fill();
      y += 46;
    });
  }
  // all the shots
  y += 30;
  font('700', 26);
  text('THE FLIGHT', 40, y, AC);
  y += 16;
  const C = [40, 210, 470, 640, 840, 1040, 1250];
  font('600', 21);
  ['SEAT', 'SAM', 'CODE', 'LAUNCH', 'IMPACT', 'TURN TO', 'WHERE'].forEach((h, i) => text(h, C[i], y + 26, MU));
  y += 36;
  D.rows.slice(0, 8).forEach(r => {
    if (y > H - 90) return;
    const me = D.seat != null && r.seat === D.seat;
    if (me) {
      x.fillStyle = '#e8f5ee';
      x.fillRect(30, y, W - 60, 40);
    }
    font(me ? '700' : '500', 24);
    x.fillStyle = r.seat == null ? '#8b98a8' : COL[r.seat];
    x.fillRect(40, y + 8, 8, 24);
    text(r.seatName.split(' ')[0], 58, y + 29);
    text(r.sam, C[1], y + 29);
    text(r.code == null ? '—' : String(r.code), C[2], y + 29);
    text(r.tl, C[3], y + 29, r.ok ? TX : BAD);
    text(r.t85, C[4], y + 29);
    text(r.brg ? r.brg + '°' : '—', C[5], y + 29);
    text(r.why || r.at, C[6], y + 29, r.why ? BAD : TX);
    x.strokeStyle = LN;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(30, y + 40);
    x.lineTo(W - 30, y + 40);
    x.stroke();
    y += 42;
  });
  // footer
  x.fillStyle = '#e3e8ee';
  x.fillRect(0, H - 56, W, 56);
  font('600', 22);
  text('FOR SIMULATION USE ONLY · FALCON BMS', W / 2, H - 20, MU, 'center');
}
/** a label on the map: dark box, coloured text */
function tagDark(x, t, X, Y, c) {
  x.font = '700 24px system-ui, Segoe UI, sans-serif';
  const w = x.measureText(t).width;
  x.fillStyle = 'rgba(0,0,0,.65)';
  x.fillRect(X - 6, Y - 24, w + 12, 32);
  x.fillStyle = c;
  x.textAlign = 'left';
  x.fillText(t, X, Y);
}
