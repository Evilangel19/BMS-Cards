"""Checks direct editing on the card (click a cell -> editor -> Enter). Usage: python3 tools/edit-test.py [screenshot_dir]"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
shots = sys.argv[1] if len(sys.argv) > 1 else None
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 1500}); errs = []
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8767/app/index.html'); pg.wait_for_timeout(800)
        pg.click('[data-t=kb]')
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'));document.getElementById('fsel').value=13;__app.apply(13)}""", b64('PSI_BEAR_TRAP_26.cam'))
        pg.wait_for_timeout(500)
        check('form hidden by default', not pg.is_visible('#form'))
        cv = pg.locator('#cv'); box = cv.bounding_box()
        def click_tpl(tx, ty):  # template coordinates (1600x1200) -> page
            pg.mouse.click(box['x'] + tx / 1600 * box['width'], box['y'] + ty / 1200 * box['height'])
        fd = pg.evaluate("()=>{const d=__app.FD.find(z=>z.k=='fp3_5');return {x:d.x,y:d.y,w:d.w,k:d.k}}")
        click_tpl(fd['x'] + fd['w'] / 2, fd['y'])
        check('editor opens on click', pg.is_visible('#ed'))
        check('editor shows the cell label', 'Alt' in pg.inner_text('#ed .l'))
        if shots: pg.screenshot(path=shots + '/editor.png')
        pg.keyboard.type('27500'); pg.keyboard.press('Enter')
        check('Enter closes the editor', not pg.is_visible('#ed'))
        check('value stored', pg.evaluate("()=>__app.F.fp3_5") == '27500')
        # Tab goes to the next field, Esc cancels
        click_tpl(fd['x'] + fd['w'] / 2, fd['y']); pg.keyboard.press('Tab')
        check('Tab opens next field', pg.is_visible('#ed') and 'Min.Fuel' in pg.inner_text('#ed .l'))
        pg.keyboard.type('zzz'); pg.keyboard.press('Escape')
        check('Esc cancels', pg.evaluate("()=>__app.F.fp3_6") != 'zzz' and not pg.is_visible('#ed'))
        # click another cell commits
        click_tpl(fd['x'] + fd['w'] / 2, fd['y']); pg.keyboard.type('30000')
        d2 = pg.evaluate("()=>{const d=__app.FD.find(z=>z.k=='fp5_5');return {x:d.x,y:d.y,w:d.w}}")
        click_tpl(d2['x'] + d2['w'] / 2, d2['y'])
        check('clicking another cell commits and opens it', pg.evaluate("()=>__app.F.fp3_5") == '30000' and 'Alt' in pg.inner_text('#ed .l'))
        pg.keyboard.press('Escape')
        # multi-line field
        r = pg.evaluate("()=>{const d=__app.FD.find(z=>z.k=='roe');return {x:d.x,w:d.w}}")
        click_tpl(r['x'] + r['w'] / 2, 940)
        check('multi-line editor is a textarea', pg.evaluate("()=>!!document.querySelector('#ed textarea')"))
        pg.keyboard.type('line one'); pg.keyboard.press('Shift+Enter'); pg.keyboard.type('line two'); pg.keyboard.press('Enter')
        check('Shift+Enter makes a new line, Enter commits', pg.evaluate("()=>__app.F.roe") == 'line one\nline two')
        # form toggle
        pg.evaluate('()=>__app.toggleForm()'); check('toggle shows the form', pg.is_visible('#form'))
        check('form shows the edited value', pg.evaluate("()=>__app.FD.find(z=>z.k=='fp3_5').el.value") == '30000')
        if shots: pg.screenshot(path=shots + '/form.png'); pg.evaluate('()=>__app.toggleForm()'); pg.screenshot(path=shots + '/card.png', full_page=True)
        check('no page errors', not errs)
        if errs: print(errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
