"""Checks that the BMS-folder map picture is cached: the second start shows the map without decoding the big picture. Usage: python3 tools/mapcache-test.py"""
import base64, subprocess, sys, time, os, io, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); FX = R + '/tests/fixtures/beartrap/'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8772', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; print(('OK   ' if c else 'FAIL ') + n); ok = ok and bool(c)
COUNT = "window.__dec=0;const o=window.createImageBitmap;window.createImageBitmap=function(a,...r){if(a&&a.type=='image/png')window.__dec++;return o.call(this,a,...r)}"
try:
    im = Image.new('RGB', (5000, 5000), (30, 90, 160)); ImageDraw.Draw(im).rectangle([2000, 2000, 2400, 2400], fill=(255, 0, 0))
    bio = io.BytesIO(); im.save(bio, 'PNG'); b64 = base64.b64encode(bio.getvalue()).decode()
    cam = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1500, 'height': 900}); errs = []
        def start():
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(COUNT)
            import dialogs; dialogs.install(pg)
            pg.goto('http://localhost:8772/app/index.html'); pg.wait_for_timeout(800)
            pg.evaluate("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}", cam); pg.wait_for_timeout(500)
            pg.evaluate("b=>{window.__localMap=async()=>new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'8_KTO_16k_Skyvector.png',{type:'image/png'})}", b64)
            pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(700)
            pg.click('#mpbaseb'); pg.wait_for_timeout(250); pg.check('#mpbase input[value=sky]'); pg.wait_for_timeout(2500)
            return pg
        a = start(); tiles = a.locator('#mpmap canvas.leaflet-tile').count()
        check('first start: tiles shown, picture decoded once', tiles > 0 and a.evaluate('window.__dec') >= 1)
        a.wait_for_timeout(1500); a.close()
        b = start()
        check('second start: tiles shown without decoding the big picture', b.locator('#mpmap canvas.leaflet-tile').count() > 0 and b.evaluate('window.__dec') == 0)
        b.evaluate("()=>{__app.mapV.leaflet.setView(__app.mapV.toLL(469.6, 354.6), 11)}"); b.wait_for_timeout(3000)
        check('zooming in loads the detail in the background', b.evaluate('window.__dec') == 1 and b.locator('#mpmap canvas.leaflet-tile').count() > 0)
        check('no page errors', not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
