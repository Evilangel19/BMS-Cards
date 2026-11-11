// ROE / SOP (core/roesop.js): the text on the card, the check of what comes from outside, several presets together
import { ROE, SOP_TOPICS, cardText, cleanSel, mergeSel, cleanPresets, emptySel } from '../app/js/core/roesop.js';
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
ok('nothing chosen: nothing on the card', cardText(emptySel()) === '');
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
const t = cardText(a);
ok(
  'the card text: ROE, the SOP topics on the card (the one typed by hand too), the free lines\n' + t,
  t ==
    'ROE: WPN TIGHT · ID: AWACS DECLARE+L16 · COMMIT 40NM · BUGOUT: BINGO/WINCH · NO FIRE IN FRND MEZ\nSOP: LTS: FLASH MOVING · T/O: 20S · REC: Spiral down\nDivert: Osan'
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
const m = mergeSel([
  { roe: { ws: 'free', id: ['vid'] }, sop: { lights: { o: 'start', c: true } }, free: 'A' },
  { roe: { ws: 'hold', id: ['l16', 'vid'] }, sop: { lights: { o: 'hold' } }, free: 'A\nB' },
]);
ok(
  'two presets: the last weapons status wins, the ID lists are joined, the topic of the last preset stays on the card, the free lines once ' +
    JSON.stringify(m),
  m.roe.ws == 'hold' && m.roe.id.join() == 'vid,l16' && m.sop.lights.o == 'hold' && m.sop.lights.c && m.free == 'A\nB'
);
const P = cleanPresets([{ name: '  Strike ', sel: a }, { name: '' }, null, { name: 'x'.repeat(60), sel: {} }]);
ok('presets: names checked, empty ones dropped', P.length == 2 && P[0].name == 'Strike' && P[1].name.length == 40);
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} ROE / SOP checks`);
process.exit(bad ? 1 : 0);
