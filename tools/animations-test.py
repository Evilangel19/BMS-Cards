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
        bad = {}; seat_btn = 0
        for t in tabs:
            pg.click('button.tab[data-t=%s]' % t); pg.wait_for_timeout(700)
            if t == 'kb': seat_btn = ev("()=>[...document.querySelectorAll('#seatov .seatb')].filter(b=>b.getBoundingClientRect().width>0).length")
            for s in ev(CONTROLS): bad.setdefault(s, []).append(t)
        check('every button, tab, menu, link and text field of every tab has a transition %s' % (bad or ''), not bad)
        check('the round buttons of the seat (Datacard) are among the controls the rule looked at (%d)' % seat_btn, seat_btn >= 5)
        check('there are tabs to look at', len(tabs) >= 8)
        ev("()=>{const b=document.createElement('button');b.id='zz';b.textContent='x';document.body.append(b)}")
        seen = ev(CONTROLS); ev("()=>document.getElementById('zz').remove()")
        check('the check itself sees a button that was added without any transition', any('#zz' in x for x in seen))
        pg.click('#cfgbtn'); pg.wait_for_timeout(500)
        panels = ev("()=>[...document.querySelectorAll('#cfg .s-nv')].map(b=>b.dataset.p)")
        b2 = {}
        for t in panels:
            pg.click('#nv-' + t); pg.wait_for_timeout(300)
            for s in ev(CONTROLS): b2.setdefault(s, []).append(t)
        check('and the Settings window too, on each of its pages %s' % (b2 or ''), not b2 and len(panels) == 7)
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

        # ---- 7. the Settings window: the page that opens fades in, the switches slide, the dot of a changed section grows, the full report and the own
        #         satellite layer open in place, the progress bar and the check have their own; all of it is off with the setting and with "reduce motion"
        pg.click('#cfgbtn'); pg.wait_for_timeout(500)
        runs = lambda sel: ev("s=>[...document.querySelector(s).getAnimations({subtree:true})].map(a=>a.animationName||a.transitionProperty)", sel)
        has = lambda sel, *names: all(n in runs(sel) for n in names)
        r = ev("""()=>{document.querySelector('#nv-general').click();return {page:[...document.querySelector('#p-general').getAnimations()].map(a=>a.animationName),
          shown:[...document.querySelectorAll('#cfg .s-pg')].filter(e=>!e.hidden).map(e=>e.id),on:[...document.querySelectorAll('#cfg .s-nv.on')].map(e=>e.id)}}""")
        check('Settings: another section: its page fades in (animation sxin), the other pages are hidden and one entry is marked %s' % r, 'sxin' in r['page'] and r['shown'] == ['p-general'] and r['on'] == ['nv-general'])
        check('Settings: the entries of the list change colour with a transition', ev("()=>{const s=getComputedStyle(document.querySelector('#nv-map'));return s.transitionProperty.includes('background-color')&&s.transitionDuration.split(',').some(x=>x.trim()!='0s')}"))
        pg.wait_for_timeout(300)
        r = ev("""()=>{const b=document.querySelector('#p-general [data-a=sw]');b.__keep=1;b.click();const d=document.querySelector('#nv-general .s-nd');
          return {kept:b.__keep===1&&document.querySelector('#p-general [data-a=sw]')===b,on:b.classList.contains('on'),aria:b.getAttribute('aria-checked'),
          slide:[...b.getAnimations({subtree:true})].map(a=>a.transitionProperty).sort().join(),dot:d.classList.contains('on')&&[...d.getAnimations()].map(a=>a.transitionProperty).sort().join()}}""")
        check('Settings: a switch is the same button and slides (colour, and the knob moves) and the dot of its section grows %s' % r,
              r['kept'] and 'background-color' in r['slide'] and 'transform' in r['slide'] and 'opacity' in r['dot'] and 'transform' in r['dot'])
        pg.wait_for_timeout(300)
        r = ev("""()=>{const b=document.querySelector('#p-general [data-a=sw]');b.click();return {dot:document.querySelector('#nv-general .s-nd').classList.contains('on'),run:[...document.querySelector('#nv-general .s-nd').getAnimations()].length}}""")
        check('Settings: the switch put back: the dot goes away with a transition %s' % r, not r['dot'] and r['run'] > 0)
        pg.wait_for_timeout(300)
        # the full report (Diagnostics): the part opens in place and the arrow turns
        pg.click('#nv-diag'); pg.wait_for_timeout(300)
        rep = lambda: ev("""()=>{const e=document.querySelector('#cfgreport'),b=document.querySelector('#p-diag [data-a=report]');return {h:Math.round(e.getBoundingClientRect().height),v:getComputedStyle(e).visibility,
          open:e.classList.contains('open'),arrow:getComputedStyle(b.querySelector('.s-cv')).transform,exp:b.getAttribute('aria-expanded')}}""")
        d0 = rep()
        check('Settings: the full report is closed: no height, hidden (Tab never reaches it) %s' % d0, d0['h'] == 0 and d0['v'] == 'hidden' and not d0['open'] and d0['exp'] == 'false')
        r = ev("""()=>{const b=document.querySelector('#p-diag [data-a=report]');b.click();return {box:[...document.querySelector('#cfgreport').getAnimations()].map(a=>a.transitionProperty),arrow:[...b.querySelector('.s-cv').getAnimations()].map(a=>a.transitionProperty)}}""")
        check('Settings: the full report opens with a transition of the height and the arrow turns with another %s' % r, 'grid-template-rows' in r['box'] and 'transform' in r['arrow'])
        pg.wait_for_timeout(120); mid = rep(); pg.wait_for_timeout(400); done = rep()
        check('Settings: it was still growing a moment later and is open after 0.5 s; the arrow turned a quarter (%s, %s)' % (mid['h'], done['h']),
              mid['h'] < done['h'] and done['h'] > 30 and done['open'] and done['v'] == 'visible' and done['arrow'] == 'matrix(0, 1, -1, 0, 0, 0)' and done['exp'] == 'true')
        ev("()=>document.querySelector('#p-diag [data-a=report]').click()"); pg.wait_for_timeout(500)
        d1 = rep()
        check('Settings: and closes again smoothly: no height, hidden, the arrow back %s' % d1, d1['h'] == 0 and d1['v'] == 'hidden' and d1['arrow'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)') and d1['exp'] == 'false')
        # the own satellite layer (Map): the fields open under their switch
        pg.click('#nv-map'); pg.wait_for_timeout(300)
        r = ev("""()=>{const b=document.querySelector('#p-map [data-k=sat]');b.click();return [...document.querySelector('#satbox').getAnimations()].map(a=>a.transitionProperty)}""")
        check('Settings: the fields of the own satellite layer open in place %s' % r, 'grid-template-rows' in r)
        pg.wait_for_timeout(500)
        ev("()=>document.querySelector('#p-map [data-k=sat]').click()"); pg.wait_for_timeout(400)
        # the parts that appear (the progress bar, the check, the list of the result) are looked at where they are put: here as copies in the window
        ev("""()=>{const d=document.querySelector('#cfg');d.insertAdjacentHTML('beforeend','<div id="zz"><div class="s-pb"><i></i></div><span class="s-pop">x</span><div class="s-dn"><div class="s-li">x</div></div></div>')}""")
        check('Settings: the progress bar grows with a transition of its width, the check pops and the list of a result comes in one line after the other',
              ev("()=>{const w=getComputedStyle(document.querySelector('#zz .s-pb i'));return w.transitionProperty.includes('width')&&w.transitionDuration.split(',').some(x=>x.trim()!='0s')}")
              and ev("()=>getComputedStyle(document.querySelector('#zz .s-pop')).animationName")=='sxpop' and ev("()=>getComputedStyle(document.querySelector('#zz .s-li')).animationName")=='sxin')
        # switched off with the setting: nothing moves, a page and a part are there at once
        ev("()=>{__app.CFG.ui={...(__app.CFG.ui||{}),animations:false};document.documentElement.classList.add('noanim')}")
        still = ev("""()=>['#nv-map','#p-map [data-k=sat]','#cfgsave','#cfgx','#p-map .s-fd','#zz .s-pb i'].every(s=>{const e=document.querySelector(s);return getComputedStyle(e).transitionDuration.split(',').every(x=>x.trim()=='0s')})
          &&['#zz .s-pop','#zz .s-li','#p-map'].every(s=>getComputedStyle(document.querySelector(s)).animationName=='none')&&getComputedStyle(document.querySelector('#p-map [data-k=sat]'),'::after').transitionDuration.split(',').every(x=>x.trim()=='0s')""")
        check('animations off: the entries, the switches (and their knob), the buttons, the boxes, the bar, the check and the list have nothing running', still)
        r = ev("""()=>{document.querySelector('#nv-diag').click();const p=document.querySelector('#p-diag');document.querySelector('#p-diag [data-a=report]').click();const e=document.querySelector('#cfgreport');
          return {page:p.getAnimations().length,box:e.getAnimations().length,h:Math.round(e.getBoundingClientRect().height),v:getComputedStyle(e).visibility}}""")
        check('animations off: the page and the full report are there at once %s' % r, r['page'] == 0 and r['box'] == 0 and r['h'] > 30 and r['v'] == 'visible')
        ev("()=>{__app.CFG.ui={...__app.CFG.ui,animations:true};document.documentElement.classList.remove('noanim');document.querySelector('#zz').remove()}")
        check('animations on again: the Settings window moves again', ev("()=>getComputedStyle(document.querySelector('#nv-map')).transitionDuration!='0s'"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        if pg.locator('dialog[open]').count(): pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")

        # ---- 7b. Link 16: the plan on the Data Cartridge page (the chips come in with a fade, the cross and "Back to auto" have a transition) and the window of a flight of the package on the map
        l16 = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.l16.txtpb', 'rb').read()).decode()
        ev("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadL16(f(b,'x.txtpb'))}", l16); pg.wait_for_timeout(500)
        ev("rx=>{const i=__app.CL.findIndex(x=>new RegExp(rx).test(x.label));document.getElementById('fsel').value=i;__app.apply(i)}", 'Cajun 6'); pg.wait_for_timeout(900)
        ev("()=>__app.seat.pick(1)"); pg.wait_for_timeout(500)
        pg.click('button.tab[data-t=dtc]'); pg.wait_for_timeout(500); pg.click('#dnav [data-k=l16]'); pg.wait_for_timeout(400)
        pg.click('[data-card=l16a] [data-edit]'); pg.wait_for_timeout(200)
        ev("()=>__app.l16.add('A','donor',8,'l',{cs:'Mako 5',stn:'4262',n:2})"); pg.wait_for_timeout(300)
        r = ev("""()=>{const q=s=>document.querySelector(s),z=e=>!e||getComputedStyle(e).transitionDuration.split(',').every(x=>x.trim()=='0s');
          return {chips:document.querySelectorAll('[data-card=l16a] .l16c').length,fade:getComputedStyle(q('[data-card=l16a] .l16c')).animationName,add:q('[data-card=l16a] .l16c.add')?1:0,
            cross:!!q('[data-card=l16a] .l16x')&&!z(q('[data-card=l16a] .l16x')),back:!!q('[data-card=l16a] [data-l16back]')&&!z(q('[data-card=l16a] [data-l16back]')),chip:!z(q('[data-card=l16a] .l16c'))}}""")
        check('Link 16 page: a chip beside each filled slot comes in with a fade, the cross and "Back to auto" change with a transition %s' % r, r['chips'] >= 3 and r['fade'] == 'appear' and r['add'] and r['cross'] and r['back'] and r['chip'])
        check('...and every button and field of the page (with the card open) has a transition %s' % ev(CONTROLS), not ev(CONTROLS))
        pg.click('button.tab[data-t=mp]'); pg.wait_for_timeout(1000)
        ev("""()=>{const d=[...document.querySelectorAll('#mpmap .flb.m div[data-lb]')].find(x=>/MAKO/.test(x.textContent));const r=d.getBoundingClientRect();d.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+5,clientY:r.top+5}))}"""); pg.wait_for_timeout(400)
        pg.click('.mpop [data-a=l16]'); pg.wait_for_timeout(300)
        still = lambda: ev("()=>[...document.querySelectorAll('.mpop button,.mpop select')].filter(e=>getComputedStyle(e).transitionDuration.split(',').every(x=>x.trim()=='0s')).map(e=>e.tagName+'.'+(e.dataset.a||e.dataset.k||''))")
        check('window of a flight of the package (Add Link 16): every button and the slot menu have a transition %s' % still(), not still() and ev("()=>document.querySelectorAll('.mpop button').length") >= 6)
        check('the lines of what a change does fade in', ev("()=>{const d=document.querySelector('.mpop .l16pv div');return !!d&&getComputedStyle(d).animationName=='appear'}"))
        pg.click('.mpop [data-a=bk]'); pg.wait_for_timeout(200)
        check('the first view of the window (Select flight, Add Link 16) has transitions too %s' % still(), not still() and ev("()=>document.querySelectorAll('.mpop button').length") == 2)
        pg.mouse.click(5, 5); pg.wait_for_timeout(200)

        # ---- 8. switched off: Settings > Animations, and the system "reduce motion"
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
        pg.click('#cfgbtn'); pg.wait_for_timeout(400)
        r = ev("""()=>{document.querySelector('#nv-diag').click();const p=document.querySelector('#p-diag');document.querySelector('#p-diag [data-a=report]').click();const e=document.querySelector('#cfgreport');
          return {page:p.getAnimations().length,box:e.getAnimations().length,h:Math.round(e.getBoundingClientRect().height),
            still:['#nv-map','#nv-diag','#cfgsave','#cfgx'].every(s=>getComputedStyle(document.querySelector(s)).transitionDuration.split(',').every(x=>x.trim()=='0s'))}}""")
        check('system "reduce motion": the Settings window has no transition, the page and the full report are there at once %s' % r, r['page'] == 0 and r['box'] == 0 and r['h'] > 30 and r['still'])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('no page errors %s' % errs, not errs); pg.close()
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
