"""A desktop (Tauri) for the browser tests: a Windows-like file system in memory (the case of a name does not count, "\\" and "/" are the same, a file can only be written in a folder that
exists), the file dialogs scripted by the test, and the permissions of src-tauri/capabilities/default.json (a write the program is not allowed to do fails as it does there).
It lives on the Python side, so the files stay when the page is loaded again (or when another version of the program is opened on the same files).

    desk = FakeDesk('C:\\\\app'); desk.install(page); desk.put('C:\\\\app\\\\config.json', '{}')
    desk.open_dialog.append('D:\\\\old')          # what the next "choose a folder / file" answers (nothing in the list = cancelled)
    desk.read('C:\\\\app\\\\squadron.json'); desk.paths('C:\\\\app\\\\missions'); desk.writes
"""
import base64, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def _glob(g):
    out, i = '', 0
    while i < len(g):
        if g.startswith('**/', i): out += '(?:.*/)?'; i += 3
        elif g.startswith('**', i): out += '.*'; i += 2
        elif g[i] == '*': out += '[^/]*'; i += 1
        elif g[i] == '?': out += '[^/]'; i += 1
        elif g[i] in '.+^${}()|\\': out += '\\' + g[i]; i += 1
        else: out += g[i]; i += 1
    return re.compile('^' + out + '$')


class FakeDesk:
    def __init__(self, app_dir='C:\\app', capabilities=True, bms=None):
        self.app_dir = app_dir
        self.bms = bms
        self.files = {}     # key -> bytes
        self.names = {}     # key -> the path as it was written
        self.dirs = {}      # key -> the path as it was written
        self.writes = []    # the paths written, in order (a write that failed is not here)
        self.denied = []    # the writes and removals the permissions refused
        self.removed = []
        self.open_dialog = []   # answers of "open" (a path, a list of paths, or None)
        self.save_dialog = []   # answers of "save"
        self.dialog_calls = []  # (kind, options)
        self.fail = []      # [(regex, message)]: a write to a path that matches fails with the message
        self.handles = {}
        self.cap = None
        if capabilities:
            self.cap = {}
            for p in json.load(open(ROOT + '/src-tauri/capabilities/default.json'))['permissions']:
                if isinstance(p, dict):
                    self.cap[p['identifier']] = ([_glob(x['path']) for x in p.get('allow', [])], [_glob(x['path']) for x in p.get('deny', [])])
                else:
                    self.cap[p] = None

    # ---- paths
    @staticmethod
    def key(p): return re.sub(r'/+$', '', str(p).replace('\\', '/')).lower()
    @staticmethod
    def up(p): return re.sub(r'[\\/][^\\/]*$', '', str(p))
    def _root(self, p): return bool(re.match(r'^[a-z]:$', self.key(p)))
    def is_dir(self, p): return self._root(p) or self.key(p) in self.dirs
    def is_file(self, p): return self.key(p) in self.files
    def mk(self, p):
        if self._root(p) or self.key(p) in self.dirs: return
        if not self.up(p) or self.up(p) == p: return
        self.mk(self.up(p)); self.dirs[self.key(p)] = str(p)

    # ---- for the test
    def put(self, p, data):
        self.mk(self.up(p))
        self.files[self.key(p)] = data.encode('utf8') if isinstance(data, str) else bytes(data); self.names[self.key(p)] = str(p)
    def read(self, p): return self.files[self.key(p)]
    def text(self, p): return self.files[self.key(p)].decode('utf8')
    def has(self, p): return self.is_file(p) or self.is_dir(p)
    def paths(self, prefix=''):
        k = self.key(prefix)
        return sorted(self.names[x] for x in self.files if x == k or x.startswith(k + '/')) if k else sorted(self.names.values())
    def snapshot(self, prefix=''): return {p: self.read(p) for p in self.paths(prefix)}
    def clear_writes(self): self.writes.clear(); self.denied.clear()
    def install(self, page):
        page.expose_function('__fs', self._call)
        page.add_init_script(path=HERE + '/fakedesk.js')
        return self

    # ---- permissions
    def _allowed(self, ident, p):
        if self.cap is None: return True
        if ident not in self.cap: return False
        c = self.cap[ident]
        if c is None: return True
        path = str(p).replace('\\', '/')
        return any(r.match(path) for r in c[0]) and not any(r.match(path) for r in c[1])
    def _need(self, ident, p, kind):
        if not self._allowed(ident, p):
            self.denied.append((kind, str(p)))
            raise PermissionError('forbidden path: %s, maybe it is not allowed on the scope for `%s` permission in your capability configuration file' % (p, ident.replace('fs:', '')))
    def _missing(self, p, what='path'):
        raise FileNotFoundError('The system cannot find the %s specified. (os error %d)' % (what, 3 if what == 'path' else 2))

    # ---- the calls from the page
    def _call(self, payload):
        a = json.loads(payload)
        try:
            return json.dumps({'v': getattr(self, '_op_' + a['op'].replace('.', '_'))(a)})
        except Exception as e:
            return json.dumps({'err': str(e)})

    def _op_invoke(self, a):
        c = a['cmd']
        if c == 'app_dir':
            self.mk(self.app_dir)  # the folder of the program is always there
            return self.app_dir
        if c == 'detect_bms': return self.bms
        if c == 'read_exe_range':
            p = a['args']['path']
            if p.replace('\\', '/').split('/')[-1].lower() != 'falcon bms.exe': raise PermissionError('only Falcon BMS.exe')
            if not self.is_file(p): self._missing(p, 'file')
            o, n = a['args']['offset'], a['args']['len']
            return list(self.read(p)[o:o + n])
        return None
    def _op_dialog_open(self, a):
        self.dialog_calls.append(('open', a['opts']))
        return self.open_dialog.pop(0) if self.open_dialog else None
    def _op_dialog_save(self, a):
        self.dialog_calls.append(('save', a['opts']))
        return self.save_dialog.pop(0) if self.save_dialog else None
    def _op_readDir(self, a):
        p = a['path']
        self._need('fs:allow-read-dir', p, 'readDir')
        if not self.is_dir(p): self._missing(p)
        k = self.key(p) + '/'
        out = []
        for x, nm in self.names.items():
            if x.startswith(k) and '/' not in x[len(k):]: out.append({'name': nm.replace('\\', '/').split('/')[-1], 'isDirectory': False, 'isFile': True, 'isSymlink': False})
        for x, nm in self.dirs.items():
            if x.startswith(k) and '/' not in x[len(k):]: out.append({'name': nm.replace('\\', '/').split('/')[-1], 'isDirectory': True, 'isFile': False, 'isSymlink': False})
        return out
    def _op_readFile(self, a):
        self._need('fs:allow-read-file', a['path'], 'readFile')
        if not self.is_file(a['path']): self._missing(a['path'], 'file')
        return base64.b64encode(self.read(a['path'])).decode()
    def _op_readTextFile(self, a):
        self._need('fs:allow-read-text-file', a['path'], 'readTextFile')
        if not self.is_file(a['path']): self._missing(a['path'], 'file')
        return self.read(a['path']).decode('utf8')
    def _write(self, p, data, ident):
        self._need(ident, p, 'write')
        if not self.is_dir(self.up(p)): self._missing(p)
        for rx, msg in self.fail:
            if re.search(rx, str(p)): raise PermissionError(msg)
        self.files[self.key(p)] = data; self.names[self.key(p)] = str(p); self.writes.append(str(p))
    def _op_writeFile(self, a): self._write(a['path'], base64.b64decode(a['data']), 'fs:allow-write-file')
    def _op_writeTextFile(self, a): self._write(a['path'], a['text'].encode('utf8'), 'fs:allow-write-text-file')
    def _op_exists(self, a):
        self._need('fs:allow-exists', a['path'], 'exists')
        return self.has(a['path'])
    def _op_mkdir(self, a):
        p = a['path']
        self._need('fs:allow-mkdir', p, 'mkdir')
        if a['recursive']: self.mk(p)
        elif self.is_dir(p): raise FileExistsError('Cannot create a file when that file already exists. (os error 183)')
        elif not self.is_dir(self.up(p)): self._missing(p)
        else: self.dirs[self.key(p)] = p
    def _op_remove(self, a):
        p = a['path']
        self._need('fs:allow-remove', p, 'remove')
        k = self.key(p)
        if k in self.files:
            del self.files[k]; del self.names[k]; self.removed.append(p); return
        if k in self.dirs:
            under = [x for x in list(self.files) + list(self.dirs) if x.startswith(k + '/')]
            if under and not a['recursive']: raise OSError('The directory is not empty. (os error 145)')
            for x in under:
                self.files.pop(x, None); self.names.pop(x, None); self.dirs.pop(x, None)
            del self.dirs[k]; self.removed.append(p); return
        self._missing(p, 'file')
    def _op_stat(self, a):
        p = a['path']
        self._need('fs:allow-stat', p, 'stat')
        if self.is_file(p): return {'isFile': True, 'isDirectory': False, 'isSymlink': False, 'size': len(self.read(p)), 'mtime': None, 'readonly': False}
        if self.is_dir(p): return {'isFile': False, 'isDirectory': True, 'isSymlink': False, 'size': 0, 'mtime': None, 'readonly': False}
        self._missing(p, 'file')
    def _op_open(self, a):
        p = a['path']
        self._need('fs:allow-open', p, 'open')
        if not self.is_file(p): self._missing(p, 'file')
        self._h = getattr(self, '_h', 0) + 1; self.handles[self._h] = [p, 0]; return self._h
    def _op_seek(self, a): self.handles[a['h']][1] = a['off']; return a['off']
    def _op_read(self, a):
        p, pos = self.handles[a['h']]
        data = self.read(p)[pos:pos + a['len']]
        self.handles[a['h']][1] = pos + len(data)
        return base64.b64encode(data).decode() if data else None
    def _op_close(self, a): self.handles.pop(a['h'], None)
