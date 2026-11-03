"""Checks the animations. The rule of the project: every function and every button that is added has its animation, and every animation is off with
Settings > Animations (or the system "reduce motion"). This test looks at the buttons and fields of all the tabs, at the things that open, close, appear
and change in place (BVR timeline, top bar, page tabs, Data Cartridge menu) and at the two ways to switch everything off.
Usage: python3 tools/animations-test.py [screenshot_dir]"""
import subprocess, sys, time, os, json, base64
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/beartrap/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8821', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# the controls the rule is about: buttons, tabs, selects, links and the text fields (not the sliders, check boxes and file buttons of the system, not the map itself)
CONTROLS = """()=>{
 const bad=new Set();
 document.querySelectorAll('button,select,textarea,[role=tab],a[href],input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=file])').forEach(e=>{
  if(e.closest('.leaflet-container'))return;
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  if(!r.width||!r.height||s.visibility=='hidden'||s.display=='none')return;
  if(s.transitionDuration.split(',').every(x=>x.trim()=='0s'))bad.add(e.tagName.toLowerCase()+(typeof e.className=='string'&&e.className?'.'+e.className.trim().split(/\\s+/).join('.'):'')+(e.id?'#'+e.id:''))});
 return [...bad]}"""
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    cam = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
    # the missiles of the classes of the BVR timeline (see bvrpage-test.py)
    fb = open(R + '/app/js/data/local/missilefallback.js').read()
    fb += '\n' + '\n'.join("MISSILE_FALLBACK[%s]={...MISSILE_FALLBACK['AIM-120B']};" % json.dumps(n) for n in ('AIM-7', 'AIM-120C', 'AA-10C', 'AA-12', 'AA-10A', 'AA-9', 'MICA_EM', 'Meteor'))
    def start(br, motion='no-preference'):
        pg = br.new_page(viewport={'width': 1500, 'height': 1100}, reduced_motion=motion); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/app/js/data/local/missilefallback.js', lambda r: r.fulfill(body=fb, content_type='application/javascript'))
        pg.goto('http://localhost:8821/app/index.html'); pg.wait_for_timeout(800)
        pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
        pg.evaluate("""async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}""", cam); pg.wait_for_timeout(1000)
        return pg, errs
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg, errs = start(br)
        ev = lambda js, a=None: pg.evaluate(js, a)
        running = lambda sel: ev("s=>[...document.querySelector(s).getAnimations()].filter(a=>a.playState=='running'||a.playState=='pending').map(a=>a.animationName||a.transitionProperty)", sel)

        # ---- 1. the rule: every button and field of every tab has a transition
        tabs = ev("[...document.querySelectorAll('button.tab[data-t]')].map(b=>b.dataset.t)")
        bad = {}
        for t in tabs:
            pg.click('button.tab[data-t=%s]' % t); pg.wait_for_timeout(700)
            for s in ev(CONTROLS): bad.setdefault(s, []).append(t)
        check('every button, tab, menu, link and text field of every tab has a transition %s' % (bad or ''), not bad)
        check('there are tabs to look at', len(tabs) >= 8)
        ev("()=>{const b=document.createElement('button');b.id='zz';b.textContent='x';document.body.append(b)}")
        seen = ev(CONTROLS); ev("()=>document.getElementById('zz').remove()")
        check('the check itself sees a button that was added without any transition', any('#zz' in x for x in seen))
        pg.click('#cfgbtn'); pg.wait_for_timeout(500)
        b2 = ev(CONTROLS)
        check('and the Settings window too %s' % (b2 or ''), not b2)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        if pg.locator('dialog[open]').count(): pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        check('a field shows hover and focus with a short change of its border', ev("()=>{const e=document.querySelector('input[type=text],input:not([type])');const s=getComputedStyle(e);return s.transitionProperty.includes('border-color')&&s.transitionDuration.split(',').some(x=>x.trim()!='0s')}"))

        # ---- 2. the BVR timeline: the enemy block opens and closes smoothly, the arrow turns, the row mark and the drawing are changed in place
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(900)
        wen = lambda i: ev("i=>{const e=document.querySelector('.wen[data-i=\"'+i+'\"]');const r=e.getBoundingClientRect();return {h:Math.round(r.height),v:getComputedStyle(e).visibility,o:e.classList.contains('open')}}", i)
        check('the enemy blocks are in the page but closed: no height, hidden (Tab never reaches them)', all(wen(i)['h'] == 0 and wen(i)['v'] == 'hidden' and not wen(i)['o'] for i in range(4)))
        check('a closed block has no slider or box that can take the focus', ev("()=>[...document.querySelectorAll('.wen:not(.open) input')].every(e=>getComputedStyle(e).visibility=='hidden')"))
        ev("()=>{document.querySelector('[data-tlopen=\"0\"]').__keep=1;document.querySelector('.wen').__keep=1}")
        r = ev("()=>{document.querySelector('[data-tlopen=\"0\"]').click();return [...document.querySelector('.wen').getAnimations()].map(a=>a.transitionProperty)}")
        check('the arrow opens the block with transitions (height, margin, opacity) %s' % r, 'grid-template-rows' in r and 'opacity' in r)
        pg.wait_for_timeout(120)
        mid = wen(0)
        pg.wait_for_timeout(400)
        done = wen(0)
        check('it is still growing a moment later and open after 0.5 s (%s, %s)' % (mid['h'], done['h']), mid['h'] < done['h'] and done['h'] > 60 and done['o'] and done['v'] == 'visible')
        check('the arrow turned a quarter (one glyph, rotated) and is still the same button', ev("()=>{const b=document.querySelector('[data-tlopen=\"0\"]');return b.__keep===1&&b.classList.contains('on')&&getComputedStyle(b.firstElementChild).transform=='matrix(0, 1, -1, 0, 0, 0)'&&b.getAttribute('aria-expanded')=='true'}"))
        check('the block is the same element: nothing was drawn again', ev("()=>document.querySelector('.wen').__keep===1"))
        ev("()=>document.querySelector('[data-tlopen=\"0\"]').click()"); pg.wait_for_timeout(500)
        d = wen(0)
        check('it closes again smoothly and ends hidden with no height', d['h'] == 0 and d['v'] == 'hidden' and not d['o'])
        # a row of the table
        ev("()=>document.querySelectorAll('tr[data-tlsel]').forEach((r,i)=>r.__row=i+1)")
        n0 = ev("()=>document.querySelectorAll('tr[data-tlsel]').length")
        sel0 = ev("()=>[...document.querySelectorAll('tr[data-tlsel]')].findIndex(r=>r.classList.contains('sel'))")
        t1 = 1 if sel0 != 1 else 2
        txt0 = ev("()=>document.querySelector('#msch2 h3').textContent")
        r = ev("i=>{document.querySelectorAll('tr[data-tlsel]')[i].click();const c=document.querySelector('#msch2');return {fx:c.classList.contains('fx'),an:[...c.getAnimations()].map(a=>a.animationName)}}", t1)
        check('another row: the drawing fades in (class fx, animation appear) %s' % r, r['fx'] and 'appear' in r['an'])
        pg.wait_for_timeout(300)
        check('the yellow mark moved in place: the rows are the same elements, only one is marked, the drawing is the one of that row', ev("""([i,n])=>{const rs=[...document.querySelectorAll('tr[data-tlsel]')];return rs.length==n&&rs.every((r,k)=>r.__row==k+1)&&rs.filter(r=>r.classList.contains('sel')).length==1&&rs[i].classList.contains('sel')&&getComputedStyle(rs[i].firstElementChild).color=='rgb(255, 230, 128)'}""", [t1, n0]) and ev("()=>document.querySelector('#msch2 h3').textContent") != txt0)
        check('the row changes colour with a transition (its cells inherit it) and the cells light up under the pointer', ev("()=>{const r=getComputedStyle(document.querySelector('tr[data-tlsel]')),c=getComputedStyle(document.querySelector('tr[data-tlsel] td'));return r.transitionProperty.includes('color')&&r.transitionDuration.split(',').some(x=>x!='0s')&&c.transitionProperty.includes('background-color')&&c.transitionDuration.split(',').some(x=>x!='0s')}"))
        ev("""()=>{const e=document.querySelector('[data-tls="std.alt"]');e.value=30000;e.dispatchEvent(new Event('input',{bubbles:true}))}"""); pg.wait_for_timeout(100)
        check('a slider that moves does not make the drawing fade (it would blink)', not ev("()=>document.querySelector('#msch2').classList.contains('fx')"))
        check('the Sliders switch has its transitions (colour, and the knob slides)', ev("()=>{const b=document.querySelector('.dsw');return getComputedStyle(b).transitionProperty.includes('color')&&getComputedStyle(b.firstElementChild,'::after').transitionProperty.includes('left')}"))
        # a switch that the page draws again with its cards: it starts where it was and slides, the cards fade in
        r = ev("""()=>{const s=document.querySelector('.dsw');s.click();const n=document.querySelector('.dsw');
          return {on:n.classList.contains('on'),slide:[...n.querySelector('i').getAnimations({subtree:true})].map(a=>a.transitionProperty).sort().join(),fx:[...document.querySelectorAll('#mstl, .wpl > .wcard')].filter(x=>x.classList.contains('fx')).length,boxes:document.querySelectorAll('#mstl input[type=number]').length}}""")
        check('the Sliders switch slides (colour and knob) and both cards fade in while the number boxes replace the sliders %s' % r, not r['on'] and 'background-color' in r['slide'] and 'left' in r['slide'] and r['fx'] == 2 and r['boxes'] > 0)
        pg.wait_for_timeout(300)
        check('the switch rests in its new state', ev("()=>!document.querySelector('.dsw').classList.contains('on')"))
        r = ev("""()=>{const bs=[...document.querySelectorAll('[data-unit="tl"]')];const to=bs.find(b=>!b.classList.contains('on'));to.click();
          const n=[...document.querySelectorAll('[data-unit="tl"]')];return {on:n.map(b=>b.classList.contains('on')),run:n.map(b=>[...b.getAnimations()].length)}}""")
        check('the kt | Mach buttons: the old one fades out, the new one fades in (the page was drawn again) %s' % r, r['on'].count(True) == 1 and all(x > 0 for x in r['run']))
        pg.wait_for_timeout(300)
        ev("()=>document.querySelector('.dsw').click()"); pg.wait_for_timeout(300)
        if shots: pg.screenshot(path=shots + '/animations-bvr.png')

        # ---- 3. a page tab: the content under the bar fades in
        pg.click('button.tab[data-t=pf]'); pg.wait_for_timeout(800)
        r = ev("""async()=>{const b=[...document.querySelectorAll('#pf .wtabs button')].find(x=>!x.classList.contains('on'));if(!b)return null;b.click();await new Promise(r=>setTimeout(r,20));
          return [...document.querySelectorAll('#pf .wtabs ~ *')].map(e=>e.getAnimations().length)}""")
        check('Performance: another page tab makes the content under the bar fade in %s' % (r,), r is not None and any(x > 0 for x in r))

        # ---- 4. the top bar: the buttons that a tab shows appear with a fade
        pg.click('button.tab[data-t=dtc]'); pg.wait_for_timeout(500)
        pg.click('button.tab[data-t=wp]'); pg.wait_for_timeout(700)
        r = ev("""async()=>{document.querySelector('button.tab[data-t=dtc]').click();await new Promise(r=>setTimeout(r,300));document.querySelector('button.tab[data-t=wp]').click();
          return [...document.querySelector('#wpapply').getAnimations()].map(a=>a.animationName)}""")
        check('Weapons: Apply to the DTC / Clear offsets appear with a fade when the tab is shown %s' % (r,), 'appear' in r)
        r = ev("()=>getComputedStyle(document.querySelector('#wpapply')).opacity")
        pg.wait_for_timeout(400)
        check('a dimmed button ends at its own dimmed opacity, not at full (no blink at the end)', ev("()=>getComputedStyle(document.querySelector('#wpapply')).opacity") == ('0.4' if 'nil' in ev("()=>document.querySelector('#wpapply').className") else '1'))

        # ---- 5. the Data Cartridge menu: the buttons stay, only the highlight moves
        pg.click('button.tab[data-t=dtc]'); pg.wait_for_timeout(700)
        ev("()=>document.querySelectorAll('#dnav button').forEach((b,i)=>b.__k=i+1)")
        k = ev("()=>[...document.querySelectorAll('#dnav button')].findIndex(b=>!b.classList.contains('on'))")
        pg.locator('#dnav button').nth(k).click(); pg.wait_for_timeout(100)
        check('Data Cartridge menu: another section moves the highlight in place (same buttons, a colour transition running)', ev("""k=>{const bs=[...document.querySelectorAll('#dnav button')];return bs.every((b,i)=>b.__k==i+1)&&bs[k].classList.contains('on')&&bs.filter(b=>b.classList.contains('on')).length==1&&[...bs[k].getAnimations()].length>0}""", k))

        # ---- 6. the map: the symbol of an airbase under the mouse fades in (the bands and labels of the route do not: they are drawn again while the slider moves)
        css = open(R + '/app/css/style-02.css').read()
        check('Map: only the hover symbol of the MSA layer has a fade (class fxh)', '.msas.fxh > *' in css and "hov ? 'msas fxh' : 'msas'" in open(R + '/app/js/core/mapview.js').read())
        check('Map menu: zoom buttons change colour with a transition', ev("()=>{document.querySelector('button.tab[data-t=mp]').click();return true}") and (pg.wait_for_timeout(900) or True) and ev("()=>{const a=document.querySelector('#mp .leaflet-bar a');return !!a&&getComputedStyle(a).transitionDuration!='0s'}"))

        # ---- 7. switched off: Settings > Animations, and the system "reduce motion"
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(700)
        ev("()=>{__app.CFG.ui={...(__app.CFG.ui||{}),animations:false};document.documentElement.classList.add('noanim')}")
        check('animations off: html has .noanim and the buttons, fields, rows, the enemy block and the arrow have no transition', ev("""()=>{const z=s=>{const e=document.querySelector(s);return getComputedStyle(e).transitionDuration.split(',').every(x=>x.trim()=='0s')&&getComputedStyle(e).animationName=='none'};
          return document.documentElement.classList.contains('noanim')&&['.btn','.seg button','.dsw','.wex','.wen','.wex span','tr[data-tlsel]','tr[data-tlsel] td','input[type=number],input[type=text]'].every(z)}"""))
        r = ev("""()=>{document.querySelector('[data-tlopen="0"]').click();const e=document.querySelector('.wen');return {a:e.getAnimations().length,h:Math.round(e.getBoundingClientRect().height),v:getComputedStyle(e).visibility}}""")
        check('animations off: the block opens at once, nothing animates %s' % r, r['a'] == 0 and r['h'] > 60 and r['v'] == 'visible')
        r = ev("""async()=>{const b=[...document.querySelectorAll('.wtabs button')].find(x=>!x.classList.contains('on'));b.click();await new Promise(r=>setTimeout(r,30));
          return [...document.querySelectorAll('.wtabs ~ *')].map(e=>e.getAnimations().length).reduce((a,b)=>a+b,0)}""")
        check('animations off: a page tab does not fade the content (the script fades read the same setting) %s' % r, r == 0)
        ev("()=>{__app.CFG.ui={...__app.CFG.ui,animations:true};document.documentElement.classList.remove('noanim')}")
        check('animations on again: the transitions are back', ev("()=>getComputedStyle(document.querySelector('.btn')).transitionDuration!='0s'"))
        check('no page errors %s' % errs, not errs); pg.close()

        pg, errs = start(br, 'reduce')
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(1000)
        check('system "reduce motion": no transition and no animation, whatever the setting says', ev("""()=>['.btn','.seg button','.dsw','.wex','.wen','tr[data-tlsel]','tr[data-tlsel] td','select'].every(s=>{const e=document.querySelector(s);return getComputedStyle(e).transitionDuration.split(',').every(x=>x.trim()=='0s')&&getComputedStyle(e).animationName=='none'})"""))
        pg.click('[data-tlopen="0"]'); pg.wait_for_timeout(50)
        check('system "reduce motion": the block is open at once', ev("()=>Math.round(document.querySelector('.wen').getBoundingClientRect().height)") > 60)
        check('no page errors %s' % errs, not errs); pg.close()
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
