"""A-G (1.3.0-beta.78) in the browser: the checks of the manuals (a pop-up under 350 KCAS, a ripple under the 60 ms of the racks, a cloud base under
2 000 ft AGL over the target), the toss angle up to 45°, the A-G block sent to the ROE, Edit in A-G back to the page. Made-up steerpoints, no BMS file.
Usage: python3 tools/agrules-test.py"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8971
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
FT = 3280.84
pt = lambda x, y: '%.6f, %.6f, 0.000000' % (y * FT, x * FT)
INI = '\r\n'.join(['[STPT]'] + ['target_%d=%s, 0' % (i, pt(500 + i * 10, 500 + i * 10)) for i in range(3)] +
                  ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] + [''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.evaluate("()=>{window.__AG=[];__app.wpPage._test({roeAg:b=>(window.__AG.push(b),true),night:()=>true,wxBase:async()=>null})}")
        pg.click('[data-t=wp]'); pg.wait_for_timeout(600); pg.click('#wp [data-mode=popup]'); pg.wait_for_timeout(700)
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',inp:{releaseSpeed:520}})"); pg.wait_for_timeout(500)
        check('pop-up at 520 kt: no Checks card', 'Checks' not in pg.inner_text('#wpr'))
        last = pg.evaluate("()=>window.__AG[window.__AG.length-1]")
        check('the A-G block sent: POP-UP, abort 350, night, ceiling 2 000 %s' % last, last and last['kind'] == 'POP-UP' and last['abort'] == 350 and last['night'] and last['ceil'] == 2000)
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',inp:{releaseSpeed:320}})"); pg.wait_for_timeout(500)
        check('pop-up at 320 kt: the red line of the Checks card', '350 KCAS' in pg.inner_text('#wpr .wcard'))
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',inp:{releaseSpeed:520}})")
        pg.evaluate("()=>__app.wpPage._test({wxBase:async()=>800})"); pg.wait_for_timeout(800)
        check('a cloud base of 800 ft over the target: the ceiling line', 'Cloud base' in pg.inner_text('#wpr'))
        pg.evaluate("()=>__app.wpPage._test({wxBase:async()=>null})"); pg.wait_for_timeout(500)
        pg.click('#wp [data-mode=toss]'); pg.wait_for_timeout(600)
        check('toss: the release angle ends at 45°', pg.get_attribute('input[data-sl=releaseAngle]', 'max') == '45')
        pg.evaluate("()=>__app.wpPage.setState({mode:'toss',toss:{releaseAngle:60}})"); pg.wait_for_timeout(400)
        a = pg.evaluate("()=>__app.wpPage.state().toss.releaseAngle")
        check('toss: an angle of 60 (a page saved by an older version) taken as 45 [%s]' % a, a == 45)
        pg.click('#wp [data-mode=popup]'); pg.wait_for_timeout(400)
        pg.evaluate("()=>__app.ST.agGo({kind:'TOSS'})"); pg.wait_for_timeout(800)
        check('Edit in A-G: the A-G tab on TOSS', pg.locator('#wp').is_visible() and pg.locator('#wp [data-mode=toss].on').count() == 1)
        check('no page errors %s' % errs, not errs)
        b.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
