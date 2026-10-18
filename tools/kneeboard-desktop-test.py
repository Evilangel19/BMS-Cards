"""Kneeboard save / backup / restore with a mocked Tauri file system (in memory)."""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8770', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
INIT = """(()=>{const F=new Map();window.__F=F;F.set('C:\\\\kb\\\\7982.dds',new Uint8Array([79,76,68]));
window.__TAURI__={core:{invoke:async c=>c==='app_dir'?'C:\\\\app':null},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async()=>[],readFile:async p=>{if(!F.has(p))throw new Error('missing');return F.get(p)},readTextFile:async()=>{throw new Error('none')},writeTextFile:async()=>{},
  writeFile:async(p,b)=>{F.set(p,new Uint8Array(b))},exists:async p=>F.has(p),mkdir:async()=>{}}};})();"""
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1300}); errs = []
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); pg.add_init_script(INIT)
        pg.goto('http://localhost:8770/app/index.html'); pg.wait_for_timeout(1000)
        pg.evaluate("()=>{__app.CFG.paths.kneeboardDir='C:\\\\kb'}"); pg.click('[data-t=kn]'); pg.wait_for_timeout(300)
        pg.click('#kbsave'); pg.wait_for_timeout(6000)
        n = pg.evaluate("()=>[...__F.keys()].sort().join('|')"); print('     ', n)
        check('7982.dds written; backup in the program folder; nothing extra in the BMS folder', 'C:\\kb\\7982.dds' in n and 'C:\\app\\backup\\kneeboard\\7982.dds' in n and '.orig' not in n)
        check('backup keeps the original bytes', pg.evaluate("()=>Array.from(__F.get('C:\\\\app\\\\backup\\\\kneeboard\\\\7982.dds')).join()") == '79,76,68')
        check('new file is a DDS', pg.evaluate("()=>__F.get('C:\\\\kb\\\\7982.dds').length") == 128 + 2048 * 2048 // 2)
        pg.click('#kbsave'); pg.wait_for_timeout(6000)
        check('second save does not overwrite the backup', pg.evaluate("()=>Array.from(__F.get('C:\\\\app\\\\backup\\\\kneeboard\\\\7982.dds')).join()") == '79,76,68')
        pg.click('#kbrest'); pg.wait_for_timeout(500)
        check('Restore puts the original back', pg.evaluate("()=>Array.from(__F.get('C:\\\\kb\\\\7982.dds')).join()") == '79,76,68')
        pg.wait_for_timeout(1500)
        check('the cards are kept in the program folder (cardmemory) to load at the next start', pg.evaluate("()=>[...__F.keys()].some(k=>/cardmemory.cards\\.json$/.test(k))"))
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
