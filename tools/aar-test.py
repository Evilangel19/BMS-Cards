"""Performance > AAR (1.4.0-beta.23) in the browser on a made-up flight and tanker: the tab and its Add card, the tanker, EN ROUTE / ANCHOR (HEAD-ON not yet),
the fill, the gap, the checks, the tables, OA1 / OA2 in the DTC, the Smart AAR and classic cards, Display > AAR on the Map page. No BMS file.
Usage: python3 tools/aar-test.py [folder for the pictures]"""
import os, subprocess, sys, time, json, base64
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8996
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a KC-135 on a track 50 NM north from 09:00 to 11:00; the flight pushes from STPT 2 at 09:00, its Refuel steerpoint 3 at 09:18 on the track
SETUP = r"""o => {
  const K = 1.852, H = 3600000, mk = (x, y, z, arr, dep, act) => ({ x, y, z, arr, dep, act });
  const tw = [mk(600, 300, 0, 8*H, 8*H, 1), mk(600, 400, 2200, 8.5*H, 0, 0), mk(600, 500, 2200, 9*H, 0, 24), mk(600, 500 + 50*K, 2200, 9.12*H, 11*H, 24), mk(600, 300, 0, 11.7*H, 0, 7)];
  const me = [mk(480, 300, 0, 8.6*H, 8.6*H, 1), mk(560, 420, 2000, 9.0*H, 0, 0), mk(600, 540, 2200, 9.3*H, 9.5*H, 4), mk(720, 700, 1500, 9.9*H, 0, 15), mk(480, 300, 0, 10.6*H, 0, 7)];
  const X = { ok: true, me: { key: '77', name: 'Goblin 3', n: 2, ac: o.ac || 'F-16CM-50', pkgNo: 1225, tag: 'GOBLIN 3 · PKG 1225' }, wps: me, k: 2,
    tankers: [{ name: 'Canteen1', type: o.tk || 'KC-135', tcn: '28Y', uhf: '348.625', win: '09:00 - 11:00', wps: tw }, { name: 'Camel1', type: 'KC-130H', tcn: '41Y', uhf: '251.300', win: '09:00 - 11:00', wps: tw }],
    sop: [{ id: 'rv', o: 'enr', txt: 'EN ROUTE' }, { id: 'obs', o: 'right', txt: 'OBS RIGHT' }, { id: 'breakaway', o: 'std', txt: 'BREAKAWAY: DOWN AFT' }] };
  const min = [9800, 7400, 1000, 4600, 1500], burn = [0, 2400, 1400, 3100, 3100];
  const plan = { rows: me.map((p, i) => ({ i, act: p.act, nm: i ? Math.hypot(p.x - me[i-1].x, p.y - me[i-1].y) / K : 0, burn: burn[i], min: min[i], minExact: min[i] })) };
  __app.aarPage._test({ ctx: () => X, fuel: () => ({ plan, need: k => 5300, loaded: 12000, joker: 1000 }) });
}"""
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['lineSTPT_%d=0.000000, 0.000000, 0.000000' % i for i in range(24)] + ['[NAV OFFSETS]'] + ['OA%d-%d=0,0,0' % (a, n) for n in range(1, 25) for a in (1, 2)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1250}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.evaluate(SETUP, {})
        plan = lambda: json.loads(pg.evaluate("()=>JSON.stringify(__app.aarPage.plan())"))
        pg.click('[data-t=pf]'); pg.wait_for_timeout(400)
        check('the AAR tab after Fuel plan; no Add card on the other tabs', pg.locator('#pf .wtabs [data-mode]').all_inner_texts()[-2:] == ['Fuel plan', 'AAR'] and (pg.locator('#pf [data-aarcard]').count() == 0 or pg.evaluate("()=>__app.pfPage.state().mode") == 'aar'))
        pg.click('#pf [data-mode=aar]'); pg.wait_for_timeout(1500)
        check('Add card in the bar of the tabs, on the right', pg.locator('#pf .wtabs [data-aarcard]').count() == 1)
        L = pg.inner_text('#aarl')
        check('the left card: BOOM, the two tankers, the type and the A-A TACAN', 'AAR · BOOM' in L and 'TANKER 1 · Canteen1' in L and 'TANKER 2 · Camel1' in L and 'KC-135 · boom' in L and '28Y · distance only' in L)
        check('HEAD-ON is in the layout, not usable yet', pg.locator('[data-arset=mode][data-v=head]').is_disabled())
        P = plan()
        check('EN ROUTE from the SOP: the join at 09:18, the ARIP before it, no red check', P['S']['mode'] == 'enr' and abs(P['R']['arct'] - 9.3 * 3600000) < 1 and P['R']['tip'] < P['R']['arct'] and not any(w[1] for w in P['warn']))
        check('FULL: onload 12,000 - the fuel at the join', P['FU']['onload'] == round(12000 - P['FU']['fArct']))
        check('the tiles and the tables: ARCT 09:18, Times, Procedure BOOM with the right wing of the SOP', '09:18' in pg.inner_text('#aartl') and 'Push · STPT 2' in pg.inner_text('#aartb') and 'Procedure · BOOM'.upper() in pg.inner_text('#aartb').upper() and 'Right wing of the tanker' in pg.inner_text('#aartb') and 'AR door OPEN' in pg.inner_text('#aartb'))
        check('the map: the lent map with the track, the ARIP and the join', pg.locator('#aarmap .leaflet-container, #aarmap.leaflet-container').count() >= 1 and 'ARIP · OA2' in pg.inner_text('#aarmap') and 'ARCT' in pg.inner_text('#aarmap'))
        check('the Smart card preview', pg.locator('#pf .aarpv').is_visible())
        # the other tanker: a KC-130H has no boom
        pg.click('[data-arset=tk][data-v="1"]'); pg.wait_for_timeout(500)
        check('KC-130H for a boom receiver: red check', 'has no boom' in pg.inner_text('#aartb') and any(w[1] and 'no boom' in w[0] for w in plan()['warn']))
        pg.click('[data-arset=tk][data-v="0"]'); pg.wait_for_timeout(300)
        # ANCHOR, JOKER, the gap
        pg.click('[data-arset=mode][data-v=anchor]'); pg.click('[data-arset=fill][data-v=joker]'); pg.wait_for_timeout(500)
        P = plan()
        check('ANCHOR: the ARIP 6 NM behind the anchor, a pass of the tanker', P['S']['mode'] == 'anchor' and 'ANCHOR · OA1' in pg.inner_text('#aarmap'))
        check('JOKER: after the onload need + joker or more', P['FU']['after'] >= min(12000, 5300 + 1000) - 1)
        pg.evaluate("()=>{const e=document.querySelector('[data-arsl=gap]');e.value=18;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('a gap of 18 NM at the anchor: the join falls in the turn (red)', plan()['S']['gap'] == 18 and any(w[1] and 'turn' in w[0] for w in plan()['warn']))
        pg.evaluate("()=>{const e=document.querySelector('[data-arsl=gap]');e.value=6;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        pg.click('[data-arset=fill][data-v=amount]'); pg.wait_for_timeout(300)
        check('AMOUNT: its slider', pg.locator('[data-arsl=amount]').count() == 1)
        pg.click('[data-arset=fill][data-v=full]'); pg.wait_for_timeout(300)
        # OA1 / OA2 on STPT 3
        msgs = []
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.click('[data-aroa]'); pg.wait_for_timeout(600)
        v1 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA1-3')||{}).v")
        v2 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA2-3')||{}).v")
        check('Write OA1 / OA2: asked, then both on STPT 3 at 21,000 ft (%s, %s)' % (v1, v2), msgs and 'STPT 3' in msgs[0] and v1 and v1.endswith(',21000') and v2 and v2.endswith(',21000') and v1 != v2)
        # the cards
        sm = pg.evaluate("()=>{const d=__app.aarPage.smart();return d&&{key:d.key.map(k=>k[0]),sop:d.sop}}")
        check('Smart AAR: the key box and the SOP Tanker lines (RV first)', sm and sm['key'] == ['TANKER', 'TACAN', 'UHF', 'ALT', 'ARCT', 'TYPE', 'ONLOAD', 'BINGO'] and sm['sop'][0] == 'RV EN ROUTE')
        for k in ('smart', 'map'):
            u = pg.evaluate("async k=>{const c=await __app.aarPage.cardCanvas(k);return c?c.width+'x'+c.height+'|'+c.toDataURL():''}", k)
            check('the %s card is drawn (1600 x 2400)' % k, u.startswith('1600x2400|data:image/png'))
            if OUT and u: open(os.path.join(OUT, 'aar-%s.png' % k), 'wb').write(base64.b64decode(u.split(',', 1)[1]))
        if OUT: pg.screenshot(path=os.path.join(OUT, 'aar-page.png'))
        # the probe: drogue
        pg.evaluate(SETUP, {'ac': 'F/A-18C'}); pg.click('[data-arset=mode][data-v=enr]'); pg.wait_for_timeout(500)
        check('a probe receiver: PROBE, the probe out, no AR door', 'AAR · PROBE' in pg.inner_text('#aarl') and 'probe OUT' in pg.inner_text('#aartb') and 'AR door' not in pg.inner_text('#aartb'))
        # another tab gives the map back; Display > AAR on the Map page
        pg.click('#pf [data-mode=plan]'); pg.wait_for_timeout(300)
        check('Fuel plan: no Add card, no AAR map', pg.locator('#pf [data-aarcard]').count() == 0 and pg.locator('#aarmap').count() == 0)
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{const e=document.querySelector('[data-fly=mpdsp]');e&&e.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));e&&e.click()}"); pg.wait_for_timeout(400)
        dsp = pg.evaluate("()=>{const e=document.getElementById('mpdsp');return e?e.innerText:''}")
        check('Map > Display: the sub-sections A-A, A-G, AAR and the Tanker row', all(s in dsp for s in ('A-A', 'A-G', 'AAR', 'Tanker and rendezvous')))
        check('Display > AAR draws (overlay)', pg.evaluate("()=>{const L=window.L,g=L.layerGroup();return __app.aarPage.overlay({L,map:{createPane:()=>({style:{}}),_arR:L.canvas()},WL:g})&&g.getLayers().length>5}"))
        check('no error on the page: %s' % errs[:3], not errs)
    print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
finally:
    srv.kill()
