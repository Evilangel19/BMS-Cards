// MSA / ERAA / airbase sectors (core/msa.js) and the columns of the flight plan of the datacard (core/fpcols.js): pure checks on synthetic terrain.
import {
  NMFT,
  up100,
  vfrMsa,
  eraaAlt,
  ifrMsa,
  strip,
  relief,
  routeMsa,
  sectors,
  NB,
  ringPoints,
  binMax,
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
// strips
{
  const s = strip({ n: 0, e: 0 }, { n: 10 * NMFT, e: 0 }, 5, 0.5, 0.5);
  ck('strip: 21 points across, 21 along 10 NM every 0.5 NM', s.nC === 21 && s.nA === 21 && s.pts.length === 441);
  const q = s.pts.filter(p => Math.abs(p.n) < 1);
  ck(
    'strip: spans 5 NM each side of the centreline',
    Math.abs(Math.min(...q.map(p => p.e)) + 5 * NMFT) < 1 && Math.abs(Math.max(...q.map(p => p.e)) - 5 * NMFT) < 1
  );
  const d = strip({ n: 0, e: 0 }, { n: 0, e: 0 }, 5, 0.5, 0.5);
  ck('strip: a leg of length 0 still gives points', d.pts.length > 0);
}
// relief: 500 ft between neighbours counts, 499 not
{
  const flat = new Array(9).fill(100),
    r0 = relief(flat, 3, 3);
  ck('relief: flat ground has no steep pair', r0.steep === 0 && r0.pairs === 12);
  const h = flat.slice();
  h[4] = 600;
  ck('relief: 500 ft counts', relief(h, 3, 3).steep === 4);
  h[4] = 599;
  ck('relief: 499 ft does not', relief(h, 3, 3).steep === 0);
  ck('relief: missing samples are skipped', relief([null, 1, 2, 3], 2, 2).pairs === 2);
}
// a route over synthetic terrain: a 3,000 ft block east of the first leg only touches its 22 NM band
{
  const terr = p => (p.e > 8 * NMFT && p.e < 12 * NMFT && p.n > 2 * NMFT && p.n < 6 * NMFT ? 3000 : 100);
  const elev = async pts => pts.map(terr);
  const route = [
    { n: 0, e: 0 },
    { n: 10 * NMFT, e: 0 },
    { n: 10 * NMFT, e: -20 * NMFT },
  ];
  const r = await routeMsa(elev, route);
  ck('route: first leg outside 5 NM of the block = 100 + 500', r.legs[1] === 600);
  ck('route: the leg has no value before the first steerpoint', r.legs[0] === null && r.legs.length === 3);
  ck('route: ERAA sees the block inside 22 NM (3,000 + 1,000)', r.eraa === 4000);
  ck('route: the block is flat on top, no steep pair inside 5 NM', r.mountainous === false);
  const near = async pts => pts.map(p => (p.e > 3 * NMFT && p.e < 4 * NMFT ? 2000 : 100));
  const r2 = await routeMsa(near, route);
  ck('route: terrain within 5 NM raises the MSA (2,000 + 500)', r2.legs[1] === 2500);
  ck(
    'route: one ridge is not a mountainous area (a few steep pairs only)',
    r2.mountainous === false && r2.eraa === 3000
  );
  const rough = async pts => pts.map(p => (Math.round((p.n + p.e) / (0.5 * NMFT)) % 2 ? 2000 : 100));
  const r3 = await routeMsa(rough, route);
  ck(
    'route: rough terrain (500 ft or more in 0.5 NM, all over) is mountainous: ERAA + 2,000',
    r3.mountainous === true && r3.eraa === 4000
  );
  ck('route without terrain data is null', (await routeMsa(async () => null, route)) === null);
  ck('route of one steerpoint is null', (await routeMsa(elev, [route[0]])) === null);
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
  ck('ring points: 72 bins x 25 NM', ringPoints({ n: 0, e: 0 }).length === 72 * 25);
  const ring = ringPoints({ n: 0, e: 0 }),
    hh = ring.map(p => (p.n > 0 ? 4000 : 100)),
    bm2 = binMax(hh, 0);
  ck('binMax: the north half is high, the south low', bm2[0] === 4000 && bm2[36] === 100);
  ck(
    'binMax: the height of the airbase itself counts',
    binMax(
      ring.map(() => 100),
      900
    )[5] === 900
  );
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
  ck('symbol: no bearings when it is small, bearings when it is big', !/°/.test(sy(two, 8)) && /°/.test(sy(two, 11)));
  ck(
    'symbol: the bearings are inbound (edge 50 -> 230, 150 -> 330)',
    /230°/.test(sy(two, 11)) && /330°/.test(sy(two, 11))
  );
  ck('symbol: one sector has no edge lines', !/<line/.test(sy([{ from: 0, to: 360, msa: 1800 }], 9)));
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
