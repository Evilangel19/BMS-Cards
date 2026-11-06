// IFF codes per seat (core/iffseat.js) and where the round buttons of the seat sit (core/seatgeo.js).
import { IFF_BLOCKS, iffModes, iffSeatEdits, seatIffCode } from '../app/js/core/iffseat.js';
import { SEAT_PAD, seatBtn, seatCell, seatIndent, seatShift } from '../app/js/core/seatgeo.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const map = o => k => (k in o ? o[k] : '');

// ---- the code of each aircraft, from the code of the DTC
ok('blocks of the IFF file', IFF_BLOCKS.join() === '4,24,44');
ok(
  'flight 1 (block 24): the four aircraft are the code with its low two bits',
  [0, 1, 2, 3].map(s => seatIffCode('4730', 0, s)).join() === '4730,4731,4732,4733'
);
ok(
  'the high bits of the code stay as they are',
  seatIffCode('1330', 0, 1) === '1331' && seatIffCode('7330', 0, 3) === '7333'
);
ok(
  'a code of the second flight of the package (28 = 24 + 4)',
  seatIffCode('4734', 1, 2) === '4736' && seatIffCode('4734', 1, 0) === '4734'
);
ok('blocks 4 and 44', seatIffCode('7504', 0, 3) === '7507' && seatIffCode('7054', 0, 2) === '7056');
ok('the code of another flight is not touched', seatIffCode('4730', 1, 2) === '' && seatIffCode('4734', 0, 2) === '');
ok(
  'not a code: empty, not octal, too long, outside the blocks',
  ['', '49', '47301', 'abc', '4700'].every(c => seatIffCode(c, 0, 1) === '')
);
ok(
  'one code for all the aircraft (setting 1): the code itself, padded; any other setting: nothing',
  seatIffCode('3', 0, 2, 1) === '0003' && seatIffCode('4730', 3, 2, 1) === '4730' && seatIffCode('4730', 0, 2, 2) === ''
);
{
  let same = true;
  for (const c of ['1330', '4730', '7504', '7054', '2354', '6254', '5740'])
    for (const fi of [0, 1, 2, 3, 4])
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) {
          const x = seatIffCode(c, fi, a);
          if (x && seatIffCode(x, fi, b) !== seatIffCode(c, fi, b)) same = false;
        }
  ok(
    'rewriting a code for one seat and reading it back for another give the same code (the DTC and the card never fight)',
    same
  );
}

// ---- the lines of the IFF section for a seat
const IFF = {
  'Mode2 Code': '1330',
  'Mode3A Code': '4730',
  'TIME 0 Mode3A Code': '7054',
  'TIME 0 Criteria': '1700',
  'TIME 1 Mode3A Code': '2354',
  'TIME 1 Criteria': '1800',
  'TIME 2 Mode3A Code': '7504',
  'TIME 2 Criteria': '1900',
  'TIME 4 Mode3A Code': '6666', // after a gap: not read
};
const e0 = iffSeatEdits(map(IFF), 0, 0);
ok('the DTC of the leader needs nothing for seat 1', e0.length === 0);
const e2 = iffSeatEdits(map(IFF), 0, 2);
ok(
  'seat 3: mode 2, mode 3 and the mode 3 of every time event',
  e2.map(e => e.k + '=' + e.v).join() ===
    'Mode2 Code=1332,Mode3A Code=4732,TIME 0 Mode3A Code=7056,TIME 1 Mode3A Code=2356,TIME 2 Mode3A Code=7506'
);
{
  const after = { ...IFF };
  e2.forEach(e => (after[e.k] = e.v));
  ok('written once, the same seat needs nothing more', iffSeatEdits(map(after), 0, 2).length === 0);
  const back = iffSeatEdits(map(after), 0, 0);
  back.forEach(e => (after[e.k] = e.v));
  ok(
    'and back to the leader gives the original DTC',
    Object.keys(IFF).every(k => after[k] === IFF[k]) && back.length === e2.length
  );
}
ok('the DTC of another flight is left alone', iffSeatEdits(map(IFF), 2, 1).length === 0);
ok(
  'mode 2 not used by the mission: only mode 3',
  iffSeatEdits(map(IFF), 0, 1, { mode2: false }).every(e => /^(Mode3A|TIME)/.test(e.k))
);
ok(
  'one mode 3 code for all (setting 1): nothing to write',
  iffSeatEdits(map({ 'Mode3A Code': '4730' }), 0, 2, { mode2: false, m3set: 1 }).length === 0
);
ok('no mode 3 code in the DTC: nothing', iffSeatEdits(map({}), 0, 3).length === 0);

// ---- the modes the IFF file allows
{
  const fl = { omis: 5, wps: [{ act: 1 }, { act: 2 }] },
    atk = { omis: 5, wps: [{ act: 1 }, { act: 20 }] };
  ok('no IFF file: modes 2 and 4 allowed', iffModes(undefined, fl).a2 === 1 && iffModes(undefined, fl).a4 === 1);
  const P = { pm: { 5: '0204' } };
  ok(
    'a flight without an attack uses the first setting (mode 2 yes, mode 4 no)',
    iffModes(P, fl).a2 === 1 && iffModes(P, fl).a4 === 0
  );
  ok(
    'with an attack step: the second setting (no mode 2, mode 4 no)',
    iffModes(P, atk).a2 === 0 && iffModes(P, atk).a4 === 0
  );
  ok('mode 4 bit', iffModes({ pm: { 5: '0808' } }, fl).a4 === 1);
}

// ---- where the round buttons sit and how far the text of their cell starts
ok(
  'the button of a tall cell is 32 px, of a thin one 24, never under 22',
  seatBtn(41) === 32 && seatBtn(30.4) === 24 && seatBtn(10) === 22 && seatBtn(100) === 32
);
ok('the text starts after pad + button + gap', seatIndent(41) === SEAT_PAD + 32 + 8 && seatIndent(41) === 46);
ok('in card units (the card is 1.28 px per unit across)', Math.abs(seatShift(24) - 46 / 1.28) < 1e-9);
ok(
  'cells with a button: Name of the pilots and Callsign of the flights (Datacard), Name of the pilots and Callsign of the roll call (MDC)',
  seatCell('fl0_0', false) &&
    seatCell('fl3_0', false) &&
    seatCell('pk0_0', false) &&
    seatCell('pk4_0', false) &&
    seatCell('fl3_0', true) &&
    seatCell('rc0_0', true) &&
    seatCell('rc7_0', true)
);
ok(
  'and no other',
  !seatCell('fl4_0', false) &&
    !seatCell('fl4_0', true) &&
    !seatCell('fl0_1', false) &&
    !seatCell('rc0_0', false) &&
    !seatCell('pk0_0', true) &&
    !seatCell('rc0_1', true) &&
    !seatCell('pk5_0', false)
);

console.log(bad ? `${bad} of ${n} checks failed` : `${n} checks passed`);
process.exit(bad ? 1 : 0);
