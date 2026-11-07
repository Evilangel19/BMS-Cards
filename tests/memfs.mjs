// A file system in memory for the tests of the data move, made to behave like the one of Windows where it matters: "\" separators, the case of a name does not count,
// a file can be written only in a folder that exists, a folder can be listed only if it exists.
// memfs() -> { io, put(path, text|bytes), text(path), bytes(path), has(path), paths(prefix), writes }   (io is the object core/transferrun.js wants)
const enc = new TextEncoder(),
  dec = new TextDecoder();
export function memfs() {
  const files = new Map(), // key -> {path, bytes}
    dirs = new Map(); // key -> path
  const writes = [];
  const key = p => String(p).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const up = p => String(p).replace(/[\\/][^\\/]*$/, '');
  const isRoot = p => /^[A-Za-z]:$/.test(String(p).replace(/[\\/]+$/, ''));
  const dirExists = p => isRoot(p) || dirs.has(key(p));
  const mk = p => {
    if (isRoot(p) || dirs.has(key(p))) return;
    if (!up(p) || up(p) === p) return;
    mk(up(p));
    dirs.set(key(p), p);
  };
  const toBytes = d => (typeof d == 'string' ? enc.encode(d) : new Uint8Array(d));
  const fail = (p, what) => {
    const e = new Error(
      'The system cannot find the ' + what + ' specified. (os error ' + (what == 'path' ? 3 : 2) + '): ' + p
    );
    throw e;
  };
  const io = {
    join: (d, f) => String(d).replace(/[\\/]+$/, '') + '\\' + f,
    async list(dir) {
      if (!dirExists(dir)) fail(dir, 'path');
      const k = key(dir) + '\\',
        out = new Map();
      for (const [kk, f] of files)
        if (kk.startsWith(k) && !kk.slice(k.length).includes('\\'))
          out.set(kk, { name: f.path.split(/[\\/]/).pop(), isDirectory: false });
      for (const [kk, p] of dirs)
        if (kk.startsWith(k) && !kk.slice(k.length).includes('\\'))
          out.set(kk, { name: p.split(/[\\/]/).pop(), isDirectory: true });
      return [...out.values()];
    },
    async read(p) {
      const f = files.get(key(p));
      if (!f) fail(p, 'file');
      return new Uint8Array(f.bytes);
    },
    async write(p, bytes) {
      if (!dirExists(up(p))) fail(p, 'path');
      if (io.failOn && io.failOn.test(p)) throw new Error('Access is denied. (os error 5)');
      files.set(key(p), { path: p, bytes: toBytes(bytes) });
      writes.push(p);
    },
    async mkdir(p) {
      mk(p);
    },
    async exists(p) {
      return files.has(key(p)) || dirExists(p);
    },
    async size(p) {
      const f = files.get(key(p));
      if (!f) fail(p, 'file');
      return f.bytes.length;
    },
    failOn: null,
  };
  return {
    io,
    writes,
    put(p, data) {
      mk(up(p));
      files.set(key(p), { path: p, bytes: toBytes(data) });
    },
    mkdir: mk,
    text: p => dec.decode(files.get(key(p)).bytes),
    bytes: p => files.get(key(p)).bytes,
    has: p => files.has(key(p)) || dirs.has(key(p)),
    paths: (prefix = '') =>
      [...files.values()]
        .map(f => f.path)
        .filter(p => key(p).startsWith(key(prefix)))
        .sort(),
    clearWrites: () => (writes.length = 0),
  };
}
