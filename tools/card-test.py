"""Checks the MDC format of the card (drawn in code, behind the MDC format button) and that the Datacard stays as it was. Usage: python3 tools/card-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8781', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        # startup screen: with the script held back the screen stays, and the program logo must sit above the title and the loading bar
        bp = br.new_page(viewport={'width': 1200, 'height': 800}, reduced_motion='reduce')
        bp.route('**/js/app/main.js', lambda r: r.abort())
        bp.goto('http://localhost:8781/app/index.html'); bp.wait_for_timeout(600)
        g = bp.evaluate("()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),l=document.querySelector('#boot img.bl');return l?{l:q('#boot img.bl'),t:q('#boot div'),b:q('#boot .bt'),w:l.naturalWidth,x:innerWidth}:null}")
        check('startup screen: the program logo is loaded and shown', g is not None and g['w'] > 0 and g['l']['width'] >= 80)
        check('startup screen: the logo sits above the title and the loading bar, centred', g is not None and g['l']['bottom'] <= g['t']['top'] + 1 and g['t']['bottom'] <= g['b']['top'] + 1 and abs((g['l']['left'] + g['l']['width'] / 2) - g['x'] / 2) < 2)
        bp.set_viewport_size({'width': 700, 'height': 380}); bp.wait_for_timeout(200)
        g = bp.evaluate("()=>{const q=s=>document.querySelector(s).getBoundingClientRect();return {l:q('#boot img.bl'),m:q('#bootmsg')}}")
        check('startup screen: on a short window the logo gets smaller and everything still fits', g['l']['width'] <= 60 and g['l']['top'] >= 0 and g['m']['bottom'] <= 380)
        bp.close()
        pg = br.new_page(viewport={'width': 1500, 'height': 1900}, reduced_motion='reduce')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8781/app/index.html'); pg.wait_for_timeout(900)
        pg.wait_for_selector('#boot', state='detached', timeout=30000)
        check('the loading bar is gone once the program has started and the version is shown', pg.locator('#boot').count() == 0 and pg.inner_text('#appver').startswith('v'))
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
        check('the Datacard keeps its own cells (430 fields)', pg.evaluate("__app.FD.length") == 430)
        mk = pg.evaluate("[...new Set(__app.MFD.map(d=>d.k))]")
        need = ['cs', 'pkg', 'su0_2', 'matis', 'm1', 'm4', 'step', 'to_time', 'ld_time', 'airsp', 'ps0', 'ps9', 'nav0_2', 'fl0_0', 'fl0_c', 'fl7_s', 'fl3_5', 'fp0_st', 'fp14_11',
                't0_4', 't2_4', 'dl0_fc', 'dl1_dn2', 'ovw', 'gw', 'ref', 'srv', 'bingo', 'joker', 'rc0_0', 'rc7_7', 'xAD25', 'xAL57']
        miss = [k for k in need if k not in mk]
        check('the cells of the MDC format that the program fills (and the free cells of page 2) exist %s' % miss, not miss)
        # the columns follow their text: how much of its natural width (15 px Arial, card units) a typical text gets in its cell
        lay = pg.evaluate("""async()=>{const m=await import('./js/core/cardlayout.js'),g=await import('./js/core/seatgeo.js'),f=n=>m.LAYOUT.fields.find(d=>d.k==n),r=n=>f(n).r,
          c=document.createElement('canvas').getContext('2d');c.font='15px Arial';
          const fit=(k,t,ind=0)=>((r(k)[2]-r(k)[0])*1600/2048-8-ind)/c.measureText(t).width,w=k=>Math.round((r(k)[2]-r(k)[0])*10)/10,
            ind=g.seatShift((r('rc0_0')[3]-r('rc0_0')[1])*1200/2048);
          return {rc:[0,1,2,3,4,5,6,7].map(j=>w('rc0_'+j)),eob:['xAD25','xAE25','xAF25','xAH25','xAJ25'].map(w),ni:!!f('cfg_ni'),end:r('ref')[2],
            row:['cfg','gw','drag','rot','tospec','cfg_dist','ref'].map(k=>r(k).map(x=>Math.round(x*10)/10)),
            fit:{cs:fit('rc0_0','Overlord 11',ind),hold:fit('rc0_2','17:51-17:57'),alt:fit('rc0_3','FL250'),freq:fit('rc0_4','377.875'),push:fit('rc0_5','18:06'),tgt:fit('rc0_6','2nd Armored Brigade HQ'),tot:fit('rc0_7','18:55 - 19:01'),
              type:fit('xAE25','WWOLF'),lat:fit('xAF25',"N 36° 13.322'"),long:fit('xAH25',"E 128° 55.872'"),be:fit('xAJ25','284/120'),gw:fit('gw','40042')}}}""")
        fq = lay['fit']
        check('roll call: every column holds its typical text at its natural width, the callsign with the room of the round button (%s)' % {k: round(v, 2) for k, v in fq.items() if k in ('cs', 'hold', 'alt', 'freq', 'push', 'tgt', 'tot')}, all(fq[k] >= 1 for k in ('cs', 'hold', 'alt', 'freq', 'push', 'tgt', 'tot')))
        check('roll call: the table keeps its width (%s) and TGT is the widest column (a name of 22 letters is not squeezed)' % lay['rc'], abs(sum(lay['rc']) - 986) < 1 and lay['rc'][6] == max(lay['rc']) and lay['rc'][6] >= 240 and lay['rc'][0] >= 160)
        check('Known EOB: B/E is narrower than LAT and LONG, and TYPE, LAT and LONG are wider than before (%s), the table keeps its width' % lay['eob'], abs(sum(lay['eob']) - 449) < 1 and lay['eob'][4] < min(lay['eob'][2:4]) and lay['eob'][4] < 80 and lay['eob'][1] > 66 and lay['eob'][2] > 115 and lay['eob'][3] > 115)
        check('Known EOB: the texts are squeezed less (TYPE %.2f, LAT %.2f, LONG %.2f, B/E %.2f)' % (fq['type'], fq['lat'], fq['long'], fq['be']), fq['type'] >= 0.8 and fq['lat'] >= 0.95 and fq['long'] >= 0.88 and fq['be'] >= 0.93)
        row = lay['row']
        check('loadout row: no NRM / IMM cells, the row is whole up to the page edge (%s)' % row, not lay['ni'] and abs(lay['end'] - 993.6) < 0.5 and all(abs(row[i][2] - row[i + 1][0]) < 0.2 for i in range(6)))
        check('loadout row: CFG / LMT and GW are wider (%s / %s px), the others kept their width' % (round(row[0][2] - row[0][0]), round(row[1][2] - row[1][0])), row[0][2] - row[0][0] >= 440 and row[1][2] - row[1][0] >= 105 and fq['gw'] >= 1.5 and all(abs((row[i][2] - row[i][0]) - wd) < 1 for i, wd in ((2, 71.3), (3, 78.5), (4, 78.5), (5, 78.6), (6, 117.7))))
        info = pg.evaluate("""async()=>{const m=await import('./js/core/cardlayout.js');const sh=m.SHOT,f=n=>m.LAYOUT.fields.find(d=>d.k==n).r;
          return {w:Math.round(sh[2]-sh[0]),h:Math.round(sh[3]-sh[1]),a:Math.round(f('dl0_fc')[1]),b:Math.round(f('dl1_fc')[1]),n:m.LAYOUT.fields.length}}""")
        check('screenshot box is the big white box of the MDC (about 750 x 525) %s' % info, 700 < info['w'] < 800 and 480 < info['h'] < 560)
        check('link rows A and B are separate cells, one under the other', info['b'] > info['a'] + 20)
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
