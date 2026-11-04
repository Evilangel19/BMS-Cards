// The map layer of the picture in the BMS folder (a 16K picture of 100 MB and more), drawn tile by tile at full resolution from the saved copies of skypic.js:
// the reduced copy (4096 px) for the wide zoom levels and the blocks of the picture (JPEG in the program's database) for the close ones. The picture file itself is
// read and decoded only the first time (or when the saved copies are gone): every other start shows the map from the database without touching the file.
import { BMS_EXTENT, meshFor, pictureTile, tileSourceRect, warpFrame } from './mapwarp.js';
import {
  BlockStore,
  SM_Q,
  SM_W,
  TileCache,
  blocksIn,
  buildBlocks,
  levelsOf,
  picDb,
  pickLevel,
  reduceInSlices,
} from './skypic.js';

const make = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const BLOCKS_NOTE = 'Preparing the detail for the closest zoom levels…';

/**
 * The Leaflet layer. info = {name, size, read()}: the file (read() gives it whole and is only called when it has to be decoded), db = {get, put, del} of the database,
 * note(text, pct) writes over the map, onSmall(canvas) is told the reduced picture (its brightness decides the colours of the flight plan).
 * The layer has _dispose(), which gives back all the memory and stops what is still being prepared.
 */
export async function createSkyLayer({ L, info, db, note, onSmall }) {
  const sig = 'sky' + (info.name || '') + info.size, // the picture of another theater is never taken for this one
    pdb = picDb(db);
  let dead = false,
    bmp = null,
    bmpP = null;
  // the picture itself: read and decoded when it is needed (the first time, or when the saved copies are gone), not before
  const original = () => {
    if (!bmpP)
      bmpP = (async () => {
        const blob = await info.read();
        note('Decoding the picture…', -1);
        try {
          bmp = await createImageBitmap(blob);
        } catch (e) {
          try {
            bmp = await createImageBitmap(blob, { resizeWidth: 8192, resizeQuality: 'high' });
          } catch (e2) {
            throw new Error('The picture could not be read (is it a PNG / JPG, and is there enough memory?).');
          }
        }
        return bmp;
      })().catch(e => {
        bmpP = null;
        throw e;
      });
    return bmpP;
  };
  const release = () => {
    if (bmp && bmp.close) bmp.close();
    bmp = null;
    bmpP = null;
  };

  // ---- the reduced copy: from the database, or made now (in slices, so that the window does not freeze) and saved
  let sm = null,
    sw = 0,
    sh = 0,
    fresh = false;
  const saved = await pdb.getSm(sig);
  if (saved) {
    try {
      sm = await createImageBitmap(saved.blob);
      sw = saved.sw;
      sh = saved.sh;
    } catch (e) {
      sm = null;
    }
  }
  if (!sm) {
    const b = await original();
    sw = b.width;
    sh = b.height;
    const w = Math.min(SM_W, sw),
      h = Math.max(1, Math.round((sh * w) / sw));
    note('Preparing the map picture…', 0);
    sm = await reduceInSlices(b, sw, sh, w, h, make, p => note('Preparing the map picture…', p));
    fresh = true;
    sm.toBlob(jb => jb && pdb.putSm(sig, jb, sw, sh).catch(() => {}), 'image/jpeg', SM_Q);
  }
  if (onSmall) onSmall(sm);

  // ---- the blocks for the close zoom levels
  const levels = levelsOf(sw, sh, sm.width);
  let ready = false, // the blocks are all saved (or in memory)
    mem = null, // the blocks that could not be saved: a Map of Blobs
    building = false,
    failed = false, // the blocks could not be made: not tried again until the layer is shown again
    rebuilt = 0;
  if (levels.length) ready = !!(await pdb.getManifest(sig, sw, sh, levels).catch(() => null));
  if (!levels.length || ready) release(); // the decoded picture (about 1 GB) is not needed
  const waiting = new Set(); // tiles drawn from the reduced copy that wait for the blocks
  let flush = () => {};
  const needBlocks = async () => {
    if (ready || building || failed || dead || !levels.length) return;
    building = true;
    try {
      const b = await original();
      await pdb.begin(sig, sw, sh, levels).catch(() => {});
      const r = await buildBlocks({
        bmp: b,
        sw,
        sh,
        levels,
        make,
        put: (lv, i, j, blob) => pdb.putBlock(sig, lv, i, j, blob),
        progress: p => !dead && note(BLOCKS_NOTE, p),
        stop: () => dead,
      });
      mem = r.blocks.size ? r.blocks : null;
      if (!mem) await pdb.commit(sig, sw, sh, levels).catch(() => {}); // not kept: they are cut again next time
      ready = true;
      if (!dead) note('');
      flush();
    } catch (e) {
      failed = true;
      if (!dead) note(e.message);
    } finally {
      building = false;
      release();
    }
  };
  // a block that should be in the database is not there or cannot be decoded: the blocks are cut again (once)
  const lost = () => {
    if (!ready || building || dead || rebuilt++ > 0) return;
    ready = false;
    pdb.forget(sig);
    needBlocks();
  };
  const store = new BlockStore({
    levels,
    make,
    capBytes: 384e6,
    get: async (lv, i, j) => (mem && mem.get(lv + ':' + i + ',' + j)) || pdb.getBlock(sig, lv, i, j),
    decode: b => createImageBitmap(b),
    bad: lost,
  });
  if (fresh && levels.length && !ready) needBlocks(); // just decoded: the blocks follow right away

  // ---- the tiles: drawn a few milliseconds per frame, newest first, so panning and zooming stay smooth
  const queue = [],
    tiles = new TileCache(320); // tiles no longer shown, for the way back
  let busy = false;
  const kick = () => {
    if (!busy) {
      busy = true;
      requestAnimationFrame(pump);
    }
  };
  flush = () => {
    // the blocks are ready now: the tiles that were drawn without them are drawn again, in place
    for (const j of waiting) if (!j.cv._dead && j.g === j.cv._g) queue.push(j);
    waiting.clear();
    kick();
  };
  const render = j => {
    const { cv, z, x, y } = j,
      N = meshFor(z);
    let lvl = null,
      ids = null;
    if (levels.length && z >= 9) {
      const r = tileSourceRect(sw, sh, BMS_EXTENT, z, x, y, N);
      if (!r) {
        cv._fin = true; // outside the picture: a blank tile
        return;
      }
      lvl = pickLevel(levels, sm.width, sw, r.scale);
      if (lvl) ids = blocksIn(lvl, sw, sh, r);
    }
    if (!lvl) {
      pictureTile(cv, sm, sm.width, sm.height, BMS_EXTENT, z, x, y, N);
      cv._fin = true;
    } else if (ready && store.has(lvl.id, ids)) {
      if (j.shown) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      pictureTile(cv, store.source(lvl), lvl.w, lvl.h, BMS_EXTENT, z, x, y, N);
      cv._fin = true;
    } else {
      // the detail is not in memory yet: the reduced copy now, the sharp tile when the blocks are there
      if (!j.shown) pictureTile(cv, sm, sm.width, sm.height, BMS_EXTENT, z, x, y, N);
      j.shown = true;
      cv._fin = false;
      if (!ready) {
        if (waiting.size > 400) for (const w of waiting) if (w.cv._dead) waiting.delete(w);
        waiting.add(j);
        needBlocks();
      } else if ((j.tries = (j.tries || 0) + 1) <= 3)
        store.load(lvl.id, ids).then(ok => {
          if (ok && !dead && !cv._dead && j.g === cv._g) {
            queue.push(j);
            kick();
          }
        });
    }
  };
  const pump = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 8) {
      const j = queue.pop();
      if (j.g !== j.cv._g) continue; // the canvas was taken for another tile in the meantime
      if (!j.cv._dead && !j.hit) {
        try {
          render(j);
        } catch (e) {
          /* blank tile */
        }
      }
      if (j.done) {
        const d = j.done;
        j.done = null;
        d(null, j.cv);
      }
    }
    if (queue.length) requestAnimationFrame(pump);
    else busy = false;
  };
  const Lay = L.GridLayer.extend({
    createTile(c, done) {
      const k = c.z + '/' + c.x + '/' + c.y,
        old = tiles.take(k),
        cv = old || make(256, 256);
      cv._dead = false;
      cv._k = k;
      cv._g = (cv._g || 0) + 1;
      queue.push({ cv, done, z: c.z, x: c.x, y: c.y, hit: !!old, g: cv._g });
      kick();
      return cv;
    },
  });
  const bounds = warpFrame(BMS_EXTENT, sw, sh, 4096).bounds,
    lay = new Lay({
      pane: 'tilePane',
      tileSize: 256,
      minZoom: 5,
      maxZoom: 18,
      maxNativeZoom: 13,
      bounds: L.latLngBounds(bounds),
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
    });
  lay.on('tileunload', e => {
    const cv = e.tile;
    cv._dead = true;
    if (cv._fin && cv._k) tiles.put(cv._k, cv);
  });
  // off the map: the memory of the detail is given back (the tiles are drawn again from the database when it comes back)
  lay.on('remove', () => {
    failed = false;
    store.clear();
    tiles.clear();
    waiting.clear();
  });
  lay._dispose = () => {
    dead = true;
    store.dispose();
    tiles.clear();
    waiting.clear();
    queue.length = 0;
    release();
  };
  return lay;
}
