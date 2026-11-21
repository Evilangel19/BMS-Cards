"""The highest ground of every km for the MSA (app/terrmax.js): made once from the whole HeightMap.raw in the background, kept in the program folder
(cache\\terrmax_<theater>.bin), read from there at the next start (the height map not read again), made again when the height map changes; a narrow peak that
the few samples of a cell miss is the highest of its cell. A desktop in memory (tools/fakedesk.py), a made-up 8 km theater (no BMS files).
Usage: python3 tools/terrmax-test.py"""
import json, os, struct, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
from fakedesk import FakeDesk
import dialogs

PORT = 8945
APP = 'C:\\app'
HM = 'C:\\BMS\\Data\\TerrData\\Korea\\NewTerrain\\HeightMaps\\HeightMap.raw'
SIDE = 257 # 8 km: 32 samples a km
def raw(peak):
    v = [100] * (SIDE * SIDE)
    # a narrow peak (one sample) at 3.4 km east, 5.6 km north: off the rows the coarse reading takes
    c = round(3.4 / 8 * (SIDE - 1)); r = SIDE - 1 - round(5.6 / 8 * (SIDE - 1))
    v[r * SIDE + c] = peak
    return struct.pack('<%dh' % len(v), *v)
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
CELL = "async()=>{const m=await import('/app/js/core/msa.js');const c=new Map();await m.loadCells(null,[[3,6],[2,2]],c);return [m.cellMaxOn(),c.get('3,6'),c.get('2,2')]}"
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        desk = FakeDesk(APP)
        desk.put(APP + '\\config.json', json.dumps({'paths': {'bmsInstall': 'C:\\BMS'}}))
        desk.put('C:\\BMS\\Data\\TerrData\\Korea\\NewTerrain\\Theater.txt', 'Theater name=KTO\r\nTheater size in KM=8\r\nMap size in pixels=257\r\nCenter latitude=38.5\r\nCenter longitude=127.5\r\n')
        desk.put(HM, raw(5000))
        def start():
            pg = br.new_page(); errs = []
            dialogs.install(pg)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            desk.install(pg)
            pg.goto('http://localhost:%d/app/index.html' % PORT)
            for _ in range(60):
                if pg.evaluate("()=>import('/app/js/core/msa.js').then(m=>m.cellMaxOn())"): break
                pg.wait_for_timeout(500)
            return pg, errs
        pg, errs = start()
        c = pg.evaluate(CELL)
        for _ in range(20):
            files = [x for x in desk.paths(APP + '\\cache') if 'terrmax' in x.lower()]
            if files: break
            pg.wait_for_timeout(250)
        check('made at the first start, kept in the program folder %s' % files, len(files) == 1)
        check('the narrow peak is the highest of its cell, flat ground elsewhere %s' % c, c == [True, 5000, 100])
        check('no page errors %s' % errs[:2], not errs)
        pg.close()
        # the next start: read from its file, the height map not read through again
        n0 = len([w for w in desk.writes if 'terrmax' in str(w).lower()])
        pg, errs = start()
        check('the next start: read from its file (not made again)', pg.evaluate(CELL) == [True, 5000, 100] and len([w for w in desk.writes if 'terrmax' in str(w).lower()]) == n0)
        pg.close()
        # a new height map (BMS updated): made again
        desk.put(HM, raw(7000))
        pg, errs = start()
        c = pg.evaluate(CELL)
        check('a new height map (BMS updated): made again %s' % c, c == [True, 7000, 100])
        pg.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
