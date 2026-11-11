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
        # the drop-down of a SOP topic: the list of the program, above the menu
        pg.click('.roepop .rpr[data-t=lights] select'); pg.wait_for_timeout(250)
        dd = pg.evaluate("()=>{const d=document.querySelector('.ddp');if(!d)return null;const r=d.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+12);return {n:d.children.length,top:!!e&&d.contains(e),bg:getComputedStyle(document.querySelector('.roepop .rpr select')).backgroundColor}}")
        check('a SOP drop-down opens the list of the program over the menu, dark like the others %s' % dd, dd and dd['n'] == 6 and dd['top'] and dd['bg'] == 'rgb(11, 15, 20)')
        pg.click('.ddp .ddi:has-text("FLASH MOVING")'); pg.wait_for_timeout(200)
        check('a SOP topic just chosen shows its full text and goes on the card', 'as soon as the aircraft moves' in pg.inner_text('.roepop .rpr[data-t=lights] .rpd') and pg.is_checked('.roepop .rpr[data-t=lights] .rpon input'))
        pg.select_option('.roepop .rpr[data-t=rec] select', '*'); pg.wait_for_timeout(100)
        pg.fill('.roepop .rpr[data-t=rec] .rpi', 'SPIRAL DOWN')
        pv = pg.inner_text('.roepop .rpv1') + ' || ' + pg.inner_text('.roepop .rpv2')
        check('the preview: the ROE box and the SOP box: %s' % pv.replace('\n', ' | '), pv == 'WPN FREE\nID: AWACS DECLARE+L16 || LTS: FLASH MOVING\nREC: SPIRAL DOWN')
        if shots: pg.screenshot(path=shots + '/roesop-menu.png')
        pg.fill('.roepop .rpnm', 'A-A'); pg.click('.roepop [data-a=save]'); pg.wait_for_timeout(150)
        check('Save as preset keeps it on this PC', pg.locator('.roepop .rpq').count() == 1 and 'A-A' in pg.evaluate("()=>localStorage.getItem('bmsroepre')"))
        pg.click('.roepop [data-a=clear]'); pg.click('.roepop .rpk[data-r=ws][data-v=hold]'); pg.select_option('.roepop .rpr[data-t=takeoff] select', 's20')
        pg.fill('.roepop .rpnm', 'Strike'); pg.click('.roepop [data-a=save]'); pg.wait_for_timeout(150)
        pg.click('.roepop [data-a=clear]')
        pg.click('.roepop .rpq[data-k=m0]'); pg.click('.roepop .rpq[data-k=m1]'); pg.wait_for_timeout(150)
        pv = pg.inner_text('.roepop .rpv1') + '\n' + pg.inner_text('.roepop .rpv2')
        check('two presets together: the last weapons status, the topics of both: %s' % pv.replace('\n', ' | '), 'WPN HOLD' in pv and 'WPN FREE' not in pv and 'LTS: FLASH MOVING' in pv and 'T/O: 20S' in pv and 'REC: SPIRAL DOWN' in pv)
        pg.click('.roepop [data-a=apply]'); pg.wait_for_timeout(400)
        F = pg.evaluate("()=>({roe:__app.F.roe,sop:__app.F.sop,sel:__app.F.roesel})")
        check('Apply writes the two boxes and keeps the choices with the flight %s' % F, F['roe'].startswith('WPN HOLD') and F['sop'].startswith('LTS: FLASH MOVING') and '"hold"' in (F['sel'] or '') and pg.locator('.roepop').count() == 0)
        pg.evaluate("()=>__app.openEd('roe')"); pg.wait_for_timeout(300)
        check('the menu opens again with the choices of the flight', pg.locator('.roepop .rpk[data-r=ws][data-v=hold].on').count() == 1 and pg.input_value('.roepop .rpr[data-t=rec] .rpi') == 'SPIRAL DOWN')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Esc closes it', pg.locator('.roepop').count() == 0)
        # the card: ROE on the left, SOP on the right, the notes below, the ephemerides on two lines at the bottom
        r = pg.evaluate("""async()=>{const cv=await import('/app/js/app/cardview.js'),dc=await import('/app/js/app/datacard.js');
          dc.F.free='Daegu TWR 365.000/126.200 ATIS 127.650\\n\\nUHF2 backup\\nDevil 3 229.200 · Panther 4 288.775';dc.F.eph='Sun 21/10: rise 21:43Z set 08:37Z\\nMoon: rise 06:07Z set 17:05Z (76%)';
          const T=[];const x=document.getElementById('cv').getContext('2d'),o=x.fillText;x.fillText=function(t,a,b,m){T.push([String(t),a,b]);return o.call(this,t,a,b,m)};cv.draw();x.fillText=o;
          const f=s=>T.find(q=>q[0].includes(s))||[0,null,null];return {roe:f('WPN HOLD'),sop:f('LTS: FLASH'),notes:f('Daegu'),sun:f('Sun 21/10'),moon:f('Moon: rise'),hdr:T.filter(q=>q[0]=='ROE'||q[0]=='SOP').length}}""")
        check('Datacard: ROE left and SOP right side by side, the notes below, the ephemerides on two lines %s' % r,
              r['roe'][1] < 1430 < r['sop'][1] and abs(r['roe'][2] - r['sop'][2]) < 2 and 921 < r['roe'][2] < 1024 < r['notes'][2] < 1147 < r['sun'][2] < r['moon'][2] < 1198 and r['hdr'] >= 2)
        if shots: pg.locator('#cv').screenshot(path=shots + '/roesop-card.png')
        m = pg.evaluate("()=>['roe','sop'].map(k=>{const d=__app.MFD.find(z=>z.k==k);return d?{y:Math.round(d.y0),h:Math.round(d.h)}:null})")
        check('MDC: the Overview box holds ROE on top and SOP below %s' % m, m[0] and m[1] and m[0]['y'] < m[1]['y'] and m[0]['h'] > 60 and m[1]['h'] > 60)
        # Squadron > ROE / SOP: the commander makes a preset, it is in his menu, and a flight of its kind of mission gets it by itself
        pg.evaluate("()=>{document.getElementById('sqnew').value='Red Devils';document.getElementById('sqcreate').click()}"); pg.wait_for_timeout(400)
        pg.evaluate("()=>{document.querySelector('[data-t=sq]').click()}"); pg.wait_for_timeout(300)
        pg.evaluate("()=>document.querySelector('#sqtabs [data-tab=roe]').click()"); pg.wait_for_timeout(300)
        check('Squadron has a ROE / SOP tab with New preset for the commander', pg.locator('#sqroenew').count() == 1)
        pg.evaluate("()=>document.getElementById('sqroenew').click()"); pg.wait_for_timeout(300)
        pg.fill('.roepop .rpnm', 'Wolfpack DCA'); pg.click('.roepop .rpk[data-r=ws][data-v=free]'); pg.click('.roepop .rpc2[data-cat="Defensive Counter Air"]')
        pg.click('.roepop [data-a=apply]'); pg.wait_for_timeout(300)
        sq = pg.evaluate("()=>__app.sq.roePresets()")
        check('the preset of the squadron is kept, with its kind of mission %s' % sq, len(sq) == 1 and sq[0]['name'] == 'Wolfpack DCA' and sq[0]['cats'] == ['Defensive Counter Air'] and 'WPN FREE' in pg.inner_text('#sqroe'))
        pg.evaluate("()=>__app.openEd('roe')"); pg.wait_for_timeout(300)
        check('the ROE / SOP menu lists it under Squadron', pg.locator('.roepop .rpq.sq').count() == 1 and 'Wolfpack DCA' in pg.inner_text('.roepop .rpq.sq'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        d = pg.evaluate("""async()=>{const rp=await import('/app/js/app/roepanel.js'),st=await import('/app/js/app/state.js'),dc=await import('/app/js/app/datacard.js');
          const keep=st.ST.C;st.ST.C={D:{S:Object.assign([],{[312]:'BARCAP',[313]:'STRIKE'})}};dc.F.roe='';dc.F.sop='';dc.F.roesel='';
          rp.roeAuto({omis:12});const a=dc.F.roe;dc.F.roe='';rp.roeAuto({omis:13});const b=dc.F.roe;st.ST.C=keep;return [a,b]}""")
        check('a BARCAP flight gets the default of Defensive Counter Air, a strike nothing %s' % d, d[0] == 'WPN FREE' and d[1] == '')
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
