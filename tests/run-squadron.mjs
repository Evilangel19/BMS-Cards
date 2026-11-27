// Squadron: the logbook (.lbk) cipher and the codes of the peer-to-peer link
import { lbkChoices, decodeLbk, encodeLbk, parseLbk, zip, unzip, pack, unpack } from '../app/js/core/squadron.js';
import { has, skip } from './fixture.mjs';
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
ck('a code is one line of text starting with BC1.', /^BC1\.[A-Za-z0-9+/]+$/.test(code));
ck(
  'unpack gives the object back, even with spaces and line breaks inserted',
  JSON.stringify(await unpack(code.replace(/(.{40})/g, '$1\n '))) == JSON.stringify(o)
);
{
  // no character a chat takes for formatting, whatever the content, and a code of the older alphabet is still read
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const t = await pack({ s: Array.from({ length: 40 }, () => Math.random().toString(36)).join(''), i }, 'BCS');
    if (/[_\-*~`|>]/.test(t.slice(4))) bad++;
  }
  ck('a code has no _ - * ~ ` | > (Discord formatting) in 300 random codes', bad === 0);
  const t = await pack(o);
  ck(
    'a code written with the older alphabet (- and _) is still read',
    JSON.stringify(await unpack(t.replace(/\+/g, '-').replace(/\//g, '_'))) == JSON.stringify(o)
  );
  ck(
    'and one pasted inside backticks or with a zero-width space is read',
    JSON.stringify(await unpack('`' + t.slice(0, 20) + '\u200b' + t.slice(20) + '`')) == JSON.stringify(o)
  );
}
let e2 = '';
try {
  await unpack('hello');
} catch (e) {
  e2 = e.message;
}
ck('a wrong code is refused', /not a code/.test(e2));
let e3 = '';
try {
  await unpack(code.slice(0, code.length - 25));
} catch (e) {
  e3 = e.message;
}
ck('a code cut at the end says it is incomplete, in plain words', /incomplete or damaged/.test(e3) && /whole/.test(e3));
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
// The numbers of a logbook and of a squadron change with every flight: they are compared with tests/fixtures/expect.json (gitignored, written for the
// files of the fixtures and checked against the logbook editor of BMS) when it is there; without it only their shape is checked.
const EXP = has('expect.json')
  ? JSON.parse(fs.readFileSync(new URL('./fixtures/expect.json', import.meta.url), 'utf8'))
  : null;
const nat = v => Number.isInteger(v) && v >= 0;
ck(
  'real logbook: hours, ace factor, missions, score, kills, rank, campaigns, dogfights are read as numbers',
  t.hours > 0 &&
    t.ace > 0 &&
    [t.missions, t.score, t.lastMission, t.aa, t.ag, t.st, t.nav, ...t.campaigns, ...Object.values(t.dog)].every(nat) &&
    !!SQ.RANKS[t.rank] &&
    /^\d\d\/\d\d\/\d\d$/.test(t.commissioned)
);
if (EXP && EXP.lbk) {
  const e = EXP.lbk;
  ck(
    'real logbook: the values of expect.json (hours ' + e.hours + ', ' + e.missions + ' missions, A-G ' + e.ag + ')',
    Math.abs(t.hours - e.hours) < 0.05 &&
      Math.abs(t.ace - e.ace) < 0.001 &&
      ['missions', 'score', 'lastMission', 'aa', 'ag', 'st', 'nav', 'commissioned'].every(k => t[k] === e[k]) &&
      SQ.RANKS[t.rank] == e.rank &&
      t.campaigns.join('/') == e.campaigns &&
      JSON.stringify(t.dog) == JSON.stringify(e.dog)
  );
} else skip('expect.json', 'the values of the real logbook');
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
  'squadron record: missions flown, aircraft and pilot losses are read',
  mine.sqs && [mine.sqs.missions, mine.sqs.acLoss, mine.sqs.pilotLoss].every(nat) && mine.sqs.missions > 0
);
ck(
  'campaignSquadrons carries the record and the number of pilots',
  cs[0].sqs.missions == mine.sqs.missions && cs[0].pilotsN > 0
);
if (EXP && EXP.beartrapSqd) {
  const e = EXP.beartrapSqd;
  ck(
    'squadron record: the values of expect.json (' + e.missions + ' missions, ' + e.acLoss + ' aircraft lost)',
    mine.sqs.missions == e.missions &&
      mine.sqs.acLoss == e.acLoss &&
      mine.sqs.pilotLoss == e.pilotLoss &&
      cs[0].pilotsN == e.pilotsN
  );
}
ck(
  'okImg accepts small webp/png/jpeg data URLs only',
  SQ.okImg('data:image/png;base64,iVBORw0KGgo=') &&
    SQ.okImg('data:image/webp;base64,AAAA') &&
    !SQ.okImg('data:image/svg+xml;base64,AAAA') &&
    !SQ.okImg('javascript:alert(1)') &&
    !SQ.okImg('data:image/png;base64,AA"onerror="x') &&
    !SQ.okImg('data:image/png;base64,' + 'A'.repeat(100000))
);
process.exit(ok ? 0 : 1);
