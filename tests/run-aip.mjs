// AIP and ATC parsing with a small synthetic sample (own made-up numbers, same layout idea as the real AIP table).
import { mergeItems, parseAip, aipFor } from '../app/js/bmsdata/aip.js';
import { parseAtc, buildAirbases } from '../app/js/bmsdata/airbases.js';
import { parseRunways, runwayLengths } from '../app/js/bmsdata/runways.js';
let bad = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) { bad++; console.log('FAIL', name, info); } };
const it = (s, x, y, w = s.length * 4) => ({ s, x, y, w });
const page = [
  it('Elev', 330, 500, 16), it('ICAO', 16, 480),
  // airport A: two parallel runways, ILS on one end only; text split into pieces like a PDF does
  it('RKAA', 16, 460), it('Ab', 51, 460, 8), it('cd', 59, 460, 8), it('111.7 (24', 283, 460), it('R)', 314, 460), it('55', 332, 460, 8), it('075X', 209, 460), it('N36°4', 358, 465), it('2', 378, 465, 4), it('.', 382, 465, 2), it('857', 384, 465, 12), it('E127°29.493', 356, 455),
  it('06L/24R', 238, 465), it('06R/24L', 238, 455),
  // airport B: frequency and ends on two lines (shared by both ends), elevation 1234
  it('RKBB', 16, 430), it('Efgh', 51, 430), it('108.30', 280, 440), it('(10&28)', 280, 432), it('1234', 332, 430), it('10/28', 244, 430),
  // two airports with the same code
  it('RKCC', 16, 400), it('North', 51, 400), it('12', 332, 400, 8), it('01/19', 244, 400),
  it('RKCC', 16, 380), it('South', 51, 380), it('34', 332, 380, 8), it('02/20', 244, 380),
];
const w = mergeItems(page);
ok('fragments are joined', w.some(x => x.s === 'Abcd') && w.some(x => x.s === '111.7 (24R)'));
const list = parseAip([page]);
const A = list.find(r => r.icao === 'RKAA'), B = list.find(r => r.icao === 'RKBB');
ok('elevation', A.elev === 55 && B.elev === 1234, JSON.stringify([A.elev, B.elev]));
ok('TACAN and coordinates', A.tacan === '075X' && Math.abs(A.lat - 36.7143) < 0.001 && Math.abs(A.lon - 127.4916) < 0.001, JSON.stringify([A.tacan, A.lat, A.lon]));
ok('ILS of one end', A.ils.length === 1 && A.ils[0].f === 11170 && A.ils[0].end === '24R', JSON.stringify(A.ils));
ok('shared ILS on two lines', B.ils.length === 2 && B.ils.every(i => i.f === 10830), JSON.stringify(B.ils));
ok('same code, name decides', aipFor(list, 'RKCC', 'South Base (RKCC)').elev === 34 && aipFor(list, 'RKCC', 'North AB (RKCC)').elev === 12);
ok('different code, name decides', aipFor(list, 'RKXX', 'Efgh AB (RKXX)').icao === 'RKBB' && aipFor(list, 'RKXX', 'Nothing (RKXX)') === null);

const atc = parseAtc('# ATC File\r\n# CampID (listed)\r\n501\r\n\r\n# RUNWAY: 0 HDG:059 QFU:06\r\n# RUNWAY: 0 HDG:239 QFU:24\r\n# RUNWAY: 1 HDG:239 QFU:24\r\n# RUNWAY: 1 HDG:059 QFU:06\r\n');
ok('atc parse', atc.campId === '501' && atc.ends.length === 4 && atc.ends[1].hdg === 239 && atc.ends[1].qfu === '24');
const ob = [['501', 'Abcd AB (RKAA)', 0, 0], ['502', 'Efgh (RKBB)', 0, 0]];
const b = buildAirbases({ atc: [atc], aipList: list, ob, ab: {} });
ok('runways merge ATC and AIP', JSON.stringify(b.ap['501']) === JSON.stringify({ i: 'RKAA', rw: [['06', 59, 0], ['24', 239, 11170]] }), JSON.stringify(b.ap['501']));
ok('elevation from AIP', b.el['501'] === 55 && b.el['502'] === 1234);
ok('TACAN from AIP', b.tn['501'] === '75 X' && !b.tn['502']);
ok('airbase without ATC: runways from AIP', b.ap['502'].rw.length === 2 && b.ap['502'].rw[0][1] === 100 && b.ap['502'].rw[0][2] === 10830, JSON.stringify(b.ap['502']));
const c = buildAirbases({ atc: [atc], aipList: null, ob, ab: { 501: [1, 'X', 0, 0, 1, 0, 0, 11000, 11000, 0, 0] } });
ok('no AIP: ILS only when all equal', c.ap['501'].rw[0][2] === 11000 && c.ap['501'].rw[1][2] === 11000);
// runway sizes (made-up objective: two runways, corners in a shuffled order; east = OffsetX, north = OffsetY)
const pd = (e, nn, t) => `<PD Num="0"><OffsetX>${e}</OffsetX><OffsetY>${nn}</OffsetY><OffsetZ>0.000</OffsetZ><Type>${t}</Type></PD>`;
const pdx = '<PDRecords>' + [pd(7000, 100, 8), pd(-1000, 0, 8), pd(7000, 0, 8), pd(-1000, 100, 8), pd(500, 300, 9), pd(0, 5000, 3), pd(500, 1000, 8), pd(6500, 1000, 8), pd(6500, 1060, 8), pd(500, 1060, 8)].join('') + '</PDRecords>';
const phd = '<PHDRecords><PHD Num="0"><ObjIdx>1</ObjIdx><Type>8</Type><PointCount>5</PointCount><FirstPtIdx>0</FirstPtIdx><RunwayNumber>0</RunwayNumber></PHD><PHD Num="1"><ObjIdx>1</ObjIdx><Type>1</Type><PointCount>1</PointCount><FirstPtIdx>5</FirstPtIdx><RunwayNumber>0</RunwayNumber></PHD><PHD Num="2"><ObjIdx>1</ObjIdx><Type>8</Type><PointCount>4</PointCount><FirstPtIdx>6</FirstPtIdx><RunwayNumber>1</RunwayNumber></PHD></PHDRecords>';
const rr = parseRunways(phd, pdx);
ok('runway rectangles: two found (the taxi path and a wrong number of corners are skipped)', rr.length === 2 && rr[0].id === 0 && rr[1].id === 1, JSON.stringify(rr));
ok('length and width from the corners, whatever their order', Math.round(rr[0].len) === 8000 && Math.round(rr[0].wid) === 100 && Math.round(rr[1].len) === 6000 && Math.round(rr[1].wid) === 60, JSON.stringify(rr));
ok('heading of the long side', Math.round(rr[0].hdg) === 90, JSON.stringify(rr[0]));
const atc2 = parseAtc('# CampID\n1784\n# RUNWAY: 0 HDG:085 QFU:09\n# RUNWAY: 0 HDG:265 QFU:27\n# RUNWAY: 1 HDG:265 QFU:27\n# RUNWAY: 1 HDG:085 QFU:09\n');
ok('atc: the database runway number of each end', atc2.ends.map(e => e.id).join('') === '0011', JSON.stringify(atc2.ends));
const rl = runwayLengths([atc2], { 1784: rr });
ok('length by end number (parallel runways: the first listed wins) and the longest runway', rl[1784].ends['09'].ft === 8000 && rl[1784].ends['27'].ft === 8000 && rl[1784].max.ft === 8000 && rl[1784].max.w === 100, JSON.stringify(rl));
ok('no runway data: nothing', Object.keys(runwayLengths([atc2], {})).length === 0);
console.log(bad ? `${bad} of ${n} AIP checks failed` : `OK - ${n} AIP/ATC checks`);
process.exit(bad ? 1 : 0);
