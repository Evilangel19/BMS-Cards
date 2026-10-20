"""Docs tab (charts and manuals): tree, search, flight airports, viewer, Add to cards. Mocked Tauri file system with synthetic PDFs."""
import subprocess, sys, time, os, io, base64, json
from playwright.sync_api import sync_playwright
from reportlab.pdfgen import canvas
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
def pdf(pages):
    b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(595, 842))
    for t in pages:
        c.setFont('Helvetica-Bold', 28); c.drawString(60, 760, t); c.rect(40, 40, 515, 700); c.showPage()
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
  D + '01 Manuals\\readme.txt': base64.b64encode(b'x').decode(),
}
INIT = """(()=>{const F=new Map(Object.entries(%s).map(([k,v])=>[k,Uint8Array.from(atob(v),c=>c.charCodeAt(0))]));window.__F=F;
const ls=p=>{p=p.replace(/\\\\+$/,'');const o=new Map();for(const k of F.keys()){if(!k.startsWith(p+'\\\\'))continue;const r=k.slice(p.length+1).split('\\\\');o.set(r[0],r.length>1)}return [...o].map(([name,d])=>({name,isDirectory:d,isFile:!d,isSymlink:false}))};
window.__TAURI__={core:{invoke:async c=>c==='app_dir'?'C:\\\\app':null},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async p=>ls(p),readFile:async p=>{if(!F.has(p))throw new Error('missing');return F.get(p)},readTextFile:async()=>{throw new Error('none')},writeTextFile:async()=>{},
  writeFile:async(p,b)=>{F.set(p,new Uint8Array(b))},exists:async p=>F.has(p),mkdir:async()=>{}}};})();""" % json.dumps(files)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1000}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); pg.add_init_script(INIT)
        pg.goto('http://localhost:8799/app/index.html'); pg.wait_for_timeout(1000)
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
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
