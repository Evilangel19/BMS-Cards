// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
const COND = { 0: 'SUNNY', 1: 'FAIR', 2: 'POOR', 3: 'INCLEMENT' };
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
  const hasCu = w.cu < 9999,
    agl = Math.max(100, Math.round((w.cu - e) / 100) * 100),
    cl = hasCu && w.dens > 3;
  const cov = w.dens <= 3 ? 'FEW' : w.dens <= 6 ? 'SCT' : w.dens <= 10 ? 'BKN' : 'OVC',
    ty = w.tcu ? (c == 3 ? 'CB' : 'TCU') : '';
  const fog = e < w.fogZ && w.fogEnd < 10;
  let vm = fog ? Math.max(100, Math.round(w.fogEnd * 10) * 100) : 9999,
    wx = '';
  const snow = t <= 0 ? 'SN' : t <= 2 ? 'RASN' : 'RA';
  if (cl && c == 3) wx = w.tcu && t > 2 ? 'TSRA' : snow;
  else if (cl && c == 2 && w.dens > 6) wx = '-' + snow;
  if (wx) {
    const r = /^TS/.test(wx) ? 4000 : /SN/.test(wx) ? (wx[0] == '-' ? 5000 : 3000) : wx[0] == '-' ? 8000 : 6000;
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
  };
}
function atisText(W, d, elev) {
  if (!W || !d) return '';
  const k = wxCore(W, d[1], d[2], elev),
    ms = d[3] || 0,
    s = Math.floor(ms / 1000),
    dd = Math.floor(s / 86400) + 1;
  return `${d[0]} ${p2w(dd)}${p2w(((s % 86400) / 3600) | 0)}${p2w(((s % 3600) / 60) | 0)}Z ${k.wind} ${k.sky} ${mt(k.t)}/${mt(k.dp)} Q${k.q} A${k.a} NOSIG`;
}
function tafText(C, W, f) {
  if (!W || !C || !f) return '';
  const B = [0, 1, 2, 3, 4, 7, 8],
    a = f.wps.find(p => !B.includes(p.act));
  if (!a || !a.arr) return '';
  const H = 3600000,
    hh = ms => {
      const s = Math.floor(ms / 1000);
      return p2w(Math.floor(s / 86400) + 1) + p2w(((s % 86400) / 3600) | 0);
    },
    ms0 = a.arr - 3 * H,
    s0 = Math.floor(ms0 / 1000),
    k = wxCore(W, a.x, a.y, 0),
    tm = `${p2w(Math.floor(s0 / 86400) + 1)}${p2w(((s0 % 86400) / 3600) | 0)}${p2w(((s0 % 3600) / 60) | 0)}Z`;
  let o = `TAF TGT ${tm} ${hh(Math.floor((a.arr - H) / H) * H)}/${hh(Math.ceil((a.arr + 2 * H) / H) * H)} ${k.wind} ${k.sky}`;
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
export { atisText, tafText };
