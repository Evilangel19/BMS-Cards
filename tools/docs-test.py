"""Docs tab (charts and manuals): tree, search, flight airports, viewer, Add to cards, "All pages" (asks above 20 pages, progress, Cancel),
reading by scrolling (switch Scroll), animations. Mocked Tauri file system with synthetic PDFs."""
import subprocess, sys, time, os, io, base64, json
from playwright.sync_api import sync_playwright
from reportlab.pdfgen import canvas
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools')
import dialogs
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8733', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
def pdf(pages):
    b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(595, 842))
    for t in pages:
        c.setFont('Helvetica-Bold', 28); c.drawString(60, 760, t); c.rect(40, 40, 515, 700); c.showPage()
    c.save(); return base64.b64encode(b.getvalue()).decode()
def pdfm(pages):  # pages: [(title, width, height)]
    b = io.BytesIO(); c = canvas.Canvas(b)
    for t, w, h in pages:
        c.setPageSize((w, h)); c.setFont('Helvetica-Bold', 28); c.drawString(60, h - 80, t); c.rect(40, 40, w - 80, h - 120); c.showPage()
    c.save(); return base64.b64encode(b.getvalue()).decode()
D = 'C:\\bms\\Docs\\'; CH = D + '03 KTO Charts\\01 South Korea (ROK-US)\\'
files = {
  CH + 'Gunsan AB (RKJK)\\Gunsan AB (RKJK) - ILS.pdf': pdf(['RKJK AD CHART 2 - 4', 'RKJK AD CHART 2 - 5', 'Aeronautical data tabulation']),
  CH + 'Gunsan AB (RKJK)\\Gunsan AB (RKJK)_APC_RWY 18.pdf': pdf(['APC 18']),
  CH + 'Osan AB (RKSO)\\Osan AB (RKSO) - ADC.pdf': pdf(['RKSO AD CHART 2 - 1']),
  CH + 'Chik-Do_Range\\Chik-Do_Range.pdf': pdf(['Range']),
  D + '03 KTO Charts\\02 Japan\\Iwakuni (RJOI)\\Iwakuni (RJOI) - ADC.pdf': pdf(['RJOI']),
  D + '01 Manuals\\BMS-Manual.pdf': pdf(['Manual p1', 'Manual p2']),
  D + '01 Manuals\\Extras\\Checklist.pdf': pdf(['Checklist']),
  D + '01 Manuals\\Big.pdf': pdf(['Big %d' % i for i in range(1, 26)]),
  D + '01 Manuals\\Mixed.pdf': pdfm([('portrait', 595, 842), ('landscape', 842, 595), ('portrait', 595, 842), ('portrait', 595, 842)]),
  D + '01 Manuals\\readme.txt': base64.b64encode(b'x').decode(),
}
INIT = """(()=>{const F=new Map(Object.entries(%s).map(([k,v])=>[k,Uint8Array.from(atob(v),c=>c.charCodeAt(0))]));window.__F=F;
const ls=p=>{p=p.replace(/\\\\+$/,'');const o=new Map();for(const k of F.keys()){if(!k.startsWith(p+'\\\\'))continue;const r=k.slice(p.length+1).split('\\\\');o.set(r[0],r.length>1)}return [...o].map(([name,d])=>({name,isDirectory:d,isFile:!d,isSymlink:false}))};
window.__TAURI__={core:{invoke:async c=>c==='app_dir'?'C:\\\\app':null},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async p=>ls(p),readFile:async p=>{if(!F.has(p))throw new Error('missing');return F.get(p).slice()},readTextFile:async p=>{const m=window.__TX;if(m&&m.has(p))return m.get(p);throw new Error('none')},writeTextFile:async(p,s)=>{(window.__TX=window.__TX||new Map()).set(p,s)},
  writeFile:async(p,b)=>{F.set(p,new Uint8Array(b))},exists:async p=>F.has(p),mkdir:async()=>{}}};})();""" % json.dumps(files)
ok = True
SHOTS = os.environ.get('SHOTS')  # a folder: SHOTS=/tmp/x python3 tools/docs-test.py saves some screenshots there
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1000}); errs = []
        dialogs.install(pg)
        asked = []; ANS = [True]
        def on_dialog(d):
            asked.append(d.message); d.accept() if ANS[0] else d.dismiss()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', on_dialog); pg.add_init_script(INIT)
        pg.goto('http://localhost:8733/app/index.html'); pg.wait_for_timeout(1000)
        pg.evaluate("()=>{__app.CFG.paths.bmsInstall='C:\\\\bms'; __app.F.__dep=['RKJK',0,0,0]; __app.F.__ab=[null,[1,'Osan AB (RKSO)']]}")
        check('the Docs tab exists', pg.locator('.tab[data-t=dc]').inner_text() == 'Docs')
        pg.click('[data-t=dc]'); pg.wait_for_timeout(1200)
        t = pg.inner_text('#dclist').replace('AIRPORTS OF THE FLIGHT','Airports of the flight').replace('ALL CHARTS','All charts'); print('     ', t.replace('\n', ' | ')[:400])
        check('charts: the flight airports are on top (departure and arrival)', 'Airports of the flight' in t and t.index('Gunsan AB') < t.index('All charts') and 'Osan AB' in t.split('All charts')[0])
        check('chart names are short (ILS, APC RWY 18)', pg.locator('#dclist .dcfl .dcf').all_inner_texts()[:2] == ['ILS', 'APC RWY 18'])
        check('the tree has South Korea and Japan without the numeric prefix', 'South Korea (ROK-US)' in t and 'Japan' in t and '01 South' not in t)
        pg.fill('#dcq', 'osan'); pg.wait_for_timeout(200)
        check('the search finds Osan and hides Gunsan', 'Osan' in pg.inner_text('#dclist') and 'Gunsan' not in pg.inner_text('#dclist'))
        pg.fill('#dcq', 'rjoi'); pg.wait_for_timeout(200); check('the search works on the ICAO code', pg.locator('#dclist .dcf').count() == 1)
        pg.fill('#dcq', ''); pg.wait_for_timeout(200)
        pg.click('#dclist .dcfl .dcf >> text=ILS'); pg.wait_for_timeout(2500)
        check('the viewer shows page 1 of 3 on a canvas', pg.locator('#dcpg canvas.dcpage').count() == 1 and '/ 3' in pg.inner_text('#dcview') and pg.input_value('#dcn') == '1')
        check('thumbnails with the chart number of every page', pg.locator('#dcth .dct').count() == 3 and 'RKJK 2 - 5' in pg.inner_text('#dcth'))
        w0 = pg.evaluate("()=>document.querySelector('#dcpg canvas').getBoundingClientRect().width")
        check('the zoom starts at 50%', pg.inner_text('#dcz') == '50%')
        pg.click('#dcnext'); pg.wait_for_timeout(800); check('next page', pg.input_value('#dcn') == '2')
        pg.click('#dczi'); pg.wait_for_timeout(800)
        w1 = pg.evaluate("()=>document.querySelector('#dcpg canvas').getBoundingClientRect().width"); check('zoom in enlarges the page (%d -> %d)' % (w0, w1), w1 > w0 * 1.2)
        pg.click('#dcfp'); pg.wait_for_timeout(800)
        h = pg.evaluate("()=>[document.querySelector('#dcpg canvas').getBoundingClientRect().height,document.querySelector('#dcvw').clientHeight]"); check('Page fits the whole page in the view', h[0] <= h[1] + 1)
        n0 = pg.evaluate("()=>__app.KBLIB.length") if pg.evaluate("()=>!!__app.KBLIB") else None
        pg.click('#dcadd'); pg.wait_for_timeout(2500)
        check('Add page to cards: a card is added to the kneeboard (first free slot)', pg.evaluate("()=>{const k=__app.KBS||[];return k.some(r=>['left','right'].some(s=>r[s].kind=='pic'&&/ILS p\\.2/.test(r[s].item.name)))}"))
        pg.click('#dcall'); pg.wait_for_timeout(4000)
        check('All pages adds the three pages', pg.evaluate("()=>(__app.KBLIB||[]).filter(i=>/ILS p\\./.test(i.name)).length") >= 4)
        pg.screenshot(path='/tmp/dc0.png'); pg.click('#dctabs [data-tab=manuals]'); pg.wait_for_timeout(500); t = pg.inner_text('#dclist')
        print('     M', t.replace('\n',' | '))
        print('     M', pg.inner_text('#dclist').replace('\n',' | '))
        check('manuals: the Docs folder without the charts, PDF only', 'BMS-Manual' in t and 'Extras' in t and 'Charts' not in t and 'readme' not in t and 'Gunsan' not in t)
        pg.click('#dclist .dcf >> text=BMS-Manual'); pg.wait_for_timeout(2000)
        check('a manual opens (2 pages)', '/ 2' in pg.inner_text('#dcview'))
        pg.screenshot(path='/tmp/dc1.png')

        # ---- the thumbnails stay when the Docs tab is left and opened again
        check('a manual of 2 pages has 2 thumbnails', pg.locator('#dcth .dct').count() == 2)
        pg.click('[data-t=ms]'); pg.wait_for_timeout(300); pg.click('[data-t=dc]'); pg.wait_for_timeout(1500)
        check('the thumbnails are still there after leaving the Docs tab and coming back', pg.locator('#dcth .dct').count() == 2)
        check('and the page is shown again', pg.locator('#dcpg canvas.dcpage').count() == 1)

        # ---- "All pages": more than 20 pages asks first, then shows where it is, and can be cancelled
        st = lambda sel: pg.evaluate("s=>{const e=document.querySelector(s);return e?e.textContent.trim():null}", sel)
        def toast_clear(): pg.evaluate("()=>{const t=document.getElementById('apptoast');if(t)t.textContent=''}")
        def toast_wait(rx, ms=60000): pg.wait_for_function("r=>new RegExp(r).test((document.getElementById('apptoast')||{}).textContent||'')", arg=rx, timeout=ms)
        lib = lambda: pg.evaluate("()=>__app.KBLIB.filter(i=>/^Big p\\./.test(i.name)).length")
        pg.click('#dclist .dcf >> text=Big'); pg.wait_for_timeout(3000)
        check('Big.pdf has 25 pages and 25 thumbnails', '/ 25' in pg.inner_text('#dcview') and pg.locator('#dcth .dct').count() == 25)
        n3 = len(asked)
        toast_clear(); pg.click('#dcadd'); toast_wait('^1 page added')
        check('one page: no question, no strip', len(asked) == n3 and pg.locator('#dcprog').count() == 0)
        base = lib()
        ANS[0] = False; asked.clear()
        pg.click('#dcall'); pg.wait_for_timeout(1200)
        check('25 pages: it asks first and says how many (%s)' % asked[:1], len(asked) == 1 and '25 pages' in asked[0] and 'Add all 25 pages?' in asked[0])
        check('Cancel on the question: nothing is added, no strip, the buttons are free', lib() == base and pg.locator('#dcprog').count() == 0 and pg.is_enabled('#dcall') and pg.is_enabled('#dcadd'))
        WATCH = "()=>{window.__pa=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.id=='dcprog')window.__pa.push(n.getAnimations().length)}).observe(document.body,{childList:true,subtree:true})}"
        pg.evaluate(WATCH)
        ANS[0] = True; asked.clear()
        pg.click('#dcall')
        pg.wait_for_function("()=>/page [2-9] of 25/.test((document.querySelector('#dcpt')||{}).textContent||'')", timeout=60000)
        t = st('#dcpt'); w = pg.evaluate("()=>document.querySelector('#dcpi').style.width")
        check('OK: the strip says where it is (%s) and the bar moves (%s)' % (t, w), 'of 25' in t and w not in ('', '0%', '0px'))
        if SHOTS: pg.screenshot(path=SHOTS + '/docs-strip.png')
        check('the two Add buttons wait while it works, Cancel is there', pg.is_disabled('#dcall') and pg.is_disabled('#dcadd') and pg.is_enabled('#dcpx'))
        check('the strip opens with an animation', (pg.evaluate("()=>window.__pa") or [0])[0] > 0)
        toast_clear(); pg.click('#dcpx'); toast_wait('^Stopped:'); pg.wait_for_function("()=>!document.querySelector('#dcprog')", timeout=60000)
        k = lib() - base
        check('Cancel: the pages already added stay (%d of 25), the strip goes, the buttons are free' % k, 1 <= k < 25 and pg.is_enabled('#dcall') and pg.is_enabled('#dcadd'))
        check('and the message says how far it went', st('#apptoast').startswith('Stopped: %d of 25' % k))
        base = lib()
        toast_clear(); pg.click('#dcall'); toast_wait('^25 pages added', 240000)
        pg.wait_for_function("()=>!document.querySelector('#dcprog')", timeout=10000)
        check('OK on the question: all 25 pages are added', lib() - base == 25 and len(asked) == 2 and pg.locator('#dcprog').count() == 0)
        # opening another document while pages are being added stops the run
        toast_clear(); pg.click('#dcall'); pg.wait_for_function("()=>/page [2-9] of 25/.test((document.querySelector('#dcpt')||{}).textContent||'')", timeout=60000)
        pg.click('#dclist .dcf >> text=Mixed'); toast_wait('^Stopped:')
        pg.wait_for_timeout(1500)
        check('opening another document stops the run, without errors', pg.locator('#dcprog').count() == 0 and not errs)
        pg.click('#dclist .dcf >> text=Big'); pg.wait_for_timeout(2500)

        # ---- reading by scrolling
        sl = lambda n: pg.locator('.dcslot[data-n="%d"]' % n)
        has = lambda n: pg.evaluate("n=>!!document.querySelector('.dcslot[data-n=\"'+n+'\"] canvas')", n)
        goto = lambda n: pg.evaluate("n=>{const v=document.querySelector('#dcvw'),s=document.querySelector('.dcslot[data-n=\"'+n+'\"]');v.scrollTop=s.offsetTop-12}", n)
        num = lambda: pg.input_value('#dcn')
        check('Scroll: off at the start, one page at a time', 'on' not in (pg.get_attribute('#dcsc', 'class') or '').split() and pg.locator('.dcslot').count() == 0 and pg.locator('#dcpg canvas.dcpage').count() == 1)
        check('Scroll: nothing is remembered yet', pg.evaluate("()=>localStorage.getItem('bmsdocscroll')") is None)
        pg.click('#dcsc'); pg.wait_for_timeout(1800)
        check('Scroll on: a slot for each of the 25 pages, the switch is on and remembered', pg.locator('.dcslot').count() == 25 and pg.get_attribute('#dcsc', 'aria-checked') == 'true' and pg.evaluate("()=>localStorage.getItem('bmsdocscroll')") == '1')
        if SHOTS: pg.screenshot(path=SHOTS + '/docs-scroll.png')
        drawn = pg.locator('.dcslot canvas').count()
        check('only the pages near the view are drawn (%d of 25), the first one is' % drawn, 1 <= drawn <= 8 and has(1))
        check('the slots have the size of the pages: the document is as tall as all the pages', pg.evaluate("()=>{const v=document.querySelector('#dcvw');return v.scrollHeight>v.clientHeight*5}"))
        pg.evaluate("()=>{const v=document.querySelector('#dcvw');v.scrollTop=v.scrollHeight}"); pg.wait_for_timeout(1500)
        check('at the end: the current page is 25, it is drawn and the first pages were freed (%s)' % num(), num() == '25' and has(25) and not has(1) and not has(2))
        goto(12); pg.wait_for_timeout(1500)
        check('scrolling to page 12: the number follows (%s), the thumbnail too' % num(), num() == '12' and pg.locator('#dcth .dct.on').get_attribute('data-n') == '12')
        n0 = lib()
        toast_clear(); pg.click('#dcadd'); toast_wait('^1 page added', 20000)
        check('Add page to cards adds the page in view (p.12)', pg.evaluate("()=>__app.KBLIB.some(i=>i.name=='Big p.12')") and lib() == n0 + 1)
        pg.evaluate("()=>{const v=document.querySelector('#dcvw');window.__sb=[];const o=v.scrollTo.bind(v);v.scrollTo=a=>{window.__sb.push(a.behavior);return o(a)}}")
        pg.click('#dcnext'); pg.wait_for_timeout(1500)
        d13 = pg.evaluate("()=>{const v=document.querySelector('#dcvw'),s=document.querySelector('.dcslot[data-n=\"13\"]');return Math.abs(v.scrollTop-(s.offsetTop-12))}")
        check('Next goes to page 13 and the view is there (%s, %s px away)' % (num(), d13), num() == '13' and d13 < 3)
        check('the arrow scrolls smoothly (animations on)', pg.evaluate("()=>window.__sb") == ['smooth'])
        pg.click('#dcnext'); pg.click('#dcnext'); pg.wait_for_timeout(1500)
        check('two quick clicks on Next go two pages on (%s)' % num(), num() == '15')
        pg.click('#dcprev'); pg.wait_for_timeout(1200)
        check('Previous goes back (%s)' % num(), num() == '14')
        pg.fill('#dcn', '5'); pg.press('#dcn', 'Enter'); pg.wait_for_timeout(1500)
        check('typing a page number goes there (%s)' % num(), num() == '5' and has(5))
        pg.click('#dcth .dct[data-n="20"]'); pg.wait_for_timeout(1500)
        check('a thumbnail goes to its page (%s)' % num(), num() == '20' and has(20))
        w0 = sl(20).bounding_box()['width']
        pg.click('#dczi'); pg.wait_for_timeout(1500)
        w1 = sl(20).bounding_box()['width']; w9 = sl(3).bounding_box()['width']
        check('zoom in enlarges all the pages (%d -> %d, page 3: %d), the place stays (%s)' % (w0, w1, w9, num()), w1 > w0 * 1.2 and abs(w9 - w1) < 2 and num() == '20')
        check('the zoomed page is drawn again at the new size', pg.evaluate("()=>{const c=document.querySelector('.dcslot[data-n=\"20\"] canvas');return !!c&&c.width>=Math.round(c.parentElement.getBoundingClientRect().width)}"))
        pg.click('#dcfp'); pg.wait_for_timeout(1500)
        if SHOTS: pg.screenshot(path=SHOTS + '/docs-scroll-page.png')
        hs = pg.evaluate("()=>{const v=document.querySelector('#dcvw');return [Math.max(...[...document.querySelectorAll('.dcslot')].map(s=>s.getBoundingClientRect().height)),v.clientHeight,document.querySelector('#dcz').textContent]}")
        check('Page: every page fits the view (%s)' % hs, hs[0] <= hs[1] + 1 and hs[2] == 'page')
        pg.click('#dcsc'); pg.wait_for_timeout(1500)
        check('Scroll off: one page again, the one that was in view (%s), not remembered' % num(), pg.locator('.dcslot').count() == 0 and pg.locator('#dcpg canvas.dcpage').count() == 1 and num() in ('19', '20', '21') and pg.evaluate("()=>localStorage.getItem('bmsdocscroll')") == '0')
        pg.click('#dcsc'); pg.wait_for_timeout(1200)
        # a PDF with pages of different sizes: the real sizes are read after the first display
        pg.click('#dclist .dcf >> text=Mixed'); pg.wait_for_timeout(3500)
        r = pg.evaluate("()=>[...document.querySelectorAll('.dcslot')].map(s=>{const b=s.getBoundingClientRect();return +(b.width/b.height).toFixed(2)})")
        check('pages of different sizes: the landscape page has its own shape (%s)' % r, len(r) == 4 and r[1] > 1.2 and r[0] < 0.8 and r[2] < 0.8)
        # the choice is remembered when the program is started again
        pg.reload(); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{__app.CFG.paths.bmsInstall='C:\\\\bms'}")
        pg.click('[data-t=dc]'); pg.wait_for_timeout(1200); pg.click('#dctabs [data-tab=manuals]'); pg.wait_for_timeout(500)
        pg.click('#dclist .dcf >> text=Big'); pg.wait_for_timeout(3000)
        check('after starting the program again the switch is still on and the pages are in slots', 'on' in (pg.get_attribute('#dcsc', 'class') or '').split() and pg.locator('.dcslot').count() == 25)
        # N = 1: nothing to scroll, no switch
        pg.fill('#dcq', 'checklist'); pg.wait_for_timeout(300)
        pg.click('#dclist .dcf >> text=Checklist'); pg.wait_for_timeout(2000)
        check('a PDF of one page has no Scroll switch and shows the page', pg.locator('#dcsc').count() == 0 and pg.locator('#dcpg canvas.dcpage').count() == 1)

        # ---- animations: the new controls change with a transition, and everything is off with Settings > Animations
        pg.fill('#dcq', 'big'); pg.wait_for_timeout(300)
        pg.click('#dclist .dcf >> text=Big'); pg.wait_for_timeout(2500)
        tr = lambda sel: pg.evaluate("s=>getComputedStyle(document.querySelector(s)).transitionDuration.split(',').some(x=>x.trim()!='0s')", sel)
        check('the Scroll switch and its knob change with a transition', tr('#dcsc') and tr('#dcsc i'))
        check('the canvas of a page fades in (animation)', pg.evaluate("()=>getComputedStyle(document.querySelector('.dcslot canvas')).animationName") == 'dcfade')
        pg.evaluate("()=>{__app.CFG.ui={...(__app.CFG.ui||{}),animations:false};document.documentElement.classList.add('noanim')}")
        check('animations off: the switch and the fade stop', not tr('#dcsc') and pg.evaluate("()=>getComputedStyle(document.querySelector('.dcslot canvas')).animationName") == 'none')
        pg.evaluate("()=>{const v=document.querySelector('#dcvw');window.__sb=[];const o=v.scrollTo.bind(v);v.scrollTo=a=>{window.__sb.push(a.behavior);return o(a)}}")
        pg.click('#dcnext'); pg.wait_for_timeout(800)
        check('animations off: the arrow jumps (no smooth scroll)', pg.evaluate("()=>window.__sb") == ['auto'])
        pg.evaluate(WATCH)  # the page was loaded again since the first one
        pg.click('#dcall'); pg.wait_for_function("()=>document.querySelector('#dcprog')", timeout=60000)
        check('animations off: the strip appears without animation', pg.evaluate("()=>window.__pa") == [0])
        pg.click('#dcpx'); pg.wait_for_function("()=>!document.querySelector('#dcprog')", timeout=60000)
        pg.evaluate("()=>{__app.CFG.ui={...(__app.CFG.ui||{}),animations:true};document.documentElement.classList.remove('noanim')}")
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
