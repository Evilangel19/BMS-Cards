"""ROE / SOP: the page Squadron > ROE / SOP (choices, own text, 5 lines a box with the warning, presets on this PC, several presets together, the
presets of the squadron made by the commander, the default of a kind of mission), the two boxes on the Datacard and on the MDC, a click on the box
of the card opens the page. No BMS files. Usage: python3 tools/roesop-test.py [shots dir]"""
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
B = '#sqroe '
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1600, 'height': 1000}); errs = []
        dialogs.install(pg); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{try{localStorage.removeItem('bmsroepre')}catch(e){}}")
        tabs = pg.locator('#sqtabs button').all_text_contents()
        check('Squadron: ROE / SOP is the tab between Members and Organization %s' % tabs, tabs[:3] == ['Members', 'ROE / SOP', 'Organization'])
        # a flight on the card (what Apply needs), without a campaign
        pg.evaluate("async()=>{const s=await import('/app/js/app/state.js');s.ST.AUTO={};s.ST.CL=[{f:{}}];s.ST.MANK=new Set();__app.F.cs='Gator 1'}")
        pg.evaluate("()=>__app.openEd('roe')"); pg.wait_for_timeout(500)
        check('a click on the ROE box of the card opens Squadron > ROE / SOP on the flight', pg.is_visible(B + '.rsq') and 'Gator 1' in pg.inner_text(B + '.rsq') and pg.locator('.roepop').count() == 0)
        pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.click(B + '.rpk[data-r=id][data-v=awacs]'); pg.click(B + '.rpk[data-r=id][data-v=l16]')
        pg.click(B + '.rpk[data-r=ws][data-v=free]')
        check('weapons status is one choice, ID criteria several', pg.locator(B + '.rpk[data-r=ws].on').count() == 1 and pg.locator(B + '.rpk[data-r=id].on').count() == 2)
        # the drop-down of a SOP topic: the list of the program
        pg.click(B + '.rpr[data-t=lights] select'); pg.wait_for_timeout(250)
        dd = pg.evaluate("()=>{const d=document.querySelector('.ddp');if(!d)return null;const r=d.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+12);return {n:d.children.length,top:!!e&&d.contains(e),bg:getComputedStyle(document.querySelector('#sqroe .rpr select')).backgroundColor}}")
        check('a SOP drop-down opens the list of the program, dark like the others %s' % dd, dd and dd['n'] == 6 and dd['top'] and dd['bg'] == 'rgb(11, 15, 20)')
        pg.click('.ddp .ddi:has-text("FLASH MOVING")'); pg.wait_for_timeout(250)
        check('a SOP topic just chosen shows its full text and goes on the card', 'as soon as the aircraft moves' in pg.inner_text(B + '.rpr[data-t=lights] .rpd') and pg.is_checked(B + '.rpr[data-t=lights] .rpon input'))
        pg.select_option(B + '.rpr[data-t=rec] select', '*'); pg.wait_for_timeout(150)
        pg.fill(B + '.rpr[data-t=rec] .rpi', 'SPIRAL DOWN'); pg.wait_for_timeout(100)
        pv = pg.inner_text(B + '.rpv1') + ' || ' + pg.inner_text(B + '.rpv2')
        check('the preview: the ROE box and the SOP box: %s' % pv.replace('\n', ' | '), pv == 'WPN FREE\nID: AWACS DECLARE+L16 || GND: FLASH MOVING\nREC: SPIRAL DOWN')
        # 5 lines a box, one line a phase: topics of the same phase share a line; the sixth phase cannot go on the card
        for t, v in (('takeoff', 's20'), ('dep', 'combat'), ('fuel', 'rtb'), ('form2', 'wedge'), ('nlights', 'overt')):
            pg.select_option(B + '.rpr[data-t=%s] select' % t, v); pg.wait_for_timeout(120)
        st = pg.evaluate("()=>({t:document.querySelector('#sqroe .rpv2').textContent,c:document.querySelector('#sqroe .rpr[data-t=nlights] .rpon input').checked,d:document.querySelector('#sqroe .rpr[data-t=nlights] .rpon input').disabled,p:document.querySelector('#sqroe .rpr[data-t=power] .rpon input').disabled,w:(document.querySelector('#sqroe .rswarn')||{}).textContent||''})")
        check('one line a phase: the SOP box is full at 5 phases, the sixth is not on the card and its tick is off, a topic of a phase already there can still go %s' % st,
              st['t'].split('\n')[1] == 'T/O: 20S · DEP COMBAT' and len(st['t'].split('\n')) == 5 and not st['c'] and st['d'] and 'SOP box full' in st['w'])
        pg.select_option(B + '.rpr[data-t=power] select', 'ab'); pg.wait_for_timeout(150)
        check('a topic of the T/O phase joins its line even with the box full', 'T/O: 20S · AB · DEP COMBAT' in pg.inner_text(B + '.rpv2'))
        if shots: pg.screenshot(path=shots + '/roesop-page.png', full_page=True)
        pg.fill(B + '.rssv .rpnm', 'A-A'); pg.click(B + '[data-a=save]'); pg.wait_for_timeout(200)
        check('Save as preset keeps it on this PC', pg.locator(B + '.rpq[data-k=m0]').count() == 1 and 'A-A' in pg.evaluate("()=>localStorage.getItem('bmsroepre')"))
        pg.click(B + '[data-a=clear]'); pg.click(B + '.rpk[data-r=ws][data-v=hold]'); pg.select_option(B + '.rpr[data-t=takeoff] select', 's10'); pg.wait_for_timeout(100)
        pg.fill(B + '.rssv .rpnm', 'Strike'); pg.click(B + '[data-a=save]'); pg.wait_for_timeout(200)
        pg.click(B + '[data-a=clear]')
        pg.click(B + '.rpq[data-k=m0]'); pg.wait_for_timeout(100); pg.click(B + '.rpq[data-k=m1]'); pg.wait_for_timeout(150)
        pv = pg.inner_text(B + '.rpv1') + '\n' + pg.inner_text(B + '.rpv2')
        check('two presets together: the last weapons status, the last take-off, the SOP box cut at 5: %s' % pv.replace('\n', ' | '), 'WPN HOLD' in pv and 'WPN FREE' not in pv and 'T/O: 10S' in pv and len(pg.inner_text(B + '.rpv2').split('\n')) <= 5)
        pg.click(B + '[data-a=apply]'); pg.wait_for_timeout(300)
        F = pg.evaluate("()=>({roe:__app.F.roe,sop:__app.F.sop,sel:__app.F.roesel})")
        check('Apply to card writes the two boxes and keeps the choices with the flight %s' % {k: F[k] for k in ('roe', 'sop')}, F['roe'].startswith('WPN HOLD') and F['sop'].startswith('GND: FLASH MOVING') and '"hold"' in (F['sel'] or ''))
        # the card: ROE on the left, SOP on the right, the notes below, the ephemerides on two lines at the bottom
        r = pg.evaluate("""async()=>{const cv=await import('/app/js/app/cardview.js'),dc=await import('/app/js/app/datacard.js');
          dc.F.free='Daegu TWR 365.000/126.200 ATIS 127.650';dc.F.eph='Sun 21/10: rise 21:43Z set 08:37Z\\nMoon: rise 06:07Z set 17:05Z (76%)';
          const T=[];const x=document.getElementById('cv').getContext('2d'),o=x.fillText;x.fillText=function(t,a,b,m){T.push([String(t),a,b]);return o.call(this,t,a,b,m)};cv.draw();x.fillText=o;
          const f=s=>T.find(q=>q[0].includes(s))||[0,null,null];return {roe:f('WPN HOLD'),sop:f('GND: FLASH'),notes:f('Daegu'),sun:f('Sun 21/10'),moon:f('Moon: rise')}}""")
        check('Datacard: ROE left and SOP right, the notes below, the ephemerides on two lines %s' % r,
              r['roe'][1] < 1430 < r['sop'][1] and abs(r['roe'][2] - r['sop'][2]) < 2 and 921 < r['roe'][2] < 1024 < r['notes'][2] < 1147 < r['sun'][2] < r['moon'][2] < 1198)
        m = pg.evaluate("()=>['roe','sop'].map(k=>{const d=__app.MFD.find(z=>z.k==k);return d?{y:Math.round(d.y0),h:Math.round(d.h)}:null})")
        check('MDC: the Overview box holds ROE on top and SOP below %s' % m, m[0] and m[1] and m[0]['y'] < m[1]['y'] and m[0]['h'] > 60 and m[1]['h'] > 60)
        # the commander: a preset of the squadron, with its kind of mission
        pg.evaluate("()=>{document.querySelector('#sqtabs [data-tab=me]').click();document.getElementById('sqnew').value='Red Devils';document.getElementById('sqcreate').click()}"); pg.wait_for_timeout(400)
        pg.evaluate("()=>document.querySelector('#sqtabs [data-tab=roe]').click()"); pg.wait_for_timeout(300)
        check('the commander can choose what he edits: the flight or a preset of the squadron', pg.locator(B + 'select.rsmode option[value=new]').count() == 1)
        pg.select_option(B + 'select.rsmode', 'new'); pg.wait_for_timeout(200)
        pg.fill(B + '.rsname', 'Wolfpack DCA'); pg.click(B + '.rpk[data-r=ws][data-v=free]'); pg.click(B + '.rpcat[data-cat="Defensive Counter Air"]')
        pg.click(B + '[data-a=psave]'); pg.wait_for_timeout(300)
        sq = pg.evaluate("()=>__app.sq.roePresets()")
        check('the preset of the squadron is kept, with its kind of mission %s' % [(x['name'], x['cats']) for x in sq], len(sq) == 1 and sq[0]['name'] == 'Wolfpack DCA' and sq[0]['cats'] == ['Defensive Counter Air'])
        pg.select_option(B + 'select.rsmode', 'flight'); pg.wait_for_timeout(200)
        check('back on the flight, the preset is in the Squadron group of the presets', pg.locator(B + '.rpq.sq').count() == 1 and 'Wolfpack DCA' in pg.inner_text(B + '.rpq.sq'))
        d = pg.evaluate("""async()=>{const rp=await import('/app/js/app/roepage.js'),st=await import('/app/js/app/state.js'),dc=await import('/app/js/app/datacard.js');
          const keep=st.ST.C;st.ST.C={D:{S:Object.assign([],{[312]:'BARCAP',[313]:'STRIKE'})}};dc.F.roe='';dc.F.sop='';dc.F.roesel='';
          rp.roeAuto({omis:12});const a=dc.F.roe;dc.F.roe='';rp.roeAuto({omis:13});const b=dc.F.roe;st.ST.C=keep;return [a,b]}""")
        check('a BARCAP flight gets the default of Defensive Counter Air, a strike nothing %s' % d, d[0] == 'WPN FREE' and d[1] == '')
        pg.click(B + '[data-a=back]'); pg.wait_for_timeout(300)
        check('Back to the card goes to the Datacard', pg.evaluate("()=>document.querySelector('[data-t=dc]').classList.contains('on')"))
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
