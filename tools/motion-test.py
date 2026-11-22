"""Windows without animations (prefers-reduced-motion): the program asks once at start "Do you want the animations?"; Yes: the animations and the dragging of
the Kneeboard cards (the unused cards, Import images), kept; No: without them, not asked again; Settings > General > Animations on wins over Windows.
Usage: python3 tools/motion-test.py"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import dialogs

PORT = 8944
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for ans in (True, False):
            ctx = br.new_context(viewport={'width': 1500, 'height': 900}, reduced_motion='reduce'); pg = ctx.new_page(); errs = []; msgs = []
            pg.add_init_script('window.__askMotion = true')
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d, a=ans: (msgs.append(d.message), d.accept() if a else d.dismiss()))
            pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2500)
            pg.click('[data-t=kn]'); pg.wait_for_timeout(600)
            asked = [m for m in msgs if m.startswith('Do you want the animations?')]
            drag = pg.locator('.kbw.kbdrag').count() == 1 and pg.locator('#kbtray').count() == 1 and pg.locator('#kbimp').count() == 1
            check('%s: asked once at start, the Kneeboard %s dragging' % ('Yes' if ans else 'No', 'with' if ans else 'without'), len(asked) == 1 and drag == ans and pg.evaluate("()=>__app.CFG.ui.osMotion") == ('on' if ans else 'off'))
            if not ans:
                n0 = len(msgs); pg.reload(); pg.wait_for_timeout(2500)
                check('No: not asked again at the next start', not [m for m in msgs[n0:] if m.startswith('Do you want')])
                pg.click('#cfgbtn'); pg.wait_for_timeout(500); pg.click('#nv-general'); pg.wait_for_timeout(300)
                check('...Settings > General > Animations shows off', pg.get_attribute('[data-a=sw][data-k=anim]', 'aria-checked') == 'false')
                pg.click('[data-a=sw][data-k=anim]'); pg.wait_for_timeout(100); pg.click('#cfgsave'); pg.wait_for_timeout(800)
                pg.keyboard.press('Escape'); pg.wait_for_timeout(300); pg.click('[data-t=kn]'); pg.wait_for_timeout(600)
                check('...turned on there: it wins over Windows, the cards can be dragged', pg.evaluate("()=>__app.CFG.ui.osMotion") == 'on' and pg.locator('.kbw.kbdrag').count() == 1)
            check('no page errors %s' % errs[:2], not errs)
            ctx.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
