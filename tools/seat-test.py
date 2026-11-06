"""The pilot seat: the round buttons at the left of the pilots of the Flight section of the datacard (and of the Pilots table of the MDC format), the name in the Name cell,
the laser code of the DTC and the B. CODE from the CONF-LSR of the seat, the IFF and the Link 16 of the MDC for each seat, the seat when another flight or another mission
is opened, the buttons of the other flights of the package, the standard menu of the Name cell, the animations. Usage: python3 tools/seat-test.py [screenshot_dir]"""
import subprocess, sys, time, os, base64, json
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools')
import dialogs
FX = R + '/tests/fixtures/beartrap/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = '8841'; URL = 'http://localhost:%s/app/index.html' % PORT
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', PORT, '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# the squadron: me (uid a, Chris, callsign Evil19: "Maj. Chris" on the roster) and Anna (callsign Zed: "Capt. Anna")
SQ = """([uid,cs])=>{const d=__app.sq.db();d.uid=uid;d.cs=cs;d.squads.push({id:'t1',name:'Test',roster:{a:{uid:'a',name:'Chris',callsign:'Evil19',stats:{rk:3}},b:{uid:'b',name:'Anna',callsign:'Zed',stats:{rk:2}}},owner:'a',leader:'a'});d.cur='t1'}"""
LOAD = "async(a)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app[a[0]](f(a[1],a[2]))}"
# where a button sits and what the canvas has under it: the text of the cell must start after the button (dark pixels in the zone of the button, and some just after it)
SCAN = """async([k,btn])=>{const m=await import('./js/core/seatgeo.js'),mdc=!!__app.ST.MDCON,c=__app.cellRect(k),cv=document.getElementById('cv'),r=cv.getBoundingClientRect(),kk=r.width/2048,
  x0=Math.round((c.x-r.left)/kk),yc=Math.round((c.y-r.top+c.h/2)/kk),h=c.h/kk,ind=Math.round(mdc?m.seatIndent(h):m.seatIndent(m.DC_ROW*2048/1200)),
  id=cv.getContext('2d').getImageData(0,0,2048,2048).data,dark=(a,b)=>{let n=0;for(let y=yc-9;y<=yc+9;y++)for(let x=a;x<b;x++){const i=(y*2048+x)*4;if(id[i]+id[i+1]+id[i+2]<300)n++}return n},
  b=document.querySelector('#seatov [data-seat='+btn+']').getBoundingClientRect();
  return {ind,before:dark(x0+7,x0+ind-4),after:dark(x0+ind-2,x0+ind+110),left:(b.left-c.x)/kk,right:(b.right-c.x)/kk,mid:(b.top+b.height/2-(c.y+c.h/2))/kk,size:b.width/kk,cw:c.w/kk}}"""
# the IFF and Link 16 lines of the DTC, and whether any line of it is changed
DTCL = """()=>({v:Object.fromEntries(__app.lines.filter(l=>l.s=='IFF'||l.s=='LINK16').map(l=>[l.k,l.v])),dirty:__app.lines.filter(l=>l.dirty).map(l=>l.s+'|'+l.k)})"""
# the Link 16 lines of file A that the seat writes: callsign letters, number, flight lead flag, the four STNs of the flight
L16A = lambda d: [d['v']['FILE_A_CALLSIGN'], d['v']['FILE_A_CALLSIGN_NUMBER'], d['v']['FILE_A_FLIGHT_LEAD']] + [d['v']['FILE_A_FLIGHT_%d_STN' % i] for i in range(1, 5)]
STATE = """()=>({seat:{...__app.ST.SEAT}, names:[0,1,2,3].map(i=>__app.F['fl'+i+'_0']), man:[...__app.MANK], lsr:[0,1,2,3].map(i=>__app.F['fl'+i+'_5']),
 tgp:(__app.lines.find(l=>l.s=='Laser'&&l.k=='LaserTGP')||{}).v, bc:[__app.F.wp1_bc,__app.F.wp2_bc], mdc:[__app.F.m2,__app.F.m3,__app.F.dl0_fl],
 info:document.getElementById('seatinfo').textContent,
 btns:[...document.querySelectorAll('#seatov .seatb')].map(b=>b.dataset.seat+(b.disabled?':off':'')+(b.classList.contains('on')?':on':'')+(b.classList.contains('ask')?':ask':''))})"""
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        def page(uid='a', cs='Evil19', iff=False, motion='reduce', w=1500, h=1000):
            pg = br.new_page(viewport={'width': w, 'height': h}, reduced_motion=motion)
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.add_init_script("try{localStorage.setItem('bmsform','1')}catch(e){}")
            msgs = []; ans = [True]
            def on_dialog(d):
                msgs.append(d.message); d.accept() if ans[0] else d.dismiss()
            pg.on('dialog', on_dialog)
            pg.goto(URL); pg.wait_for_timeout(800)
            pg.evaluate(SQ, [uid, cs])
            pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
            pg.evaluate(LOAD, ['loadCam', b64('PSI_BEAR_TRAP_26.cam'), 'x.cam']); pg.wait_for_timeout(1200)
            if iff:
                pg.evaluate(LOAD, ['loadL16', b64('PSI_BEAR_TRAP_26.l16.txtpb'), 'x.txtpb']); pg.wait_for_timeout(400)
                pg.evaluate(LOAD, ['loadIFF', b64('PSI_BEAR_TRAP_26.iff'), 'x.iff']); pg.wait_for_timeout(400)
            return pg, msgs, ans
        def flight(pg, rx):
            i = pg.evaluate("rx=>__app.CL.findIndex(x=>new RegExp(rx).test(x.label))", rx)
            pg.evaluate("i=>{document.getElementById('fsel').value=i;__app.apply(i)}", i); pg.wait_for_timeout(900)
            return i
        pg, msgs, ans = page()
        S = lambda: pg.evaluate(STATE)
        btn = lambda b: pg.locator('#seatov [data-seat=%s]' % b)

        # ---- 1. the start: the leader is the seat, nothing is written on the card
        s = S()
        n0 = s['names'][:2]  # the names of the pilots are made up when the campaign is opened: they are not always the same
        check('the first flight is a 2-ship: names %s' % n0, all(n0) and s['names'][2:] == ['', ''])
        check('default seat: the leader (set by nobody), buttons: 2 seats of the flight, the others off, and the flight itself in the package', s['seat']['n'] == 0 and not s['seat']['set'] and s['btns'][:4] == ['s0:on', 's1', 's2:off', 's3:off'])
        check('a seat that has no aircraft cannot be taken, and says why', btn('s2').is_disabled() and 'No aircraft' in btn('s2').get_attribute('title'))
        check('the default writes nothing on the card (no manual change)', s['man'] == [])
        check('the line under the card says which seat the DTC and the MDC are made for', s['info'].startswith('Seat 1 Lead (default)'))
        check('the row of the seat is lit', pg.locator('#seatov .seatrow.on').count() >= 1 and btn('s0').get_attribute('aria-pressed') == 'true' and btn('s1').get_attribute('aria-pressed') == 'false')
        check('the buttons are over the card, not drawn in it: they are HTML', pg.evaluate("()=>document.getElementById('seatov').parentElement.querySelector('#cv')!==null&&document.getElementById('seatov').children.length>=4"))
        def big(fn):  # the geometry is checked on a card of a normal size: the form beside it is closed for a moment
            pg.evaluate("()=>__app.toggleForm()"); pg.wait_for_timeout(700)
            try: return fn()
            finally: pg.evaluate("()=>__app.toggleForm()"); pg.wait_for_timeout(700)
        g = big(lambda: pg.evaluate(SCAN, ['fl0_0', 's0']))
        check('the button is at the LEFT end of the Name cell, centred in its height, with a size in step with the card (%s)' % {k: round(v) for k, v in g.items()}, 0 <= g['left'] <= 12 and g['right'] < g['ind'] and abs(g['mid']) < 2 and 26 <= g['size'] <= 33)
        check('the text of the Name cell starts after the button: nothing under it, the name just after it', g['before'] == 0 and g['after'] > 20)
        g = big(lambda: pg.evaluate(SCAN, ['pk0_0', 'p0']))
        check('the same for the flight of the Package table: button at the left, callsign after it (%s)' % {k: round(v) for k, v in g.items()}, 0 <= g['left'] <= 12 and g['right'] < g['ind'] and abs(g['mid']) < 2 and g['before'] == 0 and g['after'] > 20)
        # the flight of the card is a random one of the campaign: the pressed button of the package is not always the first
        cols = pg.evaluate("()=>[...document.querySelectorAll('#seatov .seatb')].map(b=>[b.dataset.seat,b.classList.contains('on'),getComputedStyle(b).backgroundColor])")
        on = [c for c in cols if c[1]]
        check('the chosen seat and the chosen flight are filled (solid blue), the others are white (%s)' % ', '.join('%s %s' % (c[0], c[2]) for c in cols), sorted(c[0][0] for c in on) == ['p', 's'] and all(c[2] == 'rgb(31, 111, 235)' for c in on) and all(c[2] == 'rgb(255, 255, 255)' for c in cols if not c[1]))
        if shots: pg.screenshot(path=shots + '/seat-datacard.png', clip=pg.evaluate("()=>{const b=document.getElementById('cv').getBoundingClientRect();return {x:b.x,y:b.y+b.height*0.38,width:b.width,height:b.height*0.34}}"))

        pg.set_viewport_size({'width': 1100, 'height': 900}); pg.wait_for_timeout(700)
        r = pg.evaluate("()=>{const c=__app.cellRect('fl1_0'),b=document.querySelector('#seatov [data-seat=s1]').getBoundingClientRect();return [c.y,c.y+c.h,b.top+b.height/2,c.x,c.x+c.w,b.left+b.width/2]}")
        check('the window is made smaller: the buttons follow the cells (%s)' % [round(x) for x in r], r[0] <= r[2] <= r[1] and r[3] <= r[5] <= r[4])
        pg.set_viewport_size({'width': 1500, 'height': 1000}); pg.wait_for_timeout(700)

        # ---- 2. a button: my name (the Logbook name with the rank) goes in the Name cell, the same button gives the seat up, it is on one seat only
        btn('s1').click(); pg.wait_for_timeout(400); s = S()
        check('seat 2: my name is in its Name cell (a manual change), the leader keeps his name (%s)' % s['names'][:2], s['names'][:2] == [n0[0], 'Maj. Chris'] and s['man'] == ['fl1_0'] and s['seat']['n'] == 1 and s['seat']['set'])
        check('the button is pressed, the line under the card names the seat', 's1:on' in s['btns'] and 's0:on' not in s['btns'] and s['info'].startswith('Seat 2 Wing · Maj. Chris'))
        btn('s1').click(); pg.wait_for_timeout(400); s = S()
        check('the same button gives the seat up: the name the campaign had is back, no manual change, no seat', s['names'][:2] == n0 and s['man'] == [] and s['seat']['n'] == -1 and not any(b.endswith(':on') and b[:2] in ('s0', 's1') for b in s['btns']))
        check('without a seat the card says it uses the values of the leader', s['info'].startswith('No seat chosen'))
        btn('s0').click(); pg.wait_for_timeout(400); btn('s1').click(); pg.wait_for_timeout(400); s = S()
        check('taking another seat moves the name: the first seat gets its name back (%s)' % s['names'][:2], s['names'][:2] == [n0[0], 'Maj. Chris'] and s['man'] == ['fl1_0'])
        pg.evaluate("__app.setField('fl0_0','Maj. Chris')"); pg.wait_for_timeout(100)
        pg.evaluate("__app.seat.pick(1)"); pg.wait_for_timeout(100); pg.evaluate("__app.seat.pick(1)"); pg.wait_for_timeout(300)
        btn('s0').click(); pg.wait_for_timeout(400); s = S()
        check('my name on a seat is taken off the other seats, which become free (%s)' % s['names'][:2], s['names'][0] == 'Maj. Chris' and s['names'][1] != 'Maj. Chris')
        # a name typed by hand on a seat is a pilot of the campaign (not on the roster): the seat takes it without asking
        msgs.clear()
        pg.evaluate("__app.seat.pick(0)"); pg.wait_for_timeout(300)  # give up seat 0
        pg.evaluate("__app.setField('fl1_0','Lt. Collins')"); pg.wait_for_timeout(100)
        btn('s1').click(); pg.wait_for_timeout(500); s = S()
        check('a pilot of the campaign (not on the roster) is replaced without a question (%s)' % msgs, msgs == [] and s['names'][1] == 'Maj. Chris')

        # ---- 3. a pilot of the squadron roster on the seat: asked first
        pg.evaluate("__app.seat.pick(1)"); pg.wait_for_timeout(300)  # give up
        pg.evaluate("__app.setField('fl1_0','Capt. Anna')"); pg.wait_for_timeout(100)
        ans[0] = False; msgs.clear()
        btn('s1').click(); pg.wait_for_timeout(600); s = S()
        check('another pilot of the roster is on the seat: it asks (%s)' % msgs[:1], len(msgs) == 1 and 'Capt. Anna is a pilot of your squadron roster' in msgs[0] and 'Put your name (Maj. Chris)' in msgs[0])
        check('Cancel: nothing changes', s['names'][1] == 'Capt. Anna' and s['seat']['n'] == -1)
        ans[0] = True; msgs.clear()
        btn('s1').click(); pg.wait_for_timeout(600); s = S()
        check('OK: my name takes the seat', s['names'][1] == 'Maj. Chris' and s['seat']['n'] == 1)

        # ---- 3b. what is written is the name of the Logbook with its rank (the callsign only when the pilot has no name)
        me = lambda: pg.evaluate("()=>__app.seat.me()")
        m0 = me()
        check('from the roster of the squadron: "Maj. Chris", not the callsign (%s)' % m0, m0['text'] == 'Maj. Chris' and 'evil19' in m0['names'] and 'chris' in m0['names'] and 'maj. chris' in m0['names'])
        pg.evaluate("()=>{window.__me=__app.sq.me;__app.sq.me=()=>({uid:'a',name:'Chris',callsign:'Evil19',st:{rk:0}})}")
        check('the name of the Logbook with its own rank: 2nd Lt. Chris (the Logbook is the first source)', me()['text'] == '2nd Lt. Chris')
        pg.evaluate("()=>{__app.sq.me=()=>({uid:'zz',name:'',callsign:'Viper',st:null})}")
        m1 = me()
        check('no name in the Logbook and not on the roster: the callsign (%s)' % m1, m1['text'] == 'Viper' and m1['names'] == ['viper'])
        pg.evaluate("()=>{__app.sq.me=()=>({uid:'zz',name:'',callsign:'',st:null})}")
        check('no name and no callsign: nothing to write', me()['text'] == '')
        pg.evaluate("()=>{__app.sq.me=window.__me}")
        check('the old texts still count as mine (the campaign may have written the callsign): Evil19 is not a pilot to ask about', pg.evaluate("()=>__app.seat.me().names.includes('evil19')"))

        # ---- 4. the laser: the TGP code of the DTC and the B. CODE follow the CONF-LSR of the seat
        s = S()
        check('seat 2 is chosen, CONF-LSR of the seats %s: DTC TGP %s, B. CODE %s' % (s['lsr'][:2], s['tgp'], s['bc']), s['tgp'] == s['lsr'][1] and s['bc'] == [s['lsr'][1]] * 2)
        pg.evaluate("__app.setField('fl1_5','1700')"); pg.wait_for_timeout(300); s = S()
        check('CONF-LSR of the seat typed on the card: the DTC TGP and the B. CODE cells show it', s['tgp'] == '1700' and s['bc'] == ['1700', '1700'])
        pg.evaluate("__app.setField('fl0_5','1777')"); pg.wait_for_timeout(300); s = S()
        check('the code of another seat does not touch the DTC', s['tgp'] == '1700' and s['bc'] == ['1700', '1700'])
        btn('s0').click(); pg.wait_for_timeout(500); s = S()
        check('taking the seat of the leader: the DTC and the B. CODE take his code', s['tgp'] == '1777' and s['bc'] == ['1777', '1777'])
        btn('s0').click(); pg.wait_for_timeout(400); s = S()
        check('no seat: the leader\'s code, as before', s['tgp'] == '1777' and s['bc'] == ['1777', '1777'])
        pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='Laser'&&l.k=='LaserTGP');window.__lst=__app.lines.filter(l=>l.s=='Laser').map(l=>l.k+'='+l.v)}")
        # the B. CODE cells are a reference of the card: typed by hand they stay and the DTC does not change
        pg.evaluate("__app.setField('wp1_bc','4242')"); pg.wait_for_timeout(300); s = S()
        check('B. CODE typed by hand is only a reference on the card: the DTC TGP stays', s['bc'][0] == '4242' and s['tgp'] == '1777')

        # ---- 5. IFF (mode 2 / mode 3) and Link 16 (STN) of the seat in the MDC format
        pg.close()
        pg, msgs, ans = page(iff=True); S = lambda: pg.evaluate(STATE); btn = lambda b: pg.locator('#seatov [data-seat=%s]' % b)
        flight(pg, 'Cyborg 5')
        s = S()
        check('a 4-ship with the IFF and Link 16 files: 4 seats, the leader is the default (%s)' % s['btns'][:4], s['btns'][:4] == ['s0:on', 's1', 's2', 's3'] and s['mdc'] == ['', '4730', '71041'])
        d0 = pg.evaluate(DTCL)
        check('the default seat writes nothing into the DTC (IFF %s, lead %s, number %s)' % (d0['v']['Mode3A Code'], d0['v']['FILE_A_FLIGHT_LEAD'], d0['v']['FILE_A_CALLSIGN_NUMBER']), d0['dirty'] == [] and d0['v']['Mode3A Code'] == '4730' and d0['v']['FILE_A_FLIGHT_LEAD'] == '1' and d0['v']['FILE_A_CALLSIGN_NUMBER'] == '31')
        btn('s2').click(); pg.wait_for_timeout(500); s = S()
        check('seat 3: the MDC takes its mode 3 and its Link 16 STN (%s)' % s['mdc'], s['mdc'] == ['', '4732', '71043'])
        d2 = pg.evaluate(DTCL)
        tm = [k for k in d0['v'] if k.startswith('TIME ') and k.endswith('Mode3A Code')]
        low = lambda d, bits: all((int(d['v'][k], 8) & 3) == bits and (int(d['v'][k], 8) >> 2) == (int(d0['v'][k], 8) >> 2) for k in ['Mode3A Code'] + tm)
        check('seat 3: the DTC takes its Mode 3 code and the Mode 3 code of each of the %d time events (same codes, low bits = the seat) (%s)' % (len(tm), d2['v']['Mode3A Code']), len(tm) >= 3 and d2['v']['Mode3A Code'] == '4732' and low(d2, 2))
        check('seat 3: Link 16 file A has the letters of Cyborg (CG: first and last), the number 53 (flight 5, position 3), no flight lead, the STNs of the flight %s' % L16A(d2), L16A(d2) == ['CG', '53', '0', '71041', '71042', '71043', '71044'])
        own = ('Mode3A Code', 'Mode2 Code', 'FILE_A_FLIGHT_LEAD', 'FILE_A_CALLSIGN_NUMBER', 'FILE_A_CALLSIGN') + tuple('FILE_A_FLIGHT_%d_STN' % i for i in range(1, 5))
        rest = [k for k in d0['v'] if k not in tm and k not in own]
        check('nothing else of IFF and Link 16 is touched (%d lines the same)' % len(rest), all(d2['v'][k] == d0['v'][k] for k in rest))
        check('the lines written are marked as changed in the DTC (it is written to the file with the others)', set(d2['dirty']) >= {'IFF|Mode3A Code', 'LINK16|FILE_A_FLIGHT_LEAD', 'LINK16|FILE_A_CALLSIGN_NUMBER', 'LINK16|FILE_A_CALLSIGN', 'LINK16|FILE_A_FLIGHT_1_STN'} and not [x for x in d2['dirty'] if x.startswith('LINK16|FILE_B')])
        btn('s3').click(); pg.wait_for_timeout(500); s = S()
        check('seat 4: the same for the fourth aircraft (%s)' % s['mdc'], s['mdc'] == ['', '4733', '71044'])
        d3 = pg.evaluate(DTCL)
        check('seat 4: the DTC has its Mode 3 code and the number 54 (%s, %s)' % (d3['v']['Mode3A Code'], d3['v']['FILE_A_CALLSIGN_NUMBER']), d3['v']['Mode3A Code'] == '4733' and low(d3, 3) and d3['v']['FILE_A_CALLSIGN_NUMBER'] == '54' and d3['v']['FILE_A_FLIGHT_LEAD'] == '0')
        pg.evaluate("__app.setField('m3','5555')"); pg.wait_for_timeout(200); btn('s2').click(); pg.wait_for_timeout(500); s = S()
        check('a value typed by hand in the MDC stays when the seat changes', s['mdc'][1] == '5555' and s['mdc'][2] == '71043')
        pg.evaluate("__app.setField('m3','5555')")
        btn('s0').click(); pg.wait_for_timeout(500)
        dl = pg.evaluate(DTCL)
        check('the leader\'s seat: the IFF codes as they were opened, and Link 16 of the leader (CG, 51, the lead flag)', all(dl['v'][k] == d0['v'][k] for k in d0['v'] if k not in own[2:]) and L16A(dl) == ['CG', '51', '1', '71041', '71042', '71043', '71044'])
        btn('s2').click(); pg.wait_for_timeout(500); btn('s2').click(); pg.wait_for_timeout(500)
        dg = pg.evaluate(DTCL)
        check('giving the seat up: the leader\'s values (as the laser code does), no seat chosen', S()['seat']['n'] == -1 and all(dg['v'][k] == d0['v'][k] for k in d0['v'] if k not in own[2:]) and L16A(dg) == L16A(dl))
        # the switches of the Data Cartridge page: off = the DTC is not touched by the seat
        pg.evaluate("()=>{__app.ST.DCS.iff=false}"); btn('s3').click(); pg.wait_for_timeout(500)
        dq = pg.evaluate(DTCL)
        check('IFF switch off: the Mode 3 codes stay, Link 16 (switch on) follows the seat (%s, %s)' % (dq['v']['Mode3A Code'], dq['v']['FILE_A_CALLSIGN_NUMBER']), dq['v']['Mode3A Code'] == '4730' and dq['v']['FILE_A_CALLSIGN_NUMBER'] == '54' and dq['v']['FILE_A_FLIGHT_LEAD'] == '0')
        pg.evaluate("()=>{__app.ST.DCS.l16=false}"); btn('s1').click(); pg.wait_for_timeout(500)
        dq = pg.evaluate(DTCL)
        check('both switches off: the DTC is left as it is (%s, %s)' % (dq['v']['Mode3A Code'], dq['v']['FILE_A_CALLSIGN_NUMBER']), dq['v']['Mode3A Code'] == '4730' and dq['v']['FILE_A_CALLSIGN_NUMBER'] == '54')
        pg.evaluate("()=>{__app.ST.DCS.iff=true;__app.ST.DCS.l16=true}"); btn('s2').click(); pg.wait_for_timeout(300); btn('s3').click(); pg.wait_for_timeout(500)
        check('both on again: the next seat writes both', pg.evaluate(DTCL)['v']['Mode3A Code'] == '4733')
        btn('s2').click(); pg.wait_for_timeout(500)
        # ---- 6. the MDC format has the same buttons
        pg.click('#mdctog'); pg.wait_for_timeout(700)
        s = S()
        check('MDC: round buttons in its Pilots table (4 seats) and in the roll call (the package)', [b for b in s['btns'] if b.startswith('s')][:4] == ['s0', 's1', 's2:on', 's3'] and any(b.startswith('p') for b in s['btns']))
        pg.locator('#seatov [data-seat=s3]').click(); pg.wait_for_timeout(500); s = S()
        check('MDC: a button works as on the datacard (seat 4: %s)' % s['mdc'], s['seat']['n'] == 3 and s['mdc'][2] == '71044')
        inside = pg.evaluate("()=>{const c=document.getElementById('cv').getBoundingClientRect();return [...document.querySelectorAll('#seatov .seatb')].every(b=>{const r=b.getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1&&r.width>8&&r.height>8})}")
        check('MDC: every button is inside the card and big enough to be pressed', inside)
        for k, b_ in (('fl3_0', 's3'), ('rc0_0', 'p0')):
            g = big(lambda: pg.evaluate(SCAN, [k, b_]))
            check('MDC: %s: the button is at the left end of the cell and the text starts after it (%s)' % (k, {a: round(v) for a, v in g.items()}), 0 <= g['left'] <= 12 and g['right'] < g['ind'] and abs(g['mid']) < 2 and g['before'] == 0 and g['after'] > 20)
        if shots: pg.screenshot(path=shots + '/seat-mdc.png', clip=pg.evaluate("()=>{const b=document.getElementById('cv').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height*0.5}}"))
        pg.click('#mdctog'); pg.wait_for_timeout(500)

        # ---- 7. another flight: the seat stays; a flight that has not that seat makes the card neutral, with a notice
        flight(pg, 'Hog 3')
        s = S()
        check('a 2-ship has no seat 4: the card is neutral and says so (%s)' % s['seat'], s['seat']['n'] == -1 and 'has only 2 aircraft' in s['info'] and not any(b.endswith(':on') for b in s['btns'][:4]))
        btn('s1').click(); pg.wait_for_timeout(400)
        flight(pg, 'Eagle 4'); s = S()
        check('seat 2 chosen, another 2-ship opened: the seat stays and the name is written in the new flight, without a question (%s)' % s['names'][:2], s['seat']['n'] == 1 and s['names'][1] == 'Maj. Chris' and 'fl1_0' in s['man'] and msgs == [])
        check('opening a flight clears the notice', 'has only' not in s['info'])
        flight(pg, 'Cyborg 5'); s = S()
        check('and back on the 4-ship the seat is still seat 2 (%s)' % s['mdc'], s['seat']['n'] == 1 and s['btns'][:4] == ['s0', 's1:on', 's2', 's3'])

        # ---- 8. the other flights of the package: round buttons of the roll call
        flight(pg, 'Stud 1 .*HAVCAP')
        s = S(); pk = [b for b in s['btns'] if b.startswith('p')]
        check('the package of Stud 1 has its flights as buttons, the flight of the card is pressed (%s)' % pk, len(pk) >= 3 and pk[0] == 'p0' or any(b.endswith(':on') for b in pk))
        pg.evaluate("()=>{window.__pk=[...document.querySelectorAll('#seatov .seatb')].filter(b=>b.dataset.seat[0]=='p').map(b=>[b.dataset.seat,b.getAttribute('aria-pressed'),b.disabled,b.title])}")
        pk = pg.evaluate("()=>window.__pk"); me = [x for x in pk if x[1] == 'true']
        check('exactly one package button is pressed: the flight of the card', len(me) == 1 and 'the card is for this flight' in me[0][3])
        other = [x for x in pk if x[1] == 'false' and not x[2] and 'Ramrod' in x[3]]
        check('the other flights of the package can be chosen (%d)' % len(other), len(other) >= 1)
        cur0 = pg.evaluate("()=>document.getElementById('fsel').selectedOptions[0].textContent")
        pg.evaluate("__app.setField('fl0_5','1555')"); pg.wait_for_timeout(200)
        check('a change on this card that no mission holds', pg.evaluate("()=>__app.unsaved()") is True)
        ans[0] = False; msgs.clear()
        pg.locator('#seatov [data-seat=%s]' % other[0][0]).click(); pg.wait_for_timeout(700)
        check('another flight: it asks first, because of the unsaved change (%s)' % msgs[:1], len(msgs) == 1 and msgs[0].startswith('Go to ') and 'not saved in a mission' in msgs[0])
        check('Cancel: the same flight stays', pg.evaluate("()=>document.getElementById('fsel').selectedOptions[0].textContent") == cur0)
        ans[0] = True; msgs.clear()
        pg.locator('#seatov [data-seat=%s]' % other[0][0]).click(); pg.wait_for_timeout(1000)
        cur1 = pg.evaluate("()=>document.getElementById('fsel').selectedOptions[0].textContent")
        check('OK: the datacard of the other flight opens (%s) and the seat stays' % cur1.split(' · ')[0], cur1 != cur0 and S()['seat']['n'] == 1)
        pg.evaluate("()=>{window.__dummy=1}")

        # ---- 9. the standard menu of the Name cell (and of the pilot list of the Flight section)
        flight(pg, 'Stud 1 .*HAVCAP')
        r = pg.evaluate("()=>__app.cellRect('fl0_0')")
        pg.mouse.click(r['x'] + r['w'] * 0.7, r['y'] + r['h'] / 2); pg.wait_for_timeout(400)
        mn = pg.evaluate("()=>{const m=document.getElementById('chm');return {open:m.style.display=='block',items:[...m.querySelectorAll('button')].map(b=>b.textContent),head:(m.querySelector('.gh')||{}).textContent}}")
        check('a click on a Name cell opens the standard menu: Auto, Type a name, then the roster (%s)' % mn['items'], mn['open'] and mn['items'][0].startswith('Auto') and mn['items'][1] == 'Type a name…' and mn['head'] == 'Squadron roster' and mn['items'][2:] == ['Capt. Anna', 'Maj. Chris'])
        sty = lambda sel: pg.evaluate("s=>{const e=document.querySelector(s),c=getComputedStyle(e);return [c.backgroundColor,c.borderRadius,c.borderTopColor]}", sel)
        sty_item = lambda sel: pg.evaluate("s=>{const e=document.querySelector(s),c=getComputedStyle(e);return [c.fontSize,c.color,c.borderRadius]}", sel)
        chm, chm_i = sty('#chm'), sty_item('#chm button:not(.on)')
        pg.locator('#chm button', has_text='Capt. Anna').click(); pg.wait_for_timeout(300)
        check('choosing a pilot writes the name in the cell', pg.evaluate("()=>__app.F.fl0_0") == 'Capt. Anna')
        pg.evaluate("document.querySelectorAll('#form details').forEach(d=>d.open=true)")
        pg.locator('#form .pnb').nth(1).click(); pg.wait_for_timeout(300)
        pn, pn_i = sty('#pnmenu'), sty_item('#pnmenu .pni:not(.on)')
        check('the pilot list of the Flight section has the style of the standard menu (%s / %s)' % (pn, chm), pn == chm and pn_i[:2] == chm_i[:2])
        pg.keyboard.press('Escape'); pg.mouse.click(5, 5); pg.wait_for_timeout(300)

        # ---- 10. a mission keeps the seat; opened by another pilot it asks for a choice
        flight(pg, 'Cyborg 5'); btn('s2').click(); pg.wait_for_timeout(500)
        pg.evaluate("__app.setField('fl2_5','1666')"); pg.wait_for_timeout(300)
        mj = pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())"); m = json.loads(mj)
        check('the mission holds the seat of whoever saved it (and who he is)', m['datacard']['seat'] == {'n': 2, 'set': True, 'uid': 'a'})
        check('and the DTC edit of the TGP is the code of the seat', any(l['k'] == 'LaserTGP' and l['v'] == '1666' for l in m['dtc']['edits']))
        check('the DTC edits hold the IFF and Link 16 of the seat (Mode 3 4732, number 53, not the lead)', any(l['k'] == 'Mode3A Code' and l['v'] == '4732' for l in m['dtc']['edits']) and any(l['k'] == 'FILE_A_CALLSIGN_NUMBER' and l['v'] == '53' for l in m['dtc']['edits']) and any(l['k'] == 'FILE_A_FLIGHT_LEAD' and l['v'] == '0' for l in m['dtc']['edits']))
        btn('s0').click(); pg.wait_for_timeout(400)
        pg.evaluate("async t=>__app.msfLoad(t)", mj); pg.wait_for_timeout(1200)
        s = S()
        check('my own mission: the seat is back as I left it, nothing to choose (%s)' % s['seat'], s['seat']['n'] == 2 and s['seat']['set'] and not s['seat']['ask'] and s['btns'][:4] == ['s0', 's1', 's2:on', 's3'])
        dm = pg.evaluate(DTCL)
        check('and its DTC is the one of the seat (Mode 3 %s, number %s)' % (dm['v']['Mode3A Code'], dm['v']['FILE_A_CALLSIGN_NUMBER']), dm['v']['Mode3A Code'] == '4732' and dm['v']['FILE_A_CALLSIGN_NUMBER'] == '53' and dm['v']['FILE_A_FLIGHT_LEAD'] == '0')
        old = json.loads(mj); old['datacard'].pop('seat')
        pg.evaluate("async t=>__app.msfLoad(t)", json.dumps(old)); pg.wait_for_timeout(1200); s = S()
        check('my own mission from before the seat existed: the leader, as the default', s['seat']['n'] == 0 and not s['seat']['set'] and not s['seat']['ask'])
        pg.close()
        # another pilot opens the mission: neutral, the buttons ask for a choice
        other = json.loads(mj); other['dtc']['author'] = {'uid': 'someone-else', 'callsign': 'Viper'}; other['datacard']['seat']['uid'] = 'someone-else'
        pg = br.new_page(viewport={'width': 1500, 'height': 1000}, reduced_motion='reduce'); dialogs.install(pg); msgs = []; ans = [True]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.add_init_script("try{localStorage.setItem('bmsform','1')}catch(e){}")
        pg.goto(URL); pg.wait_for_timeout(800)
        pg.evaluate(SQ, ['b', 'Zed'])
        pg.evaluate("ini=>{window.showOpenFilePicker=async()=>[{getFile:async()=>new File([ini],'Zed.ini')}]}", ini)
        pg.evaluate("t=>{window.__r=__app.msfLoad(t)}", json.dumps(other)); pg.wait_for_selector('#msfnodtc', state='visible', timeout=8000)
        pg.click('#msfnodtc [data-ok]'); pg.wait_for_selector('#msfgrp', state='visible', timeout=8000)
        pg.click('#msfgrp [data-ok]'); loaded = pg.evaluate("async()=>await window.__r"); pg.wait_for_timeout(900)
        S = lambda: pg.evaluate(STATE); btn = lambda b: pg.locator('#seatov [data-seat=%s]' % b)
        s = S()
        check('the mission of another pilot opens', loaded is True)
        check('his name is not on the card: no seat is taken and the buttons ask for a choice (%s)' % s['btns'][:4], s['seat']['n'] == -1 and s['seat']['ask'] and s['btns'][:4] == ['s0:ask', 's1:ask', 's2:ask', 's3:ask'])
        check('the line under the card explains it', s['info'].startswith('Choose your seat'))
        check('the DTC and the card use the leader\'s values until then (TGP %s)' % s['tgp'], s['tgp'] == s['lsr'][0])
        if shots: pg.screenshot(path=shots + '/seat-ask.png', clip=pg.evaluate("()=>{const b=document.getElementById('cv').getBoundingClientRect();return {x:b.x,y:b.y+b.height*0.38,width:b.width,height:b.height*0.34}}"))
        btn('s3').click(); pg.wait_for_timeout(600); s = S()
        check('the receiver takes seat 4: his name is written, the highlight goes, the laser code is the one of his seat (%s)' % s['tgp'], s['seat']['n'] == 3 and s['names'][3] == 'Capt. Anna' and not s['seat']['ask'] and not any(b.endswith(':ask') for b in s['btns']) and s['tgp'] == s['lsr'][3])
        check('the names of the other pilots of the mission stay (%s)' % s['names'], s['names'][2] == 'Maj. Chris')
        # the receiver whose name is already on the card
        o2 = json.loads(json.dumps(other)); o2['datacard']['final']['fl1_0'] = 'Capt. Anna'; o2['datacard']['manual'] = {**o2['datacard'].get('manual', {}), 'fl1_0': 'Capt. Anna'}
        pg.evaluate("t=>{window.__r=__app.msfLoad(t)}", json.dumps(o2)); pg.wait_for_timeout(1200)
        for sel in ('#msfnodtc', '#msfgrp'):
            if pg.is_visible(sel): pg.click(sel + ' [data-ok]'); pg.wait_for_timeout(800)
        pg.evaluate("async()=>await window.__r"); pg.wait_for_timeout(800)
        s = S()
        check('a mission that has my name on a seat: that seat is mine, nothing to choose (%s)' % s['seat'], s['seat']['n'] == 1 and s['seat']['set'] and not s['seat']['ask'])
        pg.close()

        # ---- 11. animations: the round buttons and the lit row change with a transition; everything is off with the switch of the Settings
        pg, msgs, ans = page(motion='no-preference'); S = lambda: pg.evaluate(STATE); btn = lambda b: pg.locator('#seatov [data-seat=%s]' % b)
        tr = lambda sel: pg.evaluate("s=>getComputedStyle(document.querySelector(s)).transitionDuration.split(',').some(x=>x.trim()!='0s')", sel)
        check('the round buttons and the lit row change with a transition', tr('#seatov .seatb') and tr('#seatov .seatrow') and tr('#seatinfo'))
        btn('s1').click()
        run = pg.evaluate("()=>[...document.querySelector('#seatov [data-seat=s1]').getAnimations()].map(a=>a.transitionProperty||a.animationName)")
        check('pressing a button animates it (%s)' % run, len(run) > 0)
        pg.wait_for_timeout(500)
        pg.evaluate("()=>{__app.ST.SEAT.ask=true;__app.ST.MSFLOCK={C:__app.ST.C};__app.seat.pick&&0}")
        pg.evaluate("()=>{document.querySelectorAll('#seatov .seatb').forEach(b=>b.classList.add('ask'))}")
        an = pg.evaluate("()=>getComputedStyle(document.querySelector('#seatov [data-seat=s0]')).animationName")
        check('the buttons that ask for a choice pulse (animation %s)' % an, an == 'seatask')
        pg.evaluate("()=>{__app.CFG.ui={...(__app.CFG.ui||{}),animations:false};document.documentElement.classList.add('noanim')}")
        check('animations off: transitions and pulse stop', not tr('#seatov .seatb') and not tr('#seatov .seatrow') and pg.evaluate("()=>getComputedStyle(document.querySelector('#seatov [data-seat=s0]')).animationName") == 'none')
        pg.close()

        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
