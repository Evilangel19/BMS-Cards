"""Weapons > HARM > SEAD with a made-up package (a SEAD flight, a strike flight to protect, one that crosses no ring), three SAMs and a made-up missile:
the switch SEAD / DEAD, the package, the threats with their HARM codes and tables, the sort (Priority, Azimuth, a seat by hand), a threat left
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
CTX = """()=>{const T0=10*3600000,r=(x,kt,t0,y0,y1,a=0)=>{const ym=(y0+y1)/2,t1=t0+(ym-y0)/(kt*1.852)*3600000;return [{x,y:y0,z:2500,arr:t0,dep:0,act:0},{x,y:ym,z:2500,arr:t1,dep:0,act:a},{x,y:y1,z:2500,arr:t1+(y1-ym)/(kt*1.852)*3600000,dep:0,act:0}]};
 const me={key:'1',name:'Weasel 1',ac:'F-16CM',n:4,mission:'SEAD',tot:'10:05:00',f:{wps:[{x:480,y:380,z:2500,arr:T0-60000,dep:0,act:0},{x:480,y:520,z:2500,arr:T0-60000+140/(450*1.852)*3600000,dep:0,act:19},{x:483,y:380,z:2500,arr:T0-60000+280/(450*1.852)*3600000,dep:0,act:0}]},pkgNo:12,sead:true};
 const fl=[{key:'2',name:'Viper 2',ac:'F-16CM',n:4,mission:'STRIKE',tot:'10:06:00',f:{wps:[{x:500,y:380,z:2500,arr:T0,dep:0,act:0},{x:500,y:520,z:2500,arr:T0+140/(480*1.852)*3600000,dep:0,act:17},{x:503,y:380,z:2500,arr:T0+280/(480*1.852)*3600000,dep:0,act:0}]},sead:false},
   {key:'3',name:'Hawg 3',ac:'A-10C',n:2,mission:'BAI',tot:'10:20:00',f:{wps:r(800,300,T0,100,200)},sead:false},
   {key:'4',name:'Ford 4',ac:'F-15C',n:2,mission:'ESCORT',tot:'10:06:00',f:{wps:[{x:497,y:380,z:3000,arr:T0+30000,dep:0,act:0},{x:497,y:525,z:3000,arr:T0+30000+145/(480*1.852)*3600000,dep:0,act:10},{x:500,y:380,z:3000,arr:T0+30000+290/(480*1.852)*3600000,dep:0,act:0}]},sead:false}];
 const sams=[{id:'s6',x:505,y:440,rng:25,name:'SA-6',code:106},{id:'s3',x:494,y:470,rng:30,name:'SA-3',code:103},{id:'s2',x:508,y:505,rng:12,name:'SA-8',code:608},{id:'f',x:700,y:700,rng:40,name:'SA-2',code:102}];
 const refs=[{n:1,x:480,y:380},{n:2,x:480,y:520},{n:3,x:483,y:380},{n:4,x:505.5,y:441}];
 window.__sc={ok:true,me,flights:fl,sams,seat:0,harms:[2,2,1,1],hts:true,refs};
 const m={range:{alts:[0,50000],vels:[0,3000],tgtAlts:[0,50000],table:[[[151900,151900],[151900,151900]],[[151900,151900],[151900,151900]]],mult:1},loft:null};
 __app.seadPage._test({ctx:()=>window.__sc,harm:async()=>({m,v:{mode:'pos',sub:'EOM'}})});}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1760, 'height': 1150}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        if os.environ.get('DARK'): pg.evaluate("()=>import('./js/core/cardink.js').then(m=>m.setCardDark(true))")  # DARK=1: the cards in the dark look
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(500); pg.click('#wp [data-mode=harm]'); pg.wait_for_timeout(700)
        check('HARM: the switch SEAD / DEAD; with no SEAD or DEAD flight DEAD with the HARM standoff shot of the HARM page', pg.locator('#wp .hsub [data-hsub]').all_inner_texts() == ['SEAD', 'DEAD'] and pg.locator('#wp .hsub .on').inner_text() == 'DEAD' and pg.locator('#wp #wpharm').count() == 1 and 'No DEAD flight' in pg.inner_text('#wp .hsub'))
        pg.click('#wp [data-hsub=sead]'); pg.wait_for_timeout(500)
        check('SEAD without a SEAD flight: the page says why', 'SEAD' in pg.inner_text('#wp .sdnone') and pg.locator('#wp #wpharm').count() == 0)
        re = lambda: (pg.click('#wp [data-hsub=dead]'), pg.wait_for_timeout(300), pg.click('#wp [data-hsub=sead]'), pg.wait_for_timeout(1300))
        pg.evaluate(CTX); re()
        P = lambda: pg.evaluate("()=>{const P=__app.seadPage.plan();return {rows:P.rows.map(r=>({id:r.id,tEnd:r.tEnd,n:r.shots.length,gaps:r.gaps.length,ref:r.ref&&r.ref.n,inA:r.ref&&r.ref.inArea,t85:r.t85,tin:r.tin,tout:r.tout})),shots:P.shots.map(z=>({key:z.key,id:z.id,k:z.k,seat:z.seat,imp:z.imp,from:z.from,cover:z.cover,tl:z.launch.t,ok:z.launch.ok})),seats:P.seats}}")
        R = P()
        first = {z['id']: z['seat'] for z in R['shots'] if z['k'] == 1}
        check('the package: you in green, the strike flight with its task steerpoint, the one with no ring crossed', 'Weasel 1' in pg.inner_text('#sdpk') and pg.locator('#sdpk .sdme').count() == 1 and 'STPT 2' in pg.inner_text('#sdpk') and 'no ring crossed' in pg.inner_text('#sdpk'))
        check('the threats: the three crossed (not the far SA-2), first reached first %s' % [r['id'] for r in R['rows']], [r['id'] for r in R['rows']] == ['s6', 's3', 's2'])
        check('...their HARM tables in grey (T3/1, T3/2), SA-3 not in a table', pg.locator('#sdth tr[data-sdsam=s6] .sdht').inner_text() == 'T3/1' and 'not in a table' in pg.inner_text('#sdth tr[data-sdsam=s3]'))
        check('Priority: the first HARM of each SAM to #1, #2, #3 %s' % first, first == {'s6': 0, 's3': 1, 's2': 2})
        n = len(R['shots'])
        check('all the HARMs of the flight are used (2+2+1+1 = 6) or the time inside is covered %s' % [(z['id'], z['seat']) for z in R['shots']], n == 6 or all(r['gaps'] == 0 for r in R['rows']))
        check('...the seats get no more than their HARMs', all(s['used'] <= s['harms'] for s in R['seats']))
        sh = sorted(R['shots'], key=lambda z: z['imp'])
        tend = {r['id']: r['tEnd'] or 0 for r in R['rows']}
        check('the way back is covered too: a HARM after the strike on a SAM crossed again', any(z['imp'] > tend[z['id']] for z in R['shots']))
        bysam = {}
        for z in sh: bysam.setdefault(z['id'], []).append(z)
        check('...two HARMs on one SAM: the next one launched about when the cover of the last one ends (or it covers the way back)', all(b['from'] - a['cover'] < 6000 or b['imp'] > tend[b['id']] for L in bysam.values() for a, b in zip(L, L[1:])))
        same = [[z['tl'] for z in R['shots'] if z['seat'] == s] for s in range(4)]
        check('...8 s at least between two launches of one aircraft', all(abs(a - b) >= 7999 for L in same for i, a in enumerate(L) for b in L[i + 1:]))
        check('POS: SA-6 aims at STPT 4 (0.5 nm from it, in the EOM area); SA-3 has no steerpoint close enough %s' % [(r['id'], r['ref'], r['inA']) for r in R['rows']], R['rows'][0]['ref'] == 4 and R['rows'][0]['inA'] and not R['rows'][1]['inA'])
        check('...a problem card for SA-3 (POS) with its fix (PPT, PB or HAD)', 'PPT' in pg.inner_text('#sdpr') and 'SA-3' in pg.inner_text('#sdpr'))
        check('the map: the launch points, the impacts, the task steerpoint', pg.locator('#sdmap .sdimp').count() == n and pg.locator('#sdmap .sdtri').count() >= 1 and pg.locator('#sdmap .sdl .sdme').count() >= 1)
        check('the shot chosen: yours first (#1 LEAD), with POS STPT 4, cover and margin', 'STPT 4' in pg.inner_text('#sdsh') and 'COVERS' in pg.inner_text('#sdsh').upper() and '#1 LEAD' in pg.inner_text('#sdsh'))
        check('the cover card of its SAM', 'SA-6' in pg.inner_text('#sdcv') and 'NOT COVERED' in pg.inner_text('#sdcv').upper())
        if shots: pg.locator('#wp').screenshot(path=shots + '/sead-page.png')
        # the scheme
        pg.click('#wp [data-sdview=sch]'); pg.wait_for_timeout(500)
        sv = pg.text_content('#sdsch svg')
        check('Scheme: one package lane (Viper 2 first in, Ford 4 ESCORT), the task of the first flight in only, the seats with their launches and TOF, the events', not pg.locator('#sdmap').is_visible() and pg.locator('#sdsch svg.sdscv').count() == 1 and 'first in: Viper 2' in sv and 'ESCORT' in sv and sv.count('STPT 2 ·') == 1 and 'TOF' in sv and pg.locator('#sdsch .sdev div').count() > 6)
        ev = pg.evaluate("()=>__app.seadPage.events().map(e=>e.c+':'+e.s)")
        check('...your launches are marked yours (green) in the events', any(e.startswith('me:#1 LAUNCH') for e in ev) and not any(e.startswith('me:#2') for e in ev))
        if shots: pg.locator('#wp').screenshot(path=shots + '/sead-scheme.png')
        pg.click('#wp [data-sdview=map]'); pg.wait_for_timeout(600)
        # HAD, PB
        pg.click('#sdso [data-sdmode=had]'); pg.wait_for_timeout(500); R2 = P()
        check('HAD: no steerpoint, no POS problem', all(r['ref'] is None for r in R2['rows']) and 'POS' not in pg.inner_text('#sdpr'))
        pg.click('#sdso [data-sdmode=pos]'); pg.click('#sdso [data-sdsub=PB]'); pg.wait_for_timeout(500)
        check('POS PB: a wider area', pg.evaluate("()=>__app.seadPage.plan().area") > 7)
        pg.click('#sdso [data-sdsub=EOM]'); pg.wait_for_timeout(300)
        pg.select_option('#sdso select[data-sdref=s3]', '2'); pg.wait_for_timeout(400)
        check('a steerpoint chosen by hand stays', [r['ref'] for r in P()['rows'] if r['id'] == 's3'] == [2])
        # a SAM left out, a seat by hand, Azimuth
        pg.click('#sdth input[data-sdskip=s6]'); pg.wait_for_timeout(500); R3 = P()
        check('SA-6 left out: no shot on it, the others move up', not any(z['id'] == 's6' for z in R3['shots']) and {z['id']: z['seat'] for z in R3['shots'] if z['k'] == 1}.get('s3') == 0)
        pg.click('#sdth input[data-sdskip=s6]'); pg.wait_for_timeout(400)
        pg.select_option('#sdso select[data-sdseat=s2]', '3'); pg.wait_for_timeout(400)
        check('SA-8 given to #4 by hand', {z['id']: z['seat'] for z in P()['shots'] if z['k'] == 1}['s2'] == 3)
        pg.click('#sdso [data-sdsort=az]'); pg.wait_for_timeout(400); fa = {z['id']: z['seat'] for z in P()['shots'] if z['k'] == 1}
        check('Azimuth: SA-3, right of your route, to #2 or #4; SA-8 still #4 by hand %s' % fa, fa['s3'] in (1, 3) and fa['s2'] == 3)
        pg.click('#sdso [data-sdsort=prio]'); pg.wait_for_timeout(300)
        t85a = P()['rows'][0]['t85']
        pg.locator('#sdth input[data-sdk]').evaluate("e=>{e.value=100;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(500)
        check('first impact at 100%: at the entry into the ring', abs(P()['rows'][0]['t85'] - P()['rows'][0]['tin']) < 2000 and P()['rows'][0]['t85'] < t85a)
        pg.locator('#sdth input[data-sdk]').evaluate("e=>{e.value=85;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        # the package time: ROLEX +5 (late), LEEROY -5 (early), live as it moves
        r0 = P()['rows'][0]
        dt = lambda v: pg.locator('#sdth input[data-sddt]').evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}", v) or pg.wait_for_timeout(400)
        dt(300); r1 = P()['rows'][0]
        check('ROLEX +5: the times of the package 5 min later, live', abs(r1['tin'] - r0['tin'] - 300000) < 1500 and abs(r1['t85'] - r0['t85'] - 300000) < 1500)
        check('ROLEX +5: on the slider, the map and the scheme', 'ROLEX +5:00' in pg.inner_text('#sdth') and pg.inner_text('#sddtm') == 'ROLEX +5:00' and 'ROLEX +5:00' in pg.evaluate("()=>__app.seadPage.card().pkg"))
        if shots: pg.locator('#wp').screenshot(path=shots + '/sead-rolex.png')
        dt(-285); r2 = P()['rows'][0]
        check('LEEROY -4:45: 4 min 45 s earlier (15 s steps)', abs(r0['tin'] - r2['tin'] - 285000) < 1500 and 'LEEROY −4:45' in pg.inner_text('#sdth'))
        pg.click('#wp [data-sdview=sch]'); pg.wait_for_timeout(400)
        check('LEEROY on the scheme', 'LEEROY −4:45' in pg.inner_text('#sdsch'))
        if shots: pg.locator('#sdsch').screenshot(path=shots + '/sead-leeroy-sch.png')
        pg.click('#wp [data-sdview=map]'); pg.wait_for_timeout(500)
        pg.locator('#sdth input[data-sddt]').evaluate("e=>{e.value=0;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('on time: back to the plan, no label', abs(P()['rows'][0]['tin'] - r0['tin']) < 1000 and pg.locator('#sddtm').is_hidden())
        # out of range
        pg.evaluate("()=>{__sc.me.f.wps.forEach(p=>p.x=400);}"); re()
        check('far from the SAMs: out of range, a problem card with its fix', any(not z['ok'] for z in P()['shots']) and 'FIX' in pg.inner_text('#sdpr').upper())
        pg.evaluate("()=>{__sc.me.f.wps.forEach(p=>p.x=480);}"); re()
        # HARM tables
        msgs = []
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.evaluate("()=>{__sc.seat=1}"); re()
        pg.click('#wp [data-sdtab]'); pg.wait_for_timeout(1200)
        hv = pg.evaluate("()=>[0,1,2].map(t=>[0,1,2,3,4].map(n=>(__app.lines.find(l=>l.s=='HARM'&&l.k=='THREAT '+t+' '+n)||{}).v))")
        check('HARM tables, as #2: SA-3 missing, the box says where it goes (replacing a threat not of this mission), then it is written %s' % hv, msgs and 'SA-3' in msgs[0] and 'replaces' in msgs[0] and '0103' in sum(hv, []) and '0106' in sum(hv, []))
        # PPT
        cnt = lambda: pg.evaluate("()=>__app.lines.filter(l=>/^ppt_/.test(l.k)&&!/^0\\.000000, 0\\.000000/.test(l.v)).length")
        n0 = cnt(); msgs.clear(); pg.click('#wp [data-sdppt]'); pg.wait_for_timeout(1200); n1 = cnt()
        check('PPT: asked first, then the threats of the seat are pre-planned threats of the DTC (%d -> %d)' % (n0, n1), msgs and 'pre-planned' in msgs[0] and n1 > n0)
        # the cards
        if shots:
            for k in ('map', 'sch'):
                d = pg.evaluate("async k=>(await __app.seadPage.cardCanvas(k)).toDataURL()", k); open(shots + '/sead-card-%s.png' % k, 'wb').write(base64.b64decode(d.split(',')[1]))
        cd = pg.evaluate("()=>__app.seadPage.card()")
        check('the SEAD card data: your seat (#2), all the shots, the scheme and the events', cd['seatName'] == '#2' and len(cd['shots']) >= 3 and cd['sm']['prot'] and cd['sm']['rows'] and len(cd['ev']) > 5)
        k0 = pg.evaluate('()=>__app.KBLIB.length')
        pg.click('#wp [data-tabcard]')
        pg.wait_for_selector('dialog.tgdlg[open]', timeout=15000)
        check('Add card…: a dialog with the two cards (map, scheme)', pg.locator('dialog.tgdlg[open] .tgcard').count() == 2)
        pg.click('dialog.tgdlg[open] .tgcard[data-kind=sch]'); pg.click('dialog.tgdlg[open] [data-a=ok]')
        for _ in range(40):
            if pg.evaluate('()=>__app.KBLIB.length') >= k0 + 2: break
            pg.wait_for_timeout(250)
        check('...both added to the Kneeboard', pg.evaluate('()=>__app.KBLIB.length') == k0 + 2)
        st = pg.evaluate("()=>__app.seadPage.state()")
        check('the page state for the mission file', st['seat'].get('s2') == 3 and st['ref'].get('s3') == 2 and st['mode'] == 'pos' and st['k'] == 85 and st['dt'] == 0)
        pg.evaluate("()=>__app.seadPage.setState({k:'<b>',dt:'x',sort:{},seat:[],skip:'x',prot:null,sel:5,mode:'x',sub:'Q',view:7,ref:3})"); pg.wait_for_timeout(500)
        st = pg.evaluate("()=>__app.seadPage.state()")
        check('a broken state from a file is brought back to sane values', st['k'] == 85 and st['dt'] == 0 and st['sort'] == 'prio' and st['seat'] == {} and st['mode'] is None and st['sub'] is None and st['view'] == 'map' and st['ref'] == {})
        # the map: the parts not covered, the view kept from the scheme back to the map
        check('the map legend: not covered and before the first impact', 'not covered' in pg.inner_text('#sdmleg') and 'before the first impact' in pg.inner_text('#sdmleg'))
        zv = lambda: pg.evaluate("()=>{const p=document.querySelector('#sdmap .leaflet-proxy');const c=document.querySelector('#sdmap .leaflet-control-scale-line');return (p&&p.style.transform)+'|'+(c&&c.textContent)}")
        pg.locator('#sdmap .leaflet-control-zoom-in').click(); pg.wait_for_timeout(600); z1 = zv()
        pg.click('#wp [data-sdview=sch]'); pg.wait_for_timeout(400); pg.click('#wp [data-sdview=map]'); pg.wait_for_timeout(700)
        check('Scheme then Map: the zoom kept %s' % [zv(), z1], zv() == z1)
        pg.click('#wp [data-sdview=sch]'); pg.wait_for_timeout(400)
        hy = pg.evaluate("()=>document.querySelector('#sdmapw').closest('.wcard').querySelector('h3').getBoundingClientRect().top")
        px = pg.evaluate("async()=>(await __app.seadPage.cardCanvas('map')).dataset.px")
        check('Scheme shown: the card with the map still gets the map picture; the title does not move', px == '1' and abs(hy - pg.evaluate("()=>document.querySelector('#sdmapw').closest('.wcard').querySelector('h3').getBoundingClientRect().top")) < 0.5)
        pg.click('#wp [data-sdview=map]'); pg.wait_for_timeout(700)
        check('...the Map / Scheme buttons next to the title, the title in the same place', abs(hy - pg.evaluate("()=>document.querySelector('#sdmapw').closest('.wcard').querySelector('h3').getBoundingClientRect().top")) < 0.5)
        # the switch Launch outside the rings, the total covered
        check('the total covered of the time inside the rings', 'Covered' in pg.inner_text('#sdth .sdtot'))
        pg.click('#wp [data-sdout]'); pg.wait_for_timeout(500)
        check('Launch outside the rings: on, kept in the state', pg.evaluate("()=>__app.seadPage.state().out") is True)
        pg.click('#wp [data-sdout]'); pg.wait_for_timeout(500)
        # Map filters on the Weapons pages: the Map page gets its own back
        mf = lambda: pg.evaluate("()=>[...document.querySelectorAll('#mpbar input[data-k]')].map(i=>i.dataset.k+':'+(i.checked?1:0)).join(',')")
        f0 = mf()
        pg.click('#wp [data-sdpf]'); pg.wait_for_timeout(500); lab = pg.inner_text('#wp [data-sdpf]')
        check('Map filters on SEAD: the next choice (%s)' % lab, lab == 'No filters')
        pg.click('[data-t=mp]'); pg.wait_for_timeout(900)
        check('...the Map page: its own filters again', mf() == f0 and len(f0) > 10)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(1200)
        check('...back on Weapons: its choice again (%s)' % pg.inner_text('#wp [data-sdpf]'), pg.inner_text('#wp [data-sdpf]') == 'No filters')
        pg.click('#wp [data-sdpf]'); pg.click('#wp [data-sdpf]'); pg.click('#wp [data-sdpf]'); pg.wait_for_timeout(500)
        check('...round to the Map filters', pg.inner_text('#wp [data-sdpf]') == 'Map filters' and mf() == f0)
        # Add all cards of the Kneeboard: the SEAD page makes its cards on screen (Weapons opened behind a cover), so the map card has its map
        pg.click('[data-t=kn]'); pg.wait_for_timeout(600); pg.click('#kball'); pg.wait_for_selector('.kball .tgcard', timeout=30000); pg.wait_for_timeout(300)
        lab = pg.locator('.kball .tgcard').all_inner_texts()
        sd = pg.evaluate("()=>{const c=document.querySelector('.kball .tgcard canvas'),d=c.getContext('2d').getImageData(20,70,160,110).data,s=new Set();for(let i=0;i<d.length;i+=16)s.add(d[i]>>4<<8|d[i+1]>>4<<4|d[i+2]>>4);return s.size}")
        check('Add all cards: the two SEAD cards, the map card with its map (%s, %d colours), back on the Kneeboard' % (lab, sd), lab[:2] == ['SEAD · With the map', 'SEAD · With the scheme'] and sd > 12 and pg.locator('.tab.on[data-t=kn]').count() == 1 and pg.locator('#kbcover').count() == 0)
        n0 = pg.locator('.kball .tgcard.on').count(); t0 = pg.inner_text('.kball .tgall')
        pg.click('.kball .tgall'); pg.wait_for_timeout(100); n1 = pg.locator('.kball .tgcard.on').count(); t1 = pg.inner_text('.kball .tgall'); off = 'nil' in pg.get_attribute('.kball [data-a=ok]', 'class')
        pg.click('.kball .tgall'); pg.wait_for_timeout(100)
        check('...every card chosen at first; Select none / Select all (%d %s, %d %s)' % (n0, t0, n1, t1), n0 == len(lab) and t0 == 'Select none' and n1 == 0 and t1 == 'Select all' and off and pg.locator('.kball .tgcard.on').count() == n0)
        pg.click('.kball [data-a=no]'); pg.wait_for_timeout(300)
        check('no page errors', not errs)
        if errs: print(errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
