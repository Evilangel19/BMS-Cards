// ROE / SOP (core/roesop.js): the text on the card, the check of what comes from outside, several presets together
import {
  smartSop,
  smartSopLines,
  smartLink,
  roeKey,
  tierOf,
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
// ---- the Smart ROE / SOP card: what goes on it, in which order (made-up choices)
{
  const sel = {
    roe: { ws: 'tight', id: ['vid'], abort: [] },
    sop: {
      takeoff: { t: 'ROLL 5S' },
      rec: { o: 'ovhd' },
      formland: { o: 'yes' },
      brk: { o: '2' },
      gawe: { o: null, t: 'G-WARM UP', s: true },
      breakaway: { o: null, t: 'BREAK CALL' },
      nvg: { o: 'std' },
      lost: { o: null, t: 'LOST WG 30 DEG' },
      csar: { o: 'std' },
    },
  };
  const ids = r => r.items.map(i => i.id).join(' ');
  const r0 = smartSop(sel, {});
  ok(
    'a clear day (AUTO): what the pilot wrote first, then the fixed ones by tier (Night not on); the Emergencies apart ' +
      ids(r0) +
      ' | ' +
      r0.emerg.map(e => e.id).join(' '),
    ids(r0).startsWith('breakaway takeoff gawe') &&
      !r0.items.some(i => i.id == 'nvg') &&
      r0.items.some(i => i.id == 'rec') &&
      r0.emerg.map(e => e.id).join(' ') == 'lost csar'
  );
  const r1 = smartSop(sel, { imcArr: true, imcDep: true, night: true, enemy: true });
  const rec = r1.items.find(i => i.id == 'rec'),
    dep = r1.items.find(i => i.id == 'dep'),
    fl = r1.items.find(i => i.id == 'formland'),
    br = r1.items.find(i => i.id == 'brk');
  ok(
    'IMC at the fields: Recovery INSTRUMENT (WX), Departure RADAR TRAIL (WX) even without a choice, Break STRAIGHT-IN, Formation landing NO; first on the list ' +
      ids(r1),
    rec &&
      /INSTRUMENT/.test(rec.txt) &&
      rec.tag == 'WX' &&
      dep &&
      /RADAR TRAIL/.test(dep.txt) &&
      br &&
      /STRAIGHT-IN/.test(br.txt) &&
      fl &&
      /NO$/.test(fl.txt) &&
      r1.items[0].id == 'rec'
  );
  ok(
    'night: the Night phase comes in (NVG); over the enemy CSAR is the first Emergency',
    r1.items.some(i => i.id == 'nvg') && r1.emerg[0].id == 'csar'
  );
  const off = { ...sel, adapt: false };
  ok(
    'Adapt to mission off: Recovery keeps the choice (OVERHEAD), no Night phase',
    /OVERHEAD/.test(smartSop(off, { imcArr: true, night: true }).items.find(i => i.id == 'rec').txt) &&
      smartLink(off, 'rec', { imcArr: true }) === null &&
      !smartSop(off, { night: true }).items.some(i => i.id == 'nvg')
  );
  const man = smartSop({ ...sel, mode: 'man', sop: { ...sel.sop, rec: { o: 'ovhd', s: true } } }, { imcArr: true });
  ok(
    'MANUAL: only the topics ticked Smart, the day changes their value; nothing to fill ' + ids(man),
    ids(man) == 'rec gawe' && /INSTRUMENT/.test(man.items[0].txt) && !man.fill.length && !man.emerg.length
  );
  ok(
    'already right for the day: no change (Recovery straight-in in IMC)',
    smartLink({ ...sel, sop: { rec: { o: 'si' } } }, 'rec', { imcArr: true }) === null
  );
  const L = smartSopLines(r1.items);
  ok(
    'the lines go in the order of the flight, one for each phase ' + JSON.stringify(L.slice(0, 3)),
    L.length > 0 && L.findIndex(l => /^T\/O\| |^DEP\| /.test(l[0])) < L.findIndex(l => /^REC\| /.test(l[0]))
  );
  ok(
    'tiers: BREAKAWAY before G-awareness and intra-flight radio',
    tierOf('breakaway') < tierOf('gawe') && tierOf('breakaway') < tierOf('intra')
  );
  const fa = { kind: 'BARCAP', wpn: 'tight', commit: 40, stop: 20, drop: 15, alt: [25000, 35000] },
    msn = { ...emptySel(), faor: fa };
  ok(
    'the ROE of the mission: WPN and COMMIT of the A-A block; a choice of the pilot replaces them, the other lines stay ' +
      roeText({ ...msn, roe: { ...msn.roe, ws: 'free' } }),
    roeKey(msn).wpn == 'TIGHT' &&
      roeKey({ ...msn, roe: { ...msn.roe, ws: 'free' } }).wpn == 'FREE' &&
      /^WPN FREE\nCOMMIT 40NM\nSTOP/.test(roeText({ ...msn, roe: { ...msn.roe, ws: 'free' } }))
  );
  ok(
    'Manual ROE, or Adapt to mission off: the A-A block is not written',
    roeText({ ...msn, manroe: true }) == '' &&
      roeText({ ...msn, adapt: false }) == '' &&
      roeKey({ ...msn, manroe: true }).wpn == ''
  );
  ok(
    'the switches are kept, an old choice gets AUTO, Adapt on, Manual ROE off',
    JSON.stringify([cleanSel({}).mode, cleanSel({}).adapt, cleanSel({}).manroe]) == '["auto",true,false]' &&
      cleanSel({ mode: 'man', adapt: false, manroe: true }).mode == 'man' &&
      cleanSel({ mode: 'man', adapt: false, manroe: true }).adapt === false
  );
  const K = roeKey(sel);
  ok(
    'the key box: WPN TIGHT, ID, no commit set ' + JSON.stringify(K),
    K.wpn == 'TIGHT' && K.id.length > 0 && K.commit == ''
  );
}
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} ROE / SOP checks`);
process.exit(bad ? 1 : 0);
