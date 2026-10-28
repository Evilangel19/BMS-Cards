// Desktop integration (Tauri) with browser fallbacks: config file next to the exe, file dialogs, saving files.
import { DEFAULTS, mergeConfig } from '../config/config.js';
import { safeLoad, safeSave } from '../core/prefs.js';

const T = () => window.__TAURI__;
export const isDesktop = () => !!(T() && T().core && T().dialog && T().fs);
const sep = d => (d.includes('\\') ? '\\' : '/');
export const join = (d, f) => d.replace(/[\\/]+$/, '') + sep(d) + f;
const base = p => p.split(/[\\/]/).pop();

export async function detectBms() {
  try {
    return (await T().core.invoke('detect_bms')) || '';
  } catch (e) {
    return '';
  }
}
// a piece of an .exe (the file plugin does not open executables, see src-tauri/capabilities): through a small command of the program
export async function readExeRange(path, offset, len) {
  const a = await T().core.invoke('read_exe_range', { path, offset, len });
  return new Uint8Array(a);
}
export async function appDir() {
  return T().core.invoke('app_dir');
}

// ---- config ---------------------------------------------------------------
export async function loadConfig() {
  if (isDesktop()) {
    const dir = await appDir(),
      path = join(dir, 'config.json');
    let text;
    try {
      text = await T().fs.readTextFile(path);
    } catch (e) {
      // first run: create the file with defaults
      try {
        await T().fs.writeTextFile(path, JSON.stringify(DEFAULTS, null, 2) + '\n');
      } catch (e2) {
        /* read-only folder */
      }
      return { config: mergeConfig(undefined).config, warnings: [], location: path };
    }
    let user;
    try {
      user = JSON.parse(text);
    } catch (e) {
      return {
        ...mergeConfig(undefined),
        warnings: ['config.json is not valid JSON; defaults used (the file was not changed)'],
        location: path,
      };
    }
    return { ...mergeConfig(user), location: path };
  }
  let user;
  try {
    user = JSON.parse(localStorage.getItem('bmscards.config'));
  } catch (e) {
    user = undefined;
  }
  return { ...mergeConfig(user === null ? undefined : user), location: 'browser storage' };
}

export async function saveConfig(cfg) {
  const text = JSON.stringify(cfg, null, 2) + '\n';
  if (isDesktop()) {
    await T().fs.writeTextFile(join(await appDir(), 'config.json'), text);
    return;
  }
  try {
    localStorage.setItem('bmscards.config', text);
  } catch (e) {
    /* ignore */
  }
}

// ---- dialogs --------------------------------------------------------------
export async function pickFile({ exts, startDir, title }) {
  if (isDesktop()) {
    const path = await T().dialog.open({
      title,
      defaultPath: startDir || undefined,
      multiple: false,
      directory: false,
      filters: [{ name: exts.join(', '), extensions: exts.map(e => e.replace(/^\./, '')) }],
    });
    if (!path) return null;
    const bytes = await T().fs.readFile(path);
    const f = new File([bytes], base(path));
    f.path = path;
    return f; // the location is kept so that a file can be written back
  }
  try {
    if (window.showOpenFilePicker) {
      const [h] = await showOpenFilePicker({
        types: [{ accept: { 'application/octet-stream': exts.map(e => '.' + e.replace(/^\./, '')) } }],
      });
      return await h.getFile();
    }
    return await new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = exts.map(e => '.' + e.replace(/^\./, '')).join(',');
      i.onchange = () => res(i.files[0] || null);
      i.click();
    });
  } catch (e) {
    return null;
  }
}

// Several files at once (images, PDF...). Returns an array of File objects (empty if cancelled).
export async function pickFiles({ exts, startDir, title }) {
  if (isDesktop()) {
    const paths = await T().dialog.open({
      title,
      defaultPath: startDir || undefined,
      multiple: true,
      directory: false,
      filters: [{ name: exts.join(', '), extensions: exts.map(e => e.replace(/^\./, '')) }],
    });
    if (!paths) return [];
    return Promise.all(
      (Array.isArray(paths) ? paths : [paths]).map(async p => new File([await T().fs.readFile(p)], base(p)))
    );
  }
  return await new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file';
    i.multiple = true;
    i.accept = exts.map(e => '.' + e.replace(/^\./, '')).join(',');
    i.onchange = () => res([...i.files]);
    i.oncancel = () => res([]);
    i.click();
  });
}

export async function pickFolder({ startDir, title }) {
  if (!isDesktop()) return null;
  return (
    (await T().dialog.open({ title, defaultPath: startDir || undefined, directory: true, multiple: false })) || null
  );
}

// ---- saving ---------------------------------------------------------------
export async function saveBlob(blob, name, startDir) {
  if (isDesktop()) {
    try {
      const ext = (name.match(/\.([^.]+)$/) || [, ''])[1];
      const path = await T().dialog.save({
        defaultPath: startDir ? join(startDir, name) : name,
        filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
      });
      if (!path) return;
      await T().fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    } catch (e) {
      alert('Could not save the file: ' + ((e && e.message) || e));
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// ---- game data lookup -------------------------------------------------------
// Breadth-first search under `root` for the given file names (case-insensitive). Returns { name: fullPath }.
// Folders that never hold the data tables (large media/asset folders); skipped to keep the search fast.
const SKIP_DIRS = new Set([
  'art',
  'sounds',
  'movies',
  'training',
  'textures',
  'tex',
  'misctex',
  'weather',
  'newterrain',
  'tiles',
  'screenshots',
  'logs',
  'backup',
]);

// Breadth-first search for the given file names under `root`. Folders of one level are read in parallel.
export async function findFiles(root, names, maxDepth = 6, maxEntries = 150000) {
  const want = new Map(names.map(n => [n.toLowerCase(), n])),
    found = {};
  if (!isDesktop() || !root) return found;
  let queue = [root],
    depth = 0,
    seen = 0;
  while (queue.length && depth <= maxDepth && Object.keys(found).length < want.size && seen < maxEntries) {
    const next = [];
    for (let i = 0; i < queue.length; i += 16) {
      const lists = await Promise.all(
        queue.slice(i, i + 16).map(async dir => {
          try {
            return { dir, entries: await T().fs.readDir(dir) };
          } catch (e) {
            return { dir, entries: [] };
          }
        })
      );
      for (const { dir, entries } of lists)
        for (const e of entries) {
          seen++;
          const key = e.name.toLowerCase();
          if (e.isDirectory) {
            if (!SKIP_DIRS.has(key)) next.push(join(dir, e.name));
          } else if (want.has(key) && !found[want.get(key)]) found[want.get(key)] = join(dir, e.name);
        }
    }
    queue = next;
    depth++;
  }
  return found;
}

export async function listDir(dir) {
  return isDesktop() && dir
    ? await T()
        .fs.readDir(dir)
        .catch(() => [])
    : [];
}

export async function readBytes(path) {
  return T().fs.readFile(path);
}

// `len` bytes of a (possibly huge) file from `offset`: the heights file of a theater is about 2 GB, so it is never read as a whole
export async function readRange(path, offset, len) {
  const f = await T().fs.open(path, { read: true });
  try {
    await f.seek(offset, T().fs.SeekMode ? T().fs.SeekMode.Start : 0);
    const buf = new Uint8Array(len),
      n = await f.read(buf);
    return n ? buf.subarray(0, n) : null;
  } finally {
    await f.close();
  }
}
export async function fileSize(path) {
  return (await T().fs.stat(path)).size;
}

export async function writeBytes(path, bytes) {
  await T().fs.writeFile(path, bytes);
}
export async function removeFile(path) {
  try {
    await T().fs.remove(path);
  } catch (e) {
    /* already gone */
  }
}
export async function fileExists(path) {
  try {
    return !!(await T().fs.exists(path));
  } catch (e) {
    return false;
  }
}
export async function makeDir(path) {
  try {
    await T().fs.mkdir(path, { recursive: true });
  } catch (e) {
    /* exists */
  }
}

// Files dropped on the window. cb(files, {x, y}) on drop (x, y in CSS pixels); hover(true|false, {x, y}) while files are dragged over.
// Desktop: Tauri reports file paths (its own drop handling replaces the browser's); browser: normal drag and drop.
export async function onFilesDropped(cb, hover = () => {}) {
  const css = p => {
    const k = window.devicePixelRatio || 1;
    return p ? { x: p.x / k, y: p.y / k } : null;
  };
  if (isDesktop() && T().webview && T().webview.getCurrentWebview) {
    try {
      await T()
        .webview.getCurrentWebview()
        .onDragDropEvent(async ev => {
          const t = ev.payload.type,
            pos = css(ev.payload.position);
          if (t === 'enter' || t === 'over') hover(true, pos);
          else if (t === 'leave') hover(false, null);
          else if (t === 'drop') {
            hover(false, null);
            const files = [];
            for (const p of ev.payload.paths || []) {
              try {
                files.push(new File([await T().fs.readFile(p)], base(p)));
              } catch (e) {
                /* unreadable */
              }
            }
            if (files.length) cb(files, pos);
          }
        });
      return;
    } catch (e) {
      /* fall back to browser events */
    }
  }
  const at = e => ({ x: e.clientX, y: e.clientY });
  addEventListener('dragover', e => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
      e.preventDefault();
      hover(true, at(e));
    }
  });
  addEventListener('dragleave', e => {
    if (!e.relatedTarget) hover(false, null);
  });
  addEventListener('drop', e => {
    hover(false, null);
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault();
      cb([...e.dataTransfer.files], at(e));
    }
  });
}

// Small settings files of a page (e.g. the map filters), kept next to config.json in the desktop app, in the browser storage otherwise.
export async function loadPrefs(name) {
  try {
    if (isDesktop()) return JSON.parse(await T().fs.readTextFile(join(await appDir(), name)));
    return JSON.parse(localStorage.getItem('bmscards.' + name) || 'null');
  } catch (e) {
    return null;
  }
}
const prefTimer = {};
const prefWait = {}; // what waits for its moment: file name -> the function that writes it (flushAll writes them at once)
function prefLater(name, write) {
  clearTimeout(prefTimer[name]);
  prefWait[name] = write;
  prefTimer[name] = setTimeout(() => {
    delete prefWait[name];
    write();
  }, 800);
}
export function savePrefs(name, obj) {
  // written a moment after the last change (the map view changes all the time)
  prefLater(name, async () => {
    try {
      const text = JSON.stringify(obj);
      if (isDesktop()) await T().fs.writeTextFile(join(await appDir(), name), text);
      else localStorage.setItem('bmscards.' + name, text);
    } catch (e) {
      /* read-only folder */
    }
  });
}
// For a file that must not be lost (the squadrons): two complete copies, see core/prefs.js
const prefIo = () => ({
  read: async n => {
    try {
      return isDesktop() ? await T().fs.readTextFile(join(await appDir(), n)) : localStorage.getItem('bmscards.' + n);
    } catch (e) {
      return null;
    }
  },
  write: async (n, t) => {
    if (isDesktop()) await T().fs.writeTextFile(join(await appDir(), n), t);
    else localStorage.setItem('bmscards.' + n, t);
  },
});
export const loadPrefsSafe = name => safeLoad(prefIo(), name);
const safeChain = {};
export function savePrefsSafe(name, obj) {
  prefLater(name, () => {
    // one write at a time: the next one waits for the one in progress
    safeChain[name] = (safeChain[name] || Promise.resolve()).then(async () => {
      try {
        await safeSave(prefIo(), name, JSON.stringify(obj));
      } catch (e) {
        /* read-only folder */
      }
    });
    return safeChain[name];
  });
}

// Closing the program must not lose the last change: a page that keeps a change waiting hands it over with beforeClose(fn),
// and flushAll() writes everything that still waits for its few hundred milliseconds.
const closeHooks = [];
export const beforeClose = fn => closeHooks.push(fn);
export async function flushAll() {
  for (const f of closeHooks) {
    try {
      await f();
    } catch (e) {
      /* a page that cannot hand over its change */
    }
  }
  const writes = Object.keys(prefWait).map(name => {
    clearTimeout(prefTimer[name]);
    const w = prefWait[name];
    delete prefWait[name];
    return w();
  });
  await Promise.all([...writes, ...Object.values(safeChain)]);
}

// Closing the program: ok() returns (a promise of) true to let it close, false to stay. Desktop: the window's close request; browser: the usual "leave this page?" question.
export async function onCloseGuard(ok, dirty = () => false) {
  if (isDesktop() && T().window && T().window.getCurrentWindow) {
    try {
      const w = T().window.getCurrentWindow();
      await w.onCloseRequested(async ev => {
        if (!(await ok())) {
          ev.preventDefault();
          return;
        }
        // the last changes are written before the window closes (a stuck disk does not keep it open)
        await Promise.race([flushAll(), new Promise(r => setTimeout(r, 3000))]);
      });
      return;
    } catch (e) {
      /* fall back */
    }
  }
  addEventListener('beforeunload', e => {
    if (dirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  addEventListener('pagehide', () => {
    flushAll();
  });
}

// ---- window: opens maximized again when it was left maximized ------------------
export async function restoreWindow() {
  try {
    const w = T() && T().window && T().window.getCurrentWindow && T().window.getCurrentWindow();
    if (!w) return;
    let on = false;
    try {
      on = localStorage.getItem('bms.maximized') == '1';
    } catch (e) {}
    if (on) await w.maximize();
    let tm = 0;
    window.addEventListener('resize', () => {
      clearTimeout(tm);
      tm = setTimeout(async () => {
        try {
          localStorage.setItem('bms.maximized', (await w.isMaximized()) ? '1' : '0');
        } catch (e) {}
      }, 400);
    });
  } catch (e) {}
}
