"""A-G > Pop-up and HADB with a Maverick (1.4.0-beta.34; buddy lasing 1.4.0-beta.35): the Weapon list with the Mavericks of the load, the bomb controls dark, the launch altitude
and range (the dive angle from them), the red sliders of the Dash-34 limits, two launches, AUTO PWR, the boresight point (OA1 written by Apply), the
cards. Made-up flight plan and load, no BMS file.
Usage: python3 tools/mav-test.py [folder for the pictures]"""
import os, subprocess, sys, time, json
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8972
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
FT = 3280.84
pt = lambda x, y: '%.6f, %.6f, 0.000000' % (y * FT, x * FT)
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['target_%d=%s, 0' % (i, pt(500, 400 + i * 30)) for i in range(5)] +
                  ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] + ['[NAV OFFSETS]'] + ['OA%d-%d=0,0,0' % (a, n) for n in range(1, 25) for a in (1, 2)] + ['Modesel=vrp', ''])
# the flight plan of the campaign (km, ms): STPT 4 the target at 10:20; the load: four AGM-65D
SETUP = r"""o => {
  const H = 3600000, M = 60000;
  const fp = [[1, 500, 400, 9.5 * H], [2, 500, 430, 10 * H], [3, 500, 460, 10 * H + 14 * M], [4, 500, 490, 10 * H + 20 * M], [5, 500, 520, 10.8 * H]].map(([n, x, y, arr]) => ({ n, x, y, arr, act: n == 1 ? 1 : n == 4 ? 15 : n == 5 ? 7 : 0 }));
  __app.wpPage._test({ loadout: () => [{ name: o.name || 'AGM-65D Maverick', n: 4 }, { name: 'MK-82', n: 6 }], fplan: () => fp, roeAg: () => true, night: () => false, wxBase: async () => null });
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1700, 'height': 1250}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(300)
        pg.evaluate(SETUP, {})
        pg.click('[data-t=wp]'); pg.wait_for_timeout(600); pg.click('#wp [data-mode=popup]'); pg.wait_for_timeout(700)
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',tgt:null,src:'dtc',bomb:'auto'})"); pg.wait_for_timeout(600)
        check('the target to start with: the first steerpoint of an action (STPT 4, a strike), not STPT 1', pg.evaluate("()=>{const s=document.querySelector('#wp [data-pick=tgt]');return s?s.options[s.selectedIndex].text:''}").startswith('STPT 4'))
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',tgt:'r:4',src:'dtc',bomb:'auto'})"); pg.wait_for_timeout(600)
        opts = pg.evaluate("()=>[...document.querySelectorAll('select[data-pick=bomb] option')].map(o=>o.value)")
        check('the Weapon list: the bombs, then the Maverick of the load (%s)' % opts, 'msl:AGM-65D Maverick' in opts and 'auto' in opts)
        pg.select_option('select[data-pick=bomb]', 'msl:AGM-65D Maverick'); pg.wait_for_timeout(800)
        L = pg.inner_text('#wp .wpl')
        check('the Maverick: Launch alt. and Launch range, Lock time, the dive angle dark', pg.locator('input[data-sl=mAlt]').count() == 1 and pg.locator('input[data-sl=mRange]').count() == 1 and 'Lock time' in L and pg.locator('.woff [data-em=diveDim]').count() == 1)
        check('...the defaults 5,000 ft at 7 NM, the dive about 6.8°', pg.input_value('input[data-sl=mAlt]') == '5000' and pg.input_value('input[data-sl=mRange]') == '7' and '6.8°' in pg.inner_text('[data-em=diveDim]'))
        check('...no impact pattern of a stick, the missile in the legend', pg.locator('#wpic').is_hidden() and 'Missile' in pg.inner_text('#wpl1'))
        check('...the bomb controls dark and off (fuze, stick, range model)', pg.locator('.woff [data-num=ripplePulses]').count() == 1 and pg.locator('.woff [data-num=ripplePulses]').is_disabled() and pg.locator('.woff [data-set=rangeModel]').count() == 2)
        rv = pg.inner_text('#wpr')
        check('the results: the Maverick card, the launch, the power, the acquisition', 'Maverick' in rv and 'LAUNCH' in rv and 'POWER' in rv and 'HANDOFF' in rv and 'TOF' in rv)
        check('AUTO PWR: STPT 3 (6 min before), from the SOUTH', 'AUTO PWR · STPT 3 · SOUTH' in rv)
        # the dive angle follows the sliders
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mRange]');e.value=4;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('4 NM: the dive about 11.9°', '11.9°' in pg.inner_text('[data-em=diveDim]'))
        # a speed over 600 kt: red
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=releaseSpeed]');e.value=620;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(500)
        check('620 kt with the Maverick carried: the speed slider red', pg.locator('.slr.bad input[data-sl=releaseSpeed]').count() == 1)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=releaseSpeed]');e.value=480;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mRange]');e.value=7;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
        # two launches
        pg.click('[data-set=mN][data-v="2"]'); pg.wait_for_timeout(500)
        check('two launches: the interval slider, the 2nd launch in the results', pg.locator('input[data-sl=mGap]').count() == 1 and '2ND LAUNCH' in pg.inner_text('#wpr'))
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mGap]');e.value=15;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(400)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mRange]');e.value=2;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(500)
        check('...a 2nd launch too near: the interval red', pg.locator('.slr.bad input[data-sl=mGap]').count() == 1)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mRange]');e.value=7;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mGap]');e.value=4;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
        # the boresight point: OA1 of STPT 2, 1 NM east; written by Apply
        pg.click('[data-set=bsmode][data-v=oa]'); pg.wait_for_timeout(500)
        pg.select_option('select[data-pick=bsstpt]', '2'); pg.wait_for_timeout(300)
        pg.evaluate("()=>{const e=document.querySelector('[data-bs=brg]');e.value=90;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(200)
        pg.evaluate("()=>{const e=document.querySelector('[data-bs=nm]');e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(500)
        check('the boresight: OA1 of STPT 2 in the NAV OFFSETS and on the map', 'OA1 · STPT 2 · boresight' in pg.inner_text('#wpr') and pg.locator('.wpbsg').count() == 1)
        check('the Boresight card above the Weapon settings, under the Egress', pg.evaluate("()=>{const h=[...document.querySelectorAll('#wp .wpl .wcard h3, #wp .wpl .wcard .wh h3')].map(e=>e.textContent.toUpperCase());const b=h.findIndex(t=>t.startsWith('BORESIGHT')),w=h.findIndex(t=>t.startsWith('WEAPON')),e=h.findIndex(t=>t.startsWith('EGRESS'));return e>=0&&e<b&&b<w}"))
        # drag the boresight point with Edit points on
        if pg.locator('[data-edit]').inner_text().endswith('Off'): pg.click('[data-edit]'); pg.wait_for_timeout(400)
        mk = pg.locator('.wpbsg').first
        pg.click('[data-fit]'); pg.wait_for_timeout(500)
        pg.evaluate("()=>document.querySelector('#wpmc').scrollIntoView()"); pg.wait_for_timeout(300)
        bb = mk.bounding_box()
        pg.mouse.move(bb['x'] + 8, bb['y'] + 8); pg.mouse.down(); pg.mouse.move(bb['x'] + 60, bb['y'] - 40, steps=8); pg.mouse.up(); pg.wait_for_timeout(600)
        bs = pg.evaluate("()=>__app.wpPage.state().bs")
        check('...dragged on the map: its bearing and range from STPT 2 follow (%s)' % bs, bs['mode'] == 'oa' and (bs['brg'] != 90 or abs(bs['nm'] - 1) > 0.05) and abs(float(pg.input_value('[data-bs=nm]')) - bs['nm']) < 0.01)
        pg.click('[data-edit]'); pg.wait_for_timeout(300)
        if OUT: pg.screenshot(path=os.path.join(OUT, 'mav-popup.png'))
        pg.on('dialog', lambda d: d.accept())
        pg.evaluate("()=>__app.wpPage.apply()"); pg.wait_for_timeout(700)
        o1 = pg.evaluate("()=>(__app.lines.find(l=>l.s=='NAV OFFSETS'&&l.k=='OA1-2')||{}).v")
        v1 = (o1 or '0,0,0').split(',')
        check('Apply: OA1-2 the boresight point where it was dragged, %s° %s NM, 0 ft (%s)' % (bs['brg'], bs['nm'], o1), abs(float(v1[0]) - bs['brg']) <= 1 and abs(float(v1[1]) / 6076.12 - bs['nm']) < 0.06 and v1[2] == '0')
        agb = pg.evaluate("()=>__app.lines.some(l=>l.s=='FCC_AGB')")
        check('Apply: no bomb profile written (no FCC_AGB)', not agb)
        # the cards
        cards = pg.evaluate("()=>JSON.stringify(__app.wpPage.atkCards().map(c=>c.sm&&c.sm.foot))")
        check('the attack card: MSL · LAUNCH · TOF', 'MSL' in cards and 'LAUNCH 7.0 NM' in cards)
        # HADB
        pg.click('#wp [data-mode=hadb]'); pg.wait_for_timeout(800)
        check('HADB: the Maverick kept, 15,000 ft at 9 NM', pg.input_value('input[data-sl=mAlt]') == '15000' and pg.input_value('input[data-sl=mRange]') == '9' and '15.9°' in pg.inner_text('[data-em=diveDim]'))
        if OUT: pg.screenshot(path=os.path.join(OUT, 'mav-hadb.png'))
        # TOSS: no Maverick
        pg.click('#wp [data-mode=toss]'); pg.wait_for_timeout(800)
        opts = pg.evaluate("()=>[...document.querySelectorAll('select[data-pick=bomb] option')].map(o=>o.value)")
        check('TOSS: no Maverick in the list, a bomb planned', not any(v.startswith('msl:') for v in opts) and pg.locator('.woff').count() == 0)
        # the laser Maverick: no handoff
        pg.evaluate(SETUP, {'name': 'AGM-65L Maverick'}); pg.click('#wp [data-mode=popup]'); pg.wait_for_timeout(600)
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',tgt:'r:4',bomb:'msl:AGM-65L Maverick'})"); pg.wait_for_timeout(600)
        check('AGM-65L: the laser on the target for the whole flight, no handoff', 'Laser' in pg.inner_text('#wpr') and 'HANDOFF' not in pg.inner_text('#wpr'))
        # buddy lasing: the lead launches the AGM-65L, the element lases (1.4.0-beta.35)
        pg.click('[data-split]'); pg.wait_for_timeout(600)
        check('split with an AGM-65L: the role of the element (Attack / LASE)', pg.locator('[data-role=lase]').count() == 1)
        pg.click('[data-role=lase]'); pg.wait_for_timeout(500)
        check('...the lead: the element lases, launch on its SPOT', 'lases (buddy)' in pg.inner_text('#wpr'))
        pg.click('[data-who=elem]'); pg.wait_for_timeout(900)
        rv = pg.inner_text('#wpr')
        check('...the element: the LASE card, the hold time, the basket, the code, the calls', 'LASE (BUDDY)' in rv.upper() and 'hold' in rv and 'BASKET' in rv and 'CODE' in rv and 'LASER ON' in rv and 'MISSILE' not in rv)
        check('...the mirror of the lead: within the laser basket (not red)', pg.locator('.slr.bad input[data-sl=heading]').count() == 0)
        pg.evaluate("()=>{const e=document.querySelector('[data-sl=mRange]');e.value=12;e.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(600)
        check('...a laser point 12 NM out: the range slider red', pg.locator('.slr.bad input[data-sl=mRange]').count() == 1)
        if OUT: pg.screenshot(path=os.path.join(OUT, 'mav-lase.png'))
        feet = pg.evaluate("()=>JSON.stringify(__app.wpPage.atkCards().map(c=>c.sm&&c.sm.foot))")
        check('...the cards: the lead MSL, the element LASE', 'LAUNCH' in feet and 'LASE' in feet)
        pg.click('[data-who=lead]'); pg.wait_for_timeout(500)
        pg.click('[data-split]'); pg.wait_for_timeout(500)
        pg.evaluate("()=>__app.wpPage.setState({mode:'popup',bomb:'auto'})"); pg.wait_for_timeout(600)
        check('back to a bomb: the fuze controls on again', pg.locator('.woff').count() == 0 and pg.locator('input[data-sl=releaseAltitude]').count() == 1)
        check('no page errors %s' % errs[:3], not errs)
        b.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
