"""A-A > DCA (1.3.0-beta.72, renamed in beta.75) in the browser on a made-up CAP flight: the A-A tabs (DCA, OCA, Timeline), the sliders and the checks,
the A-A block written to the ROE, the DTC lines, the classic, Smart DCA and Smart mission cards. No BMS file.
Usage: python3 tools/dca-test.py [folder for the pictures]"""
import os, subprocess, sys, time, base64, json
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8953
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a BARCAP of two F-16C, its CAP leg east-west (20 NM), enemy airbases to the north, another CAP 50 NM to the east, the bullseye to the south-west
SETUP = r"""() => {
  const K = 1.852, T0 = 9 * 3600000, cap = [{ x: 600, y: 500, n: 4, arr: T0, dep: T0 + 300000 }, { x: 600 + 20 * K, y: 500, n: 5, arr: T0 + 300000, dep: T0 + 40 * 60000 }];
  window.__FA = { roe: null };
  const X = { ok: true, me: { key: '77', name: 'Falcon 1', mission: 'BARCAP', kind: 'BARCAP', n: 2, ac: 'F-16C', pkgNo: 4012, team: 2, tag: 'FALCON 1 · PKG 4012' },
    cap, enemy: [{ x: 610, y: 700, name: 'NORTH AB' }, { x: 660, y: 720, name: 'EAST AB' }], bull: { x: 560, y: 470 },
    mates: [{ name: 'Viper 2', anchor: { x: 610 + 50 * K, y: 500 } }], targets: [], joker: '5 200', bingo: '4 200', aa: '4× AIM-120C · 2× AIM-9X' };
  __app.faorPage._test({ ctx: () => X, msa: () => Promise.resolve(4300), timeline: () => [{ cls: 'Su-27', mar: 15, dr: 22, dor: 31 }, { cls: 'MiG-29A', mar: 12, dr: 18, dor: 25 }],
    roeGet: () => ({ roe: { ws: 'tight', id: ['awacs', 'nctr'], commit: 'n40', abort: ['bingo', 'winch'], extra: [], restr: [] } }), roeSet: fa => (window.__FA.roe = fa) });
}"""
FT = 3280.84
pt = lambda x, y: '%.6f, %.6f' % (y * FT, x * FT)
L1 = [(460, 400), (480, 400)]
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['lineSTPT_%d=%s, 0.000000' % (i, pt(*L1[i]) if i < len(L1) else '0.000000, 0.000000') for i in range(24)] + ['[F15_SIT_LINES]'] +
                  ['SITLINE_8_%d=0.000000, 0.000000' % i for i in range(30)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        pg.evaluate("()=>localStorage.removeItem('aasub')")
        pg.evaluate(SETUP)
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(1500)
        check('the A-A tab: DCA, OCA, Timeline', pg.locator('#bvrtabs [data-bsub]').all_inner_texts() == ['DCA', 'OCA', 'Timeline'] and pg.locator('button.tab[data-t=ms]').inner_text().strip() == 'A-A' and pg.locator('button.tab[data-t=wp]').inner_text().strip() == 'A-G')
        check('DCA is shown first, its Add card button visible', pg.locator('#fapage').is_visible() and pg.locator('#bvrtl').is_hidden() and pg.locator('#bvrtabs [data-bcard]').is_visible())
        check('the page: callsign and kind, the sliders', 'Falcon 1 · BARCAP' in pg.locator('#fafl h3').text_content() and pg.locator('#fapage input[type=range]').count() == 9)
        g = pg.evaluate("()=>{const G=__app.faorPage.geo();return {brg:G.brg,leg:G.leg}}")
        check('the threat axis square to the CAP leg, toward the enemy: %.0f' % g['brg'], abs(g['brg']) < 1 or abs(g['brg'] - 360) < 1)
        check('the A-A block written to the ROE of the flight %s' % pg.evaluate("()=>JSON.stringify(__FA.roe)"), pg.evaluate("()=>!!__FA.roe && __FA.roe.wpn=='tight' && __FA.roe.commit==40 && __FA.roe.hw=='Viper 2'"))
        w = pg.locator('#fawn').inner_text()
        check('the hardwall with Viper 2 in red: %s' % w.replace('\n', ' | '), 'HARDWALL with Viper 2' in w and pg.locator('#fawn .wbad').count() >= 1)
        # a slider moved and released: the ROE follows
        pg.evaluate("()=>{const e=document.querySelector('#fapage [data-fa=commit]');e.value=25;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        check('COMMIT 25: the ROE gets it and the check COMMIT < DOR 31', pg.evaluate("()=>__FA.roe.commit") == 25 and 'COMMIT 25 NM < DOR 31' in pg.locator('#fawn').inner_text())
        pg.click('#fapage [data-faset=wpn][data-v=free]'); pg.wait_for_timeout(200)
        check('WPN FREE: on the ROE', pg.evaluate("()=>__FA.roe.wpn") == 'free')
        pg.click('#fapage [data-fareset]'); pg.wait_for_timeout(400)
        check('Reset profile: COMMIT 40, TIGHT again', pg.evaluate("()=>__FA.roe.commit") == 40 and pg.evaluate("()=>__FA.roe.wpn") == 'tight')
        sm = pg.evaluate("()=>{const D=__app.faorPage.smart();return {t:D.title,k:D.key.map(k=>k[0]),b:D.blocks.map(b=>b[0])}}")
        check('the Smart DCA data %s' % sm, sm['t'] == 'A-A · DCA · BARCAP' and sm['k'][:3] == ['AXIS', 'FEZ', 'ALT'] and sm['b'] == ['FEZ', 'ID / BUGOUT', 'LINES', 'CALLS'])
        r = pg.evaluate("""async () => {
          const K = await import('/app/js/core/cardink.js'), a = await __app.faorPage.cardCanvas('smart'), c = await __app.faorPage.cardCanvas('combo'), d = K.otherLook(() => a);
          const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
          const reds = cv => { const q = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < q.length; i += 16) if (q[i] > 160 && q[i] - q[i + 1] > 80 && q[i] - q[i + 2] > 80) n++; return n; };
          const m = await __app.faorPage.cardCanvas('map');
          return { size: [a.width, a.height], bg: px(a, 800, 2390), reds: reds(a), png: [a.toDataURL(), c.toDataURL(), m.toDataURL()], msize: [m.width, m.height], mdark: px(m, 800, 1200), mid: px(m, 60, 2380) };
        }""")
        check('the Smart DCA card: 1600 x 2400, white page', r['size'] == [1600, 2400] and min(r['bg']) > 240)
        check('the limits in red on it (STOP, HARDWALL, the threat) %d' % r['reds'], r['reds'] > 200)
        check('the Smart mission card drawn', len(r['png'][1]) > 20000)
        check('the classic card with the map: 1600 x 2400, the picture of the map in its middle %s' % r['mdark'], r['msize'] == [1600, 2400] and max(r['mdark']) < 120 and min(r['mid']) > 200)
        if OUT:
            pg.screenshot(path=os.path.join(OUT, 'faor_page.png'))
            for i, n in enumerate(('smart', 'combo', 'map')):
                open(os.path.join(OUT, 'faor_%s.png' % n), 'wb').write(base64.b64decode(r['png'][i].split(',')[1]))
        # Add card: the window offers the classic card with the map first
        pg.click('#bvrtabs [data-bcard]'); pg.wait_for_timeout(4000)
        check('Add card: With the map (chosen), Smart DCA, Smart mission', pg.locator('dialog.tgdlg .tgcard span').all_inner_texts() == ['With the map', 'Smart DCA', 'Smart mission'] and pg.locator('dialog.tgdlg .tgcard.on').count() >= 1)
        pg.click('dialog.tgdlg [data-a=no]'); pg.wait_for_timeout(300)
        # the Timeline tab: the BVR timeline as before, remembered
        pg.click('#bvrtabs [data-bsub=tl]'); pg.wait_for_timeout(1200)
        check('Timeline: the timeline page, the FAOR hidden, no Add card', pg.locator('#bvrtl #mstl').count() == 1 and pg.locator('#fapage').is_hidden() and pg.locator('#bvrtabs [data-bcard]').is_hidden())
        check('the tab chosen is kept', pg.evaluate("()=>localStorage.getItem('aasub')") == 'tl')
        pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(600)
        check('back to DCA', pg.locator('#fapage').is_visible())
        # DTC lines: an F-16 (LINE1 used): the FEZ, COMMIT / STOP and the HARDWALL in LINE2-4; again: the same lines replaced
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(400)
        pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(300)
        used = lambda pre, a, n: pg.evaluate("([p,a,n])=>{let k=0;for(let i=a;i<a+n;i++){const l=__app.lines.find(l=>l.k==p+i);if(l&&!/^0\\.000000, 0\\.000000/.test(l.v))k++}return k}", [pre, a, n])
        pg.click('#fapage [data-fadtc]'); pg.wait_for_timeout(1500)
        cnt = [used('lineSTPT_', 6 * i, 6) for i in range(4)]
        check('F-16: LINE1 kept, LINE2 the FEZ (5), LINE3 COMMIT / STOP (4), LINE4 the HARDWALL (2) %s' % cnt, cnt == [2, 5, 4, 2])
        pg.click('#fapage [data-fadtc]'); pg.wait_for_timeout(1500)
        cnt2 = [used('lineSTPT_', 6 * i, 6) for i in range(4)]
        check('written again: the same lines, nothing more %s' % cnt2, cnt2 == cnt)
        pg.evaluate("t=>{window.__sitOn=true;__app.parse(t)}", INI); pg.wait_for_timeout(400)
        pg.click('#fapage [data-fadtc]'); pg.wait_for_timeout(1500)
        n8 = used('SITLINE_8_', 0, 30)
        check('F-15: SIT line 8 (FEZ) holds the three parts, 5 + 4 + 2 points %d' % n8, n8 == 11 and used('lineSTPT_', 6, 18) == 0)
        pg.evaluate("()=>{window.__sitOn=false}")
        # the Map page: Display > FAOR, off by default
        check('Map, Display > DCA and OCA: off by default', pg.evaluate("()=>!__app.mapV.state().on.fa && !__app.mapV.state().on.oc"))
        check('no page errors %s' % errs[:3], not errs)
        b.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
