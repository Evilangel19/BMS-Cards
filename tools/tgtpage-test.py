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
  features:async o=>f.map(([nm,dn,de],i)=>({i,name:nm,value:5,n:(cy+dn/1000)*FT,e:(cx+de/1000)*FT})),
  airfield:async o=>o.ocd!=1?null:{rwy:[{c:[[cy-0.27,cx-0.25],[cy-0.27,cx+0.25],[cy-0.3,cx+0.25],[cy-0.3,cx-0.25]].map(([n,e])=>[n*FT,e*FT]),ends:[{n:9,dir:90},{n:27,dir:270}]}],
    taxi:[[[cy-0.27,cx-0.1],[cy-0.2,cx-0.1],[cy-0.2,cx]].map(([n,e])=>[n*FT,e*FT])]}}}""" % (CX, CY)
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce')
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text))  # 404: app/js/data/local, the game data made on a PC with BMS
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate(TD, [list(f) for f in FEATS])
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(400)
        check('the Weapons page has a Target tab after HARM', pg.locator('#wp .wtabs button').all_inner_texts()[-3:] == ['HARM', 'Target', 'Add card'])
        pg.click('#wp .wtabs [data-mode=tgt]'); pg.wait_for_timeout(900)
        rows = pg.locator('.tgp .tgrowt').all_inner_texts()
        check('one target for the three DTC points on the depot (the town next to it is not a target): %s' % rows, len(rows) == 1 and 'Depot #6' in rows[0] and '3 DMPI' in rows[0])
        check('the apply buttons of the attack are hidden on the Target tab', pg.evaluate("()=>document.body.classList.contains('onharm')"))
        T = lambda js: pg.evaluate('()=>{const t=__app.ST.tgPage._t;return (' + js + ')}')
        dark = lambda: pg.evaluate("()=>{const c=document.querySelector('.tgp canvas'),d=c.getContext('2d').getImageData(c.width/2-200,c.height/2-100,400,200).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i];return s/(d.length/4)}")
        pg.wait_for_timeout(400)
        check('the plan of the objective is drawn (the picture is not black): %.0f' % dark(), dark() > 40)
        check('the plan of an airbase: its runway (corners from the point files) and a taxi path', T("!!t.air()&&t.air().rwy.length==1&&t.air().taxi.length==1"))
        check('Delete selected is now a bin, off while nothing is chosen; Clear all is the bin of the annotations', pg.inner_text('.tgp .tgdel').endswith('Selected') and pg.locator('.tgp .tgdel').is_disabled() and pg.inner_text('.tgp .tgclr').endswith('Annotations'))
        check('Put on datacard is the light green of the program', pg.evaluate("()=>{const b=document.querySelector('.tgp .tgdc'),a=document.querySelector('#wp [data-tabcard]');return getComputedStyle(b).backgroundColor==getComputedStyle(a).backgroundColor&&getComputedStyle(b).backgroundColor!='rgb(31, 122, 70)'}"))
        check('the tools are a bar over the picture, in one line, as in the Briefing room (icon and name)', pg.evaluate("()=>{const b=[...document.querySelectorAll('.tgp .tgtb .t')].filter(x=>!x.hidden);return b.length==15&&b.every(x=>x.querySelector('svg')&&x.querySelector('span'))&&new Set(b.map(x=>Math.round(x.getBoundingClientRect().top))).size==1}"))
        check('the page has three columns as the Pop-up tab: the picture as wide as the horizontal envelope', pg.evaluate("()=>{const l=document.querySelector('.tgp .tgleft').getBoundingClientRect(),c=document.querySelector('.tgp .tgc').getBoundingClientRect(),r=document.querySelector('.tgp .tgright').getBoundingClientRect();return Math.round(l.width)==330&&Math.round(r.width)==400&&l.right<c.left&&c.right<r.left}"))
        check('eight filters, in four columns (Targeting pod and NVG among them)', pg.locator('.tgp [data-seg=filt] button').count() == 8 and pg.evaluate("()=>getComputedStyle(document.querySelector('.tgp [data-seg=filt]')).gridTemplateColumns.split(' ').length==4"))
        pg.click('.tgp .tgpen input'); pg.wait_for_timeout(800)
        check('Handwritten notes (in the Filter card): the handwriting font is loaded', pg.evaluate("()=>!!document.querySelector('.tgp .tgpen').closest('.wcard').querySelector('[data-seg=filt]') && [...document.fonts].some(f=>f.family.replace(/\"/g,'')=='BMS Hand'&&f.status=='loaded')"))
        pg.click('.tgp .tgpen input'); pg.wait_for_timeout(100)
        check('the header names the STPTs of the target', T("t.list()[0].refs.join(',')") == 'STPT 81,STPT 82,WPN 1')
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-plan.png')
        check('Fill from the datacard is on at first (its button hidden, Unfill shown)', not pg.locator('.tgp .tgfill').is_visible())
        if pg.locator('.tgp .tgfill').is_visible(): pg.click('.tgp .tgfill'); pg.wait_for_timeout(300)
        check('Fill from the datacard: the DMPIs of the DTC with their STPT', [d['ref'] for d in T('t.dmpiList()')] == ['TGT STPT 81', 'TGT STPT 82', 'WPN TGT 1'])
        check('...the source line and the chips that hide each part', 'DMPI' in pg.inner_text('.tgp .tgsrc') and pg.locator('.tgp .tgshow button').count() == 6)
        check('...the DMPI boxes show the coordinates', all(d['ll'] for d in T('t.dmpiList()')))
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-fill.png'); pg.screenshot(path=shots + '/tgt-page.png', full_page=True)
        for f in ('ir', 'r80', 'uav', 'suav', 'none', 'recon'):
            pg.click('.tgp [data-seg=filt] [data-v=%s]' % f); pg.wait_for_timeout(150)
        if shots:
            pg.click('.tgp [data-seg=filt] [data-v=r80]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-r80.png'); pg.click('.tgp [data-seg=filt] [data-v=uav]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-uav.png')
            pg.click('.tgp [data-seg=filt] [data-v=suav]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-suav.png'); pg.click('.tgp [data-seg=filt] [data-v=tgp]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-tgp.png'); pg.click('.tgp [data-seg=filt] [data-v=nvg]'); pg.wait_for_timeout(200); pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-nvg.png'); pg.click('.tgp [data-seg=filt] [data-v=recon]')
        pg.click('.tgp [data-seg=filt] [data-v=uav]'); pg.wait_for_timeout(150)
        check('UAV FLIR: the Banner field shows, CLASSIFIED by default', pg.locator('.tgp .tgban').is_visible() and pg.input_value('.tgp .tgbant') == 'CLASSIFIED')
        pg.click('.tgp [data-seg=filt] [data-v=recon]'); pg.wait_for_timeout(150)
        # a callout by hand
        cb = pg.locator('.tgp canvas').bounding_box()
        pt = lambda u, v: (cb['x'] + cb['width'] * (10 + u * 1080) / 1100, cb['y'] + cb['height'] * (122 + v * 520) / 850)
        pg.click('.tgp [data-tool=callout]'); pg.mouse.click(*pt(0.62, 0.6)); pg.mouse.click(*pt(0.75, 0.75)); pg.wait_for_timeout(150)
        pg.fill('.tgp .tged input', 'fuel storage'); pg.press('.tgp .tged input', 'Enter'); pg.wait_for_timeout(150)
        pg.click('.tgp [data-tool=select]'); pg.mouse.move(*pt(0.05, 0.9)); pg.wait_for_timeout(100)
        cur0 = pg.evaluate("()=>document.querySelector('.tgp canvas').style.cursor")
        pg.mouse.move(*pt(0.76, 0.75)); pg.wait_for_timeout(100)
        cur1 = pg.evaluate("()=>document.querySelector('.tgp canvas').style.cursor")
        check('the pointer: plain on the empty picture (%s), the move cross on a symbol (%s)' % (cur0, cur1), cur0 == 'default' and cur1 == 'move')
        check('a callout drawn by hand: kept as typed (shown in capitals unless Handwritten notes)', T("t.state().ann.plan.map(a=>a.k+':'+a.t).join()") == 'callout:fuel storage')
        pg.click('.tgp [data-tool=select]')
        check('the select tool is a mouse pointer', pg.locator('.tgp [data-tool=select] svg').count() == 1)
        # the zoom of the plan: the symbols drawn by hand stay on their ground
        a0 = T('t.state().ann.plan[0]')
        pg.mouse.move(*pt(0.5, 0.5)); pg.mouse.wheel(0, -200); pg.wait_for_timeout(400)
        a1 = T('t.state().ann.plan[0]')
        check('the wheel zooms the plan in (x%.2f), the callout moves with the ground' % T('t.state().pz.k'), T('t.state().pz.k') > 1.2 and abs(a1['u'] - a0['u']) > 0.01)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-zoom.png')
        pg.click('.tgp [data-z="0"]'); pg.wait_for_timeout(300)
        a2 = T('t.state().ann.plan[0]')
        check('...back to all: the callout where it was', T('t.state().pz.k') == 1 and abs(a2['u'] - a0['u']) < 0.002 and abs(a2['v'] - a0['v']) < 0.002)
        # the turn of the plan
        pg.click('.tgp .tgrot [data-r="+15"]'); pg.wait_for_timeout(300); pg.click('.tgp .tgrot [data-r="+15"]'); pg.wait_for_timeout(300)
        a3 = T('t.state().ann.plan[0]')
        check('Turn: ↻ 15° twice puts the heading 030 at the top (north %.1f° on the picture), the callout moves with the ground' % T('t.nUp()'), T('t.state().pz.r') == 30 and abs(T('t.nUp()') + 30) < 0.5 and abs(a3['u'] - a0['u']) + abs(a3['v'] - a0['v']) > 0.01 and pg.inner_text('.tgp .tgrotv') == '030° up')
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-turn.png')
        pg.click('.tgp .tgrot [data-r="0"]'); pg.wait_for_timeout(300)
        a4 = T('t.state().ann.plan[0]')
        check('...N up: north at the top again, the callout where it was', T('t.state().pz.r') == 0 and abs(a4['u'] - a0['u']) < 0.002 and abs(a4['v'] - a0['v']) < 0.002)
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
        pg.click('.tgp [data-seg=view] [data-v=map]'); pg.wait_for_timeout(2500)
        check('Map background: the live map of the Map page first, no frame yet', pg.locator('.tgp .tgmap #mpmap').count() == 1 and pg.locator('#mpfr').count() == 0 and pg.inner_text('.tgp .tgframe').endswith('Take picture'))
        check('...Buildings is hidden on the live map (it draws on the picture taken)', not pg.locator('.tgp .tgbld').is_visible())
        check('...its zoom is locked (the Width chosen): no wheel zoom, no zoom buttons', pg.evaluate("()=>!__app.mapV.leaflet.scrollWheelZoom.enabled()") and not pg.locator('.tgp .tgmap .leaflet-control-zoom').is_visible())
        check('...Take picture is the dark green of the chosen settings', pg.evaluate("()=>getComputedStyle(document.querySelector('.tgp .tgframe')).backgroundColor=='rgb(31, 122, 70)'"))
        check('Map background: the LEVELS menu of the Map page is in the bar of the picture', pg.locator('.tgp .tglev #mpbaseb').count() == 1)
        pg.click('.tgp .tglev #mpbaseb'); pg.wait_for_timeout(300)
        check('...it opens over the picture', pg.locator('.tgp .tglev #mpbase').is_visible())
        v = pg.evaluate("()=>{const i=[...document.querySelectorAll('.tgp .tglev input[name=mpbase]')].find(i=>!i.checked&&i.value!='img'&&i.value!='coast');if(!i)return '';i.click();return i.value}"); pg.wait_for_timeout(400)
        check('...a level chosen there changes the map (%s) and closes the menu' % v, v != '' and pg.evaluate("v=>document.querySelector('.tgp .tglev input[value='+v+']').checked", v) and not pg.locator('.tgp .tglev #mpbase').is_visible())
        pg.click('.tgp [data-seg=view] [data-v=plan]'); pg.wait_for_timeout(300); pg.click('.tgp [data-seg=view] [data-v=map]'); pg.wait_for_timeout(1500)
        check('Map background: Map filters of the horizontal envelope, no Edit points (the tab is for drawing: the points of the map stay still)', pg.locator('.tgp .tgmapb').is_visible() and pg.locator('.tgp .tgedit').count() == 0 and not pg.evaluate('()=>__app.mapV.isEdit()'))
        pg.click('.tgp .tgpf'); pg.wait_for_timeout(150)
        check('...Map filters goes round (No filters)', pg.inner_text('.tgp .tgpf') == 'No filters')
        for _ in range(3): pg.click('.tgp .tgpf'); pg.wait_for_timeout(100)
        check('...and back to the filters of the Map page', pg.inner_text('.tgp .tgpf') == 'Map filters')
        check('...and comes closed when the Map background is chosen again (it was left open)', pg.locator('.tgp .tglev #mpbaseb').count() == 1 and not pg.locator('.tgp .tglev #mpbase').is_visible())
        pg.click('.tgp .tgframe'); pg.wait_for_timeout(2500)
        check('...the canvases of the map are not painted black by the page (the base map shows)', pg.evaluate("()=>[...document.querySelectorAll('.tgp .tgmap canvas')].every(c=>getComputedStyle(c).backgroundColor!='rgb(0, 0, 0)')"))
        check('Take picture: the map of the Map page with its frame, with the angle and +90°', pg.locator('.tgp .tgmap #mpmap').count() == 1 and pg.locator('#mpfr').count() == 1 and pg.locator('#mpang').count() == 1 and pg.locator('#mprot').count() == 1)
        check('...the zoom comes back in the frame', pg.evaluate("()=>__app.mapV.leaflet.scrollWheelZoom.enabled()") and pg.locator('.tgp .tgmap .leaflet-control-zoom').is_visible())
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-frame.png')
        pg.click('#mpcap'); pg.wait_for_timeout(4000)
        g = T('t.state().map&&t.state().map.geo')
        check('Capture: the picture of the map comes back with its place on the ground', T('!!(t.state().map&&t.state().map.c)') and g is not None)
        if g:
            w = (g['u'][0] ** 2 + g['u'][1] ** 2) ** 0.5 / 1.852
            cu = pg.evaluate("([g,x,y])=>{const a=g.u[0],b=g.v[0],c=g.u[1],d=g.v[1],det=a*d-b*c,px=x-g.o[0],py=y-g.o[1];return [(d*px-b*py)/det,(-c*px+a*py)/det]}", [g, CX, CY])
            check('...about 10 NM wide (%.1f NM), the target in the middle (%.2f, %.2f)' % (w, cu[0], cu[1]), 8 < w < 12.5 and abs(cu[0] - 0.5) < 0.06 and abs(cu[1] - 0.5) < 0.06)
        check('...the map goes back to the Map page and the picture is shown', pg.locator('.tgp .tgmap #mpmap').count() == 0 and T("t.state().view") == 'map')
        check('...Buildings is back on the picture, in the tool bar', pg.locator('.tgp .tgtb .tgbld').is_visible())
        check('...with Back to the map, without the buttons of the live map', pg.inner_text('.tgp .tgframe').endswith('Back to the map') and not pg.locator('.tgp .tgpf').is_visible() and pg.locator('.tgp .tglev #mpbaseb').count() == 0)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-map.png')
        check('...north up: north at the top of the picture (%.1f°)' % T('t.nUp()'), abs(T('t.nUp()')) < 1)
        # a turned frame: the picture comes straightened, its corners turned on the ground
        pg.click('.tgp .tgframe'); pg.wait_for_timeout(1500); pg.click('.tgp .tgframe'); pg.wait_for_timeout(1200)
        pg.click('#mprot'); pg.wait_for_timeout(300)
        pg.click('#mpcap'); pg.wait_for_timeout(4000)
        g = T('t.state().map&&t.state().map.geo')
        cu = pg.evaluate("([g,x,y])=>{const a=g.u[0],b=g.v[0],c=g.u[1],d=g.v[1],det=a*d-b*c,px=x-g.o[0],py=y-g.o[1];return [(d*px-b*py)/det,(-c*px+a*py)/det]}", [g, CX, CY])
        check('the frame turned by 90°: north to the left on the picture (%.1f°), the target still in the middle (%.2f, %.2f)' % (T('t.nUp()'), cu[0], cu[1]), abs(T('t.nUp()') + 90) < 2 and abs(cu[0] - 0.5) < 0.06 and abs(cu[1] - 0.5) < 0.06)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-map90.png')
        # Target information: the aim points of the two detail pictures, chosen above the page (not with a screenshot)
        pg.click('.tgp [data-seg=page] [data-v=t]'); pg.wait_for_timeout(400)
        op = pg.evaluate("()=>[...document.querySelectorAll('.tgp [data-det=\"0\"] option')].map(o=>o.value)")
        check('Details: two lists of the aim points over Target information %s' % op, pg.locator('.tgp .tgdetb').is_visible() and pg.locator('.tgp [data-det]').count() == 2 and 'TARGET' in op and len(op) >= 3)
        pg.select_option('.tgp [data-det="0"]', op[-2]); pg.wait_for_timeout(300)
        check('...the choice is kept for the target (%s)' % T('t.state().det'), T('t.state().det')[0] == op[-2])
        pg.click('.tgp [data-seg=page] [data-v=g]'); pg.wait_for_timeout(300)
        check('...and hidden on the Graphic', not pg.locator('.tgp .tgdetb').is_visible())
        # Kneeboard and datacard
        n0 = pg.evaluate('()=>__app.KBLIB.length')
        pg.click('#wp [data-tabcard]'); pg.wait_for_timeout(600)
        check('Add card: a window with the four cards (Graphic, Information, Details, Smart), all chosen (Select none)', pg.locator('.tgdlg .tgcard').count() == 4 and pg.locator('.tgdlg .tgcard.on').count() == 4 and pg.inner_text('.tgdlg .tgall') == 'Select none')
        if shots: pg.locator('.tgdlg').screenshot(path=shots + '/tgt-cards.png')
        pg.click('.tgdlg .tgcard >> nth=2'); pg.wait_for_timeout(200)
        check('...the third card left out, then chosen again', pg.locator('.tgdlg .tgcard.on').count() == 3 and pg.inner_text('.tgdlg .tgall') == 'Select all')
        pg.click('.tgdlg .tgcard >> nth=2'); pg.wait_for_timeout(200)
        pg.click('.tgdlg [data-a=ok]')
        for _ in range(60):  # four big pictures to encode
            if pg.evaluate('()=>__app.KBLIB.length') - n0 >= 4: break
            pg.wait_for_timeout(250)
        if shots:
            pg.click('[data-t=kn]'); pg.wait_for_timeout(1200); pg.screenshot(path=shots + '/tgt-kb.png', full_page=True); pg.click('[data-t=wp]'); pg.wait_for_timeout(600)
        check('...four cards are in the Kneeboard, the Smart one too (%d)' % (pg.evaluate('()=>__app.KBLIB.length') - n0), pg.evaluate('()=>__app.KBLIB.length') - n0 == 4 and any('Smart' in z for z in pg.evaluate('()=>__app.KBLIB.slice(-4).map(i=>i.name)')))
        if shots:
            for i, k in enumerate('gtds'):
                d = pg.evaluate("k=>__app.ST.tgPage._t.card(k).toDataURL()", k); open(shots + '/tgt-card-%s.png' % k, 'wb').write(base64.b64decode(d.split(',')[1]))
        pg.click('.tgp .tgdc'); pg.wait_for_timeout(300)
        check('Put on datacard: first the crop frame of the datacard (its shape on the picture)', pg.locator('.tgp .tgcropbar').is_visible() and 'Datacard format' in pg.inner_text('.tgp .tgcropn'))
        if shots: pg.locator('.tgp .tgc').screenshot(path=shots + '/tgt-crop.png')
        pg.locator('.tgp canvas').scroll_into_view_if_needed(); cb = pg.locator('.tgp canvas').bounding_box()
        pg.mouse.move(*pt(0.5, 0.5)); pg.mouse.down(); pg.mouse.move(*pt(0.7, 0.5), steps=5); pg.mouse.up()
        cr = T('t.crop()')
        check('...the frame is dragged to the right (u %.2f)' % cr['u'], cr['u'] > 0.45)
        pg.mouse.move(*pt(0.6, 0.5)); pg.mouse.wheel(0, -300); pg.wait_for_timeout(200)
        check('...the wheel makes it smaller (w %.2f -> %.2f)' % (cr['w'], T('t.crop().w')), T('t.crop().w') < cr['w'])
        pg.click('.tgp .tgcropok'); pg.wait_for_timeout(300)
        check('...then the picture is the map screenshot of the datacard (564 x 752 shape)', pg.evaluate('()=>{const c=__app.ST.MAPSHOT;return c&&Math.abs(c.width/c.height-564/752)<0.01}') and not pg.locator('.tgp .tgcropbar').is_visible())
        # names, the × of a DMPI box, the × of a target
        pg.click('.tgp [data-seg=view] [data-v=plan]'); pg.wait_for_timeout(300)
        check('Names: on (green), the names of the DMPIs; All shows them all', pg.evaluate("()=>{const b=document.querySelector('.tgp .tgnames');return b.classList.contains('on')&&getComputedStyle(b).backgroundColor=='rgb(31, 122, 70)'}"))
        pg.click('.tgp [data-seg=nscope] [data-v=all]'); pg.wait_for_timeout(200)
        if shots: pg.locator('.tgp canvas').screenshot(path=shots + '/tgt-names.png')
        pg.wait_for_timeout(4500)  # the message of Put on datacard stands over the DMPI boxes for a few seconds
        pg.once('dialog', lambda d: d.accept())
        bx = pg.evaluate("()=>{const t=__app.ST.tgPage._t;return t.boxX(2)}")
        pg.locator('.tgp canvas').scroll_into_view_if_needed(); cb = pg.locator('.tgp canvas').bounding_box()
        pg.mouse.click(cb['x'] + cb['width'] * bx[0] / 1100, cb['y'] + cb['height'] * bx[1] / 850); pg.wait_for_timeout(600)
        check('the × of DMPI 3 deletes WPN TGT 1 from the DTC', T("t.list()[0].dmpis.map(d=>d.ref).join()") == 'TGT STPT 81,TGT STPT 82' and 'not set' in pg.evaluate("()=>__app.lines.find(l=>l.k=='wpntarget_0').v").lower())
        pg.once('dialog', lambda d: d.accept())
        pg.click('.tgp .tgrowt .tgx'); pg.wait_for_timeout(600)
        check('the × of the target deletes its TGT steerpoints from the DTC: the list is empty', T('t.list().length') == 0 and pg.evaluate("()=>__app.lines.find(l=>l.k=='target_80').v").startswith('0'))
        # a Picture: a screenshot with no target (an aircraft to know in A-A)
        pg.click('.tgp .tgpic'); pg.wait_for_timeout(400)
        check('＋ Picture: PICTURE 1 in the list, with no place', T('t.list().length') == 1 and 'PICTURE 1' in pg.inner_text('.tgp .tgrowt') and 'no place' in pg.inner_text('.tgp .tgrowt'))
        check('...its view is the Screenshot, the plan view is off', T('t.state().view') == 'shot' and pg.locator('.tgp [data-seg=view] [data-v=plan]').is_disabled())
        pg.click('#wp [data-tabcard]'); pg.wait_for_timeout(600)
        check('...Add card gives one card, the Picture', pg.locator('.tgdlg .tgcard').count() == 1 and 'Picture' in pg.inner_text('.tgdlg .tgcard'))
        pg.click('.tgdlg [data-a=no]'); pg.wait_for_timeout(300)
        pg.once('dialog', lambda d: d.accept())
        pg.click('.tgp .tgrowt .tgx'); pg.wait_for_timeout(400)
        check('...its × removes it', T('t.list().length') == 0)
        # the other tabs take the map back
        pg.click('#wp .wtabs [data-mode=popup]'); pg.wait_for_timeout(500)
        check('back to Pop-up: the apply buttons are shown again', not pg.evaluate("()=>document.body.classList.contains('onharm')"))
        check('no page error: %s' % errs[:3], not errs)
    srv.terminate()
except Exception as e:
    srv.terminate(); raise
sys.exit(0 if ok else 1)
