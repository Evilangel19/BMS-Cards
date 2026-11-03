"""Checks the options of the BVR page (1.1.0-beta.6): the missile menu of each row, kt | Mach, the Sliders switch (number boxes),
the altitude and speed of each enemy of the timeline, and the old saved states. Usage: python3 tools/bvrpage-test.py [screenshot_dir]"""
import subprocess, sys, time, os, json, re
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8812', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    # the data of the repository hold three missiles only: the others the classes carry are copies of the AIM-120B (the numbers do not matter, the menus do)
    fb = open(R + '/app/js/data/local/missilefallback.js').read()
    fb += '\n' + '\n'.join("MISSILE_FALLBACK[%s]={...MISSILE_FALLBACK['AIM-120B']};" % json.dumps(n) for n in ('AIM-7', 'AIM-120C', 'AA-10C', 'AA-12', 'AA-10A', 'AA-9', 'MICA_EM', 'Meteor'))
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1500, 'height': 1100}, reduced_motion='reduce')
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/app/js/data/local/missilefallback.js', lambda r: r.fulfill(body=fb, content_type='application/javascript'))
        pg.goto('http://localhost:8812/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
        pg.click('[data-t=ms]'); pg.wait_for_timeout(800)
        rows = lambda: json.loads(pg.evaluate("()=>JSON.stringify(__app.msPage.rows())"))
        state = lambda: json.loads(pg.evaluate("()=>JSON.stringify(__app.msPage.state())"))
        def slide(sel, v):  # a slider moved and released
            pg.evaluate("([s,v])=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}", [sel, str(v)]); pg.wait_for_timeout(200)
        def typed(sel, v):  # a number typed in a box
            pg.fill(sel, str(v)); pg.locator(sel).dispatch_event('change'); pg.wait_for_timeout(200)
        near = lambda a, b, t: abs(a - b) <= t

        # ---- the cards: title, unit and Sliders switch
        check('Shot card is called "Your shot" and the MAR tile "Enemy MAR at 450 kt"', pg.locator('#ms .wpl h3').first.text_content().startswith('Your shot') and pg.locator('#ms #msr .tile span').nth(1).text_content() == 'Enemy MAR at 450 kt')
        check('timeline card: kt | Mach (Mach on) and the Sliders switch (on); Shot card: kt | Mach (kt on) and the same switch', pg.locator('#mstl [data-unit=tl]').all_inner_texts() == ['kt', 'Mach'] and pg.locator('#mstl [data-unit=tl].on').all_inner_texts() == ['Mach'] and pg.locator('#mstl .dsw.on').count() == 1 and pg.locator('#ms .wpl [data-unit=bvr]').all_inner_texts() == ['kt', 'Mach'] and pg.locator('#ms .wpl [data-unit=bvr].on').all_inner_texts() == ['kt'] and pg.locator('#ms .wpl .dsw.on').count() == 1)
        check('the default page is as it was: sliders, Mach in the timeline, 450 kt in the shot, and no enemy block open', pg.locator('#mstl input[type=range]').count() == 4 and pg.locator('#ms .wpl input[type=range]').count() == 6 and pg.locator('#mstl .wen').count() == 0 and pg.locator('#mstl em[data-tle="std.spd"]').inner_text() == 'Mach 0.90')
        cls = pg.locator('#mstl select[data-tl="cls.0"] option').all_inner_texts()
        check('class list: J-15 and Su-39 are there', 'J-15' in cls and 'Su-39' in cls)
        # ---- missile menus: one for each row, names as the pilots say them
        check('each row has its own missile menu (the best missile of the class is the default)', pg.locator('#mstl select[data-tl^="msl."]').count() == 4 and pg.locator('#mstl select[data-tl="msl.0"] option').first.text_content() == 'AA-10C (default)')
        check('the F-16C menu holds the AIM-120B (default) and the AIM-7M (the file is called AIM-7)', pg.locator('#mstl select[data-tl="msl.2"] option').all_inner_texts() == ['AIM-120B (default)', 'AIM-7M'] and pg.locator('#mstl select[data-tl="msl.2"] option[value="AIM-7"]').count() == 1)
        ms = pg.locator('#ms select[data-pick=msl] option').all_inner_texts()
        check('Shot card list: AIM-7M and MICA EM (the file names stay as values)', 'AIM-7M' in ms and 'MICA EM' in ms and 'AIM-7' not in ms and pg.locator('#ms select[data-pick=msl] option[value="MICA_EM"]').count() == 1)
        r0 = rows()
        pg.select_option('#ms select[data-pick=msl]', 'AIM-7'); pg.wait_for_timeout(300)
        check('the missile of the Shot card does not change the table any more', rows() == r0 and state()['bvr']['msl'] == 'AIM-7')
        pg.select_option('#ms select[data-pick=msl]', 'AIM-120B'); pg.wait_for_timeout(200)
        pg.select_option('#mstl select[data-tl="msl.2"]', 'AIM-7'); pg.wait_for_timeout(300)
        r1 = rows()
        check('a missile chosen on a row changes that row only (star in the table, AIM-7M in the name)', r1[2]['msl'] == 'AIM-7' and r1[2]['picked'] and r1[2]['src'] == 'model AIM-7M' and r1[0] == r0[0] and r1[1] == r0[1] and r1[3] == r0[3] and 'AIM-7M ★' in pg.inner_text('#mstlt table tr:nth-child(4)'))
        pg.select_option('#mstl select[data-tl="msl.2"]', ''); pg.wait_for_timeout(300)
        check('the default entry puts the best missile of the class back', rows() == r0)

        # ---- kt | Mach: the same speed shown in the other unit, every number stays
        pg.click('#mstl [data-unit=tl][data-v=kt]'); pg.wait_for_timeout(300)
        rk = rows()
        check('timeline in kt: the speed reads 542 kt, the table does not move (0.1 nm)', pg.locator('#mstl em[data-tle="std.spd"]').inner_text() == '542 kt' and pg.locator('#mstl [data-unit=tl].on').all_inner_texts() == ['kt'] and all(near(a['mar'], b['mar'], 0.1) and near(a['dor'], b['dor'], 0.2) for a, b in zip(rk, r0) if a))
        pg.click('#mstl [data-unit=tl][data-v=mach]'); pg.wait_for_timeout(300)
        check('and back to Mach: 0.90 again', pg.locator('#mstl em[data-tle="std.spd"]').inner_text() == 'Mach 0.90')
        mar0 = float(re.search(r'([\d.]+) nm', pg.locator('#ms #msr .tile b').nth(1).inner_text()).group(1))
        pg.click('#ms .wpl [data-unit=bvr][data-v=mach]'); pg.wait_for_timeout(300)
        mar1 = float(re.search(r'([\d.]+) nm', pg.locator('#ms #msr .tile b').nth(1).inner_text()).group(1))
        check('Shot card in Mach: speeds read Mach 0.75, the tile says Mach and the MAR stays the same (0.3 nm)', pg.locator('#ms .wpl em[data-em=speed]').inner_text() == 'Mach 0.75' and pg.locator('#ms #msr .tile span').nth(1).text_content().startswith('Enemy MAR at Mach ') and near(mar0, mar1, 0.3))
        pg.click('#ms .wpl [data-unit=bvr][data-v=kt]'); pg.wait_for_timeout(300)
        check('and back to kt: about 450 kt', near(state()['bvr']['speed'], 450, 6) and pg.locator('#ms #msr .tile span').nth(1).text_content().startswith('Enemy MAR at 4'))

        # ---- the altitude and speed of each enemy
        pg.click('#mstl [data-tlopen="0"]'); pg.wait_for_timeout(200)
        check('the arrow of a row opens its altitude and speed: they start as yours', pg.locator('#mstl .wen').count() == 1 and pg.locator('#mstl input[data-tls="en.0.alt"]').input_value() == '25000' and pg.locator('#mstl input[data-tls="en.0.spd"]').input_value() == '0.9' and 'flies like you' in pg.locator('#mstl .wen').inner_text().lower())
        slide('#mstl input[data-tls="en.0.alt"]', 35000); slide('#mstl input[data-tls="en.0.spd"]', 1.2)
        r2 = rows()
        check('the enemy of row 1 at 35 000 ft and Mach 1.20: closure is your speed + its speed, only that row changes', near(r2[0]['en']['alt'], 35000, 0) and near(r2[0]['en']['mach'], 1.2, 0.001) and near(r2[0]['vc'], r2[0]['me']['kt'] + r2[0]['en']['kt'], 1e-6) and r2[0]['vc'] > r0[0]['vc'] + 100 and r2[1:] == r0[1:])
        check('the row says it: its arrow is marked, the block says "Its own altitude and speed" with a Like you button', pg.locator('#mstl .wex.ov').count() == 1 and pg.locator('#mstl [data-tllike="0"]').count() == 1 and 'own altitude and speed' in pg.locator('#mstl .wen').inner_text().lower())
        check('the scheme tells the conditions it is drawn for', re.search(r'enemy 35.000 ft, Mach 1\.20', pg.inner_text('#msch')) is not None and re.search(r'you 25.000 ft, Mach 0\.90', pg.inner_text('#msch')) is not None)
        check('the datacard asks the page for a class and gets the numbers of its row (the conditions of its enemy included)', near(pg.evaluate("()=>__app.msPage.calc('Su-27').vc"), r2[0]['vc'], 1e-6) and near(pg.evaluate("()=>__app.msPage.calc('J-20').vc"), 2 * r0[0]['me']['kt'], 1e-6))
        pg.click('#mstl [data-tlopen="1"]'); pg.wait_for_timeout(200)
        slide('#mstl input[data-tls="std.alt"]', 15000)
        check('your sliders move the enemies that fly like you and leave the ones with their own values alone', pg.locator('#mstl input[data-tls="en.1.alt"]').input_value() == '15000' and pg.locator('#mstl input[data-tls="en.0.alt"]').input_value() == '35000' and state()['tl']['en'][0]['alt'] == 35000 and state()['tl']['en'][1] is None)
        slide('#mstl input[data-tls="std.alt"]', 25000)
        pg.click('#mstl [data-tllike="0"]'); pg.wait_for_timeout(250)
        check('"Like you" gives the enemy your conditions back: the table is the first one again', pg.locator('#mstl .wex.ov').count() == 0 and rows() == r0 and state()['tl']['en'][0] is None)
        pg.click('#mstl [data-tlopen="2"]'); pg.wait_for_timeout(200)
        pg.focus('#mstl input[data-tls="en.2.alt"]'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(250)
        check('an enemy slider moved with the keyboard keeps the focus and its row is marked at once', pg.evaluate("()=>document.activeElement.dataset.tls") == 'en.2.alt' and state()['tl']['en'][2]['alt'] == 26000 and pg.locator('#mstl [data-tlopen="2"].ov').count() == 1 and pg.locator('#mstl [data-tllike="2"]').count() == 1)
        pg.click('#mstl [data-tllike="2"]'); pg.click('#mstl [data-tlopen="2"]'); pg.wait_for_timeout(250)
        check('Like you and the arrow put the third row back as it was', rows() == r0 and pg.locator('#mstl .wen').count() == 2 and state()['tl']['en'] == [None] * 4)
        slide('#mstl input[data-tls="en.0.alt"]', 30000)
        pg.select_option('#mstl select[data-tl="cls.0"]', 'J-15'); pg.wait_for_timeout(250)
        s1 = state()['tl']
        check('another aircraft in a row starts again: default missile, flies like you, block closed', s1['en'][0] is None and s1['msl'][0] == '' and s1['open'][0] is False and rows()[0]['cls'] == 'J-15' and (rows()[0]['msl'] == 'PL-12' or rows()[0]['src'] == 'Threat Guide'))
        pg.select_option('#mstl select[data-tl="cls.0"]', 'Su-27'); pg.wait_for_timeout(250)
        if shots: pg.screenshot(path=shots + '/bvr-options.png')

        # ---- Sliders off: number boxes
        pg.click('#mstl [data-sliders]'); pg.wait_for_timeout(300)
        check('Sliders off: both cards have number boxes and no slider; the switch is off on both', pg.locator('#mstl input[type=range]').count() == 0 and pg.locator('#ms .wpl input[type=range]').count() == 0 and pg.locator('#mstl input[type=number]').count() >= 6 and pg.locator('#ms .wpl input[data-num]').count() == 6 and pg.locator('.dsw.on').count() == 0 and state()['sliders'] == 0)
        typed('#mstl input[data-tlb="std.alt"]', 30000)
        check('a typed altitude is the altitude of the whole timeline', state()['tl']['std']['alt'] == 30000 and pg.locator('#mstl input[data-tlb="std.alt"]').input_value() == '30000')
        typed('#mstl input[data-tlb="std.alt"]', 99999)
        check('a number out of the range is brought back into it', state()['tl']['std']['alt'] == 50000)
        pg.fill('#mstl input[data-tlb="std.alt"]', ''); pg.locator('#mstl input[data-tlb="std.alt"]').dispatch_event('change'); pg.wait_for_timeout(200)
        check('an empty box keeps the previous value', state()['tl']['std']['alt'] == 50000 and pg.locator('#mstl input[data-tlb="std.alt"]').input_value() == '50000')
        typed('#mstl input[data-tlb="std.alt"]', 25000)
        pg.click('#mstl input[data-tlb="std.alt"]'); pg.keyboard.press('Control+A'); pg.keyboard.type('28000'); pg.keyboard.press('Tab'); pg.wait_for_timeout(250)
        check('Tab after a typed number: the value is taken and the focus goes on to the next box (the card is not drawn again)', state()['tl']['std']['alt'] == 28000 and pg.evaluate("()=>document.activeElement.dataset.tlb") == 'std.spd')
        typed('#mstl input[data-tlb="std.alt"]', 25000)
        typed('#mstl input[data-tlb="std.spd"]', 1.05)
        check('Mach typed with decimals: 1.05', state()['tl']['std']['spd'] == 1.05 and rows()[0]['me']['mach'] == 1.05 and rows()[0]['vc'] > r0[0]['vc'])
        pg.click('#mstl [data-unit=tl][data-v=kt]'); pg.wait_for_timeout(300)
        typed('#mstl input[data-tlb="std.spd"]', 600)
        check('knots typed: 600 kt', state()['tl']['std']['spd'] == 600 and near(rows()[0]['me']['kt'], 600, 1e-6) and 'kt' in pg.locator('#mstl input[data-tlb="std.spd"]').evaluate('e=>e.parentElement.textContent'))
        typed('#mstl input[data-tlb="en.1.spd"]', 700)
        check('an enemy\'s speed typed in its block gives it its own conditions', state()['tl']['en'][1] == {'alt': 25000, 'spd': 700} and near(rows()[1]['en']['kt'], 700, 1e-6) and pg.locator('#mstl .wex.ov').count() == 1)
        typed('#ms .wpl input[data-num=speed]', 500)
        check('Shot card: a typed launch speed', state()['bvr']['speed'] == 500)
        pg.click('#ms .wpl [data-unit=bvr][data-v=mach]'); pg.wait_for_timeout(300)
        typed('#ms .wpl input[data-num=speed]', 0.9)
        check('Shot card: Mach typed (0.9) and kept in Mach', state()['bvr']['speed'] == 0.9 and state()['bvr']['u'] == 'mach')
        pg.click('#ms .wpl [data-unit=bvr][data-v=kt]'); pg.wait_for_timeout(200)
        pg.click('#mstl [data-sliders]'); pg.wait_for_timeout(300)
        check('Sliders on again: the sliders are back with the values typed', pg.locator('#mstl input[type=range]').count() >= 4 and pg.locator('#ms .wpl input[type=range]').count() == 6 and state()['sliders'] == 1 and pg.locator('#mstl input[data-tls="std.spd"]').input_value() == '600')

        # ---- saved states: this one comes back whole, an old one (no units, no menus, no enemy conditions) is understood
        keep = state()
        pg.evaluate("s=>__app.msPage.setState(JSON.parse(JSON.stringify(s)))", keep); pg.wait_for_timeout(300)
        check('a mission carries the whole page: the state saved and loaded again is the same', state()['tl'] == keep['tl'] and state()['bvr'] == keep['bvr'] and state()['sliders'] == keep['sliders'])
        pg.evaluate("()=>__app.msPage.setState({tl:{std:{alt:30000,mach:1.1,tNotch:10,tRecommit:12},sel:1,cls:['F-16C','Su-27','','']},bvr:{msl:'AIM-120B',alt:20000,speed:420,tgtAlt:20000,tgtSpeed:420,aspect:0,shotPct:100,tgtSize:'fighter'}})"); pg.wait_for_timeout(300)
        s2 = state()
        check('an old state: the timeline speed was Mach (1.1) and stays Mach, the Shot card speeds were knots; no enemy conditions, no menu choices', s2['tl']['u'] == 'mach' and s2['tl']['std']['spd'] == 1.1 and 'mach' not in s2['tl']['std'] and s2['tl']['en'] == [None] * 4 and s2['tl']['msl'] == [''] * 4 and s2['tl']['open'] == [False] * 4 and s2['bvr']['u'] == 'kt' and s2['bvr']['speed'] == 420 and s2['tl']['std']['alt'] == 30000 and rows()[0]['cls'] == 'F-16C' and near(rows()[0]['me']['mach'], 1.1, 1e-9))
        # a state from anybody (a mission file may come from anybody): odd values become numbers in the ranges and shapes the page can draw, and never markup
        pg.evaluate("()=>{__app.msPage.setState({tl:{std:{alt:'<img src=x id=pwn1>',spd:'x',tNotch:null,tRecommit:{}},cls:'oops',sel:'7',msl:5,en:[{alt:'<img src=x id=pwn2>',spd:1},'z',null,5],open:'yes',u:'<u>'},bvr:{alt:'<img src=x id=pwn3>',speed:'<b>',tgtSpeed:Infinity,aspect:'zz',shotPct:-5,tgtSize:'<i>',u:'<u>',msl:7},sliders:'no'});__app.msPage.render()}"); pg.wait_for_timeout(300)
        s3 = state()
        check('a state from anybody: numbers in their ranges, four entries in each list, known classes only, one of the two units', s3['tl']['std'] == {'alt': 25000, 'spd': 0.9, 'tNotch': 15, 'tRecommit': 20} and s3['tl']['cls'] == [''] * 4 and s3['tl']['sel'] == 0 and s3['tl']['msl'] == [''] * 4 and s3['tl']['en'] == [{'alt': 25000, 'spd': 1}, None, None, None] and s3['tl']['open'] == [False] * 4 and s3['tl']['u'] == 'mach' and s3['bvr']['u'] == 'kt' and s3['bvr']['alt'] == 25000 and s3['bvr']['speed'] == 450 and s3['bvr']['tgtSpeed'] == 450 and s3['bvr']['aspect'] == 0 and s3['bvr']['shotPct'] == 20 and s3['bvr']['tgtSize'] == 'fighter' and s3['bvr']['msl'] == 'AIM-120B' and s3['sliders'] == 1)
        check('and nothing of it becomes markup: the page is drawn (empty rows) and no element comes out of the values', pg.locator('#pwn1, #pwn2, #pwn3').count() == 0 and pg.locator('#mstl select[data-tl^="cls."]').count() == 4 and not errs)
        check('no page errors', not errs); print(errs)
        br.close()
finally:
    srv.kill()
print('ALL OK' if ok else 'SOME FAILED')
sys.exit(0 if ok else 1)
