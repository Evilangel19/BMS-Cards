// MDC card (Mission Data Card): an alternative layout of the Datacard. The blank (app/mdc/blank.jpg, 1600x1200 like the Datacard template) and the cell
// rectangles (app/mdc/fields.json, same 1600x1200 space) are fixed; the texts come from the Datacard fields F (+ F.__wp = [{ll, alt}] the steerpoint coordinates).
// Exported: mdcTexts(F) -> {cellId: text}; drawMdc(ctx, tpl, fields, texts, sx, sy); the export geometry is the same as the Datacard: 2048x2048 from 1600x1200.
const ok = v => v != null && v !== '' && v !== '---';
const g = (F, k) => ok(F[k]) ? String(F[k]) : '';
const T = s => { const m = /^(\d\d:\d\d)/.exec(s); return m ? m[1] : s; };
export function mdcTexts(F) {
  const t = {}, put = (id, v) => { if (ok(v)) t[id] = String(v); };
  const fp = k => i => g(F, `fp${i}_${k}`);
  // header
  put('cs', F.cs); put('msn', F.pkg);
  const to = [...Array(24).keys()].find(i => /take/i.test(fp(0)(i))), ld = [...Array(24).keys()].find(i => /land/i.test(fp(0)(i)) && ok(F[`fp${i}_1`]));
  if (to != null) put('takeoff', T(fp(1)(to))); if (ld != null) put('land', T(fp(1)(ld)));
  const tk = [0, 1, 2, 3, 4, 5].find(i => /refuel/i.test(g(F, `pk${i}_6`)));
  if (tk != null) { put('tanker', g(F, `pk${tk}_0`)); put('ttcn', g(F, `pk${tk}_5`)); put('boom', g(F, `pk${tk}_2`)); }
  else if (ok(F.su0_0)) { put('tanker', String(F.su0_0).split(' - ')[0]); put('ttcn', F.su0_1); put('boom', F.su0_2); }   // the first tanker of the support list
  put('atis', String(F.atis || '').split('\n')[0]); put('tot', F.d1);
  if (ok(F.joker) || ok(F.bingo)) t.jb = `${g(F, 'joker') || '-'} / ${g(F, 'bingo') || '-'}`;
  // flight (pilot, callsign, TCN, FCR, ID, IDM, OWN, STN, laser)
  for (let k = 0; k < 8; k++) { put(`pl${k}_0`, F[`fl${k}_0`]); put(`pl${k}_1`, F[`fl${k}_1`]); put(`pl${k}_2`, F[`fl${k}_2`]); put(`pl${k}_5`, F[`fl${k}_3`]); put(`pl${k}_8`, F[`fl${k}_5`]); }
  // steerpoints: ST, DESCRIPTION, LAT, LONG, ELEV, TOS, TIME, DIST, HDG, FUEL, CONT
  for (let k = 0; k < 14; k++) {
    if (!ok(F[`fp${k}_0`])) continue;
    const w = F.__wp && F.__wp[k], m = w && /^(.)\s*(\d+)°\s*([\d.]+)'\s+(.)\s*(\d+)°\s*([\d.]+)'/.exec(w.ll);
    put(`sp${k}_0`, k + 1); put(`sp${k}_1`, F[`fp${k}_0`]);
    if (m) { put(`sp${k}_2`, `${m[1]}${m[2]}°${m[3]}'`); put(`sp${k}_3`, `${m[4]}${m[5]}°${m[6]}'`); }
    put(`sp${k}_4`, F[`fp${k}_5`]); put(`sp${k}_5`, F[`fp${k}_1`]); put(`sp${k}_7`, F[`fp${k}_3`]); put(`sp${k}_8`, F[`fp${k}_2`]); put(`sp${k}_9`, F[`fp${k}_6`]);
  }
  // loadout / take-off row
  put('cfg', [F.aa, F.ag, F.tanks].filter(ok).join('; ')); put('gw', F.gw); put('di', F.drag); put('rot', F.rot); put('to', F.tospec); put('ref', F.ref);
  // package (roll call): callsign, aircraft, hold, alt, freq, push, tgt, TOT
  for (let k = 0; k < 10; k++) { put(`rc${k}_0`, F[`pk${k}_0`]); put(`rc${k}_1`, F[`pk${k}_1`]); put(`rc${k}_4`, F[`pk${k}_2`]); put(`rc${k}_6`, F[`pk${k}_6`]); }
  // mission timeline
  for (let k = 0, j = 0; k < 24 && j < 12; k++) if (ok(F[`fp${k}_0`]) && ok(F[`fp${k}_1`])) { put(`tl${j}_0`, T(F[`fp${k}_1`])); put(`tl${j}_1`, `STPT ${k + 1} ${F[`fp${k}_0`]}`); j++; }
  // overview and free area
  t.over = [ok(F.pri) && 'PRI ' + F.pri, ok(F.sec) && 'SEC ' + F.sec, ok(F.d1) && 'ON STA ' + F.d1, ok(F.d2) && 'WIN ' + F.d2].filter(Boolean).join('\n');
  const su = [0, 1, 2, 3, 4].map(i => ok(F[`su${i}_0`]) ? `${F[`su${i}_0`]}  ${g(F, `su${i}_1`)}  ${g(F, `su${i}_2`)}  ${g(F, `su${i}_3`)}` : '').filter(Boolean);
  t.free = [ok(F.atis) && String(F.atis), ok(F.free) && F.free, su.length && 'SUPPORT\n' + su.join('\n'), ok(F.eph) && F.eph, ok(F.roe) && 'ROE: ' + F.roe].filter(Boolean).join('\n');
  Object.keys(t).forEach(k => { if (!t[k]) delete t[k]; });
  return t;
}
// which Datacard field each MDC cell edits (null = a derived cell that is not editable); F is needed for the cells that follow the flight (take-off row, tanker)
export function mdcKeys(F) {
  const k = {cs: 'cs', msn: 'pkg', atis: 'atis', tot: 'd1', cfg: 'aa', gw: 'gw', di: 'drag', rot: 'rot', to: 'tospec', ref: 'ref', free: 'free'}, N = [...Array(24).keys()];
  const to = N.find(i => /take/i.test(g(F, `fp${i}_0`))), ld = N.find(i => /land/i.test(g(F, `fp${i}_0`)) && ok(F[`fp${i}_1`]));
  if (to != null) k.takeoff = `fp${to}_1`; if (ld != null) k.land = `fp${ld}_1`;
  const tk = [0, 1, 2, 3, 4, 5].find(i => /refuel/i.test(g(F, `pk${i}_6`)));
  if (tk != null) { k.tanker = `pk${tk}_0`; k.ttcn = `pk${tk}_5`; k.boom = `pk${tk}_2`; } else { k.tanker = 'su0_0'; k.ttcn = 'su0_1'; k.boom = 'su0_2'; }
  for (let r = 0; r < 8; r++) { k[`pl${r}_0`] = `fl${r}_0`; k[`pl${r}_1`] = `fl${r}_1`; k[`pl${r}_2`] = `fl${r}_2`; k[`pl${r}_5`] = `fl${r}_3`; k[`pl${r}_8`] = `fl${r}_5`; }
  for (let r = 0; r < 14; r++) { k[`sp${r}_1`] = `fp${r}_0`; k[`sp${r}_4`] = `fp${r}_5`; k[`sp${r}_5`] = `fp${r}_1`; k[`sp${r}_7`] = `fp${r}_3`; k[`sp${r}_8`] = `fp${r}_2`; k[`sp${r}_9`] = `fp${r}_6`; }
  for (let r = 0; r < 10; r++) { k[`rc${r}_0`] = `pk${r}_0`; k[`rc${r}_1`] = `pk${r}_1`; k[`rc${r}_4`] = `pk${r}_2`; k[`rc${r}_6`] = `pk${r}_6`; }
  return k;
}
// text of a cell: one line fitted to the width (smaller font down to a minimum), or several lines (multi). `lab`: a label sits at the top of the cell, the text goes below it
export function drawMdc(x, tpl, fields, texts, sx = 1, sy = 1) {
  x.setTransform(sx, 0, 0, sy, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, 1600, 1200); x.drawImage(tpl, 0, 0, 1600, 1200);
  x.fillStyle = '#0a1f6e'; x.textBaseline = 'middle';
  for (const f of fields) {
    const s = texts[f.id]; if (!s) continue;
    const [x0, y0, x1, y1] = f.r, top = f.lab ? y0 + 17 : y0, w = x1 - x0 - 6, h = y1 - top;
    if (f.multi) {
      const wrap = (fs) => { x.font = `${fs}px Arial`; const out = []; s.split('\n').forEach(par => { let cur = ''; par.split(' ').forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (cur && x.measureText(t).width > w) { out.push(cur); cur = wd; } else cur = t; }); out.push(cur); }); return out; };
      let fs = 15, L = wrap(fs); while (fs > 6.5 && L.length * fs * 1.12 > h) { fs -= .5; L = wrap(fs); }
      x.textAlign = 'left'; L.forEach((l, i) => x.fillText(l, x0 + 3, top + fs * (i * 1.12 + .6)));
    } else {
      let fs = Math.min(15, h * .78); x.font = `bold ${fs}px Arial`;
      while (fs > 7 && x.measureText(s).width > w) { fs -= .5; x.font = `bold ${fs}px Arial`; }
      x.textAlign = 'center'; x.fillText(s, (x0 + x1) / 2, top + h / 2 + 1);
    }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
// the Datacard export without the gap between the two pages: left panel [0,1009] -> 1024, right panel [1105,2048] -> 1024 (the MDC pages start at x = 26 and 863 of 1600)
export function mdcGapless(cv) {
  const o = document.createElement('canvas'); o.width = o.height = 2048; const q = o.getContext('2d'); q.fillStyle = '#fff'; q.fillRect(0, 0, 2048, 2048);
  q.imageSmoothingEnabled = true; q.imageSmoothingQuality = 'high'; q.drawImage(cv, 0, 0, 1009, 2048, 0, 0, 1024, 2048); q.drawImage(cv, 1105, 0, 943, 2048, 1024, 0, 1024, 2048); return o;
}
