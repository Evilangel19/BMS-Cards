"""A-G > TASMO (1.4.0-beta.26) in the browser on a made-up flight and ships: the tab and its Add card, the ship (spotted or not: the area), the weapon (an
anti-ship missile and the Harpoon options; a Maverick sends to Pop-up), the launch altitude and distance, the shot, the checks, the profile, OA1 / OA2 and
STPT 90 in the DTC, the Smart and classic cards, Display > TASMO on the Map page. No BMS file.
Usage: python3 tools/tasmo-test.py [folder for the pictures]"""
import os, subprocess, sys, time, json, base64
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8997
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a carrier group 120 NM north of the strike steerpoint path; the flight comes from the south at 22,000 ft, its task steerpoint 4 on the ship at 14:20
SETUP = r"""o => {
  const K = 1.852, H = 3600000, mk = (x, y, z, arr, dep, act) => ({ x, y, z, arr, dep, act });
  const me = [mk(600, 100, 0, 13 * H, 13 * H, 1), mk(600, 200, 2200, 13.4 * H, 0, 0), mk(600, 300, 2200, 13.8 * H, 0, 0), mk(600, 520, 2200, 14.333 * H, 0, 15), mk(600, 100, 0, 15.2 * H, 0, 7)];
  const ship = (id, x, y, name, rng, low, det, detAir, spotted, boat) => ({ id, x, y, name, cat: boat ? 'SAG' : 'CSG', rng, low, det, detAir, spotted, boat, d: Math.hypot(x - 600, y - 520) / K });
  const X = { ok: true, me: { key: '9', name: 'Hawk 2', n: 2, ac: 'KF-16C-52', pkgNo: 3, tag: 'HAWK 2 · PKG 3' }, wps: me, task: { n: 4, x: 600, y: 520, t0: 14.333 * H },
    ships: [ship('1:1', 600, 520, 'Kuznetsov CLS', 80, 67, 92, 115, o.spot !== false, false), ship('2:1', 610, 515, 'Udaloy CLS', 30, 20, 60, 80, true, false), ship('3:1', 597, 380, 'Osa II CLS', 0, 4, 33, 41, true, true)],
    weapons: [{ id: '152', name: 'AGM-84A Harpoon', n: 2, rngKm: 124, kind: 'asm' }, { id: '160', name: 'AGM-65D Maverick', n: 4, rngKm: 0, kind: 'mav' }], radar: 35, target: '1:1' };
  __app.tasmoPage._test({ ctx: () => X, mis: null });
}"""
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['target_%d=0.000000, 0.000000, 0.000000, -1, Not set' % i for i in range(99)] + ['[NAV OFFSETS]'] + ['OA%d-%d=0,0,0' % (a, n) for n in range(1, 25) for a in (1, 2)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1700, 'height': 1250}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.evaluate(SETUP, {})
        plan = lambda: json.loads(pg.evaluate("()=>JSON.stringify(__app.tasmoPage.plan())"))
        pg.click('[data-t=wp]'); pg.wait_for_timeout(500)
        check('the TASMO tab between HARM and Target', pg.locator('#wp .wtabs [data-mode]').all_inner_texts()[-3:] == ['HARM', 'TASMO', 'Target'])
        pg.click('#wp [data-mode=tasmo]'); pg.wait_for_timeout(1500)
        check('the page as DEAD: three columns, the steps on the right, no Smart card preview, compact rows', pg.locator('#wptasmo .wpg.sdg.dg .wpl').count() == 1 and pg.locator('#wptasmo .wpr #tssh').count() == 1 and pg.locator('#wptasmo .wpr #tsstp').count() == 1 and pg.locator('#wptasmo .wpr canvas').count() == 0 and pg.locator('#tswp .wrow > label').count() >= 5)
        check('Map filters at the right of Fit view; the dark menus', pg.locator('#wptasmo [data-tsfit] + [data-tspf]').count() == 1 and pg.evaluate("()=>getComputedStyle(document.querySelector('#wptasmo select')).backgroundColor") == 'rgb(11, 15, 20)')
        check('the map larger than the side panels allow on DEAD (640 px high)', pg.evaluate("()=>document.querySelector('#tsmap').getBoundingClientRect().height") == 640)
        check('Add card in the bar of the tabs, usable', pg.locator('#wp .wtabs [data-tabcard]').count() == 1 and pg.locator('#wp .wtabs [data-tabcard]').is_enabled())
        P = plan()
        check('the target ship of the task, spotted: ±3 NM', P['ship'] == '1:1' and P['P']['U'] == 3)
        check('the Harpoon first, launch from the south, 500 ft', P['wpn'] == 'AGM-84A Harpoon' and P['S']['alt'] == 500 and P['P']['launch']['y'] < 520)
        check('outside the low ring with a margin, in range, no red check (%s)' % P['checks'], P['P']['margin'] > 0 and P['P']['reach'] >= 0 and not any(c[1] for c in P['checks']))
        check('the descent before the ship sees you at the cruise', P['P']['desc'] and P['P']['tDesc'] < P['P']['tLaunch'])
        check('the impact at the time of the task steerpoint', abs(P['P']['tLaunch'] + P['P']['tof'] - 14.333 * 3600000) < 1)
        T = pg.inner_text('#wptasmo')
        check('the target card: group, SAM, radar, spotted', 'Kuznetsov CLS + 1' in T and 'low 36 NM' in T and 'spotted' in T)
        check('the Harpoon options (Dash-34): RBL, LARGE, NORM, LOW, POP', all(pg.locator('#tswp [data-tsset=%s][data-v=%s].on' % kv).count() == 1 for kv in [('mode', 'rbl'), ('area', 'LARGE'), ('prio', 'NORM'), ('fly', 'LOW'), ('term', 'POP')]))
        check('the steps: the power, the WPN page, the launch', 'AG84 PWR ON' in pg.inner_text('#tsstp') and 'WPN: RBL · LARGE · NORM · LOW · POP' in pg.inner_text('#tsstp'))
        check('the patrol boat near the way in (MANPADS): a check', any('Osa II' in c[0] and 'MANPADS' in c[0] for c in P['checks']))
        check('OA1 the launch, OA2 the descent, from the steerpoint nearest to the ship (4)', [o['k'] for o in P['oas']] == ['OA1-4', 'OA2-4'] and P['oas'][0]['l'] == 'Launch' and P['oas'][1]['l'] == 'Descent')
        check('the map: the lent map with the ship, the launch', pg.locator('#tsmap .leaflet-container, #tsmap.leaflet-container').count() >= 1 and 'LAUNCH · OA1' in pg.inner_text('#tsmap') and 'HPN STPT 90' in pg.inner_text('#tsmap'))
        # the profile
        pg.click('[data-tsview=prof]'); pg.wait_for_timeout(300)
        pt = pg.evaluate("()=>[...document.querySelectorAll('#tsprof svg text')].map(e=>e.textContent).join('|')")
        check('the profile as the vertical envelope: the launch, the descent, the seeker, the POP point, the target, the SAM', pg.locator('#tsprof .wpvs svg').count() == 1 and all(k in pt for k in ('LAUNCH · OA1', 'DESCEND', 'SEEKER ON', 'POP 2 NM', 'TGT ±3', 'SAM')) and pg.locator('#tsprof .wleg span').count() == 7 and pg.locator('#tsmapw[hidden]').count() == 1)
        check('...the turns rounded (curves), OA1 / OA2 as triangles', pg.evaluate("()=>[...document.querySelectorAll('#tsprof svg path')].some(e=>/Q/.test(e.getAttribute('d')))") and pg.locator('#tsprof svg path[fill="#a78bfa"]').count() == 2)
        msl = "()=>[...document.querySelectorAll('#tsprof svg path')].filter(e=>/38bdf8|e879f9/.test(e.getAttribute('stroke'))).map(e=>e.getAttribute('d')).join('|')"
        m0 = pg.evaluate(msl)
        pg.click('[data-tsset=fly][data-v=HIGH]'); pg.wait_for_timeout(300)
        m1 = pg.evaluate(msl)
        pg.click('[data-tsset=term][data-v=SKIM]'); pg.wait_for_timeout(300)
        m2 = pg.evaluate(msl)
        check('the fly-out and the terminal change the flight of the missile in the profile', m0 != m1 != m2 and m0 != m2)
        pg.click('[data-tsset=fly][data-v=LOW]'); pg.click('[data-tsset=term][data-v=POP]'); pg.wait_for_timeout(300)
        if OUT: pg.screenshot(path=os.path.join(OUT, 'tasmo-prof.png'))
        # the sliders in real time (input, no change): the plan and the profile drawn again, the slider kept
        s0 = pg.inner_text('#tssh'); p0 = pg.inner_html('#tsprof')
        pg.evaluate("()=>{const e=document.querySelector('[data-tssl=dist]');window.__sl=e;e.value=50;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(200)
        check('the distance slider in real time: the shot, the profile, the text, the same slider', plan()['S']['dist'] == 50 and pg.inner_text('#tssh') != s0 and pg.inner_html('#tsprof') != p0 and '50 NM' in pg.inner_text('#tsal') and pg.evaluate("()=>window.__sl===document.querySelector('[data-tssl=dist]')"))
        pg.evaluate("()=>{const e=document.querySelector('[data-tssl=alt]');e.value=3000;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(200)
        check('the altitude slider in real time', plan()['S']['alt'] == 3000 and '3,000 ft' in pg.inner_text('#tsal'))
        pg.evaluate("()=>{const e=document.querySelector('[data-tssl=alt]');e.value=500;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        check('the missiles: as many as the aircraft carries (2)', pg.locator('#tswp [data-tsset=n]').all_inner_texts() == ['1', '2'])
        pg.click('[data-tsview=map]'); pg.wait_for_timeout(300)
        # inside the ring
        pg.evaluate("()=>{const e=document.querySelector('[data-tssl=dist]');e.value=30;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('30 NM: inside the ring, red, the slider red', any(c[1] and 'SAM ring' in c[0] for c in plan()['checks']) and pg.locator('#tsal .slr.bad [data-tssl=dist]').count() == 1)
        pg.evaluate("()=>{const e=document.querySelector('[data-tssl=dist]');e.value=60;e.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
        # BOL options
        check('RBL: the search area on the map', 'SEARCH LARGE' in pg.inner_text('#tsmap'))
        pg.click('[data-tsset=mode][data-v=bol]'); pg.wait_for_timeout(300)
        check('BOL: no search area, the enable and destruct ranges, on the map too', pg.locator('[data-tsset=area]').count() == 0 and 'enable' in pg.inner_text('#tssh') and 'DESTRUCT' in pg.inner_text('#tsmap') and 'SEARCH' not in pg.inner_text('#tsmap'))
        pg.click('[data-tsset=mode][data-v=rbl]'); pg.wait_for_timeout(300)
        # OA and STPT 90 in the DTC
        msgs = []
        pg.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        pg.click('[data-tsoa]'); pg.wait_for_timeout(500)
        v1 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA1-4')||{}).v")
        v2 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA2-4')||{}).v")
        check('Write OA1 / OA2 on STPT 4 (%s, %s)' % (v1, v2), v1 and v1 == '180,364567,500' and v2 and v2.endswith(',22000'))
        pg.click('[data-tshpn]'); pg.wait_for_timeout(500)
        t90 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='STPT'&&l.k=='target_89')||{}).v")
        t99 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='STPT'&&l.k=='target_98')||{}).v")
        check('Write HPN STPT 90: the ship on target_89 (%s) and on target_98, STPT 99' % t90, t90 and 'Kuznetsov' in t90 and not t90.startswith('0.000000') and t99 == t90)
        # not spotted: ±40 NM, the radar acquisition
        pg.evaluate(SETUP, {'spot': False}); pg.click('[data-tsset=n][data-v="2"]'); pg.wait_for_timeout(500)
        P = plan()
        check('not spotted: ±40 NM, the radar acquisition, BOL suggested', P['P']['U'] == 40 and P['P']['acq'] and P['P']['mode'] == 'bol' and 'NOT SPOTTED' in pg.inner_text('#tstg'))
        check('not spotted: a check about the fog of war', any('fog of war' in c[0] or 'BOL' in c[0] for c in P['checks']))
        if OUT: pg.screenshot(path=os.path.join(OUT, 'tasmo-page.png'))
        # the cards
        for k in ('smart', 'map'):
            u = pg.evaluate("async k=>{const c=await __app.tasmoPage.cardCanvas(k);return c?c.width+'x'+c.height+'|'+c.toDataURL():''}", k)
            check('the %s card is drawn (1600 x 2400)' % k, u.startswith('1600x2400|data:image/png'))
            if OUT and u: open(os.path.join(OUT, 'tasmo-%s.png' % k), 'wb').write(base64.b64decode(u.split(',', 1)[1]))
        sm = pg.evaluate("()=>{const d=__app.tasmoPage.smart();return d&&{key:d.key.map(k=>k[0]),box:d.boxTitle,sop:d.sop}}")
        check('Smart TASMO: the key, the threats box', sm['key'][:3] == ['TARGET', 'STPT', 'LAUNCH'] and sm['box'] == 'THREATS' and any('KUZNETSOV' in l for l in sm['sop']) and any('PATROL' in l for l in sm['sop']))
        # the Maverick: the attack in Pop-up
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)  # a new DTC: no steerpoint near the ship
        pg.evaluate(SETUP, {}); pg.click('[data-t=wp]'); pg.click('#wp [data-mode=tasmo]'); pg.wait_for_timeout(500)
        pg.select_option('[data-tswpn]', '160'); pg.wait_for_timeout(500)
        check('a Maverick: no launch, the button to Pop-up', pg.locator('[data-tspop]').count() == 1 and pg.locator('[data-tssl=dist]').count() == 0 and plan()['P'] is None)
        pg.click('[data-tspop]'); pg.wait_for_timeout(800)
        t99 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='STPT'&&l.k=='target_98')||{}).v")
        check('...no steerpoint near the ship: asked, the ship written as STPT 99 (%s)' % t99, any('steerpoint 99' in m for m in msgs) and t99 and 'Kuznetsov' in t99)
        sel = pg.evaluate("()=>{const s=document.querySelector('#wp [data-pick=tgt]');return s?s.options[s.selectedIndex].text:''}")
        check('...Attack in A-G > Pop-up opens Pop-up on STPT 99 (%s)' % sel, pg.locator('#wp .wtabs [data-mode=popup].on').count() == 1 and 'STPT 99' in sel)
        # Display > TASMO and the patrol boat rings on the Map page
        pg.click('[data-t=mp]'); pg.wait_for_timeout(1200)
        dsp = pg.evaluate("()=>{const e=document.getElementById('mpdsp');return e?e.innerText:''}")
        check('Map > Display: TASMO in A-G', 'TASMO' in dsp)
        check('Display > TASMO draws (overlay)', pg.evaluate("()=>{const L=window.L,g=L.layerGroup();return __app.tasmoPage.overlay({L,map:{createPane:()=>({style:{}}),_tsR:L.canvas()},WL:g})&&g.getLayers().length>5}"))
        check('no error on the page: %s' % errs[:3], not errs)
    print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
finally:
    srv.kill()
