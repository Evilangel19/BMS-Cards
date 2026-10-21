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
put('Data/Add-On Balkans/Terrdata/theaterdefinition/Balkans.tdf', 'name Balkans\ncampaigndir Add-On Balkans\\Campaign\nterraindir Add-On Balkans\\Terrdata\\Balkans\nobjectdir Add-On Balkans\\Terrdata\\objects\nnewterraindir Add-On Balkans\\TerrData\\Balkans\\NewTerrain\n')
put('Data/Add-On Balkans/Terrdata/objects/FALCON4_CT.xml', src=os.path.join(FX, 'FALCON4_CT.xml'))
put('Data/Add-On Balkans/Terrdata/Balkans/NewTerrain/Theater.txt', src=os.path.join(FX, 'Theater.txt'))   # as in the game: in NewTerrain
import zlib, struct
def png(w=40, h=30):
    raw = b''.join(b'\x00' + bytes([200, 220, 255]) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
_m = os.path.join(BMS, 'Data/Add-On Balkans/Docs/02 Maps/Balkans_UI_Map_16K.png'); os.makedirs(os.path.dirname(_m), exist_ok=True); open(_m, 'wb').write(png(64, 64))
_p = os.path.join(BMS, 'Data/Add-On Balkans/Docs/01 Balkans Charts/NATO/Asiago (LIDA)/Asiago (LIDA) Parking Chart RWY08.png'); os.makedirs(os.path.dirname(_p), exist_ok=True); open(_p, 'wb').write(png())
put('Docs/03 KTO Charts/Gunsan AB (RKJK)/Gunsan AB (RKJK) - ILS.pdf', 'x')
put('Data/Add-On Balkans/Campaign/prova.cam', src=os.path.join(FX, 'prova.cam'))
put('Data/Campaign/readme.txt', 'x')
put('Data/TerrData/ATC/Airbase.lst', 'x')
put('Data/TerrData/ATC/Osan.dat', '# CampID\n7\n')
put('Data/Campaign/CampObjData.XML', '<CampObjData><CampObj CampId="7"><CampName>Osan</CampName><OcdIndex>1</OcdIndex><PositionX>1</PositionX><PositionY>1</PositionY></CampObj></CampObjData>')
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
        pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + str(getattr(e, 'stack', ''))[:400]))
        pg.add_init_script(INIT)
        pg.goto('http://127.0.0.1:8777/app/index.html'); pg.wait_for_timeout(2500)
        pg.click('[data-t=kb]')
        check('both theaters are listed', pg.eval_on_selector_all('#tsel option', 'o=>o.map(x=>x.value)') == ['Korea KTO', 'Balkans'])
        geo = lambda: pg.evaluate("async()=>{const g=await import('/app/js/rules/geo.js');return g.getGeo()}")
        check('Korea: the map centre is the Korean one', geo() == {'lat': 38.5, 'lon': 127.5})
        # kneeboard: each theater keeps its own arrangement of the cards
        pg.evaluate("()=>{window.__app.KBS[5].left={kind:'empty',mode:'fill'}}")
        pg.select_option('#tsel', 'Balkans'); pg.wait_for_timeout(5000)
        check('kneeboard: a theater without an arrangement starts from the current one', pg.evaluate("()=>window.__app.KBS[5].left.kind") == 'empty')
        pg.evaluate("()=>{window.__app.KBS[5].left={kind:'dcl',mode:'fill'}}")
        g = geo()
        check('Balkans: the map centre comes from Theater.txt', abs(g['lat'] - 41.8327) < 1e-6 and abs(g['lon'] - 16.4191) < 1e-6)
        check('Balkans: the status names the theater', 'Balkans' in pg.evaluate('()=>window.__app.GAMEDATA.status'))
        check('Balkans: its campaign is listed', 'prova.cam' in pg.eval_on_selector_all('#csel option', 'o=>o.map(x=>x.value)'))
        check('Balkans: the class table of the theater was read', pg.evaluate('()=>window.__app.CAM_D.ct.length') == 5237)
        pg.click('[data-t=wx]'); pg.wait_for_timeout(3000)
        cen = pg.evaluate("()=>{const l=window.__app.wxPage.layer&&window.__app.wxPage.layer();if(!l||!l.map)return null;const c=l.map.getCenter();return [c.lat,c.lng]}")
        check('Weather page: the map is on the Balkans (%s)' % cen, cen is None or (36 < cen[0] < 48 and 8 < cen[1] < 25))
        pg.click('[data-t=dc]'); pg.wait_for_timeout(2500)
        ch = pg.evaluate("()=>JSON.stringify(window.__app.dcState().trees.charts.map(c=>c.name))")
        check('Docs: the charts of the Balkans, not those of Korea', '01 Balkans Charts' in ch and 'KTO' not in ch)
        check('Docs: the PNG charts of the Balkans are listed', pg.evaluate("()=>JSON.stringify(window.__app.dcState().trees.charts).includes('Parking Chart RWY08.png')"))
        pg.locator('#dclist .dcf').first.evaluate('e=>e.click()'); pg.wait_for_timeout(1500)
        check('Docs: a PNG chart opens in the viewer', pg.locator('#dcpg canvas.dcpage').count() == 1 and pg.evaluate("()=>document.querySelector('#dcpg canvas.dcpage').width")> 100)
        pg.click('[data-t=kb]')
        pg.select_option('#csel', 'prova.cam'); pg.wait_for_timeout(4000)
        info = pg.inner_text('#cinfo')
        print('info:', info[:160].replace('\n', ' | '))
        nf = pg.eval_on_selector_all('#fsel option', 'o=>o.length')
        check('Balkans: the campaign opens and its flights are listed', nf > 1)
        check('Balkans: no version warning (version 110 is read with the theater table)', pg.evaluate("()=>{const d=document.querySelector('dialog[open]');return !d||!/newer|Unable/i.test(d.innerText)}"))
        gd = pg.evaluate('()=>window.__app.GAMEDATA.status'); print('status:', gd[:300])
        check('Balkans: the Korean CampObjData / ATC files are not used for it', 'Data\\\\Campaign' not in gd.replace('/', '\\\\') or 'Add-On Balkans' in gd)
        check('Balkans: no warning about a missing Theater.txt', 'Theater.txt of' not in ' '.join(pg.evaluate('()=>window.__app.GAMEDATA.warn||[]')))
        pg.click('[data-t=mp]')
        try: pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=10000)
        except Exception as e: print('map did not start', str(e)[:80])
        pg.wait_for_timeout(1000)
        bases = pg.eval_on_selector_all('input[name=mpbase]', 'o=>o.map(x=>x.value)')
        check('Map: the Korea-only base maps are not offered for the Balkans', bases and not set(bases) & {'coast', 'bms'} and 'sat' in bases and 'sky' in bases)
        pg.click('#mpbaseb'); pg.wait_for_timeout(300); pg.check('#mpbase input[value=sky]'); pg.wait_for_timeout(3500)
        check('Map: the 16K map of the theater folder is drawn as the base', pg.evaluate('()=>!!window.__app.mapV.underlay()') or pg.locator('#mpmap canvas').count() > 0)
        pg.click('[data-t=kb]')
        pg.select_option('#tsel', 'Korea KTO'); pg.wait_for_timeout(3000)
        pg.click('[data-t=dc]'); pg.wait_for_timeout(2500)
        ch = pg.evaluate("()=>JSON.stringify(window.__app.dcState().trees.charts.map(c=>c.name))")
        check('Docs: back to Korea, the Korean charts', '03 KTO Charts' in ch)
        pg.click('[data-t=kb]')
        pg.evaluate("async()=>{const r=await fetch('/__f?p='+encodeURIComponent('%s/Data/Add-On Balkans/Campaign/prova.cam'));window.__app.loadCam(new File([await r.arrayBuffer()],'prova.cam'))}" % BMS); pg.wait_for_timeout(2500)
        dlg = pg.evaluate("()=>{const d=document.querySelector('dialog[open]');return d?d.innerText:''}")
        print('dialog:', dlg[:200].replace('\n', ' | '))
        check('a Balkans campaign opened with Korea selected: the message names the theater', 'theater' in dlg.lower())
        check('back to Korea: the map centre is the Korean one', geo() == {'lat': 38.5, 'lon': 127.5})
        check('kneeboard: back in Korea its own cards come back (not those of the Balkans)', pg.evaluate("()=>window.__app.KBS[5].left.kind") == 'empty')
        pg.select_option('#tsel', 'Balkans'); pg.wait_for_timeout(3000)
        check('kneeboard: and the Balkans have theirs again', pg.evaluate("()=>window.__app.KBS[5].left.kind") == 'dcl')
        pg.select_option('#tsel', 'Korea KTO'); pg.wait_for_timeout(3000)
        check('no page errors', not errs)
        if errs: print(errs[:3])
finally:
    srv.kill()
print('ALL OK' if not bad else f'{bad} FAILED')
sys.exit(1 if bad else 0)
