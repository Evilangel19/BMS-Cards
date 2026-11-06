// Parser tests: results must equal the ones produced by the original prototype (tests/golden/parsers.json).
import fs from 'node:fs';
import { parseLink16 } from '../app/js/parsers/link16.js';
import { parseIff } from '../app/js/parsers/iff.js';
import { parseTwx } from '../app/js/parsers/twx.js';
import { parseDtc } from '../app/js/parsers/dtc.js';

const fx = n => new URL('./fixtures/' + n, import.meta.url);
const read2 = f => fs.readFileSync(fx(f)).toString('utf8');
const gold = JSON.parse(fs.readFileSync(new URL('./golden/parsers.json', import.meta.url), 'utf8'));
const files = {
  beartrap: {
    l16: 'PSI_BEAR_TRAP_26.l16.txtpb',
    iff: 'PSI_BEAR_TRAP_26.iff',
    twx: 'PSI_BEAR_TRAP_26.twx',
    dtc: 'Evil19_2_.ini',
  },
  evilkorea: { l16: 'EvilKorea_l16.txtpb', iff: 'EvilKorea.iff', twx: 'EvilKorea.twx' },
};
const norm = o => JSON.stringify(JSON.parse(JSON.stringify(o)));
// the golden file is the one of the prototype: it has no Special (EW) channel, which the parser reads since 1.1.0-beta.13 (checked below)
const noEw = o => Object.fromEntries(Object.entries(o).map(([k, { ew, ...r }]) => [k, r]));
let bad = 0,
  n = 0;
const check = (name, got, want) => {
  n++;
  if (norm(got) !== norm(want)) {
    bad++;
    console.log('FAIL', name);
  }
};
for (const [set, f] of Object.entries(files)) {
  const read = k => fs.readFileSync(fx(set + '/' + f[k]));
  check(set + ' link16', noEw(parseLink16(read('l16').toString('utf8'))), gold[set].l16);
  check(set + ' iff', parseIff(read('iff').toString('utf8')), gold[set].iff);
  const b = read('twx');
  check(set + ' twx', parseTwx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).iso, gold[set].twx);
  if (f.dtc) check(set + ' dtc', parseDtc(read('dtc').toString('latin1')), gold[set].dtc);
}
// the channels of the flights that a pilot compared with the Data Cartridge of BMS (EvilKorea): Mission, Fighter (F2F) and Special (EW, -1 = none)
{
  const L = parseLink16(read2('evilkorea/EvilKorea_l16.txtpb'));
  for (const [id, who, mc, fc, ew] of [
    [2537, 'Hammer 7', 87, 87, 43],
    [2349, 'Plasma 5', 124, 87, -1],
    [2403, 'Bulldog 5', 124, 87, -1],
    [2511, 'Satan 2', 43, 2, -1],
  ]) {
    n++;
    if (!L[id] || L[id].mc !== mc || L[id].fc !== fc || L[id].ew !== ew) {
      bad++;
      console.log('FAIL channels of ' + who, JSON.stringify(L[id]));
    }
  }
  n++;
  if (parseLink16('flight_number: 5\nstn_number: 1234\nf2f_channel: 2\nmission_channel: 3\nteam: 1')[5].ew !== -1) {
    bad++;
    console.log('FAIL a Link 16 file without ew_channel gives -1');
  }
}
// player faction = owner of the player squadron (cmp block)
{
  const { CAM } = await import('../app/js/core/cam-core.js');
  for (const [f, sq] of [
    ['beartrap/PSI_BEAR_TRAP_26.cam', 8687],
    ['evilkorea/EvilKorea.cam', 6185],
  ]) {
    n++;
    const c = CAM.openCam(new Uint8Array(fs.readFileSync(fx(f))), CAM.D, f);
    if (c.playerSq !== sq || c.playerTeam !== 1) {
      bad++;
      console.log('FAIL player faction', f, c.playerSq, c.playerTeam);
    }
  }
}
// weather map: layers at the altitudes of the BMS manual, nearest layer to an altitude, header, fields
{
  const { parseFmap, WX_ALT, wxLevel } = await import('../app/js/parsers/fmap.js');
  const w = parseFmap(new Uint8Array(fs.readFileSync(fx('evilkorea/EvilKorea.fmap')))),
    c = w.at(500, 500),
    p = w.profile(500, 500),
    g = (name, v) => {
      n++;
      if (!v) {
        bad++;
        console.log('FAIL', name);
      }
    };
  g('fmap size 59x59', w.X === 59 && w.Y === 59);
  g(
    'fmap 10 wind layers 0-50000 ft',
    WX_ALT.length === 10 && WX_ALT[0] === 0 && WX_ALT[5] === 18000 && WX_ALT[9] === 50000 && p.length === 10
  );
  g(
    'fmap nearest layer',
    wxLevel(0) === 0 &&
      wxLevel(20000) === 5 &&
      wxLevel(21000) === 6 &&
      wxLevel(35000) === 8 &&
      wxLevel(90000) === 9 &&
      wxLevel(-100) === 0
  );
  g(
    'fmap wind() = the profile layer',
    w.wind(500, 500, 29000).lv === 7 &&
      w.wind(500, 500, 29000).spd === p[7].spd &&
      w.wind(500, 500, 29000).hdg === p[7].hdg
  );
  g('fmap at() = cell()', c.t === w.cell(Math.floor(500 / w.cs), Math.floor(500 / w.cs)).t && c.spd === p[0].spd);
  g(
    'fmap fields in range',
    c.dens >= 1 &&
      c.dens <= 13 &&
      c.size >= 0 &&
      c.size <= 5 &&
      (c.tcu === 0 || c.tcu === 1) &&
      (c.shower === 0 || c.shower === 1) &&
      c.fogEnd > 0 &&
      c.fogEnd <= 60 &&
      c.cond >= 0 &&
      c.cond <= 3
  );
  g(
    'fmap header',
    w.hdr.contrail.length === 4 && w.hdr.contrail.every(v => v > 10000 && v < 60000) && w.hdr.wind.spd >= 0
  );
}
// error handling
for (const [name, fn] of [
  ['twx too short', () => parseTwx(new ArrayBuffer(8))],
  ['twx bad date', () => parseTwx(new ArrayBuffer(728))],
]) {
  n++;
  try {
    fn();
    bad++;
    console.log('FAIL', name, '(no error)');
  } catch (e) {
    /* expected */
  }
}
// damaged compressed data / table of contents: an error, never zeros that look like data (synthetic bytes, no game data)
{
  const { lzExpand } = await import('../app/js/parsers/lzss.js'),
    { camToc } = await import('../app/js/parsers/cam.js');
  const lit = new Uint8Array([0xff, 1, 2, 3, 4, 5, 6, 7, 8]); // flags: eight literals
  const ok = (name, c) => {
    n++;
    if (!c) {
      bad++;
      console.log('FAIL', name);
    }
  };
  const throws = fn => {
    try {
      fn();
      return false;
    } catch (e) {
      return true;
    }
  };
  ok('lzss: eight literals expand to themselves', lzExpand(lit, 8).join() === '1,2,3,4,5,6,7,8');
  ok(
    'lzss: a block shorter than its declared size is an error',
    throws(() => lzExpand(lit, 20))
  );
  ok(
    'lzss: an absurd declared size is an error (no huge allocation)',
    throws(() => lzExpand(lit, 0x7fffffff))
  );
  ok(
    'lzss: a negative size is an error',
    throws(() => lzExpand(lit, -5))
  );
  const toc = (t, cnt) => {
    const b = new Uint8Array(64);
    const d = new DataView(b.buffer);
    d.setUint32(0, t, true);
    if (t + 4 <= 64) d.setUint32(t, cnt, true);
    return b;
  };
  ok(
    'camToc: a table of contents outside the file is an error',
    throws(() => camToc(toc(4000, 1)))
  );
  ok(
    'camToc: an absurd number of entries is an error',
    throws(() => camToc(toc(8, 0x7fffffff)))
  );
  ok('camToc: an empty table is fine', Object.keys(camToc(toc(8, 0))).length === 0);
}
console.log(bad ? `${bad} of ${n} parser checks failed` : `OK - ${n} parser checks match the prototype`);
process.exit(bad ? 1 : 0);
