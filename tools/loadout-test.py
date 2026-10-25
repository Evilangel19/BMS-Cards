"""Checks the loadout selector of the datacard: a flight whose aircraft carry different loadouts. Needs tests/fixtures/beartrap/PSI_BEAR_TRAP_26-double.cam (not in the repository). Usage: python3 tools/loadout-test.py"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8798', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 1500}, reduced_motion='reduce'); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8798/app/index.html'); pg.wait_for_timeout(1000)
        pg.evaluate("t=>__app.parse(t)", open(FX + 'Evil19_2_.ini', encoding='latin1').read())
        pg.evaluate("async(b)=>{await __app.loadCam(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.cam'))}", base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26-double.cam', 'rb').read()).decode()); pg.wait_for_timeout(1200)
        i = pg.evaluate("()=>[...document.querySelector('#fsel').options].findIndex(o=>/x4/.test(o.text))")
        pg.evaluate("i=>{const s=document.querySelector('#fsel');s.value=String(i);s.dispatchEvent(new Event('change'))}", i); pg.wait_for_timeout(2500)
        g = lambda ks: pg.evaluate("ks=>ks.map(k=>__app.F[k])", ks)
        K = ['ldsel', 'aa', 'ag', 'gw', 'drag', 'fuel']
        a = g(K)
        check('two groups: A/C 1-2 and A/C 3-4, the first one is shown', pg.evaluate("()=>JSON.stringify(__app.CYC.ldsel)") == '["A/C 1-2","A/C 3-4"]' and a[0] == 'A/C 1-2' and 'GBU-38' in a[2])
        check('the cell of the choice carries a yellow mark', pg.evaluate("()=>{const b=__app.FD.find(d=>d.k=='ldsel');const r=[...document.querySelectorAll('#cvhl i')].some(i=>Math.abs(i.getBoundingClientRect().left-document.getElementById('cv').getBoundingClientRect().left-b.x*document.getElementById('cv').getBoundingClientRect().width/1600)<6);return r}"))
        pg.evaluate("()=>__app.setField('ldsel','A/C 3-4')"); pg.wait_for_timeout(2500)
        b = g(K)
        check('the second group changes the weapon rows', b[0] == 'A/C 3-4' and 'GBU-24' in b[2] and b[1] != a[1])
        check('gross weight, drag and fuel follow the loadout', b[3] != a[3] and b[4] != a[4] and b[5] != a[5])
        # another flight: no choice
        j = pg.evaluate("()=>[...document.querySelector('#fsel').options].findIndex(o=>/x2/.test(o.text))")
        pg.evaluate("i=>{const s=document.querySelector('#fsel');s.value=String(i);s.dispatchEvent(new Event('change'))}", j); pg.wait_for_timeout(1500)
        check('a flight with one loadout has no choice and no mark on the cell', pg.evaluate("()=>__app.CYC.ldsel===undefined&&!__app.F.ldsel"))
        pg.evaluate("i=>{const s=document.querySelector('#fsel');s.value=String(i);s.dispatchEvent(new Event('change'))}", i); pg.wait_for_timeout(2500)
        check('coming back to the flight keeps the group chosen', g(['ldsel'])[0] == 'A/C 3-4' and 'GBU-24' in g(['ag'])[0])
        check('no page errors', not errs)
        br.close()
finally:
    srv.kill()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
