"""Checks the Kneeboard tab (browser mode: files are downloaded). Usage: python3 tools/kneeboard-test.py [screenshot_dir]"""
import base64, subprocess, sys, time, os, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
def drag(pg, a, b):
    ba, bb = pg.locator(a).bounding_box(), pg.locator(b).bounding_box()
    pg.mouse.move(ba['x'] + ba['width'] / 2, ba['y'] + ba['height'] / 2); pg.mouse.down(); pg.mouse.move(ba['x'] + 40, ba['y'] + 60, steps=4)
    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2, steps=8)
    over = pg.locator(b).get_attribute('class'); pg.mouse.up(); pg.wait_for_timeout(400); return over
def drag_edge(pg, a, b, fx):
    ba, bb = pg.locator(a).bounding_box(), pg.locator(b).bounding_box()
    pg.mouse.move(ba['x'] + ba['width'] / 2, ba['y'] + ba['height'] / 2); pg.mouse.down(); pg.mouse.move(ba['x'] + 40, ba['y'] + 60, steps=4)
    pg.mouse.move(bb['x'] + bb['width'] * fx, bb['y'] + bb['height'] / 2, steps=8)
    over = pg.locator(b).get_attribute('class'); pg.mouse.up(); pg.wait_for_timeout(400); return over
def page(color, txt, size=(612, 792)):
    im = Image.new('RGB', size, 'white'); d = ImageDraw.Draw(im); d.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=color, width=10); d.text((40, 40), txt, fill=color); return im
DISMISS = [False]
S = lambda side, r: '#kn div.kbt[data-s=%s][data-r="%d"]' % (side, r)
cap = lambda pg: pg.inner_text('#kbcap')
def start(br, motion):
    pg = br.new_page(viewport={'width': 1700, 'height': 1800}, accept_downloads=True, reduced_motion=motion); errs = []
    import dialogs; dialogs.install(pg)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (d.dismiss() if DISMISS[0] else d.accept())); pg.add_init_script('window.showOpenFilePicker=undefined')
    pg.goto('http://localhost:8769/app/index.html'); pg.wait_for_timeout(800)
    b = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
    pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", b)
    pg.wait_for_timeout(500); pg.click('[data-t=kn]'); pg.wait_for_timeout(500); return pg, errs
try:
    tmp = tempfile.mkdtemp()
    page('red', 'JPG').save(tmp + '/a.jpg'); page('blue', 'PNG').save(tmp + '/b.png'); page('green', 'WEBP').save(tmp + '/c.webp')
    p1, p2 = page('black', 'PDF1'), page('purple', 'PDF2'); p1.save(tmp + '/d.pdf', save_all=True, append_images=[p2])
    big = [page('black', 'P%d' % i, (612, 792)) for i in range(1, 121)]; big[0].save(tmp + '/big.pdf', save_all=True, append_images=big[1:])
    with sync_playwright() as p:
        br = p.chromium.launch()
        # ---------------- animations on: drag mode ----------------
        pg, errs = start(br, 'no-preference')
        check('tabs: Datacard and Kneeboard', pg.locator('.tab[data-t=kb]').inner_text() == 'Datacard' and pg.locator('.tab[data-t=kn]').inner_text() == 'Kneeboard')
        check('16 cards per side, big preview, tray and bin', pg.locator('#kn div.kbt[data-s=left]').count() == 16 and pg.locator('#kn div.kbt[data-s=right]').count() == 16 and pg.locator('#kbpv').count() == 1 and pg.locator('#kbtrash').count() == 1)
        pg.click(S('left', 3)); check('click selects the row and opens no menu', pg.locator('#kbmenu').count() == 0 and cap(pg).startswith('Row 4'))
        check('DTC buttons hidden on this tab', not pg.is_visible('#open') and not pg.is_visible('#save'))
        check('Import images has the same green as the other buttons and Clear kneeboard is red', pg.evaluate("getComputedStyle(document.querySelector('#kbimp')).backgroundColor") == 'rgb(76, 195, 138)' and pg.evaluate("getComputedStyle(document.querySelector('#kbclr')).backgroundColor") == 'rgb(143, 29, 29)')
        with pg.expect_file_chooser() as fc: pg.click('#kbimp')
        fc.value.set_files([tmp + '/a.jpg', tmp + '/b.png', tmp + '/c.webp', tmp + '/d.pdf']); pg.wait_for_timeout(2500)
        check('5 imported cards wait among the unused ones: ' + pg.inner_text('#kbst'), pg.locator('#kbtray div.kbtr').count() == 5 and pg.inner_text('#kbst').startswith('5 card'))
        pg.click(S('left', 1)); pg.click(S('left', 0))
        ov = drag(pg, '#kbtray div.kbtr >> nth=0', S('left', 1)); check('target highlighted while dragging', 'dr' in ov.split())
        pg.click(S('left', 1)); check('unused card placed in left 2 (a.jpg), tray has 4', 'Left: a.jpg' in cap(pg) and pg.locator('#kbtray div.kbtr').count() == 4)
        drag(pg, S('left', 1), S('right', 4)); pg.click(S('right', 4)); check('drag swaps cards (a.jpg now right, row 5)', 'Right: a.jpg' in cap(pg))
        pg.click(S('left', 1)); check('the old slot is now empty', 'Left: Empty' in cap(pg))
        drag(pg, S('right', 4), '#kbtray'); check('dragging a card to the unused cards takes it off the kneeboard', pg.locator('#kbtray div.kbtr').count() == 5)
        drag(pg, '#kbtray div.kbtr >> nth=0', '#kbtrash'); check('the bin deletes a card for good', pg.locator('#kbtray div.kbtr').count() == 4)
        drag(pg, S('left', 0), S('left', 2)); pg.click(S('left', 2)); check('datacard moves like any card', 'Left: Datacard Left' in cap(pg))
        drag(pg, S('left', 2), '#kbtrash'); check('datacard dropped on the bin only leaves the kneeboard (back to unused)', pg.locator('#kbtray div.kbtr').count() == 5)
        drag(pg, '#kbtray div.kbtr >> nth=0', S('left', 1)); pg.click(S('left', 1)); n1 = cap(pg); drag(pg, '#kbtray div.kbtr >> nth=0', S('left', 2)); pg.click(S('left', 2)); n2 = cap(pg)
        ov = drag_edge(pg, '#kbtray div.kbtr >> nth=0', S('left', 1), 0.1); pg.click(S('left', 1)); a1 = cap(pg); pg.click(S('left', 2)); a2 = cap(pg); pg.click(S('left', 3)); a3 = cap(pg)
        check('dropping on the left edge of a card shows the insert bar', 'ib' in (ov or '').split())
        L = lambda t: t.split('Left: ')[1].split(' ·')[0]
        check('a card dropped between two others is inserted there and the next ones move on', L(a1) != L(n1) and L(a2) == L(n1) and L(a3) == L(n2))
        for r in (3, 2, 1): drag(pg, S('left', r), '#kbtray')
        with pg.expect_file_chooser() as fc: pg.click('#kbimp')
        fc.value.set_files([tmp + '/big.pdf']); pg.wait_for_timeout(1500)
        check('a PDF with many pages asks which pages to import', pg.locator('dialog[open] #pgin').count() == 1)
        pg.fill('#pgin', '0'); pg.click('#pgok'); check('a wrong page list shows an error and keeps the dialog', pg.locator('dialog[open] #pgin').count() == 1 and pg.inner_text('#pgerr') != '')
        pg.fill('#pgin', '1-100'); pg.click('#pgok'); check('too many pages are refused', 'at most' in pg.inner_text('#pgerr'))
        pg.fill('#pgin', '2-4'); n0 = pg.locator('#kbtray div.kbtr').count(); pg.click('#pgok'); pg.wait_for_timeout(2500)
        check('only the chosen pages are imported (3 more cards)', pg.locator('#kbtray div.kbtr').count() == n0 + 3)
        with pg.expect_file_chooser() as fc: pg.click('#kbimp')
        fc.value.set_files([tmp + '/big.pdf']); pg.wait_for_timeout(1500); pg.click('#pgno'); pg.wait_for_timeout(600)
        check('Cancel in the page dialog imports nothing', pg.locator('#kbtray div.kbtr').count() == n0 + 3)
        with pg.expect_file_chooser() as fc: pg.click('#kbimp')
        fc.value.set_files([tmp + '/big.pdf']); pg.wait_for_timeout(1500); pg.fill('#pgin', '1-40'); pg.click('#pgok'); pg.wait_for_timeout(15000)
        heap = pg.evaluate('()=>Math.round(performance.memory.usedJSHeapSize/1048576)'); print('     JS heap after importing 40 PDF pages: %d MB' % heap)
        check('40 pages imported and the page is still alive (heap < 300 MB)', pg.locator('#kbtray div.kbtr').count() == n0 + 43 and heap < 300)
        pg.evaluate("""async()=>{const dt=new DataTransfer();const c=document.createElement('canvas');c.width=60;c.height=90;const x=c.getContext('2d');x.fillStyle='#08f';x.fillRect(0,0,60,90);const b=await new Promise(r=>c.toBlob(r,'image/png'));dt.items.add(new File([b],'dropped.png',{type:'image/png'}));
          window.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}""");
        pg.wait_for_timeout(800); check('dropping a file on the page imports it among the unused cards', pg.locator('#kbtray div.kbtr[title=\"dropped.png\"]').count() == 1)
        eb = pg.locator(S('left', 12)).bounding_box()
        pg.evaluate("async(p)=>{const dt=new DataTransfer();const c=document.createElement('canvas');c.width=60;c.height=90;const x=c.getContext('2d');x.fillStyle='#f80';x.fillRect(0,0,60,90);const b=await new Promise(r=>c.toBlob(r,'image/png'));dt.items.add(new File([b],'onslot.png',{type:'image/png'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:p.x,clientY:p.y}))}", {'x': eb['x'] + 40, 'y': eb['y'] + 60}); pg.wait_for_timeout(800)
        pg.click(S('left', 12)); check('a file dropped on an empty slot goes straight into that slot', 'Left: onslot.png' in cap(pg) and pg.locator('#kbtray div.kbtr[title="onslot.png"]').count() == 0)
        n1 = pg.locator('#kbtray div.kbtr').count(); drag(pg, S('left', 12), '#kbtrash'); check('a card dragged from a slot to the bin is deleted without passing through the unused cards', pg.locator('#kbtray div.kbtr').count() == n1 and pg.locator('#kbtray div.kbtr[title="onslot.png"]').count() == 0)
        pg.click('#kbtrash'); pg.wait_for_timeout(500); check('clicking the bin empties the unused imported cards (datacard pages stay)', pg.locator('#kbtray div.kbtr').count() <= 2)
        DISMISS[0] = True; pg.click('#kbclr'); pg.wait_for_timeout(300); pg.click(S('right', 0)); DISMISS[0] = False
        check('Clear kneeboard: Cancel leaves the cards where they are', 'Right: Datacard Right' in cap(pg))
        with pg.expect_file_chooser() as fc: pg.click(S('left', 7))
        fc.value.set_files([tmp + '/a.jpg']); pg.wait_for_timeout(800); pg.click(S('left', 7)); check('clicking an empty slot opens the import and fills it', 'Left: a.jpg' in cap(pg))
        gb = pg.locator(S('left', 15)).bounding_box(); bb = pg.locator('#kbdef').bounding_box(); y0 = bb['y']; check('buttons sit right under the cards', 0 <= bb['y'] - (gb['y'] + gb['height']) < 40)
        drag(pg, '#kbtray div.kbtr >> nth=0', S('left', 9)); check('buttons do not move when unused cards change', abs(pg.locator('#kbdef').bounding_box()['y'] - y0) < 2)
        pg.click(S('left', 7)); a0 = pg.evaluate("()=>document.getElementById('kbpv').getContext('2d').getImageData(300,4,1,1).data.join()")
        pg.click('#kbfit'); pg.wait_for_timeout(200); a1 = pg.evaluate("()=>document.getElementById('kbpv').getContext('2d').getImageData(300,4,1,1).data.join()")
        check('"Keep page proportions" changes how the picture is drawn (%s -> %s)' % (a0, a1), a0 != a1); pg.click('#kbfit')
        check('big preview is centred', pg.evaluate("(()=>{const c=document.getElementById('kbpv').getBoundingClientRect(),m=document.querySelector('.kbw').getBoundingClientRect();return Math.abs(c.left+c.width/2-(m.left+m.width/2))<3})()"))
        pv = pg.evaluate("(()=>{const c=document.getElementById('kbpv'),r=c.getBoundingClientRect();return [c.width/c.height,r.width/r.height]})()"); check('big preview keeps the 2048x2048 proportions (%s)' % pv, abs(pv[0] - 1) < .01 and abs(pv[1] - 1) < .02)
        pg.click('#kbf5'); check('DXT5 button selected', 'g' not in (pg.get_attribute('#kbf5', 'class') or '').split() and 'g' in pg.get_attribute('#kbf1', 'class').split()); pg.click('#kbf1')
        pg.click(S('right', 0)); check('before: right card of row 1 is the datacard', 'Right: Datacard Right' in cap(pg))
        pg.click('#kbdef'); pg.click('#kbclr'); pg.click(S('right', 0)); check('clear empties everything', cap(pg).endswith('Right: Empty'))
        pg.click('#kbldef'); pg.click(S('right', 0)); check('Load brings the remembered cards back', 'Right: Datacard Right' in cap(pg))
        if shots: pg.screenshot(path=shots + '/kneeboard.png')
        pg.click('[data-t=kb]'); pg.wait_for_timeout(300)
        bx = pg.locator('#d1').bounding_box(); pg.mouse.click(bx['x'] + bx['width'] - 10, bx['y'] + bx['height'] / 2); pg.wait_for_timeout(250)
        check('custom calendar opens from the calendar icon', pg.locator('.dcp').count() == 1)
        check('the native date indicator is hidden (no overlapping picker)', pg.evaluate("[...document.styleSheets].some(s=>[...s.cssRules].some(r=>r.cssText.includes('calendar-picker-indicator')&&r.cssText.includes('display: none')))"))
        old = pg.input_value('#d1'); pg.locator('.dcp .dcd').nth(14).click(); pg.wait_for_timeout(250)
        if pg.input_value('#d1') == old:   # the cell was today's date: pick another one
            pg.mouse.click(bx['x'] + bx['width'] - 10, bx['y'] + bx['height'] / 2); pg.wait_for_timeout(250); pg.locator('.dcp .dcd').nth(10).click(); pg.wait_for_timeout(250)
        check('picking a day sets the date and closes the calendar', pg.input_value('#d1') != old and pg.locator('.dcp').count() == 0)
        pg.click('#aq_viewb'); pg.wait_for_timeout(250)
        check('custom drop-down opens for a select', pg.locator('.ddp .ddi').count() >= 2)
        pg.locator('.ddp .ddi').nth(1).click(); pg.wait_for_timeout(250); check('drop-down closes after picking', pg.locator('.ddp').count() == 0)
        pg.click('[data-t=kn]'); pg.wait_for_timeout(300)
        pg.click('#kbldef'); pg.wait_for_timeout(300)
        got = []; pg.on('download', lambda d: got.append(d)); pg.click('#kbsave'); pg.wait_for_timeout(6000)
        names = sorted(d.suggested_filename for d in got); check('files written %s' % names, names == ['7982.dds', '7989.dds', '7991.dds'])
        gd = {d.suggested_filename: d.path() for d in got}; im = Image.open(gd['7989.dds']).convert('RGB'); px = im.getpixel((6, 1000))
        check('row 8 DDS holds the red-bordered JPG on its left page (pixel %s)' % (px,), px[0] > 180 and px[1] < 90 and px[2] < 90)
        check('DXT1 2048x2048 size', all(os.path.getsize(d.path()) == 128 + 2048 * 2048 // 2 for d in got))
        check('no page errors %s' % errs, not errs); pg.close()
        # ---------------- animations off: menu mode ----------------
        pg, errs = start(br, 'reduce')
        check('animations off: no tray, no bin, no import button', pg.locator('#kbtray').count() == 0 and pg.locator('#kbtrash').count() == 0 and pg.locator('#kbimp').count() == 0)
        pg.click(S('left', 1)); check('animations off: click opens the menu', pg.locator('#kbmenu').count() == 1)
        check('menu says only "Import images…"', pg.inner_text('#kbmenu [data-a=imp]').strip().endswith('Import images…') and 'PDF' not in pg.inner_text('#kbmenu'))
        with pg.expect_file_chooser() as fc: pg.click('#kbmenu [data-a=imp]')
        fc.value.set_files([tmp + '/a.jpg', tmp + '/b.png', tmp + '/c.webp', tmp + '/d.pdf']); pg.wait_for_timeout(2500)
        check('imported pages fill the slots: ' + pg.inner_text('#kbst'), pg.inner_text('#kbst').startswith('5 page'))
        pg.click(S('left', 5)); pg.wait_for_timeout(200); check('slot 6 holds the last pdf page', 'd.pdf p.2' in pg.inner_text('#kbmenu .mc span'))
        pg.click('#kbmenu [data-a=next]'); check('next cycles to Empty', pg.inner_text('#kbmenu .mc span') == 'Empty')
        pg.click('#kbmenu [data-a=next]'); check('then Datacard Left', pg.inner_text('#kbmenu .mc span') == 'Datacard Left')
        pg.click('#kbmenu [data-a=clr]')
        ba = pg.locator(S('left', 1)).bounding_box(); pg.mouse.move(ba['x'] + 30, ba['y'] + 40); pg.mouse.down(); pg.mouse.move(ba['x'] + 200, ba['y'] + 200, steps=6); pg.mouse.up()
        check('animations off: no dragging (no ghost card)', pg.locator('body > canvas').count() == 0)
        check('no page errors %s' % errs, not errs); pg.close(); br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
