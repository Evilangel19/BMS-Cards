"""Checks the Settings option "Own satellite layer": the satellite layer of the maps takes the user's tile provider when it is on, EOX when off. Usage: python3 tools/satprovider-test.py"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); FX = R + '/tests/fixtures/beartrap/'
PORT = 8786
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
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
        def open_map():
            pg.click('#cfgbtn'); pg.wait_for_selector('#cfg[open]'); pg.click('#nv-map'); pg.wait_for_timeout(400)
        def switch(on):
            if (pg.get_attribute('[data-a=sw][data-k=sat]', 'aria-checked') == 'true') != on: pg.click('[data-a=sw][data-k=sat]'); pg.wait_for_timeout(300)
        def settings(on, url='', key='', credit='', z='18'):
            open_map()
            switch(True); pg.fill('#c-url', url); pg.fill('#c-key', key); pg.fill('#c-attr', credit); pg.fill('#c-zoom', z); switch(on)
            pg.click('#cfgsave'); pg.wait_for_timeout(600); pg.click('#cfgcancel'); pg.wait_for_timeout(400)
        open_map()
        check('the Settings have the own satellite layer rows (page Map)', pg.locator('[data-a=sw][data-k=sat]').count() == 1 and pg.locator('#c-url').count() == 1 and pg.locator('#c-key').count() == 1 and pg.locator('#c-attr').count() == 1 and pg.locator('#c-zoom').count() == 1)
        pg.click('#nv-general'); pg.wait_for_timeout(300)
        check('the Settings no longer have an Export folder row, and have the start-up option', pg.locator('#cfg label:text-is("Export folder")').count() == 0 and pg.locator('#cfg label:text-is("Export file name")').count() == 0 and pg.locator('#cfg .s-rw .tt:text-is("Open last at start")').count() == 1 and pg.inner_text('#p-general .s-rw .tt') == 'Open last at start')
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
        open_map()
        check('the tile address, key, credit and zoom rows are hidden until the switch is on', not pg.locator('#c-url').is_visible())
        pg.click('[data-a=sw][data-k=sat]'); pg.wait_for_timeout(350); check('on: they appear', pg.locator('#c-url').is_visible() and pg.locator('#c-zoom').is_visible())
        pg.click('[data-a=sw][data-k=sat]'); pg.wait_for_timeout(350); check('off: hidden again', not pg.locator('#c-url').is_visible())
        check('no page errors', not errs); print(errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
