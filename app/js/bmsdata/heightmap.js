// Terrain heights from the theater's HeightMap.raw (read from the user's BMS folder, never copied).
// Format: little-endian signed 16-bit samples in feet, a square grid (side = "map size in pixels" of Theater.txt, otherwise sqrt(file size / 2)),
// covering "theater size in km" (Theater.txt) in both directions; row 0 is the north edge. The big theaters are about 2 GB, so a single sample
// is read at a time with a seek (readAt(offset, length) -> bytes), never the whole file.
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

// several points. The samples of one row of the grid are read with one call (a span of at most 256 KB), not one call per sample: the radar coverage asks for
// tens of thousands of points, and every call to the file of a 2 GB theater is an exchange with the desktop app.
export async function heightsAt(readAt, spec, pts) {
  const offs = pts.map(p => heightOffset(spec, p.n, p.e)),
    out = new Array(pts.length).fill(null),
    rowB = spec ? spec.side * 2 : 1,
    rows = new Map(),
    one = new Map();
  offs.forEach((o, i) => {
    if (o === null) return;
    const r = Math.floor(o / rowB);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(i);
  });
  const single = async i => {
    const o = offs[i];
    if (!one.has(o)) {
      const b = await readAt(o, 2);
      one.set(o, b && b.length >= 2 ? new DataView(b.buffer, b.byteOffset, 2).getInt16(0, true) : null);
    }
    out[i] = one.get(o);
  };
  for (const idx of rows.values()) {
    let lo = Infinity,
      hi = -1;
    for (const i of idx) {
      lo = Math.min(lo, offs[i]);
      hi = Math.max(hi, offs[i]);
    }
    const len = hi - lo + 2;
    if (idx.length > 1 && len <= 262144) {
      const b = await readAt(lo, len);
      if (b && b.length >= len) {
        const dv = new DataView(b.buffer, b.byteOffset, len);
        for (const i of idx) out[i] = dv.getInt16(offs[i] - lo, true);
        continue;
      }
    }
    for (const i of idx) await single(i);
  }
  return out;
}
