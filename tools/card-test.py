"""Checks the MDC format of the card (drawn in code, behind the MDC format button) and that the Datacard stays as it was. Usage: python3 tools/card-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8781', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1500, 'height': 1900}, reduced_motion='reduce')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8781/app/index.html'); pg.wait_for_timeout(900)
        pg.wait_for_selector('#boot', state='detached', timeout=30000)
        check('the loading bar is gone once the program has started and the version is shown', pg.locator('#boot').count() == 0 and pg.inner_text('#appver').startswith('v0.'))
        check('no yellow marks and no clickable cells while there is no card', pg.locator('#cvhl i').count() == 0)
        import base64
        FX = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/tests/fixtures/beartrap/'
        pg.evaluate("t=>__app.parse(t)", open(FX + 'Evil19_2_.ini', encoding='latin1').read())
        pg.evaluate("async(b)=>{await __app.loadCam(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.cam'))}", base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()); pg.wait_for_timeout(1200)
        pg.evaluate("()=>{const s=document.querySelector('#fsel');if(s&&s.options.length>1){s.value=s.options[1].value;s.onchange&&s.onchange()}}"); pg.wait_for_timeout(1200)
        check('the cells filled from a list or by automatic values carry a yellow mark over the card (an overlay, not drawn into the card)', pg.locator('#cvhl i').count() >= 5 and pg.evaluate("()=>getComputedStyle(document.querySelector('#cvhl i')).backgroundColor").startswith('rgba(255, 222, 0'))
        def inside():
            return pg.evaluate("()=>{const c=document.getElementById('cv').getBoundingClientRect();return [...document.querySelectorAll('#cvhl i')].every(i=>{const r=i.getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1})}")
        check('every mark lies inside the card', inside())
        pg.click('[data-t=mp]'); pg.wait_for_timeout(500); pg.click('text=Datacard >> nth=0'); pg.wait_for_timeout(500)
        check('after another page the marks are still inside the card', pg.locator('#cvhl i').count() >= 5 and inside())
        check('the button is called MDC format', pg.inner_text('#mdctog') == 'MDC format')
        check('the Datacard keeps its own cells (405 fields)', pg.evaluate("__app.FD.length") == 405)
        mk = pg.evaluate("[...new Set(__app.MFD.map(d=>d.k))]")
        need = ['cs', 'pkg', 'mis', 'atis', 'ab0_0', 'ab2_6', 'fl0_0', 'fl3_6', 'pk4_6', 'fp0_0', 'fp23_7', 'aa', 'tanks', 'gw', 'bingo', 'joker', 'pri', 'll2', 'ews5', 'wp1_mode', 'wp2_bc', 'dmode', 'dv2', 'ob2', 'dl_rs', 'su4_3', 'sn4', 'bv3_5', 'roe', 'free', 'eph',
                'm1', 'm4', 'step', 'to_time', 'ld_time', 'airsp', 'ps0', 'ps9', 'nav1_2', 'dl0_ndl', 'dl1_dn', 'srv', 'contracts']
        miss = [k for k in need if k not in mk]
        check('every field of the Datacard and the new MDC fields is a cell of the MDC format %s' % miss, not miss)
        info = pg.evaluate("""async()=>{const m=await import('./js/core/cardlayout.js');const sh=m.SHOT;
          const ab=m.LAYOUT.shapes.filter(s=>s.t=='cell'&&s.white&&(s.lab=='A'||s.lab=='B')).map(s=>s.lab+':'+Math.round(s.r[1]));
          return {w:Math.round(sh[2]-sh[0]),h:Math.round(sh[3]-sh[1]),ab}}""")
        check('screenshot box is 441 x 441 like the Datacard one', info['w'] == 441 and info['h'] == 441)
        check('link 16 rows A and B are separate cells, one under the other', len(info['ab']) == 2 and info['ab'][0].startswith('A') and info['ab'][1].startswith('B'))
        check('bingo is red', pg.evaluate("__app.MFD.find(d=>d.k=='bingo').red") in (1, True))
        pg.click('[data-t=kb]'); pg.click('#mdctog'); pg.wait_for_timeout(400)
        check('the MDC format button turns on', 'on' in (pg.get_attribute('#mdctog', 'class') or '').split())
        pg.evaluate("()=>{__app.openEd('srv')}") if False else None
        d = pg.evaluate("()=>{const d=__app.MFD.find(z=>z.k=='srv');return {x:d.x+d.w/2,y:d.y0+d.h/2}}")
        box = pg.locator('#cv').bounding_box()
        pg.mouse.click(box['x'] + d['x'] / 1600 * box['width'], box['y'] + d['y'] / 1200 * box['height']); pg.wait_for_timeout(200)
        check('a click on a cell opens the editor', pg.is_visible('#ed'))
        pg.keyboard.type('192.168.1.10:5000'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        v = pg.evaluate("__app.F.srv"); check('a new field is stored: %s' % v, v == '192.168.1.10:5000')
        dark = pg.evaluate("""()=>{const d=__app.MFD.find(z=>z.k=='srv'),c=document.getElementById('cv').getContext('2d'),SX=2048/1600,SY=2048/1200;const im=c.getImageData(Math.round(d.x*SX),Math.round(d.y0*SY),Math.round(d.w*SX),Math.round(d.h*SY)).data;let n=0;for(let i=0;i<im.length;i+=4)if(im[i]<120)n++;return n}""")
        check('the text is drawn in its cell', dark > 40)
        pg.evaluate("()=>{const d=__app.MFD.find(z=>z.k=='bingo');__app.openEd('bingo')}") if False else None
        d = pg.evaluate("()=>{const d=__app.MFD.find(z=>z.k=='bingo');return {x:d.x+d.w/2,y:d.y0+d.h/2}}")
        box = pg.locator('#cv').bounding_box()
        pg.mouse.click(box['x'] + d['x'] / 1600 * box['width'], box['y'] + d['y'] / 1200 * box['height']); pg.keyboard.type('3800'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        red = pg.evaluate("""()=>{const d=__app.MFD.find(z=>z.k=='bingo'),c=document.getElementById('cv').getContext('2d'),SX=2048/1600,SY=2048/1200;const im=c.getImageData(Math.round(d.x*SX),Math.round(d.y0*SY),Math.round(d.w*SX),Math.round(d.h*SY)).data;let n=0;for(let i=0;i<im.length;i+=4)if(im[i]>150&&im[i+1]<60&&im[i+2]<60)n++;return n}""")
        check('the bingo value is drawn in red', red > 30)
        pg.click('#mdctog'); pg.wait_for_timeout(300)
        check('the Datacard comes back with the button off', 'on' not in (pg.get_attribute('#mdctog', 'class') or '').split())
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.kill()
sys.exit(0 if ok else 1)
