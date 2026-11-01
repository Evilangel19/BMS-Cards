// Runway sizes from the objective files of an airbase: ObjectiveRelatedData/OCD_nnnnn/PHD_nnnnn.XML (point headers: Type 8 = runway, RunwayNumber = the
// "Database Runway Number" of the ATC file, FirstPtIdx / PointCount) and PDX_nnnnn.XML (the points: OffsetX east, OffsetY north, in ft from the centre of the
// objective; the Type 8 points are the four corners of the runway rectangle). Checked on Osan: 9,004 x 149 ft (real: 9,000 x 150).
const tag = (s, t) => {
  const m = s.match(new RegExp('<' + t + '>([^<]*)</' + t + '>'));
  return m ? m[1].trim() : '';
};

// -> [{ id, len, wid, hdg }] one per runway rectangle (len and wid in ft, hdg = direction of the long side 0-180)
export function parseRunways(phdXml, pdxXml) {
  const pts = [...pdxXml.matchAll(/<PD Num="(\d+)">([\s\S]*?)<\/PD>/g)].map(m => ({
    e: +tag(m[2], 'OffsetX'),
    n: +tag(m[2], 'OffsetY'),
    t: +tag(m[2], 'Type'),
  }));
  const out = [];
  for (const m of phdXml.matchAll(/<PHD Num="(\d+)">([\s\S]*?)<\/PHD>/g)) {
    if (+tag(m[2], 'Type') !== 8) continue;
    const first = +tag(m[2], 'FirstPtIdx'),
      count = +tag(m[2], 'PointCount'),
      c = pts.slice(first, first + count).filter(p => p.t === 8);
    if (c.length !== 4) continue;
    // a rectangle: of the 6 distances between its corners the 2 smallest are the width, the next 2 the length, the last 2 the diagonals (so the order of the corners does not matter)
    const d = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) d.push({ v: Math.hypot(c[i].e - c[j].e, c[i].n - c[j].n), i, j });
    d.sort((a, b) => a.v - b.v);
    const wid = (d[0].v + d[1].v) / 2,
      len = (d[2].v + d[3].v) / 2;
    if (!(len > 500) || !(wid > 10) || wid > len) continue;
    const L = d[2],
      hdg = ((Math.atan2(c[L.j].e - c[L.i].e, c[L.j].n - c[L.i].n) * 180) / Math.PI + 360) % 180;
    out.push({ id: +tag(m[2], 'RunwayNumber'), len, wid, hdg });
  }
  return out;
}

// The order of the ILS of the Stations table (ILS 1..4 = runway 1 end 1, runway 1 end 2, runway 2 end 1, runway 2 end 2) for an airbase with no ATC file, from its objective files.
// What the Israel theater shows (checked on five airbases against the navaids list of the theater): the landing paths (header Type 1) come in pairs, one pair for each runway; inside a
// pair the ends are listed in the opposite order of the header file; two parallel runways are listed north one first, otherwise in the order of the file.
// -> [{ n: end number (1-36), rw: RunwayNumber }]
export function ilsOrder(phdXml, pdxXml) {
  const pts = [...pdxXml.matchAll(/<PD Num="(\d+)">([\s\S]*?)<\/PD>/g)].map(m => ({
    e: +tag(m[2], 'OffsetX'),
    n: +tag(m[2], 'OffsetY'),
    t: +tag(m[2], 'Type'),
  }));
  const H = [...phdXml.matchAll(/<PHD Num="(\d+)">([\s\S]*?)<\/PHD>/g)].map(m => ({
    t: +tag(m[2], 'Type'),
    rw: +tag(m[2], 'RunwayNumber'),
    dir: +tag(m[2], 'Data'),
    first: +tag(m[2], 'FirstPtIdx'),
    count: +tag(m[2], 'PointCount'),
  }));
  const groups = [];
  for (const h of H) {
    if (h.t !== 1) continue;
    let g = groups.find(x => x.rw === h.rw);
    if (!g) groups.push((g = { rw: h.rw, ends: [], north: 0, dir: h.dir }));
    g.ends.push(Math.round(h.dir / 10 + 0.01) % 36 || 36);
  }
  for (const g of groups) {
    const r = H.find(h => h.t === 8 && h.rw === g.rw),
      c = r ? pts.slice(r.first, r.first + r.count).filter(p => p.t === 8) : [];
    g.north = c.length ? c.reduce((a, p) => a + p.n, 0) / c.length : 0;
    g.ends.reverse();
  }
  const par = (a, b) => Math.abs(((((a.dir - b.dir) % 180) + 270) % 180) - 90) < 10;
  const out = [];
  groups.forEach((g, i) => {
    // a runway goes after the ones that come before it in the file, except where it is parallel to one that is more to the north
    let at = out.length;
    while (at > 0 && par(out[at - 1], g) && g.north > out[at - 1].north) at--;
    out.splice(at, 0, g);
  });
  return out.flatMap(g => g.ends.map(n => ({ n, rw: g.rw })));
}

// What a pair of files holds, for the message shown when no runway size could be read: "N runway header(s), corner points 4,4"
export function describeRunways(phdXml, pdxXml) {
  const pts = [...pdxXml.matchAll(/<PD Num="(\d+)">([\s\S]*?)<\/PD>/g)].map(m => ({ t: +tag(m[2], 'Type') })),
    hs = [];
  for (const m of phdXml.matchAll(/<PHD Num="(\d+)">([\s\S]*?)<\/PHD>/g))
    if (+tag(m[2], 'Type') === 8) {
      const f = +tag(m[2], 'FirstPtIdx'),
        c = +tag(m[2], 'PointCount');
      hs.push(pts.slice(f, f + c).filter(p => p.t === 8).length + '/' + c);
    }
  return (
    `${pts.length} points, ${hs.length} runway header(s)` + (hs.length ? ' with corner points ' + hs.join(',') : '')
  );
}

// atc: [parseAtc results with ends {qfu, hdg, id}]; rwl: { campId: [parseRunways result] }
// -> { campId: { ends: { '09': { ft, w } }, max: { ft, w } } }: the size of the runway of each end number (parallel runways share numbers: the first listed wins) and the longest runway of the base
export function runwayLengths(atc, rwl) {
  const out = {};
  for (const a of atc || []) {
    const list = (rwl || {})[a.campId];
    if (!list || !list.length) continue;
    const ends = {};
    for (const e of a.ends) {
      const r = list.find(x => x.id === e.id);
      if (r && !ends[e.qfu]) ends[e.qfu] = { ft: Math.round(r.len), w: Math.round(r.wid) };
    }
    const big = list.reduce((b, r) => (r.len > b.len ? r : b), list[0]);
    out[a.campId] = { ends, max: { ft: Math.round(big.len), w: Math.round(big.wid) } };
  }
  return out;
}
