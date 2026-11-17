// @ts-check
// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
// The clouds of a weather map (BMS 4.38.2, and the maps of F4Wx, whose source tells the fields): every cell has a cumulus base (1 200 - 22 000 ft), even
// a cell without clouds (BMS wants one): the clouds are told by the condition and the density, not by the base. Sunny: no clouds (the briefing of BMS
// writes a cloud base of 35 000 ft). Density 1-13: the cover (1 FEW .. 13 OVC; linear with "For Volumetric Cloud", else 1/5/9/13), read in eighths.
// The base 10 000 ft exactly was "no cloud" in the maps of 4.38.1 and before. Shower cumulus (towering cumulus with heavy rain): SH.
import { dayOfMonth } from './ephemerides.js';
const p2w = n => String(n).padStart(2, '0'),
  mt = t => (t < 0 ? 'M' : '') + p2w(Math.abs(t));
function wxCore(W, x, y, elev) {
  const w = W.at(x, y),
    e = +elev || 0,
    sp = Math.round(w.spd),
    t = Math.round(w.t),
    c = w.cond;
  const dr = String((Math.round(w.hdg / 10) * 10) % 360 || 360).padStart(3, '0'),
    gu = (sp >= 12 && c >= 2) || sp >= 25 ? Math.max(sp + 10, Math.round(sp * 1.4)) : 0;
  const wind = sp < 1 ? '00000KT' : sp < 3 ? 'VRB' + p2w(sp) + 'KT' : dr + p2w(sp) + (gu ? 'G' + p2w(gu) : '') + 'KT';
  const hasCu = c > 0 && w.cu > 0 && w.cu < 30000 && w.cu !== 10000 && w.dens > 0,
    agl = Math.max(100, Math.round((w.cu - e) / 100) * 100),
    cl = hasCu && w.dens > 4;
  const cov = w.dens <= 4 ? 'FEW' : w.dens <= 7 ? 'SCT' : w.dens <= 11 ? 'BKN' : 'OVC',
    ty = w.tcu ? (c == 3 ? 'CB' : 'TCU') : '';
  const fog = e < w.fogZ && w.fogEnd < 10;
  let vm = fog ? Math.max(100, Math.round(w.fogEnd * 10) * 100) : 9999,
    wx = '';
  const snow = (w.shower ? 'SH' : '') + (t <= 0 ? 'SN' : t <= 2 ? 'RASN' : 'RA');
  if (cl && c == 3) wx = w.tcu && t > 2 ? 'TSRA' : snow;
  else if (cl && c == 2 && w.dens > 7) wx = '-' + snow;
  if (wx) {
    const r = /^TS/.test(wx) ? 4000 : /SN$/.test(wx) ? (wx[0] == '-' ? 5000 : 3000) : wx[0] == '-' ? 8000 : 6000;
    vm = Math.min(vm, r);
  }
  if (!wx && vm < 5000) wx = vm < 1000 ? 'FG' : 'BR';
  const vis =
    vm >= 9999
      ? '9999'
      : String(vm < 5000 ? Math.round(vm / 100) * 100 : Math.round(vm / 1000) * 1000).padStart(4, '0');
  const cloud = hasCu ? cov + String(agl / 100).padStart(3, '0') + ty : 'NSC';
  const cavok = vm >= 9999 && !wx && (!hasCu || agl >= 5000) && !ty;
  const spread = fog || wx == 'FG' || wx == 'BR' ? 1 : [9, 6, 3, 1][c] || 6,
    dp = t - spread,
    sky = cavok ? 'CAVOK' : vis + (wx ? ' ' + wx : '') + ' ' + cloud;
  return {
    wind,
    wx,
    vm,
    hasCu,
    agl,
    cov,
    ty,
    cavok,
    sky,
    t,
    dp,
    q: Math.round(w.p),
    a: Math.round(w.p * 2.953),
    c,
    sp,
    gu,
    dr,
    ceil: hasCu && cov !== 'FEW' ? agl : 99999,
  };
}
function atisText(W, d, elev) {
  if (!W || !d) return '';
  const k = wxCore(W, d[1], d[2], elev),
    ms = d[3] || 0,
    s = Math.floor(ms / 1000),
    dd = dayOfMonth(ms); // the day of the month of the mission date (D1 on the Datacard)
  return `${d[0]} ${p2w(dd)}${p2w(((s % 86400) / 3600) | 0)}${p2w(((s % 3600) / 60) | 0)}Z ${k.wind} ${k.sky} ${mt(k.t)}/${mt(k.dp)} Q${k.q} A${k.a} NOSIG`;
}
// the band of a report (the colour code: ceiling and visibility), its weather and wind, to tell a change worth a TAF group
const band = k => {
  const i = COL.findIndex(x => k.ceil >= x[1] && k.vm >= x[2]);
  return i < 0 ? COL.length : i;
};
const bigChange = (a, b) => {
  if (band(a) !== band(b) || (a.wx || '') !== (b.wx || '') || (a.cavok !== b.cavok && band(a) < 2)) return true;
  const dd = Math.abs(((((+b.dr - +a.dr) % 360) + 540) % 360) - 180);
  return (
    Math.abs(b.sp - a.sp) >= 10 ||
    (dd >= 60 && Math.max(a.sp, b.sp) >= 10) ||
    (!!a.gu !== !!b.gu && Math.max(a.sp, b.sp) >= 15)
  );
};
// the elements that changed (a TEMPO group gives only those)
const changed = (a, b) => {
  const o = [];
  if (
    a.wind !== b.wind &&
    (Math.abs(b.sp - a.sp) >= 10 || !!a.gu !== !!b.gu || Math.abs(((((+b.dr - +a.dr) % 360) + 540) % 360) - 180) >= 60)
  )
    o.push(b.wind);
  if (a.sky !== b.sky) o.push(b.cavok ? 'CAVOK' : b.sky + (a.wx && !b.wx ? ' NSW' : ''));
  return o.join(' ');
};
// site {id, x, y, arr, elev}: the forecast of an airbase (the landing one) instead of the target.
// getW(ms): the weather map of a time (the hourly maps of the campaign). With it the forecast is the weather the game will have: the conditions at the
// start of the forecast, then FM (a lasting change, from the hour the next map comes) or TEMPO (one hour only, then as before), at most three groups.
// Without it: the map given, and a TEMPO made from its own conditions (poor weather).
function tafText(C, W, f, site, getW) {
  if (!W || !C || !f) return '';
  const B = [0, 1, 2, 3, 4, 7, 8],
    a = site || f.wps.find(p => !B.includes(p.act));
  if (!a || !a.arr) return '';
  const H = 3600000,
    hh = ms => {
      const s = Math.floor(ms / 1000);
      return p2w(dayOfMonth(ms)) + p2w(((s % 86400) / 3600) | 0);
    },
    ms0 = a.arr - 3 * H,
    s0 = Math.floor(ms0 / 1000),
    k = wxCore(W, a.x, a.y, (site && site.elev) || 0),
    tm = `${p2w(dayOfMonth(ms0))}${p2w(((s0 % 86400) / 3600) | 0)}${p2w(((s0 % 3600) / 60) | 0)}Z`;
  const t0 = Math.floor((a.arr - H) / H) * H,
    t1 = Math.ceil((a.arr + 2 * H) / H) * H,
    el = (site && site.elev) || 0,
    kAt = t => {
      const w = getW && getW(t);
      return w ? wxCore(w, a.x, a.y, el) : null;
    };
  /** @type {[number, any][]} */
  const S = [];
  if (getW) for (let t = t0; t < t1; t += H) S.push([t, kAt(t)]);
  if (S.length && S.every(x => x[1])) {
    const p2 = n => String(n).padStart(2, '0'),
      fm = ms => {
        const s = Math.floor(ms / 1000);
        return 'FM' + p2(dayOfMonth(ms)) + p2(((s % 86400) / 3600) | 0) + '00';
      };
    let cur = S[0][1],
      o = `TAF ${site ? site.id : 'TGT'} ${tm} ${hh(t0)}/${hh(t1)} ${cur.wind} ${cur.sky}`,
      n = 0;
    for (let i = 1; i < S.length && n < 3; i++) {
      const [t, k2] = S[i];
      if (!bigChange(cur, k2)) continue;
      const nx = S[i + 1] && S[i + 1][1];
      if (nx && !bigChange(cur, nx)) {
        // one hour, then as before
        const g = changed(cur, k2);
        if (g) {
          o += ` TEMPO ${hh(t)}/${hh(t + H)} ${g}`;
          n++;
        }
        i++;
        continue;
      }
      o += ` ${fm(t)} ${k2.wind} ${k2.sky}`;
      cur = k2;
      n++;
    }
    return o;
  }
  let o = `TAF ${site ? site.id : 'TGT'} ${tm} ${hh(t0)}/${hh(t1)} ${k.wind} ${k.sky}`;
  if (k.c >= 2) {
    const w = k.wx ? (/^[-+]/.test(k.wx) ? '+' + k.wx.slice(1) : k.wx) : 'BR',
      v = Math.max(500, Math.round((Math.min(k.vm, 8000) * 0.5) / 100) * 100),
      ag = Math.max(200, Math.round((k.agl * 0.6) / 100) * 100),
      cb =
        k.c == 3 && k.hasCu ? (k.cov == 'OVC' ? 'OVC' : 'BKN') + String(ag / 100).padStart(3, '0') + (k.ty || '') : '';
    o += ` TEMPO ${hh(Math.floor((a.arr - H) / H) * H)}/${hh(Math.ceil((a.arr + H) / H) * H)} ${String(v).padStart(4, '0')} ${w}${cb ? ' ' + cb : ''}`;
  }
  return o;
}
// NATO colour state of an airfield (military aerodromes): the base of the lowest cloud of 3/8 or more (SCT, BKN, OVC: FEW does not count) and the
// visibility; BLU best .. RED worst (YLO1 and YLO2 are one YLO here)
/** @type {[string, number, number][]} */
const COL = [
  ['BLU', 2500, 8000],
  ['WHT', 1500, 5000],
  ['GRN', 700, 3700],
  ['YLO', 300, 1600],
  ['AMB', 200, 800],
];
function wxColour(W, d, elev) {
  if (!W || !d) return '';
  const k = wxCore(W, d[1], d[2], elev),
    ceil = k.hasCu && k.cov !== 'FEW' ? k.agl : 99999;
  const hit = COL.find(x => ceil >= +x[1] && k.vm >= +x[2]);
  return hit ? String(hit[0]) : 'RED';
}
export { atisText, tafText, wxColour };
