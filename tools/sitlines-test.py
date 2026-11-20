"""Checks the F-15 SIT lines (BMS 4.38.2, [F15_SIT_LINES]): the DTC page shows them only with an F-15, the map draws and edits them (lines 6-12, 30 points,
breaks, the looks of a line), the file keeps what it does not change. No BMS files. Usage: python3 tools/sitlines-test.py [screenshot_dir]"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools'); import dialogs
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = 8967
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
FT = 3280.84
pt = lambda x, y: '%.6f, %.6f' % (y * FT, x * FT)
L1 = [(460, 400), (480, 400), (480, 380)]
S6 = [(520, 420), (540, 430), (560, 450), (570, 470)]
S7 = [(430, 420), (440, 440)]
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['lineSTPT_%d=%s, 0.000000' % (i, pt(*L1[i]) if i < len(L1) else '0.000000, 0.000000') for i in range(24)] +
                  ['[F15_SIT_LINES]', 'SITLINE_1_COLORHEX=44E6EE', 'SITLINE_6_NAME=ECOAST', 'SITLINE_6_ENABLED=1', 'SITLINE_6_COLORIDX=0', 'SITLINE_6_DASHOPT=2'] +
                  ['SITLINE_6_%d=%s' % (i, pt(*S6[i]) if i < len(S6) else '0.000000, 0.000000') for i in range(30)] +
                  ['SITLINE_7_NAME=WCOAST'] + ['SITLINE_7_%d=%s' % (i, pt(*S7[i]) if i < len(S7) else '0.000000, 0.000000') for i in range(30)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1600, 'height': 1000}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        ln = lambda k: pg.evaluate("k=>{const l=__app.lines.find(l=>l.k==k);return l?l.v:null}", k)
        out = lambda: pg.evaluate("()=>__app.lines.map(l=>l.dirty?l.k+'='+l.v:l.raw).join('\\r\\n')+'\\r\\n'")
        check('a DTC with SIT lines comes back byte for byte when nothing changes', out() == INI)
        # the DTC page: an F-16 (no F-15 kneeboard) shows the Geo lines as before
        pg.click('[data-t=dtc]'); pg.wait_for_timeout(400)
        v = pg.inner_text('#view')
        check('an F-16: Geo lines, no SIT lines', 'GEO LINES' in v.upper() and 'ECOAST' not in v and pg.locator('[data-card=sl6]').count() == 0)
        pg.evaluate("t=>{window.__sitOn=true;__app.parse(t)}", INI); pg.wait_for_timeout(400)
        v = pg.inner_text('#view')
        check('an F-15: SIT lines, LINE 1-4 with their looks, the cards 6-12 and PPT', 'SIT LINES' in v.upper() and pg.locator('[data-card=sl6]').count() == 1 and pg.locator('[data-card=sl12]').count() == 1 and pg.locator('[data-card=sl5]').count() == 1 and pg.locator('[data-card=ln1] .sitsw').count() == 1)
        c6 = pg.inner_text('[data-card=sl6]')
        check('ECOAST: its name, 4/30, red (COLORIDX 0), L dash', 'ECOAST' in c6 and '4/30' in c6 and 'FF0000' in c6 and 'L dash' in c6)
        check('LINE 1: the colour of its COLORHEX', '44E6EE' in pg.get_attribute('[data-card=ln1] .sitsw', 'title'))
        check('an empty SIT line is dimmed and says how to draw it', 'sitnil' in pg.get_attribute('[data-card=sl8]', 'class') and 'Map' in pg.inner_text('[data-card=sl8]'))
        pg.click('[data-card=sl6] summary'); pg.wait_for_timeout(200)
        check('Points opens the coordinates of the line', pg.locator('[data-card=sl6] .sitp').count() == 4)
        if shots: pg.locator('#view').screenshot(path=shots + '/sit-dtc.png')
        # the map
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1500)
        pg.evaluate("()=>__app.mapV&&__app.mapV.refreshDtc&&__app.mapV.refreshDtc()"); pg.wait_for_timeout(500)
        nlines = lambda: pg.evaluate("()=>[...document.querySelectorAll('#mpmap .lnlab, .lnlab')].map(e=>e.textContent)")
        labs = nlines()
        check('the map draws LINE1 and the SIT lines with their names %s' % labs, 'ECOAST' in labs and 'WCOAST' in labs and any(l.startswith('LINE') for l in labs))
        looks = lambda: {z['lab']: z for z in pg.evaluate("()=>__app.mapV.dtcLineLooks()")}
        lk = looks()
        check('ECOAST red with the L dash, LINE1 in its colour %s' % lk, lk['ECOAST']['col'].lower() == '#ff0000' and lk['ECOAST']['dash'] == '12 12' and lk['LINE1']['col'].lower() == '#44e6ee' and lk['WCOAST']['dash'] == '')
        # editing on the map: ADD has the SIT lines 6-12 (F-15 only)
        at = lambda x, y: pg.evaluate("([x,y])=>{const M=__app.mapV,m=M.leaflet,p=m.latLngToContainerPoint(M.toLL(x,y)),r=m.getContainer().getBoundingClientRect();return [r.left+p.x,r.top+p.y]}", [x, y])
        pg.evaluate("()=>{const M=__app.mapV,m=M.leaflet;m.setView(M.toLL(500,430),8,{animate:false})}"); pg.wait_for_timeout(500)
        if not pg.is_visible('#mpdtc'): pg.click('#mpdtcb'); pg.wait_for_timeout(300)
        pg.click('#mpdadd'); pg.wait_for_timeout(300)
        check('ADD: the SIT lines 6-12 under the lines 1-4; ECOAST green (partly used), FEZ white', pg.is_visible('[data-add=line6]') and pg.is_visible('[data-add=line12]') and 'lng' in pg.get_attribute('[data-add=line6]', 'class') and 'lnw' in pg.get_attribute('[data-add=line8]', 'class') and pg.get_attribute('[data-add=line6]', 'title').startswith('ECOAST'))
        check('the filter of the SIT lines 6-12 is there with an F-15', pg.locator('#mpdtc input[data-k=ds]').count() == 1)
        pg.click('[data-add=line8]'); pg.wait_for_timeout(300)
        check('FEZ: add mode names the line and the point', pg.is_visible('#mpadd') and 'FEZ' in pg.inner_text('#mpadd') and 'point 1 of 30' in pg.inner_text('#mpadd'))
        pg.mouse.click(*at(500, 460)); pg.wait_for_timeout(400); pg.mouse.click(*at(510, 465)); pg.wait_for_timeout(400)
        check('two clicks: SITLINE_8_0 and _1 written, add mode on with a Break button', ln('SITLINE_8_0') and not ln('SITLINE_8_1').startswith('0.000000') and 'point 3 of 30' in pg.inner_text('#mpadd') and pg.locator('#mpadd [data-a=brk]').count() == 1)
        pg.click('#mpadd [data-a=brk]'); pg.wait_for_timeout(200)
        pg.mouse.click(*at(520, 470)); pg.wait_for_timeout(400); pg.mouse.click(*at(530, 470)); pg.wait_for_timeout(400)
        check('Break leaves point 3 empty: the line goes on at 4 and 5', ln('SITLINE_8_2') is None and not ln('SITLINE_8_3').startswith('0.000000') and not ln('SITLINE_8_4').startswith('0.000000'))
        labs = [z['lab'] for z in pg.evaluate("()=>__app.mapV.dtcLineLooks()")]
        check('the broken line is drawn in two pieces %s' % labs, labs.count('FEZ') == 2)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('the section [F15_SIT_LINES] keeps its place, the new keys go into it', pg.evaluate("()=>{const a=__app.lines;const i=a.findIndex(l=>l.raw=='[F15_SIT_LINES]'),j=a.findIndex(l=>l.k=='SITLINE_8_0'),c=a.findIndex(l=>l.raw=='[COMMS]');return i>=0&&j>i&&j<c}"))
        # the buttons of the SIT lines: the number and the initial of the name
        txt = lambda sel: pg.text_content(sel).strip()
        check('the SIT line buttons: 6E, 7W, 8F, 11H (add and delete)', txt('[data-add=line6]') == '6E' and txt('[data-add=line7]') == '7W' and txt('[data-add=line8]') == '8F' and txt('[data-add=line11]') == '11H' and txt('[data-del="12"]') == '12R' and txt('[data-add=line3]') == '3')
        # the menu of a point: the looks of the line, insert, break
        open_pt = lambda x, y: (pg.mouse.click(*at(x, y)), pg.wait_for_timeout(400))
        open_pt(*S6[1])
        check('a point of ECOAST: its menu names the line and has the looks (name, shown, colour, dash) and Insert / Break', pg.is_visible('.mpop .sitlook') and 'ECOAST' in pg.inner_text('.mpop') and pg.locator('.mpop [data-a=ins]').count() == 1 and pg.locator('.mpop [data-a=brk]').count() == 1)
        pg.click('.mpop [data-sdash="4"]'); pg.wait_for_timeout(200); pg.click('.mpop [data-shex=FFFF00]'); pg.wait_for_timeout(200)
        lk = looks()
        check('Dotted and yellow: written as DASHOPT 4 and COLORHEX, drawn at once, the menu stays open', ln('SITLINE_6_DASHOPT') == '4' and ln('SITLINE_6_COLORHEX') == 'FFFF00' and lk['ECOAST']['col'] == '#FFFF00' and lk['ECOAST']['dash'] == '4 4' and pg.is_visible('.mpop .sitlook'))
        pg.click('.mpop [data-son="0"]'); pg.wait_for_timeout(200)
        check('Off: ENABLED 0, the line dimmed', ln('SITLINE_6_ENABLED') == '0' and looks()['ECOAST']['op'] < 0.5)
        pg.fill('.mpop [data-f=sname]', 'COAST E'); pg.press('.mpop [data-f=sname]', 'Enter'); pg.wait_for_timeout(300)
        check('the name: SITLINE_6_NAME, the label follows', ln('SITLINE_6_NAME') == 'COAST E' and 'COAST E' in looks())
        check('...and its button: 6C', txt('[data-add=line6]') == '6C')
        pg.locator('.mpop [data-f=spick]').evaluate("e=>{e.value='#12ab34';e.dispatchEvent(new Event('change'))}"); pg.wait_for_timeout(200)
        check('the colour picker: any colour, written as COLORHEX', ln('SITLINE_6_COLORHEX') == '12AB34' and pg.input_value('.mpop [data-f=shex]') == '12AB34')
        pg.click('.mpop [data-a=ins]'); pg.wait_for_timeout(400)
        mid = ((S6[1][0] + S6[2][0]) / 2, (S6[1][1] + S6[2][1]) / 2)
        check('Insert after: a point half way, the next ones move down (5 points)', abs(float(ln('SITLINE_6_2').split(',')[1]) / FT - mid[0]) < 0.01 and not ln('SITLINE_6_4').startswith('0.000000'))
        open_pt(*S6[2]); pg.click('.mpop [data-a=brk]'); pg.wait_for_timeout(400)
        check('Break after: an empty point after it, the last one moves down', ln('SITLINE_6_4').startswith('0.000000') and not ln('SITLINE_6_5').startswith('0.000000'))
        open_pt(*S6[0]); pg.click('.mpop [data-a=del]'); pg.wait_for_timeout(400)
        check('Delete point: the others move up, the break with them', ln('SITLINE_6_3').startswith('0.000000') and ln('SITLINE_6_5').startswith('0.000000'))
        # snapping: a point added 5 px from a point of ECOAST goes exactly onto it
        pg.click('#mpdadd') if not pg.is_visible('[data-add=line9]') else None; pg.wait_for_timeout(300)
        check('Snap to points: on by default, in ADD', pg.is_checked('#mpdsnap'))
        pg.click('[data-add=line9]'); pg.wait_for_timeout(300)
        x0, y0 = at(*S7[1]); pg.mouse.move(x0 + 4, y0 + 3); pg.wait_for_timeout(200)
        pg.mouse.click(x0 + 4, y0 + 3); pg.wait_for_timeout(400); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('snapped: SITLINE_9_0 is exactly the 2nd point of WCOAST', ln('SITLINE_9_0') == ln('SITLINE_7_1'))
        pg.click('#mpdadd') if not pg.is_visible('#mpdsnap') else None; pg.wait_for_timeout(300)
        pg.uncheck('#mpdsnap'); pg.click('[data-add=line9]'); pg.wait_for_timeout(300)
        x0, y0 = at(*S7[0]); pg.mouse.click(x0 + 4, y0 + 3); pg.wait_for_timeout(400); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('Snap off: the point stays where it was clicked', ln('SITLINE_9_1') != ln('SITLINE_7_0') and not ln('SITLINE_9_1').startswith('0.000000'))
        pg.click('#mpdadd') if not pg.is_visible('#mpdsnap') else None; pg.wait_for_timeout(300); pg.check('#mpdsnap')
        # the rectangle: the lengths of its sides while it is placed and after, as labels
        pg.click('#mpdrect'); pg.wait_for_timeout(300); pg.mouse.click(*at(470, 450)); pg.wait_for_timeout(500)
        lens = lambda: sorted(pg.evaluate("()=>[...document.querySelectorAll('.rclen span')].map(e=>e.textContent)"))
        check('placing the rectangle: its 4 sides in NM %s' % lens(), lens() == ['12.0 NM', '12.0 NM', '20.0 NM', '20.0 NM'])
        pg.click('.rcbi [data-a=ok]'); pg.wait_for_timeout(500)
        check('placed: the lengths stay as labels on LINE2 %s' % lens(), lens() == ['12.0 NM', '12.0 NM', '20.0 NM', '20.0 NM'] and not ln('lineSTPT_10').startswith('0.000000'))
        if shots:
            pg.evaluate("()=>{const M=__app.mapV;M.leaflet.setView(M.toLL(470,450),10,{animate:false})}"); pg.wait_for_timeout(500); pg.screenshot(path=shots + '/sit-rect.png')
            pg.evaluate("()=>{const M=__app.mapV;M.leaflet.setView(M.toLL(500,430),8,{animate:false})}"); pg.wait_for_timeout(500)
        check('their filter: Rectangle sides (NM)', pg.locator('#mpdtc input[data-k=dn]').count() == 1)
        if shots: pg.screenshot(path=shots + '/sit-map.png')
        # an F-16: the map has no SIT lines 6-12 and draws the lines 1-4 in the DTC colour
        pg.evaluate("()=>{window.__sitOn=false;__app.mapV.refreshDtc()}"); pg.wait_for_timeout(400)
        labs = [z['lab'] for z in pg.evaluate("()=>__app.mapV.dtcLineLooks()")]
        check('an F-16: only LINE1-4 on the map, the SIT rows of ADD hidden %s' % labs, labs == ['LINE1', 'LINE2'] and not pg.is_visible('[data-add=line6]'))
        pg.evaluate("()=>{window.__sitOn=true;__app.mapV.refreshDtc()}"); pg.wait_for_timeout(300)
        # the menu of a point, for the screenshot
        open_pt(*S7[0])
        if shots: pg.screenshot(path=shots + '/sit-pop.png')
        pg.keyboard.press('Escape'); pg.evaluate("()=>__app.mapV.leaflet.closePopup()"); pg.wait_for_timeout(200)
        # a DTC of an older BMS (no [F15_SIT_LINES]): the first SIT point makes the section, at the end of the file
        old = INI.split('[F15_SIT_LINES]')[0] + '[COMMS]\r\nX=1\r\n'
        pg.evaluate("t=>__app.parse(t)", old); pg.wait_for_timeout(400)
        pg.click('#mpdadd') if not pg.is_visible('[data-add=line9]') else None; pg.wait_for_timeout(300)
        pg.click('[data-add=line9]'); pg.wait_for_timeout(300); pg.mouse.click(*at(500, 440)); pg.wait_for_timeout(400); pg.keyboard.press('Escape')
        tail = out().rstrip().split('\r\n')[-2:]
        check('an older DTC: the section is made at the end with the point %s' % tail, tail[0] == '[F15_SIT_LINES]' and tail[1].startswith('SITLINE_9_0='))
        print('errors', errs[:3])
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
