"""Squadron > Briefing between two browsers of the same squadron (a mock tracker, real WebRTC): the commander opens the room, a wingman joins, the drawings,
the cursor, the pen, the view of the briefer, the kneeboard card and the closing of the room reach the other side. No BMS files. Usage: python3 tools/briefing-test.py"""
import subprocess, sys, time, os, asyncio, threading, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
PORT, TPORT = 8951, 8955
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
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
        async with websockets.serve(h, 'localhost', TPORT): await asyncio.Future()
    threading.Thread(target=lambda: asyncio.run(main()), daemon=True).start()
tracker()

def start(br, cs):
    ctx = br.new_context(viewport={'width': 1500, 'height': 950}); pg = ctx.new_page(); errs = []
    import dialogs; dialogs.install(pg)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script('window.showOpenFilePicker=undefined;window.__swarmTest={trackers:["ws://localhost:%d"],interval:3000}' % TPORT)
    pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900); pg.click('[data-t=sq]'); pg.wait_for_timeout(300)
    pg.click('#sqtabs [data-tab=me]'); pg.fill('#sqcs', cs); pg.dispatch_event('#sqcs', 'change'); pg.wait_for_timeout(100)
    return pg, errs
def all_panes(pg, on):
    pg.evaluate("on=>{let s=document.getElementById('brtest');if(on&&!s){s=document.createElement('style');s.id='brtest';s.textContent='.sqpane.hide{display:flex!important}';document.head.append(s)}if(!on&&s)s.remove()}", on)
def brief(pg):
    pg.click('#sqtabs [data-tab=brief]'); pg.wait_for_timeout(700)
def mapbox(pg):
    return pg.locator('.brw .brmapw').bounding_box()
def drag(pg, a, b, steps=8):
    m = mapbox(pg); pg.mouse.move(m['x'] + a[0], m['y'] + a[1]); pg.mouse.down(); pg.mouse.move(m['x'] + b[0], m['y'] + b[1], steps=steps); pg.mouse.up(); pg.wait_for_timeout(150)
def R_(pg, js):
    return pg.evaluate('()=>{const r=__app.sq.briefing()._r;return (' + js + ')}')
try:
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        A, ea = start(br, 'Evil'); B, eb = start(br, 'Wing2')
        check('the Squadron page has a Briefing tab between Organization and Missions', A.locator('#sqtabs button').all_text_contents() == ['Members', 'Organization', 'Briefing', 'Missions', 'Me', 'Settings'])
        brief(A)
        check('without a squadron the room says to join or create one first', 'squadron first' in A.inner_text('.brjoin'))
        check('the Briefing holds the map of the Map page (not editable)', A.locator('.brw .brmap #mpmap').count() == 1 and A.evaluate('()=>__app.mapV.isEdit()') is False)
        check('the page is wide while the Briefing is shown', A.evaluate("()=>document.querySelector('main').classList.contains('wide')"))
        A.click('[data-t=mp]'); A.wait_for_timeout(500)
        check('the Map page takes its map back', A.locator('#mpbody #mpmap').count() == 1 and A.locator('.brw #mpmap').count() == 0 and A.evaluate('()=>__app.mapV.isEdit()') is True)
        A.click('[data-t=sq]'); A.wait_for_timeout(300)
        # the squadron: A creates it, B joins with the invite code
        all_panes(A, True); all_panes(B, True)
        A.evaluate("()=>{document.getElementById('sqnew').value='Red Devils';document.getElementById('sqcreate').click()}"); A.wait_for_timeout(400)
        code = A.locator('#sqinvs .sqi', has_text='Red Devils').locator('[data-code]').input_value()
        B.evaluate("c=>{document.getElementById('sqinvin').value=c;document.getElementById('sqjoinsq').click()}", code); B.wait_for_timeout(600)
        all_panes(A, False); all_panes(B, False)
        for _ in range(40):
            A.wait_for_timeout(1000)
            if A.evaluate('()=>(__app.sq.swarm()?.online()||[]).length') and B.evaluate('()=>(__app.sq.swarm()?.online()||[]).length'): break
        check('the two pilots are connected (%ds)' % (_ + 1), A.evaluate('()=>__app.sq.swarm().online().length') == 1)
        brief(A); brief(B)
        check('the commander may open the room', 'Open the room' in A.inner_text('.brjoin') and 'Commander' in A.inner_text('.brjoin').title() or 'commander' in A.inner_text('.brjoin'))
        check('a wingman can only join it (a leader opens it)', 'Join the room' in B.inner_text('.brjoin') and 'leader' in B.inner_text('.brjoin'))
        A.click('.brjoin [data-a=join]'); A.wait_for_timeout(1800)
        check('the commander is the briefer, with the tools and the room buttons', R_(A, 'r.isBriefer()') and A.is_visible('.brw [data-a=close]') and A.is_visible('.brtools [data-t=clear]') and A.locator('.brw .brlist .bdg.brf').count() == 1)
        B.wait_for_timeout(2500)
        check('the other pilot sees who is briefing before he joins', 'Evil is briefing' in B.inner_text('.brjoin'))
        B.click('.brjoin [data-a=join]'); B.wait_for_timeout(1500)
        check('both are in the room, on both sides', R_(A, 'r.members.size') == 2 and R_(B, 'r.members.size') == 2 and 'Wing2' in A.inner_text('.brw .brlist') and 'Evil' in B.inner_text('.brw .brlist'))
        check('the wingman follows the view of the briefer and has no pen (drawing tools off, ruler for himself)', 'Following' in B.inner_text('.brhdr') and B.locator('.brtools [data-t=pen].dis').count() == 1 and B.locator('.brtools [data-t=ruler].solo').count() == 1 and B.locator('.brtools [data-t=clear].hide').count() == 1)
        # drawing: a pen stroke, a hostile radar track, a ruler
        A.click('.brtools [data-t=pen]'); drag(A, (300, 300), (500, 360), 12)
        A.click('.brtools [data-t=sym]'); A.wait_for_timeout(200)
        check('the symbol palette: the four frames, the units of the map and the control measures', A.locator('.brpal [data-s]').count() == 4 and A.locator('.brpal [data-k]').count() == 24)
        A.click('.brpal [data-s=hostile]'); A.click('.brpal [data-k=trk]')
        drag(A, (600, 200), (660, 240), 5); A.wait_for_timeout(200); A.fill('.bred input[data-f=cs]', 'Bandit'); A.keyboard.press('Enter')
        A.click('.brtools [data-t=ruler]'); drag(A, (200, 500), (450, 420))
        B.wait_for_timeout(800)
        kinds = B.evaluate("()=>__app.sq.briefing().objects().map(o=>o.k).sort().join(',')")
        check('the drawings reach the other pilot (pen, track, ruler): ' + kinds, kinds == 'pen,ruler,trk')
        check('the board has its own canvas in its own pane (not the canvas of the map, whose dashes made the lines dotted)', A.evaluate("()=>{const r=__app.sq.briefing()._r.M.board._renderer;return r._container.parentNode.classList.contains('leaflet-brfP-pane')&&r!==__app.mapV.leaflet._renderer}"))
        check('the canvases of the map have no border in the briefing (a border shrank the picture: blurred letters)', A.evaluate("()=>[...document.querySelectorAll('.brw .brmap canvas')].every(c=>getComputedStyle(c).borderTopWidth=='0px')"))
        check('no bearing marked as true (BMS plans in true)', '°T' not in A.evaluate("()=>document.querySelector('.brw').innerText") and A.locator('.brw .brleg').count() == 0)
        check('the track keeps its name and heading', B.evaluate("()=>{const t=__app.sq.briefing().objects().find(o=>o.k=='trk');return t.cs=='Bandit'&&t.side=='hostile'&&t.hdg>90&&t.hdg<180}"))
        # the cursor of the briefer moves on the screen of the other
        m = mapbox(A); A.mouse.move(m['x'] + 400, m['y'] + 300); A.mouse.move(m['x'] + 420, m['y'] + 310, steps=4); B.wait_for_timeout(600)
        check('the cursor of the briefer is seen, with his name', B.locator('.brcur b', has_text='Evil').count() == 1 and B.locator('.brcur').first.evaluate('e=>e.style.opacity') == '1')
        B.click('.brtools [data-t=curs]'); B.wait_for_timeout(200)
        check('Cursors: pens keeps the cursor of who can draw', B.locator('.brcur').first.evaluate('e=>e.style.visibility') == 'visible')
        B.click('.brtools [data-t=curs]')
        # a pilot without the pen cannot draw (his messages are refused too)
        B.evaluate("()=>{const r=__app.sq.briefing()._r;r.send({t:'add',o:{id:'x1',k:'line',a:[37,127],b:[37.5,127.5],col:'#ffffff',w:3}})}"); A.wait_for_timeout(600)
        check('a drawing sent by a pilot without the pen is not kept', A.evaluate("()=>!__app.sq.briefing().objects().some(o=>o.id=='x1')"))
        # the pen
        A.locator('.brw .brlist .pil', has_text='Wing2').hover(); A.click('.brw .brlist [data-a=give]'); B.wait_for_timeout(900)
        check('the briefer gives the pen: the wingman can draw', R_(B, 'r.can()') and B.locator('.brtools [data-t=pen].dis').count() == 0 and B.locator('.brw .brlist .bdg.pen').count() == 1)
        B.click('.brtools [data-t=text]'); m = mapbox(B); B.mouse.click(m['x'] + 300, m['y'] + 550); B.wait_for_timeout(200); B.keyboard.type('Low ingress'); B.wait_for_timeout(300)
        check('the text being typed is seen live by the briefer', A.evaluate("()=>[...__app.sq.briefing()._r.drafts.values()].some(o=>o.k=='text'&&o.txt=='Low ingress')"))
        B.click('.brtools [data-t=pan]'); A.wait_for_timeout(600)
        check('the text is kept on the board of both', A.evaluate("()=>__app.sq.briefing().objects().some(o=>o.k=='text'&&o.txt=='Low ingress')") and B.evaluate("()=>__app.sq.briefing().objects().some(o=>o.k=='text')"))
        B.click('.brw [data-a=back]'); A.wait_for_timeout(900)
        check('the pen goes back to the briefer', not R_(B, 'r.can()') and R_(A, 'r.room.pens.length') == 0)
        # the view
        A.click('.brtools [data-t=pan]'); A.evaluate("()=>__app.mapV.leaflet.setView([38.6,127.4],9,{animate:false})"); B.wait_for_timeout(1200)
        check('the wingman sees the view of the briefer', abs(B.evaluate('()=>__app.mapV.leaflet.getCenter().lat') - 38.6) < 0.05 and B.evaluate('()=>__app.mapV.leaflet.getZoom()') == 9)
        m = mapbox(B); B.mouse.move(m['x'] + 300, m['y'] + 300); B.mouse.down(); B.mouse.move(m['x'] + 200, m['y'] + 250, steps=5); B.mouse.up(); B.wait_for_timeout(300)
        check('moving the map gives him a free view', 'Free view' in B.inner_text('.brhdr') and 'Back to' in B.inner_text('.brhdr'))
        # the eraser and undo
        A.click('.brtools [data-t=erase]'); n0 = len(A.evaluate("()=>__app.sq.briefing().objects()"))
        A.click('.brtools [data-t=undo]'); A.wait_for_timeout(500)
        check('Undo removes the last drawing of the briefer (the ruler) for both', A.evaluate("()=>!__app.sq.briefing().objects().some(o=>o.k=='ruler')") and B.evaluate("()=>!__app.sq.briefing().objects().some(o=>o.k=='ruler')"))
        # the kneeboard card: the frame of the map, in the briefing
        A.click('.brw [data-a=card]'); A.wait_for_timeout(400)
        check('Save a kneeboard card opens the frame of the map over the briefing map', A.is_visible('.brw #mpfr #mpcap') and A.locator('.brw .brmapw.shoting, .brw .brmap.shoting').count() >= 1)
        A.click('#mpcap')
        for _ in range(20):
            A.wait_for_timeout(500)
            if A.locator('.brw #mpfr #mpcap').count() == 0 or not A.is_visible('.brw #mpfr #mpcap'): break
        check('the card goes to the kneeboard: the frame closes and the briefing map says so', (A.locator('.brw #mpfr').count() == 0 or not A.is_visible('.brw #mpfr #mpcap')) and A.locator('.brw .brtoast', has_text='kneeboard').count() == 1)
        # clear (with its question) and closing
        A.click('.brtools [data-t=clear]'); A.wait_for_timeout(200)
        check('Clear the board asks first', A.is_visible('.brmodal') and 'Clear the board for everyone' in A.inner_text('.brmodal'))
        A.click('.brmodal [data-a=ok]'); B.wait_for_timeout(700)
        check('the board is empty for both', A.evaluate("()=>__app.sq.briefing().objects().length") == 0 and B.evaluate("()=>__app.sq.briefing().objects().length") == 0)
        B.click('.brw [data-a=leave]'); B.wait_for_timeout(200)
        check('Leave the room asks first', 'Leave the room?' in B.inner_text('.brmodal')); B.click('.brmodal [data-a=no]')
        A.click('.brw [data-a=close]'); A.wait_for_timeout(200)
        check('Close the room asks first and says how many pilots leave', 'All the 2 pilots' in A.inner_text('.brmodal'))
        A.click('.brmodal [data-a=ok]'); B.wait_for_timeout(1000)
        check('the room is closed for the other pilot, who is told by whom', not R_(B, '!!r.me') and 'Evil closed the room' in B.inner_text('.brjoin'))
        B.click('[data-t=mp]'); B.wait_for_timeout(400)
        check('leaving the page gives the map back to the Map page', B.locator('#mpbody #mpmap').count() == 1)
        check('no page errors %s %s' % (ea[:3], eb[:3]), not ea and not eb)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
