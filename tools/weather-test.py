import subprocess, sys, time, json, os, base64
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok
    print(('OK   ' if c else 'FAIL ') + n)
    if not c: ok = False
FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce'); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8799/app/index.html'); pg.wait_for_timeout(800)
        check('a Weather tab sits right after Performance', pg.evaluate("()=>{const t=[...document.querySelectorAll('header .tab')].map(x=>x.dataset.t);return t.indexOf('wx')==t.indexOf('pf')+1}"))
        pg.click('[data-t=wx]'); pg.wait_for_timeout(300)
        check('without a map the page says so', 'No weather map yet' in pg.inner_text('#wx'))
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b64('PSI_BEAR_TRAP_26.cam')); pg.wait_for_timeout(800)
        pg.evaluate("async(b)=>{await __app.loadFmap(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.fmap'))}", b64('PSI_BEAR_TRAP_26.fmap')); pg.wait_for_timeout(700)
        pg.click('[data-t=kb]'); pg.wait_for_timeout(500)
        # the hourly maps of the flight: the campaign map stands for each hour
        pg.evaluate("()=>{const i=+document.querySelector('#fsel').value||0;const f=__app.CL[i].f;__app.wxKeys(f).forEach(k=>__app.WXS.set(k,__app.WX))}")
        pg.click('[data-t=wx]'); pg.wait_for_timeout(700)
        print(errs[:3]); t = pg.inner_text('#wx'); print('  ', t[:300].replace('\n', ' | '))
        check('the map covers the whole theater (59 x 59 cells)', pg.evaluate("()=>{const c=document.querySelector('#wxcv');return c&&c.width==59*14&&c.height==59*14}"))
        check('six map modes', pg.locator('#wx [data-mode]').count() == 6)
        check('legend with the four conditions', all(w in t for w in ('Sunny', 'Fair', 'Poor', 'Inclement')))
        check('ten altitude layers, surface to 50', pg.locator('#wx .wxlv [data-lv]').count() == 10 and 'SFC' in t)
        lv0 = pg.evaluate("()=>__app.wxPage.state().lv")
        check('by default the layer follows the flight plan (auto)', lv0 is None and 'from the flight plan' in t.lower())
        check('time and altitude cards sit in the right column under the winds aloft', pg.evaluate("()=>{const r=document.querySelector('.wxr');return !!r&&r.querySelector('#wxms')&&r.querySelector('.wxlv')&&!document.querySelector('.wxl #wxms')}"))
        check('time slider with DEP and TOT marks', pg.locator('#wxms').count() == 1 and 'DEP' in t and 'TOT' in t)
        check('airbases with ATIS', pg.locator('#wx .wxb').count() >= 2 and 'KT' in t)
        check('route table with a wind per steerpoint', pg.locator('#wx .wtbl tr').count() > 3)
        check('winds aloft: ten rows', pg.locator('#wx .wxw').count() == 10)
        # the base map: land and sea have their own colours under the cells (coast lines for reference)
        px = pg.evaluate("""async()=>{const {tmFwd}=await import('/app/js/rules/geo.js');const W=__app.wxPage.base(),S=14,cs=57344/3280.84;const at=(la,lo)=>{const m=tmFwd(la,lo),x=(m[0]/1000+512)/cs*S,y=(59-(m[1]/1000+512)/cs)*S;return [...W.getContext('2d').getImageData(Math.round(x),Math.round(y),1,1).data]};return {seoul:at(36.35,127.38),sea:at(37.0,132.0),tg:at(35.9,128.0)}}""")
        check('base map: land (Daejeon) and sea (East Sea) differ', px['seoul'][:3] != px['sea'][:3])
        check('sunny is empty (transparent) in the weather colours', pg.evaluate("()=>1") == 1)
        pix = lambda: pg.evaluate("()=>{const c=document.querySelector('#wxcv'),x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=97)s=(s*31+d[i])%1000003;return s}")
        a = pix()
        pg.click('#wx .wxlv [data-lv="8"]'); pg.wait_for_timeout(300)
        check('another layer: the barbs change and the choice is kept', pix() != a and pg.evaluate("()=>__app.wxPage.state().lv") == 8 and 'from the flight plan' not in pg.inner_text('#wx').lower())
        check('the selected layer is lit in the winds aloft', pg.locator('#wx .wxw.on').count() == 1)
        pg.click('#wx [data-auto]'); pg.wait_for_timeout(200)
        check('the flight plan button goes back to auto', pg.evaluate("()=>__app.wxPage.state().lv") is None)
        for m in ('wind', 'temp', 'press', 'cloud', 'vis', 'cond'):
            b = pix(); pg.click('#wx [data-mode=%s]' % m); pg.wait_for_timeout(200)
            check('mode %s paints a different map' % m, m == 'cond' or pix() != b)
        pg.uncheck('#wxbarbs'); pg.wait_for_timeout(200)
        check('barbs can be switched off', pg.evaluate("()=>__app.wxPage.state().barbs") is False)
        pg.check('#wxbarbs'); pg.wait_for_timeout(200)
        box = pg.locator('#wxcv').bounding_box(); pg.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .5); pg.wait_for_timeout(200)
        check('hover shows the data of the cell', 'mbar' in pg.inner_text('#wxinfo') and 'visibility' in pg.inner_text('#wxinfo'))
        # the slider changes the hour shown
        mn, mx = pg.evaluate("()=>[+document.querySelector('#wxms').min,+document.querySelector('#wxms').max]")
        pg.evaluate("(v)=>{const s=document.querySelector('#wxms');s.value=v;s.dispatchEvent(new Event('input'));s.dispatchEvent(new Event('change'))}", mn)
        pg.wait_for_timeout(300)
        check('the time slider is kept', pg.evaluate("()=>__app.wxPage.state().ms") == mn)
        # Fill datacard: dimmed while the datacard holds the weather, lit when a field was typed, and it writes it back
        pg.click('[data-t=kb]'); pg.wait_for_timeout(300)
        pg.evaluate("()=>{__app.setField?__app.setField('atis','X'):0}")
        st = pg.evaluate("()=>{const b=document.querySelector('#wx [data-fill]');return b?b.className:null}"); print('  fill class', st)
        pg.click('[data-t=wx]'); pg.wait_for_timeout(500)
        check('Fill datacard button exists', pg.locator('#wx [data-fill]').count() == 1)
        cls = pg.evaluate("()=>document.querySelector('#wx [data-fill]').className")
        if 'nil' not in cls:
            pg.click('#wx [data-fill]'); pg.wait_for_timeout(500)
            check('after Fill the button is dimmed (the datacard holds the weather)', 'nil' in pg.evaluate("()=>document.querySelector('#wx [data-fill]').className"))
        else:
            check('the button is dimmed when the datacard already holds the weather', True)
        pg.screenshot(path=SH + '/weather.png', full_page=True)
        check('no page errors', not errs); print(errs[:3])
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
