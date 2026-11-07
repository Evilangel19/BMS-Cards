"""Checks the picture of the BMS folder on the map (the 16K picture in the real program, a 5000 px stand-in here): the first start reads and decodes the file once and keeps a
reduced copy and the blocks of the picture in the database; every later start shows the map and zooms in without reading the file at all; the tiles are drawn from the blocks
(sharp, as the picture), kept for the way back, and a block that is gone or a database that is full is handled. Usage: python3 tools/mapcache-test.py"""
import subprocess, sys, time, os, tempfile, base64
import numpy as np
from playwright.sync_api import sync_playwright
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); FX = R + '/tests/fixtures/beartrap/'
sys.path.insert(0, R + '/tools')
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8772', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c, extra=''):
    global ok; print(('OK   ' if c else 'FAIL ') + n + (('  ' + str(extra)) if extra != '' else '')); ok = ok and bool(c)
# the stand-in picture: thin vertical lines every 3 pixels (only a sharp tile shows them; the reduced copy turns them into a grey haze) and a red square at Osan
S = 5000
a = np.full((S, S, 3), 230, np.uint8); a[:, ::3] = (20, 20, 20)
px, py = int(469.6 / 1024 * S), int((1024 - 354.6) / 1024 * S); a[py - 30:py + 30, px - 30:px + 30] = (255, 0, 0)
PNG = tempfile.mkdtemp() + '/pic.png'; Image.fromarray(a).save(PNG); SIZE = os.path.getsize(PNG)
INIT = """
window.__dec = 0; window.__jpg = 0; window.__cib0 = window.createImageBitmap;
window.createImageBitmap = function (a, ...r) { if (a && a.type == 'image/png') window.__dec++; if (a && a.type == 'image/jpeg') window.__jpg++; return window.__cib0.call(this, a, ...r) };
window.__reads = 0;
window.__hook = size => { window.__localMapInfo = async () => ({ name: '8_KTO_16k_Skyvector.png', size, read: async () => { window.__reads++; const b = await (await fetch('/pic.png')).blob(); return new File([b], '8_KTO_16k_Skyvector.png', { type: 'image/png' }) } }) };
window.__db = () => new Promise(res => { const r = indexedDB.open('bmscards', 1); r.onsuccess = () => { const d = r.result, s = () => d.transaction('blobs').objectStore('blobs');
  const k = s().getAllKeys(); k.onsuccess = () => { const keys = k.result, out = { keys, mans: {} }; let left = keys.filter(x => String(x).endsWith('|man') || x == 'skyreg').length; if (!left) { d.close(); return res(out) }
    keys.filter(x => String(x).endsWith('|man') || x == 'skyreg').forEach(x => { const g = s().get(x); g.onsuccess = () => { if (x == 'skyreg') out.reg = g.result; else out.mans[x] = g.result; if (!--left) { d.close(); res(out) } } }) } } });
window.__del = key => new Promise(res => { const r = indexedDB.open('bmscards', 1); r.onsuccess = () => { const d = r.result, t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').delete(key); t.oncomplete = () => { d.close(); res(true) } } });
window.__tile = async () => {
  const map = __app.mapV.leaflet; let lay = null; map.eachLayer(l => { if (l._tiles && l.options && l.options.maxNativeZoom === 13 && l.options.tileSize === 256) lay = l });
  if (!lay) return null; const mr = document.querySelector('#mpmap').getBoundingClientRect(), cx = mr.x + mr.width / 2, cy = mr.y + mr.height / 2; let best = null, bd = 1e9;
  for (const t of Object.values(lay._tiles)) { if (!t.el) continue; const r = t.el.getBoundingClientRect(), d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy); if (d < bd) { bd = d; best = t } }
  if (!best) return null; const { x, y, z } = best.coords, W = await import('/app/js/core/mapwarp.js');
  window.__full = window.__full || await window.__cib0(await (await fetch('/pic.png')).blob());
  const A = document.createElement('canvas'); A.width = A.height = 256; W.pictureTile(A, window.__full, 5000, 5000, W.BMS_EXTENT, z, x, y, W.meshFor(z));
  const p = best.el.getContext('2d').getImageData(0, 0, 256, 256).data, q = A.getContext('2d').getImageData(0, 0, 256, 256).data; let s = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 200 && q[i + 3] > 200) { s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); n++ }
  return { z, x, y, mean: n ? s / n / 3 : null, tagged: !!best.el.__tag, tiles: Object.keys(lay._tiles).length };
};
window.__tag = () => { document.querySelectorAll('#mpmap canvas.leaflet-tile').forEach(c => c.__tag = 1) };
0
"""
CAM = base64.b64encode(open(FX + 'PSI_BEAR_TRAP_26.cam', 'rb').read()).decode()
OSAN = "()=>{__app.mapV.leaflet.setView(__app.mapV.toLL(469.6, 354.6), 11, {animate:false})}"
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1500, 'height': 900}); errs = []
        ctx.route('**/pic.png', lambda r: r.fulfill(path=PNG, content_type='image/png'))
        def start(size=SIZE, init=''):
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(INIT + init)
            import dialogs; dialogs.install(pg)
            pg.goto('http://localhost:8772/app/index.html'); pg.wait_for_timeout(800)
            pg.evaluate("async(b)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app.loadCam(f(b,'x.cam'))}", CAM); pg.wait_for_timeout(500)
            pg.evaluate("s=>__hook(s)", size)
            pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(700)
            pg.click('#mpbaseb'); pg.wait_for_timeout(250); pg.check('#mpbase input[value=sky]')
            pg.wait_for_function("document.querySelectorAll('#mpmap canvas.leaflet-tile').length>0", timeout=20000)
            return pg
        def sharp(pg, secs=8):
            """the tile nearest to the centre of the map is the picture itself (not the reduced copy): waits for it; returns the last result"""
            t = time.time(); r = None
            while time.time() - t < secs:
                r = pg.evaluate('__tile()')
                if r and r['mean'] is not None and r['mean'] < 3: return r
                time.sleep(0.15)
            return r
        def saved(pg, size=SIZE, secs=20):
            """waits until the blocks of the picture of that file size are all saved (its manifest says so); returns what the database holds"""
            t = time.time(); d = None
            while time.time() - t < secs:
                d = pg.evaluate('__db()')
                if any(k.endswith(str(size) + '|man') and m.get('done') for k, m in d['mans'].items()): return d
                time.sleep(0.4)
            return d
        # ---- first start: the file is read and decoded once; the reduced copy and the blocks are saved
        A = start()
        check('first start: tiles shown, the file read once and decoded once', A.locator('#mpmap canvas.leaflet-tile').count() > 0 and A.evaluate('__reads') == 1 and A.evaluate('__dec') == 1, (A.evaluate('__reads'), A.evaluate('__dec')))
        d = saved(A); man = [m for m in d['mans'].values() if m.get('done')]
        check('the blocks are saved: 3 x 3 blocks of the picture, one manifest, and the reduced copy', len(man) == 1 and sum(1 for k in d['keys'] if str(k).count('|') == 3) == 9 and any(str(k).endswith('|sm') for k in d['keys']), (len(man), len(d['keys'])))
        check('...in the highest JPEG quality, blocks of 2048', man and man[0]['q'] == 1 and man[0]['bs'] == 2048 and man[0]['levels'][0]['nx'] == 3, man and {k: man[0][k] for k in ('q', 'bs')})
        A.evaluate(OSAN); r = sharp(A)
        check('zoom 11: the tile is the sharp picture (the same as drawn from the picture itself)', r and r['mean'] is not None and r['mean'] < 3, r)
        A.close()
        # ---- second start: nothing is read and nothing is decoded but JPEG
        B = start()
        check('second start: tiles shown without reading the file or decoding the big picture', B.locator('#mpmap canvas.leaflet-tile').count() > 0 and B.evaluate('__reads') == 0 and B.evaluate('__dec') == 0, (B.evaluate('__reads'), B.evaluate('__dec')))
        B.evaluate(OSAN); r = sharp(B)
        check('zoom 11 from the blocks: sharp, and still no read of the file', r and r['mean'] is not None and r['mean'] < 3 and B.evaluate('__reads') == 0 and B.evaluate('__dec') == 0 and B.evaluate('__jpg') >= 2, (r, B.evaluate('__jpg')))
        j1 = B.evaluate('__jpg'); B.evaluate('__tag()')
        B.evaluate("()=>{__app.mapV.leaflet.panBy([3200, 0], {animate:false})}"); B.wait_for_timeout(1500)
        B.evaluate("()=>{__app.mapV.leaflet.panBy([-3200, 0], {animate:false})}"); r = sharp(B)
        check('the way back: the tiles come from the memory (the same canvases) and the blocks are not decoded again', r and r['tagged'] and r['mean'] < 3 and B.evaluate('__jpg') <= j1 + 1, (r, B.evaluate('__jpg') - j1))
        # off the map and back: the memory of the detail is given back and the tiles are drawn again from the database
        def base(pg, v):
            if not pg.is_visible('#mpbase'): pg.click('#mpbaseb'); pg.wait_for_timeout(250)
            pg.check('#mpbase input[value=%s]' % v)
        base(B, 'sat'); B.wait_for_timeout(500)
        base(B, 'sky'); r = sharp(B)
        check('another base and back: sharp again, the file still not read', r and r['mean'] is not None and r['mean'] < 3 and B.evaluate('__reads') == 0, r)
        B.evaluate("()=>__app.mapV.theaterChanged()"); B.wait_for_timeout(1500); r = sharp(B)
        check('a change of theater: the picture is prepared again from the database', B.locator('#mpmap canvas.leaflet-tile').count() > 0 and B.evaluate('__reads') == 0 and r is not None, r)
        # ---- a block that is gone from the database: the blocks are cut again (the file is read once)
        sig = [k for k in B.evaluate('__db()')['keys'] if str(k).endswith('|man')][0]; blk = str(sig).replace('|man', '|0|1,1')
        B.evaluate("k=>__del(k)", blk); B.close()
        C = start(); C.evaluate(OSAN)
        t = time.time()
        while time.time() - t < 15 and C.evaluate('__reads') < 1: time.sleep(0.2)
        r = sharp(C, 15)
        check('a block missing: the picture is read and the blocks cut again, once, and the tile ends sharp', C.evaluate('__reads') == 1 and r and r['mean'] is not None and r['mean'] < 3, (C.evaluate('__reads'), r))
        d = saved(C)
        check('...and saved again', any(m.get('done') for m in d['mans'].values()) and any(str(k).endswith('|0|1,1') for k in d['keys']))
        C.close()
        D = start(); D.evaluate(OSAN); r = sharp(D)
        check('then it is quiet again: sharp, no read', D.evaluate('__reads') == 0 and D.evaluate('__dec') == 0 and r and r['mean'] < 3, r)
        t0 = [m for k, m in D.evaluate('__db()')['mans'].items() if k.endswith(str(SIZE) + '|man')][0]['t']
        D.evaluate("k=>__del(k)", str(sig).replace('|man', '|sm')); D.close()
        # ---- the reduced copy is gone but the blocks are all there: the file is read for the reduced copy only, the blocks are not cut again
        D2 = start(); D2.evaluate(OSAN); r = sharp(D2)
        t1 = [m for k, m in D2.evaluate('__db()')['mans'].items() if k.endswith(str(SIZE) + '|man')][0]['t']
        check('the reduced copy gone, the blocks kept: the file is read once for the copy, the blocks stay as they were', D2.evaluate('__reads') == 1 and D2.evaluate('__dec') == 1 and t1 == t0 and r and r['mean'] < 3, (D2.evaluate('__reads'), t0, t1))
        D2.close()
        # ---- another file (the size differs): another picture, prepared from the start; the older one stays (two pictures are kept)
        E = start(SIZE + 1)
        check('a changed file is read and prepared again', E.evaluate('__reads') == 1 and E.evaluate('__dec') == 1)
        d = saved(E, SIZE + 1)
        check('both pictures are kept', d.get('reg') and len(d['reg']) == 2 and sum(1 for m in d['mans'].values() if m.get('done')) == 2, d.get('reg'))
        E.close()
        # ---- a database that has no room for the blocks: the picture is as sharp as ever for this session, and prepared again next time
        FAIL = """
        const pu = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { if (/^sky\\|.*\\|\\d\\|\\d+,\\d+$/.test(String(k))) throw new DOMException('no room', 'QuotaExceededError'); return pu.call(this, v, k) };
        """
        F = start(SIZE + 2, FAIL); F.evaluate(OSAN); r = sharp(F, 12)
        check('no room for the blocks: the tiles are still sharp (the blocks stay in memory)', r and r['mean'] is not None and r['mean'] < 3, r)
        F.wait_for_timeout(500); d = F.evaluate('__db()')
        check('...and the picture is not marked as finished', not any(k.endswith(str(SIZE + 2) + '|man') and m.get('done') for k, m in d['mans'].items()), [k for k in d['mans']])
        F.close()
        G = start(SIZE + 2); G.evaluate(OSAN); t = time.time()
        while time.time() - t < 15 and G.evaluate('__reads') < 1: time.sleep(0.2)
        check('so the next time it is prepared again', G.evaluate('__reads') == 1)
        G.close()
        check('no page errors', not errs, errs[:3])
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
