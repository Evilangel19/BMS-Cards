// @ts-check
// The Smart Weather card (core/smartcard.js look): the key box (the colour states of the departure, the landing and the alternate, the cloud over the
// target, the wind at the cruise level, the 0 °C over the target, the contrails, the QNH), the profile along the route (terrain, clouds, rain, fog, 0 °C,
// contrails, the flight), the winds and temperatures at 30 / 18 / 9 / 3 thousand ft at the departure, the target and the landing, then the reports.
// D: the data of the Weather card of the Weather page (cardData): {title, sub, dep, tot, route [{x, y, alt, t, n, d}], tgt, depId, ldgId, prof [samples],
// at(t) -> weather {at(x, y) -> {t}, wind(x, y, alt) -> {hdg, spd}}, contrail, reports [{lab, text, col}]}
import { scFrame, scKey, scSec, scEnd, scText, scLine, scTri, scWidth, wrap, fmt } from './smartcard.js';

const RED = '#cc0000',
  COV = d => (d >= 12 ? 'OVC' : d >= 8 ? 'BKN' : d >= 5 ? 'SCT' : d >= 1 ? 'FEW' : ''),
  BAD = new Set(['AMB', 'RED']),
  hhmm = t => {
    const m = Math.floor((t || 0) / 60000);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
/** the cloud of a sample as a METAR group ("BKN090"), '' with none */
export const cloudOf = p =>
  p && p.cond > 0 && p.dens >= 1 && p.cu !== 10000
    ? COV(p.dens) + String(Math.round(p.cu / 100)).padStart(3, '0') + (p.tcu ? 'TCU' : '')
    : '';
// the thickness of a cloud (as the Weather card draws it)
const thick = p => (2500 + ((5 - (p.size || 0)) / 5) * 8500) * (p.tcu ? 1.5 : 1) * (p.cond >= 2 ? 0.7 : 1);

/** @param {CanvasRenderingContext2D} x */
export function drawSmartWeather(x, D) {
  const tot = D.tot != null ? D.tot : D.dep,
    R = D.route || [],
    S = D.prof || [],
    T = R[D.tgt >= 0 ? D.tgt : 0] || R[0],
    near = d => (S.length ? S.reduce((b, q) => (Math.abs(q.d - d) < Math.abs(b.d - d) ? q : b)) : null),
    sT = T ? near(T.d) : null,
    W = D.at ? D.at(tot) : null,
    cruise = Math.max(...R.map(p => p.alt || 0), 0),
    rep = k => (D.reports || []).find(r => r.lab.startsWith(k)),
    col = r => (r && r.col ? r.col : '--'),
    q = (/Q(\d{3,4})/.exec((rep('DEP') || {}).text || '') || [])[1] || '--';
  let wind = '--',
    z0 = '--';
  if (W && T) {
    try {
      const w = W.wind(T.x, T.y, cruise || 20000);
      wind = String(Math.round(w.hdg) % 360 || 360).padStart(3, '0') + '/' + Math.round(w.spd);
      z0 = fmt(((sT && sT.elev) || 0) + (Math.max(0, W.at(T.x, T.y).t) / 1.98) * 1000);
    } catch (e) {
      /* no weather there */
    }
  }
  const ct = S.length ? Math.min(...S.map(p => p.contrail || 99999)) : null;
  scFrame(x, 'WEATHER · ' + hhmm(tot), String(D.title || '').split(' · ')[0]);
  scKey(x, [
    ['DEP ' + (D.depId || ''), col(rep('DEP')), BAD.has(col(rep('DEP')))],
    ['TGT CLOUD', cloudOf(sT) || 'NSC'],
    ['LDG ' + (D.ldgId || ''), col(rep('LDG')), BAD.has(col(rep('LDG')))],
    ['ALTN', col(rep('ALTN')), BAD.has(col(rep('ALTN')))],
    ['WIND FL' + String(Math.round((cruise || 20000) / 1000) * 10).padStart(3, '0'), wind],
    ['0 °C TGT', z0],
    ['CONTRAIL', ct && ct < 99999 ? 'FL' + Math.round(ct / 1000) * 10 : '--'],
    ['QNH DEP', q],
  ]);
  // ---- the profile
  scSec(x, 146, 'ROUTE PROFILE');
  const BX = 44,
    BY = 168,
    BW = 400,
    BH = 150,
    dMax = Math.max(1, ...R.map(p => p.d)),
    TOP = Math.max(20000, cruise + 6000, ...S.filter(p => p.cond > 0 && p.cu !== 10000).map(p => p.cu + thick(p))),
    X = d => BX + (d / dMax) * BW,
    Y = a => BY + BH - (Math.max(0, a) / TOP) * BH;
  x.save();
  x.beginPath();
  x.rect(BX, BY, BW, BH);
  x.clip();
  for (let a = 10000; a < TOP; a += 10000)
    scLine(
      x,
      [
        [BX, Y(a)],
        [BX + BW, Y(a)],
      ],
      { c: '#cccccc', w: 0.5 }
    );
  if (S.length > 1) {
    for (let k = 0; k < S.length - 1; k++) {
      const p = S[k],
        n = S[k + 1];
      if (!(p.cond > 0 && p.dens > 4 && p.cu !== 10000)) continue;
      scLine(
        x,
        [
          [X(p.d), Y(p.cu)],
          [X(n.d), Y(n.cu)],
          [X(n.d), Y(n.cu + thick(n))],
          [X(p.d), Y(p.cu + thick(p))],
        ],
        { close: true, fill: p.dens >= 8 ? '#d6d6d6' : '#eaeaea', w: 0 }
      );
      if (p.cond >= 2 && p.dens > 7 && k % 2 == 0)
        scLine(
          x,
          [
            [X(p.d), Y(p.cu)],
            [X(p.d) - 2, Y(p.elev || 0)],
          ],
          { c: '#777777', w: 0.8 }
        );
    }
    S.forEach(
      (p, k) =>
        k + 1 < S.length &&
        p.fogEnd < 5 &&
        scLine(
          x,
          [
            [X(p.d), Y((p.elev || 0) + 700)],
            [X(S[k + 1].d), Y((p.elev || 0) + 700)],
          ],
          { c: '#999999', w: 3 }
        )
    );
    scLine(x, [[X(0), Y(0)], ...S.map(p => [X(p.d), Y(p.elev || 0)]), [X(dMax), Y(0)]], {
      close: true,
      fill: '#c8c8c8',
      c: '#999999',
      w: 0.8,
    });
    scLine(
      x,
      S.map(p => [X(p.d), Y((p.elev || 0) + (Math.max(0, p.tt) / 2) * 1000)]),
      { w: 1, dash: [3, 3] }
    );
    scLine(
      x,
      S.map(p => [X(p.d), Y(p.contrail || 0)]),
      { c: '#888888', w: 1, dash: [6, 4] }
    );
  }
  scLine(
    x,
    R.map(p => [X(p.d), Y(p.alt)]),
    { w: 2.5 }
  );
  x.restore();
  scLine(
    x,
    [
      [BX, BY],
      [BX + BW, BY],
      [BX + BW, BY + BH],
      [BX, BY + BH],
    ],
    { close: true, c: '#999999', w: 0.5 }
  );
  for (let a = 10000; a < TOP; a += 10000)
    scText(x, BX - 4, Y(a) + 4, 10, a / 1000 + 'k', { c: '#777777', al: 'right' });
  if (S.length) {
    const L = S[S.length - 1];
    scText(x, BX + BW - 4, Y((L.elev || 0) + (Math.max(0, L.tt) / 2) * 1000) - 4, 10, '0 °C', {
      al: 'right',
      halo: true,
    });
    if (L.contrail < TOP)
      scText(x, BX + BW - 4, Y(L.contrail) - 4, 10, 'contrails', { c: '#666666', al: 'right', halo: true });
  }
  if (T) scTri(x, X(T.d), Y(0) - 6, 7);
  [
    [0, 'DEP'],
    [T ? T.d : -1, 'TGT'],
    [dMax, 'LDG'],
  ].forEach(([d, l]) => d >= 0 && scText(x, X(d), BY + BH + 14, 11, l, { w: 700, al: 'center' }));
  if (sT && cloudOf(sT)) scText(x, X(T.d) + 8, Y(sT.cu) + 12, 10, cloudOf(sT), { c: '#555555', halo: true });
  // ---- the winds and temperatures
  scSec(x, 340, 'WINDS / TEMP');
  const pts = [
    ['DEP', R[0]],
    ['TGT', T],
    ['LDG', R[R.length - 1]],
  ];
  pts.forEach(([l], c) => scText(x, 70 + c * 130, 372, 11, l, { c: '#666666', w: 700 }));
  [30000, 18000, 9000, 3000].forEach((a, i) => {
    scText(x, 12, 388 + i * 15, 11, a / 1000 + 'k', { c: '#666666', w: 700 });
    pts.forEach(([, p], c) => {
      const Wi = p && D.at ? D.at(p.t) : null;
      let s = '--';
      if (Wi)
        try {
          const w = Wi.wind(p.x, p.y, a),
            tc = Math.round(Wi.at(p.x, p.y).t - (1.98 * a) / 1000);
          s =
            String(Math.round(w.hdg) % 360 || 360).padStart(3, '0') +
            '/' +
            String(Math.round(w.spd)).padStart(2, '0') +
            ' ' +
            (tc > 0 ? '+' : '') +
            tc;
        } catch (e) {
          s = '--';
        }
      scText(x, 70 + c * 130, 388 + i * 15, 13, s);
    });
  });
  // ---- the reports
  scSec(x, 452, 'REPORTS');
  let y = 484;
  for (const r of D.reports || []) {
    if (y > 676) break;
    const bad = BAD.has(r.col),
      head = r.lab.replace(/\s+/g, ' ') + (r.col ? ' ' + r.col : '');
    scText(x, 12, y, 11, head, { c: bad ? RED : '#666666', w: 700 });
    y += 15;
    for (const l of wrap(x, String(r.text || ''), 13, 432)) {
      if (y > 684) break;
      scText(x, 12, y, 13, l.trim() == l ? l : '  ' + l.trim(), { c: bad ? RED : undefined });
      y += 15;
    }
    y += 4;
  }
  if (scWidth(x, 10, D.sub || '') && y < 684)
    scText(x, 448, 684, 10, String(D.sub || ''), { c: '#777777', al: 'right' });
  scEnd(x);
}
