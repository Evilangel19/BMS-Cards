"""Serves the app with the Content Security Policy of src-tauri/tauri.conf.json and visits every tab: nothing may be blocked by the policy. Usage: python3 tools/csp-test.py"""
import base64, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
CSP = json.load(open(R + '/src-tauri/tauri.conf.json'))['app']['security']['csp']
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=R, **k)
    def end_headers(s):
        s.send_header('Content-Security-Policy', CSP); super().end_headers()
    def log_message(s, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8781), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1300}); errs = []
        pg.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'')+' '+(e.sourceFile||'')+':'+(e.lineNumber||'')))")
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if 'Content Security Policy' in m.text or 'Refused to' in m.text else None)
        pg.goto('http://127.0.0.1:8781/app/index.html'); pg.wait_for_timeout(1500)
        b = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b); pg.wait_for_timeout(1000)
        for t in pg.evaluate("[...document.querySelectorAll('button.tab[data-t]')].map(b=>b.dataset.t)"):
            pg.click(f'button.tab[data-t={t}]'); pg.wait_for_timeout(700)
        pg.click('button.tab[data-t=dtc]'); pg.wait_for_timeout(500)
        v = pg.evaluate('window.__csp')
        check('the page loads and shows the datacard', pg.evaluate("document.querySelectorAll('#form input').length") > 10)
        check('the map loaded Leaflet (a script of the vendor folder)', pg.evaluate("!!window.L"))
        check('no script, style, image or connection is blocked by the policy (%s)' % '; '.join(v[:4]), not v and not errs)
        if errs: print(errs[:5])
        br.close()
finally:
    srv.shutdown()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
