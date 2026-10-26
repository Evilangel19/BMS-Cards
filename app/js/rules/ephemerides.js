// @ts-check
// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import { tmInv } from './geo.js';
let BASE = null;
const setBase = s => {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || '');
  BASE = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};
function ephem(C, f) {
  if (BASE === null || !C || !f) return '';
  const B = [0, 1, 2, 3, 4, 7, 8],
    w = f.wps,
    a = w.find(p => !B.includes(p.act)) || w.find(p => p.arr) || w[0];
  if (!a) return '';
  const tg = w.find(p => !B.includes(p.act) && p.arr) || w.find(p => p.arr),
    DAY = 864e5,
    t0 = BASE + Math.floor(((tg || a).arr || 0) / DAY) * DAY,
    ll = tmInv((a.x - 512) * 1000, (a.y - 512) * 1000),
    lat = ll[0],
    lon = ll[1],
    R = Math.PI / 180,
    rv = x => ((x % 360) + 360) % 360;
  const sunP = d => {
    const w = 282.9404 + 4.70935e-5 * d,
      e = 0.016709 - 1.151e-9 * d,
      M = rv(356.047 + 0.9856002585 * d),
      ob = 23.4393 - 3.563e-7 * d;
    let E = M + (e / R) * Math.sin(M * R) * (1 + e * Math.cos(M * R));
    const x = Math.cos(E * R) - e,
      y = Math.sin(E * R) * Math.sqrt(1 - e * e),
      v = Math.atan2(y, x) / R,
      r = Math.hypot(x, y),
      lo = (v + w) * R,
      xs = r * Math.cos(lo),
      ys = r * Math.sin(lo);
    return {
      ra: Math.atan2(ys * Math.cos(ob * R), xs),
      dec: Math.atan2(ys * Math.sin(ob * R), Math.hypot(xs, ys * Math.cos(ob * R))),
      lon: rv(v + w),
    };
  };
  const moonP = d => {
    const N = rv(125.1228 - 0.0529538083 * d),
      i = 5.1454,
      w = rv(318.0634 + 0.1643573223 * d),
      e = 0.0549,
      M = rv(115.3654 + 13.0649929509 * d),
      Ms = rv(356.047 + 0.9856002585 * d),
      ws = 282.9404 + 4.70935e-5 * d,
      ob = 23.4393 - 3.563e-7 * d;
    let E = M + (e / R) * Math.sin(M * R) * (1 + e * Math.cos(M * R));
    for (let k = 0; k < 5; k++) E = E - (E - (e / R) * Math.sin(E * R) - M) / (1 - e * Math.cos(E * R));
    const xv = 60.2666 * (Math.cos(E * R) - e),
      yv = 60.2666 * Math.sqrt(1 - e * e) * Math.sin(E * R),
      v = Math.atan2(yv, xv) / R,
      r = Math.hypot(xv, yv),
      vw = (v + w) * R,
      Nr = N * R,
      ir = i * R;
    const xh = r * (Math.cos(Nr) * Math.cos(vw) - Math.sin(Nr) * Math.sin(vw) * Math.cos(ir)),
      yh = r * (Math.sin(Nr) * Math.cos(vw) + Math.cos(Nr) * Math.sin(vw) * Math.cos(ir)),
      zh = r * Math.sin(vw) * Math.sin(ir);
    let lo = Math.atan2(yh, xh) / R,
      la = Math.atan2(zh, Math.hypot(xh, yh)) / R,
      rr = r;
    const Ls = Ms + ws,
      Lm = M + w + N,
      D = Lm - Ls,
      F = Lm - N,
      s = x => Math.sin(x * R),
      c = x => Math.cos(x * R);
    lo +=
      -1.274 * s(M - 2 * D) +
      0.658 * s(2 * D) -
      0.186 * s(Ms) -
      0.059 * s(2 * M - 2 * D) -
      0.057 * s(M - 2 * D + Ms) +
      0.053 * s(M + 2 * D) +
      0.046 * s(2 * D - Ms) +
      0.041 * s(M - Ms) -
      0.035 * s(D) -
      0.031 * s(M + Ms) -
      0.015 * s(2 * F - 2 * D) +
      0.011 * s(M - 4 * D);
    la +=
      -0.173 * s(F - 2 * D) -
      0.055 * s(M - F - 2 * D) -
      0.046 * s(M + F - 2 * D) +
      0.033 * s(F + 2 * D) +
      0.017 * s(2 * M + F);
    rr += -0.58 * c(M - 2 * D) - 0.46 * c(2 * D);
    const xg = rr * c(lo) * c(la),
      yg = rr * s(lo) * c(la),
      zg = rr * s(la),
      ye = yg * c(ob) - zg * s(ob),
      ze = yg * s(ob) + zg * c(ob);
    return { ra: Math.atan2(ye, xg), dec: Math.atan2(ze, Math.hypot(xg, ye)), lon: rv(lo), lat: la };
  };
  const alt = (t, k) => {
    const jd = t / DAY + 2440587.5,
      d = jd - 2451543.5,
      p = k ? moonP(d) : sunP(d),
      gm = rv(280.46061837 + 360.98564736629 * (jd - 2451545)),
      H = (gm + lon) * R - p.ra;
    return (
      Math.asin(Math.sin(lat * R) * Math.sin(p.dec) + Math.cos(lat * R) * Math.cos(p.dec) * Math.cos(H)) / R -
      (k ? 0.125 : -0.833)
    );
  };
  const ev = k => {
    let up = null,
      dn = null,
      pv = alt(t0, k);
    for (let m = 5; m <= 1440; m += 5) {
      const t = t0 + m * 60000,
        v = alt(t, k);
      if (pv < 0 != v < 0) {
        let lo = t - 300000,
          hi = t;
        for (let q = 0; q < 12; q++) {
          const mid = (lo + hi) / 2;
          if (alt(mid, k) < 0 == pv < 0) lo = mid;
          else hi = mid;
        }
        const tt = Math.round(hi / 60000) * 60000;
        if (v >= 0) {
          if (up === null) up = tt;
        } else if (dn === null) dn = tt;
      }
      pv = v;
    }
    return [up, dn];
  };
  const hz = t => (t === null ? '--' : new Date(t).toISOString().slice(11, 16) + 'Z'),
    [sr, ss] = ev(0),
    [mr, ms] = ev(1),
    dm = moonP(t0 / DAY + 2440587.5 + 0.5 - 2451543.5),
    ds = sunP(t0 / DAY + 2440587.5 + 0.5 - 2451543.5),
    el = Math.acos(Math.max(-1, Math.min(1, Math.cos((dm.lon - ds.lon) * R) * Math.cos(dm.lat * R)))) / R,
    ill = Math.round(50 * (1 - Math.cos(el * R))),
    dt = new Date(t0),
    dd = String(dt.getUTCDate()).padStart(2, '0') + '/' + String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `Sun ${dd}: rise ${hz(sr)} set ${hz(ss)}\nMoon: rise ${hz(mr)} set ${hz(ms)} (${ill}%)`;
}
export { setBase, ephem };
