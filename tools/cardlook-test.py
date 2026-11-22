"""Checks the two looks of the cards (1.3.0-beta.48): a card made by the program keeps its light and its dark picture, the Light / Dark cards button of the
Kneeboard switches the cards already there, the kneeboard is then not saved, and a page drawn for BMS has the look chosen. No BMS files.
Usage: python3 tools/cardlook-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1500, 'height': 1000}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        r = pg.evaluate("""async()=>{const K=await import('./js/app/kneeboard.js');
          const mk=col=>{const c=document.createElement('canvas');c.width=1600;c.height=2400;const x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,1600,2400);return new Promise(r=>c.toBlob(r,'image/png'))};
          await K.kbAddPic(await mk('#ffffff'),'two looks',await mk('#101010'),false);
          await K.kbAddPic(await mk('#808080'),'one look');
          const it=K.KBLIB.find(i=>i.name=='two looks'),one=K.KBLIB.find(i=>i.name=='one look');
          const px=t=>{const i=K.KBS.findIndex(r=>r.left.item===t||r.right.item===t);return K.kbDecodeUsed().then(()=>{const row=K.kbRow(i),side=K.KBS[i].left.item===t?0:1024;return row.getContext('2d').getImageData(side+500,1000,1,1).data[0]})};
          const a=await px(it),a1=await px(one);window.__K=K;return {a,a1}}""")
        check('a card made light is drawn light on the page for BMS', r['a'] == 255)
        pg.click('[data-t=kn]'); pg.wait_for_timeout(600)
        check('one button for the look: Light cards', pg.locator('#kbcd').count() == 1 and pg.locator('#kbcl').count() == 0 and 'Light' in pg.inner_text('#kbcd'))
        pg.click('#kbcd'); pg.wait_for_timeout(800)
        r = pg.evaluate("""async()=>{const K=window.__K,it=K.KBLIB.find(i=>i.name=='two looks'),one=K.KBLIB.find(i=>i.name=='one look');
          const px=t=>{const i=K.KBS.findIndex(r=>r.left.item===t||r.right.item===t);return K.kbDecodeUsed().then(()=>{const row=K.kbRow(i),side=K.KBS[i].left.item===t?0:1024;return row.getContext('2d').getImageData(side+500,1000,1,1).data[0]})};
          return {b:await px(it),b1:await px(one),dark:it.dark,uns:K.kbUnsaved()}}""")
        check('Dark cards: the card already there switches to its dark picture %s' % r, r['b'] == 16 and r['dark'])
        check('...a page with one look only (imported) stays as it is', r['b1'] == 128)
        check('...the button says Dark cards and the kneeboard is not saved', 'Dark' in pg.inner_text('#kbcd') and r['uns'] and 'nil' not in (pg.get_attribute('#kbsave', 'class') or ''))
        check('...the choice is kept', pg.evaluate("()=>localStorage.getItem('bmscarddark')") == '1')
        r = pg.evaluate("""async()=>{const M=await import('./js/core/cardink.js');const c=document.createElement('canvas');c.width=c.height=10;const x=c.getContext('2d');M.inkCard(x);x.fillStyle='#ffffff';x.fillRect(0,0,10,10);const d=x.getImageData(5,5,1,1).data[0];
          let o=-1;M.otherLook(()=>{M.inkCard(x);x.fillStyle='#ffffff';x.fillRect(0,0,10,10);o=x.getImageData(5,5,1,1).data[0]});return {d,o,back:M.cardDark()}}""")
        check('drawing in the dark look turns white into near black; the other look draws it white and comes back %s' % r, r['d'] < 40 and r['o'] == 255 and r['back'])
        pg.click('#kbcd'); pg.wait_for_timeout(800)
        check('Light cards again: the card back to its light picture', pg.evaluate("()=>window.__K.KBLIB.find(i=>i.name=='two looks').dark") is False)
        # the datacard pages: dark with the Dark cards button (both formats), their own look with the ☀ / ☾ of a datacard page (then kept by the button)
        dcm = lambda: pg.evaluate("()=>{const K=window.__K;__app.ST.KBG=null;const c=K.kbRow(0),d=c.getContext('2d').getImageData(0,0,2048,2048).data;let s=0;for(let i=0;i<d.length;i+=4*97)s+=d[i];return Math.round(s/(d.length/4/97))}")
        pg.click('#kbcd'); pg.wait_for_timeout(800); m1 = dcm()
        pg.evaluate("()=>document.getElementById('mdctog').click()"); pg.wait_for_timeout(400); m2 = dcm(); pg.evaluate("()=>document.getElementById('mdctog').click()"); pg.wait_for_timeout(300)
        check('Dark cards: the datacard pages dark too, Datacard and MDC format (mean %d, %d)' % (m1, m2), m1 < 70 and m2 < 70 and pg.evaluate("()=>window.__K.KBDC.dark"))
        pg.locator('div.kbt[data-s=left]').first.click(); pg.wait_for_timeout(200)
        check('a datacard page chosen: the ☀ / ☾ button is on (☾), Send card stays off', 'nil' not in pg.get_attribute('#kblk', 'class') and pg.inner_text('#kblk') == '☾' and 'nil' in pg.get_attribute('#kbsend', 'class'))
        pg.click('#kblk'); pg.wait_for_timeout(600); m3 = dcm()
        pg.click('#kbcd'); pg.wait_for_timeout(600); pg.click('#kbcd'); pg.wait_for_timeout(600); m4 = dcm()
        check('...pressed: the datacard light (%d), kept light by the Dark cards button (%d)' % (m3, m4), m3 > 200 and m4 > 200 and pg.evaluate("()=>JSON.parse(localStorage.getItem('bmsdclook')).fixed"))
        # the files of the aircraft: the row of the package of the flight (its callsign), not the first one
        st = pg.evaluate("()=>{const F=__app.F,K=window.__K,o={cs:F.cs,a:F.pk0_0,b:F.pk0_1,c:F.pk1_0,d:F.pk1_1};Object.assign(F,{cs:'Warhawk 3',pk0_0:'Devil 5',pk0_1:'4 F-15K',pk1_0:'Warhawk 3',pk1_1:'2 F-16C-52 ROK'});const a=K.kbSet().id;F.cs='';const b=K.kbSet().id;Object.assign(F,{cs:o.cs,pk0_0:o.a,pk0_1:o.b,pk1_0:o.c,pk1_1:o.d});return [a,b]}")
        check('the kneeboard files (and the DTC): the F-16 of the flight, not the F-15 first in the package; no callsign: the first row %s' % st, st == ['f16', 'f15'])
        check('no errors %s' % errs[:2], not errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
