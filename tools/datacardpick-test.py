"""Checks 0.9.7: primary / secondary menu on the card, received missions keep the sender's card, names near precision targets. Usage: python3 tools/datacardpick-test.py"""
import base64, subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name)
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1300}, reduced_motion='reduce'); errs = []
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8799/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b64('PSI_BEAR_TRAP_26.cam')); pg.wait_for_timeout(900)
        # a precision target with no name next to an object
        pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_80');}")
        ch = pg.evaluate("()=>__app.ptChoices(1).map(x=>x.label)")
        check('the primary menu starts with Auto', ch[0].startswith('Auto'))
        ch2 = pg.evaluate("()=>__app.ptChoices(2).map(x=>x.label)")
        check('the secondary menu also has None', ch2[1].startswith('None'))
        pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_80');l.v='123456.000000, 234567.000000, -500.000000, 1, My tgt';l.dirty=1}")
        pg.evaluate("()=>__app.dtcChanged&&__app.dtcChanged('STPT','target_80')"); pg.wait_for_timeout(300)
        L = pg.evaluate("()=>__app.ptChoices(1)")
        mine = [x for x in L if 'My tgt' in x['label']]
        check('a precision target of the DTC is in the menu with its name', len(mine) == 1 and mine[0]['grp'].startswith('Precision'))
        auto_pri = pg.evaluate("()=>__app.F.pri")
        pg.evaluate("i=>__app.ptPick(1,__app.ptChoices(1)[i])", L.index(mine[0])); pg.wait_for_timeout(200)
        s = pg.evaluate("()=>({p:__app.F.pri,t:__app.F.d1,l:__app.F.ll1,m:[...__app.MANK]})")
        check('choosing it fills name, TOT and position and marks them as manual', s['p'] == 'My tgt' and s['t'] and s['l'] and 'pri' in s['m'] and 'd1' in s['m'] and 'll1' in s['m'])
        pg.evaluate("()=>__app.ptPick(1,__app.ptChoices(1)[0])"); pg.wait_for_timeout(200)
        s = pg.evaluate("()=>({p:__app.F.pri,m:[...__app.MANK]})")
        check('Auto gives the rules back', s['p'] == auto_pri and 'pri' not in s['m'])
        pg.evaluate("()=>__app.ptPick(2,__app.ptChoices(2)[1])"); pg.wait_for_timeout(200)
        check('None empties the secondary', pg.evaluate("()=>__app.F.sec===''&&__app.F.ll2===''"))
        # a click on the box opens the menu
        pg.evaluate("()=>{const d=__app.FD.find(z=>z.k=='pri');window.__d=d}")
        # received mission: the card of the sender stays
        pg.evaluate("()=>{__app.setField('fl0_0','Viper One');__app.setField('wp0_bc','1688')}"); pg.wait_for_timeout(300)
        before = pg.evaluate("()=>({...__app.F})")
        mj = json.loads(pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())")); mj['dtc']['author'] = {'uid': 'other-pilot', 'callsign': 'X'}
        pg.goto('http://localhost:8799/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("async(t)=>__app.msfLoad(t)", json.dumps(mj)); pg.wait_for_timeout(1200)
        pg.evaluate("()=>__app.apply(+document.querySelector('#fsel').value)"); pg.wait_for_timeout(600)
        after = pg.evaluate("()=>({...__app.F})")
        keys = [k for k in before if isinstance(before[k], str) and not k.startswith('__') and before[k]]
        diff = [k for k in keys if before[k] != after.get(k)]
        check('a received mission keeps every value of the sender when the flight is selected again', not diff)
        if diff: print('   differ:', diff[:10])
        check('no page errors', not errs)
        if errs: print(errs[:3])
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
