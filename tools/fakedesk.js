// The Tauri API of the desktop program, faked for the browser tests: every call goes to the Python side (tools/fakedesk.py), which keeps a Windows-like file system in memory,
// the scripted file dialogs and the permissions of src-tauri/capabilities. Installed by FakeDesk.install(page); runs before the page does.
(() => {
  const call = async (op, a = {}) => {
    const r = JSON.parse(await window.__fs(JSON.stringify({ op, ...a })));
    if (r.err !== undefined) throw r.err; // the real plugin rejects with a text
    return r.v;
  };
  const toB64 = u8 => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = b => {
    const s = atob(b),
      u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const bytes = b => (b instanceof Uint8Array ? b : new Uint8Array(b.buffer ? b.buffer : b));
  window.__TAURI__ = {
    core: { invoke: (cmd, args) => call('invoke', { cmd, args: args || {} }) },
    dialog: {
      open: o => call('dialog.open', { opts: o || {} }),
      save: o => call('dialog.save', { opts: o || {} }),
    },
    fs: {
      SeekMode: { Start: 0, Current: 1, End: 2 },
      readDir: p => call('readDir', { path: p }),
      readFile: async p => fromB64(await call('readFile', { path: p })),
      readTextFile: p => call('readTextFile', { path: p }),
      writeFile: (p, b) => call('writeFile', { path: p, data: toB64(bytes(b)) }),
      writeTextFile: (p, s) => call('writeTextFile', { path: p, text: String(s) }),
      exists: p => call('exists', { path: p }),
      mkdir: (p, o) => call('mkdir', { path: p, recursive: !!(o && o.recursive) }),
      remove: (p, o) => call('remove', { path: p, recursive: !!(o && o.recursive) }),
      stat: p => call('stat', { path: p }),
      open: async (p, o) => {
        const h = await call('open', { path: p, opts: o || {} });
        return {
          seek: (off, mode) => call('seek', { h, off, mode: mode || 0 }),
          read: async buf => {
            const r = await call('read', { h, len: buf.length });
            if (!r) return null;
            const u = fromB64(r);
            buf.set(u, 0);
            return u.length;
          },
          close: () => call('close', { h }),
        };
      },
    },
  };
})();
