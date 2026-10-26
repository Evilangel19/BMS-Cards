// Falcon BMS weather map (.fmap) reader.
// Layout (checked on real files; the BMS wiki page "fmap" lists the same fields): header of 44 bytes, then ONE ARRAY PER FIELD of X*Y cells (not interleaved):
// condition (int), pressure (mbar), temperature (C), wind speed (kt, 10 layers), wind heading (deg, 10 layers; where the wind comes FROM), cumulus altitude (ft),
// cumulus density (1-13), cumulus size (0-5), tower cumulus (0/1), shower cumulus (0/1), fog end (km, 60 = clear), fog layer altitude (ft).
// Condition: 0 sunny, 1 fair, 2 poor, 3 inclement.
// The 10 wind layers sit at the altitudes of the BMS manual (winds aloft table).
export const WX_ALT = [0, 3000, 6000, 9000, 12000, 18000, 24000, 30000, 40000, 50000];
export const WX_COND = ['Sunny', 'Fair', 'Poor', 'Inclement'];
// the wind layer nearest to an altitude in feet (a tie goes to the higher layer)
export const wxLevel = alt => {
  let b = 0;
  WX_ALT.forEach((a, i) => {
    if (Math.abs(a - alt) <= Math.abs(WX_ALT[b] - alt)) b = i;
  });
  return b;
};

export function parseFmap(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength),
    X = dv.getInt32(4, true),
    Y = dv.getInt32(8, true),
    N = X * Y,
    H = 44;
  // number of 4-byte arrays after the winds: 7 (version 8, Korea) or 5 (version 5, Balkans: no shower cumulus and no fog layer altitude)
  const T = Math.round((dv.byteLength - H - (12 + 80) * N) / (4 * N)),
    old = T === 5;
  if (dv.getInt32(0, true) < 4 || (T !== 7 && T !== 5) || N <= 0) throw new Error('unrecognized .fmap format');
  const f = o => dv.getFloat32(o, true),
    i32 = o => dv.getInt32(o, true),
    S0 = H + 12 * N,
    S1 = S0 + 40 * N,
    R = S1 + 40 * N,
    cs = 57344 / 3280.84,
    hdr = {
      wind: { hdg: i32(12), spd: f(16) },
      stratus: { fair: i32(20), inclement: i32(24) },
      contrail: [i32(28), i32(32), i32(36), i32(40)],
    },
    idx = (i, j) => (Y - 1 - j) * X + i,
    // one cell by its index in the file; lv = wind layer (0..9)
    at0 = (c, lv = 0) => ({
      cond: i32(H + 4 * c),
      p: f(H + 4 * N + 4 * c),
      t: f(H + 8 * N + 4 * c),
      spd: f(S0 + 40 * c + 4 * lv),
      hdg: f(S1 + 40 * c + 4 * lv),
      cu: f(R + 4 * c),
      dens: i32(R + 4 * N + 4 * c),
      size: f(R + 8 * N + 4 * c),
      tcu: i32(R + 12 * N + 4 * c),
      shower: old ? 0 : i32(R + 16 * N + 4 * c),
      fogEnd: f(R + (old ? 16 : 20) * N + 4 * c),
      fogZ: old ? 0 : f(R + 24 * N + 4 * c),
    }),
    cellOf = (x, y) =>
      idx(Math.max(0, Math.min(X - 1, Math.floor(x / cs))), Math.max(0, Math.min(Y - 1, Math.floor(y / cs))));
  return {
    raw: u8,
    X,
    Y,
    cs,
    hdr,
    tail: T,
    // cell(i,j,lv): i east, j north (0 = south row)
    cell(i, j, lv = 0) {
      return at0(idx(i, j), lv);
    },
    // at(x,y,lv): the cell at a position in km (east, north)
    at(x, y, lv = 0) {
      return at0(cellOf(x, y), lv);
    },
    // the wind at a position and altitude (ft): the layer nearest to the altitude. hdg is where the wind comes from.
    wind(x, y, alt) {
      const lv = wxLevel(alt),
        c = cellOf(x, y);
      return { lv, alt: WX_ALT[lv], spd: f(S0 + 40 * c + 4 * lv), hdg: f(S1 + 40 * c + 4 * lv) };
    },
    // all 10 layers at a position
    profile(x, y) {
      const c = cellOf(x, y);
      return WX_ALT.map((alt, lv) => ({ lv, alt, spd: f(S0 + 40 * c + 4 * lv), hdg: f(S1 + 40 * c + 4 * lv) }));
    },
  };
}
