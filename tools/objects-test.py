"""Checks the Objects filters of the map (allied / enemy) and the radar of the fixed stations with the owners of the scenario file. Needs tests/fixtures/saves/Save3.cam and beartrap/PSI_BEAR_TRAP_26-double.cam. Usage: python3 tools/objects-test.py"""
import base64, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = R + '/tests/fixtures/'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8796', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 1000}, reduced_motion='reduce'); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8796/app/index.html'); pg.wait_for_timeout(1000)
        pg.evaluate("async(b)=>{await __app.loadCam(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'x.cam'))}", b64(FX + 'beartrap/PSI_BEAR_TRAP_26-double.cam')); pg.wait_for_timeout(1200)
        n = pg.evaluate("b=>__app.initialOwners(Uint8Array.from(atob(b),c=>c.charCodeAt(0)))", b64(FX + 'saves/Save3.cam'))
        check('the scenario file gives the owner of every objective', n == 5999)
        # one objective of each kind: ours, an ally's, an enemy's, one nobody knows
        own = pg.evaluate("()=>{const C=__app.ST.C,v=C.playerTeam,m=C.objOwn,al=[],en=[],ne=[],S=C.stance;m.forEach((o,k)=>{if(o==v)al.push(k);else if(o&&S&&(S[v][o]==1||S[o][v]==1||S[v][o]==2||S[o][v]==2))al.push(k);else if(o&&S&&[S[v][o],S[o][v]].some(x=>x==0||x==4||x==5))en.push(k);else if(o)ne.push(k)});return {a:al[0],e:en[0],n:ne[0],team:v}}")
        check('there are allied, enemy and neutral objectives in the scenario (neutral: relation 3, the teams of China and Russia)', own['a'] is not None and own['e'] is not None and own['n'] is not None)
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(700)
        pg.evaluate("o=>{window.__targetData={objectives:async()=>[{id:o.a,name:'Ally Plant',type:20,n:2875827,e:2293401,ocd:985},{id:o.e,name:'Enemy Plant',type:20,n:2800000,e:2200000,ocd:986},{id:o.n,name:'Neutral Plant',type:20,n:2750000,e:2230000,ocd:986},{id:999999,name:'Unknown Plant',type:20,n:2700000,e:2250000,ocd:986}],features:async x=>[]}}", own)
        secs = pg.evaluate("()=>[...document.querySelectorAll('#mpbar .mps')].map(e=>e.dataset.sec)")
        check('three sections: Allied, Enemy and Neutral objects, above Display', all(x in secs for x in ('Allied objects', 'Enemy objects', 'Neutral objects')) and secs.index('Neutral objects') < secs.index('Display'))
        tog = lambda k, v: pg.evaluate("([k,v])=>{const c=document.querySelector('#mpbar input[data-k='+k+']');if(c.checked!=v){c.checked=v;c.dispatchEvent(new Event('change',{bubbles:true}))}}", [k, v])
        names = lambda: sorted(pg.evaluate("()=>{const r=[];__app.mapV.leaflet.eachLayer(l=>{if(l.options&&l.options.icon&&/nobj( |$)/.test(l.options.icon.options.className||'')&&!/ sub/.test(l.options.icon.options.className)&&l._map&&l._tooltip)r.push(l._tooltip._content.split(' · ')[0])});return r}"))
        tog('oa20', True); pg.wait_for_timeout(800)
        check('allied switch: our plant and the unknown one (owner not known)', names() == ['Ally Plant', 'Unknown Plant'])
        tog('oa20', False); tog('oe20', True); pg.wait_for_timeout(800)
        check('enemy switch: the enemy plant and the unknown one', names() == ['Enemy Plant', 'Unknown Plant'])
        tog('oe20', False); tog('ox20', True); pg.wait_for_timeout(800)
        check('neutral switch: the neutral plant (relation 3, not an enemy) and the unknown one', names() == ['Neutral Plant', 'Unknown Plant'])
        tog('oa20', True); tog('oe20', True); pg.wait_for_timeout(800)
        check('all three: the four of them', names() == ['Ally Plant', 'Enemy Plant', 'Neutral Plant', 'Unknown Plant'])
        tip = pg.evaluate("()=>{let t='';__app.mapV.leaflet.eachLayer(l=>{if(l._tooltip&&/Enemy Plant/.test(l._tooltip._content))t=l._tooltip._content});return t}")
        check('the tooltip names the team that owns the objective', 'Enemy Plant' in tip and tip.count(' · ') >= 2)
        tog('oa20', False); tog('oe20', False); tog('ox20', False); pg.wait_for_timeout(600)
        check('both off: nothing is drawn', names() == [])
        # fixed radar stations: the owner decides (allies and neutral teams are not drawn, enemies red, unknown grey)
        pg.evaluate("o=>{window.__targetData={objectives:async()=>[],features:async x=>[],radars:async()=>[{o:{id:o.a,name:'Ally Radar',n:2800000,e:2300000,type:21},feats:[{k:0,n:2800000,e:2300000,det:75}]},{o:{id:o.e,name:'Enemy Radar',n:2900000,e:2200000,type:21},feats:[{k:0,n:2900000,e:2200000,det:75}]},{o:{id:o.n,name:'Neutral Radar',n:2600000,e:2450000,type:21},feats:[{k:0,n:2600000,e:2450000,det:75}]},{o:{id:999999,name:'Unknown Radar',n:2700000,e:2400000,type:21},feats:[{k:0,n:2700000,e:2400000,det:75}]}]}}", own)
        pg.evaluate("document.querySelector('#mpbar input[data-k=rc]').click()"); pg.wait_for_timeout(3500)
        cols = sorted(pg.evaluate("(()=>{const r=[];__app.mapV.leaflet.eachLayer(l=>{if(l.options&&l.options.className=='rcov')r.push(l.options.color)});return r})()"))
        check('radar coverage: the allied and the neutral stations are left out, an enemy one is drawn red, the unknown one grey', len(cols) >= 2 and '#9aa4b2' in cols and any(c != '#9aa4b2' for c in cols) and len([c for c in cols if c == '#9aa4b2']) == 1)
        check('no page errors', not errs)
        br.close()
finally:
    srv.kill()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
