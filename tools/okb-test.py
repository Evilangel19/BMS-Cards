"""Save to OpenKneeboard with a mocked Tauri file system (in memory): when the button shows, the PNG pages in Left and Right, the old pages taken away."""
import subprocess, sys, time, os, struct
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8995
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
# a made-up user: Saved Games of "pilot", OpenKneeboard found or not (window.__OKB), an old page and a file of the user in the folder
INIT = r"""(()=>{const F=new Map();window.__F=F;window.__OKB=sessionStorage.getItem('noOKB')!='1';const SG='C:\\Users\\pilot\\Saved Games';
F.set(SG+'\\BMS Cards\\OpenKneeboard\\Left\\05 Old card.png',new Uint8Array([1]));F.set(SG+'\\BMS Cards\\OpenKneeboard\\Left\\notes.txt',new Uint8Array([2]));
const kids=d=>{const o=new Map();for(const k of F.keys())if(k.startsWith(d+'\\')){const r=k.slice(d.length+1),i=r.indexOf('\\');o.set(i<0?r:r.slice(0,i),i>=0)}return [...o].map(([name,dir])=>({name,isDirectory:dir,isFile:!dir}))};
window.__TAURI__={core:{invoke:async c=>c==='app_dir'?'C:\\app':c==='find_okb'?[window.__OKB?SG+'\\OpenKneeboard':null,SG]:null},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async d=>kids(d),readFile:async p=>{if(!F.has(p))throw new Error('missing');return F.get(p)},readTextFile:async()=>{throw new Error('none')},writeTextFile:async(p,s)=>{F.set(p,new TextEncoder().encode(s))},
  writeFile:async(p,b)=>{F.set(p,new Uint8Array(b))},exists:async p=>F.has(p)||[...F.keys()].some(k=>k.startsWith(p+'\\')),mkdir:async()=>{},remove:async p=>{F.delete(p)}}};})();"""
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
def png_size(b):
    return struct.unpack('>II', bytes(b[16:24])) if bytes(b[:8]) == b'\x89PNG\r\n\x1a\n' else None
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1300}); errs = []
        sys.path.insert(0, R + '/tools'); import dialogs; dialogs.install(pg)
        msgs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (msgs.append(d.message), d.accept())); pg.add_init_script(INIT)
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        pg.click('[data-t=kn]'); pg.wait_for_timeout(500)
        vis = lambda: pg.locator('#kbokb').is_visible()
        check('OpenKneeboard found: Save to OpenKneeboard next to Save to BMS folder', vis())
        pg.evaluate("()=>{__app.CFG.kneeboard.okb='off'}"); pg.click('[data-t=dc]'); pg.click('[data-t=kn]'); pg.wait_for_timeout(300)
        check('Settings "Never": no button', not vis())
        pg.evaluate("()=>{sessionStorage.setItem('noOKB','1')}")
        pg.reload(); pg.wait_for_timeout(1200); pg.click('[data-t=kn]'); pg.wait_for_timeout(500)
        check('OpenKneeboard not found, "Automatic": no button', not vis())
        pg.evaluate("()=>{__app.CFG.kneeboard.okb='on'}"); pg.click('[data-t=dc]'); pg.click('[data-t=kn]'); pg.wait_for_timeout(300)
        check('...but "Always" shows it', vis())
        pg.click('#kbokb'); pg.wait_for_timeout(5000)
        keys = pg.evaluate("()=>[...__F.keys()].sort()")
        base = 'C:\\Users\\pilot\\Saved Games\\BMS Cards\\OpenKneeboard\\'
        L, Rr = base + 'Left\\01 Datacard Left.png', base + 'Right\\01 Datacard Right.png'
        check('the datacard pages written as Left\\01 … and Right\\01 … in Saved Games\\BMS Cards\\OpenKneeboard', L in keys and Rr in keys)
        size = png_size(pg.evaluate("p=>Array.from(__F.get(p).slice(0,24))", L))
        check('...PNG at 1600 x 2400 (the true shape of the page) %s' % (size,), size == (1600, 2400))
        check('the old page is taken away, the file of the user stays', base + 'Left\\05 Old card.png' not in keys and base + 'Left\\notes.txt' in keys)
        check('the first save says how to add the Folder tab, and keeps the folder in the settings', any('Add a tab > Folder' in m for m in msgs) and pg.evaluate("()=>__app.CFG.paths.okbDir") == base[:-1])
        n = len(msgs); pg.click('#kbokb'); pg.wait_for_timeout(5000)
        check('the next save does not ask for the folder again %s' % msgs[n:], not any('pages of the kneeboard as pictures' in m for m in msgs[n:]))
        pg.click('#cfgbtn') if pg.locator('#cfgbtn').count() else pg.click('[data-a=settings]'); pg.wait_for_timeout(600)
        check('Settings: Save to OpenKneeboard (Automatic / Always / Never) and the OpenKneeboard folder', pg.locator('#c-okb option').count() == 3 and pg.locator('#f-okbDir').count() == 1)
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
