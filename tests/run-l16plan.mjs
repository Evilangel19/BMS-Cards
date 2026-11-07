// The Link 16 files of a DTC for a flight of a package (core/l16plan.js): callsign letters and number, the slots BMS fills in the order of the package, the changes of the pilot over it.
import {
  L16_EMPTY,
  addRec,
  autoPlan,
  callsignAbbr,
  callsignNumber,
  callsignParts,
  defaultStart,
  diffLines,
  dropFile,
  dropFlight,
  flightStn,
  kindRange,
  l16Edits,
  normStn,
  placeCheck,
  planDiff,
  rangeText,
  resolvePlan,
  slotKey,
  slotName,
  slotOfKey,
  slotValues,
  startOptions,
} from '../app/js/core/l16plan.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const fl = (cs, stn, k) => ({ cs, stn, n: k });
const txt = s => s.map(c => (c ? c.label : '.')).join(' ');
const vals = s => slotValues(s).join(' ');

// ---- the letters and the number of the callsign
ok(
  'the first and the last letter: Cobra CA, Falcon FN, Jackal JL',
  callsignAbbr('Cobra 3') === 'CA' && callsignAbbr('Falcon 2') === 'FN' && callsignAbbr('Jackal 7') === 'JL'
);
ok(
  'lower case, no number, a name with two words',
  callsignAbbr('cobra') === 'CA' && callsignAbbr('Bear Trap 2') === 'BP'
);
ok('less than two letters: none', callsignAbbr('A 1') === '' && callsignAbbr('') === '' && callsignAbbr('12') === '');
ok(
  'the parts of a callsign',
  JSON.stringify(callsignParts('Cobra 3')) === '{"name":"Cobra","num":3}' &&
    callsignParts('Cobra').num === 0 &&
    callsignParts('Cobra-4').num === 4
);
ok(
  'the number: flight digit + position',
  callsignNumber('Cobra 3', 0) === '31' &&
    callsignNumber('Cobra 3', 3) === '34' &&
    callsignNumber('Falcon 9', 1) === '92'
);
ok(
  'no digit 1..9 (or no seat): no number',
  callsignNumber('Cobra 11', 0) === '' &&
    callsignNumber('Cobra', 0) === '' &&
    callsignNumber('Cobra 0', 0) === '' &&
    callsignNumber('Cobra 3', 4) === ''
);

// ---- the slots
{
  const all = Array.from({ length: 16 }, (_, i) => slotKey('A', i));
  ok(
    'keys of the 16 slots',
    all[0] === 'FILE_A_FLIGHT_1_STN' &&
      all[3] === 'FILE_A_FLIGHT_4_STN' &&
      all[4] === 'FILE_A_TEAM_1_STN' &&
      all[7] === 'FILE_A_TEAM_4_STN' &&
      all[8] === 'FILE_A_DONOR_1_STN' &&
      all[15] === 'FILE_A_DONOR_8_STN' &&
      slotKey('B', 5) === 'FILE_B_TEAM_2_STN'
  );
  ok(
    'a key gives its slot back',
    all.every((k, i) => slotOfKey(k).slot === i && slotOfKey(k).file === 'A') &&
      slotOfKey('FILE_B_DONOR_8_STN').slot === 15
  );
  ok(
    'not slot keys',
    [
      'FILE_A_FLIGHT_5_STN',
      'FILE_A_DONOR_9_STN',
      'FILE_A_TEAM_0_STN',
      'FILE_C_TEAM_1_STN',
      'FILE_A_CALLSIGN',
      'FILE_A_TEAM_1_STNX',
    ].every(k => slotOfKey(k) === null)
  );
  ok(
    'names of the slots',
    slotName(0) === 'Flight 1' && slotName(4) === 'Team 1' && slotName(8) === 'Donor 1' && slotName(15) === 'Donor 8'
  );
  ok('ranges', kindRange('team').join() === '4,8' && kindRange('donor').join() === '8,16');
}
ok(
  'a STN as the file writes it',
  normStn('35141') === '35141' &&
    normStn('501') === '00501' &&
    normStn('') === '00000' &&
    normStn(' 7 ') === '00007' &&
    normStn('x1') === 'x1'
);
ok(
  'the STN of a flight from a card value',
  flightStn('35141') === '3514' &&
    flightStn('5011') === '0501' &&
    flightStn('---') === '' &&
    flightStn('') === '' &&
    flightStn('351') === ''
);

// ---- the plan BMS makes
const A = fl('Cobra 3', '3514', 4),
  B = fl('Falcon 2', '6146', 2),
  C = fl('Jackal 7', '4343', 2),
  D = fl('Plasma 5', '1733', 4),
  E = fl('Satan 1', '2110', 3);
ok(
  'a package of one flight of 4: slots 1-4',
  txt(autoPlan([A], 'Cobra 3')) === 'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 . . . . . . . . . . . .'
);
ok(
  'the STN of an aircraft is the STN of the flight and its position',
  vals(autoPlan([A], 'Cobra 3')).startsWith('35141 35142 35143 35144 00000')
);
ok(
  'two flights of two: 1-2 and 5-6, not 1-4',
  txt(autoPlan([A.n ? fl('Cobra 3', '3514', 2) : A, B], 'Cobra 3')) ===
    'Cobra 3-1 Cobra 3-2 . . Falcon 2-1 Falcon 2-2 . . . . . . . . . .'
);
ok(
  'three full flights: slots 1-8 and the donors 1-4',
  autoPlan([A, D, fl('Hammer 6', '1234', 4)], 'Cobra 3').filter(Boolean).length === 12 &&
    autoPlan([A, D, fl('Hammer 6', '1234', 4)], 'Cobra 3')[8].label === 'Hammer 6-1' &&
    autoPlan([A, D, fl('Hammer 6', '1234', 4)], 'Cobra 3')[11].label === 'Hammer 6-4'
);
ok(
  'the own flight first, the others in the order of the package',
  txt(autoPlan([B, A, C], 'Cobra 3')) ===
    'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 Falcon 2-1 Falcon 2-2 . . Jackal 7-1 Jackal 7-2 . . . . . .'
);
ok(
  'a flight of 3: three slots of its block',
  txt(autoPlan([A, E], 'Cobra 3')).endsWith('Satan 1-1 Satan 1-2 Satan 1-3 . . . . . . . . .')
);
ok(
  'more than four flights: four blocks, the rest does not fit',
  autoPlan([A, B, C, D, E], 'Cobra 3')
    .filter(Boolean)
    .every(c => c.cs !== 'Satan 1') && autoPlan([A, B, C, D, E], 'Cobra 3')[12].cs === 'Plasma 5'
);
ok(
  'the own flight has no STN: the others start at slot 5',
  txt(autoPlan([B], 'Cobra 3')) === '. . . . Falcon 2-1 Falcon 2-2 . . . . . . . . . .'
);
ok(
  'nothing in the package: nothing',
  autoPlan([], 'Cobra 3').every(c => c === null)
);
ok(
  'the cells say they are automatic',
  autoPlan([A], 'Cobra 3')
    .filter(Boolean)
    .every(c => c.src === 'auto')
);

// ---- the changes of the pilot
const pk = [A, D, B, C]; // own Cobra 3 (4), Plasma 5 (4), Falcon 2 (2), Jackal 7 (2)
const res = recs => resolvePlan('A', pk, 'Cobra 3', recs);
const put = (cs, stn, k, s, m, a = 'A') => ({ k: 'put', a, cs, stn, n: k, s, m });
ok(
  'no change: the plan of BMS (own 1-4, Plasma 5-8, Falcon 9-10, Jackal 13-14)',
  txt(res([])) ===
    'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 Plasma 5-1 Plasma 5-2 Plasma 5-3 Plasma 5-4 Falcon 2-1 Falcon 2-2 . . Jackal 7-1 Jackal 7-2 . .'
);
ok(
  'file B is empty',
  resolvePlan('B', pk, 'Cobra 3', []).every(c => c === null)
);
{
  const r = res([put('Falcon 2', '6146', 2, 4, 'l')]);
  ok(
    'the leader of Falcon 2 over the Team (slot 5): the flight that was there (Plasma 5) loses all its slots',
    txt(r) === 'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 Falcon 2-1 . . . . . . . Jackal 7-1 Jackal 7-2 . .'
  );
  ok(
    'and Falcon 2 left its old place (a flight is in the plan once)',
    r.filter(c => c && c.cs === 'Falcon 2').length === 1
  );
  ok('the cell put by the pilot says so', r[4].src === 'add' && r[0].src === 'auto');
}
{
  const r = res([put('Jackal 7', '4343', 2, 6, 'a')]);
  ok(
    'all the aircraft of Jackal 7 from the slot 7 do not fit in the Team (checked by placeCheck); in the plan they still go where the record says',
    r[6].label === 'Jackal 7-1' && r[7].label === 'Jackal 7-2' && r[4] === null && r[5] === null
  );
}
{
  const r = res([put('Plasma 5', '1733', 4, 9, 'a')]);
  ok(
    'Plasma 5 (4) from Donor 2 (slot 10): it takes 10-13; Falcon 2 and Jackal 7 touched by it are taken out whole',
    txt(r) === 'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 . . . . . Plasma 5-1 Plasma 5-2 Plasma 5-3 Plasma 5-4 . . .'
  );
}
{
  const r = res([put('Satan 1', '2110', 3, 8, 'l')]);
  ok(
    'the leader only over a full donor flight: the other slots of that flight are emptied',
    txt(r) ===
      'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 Plasma 5-1 Plasma 5-2 Plasma 5-3 Plasma 5-4 Satan 1-1 . . . Jackal 7-1 Jackal 7-2 . .'
  );
}
{
  const r = res([put('Satan 1', '2110', 3, 12, 'a')]);
  ok(
    'a flight of 3 over a flight of 2 (Jackal 7): the 2-ship is out, the third slot was free',
    txt(r).endsWith('Falcon 2-1 Falcon 2-2 . . Satan 1-1 Satan 1-2 Satan 1-3 .')
  );
}
{
  const r = res([put('Satan 1', '2110', 4, 9, 'a')]);
  ok(
    'a flight of 4 over the end of Falcon 2 and the start of Jackal 7: both are taken out whole',
    txt(r) ===
      'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 Plasma 5-1 Plasma 5-2 Plasma 5-3 Plasma 5-4 . Satan 1-1 Satan 1-2 Satan 1-3 Satan 1-4 . . .'
  );
}
ok(
  'the own flight cannot be moved or taken out',
  txt(res([put('Cobra 3', '3514', 4, 8, 'a'), { k: 'off', a: 'A', cs: 'Cobra 3' }])) === txt(res([]))
);
ok(
  'a flight taken out leaves its slots empty and the others where they are',
  txt(res([{ k: 'off', a: 'A', cs: 'Plasma 5' }])) ===
    'Cobra 3-1 Cobra 3-2 Cobra 3-3 Cobra 3-4 . . . . Falcon 2-1 Falcon 2-2 . . Jackal 7-1 Jackal 7-2 . .'
);
ok(
  'a record that does not fit (past the last slot) or with a bad STN is ignored',
  txt(res([put('Satan 1', '2110', 3, 15, 'a'), put('Satan 1', '21', 3, 9, 'l')])) === txt(res([]))
);
{
  const r = res([
    { k: 'pin', a: 'A', s: 8, v: '777' },
    { k: 'pin', a: 'A', s: 15, v: '' },
  ]);
  ok(
    'a STN typed by hand stays in its slot (padded), the others are untouched; an empty one is 00000',
    r[8].stn === '00777' && r[8].src === 'pin' && r[15].stn === '00000' && r[4].label === 'Plasma 5-1'
  );
}
ok(
  'the records of file B do not touch file A',
  txt(resolvePlan('A', pk, 'Cobra 3', [put('Satan 1', '2110', 3, 8, 'l', 'B')])) === txt(res([]))
);
{
  const r = resolvePlan('B', pk, 'Cobra 3', [
    put('Plasma 5', '1733', 4, 4, 'a', 'B'),
    put('Jackal 7', '4343', 2, 8, 'l', 'B'),
  ]);
  ok(
    'file B: only what the pilot put in',
    txt(r) === '. . . . Plasma 5-1 Plasma 5-2 Plasma 5-3 Plasma 5-4 Jackal 7-1 . . . . . . .'
  );
}

// ---- checks before a change
ok(
  'team: from slot 5 to 8, within the block',
  placeCheck('team', 4, 4) === '' &&
    placeCheck('team', 7, 1) === '' &&
    placeCheck('team', 6, 3) !== '' &&
    placeCheck('team', 3, 1) !== '' &&
    placeCheck('team', 8, 1) !== ''
);
ok(
  'donor: from slot 9 to 16',
  placeCheck('donor', 8, 8) === '' &&
    placeCheck('donor', 15, 1) === '' &&
    placeCheck('donor', 14, 3) !== '' &&
    placeCheck('donor', 7, 1) !== ''
);
ok('the message names the slot', /Donor 8/.test(placeCheck('donor', 14, 3)) && /Team/.test(placeCheck('team', 6, 3)));

// ---- the preview and the records
{
  const before = res([]),
    after = res([put('Satan 1', '2110', 3, 8, 'l')]),
    d = planDiff(before, after);
  ok(
    'the preview: the slots that change with what was and what will be (Falcon 2 goes out whole)',
    d.length === 2 &&
      d[0].slot === 8 &&
      d[0].from === 'Falcon 2-1' &&
      d[0].to === 'Satan 1-1' &&
      d[1].slot === 9 &&
      d[1].from === 'Falcon 2-2' &&
      d[1].to === ''
  );
  const d2 = planDiff(before, res([put('Satan 1', '2110', 3, 4, 'l')]));
  ok(
    'a leader over a full flight: the slots emptied are in the preview',
    d2.length === 4 && d2[0].to === 'Satan 1-1' && d2[1].to === '' && d2[3].from === 'Plasma 5-4'
  );
  ok('nothing changes: nothing in the preview', planDiff(before, before).length === 0);
}
{
  let r = [];
  r = addRec(r, put('Satan 1', '2110', 3, 8, 'l'));
  r = addRec(r, put('Satan 1', '2110', 3, 12, 'a'));
  ok('the same flight put again in the same file replaces its record', r.length === 1 && r[0].s === 12);
  r = addRec(r, put('Satan 1', '2110', 3, 4, 'l', 'B'));
  ok('another file keeps its own record', r.length === 2);
  r = addRec(r, { k: 'pin', a: 'A', s: 9, v: '1' });
  r = addRec(r, { k: 'pin', a: 'A', s: 9, v: '2' });
  ok('a pin for the same slot replaces the old pin', r.filter(q => q.k === 'pin').length === 1 && r.at(-1).v === '2');
  ok(
    'a flight taken out is dropped from the records (back to the plan)',
    dropFlight(r, 'A', 'Satan 1').every(q => !(q.a === 'A' && q.cs === 'Satan 1')) &&
      dropFlight(r, 'A', 'Satan 1').length === 2
  );
  ok(
    'back to auto for a file: all its records go',
    dropFile(r, 'A').every(q => q.a === 'B') && dropFile(r, 'A').length === 1
  );
  ok(
    'records of nothing are fine',
    dropFlight(undefined, 'A', 'x').length === 0 &&
      dropFile(null, 'A').length === 0 &&
      addRec(undefined, put('X 1', '1111', 1, 8, 'l')).length === 1
  );
}

// ---- the lines of the DTC
{
  const dtc = {
    FILE_A_CALLSIGN: 'MN',
    FILE_A_CALLSIGN_NUMBER: '51',
    FILE_A_FLIGHT_LEAD: '1',
    FILE_A_FLIGHT_1_STN: '72361',
    FILE_A_FLIGHT_2_STN: '72362',
    FILE_A_TEAM_1_STN: '65331',
  };
  const get = k => (k in dtc ? dtc[k] : '');
  const slots = slotValues(res([]));
  const e = l16Edits(get, 'A', { abbr: 'CA', number: '33', seat: 2, slots });
  const m = Object.fromEntries(e.map(x => [x.k, x.v]));
  ok(
    'the identity: letters, number and the flag (not the lead for seat 3)',
    m.FILE_A_CALLSIGN === 'CA' && m.FILE_A_CALLSIGN_NUMBER === '33' && m.FILE_A_FLIGHT_LEAD === '0'
  );
  ok(
    'the slots that change are written (5 digits), the ones that are empty and are not in the file are not',
    m.FILE_A_FLIGHT_1_STN === '35141' &&
      m.FILE_A_FLIGHT_4_STN === '35144' &&
      m.FILE_A_TEAM_1_STN === '17331' &&
      m.FILE_A_DONOR_3_STN === undefined &&
      m.FILE_A_TEAM_4_STN === '17334'
  );
  ok(
    'an empty slot with a STN in the file is emptied',
    l16Edits(k => (k === 'FILE_A_DONOR_1_STN' ? '12345' : ''), 'A', {
      seat: 0,
      slots: Array(16).fill('00000'),
      identity: false,
    })
      .map(x => x.k + '=' + x.v)
      .join() === 'FILE_A_DONOR_1_STN=00000'
  );
  const after = { ...dtc };
  e.forEach(x => (after[x.k] = x.v));
  ok(
    'written once, the same plan needs nothing more',
    l16Edits(k => (k in after ? after[k] : ''), 'A', { abbr: 'CA', number: '33', seat: 2, slots }).length === 0
  );
  ok(
    'the leader: the flag 1; no slots (null): the slots are not touched',
    l16Edits(get, 'A', { abbr: 'MN', number: '51', seat: 0, slots: null }).length === 0 &&
      l16Edits(get, 'A', { seat: 1, slots: null })
        .map(x => x.k + '=' + x.v)
        .join() === 'FILE_A_FLIGHT_LEAD=0'
  );
  ok(
    'no identity: the lines of the callsign are left as they are',
    l16Edits(get, 'A', { abbr: 'CA', number: '33', seat: 3, identity: false, slots: null }).length === 0
  );
  ok(
    'file B has its own keys',
    l16Edits(k => '', 'B', { abbr: 'CA', number: '31', seat: 0, slots: ['11111', ...Array(15).fill('00000')] })
      .map(x => x.k)
      .join() === 'FILE_B_CALLSIGN,FILE_B_CALLSIGN_NUMBER,FILE_B_FLIGHT_LEAD,FILE_B_FLIGHT_1_STN'
  );
  ok(
    'an empty slot value stays comparable with an empty file value (00000 vs nothing)',
    l16Edits(k => '', 'A', { seat: 0, slots: Array(16).fill(L16_EMPTY), identity: false }).length === 0
  );
}

// ---- the menu on the map: where a flight can start, what is there, the default, the lines of the preview
{
  const mk = (cs, stn, n) => ({ cs, stn, n }),
    own = mk('Cobra 3', '3514', 4),
    f2 = mk('Falcon 2', '1234', 4),
    j1 = mk('Jackal 1', '2345', 2),
    plan = autoPlan([own, f2, j1], 'Cobra 3'); // 1-4 Cobra, 5-8 Falcon, 9-10 Jackal
  const t = startOptions('team', 1, plan, 'Zed 9');
  ok(
    'team: 4 places (slots 5-8), each says who is there',
    t.length === 4 && t[0].num === 5 && t[0].who === 'Falcon 2-1' && t[3].who === 'Falcon 2-4' && t[0].name === 'Team 1'
  );
  const d = startOptions('donor', 4, plan, 'Zed 9');
  ok(
    'donor, 4 aircraft: only the first 5 starts fit (9..13), the others are marked as not fitting',
    d.length === 8 && d.filter(x => x.ok).length === 5 && !d[5].ok && d[0].who === 'Jackal 1-1' && d[2].who === ''
  );
  ok(
    'a slot of the flight itself is marked as its own',
    startOptions('team', 1, plan, 'Falcon 2').every(x => x.mine)
  );
  ok(
    'the default is the first run of free slots that holds the flight: 4 aircraft, Jackal in 9-10 -> 11',
    defaultStart('donor', 4, plan, 'Zed 9') === 10
  );
  ok('the default for the leader only: the first free slot (11)', defaultStart('donor', 1, plan, 'Zed 9') === 10);
  ok('team is full: the default is the first one (it will replace)', defaultStart('team', 1, plan, 'Zed 9') === 4);
  ok(
    'a flight that is already in the range stays where it is (Jackal 1 as donor starts at 9); as team it takes the first slot (all are taken: it replaces)',
    defaultStart('donor', 2, plan, 'Jackal 1') === 8 &&
      defaultStart('donor', 1, plan, 'Jackal 1') === 8 &&
      defaultStart('team', 2, plan, 'Jackal 1') === 4
  );
  ok(
    "the flight's own slots count as free: Falcon 2 as team again starts at 5",
    defaultStart('team', 4, plan, 'Falcon 2') === 4
  );
  ok(
    'nothing free for 4 aircraft: the first free slot that fits, else the first slot',
    defaultStart('donor', 4, autoPlan([own, f2, mk('A 1', '1111', 4), mk('B 1', '2222', 4)], 'Cobra 3'), 'Zed 9') === 8
  );
  ok(
    'rangeText counts from 1 and joins runs',
    rangeText([4, 5, 6, 8]) === '5-7, 9' &&
      rangeText([]) === '' &&
      rangeText([8]) === '9' &&
      rangeText([9, 8, 8, 10, 11]) === '9-12'
  );
  // leader only over a full donor flight: the other 3 slots are emptied, and the lines say so
  const withD = resolvePlan('A', [own, f2], 'Cobra 3', [
    { k: 'put', a: 'A', cs: 'Jackal 1', stn: '2345', n: 4, s: 8, m: 'a' },
  ]);
  const after = resolvePlan('A', [own, f2, j1], 'Cobra 3', [
    { k: 'put', a: 'A', cs: 'Jackal 1', stn: '2345', n: 4, s: 8, m: 'a' },
    { k: 'put', a: 'A', cs: 'Zed 9', stn: '5555', n: 1, s: 8, m: 'l' },
  ]);
  const ln = diffLines(planDiff(withD, after));
  ok(
    'leader only over a whole donor flight: slot 9 changes hands, 10-12 are emptied (%s)'.replace('%s', ln.join(' | ')),
    ln.length === 2 && ln[0] === '9: Jackal 1-1 → Zed 9-1' && ln[1] === '10-12: Jackal 1-2 … 1-4 → empty'
  );
  ok(
    'a filled empty slot says "empty →"; nothing changes: no lines',
    diffLines(
      planDiff(
        plan,
        resolvePlan('A', [own, f2, j1], 'Cobra 3', [
          { k: 'put', a: 'A', cs: 'Zed 9', stn: '5555', n: 1, s: 12, m: 'l' },
        ])
      )
    ).join() === '13: empty → Zed 9-1' && diffLines([]).length === 0
  );
  ok(
    'a flight that moves reads as two lines: the places it leaves and the places it takes, each as a run',
    diffLines([
      { slot: 4, from: 'Mako 5-1', to: '' },
      { slot: 5, from: 'Mako 5-2', to: '' },
      { slot: 8, from: '', to: 'Mako 5-1' },
      { slot: 9, from: '', to: 'Mako 5-2' },
    ]).join() === '5-6: Mako 5-1 … 5-2 → empty,9-10: empty → Mako 5-1 … 5-2'
  );
  ok(
    'emptied slots of two flights in a row are one line each (not one run)',
    diffLines([
      { slot: 9, from: 'Cobra 3-4', to: '' },
      { slot: 10, from: 'Falcon 2-1', to: '' },
    ]).join() === '10: Cobra 3-4 → empty,11: Falcon 2-1 → empty'
  );
}

console.log(bad ? `${bad} of ${n} checks failed` : `${n} checks passed`);
process.exit(bad ? 1 : 0);
