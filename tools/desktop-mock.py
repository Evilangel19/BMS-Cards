"""Checks the campaign list with a mocked Tauri API on a fake BMS folder. Usage: python3 tools/desktop-mock.py FAKE_BMS_DIR"""
import sys, os, subprocess, time, json, base64
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BMS = os.path.abspath(sys.argv[1])
INIT = """
(()=>{const root=%s;const fs=require_fs();function require_fs(){return null}
window.__TAURI__={core:{invoke:async(c)=>{if(c==='app_dir')return '/app';if(c==='detect_bms')return root;return null}},
 dialog:{open:async()=>null,save:async()=>null},
 fs:{readDir:async p=>await (await fetch('/__ls?p='+encodeURIComponent(p))).json(),
  readFile:async p=>new Uint8Array(await (await fetch('/__f?p='+encodeURIComponent(p))).arrayBuffer()),
  readTextFile:async p=>{const m=window.__TX;if(m&&m.has(p))return m.get(p); if(p.endsWith('config.json')) throw new Error('none'); return await (await fetch('/__f?p='+encodeURIComponent(p))).text()},
  writeTextFile:async(p,s)=>{(window.__TX=window.__TX||new Map()).set(p,s)},writeFile:async()=>{},exists:async p=>false,mkdir:async()=>{}}};})();
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
http.server.HTTPServer(('127.0.0.1',8766),H).serve_forever()
'''
srv = subprocess.Popen([sys.executable, '-c', code, R]); time.sleep(1)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(INIT)
        pg.goto('http://127.0.0.1:8766/app/index.html'); pg.wait_for_timeout(1500)
        print('options:', pg.eval_on_selector_all('#csel option', 'o=>o.map(x=>x.textContent)'))
        pg.click('[data-t=kb]'); print('theaters:', pg.eval_on_selector_all('#tsel option','o=>o.map(x=>x.textContent)'), 'visible:', pg.is_visible('#tsel')); print('status:', pg.evaluate('()=>window.__app.GAMEDATA.status')[-160:]); pg.select_option('#csel', 'PSI_BEAR_TRAP_26.cam'); pg.wait_for_timeout(1500)
        print('info:', pg.inner_text('#cinfo'))
        print('flights:', pg.eval_on_selector_all('#fsel option', 'o=>o.length'), 'd1:', pg.input_value('#d1'))
        print('atis set:', pg.evaluate("()=>!!window.__app.F.atis"), 'stn:', pg.evaluate("()=>window.__app.F.fl0_3"))
        pg.select_option('#csel', 'EvilKorea.cam'); pg.wait_for_timeout(1500)
        print('info2:', pg.inner_text('#cinfo'))
        pg.select_option('#tsel','Korea TvT'); pg.wait_for_timeout(1500)
        print('tvt campaigns:', pg.eval_on_selector_all('#csel option', 'o=>o.map(x=>x.textContent)'))
        print('tvt status:', pg.evaluate('()=>window.__app.GAMEDATA.status')[:160])
        print('runways:', pg.evaluate("()=>JSON.stringify(Object.keys(window.__app.CAM_D.ap).length)+' '+JSON.stringify(window.__app.CAM_D.ap[997])+' '+JSON.stringify(window.__app.CAM_D.api['RKSM'])+' el997='+window.__app.CAM_D.el[997]"))
        print('errors:', errs)
finally:
    srv.kill()
