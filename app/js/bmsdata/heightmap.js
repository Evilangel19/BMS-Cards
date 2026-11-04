// Terrain heights from the theater's HeightMap.raw (read from the user's BMS folder, never copied).
// Format: little-endian signed 16-bit samples in feet, a square grid (side = "map size in pixels" of Theater.txt, otherwise sqrt(file size / 2)),
// covering "theater size in km" (Theater.txt) in both directions; row 0 is the north edge. The big theaters are about 2 GB, so only small pieces are
// read with a seek (readAt(offset, length) -> bytes): a sample, the span of a row or one row of the grid (about 64 KB), never the whole file.
export const FT_M = 0.3048;
export const DEFAULT_SIDE = 32768;

// Theater.txt: "name = value" lines
export function parseTheaterValues(text) {
  const o = {};
  for (const l of String(text).split(/\r?\n/)) {
    const m = l.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (m) o[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return o;
}

// {side, sizeFt} from the Theater.txt values and the size of the .raw file (bytes)
export function heightSpec(values, fileBytes, fallbackKm) {
  const km = parseFloat(values['theater size in km']) || fallbackKm;
  if (!(km > 0)) return null;
  let side = Math.round(parseFloat(values['map size in pixels']));
  if (!(side > 0)) {
    const r = Math.round(Math.sqrt(fileBytes / 2));
    side = r > 0 && r * r === fileBytes / 2 ? r : DEFAULT_SIDE;
  }
  return { side, sizeFt: (km * 1000) / FT_M };
}

// byte offset of the sample for a point in BMS north / east feet; null outside the theater
export function heightOffset(spec, n, e) {
  if (!spec || !(n >= 0 && n <= spec.sizeFt && e >= 0 && e <= spec.sizeFt)) return null;
  const x = Math.min(spec.side - 1, Math.max(0, Math.floor((e / spec.sizeFt) * (spec.side - 1)))),
    y = Math.min(spec.side - 1, Math.max(0, Math.floor((1 - n / spec.sizeFt) * (spec.side - 1))));
  return (y * spec.side + x) * 2;
}

// elevation in feet (whole number) or null (outside the theater / file too short)
export async function heightAt(readAt, spec, n, e) {
  const off = heightOffset(spec, n, e);
  if (off === null) return null;
  const b = await readAt(off, 2);
  if (!b || b.length < 2) return null;
  return new DataView(b.buffer, b.byteOffset, 2).getInt16(0, true);
}

// A cache of whole rows of the file (a row of a big theater is about 64 KB). The MSA and the radar coverage ask for points of the same rows again and
// again (the next flight on the same front, the next airbase), so a row that was read once is kept, up to maxBytes; the least recently used goes first.
export function createRowCache(maxBytes = 64e6) {
  const m = new Map();
  let total = 0;
  return {
    get(r) {
      const b = m.get(r);
      if (b) {
        m.delete(r);
        m.set(r, b);
      }
      return b;
    },
    set(r, b) {
      if (m.has(r)) total -= m.get(r).length;
      m.delete(r);
      m.set(r, b);
      total += b.length;
      for (const [k, v] of m) {
        if (total <= maxBytes || m.size <= 1) break;
        m.delete(k);
        total -= v.length;
      }
    },
    clear() {
      m.clear();
      total = 0;
    },
    get size() {
      return m.size;
    },
    get bytes() {
      return total;
    },
  };
}
const SPAN_MAX = 262144; // the longest piece read in one call

/**
 * Several points. The samples of one row of the grid are read with one call (a span of at most 256 KB), not one call per sample: the radar coverage asks for
 * tens of thousands of points, and every call to the file of a 2 GB theater is an exchange with the desktop app.
 * opt.readMany(spans) reads a list of [offset, length] pieces in one go (several at a time, the file opened once) and gives the pieces in the same order;
 * opt.rows (createRowCache) makes a row with two or more points be read whole and kept.
 * @param {(offset:number, length:number) => Promise<Uint8Array|null>} readAt
 * @param {{side:number, sizeFt:number}|null} spec
 * @param {{n:number, e:number}[]} pts
 * @param {{ readMany?: (spans:number[][]) => Promise<(Uint8Array|null)[]>, rows?: ReturnType<typeof createRowCache> }} [opt]
 */
export async function heightsAt(readAt, spec, pts, opt) {
  const offs = pts.map(p => heightOffset(spec, p.n, p.e)),
    out = new Array(pts.length).fill(null),
    rowB = spec ? spec.side * 2 : 1,
    rows = new Map(),
    cache = opt && opt.rows,
    many = opt && opt.readMany;
  offs.forEach((o, i) => {
    if (o === null) return;
    const r = Math.floor(o / rowB);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(i);
  });
  // the samples of the points idx, out of the bytes b that start at the file offset base
  const put = (idx, base, b) => {
    const dv = new DataView(b.buffer, b.byteOffset, b.length);
    for (const i of idx) {
      const q = offs[i] - base;
      out[i] = q >= 0 && q + 2 <= b.length ? dv.getInt16(q, true) : null;
    }
  };
  // read the pieces (all at once through readMany, otherwise one after the other); a piece that was not read whole is null
  const readAll = async jobs => {
    const spans = jobs.map(j => [j.lo, j.len]);
    if (many) {
      const r = await many(spans);
      return jobs.map((_, k) => (r && r[k]) || null);
    }
    const r = [];
    for (const [o, l] of spans) r.push(await readAt(o, l));
    return r;
  };
  const jobs = [], // pieces to read: {lo, len, idx, row} (row: a whole row, to be kept)
    alone = []; // the points that are read one by one (a row with a single point, a span that is too long)
  for (const [r, idx] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (idx.length < 2) {
      alone.push(...idx);
      continue;
    }
    if (cache && rowB <= SPAN_MAX) {
      const b = cache.get(r);
      if (b) put(idx, r * rowB, b);
      else jobs.push({ lo: r * rowB, len: rowB, idx, row: r });
      continue;
    }
    let lo = Infinity,
      hi = -1;
    for (const i of idx) {
      lo = Math.min(lo, offs[i]);
      hi = Math.max(hi, offs[i]);
    }
    if (hi - lo + 2 <= SPAN_MAX) jobs.push({ lo, len: hi - lo + 2, idx });
    else alone.push(...idx);
  }
  // one sample each; points on the same sample share the read
  const single = list => {
    const by = new Map();
    for (const i of list) {
      if (!by.has(offs[i])) by.set(offs[i], []);
      by.get(offs[i]).push(i);
    }
    return [...by].sort((a, b) => a[0] - b[0]).map(([lo, idx]) => ({ lo, len: 2, idx }));
  };
  const first = jobs.concat(single(alone)).sort((a, b) => a.lo - b.lo), // in the order of the file
    res = await readAll(first),
    retry = [];
  first.forEach((j, k) => {
    const b = res[k];
    if (b && b.length >= j.len) {
      put(j.idx, j.lo, b);
      if (j.row !== undefined) cache.set(j.row, b);
    } else if (j.len > 2)
      retry.push(...j.idx); // a short answer: the samples are asked one by one
    else if (b && b.length >= 2) put(j.idx, j.lo, b);
  });
  if (retry.length) {
    const again = single(retry),
      r2 = await readAll(again);
    again.forEach((j, k) => {
      if (r2[k] && r2[k].length >= 2) put(j.idx, j.lo, r2[k]);
    });
  }
  return out;
}
