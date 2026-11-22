"""A-A > DCA for a QRA flight (1.3.0-beta.79) in the browser, on made-up flights: the DCA tab shows the QRA page for a QRA flight; ALERT (the
scramble line from the threat axis, the radar check), INTERCEPT (the vector, the stern conversion with VID), the A-A block written to the ROE, the
DTC lines, the Smart QRA, Smart mission and classic cards. No BMS file. Usage: python3 tools/qra-test.py [folder for the pictures]"""
import os, subprocess, sys, time, base64
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8973
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a QRA of two F-16C on an airbase at (500, 500); the enemy to the north; a friendly radar 20 NM south of the base that sees 60 NM (the scramble
# line of 85 NM is beyond it); launched: an Intercept steerpoint 50 NM north, the target 90 NM north flying south at 480 kt, spotted
SETUP = r"""(st) => {
  const K = 1.852, T0 = 10 * 3600000;
  window.__QR = { roe: null, st };
  const me = { key: '91', name: 'Hawk 1', mission: 'QRA', kind: 'QRA', n: 2, ac: 'F-16C', pkgNo: 7001, team: 2, tag: 'HAWK 1 · PKG 7001' };
  const X = () => ({ ok: true, me, base: { x: 500, y: 500, name: 'Home AB' }, t0: T0, enemy: [{ x: 505, y: 700, name: 'NORTH AB' }],
    abs: [{ x: 505, y: 700, name: 'NORTH AB' }], radars: [{ x: 500, y: 500 - 20 * K, rng: 80 * K }], awacs: false, bull: { x: 480, y: 470 },
    joker: '4 800', bingo: '3 600', aa: '4× AIM-120C · 2× AIM-9X',
    ic: window.__QR.st == 'icpt' ? { x: 500, y: 500 + 50 * K, n: 3, arr: T0 + 8 * 60000 } : null,
    tgt: window.__QR.st == 'icpt' ? { name: 'Bandit', ac: '2× MiG-29A', gone: false, st: { x: 500, y: 500 + 90 * K, t: T0, hdg: 180, gs: 480, alt: 22000 } } : null });
  __app.qraPage._test({ ctx: X, roeGet: () => ({ roe: { ws: 'tight', id: window.__QR.vid ? ['vid', 'awacs'] : ['awacs'], commit: 'n40', abort: ['bingo'], extra: [], restr: [] } }),
    roeSet: fa => (window.__QR.roe = fa) });
}"""
FT = 3280.84
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['lineSTPT_%d=0.000000, 0.000000, 0.000000' % i for i in range(24)] + ['[F15_SIT_LINES]'] +
                  ['SITLINE_8_%d=0.000000, 0.000000' % i for i in range(30)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        pg.evaluate("()=>localStorage.removeItem('aasub')")
        pg.evaluate(SETUP, 'alert')
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(1500)
        check('DCA tab, a QRA flight: the QRA page, not the FAOR', pg.locator('#qrpage').is_visible() and pg.locator('#fapage').is_hidden())
        check('ALERT: the title and the state', 'QRA · ALERT' in pg.inner_text('#qrpage .wpc h3') and 'ALERT' in pg.inner_text('#qrfl'))
        P = pg.evaluate("()=>{const P=__app.qraPage.plan();return {mode:P.mode,rs:P.A.rs,ri:P.A.ri,cov:P.cover,brg:Math.round(P.A.brg)}}")
        check('ALERT: the axis north, the scramble line 85 NM, the radar 60 NM on the axis %s' % P, P['mode'] == 'ALERT' and P['rs'] == 85 and P['cov'] == 60 and (P['brg'] <= 2 or P['brg'] >= 358))
        w = pg.inner_text('#qrwn')
        check('ALERT: the scramble line beyond the radar in red: %s' % w.replace('\n', ' | '), 'beyond the radar coverage' in w and pg.locator('#qrwn .wbad').count() >= 1)
        check('the A-A block written to the ROE: QRA ALERT, 85 / 40 %s' % pg.evaluate("()=>JSON.stringify(__QR.roe)"), pg.evaluate("()=>!!__QR.roe && __QR.roe.kind=='QRA' && __QR.roe.qra=='ALERT' && __QR.roe.rs==85 && __QR.roe.ri==40"))
        pg.evaluate("()=>{const e=document.querySelector('#qrpage [data-qr=ri]');e.value=20;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        rs = pg.evaluate("()=>__QR.roe.rs")
        check('Intercept at 20 NM: the scramble line comes in (%d), the ROE follows' % rs, rs < 85 and pg.evaluate("()=>__QR.roe.ri") == 20)
        check('no displacement slider without VID', pg.locator('#qrpage [data-qr=disp]').count() == 0)
        pg.click('#qrpage [data-qrreset]'); pg.wait_for_timeout(300)
        check('Reset: 40 NM again', pg.evaluate("()=>__QR.roe.ri") == 40)
        # DTC lines: SCRAMBLE and INTERCEPT in LINE1-2
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(400)
        pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(400)
        used = lambda pre, a, n: pg.evaluate("([p,a,n])=>{let k=0;for(let i=a;i<a+n;i++){const l=__app.lines.find(l=>l.k==p+i);if(l&&!/^0\\.000000, 0\\.000000/.test(l.v))k++}return k}", [pre, a, n])
        pg.click('#qrpage [data-qrdtc]'); pg.wait_for_timeout(1500)
        cnt = [used('lineSTPT_', 6 * i, 6) for i in range(4)]
        check('DTC: LINE1 the scramble line, LINE2 the intercept line %s' % cnt, cnt == [2, 2, 0, 0])
        # launched, VID in the ROE
        pg.evaluate("()=>{__QR.st='icpt';__QR.vid=true}")
        pg.click('#bvrtabs [data-bsub=tl]'); pg.wait_for_timeout(500); pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(1200)
        check('INTERCEPT: the title, the displacement slider (VID)', 'QRA · INTERCEPT' in pg.inner_text('#qrpage .wpc h3') and pg.locator('#qrpage [data-qr=disp]').count() == 1)
        P = pg.evaluate("()=>{const P=__app.qraPage.plan(),I=P.I;return {mode:P.mode,vec:Math.round(I.vec),d:I.d,asp:I.aspect,conv:!!I.conv}}")
        check('INTERCEPT: head-on, vector north, HOT, a stern conversion %s' % P, P['mode'] == 'INTERCEPT' and (P['vec'] <= 1 or P['vec'] >= 359) and P['asp'] == 'HOT' and P['conv'] and 20 < P['d'] < 60)
        check('the A-A block: INTERCEPT, no tactic in it (the conversion is on the cards) %s' % pg.evaluate("()=>JSON.stringify(__QR.roe)"), pg.evaluate("()=>__QR.roe.qra=='INTERCEPT' && __QR.roe.disp==null"))
        check('the target in the data', '2× MiG-29A · spotted' in pg.inner_text('#qrdt'))
        sm = pg.evaluate("()=>{const D=__app.qraPage.smart();return {t:D.title,k:D.key.map(k=>k[0])}}")
        check('Smart QRA data %s' % sm, sm['t'] == 'A-A · DCA · QRA · INTERCEPT' and sm['k'][:3] == ['VECTOR', 'ANGELS', 'RANGE'])
        r = pg.evaluate("""async () => {
          const a = await __app.qraPage.cardCanvas('smart'), c = await __app.qraPage.cardCanvas('combo'), m = await __app.qraPage.cardCanvas('map');
          const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
          return { size: [a.width, a.height], bg: px(a, 800, 2390), png: [a.toDataURL(), c.toDataURL(), m.toDataURL()], msize: [m.width, m.height] };
        }""")
        check('the Smart QRA card: 1600 x 2400, white page', r['size'] == [1600, 2400] and min(r['bg']) > 240)
        check('the Smart mission and the classic card drawn', len(r['png'][1]) > 20000 and r['msize'] == [1600, 2400])
        if OUT:
            pg.screenshot(path=os.path.join(OUT, 'qra_page.png'))
            for i, n in enumerate(('smart', 'combo', 'map')):
                open(os.path.join(OUT, 'qra_%s.png' % n), 'wb').write(base64.b64decode(r['png'][i].split(',')[1]))
        msgs = []
        pg.once('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.click('#qrpage [data-qrdtc]'); pg.wait_for_timeout(1500)
        cnt = [used('lineSTPT_', 6 * i, 6) for i in range(4)]
        check('DTC, launched: after asking, the vector and the target track in place of the alert lines %s %s' % (cnt, msgs), cnt == [2, 2, 0, 0] and len(msgs) == 1)
        pg.click('#bvrtabs [data-bcard]'); pg.wait_for_timeout(4000)
        check('Add card: With the map, Smart QRA, Smart mission', pg.locator('dialog.tgdlg .tgcard span').all_inner_texts() == ['With the map', 'Smart QRA', 'Smart mission'])
        pg.click('dialog.tgdlg [data-a=no]'); pg.wait_for_timeout(300)
        # not a QRA flight any more: back to the FAOR page
        pg.evaluate("()=>__app.qraPage._test({ctx:()=>({ok:false,why:'x'})})")
        pg.click('#bvrtabs [data-bsub=tl]'); pg.wait_for_timeout(400); pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(800)
        check('another flight: the FAOR page again', pg.locator('#fapage').is_visible() and pg.locator('#qrpage').is_hidden())
        check('no page errors %s' % errs[:3], not errs)
        b.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
