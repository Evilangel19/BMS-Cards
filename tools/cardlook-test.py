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
        check('no errors %s' % errs[:2], not errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
