// Squadron networking and organisation helpers that need no BMS file (they run in CI): fragments, rosters, avatars, missions arriving over the link, one mission for many pilots, cards
import { medalSvg, rankSvg, medalNames } from '../app/js/core/medals.js';
import {
  MEDALS,
  zip,
  unzip,
  rxBegin,
  rxChunk,
  RX_MAX_CHUNKS,
  RX_MAX_OPEN,
  RX_TTL,
  FR_LIMIT,
  FR_PIECE,
  FR_MAX_PARTS,
  frSplit,
  frJoin,
  avHash,
  syncMsg,
  rosterOut,
  avNeeded,
  avServe,
  avAccept,
  mergeRoster,
  distribute,
  cardText,
  parseCard,
} from '../app/js/core/squadron.js';
let ok = true;
const ck = (n, c) => {
  ok &&= !!c;
  console.log(c ? 'ok  ' : 'FAIL', n);
};
const SQ = await import('../app/js/core/squadron.js');
{
  const png = 'data:image/png;base64,iVBORw0KGgo=',
    m1 = SQ.mergeRoster(
      { a: { uid: 'a', ts: 1 } },
      { a: { uid: 'a', ts: 2, av: png }, b: { uid: 'b', ts: 1, av: 'data:image/svg+xml;base64,AAAA' } }
    );
  ck(
    'mergeRoster: the avatar of a pilot arrives in the roster, a bad picture is dropped',
    m1.roster.a.av == png && m1.roster.b && !m1.roster.b.av
  );
  const m2 = SQ.mergeRoster(m1.roster, { a: { uid: 'a', ts: 3, role: 'x' } });
  ck(
    'mergeRoster: an entry without picture keeps the one already known',
    m2.roster.a.av == png && m2.roster.a.role == 'x'
  );
}
{
  const svgs = MEDALS.map((_, i) => medalSvg(i, 'u'));
  ck(
    'medals: one picture for each of the six medals of the logbook, with the same names',
    svgs.length === 6 &&
      medalNames().join('|') === MEDALS.join('|') &&
      svgs.every((v, i) => v.startsWith('<svg') && v.endsWith('</svg>') && v.includes('aria-label="' + MEDALS[i] + '"'))
  );
  ck(
    'medals: no unfinished tag or placeholder in a picture, gradient ids made unique',
    svgs.every(
      (v, i) =>
        !/undefined|NaN/.test(v) && v.includes('id="mg' + i + 'u"') && (i === 5 || v.includes('url(#mg' + i + 'u)'))
    ) &&
      medalSvg(6) === '' &&
      medalSvg(-1) === ''
  );
  ck(
    'ranks: an insignia for each of the ten ranks, none for an unknown one',
    Array.from({ length: 10 }, (_, r) => rankSvg(r)).every(v => v.startsWith('<svg') && !/undefined|NaN/.test(v)) &&
      rankSvg(10) === '' &&
      rankSvg(-1) === ''
  );
}
// missions arriving over the link: limits on what a pilot can send (synthetic messages)
{
  const rx = {};
  ck('rx: a normal transfer is accepted', !!rxBegin(rx, { id: 'a', n: 2, name: 'M', from: 'P' }, 1000).r);
  ck('rx: a chunk out of range drops the transfer', rxChunk(rx, { id: 'a', i: 5, d: 'x' }, 1001).error && !rx.a);
  ck('rx: an absurd number of chunks is refused', rxBegin(rx, { id: 'b', n: RX_MAX_CHUNKS + 1 }, 1002).error && !rx.b);
  ck(
    'rx: a bad identifier or count is refused',
    rxBegin(rx, { id: '', n: 2 }).error &&
      rxBegin(rx, { id: 'c', n: 1.5 }).error &&
      rxBegin(rx, { id: 'c', n: 0 }).error
  );
  const r2 = {};
  for (let i = 0; i < RX_MAX_OPEN; i++) rxBegin(r2, { id: 'k' + i, n: 1 }, 5000);
  ck('rx: too many transfers at once are refused', rxBegin(r2, { id: 'extra', n: 1 }, 5001).error);
  ck(
    'rx: a transfer that stalls is forgotten, so a new one fits',
    !!rxBegin(r2, { id: 'extra', n: 1 }, 5000 + RX_TTL + 1).r && !r2.k0
  );
  const r3 = {};
  rxBegin(r3, { id: 'x', n: 2, name: 'n'.repeat(500) }, 0);
  ck('rx: a name is cut to a sensible length', r3.x.name.length === 200);
  ck(
    'rx: chunks arrive in any order, a repeated one counts once',
    (() => {
      const a = rxChunk(r3, { id: 'x', i: 1, d: 'b' }, 1);
      const b = rxChunk(r3, { id: 'x', i: 1, d: 'b' }, 2);
      const c = rxChunk(r3, { id: 'x', i: 0, d: 'a' }, 3);
      return !a.done && !b.done && c.done && c.r.parts.join('') === 'ab';
    })()
  );
  ck('rx: a chunk for nobody is ignored', rxChunk({}, { id: 'q', i: 0, d: 'x' }) === null);
  ck(
    'rx: a piece that is not text is refused',
    (() => {
      const t = {};
      rxBegin(t, { id: 'z', n: 1 });
      return !!rxChunk(t, { id: 'z', i: 0, d: 5 }).error;
    })()
  );
  const big = await zip('x'.repeat(200000));
  let tooMuch = false;
  try {
    await unzip(big, 1000);
  } catch (e) {
    tooMuch = true;
  }
  ck('rx: a block that inflates beyond the limit is dropped', tooMuch);
  ck('rx: within the limit it is read in full', (await unzip(big, 300000)).length === 200000);
}
// big squadrons: messages above the size a data channel carries, the roster without pictures, one mission for many pilots
{
  const big = { k: 'sync', roster: { a: { av: 'x'.repeat(300000) } } },
    txt = JSON.stringify(big),
    parts = frSplit(txt);
  ck(
    'fr: a message over 256 KB is split in pieces that each stay far below the limit',
    parts.length > 5 && parts.every(m => JSON.stringify(m).length < FR_LIMIT + 200) && parts[0].d.length === FR_PIECE
  );
  const buf = {};
  let out = null;
  for (const m of [...parts].reverse()) out = frJoin(buf, m) || out;
  ck(
    'fr: the pieces in any order give the message back, and nothing stays in the buffer',
    out && out.roster.a.av.length === 300000 && !Object.keys(buf).length
  );
  ck(
    'fr: a wrong piece is refused (bad id, too many parts, index out of range, not a text), a half message expires',
    frJoin({}, { k: 'fr', id: '', i: 0, n: 1, d: 'x' }) === null &&
      frJoin({}, { k: 'fr', id: 'a', i: 0, n: FR_MAX_PARTS + 1, d: 'x' }) === null &&
      frJoin({}, { k: 'fr', id: 'a', i: 5, n: 2, d: 'x' }) === null &&
      frJoin({}, { k: 'fr', id: 'a', i: 0, n: 1, d: 5 }) === null &&
      (() => {
        const b = {};
        frJoin(b, { k: 'fr', id: 'a', i: 0, n: 2, d: '{' }, 1000);
        frJoin(b, { k: 'fr', id: 'z', i: 0, n: 2, d: '{' }, 1000 + 61000);
        return !b.a && !!b.z;
      })()
  );
  const b2 = {};
  ck(
    'fr: at most four messages are put together at once, a message that is not an object or holds a piece is refused',
    [1, 2, 3, 4, 5].map(i => frJoin(b2, { k: 'fr', id: 'm' + i, i: 0, n: 2, d: '{' })).every(x => x === null) &&
      Object.keys(b2).length === 4 &&
      frJoin({}, { k: 'fr', id: 'p', i: 0, n: 1, d: '5' }) === null &&
      frJoin({}, { k: 'fr', id: 'p', i: 0, n: 1, d: JSON.stringify({ k: 'fr' }) }) === null
  );
  // roster
  const av = n => 'data:image/webp;base64,' + 'A'.repeat(n);
  const mk = (n, size) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => ['u' + i, { uid: 'u' + i, callsign: 'C' + i, ts: 5, av: av(size) }])
    );
  const small = syncMsg({ name: 'S' }, mk(10, 3000)),
    large = syncMsg({ name: 'S' }, mk(50, 9000));
  ck(
    'sync: a small roster travels whole, with the pictures (the form the older programs read)',
    !small.lite && small.roster.u3.av.length > 3000
  );
  ck(
    'sync: a big roster travels without the pictures, each with a fingerprint, and is small',
    large.lite === 1 &&
      !large.roster.u3.av &&
      large.roster.u3.avh === avHash(av(9000)) &&
      JSON.stringify(large).length < 20000
  );
  const mine = mk(50, 9000);
  Object.values(mine).forEach(r => {
    delete r.av;
  });
  const pend = new Map(),
    need = avNeeded(mine, large.roster, pend);
  ck(
    'avatars: every missing picture is asked for once, and not again within the retry time',
    need.length === 50 &&
      avNeeded(mine, large.roster, pend).length === 0 &&
      avNeeded(mine, large.roster, pend, Date.now() + 31000).length === 50
  );
  ck(
    'avatars: a picture already here (same fingerprint) or from a newer entry of mine is not asked',
    avNeeded(mk(50, 9000), large.roster).length === 0 &&
      avNeeded(Object.fromEntries(Object.entries(mine).map(([k, r]) => [k, { ...r, ts: 9 }])), large.roster).length ===
        0
  );
  const served = avServe(mk(50, 9000), ['u1', 'u2', 'nobody', 7]);
  ck(
    'avatars: a request is answered for the pilots known, one message each, 100 at most',
    served.length === 2 &&
      served[0].k === 'av' &&
      avServe(
        mk(300, 10),
        Array.from({ length: 300 }, (_, i) => 'u' + i)
      ).length === 100
  );
  const r1 = { u1: { uid: 'u1', ts: 5 } };
  ck(
    'avatars: a picture is taken only if it is a picture, is the announced one and belongs to the roster',
    !avAccept(r1, { uid: 'u1', av: 'javascript:1', h: avHash('javascript:1') }) &&
      !avAccept(r1, { uid: 'u1', av: av(10), h: 'bad' }) &&
      !avAccept(r1, { uid: 'u9', av: av(10), h: avHash(av(10)) }) &&
      avAccept(r1, { uid: 'u1', av: av(10), h: avHash(av(10)) }) &&
      r1.u1.av === av(10)
  );
  const m = mergeRoster(
    { u1: { uid: 'u1', ts: 1, av: av(10) } },
    { u1: { uid: 'u1', ts: 2, avh: 'abc', callsign: 'N' } }
  );
  ck(
    'roster: the fingerprint is not stored and the picture already held stays',
    m.roster.u1.callsign === 'N' && !('avh' in m.roster.u1) && m.roster.u1.av === av(10)
  );
  ck(
    'roster: rosterOut keeps the pictures that look right and drops the others',
    Object.keys(rosterOut({ a: { av: 'x' }, b: { av: av(5) } }).a).includes('av') === false &&
      !!rosterOut({ b: { av: av(5) } }).b.av
  );
}
// one mission for many pilots
{
  let live = 0,
    peak = 0,
    zs = new Set();
  const calls = {},
    t = n => ({
      label: 'P' + n,
      send: async (text, name, o) => {
        zs.add(o.z);
        calls[n] = (calls[n] || 0) + 1;
        live++;
        peak = Math.max(peak, live);
        await new Promise(r => setTimeout(r, 15));
        live--;
        if (n % 10 === 3) throw new Error('Not connected.'); // always fails
        if (n % 10 === 7 && calls[n] === 1) throw new Error('Not connected.'); // fails once
      },
    });
  const prog = [];
  const r = await distribute(
    Array.from({ length: 40 }, (_, i) => t(i)),
    'mission',
    'M',
    { parallel: 4, wait: 5, onProgress: (d, n) => prog.push([d, n]) }
  );
  ck('distribute: at most four at a time and one compression for all', peak <= 4 && peak >= 2 && zs.size === 1);
  ck(
    'distribute: a failure is tried once more, then reported by name',
    r.ok.length === 36 &&
      r.bad.length === 4 &&
      calls[7] === 2 &&
      calls[3] === 2 &&
      r.bad[0].startsWith('P3') &&
      r.ok.includes('P7')
  );
  ck(
    'distribute: the progress counts up to the total',
    prog.length === 40 && prog[39][0] === 40 && prog[39][1] === 40 && typeof r.mid === 'string' && r.mid.length > 4
  );
  ck('distribute: nobody to send to is not an error', (await distribute([], 'x', 'y')).ok.length === 0);
}
// kneeboard cards travel as a small JSON text
{
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const t = cardText('Chart: LGTG/west?', png);
  const c = parseCard(t);
  ck('a card text is read back', !!c && c.img === png);
  ck('the name of a card is cleaned', !!c && !/[:/?]/.test(c.name) && c.name.includes('LGTG'));
  ck('a mission is not a card', parseCard('{"format":"bms-cards-mission"}') === null && parseCard('x') === null);
  ck(
    'only png, jpeg and webp pictures are cards',
    parseCard(cardText('x', 'data:image/svg+xml;base64,AAAA')) === null &&
      parseCard(cardText('x', 'data:text/html;base64,AAAA')) === null
  );
  ck('a card with a broken picture is refused', parseCard(cardText('x', 'data:image/png;base64,@@@')) === null);
  ck(
    'a card too big is refused',
    parseCard(cardText('x', 'data:image/png;base64,' + 'A'.repeat(12 * 1024 * 1024))) === null
  );
  ck('a damaged card text is refused', parseCard(t.slice(0, 60)) === null);
}
process.exit(ok ? 0 : 1);
