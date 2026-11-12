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
        tick = lambda t: pg.evaluate("t=>{const i=document.querySelector('#sqroe .rpr[data-t='+t+'] .rpon input');if(i&&!i.disabled&&!i.checked)i.click()}", t) or pg.wait_for_timeout(120)
        check('the titles of the ROE sections are green', pg.evaluate("()=>getComputedStyle(document.querySelector('#sqroe .rpt.rg')).color") == 'rgb(61, 220, 132)')
        pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.click(B + '.rpk[data-r=id][data-v=awacs]'); pg.click(B + '.rpk[data-r=id][data-v=l16]')
        pg.click(B + '.rpk[data-r=ws][data-v=free]')
        check('weapons status is one choice, ID criteria several', pg.locator(B + '.rpk[data-r=ws].on').count() == 1 and pg.locator(B + '.rpk[data-r=id].on').count() == 2)
        # the drop-down of a SOP topic: the list of the program
        pg.click(B + '.rpr[data-t=lights] select'); pg.wait_for_timeout(250)
        dd = pg.evaluate("()=>{const d=document.querySelector('.ddp');if(!d)return null;const r=d.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+12);return {n:d.children.length,top:!!e&&d.contains(e),bg:getComputedStyle(document.querySelector('#sqroe .rpr select')).backgroundColor}}")
        check('a SOP drop-down opens the list of the program, dark like the others %s' % dd, dd and dd['n'] == 6 and dd['top'] and dd['bg'] == 'rgb(11, 15, 20)')
        pg.click('.ddp .ddi:has-text("FLASH MOVING")'); pg.wait_for_timeout(250)
        check('a SOP topic just chosen shows its full text and is not on the card until ticked', 'as soon as the aircraft moves' in pg.inner_text(B + '.rpr[data-t=lights] .rpd') and not pg.is_checked(B + '.rpr[data-t=lights] .rpon input') and pg.inner_text(B + '.rpv2').strip() == '')
        tick('lights')
        pg.select_option(B + '.rpr[data-t=rec] select', '*'); pg.wait_for_timeout(150)
        pg.fill(B + '.rpr[data-t=rec] .rpi', 'SPIRAL DOWN'); pg.wait_for_timeout(100); tick('rec')
        pv = pg.inner_text(B + '.rpv1') + ' || ' + pg.inner_text(B + '.rpv2')
        check('the preview: the ROE box and the SOP box: %s' % pv.replace('\n', ' | '), pv == 'WPN FREE\nID: AWACS DECLARE+L16 || GND: FLASH MOVING\nREC: SPIRAL DOWN')
        check('choices not kept: the page says so', pg.locator(B + '.rsdirty').count() == 1)
        # leaving with unsaved choices asks first
        pg.click('[data-t=dc]'); pg.wait_for_timeout(300)
        check('leaving the page with unsaved choices asks to save them', pg.locator('.rsmodal').count() == 1 and 'Unsaved choices' in pg.inner_text('.rsmodal'))
        pg.click('.rsmodal [data-m=stay]'); pg.wait_for_timeout(200)
        check('Stay keeps the page', pg.is_visible(B + '.rsq') and pg.locator('.rsmodal').count() == 0)
        # the first Apply with no preset yet: save them as a preset?
        pg.click(B + '[data-a=apply]'); pg.wait_for_timeout(300)
        check('the first Apply proposes to save a preset', pg.locator('.rsmodal').count() == 1 and pg.input_value('.rsmodal .rsfirst') == 'My SOP')
        pg.click('.rsmodal [data-m=apply]'); pg.wait_for_timeout(300)
        check('Apply only writes the card, no preset made, nothing to save any more', pg.evaluate("()=>localStorage.getItem('bmsroepre')||'[]'") == '[]' and pg.evaluate("()=>__app.F.sop") == 'GND: FLASH MOVING\nREC: SPIRAL DOWN' and pg.locator(B + '.rsdirty').count() == 0)
        # the cards fold
        pg.click(B + '.rsk[data-k=roe] .rsh'); pg.wait_for_timeout(150)
        f1 = pg.evaluate("()=>[document.querySelector('#sqroe .rsk[data-k=roe]').classList.contains('shut'),getComputedStyle(document.querySelector('#sqroe .rsk[data-k=roe] .rsbd')).display]")
        pg.click(B + '.rsk[data-k=roe] .rsh'); pg.wait_for_timeout(150)
        lay = pg.evaluate('''()=>{const P=[...document.querySelectorAll('#sqroe .rspg .rsk')];P.forEach(c=>c.classList.add('shut'));
          const b=Math.max(...P.map(c=>c.getBoundingClientRect().bottom)),o=document.querySelector('#sqroe .rsk[data-k=other]').getBoundingClientRect().top;P.forEach(c=>c.classList.remove('shut'));return [Math.round(b),Math.round(o)]}''')
        check('with the phases folded, Other SOP lines stays right under them %s' % lay, 0 <= lay[1] - lay[0] <= 20)
        secs = pg.evaluate("()=>[...document.querySelectorAll('#sqroe .rss .rspg .rsk h3')].map(e=>e.textContent)")
        check('the SOP sections: Mission first, Training before Emergencies %s' % secs, secs[0] == 'Mission' and 'Training' in secs and 'Tanker' in secs and 'Weather' in secs)
        check('ROE Restrictions: no cluster bombs in urban areas', pg.locator(B + '.rpk[data-r=restr][data-v=cbu]').count() == 1)
        pg.click(B + '[data-only="1"]'); pg.wait_for_timeout(200)
        vis = pg.evaluate("()=>[...document.querySelectorAll('#sqroe .rpr')].map(r=>r.dataset.t)")
        check('Chosen only: only the topics chosen are shown %s' % vis, set(vis) == {'lights', 'rec'})
        pg.click(B + '[data-only="0"]'); pg.wait_for_timeout(200)
        pg.click(B + '[data-a=foldall]'); pg.wait_for_timeout(200)
        fa = pg.evaluate("()=>[...document.querySelectorAll('#sqroe .rspg .rsk')].every(c=>c.classList.contains('shut'))")
        pg.click(B + '[data-a=unfoldall]'); pg.wait_for_timeout(200)
        check('Fold all / Unfold all', fa and not pg.evaluate("()=>[...document.querySelectorAll('#sqroe .rspg .rsk')].some(c=>c.classList.contains('shut'))"))
        check('the custom sections block is above the standard ones, with its button', pg.evaluate("()=>{const c=document.querySelector('#sqroe .rscust'),p=document.querySelector('#sqroe .rss > .rspg');return !!c&&!!p&&c.getBoundingClientRect().top<p.getBoundingClientRect().top&&!!c.querySelector('[data-a=newsec]')}"))
        check('a click on the title folds a card and unfolds it %s' % f1, f1 == [True, 'none'] and not pg.evaluate("()=>document.querySelector('#sqroe .rsk[data-k=roe]').classList.contains('shut')"))
        # 5 lines a box, one line a phase: topics of the same phase share a line; the sixth phase cannot go on the card
        for t, v in (('takeoff', 's20'), ('dep', 'combat'), ('fuel', 'rtb'), ('form2', 'wedge'), ('nlights', 'overt')):
            pg.select_option(B + '.rpr[data-t=%s] select' % t, v); pg.wait_for_timeout(120); tick(t)
        st = pg.evaluate("()=>({t:document.querySelector('#sqroe .rpv2').textContent,c:document.querySelector('#sqroe .rpr[data-t=nlights] .rpon input').checked,d:document.querySelector('#sqroe .rpr[data-t=nlights] .rpon input').disabled,p:document.querySelector('#sqroe .rpr[data-t=power] .rpon input').disabled,w:(document.querySelector('#sqroe .rswarn')||{}).textContent||''})")
        check('one line a phase: the SOP box is full at 5 phases, the sixth is not on the card and its tick is off, a topic of a phase already there can still go %s' % st,
              st['t'].split('\n')[1] == 'T/O: 20S · DEP COMBAT' and len(st['t'].split('\n')) == 5 and not st['c'] and st['d'] and 'SOP box full' in st['w'])
        pg.select_option(B + '.rpr[data-t=power] select', 'ab'); pg.wait_for_timeout(150); tick('power')
        check('a topic of the T/O phase joins its line even with the box full', 'T/O: 20S · AB · DEP COMBAT' in pg.inner_text(B + '.rpv2'))
        if shots: pg.screenshot(path=shots + '/roesop-page.png', full_page=True)
        pg.fill(B + '.rssv .rpnm', 'A-A'); pg.click(B + '[data-a=save]'); pg.wait_for_timeout(200)
        check('Save as preset keeps it on this PC', pg.locator(B + '.rpq[data-k=m0]').count() == 1 and 'A-A' in pg.evaluate("()=>localStorage.getItem('bmsroepre')"))
        pg.click(B + '[data-a=clear]'); pg.click(B + '.rpk[data-r=ws][data-v=hold]'); pg.select_option(B + '.rpr[data-t=takeoff] select', 's10'); pg.wait_for_timeout(100); tick('takeoff')
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
        check('a BARCAP flight gets the default of Defensive Counter Air, a strike nothing %s' % d, d[0].startswith('WPN FREE') and d[1] == '')
        # a custom section of my own: its topic in the page and on the card
        pg.click(B + '[data-a=clear]'); pg.click(B + '[data-a=newsec]'); pg.wait_for_timeout(250)
        sb = pg.evaluate("()=>{const s=document.querySelector('.rsmodal select');return s?getComputedStyle(s).backgroundColor:'none'}")
        check('the drop-downs of the custom section window are dark like the program (%s)' % sb, sb in ('rgb(11, 15, 20)', 'none'))
        pg.fill('.rsmodal .rssn', 'Range'); pg.fill('.rsmodal .rsst', 'RNG'); pg.fill('.rsmodal .rstl', 'Strobe'); pg.fill('.rsmodal .rsto', 'FLASH TAXI = Strobe flash while taxiing\nOFF = Strobe off on the range')
        pg.click('.rsmodal [data-m=ok]'); pg.wait_for_timeout(300)
        cid = pg.evaluate("()=>{const c=[...document.querySelectorAll('#sqroe .rsk')].find(e=>e.querySelector('h3').textContent=='Range');return c?c.querySelector('.rpr').dataset.t:null}")
        check('the custom section is in the page with its topic', bool(cid))
        if cid:
            pg.select_option(B + '.rpr[data-t=%s] select' % cid, 'o0'); pg.wait_for_timeout(150); tick(cid)
            check('its topic goes on the card under its tag: %s' % pg.inner_text(B + '.rpv2'), pg.inner_text(B + '.rpv2').strip() == 'RNG: FLASH TAXI')
        # Add card: the whole text on a Kneeboard card
        pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.select_option(B + '.rpr[data-t=dep] select', 'combat'); pg.wait_for_timeout(150)
        n0 = pg.evaluate("async()=>(await import('/app/js/app/kneeboard.js')).KBLIB.length")
        pg.click(B + '[data-a=kb]'); pg.wait_for_timeout(800)
        kb = pg.evaluate("async()=>{const k=await import('/app/js/app/kneeboard.js');return k.KBLIB.slice(-1).map(i=>i.name)}")
        n1 = pg.evaluate("async()=>(await import('/app/js/app/kneeboard.js')).KBLIB.length")
        check('Add card puts one ROE / SOP card on the Kneeboard %s' % kb, n1 == n0 + 1 and kb and kb[0].startswith('ROE / SOP'))
        plan = pg.evaluate("""async()=>{const rc=await import('/app/js/app/roecard.js'),rs=await import('/app/js/core/roesop.js');const x=document.createElement('canvas').getContext('2d');
          const s={roe:{ws:'tight',id:['awacs','l16','two'],commit:'n40',abort:['bingo','winch','spike'],extra:['mez','pid','lines','fox']},sop:{}};
          rs.topicsAll().forEach(t=>s.sop[t[0]]={o:t[3][0][0],c:false});return rc.roeCardPlan(s,x).map(c=>c.title)}""")
        check('every topic chosen: two cards or more, ROE apart from SOP %s' % plan, len(plan) >= 2 and plan[0] == 'ROE' and plan[1].startswith('SOP'))
        if shots:
            pg.evaluate("""async()=>{const rc=await import('/app/js/app/roecard.js'),rs=await import('/app/js/core/roesop.js');const c=document.createElement('canvas');c.width=1600;c.height=2400;const x=c.getContext('2d');
              const s={roe:{ws:'tight',id:['awacs','l16'],commit:'n40',abort:['bingo','winch'],extra:['mez']},sop:{lights:{o:'move'},takeoff:{o:'s20'},power:{o:'ab'},dep:{o:'combat'},rec:{o:'tac'},brk:{o:'3'},fuel:{o:'rtb'},nlights:{o:'overt'},lost:{o:'std'},rv:{o:'anchor'},obs:{o:'left'}}};
              const p=rc.roeCardPlan(s,x);rc.roeCardDraw(p[0],x,'Flight Gator 1');c.id='rcshot';c.style.cssText='position:fixed;left:0;top:0;width:800px;z-index:99999';document.body.appendChild(c)}""")
            pg.set_viewport_size({'width': 820, 'height': 1220}); pg.locator('#rcshot').screenshot(path=shots + '/roesop-kbcard.png'); pg.evaluate("()=>document.getElementById('rcshot').remove()"); pg.set_viewport_size({'width': 1600, 'height': 1000})
        pg.click(B + '[data-a=back]'); pg.wait_for_timeout(300)
        if pg.locator('.rsmodal').count(): pg.click('.rsmodal [data-m=go]'); pg.wait_for_timeout(300)
        check('Back to the card goes to the Datacard', pg.evaluate("()=>document.querySelector('[data-t=dc]').classList.contains('on')"))
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
