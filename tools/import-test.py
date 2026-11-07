"""Settings > Import & backup, on the data of a real pilot of BMS Cards 1.0.0: the data is made by the code of that version (tools/v10data.py: the tag v1.0.0 served from a worktree),
then this version imports it through the window, restarts, and has to find everything as the pilot left it. A desktop in memory (tools/fakedesk.py) with the permissions of
src-tauri/capabilities: a write the program is not allowed to do fails as in the real one. Also: the older folder is never written, a backup file (zip) made by the Export button is
imported again into a third folder, a second import does not harm, and the wrong choices (this folder itself, an empty folder, a file that is not a zip) are said.
Usage: python3 tools/import-test.py"""
import hashlib, io, json, os, subprocess, sys, time, zipfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs, v10data

PORT = 8932
OLD, NEW, THIRD, BACKUPS = 'D:\\Games\\BMS-Cards-1.0', 'D:\\Games\\BMS-Cards-1.1', 'D:\\Games\\BMS-Cards-1.2', 'D:\\Backups'
ok = True
def check(name, cond, extra=''):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name, '' if cond else extra)
def under(desk, folder): return desk.paths(folder)
def rel(p, folder): return p[len(folder) + 1:].replace('\\', '/')
def files(desk, folder): return {rel(p, folder).lower(): desk.read(p) for p in desk.paths(folder)}
def digest(b): return hashlib.sha1(b).hexdigest()[:10]
def wrote(desk): return [w for w in desk.writes if not w.lower().endswith('write-test.tmp')]
# every button and box that is on the screen in the window has a transition (the rule: every function and button has its animation, see docs/ARCHITECTURE.md)
MOVES = """()=>{const bad=new Set();document.querySelectorAll('#cfg button,#cfg input,#cfg select,#cfg textarea').forEach(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  if(!r.width||!r.height||s.visibility=='hidden'||s.display=='none')return;
  if(s.transitionDuration.split(',').every(x=>x.trim()=='0s'))bad.add(e.tagName.toLowerCase()+(typeof e.className=='string'&&e.className?'.'+e.className.trim().split(/\\s+/).join('.'):''))});return [...bad]}"""
def moves(name, pg):
    # the pilot of 1.0 had the animations off: the class is taken away for the look (the rule of the transitions is about the style sheet), then put back
    had = pg.evaluate("()=>{const c=document.documentElement.classList,h=c.contains('noanim');c.remove('noanim');return h}")
    bad = pg.evaluate(MOVES)
    if had: pg.evaluate("()=>document.documentElement.classList.add('noanim')")
    check('%s: every button and box has a transition %s' % (name, bad or ''), not bad)

srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
    desk = FakeDesk(OLD)
    print('--- the data of BMS Cards 1.0.0, made by that version')
    old = v10data.generate_cached(desk, os.environ.get('V10_CACHE'), log=lambda *a: None)  # V10_CACHE=<file>: the data of 1.0 is made once and kept (it takes two minutes)
    check('the old program made its data without page errors (%s)' % old['errors'], not old['errors'])
    oldf = files(desk, OLD)
    for need in ['config.json', 'squadron.json', 'mapprefs.json', 'perfprefs.json', 'dtcprefs.json', 'cardmemory/cards.json', 'backup/dtc/index.json', 'backup/kneeboard/index.json']:
        check('1.0 left %s' % need, need in oldf)
    mission = old['mission'][0]
    check('1.0 left the mission "%s"' % mission, ('missions/%s/%s.bcrd' % (mission, mission)).lower() in oldf)
    check('1.0 left the card pictures and the backups', sum(1 for k in oldf if k.startswith('cardmemory/cards/')) >= 2 and sum(1 for k in oldf if k.startswith('backup/dtc/') and k.endswith('.ini')) >= 1 and sum(1 for k in oldf if k.startswith('backup/kneeboard/') and k.endswith('.dds')) >= 1)
    old_sq = json.loads(desk.text(OLD + '\\squadron.json'))
    old_cfg = json.loads(desk.text(OLD + '\\config.json'))
    print('   the 1.0 folder holds %d files' % len(oldf))

    with sync_playwright() as p:
        br = p.chromium.launch()
        pages = []
        def open_program(app_dir):
            """The program of this repository on the files of the desk, with `app_dir` as its folder"""
            desk.app_dir = app_dir
            pg = br.new_page(viewport={'width': 1500, 'height': 950}); errs = []; boxes = []
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: (boxes.append(d.message), d.accept()))
            desk.install(pg)
            pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(2200)
            pages.append(pg)
            return pg, errs, boxes
        def settings(pg, panel):
            if not pg.evaluate("()=>document.getElementById('cfg').open"): pg.click('#cfgbtn'); pg.wait_for_selector('#cfg[open]')
            pg.click('#nv-' + panel); pg.wait_for_timeout(350)
        def items(pg): return [t.strip().split('\n')[0] for t in pg.locator('#items .s-li .tx').all_inner_texts()]
        def pick_folder(pg, path):
            desk.open_dialog.append(path); pg.click('[data-a=pickfolder]'); pg.wait_for_timeout(1500)
        def done(pg): pg.wait_for_selector('#imp .s-dn', timeout=60000); pg.wait_for_timeout(1200)

        # ------------------------------------------------------------ the new folder: the first run
        print('--- a new folder of 1.1')
        pg, errs, boxes = open_program(NEW)
        check('a new folder starts with its own settings and squadron file', desk.is_file(NEW + '\\config.json') and desk.is_file(NEW + '\\squadron.json'))
        fresh = files(desk, NEW)
        desk.clear_writes()
        settings(pg, 'data')
        check('the window lists Import and Export', pg.locator('#imp h3').inner_text() == 'Import from another version' and pg.locator('#exp h3').inner_text() == 'Export my data')
        moves('the first card of Import and Export', pg)

        # the wrong choices
        pick_folder(pg, NEW)
        check('the folder of the program itself is refused with a reason', 'folder of the program you are using now' in pg.locator('#imp .s-err').inner_text())
        desk.mk('D:\\Empty folder'); pick_folder(pg, 'D:\\Empty folder')
        check('a folder without data of BMS Cards is refused with a reason', 'No data of BMS Cards was found' in pg.locator('#imp .s-err').inner_text())
        desk.put('D:\\Backups\\not a backup.zip', b'this is not a zip file')
        desk.open_dialog.append('D:\\Backups\\not a backup.zip'); pg.click('[data-a=pickfile]'); pg.wait_for_timeout(800)
        check('a file that is not a zip is refused with a reason', pg.locator('#imp .s-err').count() == 1 and 'zip' in pg.locator('#imp .s-err').inner_text().lower())
        check('nothing was written by the wrong choices', not wrote(desk) and not desk.denied)

        # ------------------------------------------------------------ import from the 1.0 folder
        print('--- import from the folder of 1.0.0')
        pick_folder(pg, OLD)
        check('the window shows what was found, with the older folder named', pg.locator('#imp .s-src .s-mono').inner_text() == OLD and 'Older BMS Cards' in pg.locator('#imp .s-src .s-ch').inner_text())
        got = items(pg)
        check('the list: settings, page preferences, squadrons, missions, kneeboard, backups (%s)' % got, got == ['Settings', 'Page preferences', 'Squadrons', 'Missions', 'Kneeboard', 'Backups of your originals'])
        check('every item is chosen, none has a problem', pg.locator('#items .s-cb.on').count() == 6 and pg.locator('#items .s-pr').count() == 0)
        moves('the list of what is found', pg)
        txt = pg.locator('#items').inner_text()
        check('the lines say what is in each item (1 squadron, 1 mission, 2 card pictures)', '1 squadron and your pilot identity' in txt and '1 saved mission' in txt and '2 imported card pictures' in txt)
        check('the button counts the items', pg.inner_text('#go') == 'Import 6 items')
        pg.click('#items .s-li:nth-child(2) .s-cb'); pg.wait_for_timeout(250)
        check('an item can be left out: the button counts 5', pg.inner_text('#go') == 'Import 5 items' and pg.get_attribute('#items .s-li:nth-child(2) .s-cb', 'aria-checked') == 'false')
        pg.click('#items .s-li:nth-child(2) .s-cb'); pg.wait_for_timeout(250)
        check('and put back', pg.inner_text('#go') == 'Import 6 items')
        check('"Use imported" is the policy and its text names the folder for what is replaced', 'before-import-' in pg.locator('#pol').inner_text() and 'on' in pg.get_attribute('[data-a=pol][data-k=replace]', 'class'))
        desk.clear_writes()
        pg.click('#go'); done(pg)
        check('the result lists six things, all brought', pg.locator('#imp .s-dn .s-li').count() == 6 and 'Import complete' in pg.locator('#imp h3').inner_text())
        check('the window says to restart, and the Save button is locked (the settings were replaced)', 'Restart BMS Cards' in pg.locator('#cfgnote').inner_text() and pg.is_disabled('#cfgsave'))
        moves('the result of an import', pg)
        check('no write went into the older folder', not [w for w in desk.writes if w.lower().startswith(OLD.lower())])
        check('the older folder is exactly as it was', {k: digest(v) for k, v in files(desk, OLD).items()} == {k: digest(v) for k, v in oldf.items()})
        check('no permission was refused', not desk.denied, str(desk.denied))
        check('no page errors %s' % errs, not errs)

        nf = files(desk, NEW)
        cfg = json.loads(desk.text(NEW + '\\config.json'))
        check('settings: the values of 1.0 are there (radius, trackers, satellite layer, start-up choices)', cfg['mission']['radiusNm'] == 85 and cfg['squadron']['trackers'] == 'wss://tracker.example/announce' and cfg['map']['satOn'] and cfg['map']['satKey'] == 'SECRET-KEY' and cfg['map']['satUrl'] == 'https://tiles.example/{z}/{x}/{y}?k={key}' and cfg['map']['satAttr'] == 'Example tiles' and cfg['ui']['autoLoad'] is True and cfg['ui']['showMfd34'] is True and cfg['ui']['animations'] is False)
        check('settings: the folders that exist on this computer are taken', cfg['paths']['bmsInstall'] == 'C:\\BMS' and cfg['paths']['dtc'] == old_cfg['paths']['dtc'] and cfg['paths']['kneeboardDir'] == old_cfg['paths']['kneeboardDir'])
        check('settings: a folder of another computer is not taken (the value of this copy stays)', cfg['paths']['campaigns'] == '' and old_cfg['paths']['campaigns'] == 'X:\\Not\\On\\This\\Computer')
        for name in ['mapprefs.json', 'perfprefs.json', 'dtcprefs.json', 'dtcdefaults.json', 'mfddefault.json']:
            if name in oldf: check('page preferences: %s is the same file' % name, nf.get(name) == oldf[name])
        sq = json.loads(desk.text(NEW + '\\squadron.json'))
        check('squadrons: the pilot identity and the squadron are the same', sq['uid'] == old_sq['uid'] and [x['name'] for x in sq['squads']] == ['Red Devils'], str(sq)[:200])
        check('squadrons: the copy file is the same as the file', nf.get('squadron.json.new') == nf.get('squadron.json'))
        mk = ('missions/%s/' % mission).lower()
        check('missions: every file of the mission is there, byte for byte', all(nf.get(k) == v for k, v in oldf.items() if k.startswith(mk)) and any(k.endswith('.bcrd') for k in nf if k.startswith(mk)))
        check('kneeboard: the arrangement and the pictures are the same', all(nf.get(k) == v for k, v in oldf.items() if k.startswith('cardmemory/')) and any(k.startswith('cardmemory/cards/') for k in nf))
        check('backups: the originals of the DTC and the kneeboard are the same, with their index', all(nf.get(k) == v for k, v in oldf.items() if k.startswith('backup/')))
        check('the first run files of this copy were replaced, no copy of them was needed (nothing of this copy was used yet)', not [k for k in nf if k.startswith('backup/before-import')])

        # the program holds the old state of what was replaced: it must not write it back
        desk.clear_writes()
        pg.evaluate("async()=>{const d=await import('/app/js/platform/desktop.js');d.savePrefs('mapprefs.json',{wrong:1});await d.flushAll();await d.saveConfig({wrong:1})}"); pg.wait_for_timeout(300)
        check('after the import the program does not write over the imported files before it is restarted', not wrote(desk) and files(desk, NEW).get('mapprefs.json') == oldf.get('mapprefs.json') and json.loads(desk.text(NEW + '\\config.json'))['mission']['radiusNm'] == 85)

        # ------------------------------------------------------------ restart: 1.1 on the data of 1.0
        print('--- restart')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        settings(pg, 'data')
        check('the result is still there when the window is opened again, with the Restart button', pg.locator('#imp .s-dn').count() == 1 and pg.locator('[data-a=restart]').count() == 1)
        pg.click('[data-a=restart]'); pg.wait_for_timeout(3500)
        check('the program is started again (the window is closed)', not pg.evaluate("()=>document.getElementById('cfg').open"))
        C = pg.evaluate("()=>__app.CFG")
        check('1.1 starts with the settings of 1.0 (radius, trackers, no animations)', C['mission']['radiusNm'] == 85 and C['squadron']['trackers'] == 'wss://tracker.example/announce' and C['ui']['animations'] is False and C['paths']['bmsInstall'] == 'C:\\BMS')
        check('the animations are off, as the pilot left them', pg.evaluate("()=>document.documentElement.classList.contains('noanim')"))
        settings(pg, 'mission')
        check('Settings shows them', pg.input_value('#c-rad') == '85' and pg.input_value('#c-trk') == 'wss://tracker.example/announce')
        settings(pg, 'map')
        check('Settings shows the own satellite layer with its fields', pg.get_attribute('[data-k=sat]', 'aria-checked') == 'true' and pg.input_value('#c-key') == 'SECRET-KEY' and pg.input_value('#c-attr') == 'Example tiles')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        db = pg.evaluate("()=>__app.sq.db()")
        check('the squadron page has the squadron and the same pilot identity as in 1.0', db['uid'] == old_sq['uid'] and [x['name'] for x in db['squads']] == ['Red Devils'])
        lst = pg.evaluate("async()=>(await (await import('/app/js/app/mission.js')).msfList()).map(x=>x.label||x.name)")
        check('the Mission list shows the mission of 1.0 (%s)' % lst, any(mission in str(x) for x in lst))
        text = pg.evaluate("async()=>{const m=await import('/app/js/app/mission.js');const l=await m.msfList();return await m.msfText(l[0].id)}")
        check('and 1.1 reads its file', text == desk.text(OLD + '\\missions\\%s\\%s.bcrd' % (mission, mission)))
        ky = pg.evaluate("()=>__app.KBLIB.length")
        check('the kneeboard library has the two cards of 1.0 (%d)' % ky, ky >= 2)
        # the original DTC kept by 1.0 is not overwritten by a new Write in 1.1
        dtc_path = 'C:\\BMS\\User\\Config\\Evil19.ini'
        keep = desk.read(NEW + '\\backup\\dtc\\Evil19.ini'); idx = desk.read(NEW + '\\backup\\dtc\\index.json')
        pg.evaluate("async(p)=>{const m=await import('/app/js/app/dtcfile.js');await m.dtcBackupOnce(p,new TextEncoder().encode('SOMETHING ELSE'))}", dtc_path); pg.wait_for_timeout(300)
        check('the original of a DTC kept by 1.0 stays the original (1.1 does not make a second copy)', desk.read(NEW + '\\backup\\dtc\\Evil19.ini') == keep and desk.read(NEW + '\\backup\\dtc\\index.json') == idx)
        check('no page errors after the restart %s' % errs, not errs)
        check('no permission was refused after the restart', not desk.denied, str(desk.denied))
        files_after_import = files(desk, NEW)

        # the mission of 1.0 opened in 1.1 (a page without the desktop: the game tables of this computer, like the test of the missions)
        mp = br.new_page(viewport={'width': 1500, 'height': 950}); merrs = []; mbox = []
        dialogs.install(mp); mp.on('pageerror', lambda e: merrs.append(str(e))); mp.on('dialog', lambda d: (mbox.append(d.message), d.accept()))
        # the pilot identity of 1.0 (it travelled with the import): a mission saved by this pilot brings its DTC back; one of another pilot would ask first
        mp.add_init_script("localStorage.setItem('bmscards.squadron.json', %s)" % json.dumps(desk.text(NEW + '\\squadron.json')))
        mp.goto('http://localhost:%d/app/index.html' % PORT); mp.wait_for_timeout(1200)
        check('the browser page has the identity of 1.0', mp.evaluate("()=>__app.sq.db().uid") == old_sq['uid'])
        mp.evaluate("async(t)=>__app.msfLoad(t)", text); mp.wait_for_timeout(1200)
        check('the mission made by 1.0 opens in 1.1: the flight, the manual value of the datacard, the DTC and the weather are back', mp.evaluate("()=>__app.F.ab0_4=='ZZ99'&&[...__app.MANK].includes('ab0_4')") and mp.evaluate("()=>__app.lines.length>300&&!!__app.lines.find(l=>l.s=='STPT'&&l.k=='target_83')") and mp.evaluate("()=>__app.C.units.some(u=>u.kind=='flight')") and mp.evaluate("()=>!!__app.WX&&__app.WX.X>0"), str(mbox) + str(merrs))
        check('and nothing was reported', not merrs and not mbox)
        mp.close()

        # ------------------------------------------------------------ a second import changes nothing that matters
        print('--- a second import, with "Keep mine" and with "Use imported"')
        settings(pg, 'data'); desk.clear_writes()
        pick_folder(pg, OLD)
        pg.click('[data-a=pol][data-k=keep]'); pg.wait_for_timeout(250)
        check('"Keep mine" says that what is here stays', 'stay as they are' in pg.locator('#pol').inner_text())
        pg.click('#go'); done(pg)
        check('with Keep mine nothing is written in this folder (the pilot identity and the settings are not touched)', not wrote(desk), str(wrote(desk)[:5]))
        check('and the result says so: nothing to restart', pg.locator('[data-a=restart]').count() == 0 and 'Restart' not in pg.locator('#cfgnote').inner_text())
        pg.click('#imp [data-a=dismiss]'); pg.wait_for_timeout(300)
        before3 = files(desk, NEW)
        pick_folder(pg, OLD); pg.click('#go'); done(pg)
        sf = [k for k in files(desk, NEW) if k.startswith('backup/before-import-')]
        check('with Use imported what is replaced is saved first in backup\\before-import-<day> (%d files)' % len(sf), len(sf) >= 3 and any(k.endswith('/config.json') for k in sf) and any(k.endswith('/squadron.json') for k in sf))
        safe = [k for k in sf if k.endswith('/config.json')][0]
        check('and the copy is the file as it was', files(desk, NEW)[safe] == before3['config.json'])
        check('the result names that folder', 'before-import-' in pg.locator('#imp .s-dn').inner_text())
        check('no write went into the older folder, again', not [w for w in desk.writes if w.lower().startswith(OLD.lower())])
        check('no permission was refused', not desk.denied, str(desk.denied))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

        # ------------------------------------------------------------ export, and import of the backup file in a third folder
        print('--- export, then import of the backup file into a third folder')
        pg.reload(); pg.wait_for_timeout(2500)
        settings(pg, 'data'); desk.clear_writes()
        target = BACKUPS + '\\BMS-Cards-backup-test.zip'
        desk.save_dialog.append(target); pg.click('[data-a=export]'); pg.wait_for_selector('#exp .s-okc', timeout=60000); pg.wait_for_timeout(500)
        check('Export asks where to save, with a name made of the day', any(k == 'save' and 'BMS-Cards-backup-' in str(o.get('defaultPath')) and str(o.get('defaultPath')).endswith('.zip') for k, o in desk.dialog_calls))
        check('Export says what it saved and where', 'BMS-Cards-backup-test.zip' in pg.locator('#exp').inner_text() and 'D:\\Backups' in pg.locator('#exp').inner_text())
        moves('the result of an export', pg)
        check('the backup file was written (the program is allowed to write a .zip)', desk.is_file(target) and not desk.denied, str(desk.denied))
        z = zipfile.ZipFile(io.BytesIO(desk.read(target)))
        names = z.namelist()
        check('the zip holds a manifest, the settings, the squadron, the mission, the kneeboard and the backups', 'bms-cards-backup.json' in names and 'config.json' in names and 'squadron.json' in names and any(n.startswith('missions/') for n in names) and any(n.startswith('cardmemory/') for n in names) and any(n.startswith('backup/dtc/') for n in names) and any(n.startswith('backup/kneeboard/') for n in names))
        check('and the zip is readable by a normal program (every file passes the CRC test)', z.testzip() is None)
        man = json.loads(z.read('bms-cards-backup.json'))
        check('the manifest names the version of the program', man['format'] == 'bms-cards-backup' and man['appVersion'] and man['files'] == len([n for n in names if n != 'bms-cards-backup.json']))
        check('the backup holds nothing of the files that are only copies of the program (temporary, safety copies of an import are not needed)', not [n for n in names if n.endswith('.tmp') or n.endswith('.new')])
        pg.click('[data-a=again]'); pg.wait_for_timeout(300)
        check('Export again goes back to the first card', pg.locator('#exp [data-a=export]').count() == 1)
        pg.close()

        pg3, errs3, boxes3 = open_program(THIRD)
        settings(pg3, 'data'); desk.clear_writes()
        desk.open_dialog.append(target); pg3.click('[data-a=pickfile]'); pg3.wait_for_timeout(1500)
        check('the backup file shows its version and what it holds', 'Backup of BMS Cards' in pg3.locator('#imp .s-src .s-ch').inner_text() and len(items(pg3)) == 6, str(items(pg3)))
        pg3.click('#go'); done(pg3)
        check('the third folder: no page errors, no permission refused', not errs3 and not desk.denied, str(errs3) + str(desk.denied))
        t3 = files(desk, THIRD); n2 = files(desk, NEW)
        same = lambda k: k in t3 and k in n2 and t3[k] == n2[k]
        data_keys = [k for k in n2 if not k.startswith('backup/before-import-') and not k.endswith('.tmp') and k != 'squadron.json.new' and k != 'write-test.tmp']
        diff = [k for k in data_keys if not same(k) and not (k == 'config.json')]
        check('a third folder gets the same data from the backup file (%d files, different: %s)' % (len(data_keys), diff[:4]), not diff)
        c3 = json.loads(desk.text(THIRD + '\\config.json')); c2 = json.loads(desk.text(NEW + '\\config.json'))
        check('and the same settings', c3['mission'] == c2['mission'] and c3['map'] == c2['map'] and c3['squadron'] == c2['squadron'] and c3['ui']['animations'] == c2['ui']['animations'])
        pg3.click('[data-a=restart]'); pg3.wait_for_timeout(3500)
        check('the third folder starts with the squadron identity of the first one', pg3.evaluate("()=>__app.sq.db().uid") == old_sq['uid'])
        check('the third folder: no page errors after the restart', not errs3, str(errs3))
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
