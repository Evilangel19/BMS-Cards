// The card (Datacard + mission data card), drawn entirely in code: nothing of it is an image. Space 1584 x 1224 (the frame of the original MDC), two pages side by side.
// The parts taken from the MDC (top block, M1-M4, audio presets, NAV, data link, fence in, in-flight report) keep the sizes of the original.
const NAVY = '#1c2b4a', INK = '#46556e', BAND = '#fdf0c4', LBL = '#e3e8ef', TXT = '#34445e';
const RH = 19.4, BH = 19.6;      // row pitch and header bar height of the original

export function buildLayout() {
  const S = [], F = [];
  const bar = (x, y, w, text, h = BH) => S.push({t: 'bar', r: [x, y, x + w, y + h], text});
  const cell = (x, y, w, h, o = {}) => { S.push({t: 'cell', r: [x, y, x + w, y + h], fill: o.fill || '#fff', lab: o.lab || '', big: o.big, txt: o.txt, hint: o.hint, white: o.white, inl: o.inl, red: o.red}); if (o.k) F.push({k: o.k, lab: o.fl || o.lab || o.k, r: [x, y, x + w, y + h], multi: o.multi, img: o.img, lt: o.lt, inl: o.inl, red: o.red}); };
  const row = (x, y, ws, items, h = RH, fill = '#fff') => { let cx = x; ws.forEach((w, i) => { const it = items[i]; if (it == null || it === '') cell(cx, y, w, h, {fill}); else if (typeof it == 'string') cell(cx, y, w, h, {fill: LBL, lab: it}); else cell(cx, y, w, h, {fill: it.fill || fill, ...it}); cx += w; }); };
  const hdr = (x, y, segs, h = BH) => { let cx = x; segs.forEach(s => { bar(cx, y, s[0], s[1], h); cx += s[0]; }); };
  const band = i => i % 2 ? BAND : '#fff';
  // cells with the label in the top-left corner; xs = column boundaries
  const lrow = (xs, y, h, items) => items.forEach((it, i) => { if (it) cell(xs[i], y, xs[i + 1] - xs[i], h, {lab: it.lab, k: it.k, fl: it.fl, multi: it.multi, lt: 1, red: it.red}); });

  // ================================================================ PAGE 1  x 26..779
  const L = 26, W = 753;
  bar(L, 8, W, 'DATACARD  ·  PAGE 1', 19);
  lrow([26, 172.8, 252.9, 337.2, 425.5, 513.8, 624.2, 734.7, 779], 27, 35, [{lab: 'CALLSIGN', k: 'cs'}, {lab: 'STEP', k: 'step'}, {lab: 'START', k: 'start'}, {lab: 'CHECK IN', k: 'chkin'}, {lab: 'TAXI', k: 'taxi'}, {lab: 'TAKEOFF', k: 'to_time'}, {lab: 'LAND', k: 'ld_time'}, {lab: 'AUX', k: 'aux'}]);
  lrow([26, 132.7, 252.9, 381.4, 447.6, 491.8, 535.9, 646.3, 779], 62, 39, [{lab: 'MSN #', k: 'pkg'}, {lab: 'TANKER', k: 'su0_0'}, {lab: 'TRACK / ARCT', k: 'su0_3'}, {lab: 'TCN / MC', k: 'su0_1'}, {lab: 'ALT', k: 'tk_alt'}, {lab: 'OFF', k: 'tk_off'}, {lab: 'TANK J/B', k: 'tk_jb'}, {lab: 'BOOM / FREQ', k: 'su0_2'}]);
  lrow([26, 447.6, 624.2], 101, 39, [{lab: 'AIRSPACE / TGT', k: 'airsp'}, {lab: 'ATIS', k: 'atis', multi: 1}]);
  lrow([26, 92.7, 172.8, 252.9, 293.1, 491.8, 558, 624.2], 140, 38.6, [{lab: 'M1', k: 'm1'}, {lab: 'M2', k: 'm2'}, {lab: 'M3', k: 'm3'}, {lab: 'M4', k: 'm4'}, {lab: 'TOT / VUL', k: 'd1'}, {lab: 'JOKER', k: 'joker'}, {lab: 'BINGO', k: 'bingo', red: 1}]);
  // audio presets (right column, from y 101)
  const PX = [624.2, 668.4, 712.5, 778.8];
  hdr(PX[0], 101, [[PX[1] - PX[0], 'PRI'], [PX[2] - PX[1], 'FREQ'], [PX[3] - PX[2], 'AGENCY']], RH);
  [['1', 'OPS'], ['2', 'GND'], ['3', 'TWR'], ['4', 'DEP/APR'], ['5', 'CHKN'], ['6', 'C2/TAC'], ['13', 'TNKR'], ['10', 'ALT A'], ['11', 'ALT T'], ['12', 'ALT G']].forEach((p, i) => row(PX[0], 101 + RH + i * RH, [PX[1] - PX[0], PX[2] - PX[1], PX[3] - PX[2]], [{fill: LBL, lab: p[0], big: 1}, {k: `ps${i}`, fl: 'Preset ' + p[0] + ' ' + p[1]}, {fill: LBL, lab: p[1], big: 1}], RH));
  // NAV (original block under the presets): header 1 2 3, two rows
  const NY0 = 101 + 11 * RH + 1;
  [['NAV', 624.2, 22.8], ['1', 647, 44], ['2', 691, 44], ['3', 735, 44]].forEach(c => bar(c[1], NY0, c[2], c[0], 19.6));
  [0, 1].forEach(i => row(647, NY0 + 19.6 + i * RH, [44, 44, 44], [0, 1, 2].map(j => ({k: `nav${i}_${j}`, fl: `NAV ${i + 1}.${j + 1}`})), RH));
  cell(624.2, NY0 + 19.6, 22.8, 2 * RH, {fill: NAVY});
  // flight (left, width 598.6) and package
  const FWs = [54, 170, 60, 60, 72, 91, 91.6], FY0 = 179;
  hdr(L, FY0, [[54, 'POS'], [170, 'NAME'], [60, 'IDM'], [60, 'TCN'], [72, 'LINK 16'], [91, 'CONF-LSR'], [91.6, 'IFF 2/3 · 4']]);
  ['1 LEAD', '2 WING', '3 ELEMENT', '4 WING'].forEach((p, i) => row(L, FY0 + BH + i * RH, FWs, [p, {k: `fl${i}_0`}, {k: `fl${i}_1`}, {k: `fl${i}_2`}, {k: `fl${i}_3`}, {k: `fl${i}_5`}, {k: `fl${i}_6`}], RH, band(i)));
  const PKY = FY0 + BH + 4 * RH + 5;
  hdr(L, PKY, [[170, 'CALLSIGN PACK'], [98, 'AIRCRAFT'], [62, 'UHF'], [62, 'VHF'], [58, 'STN'], [58, 'TCN'], [90.6, 'TASK']]);
  for (let i = 0; i < 5; i++) row(L, PKY + BH + i * RH, [170, 98, 62, 62, 58, 58, 90.6], [0, 1, 2, 3, 4, 5, 6].map(j => ({k: `pk${i}_${j}`})), RH, band(i));
  // airbase
  const AY = Math.max(PKY + BH + 5 * RH, NY0 + 19.6 + 2 * RH) + 6;
  hdr(L, AY, [[56, 'AIRBASE'], [184, 'NAME'], [60, 'TCN'], [80, 'GND'], [80, 'APP'], [70, 'ELEV'], [90, 'RWY'], [133, 'ILS']]);
  ['DEP', 'ARR', 'ALTN'].forEach((p, i) => row(L, AY + BH + i * RH, [56, 184, 60, 80, 80, 70, 90, 133], [p, ...[0, 1, 2, 3, 4, 5, 6].map(j => ({k: `ab${i}_${j}`}))], RH, band(i)));
  // flight plan: 24 steerpoints
  const FY = AY + BH + 3 * RH + 6;
  hdr(L, FY, [[44, 'STPT'], [150, 'ACTION'], [90, 'TOS'], [60, 'HDG'], [60, 'DIST'], [80, 'MACH/GS'], [80, 'ALT'], [80, 'MIN FUEL'], [109, 'FORMATION']]);
  for (let i = 0; i < 24; i++) row(L, FY + BH + i * RH, [44, 150, 90, 60, 60, 80, 80, 80, 109], [String(i + 1), ...[0, 1, 2, 3, 4, 5, 6, 7].map(j => ({k: `fp${i}_${j}`}))], RH, band(i));
  // data link (columns of the original)
  const DY = FY + BH + 24 * RH + 6, DX = [26, 92.7, 172.8, 212.9, 252.9, 293.1, 337.2, 381.4, 447.6, 469.9, 535.9, 558.2, 624.2, 646.9, 778.8];
  bar(L, DY, W, '', BH);
  [[26, 92.7, 'LINK'], [92.7, 172.8, 'NDL'], [172.8, 212.9, 'FC'], [212.9, 252.9, 'MC'], [252.9, 293.1, 'SC'], [293.1, 337.2, 'XMIT'], [337.2, 381.4, 'TIME'], [381.4, 447.6, 'NTR'], [447.6, 535.9, 'FLIGHT'], [535.9, 624.2, 'TEAM'], [624.2, 778.8, 'DONOR']].forEach(c => S.push({t: 'txt', r: [c[0], DY, c[1], DY + BH], text: c[2]}));
  [0, 1].forEach(i => { const y = DY + BH + i * RH, k = n => `dl${i}_${n}`, w = j => DX[j + 1] - DX[j];
    cell(26, y, 66.7, RH, {fill: NAVY, lab: 'AB'[i], white: 1});
    [[1, 'ndl'], [2, 'fc'], [3, 'mc'], [4, 'sc']].forEach(([j, n]) => cell(DX[j], y, w(j), RH, {k: k(n), fl: 'Link ' + n.toUpperCase() + ' ' + 'AB'[i]}));
    [[5, 'HI'], [6, 'ON'], [7, 'OFF']].forEach(([j, t]) => cell(DX[j], y, w(j), RH, {fill: LBL, lab: t, big: 1}));
    [[8, 'fl'], [10, 'tm'], [12, 'dn']].forEach(([j, n]) => { cell(DX[j], y, w(j), RH, {fill: NAVY}); const e = j == 12 ? 778.8 : DX[j + 2]; cell(DX[j + 1], y, e - DX[j + 1], RH, {k: k(n), fl: 'Link ' + {fl: 'flight', tm: 'team', dn: 'donor'}[n] + ' ' + 'AB'[i]}); }); });
  // notes, fence in, ephemerides, server ip
  const NT = DY + BH + 2 * RH + 6, FOOT = 1206 - 19.5, EH = BH + 34, EY = FOOT - 6 - EH;
  hdr(L, NT, [[598.2, 'NOTES  /  AIRFIELD FREQUENCIES  /  BACKUP'], [154.8, 'FENCE  IN']], BH);
  cell(L, NT + BH, 598.2, EY - 6 - NT - BH, {k: 'free', fl: 'Notes', multi: 1});
  const fence = ['CH/FL, COMM, CAMERA', 'LINK, LIGHTS, NVG, ECM', 'SMS, HUD, HMCS, HSI, IFF', 'AIFF, EGI, RDR, RWR, TCN', 'TANK INERT, G-SUIT'], fh = (FOOT - 6 - NT - BH) / 5;
  fence.forEach((t, i) => cell(624.2, NT + BH + i * fh, 154.6, fh, {txt: t}));
  bar(L, EY, 330, 'EPHEMERIDES  (SUN / MOON)', BH); cell(L, EY + BH, 330, 34, {k: 'eph', fl: 'Ephemerides', multi: 1});
  row(L, FOOT, [90, W - 90], [{fill: LBL, lab: 'SERVER IP:', big: 1}, {k: 'srv', fl: 'Server IP'}], 19.5);

  // ================================================================ PAGE 2  x 854..1558
  const R = 854, W2 = 704;
  bar(R, 8, W2, 'DATACARD  ·  PAGE 2', 19);
  let y = 31;
  row(R, y, [70, 130, 70, 150, 70, 214], ['CALLSIGN', {k: 'cs'}, 'PACKAGE', {k: 'pkg'}, 'MISSION', {k: 'mis'}], RH); y += RH + 3;
  bar(R, y, W2, 'LOADOUT  /  TAKE-OFF'); y += BH;
  const LW = [58, 190, 78, 56, 78, 56, 78, 110];
  [['A-A', 'aa', 'GROSS WGT', 'gw', 'ROTATION', 'rot', 'TO SPEC', 'tospec'], ['A-G', 'ag', 'DRAG IDX', 'drag', 'REFUSAL', 'ref', 'TO FUEL', 'tof'], ['ECM', 'ecm', 'ALOW', 'alow', 'MIL POWER', 'mp', 'SET FUEL', 'setf'], ['TANKS', 'tanks', 'MSL', 'msl', 'MIL CLIMB', 'mc', 'FUEL', 'fuel']].forEach(r => { row(R, y, LW, [r[0], {k: r[1]}, r[2], {k: r[3]}, r[4], {k: r[5]}, r[6], {k: r[7]}], RH); y += RH; });
  y += 3; bar(R, y, W2, 'TARGET'); y += BH;
  [['PRIMARY', 'pri', 'SECONDARY', 'sec'], ['TOT', 'd1', 'TOT', 'd2'], ['LAT / LONG', 'll1', 'LAT / LONG', 'll2']].forEach(r => { row(R, y, [76, 276, 76, 276], [r[0], {k: r[1]}, r[2], {k: r[3]}], RH); y += RH; });
  y += 3; bar(R, y, W2, 'EWS  THREAT  PROGRAMS'); y += BH;
  row(R, y, [54, 108.3, 108.3, 108.3, 108.3, 108.3, 108.5], ['EWS', ...[0, 1, 2, 3, 4, 5].map(i => ({k: `ews${i}`, lab: `${i + 1} =`, inl: 1}))], RH); y += RH;
  y += 3; hdr(R, y, [[352, 'WEAPON  ·  PROFILE 1'], [352, 'PROFILE 2']]); y += BH;
  const pw = [58, 59, 58, 59, 58, 60];
  const prof = (x, n) => [[['MODE', 'mode'], ['FUZE', 'fuze'], ['SGL / PAIR', 'sgl']], [['AD', 'ad'], ['RP', 'rp'], ['BA', 'hb']], [['SPACING', 'spc'], ['REL ANG', 'ang'], ['B. CODE', 'bc']]].forEach((r, i) => row(x, y + i * RH, pw, r.flatMap(p => [p[0], {k: `wp${n}_${p[1]}`}]), RH));
  prof(R, 1); prof(R + 352, 2); y += 3 * RH;
  y += 3; bar(R, y, W2, 'DELIVERY'); y += BH;
  const dy0 = y, dw = [64, 84, 84, 84, 84];
  row(R, y, dw, ['', 'VRP / VIP', 'PUP', 'OA 1', 'OA 2'], RH); y += RH;
  [['TBRG', 0], ['RNG', 1], ['ELV', 2]].forEach(r => { row(R, y, dw, [r[0], {k: `dv${r[1]}`}, {k: `dp${r[1]}`}, {k: `oa${r[1]}`}, {k: `ob${r[1]}`}], RH); y += RH; });
  row(R, y, [64, 132, 64, 132], ['MODE', {k: 'dmode'}, 'ATTACK', {k: 'dlab'}], RH); y += RH;
  [['PULL HDG', 'dl_ph', 'TGT IN HUD', 'dl_th'], ['CLIMB', 'dl_cl', 'INGRESS ALT', 'dl_ia'], ['PULL DOWN', 'dl_pd', 'INGRESS SPD', 'dl_is'], ['TURN', 'dl_tn', 'REL HEIGHT', 'dl_rh'], ['ATTACK HDG', 'dl_ah', 'REL SPD', 'dl_rs']].forEach((r, i) => row(R + 400, dy0 + i * RH, [84, 52, 88, 80], [r[0], {k: r[1]}, r[2], {k: r[3]}], RH));
  y += 3; hdr(R, y, [[66, 'SUPPORT'], [138, 'TYPE'], [66, 'TACAN'], [66, 'UHF'], [66, 'LOC'], [302, 'NOTES / TIMES']]); y += BH;
  ['TANKER 1', 'TANKER 2', 'AWACS', 'JSTAR', 'FAC'].forEach((p, i) => { row(R, y, [66, 138, 66, 66, 66, 302], [p, {k: `su${i}_0`}, {k: `su${i}_1`}, {k: `su${i}_2`}, {k: `su${i}_3`}, {k: `sn${i}`}], RH, band(i)); y += RH; });
  // datacard screenshot box: the size of the one on the current Datacard (441 x 441), bottom left; BVR and ROE on its right
  const SBY = 1070 - 6 - 441, SBX = R, BX = R + 441 + 6, BW = W2 - 441 - 6;
  bar(SBX, SBY - BH, 441, 'DATACARD  SCREENSHOT'); cell(SBX, SBY, 441, 441, {k: 'shot', fl: 'Screenshot', img: 1, hint: 'Map screenshot'});
  const by = SBY - BH;
  hdr(BX, by, [[98, 'BVR  ·  CLASS'], [32, 'MTR'], [32, 'FR'], [32, 'MAR'], [32, 'DR'], [32, 'DOR']]);
  [0, 1, 2, 3].forEach(i => row(BX, by + BH + i * RH, [98, 32, 32, 32, 32, 32], [{k: `bv${i}_0`}, ...[1, 2, 3, 4, 5].map(j => ({k: `bv${i}_${j}`}))], RH, band(i)));
  const ry = by + BH + 4 * RH + 6; bar(BX, ry, BW, 'ROE'); cell(BX, ry + BH, BW, SBY + 441 - ry - BH, {k: 'roe', fl: 'ROE', multi: 1});
  // in-flight report block (original sizes): INFLT REP | EEI FORMAT | ON-SCENE CC | CONTRACTS
  const IX = [854, 934, 1014.2, 1174.5, 1558];
  hdr(R, 1070, [[IX[1] - IX[0], 'INFLT REP'], [IX[2] - IX[1], 'EEI FORMAT'], [IX[3] - IX[2], 'ON-SCENE CC'], [IX[4] - IX[3], 'CONTRACTS']], 19.8);
  const T = [['1. Callsign', '2. Mission #', '3. Location', '4. TOT', '5. Results', '6. Remarks'], ['1. Callsign', '2. Location', '3. Event', '4. Remarks', '', ''], ['1. Authenticate', '2. Physical Condition', '3. Threats', '4. Location', '5. Pass data to AMC/relief', '']];
  for (let i = 0; i < 6; i++) { const yy = 1090 + i * RH; for (let c = 0; c < 3; c++) cell(IX[c], yy, IX[c + 1] - IX[c], RH, T[c][i] ? {txt: T[c][i]} : {}); }
  cell(IX[3], 1090, IX[4] - IX[3], 6 * RH, {k: 'contracts', fl: 'Contracts', multi: 1});
  return {w: 1584, h: 1224, shapes: S, fields: F};
}

export function paintBlank(x, lay) {
  x.fillStyle = '#fff'; x.fillRect(0, 0, lay.w, lay.h); x.textBaseline = 'middle';
  for (const s of lay.shapes) {
    const [a, b, c, d] = s.r;
    if (s.t == 'cell') {
      x.fillStyle = s.fill; x.fillRect(a, b, c - a, d - b); x.strokeStyle = INK; x.lineWidth = 1; x.strokeRect(a + .5, b + .5, c - a - 1, d - b - 1);
      if (s.txt) { x.fillStyle = TXT; x.font = '11.5px Arial'; x.textAlign = 'left'; x.fillText(s.txt, a + 5, (b + d) / 2 + 1, c - a - 8); }
      if (s.hint) { x.fillStyle = '#9aa7ba'; x.font = 'italic 14px Arial'; x.textAlign = 'center'; x.fillText(s.hint, (a + c) / 2, (b + d) / 2); }
      if (s.lab) { x.fillStyle = s.white ? '#fff' : s.red ? '#c00000' : TXT; if (s.big) { x.font = '14px Arial'; x.textAlign = 'center'; x.fillText(s.lab, (a + c) / 2, (b + d) / 2 + 1); } else if (s.white) { x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText(s.lab, (a + c) / 2, (b + d) / 2); } else if (s.inl) { x.font = '11px Arial'; x.textAlign = 'left'; x.fillText(s.lab, a + 4, (b + d) / 2 + 1); } else if (s.fill == LBL) { x.font = '11.5px Arial'; x.textAlign = 'left'; x.fillText(s.lab, a + 4, (b + d) / 2 + 1, c - a - 6); } else { x.font = s.red ? 'bold 10px Arial' : '10px Arial'; x.textAlign = 'left'; x.fillText(s.lab, a + 3, b + 8, c - a - 4); } }
    } else if (s.t == 'bar') {
      x.fillStyle = NAVY; x.fillRect(a, b, c - a, d - b); x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.textAlign = 'center'; x.fillText(s.text, (a + c) / 2, (b + d) / 2 + 1, c - a - 4);
    } else if (s.t == 'txt') {
      x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.textAlign = 'center'; x.fillText(s.text, (a + c) / 2, (b + d) / 2 + 1, c - a - 4);
    }
  }
  x.strokeStyle = NAVY; x.lineWidth = 2; x.strokeRect(25, 7, 755, 1199); x.strokeRect(853, 7, 706, 1199);
}

export const LAYOUT = buildLayout();
// the cell rectangles of the screenshot box (the map screenshot goes here)
export const SHOT = LAYOUT.fields.find(f => f.img).r;
