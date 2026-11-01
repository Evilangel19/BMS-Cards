"""Checks the loading bar of the slow loads (core/busy.js). Usage: python3 tools/busy-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8791', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1300, 'height': 800}, reduced_motion='reduce')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8791/app/index.html'); pg.wait_for_timeout(800)
        on = lambda: pg.evaluate("()=>{const b=document.getElementById('busybar');return !!b&&b.classList.contains('on')}")
        txt = lambda: pg.evaluate("()=>document.querySelector('#busybar span').textContent")
        w = lambda: pg.evaluate("()=>document.querySelector('#busybar .ldb i').style.width")
        pg.evaluate("async()=>{const m=await import('/app/js/core/busy.js');window.B=m;window.q=m.busyStart('Fast load')}")
        pg.evaluate("()=>B.busyEnd(q)"); pg.wait_for_timeout(600)
        check('a quick load never shows the bar', not on())
        pg.evaluate("()=>{window.q=B.busyStart('Loading theater Balkans…')}"); pg.wait_for_timeout(600)
        check('a slow load shows the bar with its label', on() and 'Balkans' in txt())
        check('without a percent the bar moves back and forth', pg.evaluate("()=>document.querySelector('#busybar .ldb').classList.contains('ind')"))
        pg.evaluate("()=>B.busySet(q, 40, 'Reading the tables…')"); pg.wait_for_timeout(200)
        check('a percent and a new label are shown', 'tables' in txt() and 40 <= float(w().rstrip('%')) < 45)
        pg.wait_for_timeout(1500)
        check('the bar creeps on while a step is long, never past the next 12 points', 40 < float(w().rstrip('%')) <= 52)
        pg.evaluate("()=>{window.q2=B.busyStart('Second task')}"); pg.wait_for_timeout(150)
        pg.evaluate("()=>B.busyEnd(q2)"); pg.wait_for_timeout(100)
        check('two tasks: the bar stays until the last one ends', on())
        pg.evaluate("()=>B.busyEnd(q)"); pg.wait_for_timeout(700)
        check('the bar goes away when the last task is over', not on())
        check('the bar does not take the mouse', pg.evaluate("()=>getComputedStyle(document.getElementById('busybar')).pointerEvents")=='none')
        # the start-up window takes the tasks while it is there
        pg.evaluate("()=>{window.S=[];B.busySink((l,p)=>S.push([l,p]));window.q=B.busyStart('Reading the tables…');B.busySet(q,50)}")
        check('with a sink the tasks go to the start-up bar, not to the small one', pg.evaluate("()=>S.length>=2&&S[S.length-1][1]==50")  and not on())
        pg.evaluate("()=>{B.busyEnd(q);B.busySink(null)}")
        # a heavy map shows the bar at once when it is moved, and the bar goes away after
        pg.click('[data-t=mp]'); pg.wait_for_timeout(2000)
        pg.evaluate("()=>__app.mapV.heavy(true)")
        bx = pg.locator('#mpmap').bounding_box(); pg.mouse.move(bx['x'] + 400, bx['y'] + 300)
        pg.mouse.wheel(0, -200); pg.wait_for_timeout(150)
        check('a heavy map shows the bar at the first wheel turn', on() and 'map' in txt())
        pg.wait_for_timeout(1800)
        check('...and it goes away when the drawing is over', not on())
        pg.evaluate("()=>__app.mapV.heavy(false)")
        pg.mouse.wheel(0, 200); pg.wait_for_timeout(300)
        check('a light map shows no bar', not on())
        check('no script errors', not errs)
        br.close()
finally:
    srv.kill()
sys.exit(0 if ok else 1)
