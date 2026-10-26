// @ts-check
// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
const hmN = ms => {
  const s = Math.floor(ms / 1000) % 86400,
    q = n => String(n).padStart(2, '0');
  return q((s / 3600) | 0) + ':' + q(((s % 3600) / 60) | 0);
};
// Centre of the theater (the middle of its 1024 km square is campaign km 512,512): Korea unless a theater says otherwise (Theater.txt).
const GEO = { lat: 38.5, lon: 127.5 };
const setGeo = (lat, lon) => {
  if (isFinite(lat) && isFinite(lon)) {
    GEO.lat = lat;
    GEO.lon = lon;
  } else {
    GEO.lat = 38.5;
    GEO.lon = 127.5;
  }
};
const getGeo = () => ({ lat: GEO.lat, lon: GEO.lon });
const tmInv = (E, N) => {
  const a = 6378137,
    fl = 1 / 298.257223563,
    e2 = fl * (2 - fl),
    e4 = e2 * e2,
    e6 = e4 * e2,
    ep2 = e2 / (1 - e2),
    k0 = 0.9996,
    lon0 = GEO.lon,
    lat0 = GEO.lat,
    R = Math.PI / 180;
  const arc = p =>
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * p -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * p) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * p) -
      ((35 * e6) / 3072) * Math.sin(6 * p));
  const M = arc(lat0 * R) + N / k0,
    mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256)),
    rt = Math.sqrt(1 - e2),
    e1 = (1 - rt) / (1 + rt);
  const fp =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(fp),
    c = Math.cos(fp),
    t = Math.tan(fp),
    den = 1 - e2 * s * s,
    Rn = a / Math.sqrt(den),
    Rm = (a * (1 - e2)) / Math.pow(den, 1.5),
    T = t * t,
    C1 = ep2 * c * c,
    D = E / (Rn * k0);
  const lat =
    fp -
    ((Rn * t) / Rm) *
      ((D * D) / 2 -
        ((5 + 3 * T + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T + 298 * C1 + 45 * T * T - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720);
  const lon =
    lon0 * R +
    (D -
      ((1 + 2 * T + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T - 3 * C1 * C1 + 8 * ep2 + 24 * T * T) * Math.pow(D, 5)) / 120) /
      c;
  return [lat / R, lon / R];
};
const geoLL = (C, gx, gy) => {
  const ll = tmInv((gx - 512) * 1000, (gy - 512) * 1000);
  const f = (v, pz, ng, w) => {
    const s = v >= 0 ? pz : ng;
    v = Math.abs(v);
    let d = Math.floor(v),
      m = (v - d) * 60;
    if (m >= 59.9995) {
      d++;
      m = 0;
    }
    return s + ' ' + String(d).padStart(w, '0') + '° ' + m.toFixed(3).padStart(6, '0') + "'";
  };
  return f(ll[0], 'N', 'S', 2) + '  ' + f(ll[1], 'E', 'W', 3);
};
const locXY = (C, x, y) => {
  if (!C.bull) return '';
  const n = y - C.bull.y,
    e = x - C.bull.x;
  return (
    String(Math.round(((Math.atan2(e, n) * 180) / Math.PI + 360) % 360) % 360).padStart(3, '0') +
    '/' +
    Math.round(Math.hypot(n, e) / 1.852)
  );
};
// forward transverse Mercator (same ellipsoid / origin as tmInv): lat, lon (deg) -> [E, N] metres from the theater centre
const tmFwd = (lat, lon) => {
  const a = 6378137,
    fl = 1 / 298.257223563,
    e2 = fl * (2 - fl),
    e4 = e2 * e2,
    e6 = e4 * e2,
    ep2 = e2 / (1 - e2),
    k0 = 0.9996,
    R = Math.PI / 180;
  const arc = p =>
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * p -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * p) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * p) -
      ((35 * e6) / 3072) * Math.sin(6 * p));
  const p = lat * R,
    s = Math.sin(p),
    c = Math.cos(p),
    t = Math.tan(p),
    N = a / Math.sqrt(1 - e2 * s * s),
    T = t * t,
    C1 = ep2 * c * c,
    A = (lon - GEO.lon) * R * c,
    M = arc(p),
    M0 = arc(GEO.lat * R);
  const E = k0 * N * (A + ((1 - T + C1) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C1 - 58 * ep2) * A ** 5) / 120);
  const Nn =
    k0 *
    (M -
      M0 +
      N *
        t *
        ((A * A) / 2 +
          ((5 - T + 9 * C1 + 4 * C1 * C1) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C1 - 330 * ep2) * A ** 6) / 720));
  return [E, Nn];
};
export { setGeo, getGeo, hmN, tmInv, tmFwd, geoLL, locXY };
