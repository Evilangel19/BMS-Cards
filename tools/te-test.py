"""Tactical Engagement (.tac): separate menu next to the campaign menu, handled like a campaign. Uses a fake BMS folder with Data/Campaign. Usage: python3 tools/te-test.py"""
import sys, os, subprocess, time, json, shutil, tempfile
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/'
BMS = tempfile.mkdtemp(); camp = BMS + '/Data/Campaign'; os.makedirs(camp); os.makedirs(BMS + '/User/Config')
for f in os.listdir(FX + 'te'):
    if f.startswith('TE_'): shutil.copy(FX + 'te/' + f, camp + '/' + f)
for f in ['EvilKorea.cam', 'EvilKorea.iff', 'EvilKorea.twx', 'EvilKorea_l16.txtpb']: shutil.copy(FX + 'evilkorea/' + f, camp + '/' + f)
open(camp + '/Save1.cam', 'wb').write(b'x')
INIT = """(()=>{const root=%s;window.__TAURI__={core:{invoke:async(c)=>{if(c==='app_dir')return '/app';if(c==='detect_bms')return root;return null}},dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async p=>await (await fetch('/__ls?p='+encodeURIComponent(p))).json(),readFile:async p=>new Uint8Array(await (await fetch('/__f?p='+encodeURIComponent(p))).arrayBuffer()),
  readTextFile:async p=>{ if(p.endsWith('config.json')) throw new Error('none'); return await (await fetch('/__f?p='+encodeURIComponent(p))).text()},writeTextFile:async()=>{},writeFile:async()=>{},exists:async p=>false,mkdir:async()=>{}}};})();""" % json.dumps(BMS)
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
http.server.HTTPServer(('127.0.0.1',8774),H).serve_forever()
'''
srv = subprocess.Popen([sys.executable, '-c', code, R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        import dialogs; dialogs.install(pg)
        pg.add_init_script(INIT)
        pg.goto('http://127.0.0.1:8774/app/index.html'); pg.wait_for_timeout(1800)
        co = pg.eval_on_selector_all('#csel option', 'o=>o.map(x=>x.value)'); to = pg.eval_on_selector_all('#tesel option', 'o=>o.map(x=>x.value)')
        check('the campaign menu lists only .cam files (no Save1, no .tac)', co == ['', 'EvilKorea.cam'])
        check('the Tactical Engagement menu lists the .tac files, with its own placeholder', to == ['', 'TE_BMS_03_F-16_DEAD.tac'] and pg.eval_on_selector('#tesel option', 'o=>o.textContent') == '— select a tactical engagement —')
        check('both menus are in the top bar, the theater menu is another one', pg.locator('#kbtop > #csel').count() == 1 and pg.locator('#kbtop > #tesel').count() == 1 and pg.locator('#tsel').count() == 1)
        pg.select_option('#tesel', 'TE_BMS_03_F-16_DEAD.tac'); pg.wait_for_timeout(2000)
        info = pg.inner_text('#cinfo')
        check('the TE is opened like a campaign: 5 flights', pg.eval_on_selector('#fsel', 'e=>e.options.length') == 5)
        check('the info line says Tactical Engagement and the companion files were found (IFF, date, Link16; no weather map)', info.startswith('Tactical Engagement.') and all(k in info for k in ['IFF', 'date', 'Link16']) and 'Not found: weather' in info)
        check('the datacard names the engagement and the TE is flagged', pg.evaluate("()=>__app.F.mis") == 'TE_BMS_03_F-16_DEAD' and pg.evaluate("()=>__app.C.isTe") is True)
        check('selecting a TE clears the campaign menu', pg.input_value('#csel') == '' and pg.input_value('#tesel') == 'TE_BMS_03_F-16_DEAD.tac')
        pg.select_option('#csel', 'EvilKorea.cam'); pg.wait_for_timeout(2000)
        check('selecting a campaign clears the TE menu and loads a normal campaign', pg.input_value('#tesel') == '' and pg.evaluate("()=>__app.C.isTe") is False and pg.eval_on_selector('#fsel', 'e=>e.options.length') > 5)
        pg.select_option('#tesel', 'TE_BMS_03_F-16_DEAD.tac'); pg.wait_for_timeout(2000)
        pg.click('[data-t=sq]'); pg.wait_for_timeout(500)
        check('squadron page: says there is no player squadron in a TE', 'Tactical Engagement' in pg.inner_text('#sq'))
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(800)
        check('map page: both menus sit in the map bar', pg.locator('#mpcam #csel').count() == 1 and pg.locator('#mpcam #tesel').count() == 1 and pg.is_visible('#mpcam #tesel'))
        pg.click('[data-t=kb]'); pg.wait_for_timeout(400)
        check('back on the datacard page the menus return to the top bar', pg.locator('#kbtop > #tesel').count() == 1 and pg.locator('#mpcam #tesel').count() == 0)
        check('no page errors', not errs); [print(e) for e in errs]
        br.close()
finally:
    srv.kill(); shutil.rmtree(BMS, ignore_errors=True)
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
