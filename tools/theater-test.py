"""Another theater (Balkans) on a fake BMS folder with a mocked Tauri API: the theater menu, the class table of that theater, Theater.txt (map centre), the map base pictures.
Needs tests/fixtures/balkans (local copies). Usage: python3 tools/theater-test.py"""
import sys, os, subprocess, time, json, shutil
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(R, 'tests', 'fixtures', 'balkans')
if not os.path.exists(os.path.join(FX, 'prova.cam')):
    print('SKIP - no Balkans fixture'); sys.exit(0)
BMS = '/tmp/fakebms-theater'; shutil.rmtree(BMS, ignore_errors=True)
def put(rel, data=None, src=None):
    p = os.path.join(BMS, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    if src: shutil.copy(src, p)
    else: open(p, 'w').write(data)
put('Data/Theater.lst', 'TerrData\\TheaterDefinition\\Korea KTO.tdf\r\nAdd-On Balkans\\Terrdata\\theaterdefinition\\Balkans.tdf\r\n')
put('Data/TerrData/TheaterDefinition/Korea KTO.tdf', 'name Korea KTO\ncampaigndir Campaign\nterraindir Terrdata\\korea\nobjectdir Terrdata\\objects\n')
put('Data/Add-On Balkans/Terrdata/theaterdefinition/Balkans.tdf', 'name Balkans\ncampaigndir Add-On Balkans\\Campaign\nterraindir Add-On Balkans\\Terrdata\\Balkans\nobjectdir Add-On Balkans\\Terrdata\\objects\n')
put('Data/Add-On Balkans/Terrdata/objects/FALCON4_CT.xml', src=os.path.join(FX, 'FALCON4_CT.xml'))
put('Data/Add-On Balkans/Terrdata/Balkans/Theater.txt', src=os.path.join(FX, 'Theater.txt'))
put('Data/Add-On Balkans/Campaign/prova.cam', src=os.path.join(FX, 'prova.cam'))
put('Data/Campaign/readme.txt', 'x')
KCT = '/mnt/user-data/uploads/Falcon4_CT.xml'
if os.path.exists(KCT): put('Data/TerrData/Objects/Falcon4_CT.xml', src=KCT)
INIT = """
(()=>{const root=%s;
window.__TAURI__={core:{invoke:async(c)=>{if(c==='app_dir')return '/app';if(c==='detect_bms')return root;return null}},
 dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async p=>await (await fetch('/__ls?p='+encodeURIComponent(p))).json(),
  readFile:async p=>new Uint8Array(await (await fetch('/__f?p='+encodeURIComponent(p))).arrayBuffer()),
  readTextFile:async p=>{ if(p.endsWith('config.json')) throw new Error('none'); return await (await fetch('/__f?p='+encodeURIComponent(p))).text()},
  writeTextFile:async()=>{},writeFile:async()=>{},exists:async p=>false,mkdir:async()=>{}}};})();
""" % json.dumps(BMS)
code = r'''
import http.server, os, json, urllib.parse, sys
R=sys.argv[1]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=R,**k)
    def log_message(s,*a): pass
    def do_GET(s):
        u=urllib.parse.urlparse(s.path); q=urllib.parse.parse_qs(u.query)
        if u.path=='/__ls':
            p=q['p'][0]; out=[{'name':n,'isDirectory':os.path.isdir(os.path.join(p,n)),'isFile':os.path.isfile(os.path.join(p,n)),'isSymlink':False} for n in os.listdir(p)] if os.path.isdir(p) else []
            b=json.dumps(out).encode(); s.send_response(200); s.send_header('Content-Type','application/json'); s.end_headers(); s.wfile.write(b); return
        if u.path=='/__f':
            p=q['p'][0]
            if not os.path.isfile(p): s.send_response(404); s.end_headers(); return
            b=open(p,'rb').read(); s.send_response(200); s.end_headers(); s.wfile.write(b); return
        super().do_GET()
http.server.HTTPServer(('127.0.0.1',8777),H).serve_forever()
'''
srv = subprocess.Popen([sys.executable, '-c', code, R]); time.sleep(1)
bad = 0
def check(m, c):
    global bad
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: bad += 1
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(INIT)
        pg.goto('http://127.0.0.1:8777/app/index.html'); pg.wait_for_timeout(2500)
        pg.click('[data-t=kb]')
        check('both theaters are listed', pg.eval_on_selector_all('#tsel option', 'o=>o.map(x=>x.value)') == ['Korea KTO', 'Balkans'])
        geo = lambda: pg.evaluate("async()=>{const g=await import('/app/js/rules/geo.js');return g.getGeo()}")
        check('Korea: the map centre is the Korean one', geo() == {'lat': 38.5, 'lon': 127.5})
        pg.select_option('#tsel', 'Balkans'); pg.wait_for_timeout(5000)
        g = geo()
        check('Balkans: the map centre comes from Theater.txt', abs(g['lat'] - 41.8327) < 1e-6 and abs(g['lon'] - 16.4191) < 1e-6)
        check('Balkans: the status names the theater', 'Balkans' in pg.evaluate('()=>window.__app.GAMEDATA.status'))
        check('Balkans: its campaign is listed', 'prova.cam' in pg.eval_on_selector_all('#csel option', 'o=>o.map(x=>x.value)'))
        check('Balkans: the class table of the theater was read', pg.evaluate('()=>window.__app.CAM_D.ct.length') == 5237)
        pg.select_option('#csel', 'prova.cam'); pg.wait_for_timeout(4000)
        info = pg.inner_text('#cinfo')
        print('info:', info[:160].replace('\n', ' | '))
        nf = pg.eval_on_selector_all('#fsel option', 'o=>o.length')
        check('Balkans: the campaign opens and its flights are listed', nf > 1)
        check('Balkans: no version warning (version 110 is read with the theater table)', pg.evaluate("()=>{const d=document.querySelector('dialog[open]');return !d||!/newer|Unable/i.test(d.innerText)}"))
        check('Balkans: no warning about a missing Theater.txt', 'Theater.txt of' not in ' '.join(pg.evaluate('()=>window.__app.GAMEDATA.warn||[]')))
        pg.select_option('#tsel', 'Korea KTO'); pg.wait_for_timeout(3000)
        pg.evaluate("async()=>{const r=await fetch('/__f?p='+encodeURIComponent('%s/Data/Add-On Balkans/Campaign/prova.cam'));window.__app.loadCam(new File([await r.arrayBuffer()],'prova.cam'))}" % BMS); pg.wait_for_timeout(2500)
        dlg = pg.evaluate("()=>{const d=document.querySelector('dialog[open]');return d?d.innerText:''}")
        print('dialog:', dlg[:200].replace('\n', ' | '))
        check('a Balkans campaign opened with Korea selected: the message names the theater', 'theater' in dlg.lower())
        check('back to Korea: the map centre is the Korean one', geo() == {'lat': 38.5, 'lon': 127.5})
        check('no page errors', not errs)
        if errs: print(errs[:3])
finally:
    srv.kill()
print('ALL OK' if not bad else f'{bad} FAILED')
sys.exit(1 if bad else 0)
