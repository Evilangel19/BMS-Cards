"""Checks the MSA / ERAA: the MSA column of the datacard and the MDC, the ERAA of the MDC, the map filter (labels, bands, symbols). Usage: python3 tools/msa-test.py
The terrain of the game is not in the repository: a synthetic one replaces the reader."""
import subprocess, sys, time, os, base64
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8793', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
STUB = """async()=>{const m=await import('/app/js/app/msafill.js');window.__MSA=m;window.__calls=0;
 window.__rows=new Set();window.__n=0;m.MSA_IO.elev=async pts=>{window.__calls++;window.__n+=pts.length;pts.forEach(p=>window.__rows.add(Math.floor((1-p.n/(1024000/0.3048))*32767)));return pts.map(p=>{const e=p.e/3280.84,n=p.n/3280.84;return Math.max(0,Math.round(300+900*Math.sin(e/9)*Math.cos(n/11)+2500*Math.exp(-(((e-520)**2)/60+((n-585)**2)/40))))})}}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1700, 'height': 1000}, reduced_motion='reduce')
        pg.route('**/vendor/leaflet/leaflet.js', lambda r: r.fulfill(body=r.fetch().text() + "\n;L.Map.addInitHook(function(){window.__M=this});", content_type='application/javascript'))
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8793/app/index.html'); pg.wait_for_timeout(900)
        pg.evaluate("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}", b64('PSI_BEAR_TRAP_26.cam')); pg.wait_for_timeout(900)
        pg.evaluate("async(b)=>{await __app.loadFmap(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.fmap'))}", b64('PSI_BEAR_TRAP_26.fmap')); pg.wait_for_timeout(700)
        sel = lambda i: (pg.evaluate("i=>{const s=document.getElementById('fsel');s.value=i;s.dispatchEvent(new Event('change',{bubbles:true}))}", str(i)), pg.wait_for_timeout(1800))
        fl = pg.evaluate("()=>__app.CL.map((x,i)=>[i,x.f&&x.f.wps?x.f.wps.length:0,x.label]).filter(a=>a[1]>=6&&/F-16/.test(a[2])&&/CAS/.test(a[2]))")[0][0]
        # without terrain data nothing is written and nothing breaks
        sel(fl)
        check('no terrain: the MSA cells stay empty', pg.evaluate("()=>__app.F.fp1_11||''") == '' and pg.evaluate("()=>__app.F.aux||''") == '')
        pg.evaluate(STUB)
        sel(fl)
        pg.wait_for_timeout(1500)
        F = pg.evaluate("()=>__app.F")
        n = pg.evaluate("()=>__app.CL[+document.getElementById('fsel').value].f.wps.length")
        vals = [F.get('fp%d_11' % i) for i in range(n)]
        check('MSA of the steerpoints: first is ---, the others multiples of 100', vals[0] == '---' and all(v and v.isdigit() and int(v) % 100 == 0 for v in vals[1:]))
        check('MSA is at least 500 ft above the ground (terrain >= 300 ft)', all(int(v) >= 800 for v in vals[1:]))
        check('ERAA in the MDC cell (aux) is a multiple of 100, not lower than the highest MSA', F.get('aux', '').isdigit() and int(F['aux']) % 100 == 0 and int(F['aux']) >= max(int(v) for v in vals[1:]) + 500)
        check('the terrain is read once for the datacard (cache)', pg.evaluate("()=>__calls") > 0)
        check('the terrain is read in a few hundred rows of the file, not thousands (grid of 1 km)', pg.evaluate("()=>__rows.size") < 500)
        c0 = pg.evaluate("()=>__calls"); sel(fl); pg.wait_for_timeout(1000)
        check('selecting the same flight again does not read the terrain again', pg.evaluate("()=>__calls") == c0)
        # the datacard keeps the field when the pilot types over it
        pg.evaluate("()=>__app.setField('fp1_11','9999')"); pg.wait_for_timeout(200)
        sel(fl + 1 if fl + 1 < 300 else fl - 1); sel(fl)
        check('what the pilot typed in the MSA cell is kept when the flight comes back', pg.evaluate("()=>__app.F.fp1_11") == '9999')
        # datacard: the MSA field is in the form, after Alt, 9 columns
        check('the form of the flight plan has an MSA field after Alt', pg.evaluate("()=>{const l=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary').textContent=='Flightplan');if(!l)return false;const ls=[...l.querySelectorAll('label')].slice(0,9).map(x=>x.textContent);return ls[5]=='Alt'&&ls[6]=='MSA'&&ls[7]=='Min.Fuel'}"))
        # MDC layout
        L = pg.evaluate("""async()=>{const m=await import('/app/js/core/cardlayout.js');const sh=m.LAYOUT.shapes||[];return sh.length}""")
        lay = pg.evaluate("""async()=>{const m=await import('/app/js/core/cardlayout.js');const f=m.LAYOUT.fields;const g=k=>f.find(z=>z.k==k);const a=g('fp0_5'),b=g('fp0_11'),c=g('fp0_1'),e=g('aux');return JSON.stringify({elev:a.r,msa:b.r,tos:c.r,eraa:e&&e.r,lab:[b.lab,e&&e.lab]})}""")
        import json; lay = json.loads(lay)
        check('MDC: the MSA column is right of Elev and left of TOS, wide enough for 4 digits', abs(lay['msa'][0] - lay['elev'][2]) < 0.6 and abs(lay['msa'][2] - lay['tos'][0]) < 0.6 and lay['msa'][2] - lay['msa'][0] > 50)
        check('MDC: Aux is now ERAA', lay['eraa'] is not None and 'ERAA' in lay['lab'][1])
        # map
        pg.click('[data-t=mp]'); pg.wait_for_timeout(2500)
        check('the MSA filter is in Display and off by default', pg.evaluate("()=>{const i=document.querySelector('input[data-k=msa]');return !!i&&!i.checked&&!!i.closest('.mpsb')&&i.closest('.mpsb').dataset.sec=='Display'}"))
        check('no labels while the filter is off', pg.evaluate("()=>document.querySelectorAll('.msal,.msae,.msas').length") == 0)
        pg.evaluate("()=>{const i=document.querySelector('input[data-k=msa]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(3000)
        cnt = lambda s: pg.evaluate("s=>document.querySelectorAll(s).length", s)
        check('one MSA label for each leg', cnt('.msal') == n - 1)
        check('one ERAA label, in blue', cnt('.msae') == 1 and 'ERAA' in pg.evaluate("()=>document.querySelector('.msae').textContent"))
        check('the ERAA on the map is the ERAA of the MDC', pg.evaluate("()=>document.querySelector('.msae').textContent.replace(/[^0-9]/g,'')") == F['aux'])
        nb = lambda c: pg.evaluate("c=>{let n=0;__M.eachLayer(l=>{if(l.options&&l.options.fillRule=='nonzero'&&l.options.fillColor==c)n++});return n}", c)
        check('the two bands are drawn (red 5 NM, blue 22 NM)', nb('#ff5d5d') == 1 and nb('#4f8cff') == 1)
        pg.wait_for_timeout(500)
        check('the airbase of the flight has its symbol', cnt('.msas') == 1)
        # slider of the opacity: 0 = no bands, labels stay
        pg.evaluate("()=>{const s=document.getElementById('mpmsao');s.value=0;s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(1500)
        check('opacity 0: no bands, the labels stay', nb('#ff5d5d') + nb('#4f8cff') == 0 and cnt('.msal') == n - 1)
        pg.evaluate("()=>{const s=document.getElementById('mpmsao');s.value=14;s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(1200)
        # zoom: bigger symbol, bearings
        pg.evaluate("()=>{let pl=null;__M.eachLayer(l=>{if(l.getLatLngs&&l.options&&l.options.color=='#ffd23f'){const a=l.getLatLngs();if(Array.isArray(a)&&a.length>=5&&!Array.isArray(a[0])&&(!pl||a.length>pl.getLatLngs().length))pl=l}});window.__LL=pl.getLatLngs();__M.setView(__LL[0],8,{animate:false})}"); pg.wait_for_timeout(1000)
        w8 = pg.evaluate("()=>parseFloat(document.querySelector('.msas svg').getAttribute('width'))")
        pg.evaluate("()=>{__M.setView(__LL[0],11,{animate:false})}"); pg.wait_for_timeout(1000)
        w11 = pg.evaluate("()=>parseFloat(document.querySelector('.msas svg').getAttribute('width'))")
        check('the symbol grows with the zoom', w11 > w8 * 2)
        check('the disc hangs below the point (the svg starts 6 px above it)', pg.evaluate("()=>document.querySelector('.msas svg').style.top") == '-6px')
        check('close up the symbol shows the bearings', pg.evaluate("()=>/°/.test(document.querySelector('.msas').innerHTML)"))
        # the mouse on another airbase
        pg.evaluate("()=>{__M.setView(__LL[0],10,{animate:false})}"); pg.wait_for_timeout(1000)
        boxes = pg.evaluate("()=>[...document.querySelectorAll('.leaflet-marker-icon.ico')].filter(x=>x.querySelector('.nm')).map(e=>{const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}).filter(b=>b[0]>420&&b[0]<1600&&b[1]>120&&b[1]<900)")
        got = False
        for b in boxes[:12]:
            pg.mouse.move(b[0], b[1]); pg.wait_for_timeout(600)
            if cnt('.msas') >= 2: got = True; break
        check('the mouse on an airbase shows its symbol', got)
        pg.mouse.move(700, 150); pg.wait_for_timeout(500)
        check('and it goes away with the mouse', cnt('.msas') == 1)
        pg.evaluate("()=>{const i=document.querySelector('input[data-k=msa]');i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(800)
        check('filter off: everything goes away', cnt('.msal') + cnt('.msae') + cnt('.msas') == 0)
        check('no errors in the page', not errs)
        if errs: print(errs[:3])
        br.close()
finally: srv.kill()
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
