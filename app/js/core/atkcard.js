// @ts-check
// The Attack card of the Kneeboard (1600 x 2400, light): one card per role (the whole flight, or the lead and the element / wingman of a split flight).
// The plan of the attack (the other role thin and grey), its side profile with the fragments and the MRA, its parameters, the spacing after the lead,
// the safety, the NAV OFFSETS written to the DTC. Pure drawing on a 2D context; the data come ready from the Weapons page.
// D: {role, roleCol, title, kind, target, bomb, segs: [[phase, [{n, e}...]]...], marks: [[{n, e}, label]...], target0 {n, e}, other: [[{n, e}...]...],
//     prof: {segs: [[phase, [[x, alt]...]]...], marks: [[[x, alt], label]...], domes: [[[x, z]...]...], odomes: [[[x, z]...]...], mra, hot: [[[x, alt]...]...]},
//     rows: [[label, value]...], spacing: {head, value, by, text, col} | null, safety: [[text, col]...], offsets: [[label, brg, rng, elev]...], notes: [...]}
import { kbPx, inkCard } from './cardink.js';
export const ATC_W = 1600,
  ATC_H = 2400;
const FONT = 'Segoe UI, system-ui, sans-serif',
  INK = '#1c2530',
  MUTE = '#3a4454',
  // the phases in colours that read on white
  PHC = {
    ingress: ['#0f9d6e', []],
    climb: ['#c98a04', []],
    pull: ['#b832c9', []],
    dive: ['#0b84c6', []],
    fall: ['#d03030', [14, 10]],
    egress: ['#7c5cd6', [4, 10]],
    ref: ['#64748b', [10, 8]],
    escape: ['#0f9d6e', [16, 8]],
  },
  // the phases bright, on the dark profile and on the map (the colours of the page)
  PHB = {
    ingress: ['#34d399', []],
    climb: ['#fbbf24', []],
    pull: ['#e879f9', []],
    dive: ['#38bdf8', []],
    fall: ['#ff5d5d', [14, 10]],
    egress: ['#a78bfa', [4, 10]],
    ref: ['#cbd5e1', [10, 8]],
    escape: ['#34d399', [16, 8]],
  };

function poly(x, pts) {
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
}
function tag(x, t, u, v, fs = 22, bg = '#fff', fg = INK) {
  x.font = `bold ${kbPx(fs)}px ${FONT}`;
  const w = x.measureText(t).width + 14;
  x.fillStyle = bg;
  x.strokeStyle = fg;
  x.lineWidth = 2;
  x.beginPath();
  x.rect(u, v - fs * 0.75, w, fs * 1.3);
  x.fill();
  x.stroke();
  x.fillStyle = fg;
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(t, u + 7, v - fs * 0.1);
}

function planLight(x, D, PX, PY, PW, PH) {
  const all = [...D.segs.flatMap(z => z[1]), ...D.other.flat(), D.target0].filter(Boolean),
    ns = all.map(p => p.n),
    es = all.map(p => p.e),
    cn = (Math.min(...ns) + Math.max(...ns)) / 2,
    ce = (Math.min(...es) + Math.max(...es)) / 2,
    span = Math.max(Math.max(...es) - Math.min(...es), ((Math.max(...ns) - Math.min(...ns)) * PW) / PH, 6000) * 1.18,
    k = PW / span,
    P = p => [PX + PW / 2 + (p.e - ce) * k, PY + PH / 2 - (p.n - cn) * k];
  x.save();
  x.beginPath();
  x.rect(PX, PY, PW, PH);
  x.clip();
  x.fillStyle = '#f6f8fa';
  x.fillRect(PX, PY, PW, PH);
  // rings every nm around the target
  if (D.target0) {
    const [tu, tv] = P(D.target0);
    x.strokeStyle = '#d5dde5';
    x.lineWidth = 2;
    x.setLineDash([6, 8]);
    for (let r = 1; r <= 12; r++) {
      x.beginPath();
      x.arc(tu, tv, r * 6076 * k, 0, 7);
      x.stroke();
    }
    x.setLineDash([]);
  }
  // the lethal radius of your bombs around the first and the last impact
  if (D.leth)
    D.leth.pts.forEach(q => {
      const [u, v] = P(q);
      x.strokeStyle = '#d03030';
      x.lineWidth = 2;
      x.setLineDash([4, 6]);
      x.fillStyle = 'rgba(208,48,48,.06)';
      x.beginPath();
      x.arc(u, v, D.leth.r * k, 0, 7);
      x.fill();
      x.stroke();
      x.setLineDash([]);
    });
  // the other role first, thin and grey
  x.strokeStyle = '#6b7480';
  x.lineWidth = 3;
  x.setLineDash([12, 8]);
  D.other.forEach(pts => {
    poly(
      x,
      pts.map(p => P(p))
    );
    x.stroke();
  });
  x.setLineDash([]);
  D.segs.forEach(([ph, pts]) => {
    const [c, d] = PHC[ph] || [INK, []];
    x.strokeStyle = c;
    x.lineWidth = ph == 'egress' || ph == 'ref' ? 3.5 : 5;
    x.setLineDash(d);
    x.lineJoin = 'round';
    poly(
      x,
      pts.map(p => P(p))
    );
    x.stroke();
  });
  x.setLineDash([]);
  // the points, labels kept apart from each other
  const placed = [];
  D.marks.forEach(([p, label]) => {
    const [u, v] = P(p);
    x.fillStyle = '#fff';
    x.strokeStyle = INK;
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(u, v, 9, 0, 7);
    x.fill();
    x.stroke();
    let dy = -18;
    while (placed.some(q => Math.abs(q[0] - u) < 160 && Math.abs(q[1] - (v + dy)) < 30)) dy -= 32;
    placed.push([u, v + dy]);
    tag(x, label, u + 12, v + dy, 21);
  });
  if (D.target0) {
    const [u, v] = P(D.target0);
    x.fillStyle = '#fff';
    x.strokeStyle = '#d03030';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(u, v - 16);
    x.lineTo(u + 14, v + 10);
    x.lineTo(u - 14, v + 10);
    x.closePath();
    x.fill();
    x.stroke();
    tag(x, 'TGT', u + 18, v + 26, 22, '#fff', '#d03030');
  }
  // north, scale
  x.fillStyle = INK;
  x.beginPath();
  x.moveTo(PX + 40, PY + 30);
  x.lineTo(PX + 30, PY + 58);
  x.lineTo(PX + 50, PY + 58);
  x.closePath();
  x.fill();
  x.font = `bold ${kbPx(24)}px ${FONT}`;
  x.textAlign = 'center';
  x.fillText('N', PX + 40, PY + 84);
  const nm = 6076 * k;
  x.fillRect(PX + PW - 30 - nm, PY + PH - 40, nm, 4);
  x.font = `${kbPx(18)}px ${FONT}`;
  x.textAlign = 'right';
  x.fillText('1 NM', PX + PW - 30, PY + PH - 50);
  if (D.other.length) {
    x.textAlign = 'left';
    x.fillStyle = MUTE;
    x.fillText(`grey dashed: ${D.otherName}`, PX + 20, PY + PH - 24);
  }
  x.restore();
}
// the plan on the picture of the map: the phases bright with a dark edge (they read on a satellite picture and on the coastlines)
function planOnMap(x, D, PX, PY, PW, PH) {
  const S = D.px,
    k = PW / S.img.width,
    P = p => [PX + p[0] * k, PY + p[1] * k];
  x.save();
  x.beginPath();
  x.rect(PX, PY, PW, PH);
  x.clip();
  x.drawImage(S.img, PX, PY, PW, (S.img.height * PW) / S.img.width);
  // the lethal radius of your bombs
  S.leth.forEach(z => {
    const [u, v] = P(z.c);
    x.strokeStyle = '#ff5d5d';
    x.lineWidth = 2.4;
    x.setLineDash([5, 6]);
    x.fillStyle = 'rgba(255,93,93,.12)';
    x.beginPath();
    x.arc(u, v, z.r * k, 0, 7);
    x.fill();
    x.stroke();
    x.setLineDash([]);
  });
  const line = (pts, c, w, d) => {
    x.lineJoin = 'round';
    x.setLineDash(d);
    x.strokeStyle = 'rgba(0,0,0,.55)';
    x.lineWidth = w + 3;
    poly(x, pts.map(P));
    x.stroke();
    x.strokeStyle = c;
    x.lineWidth = w;
    poly(x, pts.map(P));
    x.stroke();
    x.setLineDash([]);
  };
  // the other role white, under this one
  S.other.forEach(a => line(a, '#ffffff', 3, [12, 8]));
  S.segs.forEach(([ph, a]) => {
    const [c, d] = PHB[ph] || ['#fff', []];
    line(a, c, ph == 'egress' || ph == 'ref' ? 3.5 : 5, d);
  });
  const placed = [];
  S.marks.forEach(([p, label]) => {
    const [u, v] = P(p);
    x.fillStyle = '#fff';
    x.strokeStyle = '#111';
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(u, v, 9, 0, 7);
    x.fill();
    x.stroke();
    let dy = -18;
    while (placed.some(q => Math.abs(q[0] - u) < 160 && Math.abs(q[1] - (v + dy)) < 30)) dy -= 32;
    placed.push([u, v + dy]);
    tag(x, label, u + 12, v + dy, 21, '#111', '#fff');
  });
  if (S.tgt) {
    const [u, v] = P(S.tgt);
    x.fillStyle = '#fbbf24';
    x.strokeStyle = '#111';
    x.lineWidth = 2.5;
    x.beginPath();
    x.moveTo(u, v - 16);
    x.lineTo(u + 14, v + 10);
    x.lineTo(u - 14, v + 10);
    x.closePath();
    x.fill();
    x.stroke();
    tag(x, 'TGT', u + 18, v + 26, 22, '#111', '#fbbf24');
  }
  // north, scale, what the grey is
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect(PX + 14, PY + 14, 54, 86);
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(PX + 41, PY + 26);
  x.lineTo(PX + 31, PY + 54);
  x.lineTo(PX + 51, PY + 54);
  x.closePath();
  x.fill();
  x.font = `bold ${kbPx(24)}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillText('N', PX + 41, PY + 86);
  const nm = S.nm * k;
  if (nm > 4) {
    x.fillStyle = 'rgba(0,0,0,.55)';
    x.fillRect(PX + PW - 46 - nm, PY + PH - 70, nm + 32, 54);
    x.fillStyle = '#fff';
    x.fillRect(PX + PW - 30 - nm, PY + PH - 30, nm, 4);
    x.font = `${kbPx(18)}px ${FONT}`;
    x.textAlign = 'right';
    x.fillText('1 NM', PX + PW - 30, PY + PH - 40);
  }
  const note = [
    D.other.length ? `white dashed: ${D.otherName}` : '',
    S.coast ? 'offline coastlines (the base map cannot be copied)' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (note) {
    x.font = `${kbPx(18)}px ${FONT}`;
    const w = x.measureText(note).width + 20;
    x.fillStyle = 'rgba(0,0,0,.55)';
    x.fillRect(PX + 10, PY + PH - 38, w, 28);
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.fillText(note, PX + 20, PY + PH - 18);
  }
  x.restore();
}
/** draws the card for one role on a 1600 x 2400 context */
export function drawAtkCard(x, D) {
  inkCard(x);
  x.save();
  x.fillStyle = '#fff';
  x.fillRect(0, 0, ATC_W, ATC_H);
  // ---- header
  x.fillStyle = INK;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = `bold ${kbPx(56)}px ${FONT}`;
  x.fillText('ATTACK', 40, 84);
  const tw = x.measureText('ATTACK').width;
  x.font = `${kbPx(28)}px ${FONT}`;
  x.fillText(String(D.title || '').slice(0, 52), 70 + tw, 80);
  x.font = `bold ${kbPx(30)}px ${FONT}`;
  const rw = x.measureText(D.role).width + 28;
  x.fillStyle = D.roleCol || '#1d4ed8';
  x.fillRect(1560 - rw, 44, rw, 46);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.fillText(D.role, 1560 - rw / 2, 79);
  x.textAlign = 'left';
  x.font = `bold ${kbPx(26)}px ${FONT}`;
  x.fillStyle = INK;
  x.fillText(D.kind, 40, 128);
  const kw = x.measureText(D.kind).width;
  x.font = `${kbPx(24)}px ${FONT}`;
  x.fillStyle = MUTE;
  x.fillText([D.target, D.bomb].filter(Boolean).join('   ·   '), 60 + kw, 128);
  x.fillStyle = INK;
  x.fillRect(40, 144, 1520, 3);

  // ---- plan: on the picture of the map of the Map page when there is one (D.px: its pixels), else drawn north up on a light ground
  const PX = 40,
    PY = 164,
    PW = 1520,
    PH = 820;
  if (D.px) {
    // the map picture is dark already: its colours (and its labels) are left as they are in the dark look
    /** @type {any} */ (x).__raw = true;
    planOnMap(x, D, PX, PY, PW, PH);
    /** @type {any} */ (x).__raw = false;
  } else planLight(x, D, PX, PY, PW, PH);
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(PX, PY, PW, PH);

  // ---- side profile, on a dark ground as on the page: to scale vertically, the attack along the attack line (target at 0)
  const QX = 150,
    QY = 1030,
    QW = 1410,
    QH = 430,
    Q = D.prof,
    qp = [...Q.segs.flatMap(z => z[1]), ...Q.domes.flat(), [0, 0]],
    qx0 = Math.min(...qp.map(p => p[0])) - 400,
    qx1 = Math.max(...qp.map(p => p[0])) + 400,
    qtop = Math.max(Q.mra || 0, ...qp.map(p => p[1])) * 1.12,
    qx = v => QX + ((v - qx0) / (qx1 - qx0)) * QW,
    qy = a => QY + QH - (Math.max(0, a) / qtop) * QH,
    QP = p => [qx(p[0]), qy(p[1])];
  x.fillStyle = INK;
  x.font = `bold ${kbPx(23)}px ${FONT}`;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillText('SIDE PROFILE', 40, QY - 14);
  x.font = `${kbPx(19)}px ${FONT}`;
  x.fillStyle = MUTE;
  x.fillText('altitudes above the target · fragments of your bombs red, of the other role yellow', 230, QY - 14);
  // the profile is a dark picture in both looks: its colours as they are (the dark look would turn its ground light)
  /** @type {any} */ (x).__raw = true;
  x.fillStyle = '#0f1419';
  x.fillRect(QX - 110, QY, QW + 110, QH);
  x.save();
  x.beginPath();
  x.rect(QX, QY, QW, QH);
  x.clip();
  const step = qtop > 12000 ? 4000 : qtop > 6000 ? 2000 : 1000;
  x.strokeStyle = '#2a3441';
  x.lineWidth = 2;
  x.setLineDash([3, 6]);
  for (let a = step; a < qtop; a += step) {
    x.beginPath();
    x.moveTo(QX, qy(a));
    x.lineTo(QX + QW, qy(a));
    x.stroke();
  }
  x.setLineDash([]);
  x.strokeStyle = '#3a4757';
  x.beginPath();
  x.moveTo(QX, qy(0));
  x.lineTo(QX + QW, qy(0));
  x.stroke();
  const zone = (pts, col, a) => {
    x.fillStyle = `rgba(${col},${a})`;
    x.strokeStyle = `rgb(${col})`;
    x.lineWidth = 2;
    x.setLineDash([4, 5]);
    poly(x, pts.map(QP));
    x.closePath();
    x.fill();
    x.stroke();
    x.setLineDash([]);
  };
  Q.odomes.forEach(d => zone(d, '240,192,64', 0.1));
  Q.domes.forEach(d => zone(d, '255,93,93', 0.1));
  if (Q.mra) {
    x.strokeStyle = '#ff5d5d';
    x.lineWidth = 2;
    x.setLineDash([16, 8]);
    x.beginPath();
    x.moveTo(QX, qy(Q.mra));
    x.lineTo(QX + QW, qy(Q.mra));
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#ff8a8a';
    x.font = `bold ${kbPx(19)}px ${FONT}`;
    x.textAlign = 'left';
    x.fillText('MRA ' + Q.mraT, QX + 10, qy(Q.mra) - 8);
  }
  Q.segs.forEach(([ph, pts]) => {
    const [c, d] = PHB[ph] || ['#fff', []];
    x.strokeStyle = c;
    x.lineWidth = 4.5;
    x.setLineDash(d);
    poly(x, pts.map(QP));
    x.stroke();
  });
  x.setLineDash([]);
  (Q.hot || []).forEach(r => {
    x.strokeStyle = '#ff9f1c';
    x.lineWidth = 8;
    x.globalAlpha = 0.7;
    poly(x, r.map(QP));
    x.stroke();
    x.globalAlpha = 1;
  });
  Q.marks.forEach(([p, label]) => {
    const [u, v] = QP(p);
    x.fillStyle = '#e8eef4';
    x.strokeStyle = '#0f1419';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(u, v, 7, 0, 7);
    x.fill();
    x.stroke();
    x.fillStyle = '#c9d4df';
    x.font = `bold ${kbPx(18)}px ${FONT}`;
    x.textAlign = 'left';
    x.fillText(label, u + 10, v - 10);
  });
  // the target
  x.fillStyle = '#fff';
  x.strokeStyle = '#111';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(qx(0), qy(0) - 9);
  x.lineTo(qx(0) + 9, qy(0));
  x.lineTo(qx(0), qy(0) + 9);
  x.lineTo(qx(0) - 9, qy(0));
  x.closePath();
  x.fill();
  x.stroke();
  x.restore();
  x.fillStyle = '#8b98a8';
  x.font = `${kbPx(18)}px ${FONT}`;
  x.textAlign = 'right';
  x.textBaseline = 'middle';
  for (let a = 0; a < qtop; a += step) x.fillText(a ? (a / 1000).toFixed(0) + 'k' : 'TGT', QX - 10, qy(a));
  /** @type {any} */ (x).__raw = false;
  x.strokeStyle = INK;
  x.lineWidth = 2;
  x.strokeRect(QX - 110, QY, QW + 110, QH);

  // ---- parameters: two columns
  let y = QY + QH + 70;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillStyle = INK;
  x.font = `bold ${kbPx(23)}px ${FONT}`;
  x.fillText('PARAMETERS', 40, y);
  y += 16;
  const half = Math.ceil(D.rows.length / 2),
    rowH = 40;
  D.rows.forEach(([l, v], i) => {
    const c = i < half ? 0 : 1,
      r = i < half ? i : i - half,
      u = 40 + c * 780,
      vv = y + 34 + r * rowH;
    if (r % 2 == 0) {
      x.fillStyle = '#f1f4f7';
      x.fillRect(u, vv - 28, 740, rowH);
    }
    x.fillStyle = MUTE;
    x.font = `${kbPx(22)}px ${FONT}`;
    x.fillText(l, u + 12, vv);
    x.fillStyle = INK;
    x.font = `bold ${kbPx(26)}px ${FONT}`;
    x.textAlign = 'right';
    x.fillText(v, u + 728, vv);
    x.textAlign = 'left';
  });
  y += 34 + half * rowH + 30;

  // ---- spacing and safety
  if (D.spacing) {
    const S = D.spacing;
    x.fillStyle = S.col + '18';
    x.strokeStyle = S.col;
    x.lineWidth = 3;
    x.fillRect(40, y, 1520, 150);
    x.strokeRect(40, y, 1520, 150);
    x.fillStyle = MUTE;
    x.font = `bold ${kbPx(20)}px ${FONT}`;
    x.fillText(S.head.toUpperCase(), 60, y + 36);
    x.fillStyle = INK;
    x.font = `bold ${kbPx(46)}px ${FONT}`;
    x.fillText(S.value, 60, y + 92);
    const vw = x.measureText(S.value).width;
    x.font = `${kbPx(21)}px ${FONT}`;
    x.fillStyle = MUTE;
    if (S.by) x.fillText(S.by, 90 + vw, y + 90);
    x.fillStyle = S.col;
    x.font = `bold ${kbPx(22)}px ${FONT}`;
    x.fillText(S.text, 60, y + 132);
    y += 180;
  }
  D.safety.forEach(([t, c]) => {
    x.fillStyle = c || INK;
    x.font = `bold ${kbPx(24)}px ${FONT}`;
    x.fillText(t, 40, y + 10);
    y += 38;
  });
  y += 24;

  // ---- NAV OFFSETS
  if (D.offsets.length && y < ATC_H - 120) {
    x.fillStyle = INK;
    x.font = `bold ${kbPx(23)}px ${FONT}`;
    x.fillText('NAV OFFSETS (DTC)', 40, y);
    y += 14;
    const C = [40, 820, 1080, 1340];
    x.font = `bold ${kbPx(20)}px ${FONT}`;
    x.fillStyle = MUTE;
    ['', 'Bearing', 'Range ft', 'Elev. ft'].forEach((h, i) => {
      x.textAlign = i ? 'right' : 'left';
      x.fillText(h, i ? C[i] + 200 : C[0] + 12, y + 28);
    });
    y += 38;
    D.offsets.forEach((o, j) => {
      if (y > ATC_H - 40) return;
      if (j % 2 == 0) {
        x.fillStyle = '#f1f4f7';
        x.fillRect(40, y, 1520, 40);
      }
      x.fillStyle = INK;
      x.font = `${kbPx(24)}px ${FONT}`;
      o.forEach((v, i) => {
        x.textAlign = i ? 'right' : 'left';
        x.fillText(String(v), i ? C[i] + 200 : C[0] + 12, y + 29);
      });
      y += 40;
    });
    x.textAlign = 'left';
  }
  (D.notes || []).forEach((t, i) => {
    x.fillStyle = MUTE;
    x.font = `${kbPx(18)}px ${FONT}`;
    x.fillText(t, 40, ATC_H - 24 - ((D.notes || []).length - 1 - i) * 26);
  });
  x.restore();
}
