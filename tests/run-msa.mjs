// MSA / ERAA / airbase sectors (core/msa.js) and the columns of the flight plan of the datacard (core/fpcols.js): pure checks on synthetic terrain.
import {
  NMFT,
  up100,
  vfrMsa,
  eraaAlt,
  ifrMsa,
  routeMsa,
  sectors,
  NB,
  baseBins,
  loadCells,
  CELL,
  baseMsa,
  inbound,
} from '../app/js/core/msa.js';
import { msaSymbol, msaSize } from '../app/js/core/msamap.js';
import { FP_OLD, FP_NEW, fpCell, fpMsaCell, fpTextX, fpCx, fpSpan, fpStart } from '../app/js/core/fpcols.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
// rounding and the three formulas
ck('up to the next 100 ft', up100(2300) === 2300 && up100(2300.4) === 2400 && up100(2301) === 2400 && up100(0) === 0);
ck('route MSA = highest + 500 ft', vfrMsa(1700) === 2200 && vfrMsa(1701) === 2300);
ck(
  'ERAA = highest + 1,000 ft, + 2,000 ft in mountainous terrain',
  eraaAlt(5000, false) === 6000 && eraaAlt(5000, true) === 7000
);
ck('airbase MSA = highest + 1,000 ft', ifrMsa(3150) === 4200);
// cells of the grid: only what is not in the cache is read, in the order of the rows, and a cell holds the highest of its samples
{
  const cache = new Map(),
    seen = [];
  const elev = async pts => {
    seen.push(pts.length);
    return pts.map(p => (Math.abs(p.e - 5 * CELL) < 1 ? 700 : 100)); // one of the four samples of the cell (5, 0) is high
  };
  ck(
    'cells: loadCells reads them',
    (await loadCells(
      elev,
      [
        [5, 0],
        [4, 0],
        [4, 3],
      ],
      cache
    )) === true && cache.size === 3
  );
  ck('cells: four samples per cell, the highest counts', seen[0] === 12 && cache.get('4,0') === 100);
  seen.length = 0;
  await loadCells(
    elev,
    [
      [5, 0],
      [4, 0],
      [9, 9],
    ],
    cache
  );
  ck('cells: the cells already read are not read again', seen.length === 1 && seen[0] === 4 && cache.size === 4);
  ck(
    'cells: no terrain data (reader gives null) = false',
    (await loadCells(async () => null, [[1, 1]], new Map())) === false
  );
  const order = [];
  await loadCells(
    async pts => (order.push(...pts.map(p => p.n)), pts.map(() => 1)),
    [
      [0, 5],
      [0, 1],
      [3, 1],
      [0, 3],
    ],
    new Map()
  );
  ck(
    'cells: asked row by row (order of j)',
    order.every((v, i) => i == 0 || v >= order[i - 1])
  );
}
// a route over synthetic terrain: a 3,000 ft block east of the first leg only touches its 22 NM band
{
  const terr = p => (p.e > 8 * NMFT && p.e < 12 * NMFT && p.n > 2 * NMFT && p.n < 6 * NMFT ? 3000 : 100);
  let reads = 0;
  const elev = async pts => (reads++, pts.map(terr));
  const route = [
    { n: 0, e: 0 },
    { n: 10 * NMFT, e: 0 },
    { n: 10 * NMFT, e: -20 * NMFT },
  ];
  const cache = new Map();
  const r = await routeMsa(elev, route, { cache });
  ck('route: first leg outside 5 NM of the block = 100 + 500', r.legs[1] === 600);
  ck('route: the leg has no value before the first steerpoint', r.legs[0] === null && r.legs.length === 3);
  ck('route: ERAA sees the block inside 22 NM (3,000 + 1,000)', r.eraa === 4000);
  ck('route: the block is flat on top, no mountainous area', r.mountainous === false);
  const n0 = reads;
  await routeMsa(elev, route, { cache });
  ck('route: the same route again reads nothing (cache)', reads === n0);
  const near = async pts => pts.map(p => (p.e > 3 * NMFT && p.e < 4 * NMFT ? 2000 : 100));
  const r2 = await routeMsa(near, route);
  ck('route: terrain within 5 NM raises the MSA (2,000 + 500)', r2.legs[1] === 2500);
  const rough = async pts => pts.map(p => (Math.round(p.e / CELL + p.n / CELL) % 2 ? 2000 : 100));
  const r3 = await routeMsa(rough, route);
  ck(
    'route: rough terrain (500 ft or more between neighbours, all over) is mountainous: ERAA + 2,000',
    r3.mountainous === true && r3.eraa === 4000
  );
  ck('route without terrain data is null', (await routeMsa(async () => null, route)) === null);
  ck('route of one steerpoint is null', (await routeMsa(elev, [route[0]])) === null);
  // the points asked are on the rows of the grid: a few hundred rows for a long leg, not thousands
  const rows = new Set();
  await routeMsa(
    async pts => (pts.forEach(p => rows.add(Math.round(p.n / CELL))), pts.map(() => 100)),
    [
      { n: 0, e: 0 },
      { n: 200 * NMFT, e: 150 * NMFT },
    ]
  );
  ck('route: a 250 NM leg is read in a few hundred rows of the grid', rows.size > 100 && rows.size < 600);
}
// sectors
{
  const flat = new Array(NB).fill(800),
    s1 = sectors(flat);
  ck(
    'sectors: flat terrain = 1 sector (800 + 1,000)',
    s1.length === 1 && s1[0].msa === 1800 && s1[0].from === 0 && s1[0].to === 360
  );
  const bm = flat.slice();
  for (let b = 10; b < 30; b++) bm[b] = 5000; // 50 to 150 degrees
  const s2 = sectors(bm);
  ck(
    'sectors: a massif gives 2 sectors cut at its edges',
    s2.length === 2 &&
      s2
        .map(x => x.from % 360)
        .sort((a, b) => a - b)
        .join() === '50,150'
  );
  const hi = s2.find(x => x.msa === 6000),
    lo = s2.find(x => x.msa === 1800);
  ck(
    'sectors: values 6,000 over the massif and 1,800 elsewhere',
    !!hi && !!lo && hi.to - hi.from === 100 && lo.to - lo.from === 260
  );
  const quad = flat.slice();
  for (let b = 0; b < NB; b++) quad[b] = [500, 3000, 1500, 6000][Math.floor(b / 18)];
  const s4 = sectors(quad);
  ck('sectors: four steps = four sectors of 90 degrees', s4.length === 4 && s4.every(x => x.to - x.from === 90));
  ck(
    'sectors: values are the highest + 1,000, up to 100 ft',
    s4
      .map(x => x.msa)
      .sort((a, b) => a - b)
      .join() === '1500,2500,4000,7000'
  );
  const noisy = flat.map((v, i) => v + (i % 2) * 20);
  ck('sectors: small noise does not make more sectors', sectors(noisy).length === 1);
  let small = flat.slice();
  for (let b = 3; b < 6; b++) small[b] = 2000; // 15 degrees only
  ck(
    'sectors: a spike narrower than 45 degrees is absorbed, not a sector',
    sectors(small).every(x => x.to - x.from >= 45)
  );
  const r = await baseMsa(async pts => pts.map(() => 1234), { n: 0, e: 0 }, 0);
  ck('baseMsa: one sector for even terrain', r.length === 1 && r[0].msa === 2300);
  ck('baseMsa without terrain is null', (await baseMsa(async () => null, { n: 0, e: 0 }, 0)) === null);
  const north = async pts => pts.map(p => (p.n > 2 * CELL ? 4000 : 100));
  const bb = await baseBins(north, { n: 0, e: 0 }, 0);
  ck('baseBins: the north half is high, the south low', bb[0] === 4000 && bb[36] === 100 && bb.length === NB);
  ck(
    'baseBins: the height of the airbase itself counts in every bin',
    (await baseBins(async pts => pts.map(() => 100), { n: 0, e: 0 }, 900)).every(v => v === 900)
  );
  const wedge = await baseBins(
    async pts => pts.map(p => (p.e > 3 * CELL && Math.abs(p.n) < 3 * CELL ? 5000 : 100)),
    { n: 0, e: 0 },
    0
  );
  ck(
    'baseBins: a hill to the east is in the bins around 90 degrees only',
    wedge[18] === 5000 && wedge[54] === 100 && wedge[0] === 100
  );
  let rd = 0;
  const cch = new Map();
  await baseBins(async pts => (rd++, pts.map(() => 100)), { n: 0, e: 0 }, 0, { cache: cch });
  await baseBins(async pts => (rd++, pts.map(() => 100)), { n: 3000, e: 2000 }, 0, { cache: cch });
  ck('baseBins: an airbase on the same ground reads only the cells that are new', rd === 3 && cch.size < 7000);
}
ck(
  'inbound bearing: reciprocal of the edge, magnetic = true - variation',
  inbound(90, 0) === 270 && inbound(350, 0) === 170 && inbound(90, 8) === 262 && inbound(0, -8) === 188
);
// the symbol of the map
{
  const sy = (secs, z) => msaSymbol(secs, z, 0).html;
  const two = [
    { from: 50, to: 150, msa: 6000 },
    { from: 150, to: 410, msa: 1800 },
  ];
  ck(
    'symbol grows with the zoom, between 34 and 150 px',
    msaSize(5) === 34 && msaSize(10) === 94 && msaSize(20) === 150
  );
  ck(
    'symbol: black disc, white values in boxes',
    /fill="#000"/.test(sy(two, 9)) &&
      /fill="#fff"/.test(sy(two, 9)) &&
      /6000/.test(sy(two, 9)) &&
      /1800/.test(sy(two, 9))
  );
  ck(
    'symbol: the disc hangs below the point (a line from the point at the top to the disc)',
    /<line x1="[0-9.]+" y1="6"/.test(sy(two, 9))
  );
  ck('symbol: no bearings when it is small, bearings when it is big', !/°/.test(sy(two, 8)) && /°/.test(sy(two, 11)));
  ck(
    'symbol: the bearings are inbound (edge 50 -> 230, 150 -> 330)',
    /230°/.test(sy(two, 11)) && /330°/.test(sy(two, 11))
  );
  ck(
    'symbol: one sector has no edge lines (only the line to the point)',
    (sy([{ from: 0, to: 360, msa: 1800 }], 9).match(/<line/g) || []).length === 1
  );
}
// flight plan columns of the datacard: contiguous, the same total width, MSA after Alt
ck(
  'columns: new table covers the same width (27 to 787)',
  FP_NEW[0] === 27 && FP_NEW[FP_NEW.length - 1] === 787 && FP_OLD[FP_OLD.length - 1] === 787
);
ck(
  'columns: every column is wider than 40 px',
  FP_NEW.slice(1).every((x, i) => x - FP_NEW[i] >= 40)
);
ck(
  'columns: the MSA column sits between Alt and Min.Fuel and is at least 50 px',
  fpStart(7) === 582 && fpSpan(7) >= 50 && fpStart(6) + fpSpan(6) === fpStart(7)
);
ck(
  'cell: an old Action cell follows its column',
  JSON.stringify(fpCell([76, 529, 104, 27, 0])) === JSON.stringify([71, 529, 122, 27, 0])
);
ck(
  'cell: the Alt cell makes an MSA cell of the same row',
  JSON.stringify(fpMsaCell([552, 529, 76, 27, 0])) === JSON.stringify([582, 529, 56, 27, 0])
);
ck(
  'cell: a cell outside the table stays',
  JSON.stringify(fpCell([841, 529, 79, 27, 1])) === JSON.stringify([841, 529, 79, 27, 1])
);
ck('text: centred text moves with the centre of its column', Math.abs(fpTextX(51.5) - (fpCx(0) + 1.5)) < 2);
console.log(`${n - bad}/${n} ok`);
process.exit(bad ? 1 : 0);
