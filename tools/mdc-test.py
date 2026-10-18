"""Checks the MDC card test page (app/mdc.html): it draws, fills the cells from the sample flight and exports a 2048x2048 card. Usage: python3 tools/mdc-test.py"""
import subprocess, sys, time, os, base64
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8793', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1700, 'height': 1300}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto('http://localhost:8793/app/mdc.html'); pg.wait_for_timeout(1500)
        n = pg.evaluate("()=>Object.keys(__mdc.draw()).length"); check('cells filled from the sample flight (%d)' % n, n > 120)
        check('the export is 2048x2048', pg.evaluate("()=>document.getElementById('b').width==2048&&document.getElementById('b').height==2048&&document.getElementById('c').width==2048"))
        check('the take-off row cells are filled', pg.evaluate("()=>{const t=__mdc.draw();return ['gw','rot','to','ref','takeoff','land','jb'].every(k=>t[k])}"))
        check('the steerpoint table has LAT/LONG', pg.evaluate("()=>{const t=__mdc.draw();return /^N35/.test(t.sp0_2)&&/^E126/.test(t.sp0_3)}"))
        ink = pg.evaluate("()=>{const c=document.getElementById('c').getContext('2d'),d=c.getImageData(0,0,2048,2048).data;let n=0;for(let i=0;i<d.length;i+=4*97)if(d[i]<100)n++;return n}")
        check('the gapless export has content', ink > 1500)
        check('no page errors', not errs)
        # the toggle in the app
        FX = R + '/tests/fixtures/beartrap/'; b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
        pg2 = b.new_page(viewport={'width': 1700, 'height': 1300}); e2 = []; pg2.on('pageerror', lambda e: (e2.append(str(e)), print('PE', e))); pg2.on('console', lambda m: print('CON', m.text) if m.type=='error' else 0)
        pg2.goto('http://localhost:8793/app/index.html'); pg2.wait_for_timeout(800)
        pg2.evaluate("t=>__app.parse(t)", open(FX + 'Evil19_2_.ini', encoding='latin1').read()); pg2.wait_for_timeout(300)
        pg2.evaluate("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}", b64('PSI_BEAR_TRAP_26.cam')); pg2.wait_for_timeout(1000)
        sig = lambda: pg2.evaluate("()=>{const d=document.getElementById('cv').getContext('2d').getImageData(0,0,2048,2048).data;let h=0;for(let i=0;i<d.length;i+=4*61)h=(h*31+d[i]+d[i+1]*3)|0;return h}")
        pg2.click('.tab[data-t=kb]'); pg2.wait_for_timeout(500); h0 = sig(); pg2.click('#mdctog'); pg2.wait_for_timeout(1500); h1 = sig()
        check('the MDC button switches the card layout', pg2.evaluate("()=>__app.mdcOn") and h0 != h1)
        check('the MDC card is filled by hand (no autofill)', pg2.evaluate("()=>!Object.keys(__app.F).some(k=>k.startsWith('mdc_'))"))
        # editing on the MDC: click the callsign cell, type, Enter
        flds = pg2.evaluate("()=>fetch('mdc/fields.json').then(r=>r.json())")
        cs = [f for f in flds if f['id'] == 'cs'][0]['r']
        pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", cs)
        pg2.evaluate("([x,y])=>window.scrollTo(0,Math.max(0,y-300))", pos); pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", cs)
        pg2.mouse.click(pos[0], pos[1]); pg2.wait_for_timeout(300)
        check('a click on an MDC cell opens the editor', pg2.is_visible('#ed input'))
        pg2.keyboard.type('Zeta 9'); pg2.keyboard.press('Enter'); pg2.wait_for_timeout(300)
        check('the typed value is kept in the MDC cell and drawn, the Datacard callsign is untouched', pg2.evaluate("()=>__app.F.mdc_cs")=='Zeta 9' and pg2.evaluate("()=>__app.F.cs")!='Zeta 9' and sig() != h1)
        xs = [f for f in flds if f['id'] == 'x100'][0]['r']
        pg2.keyboard.press('Escape')
        pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", xs)
        pg2.evaluate("([x,y])=>window.scrollTo(0,Math.max(0,y-300))", pos); pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", xs)
        pg2.mouse.click(pos[0], pos[1]); pg2.wait_for_timeout(300); pg2.keyboard.type('EOB 1'); pg2.keyboard.press('Enter'); pg2.wait_for_timeout(300)
        check('the empty cells of the other tables (EOB, SPINS, CSAR...) are editable too', len(flds) > 630 and pg2.evaluate("()=>__app.F.mdc_x100")=='EOB 1')
        hs = [f for f in flds if f['id'] == 'h0'][0]['r']
        pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", hs)
        pg2.evaluate("([x,y])=>window.scrollTo(0,Math.max(0,y-300))", pos); pos = pg2.evaluate("r=>{const b=document.getElementById('cv').getBoundingClientRect();return [b.left+(r[0]+r[2])/2/1600*b.width,b.top+(r[1]+r[3])/2/1200*b.height]}", hs)
        pg2.mouse.click(pos[0], pos[1]); pg2.wait_for_timeout(300); pg2.keyboard.type('0815'); pg2.keyboard.press('Enter'); pg2.wait_for_timeout(300)
        check('the cells with a printed label (STEP, START, CHECK IN, TAXI, AUX, TRACK, ALT, OFF, TANK, AIRSPACE, M1-M4) are editable', len([f for f in flds if f['id'].startswith('h')]) == 14 and pg2.evaluate("()=>__app.F.mdc_h0")=='0815')
        pg2.click('#mdctog'); pg2.wait_for_timeout(500); check('and back to the Datacard (with the edit)', not pg2.evaluate("()=>__app.mdcOn") and sig() != h1)
        check('no page errors in the app', not e2)
finally: srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
