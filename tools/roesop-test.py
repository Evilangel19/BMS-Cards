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
        d0 = pg.evaluate("()=>{const P=[...document.querySelectorAll('#sqroe .rss > .rspg .rsk')],G=[...document.querySelectorAll('#sqroe .rss > .rspg > .rsg')];return {shut:P.length&&P.every(c=>c.classList.contains('shut')),left:[...G[0].querySelectorAll('h3')].map(e=>e.textContent),right:[...G[1].querySelectorAll('h3')].map(e=>e.textContent)}}")
        check('the first time every SOP section is folded; the columns in the order of the flight, Emergencies at the bottom right %s' % d0, d0['shut'] and d0['left'][0] == 'Mission' and d0['right'][0] == 'Recovery' and d0['right'][-1] == 'Emergencies')
        pg.click(B + '[data-a=unfoldall]'); pg.wait_for_timeout(200)
        check('no squadron: no Flight / Squadron buttons, the Standard is the first preset', pg.locator(B + '.rssrc').count() == 0 and pg.get_attribute(B + '.rpqs .rpq', 'data-k') == 'std')
        pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.click(B + '.rpk[data-r=id][data-v=awacs]'); pg.click(B + '.rpk[data-r=id][data-v=l16]')
        pg.click(B + '.rpk[data-r=ws][data-v=free]')
        check('weapons status is one choice, ID criteria several', pg.locator(B + '.rpk[data-r=ws].on').count() == 1 and pg.locator(B + '.rpk[data-r=id].on').count() == 2)
        # the drop-down of a SOP topic: the list of the program
        pg.click(B + '.rpr[data-t=lights] select'); pg.wait_for_timeout(250)
        dd = pg.evaluate("()=>{const d=document.querySelector('.ddp');if(!d)return null;const r=d.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+12);return {n:d.children.length,top:!!e&&d.contains(e),bg:getComputedStyle(document.querySelector('#sqroe .rpr select')).backgroundColor}}")
        check('a SOP drop-down opens the list of the program, dark like the others %s' % dd, dd and dd['n'] == 6 and dd['top'] and dd['bg'] == 'rgb(11, 15, 20)')
        pg.click('.ddp .ddi:has-text("FLASH MOVING")'); pg.wait_for_timeout(250)
        check('a SOP topic just chosen shows its full text and is not in the SOP box until ticked', 'as soon as the aircraft moves' in pg.inner_text(B + '.rpr[data-t=lights] .rpd') and not pg.is_checked(B + '.rpr[data-t=lights] .rpon input') and pg.inner_text(B + '.rpv2').strip() == '')
        tick('lights')
        pg.select_option(B + '.rpr[data-t=rec] select', '*'); pg.wait_for_timeout(150)
        pg.fill(B + '.rpr[data-t=rec] .rpi', 'SPIRAL DOWN'); pg.wait_for_timeout(100); tick('rec')
        pv = pg.inner_text(B + '.rpv1') + ' || ' + pg.inner_text(B + '.rpv2')
        check('the preview: the ROE box and the SOP box: %s' % pv.replace('\n', ' | '), pv == 'WPN FREE\nID: AWACS DECLARE+L16 || GND: FLASH MOVING\nREC: SPIRAL DOWN')
        F = pg.evaluate("()=>[__app.F.roe,__app.F.sop]")
        check('every change goes on the datacard at once (no Apply) %s' % F, F == ['WPN FREE\nID: AWACS DECLARE+L16', 'GND: FLASH MOVING\nREC: SPIRAL DOWN'] and pg.locator(B + '[data-a=apply]').count() == 0)
        check('changed by hand: the part to keep it as a preset shows', pg.locator(B + '.rsedit .rsdirty').count() == 1 and pg.locator(B + '.rsedit [data-a=pnew]').count() == 1)
        # leaving with changes in no preset asks first
        pg.click('[data-t=dc]'); pg.wait_for_timeout(300)
        check('leaving the page with changes in no preset asks first', pg.locator('.rsmodal').count() == 1 and 'Changes not in a preset' in pg.inner_text('.rsmodal'))
        pg.click('.rsmodal [data-m=stay]'); pg.wait_for_timeout(200)
        check('Stay keeps the page', pg.is_visible(B + '.rsq') and pg.locator('.rsmodal').count() == 0)
        # Save as new: a name and the kinds of mission it is the default of
        pg.fill(B + '.rsname', 'My SOP'); pg.click(B + '.rpcat[data-cat="Airstrike"]'); pg.click(B + '[data-a=pnew]'); pg.wait_for_timeout(250)
        P = pg.evaluate("()=>JSON.parse(localStorage.getItem('bmsroepre')||'[]').map(p=>[p.name,p.cats])")
        check('Save as new keeps the preset on this PC with its Default for, chosen, nothing left to save %s' % P, P == [['My SOP', ['Airstrike']]] and pg.locator(B + '.rpq.on[data-k=m0]').count() == 1 and pg.locator(B + '.rsedit').count() == 0)
        pg.click(B + '[data-a=clear]'); pg.click(B + '.rpk[data-r=ws][data-v=hold]'); pg.select_option(B + '.rpr[data-t=takeoff] select', 's10'); pg.wait_for_timeout(100); tick('takeoff')
        pg.fill(B + '.rsname', 'Strike'); pg.click(B + '[data-a=pnew]'); pg.wait_for_timeout(250)
        pg.click(B + '.rpq[data-k=m0]'); pg.wait_for_timeout(250)
        check('a click on a preset puts it on the datacard', pg.evaluate("()=>__app.F.roe").startswith('WPN FREE') and pg.locator(B + '.rpq.on[data-k=m0]').count() == 1)
        pg.click(B + '.rpq[data-k=m1]'); pg.wait_for_timeout(250)
        pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.wait_for_timeout(150)
        check('a change by hand: the preset chosen gets the orange dot', pg.locator(B + '.rpq[data-k=m1] .rpdot').count() == 1)
        pg.click(B + '.rpq[data-k=m0]'); pg.wait_for_timeout(250)
        check('another preset with changes not saved: asks Save first / Discard / Cancel', pg.locator('.rsmodal').count() == 1 and pg.locator('.rsmodal [data-m=disc]').count() == 1)
        pg.click('.rsmodal [data-m=disc]'); pg.wait_for_timeout(250)
        check('Discard: the other preset goes on the datacard', pg.evaluate("()=>__app.F.roe").startswith('WPN FREE'))
        pg.once('dialog', lambda d: d.accept())
        pg.click(B + '.rpq[data-k=m1] [data-del]'); pg.wait_for_timeout(500)
        g1 = pg.evaluate("()=>JSON.parse(localStorage.getItem('bmsroepre')||'[]').length")
        pg.click('#apptoast .toastact'); pg.wait_for_timeout(250)
        g2 = pg.evaluate("()=>JSON.parse(localStorage.getItem('bmsroepre')||'[]').map(p=>p.name)")
        check('× deletes a preset, Undo brings it back %s %s' % (g1, g2), g1 == 1 and g2 == ['My SOP', 'Strike'])
        # my Standard (no squadron)
        pg.click(B + '.rpq[data-k=std]'); pg.wait_for_timeout(200); pg.click(B + '.rpk[data-r=commit][data-v=n30]'); pg.wait_for_timeout(150)
        pg.click(B + '[data-a=psave]'); pg.wait_for_timeout(200)
        check('the Standard (no squadron) is mine, saved on this PC', '"n30"' in (pg.evaluate("()=>localStorage.getItem('bmsroestd')") or ''))
        pg.click(B + '.rpq[data-k=m1]'); pg.wait_for_timeout(250)
        # the datacard: ROE on the left, SOP on the right, the notes below, the ephemerides on two lines at the bottom
        r = pg.evaluate("""async()=>{const cv=await import('/app/js/app/cardview.js'),dc=await import('/app/js/app/datacard.js');
          dc.F.free='Daegu TWR 365.000/126.200 ATIS 127.650';dc.F.eph='Sun 21/10: rise 21:43Z set 08:37Z\\nMoon: rise 06:07Z set 17:05Z (76%)';
          const T=[];const x=document.getElementById('cv').getContext('2d'),o=x.fillText;x.fillText=function(t,a,b,m){T.push([String(t),a,b]);return o.call(this,t,a,b,m)};cv.draw();x.fillText=o;
          const f=s=>T.find(q=>q[0].includes(s))||[0,null,null];return {roe:f('WPN HOLD'),sop:f('T/O: 10S'),notes:f('Daegu'),sun:f('Sun 21/10'),moon:f('Moon: rise')}}""")
        check('Datacard: ROE left and SOP right, the notes below, the ephemerides on two lines %s' % r,
              r['roe'][1] < 1430 < r['sop'][1] and abs(r['roe'][2] - r['sop'][2]) < 2 and 921 < r['roe'][2] < 1024 < r['notes'][2] < 1147 < r['sun'][2] < r['moon'][2] < 1198)
        m = pg.evaluate("()=>['roe','sop'].map(k=>{const d=__app.MFD.find(z=>z.k==k);return d?{y:Math.round(d.y0),h:Math.round(d.h)}:null})")
        check('MDC: the Overview box holds ROE on top and SOP below %s' % m, m[0] and m[1] and m[0]['y'] < m[1]['y'] and m[0]['h'] > 60 and m[1]['h'] > 60)
        # the commander: Flight / Squadron, the Standard and a preset of the squadron with its kind of mission
        pg.evaluate("()=>{document.querySelector('#sqtabs [data-tab=me]').click();document.getElementById('sqnew').value='Red Devils';document.getElementById('sqcreate').click()}"); pg.wait_for_timeout(400)
        pg.evaluate("()=>document.querySelector('#sqtabs [data-tab=roe]').click()"); pg.wait_for_timeout(300)
        check('in a squadron: the Flight / Squadron buttons, Squadron chosen', pg.locator(B + '.rssrc button').count() == 2 and pg.locator(B + '.rssrc [data-src=sq].on').count() == 1)
        pg.click(B + '.rpq[data-k=std]'); pg.wait_for_timeout(200); pg.click(B + '.rpk[data-r=ws][data-v=tight]'); pg.wait_for_timeout(150)
        pg.click(B + '[data-a=psave]'); pg.wait_for_timeout(300)
        pg.click(B + '.rpk[data-r=ws][data-v=free]'); pg.fill(B + '.rsname', 'Wolfpack DCA'); pg.click(B + '.rpcat[data-cat="Defensive Counter Air"]')
        pg.click(B + '[data-a=pnew]'); pg.wait_for_timeout(300)
        sq = pg.evaluate("()=>__app.sq.roePresets()")
        check('the Standard of the squadron and a preset with its kind of mission are sent %s' % [(x['name'], x['cats'], x['std']) for x in sq], len(sq) == 2 and sq[0]['std'] and sq[1]['name'] == 'Wolfpack DCA' and sq[1]['cats'] == ['Defensive Counter Air'] and not sq[1]['std'])
        pg.click(B + '.rssrc [data-src=me]'); pg.wait_for_timeout(200)
        check('Flight: my presets, the Standard of the squadron locked', pg.locator(B + '.rpq[data-k=m0]').count() == 1 and pg.locator(B + '.rpq[data-k=std] .rplk').count() == 1)
        d = pg.evaluate("""async()=>{const rp=await import('/app/js/app/roepage.js'),st=await import('/app/js/app/state.js'),dc=await import('/app/js/app/datacard.js');
          const keep=st.ST.C,o=[];st.ST.C={D:{S:Object.assign([],{[312]:'BARCAP',[313]:'STRIKE',[314]:'RECON'})}};
          for(const src of ['sq','me'])for(const m of [12,13,14]){localStorage.setItem('bmsroesrc',JSON.stringify(src));dc.F.roe='';rp.roeAuto({omis:m});o.push(dc.F.roe.split('\\n')[0])}
          st.ST.C=keep;return o}""")
        check('defaults: Squadron chosen, BARCAP gets the squadron DCA preset, others the Standard; Flight chosen, a strike gets mine (Airstrike), others the Standard %s' % d,
              d[0] == 'WPN FREE' and d[1] == 'WPN TIGHT' and d[2] == 'WPN TIGHT' and d[3] == 'WPN TIGHT' and d[4] == 'WPN FREE' and d[5] == 'WPN TIGHT')
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
        check('every topic chosen: two cards, ROE and SOP together %s' % plan, plan == ['ROE / SOP', 'ROE / SOP (2)'])
        if shots:
            pg.evaluate("""async()=>{const rc=await import('/app/js/app/roecard.js'),rs=await import('/app/js/core/roesop.js');const c=document.createElement('canvas');c.width=1600;c.height=2400;const x=c.getContext('2d');
              const s={roe:{ws:'tight',id:['awacs','l16'],commit:'n40',abort:['bingo','winch'],extra:['mez']},sop:{lights:{o:'move'},takeoff:{o:'s20'},power:{o:'ab'},dep:{o:'combat'},rec:{o:'tac'},brk:{o:'3'},fuel:{o:'rtb'},nlights:{o:'overt'},lost:{o:'std'},rv:{o:'anchor'},obs:{o:'left'}}};
              const p=rc.roeCardPlan(s,x);rc.roeCardDraw(p[0],x,'Flight Gator 1');c.id='rcshot';c.style.cssText='position:fixed;left:0;top:0;width:800px;z-index:99999';document.body.appendChild(c)}""")
            pg.set_viewport_size({'width': 820, 'height': 1220}); pg.locator('#rcshot').screenshot(path=shots + '/roesop-kbcard.png'); pg.evaluate("()=>document.getElementById('rcshot').remove()"); pg.set_viewport_size({'width': 1600, 'height': 1000})
        pg.click(B + '[data-a=back]'); pg.wait_for_timeout(300)
        if pg.locator('.rsmodal').count(): pg.click('.rsmodal [data-m=go]'); pg.wait_for_timeout(300)
        check('Back to the card goes to the Datacard', pg.evaluate("()=>document.querySelector('[data-t=dc]').classList.contains('on')"))
        # the Kneeboard card: everything chosen still goes on two cards at most, ROE and SOP in one flow
        kc = pg.evaluate('''async()=>{const R=await import('/app/js/core/roesop.js'),C=await import('/app/js/app/roecard.js');const s=R.emptySel();
          R.ROE.forEach(([id,,k,,o])=>{s.roe[id]=k=='many'?o.map(p=>p[0]):o[0][0]});R.SOP_TOPICS.forEach(t=>s.sop[t[0]]={o:t[3][t[3].length-1][0]});
          const c=document.createElement('canvas');c.width=C.CARD_W;c.height=C.CARD_H;const P=C.roeCardPlan(s,c.getContext('2d'));return [P.length,P.map(p=>p.title),P[1]?P[1].parts[0][0]:'']}''')
        check('every ROE and SOP chosen: two Kneeboard cards at most, the SOP go on from the first %s' % kc, kc[0] == 2 and kc[1] == ['ROE / SOP', 'ROE / SOP (2)'] and kc[2] == 'SOP (cont.)')
        # the ROE box of the Datacard: a long rule wraps after a "+" and the box keeps the big text
        fl = pg.evaluate('''async()=>{const V=await import('/app/js/app/cardview.js');const x=document.createElement('canvas').getContext('2d');
          const L=V.freeLayout(x,'WPN TIGHT\\nID: AWACS DECLARE+VID+NCTR+2 SRC\\nBUGOUT: WINCH/MUD SPIKE/NO SA\\nNO CBU URBAN',150,97);return [L.fs,L.rows.map(r=>r.t)]}''')
        check('the ROE box: wraps after "+" or "/", the text as big as the box allows %s' % fl, fl[0] >= 13 and any(r.endswith('+') or r.endswith('/') for r in fl[1]))
        # the Kneeboard: a datacard with no flight chosen, filled by the program alone, is not "not saved"
        ku = pg.evaluate('''async()=>{const K=await import('/app/js/app/kneeboard.js'),S=await import('/app/js/app/state.js'),D=await import('/app/js/app/datacard.js');
          const k=S.ST.CURK;S.ST.CURK=null;S.ST.DCHAND=false;const was=D.F.eph;D.F.eph='SR 0612 SS 1745';const r=K.dcIdle();S.ST.DCHAND=true;const r2=K.dcIdle();S.ST.DCHAND=false;D.F.eph=was;S.ST.CURK=k;return [r,r2]}''')
        check('Kneeboard: a datacard with no flight and only cells the program filled does not count for "not saved"; typed by hand it counts %s' % ku, ku == [True, False])
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
