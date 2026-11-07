"""Checks the pieces of the 16K map picture (core/skypic.js) in the browser: the reduction in slices gives the picture of one go, the JPEG blocks keep thin coloured
lines, the blocks of two levels decode to the right size, and a tile that lies over two blocks has no seam. Usage: python3 tools/skypic-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8833', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c, extra=''):
    global ok; print(('OK   ' if c else 'FAIL ') + n + (('  ' + str(extra)) if extra != '' else '')); ok = ok and bool(c)
# a synthetic picture: smooth colour, fine noise, thin coloured lines, small black text-like marks (what a chart has)
MK = """
window.mkPic = (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#c8d8e8'); g.addColorStop(1, '#e8d8a8'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < w * h / 600; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.2) + ')'; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2) }
  x.lineWidth = 1.2; for (let i = 0; i < 60; i++) { x.strokeStyle = ['#ff00ff', '#0000ff', '#ff0000', '#007700'][i % 4]; x.beginPath(); x.moveTo(r() * w, r() * h); x.lineTo(r() * w, r() * h); x.stroke() }
  x.fillStyle = '#000'; for (let i = 0; i < w * h / 4000; i++) x.fillRect(r() * w, r() * h, 2 + r() * 6, 1)
  return c;
};
window.px = (c) => { const x = c.getContext('2d'); return x.getImageData(0, 0, c.width, c.height).data };
window.diff = (a, b) => { let sum = 0, mx = 0, big = 0, n = a.length / 4; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); sum += d; if (d > mx) mx = d; if (d > 8) big++ } return { mean: sum / n, max: mx, big: big / n } };
0
"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_context(viewport={'width': 1200, 'height': 800}).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8833/app/index.html'); pg.wait_for_timeout(600); pg.evaluate(MK)
        # ---- the reduction in slices is the reduction in one go
        r = pg.evaluate("""async () => {
          const S = await import('/app/js/core/skypic.js'); const src = mkPic(4096, 2600), w = 1024, h = 650;
          const one = document.createElement('canvas'); one.width = w; one.height = h; const x = one.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
          const mk = (a, b) => { const c = document.createElement('canvas'); c.width = a; c.height = b; return c };
          const ps = []; const sl = await S.reduceInSlices(src, 4096, 2600, w, h, mk, p => ps.push(p), 32);
          const d = diff(px(one), px(sl)); return { d, steps: ps.length, last: ps[ps.length - 1], size: [sl.width, sl.height] };
        }""")
        check('reduction in slices: same size, progress up to 1', r['size'] == [1024, 650] and r['steps'] >= 20 and r['last'] == 1, r['steps'])
        check('reduction in slices: the same pixels as in one go', r['d']['max'] <= 2 and r['d']['mean'] < 0.05, r['d'])
        # ---- JPEG of the blocks: chroma and thin lines
        r = pg.evaluate("""async () => {
          const src = mkPic(1024, 1024); const out = {};
          for (const q of [0.95, 1]) {
            const b = await new Promise(res => src.toBlob(res, 'image/jpeg', q)); const u = new Uint8Array(await b.arrayBuffer());
            let samp = null; for (let i = 2; i < u.length - 12; ) { if (u[i] != 0xff) { i++; continue } const m = u[i + 1];
              if (m == 0xc0 || m == 0xc1 || m == 0xc2) { samp = []; const n = u[i + 9]; for (let k = 0; k < n; k++) samp.push(u[i + 11 + k * 3].toString(16)); break }
              if (m == 0xd8 || m == 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue } i += 2 + (u[i + 2] << 8 | u[i + 3]) }
            const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; c.getContext('2d').drawImage(bm, 0, 0);
            out[q] = { size: b.size, samp, d: diff(px(src), px(c)) };
          }
          return out;
        }""")
        for q, v in r.items(): print('     q' + q, v)
        check('JPEG at the highest quality keeps the full colour resolution (4:4:4)', r['1']['samp'] and r['1']['samp'][0] == '11', r['1']['samp'])
        check('JPEG at the highest quality: a tiny error on a chart-like picture', r['1']['d']['mean'] < 1.5 and r['1']['d']['max'] <= 8 and r['1']['d']['big'] == 0, r['1']['d'])
        check('(why: below the highest quality the browser halves the colour, and thin coloured lines are washed out)', r['0.95']['samp'][0] == '22' and r['0.95']['d']['mean'] > 3 * r['1']['d']['mean'], r['0.95']['d']['mean'])
        # ---- blocks of two levels, saved in a database and read back; a tile over two blocks has no seam
        r = pg.evaluate("""async () => {
          const S = await import('/app/js/core/skypic.js'), W = await import('/app/js/core/mapwarp.js');
          const mk = (a, b) => { const c = document.createElement('canvas'); c.width = a; c.height = b; return c };
          const sw = 12800, sh = 900, pic = mkPic(sw, sh), bmp = await createImageBitmap(pic);
          const levels = S.levelsOf(sw, sh); const db = new Map();
          const res = await S.buildBlocks({ bmp, sw, sh, levels, make: mk, put: async (lv, i, j, b) => { db.set(lv + ':' + i + ',' + j, b) } });
          const out = { levels: levels.map(l => [l.id, l.w, l.h, l.nx, l.ny]), saved: db.size, kept: res.blocks.size, dims: [] };
          const st = new S.BlockStore({ levels, make: mk, get: async (lv, i, j) => db.get(lv + ':' + i + ',' + j), decode: b => createImageBitmap(b) });
          for (const l of levels) { const ids = []; for (let j = 0; j < l.ny; j++) for (let i = 0; i < l.nx; i++) ids.push([i, j]); out['all' + l.id] = await st.load(l.id, ids);
            out.dims.push([l.id, st.m.get(l.id + ':0,0').bmp.width, st.m.get(l.id + ':' + (l.nx - 1) + ',0').bmp.width]) }
          // L0 vs the picture, block by block (a block over the seam of 2048)
          const L0 = levels[0], src = st.source(L0);
          const a = mk(300, 200), b = mk(300, 200);
          const ca = a.getContext('2d'); ca.translate(-(2048 - 150), -300); src.draw(ca, 2048 - 150, 300, 2048 + 150, 500);           // 300 x 200 over the edge of block 0 and 1, 1:1
          b.getContext('2d').drawImage(pic, 2048 - 150, 300, 300, 200, 0, 0, 300, 200);
          out.edge = diff(px(a), px(b));
          // the same through the tiles of the map (a mesh, a turn and a scale) that hold the edge of two blocks: opaque everywhere, and the picture
          const G = await import('/app/js/rules/geo.js'), ext = W.BMS_EXTENT; out.tiles = [];
          for (const z of [11, 12]) {
            const kx = 2048 / sw * 1024, ky = 1024 - 450 / sh * 1024, [la, lo] = G.tmInv((kx - 512) * 1000, (ky - 512) * 1000), n = 2 ** z;
            const tx = Math.floor((lo + 180) / 360 * n), ty = Math.floor((1 - Math.asinh(Math.tan(la * Math.PI / 180)) / Math.PI) / 2 * n), N = W.meshFor(z);
            const r = W.tileSourceRect(sw, sh, ext, z, tx, ty, N), A = mk(256, 256), B = mk(256, 256), C = mk(256, 256);
            W.pictureTile(A, st.source(L0), L0.w, L0.h, ext, z, tx, ty, N);
            W.pictureTile(B, pic, sw, sh, ext, z, tx, ty, N);
            const m = st.make; st.make = null; st.scr = null; W.pictureTile(C, st.source(L0), L0.w, L0.h, ext, z, tx, ty, N); st.make = m;   // without putting the blocks together
            const alpha = c => { const d = px(c); let lo = 255, bad = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] < lo) lo = d[i]; if (d[i] < 250) bad++ } return { lo, bad } };
            const colDiff = (a, b) => { const x = px(a), y = px(b), out = []; for (let cx = 0; cx < 256; cx++) { let s = 0; for (let cy = 0; cy < 256; cy++) { const i = (cy * 256 + cx) * 4; s += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) } out.push(s / 768) } return out };
            const cd = colDiff(A, B), mean = cd.reduce((s, v) => s + v, 0) / 256;
            out.tiles.push({ z, N, over: r.x0 < 2048 && r.x1 > 2048, tile: [tx, ty], alphaBlocks: alpha(A), alphaPic: alpha(B), alphaNoJoin: alpha(C), diff: diff(px(A), px(B)), worstCol: Math.max(...cd), meanCol: mean });
          }
          out.ok = true; return out;
        }""")
        check('levels of a 12,800 px picture: the picture and its half', r['levels'] == [[0, 12800, 900, 7, 1], [1, 6400, 450, 4, 1]], r['levels'])
        check('every block saved, none kept in memory', r['saved'] == 7 + 4 and r['kept'] == 0, r['saved'])
        check('every block decodes (the last one of a row is the narrow one)', r['all0'] and r['all1'] and r['dims'] == [[0, 2048, 512], [1, 2048, 256]], r['dims'])
        check('a part over the edge of two blocks equals the picture (no seam)', r['edge']['max'] <= 40 and r['edge']['mean'] < 1.2, r['edge'])
        for t in r['tiles']:
            print('     tile', t)
            check('zoom %d: the tile lies over the edge of two blocks' % t['z'], t['over'])
            check('zoom %d: the tile from the blocks is as opaque as the one from the picture, no seam' % t['z'], t['alphaBlocks']['bad'] <= t['alphaPic']['bad'] and t['alphaBlocks']['lo'] >= t['alphaPic']['lo'], (t['alphaBlocks'], t['alphaPic']))
            check('zoom %d: the same picture (JPEG error only), no column off' % t['z'], t['diff']['mean'] < 2 and t['worstCol'] < 4 * max(t['meanCol'], 0.5), (t['diff'], round(t['worstCol'], 2), round(t['meanCol'], 2)))
        check('no page errors', not errs, errs[:2])
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
