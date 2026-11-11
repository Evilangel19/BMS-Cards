"""WEZ exposure time on the map: with the filter on, every enemy SAM ring the selected flight crosses shows the minutes spent inside, and the label of the flight
the window and the total. A campaign of one flight and three SAM units made here (no BMS files). Usage: python3 tools/wez-test.py"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import dialogs
PORT = 8991
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a flight east along y = 500 at 10 km a minute from 12:00; SA-6 on the route (ring 30 km: 6 min), SA-2 beside it (40 km north, ring 50: 6 min, overlapping
# the SA-6 for a part), an SA-3 without its radar and a far SA-8 that the route does not reach
SETUP = """async()=>{const {ST}=await import('/app/js/app/state.js');const M=await import('/app/js/core/mapdata.js');
  const H=3600e3,m=60e3,wp=(x,y,min,act)=>({x,y,z:2000,arr:12*H+min*m,dep:0,act});
  const f={kind:'flight',id:{n:1,c:0},pkg:{n:9,c:0},owner:2,c:{i:0},wps:[wp(300,500,0,1),wp(500,500,20,0),wp(700,500,40,7)]};
  const pk={kind:'pkg',id:{n:9,c:0},els:[f.id]};
  ST.C={D:{S:{},ac:['F-16CM-50'],un:{},ab:{}},units:[f,pk],byId:{'1:0':f,'9:0':pk},now:null,playerTeam:2};
  ST.ATOSEL=f;
  const U=__app.mapV.units();U.length=0;
  const sam=(name,x,y,rng,noFcr)=>({u:{x,y,kind:'gnd'},ll:M.toLL(x,y),name,bn:name,cat:'Air Defense',rng,sam:true,noFcr:!!noFcr,ally:false,hostile:true,spotted:true,slot:-1,det:0});
  U.push(sam('SA-6',400,500,30),sam('SA-2',430,540,50),sam('SA-3',600,500,25,true),sam('SA-8',600,700,10));
  window.__f=f}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        dialogs.install(pg); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(700)
        pg.evaluate(SETUP)
        row = pg.locator('#mpbar input[data-k=wz]')
        check('the filter "WEZ exposure time" is in the SAM range section, off', row.count() == 1 and not row.is_checked() and 'WEZ exposure time' in pg.inner_text('#mpbar [data-row=wz]'))
        order = pg.evaluate("()=>[...document.querySelectorAll('#mpbar .mpsb[data-sec=\"SAM range\"] label[data-row]')].map(e=>e.dataset.row+(e.classList.contains('sub')?'*':''))")
        check('SAM range: enemy first, its "only" and WEZ sub-rows under it, then friendly %s' % order, order == ['se', 'sx*', 'wz*', 'sf'])
        one = pg.evaluate("()=>[...document.querySelectorAll('#mpbar label.mpr[data-row]')].filter(e=>e.offsetParent).every(e=>e.getBoundingClientRect().height<26)")
        check('every filter row of the menu is one line', one)
        fit = pg.evaluate("""async()=>{const m=await import('/app/js/app/cardview.js'),x=document.createElement('canvas').getContext('2d'),v="12:00 · WEZ 12:41-13:05 9' SA-6";return [m.wezFit(x,v,400,13),m.wezFit(x,v,120,13),m.wezFit(x,'12:00',10,13)]}""")
        check('the SAM name is dropped only where the cell is too short %s' % fit, fit == ["12:00 · WEZ 12:41-13:05 9' SA-6", "12:00 · WEZ 12:41-13:05 9'", '12:00'])
        pg.evaluate("()=>{const i=document.querySelector('#mpbar input[data-k=wz]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(500)
        labs = pg.locator('#mpmap .wzl span').all_text_contents()
        check('a label on each ring crossed, with the minutes inside (not on the SAM without radar, nor on the one out of reach): %s' % labs, sorted(labs) == ['SA-2 · 6.0 min', 'SA-6 · 6.0 min'])
        box = pg.inner_text('#mpmap .flb')
        check('the label of the flight has the window and the total (overlap counted once): %s' % box.replace('\n', ' | '), 'WEZ 12:07-12:16 · 9 min' in box)
        pg.evaluate("()=>{const i=document.querySelector('#mpbar input[data-k=wz]');i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(400)
        check('filter off: no labels, no line', pg.locator('#mpmap .wzl').count() == 0 and 'WEZ' not in pg.inner_text('#mpmap .flb'))
        check('no page errors %s' % errs[:3], not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
