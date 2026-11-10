"""config.json is there but cannot be used (not valid JSON, cannot be read): the program starts with the default settings and asks. Cancel = the file is left as it is
(nothing is written to it in this session); OK = the defaults are written into it from now on, a file that was read is kept as config.json.bad. A desktop in memory
(tools/fakedesk.py). Usage: python3 tools/config-test.py"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs

PORT = 8941
APP = 'D:\\Games\\BMS-Cards'
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def start(content, answer):
            desk = FakeDesk(APP); desk.put(APP + '\\config.json', content)
            pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []; msgs = []
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: (msgs.append(d.message), d.accept() if (answer and 'config.json' in d.message) or 'config.json' not in d.message else d.dismiss()))
            desk.install(pg)
            pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2500)
            return desk, pg, errs, msgs
        # a change of the settings that is saved: the theme of the program (Settings > Appearance) or any setting written by saveConfig
        save = "async()=>{const d=await import('/app/js/platform/desktop.js');__app.CFG.ui=__app.CFG.ui||{};__app.CFG.ui.test=1;await d.saveConfig(__app.CFG)}"
        desk, pg, errs, msgs = start('{"paths": {"bmsInstall": "C:\\\\BMS"', False)
        ask = [m for m in msgs if 'config.json' in m]
        check('not valid JSON: the pilot is asked, once, at the start', len(ask) == 1 and 'not valid JSON' in ask[0] and 'config.json.bad' in ask[0])
        pg.evaluate(save); pg.wait_for_timeout(300)
        check('Cancel: config.json is left as it was, even when a setting is saved', desk.text(APP + '\\config.json') == '{"paths": {"bmsInstall": "C:\\\\BMS"' and not desk.has(APP + '\\config.json.bad'))
        check('...and the program goes on with the default settings (no error) %s' % errs, not errs and pg.evaluate("()=>!!__app.CFG && !!__app.CFG.paths"))
        pg.close()
        desk, pg, errs, msgs = start('{"paths": {"bmsInstall": "C:\\\\BMS"', True)
        good = json.loads(desk.text(APP + '\\config.json'))
        check('OK: the default settings are written into config.json, the old file kept as config.json.bad', isinstance(good, dict) and 'paths' in good and desk.text(APP + '\\config.json.bad') == '{"paths": {"bmsInstall": "C:\\\\BMS"')
        pg.evaluate(save); pg.wait_for_timeout(300)
        check('...and the settings are saved again from then on', json.loads(desk.text(APP + '\\config.json')).get('ui', {}).get('test') == 1)
        check('no page errors %s' % errs, not errs)
        pg.close()
        # a file that cannot be read at all (in use, no permission): the same question, no .bad copy (there is nothing to copy)
        desk = FakeDesk(APP); desk.put(APP + '\\config.json', '{}')
        desk._op_readTextFile = lambda a: (_ for _ in ()).throw(PermissionError('The process cannot access the file because it is being used by another process. (os error 32)')) if a['path'].lower().endswith('config.json') else FakeDesk._op_readTextFile(desk, a)
        pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []; msgs = []
        dialogs.install(pg); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (msgs.append(d.message), d.dismiss() if 'config.json' in d.message else d.accept()))
        desk.install(pg); pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2500)
        ask = [m for m in msgs if 'config.json' in m]
        check('a file in use: asked, and not written over (it was before: the defaults took its place)', len(ask) == 1 and 'could not be read' in ask[0] and desk.text(APP + '\\config.json') == '{}' and 'config.json.bad' not in ask[0])
        check('no page errors %s' % errs, not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
