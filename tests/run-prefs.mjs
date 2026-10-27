// Settings files that must not be lost (squadrons): two complete copies, a damaged file is never replaced by an empty start; and the spread of the announce pace
import { safeSave, safeLoad } from '../app/js/core/prefs.js';
import { spread } from '../app/js/core/squadron.js';

let n = 0,
  bad = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name);
  }
};
// an in-memory folder; failAt: the write number that stops half way (the file keeps half of its text)
const mem = (failAt = 0, f = new Map()) => {
  let w = 0;
  return {
    f,
    read: async k => (f.has(k) ? f.get(k) : null),
    write: async (k, t) => {
      w++;
      if (w === failAt) {
        f.set(k, t.slice(0, Math.floor(t.length / 2)));
        throw new Error('stopped');
      }
      f.set(k, t);
    },
  };
};
const A = JSON.stringify({ uid: 'a', squads: [{ id: 1 }] }),
  B = JSON.stringify({ uid: 'a', squads: [{ id: 1 }, { id: 2 }] });

let io = mem();
await safeSave(io, 's.json', A);
ok('both copies written', io.f.get('s.json') === A && io.f.get('s.json.new') === A);
let r = await safeLoad(io, 's.json');
ok('loads the saved file', r.value.uid === 'a' && r.issue === '');

// the program stops while writing the copy: the main file is the old, whole one
io = mem();
await safeSave(io, 's.json', A);
io = mem(1, io.f);
await safeSave(io, 's.json', B).catch(() => {});
r = await safeLoad(io, 's.json');
ok('stopped in the copy: the old file is read', r.value.squads.length === 1 && r.issue === '');

// the program stops while writing the main file: the copy is whole and newer
io = mem();
await safeSave(io, 's.json', A);
io = mem(2, io.f);
await safeSave(io, 's.json', B).catch(() => {});
r = await safeLoad(io, 's.json');
ok('stopped in the main file: the copy is read', r.value.squads.length === 2 && r.issue === 'repaired');

// a damaged file and no copy: kept aside, nothing invented
io = mem();
io.f.set('s.json', '{"uid":"a","squ');
r = await safeLoad(io, 's.json');
ok('damaged without copy: no value', r.value === null && r.issue === 'damaged');
ok('damaged file kept as .bad', io.f.get('s.json.bad') === '{"uid":"a","squ');

// first start, an older file without a copy, an empty file
r = await safeLoad(mem(), 's.json');
ok('first start: nothing and no issue', r.value === null && r.issue === '');
io = mem();
io.f.set('s.json', A);
r = await safeLoad(io, 's.json');
ok('file of an older version (no copy) is read', r.value.uid === 'a' && r.issue === '');
io = mem();
io.f.set('s.json', '');
r = await safeLoad(io, 's.json');
ok('empty file is a first start', r.value === null && r.issue === '' && !io.f.has('s.json.bad'));
io = mem();
io.f.set('s.json', '5');
r = await safeLoad(io, 's.json');
ok('a file that is not an object is damaged', r.value === null && r.issue === 'damaged');

// a write that does not come back the same is an error
const liar = { read: async () => 'x', write: async () => {} };
let threw = false;
await safeSave(liar, 's.json', A).catch(() => (threw = true));
ok('a copy that reads back different fails the save', threw);

// the pace of the announces
ok('no jitter: exact', spread(25000, false, 0.3) === 25000);
ok('jitter low end -20%', spread(10000, true, 0) === 8000);
ok('jitter high end +20%', spread(10000, true, 1) === 12000);
let lo = Infinity,
  hi = 0;
for (let i = 0; i < 2000; i++) {
  const v = spread(10000, true);
  lo = Math.min(lo, v);
  hi = Math.max(hi, v);
}
ok('random pace stays inside +-20%', lo >= 8000 && hi <= 12000 && hi - lo > 2000);

console.log(bad ? `${bad} of ${n} prefs checks failed` : `OK - ${n} prefs checks`);
process.exit(bad ? 1 : 0);
