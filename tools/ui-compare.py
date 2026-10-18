"""Compare the prototype page (legacy/) with the modular app (app/) on the same inputs:
parsed Link16/IFF/DTC/date data, datacard fields and the exported DDS bytes.
Local check (needs python3 + playwright + chromium). Usage: python3 tools/ui-compare.py"""
import base64, hashlib, json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
files = {k: b64(v) for k, v in {'cam': 'PSI_BEAR_TRAP_26.cam', 'fmap': 'PSI_BEAR_TRAP_26.fmap', 'twx': 'PSI_BEAR_TRAP_26.twx',
         'l16': 'PSI_BEAR_TRAP_26.l16.txtpb', 'iff': 'PSI_BEAR_TRAP_26.iff', 'dtc': 'Evil19_2_.ini'}.items()}

JS = """async([files,flight,legacy])=>{
 const f=(k,n)=>{const bin=Uint8Array.from(atob(files[k]),c=>c.charCodeAt(0));return new File([bin],n)};
 const A=legacy?{loadCam,loadFmap,loadL16,loadIFF,loadTwx,parse,apply,draw,gapless,toDDS,toDDS5,get F(){return F}}:window.__app;
 await A.loadCam(f('cam','x.cam'));await A.loadFmap(f('fmap','x.fmap'));await A.loadL16(f('l16','x.txtpb'));
 await A.loadIFF(f('iff','x.iff'));await A.loadTwx(f('twx','x.twx'));
 A.parse(new TextDecoder('latin1').decode(Uint8Array.from(atob(files.dtc),c=>c.charCodeAt(0))));
 if(!legacy){const o=[...document.getElementById('fsel').options].map((x,i)=>[x.text,i]).filter(x=>/F-16/.test(x[0]));flight=o[flight][1]}
 document.getElementById('fsel').value=flight;A.apply(flight);Object.keys(A.F).filter(k=>/^ab\\d+_[56]$/.test(k)).forEach(k=>A.F[k]='');A.draw();
 const d=A.gapless().getContext('2d').getImageData(0,0,2048,2048).data;
 const dds1=new Uint8Array(A.toDDS(2048,d)),dds5=new Uint8Array(A.toDDS5(2048,d));
 const h=async u=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',u))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {F:JSON.stringify(A.F),d1:document.getElementById('d1').value,dds1:await h(dds1),dds5:await h(dds5)}}"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
ok = True
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for flight in (13, 3, 20):
            out = {}
            for name, url, legacy in (('legacy', 'http://localhost:8765/legacy/BMS-Planner.html', True), ('app', 'http://localhost:8765/app/index.html', False)):
                pg = br.new_page(); errs = []
                import dialogs; dialogs.install(pg)
                pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
                pg.goto(url); pg.wait_for_timeout(800)
                r = pg.evaluate(JS, [files, flight, legacy])
                out[name] = (r, errs); pg.close()
            # runway and ILS columns (ab*_5, ab*_6) are read from BMS files now, not from the prototype's table: not compared
            import re
            strip = lambda r: {k: v for k, v in json.loads(r['F']).items() if not re.match(r'^ab\d+_[56]$', k)}
            sep = '\\n\\n' in out['app'][0]['F']  # the app separates the supplement groups with a blank line (drawn as a rule): text compared without it, images skipped
            for n in ('legacy', 'app'):
                f = strip(out[n][0])
                if 'free' in f: f['free'] = f['free'].replace('\n\n', '\n')
                out[n][0]['F'] = json.dumps(f, sort_keys=True)
            keys = ('F', 'd1') if sep else ('F', 'd1', 'dds1', 'dds5')
            same = all(out['legacy'][0][k] == out['app'][0][k] for k in keys)
            ok &= same and not out['legacy'][1] and not out['app'][1]
            if not same: print({k:(out['legacy'][0][k]==out['app'][0][k]) for k in ('F','d1','dds1','dds5')})
            print('flight', flight, ('IDENTICAL' if same else 'DIFFERENT') + (' (text only: supplement separators)' if sep else ''), 'errors:', out['legacy'][1], out['app'][1])
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
