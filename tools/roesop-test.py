"""ROE / SOP: the menu of the cell (choices, own text, presets on this PC, several presets together), the text on the Datacard and on the MDC,
the layout of the right column of page 2 (ROE / SOP bigger, notes lower, ephemerides on one line). No BMS files. Usage: python3 tools/roesop-test.py [shots dir]"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import dialogs
PORT = 8994
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
shots = sys.argv[1] if len(sys.argv) > 1 else None
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1400, 'height': 950}); errs = []
        dialogs.install(pg); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{try{localStorage.removeItem('bmsroepre')}catch(e){}}")
        pg.evaluate("()=>__app.openEd('roe')"); pg.wait_for_timeout(400)
        check('a click on ROE / SOP opens its menu (ROE and the SOP phases)', pg.locator('.roepop').count() == 1 and pg.locator('.roepop .rpg').count() >= 6 and pg.locator('.roepop .rpk[data-r=ws]').count() == 3)
        pg.click('.roepop .rpk[data-r=ws][data-v=tight]'); pg.click('.roepop .rpk[data-r=id][data-v=awacs]'); pg.click('.roepop .rpk[data-r=id][data-v=l16]')
        pg.click('.roepop .rpk[data-r=ws][data-v=free]')
        check('weapons status is one choice, ID criteria several', pg.locator('.roepop .rpk[data-r=ws].on').count() == 1 and pg.locator('.roepop .rpk[data-r=id].on').count() == 2)
        pg.select_option('.roepop .rpr[data-t=lights] select', 'move')
        check('a SOP topic just chosen shows its full text and goes on the card', 'as soon as the aircraft moves' in pg.inner_text('.roepop .rpr[data-t=lights] .rpd') and pg.is_checked('.roepop .rpr[data-t=lights] .rpon input'))
        pg.select_option('.roepop .rpr[data-t=rec] select', '*'); pg.wait_for_timeout(100)
        pg.fill('.roepop .rpr[data-t=rec] .rpi', 'SPIRAL DOWN')
        pv = pg.inner_text('.roepop .rpv')
        check('the preview is the text of the card: %s' % pv.replace('\n', ' | '), pv.startswith('ROE: WPN FREE · ID: AWACS DECLARE+L16') and 'SOP: LTS: FLASH MOVING · REC: SPIRAL DOWN' in pv)
        if shots: pg.screenshot(path=shots + '/roesop-menu.png')
        pg.fill('.roepop .rpnm', 'A-A'); pg.click('.roepop [data-a=save]'); pg.wait_for_timeout(150)
        check('Save as preset keeps it on this PC', pg.locator('.roepop .rpq').count() == 1 and 'A-A' in pg.evaluate("()=>localStorage.getItem('bmsroepre')"))
        pg.click('.roepop [data-a=clear]'); pg.click('.roepop .rpk[data-r=ws][data-v=hold]'); pg.select_option('.roepop .rpr[data-t=takeoff] select', 's20')
        pg.fill('.roepop .rpnm', 'Strike'); pg.click('.roepop [data-a=save]'); pg.wait_for_timeout(150)
        pg.click('.roepop [data-a=clear]')
        pg.click('.roepop .rpq[data-i="0"]'); pg.click('.roepop .rpq[data-i="1"]'); pg.wait_for_timeout(150)
        pv = pg.inner_text('.roepop .rpv')
        check('two presets together: the last weapons status, the topics of both: %s' % pv.replace('\n', ' | '), 'WPN HOLD' in pv and 'WPN FREE' not in pv and 'LTS: FLASH MOVING' in pv and 'T/O: 20S' in pv and 'REC: SPIRAL DOWN' in pv)
        pg.click('.roepop [data-a=apply]'); pg.wait_for_timeout(400)
        F = pg.evaluate("()=>({roe:__app.F.roe,sel:__app.F.roesel})")
        check('Apply writes the card text and keeps the choices with the flight', F['roe'].startswith('ROE: WPN HOLD') and '"hold"' in (F['sel'] or '') and pg.locator('.roepop').count() == 0)
        pg.evaluate("()=>__app.openEd('roe')"); pg.wait_for_timeout(300)
        check('the menu opens again with the choices of the flight', pg.locator('.roepop .rpk[data-r=ws][data-v=hold].on').count() == 1 and pg.input_value('.roepop .rpr[data-t=rec] .rpi') == 'SPIRAL DOWN')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Esc closes it', pg.locator('.roepop').count() == 0)
        # the card: the ROE / SOP text in its box, the notes and the ephemerides below
        r = pg.evaluate("""async()=>{const cv=await import('/app/js/app/cardview.js'),dc=await import('/app/js/app/datacard.js');
          dc.F.free='Daegu TWR 365.000/126.200 ATIS 127.650\\n\\nUHF2 backup\\nDevil 3 229.200 · Panther 4 288.775';dc.F.eph='Sun 21/10 21:43Z-08:37Z · Moon 06:07Z-17:05Z (76%)';
          const T=[];const x=document.getElementById('cv').getContext('2d'),o=x.fillText;x.fillText=function(t,a,b,m){T.push([String(t),b]);return o.call(this,t,a,b,m)};cv.draw();x.fillText=o;
          const y=s=>(T.find(q=>q[0].includes(s))||[0,null])[1];return {roe:y('ROE: WPN HOLD'),sop:y('SOP:'),notes:y('Daegu'),eph:y('Sun 21/10'),hdr:T.some(q=>q[0]=='ROE / SOP')}}""")
        check('Datacard: ROE / SOP on top, then the notes, the ephemerides on one line at the bottom %s' % r, r['roe'] and r['sop'] and r['notes'] and r['eph'] and 921 < r['roe'] < r['sop'] < 1031 < r['notes'] < 1171 < r['eph'] < 1198)
        if shots:
            pg.evaluate("()=>{}"); pg.locator('#cv').screenshot(path=shots + '/roesop-card.png')
        m = pg.evaluate("()=>{const d=__app.MFD.find(z=>z.k=='roe');return d?{lab:d.lab,w:d.w,h:d.h}:null}")
        check('MDC: the Overview box is ROE / SOP (the same text) %s' % m, m and m['lab'] == 'ROE / SOP' and m['h'] > 150)
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
