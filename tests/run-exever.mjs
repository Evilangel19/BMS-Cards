// The version of an exe, read from its PE headers (app/js/bmsdata/exever.js): a small PE file built here (no BMS file needed).
import { exeVersion, compareVersion } from '../app/js/bmsdata/exever.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
const w16 = (b, o, v) => ((b[o] = v & 255), (b[o + 1] = (v >> 8) & 255));
const w32 = (b, o, v) => {
  for (let i = 0; i < 4; i++) b[o + i] = (v >>> (8 * i)) & 255;
};
// a PE: DOS header, "PE", one section .rsrc (RVA 0x2000 -> file 0x400) with the tree root > RT_VERSION > id 1 > language 0x409 > data
function makePe({ plus = false, version = [4, 38, 1, 1234], noVersion = false, text = '' } = {}) {
  const b = new Uint8Array(0x1000);
  b[0] = 0x4d;
  b[1] = 0x5a;
  w32(b, 0x3c, 0x80);
  const pe = 0x80,
    optSize = plus ? 240 : 224;
  w32(b, pe, 0x4550);
  w16(b, pe + 6, 1);
  w16(b, pe + 20, optSize);
  const opt = pe + 24;
  w16(b, opt, plus ? 0x20b : 0x10b);
  const dd = opt + (plus ? 112 : 96);
  w32(b, dd + 16, 0x2000);
  w32(b, dd + 20, 0x400);
  const sec = opt + optSize;
  b.set([0x2e, 0x72, 0x73, 0x72, 0x63], sec); // ".rsrc"
  w32(b, sec + 8, 0x400);
  w32(b, sec + 12, 0x2000);
  w32(b, sec + 16, 0x400);
  w32(b, sec + 20, 0x400);
  const r = 0x400; // file offset of the resource tree
  const dir = (at, id, child, isDir) => {
    w16(b, r + at + 14, 1);
    w32(b, r + at + 16, id);
    w32(b, r + at + 20, isDir ? (child | 0x80000000) >>> 0 : child);
  };
  dir(0, noVersion ? 3 : 16, 0x20, true); // root: RT_VERSION (16), or an icon group (3)
  dir(0x20, 1, 0x40, true); // type: id 1
  dir(0x40, 0x409, 0x60, false); // language: data entry
  w32(b, r + 0x60, 0x2000 + 0x100); // data entry: RVA
  w32(b, r + 0x64, 0x200); // data entry: size
  const v = r + 0x100; // VS_VERSIONINFO: header, "VS_VERSION_INFO", padding, VS_FIXEDFILEINFO
  w16(b, v, 0x5c);
  w16(b, v + 2, 52);
  const key = 'VS_VERSION_INFO';
  for (let i = 0; i < key.length; i++) w16(b, v + 6 + i * 2, key.charCodeAt(i));
  const f = v + 40; // 6 + 32 + padding
  w32(b, f, 0xfeef04bd);
  w32(b, f + 8, ((version[0] << 16) | version[1]) >>> 0);
  w32(b, f + 12, ((version[2] << 16) | version[3]) >>> 0);
  if (text) {
    // string table after the fixed block: "FileVersion", a zero, the text (UTF-16)
    const t = 'FileVersion\0' + text + '\0';
    for (let i = 0; i < t.length; i++) w16(b, f + 60 + i * 2, t.charCodeAt(i));
  }
  return b;
}
const reader = b => async (o, l) => b.slice(o, o + l);
ok('PE32 with a version: 4.38.1.1234', JSON.stringify(await exeVersion(reader(makePe()))) === '[4,38,1,1234]');
ok(
  'PE32+ (64 bit): the same',
  JSON.stringify(await exeVersion(reader(makePe({ plus: true, version: [4, 37, 5, 0] })))) === '[4,37,5,0]'
);
ok(
  'numbers 0 in the fixed block, the text has it: 4.38.1.7',
  JSON.stringify(await exeVersion(reader(makePe({ version: [0, 0, 0, 0], text: '4.38.1.7' })))) === '[4,38,1,7]'
);
ok(
  'numbers 0 and text with commas: 4, 38, 2, 0',
  JSON.stringify(await exeVersion(reader(makePe({ version: [0, 0, 0, 0], text: '4, 38, 2, 0' })))) === '[4,38,2,0]'
);
ok('no version resource: nothing', (await exeVersion(reader(makePe({ noVersion: true })))) === null);
{
  const why = [];
  await exeVersion(reader(makePe({ noVersion: true })), why);
  ok(
    'the reason is given: the resource types found',
    why.join().includes('no version resource') && why.join().includes('3')
  );
  const why2 = [];
  await exeVersion(async () => Promise.reject(new Error('denied')), why2);
  ok('a read error is given as the reason', why2.join().includes('denied'));
}
ok('not a PE file: nothing', (await exeVersion(reader(new Uint8Array(500)))) === null);
ok('a read that fails: nothing, no error', (await exeVersion(async () => Promise.reject(new Error('x')))) === null);
ok('same version: ok', compareVersion([4, 38, 1, 99], '4.38.1').level === 'ok');
ok('a higher patch: newer', compareVersion([4, 38, 2, 0], '4.38.1').level === 'newer');
ok(
  'another minor: other',
  compareVersion([4, 39, 0, 0], '4.38.1').level === 'other' && compareVersion([4, 37, 5, 0], '4.38.1').level === 'other'
);
ok('a lower patch: other', compareVersion([4, 38, 0, 5], '4.38.1').level === 'other');
ok(
  '0.0.0.0 or nothing: unknown, no warning',
  compareVersion([0, 0, 0, 0], '4.38.1').level === 'unknown' && compareVersion(null, '4.38.1').level === 'unknown'
);
console.log(bad ? 'exever: ' + bad + ' FAILED' : 'exever: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);
