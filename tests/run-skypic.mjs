// The big map picture of the BMS folder (core/skypic.js): levels and blocks, the blocks in memory, the saved copies in the database, the cutting into blocks.
// Everything that needs the browser is replaced by simple stand-ins (canvas, decoder, database); the drawing itself is checked in tools/skypic-test.py.
import {
  BS,
  JPEG_Q,
  MAX_PICS,
  SHARP,
  BlockStore,
  TileCache,
  blockKey,
  blocksIn,
  buildBlocks,
  levelsOf,
  manKey,
  picDb,
  pickLevel,
  reduceInSlices,
  smKey,
} from '../app/js/core/skypic.js';
let n = 0,
  bad = 0;
const ck = (name, ok, extra) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra));
  }
};
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- levels
{
  const L16 = levelsOf(16384, 16384);
  ck(
    '16K picture: itself and its half, blocks of 2048',
    same(
      L16.map(l => [l.id, l.w, l.h, l.nx, l.ny]),
      [
        [0, 16384, 16384, 8, 8],
        [1, 8192, 8192, 4, 4],
      ]
    )
  );
  ck(
    '12,288 px is the smallest picture with a half level',
    levelsOf(12288, 12288).length === 2 && levelsOf(12287, 12287).length === 1
  );
  ck(
    '8K picture: only itself',
    same(
      levelsOf(8192, 8192).map(l => [l.w, l.nx]),
      [[8192, 4]]
    )
  );
  ck(
    'a picture of the size of the reduced copy (or smaller) has no blocks',
    !levelsOf(4096, 4096).length && !levelsOf(3000, 2000).length
  );
  ck(
    'a 5000 px picture: 3 x 3 blocks, the last one narrow',
    same(
      levelsOf(5000, 5000).map(l => [l.nx, l.ny]),
      [[3, 3]]
    ) && 5000 - 2 * BS === 904
  );
  const odd = levelsOf(12800, 900);
  ck(
    'a wide picture: blocks in a row, the half level rounded',
    same(
      odd.map(l => [l.w, l.h, l.nx, l.ny]),
      [
        [12800, 900, 7, 1],
        [6400, 450, 4, 1],
      ]
    )
  );
}
// ---- which level draws a tile
{
  const L16 = levelsOf(16384, 16384),
    L8 = levelsOf(8192, 8192),
    pk = (L, sw, sc) => {
      const l = pickLevel(L, 4096, sw, sc);
      return l ? l.id : 'sm';
    };
  ck(
    '16K: the reduced copy down to zoom 9 (about 4 picture pixels per tile pixel)',
    pk(L16, 16384, 4) === 'sm' && pk(L16, 16384, 3.2) === 'sm'
  );
  ck(
    '16K: the half level at zoom 10 (about 2), the picture from zoom 11 (about 1 and less)',
    pk(L16, 16384, 2) === 1 && pk(L16, 16384, 1.8) === 1 && pk(L16, 16384, 1) === 0 && pk(L16, 16384, 0.25) === 0
  );
  ck(
    '8K: the reduced copy at zoom 9 (2 pixels per tile pixel), the picture from zoom 10',
    pk(L8, 8192, 2) === 'sm' && pk(L8, 8192, 1) === 0 && pk(L8, 8192, 0.5) === 0
  );
  ck('no blocks: always the reduced copy', pickLevel([], 4096, 4096, 0.1) === null);
  ck(
    'the limit is SHARP (picture pixels per tile pixel, as the level has them)',
    SHARP === 0.8 && pk(L16, 16384, 3.3) === 'sm' && pk(L16, 16384, 3.1) === 1
  );
}
// ---- blocks of a part of the picture
{
  const [L0, L1] = levelsOf(16384, 16384);
  ck('a part inside one block', same(blocksIn(L0, 16384, 16384, { x0: 10, y0: 10, x1: 300, y1: 300 }), [[0, 0]]));
  ck(
    'a part over the edge between two blocks',
    same(blocksIn(L0, 16384, 16384, { x0: 2000, y0: 0, x1: 2100, y1: 10 }), [
      [0, 0],
      [1, 0],
    ])
  );
  ck(
    'a part that ends exactly on the edge does not take the next block',
    same(blocksIn(L0, 16384, 16384, { x0: 1792, y0: 0, x1: 2048, y1: 256 }), [[0, 0]])
  );
  ck('four blocks at a corner', blocksIn(L0, 16384, 16384, { x0: 2000, y0: 4000, x1: 2100, y1: 4100 }).length === 4);
  ck(
    'the half level: the same part (in picture pixels) is in other blocks',
    same(blocksIn(L1, 16384, 16384, { x0: 4000, y0: 0, x1: 4200, y1: 100 }), [
      [0, 0],
      [1, 0],
    ])
  );
  ck(
    'a part outside the level is clamped to the blocks that exist',
    same(blocksIn(L0, 16384, 16384, { x0: 16000, y0: 16000, x1: 17000, y1: 17000 }), [[7, 7]])
  );
}
// ---- tiles kept for the way back
{
  const c = new TileCache(3);
  c.put('a', 1);
  c.put('b', 2);
  c.put('c', 3);
  c.put('d', 4);
  ck('the oldest tile goes when there are too many', c.size === 3 && c.take('a') === undefined && c.take('d') === 4);
  ck('a tile taken leaves the cache', c.take('d') === undefined && c.size === 2);
  c.put('b', 22);
  c.put('e', 5);
  c.put('f', 6);
  ck('a tile put again is the newest', c.take('c') === undefined && c.take('b') === 22 && c.take('f') === 6);
  c.clear();
  ck('clear', c.size === 0);
}
// ---- the blocks in memory
const fakeBmp = (w = BS, h = BS) => ({
  width: w,
  height: h,
  closed: false,
  close() {
    this.closed = true;
  },
});
{
  const levels = levelsOf(16384, 16384),
    calls = [],
    bads = [],
    made = [],
    mk = (over = {}) =>
      new BlockStore({
        levels,
        get: async (lv, i, j) => {
          calls.push(lv + ':' + i + ',' + j);
          await tick(1);
          return { lv, i, j };
        },
        decode: async b => {
          await tick(1);
          const m = fakeBmp();
          m.of = b;
          made.push(m);
          return m;
        },
        bad: (...a) => bads.push(a),
        ...over,
      });
  let st = mk();
  ck('nothing is there before the load', st.has(0, [[0, 0]]) === false);
  const ids = [
    [0, 0],
    [1, 0],
  ];
  const [a, b] = await Promise.all([st.load(0, ids), st.load(0, ids)]);
  ck('a load gives true when all the blocks are decoded', a === true && b === true && st.has(0, ids));
  ck('two loads of the same blocks read each one once', calls.length === 2);
  ck('a block already there is not read again', (await st.load(0, [[1, 0]])) === true && calls.length === 2);
  ck('the memory in use is counted', st.bytes === 2 * BS * BS * 4);
  // a block that is not saved
  st = mk({ get: async () => undefined });
  ck(
    'a block that is not in the database: false, and bad() is told',
    (await st.load(0, [[3, 3]])) === false && same(bads.at(-1), [0, 3, 3])
  );
  const nb = bads.length;
  st = mk({ get: async () => null });
  ck(
    'a database that cannot be read now is not a lost block',
    (await st.load(0, [[3, 3]])) === false && bads.length === nb
  );
  st = mk({
    decode: async () => {
      throw new Error('corrupt');
    },
  });
  ck(
    'a block that cannot be decoded: false, and bad() is told',
    (await st.load(1, [[2, 2]])) === false && same(bads.at(-1), [1, 2, 2])
  );
  // the least recently used go first, and a block somebody waits for stays
  made.length = 0;
  st = mk({ capBytes: 3 * BS * BS * 4 });
  await st.load(0, [[0, 0]]);
  await st.load(0, [[1, 0]]);
  await st.load(0, [[2, 0]]);
  st.has(0, [[0, 0]]); // block 0 is used again: block 1 is now the oldest
  await st.load(0, [[3, 0]]);
  ck(
    'over the capacity the least recently used block goes (and is closed)',
    !st.has(0, [[1, 0]]) &&
      st.has(0, [
        [0, 0],
        [2, 0],
        [3, 0],
      ]) &&
      made.filter(m => m.closed).length === 1 &&
      st.bytes === 3 * BS * BS * 4
  );
  st.clear();
  ck('clear closes every bitmap', st.bytes === 0 && made.every(m => m.closed) && !st.has(0, [[0, 0]]));
  // dispose while a block is being decoded
  made.length = 0;
  st = mk();
  const p = st.load(0, [[5, 5]]);
  await tick(1);
  st.dispose();
  ck(
    'dispose during a load: the bitmap is closed, the load says false',
    (await p) === false && st.bytes === 0 && made.every(m => m.closed)
  );
}
// ---- the part of a tile from the blocks: one block directly, two put together at 1:1
{
  const levels = levelsOf(16384, 16384),
    L0 = levels[0],
    rec = () => {
      const log = [];
      const ctx = { log, drawImage: (...a) => log.push(a), clearRect: (...a) => log.push(['clear', ...a]) };
      return { width: 0, height: 0, getContext: () => ctx, ctx };
    },
    scratch = [];
  const st = new BlockStore({
    levels,
    get: async () => 1,
    decode: async () => fakeBmp(),
    make: (w, h) => {
      const c = rec();
      c.width = w;
      c.height = h;
      scratch.push(c);
      return c;
    },
  });
  await st.load(0, [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
  const src = st.source(L0),
    c = rec();
  ck('source has the size of the level', src.sw === 16384 && src.sh === 16384);
  src.draw(c.ctx, 100.4, 200.2, 300.7, 400.1);
  ck(
    'inside one block: a single drawImage, rounded outwards, no scratch canvas',
    c.ctx.log.length === 1 && same(c.ctx.log[0].slice(1), [100, 200, 201, 201, 100, 200, 201, 201]) && !scratch.length,
    c.ctx.log
  );
  const d = rec();
  src.draw(d.ctx, 2000, 100, 2100, 150);
  const s0 = scratch[0];
  ck(
    'over two blocks: put together on a canvas of the size asked, then drawn at its place',
    scratch.length === 1 &&
      s0.width === 100 &&
      s0.height === 50 &&
      d.ctx.log.length === 1 &&
      same(d.ctx.log[0].slice(1), [0, 0, 100, 50, 2000, 100, 100, 50]),
    d.ctx.log
  );
  const parts = s0.ctx.log.filter(x => x[0] !== 'clear');
  ck(
    'the two parts land side by side',
    parts.length === 2 &&
      same(parts[0].slice(1), [2000, 100, 48, 50, 0, 0, 48, 50]) &&
      same(parts[1].slice(1), [0, 100, 52, 50, 48, 0, 52, 50]),
    parts
  );
  src.draw(d.ctx, 2010, 100, 2110, 150);
  ck('the canvas of the same size is used again', scratch.length === 1);
  src.draw(d.ctx, 2040, 2040, 2060, 2060);
  ck(
    'four blocks at a corner come together as well',
    scratch.length === 2 && scratch[1].ctx.log.filter(x => x[0] !== 'clear').length === 4
  );
  const pl = rec();
  st.make = null;
  src.draw(pl.ctx, 2000, 100, 2100, 150);
  ck('without a canvas factory every block is drawn where it lies', pl.ctx.log.length === 2);
}
// ---- the reduction in slices
{
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => {},
    rect: (...a) => calls.push(['rect', ...a]),
    clip: () => {},
    drawImage: (...a) => calls.push(['draw', ...a]),
    getImageData: () => calls.push(['flush']),
  };
  const make = (w, h) => ({ width: w, height: h, getContext: () => ctx });
  const prog = [];
  const cv = await reduceInSlices({}, 8000, 8000, 2000, 2000, make, p => prog.push(p), 16);
  const rects = calls.filter(x => x[0] === 'rect'),
    draws = calls.filter(x => x[0] === 'draw');
  ck(
    '16 slices, one flush after each',
    rects.length === 16 && calls.filter(x => x[0] === 'flush').length === 16 && cv.width === 2000
  );
  ck(
    'the slices cover the whole height without a gap or an overlap',
    rects[0][2] === 0 &&
      rects.every((r, i) => i === 0 || r[2] === rects[i - 1][2] + rects[i - 1][4]) &&
      rects.at(-1)[2] + rects.at(-1)[4] === 2000
  );
  ck(
    'each slice is drawn from a few more rows than it shows, at the same scale',
    draws.every(
      (d, i) =>
        d[4] === 8000 &&
        d[8] === 2000 &&
        Math.abs(d[9] / d[5] - 1 / 4) < 1e-9 &&
        d[3] <= rects[i][2] * 4 &&
        d[3] + d[5] >= (rects[i][2] + rects[i][4]) * 4
    ) && draws[1][3] < rects[1][2] * 4
  );
  ck(
    'progress goes up to 1',
    prog.length === 16 && prog.every((p, i) => i === 0 || p > prog[i - 1]) && prog.at(-1) === 1
  );
  let threw = false;
  try {
    await reduceInSlices({}, 100, 100, 50, 50, make, null, 4, () => true);
  } catch (e) {
    threw = true;
  }
  ck('stop() gives it up', threw);
}
// ---- what the database keeps
const fakeDb = () => {
  const m = new Map();
  return {
    m,
    get: async k => m.get(k),
    put: async (k, v) => {
      m.set(k, v);
    },
    del: async k => {
      m.delete(k);
    },
  };
};
{
  const db = fakeDb(),
    pd = picDb(db),
    blob = { size: 5 },
    levels = levelsOf(16384, 16384);
  ck('nothing saved yet', (await pd.getSm('A')) === null && (await pd.getManifest('A', 16384, 16384, levels)) === null);
  await pd.putSm('A', blob, 16384, 16384);
  ck(
    'the reduced copy is saved and read back',
    same(await pd.getSm('A'), { sig: 'A', blob, sw: 16384, sh: 16384 }) && db.m.has(smKey('A'))
  );
  await pd.begin('A', 16384, 16384, levels);
  ck('a manifest that is not finished is not used', (await pd.getManifest('A', 16384, 16384, levels)) === null);
  await pd.putBlock('A', 0, 3, 4, blob);
  ck(
    'a block is read back; one that is not there is undefined',
    (await pd.getBlock('A', 0, 3, 4)) === blob &&
      (await pd.getBlock('A', 0, 0, 0)) === undefined &&
      db.m.has(blockKey('A', 0, 3, 4))
  );
  await pd.commit('A', 16384, 16384, levels);
  const man = await pd.getManifest('A', 16384, 16384, levels);
  ck(
    'the finished manifest is used (version, quality, blocks of 2048)',
    man && man.done === true && man.q === JPEG_Q && man.bs === BS && man.levels.length === 2,
    man
  );
  ck(
    'another size of the picture or other levels: the blocks are cut again',
    (await pd.getManifest('A', 16384, 16000, levels)) === null &&
      (await pd.getManifest('A', 16384, 16384, levels.slice(0, 1))) === null &&
      (await pd.getManifest('A', 8192, 8192, levelsOf(8192, 8192))) === null
  );
  await pd.forget('A');
  ck(
    'forget removes the manifest',
    (await pd.getManifest('A', 16384, 16384, levels)) === null && !db.m.has(manKey('A'))
  );
  // the copy of the first versions (one slot) is taken over for the same picture only
  const db2 = fakeDb(),
    p2 = picDb(db2);
  db2.m.set('skysm', { sig: 'B', blob, sw: 100, sh: 100 });
  ck('a copy of another picture in the old slot is not taken', (await p2.getSm('A')) === null && db2.m.has('skysm'));
  const got = await p2.getSm('B');
  ck(
    'the copy of the old slot is taken over for its picture',
    got && got.blob === blob && db2.m.has(smKey('B')) && !db2.m.has('skysm')
  );
  // too many pictures: the one used least goes, with its blocks
  const db3 = fakeDb(),
    p3 = picDb(db3),
    lv = levelsOf(5000, 5000);
  const save = async sig => {
    await p3.putSm(sig, blob, 5000, 5000);
    await p3.begin(sig, 5000, 5000, lv);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) await p3.putBlock(sig, 0, i, j, blob);
    await p3.commit(sig, 5000, 5000, lv);
  };
  await save('P1');
  await save('P2');
  ck('two pictures stay (MAX_PICS)', MAX_PICS === 2 && db3.m.has(smKey('P1')) && db3.m.has(smKey('P2')));
  await p3.getManifest('P1', 5000, 5000, lv); // P1 is used again: P2 is the oldest
  await save('P3');
  const keys = [...db3.m.keys()];
  ck(
    'the third picture takes the place of the least recently used one, blocks included',
    !keys.some(k => k.startsWith('sky|P2|')) &&
      keys.some(k => k.startsWith('sky|P1|')) &&
      keys.some(k => k.startsWith('sky|P3|')),
    keys.filter(k => k.includes('P2'))
  );
  ck('the register lists them, newest first', same(db3.m.get('skyreg'), ['P3', 'P1']));
  // the blocks of a picture that was never finished are found by the (unfinished) manifest and removed
  await p3.putSm('P4', blob, 5000, 5000);
  await p3.begin('P4', 5000, 5000, lv);
  await p3.putBlock('P4', 0, 1, 1, blob);
  await save('P5');
  await save('P6');
  ck(
    'what an unfinished picture left is removed with it',
    ![...db3.m.keys()].some(k => k.startsWith('sky|P4|') || k.startsWith('sky|P3|')) &&
      same(db3.m.get('skyreg'), ['P6', 'P5']),
    [...db3.m.keys()].filter(k => k.includes('P4'))
  );
  // a database that cannot be read says null, never throws
  const sick = {
    get: async () => {
      throw new Error('x');
    },
    put: async () => {
      throw new Error('quota');
    },
    del: async () => {},
  };
  const ps = picDb(sick);
  ck(
    'a database that fails: null for reads',
    (await ps.getSm('A')) === null &&
      (await ps.getBlock('A', 0, 0, 0)) === null &&
      (await ps.getManifest('A', 1, 1, [])) === null
  );
  let q = false;
  try {
    await ps.putSm('A', blob, 1, 1);
  } catch (e) {
    q = true;
  }
  ck('...and a write that fails says so', q);
}
// ---- cutting into blocks
{
  const mkCanvas = (log, w, h) => {
    const ctx = {
      clearRect: () => {},
      drawImage: (...a) => log.push({ w, h, a }),
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
      getImageData() {},
    };
    return {
      width: w,
      height: h,
      getContext: () => ctx,
      toBlob(cb, type, q) {
        setTimeout(() => cb(this.nullBlob ? null : { size: w * h, type, q }), 0);
      },
    };
  };
  const levels = levelsOf(12288, 6144),
    log = [],
    made = [],
    make = (w, h) => {
      const c = mkCanvas(log, w, h);
      made.push(c);
      return c;
    },
    puts = [],
    prog = [];
  const r = await buildBlocks({
    bmp: { width: 12288, height: 6144 },
    sw: 12288,
    sh: 6144,
    levels,
    make,
    put: async (lv, i, j, b) => puts.push([lv, i, j, b.type, b.q]),
    progress: p => prog.push(p),
  });
  const per = levels.map(l => l.nx * l.ny);
  ck(
    'every block of every level is saved: 6 x 3 and 3 x 2',
    same(per, [18, 6]) && puts.length === 24 && !r.blocks.size,
    puts.length
  );
  ck('as JPEG at the highest quality', puts.every(p => p[3] === 'image/jpeg' && p[4] === JPEG_Q) && JPEG_Q === 1);
  ck(
    'in the order of the level, row by row',
    same(
      puts.slice(0, 7).map(p => p.slice(0, 3)),
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 2, 0],
        [0, 3, 0],
        [0, 4, 0],
        [0, 5, 0],
        [0, 0, 1],
      ]
    )
  );
  ck(
    'the half level is made first as a reduced picture of its own size (and given up after)',
    made.some(c => c.width === 1 && c.height === 1) && log.some(l => l.w === 6144 && l.h === 3072),
    made.map(c => [c.width, c.height])
  );
  ck('progress goes up to 1', prog.length >= 24 && prog.at(-1) === 1 && prog.every(p => p >= 0 && p <= 1));
  // a database that gives up half way: the rest stays in memory, nothing more is asked of the database
  let k = 0;
  const puts2 = [];
  const r2 = await buildBlocks({
    bmp: { width: 12288, height: 6144 },
    sw: 12288,
    sh: 6144,
    levels,
    make,
    put: async (lv, i, j) => {
      if (++k === 5) throw new Error('quota');
      puts2.push([lv, i, j]);
    },
  });
  ck(
    'after the first block that cannot be saved the database is left alone and the blocks stay in memory',
    puts2.length === 4 && r2.blocks.size === 24 - 4 && r2.blocks.has('0:4,0') && !r2.blocks.has('0:3,0') && k === 5,
    [puts2.length, r2.blocks.size, k]
  );
  // give it up
  let s = 0,
    threw = false;
  try {
    await buildBlocks({
      bmp: { width: 12288, height: 6144 },
      sw: 12288,
      sh: 6144,
      levels,
      make,
      put: async () => {},
      stop: () => ++s > 3,
    });
  } catch (e) {
    threw = e.message === 'stopped';
  }
  ck('stop() gives it up', threw);
}
console.log(bad ? 'skypic: ' + bad + ' FAILED' : 'skypic: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);
