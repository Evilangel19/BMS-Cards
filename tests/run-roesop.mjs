// ROE / SOP (core/roesop.js): the text on the card, the check of what comes from outside, several presets together
import {
  ROE,
  SOP_TOPICS,
  roeText,
  sopText,
  cleanSel,
  cleanPresets,
  emptySel,
  cleanSqPresets,
  capSel,
  pickDefault,
} from '../app/js/core/roesop.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const ids = SOP_TOPICS.map(t => t[0]);
ok('every SOP topic has its own id', new Set(ids).size == ids.length);
ok(
  'every option has a long and a short text',
  [...ROE.map(r => r[4]), ...SOP_TOPICS.map(t => t[3])].every(o => o.every(p => p[0] && p[1] && p[2]))
);
ok('nothing chosen: nothing on the card', roeText(emptySel()) === '' && sopText(emptySel()) === '');
const a = {
  roe: { ws: 'tight', id: ['awacs', 'l16'], commit: 'n40', abort: ['bingo', 'winch'], extra: ['mez'] },
  sop: {
    lights: { o: 'move', c: true },
    takeoff: { o: 's20', c: true },
    dep: { o: 'combat', c: false },
    rec: { t: 'Spiral down', c: true },
  },
  free: 'Divert: Osan',
};
a.sfree = 'Overhead 1500 MSL';
const t1 = roeText(a),
  t2 = sopText(a);
ok(
  'the ROE box: one rule a line, then the other ROE lines\n' + t1,
  t1 == 'WPN TIGHT\nID: AWACS DECLARE+L16\nCOMMIT 40NM\nBUGOUT: BINGO/WINCH\nNO FIRE IN FRND MEZ\nDivert: Osan'
);
ok(
  'the SOP box: the topics ticked for the card (the own text too), then the other SOP lines\n' + t2,
  t2 == 'GND: FLASH MOVING\nT/O: 20S\nREC: Spiral down\nOverhead 1500 MSL'
);
const c = cleanSel({
  roe: { ws: 'nuke', id: ['vid', 'x', 'vid'] },
  sop: { lights: { o: 'zz', t: '' }, bogus: { o: 'a' } },
  free: 5,
});
ok(
  'what comes from outside is checked: unknown values dropped, no repeats ' + JSON.stringify(c),
  c.roe.ws === null && c.roe.id.join() == 'vid' && !c.sop.lights && !c.sop.bogus && c.free == '5'
);
const P = cleanPresets([{ name: '  Strike ', sel: a }, { name: '' }, null, { name: 'x'.repeat(60), sel: {} }]);
ok('presets: names checked, empty ones dropped', P.length == 2 && P[0].name == 'Strike' && P[1].name.length == 40);
const SQ = cleanSqPresets([
  { name: 'A-A', sel: { roe: { ws: 'free' } }, cats: ['Defensive Counter Air', 'Nope'] },
  { name: 'Base', sel: { sop: { lights: { o: 'move', c: true } } }, cats: ['Defensive Counter Air', 'Airstrike'] },
]);
ok('squadron presets: unknown mission categories dropped', SQ[0].cats.join() == 'Defensive Counter Air');
{
  const b = sopText({
    sop: {
      takeoff: { o: 's20', c: true },
      power: { o: 'ab', c: true },
      dep: { o: 'combat', c: true },
      rec: { o: 'tac', c: true },
      brk: { o: '3', c: true },
      lost: { o: 'std', c: false },
    },
  });
  ok(
    'the topics of a phase on one line, a word before the ones that would not read alone\n' + b,
    b == 'T/O: 20S · AB · DEP COMBAT\nREC: TAC INITIAL · BRK 3S'
  );
  const many = { sop: {} };
  ['lights', 'takeoff', 'form2', 'fuel', 'rec', 'nlights', 'lost'].forEach(
    (id, i) => (many.sop[id] = { o: SOP_TOPICS.find(t => t[0] == id)[3][0][0], c: true })
  );
  const cap = capSel(many);
  ok(
    'capSel: seven phases on the card are cut to 5 lines (the last phases lose the tick)',
    sopText(cap).split('\n').length == 5 && !cap.sop.lost.c && !cap.sop.nlights.c
  );
}
{
  const T = { roe: { ws: 'tight' } },
    D = { roe: { ws: 'free' } },
    M = { roe: { ws: 'hold' } };
  const sq = [
    { name: 'Std', sel: T, std: true },
    { name: 'DCA', sel: D, cats: ['Defensive Counter Air'] },
  ];
  const mine = [{ name: 'Mine', sel: M, cats: ['Defensive Counter Air'] }];
  const ws = r => (r ? r.k + ':' + r.sel.roe.ws : 'none');
  const got = [
    ws(pickDefault({ sq, mine, src: 'sq', cat: 'Defensive Counter Air' })),
    ws(pickDefault({ sq, mine, src: 'sq', cat: 'Airstrike' })),
    ws(pickDefault({ sq, mine, src: 'me', cat: 'Defensive Counter Air' })),
    ws(pickDefault({ sq, mine, src: 'me', cat: 'Airstrike' })),
    ws(pickDefault({ sq: [], mine, myStd: T, src: 'sq', cat: 'Defensive Counter Air' })),
    ws(pickDefault({ sq: [], mine: [], myStd: null, src: 'me', cat: 'CAS' })),
  ].join(' ');
  ok(
    'the default of a flight: the list of the button wins (its preset for the kind of mission), else the Standard; nothing set, nothing\n' +
      got,
    got == 'q1:free std:tight m0:hold std:tight m0:hold none'
  );
  const L = cleanSqPresets([
    { name: '104 A-G', sel: T },
    { name: '104 A-G (sq) (sq)', sel: T },
    { name: 'X (sq)', sel: D },
  ]);
  ok(
    'the copies made back and forth go: same name without " (sq)", same choices; a free name loses " (sq)"; the first is the Standard ' +
      JSON.stringify(L.map(p => [p.name, p.std])),
    JSON.stringify(L.map(p => [p.name, p.std])) == '[["104 A-G",true],["X",false]]'
  );
}
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} ROE / SOP checks`);
process.exit(bad ? 1 : 0);
