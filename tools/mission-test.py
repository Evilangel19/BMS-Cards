"""Checks the mission file: save from a campaign, open it without the campaign. Usage: python3 tools/mission-test.py"""
import base64, subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8797', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name)
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1700, 'height': 1300}, reduced_motion='reduce'); errs = []
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8797/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b64('PSI_BEAR_TRAP_26.cam'))
        pg.wait_for_timeout(800)
        pg.evaluate("async(b)=>{await __app.loadFmap(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.fmap'))}", b64('PSI_BEAR_TRAP_26.fmap')); pg.wait_for_timeout(600)
        check('the Mission buttons are in the top bar', pg.locator('#msfsave').count() == 1 and pg.locator('#msfopen').count() == 1)
        pg.evaluate("()=>{__app.dtcSet?0:0;const l=__app.lines.find(l=>l.k=='target_3');}")
        pg.wait_for_timeout(900)
        check('Save mission is dimmed while nothing changed', 'nil' in pg.get_attribute('#msfsave', 'class'))
        # a manual change of the datacard and a change of the DTC
        pg.evaluate("()=>{__app.setField('ab0_4','ZZ99');}"); pg.wait_for_timeout(200)
        pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_3');l.v='123456.000000, 234567.000000, -500.000000, 1, ';l.dirty=1}")
        pg.wait_for_timeout(900)
        check('Save mission lights up after a change', 'nil' not in pg.get_attribute('#msfsave', 'class'))
        before = pg.evaluate("()=>({f:{...__app.F}, fl:document.querySelector('#fsel').selectedOptions[0].textContent})")
        pg.evaluate("()=>{__app.wpPage.setState({mode:'toss'});__app.msPage.setState({mode:'bvr'});const c=document.createElement('canvas');c.width=564;c.height=752;const x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,564,752);__app.MAPSHOT=c}")
        msf = pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())")
        mj = json.loads(msf)
        check('the mission holds the weapons data and the map image', mj['weapons']['wp']['mode'] == 'toss' and mj['weapons']['bvr']['mode'] == 'bvr' and mj['mapshot'].startswith('data:image/png'))
        check('no kneeboard backup folder name in the mission', pg.evaluate("()=>!JSON.stringify(__app.missionExt).includes('backup')"))
        o = json.loads(msf)
        check('the mission holds the package, the DTC with its edits apart, and the datacard with the manual values', o['format'] == 'bms-cards-mission' and len(o['package']['units']) > 3 and any(e['k'] == 'target_3' for e in o['dtc']['edits']) and 'ab0_4' in o['datacard']['manual'] and o['datacard']['manual']['ab0_4'] == 'ZZ99')
        import re; check('the default name of the mission is package number + callsign (' + o['name'] + ')', re.match(r'^\d+ \S', o['name']) is not None)
        check('the weather travels in the mission', bool(o.get('weather') and o['weather'].get('fmap')) and bool(before['f'].get('atis')))
        print('  size', len(msf)); check('the mission is smaller than the whole campaign (only the package and what is near its route)', len(msf) < 1_600_000)
        try:
            with pg.expect_download(timeout=8000): pg.click('#msfsave')
        except Exception: pass
        pg.wait_for_timeout(400)
        check('saving the mission says so', pg.evaluate("()=>{const t=document.getElementById('apptoast');return !!t&&/Mission saved/.test(t.textContent)&&t.style.display!='none'}"))
        # a fresh page: no campaign, no DTC
        pg.goto('http://localhost:8797/app/index.html'); pg.wait_for_timeout(800)
        check('without the campaign there is no flight', pg.evaluate("()=>!__app.C"))
        pg.evaluate("async(t)=>__app.msfLoad(t)", msf); pg.wait_for_timeout(900)
        check('weapons data and map image restored', pg.evaluate("()=>__app.wpPage.state().mode=='toss'&&__app.msPage.state().mode=='bvr'&&!!__app.MAPSHOT&&__app.MAPSHOT.width==564"))
        after = pg.evaluate("()=>({f:{...__app.F}, fl:document.querySelector('#fsel').selectedOptions[0].textContent, man:[...__app.MANK]})")
        keys = [k for k in before['f'] if isinstance(before['f'][k], str) and not k.startswith('__')]
        diff = [k for k in keys if before['f'][k] != after['f'].get(k)]
        check('the mission opens without the campaign: same flight, same datacard values', before['fl'] == after['fl'] and not diff)
        if diff: print('   differ:', diff[:8])
        check('the manual change is still marked as manual', 'ab0_4' in after['man'] and after['f']['ab0_4'] == 'ZZ99')
        check('the DTC is back with the edit applied', pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_3');return !!l&&l.v.startsWith('123456')&&!!l.dirty}"))
        pg.evaluate("()=>__app.lines.forEach(l=>{l.dirty=0})"); pg.wait_for_timeout(100)
        check('an opened mission is not unsaved, and saving the DTC (the edited marks go out) does not make it so', pg.evaluate("()=>__app.unsaved()") is False)
        check('the weather is back (ATIS and TAF come from it)', pg.evaluate("()=>!!!!__app.WX&&__app.WX.X>0"))
        check('the weapons page can use the flight of the mission', pg.evaluate("()=>__app.C.units.some(u=>u.kind=='flight')"))
        # the weather of each hour: the maps of takeoff -> landing are stored and used by time
        pg.evaluate("()=>{const i=document.querySelector('#fsel').selectedIndex;const f=__app.CL[Math.max(0,i-1)].f;__app.wxKeys(f).forEach(k=>__app.WXS.set(k,__app.WX));window.__nk=__app.wxKeys(f).length}")
        o3 = json.loads(pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())"))
        nk = pg.evaluate("()=>window.__nk")
        check('the hourly weather maps of the flight are in the mission (%d)' % nk, nk > 0 and len((o3['weather'] or {}).get('series', {})) == nk)
        check('wxKey: day 15 at 21:00 is 152100', pg.evaluate("()=>__app.wxKey((14*86400+21*3600)*1000)") == 152100 and pg.evaluate("()=>__app.wxKey(3600*1000)") == 10100)
        pg.evaluate("async(t)=>__app.msfLoad(t)", json.dumps(o3)); pg.wait_for_timeout(900)
        check('the hourly maps come back with the mission', pg.evaluate("()=>__app.WXS.size") == nk)
        # the radius is a setting
        pg.click('#cfgbtn'); pg.wait_for_timeout(500)
        pg.fill('#cfg input[type=number]', '25'); pg.click('#cfg .btn:not(.g)'); pg.wait_for_timeout(500)
        o2 = json.loads(pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())"))
        check('the mission radius comes from the Settings (25 nm)', o2['package'].get('radiusNm') == 25)
        # standalone: the map and the weapons / missiles pages work from the mission alone
        errs.clear()
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1500)
        check('the map shows the flights and units of the mission', pg.evaluate("()=>document.querySelectorAll('#mpbody .leaflet-marker-icon, #mpbody svg path, #mpbody canvas').length>0"))
        pg.click('[data-t=wp]'); pg.wait_for_timeout(1200)
        check('the weapons page opens from the mission', pg.is_visible('#wp') and pg.locator('#wp .wcard, #wp .wrow').count() > 0)
        pg.click('[data-t=ms]') if pg.locator('[data-t=ms]').count() else None; pg.wait_for_timeout(800)
        check('no page errors in standalone use', not errs); print(errs)
        check('no page errors', not errs); print(errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
