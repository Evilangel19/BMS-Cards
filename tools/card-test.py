"""Checks the card (Datacard + mission data card drawn in code): cells, new fields, red bingo, A/B link rows, screenshot box. Usage: python3 tools/card-test.py"""
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
        pg = br.new_page(viewport={'width': 1500, 'height': 1200}, reduced_motion='reduce')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8781/app/index.html'); pg.wait_for_timeout(900)
        check('no MDC button and no image to load', pg.locator('#mdctog').count() == 0)
        keys = pg.evaluate("[...new Set(__app.FD.map(d=>d.k))]")
        need = ['cs', 'pkg', 'mis', 'atis', 'ab0_0', 'ab2_6', 'fl0_0', 'fl3_6', 'pk4_6', 'fp0_0', 'fp23_7', 'aa', 'tanks', 'gw', 'bingo', 'joker', 'pri', 'll2', 'ews5', 'wp1_mode', 'wp2_bc', 'dmode', 'dv2', 'ob2', 'dl_rs', 'su4_3', 'sn4', 'bv3_5', 'roe', 'free', 'eph',
                'm1', 'm4', 'step', 'to_time', 'ld_time', 'airsp', 'ps0', 'ps9', 'nav1_2', 'dl0_ndl', 'dl1_dn', 'srv', 'contracts']
        miss = [k for k in need if k not in keys]
        check('every field of the Datacard and the new MDC fields is a cell %s' % miss, not miss)
        info = pg.evaluate("""async()=>{const m=await import('./js/core/cardlayout.js');const sh=m.SHOT;
          const ab=m.LAYOUT.shapes.filter(s=>s.t=='cell'&&s.white&&(s.lab=='A'||s.lab=='B')).map(s=>s.lab+':'+Math.round(s.r[1]));
          return {w:Math.round(sh[2]-sh[0]),h:Math.round(sh[3]-sh[1]),ab}}""")
        check('screenshot box is 441 x 441 like the Datacard one', info['w'] == 441 and info['h'] == 441)
        check('link 16 rows A and B are separate cells, one under the other', len(info['ab']) == 2 and info['ab'][0].startswith('A') and info['ab'][1].startswith('B'))
        check('bingo is red', pg.evaluate("__app.FD.find(d=>d.k=='bingo').red===1||__app.FD.find(d=>d.k=='bingo').red===true"))
        pg.evaluate("()=>{__app.openEd('srv')}"); pg.keyboard.type('192.168.1.10:5000'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        v = pg.evaluate("__app.F.srv"); check('a new field is stored: %s' % v, v == '192.168.1.10:5000')
        dark = pg.evaluate("""()=>{const d=__app.FD.find(z=>z.k=='srv'),c=document.getElementById('cv').getContext('2d'),SX=2048/1584,SY=2048/1224;const im=c.getImageData(Math.round(d.x*SX),Math.round(d.y0*SY),Math.round(d.w*SX),Math.round(d.h*SY)).data;let n=0;for(let i=0;i<im.length;i+=4)if(im[i]<120)n++;return n}""")
        check('the text is drawn in its cell', dark > 40)
        pg.evaluate("()=>{__app.openEd('bingo')}"); pg.keyboard.type('3800'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        red = pg.evaluate("""()=>{const d=__app.FD.find(z=>z.k=='bingo'),c=document.getElementById('cv').getContext('2d'),SX=2048/1584,SY=2048/1224;const im=c.getImageData(Math.round(d.x*SX),Math.round(d.y0*SY),Math.round(d.w*SX),Math.round(d.h*SY)).data;let n=0;for(let i=0;i<im.length;i+=4)if(im[i]>150&&im[i+1]<60&&im[i+2]<60)n++;return n}""")
        check('the bingo value is drawn in red', red > 30)
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.kill()
sys.exit(0 if ok else 1)
