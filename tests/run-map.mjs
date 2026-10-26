// Map page data: coordinate conversion, airbases, flight routes.
import fs from 'node:fs';
import { objState } from '../app/js/parsers/cam.js';
import { CAM } from '../app/js/core/cam-core.js';
import {
  frontLine,
  toLL,
  fmtLL,
  mapAirbases,
  flightRoute,
  mapUnits,
  flightState,
  isActivity,
  legs,
  bullseye,
  allyOf,
  spottedBy,
  airbaseSide,
  distToRoute,
  crossesRoute,
  theaterBounds,
} from '../app/js/core/mapdata.js';
import { warpFrame, affine, BMS_EXTENT } from '../app/js/core/mapwarp.js';
import { unitSymbol, glyphOf, placeIcon } from '../app/js/core/mapsymbols.js';
import {
  dtcPoints,
  dtcValue,
  dtcKey,
  dtcEmpty,
  freeSlot,
  dtcLines,
  parseLL,
  FT_KM,
  lineOf,
} from '../app/js/core/mapdtc.js';
import { parseDtc } from '../app/js/parsers/dtc.js';
import { fromLL } from '../app/js/core/mapdata.js';
import { tmInv, tmFwd } from '../app/js/rules/geo.js';
import basemap from '../app/js/data/basemap.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const near = (a, b, t) => Math.abs(a - b) < t;
const abs = mapAirbases(CAM.D);
const find = rx => abs.find(a => rx.test(a.name));
const osan = find(/Osan/),
  sunan = find(/Sunan/),
  seoul = find(/^Seoul$/);
ck('Osan lat/lon', osan && near(osan.ll[0], 37.09, 0.05) && near(osan.ll[1], 127.03, 0.05));
ck('Sunan lat/lon', sunan && near(sunan.ll[0], 39.22, 0.08) && near(sunan.ll[1], 125.67, 0.08));
ck('Seoul AB lat/lon', seoul && near(seoul.ll[0], 37.44, 0.08) && near(seoul.ll[1], 127.11, 0.08));
ck(
  'navaid kinds',
  abs.some(a => a.sub == 'vor') && abs.some(a => a.sub == 'vortac') && abs.every(a => a.kind != 'nav' || a.sub)
);
ck(
  'navaids and ships are told apart',
  abs.some(a => a.kind == 'nav' && /VOR|TACAN/.test(a.name)) &&
    abs.some(a => a.kind == 'ship') &&
    find(/^Osan$/).kind == 'ab'
);
ck(
  'theater center is the projection origin',
  near(toLL(512, 512)[0], 38.5, 0.001) && near(toLL(512, 512)[1], 127.5, 0.001)
);
ck(
  'all airbases inside the theater bounds',
  abs.length > 30 &&
    abs
      .filter(a => a.kind != 'ship')
      .every(
        a =>
          a.ll[0] > theaterBounds()[0][0] &&
          a.ll[0] < theaterBounds()[1][0] &&
          a.ll[1] > theaterBounds()[0][1] &&
          a.ll[1] < theaterBounds()[1][1]
      )
);
ck(
  'coordinate format',
  fmtLL(37.0833, 127.0167) === "N 37° 04.998'  E 127° 01.002'" || fmtLL(37.0833, 127.0167).startsWith('N 37° 04.99')
);
ck('south/west signs', fmtLL(-5.5, -10.25).startsWith('S 05° 30.000') && fmtLL(-5.5, -10.25).includes('W 010° 15.000'));
ck('offline base map has land and borders', basemap.land.length > 50 && basemap.borders.length >= 1);
ck(
  'offline base map has rivers and lakes of the region',
  basemap.rivers.length > 50 &&
    basemap.lakes.length > 10 &&
    basemap.rivers.some(r => r.some(p => near(p[0], 126.9, 0.6) && near(p[1], 37.5, 0.6)))
);
ck(
  'base map covers the Korean peninsula',
  basemap.land.some(r => r.some(p => near(p[0], 127, 1) && near(p[1], 37, 1)))
);
for (const f of ['beartrap/PSI_BEAR_TRAP_26.cam', 'evilkorea/EvilKorea.cam']) {
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url))), CAM.D, f);
  const fl = C.units.filter(u => u.kind == 'flight' && u.wps.length);
  const routes = fl.map(x => flightRoute(C, x));
  ck(
    f + ' every flight has a route',
    routes.every((r, i) => r.length === fl[i].wps.length && r[0].n === 1)
  );
  ck(
    f + ' waypoints are in the theater region',
    routes.every(r => r.every(p => p.ll[0] > 25 && p.ll[0] < 50 && p.ll[1] > 115 && p.ll[1] < 140))
  );
}
{
  const C = CAM.openCam(
    new Uint8Array(fs.readFileSync(new URL('./fixtures/evilkorea/EvilKorea.cam', import.meta.url))),
    CAM.D,
    'x'
  );
  const U = mapUnits(C, C.playerTeam),
    sam = U.filter(u => u.sam);
  ck(
    'ground and naval units listed',
    U.length === C.units.filter(u => u.kind == 'gnd' || u.kind == 'sea').length && U.length > 300
  );
  ck(
    'friendly units are never "enemy"',
    U.filter(u => u.ally).every(u => allyOf(C, u.owner, C.playerTeam)) && U.filter(u => u.ally).length > 50
  );
  ck(
    'enemy units spotted by an allied team only',
    U.filter(u => !u.ally && u.spotted).every(u =>
      spottedBy(
        u.u,
        [0, 1, 2, 3, 4, 5, 6, 7].filter(t => allyOf(C, t, C.playerTeam))
      )
    )
  );
  ck('some enemies are spotted, some are not', U.some(u => !u.ally && u.spotted) && U.some(u => !u.ally && !u.spotted));
  ck(
    'SAM units have a name and a range',
    sam.length > 20 && sam.every(u => u.name && u.rng > 0 && ['Air Defense', 'SHORAD'].includes(u.cat))
  );
  ck(
    'SA-2 ring is 30 km',
    sam.some(u => /SA-2/.test(u.name) && u.rng === 30)
  );
  {
    // FCR: the class names the slot of the radar vehicle, the roster (2 bits per slot) the count of vehicles left
    const saved = {};
    const cls = [...new Set(sam.map(m => m.u.c.i))];
    cls.forEach(c => {
      saved[c] = CAM.D.un[c];
      CAM.D.un[c] = [...CAM.D.un[c].slice(0, 3), 3];
    });
    const u0 = sam[0].u,
      r0 = u0.roster;
    u0.roster = (r0 | (1 << 6)) >>> 0;
    const withFcr = mapUnits(C, C.playerTeam).find(m => m.u === u0);
    u0.roster = (r0 & ~(3 << 6)) >>> 0;
    const lost = mapUnits(C, C.playerTeam).find(m => m.u === u0);
    ck(
      'a SAM with a radar vehicle left has an FCR, one without it is marked noFcr',
      withFcr.noFcr === false && lost.noFcr === true
    );
    ck(
      'a class without a radar slot (-1) is never marked',
      (() => {
        cls.forEach(c => {
          CAM.D.un[c] = [...CAM.D.un[c].slice(0, 3), -1];
        });
        return mapUnits(C, C.playerTeam).every(m => !m.noFcr);
      })()
    );
    u0.roster = r0;
    cls.forEach(c => {
      CAM.D.un[c] = saved[c];
    });
  }
  ck(
    'unit positions in the theater region',
    U.every(u => u.ll[0] > 25 && u.ll[0] < 50 && u.ll[1] > 115 && u.ll[1] < 140)
  );
  const fl = C.units.filter(u => u.kind == 'flight' && u.wps.length > 2);
  ck('campaign time is read (day 4, 11:00:53)', C.now === 298853532 && Math.floor(C.now / 86400000) + 1 === 4);
  const air = fl.map(f => flightState(f, C.now)).filter(Boolean);
  ck(
    'some flights are airborne at the campaign time',
    air.length > 2 && air.every(a => a.gsKt >= 0 && a.gsKt < 2500 && a.altFt >= 0 && a.altFt < 80000)
  );
  ck(
    'flights outside their timed route are not shown',
    fl.every(f => {
      const m = f.wps.filter(w => w.arr > 0);
      return !m.length || (!flightState(f, m[0].arr - 1) && !flightState(f, m[m.length - 1].arr + 1));
    })
  );
  const f0 = fl.find(f => flightState(f, (f.wps[0].arr + f.wps[1].arr) / 2));
  ck(
    'flight position lies between its waypoints',
    (() => {
      const m = f0.wps.filter(w => w.arr > 0),
        t = (m[0].arr + m[1].arr) / 2,
        p = flightState(f0, t).ll,
        A = toLL(m[0].x, m[0].y),
        B = toLL(m[1].x, m[1].y);
      return (
        p[0] >= Math.min(A[0], B[0]) - 1e-6 &&
        p[0] <= Math.max(A[0], B[0]) + 1e-6 &&
        p[1] >= Math.min(A[1], B[1]) - 1e-6 &&
        p[1] <= Math.max(A[1], B[1]) + 1e-6
      );
    })()
  );
  const r = flightRoute(C, fl[3]),
    L = legs(r);
  ck(
    'legs: none for the first steerpoint, distance in nm for the others',
    L[0] === null &&
      L.slice(1).every(l => l.nm >= 0 && l.hdg >= 0 && l.hdg < 360) &&
      Math.abs(L[1].nm - Math.hypot(r[1].x - r[0].x, r[1].y - r[0].y) / 1.852) < 1e-9
  );
  ck(
    'activity steerpoints are triangles, navigation ones circles',
    [17, 12, 14, 16, 19, 4, 21, 26].every(isActivity) && [0, 1, 2, 3, 7, 8].every(a => !isActivity(a))
  );
  ck(
    'bullseye is read and inside the theater',
    (() => {
      const b = bullseye(C);
      return b && b[0] > 33 && b[0] < 43 && b[1] > 123 && b[1] < 133;
    })()
  );
}
for (const f of ['beartrap/PSI_BEAR_TRAP_26.cam', 'evilkorea/EvilKorea.cam']) {
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url))), CAM.D, f);
  ck(
    f + ' every unit category has a NATO sign',
    mapUnits(C, C.playerTeam).every(u => glyphOf(u.cat) !== 'unk')
  );
}
{
  const a = unitSymbol('Air Defense', 'friend'),
    b = unitSymbol('Armored', 'hostile'),
    c = unitSymbol('HQ', 'neutral');
  ck(
    'NATO symbols: friendly rectangle, hostile diamond, text signs',
    a.html.includes('<rect') &&
      b.html.includes('<path d="M14 2L26 14') &&
      c.html.includes('>HQ<') &&
      a.w === 28 &&
      b.h === 28
  );
  ck(
    'NATO symbols are valid svg strings',
    [a, b, c].every(x => x.html.startsWith('<svg') && x.html.endsWith('</svg>'))
  );
}
ck(
  'airbase and navaid icons',
  !placeIcon('ab').html.includes('<circle') &&
    placeIcon('ab').html.includes('class="th"') &&
    ['vor', 'vordme', 'dme', 'vortac', 'tacan', 'ndb'].every(k => placeIcon('nav', k).html.startsWith('<svg')) &&
    placeIcon('nav', 'vor').html.includes('<path') &&
    placeIcon('nav', 'ndb').html.includes('dt') &&
    placeIcon('nav', 'vortac').html !== placeIcon('nav', 'vor').html
);
ck('no flight -> empty route', flightRoute({}, null).length === 0);
// picture re-projection geometry
{
  const F = warpFrame(BMS_EXTENT, 3840, 3840, 4096),
    c = toLL(512, 512);
  ck('warp: frame covers the whole theater square', F.bounds[0][0] < 35 && F.bounds[1][0] > 42 && F.outH > 3000);
  const [px, py] = F.dst(
    (3840 * (512 - BMS_EXTENT.x0)) / (BMS_EXTENT.x1 - BMS_EXTENT.x0),
    (3840 * (BMS_EXTENT.y1 - 512)) / (BMS_EXTENT.y1 - BMS_EXTENT.y0)
  );
  const lonFrac = (c[1] - F.bounds[0][1]) / (F.bounds[1][1] - F.bounds[0][1]);
  ck('warp: theater center lands at its longitude', near(px / F.outW, lonFrac, 0.002));
  const [ax, ay] = F.dst(0, 0),
    [bx, by] = F.dst(3840, 3840);
  ck('warp: north-west corner is top-left, south-east bottom-right', ax < bx && ay < by);
  const m = affine(
    [
      [0, 0],
      [10, 0],
      [0, 10],
    ],
    [
      [5, 7],
      [25, 7],
      [5, 27],
    ]
  );
  ck('warp: affine maps the corners', m[0] === 2 && m[3] === 2 && m[4] === 5 && m[5] === 7 && m[1] === 0 && m[2] === 0);
}
const rt = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];
ck(
  'distance to route: on the line, beside a leg, beyond the end',
  near(distToRoute(rt, 50, 0), 0, 1e-9) &&
    near(distToRoute(rt, 50, 30), 30, 1e-9) &&
    near(distToRoute(rt, 130, 140), 50, 1e-9) &&
    distToRoute([], 1, 1) === Infinity
);
ck(
  'SAM crossing: range circle touching a leg',
  crossesRoute(rt, 50, 40, 41) &&
    !crossesRoute(rt, 50, 40, 39) &&
    crossesRoute(rt, 100, 150, 50) &&
    !crossesRoute(rt, 300, 300, 50)
);
// ---- DTC steerpoints
{
  const rt = tmFwd(...tmInv(123456, -234567));
  ck('forward projection inverts tmInv (< 1 mm)', near(rt[0], 123456, 1e-3) && near(rt[1], -234567, 1e-3));
  const g = fromLL(...toLL(469.6, 354.6));
  ck('fromLL inverts toLL', near(g[0], 469.6, 1e-6) && near(g[1], 354.6, 1e-6));
  const ini = fs.readFileSync(new URL('./fixtures/beartrap/Evil19_2_.ini', import.meta.url), 'latin1'),
    lines = parseDtc(ini),
    P = dtcPoints(lines);
  ck(
    'DTC points read: 19 precision slots, 15 PPT rows, 24 line rows (4 lines of 6)',
    P.prec.length == 19 &&
      P.ppt.length == 15 &&
      P.line.length == 24 &&
      lineOf(0) == 1 &&
      lineOf(5) == 1 &&
      lineOf(6) == 2 &&
      lineOf(23) == 4
  );
  const used = a => a.filter(p => !p.empty);
  ck(
    'used rows: 3 precision targets (STPT 96-98), 13 PPT, 19 line points in 4 lines of 5, 5, 6 and 3',
    used(P.prec).length == 3 &&
      used(P.prec)[0].stpt == 96 &&
      used(P.ppt).length == 13 &&
      used(P.line).length == 19 &&
      dtcLines(P)
        .map(r => r.line + ':' + r.pts.length)
        .join() == '1:5,2:5,3:6,4:3'
  );
  const y = used(P.prec)[0];
  ck(
    'precision target position is the airfield (Yangyang, N 38° E 128°)',
    near(toLL(y.x, y.y)[0], 38.06, 0.1) &&
      near(toLL(y.x, y.y)[1], 128.66, 0.1) &&
      y.altFt == 190 &&
      /Yangyang/.test(y.name)
  );
  const ppt = used(P.ppt);
  ck(
    'PPT: name and range ring (SA-10 "10" = 50 nm), waypoints without range',
    ppt[8].name == '10' && near(ppt[8].rngNm, 50, 0.05) && ppt[0].rngNm == 0
  );
  const v = dtcValue('prec', lines.find(l => l.k == 'target_95').v, {
    x: 400,
    y: 300,
    altFt: 120,
    name: 'Bridge, east',
  });
  ck(
    'precision value written in the ini format (6 decimals, keeps the type field, no comma in the name)',
    v == `${(300 * FT_KM).toFixed(6)}, ${(400 * FT_KM).toFixed(6)}, -120.000000, -1, Bridge  east`
  );
  const p2 = dtcPoints(parseDtc('[STPT]\r\ntarget_80=' + v + '\r\n'));
  ck(
    'written value reads back',
    near(p2.prec[0].x, 400, 1e-3) &&
      near(p2.prec[0].y, 300, 1e-3) &&
      p2.prec[0].altFt == 120 &&
      p2.prec[0].name == 'Bridge  east'
  );
  ck(
    'PPT range written in feet, 0 means the 0.1 marker; line value has 3 fields',
    dtcValue('ppt', dtcEmpty('ppt'), { x: 1, y: 2, name: 'SA6', rngNm: 12 }).split(', ')[3] ==
      (12 * 6076.12).toFixed(6) &&
      dtcValue('ppt', dtcEmpty('ppt'), { x: 1, y: 2 }).split(', ')[3] == '0.100000' &&
      dtcValue('line', dtcEmpty('line'), { x: 1, y: 2 }).split(', ').length == 3
  );
  ck(
    'empty values and keys',
    dtcKey('prec', 0) == 'target_80' &&
      dtcKey('prec', 18) == 'target_98' &&
      dtcKey('ppt', 3) == 'ppt_3' &&
      dtcKey('line', 24) == 'lineSTPT_24' &&
      dtcEmpty('prec').endsWith('Not set')
  );
  ck(
    'free slots: last empty precision (STPT 99, filled downwards), PPT 13 (STPT 69), LINE1 slot 5, LINE3 full, LINE4 slot 21, LINE2 slot 11',
    freeSlot(P, 'prec') == 18 &&
      freeSlot(P, 'ppt') == 13 &&
      freeSlot(P, 'line', 1) == 5 &&
      freeSlot(P, 'line', 3) == -1 &&
      freeSlot(P, 'line', 4) == 21 &&
      freeSlot(P, 'line', 2) == 11
  );
  ck(
    'place names read: DM and decimal',
    near(parseLL("N 37° 05.130'  E 127° 01.000'")[0], 37.0855, 1e-6) &&
      near(parseLL("N 37° 05.130'  E 127° 01.000'")[1], 127.01667, 1e-4) &&
      near(parseLL('37.5, 127.25')[1], 127.25, 1e-9) &&
      near(parseLL('S 1 30.0 W 2 0')[0], -1.5, 1e-9) &&
      parseLL('nonsense') === null
  );
  ck('no [STPT] section: no points', dtcPoints(parseDtc('[EWS]\r\na=1\r\n')) === null);
}
{
  {
    const D = {
      ob: [
        [7, 'Chioggia', 1, 1, 10],
        [8, 'Aviano', 2, 2, 3],
      ],
      ab: { 7: [], 8: [] },
      navOcd: [10],
    };
    const m = mapAirbases(D);
    ck(
      'objective of a beacon class (OCD name) is a navaid even without VOR in its name',
      m[0].kind == 'nav' && m[1].kind == 'ab'
    );
  }
  const subs = new Set(mapAirbases(CAM.D).map(a => a.sub));
  ck('navaid sub types incl. TACAN (own icon, not VORTAC)', subs.has('tacan') && subs.has('vortac') && subs.has('vor'));
  ck(
    'NDB icon: dotted rings; TACAN icon: three-lobed outline',
    placeIcon('nav', 'ndb').html.includes('class="dr"') &&
      placeIcon('nav', 'tacan').html.includes('M1.5 8.6') &&
      placeIcon('ab', '', '#3ddc84').html.includes('--c:#3ddc84')
  );
  const C0 = CAM.openCam(
    new Uint8Array(fs.readFileSync(new URL('./fixtures/evilkorea/EvilKorea.cam', import.meta.url))),
    CAM.D,
    'x.cam'
  );
  {
    const sv = new URL('./fixtures/saves/Save1.cam', import.meta.url);
    if (fs.existsSync(sv)) CAM.initialOwners(C0, new Uint8Array(fs.readFileSync(sv)));
  } // EvilKorea starts from Save1: the changes of the campaign are keyed by another id and need that file
  const sides = new Set(
    mapAirbases(CAM.D)
      .filter(a => a.kind == 'ab')
      .map(a => airbaseSide(C0, a.id, C0.playerTeam))
  );
  {
    const st = [...C0.objFeat.values()].map(f => objState(f));
    ck(
      'objective states from the feature statuses: intact, damaged and destroyed all occur',
      C0.objFeat.size > 100 &&
        [0, 1, 2].every(v => st.includes(v)) &&
        objState(new Uint8Array([0, 3, 3])) == 1 &&
        objState(new Uint8Array([3, 3])) == 2 &&
        objState(new Uint8Array([0, 6])) == 0 &&
        objState(undefined) == 0
    );
  }
  ck(
    'airbase owners from the scenario file under the changes: own, allied and enemy bases occur, all known',
    C0.objOwn.size === 5999 && !sides.has('unknown') && sides.has('enemy') && sides.size >= 3
  );
}
{
  const C = CAM.openCam(
    new Uint8Array(fs.readFileSync(new URL('./fixtures/beartrap/PSI_BEAR_TRAP_26.cam', import.meta.url))),
    CAM.D,
    'x'
  );
  const U = mapUnits(C, C.playerTeam ?? 1).filter(m => m.spotted),
    F = frontLine(U, 6);
  ck(
    'front line: 6 distinct friendly units',
    F && F.length === 6 && new Set(F.map(p => p.m)).size === 6 && F.every(p => p.m.ally)
  );
  const fds = U.filter(m => m.u.kind == 'gnd' && m.ally)
    .map(m =>
      Math.min(
        ...U.filter(e => e.u.kind == 'gnd' && !e.ally && e.owner != 0).map(e =>
          Math.hypot(e.u.x - m.u.x, e.u.y - m.u.y)
        )
      )
    )
    .sort((a, b) => a - b);
  ck(
    'front line: the units are among the ones closest to the enemy',
    F && F.every(p => p.m.fd <= fds[Math.floor(fds.length * 0.5)])
  );
  ck('front line: ordered along the front', F && F.every((p, i) => i == 0 || p.m.t >= F[i - 1].m.t));
  ck(
    'front line: nothing without enemy units',
    frontLine(
      U.filter(m => m.ally),
      6
    ) === null
  );
}
console.log(`map: ${n - bad}/${n} checks passed`);
process.exit(bad ? 1 : 0);
