// The zip reader and writer of the backup file (app/js/core/zip.js).
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32, readZip, ZipWriter } from '../app/js/core/zip.js';

let bad = 0,
  n = 0;
const ok = (name, cond) => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name);
  }
};
const throwsWith = async (name, fn, re) => {
  try {
    await fn();
    ok(name + ' (nothing was thrown)', false);
  } catch (e) {
    ok(name + ' (' + e.message + ')', re.test(e.message));
  }
};
const enc = new TextEncoder();
const rnd = len => {
  const b = new Uint8Array(len);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = s >> 16;
  }
  return b;
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

ok('crc32 of "123456789" is cbf43926', crc32(enc.encode('123456789')) === 0xcbf43926);
ok('crc32 of nothing is 0', crc32(new Uint8Array(0)) === 0);

// ---- round trip
const files = [
  ['config.json', enc.encode('{"a":1}\n')],
  ['missions/Prova caffè/Prova caffè.bcrd', enc.encode('x'.repeat(5000))],
  ['empty.txt', new Uint8Array(0)],
  ['backup/kneeboard/7982.dds', rnd(300000)],
  ['日本語/ファイル.json', enc.encode('[]')],
];
const w = new ZipWriter(); // no size hint: the buffer must grow
for (const [name, data] of files) w.add(name, data, new Date(2026, 10, 4, 12, 30, 10));
const zip = w.finish();
const r = readZip(zip);
ok('all entries are listed', r.entries.length === files.length && r.entries.every((e, i) => e.name === files[i][0]));
ok(
  'no entry is a folder',
  r.entries.every(e => !e.dir)
);
let all = true;
for (const [i, [, data]] of files.entries()) all &&= same(await r.read(r.entries[i]), data);
ok('every file comes back identical (accents and Japanese names too)', all);
const w2 = new ZipWriter(files.reduce((s, f) => s + f[1].length, 0) + 4000);
for (const [name, data] of files) w2.add(name, data);
ok('with the size hint the zip is the same size', w2.finish().length === zip.length);

// ---- the zip is a good zip for other programs
const py = spawnSync('python3', ['-V']);
if (py.status === 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zt-')),
    f = path.join(tmp, 'a.zip');
  fs.writeFileSync(f, zip);
  const t = spawnSync('python3', [
    '-c',
    'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(len(z.namelist()),z.read("config.json").decode().strip())',
    f,
  ]);
  ok(
    'python reads the zip and checks every CRC (' + (t.stdout + t.stderr).toString().trim() + ')',
    t.status === 0 && /^5 \{"a":1\}/.test(t.stdout.toString())
  );
  fs.rmSync(tmp, { recursive: true, force: true });
} else console.log('(python3 not found: the check with another zip reader is skipped)');

// ---- a zip made by another program: deflated entries, folder entries, a data descriptor left out of the central directory
const le = (v, bytes) => Array.from({ length: bytes }, (_, i) => (v >>> (8 * i)) & 255);
function foreignZip(entries) {
  const parts = [],
    cd = [];
  let off = 0;
  for (const e of entries) {
    const nm = enc.encode(e.name),
      data = e.data,
      packed = e.method === 8 ? zlib.deflateRawSync(data) : data,
      crc = crc32(data),
      h = [
        ...le(0x04034b50, 4),
        ...le(20, 2),
        ...le(e.flags || 0, 2),
        ...le(e.method, 2),
        ...le(0, 2),
        ...le(0x5a21, 2),
        ...le(crc, 4),
        ...le(packed.length, 4),
        ...le(data.length, 4),
        ...le(nm.length, 2),
        ...le(0, 2),
      ];
    parts.push(Uint8Array.from(h), nm, packed);
    cd.push({ nm, e, crc, packed: packed.length, off, size: data.length });
    off += h.length + nm.length + packed.length;
  }
  const cdStart = off;
  let cdLen = 0;
  for (const c of cd) {
    const h = [
      ...le(0x02014b50, 4),
      ...le(20, 2),
      ...le(20, 2),
      ...le(c.e.flags || 0, 2),
      ...le(c.e.method, 2),
      ...le(0, 2),
      ...le(0x5a21, 2),
      ...le(c.crc, 4),
      ...le(c.packed, 4),
      ...le(c.size, 4),
      ...le(c.nm.length, 2),
      ...le(0, 2),
      ...le(0, 2),
      ...le(0, 2),
      ...le(0, 2),
      ...le(0, 4),
      ...le(c.off, 4),
    ];
    parts.push(Uint8Array.from(h), c.nm);
    cdLen += h.length + c.nm.length;
  }
  parts.push(
    Uint8Array.from([
      ...le(0x06054b50, 4),
      ...le(0, 2),
      ...le(0, 2),
      ...le(cd.length, 2),
      ...le(cd.length, 2),
      ...le(cdLen, 4),
      ...le(cdStart, 4),
      ...le(0, 2),
    ])
  );
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of parts) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}
const big = enc.encode('{"hello":"world"}'.repeat(2000));
const fz = foreignZip([
  { name: 'BMS-Cards/', method: 0, data: new Uint8Array(0) },
  { name: 'BMS-Cards/config.json', method: 8, data: big },
  { name: 'BMS-Cards/squadron.json', method: 0, data: enc.encode('{}') },
]);
const fr = readZip(fz);
ok('a folder entry is marked as a folder', fr.entries[0].dir === true && fr.entries[1].dir === false);
ok('a deflated entry is opened', same(await fr.read(fr.entries[1]), big));
ok('a stored entry is opened', same(await fr.read(fr.entries[2]), enc.encode('{}')));

// ---- damage and refusals
await throwsWith(
  'not a zip',
  async () => readZip(enc.encode('this is just some text, not a zip file at all')),
  /not a zip/
);
await throwsWith('empty file', async () => readZip(new Uint8Array(0)), /not a zip/);
await throwsWith(
  'a zip cut short',
  async () => readZip(zip.subarray(0, zip.length - 40)),
  /not a zip|damaged|too soon/
);
const flip = Uint8Array.from(zip);
flip[r.entries[0].offset + 30 + enc.encode(files[0][0]).length + 2] ^= 0xff; // a byte inside the first file
await throwsWith(
  'a changed byte is found by the CRC',
  async () => readZip(flip).read(readZip(flip).entries[0]),
  /damaged/
);
const enco = Uint8Array.from(zip);
new DataView(enco.buffer).setUint16(r.entries[0].offset + 6, 1, true); // flags in the local header do not matter ...
ok('flags of the local header are not used', same(await readZip(enco).read(readZip(enco).entries[0]), files[0][1]));
const pw = foreignZip([{ name: 'a.json', method: 0, flags: 1, data: enc.encode('{}') }]);
await throwsWith('a zip with a password', async () => readZip(pw), /password/);
const z64 = Uint8Array.from(zip);
new DataView(z64.buffer).setUint32(z64.length - 22 + 16, 0xffffffff, true);
await throwsWith('ZIP64', async () => readZip(z64), /ZIP64/);
const badDeflate = foreignZip([{ name: 'a.json', method: 8, data: big }]);
badDeflate[30 + 6 + 10] ^= 0xff;
await throwsWith(
  'a deflated entry that is damaged',
  async () => readZip(badDeflate).read(readZip(badDeflate).entries[0]),
  /damaged/
);
const lzma = foreignZip([{ name: 'a.json', method: 0, data: enc.encode('{}') }]);
new DataView(lzma.buffer).setUint16(lzma.length - 22 - 46 - 6 + 10, 14, true); // method 14 (LZMA) in the central directory
await throwsWith(
  'a kind of compression that is not known',
  async () => readZip(lzma).read(readZip(lzma).entries[0]),
  /compression|damaged/
);

// ---- the writer's own refusals
await throwsWith(
  'the same name twice',
  async () => {
    const x = new ZipWriter();
    x.add('a.json', new Uint8Array(1));
    x.add('A.JSON', new Uint8Array(1));
  },
  /Twice/
);
await throwsWith('an empty name', async () => new ZipWriter().add('', new Uint8Array(1)), /Bad name/);
ok('an empty zip is a good zip', readZip(new ZipWriter().finish()).entries.length === 0);

console.log(bad ? `run-zip.mjs: ${bad} of ${n} checks failed` : `run-zip.mjs: OK - ${n} checks`);
process.exit(bad ? 1 : 0);
