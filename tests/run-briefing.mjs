// The rules of the Briefing room (core/briefroom.js): distances and bearings of the ruler, roles and who leads the room, the drawings that come from the network.
import {
  NM,
  dist,
  brg,
  dest,
  pad3,
  fmtNm,
  fmtKm,
  fmtFt,
  roleOf,
  listOrder,
  nextBriefer,
  roomNewer,
  canDraw,
  cleanObj,
  shiftObj,
  pilotColour,
} from '../app/js/core/briefroom.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};
// ---- the ruler: Osan to Kunsan
const osan = [37.09, 127.03],
  kunsan = [35.9, 126.62];
const d = dist(osan, kunsan);
ok(Math.abs(d / NM - 74.2) < 0.5, 'Osan - Kunsan about 74 NM: ' + (d / NM).toFixed(1));
ok(Math.abs(brg(osan, kunsan) - 195) < 2, 'bearing about 195 true: ' + brg(osan, kunsan).toFixed(1));
const p = dest(osan, 90, 60 * NM);
ok(Math.abs(dist(osan, p) / NM - 60) < 0.01 && Math.abs(brg(osan, p) - 90) < 0.5, 'a point 60 NM east and back');
ok(pad3(5) === '005' && pad3(360) === '000' && pad3(-10) === '350', 'bearings with three digits');
ok(fmtNm(34.9 * NM) === '34.9 NM' && fmtNm(250 * NM) === '250 NM', 'NM: ' + fmtNm(34.9 * NM));
ok(fmtKm(64700) === '64.7 km' && fmtFt(64700) === '212 300 ft', 'km and ft: ' + fmtKm(64700) + ' ' + fmtFt(64700));
// ---- roles: who may lead the room
const q = { owner: 'A', mc: 'B', leader: '' },
  ov = {
    packages: [{ id: 'p', lead: 'C', flights: [{ id: 'f', lead: 'D', members: ['D', 'E'] }] }],
    seat: { D: { pk: 'p', fl: 'f' }, E: { pk: 'p', fl: 'f' } },
  };
const R = u => roleOf(q, ov, u);
ok(R('A').role === 'Commander' && R('A').lead, 'the commander leads');
ok(R('B').role === 'Mission commander' && R('B').lead, 'the mission commander leads');
ok(R('C').role === 'Package lead' && R('C').lead, 'the package lead leads');
ok(R('D').role === 'Flight lead' && R('D').lead, 'the flight lead leads');
ok(R('E').role === 'Wingman' && !R('E').lead, 'a wingman does not');
ok(R('F').role === 'Pilot' && !R('F').lead, 'a pilot in no flight does not');
ok(
  roleOf({ owner: 'A', leader: 'G' }, { packages: [], seat: {} }, 'G').lead,
  'without flights the mission leader leads'
);
// ---- the briefer: the leader who came in first; the room of the briefer wins
const M = [
  { uid: 'E', lead: false, joined: 1 },
  { uid: 'D', lead: true, joined: 5 },
  { uid: 'C', lead: true, joined: 3 },
];
ok(nextBriefer(M) === 'C', 'the leader who came in first');
ok(nextBriefer([{ uid: 'E', lead: false, joined: 1 }]) === null, 'no leader: no briefer');
const room = { briefer: 'C', pens: ['E'] };
ok(
  listOrder(room, 'D', [
    { uid: 'F', n: 'Zed' },
    { uid: 'E', n: 'Bob' },
    { uid: 'D', n: 'Me' },
    { uid: 'C', n: 'Lead', lead: true },
  ])
    .map(m => m.uid)
    .join('') === 'CEDF',
  'list: briefer, pen, me, the others'
);
ok(
  canDraw(room, 'C') && canDraw(room, 'E') && !canDraw(room, 'D') && !canDraw(room, ''),
  'who can draw: the briefer and the pens'
);
ok(
  roomNewer({ v: 2 }, { v: 3 }) && !roomNewer({ v: 3 }, { v: 2 }) && !roomNewer({ v: 1 }, null),
  'the newer room wins'
);
// ---- the drawings that come from the network are checked
ok(cleanObj({ id: 'a', k: 'line', a: [37, 127], b: [38, 128], col: '#ff0000', w: 3 }) !== null, 'a line is kept');
ok(cleanObj({ id: 'a', k: 'line', a: [37, 127] }) === null, 'a line without its end is refused');
ok(cleanObj({ id: 'a', k: 'script', at: [37, 127] }) === null, 'an unknown kind is refused');
ok(cleanObj({ id: 'a', k: 'pen', pts: [[37, 'x']] }) === null, 'points that are not numbers are refused');
ok(
  cleanObj({ id: 'a', k: 'line', a: [37, 127], b: [38, 128], col: 'red;x' }).col === '#ffffff',
  'a colour that is not #rrggbb becomes white'
);
const t = cleanObj({ id: 'a', k: 'text', at: [37, 127], txt: 'x'.repeat(2000), size: 99, by: '<b>' });
ok(t.txt.length === 600 && t.size === 40, 'a text is cut to 600 letters, its size to 40');
const tr = cleanObj({ id: 't', k: 'trk', at: [37, 127], hdg: -90, side: 'evil', cs: 'BANDIT', fl: 300, spd: 450 });
ok(tr.hdg === 270 && tr.side === 'unknown' && tr.fl === 300, 'a track: heading 0-359, an unknown side becomes unknown');
const s = shiftObj(
  {
    id: 'a',
    k: 'pen',
    pts: [
      [37, 127],
      [37.1, 127.1],
    ],
  },
  1,
  2
);
ok(s.pts[1][0] === 38.1 && s.pts[1][1] === 129.1, 'moving a drawing moves every point');
ok(pilotColour('abc') === pilotColour('abc') && /^#[0-9a-f]{6}$/.test(pilotColour('x')), 'a pilot keeps his colour');

console.log(bad ? `run-briefing.mjs: ${bad} of ${n} FAILED` : `run-briefing.mjs: OK - ${n} checks`);
if (bad) process.exit(1);
