// ROE / SOP (core/roesop.js): the text on the card, the check of what comes from outside, several presets together
import {
  smartSop,
  smartSopLines,
  smartLink,
  agCovers,
  rulesSet,
  cleanRules,
  ruleSame,
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
  const tu = r1.items.find(i => i.id == 'turns');
  ok(
    'IMC at the fields: Recovery STAR (WX), Departure SID (WX) even without a choice, Break SINGLE SHIP, Formation landing PROHIBITED, turns CALLED (IMC wins over the enemy) ' +
      ids(r1),
    rec &&
      /STAR/.test(rec.txt) &&
      rec.tag == 'WX' &&
      dep &&
      /SID/.test(dep.txt) &&
      br &&
      /SINGLE SHIP/.test(br.txt) &&
      fl &&
      /PROHIBITED$/.test(fl.txt) &&
      tu &&
      /CALLED/.test(tu.txt) &&
      ['dep', 'rec'].includes(r1.items[0].id)
  );
  const r2 = smartSop(sel, { wxArr: true, enemy: true }),
    f2 = id => (r2.items.find(i => i.id == id) || {}).txt || '';
  ok(
    'marginal weather at the landing field: Recovery RADAR TRAIL, Break STRAIGHT-IN; over the enemy: turns SILENT; night: formation landing stays ' +
      ['rec', 'brk', 'turns'].map(f2).join(' | '),
    /RADAR TRAIL/.test(f2('rec')) &&
      /STRAIGHT-IN/.test(f2('brk')) &&
      /SILENT/.test(f2('turns')) &&
      /XW<15KT/.test((smartSop(sel, { night: true }).items.find(i => i.id == 'formland') || {}).txt || '')
  );
  ok(
    'night: the Night phase comes in (NVG); over the enemy CSAR is the first Emergency',
    r1.items.some(i => i.id == 'nvg') && r1.emerg[0].id == 'csar'
  );
  const man = smartSop(
    { ...sel, mode: 'man', sop: { ...sel.sop, rec: { o: 'ovhd', s: true } } },
    { imcArr: true, night: true }
  );
  ok(
    'SOP MANUAL: only the topics ticked Smart, as chosen (OVERHEAD in IMC, no Night phase); nothing to fill ' +
      ids(man),
    ids(man) == 'rec gawe' &&
      /OVERHEAD/.test(man.items[0].txt) &&
      !man.fill.length &&
      !man.emerg.length &&
      smartLink({ ...sel, mode: 'man' }, 'rec', { imcArr: true }) === null
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
    'ROE MANUAL: the A-A block is not written',
    roeText({ ...msn, manroe: true }) == '' && roeKey({ ...msn, manroe: true }).wpn == ''
  );
  ok(
    'the switches are kept, a new choice gets ROE and SOP AUTO; Adapt to mission off (before beta.19) gives ROE and SOP MANUAL',
    JSON.stringify([cleanSel({}).mode, cleanSel({}).manroe]) == '["auto",false]' &&
      cleanSel({ mode: 'man', manroe: true }).mode == 'man' &&
      JSON.stringify([
        cleanSel({ adapt: false }).mode,
        cleanSel({ adapt: false }).manroe,
        'adapt' in cleanSel({ adapt: false }),
      ]) == '["man",true,false]'
  );
  // the rules changed by the pilot (the table of the page): a value of his own, a topic left out, a topic made fixed; bad data dropped
  rulesSet({
    rec: { tier: 'A', fx: true, c: { imcArr: { t: 'PAR APPROACH' } } },
    nvg: { tier: 'B', fx: false, c: { night: 'out' } },
    gawe: { tier: 'C', fx: true, c: {} },
    nothere: { tier: 'A', fx: true, c: {} },
  });
  const r3 = smartSop(sel, { imcArr: true, night: true }),
    t3 = id => (r3.items.find(i => i.id == id) || {}).txt || '';
  ok(
    'changed rules: Recovery with its own text in IMC, NVG left out at night ' + ids(r3),
    /PAR APPROACH/.test(t3('rec')) && !r3.items.some(i => i.id == 'nvg')
  );
  ok(
    'changed rules are checked: unknown topics, conditions and values go; a row like the default is the default',
    JSON.stringify(
      cleanRules({ x: 1, rec: { tier: 'Z', c: { moon: 'in', night: 'maybe', imcArr: { o: 'inst' } } } })
    ) == '{"rec":{"tier":"C","fx":false,"c":{"imcArr":{"o":"inst"}}}}' &&
      ruleSame('ops', { tier: 'B', fx: true, c: { enemy: 'in' } }) &&
      !ruleSame('ops', { tier: 'A', fx: true, c: { enemy: 'in' } })
  );
  rulesSet({});
  ok(
    'back to the defaults',
    /SILENT/.test((smartSop(sel, { enemy: true }).items.find(i => i.id == 'turns') || {}).txt || '')
  );
  ok(
    'the choices of a list in the order of the list, not of the clicks',
    JSON.stringify(cleanSel({ roe: { abort: ['cms', 'winch', 'bingo'] } }).roe.abort) == '["bingo","winch","cms"]'
  );
  const ag1 = { ...emptySel(), roe: { ...emptySel().roe, restr: ['minrls'], extra: ['pid'] } };
  ok(
    'a rule the A-G block writes is not written twice; a SEAD block does not write the release altitude nor the PID ' +
      roeText({ ...ag1, ag: { kind: 'SEAD', mra: null, abort: null, night: false, ceil: null } }).replace(/\n/g, ' | '),
    agCovers({ ...ag1, ag: { kind: 'POP-UP', mra: 2200 } }, 'minrls') &&
      !/MIN RLS 15K/.test(
        roeText({ ...ag1, ag: { kind: 'POP-UP', mra: 2200, abort: 350, night: false, ceil: null } })
      ) &&
      /MIN RLS 15K/.test(roeText({ ...ag1, ag: { kind: 'SEAD', mra: null, abort: null, night: false, ceil: null } })) &&
      /PID BEF RLS/.test(roeText({ ...ag1, ag: { kind: 'SEAD', mra: null, abort: null, night: false, ceil: null } })) &&
      /MIN RLS 15K/.test(
        roeText({ ...ag1, manroe: true, ag: { kind: 'POP-UP', mra: 2200, abort: 350, night: false, ceil: null } })
      )
  );
  const K = roeKey(sel);
  ok(
    'the key box: WPN TIGHT, ID, no commit set ' + JSON.stringify(K),
    K.wpn == 'TIGHT' && K.id.length > 0 && K.commit == ''
  );
}
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} ROE / SOP checks`);
process.exit(bad ? 1 : 0);
