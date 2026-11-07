// Terrain height reader: format checks on a small synthetic .raw file (the real ones are about 2 GB).
import {
  parseTheaterValues,
  heightSpec,
  heightOffset,
  heightAt,
  heightsAt,
  createRowCache,
  FT_M,
} from '../app/js/bmsdata/heightmap.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const v = parseTheaterValues('Theater size in km = 1024\r\nmap size in pixels = 8\r\n// x\r\nname = Korea');
ck('Theater.txt values', v['theater size in km'] === '1024' && v['map size in pixels'] === '8' && v.name === 'Korea');
const spec = heightSpec(v, 8 * 8 * 2);
ck('spec: side and size in feet', spec.side === 8 && Math.abs(spec.sizeFt - 1024000 / FT_M) < 1e-6);
ck(
  'side falls back to sqrt(file size / 2), then to 32768',
  heightSpec({ 'theater size in km': '10' }, 16 * 16 * 2).side === 16 &&
    heightSpec({ 'theater size in km': '10' }, 1000).side === 32768 &&
    heightSpec({}, 100) === null &&
    heightSpec({}, 100, 5).sizeFt > 0
);
// sample (x, y) = 100 * y + x - 300 feet, row 0 = north edge
const buf = new Uint8Array(8 * 8 * 2),
  dv = new DataView(buf.buffer);
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dv.setInt16((y * 8 + x) * 2, 100 * y + x - 300, true);
const readAt = async (off, len) => buf.slice(off, off + len);
const S = spec.sizeFt;
ck(
  'north-west corner is the first sample, south-east the last',
  heightOffset(spec, S, 0) === 0 && heightOffset(spec, 0, S) === (7 * 8 + 7) * 2
);
ck(
  'out of the theater gives nothing',
  heightOffset(spec, -1, 10) === null &&
    heightOffset(spec, 10, S + 1) === null &&
    (await heightAt(readAt, spec, -5, 0)) === null
);
ck(
  'values: north-west -300 (negative = below sea level), south-east 407, a middle point',
  (await heightAt(readAt, spec, S, 0)) === -300 &&
    (await heightAt(readAt, spec, 0, S)) === 407 &&
    (await heightAt(readAt, spec, S * 0.5, S * 0.5)) === 100 * 3 + 3 - 300
);
ck(
  'several points',
  JSON.stringify(
    await heightsAt(readAt, spec, [
      { n: S, e: 0 },
      { n: -1, e: 0 },
      { n: 0, e: S },
    ])
  ) === '[-300,null,407]'
);
{
  // a grid of points: the same values as one by one, with one read per row of the file
  const pts = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) pts.push({ n: (j / 7) * S, e: (i / 7) * S });
  let calls = 0;
  const cnt = async (o, l) => {
    calls++;
    return readAt(o, l);
  };
  const many = await heightsAt(cnt, spec, pts),
    each = [];
  for (const q of pts) each.push(await heightAt(readAt, spec, q.n, q.e));
  ck('batch reading gives the same values', JSON.stringify(many) === JSON.stringify(each));
  ck('one read per row of the grid (at most 8 reads for 64 points)', calls <= 8);
  ck(
    'a short answer falls back to single reads',
    JSON.stringify(await heightsAt(async (o, l) => (l > 2 ? new Uint8Array(1) : readAt(o, l)), spec, pts)) ===
      JSON.stringify(each)
  );
}
{
  // a cache of rows: whole rows are read once and kept, several rows are read in one go
  const pts = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) pts.push({ n: (j / 7) * S, e: (i / 7) * S });
  const each = [];
  for (const q of pts) each.push(await heightAt(readAt, spec, q.n, q.e));
  const rowOf = q => Math.floor(heightOffset(spec, q.n, q.e) / 16),
    nRows = new Set(pts.map(rowOf)).size; // (floating point: the grid above lands on 7 of the 8 rows)
  const log = [],
    spy = async (o, l) => {
      log.push([o, l]);
      return readAt(o, l);
    };
  const rows = createRowCache();
  const a = await heightsAt(spy, spec, pts, { rows });
  ck('row cache: same values as one by one', JSON.stringify(a) === JSON.stringify(each));
  ck(
    'row cache: every row is read whole (8 samples = 16 bytes) and kept',
    log.length === nRows &&
      log.every(([o, l]) => l === 16 && o % 16 === 0) &&
      rows.size === nRows &&
      rows.bytes === 16 * nRows
  );
  log.length = 0;
  const b = await heightsAt(spy, spec, pts.slice(10, 40), { rows });
  ck(
    'row cache: a second question on the same rows reads nothing',
    log.length === 0 && JSON.stringify(b) === JSON.stringify(each.slice(10, 40))
  );
  // a row with a single point is a small read and does not enter the cache
  const rows2 = createRowCache(),
    lone = { n: 0.7 * S, e: 0.5 * S }; // a row of its own
  log.length = 0;
  const c = await heightsAt(spy, spec, [pts[0], pts[1], lone], { rows: rows2 });
  ck(
    'row cache: a lone point reads 2 bytes and is not kept',
    JSON.stringify(c.slice(0, 2)) === JSON.stringify(each.slice(0, 2)) &&
      c[2] === (await heightAt(readAt, spec, lone.n, lone.e)) &&
      log.filter(([, l]) => l === 2).length === 1 &&
      rows2.size === 1
  );
  // readMany: all the pieces in one call, in the order of the file, lone points included
  const calls = [],
    manyP = async sp => {
      calls.push(sp.map(x => x.slice()));
      return Promise.all(sp.map(([o, l]) => readAt(o, l)));
    };
  const d = await heightsAt(readAt, spec, pts.concat([lone]), { rows: createRowCache(), readMany: manyP });
  ck(
    'readMany: one call with every piece (the rows and the lone sample)',
    calls.length === 1 && calls[0].length === nRows + 1 && JSON.stringify(d.slice(0, 64)) === JSON.stringify(each)
  );
  ck(
    'readMany: the pieces are asked in the order of the file',
    calls[0].every((x, k) => k === 0 || x[0] > calls[0][k - 1][0])
  );
  // pieces that come back empty or short are asked again one by one
  const rowsB = createRowCache(),
    calls2 = [];
  const bad = async sp => {
    calls2.push(sp.length);
    return Promise.all(sp.map(([o, l], k) => (l > 2 && k % 2 ? null : readAt(o, l))));
  };
  const e = await heightsAt(readAt, spec, pts, { rows: rowsB, readMany: bad });
  ck(
    'readMany: a piece that was not read is asked again as single samples',
    JSON.stringify(e) === JSON.stringify(each) && calls2.length === 2 && calls2[1] > 0
  );
  ck('readMany: only the rows that were read whole are kept', rowsB.size === nRows - Math.floor(nRows / 2));
  // the same without a cache: spans of a row, read in one go
  const calls3 = [];
  const f = await heightsAt(readAt, spec, pts, {
    readMany: async sp => {
      calls3.push(sp);
      return Promise.all(sp.map(([o, l]) => readAt(o, l)));
    },
  });
  ck(
    'readMany without a cache: the spans of the rows',
    JSON.stringify(f) === JSON.stringify(each) && calls3.length === 1 && calls3[0].length === nRows
  );
}
{
  // limits of the cache: the least recently used row goes first, a single row is always kept
  const r = createRowCache(100);
  r.set(1, new Uint8Array(40));
  r.set(2, new Uint8Array(40));
  r.get(1); // 1 is now the most recent
  r.set(3, new Uint8Array(40));
  ck(
    'row cache: the least recently used row is dropped over the limit',
    !r.get(2) && !!r.get(1) && !!r.get(3) && r.bytes === 80
  );
  r.set(9, new Uint8Array(500));
  ck('row cache: a row bigger than the limit is kept alone', r.size === 1 && !!r.get(9) && r.bytes === 500);
  r.clear();
  ck('row cache: clear', r.size === 0 && r.bytes === 0);
}
{
  // a row longer than 256 KB is never read whole: the span of its points (or single samples) is read, and nothing is kept
  const big = { side: 200000, sizeFt: 1e7 },
    val = o => ((o / 2) % 30000) - 15000,
    rd = async (o, l) => {
      const u = new Uint8Array(l),
        d = new DataView(u.buffer);
      for (let k = 0; k + 1 < l; k += 2) d.setInt16(k, val(o + k), true);
      return u;
    },
    lens = [],
    rows = createRowCache(),
    pt = [
      { n: 5e6, e: 1e6 },
      { n: 5e6, e: 1.1e6 },
      { n: 5e6, e: 9e6 },
    ],
    got = await heightsAt(
      async (o, l) => {
        lens.push(l);
        return rd(o, l);
      },
      big,
      pt,
      { rows }
    ),
    want = [];
  for (const q of pt) want.push(val(heightOffset(big, q.n, q.e)));
  ck(
    'long rows: values are right, nothing is kept',
    JSON.stringify(got) === JSON.stringify(want) && rows.size === 0 && lens.every(l => l <= 262144)
  );
}
ck('short file gives nothing', (await heightAt(async () => new Uint8Array(1), spec, S, 0)) === null);
{
  // the real KTO Theater.txt (Data\TerrData\Korea\NewTerrain)
  const v = parseTheaterValues(
      'Theater name=KTO\r\nTheater size in KM=1024\r\nMap size in pixels=32768\r\nCenter latitude=38.5\r\nProjection string=+proj=tmerc +lon_0=127.5 +ellps=WGS84 +k=0.9996 +units=m +x_0=512000 +y_0=-3.74929e+06\r\n'
    ),
    sp = heightSpec(v, 2147483648, 1);
  ck('KTO Theater.txt: 1024 km, 32768 px', sp.side === 32768 && Math.round(sp.sizeFt) === 3359580);
}
console.log(bad ? 'heightmap: ' + bad + ' FAILED' : 'heightmap: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);
