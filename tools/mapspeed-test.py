"""The Objects layers of the map with thousands of objectives (no BMS file needed: the objectives are made here). Only the dots in the view and half a view around
it are in the page, the others come back the same when the view reaches them; the size of the dots is written once per zoom level; the names are kept and moved
in and out of the page, not made again. Usage: python3 tools/mapspeed-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8798', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1500, 'height': 1000}, reduced_motion='reduce'); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8798/app/index.html'); pg.wait_for_timeout(1000)
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(700)
        types = pg.evaluate("()=>[...document.querySelectorAll('#mpfilw input[data-k^=o]')].map(e=>e.dataset.k).filter(k=>/^o\\d+$/.test(k)).map(k=>+k.slice(1))")
        # 4000 objectives over Korea (feet), one plant (type 20) far in the north-east to look for
        pg.evaluate("""(types)=>{let s=11;const r=()=>(s=(s*16807)%2147483647)/2147483647;const L=[];for(let i=0;i<4000;i++){const t=types[(r()*types.length)|0];if(t==1||t==2)continue;L.push({id:100000+i,name:'Obj '+i,type:t,n:(200+r()*450)*3280.84,e:(250+r()*400)*3280.84,ocd:1})}
          L.push({id:99,name:'Far Plant',type:20,n:690*3280.84,e:700*3280.84,ocd:1});window.__targetData={objectives:async()=>L,features:async x=>[]};window.__N=L.length}""", types)
        pg.evaluate("()=>{const m=document.querySelector('#mpbar input.mst[data-sec=Objects]');m.checked=true;m.dispatchEvent(new Event('change',{bubbles:true}))}")
        pg.wait_for_timeout(2500)
        M = "__app.mapV.leaflet"
        dots = lambda: pg.evaluate("()=>{const r=[];%s.eachLayer(l=>{if(l.options&&l.options.icon&&/nobj( |$)/.test(l.options.icon.options.className||'')&&!/ sub/.test(l.options.icon.options.className)&&l._map)r.push(l)});return r.length}" % M)
        pg.evaluate("()=>%s.setView([36.3,127.4],7,{animate:false})" % M); pg.wait_for_timeout(600)
        n_all = dots(); N = pg.evaluate("()=>window.__targetData.objectives().then(L=>{const on=new Set([...document.querySelectorAll('#mpfilw input[data-k^=o]')].filter(e=>e.checked&&/^o\\d+$/.test(e.dataset.k)).map(e=>+e.dataset.k.slice(1)));return L.filter(o=>on.has(o.type)).length})")
        check('zoomed out over the whole theater: every objective of a type switched on has its dot (%d of %d)' % (n_all, N), n_all == N and N > 3000)
        c = pg.evaluate("()=>{let c=null;%s.eachLayer(l=>{if(!c&&l._map&&l._tooltip&&/^Obj /.test(l._tooltip._content))c=l.getLatLng()});return [c.lat,c.lng]}" % M)
        pg.evaluate("c=>%s.setView(c,11,{animate:false})" % M, c); pg.wait_for_timeout(600)
        st = pg.evaluate("""()=>{const m=%s,b=m.getBounds(),big=b.pad(0.5);let inV=0,out=0,bad=0;m.eachLayer(l=>{if(!(l.options&&l.options.icon&&/nobj( |$)/.test(l.options.icon.options.className||''))||/ sub/.test(l.options.icon.options.className)||!l._map)return;const ll=l.getLatLng();if(b.contains(ll))inV++;else if(big.contains(ll))out++;else bad++});
          const all=window.__N;return {inV,out,bad,dom:document.querySelectorAll('#mpmap .nobj').length}}""" % M)
        check('zoomed in: only the dots in the view and in the margin are in the page (%s)' % st, st['bad'] == 0 and st['inV'] > 0 and st['dom'] < N / 3)
        far = lambda: pg.evaluate("()=>{let t=null;%s.eachLayer(l=>{if(l._map&&l._tooltip&&/^Far Plant/.test(l._tooltip._content))t={tip:l._tooltip._content,cls:l._icon.className,i:l._icon.querySelector('i').className}});return t}" % M)
        check('a dot far from the view is not in the page', far() is None)
        pg.evaluate("()=>%s.setView([36.3,127.4],7,{animate:false})" % M); pg.wait_for_timeout(500)
        fl = pg.evaluate("()=>{let c=null;%s.eachLayer(l=>{if(l._tooltip&&/^Far Plant/.test(l._tooltip._content))c=l.getLatLng()});return [c.lat,c.lng]}" % M)
        pg.evaluate("c=>%s.setView(c,11,{animate:false})" % M, c); pg.wait_for_timeout(400)
        check('(the far plant is out of the zoomed-in view)', far() is None)
        pg.evaluate("c=>%s.setView(c,11,{animate:false})" % M, fl); pg.wait_for_timeout(600)
        f1 = far()
        check('...and comes back when the view reaches it, with its tooltip and its look', f1 is not None and f1['tip'].startswith('Far Plant · ') and 'nobj' in f1['cls'])
        pg.evaluate("c=>%s.setView(c,11,{animate:false})" % M, c); pg.wait_for_timeout(400)
        pg.evaluate("c=>%s.setView(c,11,{animate:false})" % M, fl); pg.wait_for_timeout(400)
        check('...the same after going away and back', far() == f1)
        # a switch off and on again while part of the dots wait outside the view
        tog = lambda v: pg.evaluate("v=>{const c=document.querySelector('#mpfilw input[data-k=o20]');if(c.checked!=v){c.checked=v;c.dispatchEvent(new Event('change',{bubbles:true}))}}", v)
        tog(False); pg.wait_for_timeout(400); off = far()
        tog(True); pg.wait_for_timeout(400)
        check('a type switched off hides its dots, switched on shows them again', off is None and far() == f1)
        # size of the dots: written when the zoom level changes, not at every frame
        sz = pg.evaluate("""async()=>{const h=document.querySelector('#mpmap').closest('[style*="--os"]')||document.querySelector('#mpmap').parentElement;const m=%s;const w=ms=>new Promise(r=>setTimeout(r,ms));
          const host=[...document.querySelectorAll('*')].find(e=>e.style&&e.style.getPropertyValue('--os'));const a=host.style.getPropertyValue('--os');let n=0;const sp=host.style.setProperty.bind(host.style);host.style.setProperty=(k,v)=>{if(k=='--os')n++;return sp(k,v)};
          for(let i=0;i<10;i++)m.fire('zoom');m.setZoom(9,{animate:false});await w(300);const b=host.style.getPropertyValue('--os');host.style.setProperty=sp;return {a,b,n}}""" % M)
        check('the dot size follows the zoom and is written only when it changes (%s)' % sz, sz['a'] != sz['b'] and sz['n'] == 1)
        # names at the maximum zoom: the same label elements after a small move
        pg.evaluate("()=>%s.setView([36.3,127.4],13,{animate:false})" % M); pg.wait_for_timeout(500)
        lb = pg.evaluate("()=>{const e=document.querySelector('#mpmap .nobjl');if(!e)return null;e.dataset.keep='1';return e.textContent}")
        pg.evaluate("()=>%s.panBy([30,20],{animate:false})" % M); pg.wait_for_timeout(400)
        check('the names are written at the maximum zoom and kept (not made again) when the view moves', lb is not None and pg.evaluate("t=>[...document.querySelectorAll('#mpmap .nobjl')].some(e=>e.dataset.keep=='1'&&e.textContent==t)", lb))
        pg.evaluate("()=>%s.setView([36.3,127.4],9,{animate:false})" % M); pg.wait_for_timeout(400)
        check('below the zoom of the names there is none', pg.evaluate("()=>document.querySelectorAll('#mpmap .nobjl').length") == 0)
        check('no error in the page', not errs)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
