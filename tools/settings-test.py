"""The Settings window: the list of sections (Essentials: Folders, Diagnostics; Preferences: General, Datacard, Mission & squadron, Map; Data: Import & backup), the dot of a section with
unsaved changes, Save / Cancel / Close, the switches that act only when saved, the number boxes, the statuses of the folders, the page Diagnostics. In the browser (no desktop)
and on a desktop in memory (tools/fakedesk.py). The import and export have their own test: tools/import-test.py. Usage: python3 tools/settings-test.py"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs

PORT = 8933
ok = True
def check(name, cond, extra=''):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', name, '' if cond else extra)

srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def page(desk=None):
            pg = br.new_page(viewport={'width': 1400, 'height': 900}); errs = []; boxes = []
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            ans = [True]  # what the next questions are answered
            pg.on('dialog', lambda d: (boxes.append(d.message), d.accept() if ans[0] else d.dismiss()))
            if desk: desk.install(pg)
            pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1800)
            pg.ans = ans
            return pg, errs, boxes
        def opened(pg): return pg.evaluate("()=>document.getElementById('cfg').open")
        def open_settings(pg, panel=None):
            if not opened(pg): pg.click('#cfgbtn'); pg.wait_for_selector('#cfg[open]'); pg.wait_for_timeout(300)
            if panel: pg.click('#nv-' + panel); pg.wait_for_timeout(300)
        def dot(pg, panel): return pg.evaluate("p=>document.querySelector('#nv-'+p+' .s-nd').classList.contains('on')", panel)
        def sw(pg, key): return pg.get_attribute('[data-a=sw][data-k=%s]' % key, 'aria-checked') == 'true'
        def close(pg): pg.click('#cfgcancel'); pg.wait_for_timeout(350)

        # ================================================================ in the browser
        print('--- the browser version')
        pg, errs, boxes = page()
        open_settings(pg)
        navs = pg.evaluate("()=>[...document.querySelectorAll('#cfg .s-nv .t')].map(e=>e.textContent)")
        groups = pg.evaluate("()=>[...document.querySelectorAll('#cfg .s-gl span:first-child')].map(e=>e.textContent)")
        check('the list: Folders, Diagnostics, General, Datacard, Mission & squadron, Map, Import & backup, User Guide', navs == ['Folders', 'Diagnostics', 'General', 'Datacard', 'Mission & squadron', 'Map', 'Import & backup', 'User Guide'], str(navs))
        check('in four groups: Essentials, Preferences, Data, Help', groups == ['Essentials', 'Preferences', 'Data', 'Help'], str(groups))
        pg.click('#nv-help'); pg.wait_for_timeout(800)
        hg = pg.evaluate("()=>{const g=document.getElementById('s-guide');const i=[...g.querySelectorAll('img')];return {t:g.innerText.includes('BMS Cards does the paperwork of a mission for you'),steps:g.querySelectorAll('.step').length,img:i.length&&i.every(x=>x.complete&&x.naturalWidth>0),pdf:!!document.querySelector('#p-help [data-a=guidepdf]')}}")
        check('Help: the User Guide is shown with its nine steps and its pictures, and Save as PDF %s' % hg, hg['t'] and hg['steps'] == 9 and hg['img'] and hg['pdf'])
        ok_pdf = pg.evaluate("async()=>{const r=await fetch('help/BMS-Cards-Guide.pdf');const b=new Uint8Array(await r.arrayBuffer());return r.ok&&String.fromCharCode(...b.slice(0,5))=='%PDF-'}")
        check('the PDF of the guide is there', ok_pdf)
        pg.click('#nv-folders'); pg.wait_for_timeout(250)
        check('the window opens on Folders, the others are hidden', pg.is_visible('#p-folders') and not pg.is_visible('#p-general') and pg.get_attribute('#nv-folders', 'aria-current') == 'page')
        check('the version is in the title bar', pg.inner_text('#cfg .s-hd .s-ch').startswith('v1.'))
        check('nothing to save: Save is off, the second button says Close', pg.is_disabled('#cfgsave') and pg.inner_text('#cfgcancel') == 'Close' and pg.inner_text('#cfgnote') == '')
        pg.click('#nv-general'); pg.wait_for_timeout(60)
        check('a page appears with a short animation', pg.evaluate("()=>{const s=getComputedStyle(document.getElementById('p-general'));return s.animationName!='none'&&s.animationDuration!='0s'}"))
        check('the list shows the page: highlight and aria-current', pg.get_attribute('#nv-general', 'aria-current') == 'page' and pg.get_attribute('#nv-folders', 'aria-current') == 'false' and 'on' in pg.get_attribute('#nv-general', 'class'))

        # the dot of a section with unsaved changes, and the footer
        pg.click('[data-a=sw][data-k=autoLoad]'); pg.wait_for_timeout(250)
        check('a switch turned: the dot of its section, "Unsaved changes", Save on, Cancel instead of Close', dot(pg, 'general') and not dot(pg, 'map') and 'Unsaved changes' in pg.inner_text('#cfgnote') and not pg.is_disabled('#cfgsave') and pg.inner_text('#cfgcancel') == 'Cancel')
        check('the switch has its own state for the screen readers', sw(pg, 'autoLoad') is True)
        pg.click('[data-a=sw][data-k=autoLoad]'); pg.wait_for_timeout(250)
        check('turned back: the dot goes away, nothing to save', not dot(pg, 'general') and pg.is_disabled('#cfgsave') and pg.inner_text('#cfgcancel') == 'Close')

        # the switches that acted at once act when saved
        pg.click('#nv-datacard'); pg.wait_for_timeout(250)
        form0 = pg.evaluate("()=>__app.ST.FORMON"); obs0 = pg.evaluate("()=>__app.ST.OBSERVER")
        pg.click('[data-a=sw][data-k=form]'); pg.click('[data-a=sw][data-k=others]'); pg.click('[data-a=sw][data-k=mfd]'); pg.wait_for_timeout(250)
        check('Datacard form and Other factions do not act before Save', pg.evaluate("()=>__app.ST.FORMON") == form0 and pg.evaluate("()=>__app.ST.OBSERVER") == obs0 and dot(pg, 'datacard'))
        close(pg)
        check('Cancel closes the window and drops the changes', not opened(pg) and pg.evaluate("()=>__app.ST.FORMON") == form0 and pg.evaluate("()=>!!(__app.CFG.ui&&__app.CFG.ui.showMfd34)") is False)
        open_settings(pg, 'datacard')
        check('opened again: the switches are as they were saved, no dot', sw(pg, 'form') == form0 and sw(pg, 'others') == obs0 and sw(pg, 'mfd') is False and not dot(pg, 'datacard'))
        pg.click('[data-a=sw][data-k=form]'); pg.click('[data-a=sw][data-k=others]'); pg.click('[data-a=sw][data-k=mfd]'); pg.wait_for_timeout(250)
        pg.click('#cfgsave'); pg.wait_for_timeout(700)
        check('Save: the form and Other factions change, MFD 3 and 4 is saved', pg.evaluate("()=>__app.ST.FORMON") == (not form0) and pg.evaluate("()=>__app.ST.OBSERVER") == (not obs0) and pg.evaluate("()=>__app.CFG.ui.showMfd34") is True)
        check('the window stays open and says Saved, the dots are gone, Save is off, the button says Close', opened(pg) and 'Saved' in pg.inner_text('#cfgnote') and not dot(pg, 'datacard') and pg.is_disabled('#cfgsave') and pg.inner_text('#cfgcancel') == 'Close')
        pg.wait_for_timeout(2800)
        check('"Saved" goes away after a moment', pg.inner_text('#cfgnote') == '')
        check('the choices of the form and of the other factions are remembered by the browser', pg.evaluate("()=>[localStorage.getItem('bmsform'),localStorage.getItem('bmsobs')]") == [('1' if not form0 else '0'), ('1' if not obs0 else '0')])
        # leave them as they were
        pg.click('[data-a=sw][data-k=form]'); pg.click('[data-a=sw][data-k=others]'); pg.click('[data-a=sw][data-k=mfd]'); pg.click('#cfgsave'); pg.wait_for_timeout(600)

        # animations: acts when saved
        pg.click('#nv-general'); pg.wait_for_timeout(250)
        pg.click('[data-a=sw][data-k=anim]'); pg.wait_for_timeout(250)
        check('Animations: the program keeps its animations until Save', not pg.evaluate("()=>document.documentElement.classList.contains('noanim')"))
        pg.click('#cfgsave'); pg.wait_for_timeout(600)
        check('Animations: off after Save (the page gets the class noanim)', pg.evaluate("()=>document.documentElement.classList.contains('noanim')"))
        check('and the window itself obeys it: no transition on its switches', pg.evaluate("()=>getComputedStyle(document.querySelector('#cfg .s-sw')).transitionDuration.split(',').every(x=>x.trim()=='0s')"))
        pg.click('[data-a=sw][data-k=anim]'); pg.click('#cfgsave'); pg.wait_for_timeout(600)
        check('Animations: on again after Save', not pg.evaluate("()=>document.documentElement.classList.contains('noanim')") and pg.evaluate("()=>getComputedStyle(document.querySelector('#cfg .s-sw')).transitionDuration!='0s'"))

        # numbers
        pg.click('#nv-mission'); pg.wait_for_timeout(250)
        r0 = pg.input_value('#c-rad')
        pg.fill('#c-rad', ''); pg.type('#c-rad', '9a8x7'); pg.wait_for_timeout(100)
        check('Mission radius takes digits only (3 at most) and not more than 300: "9a8x7" is 300', pg.input_value('#c-rad') == '300', pg.input_value('#c-rad'))
        pg.fill('#c-rad', '85'); pg.wait_for_timeout(100)
        pg.click('#p-mission [data-a=step][data-d="1"]'); pg.wait_for_timeout(100)
        check('the arrows add and take 5', pg.input_value('#c-rad') == '90' and (pg.click('#p-mission [data-a=step][data-d="-1"]'), pg.click('#p-mission [data-a=step][data-d="-1"]'), pg.input_value('#c-rad'))[2] == '80')
        pg.fill('#c-rad', '298'); pg.click('#p-mission [data-a=step][data-d="1"]'); pg.wait_for_timeout(80)
        check('and stop at 300', pg.input_value('#c-rad') == '300')
        pg.fill('#c-rad', '2'); pg.click('#p-mission [data-a=step][data-d="-1"]'); pg.wait_for_timeout(80)
        check('and at 0', pg.input_value('#c-rad') == '0')
        pg.fill('#c-rad', ''); pg.evaluate("()=>document.getElementById('c-rad').dispatchEvent(new Event('change',{bubbles:true}))"); pg.wait_for_timeout(100)
        check('a box left empty goes back to what it was', pg.input_value('#c-rad') == r0 and not dot(pg, 'mission'), pg.input_value('#c-rad'))
        pg.fill('#c-rad', '45'); pg.fill('#c-trk', '  wss://one.example/announce\nwss://two.example/announce  '); pg.wait_for_timeout(100)
        check('the section Mission & squadron has the dot', dot(pg, 'mission'))
        pg.click('#cfgsave'); pg.wait_for_timeout(700)
        c = pg.evaluate("()=>__app.CFG")
        check('Save: the radius and the trackers (without the spaces round them) are in the settings', c['mission']['radiusNm'] == 45 and c['squadron']['trackers'] == 'wss://one.example/announce\nwss://two.example/announce', str(c['squadron']))
        check('the settings of the browser version are kept in the browser', json.loads(pg.evaluate("()=>localStorage.getItem('bmscards.config')"))['mission']['radiusNm'] == 45)
        close(pg)
        open_settings(pg, 'mission')
        check('opened again: the same values and no dot', pg.input_value('#c-rad') == '45' and 'one.example' in pg.input_value('#c-trk') and not dot(pg, 'mission'))

        # the satellite layer
        pg.click('#nv-map'); pg.wait_for_timeout(250)
        check('Map: the fields of the own layer are closed until the switch is on', not pg.is_visible('#c-url'))
        pg.click('[data-a=sw][data-k=sat]'); pg.wait_for_timeout(350)
        check('and open with it (a part that opens with a height transition)', pg.is_visible('#c-url') and pg.evaluate("()=>getComputedStyle(document.getElementById('satbox')).transitionProperty.includes('grid-template-rows')"))
        pg.fill('#c-zoom', '99'); pg.fill('#c-url', 'https://t.example/{z}/{x}/{y}'); pg.click('#cfgsave'); pg.wait_for_timeout(600)
        check('the deepest zoom is kept between 5 and 22', pg.evaluate("()=>__app.CFG.map.satMaxZoom") == 22 and pg.evaluate("()=>__app.CFG.map.satOn") is True)
        pg.fill('#c-zoom', '1'); pg.click('#cfgsave'); pg.wait_for_timeout(600)
        check('(and 5 at least)', pg.evaluate("()=>__app.CFG.map.satMaxZoom") == 5)
        pg.click('[data-a=sw][data-k=sat]'); pg.fill('#c-zoom', ''); pg.click('#cfgsave'); pg.wait_for_timeout(600)
        check('(an empty box goes back to what it was, as the radius does)', pg.evaluate("()=>__app.CFG.map.satMaxZoom") == 5 and pg.evaluate("()=>__app.CFG.map.satOn") is False)
        close(pg)

        # Diagnostics, import in the browser
        open_settings(pg, 'diag')
        n = pg.inner_text('#nvdiag')
        check('Diagnostics: the warnings are listed and counted on the entry of the list (%s)' % n, pg.locator('#cfgwarn li').count() >= 1 and n == str(pg.locator('#cfgwarn li').count()))
        check('Diagnostics: the version of the program, and where the settings are kept', 'Version' in pg.inner_text('#p-diag') and 'browser storage' in pg.inner_text('#p-diag'))
        check('Diagnostics: the full report is closed', not pg.is_visible('#cfgreport .s-report') and pg.get_attribute('[data-a=report]', 'aria-expanded') == 'false')
        pg.click('[data-a=report]'); pg.wait_for_timeout(400)
        check('and opens with the button (the arrow turns)', pg.is_visible('#cfgreport .s-report') and pg.get_attribute('[data-a=report]', 'aria-expanded') == 'true' and 'open' in pg.get_attribute('[data-a=report] .s-cv', 'class'))
        pg.click('#nv-data'); pg.wait_for_timeout(300)
        check('Import & backup in the browser: told that it is for the desktop app, no buttons', 'desktop app' in pg.inner_text('#p-data') and pg.locator('#p-data [data-a=pickfolder]').count() == 0 and pg.locator('#p-data [data-a=export]').count() == 0)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Escape closes the window', not opened(pg))
        pg.click('#cfgbtn'); pg.wait_for_timeout(400)
        check('the window opens on the section of the last time', pg.get_attribute('#nv-data', 'aria-current') == 'page')
        pg.click('#cfgx'); pg.wait_for_timeout(350)
        check('the cross closes it', not opened(pg))
        check('no page errors in the browser version %s' % errs, not errs)
        pg.close()

        # ================================================================ on the desktop (in memory)
        print('--- the desktop version')
        desk = FakeDesk('D:\\Games\\BMS-Cards'); desk.bms = 'C:\\BMS'
        desk.mk('C:\\BMS\\Data\\Campaign'); desk.mk('D:\\Other\\Place')
        pg, errs, boxes = page(desk)
        open_settings(pg, 'folders')
        st = lambda k: pg.inner_text('#fs-' + k)
        check('a folder that exists: "Found"', st('bmsInstall').startswith('Found'), st('bmsInstall'))
        check('a folder left empty is the automatic one: found or not (%s | %s)' % (st('campaigns'), st('dtc')), st('campaigns') == 'Automatic · found' and st('dtc') == 'Automatic · not found')
        check('the missions folder is made when the first mission is saved', 'first mission' in st('missions'))
        check('the field shows what the automatic folder is', pg.get_attribute('#f-dtc', 'placeholder') == 'automatic: C:\\BMS\\User\\Config')
        check('the entry Folders tells how many folders have to be looked at (2: DTC and kneeboard)', pg.inner_text('#nvf') == '2')
        pg.fill('#f-bmsInstall', 'C:\\Nowhere'); pg.wait_for_timeout(700)
        check('a folder typed that does not exist is said while typing', 'Not found' in st('bmsInstall') and 'wn' in pg.get_attribute('#fs-bmsInstall', 'class') and dot(pg, 'folders'))
        pg.fill('#f-bmsInstall', ''); pg.wait_for_timeout(700)
        check('an empty BMS folder: "Not set"', st('bmsInstall') == 'Not set')
        desk.open_dialog.append('D:\\Other\\Place'); pg.click('[data-a=browse][data-k=campaigns]'); pg.wait_for_timeout(700)
        check('Browse puts the chosen folder in the box and tells what it is', pg.input_value('#f-campaigns') == 'D:\\Other\\Place' and st('campaigns') == 'Found')
        check('Browse asks for a folder, with the name of the field as the title', any(k == 'open' and o.get('directory') and o.get('title') == 'Campaigns folder' for k, o in desk.dialog_calls))
        desk.open_dialog.append(None); pg.click('[data-a=browse][data-k=dtc]'); pg.wait_for_timeout(400)
        check('Browse cancelled changes nothing', pg.input_value('#f-dtc') == '')

        # a folder with a mistake is said before saving
        pg.fill('#f-bmsInstall', 'C:\\BMS'); pg.fill('#f-dtc', 'C:\\Typo\\Config'); pg.wait_for_timeout(500)
        boxes.clear(); pg.ans[0] = False
        pg.click('#cfgsave'); pg.wait_for_timeout(900)
        check('Save names the folders that do not exist and asks (Cancel = go back)', len(boxes) == 1 and 'DTC folder: C:\\Typo\\Config' in boxes[0] and 'BMS install folder' not in boxes[0] and 'Campaigns folder' not in boxes[0], str(boxes))
        check('Cancel on that question: nothing is saved and the window still has the changes', pg.evaluate("()=>__app.CFG.paths.dtc") == '' and dot(pg, 'folders') and not pg.is_disabled('#cfgsave'))
        boxes.clear(); pg.ans[0] = True; pg.click('#cfgsave'); pg.wait_for_timeout(1500)
        check('OK on the question: saved anyway', pg.evaluate("()=>__app.CFG.paths.dtc") == 'C:\\Typo\\Config' and pg.evaluate("()=>__app.CFG.paths.bmsInstall") == 'C:\\BMS' and 'Saved' in pg.inner_text('#cfgnote'))
        check('the settings file of the program was written', json.loads(desk.text('D:\\Games\\BMS-Cards\\config.json'))['paths']['dtc'] == 'C:\\Typo\\Config')
        check('after the save the statuses and the entry of the list are checked again (DTC: not found; the entry counts the folders to look at)', 'Not found' in st('dtc') and pg.inner_text('#nvf') == str(pg.locator('#p-folders .s-st.wn').count()) and pg.locator('#p-folders .s-st.wn').count() == 2)
        check('no permission was refused, and the test file of the folder is not written again by opening the window', not desk.denied)
        # the diagnostics of the desktop version
        pg.click('#nv-diag'); pg.wait_for_timeout(400)
        d = pg.inner_text('#p-diag')
        check('Diagnostics: the folder of the program, writable', 'D:\\Games\\BMS-Cards' in d and 'Writable' in d)
        check('Diagnostics: where the settings are saved', 'D:\\Games\\BMS-Cards\\config.json' in d)
        check('Diagnostics: the game section says what was read (here nothing: the folder has no game files)', 'Game data' in d and 'files found' in d)
        check('the full report holds the text of the game data reading', 'Game data' in (pg.text_content('#cfgreport .s-report') or ''), pg.text_content('#cfgreport .s-report'))
        check('no page errors on the desktop %s' % errs, not errs)
        pg.close()
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
