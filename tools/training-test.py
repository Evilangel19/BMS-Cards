"""The DTC of a training mission (an .ini next to a .trn of the same name, preset by the mission; the .ini of a TE .tac is not one): Write DTC does not change it unless Settings > General > Edit
training DTCs is on, and then only after a warning; with another DTC open, the training .ini is left out of the campaign files written. A desktop in memory
(tools/fakedesk.py), made-up files (no BMS files). Usage: python3 tools/training-test.py"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs

PORT = 8943
APP = 'D:\\Games\\BMS-Cards'
CD = 'C:\\BMS\\Data\\Campaign'
TR = CD + '\\TE_TEST_01.ini'
OWN = 'C:\\BMS\\User\\Config\\Viper.ini'
INI = '[MISSION]\r\ntitle=TE_TEST_01\r\n[STPT]\r\ntarget_0=736355.500000, 1418591.375000, -22.000000, 1, Not set\r\n'
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        desk = FakeDesk(APP)
        desk.put(APP + '\\config.json', json.dumps({'paths': {'bmsInstall': 'C:\\BMS', 'campaigns': CD}}))
        desk.put(TR, INI); desk.put(CD + '\\TE_TEST_01.trn', 'not a real campaign'); desk.put(CD + '\\TE_OWN.tac', 'x'); desk.put(CD + '\\TE_OWN.ini', INI); desk.put(OWN, INI.replace('TE_TEST_01', 'Viper')); desk.put(CD + '\\TE_TEST_02.trn', 'not a real campaign'); desk.put(CD + '\\Korea.cam', 'x')
        pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []; msgs = []; ans = [True]
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept() if ans[0] else d.dismiss()))
        desk.install(pg)
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2000)
        opts = pg.eval_on_selector_all('#tesel option', 'o=>o.map(x=>[x.value,x.textContent])')
        check('the TE menu: Select a TE or Training, the .tac and the training .trn %s' % opts, opts == [['', '— Select a TE or Training —'], ['TE_OWN.tac', 'TE_OWN'], ['TE_TEST_01.trn', 'TE_TEST_01 · Training'], ['TE_TEST_02.trn', 'TE_TEST_02 · Training']])
        open_ = "async p=>{const D=await import('/app/js/app/dtcfile.js'),P=await import('/app/js/platform/desktop.js');const b=await P.readBytes(p);await D.openDtc({name:p.split('\\\\').pop(),path:p,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});D.S('STPT','target_0','1.000000, 2.000000, 0.000000, 1, Not set')}"
        write = "async()=>{const D=await import('/app/js/app/dtcfile.js');await D.dtcOverwrite()}"
        pg.evaluate(open_, TR); pg.wait_for_timeout(300); n0 = len(msgs)
        pg.evaluate(write); pg.wait_for_timeout(300)
        check('the DTC of a training mission: Write DTC says it is protected and writes nothing', desk.text(TR) == INI and any('training mission' in m and 'Edit training DTCs' in m for m in msgs[n0:]))
        # the setting on: a warning, then written
        pg.evaluate("()=>{__app.CFG.ui.editTraining=true}"); n0 = len(msgs)
        pg.evaluate(write); pg.wait_for_timeout(300)
        check('...Edit training DTCs on: written after the TRAINING MISSION warning', 'TRAINING MISSION' in ' '.join(msgs[n0:]) and '1.000000, 2.000000' in desk.text(TR))
        # another DTC open with the training mission chosen: the training .ini is not written as a campaign file while the setting is off
        desk.put(TR, INI); pg.evaluate("()=>{__app.CFG.ui.editTraining=false;__app.ST.C={name:'TE_TEST_01'}}")
        pg.evaluate(open_, OWN); pg.wait_for_timeout(300); n0 = len(msgs)
        pg.evaluate(write); pg.wait_for_timeout(300)
        m = ' '.join(msgs[n0:])
        check('another DTC: written, the training .ini left out and said so (%s)' % m[:80].replace('\n', ' '), '1.000000, 2.000000' in desk.text(OWN) and desk.text(TR) == INI and 'Not written' in m and 'TE_TEST_01.ini' in m)
        pg.click('#cfgbtn'); pg.wait_for_timeout(500); pg.click('#nv-general'); pg.wait_for_timeout(300)
        check('Settings > General: Edit training DTCs, off at first', pg.locator('[data-a=sw][data-k=editTrain]').count() == 1 and pg.get_attribute('[data-a=sw][data-k=editTrain]', 'aria-checked') == 'false')
        # the .ini of a TE (.tac) is its DTC, not a preset training one: written as any DTC
        pg.evaluate(open_, CD + '\\TE_OWN.ini'); pg.wait_for_timeout(300); n0 = len(msgs)
        pg.evaluate(write); pg.wait_for_timeout(300)
        check('the .ini of a TE (.tac): not protected, written', '1.000000, 2.000000' in desk.text(CD + '\\TE_OWN.ini') and 'TRAINING' not in ' '.join(msgs[n0:]))
        check('no page errors %s' % errs[:2], not errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
