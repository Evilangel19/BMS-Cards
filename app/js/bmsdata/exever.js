// @ts-check
// The version of a Windows program (the "File version" of its Details tab), read from the exe itself: the PE headers lead to the
// resource tree, the RT_VERSION resource holds a VS_FIXEDFILEINFO. Only a few small pieces of the file are read (a game exe is large),
// through `read(offset, length)` -> Uint8Array (platform/desktop.js readRange on the desktop). No BMS data is stored or copied.

/** @param {Uint8Array} b @param {number} o */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
/** @param {Uint8Array} b @param {number} o */
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/**
 * @param {(offset: number, length: number) => Promise<Uint8Array>} read
 * @returns {Promise<number[] | null>} [major, minor, build, revision], or null when the file has no version resource
 */
export async function exeVersion(read) {
  try {
    const dos = await read(0, 64);
    if (dos[0] !== 0x4d || dos[1] !== 0x5a) return null; // "MZ"
    const pe = u32(dos, 0x3c);
    const h = await read(pe, 24);
    if (u32(h, 0) !== 0x00004550) return null; // "PE\0\0"
    const nSec = u16(h, 6),
      optSize = u16(h, 20);
    const opt = await read(pe + 24, optSize + nSec * 40);
    const magic = u16(opt, 0);
    const dd = magic === 0x20b ? 112 : 96; // data directories: PE32+ or PE32
    const rsrcRva = u32(opt, dd + 2 * 8);
    if (!rsrcRva) return null;
    const secs = [];
    for (let i = 0; i < nSec; i++) {
      const o = optSize + i * 40;
      secs.push({ va: u32(opt, o + 12), vsize: u32(opt, o + 8), rawSize: u32(opt, o + 16), raw: u32(opt, o + 20) });
    }
    /** @param {number} rva */
    const off = rva => {
      const s = secs.find(x => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rawSize));
      return s ? rva - s.va + s.raw : -1;
    };
    const base = off(rsrcRva);
    if (base < 0) return null;
    /** one level of the resource tree: the entries as [id-or-name field, offset field] */
    const level = async (/** @type {number} */ rel) => {
      const d = await read(base + rel, 16);
      const n = u16(d, 12) + u16(d, 14);
      if (n < 1 || n > 64) return [];
      const e = await read(base + rel + 16, n * 8);
      return Array.from({ length: n }, (_, i) => [u32(e, i * 8), u32(e, i * 8 + 4)]);
    };
    const root = await level(0);
    const ver = root.find(([id]) => id === 16); // RT_VERSION
    if (!ver || !(ver[1] & 0x80000000)) return null;
    const langs = await level(ver[1] & 0x7fffffff);
    if (!langs.length || !(langs[0][1] & 0x80000000)) return null;
    const leaf = await level(langs[0][1] & 0x7fffffff);
    if (!leaf.length || leaf[0][1] & 0x80000000) return null;
    const de = await read(base + leaf[0][1], 8); // data entry: RVA and size of the resource
    const dOff = off(u32(de, 0)),
      dSize = Math.min(u32(de, 4), 16384);
    if (dOff < 0 || dSize < 52) return null;
    const v = await read(dOff, dSize);
    for (let p = 0; p + 52 <= v.length; p += 4) {
      if (u32(v, p) === 0xfeef04bd) {
        const ms = u32(v, p + 8),
          ls = u32(v, p + 12);
        const fixed = [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff];
        if (fixed.some(x => x)) return fixed;
        break;
      }
    }
    // the numbers of the fixed block are 0: the text of the Details tab ("FileVersion" / "ProductVersion", UTF-16) may have it
    const txt = new TextDecoder('utf-16le').decode(v.subarray(0, v.length & ~1));
    for (const key of ['FileVersion', 'ProductVersion']) {
      const m = new RegExp(key + '\\0+(\\d+)[.,\\s]+(\\d+)(?:[.,\\s]+(\\d+))?(?:[.,\\s]+(\\d+))?').exec(txt);
      if (m) return [+m[1], +m[2], +(m[3] || 0), +(m[4] || 0)];
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Compares a program version with the one the readers were checked with ("4.38.1").
 * @param {number[] | null} v
 * @param {string} tested
 * @returns {{ level: 'ok' | 'newer' | 'other' | 'unknown', text: string }}
 */
export function compareVersion(v, tested) {
  if (!v || v.every(x => x === 0)) return { level: 'unknown', text: '' };
  const t = tested.split('.').map(Number),
    text = v.join('.');
  for (let i = 0; i < 3; i++) {
    if ((v[i] || 0) === (t[i] || 0)) continue;
    return { level: i < 2 ? 'other' : (v[i] || 0) > (t[i] || 0) ? 'newer' : 'other', text };
  }
  return { level: 'ok', text };
}
