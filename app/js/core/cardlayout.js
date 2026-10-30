// The MDC format of the card, drawn entirely in code from the measures of the blank MDC (js/data/mdcgeom.js: the cells of the original blank, used with the
// permission of its author, see CREDITS.md). Space 2048 x 2048 = the kneeboard picture of the game; the two pages sit side by side like in the original.
// Every empty cell of the blank is a field that can be written by hand; the cells named below are also filled by the program (see core/mdcfill.js and the
// autofill of the datacard). Nothing of the original is stored as an image.
import GEO from '../data/mdcgeom.js';

const W = 2048;
const FS = 1.48; // point size of the sheet -> pixels of the picture
const HX = 0.93; // the picture of the game is squeezed in width (same as the original): the texts are too
const BW = [0, 2, 3, 5]; // thin, medium, thick border -> line width in pixels

const colOf = a => {
  let n = 0;
  for (const ch of a.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
};
const rowOf = a => +a.match(/\d+$/)[0];
const dark = f => !!f && parseInt(f.slice(1, 3), 16) + parseInt(f.slice(3, 5), 16) + parseInt(f.slice(5, 7), 16) < 330;

export function buildLayout() {
  const shapes = GEO.map(g => ({
    a: g[0],
    r: [g[1], g[2], g[3], g[4]],
    fill: g[5],
    b: [g[6], g[7], g[8], g[9]],
    t: g[10],
    sz: g[11],
    bold: !!g[12],
    it: !!g[13],
    ha: g[14],
    va: g[15],
    wrap: !!g[16],
    rot: g[17],
    col: g[18],
  }));
  const BY = new Map(shapes.map(s => [s.a, s]));
  const F = [],
    used = new Set();
  const cell = a => {
    const s = BY.get(a);
    if (!s) throw new Error('MDC layout: no cell ' + a);
    return s;
  };
  const rect = (a, b) => {
    const p = cell(a).r,
      q = cell(b || a).r;
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
  };
  const field = (a, k, lab, grp, o = {}) => {
    const r = o.r || rect(a, o.to);
    if (o.use !== false) (o.all || [a]).forEach(x => used.add(x));
    F.push({ k, lab, grp, r, multi: o.multi, lt: o.lt, red: o.red, img: o.img });
  };
  const L = (c, r) => {
    // column letters of an index
    let s = '';
    for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s + r;
  };

  // ============================================================== PAGE 1
  const top = [
    ['A3', 'cs', 'Callsign'],
    ['D3', 'step', 'Step'],
    ['F3', 'start', 'Start'],
    ['I3', 'chkin', 'Check in'],
    ['M3', 'taxi', 'Taxi'],
    ['Q3', 'to_time', 'Takeoff'],
    ['V3', 'ld_time', 'Land'],
    ['AA3', 'aux', 'Aux'],
    ['A5', 'pkg', 'MSN #'],
    ['C5', 'su0_0', 'Tanker'],
    ['F5', 'su0_3', 'Track / ARCT'],
    ['K5', 'su0_1', 'Tanker TCN / M3'],
    ['N5', 'tk_alt', 'Tanker ALT'],
    ['P5', 'tk_off', 'Tanker OFF'],
    ['R5', 'tk_jb', 'Tanker J/B'],
    ['W5', 'su0_2', 'Boom freq'],
    ['A7', 'airsp', 'Airspace / TGT'],
    ['A9', 'm1', 'M1 (IFF mode 1)'],
    ['B9', 'm2', 'M2 (IFF mode 2)'],
    ['D9', 'm3', 'M3 (IFF mode 3)'],
    ['F9', 'm4', 'M4 (IFF mode 4)'],
    ['G9', 'd1', 'TOT / VUL'],
  ];
  top.forEach(([a, k, lab]) => field(a, k, lab, 'Mission'));
  field('N7', 'matis', 'ATIS (METAR of the departure airbase)', 'Mission', { multi: 1, lt: 1, r: rect('N6', 'N7') });
  {
    const r = cell('P9').r,
      m = (r[0] + r[2]) / 2;
    field('P9', 'joker', 'Joker', 'Mission', { r: [r[0], r[1], m, r[3]] });
    field('P9', 'bingo', 'Bingo', 'Mission', { r: [m, r[1], r[2], r[3]], red: 1, use: false });
  }
  // audio presets: PRI / FREQ / AGENCY
  ['1 OPS', '2 GND', '3 TWR', '4 DEP/APR', '5 CHKN', '6 C2/TAC', '13 TNKR', '10 ALT A', '11 ALT T', '12 ALT G'].forEach(
    (p, i) => field('X' + (7 + i), `ps${i}`, 'Preset ' + p, 'Audio presets')
  );
  ['W18', 'Y18', 'AA18'].forEach((a, j) => field(a, `nav0_${j}`, 'NAV ' + (j + 1), 'NAV'));
  // pilots (8 rows: the first four are the flight)
  const PC = [
    ['A', 'fl%_0', 'Pilot'],
    ['D', 'fl%_c', 'Callsign'],
    ['F', 'fl%_2', 'TCN'],
    ['G', 'fl%_f', 'FCR'],
    ['J', 'fl%_i', 'ID'],
    ['K', 'fl%_1', 'IDM'],
    ['M', 'fl%_o', 'OWN'],
    ['O', 'fl%_s', 'STN'],
    ['S', 'fl%_5', 'Laser (conf-lsr code)'],
  ];
  for (let r = 0; r < 8; r++)
    PC.forEach(([c, k, lab]) => field(c + (11 + r), k.replace('%', r), `${lab} ${r + 1}`, 'Pilots'));
  // steerpoints (15 rows)
  const SC = [
    ['A', 'fp%_st', 'ST'],
    ['B', 'fp%_0', 'Description'],
    ['E', 'fp%_8', 'Lat'],
    ['G', 'fp%_9', 'Long'],
    ['K', 'fp%_5', 'Elev'],
    ['N', 'fp%_1', 'TOS'],
    ['R', 'fp%_10', 'Time'],
    ['U', 'fp%_3', 'Dist'],
    ['W', 'fp%_2', 'Hdg'],
    ['Y', 'fp%_6', 'Fuel'],
    ['AA', 'fp%_11', 'Cont'],
  ];
  for (let r = 0; r < 15; r++)
    SC.forEach(([c, k, lab]) => field(c + (20 + r), k.replace('%', r), `${lab} ${r + 1}`, 'Steerpoints'));
  // second table: targets / points, two halves
  const HA = [
    ['A', 'ST'],
    ['B', 'Lat'],
    ['D', 'Long'],
    ['F', 'Elev'],
    ['H', 'Description'],
  ];
  const HB = [
    ['M', 'ST'],
    ['N', 'Lat'],
    ['R', 'Long'],
    ['V', 'Elev'],
    ['X', 'Description'],
  ];
  for (let r = 0; r < 3; r++) {
    HA.forEach(([c, lab], j) => field(c + (36 + r), `t${r}_${j}`, `Left ${lab} ${r + 1}`, 'Targets and points'));
    HB.forEach(([c, lab], j) => field(c + (36 + r), `u${r}_${j}`, `Right ${lab} ${r + 1}`, 'Targets and points'));
  }
  // link
  for (let i = 0; i < 2; i++) {
    const y = 40 + i,
      n = 'AB'[i];
    [
      ['B', 'ndl', 'NDL'],
      ['D', 'fc', 'FC'],
      ['E', 'mc', 'MC'],
      ['F', 'sc', 'SC'],
      ['O', 'fl', 'Flight'],
      ['S', 'tm', 'Team'],
      ['W', 'dn', 'Donor'],
      ['Z', 'dn2', 'Donor 2'],
    ].forEach(([c, k, lab]) => field(c + y, `dl${i}_${k}`, `${lab} (${n})`, 'Link'));
  }
  field('V43', 'ovw', 'Overview', 'Overview', {
    to: 'V53',
    multi: 1,
    all: Array.from({ length: 11 }, (_, i) => 'V' + (43 + i)),
  });
  {
    const all = [];
    for (let r = 42; r <= 59; r++) for (let c = 1; c <= 21; c++) all.push(L(c, r));
    const a = cell('A42').r,
      z = cell('A59').r,
      e = cell('U42').r;
    field('A42', 'shot', 'Screenshot', 'Screenshot', { r: [a[0] + 3, a[1] + 3, e[2] - 2, z[3] - 3], img: 1, all });
  }
  field('A61', 'cfg', 'CFG / LMT (loadout)', 'Configuration');
  [
    ['E61', 'gw', 'GW'],
    ['F61', 'drag', 'DI (drag index)'],
    ['G61', 'rot', 'ROT'],
    ['I61', 'tospec', 'TO'],
    ['K61', 'cfg_dist', 'DIST'],
    ['M61', 'ref', 'REF (D/W)'],
    ['P61', 'cfg_ni', 'NRM / IMM'],
    ['T61', 'cfg_nd', 'NRM / IMM DIST D/(W)'],
  ].forEach(([a, k, lab]) => field(a, k, lab, 'Configuration'));
  field('R62', 'srv', 'Server IP', 'Server', { to: 'Y62', all: 'RSTUVWXY'.split('').map(c => c + 62) });

  // ============================================================== PAGE 2
  const RC = [
    ['AD', 'Callsign'],
    ['AG', 'Aircraft'],
    ['AH', 'Hold'],
    ['AJ', 'Alt'],
    ['AL', 'Freq'],
    ['AN', 'Push'],
    ['AP', 'Target'],
    ['AS', 'TOT'],
  ];
  for (let r = 0; r < 10; r++)
    RC.forEach(([c, lab], j) => field(c + (3 + 2 * r), `rc${r}_${j}`, `Roll call ${r + 1} ${lab}`, 'Mission timing'));
  // every other empty cell of the page: a field named after its address, labelled with the nearest heading above it
  const heads = shapes.filter(s => s.t && colOf(s.a) >= 30);
  const grpOf = s => {
    const c = colOf(s.a),
      r = rowOf(s.a);
    if (r < 23) return 'Mission timing';
    if (r < 34) return c < 38 ? 'Known EOB' : 'AO update';
    if (r < 50) return c < 35 ? 'Mission timeline' : c < 39 ? 'Airspace' : 'Mission codewords';
    if (r < 56) return c < 39 ? 'Spins' : 'CSAR data';
    return c < 38 ? 'In-flight report' : 'Contracts';
  };
  // the empty cells of the page: neighbours with no line between them are one cell to write in (the blank has some cut in pieces by its merged cells)
  const cand = shapes
    .filter(s => colOf(s.a) >= 30 && !s.t && !used.has(s.a) && !dark(s.fill) && s.r[2] - s.r[0] >= 8)
    .map(s => ({ a: s.a, r: s.r.slice(), fill: s.fill, b: s.b.slice() }));
  const same = (p, q) => Math.abs(p - q) < 1.5;
  for (let again = true; again;) {
    again = false;
    for (let x = 0; x < cand.length && !again; x++)
      for (let y = 0; y < cand.length && !again; y++) {
        const p = cand[x],
          q = cand[y];
        if (x == y || p.fill != q.fill) continue;
        const hz = same(p.r[1], q.r[1]) && same(p.r[3], q.r[3]) && same(p.r[2], q.r[0]) && !p.b[2] && !q.b[0],
          vt = same(p.r[0], q.r[0]) && same(p.r[2], q.r[2]) && same(p.r[3], q.r[1]) && !p.b[3] && !q.b[1];
        if (!hz && !vt) continue;
        p.r = [Math.min(p.r[0], q.r[0]), Math.min(p.r[1], q.r[1]), Math.max(p.r[2], q.r[2]), Math.max(p.r[3], q.r[3])];
        p.b = hz ? [p.b[0], p.b[1], q.b[2], p.b[3]] : [p.b[0], p.b[1], p.b[2], q.b[3]];
        cand.splice(y, 1);
        again = true;
      }
  }
  cand.forEach(s => {
    const h = heads
      .filter(q => q.r[3] <= s.r[1] + 3 && Math.min(q.r[2], s.r[2]) - Math.max(q.r[0], s.r[0]) > 6)
      .sort((p, q) => q.r[3] - p.r[3])[0];
    const hd = h ? h.t.replace(/\s+/g, ' ').trim() : '';
    field(s.a, 'x' + s.a, `${hd || 'Cell'} ${s.a}`, grpOf(s), { r: s.r, multi: s.r[3] - s.r[1] > 80 ? 1 : 0 });
  });
  return { w: W, h: W, shapes, fields: F };
}

// the text of a cell, in the picture
function paintText(x, s) {
  if (!s.t || s.rot == 255) return;
  const [a, b, c, d] = s.r,
    fs = (s.sz || 10) * FS,
    bg = s.fill && dark(s.fill);
  x.fillStyle = s.col || (bg ? '#fff' : '#000');
  const rot = s.rot == 90,
    w = (rot ? d - b : c - a) - 6,
    h = rot ? c - a : d - b;
  x.save();
  const mid = (a + c) / 2,
    cy = (b + d) / 2;
  if (rot) {
    x.translate(mid, cy);
    x.rotate(-Math.PI / 2);
    x.scale(HX, 1);
  } else x.translate(a + 3, b);
  const font = k => `${s.bold ? 'bold ' : ''}${s.it ? 'italic ' : ''}${k}px Arial`;
  let f = fs;
  const lines = s.t.split('\n');
  const fit = () => {
    x.font = font(f);
    return Math.max(...lines.map(t => x.measureText(t).width));
  };
  const avail = rot ? w : w / HX;
  if (!s.wrap) while (f > 7 && fit() > avail) f -= 0.5;
  x.font = font(f);
  let out = lines;
  if (s.wrap) {
    out = [];
    lines.forEach(t => {
      let cur = '';
      t.split(' ').forEach(wd => {
        const q = cur ? cur + ' ' + wd : wd;
        if (cur && x.measureText(q).width > avail) {
          out.push(cur);
          cur = wd;
        } else cur = q;
      });
      out.push(cur);
    });
  }
  const lh = f * 1.15,
    th = out.length * lh;
  const ha = s.ha || 'left',
    va = s.va || 'bottom';
  x.textBaseline = 'middle';
  out.forEach((t, i) => {
    const y0 = rot ? 0 : va == 'top' ? 2 : va == 'center' ? (h - th) / 2 : h - th - 2;
    const yy = rot ? (i - (out.length - 1) / 2) * lh : y0 + lh * (i + 0.5);
    const tw = x.measureText(t).width;
    let xx;
    if (rot) {
      x.textAlign = 'center';
      xx = 0;
    } else if (ha == 'center' || ha == 'centerContinuous') {
      x.textAlign = 'center';
      xx = (c - a - 6) / (2 * HX);
    } else if (ha == 'right') {
      x.textAlign = 'right';
      xx = (c - a - 6) / HX;
    } else {
      x.textAlign = 'left';
      xx = 0;
    }
    if (!rot) {
      x.save();
      x.scale(HX, 1);
      x.fillText(t, xx, yy);
      x.restore();
    } else x.fillText(t, xx, yy);
    void tw;
  });
  x.restore();
}

export function paintBlank(x, lay) {
  x.fillStyle = '#fff';
  x.fillRect(0, 0, lay.w, lay.h);
  x.textBaseline = 'middle';
  lay.shapes.forEach(s => {
    if (s.fill) {
      x.fillStyle = s.fill;
      x.fillRect(s.r[0], s.r[1], s.r[2] - s.r[0], s.r[3] - s.r[1]);
    }
  });
  lay.shapes.forEach(s => paintText(x, s));
  x.strokeStyle = '#000';
  x.lineCap = 'butt';
  lay.shapes.forEach(s => {
    const [a, b, c, d] = s.r;
    const seg = (i, x1, y1, x2, y2) => {
      if (!s.b[i]) return;
      x.lineWidth = BW[s.b[i]];
      x.beginPath();
      x.moveTo(x1, y1);
      x.lineTo(x2, y2);
      x.stroke();
    };
    seg(0, a, b, a, d);
    seg(1, a, b, c, b);
    seg(2, c, b, c, d);
    seg(3, a, d, c, d);
  });
  // the "/" between Joker and Bingo (one cell of the blank)
  const jb = lay.shapes.find(s => s.a == 'P9');
  if (jb) {
    x.fillStyle = '#000';
    x.font = 'bold 22px Arial';
    x.textAlign = 'center';
    x.fillText('/', (jb.r[0] + jb.r[2]) / 2, (jb.r[1] + jb.r[3]) / 2 + 1);
  }
}

export const LAYOUT = buildLayout();
// the cell rectangle of the screenshot box (the map screenshot goes here)
export const SHOT = LAYOUT.fields.find(f => f.img).r;
