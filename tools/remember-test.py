"""What the program keeps between two sessions and what it warns about (1.2.0-beta.8), with a desktop in memory (tools/fakedesk.py) and no BMS files:
the name of the pilot in the roster from the start (logbook read at once, never made empty), the BVR timeline kept between sessions and its rows in the
datacard when the BVR box is empty, "Kneeboard not saved", and the one map screenshot of the kneeboard. Usage: python3 tools/remember-test.py"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs

PORT = 8971
APP = 'C:\\BMSCards'
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
KEY = b'Falcon is your Master'
def lbk(name, cs):
    p = bytearray(372)
    for o, s in ((0, name), (21, cs)): p[o:o + len(s)] = s.encode()
    out = bytearray(); prev = 0x58
    for i, b in enumerate(p): c = b ^ prev ^ KEY[i % 21]; out.append(c); prev = c
    return bytes(out)
desk = FakeDesk(APP)
desk.put(APP + '\\config.json', json.dumps({'paths': {'dtc': 'C:\\BMS\\User\\Config', 'kneeboardDir': 'C:\\BMS\\kb'}, 'squadron': {'trackers': 'ws://localhost:1'}}))
desk.put('C:\\BMS\\User\\Config\\Alpha.lbk', lbk('Alpha Lead', 'Evil'))
desk.mk('C:\\BMS\\kb')
# a squadron saved by an older version: my own entry has lost its name (the bug: the callsign was listed in the datacard roster)
desk.put(APP + '\\squadron.json', json.dumps({'uid': 'me000001', 'cur': 's1', 'cs': 'Evil', 'squads': [{'id': 's1', 'name': 'Red Devils', 'secret': 'x' * 32, 'owner': 'me000001', 'leader': '', 'roster': {'me000001': {'uid': 'me000001', 'name': '', 'callsign': 'Evil', 'ts': 1}}, 'org': {'pk': {}, 'fl': {}, 'as': {}}}]}))
def page(br):
    pg = br.new_page(viewport={'width': 1500, 'height': 950}); errs = []
    dialogs.install(pg); desk.install(pg)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2500)
    return pg, errs
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg, errs = page(br)
        # ---- roster: the logbook is read at the start, the Squadron page never opened
        check('the datacard roster lists the pilot by his name from the start (logbook read at once): %s' % pg.evaluate("()=>__app.sq.roster()"), pg.evaluate("()=>__app.sq.roster().length==1&&__app.sq.roster()[0].endsWith('Alpha Lead')"))
        pg.evaluate("()=>{const q=__app.sq.db().squads[0];q.roster.me000001.name='';}")
        pg.evaluate("()=>__app.sq.refresh()"); pg.wait_for_timeout(300)
        check('a page drawn again keeps the name (a known name is never made empty)', pg.evaluate("()=>__app.sq.db().squads[0].roster.me000001.name") == 'Alpha Lead')
        # ---- BVR timeline: changed on the page, kept for the next session
        pg.click('[data-t=ms]'); pg.wait_for_timeout(600)
        pg.evaluate("async()=>{const {ST}=await import('/app/js/app/state.js');const s=ST.msPage.state();ST.msPage.setState({tl:{...s.tl,cls:['Mig-29A','Su-27','J-10','Mig-31'],std:{...s.tl.std,alt:30000}}})}")
        pg.wait_for_timeout(1500)
        saved = json.loads(desk.text(APP + '\\bvrprefs.json')) if desk.has(APP + '\\bvrprefs.json') else {}
        check('the BVR timeline is written next to the program (bvrprefs.json)', saved.get('tl', {}).get('cls', [None])[0] == 'Mig-29A' and saved['tl']['std']['alt'] == 30000)
        # ---- the BVR box of the datacard: filled by itself when empty, a value of the mission (or typed) stays
        r = pg.evaluate("""async()=>{const {ST}=await import('/app/js/app/state.js');const {bvrAuto}=await import('/app/js/app/perf.js');const F=__app.F;
          ST.CL=[{f:{}}];ST.CURK='k1';ST.AUTO={};ST.MANK=new Set();for(let i=0;i<4;i++)for(let j=0;j<6;j++)F['bv'+i+'_'+j]='';
          await bvrAuto(0);const a=[F.bv0_0,F.bv0_1,F.bv1_0];
          F.bv0_1='99';ST.MANK.add('bv0_1');F.bv1_0='';await bvrAuto(0);return [a,F.bv1_0,F.bv0_1]}""")
        check('an empty BVR box is filled with the timeline (Mig-29A first, its MTR): %s' % r[0], r[0][0] == 'Mig-29A' and r[0][1] not in ('', None) and r[0][2] == 'Su-27')
        check('a box that holds values (a mission, or typed) is left alone', r[1] == '' and r[2] == '99')
        pg.close()
        pg, errs2 = page(br)
        pg.click('[data-t=ms]'); pg.wait_for_timeout(800)
        st = pg.evaluate("async()=>{const {ST}=await import('/app/js/app/state.js');return ST.msPage.state().tl}")
        check('the next session starts with the same timeline (classes and conditions)', st['cls'][0] == 'Mig-29A' and st['std']['alt'] == 30000)
        # ---- Kneeboard not saved
        pg.click('[data-t=kb]'); pg.wait_for_timeout(300)
        check('nothing on the datacard: no button in the tab bar (nothing to save yet)', not pg.is_visible('#rdy'))
        pg.evaluate("async()=>{const {draw}=await import('/app/js/app/cardview.js'),D=await import('/app/js/app/datacard.js');D.setField('bingo','3400','typed');D.setField('pri','TGT BRIDGE','typed');draw()}"); pg.wait_for_timeout(2000)
        check('the datacard changed and is on the kneeboard: "Not saved: Kneeboard" in the tab bar and a dot on the tab', pg.is_visible('#rdy.warn') and 'Not saved' in pg.inner_text('#rdy') and 'Kneeboard' in pg.inner_text('#rdy') and pg.locator('.tab[data-t=kn].unsaved').count() == 1)
        pg.click('#rdy'); pg.wait_for_timeout(300)
        check('a click opens the three rows: DTC (no file), Kneeboard (to save, with its button), Mission', pg.locator('#rdypop .rdyr').count() == 3 and pg.locator('#rdypop .rdyr.todo [data-r=kb]').count() == 1 and 'No DTC file open' in pg.inner_text('#rdypop'))
        pg.click('#rdypop [data-r=kb]'); pg.wait_for_timeout(7000)
        check('Save kneeboard writes the files without leaving the page: the warning and the dot go', desk.has('C:\\BMS\\kb\\7982.dds') and not pg.is_visible('#rdy.warn') and pg.locator('.tab[data-t=kn].unsaved').count() == 0 and pg.is_visible('#kb'))
        pg.evaluate("async()=>{const {draw}=await import('/app/js/app/cardview.js');__app.F.bingo='3500';draw()}"); pg.wait_for_timeout(2000)
        check('a new change of the datacard brings it back', pg.is_visible('#rdy.warn'))
        pg.evaluate("async()=>{const {draw}=await import('/app/js/app/cardview.js');__app.F.bingo='3400';draw()}"); pg.wait_for_timeout(2000)
        check('the datacard back as it was saved: no warning', not pg.is_visible('#rdy.warn'))
        pg.close()
        pg, errs3 = page(br)
        pg.evaluate("async()=>{const {draw}=await import('/app/js/app/cardview.js'),D=await import('/app/js/app/datacard.js');D.setField('bingo','3400','typed');D.setField('pri','TGT BRIDGE','typed');draw()}"); pg.wait_for_timeout(2500)
        check('the next session with the same datacard: no warning (the last save is remembered)', not pg.is_visible('#rdy.warn'))
        # ---- Ready to fly: the three things together, and Write all
        r = pg.evaluate("""async()=>{const {ST}=await import('/app/js/app/state.js');const D=await import('/app/js/app/dtcfile.js');
          const sel=document.getElementById('fsel');sel.innerHTML='<option value="">-</option><option value="0">Viper 1</option>';sel.value='0';
          return __app.ready.items().map(x=>x.k+':'+x.st).join(',')}"""); pg.wait_for_timeout(1600)
        check('a flight chosen, nothing saved yet as a mission: the mission waits too (%s)' % r, 'msf:todo' in r and pg.is_visible('#rdy.warn') and 'Mission' in pg.inner_text('#rdy'))
        pg.evaluate("()=>{document.getElementById('fsel').innerHTML='<option>— select a flight —</option>'}"); pg.wait_for_timeout(1600)
        check('all saved and no flight: the button goes away', not pg.is_visible('#rdy'))
        # ---- the notice of a newer version (the answer of GitHub is made by the test)
        v = pg.evaluate("""async()=>{const R=await import('/app/js/app/ready.js');localStorage.removeItem('bmscards.vercheck');
          const f=async()=>({ok:true,json:async()=>[{name:'v1.1.0'},{name:'v9.0.0'},{name:'junk'}]});const v=await R.verLatest(f);R.verShow(v);return v}""")
        check('a newer tag on GitHub: the notice in the tab bar (%s)' % v, v == '9.0.0' and pg.is_visible('#verchip') and '9.0.0' in pg.inner_text('#verchip'))
        pg.click('#verchip'); pg.wait_for_timeout(200)
        check('a click shows where to download it (the program does not update itself)', 'github.com/' in pg.input_value('#verpop input') and 'does not update itself' in pg.inner_text('#verpop'))
        pg.click('#verchip')
        check('asked once a day: the answer is remembered', pg.evaluate("async()=>{const R=await import('/app/js/app/ready.js');return await R.verLatest(async()=>{throw new Error('asked again')})}") == '9.0.0')
        pg.evaluate("async()=>{const R=await import('/app/js/app/ready.js');R.verShow('')}")
        # ---- one map screenshot
        shot = """async()=>{const K=await import('/app/js/app/kneeboard.js');const c=document.createElement('canvas');c.width=1024;c.height=2048;const x=c.getContext('2d');x.fillStyle='#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');x.fillRect(0,0,1024,2048);await K.kbAddShot(c);
          const at=[];K.KBS.forEach((r,i)=>['left','right'].forEach(s=>{if(r[s].kind=='pic'&&/^Map screenshot/.test(r[s].item.name))at.push(s+i)}));return {n:K.KBLIB.filter(i=>/^Map screenshot/.test(i.name)).length,at}}"""
        a = pg.evaluate(shot); b = pg.evaluate(shot)
        check('setting off (default): every screenshot is a new card %s %s' % (a, b), b['n'] == a['n'] + 1 and len(b['at']) == len(a['at']) + 1)
        check('the setting is in Settings > General, off by default', pg.evaluate("()=>__app.CFG.ui.oneMapShot") is False)
        pg.click('#cfgbtn'); pg.wait_for_timeout(500)
        pg.click('#cfg [data-a=go][data-p=general]'); pg.wait_for_timeout(300)
        sw = pg.locator('#cfg [data-a=sw][data-k=oneShot]')
        check('Settings > General: "One map screenshot" and "New version notice" (on by default)', sw.count() == 1 and 'One map screenshot' in pg.inner_text('#cfg') and pg.locator('#cfg [data-a=sw][data-k=upd].on').count() == 1)
        sw.click(); pg.click('#cfgsave'); pg.wait_for_timeout(800)
        check('the switch is saved in config.json', json.loads(desk.text(APP + '\\config.json'))['ui'].get('oneMapShot') is True)
        if pg.is_visible('#cfg'): pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        c = pg.evaluate(shot)
        check('setting on: the new screenshot takes the place of the last one, on the same page %s -> %s' % (b, c), c['n'] == b['n'] and c['at'] == b['at'])
        check('no page errors %s %s %s' % (errs[:2], errs2[:2], errs3[:2]), not errs and not errs2 and not errs3)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
