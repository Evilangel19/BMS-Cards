// Squadron: the logbook (.lbk) cipher and the codes of the peer-to-peer link
import { medalSvg, rankSvg, medalNames } from '../app/js/core/medals.js';
import {
  MEDALS,
  lbkChoices,
  decodeLbk,
  encodeLbk,
  parseLbk,
  zip,
  unzip,
  pack,
  unpack,
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
} from '../app/js/core/squadron.js';
let ok = true;
const ck = (n, c) => {
  ok &&= !!c;
  console.log(c ? 'ok  ' : 'FAIL', n);
};
// a logbook as BMS writes it (field offsets of a 372 byte file), then encoded
const put = (u8, o, s) => {
  for (let i = 0; i < s.length; i++) u8[o + i] = s.charCodeAt(i);
};
const plain = new Uint8Array(372);
put(plain, 0, 'Test Pilot');
put(plain, 21, 'Viper11');
put(plain, 225, 'Per aspera ad astra');
put(plain, 346, 'Red Devils');
plain[140] = 2;
plain[141] = 1;
plain[142] = 2;
plain[143] = 9;
plain[144] = 8;
plain[145] = 15;
[
  [120, 5],
  [122, 6],
  [124, 7],
  [126, 8],
  [134, 3],
  [136, 4],
].forEach(([o, v]) => {
  plain[o] = v;
});
const enc = encodeLbk(plain);
ck('the encoded logbook is not readable', !new TextDecoder('latin1').decode(enc).includes('Viper11'));
ck(
  'decode(encode(x)) is x',
  decodeLbk(enc).every((v, i) => v == plain[i])
);
const p = parseLbk(enc);
ck(
  'name, callsign, motto and squadron are read',
  p.name == 'Test Pilot' && p.callsign == 'Viper11' && p.motto == 'Per aspera ad astra' && p.squadron == 'Red Devils'
);
ck(
  'the medals and the campaign counters (killed, human kills, killed by human, by self, friendly kills) are read',
  JSON.stringify(p.stats.medals) == '[2,1,2,9,8,15]' && JSON.stringify(Object.values(p.stats.camp)) == '[5,6,7,8,3,4]'
);
let bad = '';
try {
  parseLbk(new Uint8Array(10));
} catch (e) {
  bad = e.message;
}
ck('a short file is refused', /logbook/.test(bad));
// the first byte of a real file is chained from 0x58 (a name starting with C)
const one = new Uint8Array(372);
one[0] = 67;
ck('first byte uses the 0x58 start', encodeLbk(one)[0] == (67 ^ 0x58 ^ 'F'.charCodeAt(0)));
ck(
  'Viper.lbk (the BMS default) is not offered, the others are',
  JSON.stringify(lbkChoices(['Viper.lbk', 'viper.LBK', 'Evil19.lbk', 'notes.txt', 'Wing2.lbk'])) ==
    '["Evil19.lbk","Wing2.lbk"]'
);
// codes
const text = JSON.stringify({ a: 'x'.repeat(5000), b: [1, 2, 3], c: 'è€' });
ck('zip/unzip keeps the text', (await unzip(await zip(text))) == text);
const o = {
  t: 'offer',
  sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' + 'a=candidate:1 1 udp 2113937151 192.168.1.5 5000 typ host\r\n'.repeat(4),
};
const code = await pack(o);
ck('a code is one line of text starting with BC1.', /^BC1\.[A-Za-z0-9_-]+$/.test(code));
ck(
  'unpack gives the object back, even with spaces and line breaks inserted',
  JSON.stringify(await unpack(code.replace(/(.{40})/g, '$1\n '))) == JSON.stringify(o)
);
let e2 = '';
try {
  await unpack('hello');
} catch (e) {
  e2 = e.message;
}
ck('a wrong code is refused', /not a code/.test(e2));
// pilots of the campaign squadrons: kills and missions flown
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
const C = CAM.openCam(
  new Uint8Array(fs.readFileSync(new URL('./fixtures/beartrap/PSI_BEAR_TRAP_26.cam', import.meta.url))),
  CAM.D,
  'x.cam'
);
const pil = C.units.filter(u => u.kind == 'sqd').flatMap(u => (u.pil || []).map(p => ({ ...p, sq: u.id.n })));
ck(
  'every squadron has 48 pilot records with kills and missions',
  C.units.filter(u => u.kind == 'sqd').every(u => u.pil.length == 48) &&
    pil.some(p => p.aa > 0) &&
    pil.some(p => p.ag > 0) &&
    pil.some(p => p.ms > 0)
);
ck(
  'there are aces (5 or more air-to-air kills) and the squadron of the player has a name',
  pil.some(p => p.aa >= 5) && !!C.squads[C.playerSq]
);
const SQ = await import('../app/js/core/squadron.js');
const cs = SQ.campaignSquadrons(C);
ck(
  'campaignSquadrons lists the squadrons, the player one first, with totals and aces',
  cs.length > 1 &&
    cs[0].mine &&
    cs.every(x => x.total == x.kills.aa + x.kills.ag + x.kills.as + x.kills.an) &&
    cs.some(x => x.aces.length > 0)
);
ck(
  'the shares of each side add up to 100%',
  Object.values(cs.reduce((m, x) => ((m[x.owner] = (m[x.owner] || 0) + x.share), m), {})).every(
    v => v == 0 || Math.abs(v - 1) < 1e-9
  )
);
const sq = SQ.newSquadron('Red Devils'),
  inv = await SQ.squadInvite(sq),
  back = await SQ.readSquadInvite(inv);
ck(
  'squadron invite round trip keeps name and secret',
  inv.startsWith('BCS.') && back.name == 'Red Devils' && back.secret == sq.secret
);
let bad2 = false;
try {
  await SQ.readSquadInvite('BC1.xxx');
} catch (e) {
  bad2 = true;
}
ck('a pilot code is refused as a squadron invite', bad2);
const mr = SQ.mergeRoster(
  { a: { uid: 'a', role: 'x', ts: 5 } },
  { a: { uid: 'a', role: 'y', ts: 9 }, b: { uid: 'b', ts: 1 } }
);
ck(
  'mergeRoster: the newer edit wins and new pilots are added',
  mr.changed && mr.roster.a.role == 'y' && !!mr.roster.b && !SQ.mergeRoster(mr.roster, mr.roster).changed
);
const ev = SQ.parseLbk(new Uint8Array(fs.readFileSync(new URL('./fixtures/squadron/Evil19.lbk', import.meta.url)))),
  t = ev.stats;
ck(
  'real logbook Evil19: name, callsign, squadron, motto',
  ev.name == 'Chris' && ev.callsign == 'Evil19' && ev.squadron == 'Diavoli Rossi' && ev.motto == 'Per Aspera ad Astra'
);
ck(
  'real logbook: hours 219.3, ace factor 1.893, 127 missions, score 598, last mission 487',
  Math.abs(t.hours - 219.3) < 0.05 &&
    Math.abs(t.ace - 1.893) < 0.001 &&
    t.missions == 127 &&
    t.score == 598 &&
    t.lastMission == 487
);
ck(
  'real logbook: kills A-A 41, A-G 553, static 67, naval 1; rank Maj; campaigns 3/0/0; commissioned 07/09/25',
  t.aa == 41 &&
    t.ag == 553 &&
    t.st == 67 &&
    t.nav == 1 &&
    SQ.RANKS[t.rank] == 'Maj' &&
    t.campaigns.join('/') == '3/0/0' &&
    t.commissioned == '07/09/25'
);
ck(
  'real logbook: dogfight 23/6, online 1/6, kills 206/85, online 8/12',
  t.dog.won == 23 &&
    t.dog.lost == 6 &&
    t.dog.onWon == 1 &&
    t.dog.onLost == 6 &&
    t.dog.kills == 206 &&
    t.dog.deaths == 85 &&
    t.dog.onKills == 8 &&
    t.dog.onDeaths == 12
);
const pb = SQ.parsePhoneBook(fs.readFileSync(new URL('./fixtures/squadron/PhoneBkn.ini', import.meta.url), 'utf8'));
ck(
  'phone book: one server with address, voice host and bandwidth',
  pb.length == 1 &&
    pb[0].description == 'Evil Server' &&
    pb[0].ip == '0.0.0.0:32768' &&
    pb[0].voice == '127.0.0.1:32770' &&
    pb[0].down == 800000 &&
    pb[0].up == 400000
);
ck(
  'tracker list: only ws/wss addresses, no duplicates',
  SQ.parseTrackers('wss://a.b/x\nhttp://no ws://c:1 wss://a.b/x').join() == 'wss://a.b/x,ws://c:1'
);
const mine = C.units.find(u => u.kind == 'sqd' && u.id.n == C.playerSq);
ck(
  'squadron record: missions flown 18, aircraft losses 15, pilot losses 0 (this save)',
  mine.sqs && mine.sqs.missions == 18 && mine.sqs.acLoss == 15 && mine.sqs.pilotLoss == 0
);
ck('campaignSquadrons carries the record and the number of pilots', cs[0].sqs.missions == 18 && cs[0].pilotsN == 48);
ck(
  'okImg accepts small webp/png/jpeg data URLs only',
  SQ.okImg('data:image/png;base64,iVBORw0KGgo=') &&
    SQ.okImg('data:image/webp;base64,AAAA') &&
    !SQ.okImg('data:image/svg+xml;base64,AAAA') &&
    !SQ.okImg('javascript:alert(1)') &&
    !SQ.okImg('data:image/png;base64,AA"onerror="x') &&
    !SQ.okImg('data:image/png;base64,' + 'A'.repeat(100000))
);
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
process.exit(ok ? 0 : 1);
