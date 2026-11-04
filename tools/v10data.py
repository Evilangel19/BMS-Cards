"""Makes the data of a pilot who used BMS Cards 1.0.0 for a while, with the code of that version (the tag v1.0.0, served from a temporary worktree): settings, page preferences, a squadron,
a saved mission, a DTC written with its backup, kneeboard cards saved with their backup. The files are made by the program itself, in a FakeDesk (tools/fakedesk.py).

    python3 tools/v10data.py            -> makes the data and tells what there is
    from v10data import generate        -> generate(desk, old_dir) returns what was chosen, to check later

The test of the import (tools/import-test.py) uses it, then opens the version of this repository on the same files."""
import base64, os, subprocess, sys, tempfile, time, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from fakedesk import FakeDesk
import dialogs

FX = ROOT + '/tests/fixtures/beartrap/'
TAG = os.environ.get('V10_TAG', 'v1.0.0')
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()


def png(w=60, h=90, rgb=(200, 30, 30)):
    import struct, zlib
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')


class OldProgram:
    """The old version served from a worktree of the tag (removed at the end)."""
    def __init__(self, port):
        self.port = port; self.dir = tempfile.mkdtemp(prefix='bms-v10-')
        subprocess.run(['git', 'worktree', 'add', '--detach', self.dir + '/wt', TAG], cwd=ROOT, check=True, capture_output=True)
        # the tables copied from Falcon BMS are not in the repository (.gitignore): the old version uses the ones of this computer
        if os.path.isdir(ROOT + '/app/js/data/local'): shutil.copytree(ROOT + '/app/js/data/local', self.dir + '/wt/app/js/data/local', dirs_exist_ok=True)
        self.srv = subprocess.Popen([sys.executable, ROOT + '/tools/serve.py', str(port), '--directory', self.dir + '/wt'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    def close(self):
        self.srv.terminate()
        subprocess.run(['git', 'worktree', 'remove', '--force', self.dir + '/wt'], cwd=ROOT, capture_output=True)
        shutil.rmtree(self.dir, ignore_errors=True)


def generate(desk, port=8902, log=print):
    """Runs the old program on `desk` (desk.app_dir is its folder) and leaves its files there. Returns what was chosen."""
    from playwright.sync_api import sync_playwright
    old = OldProgram(port)
    out = {}
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            pg = br.new_page(viewport={'width': 1700, 'height': 1300}); errs = []
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: (log('  [box]', d.message[:140].replace(chr(10), ' ')), d.accept()))
            desk.install(pg)
            bms = 'C:\\BMS'
            desk.bms = bms
            desk.mk(bms + '\\Data\\Campaign')
            desk.put(bms + '\\User\\Config\\Evil19.ini', open(FX + 'Evil19_2_.ini', 'rb').read())
            desk.put(bms + '\\Data\\TerrData\\Objects\\KoreaObj\\7982.dds', bytes([79, 76, 68]))
            desk.put('C:\\pics\\card1.png', png())
            desk.put('C:\\pics\\card2.png', png(rgb=(30, 30, 200)))
            pg.goto('http://localhost:%d/app/index.html' % port); pg.wait_for_timeout(1500)
            out['version'] = pg.evaluate("async()=>(await import('/app/js/core/version.js')).APP_VERSION")
            log('old program', out['version'], 'on', desk.app_dir)

            # ---- Settings (the dialog of 1.0)
            pg.click('#cfgbtn'); pg.wait_for_timeout(400)
            row = lambda lab: '#cfg .cf:has(> label:text-is("%s"))' % lab
            pg.fill(row('BMS install folder') + ' input', bms)
            pg.fill(row('DTC folder') + ' input', bms + '\\User\\Config')
            pg.fill(row('Kneeboard DDS folder') + ' input', bms + '\\Data\\TerrData\\Objects\\KoreaObj')
            pg.fill(row('Campaigns folder') + ' input', 'X:\\Not\\On\\This\\Computer')  # a folder of another computer: the import must not take it
            pg.check(row('Open last at start') + ' input'); pg.check(row('MFD 3 and 4') + ' input')
            pg.fill(row('Mission radius') + ' input', '85'); pg.fill(row('Squadron trackers') + ' textarea', 'wss://tracker.example/announce')
            pg.check(row('Own satellite layer') + ' input')
            pg.fill(row('Tile address') + ' input', 'https://tiles.example/{z}/{x}/{y}?k={key}')
            pg.fill(row('Key') + ' input', 'SECRET-KEY'); pg.fill(row('Credit') + ' input', 'Example tiles')
            pg.once('dialog', lambda d: d.accept())
            pg.click('#cfg .bar .btn:not(.g)'); pg.wait_for_timeout(1200)
            out['settings'] = {'radius': 85, 'trackers': 'wss://tracker.example/announce', 'campaignsLost': 'X:\\Not\\On\\This\\Computer', 'key': 'SECRET-KEY', 'animations': False}
            log('settings saved:', 'config.json' in ' '.join(desk.paths(desk.app_dir)))

            # ---- a DTC opened from the BMS folder and saved over (the original is kept apart)
            pg.evaluate("t=>__app.parse(t)", open(FX + 'Evil19_2_.ini', encoding='latin1').read()); pg.wait_for_timeout(300)
            pg.evaluate("()=>__app.setDtcPath('%s', __app.dtcOut())" % (bms + '\\User\\Config\\Evil19.ini').replace('\\', '\\\\')); pg.wait_for_timeout(300)
            pg.evaluate("()=>{const l=__app.lines.find(l=>l.s=='STPT'&&l.k=='target_83');if(l){l.v='123456.000000, 234567.000000, -500.000000, 1, ';l.dirty=1}}"); pg.wait_for_timeout(600)
            pg.click('#saveow'); pg.wait_for_timeout(1500)
            log('DTC backup:', desk.paths(desk.app_dir + '\\backup'))

            # ---- a mission: the file is made by the old program (the browser version has the game data of the campaign), then put in the missions folder as the desktop one does
            mp = br.new_page(viewport={'width': 1700, 'height': 1300}); dialogs.install(mp); mp.on('dialog', lambda d: d.accept())
            mp.goto('http://localhost:%d/app/index.html' % port); mp.wait_for_timeout(1000)
            mp.evaluate("t=>__app.parse(t)", open(FX + 'Evil19_2_.ini', encoding='latin1').read()); mp.wait_for_timeout(300)
            mp.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b64('PSI_BEAR_TRAP_26.cam')); mp.wait_for_timeout(1000)
            mp.evaluate("async(b)=>{await __app.loadFmap(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.fmap'))}", b64('PSI_BEAR_TRAP_26.fmap')); mp.wait_for_timeout(600)
            mp.evaluate("()=>__app.setField('ab0_4','ZZ99')"); mp.wait_for_timeout(400)
            text = mp.evaluate("async()=>JSON.stringify(await __app.msfBuild())")
            mp.close()
            import json
            # the page that built the file has an identity of its own: the mission of a pilot carries the one of the pilot (the squadron file of the program)
            sqp = desk.app_dir + '\\squadron.json'
            if desk.is_file(sqp):
                o = json.loads(text); uid = json.loads(desk.text(sqp)).get('uid')
                if uid and o.get('dtc'):
                    o['dtc']['author'] = {'uid': uid, 'callsign': (o['dtc'].get('author') or {}).get('callsign', '')}
                    text = json.dumps(o)
            name = json.loads(text)['name']
            mdir = desk.app_dir + '\\missions\\' + name
            desk.put(mdir + '\\' + name + '.bcrd', text)
            desk.put(mdir + '\\settings.json', json.dumps({'config': {'mission': {'radiusNm': 85}}, 'prefs': {}}, indent=1))
            out['mission'] = [name]
            log('mission:', name, len(text), 'bytes')

            # ---- page preferences: made by the pages themselves
            pg.evaluate("async()=>{const m=await import('/app/js/app/datacard.js');m.dcSync('icp',true)}"); pg.wait_for_timeout(300)
            pg.evaluate("async()=>{const m=await import('/app/js/app/perf.js');m.PERFP.reserve=1800;m.PERFP.joker=900;m.perfSave()}"); pg.wait_for_timeout(300)
            pg.evaluate("async()=>{const m=await import('/app/js/app/dtctargets.js');m.dtcDef.save('ews')}"); pg.wait_for_timeout(300)
            pg.click('[data-t=mp]'); pg.wait_for_timeout(800)
            if not pg.is_visible('#mpbase'): pg.click('#mpbaseb'); pg.wait_for_timeout(250)
            pg.check('#mpcll'); pg.wait_for_timeout(500)
            pg.evaluate("async()=>{const d=await import('/app/js/platform/desktop.js');await d.flushAll()}"); pg.wait_for_timeout(300)

            # ---- the kneeboard: two cards imported, the files saved in the BMS folder (the original is kept apart)
            pg.click('[data-t=kn]'); pg.wait_for_timeout(500)
            desk.open_dialog.append(['C:\\pics\\card1.png', 'C:\\pics\\card2.png'])
            pg.click('#kbimp'); pg.wait_for_timeout(1500)
            pg.click('#kbsave'); pg.wait_for_timeout(6000)
            pg.wait_for_timeout(1500)

            # ---- a squadron
            pg.click('[data-t=sq]'); pg.wait_for_timeout(500)
            pg.fill('#sqnewm', 'Red Devils'); pg.click('#sqcreatem'); pg.wait_for_timeout(600)
            pg.evaluate("async()=>{const d=await import('/app/js/platform/desktop.js');await d.flushAll()}"); pg.wait_for_timeout(500)
            out['squadrons'] = ['Red Devils']
            # the pilot turns the animations off at the end of the session (the kneeboard tab changes with them)
            pg.click('#cfgbtn'); pg.wait_for_timeout(400); pg.uncheck(row('Animations') + ' input'); pg.click('#cfg .bar .btn:not(.g)'); pg.wait_for_timeout(800)
            out['errors'] = errs
            log('page errors:', errs)
            br.close()
    finally:
        old.close()
    return out


def generate_cached(desk, cache, log=print):
    """The same as generate(), but the result is kept in the file `cache` (the old program takes two minutes): the next call reads the file. For the work on the test; delete the file to make it again."""
    import pickle
    if cache and os.path.exists(cache):
        d = pickle.load(open(cache, 'rb'))
        desk.files, desk.names, desk.dirs, desk.bms = d['files'], d['names'], d['dirs'], d['bms']
        return d['out']
    out = generate(desk, log=log)
    if cache: pickle.dump({'files': desk.files, 'names': desk.names, 'dirs': desk.dirs, 'bms': desk.bms, 'out': out}, open(cache, 'wb'))
    return out


if __name__ == '__main__':
    desk = FakeDesk('D:\\Games\\BMS-Cards-1.0')
    o = generate(desk)
    print(o)
    for p in desk.paths(desk.app_dir): print('  ', p.replace(desk.app_dir, '.'), len(desk.read(p)))
    print('denied:', desk.denied)
