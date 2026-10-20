"""Checks the datacard pilot dropdown fed by the squadron roster. Usage: python3 tools/pilotmenu-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8779', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1500, 'height': 900}, reduced_motion='reduce')
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('bmsform','1')}catch(e){}"); pg.goto('http://localhost:8779/app/index.html'); pg.wait_for_timeout(900)
        pg.evaluate("""()=>{const d=__app.sq.db();d.squads.push({id:'t1',name:'Test',roster:{a:{uid:'a',name:'Chris',callsign:'Evil19',stats:{rk:3}},b:{uid:'b',name:'Anna',callsign:'Zed',stats:{rk:2}},c:{uid:'c',name:'Gone',callsign:'X',stats:{rk:1},removed:true},d:{uid:'d',name:'',callsign:'Nn',stats:{rk:0}}}});d.cur='t1'}""")
        r = pg.evaluate("__app.sq.roster()")
        check('roster = abbreviated rank + name, sorted, no removed/unnamed: %s' % r, r == ['Capt. Anna', 'Maj. Chris'])
        pg.evaluate("document.querySelectorAll('#form details').forEach(d=>d.open=true)")
        pg.click('[data-t=kb]'); pg.wait_for_timeout(300); btns = pg.locator('#form .pnb')
        check('4 dropdown buttons (one per flight pilot)', btns.count() == 4)
        btns.nth(1).click(); pg.wait_for_timeout(250)
        check('menu lists the roster', pg.locator('#pnmenu .pni').count() == 2)
        pg.locator('#pnmenu .pni', has_text='Maj. Chris').click(); pg.wait_for_timeout(250)
        check('field set', pg.input_value('#form .pnrow >> nth=1 >> input') == 'Maj. Chris')
        check('menu closed', pg.locator('#pnmenu').count() == 0)
        pg.evaluate("__app.openEd('fl0_0')"); pg.wait_for_timeout(250)
        check('card editor lists the roster', pg.locator('#ed .pni').count() == 2)
        pg.locator('#ed .pni', has_text='Capt. Anna').click(); pg.wait_for_timeout(250)
        check('card editor sets the field', pg.evaluate("__app.FD.find(d=>d.k=='fl0_0').el.value") == 'Capt. Anna')
        check('card editor closed', pg.evaluate("getComputedStyle(document.getElementById('ed')).display") == 'none')
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.kill()
sys.exit(0 if ok else 1)
