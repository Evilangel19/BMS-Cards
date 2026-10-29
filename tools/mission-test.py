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
        check('one Open menu replaces the three buttons', pg.is_visible('#openm') and not pg.is_visible('#open') and not pg.is_visible('#msfopen') and not pg.is_visible('#cam'))
        pg.click('#openm'); check('the menu lists DTC, Mission and Campaign', pg.is_visible('#openmenu') and [x.strip().split('\n')[0] for x in pg.locator('#openmenu button').all_inner_texts()] == ['DTC…', 'Mission…', 'Campaign…'])
        pg.keyboard.press('Escape'); check('Escape closes the menu', not pg.is_visible('#openmenu'))
        pg.click('#openm'); pg.mouse.click(900, 700); check('a click outside closes the menu', not pg.is_visible('#openmenu'))
        check('the Mission buttons are in the top bar', pg.locator('#msfsave').count() == 1 and pg.locator('#msfopen').count() == 1)
        pg.evaluate("()=>{__app.dtcSet?0:0;const l=__app.lines.find(l=>l.k=='target_83');}")
        pg.wait_for_timeout(900)
        check('Save mission is lit while a flight is chosen and the mission is not saved (dark with no flight)', ('nil' in pg.get_attribute('#msfsave', 'class')) == (not pg.evaluate("()=>document.getElementById('fsel').value")))
        # a manual change of the datacard and a change of the DTC
        pg.evaluate("()=>{__app.setField('ab0_4','ZZ99');}"); pg.wait_for_timeout(200)
        pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_83');l.v='123456.000000, 234567.000000, -500.000000, 1, ';l.dirty=1}")
        pg.wait_for_timeout(900)
        check('Save mission lights up after a change', 'nil' not in pg.get_attribute('#msfsave', 'class'))
        before = pg.evaluate("()=>({f:{...__app.F}, fl:document.querySelector('#fsel').selectedOptions[0].textContent})")
        pg.evaluate("()=>{__app.wpPage.setState({mode:'toss'});__app.msPage.setState({mode:'bvr'});const c=document.createElement('canvas');c.width=564;c.height=752;const x=c.getContext('2d');x.fillStyle='#f00';x.fillRect(0,0,564,752);__app.MAPSHOT=c}")
        msf = pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())")
        mj = json.loads(msf)
        check('the mission holds the weapons data and the map image', mj['weapons']['wp']['mode'] == 'toss' and mj['weapons']['bvr']['mode'] == 'bvr' and mj['mapshot'].startswith('data:image/png'))
        check('no kneeboard backup folder name in the mission', pg.evaluate("()=>!JSON.stringify(__app.missionExt).includes('backup')"))
        o = json.loads(msf)
        check('the mission holds the package, the DTC with its edits apart, and the datacard with the manual values', o['format'] == 'bms-cards-mission' and len(o['package']['units']) > 3 and any(e['k'] == 'target_83' for e in o['dtc']['edits']) and 'ab0_4' in o['datacard']['manual'] and o['datacard']['manual']['ab0_4'] == 'ZZ99')
        import re; check('the default name of the mission is package number + callsign (' + o['name'] + ')', re.match(r'^\d+ \S', o['name']) is not None)
        pg.evaluate("()=>{__app.F.ab0_4=22;__app.ST.AUTO.ab0_4=22}")
        o9 = json.loads(pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())"))
        check('a numeric field of the datacard (airfield elevation) travels as text in the mission, and is not a manual change', o9['datacard']['final'].get('ab0_4') == '22' and o9['datacard']['auto'].get('ab0_4') == '22' and 'ab0_4' not in o9['datacard'].get('manual', {}))
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
        check('the DTC is back with the edit applied', pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_83');return !!l&&l.v.startsWith('123456')&&!!l.dirty}"))
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
        # the shape of the mission file against a reference (tests/mission-shape.json): a change must come with a decision about minReader
        def shape(v, d=0):
            if v is None: return None
            if isinstance(v, bool): return 'boolean'
            if isinstance(v, (int, float)): return 'number'
            if isinstance(v, str): return 'string'
            if isinstance(v, list): return ['list'] if not v or d >= 2 else ['list', shape(v[0], d + 1)]
            return 'object' if d >= 2 else {k: shape(x, d + 1) for k, x in sorted(v.items())}
        def flat(x, pre=''):
            if isinstance(x, dict):
                r = {}
                for k, v in x.items(): r.update(flat(v, pre + '/' + k))
                return r
            return {pre: x}
        cur_shape = shape(json.loads(pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())")))
        min_reader = pg.evaluate("async()=>(await import('/app/js/core/mission.js')).MIN_READER")
        ref_path = R + '/tests/mission-shape.json'
        ref = json.load(open(ref_path)) if os.path.exists(ref_path) else None
        if '--update-shape' in sys.argv:
            if ref:
                a_, b_ = flat(ref['shape']), flat(cur_shape)
                # a key that is gone or has another type breaks the older readers (a null value says nothing about the type)
                broken = [k for k in a_ if k not in b_ or (a_[k] is not None and b_[k] is not None and a_[k] != b_[k])]
                if broken and ref['minReader'] == min_reader:
                    print('REFUSED: these fields were removed or changed type:', broken, '\nRaise MIN_READER in app/js/core/mission.js to the version of this change, then update again.'); sys.exit(1)
            json.dump({'minReader': min_reader, 'shape': cur_shape}, open(ref_path, 'w'), indent=1, sort_keys=True); open(ref_path, 'a').write('\n'); print('mission shape saved')
        elif ref:
            a_, b_ = flat(ref['shape']), flat(cur_shape)
            same = a_.keys() == b_.keys() and all(a_[k] is None or b_[k] is None or a_[k] == b_[k] for k in a_)
            check('the shape of the mission file is the reference one (if it changed: decide about MIN_READER in app/js/core/mission.js, then python3 tools/mission-test.py --update-shape)', same)
        else:
            check('tests/mission-shape.json exists (create it with --update-shape)', False)
        # F10: the pictures, Weapons data and tankers count as changes; F11: a load that fails halfway puts everything back
        pg.on('dialog', lambda d: d.accept())  # reopening over an open mission asks to discard
        pg.evaluate("async(t)=>__app.msfLoad(t)", msf); pg.wait_for_timeout(900)
        check('F10: a mission just opened is not unsaved', pg.evaluate("()=>__app.unsaved()") is False)
        pg.evaluate("()=>{const c=document.createElement('canvas');c.width=100;c.height=80;__app.MAPSHOT=c}"); pg.wait_for_timeout(200)
        check('F10: changing the map picture alone makes the mission unsaved', pg.evaluate("()=>__app.unsaved()") is True)
        pg.evaluate("async(t)=>__app.msfLoad(t)", msf); pg.wait_for_timeout(900)
        r = pg.evaluate("""async(t)=>{const c0=__app.C,f0=JSON.stringify(__app.F),n0=__app.lines.length,fs0=document.querySelector('#fsel').innerHTML,w0=JSON.stringify(__app.wpPage.state());
          const oa=Object.assign;Object.assign=function(a){if(a===__app.F){Object.assign=oa;throw new Error('boom')}return oa.apply(this,arguments)};
          try{await __app.msfLoad(t)}finally{Object.assign=oa}
          return [__app.C===c0,JSON.stringify(__app.F)===f0,__app.lines.length===n0,document.querySelector('#fsel').innerHTML===fs0,JSON.stringify(__app.wpPage.state())===w0,__app.unsaved()]}""", msf)
        check('F11: a load that fails halfway leaves campaign, datacard, DTC and Weapons as they were', r[:5] == [True] * 5)
        check('F11: and the program is not left unsaved by it', r[5] is False)
        bad = json.loads(msf); bad['dtc']['edits'] = 'x'
        pg.evaluate("t=>__app.msfLoad(t)", json.dumps(bad)); pg.wait_for_timeout(300)
        check('F11: a mission with a wrong shape is refused before anything changes', pg.evaluate("()=>__app.unsaved()") is False and pg.evaluate("()=>!!__app.C"))
        pg.evaluate("async(t)=>__app.msfLoad(t)", msf); pg.wait_for_timeout(900)
        pg.evaluate("()=>{const s=__app.wpPage.state();s.mode=s.mode=='toss'?'bvr':'toss';__app.wpPage.setState(s)}"); pg.wait_for_timeout(300)
        check('F10: changing the Weapons page alone makes the mission unsaved', pg.evaluate("()=>__app.unsaved()") is True)
        # F31: loads of the game data started one on top of the other: only the last one runs, none of them fails
        rr = pg.evaluate("""async()=>{const g=await import('/app/js/app/gamedata.js');let n=0;const t0=g.GAMEDATA;
          const res=await Promise.allSettled([g.loadGameData(false),g.loadGameData(false),g.loadGameData(false)]);
          return [res.every(x=>x.status=='fulfilled'),res.slice(0,2).every(x=>x.value===undefined)]}""")
        check('F31: three loads of the game data at once all end well, the first two are skipped', rr == [True, True])
        # a mission of another pilot on a computer with no DTC open: a window waits for the choice (beta 53)
        other = json.loads(msf); other['dtc']['author'] = {'uid': 'someone-else', 'callsign': 'Viper'}; other = json.dumps(other)
        pg.goto('http://localhost:8797/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("t=>{window.__r=__app.msfLoad(t)}", other); pg.wait_for_timeout(600)
        check('no DTC open: a window explains that the DTC data of the mission go into your own DTC', pg.is_visible('#msfnodtc') and 'Viper' in pg.inner_text('#msfnodtc') and 'callsign is not set' in pg.inner_text('#msfnodtc'))
        pg.click('#msfnodtc [data-x]'); r1 = pg.evaluate("async()=>await window.__r")
        check('Cancel: the mission is not opened and nothing changed', r1 is False and pg.evaluate("()=>!__app.C&&__app.lines.length==0") and not pg.is_visible('#msfnodtc'))
        pg.evaluate("t=>{window.__r=__app.msfLoad(t)}", other); pg.wait_for_timeout(600)
        pg.click('#msfnodtc [data-skip]'); r2 = pg.evaluate("async()=>await window.__r")
        check('Open without the DTC data: the mission opens, no DTC', r2 is True and pg.evaluate("()=>!!__app.C&&__app.lines.length==0"))
        pg.goto('http://localhost:8797/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("ini=>{window.showOpenFilePicker=async()=>[{getFile:async()=>new File([ini],'Viper.ini')}]}", ini)
        pg.evaluate("t=>{window.__r=__app.msfLoad(t)}", other); pg.wait_for_timeout(600)
        pg.click('#msfnodtc [data-ok]'); pg.wait_for_timeout(600)
        check('Open my DTC…: the DTC is chosen, then the usual window shows what the mission changes in it', pg.is_visible('#msfgrp') and 'Viper.ini' in pg.inner_text('#msfgrp'))
        pg.click('#msfgrp [data-ok]'); r3 = pg.evaluate("async()=>await window.__r")
        check('and the mission opens with its DTC data in the chosen DTC (target_83 of the mission)', r3 is True and pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_83');return !!l&&l.v.startsWith('123456')&&!!l.dirty}"))
        # without the tables of the game a mission is refused before anything changes (its flights and the map would be wrong)
        r4 = pg.evaluate("""async t=>{const ct=__app.CAM_D.ct;__app.CAM_D.ct=[];const c0=__app.C;try{return [await __app.msfLoad(t),__app.C===c0]}finally{__app.CAM_D.ct=ct}}""", other)
        check('no game data: the mission is refused and nothing changes', r4 == [False, True])
        check('no page errors in standalone use', not errs); print(errs)
        check('no page errors', not errs); print(errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
