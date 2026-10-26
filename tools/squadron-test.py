"""Checks the Squadron tab: the logbook, and a session between two browsers (leader and pilot) with the code swap and the mission sent. Usage: python3 tools/squadron-test.py"""
import subprocess, sys, time, os, tempfile, asyncio, threading, json, zlib, struct
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8731', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def tracker():
    import websockets
    sw = {}
    async def h(ws):
        mine = []
        try:
            async for raw in ws:
                m = json.loads(raw); ih = m.get('info_hash'); pid = m.get('peer_id'); S = sw.setdefault(ih, {}); S[pid] = ws; mine.append((ih, pid))
                if m.get('to_peer_id'):
                    t = S.get(m['to_peer_id'])
                    if t: await t.send(json.dumps({'action': 'announce', 'info_hash': ih, 'peer_id': pid, 'offer_id': m['offer_id'], 'answer': m['answer']}))
                else:
                    others = [w for k, w in S.items() if k != pid]
                    for i, o in enumerate(m.get('offers') or []):
                        if others: await others[i % len(others)].send(json.dumps({'action': 'announce', 'info_hash': ih, 'peer_id': pid, 'offer_id': o['offer_id'], 'offer': o['offer']}))
                    await ws.send(json.dumps({'action': 'announce', 'info_hash': ih, 'interval': 120, 'complete': 0, 'incomplete': len(S)}))
        finally:
            for ih, pid in mine: sw.get(ih, {}).pop(pid, None)
    async def main():
        async with websockets.serve(h, 'localhost', 8735): await asyncio.Future()
    threading.Thread(target=lambda: asyncio.run(main()), daemon=True).start()
tracker()
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
def png(w=40, h=20, rgb=(200, 30, 30)):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
KEY = b'Falcon is your Master'
def lbk(name, cs, motto, sq):
    p = bytearray(372)
    for o, s in ((0, name), (21, cs), (225, motto), (346, sq)): p[o:o + len(s)] = s.encode()
    out = bytearray(); prev = 0x58
    for i, b in enumerate(p): c = b ^ prev ^ KEY[i % 21]; out.append(c); prev = c
    return bytes(out)
def start(br):
    ctx = br.new_context(viewport={'width': 1400, 'height': 1000}); pg = ctx.new_page(); errs = []
    import dialogs; dialogs.install(pg)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept()); pg.add_init_script('window.showOpenFilePicker=undefined;window.__swarmTest={trackers:["ws://localhost:8735"],interval:3000}')
    pg.goto('http://localhost:8731/app/index.html'); pg.wait_for_timeout(800); pg.click('[data-t=sq]'); pg.wait_for_timeout(300); return pg, errs
try:
    tmp = tempfile.mkdtemp()
    open(tmp + '/a.lbk', 'wb').write(lbk('Alpha Lead', 'Leader1', 'Semper fi', 'Red Devils'))
    open(tmp + '/b.lbk', 'wb').write(lbk('Bravo Wing', 'Wing2', 'Fly fast', 'Red Devils'))
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        A, ea = start(br); B, eb = start(br)
        check('the Squadron tab exists in the three sections Members, Me and Settings', A.locator('.tab[data-t=sq]').inner_text() == 'Squadron' and A.locator('#sq .sqc').count() == 12)
        check('the tabs Members, Me and Settings switch the sections', A.locator('#sqtabs button').all_text_contents() == ['Members', 'Me', 'Settings'] and A.is_visible('#sqhead') and not A.is_visible('#sqpilot'))
        for n, vis in (('me', '#sqpilot'), ('settings', '#sqconn'), ('members', '#sqhead')):
            A.click('#sqtabs [data-tab=%s]' % n); A.wait_for_timeout(100)
            check('tab %s shows its section only' % n, A.is_visible(vis) and A.locator('.sqpane:visible').count() == 1)
        for pg in (A, B): pg.add_style_tag(content='.sqpane.hide{display:flex!important}')
        check('no logbook yet in the browser: a hint is shown', 'logbook' in A.inner_text('#sqpilot').lower())
        for pg, f in ((A, 'a.lbk'), (B, 'b.lbk')):
            with pg.expect_file_chooser() as fc: pg.click('#sqopen')
            fc.value.set_files([tmp + '/' + f]); pg.wait_for_timeout(400)
        check('the logbook is decoded: name, callsign, squadron, motto', all(x in A.inner_text('#sqpilot') for x in ('Alpha Lead', 'Leader1', 'Red Devils', 'Semper fi')) and 'Wing2' in B.inner_text('#sqpilot'))
        check('the callsign of the session is filled in from the logbook', A.input_value('#sqcs') == 'Leader1')
        PB = open(R + '/tests/fixtures/squadron/PhoneBkn.ini', 'rb').read()
        A.set_input_files('#sqpbfile', files=[{'name': 'PhoneBkn.ini', 'mimeType': 'text/plain', 'buffer': PB}]); A.wait_for_timeout(300)
        check('the phone book shows the server with its address', 'Evil Server' in A.inner_text('#sqpb') and '0.0.0.0:32768' in A.inner_text('#sqpb'))
        ev = open(R + '/tests/fixtures/squadron/Evil19.lbk', 'rb').read()
        A.set_input_files('#sqfile', files=[{'name': 'Evil19.lbk', 'mimeType': 'application/octet-stream', 'buffer': ev}]); A.wait_for_timeout(400)
        check('the logbook statistics are shown (kills, hours, rank)', all(x in A.inner_text('#sqpilot') for x in ('219.3', '553', 'Maj', '127')))
        check('My pilot: the medal case shows the six medals as pictures, dimmed when none was awarded', A.locator('#sqpilot .sqmd').count() == 6 and A.locator('#sqpilot .sqmd svg').count() == 6 and A.locator('#sqpilot .sqmd:not(.no)').count() >= 1 and A.evaluate("()=>getComputedStyle(document.querySelector('#sqpilot .sqmd')).borderTopWidth") == '0px' and A.evaluate("()=>getComputedStyle(document.querySelector('#sqpilot .sqcards div')).borderTopWidth") == '0px')
        check('My pilot: groups of statistics (Flying, Kills, Dogfights, Campaigns, Medals) and the rank insignia', A.locator('#sqpilot .pilg h4').all_text_contents() == ['Flying', 'Kills', 'Dogfights', 'Campaigns', 'Medals'] and A.locator('#sqpilot .pilhead svg').count() == 1)
        check('My pilot: the avatar and its buttons sit beside the statistics', A.is_visible('#sqavbox') and A.is_visible('#sqavb') and A.is_visible('#sqavx'))
        A.set_input_files('#sqfile', files=[{'name': 'a.lbk', 'mimeType': 'application/octet-stream', 'buffer': open(tmp + '/a.lbk', 'rb').read()}]); A.wait_for_timeout(300)
        A.click('#sqdirect summary'); B.click('#sqdirect summary')
        A.click('#sqlead'); A.wait_for_timeout(200); check('the leader sees Add a pilot and Leave', A.is_visible('#sqadd') and A.is_visible('#sqend') and not A.is_visible('#sqlead'))
        A.click('#sqadd'); A.wait_for_timeout(2500)
        inv = A.locator('#sqinv textarea').first.input_value()
        check('an invite code is made (BC1....)', inv.startswith('BC1.') and len(inv) > 100)
        B.click('#sqjoinb'); B.wait_for_timeout(200); B.fill('#sqincode', inv); B.click('#sqmk'); B.wait_for_timeout(2500)
        ans = B.input_value('#sqanscode'); check('the pilot gets an answer code', ans.startswith('BC1.'))
        A.fill('#sqinv textarea[data-a]', ans); A.click('#sqinv [data-k]')
        for _ in range(45):
            A.wait_for_timeout(1000)
            if A.locator('#sqmem .sqd.connected').count() == 1 and B.locator('#sqmem .sqd.connected').count() == 1: break
        check('both sides are connected and see each other', A.locator('#sqmem .sqd.connected').count() == 1 and B.locator('#sqmem .sqd.connected').count() == 1 and 'Wing2' in A.inner_text('#sqmem') and 'Leader1' in B.inner_text('#sqmem'))
        check('the leader can send the mission', A.is_enabled('#sqsend'))
        big = '{"name":"TEST MISSION","x":"' + 'abc é€ ' * 20000 + '"}'
        A.evaluate("t=>__app.sq.S.sendMission(t,'TEST MISSION')", big); B.wait_for_timeout(2500)
        B.locator('.sqpop [data-x]').count() and B.click('.sqpop [data-x]')
        check('the pilot received the mission (big, in chunks) and can load it', 'TEST MISSION' in B.inner_text('#sqrecv') and B.locator('#sqrecv [data-load]').count() == 1)
        check('the text arrived whole (%d characters)' % len(big), B.evaluate('t=>__app.sq.received()[0].text===t', big))
        A.click('#sqend'); A.wait_for_timeout(300); check('Leave closes the session', A.is_visible('#sqlead') and not A.is_visible('#sqadd'))
        B.wait_for_timeout(1500); check('the pilot sees the link closed', B.locator('#sqmem .sqd.connected').count() == 0)
        # ---- squadron through the (mock) tracker ----
        check('the top bar with the DTC and mission buttons is hidden in the Squadron tab', not A.is_visible('#mainbar'))
        A.fill('#sqnew', 'Red Devils'); A.click('#sqcreate'); A.wait_for_timeout(400)
        check('the squadron is created: name field and roster with me', A.inner_text('#sqtitle') == 'Red Devils' and 'Leader1' in A.inner_text('#sqros'))
        A.fill('#sqnew', 'Second Squadron'); A.click('#sqcreate'); A.wait_for_timeout(300)
        check('more squadrons can be created (selector and list in Me)', A.locator('#sqmine .sqsqr').count() == 2 and A.locator('#sqsel option').count() == 2)
        A.select_option('#sqsel', label='Red Devils (yours)'); A.wait_for_timeout(300)
        code = A.locator('#sqinvs .sqi', has_text='Red Devils').locator('[data-code]').input_value()
        check('the invite code of each squadron is in Settings (BCS)', code.startswith('BCS.') and A.locator('#sqinvs .sqi').count() == 2)
        check('Settings shows the trackers in use', 'ws://localhost:8735' in A.inner_text('#sqconn'))
        B.fill('#sqinvin', code); B.click('#sqjoinsq'); B.wait_for_timeout(300)
        check('the squadron joined by invite is listed, not owned', B.locator('#sqmine .sqsqr').count() == 1 and 'member' in B.inner_text('#sqmine') and B.locator('#sqrename').count() == 0 and B.locator('#sqdelete').count() == 0)
        for _ in range(30):
            A.wait_for_timeout(1000)
            if A.locator('#sqros tr[data-uid] .sqd.connected').count() == 2 and B.locator('#sqros tr[data-uid] .sqd.connected').count() == 2: break
        print('connected after ~%ds' % (_ + 1))
        check('both see the other online (green) in the roster', A.locator('#sqros tr[data-uid] .sqd.connected').count() == 2 and B.locator('#sqros tr[data-uid] .sqd.connected').count() == 2)
        check('the commander is on top for everybody and called COMMANDER', 'COMMANDER' in B.locator('#sqros tr[data-uid]').first.inner_text() and 'COMMANDER' not in B.locator('#sqros tr[data-uid]').last.inner_text() and 'COMMANDER' in A.locator('#sqros tr[data-uid]').first.inner_text())
        check('the roster has both pilots on both sides', 'Wing2' in A.inner_text('#sqtabbox') and 'Leader1' in B.inner_text('#sqtabbox'))
        B.wait_for_timeout(300); A.click('#sqrename'); A.fill('#sqname', 'Blue Devils'); A.click('#sqeditok'); check('the new name shows at once for the creator', A.inner_text('#sqtitle') == 'Blue Devils' and 'Blue Devils' in A.inner_text('#sqsel')); B.wait_for_timeout(1500)
        check('the new squadron name reaches the other pilot', B.inner_text('#sqtitle') == 'Blue Devils')
        A.locator('#sqros tr[data-uid]:not(:first-child) input[data-f=role]').fill('Wingman'); A.locator('#sqros tr[data-uid]:not(:first-child) input[data-f=role]').press('Tab'); A.wait_for_timeout(2500)
        check('the role set in the roster reaches the pilot', 'Wingman' in B.evaluate("JSON.stringify(__app.sq.db().squads)"))
        import base64
        b64 = base64.b64encode(open(R + '/tests/fixtures/beartrap/PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
        A.evaluate("""async(b)=>{await __app.loadCam(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.cam'))}""", b64); A.wait_for_timeout(1200)
        A.click('[data-t=sq]'); A.wait_for_timeout(300)
        t = A.inner_text('#sqcamp')
        check('the campaign section is a table with only the squadron of the player', '78th' in t and 'Missions' in t and 'Aircraft lost' in t and 'Pilots lost' in t and 'Naval' in t and 'Stationary' in t and 'U.S.' in t and 'Gunsan' in t and A.locator('#sqcamp table.dt').count() == 1 and A.locator('#sqcamp tr').count() == 3)
        # pictures: the avatar of a pilot and the logo of a squadron reach the others
        B.set_input_files('#sqavfile', files=[{'name': 'me.png', 'mimeType': 'image/png', 'buffer': png(300, 200)}]); B.wait_for_selector('.sqcrop canvas')
        check('a window shows the picture with Whole picture, Fill, a zoom slider, Cancel and OK', B.locator('.sqcrop [data-m=fit]').count() == 1 and B.locator('.sqcrop [data-m=fill]').count() == 1 and B.locator('.sqcz').count() == 1 and B.locator('.sqcrop [data-m=ok]').count() == 1 and B.locator('.sqcrop [data-m=no]').count() == 1 and B.locator('#sqavbox img').count() == 0)
        px0 = B.evaluate("()=>{const c=document.querySelector('.sqcrop canvas').getContext('2d');return c.getImageData(130,5,1,1).data[3]}")
        B.click('.sqcrop [data-m=fill]'); px1 = B.evaluate("()=>{const c=document.querySelector('.sqcrop canvas').getContext('2d');return c.getImageData(130,5,1,1).data[3]}")
        check('Whole picture leaves a margin, Fill covers the square', px0 == 0 and px1 == 255)
        bx = B.locator('.sqcrop canvas').bounding_box(); B.mouse.move(bx['x'] + 100, bx['y'] + 100); B.mouse.down(); B.mouse.move(bx['x'] + 200, bx['y'] + 100, steps=4); B.mouse.up()
        check('dragging moves the picture (a strip of the square is left empty)', B.evaluate("()=>document.querySelector('.sqcrop canvas').getContext('2d').getImageData(3,130,1,1).data[3]") == 0)
        B.fill('.sqcz', '300'); B.dispatch_event('.sqcz', 'input'); B.click('.sqcrop [data-m=ok]'); B.wait_for_timeout(800)
        check('OK applies it: a square avatar, shown big', B.locator('.sqcrop').count() == 0 and B.evaluate("()=>document.querySelector('#sqavbox img').naturalWidth") == 128 and B.evaluate("()=>document.querySelector('#sqavbox img').naturalHeight") == 128 and B.evaluate("()=>document.querySelector('#sqavbox img').width") >= 100)
        B.set_input_files('#sqavfile', files=[{'name': 'me2.png', 'mimeType': 'image/png', 'buffer': png(300, 200)}]); B.wait_for_selector('.sqcrop canvas'); B.click('.sqcrop [data-m=no]'); B.wait_for_timeout(300)
        check('Cancel leaves the avatar as it was', B.locator('.sqcrop').count() == 0 and B.locator('#sqavbox img').count() == 1)
        check('the other pilot sees the avatar in the roster', A.locator('#sqros img.sqav').count() >= 1)
        B.set_input_files('#sqavfile', files=[{'name': 'x.gif', 'mimeType': 'image/gif', 'buffer': b'GIF89a'}]); B.wait_for_timeout(300)
        check('a GIF is refused', B.locator('#sqavbox img').count() == 1 and B.locator('.sqcrop').count() == 0)
        A.set_input_files('#sqlogofile', files=[{'name': 'logo.png', 'mimeType': 'image/png', 'buffer': png(400, 400, (30, 30, 200))}]); A.wait_for_selector('.sqcrop canvas'); A.click('.sqcrop [data-m=ok]'); A.wait_for_timeout(1200)
        check('the logo is set by the creator', A.locator('#sqhead img.sqlogo').count() == 1 and A.evaluate("()=>document.querySelector('#sqhead img.sqlogo').naturalWidth") == 192)
        B.wait_for_timeout(1500); check('the other pilot sees the logo', B.locator('#sqhead img.sqlogo').count() == 1)
        check('only the creator has the logo button', A.locator('#sqlogo').count() == 1 and B.locator('#sqlogo').count() == 0)
        A.click('#sqros [data-send]'); A.wait_for_selector('.sqpop [data-src]'); check('the send popup offers the mission', A.locator('.sqpop [data-src]').count() == 1)
        A.click('.sqpop [data-ok]'); A.wait_for_selector('.sqpop h3:has-text("Mission delivered")', timeout=20000); check('a success popup tells the mission was sent', True)
        A.click('.sqpop [data-ok]'); B.wait_for_selector('.sqpop:has-text("Load it now")'); check('the receiver is asked to load it now', True); B.click('.sqpop [data-x]'); B.wait_for_timeout(500)
        check('the mission goes to the online pilot', B.locator('#sqrecv [data-load]').count() >= 1)
        A.click('#sqbcast'); A.wait_for_selector('.sqpop [data-ok]'); A.click('.sqpop [data-ok]'); A.wait_for_selector('.sqpop h3:has-text("Mission delivered")', timeout=20000); A.click('.sqpop [data-ok]'); B.wait_for_selector('.sqpop [data-x]'); B.click('.sqpop [data-x]'); B.wait_for_timeout(1500); check('send to everybody online', B.locator('#sqrecv [data-load]').count() >= 2)
        A.locator('#sqros tr[data-uid]:not(:first-child) [data-lead]').click(); A.wait_for_timeout(1500)
        check('the mission leader is chosen and seen by the other pilot', '★' in A.inner_text('#sqros') and '★' in B.inner_text('#sqros'))
        check('only the leader can send: the owner no longer', not A.is_enabled('#sqbcast') and B.is_enabled('#sqbcast'))
        # moderation: the creator removes the pilot
        A.once('dialog', lambda d: d.accept()); A.locator('#sqmine .sqsqr', has_text='Blue Devils').locator('[data-kick]').click(); B.wait_for_timeout(3000)
        check('the removed pilot is out of the squadron', B.locator('#sqmine .sqsqr').count() == 0 and A.locator('#sqros tr[data-uid]').count() == 1)
        B.fill('#sqinvin', code); B.click('#sqjoinsq'); B.wait_for_timeout(6000)
        check('a removed pilot cannot come back with the invite', A.locator('#sqros tr[data-uid]').count() == 1)
        n0 = A.locator('#sqmine .sqsqr').count()
        check('the creator sees Delete (not Leave) on his squadron', A.locator('#sqmine .sqsqr', has_text='Blue Devils').locator('[data-leave]').inner_text() == 'Delete')
        A.click('#sqtabs [data-tab=members]'); A.click('#sqdelete'); A.wait_for_timeout(1200); A.click('#sqtabs [data-tab=me]')
        check('Delete removes the squadron', A.locator('#sqmine .sqsqr').count() == n0 - 1)
        A.click('#sqtabs [data-tab=settings]'); A.wait_for_timeout(200)
        check('the settings show the diagnostics and the TURN field', A.is_visible('#sqturn') and A.is_visible('#sqturnsave'))
        A.click('#sqnettest'); A.wait_for_function("()=>document.querySelector('#sqnet').textContent!=='Testing…'", timeout=15000); check('the network test gives an answer', len(A.inner_text('#sqnet')) > 20)
        check('no script errors', not ea and not eb)
        if ea or eb: print(ea, eb)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
