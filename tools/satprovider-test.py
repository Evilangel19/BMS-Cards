"""Checks the Settings option "Own satellite layer": the satellite layer of the maps takes the user's tile provider when it is on, EOX when off. Usage: python3 tools/satprovider-test.py"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); FX = R + '/tests/fixtures/beartrap/'
PORT = 8786
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; print(('OK   ' if c else 'FAIL ') + n); ok = ok and bool(c)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
try:
    cam = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1500, 'height': 900}); errs = []; reqs = []
        ctx.route('**/faketiles/**', lambda r: (reqs.append(r.request.url), r.fulfill(status=200, content_type='image/png', body=PNG, headers={'Access-Control-Allow-Origin': '*'})))
        ctx.route('**tiles.maps.eox.at/**', lambda r: (reqs.append(r.request.url), r.fulfill(status=200, content_type='image/png', body=PNG, headers={'Access-Control-Allow-Origin': '*'})))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        import dialogs; dialogs.install(pg)
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(800)
        pg.evaluate("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}", cam); pg.wait_for_timeout(500)
        row = lambda lab: '#cfg .cf:has(> label:text-is("%s")) input' % lab
        def settings(on, url='', key='', credit='', z='18'):
            pg.click('#cfgbtn'); pg.wait_for_timeout(500)
            pg.set_checked(row('Own satellite layer'), True); pg.fill(row('Tile address'), url); pg.fill(row('Key'), key); pg.fill(row('Credit'), credit); pg.fill(row('Deepest zoom'), z); pg.set_checked(row('Own satellite layer'), on)
            pg.click('#cfg .btn:not(.g)'); pg.wait_for_timeout(600)
        check('the Settings have the own satellite layer rows', (pg.click('#cfgbtn'), pg.wait_for_timeout(400), pg.locator(row('Own satellite layer')).count() == 1 and pg.locator(row('Tile address')).count() == 1 and pg.locator(row('Deepest zoom')).count() == 1)[2])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1200)
        pg.click('#mpbaseb'); pg.wait_for_timeout(250)
        check('off by default: the satellite entry is the built-in one', 'Satellite (online)' in pg.inner_text('#mpbase'))
        pg.click('#mpbase input[value=sat]'); pg.wait_for_timeout(1200)
        check('built-in: the tiles come from EOX', any('eox.at' in u for u in reqs) and not any('faketiles' in u for u in reqs))
        pg.click('[data-t=kb]'); pg.wait_for_timeout(200)
        settings(True, 'http://localhost:%d/faketiles/{z}/{y}/{x}.png?k={key}' % PORT, 'ABC', 'Test Credit', '16')
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1500)
        check('on: the layer asks the own provider, the key is put in place of {key}', any('faketiles' in u and 'k=ABC' in u for u in reqs))
        check('the credit is shown on the map', 'Test Credit' in pg.inner_text('#mpmap .leaflet-control-attribution'))
        check('the map menu names the own provider', (pg.click('#mpbaseb'), pg.wait_for_timeout(250), 'your provider' in pg.inner_text('#mpbase'))[2])
        pg.click('[data-t=kb]'); pg.wait_for_timeout(200)
        n0 = len(reqs); settings(False, 'http://localhost:%d/faketiles/{z}/{y}/{x}.png?k={key}' % PORT, 'ABC', 'Test Credit', '16')
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1500)
        check('off again: back to EOX', any('eox.at' in u for u in reqs[n0:]) and 'Satellite (online)' in (pg.click('#mpbaseb'), pg.wait_for_timeout(250), pg.inner_text('#mpbase'))[2])
        pg.click('#cfgbtn'); pg.wait_for_timeout(400)
        check('the tile address, key, credit and zoom rows are hidden until the box is ticked', not pg.locator(row('Tile address')).is_visible() or pg.evaluate("()=>1") and pg.locator(row('Own satellite layer')).count() == 1)
        pg.set_checked(row('Own satellite layer'), True); pg.wait_for_timeout(100); check('ticked: they appear', pg.locator(row('Tile address')).is_visible() and pg.locator(row('Deepest zoom')).is_visible())
        pg.set_checked(row('Own satellite layer'), False); pg.wait_for_timeout(100); check('unticked: hidden again', not pg.locator(row('Tile address')).is_visible())
        check('no page errors', not errs); print(errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
