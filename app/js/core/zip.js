// @ts-check
// A small ZIP reader and writer for the backup file ("Export my data" and "Import > Choose backup file").
// The writer stores the files without compression (each one with its CRC-32). The reader also opens zips made by other programs (stored or deflated); it does not
// open encrypted zips or ZIP64 (more than 4 GB), and says so.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const LIMIT = 0xfffffffe; // ZIP64 is not supported: 4 GB at most
// MS-DOS date and time of a zip entry
const dos = d => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  day: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

/** Builds a zip in memory. new ZipWriter(sizeHint).add(name, bytes) ... .finish() -> Uint8Array */
export class ZipWriter {
  /** @param {number} [sizeHint] the total size of the files, if known (one allocation) */
  constructor(sizeHint = 0) {
    this.buf = new Uint8Array(Math.max(4096, sizeHint + 2048));
    this.len = 0;
    /** @type {{nm:Uint8Array, crc:number, size:number, off:number, time:number, day:number}[]} */
    this.items = [];
    this.names = new Set();
  }
  /** @param {number} n */
  _need(n) {
    if (this.len + n <= this.buf.length) return;
    let c = this.buf.length * 2;
    while (c < this.len + n) c *= 2;
    const b = new Uint8Array(c);
    b.set(this.buf.subarray(0, this.len));
    this.buf = b;
  }
  /**
   * @param {string} name path inside the zip, with "/"
   * @param {Uint8Array} data
   * @param {Date} [date]
   */
  add(name, data, date = new Date()) {
    const nm = enc.encode(name);
    if (!nm.length || nm.length > 65535) throw new Error('Bad name in the zip: ' + name);
    if (this.names.has(name.toLowerCase())) throw new Error('Twice in the zip: ' + name);
    if (this.items.length >= 65534) throw new Error('Too many files for one zip.');
    if (this.len + 30 + nm.length + data.length > LIMIT) throw new Error('The backup would be larger than 4 GB.');
    this.names.add(name.toLowerCase());
    const crc = crc32(data),
      off = this.len,
      { time, day } = dos(date);
    this._need(30 + nm.length + data.length);
    const dv = new DataView(this.buf.buffer);
    dv.setUint32(off, 0x04034b50, true);
    dv.setUint16(off + 4, 20, true); // version needed
    dv.setUint16(off + 6, 0x0800, true); // flags: names in UTF-8
    dv.setUint16(off + 8, 0, true); // stored
    dv.setUint16(off + 10, time, true);
    dv.setUint16(off + 12, day, true);
    dv.setUint32(off + 14, crc, true);
    dv.setUint32(off + 18, data.length, true);
    dv.setUint32(off + 22, data.length, true);
    dv.setUint16(off + 26, nm.length, true);
    dv.setUint16(off + 28, 0, true);
    this.buf.set(nm, off + 30);
    this.buf.set(data, off + 30 + nm.length);
    this.len = off + 30 + nm.length + data.length;
    this.items.push({ nm, crc, size: data.length, off, time, day });
  }
  finish() {
    const cdStart = this.len;
    let cdLen = 0;
    for (const it of this.items) cdLen += 46 + it.nm.length;
    if (cdStart + cdLen + 22 > LIMIT) throw new Error('The backup would be larger than 4 GB.');
    this._need(cdLen + 22);
    const dv = new DataView(this.buf.buffer);
    let p = this.len;
    for (const it of this.items) {
      dv.setUint32(p, 0x02014b50, true);
      dv.setUint16(p + 4, 20, true); // made by
      dv.setUint16(p + 6, 20, true); // needed
      dv.setUint16(p + 8, 0x0800, true);
      dv.setUint16(p + 10, 0, true);
      dv.setUint16(p + 12, it.time, true);
      dv.setUint16(p + 14, it.day, true);
      dv.setUint32(p + 16, it.crc, true);
      dv.setUint32(p + 20, it.size, true);
      dv.setUint32(p + 24, it.size, true);
      dv.setUint16(p + 28, it.nm.length, true);
      dv.setUint16(p + 30, 0, true); // extra
      dv.setUint16(p + 32, 0, true); // comment
      dv.setUint16(p + 34, 0, true); // disk
      dv.setUint16(p + 36, 0, true); // internal attributes
      dv.setUint32(p + 38, 0, true); // external attributes
      dv.setUint32(p + 42, it.off, true);
      this.buf.set(it.nm, p + 46);
      p += 46 + it.nm.length;
    }
    dv.setUint32(p, 0x06054b50, true);
    dv.setUint16(p + 4, 0, true);
    dv.setUint16(p + 6, 0, true);
    dv.setUint16(p + 8, this.items.length, true);
    dv.setUint16(p + 10, this.items.length, true);
    dv.setUint32(p + 12, cdLen, true);
    dv.setUint32(p + 16, cdStart, true);
    dv.setUint16(p + 20, 0, true);
    this.len = p + 22;
    return this.buf.subarray(0, this.len);
  }
}

/** @param {Uint8Array} data */
async function inflateRaw(data) {
  if (typeof DecompressionStream == 'undefined') throw new Error('This file is compressed and cannot be opened here.');
  const ds = new DecompressionStream('deflate-raw'),
    w = ds.writable.getWriter();
  w.write(data).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * @param {Uint8Array} bytes the whole zip
 * @returns {{entries:{name:string, size:number, packed:number, method:number, crc:number, offset:number, dir:boolean}[], read:(e:{name:string, size:number, packed:number, method:number, crc:number, offset:number})=>Promise<Uint8Array>}}
 */
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    n = bytes.length;
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('This is not a zip file (or it is damaged).');
  const count = dv.getUint16(eocd + 10, true),
    cdLen = dv.getUint32(eocd + 12, true),
    cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdLen === 0xffffffff || cdOff === 0xffffffff)
    throw new Error('This zip is too large or uses a format that is not supported (ZIP64).');
  if (cdOff + cdLen > n) throw new Error('The zip file is damaged (it ends too soon).');
  const entries = [];
  let p = cdOff;
  const utf8 = new TextDecoder('utf-8', { fatal: true }),
    latin = new TextDecoder('latin1');
  for (let i = 0; i < count; i++) {
    if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const flags = dv.getUint16(p + 8, true),
      method = dv.getUint16(p + 10, true),
      crc = dv.getUint32(p + 16, true),
      packed = dv.getUint32(p + 20, true),
      size = dv.getUint32(p + 24, true),
      nl = dv.getUint16(p + 28, true),
      xl = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true),
      offset = dv.getUint32(p + 42, true);
    if (p + 46 + nl > n) throw new Error('The zip file is damaged.');
    const raw = bytes.subarray(p + 46, p + 46 + nl);
    let name;
    try {
      name = utf8.decode(raw);
    } catch (e) {
      name = latin.decode(raw);
    }
    if (flags & 1) throw new Error('This zip is protected by a password: it cannot be opened here.');
    if (packed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff)
      throw new Error('This zip is too large or uses a format that is not supported (ZIP64).');
    entries.push({ name, size, packed, method, crc, offset, dir: /\/$/.test(name) || /\\$/.test(name) });
    p += 46 + nl + xl + cl;
  }
  const read = async e => {
    const o = e.offset;
    if (o + 30 > n || dv.getUint32(o, true) !== 0x04034b50) throw new Error('The zip file is damaged: ' + e.name);
    const start = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
    if (start + e.packed > n) throw new Error('The zip file is damaged: ' + e.name);
    const raw = bytes.subarray(start, start + e.packed);
    let out;
    if (e.method === 0) out = raw;
    else if (e.method === 8) {
      try {
        out = await inflateRaw(raw);
      } catch (x) {
        throw new Error('The zip file is damaged: ' + e.name);
      }
    } else throw new Error('This zip uses a kind of compression that is not supported: ' + e.name);
    if (out.length !== e.size || crc32(out) !== e.crc) throw new Error('The zip file is damaged: ' + e.name);
    return out;
  };
  return { entries, read };
}
