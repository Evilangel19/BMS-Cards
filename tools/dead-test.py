"""Weapons > HARM > DEAD with a made-up DEAD flight (2-ship, then 4-ship), its target SAM (the task steerpoint's), a TELAR SAM near it and a made-up missile:
the switch SEAD / DEAD, the target card (ALIC, rings, radars, location), the ECM slider, the TELAR warning, the altitude note and its info, the tactics
(HARM standoff, Hunter-Killer, Bombs / Maverick), the orbit Left / Right, the roles of each seat (4-ship too), the map, the scheme, the steps, the nav
offsets of the anchors (Add as a PPT, Write OA1 / OA2 to the DTC, a steerpoint not in the flight plan), the Bombs buttons, the DEAD card of the
Kneeboard, the mission keeps the page. No BMS files. Usage: CSP=1 python3 tools/dead-test.py [screenshot_dir]"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools')
import dialogs
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = 8965
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
HARM = [[202, 203, 204, 205, 210], [402, 403, 404, 405, 410], [106, 608, 111, 615, 117]]
KMF = 3280.84
RT = [(300, 500), (380, 500), (470, 500), (465, 510)]  # (north, east) km: STPT 1-4, STPT 4 on the SA-8
INI = '\r\n'.join(['[STPT]'] + ['target_%d=%.6f, %.6f, -20000.000000, 0' % (i, n * KMF, e * KMF) for i, (n, e) in enumerate(RT)] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['[HARM]'] + ['THREAT %d %d=%04d' % (t, n, HARM[t][n]) for t in range(3) for n in range(5)] + ['MODE=1', 'SUBMODE=1', 'TER=0'] +
                  ['[NAV OFFSETS]'] + ['OA%d-%d=0,0,0' % (a, n) for n in range(1, 25) for a in (1, 2)] + [''])
CTX = """()=>{const T0=10*3600000,K=1.852,leg=(a,b,kt)=>Math.hypot(a.x-b.x,a.y-b.y)/K/kt*3600000;
 const P=[{x:500,y:300,z:2500,act:0},{x:500,y:380,z:2500,act:0},{x:500,y:470,z:2500,act:16},{x:503,y:300,z:2500,act:0}];
 let t=T0;P.forEach((p,i)=>{if(i)t+=leg(P[i-1],p,480);p.arr=t;p.dep=0});
 const me={key:'1',name:'Weasel 1',ac:'F-16CM',n:2,mission:'DEAD',tot:'10:12:00',f:{wps:P},pkgNo:7};
 const sams=[{id:'s6',x:500,y:470,rng:25,det:60,name:'SA-6',code:106,telar:-1,fcr:true,spotted:true,tgt:true,d:0},
   {id:'s8',x:510,y:465,rng:12,det:30,name:'SA-8',code:608,telar:3,fcr:true,spotted:false,tgt:false,d:6}];
 window.__dc={ok:true,me,sams,target:'s6',seat:0,harms:[2,2]};
 const m={name:'AGM-88',range:{alts:[0,50000],vels:[0,3000],tgtAlts:[0,50000],table:[[[151900,151900],[151900,151900]],[[151900,151900],[151900,151900]]],mult:1},loft:null};
 __app.deadPage._test({ctx:()=>window.__dc,harm:async()=>({m,v:{mode:'pos',sub:'EOM'}})});}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1760, 'height': 1150}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        # the threat list of Ppt.ini: 26 weapon systems, then the other types
        pg.evaluate("async()=>{const D=(await import('/app/js/data/index.js')).default;D.ppt=[...Array.from({length:26},(_,i)=>['SAM'+i,60000,'SAM '+i]),['REF',0.1,'Reference'],['IP',0.1,'Initial point']]}")
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(500); pg.click('#wp [data-mode=harm]'); pg.wait_for_timeout(700)
        check('HARM: SEAD / DEAD; with no DEAD flight, DEAD shows the HARM standoff shot of the HARM page', pg.locator('#wp .hsub [data-hsub]').all_inner_texts() == ['SEAD', 'DEAD'] and pg.locator('#wp #wpharm').count() == 1)
        pg.evaluate(CTX)
        re = lambda: (pg.click('#wp [data-hsub=sead]'), pg.wait_for_timeout(300), pg.click('#wp [data-hsub=dead]'), pg.wait_for_timeout(1300))
        re()
        P = lambda: pg.evaluate("()=>{const P=__app.deadPage.plan();return P&&{R:P.R,Recm:P.Recm,Rdet:P.Rdet,Ra:P.Ra,dL:P.dL,rTh:P.rTh,tL:P.tL,tTurn:P.tTurn,tImp:P.tImp,dir:P.dir,warn:P.warn,seats:P.seats.map(s=>({i:s.i,role:s.role,tl:s.tl,imp:s.imp})),oa:P.oa,Rb:P.Rb,rating:P.rating,slow:P.slow,arc0:P.arc&&P.arc[1],turn:P.turn,s:{x:500,y:470}}}")
        A = P()
        check('a DEAD flight: the DEAD page, not the HARM page', pg.locator('#wpdead .dg').count() == 1 and pg.locator('#wp #wpharm').count() == 0 and 'DEAD flight against' in pg.inner_text('#wp .hsub'))
        tg = pg.inner_text('#ddtg')
        check('the target: the SA-6 of the task steerpoint, ALIC 106 in T3/1, the rings, the radars, the location known', 'SA-6' in tg and '106' in tg and 'T3/1' in tg and 'SEARCH RADAR' in tg.upper() and 'alive' in tg and 'known' in tg)
        check('...the WEZ with ECM on at 70%% (%.1f of %.1f nm)' % (A['Recm'], A['R']), abs(A['Recm'] - A['R'] * 0.7) < 0.01 and '70%' in tg)
        check('...no TELAR warning for the SA-6', pg.locator('#ddtg .ddtel').count() == 0)
        check('HARM standoff by default (location known): two shooters, #2 8 s after #1', A['seats'][0]['role'] == 'shooter' and abs(A['seats'][1]['tl'] - A['seats'][0]['tl'] - 8000) < 1)
        check('...the launch outside the WEZ, within the HARM range; the impact on the arc', A['R'] < A['dL'] <= A['rTh'] and A['tImp'] > A['tTurn'] and not A['warn'])
        check('the altitude: 25 000 ft is not optimal, a yellow note; the info hidden until "!"', pg.locator('#ddal .ddnote').count() == 1 and 'not optimal' in pg.inner_text('#ddal') and not pg.locator('#ddal .ddpop').is_visible())
        pg.click('#ddal [data-ddinfo]'); pg.wait_for_timeout(200)
        check('...the "!" shows the blocks of the manual', pg.locator('#ddal .ddpop').is_visible() and 'ABOVE 30 000 FT' in pg.inner_text('#ddal .ddpop'))
        st = pg.inner_text('#ddst')
        check('the steps: the launches, the turn, the impacts, the egress; only your launch green', 'launch' in st and 'turn left' in st and '◆' in st and 'egress' in st and pg.locator('#ddst li.sdme').count() == 1 and 'launch' in pg.inner_text('#ddst li.sdme'))
        check('the shot: the missile, the range, the margin outside the WEZ; only the launch green', 'AGM-88' in pg.inner_text('#dddt') and 'YOUR MARGIN' in pg.inner_text('#dddt').upper() and pg.locator('#dddt .sdme').count() == 1 and pg.locator('#dddt .sdok').count() == 0)
        check('the map legend: the HARM range, where its seeker opens, the footprint of the submode', 'HARM range' in pg.inner_text('#ddleg') and 'seeker opens' in pg.inner_text('#ddleg') and 'footprint (EOM)' in pg.inner_text('#ddleg'))
        tf = lambda: pg.evaluate("()=>{const p=document.querySelector('#ddmap .leaflet-proxy');const c=document.querySelector('#ddmap .leaflet-control-scale-line');return (p&&p.style.transform)+'|'+(c&&c.textContent)}")
        pg.locator('#ddmap .leaflet-control-zoom-in').click(); pg.wait_for_timeout(600); zz = tf()
        pg.evaluate("()=>__app.harmTab.render()"); pg.wait_for_timeout(700)
        pg.click('#ddtc [data-ddmode=had]'); pg.wait_for_timeout(500); pg.click('#ddtc [data-ddmode=pos]'); pg.wait_for_timeout(500)
        check('the zoom chosen stays when the tab is drawn again and when a parameter changes', tf() == zz)
        pg.click('#wp .wtabs [data-mode=popup]'); pg.wait_for_timeout(700); pg.click('#wp .wtabs [data-mode=harm]'); pg.wait_for_timeout(1500)
        check('...and when you come back from another tab (Pop-up) %s' % [tf(), zz], tf() == zz)
        check('the target list in the colours of the program', pg.evaluate("()=>getComputedStyle(document.querySelector('#ddtg select')).backgroundColor") == 'rgb(11, 15, 20)')
        check('the map: the rings with their names, the plan, the impact at the SAM and you on the arc then', pg.locator('#ddmap .sdsamm').count() == 1 and pg.locator('#ddmap .sdimp').count() == 2 and 'ON THE ARC' in pg.inner_text('#ddmap') and 'TURN LEFT' in pg.inner_text('#ddmap') and 'WEZ 13 NM' in pg.inner_text('#ddmap'))
        check('the roles: a tile for each seat, #1 LEAD with the YOU badge', pg.locator('#ddro .ddtile').count() == 2 and pg.locator('#ddro .ddtile.me .you').count() == 1 and 'LEAD' in pg.inner_text('#ddro .ddtile.me'))
        if shots: pg.locator('#wp').screenshot(path=shots + '/dead-hs.png')
        # the orbit
        pg.evaluate("()=>document.querySelectorAll('#ddro .ddtile, #ddal .ddnote').forEach(e=>e.dataset.old=1)")
        pg.click('#ddtc [data-ddside=L]'); pg.wait_for_timeout(500); B = P()
        check('orbit Left: the other way round the SAM, the turn the other way', B['dir'] == -1 and 'turn right' in pg.inner_text('#ddst'))
        check('...the roles and the altitude note are not animated again (no flicker)', pg.evaluate("()=>[...document.querySelectorAll('#ddro .ddtile, #ddal .ddnote')].every(e=>e.dataset.old||!e.classList.contains('fxin'))") and pg.locator('#ddro .ddtile').count() == 2)
        pg.click('#ddtc [data-ddside=R]'); pg.wait_for_timeout(300)
        # the ECM slider
        z0 = pg.evaluate("()=>{const m=document.querySelector('#ddmap');return m&&m.querySelector('.leaflet-map-pane').style.transform}")
        pg.locator('#ddtg input[data-ddecm]').evaluate("e=>{e.value=50;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('the ECM slider while it moves: 50% -> the WEZ with ECM on smaller at once, the slider kept', abs(P()['Recm'] - A['R'] * 0.5) < 0.01 and '50%' in pg.inner_text('#ddtg') and pg.locator('#ddtg input[data-ddecm]').input_value() == '50')
        check('...the zoom of the map kept', pg.evaluate("()=>document.querySelector('#ddmap .leaflet-map-pane').style.transform") == z0)
        pg.locator('#ddtg input[data-ddecm]').evaluate("e=>{e.value=70;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        # a role by hand
        pg.click('#ddro [data-ddrole="1:cover"]'); pg.wait_for_timeout(500)
        check('#2 as cover: one shooter, a cover arc in the steps', [s['role'] for s in P()['seats']] == ['shooter', 'cover'] and 'cover' in pg.inner_text('#ddst'))
        # the TELAR SAM
        pg.select_option('#ddtg select[data-ddtgt]', 's8'); pg.wait_for_timeout(600)
        tg = pg.inner_text('#ddtg')
        check('the SA-8: the red TELAR warning (3 alive), location unknown -> Hunter-Killer', pg.locator('#ddtg .ddtel').count() == 1 and '3 alive' in tg and 'unknown' in tg and pg.locator('#ddtc [data-ddtac=hk].on').count() == 1)
        # Hunter-Killer
        C = P()
        check('Hunter-Killer: #1 killer, #2 hunter; the anchors as OA1 / OA2 of STPT 3', [s['role'] for s in C['seats']] == ['killer', 'hunter'] and C['oa'] and C['oa']['n'] == 3)
        check('...the bait inside the WEZ, on the WEZ with ECM on (%.1f of %.1f nm)' % (C['Rb'], C['R']), abs(C['Rb'] - C['Recm']) < 0.01 and C['Rb'] < C['R'] and 'ECM on' in pg.inner_text('#ddst'))
        check('...green only for your attack: the steps and the killer card', pg.locator('#ddst li.sdme').count() == 1 and 'attack' in pg.inner_text('#ddst li.sdme') and pg.locator('#dddt .sdme').count() == 1)
        oa = pg.inner_text('#ddoa')
        check('...the nav offsets in the right column, from STPT 3, Add buttons for the anchors, Write OA1 · OA2', pg.locator('.wpr #ddoa .oab').count() == 2 and pg.locator('#ddoa [data-ddadd]').count() == 2 and 'Write OA1' in oa and 'type them on board' in oa and 'FROM STPT 3' in oa.upper())
        check('...the map: the anchors, the defence dashed', pg.locator('#ddmap .ddanc').count() == 2)
        if shots: pg.locator('#wp').screenshot(path=shots + '/dead-hk.png')
        msgs = []
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        cnt = lambda: pg.evaluate("()=>__app.lines.filter(l=>/^ppt_/.test(l.k)&&!/^0\\.000000, 0\\.000000/.test(l.v)).length")
        check('...the PPT types for the anchors: only the ones that are not SAMs', pg.evaluate("()=>[...document.querySelectorAll('#ddoa select[data-ddpptt=oa1] option')].map(o=>o.value)") == ['REF', 'IP'])
        pg.select_option('#ddoa select[data-ddpptt=oa1]', 'IP'); pg.wait_for_timeout(300)
        n0 = cnt(); pg.click('#ddoa [data-ddadd=oa1]'); pg.wait_for_timeout(800)
        check('+ PPT of anchor H: asked, then a PPT of the type chosen, no ring (%d -> %d)' % (n0, cnt()), msgs and 'anchor H' in msgs[-1] and 'Initial point' in msgs[-1] and cnt() == n0 + 1 and pg.evaluate("()=>__app.lines.some(l=>/^ppt_/.test(l.k)&&/, IP$/.test(l.v.trim()))"))
        pg.click('#ddoa [data-ddadd=oa1]'); pg.wait_for_timeout(800)
        check('...twice: not added again', cnt() == n0 + 1)
        pg.locator('#ddoa input[data-ddel=oa1]').evaluate("e=>{e.value=1500;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
        check('the OA1 elevation slider (500 ft steps): its block follows it', '1,500 FT' in pg.inner_text('#ddoa1v') and pg.locator('#ddoa input[data-ddel=oa1]').input_value() == '1500' and pg.locator('#ddoa input[data-ddel=oa1]').get_attribute('step') == '500')
        msgs.clear(); pg.click('#ddoa [data-ddoaw]'); pg.wait_for_timeout(800)
        v1 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA1-3')||{}).v")
        v2 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA2-3')||{}).v")
        b1 = C['oa']['oa1']
        check('Write OA1 · OA2: asked, then OA1-3 / OA2-3 = bearing, range ft, elevation ft (%s, %s)' % (v1, v2), msgs and 'STPT 3' in msgs[0] and v1 == '%d,%d,1500' % (b1['brg'], b1['rngFt']) and v2 and v2.endswith(',0'))
        # the scheme
        pg.click('#wp [data-ddview=sch]'); pg.wait_for_timeout(400)
        check('Scheme: a lane for each seat with its role', pg.locator('#ddsch svg.sdscv').count() == 1 and 'HUNTER' in pg.text_content('#ddsch svg') and 'KILLER' in pg.text_content('#ddsch svg') and not pg.locator('#ddmap').is_visible())
        pg.click('#wp [data-ddview=map]'); pg.wait_for_timeout(500)
        # 4-ship
        pg.evaluate("()=>{__dc.me.n=4;__dc.harms=[2,2,2,2];__dc.seat=2}"); re()
        R4 = [s['role'] for s in P()['seats']]
        check('4-ship: four tiles, the lead pair killer and hunter, the element cover, you #3 %s' % R4, pg.locator('#ddro .ddtile').count() == 4 and R4 == ['killer', 'hunter', 'cover', 'cover'] and 'ELEMENT' in pg.inner_text('#ddro .ddtile.me') and pg.locator('#ddro .ddtile').nth(0).locator('[data-ddrole]').count() == 2)
        pg.click('#ddro [data-ddrole="2:hunter"]'); pg.wait_for_timeout(400)
        check('...#3 hunter: #4 killer (the second pair)', [s['role'] for s in P()['seats']][2:] == ['hunter', 'killer'])
        pg.click('#ddro [data-ddrole="0:hunter"]'); pg.wait_for_timeout(400)
        check('...#1 hunter: #2 killer, the roles of a pair swapped', [s['role'] for s in P()['seats']][:2] == ['hunter', 'killer'])
        pg.click('#ddro [data-ddrole="3:hunter"]'); pg.wait_for_timeout(300); pg.click('#ddro [data-ddrole="2:killer"]'); pg.wait_for_timeout(400)
        check('...a role chosen by hand stays when its partner changes (#4 hunter kept)', [s['role'] for s in P()['seats']][2:] == ['killer', 'hunter'])
        # bombs
        pg.click('#ddtc [data-ddtac=bomb]'); pg.wait_for_timeout(500)
        check('Bombs / Maverick: killer, hunter, cover; the buttons of the Weapons pages', [s['role'] for s in P()['seats']] == ['killer', 'hunter', 'cover', 'cover'] and pg.locator('#dddt [data-ddopen]').all_inner_texts() == ['Pop-up', 'HADB', 'TOSS (loft)'])
        # the card
        cd = pg.evaluate("()=>__app.deadPage.card()")
        check('the DEAD card data: your role, the TELAR, the altitude, the steps, the offsets, the flight', cd['seatName'].startswith('#3') and cd['telar'] == 3 and cd['alt'] and len(cd['steps']) >= 3 and cd['oa'] and len(cd['seats']) == 4 and cd['box'][0][0] == 'YOUR ROLE')
        if shots:
            for k in ('map', 'sch'):
                d = pg.evaluate("async k=>(await __app.deadPage.cardCanvas(k)).toDataURL()", k); open(shots + '/dead-card-%s.png' % k, 'wb').write(base64.b64decode(d.split(',')[1]))
        pg.click('#wp [data-ddview=sch]'); pg.wait_for_timeout(400)
        px = pg.evaluate("async()=>(await __app.deadPage.cardCanvas('map')).dataset.px")
        check('the scheme shown: the card with the map still gets the map picture, the scheme stays', px == '1' and pg.locator('#ddsch svg').is_visible() and not pg.locator('#ddmap').is_visible())
        pg.click('#wp [data-ddview=map]'); pg.wait_for_timeout(600)
        k0 = pg.evaluate('()=>__app.KBLIB.length')
        pg.click('#wp [data-ddcard]')
        pg.wait_for_selector('dialog.tgdlg[open]', timeout=15000)
        check('Add card…: a dialog with the two cards (map, scheme)', pg.locator('dialog.tgdlg[open] .tgcard').count() == 2)
        pg.click('dialog.tgdlg[open] .tgcard[data-kind=sch]'); pg.click('dialog.tgdlg[open] [data-a=ok]')
        for _ in range(40):
            if pg.evaluate('()=>__app.KBLIB.length') >= k0 + 2: break
            pg.wait_for_timeout(250)
        check('...both added to the Kneeboard', pg.evaluate('()=>__app.KBLIB.length') == k0 + 2)
        pg.click('#dddt [data-ddopen=hadb]'); pg.wait_for_timeout(900)
        check('HADB: opens the HADB page of Weapons with the steerpoint on the SA-8 as its target (%s)' % pg.evaluate("()=>__app.wpPage&&__app.wpPage.state().tgt"), pg.locator('#wp .wtabs [data-mode=hadb].on').count() == 1 and pg.evaluate("()=>__app.wpPage.state().tgt") == 'r:4')
        pg.click('#wp .wtabs [data-mode=harm]'); pg.wait_for_timeout(1200)
        st = pg.evaluate("()=>__app.deadPage.state()")
        check('the page state for the mission file', st['tactic'] == 'bomb' and st['tgt'] == 's8' and st['side'] == 'R' and st['ecm'] == 70)
        pg.evaluate("()=>__app.deadPage.setState({tactic:'x',side:5,ecm:'<b>',roles:[],tgt:{},mode:'q',sub:'Z',view:3})")
        st = pg.evaluate("()=>__app.deadPage.state()")
        check('a broken state from a file is brought back to sane values', st['tactic'] is None and st['side'] == 'R' and st['ecm'] == 70 and st['roles'] == {} and st['tgt'] is None and st['mode'] is None and st['view'] == 'map')
        check('no page errors', not errs)
        if errs: print(errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
