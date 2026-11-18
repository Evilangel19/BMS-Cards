"""Weapons > HARM > SEAD with a made-up package (a SEAD flight, a strike flight to protect, one that crosses no ring), three SAMs and a made-up missile:
the switch SEAD / Single shot, the package, the threats with their HARM codes and tables, the sort (Priority, Azimuth, a seat by hand), a threat left
out, the impact slider, the map, the timeline, the shot, an out of range shot and its fix, HARM tables (asks, writes the missing one), PPT (asks, adds the
threats with the AUTO PPT), the SEAD card of the Kneeboard, the mission keeps the page. No BMS files. Usage: CSP=1 python3 tools/sead-test.py [screenshot_dir]"""
import base64, json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools')
import dialogs
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = 8964
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
HARM = [[202, 203, 204, 205, 210], [402, 403, 404, 405, 410], [106, 608, 111, 615, 117]]
INI = '\r\n'.join(['[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['[HARM]'] + ['THREAT %d %d=%04d' % (t, n, HARM[t][n]) for t in range(3) for n in range(5)] + ['MODE=1', 'SUBMODE=1', 'TER=0', ''])
CTX = """()=>{const T0=10*3600000,kmh=480*1.852,r=(x,kt,t0,y0,y1)=>[{x,y:y0,z:2500,arr:t0,dep:0,act:0},{x,y:y1,z:2500,arr:t0+(y1-y0)/(kt*1.852)*3600000,dep:0,act:0}];
 const me={key:'1',name:'Weasel 1',ac:'F-16CM',n:4,mission:'SEAD',tot:'10:05:00',f:{wps:r(480,450,T0-60000,380,520)},pkgNo:12,sead:true};
 const fl=[{key:'2',name:'Viper 2',ac:'F-16CM',n:4,mission:'STRIKE',tot:'10:06:00',f:{wps:r(500,480,T0,380,520)},sead:false},
   {key:'3',name:'Hawg 3',ac:'A-10C',n:2,mission:'BAI',tot:'10:20:00',f:{wps:r(800,300,T0,100,200)},sead:false}];
 const sams=[{id:'s6',x:505,y:440,rng:25,name:'SA-6',code:106},{id:'s3',x:494,y:470,rng:30,name:'SA-3',code:103},{id:'s2',x:508,y:505,rng:12,name:'SA-8',code:608},{id:'f',x:700,y:700,rng:40,name:'SA-2',code:102}];
 window.__sc={ok:true,me,flights:fl,sams,seat:0,harms:[2,2,1,1]};
 const m={range:{alts:[0,50000],vels:[0,3000],tgtAlts:[0,50000],table:[[[151900,151900],[151900,151900]],[[151900,151900],[151900,151900]]],mult:1},loft:null};
 __app.seadPage._test({ctx:()=>window.__sc,harm:async()=>({m,v:{mode:'pos',sub:'EOM'}})});}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1760, 'height': 1150}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(500); pg.click('#wp [data-mode=harm]'); pg.wait_for_timeout(700)
        check('HARM: the switch SEAD / Single shot; with no SEAD flight the Single shot page', pg.locator('#wp .hsub [data-hsub]').all_inner_texts() == ['SEAD', 'Single shot'] and pg.locator('#wp .hsub .on').inner_text() == 'Single shot' and pg.locator('#wp #wpharm').count() == 1)
        pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(500)
        check('SEAD without a SEAD flight: the page says why', 'SEAD' in pg.inner_text('#wp .sdnone') and pg.locator('#wp #wpharm').count() == 0)
        pg.evaluate(CTX); pg.click('#wp [data-hsub=shot]'); pg.wait_for_timeout(300); pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(1500)
        P = lambda: pg.evaluate("()=>{const P=__app.seadPage.plan();return P.rows.map(r=>({id:r.id,seat:r.seat,t85:r.t85,tin:r.tin,ok:r.launch&&r.launch.ok,off:r.launch&&r.launch.off,tl:r.launch&&r.launch.t,fix:!!(r.launch&&r.launch.fix),by:r.by}))}")
        rows = P()
        check('the package: you, the strike flight checked, the one with no ring crossed', 'Weasel 1' in pg.inner_text('#sdpk') and pg.locator('#sdpk [data-sdprot="2"]').is_checked() and 'no ring crossed' in pg.inner_text('#sdpk'))
        check('the threats on the protected route: the three crossed (not the far SA-2), first reached first %s' % [r['id'] for r in rows], [r['id'] for r in rows] == ['s6', 's3', 's2'] and all(r['by'] == ['Viper 2'] for r in rows))
        t = pg.inner_text('#sdth')
        check('...their HARM tables: SA-6 and SA-8 in table 3, SA-3 not in a table', pg.locator('#sdth tr[data-sdrow=s6] .sdht').inner_text() == 'T3' and 'not in a table' in pg.inner_text('#sdth tr[data-sdrow=s3]'))
        check('Priority: #1, #2, #3 in the order reached %s' % [r['seat'] for r in rows], [r['seat'] for r in rows] == [0, 1, 2])
        check('the launches: before the impact, in range %s' % rows, all(r['tl'] < r['t85'] and r['ok'] for r in rows))
        check('the map: the routes, the rings, the launch points (Leaflet of the Map page)', pg.locator('#sdmap .leaflet-container, #sdmap.leaflet-container').count() + pg.locator('#sdmap .leaflet-pane').count() > 0 and pg.locator('#sdmap .sd85m').count() == 3)
        check('the timeline: one row per shot', pg.locator('#sdtl .sdtr').count() == 3)
        check('the shot: the first one, with its launch, turn and impact', 'Shot · #1 LEAD · SA-6' in pg.inner_text('#sdsh').replace('SHOT', 'Shot') or 'SA-6' in pg.inner_text('#sdsh') and 'TURN TO' in pg.inner_text('#sdsh').upper())
        if shots: pg.locator('#wp').screenshot(path=shots + '/sead-page.png')
        # a threat left out, a seat by hand, Azimuth
        pg.click('#sdth input[data-sdskip=s6]'); pg.wait_for_timeout(500); rows = P()
        check('SA-6 left out: no seat, the others move up (#1, #2)', [r['seat'] for r in rows] == [None, 0, 1] and pg.locator('#sdtl .sdtr').count() == 2)
        pg.click('#sdth input[data-sdskip=s6]'); pg.wait_for_timeout(400)
        pg.select_option('#sdso select[data-sdseat=s2]', '3'); pg.wait_for_timeout(400); rows = P()
        check('SA-8 given to #4 by hand %s' % [r['seat'] for r in rows], rows[2]['seat'] == 3)
        pg.click('#sdso [data-sdsort=az]'); pg.wait_for_timeout(400); rows = P()
        check('Azimuth: SA-3 (left of the route) to #1, SA-6 (right) after it; SA-8 stays #4 %s' % [r['seat'] for r in rows], rows[1]['seat'] == 0 and rows[0]['seat'] == 1 and rows[2]['seat'] == 3)
        pg.click('#sdso [data-sdsort=prio]'); pg.wait_for_timeout(300)
        t85a = P()[0]['t85']
        pg.locator('#sdth input[data-sdk]').evaluate("e=>{e.value=100;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(500)
        check('impact at 100%: at the entry into the ring, earlier', P()[0]['t85'] < t85a and abs(P()[0]['t85'] - P()[0]['tin']) < 2000)
        pg.locator('#sdth input[data-sdk]').evaluate("e=>{e.value=85;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        # out of range: the SEAD flight far behind
        pg.evaluate("()=>{const w=__sc.me.f.wps;w.forEach(p=>p.x=400);}"); pg.click('#wp [data-hsub=shot]'); pg.wait_for_timeout(300); pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(1200); rows = P()
        check('far from the SAMs: out of range, a problem card with its fix', any(not r['ok'] for r in rows) and pg.locator('#sdpr .sdpb').count() >= 1 and 'FIX' in pg.inner_text('#sdpr').upper())
        pg.evaluate("()=>{__sc.me.f.wps.forEach(p=>p.x=480);}"); pg.click('#wp [data-hsub=shot]'); pg.wait_for_timeout(300); pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(1200)
        # HARM tables: your seat (#1) has SA-6 (in T3): nothing to write; as #2, SA-3 is missing: asked, written in place of a slot not of this mission
        msgs = []
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.click('#wp [data-sdtab]'); pg.wait_for_timeout(600)
        check('HARM tables, #1: SA-6 is already in table 3, nothing asked', not msgs)
        pg.evaluate("()=>{__sc.seat=1}"); pg.click('#wp [data-hsub=shot]'); pg.wait_for_timeout(300); pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(1000)
        pg.click('#wp [data-sdtab]'); pg.wait_for_timeout(1200)
        hv = pg.evaluate("()=>[0,1,2].map(t=>[0,1,2,3,4].map(n=>(__app.lines.find(l=>l.s=='HARM'&&l.k=='THREAT '+t+' '+n)||{}).v))")
        check('...as #2: SA-3 is missing, the box says where it goes (replacing a threat not of this mission), then it is written %s' % hv, msgs and 'SA-3' in msgs[0] and 'replaces' in msgs[0] and '0103' in sum(hv, []) and '0106' in sum(hv, []) and '0608' in sum(hv, []))
        check('...the table cell of SA-3 shows its table now', pg.locator('#sdth tr[data-sdrow=s3] .sdht').count() == 1)
        # PPT: asked, the threats of the seat added with the AUTO PPT
        n0 = pg.evaluate("()=>__app.lines.filter(l=>/^ppt_/.test(l.k)&&!/^0\\.000000, 0\\.000000/.test(l.v)).length")
        msgs.clear(); pg.click('#wp [data-sdppt]'); pg.wait_for_timeout(1200)
        n1 = pg.evaluate("()=>__app.lines.filter(l=>/^ppt_/.test(l.k)&&!/^0\\.000000, 0\\.000000/.test(l.v)).length")
        check('PPT: asked first, then the threat of the seat is a pre-planned threat of the DTC (%d -> %d)' % (n0, n1), msgs and 'pre-planned' in msgs[0] and n1 == n0 + 1)
        msgs.clear(); pg.click('#wp [data-sdppt]'); pg.wait_for_timeout(600)
        check('...pressed again: already there, nothing asked', not msgs)
        # the card
        if shots:
            d = pg.evaluate("async()=>(await __app.seadPage.cardMap()).toDataURL()"); open(shots + '/sead-card.png', 'wb').write(base64.b64decode(d.split(',')[1]))
        cd = pg.evaluate("()=>__app.seadPage.card()")
        check('the SEAD card: your seat, all the shots with launch and impact', cd['seatName'] == '#2' and len(cd['rows']) == 3 and all(r['tl'] != '—' for r in cd['rows']))
        k0 = pg.evaluate('()=>__app.KBLIB.length')
        pg.click('#wp [data-sdcard]')
        for _ in range(40):
            if pg.evaluate('()=>__app.KBLIB.length') > k0: break
            pg.wait_for_timeout(250)
        check('Add card: the card is in the Kneeboard', pg.evaluate('()=>__app.KBLIB.length') == k0 + 1)
        st = pg.evaluate("()=>__app.seadPage.state()")
        check('the page state for the mission file (the seat by hand, the sort, the impact)', st['seat'].get('s2') == 3 and st['sort'] == 'prio' and st['k'] == 85)
        pg.evaluate("()=>__app.seadPage.setState({k:'<b>',sort:{},seat:[],skip:'x',prot:null,sel:5})"); pg.wait_for_timeout(500)
        st = pg.evaluate("()=>__app.seadPage.state()")
        check('a broken state from a file is brought back to sane values', st['k'] == 85 and st['sort'] == 'prio' and st['seat'] == {} and st['sel'] in (None, 's6', 's3', 's2'))
        check('no page errors', not errs)
        if errs: print(errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
