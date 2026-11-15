"""Weapons > Target (the target picture): the targets made from the DTC, the plan of the objective, Fill from the datacard, the filters, a symbol drawn by hand,
a pasted screenshot, the picture of the Map page, the Kneeboard cards and the datacard. No BMS files: a small DTC and made-up objective files.
Usage: CSP=1 python3 tools/tgtpage-test.py [screenshot_dir]"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = 8961
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
FT = 3280.84
CX, CY = 600.0, 700.0  # the objective (campaign km)
ft = lambda x, y: (y * FT, x * FT)
def stpt(x, y, z, name):
    n, e = ft(x, y); return '%.6f, %.6f, %.6f, -1, %s' % (n, e, -z, name)
INI = '\n'.join(['[STPT]',
    'target_80=' + stpt(CX - 0.09, CY + 0.04, 312, 'Bunker'),
    'target_81=' + stpt(CX - 0.16, CY + 0.12, 312, 'Bunker'),
    'wpntarget_0=' + stpt(CX + 0.12, CY - 0.04, 310, 'Fuel tank'),
    'wpntarget_1=0.000000, 0.000000, 0.000000, -1, Not set',
    'target_0=0.000000, 0.000000, 0.000000, 0, 0',
    ''])
FEATS = [('Bunker', 120, -160), ('Bunker', 120, -90), ('Bunker', 40, -160), ('Bunker', 40, -90), ('Warehouse', -70, -140), ('Warehouse', -70, -40),
         ('Fuel tank', -40, 120), ('Fuel tank', -40, 170), ('Admin building', 150, 140), ('Comms tower', 90, 190), ('AAA site', -180, 190)]
TD = """f=>{const FT=3280.84,cx=%f,cy=%f;window.__targetData={objectives:async()=>[{id:1182,name:'Depot #6',type:10,n:cy*FT,e:cx*FT,ocd:1},{id:7,name:'Okchon',type:8,n:(cy+0.5)*FT,e:cx*FT,ocd:2}],
  features:async o=>f.map(([nm,dn,de],i)=>({i,name:nm,value:5,n:(cy+dn/1000)*FT,e:(cx+de/1000)*FT}))}}""" % (CX, CY)
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce')
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'status of 404' not in m.text and errs.append(m.text))  # 404: app/js/data/local, the game data made on a PC with BMS
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate(TD, [list(f) for f in FEATS])
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(400)
        check('the Weapons page has a Target tab after HARM', pg.locator('#wp .wtabs button').all_inner_texts()[-2:] == ['HARM', 'Target'])
        pg.click('#wp .wtabs [data-mode=tgt]'); pg.wait_for_timeout(900)
        rows = pg.locator('.tgp .tgrowt').all_inner_texts()
        check('one target for the three DTC points on the depot (the town next to it is not a target): %s' % rows, len(rows) == 1 and 'Depot #6' in rows[0] and '3 DMPI' in rows[0])
        check('the apply buttons of the attack are hidden on the Target tab', pg.evaluate("()=>document.body.classList.contains('onharm')"))
        T = lambda js: pg.evaluate('()=>{const t=__app.ST.tgPage._t;return (' + js + ')}')
        dark = lambda: pg.evaluate("()=>{const c=document.querySelector('.tgp canvas'),d=c.getContext('2d').getImageData(c.width/2-200,c.height/2-100,400,200).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i];return s/(d.length/4)}")
        pg.wait_for_timeout(400)
        check('the plan of the objective is drawn (the picture is not black): %.0f' % dark(), dark() > 40)
        check('the header names the STPTs of the target', T("t.list()[0].refs.join(',')") == 'STPT 81,STPT 82,WPN 1')
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-plan.png')
        pg.click('.tgp .tgfill'); pg.wait_for_timeout(300)
        check('Fill from the datacard: the DMPIs of the DTC with their STPT', [d['ref'] for d in T('t.dmpiList()')] == ['TGT STPT 81', 'TGT STPT 82', 'WPN TGT 1'])
        check('...the source line and the chips that hide each part', 'DMPI' in pg.inner_text('.tgp .tgsrc') and pg.locator('.tgp .tgshow button').count() == 6)
        check('...the DMPI boxes show the coordinates', all(d['ll'] for d in T('t.dmpiList()')))
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-fill.png'); pg.screenshot(path=shots + '/tgt-page.png', full_page=True)
        for f in ('ir', 'r80', 'none', 'recon'):
            pg.click('.tgp [data-seg=filt] [data-v=%s]' % f); pg.wait_for_timeout(150)
        if shots:
            pg.click('.tgp [data-seg=filt] [data-v=r80]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-r80.png'); pg.click('.tgp [data-seg=filt] [data-v=recon]')
        # a callout by hand
        cb = pg.locator('.tgp canvas').bounding_box()
        pt = lambda u, v: (cb['x'] + cb['width'] * (10 + u * 1080) / 1100, cb['y'] + cb['height'] * (122 + v * 520) / 850)
        pg.click('.tgp [data-tool=callout]'); pg.mouse.click(*pt(0.62, 0.6)); pg.mouse.click(*pt(0.75, 0.75)); pg.wait_for_timeout(150)
        pg.fill('.tgp .tged input', 'fuel storage'); pg.press('.tgp .tged input', 'Enter'); pg.wait_for_timeout(150)
        check('a callout drawn by hand, in capitals', T("t.state().ann.plan.map(a=>a.k+':'+a.t).join()") == 'callout:FUEL STORAGE')
        pg.click('.tgp [data-tool=select]')
        # page 2
        pg.click('.tgp [data-seg=page] [data-v=t]'); pg.wait_for_timeout(300)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-text.png')
        pg.click('.tgp [data-seg=page] [data-v=g]')
        pg.click('.tgp [data-seg=pst] [data-v=paper]'); pg.wait_for_timeout(200)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-paper.png')
        pg.click('.tgp [data-seg=pst] [data-v=prog]')
        # a pasted screenshot
        pg.evaluate("""()=>new Promise(r=>{const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d');g.fillStyle='#456';g.fillRect(0,0,800,500);g.fillStyle='#ddd';g.fillRect(300,200,120,60);
          c.toBlob(b=>{const dt=new DataTransfer();dt.items.add(new File([b],'s.png',{type:'image/png'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));setTimeout(r,500)})})""")
        check('Ctrl+V puts a screenshot as the picture', T('t.state().view') == 'shot' and T('!!t.state().shot'))
        check('...the symbols drawn on the plan stay on the plan', T('t.state().ann.shot.length') == 0 and T('t.state().ann.plan.length') == 1)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-shot.png')
        # the Map page, framed and captured
        pg.click('.tgp [data-seg=view] [data-v=map]'); pg.wait_for_timeout(200)
        check('Map background: the LEVELS menu of the Map page is in the bar of the picture', pg.locator('.tgp .tglev #mpbaseb').count() == 1)
        pg.click('.tgp .tglev #mpbaseb'); pg.wait_for_timeout(300)
        check('...it opens over the picture', pg.locator('.tgp .tglev #mpbase').is_visible())
        pg.click('.tgp .tglev #mpbaseb'); pg.wait_for_timeout(300)
        pg.click('.tgp .tgframe'); pg.wait_for_timeout(2500)
        check('...the canvases of the map are not painted black by the page (the base map shows)', pg.evaluate("()=>[...document.querySelectorAll('.tgp .tgmap canvas')].every(c=>getComputedStyle(c).backgroundColor!='rgb(0, 0, 0)')"))
        check('Frame on the map: the map of the Map page with its frame, without the angle', pg.locator('.tgp .tgmap #mpmap').count() == 1 and pg.locator('#mpfr').count() == 1 and pg.locator('#mpang').count() == 0)
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-frame.png')
        pg.click('#mpcap'); pg.wait_for_timeout(4000)
        g = T('t.state().map&&t.state().map.geo')
        check('Capture: the picture of the map comes back with its place on the ground', T('!!(t.state().map&&t.state().map.c)') and g is not None)
        if g:
            w = (g['u'][0] ** 2 + g['u'][1] ** 2) ** 0.5 / 1.852
            cu = pg.evaluate("([g,x,y])=>{const a=g.u[0],b=g.v[0],c=g.u[1],d=g.v[1],det=a*d-b*c,px=x-g.o[0],py=y-g.o[1];return [(d*px-b*py)/det,(-c*px+a*py)/det]}", [g, CX, CY])
            check('...about 10 NM wide (%.1f NM), the target in the middle (%.2f, %.2f)' % (w, cu[0], cu[1]), 8 < w < 12.5 and abs(cu[0] - 0.5) < 0.06 and abs(cu[1] - 0.5) < 0.06)
        check('...the map goes back to the Map page and the picture is shown', pg.locator('.tgp .tgmap #mpmap').count() == 0 and T("t.state().view") == 'map')
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-map.png')
        # Kneeboard and datacard
        n0 = pg.evaluate('()=>__app.KBLIB.length')
        pg.click('.tgp .tgkb'); pg.wait_for_timeout(600)
        check('Add card: a window with the three cards, two of them chosen', pg.locator('.tgdlg .tgcard').count() == 3 and pg.locator('.tgdlg .tgcard.on').count() == 2)
        if shots: pg.locator('.tgdlg').screenshot(path=shots + '/tgt-cards.png')
        pg.click('.tgdlg .tgcard >> nth=2'); pg.click('.tgdlg [data-a=ok]'); pg.wait_for_timeout(1500)
        check('...three cards are in the Kneeboard (%d)' % (pg.evaluate('()=>__app.KBLIB.length') - n0), pg.evaluate('()=>__app.KBLIB.length') - n0 == 3)
        if shots:
            for i, k in enumerate('gtd'):
                d = pg.evaluate("k=>__app.ST.tgPage._t.card(k).toDataURL()", k); open(shots + '/tgt-card-%s.png' % k, 'wb').write(base64.b64decode(d.split(',')[1]))
        pg.click('.tgp .tgdc'); pg.wait_for_timeout(300)
        check('Put on datacard: first the crop frame of the datacard (its shape on the picture)', pg.locator('.tgp .tgcropbar').is_visible() and 'Datacard format' in pg.inner_text('.tgp .tgcropn'))
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-crop.png')
        cb = pg.locator('.tgp canvas').bounding_box()
        pg.mouse.move(*pt(0.5, 0.5)); pg.mouse.down(); pg.mouse.move(*pt(0.7, 0.5), steps=5); pg.mouse.up()
        cr = T('t.crop()')
        check('...the frame is dragged to the right (u %.2f)' % cr['u'], cr['u'] > 0.45)
        pg.mouse.move(*pt(0.6, 0.5)); pg.mouse.wheel(0, -300); pg.wait_for_timeout(200)
        check('...the wheel makes it smaller (w %.2f -> %.2f)' % (cr['w'], T('t.crop().w')), T('t.crop().w') < cr['w'])
        pg.click('.tgp .tgcropok'); pg.wait_for_timeout(300)
        check('...then the picture is the map screenshot of the datacard (564 x 752 shape)', pg.evaluate('()=>{const c=__app.ST.MAPSHOT;return c&&Math.abs(c.width/c.height-564/752)<0.01}') and not pg.locator('.tgp .tgcropbar').is_visible())
        # names, the × of a DMPI box, the × of a target
        pg.click('.tgp [data-seg=view] [data-v=plan]'); pg.wait_for_timeout(300)
        check('Names: on (green), the names of the DMPIs; All shows them all', pg.evaluate("()=>!document.querySelector('.tgp .tgnames').classList.contains('g')"))
        pg.click('.tgp [data-seg=nscope] [data-v=all]'); pg.wait_for_timeout(200)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-names.png')
        pg.once('dialog', lambda d: d.accept())
        bx = pg.evaluate("()=>{const t=__app.ST.tgPage._t;return t.boxX(2)}")
        pg.mouse.click(cb['x'] + cb['width'] * bx[0] / 1100, cb['y'] + cb['height'] * bx[1] / 850); pg.wait_for_timeout(600)
        check('the × of DMPI 3 deletes WPN TGT 1 from the DTC', T("t.list()[0].dmpis.map(d=>d.ref).join()") == 'TGT STPT 81,TGT STPT 82' and 'not set' in pg.evaluate("()=>__app.lines.find(l=>l.k=='wpntarget_0').v").lower())
        pg.once('dialog', lambda d: d.accept())
        pg.click('.tgp .tgrowt .tgx'); pg.wait_for_timeout(600)
        check('the × of the target deletes its TGT steerpoints from the DTC: the list is empty', T('t.list().length') == 0 and pg.evaluate("()=>__app.lines.find(l=>l.k=='target_80').v").startswith('0'))
        # the other tabs take the map back
        pg.click('#wp .wtabs [data-mode=popup]'); pg.wait_for_timeout(500)
        check('back to Pop-up: the apply buttons are shown again', not pg.evaluate("()=>document.body.classList.contains('onharm')"))
        check('no page error: %s' % errs[:3], not errs)
    srv.terminate()
except Exception as e:
    srv.terminate(); raise
sys.exit(0 if ok else 1)
