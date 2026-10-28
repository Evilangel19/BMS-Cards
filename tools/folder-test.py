"""The folder of the program cannot be written (Program Files, a read-only folder): the pilot is told at start, and once when a file of the program cannot be saved.
Mocked Tauri API (in memory). Usage: python3 tools/folder-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8787', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
# ro: every write in C:\app fails (the folder of the program); text: only the small settings files fail (a full disk, a file in use)
INIT = """(()=>{const MODE=%s,F=new Map(),TX=new Map();window.__F=F;const no=p=>{if(MODE=='ro'&&/^C:\\\\app/.test(p))throw new Error('Access is denied. (os error 5)')};
window.__TAURI__={core:{invoke:async c=>c==='app_dir'?'C:\\\\app':null},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async()=>[],readFile:async p=>{if(!F.has(p))throw new Error('missing');return F.get(p)},readTextFile:async p=>{if(!TX.has(p))throw new Error('none');return TX.get(p)},
  writeTextFile:async(p,s)=>{no(p);if(MODE=='text'&&/prefs\\.json$/.test(p))throw new Error('disk full');TX.set(p,s)},writeFile:async(p,b)=>{no(p);F.set(p,new Uint8Array(b))},
  remove:async p=>{F.delete(p)},exists:async p=>F.has(p),mkdir:async p=>{no(p)}}};})();"""
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def page(mode):
            pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []; msgs = []
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import dialogs; dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
            pg.add_init_script(INIT % ('"' + mode + '"'))
            pg.goto('http://localhost:8787/app/index.html'); pg.wait_for_timeout(1800)
            return pg, errs, msgs
        pg, errs, msgs = page('ro')
        m = [x for x in msgs if 'cannot write in its own folder' in x]
        check('read-only folder: one message at start names the folder and says what to do', len(m) == 1 and 'C:\\app' in m[0] and 'Move the whole BMS Cards folder' in m[0] and 'Access is denied' in m[0])
        pg.evaluate("async()=>{const d=await import('/app/js/platform/desktop.js');d.savePrefs('mapprefs.json',{a:1});await d.flushAll()}"); pg.wait_for_timeout(300)
        check('and no second message when a settings file then fails too', len([x for x in msgs if 'Could not save' in x or 'cannot write' in x]) == 1)
        check('no page errors %s' % errs, not errs); pg.close()
        pg, errs, msgs = page('ok')
        check('a folder that can be written: no message, and no test file left behind', not msgs and not pg.evaluate("()=>[...__F.keys()].some(k=>/write-test/.test(k))"))
        pg.close()
        pg, errs, msgs = page('text')
        msgs.clear()
        pg.evaluate("async()=>{const d=await import('/app/js/platform/desktop.js');d.savePrefs('mapprefs.json',{a:1});await d.flushAll();d.savePrefs('dtcprefs.json',{b:1});await d.flushAll()}"); pg.wait_for_timeout(300)
        m = [x for x in msgs if 'Could not save' in x]
        check('a settings file that cannot be written is said once, with its name and the reason', len(m) == 1 and 'mapprefs.json' in m[0] and 'disk full' in m[0])
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
