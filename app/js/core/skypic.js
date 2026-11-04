// The big map picture of the BMS folder (a 16K picture of 100 MB and more) for the map page.
// The picture is read and decoded once: it is cut into blocks of 2048 px that are kept as JPEG in the program's database, and the next sessions never read or decode
// the original again. A tile of the map is drawn from the blocks it touches, decoded when it needs them (a few at a time, the least recently used go first) from the level
// of resolution that fits its zoom: the reduced copy of 4096 px (shown at once at every start), half of the picture (8192 px, only for a picture of 12,288 px or more) or
// the picture itself. The functions that need the browser take it as a parameter (canvas factory, decoder, database), so the logic can be tested without it.
export const BS = 2048; // side of a block, in pixels of its level
export const SM_W = 4096; // width of the reduced copy
// quality of the blocks: the highest. Below 1 the browser keeps only half of the colour resolution (4:2:0), which washes out the thin coloured lines of a chart; at 1 it keeps
// all of it (4:4:4) and the picture stays as it was to the eye (the largest error is a few levels of 255)
export const JPEG_Q = 1;
export const SM_Q = 0.92; // quality of the reduced copy (as in the first versions)
export const VER = 1; // format of the saved blocks
export const MAX_PICS = 2; // pictures (theaters) whose blocks are kept in the database
export const SHARP = 0.8; // a level is sharp enough for a tile when it has at least this many picture pixels per tile pixel

/**
 * The levels that have blocks, from the picture itself down: [{id, w, h, nx, ny}]. A picture that is not wider than the reduced copy has none (the copy is the picture).
 * @param {number} sw
 * @param {number} sh
 * @param {number} [smW]
 */
export function levelsOf(sw, sh, smW = SM_W) {
  if (!(sw > smW)) return [];
  const L = [{ id: 0, w: sw, h: sh }];
  if (sw >= 3 * smW) L.push({ id: 1, w: Math.round(sw / 2), h: Math.round(sh / 2) });
  return L.map(l => ({ ...l, nx: Math.ceil(l.w / BS), ny: Math.ceil(l.h / BS) }));
}
/**
 * The level that draws a tile with `scale` picture pixels per tile pixel (at the size of the picture): the smallest that is still sharp. null = the reduced copy.
 * @param {{id:number,w:number,h:number}[]} levels
 */
export function pickLevel(levels, smW, sw, scale) {
  if (!levels.length || (scale * smW) / sw >= SHARP) return null;
  const up = [...levels].sort((a, b) => a.w - b.w);
  for (const l of up) if ((scale * l.w) / sw >= SHARP) return l;
  return up[up.length - 1];
}
/**
 * The blocks [[i, j], ...] of a level that touch the part of the picture r = {x0, y0, x1, y1} (picture pixels, as tileSourceRect gives it).
 */
export function blocksIn(level, sw, sh, r) {
  const fx = level.w / sw,
    fy = level.h / sh,
    i0 = Math.max(0, Math.floor((r.x0 * fx) / BS)),
    i1 = Math.min(level.nx - 1, Math.floor((r.x1 * fx - 1e-6) / BS)),
    j0 = Math.max(0, Math.floor((r.y0 * fy) / BS)),
    j1 = Math.min(level.ny - 1, Math.floor((r.y1 * fy - 1e-6) / BS)),
    out = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}

/**
 * The tiles that were drawn and are no longer shown, kept for the way back (the least recently used go first). A tile is whatever the owner puts in (a canvas).
 */
export class TileCache {
  constructor(max = 320) {
    this.max = max;
    this.m = new Map();
  }
  put(k, v) {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
  }
  /** the tile, which leaves the cache (it is shown again), or undefined */
  take(k) {
    const v = this.m.get(k);
    if (v !== undefined) this.m.delete(k);
    return v;
  }
  clear() {
    this.m.clear();
  }
  get size() {
    return this.m.size;
  }
}

/**
 * The blocks in memory, decoded. get(lv, i, j) gives the saved block (a Blob; undefined = it is not there, null = it could not be read now) and decode(blob) the bitmap
 * (width, height, close()). Over capBytes the least recently used blocks are closed, except those a load in progress is waiting for.
 * bad(lv, i, j) is told when a block is missing or cannot be decoded; make(w, h) gives a canvas (to put two blocks together).
 */
export class BlockStore {
  constructor({ levels, get, decode, make, bad, capBytes = 384e6 }) {
    this.levels = levels;
    this.get = get;
    this.decode = decode;
    this.make = make;
    this.bad = bad;
    this.cap = capBytes;
    this.m = new Map(); // "lv:i,j" -> {bmp, bytes}
    this.busy = new Map(); // "lv:i,j" -> promise of a block being decoded
    this.held = new Map(); // "lv:i,j" -> loads waiting for it
    this.bytes = 0;
    this.dead = false;
    this.scr = null;
  }
  key(lv, i, j) {
    return lv + ':' + i + ',' + j;
  }
  /** all of these blocks are decoded (they count as used) */
  has(lv, ids) {
    let all = true;
    for (const [i, j] of ids) {
      const k = this.key(lv, i, j),
        b = this.m.get(k);
      if (!b) all = false;
      else {
        this.m.delete(k);
        this.m.set(k, b);
      }
    }
    return all;
  }
  /** decodes the blocks that are not there yet; true when all of them are decoded at the end */
  async load(lv, ids) {
    const keys = ids.map(([i, j]) => this.key(lv, i, j));
    keys.forEach(k => this.held.set(k, (this.held.get(k) || 0) + 1));
    try {
      await Promise.all(ids.map(([i, j]) => this.one(lv, i, j)));
    } finally {
      keys.forEach(k => {
        const n = (this.held.get(k) || 1) - 1;
        if (n) this.held.set(k, n);
        else this.held.delete(k);
      });
      this.trim();
    }
    return !this.dead && this.has(lv, ids);
  }
  one(lv, i, j) {
    const k = this.key(lv, i, j);
    if (this.m.has(k)) return Promise.resolve();
    if (this.busy.has(k)) return this.busy.get(k);
    const p = (async () => {
      const blob = await this.get(lv, i, j);
      if (this.dead) return;
      if (!blob) {
        if (blob === undefined && this.bad) this.bad(lv, i, j);
        return;
      }
      let bmp;
      try {
        bmp = await this.decode(blob);
      } catch (e) {
        if (this.bad) this.bad(lv, i, j);
        return;
      }
      if (this.dead) {
        if (bmp.close) bmp.close();
        return;
      }
      const bytes = bmp.width * bmp.height * 4;
      this.m.set(k, { bmp, bytes });
      this.bytes += bytes;
      this.trim();
    })()
      .catch(() => {})
      .finally(() => this.busy.delete(k));
    this.busy.set(k, p);
    return p;
  }
  trim() {
    for (const [k, b] of this.m) {
      if (this.bytes <= this.cap) break;
      if (this.held.has(k)) continue;
      this.m.delete(k);
      this.bytes -= b.bytes;
      if (b.bmp.close) b.bmp.close();
    }
  }
  /** the decoded blocks go (the memory is given back); they are decoded again when a tile needs them */
  clear() {
    for (const b of this.m.values()) if (b.bmp.close) b.bmp.close();
    this.m.clear();
    this.bytes = 0;
    this.scr = null;
  }
  dispose() {
    this.dead = true;
    this.clear();
  }
  /**
   * What pictureTile draws from, for one level: {sw, sh, draw(c, x0, y0, x1, y1)} (picture pixels of the level). The part asked for comes from the blocks that are
   * decoded; when it lies over two blocks or more they are put together at 1:1 first, so that no seam shows where the edges of two blocks meet.
   */
  source(level) {
    const parts = (x0, y0, x1, y1) => {
      const out = [],
        i0 = Math.max(0, Math.floor(x0 / BS)),
        i1 = Math.min(level.nx - 1, Math.floor((x1 - 1e-6) / BS)),
        j0 = Math.max(0, Math.floor(y0 / BS)),
        j1 = Math.min(level.ny - 1, Math.floor((y1 - 1e-6) / BS));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const b = this.m.get(this.key(level.id, i, j));
          if (!b) continue;
          const bx = i * BS,
            by = j * BS,
            ix0 = Math.max(x0, bx),
            iy0 = Math.max(y0, by),
            ix1 = Math.min(x1, bx + b.bmp.width),
            iy1 = Math.min(y1, by + b.bmp.height);
          if (ix1 > ix0 && iy1 > iy0)
            out.push({ bmp: b.bmp, sx: ix0 - bx, sy: iy0 - by, w: ix1 - ix0, h: iy1 - iy0, x: ix0, y: iy0 });
        }
      return out;
    };
    return {
      sw: level.w,
      sh: level.h,
      draw: (c, x0, y0, x1, y1) => {
        x0 = Math.floor(x0);
        y0 = Math.floor(y0);
        x1 = Math.ceil(x1);
        y1 = Math.ceil(y1);
        const ps = parts(x0, y0, x1, y1);
        if (ps.length < 2 || !this.make) {
          for (const p of ps) c.drawImage(p.bmp, p.sx, p.sy, p.w, p.h, p.x, p.y, p.w, p.h);
          return;
        }
        const w = x1 - x0,
          h = y1 - y0;
        let s = this.scr;
        if (!s || s.width !== w || s.height !== h) s = this.scr = this.make(w, h);
        const sc = s.getContext('2d');
        sc.clearRect(0, 0, w, h);
        for (const p of ps) sc.drawImage(p.bmp, p.sx, p.sy, p.w, p.h, p.x - x0, p.y - y0, p.w, p.h);
        c.drawImage(s, 0, 0, w, h, x0, y0, w, h);
      },
    };
  }
}

const turn = () => new Promise(r => setTimeout(r, 0));
const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
const stopped = stop => {
  if (stop && stop()) throw new Error('stopped');
};
/**
 * `src` (a bitmap or canvas of sw x sh pixels) on a new canvas of w x h pixels, made in slices: after each one the work is done (flush) and the page has its turn,
 * so the window does not freeze for the seconds a 16K picture takes. A slice is drawn from a few more rows than it shows, so the filter at its edges sees the same
 * pixels as in one go. make(w, h) gives a canvas; progress(0..1) after each slice; stop() true = give up (throws).
 */
export async function reduceInSlices(src, sw, sh, w, h, make, progress, slices = 32, stop) {
  const cv = make(w, h),
    c = cv.getContext('2d'),
    k = sh / h,
    rows = Math.max(1, Math.ceil(h / slices)),
    pad = Math.ceil(k * 2) + 2;
  c.imageSmoothingQuality = 'high';
  for (let y0 = 0; y0 < h; y0 += rows) {
    stopped(stop);
    const y1 = Math.min(h, y0 + rows),
      s0 = Math.max(0, Math.floor(y0 * k) - pad),
      s1 = Math.min(sh, Math.ceil(y1 * k) + pad);
    c.save();
    c.beginPath();
    c.rect(0, y0, w, y1 - y0);
    c.clip();
    c.drawImage(src, 0, s0, sw, s1 - s0, 0, s0 / k, w, (s1 - s0) / k);
    c.restore();
    c.getImageData(0, y0, 1, 1); // the slice is drawn now
    if (progress) progress(y1 / h);
    await turn();
  }
  return cv;
}

// ---- what is kept in the database -------------------------------------------------------------------------------------------------------------------------------
// per picture (signature = name + size of the file): the reduced copy, the blocks and the manifest, which says what the blocks are and, when it is finished, that they
// are all there (it is written first, as not finished, so that the blocks of a picture that was never completed can still be found and removed)
export const smKey = sig => 'sky|' + sig + '|sm';
export const manKey = sig => 'sky|' + sig + '|man';
export const blockKey = (sig, lv, i, j) => 'sky|' + sig + '|' + lv + '|' + i + ',' + j;
export const REG = 'skyreg';

/**
 * The saved copies of the pictures. idb = {get, put, del} of the database (values are kept as they are, Blobs too).
 * A picture is kept with its reduced copy and its blocks; at most MAX_PICS pictures stay (the least recently used one goes when another is saved).
 */
export function picDb(idb) {
  const safe = async f => {
    try {
      return await f();
    } catch (e) {
      return null;
    }
  };
  const drop = async sig => {
    const man = await safe(() => idb.get(manKey(sig)));
    if (man && man.levels)
      for (const l of man.levels)
        for (let j = 0; j < l.ny; j++)
          for (let i = 0; i < l.nx; i++) await safe(() => idb.del(blockKey(sig, l.id, i, j)));
    await safe(() => idb.del(manKey(sig)));
    await safe(() => idb.del(smKey(sig)));
  };
  const touch = async sig => {
    const reg = ((await safe(() => idb.get(REG))) || []).filter(s => s !== sig);
    reg.unshift(sig);
    const gone = reg.splice(MAX_PICS);
    await safe(() => idb.put(REG, reg));
    for (const g of gone) await drop(g);
  };
  const manifest = (sig, sw, sh, levels, done) => ({
    v: VER,
    sig,
    sw,
    sh,
    bs: BS,
    q: JPEG_Q,
    levels,
    done,
    t: Date.now(),
  });
  return {
    /** {blob, sw, sh} of the reduced copy, or null; the copy of the first versions (one slot, 'skysm') is taken over */
    async getSm(sig) {
      const c = await safe(() => idb.get(smKey(sig)));
      if (c && c.sig === sig && c.blob) return c;
      const old = await safe(() => idb.get('skysm'));
      if (old && old.sig === sig && old.blob) {
        await safe(() => idb.put(smKey(sig), old));
        await safe(() => idb.del('skysm'));
        await touch(sig);
        return old;
      }
      return null;
    },
    async putSm(sig, blob, sw, sh) {
      await idb.put(smKey(sig), { sig, blob, sw, sh });
      await touch(sig);
    },
    /** the manifest when the blocks are all there and fit this picture and these levels, else null (the blocks are cut again) */
    async getManifest(sig, sw, sh, levels) {
      const m = await safe(() => idb.get(manKey(sig)));
      const same =
        m &&
        m.done === true &&
        m.v === VER &&
        m.sig === sig &&
        m.sw === sw &&
        m.sh === sh &&
        m.bs === BS &&
        m.levels &&
        m.levels.length === levels.length &&
        levels.every((l, k) => m.levels[k].id === l.id && m.levels[k].w === l.w && m.levels[k].h === l.h);
      if (same) await touch(sig);
      return same ? m : null;
    },
    /** the blocks are about to be cut: the manifest is written as not finished */
    begin: (sig, sw, sh, levels) => idb.put(manKey(sig), manifest(sig, sw, sh, levels, false)),
    /** the block (a Blob), undefined when it is not there, null when the database could not be read */
    getBlock: (sig, lv, i, j) => safe(() => idb.get(blockKey(sig, lv, i, j))),
    putBlock: (sig, lv, i, j, blob) => idb.put(blockKey(sig, lv, i, j), blob),
    /** every block is saved: the manifest says so (and the oldest pictures beyond MAX_PICS go) */
    async commit(sig, sw, sh, levels) {
      await idb.put(manKey(sig), manifest(sig, sw, sh, levels, true));
      await touch(sig);
    },
    /** the manifest goes: the blocks are cut again at the next need (a block could not be read) */
    forget: sig => safe(() => idb.del(manKey(sig))),
    drop,
  };
}

/**
 * Cuts the decoded picture into the blocks of every level, as JPEG. put(lv, i, j, blob) keeps one in the database (it may throw: that block, and the ones after it, are
 * then only in memory). Returns {blocks}: a Map keyed by "lv:i,j" with the blocks that could not be saved (empty when all of them are). make(w, h) gives a canvas;
 * progress(0..1); stop() true = give up (throws).
 */
export async function buildBlocks({ bmp, sw, sh, levels, make, put, progress, stop }) {
  const out = new Map(),
    total = levels.reduce((n, l) => n + l.nx * l.ny, 0) + (levels.length > 1 ? 1 : 0),
    cvs = new Map();
  let done = 0,
    failed = false;
  const step = () => progress && progress(Math.min(1, done / total));
  for (const l of levels) {
    let src = bmp,
      rs = null;
    if (l.w !== sw) {
      // a level that is a reduction of the picture: made in slices, then cut
      rs = await reduceInSlices(
        bmp,
        sw,
        sh,
        l.w,
        l.h,
        make,
        p => progress && progress(Math.min(1, (done + p) / total)),
        32,
        stop
      );
      src = rs;
      done++;
    }
    for (let j = 0; j < l.ny; j++)
      for (let i = 0; i < l.nx; i++) {
        stopped(stop);
        const w = Math.min(BS, l.w - i * BS),
          h = Math.min(BS, l.h - j * BS);
        let cv = cvs.get(w + 'x' + h);
        if (!cv) cvs.set(w + 'x' + h, (cv = make(w, h))); // one canvas for every block of the same size
        const c = cv.getContext('2d');
        c.clearRect(0, 0, w, h);
        c.drawImage(src, i * BS, j * BS, w, h, 0, 0, w, h);
        const blob = await toBlob(cv, 'image/jpeg', JPEG_Q);
        if (!blob) throw new Error('A block of the picture could not be saved.');
        if (!failed) {
          try {
            await put(l.id, i, j, blob);
          } catch (e) {
            failed = true; // no room in the database (or no database): the blocks stay in memory for this session
          }
        }
        if (failed) out.set(l.id + ':' + i + ',' + j, blob);
        done++;
        step();
        await turn();
      }
    if (rs) {
      rs.width = rs.height = 1; // the reduced picture is not needed any more
      rs = null;
    }
  }
  for (const cv of cvs.values()) cv.width = cv.height = 1;
  return { blocks: out };
}
